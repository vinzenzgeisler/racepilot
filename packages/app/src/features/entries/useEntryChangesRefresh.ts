import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

/** Refresh visible entry data after detail mutations elsewhere in the admin app. */
export function useEntryChangesRefresh(
  setRefreshRevision: Dispatch<SetStateAction<number>>,
) {
  useEffect(() => {
    const refresh = () => setRefreshRevision((value) => value + 1);
    window.addEventListener('nennbox:entries-changed', refresh);
    return () => window.removeEventListener('nennbox:entries-changed', refresh);
  }, [setRefreshRevision]);
}
