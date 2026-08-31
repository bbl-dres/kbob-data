# kbob-data

Browser-Explorer für das **KBOB Data Dictionary** aus dem LINDAS-Graphen
`https://lindas.admin.ch/fobl/kbob/dd-fm`.

Die Rohdaten sind für Datenmodellierer geschrieben: `PropertyRequirement`,
`GroupOfProperties`, `contextualDatatype`. Diese App übersetzt das in die
Sicht einer BIM-Managerin: **welches Objekttyp braucht welche Attribute, in
welchem Format, aus welchem Property Set.**

## Starten

```bash
python lindas-proxy.py          # http://localhost:8765
```

Der Proxy liefert das Frontend aus und leitet SPARQL an den Endpunkt weiter.
Weil Frontend und Abfrage dieselbe Origin haben, entfällt CORS. Der Katalog
lädt automatisch beim Öffnen der Seite.

```bash
python lindas-proxy.py --check                  # nur Erreichbarkeit testen
python lindas-proxy.py --user me --password xy  # Endpunkt mit Anmeldung
```

Ohne Proxy lässt sich `index.html` auch direkt öffnen — dann scheitert die
Abfrage aber meist an CORS.

## Navigation

Drei Stufen, über die Brotkrumen jederzeit umschaltbar:

    Katalog  ›  Quelle  ›  Objekttyp  ›  Attribut

Jede Stufe gibt es als **Liste**, **Galerie** (eine Karte je Eintrag) und
**Grafik** (Netz beziehungsweise radiale Darstellung eines Objekttyps).
Dazu Filter nach Phase und Datentyp sowie eine Volltextsuche; die jeweils
sichtbare Auswahl lässt sich als CSV speichern.

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
den KBOB Dokumenttypenkatalog. Letzterer stellt mit 666 Einträgen die
grosse Mehrheit der Klassen, ist aber ein Dokument- und kein Objekttypenkatalog —
über die Quellenstufe ist er sauber getrennt.

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
