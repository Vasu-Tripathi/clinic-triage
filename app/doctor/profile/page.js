'use client';
import { useEffect, useState } from 'react';
import { api, inr } from '@/lib/client';

export default function Profile() {
  const [p, setP] = useState(null); const [notes, setNotes] = useState(''); const [msg, setMsg] = useState(null);
  useEffect(() => { api('/api/doctor/profile').then((d) => { setP(d); setNotes(d.specialization_notes); }); }, []);
  const save = async () => {
    try { const r = await api('/api/doctor/profile', { method: 'PUT', body: { specialization_notes: notes } });
      setP({ ...p, embedded_at: r.embedded_at }); setMsg({ t: 'success', m: 'Saved and re-embedded — triage now uses your updated notes.' }); }
    catch (e) { setMsg({ t: 'error', m: e.message }); }
  };
  if (!p) return <div className="page muted">Loading…</div>;
  return (
    <div className="page narrow">
      <div className="page-head"><h1>{p.full_name}</h1></div>
      <div className="card">
        <dl className="inline">
          <dt>Specialization</dt><dd>{p.specialization}</dd><dt>Branch</dt><dd>{p.branch}</dd>
          <dt>Experience</dt><dd>{p.years_experience} years</dd><dt>Fee</dt><dd>{inr(p.consultation_fee)}</dd>
          <dt>Slot length</dt><dd>{p.slot_minutes} min</dd>
          <dt>Embedding</dt><dd>{p.dims}-d vector · updated {p.embedded_at?.replace('T', ' ').slice(0, 16)}</dd>
        </dl>
        <label>Specialization notes <span className="muted small">— what conditions and symptoms you see, in patients’ words too. This text is embedded and drives AI triage.</span>
          <textarea rows={7} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {msg && <div className={'alert ' + msg.t}>{msg.m}</div>}
        <button onClick={save}>Save & re-embed</button>
      </div>
    </div>
  );
}
