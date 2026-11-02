// Admin analytics — demonstrates JOIN, GROUP BY, HAVING, aggregates, subqueries,
// correlated subqueries, CTEs, LATERAL + stored function, views and a materialized view.
import { route } from '@/lib/api.mjs';
import { withUser } from '@/lib/db.mjs';

export const GET = route(['admin'], ({ user }) => withUser(user, async (c) => {
  const q = async (sql, args) => (await c.query(sql, args)).rows;

  const [kpi] = await q(`
    SELECT (SELECT count(*) FROM patients)::int AS patients,
           (SELECT count(*) FROM doctors)::int  AS doctors,
           (SELECT count(*) FROM appointments WHERE start_time::date = CURRENT_DATE AND status <> 'cancelled')::int AS today,
           (SELECT count(*) FROM appointments WHERE status = 'booked' AND start_time > now())::int AS upcoming,
           (SELECT COALESCE(sum(amount), 0) FROM payments WHERE status = 'paid') AS revenue,
           (SELECT count(*) FROM symptom_reports)::int AS triages,
           (SELECT count(*) FROM symptom_reports WHERE red_flag)::int AS red_flags`);

  // GROUP BY + HAVING: specialisations with at least 1 live/completed appointment
  const bySpecialization = await q(`
    SELECT s.name AS specialization, count(a.appt_id)::int AS appointments,
           count(DISTINCT a.patient_id)::int AS patients, ROUND(avg(d.consultation_fee), 0) AS avg_fee
    FROM specializations s
    JOIN doctors d ON d.spec_id = s.spec_id
    JOIN appointments a ON a.doctor_id = d.doctor_id AND a.status IN ('booked','completed')
    GROUP BY s.name
    HAVING count(a.appt_id) >= 1
    ORDER BY appointments DESC, specialization`);

  // correlated subquery: doctors priced above their specialisation's average
  const aboveAvgFee = await q(`
    SELECT u.full_name AS doctor, s.name AS specialization, d.consultation_fee,
           (SELECT ROUND(avg(d2.consultation_fee), 0) FROM doctors d2 WHERE d2.spec_id = d.spec_id) AS spec_avg
    FROM doctors d JOIN users u ON u.user_id = d.doctor_id JOIN specializations s USING (spec_id)
    WHERE d.consultation_fee > (SELECT avg(d2.consultation_fee) FROM doctors d2 WHERE d2.spec_id = d.spec_id)
    ORDER BY s.name`);

  // nested subquery (NOT IN): patients with no upcoming appointment
  const noUpcoming = await q(`
    SELECT u.full_name, u.email,
           (SELECT max(start_time)::date::text FROM appointments a WHERE a.patient_id = p.patient_id) AS last_visit
    FROM patients p JOIN users u ON u.user_id = p.patient_id
    WHERE p.patient_id NOT IN (SELECT patient_id FROM appointments WHERE status = 'booked' AND start_time > now())
    ORDER BY u.full_name`);

  // LATERAL + stored function: tomorrow's load for every doctor
  const tomorrowLoad = await q(`
    SELECT u.full_name AS doctor, s.name AS specialization, l.booked, l.capacity, l.load_pct
    FROM doctors d JOIN users u ON u.user_id = d.doctor_id JOIN specializations s USING (spec_id)
    CROSS JOIN LATERAL fn_doctor_daily_load(d.doctor_id, CURRENT_DATE + 1) l
    WHERE l.booked > 0 ORDER BY l.load_pct DESC, doctor`);

  // CTE + window function: triage accuracy — was the booked doctor among the AI's top-3?
  const [triageHit] = await q(`
    WITH booked AS (
      SELECT a.report_id, a.doctor_id FROM appointments a WHERE a.report_id IS NOT NULL
    )
    SELECT count(*)::int AS booked_from_triage,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM triage_recommendations t
                   WHERE t.report_id = b.report_id AND t.doctor_id = b.doctor_id))::int AS in_top3,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM triage_recommendations t
                   WHERE t.report_id = b.report_id AND t.doctor_id = b.doctor_id AND t.rank = 1))::int AS top1
    FROM booked b`);

  const revenue = await q(`SELECT branch, month::text, appointments::int, completed::int, cancelled::int, revenue
                           FROM v_branch_revenue_summary ORDER BY month DESC, branch`);
  const demand = await q(`SELECT * FROM mv_specialization_demand WHERE top1_recommendations > 0
                          ORDER BY top1_recommendations DESC`);
  return { kpi, bySpecialization, aboveAvgFee, noUpcoming, tomorrowLoad, triageHit, revenue, demand };
}));
