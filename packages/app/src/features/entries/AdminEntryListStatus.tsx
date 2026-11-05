import type { ApiState } from './AdminEntriesModel.js';

export function AdminEntryListStatus({
  apiState,
  total,
}: {
  apiState: ApiState;
  total: number;
}) {
  return (
    <>
      <p aria-live="polite">
        {apiState === 'loading'
          ? 'Nennungen werden geladen …'
          : `${total} Nennungen`}
      </p>
      {apiState === 'unavailable' && (
        <p role="alert">Nennungen konnten nicht geladen werden.</p>
      )}
    </>
  );
}
