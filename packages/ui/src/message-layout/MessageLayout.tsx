import React from 'react';
export function MessageLayout({
  editor,
  aside,
  footer,
}: {
  editor: React.ReactNode;
  aside: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="nb-message-layout">
      <div className="nb-message-editor">{editor}</div>
      <aside className="nb-message-aside">{aside}</aside>
      {footer && <div className="nb-message-footer">{footer}</div>}
    </div>
  );
}
