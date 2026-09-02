# Spacing- und Layout-Review — Abstände, Polster, Seitenaufbau, Tokens (02.09.2026)

Gegenstand: dedizierter Durchgang über Abstände, Ränder, Polster und den
CSS-Seitenaufbau der Anwendung, gegen den Oblique-Quellcode (15.4.4:
`core/_variables.scss` für die Legacy-Skala `$ob-spacing-*`, die
Komponenten-SCSS für Kopf, Navigation, Fusszeile, Tabelle, Karte, Dialog,
Paginator, Top-Control; `design-system/…/tokens.css` für die
DS-Dimension-Tokens). Ziel: ausgewogene, gut lesbare Layouts — und keine
hartkodierten Werte, wo ein Token existiert.

Methode: Geometrie aller Regionen im Browser gemessen (Position, Höhe,
Margin, Padding, Gap, Schrift, Zeilenhöhe) auf 1440 und 390 px für
Übersicht, Facettenmenü, Filterzeile, Galerie, Objekttyp, Merkmal,
Anleitung und Dialog — vor und nach dem Umbau; Inventar aller Literale in
`main.css` (234 Zeilen mit px/rem/Farbe ausserhalb von Kommentaren und
Data-URIs); Vergleich Wert für Wert mit den Oblique-Quellen.

## 1. Ergebnis in einem Satz

Der vertikale Rhythmus der Seite steht (4/8/12/16/24/32-Takt ohne
stapelnde Margins; Tabellen-, Karten-, Dialog- und Fusszeilenmasse
CD-exakt); die Arbeit dieser Runde lag bei **drei Rhythmusfehlern**, dem
**Zum-Seitenanfang-Knopf** (Nutzerhinweis) und der **Token-Bindung**: alle
Abstände, Kontrollhöhen, Schriftgrössen, -gewichte, Zeilenhöhen,
Rahmenbreiten und Schatten laufen jetzt über Tokens; was literal bleibt,
ist benannt und begründet (Abschnitt 5).

## 2. Seitenrhythmus — gemessen (1440 px, Übersicht)

| Region | Abstand zur nächsten | Quelle |
|---|---|---|
| Kopfzeile 85 px (Logo 53 + 2×16) → Navigationszeile 53 px (12/16-Polster, 3-px-Unterkante, 1-px-Linien) | 0 | master-layout-header, master-layout-navigation |
| Navigationslinie → H1 | 16 (Inhaltspolster `$ob-spacing-default`; seitlich 24 im expanded-Layout) | master-layout `.ob-main-layout` |
| H1 (28/36) → Kennzahlen (14/24) | 8 (`h1-spacing-bottom` = typography_context-xs) | DS-Text-Layer |
| Kennzahlen → Einleitungssatz | 12 | App (`p-bottom`-Takt) |
| Einleitung → Werkzeugleiste | 16 | App |
| Werkzeugleiste (40 px: Suche, Facetten-Felder, Umschalter) → Filterzeile → Tabelle | 16 / 16 | App |
| Tabellenkopf 40 px, Zellen 8 px Polster, 1-px-Zeilenlinie, 2-px-Kopflinie | — | core/_table.scss |
| Tabelle → Blätterzeile | 16 + 8 Polster über der Linie | App |
| Blätterzeile → Fusszeile 40 px (8/24-Polster) | 16 | master-layout-footer |

Unter md: Inhaltspolster 16 rundum, Kopf 50 + Service-Navigation 68 +
Navigationszeile 52, Fusszeile 24-Polster gestapelt — alles CD.
Galerie: Karten 16 Polster, 8 Gap innen, 16 Raster; Merkmal-Detail:
H2 32 über / 8 unter, Begriffspaare im 12er-Takt; Anleitung derselbe
Takt (H3 16/4, p 12); Dialog: 24 Polster, Titel 8 unter, Inhalt 8 vor den
Aktionen, Aktionen 16 Gap (mobil 12 über den DS-Token).

## 3. Befunde und Umsetzung

| Befund | Messung | Umsetzung |
|---|---|---|
| **Zum-Seitenanfang-Knopf** wich vom CD ab: dunkles 40-px-Quadrat 16 px über dem unteren Rand — am Seitenende **über der Fusszeile** und deren Text (Nutzerhinweis mit Bildschirmfoto). CD (`scrolling/top-control.component.scss`): hellgrauer Reiter (`$ob-gray-lighter`), 200 px breit, an den rechten Rand gedockt (`right: -150px`, 50 px sichtbar), Polster 8/14, linke Ecken 4 px, Deckung 0.85, **`bottom: 10 %`** im expanded-Layout (15 px darunter), Chevron 1.25 rem plus Wort «Zum Seitenanfang», das bei Hover/Fokus einfährt (`right: 0`, Drop-Shadow), Sichtbarkeit über `.ob-master-layout-scrolling`, `visibility: hidden` statt `hidden` (nicht per Tab erreichbar, weiche Einblendung 0.6 s) | Knopf y=860–900 bei Fusszeile y=860 | CD-Werte 1:1 übernommen; `app.js` setzt die CD-Zustandsklasse auf `<body>`; das Wort ist sichtbarer Text (i18n `a11y.toTop`), kein `aria-label` mehr; auf Touch mindestens 48 px hoch; `prefers-reduced-motion` ohne Übergang. Desktop: Reiter bei 10 % (y≈770), Fusszeile frei. Mobil (CD: 15 px) liegt der Reiter am rechten Rand über der 272 px hohen gestapelten Fusszeile — deren Links stehen links, nichts wird verdeckt. |
| **Dialog «Verbindung und Abfrage»**: 6 px zwischen Textarea und Aktionszeile — die Textarea ist `inline-block`, die 6 px sind die Grundlinienlücke, kein Abstand | 684 → 690 | Textarea als Block mit 8 px unten (das CD gibt Dialoginhalt `padding-bottom: $ob-spacing-sm` vor den Aktionen) |
| **Definitionslisten** (Merkmal-Detail, Anleitung): erste Beschriftung 20 px unter der H2, alle folgenden Paare 12 px auseinander | 265+24 → 297+12 | erste `dt` mit 4 px Polster oben: 8 (H2) + 4 = 12 wie jedes weitere Paar |
| **Lesebreiten**: fünf Masse (62/68/74/78 ch, 74 ch Meldung) | — | zwei Masse als Tokens: `--app-measure` 78 ch (Detail, Anleitung, Hinweise, Meldungen) und `--app-measure-lead` 68 ch (Einleitungssatz); Kennzahlen 74 ch bei 14 px ≈ 68 ch bei 16 px bleiben, Beschreibungsspalte 62 ch bleibt (Tabellenmass) |
| Alle übrigen Abstände | siehe §2 | bestätigt, unverändert — die gemessene Geometrie vor und nach dem Token-Umbau ist bis auf die drei Fixes identisch |

## 4. Token-Bindung

### 4.1 Skala als Alias-Schicht

Oblique kennt zwei Vokabulare für Abstände: die Legacy-Skala
`$ob-spacing-xs/sm/md/default/lg/xl/xxl` (4/8/12/16/24/32/48), aus der
jedes ob-Bauteil dieser Datei seine Werte bezieht, und die DS-Dimension-
Tokens (`--ob-s-dimension-static-density-xs…11xl-px`,
`component_size-element/spacing/container/micro/layout`,
`typography_context`). Das DS selbst verwendet die Dimension-Tokens bisher
nur in seinen eigenen Komponenten-Tokens (Knopf: `element-sm` Polster,
`spacing-md` Mindesthöhe, `spacing-xs` Container-Gap). Die App bindet die
Legacy-Skala **als Aliase auf die DS-Tokens** (`main.css` §2a):

| Alias | DS-Token | Wert | Verwendung |
|---|---|---|---|
| `--app-spacing-xs` | `density-xs` | 4 | Feld-Label-Gap, Tag-Gap, Brotkrumen-Trenner |
| `--app-spacing-sm` | `density-md` | 8 | Zellen, Karten-Innenabstand, H1-Unterkante, Chips-Gap |
| `--app-spacing-md` | `density-xl` | 12 | Toolbar-Gap, Listen-Unterkante, Navigationspolster vertikal |
| `--app-spacing-default` | `density-2xl` | 16 | Inhaltspolster, Sektionsabstände, Karten-Polster |
| `--app-spacing-lg` | `density-4xl` | 24 | Dialogpolster, Fusszeile horizontal, Inhalt seitlich (expanded) |
| `--app-spacing-xl` | `density-6xl` | 32 | H2-Oberkante im Detail |
| `--app-spacing-xxl` | `density-9xl` | 48 | Reserve (CD-Skala vollständig) |
| `--app-control-sm/md/lg` | `component_size-container-xs/sm/md` | 36/40/48 | Blätterknöpfe und Pro-Seite-Select / Felder, Facetten, Umschalter / Touch-Ziel |
| `--app-measure`, `--app-measure-lead` | — (78 ch / 68 ch) | Lesebreiten |

Damit liest sich die Datei in der CD-Sprache («default», «lg»), der Wert
selbst liegt in `tokens.css`, und ein Dichte-Wechsel des DS (die
`dynamic`-Tokens unter `.ob-density-compact/spacious`) bliebe als eine
Zeile pro Alias möglich.

### 4.2 Ersetzt (Zählung nach dem Umbau)

| Kategorie | Stellen | Token |
|---|---|---|
| Margins, Paddings, Gaps, Offsets auf der Skala | 157 | `--app-spacing-*` |
| Kontrollhöhen 36/40 | 11 | `--app-control-*` |
| Rahmenbreiten 1/2/3 px | 30 | `--ob-s-border_width-xs/sm/md` |
| Schriftgrössen 0.75/0.875/1/1.4375 rem | 31 | `--ob-s-static-font_size-xs/sm/md/xl` |
| Schriftgewichte 400/500/700 | 22 | `--ob-s-static-font_weight-regular/medium/bold` |
| Zeilenhöhen 20/24/28 px | 7 | `--ob-s-static-line_height-sm/md/lg` |
| Laufweite ±0.5 px | 4 | `--ob-s-static-letter_spacing_px-wide/narrow` |
| Schatten Karte/Karte-Hover/Tooltip | 5 | `--ob-s-shadow-lg/xl/default` (statt der handgerundeten Material-Werte — das DS ist die deklarierte Wahrheit, Abweichung nur in wenigen px Spread) |
| Farben in Schatten (Panel-Schatten `#828e9a`, Skip-Link-Drop-Shadow `#acb4bd`) | 3 | `border-strong` / `border-medium` |
| Lesebreiten | 6 | `--app-measure(-lead)` |

`main.css`: 382 Zeilen geändert oder ergänzt, 213 entfernt; die gemessene
Geometrie ist vor und nach dem Umbau identisch (bis auf §3).

## 5. Bewusst literal (mit Begründung im Code)

| Wert | Ort | Grund |
|---|---|---|
| 15/11/35/39/43 px Polster | Felder bei Hover/Fokus | Kompensation des 2-px-Randes (1 px weniger Polster), kein Skalenwert |
| 1/7 px | `.app-tag` | 1-px-Rand + 1/7 = 2/8 aussen |
| 2/3/6/10 px | Mikro-Abstände (Phasenkästchen, Legende, Facettenoption, Tooltip-Zeile) | unter der Skala; DS `micro`/`density-sm/lg` wären möglich, aber die Werte sind Innenmasse einzelner Bauteile |
| 30/34, 218/53 px, 1.65 rem/34 px, Gewicht 300 | Kopfzeile, Logo, Marke | Oblique-Variablen `$ob-logo-*`, `$ob-font-size-xl` — kein DS-Token, CD-REVIEW bestätigt |
| 1.0625 rem / 24 px | Kartentitel, Panel-H2 | Legacy `ob-h3` 17 px; DS `font_size-lg` ist 18 px |
| 0.8 rem, 0.6875 rem, 12/13 px | Brotkrume/Fusszeileninfo, Phasenziffer, SVG-Beschriftungen | `$ob-font-size-xs` 0.8 rem; App-Miniaturen; SVG-Nutzerkoordinaten (DS-Minimum 12 px) |
| 0.25 px, 1.42857, 1.333333 | Tabelle, Karten, Chips | Material `ob-body2`/`ob-caption`; kein DS-Token für 0.25 px |
| 16/20 px Chip-Radius, 18 px Kästchen, 12 px Sortierpfeil, 19 px Chevron, 32 px Schliess-/Lösch-Knöpfe | Chip, Checkbox, Tabelle, Select, Text-Control | Legacy-Material-Metriken (`_mat-chip`, MDC, `_mat-table`, `_mat-select`, `_text-control`) |
| `#e53940`, `#46596b`, `rgba(0,0,0,.54)`, `rgba(0,0,0,.32)` | Tab/Nav-Akzent, Caption, Checkbox-Rand, Dialog-Backdrop | kein DS-Token (CD-REVIEW §2) |
| 200/-150/14/15 px, 10 %, 0.85, 0.6 s | Top-Control | Oblique-Werte 1:1 (`top-control.component.scss`) |
| 248, 300, 320, 340, 380–600, 720, 880, 1440 px | Mindest-/Maximalbreiten (Body, Suche, Tooltip, Panel, Facettenmenü, Tabelle, Dialog, Inhalt) | Layoutkonstanten der App; `$ob-body-width` 248 und `ob-has-max-width` 1440 sind CD |
| 40/48 px Fallbacks in `var(--ob-h-button-touch_target-min_size, 48px)` | Mobile | Fallback des DS-Tokens |

## 6. Nicht geändert (Beobachtungen)

- Der Einleitungssatz steht bei 500 (DS `p`), Tabelle und Listen bei 400 —
  DS-Verhalten (UX-REVIEW §2.5).
- Der Reiter «Zum Seitenanfang» liegt bei 10 % über den letzten
  Tabellenzeilen (rechter Rand, 50 px) — das ist die CD-Position; wer ihn
  an den rechten Rand der Inhaltsbreite (1440-Raster) binden will, verliert
  das Docking am Fensterrand, das Oblique vorsieht.
- `.ob-density-compact/spacious` des DS ist nicht angeschlossen (die App
  hat keine Dichte-Umschaltung); die Aliase zeigen auf die `static`-Tokens.
