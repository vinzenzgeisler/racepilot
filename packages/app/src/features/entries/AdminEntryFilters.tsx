import type { Dispatch, SetStateAction, FormEvent } from 'react';
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
      <label>
        Class
        <select
          value={draft.classId}
          onChange={(e) =>
            setDraft((value) => ({ ...value, classId: e.target.value }))
          }
        >
          <option value="">All classes</option>
          {classes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Acceptance
        <select
          value={draft.acceptanceStatus}
          onChange={(e) =>
            setDraft((value) => ({
              ...value,
              acceptanceStatus: e.target.value,
            }))
          }
        >
          <option value="">All</option>
          {(workflow?.statuses ?? []).map((status) => (
            <option key={status.key} value={status.key}>
              {status.labels.en} ({status.key})
            </option>
          ))}
        </select>
      </label>
      <label>
        Verification
        <select
          value={draft.verificationStatus}
          onChange={(e) =>
            setDraft((value) => ({
              ...value,
              verificationStatus: e.target.value,
            }))
          }
        >
          <option value="">All</option>
          <option value="unverified">Unverified</option>
          <option value="verified">Verified</option>
        </select>
      </label>
      <label>
        Zahlung
        <select
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
        </select>
      </label>
      <label>
        Search
        <input
          value={draft.search}
          maxLength={120}
          onChange={(e) =>
            setDraft((value) => ({ ...value, search: e.target.value }))
          }
          placeholder="Startnummer, Name oder Nennungs-ID"
        />
      </label>
      <label>
        Sort
        <select value={draft.sort} onChange={(e) => changeSort(e.target.value)}>
          <option value="createdAt">Created</option>
          <option value="requestedStartNumber">Start number</option>
          <option value="acceptanceStatus">Acceptance</option>
          <option value="verificationStatus">Verification</option>
        </select>
      </label>
      <label>
        Order
        <select
          value={draft.direction}
          onChange={(e) => changeSort(draft.sort, e.target.value)}
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </label>
      <button type="submit">Apply filters</button>
    </form>
  );
}
