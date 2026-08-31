# Code-Review: Performance, Komplexität, Robustheit

Stand: 31.08.2026 · betrifft `js/`, `css/`, `index.html`, `lindas-proxy.py`

Zweiter Prüfstrang neben dem Design-Review (REVIEW.md): der Code selbst,
aus der Sicht der Wartenden. Schwerpunkte laut Auftrag: Performance
(einschliesslich Lazy Loading) und die Zusammenführung ähnlichen Codes in
wiederverwendbare Funktionen.

---

## 1. Vorgehen

Vier Fachperspektiven parallel — Performance (mit Live-Messungen gegen den
INT-Endpunkt), Komplexität/Wiederverwendung, Robustheit (Fokus auf die
jüngsten Features), Architektur/Testbarkeit — danach jede Dimension
**adversarial gegengeprüft** (Auftrag: widerlegen) und eine
Vollständigkeitskritik über die Gesamtliste. Ergebnis: **53 bestätigte
Befunde**, keiner widerlegt; die Gegenprüfung korrigierte vor allem
Zeilenanker und zwei überzogene Begründungen.

Randbedingung aller Empfehlungen: kein Build-Schritt, keine Abhängigkeiten,
ES5-Stil mit einem Namensraum `KBOB` — dokumentierte Entscheidungen.

## 2. Gemessen, nicht geraten

| Was | Wert |
|---|---|
| Übersichtsabfrage, Serverzeit | ~1,9 s (Server-Timing `dur=1784 ms`) — der dominante Kostenblock |
| Übersichtsabfrage, Draht | 37 KB komprimiert / **1,34 MB** unkomprimiert |
| Wertelisten-Abfrage | 71 Listen, 48 KB roh / 7 KB Draht, 0,1 s |
| Detail (grösster Objekttyp) | 3,5 KB, 0,075 s |
| Filtern (719 Elemente) | 0,12 ms je Rendern |
| Sortieren | 0,03 ms |
| Listenrender | ~700 DOM-Elemente je Seite |
| Kräftelayout | 17,8 ms @150 Knoten, 23,9 ms @176 (Cap zählt Objekttypen, Property Sets kommen dazu) |
| JS gesamt | 112 KB roh / 33 KB gzip |

Die Konsequenz steht in Abschnitt 5: Client-seitig gibt es nichts
Nennenswertes zu optimieren — der Vollneuaufbau je Tastendruck liegt drei
Grössenordnungen unter dem 180-ms-Debounce und ist bei dieser Datenmenge
die richtige Architektur.

## 3. Umgesetzt

### Robustheit (die gewichtigsten Befunde)

| Befund | Fix |
|---|---|
| **Kaputtes Prozent-Encoding im Hash legte die App lahm** («#q=%» → URIError im laden-then → Dauerfehlerbild). | `dec()`-Helfer mit Rückfall auf den Rohwert; `r=`/`p=` werden jetzt auch symmetrisch kodiert geschrieben. |
| **Veraltete Detail-/Werte-Antworten vergifteten den Cache** nach Sprach- oder Endpunktwechsel (die Antwort des alten Graphen landete im frisch geleerten `st.detail`). | Generationszähler: `laden()` zählt hoch, `holeDetail` verwirft Antworten fremder Generationen vor jedem Cache-Schreiben; `ladeDetail`/Export prüfen ebenfalls. |
| **`laden()` fror die Verbindung erst zur Antwortzeit ein** — bei zwei schnellen Sprachwechseln konnte der falsche Response gewinnen und `verbindung.sprache` log. | Verbindungsstand wird zur **Anfrage**zeit eingefroren; späte Antworten älterer Generationen werden verworfen. |
| **Scheiterte nur die Wertelisten-Abfrage, drehte der Lade-Ring endlos** (Detail gelöscht, keine Abfrage mehr unterwegs, Warnung weggewischt). | `detailOhneWerte`-Markierung statt Löschen: die Tabelle erscheint, die Warnung bleibt stehen, das nächste Öffnen lädt vollständig nach. Die Meldung formuliert jetzt app.js, nicht die Datenschicht. |
| Doppelklick/Export-Bündel feuerten **identische Abfragen mehrfach** (bis zu 6× dieselbe werteQuery). | In-flight-Deduplizierung: laufende Detail- und Wertelisten-Versprechen werden geteilt. |
| `K.run` übernahm **jede 200er-Antwort blind** (Wartungsseite → «Unexpected token»). | Formprüfung: keine `results.bindings` → verständliche deutsche Meldung. |
| Deep-Link-Prüfung **vor Datenankunft** tilgte gültige Links mit falscher Meldung. | Prüfung erst, wenn `st.elemente` geladen ist. |
| Ungültiges `m=` bei **gecachtem** Detail: Phantom-Krume «…», kein Hinweis. | Dieselbe Prüfung wie im Ladepfad, jetzt auch in `ausUrl`. |
| `t=` wurde **nicht gegen die Ebene validiert** — stille Umsortierung ohne `aria-sort`. | Zwei Whitelists (Übersicht/Merkmale), je Ebene geprüft. |
| Brotkrume zurück zur Liste **verwarf die Sortierung**, Browser-Zurück behielt sie. | Sortier-Reset nur beim Wechsel zu einem *anderen* Objekttyp. |
| `st.hervor` überlebte popstate — Zurück konnte das Netz **komplett ausbleichen**. | `ausUrl` setzt die flüchtige Hervorhebung zurück. |
| Unsichtbare Unicode-Literale (BOM, kombinierende Zeichen) — ein Formatter hätte sie lautlos zerstört. | Als `﻿`/`̀-ͯ`-Escapes geschrieben. |
| Rohe englische Fetch-Fehler erreichten die Oberfläche (Detail/Export). | `fehlerText()`-Übersetzer für alle Fehlerpfade jenseits des Erstladens. |
| Export-Abbruchmeldung nannte immer das erste Element des Bündels. | Neutral: «beim Nachladen (Objekttypen 7–12)». |

### Performance und Lazy Loading

| Befund | Fix |
|---|---|
| **Der Proxy lud die Übersicht unkomprimiert — 1,34 MB statt ~40 KB (Faktor ~32), ausgerechnet im VPN-Szenario, für das er gedacht ist.** | `Accept-Encoding: gzip` plus Entpacken im Proxy (Standardbibliothek, auch im HTTPError-Zweig). |
| Doppelter `baueFacetten()`-Lauf beim Start. | Entfernt — `ausUrl()` baut die Facetten. |
| `st.rohUebersicht` hielt ~1–3 MB Rohdaten für einen **unerreichbaren** Wiedereintrittspfad. | Pfad und Feld entfernt. |
| Font-Gewicht 700 wurde geladen, die Typoskala endet bei 600. | Aus der Fonts-URL entfernt; `b, strong { font-weight: 600 }`. |

### Komplexität und Wiederverwendung

| Befund | Fix |
|---|---|
| 99 `createElement`-Stellen im identischen Vierzeiler-Muster. | **`K.e(tag, klasse, inhalt)`** und **`K.knopf(klasse, inhalt, onClick)`** (garantiert `type="button"`). Migriert: Galerie, Legende, Listen-Leerzeile, Sortierköpfe, Textfassung, Marken, Domänen-Zellen. Erklärte Politik: neuer Code nutzt die Helfer, Bestand wird beim Anfassen migriert — `gruppe()`/Pillen/`blaettere()` bleiben bewusst unangefasst (dichteste Fokus-/ARIA-Verdrahtung, höchstes Regressionsrisiko bei reinem Schönheitsgewinn). |
| Drei Fehler-/Lade-Kacheln bauten denselben Block von Hand — und drifteten bereits (fehlendes `type="button"`, Fokus nur an einer Stelle). | Gemeinsamer **`meldung(ziel, {titel, text, laedt, aktion})`**-Baustein für `zeigeFehler`, `zeigeDetailFehler` und `graphMeldung`. |
| `sichtbareAnsicht` kannte `view-merkmal` nicht; drei Stellen schalteten die vierte Ansicht von Hand. | Auf vier Container erweitert; `zeigeMerkmal` ruft `sichtbareAnsicht('merkmal')`. |
| `aria-pressed`-Schleife der Ansichtsknöpfe doppelt. | `ansichtKnoepfe(name)`. |
| `el.treffer` wurde an fünf Stellen geleert. | Einmal zentral in `zeichne()`. |
| Magic Numbers: Export-Limit 60 **dreifach über zwei Dateien**, Debounce 180, Bündel 6, Default 50. | `K.EXPORT_MAX`, `K.EXPORT_BUENDEL`, `K.SUCH_DEBOUNCE_MS`, `K.SEITENGROESSEN[0]`; der CSV-Tooltip wird aus der Konstante gesetzt und kann nicht mehr lügen. |
| Tote Reste: `K.state.laedt` (write-only), `K.anker` (IDs ohne Konsument), `titel()`-Hinweisparameter samt `#hinweis`-Element, `kataloge.merkmale`-Summe, `token--fill/status/outline`-Klassen (CSS längst vereinheitlicht), `.karte-quelle`/`k.sub`, `K.zeichneLegende`-Export. | Entfernt. |
| `localeCompare(…, 'de')` viermal ausgeschrieben. | `K.deCompare`/`K.nachName`. |
| Tooltip-Verdrahtung je Knoten in beiden Grafiken dupliziert. | `bindeTip(g, zeig)`. |
| `zeichneGalerie(karten, leerText, laedt)` — Boolean-Falle am Aufrufort. | Spec-Objekt `{karten, leerText, laedt}`. |
| `holeDetail(endpoint, graph, uri, lang)` — vier Positionsparameter, zweimal aus demselben Objekt entpackt. | `holeDetail(verbindung, uri)`. |
| Parameter `v` in `stufenFilter` verschattete den zentralen Zeilen-Accessor `v()`. | Umbenannt (`vn`). |

### Architektur, Betrieb, Härtung

| Befund | Fix |
|---|---|
| **Endpunkt-Default dreifach gepflegt; der Byte-Replace des Proxys brach bei jeder Formular-Änderung still** — die App lief dann am Proxy vorbei. | Der Proxy injiziert einen Marker (`window.KBOB_PROXY='/query'`) vor `</head>`; `verdrahten()` liest ihn. Übersteht jede Formatänderung. |
| `zeichneRadial` navigierte selbst (`K.geheZuMerkmal` aus views.js). | `onMerkmal`-Callback; der verbleibende `hervor`-Schreibzugriff der Radial-Legende ist als bewusste Ausnahme kommentiert. |
| `K.setStatus`-Aufruf aus der Datenschicht. | Entfernt — app.js meldet anhand von `detailOhneWerte`. |
| `K.state`-Ownership implizit. | Kommentarblöcke im Literal (data.js-Cachefelder vs. app.js-UI-Felder); `allePhasen` deklariert statt zur Laufzeit angehängt. |
| 41 Element-Ids als unüberwachter Vertrag mit index.html. | Start-Check wirft benannt («Element #x fehlt») statt spätem `null`-Zugriff. |
| Proxy: `/health` stürzte **genau im Diagnosefall** ab; `except`-Raster zu eng (Reset/IncompleteRead rissen den Thread). | try/except im Health-Pfad (Fehler wird Teil der Antwort), `OSError`/`HTTPException` ergänzt. |
| Keine CSP. | `script-src 'self'`, `object-src 'none'`, `base-uri 'none'` u. a. als Meta — zweite Verteidigungslinie hinter dem durchgehenden `textContent`-Rendering. |
| Domänen-Renderer (statusMarke & Co.) in app.js — richtig platziert, aber unmarkiert. | Abschnittsüberschrift macht die Grenze zu views.js als Absicht lesbar. |

### Tests

Neu: **`test/helfer.test.js`** — 11 Tests über die reinen Helfer und
Query-Invarianten (CSV-Injection-Entschärfung, Quoting, Dateinamen,
Wertelisten-Kürzung, Sprachketten, Query-Aufbau je Sprache, Katalog-Rang,
Auswahl-Ableitung samt Ja/Nein-Unterdrückung im Normalisierer). Dafür
wanderten `csvZelle` und `dateiname` als `K.csvZelle`/`K.dateiname` in die
DOM-freie data.js. Ausführen ohne Installation:

```bash
node --test test/helfer.test.js
```

## 4. Bewusst nicht umgesetzt

1. **sessionStorage-Cache der Übersicht.** Der einzige echte Hebel gegen die
   ~1,9 s Serverzeit je Start/F5/Sprachwechsel (~810 KB je Sprache, passt in
   die Quota). Aber: Er zeigt womöglich veralteten Stand einer Quelle, die
   sich ändert — eine Produktentscheidung über Frische, keine Optimierung.
   Umsetzungsskizze liegt im Befund; bei Bedarf ein kleiner, isolierter Schritt.
2. **URL-Parametertabelle** statt der spiegelbildlichen `inUrl`/`ausUrl`.
   Bei elf stabilen Parametern kauft die Tabelle Struktur für null Zeilen;
   die beiden Funktionen sind stattdessen per Kommentar aneinander
   gekoppelt. Erst bauen, wenn ein weiterer Parameter ansteht.
3. **Vollmigration auf `K.e`/`K.knopf`** (siehe oben): `gruppe()`, Pillen
   und `blaettere()` bleiben im Handmuster — dichteste ARIA-/Fokuslogik,
   reiner Schönheitsgewinn, echtes Abschreibfehler-Risiko.
4. **Netz/Radial auf Spec-Objekte** und ein `onHervor`-Callback: hängt am
   Legenden-Toggle zusammen; als Paket sinnvoll, einzeln nur Churn.
5. **Worker/rAF fürs Kräftelayout, Suchindex, gezieltes DOM-Update,
   IntersectionObserver:** gemessen wirkungslos (Abschnitt 2) — ausdrücklich
   verworfen, damit es niemand «optimiert».
6. **Schriften lokal** (Datenschutz): bleibt der offene Punkt aus REVIEW.md §9
   — Binärdateien gehören als bewusster Commit ins Repo, nicht als
   Review-Nebeneffekt.
7. `kbob-upstream`-Meta im Proxy für die INT-Heuristik der Fusszeile:
   **obsolet** — der Herkunftshinweis wurde auf Betreiberentscheid aus der
   Fusszeile entfernt.

## 5. Lazy Loading — geprüft und mit Zahlen verneint

Der ausdrückliche Prüfauftrag. Die App lädt bereits zweistufig (Übersicht
beim Start, Details je Objekttyp auf Abruf, Wertelisten einmalig beim ersten
Detail) — das **ist** die richtige Lazy-Strategie für diese Datenmenge. Die
fünf Kandidaten darüber hinaus:

| Kandidat | Befund |
|---|---|
| Wertelisten je Schema on demand | 71 Listen sind zusammen 7 KB Draht / 0,1 s — mehr Roundtrips für null Ersparnis. |
| Code-Splitting ohne Build | Ganzes JS = 33 KB gzip; bestenfalls ~9 KB später laden, gegen 1,9 s Datenwartezeit unmessbar. |
| Beschreibungen nachladen | ~59 KB Text von 1,34 MB roh, im 37-KB-Draht schon enthalten — spart einstellige KB, kostet Abfrage und Reflow. |
| Fonts | `display=swap` und preconnect vorhanden; Mono lädt ohnehin erst bei Verwendung. Einzig 700 war unnötig → entfernt. |
| IntersectionObserver statt Blättern | E7b deckelt bereits auf 50–200 Zeilen; nichts zu holen. |

Der einzige echte Transfer-Befund war der **unkomprimierte Proxy** (Faktor
~32, behoben); der einzige echte Zeit-Hebel bleibt der sessionStorage-Cache
(Abschnitt 4.1, Produktentscheid).
