import { z } from 'zod';
import { route } from '@/lib/api.mjs';
import { withUser } from '@/lib/db.mjs';
import { id, isoDateTime } from '@/lib/validators.mjs';

// GET: patient -> own history (view, RLS-filtered); admin -> all, with search & filters
export const GET = route(['patient', 'admin'], async ({ req, user }) => {
  const sp = new URL(req.url).searchParams;
  return withUser(user, async (c) => {
    if (user.role === 'patient') {
      const { rows } = await c.query(
        `SELECT h.*, h.start_time::text AS start_time,
                COALESCE((SELECT json_agg(json_build_object('medicine', i.medicine, 'dosage', i.dosage,
                          'frequency', i.frequency, 'duration_days', i.duration_days) ORDER BY i.line_no)
                          FROM prescription_items i WHERE i.rx_id = h.rx_id), '[]') AS items
         FROM v_patient_appointment_history h ORDER BY h.start_time DESC`);
      return rows;
    }
    const where = []; const args = [];
    if (sp.get('status')) { args.push(sp.get('status')); where.push(`a.status = $${args.length}::appt_status`); }
    if (sp.get('branch')) { args.push(Number(sp.get('branch'))); where.push(`a.branch_id = $${args.length}`); }
    if (sp.get('date'))   { args.push(sp.get('date')); where.push(`a.start_time::date = $${args.length}::date`); }
    if (sp.get('q')) {
      args.push('%' + sp.get('q') + '%');
      where.push(`(pu.full_name ILIKE $${args.length} OR du.full_name ILIKE $${args.length} OR s.name ILIKE $${args.length})`);
    }
    const { rows } = await c.query(
      `SELECT a.appt_id, a.start_time::text, a.status, a.reason, pu.full_name AS patient, du.full_name AS doctor,
              s.name AS specialization, b.name AS branch, p.amount, p.status AS payment_status
       FROM appointments a
       JOIN users pu ON pu.user_id = a.patient_id
       JOIN users du ON du.user_id = a.doctor_id
       JOIN doctors d ON d.doctor_id = a.doctor_id
       JOIN specializations s ON s.spec_id = d.spec_id
       JOIN branches b ON b.branch_id = a.branch_id
       LEFT JOIN payments p ON p.appt_id = a.appt_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY a.start_time DESC LIMIT 200`, args);
    return rows;
  });
});

// POST: book appointment + payment as ONE transaction (all-or-nothing)
const bookSchema = z.object({
  doctor_id: id,
  start_time: isoDateTime,
  report_id: id.optional().nullable(),
  method: z.enum(['upi', 'card', 'cash', 'insurance']),
  reason: z.string().max(300).optional(),
  simulate_payment_failure: z.boolean().optional(),
});

export const POST = route(['patient'], async ({ req, user }) => {
  const b = bookSchema.parse(await req.json());
  return withUser(user, async (c) => {               // BEGIN ... COMMIT / ROLLBACK
    // serialise concurrent bookings for the same doctor inside this transaction
    await c.query('SELECT pg_advisory_xact_lock($1)', [b.doctor_id]);

    const { rows: [appt] } = await c.query(
      `INSERT INTO appointments(patient_id, doctor_id, branch_id, report_id, start_time, end_time, reason)
       SELECT app_uid(), d.doctor_id, d.branch_id, $3, $2::timestamp,
              $2::timestamp + make_interval(mins => d.slot_minutes), $4
       FROM doctors d WHERE d.doctor_id = $1
       RETURNING appt_id, start_time::text, end_time::text`,          // trigger validates the slot here
      [b.doctor_id, b.start_time, b.report_id ?? null, b.reason ?? null]);
    if (!appt) throw Object.assign(new Error('Doctor not found.'), { status: 404 });

    if (b.simulate_payment_failure)                                    // gateway says no -> ROLLBACK
      throw Object.assign(new Error('Payment declined by gateway — booking rolled back, slot released.'), { status: 402 });

    const { rows: [pay] } = await c.query(
      `INSERT INTO payments(appt_id, amount, method, txn_ref)
       VALUES ($1, NULL, $2, 'TXN' || to_char(clock_timestamp(), 'YYMMDDHH24MISSUS'))
       RETURNING payment_id, amount, txn_ref`,                         // trigger fills the fee
      [appt.appt_id, b.method]);
    return { appointment: appt, payment: pay };
  });
});
