import { JobEnvelope } from '@racepilot/contracts';
import {
  entryExportFields,
  renderEntryCsv,
  validatePaymentRecipient,
  type ArtifactJobRepository,
  type EntryConfirmationRepository,
  type EntryExportRepository,
  type ObjectStorageProvider,
  type OrganizationRepository,
  type PaymentRecipientRepository,
} from '@racepilot/core';
import { createEntryConfirmationPdf } from '@racepilot/artifacts/pdf';
import { createJobContext } from './index.js';

export function createArtifactTask(deps: {
  deploymentMode: 'community' | 'cloud';
  communityOrganizationId?: string;
  getOrganization(id: string): Promise<{ status: string } | null>;
  jobs: ArtifactJobRepository;
  organizations: OrganizationRepository;
  confirmations: EntryConfirmationRepository;
  exports: EntryExportRepository;
  storage: ObjectStorageProvider;
  paymentRecipients?: PaymentRecipientRepository;
  branding?: { primaryColor?: string; version?: string };
}) {
  return async (
    payload: unknown,
    helpers: { job: { id: string; attempts?: number; max_attempts?: number } },
  ) => {
    const envelope = JobEnvelope.safeParse(payload);
    if (!envelope.success || envelope.data.type !== 'artifact.generate') return;
    const jobId = (envelope.data.payload as { artifactJobId?: unknown } | null)
      ?.artifactJobId;
    if (typeof jobId !== 'string') return;
    const ctx = await createJobContext(envelope.data, {
      deploymentMode: deps.deploymentMode,
      ...(deps.communityOrganizationId
        ? { communityOrganizationId: deps.communityOrganizationId }
        : {}),
      getOrganization: deps.getOrganization,
      jobId: helpers.job.id,
    });
    const requestCtx = {
      ...ctx,
      permissions: new Set<string>(),
      capabilities: new Set<string>(),
    };
    const job = await deps.jobs.claim(ctx, jobId);
    if (!job) {
      const current = await deps.jobs.getById(requestCtx, jobId);
      if (!current || current.status === 'ready' || current.status === 'failed')
        return;
      throw new Error(`Artifact job is already ${current.status}; retry later`);
    }
    if (job.organizationId !== ctx.organizationId) return;
    try {
      let bytes: Uint8Array;
      let contentType: string;
      if (job.kind === 'confirmation_pdf') {
        if (!job.registrationGroupId)
          throw new Error('Confirmation group unavailable');
        const [data, organization] = await Promise.all([
          deps.confirmations.getByGroup(
            requestCtx,
            job.eventId,
            job.registrationGroupId,
          ),
          deps.organizations.getById(requestCtx),
        ]);
        if (!data || !organization)
          throw new Error('Confirmation data unavailable');
        let paymentRecipient = null;
        if (deps.paymentRecipients) {
          const candidate = await deps.paymentRecipients.get(requestCtx);
          if (candidate) paymentRecipient = validatePaymentRecipient(candidate);
        }
        bytes = await createEntryConfirmationPdf({
          eventName: data.eventName,
          eventStartsOn: data.eventStartsOn,
          driverName: data.driverName,
          vehicle: data.vehicles.join(', '),
          classes: data.classes,
          priceSnapshot: data.priceSnapshot,
          paymentRecipient,
          paymentReference: data.paymentReference,
          bankTransferCapability: paymentRecipient !== null,
          branding: {
            organizationName: organization.name,
            primaryColor: deps.branding?.primaryColor ?? '#174ea6',
            contactEmail: organization.contactEmail,
            version: deps.branding?.version ?? '1',
          },
        });
        contentType = 'application/pdf';
      } else {
        const rows = await deps.exports.listByEvent(requestCtx, job.eventId);
        const labels: Record<string, string> = {
          driver: 'Driver',
          vehicle: 'Vehicle',
          class: 'Class',
          startNumber: 'Start number',
          status: 'Status',
          price: 'Price (minor units)',
        };
        const fields = job.fields.filter((field) =>
          entryExportFields.includes(
            field as (typeof entryExportFields)[number],
          ),
        );
        if (fields.length !== job.fields.length || fields.length === 0)
          throw new Error('Invalid persisted export fields');
        bytes = new TextEncoder().encode(
          renderEntryCsv([
            fields.map((field) => labels[field]!),
            ...rows.map((row) =>
              fields.map((field) =>
                field === 'price'
                  ? row.priceCents
                  : row[field as keyof typeof row],
              ),
            ),
          ]),
        );
        contentType = 'text/csv; charset=utf-8';
      }
      const ref = await deps.storage.put({
        organizationId: ctx.organizationId,
        body: bytes,
        contentType,
      });
      await deps.jobs.complete(ctx, job.id, job.claimToken, ref);
    } catch (error) {
      const attempts = helpers.job.attempts ?? job.attempts;
      const maxAttempts = helpers.job.max_attempts ?? 25;
      if (attempts >= maxAttempts) {
        await deps.jobs.fail(
          ctx,
          job.id,
          job.claimToken,
          error instanceof Error ? error.message : 'Artifact generation failed',
        );
        return;
      }
      await deps.jobs.release(ctx, job.id, job.claimToken);
      throw error;
    }
  };
}
