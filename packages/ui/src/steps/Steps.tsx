import React from 'react';
import { Signet } from '../brand/Signet.js';

export function Steps({
  steps,
  current,
  label,
  completedLabel,
  variant = 'default',
}: {
  steps: string[];
  current: number;
  label: string;
  completedLabel: string;
  variant?: 'default' | 'registration';
}) {
  return (
    <ol
      className={`nb-steps${variant === 'registration' ? ' is-registration' : ''}`}
      aria-label={label}
    >
      {steps.map((step, i) => (
        <li
          key={step}
          aria-current={i === current ? 'step' : undefined}
          className={i < current ? 'is-done' : ''}
        >
          {variant === 'registration' ? (
            <>
              <span className="nb-step-registration-mark" aria-hidden="true">
                {i < current ? '✓' : String(i + 1).padStart(2, '0')}
              </span>
              <span>{step}</span>
            </>
          ) : (
            <>
              <span className="nb-step-mark">
                <Signet className="nb-step-signet" />
                {i < current && (
                  <span className="nb-step-check" aria-label={completedLabel}>
                    ✓
                  </span>
                )}
              </span>
              <span>{step}</span>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}
