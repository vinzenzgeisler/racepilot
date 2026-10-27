import { describe, expect, it } from 'vitest';
import { deploymentModeFromConfig, health } from './index.js';

describe('api entry', () => {
  it('returns a contract-validated health response', () =>
    expect(health('1.0')).toEqual({ status: 'ok', version: '1.0' }));
  it('fixes the deployment mode from server configuration', () =>
    expect(deploymentModeFromConfig('community')).toBe('community'));
  it('fails closed on an unknown deployment mode', () =>
    expect(() => deploymentModeFromConfig('unknown')).toThrow());
});
