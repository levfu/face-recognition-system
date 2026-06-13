import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, HelpCircle } from 'lucide-react';
import { api, authHeaders } from '../api';
import PageHeader from '../ui/PageHeader';
import Button from '../ui/Button';

function Tooltip({ text }) {
  const [on, setOn] = useState(false);
  return (
    <span className="tooltip-wrap"
      onMouseEnter={() => setOn(true)}
      onMouseLeave={() => setOn(false)}
    >
      <HelpCircle size={16} style={{ color: 'var(--text-dim)', cursor: 'help', display: 'block' }} />
      {on && <span className="tooltip-box" style={{ whiteSpace: 'pre-line' }}>{text}</span>}
    </span>
  );
}

function thresholdColor(val) {
  const v = parseFloat(val);
  if (v < 0.5)   return '#ef4444';
  if (v <= 0.65) return '#f59e0b';
  return '#10b981';
}

const Settings = () => {
  const [threshold,       setThreshold]       = useState(0.5);
  const [livenessEnabled, setLivenessEnabled] = useState(true);
  const [livenessScoreMin, setLivenessScoreMin] = useState(0.6);

  useEffect(() => {
    if (!localStorage.getItem('adminToken')) {
      alert("Hãy đăng nhập để có thể xem!");
      window.location.href = '/login';
      return;
    }

    api
      .get('/api/admin/settings', { headers: authHeaders() })
      .then((res) => {
        setThreshold(res.data.ai_threshold ?? 0.5);
        setLivenessEnabled(res.data.liveness_enabled ?? true);
        setLivenessScoreMin(res.data.liveness_score_min ?? 0.6);
      })
      .catch(() => null);
  }, []);

  const handleSave = async () => {
    try {
      await api.put(
        '/api/admin/settings',
        {
          ai_threshold:       parseFloat(threshold),
          liveness_enabled:   livenessEnabled,
          liveness_score_min: parseFloat(livenessScoreMin),
        },
        { headers: authHeaders() }
      );
      alert('Đã lưu cấu hình mới thành công!');
    } catch (error) {
      alert('Lỗi lưu cấu hình!');
    }
  };

  return (
    <div className="page-sm">
      <PageHeader icon={SettingsIcon} title="Cấu Hình Hệ Thống" />

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Ngưỡng nhận diện</span>
          <Tooltip text={"Mức tương đồng để coi 2 khuôn mặt là cùng người.\n\n• Thấp: dễ nhận, dễ nhầm người lạ\n• Cao: chặt chẽ, dễ bỏ sót nhân viên\n\nKhuyến nghị 60–80%."} />
          <span className="settings-value" style={{ color: thresholdColor(threshold), transition: 'color 0.15s' }}>{Math.round(parseFloat(threshold) * 100)}%</span>
        </div>

        <input
          className="settings-slider"
          type="range"
          min="0.1" max="1.0" step="0.05"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          style={{ '--thumb-color': thresholdColor(threshold) }}
        />

        <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={livenessEnabled}
            onChange={(e) => setLivenessEnabled(e.target.checked)}
          />
          Bật kiểm tra liveness (MiniFASNet)
          <Tooltip text="Dùng MiniFASNet để phân biệt mặt thật / ảnh in / màn hình. Tắt chỉ khi debug." />
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Ngưỡng điểm liveness (MiniFASNet)</span>
            <Tooltip text={"Điểm antispoof tối thiểu để coi là mặt thật.\n\n• Thấp (0.4–0.5): ít từ chối, dễ bị bypass\n• Cao (0.7–0.9): chặt, có thể từ chối mặt thật\n\nKhuyến nghị: 0.55–0.65."} />
            <span className="settings-value" style={{ color: thresholdColor(livenessScoreMin) }}>{Math.round(parseFloat(livenessScoreMin) * 100)}%</span>
          </div>
          <input
            className="settings-slider"
            type="range"
            min="0.3" max="0.9" step="0.05"
            value={livenessScoreMin}
            onChange={(e) => setLivenessScoreMin(e.target.value)}
            style={{ '--thumb-color': thresholdColor(livenessScoreMin) }}
          />
        </div>

        <Button variant="primary" onClick={handleSave} style={{ marginTop: 20, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Save size={16} />
          Lưu Cài Đặt
        </Button>
      </div>
    </div>
  );
};

export default Settings;
