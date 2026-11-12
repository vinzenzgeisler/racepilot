import { Button } from '@racepilot/ui';
import { useEffect, useState } from 'react';
import { restoreAdminSession, signIn } from '../../auth.js';
import { AdminApplication } from './AdminApplication.js';

/** Restores the admin session and shows sign-in or availability states before the app. */
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
