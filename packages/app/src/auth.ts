import { oidcAuthClient } from './auth-oidc.js';

export type AuthIdentity = { name: string; role: string };
export type AdminSession = 'ready' | 'signed-out' | 'disabled';

/** Browser auth transport supplied by the edition before the app is mounted. */
export interface AuthClient {
  restoreAdminSession(): Promise<AdminSession>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  getAdminIdentity(): AuthIdentity | null;
  /** The adapter must keep credentials on same-origin admin requests only. */
  adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

let activeClient: AuthClient = oidcAuthClient;

/** One client per browser app. `null` restores the Community default (also useful in tests). */
export function configureAuthClient(client: AuthClient | null): void {
  activeClient = client ?? oidcAuthClient;
}

export const restoreAdminSession = (): Promise<AdminSession> =>
  activeClient.restoreAdminSession();
export const signIn = (): Promise<void> => activeClient.signIn();
export const signOut = (): Promise<void> => activeClient.signOut();
export const getAdminIdentity = (): AuthIdentity | null =>
  activeClient.getAdminIdentity();
export const adminFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => activeClient.adminFetch(input, init);
