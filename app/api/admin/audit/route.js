import { route } from '@/lib/api.mjs';
import { withUser } from '@/lib/db.mjs';
export const GET = route(['admin'], ({ req, user }) => withUser(user, async (c) => {
  const table = new URL(req.url).searchParams.get('table');
  const { rows } = await c.query(
    `SELECT l.log_id, l.table_name, l.operation, l.row_pk, l.db_role, l.logged_at::text,
            u.full_name AS actor, l.old_data, l.new_data
     FROM audit_log l LEFT JOIN users u ON u.user_id = l.actor_id
     WHERE ($1::text IS NULL OR l.table_name = $1)
     ORDER BY l.log_id DESC LIMIT 100`, [table || null]);
  return rows;
}));
