import { useEffect } from 'react';
import type { FormEvent } from 'react';
import { Banner, PageHeader, Steps } from '@racepilot/ui';
import { EventSetupForm } from './EventSetupForm.js';
import type { SetupEvent } from './eventSetupApi.js';
import { useEventSetup } from './useEventSetup.js';

export function EventSetup({
  onCreated,
}: {
  onCreated: (event: SetupEvent) => void;
}) {
  const setup = useEventSetup(onCreated);
  const { refreshEvents } = setup;
  useEffect(() => {
    void refreshEvents().catch(() => undefined);
  }, [refreshEvents]);

  const submit = (event: FormEvent<HTMLFormElement>, open: boolean) => {
    event.preventDefault();
    if (!validateDraft(event.currentTarget, setup.setMessage)) return;
    void setup.save(event.currentTarget, open);
  };

  return (
    <section aria-labelledby="event-setup-title">
      <PageHeader
        title="Veranstaltung einrichten"
        description="Veranstaltung, Klassen, Startgeld und Teilnahmebedingungen vorbereiten und die Nennung anschließend öffnen."
      />
      <Steps
        label="Einrichtungsschritte"
        completedLabel="Abgeschlossen"
        steps={[
          'Veranstaltung',
          'Klassen',
          'Startgeld',
          'Bedingungen',
          'Nennung öffnen',
        ]}
        current={setup.currentStep}
      />
      <EventSetupForm
        draft={setup.draft}
        setDraft={setup.setDraft}
        events={setup.events}
        busy={setup.busy}
        onResume={(id) =>
          void setup.resume(id).catch((error: unknown) => {
            setup.setDraft((current) => ({ ...current, id }));
            // The form stays available so a failed load can be retried by reselecting the draft.
            setup.setMessage(
              error instanceof Error
                ? error.message
                : 'Entwurf konnte nicht geladen werden.',
            );
          })
        }
        onReset={setup.reset}
        onSubmit={submit}
      />
      {setup.message && (
        <Banner tone={setup.link ? 'success' : 'warning'}>
          {setup.message}
        </Banner>
      )}
      {setup.link && (
        <p>
          Öffentliche Nennung:{' '}
          <a href={setup.link} target="_blank" rel="noreferrer">
            {setup.link}
          </a>
        </p>
      )}
    </section>
  );
}

function validateDraft(
  form: HTMLFormElement,
  setMessage: (message: string) => void,
): boolean {
  const data = new FormData(form);
  const name = String(data.get('event-name') ?? '').trim();
  const slug = String(data.get('event-slug') ?? '').trim();
  const startsOn = String(data.get('starts-on') ?? '');
  const endsOn = String(data.get('ends-on') ?? '');
  if (!form.reportValidity()) return false;
  if (!name || !slug || !startsOn || !endsOn) return false;
  if (endsOn < startsOn) {
    setMessage('Das Ende muss am oder nach dem Beginn liegen.');
    (form.elements.namedItem('ends-on') as HTMLElement | null)?.focus();
    return false;
  }
  for (const input of form.querySelectorAll<HTMLInputElement>(
    'input[data-fee]',
  )) {
    if (!/^\d+(?:[,.]\d{1,2})?$/.test(input.value.trim())) {
      input.setCustomValidity('Betrag wie 25,00 oder 25.00 eingeben.');
      input.reportValidity();
      input.setCustomValidity('');
      return false;
    }
    if (!Number.isFinite(Number(input.value.trim().replace(',', '.')))) {
      input.reportValidity();
      return false;
    }
  }
  for (const input of form.querySelectorAll<HTMLInputElement>(
    'input[required]',
  )) {
    if (input.value.trim() === '') {
      input.setCustomValidity('Dieses Feld darf nicht leer sein.');
      input.reportValidity();
      input.setCustomValidity('');
      return false;
    }
  }
  return form.reportValidity();
}
