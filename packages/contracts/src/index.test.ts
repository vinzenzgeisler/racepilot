import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './index.js';

describe('healthResponseSchema', () => {
  it('validates a health response', () => {
    expect(
      healthResponseSchema.parse({ status: 'ok', version: '0.0.0' }).status,
    ).toBe('ok');
  });
  it('rejects an invalid status', () => {
    expect(
      healthResponseSchema.safeParse({ status: 'down', version: '0.0.0' })
        .success,
    ).toBe(false);
  });
});
