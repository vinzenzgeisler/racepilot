import {
  Button,
  DateInput,
  FormSection,
  SelectField,
  TextInput,
  Textarea,
} from '@racepilot/ui';
import type { FormEvent } from 'react';
import type {
  PassengerMode,
  SetupDraft,
  VehicleType,
} from './eventSetupApi.js';

const vehicleTypes: Array<{ value: VehicleType; label: string }> = [
  { value: 'car', label: 'Auto' },
  { value: 'motorcycle', label: 'Motorrad' },
  { value: 'kart', label: 'Kart' },
  { value: 'other', label: 'Andere' },
];

const passengerModes: Array<{ value: PassengerMode; label: string }> = [
  { value: 'optional', label: 'Optional' },
  { value: 'required', label: 'Pflicht' },
  { value: 'none', label: 'Nein' },
];

export function EventSetupForm({
  draft,
  setDraft,
  events,
  busy,
  onResume,
  onReset,
  onSubmit,
}: {
  draft: SetupDraft;
  setDraft: (draft: SetupDraft | ((current: SetupDraft) => SetupDraft)) => void;
  events: Array<{ id: string; name: string; status: string }>;
  busy: boolean;
  onResume: (id: string) => void;
  onReset: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>, open: boolean) => void;
}) {
  const updateClass = (
    index: number,
    patch: Partial<SetupDraft['classes'][number]>,
  ) =>
    setDraft((current) => ({
      ...current,
      classes: current.classes.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      ),
    }));

  return (
    <>
      <div>
        <SelectField
          label="Gespeicherten Entwurf fortsetzen"
          value={draft.id ?? ''}
          disabled={busy}
          onChange={(event) => {
            const id = event.target.value;
            if (id) onResume(id);
            else onReset();
          }}
        >
          <option value="">Neue Veranstaltung einrichten</option>
          {events
            .filter((event) => event.status === 'draft')
            .map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
        </SelectField>
      </div>
      <form
        onSubmit={(event) => {
          const nativeEvent = event.nativeEvent;
          const submitter =
            nativeEvent instanceof SubmitEvent ? nativeEvent.submitter : null;
          onSubmit(
            event,
            submitter instanceof HTMLButtonElement &&
              submitter.value === 'open',
          );
        }}
        noValidate={false}
      >
        <section id="event-setup-event" className="event-setup-section">
          <FormSection title="Veranstaltung">
            <TextInput
              required
              label="Name"
              name="event-name"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                  slug: current.slug || slugify(event.target.value),
                }))
              }
            />
            <TextInput
              required
              label="Link-Kürzel"
              name="event-slug"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              title="Nur Kleinbuchstaben, Zahlen und Bindestriche verwenden."
              value={draft.slug}
              hint="Zum Beispiel: rallye-2027"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  slug: event.target.value.toLowerCase(),
                }))
              }
            />
            <DateInput
              required
              label="Beginn"
              name="starts-on"
              value={draft.startsOn}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  startsOn: event.target.value,
                }))
              }
            />
            <DateInput
              required
              label="Ende"
              name="ends-on"
              min={draft.startsOn || undefined}
              value={draft.endsOn}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  endsOn: event.target.value,
                }))
              }
            />
          </FormSection>
        </section>
        <section
          id="event-setup-classes"
          className="event-setup-section event-setup-classes"
        >
          <FormSection title="Klassen und Startgeld">
            {draft.classes.map((item, index) => (
              <div key={item.id ?? index}>
                <TextInput
                  required
                  label="Klassenname"
                  value={item.name}
                  onChange={(event) =>
                    updateClass(index, { name: event.target.value })
                  }
                />
                <TextInput
                  required
                  label="Kürzel"
                  pattern="[A-Za-z0-9][A-Za-z0-9_-]*"
                  value={item.code}
                  onChange={(event) =>
                    updateClass(index, { code: event.target.value.trim() })
                  }
                />
                <SelectField
                  label="Fahrzeugtyp"
                  value={item.vehicleType}
                  onChange={(event) =>
                    updateClass(index, {
                      vehicleType:
                        parseVehicleType(event.target.value) ??
                        item.vehicleType,
                    })
                  }
                >
                  {vehicleTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Beifahrer"
                  value={item.passengerMode ?? 'optional'}
                  onChange={(event) =>
                    updateClass(index, {
                      passengerMode:
                        passengerModes.find(
                          (mode) => mode.value === event.target.value,
                        )?.value ?? 'optional',
                    })
                  }
                >
                  {passengerModes.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </SelectField>
                <TextInput
                  required
                  label="Startgeld in Euro"
                  data-fee
                  inputMode="decimal"
                  pattern="[0-9]+([,.][0-9]{1,2})?"
                  title="Betrag wie 25,00 oder 25.00 eingeben."
                  value={item.fee}
                  onChange={(event) =>
                    updateClass(index, { fee: event.target.value })
                  }
                />
                {draft.classes.length > 1 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size={40}
                    disabled={busy || Boolean(item.id)}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        classes: current.classes.filter(
                          (_, position) => position !== index,
                        ),
                      }))
                    }
                  >
                    Klasse entfernen
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size={40}
              disabled={busy}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  classes: [
                    ...current.classes,
                    { name: '', code: '', fee: '', vehicleType: 'car' },
                  ],
                }))
              }
            >
              Klasse hinzufügen
            </Button>
          </FormSection>
        </section>
        <section id="event-setup-terms" className="event-setup-section">
          <FormSection title="Teilnahmebedingungen">
            <Textarea
              label="Text der Bedingungen"
              rows={7}
              value={draft.terms}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  terms: event.target.value,
                }))
              }
              hint="Für einen Entwurf optional. Vor dem Öffnen der Nennung müssen verwendbare Teilnahmebedingungen hinterlegt sein."
            />
          </FormSection>
        </section>
        <div id="event-setup-actions" className="event-setup-actions">
          <Button type="submit" variant="secondary" size={40} disabled={busy}>
            Entwurf speichern
          </Button>
          <Button
            type="submit"
            name="setup-action"
            value="open"
            variant="primary"
            size={40}
            disabled={busy}
          >
            Speichern und Nennung öffnen
          </Button>
        </div>
      </form>
    </>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseVehicleType(value: string): VehicleType | null {
  return vehicleTypes.find((type) => type.value === value)?.value ?? null;
}
