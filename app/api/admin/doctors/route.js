import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { route } from '@/lib/api.mjs';
import { withUser } from '@/lib/db.mjs';
import { embed, toPgVector, doctorDocument } from '@/lib/embed.mjs';
import { email, password, phone, id } from '@/lib/validators.mjs';

export const runtime = 'nodejs';

export const GET = route(['admin'], ({ user }) => withUser(user, async (c) => {
  const doctors = (await c.query(
    `SELECT d.doctor_id, u.full_name, u.email, u.is_active, s.name AS specialization, b.name AS branch,
            d.license_no, d.years_experience, d.consultation_fee, d.max_daily_patients, d.slot_minutes,
            (SELECT count(*) FROM appointments a WHERE a.doctor_id = d.doctor_id)::int AS total_appts
     FROM doctors d JOIN users u ON u.user_id = d.doctor_id
     JOIN specializations s USING (spec_id) JOIN branches b USING (branch_id)
     ORDER BY s.name, u.full_name`)).rows;
  const specializations = (await c.query('SELECT spec_id, name FROM specializations ORDER BY name')).rows;
  const branches = (await c.query('SELECT branch_id, name FROM branches ORDER BY name')).rows;
  return { doctors, specializations, branches };
}));

const schema = z.object({
  full_name: z.string().trim().min(3).max(100), email, password, phone,
  spec_id: id, branch_id: id,
  license_no: z.string().regex(/^KMC-[0-9]{5}$/, 'format KMC-12345'),
  years_experience: z.coerce.number().int().min(0).max(60),
  consultation_fee: z.coerce.number().positive().max(100000),
  slot_minutes: z.coerce.number().int().refine((v) => [10, 15, 20, 30, 45, 60].includes(v)),
  max_daily_patients: z.coerce.number().int().min(1).max(60),
  specialization_notes: z.string().trim().min(40).max(2000),
});

// creating a doctor touches users, doctors and doctor_availability — one transaction
export const POST = route(['admin'], async ({ req, user }) => {
  const b = schema.parse(await req.json());
  const hash = await bcrypt.hash(b.password, 10);
  return withUser(user, async (c) => {
    const { rows: [spec] } = await c.query('SELECT name, description FROM specializations WHERE spec_id = $1', [b.spec_id]);
    if (!spec) throw Object.assign(new Error('Unknown specialization'), { status: 400 });
    const [vec] = await embed(doctorDocument(spec.name, spec.description, b.specialization_notes));
    const { rows: [u] } = await c.query(
      `INSERT INTO users(email, password_hash, role, full_name, phone) VALUES ($1,$2,'doctor',$3,$4) RETURNING user_id`,
      [b.email, hash, b.full_name, b.phone || null]);
    await c.query(
      `INSERT INTO doctors(doctor_id, spec_id, branch_id, license_no, years_experience, consultation_fee,
                           slot_minutes, max_daily_patients, specialization_notes, notes_embedding, embedded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector, now())`,
      [u.user_id, b.spec_id, b.branch_id, b.license_no, b.years_experience, b.consultation_fee,
       b.slot_minutes, b.max_daily_patients, b.specialization_notes, toPgVector(vec)]);
    await c.query(
      `INSERT INTO doctor_availability(doctor_id, weekday, start_time, end_time)
       SELECT $1, wd, t.s, t.e FROM generate_series(1, 6) wd
       CROSS JOIN (VALUES (TIME '09:00', TIME '13:00'), (TIME '14:00', TIME '18:00')) t(s, e)`, [u.user_id]);
    return { doctor_id: u.user_id };
  });
});
