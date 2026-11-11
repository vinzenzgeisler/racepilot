import { useCallback, useEffect, useRef } from 'react';
import type { EntryResponse as Entry } from '@racepilot/contracts';

/** Loads a row first, then opens its detail after the selected record is ready. */
export function useOpenEntryDetail(
  selected: Entry | null,
  openEntry: (id: string) => Promise<void>,
  openDetail: () => void,
) {
  const pendingId = useRef<string | null>(null);
  useEffect(() => {
    if (pendingId.current && selected?.id === pendingId.current) {
      pendingId.current = null;
      openDetail();
    }
  }, [selected, openDetail]);
  return useCallback(
    async (id: string) => {
      pendingId.current = id;
      await openEntry(id);
    },
    [openEntry],
  );
}
