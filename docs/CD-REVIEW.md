# CD-Abgleich mit Oblique 15.4.4 — Review und Umsetzung

Gegenstand: objektiver Lücken-/Treueabgleich der App gegen den echten
Oblique-Quellcode (`oblique-bit/oblique`, lokal ausgecheckt), dazu
Token-Audit, Modularität, Responsive/Mobile und visuelle Ruhe.
Methode: drei unabhängige Review-Läufe (Token-Audit gegen `tokens.css`;
Komponenten-/Breakpoint-Treue gegen die Oblique-SCSS-Quellen mit
Datei-/Zeilenbelegen; UX-Durchgang Clutter/Modularität/375-px-Walkthrough),
ergänzt um Browser-Messungen und Screenshots (Desktop 1280, Mobile 375).
Bereits dokumentierte Abweichungen (docs/OBLIQUE.md §5) galten nicht als
Befund. Stand: 2026-08-31; alle Zeilenangaben beziehen sich auf den Stand
vor der Umsetzung.

## 1. Gesamtbild

Die Wertebene ist echt: Tokens, Knöpfe, Alerts, Tabelle, Chips, Fusszeile,
Skip-Link, Eingabefelder, Karten-Schatten und Brotkrume wurden Wert für
Wert gegen die Oblique-Quellen geprüft und stimmen. Die Breakpoints der App
(600/905/1241/1441 und matchMedia 905) entsprechen exakt dem CD-Raster
xs/sm/md/lg/xl inklusive der +1-px-Konvention von `ob-media-breakpoint-up()`
— Oblique selbst ist zwischen SCSS (906) und TS (905) um 1 px inkonsistent;
die App folgt der TS-Seite, die die Klassen tatsächlich schaltet.

Die echten Lücken lagen in drei Feldern: **hartkodierte Werte, für die
Tokens existieren** (51 Stellen), **Zustände, die der Angular/Material-Layer
gratis mitliefert** (Karten-Hover, Select-Fokusrand, disabled-Felder,
Sortierpfeil-Andeutung) und **Mobile** (dauerklebender Kopf, gequetschte
Tabelle, überlaufende Dialog-Aktionszeile, tote Touch-Target-Tokens).

## 2. Token-Audit — umgesetzt

51 hartkodierte Werte in `main.css` hatten ein wertidentisches, semantisch
passendes Token und wurden ersetzt — darunter die komplette Alert-Palette
(`--ob-s3-color-status-*`), die Chip-Familie (`neutral-*-inversity_flipped`),
Zebra/Hover der Tabelle, Tooltip, Facetten-Panel und die Graph-Strukturfarben
(Text-Halo = Grundfläche, Zentrumsscheibe). Bewusst hart bleiben (kein Token
existiert): Tab-Rot `#e53940`, MDC-Checkbox `rgba(0,0,0,.54)`,
Dialog-Backdrop `rgba(0,0,0,.32)`, die drei handgerundeten Karten-/
Tooltip-Schatten (Token-Werte weichen in Spread/Alpha ab), Caption-Grau
`#46596b` (nur als bg-Token vorhanden), Chip-Radius 16 px sowie Farben in
`url()`-Data-URIs (dort ist `var()` technisch unmöglich; die Paginator-URIs
sind inzwischen ganz durch Sprite-Icons ersetzt). Zwei **latente
Token-Fehler** in der übernommenen `tokens.css` wurden repariert:
`--ob-s-shadow-2xl` und `--ob-s-shadow-main_nav-active` begannen mit
einheitenlosen Längen und hätten die Deklaration ungültig gemacht.

## 3. Komponententreue — umgesetzt

- **Sprachwahl zuletzt**: die Service-Navigation rendert im CD erst die
  Custom-Controls, die Sprache schliesst rechts ab — Reihenfolge korrigiert.
- **Karten-Hover** wie `_mat-card.scss`: Schatten xl **plus** Fläche
  `#f0f4f7`/Rand `#acb4bd` (als Tokens); die erfundene Titel-Unterstreichung
  ist entfernt.
- **Select** bekommt den 2-px-Rand bei Hover/Fokus wie jedes CD-Formularfeld;
  **disabled**-Felder Text+Rand `#828e9a` (Token).
- **Placeholder** auf `#1c2834` (CD-Wert) statt `#2f4356`.
- **Paginator**: Sprite-Chevrons in `currentColor`, Randfarbe `#2f4356`
  (im CD rendert der Filter genau dorthin); Abweichung C3 entsprechend
  aktualisiert.
- **Sortierpfeil** deutet sich wie im CD bei Hover/Fokus jeder sortierbaren
  Spalte an (Opacity-Stufen), voll auf der aktiven.
- **Brotkrume**: aktuelle Seite in Fliesstextfarbe (CD setzt keine eigene).
- **Kopfzeile**: die 0.6-s-Übergänge von Logo und Markenpolster beim
  Zusammenklappen ergänzt; unter md CD-Trennlinie unter der Markenzeile.
- **Icon-Knöpfe** rund (`border_radius-rounded`) wie die DS-Icon-Buttons.
- **Spinner-Fläche** auf die CD-Grösse 4em.
- **`ob-top-control`** (Zum-Seitenanfang-Reiter) ergänzt — er ist fester
  Bestandteil des CD-Master-Layouts und fehlte.
- **Fokus-Offset** app-weit auf `outline_offset-md` (3 px) — deckungsgleich
  mit den DS-Knöpfen und mit der bestehenden Doku.
- Dokumentations-Korrekturen in docs/OBLIQUE.md (§3 Seitengerüst ohne
  `.ob-viewport`, §5 C3/C11–C15).

## 4. Visuelle Ruhe — umgesetzt

- **Eine sichtbare Ladeanzeige**: Fortschrittstexte gehen nur noch an die
  Screenreader-Live-Region (`setStatus(…, leise)`); sichtbar dreht genau ein
  Spinner im Inhalt. Der Platzhalter startet leer und wird von `meldung()`
  bespielt — die dritte, statische Spinner-Kopie in index.html entfiel.
- **Trefferzahl einmal**: der Toolbar-Zähler ist nur noch Live-Region
  (unsichtbar); sichtbar zählen Kennzahlenzeile und Blätterbereich.
- **Brotkrume erst ab Tiefe 2** — die Ein-Element-Krume wiederholte nur die
  Überschrift.
- **Tabellenzellen ohne Pillen**: Reifegrad und Datentyp stehen als
  schlichter Text (Spaltenkopf beschriftet schon); `kbob-tag` bleibt
  Galerie und Detail vorbehalten. Katalogspalte in normaler Zeilenschrift.
- **Kürzere Texte**: Einleitungssatz der Übersicht auf einen Satz,
  Grafik-Bedienhinweis gestrafft, Sprachwahl-Tooltip auf den Kern,
  doppelter Export-Tooltip entfernt (JS ist die eine Quelle).
- **Keine Toolbar-Linie** — Regionen trennt Weissraum; Ansichts-Umschalter
  zeigt die Wahl als ruhige Selected-Fläche statt Primärfüllung + Fett.

## 5. Modularität — umgesetzt

- Sprachwahl = `ob-select ob-select-borderless` (eine Chevron-Quelle statt
  zwei identischer Base64-URIs).
- Facette = `kbob-field kbob-facet` (ein Feld-Gerippe), gemeinsame
  Beschriftungsklasse `kbob-field-label` (auch im Blätterbereich).
- Paginator-Icons aus dem Sprite (−8 Data-URI-Regeln).
- Icon-Grössen über Tokens (`--ob-h-button-icon-size`,
  `--ob-h-link-icon-size`) statt verstreuter px/em-Werte.
- Tote Haken entfernt: `.ob-icon-text`, `.ob-footer-version`,
  `--kopf`-Variable, `kbob-values-n`-Span, `kbob-facet-count`.

## 6. Mobile (unter md) — umgesetzt

- Kopf klebt nicht mehr (C11) — vorher belegte er dauerhaft ~25 % eines
  Telefon-Viewports; Markenzeile mit CD-Trennlinie.
- Werkzeugleiste als saubere Spalte: Suche, Facetten-Trigger und Menüs in
  voller Breite; Facetten-Menü im Fluss (Akkordeon) statt schwebend —
  kein Seitenscroll, kein Scrollbereich im Scrollbereich.
- Touch-Targets: der bereits verdrahtete Mobile-Token
  `--ob-h-button-touch_target-min_size` (48 px) greift jetzt wirklich.
- Tabelle: Mindestbreite 720 px im Scrollbereich, der Bereich ist
  fokussierbare, beschriftete Region (C12).
- Dialog: `max-height` + internes Scrollen, Aktionszeile bricht um,
  16-px-Polster und gedeckelte Textarea unter sm.
- Paginator ohne Erste/Letzte Seite; Fusszeilen-Links mit mehr Polster.
- Graph: ein zweiter Finger überschreibt den laufenden Zug nicht mehr.

## 7. Nutzerentscheide dieser Runde (ausserhalb des CD-Abgleichs)

Fusszeile einzeilig (C13); «Verbindung und Abfrage» im Kopf; Lupe links im
Suchfeld + Lösch-Knopf (C14); Filter-Icon und «Name (n)» auf den
Facetten-Triggern, Optionen ohne Zähler, ganze Zeile klickbar (C15);
CD-Design-Link in der Fusszeile; Excel-Export ohne Limit als
XLSX-Arbeitsmappe (drei Blätter, eine Gesamtabfrage).

## 8. Zurückgestellt (bewusst)

| Thema | Grund |
|---|---|
| `ob-table-collapse` (gestapelte Zeilen unter md, `data-title` je Zelle) | Grösserer Markup-Umbau in `K.zeichneListe`; horizontales Scrollen ist als C12 dokumentiert und zugänglich. |
| ~~Pinch-Zoom im Graphen~~ | Inzwischen umgesetzt (Graph-Runde, docs/GRAPH-REVIEW.md). |
| Icon-only-Kopfknöpfe unter md | Erst sinnvoll mit i18n-Umbau (Beschriftungen wandern ohnehin); Kopf ist ohne Sticky nicht mehr teuer. |
| Dialog-Letterspacing 0.5 px (Legacy `ob-body1`) | DS-Text-Layer gewinnt laut Rangordnung (§1 in OBLIQUE.md). |
| `vertical-align: top` der Zellen (CD: middle) | Bewusste App-Beigabe für mehrzeilige Zellen. |
| Statuszeile bei gescrollter Seite ausser Sicht | Beobachtung; ein auto-scrollender oder unten angehefteter Status wäre ein eigenes Muster. |


## 9. Spacing-Review (Abstände gegen die CD-Skala, 31.08.2026)

Eigener Prüflauf über gaps/margins/paddings in main.css gegen die
CD-Abstandsskala (Legacy `$ob-spacing-*`: 4/8/12/16/24/32/48; DS-Dimension-
Tokens: micro 1–3, element 4/6/8/10/12, spacing 16–32, density bis 64;
Typo-Kontext: h1 0/8, h2–h6 12/8, p 0/12). Kopf-, Fusszeilen-, Alert-,
Dialogflächen- und Tabellenwerte wurden Wert für Wert als CD-exakt
bestätigt; der vertikale Seitenrhythmus (16px-Takt zwischen Sektionen,
keine stapelnden Margins) hielt der Prüfung stand.

Umgesetzt:

| Befund | Fix |
|---|---|
| Dialog-Aktionszeile 24px unter dem Inhalt statt der 8px des CD (`_mat-dialog.scss`: kein margin) | `margin-top` entfernt |
| `.kbob-tag` mit 5px-Gap (auf keiner Skala) | Gap 4px (CD-Chip-Abstand); 1/7px-Polster als Randkompensation zu 2/8 kommentiert |
| Paginator-Navigationsknöpfe 4px auseinander (CD: 20px Separation; mobil sassen 48px-Ziele 4px auseinander) | Gap 8px |
| Listen 16px unter dem Absatz-Takt von 12px (DS `typography_context`/List-Token) | 12px |
| Dialog-Geschwister auf zwei Takten (Controls 16 / Tabs 12) | beide 16px |
| Zwei Sticky-Scroll-Offsets (Zeilen +16, H1 +8) | einheitlich +16px |
| `.kbob-phase` Höhe 18px (einziger Off-Skala-Wert der Mikro-Gruppe) | 20px |
| Chip-Familie mit 4/5/6/8-Gemisch | interne Gaps einheitlich 4px, Zeilen-Gap 8px |
| Facetten-Menü mit fünf Abstandswerten (2/4/6/8/10) | 4er-Raster: Optionen 8px 12px, Listen-Gap 4px |

Der P1 des Laufs («Overlay-/Panel-/Skip-Selektoren tot») war der halbfertige
Graph-Umbau im Prüfmoment; mit dessen Abschluss gegenstandslos.

---

## 10. Politur-, Konsistenz- und Benennungsrunde (01.09.2026)

Eigener Durchgang: Design-Review am laufenden Browser (Desktop 1440,
Tablet 834, Telefon 390; alle Ansichten, beide Dialoge, Export), Abgleich
der App-Bauteile gegen den echten Oblique-Quellcode und eine vollständige
Vereinheitlichung der Benennung.

### 10.1 Oblique-Komponenten übernommen, die die App nachgebaut hatte

Der Abgleich gegen `projects/oblique/src` förderte drei Bauteile zutage,
für die Oblique bereits eine Klasse führt:

| bisher | jetzt | Quelle |
|---|---|---|
| `kbob-search` / `kbob-search-clear` | `ob-text-control` / `ob-text-control-clear` (+ Zustandsklasse `ob-text-control-clear-has-value`) | `core/components/_text-control.scss`, `lib/input-clear` |
| `kbob-card-button` | `ob-button-card` | `material/_mat-card.scss` |
| `button.ob-top-control` | `div.ob-top-control > button.ob-top-control-btn` | `lib/scrolling/top-control.component` |

Der Nutzen ist nicht kosmetisch: sobald das Design System eigenes CSS für
diese Bauteile liefert (§7 in OBLIQUE.md), fällt es auf das bestehende
Markup, statt daneben zu liegen.

### 10.2 Benennung: `kbob-*` → `app-*`, Zustandsklassen ins CD-Vokabular

Begründung und vollständige Konvention: OBLIQUE.md §3, «Namenskonvention».
Kurz: ein Präfix ist nötig (eine globale Kaskade unter 2528 Token), aber es
muss die *Schicht* benennen, nicht das *Produkt* — und `app` ist Obliques
eigenes Anwendungspräfix (CLI `ng new`, `prefix.defaultValue = "app"`).
98 Klassen umbenannt, darunter der interne SVG-Namensraum `g-*` →
`app-graph-*`. Neun nackte globale Zustandsklassen (`.an`, `.aus`, `.on`,
`.klick`, `.aktiv`, `.rund`, `.eintrag`, `.dragging`, `.error`) sind zu
`ob-active` beziehungsweise `app-is-*`/`app-*-*` geworden.

### 10.3 Befunde aus dem visuellen Durchgang — umgesetzt

| Befund | Fix |
|---|---|
| **Werkzeugleiste auf drei Höhen**: Suchfeld und Facetten-Trigger 40 px, Ansichts-Umschalter 30 px — in einer Zeile sichtbar versetzt | Umschalter auf 40 px |
| **Suchfeld schnitt seinen eigenen Platzhalter ab** («Objekttyp oder Beschrei…») bei 341 px ungenutztem Raum rechts daneben | `flex: 1 1 240px`, `max-width: 420px` |
| **Facetten-Menü gruppierte falsch**: bei mehrzeiligen Katalognamen (24 px Zeilenabstand) standen die Optionen nur 20 px auseinander, das Kästchen sass mittig zwischen zwei Zeilen | Kästchen an der ersten Zeile (`align-items: flex-start`, `margin-top: 2px`), Zeilenabstand 1.3, Options-Gap 8 px |
| **Galerie**: die Reifegrad-Marke folgte der unterschiedlich langen Beschreibung und stand je Karte auf anderer Höhe | `margin-top: auto` auf `.app-tags` — die Marken einer Kartenzeile stehen auf einer Linie |
| **Graph-Panel verdeckte die Legende** (Panel `right: 0; bottom: 0`, Legende in voller Breite darunter) | `:has()`-Einzug der Legende um die Panelbreite |
| **`Pset_ManufacturerTypeInformation` brach mitten im Wort** in der Property-Set-Spalte | `K.breakable()` setzt ein `<wbr>` hinter jeden Unterstrich — sichtbar identisch, kopiert unverändert |
| **Kopfzeile belegte unter md drei Vollbreiten-Zeilen** (~110 px auf 390 px) | Ikone statt Wort in der Service-Navigation; der Name bleibt als `aria-label` und Tooltip |
| **Excel-Export ohne Rückmeldung am Knopf** (nur Statuszeile) | CD-Spinnerbogen im Knopf, gesteuert über `aria-busy`; der Bogen deckt auch den synchronen XLSX-Bau ab (`setTimeout 0`, damit der Browser ihn vor der Arbeit zeichnet) |
| **Fehlermeldung «Die Antwort ist kein SPARQL-Ergebnis» hart deutsch** — erschien auch in der französischen Oberfläche | i18n-Schlüssel `errors.notSparql`, vier Sprachen |

### 10.4 Ansichts-Umschalter: Ikone je Wahl, Wort auf der aktiven

`list` / `grid` / `share` aus dem Oblique-Sprite. Der zugängliche Name
bleibt auf allen drei vollständig (`aria-label` = das sichtbare Wort, WCAG
2.5.3 «Label in Name» erfüllt, weil sichtbarer Text und Name identisch
sind, wo beide da sind). Der Umschalter schrumpft von 214 px auf 184 px und
belegt unter md keine eigene Vollbreiten-Zeile mehr.

### 10.5 Codesprache: durchgehend Englisch

Bezeichner, Kommentare, HTML-IDs, CSS-Klassen und **die Kommentare der
SPARQL-Beispielabfragen** (im Dialog «Verbindung und Abfrage» für alle vier
Sprachgruppen sichtbar) sind Englisch. Die *Oberflächen*texte bleiben
mehrsprachig in `data/i18n.json`; die deutschsprachige Projektdokumentation
unter `docs/` bleibt Deutsch. Ein Test bewacht die Abfrage-Kommentare
(`overviewQuery: comments are English`).

Beim Umbau gefundene und behobene Fehler: drei ID-Kollisionen mit dem
injizierten Icon-Sprite (`search`, `fullscreen`, `accessibility` sind auch
Icon-Namen — die Knöpfe heissen jetzt `search-input`, `graph-fullscreen`,
`accessibility-statement`).

### 10.6 Fusszeile

`Rechtliches` ergänzt (i18n-Schlüssel `footer.legal`, URL je Sprache als
`footer.legalUrl` über das neue `data-i18n-href`). Die deutsche URL ist
gesetzt; **die Pfade für fr/it/en sind von der Betreiberin zu bestätigen**
und stehen einstweilen auf der deutschen Seite. Die Erklärung zur
Barrierefreiheit bleibt als Dialog und verweist neu auf «Barrierefreiheit
in der Bundesverwaltung» (BBL), wie es die Oblique-Vorlage vorsieht.

### 10.7 Beobachtung, nicht umgesetzt

Die Brotkrume steht auf der Übersicht mit einem einzigen, nicht
verlinkten Element («Objekttypen») unmittelbar über der gleichlautenden
H1 — eine Krume mit einem Element trägt keine Information. Der Code hält
das ausdrücklich als redaktionellen Entscheid fest («stabiler Ankerpunkt»);
darum als Beobachtung notiert statt still geändert.
