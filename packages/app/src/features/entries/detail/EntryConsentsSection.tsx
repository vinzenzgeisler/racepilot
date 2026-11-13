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
  passengerConsents,
}: {
  consents: Consent[];
  /** Set when the entry has a co-driver: their acceptances are listed on their own. */
  passengerConsents?: Consent[] | undefined;
}) {
  return (
    <>
      <ConsentList
        title="Einwilligungen"
        emptyText="Für diese Nennung ist kein Einwilligungsnachweis gespeichert."
        consents={consents}
      />
      {passengerConsents && (
        <ConsentList
          title="Einwilligungen Beifahrer"
          emptyText="Der Beifahrer hat noch keine Einwilligungen erteilt."
          consents={passengerConsents}
        />
      )}
    </>
  );
}

function ConsentList({
  consents,
  title,
  emptyText,
}: {
  consents: Consent[];
  title: string;
  emptyText: string;
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
