import { describe, expect, it, vi } from 'vitest';
import {
  createInMemoryModuleActivationRepository,
  createModuleRegistry,
  createRequestContext,
  organizationId,
  setEventModule,
  setOrganizationModule,
  type ModuleConfigSchema,
} from '@racepilot/core';
import { composeWorkerTasks, createModuleTasks } from './index.js';

const orgA = '10000000-0000-4000-8000-00000000000a';
const orgB = '10000000-0000-4000-8000-00000000000b';
const eventA = '20000000-0000-4000-8000-00000000000a';
const eventB = '20000000-0000-4000-8000-00000000000b';
const owners = new Map([
  [eventA, orgA],
  [eventB, orgB],
]);
const configSchema: ModuleConfigSchema = {
  safeParse: (input) => ({ success: true, data: input ?? {} }),
};
const registry = createModuleRegistry([
  {
    manifest: {
      id: 'example.noop',
      version: '1.0.0',
      displayName: 'No-op',
      gallery: {
        name: { de: 'No-op', en: 'No-op' },
        shortDescription: { de: 'Beispielmodul', en: 'Example module' },
        longDescription: { de: 'Beispielmodul', en: 'Example module' },
        category: 'other',
        icon: 'puzzle',
        source: 'official',
        editions: ['community', 'cloud'],
        entitlement: 'included',
      },
      dependencies: [],
      permissions: [],
      capabilities: [],
      tables: [],
      migrations: [],
      routes: [],
      ui: [],
      jobs: ['example.noop.tick'],
    },
    configSchema,
    defaultConfig: {},
  },
]);
const admin = (org: string) =>
  createRequestContext({
    deploymentMode: 'cloud',
    organizationId: organizationId(org),
    permissions: new Set(['organization:update', 'event:write']),
    capabilities: new Set(),
    correlationId: 't',
  });
const envelope = (org: string, eventId: string) => ({
  type: 'example.noop.tick',
  schemaVersion: 1,
  organizationId: org,
  correlationId: 'c',
  payload: { eventId, data: { n: 1 } },
});

describe('module jobs', () => {
  const setup = () => {
    const activations = createInMemoryModuleActivationRepository(
      (ctx, id) => owners.get(id) === ctx.organizationId,
    );
    const modules = { registry, activations };
    const handler = vi.fn(async () => {});
    const onRejected = vi.fn();
    const tasks = createModuleTasks({
      modules,
      handlers: { 'example.noop.tick': handler },
      deploymentMode: 'cloud',
      getOrganization: async () => ({ status: 'active' }),
      onRejected,
    });
    return { modules, handler, onRejected, tasks };
  };
  const run = (tasks: ReturnType<typeof setup>['tasks'], payload: unknown) =>
    tasks['example.noop.tick']!(payload, { job: { id: 'job-1' } });

  it('rejects jobs of inactive modules and runs them once active', async () => {
    const { modules, handler, onRejected, tasks } = setup();
    await run(tasks, envelope(orgA, eventA));
    expect(handler).not.toHaveBeenCalled();
    expect(onRejected).toHaveBeenCalledWith(
      'example.noop.tick',
      'module inactive',
    );
    await setOrganizationModule(
      admin(orgA),
      modules,
      'example.noop',
      { enabled: true, config: { k: 1 } },
      'u',
    );
    await run(tasks, envelope(orgA, eventA));
    expect(handler).not.toHaveBeenCalled(); // organization availability alone is not enough
    await setEventModule(
      admin(orgA),
      modules,
      eventA,
      'example.noop',
      { enabled: true },
      'u',
    );
    await run(tasks, envelope(orgA, eventA));
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: eventA,
        moduleId: 'example.noop',
        config: { k: 1 },
        data: { n: 1 },
      }),
    );
    await setEventModule(
      admin(orgA),
      modules,
      eventA,
      'example.noop',
      { enabled: false },
      'u',
    );
    handler.mockClear();
    await run(tasks, envelope(orgA, eventA));
    expect(handler).not.toHaveBeenCalled();
  });
  it('does not run a job for a foreign organization/event pair', async () => {
    const { modules, handler, tasks } = setup();
    await setOrganizationModule(
      admin(orgA),
      modules,
      'example.noop',
      { enabled: true },
      'u',
    );
    await setEventModule(
      admin(orgA),
      modules,
      eventA,
      'example.noop',
      { enabled: true },
      'u',
    );
    await run(tasks, envelope(orgB, eventA));
    expect(handler).not.toHaveBeenCalled();
    await expect(
      run(tasks, { ...envelope(orgA, eventA), payload: { eventId: 'x' } }),
    ).rejects.toThrow();
  });
  it('fails closed on inconsistent assemblies and composes with core tasks', () => {
    const { modules, tasks } = setup();
    const base = {
      modules,
      deploymentMode: 'cloud' as const,
      getOrganization: async () => null,
    };
    expect(() => createModuleTasks({ ...base, handlers: {} })).toThrow(
      /without a handler/,
    );
    expect(() =>
      createModuleTasks({
        ...base,
        handlers: {
          'example.noop.tick': async () => {},
          'other.task': async () => {},
        },
      }),
    ).toThrow(/not declared/);
    expect(() =>
      composeWorkerTasks(tasks, { 'example.noop.tick': async () => {} }),
    ).toThrow(/already registered/);
  });
});
