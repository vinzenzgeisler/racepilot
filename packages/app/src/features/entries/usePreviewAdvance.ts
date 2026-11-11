import { useEffect } from 'react';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import type { Dispatch, SetStateAction } from 'react';
import type { WorkflowView } from './AdminEntriesModel.js';

export function usePreviewAdvance({
  eventId,
  items,
  workflow,
  openEntry,
  setRefreshRevision,
}: {
  eventId: string;
  items: Entry[];
  workflow: WorkflowView | null;
  openEntry: (id: string) => Promise<void>;
  setRefreshRevision: Dispatch<SetStateAction<number>>;
}) {
  useEffect(() => {
    const refresh = () => setRefreshRevision((value) => value + 1);
    window.addEventListener('nennbox:entries-changed', refresh);
    return () => window.removeEventListener('nennbox:entries-changed', refresh);
  }, [setRefreshRevision]);

  useEffect(() => {
    const advancePreview = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      if (
        !detail ||
        typeof detail !== 'object' ||
        !('eventId' in detail) ||
        !('entryId' in detail) ||
        detail.eventId !== eventId ||
        typeof detail.entryId !== 'string' ||
        !workflow
      )
        return;
      const { entryId } = detail;
      const isOpen = (item: Entry) => {
        const category = workflow.statuses.find(
          (status) => status.key === item.acceptanceStatus,
        )?.category;
        return category === 'pending' || category === 'waitlisted';
      };
      const currentIndex = items.findIndex((item) => item.id === entryId);
      const following = [
        ...items.slice(currentIndex + 1),
        ...items.slice(0, Math.max(currentIndex, 0)),
      ].find(isOpen);
      if (following) void openEntry(following.id);
    };
    window.addEventListener('nennbox:entry-accepted', advancePreview);
    return () =>
      window.removeEventListener('nennbox:entry-accepted', advancePreview);
  }, [eventId, items, openEntry, workflow]);
}
