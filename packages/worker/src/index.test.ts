import { describe, expect, it } from 'vitest';
import { processHealthCheck } from './index.js';

describe('worker entry', () => {
  it('returns a validated health result', () =>
    expect(processHealthCheck('1.0')).toEqual({
      status: 'ok',
      version: '1.0',
    }));
});
