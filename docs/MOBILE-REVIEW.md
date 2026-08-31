# Mobile-Review — Feinschliff gegen das Oblique-CD

Gegenstand: die App auf kleinen Geräten (Schwelle: matchMedia 905 px →
`ob-layout-collapsed` + `ob-viewport-mobile`), geprüft gegen den echten
Oblique-Quellcode. Erwartung laut Auftrag: «nur kleinere Punkte» — und so
kam es: die Grundlagen (Spalten-Toolbar, Facetten im Fluss, statischer
Kopf, Tabellen-Scrollregion, 320-px-Reflow ohne Seitenscroll) hielten.

Methode: vier unabhängige Prüfläufe (Collapsed-Layout, Touch-Ergonomie/
WCAG 2.5.8, Graph auf Telefonen, CD-Mobile-Deltas aus dem Oblique-Code),
jeder Befund adversarial gegen App- und CD-Code verifiziert; dazu eigene
Live-Messungen bei 375×812 und 320×568. Ergebnis: **32 bestätigte Befunde
(mit starker Konvergenz über die Läufe), 2 widerlegte.**
Stand: 31.08.2026.

## 1. Umgesetzt

### Beruehrziele — der 48-px-Token gilt jetzt als Grösse, überall
Der mobile DS-Token `--ob-h-button-touch_target-min_size` (48 px unter
`.ob-viewport-mobile`, im CD als *min_size* definiert) wirkte nur als
**Höhe** und nur auf zwei Klassen. Folgen: 38×48-„Ovale" statt runder
Icon-Knöpfe im Graph-Overlay und beim IRI-Kopierknopf (3× unabhängig
gefunden), 32-px-Schliess-/Löschknöpfe, 36-px-Sprachwahl neben
48er-Knöpfen, 19 px hohe Brotkrumen-Knöpfe. Jetzt:

- Icon-Knöpfe erhalten `min-width` → echte 48×48-Kreise (Overlay, Kopieren).
- Panel-Schliessen 48×48; Such-Löschen 40×40 (Obergrenze im 40-px-Feld);
  Zum-Seitenanfang 48×48; Sprachwahl min-height 48; «Einträge pro
  Seite»-Select 48; Chips min-height 40; Legenden-Knöpfe min-height 32.
- Brotkrume und Sortierköpfe wachsen als **Trefferfläche** (Padding mit
  Negativ-Margin), die Optik bleibt.
- Sortierpfeil ist auf Touch **immer angedeutet** (es gibt kein Hover).
- Graph-Knoten: Trefferflächen werden nach dem Rahmen auf mindestens
  ~24 CSS-Pixel Durchmesser angehoben — vorher schrumpften sie mit der
  Skala grosser Graphen auf ~13 px und weniger (WCAG 2.5.8).
- Dialog-Textarea 16 px auf Mobile — darunter zoomt iOS beim Fokus die
  ganze Seite.

### Collapsed-Layout — volle Zeilen statt Flatterkanten
- **Service-Navigation** stapelt als zwei volle, gleiche Knopfzeilen,
  die Sprachwahl rechts darunter — das CD-eigene Muster für sichtbare
  Controls auf schmalen Viewports (`ob-*-down-width-100`-Mixin der
  service-navigation); Padding unten 8 px wie im CD.
- **Ansichts-Umschalter** spannt als drei gleiche Segmente über die
  Spalte, im Rhythmus von Suche und Facetten darüber.
- **Blättern** in drei ruhigen, zentrierten Zeilen (Bereich / ‹ Seite x
  von y › / Einträge pro Seite) statt dreier Ausrichtungen mit
  zweizeilig umbrechendem Bereichstext.
- Facetten-Menü `min-width: 100%` (Robustheits-Nit unterhalb ~316 px).

### Graph auf Telefonen
- **Overlay als Zeile** oben (216×48) statt 216-px-Säule am linken Rand
  des 626-px-Canvas; der Skip-Fokus rückt darunter.
- **Panel deckt 85 %** statt 100 % — ein Graph-Streifen bleibt als
  Orientierung und Tap-out-Fläche sichtbar (CD-Präzedenz: Off-Canvas
  collapsed 80 %, `$ob-off-canvas-sidebar-collapsed-width`).
- **Scroll-Start schliesst das Panel nicht mehr**: `pointercancel`
  (Browser übernimmt die Geste als Seiten-Scroll) zählt nicht mehr als
  Hintergrund-Tap — nur ein echtes `pointerup` ohne Zug.
- **Legende kompakt** (42 statt 121 px): engeres Polster, die
  Encoding-Notiz weicht auf Mobile dem knappen Platz (die abwählbare
  Hervorhebungs-Chipzeile bleibt selbstverständlich).
- **Rad-Hinweis-Pille** hängt jetzt an der echten Legendenhöhe statt an
  fixen 64 px — sie stand auf Collapsed mitten in der umbrochenen Legende
  (nur mit Maus unter 905 px erreichbar, aber real).

### CD-Token-Anschluss
- `.ob-dialog-actions` nutzt `--ob-h-button-container-spacing-gap`
  (Desktop 16 px unverändert, Mobile automatisch 12 px) — einer von genau
  zwei Tokens, die das DS unter `.ob-viewport-mobile` umstellt; der
  andere (touch_target) ist oben vollständig angeschlossen.

## 2. Widerlegt (adversarial geprüft)

| Befund | Warum verworfen |
|---|---|
| «Facetten-Menü 300 px erzwingt bei 320 px Seitenscroll (WCAG 1.4.10)» | Live gemessen: das Menü endet bei x=316 < 320 — es ragt 12 px ins Seitenpolster, erzeugt aber keinen Scrollbalken; echter Überlauf erst unter ~316 px Viewport. Die Ein-Zeilen-Härtung (`min-width: 100 %`) wurde trotzdem als Nit übernommen. |
| «Zum-Seitenanfang-Knopf verdeckt am Seitenende das Pro-Seite-Select» | Live widerlegt: am Seitenende schiebt sich immer die 236 px hohe Fusszeile dazwischen; eine Überlappung existiert nur in einem ~76-px-Scroll-Übergangsfenster — wie bei jedem fixierten Eckelement. |

## 3. Akzeptiert / zurückgestellt

| Thema | Grund |
|---|---|
| Markentitel 1.65 rem ellipsiert bei 320 px | `text-overflow: ellipsis` ist exakt die CD-Regel für den Brand-Titel; das DS ändert auf Mobile keine Typo-Tokens. |
| Kein Burger-Menü | Abweichung C11 (ohne Navigation gibt es keinen Ort dahinter); durch die gestapelten vollen Zeilen ist der sichtbare Kopf jetzt aufgeräumt. |
| `ob-table-collapse`-Stapelmuster | Weiterhin C12 (horizontale Scrollregion); unverändert grösserer Umbau. |
| Graph-Overlay bei 12 px Gruppen-Gap-Token | Der Verifier rechnete nach: Token-Übernahme würde die 8-px-Gaps auf Desktop verdoppeln — nur die Dialog-Aktionen haben den No-op-Fall und wurden angeschlossen. |
