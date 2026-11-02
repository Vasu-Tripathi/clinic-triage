import { route } from '@/lib/api.mjs';
import { withUser } from '@/lib/db.mjs';
import { id } from '@/lib/validators.mjs';
export const DELETE = route(['admin'], async ({ user, params }) => {
  const bid = id.parse(params.id);
  return withUser(user, async (c) => ({ deleted: (await c.query('DELETE FROM branches WHERE branch_id = $1', [bid])).rowCount }));
});
