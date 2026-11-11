import { adminFetch } from '../../auth.js';
import { Button, PageHeader, SelectField, Stack } from '@racepilot/ui';
import { useEffect, useState, type ChangeEvent } from 'react';
import {
  defaultRegistrationFormConfig,
  mergeRegistrationFormConfig,
  RegistrationFormConfigSchema,
  RegistrationFormConfigPatchSchema,
  type RegistrationFormConfig,
  type RegistrationCustomField,
} from '@racepilot/contracts';
import { RegistrationAppearance } from './RegistrationAppearance.js';
import { RegistrationCustomFields } from './RegistrationCustomFields.js';
import {
  RegistrationFeatureOptions,
  RegistrationFormOptions,
} from './RegistrationFormOptions.js';
import { registrationFieldLabels } from './registrationFieldLabels.js';

export function RegistrationFormSettings({ eventId }: { eventId: string }) {
  const [config, setConfig] = useState<RegistrationFormConfig>(
    defaultRegistrationFormConfig,
  );
  const [organizationConfig, setOrganizationConfig] =
    useState<RegistrationFormConfig>(defaultRegistrationFormConfig);
  const [scope, setScope] = useState<'organization' | 'event'>('organization');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void adminFetch('/admin/organization/registration-form-config', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((body: { config: unknown }) => {
        if (active) {
          const parsed = RegistrationFormConfigSchema.parse(body.config);
          setOrganizationConfig(parsed);
        }
      })
      .catch(() => {
        if (active)
          setMessage(
            'Organisations-Einstellungen konnten nicht geladen werden.',
          );
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (scope !== 'event' || !eventId) return;
    let active = true;
    void adminFetch(
      `/admin/events/${encodeURIComponent(eventId)}/registration-form-config`,
      { credentials: 'same-origin', cache: 'no-store' },
    )
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((body: { config: unknown } | null) => {
        if (!active) return;
        setConfig(
          body
            ? mergeRegistrationFormConfig(
                organizationConfig,
                RegistrationFormConfigPatchSchema.parse(body.config),
              )
            : organizationConfig,
        );
      })
      .catch(() => {
        if (active)
          setMessage(
            'Veranstaltungs-Einstellungen konnten nicht geladen werden.',
          );
      });
    return () => {
      active = false;
    };
  }, [scope, eventId, organizationConfig]);

  const activeConfig = scope === 'organization' ? organizationConfig : config;
  const updateConfig = (
    updater: (current: RegistrationFormConfig) => RegistrationFormConfig,
  ) => {
    if (scope === 'organization')
      setOrganizationConfig((current) => updater(current));
    else setConfig((current) => updater(current));
  };
  const change = (patch: Partial<RegistrationFormConfig>) =>
    updateConfig((current) => ({ ...current, ...patch }));
  const updateCustomField = (
    key: string,
    patch: Partial<RegistrationCustomField>,
  ) =>
    updateConfig((current) => ({
      ...current,
      customFields: current.customFields.map((field) =>
        field.key === key ? { ...field, ...patch } : field,
      ),
    }));
  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const path =
        scope === 'organization'
          ? '/admin/organization/registration-form-config'
          : `/admin/events/${encodeURIComponent(eventId)}/registration-form-config`;
      const response = await adminFetch(path, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(activeConfig),
      });
      if (!response.ok) throw new Error();
      setMessage('Einstellungen gespeichert.');
    } catch {
      setMessage('Speichern momentan nicht möglich.');
    } finally {
      setBusy(false);
    }
  };
  const upload = async (
    kind: 'logoLight' | 'logoDark' | 'headerImage',
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set('kind', kind);
    form.set('file', file);
    const response = await adminFetch(
      '/admin/organization/registration-assets',
      {
        method: 'POST',
        credentials: 'same-origin',
        body: form,
      },
    );
    if (!response.ok) {
      setMessage('Datei konnte nicht sicher gespeichert werden.');
      return;
    }
    const body = (await response.json()) as { objectId: string };
    updateConfig((current) => ({
      ...current,
      branding: {
        ...current.branding,
        [kind === 'logoLight'
          ? 'logoLightObjectId'
          : kind === 'logoDark'
            ? 'logoDarkObjectId'
            : 'headerImageObjectId']: body.objectId,
      },
    }));
    setMessage('Datei hochgeladen. Änderungen anschließend speichern.');
  };
  if (!loaded)
    return (
      <section aria-busy="true">
        <p role="status">Einstellungen werden geladen …</p>
      </section>
    );
  return (
    <section aria-labelledby="registration-admin-title">
      <Stack gap={4}>
        <PageHeader
          id="registration-admin-title"
          title="Nennformular · Erscheinungsbild und Felder"
        />
        <SelectField
          label="Geltungsbereich"
          value={scope}
          onChange={(e) => setScope(e.target.value as typeof scope)}
        >
          <option value="organization">Organisation</option>
          <option value="event" disabled={!eventId}>
            Veranstaltung · überschreibt Organisation
          </option>
        </SelectField>
        <RegistrationAppearance
          activeConfig={activeConfig}
          updateConfig={updateConfig}
          change={change}
          upload={upload}
        />
        <RegistrationFormOptions
          config={activeConfig}
          updateConfig={updateConfig}
          fieldLabels={registrationFieldLabels}
        />
        <RegistrationCustomFields
          activeConfig={activeConfig}
          updateConfig={updateConfig}
          updateCustomField={updateCustomField}
          change={change}
        />
        <RegistrationFeatureOptions
          config={activeConfig}
          updateConfig={updateConfig}
        />
        <div>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? 'Wird gespeichert …' : 'Änderungen speichern'}
          </Button>
        </div>
        {message && <p role="status">{message}</p>}
      </Stack>
    </section>
  );
}
