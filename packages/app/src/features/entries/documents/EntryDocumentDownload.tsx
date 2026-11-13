import { useState } from 'react';
import { Button } from '@racepilot/ui';
import { documentDownloadPath } from './documentLines.js';
import { useAbortableDownload } from './useAbortableDownload.js';

/** "Ansehen": saves the stored file through the authenticated client. */
export function EntryDocumentDownload({
  entryId,
  documentId,
  fileName,
}: {
  entryId: string;
  documentId: string;
  fileName: string;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const download = useAbortableDownload();
  async function run() {
    setState('busy');
    try {
      await download(documentDownloadPath(entryId, documentId), fileName);
      setState('idle');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        setState('failed');
    }
  }
  return (
    <>
      <Button
        variant="text"
        size={32}
        disabled={state === 'busy'}
        onClick={() => void run()}
      >
        {state === 'busy' ? 'Wird geladen …' : 'Ansehen'}
      </Button>
      {state === 'failed' && (
        <span role="alert">Datei konnte nicht geladen werden.</span>
      )}
    </>
  );
}
