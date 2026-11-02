import { z } from 'zod';
import { route } from '@/lib/api.mjs';
import { withUser } from '@/lib/db.mjs';
import { id } from '@/lib/validators.mjs';

// status change: patient -> cancel own; doctor -> no_show own; admin -> any (DB trigger + RLS enforce)
export const PATCH = route(['patient', 'doctor', 'admin'], async ({ req, user, params }) => {
  const apptId = id.parse(params.id);
  const { status } = z.object({ status: z.enum(['cancelled', 'no_show', 'completed', 'booked']) }).parse(await req.json());
  return withUser(user, async (c) => {
    const { rows } = await c.query(
      'UPDATE appointments SET status = $2::appt_status WHERE appt_id = $1 RETURNING appt_id, status', [apptId, status]);
    if (!rows.length) throw Object.assign(new Error('Appointment not found.'), { status: 404 });
    return rows[0];
  });
});

// hard delete (admin only) — e.g. erroneous entries; payments cascade
export const DELETE = route(['admin'], async ({ user, params }) => {
  const apptId = id.parse(params.id);
  return withUser(user, async (c) => {
    const { rowCount } = await c.query('DELETE FROM appointments WHERE appt_id = $1', [apptId]);
    return { deleted: rowCount };
  });
});
