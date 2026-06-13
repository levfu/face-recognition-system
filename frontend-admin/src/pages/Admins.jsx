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
      showToast('Không tải được danh sách admin', 'error');
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
      showToast('Tên đăng nhập tối thiểu 3 ký tự', 'warning'); return;
    }
    if (!password || password.length < 6) {
      showToast('Mật khẩu tối thiểu 6 ký tự', 'warning'); return;
    }
    if (confirmPassword !== password) {
      showToast('Mật khẩu xác nhận không khớp', 'warning'); return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/admin/admins', { username: username.trim(), password }, { headers: authHeaders() });
      setUsername(''); setPassword(''); setConfirmPassword('');
      showToast('Tạo tài khoản thành công!', 'success');
      fetchAdmins();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Lỗi khi tạo tài khoản', 'error');
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
      showToast('Mật khẩu mới tối thiểu 6 ký tự', 'warning'); return;
    }
    if (resetNewPw !== resetConfirmPw) {
      showToast('Mật khẩu xác nhận không khớp', 'warning'); return;
    }
    setResetting(true);
    try {
      await api.post(
        `/api/admin/admins/${resetTarget.id}/reset-password`,
        { new_password: resetNewPw },
        { headers: authHeaders() }
      );
      showToast(`Đã reset mật khẩu cho ${resetTarget.username}`, 'success');
      closeResetModal();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Lỗi khi reset mật khẩu', 'error');
    } finally {
      setResetting(false);
    }
  };

  const handleDelete = async (id, name, isSelf, targetRole) => {
    if (isSelf) { showToast('Không thể xóa tài khoản đang đăng nhập', 'warning'); return; }
    if (targetRole === 'super_admin') { showToast('Không thể xóa tài khoản Super Admin', 'warning'); return; }
    if (!window.confirm(`Bạn chắc chắn muốn xóa tài khoản "${name}"?`)) return;
    setDeleting(id);
    try {
      await api.delete(`/api/admin/admins/${id}`, { headers: authHeaders() });
      showToast('Xóa tài khoản thành công!', 'success');
      fetchAdmins();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Lỗi khi xóa tài khoản', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!oldPw) { showToast('Vui lòng nhập mật khẩu hiện tại', 'warning'); return; }
    if (newPw.length < 6) { showToast('Mật khẩu mới tối thiểu 6 ký tự', 'warning'); return; }
    if (newPw !== confirmPw) { showToast('Mật khẩu xác nhận không khớp', 'warning'); return; }
    setChangingPw(true);
    try {
      await api.post(
        '/api/auth/change-password',
        { old_password: oldPw, new_password: newPw },
        { headers: authHeaders() }
      );
      setOldPw(''); setNewPw(''); setConfirmPw('');
      showToast('Đổi mật khẩu thành công!', 'success');
    } catch (err) {
      showToast(err.response?.data?.detail || 'Lỗi khi đổi mật khẩu', 'error');
    } finally {
      setChangingPw(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-dim)' }}>
          <span className="spinner"></span>
          <span>Đang tải danh sách admin...</span>
        </div>
      </div>
    );
  }

  const changePasswordCard = (
    <div className="card">
      <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        <KeyRound size={20} strokeWidth={1.5} color="var(--accent)" />
        Đổi Mật Khẩu
      </h3>
      <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input
          label="Mật khẩu hiện tại" type="password"
          value={oldPw} onChange={e => setOldPw(e.target.value)}
          disabled={changingPw} autoComplete="current-password"
          placeholder="Nhập mật khẩu hiện tại"
        />
        <Input
          label="Mật khẩu mới" type="password"
          value={newPw} onChange={e => setNewPw(e.target.value)}
          disabled={changingPw} autoComplete="new-password"
          placeholder="Tối thiểu 6 ký tự"
        />
        <Input
          label="Xác nhận mật khẩu mới" type="password"
          value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
          disabled={changingPw} autoComplete="new-password"
          placeholder="Nhập lại mật khẩu mới"
        />
        <Button type="submit" variant="primary" disabled={changingPw}
          style={{ padding: '12px 20px', display: 'flex', justifyContent: 'center', gap: 8 }}>
          {changingPw
            ? <><span className="spinner"></span>Đang đổi...</>
            : <><KeyRound size={16} strokeWidth={1.5} />Đổi Mật Khẩu</>}
        </Button>
      </form>
    </div>
  );

  return (
    <div className="page">
      <PageHeader icon={Lock} title="Quản Lý Tài Khoản Admin"
        subtitle={isSuperAdmin ? `${admins.length} tài khoản` : undefined} />

      {isSuperAdmin ? (
        <>
          {/* ── Row 1: 2-col grid ── */}
          <div className="account-cards-row">
            <div className="card">
              <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserPlus size={20} strokeWidth={1.5} color="var(--accent)" />
                Tạo Tài Khoản Quản Lý
              </h3>
              <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Input
                  label="Tên Đăng Nhập" type="text"
                  value={username} onChange={e => setUsername(e.target.value)}
                  disabled={submitting} autoComplete="off"
                  placeholder="Nhập tên đăng nhập (3+ ký tự)"
                />
                <Input
                  label="Mật Khẩu" type="password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  disabled={submitting} autoComplete="new-password"
                  placeholder="Nhập mật khẩu (6+ ký tự)"
                />
                <Input
                  label="Xác Nhận Mật Khẩu" type="password"
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  disabled={submitting} autoComplete="new-password"
                  placeholder="Nhập lại mật khẩu"
                />
                <Button type="submit" variant="primary" disabled={submitting}
                  style={{ padding: '12px 20px', display: 'flex', justifyContent: 'center', gap: 8 }}>
                  {submitting
                    ? <><span className="spinner"></span>Đang tạo...</>
                    : <><UserPlus size={16} strokeWidth={1.5} />Tạo Tài Khoản</>}
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
                  <th style={{ minWidth: 200 }}>Tên Đăng Nhập</th>
                  <th style={{ minWidth: 150 }}>Ngày Tạo</th>
                  <th className="center" style={{ minWidth: 120 }}>Hành Động</th>
                </tr>
              </thead>
              <tbody>
                {admins.length === 0 ? (
                  <tr>
                    <td colSpan="3" style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-dim)' }}>
                      <div className="empty-state">
                        <div className="empty-state-icon">🔒</div>
                        <div className="empty-state-title">Chưa có tài khoản admin</div>
                        <div className="empty-state-text">Tạo tài khoản quản lý bằng form ở trên</div>
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
                          }}>(Bạn)</span>
                        )}
                      </td>
                      <td className="dim">{new Date(a.created_at).toLocaleDateString('vi-VN')}</td>
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
                                ? <><span className="spinner" style={{ width: 14, height: 14 }}></span>Đang xóa</>
                                : <><Icon name="Trash2" size={14} />Xóa</>}
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
            Bạn đang đăng nhập với quyền: <strong style={{ color: 'var(--text)' }}>Admin</strong>
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
                Reset mật khẩu cho {resetTarget.username}
              </h3>
              <button
                onClick={closeResetModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 20, lineHeight: 1, padding: 4 }}
              >×</button>
            </div>
            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Input
                label="Mật khẩu mới" type="password"
                value={resetNewPw} onChange={e => setResetNewPw(e.target.value)}
                disabled={resetting} autoComplete="new-password"
                placeholder="Tối thiểu 6 ký tự"
              />
              <Input
                label="Xác nhận mật khẩu mới" type="password"
                value={resetConfirmPw} onChange={e => setResetConfirmPw(e.target.value)}
                disabled={resetting} autoComplete="new-password"
                placeholder="Nhập lại mật khẩu mới"
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <Button type="submit" variant="primary" disabled={resetting}
                  style={{ flex: 1, padding: '11px 16px', display: 'flex', justifyContent: 'center', gap: 8 }}>
                  {resetting
                    ? <><span className="spinner"></span>Đang reset...</>
                    : <><KeyRound size={15} strokeWidth={1.5} />Reset</>}
                </Button>
                <Button type="button" variant="secondary" disabled={resetting}
                  onClick={closeResetModal}
                  style={{ flex: 1, padding: '11px 16px', display: 'flex', justifyContent: 'center' }}>
                  Hủy
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
