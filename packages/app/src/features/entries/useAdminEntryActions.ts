import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { EntryResponse } from '@racepilot/contracts';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import type { WorkflowView, Gate } from './AdminEntriesModel.js';
import { begin, invalidate, isCurrent, request } from './AdminEntriesModel.js';

export function useAdminEntryActions({
  eventId,
  items,
  workflow,
  selected,
  setSelected,
  selectedIds,
  clearSelection,
  setRefreshRevision,
  setActionError,
}: {
  setActionError: Dispatch<SetStateAction<string>>;
  eventId: string;
  items: Entry[];
  workflow: WorkflowView | null;
  selected: Entry | null;
  setSelected: Dispatch<SetStateAction<Entry | null>>;
  selectedIds: Set<string>;
  clearSelection: () => void;
  setRefreshRevision: Dispatch<SetStateAction<number>>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const detailGate = useRef<Gate>({ generation: 0, controller: null });
  const transitionGate = useRef<Gate>({ generation: 0, controller: null });
  const invalidateActionRequests = useCallback(() => {
    invalidate(detailGate.current);
    invalidate(transitionGate.current);
  }, []);
  useEffect(() => () => invalidateActionRequests(), [invalidateActionRequests]);
  const openEntry = useCallback(
    async (id: string) => {
      invalidate(transitionGate.current);
      setBusy(false);
      const requestedEventId = eventId;
      const { generation, controller } = begin(detailGate.current);
      setSelected(null);
      setReason('');
      setActionError('');
      try {
        const response = await request(
          `/admin/entries/${encodeURIComponent(id)}`,
          { signal: controller.signal },
        );
        if (!isCurrent(detailGate.current, generation, controller)) return;
        if (!response.ok) {
          setActionError(
            response.status === 401
              ? 'Your OIDC session is not authorized. Sign in through the configured OIDC session.'
              : response.status === 403
                ? 'You do not have permission to view this entry.'
                : 'Entry details are unavailable.',
          );
          return;
        }
        const entry = EntryResponse.parse(await response.json());
        if (
          isCurrent(detailGate.current, generation, controller) &&
          eventId === requestedEventId &&
          entry.eventId === requestedEventId
        )
          setSelected(entry);
      } catch {
        if (isCurrent(detailGate.current, generation, controller))
          setActionError('Entry details are unavailable.');
      } finally {
        if (detailGate.current.controller === controller)
          detailGate.current.controller = null;
      }
    },
    [eventId, setActionError, setSelected],
  );

  async function transition(
    transitionType: 'acceptance' | 'verification',
    status: string,
  ) {
    const current = selected;
    if (!current || !reason.trim()) return;
    const requestedEventId = eventId;
    const requestedReason = reason.trim();
    const { generation, controller } = begin(transitionGate.current);
    setBusy(true);
    setActionError('');
    try {
      const response = await request(
        `/admin/entries/${encodeURIComponent(current.id)}/transitions`,
        {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify({
            transition: transitionType,
            status,
            reason: requestedReason,
          }),
        },
      );
      if (!isCurrent(transitionGate.current, generation, controller)) return;
      if (!response.ok) {
        setActionError(
          response.status === 401
            ? 'Your OIDC session is not authorized.'
            : response.status === 403
              ? 'You do not have permission to change this entry.'
              : 'The status change was rejected.',
        );
        return;
      }
      const updated = EntryResponse.parse(await response.json());
      if (
        !isCurrent(transitionGate.current, generation, controller) ||
        eventId !== requestedEventId ||
        selected?.id !== current.id ||
        updated.id !== current.id ||
        updated.eventId !== requestedEventId
      )
        return;
      setSelected(updated);
      setReason('');
      setRefreshRevision((revision) => revision + 1);
      const acceptedCategory = workflow?.statuses.find(
        (item) => item.key === status && item.category === 'accepted',
      );
      if (transitionType === 'acceptance' && acceptedCategory) {
        const currentIndex = items.findIndex((item) => item.id === current.id);
        const nextOpen = items
          .slice(Math.max(0, currentIndex + 1))
          .find(
            (item) =>
              workflow?.statuses.find(
                (candidate) => candidate.key === item.acceptanceStatus,
              )?.category === 'pending' &&
              workflow.transitions.some(
                (edge) =>
                  edge.from === item.acceptanceStatus &&
                  edge.to === acceptedCategory.key,
              ),
          );
        if (nextOpen) void openEntry(nextOpen.id);
      }
    } catch {
      if (isCurrent(transitionGate.current, generation, controller))
        setActionError('The status change could not be completed.');
    } finally {
      if (
        isCurrent(transitionGate.current, generation, controller) &&
        selected?.id === current.id &&
        eventId === requestedEventId
      )
        setBusy(false);
      if (transitionGate.current.controller === controller)
        transitionGate.current.controller = null;
    }
  }

  const acceptedStatusKey = workflow?.statuses.find(
    (status) => status.category === 'accepted',
  )?.key;
  const eligibleSelectedItems = items.filter(
    (item) =>
      selectedIds.has(item.id) &&
      acceptedStatusKey !== undefined &&
      (workflow?.transitions ?? []).some(
        (edge) =>
          edge.from === item.acceptanceStatus && edge.to === acceptedStatusKey,
      ),
  );

  async function bulkAccept() {
    const eligible = eligibleSelectedItems;
    if (!eligible.length) return;
    const requestedReason = window
      .prompt(
        `Zulassen für ${eligible.length} von ${selectedIds.size} Nennungen. Grund für den Audit-Verlauf:`,
      )
      ?.trim();
    if (!requestedReason) return;
    setBusy(true);
    setActionError('');
    try {
      const responses = await Promise.all(
        eligible.map((item) =>
          request(`/admin/entries/${encodeURIComponent(item.id)}/transitions`, {
            method: 'POST',
            body: JSON.stringify({
              transition: 'acceptance',
              status: acceptedStatusKey,
              reason: requestedReason,
            }),
          }),
        ),
      );
      if (responses.some((response) => !response.ok))
        throw new Error('bulk transition rejected');
      clearSelection();
      setRefreshRevision((revision) => revision + 1);
    } catch {
      setActionError(
        'Ein Teil der Massenaktion konnte nicht abgeschlossen werden. Bitte Liste aktualisieren und prüfen.',
      );
      setRefreshRevision((revision) => revision + 1);
    } finally {
      setBusy(false);
    }
  }

  return {
    reason,
    setReason,
    busy,
    setBusy,
    openEntry,
    transition,
    invalidateActionRequests,
    acceptedStatusKey,
    eligibleSelectedItems,
    bulkAccept,
  };
}
