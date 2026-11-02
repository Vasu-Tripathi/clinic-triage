import { route } from '@/lib/api.mjs';
import { withUser } from '@/lib/db.mjs';
export const GET = route(['patient', 'doctor', 'admin'], ({ user }) =>
  withUser(user, async (c) => (await c.query(
    `SELECT b.*, (SELECT count(*) FROM doctors d WHERE d.branch_id = b.branch_id)::int AS doctors
     FROM branches b ORDER BY b.name`)).rows));
