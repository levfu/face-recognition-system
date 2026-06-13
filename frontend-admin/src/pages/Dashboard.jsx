import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Clock, TrendingUp, LayoutDashboard,
  ChevronLeft, ChevronRight, X, AlarmClock, UserX,
} from 'lucide-react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { api, authHeaders } from '../api';
import PageHeader from '../ui/PageHeader';

// ── helpers ───────────────────────────────────────────────────────────────────

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function getMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return toISO(d);
}

function fmt(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatTime(isoStr) {
  if (!isoStr) return '-';
  return isoStr.split('T')[1]?.slice(0, 5) ?? '-';
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 'var(--radius)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)', width: '100%', maxWidth: 580,
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px', borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{title}</span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dim)', padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

function StatusBadge({ isActive }) {
  return (isActive === true) ? (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(16,185,129,0.12)', color: '#059669', whiteSpace: 'nowrap' }}>
      Đang làm việc
    </span>
  ) : (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-dim,#f1f5f9)', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
      Đã nghỉ việc
    </span>
  );
}

// columns: [{ key, label, render?(value, row, idx) }]
function ModalTable({ columns, rows, emptyText, footer }) {
  if (rows === null) {
    return (
      <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>
        Đang tải...
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>
        {emptyText}
      </div>
    );
  }
  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{
                textAlign: 'left', padding: '10px 20px',
                color: 'var(--text-dim)', fontWeight: 600, fontSize: 12,
                borderBottom: '1px solid var(--border)', background: 'var(--bg)',
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              {columns.map((c) => (
                <td key={c.key} style={{ padding: '10px 20px', color: 'var(--text)' }}>
                  {c.render ? c.render(row[c.key], row, i) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {footer && (
        <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--text-dim)', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          {footer}
        </div>
      )}
    </>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

const COLOR_SCHEMES = {
  green: { icon: 'var(--accent)',  hover: 'var(--accent-light)', value: 'var(--text)' },
  amber: { icon: '#b45309',        hover: 'rgba(245,158,11,0.08)', value: '#b45309'  },
  red:   { icon: 'var(--danger)',  hover: 'var(--danger-light)',  value: 'var(--danger)' },
};

function StatCard({ icon: Icon, value, label, onClick, color }) {
  const scheme = COLOR_SCHEMES[color] || COLOR_SCHEMES.green;
  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'var(--transition)',
      }}
      onMouseEnter={onClick ? (e) => { e.currentTarget.style.background = scheme.hover; } : undefined}
      onMouseLeave={onClick ? (e) => { e.currentTarget.style.background = ''; } : undefined}
    >
      <Icon size={32} style={{ color: scheme.icon }} strokeWidth={1.75} />
      <div style={{ fontSize: 36, fontWeight: 700, color: scheme.value, lineHeight: 1 }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>{label}</div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

const TODAY = toISO(new Date());
const CURRENT_WEEK_START = getMonday(TODAY);
const MAX_WEEK_BACK = 4;

const Dashboard = () => {
  const navigate = useNavigate();

  const [totalEmployees, setTotalEmployees] = useState(null);
  const [selectedDate, setSelectedDate]     = useState(TODAY);
  const [chartData, setChartData]           = useState([]);
  const [chartLoading, setChartLoading]     = useState(false);

  // modal: date
  const [modalDateOpen, setModalDateOpen]           = useState(false);
  const [modalDateRows, setModalDateRows]           = useState(null);
  const [modalDateFetchedFor, setModalDateFetchedFor] = useState(null);

  // modal: week
  const [modalWeekOpen, setModalWeekOpen]           = useState(false);
  const [modalWeekRows, setModalWeekRows]           = useState(null);
  const [modalWeekFetchedFor, setModalWeekFetchedFor] = useState(null);

  // modal: late today
  const [showLateModal, setShowLateModal]   = useState(false);
  const [lateEmployees, setLateEmployees]   = useState(null);

  // modal: absent today
  const [showAbsentModal, setShowAbsentModal] = useState(false);
  const [absentEmployees, setAbsentEmployees] = useState(null);

  // derived
  const weekStart    = getMonday(selectedDate);
  const isCurrentWeek = weekStart === CURRENT_WEEK_START;
  const weekEnd      = addDays(weekStart, 6);
  const weeksBack    = Math.round(
    (new Date(CURRENT_WEEK_START) - new Date(weekStart)) / (7 * 86400000)
  );

  // fetch overview + late/absent on mount
  useEffect(() => {
    if (!localStorage.getItem('adminToken')) { window.location.href = '/login'; return; }
    const headers = { headers: authHeaders() };

    api.get('/api/admin/stats/overview', headers)
      .then((res) => setTotalEmployees(res.data.total_employees))
      .catch(() => setTotalEmployees('—'));

    api.get('/api/admin/stats/late-today', headers)
      .then((res) => setLateEmployees(Array.isArray(res.data) ? res.data : []))
      .catch(() => setLateEmployees([]));

    api.get('/api/admin/stats/absent-today', headers)
      .then((res) => setAbsentEmployees(Array.isArray(res.data) ? res.data : []))
      .catch(() => setAbsentEmployees([]));
  }, []);

  // fetch chart data when weekStart changes
  useEffect(() => {
    const start = weekStart;
    const end = addDays(weekStart, 6);
    setChartLoading(true);
    api
      .get(`/api/admin/stats/checkins-range?start_date=${start}&end_date=${end}`, {
        headers: authHeaders(),
      })
      .then((res) => {
        setChartData(
          res.data.map((d) => ({
            date: d.date,
            dateLabel: fmt(d.date),
            'Check-in': d.count,
          }))
        );
      })
      .catch(() => setChartData([]))
      .finally(() => setChartLoading(false));
  }, [weekStart]);

  // navigation
  const handlePrevWeek = () => {
    if (weeksBack >= MAX_WEEK_BACK) return;
    setSelectedDate(addDays(weekStart, -7 + 6));
  };
  const handleNextWeek = () => {
    if (isCurrentWeek) return;
    const nextStart = addDays(weekStart, 7);
    setSelectedDate(nextStart >= CURRENT_WEEK_START ? TODAY : addDays(nextStart, 6));
  };
  const handleBarClick = (data) => {
    if (data?.date) setSelectedDate(data.date);
  };

  // derived counts from chart
  const selectedDateCount = chartData.find((d) => d.date === selectedDate)?.['Check-in'] ?? 0;
  const weekTotalCount    = chartData.reduce((s, d) => s + (d['Check-in'] || 0), 0);

  const isToday        = selectedDate === TODAY;
  const dateCardLabel  = isToday ? 'Check-in hôm nay' : `Check-in ngày ${fmt(selectedDate)}`;
  const weekCardLabel  = isCurrentWeek
    ? 'Check-in tuần này'
    : `Check-in tuần ${fmt(weekStart)} - ${fmt(addDays(weekStart, 6))}`;

  const openDateModal = () => {
    setModalDateOpen(true);
    if (modalDateFetchedFor !== selectedDate) {
      setModalDateRows(null);
      setModalDateFetchedFor(selectedDate);
      api
        .get(`/api/admin/stats/checkins-by-date?date=${selectedDate}`, { headers: authHeaders() })
        .then((res) => setModalDateRows(res.data))
        .catch(() => setModalDateRows([]));
    }
  };

  const openWeekModal = () => {
    setModalWeekOpen(true);
    if (modalWeekFetchedFor !== weekStart) {
      setModalWeekRows(null);
      setModalWeekFetchedFor(weekStart);
      api
        .get(`/api/admin/stats/checkins-by-week?week_start=${weekStart}`, { headers: authHeaders() })
        .then((res) => setModalWeekRows(res.data))
        .catch(() => setModalWeekRows([]));
    }
  };

  const NavBtn = ({ disabled, onClick, icon }) => (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        background: 'none', border: '1px solid var(--border)', borderRadius: 6,
        padding: '2px 5px', cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center',
        color: disabled ? 'var(--border)' : 'var(--text-dim)',
        transition: 'var(--transition)',
      }}
    >
      {icon}
    </button>
  );

  if (totalEmployees === null) {
    return <div className="page"><p style={{ color: 'var(--text-dim)' }}>Đang tải dữ liệu...</p></div>;
  }

  const lateCount   = lateEmployees === null   ? null : lateEmployees.length;
  const absentCount = absentEmployees === null ? null : absentEmployees.length;

  return (
    <div className="page">
      <PageHeader icon={LayoutDashboard} title="Dashboard" subtitle="Tổng quan hệ thống" />

      {/* ── stat cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
        gap: 16,
        marginBottom: 20,
      }}>
        <StatCard
          icon={Users}
          value={totalEmployees}
          label="Tổng nhân viên"
          onClick={() => navigate('/users')}
        />
        <StatCard
          icon={Clock}
          value={selectedDateCount}
          label={dateCardLabel}
          onClick={openDateModal}
        />
        <StatCard
          icon={TrendingUp}
          value={weekTotalCount}
          label={weekCardLabel}
          onClick={openWeekModal}
        />
        <StatCard
          icon={AlarmClock}
          value={lateCount}
          label="Đi muộn hôm nay"
          color="amber"
          onClick={() => setShowLateModal(true)}
        />
        <StatCard
          icon={UserX}
          value={absentCount}
          label="Vắng mặt hôm nay"
          color="red"
          onClick={() => setShowAbsentModal(true)}
        />
      </div>

      {/* ── chart ── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>
            Check-in {fmt(weekStart)} - {fmt(weekEnd)}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <NavBtn disabled={weeksBack >= MAX_WEEK_BACK} onClick={handlePrevWeek} icon={<ChevronLeft size={16} />} />
            <NavBtn disabled={isCurrentWeek}               onClick={handleNextWeek} icon={<ChevronRight size={16} />} />
          </div>
        </div>

        {chartLoading ? (
          <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 14 }}>
            Đang tải...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 12, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                cursor={{ fill: 'rgba(16,185,129,0.07)' }}
              />
              <Bar dataKey="Check-in" radius={[4, 4, 0, 0]} maxBarSize={44} onClick={handleBarClick} style={{ cursor: 'pointer' }}>
                {chartData.map((entry) => (
                  <Cell key={entry.date} fill={entry.date === selectedDate ? 'var(--accent-dark)' : 'var(--accent)'} opacity={entry.date === selectedDate ? 1 : 0.5} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── modal: check-in by date ── */}
      {modalDateOpen && (
        <Modal
          title={`Đã điểm danh ${isToday ? 'hôm nay' : `ngày ${fmt(selectedDate)}`} (${modalDateRows ? modalDateRows.length : '...'})`}
          onClose={() => setModalDateOpen(false)}
        >
          <ModalTable
            columns={[
              { key: 'employee_code', label: 'Mã NV' },
              { key: 'employee_name', label: 'Tên NV', render: (val) => val ?? '—' },
              { key: 'checkin_time',  label: 'Giờ check-in' },
              { key: 'is_active',     label: 'Trạng thái', render: (val) => <StatusBadge isActive={val} /> },
            ]}
            rows={modalDateRows}
            emptyText="Chưa có ai điểm danh ngày này"
          />
        </Modal>
      )}

      {/* ── modal: check-in by week ── */}
      {modalWeekOpen && (
        <Modal
          title={`Check-in tuần ${fmt(weekStart)} - ${fmt(addDays(weekStart, 6))} theo nhân viên`}
          onClose={() => setModalWeekOpen(false)}
        >
          <ModalTable
            columns={[
              { key: 'employee_code', label: 'Mã NV' },
              { key: 'employee_name', label: 'Tên NV', render: (val) => val ?? '—' },
              { key: 'checkin_count', label: 'Số lần' },
              { key: 'is_active',     label: 'Trạng thái', render: (val) => <StatusBadge isActive={val} /> },
            ]}
            rows={modalWeekRows}
            emptyText="Chưa có check-in nào tuần này"
          />
        </Modal>
      )}

      {/* ── modal: late today ── */}
      {showLateModal && (
        <Modal
          title={`Đi muộn hôm nay (${lateEmployees ? lateEmployees.length : '...'})`}
          onClose={() => setShowLateModal(false)}
        >
          <ModalTable
            columns={[
              { key: 'id',            label: 'STT',           render: (_, __, i) => i + 1 },
              { key: 'employee_code', label: 'Mã NV' },
              { key: 'name',          label: 'Họ tên' },
              { key: 'check_in_time', label: 'Giờ check-in',  render: (v) => formatTime(v) },
              { key: 'status',        label: 'Trễ',           render: (v) => {
                const mins = v?.startsWith('late:') ? v.split(':')[1] : '?';
                return (
                  <span style={{ color: '#b45309', fontWeight: 700, fontSize: 13 }}>
                    +{mins}p
                  </span>
                );
              }},
            ]}
            rows={lateEmployees}
            emptyText="Không có ai đi muộn hôm nay"
          />
        </Modal>
      )}

      {/* ── modal: absent today ── */}
      {showAbsentModal && (
        <Modal
          title={`Vắng mặt hôm nay (${absentEmployees ? absentEmployees.length : '...'})`}
          onClose={() => setShowAbsentModal(false)}
        >
          <ModalTable
            columns={[
              { key: 'id',            label: 'STT',       render: (_, __, i) => i + 1 },
              { key: 'employee_code', label: 'Mã NV' },
              { key: 'name',          label: 'Họ tên' },
            ]}
            rows={absentEmployees}
            emptyText="Không có ai vắng mặt hôm nay"
            footer="Tính sau 17:00 — nhân viên không có check-in nào được ghi nhận trong ngày."
          />
        </Modal>
      )}
    </div>
  );
};

export default Dashboard;
