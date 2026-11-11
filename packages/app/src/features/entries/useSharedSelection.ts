import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { EntryResponse as Entry } from '@racepilot/contracts';

export function useSharedSelection(
  shared: Entry | null | undefined,
  onChange?: (entry: Entry | null) => void,
) {
  const [local, setLocal] = useState<Entry | null>(null);
  const selected = shared === undefined ? local : shared;
  const setSelected = useCallback<Dispatch<SetStateAction<Entry | null>>>(
    (value) => {
      if (shared === undefined) setLocal(value);
      else onChange?.(typeof value === 'function' ? value(shared) : value);
    },
    [onChange, shared],
  );
  return [selected, setSelected] as const;
}
