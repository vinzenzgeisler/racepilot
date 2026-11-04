import { useEffect, useState } from 'react';
import {
  RegistrationDraftSchema,
  type RegistrationDraft,
} from '@racepilot/contracts';
import { Registration } from './Registration.js';

export function RegistrationResume({
  organizationId,
}: {
  organizationId: string;
}) {
  const [resume, setResume] = useState<{
    eventSlug: string;
    language: 'de' | 'en';
    draft: RegistrationDraft;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get('token');
    history.replaceState(null, '', '/registration/resume');
    const request = token
      ? fetch('/public/registration/resume', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        })
      : Promise.reject(new Error('Missing resume token'));
    request
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(
        (result: {
          eventSlug: string;
          language: 'de' | 'en';
          draft: unknown;
        }) => {
          const draft = RegistrationDraftSchema.parse(result.draft);
          setResume({
            eventSlug: result.eventSlug,
            language: result.language,
            draft,
          });
        },
      )
      .catch(() => setFailed(true));
  }, []);
  if (resume)
    return (
      <Registration
        organizationId={organizationId}
        eventSlug={resume.eventSlug}
        defaultLocale={resume.language}
        initialDraft={resume.draft}
      />
    );
  return (
    <section>
      <p role={failed ? 'alert' : 'status'}>
        {failed
          ? 'Dieser Fortsetzungslink ist ungültig, abgelaufen oder bereits verwendet.'
          : 'Nennung wird geladen …'}
      </p>
    </section>
  );
}
