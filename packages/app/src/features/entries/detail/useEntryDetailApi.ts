import { useCallback, useEffect, useState } from 'react';
import {
  EntryMessagesResponse,
  EntryResponse,
  type EntryDriverUpdateRequest,
  type EntryVehicleUpdateRequest,
} from '@racepilot/contracts';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import { request } from '../AdminEntriesModel.js';

const failure = (status: number, action: string) =>
  status === 401
    ? 'Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.'
    : status === 403
      ? `Du darfst ${action} nicht.`
      : status === 404
        ? 'Die Nennung wurde nicht gefunden.'
        : status === 400
          ? 'Die Eingaben wurden vom Server abgelehnt. Bitte prüfe sie.'
          : 'Der Server konnte die Anfrage nicht ausführen.';

export type Outcome = { ok: true } | { ok: false; message: string };

/** Admin calls of the entry detail; every successful change hands the fresh entry back. */
export function useEntryDetailApi(
  entry: Entry,
  onUpdated: (entry: Entry) => void,
) {
  const [busy, setBusy] = useState(false);
  const entryPath = `/admin/entries/${encodeURIComponent(entry.id)}`;
  const run = useCallback(
    async (
      path: string,
      init: RequestInit,
      action: string,
      readEntry: boolean,
    ): Promise<Outcome> => {
      setBusy(true);
      try {
        const response = await request(path, init);
        if (!response.ok)
          return { ok: false, message: failure(response.status, action) };
        const body: unknown = await response.json().catch(() => null);
        const fresh = readEntry
          ? EntryResponse.safeParse(body)
          : EntryResponse.safeParse(
              await (await request(entryPath)).json().catch(() => null),
            );
        if (!fresh.success)
          return { ok: false, message: 'Die Antwort war unvollständig.' };
        onUpdated(fresh.data);
        return { ok: true };
      } catch {
        return { ok: false, message: 'Keine Verbindung zum Server.' };
      } finally {
        setBusy(false);
      }
    },
    [entryPath, onUpdated],
  );
  return {
    busy,
    saveDriver: (patch: EntryDriverUpdateRequest) =>
      run(
        `${entryPath}/driver`,
        { method: 'PATCH', body: JSON.stringify(patch) },
        'Fahrerdaten ändern',
        true,
      ),
    saveVehicle: (patch: EntryVehicleUpdateRequest) =>
      run(
        `${entryPath}/vehicle`,
        { method: 'PATCH', body: JSON.stringify(patch) },
        'Fahrzeugdaten ändern',
        true,
      ),
    recordPayment: (invoiceId: string, amountCents: number, reason: string) =>
      run(
        `/admin/invoices/${encodeURIComponent(invoiceId)}/payments`,
        { method: 'POST', body: JSON.stringify({ amountCents, reason }) },
        'Zahlungen erfassen',
        false,
      ),
    transitionDimension: (
      dimension: 'technical_inspection' | 'waiver',
      status: string,
      reason: string,
    ) =>
      run(
        `${entryPath}/status-dimensions/${dimension}/transitions`,
        { method: 'POST', body: JSON.stringify({ status, reason }) },
        'diesen Status ändern',
        false,
      ),
  };
}

export type EntryMessage = EntryMessagesResponse['items'][number];

/** Mails for one entry; reloads whenever the entry changes (new mails follow status changes). */
export function useEntryMessages(entry: Entry) {
  const [state, setState] = useState<{
    key: string;
    items: EntryMessage[] | null;
    failed: boolean;
  }>({ key: '', items: null, failed: false });
  const key = `${entry.id}|${entry.adminHistory?.length ?? 0}`;
  useEffect(() => {
    const controller = new AbortController();
    void request(`/admin/entries/${encodeURIComponent(entry.id)}/messages`, {
      signal: controller.signal,
    })
      .then(async (response) =>
        response.ok
          ? EntryMessagesResponse.parse(await response.json()).items
          : Promise.reject(new Error('rejected')),
      )
      .then((items) => setState({ key, items, failed: false }))
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ key, items: null, failed: true });
      });
    return () => controller.abort();
  }, [entry.id, key]);
  return state.key === key ? state : { key, items: null, failed: false };
}

/** German labels for status values of the event, so history never shows raw keys. */
export function useDimensionLabels(eventId: string) {
  const [labels, setLabels] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    const controller = new AbortController();
    void request(
      `/admin/events/${encodeURIComponent(eventId)}/status-dimensions`,
      {
        signal: controller.signal,
      },
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((config: unknown) => {
        const dimensions =
          (
            config as {
              dimensions?: Array<{
                values: Array<{ key: string; labels: { de: string } }>;
              }>;
            } | null
          )?.dimensions ?? [];
        setLabels(
          new Map(
            dimensions.flatMap((item) =>
              item.values.map((value) => [value.key, value.labels.de] as const),
            ),
          ),
        );
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [eventId]);
  return labels;
}
