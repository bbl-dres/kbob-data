# kbob-data

Browser-Explorer für das **KBOB Data Dictionary** aus dem LINDAS-Graphen
`https://lindas.admin.ch/fobl/kbob/dd-fm`.

Die Rohdaten sind für Datenmodellierer geschrieben: `PropertyRequirement`,
`GroupOfProperties`, `contextualDatatype`. Diese App übersetzt das in die
Sicht einer BIM-Managerin: **welches Objekttyp braucht welche Attribute, in
welchem Format, aus welchem Property Set.**

## Starten

Der Endpunkt schickt CORS-Header (`access-control-allow-origin` spiegelt die
Origin), daher genügt ein beliebiger statischer Server:

```bash
python -m http.server 8000      # http://localhost:8000
```

Wer den Endpunkt wechseln oder eine Anmeldung braucht, nimmt den Proxy:

```bash
python lindas-proxy.py                          # http://localhost:8765
python lindas-proxy.py --check                  # nur Erreichbarkeit testen
python lindas-proxy.py --user me --password xy  # Endpunkt mit Anmeldung
```

Der Proxy liefert das Frontend aus und leitet SPARQL weiter; Frontend und
Abfrage haben dann dieselbe Origin. Der Katalog lädt in beiden Fällen
automatisch beim Öffnen der Seite. Direkt per `file://` geöffnet scheitert
die Abfrage dagegen an CORS.

## Navigation

Drei Stufen, über die Brotkrumen jederzeit umschaltbar:

    Katalog  ›  Quelle  ›  Objekttyp  ›  Attribut

Jede Stufe gibt es als **Liste**, **Galerie** (eine Karte je Eintrag) und
**Graph** (Netz beziehungsweise radiale Darstellung eines Objekttyps).
Dazu Filter nach Phase und Datentyp sowie eine Volltextsuche; die jeweils
sichtbare Auswahl lässt sich als CSV speichern.

Objekttypen führen im Graphen durchgehend eine Definition in Prosa — die
Listen und Karten zeigen darum die Beschreibung statt der technischen
Property-Set-Namen. Quellen haben keine Beschreibung, dort stehen weiterhin
die Property Sets.

## Zwei Abfragestufen

| Stufe | Abfrage | Umfang |
|---|---|---|
| Übersicht | eine Zeile je Objekttyp und Property Set | ~800 Zeilen, beim Start |
| Detail | die Attribute eines Objekttyps | erst beim Öffnen des Objekttyps |
| Werte | zulässige Werte je Werteliste | einmalig beim ersten Detail |

Die Abfragen sind in der App unter «Verbindung und Abfrage» →
«Abfragen ansehen» einsehbar und kopierbar.

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
    css/tokens.css    Farben, Abstände, Palette
    css/main.css      alles Übrige
    js/data.js        Abfragen, Laden, Normalisieren
    js/views.js       Liste, Galerie, Netz- und Radialgrafik
    js/app.js         Navigation, Filter, Start
    lindas-proxy.py   lokaler Proxy, nur Standardbibliothek

Endpunkt, Named Graph und die drei Abfragen sind zur Laufzeit über
«Verbindung und Abfrage» in der Fusszeile einsehbar.
