/** Subjects of the built-in templates, used while an organization has no saved template version. */
const defaultSubjects: Record<string, Record<'de' | 'en', string>> = {
  verification: {
    de: 'Bitte bestätige deine E-Mail-Adresse',
    en: 'Verify your email address',
  },
  'registration-resume': {
    de: 'Setze deine Nennung fort',
    en: 'Continue your registration',
  },
  'entry-received': {
    de: 'Nennung eingegangen: {{eventName}}',
    en: 'Entry received: {{eventName}}',
  },
  accepted: {
    de: 'Nennung angenommen: {{eventName}}',
    en: 'Entry accepted: {{eventName}}',
  },
  rejected: {
    de: 'Nennung abgelehnt: {{eventName}}',
    en: 'Entry declined: {{eventName}}',
  },
  'message-campaign': { de: '{{subject}}', en: '{{subject}}' },
  'status-change': {
    de: 'Neuer Nennungsstatus: {{eventName}}',
    en: 'Entry status updated: {{eventName}}',
  },
};

/** Fills the subject for display; unknown placeholders stay out instead of failing the list. */
export function renderOutboxSubject(
  templateKey: string,
  locale: string,
  savedSubject: string | null,
  values: Record<string, string>,
): string {
  const template =
    savedSubject ??
    defaultSubjects[templateKey]?.[locale === 'en' ? 'en' : 'de'] ??
    templateKey;
  return template
    .replace(
      /{{\s*([^{}]+?)\s*}}/g,
      (_match, name: string) => values[name] ?? '',
    )
    .trim();
}
