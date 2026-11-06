import { useMemo, useState } from 'react';
import {
  Banner,
  DetailHeader,
  DetailLayout,
  HintLabel,
  ReasonDialog,
  StatusLabel,
} from '@racepilot/ui';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import type { Outcome, WorkflowView } from './AdminEntriesModel.js';
import { statusMeaning } from './EntryStatusBadge.js';
import { EntryActionRail, type StatusStep } from './detail/EntryActionRail.js';
import {
  EntryDocumentsSection,
  type DimensionAction,
} from './detail/EntryDocumentsSection.js';
import { EntryCustomAnswers } from './detail/EntryCustomAnswers.js';
import { EntryDriverSection } from './detail/EntryDriverSection.js';
import { EntryHistorySection } from './detail/EntryHistorySection.js';
import { EntryMessagesSection } from './detail/EntryMessagesSection.js';
import { EntryPaymentDialog } from './detail/EntryPaymentDialog.js';
import { EntryVehicleSection } from './detail/EntryVehicleSection.js';
import {
  dimensionLabel,
  formatDateTime,
  lastChangeAt,
  timelineFor,
} from './detail/entryDetailModel.js';
import {
  useDimensionLabels,
  useEntryDetailApi,
  useEntryMessages,
} from './detail/useEntryDetailApi.js';

type Pending =
  | { kind: 'status'; step: StatusStep }
  | { kind: 'verify' }
  | { kind: 'dimension'; action: DimensionAction }
  | { kind: 'payment' };

const HINT_NAMES = {
  double_starter: 'Doppelstarter',
  passenger: 'Beifahrer',
  late_entry: 'Nachnennung',
} as const;

export function AdminEntryDetail({
  selected,
  workflow,
  busy,
  error,
  transition,
  onBack,
  onUpdated,
}: {
  selected: Entry;
  workflow: WorkflowView | null;
  busy: boolean;
  error: string;
  transition: (
    type: 'acceptance' | 'verification',
    status: string,
    reason: string,
  ) => Promise<Outcome>;
  onBack: () => void;
  onUpdated: (entry: Entry) => void;
}) {
  const api = useEntryDetailApi(selected, onUpdated);
  const messages = useEntryMessages(selected);
  const dimensionLabels = useDimensionLabels(selected.eventId);
  const [pending, setPending] = useState<Pending | null>(null);
  const [dialogError, setDialogError] = useState('');
  const details = selected.adminDetails;
  const timeline = useMemo(
    () => timelineFor(selected, workflow, dimensionLabels),
    [selected, workflow, dimensionLabels],
  );
  if (!details)
    return <p role="alert">Die Details dieser Nennung sind nicht verfügbar.</p>;
  const projection = selected.statusProjection;
  const changed = lastChangeAt(selected);
  const order = [
    'email_verification',
    'entry',
    'payment',
    'technical_inspection',
    'waiver',
  ];
  const labels = [...(projection?.dimensions ?? [])]
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    .map((item) => (
      <StatusLabel
        key={item.key}
        status={
          item.key === 'entry'
            ? statusMeaning(
                workflow?.statuses.find((status) => status.key === item.value)
                  ?.category ?? '',
              )
            : item.key === 'payment' && item.meaning === 'not_relevant'
              ? 'empty'
              : item.meaning
        }
        label={dimensionLabel(item)}
      />
    ));
  const hints = (projection?.hints ?? [])
    .filter((hint) => hint.present)
    .map((hint) => (
      <HintLabel key={hint.key}>{HINT_NAMES[hint.key]}</HintLabel>
    ));
  const close = () => {
    setPending(null);
    setDialogError('');
  };
  async function confirm(reason: string, amountCents?: number) {
    if (!pending) return;
    setDialogError('');
    if (pending.kind === 'payment' && amountCents !== undefined) {
      const result = await api.recordPayment(
        details!.invoice!.id,
        amountCents,
        reason,
      );
      return result.ok ? close() : setDialogError(result.message);
    }
    if (pending.kind === 'dimension') {
      const result = await api.transitionDimension(
        pending.action.dimension,
        pending.action.status,
        reason,
      );
      return result.ok ? close() : setDialogError(result.message);
    }
    const result =
      pending.kind === 'verify'
        ? await transition('verification', 'verified', reason)
        : pending.kind === 'status'
          ? await transition('acceptance', pending.step.to, reason)
          : null;
    if (result?.ok) close();
    else if (result) setDialogError(result.message);
  }
  const dialog =
    pending?.kind === 'status'
      ? {
          title: pending.step.label.replace(/ …$/, ''),
          message: `Die Nennung wird auf „${workflow?.statuses.find((item) => item.key === pending.step.to)?.labels.de ?? pending.step.to}“ gesetzt. Die Entscheidung wird im Verlauf protokolliert.`,
          confirm: 'Status ändern',
        }
      : pending?.kind === 'verify'
        ? {
            title: 'E-Mail verifizieren',
            message: 'Die E-Mail-Adresse wird als bestätigt markiert.',
            confirm: 'Verifizieren',
          }
        : pending?.kind === 'dimension'
          ? {
              title: pending.action.label,
              message: 'Die Änderung wird im Verlauf protokolliert.',
              confirm: 'Speichern',
            }
          : null;
  return (
    <section aria-label="Nennung im Detail" className="admin-detail-view">
      <DetailLayout
        railLabel="Aktionen"
        header={
          <DetailHeader
            backLabel="Nennungen"
            onBack={onBack}
            number={selected.requestedStartNumber ?? details.startNumber}
            title={`${details.driver.name} · ${details.vehicle.make} ${details.vehicle.model}`}
            subtitle={`Klasse ${details.eventClass.name}`}
            meta={
              <>
                Eingang {formatDateTime(selected.createdAt)}
                {changed && <> · Geändert {formatDateTime(changed)}</>}
              </>
            }
            labels={[...labels, ...hints]}
          />
        }
        rail={
          <EntryActionRail
            entry={selected}
            workflow={workflow}
            busy={busy || api.busy}
            onStatus={(step) => setPending({ kind: 'status', step })}
            onVerify={() => setPending({ kind: 'verify' })}
            onPayment={() => setPending({ kind: 'payment' })}
            onDimension={(action) => setPending({ kind: 'dimension', action })}
          />
        }
      >
        {error && !pending && <Banner tone="error">{error}</Banner>}
        <EntryDriverSection
          driver={details.driver}
          passenger={Boolean(
            projection?.hints.find((h) => h.key === 'passenger')?.present,
          )}
          busy={api.busy}
          onSave={api.saveDriver}
        />
        <EntryVehicleSection
          vehicle={details.vehicle}
          busy={api.busy}
          onSave={api.saveVehicle}
        />
        <EntryCustomAnswers answers={details.customAnswers} />
        <EntryDocumentsSection
          entry={selected}
          onDimensionAction={(action) =>
            setPending({ kind: 'dimension', action })
          }
          onRecordPayment={() => setPending({ kind: 'payment' })}
        />
        <EntryMessagesSection
          messages={messages.items}
          failed={messages.failed}
        />
        <EntryHistorySection items={timeline} />
      </DetailLayout>
      {dialog && (
        <ReasonDialog
          open
          title={dialog.title}
          message={dialog.message}
          reasonLabel="Begründung (für das Protokoll erforderlich)"
          confirmLabel={dialog.confirm}
          cancelLabel="Abbrechen"
          closeLabel="Dialog schließen"
          busy={busy || api.busy}
          error={dialogError}
          onConfirm={(reason) => void confirm(reason)}
          onClose={close}
        />
      )}
      {pending?.kind === 'payment' && details.invoice && (
        <EntryPaymentDialog
          invoice={details.invoice}
          busy={api.busy}
          error={dialogError}
          onConfirm={(cents, reason) => void confirm(reason, cents)}
          onClose={close}
        />
      )}
    </section>
  );
}
