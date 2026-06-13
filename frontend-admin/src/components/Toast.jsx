import React, { useState, useCallback } from 'react';

let toastId = 0;
const toastSubscribers = [];

export const showToast = (message, type = 'success') => {
  const id = ++toastId;
  const toast = { id, message, type };
  
  toastSubscribers.forEach(callback => callback(toast));
  
  const timer = setTimeout(() => {
    removeToast(id);
  }, 4000);
  
  return () => {
    clearTimeout(timer);
    removeToast(id);
  };
};

const removeToast = (id) => {
  toastSubscribers.forEach(callback => callback({ id, remove: true }));
};

export const Toast = () => {
  const [toasts, setToasts] = useState([]);

  React.useEffect(() => {
    const handleToast = (toast) => {
      if (toast.remove) {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      } else {
        setToasts(prev => [...prev, toast]);
      }
    };

    toastSubscribers.push(handleToast);
    return () => {
      const idx = toastSubscribers.indexOf(handleToast);
      if (idx > -1) toastSubscribers.splice(idx, 1);
    };
  }, []);

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
  };

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <span>{icons[toast.type]}</span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
};
