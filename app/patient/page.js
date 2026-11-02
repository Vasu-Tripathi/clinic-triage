'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, inr, fmtTime, fmtDate, todayISO } from '@/lib/client';

const EXAMPLES = [
  'My chest feels tight and my heart races when I climb stairs',
  'Itchy red patches on my elbows that flake off',
  'Burning in my stomach after spicy food and sour burps at night',
  'Ringing in my left ear and I can’t hear properly',
];

const nextDays = () => Array.from({ length: 10 }, (_, i) => todayISO(i)).filter((d) => new Date(d + 'T00:00:00').getDay() !== 0).slice(0, 7);

export default function Triage() {
  const [form, setForm] = useState({ description: '', severity: 5, duration_days: 3, branch_id: '' });
  const [branches, setBranches] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pick, setPick] = useState(null);       // chosen doctor
  const [day, setDay] = useState(nextDays()[0]);
  const [slots, setSlots] = useState(null);
  const [slot, setSlot] = useState(null);
  const [method, setMethod] = useState('upi');
  const [fail, setFail] = useState(false);
  const [booking, setBooking] = useState(null);

  useEffect(() => { api('/api/branches').then(setBranches).catch(() => {}); }, []);
  useEffect(() => {
    if (!pick) return;
    setSlots(null); setSlot(null);
    api(`/api/doctors/${pick.doctor_id}/slots?date=${day}`).then(setSlots).catch((e) => setErr(e.message));
  }, [pick, day]);

  const runTriage = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true); setResult(null); setPick(null); setBooking(null);
    try {
      setResult(await api('/api/triage', { method: 'POST', body: { ...form, branch_id: form.branch_id || null } }));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const book = async () => {
    setErr(''); setBooking(null);
    try {
      const r = await api('/api/appointments', { method: 'POST', body: {
        doctor_id: pick.doctor_id, start_time: slot.slot_start, report_id: result.report_id,
        method, reason: form.description.slice(0, 300), simulate_payment_failure: fail } });
      setBooking({ ok: true, ...r });
    } catch (e) { setBooking({ ok: false, error: e.message }); }
    api(`/api/doctors/${pick.doctor_id}/slots?date=${day}`).then(setSlots).catch(() => {});
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Where should I go?</h1>
          <p className="muted">Describe what you feel in plain words. We match it semantically against every doctor’s specialization notes.</p></div>
      </div>

      <form className="card triage-form" onSubmit={runTriage}>
        <label>Your symptoms
          <textarea rows={4} required minLength={10} maxLength={2000} value={form.description}
            placeholder="e.g. I get a pounding headache on one side with nausea and light hurts my eyes"
            onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <div className="examples">{EXAMPLES.map((x) => (
          <button type="button" className="chip" key={x} onClick={() => setForm({ ...form, description: x })}>{x}</button>))}</div>
        <div className="grid3">
          <label>Severity: <b>{form.severity}</b>/10
            <input type="range" min={1} max={10} value={form.severity} onChange={(e) => setForm({ ...form, severity: +e.target.value })} /></label>
          <label>For how many days?
            <input type="number" min={0} max={3650} value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} /></label>
          <label>Preferred branch
            <select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
              <option value="">Any branch</option>
              {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.name}</option>)}
            </select></label>
        </div>
        <button disabled={busy}>{busy ? 'Matching…' : 'Find the right specialist'}</button>
      </form>

      {err && <div className="alert error">{err}</div>}

      {result && (
        <>
          {result.red_flag && (
            <div className="alert danger"><b>This may need urgent care.</b> Symptoms like these can be serious — please call 112 or go to the nearest emergency department now. You can still book a follow-up below.</div>
          )}
          <div className="results">
            <section>
              <h2>Top matches <span className="muted small">symptom report #{result.report_id} · cosine similarity via pgvector</span></h2>
              <div className="doc-cards">
                {result.doctors.map((d, i) => (
                  <div key={d.doctor_id} className={'card doc-card' + (pick?.doctor_id === d.doctor_id ? ' selected' : '')}>
                    <div className="rank">#{i + 1}</div>
                    <h3>{d.full_name}</h3>
                    <div className="spec">{d.specialization}</div>
                    <div className="meter"><span style={{ width: `${Math.max(0, d.similarity) * 100}%` }} /></div>
                    <div className="small muted">match {(d.similarity * 100).toFixed(1)}% · tomorrow’s load {d.load_pct}%</div>
                    <dl>
                      <dt>Branch</dt><dd>{d.branch}</dd>
                      <dt>Experience</dt><dd>{d.years_experience} yrs</dd>
                      <dt>Fee</dt><dd>{inr(d.consultation_fee)}</dd>
                    </dl>
                    <button className={pick?.doctor_id === d.doctor_id ? '' : 'secondary'} onClick={() => { setPick(d); setBooking(null); }}>
                      {pick?.doctor_id === d.doctor_id ? 'Selected' : 'Choose'}</button>
                  </div>
                ))}
              </div>
            </section>
            <aside className="side">
              <div className="card">
                <h4>Keyword search would find</h4>
                {result.keyword.length ? (
                  <ol>{result.keyword.map((k) => <li key={k.doctor_id}>{k.full_name} <span className="muted">({k.specialization})</span></li>)}</ol>
                ) : <p className="muted small">Nothing — none of your exact words appear in any doctor’s notes. This is why we use embeddings.</p>}
              </div>
              <div className="card">
                <h4>Patients with similar symptoms saw</h4>
                {result.similar_cases.length ? (
                  <ul>{result.similar_cases.map((s) => <li key={s.specialization}>{s.specialization} <span className="muted">· {s.cases} case{s.cases > 1 ? 's' : ''}</span></li>)}</ul>
                ) : <p className="muted small">No close past cases yet.</p>}
              </div>
            </aside>
          </div>
        </>
      )}

      {pick && (
        <div className="card booking">
          <h2>Book {pick.full_name}</h2>
          <div className="days">{nextDays().map((d) => (
            <button key={d} className={'chip' + (d === day ? ' on' : '')} onClick={() => setDay(d)}>{fmtDate(d)}</button>))}</div>
          {slots && <p className="small muted">Day load: {slots.load.booked + slots.load.completed}/{slots.load.capacity} patients ({slots.load.load_pct ?? 0}%)</p>}
          <div className="slots">
            {!slots ? <span className="muted">Loading slots…</span> :
              slots.slots.length === 0 ? <span className="muted">No free slots this day.</span> :
              slots.slots.map((s) => (
                <button key={s.slot_start} className={'slot' + (slot?.slot_start === s.slot_start ? ' on' : '')} onClick={() => setSlot(s)}>{fmtTime(s.slot_start)}</button>))}
          </div>
          {slot && (
            <div className="pay">
              <label>Payment method
                <select value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="upi">UPI</option><option value="card">Card</option><option value="cash">Cash at desk</option><option value="insurance">Insurance</option>
                </select></label>
              <label className="check"><input type="checkbox" checked={fail} onChange={(e) => setFail(e.target.checked)} /> Simulate payment failure (shows transaction rollback)</label>
              <button onClick={book}>Pay {inr(pick.consultation_fee)} & confirm {fmtTime(slot.slot_start)}</button>
            </div>
          )}
          {booking?.ok && <div className="alert success">Booked! Appointment #{booking.appointment.appt_id} on {fmtDate(booking.appointment.start_time)} at {fmtTime(booking.appointment.start_time)} · paid {inr(booking.payment.amount)} (ref {booking.payment.txn_ref}). <Link href="/patient/appointments">View my appointments →</Link></div>}
          {booking && !booking.ok && <div className="alert error">{booking.error}</div>}
        </div>
      )}
    </div>
  );
}
