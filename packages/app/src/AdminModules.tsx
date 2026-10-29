import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModuleListResponse, EventSchema } from '@racepilot/contracts';
import type { ModuleViewSchema } from '@racepilot/contracts';

type Module = typeof ModuleViewSchema extends { parse: (v: unknown) => infer T }
  ? T
  : never;
type Locale = 'de' | 'en';
const words = {
  de: {
    title: 'Add-on-Galerie',
    search: 'Module suchen',
    all: 'Alle Kategorien',
    organization: 'Organisation',
    event: 'Event',
    activate: 'Aktivieren',
    disable: 'Deaktivieren',
    configure: 'Konfiguration',
    close: 'Schließen',
    save: 'Speichern',
    details: 'Details',
    unavailable: 'Nicht verfügbar',
    entitlement: 'Entitlement erforderlich',
    dependency: 'Abhängigkeit nicht verfügbar',
    edition: 'In dieser Edition nicht verfügbar',
    confirm: 'Modul deaktivieren? Die Daten bleiben erhalten.',
    error: 'Module konnten nicht geladen werden.',
    loading: 'Module werden geladen…',
    upgrade: 'Upgrade erforderlich',
  },
  en: {
    title: 'Add-on gallery',
    search: 'Search modules',
    all: 'All categories',
    organization: 'Organization',
    event: 'Event',
    activate: 'Activate',
    disable: 'Disable',
    configure: 'Configuration',
    close: 'Close',
    save: 'Save',
    details: 'Details',
    unavailable: 'Unavailable',
    entitlement: 'Entitlement required',
    dependency: 'A dependency is unavailable',
    edition: 'Unavailable in this edition',
    confirm: 'Disable this module? Its data will be retained.',
    error: 'Modules could not be loaded.',
    loading: 'Loading modules…',
    upgrade: 'Upgrade required',
  },
} as const;
const categories = [
  'timing',
  'scrutineering',
  'communication',
  'payments',
  'operations',
  'other',
] as const;

export function AdminModules({
  locale = 'en',
  onUpgrade,
}: {
  locale?: Locale;
  onUpgrade?: (moduleId: string) => void;
}) {
  const t = words[locale];
  const [scope, setScope] = useState<'organization' | 'event'>('organization');
  const [events, setEvents] = useState<Array<{ id: string; name: string }>>([]);
  const [eventId, setEventId] = useState('');
  const [modules, setModules] = useState<Module[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<Module | null>(null);
  const [config, setConfig] = useState<unknown>({});
  const [configErrors, setConfigErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const base =
    scope === 'organization'
      ? '/admin/organization/modules'
      : `/admin/events/${encodeURIComponent(eventId)}/modules`;
  const load = useCallback(async () => {
    if (scope === 'event' && !eventId) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(base, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(String(response.status));
      setModules(ModuleListResponse.parse(await response.json()).modules);
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }, [base, eventId, scope, t.error]);
  useEffect(() => {
    void fetch('/admin/events', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown[]) => {
        const parsed = rows.map((row) => EventSchema.parse(row));
        setEvents(parsed.map(({ id, name }) => ({ id, name })));
        setEventId(parsed[0]?.id ?? '');
      })
      .catch(() => setEvents([]));
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const filtered = useMemo(
    () =>
      modules.filter(
        (m) =>
          (!category || m.gallery.category === category) &&
          `${m.gallery.name[locale]} ${m.gallery.shortDescription[locale]} ${m.id}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()),
      ),
    [modules, category, query, locale],
  );
  async function change(
    module: Module,
    payload: { enabled?: boolean; config?: unknown },
  ) {
    setError('');
    try {
      const response = await fetch(`${base}/${encodeURIComponent(module.id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          expectedVersion: module.stateVersion ?? 0,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          issues?: Array<{ path: string; message: string }>;
        } | null;
        if (payload.config !== undefined && body?.issues) {
          setConfigErrors(
            Object.fromEntries(
              body.issues.map((issue) => [issue.path, issue.message]),
            ),
          );
          return;
        }
        throw new Error(String(response.status));
      }
      await load();
      setSelected(null);
      setConfigErrors({});
    } catch {
      setError(t.error);
    }
  }
  return (
    <section aria-labelledby="modules-title">
      <h2 id="modules-title">{t.title}</h2>
      <label>
        {t.organization}
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as typeof scope)}
        >
          <option value="organization">{t.organization}</option>
          <option value="event">{t.event}</option>
        </select>
      </label>
      {scope === 'event' && (
        <label>
          {t.event}
          <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        {t.search}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <label>
        {t.all}
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{t.all}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      {loading ? (
        <p role="status">{t.loading}</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : (
        <div className="module-gallery">
          {filtered.map((module) => (
            <article key={module.id} className="module-card">
              <h3>
                <span aria-hidden="true">{module.gallery.icon}</span>{' '}
                {module.gallery.name[locale]}
              </h3>
              <p>{module.gallery.shortDescription[locale]}</p>
              <p>
                {module.status === 'unavailable'
                  ? `${t.unavailable}: ${t[module.unavailableReason ?? 'edition']}`
                  : module.status}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelected(module);
                  setConfig(module.config);
                  setConfigErrors({});
                }}
              >
                {t.details}
              </button>
              {module.status === 'unavailable' ? (
                module.unavailableReason === 'entitlement' && onUpgrade ? (
                  <button type="button" onClick={() => onUpgrade(module.id)}>
                    {t.upgrade}
                  </button>
                ) : null
              ) : module.enabled ? (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t.confirm))
                      void change(module, { enabled: false });
                  }}
                >
                  {t.disable}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void change(module, { enabled: true })}
                >
                  {t.activate}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {selected && (
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="module-detail-title"
        >
          <h3 id="module-detail-title">{selected.gallery.name[locale]}</h3>
          <p>{selected.gallery.longDescription[locale]}</p>
          <p>
            {selected.gallery.editions.join(', ')} ·{' '}
            {selected.gallery.entitlement}
          </p>
          {selected.gallery.screenshots?.map((src) => (
            <img key={src} src={src} alt="" />
          ))}
          <fieldset>
            <legend>{t.configure}</legend>
            <SchemaFields
              schema={selected.configSchema}
              value={config}
              path=""
              errors={configErrors}
              onChange={(path, value) => {
                setConfig((previous: unknown) =>
                  updatePath(previous, path, value),
                );
                setConfigErrors((previous) => {
                  const next = { ...previous };
                  delete next[path];
                  return next;
                });
              }}
            />
          </fieldset>
          <button
            type="button"
            onClick={() => void change(selected, { config })}
          >
            {t.save}
          </button>
          <button type="button" onClick={() => setSelected(null)}>
            {t.close}
          </button>
        </section>
      )}
      {error && !loading && <p role="alert">{error}</p>}
    </section>
  );
}

type JsonSchema = {
  type?: string;
  title?: string;
  description?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
};

function updatePath(root: unknown, path: string, value: unknown): unknown {
  const keys = path.split('.').filter(Boolean);
  if (keys.length === 0) return value;
  const current =
    root && typeof root === 'object' && !Array.isArray(root)
      ? (root as Record<string, unknown>)
      : {};
  const [key, ...rest] = keys;
  return {
    ...current,
    [key!]: rest.length
      ? updatePath(current[key!], rest.join('.'), value)
      : value,
  };
}

function SchemaFields({
  schema: rawSchema,
  value,
  path,
  errors,
  onChange,
}: {
  schema: unknown;
  value: unknown;
  path: string;
  errors: Record<string, string>;
  onChange: (path: string, value: unknown) => void;
}) {
  const schema =
    rawSchema && typeof rawSchema === 'object' ? (rawSchema as JsonSchema) : {};
  const objectValue =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  if (schema.type === 'object' && schema.properties) {
    return (
      <div>
        {Object.entries(schema.properties).map(([key, child]) => {
          const fieldPath = path ? `${path}.${key}` : key;
          return (
            <SchemaFields
              key={fieldPath}
              schema={child}
              value={objectValue[key]}
              path={fieldPath}
              errors={errors}
              onChange={onChange}
            />
          );
        })}
      </div>
    );
  }
  const id = `module-config-${path || 'root'}`;
  const label = schema.title ?? path.split('.').at(-1) ?? 'Configuration';
  const error = errors[path];
  const errorNode = error ? (
    <span id={`${id}-error`} role="alert">
      {error}
    </span>
  ) : null;
  const common = {
    id,
    'aria-describedby': error ? `${id}-error` : undefined,
    'aria-invalid': error ? true : undefined,
  };
  if (schema.enum)
    return (
      <label>
        {label}
        <select
          {...common}
          value={String(value ?? '')}
          onChange={(e) => onChange(path, e.target.value)}
        >
          <option value="" />
          {schema.enum.map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
        </select>
        {errorNode}
      </label>
    );
  if (schema.type === 'boolean')
    return (
      <label>
        {label}
        <input
          {...common}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(path, e.target.checked)}
        />
        {errorNode}
      </label>
    );
  if (schema.type === 'string')
    return (
      <label>
        {label}
        <input
          {...common}
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(path, e.target.value)}
        />
        {errorNode}
      </label>
    );
  if (schema.type === 'number' || schema.type === 'integer')
    return (
      <label>
        {label}
        <input
          {...common}
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(e) =>
            onChange(
              path,
              e.target.value === '' ? undefined : Number(e.target.value),
            )
          }
        />
        {errorNode}
      </label>
    );
  return (
    <label>
      {label}
      <textarea
        {...common}
        value={JSON.stringify(value ?? {}, null, 2)}
        onChange={(e) => {
          try {
            onChange(path, JSON.parse(e.target.value));
          } catch {
            /* Keep server-side validation authoritative. */
          }
        }}
      />
      {errorNode}
    </label>
  );
}
