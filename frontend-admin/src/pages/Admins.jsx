import React, { useState, useEffect } from 'react';
import { Lock, UserPlus, KeyRound } from 'lucide-react';
import { api, authHeaders, getRole } from '../api';
import { showToast } from '../components/Toast';
import PageHeader from '../ui/PageHeader';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Icon from '../ui/Icon';

function RoleBadge({ role }) {
  return role === 'super_admin' ? (
    <span style={{
      marginLeft: 8, fontSize: 11, fontWeight: 700,
      background: 'rgba(124,58,237,0.12)', color: '#7c3aed',
      padding: '2px 8px', borderRadius: 4, display: 'inline-block',
    }}>Super Admin</span>
  ) : (
    <span style={{
      marginLeft: 8, fontSize: 11, fontWeight: 600,
      background: 'var(--bg-dim,#f1f5f9)', color: 'var(--text-dim)',
      padding: '2px 8px', borderRadius: 4, display: 'inline-block',
    }}>Admin</span>
  );
}

const Admins = () => {
  const isSuperAdmin = getRole() === 'super_admin';

  // ── Admin list (super_admin only) ──
  const [admins, setAdmins]       = useState([]);
  const [loading, setLoading]     = useState(isSuperAdmin);
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting]   = useState(null);

  // ── Reset password (super_admin → admin) ──
  const [resetTarget, setResetTarget]       = useState(null);
  const [resetNewPw, setResetNewPw]         = useState('');
  const [resetConfirmPw, setResetConfirmPw] = useState('');
  const [resetting, setResetting]           = useState(false);

  // ── Change password ──
  const [oldPw, setOldPw]         = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  const fetchAdmins = async () => {
    try {
      const res = await api.get('/api/admin/admins', { headers: authHeaders() });
      setAdmins(res.data);
    } catch {
      showToast('Failed to load admin list.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) fetchAdmins();
  }, []);

  useEffect(() => {
    if (!resetTarget) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { setResetTarget(null); setResetNewPw(''); setResetConfirmPw(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resetTarget]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!username.trim() || username.trim().length < 3) {
      showToast('Username must be at least 3 characters long', 'warning'); return;
    }
    if (!password || password.length < 6) {
      showToast('Password must be at least 6 characters long', 'warning'); return;
    }
    if (confirmPassword !== password) {
      showToast('Passwords do not match', 'warning'); return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/admin/admins', { username: username.trim(), password }, { headers: authHeaders() });
      setUsername(''); setPassword(''); setConfirmPassword('');
      showToast('Account created successfully!', 'success');
      fetchAdmins();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to create account', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const openResetModal = (admin) => {
    setResetTarget(admin);
    setResetNewPw('');
    setResetConfirmPw('');
  };

  const closeResetModal = () => {
    setResetTarget(null);
    setResetNewPw('');
    setResetConfirmPw('');
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetNewPw || resetNewPw.length < 6) {
      showToast('New password must be at least 6 characters long', 'warning'); return;
    }
    if (resetNewPw !== resetConfirmPw) {
      showToast('Passwords do not match', 'warning'); return;
    }
    setResetting(true);
    try {
      await api.post(
        `/api/admin/admins/${resetTarget.id}/reset-password`,
        { new_password: resetNewPw },
        { headers: authHeaders() }
      );
      showToast(`Password reset for ${resetTarget.username}`, 'success');
      closeResetModal();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to reset password', 'error');
    } finally {
      setResetting(false);
    }
  };

  const handleDelete = async (id, name, isSelf, targetRole) => {
    if (isSelf) { showToast('Cannot delete the currently logged-in account', 'warning'); return; }
    if (targetRole === 'super_admin') { showToast('Cannot delete the Super Admin account.', 'warning'); return; }
    if (!window.confirm(`Are you sure you want to delete the account "${name}"?`)) return;
    setDeleting(id);
    try {
      await api.delete(`/api/admin/admins/${id}`, { headers: authHeaders() });
      showToast('Deleted account!', 'success');
      fetchAdmins();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to delete account', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!oldPw) { showToast('Please enter your current password', 'warning'); return; }
    if (newPw.length < 6) { showToast('New password must be at least 6 characters long', 'warning'); return; }
    if (newPw !== confirmPw) { showToast('Passwords do not match', 'warning'); return; }
    setChangingPw(true);
    try {
      await api.post(
        '/api/auth/change-password',
        { old_password: oldPw, new_password: newPw },
        { headers: authHeaders() }
      );
      setOldPw(''); setNewPw(''); setConfirmPw('');
      showToast('Password changed successfully!', 'success');
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error changing password', 'error');
    } finally {
      setChangingPw(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-dim)' }}>
          <span className="spinner"></span>
          <span>Loading admin list...</span>
        </div>
      </div>
    );
  }

  const changePasswordCard = (
    <div className="card">
      <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        <KeyRound size={20} strokeWidth={1.5} color="var(--accent)" />
        Change Password
      </h3>
      <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input
          label="Current Password" type="password"
          value={oldPw} onChange={e => setOldPw(e.target.value)}
          disabled={changingPw} autoComplete="current-password"
          placeholder="Enter current password"
        />
        <Input
          label="New Password" type="password"
          value={newPw} onChange={e => setNewPw(e.target.value)}
          disabled={changingPw} autoComplete="new-password"
          placeholder="At least 6 characters"
        />
        <Input
          label="Confirm New Password" type="password"
          value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
          disabled={changingPw} autoComplete="new-password"
          placeholder="Re-enter new password"
        />
        <Button type="submit" variant="primary" disabled={changingPw}
          style={{ padding: '12px 20px', display: 'flex', justifyContent: 'center', gap: 8 }}>
          {changingPw
            ? <><span className="spinner"></span>Changing...</>
            : <><KeyRound size={16} strokeWidth={1.5} />Change Password</>}
        </Button>
      </form>
    </div>
  );

  return (
    <div className="page">
      <PageHeader icon={Lock} title="Admin Account Management"
        subtitle={isSuperAdmin ? `${admins.length} accounts` : undefined} />

      {isSuperAdmin ? (
        <>
          {/* ── Row 1: 2-col grid ── */}
          <div className="account-cards-row">
            <div className="card">
              <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserPlus size={20} strokeWidth={1.5} color="var(--accent)" />
                Create Admin Account
              </h3>
              <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Input
                  label="Username" type="text"
                  value={username} onChange={e => setUsername(e.target.value)}
                  disabled={submitting} autoComplete="off"
                  placeholder="Enter username (3+ characters)"
                />
                <Input
                  label="Password" type="password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  disabled={submitting} autoComplete="new-password"
                  placeholder="Enter password (6+ characters)"
                />
                <Input
                  label="Confirm Password" type="password"
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  disabled={submitting} autoComplete="new-password"
                  placeholder="Re-enter password"
                />
                <Button type="submit" variant="primary" disabled={submitting}
                  style={{ padding: '12px 20px', display: 'flex', justifyContent: 'center', gap: 8 }}>
                  {submitting
                    ? <><span className="spinner"></span>Creating...</>
                    : <><UserPlus size={16} strokeWidth={1.5} />Create Account</>}
                </Button>
              </form>
            </div>

            {changePasswordCard}
          </div>

          {/* ── Row 2: full-width table ── */}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Username</th>
                  <th style={{ minWidth: 150 }}>Created Date</th>
                  <th className="center" style={{ minWidth: 120 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.length === 0 ? (
                  <tr>
                    <td colSpan="3" style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-dim)' }}>
                      <div className="empty-state">
                        <div className="empty-state-icon">🔒</div>
                        <div className="empty-state-title">No admin accounts found</div>
                        <div className="empty-state-text">Create an admin account using the form above</div>
                      </div>
                    </td>
                  </tr>
                ) : admins.map(a => {
                  const canDelete = !a.is_self && a.role !== 'super_admin';
                  return (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 700, color: 'var(--text)' }}>
                        {a.username}
                        <RoleBadge role={a.role} />
                        {a.is_self && (
                          <span style={{
                            marginLeft: 6, fontSize: 11, fontWeight: 700,
                            backgroundColor: 'var(--accent-light)', color: 'var(--accent)',
                            padding: '2px 8px', borderRadius: 4, display: 'inline-block',
                          }}>(You)</span>
                        )}
                      </td>
                      <td className="dim">{new Date(a.created_at).toLocaleDateString('en-US')}</td>
                      <td className="center action-cell">
                        {canDelete ? (
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <Button
                              variant="secondary"
                              onClick={() => openResetModal(a)}
                              className="action-btn"
                              style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            >
                              <KeyRound size={14} strokeWidth={1.5} />Reset Pass
                            </Button>
                            <Button
                              variant="danger" disabled={deleting === a.id}
                              onClick={() => handleDelete(a.id, a.username, a.is_self, a.role)}
                              className="action-btn"
                              style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            >
                              {deleting === a.id
                                ? <><span className="spinner" style={{ width: 14, height: 14 }}></span>Deleting</>
                                : <><Icon name="Trash2" size={14} />Delete</>}
                            </Button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div style={{
            marginBottom: 20, padding: '10px 16px',
            background: 'var(--bg-card,#fff)', border: '1px solid var(--border)',
            borderRadius: 8, fontSize: 13, color: 'var(--text-dim)',
          }}>
            You are logged in as: <strong style={{ color: 'var(--text)' }}>Admin</strong>
          </div>
          <div style={{ maxWidth: 500 }}>
            {changePasswordCard}
          </div>
        </>
      )}

      {resetTarget && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={closeResetModal}
        >
          <div
            className="card"
            style={{ width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', borderRadius: 'var(--radius, 12px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <KeyRound size={20} strokeWidth={1.5} color="var(--accent)" />
                Reset password for {resetTarget.username}
              </h3>
              <button
                onClick={closeResetModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 20, lineHeight: 1, padding: 4 }}
              >×</button>
            </div>
            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Input
                label="New Password" type="password"
                value={resetNewPw} onChange={e => setResetNewPw(e.target.value)}
                disabled={resetting} autoComplete="new-password"
                placeholder="At least 6 characters"
              />
              <Input
                label="Confirm New Password" type="password"
                value={resetConfirmPw} onChange={e => setResetConfirmPw(e.target.value)}
                disabled={resetting} autoComplete="new-password"
                placeholder="Re-enter new password"
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <Button type="submit" variant="primary" disabled={resetting}
                  style={{ flex: 1, padding: '11px 16px', display: 'flex', justifyContent: 'center', gap: 8 }}>
                  {resetting
                    ? <><span className="spinner"></span>Resetting...</>
                    : <><KeyRound size={15} strokeWidth={1.5} />Reset</>}
                </Button>
                <Button type="button" variant="secondary" disabled={resetting}
                  onClick={closeResetModal}
                  style={{ flex: 1, padding: '11px 16px', display: 'flex', justifyContent: 'center' }}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admins;