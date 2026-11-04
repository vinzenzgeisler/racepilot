import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
  check,
  integer,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations, eventClasses } from './organization.js';
import { registrationGroups } from './entries.js';

export const eventClassPricingRules = pgTable(
  'event_class_pricing_rule',
  {
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    classId: uuid('class_id').notNull(),
    baseCents: integer('base_cents').notNull(),
    additionalEntryAdjustmentCents: integer('additional_entry_adjustment_cents')
      .notNull()
      .default(0),
    earlyBirdDeadline: timestamp('early_bird_deadline', { withTimezone: true }),
    earlyBirdDiscountCents: integer('early_bird_discount_cents')
      .notNull()
      .default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('event_class_price_org_event_class_unique').on(
      t.organizationId,
      t.eventId,
      t.classId,
    ),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.classId],
      foreignColumns: [
        eventClasses.organizationId,
        eventClasses.eventId,
        eventClasses.id,
      ],
      name: 'event_class_price_class_fk',
    }).onDelete('cascade'),
    check(
      'event_class_price_nonnegative_check',
      sql`${t.baseCents} >= 0 and ${t.earlyBirdDiscountCents} >= 0`,
    ),
  ],
);
export const organizationPaymentRecipients = pgTable(
  'organization_payment_recipient',
  {
    organizationId: uuid('organization_id')
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    accountName: text('account_name').notNull(),
    iban: text('iban').notNull(),
    bic: text('bic'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
export const invoiceReferenceCounters = pgTable('invoice_reference_counter', {
  organizationId: uuid('organization_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  nextValue: integer('next_value').notNull(),
});
export const invoices = pgTable(
  'invoice',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    registrationGroupId: uuid('registration_group_id').notNull(),
    totalCents: integer('total_cents').notNull(),
    currency: text('currency').notNull(),
    paymentReference: text('payment_reference').notNull(),
    status: text('status').notNull().default('open'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('invoice_org_group_unique').on(
      t.organizationId,
      t.registrationGroupId,
    ),
    unique('invoice_org_reference_unique').on(
      t.organizationId,
      t.paymentReference,
    ),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.registrationGroupId],
      foreignColumns: [
        registrationGroups.organizationId,
        registrationGroups.eventId,
        registrationGroups.id,
      ],
      name: 'invoice_org_group_fk',
    }).onDelete('cascade'),
    check('invoice_amount_check', sql`${t.totalCents} >= 0`),
    check(
      'invoice_status_check',
      sql`${t.status} in ('open','partially_paid','paid','cancelled')`,
    ),
  ],
);
export const invoicePayments = pgTable(
  'invoice_payment',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    reversesPaymentId: uuid('reverses_payment_id'),
    actor: text('actor').notNull(),
    reason: text('reason').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
      name: 'invoice_payment_invoice_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.organizationId, t.reversesPaymentId],
      foreignColumns: [t.organizationId, t.id],
      name: 'invoice_payment_reversal_fk',
    }),
    check('invoice_payment_amount_nonzero_check', sql`${t.amountCents} <> 0`),
    check('invoice_payment_actor_check', sql`length(trim(${t.actor})) > 0`),
    check('invoice_payment_reason_check', sql`length(trim(${t.reason})) > 0`),
  ],
);
export const invoicePaymentAuditEvents = pgTable(
  'invoice_payment_audit_event',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    paymentId: uuid('payment_id').notNull(),
    action: text('action').notNull(),
    actor: text('actor').notNull(),
    reason: text('reason').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.paymentId],
      foreignColumns: [invoicePayments.organizationId, invoicePayments.id],
      name: 'invoice_payment_audit_payment_fk',
    }).onDelete('cascade'),
  ],
);
