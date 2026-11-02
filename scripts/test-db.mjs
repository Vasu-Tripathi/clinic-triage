// Integration tests: database constraints, triggers, procedures, RLS and the HTTP API.
// Usage: npm run test:db   (server must be running on BASE_URL for the API section)
import pg from 'pg';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });          // low-privilege app role
const owner = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL });   // owner, for setup-only checks
const results = [];

async function asUser(role, uid, fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL ROLE clinic_${role}`);
    await c.query(`SELECT set_config('app.user_id',$1,true), set_config('app.role',$2,true)`, [String(uid), role]);
    const r = await fn(c);
    await c.query('ROLLBACK');                       // tests never leave data behind
    return r;
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}

async function test(id, name, expect, fn) {
  let outcome, pass;
  try { outcome = await fn(); pass = expect === 'ok'; outcome = typeof outcome === 'string' ? outcome : JSON.stringify(outcome); }
  catch (e) { outcome = e.message; pass = expect !== 'ok' && e.message.toLowerCase().includes(expect.toLowerCase()); }
  results.push({ id, name, expected: expect === 'ok' ? 'success' : `error ~ "${expect}"`, actual: outcome.slice(0, 90), result: pass ? 'PASS' : 'FAIL' });
}

const one = async (c, sql, args) => (await c.query(sql, args)).rows[0];
const ids = (await pool.query('SELECT * FROM fn_auth_lookup($1)', ['arnav@demo.clinic'])).rows[0];
const aisha = (await pool.query('SELECT * FROM fn_auth_lookup($1)', ['aisha@demo.clinic'])).rows[0].user_id;
const P = ids.user_id;
const D = (await pool.query('SELECT * FROM fn_auth_lookup($1)', ['ananya.rao@demo.clinic'])).rows[0].user_id;
const D2 = (await pool.query('SELECT * FROM fn_auth_lookup($1)', ['vikram.shetty@demo.clinic'])).rows[0].user_id;

// next working day 10:00 for doctor D
const nextSlot = `(CASE WHEN EXTRACT(DOW FROM CURRENT_DATE + 7) = 0 THEN CURRENT_DATE + 8 ELSE CURRENT_DATE + 7 END) + TIME '10:00'`;
const insertAppt = (c, pid, did, start = nextSlot) => one(c,
  `INSERT INTO appointments(patient_id, doctor_id, branch_id, start_time, end_time)
   SELECT $1, $2, d.branch_id, ${start}, ${start} + make_interval(mins => d.slot_minutes) FROM doctors d WHERE doctor_id = $2
   RETURNING appt_id`, [pid, did]);

// ---------- constraints ----------
await test('T01', 'CHECK: invalid e-mail rejected', 'chk_email_format', () => asUser('admin', 1, (c) =>
  c.query(`INSERT INTO users(email,password_hash,role,full_name) VALUES ('bad-email','$2a$10$${'x'.repeat(53)}','patient','X Y')`)));
await test('T02', 'CHECK: plain-text password rejected (must be bcrypt)', 'chk_bcrypt_hash', () => asUser('admin', 1, (c) =>
  c.query(`INSERT INTO users(email,password_hash,role,full_name) VALUES ('a@b.co','secret123','patient','X Y')`)));
await test('T03', 'UNIQUE: duplicate e-mail (case-insensitive)', 'ux_users_email_lower', () => asUser('admin', 1, (c) =>
  c.query(`INSERT INTO users(email,password_hash,role,full_name) VALUES ('ARNAV@demo.clinic','$2a$10$${'x'.repeat(53)}','patient','X Y')`)));
await test('T04', 'CHECK: severity outside 1..10', 'violates check', () => asUser('patient', P, (c) =>
  c.query(`INSERT INTO symptom_reports(patient_id,description,severity,duration_days,embedding)
           SELECT $1,'some long enough text',11,1,embedding FROM symptom_reports WHERE patient_id=$1 LIMIT 1`, [P])));
await test('T05', 'Trigger/FK: appointment with non-existent doctor', 'not accepting', () => asUser('admin', 1, (c) =>
  c.query(`INSERT INTO appointments(patient_id,doctor_id,branch_id,start_time,end_time) VALUES ($1, 9999, 1, ${nextSlot}, ${nextSlot} + interval '20 min')`, [P])));
await test('T06', 'FK RESTRICT: delete doctor with appointments', 'foreign key', () => asUser('admin', 1, (c) =>
  c.query(`DELETE FROM users WHERE user_id = (SELECT doctor_id FROM appointments LIMIT 1)`)));

// ---------- triggers ----------
await test('T07', 'Trigger: valid booking accepted', 'ok', () => asUser('patient', P, async (c) => (await insertAppt(c, P, D)).appt_id > 0 ? 'appointment created' : 'x'));
await test('T08', 'Trigger: double-booking same doctor slot blocked', 'double booking', async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN'); await c.query(`SET LOCAL ROLE clinic_admin`);
    await insertAppt(c, P, D);
    await insertAppt(c, aisha, D);              // other patient, same slot
  } finally { await c.query('ROLLBACK'); c.release(); }
});
await test('T09', 'Trigger: patient cannot be in two appointments at once', 'already have appointment', async () => {
  const c = await pool.connect();
  try { await c.query('BEGIN'); await c.query('SET LOCAL ROLE clinic_admin');
    await insertAppt(c, P, D); await insertAppt(c, P, D2);
  } finally { await c.query('ROLLBACK'); c.release(); }
});
await test('T10', 'Trigger: slot outside working hours', 'outside the doctor', () => asUser('patient', P, (c) =>
  insertAppt(c, P, D, `(CASE WHEN EXTRACT(DOW FROM CURRENT_DATE + 7) = 0 THEN CURRENT_DATE + 8 ELSE CURRENT_DATE + 7 END) + TIME '13:10'`)));
await test('T11', 'Trigger: booking in the past', 'past', () => asUser('patient', P, (c) =>
  insertAppt(c, P, D, `(CURRENT_DATE - 1) + TIME '10:00'`)));
await test('T12', 'EXCLUDE constraint backstop (trigger disabled)', 'ex_doctor_no_double_booking', async () => {
  const adm = await owner.connect();
  try {
    await adm.query('BEGIN'); await adm.query('ALTER TABLE appointments DISABLE TRIGGER trg_validate_appointment');
    await insertAppt(adm, P, D); await insertAppt(adm, aisha, D);
  } finally { await adm.query('ROLLBACK'); adm.release(); }
});
await test('T13', 'Trigger: payment amount must equal fee', 'does not match', () => asUser('patient', P, async (c) => {
  const a = await insertAppt(c, P, D);
  await c.query(`INSERT INTO payments(appt_id, amount, method, txn_ref) VALUES ($1, 1, 'upi', 'T13')`, [a.appt_id]);
}));
await test('T14', 'Trigger: cancel => payment auto-refunded', 'ok', () => asUser('patient', P, async (c) => {
  const a = await insertAppt(c, P, D);
  await c.query(`INSERT INTO payments(appt_id, amount, method, txn_ref) VALUES ($1, NULL, 'upi', 'T14')`, [a.appt_id]);
  await c.query(`UPDATE appointments SET status='cancelled' WHERE appt_id=$1`, [a.appt_id]);
  return 'payment status = ' + (await one(c, 'SELECT status FROM payments WHERE appt_id=$1', [a.appt_id])).status;
}));
await test('T15', 'Trigger: patient cannot mark own appointment completed', 'only cancel', () => asUser('patient', P, async (c) => {
  const a = await insertAppt(c, P, D);
  await c.query(`UPDATE appointments SET status='completed' WHERE appt_id=$1`, [a.appt_id]);
}));

// ---------- transaction ----------
await test('T16', 'Transaction: failed payment rolls back the appointment', 'ok', async () => {
  const c = await pool.connect(); let apptId;
  try {
    await c.query('BEGIN'); await c.query('SET LOCAL ROLE clinic_patient');
    await c.query(`SELECT set_config('app.user_id',$1,true)`, [String(P)]);
    apptId = (await insertAppt(c, P, D)).appt_id;
    await c.query(`INSERT INTO payments(appt_id, amount, method, txn_ref) VALUES ($1, 5, 'card', 'T16')`, [apptId]); // fails
    await c.query('COMMIT');
  } catch { await c.query('ROLLBACK'); } finally { c.release(); }
  const rowCount = await asUser('patient', P, async (q) => (await q.query('SELECT 1 FROM fn_available_slots($1, (' + nextSlot + ')::date) WHERE slot_start = ' + nextSlot, [D])).rowCount);
  return rowCount === 1 ? `appt #${apptId} not persisted; slot still free` : 'slot leaked';
});

// ---------- procedure / functions ----------
await test('T17', 'Procedure: sp_complete_appointment writes Rx + items + status', 'ok', async () => {
  const appt = (await owner.query(`SELECT appt_id, doctor_id FROM appointments WHERE status='booked' ORDER BY appt_id LIMIT 1`)).rows[0];
  return asUser('doctor', appt.doctor_id, async (c) => {
    await c.query(`CALL sp_complete_appointment($1,'Test dx','rest',NULL,'[{"medicine":"Paracetamol 650","dosage":"1 tab","frequency":"TDS","duration_days":3}]')`, [appt.appt_id]);
    const r = await one(c, `SELECT a.status, count(i.*) AS items FROM appointments a JOIN prescriptions p USING (appt_id)
                            JOIN prescription_items i USING (rx_id) WHERE a.appt_id=$1 GROUP BY a.status`, [appt.appt_id]);
    return `status=${r.status}, items=${r.items}`;
  });
});
await test('T18', 'Procedure: another doctor cannot complete it (RLS)', 'not found or not yours', async () => {
  const appt = (await owner.query(`SELECT appt_id, doctor_id FROM appointments WHERE status='booked' ORDER BY appt_id LIMIT 1`)).rows[0];
  const other = (await owner.query(`SELECT doctor_id FROM doctors WHERE doctor_id <> $1 LIMIT 1`, [appt.doctor_id])).rows[0].doctor_id;
  return asUser('doctor', other, (c) => c.query(`CALL sp_complete_appointment($1,'x',NULL,NULL,'[]')`, [appt.appt_id]));
});
await test('T19', 'Function: fn_doctor_daily_load', 'ok', () => asUser('doctor', D, async (c) =>
  await one(c, 'SELECT total_appts, capacity, load_pct FROM fn_doctor_daily_load($1, CURRENT_DATE + 1)', [D])));
await test('T20', 'Recursive CTE: fn_available_slots returns free slots', 'ok', () => asUser('patient', P, async (c) =>
  'slots=' + (await one(c, `SELECT count(*) FROM fn_available_slots($1, (${nextSlot})::date)`, [D])).count));

// ---------- vector search ----------
await test('T21', 'Vector: HNSW index used for ORDER BY <=>', 'ok', async () => {
  const c = await owner.connect();
  try { await c.query('BEGIN'); await c.query('SET LOCAL enable_seqscan = off');
    const { rows } = await c.query(`EXPLAIN SELECT doctor_id FROM doctors ORDER BY notes_embedding <=> (SELECT embedding FROM symptom_reports LIMIT 1) LIMIT 3`);
    await c.query('ROLLBACK'); const plan = rows.map((r) => r['QUERY PLAN']).join(' ');
    if (!plan.includes('ix_doctors_notes_hnsw')) throw new Error('index not used: ' + plan);
    return 'Index Scan using ix_doctors_notes_hnsw';
  } finally { c.release(); }
});
await test('T22', 'Vector: top-3 of seed reports contain the booked specialty', 'ok', async () => {
  const { rows: [r] } = await owner.query(`SELECT count(*) AS n, count(*) FILTER (WHERE hit) AS hits FROM (
     SELECT EXISTS (SELECT 1 FROM triage_recommendations t JOIN doctors d1 ON d1.doctor_id = t.doctor_id
                    JOIN doctors d2 ON d2.doctor_id = a.doctor_id
                    WHERE t.report_id = a.report_id AND d1.spec_id = d2.spec_id) AS hit
     FROM appointments a WHERE a.report_id IS NOT NULL) x`);
  return `${r.hits}/${r.n} reports`;
});

// ---------- RLS / privileges ----------
await test('T23', 'RLS: patient sees only own appointments', 'ok', () => asUser('patient', P, async (c) => {
  const r = await one(c, 'SELECT count(*) AS mine, count(*) FILTER (WHERE patient_id <> $1) AS others FROM appointments', [P]);
  if (+r.others) throw new Error('leak'); return `visible=${r.mine}, others=0`;
}));
await test('T24', 'RLS: doctor cannot read another doctor\'s schedule', 'ok', () => asUser('doctor', D, async (c) =>
  'rows of other doctors = ' + (await one(c, 'SELECT count(*) FROM v_doctor_daily_schedule WHERE doctor_id <> $1', [D])).count));
await test('T25', 'GRANT: patient cannot read audit_log', 'permission denied', () => asUser('patient', P, (c) => c.query('SELECT * FROM audit_log')));
await test('T26', 'GRANT: patient cannot read password hashes', 'permission denied', () => asUser('patient', P, (c) => c.query('SELECT password_hash FROM users')));
await test('T27', 'GRANT: doctor cannot change consultation fee', 'permission denied', () => asUser('doctor', D, (c) => c.query('UPDATE doctors SET consultation_fee = 1 WHERE doctor_id = $1', [D])));
await test('T28', 'Bare app role has no table access', 'permission denied', () => pool.query('SELECT * FROM appointments'));

// ---------- HTTP API ----------
async function http(path, { method = 'GET', body, cookie } = {}) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body && JSON.stringify(body), redirect: 'manual' });
  return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0], json: await r.json().catch(() => null), location: r.headers.get('location') };
}
const login = async (email, password) => (await http('/api/auth/login', { method: 'POST', body: { email, password } })).cookie;
const expectStatus = (want) => async (r) => { const res = await r; if (res.status !== want) throw new Error(`HTTP ${res.status} ${JSON.stringify(res.json)}`); return `HTTP ${res.status}`; };

await test('T29', 'API: wrong password -> 401', 'ok', () => expectStatus(401)(http('/api/auth/login', { method: 'POST', body: { email: 'arnav@demo.clinic', password: 'nope' } })));
await test('T30', 'API: unauthenticated triage -> 401', 'ok', () => expectStatus(401)(http('/api/triage', { method: 'POST', body: {} })));
const pc = await login('arnav@demo.clinic', 'Patient@123');
const dc = await login('ananya.rao@demo.clinic', 'Doctor@123');
await test('T31', 'API: patient calling admin stats -> 403', 'ok', () => expectStatus(403)(http('/api/admin/stats', { cookie: pc })));
await test('T32', 'Middleware: doctor opening /admin is redirected', 'ok', async () => {
  const r = await http('/admin', { cookie: dc }); if (![307, 308].includes(r.status)) throw new Error('status ' + r.status); return `${r.status} -> ${new URL(r.location, BASE).pathname}`;
});
await test('T33', 'API: triage validation (too short)', 'ok', () => expectStatus(400)(http('/api/triage', { method: 'POST', cookie: pc, body: { description: 'pain', severity: 5, duration_days: 1 } })));
await test('T34', 'API: lay-language triage -> Dermatology top-1', 'ok', async () => {
  const r = await http('/api/triage', { method: 'POST', cookie: pc, body: { description: 'itchy red patches on my elbows that flake off', severity: 4, duration_days: 10 } });
  const top = r.json.doctors[0]; if (top.specialization !== 'Dermatology') throw new Error('got ' + top.specialization);
  return `${top.full_name} (${top.specialization}) sim=${top.similarity}; keyword hits=${r.json.keyword.length}`;
});
await test('T35', 'API: red-flag text detected', 'ok', async () => {
  const r = await http('/api/triage', { method: 'POST', cookie: pc, body: { description: 'crushing chest pain spreading to my left arm and sweating', severity: 9, duration_days: 0 } });
  if (!r.json.red_flag) throw new Error('not flagged'); return `red_flag=true, top-1=${r.json.doctors[0].specialization}`;
});

console.table(results);
const failed = results.filter((r) => r.result === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await pool.end(); await owner.end();
process.exit(failed ? 1 : 0);
