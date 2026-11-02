// Stateless auth: bcrypt password hashes in the DB, a signed JWT in an httpOnly cookie.
import { SignJWT, jwtVerify } from 'jose';

export const COOKIE = 'triage_session';
const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET must be set (>= 32 chars)');
  return new TextEncoder().encode(s);
};

export async function signSession(user) {
  return new SignJWT({ role: user.role, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret());
}

export async function verifySession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { id: Number(payload.sub), role: payload.role, name: payload.name };
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8,
  secure: process.env.NODE_ENV === 'production',
};
