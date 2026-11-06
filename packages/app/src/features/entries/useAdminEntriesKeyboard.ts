import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { EntryResponse as Entry } from '@racepilot/contracts';

export function useAdminEntriesKeyboard({
  items,
  selected,
  isDetailOpen,
  openEntry,
  openDetail,
  closeDetail,
  setSelected,
}: {
  items: Entry[];
  selected: Entry | null;
  isDetailOpen: boolean;
  openEntry: (id: string) => Promise<void>;
  openDetail: () => void;
  closeDetail: () => void;
  setSelected: Dispatch<SetStateAction<Entry | null>>;
}) {
  useEffect(() => {
    const handleKeys = (event: KeyboardEvent) => {
      if (
        !items.length ||
        (event.target instanceof HTMLElement &&
          ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName))
      )
        return;
      const index = items.findIndex((item) => item.id === selected?.id);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = Math.min(
          items.length - 1,
          Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)),
        );
        document
          .querySelector<HTMLButtonElement>(
            `[data-entry-action="${items[next]!.id}"]`,
          )
          ?.click();
      } else if (event.key === 'Escape' && isDetailOpen) {
        closeDetail();
      } else if (event.key === 'Escape' && selected) {
        setSelected(null);
      } else if (
        event.key === 'Enter' &&
        selected &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest(
            'a, [role=tab], summary, [role=menuitem], input, select, textarea',
          )
        )
      ) {
        event.preventDefault();
        openDetail();
      }
    };
    document.addEventListener('keydown', handleKeys);
    return () => document.removeEventListener('keydown', handleKeys);
  }, [
    items,
    selected,
    isDetailOpen,
    openEntry,
    openDetail,
    closeDetail,
    setSelected,
  ]);
}
