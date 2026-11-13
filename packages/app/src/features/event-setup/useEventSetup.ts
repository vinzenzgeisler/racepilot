import { useCallback, useReducer, useRef } from 'react';
import { initialState, reduceEventSetup } from './eventSetupState.js';
import { createEventSetup } from './createEventSetup.js';
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
  type SetupDraft,
  type SetupEvent,
} from './eventSetupApi.js';

export function useEventSetup(onCreated: (event: SetupEvent) => void) {
  const [state, dispatch] = useReducer(
    reduceEventSetup,
    undefined,
    initialState,
  );
  const { draft, events, busy, message, link, currentStep } = state;
  const setDraft = useCallback(
    (update: SetupDraft | ((current: SetupDraft) => SetupDraft)) =>
      dispatch({ type: 'draft', update }),
    [],
  );
  const setBusy = useCallback(
    (busy: boolean) => dispatch({ type: 'busy', busy }),
    [],
  );
  const setMessage = useCallback(
    (message: string) => dispatch({ type: 'message', message }),
    [],
  );
  const setLink = useCallback(
    (link: string) => dispatch({ type: 'link', link }),
    [],
  );
  const setCurrentStep = useCallback(
    (step: number) => dispatch({ type: 'step', step }),
    [],
  );
  const lock = useRef(false);
  const loading = useRef(false);
  const generation = useRef(0);
  const activeLoad = useRef<AbortController | null>(null);

  const refreshEvents = useCallback(async () => {
    const rows = await listEvents();
    dispatch({ type: 'events', events: rows });
    return rows;
  }, []);

  const resume = useCallback(
    async (id: string) => {
      if (lock.current) return;
      activeLoad.current?.abort();
      const controller = new AbortController();
      activeLoad.current = controller;
      const requestGeneration = ++generation.current;
      loading.current = true;
      setBusy(true);
      setMessage('');
      setLink('');
      try {
        const [event, classes, pricing, consents] = await Promise.all([
          loadEvent(id, controller.signal),
          listClasses(id, controller.signal),
          listPricing(id, controller.signal),
          loadTerms(id, controller.signal),
        ]);
        if (generation.current !== requestGeneration) return;
        setCurrentStep(
          classes.length === 0
            ? 1
            : pricing.length < classes.length
              ? 2
              : consents.terms?.length
                ? 4
                : 3,
        );
        setDraft({
          id: event.id,
          name: event.name,
          slug: event.slug,
          startsOn: event.startsOn.slice(0, 10),
          endsOn: event.endsOn.slice(0, 10),
          classes: classes.map((item) => {
            const rule = pricing.find((price) => price.classId === item.id);
            return {
              id: item.id,
              name: item.name,
              code: item.code,
              vehicleType: item.vehicleType,
              maxParticipants: item.maxParticipants,
              closed: item.closed,
              passengerMode: item.passengerMode,
              additionalEntryAdjustmentCents:
                rule?.additionalEntryAdjustmentCents ?? 0,
              earlyBirdDeadline: rule?.earlyBirdDeadline ?? null,
              earlyBirdDiscountCents: rule?.earlyBirdDiscountCents ?? 0,
              fee: ((rule?.baseCents ?? 0) / 100).toFixed(2),
            };
          }),
          terms:
            consents.terms?.find(
              (term) => term.key === 'participation' && term.language === 'de',
            )?.text ?? '',
          consentTerms: consents.terms ?? [],
        });
      } catch (error) {
        if (generation.current === requestGeneration) throw error;
      } finally {
        if (generation.current === requestGeneration) {
          loading.current = false;
          setBusy(false);
        }
      }
    },
    [setBusy, setMessage, setLink, setDraft, setCurrentStep],
  );

  const reset = useCallback(() => {
    if (lock.current) return;
    activeLoad.current?.abort();
    activeLoad.current = null;
    generation.current += 1;
    loading.current = false;
    setBusy(false);
    dispatch({ type: 'reset' });
  }, [setBusy]);

  const save = useCallback(
    async (form: HTMLFormElement, open: boolean) => {
      if (lock.current || loading.current) return;
      if (!form.reportValidity()) return;
      lock.current = true;
      setBusy(true);
      setMessage('');
      try {
        let stored;
        try {
          stored = draft.id
            ? await saveEvent(draft)
            : await createEventSetup(draft);
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
        if (!draft.id) {
          setCurrentStep(4);
          let finalEvent = stored;
          if (open) finalEvent = await openEvent(stored.id);
          setLink(`${window.location.origin}/events/${stored.slug}/register`);
          setMessage(
            open
              ? 'Veranstaltung gespeichert und Nennung geöffnet.'
              : 'Entwurf gespeichert. Du kannst ihn jederzeit fortsetzen.',
          );
          await refreshEvents();
          onCreated(finalEvent);
          return;
        }
        setCurrentStep(1);
        const existingClasses = await listClasses(stored.id);
        const ids: string[] = [];
        for (const [sortOrder, item] of draft.classes.entries()) {
          const matching =
            existingClasses.find((current) => current.id === item.id) ??
            (!item.id
              ? (existingClasses.find(
                  (current) => current.code === item.code.trim(),
                ) ?? null)
              : null);
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
          const classId = ids[index];
          if (!classId)
            throw new Error('Klasse konnte nicht gespeichert werden.');
          const cents = Math.round(parseFee(item.fee) * 100);
          if (
            !existingPrices.some(
              (price) => price.classId === classId && price.baseCents === cents,
            )
          )
            await savePricing(stored.id, classId, {
              baseCents: cents,
              additionalEntryAdjustmentCents:
                item.additionalEntryAdjustmentCents ?? 0,
              earlyBirdDeadline: item.earlyBirdDeadline ?? null,
              earlyBirdDiscountCents: item.earlyBirdDiscountCents ?? 0,
            });
        }
        setCurrentStep(3);
        const savedTerms = await saveTerms(
          stored.id,
          draft.terms,
          draft.consentTerms ?? [],
        );
        if (savedTerms)
          setDraft((current) => ({
            ...current,
            consentTerms: savedTerms.terms,
          }));
        setCurrentStep(4);
        let finalEvent = stored;
        if (open) {
          if (stored.status !== 'open') finalEvent = await openEvent(stored.id);
        }
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
    [
      draft,
      onCreated,
      refreshEvents,
      setDraft,
      setMessage,
      setLink,
      setBusy,
      setCurrentStep,
    ],
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
