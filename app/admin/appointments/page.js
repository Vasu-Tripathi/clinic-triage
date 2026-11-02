'use client';
import { useEffect, useState } from 'react';
import { api, inr, fmtDate, fmtTime } from '@/lib/client';

export default function Appointments() {
  const [rows, setRows] = useState([]); const [branches, setBranches] = useState([]);
  const [f, setF] = useState({ q: '', status: '', branch: '', date: '' }); const [msg, setMsg] = useState(null);
  const load = () => api('/api/appointments?' + new URLSearchParams(Object.entries(f).filter(([, v]) => v))).then(setRows).catch((e) => setMsg({ t: 'error', m: e.message }));
  useEffect(() => { api('/api/branches').then(setBranches); }, []);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [f]); // eslint-disable-line
  const act = async (id, method, body) => {
    try { await api(`/api/appointments/${id}`, { method, body }); setMsg({ t: 'success', m: `Appointment #${id} updated.` }); load(); }
    catch (e) { setMsg({ t: 'error', m: e.message }); }
  };
  return (
    <div className="page">
      <div className="page-head"><h1>All appointments</h1></div>
      <div className="filters card">
        <input placeholder="Search patient, doctor, specialization…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Any status</option>{['booked', 'completed', 'cancelled', 'no_show'].map((s) => <option key={s}>{s}</option>)}</select>
        <select value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}>
          <option value="">Any branch</option>{branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.name}</option>)}</select>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      </div>
      {msg && <div className={'alert ' + msg.t}>{msg.m}</div>}
      <table className="table">
        <thead><tr><th>#</th><th>When</th><th>Patient</th><th>Doctor</th><th>Specialization</th><th>Branch</th><th>Payment</th><th>Status</th><th></th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.appt_id}><td>{r.appt_id}</td><td>{fmtDate(r.start_time)} {fmtTime(r.start_time)}</td><td>{r.patient}</td><td>{r.doctor}</td>
            <td>{r.specialization}</td><td>{r.branch}</td><td>{inr(r.amount)} <span className={'badge ' + r.payment_status}>{r.payment_status}</span></td>
            <td><span className={'badge ' + r.status}>{r.status}</span></td>
            <td className="row">{r.status === 'booked' && <button className="ghost small" onClick={() => act(r.appt_id, 'PATCH', { status: 'cancelled' })}>Cancel</button>}
              <button className="ghost small danger" onClick={() => act(r.appt_id, 'DELETE')}>Delete</button></td></tr>))}
        </tbody>
      </table>
    </div>
  );
}
