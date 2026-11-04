import {
  EntryStatusDimensionConfig,
  EntryStatusDimensionKey,
  EntryStatusDimensionProjection,
  EntryStatusHintKey,
  EntryStatusProjection,
} from './status-config.js';
import {
  EntryWorkflow,
  normalizeEntryWorkflow,
  entryStatusMeanings,
  entryWorkflowCategories,
} from './workflow-model.js';

/** Produces status meaning and actionable summaries without making hints into statuses. */
export function projectEntryStatuses(input: {
  readonly workflow: EntryWorkflow;
  readonly acceptanceStatus: string;
  readonly paymentStatus: string;
  readonly technicalStatus: string;
  readonly waiverStatus: string;
  readonly emailStatus: string;
  readonly config: EntryStatusDimensionConfig;
  readonly hints?: Partial<Record<EntryStatusHintKey, boolean>>;
}): EntryStatusProjection {
  const config = new Map(
    input.config.dimensions.map((item) => [item.key, item]),
  );
  const workflow = normalizeEntryWorkflow(input.workflow);
  const entryStatus = workflow.statuses.find(
    (item) => item.key === input.acceptanceStatus,
  );
  if (!entryStatus)
    throw new Error(`Unknown entry status: ${input.acceptanceStatus}`);
  const pick = (key: EntryStatusDimensionKey, valueKey: string) => {
    const definition = config.get(key);
    const value = definition?.values.find((item) => item.key === valueKey);
    if (!definition || !value)
      throw new Error(`Unknown ${key} status: ${valueKey}`);
    return { definition, value };
  };
  const entryTransitions = workflow.transitions.filter(
    (edge) => edge.from === input.acceptanceStatus,
  );
  const dimensions: EntryStatusDimensionProjection[] = [
    {
      key: 'entry',
      value: entryStatus.key,
      label: entryStatus.labels,
      meaning: entryStatus.meaning!,
      required: true,
      nextAction: entryTransitions[0]
        ? {
            key: `entry:${entryTransitions[0].to}`,
            label: {
              de: `Status auf ${workflow.statuses.find((s) => s.key === entryTransitions[0]!.to)?.labels.de ?? entryTransitions[0].to} setzen`,
              en: `Set status to ${workflow.statuses.find((s) => s.key === entryTransitions[0]!.to)?.labels.en ?? entryTransitions[0].to}`,
            },
          }
        : null,
    },
    ...(
      [
        'payment',
        'technical_inspection',
        'waiver',
        'email_verification',
      ] as const
    ).map((key) => {
      const actual = {
        payment: input.paymentStatus,
        technical_inspection: input.technicalStatus,
        waiver: input.waiverStatus,
        email_verification: input.emailStatus,
      }[key];
      const { definition, value } = pick(key, actual);
      const edge = definition.transitions.find(
        (transition) => transition.from === actual,
      );
      const actionLabels: Partial<
        Record<EntryStatusDimensionKey, { de: string; en: string }>
      > = {
        payment: { de: 'Zahlung erfassen', en: 'Record payment' },
        technical_inspection: {
          de: 'Technische Abnahme durchführen',
          en: 'Perform technical inspection',
        },
        waiver: { de: 'Haftverzicht einholen', en: 'Collect waiver' },
        email_verification: { de: 'E-Mail verifizieren', en: 'Verify email' },
      };
      return {
        key,
        value: actual,
        label: value.labels,
        meaning: value.meaning,
        required: definition.required,
        nextAction: edge
          ? {
              key: `${key}:${edge.to}`,
              label: actionLabels[key] ?? value.labels,
            }
          : key === 'payment' && ['open', 'partially_paid'].includes(actual)
            ? { key: 'payment:record', label: actionLabels.payment! }
            : key === 'email_verification' && actual === 'unverified'
              ? {
                  key: 'email_verification:verify',
                  label: actionLabels.email_verification!,
                }
              : null,
      };
    }),
  ];
  const documents = dimensions.filter(
    (item) =>
      ['payment', 'technical_inspection', 'waiver'].includes(item.key) &&
      item.required &&
      item.meaning !== 'not_relevant',
  );
  const hints = (['double_starter', 'passenger', 'late_entry'] as const).map(
    (key) => ({
      key,
      present: input.hints?.[key] === true,
    }),
  );
  return {
    dimensions,
    documents: {
      complete: documents.filter(
        (item) => item.meaning === 'done' || item.meaning === 'not_relevant',
      ).length,
      total: documents.length,
    },
    hints,
  };
}

export function validateEntryWorkflow(workflow: EntryWorkflow): string[] {
  const errors: string[] = [],
    keys = new Set<string>(),
    edges = new Map<string, string[]>(),
    pairs = new Set<string>();
  for (const status of workflow.statuses) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(status.key) || keys.has(status.key))
      errors.push(`Invalid or duplicate status key: ${status.key}`);
    keys.add(status.key);
    if (!entryWorkflowCategories.includes(status.category))
      errors.push(`Invalid category: ${status.category}`);
    if (
      status.meaning !== undefined &&
      !entryStatusMeanings.includes(status.meaning)
    )
      errors.push(`Invalid meaning: ${status.key}`);
    if (!/^#[0-9a-f]{6}$/i.test(status.color))
      errors.push(`Invalid color: ${status.key}`);
    if (!status.labels.de.trim() || !status.labels.en.trim())
      errors.push(`Missing localized label: ${status.key}`);
  }
  if (
    !workflow.statuses.some(
      (status) => status.key === 'pending' && status.category === 'pending',
    )
  )
    errors.push('Workflow must include the pending system status');
  if (!Number.isInteger(workflow.version) || workflow.version < 1)
    errors.push('Invalid workflow version');
  for (const edge of workflow.transitions) {
    if (!keys.has(edge.from) || !keys.has(edge.to))
      errors.push(`Orphan transition: ${edge.from} -> ${edge.to}`);
    const pair = `${edge.from}\0${edge.to}`;
    if (typeof edge.reasonRequired !== 'boolean')
      errors.push(`Invalid reason requirement: ${edge.from} -> ${edge.to}`);
    if (
      edge.permission !== undefined &&
      (typeof edge.permission !== 'string' ||
        !/^[a-z][a-z0-9:._-]{0,99}$/.test(edge.permission))
    )
      errors.push(`Invalid permission: ${edge.from} -> ${edge.to}`);
    if (pairs.has(pair))
      errors.push(`Duplicate transition: ${edge.from} -> ${edge.to}`);
    pairs.add(pair);
    edges.set(edge.from, [...(edges.get(edge.from) ?? []), edge.to]);
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (key: string): void => {
    if (visiting.has(key)) {
      errors.push('Workflow transitions must be acyclic');
      return;
    }
    if (visited.has(key)) return;
    visiting.add(key);
    for (const next of edges.get(key) ?? []) visit(next);
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of keys) visit(key);
  const start = 'pending';
  const reachable = new Set<string>();
  const walk = (key: string): void => {
    if (reachable.has(key)) return;
    reachable.add(key);
    for (const next of edges.get(key) ?? []) walk(next);
  };
  if (start) walk(start);
  for (const category of entryWorkflowCategories)
    if (
      !workflow.statuses.some(
        (status) => status.category === category && reachable.has(status.key),
      )
    )
      errors.push(`Unreachable category: ${category}`);
  if ([...keys].some((key) => !reachable.has(key)))
    errors.push('Workflow contains unreachable statuses');
  return [...new Set(errors)];
}

export function assertWorkflowTransition(
  workflow: EntryWorkflow,
  from: string,
  to: string,
  reason: string,
): void {
  const edge = workflow.transitions.find(
    (item) => item.from === from && item.to === to,
  );
  if (!edge)
    throw new Error(`Invalid entry acceptance transition: ${from} -> ${to}`);
  if (edge.reasonRequired && !reason.trim())
    throw new Error('Transition reason is required');
}
