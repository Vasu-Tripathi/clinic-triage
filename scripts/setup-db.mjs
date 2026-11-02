// Creates the database objects (db/*.sql), the runtime role password, and seed data.
// Usage:  npm run db:setup      (reads .env.local)
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { embed, toPgVector, doctorDocument } from '../lib/embed.mjs';
import * as seed from './seed-data.mjs';

const ADMIN_URL = process.env.DATABASE_ADMIN_URL;
const APP_PW = process.env.DB_APP_PASSWORD;
if (!ADMIN_URL || !APP_PW) throw new Error('Set DATABASE_ADMIN_URL and DB_APP_PASSWORD in .env.local');

const log = (...a) => console.log('›', ...a);

// 1. create database if needed
const url = new URL(ADMIN_URL);
const dbName = url.pathname.slice(1);
{
  const u2 = new URL(ADMIN_URL); u2.pathname = '/postgres';
  const c = new pg.Client({ connectionString: u2.toString() });
  await c.connect();
  const { rowCount } = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!rowCount) { await c.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`); log('created database', dbName); }
  await c.end();
}

const db = new pg.Client({ connectionString: ADMIN_URL });
await db.connect();
await db.query(`ALTER DATABASE "${dbName}" SET timezone TO 'Asia/Kolkata'`);
await db.query(`SET timezone TO 'Asia/Kolkata'`);

// 2. DDL / functions / views / security
for (const f of ['01_schema.sql', '02_functions_triggers.sql', '03_views.sql', '04_security.sql']) {
  await db.query(fs.readFileSync(path.join('db', f), 'utf8'));
  log('ran', f);
}
await db.query(`ALTER ROLE clinic_app WITH LOGIN PASSWORD ${db.escapeLiteral(APP_PW)}`);
await db.query(`GRANT CONNECT ON DATABASE "${dbName}" TO clinic_app`);

// 3. seed
const hash = (pw) => bcrypt.hashSync(pw, 10);
const pw = { admin: hash('Admin@123'), doctor: hash('Doctor@123'), patient: hash('Patient@123') };

await db.query('BEGIN');
const branchIds = [];
for (const b of seed.branches) {
  const { rows } = await db.query(
    `INSERT INTO branches(name, street, pincode, phone, opens_at, closes_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING branch_id`, [b.name, b.street, b.pincode, b.phone, b.opens, b.closes]);
  branchIds.push(rows[0].branch_id);
}
const specIds = {}; const specDesc = {};
for (const [name, desc] of seed.specializations) {
  const { rows } = await db.query('INSERT INTO specializations(name, description) VALUES ($1,$2) RETURNING spec_id', [name, desc]);
  specIds[name] = rows[0].spec_id; specDesc[name] = desc;
}

await db.query(`INSERT INTO users(email, password_hash, role, full_name, phone)
                VALUES ('admin@demo.clinic', $1, 'admin', 'Front Desk Admin', '+918041234500')`, [pw.admin]);

log('embedding', seed.doctors.length, 'doctor profiles …');
const docTexts = seed.doctors.map(([, spec, , , , , , notes]) => doctorDocument(spec, specDesc[spec], notes));
const docVecs = await embed(docTexts);
const doctorIds = {};
for (const [i, [name, spec, bi, lic, yrs, fee, slot, notes]] of seed.doctors.entries()) {
  const email = name.toLowerCase().replace('dr. ', '').replace(/\s+/g, '.') + '@demo.clinic';
  const { rows } = await db.query(
    `INSERT INTO users(email, password_hash, role, full_name, phone)
     VALUES ($1,$2,'doctor',$3,$4) RETURNING user_id`,
    [email, pw.doctor, name, '+9198450' + String(10000 + i).slice(-5)]);
  const id = rows[0].user_id; doctorIds[name] = id;
  await db.query(
    `INSERT INTO doctors(doctor_id, spec_id, branch_id, license_no, years_experience, consultation_fee,
                         slot_minutes, specialization_notes, notes_embedding, embedded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::vector, now())`,
    [id, specIds[spec], branchIds[bi], lic, yrs, fee, slot, notes, toPgVector(docVecs[i])]);
  // Mon–Sat: 09:00–13:00 and 14:00–18:00
  for (let wd = 1; wd <= 6; wd++) {
    await db.query(`INSERT INTO doctor_availability VALUES ($1,$2,'09:00','13:00'), ($1,$2,'14:00','18:00')`, [id, wd]);
  }
}

const patientIds = [];
for (const [name, email, dob, gender, blood, phone] of seed.patients) {
  const { rows } = await db.query(
    `INSERT INTO users(email, password_hash, role, full_name, phone) VALUES ($1,$2,'patient',$3,$4) RETURNING user_id`,
    [email, pw.patient, name, phone]);
  patientIds.push(rows[0].user_id);
  await db.query(`INSERT INTO patients(patient_id, date_of_birth, gender, blood_group, address, emergency_contact)
                  VALUES ($1,$2,$3,$4,'Bengaluru, Karnataka',$5)`, [rows[0].user_id, dob, gender, blood, '+919811100000']);
}

log('embedding', seed.history.length, 'symptom reports …');
const hVecs = await embed(seed.history.map((h) => h[1]));
let seq = 0;
for (const [i, [pi, text, sev, days, docName, offset, status]] of seed.history.entries()) {
  const vec = toPgVector(hVecs[i]);
  const { rows: [rep] } = await db.query(
    `INSERT INTO symptom_reports(patient_id, description, severity, duration_days, embedding, red_flag, created_at)
     VALUES ($1,$2,$3,$4,$5::vector,$6, (CURRENT_DATE + $7::int - 1) + TIME '18:00') RETURNING report_id`,
    [patientIds[pi], text, sev, days, vec, sev >= 8, offset]);
  const { rows: recs } = await db.query('SELECT doctor_id, similarity FROM fn_recommend_doctors($1::vector, 3, NULL)', [vec]);
  for (const [r, rec] of recs.entries())
    await db.query('INSERT INTO triage_recommendations VALUES ($1,$2,$3,$4)', [rep.report_id, r + 1, rec.doctor_id, rec.similarity]);

  // pick a working day (skip Sunday) and a morning slot
  const docId = doctorIds[docName];
  const { rows: [{ day }] } = await db.query(
    `SELECT CASE WHEN EXTRACT(DOW FROM CURRENT_DATE + $1::int) = 0
                 THEN CURRENT_DATE + $1::int + (CASE WHEN $1::int < 0 THEN -1 ELSE 1 END)
                 ELSE CURRENT_DATE + $1::int END::text AS day`, [offset]);
  const { rows: [{ slot_minutes }] } = await db.query('SELECT slot_minutes FROM doctors WHERE doctor_id=$1', [docId]);
  const startMin = 10 * 60 + (seq++ % 6) * 60;            // 10:00 .. 15:00 (skips lunch below)
  const sm = startMin === 13 * 60 ? 14 * 60 + 30 : startMin;
  const start = `${day} ${String(Math.floor(sm / 60)).padStart(2, '0')}:${String(sm % 60).padStart(2, '0')}`;
  const { rows: [appt] } = await db.query(
    `INSERT INTO appointments(patient_id, doctor_id, branch_id, report_id, start_time, end_time, status, reason)
     VALUES ($1,$2,1,$3,$4::timestamp,$4::timestamp + make_interval(mins => $5),$6,$7) RETURNING appt_id, start_time::text`,
    [patientIds[pi], docId, rep.report_id, start, slot_minutes, status, text.slice(0, 120)]);
  await db.query(
    `INSERT INTO payments(appt_id, amount, method, status, txn_ref, paid_at)
     VALUES ($1, NULL, $2, $3, $4, $5::timestamp - interval '1 day')`,
    [appt.appt_id, ['upi', 'card', 'cash', 'insurance'][i % 4], status === 'cancelled' ? 'refunded' : 'paid',
     'TXN' + String(100000 + appt.appt_id), appt.start_time]);
  if (status === 'completed' && seed.prescriptionsByDoctor[docName]) {
    const [dx, advice, items] = seed.prescriptionsByDoctor[docName];
    const { rows: [rx] } = await db.query(
      `INSERT INTO prescriptions(appt_id, diagnosis, advice, follow_up_on, created_at)
       VALUES ($1,$2,$3,$4::date + 14, $5) RETURNING rx_id`, [appt.appt_id, dx, advice, day, appt.start_time]);
    for (const [ln, [m, d, f, dd]] of items.entries())
      await db.query('INSERT INTO prescription_items VALUES ($1,$2,$3,$4,$5,$6)', [rx.rx_id, ln + 1, m, d, f, dd]);
  }
}
await db.query('COMMIT');
await db.query('REFRESH MATERIALIZED VIEW mv_specialization_demand');
await db.query('ANALYZE');

const { rows: counts } = await db.query(`
  SELECT 'users' t, count(*) FROM users UNION ALL SELECT 'doctors', count(*) FROM doctors
  UNION ALL SELECT 'patients', count(*) FROM patients UNION ALL SELECT 'appointments', count(*) FROM appointments
  UNION ALL SELECT 'payments', count(*) FROM payments UNION ALL SELECT 'prescriptions', count(*) FROM prescriptions
  UNION ALL SELECT 'symptom_reports', count(*) FROM symptom_reports`);
console.table(counts);
log('done. Logins: admin@demo.clinic / Admin@123 · ananya.rao@demo.clinic / Doctor@123 · arnav@demo.clinic / Patient@123');
await db.end();
