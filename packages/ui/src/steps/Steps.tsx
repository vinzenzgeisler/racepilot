import React from 'react';
import { Signet } from '../brand/Signet.js';

export function Steps({
  steps,
  current,
  label,
  completedLabel,
}: {
  steps: string[];
  current: number;
  label: string;
  completedLabel: string;
}) {
  return (
    <ol className="nb-steps" aria-label={label}>
      {steps.map((step, i) => (
        <li
          key={step}
          aria-current={i === current ? 'step' : undefined}
          className={i < current ? 'is-done' : ''}
        >
          <span className="nb-step-mark">
            <Signet className="nb-step-signet" />
            {i < current && (
              <span className="nb-step-check" aria-label={completedLabel}>
                ✓
              </span>
            )}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}
