import { useEffect, useState, type ReactNode } from 'react';
import {
  RuntimeBootstrapResponse,
  type RuntimeBootstrapResponse as RuntimeConfig,
} from '@racepilot/contracts';
import './styles.css';
import { Registration, RegistrationVerification } from './Registration.js';
import { AdminEntries } from './AdminEntries.js';

type State =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; config: RuntimeConfig };

export interface AppProps {
  renderContribution?: (config: RuntimeConfig) => ReactNode;
}

export function App({ renderContribution }: AppProps = {}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const isAdmin = window.location.pathname.startsWith('/admin');
  useEffect(() => {
    if (isAdmin) return;
    let current = true;
    fetch('/runtime/bootstrap', {
      credentials: 'same-origin',
      cache: 'no-cache',
    })
      .then((response) => {
        if (!response.ok) throw new Error('Runtime unavailable');
        return response.json();
      })
      .then((payload: unknown) => RuntimeBootstrapResponse.parse(payload))
      .then((config) => {
        if (current) setState({ kind: 'ready', config });
      })
      .catch(() => {
        if (current) setState({ kind: 'unavailable' });
      });
    return () => {
      current = false;
    };
  }, [isAdmin]);

  if (isAdmin)
    return (
      <main className="shell admin-shell">
        <header className="masthead">
          <div>
            <p className="eyebrow">RacePilot · Administration</p>
            <h1>Organization administration</h1>
          </div>
        </header>
        <AdminEntries />
      </main>
    );

  if (state.kind === 'loading')
    return (
      <main className="shell" aria-busy="true">
        <p role="status">Loading RacePilot…</p>
      </main>
    );
  if (state.kind === 'unavailable')
    return (
      <main className="shell">
        <h1>RacePilot</h1>
        <p role="alert">This service is currently unavailable.</p>
      </main>
    );

  const { config } = state;
  if (window.location.pathname === '/registration/verify')
    return (
      <main className="shell">
        <RegistrationVerification locale={config.locale} />
      </main>
    );
  const registrationMatch = window.location.pathname.match(
    /^\/events\/([^/]+)\/register\/?$/,
  );
  if (registrationMatch)
    return (
      <main className="shell">
        <Registration
          organizationId={config.organization.id}
          eventSlug={decodeURIComponent(registrationMatch[1]!)}
          defaultLocale={config.locale}
        />
      </main>
    );
  return (
    <main
      className="shell"
      style={
        {
          '--brand-primary': config.branding.primaryColor,
          '--brand-accent': config.branding.accentColor,
        } as React.CSSProperties
      }
    >
      <header className="masthead">
        {config.branding.logoUrl ? (
          <img className="logo" src={config.branding.logoUrl} alt="" />
        ) : null}
        <div>
          <p className="eyebrow">RacePilot · {config.deploymentMode}</p>
          <h1>{config.organization.name}</h1>
        </div>
      </header>
      {config.activeEvent ? (
        <section aria-labelledby="event-title">
          <h2 id="event-title">{config.activeEvent.name}</h2>
          {config.branding.eventImageUrl ? (
            <img
              className="event-image"
              src={config.branding.eventImageUrl}
              alt=""
            />
          ) : null}
        </section>
      ) : (
        <p>No active event.</p>
      )}
      {config.branding.contactEmail ? (
        <p>
          <a href={`mailto:${config.branding.contactEmail}`}>Contact</a>
        </p>
      ) : null}
      {config.legalLinks.length ? (
        <nav aria-label="Legal information">
          <ul>
            {config.legalLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {renderContribution?.(config) ?? null}
    </main>
  );
}
