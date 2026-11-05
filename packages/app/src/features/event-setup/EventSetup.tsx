import { useState } from 'react';
import { adminFetch } from '../../auth.js';
import { Button } from '@racepilot/ui';
import './styles.css';

type ClassDraft = { name: string; code: string; fee: string };
type Props = { onCreated: (event: { id: string; name: string }) => void };

export function EventSetup({ onCreated }: Props) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [classes, setClasses] = useState<ClassDraft[]>([
    { name: '', code: '', fee: '' },
  ]);
  const [terms, setTerms] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');

  const submit = async (open: boolean) => {
    setBusy(true);
    setMessage('');
    try {
      const eventResponse = await adminFetch('/admin/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          slug:
            slug ||
            name
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, ''),
          startsOn,
          endsOn,
        }),
      });
      if (!eventResponse.ok)
        throw new Error(
          'Veranstaltung konnte nicht angelegt werden. Bitte Angaben prüfen.',
        );
      const event = (await eventResponse.json()) as {
        id: string;
        name: string;
        slug: string;
      };
      const createdClasses: Array<{ id: string }> = [];
      for (const [sortOrder, item] of classes.entries()) {
        const response = await adminFetch(`/admin/events/${event.id}/classes`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: item.name,
            code: item.code,
            vehicleType: 'car',
            sortOrder,
            maxParticipants: null,
            closed: false,
          }),
        });
        if (!response.ok)
          throw new Error('Eine Klasse konnte nicht angelegt werden.');
        createdClasses.push((await response.json()) as { id: string });
      }
      for (const item of classes.entries()) {
        const [sortOrder, draft] = item;
        const response = await adminFetch(
          `/admin/events/${event.id}/pricing/${createdClasses[sortOrder]!.id}`,
          {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              baseCents: Math.round(Number(draft.fee || 0) * 100),
              additionalEntryAdjustmentCents: 0,
              earlyBirdDeadline: null,
              earlyBirdDiscountCents: 0,
            }),
          },
        );
        if (!response.ok)
          throw new Error('Startgeld konnte nicht gespeichert werden.');
      }
      if (terms.trim()) {
        const text = terms.trim();
        const hash = [
          ...new Uint8Array(
            await crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(text),
            ),
          ),
        ]
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('');
        const response = await adminFetch(
          `/admin/events/${event.id}/consents`,
          {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              terms: [
                {
                  key: 'participation',
                  version: '1',
                  language: 'de',
                  text,
                  hash,
                  required: true,
                },
              ],
            }),
          },
        );
        if (!response.ok)
          throw new Error(
            'Teilnahmebedingungen konnten nicht gespeichert werden.',
          );
      }
      if (open) {
        const response = await adminFetch(
          `/admin/events/${event.id}/transitions`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'open' }),
          },
        );
        if (!response.ok)
          throw new Error('Die Nennung konnte nicht geöffnet werden.');
      }
      setLink(`${window.location.origin}/events/${event.slug}/register`);
      onCreated(event);
      setMessage(
        open
          ? 'Veranstaltung angelegt und Nennung geöffnet.'
          : 'Veranstaltung angelegt. Du kannst die Nennung später öffnen.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Speichern fehlgeschlagen.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="event-setup" aria-labelledby="event-setup-title">
      <p className="app-eyebrow">ERSTE SCHRITTE</p>
      <h2 id="event-setup-title">Veranstaltung einrichten</h2>
      <p>
        Lege Veranstaltung, Klassen und Startgeld an. Die öffentliche Nennung
        kann direkt geöffnet werden.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(false);
        }}
      >
        <fieldset>
          <legend>Veranstaltung</legend>
          <label>
            Name
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Link-Kürzel
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="wird aus dem Namen erstellt"
            />
          </label>
          <div className="event-setup-dates">
            <label>
              Beginn
              <input
                type="date"
                required
                value={startsOn}
                onChange={(event) => setStartsOn(event.target.value)}
              />
            </label>
            <label>
              Ende
              <input
                type="date"
                required
                value={endsOn}
                onChange={(event) => setEndsOn(event.target.value)}
              />
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Klassen und Startgeld</legend>
          {classes.map((item, index) => (
            <div className="event-setup-class" key={index}>
              <label>
                Klassenname
                <input
                  required
                  value={item.name}
                  onChange={(event) =>
                    setClasses((all) =>
                      all.map((row, i) =>
                        i === index
                          ? { ...row, name: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Kürzel
                <input
                  required
                  value={item.code}
                  onChange={(event) =>
                    setClasses((all) =>
                      all.map((row, i) =>
                        i === index
                          ? { ...row, code: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Startgeld in Euro
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.fee}
                  onChange={(event) =>
                    setClasses((all) =>
                      all.map((row, i) =>
                        i === index ? { ...row, fee: event.target.value } : row,
                      ),
                    )
                  }
                />
              </label>
              {classes.length > 1 && (
                <Button
                  type="button"
                  variant="secondary"
                  size={40}
                  onClick={() =>
                    setClasses((all) => all.filter((_, i) => i !== index))
                  }
                >
                  Entfernen
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size={40}
            onClick={() =>
              setClasses((all) => [...all, { name: '', code: '', fee: '' }])
            }
          >
            Klasse hinzufügen
          </Button>
        </fieldset>
        <fieldset>
          <legend>Teilnahmebedingungen</legend>
          <label>
            Text der Bedingungen
            <textarea
              rows={5}
              value={terms}
              onChange={(event) => setTerms(event.target.value)}
              placeholder="Optional – kann später ergänzt werden"
            />
          </label>
        </fieldset>
        {message && (
          <p
            role={
              message.includes('fehl') || message.includes('konnte')
                ? 'alert'
                : 'status'
            }
          >
            {message}
          </p>
        )}
        {link && (
          <p>
            Öffentlicher Nennungslink: <a href={link}>{link}</a>
          </p>
        )}
        <div className="event-setup-actions">
          <Button type="submit" variant="secondary" size={40} disabled={busy}>
            Entwurf speichern
          </Button>
          <Button
            type="button"
            variant="primary"
            size={40}
            disabled={
              busy ||
              !name ||
              !startsOn ||
              !endsOn ||
              classes.some(
                (item) => !item.name || !item.code || item.fee === '',
              )
            }
            onClick={() => void submit(true)}
          >
            Speichern und Nennung öffnen
          </Button>
        </div>
      </form>
    </section>
  );
}
