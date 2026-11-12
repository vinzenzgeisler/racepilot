import { useEffect } from 'react';
import type { FormEvent } from 'react';
import { Banner } from '@racepilot/ui';
import type { SetupEvent } from './eventSetupApi.js';
import { useEventSetup } from './useEventSetup.js';
import { EventSetupForm } from './EventSetupForm.js';
import './EventSetup.css';

const sections = [
  { id: 'event-setup-event', label: 'Veranstaltung' },
  { id: 'event-setup-classes', label: 'Klassen und Startgeld' },
  { id: 'event-setup-terms', label: 'Teilnahmebedingungen' },
  { id: 'event-setup-actions', label: 'Nennung öffnen' },
];

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
    <section className="event-setup" aria-label="Veranstaltung einrichten">
      <div className="event-setup-layout">
        <nav className="event-setup-nav" aria-label="Abschnittsnavigation">
          <p className="event-setup-nav-title">Einrichtung</p>
          {sections.map((section, index) => (
            <a key={section.id} href={`#${section.id}`}>
              <span aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              {section.label}
            </a>
          ))}
        </nav>
        <div className="event-setup-main">
          <p className="event-setup-intro">
            Veranstaltungsdaten, Klassen und Teilnahmebedingungen an einem Ort
            einrichten. Vor dem Öffnen prüfen wir die Pflichtangaben.
          </p>
          <EventSetupForm
            draft={setup.draft}
            setDraft={setup.setDraft}
            events={setup.events}
            busy={setup.busy}
            onResume={(id) =>
              void setup.resume(id).catch((error: unknown) => {
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
            <p className="event-setup-public-link">
              Öffentliche Nennung:{' '}
              <a href={setup.link} target="_blank" rel="noreferrer">
                {setup.link}
              </a>
            </p>
          )}
        </div>
        <aside className="event-setup-aside" aria-label="Hilfe und Vorschau">
          <section
            className="event-setup-help"
            aria-labelledby="event-setup-help-title"
          >
            <p className="event-setup-aside-label">Hilfe</p>
            <h2 id="event-setup-help-title">Vor dem Öffnen</h2>
            <p>
              Mindestens eine offene Klasse braucht ein Startgeld. Hinterlege
              veröffentlichte Teilnahmebedingungen, bevor du die Nennung
              freischaltest.
            </p>
            <p>
              Das Startgeld dokumentiert den Preis; es löst keine Online-Zahlung
              aus.
            </p>
          </section>
          <section
            className="event-setup-preview"
            aria-labelledby="event-setup-preview-title"
          >
            <p className="event-setup-aside-label">Vorschau</p>
            <h2 id="event-setup-preview-title">Öffentliche Nennung</h2>
            <div className="event-setup-preview-card">
              <strong>{setup.draft.name || 'Name der Veranstaltung'}</strong>
              <span>
                {setup.draft.startsOn || 'Beginn'}
                {setup.draft.endsOn ? ` – ${setup.draft.endsOn}` : ''}
              </span>
              <span>
                {setup.draft.classes.length} Klasse
                {setup.draft.classes.length === 1 ? '' : 'n'}
              </span>
              {setup.draft.classes.slice(0, 3).map((item, index) => (
                <span key={item.id ?? `${item.code}-${index}`}>
                  {item.name || 'Klassenname'} · {item.fee || '0,00'} €
                </span>
              ))}
              {setup.draft.classes.length > 3 && (
                <span>+ {setup.draft.classes.length - 3} weitere</span>
              )}
            </div>
            <p className="event-setup-preview-note">
              Die Vorschau zeigt die wichtigsten Angaben vor dem
              Veröffentlichen.
            </p>
          </section>
        </aside>
      </div>
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
    const endDate = form.elements.namedItem('ends-on');
    if (endDate instanceof HTMLElement) endDate.focus();
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
