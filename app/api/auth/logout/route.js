import { NextResponse } from 'next/server';
import { COOKIE } from '@/lib/auth.mjs';
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
