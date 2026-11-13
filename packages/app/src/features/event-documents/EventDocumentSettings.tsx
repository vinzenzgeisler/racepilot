import {
  Banner,
  Button,
  Checkbox,
  FormItem,
  FormSection,
  PageHeader,
  Stack,
  TextInput,
  Textarea,
} from '@racepilot/ui';
import {
  MAX_DOCUMENT_TYPES,
  newDraft,
  type DocumentTypeDraft,
} from './documentTypeModel.js';
import { useEventDocumentSettings } from './useEventDocumentSettings.js';

export function EventDocumentSettings({ eventId }: { eventId: string }) {
  const settings = useEventDocumentSettings(eventId);
  if (!eventId) return null;
  if (settings.state === 'loading')
    return <p role="status">Unterlagen werden geladen …</p>;
  if (settings.state === 'error')
    return <Banner tone="error">{settings.message}</Banner>;
  const update = (index: number, patch: Partial<DocumentTypeDraft>) =>
    settings.setTypes(
      settings.types.map((type, position) =>
        position === index ? { ...type, ...patch } : type,
      ),
    );
  return (
    <section aria-labelledby="event-documents-title">
      <Stack gap={4}>
        <PageHeader
          id="event-documents-title"
          title="Unterlagen und Orga-Code"
        />
        <FormSection
          title="Nennungsunterlagen"
          description="Aktive Unterlagen erscheinen bei jeder Nennung. Deaktivierte Typen erscheinen nicht bei neuen Nennungen; vorhandene Uploads bleiben im Verlauf erhalten."
        >
          {settings.types.map((type, index) => (
            <FormItem
              key={type.saved ? type.key : `new-${index}`}
              label={`Unterlage ${index + 1}`}
            >
              <TextInput
                label="Name"
                value={type.name}
                maxLength={120}
                disabled={settings.saving}
                onChange={(event) =>
                  update(index, { name: event.target.value })
                }
              />
              <Checkbox
                label="Pflichtunterlage"
                checked={type.required}
                disabled={settings.saving}
                onChange={(event) =>
                  update(index, { required: event.target.checked })
                }
              />
              <Textarea
                label="Hinweis für Teilnehmende"
                value={type.hint}
                maxLength={500}
                disabled={settings.saving}
                onChange={(event) =>
                  update(index, { hint: event.target.value })
                }
              />
              <Checkbox
                label="Aktiv"
                checked={type.active}
                disabled={settings.saving}
                onChange={(event) =>
                  update(index, { active: event.target.checked })
                }
              />
              {settings.errors[index] && (
                <Banner tone="error">{settings.errors[index]}</Banner>
              )}
            </FormItem>
          ))}
          <Button
            type="button"
            variant="secondary"
            size={40}
            disabled={
              settings.saving || settings.types.length >= MAX_DOCUMENT_TYPES
            }
            onClick={() => settings.setTypes([...settings.types, newDraft()])}
          >
            Unterlage hinzufügen
          </Button>
        </FormSection>
        <FormSection
          title="Orga-Code"
          description="Der Präfix gilt für neu vergebene Orga-Codes; bestehende Codes bleiben unverändert."
        >
          <TextInput
            label="Präfix"
            value={settings.prefix}
            maxLength={12}
            hint="Bis zu 12 Buchstaben oder Ziffern. Leer verwendet das Veranstaltungskürzel."
            disabled={settings.saving}
            onChange={(event) => settings.setPrefix(event.target.value)}
          />
          {settings.prefixProblem && (
            <Banner tone="error">{settings.prefixProblem}</Banner>
          )}
        </FormSection>
        <div>
          <Button
            type="button"
            disabled={settings.saving || !settings.valid}
            onClick={() => void settings.save()}
          >
            {settings.saving ? 'Wird gespeichert …' : 'Unterlagen speichern'}
          </Button>
        </div>
        {settings.message && <Banner tone="error">{settings.message}</Banner>}
        {settings.saved && (
          <p role="status">Unterlagen und Orga-Code gespeichert.</p>
        )}
      </Stack>
    </section>
  );
}
