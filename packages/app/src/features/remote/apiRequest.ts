import type { z } from 'zod';
import { adminFetch } from '../../auth.js';

export type RemoteErrorKind =
  'unauthorized' | 'forbidden' | 'not-found' | 'unavailable';

/** A failed admin API call, reduced to what a view can explain to a person. */
export class ApiRequestError extends Error {
  constructor(readonly kind: RemoteErrorKind) {
    super(kind);
  }
}

export function errorKindFor(status: number): RemoteErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  return 'unavailable';
}

/** Reads a JSON answer and checks it against the contract; anything else is "unavailable". */
export async function readJson<T extends z.ZodType>(
  response: Response,
  schema: T,
): Promise<z.infer<T>> {
  if (!response.ok) throw new ApiRequestError(errorKindFor(response.status));
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new ApiRequestError('unavailable');
  return parsed.data;
}

export async function apiRequest<T extends z.ZodType>(
  path: string,
  schema: T,
  init: RequestInit = {},
): Promise<z.infer<T>> {
  const response = await adminFetch(path, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  return readJson(response, schema);
}

export const errorKindOf = (error: unknown): RemoteErrorKind =>
  error instanceof ApiRequestError ? error.kind : 'unavailable';
