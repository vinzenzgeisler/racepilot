import type { Dispatch, SetStateAction, FormEvent } from 'react';
import { Button, FilterBar, SelectField, TextInput } from '@racepilot/ui';
import type { EntryQuery, WorkflowView } from './AdminEntriesModel.js';

export function AdminEntryFilters({
  draft,
  setDraft,
  changeSort,
  applyFilters,
  classes,
  workflow,
}: {
  draft: EntryQuery;
  setDraft: Dispatch<SetStateAction<EntryQuery>>;
  changeSort: (sort: string, direction?: string) => void;
  applyFilters: (event: FormEvent) => void;
  classes: Array<{ id: string; name: string }>;
  workflow: WorkflowView | null;
}) {
  return (
    <form className="admin-filters" onSubmit={applyFilters}>
      <FilterBar label="Nennungen filtern">
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
          label="Nennungsstatus"
          value={draft.acceptanceStatus}
          onChange={(e) =>
            setDraft((value) => ({
              ...value,
              acceptanceStatus: e.target.value,
            }))
          }
        >
          <option value="">Alle</option>
          {(workflow?.statuses ?? []).map((status) => (
            <option key={status.key} value={status.key}>
              {status.labels.de}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="E-Mail-Prüfung"
          value={draft.verificationStatus}
          onChange={(e) =>
            setDraft((value) => ({
              ...value,
              verificationStatus: e.target.value,
            }))
          }
        >
          <option value="">Alle</option>
          <option value="unverified">Unbestätigt</option>
          <option value="verified">Verifiziert</option>
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
          label="Sortieren nach"
          value={draft.sort}
          onChange={(e) => changeSort(e.target.value)}
        >
          <option value="createdAt">Eingang</option>
          <option value="requestedStartNumber">Startnummer</option>
          <option value="acceptanceStatus">Nennungsstatus</option>
          <option value="verificationStatus">E-Mail-Prüfung</option>
        </SelectField>
        <SelectField
          label="Reihenfolge"
          value={draft.direction}
          onChange={(e) => changeSort(draft.sort, e.target.value)}
        >
          <option value="desc">Absteigend</option>
          <option value="asc">Aufsteigend</option>
        </SelectField>
        <Button type="submit" variant="primary" size={40}>
          Filter anwenden
        </Button>
      </FilterBar>
    </form>
  );
}
