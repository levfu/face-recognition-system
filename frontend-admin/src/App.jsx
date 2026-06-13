import React from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Users as UsersIcon, Plus, LogOut, Clock, Settings as SettingsIcon, Lock, LayoutDashboard, ScrollText } from 'lucide-react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Enrollment from './pages/Enrollment';
import Users from './pages/User';
import Settings from './pages/Settings';
import AccessLogs from './pages/AccessLogs';
import Admins from './pages/Admins';
import ActivityLogs from './pages/ActivityLogs';
import { Toast } from './components/Toast';
import HealthIndicator from './components/HealthIndicator';
import { getRole } from './api';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('adminToken');
  return token ? children : <Navigate to="/login" replace />;
}

function RequireSuperAdmin({ children }) {
  return getRole() === 'super_admin' ? children : <Navigate to="/dashboard" replace />;
}

function App() {
  const isLoggedIn = !!localStorage.getItem('adminToken');
  const isSuperAdmin = getRole() === 'super_admin';

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    window.location.href = '/login';
  };

  const navClass = ({ isActive }) =>
    isActive ? 'nav-link nav-link-active' : 'nav-link';

  return (
    <div>
      <Toast />
      {isLoggedIn && (
        <nav className="nav" role="navigation" aria-label="Main navigation">
          <NavLink to="/dashboard" className={navClass} title="Dashboard">
            <LayoutDashboard size={16} />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/users" className={navClass} title="Quản lý nhân sự">
            <UsersIcon size={16} />
            <span>Quản Lý Nhân Sự</span>
          </NavLink>
          <NavLink to="/enrollment" className={navClass} title="Đăng ký nhân viên mới">
            <Plus size={16} />
            <span>Đăng Ký Mới</span>
          </NavLink>
          <NavLink to="/logs" className={navClass} title="Lịch sử ra vào">
            <Clock size={16} />
            <span>Lịch sử</span>
          </NavLink>
          {isSuperAdmin && (
            <NavLink to="/settings" className={navClass} title="Cài đặt hệ thống">
              <SettingsIcon size={16} />
              <span>Cài Đặt</span>
            </NavLink>
          )}
          <NavLink to="/admins" className={navClass} title="Quản lý tài khoản">
            <Lock size={16} />
            <span>Tài Khoản</span>
          </NavLink>
          {isSuperAdmin && (
            <NavLink to="/activity-logs" className={navClass} title="Nhật ký hoạt động quản trị">
              <ScrollText size={16} strokeWidth={1.5} />
              <span>Nhật Ký</span>
            </NavLink>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <HealthIndicator />
            <button
              onClick={handleLogout}
              className="nav-logout"
              style={{ marginLeft: 0 }}
              aria-label="Đăng xuất khỏi hệ thống"
              title="Đăng xuất"
            >
              <LogOut size={16} />
              <span>Đăng Xuất</span>
            </button>
          </div>
        </nav>
      )}

      <Routes>
        <Route path="/"           element={<Login />} />
        <Route path="/login"      element={<Login />} />
        <Route path="/dashboard"  element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/enrollment" element={<ProtectedRoute><Enrollment /></ProtectedRoute>} />
        <Route path="/users"      element={<ProtectedRoute><Users /></ProtectedRoute>} />
        <Route path="/logs"       element={<ProtectedRoute><AccessLogs /></ProtectedRoute>} />
        <Route path="/settings"       element={<ProtectedRoute><RequireSuperAdmin><Settings /></RequireSuperAdmin></ProtectedRoute>} />
        <Route path="/admins"         element={<ProtectedRoute><Admins /></ProtectedRoute>} />
        <Route path="/activity-logs"  element={<ProtectedRoute><RequireSuperAdmin><ActivityLogs /></RequireSuperAdmin></ProtectedRoute>} />

      </Routes>
    </div>
  );
}

export default App;
