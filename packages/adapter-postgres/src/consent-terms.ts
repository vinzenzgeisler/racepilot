import { createHash } from 'node:crypto';

export interface ConsentTerm {
  key: string;
  version: string;
  language: 'de' | 'en';
  text: string;
  hash: string;
  required?: boolean;
}

export interface AcceptedConsent {
  key: string;
  version: string;
  hash: string;
}

/**
 * Matches what a participant accepted against the event's terms: every acceptance must name an
 * exact version and hash of the given language, and every required text must be accepted.
 */
export function matchAcceptedTerms(
  terms: readonly ConsentTerm[],
  accepted: readonly AcceptedConsent[],
  language: 'de' | 'en',
): { terms: ConsentTerm[] } | { error: 'terms-mismatch' | 'terms-required' } {
  const selected: ConsentTerm[] = [];
  for (const consent of accepted) {
    const term = terms.find(
      (item) =>
        item.key === consent.key &&
        item.version === consent.version &&
        item.language === language &&
        item.hash === consent.hash,
    );
    if (
      !term ||
      createHash('sha256').update(term.text).digest('hex') !== consent.hash
    )
      return { error: 'terms-mismatch' };
    selected.push(term);
  }
  const missing = terms.some(
    (term) =>
      term.language === language &&
      term.required !== false &&
      !selected.some(
        (item) =>
          item.key === term.key &&
          item.version === term.version &&
          item.hash === term.hash,
      ),
  );
  return missing ? { error: 'terms-required' } : { terms: selected };
}
