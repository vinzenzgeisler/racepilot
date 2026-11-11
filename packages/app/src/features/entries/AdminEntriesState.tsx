type AdminEntriesStateProps = {
  state: 'loading' | 'unauthorized' | 'forbidden' | 'unavailable';
};

export function AdminEntriesState({ state }: AdminEntriesStateProps) {
  if (state === 'loading')
    return <p role="status">Verwaltung wird geladen …</p>;

  const messages = {
    unauthorized: {
      title: 'Anmeldung erforderlich',
      detail: 'Bitte erneut anmelden.',
    },
    forbidden: {
      title: 'Zugriff verweigert',
      detail: 'Dein Konto darf diese Veranstaltung nicht verwalten.',
    },
    unavailable: {
      title: 'Verwaltung nicht verfügbar',
      detail: 'Veranstaltungen konnten nicht geladen werden.',
    },
  } as const;
  const message = messages[state];

  return (
    <section className="admin-state">
      <h2>{message.title}</h2>
      <p role="alert">{message.detail}</p>
    </section>
  );
}
