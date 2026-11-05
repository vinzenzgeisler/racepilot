import { and, eq } from 'drizzle-orm';
import {
  entryStatusDimensionValues,
  invoices,
  type createDatabase,
  type createEntryStatusDimensionRepository,
  type createInvoiceRepository,
} from '@racepilot/adapter-postgres';

type Db = Awaited<ReturnType<typeof createDatabase>>['db'];
type StatusRepo = ReturnType<typeof createEntryStatusDimensionRepository>;
type InvoiceRepo = ReturnType<typeof createInvoiceRepository>;
type Snapshot = Parameters<InvoiceRepo['issue']>[3];
type StatusContext = Parameters<StatusRepo['transition']>[0];

export function createDemoStateHelpers(
  db: Db,
  organizationId: string,
  ctx: StatusContext,
  statusRepo: StatusRepo,
  invoiceRepo: InvoiceRepo,
) {
  // Invoice cancellation has no repository method yet; mark it directly.
  const cancelInvoice = (invoiceId: string) =>
    db
      .update(invoices)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(invoices.id, invoiceId),
        ),
      );
  // Brings entries seeded earlier to the "–" (not relevant / cancelled) states.
  const markNotRelevant = async ({
    entryId,
    registrationGroupId,
    eventId,
    snapshot,
    payment,
    technical,
    waiver,
  }: {
    entryId: string;
    registrationGroupId: string;
    eventId: string;
    snapshot: Snapshot | null;
    payment: string;
    technical: string;
    waiver: string;
  }) => {
    const states = new Map(
      (
        await db
          .select({
            dimension: entryStatusDimensionValues.dimension,
            value: entryStatusDimensionValues.value,
          })
          .from(entryStatusDimensionValues)
          .where(
            and(
              eq(entryStatusDimensionValues.organizationId, organizationId),
              eq(entryStatusDimensionValues.entryId, entryId),
            ),
          )
      ).map((row) => [row.dimension, row.value]),
    );
    if (
      technical === 'not_relevant' &&
      (states.get('technical_inspection') ?? 'pending') === 'pending'
    )
      await statusRepo.transition(
        ctx,
        entryId,
        'technical_inspection',
        'not_relevant',
        'demo-seed',
        'Beispielabnahme',
      );
    if (
      waiver === 'not_relevant' &&
      (states.get('waiver') ?? 'f_pending') === 'f_pending'
    )
      await statusRepo.transition(
        ctx,
        entryId,
        'waiver',
        'not_relevant',
        'demo-seed',
        'Beispielhaftverzicht',
      );
    if (payment === 'cancelled' && snapshot) {
      const invoice = await invoiceRepo.issue(
        ctx,
        eventId,
        registrationGroupId,
        snapshot,
      );
      if (invoice.status !== 'cancelled') await cancelInvoice(invoice.id);
    }
  };
  return { cancelInvoice, markNotRelevant };
}
