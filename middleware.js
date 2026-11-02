// Edge middleware: route-level authorization by role (API handlers re-check, DB enforces RLS).
import { NextResponse } from 'next/server';
import { verifySession, COOKIE } from './lib/auth.mjs';

const AREAS = { '/patient': 'patient', '/doctor': 'doctor', '/admin': 'admin' };

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const area = Object.keys(AREAS).find((p) => pathname === p || pathname.startsWith(p + '/'));
  if (!area) return NextResponse.next();
  const user = await verifySession(req.cookies.get(COOKIE)?.value);
  if (!user) return NextResponse.redirect(new URL('/login?next=' + encodeURIComponent(pathname), req.url));
  if (user.role !== AREAS[area]) return NextResponse.redirect(new URL('/' + user.role, req.url));
  return NextResponse.next();
}
export const config = { matcher: ['/patient/:path*', '/doctor/:path*', '/admin/:path*'] };
