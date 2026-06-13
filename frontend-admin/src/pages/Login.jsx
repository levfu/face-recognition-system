import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Eye, EyeOff, ScanFace } from 'lucide-react';
import { api } from '../api';
import { showToast } from '../components/Toast';
import Input from '../ui/Input';
import Button from '../ui/Button';

function HealthIndicator() {
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const check = async () => {
      try {
        const res = await api.get('/api/health');
        setStatus(res.data?.status ?? 'ok');
      } catch {
        setStatus('down');
      }
    };
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, []);

  if (status === 'loading') return null;

  const cfg = {
    ok:       { color: '#10b981', text: 'Hệ thống đang hoạt động' },
    degraded: { color: '#f59e0b', text: 'Một số dịch vụ gặp sự cố' },
  }[status] ?? { color: '#ef4444', text: 'Hệ thống gặp sự cố — vui lòng liên hệ admin' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: cfg.color }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0, display: 'inline-block' }} />
      {cfg.text}
    </div>
  );
}

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem('adminToken')) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!showForgot) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowForgot(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showForgot]);

  const handleLogin = async (e) => {
    e.preventDefault();

    const newErrors = { username: '', password: '' };
    if (!username.trim()) newErrors.username = 'Vui lòng nhập tên đăng nhập';
    if (!password)        newErrors.password = 'Vui lòng nhập mật khẩu';
    if (newErrors.username || newErrors.password) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('username', username.trim());
    formData.append('password', password);

    try {
      const res = await api.post('/api/auth/login', formData);
      localStorage.setItem('adminToken', res.data.access_token);
      localStorage.setItem('adminRole', res.data.role ?? 'admin');
      localStorage.setItem('adminUsername', res.data.username ?? '');
      showToast('Đăng nhập thành công!', 'success');
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 300);
    } catch (error) {
      const msg = error.response?.data?.detail || 'Lỗi kết nối, vui lòng thử lại';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-root">
      <header className="login-brand">
        <ScanFace size={56} color="var(--accent)" strokeWidth={1.5} />
        <h1 className="brand-title">Hệ Thống Chấm Công Khuôn Mặt</h1>
        <p className="brand-subtitle">Quản lý nhân viên và theo dõi điểm danh</p>
      </header>

      <div className="login-card">
        <h2 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 700, textAlign: 'center', color: 'var(--text)' }}>
          Đăng nhập
        </h2>
        <form onSubmit={handleLogin} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <Input
              label="Tài Khoản"
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); if (errors.username) setErrors(prev => ({ ...prev, username: '' })); }}
              disabled={loading}
              autoFocus
              autoComplete="username"
              placeholder="Nhập tên đăng nhập"
              style={errors.username ? { borderColor: 'var(--danger)' } : {}}
            />
            {errors.username && (
              <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 4, marginBottom: 0 }}>
                {errors.username}
              </p>
            )}
          </div>
          <div>
            <div className="form-group">
              <label className="label">Mật Khẩu</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); if (errors.password) setErrors(prev => ({ ...prev, password: '' })); }}
                  disabled={loading}
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu"
                  style={{ paddingRight: 44, ...(errors.password ? { borderColor: 'var(--danger)' } : {}) }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  tabIndex={-1}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-dim)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 4,
                    lineHeight: 1,
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {errors.password && (
              <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 4, marginBottom: 0 }}>
                {errors.password}
              </p>
            )}
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={loading}
            style={{ marginTop: 8, padding: '12px 20px', fontSize: 15, display: 'flex', justifyContent: 'center', gap: 8, transition: 'background-color 0.15s ease' }}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Đang đăng nhập...
              </>
            ) : (
              <>
                <LogIn size={16} />
                Đăng Nhập
              </>
            )}
          </Button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button
            type="button"
            onClick={() => setShowForgot(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 13, textDecoration: 'underline', padding: 0 }}
          >
            Quên mật khẩu?
          </button>
        </div>
      </div>

      <HealthIndicator />

      {showForgot && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowForgot(false)}
        >
          <div
            className="card"
            style={{ width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', borderRadius: 'var(--radius, 12px)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>Quên mật khẩu?</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              Vui lòng liên hệ Super Admin để được reset mật khẩu. Hãy cung cấp tên đăng nhập của bạn.
            </p>
            <Button
              type="button" variant="primary"
              onClick={() => setShowForgot(false)}
              style={{ width: '100%', padding: '11px 16px', display: 'flex', justifyContent: 'center' }}
            >
              Đã hiểu
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
