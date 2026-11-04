import type { Dispatch, SetStateAction } from 'react';
import type { ApiState } from './AdminEntriesModel.js';

export function AdminEntryPagination({
  page,
  totalPages,
  apiState,
  clearSelection,
  setPage,
}: {
  page: number;
  totalPages: number;
  apiState: ApiState;
  clearSelection: () => void;
  setPage: Dispatch<SetStateAction<number>>;
}) {
  return (
    <nav className="admin-pagination" aria-label="Entry pages">
      <button
        type="button"
        disabled={page <= 1 || apiState === 'loading'}
        onClick={() => {
          clearSelection();
          setPage((value) => value - 1);
        }}
      >
        Previous
      </button>
      <span>
        Page {totalPages === 0 ? 0 : page} of {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages || apiState === 'loading'}
        onClick={() => {
          clearSelection();
          setPage((value) => value + 1);
        }}
      >
        Next
      </button>
    </nav>
  );
}
