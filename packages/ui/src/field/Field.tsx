import React, { useId } from 'react';

export function Field({
  label,
  error,
  hint,
  children,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const generatedId = useId();
  const id = props.id ?? `field-${generatedId}`;
  return (
    <label className="nb-field" htmlFor={id}>
      <span>{label}</span>
      <input
        {...props}
        id={id}
        aria-label={props['aria-label'] ?? label}
        aria-invalid={!!error || undefined}
        aria-describedby={
          error ? `${id}-error` : hint ? `${id}-hint` : undefined
        }
      />
      {hint && !error && <small id={`${id}-hint`}>{hint}</small>}
      {error && (
        <small className="nb-error" id={`${id}-error`}>
          {error}
        </small>
      )}
      {children}
    </label>
  );
}

export function SelectField({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const generatedId = useId();
  const id = props.id ?? `select-${generatedId}`;
  return (
    <label className="nb-field" htmlFor={id}>
      <span>{label}</span>
      <select {...props} id={id}>
        {children}
      </select>
    </label>
  );
}
