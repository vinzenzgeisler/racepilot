import React, { useEffect, useState } from 'react';

export function Toast({
  children,
  action,
  onAction,
  onDismiss,
  duration = 4000,
  dismissLabel,
}: {
  children: React.ReactNode;
  action?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  duration?: number;
  dismissLabel: string;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, duration);
    return () => window.clearTimeout(timer);
  }, [duration, onDismiss]);
  if (!visible) return null;
  return (
    <div className="nb-toast" role="status" aria-live="polite">
      {children}
      {action && (
        <button type="button" onClick={onAction}>
          {action}
        </button>
      )}
      <button
        type="button"
        aria-label={dismissLabel}
        onClick={() => {
          setVisible(false);
          onDismiss?.();
        }}
      >
        ×
      </button>
    </div>
  );
}
