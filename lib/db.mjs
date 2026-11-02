// PostgreSQL access layer.
// The app connects as the low-privilege role `clinic_app` (credentials come from
// DATABASE_URL in the environment, never from source code). Every authenticated
// request runs inside a transaction that switches to the matching database role
// and publishes the user id for row-level-security policies.
import pg from 'pg';

const { Pool, types } = pg;
types.setTypeParser(1114, (s) => s.replace(' ', 'T'));  // TIMESTAMP -> ISO-ish string, no TZ shift
types.setTypeParser(1700, (s) => parseFloat(s));        // NUMERIC -> number
types.setTypeParser(1082, (s) => s);                    // DATE -> 'YYYY-MM-DD'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (see .env.example)');

const pool = globalThis.__pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
globalThis.__pgPool = pool;

const ROLE_MAP = { patient: 'clinic_patient', doctor: 'clinic_doctor', admin: 'clinic_admin' };

/** Unauthenticated query (only SECURITY DEFINER login/registration functions are granted). */
export async function publicQuery(text, params) {
  return pool.query(text, params);
}

/**
 * Run `fn(client)` inside BEGIN … COMMIT as the given user.
 * Any thrown error rolls the whole transaction back.
 */
export async function withUser(user, fn) {
  const dbRole = ROLE_MAP[user?.role];
  if (!dbRole) throw Object.assign(new Error('Unknown role'), { status: 403 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${dbRole}`);                     // whitelisted identifier
    await client.query(`SELECT set_config('app.user_id', $1, true),
                               set_config('app.role', $2, true)`, [String(user.id), user.role]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Map PostgreSQL errors (constraints, triggers, RLS) to HTTP-friendly messages. */
export function dbError(err) {
  const map = {
    '23505': [409, 'Duplicate value: ' + (err.detail || err.message)],
    '23503': [409, `Blocked by foreign key ${err.constraint || ''}: the record is still referenced (ON DELETE RESTRICT) or its parent is missing.`],
    '23514': [400, err.message],
    '23P01': [409, err.message.includes('ex_doctor_no_double_booking')
                 ? 'Double booking blocked: that slot was just taken.' : err.message],
    '42501': [403, 'Permission denied by database policy.'],
    'P0001': [400, err.message],
    '22P02': [400, 'Invalid input value.'],
    '22007': [400, 'Invalid date/time.'],
    '22008': [400, 'Invalid date/time.'],
  };
  const [status, message] = map[err.code] || [err.status || 500, err.status ? err.message : 'Internal error'];
  if (status === 500 || err.code === '42501') console.error('[db]', err.code, err.message);
  return { status, message, code: err.code };
}
