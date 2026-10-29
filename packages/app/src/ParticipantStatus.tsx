import { useEffect, useState, type FormEvent } from 'react';

type Status = {
  eventName: string;
  statusKey: string;
  label: string;
  color: string;
  driverName: string;
  className: string;
};

export function ParticipantStatus({
  organizationId,
  locale,
  eventSlug,
}: {
  organizationId: string;
  locale: 'de' | 'en';
  eventSlug?: string;
}) {
  const [token] = useState(() => {
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const accessToken = fragment.get('token');
    if (accessToken) {
      fragment.delete('token');
      const remainingFragment = fragment.toString();
      url.searchParams.delete('token');
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${url.search}${remainingFragment ? `#${remainingFragment}` : ''}`,
      );
    }
    return accessToken;
  });
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [statuses, setStatuses] = useState<Status[] | null>(null);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (!token) return;
    let current = true;
    fetch('/public/registration/status/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((response) => response.json())
      .then((body: { statuses?: Status[] }) => {
        if (!current) return;
        if (body.statuses) setStatuses(body.statuses);
        else setInvalid(true);
      })
      .catch(() => current && setInvalid(true));
    return () => {
      current = false;
    };
  }, [token]);
  async function requestLink(event: FormEvent) {
    event.preventDefault();
    if (!eventSlug) return;
    await fetch(
      `/public/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventSlug)}/registration/status-link`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, locale }),
      },
    ).catch(() => undefined);
    setSent(true);
  }
  const de = locale === 'de';
  return (
    <section aria-labelledby="participant-status-title">
      <h1 id="participant-status-title">
        {de ? 'Nennungsstatus' : 'Entry status'}
      </h1>
      {token ? (
        statuses ? (
          <ul>
            {statuses.map((status, index) => (
              <li key={`${status.eventName}:${index}`}>
                {status.eventName} — {status.driverName} ({status.className}):{' '}
                <span style={{ color: status.color }}>{status.label}</span>{' '}
                <small>({status.statusKey})</small>
              </li>
            ))}
          </ul>
        ) : invalid ? (
          <p role="status">
            {de
              ? 'Dieser Link ist ungültig, abgelaufen oder wurde bereits verwendet.'
              : 'This link is invalid, expired, or already used.'}
          </p>
        ) : (
          <p role="status">
            {de ? 'Status wird geladen …' : 'Loading status …'}
          </p>
        )
      ) : sent ? (
        <p role="status">
          {de
            ? 'Falls ein verifizierter Kontakt passt, wird ein Statuslink zugesandt.'
            : 'If a verified contact matches, a status link will be sent.'}
        </p>
      ) : (
        <form onSubmit={(event) => void requestLink(event)}>
          <p>
            {de
              ? 'Wir senden einen einmaligen Link an die verifizierte Kontaktadresse.'
              : 'We will send a one-time link to the verified contact address.'}
          </p>
          <label>
            {de ? 'Kontakt-E-Mail' : 'Contact email'}{' '}
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button type="submit">
            {de ? 'Statuslink anfordern' : 'Request status link'}
          </button>
        </form>
      )}
    </section>
  );
}
