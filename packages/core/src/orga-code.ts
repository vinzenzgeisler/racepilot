import type { Event } from './events.js';

export function deriveOrgaCodePrefix(
  event: Pick<Event, 'orgaCodePrefix' | 'slug'>,
): string {
  const configured = event.orgaCodePrefix?.trim().toUpperCase();
  if (configured) return configured;
  return (
    event.slug
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8) || 'NEN'
  );
}

export function formatOrgaCode(
  prefix: string,
  number: number | bigint,
): string {
  const sequence = BigInt(number);
  if (sequence < 1n)
    throw new RangeError('Orga-code sequence must be positive');
  return `${prefix}-${sequence.toString(36).toUpperCase().padStart(5, '0')}`;
}
