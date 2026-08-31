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
| Pinch-Zoom im Graphen | Zwei-Pointer-Geometrie; +/−-Knöpfe sind auf Touch erreichbar (48 px). |
| Icon-only-Kopfknöpfe unter md | Erst sinnvoll mit i18n-Umbau (Beschriftungen wandern ohnehin); Kopf ist ohne Sticky nicht mehr teuer. |
| Dialog-Letterspacing 0.5 px (Legacy `ob-body1`) | DS-Text-Layer gewinnt laut Rangordnung (§1 in OBLIQUE.md). |
| `vertical-align: top` der Zellen (CD: middle) | Bewusste App-Beigabe für mehrzeilige Zellen. |
| Statuszeile bei gescrollter Seite ausser Sicht | Beobachtung; ein auto-scrollender oder unten angehefteter Status wäre ein eigenes Muster. |
