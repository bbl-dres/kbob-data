# kbob-data

Browser-Explorer für das **KBOB Data Dictionary** aus dem LINDAS-Graphen
`https://lindas.admin.ch/fobl/kbob/dd-fm`.

Die Rohdaten sind für Datenmodellierer geschrieben: `PropertyRequirement`,
`GroupOfProperties`, `contextualDatatype`. Diese App übersetzt das in die
Sicht einer BIM-Managerin: **welcher Objekttyp welche Merkmale braucht, in
welchem Format, aus welchem Property Set.**

## Starten

Der Endpunkt schickt CORS-Header (`access-control-allow-origin` spiegelt die
Origin), daher genügt ein beliebiger statischer Server:

```bash
python -m http.server 8000      # http://localhost:8000
```

Wer den Endpunkt wechseln oder eine Anmeldung braucht, nimmt den Proxy:

```bash
python lindas-proxy.py                # http://localhost:8765
python lindas-proxy.py --check        # nur Erreichbarkeit testen
python lindas-proxy.py --user me      # Endpunkt mit Anmeldung; Passwort wird abgefragt
```

Der Proxy liefert das Frontend aus und leitet SPARQL weiter; Frontend und
Abfrage haben dann dieselbe Origin. Der Katalog lädt in beiden Fällen
automatisch beim Öffnen der Seite. Direkt per `file://` geöffnet scheitert
die Abfrage dagegen an CORS.

## Navigation

Eine flache, facettierte Liste aller Objekttypen — darunter die Merkmale
eines Objekttyps, darunter ein einzelnes Merkmal:

    Übersicht  ›  Objekttyp  ›  Merkmal

Der Katalog ist eine Facette, keine Navigationsstufe: 666 der 719 Objekttypen
stammen aus einer einzigen Quelle, dem Dokumenttypenkatalog.

Facetten (Mehrfachauswahl): **Katalog**, **Reifegrad**, **LOIN-Meilenstein**,
dazu eine Volltextsuche. Auf tieferen Ebenen erscheinen nur die Facetten, die
dort auch wirken. Aktive Filter stehen als Pillen über der Liste und lassen
sich einzeln wegnehmen. Jede Ebene gibt es als **Liste**, **Galerie** und
**Graph**; Liste und Galerie blättern zu 50, 100 oder 200 Einträgen, die
Listenspalten sortieren per Klick auf den Spaltenkopf.

Die Sprachwahl oben rechts (DE/FR/IT/EN) betrifft die **Katalogbeschriftungen**
(Rückfall: gewählte Sprache → Deutsch → Englisch); die Oberfläche selbst
bleibt vorerst deutsch.

Der Zustand steht in der URL — Ansichten sind teilbar, der Zurück-Knopf
funktioniert:

    #k=KBOB%20Data%20Dictionary%20FM&r=Candidate&q=raum
    #o=https%3A%2F%2Flindas.admin.ch%2F...%2Fclasses%2Froom&v=graph

## Was die Oberfläche ungefragt sagt

- **Reifegrad** je Objekttyp und Merkmal: im ganzen Katalog steht nichts auf
  «verabschiedet» — 677 Objekttypen sind *Candidate*, 42 *Preview*.
- **Keine Pflicht-/Kann-Unterscheidung**: alle 3 292 Merkmale sind
  gleichrangig vorgesehen (`requirementLevel` ist durchgehend `included`).
- **LOIN-Meilensteine** (LZP1–LZP9) sind dünn belegt und werden nur dort als
  Spalte gezeigt, wo sie etwas unterscheiden. Sie sind keine
  SIA-112-Projektphasen.
- Der ausgewertete Graph liegt auf der **Integrationsumgebung** und ist kein
  publizierter Stand.

## Zwei Abfragestufen

| Stufe | Abfrage | Umfang |
|---|---|---|
| Übersicht | eine Zeile je Objekttyp und Property Set | ~800 Zeilen, beim Start |
| Detail | die Merkmale eines Objekttyps | erst beim Öffnen des Objekttyps |
| Werte | zulässige Werte je Werteliste | einmalig beim ersten Detail |

Die Abfragen sind in der App unter «Verbindung und Abfrage» in der Fusszeile
einsehbar und kopierbar.

## Was der Graph enthält

Der Katalog vereint fünf Quellen: KBOB Data Dictionary FM, AG ATB iDSK
Pilot-Datenkatalog, Data Dictionary Flächenmanagement, RTE 26201 (VöV) und
den KBOB Dokumenttypenkatalog. Letzterer stellt mit 666 von 719 Einträgen
die grosse Mehrheit — er beschreibt Dokumenttypen, nicht Bauteile. Genau
darum heisst die Stufe neutral «Objekttyp»: der Katalog verwaltet beides.
Über die Quellenstufe sind sie sauber getrennt.

SHACL-Shapes gibt es im Graphen nicht; das Modell steckt in
`DataTemplate` → `PropertyRequirement` → `Property`.

## Dateien

    index.html        Gerüst
    css/tokens.css    Farben, Typografie, Abstände
    css/main.css      alles Übrige
    js/data.js        Abfragen, Laden, Normalisieren, Palette
    js/views.js       Liste, Galerie, Netz- und Radialgrafik
    js/app.js         Navigation, Facetten, Blättern, Export
    lindas-proxy.py   lokaler Proxy, nur Standardbibliothek
    test/             Tests der reinen Helfer (node --test test/helfer.test.js)
    DESIGN.md         Review, Entscheidungen und offene Fragen
    REVIEW.md         Design-/UX-Durchsicht: Befunde und Umsetzungsstand
    CODE-REVIEW.md    Code-Review: Performance, Komplexität, Robustheit
    LICENSE           MIT

Endpunkt, Named Graph und die drei Abfragen sind zur Laufzeit über
«Verbindung und Abfrage» in der Fusszeile einsehbar.
