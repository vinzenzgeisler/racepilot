import { useEffect, useRef, useState } from 'react';

export function RegistrationVerification({
  locale: localeValue,
}: {
  locale: string;
}) {
  const locale = localeValue.toLowerCase().startsWith('de') ? 'de' : 'en';
  const token = new URLSearchParams(location.search).get('token');
  const attemptedToken = useRef<string | null>(null);
  const [message, setMessage] = useState(() =>
    token
      ? locale === 'de'
        ? 'E-Mail wird überprüft …'
        : 'Verifying email …'
      : locale === 'de'
        ? 'Der Bestätigungslink ist ungültig oder abgelaufen.'
        : 'This verification link is invalid or expired.',
  );
  useEffect(() => {
    if (!token || attemptedToken.current === token) return;
    attemptedToken.current = token;
    fetch('/public/registration/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((response) => response.json())
      .then((result: { verified?: boolean }) =>
        setMessage(
          result.verified
            ? locale === 'de'
              ? 'E-Mail bestätigt. Die Nennung ist verifiziert.'
              : 'Email verified. Your registration is verified.'
            : locale === 'de'
              ? 'Der Bestätigungslink ist ungültig oder abgelaufen.'
              : 'This verification link is invalid or expired.',
        ),
      )
      .catch(() =>
        setMessage(
          locale === 'de'
            ? 'Verifikation momentan nicht möglich.'
            : 'Verification is temporarily unavailable.',
        ),
      );
  }, [locale, token]);
  return (
    <section aria-labelledby="verify-title">
      <h2 id="verify-title">
        {locale === 'de' ? 'E-Mail-Verifikation' : 'Email verification'}
      </h2>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
