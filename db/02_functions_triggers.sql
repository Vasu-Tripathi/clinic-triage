-- =====================================================================
--  02_functions_triggers.sql — stored functions, procedures and triggers
-- =====================================================================

-- ---------- Session helpers (set by the API on every transaction) ----------
-- The API runs:  SET LOCAL ROLE clinic_<role>;  SELECT set_config('app.user_id', '<id>', true);
CREATE OR REPLACE FUNCTION app_uid() RETURNS INT
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::INT
$$;

-- =====================================================================
-- TRIGGER 1: validate every appointment insert/update
--   * blocks double-booking of a doctor's slot (friendly message;
--     the EXCLUDE constraint is the race-proof backstop)
--   * blocks a patient being in two places at once
--   * slot must sit inside the doctor's weekly availability
--   * no booking in the past, doctor must be active,
--     doctor's daily capacity (max_daily_patients) is enforced
--   * branch is always derived from the doctor (consistency)
-- =====================================================================
CREATE OR REPLACE FUNCTION trg_fn_validate_appointment() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_doc       doctors%ROWTYPE;
    v_active    BOOLEAN;
    v_clash     INT;
    v_day_count INT;
BEGIN
    -- patients may only cancel; doctors may only complete / mark no-show
    IF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
        IF current_setting('app.role', true) = 'patient' AND NEW.status <> 'cancelled' THEN
            RAISE EXCEPTION 'Patients can only cancel appointments.' USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF current_setting('app.role', true) = 'doctor' AND NEW.status NOT IN ('completed','no_show') THEN
            RAISE EXCEPTION 'Doctors can only complete or mark no-show.' USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF OLD.status = 'completed' AND NEW.status = 'cancelled' THEN
            RAISE EXCEPTION 'A completed appointment cannot be cancelled.' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.status = 'cancelled' AND OLD.start_time < now() THEN
            RAISE EXCEPTION 'Past appointments cannot be cancelled.' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- only re-validate when timing/doctor changes or a cancelled appt is revived
    IF TG_OP = 'UPDATE'
       AND NEW.start_time = OLD.start_time AND NEW.end_time = OLD.end_time
       AND NEW.doctor_id = OLD.doctor_id
       AND NOT (OLD.status IN ('cancelled','no_show') AND NEW.status = 'booked') THEN
        NEW.updated_at := now();
        RETURN NEW;
    END IF;

    IF NEW.status NOT IN ('booked') AND TG_OP = 'INSERT' THEN
        -- historical rows (seed/import) may be inserted as completed; skip "past" check only
        NULL;
    ELSIF NEW.start_time < now() THEN
        RAISE EXCEPTION 'Cannot book a slot in the past (%).', NEW.start_time
              USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_doc FROM doctors WHERE doctor_id = NEW.doctor_id;
    SELECT is_active INTO v_active FROM users WHERE user_id = NEW.doctor_id;
    IF NOT FOUND OR NOT v_active THEN
        RAISE EXCEPTION 'Doctor % is not accepting appointments.', NEW.doctor_id
              USING ERRCODE = 'check_violation';
    END IF;
    NEW.branch_id := v_doc.branch_id;

    -- inside weekly availability?
    IF NOT EXISTS (
        SELECT 1 FROM doctor_availability a
        WHERE a.doctor_id = NEW.doctor_id
          AND a.weekday   = EXTRACT(DOW FROM NEW.start_time)
          AND NEW.start_time::time >= a.start_time
          AND NEW.end_time::time   <= a.end_time
          AND NEW.start_time::date  = NEW.end_time::date) THEN
        RAISE EXCEPTION 'Slot % – % is outside the doctor''s working hours.',
              NEW.start_time, NEW.end_time::time USING ERRCODE = 'check_violation';
    END IF;

    -- doctor double-booking
    SELECT appt_id INTO v_clash FROM appointments
    WHERE doctor_id = NEW.doctor_id
      AND status IN ('booked','completed')
      AND appt_id <> COALESCE(NEW.appt_id, -1)
      AND tsrange(start_time, end_time) && tsrange(NEW.start_time, NEW.end_time)
    LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Double booking blocked: the doctor already has appointment #% in this slot.', v_clash
              USING ERRCODE = 'exclusion_violation';
    END IF;

    -- patient double-booking (any doctor)
    SELECT appt_id INTO v_clash FROM appointments
    WHERE patient_id = NEW.patient_id
      AND status = 'booked'
      AND appt_id <> COALESCE(NEW.appt_id, -1)
      AND tsrange(start_time, end_time) && tsrange(NEW.start_time, NEW.end_time)
    LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'You already have appointment #% at this time.', v_clash
              USING ERRCODE = 'exclusion_violation';
    END IF;

    -- daily capacity
    SELECT count(*) INTO v_day_count FROM appointments
    WHERE doctor_id = NEW.doctor_id
      AND start_time::date = NEW.start_time::date
      AND status IN ('booked','completed')
      AND appt_id <> COALESCE(NEW.appt_id, -1);
    IF v_day_count >= v_doc.max_daily_patients THEN
        RAISE EXCEPTION 'Doctor is fully booked on % (% / % patients).',
              NEW.start_time::date, v_day_count, v_doc.max_daily_patients
              USING ERRCODE = 'check_violation';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END $$;

CREATE TRIGGER trg_validate_appointment
BEFORE INSERT OR UPDATE ON appointments
FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_appointment();

-- =====================================================================
-- TRIGGER 2: payment amount must equal the doctor's consultation fee
-- =====================================================================
CREATE OR REPLACE FUNCTION trg_fn_payment_amount() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fee NUMERIC(8,2);
BEGIN
    SELECT d.consultation_fee INTO v_fee
    FROM appointments a JOIN doctors d USING (doctor_id)
    WHERE a.appt_id = NEW.appt_id;
    IF NEW.amount IS NULL THEN
        NEW.amount := v_fee;
    ELSIF NEW.amount <> v_fee THEN
        RAISE EXCEPTION 'Payment amount % does not match consultation fee %.', NEW.amount, v_fee
              USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_payment_amount
BEFORE INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION trg_fn_payment_amount();

-- =====================================================================
-- TRIGGER 3: cancelling an appointment automatically refunds its payment
-- =====================================================================
CREATE OR REPLACE FUNCTION trg_fn_refund_on_cancel() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
        UPDATE payments SET status = 'refunded'
        WHERE appt_id = NEW.appt_id AND status = 'paid';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_refund_on_cancel
AFTER UPDATE OF status ON appointments
FOR EACH ROW EXECUTE FUNCTION trg_fn_refund_on_cancel();

-- =====================================================================
-- TRIGGER 4: prescriptions only for the treating doctor's non-cancelled appt
-- =====================================================================
CREATE OR REPLACE FUNCTION trg_fn_check_prescription() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status appt_status; v_doc INT;
BEGIN
    SELECT status, doctor_id INTO v_status, v_doc FROM appointments WHERE appt_id = NEW.appt_id;
    IF v_status IN ('cancelled','no_show') THEN
        RAISE EXCEPTION 'Cannot prescribe for a % appointment.', v_status USING ERRCODE = 'check_violation';
    END IF;
    IF app_uid() IS NOT NULL
       AND current_setting('app.role', true) = 'doctor'
       AND app_uid() <> v_doc THEN
        RAISE EXCEPTION 'Only the treating doctor can write this prescription.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_check_prescription
BEFORE INSERT ON prescriptions
FOR EACH ROW EXECUTE FUNCTION trg_fn_check_prescription();

-- =====================================================================
-- TRIGGER 5: generic audit trail (row images as JSONB)
-- =====================================================================
CREATE OR REPLACE FUNCTION trg_fn_audit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pk TEXT;
BEGIN
    -- primary-key column name is passed as the trigger argument
    v_pk := COALESCE(to_jsonb(NEW), to_jsonb(OLD)) ->> TG_ARGV[0];
    INSERT INTO audit_log(table_name, operation, row_pk, actor_id, db_role, old_data, new_data)
    VALUES (TG_TABLE_NAME, TG_OP, v_pk, app_uid(), COALESCE(NULLIF(current_setting('app.role', true), ''), session_user::text),
            CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - 'notes_embedding' - 'search_tsv' END,
            CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - 'notes_embedding' - 'search_tsv' END);
    RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_audit_appointments AFTER INSERT OR UPDATE OR DELETE ON appointments
    FOR EACH ROW EXECUTE FUNCTION trg_fn_audit('appt_id');
CREATE TRIGGER trg_audit_doctors AFTER UPDATE OR DELETE ON doctors
    FOR EACH ROW EXECUTE FUNCTION trg_fn_audit('doctor_id');
CREATE TRIGGER trg_audit_prescriptions AFTER INSERT OR UPDATE OR DELETE ON prescriptions
    FOR EACH ROW EXECUTE FUNCTION trg_fn_audit('rx_id');
CREATE TRIGGER trg_audit_payments AFTER INSERT OR UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION trg_fn_audit('payment_id');

-- =====================================================================
-- FUNCTION: doctor's daily load (stored function returning a row)
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_doctor_daily_load(p_doctor INT, p_day DATE)
RETURNS TABLE (doctor_id INT, day DATE, total_appts INT, booked INT, completed INT,
               cancelled INT, booked_minutes INT, capacity INT, available_minutes INT,
               load_pct NUMERIC, revenue NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH appts AS (
        SELECT a.status, a.start_time, a.end_time, p.amount, p.status AS pay_status
        FROM appointments a
        LEFT JOIN payments p ON p.appt_id = a.appt_id
        WHERE a.doctor_id = p_doctor AND a.start_time::date = p_day
    ), avail AS (
        SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60), 0)::INT AS mins
        FROM doctor_availability
        WHERE doctor_id = p_doctor AND weekday = EXTRACT(DOW FROM p_day)
    )
    SELECT p_doctor, p_day,
           COUNT(*)::INT,
           COUNT(*) FILTER (WHERE status = 'booked')::INT,
           COUNT(*) FILTER (WHERE status = 'completed')::INT,
           COUNT(*) FILTER (WHERE status = 'cancelled')::INT,
           COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60)
                    FILTER (WHERE status IN ('booked','completed')), 0)::INT,
           (SELECT max_daily_patients FROM doctors WHERE doctors.doctor_id = p_doctor)::INT,
           (SELECT mins FROM avail),
           ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('booked','completed'))
                 / NULLIF((SELECT max_daily_patients FROM doctors WHERE doctors.doctor_id = p_doctor), 0), 1),
           COALESCE(SUM(amount) FILTER (WHERE pay_status = 'paid'), 0)
    FROM appts
$$;

-- =====================================================================
-- FUNCTION: free slots for a doctor on a day (RECURSIVE CTE)
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_available_slots(p_doctor INT, p_day DATE)
RETURNS TABLE (slot_start TIMESTAMP, slot_end TIMESTAMP)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH RECURSIVE
    shifts AS (
        SELECT p_day + a.start_time AS s, p_day + a.end_time AS e, d.slot_minutes
        FROM doctor_availability a JOIN doctors d USING (doctor_id)
        WHERE a.doctor_id = p_doctor AND a.weekday = EXTRACT(DOW FROM p_day)
    ),
    slots(slot_start, slot_end, shift_end, step) AS (
        SELECT s, s + make_interval(mins => slot_minutes), e, slot_minutes FROM shifts
        UNION ALL
        SELECT slot_end, slot_end + make_interval(mins => step), shift_end, step
        FROM slots WHERE slot_end + make_interval(mins => step) <= shift_end
    )
    SELECT s.slot_start, s.slot_end
    FROM slots s
    WHERE s.slot_start > now()
      AND NOT EXISTS (SELECT 1 FROM appointments a
                      WHERE a.doctor_id = p_doctor
                        AND a.status IN ('booked','completed')
                        AND tsrange(a.start_time, a.end_time) && tsrange(s.slot_start, s.slot_end))
    ORDER BY s.slot_start
$$;

-- =====================================================================
-- FUNCTION: vector similarity search — top-k doctors for a symptom embedding
--   cosine similarity = 1 - (embedding <=> query)
--   re-rank: similarity, lightly penalised by tomorrow's load so an
--   overloaded specialist doesn't always win ties
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_recommend_doctors(p_query VECTOR(384), p_k INT DEFAULT 3,
                                                p_branch INT DEFAULT NULL)
RETURNS TABLE (doctor_id INT, full_name VARCHAR, specialization VARCHAR, branch VARCHAR,
               consultation_fee NUMERIC, years_experience SMALLINT,
               similarity NUMERIC, load_pct NUMERIC, score NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH candidates AS (            -- ANN step uses the HNSW index (ORDER BY <=> LIMIT)
        SELECT d.doctor_id, 1 - (d.notes_embedding <=> p_query) AS sim
        FROM doctors d
        JOIN users u ON u.user_id = d.doctor_id AND u.is_active
        WHERE d.notes_embedding IS NOT NULL
          AND (p_branch IS NULL OR d.branch_id = p_branch)
        ORDER BY d.notes_embedding <=> p_query
        LIMIT 20
    )
    SELECT c.doctor_id, u.full_name, s.name, b.name, d.consultation_fee, d.years_experience,
           ROUND(c.sim::NUMERIC, 4),
           COALESCE(l.load_pct, 0),
           ROUND((c.sim - 0.02 * COALESCE(l.load_pct, 0) / 100.0)::NUMERIC, 4) AS score
    FROM candidates c
    JOIN doctors d          ON d.doctor_id = c.doctor_id
    JOIN users u            ON u.user_id   = d.doctor_id
    JOIN specializations s  ON s.spec_id   = d.spec_id
    JOIN branches b         ON b.branch_id = d.branch_id
    LEFT JOIN LATERAL fn_doctor_daily_load(d.doctor_id, CURRENT_DATE + 1) l ON TRUE
    ORDER BY score DESC
    LIMIT p_k
$$;

-- =====================================================================
-- PROCEDURE: complete an appointment and write its prescription atomically
--   items JSON: [{"medicine":"..","dosage":"..","frequency":"..","duration_days":5}, ...]
-- =====================================================================
CREATE OR REPLACE PROCEDURE sp_complete_appointment(p_appt INT, p_diagnosis TEXT,
                                                    p_advice TEXT, p_follow_up DATE,
                                                    p_items JSONB)
LANGUAGE plpgsql AS $$
DECLARE v_rx INT; v_status appt_status;
BEGIN
    SELECT status INTO v_status FROM appointments WHERE appt_id = p_appt FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found or not yours.', p_appt USING ERRCODE = 'no_data_found';
    END IF;
    IF v_status <> 'booked' THEN
        RAISE EXCEPTION 'Appointment % is already %.', p_appt, v_status USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO prescriptions(appt_id, diagnosis, advice, follow_up_on)
    VALUES (p_appt, p_diagnosis, p_advice, p_follow_up)
    RETURNING rx_id INTO v_rx;

    INSERT INTO prescription_items(rx_id, line_no, medicine, dosage, frequency, duration_days)
    SELECT v_rx, ord::SMALLINT, it->>'medicine', it->>'dosage', it->>'frequency',
           (it->>'duration_days')::SMALLINT
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) WITH ORDINALITY AS t(it, ord);

    UPDATE appointments SET status = 'completed' WHERE appt_id = p_appt;
END $$;

-- =====================================================================
-- FUNCTIONS used before a user is authenticated (SECURITY DEFINER so the
-- bare application role needs no table privileges at all)
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_auth_lookup(p_email TEXT)
RETURNS TABLE (user_id INT, password_hash TEXT, role user_role, full_name VARCHAR, is_active BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT user_id, password_hash, role, full_name, is_active
    FROM users WHERE lower(email) = lower(p_email)
$$;

CREATE OR REPLACE FUNCTION fn_register_patient(p_email TEXT, p_hash TEXT, p_name TEXT, p_phone TEXT,
                                               p_dob DATE, p_gender gender_t, p_blood TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id INT;
BEGIN
    INSERT INTO users(email, password_hash, role, full_name, phone)
    VALUES (p_email, p_hash, 'patient', p_name, NULLIF(p_phone, ''))
    RETURNING user_id INTO v_id;
    INSERT INTO patients(patient_id, date_of_birth, gender, blood_group)
    VALUES (v_id, p_dob, p_gender, NULLIF(p_blood, ''));
    RETURN v_id;
END $$;

-- =====================================================================
-- FUNCTION: privacy-preserving "similar past cases" — nearest neighbours over
-- ALL patients' symptom embeddings, but only aggregated specialisations
-- (never other patients' text) are returned.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_similar_case_specialties(p_query VECTOR(384), p_k INT DEFAULT 10)
RETURNS TABLE (specialization VARCHAR, cases INT, avg_similarity NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH nn AS (
        SELECT sr.report_id, 1 - (sr.embedding <=> p_query) AS sim
        FROM symptom_reports sr
        ORDER BY sr.embedding <=> p_query
        LIMIT p_k
    )
    SELECT s.name, COUNT(*)::INT, ROUND(AVG(nn.sim)::NUMERIC, 4)
    FROM nn
    JOIN appointments a    ON a.report_id = nn.report_id AND a.status = 'completed'
    JOIN doctors d         ON d.doctor_id = a.doctor_id
    JOIN specializations s ON s.spec_id = d.spec_id
    WHERE nn.sim > 0.35
    GROUP BY s.name
    ORDER BY COUNT(*) DESC, AVG(nn.sim) DESC
$$;
