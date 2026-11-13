import { DetailNote, DetailSection, EvidenceList } from '@racepilot/ui';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import { formatDateTime } from './entryDetailModel.js';

type Consent = NonNullable<
  NonNullable<Entry['adminDetails']>['consents']
>[number];

/**
 * Acceptances the participant actually recorded. Nothing is derived from the event's texts:
 * an entry without evidence says so.
 */
export function EntryConsentsSection({
  consents,
  title = 'Einwilligungen',
  emptyText = 'Für diese Nennung ist kein Einwilligungsnachweis gespeichert.',
}: {
  consents: Consent[];
  title?: string;
  emptyText?: string;
}) {
  return (
    <DetailSection title={title}>
      <EvidenceList
        items={consents.map((consent) => ({
          id: `${consent.key}:${consent.version}:${consent.language}:${consent.acceptedAt}`,
          title: consent.key,
          meta: [
            `Version ${consent.version}`,
            consent.language === 'de' ? 'Deutsch' : 'Englisch',
            consent.required === null
              ? null
              : consent.required
                ? 'Erforderlich'
                : 'Freiwillig',
          ]
            .filter(Boolean)
            .join(' · '),
          time: formatDateTime(consent.acceptedAt),
          dateTime: consent.acceptedAt,
          textLabel: 'Wortlaut anzeigen',
          text: consent.text,
          missingTextLabel:
            'Der akzeptierte Wortlaut ist für diese Veranstaltung nicht mehr hinterlegt.',
        }))}
        empty={<DetailNote>{emptyText}</DetailNote>}
      />
    </DetailSection>
  );
}
