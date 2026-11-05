import React, { useId } from 'react';
export type TextareaProps =
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    label: string;
    hint?: string;
    error?: string;
  };
export function Textarea({ label, hint, error, id, ...props }: TextareaProps) {
  const generated = useId();
  const controlId = id ?? `textarea-${generated}`;
  return (
    <label className="nb-textarea" htmlFor={controlId}>
      <span>{label}</span>
      <textarea
        {...props}
        id={controlId}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? `${controlId}-error` : hint ? `${controlId}-hint` : undefined
        }
      />
      {hint && !error && <small id={`${controlId}-hint`}>{hint}</small>}
      {error && (
        <small className="nb-textarea-error" id={`${controlId}-error`}>
          {error}
        </small>
      )}
    </label>
  );
}
