/* Abfragen, Laden und Normalisieren des KBOB Data Dictionary aus LINDAS.

   Zwei Stufen, damit beim Start nur wenig über die Leitung geht:
     L1  Übersicht — ein Datensatz je Objekttyp und Property Set (rund 800 Zeilen)
     L2  Detail    — die Attribute eines einzelnen Objekttyps, erst auf Abruf

   Alles haengt am gemeinsamen Namensraum KBOB. */

var KBOB = window.KBOB || (window.KBOB = {});

(function (K) {
  'use strict';

  var DD = 'https://lindas.admin.ch/fobl/kbob/dd-fm/vocab/';

  /* Datentypen des Katalogs in Alltagssprache */
  K.TYPEN = {
    STRING:  'Text',
    REAL:    'Zahl',
    INTEGER: 'Ganzzahl',
    BOOLEAN: 'Ja/Nein',
    TIME:    'Datum/Zeit'
  };

  /* QUDT-Einheiten auf gebraeuchliche Symbole */
  K.EINHEITEN = {
    M: 'm', M2: 'm²', M3: 'm³', MilliM: 'mm', CentiM: 'cm', KiloM: 'km',
    LUX: 'lx', LM: 'lm', CD: 'cd', 'CD-PER-M2': 'cd/m²',
    K: 'K', DEG_C: '°C', SEC: 's', MIN: 'min', HR: 'h', DAY: 'd', YR: 'a',
    PERCENT: '%', KiloN: 'kN', N: 'N', 'N-PER-M2': 'N/m²', PA: 'Pa',
    'M3-PER-HR': 'm³/h', 'M3-PER-SEC': 'm³/s',
    'W-PER-M2-K': 'W/(m²·K)', W: 'W', KiloW: 'kW', 'KiloW-HR': 'kWh',
    DEG: '°', RAD: 'rad', KiloGM: 'kg', TON: 't', L: 'l'
  };

  /* Kategoriale Palette, validiert gegen die Papierflaeche */
  K.FARBEN = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100',
              '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

  /* ---------- kleine Helfer ---------- */

  K.zahl = function (n) { return n.toLocaleString('de-CH'); };

  K.kurz = function (uri) {
    if (!uri) return '';
    var m = /[#\/]([^#\/]+)$/.exec(uri);
    return m ? m[1] : uri;
  };

  K.gekuerzt = function (text, n) {
    if (!text) return '';
    return text.length > n ? text.slice(0, n) + ' …' : text;
  };

  K.anker = function (uri) {
    return 'e-' + uri.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  };

  function v(row, name) { return row[name] ? row[name].value : ''; }

  function liste(row, name) {
    var s = v(row, name);
    return s ? s.split(' ').filter(Boolean).sort() : [];
  }

  /* Farben gelten immer nur innerhalb eines Objekttyps.

     Der Katalog hat 26 Property Sets, die Palette acht Farben. Eine
     katalogweite Zuordnung muesste also Farben mehrfach vergeben, und
     beliebige Paare kaemen nebeneinander zu stehen — in dieser Palette sind
     nicht alle Paare unterscheidbar genug (Orange/Rot, Orange/Gruen bei
     Rotsehschwaeche). Innerhalb eines Objekttyps dagegen liegen die Property
     Sets in fester Reihenfolge nebeneinander; genau fuer diese Nachbarschaft
     ist die Reihenfolge der Palette geprueft.

     Darum: Farbe ordnet die Attribute eines Objekttyps, sie ist kein
     katalogweiter Code. Ausserhalb eines Objekttyps werden die Chips
     entsprechend ohne Farbe gezeigt. */
  function farbenZuordnen(e) {
    e.farbe = {};
    e.psets.forEach(function (p, i) {
      e.farbe[p.name] = K.FARBEN[i % K.FARBEN.length];
    });
  }

  /* ---------- Abfragen ---------- */

  var PREFIXE = [
    'PREFIX dd:   <' + DD + '>',
    'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>',
    'PREFIX skos: <http://www.w3.org/2004/02/skos/core#>',
    'PREFIX dct:  <http://purl.org/dc/terms/>',
    'PREFIX qudt: <http://qudt.org/schema/qudt/>',
    ''
  ];

  /* L1: je Objekttyp und Property Set eine Zeile — ohne die Attribute selbst */
  K.uebersichtQuery = function (graph) {
    return PREFIXE.concat([
      '# Übersicht: Objekttypen mit ihren Property Sets, Anzahl Attribute,',
      '# vorkommenden Datentypen und Phasen. Die Attribute selbst holt erst',
      '# die Detailabfrage — das haelt den Start klein.',
      'SELECT ?klasse ?gop ?istDokument',
      '       (SAMPLE(?elementL)      AS ?element)',
      '       (SAMPLE(?beschreibungL) AS ?beschreibung)',
      '       (SAMPLE(?psetL)         AS ?pset)',
      '       (SAMPLE(?quelleL)       AS ?quelle)',
      '       (COUNT(DISTINCT ?prop) AS ?anzahl)',
      '       (GROUP_CONCAT(DISTINCT ?typRaw;   separator=" ") AS ?typen)',
      '       (GROUP_CONCAT(DISTINCT ?phaseRaw; separator=" ") AS ?phasen)',
      'FROM <' + graph + '>',
      'WHERE {',
      '  ?tpl a dd:DataTemplate ;',
      '       dd:appliesToClass         ?klasse ;',
      '       dd:hasPropertyRequirement ?pr .',
      '  ?pr  dd:requiresProperty       ?prop .',
      '',
      '  # Dokumenttypen sind ebenfalls Templates, aber keine Objekttypen',
      '  OPTIONAL { ?klasse a dd:DocumentType . BIND(true AS ?dok) }',
      '  BIND(COALESCE(?dok, false) AS ?istDokument)',
      '',
      '  OPTIONAL { ?pr  dd:inGroupOfProperties ?gop }',
      '  OPTIONAL { ?pr  dd:contextualDatatype  ?typRaw }',
      '  OPTIONAL { ?tpl dd:loinMilestone       ?phaseRaw }',
      '',
      '  OPTIONAL { ?klasse rdfs:label ?k1 FILTER(lang(?k1) = "de" || lang(?k1) = "") }',
      '  OPTIONAL { ?klasse rdfs:label ?k2 FILTER(lang(?k2) = "en") }',
      '  BIND(COALESCE(?k1, ?k2) AS ?elementL)',
      '',
      '  # Jeder Objekttyp im Graphen fuehrt eine Definition in Prosa',
      '  OPTIONAL { ?klasse skos:definition ?b1 FILTER(lang(?b1) = "de" || lang(?b1) = "") }',
      '  OPTIONAL { ?klasse rdfs:comment    ?b2 FILTER(lang(?b2) = "de" || lang(?b2) = "") }',
      '  OPTIONAL { ?klasse skos:definition ?b3 FILTER(lang(?b3) = "en") }',
      '  BIND(COALESCE(?b1, ?b2, ?b3) AS ?beschreibungL)',
      '',
      '  OPTIONAL { ?gop rdfs:label ?g1 FILTER(lang(?g1) = "de" || lang(?g1) = "") }',
      '  OPTIONAL { ?gop rdfs:label ?g2 FILTER(lang(?g2) = "en") }',
      '  BIND(COALESCE(?g1, ?g2) AS ?psetL)',
      '',
      '  OPTIONAL {',
      '    ?tpl dct:source ?q .',
      '    OPTIONAL { ?q rdfs:label ?q1 FILTER(lang(?q1) = "de" || lang(?q1) = "") }',
      '    OPTIONAL { ?q rdfs:label ?q2 FILTER(lang(?q2) = "en") }',
      '    BIND(COALESCE(?q1, ?q2) AS ?quelleL)',
      '  }',
      '}',
      'GROUP BY ?klasse ?gop ?istDokument'
    ]).join('\n');
  };

  /* L2: die Attribute eines Objekttyps */
  K.detailQuery = function (graph, klasse) {
    return PREFIXE.concat([
      '# Detail: alle Attribute eines Objekttyps.',
      'SELECT ?prop ?gop',
      '       (SAMPLE(?attributL)     AS ?attribut)',
      '       (SAMPLE(?beschreibungL) AS ?beschreibung)',
      '       (SAMPLE(?typRaw)        AS ?typ)',
      '       (SAMPLE(?psetL)         AS ?pset)',
      '       (SAMPLE(?ifcPsetRaw)    AS ?ifcPset)',
      '       (SAMPLE(?einheitRaw)    AS ?einheit)',
      '       (SAMPLE(?ifcRaw)        AS ?ifcTyp)',
      '       (SAMPLE(?schemaRaw)     AS ?werteSchema)',
      '       (GROUP_CONCAT(DISTINCT ?phaseRaw; separator=" ") AS ?phasen)',
      'FROM <' + graph + '>',
      'WHERE {',
      '  VALUES ?klasse { <' + klasse + '> }',
      '  ?tpl a dd:DataTemplate ;',
      '       dd:appliesToClass         ?klasse ;',
      '       dd:hasPropertyRequirement ?pr .',
      '  ?pr  dd:requiresProperty       ?prop .',
      '',
      '  OPTIONAL { ?tpl dd:loinMilestone      ?phaseRaw }',
      '  OPTIONAL { ?pr  dd:contextualDatatype ?typRaw }',
      '  OPTIONAL { ?pr  dd:inGroupOfProperties ?gop }',
      '',
      '  OPTIONAL { ?pr   dd:contextualUnit ?u1 }',
      '  OPTIONAL { ?pr   qudt:hasUnit      ?u2 }',
      '  OPTIONAL { ?prop qudt:hasUnit      ?u3 }',
      '  BIND(COALESCE(?u1, ?u2, ?u3) AS ?einheitRaw)',
      '',
      '  OPTIONAL { ?pr   dd:usesEnumerationScheme ?s1 }',
      '  OPTIONAL { ?prop dd:usesEnumerationScheme ?s2 }',
      '  BIND(COALESCE(?s1, ?s2) AS ?schemaRaw)',
      '',
      '  OPTIONAL { ?prop dd:ifcDatatype        ?ifcRaw }',
      '  OPTIONAL { ?prop dd:alignedWithIfcPset ?ifcPsetRaw }',
      '',
      '  OPTIONAL { ?prop rdfs:label     ?p1 FILTER(lang(?p1) = "de" || lang(?p1) = "") }',
      '  OPTIONAL { ?prop skos:prefLabel ?p3 FILTER(lang(?p3) = "de" || lang(?p3) = "") }',
      '  OPTIONAL { ?prop rdfs:label     ?p2 FILTER(lang(?p2) = "en") }',
      '  BIND(COALESCE(?p1, ?p3, ?p2) AS ?attributL)',
      '',
      '  OPTIONAL { ?prop skos:definition ?d1 FILTER(lang(?d1) = "de" || lang(?d1) = "") }',
      '  OPTIONAL { ?prop rdfs:comment    ?d2 FILTER(lang(?d2) = "de" || lang(?d2) = "") }',
      '  OPTIONAL { ?prop skos:definition ?d3 FILTER(lang(?d3) = "en") }',
      '  BIND(COALESCE(?d1, ?d2, ?d3) AS ?beschreibungL)',
      '',
      '  OPTIONAL { ?gop rdfs:label ?g1 FILTER(lang(?g1) = "de" || lang(?g1) = "") }',
      '  OPTIONAL { ?gop rdfs:label ?g2 FILTER(lang(?g2) = "en") }',
      '  BIND(COALESCE(?g1, ?g2) AS ?psetL)',
      '}',
      'GROUP BY ?prop ?gop'
    ]).join('\n');
  };

  K.werteQuery = function (graph) {
    return PREFIXE.concat([
      '# Zulaessige Werte je Werteliste',
      'SELECT ?schema (COUNT(DISTINCT ?ev) AS ?anzahl)',
      '       (GROUP_CONCAT(DISTINCT ?wert; separator=" · ") AS ?werte)',
      'FROM <' + graph + '>',
      'WHERE {',
      '  ?schema dd:hasEnumerationValue ?ev .',
      '  OPTIONAL { ?ev skos:prefLabel ?w1 FILTER(lang(?w1) = "de" || lang(?w1) = "") }',
      '  OPTIONAL { ?ev skos:prefLabel ?w2 FILTER(lang(?w2) = "en") }',
      '  OPTIONAL { ?ev skos:notation  ?w3 }',
      '  BIND(COALESCE(?w1, ?w2, ?w3) AS ?wert)',
      '}',
      'GROUP BY ?schema'
    ]).join('\n');
  };

  /* ---------- Abfrage ausfuehren ---------- */

  K.run = function (endpoint, query) {
    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/sparql-results+json'
      },
      body: 'query=' + encodeURIComponent(query)
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error('HTTP ' + r.status + ' — ' + t.slice(0, 300));
        });
      }
      return r.json();
    });
  };

  /* ---------- L1 uebernehmen ---------- */

  K.uebernehmeUebersicht = function (rows) {
    var st = K.state;
    if (rows && rows.length) st.rohUebersicht = rows;
    rows = st.rohUebersicht || [];
    if (!rows.length) return;

    var map = {};

    rows.forEach(function (r) {
      var uri = v(r, 'klasse');
      if (!uri) return;

      var e = map[uri];
      if (!e) {
        e = map[uri] = {
          uri: uri,
          name: v(r, 'element') || K.kurz(uri),
          quelle: v(r, 'quelle') || 'Ohne Quellenangabe',
          istDokument: v(r, 'istDokument') === 'true',
          anzahl: 0, psets: [], typen: [], phasen: [], farbe: {}
        };
      }

      var n = parseInt(v(r, 'anzahl'), 10) || 0;
      e.anzahl += n;
      e.psets.push({ uri: v(r, 'gop'), name: v(r, 'pset') || 'Ohne Property Set', n: n });

      liste(r, 'typen').forEach(function (t) {
        var klar = K.TYPEN[t] || t;
        if (e.typen.indexOf(klar) === -1) e.typen.push(klar);
      });
      liste(r, 'phasen').forEach(function (p) {
        if (e.phasen.indexOf(p) === -1) e.phasen.push(p);
      });
    });

    st.elemente = Object.keys(map).map(function (uri) {
      var e = map[uri];
      e.psets.sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); });
      e.typen.sort();
      e.phasen.sort();
      return e;
    });

    st.elemente.sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); });

    st.elemente.forEach(farbenZuordnen);
  };

  /* ---------- Wertelisten ---------- */

  K.uebernehmeWerte = function (rows) {
    var st = K.state;
    rows.forEach(function (r) {
      st.werte[v(r, 'schema')] = {
        anzahl: parseInt(v(r, 'anzahl'), 10) || 0,
        werte: v(r, 'werte')
      };
    });
    st.werteGeladen = true;
  };

  function trivialeJaNeinListe(werte) {
    var erlaubt = { 'true': 1, 'false': 1, 'ja': 1, 'nein': 1, 'yes': 1, 'no': 1 };
    return werte.split(' · ').every(function (w) {
      return erlaubt[w.trim().toLowerCase()] === 1;
    });
  }

  function einheitSymbol(raw) {
    if (!raw) return '';
    if (raw.indexOf('http') !== 0) return raw;       // bereits ein Symbol
    var seg = K.kurz(raw);
    return K.EINHEITEN[seg] || seg;
  }

  /* ---------- L2 uebernehmen ---------- */

  K.uebernehmeDetail = function (uri, rows) {
    var st = K.state;

    var attrs = rows.map(function (r) {
      var schema = v(r, 'werteSchema');
      var wl = schema ? st.werte[schema] : null;
      var typRaw = v(r, 'typ');

      /* Eine Ja/Nein-Liste aus genau true/false sagt nichts, was der Typ nicht
         schon sagt — sie wird ausgeblendet. Drei Werte (Ja/Nein/Optional) bleiben. */
      if (wl && typRaw === 'BOOLEAN' && trivialeJaNeinListe(wl.werte)) wl = null;

      return {
        uri: v(r, 'prop'),
        name: v(r, 'attribut') || K.kurz(v(r, 'prop')),
        beschreibung: v(r, 'beschreibung'),
        typRaw: typRaw,
        /* Eine Werteliste macht nur aus einem Text eine Auswahl. BOOLEAN fuehrt
           ebenfalls eine Liste (true/false, Ja/Nein) — das bleibt Ja/Nein. */
        typ: (wl && wl.anzahl && typRaw === 'STRING')
               ? 'Auswahl'
               : (K.TYPEN[typRaw] || typRaw || ''),
        psetUri: v(r, 'gop'),
        pset: v(r, 'pset') || 'Ohne Property Set',
        ifcPset: K.kurz(v(r, 'ifcPset')),
        einheit: einheitSymbol(v(r, 'einheit')),
        ifcTyp: v(r, 'ifcTyp'),
        liste: wl,
        phasen: liste(r, 'phasen')
      };
    });

    attrs.sort(function (a, b) {
      if (a.pset !== b.pset) return a.pset.localeCompare(b.pset, 'de');
      return a.name.localeCompare(b.name, 'de');
    });

    st.detail[uri] = attrs;
    return attrs;
  };

  /* Attribute eines Objekttyps besorgen — aus dem Zwischenspeicher oder vom Endpunkt.
     Die Wertelisten kommen einmalig beim ersten Detail mit. */
  K.holeDetail = function (endpoint, graph, uri) {
    var st = K.state;
    if (st.detail[uri]) return Promise.resolve(st.detail[uri]);

    var noetig = [K.run(endpoint, K.detailQuery(graph, uri))];
    if (!st.werteGeladen) {
      noetig.push(K.run(endpoint, K.werteQuery(graph)).catch(function () { return null; }));
    }

    return Promise.all(noetig).then(function (res) {
      if (res[1]) K.uebernehmeWerte(res[1].results.bindings);
      return K.uebernehmeDetail(uri, res[0].results.bindings);
    });
  };
})(KBOB);
