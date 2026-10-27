import { describe, expect, it } from 'vitest';
import {
  createApp,
  deploymentModeFromConfig,
  health,
  loadConfig,
} from './index.js';

describe('api entry', () => {
  it('returns a contract-validated health response', () =>
    expect(health('1.0')).toEqual({ status: 'ok', version: '1.0' }));
  it('fixes the deployment mode from server configuration', () =>
    expect(deploymentModeFromConfig('community')).toBe('community'));
  it('fails closed on an unknown deployment mode', () =>
    expect(() => deploymentModeFromConfig('unknown')).toThrow());
  it('disables optional provider capabilities by default', () => {
    const config = loadConfig({
      DEPLOYMENT_MODE: 'community',
      DATABASE_URL: 'postgres://localhost/racepilot',
      COMMUNITY_ORGANIZATION_SLUG: 'club',
      COMMUNITY_ORGANIZATION_NAME: 'Club',
      COMMUNITY_ORGANIZATION_TIMEZONE: 'Europe/Berlin',
      COMMUNITY_ORGANIZATION_LOCALE: 'de',
    });
    expect(config.mailEnabled).toBe(false);
    expect(config.storageEnabled).toBe(false);
  });
  it('fails closed on incomplete enabled providers without echoing secrets', () => {
    expect(() =>
      loadConfig({
        DEPLOYMENT_MODE: 'community',
        DATABASE_URL: 'postgres://localhost/racepilot',
        COMMUNITY_ORGANIZATION_SLUG: 'club',
        COMMUNITY_ORGANIZATION_NAME: 'Club',
        COMMUNITY_ORGANIZATION_TIMEZONE: 'Europe/Berlin',
        COMMUNITY_ORGANIZATION_LOCALE: 'de',
        MAIL_PROVIDER: 'smtp',
        SMTP_PASSWORD: 'do-not-print',
      }),
    ).toThrow(/SMTP_HOST/);
    try {
      loadConfig({});
    } catch (error) {
      expect(String(error)).not.toContain('do-not-print');
    }
  });
  it('requires complete OIDC client and explicit bootstrap identity configuration', () => {
    expect(() =>
      loadConfig({
        DEPLOYMENT_MODE: 'community',
        DATABASE_URL: 'postgres://localhost/racepilot',
        COMMUNITY_ORGANIZATION_SLUG: 'club',
        COMMUNITY_ORGANIZATION_NAME: 'Club',
        COMMUNITY_ORGANIZATION_TIMEZONE: 'UTC',
        COMMUNITY_ORGANIZATION_LOCALE: 'en',
        OIDC_PROVIDER: 'oidc',
      }),
    ).toThrow(/OIDC_ISSUER_URL/);
  });
  it('exposes only the public OIDC web-client settings', async () => {
    const app = createApp({
      config: { deploymentMode: 'community', organizationId: 'org' },
      organizations: { getById: async () => null, update: async () => null },
      events: { listByOrganization: async () => [], getById: async () => null },
      oidcClient: {
        issuerUrl: 'https://id.example',
        clientId: 'racepilot-web',
        redirectUri: 'https://app.example/callback',
      },
    });
    expect(await (await app.request('/auth/config')).json()).toEqual({
      oidc: {
        issuerUrl: 'https://id.example',
        clientId: 'racepilot-web',
        redirectUri: 'https://app.example/callback',
      },
    });
  });
});
