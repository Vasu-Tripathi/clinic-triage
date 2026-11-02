-- =====================================================================
--  AI Symptom-to-Specialist Clinic Triage System
--  01_schema.sql  —  DDL: extensions, tables, keys, constraints, indexes
--  Target: PostgreSQL 16 + pgvector 0.6+  (run as the database owner)
-- =====================================================================

-- ---------- Clean slate (DROP) ----------
DROP MATERIALIZED VIEW IF EXISTS mv_specialization_demand CASCADE;
DROP TABLE IF EXISTS audit_log, prescription_items, prescriptions, payments,
                     appointments, triage_recommendations, symptom_reports,
                     doctor_availability, doctors, specializations,
                     patients, users, branches CASCADE;
DROP TYPE  IF EXISTS user_role, appt_status, pay_method, pay_status, gender_t CASCADE;
DROP EXTENSION IF EXISTS vector CASCADE;
DROP EXTENSION IF EXISTS btree_gist CASCADE;

-- ---------- Extensions ----------
CREATE EXTENSION IF NOT EXISTS vector;       -- pgvector: VECTOR type + HNSW index
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- lets EXCLUDE constraints mix "=" and "&&"

-- ---------- Enumerated domains ----------
CREATE TYPE user_role   AS ENUM ('patient', 'doctor', 'admin');
CREATE TYPE appt_status AS ENUM ('booked', 'completed', 'cancelled', 'no_show');
CREATE TYPE pay_method  AS ENUM ('upi', 'card', 'cash', 'insurance');
CREATE TYPE pay_status  AS ENUM ('paid', 'refunded', 'failed');
CREATE TYPE gender_t    AS ENUM ('male', 'female', 'other');

-- ---------- Clinic branches ----------
CREATE TABLE branches (
    branch_id     SERIAL PRIMARY KEY,
    name          VARCHAR(80)  NOT NULL UNIQUE,
    street        VARCHAR(150) NOT NULL,
    city          VARCHAR(60)  NOT NULL DEFAULT 'Bengaluru',
    pincode       CHAR(6)      NOT NULL CHECK (pincode ~ '^[1-9][0-9]{5}$'),
    phone         VARCHAR(15)  NOT NULL CHECK (phone ~ '^\+?[0-9]{10,13}$'),
    opens_at      TIME         NOT NULL DEFAULT '08:00',
    closes_at     TIME         NOT NULL DEFAULT '20:00',
    CONSTRAINT chk_branch_hours CHECK (closes_at > opens_at)
);

-- ---------- Users (authentication super-entity) ----------
CREATE TABLE users (
    user_id        SERIAL PRIMARY KEY,
    email          VARCHAR(120) NOT NULL,
    password_hash  TEXT         NOT NULL,           -- bcrypt hash, never plain text
    role           user_role    NOT NULL,
    full_name      VARCHAR(100) NOT NULL CHECK (length(trim(full_name)) >= 2),
    phone          VARCHAR(15)  CHECK (phone ~ '^\+?[0-9]{10,13}$'),
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT chk_email_format CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
    CONSTRAINT chk_bcrypt_hash  CHECK (password_hash ~ '^\$2[aby]\$\d{2}\$.{53}$')
);
-- case-insensitive uniqueness of e-mail (expression index)
CREATE UNIQUE INDEX ux_users_email_lower ON users (lower(email));

-- ---------- Patients (ISA users) ----------
CREATE TABLE patients (
    patient_id         INT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    date_of_birth      DATE      NOT NULL CHECK (date_of_birth BETWEEN DATE '1900-01-01' AND CURRENT_DATE),
    gender             gender_t  NOT NULL,
    blood_group        VARCHAR(3) CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
    address            VARCHAR(200),
    emergency_contact  VARCHAR(15) CHECK (emergency_contact ~ '^\+?[0-9]{10,13}$')
);

-- ---------- Specializations ----------
CREATE TABLE specializations (
    spec_id      SERIAL PRIMARY KEY,
    name         VARCHAR(60) NOT NULL UNIQUE,
    description  TEXT        NOT NULL
);

-- ---------- Doctors (ISA users) ----------
CREATE TABLE doctors (
    doctor_id            INT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    spec_id              INT NOT NULL REFERENCES specializations(spec_id) ON DELETE RESTRICT,
    branch_id            INT NOT NULL REFERENCES branches(branch_id)        ON DELETE RESTRICT,
    license_no           VARCHAR(20) NOT NULL UNIQUE,
    years_experience     SMALLINT    NOT NULL CHECK (years_experience BETWEEN 0 AND 60),
    consultation_fee     NUMERIC(8,2) NOT NULL CHECK (consultation_fee > 0),
    slot_minutes         SMALLINT    NOT NULL DEFAULT 20 CHECK (slot_minutes IN (10,15,20,30,45,60)),
    max_daily_patients   SMALLINT    NOT NULL DEFAULT 16 CHECK (max_daily_patients BETWEEN 1 AND 60),
    specialization_notes TEXT        NOT NULL CHECK (length(specialization_notes) >= 40),
    notes_embedding      VECTOR(384),                    -- all-MiniLM-L6-v2 sentence embedding
    embedded_at          TIMESTAMP
);
-- keyword (full-text) search column, used to contrast with semantic search
ALTER TABLE doctors
    ADD COLUMN search_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', specialization_notes)) STORED;
ALTER TABLE doctors
    ADD CONSTRAINT chk_license_format CHECK (license_no ~ '^KMC-[0-9]{5}$');

-- ---------- Weekly availability (weak entity of doctor) ----------
CREATE TABLE doctor_availability (
    doctor_id   INT      NOT NULL REFERENCES doctors(doctor_id) ON DELETE CASCADE,
    weekday     SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0 = Sunday
    start_time  TIME     NOT NULL,
    end_time    TIME     NOT NULL,
    PRIMARY KEY (doctor_id, weekday, start_time),
    CONSTRAINT chk_avail_range CHECK (end_time > start_time),
    -- a doctor's shifts on one weekday must not overlap
    CONSTRAINT ex_avail_no_overlap EXCLUDE USING gist (
        doctor_id WITH =, weekday WITH =,
        tsrange(DATE '2000-01-01' + start_time, DATE '2000-01-01' + end_time) WITH &&)
);

-- ---------- Symptom reports (free text + embedding) ----------
CREATE TABLE symptom_reports (
    report_id      SERIAL PRIMARY KEY,
    patient_id     INT  NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    description    TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 2000),
    severity       SMALLINT NOT NULL CHECK (severity BETWEEN 1 AND 10),
    duration_days  SMALLINT NOT NULL CHECK (duration_days BETWEEN 0 AND 3650),
    embedding      VECTOR(384) NOT NULL,
    red_flag       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------- Triage recommendations (weak entity of symptom_report) ----------
CREATE TABLE triage_recommendations (
    report_id   INT      NOT NULL REFERENCES symptom_reports(report_id) ON DELETE CASCADE,
    rank        SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 3),
    doctor_id   INT      NOT NULL REFERENCES doctors(doctor_id) ON DELETE CASCADE,
    similarity  NUMERIC(5,4) NOT NULL CHECK (similarity BETWEEN -1 AND 1),
    PRIMARY KEY (report_id, rank),
    UNIQUE (report_id, doctor_id)
);

-- ---------- Appointments ----------
CREATE TABLE appointments (
    appt_id      SERIAL PRIMARY KEY,
    patient_id   INT NOT NULL REFERENCES patients(patient_id) ON DELETE RESTRICT,
    doctor_id    INT NOT NULL REFERENCES doctors(doctor_id)   ON DELETE RESTRICT,
    branch_id    INT NOT NULL REFERENCES branches(branch_id)  ON DELETE RESTRICT,
    report_id    INT REFERENCES symptom_reports(report_id)    ON DELETE SET NULL,
    start_time   TIMESTAMP NOT NULL,
    end_time     TIMESTAMP NOT NULL,
    status       appt_status NOT NULL DEFAULT 'booked',
    reason       VARCHAR(300),
    created_at   TIMESTAMP NOT NULL DEFAULT now(),
    updated_at   TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_appt_range CHECK (end_time > start_time
                                     AND end_time - start_time <= INTERVAL '2 hours'),
    -- race-proof backstop: a doctor can never hold two live, overlapping appointments
    CONSTRAINT ex_doctor_no_double_booking EXCLUDE USING gist (
        doctor_id WITH =, tsrange(start_time, end_time) WITH &&)
        WHERE (status IN ('booked', 'completed'))
);

-- ---------- Payments (1:1 with appointment) ----------
CREATE TABLE payments (
    payment_id   SERIAL PRIMARY KEY,
    appt_id      INT NOT NULL UNIQUE REFERENCES appointments(appt_id) ON DELETE CASCADE,
    amount       NUMERIC(8,2) NOT NULL CHECK (amount > 0),
    method       pay_method   NOT NULL,
    status       pay_status   NOT NULL DEFAULT 'paid',
    txn_ref      VARCHAR(40)  NOT NULL UNIQUE,
    paid_at      TIMESTAMP    NOT NULL DEFAULT now()
);

-- ---------- Prescriptions (1:1 with a completed appointment) ----------
CREATE TABLE prescriptions (
    rx_id        SERIAL PRIMARY KEY,
    appt_id      INT  NOT NULL UNIQUE REFERENCES appointments(appt_id) ON DELETE CASCADE,
    diagnosis    VARCHAR(200) NOT NULL,
    advice       TEXT,
    follow_up_on DATE,
    created_at   TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------- Prescription line items (weak entity of prescription) ----------
CREATE TABLE prescription_items (
    rx_id          INT      NOT NULL REFERENCES prescriptions(rx_id) ON DELETE CASCADE,
    line_no        SMALLINT NOT NULL CHECK (line_no > 0),
    medicine       VARCHAR(100) NOT NULL,
    dosage         VARCHAR(40)  NOT NULL,
    frequency      VARCHAR(40)  NOT NULL,
    duration_days  SMALLINT     NOT NULL CHECK (duration_days BETWEEN 1 AND 365),
    PRIMARY KEY (rx_id, line_no)
);

-- ---------- Audit trail (written only by triggers) ----------
CREATE TABLE audit_log (
    log_id      BIGSERIAL PRIMARY KEY,
    table_name  VARCHAR(40) NOT NULL,
    operation   VARCHAR(6)  NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
    row_pk      TEXT        NOT NULL,
    actor_id    INT,
    db_role     TEXT        NOT NULL DEFAULT current_user,
    old_data    JSONB,
    new_data    JSONB,
    logged_at   TIMESTAMP   NOT NULL DEFAULT now()
);

-- ---------- Secondary indexes ----------
CREATE INDEX ix_appt_doctor_time   ON appointments (doctor_id, start_time);
CREATE INDEX ix_appt_patient_time  ON appointments (patient_id, start_time DESC);
CREATE INDEX ix_appt_live          ON appointments (start_time) WHERE status = 'booked';  -- partial
CREATE INDEX ix_doctors_spec       ON doctors (spec_id);
CREATE INDEX ix_doctors_branch     ON doctors (branch_id);
CREATE INDEX ix_doctors_fts        ON doctors USING gin (search_tsv);                      -- full-text
CREATE INDEX ix_reports_patient    ON symptom_reports (patient_id, created_at DESC);
CREATE INDEX ix_audit_table_time   ON audit_log (table_name, logged_at DESC);
-- Vector ANN indexes (HNSW, cosine distance operator <=>)
CREATE INDEX ix_doctors_notes_hnsw ON doctors
    USING hnsw (notes_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ix_reports_emb_hnsw   ON symptom_reports
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

COMMENT ON COLUMN doctors.notes_embedding IS '384-d all-MiniLM-L6-v2 embedding of specialization + specialization_notes (L2-normalised)';
COMMENT ON COLUMN symptom_reports.embedding IS '384-d all-MiniLM-L6-v2 embedding of the patient''s free-text symptom description';
