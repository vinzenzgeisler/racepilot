import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import {
  ActionGroup,
  NextStep,
  NextStepButton,
  RailAction,
} from './ActionRail.js';
import { DetailHeader } from './DetailHeader.js';
import { DetailLayout } from './DetailLayout.js';
import { DetailSection, FieldGrid, FieldItem } from './DetailSection.js';
import { MessageTable } from './MessageTable.js';
import { ReasonDialog } from './ReasonDialog.js';
import { DocumentList } from '../workspace/DocumentList.js';
import { HistoryTimeline } from '../workspace/HistoryTimeline.js';

it('puts header, content and rail into one grid with a labelled rail', () => {
  const html = renderToStaticMarkup(
    <DetailLayout header={<p>Kopf</p>} rail={<p>Rail</p>} railLabel="Aktionen">
      <p>Inhalt</p>
    </DetailLayout>,
  );
  expect(html).toContain('nb-detail has-rail');
  expect(html).toContain(
    '<aside class="nb-detail-rail" aria-label="Aktionen">',
  );
  expect(html.indexOf('Kopf')).toBeLessThan(html.indexOf('Inhalt'));
});

it('shows the number, title, meta and labels in the header', () => {
  const html = renderToStaticMarkup(
    <DetailHeader
      backLabel="Nennungen"
      onBack={vi.fn()}
      number="42"
      title="Tom Probe · Honda RS 250"
      subtitle="Klasse M4"
      meta="Eingang 02.09.2026"
      labels={<span>Label</span>}
    />,
  );
  for (const text of [
    'Nennungen',
    '42',
    'Tom Probe',
    'Klasse M4',
    'Eingang',
    'Label',
  ])
    expect(html).toContain(text);
  expect(
    renderToStaticMarkup(
      <DetailHeader backLabel="x" onBack={vi.fn()} title="t" />,
    ),
  ).toContain('—');
});

it('labels a section and lays out field values as a definition list', () => {
  const html = renderToStaticMarkup(
    <DetailSection
      title="Fahrer"
      action={<button type="button">Bearbeiten</button>}
    >
      <FieldGrid>
        <FieldItem label="Name">Tom</FieldItem>
        <FieldItem label="Historie" wide>
          Text
        </FieldItem>
      </FieldGrid>
    </DetailSection>,
  );
  expect(html).toMatch(/<section[^>]*aria-labelledby="([^"]+)"/);
  expect(html).toContain('<dt>Name</dt><dd>Tom</dd>');
  expect(html).toContain('is-wide');
});

it('renders the next step above grouped rail actions', () => {
  const html = renderToStaticMarkup(
    <>
      <NextStep
        label="Nächster Schritt"
        action={<NextStepButton>Zulassen</NextStepButton>}
        hint="Hinweis"
      />
      <ActionGroup title="Status">
        <RailAction tone="danger">Ablehnen …</RailAction>
      </ActionGroup>
    </>,
  );
  expect(html).toContain('nb-next-button');
  expect(html).toContain('nb-rail-danger');
  expect(html.indexOf('Zulassen')).toBeLessThan(html.indexOf('Ablehnen'));
});

it('lists documents with status and action and keeps the title optional', () => {
  const html = renderToStaticMarkup(
    <DocumentList
      items={[
        {
          id: 'a',
          label: 'Fahrzeugschein',
          status: <i>Fehlt</i>,
          action: <a href="#x">Nachfordern</a>,
          emphasis: true,
        },
      ]}
    />,
  );
  expect(html).not.toContain('<h3');
  expect(html).toContain('is-emphasis');
  expect(html).toContain('Nachfordern');
});

it('renders history items newest-first as given, with tone, actor and time', () => {
  const html = renderToStaticMarkup(
    <HistoryTimeline
      items={[
        {
          id: '1',
          title: 'Zahlung eingegangen',
          time: '03.09. 10:12',
          dateTime: '2026-09-03T08:12:00Z',
          actor: 'System',
          tone: 'accent',
        },
        {
          id: '2',
          title: 'Nennung eingereicht',
          time: '02.09. 18:12',
          tone: 'open',
        },
      ]}
    />,
  );
  expect(html).toContain('is-accent');
  expect(html).toContain('is-open');
  expect(html).toMatch(
    /<time datetime="2026-09-03T08:12:00Z">03\.09\. 10:12<\/time>/i,
  );
  expect(html).toContain('System');
});

it('renders mails as table rows with a column label on every cell', () => {
  const headers = {
    status: 'Status',
    subject: 'Betreff',
    template: 'Vorlage',
    sent: 'Gesendet',
  };
  const html = renderToStaticMarkup(
    <MessageTable
      headers={headers}
      rows={[
        {
          id: '1',
          status: 'Zugestellt',
          subject: 'Betreff 1',
          template: 'entry-received',
          sent: '02.09.',
        },
      ]}
    />,
  );
  expect(html).toContain('data-label="Betreff"');
  expect(
    renderToStaticMarkup(
      <MessageTable
        headers={headers}
        rows={[]}
        empty={<p>Keine Nachrichten</p>}
      />,
    ),
  ).toBe('<p>Keine Nachrichten</p>');
});

it('keeps the confirmation disabled until a reason is typed', () => {
  const html = renderToStaticMarkup(
    <ReasonDialog
      open
      title="Ablehnen"
      reasonLabel="Begründung"
      confirmLabel="Ablehnen"
      cancelLabel="Abbrechen"
      closeLabel="Schließen"
      onConfirm={vi.fn()}
      onClose={vi.fn()}
      error="Fehlgeschlagen"
    />,
  );
  expect(html).toMatch(/nb-confirm-primary"[^>]*disabled/);
  expect(html).toContain('role="alert"');
});
