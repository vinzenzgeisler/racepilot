import { useState } from 'react';
import { Button, DateInput, FormDialog, TextInput } from '@racepilot/ui';
import type {
  AdminPassengerCreateRequest,
  AdminPassengerLinkRequest,
  AdminPassengerLinkResponse,
  EntryResponse as Entry,
} from '@racepilot/contracts';
import { formatDateTime } from './entryDetailModel.js';
import type { useEntryDetailApi } from './useEntryDetailApi.js';

type LinkResult =
  | { ok: true; link: AdminPassengerLinkResponse }
  | { ok: false; message: string };

/**
 * Registers a co-driver afterwards ("add") or creates the co-driver's personal link ("link").
 * The link is shown once after it is created; only its hash is stored.
 */
function PassengerDialog({
  kind,
  entry,
  busy,
  error,
  onAdd,
  onLink,
  onClose,
}: {
  kind: 'add' | 'link';
  entry: Entry;
  busy: boolean;
  error: string;
  onAdd: (input: AdminPassengerCreateRequest) => void;
  onLink: (input: AdminPassengerLinkRequest) => Promise<LinkResult>;
  onClose: () => void;
}) {
  const passenger = entry.adminDetails?.passenger ?? null;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [link, setLink] = useState<AdminPassengerLinkResponse | null>(null);
  const [linkError, setLinkError] = useState('');
  const [copied, setCopied] = useState(false);
  const needsNames = kind === 'add' || !passenger;
  const needsEmail = kind === 'add' || !passenger?.email;
  const ready = !needsNames || (firstName.trim() && lastName.trim());
  const emailValue = email.trim() || null;

  if (link)
    return (
      <FormDialog
        open
        title="Persönlicher Link"
        message={
          link.mailQueued
            ? `Der Link wurde per E-Mail an den Beifahrer gesendet. Er ist bis ${formatDateTime(link.expiresAt)} gültig und funktioniert nur einmal.`
            : `Es ist keine E-Mail-Adresse hinterlegt. Gib den Link dem Beifahrer selbst weiter. Er ist bis ${formatDateTime(link.expiresAt)} gültig und funktioniert nur einmal.`
        }
        cancelLabel="Schließen"
        closeLabel="Dialog schließen"
        onClose={onClose}
      >
        <TextInput label="Link" readOnly value={link.url} />
        <div>
          <Button
            variant="secondary"
            size={40}
            onClick={() =>
              void navigator.clipboard
                ?.writeText(link.url)
                .then(() => setCopied(true))
                .catch(() => setCopied(false))
            }
          >
            {copied ? 'Kopiert' : 'Link kopieren'}
          </Button>
        </div>
      </FormDialog>
    );

  return (
    <FormDialog
      open
      title={
        kind === 'add' ? 'Beifahrer nachmelden' : 'Persönlichen Link erstellen'
      }
      message={
        kind === 'add'
          ? 'Trage den Beifahrer ein. Seine übrigen Daten und Einwilligungen kann er über einen persönlichen Link selbst abschließen.'
          : passenger
            ? `Der Link gilt für ${passenger.firstName} ${passenger.lastName}. Ein bisher offener Link wird ungültig.`
            : 'Trage den Beifahrer ein und erstelle seinen persönlichen Link. Er vervollständigt Daten und Einwilligungen ohne Konto.'
      }
      confirmLabel={kind === 'add' ? 'Beifahrer eintragen' : 'Link erstellen'}
      cancelLabel="Abbrechen"
      closeLabel="Dialog schließen"
      busy={busy}
      error={error || linkError}
      confirmDisabled={!ready}
      onClose={onClose}
      onConfirm={() => {
        if (kind === 'add') {
          onAdd({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: emailValue,
            dateOfBirth: dateOfBirth || null,
          });
          return;
        }
        setLinkError('');
        void onLink({
          ...(needsNames
            ? { firstName: firstName.trim(), lastName: lastName.trim() }
            : {}),
          ...(needsEmail && emailValue ? { email: emailValue } : {}),
        }).then((result) =>
          result.ok ? setLink(result.link) : setLinkError(result.message),
        );
      }}
    >
      {needsNames && (
        <>
          <TextInput
            label="Vorname"
            required
            maxLength={100}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
          <TextInput
            label="Nachname"
            required
            maxLength={100}
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </>
      )}
      {needsEmail && (
        <TextInput
          label="E-Mail (optional)"
          type="email"
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      )}
      {kind === 'add' && (
        <DateInput
          label="Geburtsdatum (optional)"
          value={dateOfBirth}
          onChange={(event) => setDateOfBirth(event.target.value)}
        />
      )}
    </FormDialog>
  );
}

/** Runs the add or link action against the entry; closes after a successful add, shows errors in the dialog. */
export function EntryPassengerFlow({
  kind,
  entry,
  api,
  onClose,
}: {
  kind: 'add' | 'link';
  entry: Entry;
  api: Pick<
    ReturnType<typeof useEntryDetailApi>,
    'busy' | 'addPassenger' | 'createPassengerLink'
  >;
  onClose: () => void;
}) {
  const [error, setError] = useState('');
  return (
    <PassengerDialog
      kind={kind}
      entry={entry}
      busy={api.busy}
      error={error}
      onAdd={(input) =>
        void api.addPassenger(input).then((result) => {
          if (result.ok) onClose();
          else setError(result.message);
        })
      }
      onLink={api.createPassengerLink}
      onClose={onClose}
    />
  );
}
