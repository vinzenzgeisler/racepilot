import type { MessageSeed } from '../../messages/messageSeed.js';
import type { UploadLine } from './documentLines.js';

/** Prepared request for a missing or rejected document; the admin still reviews and sends it. */
export function requestMessageSeed(
  entryId: string,
  line: Pick<UploadLine, 'label' | 'document'>,
): MessageSeed {
  const reason = line.document?.rejectionReason;
  return {
    entryId,
    subject: `Bitte reiche ${line.label} nach`,
    body: [
      'Hallo {{firstName}},',
      '',
      reason
        ? `die Unterlage „${line.label}“ konnten wir leider nicht akzeptieren: ${reason}`
        : `für deine Nennung fehlt noch die Unterlage „${line.label}“.`,
      'Bitte reiche sie nach, damit wir deine Nennung vollständig bearbeiten können.',
    ].join('\n'),
  };
}
