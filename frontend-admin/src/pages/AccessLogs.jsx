import React, { useEffect, useState, useMemo } from 'react';
import { Clock } from 'lucide-react';
import { api, authHeaders } from '../api';
import PageHeader from '../ui/PageHeader';

const BADGE = {
  base: {
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 4,
    whiteSpace: 'nowrap',
    display: 'inline-block',
  },
};

function ActionBadge({ action }) {
  if (action === 'check_in') {
    return (
      <span style={{ ...BADGE.base, background: 'rgba(6,182,212,0.13)', color: '#0e7490' }}>
        Check-in
      </span>
    );
  }
  if (action === 'check_out') {
    return (
      <span style={{ ...BADGE.base, background: 'rgba(245,158,11,0.13)', color: '#b45309' }}>
        Check-out
      </span>
    );
  }
  return null;
}

function EmployeeStatusBadge({ isActive }) {
  return isActive === true ? (
    <span style={{ ...BADGE.base, background: 'rgba(16,185,129,0.12)', color: '#059669' }}>
      Active
    </span>
  ) : (
    <span style={{ ...BADGE.base, background: 'var(--bg-dim,#f1f5f9)', color: 'var(--text-dim)' }}>
      Inactive
    </span>
  );
}

const AccessLogs = () => {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);

  // Draft filters (bound to inputs while user is editing)
  const [draftFromDate, setDraftFromDate] = useState('');
  const [draftToDate, setDraftToDate]     = useState('');
  const [draftSearch, setDraftSearch]     = useState('');
  const [draftAction, setDraftAction]     = useState('all');

  // Applied filters (only updated on "Filter")
  const [appliedFromDate, setAppliedFromDate] = useState('');
  const [appliedToDate, setAppliedToDate]     = useState('');
  const [appliedSearch, setAppliedSearch]     = useState('');
  const [appliedAction, setAppliedAction]     = useState('all');

  const fetchLogs = async () => {
    try {
      const response = await api.get('/api/admin/logs?limit=200', {
        headers: authHeaders(),
      });
      setLogs(response.data);
    } catch (error) {
      console.error('Error loading logs', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const createdAt = new Date(log.created_at);

      if (appliedFromDate) {
        const from = new Date(appliedFromDate);
        from.setHours(0, 0, 0, 0);
        if (createdAt < from) return false;
      }
      if (appliedToDate) {
        const to = new Date(appliedToDate);
        to.setHours(23, 59, 59, 999);
        if (createdAt > to) return false;
      }
      if (appliedSearch.trim()) {
        const q = appliedSearch.trim().toLowerCase();
        const name = (log.employee_name || '').toLowerCase();
        const code = (log.employee_code || '').toLowerCase();
        if (!name.includes(q) && !code.includes(q)) return false;
      }
      if (appliedAction !== 'all') {
        const logAction = log.action || 'check_in';
        if (logAction !== appliedAction) return false;
      }

      return true;
    });
  }, [logs, appliedFromDate, appliedToDate, appliedSearch, appliedAction]);

  const handleApplyFilter = () => {
    setAppliedFromDate(draftFromDate);
    setAppliedToDate(draftToDate);
    setAppliedSearch(draftSearch);
    setAppliedAction(draftAction);
    fetchLogs();
  };

  const handleReset = () => {
    setDraftFromDate('');   setAppliedFromDate('');
    setDraftToDate('');     setAppliedToDate('');
    setDraftSearch('');     setAppliedSearch('');
    setDraftAction('all'); setAppliedAction('all');
  };

  const hasPendingChanges =
    draftFromDate !== appliedFromDate ||
    draftToDate   !== appliedToDate   ||
    draftSearch   !== appliedSearch   ||
    draftAction   !== appliedAction;

  if (loading) {
    return (
      <div className="page">
        <p style={{ color: 'var(--text-dim)' }}>Loading access logs...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        icon={Clock}
        title="Access Logs"
        subtitle={`${filteredLogs.length} / ${logs.length} records`}
      />

      {/* ── Filter bar ── */}
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
        {/* Date range */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>From date</label>
          <input className="input" type="date" value={draftFromDate} onChange={(e) => setDraftFromDate(e.target.value)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>To date</label>
          <input className="input" type="date" value={draftToDate} onChange={(e) => setDraftToDate(e.target.value)} />
        </div>

        {/* Name/code search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 180 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Search employee</label>
          <input
            className="input"
            type="text"
            placeholder="Enter name or employee code..."
            value={draftSearch}
            onChange={(e) => setDraftSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleApplyFilter(); }}
          />
        </div>

        {/* Action filter */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Action Type</label>
          <select
            className="input"
            style={{ cursor: 'pointer' }}
            value={draftAction}
            onChange={(e) => setDraftAction(e.target.value)}
          >
            <option value="all">All</option>
            <option value="check_in">Check-in</option>
            <option value="check_out">Check-out</option>
          </select>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignSelf: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleApplyFilter}>Filter</button>
            <button className="btn btn-secondary" onClick={handleReset}>Reset</button>
          </div>
          {hasPendingChanges && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'right' }}>
              Unapplied changes
            </span>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="table-wrap" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Employee</th>
              <th>Emp. Status</th>
              <th>Recognition</th>
              <th>Confidence</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan="6" className="center" style={{ padding: '32px', color: 'var(--text-dim)' }}>
                  {logs.length === 0 ? 'No records found.' : 'No records match the filter.'}
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {new Date(log.created_at).toLocaleString('en-US')}
                  </td>
                  <td style={{ fontWeight: 500 }}>
                    {log.recognized ? `${log.employee_code} — ${log.employee_name}` : '—'}
                  </td>
                  <td>
                    {log.recognized && <EmployeeStatusBadge isActive={log.is_active} />}
                  </td>
                  <td>
                    {log.recognized && (
                      <span style={{ ...BADGE.base, background: 'rgba(16,185,129,0.12)', color: '#059669' }}>
                        Success
                      </span>
                    )}
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {(Number(log.confidence) * 100).toFixed(1)}%
                  </td>
                  <td>
                    <ActionBadge action={log.action || 'check_in'} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AccessLogs;