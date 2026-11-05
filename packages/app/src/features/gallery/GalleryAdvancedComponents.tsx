import { useState } from 'react';
import {
  Banner,
  Button,
  DateInput,
  Dialog,
  Disclosure,
  EmptyState,
  FileUpload,
  FilterBar,
  FormSection,
  Inline,
  PageHeader,
  Pagination,
  Stack,
  Tabs,
  Textarea,
  TextInput,
} from '@racepilot/ui';

export function GalleryAdvancedComponents() {
  const [tab, setTab] = useState('list');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const tabs = [
    { id: 'list', label: 'Liste', content: 'Listeninhalt' },
    { id: 'overview', label: 'Übersicht', content: 'Übersichtsinhalte' },
  ];
  return (
    <section className="nb-gallery-advanced">
      <h2>Formulare und Seitenstruktur</h2>
      <PageHeader
        title="Veranstaltung"
        eyebrow="Verwaltung"
        description="Seitentitel, Kontext und Aktionen"
        actions={<Button>Aktion</Button>}
      />
      <FilterBar
        label="Nennungen filtern"
        actions={<Button variant="secondary">Filter zurücksetzen</Button>}
      >
        <TextInput
          label="Suche"
          type="search"
          placeholder="Name oder Startnummer"
        />
        <DateInput label="Datum" />
      </FilterBar>
      <FormSection
        title="Teilnehmerangaben"
        description="Eingaben mit Hilfetext und Fehlerzustand"
      >
        <TextInput label="Name" hint="Vor- und Nachname" />
        <TextInput
          label="Startnummer"
          error="Bitte eine gültige Nummer eingeben."
        />
        <Textarea label="Hinweise" rows={3} />
        <FileUpload
          label="Fahrzeugbild"
          hint="PNG, JPEG oder WebP"
          selectedFileName="fahrzeugfoto.jpg"
        />
      </FormSection>
      <h2>Navigation und Inhalte</h2>
      <Tabs
        label="Inhaltsansicht"
        tabs={tabs}
        selected={tab}
        onChange={setTab}
      />
      <Disclosure label="Weitere Angaben">Erweiterte Informationen</Disclosure>
      <Inline>
        <Button onClick={() => setDialogOpen(true)}>Dialog öffnen</Button>
      </Inline>
      <Stack gap={2}>
        <Banner tone="info" title="Hinweis">
          Kontextuelle Information
        </Banner>
        <Banner tone="success" title="Erledigt">
          Änderung gespeichert
        </Banner>
        <Banner tone="warning" title="Achtung">
          Angabe bitte prüfen
        </Banner>
        <Banner tone="error" title="Fehler">
          Speichern nicht möglich
        </Banner>
      </Stack>
      <Dialog
        open={dialogOpen}
        title="Änderung bestätigen"
        closeLabel="Dialog schließen"
        onClose={() => setDialogOpen(false)}
        actions={
          <Button onClick={() => setDialogOpen(false)}>Schließen</Button>
        }
      >
        Die Änderung wird nach dem Bestätigen gespeichert.
      </Dialog>
      <Pagination
        page={page}
        pageCount={4}
        previousLabel="Zurück"
        nextLabel="Weiter"
        pageLabel={(current, count) => `Seite ${current} von ${count}`}
        onPageChange={setPage}
      />
      <Stack>
        <EmptyState
          title="Keine Nennungen"
          description="Es gibt noch keine Nennungen für diese Veranstaltung."
          action={<Button>Einladung teilen</Button>}
        />
      </Stack>
    </section>
  );
}
