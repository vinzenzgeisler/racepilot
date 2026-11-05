import { adminFetch } from '../../auth.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModuleListResponse, EventSchema } from '@racepilot/contracts';
import type { ModuleViewSchema } from '@racepilot/contracts';
import {
  Button,
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  SelectField,
  StatusLabel,
  Tabs,
  TextInput,
} from '@racepilot/ui';
import { updatePath } from './ModuleSchemaFields.js';
import { ModuleConfigDialog } from './ModuleConfigDialog.js';
import {
  categories,
  categoryLabels,
  words,
  type ModuleLocale,
} from './moduleWords.js';

export type Module = ReturnType<typeof ModuleViewSchema.parse>;
export function AdminModules({
  locale = 'de',
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
      : '/admin/events/' + encodeURIComponent(eventId) + '/modules';
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
      .then((response) => (response.ok ? response.json() : []))
      .then((rows: unknown[]) => {
        const parsed = rows.map((row) => EventSchema.parse(row));
        setEvents(parsed.map(({ id, name }) => ({ id, name })));
        setEventId((current) => current || parsed[0]?.id || '');
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
        (module) =>
          (!category || module.gallery.category === category) &&
          (
            module.gallery.name[locale] +
            ' ' +
            module.gallery.shortDescription[locale] +
            ' ' +
            module.id
          )
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
        base + '/' + encodeURIComponent(module.id),
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
  const tabs = [
    { id: 'organization', label: t.organization, content: null },
    {
      id: 'event',
      label: t.event,
      content: (
        <SelectField
          label={t.chooseEvent}
          value={eventId}
          onChange={(event) => setEventId(event.target.value)}
        >
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </SelectField>
      ),
    },
  ];
  return (
    <section aria-labelledby="modules-title">
      <PageHeader id="modules-title" title={t.title} />
      <Tabs
        tabs={tabs}
        selected={scope}
        onChange={(next) => setScope(next as typeof scope)}
        label={t.scope}
      />
      <FilterBar label={t.filterLabel}>
        <TextInput
          label={t.search}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <SelectField
          label={t.category}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">{t.all}</option>
          {categories.map((value) => (
            <option key={value} value={value}>
              {categoryLabels[locale][value]}
            </option>
          ))}
        </SelectField>
      </FilterBar>
      {loading ? (
        <p role="status">{t.loading}</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : filtered.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyDescription} />
      ) : (
        <DataTable headers={[t.module, t.description, t.status, t.actions]}>
          {filtered.map((module) => (
            <tr key={module.id}>
              <td>
                <strong>{module.gallery.name[locale]}</strong>
              </td>
              <td>{module.gallery.shortDescription[locale]}</td>
              <td>
                {module.status === 'unavailable' ? (
                  <StatusLabel
                    status="missing"
                    label={t[module.unavailableReason ?? 'edition']}
                  />
                ) : module.enabled ? (
                  <StatusLabel status="done" label={t.active} />
                ) : (
                  <StatusLabel status="new" label={t.inactive} />
                )}
              </td>
              <td className="module-actions">
                <Button
                  variant="text"
                  size={40}
                  onClick={() => {
                    setSelected(module);
                    setConfig(module.config);
                    setConfigErrors({});
                  }}
                >
                  {t.details}
                </Button>
                {module.status === 'unavailable' ? (
                  module.unavailableReason === 'entitlement' && onUpgrade ? (
                    <Button
                      variant="secondary"
                      size={40}
                      onClick={() => onUpgrade(module.id)}
                    >
                      {t.upgrade}
                    </Button>
                  ) : null
                ) : module.enabled ? (
                  <Button
                    variant="danger"
                    size={40}
                    confirmation={{
                      title: t.disableTitle,
                      message: t.confirm,
                      reasonLabel: t.reason,
                      cancelLabel: t.cancel,
                      confirmLabel: t.disable,
                      closeLabel: t.close,
                    }}
                    onDangerConfirm={() =>
                      void change(module, { enabled: false })
                    }
                  >
                    {t.disable}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size={40}
                    onClick={() => void change(module, { enabled: true })}
                  >
                    {t.activate}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      {selected && (
        <ModuleConfigDialog
          selected={selected}
          locale={locale}
          config={config}
          configErrors={configErrors}
          onClose={() => setSelected(null)}
          onSave={() => void change(selected, { config })}
          onChange={(path, value) => {
            setConfig((previous: unknown) => updatePath(previous, path, value));
            setConfigErrors((previous) => {
              const next = { ...previous };
              delete next[path];
              return next;
            });
          }}
        />
      )}
      {error && !loading && <p role="alert">{error}</p>}
    </section>
  );
}
