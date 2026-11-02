'use client';
import { useEffect, useState } from 'react';
import { api, inr } from '@/lib/client';

const blank = { full_name: '', email: '', password: '', phone: '', spec_id: '', branch_id: '', license_no: 'KMC-', years_experience: 5,
  consultation_fee: 700, slot_minutes: 20, max_daily_patients: 16, specialization_notes: '' };
const blankBranch = { name: '', street: '', pincode: '', phone: '', opens_at: '08:00', closes_at: '20:00' };

export default function Doctors() {
  const [d, setD] = useState(null); const [f, setF] = useState(blank); const [b, setB] = useState(blankBranch);
  const [branches, setBranches] = useState([]); const [msg, setMsg] = useState(null);
  const load = () => { api('/api/admin/doctors').then(setD); api('/api/branches').then(setBranches); };
  useEffect(load, []);
  const run = async (fn, ok) => { try { await fn(); setMsg({ t: 'success', m: ok }); load(); } catch (e) { setMsg({ t: 'error', m: e.message }); } };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (!d) return <div className="page muted">Loading…</div>;
  return (
    <div className="page">
      <div className="page-head"><h1>Doctors & branches</h1></div>
      {msg && <div className={'alert ' + msg.t}>{msg.m}</div>}
      <table className="table">
        <thead><tr><th>Doctor</th><th>Specialization</th><th>Branch</th><th>License</th><th>Fee</th><th>Daily cap</th><th>Appts</th><th>Status</th><th></th></tr></thead>
        <tbody>{d.doctors.map((x) => (
          <tr key={x.doctor_id}>
            <td><b>{x.full_name}</b><div className="small muted">{x.email}</div></td><td>{x.specialization}</td><td>{x.branch}</td><td>{x.license_no}</td>
            <td><input className="mini" type="number" defaultValue={x.consultation_fee}
              onBlur={(e) => +e.target.value !== x.consultation_fee && run(() => api(`/api/admin/doctors/${x.doctor_id}`, { method: 'PATCH', body: { consultation_fee: +e.target.value } }), 'Fee updated.')} /></td>
            <td><input className="mini" type="number" defaultValue={x.max_daily_patients}
              onBlur={(e) => +e.target.value !== x.max_daily_patients && run(() => api(`/api/admin/doctors/${x.doctor_id}`, { method: 'PATCH', body: { max_daily_patients: +e.target.value } }), 'Capacity updated.')} /></td>
            <td>{x.total_appts}</td>
            <td><span className={'badge ' + (x.is_active ? 'paid' : 'cancelled')}>{x.is_active ? 'active' : 'inactive'}</span></td>
            <td className="row">
              <button className="ghost small" onClick={() => run(() => api(`/api/admin/doctors/${x.doctor_id}`, { method: 'PATCH', body: { is_active: !x.is_active } }), 'Status updated.')}>{x.is_active ? 'Deactivate' : 'Activate'}</button>
              <button className="ghost small danger" onClick={() => run(() => api(`/api/admin/doctors/${x.doctor_id}`, { method: 'DELETE' }), 'Doctor deleted.')}>Delete</button></td>
          </tr>))}</tbody>
      </table>

      <div className="grid2">
        <form className="card" onSubmit={(e) => { e.preventDefault(); run(() => api('/api/admin/doctors', { method: 'POST', body: f }).then(() => setF(blank)), 'Doctor added and embedded.'); }}>
          <h3>Add doctor</h3>
          <div className="grid2">
            <label>Full name<input required value={f.full_name} onChange={set('full_name')} /></label>
            <label>Email<input type="email" required value={f.email} onChange={set('email')} /></label>
            <label>Initial password<input type="password" required value={f.password} onChange={set('password')} /></label>
            <label>Phone<input value={f.phone} onChange={set('phone')} /></label>
            <label>Specialization<select required value={f.spec_id} onChange={set('spec_id')}><option value="">—</option>{d.specializations.map((s) => <option key={s.spec_id} value={s.spec_id}>{s.name}</option>)}</select></label>
            <label>Branch<select required value={f.branch_id} onChange={set('branch_id')}><option value="">—</option>{d.branches.map((s) => <option key={s.branch_id} value={s.branch_id}>{s.name}</option>)}</select></label>
            <label>License no.<input required value={f.license_no} onChange={set('license_no')} /></label>
            <label>Experience (yrs)<input type="number" value={f.years_experience} onChange={set('years_experience')} /></label>
            <label>Fee (₹)<input type="number" value={f.consultation_fee} onChange={set('consultation_fee')} /></label>
            <label>Slot (min)<select value={f.slot_minutes} onChange={set('slot_minutes')}>{[10, 15, 20, 30, 45, 60].map((m) => <option key={m}>{m}</option>)}</select></label>
          </div>
          <label>Specialization notes (embedded for triage)<textarea rows={3} required minLength={40} value={f.specialization_notes} onChange={set('specialization_notes')} /></label>
          <button>Add doctor</button>
        </form>
        <div className="card">
          <h3>Branches</h3>
          <table className="table compact"><thead><tr><th>Name</th><th>Pincode</th><th>Hours</th><th>Doctors</th><th></th></tr></thead>
            <tbody>{branches.map((x) => <tr key={x.branch_id}><td>{x.name}</td><td>{x.pincode}</td><td>{x.opens_at.slice(0, 5)}–{x.closes_at.slice(0, 5)}</td><td>{x.doctors}</td>
              <td><button className="ghost small danger" onClick={() => run(() => api(`/api/admin/branches/${x.branch_id}`, { method: 'DELETE' }), 'Branch deleted.')}>Delete</button></td></tr>)}</tbody></table>
          <form onSubmit={(e) => { e.preventDefault(); run(() => api('/api/admin/branches', { method: 'POST', body: b }).then(() => setB(blankBranch)), 'Branch added.'); }}>
            <div className="grid2">
              <label>Name<input required value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} /></label>
              <label>Street<input required value={b.street} onChange={(e) => setB({ ...b, street: e.target.value })} /></label>
              <label>Pincode<input required value={b.pincode} onChange={(e) => setB({ ...b, pincode: e.target.value })} /></label>
              <label>Phone<input required value={b.phone} onChange={(e) => setB({ ...b, phone: e.target.value })} /></label>
              <label>Opens<input type="time" value={b.opens_at} onChange={(e) => setB({ ...b, opens_at: e.target.value })} /></label>
              <label>Closes<input type="time" value={b.closes_at} onChange={(e) => setB({ ...b, closes_at: e.target.value })} /></label>
            </div>
            <button className="secondary">Add branch</button>
          </form>
        </div>
      </div>
    </div>
  );
}
