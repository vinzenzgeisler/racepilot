import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EntryMessagesResponse,
  EntryResponse,
  type EntryDriverUpdateRequest,
  type EntryVehicleUpdateRequest,
} from '@racepilot/contracts';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import { request, type Outcome } from '../AdminEntriesModel.js';

const failure = (status: number, action: string, code?: string) =>
  status === 401
    ? 'Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.'
    : status === 403
      ? `Du darfst ${action} nicht.`
      : status === 404
        ? 'Die Nennung wurde nicht gefunden.'
        : status === 409
          ? code === 'stale'
            ? 'Die Nennung wurde inzwischen geändert. Bitte lade die Detailansicht neu.'
            : code === 'capacity'
              ? 'Die Zielklasse ist inzwischen voll.'
              : code === 'class'
                ? 'Die Zielklasse ist geschlossen oder gehört nicht zu dieser Veranstaltung.'
                : 'Name, Geburtsdatum und Land gehören zur Person und gelten auch für ihre Nennungen in anderen Veranstaltungen. Sie lassen sich hier nicht ändern.'
          : status === 422
            ? code === 'reason'
              ? 'Bitte gib eine Begründung ein.'
              : code === 'amount'
                ? 'Bitte gib einen gültigen Betrag ein.'
                : code === 'note'
                  ? 'Bitte gib einen Notiztext ein.'
                  : 'Die Eingaben wurden vom Server abgelehnt. Bitte prüfe sie.'
            : status === 400
              ? 'Die Eingaben wurden vom Server abgelehnt. Bitte prüfe sie.'
              : 'Der Server konnte die Anfrage nicht ausführen.';

export type { Outcome };

export type EntryAdminAction =
  | {
      kind: 'change_class';
      classId: string;
      reason: string;
      expectedVersion: number;
    }
  | {
      kind: 'adjust_amount';
      amountCents: number;
      reason: string;
      expectedVersion: number;
    }
  | { kind: 'note'; visibility: 'internal' | 'driver'; text: string }
  | { kind: 'delete'; reason: string; expectedVersion: number };

/**
 * Admin calls of the entry detail; every successful change hands the fresh entry back.
 * Requests belong to the entry shown when they started: leaving or switching the entry aborts
 * them, and a response that arrives late is dropped instead of selecting the old entry again.
 */
export function useEntryDetailApi(
  entry: Entry,
  onUpdated: (entry: Entry | null, refresh?: boolean) => void,
) {
  const [busy, setBusy] = useState(false);
  const entryId = entry.id;
  const entryPath = `/admin/entries/${encodeURIComponent(entryId)}`;
  const scope = useRef<AbortController | null>(null);
  const onUpdatedRef = useRef(onUpdated);
  useEffect(() => {
    onUpdatedRef.current = onUpdated;
  }, [onUpdated]);
  useEffect(() => {
    const controller = new AbortController();
    scope.current = controller;
    if (!entry.availableActions) {
      void request(entryPath, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) return;
          const fresh = EntryResponse.safeParse(
            await response.json().catch(() => null),
          );
          if (
            !controller.signal.aborted &&
            fresh.success &&
            fresh.data.id === entryId
          )
            onUpdatedRef.current(fresh.data, false);
        })
        .catch(() => undefined);
    }
    return () => {
      controller.abort();
      if (scope.current === controller) scope.current = null;
    };
  }, [entryId, entry.revision, entry.availableActions, entryPath]);
  const run = useCallback(
    async (
      path: string,
      init: RequestInit,
      action: string,
      readEntry: boolean | 'none',
    ): Promise<Outcome> => {
      const controller = scope.current;
      const superseded: Outcome = { ok: false, message: '' };
      if (!controller || controller.signal.aborted) return superseded;
      const { signal } = controller;
      setBusy(true);
      try {
        const response = await request(path, { ...init, signal });
        if (signal.aborted) return superseded;
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const code =
            typeof body === 'object' &&
            body !== null &&
            'error' in body &&
            typeof body.error === 'string'
              ? body.error
              : undefined;
          return { ok: false, message: failure(response.status, action, code) };
        }
        if (readEntry === 'none') return { ok: true };
        const fresh = EntryResponse.safeParse(
          readEntry
            ? body
            : await (
                await request(entryPath, { signal })
              )
                .json()
                .catch(() => null),
        );
        if (signal.aborted) return superseded;
        if (!fresh.success || fresh.data.id !== entryId)
          return { ok: false, message: 'Die Antwort war unvollständig.' };
        onUpdated(fresh.data);
        return { ok: true };
      } catch {
        return signal.aborted
          ? superseded
          : { ok: false, message: 'Keine Verbindung zum Server.' };
      } finally {
        if (!signal.aborted) setBusy(false);
      }
    },
    [entryId, entryPath, onUpdated],
  );
  return {
    busy,
    performAdminAction: (action: EntryAdminAction) =>
      run(
        `${entryPath}/actions`,
        { method: 'POST', body: JSON.stringify(action) },
        'diese Nennung ändern',
        action.kind === 'delete' ? 'none' : false,
      ),
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
