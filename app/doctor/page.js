'use client';
import { useEffect, useState } from 'react';
import { api, fmtTime, fmtDate, todayISO, inr } from '@/lib/client';

const blankItem = { medicine: '', dosage: '', frequency: '', duration_days: 5 };

export default function Schedule() {
  const [date, setDate] = useState(todayISO(1));
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [rx, setRx] = useState({ diagnosis: '', advice: '', follow_up_on: '', items: [{ ...blankItem }] });
  const [msg, setMsg] = useState(null);
  const load = () => api('/api/doctor/schedule?date=' + date).then(setData).catch((e) => setMsg({ t: 'error', m: e.message }));
  useEffect(() => { load(); }, [date]); // eslint-disable-line

  const complete = async () => {
    try {
      await api('/api/doctor/complete', { method: 'POST', body: { appt_id: open.appt_id, ...rx, items: rx.items.filter((i) => i.medicine) } });
      setMsg({ t: 'success', m: `Appointment #${open.appt_id} completed — prescription saved (stored procedure).` });
      setOpen(null); setRx({ diagnosis: '', advice: '', follow_up_on: '', items: [{ ...blankItem }] }); load();
    } catch (e) { setMsg({ t: 'error', m: e.message }); }
  };
  const noShow = async (id) => {
    try { await api(`/api/appointments/${id}`, { method: 'PATCH', body: { status: 'no_show' } }); load(); }
    catch (e) { setMsg({ t: 'error', m: e.message }); }
  };
  const setItem = (k, f, v) => setRx({ ...rx, items: rx.items.map((it, i) => (i === k ? { ...it, [f]: v } : it)) });
  const L = data?.load;

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Daily schedule</h1><p className="muted">From view <code>v_doctor_daily_schedule</code>; load from <code>fn_doctor_daily_load()</code>.</p></div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {msg && <div className={'alert ' + msg.t}>{msg.m}</div>}
      {L && (
        <div className="kpis">
          <div className="kpi"><span>Appointments</span><b>{L.booked + L.completed}</b><small>of {L.capacity} capacity</small></div>
          <div className="kpi"><span>Load</span><b>{L.load_pct ?? 0}%</b><div className="meter"><span style={{ width: `${Math.min(100, L.load_pct || 0)}%` }} /></div></div>
          <div className="kpi"><span>Booked minutes</span><b>{L.booked_minutes}</b><small>of {L.available_minutes} available</small></div>
          <div className="kpi"><span>Completed</span><b>{L.completed}</b><small>{L.cancelled} cancelled</small></div>
          <div className="kpi"><span>Collected</span><b>{inr(L.revenue)}</b></div>
        </div>
      )}
      {data && (
        <div className="week">{data.week.map((w) => (
          <button key={w.day} className={'weekday' + (w.day === date ? ' on' : '')} onClick={() => setDate(w.day)}>
            <span>{fmtDate(w.day)}</span><div className="bar"><i style={{ height: `${Math.min(100, w.load_pct || 0)}%` }} /></div><small>{w.total_appts}</small>
          </button>))}</div>
      )}
      <table className="table">
        <thead><tr><th>Time</th><th>Patient</th><th>Symptoms (from triage)</th><th>Payment</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {data?.schedule.map((a) => (
            <tr key={a.appt_id} className={a.red_flag ? 'flag' : ''}>
              <td>{fmtTime(a.start_time)}–{fmtTime(a.end_time)}</td>
              <td><b>{a.patient_name}</b><div className="small muted">{a.patient_age} y · {a.patient_gender}</div></td>
              <td className="wrap">{a.symptoms || a.reason}{a.severity && <div className="small muted">severity {a.severity}/10</div>}</td>
              <td><span className={'badge ' + a.payment_status}>{a.payment_status}</span></td>
              <td><span className={'badge ' + a.status}>{a.status}</span>{a.diagnosis && <div className="small muted">{a.diagnosis}</div>}</td>
              <td>{a.status === 'booked' && <div className="row">
                <button className="small" onClick={() => setOpen(a)}>Consult</button>
                <button className="ghost small" onClick={() => noShow(a.appt_id)}>No-show</button></div>}</td>
            </tr>))}
          {data && !data.schedule.length && <tr><td colSpan={6} className="muted">No appointments on this day.</td></tr>}
        </tbody>
      </table>

      {open && (
        <div className="modal-bg" onClick={() => setOpen(null)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h2>Consultation — {open.patient_name}</h2>
            <p className="small muted">{open.symptoms || open.reason}</p>
            <label>Diagnosis<input value={rx.diagnosis} onChange={(e) => setRx({ ...rx, diagnosis: e.target.value })} /></label>
            <label>Advice<textarea rows={2} value={rx.advice} onChange={(e) => setRx({ ...rx, advice: e.target.value })} /></label>
            <label>Follow-up on<input type="date" value={rx.follow_up_on} onChange={(e) => setRx({ ...rx, follow_up_on: e.target.value })} /></label>
            <h4>Medicines</h4>
            {rx.items.map((it, k) => (
              <div className="rx-row" key={k}>
                <input placeholder="Medicine" value={it.medicine} onChange={(e) => setItem(k, 'medicine', e.target.value)} />
                <input placeholder="Dose" value={it.dosage} onChange={(e) => setItem(k, 'dosage', e.target.value)} />
                <input placeholder="Frequency" value={it.frequency} onChange={(e) => setItem(k, 'frequency', e.target.value)} />
                <input type="number" min={1} value={it.duration_days} onChange={(e) => setItem(k, 'duration_days', e.target.value)} />
              </div>))}
            <div className="row">
              <button className="ghost small" onClick={() => setRx({ ...rx, items: [...rx.items, { ...blankItem }] })}>+ medicine</button>
              <span className="grow" />
              <button className="ghost" onClick={() => setOpen(null)}>Close</button>
              <button onClick={complete}>Complete & save prescription</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
