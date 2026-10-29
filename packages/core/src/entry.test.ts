import { describe, expect, it } from 'vitest';
import {
  assertEntryTransition,
  normalizeEmail,
  normalizeRequestedStartNumber,
  transitionEntry,
  defaultEntryWorkflow,
  validateEntryWorkflow,
  assertWorkflowTransition,
  organizationId,
  type Entry,
  type RequestContext,
  permissionsForRole,
} from './index.js';
const ctx: RequestContext = {
  deploymentMode: 'community',
  organizationId: organizationId('org-a'),
  permissions: new Set(['entry:write']),
  capabilities: new Set(),
  correlationId: 'test',
};
const entry: Entry = {
  id: 'e',
  organizationId: ctx.organizationId,
  eventId: 'ev',
  classId: 'cl',
  registrationGroupId: 'g',
  driverPersonId: 'p',
  vehicleId: 'v',
  verificationStatus: 'unverified',
  acceptanceStatus: 'pending',
  requestedStartNumber: null,
  priceSnapshotVersion: null,
  formSnapshotVersion: null,
  createdAt: new Date(0).toISOString(),
  deletedAt: null,
  deletionReason: null,
};
describe('entry domain rules', () => {
  it('exposes workflow role claims without granting members global entry write', () => {
    expect(permissionsForRole('member')).toEqual(new Set(['role:member']));
    expect(permissionsForRole('admin').has('role:admin')).toBe(true);
    expect([...permissionsForRole('admin')]).toEqual(
      expect.arrayContaining([
        'timing:record',
        'timing:correct',
        'timing:publish',
        'timing:read',
      ]),
    );
  });
  it('preserves the legacy acceptance workflow as the default', () => {
    expect(validateEntryWorkflow(defaultEntryWorkflow)).toEqual([]);
    expect(
      defaultEntryWorkflow.transitions.map(({ from, to }) => `${from}->${to}`),
    ).toEqual([
      'pending->accepted',
      'pending->rejected',
      'pending->waitlisted',
      'pending->withdrawn',
      'accepted->withdrawn',
      'rejected->withdrawn',
      'waitlisted->accepted',
      'waitlisted->rejected',
      'waitlisted->withdrawn',
    ]);
  });
  it('rejects forbidden transitions and enforces configured reasons', () => {
    expect(() =>
      assertWorkflowTransition(defaultEntryWorkflow, 'accepted', 'pending', ''),
    ).toThrow();
    const workflow = {
      ...defaultEntryWorkflow,
      transitions: defaultEntryWorkflow.transitions.map((edge) =>
        edge.from === 'pending' && edge.to === 'accepted'
          ? { ...edge, reasonRequired: true }
          : edge,
      ),
    };
    expect(() =>
      assertWorkflowTransition(workflow, 'pending', 'accepted', ''),
    ).toThrow(/reason/);
    expect(() =>
      assertWorkflowTransition(workflow, 'pending', 'accepted', 'reviewed'),
    ).not.toThrow();
  });
  it('validates reachability, orphan edges, and cycles', () => {
    const cycle = {
      ...defaultEntryWorkflow,
      transitions: [
        ...defaultEntryWorkflow.transitions,
        { from: 'accepted', to: 'pending', reasonRequired: false },
      ],
    };
    expect(validateEntryWorkflow(cycle)).toContain(
      'Workflow transitions must be acyclic',
    );
    const orphan = {
      ...defaultEntryWorkflow,
      transitions: [
        ...defaultEntryWorkflow.transitions,
        { from: 'missing', to: 'accepted', reasonRequired: false },
      ],
    };
    expect(
      validateEntryWorkflow(orphan).some((error) => error.includes('Orphan')),
    ).toBe(true);
  });
  it('requires the stable pending system key as the workflow start status', () => {
    const renamedStart = {
      ...defaultEntryWorkflow,
      statuses: defaultEntryWorkflow.statuses.map((status) =>
        status.key === 'pending'
          ? { ...status, key: 'awaiting_review' }
          : status,
      ),
      transitions: defaultEntryWorkflow.transitions.map((edge) => ({
        ...edge,
        from: edge.from === 'pending' ? 'awaiting_review' : edge.from,
      })),
    };
    expect(validateEntryWorkflow(renamedStart)).toContain(
      'Workflow must include the pending system status',
    );
  });
  it('allows only unverified to verified', () => {
    expect(() =>
      assertEntryTransition('verification', 'unverified', 'verified'),
    ).not.toThrow();
    expect(() =>
      assertEntryTransition('verification', 'verified', 'unverified'),
    ).toThrow();
    expect(() =>
      assertEntryTransition('verification', 'unverified', 'rejected'),
    ).toThrow();
  });
  it.each(['accepted', 'rejected', 'waitlisted', 'withdrawn'])(
    'allows pending to %s',
    (to) =>
      expect(() =>
        assertEntryTransition('acceptance', 'pending', to),
      ).not.toThrow(),
  );
  it.each(['pending', 'accepted', 'rejected', 'waitlisted'])(
    'allows %s to withdrawn',
    (from) =>
      expect(() =>
        assertEntryTransition('acceptance', from, 'withdrawn'),
      ).not.toThrow(),
  );
  it.each(['accepted', 'rejected'])('allows waitlisted to %s', (to) =>
    expect(() =>
      assertEntryTransition('acceptance', 'waitlisted', to),
    ).not.toThrow(),
  );
  it.each([
    ['accepted', 'pending'],
    ['rejected', 'accepted'],
    ['waitlisted', 'pending'],
    ['withdrawn', 'accepted'],
    ['pending', 'verified'],
  ])('rejects %s to %s', (from, to) =>
    expect(() => assertEntryTransition('acceptance', from, to)).toThrow(),
  );

  it('requires entry:write before applying workflow role restrictions and derives notification labels', async () => {
    const memberContext: RequestContext = {
      ...ctx,
      permissions: new Set(['role:member']),
    };
    const workflow = {
      ...defaultEntryWorkflow,
      transitions: defaultEntryWorkflow.transitions.map((edge) =>
        edge.from === 'pending' && edge.to === 'accepted'
          ? { ...edge, roles: ['member'] as const, notify: true }
          : edge,
      ),
    };
    let transitionInput: unknown;
    const entries = {
      getById: async () => entry,
      transition: async (...args: unknown[]) => {
        transitionInput = args[7];
        return entry;
      },
      softDelete: async () => null,
    };
    const workflows = {
      getPinnedForEntry: async () => ({
        id: 'revision-7',
        organizationId: ctx.organizationId,
        eventId: 'ev',
        version: 7,
        workflow,
      }),
    };
    await expect(
      transitionEntry(
        memberContext,
        'foreign-entry',
        'acceptance',
        'accepted',
        'member',
        '',
        { entries, workflows: workflows as never },
      ),
    ).rejects.toThrow(/Forbidden/);
    await expect(
      transitionEntry(
        {
          ...memberContext,
          permissions: new Set(['entry:write', 'role:member']),
        },
        'e',
        'acceptance',
        'accepted',
        'member',
        '',
        { entries, workflows: workflows as never },
      ),
    ).resolves.toBe(entry);
    expect(transitionInput).toMatchObject({
      workflowRevisionId: 'revision-7',
      notification: {
        statusKey: 'accepted',
        statusLabelDe: 'Angenommen',
        statusLabelEn: 'Accepted',
      },
    });
    await expect(
      transitionEntry(
        { ...memberContext, permissions: new Set() },
        'e',
        'acceptance',
        'accepted',
        'member',
        '',
        { entries, workflows: workflows as never },
      ),
    ).rejects.toThrow(/Forbidden/);
  });
  it('normalizes email and requested numbers', () => {
    expect(normalizeEmail('  JANE@Example.COM ')).toBe('jane@example.com');
    expect(normalizeRequestedStartNumber('  a-01 ')).toBe('A-01');
    expect(normalizeRequestedStartNumber(' ')).toBeNull();
  });
  it('requires actor and reason before an auditable transition', async () => {
    const entries = {
      getById: async () => entry,
      transition: async (
        _ctx: RequestContext,
        _id: string,
        _kind: 'verification' | 'acceptance',
        _from: string,
        _to: string,
        actor: string,
        reason: string,
      ) => {
        expect(actor).toBe('admin');
        expect(reason).toBe('checked');
        return entry;
      },
      softDelete: async () => null,
    };
    await expect(
      transitionEntry(
        ctx,
        'e',
        'verification',
        'verified',
        'admin',
        'checked',
        { entries },
      ),
    ).resolves.toBe(entry);
    await expect(
      transitionEntry(ctx, 'e', 'verification', 'verified', '', 'checked', {
        entries,
      }),
    ).rejects.toThrow(/required/);
  });
});
