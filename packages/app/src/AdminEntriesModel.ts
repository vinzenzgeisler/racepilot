import { adminFetch } from './auth.js';
import { EventSchema } from '@racepilot/contracts';

export type Event = ReturnType<typeof EventSchema.parse>;
export type ApiState =
  'loading' | 'ready' | 'unauthorized' | 'forbidden' | 'unavailable';
export type EntryQuery = {
  classId: string;
  acceptanceStatus: string;
  verificationStatus: string;
  paymentStatus: string;
  search: string;
  sort: string;
  direction: string;
};
export const initialQuery: EntryQuery = {
  classId: '',
  acceptanceStatus: '',
  verificationStatus: '',
  paymentStatus: '',
  search: '',
  sort: 'createdAt',
  direction: 'desc',
};
export type Gate = { generation: number; controller: AbortController | null };
export type WorkflowStatus = {
  key: string;
  labels: { de: string; en: string };
  color: string;
  category: string;
};
export type WorkflowView = {
  statuses: WorkflowStatus[];
  transitions: Array<{
    from: string;
    to: string;
    reasonRequired: boolean;
    permission?: string;
    roles?: Array<'admin' | 'member'> | undefined;
    notify?: boolean;
  }>;
};

export async function request(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return adminFetch(path, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
}
export function messageFor(status: number): ApiState {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  return 'unavailable';
}
export function invalidate(gate: Gate) {
  gate.generation += 1;
  gate.controller?.abort();
  gate.controller = null;
}
export function begin(gate: Gate) {
  invalidate(gate);
  const controller = new AbortController();
  gate.controller = controller;
  return { generation: gate.generation, controller };
}
export function isCurrent(
  gate: Gate,
  generation: number,
  controller: AbortController,
) {
  return gate.generation === generation && !controller.signal.aborted;
}
