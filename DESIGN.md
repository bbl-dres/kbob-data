# Design-Review und Überarbeitung

Stand: 31.08.2026 · betrifft `index.html`, `css/`, `js/`

Dieses Dokument hält fest, was geprüft wurde, was dabei herauskam, welche
Entscheidungen daraus folgen und was bewusst offen bleibt.

---

## 1. Ausgangslage

Die Anwendung erschliesst das KBOB Data Dictionary aus dem LINDAS-Graphen
`https://lindas.admin.ch/fobl/kbob/dd-fm`. Sie richtet sich an BIM-Manager,
Facility-Manager und Datenverantwortliche der öffentlichen Bauherren.

Der Graph enthält (geprüft, Stand der Abfrage):

| Grösse | Wert |
|---|---|
| Datenkataloge im Graphen | 7 |
| davon mit Datentemplates | 5 |
| Objekttypen | 719 |
| Attribute (Anforderungen) | 3 292 |
| Property Sets | 26 |
| Objekttypen mit Beschreibung | 719 von 719 |
| Objekttypen, die Dokumenttypen sind | 666 von 719 |
| Attribute mit Phasenangabe (LZP) | 91 von 3 292 |
| Anforderungsstufen (`requirementLevel`) | genau eine: `included` |

Zwei Eigenheiten prägen alles Weitere:

**Der Katalog ist schief.** 666 der 719 Objekttypen stammen aus einer einzigen
Quelle, dem KBOB Dokumenttypenkatalog, und tragen alle dieselben vier
Attribute. Die 53 fachlich interessanten Objekttypen (Gebäude, Raum, Brücke,
Beleuchtungsanlage …) verteilen sich auf die übrigen vier Quellen.

**Der Katalog kennt keine Pflicht.** Alle 3 292 Anforderungen stehen auf
`included`; eine Unterscheidung zwischen Muss- und Kann-Attribut existiert
nicht. Eine Projektphase deklarieren nur 91 Attribute.

---

## 2. Vision

> Ein publiziertes Nachschlagewerk, kein Graph-Browser.

Die Anwendung soll drei Fragen schnell und ohne Fachwissen über RDF
beantworten:

1. **Was muss dieser Objekttyp mitführen?** — Attribut, Datentyp, Einheit
   beziehungsweise zulässige Werte, Property Set samt IFC-Entsprechung.
2. **Woher kommt diese Anforderung?** — welcher Katalog, welche Quelle,
   welcher Stand.
3. **Wie nehme ich das mit?** — als Tabelle, als CSV, als teilbarer Link.

Sie soll dabei so genau sein wie die Daten und nicht genauer: wo der Katalog
nichts weiss, sagt die Oberfläche das, statt eine leere Trefferliste zu zeigen.

Leitsätze:

- **Ehrlichkeit vor Vollständigkeit.** Keine Filter, die nur leere Listen
  erzeugen können. Keine Formulierung, die eine Verbindlichkeit behauptet,
  die in den Daten nicht steht.
- **Der Gegenstand steht oben.** Jede Ansicht hat einen Titel, der benennt,
  was man gerade ansieht — nicht den Produktnamen.
- **Farbe bedeutet etwas.** Eine Farbe, eine Bedeutung.
- **Alles ist erreichbar.** Mit Tastatur, mit Screenreader, per Link.

---

## 3. Vorgehen

Vier Prüfungen, je aus einer anderen Perspektive, gegen den Code und gegen
gerenderte Bildschirmfotos aller Ansichten. Die Bilder in `.design-audit/`
zeigen den **Stand vor dieser Überarbeitung** und sind die Belegkette zu den
Befunden in Abschnitt 4:

- Barrierefreiheit gegen WCAG 2.2 AA
- Nutzungsforschung entlang vier Rollen (BIM-Manager, FM-Datenverantwortliche,
  Dokumentenverantwortliche, Erstbesucherin)
- Visuelle Gestaltung und Typografie
- Recherche zu schweizerischen Konventionen (Bund-CD, Fachsprache)

Zusätzlich eigene Messungen: Kontrastwerte, Layoutkosten des Kräftelayouts,
Abdeckungsabfragen im Graphen.

---

## 4. Befunde

### 4.1 Korrektheit — die Oberfläche widersprach den Daten

| # | Befund | Beleg |
|---|---|---|
| K1 | **Der Fehlerfall behauptete das Gegenteil von sich selbst.** Beim Scheitern der Abfrage blieb das Panel «Katalog wird geladen …» stehen, darüber eine rote Fehlerzeile. `el.empty.hidden` wurde nur im Erfolgsfall gesetzt. | `app.js`, nur eine Zuweisung, im `catch` keine |
| K2 | **Der Typ-Filter verwarf stillschweigend Treffer.** Die Optionen entstanden aus der Übersicht (`Text`, `Zahl` …), die Zeilen aber aus dem Detail, wo Text-Attribute mit Werteliste zu `Auswahl` werden. «Auswahl» war nicht wählbar, «Text» blendete alle Aufzählungen aus. | 695 der 719 Objekttypen führen mindestens ein Auswahl-Attribut |
| K3 | **Der Phasenfilter erzeugte Scheintreffer-Leere.** Nur 91 von 3 292 Attributen deklarieren eine Phase; jede Auswahl führte fast überall zu «Kein Treffer» — nicht unterscheidbar von einem Fehler. | Abfrage |
| K4 | **Der Untertitel behauptete eine Pflicht.** «Welche Attribute ein Objekttyp mitbringen *muss*» — die Daten kennen keine Pflichtstufe. | `requirementLevel` durchgehend `included` |
| K5 | **Die Suche versprach mehr, als sie konnte.** Platzhalter «Quelle, Objekttyp oder Attribut»; auf der Startebene wurden nur fünf Quellennamen durchsucht. Attribute sind vor dem Öffnen gar nicht geladen. | `sichtbareQuellen` |

### 4.2 Informationsarchitektur

- **A1 — Die Hierarchie folgte dem Graphen, nicht der Frage.** Quelle zuerst
  heisst: die 53 interessanten Objekttypen liegen drei Klicks tief, hinter
  einer Rateaufgabe («Ist *Raum* unter *KBOB Data Dictionary FM* oder unter
  *Data Dictionary Flächenmanagement*?» — beides plausibel).
- **A2 — Kein Zustand in der URL.** Nichts war verlinkbar, der Zurück-Knopf
  verliess die Anwendung. Für zwei der vier Rollen bricht damit der
  Arbeitsablauf.
- **A3 — Der CSV-Export traf den Bedarf nicht.** Entweder die Attribute *eines*
  Objekttyps oder die Objekttypen *ohne* Attribute. Wer die Attribute mehrerer
  Objekttypen braucht, lädt einzeln und fügt von Hand zusammen.
- **A4 — Das gemeinsame Schema der 666 Dokumenttypen war unsichtbar.** Alle
  tragen dieselben vier Attribute; man erfährt es nur, indem man fünf
  Dokumenttypen öffnet und die «4» bemerkt.
- **A5 — Die Galerie verdoppelte die Liste.** Auf Objekttyp-Ebene zeigt sie
  dieselben Felder, nur weniger pro Bildschirm. Ihren Wert hat sie dort, wo
  Prosa die Nutzlast ist: bei den Dokumenttypen.

### 4.3 Visuelles System

- **V1 — Keine Typoskala.** Elf Schriftgrössen für etwa fünf Rollen, vier davon
  halbe Pixel (10.5, 12.5, 13.5).
- **V2 — Die Hierarchie stand auf dem Kopf.** Grösstes Element war der
  Produktname (17px, konstant); der eigentliche Gegenstand («Raum, 40
  Attribute») erschien nur als 13px-Brotkrume.
- **V3 — Grün bedeutete zehn Dinge.** Links, Objekttypnamen, Kartentitel,
  Überschriften, aktive Ansicht, Fokusring, Graph-Knoten, Typ-Chip,
  Aufzählungen von Datentypen. In der Objekttyp-Liste war «Ja/Nein · Text ·
  Zahl» grün und *nicht* klickbar, eine Spalte daneben «Bauteil» grün und
  klickbar.
- **V4 — Rost bedeutete fünf Dinge**, darunter Fehler *und* den harmlosen
  «Auswahl»-Chip. Das einzige Rot der Seite markierte die banalste Aussage.
- **V5 — 1600px für vier Spalten.** In der Quellenliste klafften 450px
  zwischen Name und Zahl; die Zeile war nicht mehr verfolgbar. `.shell` war
  zudem nicht zentriert.
- **V6 — Rund 300px leeres Papier unter der Fusszeile**, weil kein
  Mindestlayout gesetzt war. Der stärkste «unfertig»-Eindruck im ganzen Satz.
- **V7 — Doppelter Code.** Die Blöcke für Galerie und Netz standen zweimal
  wortgleich in `main.css`; die beiden `.karte-zahl`-Regeln widersprachen sich.
- **V8 — Der Wurzelgraph war Dekoration.** 724 Punkte ohne lesbare
  Beschriftung; er sagte weniger als die fünfzeilige Tabelle daneben.

### 4.4 Barrierefreiheit (WCAG 2.2 AA)

Blockierend:

- **Der Graph war ausschliesslich mit der Maus bedienbar.** Knoten sind blosse
  `<g>`-Elemente ohne `tabindex`, die Legende ein `<span>` mit Klick-Handler.
  Das Hervorheben eines Property Sets gab es nirgends sonst.
- **Der Graph war für Screenreader ein einziges Bild.** `role="img"` mit einer
  festen Beschriftung — statt 719 Objekttypen beziehungsweise 40 Attributen.

Schwerwiegend:

- Keine Live-Region: Ladefortschritt und Fehler wurden nie angesagt.
- `role="button"` auf `<tr>` zerstörte die Tabellensemantik; die Zeile wurde
  zu einem Knopf, dessen Name die Aneinanderreihung aller Zellen ist.
- Fokus ging bei jeder Navigation verloren (`innerHTML = ''`).
- Zoomen nur per Mausrad, Verschieben nur per Ziehen (SC 2.5.7).
- Der Tooltip war die einzige Quelle mancher Angaben, nur per Hover erreichbar,
  nicht schliessbar — und als `role="status"` flutete er die Live-Region.
- Kontrast: `--rule` **1.31:1** (einzige Umrandung aller Eingabefelder),
  `.leer` **1.53:1**, Graph-Kanten **1.39–1.52:1**, Punktfarben auf Weiss
  **2.17–2.82:1**.
- `.attr-desc { display: none }` unter 980px löschte Information beim Zoomen
  (SC 1.4.10).

### 4.5 Leistung

Das Kräftelayout ist O(N²) und lief synchron bei **jedem Tastendruck** in der
Suche:

| Knoten | Dauer |
|---|---|
| 15 | 4 ms |
| 60 | 6 ms |
| 150 | 13 ms |
| **724** | **219 ms** |

---

## 5. Entscheidungen

### E1 — Flach und facettiert statt Quelle-zuerst

Die Startebene zeigt **alle 719 Objekttypen**, eingegrenzt über Facetten. Der
Katalog wird von einer Navigationsebene zu einem Filter. Damit ist *Raum* ein
Schritt statt drei entfernt. Die Brotkrume — als eigenes Band unter der Kopfzeile — bleibt für den Weg nach unten
(Objekttyp → Merkmal) erhalten.

Begründung: Bei 666 zu 53 ist die Quelle keine sinnvolle Gliederung, sondern
eine Hürde.

**Nachtrag:** In der Standardreihenfolge stehen die Bauobjekte vor den
Dokumenttypen (und der Dokumenttypenkatalog zuletzt in der Katalog-Facette) —
die 53 fachlichen Objekttypen sind der häufigere Einstieg und sollen nicht
vom Alphabet der 666 Dokumenttypen verdrängt werden. Eine explizite
Spaltensortierung übersteuert das.

### E2 — Drei Facetten, als Auswahlfelder mit Mehrfachauswahl

**Katalog**, **Reifegrad**, **Projektphase** — je ein Auswahlfeld mit
Kontrollkästchen, alle in einer Zeile, die Suche zuvorderst. Innerhalb einer
Gruppe gilt ODER, zwischen den Gruppen UND.

Keine Seitenleiste: bei drei Gruppen wäre sie überwiegend leer und nähme der
Tabelle Breite weg, die diese dringender braucht. Ab etwa sechs Gruppen kippt
diese Rechnung.

Keine Facette **Datentyp** — die Frage «zeig mir alle Zahlen-Merkmale» stellt
im Zielpublikum niemand; der Datentyp ist Detail, nicht Einstieg.

Keine Facette **Art** (Bauobjekt/Dokumenttyp): der Dokumenttypenkatalog *ist*
ein Katalog, die Katalogfacette leistet dasselbe ohne zweite Systematik.

### E3 — Farbrollen

| Rolle | Farbe | Verwendung |
|---|---|---|
| Interaktion | `--pine` | Links, aktive Ansicht, Fokus — **nur** das |
| Fehler | `--rust` | ausschliesslich Fehlerzustände |
| Text | `--ink` / `--muted` | alle Namen und Werte, auch in Tabellen |
| Kategorien | 8er-Palette | nur innerhalb eines Objekttyps |

Der «Auswahl»-Chip und die Werteanzahl verlieren ihr Rot. Namen in Tabellen
und Karten werden Tinte statt Grün; klickbar sind sie durch Unterstreichung
beim Überfahren und einen echten Knopf, nicht durch Farbe.

### E4 — Typoskala

Sechs Stufen, keine halben Pixel:

| px | Gewicht | Rolle |
|---|---|---|
| 11 | 600, Versalien, +0.06em | Tabellenköpfe, Feldbeschriftungen |
| 12 | 400 | Metadaten, Zähler, Fusszeile |
| 13 | 400 | Fliesstext, Beschreibungen (≤ 62 Zeichen) |
| 15 | 500 | Werte, Namen in Zeilen |
| 20 | 600 | Abschnittstitel |
| 26 | 600, −0.02em | **der Gegenstand der Ansicht** |

Schrift: **Noto Sans**. Das Design System des Bundes liefert Frutiger Neue LT
Pro und legt Noto Sans als ausgelieferte Schrift bei; Noto Sans ist frei
verfügbar, hat eine grössere x-Höhe als Archivo und trennt 400/500/600
deutlicher — beides zählt bei 13px in Tabellen.

### E4b — Benennung

Das Werk heisst **KBOB Data Dictionary** — so führen es die Beschriftungen im
Graphen und KBOBs eigene Repositorien (`KBOB-data-dictionary`). Eine
Zwischenfassung nannte es «Datenkatalog FM» nach der Formulierung im
Jahresbericht; das war eine Verschlimmbesserung.

Der Export hiess zunächst **«Für Excel speichern»**, nicht «Als CSV
speichern»: das Zielpublikum denkt in Excel. Die Datei *ist* eine CSV
(Semikolon, BOM, CRLF) und öffnet direkt in Excel. **Nachtrag:** Der Knopf
heisst inzwischen **«Als Excel exportieren»** — «exportieren» benennt die
Handlung klarer; dass technisch eine CSV entsteht, sagt weiterhin der
Tooltip.

### E5 — Titelblock je Ansicht

Der Produktname wird zur 13px-Dachzeile. Der Gegenstand der Ansicht wird zur
26px-Überschrift im Inhaltsbereich, mit einer Zeile Kennzahlen darunter. Das
war der mit Abstand wirksamste Einzelbefund: es schafft einen Einstiegspunkt,
dreht die Hierarchie richtig herum und entfernt zwei Dopplungen (Statuszeile
und Zähler sagten dasselbe).

### E6 — Der Wurzelgraph entfällt

Er kostete 219 ms je Tastendruck und zeigte weniger als die Tabelle. Der Graph
bleibt dort, wo er trägt: als radiale Darstellung **eines** Objekttyps. Auf
der Übersichtsebene tritt an seine Stelle eine Verteilungsgrafik der Kataloge.

### E7 — Ehrliche Filter und sichtbarer Reifegrad

Der Phasenfilter erscheint nur, wenn es überhaupt Phasen zu wählen gibt. Die
Datentyp-Ableitung ist in Übersicht und Detail identisch, `Auswahl`
eingeschlossen — vorher filterte die Übersicht an den eigenen Zeilen vorbei.

**Reifegrad** (`dd:status`) wird durchgehend gezeigt: als Spalte, als Facette,
im Merkmaldetail und im Export. Im ganzen Katalog steht nichts auf
«verabschiedet» — 677 Objekttypen sind *Candidate*, 42 *Preview*. Wer daraus
ein Pflichtenheft macht, muss das sehen können.

**LOIN-Meilensteine** erscheinen als kompaktes Feld aus neun Kästchen (dunkel =
deklariert; jedes Kästchen trägt den vollen Wert «LZPn» als Tooltip). Neun
Werte passen anders in keine Tabellenspalte; die Vorlesefassung nennt die
deklarierten Werte ausgeschrieben. Die Spalte erscheint, wenn ein
Meilenstein-Filter aktiv ist oder mindestens ein Drittel der sichtbaren
Zeilen Meilensteine deklariert — darunter wäre sie fast nur Leerfläche.

### E7b — Blättern statt endloser Listen

50 · 100 · 200 Einträge je Seite, 50 als Vorgabe; Seitenwahl mittig,
Seitengrösse rechts. Ohne das rendert die Übersicht 719 Karten auf einmal —
bei jedem Tastendruck neu.

### E7c — Sparsame Hinweise

Ein früher Entwurf setzte über jede Ansicht einen Hinweiskasten (Reifegrad,
Pflicht/Kann). Das wiederholt, was Spalte und Facette ohnehin zeigen, und
liest sich nach drei Seiten wie eine Ermahnung. Geblieben ist ein Satz in der
Einleitung der Übersicht — dort, wo er einmal gelesen wird.

### E8a — Fachsprache nach dem nationalen Glossar

Das *Nationale Glossar zur Digitalisierung in der Bau- und Immobilien­wirtschaft*
(bSCH/CRB/SIA) führt **Merkmal** als Oberbegriff für Attribute und
Eigenschaften, mit Quelle SIA 2051:2017 §1.4.13; die stärkste normative
Stütze ist SN EN ISO 23386:2020, 3.17 (Merkmale in vernetzten Datenkatalogen).
Im IFC-Kontext unterscheidet das Glossar zwischen Attributen (feste
IFC-Felder) und Eigenschaften — für das, was dieser Katalog beschreibt, ist
«Attribut» darum die falsche Vokabel. *(Präzisiert in der zweiten Durchsicht:
eine frühere Fassung behauptete, «Eigenschaft» gelte im Glossar als «normativ
inkorrekt» und «Attribut» bezeichne ausschliesslich IFC-Felder — beides ist
in der Quelle so nicht belegt; siehe REVIEW.md §10.)*

Umbenennung: **Attribut → Merkmal**. Beibehalten, weil bereits korrekt:
*Objekttyp*, *Datentyp*, *Zulässige Werte*, *Einheit*, *Property Set* (dort,
wo es tatsächlich an ein IFC-`Pset_` gebunden ist — so hält es auch der SBB-
Fachdatenkatalog). Für LOIN ist der normierte Begriff
**Informationsbedarfstiefe** (SN EN 17412-1:2020).

**Zweite Durchsicht, korrigiert:** Das Bedienelement hiess zunächst neutral
«Projektphase». Das Feld heisst im KBOB-Schema aber `dd:loinMilestone` mit
dem Label **«LOIN-Meilenstein»** — und «Projektphase» mit den Werten 1–9
liest ein Schweizer BIM-Publikum zwanglos als SIA-112-Phasen, die es nicht
sind. Facette und Spalte heissen darum jetzt **LOIN-Meilenstein**; die Werte
`LZP1`–`LZP9` bleiben unveränderte Datenwerte (in den Kästchen als Ziffer,
der volle Wert im Tooltip). Ob «Lebenszyklusphase (LZP)» die bessere
Publikumsbezeichnung wäre, ist als Frage an die Datenherausgeber offen
(Abschnitt 8).

### E8b — Oblique als Bezugssystem, nicht als Abhängigkeit

Der Bund führt zwei Systeme: *swiss/designsystem* für admin.ch-Auftritte und
**Oblique** (BIT, MIT-Lizenz) für **Fachanwendungen**. Ein Datenkatalog ist
eine Fachanwendung. Übernommen werden Werte, nicht der Paketbezug:

- Schrift `"Noto Sans", Arial, system-ui, sans-serif` (Oblique liefert Noto Sans aus)
- Abstandsskala 4·8·12·16·24·32·48 — stimmte bereits überein
- Eckenradius 4px, Fokusring `0 0 0 3px #8655f6`
- Haltepunkte 600 · 905 · 1240 · 1440

Nicht übernommen: das Bundesrot `#d8232a` als Primärfarbe. In einem Werkzeug,
dessen einziges Rot Fehler markiert, würde es die Fehlerfarbe entwerten.

### E8c — Zwei Sprachen, nicht vier

Der Graph führt Beschriftungen zu 95 % auf Englisch und 74 % auf Deutsch, aber
nur zu **2,7 % auf Französisch** und **0,3 % auf Italienisch**. Ein
Sprachumschalter DE/FR/IT wäre ein Versprechen, das die Daten nicht halten.
Die Oberfläche bleibt deutsch, greift auf Englisch zurück und **kennzeichnet
zurückgefallene Beschriftungen mit `lang="en"`** (WCAG 3.1.2).

**Nachtrag:** Die Kopfzeile führt inzwischen eine Sprachwahl **DE/FR/IT/EN für
die Katalogbeschriftungen** (Rückfallkette gewählte Sprache → Deutsch →
Englisch, Zustand in der URL als `l=`). Sie ist ausdrücklich als Datensprache
beschriftet — die Bedienoberfläche bleibt deutsch, bis die UI-Texte in ein
übersetzbares Wörterbuch überführt sind (REVIEW.md §9). Damit hält der
Umschalter nur, was die Daten hergeben, statt eine Übersetzung zu behaupten.

### E8d — Verbindlicher Standard

Massgebend ist **eCH-0059 v3.0**, vom Bund am 21.05.2021 als verbindliche
IKT-Vorgabe erklärt: **WCAG 2.1 Stufe AA**. Dazu gehört eine auffindbare
**Erklärung zur Barrierefreiheit** — sie fehlte und kommt in die Fusszeile.

### E9 — Zustand in der URL

`#/objekttyp/<id>` und `#/objekttyp/<id>/attribut/<id>`, dazu Filter als
Parameter. Damit werden Ansichten teilbar und der Zurück-Knopf funktioniert.

---

## 6. Bewusst nicht umgesetzt

- **Bund-CD vollständig übernehmen.** Die Anwendung ist ein Fachwerkzeug, kein
  admin.ch-Auftritt; das Bundesrot als Primärfarbe würde Fehlerzustände
  unlesbar machen. Übernommen werden Schrift und Grauwerte, nicht die
  Signalfarbe.
- **Mehrsprachigkeit.** Die Daten führen de/fr/it/en. Ein Sprachumschalter
  wäre für einen Bundesdienst zu erwarten, ist aber ein eigener Arbeitsschritt
  (Abfragen sind bereits sprachparametrisiert vorbereitet).
- **Vergleich zweier Objekttypen**, **IFC-orientierte Sicht** (nach IFC-Pset
  statt KBOB-Pset), **IDS-Export**. Sinnvoll, aber eigener Umfang.
- **Taxonomie der Dokumenttypen.** Der Graph enthält eine dreistufige
  Gliederung (98 Knoten, B/K/O/V — «Konzepte und Beschriebe», «Verträge und
  Kosten», «Organisation», «Visualisierungen»). Sie wäre die richtige
  Navigation für die 666 Dokumenttypen und ist der stärkste Kandidat für den
  nächsten Schritt.

---

## 7. Einordnung

KBOB nennt das Werk selbst **«Datenkatalog FM»**. Der hier ausgewertete Graph
liegt **nur auf der Integrationsumgebung** (`int.lindas.admin.ch`); auf der
produktiven LINDAS-Instanz ist er leer. Die Veröffentlichung ist laut
KBOB-Jahresbericht über **I14Y im Verlauf von 2026** vorgesehen.

**Nachtrag:** Der SPARQL-Dienst ist inzwischen auf I14Y verzeichnet
(«KBOB FM Data Dictionary SPARQL»); die Fusszeile verlinkt den Eintrag.
Der frühere Warnhinweis samt Abfragezeitpunkt ist auf Entscheid des
Betreibers aus der Fusszeile entfallen.

## 8. Offene Fragen an die Datenherausgeber

1. Ist `requirementLevel` dauerhaft `included`, oder ist eine Muss/Kann-
   Unterscheidung vorgesehen? Ohne sie kann das Werkzeug die häufigste Frage
   der BIM-Manager nicht beantworten.
2. Sollen die LOIN-Meilensteine (LZP) flächendeckend gepflegt werden? Aktuell
   tragen sie 2,8 % der Merkmale — alle aus dem AG-ATB-iDSK-Pilot.
3. Was ist die autoritative Definition der Werte `LZP1`–`LZP9` (neunstufiges
   Lebenszyklusmodell?), und wie sollen sie dem Publikum gegenüber heissen —
   «LOIN-Meilenstein» (Schema-Label) oder «Lebenszyklusphase (LZP)»?
4. Die Beschreibungen der Property Sets sind uneinheitlich: teils Prosa
   («Informations- und Verwaltungsmerkmale aus dem Aargau iDSK»), teils
   Platzhalter («PropertySetName  KBOB_Identification»).
5. Die Quellen (`dd:DataDictionary`) führen keine Beschreibung, nur
   `owl:versionInfo`. Ein Kurztext je Katalog würde die Einstiegsebene tragen —
   für den iDSK liefert das «Strategiepapier BIM 2025» der Abteilung Tiefbau
   des Kantons Aargau inzwischen eine zitierfähige Auflösung («integraler
   Daten- und Strukturkatalog»).

## 9. Zweite Durchsicht

Am 31.08.2026 wurde die überarbeitete Anwendung ein zweites Mal geprüft —
empirisch im Browser und aus sechs Fachperspektiven mit adversarialer
Gegenprüfung. Befunde, Umsetzungsstand und die daraus folgenden Korrekturen
an diesem Dokument stehen in **REVIEW.md**.
