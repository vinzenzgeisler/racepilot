import { describe, expect, it } from 'vitest';
import { organizationId } from './context.js';
import {
  resolveCanonicalOrigin,
  staticCanonicalOrigin,
  type TenantRef,
} from './canonical-origin.js';

const tenant: TenantRef = {
  deploymentMode: 'cloud',
  organizationId: organizationId('org-a'),
};

describe('canonical origin port', () => {
  it('reduces the configured base URL to its origin', async () => {
    const port = staticCanonicalOrigin(
      'https://race.example.test/some/path?x=1',
    );
    expect(await resolveCanonicalOrigin(port, tenant)).toBe(
      'https://race.example.test',
    );
  });
  it('rejects unusable static configuration at construction', () => {
    expect(() => staticCanonicalOrigin('not a url')).toThrow();
    expect(() => staticCanonicalOrigin('ftp://race.example.test')).toThrow();
    expect(() =>
      staticCanonicalOrigin('https://user:pw@race.example.test'),
    ).toThrow();
  });
  it('fails closed for missing, malformed, and throwing resolvers', async () => {
    expect(await resolveCanonicalOrigin(async () => null, tenant)).toBeNull();
    expect(
      await resolveCanonicalOrigin(async () => 'javascript:alert(1)', tenant),
    ).toBeNull();
    expect(
      await resolveCanonicalOrigin(async () => {
        throw new Error('database down');
      }, tenant),
    ).toBeNull();
  });
  it('lets a resolver choose the origin per organization', async () => {
    const port = async (t: TenantRef) =>
      t.organizationId === 'org-a' ? 'https://a.example.test' : null;
    expect(await resolveCanonicalOrigin(port, tenant)).toBe(
      'https://a.example.test',
    );
    expect(
      await resolveCanonicalOrigin(port, {
        ...tenant,
        organizationId: organizationId('org-b'),
      }),
    ).toBeNull();
  });
});
