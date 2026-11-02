// Helpers shared by route handlers.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, COOKIE } from './auth.mjs';
import { dbError } from './db.mjs';

export async function currentUser() {
  return verifySession(cookies().get(COOKIE)?.value);
}

/** Wrap a handler: authenticate, enforce allowed roles, convert errors to JSON. */
export function route(roles, handler) {
  return async (req, ctx) => {
    try {
      const user = await currentUser();
      if (roles && !user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
      if (roles && !roles.includes(user.role))
        return NextResponse.json({ error: 'Your role cannot access this resource.' }, { status: 403 });
      const data = await handler({ req, user, params: ctx?.params ?? {} });
      return data instanceof Response ? data : NextResponse.json(data);
    } catch (err) {
      if (err?.name === 'ZodError')
        return NextResponse.json({ error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 });
      const { status, message } = dbError(err);
      return NextResponse.json({ error: message }, { status });
    }
  };
}
