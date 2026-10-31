import { useEffect, useState, type ChangeEvent } from 'react';
import {
  defaultRegistrationFormConfig,
  mergeRegistrationFormConfig,
  RegistrationFormConfigSchema,
  RegistrationFormConfigPatchSchema,
  type RegistrationFormConfig,
} from '@racepilot/contracts';

const fieldLabels: Record<string, string> = {
  dateOfBirth: 'Geburtsdatum',
  phone: 'Telefon',
  street: 'Straße',
  postalCode: 'PLZ',
  city: 'Ort',
  country: 'Land',
  emergencyContact: 'Notfallkontakt',
  biography: 'Sportlicher Werdegang',
  organizerNotes: 'Hinweise an den Veranstalter',
  requestedStartNumber: 'Wunsch-Startnummer',
  make: 'Hersteller',
  model: 'Modell',
  year: 'Baujahr',
  displacement: 'Hubraum',
  cylinders: 'Zylinder',
  owner: 'Besitzer',
  history: 'Fahrzeughistorie',
  vehicleImage: 'Fahrzeugbild',
};

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
    void fetch('/admin/organization/registration-form-config', {
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
    void fetch(
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
  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const path =
        scope === 'organization'
          ? '/admin/organization/registration-form-config'
          : `/admin/events/${encodeURIComponent(eventId)}/registration-form-config`;
      const response = await fetch(path, {
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
    const response = await fetch('/admin/organization/registration-assets', {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    });
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
    <section
      className="registration-admin"
      aria-labelledby="registration-admin-title"
    >
      <h2 id="registration-admin-title">
        Nennformular · Erscheinungsbild und Felder
      </h2>
      <label>
        Geltungsbereich
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as typeof scope)}
        >
          <option value="organization">Organisation</option>
          <option value="event" disabled={!eventId}>
            Veranstaltung · überschreibt Organisation
          </option>
        </select>
      </label>
      <div className="registration-admin-grid">
        <label>
          Primärfarbe
          <input
            type="color"
            value={activeConfig.branding.primaryColor}
            onChange={(e) =>
              updateConfig((x) => ({
                ...x,
                branding: {
                  ...x.branding,
                  primaryColor: e.target.value.toUpperCase(),
                },
              }))
            }
          />
        </label>
        <label>
          Akzentfarbe
          <input
            type="color"
            value={activeConfig.branding.accentColor}
            onChange={(e) =>
              updateConfig((x) => ({
                ...x,
                branding: {
                  ...x.branding,
                  accentColor: e.target.value.toUpperCase(),
                },
              }))
            }
          />
        </label>
        <label>
          Ecken
          <select
            value={activeConfig.branding.corners}
            onChange={(e) =>
              updateConfig((x) => ({
                ...x,
                branding: {
                  ...x.branding,
                  corners: e.target.value as 'square' | 'rounded',
                },
              }))
            }
          >
            <option value="square">Eckig</option>
            <option value="rounded">6 px</option>
          </select>
        </label>
        <label>
          Überschriftenschrift
          <select value={activeConfig.branding.headingFont} disabled>
            <option value="archivo">Archivo · Brandbook M4</option>
          </select>
        </label>
        <label>
          Logo auf hellem Grund
          <input
            type="file"
            accept="image/svg+xml,image/png"
            onChange={(e) => void upload('logoLight', e)}
          />
        </label>
        <label>
          Logo auf dunklem Grund
          <input
            type="file"
            accept="image/svg+xml,image/png"
            onChange={(e) => void upload('logoDark', e)}
          />
        </label>
        <label>
          Kopfbild · optional
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void upload('headerImage', e)}
          />
        </label>
      </div>
      <label>
        Begrüßung
        <textarea
          maxLength={4000}
          value={activeConfig.welcomeText}
          onChange={(e) => change({ welcomeText: e.target.value })}
        />
      </label>
      <label>
        Hinweise des Veranstalters
        <textarea
          maxLength={10000}
          value={activeConfig.organizerNotice}
          onChange={(e) => change({ organizerNotice: e.target.value })}
        />
      </label>
      <h3>Felder · Pflicht, freiwillig oder aus</h3>
      <div className="registration-admin-fields">
        {Object.entries(activeConfig.fields).map(([key, field]) => (
          <label key={key}>
            {fieldLabels[key] ?? key}
            {key === 'dateOfBirth' ? (
              <span>
                Pflicht · für Alters- und Erziehungsberechtigtenprüfung
              </span>
            ) : (
              <select
                value={field.state}
                onChange={(e) =>
                  updateConfig((x) => ({
                    ...x,
                    fields: {
                      ...x.fields,
                      [key]: { state: e.target.value as typeof field.state },
                    },
                  }))
                }
              >
                <option value="required">Pflicht</option>
                <option value="optional">Freiwillig</option>
                <option value="hidden">Aus</option>
              </select>
            )}
          </label>
        ))}
      </div>
      <h3>Veranstaltungsoptionen</h3>
      <label>
        <input
          type="checkbox"
          checked={activeConfig.features.passenger}
          onChange={(e) =>
            updateConfig((x) => ({
              ...x,
              features: { ...x.features, passenger: e.target.checked },
            }))
          }
        />
        Beifahrer
      </label>
      <label>
        <input
          type="checkbox"
          checked={activeConfig.features.spareVehicle}
          onChange={(e) =>
            updateConfig((x) => ({
              ...x,
              features: { ...x.features, spareVehicle: e.target.checked },
            }))
          }
        />
        Ersatzfahrzeug
      </label>
      <label>
        <input
          type="checkbox"
          checked={activeConfig.features.multipleEntries}
          onChange={(e) =>
            updateConfig((x) => ({
              ...x,
              features: { ...x.features, multipleEntries: e.target.checked },
            }))
          }
        />
        Mehrere Starts
      </label>
      <div className="registration-actions">
        <button type="button" disabled={busy} onClick={() => void save()}>
          {busy ? 'Wird gespeichert …' : 'Änderungen speichern'}
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
