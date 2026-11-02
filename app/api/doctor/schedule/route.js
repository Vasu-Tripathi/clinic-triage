import { route } from '@/lib/api.mjs';
import { withUser } from '@/lib/db.mjs';
import { isoDate } from '@/lib/validators.mjs';

export const GET = route(['doctor'], async ({ req, user }) => {
  const date = isoDate.parse(new URL(req.url).searchParams.get('date'));
  return withUser(user, async (c) => {
    const { rows: schedule } = await c.query(
      `SELECT v.*, v.start_time::text, v.end_time::text,
              COALESCE((SELECT json_agg(json_build_object('medicine', i.medicine, 'dosage', i.dosage,
                        'frequency', i.frequency, 'duration_days', i.duration_days) ORDER BY i.line_no)
                        FROM prescriptions r JOIN prescription_items i USING (rx_id)
                        WHERE r.appt_id = v.appt_id), '[]') AS items,
              (SELECT diagnosis FROM prescriptions r WHERE r.appt_id = v.appt_id) AS diagnosis
       FROM v_doctor_daily_schedule v
       WHERE v.doctor_id = app_uid() AND v.day = $1::date
       ORDER BY v.start_time`, [date]);
    const { rows: [load] } = await c.query('SELECT * FROM fn_doctor_daily_load(app_uid(), $1::date)', [date]);
    const { rows: week } = await c.query(
      `SELECT g::date::text AS day, l.total_appts, l.load_pct
       FROM generate_series($1::date - 3, $1::date + 3, interval '1 day') g
       CROSS JOIN LATERAL fn_doctor_daily_load(app_uid(), g::date) l ORDER BY g`, [date]);
    return { schedule, load, week };
  });
});
