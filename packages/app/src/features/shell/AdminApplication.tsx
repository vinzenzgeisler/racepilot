import { Button } from '@racepilot/ui';
import { useEffect, useState } from 'react';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import { AdminEntries } from '../entries/AdminEntries.js';
import { AppShell } from './AppShell.js';
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

function AdminApplication() {
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
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const closePreview = () => setPreviewOpen(false);
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
        setSelectedEvent((current) => current || parsed[0]?.id || '');
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return (
    <AppShell
      events={events}
      activeEvent={selectedEvent}
      entryCount={entryCount}
      onEventChange={setSelectedEvent}
      previewOpen={previewOpen && !detailOpen}
      detailOpen={detailOpen}
      identity={getAdminIdentity()}
      onClosePreview={closePreview}
      preview={
        selectedEntry ? (
          <EntryPreview
            entry={selectedEntry}
            busy={previewBusy}
            onClose={closePreview}
            onOpenDetail={() => {
              setDetailOpen(true);
              setPreviewOpen(false);
            }}
            onNextAction={async (status) => {
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
                  setSelectedEntry((await response.json()) as Entry);
                  window.dispatchEvent(new Event('nennbox:entries-changed'));
                }
              } finally {
                setPreviewBusy(false);
              }
            }}
          />
        ) : undefined
      }
    >
      {(view) =>
        view === 'entries' ? (
          <AdminEntries
            eventId={selectedEvent}
            onEventChange={setSelectedEvent}
            onTotalChange={setEntryCount}
            detailOpen={detailOpen}
            autoPreview
            onOpenDetail={() => {
              setDetailOpen(true);
              setPreviewOpen(false);
            }}
            onCloseDetail={() => {
              setDetailOpen(false);
              setPreviewOpen(true);
            }}
            onSelectionChange={(entry) => {
              setSelectedEntry(entry);
              if (entry && !detailOpen) setPreviewOpen(true);
            }}
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
