import React, { useId } from 'react';
export type FileUploadProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> & { label: string; hint?: string; error?: string; selectedFileName?: string };
export function FileUpload({
  label,
  hint,
  error,
  selectedFileName,
  id,
  ...props
}: FileUploadProps) {
  const generated = useId();
  const inputId = id ?? `file-${generated}`;
  return (
    <div className="nb-file-upload">
      <label htmlFor={inputId}>{label}</label>
      <input
        {...props}
        id={inputId}
        type="file"
        aria-invalid={error ? true : undefined}
      />
      {selectedFileName && <span role="status">{selectedFileName}</span>}
      {hint && !error && <small>{hint}</small>}
      {error && <small className="nb-file-error">{error}</small>}
    </div>
  );
}
