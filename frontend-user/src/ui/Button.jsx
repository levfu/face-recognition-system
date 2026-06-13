import React from 'react';

export default function Button({ children, variant = 'primary', ...props }) {
  const cls = `btn ${variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : 'btn-secondary'}`;
  return (
    <button className={cls} {...props}>
      {children}
    </button>
  );
}
