import { describe, expect, it } from 'vitest';
import { health, resolveOrganizationId } from './index.js';

describe('api entry', () => {
  it('returns a contract-validated health response', () =>
    expect(health('1.0')).toEqual({ status: 'ok', version: '1.0' }));
  it('resolves an organization identifier through core', () =>
    expect(resolveOrganizationId('org-1')).toBe('org-1'));
});
