import { useSyncExternalStore } from 'react';

export const WORKSPACE_PREVIEW_BREAKPOINT = 1680;
const previewQuery = `(min-width: ${WORKSPACE_PREVIEW_BREAKPOINT}px)`;

export function useWorkspacePreview() {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const query = window.matchMedia(previewQuery);
      query.addEventListener('change', notify);
      return () => query.removeEventListener('change', notify);
    },
    () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia(previewQuery).matches,
    () => false,
  );
}
