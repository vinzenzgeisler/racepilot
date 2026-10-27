import { describe, expect, it } from 'vitest';
import { assertEventTransition, canRegister } from './index.js';
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
});
