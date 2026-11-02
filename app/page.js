import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifySession, COOKIE } from '@/lib/auth.mjs';
export default async function Home() {
  const user = await verifySession(cookies().get(COOKIE)?.value);
  redirect(user ? '/' + user.role : '/login');
}
