import React, { useState, useEffect } from 'react';
import { Users as UsersIcon } from 'lucide-react';
import { api, authHeaders } from '../api';
import { showToast } from '../components/Toast';
import Icon from '../ui/Icon';
import Button from '../ui/Button';
import PageHeader from '../ui/PageHeader';

function formatTime(isoStr) {
  if (!isoStr) return '-';
  return isoStr.split('T')[1]?.slice(0, 5) ?? '-';
}

function formatWorkTime(minutes) {
  if (minutes === null || minutes === undefined) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}p`;
  return `${h}h ${m > 0 ? ` ${m}p` : ''}`.trim();
}

const BADGE = {
  base: {
    padding: '3px 10px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    display: 'inline-block',
  },
};

function StatusBadge({ status }) {
  if (status === 'on_time') {
    return (
      <span style={{ ...BADGE.base, background: 'rgba(16,185,129,0.13)', color: '#059669' }}>
        On Time
      </span>
    );
  }
  if (status?.startsWith('late:')) {
    const minutes = status.split(':')[1];
    return (
      <span style={{ ...BADGE.base, background: 'rgba(245,158,11,0.13)', color: '#b45309' }}>
        Late {minutes}p
      </span>
    );
  }
  if (status === 'absent') {
    return (
      <span style={{ ...BADGE.base, background: 'rgba(239,68,68,0.13)', color: '#dc2626' }}>
        Absent
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span style={{ ...BADGE.base, background: 'rgba(100,116,139,0.13)', color: '#64748b' }}>
        Not check in yet
      </span>
    );
  }
  return null;
}

function WorkCell({ checkInTime, checkOutTime, workMinutes }) {
  if (workMinutes !== null && workMinutes !== undefined) {
    return (
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
        {formatWorkTime(workMinutes)}
      </span>
    );
  }
  if (checkInTime && !checkOutTime) {
    return (
      <span style={{
        ...BADGE.base,
        background: 'rgba(59,130,246,0.13)',
        color: '#2563eb',
        fontSize: 11,
      }}>
        Still working
      </span>
    );
  }
  return <span style={{ color: 'var(--text-dim)' }}>-</span>;
}

const Users = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [targetDate, setTargetDate] = useState(
    () => new Date().toISOString().split('T')[0]
  );

  const fetchUsers = async (date) => {
    setLoading(true);
    try {
      const response = await api.get(
        `/api/admin/employees/with-status?target_date=${date}`,
        { headers: authHeaders() }
      );
      setUsers(response.data);
    } catch {
      showToast('Failed to load employee list.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(targetDate);
  }, [targetDate]);

  const handleDelete = async (id, name) => {
    if (!window.confirm(
      `Are you sure you want to delete "${name}"?\n\nThis will permanently remove all recognition data associated with this employee.`
    )) return;

    setDeleting(id);
    try {
      await api.delete(`/api/admin/employees/${id}`, { headers: authHeaders() });
      showToast(`Xóa "${name}" success!`, 'success');
      fetchUsers(targetDate);
    } catch (error) {
      const msg = error.response?.data?.detail || 'Error while deleting';
      showToast(msg, 'error');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <PageHeader icon={UsersIcon} title="Employee Management" />
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          color: 'var(--text-dim)', padding: '40px 16px', justifyContent: 'center',
        }}>
          <span className="spinner"></span>
          <span>Loading employee list...</span>
        </div>
      </div>
    );
  }

  const onTimeCount  = users.filter(u => u.status === 'on_time').length;
  const lateCount    = users.filter(u => u.status?.startsWith('late:')).length;
  const absentCount  = users.filter(u => u.status === 'absent').length;
  const pendingCount = users.filter(u => u.status === 'pending').length;

  return (
    <div className="page">
      <PageHeader
        icon={UsersIcon}
        title="Employee Management"
        subtitle={`${users.length} employees`}
      />

      {/* Toolbar: date picker + summary chips */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 18, flexWrap: 'wrap',
      }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
          Select date:
        </label>
        <input
          type="date"
          className="input"
          style={{ width: 'auto', maxWidth: 180 }}
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      </div>

      <div className="table-wrap" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 44, textAlign: 'center' }}>No.</th>
              <th style={{ minWidth: 90 }}>Employee ID</th>
              <th style={{ minWidth: 160 }}>Employee Name</th>
              <th style={{ minWidth: 80 }} className="center">Check-in</th>
              <th style={{ minWidth: 80 }} className="center">Check-out</th>
              <th style={{ minWidth: 120 }} className="center">Working Hours</th>
              <th style={{ minWidth: 140 }}>Status</th>
              <th className="center" style={{ minWidth: 90 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: '40px 16px' }}>
                  <div className="empty-state">
                    <div className="empty-state-icon">👤</div>
                    <div className="empty-state-title">No employees yet.</div>
                    <div className="empty-state-text">
                      Get started by registering a new employee on the Registration page.
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              users.map((user, idx) => (
                <tr key={user.id}>
                  <td className="dim" style={{ textAlign: 'center' }}>{idx + 1}</td>
                  <td style={{ fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                    {user.employee_code}
                  </td>
                  <td style={{ fontWeight: 600 }}>{user.name}</td>
                  <td className="center" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {formatTime(user.check_in_time)}
                  </td>
                  <td className="center" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {formatTime(user.check_out_time)}
                  </td>
                  <td className="center">
                    <WorkCell
                      checkInTime={user.check_in_time}
                      checkOutTime={user.check_out_time}
                      workMinutes={user.work_minutes}
                    />
                  </td>
                  <td>
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="center action-cell">
                    <Button
                      variant="danger"
                      disabled={deleting === user.id}
                      onClick={() => handleDelete(user.id, user.name)}
                      className="action-btn"
                      style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                    >
                      {deleting === user.id ? (
                        <>
                          <span className="spinner" style={{ width: 14, height: 14 }}></span>
                          Đang xóa
                        </>
                      ) : (
                        <>
                          <Icon name="Trash2" size={14} /> Xóa
                        </>
                      )}
                    </Button>
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

export default Users;
