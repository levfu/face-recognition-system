import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const STATUS_CONFIG = {
  ok:      { color: '#10b981', label: 'Operational' },
  degraded:{ color: '#f59e0b', label: 'Degraded Performance' },
  down:    { color: '#ef4444', label: 'Major Outage' },
  loading: { color: '#94a3b8', label: 'Checking...' },
};

const COMPONENT_LABELS = {
  database: 'Database',
  qdrant:   'Qdrant',
  redis:    'Redis',
  minio:    'MinIO',
};

const TOOLTIP_WIDTH = 220;

export default function HealthIndicator() {
  const [health, setHealth]       = useState(null);
  const [rect, setRect]           = useState(null);
  const anchorRef                 = useRef(null);

  useEffect(() => {
    let mounted = true;

    const fetchHealth = async () => {
      console.log('[health] poll', new Date().toLocaleTimeString());
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        if (mounted) setHealth(data);
      } catch {
        if (mounted) setHealth({ status: 'down', components: {} });
      }
    };

    fetchHealth();
    const id = setInterval(fetchHealth, 1_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const handleMouseEnter = () => {
    if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect());
  };
  const handleMouseLeave = () => setRect(null);

  const status     = health?.status ?? 'loading';
  const cfg        = STATUS_CONFIG[status] ?? STATUS_CONFIG.loading;
  const components = health?.components ?? {};

  const tooltip = rect && createPortal(
    <div
      style={{
        position:     'fixed',
        top:          rect.bottom + 8,
        left:         Math.max(8, rect.right - TOOLTIP_WIDTH),
        width:        TOOLTIP_WIDTH,
        zIndex:       9999,
        background:   '#1e293b',
        color:        '#f1f5f9',
        fontSize:     12,
        lineHeight:   1.6,
        padding:      '10px 14px',
        borderRadius: 8,
        boxShadow:    '0 8px 24px rgba(0,0,0,0.22)',
        pointerEvents:'none',
      }}
    >
      {Object.keys(COMPONENT_LABELS).map((key) => {
        const val = components[key];
        const isOk = val === 'ok';
        const isUnknown = val === undefined;
        return (
          <div
            key={key}
            style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}
          >
            <span>{COMPONENT_LABELS[key]}</span>
            <span style={{
              color:      isUnknown ? '#94a3b8' : isOk ? '#34d399' : '#f87171',
              fontWeight: 600,
            }}>
              {isUnknown ? '…' : isOk ? '✓ Operational' : '✗ Outage'}
            </span>
          </div>
        );
      })}
    </div>,
    document.body,
  );

  return (
    <>
      <div
        ref={anchorRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', cursor: 'default', flexShrink: 0 }}
      >
        <span
          style={{
            width:        8,
            height:       8,
            borderRadius: '50%',
            background:   cfg.color,
            flexShrink:   0,
            boxShadow:    status !== 'loading' ? `0 0 0 3px ${cfg.color}33` : 'none',
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color, whiteSpace: 'nowrap' }}>
          {cfg.label}
        </span>
      </div>
      {tooltip}
    </>
  );
}