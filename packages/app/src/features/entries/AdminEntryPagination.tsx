import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@racepilot/ui';
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
    <nav className="admin-pagination" aria-label="Nennungsseiten">
      <Button
        variant="secondary"
        size={40}
        type="button"
        disabled={page <= 1 || apiState === 'loading'}
        onClick={() => {
          clearSelection();
          setPage((value) => value - 1);
        }}
      >
        Zurück
      </Button>
      <span>
        Seite {totalPages === 0 ? 0 : page} von {totalPages}
      </span>
      <Button
        variant="secondary"
        size={40}
        type="button"
        disabled={page >= totalPages || apiState === 'loading'}
        onClick={() => {
          clearSelection();
          setPage((value) => value + 1);
        }}
      >
        Weiter
      </Button>
    </nav>
  );
}
