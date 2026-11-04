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
        {apiState === 'loading' ? 'Loading entries…' : `${total} entries`}
      </p>
      {apiState === 'unavailable' && (
        <p role="alert">Entries could not be loaded.</p>
      )}
    </>
  );
}
