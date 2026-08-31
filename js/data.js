/* Abfragen, Laden und Normalisieren des KBOB Data Dictionary aus LINDAS.

   Zwei Stufen, damit beim Start nur wenig über die Leitung geht:
     L1  Übersicht — ein Datensatz je Objekttyp und Property Set (rund 800 Zeilen)
     L2  Detail    — die Merkmale eines einzelnen Objekttyps, erst auf Abruf

   Alles haengt am gemeinsamen Namensraum KBOB. */

var KBOB = window.KBOB || (window.KBOB = {});

(function (K) {
  'use strict';

  K.VERSION = '1.0.0';

  var DD = 'https://lindas.admin.ch/fobl/kbob/dd-fm/vocab/';

  /* Datentypen des Katalogs in Alltagssprache */
  K.TYPEN = {
    AUSWAHL: 'Auswahl',
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

  /* Kürzt eine mit « · » verkettete Werteliste an einer Wertgrenze —
     halbe Werte sähen aus wie echte Katalogwerte. */
  K.kurzListe = function (werte, n) {
    if (!werte || werte.length <= n) return werte || '';
    var teile = werte.split(' · ');
    var behalten = [], laenge = 0;
    for (var i = 0; i < teile.length; i++) {
      if (laenge + teile[i].length > n && behalten.length) break;
      behalten.push(teile[i]);
      laenge += teile[i].length + 3;
    }
    var rest = teile.length - behalten.length;
    return behalten.join(' · ') + (rest > 0 ? ' … +' + rest + ' weitere' : '');
  };

  K.plural = function (n, einzahl, mehrzahl) {
    return n === 1 ? einzahl : mehrzahl;
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

  /* ---------- Sprachketten ----------

     Beschriftungen folgen der Kette: gewählte Sprache, dann Deutsch (auch
     ungetaggte Literale), dann Englisch. Für 'de' ist das die bisherige
     zweistufige Kette; 'en' bevorzugt Englisch vor Deutsch. Der Umschalter
     betrifft die Katalogdaten — die Oberfläche selbst bleibt deutsch. */

  K.SPRACHEN = ['de', 'fr', 'it', 'en'];

  function sprachStufen(lang) {
    var stufen = [];
    if (lang && lang !== 'de' && K.SPRACHEN.indexOf(lang) !== -1) stufen.push(lang);
    stufen.push('de');
    if (lang !== 'en') stufen.push('en');
    return stufen;
  }

  function stufenFilter(v, stufe) {
    return stufe === 'de'
      ? 'lang(' + v + ') = "de" || lang(' + v + ') = ""'
      : 'lang(' + v + ') = "' + stufe + '"';
  }

  /* OPTIONAL-Zeilen für ein Prädikat über alle Stufen */
  function kette(subjekt, praedikat, basis, stufen) {
    var zeilen = [], vars = [];
    stufen.forEach(function (stufe, i) {
      var v = '?' + basis + i;
      vars.push(v);
      zeilen.push('  OPTIONAL { ' + subjekt + ' ' + praedikat + ' ' + v +
                  ' FILTER(' + stufenFilter(v, stufe) + ') }');
    });
    return { zeilen: zeilen, vars: vars };
  }

  function coalesce(vars, ziel) {
    return '  BIND(COALESCE(' + vars.join(', ') + ') AS ' + ziel + ')';
  }

  /* Welche Stufe hat getroffen? gruppen: je Stufe die Variablen dieser Stufe. */
  function sprachBind(gruppen, stufen, ziel) {
    var ausdruck = '"' + stufen[stufen.length - 1] + '"';
    for (var i = stufen.length - 2; i >= 0; i--) {
      var bedingung = gruppen[i].map(function (v) { return 'BOUND(' + v + ')'; }).join(' || ');
      ausdruck = 'IF(' + bedingung + ', "' + stufen[i] + '", ' + ausdruck + ')';
    }
    return '  BIND(' + ausdruck + ' AS ' + ziel + ')';
  }

  /* Beschreibung: skos:definition je Stufe, rdfs:comment als deutscher
     Zusatz-Rückfall direkt nach der deutschen Definition. */
  function beschreibungKette(subjekt, basis, stufen) {
    var def = kette(subjekt, 'skos:definition', basis, stufen);
    var zeilen = def.zeilen.slice();
    zeilen.push('  OPTIONAL { ' + subjekt + ' rdfs:comment ?' + basis +
                'k FILTER(lang(?' + basis + 'k) = "de" || lang(?' + basis + 'k) = "") }');
    var reihenfolge = [];
    stufen.forEach(function (stufe, i) {
      reihenfolge.push(def.vars[i]);
      if (stufe === 'de') reihenfolge.push('?' + basis + 'k');
    });
    return { zeilen: zeilen, vars: reihenfolge };
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

  /* L1: je Objekttyp und Property Set eine Zeile — ohne die Merkmale selbst */
  K.uebersichtQuery = function (graph, lang) {
    var stufen = sprachStufen(lang);
    var kl = kette('?klasse', 'rdfs:label', 'k', stufen);
    var be = beschreibungKette('?klasse', 'b', stufen);
    var gp = kette('?gop', 'rdfs:label', 'g', stufen);
    var qu = kette('?q', 'rdfs:label', 'q', stufen);
    return PREFIXE.concat([
      '# Übersicht: Objekttypen mit ihren Property Sets, Anzahl Merkmale,',
      '# vorkommenden Datentypen und LOIN-Meilensteinen. Die Merkmale selbst',
      '# holt erst die Detailabfrage — das hält den Start klein.',
      '# Beschriftungssprache: ' + stufen.join(' → ') + '.',
      'SELECT ?klasse ?gop ?istDokument',
      '       (SAMPLE(?elementL)      AS ?element)',
      '       (SAMPLE(?beschreibungL) AS ?beschreibung)',
      '       (SAMPLE(?statusRaw)     AS ?status)',
      '       (SAMPLE(?psetL)         AS ?pset)',
      '       (SAMPLE(?quelleL)       AS ?quelle)',
      '       (COUNT(DISTINCT ?prop) AS ?anzahl)',
      '       (GROUP_CONCAT(DISTINCT ?typWert;  separator=" ") AS ?typen)',
      '       (GROUP_CONCAT(DISTINCT ?phaseRaw; separator=" ") AS ?phasen)',
      '       (SAMPLE(?nameSprache) AS ?sprache)',
      'FROM <' + graph + '>',
      'WHERE {',
      '  ?tpl a dd:DataTemplate ;',
      '       dd:appliesToClass         ?klasse ;',
      '       dd:hasPropertyRequirement ?pr .',
      '  ?pr  dd:requiresProperty       ?prop .',
      '',
      '  # Dokumenttypen sind eigene Objekttypen und als solche markiert',
      '  OPTIONAL { ?klasse a dd:DocumentType . BIND(true AS ?dok) }',
      '  BIND(COALESCE(?dok, false) AS ?istDokument)',
      '',
      '  OPTIONAL { ?pr  dd:inGroupOfProperties ?gop }',
      '  OPTIONAL { ?pr  dd:contextualDatatype  ?typRaw }',
      '  OPTIONAL { ?tpl dd:loinMilestone       ?phaseRaw }',
      '',
      '  # Ein Text mit Werteliste ist eine Auswahl. Dieselbe Ableitung trifft',
      '  # die Detailabfrage — sonst filtert die Übersicht an den Zeilen vorbei.',
      '  OPTIONAL { ?pr   dd:usesEnumerationScheme ?enumPr }',
      '  OPTIONAL { ?prop dd:usesEnumerationScheme ?enumProp }',
      '  BIND(COALESCE(?typRaw, "") AS ?tRoh)',
      '  BIND(IF((BOUND(?enumPr) || BOUND(?enumProp)) && ?tRoh = "STRING",',
      '          "AUSWAHL", ?tRoh) AS ?typWert)',
      '',
    ]).concat(kl.zeilen, [
      coalesce(kl.vars, '?elementL'),
      sprachBind(kl.vars.map(function (v) { return [v]; }), stufen, '?nameSprache'),
      '',
      '  # Reifegrad: im Katalog steht bisher alles auf Candidate oder Preview',
      '  OPTIONAL { ?klasse dd:status ?statusRaw }',
      '',
      '  # Jeder Objekttyp im Graphen führt eine Definition in Prosa'
    ], be.zeilen, [
      coalesce(be.vars, '?beschreibungL'),
      ''
    ], gp.zeilen, [
      coalesce(gp.vars, '?psetL'),
      '',
      '  OPTIONAL {',
      '    ?tpl dct:source ?q .'
    ], qu.zeilen.map(function (z) { return '  ' + z; }), [
      '  ' + coalesce(qu.vars, '?quelleL'),
      '  }',
      '}',
      'GROUP BY ?klasse ?gop ?istDokument'
    ]).join('\n');
  };

  /* L2: die Merkmale eines Objekttyps */
  K.detailQuery = function (graph, klasse, lang) {
    var stufen = sprachStufen(lang);
    var pr = kette('?prop', 'rdfs:label', 'pr', stufen);
    var ps = kette('?prop', 'skos:prefLabel', 'ps', stufen);
    var be = beschreibungKette('?prop', 'd', stufen);
    var gp = kette('?gop', 'rdfs:label', 'g', stufen);
    /* je Stufe: rdfs:label vor skos:prefLabel */
    var nameVars = [], nameGruppen = [];
    stufen.forEach(function (s, i) {
      nameVars.push(pr.vars[i], ps.vars[i]);
      nameGruppen.push([pr.vars[i], ps.vars[i]]);
    });
    return PREFIXE.concat([
      '# Detail: alle Merkmale eines Objekttyps.',
      '# Beschriftungssprache: ' + stufen.join(' → ') + '.',
      'SELECT ?prop ?gop',
      '       (SAMPLE(?merkmalL)      AS ?merkmal)',
      '       (SAMPLE(?beschreibungL) AS ?beschreibung)',
      '       (SAMPLE(?typRaw)        AS ?typ)',
      '       (SAMPLE(?psetL)         AS ?pset)',
      '       (SAMPLE(?ifcPsetRaw)    AS ?ifcPset)',
      '       (SAMPLE(?einheitRaw)    AS ?einheit)',
      '       (SAMPLE(?ifcRaw)        AS ?ifcTyp)',
      '       (SAMPLE(?statusRaw)     AS ?status)',
      '       (SAMPLE(?schemaRaw)     AS ?werteSchema)',
      '       (SAMPLE(?nameSprache)   AS ?sprache)',
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
      '  OPTIONAL { ?prop dd:status             ?statusRaw }',
      '  OPTIONAL { ?prop dd:ifcDatatype        ?ifcRaw }',
      '  OPTIONAL { ?prop dd:alignedWithIfcPset ?ifcPsetRaw }',
      '',
    ]).concat(pr.zeilen, ps.zeilen, [
      coalesce(nameVars, '?merkmalL'),
      sprachBind(nameGruppen, stufen, '?nameSprache'),
      ''
    ], be.zeilen, [
      coalesce(be.vars, '?beschreibungL'),
      ''
    ], gp.zeilen, [
      coalesce(gp.vars, '?psetL'),
      '}',
      'GROUP BY ?prop ?gop'
    ]).join('\n');
  };

  K.werteQuery = function (graph, lang) {
    var stufen = sprachStufen(lang);
    var wl = kette('?ev', 'skos:prefLabel', 'w', stufen);
    return PREFIXE.concat([
      '# Zulässige Werte je Werteliste',
      '# Beschriftungssprache: ' + stufen.join(' → ') + '.',
      'SELECT ?schema (COUNT(DISTINCT ?ev) AS ?anzahl)',
      '       (GROUP_CONCAT(DISTINCT ?wert; separator=" · ") AS ?werte)',
      'FROM <' + graph + '>',
      'WHERE {',
      '  ?schema dd:hasEnumerationValue ?ev .'
    ]).concat(wl.zeilen, [
      '  OPTIONAL { ?ev skos:notation ?wn }',
      coalesce(wl.vars.concat(['?wn']), '?wert'),
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
          sprache: v(r, 'sprache') || 'de',
          beschreibung: v(r, 'beschreibung'),
          status: v(r, 'status'),
          quelle: v(r, 'quelle') || 'Ohne Katalogangabe',
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
        name: v(r, 'merkmal') || K.kurz(v(r, 'prop')),
        sprache: v(r, 'sprache') || 'de',
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
        status: v(r, 'status'),
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

  /* Merkmale eines Objekttyps besorgen — aus dem Zwischenspeicher oder vom Endpunkt.
     Die Wertelisten kommen einmalig beim ersten Detail mit. */
  K.holeDetail = function (endpoint, graph, uri, lang) {
    var st = K.state;
    if (st.detail[uri]) return Promise.resolve(st.detail[uri]);

    var noetig = [K.run(endpoint, K.detailQuery(graph, uri, lang))];
    if (!st.werteGeladen) {
      noetig.push(K.run(endpoint, K.werteQuery(graph, lang))
        .catch(function () { return { fehler: true }; }));
    }

    return Promise.all(noetig).then(function (res) {
      var werteFehler = false;
      if (res[1]) {
        if (res[1].fehler) werteFehler = true;
        else K.uebernehmeWerte(res[1].results.bindings);
      }
      var attrs = K.uebernehmeDetail(uri, res[0].results.bindings);
      if (werteFehler) {
        /* Ohne Wertelisten würde jedes Auswahl-Merkmal still zu «Text».
           Nicht zwischenspeichern (nächstes Öffnen versucht es erneut)
           und den Umstand sagen, statt ihn zu verschweigen. */
        delete st.detail[uri];
        if (K.setStatus) {
          K.setStatus('Die Wertelisten konnten nicht geladen werden — ' +
                      'Auswahl-Merkmale erscheinen vorerst als «Text».', true);
        }
      }
      return attrs;
    });
  };
})(KBOB);
