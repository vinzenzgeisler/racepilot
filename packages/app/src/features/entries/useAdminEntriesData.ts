import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  AdminEntryListResponse,
  EventSchema,
  type EntryResponse as Entry,
} from '@racepilot/contracts';
import { adminFetch } from '../../auth.js';
import { defaultWorkflow } from '../workflow/AdminWorkflow.js';
import {
  begin,
  invalidate,
  isCurrent,
  messageFor,
  request,
  type ApiState,
  type EntryQuery,
  type Event,
  type Gate,
  type WorkflowView,
} from './AdminEntriesModel.js';

export function useAdminEntriesData({
  eventId,
  page,
  pageSize,
  applied,
  refreshRevision,
  setActionError,
}: {
  eventId: string;
  page: number;
  pageSize: number;
  applied: EntryQuery;
  refreshRevision: number;
  setActionError: Dispatch<SetStateAction<string>>;
}) {
  const [apiState, setApiState] = useState<ApiState>('loading');
  const [events, setEvents] = useState<Event[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowView | null>(null);
  const [items, setItems] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const listGate = useRef<Gate>({ generation: 0, controller: null });
  const classGate = useRef<Gate>({ generation: 0, controller: null });
  const invalidateDataRequests = useCallback(() => {
    invalidate(listGate.current);
    invalidate(classGate.current);
  }, []);
  useEffect(() => () => invalidateDataRequests(), [invalidateDataRequests]);
  useEffect(() => {
    let active = true;
    const gate = classGate.current;
    const { generation, controller } = begin(gate);
    request('/admin/events', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw Object.assign(new Error(), { status: response.status });
        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) throw new Error('Invalid event response');
        const parsed = payload.map((item) => EventSchema.parse(item));
        if (!active || !isCurrent(gate, generation, controller)) return;
        setEvents(parsed);
        setApiState('ready');
      })
      .catch((error: { status?: number }) => {
        if (active && isCurrent(gate, generation, controller))
          setApiState(error.status ? messageFor(error.status) : 'unavailable');
      });
    return () => {
      active = false;
      controller.abort();
      if (gate.controller === controller) gate.controller = null;
    };
  }, []);

  useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();
    adminFetch(
      `/admin/events/${encodeURIComponent(eventId)}/registration-workflow`,
      {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      },
    )
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ workflow: WorkflowView }>)
          : null,
      )
      .then((value) => {
        if (!controller.signal.aborted)
          setWorkflow(value?.workflow ?? defaultWorkflow);
      })
      .catch(() => {
        if (!controller.signal.aborted) setWorkflow(defaultWorkflow);
      });
    return () => controller.abort();
  }, [eventId, refreshRevision]);

  useEffect(() => {
    if (!eventId) return;
    const gate = classGate.current;
    const { generation, controller } = begin(gate);
    request(`/admin/events/${encodeURIComponent(eventId)}/classes`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw Object.assign(new Error(), { status: response.status });
        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) throw new Error('Invalid class response');
        if (!isCurrent(gate, generation, controller)) return;
        setClasses(
          payload.map((value) => ({ id: value.id, name: value.name })),
        );
      })
      .catch((error: { status?: number }) => {
        if (!isCurrent(gate, generation, controller)) return;
        setActionError(
          error.status === 403
            ? 'Du darfst die Klassen dieser Veranstaltung nicht ansehen.'
            : 'Die Klassen konnten nicht geladen werden.',
        );
      });
    return () => {
      controller.abort();
      if (gate.controller === controller) gate.controller = null;
    };
  }, [eventId, setActionError]);

  const loadEntries = useCallback(async () => {
    if (!eventId) return;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      eventId,
      sort: applied.sort,
      direction: applied.direction,
    });
    if (applied.classId) params.set('classId', applied.classId);
    if (applied.acceptanceStatus)
      params.set('acceptanceStatus', applied.acceptanceStatus);
    if (applied.verificationStatus)
      params.set('verificationStatus', applied.verificationStatus);
    if (applied.paymentStatus)
      params.set('paymentStatus', applied.paymentStatus);
    if (applied.search.trim()) params.set('search', applied.search.trim());

    const requestedEventId = eventId;
    const { generation, controller } = begin(listGate.current);
    setApiState('loading');
    try {
      const response = await request(`/admin/entries?${params}`, {
        signal: controller.signal,
      });
      if (!isCurrent(listGate.current, generation, controller)) return;
      if (!response.ok) {
        setApiState(messageFor(response.status));
        return;
      }
      const result = AdminEntryListResponse.parse(await response.json());
      if (
        !isCurrent(listGate.current, generation, controller) ||
        requestedEventId !== eventId
      )
        return;
      setItems(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setApiState('ready');
    } catch {
      if (isCurrent(listGate.current, generation, controller))
        setApiState('unavailable');
    } finally {
      if (listGate.current.controller === controller)
        listGate.current.controller = null;
    }
  }, [eventId, page, pageSize, applied]);

  useEffect(() => {
    const gate = listGate.current;
    // This effect intentionally synchronizes the selected query with the remote list API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEntries();
    return () => invalidate(gate);
  }, [loadEntries, refreshRevision]);

  function resetData() {
    invalidateDataRequests();
    setClasses([]);
    setItems([]);
    setTotal(0);
    setTotalPages(0);
  }
  return {
    apiState,
    events,
    workflow,
    items,
    total,
    totalPages,
    classes,
    resetData,
  };
}
