import {
  DetailSection,
  MessageTable,
  StatusLabel,
  TechnicalLabel,
} from '@racepilot/ui';
import { formatShortDateTime } from './entryDetailModel.js';
import type { EntryMessage } from './useEntryDetailApi.js';

const STATUS = {
  sent: ['done', 'Zugestellt'],
  pending: ['in_progress', 'Wartet'],
  sending: ['in_progress', 'Wird gesendet'],
  failed: ['missing', 'Fehlgeschlagen'],
} as const;

export function EntryMessagesSection({
  messages,
  failed,
}: {
  messages: EntryMessage[] | null;
  failed: boolean;
}) {
  return (
    <DetailSection title="Nachrichten">
      {failed ? (
        <p role="alert">Die Nachrichten konnten nicht geladen werden.</p>
      ) : messages === null ? (
        <p role="status">Nachrichten werden geladen …</p>
      ) : (
        <MessageTable
          headers={{
            status: 'Status',
            subject: 'Betreff',
            template: 'Vorlage',
            sent: 'Gesendet',
          }}
          empty={<p>Zu dieser Nennung wurden noch keine E-Mails erzeugt.</p>}
          rows={messages.map((message) => ({
            id: message.id,
            status: (
              <StatusLabel
                status={STATUS[message.status][0]}
                label={STATUS[message.status][1]}
              />
            ),
            subject: message.subject,
            template: <TechnicalLabel>{message.templateKey}</TechnicalLabel>,
            sent: message.sentAt ? formatShortDateTime(message.sentAt) : '—',
          }))}
        />
      )}
    </DetailSection>
  );
}
