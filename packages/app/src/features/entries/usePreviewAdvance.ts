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
  entriesRevision = 0,
  previewAdvance,
  onPreviewAdvanceHandled,
}: {
  eventId: string;
  items: Entry[];
  workflow: WorkflowView | null;
  openEntry: (id: string) => Promise<void>;
  setRefreshRevision: Dispatch<SetStateAction<number>>;
  entriesRevision?: number;
  previewAdvance?: { eventId: string; entryId: string } | null;
  onPreviewAdvanceHandled?: (() => void) | undefined;
}) {
  useEffect(() => {
    if (entriesRevision) setRefreshRevision((value) => value + 1);
  }, [entriesRevision, setRefreshRevision]);

  useEffect(() => {
    if (!previewAdvance || previewAdvance.eventId !== eventId || !workflow)
      return;
    const isOpen = (item: Entry) => {
      const category = workflow.statuses.find(
        (status) => status.key === item.acceptanceStatus,
      )?.category;
      return category === 'pending' || category === 'waitlisted';
    };
    const currentIndex = items.findIndex(
      (item) => item.id === previewAdvance.entryId,
    );
    const following = [
      ...items.slice(currentIndex + 1),
      ...items.slice(0, Math.max(currentIndex, 0)),
    ].find(isOpen);
    if (following) void openEntry(following.id);
    onPreviewAdvanceHandled?.();
  }, [
    eventId,
    items,
    openEntry,
    onPreviewAdvanceHandled,
    previewAdvance,
    workflow,
  ]);
}
