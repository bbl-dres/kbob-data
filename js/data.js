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

  /* Datentypen des Katalogs in Alltagssprache — als i18n-Schlüssel,
     aufgelöst zur Übernahmezeit (der Sprachwechsel leert die Caches) */
  K.TYPEN = {
    AUSWAHL: 'type.select',
    STRING:  'type.text',
    REAL:    'type.number',
    INTEGER: 'type.integer',
    BOOLEAN: 'type.boolean',
    TIME:    'type.datetime'
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

  /* Redaktionelle Reihenfolge der Kataloge: die beiden allgemeinen zuerst,
     die Spezialkataloge danach, der Dokumenttypenkatalog zuletzt. Bestimmt
     Facetten-Reihenfolge und Standardsortierung der Uebersicht. */
  K.KATALOG_PRIORITAET = ['KBOB Data Dictionary FM', 'Data Dictionary Flächenmanagement'];

  K.katalogRang = function (name, istDokument) {
    var i = K.KATALOG_PRIORITAET.indexOf(name);
    if (i !== -1) return i;
    return istDokument ? 9 : 5;
  };

  /* ---------- kleine Helfer ---------- */

  /* Schweizer Locale zur gewählten Oberflächensprache */
  var LOCALES = { de: 'de-CH', fr: 'fr-CH', it: 'it-CH', en: 'en-CH' };
  K.locale = function () {
    return LOCALES[(K.state && K.state.sprache) || 'de'] || 'de-CH';
  };

  K.zahl = function (n) { return n.toLocaleString(K.locale()); };

  /* Kollation an einer Stelle, im Locale der Oberfläche — sonst vergisst
     eine kuenftige Sortierstelle das Locale und Umlaute wandern ans Ende. */
  K.deCompare = function (a, b) { return String(a).localeCompare(String(b), K.locale()); };
  K.nachName = function (a, b) { return K.deCompare(a.name, b.name); };

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
    return behalten.join(' · ') +
           (rest > 0 ? ' … ' + K.t('values.more', { n: rest }) : '');
  };

  K.plural = function (n, einzahl, mehrzahl) {
    return n === 1 ? einzahl : mehrzahl;
  };

  /* ---------- Export-Bausteine (rein, testbar) ---------- */

  K.dateiname = function (s) {
    s = s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
    if (String.prototype.normalize) {
      s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');   // é -> e, à -> a …
    }
    s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    /* Datum im Namen: zwei Exporte von verschiedenen Tagen bleiben
       unterscheidbar. */
    var d = new Date();
    var datum = d.getFullYear() + '-' +
                ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
                ('0' + d.getDate()).slice(-2);
    return (s || 'objekttyp') + '-' + datum;
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

  /* Parameter heisst vn, nicht v — v(row, name) ist in dieser Datei der
     zentrale Zeilen-Accessor und darf nicht verschattet werden. */
  function stufenFilter(vn, stufe) {
    return stufe === 'de'
      ? 'lang(' + vn + ') = "de" || lang(' + vn + ') = ""'
      : 'lang(' + vn + ') = "' + stufe + '"';
  }
  K.sprachStufen = sprachStufen;   // exportiert für Tests

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

  /* L2: die Merkmale eines Objekttyps — oder, ohne klasse, aller Objekttypen
     auf einmal (eine Abfrage statt hunderter; braucht der Gesamtexport). */
  function detailArtQuery(graph, klasse, lang) {
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
      klasse ? '# Detail: alle Merkmale eines Objekttyps.'
             : '# Alle Merkmale aller Objekttypen (Gesamtexport).',
      '# Beschriftungssprache: ' + stufen.join(' → ') + '.',
      'SELECT ' + (klasse ? '' : '?klasse ') + '?prop ?gop',
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
      'WHERE {'
    ]).concat(klasse ? ['  VALUES ?klasse { <' + klasse + '> }'] : []).concat([
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
      'GROUP BY ' + (klasse ? '' : '?klasse ') + '?prop ?gop'
    ]).join('\n');
  }

  K.detailQuery = function (graph, klasse, lang) {
    return detailArtQuery(graph, klasse, lang);
  };

  K.alleDetailsQuery = function (graph, lang) {
    return detailArtQuery(graph, null, lang);
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
    }).then(function (json) {
      /* Ein 200er kann auch eine Wartungsseite oder ein Anmeldeportal sein —
         dann soll die Meldung das sagen, nicht «Unexpected token». */
      if (!json || !json.results || !(json.results.bindings instanceof Array)) {
        throw new Error('Die Antwort ist kein SPARQL-Ergebnis — der Endpunkt ' +
                        'hat vermutlich eine Fehler- oder Anmeldeseite geliefert.');
      }
      return json;
    });
  };

  /* ---------- L1 uebernehmen ---------- */

  K.uebernehmeUebersicht = function (rows) {
    var st = K.state;
    if (!rows || !rows.length) return;

    var map = {};

    rows.forEach(function (r) {
      var uri = v(r, 'klasse');
      if (!uri) return;

      var e = map[uri];
      if (!e) {
        e = map[uri] = {
          uri: uri,
          /* Fehlt jede Beschriftung, steht das sichtbar als MISSING da —
             der URI-Rest in der Klammer hält den Eintrag unterscheidbar. */
          name: v(r, 'element') || K.t('common.missing') + ' (' + K.kurz(uri) + ')',
          sprache: v(r, 'sprache') || 'de',
          beschreibung: v(r, 'beschreibung'),
          status: v(r, 'status'),
          quelle: v(r, 'quelle') || K.t('empty.catalog'),
          istDokument: v(r, 'istDokument') === 'true',
          anzahl: 0, psets: [], typen: [], phasen: [], farbe: {}
        };
      }

      var n = parseInt(v(r, 'anzahl'), 10) || 0;
      e.anzahl += n;
      e.psets.push({ uri: v(r, 'gop'), name: v(r, 'pset') || K.t('empty.psetName'), n: n });

      liste(r, 'typen').forEach(function (t) {
        var klar = K.TYPEN[t] ? K.t(K.TYPEN[t]) : t;
        if (e.typen.indexOf(klar) === -1) e.typen.push(klar);
      });
      liste(r, 'phasen').forEach(function (p) {
        if (e.phasen.indexOf(p) === -1) e.phasen.push(p);
      });
    });

    st.elemente = Object.keys(map).map(function (uri) {
      var e = map[uri];
      e.psets.sort(K.nachName);
      e.typen.sort();
      e.phasen.sort();
      return e;
    });

    /* Standardreihenfolge nach Katalog-Priorität (die allgemeinen Kataloge
       zuerst, Dokumenttypen zuletzt), innerhalb alphabetisch — die
       fachlichen Objekttypen sind der häufigere Einstieg. Eine explizite
       Spaltensortierung der Nutzenden übersteuert diese Vorgabe. */
    st.elemente.sort(function (a, b) {
      var ra = K.katalogRang(a.quelle, a.istDokument);
      var rb = K.katalogRang(b.quelle, b.istDokument);
      if (ra !== rb) return ra - rb;
      if (a.quelle !== b.quelle) return K.deCompare(a.quelle, b.quelle);
      return K.deCompare(a.name, b.name);
    });

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
        name: v(r, 'merkmal') ||
              K.t('common.missing') + ' (' + K.kurz(v(r, 'prop')) + ')',
        sprache: v(r, 'sprache') || 'de',
        beschreibung: v(r, 'beschreibung'),
        typRaw: typRaw,
        /* Eine Werteliste macht nur aus einem Text eine Auswahl. BOOLEAN fuehrt
           ebenfalls eine Liste (true/false, Ja/Nein) — das bleibt Ja/Nein. */
        typ: (wl && wl.anzahl && typRaw === 'STRING')
               ? K.t('type.select')
               : (K.TYPEN[typRaw] ? K.t(K.TYPEN[typRaw]) : (typRaw || '')),
        psetUri: v(r, 'gop'),
        pset: v(r, 'pset') || K.t('empty.psetName'),
        ifcPset: K.kurz(v(r, 'ifcPset')),
        einheit: einheitSymbol(v(r, 'einheit')),
        ifcTyp: v(r, 'ifcTyp'),
        status: v(r, 'status'),
        liste: wl,
        phasen: liste(r, 'phasen')
      };
    });

    attrs.sort(function (a, b) {
      if (a.pset !== b.pset) return K.deCompare(a.pset, b.pset);
      return K.nachName(a, b);
    });

    st.detail[uri] = attrs;
    return attrs;
  };

  /* Die Wertelisten kommen einmalig beim ersten Detail mit. Ein laufendes
     Versprechen wird geteilt, damit parallele Details (Export-Bündel,
     Doppelklick) nicht sechs identische Abfragen feuern. */
  var werteVersprechen = null;

  function holeWerte(v) {
    var st = K.state;
    if (st.werteGeladen) return Promise.resolve(null);
    if (!werteVersprechen) {
      /* Antwort einer älteren Generation (Sprach-/Endpunktwechsel während
         des Flugs) als Fehler behandeln statt den frischen Cache zu füllen */
      var gen = st.generation;
      werteVersprechen = K.run(v.endpoint, K.werteQuery(v.graph, v.sprache))
        .then(function (r) {
          werteVersprechen = null;
          return gen === st.generation ? r : { fehler: true };
        }, function () {
          werteVersprechen = null;
          return { fehler: true };
        });
    }
    return werteVersprechen;
  }

  /* Laufende geteilte Versprechen verwerfen — ruft laden() nach jedem
     Generationswechsel auf: ein noch fliegendes Versprechen der alten
     Generation darf nicht in die neue hinein wiederverwendet werden. */
  K.invalidiereLaufend = function () {
    werteVersprechen = null;
    alleVersprechen = null;
    laufendDetail = {};
  };

  /* Merkmale eines Objekttyps besorgen — aus dem Zwischenspeicher oder vom
     Endpunkt. v ist der beim Laden eingefrorene Verbindungsstand
     {endpoint, graph, sprache}; eine Antwort aus einer älteren Generation
     (Sprach-/Endpunktwechsel während des Ladens) wird verworfen, statt den
     frischen Cache zu vergiften. Läuft dieselbe URI bereits, wird das
     laufende Versprechen geteilt statt doppelt abgefragt. */
  var laufendDetail = {};

  K.holeDetail = function (v, uri) {
    var st = K.state;
    if (st.detail[uri] && !st.detailOhneWerte[uri]) {
      return Promise.resolve(st.detail[uri]);
    }
    if (laufendDetail[uri]) return laufendDetail[uri];

    /* Unvollständiges Detail (Werteliste fehlte) wird komplett neu geholt */
    delete st.detail[uri];

    var gen = st.generation;
    var p = Promise.all([
      K.run(v.endpoint, K.detailQuery(v.graph, uri, v.sprache)),
      holeWerte(v)
    ]).then(function (res) {
      delete laufendDetail[uri];
      if (gen !== st.generation) return [];   // veraltete Antwort: verwerfen

      var werteFehler = !!(res[1] && res[1].fehler);
      if (res[1] && !werteFehler) K.uebernehmeWerte(res[1].results.bindings);

      var attrs = K.uebernehmeDetail(uri, res[0].results.bindings);
      if (werteFehler) {
        /* Ohne Wertelisten würde jedes Auswahl-Merkmal still zu «Text».
           Merken statt löschen: die Ansicht rendert, das nächste Öffnen
           lädt neu, und der Aufrufer kann den Umstand melden. */
        st.detailOhneWerte[uri] = true;
      } else {
        delete st.detailOhneWerte[uri];
      }
      return attrs;
    }, function (err) {
      delete laufendDetail[uri];
      throw err;
    });

    laufendDetail[uri] = p;
    return p;
  };

  /* Alle Merkmale aller Objekttypen in EINER Abfrage — für den Gesamtexport.
     Rund 3300 Zeilen sind für den Endpunkt eine einzige billige Antwort;
     hunderte Einzelabfragen wären es nicht. Das Ergebnis füllt denselben
     Detail-Zwischenspeicher, den auch die Ansicht nutzt. */
  var alleVersprechen = null;

  K.holeAlleDetails = function (v) {
    var st = K.state;
    if (alleVersprechen) return alleVersprechen;

    var gen = st.generation;
    var p = Promise.all([
      K.run(v.endpoint, K.alleDetailsQuery(v.graph, v.sprache)),
      holeWerte(v)
    ]).then(function (res) {
      alleVersprechen = null;
      if (gen !== st.generation) return;   // veraltete Antwort: verwerfen

      var werteFehler = !!(res[1] && res[1].fehler);
      if (res[1] && !werteFehler) K.uebernehmeWerte(res[1].results.bindings);

      var nachKlasse = {};
      res[0].results.bindings.forEach(function (r) {
        var uri = r.klasse ? r.klasse.value : '';
        if (!uri) return;
        (nachKlasse[uri] = nachKlasse[uri] || []).push(r);
      });
      Object.keys(nachKlasse).forEach(function (uri) {
        K.uebernehmeDetail(uri, nachKlasse[uri]);
        if (werteFehler) st.detailOhneWerte[uri] = true;
        else delete st.detailOhneWerte[uri];
      });
    }, function (err) {
      alleVersprechen = null;
      throw err;
    });

    alleVersprechen = p;
    return p;
  };
})(KBOB);
