'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client';

const DEMO = [
  ['Patient', 'arnav@demo.clinic', 'Patient@123'],
  ['Doctor', 'ananya.rao@demo.clinic', 'Doctor@123'],
  ['Admin', 'admin@demo.clinic', 'Admin@123'],
];

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [form, setForm] = useState({ email: '', password: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const { user } = await api('/api/auth/login', { method: 'POST', body: form });
      router.push(next && next.startsWith('/' + user.role) ? next : '/' + user.role);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="card auth-card">
      <h1>Sign in</h1>
      <p className="muted">Describe symptoms in your own words — we route you to the right specialist.</p>
      <label>Email<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
      <label>Password<input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
      {err && <div className="alert error">{err}</div>}
      <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p className="muted small">New patient? <Link href="/register">Create an account</Link></p>
      <div className="demo">
        <span className="small muted">Demo accounts</span>
        <div className="row">{DEMO.map(([r, e, p]) => (
          <button type="button" key={r} className="ghost small" onClick={() => setForm({ email: e, password: p })}>{r}</button>
        ))}</div>
      </div>
    </form>
  );
}

export default function Login() {
  return (
    <div className="auth-wrap">
      <div className="auth-hero">
        <div className="brand big"><span className="logo">+</span> TriageCare</div>
        <h2>From “my chest feels tight when I climb stairs” to the right cardiologist — in one step.</h2>
        <p>Free-text symptoms are embedded with a sentence-transformer and matched against doctors’ specialization notes using pgvector cosine similarity. Bookings and payments commit atomically; a trigger blocks double-booking.</p>
      </div>
      <Suspense><LoginForm /></Suspense>
    </div>
  );
}
