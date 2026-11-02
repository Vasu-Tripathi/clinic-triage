import { route } from '@/lib/api.mjs';
import { withUser } from '@/lib/db.mjs';
import { id, isoDate } from '@/lib/validators.mjs';

export const GET = route(['patient', 'admin', 'doctor'], async ({ req, user, params }) => {
  const doctorId = id.parse(params.id);
  const date = isoDate.parse(new URL(req.url).searchParams.get('date'));
  return withUser(user, async (c) => {
    const { rows: slots } = await c.query(
      `SELECT slot_start::text, slot_end::text FROM fn_available_slots($1, $2::date)`, [doctorId, date]);
    const { rows: [load] } = await c.query('SELECT * FROM fn_doctor_daily_load($1, $2::date)', [doctorId, date]);
    return { slots, load };
  });
});
