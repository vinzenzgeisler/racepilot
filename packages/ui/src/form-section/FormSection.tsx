import React from 'react';
export function FormSection({
  title,
  description,
  children,
  variant = 'default',
  ...props
}: React.FieldsetHTMLAttributes<HTMLFieldSetElement> & {
  title: string;
  description?: string;
  variant?: 'default' | 'registration';
}) {
  return (
    <fieldset
      {...props}
      className={`nb-form-section${variant === 'registration' ? ' is-registration' : ''} ${props.className ?? ''}`}
    >
      <legend>{title}</legend>
      {description && <p>{description}</p>}
      <div>{children}</div>
    </fieldset>
  );
}
