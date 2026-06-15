import React, { useEffect, useState, useMemo } from 'react';
import { ScrollText } from 'lucide-react';
import { api, authHeaders } from '../api';
import PageHeader from '../ui/PageHeader';

// Keep action map in one place for easy extension
export const ACTION_LABELS = {
  create_admin: 'Create admin account',
  delete_admin: 'Delete account',
  reset_password: 'Reset password',
  change_password: 'Change personal password',
  update_settings: 'Update settings',
};

function formatTarget(item) {
  if (item.target_type === 'admin') {
    return item.details?.username ?? item.target_id ?? '—';
  }
  if (item.action === 'change_password') return '(self)';
  if (item.action === 'update_settings') return 'System';
  return '—';
}

const FIELD_LABELS_VN = {
  ai_threshold: 'AI Threshold',
  liveness_enabled: 'Liveness Check',
};

const fmtFieldValue = (field, val) => {
  if (field === 'ai_threshold') return `${Math.round(Number(val) * 100)}%`;
  if (field === 'liveness_enabled') return val ? 'Enabled' : 'Disabled';
  return String(val);
};

function formatDetails(item) {
  const d = item.details;
  switch (item.action) {
    case 'create_admin':
      return `Account: ${d?.username ?? '—'}`;
    case 'delete_admin':
      return `Account: ${d?.username ?? '—'}`;
    case 'reset_password':
      return `Reset password for: ${d?.username ?? '—'}`;
    case 'change_password':
      return `Changed own password: ${item.actor_username ?? '—'}`;
    case 'update_settings': {
      if (!d?.changes) return '—';
      return Object.entries(d.changes)
        .map(([field, { old: o, new: n }]) => {
          const label = FIELD_LABELS_VN[field] ?? field;
          return `${label}: ${fmtFieldValue(field, o)} → ${fmtFieldValue(field, n)}`;
        })
        .join('; ');
    }
    default:
      return d ? JSON.stringify(d) : '—';
  }
}

const LABEL_STYLE = {
  fontSize: 12, fontWeight: 600, color: 'var(--text-dim)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
};

const ActivityLogs = () => {
  const [data, setData]       = useState({ total: 0, items: [] });
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');
  const [offset, setOffset]             = useState(0);
  const PAGE = 50;

  const fetchLogs = async (off = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: PAGE, offset: off });
      if (actionFilter) params.set('action', actionFilter);
      if (dateFrom)     params.set('date_from', dateFrom);
      if (dateTo)       params.set('date_to', dateTo);
      const res = await api.get(`/api/admin/activity-logs?${params}`, { headers: authHeaders() });
      setData(res.data);
      setOffset(off);
    } catch (err) {
      console.error('Error loading logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(0); }, []);

  const handleFilter = () => fetchLogs(0);

  const handleReset = () => {
    setActionFilter('');
    setDateFrom('');
    setDateTo('');
    // fetch after state flush via effect below
  };

  // re-fetch when filters reset to empty
  useEffect(() => {
    if (!actionFilter && !dateFrom && !dateTo) fetchLogs(0);
  }, [actionFilter, dateFrom, dateTo]);

  const totalPages = Math.ceil(data.total / PAGE);
  const currentPage = Math.floor(offset / PAGE) + 1;

  return (
    <div className="page">
      <PageHeader
        icon={ScrollText}
        title="Activity Logs"
        subtitle={`${data.total} activities recorded`}
      />

      {/* Filters */}
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={LABEL_STYLE}>Action Type</label>
          <select
            className="input"
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            style={{ minWidth: 200 }}
          >
            <option value="">All</option>
            {Object.entries(ACTION_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={LABEL_STYLE}>From date</label>
          <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={LABEL_STYLE}>To date</label>
          <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={handleFilter}>Filter</button>
        <button className="btn btn-secondary" onClick={handleReset}>Reset</button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-dim)' }}>Loading logs...</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ minWidth: 160 }}>Time</th>
                  <th style={{ minWidth: 140 }}>Actor</th>
                  <th style={{ minWidth: 200 }}>Action</th>
                  <th style={{ minWidth: 140 }}>Target</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="center" style={{ padding: '32px', color: 'var(--text-dim)' }}>
                      No activities found
                    </td>
                  </tr>
                ) : data.items.map(item => (
                  <tr key={item.id}>
                    <td className="dim">{new Date(item.created_at).toLocaleString('en-US')}</td>
                    <td style={{ fontWeight: 600 }}>{item.actor_username ?? <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Deleted</span>}</td>
                    <td>{ACTION_LABELS[item.action] ?? item.action}</td>
                    <td>{formatTarget(item)}</td>
                    <td style={{ fontSize: 13, color: 'var(--text-dim)' }}>{formatDetails(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
              <button
                className="btn btn-secondary"
                disabled={currentPage <= 1}
                onClick={() => fetchLogs(offset - PAGE)}
              >← Prev</button>
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                className="btn btn-secondary"
                disabled={currentPage >= totalPages}
                onClick={() => fetchLogs(offset + PAGE)}
              >Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ActivityLogs;