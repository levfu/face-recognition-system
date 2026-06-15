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
      alert("Please log in to view this.");
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
      alert('Configuration saved successfully!');
    } catch (error) {
      alert('Error saving configuration.');
    }
  };

  return (
    <div className="page-sm">
      <PageHeader icon={SettingsIcon} title="System Configuration" />

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Threshold</span>
          <Tooltip text={"Similarity threshold to determine whether two faces belong to the same person.\n\n• Low: easier recognition, but more likely to misidentify strangers\n• High: stricter matching, but may miss valid employees\n\nRecommended range: 60–80%."} />
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
          Enable MiniFASNet liveness check.
          <Tooltip text="Use MiniFASNet to detect real vs spoof faces (printed photos/screens). Disable only for debugging." />
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>MiniFASNet liveness threshold</span>
            <Tooltip text={"Minimum anti-spoof score for real face acceptance (low 0.4–0.5 = easier but less secure, high 0.7–0.9 = stricter but may reject real users). Recommended: 0.55–0.65."} />
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
          Save setting
        </Button>
      </div>
    </div>
  );
};

export default Settings;
