import {
  ActionGroup,
  NextStep,
  NextStepButton,
  RailAction,
  RailNote,
} from '@racepilot/ui';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import type { WorkflowView } from '../AdminEntriesModel.js';
import {
  dimensionAction,
  type DimensionAction,
} from './EntryDocumentsSection.js';
import { missingRequirements } from './entryDetailModel.js';

export type StatusStep = { to: string; label: string; danger: boolean };

const EDGE_LABEL: Record<string, (status: string) => string> = {
  accepted: () => 'Zulassen',
  pending: (status) => `Zurück auf ${status}`,
  waitlisted: () => 'Auf Warteliste setzen',
  rejected: () => 'Ablehnen …',
  withdrawn: () => 'Als abgesagt markieren …',
};

/** Status changes the workflow allows from the current status, primary step first. */
export function statusSteps(
  entry: Entry,
  workflow: WorkflowView | null,
): { primary: StatusStep | null; others: StatusStep[] } {
  const nextKey = entry.statusProjection?.dimensions
    .find((item) => item.key === 'entry')
    ?.nextAction?.key.replace(/^entry:/, '');
  const steps = (workflow?.transitions ?? [])
    .filter((edge) => edge.from === entry.acceptanceStatus)
    .filter(
      (edge) =>
        !entry.availableActions ||
        entry.availableActions.includes(`acceptance:${edge.to}`),
    )
    .map((edge): StatusStep => {
      const target = workflow?.statuses.find((item) => item.key === edge.to);
      const label = target?.labels.de ?? edge.to;
      return {
        to: edge.to,
        label:
          EDGE_LABEL[target?.category ?? '']?.(label) ??
          `Status auf ${label} setzen`,
        danger:
          target?.category === 'rejected' || target?.category === 'withdrawn',
      };
    });
  // A destructive outcome is never offered as the highlighted next step.
  const candidate = steps.find((step) => step.to === nextKey) ?? null;
  const primary = candidate && !candidate.danger ? candidate : null;
  return { primary, others: steps.filter((step) => step !== primary) };
}

export function EntryActionRail({
  entry,
  workflow,
  busy,
  onStatus,
  onVerify,
  onPayment,
  onDimension,
  onAdminAction,
}: {
  entry: Entry;
  workflow: WorkflowView | null;
  busy: boolean;
  onStatus: (step: StatusStep) => void;
  onVerify: () => void;
  onPayment: () => void;
  onDimension: (action: DimensionAction) => void;
  onAdminAction: (
    kind: 'change_class' | 'adjust_amount' | 'note' | 'delete',
  ) => void;
}) {
  const { primary, others } = statusSteps(entry, workflow);
  const missing = missingRequirements(entry);
  const invoice = entry.adminDetails?.invoice;
  const onSite = (entry.statusProjection?.dimensions ?? []).flatMap((item) => {
    const action = dimensionAction(item);
    return action && item.required ? [action] : [];
  });
  const canPay =
    invoice &&
    (invoice.status === 'open' || invoice.status === 'partially_paid');
  const canVerify = entry.verificationStatus !== 'verified';
  return (
    <>
      <NextStep
        label="Nächster Schritt"
        action={
          primary ? (
            <NextStepButton disabled={busy} onClick={() => onStatus(primary)}>
              {primary.label}
            </NextStepButton>
          ) : undefined
        }
        hint={
          primary
            ? missing
              ? `Es fehlt noch ${missing}. Du kannst trotzdem fortfahren; die Nennung bleibt dann als unvollständig markiert.`
              : 'Die Entscheidung wird im Verlauf protokolliert.'
            : 'Keine weitere Statusaktion verfügbar.'
        }
      />
      {onSite.length > 0 && (
        <ActionGroup title="Vor Ort">
          {onSite.map((action) => (
            <RailAction
              key={action.dimension}
              disabled={busy}
              onClick={() => onDimension(action)}
            >
              {action.label}
            </RailAction>
          ))}
        </ActionGroup>
      )}
      {(canPay || canVerify) && (
        <ActionGroup title="Prüfung und Zahlung">
          {canVerify && (
            <RailAction disabled={busy} onClick={onVerify}>
              E-Mail verifizieren
            </RailAction>
          )}
          {canPay && (
            <RailAction disabled={busy} onClick={onPayment}>
              Zahlung erfassen
            </RailAction>
          )}
        </ActionGroup>
      )}
      {others.length > 0 && (
        <ActionGroup title="Status">
          {others.map((step) => (
            <RailAction
              key={step.to}
              tone={step.danger ? 'danger' : 'default'}
              disabled={busy}
              onClick={() => onStatus(step)}
            >
              {step.label}
            </RailAction>
          ))}
        </ActionGroup>
      )}
      {(entry.availableActions ?? []).some(
        (action) =>
          action.startsWith('change_class:') ||
          [
            'change_class',
            'adjust_amount',
            'note:internal',
            'note:driver',
            'delete',
          ].includes(action),
      ) && (
        <ActionGroup title="Nennung verwalten">
          {(entry.availableActions?.includes('change_class') ||
            entry.availableActions?.some((action) =>
              action.startsWith('change_class:'),
            )) && (
            <RailAction
              disabled={busy}
              onClick={() => onAdminAction('change_class')}
            >
              Klasse ändern
            </RailAction>
          )}
          {entry.availableActions?.includes('adjust_amount') && (
            <RailAction
              disabled={busy}
              onClick={() => onAdminAction('adjust_amount')}
            >
              Betrag anpassen
            </RailAction>
          )}
          {(entry.availableActions?.includes('note:internal') ||
            entry.availableActions?.includes('note:driver')) && (
            <RailAction disabled={busy} onClick={() => onAdminAction('note')}>
              Notiz hinzufügen
            </RailAction>
          )}
          {entry.availableActions?.includes('delete') && (
            <RailAction
              tone="danger"
              disabled={busy}
              onClick={() => onAdminAction('delete')}
            >
              Nennung löschen …
            </RailAction>
          )}
        </ActionGroup>
      )}
      <RailNote>
        Nur mögliche Aktionen werden gezeigt. Erledigtes wie die Zahlung
        verschwindet aus dem Panel.
      </RailNote>
    </>
  );
}
