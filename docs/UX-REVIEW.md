# UX- und CD-Review — Konsistenz, Lesbarkeit, Mobile (02.09.2026)

Gegenstand: Design-Review der laufenden Anwendung aus der Sicht einer
Senior-Design/UX-Rolle, gegen den echten Oblique-Quellcode (lokaler
Checkout `oblique-bit/oblique`, Version 15.4.4: `projects/design-system`
für Tokens/Text-Layer, `projects/oblique/src` für Master-Layout, Tabelle,
Chips, Paginator, Dialog, Tabs, Karten, Text-Control, External Link).
Ziele laut Auftrag: Konsistenz, CD-Treue, Mobile, Lesbarkeit,
Bedienbarkeit, Barrierefreiheit — weniger Dekoration, mehr Klarheit.

Methode: gerenderte Bildschirmfotos aller Ansichten (Übersicht Liste/
Galerie/Graph, Objekttyp Liste/Graph/Panel, Merkmal, beide Dialoge,
Facettenmenü, Chips, Skip-Link, Fokus) bei 1440, 834 und 390 px;
berechnete Stile (Schriftgrössen, Gewichte, Farben, Masse) je Bauteil;
WCAG-Kontrastrechnung über alle verwendeten Farbpaare; Vergleich Wert
für Wert mit den Oblique-SCSS-Dateien. Frühere Runden (docs/CD-REVIEW.md,
docs/MOBILE-REVIEW.md, docs/GRAPH-REVIEW.md) galten als Ausgangslage —
dort dokumentierte Entscheide wurden nur dann angefasst, wenn der
Befund dieser Runde sie überwiegt (Abschnitt 5).

## 1. Gesamtbild

Die Anwendung ist auf der Wertebene sauber: Tokens, Knöpfe, Tabelle,
Chips, Alerts, Karten, Fusszeile, Kopfzeile und Dialoge stimmen mit den
Oblique-Quellen überein, die Typoskala ist geschlossen (12 · 12.8 · 14 ·
16 · 17 · 23 · 28 px), der Seitenrhythmus hält den 16-px-Takt, Fokus und
Skip-Link entsprechen dem CD. Die Befunde dieser Runde liegen darum nicht
in einzelnen Werten, sondern in **vier Mustern**:

1. **Der Interaktionsblauton des Design Systems verfehlt WCAG AA** auf
   Weiss und auf der Zebra-Zeile — und genau dieser Ton trägt in dieser
   App die häufigsten Bedienelemente (Zeilen-Links, Brotkrume, Facetten,
   Kopfknöpfe).
2. **Doppelte Wege und doppelte Zeichen**: Brotkrume mit einem Element
   über der gleichlautenden H1; ein zweiter «Zurück»-Knopf neben der
   Brotkrume; drei identische Filter-Ikonen in einer Zeile; Tag-Rahmen um
   einzelne Wörter im Merkmal-Detail; vier angedeutete Sortierpfeile in
   einem Tabellenkopf.
3. **Ein Feld sieht aus wie ein Knopf**: die Facetten-Trigger trugen die
   Sekundärknopf-Optik (blaue Schrift, blauer Rand) neben einem Suchfeld
   mit dunklem Rand — zwei Vokabulare in einer Zeile für Elemente, die
   beide Eingaben sind.
4. **Mobile Werkzeugleiste**: fünf Vollbreiten-Zeilen (Suche, drei
   Facetten, Ansichts-Umschalter) schoben die erste Tabellenzeile auf
   einem 390×844-Telefon auf y≈700 px.

Alles Genannte ist umgesetzt (Abschnitt 3). Die Kopfzeile inklusive Logo
ist CD-exakt (Abschnitt 2.6).

## 2. Befunde nach Thema

### 2.1 Kontrast

Gemessen (relative Luminanz nach WCAG 2.x, Grund Weiss `#ffffff`, Zebra
`#f0f4f7`, Hover-Zeile `#dfe4e9`):

| Farbe | Verwendung | Weiss | Zebra | Hover-Zeile |
|---|---|---|---|---|
| `#2e8fbf` (DS `interaction-state-fg-enabled`) | Links, Zeilen-Links, Brotkrume, Sekundär-/Tertiärknöpfe, Facetten **(vorher)** | **3.62** | **3.28** | **2.83** |
| `#2379a4` (DS Primärknopf-Fläche) | zum Vergleich als Text | 4.84 | 4.37 | 3.78 |
| `#236487` (DS `interaction-state-fg-hover`) | **jetzt Standard** für dieselben Elemente | 6.47 | 5.9 | 5.1 |
| `#255069` (DS `bg-pressed`, flipped) | jetzt Hover/Pressed | 8.5 | — | — |
| `#2f4356` | Kennzahlen, Blätterbereich, Legende | 10.2 | | |
| Weiss auf `#2379a4` | Primärknopf | 4.84 | | |
| Weiss auf `#2f4356` / `#263645` | Chip / Fusszeile | 10.2 / 12.4 | | |
| `rgba(19,27,34,.4)` | Leer-Strich «—», disabled | 2.5 (Platzhalter/disabled, kein Fliesstext) | | |

Der DS-Standardton verfehlt AA (4.5:1) in allen drei Kontexten; bei
16-px-Normalschrift greift keine Grosstext-Ausnahme. Umsetzung: ein
dokumentierter Token-Override in `main.css` (Abweichung **B3** in
docs/OBLIQUE.md) hebt `fg-enabled/-focus/-selected` auf den DS-Hover-Ton
und lässt Hover/Pressed auf den DS-Pressed-Ton wechseln — beides Tokens
derselben Interaktionsfamilie, der Primärknopf bleibt unverändert. Der
Block ist so gebaut, dass er beim nächsten DS-Stand entfällt, sobald das
Design System eine AA-konforme Linkfarbe liefert. Empfehlung an die
Betreiberin: den Befund an das Oblique-Team melden (Token
`--ob-s3-color-interaction-state-fg-enabled-inversity_normal`).

### 2.2 Informationshierarchie und visuelle Ruhe

| Befund | Beleg | Umsetzung |
|---|---|---|
| Brotkrume mit **einem** Element («Objekttypen») unmittelbar über der gleichlautenden H1 — trägt keine Information (CD-REVIEW §10.7 hatte es als Beobachtung notiert) | Übersicht, alle Breiten | Brotkrume erscheint ab Tiefe 2 |
| **Zweiter Rückweg**: Tertiärknopf «← Zurück» oben rechts (Desktop) bzw. als eigene Zeile zwischen Brotkrume und Titel (Mobile) — dieselbe Zielseite wie die Brotkrume, die direkt darüber steht; Oblique kennt im Master-Layout nur die Brotkrume | Objekttyp/Merkmal | Knopf entfernt; die Brotkrume (mit vergrösserter Trefferfläche auf Touch) ist der eine Rückweg; der Browser-Zurück-Knopf funktioniert über den URL-Zustand ohnehin |
| **Drei identische Filter-Ikonen** in der Werkzeugleiste sagten nichts, was die Beschriftungen nicht sagten | Toolbar | Ikonen entfernt; das Chevron bleibt als Auf-/Zuklapp-Zeichen (mat-select-Muster) |
| **Tag-Rahmen um einzelne Wörter** im Merkmal-Detail («Candidate», «Text») — in der Tabelle waren die Rahmen in der letzten Runde bereits entfernt worden; im Detail steht die Beschriftung fett darüber, der Rahmen ist reines Framing | Merkmal | schlichter Text; Tags bleiben der Galerie vorbehalten, wo mehrere Werte in einer Zeile stehen |
| **Vier angedeutete Sortierpfeile** (Opacity 0.55) auf Touch-Layouts — alle zeigen nach oben, der eine aktive unterscheidet sich nur durch volle Deckung | Tablet 834, Telefon | Pfeil nur auf der aktiven Spalte, wie mat-sort; Sortierbarkeit bleibt über den Kopf-Knopf entdeckbar |

### 2.3 Werkzeugleiste: Feld statt Knopf

Die Facetten sind Mehrfach-Auswahlfelder — semantisch die Rolle von
`mat-select` (Oblique: Feldrand, dunkle Schrift, Chevron rechts, 2-px-Rand
bei Hover/Fokus). Sie trugen aber `ob-button-secondary` (blaue Schrift,
blauer Rand, Knopf-Radius 1 px) neben einem Suchfeld mit dunklem 1-px-Rand
und Radius 4 px. Jetzt: `.app-facet-toggle` ist ein eigenes App-Bauteil in
der Optik von `select.ob-select` (Höhe 40, Rand `fg-contrast_high`, Radius
`border_radius-lg`, Chevron 19 px aus dem Sprite, 2-px-Rand bei Hover/Fokus
und im geöffneten Zustand). Die Zeile liest sich als **eine Reihe von
Feldern**; der Ansichts-Umschalter rechts bleibt als einzige Knopfgruppe
klar davon abgesetzt. Nebeneffekt: der Kontrastbefund 2.1 betrifft die
Facetten nicht mehr.

Das Suchfeld erhält `flex-basis`/`min-width` 300 px (statt 240): ohne die
Ikonen passten auf 834 px alle drei Facetten neben die Suche, die ihren
Platzhalter dann abschnitt («Objekttyp oder Beschre…»); mit 300 px
brechen die Facetten um und das Feld bleibt lesbar.

### 2.4 Mobile (unter sm, 600 px)

Vorher: Suche, drei Facetten-Felder, Umschalter = fünf Vollbreiten-Zeilen
(~330 px) plus «Zurück»-Zeile und Ein-Element-Brotkrume. Jetzt:

- **«Filter»-Knopf** (Sprite-Ikone `filter` + Wort + Zahl der aktiven
  Facetten dieser Ebene, `aria-expanded`/`aria-controls`) klappt die
  Facetten-Felder ein und aus; er teilt sich die Zeile mit dem
  Ansichts-Umschalter. Die Werkzeugleiste hat **zwei Zeilen** statt fünf;
  die erste Tabellenzeile liegt auf dem 390×844-Telefon bei y≈500 statt
  ≈700 px. Aktive Werte bleiben ohnehin als Chips sichtbar. Ab sm sind die
  Felder wie bisher immer ausgeklappt (der Knopf ist dort nicht im Baum
  sichtbar); auf Ebenen ohne anwendbare Facette ist er ausgeblendet.
- **Eine Zeilenhöhe** auf Touch: Facetten-Felder und Ansichts-Umschalter
  wachsen beide auf das Touch-Target (48 px) — vorher standen 48-px-Felder
  neben einem 40-px-Umschalter.
- **Dialog «Verbindung und Abfrage»**: die drei Abfrage-Tabs brachen auf
  390 px in drei gestapelte Zeilen um, der rote Aktivbalken las sich nicht
  mehr als Tab. Jetzt eine Zeile, die seitlich scrollt (wie der
  mat-tab-Header).
- **Erklärung zur Barrierefreiheit**: der mehrzeilige externe Link brach
  innerhalb seiner eigenen Flex-Box um und liess Ikone und Satzpunkt allein
  auf einer Zeile stehen. `.ob-external-link` ist jetzt `inline` (Oblique:
  `inline-flex`, dort nur für kurze Linktexte) — Ikone und Punkt folgen dem
  Text.

### 2.5 Typografie und Lesbarkeit — bestätigt

Gemessen: H1 28/36 px 700 in `fg-contrast_low` (DS-Token), H2 23 px,
Kartentitel 17 px, Fliesstext 16 px, Tabelle 16 px (Oblique
`$ob-font-size-normal` = 1em), Kennzahlen/Blättern/Legende 14 px, Tags und
Tooltip 12 px, Brotkrume 12.8 px (`$ob-font-size-smallest`). Keine halben
Pixel, keine Rolle mit zwei Grössen. Lesemasse: Beschreibung ≤ 62 ch,
Detail ≤ 78 ch, Einleitung ≤ 68 ch. Tabellenzellen `vertical-align: top`
für mehrzeilige Zellen (bewusste App-Beigabe, CD-REVIEW §8).

Beobachtung ohne Änderung: das DS setzt `p` auf Gewicht **500**
(`body-normal-font_weight: medium`), Tabellen, Karten und Definitionslisten
laufen mit 400. Der Einleitungssatz wirkt dadurch eine Spur schwerer als
die Tabelle darunter. Das ist DS-Verhalten (der DS-Reset setzt `body` nicht
auf 500) und bleibt verbatim; sollte das stören, wäre `p { font-weight:
400 }` als App-Abweichung der kleinste Eingriff.

### 2.6 Kopfzeile und Logo — CD-exakt (Nachfrage)

Gegen `master-layout-header.component.scss` und `core/_variables.scss`
geprüft, im Browser gemessen:

| Element | CD (Oblique 15.4.4) | App gemessen |
|---|---|---|
| Logo-Datei | `projects/oblique/src/assets/images/logo.svg` | byte-identisch (md5 `4fbe416b…`), intrinsisch 156 × 38.35 px |
| Logo expanded (≥ 905 px) | `$ob-logo-width` 218 × `$ob-logo-height` 53 px | 218 × 53 px |
| Logo collapsed (< 905 px) | `$ob-logo-width-collapsed` 30 × `$ob-logo-height-collapsed` 34 px, `overflow: hidden` (nur das Kreuz bleibt sichtbar) | 30 × 34 px, Kreuz |
| Markenpolster | 8 px 16 px collapsed / 16 px expanded, Übergang 0.6 s | identisch |
| App-Titel | `$ob-font-size-xl` = 1.65 rem, Zeilenhöhe 34 px, Gewicht 300, linker 1-px-Trenner | 26.4 px / 34 px / 300 |
| Kopfhöhe expanded | 53 + 2 × 16 = 85 px | 85 px |
| Trennlinie unter dem Kopf (`ob-no-navigation`) | 1 px `$ob-gray-lighter` | identisch |

Zwei Hinweise, keine Abweichungen: (1) Das CD skaliert das 156 × 38.35-px-SVG
per festem `width`/`height` auf 218 × 53 — das ist eine Streckung um rund
1 % in der Breite; sie steckt im CD selbst (`img { width; height }`) und
ist unsichtbar. (2) Die HTML-Attribute `width="156" height="38"` sind die
intrinsische Grösse und reservieren den Platz vor dem CSS; das CSS setzt
die CD-Masse. Beides bleibt.

### 2.7 Komponententreue — bestätigt

Kopfzeile, Service-Navigation (Custom-Controls vor der Sprache), Skip-Link
(oranges Band, Accessibility-Ikone), Tabelle (Zebra `#f0f4f7`, Hover
`#dfe4e9`, 1-px-Zeilenlinie `#acb4bd`, 2-px-Kopf, Versalien normalgewichtig,
8-px-Zellen), Chips (`#2f4356`, weiss, Radius 16), Karten (Rand
`secondary-100`, `shadow-lg`, Hover `shadow-xl` + Fläche), Paginator
(36-px-Knöpfe, `secondary-600`), Dialog (Radius 4, Polster 24, Titel
23/28/700), Tabs (roter 2-px-Balken `$ob-red-600`-Familie), Tooltip,
Fusszeile (`secondary-700`, weisse Links, Hover `gray-lighter`),
Fokusring (3 px `#8b5cf6`, Offset 3) — Wert für Wert unverändert richtig.

## 3. Umgesetzte Änderungen

| Datei | Änderung |
|---|---|
| `css/main.css` | Abschnitt 2b: Token-Override B3 (Kontrast). `.app-facet-toggle` als Feld (Select-Optik, Chevron 19 px, 2-px-Rand offen/hover/fokus). `.app-facets-toggle` + Mobile-Regeln (Facetten einklappbar unter sm, `order`). Touch: Facetten und Umschalter 48 px. Suchfeld `flex-basis`/`min-width` 300 px. `.ob-external-link` inline. `.app-tabs` einzeilig, scrollbar. Sortierpfeil-Andeutung auf Touch entfernt. `.app-page-back` entfernt (auch aus Print). |
| `index.html` | «Zurück»-Knopf entfernt; «Filter»-Knopf (`#facets-toggle`) in `.app-toolbar-end`. |
| `js/app.js` | Brotkrume ab Tiefe 2; `updateFacetsToggle()` (Beschriftung «Filter (n)», `aria-label`, ausgeblendet ohne anwendbare Facette); Facetten-Trigger ohne Ikone und mit eigener Klasse; Merkmal-Detail: Reifegrad und Datentyp als Text (`statusTag`/`typeTag` entfernt); Klick-Handler für den «Filter»-Knopf; `el.back` entfernt. |
| `data/i18n.json` | `facets.toggle` (de/fr/it/en) ergänzt; `common.back`, `common.backTo` entfernt (unbenutzt). |
| `docs/OBLIQUE.md` | Abweichungen B3, C15 (aktualisiert), C17, C18 ergänzt. |

Verifikation: `node --test test/helpers.test.js` — 15/15 grün (Hinweis:
`node --test test/` mit Schrägstrich am Ende findet unter Node 24/Windows
keine Datei; `node --test test` oder der Dateipfad funktionieren).
Bildschirmfotos nachher bei 1440, 834 und 390 px: Übersicht, Filterzustand,
Facette offen (Maus und Tastatur), Objekttyp, Merkmal, beide Dialoge,
Mobile «Filter» zu/offen/aktiv.

## 4. Beobachtungen, bewusst nicht umgesetzt

| Thema | Grund |
|---|---|
| Einleitungssatz der Übersicht kostet auf 390 px vier Zeilen | Er ist der eine Ort, an dem die Regel («jeder Objekttyp führt die Merkmale des Katalogs …») einmal gelesen wird (DESIGN.md E7c). Ausblenden unter sm wäre ein Bruch mit dem Desktop; kürzen ist Redaktion, nicht Design. |
| Platzhalter im Suchfeld in Textfarbe `#1c2834` (CD-Wert) — ein leeres Feld sieht wie ein gefülltes aus | CD-Wert aus `_mat-form-field.scss`; die Lupe links und der fehlende Lösch-Knopf unterscheiden es. Als Beobachtung notiert. |
| `p` mit Gewicht 500 (DS) neben Tabellen mit 400 | DS-Verhalten, verbatim (2.5). |
| Netzgraph der Übersicht: Beschriftungen 12 px im Nutzerkoordinatensystem werden beim Start skaliert und sind klein | docs/GRAPH-REVIEW.md; Zoom, Tastatur und Textfassung sind vorhanden. |
| `ob-table-collapse` (gestapelte Zeilen unter md) | Weiterhin C12 (horizontale Scrollregion); grösserer Umbau. |
| Galerie-Zähler («28») als Tag-Rahmen oben rechts | Dort steht er neben dem Titel ohne Beschriftung — der Rahmen ist die Beschriftung. Bleibt. |
| «Auswahl aufheben» im Facettenmenü als disabled-Tertiärknopf (2.5:1) | Disabled ist von 1.4.3 ausgenommen; er wird aktiv, sobald etwas gewählt ist. |

## 5. Frühere Entscheide, die diese Runde zurücknimmt

| Entscheid | Quelle | Warum zurückgenommen |
|---|---|---|
| Brotkrume auch auf der Übersicht («stabiler Ankerpunkt») | app.js-Kommentar, CD-REVIEW §10.7 | Ein Element ohne Link über der gleichen H1 ist Wiederholung, kein Anker; ab Tiefe 2 ist der Anker da. |
| «Zurück»-Knopf als «sichtbarer Weg eine Ebene hoch — die Brotkrume ist klein» | app.js-Kommentar | Zwei Bedienelemente mit demselben Ziel direkt untereinander; die Brotkrume hat auf Touch bereits die vergrösserte Trefferfläche, das CD kennt keinen zweiten Rückweg. |
| Filter-Ikone auf jedem Facetten-Trigger | OBLIQUE.md C15 | Dreimal dieselbe Ikone; der Feld-Look mit Chevron (mat-select) sagt «auswählen» klarer. Der Rest von C15 («Name (n)» im Trigger, Wahl als Selected-Fläche) bleibt. |
| Sortierpfeil auf Touch immer angedeutet | MOBILE-REVIEW §1 | Vier gleiche Pfeile verdecken den einen aktiven; mat-sort zeigt ihn nur aktiv/hover. |

## 6. Nachtrag: Seite «Anleitung», Hauptnavigation, Facettenmenü (02.09.2026)

### 6.1 Hauptnavigation (Oblique-Sub-Header)

Der Katalog bleibt Einstiegsseite; darunter erhält die Anwendung die
Oblique-Hauptnavigation (`master-layout-navigation.component`): eine
weisse Zeile unter der Kopfzeile, oben und unten mit 1-px-Linie, Einträge
als schlichter Text mit 3-px-Unterkante, die auf dem aktiven Eintrag und
bei Hover Akzentrot (`$ob-accent`) wird; Hover `secondary-50`, aktiv
`secondary-100`; `aria-current="page"` auf dem aktiven Eintrag. Zwei
Einträge: **Katalog** und **Anleitung**. Unter md zeigt Oblique die
Navigation hinter dem Burger; mit zwei Einträgen bleibt die Zeile sichtbar
(Abweichung C19, docs/OBLIQUE.md). Der Fokusring ist die app-weite Outline
(innen gezeichnet), nicht Obliques Inset-Box-Shadow (B2).

### 6.2 Seite «Anleitung»

Eigene Adresse `#anleitung` (plus `l=` für die Sprache); die Seite braucht
den Katalog nicht und erscheint auch, während er noch lädt oder wenn das
Laden scheitert — die Fehlerkachel wartet dann hinter ihr. Aufbau: derselbe
Seitenkopf wie jede Ebene (H1 «Anleitung», Kennzahlenzeile als Untertitel),
ein Inhaltsverzeichnis mit Ankern (`#guide-…`, die Adresse bleibt auf der
Seite), dann acht Abschnitte in der Lesebreite der Detailseiten (78 ch):

1. Was ist das KBOB Data Dictionary? (KBOB seit 1968, BBL-Vorsitz;
   Objekttyp/Merkmal/Property Set/IFC; Normen ISO 23386/23387/12006, DCAT;
   Arbeitsmappen → Validierung → RDF)
2. Was ist ein Data Dictionary? (Definition aus dem Nationalen Glossar von
   Bauen digital Schweiz/buildingSMART Switzerland; Handlungsempfehlung
   «Data Dictionaries», Kick-off 15.09.2026; SN EN ISO 23386:2020 und die
   Nachbarnormen; bSDD als internationaler Dienst)
3. Begriffe in dieser Anwendung (Objekttyp, Katalog, Merkmal — Glossar-
   Terminologie, Property Set, Datentyp, Einheit/zulässige Werte, Reifegrad,
   LOIN-Meilenstein, IRI)
4. Was sind LINDAS und I14Y? (Linked Data Services des Bundesarchivs, RDF,
   SPARQL, Integrationsumgebung, benannter Graph; I14Y als
   Interoperabilitätsplattform des BFS)
5. Wie ist das Datenmodell aufgebaut? (NatDD core 0.1.0: Data Dictionary →
   Klasse → Datenvorlage → Merkmal-Anforderung → Merkmal; Link auf
   docs/DATAMODEL.md)
6. Wie benutze ich die Anwendung? (Suche/Facetten, Ansichten, Ebenen,
   Graph mit Tastatur, Sprache, Export, Verbindung und Abfrage)
7. Was die Daten nicht sagen (keine Pflichtstufe, LOIN nur im iDSK-Pilot,
   nichts verabschiedet, Sprachlücken, Integrationsumgebung)
8. Quellen und Links (KBOB, drei KBOB-Repositorien, I14Y, LINDAS, Glossar,
   Kick-off, bSDD, ISO 23386, dieses Repositorium — als schlichte Textlinks
   ohne Ikone, Entscheid der Betreiberin)

Quellen der Aussagen: kbob.admin.ch/ueber-uns, README der drei
KBOB-Repositorien, lindas.admin.ch/ecosystem/about-LINDAS, Nationales
Glossar (bauen-digital.ch/publikationen/glossar), Ankündigung des Kick-offs
(bauen-digital.ch/event/…), ISO 23386:2020 (iso.org/standard/75401.html),
buildingSMART Technical (Underlying ISO standards, Data structure of bSDD),
docs/DATAMODEL.md. Die bSDD-Seite selbst lieferte beim Abruf 403; die
Aussagen dazu stützen sich auf die technische Dokumentation von
buildingSMART. Der Text liegt vorerst nur auf Deutsch vor (`lang="de"`,
Hinweis in den anderen drei Oberflächensprachen; in der Erklärung zur
Barrierefreiheit nachgeführt).

Umsetzung: `index.html` (Navigationszeile, `#view-guide`), `js/app.js`
(`st.guide`, `#anleitung`/`#guide-…` in `readUrl`/`writeUrl`, `showGuide`,
`updateMainNav`, Rendern vor dem Katalog-Laden, Ladezustand und Fehlerkachel
weichen der Seite), `css/main.css` (`.ob-master-layout-navigation`,
`.ob-main-nav`, `.app-guide`), `data/i18n.json` (`a11y.mainNav`,
`nav.catalog`, `nav.guide`, `guide.title`, `guide.meta`, `guide.langNote`).

### 6.3 Facettenmenü mit langen Beschriftungen

Befund (Nutzerrückmeldung mit Bildschirmfoto): Katalognamen wie «RTE 26201
BIM-Datenvorlage Beleuchtung Bahninfrastruktur» brachen im 300-px-Menü in
drei Zeilen; mit 8 px Abstand zwischen den Optionen und 1.3 Zeilenhöhe
innerhalb einer Option lagen zwei Einträge enger beieinander als die Zeilen
eines Eintrags — die Liste las sich als sieben statt fünf Einträge.
Umsetzung: Menü 380–600 px breit (auf Telefonen weiterhin volle Breite im
Fluss), ein gleichmässiger Takt (Optionen 10 px Polster oben/unten,
2 px Abstand, Zeilenhöhe 1.375) — zwischen zwei Einträgen liegen so immer
20 px, innerhalb eines umbrochenen Namens 6 px Durchschuss; die Namen
brechen nur noch ein Mal um.
