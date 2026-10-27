import { describe, expect, it } from 'vitest';
import { organizationId } from './index.js';

describe('organizationId', () => {
  it('accepts a non-empty identifier', () =>
    expect(organizationId('org-1')).toBe('org-1'));
  it('rejects an empty identifier', () =>
    expect(() => organizationId(' ')).toThrow());
});
