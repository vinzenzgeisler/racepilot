export const passengerWords = {
  de: {
    loading: 'Dein Link wird geprüft …',
    unavailable:
      'Dieser Link ist ungültig, abgelaufen oder wurde bereits verwendet. Bitte wende dich an das Nennbüro.',
    title: 'Deine Daten als Beifahrer',
    intro: (driver: string, className: string) =>
      `${driver} hat dich als Beifahrer in der Klasse ${className} gemeldet. Ergänze hier deine Daten und Einwilligungen.`,
    firstName: 'Vorname',
    lastName: 'Nachname',
    email: 'E-Mail',
    dateOfBirth: 'Geburtsdatum',
    legend: 'Deine Daten',
    confirmations: 'Bestätigungen',
    required: 'Erforderlich',
    optional: 'Freiwillig',
    agree: 'Ich stimme zu',
    submit: 'Daten abschließen',
    sending: 'Wird gesendet …',
    done: 'Danke, deine Daten und Einwilligungen sind gespeichert. Du musst nichts weiter tun.',
    retry: 'Bitte prüfe deine Angaben und versuche es erneut.',
    guardian:
      'Für Minderjährige meldet bitte das Nennbüro den Beifahrer. Bitte wende dich dorthin.',
    terms: 'Bitte bestätige alle erforderlichen Bedingungen.',
    busy: 'Zu viele Versuche. Bitte warte einen Moment.',
  },
  en: {
    loading: 'Checking your link …',
    unavailable:
      'This link is invalid, expired or has already been used. Please contact the entry office.',
    title: 'Your details as co-driver',
    intro: (driver: string, className: string) =>
      `${driver} named you as co-driver in class ${className}. Complete your details and consents here.`,
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    dateOfBirth: 'Date of birth',
    legend: 'Your details',
    confirmations: 'Confirmations',
    required: 'Required',
    optional: 'Optional',
    agree: 'I agree',
    submit: 'Complete details',
    sending: 'Sending …',
    done: 'Thank you, your details and consents are saved. Nothing more to do.',
    retry: 'Check your details and try again.',
    guardian:
      'For minors the entry office registers the co-driver. Please contact them.',
    terms: 'Please accept all required terms.',
    busy: 'Too many attempts. Please wait a moment.',
  },
} as const;
