import { describe, expect, it } from 'vitest';
import { ExtensionManifest } from './extensions.js';

describe('private extension manifest contract', () => {
  it('accepts an explicitly compatible module with named composition surfaces', () => {
    expect(
      ExtensionManifest.parse({
        id: 'cloud.example',
        compatibility: { core: '^0.1.0', contracts: '^0.1.0' },
        capabilities: ['module.example.read'],
        provides: {
          api: ['example.routes'],
          ui: ['admin.example'],
          jobs: ['example.refresh'],
          migrations: ['cloud_example_0001'],
        },
      }),
    ).toMatchObject({ id: 'cloud.example' });
  });

  it('rejects missing compatibility, undeclared fields, and malformed IDs', () => {
    expect(
      ExtensionManifest.safeParse({
        id: 'Cloud Example',
        capabilities: [],
        provides: { api: [], ui: [], jobs: [], migrations: [] },
      }).success,
    ).toBe(false);
    expect(
      ExtensionManifest.safeParse({
        id: 'cloud.example',
        compatibility: { core: '*', contracts: '*' },
        capabilities: [],
        provides: { api: [], ui: [], jobs: [], migrations: [] },
        enabledForTenant: true,
      }).success,
    ).toBe(false);
  });
});
