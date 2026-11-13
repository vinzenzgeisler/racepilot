import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EventDocumentsApiError,
  loadEventDocumentSettings,
  saveDocumentTypes,
  saveOrgaCodePrefix,
} from './eventDocumentsApi.js';
import {
  documentTypeErrors,
  draftFromType,
  prefixError,
  toTypeRequest,
  type DocumentTypeDraft,
} from './documentTypeModel.js';

type Loaded = {
  eventId: string;
  state: 'loading' | 'ready' | 'error';
  types: DocumentTypeDraft[];
  prefix: string;
  savedPrefix: string;
  message: string;
};
const loading = (eventId: string): Loaded => ({
  eventId,
  state: 'loading',
  types: [],
  prefix: '',
  savedPrefix: '',
  message: '',
});

/** Loads the event's document types and Orga-Code prefix; the request ends when the event changes. */
export function useEventDocumentSettings(eventId: string) {
  const [data, setData] = useState<Loaded>(() => loading(eventId));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveScope = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    saveScope.current?.abort();
    setSaving(false);
    setData(loading(eventId));
    setSaved(false);
    void loadEventDocumentSettings(eventId, controller.signal)
      .then((settings) => {
        if (controller.signal.aborted) return;
        setData({
          eventId,
          state: 'ready',
          types: settings.types.map(draftFromType),
          prefix: settings.orgaCodePrefix,
          savedPrefix: settings.orgaCodePrefix,
          message: '',
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setData({
          ...loading(eventId),
          state: 'error',
          message:
            error instanceof EventDocumentsApiError
              ? error.message
              : 'Die Einstellungen konnten nicht geladen werden.',
        });
      });
    return () => {
      controller.abort();
      saveScope.current?.abort();
    };
  }, [eventId]);
  const current = data.eventId === eventId ? data : loading(eventId);
  const errors = documentTypeErrors(current.types);
  const prefixProblem = prefixError(current.prefix);
  const valid = !prefixProblem && errors.every((error) => !error);
  const change = useCallback((patch: Partial<Loaded>) => {
    setSaved(false);
    setData((value) => ({ ...value, ...patch, message: '' }));
  }, []);
  const save = useCallback(async () => {
    if (!valid || saving) return;
    const controller = new AbortController();
    saveScope.current = controller;
    setSaving(true);
    setSaved(false);
    try {
      const prefix =
        current.prefix === current.savedPrefix
          ? current.savedPrefix
          : await saveOrgaCodePrefix(
              eventId,
              current.prefix,
              controller.signal,
            );
      const types = await saveDocumentTypes(
        eventId,
        toTypeRequest(current.types),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setData((value) => ({
        ...value,
        types: types.map(draftFromType),
        prefix,
        savedPrefix: prefix,
        message: '',
      }));
      setSaved(true);
    } catch (error) {
      if (controller.signal.aborted) return;
      setData((value) => ({
        ...value,
        message:
          error instanceof EventDocumentsApiError
            ? error.message
            : 'Speichern momentan nicht möglich.',
      }));
    } finally {
      if (saveScope.current === controller) saveScope.current = null;
      if (!controller.signal.aborted) setSaving(false);
    }
  }, [valid, saving, current, eventId]);
  return {
    ...current,
    errors,
    prefixProblem,
    saving,
    saved,
    valid,
    setTypes: (types: DocumentTypeDraft[]) => change({ types }),
    setPrefix: (prefix: string) => change({ prefix }),
    save,
  };
}
