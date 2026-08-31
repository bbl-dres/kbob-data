# Design-/UX-Review der Graph-Ansicht

Gegenstand: die beiden Graph-Modi (Netz «Objekttypen ↔ Property Sets» und
Radial «Merkmale eines Objekttyps») — Design, Interaktionen, Stile,
Aktionen; Ziel ist eine konsistente, zugängliche Ansicht, die das Erkunden
der Beziehungen im LINDAS-Graphen wirklich unterstützt.

Methode: fünf unabhängige Prüfläufe über den echten Code (Interaktion,
visuelle Gestaltung/CD, Barrierefreiheit, Informationsdesign,
Zustände/Randfälle), jeder Befund anschliessend adversarial gegen den Code
verifiziert; dazu eigene Browser-Beobachtungen (Desktop 1280, klein
gefilterte Auswahlen, Mobile). Ergebnis: **50 bestätigte Befunde, 2
widerlegte**. Zeilenangaben beziehen sich auf den Stand vor der Umsetzung.
Stand: 31.08.2026.

## 1. Redaktionelle Leitentscheide (Vorgaben)

1. **Seitenpanel statt Direktnavigation**: Ein Klick auf einen Knoten
   zeigt Details in einem Panel in der Grafikfläche; navigiert wird erst
   über die Aktion «Öffnen» im Panel.
2. **Steuerung als Overlay auf der Grafik** (Zoom, Ausschnitt, Vollbild) —
   nicht als eigener Streifen darüber.
3. **Die bestehende Filterzeile bleibt der einzige Filterweg** (Suche und
   Facetten wirken auf den Graphen; verifiziert).
4. Diese Entscheide lösten mehrere Befunde gleich mit: die gemischte
   Klick-Semantik (int-04), Tastatur-/Touch-Zugang zu Knoteninformationen
   (int-02, a11y-tooltip-03, info-05), Sackgassen der Hervorhebung
   (info-04, int-05, int-07) und die Streifen-Fragmentierung (int-11,
   vis-layout-05, info-12).

## 2. Umgesetzt

### Interaktion
- **Startrahmen** (int-01/vis-frame-02/info-01/st-02, 5× unabhängig
  gefunden): kleine Auswahlen starten bis ~1.7× vergrössert statt als
  winziger Fleck im 1:1-Rahmen (`rahmen()`, Boden f ≥ 0.6).
- **Seitenpanel** mit Kopf (Art, voller Name, Schliessen), Beschreibung,
  Kennzeilen und Aktionen; Fokus wandert auf den Paneltitel, Escape und ×
  geben ihn an den Knoten zurück; Klick auf freie Fläche schliesst.
  Pset-Panel: Anzahl Objekttypen/Merkmale, **Hervorheben** (aria-pressed)
  und **In der Liste zeigen** (setzt die Suche aufs Set und wechselt zur
  Liste — der Weg aus der Grafik in die filterbare Liste, int-07/info-04).
- **Hervorhebung ohne Neulayout** (st-01/info-03): reiner DOM-Fade
  (`K.hervorhebungNetz`); der Zoom/Pan der Nutzenden bleibt stehen. In der
  Legende erscheint «Hervorgehoben: …» als abwählbare Chip-Zeile (int-05);
  Escape hebt auf; Statuszeile kündigt an (a11y-focusloss-02).
- **Signatur-Skip** (st-10): unveränderter Knotenbestand (Suche tippt,
  Auswahl bleibt gleich) baut nichts neu — Ausschnitt, Zoom und Panel
  bleiben stehen; die Signatur umfasst Graph-URI, Sprache und Knoten-URIs,
  ein `data-modus`-Attribut trennt Netz- und Radial-Inhalt im selben SVG.
- **Hervorhebung reist mit** (info-07): öffnet man aus dem hervorgehobenen
  Netz einen Objekttyp, startet die Radialansicht mit derselben Gruppe
  hervorgehoben, sofern der Typ das Set führt.
- **Rad-Zoom**: nur mit Ctrl/Cmd oder bei *sichtbar* fokussierter Grafik
  (`:focus-visible` statt `activeElement` — ein blosser Klick kapert das
  Scrollrad nicht mehr, st-06/a11y-wheel-10); wirkungsloses Rad zeigt den
  flüchtigen Hinweis «Zoomen mit Ctrl + Mausrad» (int-06,
  Karten-Konvention). **Doppelklick** zoomt an den Punkt (int-09).
- **Touch** (int-03): Zwei-Finger-Pinch zoomt am Mittelpunkt;
  `touch-action: pan-y` bleibt (vertikale Ein-Finger-Geste scrollt die
  Seite); ein zweiter Finger bricht den Zug nicht mehr, nur die linke
  Taste zieht (st-09), `lostpointercapture` räumt auf.
- **Zoomgrenzen relativ** zum Startausschnitt (÷10 bis ×3) und
  Pan-Klemme: ein Teil des Inhalts bleibt immer im Bild (int-10).
- **Fenster-Resize** (st-03/int-08): ResizeObserver führt das
  Seitenverhältnis von Ausschnitt und Reset-Rahmen nach.
- **Vollbild** auf der Grafikfläche (Overlay-Knopf, Sprite-Icons
  `fullscreen`/`fullscreen_exit`, Icon und Name wechseln mit).

### Visuelle Gestaltung
- Steuerung als **Overlay oben links** (runde DS-Icon-Knöpfe auf weisser
  Fläche mit `--ob-s-shadow-sm`); die drei getrennten Streifen sind auf
  Grafik + eine Hinweiszeile reduziert (int-11/vis-layout-05).
- **SVG-Typo ≥ 12px** (DS-Minimum; vis-type-01), Zentrums-Subzeile 12px.
- **Kanten leiser** als Knoten (`border-medium` #acb4bd, vis-edge-06) und
  **gewichtet**: Liniendicke = geteilte Merkmale (info-02), erklärt in der
  Legendennotiz, die jetzt beide Grössenkodierungen nennt (info-06).
- **Abblendung 0.3 statt 0.13** — zurückgenommen, nicht ausradiert
  (vis-fade-07); Radial-Punkte 6.5px (vis-dot-08).
- **Token-Klassen** für die Strukturfarben (`.g-dot-typ`, `.g-dot-pset`,
  Zentrumsscheibe auf der dunklen Flächenfarbe; vis-token-09) — die
  8er-Fachpalette K.FARBEN bleibt inline (Abweichung C10).
- **Radiale Bündelfarben repariert** (vis-radial-03): die Set-Farben
  liegen als Inline-Style an, den die `.g-link`-Regel nicht mehr töten
  kann.
- **Leere Auswahl ist kein Alarm** (vis-alert-10): stille Zeile wie in
  Liste/Galerie; die blaue Info-Kachel bleibt dem «Zu viele
  Objekttypen»-Fall vorbehalten.
- **Tooltip schlank** (vis-tooltip-11): Name + eine Einordnungszeile —
  das Datenblatt zeigt das Panel.

### Barrierefreiheit
- **Tooltip-Parität** (int-02/a11y-tooltip-03): Fokus zeigt denselben
  Tooltip an der Knotenmitte, Blur/Escape schliessen (WCAG 1.4.13).
- **Grafik überspringen** (a11y-tab-01): sichtbarer Fokus-Skip-Knopf vor
  dem SVG springt zur Textfassung (`#graph-text`, fokussierbar).
- **Kurzname statt Bedienungsanleitung** (a11y-name-04): das SVG heisst
  über `aria-labelledby` knapp («Netzdarstellung …» bzw. «Merkmale von X»),
  der Hinweistext hängt als `aria-describedby` an.
- **Legenden-Toggles ehrlich** (a11y-legend-05): `aria-pressed` heisst
  «ist hervorgehoben» (genau einer), die Abblend-Optik läuft über eine
  eigene Klasse; jeder Knopf trägt «{Name} hervorheben, {n} Merkmale».
- **Fokus- und Auswahlring skalieren nicht mit** (a11y-focusring-06):
  `vector-effect: non-scaling-stroke`; Trefferflächen vergrössert
  (a11y-target-09, teilweise — s. Zurückgestellt).
- **Textfassung nie veraltet** (st-07): die Meldungspfade leeren
  `#graph-text`; ein schwebender Tooltip überlebt keinen Neuaufbau mehr
  (st-08).
- Panel-Fokusfluss: öffnen → Titel; Hervorheben-Toggle behält den Fokus
  auf seinem Knopf (a11y-focusloss-02).

### Daten/Zustände
- **Property-Set-Knoten nach URI** (st-04): namensgleiche Sets aus
  verschiedenen Katalogen bleiben eigene Knoten; die *Hervorhebung* matcht
  bewusst den Namen (fachlicher Begriff — dokumentiert im Code).
- `hervor` ist jetzt konsequent flüchtig (st-05): auch der
  Ansichtswechsel löscht es — wie der Zurück-Knopf.

## 3. Widerlegte Befunde (adversarial geprüft)

| Befund | Warum verworfen |
|---|---|
| «Zoomgruppe mischt runde und eckige Knöpfe — CD-Verstoss» | Die runde Form IST die DS-Icon-Knopf-Variante (tokens `--ob-h-button-icon_only-*`, Radius rounded), app-weit so verwendet; die eckigen Paginator-Knöpfe sind die Spezifikation genau dieser Legacy-Komponente, keine allgemeine Regel. (Der Reset-Knopf wurde trotzdem zum Icon-Knopf — aus Layoutgründen des Overlays, nicht wegen des Befunds.) |
| «1:1-Startrahmen ist ein A11y-Mangel (P2)» | Als *Accessibility*-Befund verworfen (kein WCAG-Kriterium verlangt Anfangsvergrösserung, Zoom ist einen Tastendruck entfernt); als *Design*-Befund derselbe Punkt aus vier anderen Läufen bestätigt und umgesetzt. |

## 4. Zurückgestellt (bewusst)

| Thema | Grund |
|---|---|
| Roving tabindex (ein Tab-Stopp für den Graphen, Pfeile zwischen Knoten) | Grösserer Umbau; der Skip-Knopf nimmt der Tab-Litanei die Schärfe. Kandidat für die nächste A11y-Runde. |
| Trefferflächen unabhängig vom Zoom (Radius skaliert mit viewBox) | Geometrie-Radius lässt sich nicht per vector-effect fixieren; Basisradius vergrössert, Panel-Muster senkt den Präzisionsdruck. |
| Radiale Punkte kodieren Werteliste/Einheit/Meilenstein (info-08) | Encoding-Ausbau; das Panel zeigt die Angaben seit dieser Runde einen Klick entfernt. |
| «Verbindungen»-Abschnitt auf der Merkmal-Detailseite (info-09) | Eigene Detailseiten-Iteration (I14Y-Muster dort weiterführen). |
| Twei-Finger-Vertikal-Pan | Wird vom Browser als Seiten-Scroll beansprucht; vertikale Reichweite kommt über Pinch am Mittelpunkt. |
| Dokumenttyp-Ausschluss prominenter als im Hinweistext (info-11) | P3; Hinweistext ist kürzer geworden, die Notiz bleibt dort lesbar. |

## 5. Spacing-Nachtrag

Das parallel gelaufene Spacing-Review (Abstände gegen die CD-Skala) ist in
docs/CD-REVIEW.md §9 dokumentiert; seine Graph-Befunde (Overlay-Selektoren,
Paginator-Gap, Chip-Familie) sind in dieser Runde umgesetzt.
