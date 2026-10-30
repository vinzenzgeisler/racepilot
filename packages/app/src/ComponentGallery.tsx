import { useState } from 'react';
import {
  Button,
  Checkbox,
  DataField,
  DataTable,
  Field,
  HintLabel,
  Icon,
  Menu,
  MenuItem,
  Nameplate,
  Radio,
  SelectField,
  SelectionBar,
  StartLight,
  StartLine,
  StatusLabel,
  Steps,
  Switch,
  TechnicalLabel,
  Toast,
} from '@racepilot/ui';

export function ComponentGallery() {
  const [toast, setToast] = useState(false);
  const [selected, setSelected] = useState(false);
  return (
    <main className="shell nb-gallery">
      <header className="masthead">
        <div>
          <p className="eyebrow">NENNBOX · M6 / A2</p>
          <h1>Komponenten</h1>
          <p>Review-Galerie der Basis- und App-Komponenten.</p>
        </div>
      </header>
      <section>
        <h2>Buttons</h2>
        <div className="nb-gallery-row">
          <Button size={56}>Groß · 56</Button>
          <Button size={48}>Mittel · 48</Button>
          <Button size={40}>Primär · 40</Button>
          <span className="nb-gallery-dark">
            <Button variant="primary-dark" size={40}>
              Primär dunkel · 40
            </Button>
          </span>
          <Button size={32}>Kompakt · 32</Button>
          <Button size={40} disabled>
            Inaktiv · 40
          </Button>
          <Button variant="secondary">Sekundär</Button>
          <Button variant="text">Details →</Button>
          <Button
            variant="danger"
            confirmText="Nennung Nr. 42 ablehnen? Tom Probe erhält eine E-Mail mit dem Grund."
            onDangerConfirm={() => setToast(true)}
          >
            Ablehnen …
          </Button>
        </div>
      </section>
      <section>
        <h2>Button-Zustände</h2>
        <div className="nb-gallery-row">
          <Button>Standard</Button>
          <Button className="nb-state-hover">Hover</Button>
          <Button className="nb-state-pressed">Gedrückt</Button>
          <Button className="nb-state-focus">Fokus</Button>
          <Button disabled>Inaktiv</Button>
          <span className="nb-gallery-dark">
            <Button variant="primary-dark">Dunkel · Standard</Button>
          </span>
          <span className="nb-gallery-dark">
            <Button variant="primary-dark" className="nb-state-hover">
              Dunkel · Hover
            </Button>
          </span>
          <span className="nb-gallery-dark">
            <Button variant="primary-dark" className="nb-state-pressed">
              Dunkel · Gedrückt
            </Button>
          </span>
          <span className="nb-gallery-dark">
            <Button variant="primary-dark" className="nb-state-focus">
              Dunkel · Fokus
            </Button>
          </span>
          <span className="nb-gallery-dark">
            <Button variant="primary-dark" disabled>
              Dunkel · Inaktiv
            </Button>
          </span>
          <Button variant="secondary" className="nb-state-hover">
            Sekundär · Hover
          </Button>
          <Button variant="secondary" className="nb-state-pressed">
            Sekundär · Gedrückt
          </Button>
          <Button variant="secondary" className="nb-state-focus">
            Sekundär · Fokus
          </Button>
          <Button variant="secondary" disabled>
            Sekundär · Inaktiv
          </Button>
        </div>
      </section>
      <section>
        <h2>Eingaben</h2>
        <div className="nb-gallery-grid">
          <Field label="Hersteller" placeholder="Name" />
          <Field
            label="Baujahr"
            error="Bitte vierstellig angeben."
            defaultValue="20"
          />
          <SelectField label="Klasse">
            <option>M4 · Rennmotorräder 250</option>
            <option>M3 · Rennmotorräder 500</option>
          </SelectField>
          <div>
            <Checkbox label="Bedingungen akzeptiert" />
            <Radio name="vehicle" label="Motorrad" defaultChecked />
            <Radio name="vehicle" label="Automobil" />
            <Switch label="Nennung offen" defaultChecked />
          </div>
        </div>
      </section>
      <section>
        <h2>Status & Hinweise</h2>
        <div className="nb-gallery-row">
          {(
            [
              'new',
              'in_progress',
              'missing',
              'done',
              'rejected',
              'not_relevant',
            ] as const
          ).map((status) => (
            <StatusLabel key={status} status={status} />
          ))}
          <HintLabel>Doppelstarter</HintLabel>
        </div>
      </section>
      <section>
        <h2>Icons</h2>
        <div className="nb-gallery-row">
          {(
            [
              'list',
              'document',
              'mail',
              'calendar',
              'approval',
              'info',
              'search',
              'filter',
              'more',
              'next',
            ] as const
          ).map((name) => (
            <span className="nb-icon-sample" key={name}>
              <Icon name={name} label={name} />
              <TechnicalLabel>{name}</TechnicalLabel>
            </span>
          ))}
        </div>
      </section>
      <section>
        <h2>App-Bausteine</h2>
        <div className="nb-gallery-row">
          <Steps steps={['Eingang', 'Prüfung', 'Abschluss']} current={1} />
          <StartLight state="loading" />
          <StartLight state="go" />
          <Nameplate name="Tom Probe" detail="M4 · Startnummer 42" />
        </div>
        <StartLine />
        <div className="nb-gallery-grid">
          <DataField label="E-Mail">tom.probe@beispiel.nl</DataField>
          <DataField label="Startnummer">42</DataField>
        </div>
      </section>
      <section>
        <h2>Tabelle & Menü</h2>
        <DataTable headers={['', 'Nennung', 'Status', 'Aktion']}>
          <tr>
            <td>
              <Checkbox
                aria-label="Tom Probe auswählen"
                checked={selected}
                onChange={(e) => setSelected(e.target.checked)}
                label=""
              />
            </td>
            <td>Tom Probe · M4 · Nr. 42</td>
            <td>
              <StatusLabel status="in_progress" />
            </td>
            <td>
              <Button size={32}>Zulassen</Button>{' '}
              <Menu>
                <MenuItem>Details</MenuItem>
                <MenuItem>Ablehnen …</MenuItem>
              </Menu>
            </td>
          </tr>
        </DataTable>
      </section>
      <section>
        <h2>Rückmeldung</h2>
        <Button onClick={() => setToast(true)}>Bestätigung zeigen</Button>
        {toast && (
          <Toast
            action="Rückgängig"
            onAction={() => setToast(false)}
            onDismiss={() => setToast(false)}
          >
            Nr. 42 ist zugelassen.
          </Toast>
        )}
      </section>
      {selected && (
        <SelectionBar
          count={1}
          total={3}
          action="Zulassen"
          onClear={() => setSelected(false)}
        />
      )}
    </main>
  );
}
