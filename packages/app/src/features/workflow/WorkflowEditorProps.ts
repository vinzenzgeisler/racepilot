import type {
  Event,
  Status,
  Transition,
  Workflow,
  Revision,
} from './AdminWorkflow.js';

export type WorkflowEditorProps = {
  eventId: string;
  events: Event[];
  loading: boolean;
  workflow: Workflow | null;
  revision: Revision | null;
  updateStatus: (index: number, patch: Partial<Status>) => void;
  updateWorkflow: (workflow: Workflow) => void;
  updateTransition: (index: number, patch: Partial<Transition>) => void;
  reason: string;
  setReason: (reason: string) => void;
  busy: boolean;
  save: () => Promise<void>;
  message: string;
};
