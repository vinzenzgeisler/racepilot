import { useCallback, useRef, useState } from 'react';
import {
  listClasses,
  listPricing,
  listEvents,
  loadEvent,
  loadTerms,
  openEvent,
  saveClass,
  saveEvent,
  savePricing,
  saveTerms,
  type EventOption,
  type SetupDraft,
  type SetupEvent,
} from './eventSetupApi.js';

const emptyDraft = (): SetupDraft => ({
  name: '',
  slug: '',
  startsOn: '',
  endsOn: '',
  classes: [{ name: '', code: '', fee: '', vehicleType: 'car' }],
  terms: '',
});

export function useEventSetup(onCreated: (event: SetupEvent) => void) {
  const [draft, setDraft] = useState<SetupDraft>(emptyDraft);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const lock = useRef(false);

  const refreshEvents = useCallback(async () => {
    const rows = await listEvents();
    setEvents(rows);
    return rows;
  }, []);

  const resume = useCallback(async (id: string) => {
    setMessage('');
    setLink('');
    const [event, classes, pricing, consents] = await Promise.all([
      loadEvent(id),
      listClasses(id),
      listPricing(id),
      loadTerms(id),
    ]);
    setCurrentStep(
      classes.length === 0
        ? 1
        : pricing.length < classes.length
          ? 2
          : consents.terms
            ? 4
            : 3,
    );
    setDraft({
      id: event.id,
      name: event.name,
      slug: event.slug,
      startsOn: event.startsOn.slice(0, 10),
      endsOn: event.endsOn.slice(0, 10),
      classes: classes.map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        vehicleType: item.vehicleType,
        fee: (
          (pricing.find((price) => price.classId === item.id)?.baseCents ?? 0) /
          100
        ).toFixed(2),
      })),
      terms: consents.terms?.[0]?.text ?? '',
    });
  }, []);

  const reset = useCallback(() => {
    setDraft(emptyDraft());
    setMessage('');
    setLink('');
    setCurrentStep(0);
  }, []);

  const save = useCallback(
    async (form: HTMLFormElement, open: boolean) => {
      if (lock.current) return;
      if (!form.reportValidity()) return;
      lock.current = true;
      setBusy(true);
      setMessage('');
      try {
        let stored;
        try {
          stored = await saveEvent(draft);
        } catch (error) {
          if (!draft.id && !(error instanceof Error && 'status' in error)) {
            const existing = (await listEvents()).find(
              (event) =>
                event.slug === draft.slug.trim() &&
                event.name === draft.name.trim(),
            );
            const recovered = existing ? await loadEvent(existing.id) : null;
            if (
              recovered &&
              recovered.startsOn === draft.startsOn &&
              recovered.endsOn === draft.endsOn
            ) {
              setDraft((current) => ({ ...current, id: recovered.id }));
              throw new Error(
                'Veranstaltung wurde angelegt, die Antwort ging verloren. Bitte Entwurf erneut speichern; er wird fortgesetzt.',
              );
            }
          }
          throw error;
        }
        setDraft((current) => ({ ...current, id: stored.id }));
        setCurrentStep(1);
        const existingClasses = await listClasses(stored.id);
        const ids: string[] = [];
        for (const [sortOrder, item] of draft.classes.entries()) {
          const matching =
            existingClasses.find(
              (current) =>
                current.id === item.id || current.code === item.code.trim(),
            ) ?? null;
          const saved = await saveClass(
            stored.id,
            { ...item, ...(matching ? { id: matching.id } : {}) },
            sortOrder,
          );
          ids.push(saved.id);
          setDraft((current) => ({
            ...current,
            classes: current.classes.map((row, position) =>
              position === sortOrder ? { ...row, id: saved.id } : row,
            ),
          }));
        }
        setCurrentStep(2);
        const existingPrices = await listPricing(stored.id);
        for (const [index, item] of draft.classes.entries()) {
          const classId = ids[index]!;
          const cents = Math.round(parseFee(item.fee) * 100);
          if (
            !existingPrices.some(
              (price) => price.classId === classId && price.baseCents === cents,
            )
          )
            await savePricing(stored.id, classId, cents);
        }
        setCurrentStep(3);
        await saveTerms(stored.id, draft.terms);
        setCurrentStep(4);
        let finalEvent = stored;
        if (open && stored.status !== 'open')
          finalEvent = await openEvent(stored.id);
        const publicLink = `${window.location.origin}/events/${stored.slug}/register`;
        setLink(publicLink);
        setCurrentStep(4);
        setMessage(
          open
            ? 'Veranstaltung gespeichert und Nennung geöffnet.'
            : 'Entwurf gespeichert. Du kannst ihn jederzeit fortsetzen.',
        );
        await refreshEvents();
        onCreated(finalEvent);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Speichern fehlgeschlagen. Du kannst es erneut versuchen.',
        );
        if (draft.id) void refreshEvents().catch(() => undefined);
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [draft, onCreated, refreshEvents],
  );

  return {
    draft,
    setDraft,
    events,
    busy,
    message,
    setMessage,
    link,
    currentStep,
    refreshEvents,
    resume,
    reset,
    save,
  };
}

export function parseFee(value: string): number {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized))
    throw new Error(
      'Startgeld bitte als Betrag mit höchstens zwei Dezimalstellen eingeben.',
    );
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0)
    throw new Error('Startgeld muss mindestens 0 € betragen.');
  return amount;
}
