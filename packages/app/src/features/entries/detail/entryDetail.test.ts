import { describe, expect, it } from 'vitest';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import { statusSteps } from './EntryActionRail.js';
import { parseEuroToCents } from './EntryPaymentDialog.js';
import { missingRequirements, timelineFor } from './entryDetailModel.js';
import { statusMeaning } from '../EntryStatusBadge.js';

const base = {
  createdAt: '2026-09-02T16:12:00.000Z',
  adminHistory: [
    {
      id: '1',
      kind: 'status',
      label: 'waiver: f_pending → f_signed',
      actor: 'https://id.example#abc',
      occurredAt: '2026-09-03T08:00:00.000Z',
      detail: 'Am Terminal',
    },
    {
      id: '2',
      kind: 'entry',
      label: 'data: driver',
      actor: 'A. Beispiel',
      occurredAt: '2026-09-04T08:00:00.000Z',
      detail: 'phone,city',
    },
    {
      id: '3',
      kind: 'email',
      label: 'entry-received: sent',
      actor: 'System',
      occurredAt: '2026-09-02T16:13:00.000Z',
      detail: 'tom@example.test',
    },
    {
      id: '4',
      kind: 'status',
      label: 'technical_inspection: x_raw → y_raw',
      actor: 'System',
      occurredAt: '2026-09-03T09:00:00.000Z',
      detail: '',
    },
  ],
} as unknown as Entry;

describe('entry detail model', () => {
  it('writes history as sentences without raw keys, newest first, without mails', () => {
    const labels = new Map([
      ['f_pending', 'Ausstehend'],
      ['f_signed', 'Unterschrieben'],
    ]);
    const items = timelineFor(base, null, labels);
    expect(items.map((item) => item.title)).toEqual([
      'Fahrerdaten geändert',
      'Technische Abnahme: Unbekannt → Unbekannt',
      'Haftverzicht: Ausstehend → Unterschrieben',
      'Nennung eingereicht',
    ]);
    expect(items[0]).toMatchObject({
      detail: 'Telefon, Ort',
      actor: 'A. Beispiel',
    });
    expect(items[2]).toMatchObject({ actor: 'Veranstalter' });
    expect(JSON.stringify(items)).not.toMatch(/f_pending|x_raw|entry-received/);
  });

  it('limits status actions to those approved by the server and labels admin history', () => {
    const workflow = {
      statuses: [
        {
          key: 'pending',
          labels: { de: 'Offen', en: 'Pending' },
          color: '',
          category: 'pending',
        },
        {
          key: 'rejected',
          labels: { de: 'Abgelehnt', en: 'Rejected' },
          color: '',
          category: 'rejected',
        },
      ],
      transitions: [{ from: 'pending', to: 'rejected', reasonRequired: true }],
    };
    const entry = {
      acceptanceStatus: 'pending',
      availableActions: [],
      statusProjection: { dimensions: [] },
    } as unknown as Entry;
    expect(statusSteps(entry, workflow)).toEqual({ primary: null, others: [] });
    const withHistory = {
      createdAt: '2026-09-01T00:00:00.000Z',
      adminHistory: [
        {
          id: 'note',
          kind: 'entry',
          label: 'internal_note',
          actor: 'Admin',
          occurredAt: '2026-09-02T00:00:00.000Z',
          detail: 'Nur intern',
        },
        {
          id: 'class',
          kind: 'entry',
          label: 'class_changed',
          actor: 'Admin',
          occurredAt: '2026-09-03T00:00:00.000Z',
          detail: 'Klasse passt',
        },
      ],
    } as unknown as Entry;
    expect(
      timelineFor(withHistory, null, new Map()).map((item) => item.title),
    ).toEqual(['Klasse geändert', 'Interne Notiz', 'Nennung eingereicht']);
  });

  it('names what still blocks a clean acceptance', () => {
    const entry = {
      statusProjection: {
        dimensions: [
          { key: 'payment', required: true, meaning: 'in_progress' },
          { key: 'technical_inspection', required: true, meaning: 'missing' },
          { key: 'waiver', required: true, meaning: 'done' },
        ],
      },
    } as unknown as Entry;
    expect(missingRequirements(entry)).toBe(
      'die Zahlung und die technische Abnahme',
    );
  });

  it('parses euro amounts and rejects non-positive or malformed input', () => {
    expect(parseEuroToCents('25,50')).toBe(2550);
    expect(parseEuroToCents('10.5')).toBe(1050);
    expect(parseEuroToCents('0')).toBeNull();
    expect(parseEuroToCents('-3')).toBeNull();
    expect(parseEuroToCents('1,234')).toBeNull();
    expect(parseEuroToCents('abc')).toBeNull();
  });

  it('never highlights a destructive status as the next step', () => {
    const workflow = {
      statuses: [
        {
          key: 'accepted',
          labels: { de: 'Zugelassen', en: 'A' },
          color: '',
          category: 'accepted',
        },
        {
          key: 'withdrawn',
          labels: { de: 'Abgesagt', en: 'W' },
          color: '',
          category: 'withdrawn',
        },
        {
          key: 'pending',
          labels: { de: 'Offen', en: 'P' },
          color: '',
          category: 'pending',
        },
      ],
      transitions: [
        { from: 'accepted', to: 'withdrawn', reasonRequired: true },
        { from: 'accepted', to: 'pending', reasonRequired: true },
      ],
    };
    const entry = (next: string) =>
      ({
        acceptanceStatus: 'accepted',
        statusProjection: {
          dimensions: [{ key: 'entry', nextAction: { key: `entry:${next}` } }],
        },
      }) as unknown as Entry;
    const dangerous = statusSteps(entry('withdrawn'), workflow);
    expect(dangerous.primary).toBeNull();
    expect(dangerous.others.map((step) => step.label)).toEqual([
      'Zurück auf Offen',
      'Als abgesagt markieren …',
    ]);
    expect(statusSteps(entry('pending'), workflow).primary?.label).toBe(
      'Zurück auf Offen',
    );
  });

  it('derives the withdrawn mark from the category and leaves stored revisions alone', () => {
    // A custom revision may carry any stored meaning; the display never rewrites or reinterprets it.
    const custom = {
      key: 'zurueckgezogen',
      category: 'withdrawn',
      meaning: 'not_relevant',
      labels: { de: 'Zurückgezogen', en: 'Withdrawn' },
      color: '#123456',
    };
    const before = JSON.stringify(custom);
    expect(statusMeaning(custom.category)).toBe('rejected');
    expect(statusMeaning('accepted')).toBe('done');
    expect(statusMeaning('pending')).toBe('new');
    expect(JSON.stringify(custom)).toBe(before);
  });

  it('tells the history reader when a shared vehicle was copied', () => {
    const entry = {
      createdAt: '2026-09-01T00:00:00.000Z',
      adminHistory: [
        {
          id: 'c',
          kind: 'entry',
          label: 'data: vehicle (copy)',
          actor: 'A. Beispiel',
          occurredAt: '2026-09-02T00:00:00.000Z',
          detail: 'ownerName,year',
        },
      ],
    } as unknown as Entry;
    const [copy] = timelineFor(entry, null, new Map());
    expect(copy).toMatchObject({ title: 'Fahrzeugdaten geändert' });
    expect(copy?.detail).toContain('Besitzer, Baujahr');
    expect(copy?.detail).toContain('kopiert');
  });
});
