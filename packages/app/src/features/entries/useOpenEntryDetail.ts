import { useCallback, useEffect, useRef } from 'react';
import type { EntryResponse as Entry } from '@racepilot/contracts';

/** "Öffnen" in a list row: loads the entry first, then opens its detail once it is selected. */
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
