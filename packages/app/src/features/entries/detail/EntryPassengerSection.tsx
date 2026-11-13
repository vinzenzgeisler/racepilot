import {
  DetailNote,
  DetailSection,
  FieldGrid,
  FieldItem,
  FieldValue,
  HintLabel,
  StatusLabel,
} from '@racepilot/ui';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import {
  NOT_GIVEN,
  countryName,
  formatBirthDate,
  formatDateTime,
} from './entryDetailModel.js';

type Passenger = NonNullable<NonNullable<Entry['adminDetails']>['passenger']>;
type SpareVehicle = NonNullable<
  NonNullable<Entry['adminDetails']>['spareVehicle']
>;
const Value = ({
  children,
}: {
  children: string | number | null | undefined;
}) => <FieldValue empty={NOT_GIVEN}>{children}</FieldValue>;

function PassengerStatus({ passenger }: { passenger: Passenger }) {
  if (passenger.status === 'completed' && passenger.completedAt)
    return (
      <StatusLabel
        status="done"
        label={`Daten vollständig · ${formatDateTime(passenger.completedAt)}`}
      />
    );
  if (passenger.status === 'invited' && passenger.linkExpiresAt)
    return (
      <StatusLabel
        status="in_progress"
        label={`Link offen bis ${formatDateTime(passenger.linkExpiresAt)}`}
      />
    );
  return <StatusLabel status="missing" label="Daten ausstehend" />;
}

/** The co-driver as far as the entry knows them; their own data arrives through the personal link. */
export function EntryPassengerSection({ passenger }: { passenger: Passenger }) {
  return (
    <DetailSection title="Beifahrer">
      <FieldGrid>
        <FieldItem label="Name">
          <Value>{`${passenger.firstName} ${passenger.lastName}`}</Value>
        </FieldItem>
        <FieldItem label="Daten">
          <PassengerStatus passenger={passenger} />
        </FieldItem>
        <FieldItem label="Geburtsdatum">
          <Value>{formatBirthDate(passenger.dateOfBirth)}</Value>
        </FieldItem>
        <FieldItem label="Land">
          <Value>{countryName(passenger.country)}</Value>
        </FieldItem>
        <FieldItem label="E-Mail">
          <Value>{passenger.email}</Value>
        </FieldItem>
        <FieldItem label="Telefon">
          <Value>{passenger.phone}</Value>
        </FieldItem>
        <FieldItem label="Anschrift">
          <Value>
            {[
              passenger.street,
              [passenger.postalCode, passenger.city].filter(Boolean).join(' '),
            ]
              .filter(Boolean)
              .join(', ')}
          </Value>
        </FieldItem>
        <FieldItem label="Notfallkontakt">
          <Value>
            {[passenger.emergencyContactName, passenger.emergencyContactPhone]
              .filter(Boolean)
              .join(' · ')}
          </Value>
        </FieldItem>
      </FieldGrid>
      {passenger.status !== 'completed' && (
        <DetailNote>
          Der Beifahrer vervollständigt seine Daten und Einwilligungen über
          einen persönlichen Link.
        </DetailNote>
      )}
    </DetailSection>
  );
}

/** A second vehicle of the entry, marked as spare; it is no entry of its own. */
export function EntrySpareVehicleSection({
  vehicle,
}: {
  vehicle: SpareVehicle;
}) {
  return (
    <DetailSection
      title="Ersatzfahrzeug"
      action={<HintLabel>Ersatz</HintLabel>}
    >
      <FieldGrid>
        <FieldItem label="Hersteller · Modell">
          <Value>{`${vehicle.make} ${vehicle.model}`.trim()}</Value>
        </FieldItem>
        <FieldItem label="Baujahr">
          <Value>{vehicle.year}</Value>
        </FieldItem>
        <FieldItem label="Kennzeichen">
          <Value>{vehicle.registration}</Value>
        </FieldItem>
      </FieldGrid>
    </DetailSection>
  );
}
