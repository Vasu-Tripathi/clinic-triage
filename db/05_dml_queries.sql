-- =====================================================================
--  05_dml_queries.sql — representative DML and queries used by the app
--  (run as owner; the INSERT/UPDATE/DELETE block is rolled back)
-- =====================================================================
\pset border 2
\pset null '∅'

-- ---------- DML: INSERT / UPDATE / DELETE (inside a transaction) ----------
BEGIN;
INSERT INTO branches(name, street, pincode, phone, opens_at, closes_at)
VALUES ('HSR Layout Clinic', '27th Main, Sector 2, HSR Layout', '560102', '+918041234504', '08:30', '20:30')
RETURNING branch_id, name;

UPDATE doctors SET consultation_fee = consultation_fee * 1.10
WHERE spec_id = (SELECT spec_id FROM specializations WHERE name = 'Dermatology')
RETURNING doctor_id, consultation_fee;

UPDATE appointments SET status = 'cancelled'
WHERE appt_id = (SELECT min(appt_id) FROM appointments WHERE status = 'booked')
RETURNING appt_id, status;                     -- trigger refunds its payment

SELECT appt_id, status FROM payments
WHERE appt_id = (SELECT min(appt_id) FROM appointments WHERE status = 'cancelled' AND start_time > now());

DELETE FROM branches WHERE name = 'HSR Layout Clinic' RETURNING branch_id;
ROLLBACK;

-- ---------- Q1. JOIN (5 tables): upcoming appointments with doctor, specialization, branch, payment ----------
SELECT a.appt_id, a.start_time, pu.full_name AS patient, du.full_name AS doctor, s.name AS specialization,
       b.name AS branch, p.amount, p.status AS payment
FROM appointments a
JOIN users pu ON pu.user_id = a.patient_id
JOIN users du ON du.user_id = a.doctor_id
JOIN doctors d ON d.doctor_id = a.doctor_id
JOIN specializations s ON s.spec_id = d.spec_id
JOIN branches b ON b.branch_id = a.branch_id
LEFT JOIN payments p ON p.appt_id = a.appt_id
WHERE a.status = 'booked'
ORDER BY a.start_time;

-- ---------- Q2. GROUP BY + HAVING + aggregates: branches with paid revenue above 4,000 ----------
SELECT b.name AS branch, count(a.appt_id) AS appts,
       sum(p.amount) FILTER (WHERE p.status = 'paid') AS revenue,
       round(avg(p.amount), 2) AS avg_ticket
FROM branches b
JOIN appointments a ON a.branch_id = b.branch_id
JOIN payments p ON p.appt_id = a.appt_id
GROUP BY b.name
HAVING sum(p.amount) FILTER (WHERE p.status = 'paid') > 4000
ORDER BY revenue DESC;

-- ---------- Q3. Correlated subquery: doctors priced above their specialization's average ----------
SELECT u.full_name, s.name AS specialization, d.consultation_fee
FROM doctors d JOIN users u ON u.user_id = d.doctor_id JOIN specializations s USING (spec_id)
WHERE d.consultation_fee > (SELECT avg(d2.consultation_fee) FROM doctors d2 WHERE d2.spec_id = d.spec_id)
ORDER BY s.name;

-- ---------- Q4. Nested subquery (NOT EXISTS / IN): idle doctors at branches that do have bookings ----------
SELECT u.full_name, s.name AS specialization, b.name AS branch
FROM doctors d JOIN users u ON u.user_id = d.doctor_id
JOIN specializations s USING (spec_id) JOIN branches b USING (branch_id)
WHERE NOT EXISTS (SELECT 1 FROM appointments a WHERE a.doctor_id = d.doctor_id)
  AND d.branch_id IN (SELECT branch_id FROM appointments WHERE status = 'booked')
ORDER BY b.name, u.full_name;

-- ---------- Q5. CTE + window function: each patient's visits ranked by date ----------
WITH visits AS (
  SELECT u.full_name, a.start_time::date AS day, s.name AS specialization,
         row_number() OVER (PARTITION BY a.patient_id ORDER BY a.start_time) AS visit_no,
         count(*)     OVER (PARTITION BY a.patient_id) AS total_visits
  FROM appointments a JOIN users u ON u.user_id = a.patient_id
  JOIN doctors d ON d.doctor_id = a.doctor_id JOIN specializations s USING (spec_id)
  WHERE a.status <> 'cancelled')
SELECT * FROM visits WHERE total_visits > 1 ORDER BY full_name, visit_no;

-- ---------- Q6. RECURSIVE CTE (inside fn_available_slots): first 6 free slots tomorrow ----------
SELECT * FROM fn_available_slots((SELECT user_id FROM users WHERE email = 'vikram.shetty@demo.clinic'),
                                 CURRENT_DATE + CASE WHEN extract(dow FROM CURRENT_DATE + 1) = 0 THEN 2 ELSE 1 END)
LIMIT 6;

-- ---------- Q7. Stored function: doctor daily load (LATERAL over all doctors with bookings tomorrow) ----------
SELECT u.full_name, l.*
FROM doctors d JOIN users u ON u.user_id = d.doctor_id
CROSS JOIN LATERAL fn_doctor_daily_load(d.doctor_id, CURRENT_DATE + 1) l
WHERE l.total_appts > 0;

-- ---------- Q8. Views ----------
SELECT appt_id, doctor_name, start_time, patient_name, patient_age, status, payment_status
FROM v_doctor_daily_schedule WHERE day = CURRENT_DATE + 1 ORDER BY doctor_name, start_time;
SELECT * FROM v_branch_revenue_summary ORDER BY month DESC, branch;

-- ---------- Q9. Stored procedure: complete an appointment with a prescription ----------
BEGIN;
SELECT appt_id, status FROM appointments WHERE status = 'booked' ORDER BY appt_id LIMIT 1 \gset first_
CALL sp_complete_appointment(:first_appt_id, 'Viral pharyngitis', 'Warm saline gargles', CURRENT_DATE + 7,
     '[{"medicine":"Paracetamol 650 mg","dosage":"1 tab","frequency":"Thrice daily","duration_days":3}]');
SELECT a.appt_id, a.status, r.diagnosis, i.medicine
FROM appointments a JOIN prescriptions r USING (appt_id) JOIN prescription_items i USING (rx_id)
WHERE a.appt_id = :first_appt_id;
ROLLBACK;

-- ---------- Q10. Trigger demo: double booking is rejected ----------
BEGIN;
INSERT INTO appointments(patient_id, doctor_id, branch_id, start_time, end_time)
SELECT (SELECT user_id FROM users WHERE email = 'sara@demo.clinic'), a.doctor_id, a.branch_id, a.start_time, a.end_time
FROM appointments a WHERE a.status = 'booked' ORDER BY a.appt_id LIMIT 1;
ROLLBACK;
