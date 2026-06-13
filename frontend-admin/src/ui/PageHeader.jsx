import React from 'react';

export default function PageHeader({ icon: Icon, title, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
      {Icon && <Icon size={28} color="var(--accent)" strokeWidth={1.5} />}
      <div>
        <h2 className="page-title" style={{ marginBottom: 0 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>{subtitle}</p>}
      </div>
    </div>
  );
}
