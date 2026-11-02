-- =====================================================================
--  04_security.sql — database-level role-based access control
--    * three NOLOGIN group roles mirror the application roles
--    * the web app logs in as clinic_app (NOINHERIT) and, inside every
--      transaction, does  SET LOCAL ROLE clinic_patient|clinic_doctor|clinic_admin
--      and  set_config('app.user_id', ...)  so GRANTs + RLS decide what it may see
--    * clinic_app's password is set by scripts/setup-db.mjs from an env var
-- =====================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clinic_patient') THEN CREATE ROLE clinic_patient NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clinic_doctor')  THEN CREATE ROLE clinic_doctor  NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clinic_admin')   THEN CREATE ROLE clinic_admin   NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clinic_app')     THEN CREATE ROLE clinic_app LOGIN NOINHERIT; END IF;
END $$;
GRANT clinic_patient, clinic_doctor, clinic_admin TO clinic_app;

-- start from zero privileges
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM PUBLIC, clinic_app, clinic_patient, clinic_doctor, clinic_admin;
-- revoke default EXECUTE on *our* routines only (extension functions such as
-- pgvector's operators/casts must stay callable)
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT p.oid::regprocedure AS sig, p.prokind
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public'
               AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    LOOP
        EXECUTE format('REVOKE ALL ON %s %s FROM PUBLIC',
                       CASE r.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END, r.sig);
    END LOOP;
END $$;
GRANT USAGE ON SCHEMA public TO clinic_app, clinic_patient, clinic_doctor, clinic_admin;

-- unauthenticated app role: only the two login/registration functions
GRANT EXECUTE ON FUNCTION fn_auth_lookup(TEXT) TO clinic_app;
GRANT EXECUTE ON FUNCTION fn_register_patient(TEXT, TEXT, TEXT, TEXT, DATE, gender_t, TEXT) TO clinic_app;
GRANT EXECUTE ON FUNCTION app_uid() TO clinic_patient, clinic_doctor, clinic_admin;

-- ---------------- reference data: everyone reads ----------------
GRANT SELECT ON branches, specializations, doctor_availability TO clinic_patient, clinic_doctor, clinic_admin;
GRANT SELECT (doctor_id, spec_id, branch_id, years_experience, consultation_fee, slot_minutes,
              max_daily_patients, specialization_notes, search_tsv)
      ON doctors TO clinic_patient, clinic_doctor;
GRANT SELECT ON v_doctor_directory TO clinic_patient, clinic_doctor, clinic_admin;
GRANT SELECT (user_id, full_name, role, is_active) ON users TO clinic_patient, clinic_doctor;
GRANT SELECT (email, phone) ON users TO clinic_patient, clinic_doctor;

-- ---------------- patient ----------------
GRANT SELECT, UPDATE (address, emergency_contact, blood_group) ON patients TO clinic_patient;
GRANT SELECT, INSERT ON symptom_reports, triage_recommendations TO clinic_patient;
GRANT SELECT, INSERT, UPDATE (status, reason) ON appointments TO clinic_patient;
GRANT SELECT, INSERT ON payments TO clinic_patient;
GRANT SELECT ON prescriptions, prescription_items TO clinic_patient;
GRANT SELECT ON v_patient_appointment_history TO clinic_patient;
GRANT USAGE ON SEQUENCE symptom_reports_report_id_seq, appointments_appt_id_seq,
                         payments_payment_id_seq TO clinic_patient;
GRANT EXECUTE ON FUNCTION fn_recommend_doctors(VECTOR, INT, INT),
                          fn_available_slots(INT, DATE),
                          fn_doctor_daily_load(INT, DATE),
                          fn_similar_case_specialties(VECTOR, INT) TO clinic_patient;

-- ---------------- doctor ----------------
GRANT SELECT ON patients, symptom_reports, payments TO clinic_doctor;
GRANT SELECT, UPDATE (status) ON appointments TO clinic_doctor;
GRANT SELECT, INSERT ON prescriptions, prescription_items TO clinic_doctor;
GRANT UPDATE (specialization_notes, notes_embedding, embedded_at) ON doctors TO clinic_doctor;
GRANT SELECT (notes_embedding, embedded_at) ON doctors TO clinic_doctor;
GRANT USAGE ON SEQUENCE prescriptions_rx_id_seq TO clinic_doctor;
GRANT SELECT ON v_doctor_daily_schedule, v_patient_appointment_history TO clinic_doctor;
GRANT EXECUTE ON FUNCTION fn_doctor_daily_load(INT, DATE), fn_available_slots(INT, DATE) TO clinic_doctor;
GRANT EXECUTE ON PROCEDURE sp_complete_appointment(INT, TEXT, TEXT, DATE, JSONB) TO clinic_doctor;

-- ---------------- admin / receptionist ----------------
GRANT SELECT, INSERT, UPDATE, DELETE ON branches, specializations, doctors, doctor_availability,
      appointments, payments, patients, symptom_reports, triage_recommendations,
      prescriptions, prescription_items TO clinic_admin;
GRANT INSERT, UPDATE (full_name, phone, is_active, email), DELETE ON users TO clinic_admin;
GRANT SELECT (user_id, email, role, full_name, phone, is_active, created_at) ON users TO clinic_admin;
GRANT SELECT ON audit_log, mv_specialization_demand, v_branch_revenue_summary,
      v_doctor_daily_schedule, v_patient_appointment_history TO clinic_admin;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO clinic_admin;
GRANT EXECUTE ON FUNCTION fn_doctor_daily_load(INT, DATE), fn_available_slots(INT, DATE),
      fn_recommend_doctors(VECTOR, INT, INT), fn_similar_case_specialties(VECTOR, INT),
      fn_refresh_demand(), app_uid() TO clinic_admin;
GRANT EXECUTE ON PROCEDURE sp_complete_appointment(INT, TEXT, TEXT, DATE, JSONB) TO clinic_admin;

-- =====================================================================
-- Row-Level Security
-- =====================================================================
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE symptom_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE triage_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescription_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors               ENABLE ROW LEVEL SECURITY;

-- admin sees and manages everything
CREATE POLICY admin_all_users   ON users                  TO clinic_admin USING (true) WITH CHECK (true);
CREATE POLICY admin_all_pat     ON patients               TO clinic_admin USING (true) WITH CHECK (true);
CREATE POLICY admin_all_appt    ON appointments           TO clinic_admin USING (true) WITH CHECK (true);
CREATE POLICY admin_all_pay     ON payments               TO clinic_admin USING (true) WITH CHECK (true);
CREATE POLICY admin_all_sr      ON symptom_reports        TO clinic_admin USING (true) WITH CHECK (true);
CREATE POLICY admin_all_tr      ON triage_recommendations TO clinic_admin USING (true) WITH CHECK (true);
CREATE POLICY admin_all_rx      ON prescriptions          TO clinic_admin USING (true) WITH CHECK (true);
CREATE POLICY admin_all_rxi     ON prescription_items     TO clinic_admin USING (true) WITH CHECK (true);
CREATE POLICY admin_all_doc     ON doctors                TO clinic_admin USING (true) WITH CHECK (true);

-- doctors table: readable by all; a doctor may only update their own row
CREATE POLICY doc_read_all      ON doctors FOR SELECT TO clinic_patient, clinic_doctor USING (true);
CREATE POLICY doc_update_self   ON doctors FOR UPDATE TO clinic_doctor
       USING (doctor_id = app_uid()) WITH CHECK (doctor_id = app_uid());

-- users: yourself, any doctor (public directory), and — for doctors — their own patients
CREATE POLICY users_visible ON users FOR SELECT TO clinic_patient, clinic_doctor
USING ( user_id = app_uid()
        OR role = 'doctor'
        OR EXISTS (SELECT 1 FROM appointments a
                   WHERE a.patient_id = users.user_id AND a.doctor_id = app_uid()) );

-- patients
CREATE POLICY pat_self ON patients TO clinic_patient
       USING (patient_id = app_uid()) WITH CHECK (patient_id = app_uid());
CREATE POLICY pat_of_doctor ON patients FOR SELECT TO clinic_doctor
       USING (EXISTS (SELECT 1 FROM appointments a
                      WHERE a.patient_id = patients.patient_id AND a.doctor_id = app_uid()));

-- appointments
CREATE POLICY appt_patient ON appointments TO clinic_patient
       USING (patient_id = app_uid()) WITH CHECK (patient_id = app_uid());
CREATE POLICY appt_doctor ON appointments FOR SELECT TO clinic_doctor
       USING (doctor_id = app_uid());
CREATE POLICY appt_doctor_upd ON appointments FOR UPDATE TO clinic_doctor
       USING (doctor_id = app_uid()) WITH CHECK (doctor_id = app_uid());

-- payments
CREATE POLICY pay_patient ON payments TO clinic_patient
       USING (EXISTS (SELECT 1 FROM appointments a WHERE a.appt_id = payments.appt_id AND a.patient_id = app_uid()))
       WITH CHECK (EXISTS (SELECT 1 FROM appointments a WHERE a.appt_id = payments.appt_id AND a.patient_id = app_uid()));
CREATE POLICY pay_doctor ON payments FOR SELECT TO clinic_doctor
       USING (EXISTS (SELECT 1 FROM appointments a WHERE a.appt_id = payments.appt_id AND a.doctor_id = app_uid()));

-- symptom reports + recommendations
CREATE POLICY sr_patient ON symptom_reports TO clinic_patient
       USING (patient_id = app_uid()) WITH CHECK (patient_id = app_uid());
CREATE POLICY sr_doctor ON symptom_reports FOR SELECT TO clinic_doctor
       USING (EXISTS (SELECT 1 FROM appointments a WHERE a.report_id = symptom_reports.report_id AND a.doctor_id = app_uid()));
CREATE POLICY tr_patient ON triage_recommendations TO clinic_patient
       USING (EXISTS (SELECT 1 FROM symptom_reports s WHERE s.report_id = triage_recommendations.report_id AND s.patient_id = app_uid()))
       WITH CHECK (EXISTS (SELECT 1 FROM symptom_reports s WHERE s.report_id = triage_recommendations.report_id AND s.patient_id = app_uid()));

-- prescriptions
CREATE POLICY rx_patient ON prescriptions FOR SELECT TO clinic_patient
       USING (EXISTS (SELECT 1 FROM appointments a WHERE a.appt_id = prescriptions.appt_id AND a.patient_id = app_uid()));
CREATE POLICY rx_doctor ON prescriptions TO clinic_doctor
       USING (EXISTS (SELECT 1 FROM appointments a WHERE a.appt_id = prescriptions.appt_id AND a.doctor_id = app_uid()))
       WITH CHECK (EXISTS (SELECT 1 FROM appointments a WHERE a.appt_id = prescriptions.appt_id AND a.doctor_id = app_uid()));
CREATE POLICY rxi_patient ON prescription_items FOR SELECT TO clinic_patient
       USING (EXISTS (SELECT 1 FROM prescriptions r JOIN appointments a USING (appt_id)
                      WHERE r.rx_id = prescription_items.rx_id AND a.patient_id = app_uid()));
CREATE POLICY rxi_doctor ON prescription_items TO clinic_doctor
       USING (EXISTS (SELECT 1 FROM prescriptions r JOIN appointments a USING (appt_id)
                      WHERE r.rx_id = prescription_items.rx_id AND a.doctor_id = app_uid()))
       WITH CHECK (EXISTS (SELECT 1 FROM prescriptions r JOIN appointments a USING (appt_id)
                      WHERE r.rx_id = prescription_items.rx_id AND a.doctor_id = app_uid()));
