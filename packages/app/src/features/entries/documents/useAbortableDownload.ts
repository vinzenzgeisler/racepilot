import { useCallback, useEffect, useRef } from 'react';
import { downloadAdminFile } from './downloadAdminFile.js';

/** Downloads that are cancelled when the component goes away, so nothing saves after leaving. */
export function useAbortableDownload() {
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  return useCallback(async (url: string, fileName: string) => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    await downloadAdminFile(url, fileName, next.signal);
  }, []);
}
