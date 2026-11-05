import React from 'react';
import { Button } from '../button/Button.js';
export function Pagination({
  page,
  pageCount,
  previousLabel,
  nextLabel,
  pageLabel,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  previousLabel: string;
  nextLabel: string;
  pageLabel: (page: number, count: number) => string;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav className="nb-pagination" aria-label={pageLabel(page, pageCount)}>
      <Button
        variant="secondary"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {previousLabel}
      </Button>
      <span aria-current="page">{pageLabel(page, pageCount)}</span>
      <Button
        variant="secondary"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        {nextLabel}
      </Button>
    </nav>
  );
}
