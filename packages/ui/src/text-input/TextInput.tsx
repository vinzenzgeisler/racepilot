import React, { useId } from 'react';
export type TextInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};
export function TextInput({
  label,
  hint,
  error,
  id,
  ...props
}: TextInputProps) {
  const generated = useId();
  const inputId = id ?? `text-${generated}`;
  const describedBy = error
    ? `${inputId}-error`
    : hint
      ? `${inputId}-hint`
      : undefined;
  return (
    <label className="nb-text-input" htmlFor={inputId}>
      <span>{label}</span>
      <input
        {...props}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {hint && !error && <small id={`${inputId}-hint`}>{hint}</small>}
      {error && (
        <small className="nb-field-error" id={`${inputId}-error`}>
          {error}
        </small>
      )}
    </label>
  );
}
