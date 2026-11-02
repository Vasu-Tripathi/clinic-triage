# TriageCare — AI Symptom-to-Specialist Clinic Triage System

DBMS Level-3 project (SQL + Vector DB). Patients describe symptoms in their own words; the system embeds the
text and uses **pgvector cosine similarity** against every doctor's specialization notes to recommend the
top-3 specialists, then books the appointment and payment in **one atomic transaction**.

**Stack:** Next.js 14 (App Router + Route Handlers) · PostgreSQL 16 · pgvector (HNSW) · all-MiniLM-L6-v2 sentence
embeddings run locally with Transformers.js (no paid API) · bcrypt + JWT (httpOnly cookie) · Zod validation.

## Why SQL *and* a vector store?

| Data | Store | Reason |
|---|---|---|
| Patients, doctors, branches, appointments, payments, prescriptions | PostgreSQL tables | Strong relational integrity: FKs, CHECKs, EXCLUDE (no overlapping slots), transactions, RLS |
| Free-text symptom descriptions, doctor specialization notes | pgvector `VECTOR(384)` + HNSW | “my heart races when I climb stairs” shares **no keywords** with “palpitations, arrhythmia” — only semantic similarity can match it. Full-text search returns 0 hits for most lay descriptions (shown in the UI). |

Both live in the same PostgreSQL instance, so a single query can combine similarity search with relational
filters (active doctors, branch, tomorrow's load) and the booking stays ACID..

## Features → requirements

| Requirement | Where |
|---|---|
| DDL: CREATE / ALTER / DROP, PK, FK, CHECK, UNIQUE, EXCLUDE, indexes | `db/01_schema.sql` |
| Triggers (double-booking block, fee check, auto-refund, Rx guard, audit) | `db/02_functions_triggers.sql` |
| Stored function `fn_doctor_daily_load`, procedure `sp_complete_appointment`, recursive-CTE `fn_available_slots` | `db/02_functions_triggers.sql` |
| Vector similarity search `fn_recommend_doctors`, `fn_similar_case_specialties` | `db/02_functions_triggers.sql`, `app/api/triage` |
| Views `v_doctor_daily_schedule`, `v_patient_appointment_history`, `v_branch_revenue_summary`, materialized `mv_specialization_demand` | `db/03_views.sql` |
| Transaction: booking + payment atomic, advisory lock, rollback demo | `app/api/appointments/route.js` |
| Full-text search (keyword baseline) | `doctors.search_tsv` + GIN index |
| DB-level RBAC: 3 roles, column GRANTs, Row-Level Security | `db/04_security.sql` |
| DML + JOIN / GROUP BY / HAVING / correlated & nested subqueries / CTE / window | `db/05_dml_queries.sql`, `app/api/admin/stats` |
| Roles: Patient, Doctor, Admin/Receptionist | middleware + route guards + DB roles |
| Tests (35 cases) | `scripts/test-db.mjs` |

## Setup

Prerequisites: **Node 20+**, **PostgreSQL 15+ with pgvector** (`CREATE EXTENSION vector` must work —
e.g. `sudo apt install postgresql-16-pgvector`, or Docker `pgvector/pgvector:pg16`).

```bash
git clone <repo-url> && cd clinic-triage
npm install
cp .env.example .env.local        # fill in DB passwords and a 32+ char JWT_SECRET
npm run db:setup                  # creates DB, schema, roles, seed data + embeddings
npm run dev                       # http://localhost:3000
npm run test:db                   # in another terminal, with the server running
```

The first `db:setup` downloads the embedding model (~90 MB) from Hugging Face and caches it. For an
offline machine, put the model folder at `models/Xenova/all-MiniLM-L6-v2/` and set `EMBEDDING_MODEL_DIR=./models`.

Quick Postgres with Docker:
```bash
docker run -d --name triage-db -e POSTGRES_PASSWORD=pgadmin -p 5432:5432 pgvector/pgvector:pg16
```

### Demo accounts (seed data)
| Role | Email | Password |
|---|---|---|
| Patient | arnav@demo.clinic | Patient@123 |
| Doctor | ananya.rao@demo.clinic (any `firstname.lastname@demo.clinic`) | Doctor@123 |
| Admin | admin@demo.clinic | Admin@123 |

## Security
- Passwords: bcrypt (cost 10); a CHECK constraint rejects anything that is not a bcrypt hash.
- No credentials in code — `DATABASE_URL`, `DB_APP_PASSWORD`, `JWT_SECRET` come from `.env.local` (git-ignored).
- The web app connects as `clinic_app`, which owns nothing and can only call two SECURITY DEFINER login
  functions. Each request runs `SET LOCAL ROLE clinic_patient|clinic_doctor|clinic_admin` and sets
  `app.user_id`, so **column GRANTs and RLS policies in PostgreSQL** decide what rows are visible.
- All SQL is parameterised; input validated with Zod in the API and CHECK constraints in the DB.

## Project structure
```
app/            Next.js pages (patient/, doctor/, admin/, login, register) and api/ route handlers
components/     Shell (role-aware navigation)
lib/            db.mjs (pool + per-request role switch), auth.mjs (JWT), embed.mjs, validators.mjs
db/             01_schema · 02_functions_triggers · 03_views · 04_security · 05_dml_queries · 06_vector_commands
scripts/        setup-db.mjs (migrate + seed + embed), seed-data.mjs, test-db.mjs
docs/           diagrams/ (ER + schema), screenshots/, logs/ (DDL, DML, vector command output)
middleware.js   role-based route protection
```

## Team
| Member | SRN | Responsibilities |
|---|---|---|
| Vasu | PES1UG24AM918 | **DB:** ER model, schema/DDL, constraints & indexes, validation/payment/refund triggers, booking transaction, pgvector embeddings + HNSW + `fn_recommend_doctors`. **App:** embedding pipeline, patient triage & booking pages + APIs, seed data |
| Avaneesh N | PES1UG24AM917 | **DB:** views + materialized view, daily-load function, recursive-CTE slots, `sp_complete_appointment`, audit trigger, roles/GRANTs/RLS, analytics queries. **App:** auth (bcrypt, JWT, middleware), doctor & admin pages + APIs, test suite, docs |
