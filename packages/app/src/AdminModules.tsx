import { adminFetch } from './auth.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModuleListResponse, EventSchema } from '@racepilot/contracts';
import type { ModuleViewSchema } from '@racepilot/contracts';
import { SchemaFields, updatePath } from './ModuleSchemaFields.js';
import { categories, words, type ModuleLocale } from './moduleWords.js';

type Module = typeof ModuleViewSchema extends { parse: (v: unknown) => infer T }
  ? T
  : never;
export function AdminModules({
  locale = 'en',
  onUpgrade,
}: {
  locale?: ModuleLocale;
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
      const response = await adminFetch(base, {
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
    void adminFetch('/admin/events', {
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
      const response = await adminFetch(
        `${base}/${encodeURIComponent(module.id)}`,
        {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            expectedVersion: module.stateVersion ?? 0,
          }),
        },
      );
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
