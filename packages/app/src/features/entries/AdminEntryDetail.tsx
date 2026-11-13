import { useMemo, useState } from 'react';
import {
  Banner,
  DetailHeader,
  DetailLayout,
  ReasonDialog,
} from '@racepilot/ui';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import type { Outcome, WorkflowView } from './AdminEntriesModel.js';
import type { AdminActionKind } from './detail/EntryAdminActionDialog.js';
import { EntryAdminActionDialog } from './detail/EntryAdminActionDialog.js';
import { EntryActionRail, type StatusStep } from './detail/EntryActionRail.js';
import {
  EntryDocumentsSection,
  type DimensionAction,
} from './detail/EntryDocumentsSection.js';
import { EntryConsentsSection } from './detail/EntryConsentsSection.js';
import { EntryPassengerDialog } from './detail/EntryPassengerDialog.js';
import {
  EntryPassengerSection,
  EntrySpareVehicleSection,
} from './detail/EntryPassengerSection.js';
import { EntryCustomAnswers } from './detail/EntryCustomAnswers.js';
import { EntryDriverSection } from './detail/EntryDriverSection.js';
import { EntryHistorySection } from './detail/EntryHistorySection.js';
import { EntryConfirmation } from './detail/EntryConfirmation.js';
import { EntryDetailLabels } from './detail/EntryDetailLabels.js';
import { EntryDocumentRejectDialog } from './documents/EntryDocumentRejectDialog.js';
import type { UploadLine } from './documents/documentLines.js';
import { requestMessageSeed } from './documents/requestMessage.js';
import { useEntryDocumentActions } from './documents/useEntryDocumentActions.js';
import type { MessageSeed } from '../messages/messageSeed.js';
import { EntryMessagesSection } from './detail/EntryMessagesSection.js';
import { EntryPaymentDialog } from './detail/EntryPaymentDialog.js';
import { EntryVehicleSection } from './detail/EntryVehicleSection.js';
import {
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
  | { kind: 'payment' }
  | { kind: 'admin'; action: AdminActionKind }
  | { kind: 'passenger'; action: 'add' | 'link' };

export function AdminEntryDetail({
  selected,
  classes,
  workflow,
  busy,
  error,
  transition,
  onBack,
  onUpdated,
  onMessage,
}: {
  selected: Entry;
  classes: Array<{ id: string; name: string; closed?: boolean }>;
  workflow: WorkflowView | null;
  busy: boolean;
  error: string;
  transition: (
    type: 'acceptance' | 'verification',
    status: string,
    reason: string,
  ) => Promise<Outcome>;
  onBack: () => void;
  onUpdated: (entry: Entry | null, refresh?: boolean) => void;
  onMessage?: ((seed: MessageSeed) => void) | undefined;
}) {
  const api = useEntryDetailApi(selected, onUpdated);
  const documents = useEntryDocumentActions(api);
  const writeMessage = onMessage && (() => onMessage({ entryId: selected.id }));
  const requestDocument =
    onMessage &&
    ((line: UploadLine) => onMessage(requestMessageSeed(selected.id, line)));
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
  const changed = lastChangeAt(selected);
  const close = () => {
    setPending(null);
    setDialogError('');
  };
  async function confirm(reason: string, amountCents?: number) {
    if (!pending) return;
    setDialogError('');
    if (
      pending.kind === 'payment' &&
      amountCents !== undefined &&
      details?.invoice
    ) {
      const result = await api.recordPayment(
        details.invoice.id,
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
  async function confirmAdminAction(
    action: Parameters<typeof api.performAdminAction>[0],
  ) {
    const result = await api.performAdminAction(action);
    if (!result.ok) setDialogError(result.message);
    else if (action.kind === 'delete') {
      onUpdated(null);
      onBack();
    } else close();
  }
  const dialog: {
    title: string;
    message: string;
    confirm: string;
    danger?: boolean;
  } | null =
    pending?.kind === 'status'
      ? {
          title: pending.step.label.replace(/ …$/, ''),
          message: `Die Nennung wird auf „${workflow?.statuses.find((item) => item.key === pending.step.to)?.labels.de ?? pending.step.to}“ gesetzt. Die Entscheidung wird im Verlauf protokolliert.`,
          confirm: 'Status ändern',
          danger: pending.step.danger,
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
            subtitle={[
              `Klasse ${details.eventClass.name}`,
              selected.orgaCode ? `Orga-Code ${selected.orgaCode}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            meta={
              <>
                Eingang {formatDateTime(selected.createdAt)}
                {changed && <> · Geändert {formatDateTime(changed)}</>}
              </>
            }
            labels={<EntryDetailLabels entry={selected} workflow={workflow} />}
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
            onAdminAction={(action) => setPending({ kind: 'admin', action })}
            onPassenger={(action) => setPending({ kind: 'passenger', action })}
            onMessage={writeMessage}
            onRequestDocument={requestDocument}
          />
        }
      >
        {error && !pending && <Banner tone="error">{error}</Banner>}
        {documents.error && <Banner tone="error">{documents.error}</Banner>}
        <EntryDriverSection
          driver={details.driver}
          passenger={details.passenger ?? null}
          busy={api.busy}
          onSave={api.saveDriver}
        />
        <EntryVehicleSection
          vehicle={details.vehicle}
          eventClass={details.eventClass}
          busy={api.busy}
          onSave={api.saveVehicle}
        />
        {details.spareVehicle && (
          <EntrySpareVehicleSection vehicle={details.spareVehicle} />
        )}
        {details.passenger && (
          <EntryPassengerSection passenger={details.passenger} />
        )}
        <EntryCustomAnswers answers={details.customAnswers} />
        <EntryDocumentsSection
          entry={selected}
          busy={busy || api.busy}
          onReviewDocument={(line) => void documents.review(line)}
          onRejectDocument={documents.startReject}
          onRequestDocument={requestDocument}
          onDimensionAction={(action) =>
            setPending({ kind: 'dimension', action })
          }
          onRecordPayment={() => setPending({ kind: 'payment' })}
        />
        <EntryConsentsSection consents={details.consents ?? []} />
        {details.passenger && (
          <EntryConsentsSection
            title="Einwilligungen Beifahrer"
            emptyText="Der Beifahrer hat noch keine Einwilligungen erteilt."
            consents={details.passenger.consents}
          />
        )}
        <EntryMessagesSection
          messages={messages.items}
          failed={messages.failed}
        />
        <EntryConfirmation
          eventId={selected.eventId}
          groupId={selected.registrationGroupId}
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
          confirmTone={dialog.danger ? 'danger' : 'default'}
          cancelLabel="Abbrechen"
          closeLabel="Dialog schließen"
          busy={busy || api.busy}
          error={dialogError}
          onConfirm={(reason) => void confirm(reason)}
          onClose={close}
        />
      )}
      <EntryDocumentRejectDialog
        line={documents.rejecting}
        busy={api.busy}
        error={documents.dialogError}
        onConfirm={(reason) => void documents.confirmReject(reason)}
        onClose={documents.cancelReject}
      />
      {pending?.kind === 'admin' && (
        <EntryAdminActionDialog
          kind={pending.action}
          entry={selected}
          classes={classes}
          busy={api.busy}
          error={dialogError}
          onConfirm={(action) => void confirmAdminAction(action)}
          onClose={close}
        />
      )}
      {pending?.kind === 'passenger' && (
        <EntryPassengerDialog
          kind={pending.action}
          entry={selected}
          busy={api.busy}
          error={dialogError}
          onAdd={(input) =>
            void api.addPassenger(input).then((result) => {
              if (result.ok) close();
              else setDialogError(result.message);
            })
          }
          onLink={api.createPassengerLink}
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
