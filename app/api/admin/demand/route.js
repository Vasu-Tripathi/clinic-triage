import { route } from '@/lib/api.mjs';
import { withUser } from '@/lib/db.mjs';
export const POST = route(['admin'], ({ user }) => withUser(user, async (c) => {
  await c.query('SELECT fn_refresh_demand()');
  return { refreshed: true };
}));
