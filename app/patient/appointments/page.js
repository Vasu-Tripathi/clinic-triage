'use client';
import { useEffect, useState } from 'react';
import { api, inr, fmtTime, fmtDate } from '@/lib/client';

export default function MyAppointments() {
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () => api('/api/appointments').then(setRows).catch((e) => setMsg({ t: 'error', m: e.message }));
  useEffect(() => { load(); }, []);
  const cancel = async (id) => {
    try { await api(`/api/appointments/${id}`, { method: 'PATCH', body: { status: 'cancelled' } });
      setMsg({ t: 'success', m: `Appointment #${id} cancelled — payment marked refunded by trigger.` }); load(); }
    catch (e) { setMsg({ t: 'error', m: e.message }); }
  };
  const upcoming = rows?.filter((r) => r.status === 'booked') ?? [];
  const past = rows?.filter((r) => r.status !== 'booked') ?? [];
  return (
    <div className="page">
      <div className="page-head"><h1>My appointments</h1></div>
      {msg && <div className={'alert ' + msg.t}>{msg.m}</div>}
      <h2>Upcoming</h2>
      <table className="table">
        <thead><tr><th>#</th><th>When</th><th>Doctor</th><th>Specialization</th><th>Branch</th><th>Payment</th><th></th></tr></thead>
        <tbody>{upcoming.map((r) => (
          <tr key={r.appt_id}><td>{r.appt_id}</td><td>{fmtDate(r.start_time)} {fmtTime(r.start_time)}</td><td>{r.doctor_name}</td>
            <td>{r.specialization}</td><td>{r.branch}</td><td>{inr(r.amount)} <span className={'badge ' + r.payment_status}>{r.payment_status}</span></td>
            <td><button className="ghost small danger" onClick={() => cancel(r.appt_id)}>Cancel</button></td></tr>))}
          {rows && !upcoming.length && <tr><td colSpan={7} className="muted">No upcoming appointments.</td></tr>}
        </tbody>
      </table>
      <h2>History & prescriptions</h2>
      <div className="history">
        {past.map((r) => (
          <div className="card" key={r.appt_id}>
            <div className="row between"><b>{r.doctor_name}</b><span className={'badge ' + r.status}>{r.status}</span></div>
            <div className="small muted">{r.specialization} · {fmtDate(r.start_time)} {fmtTime(r.start_time)} · {r.branch}</div>
            {r.diagnosis && <>
              <p><b>Diagnosis:</b> {r.diagnosis}</p>
              {r.advice && <p className="small">{r.advice}</p>}
              <table className="table compact"><thead><tr><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Days</th></tr></thead>
                <tbody>{r.items.map((i, k) => <tr key={k}><td>{i.medicine}</td><td>{i.dosage}</td><td>{i.frequency}</td><td>{i.duration_days}</td></tr>)}</tbody></table>
              {r.follow_up_on && <p className="small muted">Follow-up on {fmtDate(r.follow_up_on)}</p>}
            </>}
          </div>))}
      </div>
    </div>
  );
}
