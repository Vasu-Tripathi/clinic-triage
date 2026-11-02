'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client';

export default function Register() {
  const router = useRouter();
  const [f, setF] = useState({ full_name: '', email: '', password: '', phone: '', date_of_birth: '', gender: 'female', blood_group: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try { await api('/api/auth/register', { method: 'POST', body: f }); router.push('/patient'); }
    catch (e) { setErr(e.message); }
  };
  return (
    <div className="auth-wrap single">
      <form onSubmit={submit} className="card auth-card">
        <h1>Patient registration</h1>
        <label>Full name<input required minLength={2} value={f.full_name} onChange={set('full_name')} /></label>
        <label>Email<input type="email" required value={f.email} onChange={set('email')} /></label>
        <label>Password <span className="muted small">(8+ chars, an uppercase letter and a digit)</span>
          <input type="password" required minLength={8} value={f.password} onChange={set('password')} /></label>
        <div className="grid2">
          <label>Phone<input value={f.phone} placeholder="+919876543210" onChange={set('phone')} /></label>
          <label>Date of birth<input type="date" required value={f.date_of_birth} onChange={set('date_of_birth')} /></label>
          <label>Gender<select value={f.gender} onChange={set('gender')}><option>female</option><option>male</option><option>other</option></select></label>
          <label>Blood group<select value={f.blood_group} onChange={set('blood_group')}>
            <option value="">—</option>{['A+','A-','B+','B-','AB+','AB-','O+','O-'].map((b) => <option key={b}>{b}</option>)}</select></label>
        </div>
        {err && <div className="alert error">{err}</div>}
        <button>Create account</button>
        <p className="muted small">Already registered? <Link href="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
