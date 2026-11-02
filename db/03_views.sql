-- =====================================================================
--  03_views.sql — views (security_invoker so row-level security still applies)
-- =====================================================================

-- Doctor's daily schedule: one row per appointment with patient + payment info
CREATE OR REPLACE VIEW v_doctor_daily_schedule WITH (security_invoker = true) AS
SELECT a.appt_id,
       a.doctor_id,
       du.full_name                         AS doctor_name,
       a.start_time::date                   AS day,
       a.start_time, a.end_time,
       a.status,
       a.reason,
       a.patient_id,
       pu.full_name                         AS patient_name,
       date_part('year', age(p.date_of_birth))::INT AS patient_age,
       p.gender                             AS patient_gender,
       sr.description                       AS symptoms,
       sr.severity,
       sr.red_flag,
       pay.status                           AS payment_status,
       b.name                               AS branch
FROM appointments a
JOIN users du            ON du.user_id = a.doctor_id
JOIN patients p          ON p.patient_id = a.patient_id
JOIN users pu            ON pu.user_id = a.patient_id
JOIN branches b          ON b.branch_id = a.branch_id
LEFT JOIN symptom_reports sr ON sr.report_id = a.report_id
LEFT JOIN payments pay   ON pay.appt_id = a.appt_id;

-- Patient's appointment history with doctor, specialization, payment, prescription
CREATE OR REPLACE VIEW v_patient_appointment_history WITH (security_invoker = true) AS
SELECT a.appt_id, a.patient_id, a.start_time, a.end_time, a.status, a.reason,
       du.full_name   AS doctor_name,
       s.name         AS specialization,
       b.name         AS branch,
       pay.amount, pay.method, pay.status AS payment_status, pay.txn_ref,
       rx.rx_id, rx.diagnosis, rx.advice, rx.follow_up_on
FROM appointments a
JOIN doctors d          ON d.doctor_id = a.doctor_id
JOIN users du           ON du.user_id = d.doctor_id
JOIN specializations s  ON s.spec_id = d.spec_id
JOIN branches b         ON b.branch_id = a.branch_id
LEFT JOIN payments pay  ON pay.appt_id = a.appt_id
LEFT JOIN prescriptions rx ON rx.appt_id = a.appt_id;

-- Public doctor directory (no sensitive columns)
CREATE OR REPLACE VIEW v_doctor_directory AS
SELECT d.doctor_id, u.full_name, s.name AS specialization, b.name AS branch,
       d.years_experience, d.consultation_fee, d.slot_minutes, d.specialization_notes,
       u.is_active
FROM doctors d
JOIN users u           ON u.user_id = d.doctor_id
JOIN specializations s ON s.spec_id = d.spec_id
JOIN branches b        ON b.branch_id = d.branch_id;

-- Branch revenue by month (admin analytics: JOIN + GROUP BY + aggregates)
CREATE OR REPLACE VIEW v_branch_revenue_summary WITH (security_invoker = true) AS
SELECT b.branch_id, b.name AS branch,
       date_trunc('month', a.start_time)::date                       AS month,
       COUNT(a.appt_id)                                              AS appointments,
       COUNT(*) FILTER (WHERE a.status = 'completed')                AS completed,
       COUNT(*) FILTER (WHERE a.status = 'cancelled')                AS cancelled,
       COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'), 0)   AS revenue
FROM branches b
JOIN appointments a   ON a.branch_id = b.branch_id
LEFT JOIN payments p  ON p.appt_id = a.appt_id
GROUP BY b.branch_id, b.name, date_trunc('month', a.start_time);

-- Materialized view: which specialisations the AI triage routes patients to
CREATE MATERIALIZED VIEW mv_specialization_demand AS
SELECT s.spec_id, s.name AS specialization,
       COUNT(tr.report_id)                     AS top1_recommendations,
       ROUND(AVG(tr.similarity), 4)            AS avg_similarity,
       COUNT(DISTINCT sr.patient_id)           AS distinct_patients
FROM specializations s
LEFT JOIN doctors d                ON d.spec_id = s.spec_id
LEFT JOIN triage_recommendations tr ON tr.doctor_id = d.doctor_id AND tr.rank = 1
LEFT JOIN symptom_reports sr       ON sr.report_id = tr.report_id
GROUP BY s.spec_id, s.name;
CREATE UNIQUE INDEX ux_mv_spec_demand ON mv_specialization_demand (spec_id);

CREATE OR REPLACE FUNCTION fn_refresh_demand() RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_specialization_demand
$$;
