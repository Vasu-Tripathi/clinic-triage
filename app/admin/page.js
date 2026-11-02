'use client';
import { useEffect, useState } from 'react';
import { api, inr } from '@/lib/client';

const Table = ({ rows, cols }) => (
  <table className="table compact">
    <thead><tr>{cols.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{cols.map(([k, , f]) => <td key={k}>{f ? f(r[k]) : r[k]}</td>)}</tr>)}
      {!rows.length && <tr><td colSpan={cols.length} className="muted">No rows</td></tr>}</tbody>
  </table>
);

export default function Dashboard() {
  const [d, setD] = useState(null); const [msg, setMsg] = useState('');
  const load = () => api('/api/admin/stats').then(setD).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);
  const refresh = async () => { await api('/api/admin/demand', { method: 'POST' }); load(); setMsg('Materialized view refreshed.'); };
  if (!d) return <div className="page muted">{msg || 'Loading…'}</div>;
  const k = d.kpi; const t = d.triageHit;
  return (
    <div className="page">
      <div className="page-head"><h1>Clinic dashboard</h1></div>
      {msg && <div className="alert success">{msg}</div>}
      <div className="kpis">
        <div className="kpi"><span>Patients</span><b>{k.patients}</b></div>
        <div className="kpi"><span>Doctors</span><b>{k.doctors}</b></div>
        <div className="kpi"><span>Today</span><b>{k.today}</b><small>{k.upcoming} upcoming</small></div>
        <div className="kpi"><span>Revenue (paid)</span><b>{inr(k.revenue)}</b></div>
        <div className="kpi"><span>AI triages</span><b>{k.triages}</b><small>{k.red_flags} red-flag</small></div>
        <div className="kpi"><span>Booked doctor in AI top-3</span><b>{t.booked_from_triage ? Math.round(100 * t.in_top3 / t.booked_from_triage) : 0}%</b><small>top-1: {t.top1}/{t.booked_from_triage}</small></div>
      </div>
      <div className="grid2 dash">
        <div className="card"><h3>Appointments by specialization <span className="tag">GROUP BY · HAVING</span></h3>
          <Table rows={d.bySpecialization} cols={[['specialization', 'Specialization'], ['appointments', 'Appts'], ['patients', 'Patients'], ['avg_fee', 'Avg fee', inr]]} /></div>
        <div className="card"><h3>Where AI triage routes patients <span className="tag">MATERIALIZED VIEW</span>
          <button className="ghost small" onClick={refresh}>Refresh</button></h3>
          <Table rows={d.demand} cols={[['specialization', 'Specialization'], ['top1_recommendations', 'Top-1 recs'], ['avg_similarity', 'Avg sim'], ['distinct_patients', 'Patients']]} /></div>
        <div className="card"><h3>Tomorrow’s doctor load <span className="tag">LATERAL · FUNCTION</span></h3>
          <Table rows={d.tomorrowLoad} cols={[['doctor', 'Doctor'], ['specialization', 'Specialization'], ['booked', 'Booked'], ['capacity', 'Cap.'], ['load_pct', 'Load %']]} /></div>
        <div className="card"><h3>Branch revenue by month <span className="tag">VIEW</span></h3>
          <Table rows={d.revenue} cols={[['branch', 'Branch'], ['month', 'Month', (m) => m.slice(0, 7)], ['appointments', 'Appts'], ['cancelled', 'Cancelled'], ['revenue', 'Revenue', inr]]} /></div>
        <div className="card"><h3>Doctors above their specialization’s average fee <span className="tag">CORRELATED SUBQUERY</span></h3>
          <Table rows={d.aboveAvgFee} cols={[['doctor', 'Doctor'], ['specialization', 'Specialization'], ['consultation_fee', 'Fee', inr], ['spec_avg', 'Spec avg', inr]]} /></div>
        <div className="card"><h3>Patients with no upcoming visit <span className="tag">NOT IN SUBQUERY</span></h3>
          <Table rows={d.noUpcoming} cols={[['full_name', 'Patient'], ['email', 'Email'], ['last_visit', 'Last visit']]} /></div>
      </div>
    </div>
  );
}
