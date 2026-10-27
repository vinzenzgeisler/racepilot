import { describe, expect, it } from 'vitest';
import { deploymentModeFromConfig, processHealthCheck } from './index.js';

describe('worker entry', () => {
  it('returns a validated health result', () =>
    expect(processHealthCheck('1.0')).toEqual({
      status: 'ok',
      version: '1.0',
    }));
  it('fails closed on an unknown deployment mode', () =>
    expect(() => deploymentModeFromConfig('unknown')).toThrow());
});
