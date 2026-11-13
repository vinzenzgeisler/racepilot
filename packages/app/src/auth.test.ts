// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const oidc = vi.hoisted(() => ({
  getUser: vi.fn(),
  signinRedirectCallback: vi.fn(),
  signinRedirect: vi.fn(),
}));
vi.mock('oidc-client-ts', () => ({
  UserManager: class {
    getUser = oidc.getUser;
    signinRedirectCallback = oidc.signinRedirectCallback;
    signinRedirect = oidc.signinRedirect;
  },
  WebStorageStateStore: class {},
}));

describe('Community OIDC browser session', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/app');
  });

  it('adds the verified session token only to relative admin API calls', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          oidc: {
            issuerUrl: 'https://login.example.test/realm',
            clientId: 'nennbox-app',
            redirectUri: 'https://app.example.test/auth/callback',
          },
        }),
      })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    oidc.getUser.mockResolvedValue({ access_token: 'secret', expired: false });
    const { restoreAdminSession, adminFetch } = await import('./auth.js');
    expect(await restoreAdminSession()).toBe('ready');
    await adminFetch('/admin/events');
    await adminFetch('https://other.example.test/admin/events');
    expect((fetchMock.mock.calls[1]![1] as RequestInit).headers).toHaveProperty(
      'get',
    );
    expect(
      ((fetchMock.mock.calls[1]![1] as RequestInit).headers as Headers).get(
        'Authorization',
      ),
    ).toBe('Bearer secret');
    expect(
      ((fetchMock.mock.calls[2]![1] as RequestInit).headers as Headers).get(
        'Authorization',
      ),
    ).toBeNull();
    vi.unstubAllGlobals();
  });

  it('does not permit admin access when OIDC is disabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ oidc: null }) }),
    );
    const { restoreAdminSession } = await import('./auth.js');
    expect(await restoreAdminSession()).toBe('disabled');
    expect(oidc.getUser).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('clears the authorization code from the callback URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          oidc: {
            issuerUrl: 'https://login.example.test/realm',
            clientId: 'nennbox-app',
            redirectUri: 'https://app.example.test/auth/callback',
          },
        }),
      }),
    );
    window.history.replaceState(
      null,
      '',
      '/auth/callback?code=secret&state=opaque',
    );
    oidc.signinRedirectCallback.mockResolvedValue({
      access_token: 'secret',
      expired: false,
    });
    const { restoreAdminSession } = await import('./auth.js');
    expect(await restoreAdminSession()).toBe('ready');
    expect(window.location.pathname + window.location.search).toBe('/app');
    vi.unstubAllGlobals();
  });

  it('consumes a concurrent OIDC callback only once', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          oidc: {
            issuerUrl: 'https://login.example.test/realm',
            clientId: 'nennbox-app',
            redirectUri: 'https://app.example.test/auth/callback',
          },
        }),
      }),
    );
    window.history.replaceState(
      null,
      '',
      '/auth/callback?code=secret&state=opaque',
    );
    oidc.signinRedirectCallback.mockResolvedValue({
      access_token: 'secret',
      expired: false,
    });
    const { restoreAdminSession } = await import('./auth.js');
    expect(
      await Promise.all([restoreAdminSession(), restoreAdminSession()]),
    ).toEqual(['ready', 'ready']);
    expect(oidc.signinRedirectCallback).toHaveBeenCalledTimes(1);
    expect(window.location.pathname + window.location.search).toBe('/app');
    vi.unstubAllGlobals();
  });
});

describe('edition auth client', () => {
  it('uses a supplied client without starting the Community OIDC flow', async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const auth = await import('./auth.js');
    const response = new Response(null, { status: 204 });
    const client = {
      restoreAdminSession: vi.fn().mockResolvedValue('ready' as const),
      signIn: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn().mockResolvedValue(undefined),
      getAdminIdentity: vi
        .fn()
        .mockReturnValue({ name: 'Cloud Admin', role: 'admin' }),
      adminFetch: vi.fn().mockResolvedValue(response),
    };
    auth.configureAuthClient(client);
    try {
      expect(await auth.restoreAdminSession()).toBe('ready');
      expect(auth.getAdminIdentity()).toEqual({
        name: 'Cloud Admin',
        role: 'admin',
      });
      expect(await auth.adminFetch('/admin/events')).toBe(response);
      await auth.signIn();
      await auth.signOut();
      expect(client.adminFetch).toHaveBeenCalledWith(
        '/admin/events',
        undefined,
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(oidc.getUser).not.toHaveBeenCalled();
    } finally {
      auth.configureAuthClient(null);
      vi.unstubAllGlobals();
    }
  });
});
