'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';

const NAV = {
  patient: [['/patient', 'Symptom triage'], ['/patient/appointments', 'My appointments']],
  doctor: [['/doctor', 'Daily schedule'], ['/doctor/profile', 'Specialization profile']],
  admin: [['/admin', 'Dashboard'], ['/admin/appointments', 'Appointments'], ['/admin/doctors', 'Doctors & branches'], ['/admin/audit', 'Audit log']],
};

export default function Shell({ role, children }) {
  const [user, setUser] = useState(null);
  const path = usePathname();
  const router = useRouter();
  useEffect(() => { api('/api/auth/me').then((d) => setUser(d.user)).catch(() => router.push('/login')); }, [router]);
  const logout = async () => { await api('/api/auth/logout', { method: 'POST' }); router.push('/login'); };
  return (
    <div className="shell">
      <header className="topbar">
        <Link href={'/' + role} className="brand"><span className="logo">+</span> TriageCare</Link>
        <nav>
          {NAV[role].map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? 'active' : ''}>{label}</Link>
          ))}
        </nav>
        <div className="who">
          {user && <><span className={'role-pill ' + role}>{role}</span><span className="name">{user.name}</span></>}
          <button className="ghost small" onClick={logout}>Sign out</button>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
