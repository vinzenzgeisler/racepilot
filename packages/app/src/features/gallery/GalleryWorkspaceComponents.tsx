import { useState } from 'react';
import {
  ActionPanel,
  AdminNavigation,
  AdminWorkspace,
  Button,
  DataTable,
  DocumentList,
  EntryListRow,
  FilterBar,
  HistoryTimeline,
  Menu,
  MenuItem,
  PageHeader,
  PreviewPanel,
  SelectField,
  StatusLabel,
  TextInput,
  Wordmark,
  WorkspaceSplit,
} from '@racepilot/ui';

const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="210"><defs><linearGradient id="g"><stop stop-color="#7d8b78"/><stop offset="1" stop-color="#34473c"/></linearGradient></defs><rect width="320" height="210" fill="url(#g)"/></svg>')}`;
const events = [
  { id: 'historic', label: 'Historischer Bergpreis 2027' },
  { id: 'other', label: 'Zweite Veranstaltung' },
];
const labels = (
  <>
    <StatusLabel status="in_progress" label="Vorauswahl" />
    <StatusLabel status="done" label="Bezahlt" />
  </>
);
export function GalleryWorkspaceComponents() {
  const [event, setEvent] = useState('historic');
  const [view, setView] = useState('admin');
  const [current, setCurrent] = useState('entries');
  const [selected, setSelected] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [filter, setFilter] = useState(true);
  const navigation = (
    <AdminNavigation
      brand={<Wordmark variant="on-green" />}
      ariaLabel="Hauptnavigation"
      eventLabel="Veranstaltung"
      eventPlaceholder="Veranstaltung wählen"
      events={events}
      selectedEvent={event}
      onEventChange={setEvent}
      groups={[
        {
          label: 'Veranstaltung',
          items: [
            { id: 'entries', label: 'Nennungen', icon: 'list', count: 62 },
            { id: 'workflow', label: 'Nennungsablauf', icon: 'approval' },
          ],
        },
        {
          label: 'Konto',
          items: [{ id: 'settings', label: 'Einstellungen', icon: 'more' }],
        },
      ]}
      current={current}
      onNavigate={setCurrent}
      user={<span>VG · Veranstalter</span>}
    />
  );
  const preview = previewOpen ? (
    <PreviewPanel
      eyebrow="Vorschau"
      number="42"
      title="Tom Probe"
      subtitle="Honda RS 250 · M4"
      imageUrl={image}
      imageAlt="Neutrales Fahrzeugbild"
      labels={labels}
      onClose={() => {
        setPreviewOpen(false);
        setMobilePreviewOpen(false);
      }}
      closeLabel="Vorschau schließen"
      footer={<Button variant="secondary">Vollständig öffnen</Button>}
    >
      <DocumentList
        title="Unterlagen"
        items={[
          {
            id: 'a',
            label: 'Haftverzicht',
            status: <StatusLabel status="missing" label="Ausstehend" />,
          },
          {
            id: 'b',
            label: 'Fahrzeugbild',
            status: <StatusLabel status="done" label="Vorhanden" />,
          },
        ]}
      />
      <ActionPanel
        title="Nächster Schritt"
        hint="Nennung prüfen und anschließend zulassen."
        action={<Button>Zulassen</Button>}
        secondary={<Button variant="secondary">Nachricht</Button>}
      />
      <HistoryTimeline
        title="Verlauf"
        items={[
          {
            id: '1',
            time: '05.11. 08:40',
            title: 'Nennung eingegangen',
            actor: 'Teilnehmer',
            tone: 'open',
          },
          {
            id: '2',
            time: '06.11. 09:15',
            title: 'Vorauswahl gesetzt',
            actor: 'A. Beispiel',
          },
        ]}
      />
    </PreviewPanel>
  ) : undefined;
  return (
    <section className="nb-gallery-workspace">
      <h2>App-Muster · A1 / A2 / A6</h2>
      <p>
        Navigation, Kopfzeile, Filter, Tabellenzeile und Vorschau – mit
        benutzbaren Zuständen.
      </p>
      <div className="nb-gallery-workspace-frame">
        <AdminWorkspace
          navigation={navigation}
          inset={false}
          header={
            <PageHeader
              title="Nennungen"
              description="Nennungsschluss: 14.05.2027, 23:59"
              views={[
                { id: 'admin', label: 'Verwaltung' },
                { id: 'race', label: 'Rennbetrieb' },
              ]}
              selectedView={view}
              onViewChange={setView}
              actions={<Button>Nennung anlegen</Button>}
            />
          }
        >
          <WorkspaceSplit
            preview={preview}
            previewLabel="Nennungsvorschau"
            mobilePreviewOpen={mobilePreviewOpen}
            filters={
              <FilterBar
                label="Nennungen filtern"
                activeFilters={
                  filter
                    ? [
                        {
                          id: 'paid',
                          label: 'Zahlung: Bezahlt',
                          removeLabel: 'Zahlungsfilter entfernen',
                        },
                      ]
                    : []
                }
                onRemoveFilter={() => setFilter(false)}
              >
                <TextInput
                  label="Suche"
                  placeholder="Startnummer, Name oder Fahrzeug"
                />
                <SelectField label="Klasse">
                  <option>Alle Klassen</option>
                  <option>M4</option>
                </SelectField>
                <SelectField label="Zahlung">
                  <option>Alle Zahlungen</option>
                  <option>Bezahlt</option>
                </SelectField>
                <SelectField label="Sortierung">
                  <option>Neueste zuerst</option>
                </SelectField>
              </FilterBar>
            }
          >
            <DataTable
              headers={[
                'Auswahl',
                'Nennung',
                'Klasse',
                'Nr.',
                'Status',
                'Zahlung',
                'Abnahme',
                'Haftverzicht',
                'Aktion',
              ]}
            >
              <EntryListRow
                name="Tom Probe"
                vehicle="Honda RS 250 · 4K7QZ"
                imageUrl={image}
                className="M4 · 250"
                number="42"
                selected={selected}
                onSelect={setSelected}
                onOpen={() => {
                  setPreviewOpen(true);
                  setMobilePreviewOpen(true);
                }}
                selectLabel="Tom Probe auswählen"
                status={<StatusLabel status="in_progress" label="Vorauswahl" />}
                payment={<StatusLabel status="done" label="Bezahlt" />}
                inspection={<StatusLabel status="missing" label="Ausstehend" />}
                waiver={<StatusLabel status="missing" label="Ausstehend" />}
                nextAction={<Button size={32}>Zulassen</Button>}
                menu={
                  <Menu label="Weitere Aktionen">
                    <MenuItem>Vorschau öffnen</MenuItem>
                  </Menu>
                }
              />
              <EntryListRow
                name="Piet Voorbeeld"
                vehicle="Yamaha R1 · 2HN8T"
                className="M6 · 500–1000"
                number="69"
                selected={false}
                onSelect={() => {}}
                selectLabel="Piet Voorbeeld auswählen"
                status={<StatusLabel status="done" label="Zugelassen" />}
                payment={
                  <StatusLabel
                    status="not_relevant"
                    label="Keine erforderlich"
                  />
                }
                inspection={<StatusLabel status="done" label="Bestanden" />}
                waiver={<StatusLabel status="done" label="Unterschrieben" />}
                nextAction={
                  <Button size={32} disabled>
                    Zulassen
                  </Button>
                }
              />
              <EntryListRow
                name="Karel Ukázka"
                vehicle="Škoda 130 RS · D8R2M"
                className="H1 · bis 1300"
                number="199"
                selected={false}
                onSelect={() => {}}
                selectLabel="Karel Ukázka auswählen"
                status={<StatusLabel status="rejected" label="Abgesagt" />}
                payment={<StatusLabel status="empty" label="Kein Wert" />}
                inspection={<StatusLabel status="empty" label="Kein Wert" />}
                waiver={<StatusLabel status="empty" label="Kein Wert" />}
                nextAction={
                  <Button size={32} disabled>
                    Zulassen
                  </Button>
                }
              />
            </DataTable>
          </WorkspaceSplit>
        </AdminWorkspace>
      </div>
      <div className="nb-gallery-workspace-states">
        <ActionPanel
          title="Keine nächste Aktion"
          hint="Alle Schritte sind erledigt."
          action={<Button disabled>Erledigt</Button>}
        />
        <DocumentList
          title="Unterlagen · leer"
          items={[]}
          empty={<p>Keine Unterlagen vorhanden.</p>}
        />
        <HistoryTimeline
          title="Verlauf · leer"
          items={[]}
          empty={<p>Noch keine Einträge.</p>}
        />
        <PreviewPanel
          eyebrow="Vorschau · leer"
          title="Keine Nennung ausgewählt"
        />
      </div>
    </section>
  );
}
