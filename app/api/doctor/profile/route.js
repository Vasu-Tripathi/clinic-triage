import { z } from 'zod';
import { route } from '@/lib/api.mjs';
import { withUser } from '@/lib/db.mjs';
import { embed, toPgVector, doctorDocument } from '@/lib/embed.mjs';

export const runtime = 'nodejs';

export const GET = route(['doctor'], ({ user }) => withUser(user, async (c) => (await c.query(
  `SELECT d.doctor_id, u.full_name, s.name AS specialization, s.description AS spec_description,
          b.name AS branch, d.years_experience, d.consultation_fee,
          d.slot_minutes, d.specialization_notes, d.embedded_at::text,
          vector_dims(d.notes_embedding) AS dims
   FROM doctors d JOIN users u ON u.user_id = d.doctor_id
   JOIN specializations s USING (spec_id) JOIN branches b USING (branch_id)
   WHERE d.doctor_id = app_uid()`)).rows[0]));

// updating notes re-embeds them, so future triage reflects the new focus
export const PUT = route(['doctor'], async ({ req, user }) => {
  const { specialization_notes } = z.object({
    specialization_notes: z.string().trim().min(40).max(2000),
  }).parse(await req.json());
  return withUser(user, async (c) => {
    const { rows: [spec] } = await c.query(
      `SELECT s.name, s.description FROM doctors d JOIN specializations s USING (spec_id) WHERE d.doctor_id = app_uid()`);
    const [vec] = await embed(doctorDocument(spec.name, spec.description, specialization_notes));
    const { rows } = await c.query(
      `UPDATE doctors SET specialization_notes = $1, notes_embedding = $2::vector, embedded_at = now()
       WHERE doctor_id = app_uid() RETURNING embedded_at::text`, [specialization_notes, toPgVector(vec)]);
    return rows[0];
  });
});
