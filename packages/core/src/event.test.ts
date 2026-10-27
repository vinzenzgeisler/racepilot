import { describe, expect, it } from 'vitest';
import {
  assertEventTransition,
  canRegister,
  updateEvent,
  organizationId,
} from './index.js';
const event = {
  status: 'open' as const,
  registrationOpensAt: '2027-01-01T10:00:00Z',
  registrationClosesAt: '2027-01-01T12:00:00Z',
};
describe('event lifecycle and registration eligibility', () => {
  it('permits only declared transitions', () => {
    expect(() => assertEventTransition('draft', 'open')).not.toThrow();
    expect(() => assertEventTransition('draft', 'closed')).toThrow(
      /Invalid event transition/,
    );
    expect(() => assertEventTransition('archived', 'open')).toThrow();
  });
  it('hides events outside registration window and rejects closed classes', () => {
    expect(
      canRegister(event, { closed: false }, new Date('2027-01-01T10:00:00Z')),
    ).toBe(true);
    expect(
      canRegister(event, { closed: false }, new Date('2027-01-01T09:59:59Z')),
    ).toBe(false);
    expect(
      canRegister(event, { closed: false }, new Date('2027-01-01T12:00:01Z')),
    ).toBe(false);
    expect(
      canRegister(event, { closed: true }, new Date('2027-01-01T11:00:00Z')),
    ).toBe(false);
    expect(
      canRegister(
        { ...event, status: 'closed' },
        { closed: false },
        new Date('2027-01-01T11:00:00Z'),
      ),
    ).toBe(false);
  });
  it('validates patched dates and windows against the persisted event', async () => {
    const current = {
      id: 'event',
      organizationId: organizationId('org'),
      slug: 'event',
      name: 'Event',
      startsOn: '2027-01-01',
      endsOn: '2027-01-02',
      status: 'draft' as const,
      registrationOpensAt: '2027-01-01T10:00:00Z',
      registrationClosesAt: '2027-01-01T12:00:00Z',
      openedAt: null,
      closedAt: null,
      archivedAt: null,
    };
    const events = {
      listByOrganization: async () => [],
      getById: async () => current,
      update: async () => current,
    };
    const ctx = {
      deploymentMode: 'community' as const,
      organizationId: organizationId('org'),
      permissions: new Set(['event:write']),
      capabilities: new Set<string>(),
      correlationId: 'test',
    };
    await expect(
      updateEvent(ctx, 'event', { startsOn: '2027-01-03' }, { events }),
    ).rejects.toThrow(/end date precedes/);
    await expect(
      updateEvent(
        ctx,
        'event',
        { registrationOpensAt: '2027-01-01T13:00:00Z' },
        { events },
      ),
    ).rejects.toThrow(/close precedes open/);
  });
});
