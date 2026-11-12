import { Banner, Button, EmptyState } from '@racepilot/ui';
import type { RemoteErrorKind } from './apiRequest.js';

const EXPLANATION: Record<RemoteErrorKind, string> = {
  unauthorized: 'Bitte melde dich erneut an.',
  forbidden: 'Dein Konto darf das nicht ansehen.',
  'not-found':
    'Dafür gibt es noch keine Daten. Prüfe, ob die Veranstaltung geöffnet ist.',
  unavailable: 'Der Server antwortet gerade nicht.',
};

/** Failure of a loaded view; only a transient failure offers a retry. */
export function RemoteError({
  subject,
  kind,
  onRetry,
}: {
  subject: string;
  kind: RemoteErrorKind;
  onRetry: () => void;
}) {
  return (
    <Banner tone="error" title={`${subject} konnte nicht geladen werden.`}>
      <p>{EXPLANATION[kind]}</p>
      {kind === 'unavailable' && (
        <Button variant="secondary" onClick={onRetry}>
          Erneut versuchen
        </Button>
      )}
    </Banner>
  );
}

export function NoEventSelected() {
  return (
    <EmptyState
      title="Keine Veranstaltung gewählt"
      description="Wähle oben links eine Veranstaltung."
    />
  );
}

export function LoadingNotice({ subject }: { subject: string }) {
  return (
    <p role="status" aria-live="polite">
      {subject} wird geladen …
    </p>
  );
}
