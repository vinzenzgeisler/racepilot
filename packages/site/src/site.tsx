const repo = 'https://github.com/vinzenzgeisler/racepilot';

function TrackGraphic() {
  return (
    <svg
      className="track-art"
      viewBox="0 0 760 660"
      role="img"
      aria-labelledby="track-title track-desc"
    >
      <title id="track-title">Motorsport-Ablauf als Rennstrecke</title>
      <desc id="track-desc">
        Eine stilisierte Strecke verbindet Veranstalter, Event und Fahrer. Ein
        Fahrzeug bewegt sich in Richtung Start.
      </desc>
      <defs>
        <linearGradient id="track" x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#c9f31d" />
          <stop offset="1" stopColor="#83a510" />
        </linearGradient>
        <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
          <path
            d="M34 0H0v34"
            fill="none"
            stroke="#fff"
            strokeOpacity=".055"
            strokeWidth="1"
          />
        </pattern>
        <filter id="glow">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path fill="url(#grid)" d="M0 0h760v660H0z" />
      <circle
        cx="410"
        cy="328"
        r="230"
        fill="none"
        stroke="#fff"
        strokeOpacity=".07"
      />
      <circle
        cx="410"
        cy="328"
        r="179"
        fill="none"
        stroke="#fff"
        strokeOpacity=".04"
      />
      <path
        d="M94 502c98 0 89-97 176-97h126c79 0 89-89 9-89h-96c-67 0-68-97 7-97h166c67 0 89-78 25-106"
        fill="none"
        stroke="#2a2c26"
        strokeWidth="55"
        strokeLinecap="round"
      />
      <path
        d="M94 502c98 0 89-97 176-97h126c79 0 89-89 9-89h-96c-67 0-68-97 7-97h166c67 0 89-78 25-106"
        fill="none"
        stroke="url(#track)"
        strokeWidth="3"
        strokeDasharray="8 12"
        strokeLinecap="round"
        filter="url(#glow)"
      />
      <g transform="translate(469 201) rotate(-24)">
        <rect x="-48" y="-15" width="96" height="30" rx="10" fill="#c9f31d" />
        <path d="M-21-14l12-16h30l12 16" fill="#c9f31d" />
        <rect x="-29" y="-11" width="22" height="11" rx="3" fill="#171914" />
        <rect x="7" y="-11" width="22" height="11" rx="3" fill="#171914" />
        <circle
          cx="-29"
          cy="16"
          r="8"
          fill="#10110f"
          stroke="#c9f31d"
          strokeWidth="3"
        />
        <circle
          cx="29"
          cy="16"
          r="8"
          fill="#10110f"
          stroke="#c9f31d"
          strokeWidth="3"
        />
      </g>
      <g className="map-point" transform="translate(96 502)">
        <circle r="20" fill="#c9f31d" fillOpacity=".16" />
        <circle r="7" fill="#c9f31d" />
      </g>
      <g className="map-point" transform="translate(296 405)">
        <circle r="20" fill="#c9f31d" fillOpacity=".16" />
        <circle r="7" fill="#c9f31d" />
      </g>
      <g className="map-point" transform="translate(310 219)">
        <circle r="20" fill="#c9f31d" fillOpacity=".16" />
        <circle r="7" fill="#c9f31d" />
      </g>
      <g transform="translate(555 411)">
        <rect width="153" height="74" rx="4" fill="#171914" stroke="#45483e" />
        <text
          x="16"
          y="28"
          fill="#92958b"
          fontFamily="DM Sans"
          fontSize="10"
          letterSpacing="2"
        >
          NÄCHSTER SCHRITT
        </text>
        <text
          x="16"
          y="54"
          fill="#f3f3ed"
          fontFamily="Barlow Condensed"
          fontWeight="700"
          fontSize="21"
        >
          STARTLINIE
        </text>
        <path
          d="M132 41h12m-5-5 5 5-5 5"
          fill="none"
          stroke="#c9f31d"
          strokeWidth="2"
        />
      </g>
      <text
        x="39"
        y="55"
        fill="#888b80"
        fontFamily="DM Sans"
        fontSize="10"
        letterSpacing="3"
      >
        RACE CONTROL / 01
      </text>
      <text x="39" y="78" fill="#f3f3ed" fontFamily="DM Sans" fontSize="13">
        VOM EVENT ZUR NENNUNG
      </text>
    </svg>
  );
}

export function App() {
  return (
    <>
      <a className="skip-link" href="#inhalt">
        Zum Inhalt springen
      </a>
      <header className="topbar">
        <a className="brand" href="#start" aria-label="RacePilot Startseite">
          <span className="brand-mark">R</span>
          <span>
            RACE<span className="brand-light">PILOT</span>
          </span>
        </a>
        <nav aria-label="Hauptnavigation">
          <a href="#ablauf">So funktioniert’s</a>
          <a href="#editionen">Community & Cloud</a>
          <a href="#fragen">FAQ</a>
        </nav>
        <a className="top-cta" href={repo}>
          Projekt auf GitHub <span aria-hidden="true">↗</span>
        </a>
      </header>
      <main id="inhalt">
        <section className="hero" id="start">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" /> ÖFFENTLICH ENTWICKELT · IM AUFBAU
            </div>
            <h1>
              Motorsport.
              <br />
              <em>In Bewegung.</em>
            </h1>
            <p className="hero-lede">
              Weniger Reibung zwischen Veranstaltung und Nennung. RacePilot
              entwickelt die offene Plattform, die Motorsport-Organisation
              Schritt für Schritt zusammenbringt.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href={repo}>
                Entwicklung verfolgen <span aria-hidden="true">↗</span>
              </a>
              <a className="text-link" href="#ablauf">
                Was wir bauen <span aria-hidden="true">↓</span>
              </a>
            </div>
            <div className="hero-note">
              <span className="note-line" /> Keine Live-Demo — RacePilot ist
              noch im Aufbau.
            </div>
          </div>
          <div className="hero-visual">
            <TrackGraphic />
            <div className="visual-caption">
              <span>01 — 03</span>
              <span>DER WEG AUF DIE STRECKE</span>
            </div>
          </div>
          <div className="hero-index">
            01 <span>/</span> 03
          </div>
        </section>
        <section className="intro section-pad">
          <div className="section-kicker">FÜR DEN SPORT. GEMACHT.</div>
          <div className="intro-grid">
            <h2>
              Der Renntag ist
              <br />
              kompliziert genug.
            </h2>
            <div>
              <p>
                Veranstaltungen zu organisieren heißt: Informationen sammeln,
                Abläufe koordinieren und viele Menschen auf denselben Stand
                bringen. RacePilot hat ein klares Ziel: diese Arbeit in einer
                gemeinsamen digitalen Plattform einfacher zu machen.
              </p>
              <p className="muted">
                Wir bauen von Grund auf neu — offen, nachvollziehbar und in
                engem Austausch mit der Realität des Motorsports.
              </p>
            </div>
          </div>
        </section>
        <section className="flow section-pad" id="ablauf">
          <div className="section-heading">
            <div>
              <div className="section-kicker">EIN KLARER ABLAUF</div>
              <h2>
                Vom ersten Schritt
                <br />
                bis zur Startlinie.
              </h2>
            </div>
            <p>
              Das ist die Richtung, in die RacePilot wächst. Die
              Produktfunktionen entstehen gerade — die einzelnen Stationen sind
              noch nicht als fertiger Workflow verfügbar.
            </p>
          </div>
          <div className="flow-cards">
            <article>
              <span className="card-num">01 / VERANSTALTER</span>
              <div className="card-icon">⌖</div>
              <h3>Event vorbereiten</h3>
              <p>
                Veranstalter sollen Termine, Informationen und organisatorische
                Abläufe an einem Ort zusammenführen können.
              </p>
              <span className="status">IN ENTWICKLUNG</span>
            </article>
            <article>
              <span className="card-num">02 / FAHRER</span>
              <div className="card-icon">↗</div>
              <h3>Informationen finden</h3>
              <p>
                Fahrer sollen relevante Veranstaltungsdetails übersichtlich
                finden und wissen, was für die Teilnahme gebraucht wird.
              </p>
              <span className="status">IN ENTWICKLUNG</span>
            </article>
            <article>
              <span className="card-num">03 / NENNUNG</span>
              <div className="card-icon">▤</div>
              <h3>Gemeinsam weiter</h3>
              <p>
                Der Weg zur Nennung soll klarer werden — von der ersten
                Information bis zur strukturierten Abwicklung.
              </p>
              <span className="status">AUSBLICK</span>
            </article>
          </div>
        </section>
        <section className="editions section-pad" id="editionen">
          <div className="section-kicker">OFFEN GEDACHT. KLAR GETRENNT.</div>
          <h2>
            Eine Plattform.
            <br />
            <span>Zwei Wege.</span>
          </h2>
          <p className="editions-lede">
            Die Architektur ist auf zwei Betriebsarten ausgelegt. Beide teilen
            sich denselben Produktkern — die Umsetzung ist noch nicht verfügbar.
          </p>
          <div className="edition-grid">
            <article>
              <div className="edition-top">
                <span>01</span>
                <span className="edition-tag">GEPLANT</span>
              </div>
              <h3>Community</h3>
              <p>
                Selbst betreiben, volle Kontrolle behalten. Die
                Community-Ausgabe ist als kostenlos nutzbare Software geplant.
                Die Lizenz wird vor der Veröffentlichung festgelegt.
              </p>
              <a href="https://github.com/vinzenzgeisler/racepilot/blob/main/docs/adr/0001-editions-shared-core-and-deployment-modes.md">
                Architekturentscheidung lesen <span aria-hidden="true">↗</span>
              </a>
            </article>
            <article className="edition-cloud">
              <div className="edition-top">
                <span>02</span>
                <span className="edition-tag">AUSBLICK</span>
              </div>
              <h3>Cloud</h3>
              <p>
                Eine von RacePilot betriebene Variante mit
                Organisationsverwaltung und Plattformbetrieb — für später
                vorgesehen.
              </p>
              <span className="cloud-foot">KEIN STARTTERMIN ANGEKÜNDIGT</span>
            </article>
          </div>
        </section>
        <section className="faq section-pad" id="fragen">
          <div>
            <div className="section-kicker">GUT ZU WISSEN</div>
            <h2>Offene Antworten.</h2>
          </div>
          <div className="faq-list">
            <details>
              <summary>
                Kann ich RacePilot schon ausprobieren?
                <span aria-hidden="true">+</span>
              </summary>
              <p>
                Noch nicht. Dieses Repository enthält den Aufbau und die
                Architektur des Produkts, aber aktuell keine nutzbare
                Veranstaltungs- oder Nennungsoberfläche. Wir behaupten deshalb
                keine Live-Demo.
              </p>
            </details>
            <details>
              <summary>
                Was funktioniert heute bereits?<span aria-hidden="true">+</span>
              </summary>
              <p>
                Die technische Grundlage des Monorepos und Teile des
                Backend-Kerns werden entwickelt. Die öffentlichen
                Nutzer-Workflows für Veranstalter und Fahrer sind noch nicht
                fertig.
              </p>
            </details>
            <details>
              <summary>
                Was kostet RacePilot?<span aria-hidden="true">+</span>
              </summary>
              <p>
                Für Community ist laut Architekturentscheidung keine
                RacePilot-Lizenz oder Pflichtgebühr vorgesehen. Ein fertiges
                Produkt und ein Cloud-Angebot mit Preisen gibt es noch nicht.
              </p>
            </details>
            <details>
              <summary>
                Wie kann ich den Fortschritt verfolgen?
                <span aria-hidden="true">+</span>
              </summary>
              <p>
                Der Code und die offenen Aufgaben sind öffentlich auf GitHub.
                Dort kannst du die Entwicklung nachvollziehen und konkrete
                Themen ansprechen.
              </p>
            </details>
          </div>
        </section>
        <section className="closing section-pad">
          <div className="closing-mark" aria-hidden="true">
            R
          </div>
          <div className="section-kicker">DIE STARTAUFSTELLUNG ENTSTEHT.</div>
          <h2>Schau beim Aufbau zu.</h2>
          <p>
            Öffentliche Entwicklung. Klare Entscheidungen. Kein Marketing-Nebel.
          </p>
          <a className="button button-primary" href={repo}>
            RacePilot auf GitHub <span aria-hidden="true">↗</span>
          </a>
        </section>
      </main>
      <footer>
        <a className="brand" href="#start">
          <span className="brand-mark">R</span>
          <span>
            RACE<span className="brand-light">PILOT</span>
          </span>
        </a>
        <span>OFFEN ENTWICKELT. FÜR DEN MOTORSPORT.</span>
        <a href={`${repo}/issues`}>
          Fragen & Beiträge <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </>
  );
}
