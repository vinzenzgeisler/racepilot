import { UserManager, WebStorageStateStore } from 'oidc-client-ts';

type OidcConfig = { issuerUrl: string; clientId: string; redirectUri: string };
let managerPromise: Promise<UserManager | null> | null = null;
let accessToken: string | null = null;
let identity: { name: string; role: string } | null = null;
export function getAdminIdentity() {
  return identity;
}
let callbackPromise: ReturnType<UserManager['signinRedirectCallback']> | null =
  null;

async function manager(): Promise<UserManager | null> {
  managerPromise ??= fetch('/auth/config', { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok)
        throw new Error('Authentication configuration unavailable');
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object')
        throw new Error('Invalid authentication configuration');
      const oidc: unknown = (payload as { oidc?: unknown }).oidc;
      if (oidc === null) return null;
      if (!oidc || typeof oidc !== 'object')
        throw new Error('Invalid authentication configuration');
      const config = oidc as Partial<OidcConfig>;
      if (!config.issuerUrl || !config.clientId || !config.redirectUri)
        throw new Error('Incomplete authentication configuration');
      return new UserManager({
        authority: config.issuerUrl,
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: 'openid profile email',
        userStore: new WebStorageStateStore({ store: window.sessionStorage }),
      });
    })
    .catch((error: unknown) => {
      managerPromise = null;
      throw error;
    });
  return managerPromise;
}

export async function restoreAdminSession(): Promise<
  'ready' | 'signed-out' | 'disabled'
> {
  const client = await manager();
  if (!client) return 'disabled';
  const isCallback = window.location.pathname === '/auth/callback';
  // React StrictMode may mount twice while the callback is still pending.
  // The authorization code and stored OIDC state can only be consumed once.
  const user = isCallback
    ? await (callbackPromise ??= client.signinRedirectCallback())
    : await client.getUser();
  if (isCallback) window.history.replaceState(null, '', '/app');
  accessToken = user && !user.expired ? user.access_token : null;
  if (user && !user.expired) {
    const profile = user.profile as Record<string, unknown>;
    const name =
      [profile.given_name, profile.family_name]
        .filter((part) => typeof part === 'string')
        .join(' ') ||
      (typeof profile.name === 'string' ? profile.name : '') ||
      (typeof profile.preferred_username === 'string'
        ? profile.preferred_username
        : 'Angemeldet');
    const realm = profile.realm_access as { roles?: unknown } | undefined;
    const roles = Array.isArray(realm?.roles)
      ? realm.roles.filter((role): role is string => typeof role === 'string')
      : [];
    identity = {
      name,
      role: roles.includes('admin')
        ? 'Admin'
        : roles.includes('member')
          ? 'Mitglied'
          : 'Angemeldet',
    };
  } else identity = null;
  return accessToken ? 'ready' : 'signed-out';
}

export async function signIn(): Promise<void> {
  const client = await manager();
  if (!client) throw new Error('Authentication is not configured');
  await client.signinRedirect();
}

export async function signOut(): Promise<void> {
  accessToken = null;
  identity = null;
  await (await manager())?.removeUser();
  window.location.assign('/app');
}

export function adminFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  // Never forward credentials if a caller accidentally supplies an absolute URL.
  if (accessToken && typeof input === 'string' && input.startsWith('/admin/'))
    headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(input, { ...init, headers });
}
