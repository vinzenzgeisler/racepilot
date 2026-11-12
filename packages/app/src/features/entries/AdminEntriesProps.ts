import type { ReactNode } from 'react';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import type { WorkflowView } from './AdminEntriesModel.js';
import type { EntryFilters } from '../overview/overviewModel.js';

export type AdminEntriesProps = {
  detailOpen?: boolean;
  preview?: ReactNode;
  mobilePreviewOpen?: boolean | undefined;
  autoPreview?: boolean;
  onOpenDetail?: () => void;
  onCloseDetail?: () => void;
  onSelectionChange?: (entry: Entry | null) => void;
  onWorkflowChange?: (workflow: WorkflowView | null) => void;
  entriesRevision?: number;
  previewAdvance?: { eventId: string; entryId: string } | null | undefined;
  onPreviewAdvanceHandled?: () => void;
  selectedEntry?: Entry | null;
  onTotalChange?: (total: number) => void;
  eventId?: string;
  initialFilters?: EntryFilters;
  filterRevision?: number;
  onEventChange?: (id: string) => void;
};
