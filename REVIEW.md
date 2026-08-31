# Zweite Durchsicht: Design- und UX-Review

Stand: 31.08.2026 · betrifft `index.html`, `css/`, `js/`, `lindas-proxy.py`,
`README.md`, `DESIGN.md`

Die erste Überarbeitung (DESIGN.md) hat die Anwendung neu aufgestellt. Diese
zweite Durchsicht prüft, ob sie ihre eigenen Massstäbe hält — und setzt die
Befunde direkt um. Was offen bleibt, steht am Ende mit Begründung.

---

## 1. Vorgehen

Zwei Prüfstränge, unabhängig voneinander:

1. **Empirische Prüfung im Browser** — alle Ansichten, Zustände und
   Übergänge der laufenden Anwendung gegen den Live-Endpunkt: Übersicht,
   Facetten, Galerie, Netz- und Radialgrafik, Merkmaldetail, Deep-Links,
   Fehlerzustände, Dialoge, Tastaturbedienung, 375/780/1440 px.
   Kontrastwerte nachgerechnet (WCAG-Formel), nicht geglaubt.
2. **Sechs Fachperspektiven** — Stakeholder-Recherche (mit Quellenprüfung im
   Web), Textredaktion, Barrierefreiheit (WCAG 2.1 AA / eCH-0059),
   Interaktionsdesign, visuelles System, Datenehrlichkeit. Jeder Befund wurde
   anschliessend **adversarial gegengeprüft** (Auftrag: widerlegen), dazu eine
   Vollständigkeitskritik über die Gesamtliste.

Ergebnis: **105 bestätigte Befunde** (37 gewichtig, 46 klein, 22 Notizen),
kein Befund vollständig widerlegt; sieben wurden bei der Gegenprüfung präzisiert
oder in der Schwere korrigiert. Die grosse Mehrheit ist umgesetzt (Spalte
«Stand»); Offenes steht in Abschnitt 9.

**Gesamturteil:** Die Substanz trägt. Semantik, Fokusführung, ehrliche
Leerzustände und die Zwei-Ebenen-Architektur sind überdurchschnittlich sauber.
Die Befunde sind fast durchweg Stellen, an denen die Anwendung ihre *eigenen*
Leitsätze verfehlt — ehrliche Filter, eine Farbe eine Bedeutung, Ehrlichkeit
vor Vollständigkeit. Genau dort wurde nachgearbeitet.

---

## 2. Korrektheit und Ehrlichkeit

| Befund | Stand |
|---|---|
| **Kennzahl «5 Kataloge» ignorierte die Filter.** «0 Objekttypen · 0 Merkmale · 5 Kataloge» — die dritte Zahl beschrieb den Gesamtbestand im Satz über die Auswahl. | Umgesetzt: alle drei Zahlen aus der sichtbaren Auswahl, mit Einzahl/Mehrzahl. |
| **«Neu laden» invalidierte keine Caches.** Endpunktwechsel mischte Details und Wertelisten zweier Graphen; `ladeDetail` las den Endpunkt live aus dem Dialogfeld. | Umgesetzt: `laden()` verwirft `detail`/`werte`; Endpunkt und Graph werden beim Laden eingefroren (`st.verbindung`), alle Folgeabfragen gehen dagegen. |
| **Stilles Scheitern der Werteliste-Abfrage** machte «Auswahl»-Merkmale dauerhaft zu «Text» mit der falschen Aussage «ohne Werteliste» — gecacht. | Umgesetzt: Fehler wird gemeldet, das Detail nicht zwischengespeichert (nächstes Öffnen versucht es erneut). |
| **Reifegrad-Tooltip beschriftete jeden unbekannten Status als «noch nicht verabschiedet»** — ein künftiges «Approved» würde als sein Gegenteil erklärt. | Umgesetzt: explizites Mapping nur für Candidate/Preview; Unbekanntes bekommt keinen Tooltip. Galerie-Marken tragen den Tooltip jetzt ebenfalls. |
| **Detail-Ladefehler liess «Merkmale werden geladen …» stehen** — Befund K1 kehrte eine Ebene tiefer zurück. | Umgesetzt: eigener Fehlerzustand mit «Erneut versuchen» auf der Objekttyp-Ebene. |
| **Fehlerzustand räumte nicht auf:** Filterpillen, Blätterleiste und Export-Knopf blieben aktiv über der Fehlermeldung. | Umgesetzt: `zeigeFehler()` versteckt beides und deaktiviert den Export. |
| **Kopierbestätigung log:** «kopiert» erschien auch bei Misserfolg, und zwar hinter dem inerten Modal. | Umgesetzt: Clipboard-API mit ehrlicher Erfolgs-/Fehlermeldung *im* Dialog. |
| **CSV: Formel-Injection und `\r`** — führende `=`/`+`/`-`/`@` aus dem fremden Graphen liest Excel als Formel. | Umgesetzt: OWASP-Entschärfung (Hochkomma), `\r` maskiert. Dazu: Spalte «Datentyp (Katalog)» mit dem Rohwert, Datum im Dateinamen, Akzent-Transliteration (é→e). |
| Halbe Werte durch harte Kürzung («… Holzwerks …») sahen aus wie echte Katalogwerte. | Umgesetzt: Kürzung nur an Wertgrenzen, Rest beziffert («… +8 weitere»). |
| Fusszeile behauptete «kein publizierter Stand» auch bei fremdem Endpunkt; kein Abfragezeitpunkt. | Umgesetzt, später überholt: Der Herkunftshinweis wurde auf Betreiberentscheid ganz aus der Fusszeile entfernt (der Dienst ist inzwischen auf I14Y verzeichnet und verlinkt); das Abfragedatum steht weiterhin im CSV-Dateinamen. |
| Merkmal-Detail liess leere Felder wortlos weg — nicht unterscheidbar von «Ansicht führt das Feld nicht». | Umgesetzt: ehrliche «—»-Zeilen für Reifegrad, Einheit, Werteliste, Meilensteine. |

## 3. Fachsprache: «Projektphase» war ein Fehl-Label

Der gewichtigste fachliche Befund. Das Feld heisst im KBOB-eigenen Schema
`dd:loinMilestone` mit dem Label **«LOIN-Meilenstein»** — es bezeichnet den
Meilenstein der Informationsbereitstellung (SN EN 17412-1), keinen
Phasenbegriff. Die Werte LZP1–LZP9 stammen aus dem neunstufigen
Lebenszyklusmodell des AG-ATB-iDSK-Piloten. Ein Schweizer BIM-Publikum liest
«Projektphase 4» dagegen zwanglos als SIA-112-Phase 4 «Ausschreibung» — die
Oberfläche erzeugte genau die Verwechslung, vor der DESIGN.md E8a warnt, und
kürzte die Werte entgegen der eigenen Entscheidung auf nackte Ziffern.

Umgesetzt: Facette, Spalten und Detailzeile heissen **LOIN-Meilenstein**;
die Kästchen behalten die kompakte Ziffer, tragen aber den vollen Datenwert
(`LZP4`) als Tooltip je Feld und als Sammel-Tooltip; das Merkmaldetail sagt
bei leerem Feld «kein Meilenstein deklariert» statt neun grauer Kästchen.
Offen bleibt die Frage an KBOB, ob «Lebenszyklusphase (LZP)» die bessere
Publikumsbezeichnung wäre (→ DESIGN.md Abschnitt 8).

## 4. Barrierefreiheit (WCAG 2.1 AA / eCH-0059 v3.0)

| Befund | Stand |
|---|---|
| **Skip-Link wurde beim Fokussieren nie sichtbar** (keine `:focus`-Regel) — unsichtbarer erster Tab-Stopp. | Umgesetzt: `.skip` mit sichtbarem Fokuszustand, Text neu «Zum Hauptinhalt springen» (admin.ch-Konvention). |
| **Reflow (SC 1.4.10):** Tabelle ohne Überlaufbehälter — unter ~1000 px scrollte die ganze Seite horizontal, bei 375 px lagen Spalten ganz ausserhalb. | Umgesetzt: unter 1100 px scrollt nur noch die Tabelle in ihrem Behälter (`overflow-x`), die Seite nie. Preis: der klebende Tabellenkopf wirkt nur oberhalb — dokumentiert in der Erklärung zur Barrierefreiheit. |
| **Tastatur-Verschieben des Graphen war toter Code:** das SVG hatte keinen `tabindex`, der Handler konnte nie greifen — der Hinweistext versprach es trotzdem. | Umgesetzt: SVG fokussierbar; Pfeiltasten/+/−/0 funktionieren (im Browser verifiziert). Hinweistexte versprechen nur noch, was geht. |
| **Scrollrad-Falle:** `preventDefault()` auf jedem Wheel über der 62-vh-Grafik, `touch-action: none`. | Umgesetzt: Zoomen nur mit Ctrl/Cmd oder bei fokussierter Grafik, `touch-action: pan-y`; Hinweistext benennt die Bedienung. |
| **Kontraste nachgerechnet:** Graph-Kanten 2.13:1, `--rule` auf Papier 2.99:1, gedimmte Legende 2.81:1, gefadete Knoten 1.23:1 bei weiter fokussierbaren Zielen; Swatches ohne den in tokens.css versprochenen Rand (bis 2.17:1). | Umgesetzt: Kanten `#7D8B87` (3.1:1), `--rule` `#848F8B` (3.2:1), Legende dimmt nur den Swatch (Text bleibt ≥4.5:1), `.g-fade:focus-visible` macht fokussierte Knoten sichtbar, Swatches tragen den Rand. |
| **Ladevorgänge waren für Screenreader stumm** (Spinner ohne Live-Region, kein `aria-busy`). | Umgesetzt: `busy()`-Texte laufen über die `#status`-Live-Region; der Ladering dreht sichtbar im Inhaltsbereich (Tabelle/Galerie/Graph) statt im Kopf. |
| **`lang="en"` nur auf Objekttyp-Namen** — die Erklärung behauptete flächendeckende Auszeichnung. | Teilweise umgesetzt: die Detailabfrage führt jetzt die Namenssprache mit; Merkmalnamen in Liste, Galerie, Brotkrume und H1 sind ausgezeichnet. Beschreibungen noch nicht — die Erklärung sagt das jetzt ehrlich. |
| **Erklärung zur Barrierefreiheit verfehlte eCH-0059 Anhang K** (keine Konformitätsaussage, keine Daten, GitHub-Konto als einzige Hürdenmeldung). | Umgesetzt: Konformitätsstatus «teilweise vereinbar», Erstell-/Prüfdatum, Bearbeitungsfrist, Hinweis auf E-Mail-Kanal vor Publikation. Eine eigene URL braucht die Erklärung erst mit echtem Routing (→ offen). |
| Galeriekarten waren *ein* Knopf mit dem ganzen Karteninhalt als Namen — dasselbe Muster, das die Liste bewusst vermeidet. | Umgesetzt: Karte ist ein `div`, der Name der Knopf; die Klickfläche deckt die Karte per CSS, der Inhalt bleibt erkundbar. |
| Aktuelle Brotkrume als `disabled`-Button («nicht verfügbar»). | Umgesetzt: `<span aria-current="page">`. |
| Dialog-Anfangsfokus mitten im Inhalt. | Umgesetzt: `autofocus` auf den Dialogtitel. |
| Facetten-Dropdown: Zuklappen hing allein an `focusout`/`relatedTarget` (bricht in Safari/Firefox-macOS), kein `aria-controls`. | Umgesetzt: `aria-controls`, `relatedTarget`-Guard, Schliessen per Klick ausserhalb. |
| Fokusverlust beim Entfernen von Filterpillen. | Umgesetzt: Fokus wandert zur nächsten Pille, sonst ins Suchfeld. |
| Kleinere Ziele (Legende ~21 px, Krumen ~23 px — WCAG 2.2-Ausblick). | Umgesetzt: `min-height: 24px` bzw. mehr Innenabstand. |
| Forced-Colors-Modus löschte Phasenkästchen, Swatches und den aktiven Umschalter. | Umgesetzt: `@media (forced-colors: active)` mit Zweitkodierung. |
| Fehler laufen über `role=status` (polite) statt `alert`. | Zur Kenntnis: beim Erstladen fängt der Fokus auf «Erneut versuchen» das ab; eine separate `alert`-Region bleibt offen (Abschnitt 9). |
| Tab-Spiessrutenlauf durch bis zu ~175 Graph-Knoten. | Offen: Roving-Tabindex wäre der saubere Umbau (Abschnitt 9). Die Textfassung und die Listenansicht tragen die Angaben vollständig. |

## 5. Interaktion und Informationsarchitektur

| Befund | Stand |
|---|---|
| **Facetten auf Detailebenen: sichtbar, aber wirkungslos** — und jede Änderung warf kommentarlos auf die Übersicht zurück (bis zu zwei Ebenen). Verstoss gegen E7 «ehrliche Filter». | Umgesetzt: Objekttyp-Ebene zeigt nur Suche + LOIN-Meilenstein (die dort wirken); Katalog-/Reifegrad-Facetten samt Pillen erscheinen nur auf der Übersicht. Filteränderungen wechseln die Ebene nicht mehr. |
| **Toolbar auf der Merkmal-Ebene:** Suche ohne Wirkung, View-Umschalter navigierte weg, `aria-pressed` log. | Umgesetzt: Toolbar, Pillen und Blätterleiste sind auf der Merkmal-Ebene ausgeblendet — die Ebene hat genau eine Darstellung. |
| **Blätterleiste stand veraltet unter dem Merkmaldetail** («40 Einträge · Seite 1 von 1»). | Umgesetzt (siehe oben); zusätzlich entfallen Seiten-Knöpfe bei einer einzigen Seite und die Pro-Seite-Auswahl unter 50 Einträgen. |
| **Jeder Such-Tipp-Burst erzeugte einen History-Eintrag** — der Zurück-Knopf führte durch Tippfragmente (entwertete E9). | Umgesetzt: `pushState` nur für Ebenen-/Ansichtswechsel; Suche, Facetten, Blättern nutzen `replaceState`. |
| **Deep-Link-Fehler scheiterten stumm** (falsche URI → stille Umleitung, Brotkrume «…», URL blieb kaputt); nach dem Nachladen eines verlinkten Merkmals fehlte der Fokus. | Umgesetzt: sichtbare Meldung «Der verlinkte Eintrag existiert in diesem Katalog nicht», URL wird bereinigt; nach dem Nachladen eines verlinkten Merkmals wandert der Fokus auf den Titel. Nebeneffekt: der `o=`-Parameter wird gegen den geladenen Bestand validiert, bevor er in die SPARQL-Abfrage eingebettet wird (schliesst den Injektionsweg über geteilte Links). |
| **Fokus-Scroll:** die fokussierte H1 landete hinter der klebenden Kopfzeile. | Umgesetzt: `scroll-margin-top` auf der H1. |
| Suche setzte Seite und Graph-Hervorhebung nicht zurück (leer wirkender Graph, Einstieg mitten im Ergebnis). | Umgesetzt: Suche verhält sich wie die Facetten. |
| «719 Treffer» verdoppelte die Kennzahl im Grundzustand; «Treffer» ohne Suche. | Umgesetzt: Zähler erscheint nur gefiltert, als «53 von 719». |
| Zeilenklick ohne Zeigersignal; Klick zerstörte eine Textauswahl beim Zitieren. | Umgesetzt: `cursor: pointer` auf klickbaren Zeilen; eine aktive Auswahl gewinnt vor der Navigation. |
| CSV: 60er-Grenze erst nach Klick, «ausgewählt» meinte das Filterergebnis, stiller Nichts-Tun-Fall bei 0 Treffern, bis zu 60 parallele Abfragen ohne Fortschritt. | Umgesetzt: präzisere Meldungen, Hinweis im Knopf-Tooltip, Bündel zu 6 Abfragen mit Fortschrittsansage («12 von 53 …»), benannter Abbruchfall. |
| Leerer Graph war eine 62-vh-Leinwand mit Kleingedrucktem. | Umgesetzt: der Null-Fall nutzt dieselbe Meldungsfläche wie der Zu-viele-Fall und sagt, was zu tun ist. |
| Brotkrume «Übersicht» vs. H1 «Objekttypen»; Fenstertitel mit Komma. | Umgesetzt: Wurzel heisst «Objekttypen», Titel-Trennzeichen ist der Halbgeviertstrich. |

## 6. Visuelles System

| Befund | Stand |
|---|---|
| **Datentyp-Chip trug Interaktionsgrün, war aber nicht klickbar** — Befund V3 kehrte als `token--fill` zurück. | Umgesetzt: neutraler Chip (Fläche/Tinte). Pine gehört wieder ausschliesslich der Interaktion. |
| **Sticky-Tabellenkopf verlor die Grundlinie beim Scrollen** (`border-collapse`-Eigenheit). | Umgesetzt: Linie als `box-shadow` an der Zelle. |
| **Doppelt geführte Palette** (`--c1..8` tot in tokens.css neben `K.FARBEN`), sieben hartkodierte Farben in main.css, Graphfarben in JS; `markiere()` setzte Präsentationsattribute, die CSS ohnehin übersteuert — die Kanten-Hervorhebung war funktionslos. | Umgesetzt: tote Tokens raus, Verweis auf `K.FARBEN` als einzige Palette; `--pine-linie`, `--pine-rand`, `--pine-bg-hover`, `--kante`, `--graph-pset`, `--hell-auf-dunkel`, Schatten-Tokens; Hervorhebung als Klassen-Toggle — sie funktioniert dadurch erstmals. |
| **Grundausstattung fehlte:** Favicon, Meta-Description, og:-Tags, theme-color. | Umgesetzt (SVG-Favicon als Data-URI, pine mit «DD»). |
| **Kein Print-Stylesheet** — für eine exportorientierte Zielgruppe. | Umgesetzt: `@media print` (Bedienung raus, Kopfwiederholung je Seite, Link-URLs in der Fusszeile, Karten ohne Zeilenklammer). |
| Vier Schriftgrössen ausserhalb der Skala (10/10/14/22). | Umgesetzt: 11/11/15/20. |
| Toter CSS-Code (`.element-name`, `.merkmal-name`, `.marke-zusatz`, `select:disabled`), Inline-Styles statt Klassen. | Umgesetzt: gelöscht bzw. in Klassen überführt. |
| Drei 30-px-Knopfvarianten mit drei Innenabständen, Standardknopf 14 px. | Umgesetzt: einheitlich `--s3` bzw. `--s4`. |
| `opacity .45` machte Legendentext (2.81:1) und den deaktivierten Export-Knopf schwer lesbar. | Umgesetzt: Zustands-Dimmen nur am Swatch; `disabled` auf 0.6. |
| Graphhöhe verdrängte auf kleinen Laptops Legende und Hinweis. | Umgesetzt: Höhen-Media-Query (<760 px). |
| Liste, Galerie und Detail zeigten dieselben Angaben in drei Reihenfolgen. | Umgesetzt: einheitlich Property Set → Datentyp → Reifegrad; Galerie-Reifegrad mit Erklär-Tooltip. Galerie ohne Meilenstein-Kästchen bleibt offen (Abschnitt 9). |
| Merkmaldetail-Karte (78ch) gegen vollbreiten Titelblock. | Zur Kenntnis: Lesebreite ist richtig; die gemeinsame rechte Kante wäre Feinschliff (Abschnitt 9). |

## 7. Texte (alle nutzersichtbaren Strings geprüft)

| Befund | Stand |
|---|---|
| **Anredeform kippte an fünf Stellen ins Du** («Starte lindas-proxy.py», «Grenze die Auswahl ein», «Springe zum Hauptteil», zwei Proxy-Texte). | Umgesetzt: durchgängig neutral-infinitiv. |
| **CORS-Fehlermeldung führte mit Technik statt Handlung** und riet auch Nutzenden einer gehosteten Instanz zum Proxy-Start. Die Gegenprüfung fand zudem: Proxy-502-Antworten wurden von der Regex fälschlich als CORS geroutet. | Umgesetzt: Handlung zuerst («Verbindung prüfen … VPN oder Proxy»), der Proxy-Hinweis erscheint nur noch bei `file://`; Proxy-502-Text neutral und ohne unerklärtes «INT». |
| **Sichtbare SPARQL-Kommentare** enthielten ASCII-Umlaute («haelt») und zweimal «Attribute»; Ergebnisvariable hiess `?attribut`. | Umgesetzt: echte Umlaute, «Merkmale», Variable `?merkmal`. |
| **Suchplatzhalter «Objekttyp oder Merkmal» stimmte auf keiner Ebene** (Befund K5 in neuer Form). | Umgesetzt: je Ebene «Objekttyp oder Beschreibung» / «Merkmal oder Property Set»; auf der Merkmal-Ebene gibt es kein Suchfeld mehr. |
| «Liefert keine Datentemplates» — RDF-Jargon im leeren Zustand. | Umgesetzt: «enthält keine Objekttypen … Namen des Graphen prüfen». |
| «Ohne Quellenangabe» widersprach der Terminologie «Katalog». | Umgesetzt: «Ohne Katalogangabe». |
| «Ansicht zurücksetzen» kollidierte mit der Umschaltergruppe «Ansicht». | Umgesetzt: «Ausschnitt zurücksetzen»; die Taste 0 ist jetzt im Hinweis dokumentiert. |
| «n Werte:» vs. «zulässige Werte» vs. «Zulässige Werte (n)». | Umgesetzt: durchgängig «zulässige Werte». |
| Mögliche «1 Merkmale» in Vorlesetexten und Graph-Zentrum. | Umgesetzt: `K.plural()`-Helfer an den Zählstellen. |
| Blättern: mehrdeutiges «Zurück», `aria-label` «Seiten». | Umgesetzt: `aria-label` «Vorherige/Nächste Seite», nav «Blättern». |
| «Fehlerverzeichnis auf GitHub» verengte den Rückmeldekanal. | Umgesetzt: «Meldung auf GitHub erfassen», Konto-Hürde benannt. |
| README: «welches Objekttyp braucht welche Attribute», Verweis auf nicht existierenden Knopf «Abfragen ansehen». | Umgesetzt in README.md. |
| Leere-Muster «keine …» vs. «ohne …». | Umgesetzt: durchgängig «ohne …» (bzw. «kein … deklariert» im Detail). |

## 8. Sicherheit, Robustheit, Betrieb

| Befund | Stand |
|---|---|
| **Proxy: `Access-Control-Allow-Origin: *` plus hinterlegte Zugangsdaten** — jede im Browser offene Website konnte über localhost mit den Zugangsdaten des Nutzers Abfragen an den geschützten Endpunkt schicken. | Umgesetzt: CORS-Header entfernt (der Proxy liefert das Frontend selbst aus, alles ist same-origin). |
| **Passwort als Kommandozeilenargument** (Prozessliste, Shell-History). | Umgesetzt: ohne `--password` wird per `getpass` gefragt. |
| **SPARQL-Injection über den `o=`-Hash-Parameter** (ungeprüft in `VALUES { <…> }`). | Umgesetzt über die Deep-Link-Validierung (Abschnitt 5): nur URIs aus dem geladenen Bestand erreichen die Abfrage. |
| Zwei Versionsidentitäten (Fusszeile «kbob-data 1.0.0», Proxy-UA «kbob-dd-explorer/2.0»). | Umgesetzt: einheitlich `kbob-data/1.0.0`. |
| Kein `<noscript>`-Hinweis — ohne JavaScript stand «wird geladen …» für immer. | Umgesetzt. |
| Keine Lizenz im Repo — die Zielgruppe (andere Verwaltungen) dürfte den Code nicht übernehmen. | Umgesetzt: MIT (passend zum Bezugssystem Oblique). |
| `fetch` ohne Timeout/Abbruch; Antwortrennen bei schnellem «Neu laden». | Offen (Abschnitt 9); das Einfrieren der Verbindung entschärft das Daten-Mischen bereits. |

## 9. Bewusst offen — mit Begründung

1. **Schriften lokal einbetten.** Google-Fonts-CDN übermittelt bei jedem
   Aufruf die IP an Google — für eine Behördenanwendung vor der Publikation
   zu beheben (WOFF2 ins Repo, `@font-face`; Oblique liefert Noto Sans aus).
   Nicht hier umgesetzt, weil es Binärdateien ins Repo legt — das ist ein
   bewusster Commit, kein Nebeneffekt eines Reviews.
2. **Roving Tabindex im Graphen** (ein Tab-Stopp, Pfeiltasten wechseln
   Knoten): richtiger Umbau gegen den Tab-Spiessrutenlauf, berührt aber
   Pan-Tasten und Fokusmodell zusammen — eigener, testbarer Schritt.
3. **UI-Wörterbuch** (alle Strings in ein Objekt): Voraussetzung für die
   absehbare FR-Fassung der Oberfläche (KBOB ist dreisprachig, I14Y
   publiziert mehrsprachig). Die **Datensprache** ist inzwischen umschaltbar
   (DE/FR/IT/EN in der Kopfzeile, Rückfallkette in den Abfragen) — offen
   bleibt die Übersetzbarkeit der Bedienoberfläche selbst.
4. **`owl:versionInfo` je Katalog mitladen** und in Fusszeile/CSV zeigen;
   ebenso die Frage, ob Klassen mehreren Quellen zugeordnet sein können
   (SAMPLE wählt heute still eine). Braucht Abfrageänderung plus Prüfung
   gegen den Graphen.
5. **Timeout/AbortController** für hängende Abfragen; eine `role=alert`-Region
   für Hintergrundfehler.
6. **SEO/Auffindbarkeit:** Hash-Routing macht Einträge für Suchmaschinen
   unsichtbar. Für die Publikation Pfad-Routing oder statische Indexseiten
   vorsehen — Hosting-Entscheid, nicht Frontend-Feinschliff.
7. **Galerie: Meilenstein-Kästchen** bei aktivem Filter; **gemeinsame rechte
   Kante** von Titelblock und Detailkarte — Feinschliff.
8. **Erklärung zur Barrierefreiheit** braucht mit der Publikation eine eigene
   URL und einen E-Mail-Kontakt der betreibenden Stelle.

## 10. Korrekturen an DESIGN.md (durch Quellenprüfung)

Die Recherche bestätigte die tragenden Behauptungen — eCH-0059 v3.0 verlangt
WCAG 2.1 AA (verbindlich seit 21.05.2021), das Nationale Glossar führt
«Merkmal» mit Quelle SIA 2051:2017 1.4.13, die Oblique-Werte stimmen für die
Angular-Bibliothek, der Graph liegt nachweislich nur auf INT, die
I14Y-Ankündigung «im Verlauf von 2026» steht so im Jahresbericht. Vier
Präzisierungen (in DESIGN.md nachgeführt):

- **«Eigenschaft gilt im Glossar als ‹normativ inkorrekt›» ist nicht belegt** —
  der Eintrag steht regulär im Glossar (Zuverlässigkeitscode «sprachlich
  überprüft»); das Codesystem kennt den Vermerk gar nicht.
- **«Attribut bezeichnet ausschliesslich IFC-Felder» gilt nur im IFC-Satz**
  des Glossars; die allgemeine Definition ist breiter. Stärkste normative
  Stütze für «Merkmal» ist SN EN ISO 23386:2020, 3.17 (Code «Normiert»).
- **E7 beschrieb die Phasenspalte falsch:** implementiert ist die
  Drittel-Regel, nicht «wenn überhaupt Phasen vorkommen».
- **«iDSK ist öffentlich nicht dokumentiert» ist überholt:** das
  Strategiepapier BIM 2025 der Abteilung Tiefbau des Kantons Aargau löst die
  Abkürzung auf («integraler Daten- und Strukturkatalog»). Die redaktionellen
  Kurztexte je Katalog (offene Frage 4) sind damit belegbar.
- Randnotiz Oblique: das Nachfolge-Designsystem stellt den Fokusring auf
  `#8b5cf6` als Outline um — die App nutzt bereits Outline; beim nächsten
  Abgleich die Farbe nachziehen.
