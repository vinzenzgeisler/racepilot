import { describe, expect, it } from 'vitest';
import { organizationId, parseDeploymentMode } from './index.js';

describe('organizationId', () => {
  it('accepts a non-empty identifier', () =>
    expect(organizationId('org-1')).toBe('org-1'));
  it('rejects an empty identifier', () =>
    expect(() => organizationId(' ')).toThrow());
});

describe('parseDeploymentMode', () => {
  it.each(['community', 'cloud'])('accepts %s', (mode) =>
    expect(parseDeploymentMode(mode)).toBe(mode),
  );
  it.each(['', 'Community', 'saas'])('rejects %j', (mode) =>
    expect(() => parseDeploymentMode(mode)).toThrow(),
  );
});
