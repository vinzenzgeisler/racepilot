import type { Database } from './database.js';

import { organizations } from './schema/organization.js';

import { eq, and } from 'drizzle-orm';

import { emailTemplateVersions } from './mail-schema.js';

export async function setOrganizationMailConfiguration(
  db: Database,
  organization: string,
  config: { from: string; replyTo?: string },
): Promise<void> {
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (
    !email.test(config.from) ||
    (config.replyTo && !email.test(config.replyTo))
  )
    throw new Error('Invalid organization mail configuration');
  await db
    .update(organizations)
    .set({ mailFrom: config.from, mailReplyTo: config.replyTo ?? null })
    .where(eq(organizations.id, organization));
}

export async function getOrganizationMailConfiguration(
  db: Database,
  organization: string,
) {
  const [row] = await db
    .select({
      from: organizations.mailFrom,
      replyTo: organizations.mailReplyTo,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, organization),
        eq(organizations.status, 'active'),
      ),
    )
    .limit(1);
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return row?.from &&
    email.test(row.from) &&
    (row.replyTo === null || email.test(row.replyTo))
    ? { from: row.from, replyTo: row.replyTo }
    : null;
}

export async function saveMailTemplateVersion(
  db: Database,
  organization: string,
  input: {
    templateKey: string;
    version: number;
    locale: 'de' | 'en';
    subject: string;
    text: string;
    html: string;
  },
): Promise<string> {
  const [row] = await db
    .insert(emailTemplateVersions)
    .values({
      organizationId: organization,
      templateKey: input.templateKey,
      version: input.version,
      locale: input.locale,
      subject: input.subject,
      textBody: input.text,
      htmlBody: input.html,
    })
    .returning({ id: emailTemplateVersions.id });
  if (!row) throw new Error('Mail template version could not be stored');
  return row.id;
}
