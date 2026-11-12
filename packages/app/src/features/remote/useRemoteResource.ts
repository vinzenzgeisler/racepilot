import { useCallback, useEffect, useState } from 'react';
import { errorKindOf, type RemoteErrorKind } from './apiRequest.js';

export type RemoteState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; kind: RemoteErrorKind };

type Stored<T> = {
  load: (signal: AbortSignal) => Promise<T>;
  state: RemoteState<T>;
};

/**
 * Loads one resource. A new `load` identity (for example a new event) cancels the running
 * request, and only the answer of the latest request is kept, so nothing that belongs to
 * the previous event can show up. A reload keeps the shown data until the answer arrives.
 */
export function useRemoteResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
) {
  const [stored, setStored] = useState<Stored<T>>({
    load,
    state: { status: 'loading' },
  });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setStored({ load, state: { status: 'ready', data } });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setStored({
            load,
            state: { status: 'error', kind: errorKindOf(error) },
          });
      });
    return () => controller.abort();
  }, [load, revision]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const state: RemoteState<T> =
    stored.load === load ? stored.state : { status: 'loading' };
  return { state, reload };
}
