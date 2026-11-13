import type { ReactNode } from 'react';
/** One repeatable entry inside a form section, such as a document type; the label names it for assistive tech. */
export function FormItem({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="nb-form-item">
      {children}
    </div>
  );
}
