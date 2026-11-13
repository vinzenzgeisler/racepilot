import { useEffect, useState, type FormEvent } from 'react';
import {
  Banner,
  Button,
  Checkbox,
  DateInput,
  Field,
  FormGrid,
  FormWide,
} from '@racepilot/ui';
import {
  PassengerLinkViewSchema,
  defaultRegistrationFormConfig,
  type PassengerLinkView,
} from '@racepilot/contracts';
import { RegistrationContactFields } from '../registration/RegistrationContactFields.js';
import {
  translations,
  type DriverContact,
} from '../registration/RegistrationDomain.js';
import { passengerWords } from './passengerWords.js';

type State =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; view: PassengerLinkView }
  | { kind: 'done'; language: 'de' | 'en' };

const asText = (value: string | null) => value ?? '';

/**
 * The personal link of a co-driver: their own data and consents, without an account.
 * The token only ever opens the one entry it was created for.
 */
export function PassengerLink({ locale: runtimeLocale }: { locale: string }) {
  const token = new URLSearchParams(location.search).get('token');
  const [state, setState] = useState<State>(
    token ? { kind: 'loading' } : { kind: 'unavailable' },
  );
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetch('/public/passenger-links/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const view = response.ok
          ? PassengerLinkViewSchema.safeParse(await response.json())
          : null;
        setState(
          view?.success
            ? { kind: 'ready', view: view.data }
            : { kind: 'unavailable' },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'unavailable' });
      });
    return () => controller.abort();
  }, [token]);

  const fallback = runtimeLocale.toLowerCase().startsWith('de') ? 'de' : 'en';
  if (state.kind === 'loading')
    return (
      <section aria-busy="true">
        <p role="status">{passengerWords[fallback].loading}</p>
      </section>
    );
  if (state.kind === 'unavailable')
    return (
      <section aria-labelledby="passenger-title">
        <h2 id="passenger-title">{passengerWords[fallback].title}</h2>
        <p role="alert">{passengerWords[fallback].unavailable}</p>
      </section>
    );
  if (state.kind === 'done')
    return (
      <section aria-labelledby="passenger-title">
        <h2 id="passenger-title">{passengerWords[state.language].title}</h2>
        <p role="status">{passengerWords[state.language].done}</p>
      </section>
    );
  return (
    <PassengerForm
      token={token!}
      view={state.view}
      onDone={() => setState({ kind: 'done', language: state.view.language })}
    />
  );
}

function PassengerForm({
  token,
  view,
  onDone,
}: {
  token: string;
  view: PassengerLinkView;
  onDone: () => void;
}) {
  const language = view.language;
  const words = passengerWords[language];
  const { passenger } = view;
  const [person, setPerson] = useState({
    firstName: passenger.firstName,
    lastName: passenger.lastName,
    email: asText(passenger.email),
    dateOfBirth: asText(passenger.dateOfBirth),
  });
  const [contact, setContact] = useState<DriverContact>({
    phone: asText(passenger.phone),
    country: asText(passenger.country),
    street: asText(passenger.street),
    postalCode: asText(passenger.postalCode),
    city: asText(passenger.city),
    emergencyContactName: asText(passenger.emergencyContactName),
    emergencyContactPhone: asText(passenger.emergencyContactPhone),
    publicationPreference: '',
  });
  const terms = view.terms.filter((term) => term.language === language);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const termId = (term: (typeof terms)[number]) =>
    `${term.key}:${term.version}:${term.language}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (terms.some((term) => term.required && !accepted[termId(term)])) {
      setError(words.terms);
      return;
    }
    setSending(true);
    setError('');
    const blank = (value: string) => value.trim() || null;
    try {
      const response = await fetch('/public/passenger-links/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          language,
          passenger: {
            firstName: person.firstName,
            lastName: person.lastName,
            email: blank(person.email),
            dateOfBirth: person.dateOfBirth,
            country: contact.country || null,
            phone: blank(contact.phone),
            street: blank(contact.street),
            postalCode: blank(contact.postalCode),
            city: blank(contact.city),
            emergencyContactName: blank(contact.emergencyContactName),
            emergencyContactPhone: blank(contact.emergencyContactPhone),
          },
          consents: terms
            .filter((term) => accepted[termId(term)])
            .map((term) => ({
              key: term.key,
              version: term.version,
              hash: term.hash,
              accepted: true,
            })),
        }),
      });
      if (response.ok) return onDone();
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(
        response.status === 429
          ? words.busy
          : body?.error === 'guardian_required'
            ? words.guardian
            : response.status === 404
              ? words.unavailable
              : words.retry,
      );
    } catch {
      setError(words.retry);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="registration-container">
      <form className="registration-form" onSubmit={submit}>
        <h1 id="passenger-title">{words.title}</h1>
        <p className="registration-step-description">
          {words.intro(view.driverName, view.className)} · {view.eventName}
        </p>
        <fieldset>
          <legend>{words.legend}</legend>
          <FormGrid variant="registration">
            <Field
              label={words.firstName}
              required
              maxLength={100}
              value={person.firstName}
              onChange={(event) =>
                setPerson({ ...person, firstName: event.target.value })
              }
            />
            <Field
              label={words.lastName}
              required
              maxLength={100}
              value={person.lastName}
              onChange={(event) =>
                setPerson({ ...person, lastName: event.target.value })
              }
            />
            <Field
              label={words.email}
              type="email"
              maxLength={254}
              value={person.email}
              onChange={(event) =>
                setPerson({ ...person, email: event.target.value })
              }
            />
            <DateInput
              label={words.dateOfBirth}
              required
              value={person.dateOfBirth}
              onChange={(event) =>
                setPerson({ ...person, dateOfBirth: event.target.value })
              }
            />
            <FormWide>
              <Field
                label={translations[language].phone}
                type="tel"
                maxLength={40}
                value={contact.phone}
                onChange={(event) =>
                  setContact({ ...contact, phone: event.target.value })
                }
              />
            </FormWide>
          </FormGrid>
          <RegistrationContactFields
            config={defaultRegistrationFormConfig}
            values={contact}
            onChange={(patch) => setContact({ ...contact, ...patch })}
            t={translations[language]}
          />
        </fieldset>
        {terms.length > 0 && (
          <fieldset>
            <legend>{words.confirmations}</legend>
            <div className="consent-list">
              {terms.map((term) => (
                <Checkbox
                  key={termId(term)}
                  label={`${term.required ? words.required : words.optional} · ${term.text} (${words.agree})`}
                  aria-required={term.required}
                  checked={accepted[termId(term)] ?? false}
                  onChange={(event) =>
                    setAccepted((old) => ({
                      ...old,
                      [termId(term)]: event.target.checked,
                    }))
                  }
                />
              ))}
            </div>
          </fieldset>
        )}
        {error && <Banner tone="error">{error}</Banner>}
        <div>
          <Button type="submit" disabled={sending}>
            {sending ? words.sending : words.submit}
          </Button>
        </div>
      </form>
    </main>
  );
}
