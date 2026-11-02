'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';

const diff = (o, n) => {
  if (!o) return n ? Object.entries(n).filter(([k]) => !['created_at', 'updated_at'].includes(k)).slice(0, 6).map(([k, v]) => `${k}=${v}`).join(', ') : '';
  if (!n) return 'deleted';
  return Object.keys(n).filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]) && k !== 'updated_at').map((k) => `${k}: ${o[k]} → ${n[k]}`).join(', ');
};

export default function Audit() {
  const [rows, setRows] = useState([]); const [table, setTable] = useState('');
  useEffect(() => { api('/api/admin/audit' + (table ? '?table=' + table : '')).then(setRows); }, [table]);
  return (
    <div className="page">
      <div className="page-head"><div><h1>Audit log</h1><p className="muted">Written only by the <code>trg_fn_audit</code> trigger — application roles have no INSERT privilege on this table.</p></div>
        <select value={table} onChange={(e) => setTable(e.target.value)}><option value="">All tables</option>{['appointments', 'payments', 'prescriptions', 'doctors'].map((t) => <option key={t}>{t}</option>)}</select></div>
      <table className="table">
        <thead><tr><th>#</th><th>When</th><th>Table</th><th>Op</th><th>Row</th><th>Actor</th><th>DB role</th><th>Change</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.log_id}><td>{r.log_id}</td><td>{r.logged_at.replace('T', ' ').slice(0, 19)}</td><td>{r.table_name}</td>
            <td><span className={'badge ' + r.operation.toLowerCase()}>{r.operation}</span></td><td>{r.row_pk}</td><td>{r.actor || '—'}</td><td>{r.db_role}</td>
            <td className="wrap small">{diff(r.old_data, r.new_data)}</td></tr>))}</tbody>
      </table>
    </div>
  );
}
