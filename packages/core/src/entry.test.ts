import { describe, expect, it } from 'vitest';
import {
  assertEntryTransition,
  normalizeEmail,
  normalizeRequestedStartNumber,
  transitionEntry,
  organizationId,
  type Entry,
  type RequestContext,
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
