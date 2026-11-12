import { Button, DataTable, StatusLabel } from '@racepilot/ui';
import type { MessageCampaignRecord } from '@racepilot/contracts';
import { messagesApi } from './messagesApi.js';
import { useState } from 'react';

const statusLabels = {
  planned: 'Geplant',
  sending: 'Wird gesendet',
  sent: 'Gesendet',
  failed: 'Fehlgeschlagen',
};
export function MessageOutbox({
  campaigns,
  onChanged,
}: {
  campaigns: MessageCampaignRecord[];
  onChanged: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  return (
    <section className="nb-message-section" aria-label="Postausgang">
      <div className="nb-message-actions">
        <h2>Postausgang</h2>
        <Button variant="secondary" onClick={onChanged}>
          Postausgang aktualisieren
        </Button>
      </div>
      {error && (
        <p role="alert" className="nb-message-alert">
          {error}
        </p>
      )}
      <DataTable
        headers={['Betreff', 'Status', 'Empfänger', 'Erstellt', 'Aktion']}
      >
        {campaigns.map((campaign) => (
          <tr key={campaign.id}>
            <td>{campaign.subject}</td>
            <td>
              <StatusLabel
                label={statusLabels[campaign.status]}
                status={
                  campaign.status === 'sent'
                    ? 'done'
                    : campaign.status === 'failed'
                      ? 'rejected'
                      : 'in_progress'
                }
              />
            </td>
            <td>
              {campaign.sent}/{campaign.total}
              {campaign.failed ? ` · ${campaign.failed} fehlgeschlagen` : ''}
            </td>
            <td>
              {new Intl.DateTimeFormat('de-DE', {
                dateStyle: 'short',
                timeStyle: 'short',
              }).format(new Date(campaign.createdAt))}
            </td>
            <td>
              {campaign.status === 'failed' && (
                <Button
                  variant="secondary"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    setBusy(campaign.id);
                    setError('');
                    void messagesApi
                      .retry(campaign.id)
                      .then(onChanged)
                      .catch(() => setError('Erneutes Senden fehlgeschlagen.'))
                      .finally(() => setBusy(''));
                  }}
                >
                  Fehlgeschlagene erneut senden
                </Button>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      {!campaigns.length && <p>Noch keine Nachrichten versendet.</p>}
    </section>
  );
}
