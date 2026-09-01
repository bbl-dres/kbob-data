/* Querying, loading and normalising the KBOB Data Dictionary from LINDAS.

   Two stages, so that little goes over the wire at startup:
     L1  overview — one record per object type and property set (~800 rows)
     L2  detail   — the attributes of a single object type, on demand only

   Everything hangs off the shared KBOB namespace. */

var KBOB = window.KBOB || (window.KBOB = {});

(function (K) {
  'use strict';

  K.VERSION = '1.0.0';

  var DD = 'https://lindas.admin.ch/fobl/kbob/dd-fm/vocab/';

  /* Catalogue datatypes in plain language — as i18n keys, resolved when the
     rows are adopted (switching language clears the caches) */
  K.TYPES = {
    ENUM:    'type.select',
    STRING:  'type.text',
    REAL:    'type.number',
    INTEGER: 'type.integer',
    BOOLEAN: 'type.boolean',
    TIME:    'type.datetime'
  };

  /* QUDT units mapped to their common symbols */
  K.UNITS = {
    M: 'm', M2: 'm²', M3: 'm³', MilliM: 'mm', CentiM: 'cm', KiloM: 'km',
    LUX: 'lx', LM: 'lm', CD: 'cd', 'CD-PER-M2': 'cd/m²',
    K: 'K', DEG_C: '°C', SEC: 's', MIN: 'min', HR: 'h', DAY: 'd', YR: 'a',
    PERCENT: '%', KiloN: 'kN', N: 'N', 'N-PER-M2': 'N/m²', PA: 'Pa',
    'M3-PER-HR': 'm³/h', 'M3-PER-SEC': 'm³/s',
    'W-PER-M2-K': 'W/(m²·K)', W: 'W', KiloW: 'kW', 'KiloW-HR': 'kWh',
    DEG: '°', RAD: 'rad', KiloGM: 'kg', TON: 't', L: 'l'
  };

  /* Categorical palette, validated against the paper-white ground */
  K.COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100',
              '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

  /* Editorial order of the catalogues: the two general ones first, the
     specialised ones next, the document-type catalogue last. Determines
     facet order and the default sort of the overview. */
  K.CATALOGUE_PRIORITY = ['KBOB Data Dictionary FM', 'Data Dictionary Flächenmanagement'];

  K.catalogueRank = function (name, isDocument) {
    var i = K.CATALOGUE_PRIORITY.indexOf(name);
    if (i !== -1) return i;
    return isDocument ? 9 : 5;
  };

  /* ---------- small helpers ---------- */

  /* Swiss locale for the selected interface language */
  var LOCALES = { de: 'de-CH', fr: 'fr-CH', it: 'it-CH', en: 'en-CH' };
  K.locale = function () {
    return LOCALES[(K.state && K.state.language) || 'de'] || 'de-CH';
  };

  K.formatNumber = function (n) { return n.toLocaleString(K.locale()); };

  /* Collation in one place, in the locale of the interface — otherwise a
     future sorting site forgets the locale and umlauts drift to the end. */
  K.compare = function (a, b) { return String(a).localeCompare(String(b), K.locale()); };
  K.byName = function (a, b) { return K.compare(a.name, b.name); };

  K.lastSegment = function (uri) {
    if (!uri) return '';
    var m = /[#\/]([^#\/]+)$/.exec(uri);
    return m ? m[1] : uri;
  };

  K.truncate = function (text, n) {
    if (!text) return '';
    return text.length > n ? text.slice(0, n) + ' …' : text;
  };

  /* Truncates a « · »-joined value list at a value boundary — half values
     would look like genuine catalogue values. */
  K.truncateList = function (values, n) {
    if (!values || values.length <= n) return values || '';
    var parts = values.split(' · ');
    var kept = [], length = 0;
    for (var i = 0; i < parts.length; i++) {
      if (length + parts[i].length > n && kept.length) break;
      kept.push(parts[i]);
      length += parts[i].length + 3;
    }
    var rest = parts.length - kept.length;
    return kept.join(' · ') +
           (rest > 0 ? ' … ' + K.t('values.more', { n: rest }) : '');
  };

  K.plural = function (n, one, many) {
    return n === 1 ? one : many;
  };

  /* ---------- export building blocks (pure, testable) ---------- */

  K.fileName = function (s) {
    s = s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
    if (String.prototype.normalize) {
      s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');   // é -> e, à -> a …
    }
    s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    /* Date in the name: two exports from different days stay
       distinguishable. */
    var d = new Date();
    var date = d.getFullYear() + '-' +
               ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
               ('0' + d.getDate()).slice(-2);
    return (s || 'objecttype') + '-' + date;
  };

  function v(row, name) { return row[name] ? row[name].value : ''; }

  function listOf(row, name) {
    var s = v(row, name);
    return s ? s.split(' ').filter(Boolean).sort() : [];
  }

  /* Colours only ever apply within one object type.

     The catalogue has 26 property sets, the palette eight colours. A
     catalogue-wide assignment would therefore have to reuse colours, and
     arbitrary pairs would end up side by side — in this palette not every
     pair is distinguishable enough (orange/red, orange/green under red
     deficiency). Within one object type, by contrast, the property sets sit
     next to each other in a fixed order; it is exactly that adjacency the
     palette order has been checked for.

     Hence: colour orders the attributes of one object type, it is not a
     catalogue-wide code. Outside an object type the chips are shown
     without colour accordingly. */
  function assignColors(entry) {
    entry.color = {};
    entry.psets.forEach(function (p, i) {
      entry.color[p.name] = K.COLORS[i % K.COLORS.length];
    });
  }

  /* ---------- language chains ----------

     Labels follow the chain: selected language, then German (including
     untagged literals), then English. For 'de' that is the previous
     two-step chain; 'en' prefers English over German. The switch applies to
     the catalogue data — the interface itself follows its own i18n. */

  K.LANGUAGES = ['de', 'fr', 'it', 'en'];

  function languageChain(lang) {
    var chain = [];
    if (lang && lang !== 'de' && K.LANGUAGES.indexOf(lang) !== -1) chain.push(lang);
    chain.push('de');
    if (lang !== 'en') chain.push('en');
    return chain;
  }

  /* The parameter is called varName, not v — v(row, name) is this file's
     central row accessor and must not be shadowed. */
  function chainFilter(varName, step) {
    return step === 'de'
      ? 'lang(' + varName + ') = "de" || lang(' + varName + ') = ""'
      : 'lang(' + varName + ') = "' + step + '"';
  }
  K.languageChain = languageChain;   // exported for the tests

  /* OPTIONAL lines for one predicate across all chain steps */
  function labelChain(subject, predicate, base, chain) {
    var lines = [], vars = [];
    chain.forEach(function (step, i) {
      var varName = '?' + base + i;
      vars.push(varName);
      lines.push('  OPTIONAL { ' + subject + ' ' + predicate + ' ' + varName +
                 ' FILTER(' + chainFilter(varName, step) + ') }');
    });
    return { lines: lines, vars: vars };
  }

  function coalesce(vars, target) {
    return '  BIND(COALESCE(' + vars.join(', ') + ') AS ' + target + ')';
  }

  /* Which chain step matched? groups: the variables of each step. */
  function languageBind(groups, chain, target) {
    var expression = '"' + chain[chain.length - 1] + '"';
    for (var i = chain.length - 2; i >= 0; i--) {
      var condition = groups[i].map(function (varName) { return 'BOUND(' + varName + ')'; }).join(' || ');
      expression = 'IF(' + condition + ', "' + chain[i] + '", ' + expression + ')';
    }
    return '  BIND(' + expression + ' AS ' + target + ')';
  }

  /* Description: skos:definition per chain step, rdfs:comment as an extra
     German fallback directly after the German definition. */
  function descriptionChain(subject, base, chain) {
    var def = labelChain(subject, 'skos:definition', base, chain);
    var lines = def.lines.slice();
    lines.push('  OPTIONAL { ' + subject + ' rdfs:comment ?' + base +
               'c FILTER(lang(?' + base + 'c) = "de" || lang(?' + base + 'c) = "") }');
    var order = [];
    chain.forEach(function (step, i) {
      order.push(def.vars[i]);
      if (step === 'de') order.push('?' + base + 'c');
    });
    return { lines: lines, vars: order };
  }

  /* ---------- queries ---------- */

  var PREFIXES = [
    'PREFIX dd:   <' + DD + '>',
    'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>',
    'PREFIX skos: <http://www.w3.org/2004/02/skos/core#>',
    'PREFIX dct:  <http://purl.org/dc/terms/>',
    'PREFIX qudt: <http://qudt.org/schema/qudt/>',
    ''
  ];

  /* L1: one row per object type and property set — without the attributes
     themselves */
  K.overviewQuery = function (graph, lang) {
    var chain = languageChain(lang);
    var cl = labelChain('?class', 'rdfs:label', 'c', chain);
    var de = descriptionChain('?class', 'd', chain);
    var gp = labelChain('?gop', 'rdfs:label', 'g', chain);
    var so = labelChain('?src', 'rdfs:label', 's', chain);
    return PREFIXES.concat([
      '# Overview: object types with their property sets, number of',
      '# attributes, datatypes in use and LOIN milestones. The attributes',
      '# themselves are fetched by the detail query — that keeps startup small.',
      '# Label language: ' + chain.join(' → ') + '.',
      'SELECT ?class ?gop ?isDocument',
      '       (SAMPLE(?nameL)        AS ?name)',
      '       (SAMPLE(?descriptionL) AS ?description)',
      '       (SAMPLE(?statusRaw)    AS ?status)',
      '       (SAMPLE(?psetL)        AS ?pset)',
      '       (SAMPLE(?sourceL)      AS ?source)',
      '       (COUNT(DISTINCT ?prop) AS ?count)',
      '       (GROUP_CONCAT(DISTINCT ?typeValue;    separator=" ") AS ?types)',
      '       (GROUP_CONCAT(DISTINCT ?milestoneRaw; separator=" ") AS ?milestones)',
      '       (SAMPLE(?nameLanguage) AS ?language)',
      'FROM <' + graph + '>',
      'WHERE {',
      '  ?tpl a dd:DataTemplate ;',
      '       dd:appliesToClass         ?class ;',
      '       dd:hasPropertyRequirement ?pr .',
      '  ?pr  dd:requiresProperty       ?prop .',
      '',
      '  # Document types are object types of their own and marked as such',
      '  OPTIONAL { ?class a dd:DocumentType . BIND(true AS ?doc) }',
      '  BIND(COALESCE(?doc, false) AS ?isDocument)',
      '',
      '  OPTIONAL { ?pr  dd:inGroupOfProperties ?gop }',
      '  OPTIONAL { ?pr  dd:contextualDatatype  ?typeRaw }',
      '  OPTIONAL { ?tpl dd:loinMilestone       ?milestoneRaw }',
      '',
      '  # A text with a value list is an enumeration. The detail query',
      '  # derives the same thing — otherwise the overview would filter',
      '  # past its own rows.',
      '  OPTIONAL { ?pr   dd:usesEnumerationScheme ?enumPr }',
      '  OPTIONAL { ?prop dd:usesEnumerationScheme ?enumProp }',
      '  BIND(COALESCE(?typeRaw, "") AS ?tRaw)',
      '  BIND(IF((BOUND(?enumPr) || BOUND(?enumProp)) && ?tRaw = "STRING",',
      '          "ENUM", ?tRaw) AS ?typeValue)',
      '',
    ]).concat(cl.lines, [
      coalesce(cl.vars, '?nameL'),
      languageBind(cl.vars.map(function (varName) { return [varName]; }), chain, '?nameLanguage'),
      '',
      '  # Maturity: so far the catalogue holds only Candidate or Preview',
      '  OPTIONAL { ?class dd:status ?statusRaw }',
      '',
      '  # Every object type in the graph carries a definition in prose'
    ], de.lines, [
      coalesce(de.vars, '?descriptionL'),
      ''
    ], gp.lines, [
      coalesce(gp.vars, '?psetL'),
      '',
      '  OPTIONAL {',
      '    ?tpl dct:source ?src .'
    ], so.lines.map(function (line) { return '  ' + line; }), [
      '  ' + coalesce(so.vars, '?sourceL'),
      '  }',
      '}',
      'GROUP BY ?class ?gop ?isDocument'
    ]).join('\n');
  };

  /* L2: the attributes of one object type — or, without a class, of all
     object types at once (one query instead of hundreds; the full export
     needs this). */
  function buildDetailQuery(graph, classUri, lang) {
    var chain = languageChain(lang);
    var pr = labelChain('?prop', 'rdfs:label', 'pr', chain);
    var ps = labelChain('?prop', 'skos:prefLabel', 'ps', chain);
    var de = descriptionChain('?prop', 'd', chain);
    var gp = labelChain('?gop', 'rdfs:label', 'g', chain);
    /* per chain step: rdfs:label before skos:prefLabel */
    var nameVars = [], nameGroups = [];
    chain.forEach(function (step, i) {
      nameVars.push(pr.vars[i], ps.vars[i]);
      nameGroups.push([pr.vars[i], ps.vars[i]]);
    });
    return PREFIXES.concat([
      classUri ? '# Detail: all attributes of one object type.'
               : '# All attributes of all object types (full export).',
      '# Label language: ' + chain.join(' → ') + '.',
      'SELECT ' + (classUri ? '' : '?class ') + '?prop ?gop',
      '       (SAMPLE(?nameL)        AS ?name)',
      '       (SAMPLE(?descriptionL) AS ?description)',
      '       (SAMPLE(?typeRaw)      AS ?type)',
      '       (SAMPLE(?psetL)        AS ?pset)',
      '       (SAMPLE(?ifcPsetRaw)   AS ?ifcPset)',
      '       (SAMPLE(?unitRaw)      AS ?unit)',
      '       (SAMPLE(?ifcRaw)       AS ?ifcType)',
      '       (SAMPLE(?statusRaw)    AS ?status)',
      '       (SAMPLE(?schemeRaw)    AS ?valueScheme)',
      '       (SAMPLE(?nameLanguage) AS ?language)',
      '       (GROUP_CONCAT(DISTINCT ?milestoneRaw; separator=" ") AS ?milestones)',
      'FROM <' + graph + '>',
      'WHERE {'
    ]).concat(classUri ? ['  VALUES ?class { <' + classUri + '> }'] : []).concat([
      '  ?tpl a dd:DataTemplate ;',
      '       dd:appliesToClass         ?class ;',
      '       dd:hasPropertyRequirement ?pr .',
      '  ?pr  dd:requiresProperty       ?prop .',
      '',
      '  OPTIONAL { ?tpl dd:loinMilestone      ?milestoneRaw }',
      '  OPTIONAL { ?pr  dd:contextualDatatype ?typeRaw }',
      '  OPTIONAL { ?pr  dd:inGroupOfProperties ?gop }',
      '',
      '  OPTIONAL { ?pr   dd:contextualUnit ?u1 }',
      '  OPTIONAL { ?pr   qudt:hasUnit      ?u2 }',
      '  OPTIONAL { ?prop qudt:hasUnit      ?u3 }',
      '  BIND(COALESCE(?u1, ?u2, ?u3) AS ?unitRaw)',
      '',
      '  OPTIONAL { ?pr   dd:usesEnumerationScheme ?s1 }',
      '  OPTIONAL { ?prop dd:usesEnumerationScheme ?s2 }',
      '  BIND(COALESCE(?s1, ?s2) AS ?schemeRaw)',
      '',
      '  OPTIONAL { ?prop dd:status             ?statusRaw }',
      '  OPTIONAL { ?prop dd:ifcDatatype        ?ifcRaw }',
      '  OPTIONAL { ?prop dd:alignedWithIfcPset ?ifcPsetRaw }',
      '',
    ]).concat(pr.lines, ps.lines, [
      coalesce(nameVars, '?nameL'),
      languageBind(nameGroups, chain, '?nameLanguage'),
      ''
    ], de.lines, [
      coalesce(de.vars, '?descriptionL'),
      ''
    ], gp.lines, [
      coalesce(gp.vars, '?psetL'),
      '}',
      'GROUP BY ' + (classUri ? '' : '?class ') + '?prop ?gop'
    ]).join('\n');
  }

  K.detailQuery = function (graph, classUri, lang) {
    return buildDetailQuery(graph, classUri, lang);
  };

  K.allDetailsQuery = function (graph, lang) {
    return buildDetailQuery(graph, null, lang);
  };

  K.valuesQuery = function (graph, lang) {
    var chain = languageChain(lang);
    var vl = labelChain('?ev', 'skos:prefLabel', 'v', chain);
    return PREFIXES.concat([
      '# Permitted values per value list',
      '# Label language: ' + chain.join(' → ') + '.',
      'SELECT ?scheme (COUNT(DISTINCT ?ev) AS ?count)',
      '       (GROUP_CONCAT(DISTINCT ?value; separator=" · ") AS ?values)',
      'FROM <' + graph + '>',
      'WHERE {',
      '  ?scheme dd:hasEnumerationValue ?ev .'
    ]).concat(vl.lines, [
      '  OPTIONAL { ?ev skos:notation ?vn }',
      coalesce(vl.vars.concat(['?vn']), '?value'),
      '}',
      'GROUP BY ?scheme'
    ]).join('\n');
  };

  /* ---------- running a query ---------- */

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
      /* A 200 can also be a maintenance page or a login portal — the message
         should say so, not «Unexpected token». */
      if (!json || !json.results || !(json.results.bindings instanceof Array)) {
        throw new Error(K.t('errors.notSparql'));
      }
      return json;
    });
  };

  /* ---------- adopting L1 ---------- */

  K.applyOverview = function (rows) {
    var st = K.state;
    if (!rows || !rows.length) return;

    var map = {};

    rows.forEach(function (r) {
      var uri = v(r, 'class');
      if (!uri) return;

      var entry = map[uri];
      if (!entry) {
        entry = map[uri] = {
          uri: uri,
          /* If every label is missing, that shows up visibly as MISSING —
             the URI tail in brackets keeps the entry distinguishable. */
          name: v(r, 'name') || K.t('common.missing') + ' (' + K.lastSegment(uri) + ')',
          language: v(r, 'language') || 'de',
          description: v(r, 'description'),
          status: v(r, 'status'),
          source: v(r, 'source') || K.t('empty.catalog'),
          isDocument: v(r, 'isDocument') === 'true',
          count: 0, psets: [], types: [], milestones: [], color: {}
        };
      }

      var n = parseInt(v(r, 'count'), 10) || 0;
      entry.count += n;
      entry.psets.push({ uri: v(r, 'gop'), name: v(r, 'pset') || K.t('empty.psetName'), n: n });

      listOf(r, 'types').forEach(function (t) {
        var plain = K.TYPES[t] ? K.t(K.TYPES[t]) : t;
        if (entry.types.indexOf(plain) === -1) entry.types.push(plain);
      });
      listOf(r, 'milestones').forEach(function (m) {
        if (entry.milestones.indexOf(m) === -1) entry.milestones.push(m);
      });
    });

    st.entries = Object.keys(map).map(function (uri) {
      var entry = map[uri];
      entry.psets.sort(K.byName);
      entry.types.sort();
      entry.milestones.sort();
      return entry;
    });

    /* Default order by catalogue priority (the general catalogues first,
       document types last), alphabetical within — the domain object types
       are the more common entry point. An explicit column sort by the user
       overrides this default. */
    st.entries.sort(function (a, b) {
      var ra = K.catalogueRank(a.source, a.isDocument);
      var rb = K.catalogueRank(b.source, b.isDocument);
      if (ra !== rb) return ra - rb;
      if (a.source !== b.source) return K.compare(a.source, b.source);
      return K.compare(a.name, b.name);
    });

    st.entries.forEach(assignColors);
  };

  /* ---------- value lists ---------- */

  K.applyValues = function (rows) {
    var st = K.state;
    rows.forEach(function (r) {
      st.values[v(r, 'scheme')] = {
        count: parseInt(v(r, 'count'), 10) || 0,
        values: v(r, 'values')
      };
    });
    st.valuesLoaded = true;
  };

  function isTrivialBooleanList(values) {
    var allowed = { 'true': 1, 'false': 1, 'ja': 1, 'nein': 1, 'yes': 1, 'no': 1 };
    return values.split(' · ').every(function (w) {
      return allowed[w.trim().toLowerCase()] === 1;
    });
  }

  function unitSymbol(raw) {
    if (!raw) return '';
    if (raw.indexOf('http') !== 0) return raw;       // already a symbol
    var seg = K.lastSegment(raw);
    return K.UNITS[seg] || seg;
  }

  /* ---------- adopting L2 ---------- */

  K.applyDetail = function (uri, rows) {
    var st = K.state;

    var attrs = rows.map(function (r) {
      var scheme = v(r, 'valueScheme');
      var valueList = scheme ? st.values[scheme] : null;
      var typeRaw = v(r, 'type');

      /* A yes/no list of exactly true/false says nothing the type does not
         already say — it is hidden. Three values (yes/no/optional) stay. */
      if (valueList && typeRaw === 'BOOLEAN' && isTrivialBooleanList(valueList.values)) valueList = null;

      return {
        uri: v(r, 'prop'),
        name: v(r, 'name') ||
              K.t('common.missing') + ' (' + K.lastSegment(v(r, 'prop')) + ')',
        language: v(r, 'language') || 'de',
        description: v(r, 'description'),
        typeRaw: typeRaw,
        /* A value list only turns a TEXT into an enumeration. BOOLEAN also
           carries a list (true/false, yes/no) — that stays yes/no. */
        type: (valueList && valueList.count && typeRaw === 'STRING')
                ? K.t('type.select')
                : (K.TYPES[typeRaw] ? K.t(K.TYPES[typeRaw]) : (typeRaw || '')),
        psetUri: v(r, 'gop'),
        pset: v(r, 'pset') || K.t('empty.psetName'),
        ifcPset: K.lastSegment(v(r, 'ifcPset')),
        unit: unitSymbol(v(r, 'unit')),
        ifcType: v(r, 'ifcType'),
        status: v(r, 'status'),
        valueList: valueList,
        milestones: listOf(r, 'milestones')
      };
    });

    attrs.sort(function (a, b) {
      if (a.pset !== b.pset) return K.compare(a.pset, b.pset);
      return K.byName(a, b);
    });

    st.detail[uri] = attrs;
    return attrs;
  };

  /* The value lists come along once, with the first detail. A pending
     promise is shared so that parallel details (export bundle, double
     click) do not fire six identical queries. */
  var valuesPromise = null;

  function fetchValues(conn) {
    var st = K.state;
    if (st.valuesLoaded) return Promise.resolve(null);
    if (!valuesPromise) {
      /* Treat a response from an older generation (language/endpoint switch
         while in flight) as a failure instead of filling the fresh cache */
      var gen = st.generation;
      valuesPromise = K.run(conn.endpoint, K.valuesQuery(conn.graph, conn.language))
        .then(function (r) {
          valuesPromise = null;
          return gen === st.generation ? r : { failed: true };
        }, function () {
          valuesPromise = null;
          return { failed: true };
        });
    }
    return valuesPromise;
  }

  /* Discard pending shared promises — load() calls this after every
     generation change: a promise still in flight from the old generation
     must not be reused into the new one. */
  K.invalidatePending = function () {
    valuesPromise = null;
    allDetailsPromise = null;
    pendingDetail = {};
  };

  /* Fetch the attributes of one object type — from the cache or from the
     endpoint. conn is the connection state frozen at load time
     {endpoint, graph, language}; a response from an older generation
     (language/endpoint switch during loading) is discarded instead of
     poisoning the fresh cache. If the same URI is already in flight, the
     pending promise is shared instead of querying twice. */
  var pendingDetail = {};

  K.fetchDetail = function (conn, uri) {
    var st = K.state;
    if (st.detail[uri] && !st.detailWithoutValues[uri]) {
      return Promise.resolve(st.detail[uri]);
    }
    if (pendingDetail[uri]) return pendingDetail[uri];

    /* An incomplete detail (value list was missing) is fetched again in full */
    delete st.detail[uri];

    var gen = st.generation;
    var p = Promise.all([
      K.run(conn.endpoint, K.detailQuery(conn.graph, uri, conn.language)),
      fetchValues(conn)
    ]).then(function (res) {
      delete pendingDetail[uri];
      if (gen !== st.generation) return [];   // stale response: discard

      var valuesFailed = !!(res[1] && res[1].failed);
      if (res[1] && !valuesFailed) K.applyValues(res[1].results.bindings);

      var attrs = K.applyDetail(uri, res[0].results.bindings);
      if (valuesFailed) {
        /* Without the value lists every enumeration attribute would quietly
           become «Text». Remember instead of deleting: the view renders, the
           next open reloads, and the caller can report the circumstance. */
        st.detailWithoutValues[uri] = true;
      } else {
        delete st.detailWithoutValues[uri];
      }
      return attrs;
    }, function (err) {
      delete pendingDetail[uri];
      throw err;
    });

    pendingDetail[uri] = p;
    return p;
  };

  /* All attributes of all object types in ONE query — for the full export.
     Around 3300 rows are a single cheap response for the endpoint; hundreds
     of individual queries would not be. The result fills the same detail
     cache the view uses. */
  var allDetailsPromise = null;

  K.fetchAllDetails = function (conn) {
    var st = K.state;
    if (allDetailsPromise) return allDetailsPromise;

    var gen = st.generation;
    var p = Promise.all([
      K.run(conn.endpoint, K.allDetailsQuery(conn.graph, conn.language)),
      fetchValues(conn)
    ]).then(function (res) {
      allDetailsPromise = null;
      if (gen !== st.generation) return;   // stale response: discard

      var valuesFailed = !!(res[1] && res[1].failed);
      if (res[1] && !valuesFailed) K.applyValues(res[1].results.bindings);

      var byClassUri = {};
      res[0].results.bindings.forEach(function (r) {
        var uri = r['class'] ? r['class'].value : '';
        if (!uri) return;
        (byClassUri[uri] = byClassUri[uri] || []).push(r);
      });
      Object.keys(byClassUri).forEach(function (uri) {
        K.applyDetail(uri, byClassUri[uri]);
        if (valuesFailed) st.detailWithoutValues[uri] = true;
        else delete st.detailWithoutValues[uri];
      });
    }, function (err) {
      allDetailsPromise = null;
      throw err;
    });

    allDetailsPromise = p;
    return p;
  };
})(KBOB);
