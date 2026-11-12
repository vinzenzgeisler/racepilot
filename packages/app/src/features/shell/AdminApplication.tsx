import { Button, PreviewPanel, useWorkspacePreview } from '@racepilot/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import type { WorkflowView } from '../entries/AdminEntriesModel.js';
import { AdminEntries } from '../entries/AdminEntries.js';
import { AppShell } from './AppShell.js';
import { AdminMessages } from '../messages/AdminMessages.js';
import { EntryPreview } from './EntryPreview.js';
import { RegistrationFormSettings } from '../registration/RegistrationFormSettings.js';
import { AdminWorkflow } from '../workflow/AdminWorkflow.js';
import {
  adminFetch,
  getAdminIdentity,
  restoreAdminSession,
  signIn,
} from '../../auth.js';

export function AuthenticatedAdmin() {
  const [session, setSession] = useState<
    'loading' | 'ready' | 'signed-out' | 'disabled' | 'error'
  >('loading');
  useEffect(() => {
    let active = true;
    void restoreAdminSession()
      .then((result) => {
        if (active) setSession(result);
      })
      .catch(() => {
        if (active) setSession('error');
      });
    return () => {
      active = false;
    };
  }, []);
  if (session === 'loading')
    return (
      <main className="shell" aria-busy="true">
        <p role="status">NENNBOX lädt…</p>
      </main>
    );
  if (session === 'ready') return <AdminApplication />;
  return (
    <main className="shell">
      <h1>NENNBOX</h1>
      {session === 'signed-out' ? (
        <>
          <p>Bitte anmelden, um die Veranstaltung zu verwalten.</p>
          <Button
            onClick={() => void signIn().catch(() => setSession('error'))}
          >
            Anmelden
          </Button>
        </>
      ) : (
        <p role="alert">
          {session === 'disabled'
            ? 'Die Anmeldung ist noch nicht eingerichtet.'
            : 'Die Anmeldung ist derzeit nicht verfügbar.'}
        </p>
      )}
    </main>
  );
}

export function AdminApplication() {
  const previewViewport = useWorkspacePreview();
  const [identity, setIdentity] = useState(getAdminIdentity());
  const [events, setEvents] = useState<
    Array<{
      id: string;
      name: string;
      slug: string;
      registrationClosesAt: string | null;
    }>
  >([]);
  const [entryCount, setEntryCount] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState('');

  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [messageEntryId, setMessageEntryId] = useState<string | null>(null);
  const [previewWorkflow, setPreviewWorkflow] = useState<WorkflowView | null>(
    null,
  );
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const closePreview = () => setPreviewOpen(false);
  const activeEvent = useRef('');
  /** One place for leaving an event: nothing of the old one may stay selected, open or busy. */
  const changeEvent = useCallback((id: string) => {
    activeEvent.current = id;
    setSelectedEvent(id);
    setSelectedEntry(null);
    setMessageEntryId(null);
    setDetailOpen(false);
    setPreviewOpen(true);
    setPreviewBusy(false);
  }, []);
  useEffect(() => {
    let active = true;
    void adminFetch('/admin/session', { cache: 'no-store' })
      .then((response) =>
        response.ok ? (response.json() as Promise<{ role: string }>) : null,
      )
      .then((session) => {
        if (active && (session?.role === 'admin' || session?.role === 'member'))
          setIdentity((current) =>
            current
              ? {
                  ...current,
                  role: session.role === 'admin' ? 'Admin' : 'Mitglied',
                }
              : null,
          );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const handleSelectionChange = useCallback((entry: Entry | null) => {
    setSelectedEntry(entry);
    if (entry) setPreviewOpen(true);
    else setDetailOpen(false);
  }, []);
  useEffect(() => {
    let active = true;
    void adminFetch('/admin/events', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows: unknown) => {
        if (!active || !Array.isArray(rows)) return;
        const parsed = rows.flatMap((row) => {
          if (!row || typeof row !== 'object') return [];
          const value = row as {
            id?: unknown;
            name?: unknown;
            slug?: unknown;
            registrationClosesAt?: unknown;
          };
          return typeof value.id === 'string' && typeof value.name === 'string'
            ? [
                {
                  id: value.id,
                  name: value.name,
                  slug: typeof value.slug === 'string' ? value.slug : '',
                  registrationClosesAt:
                    typeof value.registrationClosesAt === 'string'
                      ? value.registrationClosesAt
                      : null,
                },
              ]
            : [];
        });
        setEvents(parsed);
        const first = parsed[0]?.id ?? '';
        setSelectedEvent((current) => current || first);
        activeEvent.current = activeEvent.current || first;
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const [entriesRevision, setEntriesRevision] = useState(0);
  const [previewAdvance, setPreviewAdvance] = useState<{
    eventId: string;
    entryId: string;
  } | null>(null);
  const previewAccepted = useCallback(
    ({ eventId, entryId }: { eventId: string; entryId: string }) => {
      // The list owns advancing to the next eligible entry.
      setPreviewAdvance({ eventId, entryId });
    },
    [],
  );
  const entriesChanged = useCallback(
    () => setEntriesRevision((value) => value + 1),
    [],
  );
  const entryPreview = selectedEntry ? (
    <EntryPreview
      entry={selectedEntry}
      workflow={previewWorkflow}
      busy={previewBusy}
      onClose={closePreview}
      onMessage={() => {
        setMessageEntryId(selectedEntry.id);
        setDetailOpen(false);
        setPreviewOpen(false);
      }}
      onOpenDetail={() => {
        setDetailOpen(true);
        setPreviewOpen(false);
      }}
      onNextAction={async (status) => {
        const requestedEvent = activeEvent.current;
        const requestedEntry = selectedEntry.id;
        setPreviewBusy(true);
        try {
          const response = await adminFetch(
            `/admin/entries/${selectedEntry.id}/transitions`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                transition: 'acceptance',
                status,
                reason: 'In der Nennungsvorschau entschieden',
              }),
            },
          );
          if (response.ok) {
            const updated = (await response.json()) as Entry;
            // The answer may only update the entry that is still open in the same event.
            if (activeEvent.current === requestedEvent) {
              setSelectedEntry((current) =>
                current?.id === requestedEntry ? updated : current,
              );
              previewAccepted({
                eventId: requestedEvent,
                entryId: requestedEntry,
              });
            }
            entriesChanged();
          }
        } finally {
          if (activeEvent.current === requestedEvent) setPreviewBusy(false);
        }
      }}
    />
  ) : (
    <PreviewPanel eyebrow="Vorschau" title="Nennung auswählen" />
  );
  return (
    <AppShell
      events={events}
      messageEntryId={messageEntryId}
      onClearMessageSelection={() => setMessageEntryId(null)}
      activeEvent={selectedEvent}
      entryCount={entryCount}
      onEventChange={changeEvent}
      previewOpen={previewOpen && !detailOpen}
      detailOpen={detailOpen}
      identity={identity}
      onClosePreview={closePreview}
    >
      {(view) =>
        view === 'entries' ? (
          <AdminEntries
            preview={previewOpen && !detailOpen ? entryPreview : undefined}
            mobilePreviewOpen={
              previewOpen && !detailOpen && Boolean(selectedEntry)
            }
            eventId={selectedEvent}
            onEventChange={changeEvent}
            onTotalChange={setEntryCount}
            detailOpen={detailOpen}
            autoPreview={previewViewport}
            onOpenDetail={() => {
              setDetailOpen(true);
              setPreviewOpen(false);
            }}
            onCloseDetail={() => {
              setDetailOpen(false);
              setPreviewOpen(true);
            }}
            onSelectionChange={handleSelectionChange}
            onWorkflowChange={setPreviewWorkflow}
            entriesRevision={entriesRevision}
            previewAdvance={previewAdvance}
            onPreviewAdvanceHandled={() => setPreviewAdvance(null)}
            selectedEntry={selectedEntry}
          />
        ) : view === 'messages' ? (
          <AdminMessages
            eventId={selectedEvent}
            initialEntryId={messageEntryId ?? undefined}
          />
        ) : view === 'workflow' ? (
          <AdminWorkflow eventId={selectedEvent} events={events} />
        ) : view === 'account' ? (
          <RegistrationFormSettings eventId={selectedEvent} />
        ) : null
      }
    </AppShell>
  );
}
