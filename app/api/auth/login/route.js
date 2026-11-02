import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { publicQuery } from '@/lib/db.mjs';
import { signSession, COOKIE, cookieOptions } from '@/lib/auth.mjs';
import { route } from '@/lib/api.mjs';
import { email } from '@/lib/validators.mjs';

const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

export const POST = route(null, async ({ req }) => {
  const body = z.object({ email, password: z.string().min(1).max(72) }).parse(await req.json());
  const { rows } = await publicQuery('SELECT * FROM fn_auth_lookup($1)', [body.email]);
  const u = rows[0];
  // compare against a dummy hash when the user is missing to keep timing uniform
  const ok = await bcrypt.compare(body.password, u?.password_hash ?? DUMMY_HASH);
  if (!u || !ok) return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  if (!u.is_active) return NextResponse.json({ error: 'Account is deactivated.' }, { status: 403 });
  const user = { id: u.user_id, role: u.role, name: u.full_name };
  const res = NextResponse.json({ user });
  res.cookies.set(COOKIE, await signSession(user), cookieOptions);
  return res;
});
