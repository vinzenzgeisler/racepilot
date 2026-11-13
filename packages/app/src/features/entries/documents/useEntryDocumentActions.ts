import { useCallback, useState } from 'react';
import type { Outcome } from '../AdminEntriesModel.js';
import type { UploadLine } from './documentLines.js';

type DocumentApi = {
  reviewDocument: (documentId: string) => Promise<Outcome>;
  rejectDocument: (documentId: string, reason: string) => Promise<Outcome>;
};

/** Review and rejection of the entry's documents; the reject dialog keeps its own error. */
export function useEntryDocumentActions(api: DocumentApi) {
  const [rejecting, setRejecting] = useState<UploadLine | null>(null);
  const [error, setError] = useState('');
  const [dialogError, setDialogError] = useState('');
  const { reviewDocument, rejectDocument } = api;
  const review = useCallback(
    async (line: UploadLine) => {
      if (!line.document) return;
      setError('');
      const result = await reviewDocument(line.document.id);
      if (!result.ok) setError(result.message);
    },
    [reviewDocument],
  );
  const startReject = useCallback((line: UploadLine) => {
    setDialogError('');
    setRejecting(line);
  }, []);
  const cancelReject = useCallback(() => {
    setDialogError('');
    setRejecting(null);
  }, []);
  const confirmReject = useCallback(
    async (reason: string) => {
      if (!rejecting?.document) return;
      const result = await rejectDocument(rejecting.document.id, reason);
      if (result.ok) cancelReject();
      else setDialogError(result.message);
    },
    [rejecting, rejectDocument, cancelReject],
  );
  return {
    rejecting,
    error,
    dialogError,
    review,
    startReject,
    cancelReject,
    confirmReject,
  };
}
