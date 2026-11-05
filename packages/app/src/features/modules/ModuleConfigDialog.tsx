import { Button, Dialog } from '@racepilot/ui';
import { SchemaFields } from './ModuleSchemaFields.js';
import { words, type ModuleLocale } from './moduleWords.js';
import type { Module } from './AdminModules.js';
import type { ReactNode } from 'react';

export function ModuleConfigDialog({
  selected,
  locale,
  config,
  configErrors,
  onClose,
  onSave,
  onChange,
}: {
  selected: Module;
  locale: ModuleLocale;
  config: unknown;
  configErrors: Record<string, string>;
  onClose: () => void;
  onSave: () => void;
  onChange: (path: string, value: unknown) => void;
}) {
  const t = words[locale];
  const actions: ReactNode = (
    <>
      <Button variant="secondary" onClick={onClose}>
        {t.close}
      </Button>
      <Button variant="primary" onClick={onSave}>
        {t.save}
      </Button>
    </>
  );
  return (
    <Dialog
      open
      title={selected.gallery.name[locale]}
      closeLabel={t.close}
      onClose={onClose}
      actions={actions}
    >
      <p>{selected.gallery.longDescription[locale]}</p>
      <p>
        {selected.gallery.editions
          .map((edition) => t.editions[edition] ?? edition)
          .join(', ')}{' '}
        ·{' '}
        {t.entitlements[
          selected.gallery.entitlement as keyof typeof t.entitlements
        ] ?? selected.gallery.entitlement}
      </p>
      <SchemaFields
        schema={selected.configSchema}
        value={config}
        path=""
        errors={configErrors}
        onChange={onChange}
      />
    </Dialog>
  );
}
