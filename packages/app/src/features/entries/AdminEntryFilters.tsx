import type { Dispatch, SetStateAction } from 'react';
import { FilterBar, SelectField, TextInput } from '@racepilot/ui';
import type { EntryQuery } from './AdminEntriesModel.js';

export function AdminEntryFilters({
  draft,
  setDraft,
  changeSort,
  classes,
}: {
  draft: EntryQuery;
  setDraft: Dispatch<SetStateAction<EntryQuery>>;
  changeSort: (sort: string, direction?: string) => void;
  classes: Array<{ id: string; name: string }>;
}) {
  const activeFilters = [
    ...(draft.classId
      ? [
          {
            id: 'classId',
            label: `Klasse: ${classes.find((item) => item.id === draft.classId)?.name ?? draft.classId}`,
            removeLabel: 'Klassenfilter entfernen',
          },
        ]
      : []),
    ...(draft.paymentStatus
      ? [
          {
            id: 'paymentStatus',
            label: `Zahlung: ${draft.paymentStatus}`,
            removeLabel: 'Zahlungsfilter entfernen',
          },
        ]
      : []),
  ];
  return (
    <FilterBar
      label="Nennungen filtern"
      activeFilters={activeFilters}
      onRemoveFilter={(id) => setDraft((value) => ({ ...value, [id]: '' }))}
    >
      <TextInput
        label="Suche"
        placeholder="Startnummer, Name oder Nennung"
        value={draft.search}
        maxLength={120}
        onChange={(e) =>
          setDraft((value) => ({ ...value, search: e.target.value }))
        }
      />
      <SelectField
        label="Klasse"
        value={draft.classId}
        onChange={(e) =>
          setDraft((value) => ({ ...value, classId: e.target.value }))
        }
      >
        <option value="">Alle Klassen</option>
        {classes.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Zahlung"
        value={draft.paymentStatus}
        onChange={(e) =>
          setDraft((value) => ({
            ...value,
            paymentStatus: e.target.value,
          }))
        }
      >
        <option value="">Alle Zahlungen</option>
        <option value="open">Offen</option>
        <option value="partially_paid">Teilweise bezahlt</option>
        <option value="paid">Bezahlt</option>
        <option value="not_required">Nicht erforderlich</option>
        <option value="not_relevant">Nicht relevant</option>
      </SelectField>
      <SelectField
        label="Sortierung"
        value={draft.sort}
        onChange={(e) => changeSort(e.target.value)}
      >
        <option value="createdAt">Neueste zuerst</option>
        <option value="requestedStartNumber">Startnummer</option>
        <option value="acceptanceStatus">Nennungsstatus</option>
        <option value="verificationStatus">E-Mail-Prüfung</option>
      </SelectField>
    </FilterBar>
  );
}
