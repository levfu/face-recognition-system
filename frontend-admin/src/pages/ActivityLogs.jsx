import React, { useEffect, useState, useMemo } from 'react';
import { ScrollText } from 'lucide-react';
import { api, authHeaders } from '../api';
import PageHeader from '../ui/PageHeader';

// Keep action map in one place for easy extension
export const ACTION_LABELS = {
  create_admin: 'Tạo tài khoản quản lý',
  delete_admin: 'Xóa tài khoản',
  reset_password: 'Reset mật khẩu',
  change_password: 'Đổi mật khẩu cá nhân',
  update_settings: 'Cập nhật cài đặt',
};

function formatTarget(item) {
  if (item.target_type === 'admin') {
    return item.details?.username ?? item.target_id ?? '—';
  }
  if (item.action === 'change_password') return '(chính mình)';
  if (item.action === 'update_settings') return 'Hệ thống';
  return '—';
}

const FIELD_LABELS_VN = {
  ai_threshold: 'Ngưỡng nhận diện',
  liveness_enabled: 'Kiểm tra sống động',
};

const fmtFieldValue = (field, val) => {
  if (field === 'ai_threshold') return `${Math.round(Number(val) * 100)}%`;
  if (field === 'liveness_enabled') return val ? 'Bật' : 'Tắt';
  return String(val);
};

function formatDetails(item) {
  const d = item.details;
  switch (item.action) {
    case 'create_admin':
      return `Tài khoản: ${d?.username ?? '—'}`;
    case 'delete_admin':
      return `Tài khoản: ${d?.username ?? '—'}`;
    case 'reset_password':
      return `Reset mật khẩu cho: ${d?.username ?? '—'}`;
    case 'change_password':
      return `Tự đổi mật khẩu của: ${item.actor_username ?? '—'}`;
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
      console.error('Lỗi tải nhật ký', err);
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
        title="Nhật Ký Hoạt Động"
        subtitle={`${data.total} hoạt động được ghi nhận`}
      />

      {/* Filters */}
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={LABEL_STYLE}>Loại hành động</label>
          <select
            className="input"
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            style={{ minWidth: 200 }}
          >
            <option value="">Tất cả</option>
            {Object.entries(ACTION_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={LABEL_STYLE}>Từ ngày</label>
          <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={LABEL_STYLE}>Đến ngày</label>
          <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={handleFilter}>Lọc</button>
        <button className="btn btn-secondary" onClick={handleReset}>Đặt lại</button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-dim)' }}>Đang tải nhật ký...</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ minWidth: 160 }}>Thời gian</th>
                  <th style={{ minWidth: 140 }}>Người thao tác</th>
                  <th style={{ minWidth: 200 }}>Hành động</th>
                  <th style={{ minWidth: 140 }}>Đối tượng</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="center" style={{ padding: '32px', color: 'var(--text-dim)' }}>
                      Chưa có hoạt động nào
                    </td>
                  </tr>
                ) : data.items.map(item => (
                  <tr key={item.id}>
                    <td className="dim">{new Date(item.created_at).toLocaleString('vi-VN')}</td>
                    <td style={{ fontWeight: 600 }}>{item.actor_username ?? <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Đã xóa</span>}</td>
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
              >← Trước</button>
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                Trang {currentPage} / {totalPages}
              </span>
              <button
                className="btn btn-secondary"
                disabled={currentPage >= totalPages}
                onClick={() => fetchLogs(offset + PAGE)}
              >Tiếp →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ActivityLogs;
