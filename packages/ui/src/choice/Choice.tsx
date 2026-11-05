import React from 'react';

export function Checkbox({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="nb-choice">
      <input {...props} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}

export function Radio({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="nb-choice">
      <input {...props} type="radio" />
      <span>{label}</span>
    </label>
  );
}

export function Switch({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="nb-choice nb-switch">
      <input {...props} type="checkbox" role="switch" />
      <span>{label}</span>
    </label>
  );
}
