import React from 'react';
export function FormSection({
  title,
  description,
  children,
  ...props
}: React.FieldsetHTMLAttributes<HTMLFieldSetElement> & {
  title: string;
  description?: string;
}) {
  return (
    <fieldset {...props} className={`nb-form-section ${props.className ?? ''}`}>
      <legend>{title}</legend>
      {description && <p>{description}</p>}
      <div>{children}</div>
    </fieldset>
  );
}
