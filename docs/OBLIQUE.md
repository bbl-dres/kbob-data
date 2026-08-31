# Oblique-Übernahme: Befunde, Entscheide, Abweichungen

Stand: 31.08.2026 · Quelle: lokaler Checkout `oblique` (Version **15.4.4**,
MIT-Lizenz, Copyright Schweizerische Eidgenossenschaft/BIT) · Ziel: diese
Vanilla-JS-App übernimmt das offizielle Designsystem des Bundes Komponente
für Komponente und Token für Token — mit den Originalnamen.

Grundlage: sechs Extraktionsberichte über den echten Quellcode (Tokens,
Kern-SCSS, Master-Layout, Material-Komponenten, Icons/Assets,
Abbildungsplan), jeder Wert einzeln gegen die Quelldateien gegengeprüft
(~300 verifizierte Kernwerte, 7 Korrekturen aus der Gegenprüfung).

---

## 1. Was Oblique 15.4.4 ist — zwei Quellen, eine Rangordnung

| Quelle | Inhalt | Status |
|---|---|---|
| `projects/design-system` («Oblique Design System», `@oblique/design-system`) | **reines CSS**: `tokens.css` (2634 Zeilen, 2528 `--ob-*`-Tokens), `reset.css`, `fonts.css` (Noto Sans als Variable Fonts), Text-Layer (h1–h6, p, a). Laut README ausdrücklich «intended for projects that do not use Angular». | **Wahrheit für Tokens, Typografie, Links, Fokus, Knöpfe** (Knöpfe sind als `--ob-h-button-*`-Kette vollständig token-definiert) |
| `projects/oblique` (Angular-Bibliothek) | Komponenten: Master-Layout (Kopf/Fuss/Navigation/Sprachwahl), `.ob-table`, `.ob-alert` (explizit auch ohne Angular nutzbar), Breadcrumb, Spinner, Chips, Dialog, Paginator, Formularfelder (Material-Theming), Icons-Sprite (284 Stück) | **Wahrheit für alle Komponenten, die das Design System noch nicht definiert** — ausgedrückt über `--ob-*`-Tokens, wo die Werte übereinstimmen |

Diese Rangordnung ist der zentrale Entscheid: **«DS-Fundament,
Legacy-Komponenten».** Wo beide Quellen dasselbe Bauteil unterschiedlich
definieren (Knopf, Link, Fokusring, Überschriften), gilt das Design System —
es ist die deklarierte Zukunft des Systems und intern konsistent (Blau-Kette
Knopf ↔ Link). Die betroffenen Legacy-Werte sind in §5 als Abweichungen
protokolliert.

## 2. Token-Ebene (`css/tokens.css`)

Verbatim-Kopie der generierten `tokens.css` (alle 2528 Tokens, inklusive
Dark-Mode-Block `.ob-lightness-dark`, Grössen-/Dichte-Modi und
`.ob-motion-disabled`), mit drei mechanischen, im Dateikopf dokumentierten
Reparaturen:

1. CSS-Nesting aufgelöst (`:root { .ob-x {…} }` → `:root .ob-x {…}`) —
   semantisch identisch, läuft auch ohne Nesting-Support.
2. Schatten-Tokens: fehlende `px`-Einheiten ergänzt (Figma-Export-Artefakt
   der Quelle; unitless wäre ungültiges `box-shadow`).
3. `letter-spacing: auto` → `normal` (`auto` ist ungültiges CSS).

Token-Taxonomie (fünf Präfixe): `--ob-s-` (Dimension/Typo/Radius/Schatten/
Motion/z-index), `--ob-s1-`/`--ob-s2-`/`--ob-s3-` (Farb-Semantik in drei
Stufen; **s3 ist die nutzbare Endstufe**), `--ob-h-` (HTML-Komponenten:
button, link, hr, list, typography-context). Jede Farbe existiert als
`inversity_normal` (dunkel auf hell) und `inversity_flipped`. Dark Mode ist
klassengesteuert (`.ob-lightness-dark` auf `<body>`), kein `prefers-color-scheme`.

Kernwerte: Interaktionsblau `#2379a4` (Primärknopf) / `#2e8fbf` (Link) /
`#236487` (hover) / `#255069` (pressed); Grau-Treppe `#f0f4f7 → #131b22`;
Fokusring `3px solid #8b5cf6`, Offset 3px; Statusfarben in elf Familien
(critical `#d8232a`-Kette = klassisches Bundesrot, attention, info,
resolved …); Abstände 4–64 px; `--ob-s3-color-brand: #ff0000`.

Frühere App-Tokens → Oblique (Auszug; vollständige Ableitung im
Extraktionsbericht): `--pine` → Interaktionsblau, `--rust` →
`status-critical-fg`, `--ink` → `neutral-fg-contrast_high #1c2834`,
`--rule` → `border-strong #828e9a`, `--s1..7` → `--ob-s-dimension-static-density-*`
(wertgleich), IBM Plex Mono → **Noto Sans Mono**.

## 3. Komponenten-Abbildung (Originalnamen)

| App-Bauteil | Oblique-Klasse(n) | Quelle |
|---|---|---|
| Seitengerüst | `body.ob-master-layout.ob-has-layout.ob-no-navigation` + `ob-layout-expanded/-collapsed` (matchMedia 905 px) > `.ob-viewport` > Header > `.ob-master-layout-wrapper` > `main#content.ob-main-layout` | master-layout.component |
| Kopfzeile | `.ob-master-layout-header` > `header.ob-header` > `.ob-master-layout-header-title` > `.ob-master-layout-brand` (Bundeslogo `a.ob-master-layout-logo` + `span.ob-master-layout-brand-app-title` > `a.ob-master-layout-brand-link`) | dito |
| Sprachwahl | `.ob-service-navigation` > `ul.ob-service-navigation-list` > `li` > `.ob-language-dropdown` (natives `<select>`, rahmenlos, Chevron) | service-navigation/languages |
| Export-Knopf | `li.ob-service-navigation-custom-control` > `button.ob-button.ob-button-secondary` | dito + Button-Tokens |
| Skip-Link | `nav.ob-access-keys` > `a.ob-accessible` (oranges Band, Accessibility-Icon, accesskey 0) | master-layout-accessibility |
| Brotkrume | `nav > ol.ob-breadcrumbs` > `.ob-breadcrumb-label` + `.ob-breadcrumb-separator.ob-icon-text` (chevron_right_small); **wandert vom Kopfband in den Inhalt** (Oblique kennt kein Brotkrumen-Band) | breadcrumb.component |
| Knöpfe | `.ob-button.ob-button-primary/-secondary/-tertiary` — vollständig über `var(--ob-h-button-*)` definiert (Radius 1 px, min-height 24 px, Blau-Kette, hover-Schatten `shadow-xl`) | DS-Tokens |
| Tabelle | `.ob-table` (+`.ob-table-scrollable`-Wrapper): Zebra `#f0f4f7`, hover `#dfe4e9`, Zeilenlinie 1 px `#acb4bd`, Kopf 2 px, Versalien-`th` normalgewichtig, Zellpadding 8 px | core/_table.scss |
| Sortierpfeil | `.mat-sort-header`-Muster: «ArrowUp»-SVG (data-URI, currentColor, 12 px), absteigend rotiert | material/_mat-table.scss |
| Filter-Pillen | `.ob-chip` (dunkel gefüllt `#2f4356`, weisse Schrift, hover `#46596b`, aktiv `#263645`, Schliess-Icon) | material/_mat-chip.scss |
| Statusmeldungen/Kacheln | `.ob-alert.ob-alert-info/-success/-warning/-error` — kompletter No-Angular-Block inkl. der vier Base64-Icon-Streifen, verbatim | oblique-alert.scss |
| Lade-Spinner | `.ob-spinner` > `.ob-overlay.ob-spinner-fade(-in)` > `.ob-spinner-viewport` > SVG-Kreis (stroke `#2F4356`, 4 px, `ob-spin` 1.2 s); kleine Inline-Variante `kbob-spinner-inline` mit denselben Stroke-Werten | lib/spinner |
| Blättern | Paginator-Muster: 36×36-Navigationsknöpfe (first/prev/next/last) mit den vier Chevron-data-URIs, Text `#2f4356`, «Einträge pro Seite»-Select | material/_mat-paginator.scss |
| Dialoge | `.ob-dialog`-Rollen (`-title` = ob-h2 23/28/700, `-content`, `-actions` rechtsbündig, Padding 24 px, bewusst ohne Schatten); natives `<dialog>` bleibt | material/_mat-dialog.scss |
| Tooltip (Graph) | `.ob-tooltip`: Grund `#263645`, weiss, `shadow-default` | material/_mat-tooltip.scss |
| Karten (Galerie) | `.ob-card` (Rand `#dfe4e9`, `shadow-lg`, hover `shadow-xl`), Titelknopf mit gedehnter Klickfläche bleibt | material/_mat-card.scss |
| Externe Links | `a.ob-external-link` + `link_external`-Icon + sr-Suffix «– externer Link» | external-link |
| Fusszeile | `.ob-master-layout-footer` > `footer` (Grid, dunkel `#263645`, weisse Links, hover `#dfe4e9`) > `.ob-footer-links`/`.ob-footer-item-links`, `.ob-footer-info` | master-layout-footer |
| sr-only | `.ob-screen-reader-only` (überall umbenannt) | core/_print.scss |
| Icons | Sprite `assets/icons/obliqueIcons.svg` (284 Icons, viewBox 24, ohne fill → `currentColor`), einmal per XHR in den DOM injiziert, Verwendung `<svg class="ob-icon"><use href="#name">` — die Vanilla-Entsprechung von Obliques `addSvgIconSetLiteral` | assets + icon.service |

Glyphen-Ersetzungen: `▾`→chevron_down_small, `×`→xmark, `▲▼`→ArrowUp-SVG,
`←`→arrow_left, `↗`→link_external, `›`→chevron_right_small, `+ −`→plus/minus.
Typografische Zeichen (« », …) bleiben Text.

**App-eigene Bauteile ohne Oblique-Gegenstück** tragen den Präfix `kbob-`
(englisch, Bindestriche, ausschliesslich `--ob-*`-Token, nie `ob-`):
`kbob-toolbar`, `kbob-facet(-menu/-option)`, `kbob-view-switch`,
`kbob-page-header` (Titelblock), `kbob-status`, `kbob-gallery`,
`kbob-detail`, `kbob-legend`, `kbob-phase(-track)`, `kbob-spinner-inline`,
`kbob-graph-wrap`. Die SVG-internen Grafikklassen (`g-*`) bleiben als
dokumentierter interner Namensraum der Fachvisualisierung.

## 4. Assets und Lizenz

- `assets/fonts/` — drei **Variable Fonts** (wght 100–900) aus dem DS:
  Noto Sans regular/italic + Noto Sans Mono, md5-identisch zur Quelle;
  `@font-face` gemäss `fonts.css` (font-display swap, Latin-Subset).
  Ersetzt Google-CDN **und** IBM Plex Mono. Fonts: SIL OFL 1.1.
- `assets/icons/obliqueIcons.svg` — Sprite md5-identisch zur Quelle.
- `assets/images/` — `logo.svg`/`logo-white.svg` (Logo der Schweizerischen
  Eidgenossenschaft: Wappen `#E30613` + viersprachiger Schriftzug als
  Pfade) und `favicon.png` (32 px). Das Logo ist im Master-Layout Standard;
  für diese Bundes-/KBOB-Anwendung bestimmungsgemäss. **Hinweis:** Die
  Verwendung des Schweizerwappens regelt das Wappenschutzgesetz — die
  formale Freigabe ist Sache der Betreiberin (BBL/KBOB), technisch ist es
  der Oblique-Standard.
- Alle kopierten Bestandteile: MIT (Schweizerische Eidgenossenschaft/BIT);
  Copyright-Hinweis steht in den Dateiköpfen von `tokens.css`/`main.css`.

## 5. Dokumentierte Abweichungen

| # | Abweichung | Begründung |
|---|---|---|
| A1 | **Body-Grund weiss** (`bg-contrast_highest`) statt DS-Reset-Grau `#f0f4f7` | Die Komponenten (Zebra-Tabelle, weisser Header, Karten) stammen aus der Legacy-Welt mit weissem Grund; auf Grau würde das Zebra unsichtbar. Wenn Oblique die DS-Komponenten liefert, mitziehen. |
| B1 | Knöpfe nach **DS-Tokens** (Blau `#2379a4`, Radius 1 px, ~30 px hoch) statt Legacy-Material (Grau `#596978`, Radius 2 px, 36 px) | DS ist die deklarierte Wahrheit; Blau-Knopf und Blau-Link gehören zusammen. Legacy-Werte im Extraktionsbericht festgehalten. |
| B2 | Fokus app-weit `outline 3px solid #8b5cf6` + Offset (DS) statt Legacy-`box-shadow #8655f6` | outline überlebt forced-colors, box-shadow nicht; eine einheitliche Fokusfarbe statt zwei. |
| C1 | Header klebt per `position: sticky` statt Obliques `100dvh`-Viewport mit scrollendem Wrapper | Funktional/visuell deckungsgleich, ohne das Scrollverhalten der ganzen App umzubauen. |
| C2 | Sprachwahl als gestyltes natives `<select>`; das aufgeklappte Panel ist das native Browser-Popup | Kein Overlay-Nachbau in ES5; Trigger-Optik (rahmenlos, 36 px, Chevron) ist originalgetreu. |
| C3 | Paginator: Chevron-SVGs direkt in Zielfarbe `#2f4356`/`#828e9a` statt Schwarz+CSS-`filter` | Gleiches Resultat ohne die Filter-Approximation (Obliques eigener Kommentar nennt den Filter «close to»). Layout (Bereich links, Seiten Mitte, Grösse rechts) bleibt wie gehabt — dokumentierte App-Anordnung. |
| C4 | `:active`-Hintergründe ersetzen Material-Ripple (Farben = Ripple-Farben) | Vanilla-Vereinfachung aus dem Extraktionsbericht. |
| C5 | Sticky-`thead` (nur ≥1240 px) ist eine App-Beigabe — Oblique kennt keinen klebenden Tabellenkopf | Bewährtes App-Verhalten; Kopf-Grundlinie als `box-shadow` (border wandert bei border-collapse+sticky). Darunter `.ob-table-scrollable`. |
| C6 | `.ob-alert`-Kacheln: der «Erneut versuchen»-Knopf steht unter dem Alert (Oblique-Konvention), Ladezustand bleibt Karte+Spinner | |
| C7 | Kein `@layer` — Kaskade über physische Reihenfolge tokens → (fonts/reset/text in main.css) → Komponenten → App | Zwei-Dateien-Vorgabe des Repos; ohne Material-CSS gibt es keinen Layer-Konflikt. |
| C8 | forced-colors- und `prefers-reduced-motion`-Blöcke der App bleiben (Oblique bringt keine mit) | dokumentierte Eigenleistung. |
| C9 | Facetten-Checkbox-Dropdown, Ansichts-Umschalter, LOIN-Kästchen, Graph, Galerie-Raster: kein Oblique-Gegenstück → `kbob-*` im Oblique-Look (Overlay-Karte `#acb4bd`-Rand + Panel-Schatten, MDC-Checkbox-Optik `#2f4356`) | §3, Konvention. |
| C10 | Die 8er-Kategorienpalette des Graphen (`K.FARBEN`) bleibt fachlich unverändert | Datenvisualisierung, kein UI-Chrome; gegen Weiss geprüft. |

## 6. Umbau-Etappen (ausgeführt)

1. Repo: `docs/` für alle MD (ausser README), `assets/fonts|icons|images`,
   Proxy-Whitelist um `assets/` erweitert.
2. `css/tokens.css` = DS-Tokens verbatim (§2).
3. `css/main.css` neu: fonts → reset → text-Layer → `ob-`-Komponenten →
   `kbob-`-App-Bauteile → print/forced-colors.
4. `index.html` auf das Master-Layout-Gerüst; `#inhalt` → `#content`;
   Brotkrume in den Inhalt; Fusszeile dunkel; Favicon/Logo.
5. JS: Klassen nachgeführt (`K.knopf` vergibt `ob-button`-Rollen,
   `sr-only` → `ob-screen-reader-only`), Sprite-Injektion + `K.icon()`,
   matchMedia-Layoutklassen, Kopfhöhen-Messung auf `.ob-master-layout-header`.
6. Abnahme: alle Ansichten im Browser, Tests, Kontraste der kbob-Bauteile
   gegen die neuen Gründe.

## 7. Aktualisierung bei neuen Oblique-Versionen

1. `tokens.css` neu aus `projects/design-system/.../layers/tokens.css`
   generieren (Reparaturen 1–3 aus §2 erneut anwenden — Skriptmuster im
   Commit dieser Umstellung).
2. Text-Layer (`heading/paragraph/link.css`) und `reset.css` diffen.
3. Sobald das Design System eigene Komponenten-CSS liefert (Tabelle, Chips,
   Master-Layout …): Legacy-Blöcke in main.css dagegen austauschen und die
   betroffenen Abweichungen in §5 streichen.
