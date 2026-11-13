import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { EntryQuery } from './AdminEntriesModel.js';

export function useEntrySearch(
  draft: EntryQuery,
  setApplied: Dispatch<SetStateAction<EntryQuery>>,
  setPage: Dispatch<SetStateAction<number>>,
  clearSelection: () => void,
) {
  useEffect(() => {
    const timeout = window.setTimeout(
      () => {
        setPage(1);
        clearSelection();
        setApplied(draft);
      },
      draft.search ? 180 : 0,
    );
    return () => window.clearTimeout(timeout);
  }, [draft, clearSelection, setApplied, setPage]);
}
