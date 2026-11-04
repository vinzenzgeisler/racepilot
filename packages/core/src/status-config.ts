import { entryStatusMeanings } from './workflow-model.js';
import { EntryStatusMeaning } from './workflow-model.js';

export const entryStatusDimensionKeys = [
  'payment',
  'technical_inspection',
  'waiver',
  'email_verification',
] as const;

export type EntryStatusDimensionKey = (typeof entryStatusDimensionKeys)[number];

export interface EntryStatusValue {
  readonly key: string;
  readonly labels: { readonly de: string; readonly en: string };
  readonly meaning: EntryStatusMeaning;
}

export interface EntryStatusDimensionDefinition {
  readonly key: EntryStatusDimensionKey;
  readonly required: boolean;
  readonly values: readonly EntryStatusValue[];
  readonly transitions: readonly {
    readonly from: string;
    readonly to: string;
  }[];
}

export interface EntryStatusDimensionConfig {
  readonly version: 1;
  readonly dimensions: readonly EntryStatusDimensionDefinition[];
}

const statusValue = (
  key: string,
  de: string,
  en: string,
  meaning: EntryStatusMeaning,
): EntryStatusValue => ({ key, labels: { de, en }, meaning });

export const defaultEntryStatusDimensionConfig: EntryStatusDimensionConfig =
  Object.freeze<EntryStatusDimensionConfig>({
    version: 1,
    dimensions: [
      {
        key: 'payment',
        required: true,
        values: [
          statusValue('open', 'Offen', 'Open', 'missing'),
          statusValue(
            'partially_paid',
            'Teilweise bezahlt',
            'Partially paid',
            'missing',
          ),
          statusValue('paid', 'Bezahlt', 'Paid', 'done'),
          statusValue(
            'not_required',
            'Keine erforderlich',
            'Not required',
            'not_relevant',
          ),
          statusValue(
            'not_relevant',
            'Nicht relevant',
            'Not relevant',
            'not_relevant',
          ),
        ],
        transitions: [],
      },
      {
        key: 'technical_inspection',
        required: true,
        values: [
          statusValue('pending', 'Ausstehend', 'Pending', 'missing'),
          statusValue(
            'reinspection',
            'Nachprüfung',
            'Reinspection',
            'in_progress',
          ),
          statusValue('passed', 'Bestanden', 'Passed', 'done'),
          statusValue(
            'not_relevant',
            'Nicht relevant',
            'Not relevant',
            'not_relevant',
          ),
        ],
        transitions: [
          { from: 'pending', to: 'reinspection' },
          { from: 'pending', to: 'passed' },
          { from: 'pending', to: 'not_relevant' },
          { from: 'reinspection', to: 'passed' },
          { from: 'reinspection', to: 'not_relevant' },
        ],
      },
      {
        key: 'waiver',
        required: true,
        values: [
          statusValue('f_pending', 'F · Ausstehend', 'F · Pending', 'missing'),
          statusValue('f_signed', 'F · Unterschrieben', 'F · Signed', 'done'),
          statusValue(
            'bf_signed',
            'BF · Unterschrieben',
            'BF · Signed',
            'done',
          ),
          statusValue(
            'not_relevant',
            'Nicht relevant',
            'Not relevant',
            'not_relevant',
          ),
        ],
        transitions: [
          { from: 'f_pending', to: 'f_signed' },
          { from: 'f_pending', to: 'bf_signed' },
          { from: 'f_pending', to: 'not_relevant' },
        ],
      },
      {
        key: 'email_verification',
        required: true,
        values: [
          statusValue('unverified', 'Unbestätigt', 'Unverified', 'missing'),
          statusValue('verified', 'Verifiziert', 'Verified', 'done'),
        ],
        transitions: [],
      },
    ],
  });

export function validateEntryStatusDimensionConfig(
  config: EntryStatusDimensionConfig,
): string[] {
  const errors: string[] = [];
  if (config.version !== 1) errors.push('Unsupported status dimension version');
  const dimensions = new Set<EntryStatusDimensionKey>();
  for (const definition of config.dimensions) {
    if (!entryStatusDimensionKeys.includes(definition.key)) {
      errors.push(`Unknown status dimension: ${definition.key}`);
      continue;
    }
    if (dimensions.has(definition.key))
      errors.push(`Duplicate status dimension: ${definition.key}`);
    dimensions.add(definition.key);
    const values = new Set<string>();
    for (const value of definition.values) {
      if (!/^[a-z][a-z0-9_-]{0,63}$/.test(value.key) || values.has(value.key))
        errors.push(
          `Invalid or duplicate ${definition.key} value: ${value.key}`,
        );
      values.add(value.key);
      if (!entryStatusMeanings.includes(value.meaning))
        errors.push(`Invalid meaning for ${definition.key}.${value.key}`);
      if (!value.labels.de.trim() || !value.labels.en.trim())
        errors.push(`Missing labels for ${definition.key}.${value.key}`);
    }
    const edges = new Set<string>();
    for (const transition of definition.transitions) {
      const edge = `${transition.from}\0${transition.to}`;
      if (!values.has(transition.from) || !values.has(transition.to))
        errors.push(`Unknown ${definition.key} transition value`);
      if (edges.has(edge))
        errors.push(`Duplicate ${definition.key} transition`);
      edges.add(edge);
    }
    if (
      definition.key === 'payment' ||
      definition.key === 'email_verification'
    ) {
      if (definition.transitions.length)
        errors.push(
          `${definition.key} is derived and cannot define transitions`,
        );
    }
  }
  for (const key of entryStatusDimensionKeys)
    if (!dimensions.has(key)) errors.push(`Missing status dimension: ${key}`);
  const requiredValues: Partial<
    Record<EntryStatusDimensionKey, readonly string[]>
  > = {
    payment: ['open', 'partially_paid', 'paid', 'not_required', 'not_relevant'],
    email_verification: ['unverified', 'verified'],
    technical_inspection: ['pending', 'reinspection', 'passed', 'not_relevant'],
    waiver: ['f_pending', 'f_signed', 'bf_signed', 'not_relevant'],
  };
  for (const definition of config.dimensions) {
    const keys = new Set(definition.values.map(({ key }) => key));
    for (const key of requiredValues[definition.key] ?? [])
      if (!keys.has(key))
        errors.push(`Missing required ${definition.key} value: ${key}`);
  }
  return [...new Set(errors)];
}

export interface EntryStatusDimensionProjection {
  readonly key: 'entry' | EntryStatusDimensionKey;
  readonly value: string;
  readonly label: { readonly de: string; readonly en: string };
  readonly meaning: EntryStatusMeaning;
  readonly required: boolean;
  readonly nextAction: {
    readonly key: string;
    readonly label: { readonly de: string; readonly en: string };
  } | null;
}

export interface EntryStatusProjection {
  readonly dimensions: readonly EntryStatusDimensionProjection[];
  readonly documents: { readonly complete: number; readonly total: number };
  readonly hints: readonly EntryStatusHint[];
}

export type EntryStatusHintKey = 'double_starter' | 'passenger' | 'late_entry';

export interface EntryStatusHint {
  readonly key: EntryStatusHintKey;
  readonly present: boolean;
}
