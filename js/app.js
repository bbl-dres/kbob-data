/* Navigation, filtering and startup.

   Two levels instead of three: a flat, faceted list of all object types —
   and below it the attributes of one object type. The catalogue is a facet,
   not a navigation level: 666 of the 719 object types come from a single
   source, so structuring by it would be an obstacle rather than a help.

   The state lives in the URL, so that views stay shareable and the back
   button does what it should. */

var KBOB = window.KBOB || (window.KBOB = {});

(function (K) {
  'use strict';

  K.state = {
    /* — owned by data.js (cache, written by applyX/fetchDetail) — */
    entries: [],
    values: {},
    valuesLoaded: false,
    detail: {},
    detailWithoutValues: {}, // detail loaded, but the value-list query failed

    /* — owned by app.js (interaction and navigation state) — */
    catalogues: [],
    detailError: {},    // error message per object-type URI if its detail failed
    generation: 1,       // counts reloads; responses from older generations are discarded
    connection: null,    // {endpoint, graph, language} frozen at load time —
                         // follow-up queries run against this state, not against the dialog field
    objectType: null,     // the open object type (URI)
    attribute: null,       // the open attribute (URI)
    language: 'de',       // language of the catalogue labels (not of the interface)
    sort: null,          // { field, direction } — null means the level's default order
    view: 'list',
    highlighted: null,        // highlighted property set in the graph (transient)
    allMilestones: [],      // every LOIN milestone occurring in the catalogue
    catalogues: [],       // sources of the object types (buildCatalogues) — empty before the first load
    guide: false,         // the «Anleitung» page is open (no catalogue level)
    silent: false,        // true while the URL is being read
    facets: { catalogue: [], status: [], milestone: [] },
    page: 1,
    perPage: 50
  };

  K.PAGE_SIZES = [50, 100, 200];
  K.SEARCH_DEBOUNCE_MS = 180;  // rebuilding the network costs up to ~25 ms of layout

  var el = K.el = {};
  ['endpoint', 'named-graph', 'status', 'breadcrumb', 'toolbar', 'placeholder',
   'page-header', 'page-title', 'page-meta', 'page-lead',
   'view-list', 'view-gallery', 'view-graph', 'view-attribute', 'gallery',
   'result-count', 'search-input', 'xlsx', 'graph-canvas', 'legend', 'tooltip', 'graph-hint',
   'graph-text', 'reload', 'connection', 'accessibility-statement',
   'graph-message', 'graph-frame', 'graph-controls', 'filter-bar',
   'attribute-detail', 'zoom-in', 'zoom-out', 'zoom-reset',
   'facets', 'paginator', 'copy-status', 'language',
   'facets-toggle', 'view-guide', 'guide-content', 'guide-lang-note',
   'graph-panel', 'graph-title', 'zoom-hint',
   'graph-skip', 'graph-fullscreen'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  var dlgConnection = document.getElementById('dlg-connection');
  var dlgA11y = document.getElementById('dlg-a11y');

  /* quiet = for screen readers only (live region), without a visible line —
     progress texts would otherwise stand twice next to the content spinner. */
  function setStatus(text, isError, quiet) {
    el.status.className = 'app-status' + (isError ? ' app-status-error' : '') +
                          (quiet ? ' ob-screen-reader-only' : '');
    el.status.textContent = text;
  }
  K.setStatus = setStatus;

  /* ---------- Loading indicator ---------- */

  /* The loading state turns as an arc in the content area (table, gallery,
     graph, placeholder); the status line is the live region through which
     screen readers learn about loading — it is not visible while doing so. */
  function busy(an, text) {
    if (an && text) setStatus(text, false, true);
  }

  /* ---------- Loading ---------- */

  function endpointUrl() { return el.endpoint.value.trim(); }
  function namedGraphUri() { return el['named-graph'].value.trim(); }

  /* Turns raw fetch errors into a readable explanation — for the error
     paths beyond the initial load (detail, export). */
  var NETWORK_ERROR = /Failed to fetch|NetworkError|CORS/i;
  function errorText(err) {
    var m = String(err && err.message || err);
    return NETWORK_ERROR.test(m) ? K.t('errors.networkShort') : m;
  }

  function load() {
    if (!endpointUrl() || !namedGraphUri()) { setStatus(K.t('errors.fillConnection'), true); return; }
    if (dlgConnection.open) dlgConnection.close();

    /* Freeze the connection state at REQUEST time and bump the generation:
       of two quick reloads the last one started always wins — not whichever
       response happens to arrive last. Pending shared promises of the old
       generation are discarded. */
    var st = K.state;
    var request = { endpoint: endpointUrl(), graph: namedGraphUri(), language: st.language };
    st.generation += 1;
    K.invalidatePending();
    var myGen = st.generation;

    el.reload.disabled = true;

    /* Visible placeholder (first start, retry after an error) — only once
       the dictionary has arrived, otherwise MISSING would sit in the
       spinner. */
    K.i18nReady.then(function () {
      if (myGen !== st.generation) return;
      if (!st.entries.length) {
        message(el.placeholder, { title: K.t('loading.catalog'), loading: true });
      }
      /* Reloading with existing content (language/endpoint switch): the
         interface texts change immediately, the content shows the ONE
         loading state — a spinner in the table, gallery or graph. The
         guide, if open, stays put; render() after the load decides. */
      if (st.entries.length && !st.guide) {
        el.paginator.hidden = true;
        if (st.view === 'gallery') {
          showView('gallery');
          K.renderGallery({ cards: [], emptyText: K.t('loading.catalog'), loading: true });
        } else if (st.view === 'graph') {
          showView('graph');
          graphMessage(K.t('loading.catalog'), '', true);
        } else {
          showView('list');
          K.renderList({ title: K.t('loading.catalog'), columns: [{ title: '' }],
                           rows: [], emptyText: K.t('loading.catalog'), loading: true });
        }
      }
      busy(true, K.t('loading.catalog'));
    });

    Promise.all([
      K.run(request.endpoint, K.overviewQuery(request.graph, request.language)),
      K.i18nReady
    ]).then(function (res) {
      if (myGen !== st.generation) return;   // inzwischen next geladen
      var rows = res[0].results.bindings;
      busy(false);
      el.reload.disabled = false;

      if (!rows.length) {
        showError(K.t('errors.emptyGraph', { graph: request.graph }));
        return;
      }

      /* A new state means a new state: discard old details and value lists,
         otherwise two sources mix when the endpoint changes. */
      st.detail = {};
      st.detailWithoutValues = {};
      st.detailError = {};
      st.values = {};
      st.valuesLoaded = false;
      st.connection = request;

      K.applyOverview(rows);
      buildCatalogues();

      el.placeholder.hidden = true;
      el.toolbar.hidden = false;
      el['page-header'].hidden = false;
      el.xlsx.disabled = false;
      el.xlsx.removeAttribute('aria-busy');

      readUrl();   // also builds the facets
      render();
      setStatus('');
    }).catch(function (err) {
      /* Wait for the dictionary, otherwise an immediate network error
         (CORS, offline) shows only MISSING markers — i18nReady always
         resolves. */
      K.i18nReady.then(function () {
        if (myGen !== st.generation) return;
        busy(false);
        el.reload.disabled = false;
        var msg = String(err && err.message || err);
        var text = K.t('errors.network');
        if (location.protocol === 'file:') text += ' ' + K.t('errors.file');
        showError(NETWORK_ERROR.test(msg)
          ? text
          : K.t('errors.queryFailed', { msg: msg }));
      });
    });
  }


  /* The loading note must not stay up when loading fails — the page would
     otherwise contradict itself. */
  function showError(text) {
    setStatus(K.t('errors.loadFailed'), true);
    el['page-header'].hidden = true;
    el.toolbar.hidden = true;
    el['filter-bar'].hidden = true;
    el.paginator.hidden = true;
    el.xlsx.disabled = true;
    el.xlsx.removeAttribute('aria-busy');
    ['view-list', 'view-gallery', 'view-graph', 'view-attribute'].forEach(function (v) {
      el[v].hidden = true;
    });

    el.placeholder.hidden = false;
    el.placeholder.className = 'app-message';
    message(el.placeholder, {
      title: K.t('errors.catalogTitle'),
      text: text,
      type: 'error',
      action: { text: K.t('common.retry'), onClick: load, fokus: true }
    });
    /* With the guide open the error tile waits behind it; render() shows
       it as soon as the reader returns to the catalogue. */
    if (K.state.guide) showGuide();
  }

  function buildCatalogues() {
    var map = {};
    K.state.entries.forEach(function (e) {
      var q = map[e.source];
      if (!q) q = map[e.source] = { name: e.source, objectTypes: 0, doc: false };
      q.objectTypes++;
      if (e.isDocument) q.doc = true;
    });
    /* Editorial order (K.CATALOGUE_PRIORITY): the general catalogues
       first, the document-type catalogue last. */
    K.state.catalogues = Object.keys(map).map(function (n) { return map[n]; })
      .sort(function (a, b) {
        var ra = K.catalogueRank(a.name, a.doc);
        var rb = K.catalogueRank(b.name, b.doc);
        if (ra !== rb) return ra - rb;
        return b.objectTypes - a.objectTypes;
      });
  }

  /* ---------- Facets ---------- */

  /* Facets derived from the data. Multiple choice within a group (OR),
     intersected between groups (AND). Nothing ticked means «all». */
  function buildFacets() {
    var st = K.state;
    var milestones = {}, status = {};

    st.entries.forEach(function (e) {
      e.milestones.forEach(function (p) { milestones[p] = true; });
      if (e.status) status[e.status] = (status[e.status] || 0) + 1;
    });

    el.facets.innerHTML = '';

    group(K.t('facets.catalog'), 'catalogue', st.catalogues.map(function (q) {
      return { value: q.name, text: q.name, n: q.objectTypes };
    }));

    st.allMilestones = Object.keys(milestones).sort();

    var statusList = Object.keys(status).sort();
    if (statusList.length > 1) {
      group(K.t('facets.status'), 'status', statusList.map(function (w) {
        return { value: w, text: w, n: status[w] };
      }));
    }

    /* Only a fraction of the attributes declare a milestone, so the group
       appears only when there is something to choose at all.
       «LOIN milestone» is the label of the field in the KBOB schema
       (dd:loinMilestone) — «project phase» could be confused with SIA 112. */
    var milestoneList = Object.keys(milestones).sort();
    if (milestoneList.length) {
      group(K.t('facets.milestone'), 'milestone', milestoneList.map(function (p) {
        return { value: p, text: p };
      }));
    }
  }

  /* Not every facet applies on the deeper levels — the ineffective ones are
     hidden rather than shown dead (honest filters, E7). */
  function showFacets(key) {
    Array.prototype.forEach.call(el.facets.children, function (box) {
      box.hidden = key.indexOf(box.getAttribute('data-facet')) === -1;
    });
  }

  /* A multi-select field. Not a native <select multiple> — that is barely
     operable with a mouse and does not show its state. */
  function group(title, key, items) {
    var id = 'fac-' + key;

    var box = document.createElement('div');
    box.className = 'app-field app-facet';
    box.setAttribute('data-facet', key);

    /* The button carries the filter name itself — «Katalog (2)» says at a
       glance WHICH filter applies; a separate label line and «n of m
       selected» are then unnecessary. It looks like a select field (dark
       text, field border, chevron), not like an action button: it stands in
       one row with the search field and opens a choice, it does not act.
       No funnel icon — three identical icons in a row said nothing the
       labels did not. */
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'app-facet-toggle';
    button.setAttribute('aria-expanded', 'false');

    var value = document.createElement('span');
    value.className = 'app-facet-value';
    value.id = id + '-value';
    button.appendChild(value);
    button.appendChild(K.icon('chevron_down_small'));
    box.appendChild(button);

    var menu = document.createElement('div');
    menu.className = 'app-facet-menu';
    menu.id = id + '-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', title);
    /* tabindex=-1: on mousedown over a row Chrome sends focus to the next
       focusable ANCESTOR. Without this attribute that is main#content — the
       focusout guard below took it for «outside» and closed the menu BETWEEN
       mousedown and mouseup; the click fell through to the page behind
       («the row does nothing»). With tabindex=-1 focus stays inside the menu
       and the row toggles reliably. */
    menu.tabIndex = -1;
    button.setAttribute('aria-controls', menu.id);

    var reset = null;   // built below; relabel() keeps it up to date

    function relabel() {
      var n = K.state.facets[key].length;
      value.textContent = title + (n ? ' (' + n + ')' : '');
      value.className = 'app-facet-value' + (n ? ' ob-active' : '');
      button.setAttribute('aria-label', n ? K.t('facets.selectedCount', { title: title, n: n }) : title);
      if (reset) reset.disabled = n === 0;
    }

    items.forEach(function (e, idx) {
      /* DELIBERATELY not a <label>: depending on the engine the native
         label forwarding produced a second click on the checkbox despite
         preventDefault — toggle plus un-toggle looked like «the row does
         nothing». A neutral container with ONE explicit handler is
         unambiguous in every browser; the accessible name comes from
         aria-labelledby. */
      var row = document.createElement('div');
      row.className = 'app-facet-option';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'ob-checkbox';
      cb.value = e.value;
      cb.checked = K.state.facets[key].indexOf(e.value) !== -1;

      var textId = id + '-opt-' + idx;
      cb.setAttribute('aria-labelledby', textId);
      cb.addEventListener('change', function () {
        var selection = K.state.facets[key];
        var i = selection.indexOf(e.value);
        if (cb.checked && i === -1) selection.push(e.value);
        if (!cb.checked && i !== -1) selection.splice(i, 1);
        relabel();
        reevaluate();
      });

      row.addEventListener('click', function (ev) {
        if (ev.target === cb) return;   // direkter Checkbox-Klick: nativer Weg
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
      });

      row.appendChild(cb);
      row.appendChild(K.e('span', '', e.text)).id = textId;
      menu.appendChild(row);
    });

    var footer = document.createElement('div');
    footer.className = 'app-facet-footer';
    reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'ob-button ob-button-tertiary';
    reset.textContent = K.t('facets.clear');
    reset.addEventListener('click', function () {
      K.state.facets[key] = [];
      Array.prototype.forEach.call(menu.querySelectorAll('input'), function (cb) {
        cb.checked = false;
      });
      relabel();
      reevaluate();
    });
    footer.appendChild(reset);
    menu.appendChild(footer);

    box.appendChild(menu);
    relabel();

    function auf(zustand) {
      menu.hidden = !zustand;
      button.setAttribute('aria-expanded', String(zustand));
    }
    button.addEventListener('click', function () { auf(menu.hidden); });
    box.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !menu.hidden) { auf(false); button.focus(); }
    });
    /* Only act on focusout with a known target: Safari and Firefox/macOS do
       not focus clicked checkboxes (relatedTarget = null) — the menu would
       otherwise close on the first click on an option. Clicks outside are
       handled by the collective listener in wire(). */
    box.addEventListener('focusout', function (ev) {
      if (ev.relatedTarget && !box.contains(ev.relatedTarget)) auf(false);
    });

    el.facets.appendChild(box);
  }

  /* Whatever is narrowing the result belongs visibly above the list —
     otherwise one hunts for the reason behind a short result list inside
     the collapsed selection fields. */
  var FACET_TITLES = { catalogue: 'facets.catalog', status: 'facets.status', milestone: 'facets.milestone' };

  function renderFilterBar() {
    var st = K.state;
    var box = el['filter-bar'];
    box.innerHTML = '';

    /* On the object-type level only the milestone filter and the search
       apply — chips for catalogue and maturity would claim a filter that
       does not bite there. The state is kept and reappears on the
       overview. */
    var effective = st.objectType ? ['milestone'] : Object.keys(FACET_TITLES);

    var chips = [];
    effective.forEach(function (key) {
      (st.facets[key] || []).forEach(function (value) {
        chips.push({ kind: K.t(FACET_TITLES[key]), value: value, key: key });
      });
    });
    if (el['search-input'].value.trim()) {
      chips.push({ kind: K.t('search.label'), value: el['search-input'].value.trim(), key: 'search' });
    }

    box.hidden = !chips.length;
    if (!chips.length) return;

    chips.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ob-chip';
      b.setAttribute('aria-label', K.t('chips.remove', { kind: p.kind, value: p.value }));

      var kind = document.createElement('span');
      kind.className = 'app-chip-kind';
      kind.textContent = p.kind + ':';
      b.appendChild(kind);
      b.appendChild(K.e('span', 'app-chip-value', p.value));
      b.appendChild(K.icon('xmark', 'ob-chip-trailing-icon'));

      b.addEventListener('click', function () {
        if (p.key === 'search') {
          el['search-input'].value = '';
        } else {
          var list = st.facets[p.key];
          var i = list.indexOf(p.value);
          if (i !== -1) list.splice(i, 1);
        }
        buildFacets();
        reevaluate();
        focusAfterChip();
      });

      box.appendChild(b);
    });

    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'ob-button ob-button-tertiary';
    reset.textContent = K.t('chips.reset');
    reset.addEventListener('click', function () {
      Object.keys(FACET_TITLES).forEach(function (k) { st.facets[k] = []; });
      el['search-input'].value = '';
      buildFacets();
      reevaluate();
      focusAfterChip();
    });
    box.appendChild(reset);
  }

  /* Removing a chip removes the focused element — focus must not fall
     silently onto <body>. */
  function focusAfterChip() {
    var nextChip = el['filter-bar'].querySelector('.ob-chip');
    (nextChip || el['search-input']).focus();
  }

  /* The milestone column only earns its place once it distinguishes
     something. With 6 of 719 rows carrying a milestone it would be 713 empty
     rows of boxes. */
  function milestoneColumnPaysOff(list, hasMilestones) {
    if (!K.state.allMilestones || !K.state.allMilestones.length) return false;
    if (K.state.facets.milestone.length) return true;
    var withMilestone = list.filter(hasMilestones).length;
    return withMilestone > 0 && withMilestone >= list.length / 3;
  }

  /* ---------- Sorting ---------- */

  /* Fields per level — a t= parameter carrying a field of the wrong level
     would otherwise resort silently, without any column header showing it. */
  var SORT_OVERVIEW = ['name', 'count', 'status', 'source'];
  var SORT_ATTRIBUTES   = ['name', 'pset', 'type', 'status'];

  /* Clicking the same column header reverses the direction; a new column
     starts ascending — numeric columns descending (the large first). */
  function sortBy(field, start) {
    var st = K.state;
    if (st.sort && st.sort.field === field) {
      st.sort.direction = -st.sort.direction;
    } else {
      st.sort = { field: field, direction: start || 1 };
    }
    st.page = 1;
    writeUrl(true);
    render();
  }

  function comparator(field, direction) {
    return function (a, b) {
      var x = a[field], y = b[field], r;
      if (typeof x === 'number' || typeof y === 'number') r = (x || 0) - (y || 0);
      else r = String(x || '').localeCompare(String(y || ''), 'de');
      /* stable secondary key, so equal values do not jump around */
      if (r === 0 && field !== 'name') {
        r = String(a.name || '').localeCompare(String(b.name || ''), 'de');
      }
      return r * direction;
    };
  }

  function sorted(list) {
    var s = K.state.sort;
    return s ? list.slice().sort(comparator(s.field, s.direction)) : list;
  }

  /* Changing a filter does not change the level: whoever touches the
     milestone filter inside an object type stays inside it. */
  function reevaluate() {
    K.state.highlighted = null;
    K.state.page = 1;
    writeUrl(true);
    render();
  }

  function searchTerm() { return el['search-input'].value.trim().toLowerCase(); }

  /* ---------- Selection ---------- */

  function objectTypeByUri(uri) {
    var t = K.state.entries.filter(function (e) { return e.uri === uri; });
    return t.length ? t[0] : null;
  }

  function visibleObjectTypes() {
    var s = searchTerm();
    var f = K.state.facets;

    return K.state.entries.filter(function (e) {
      if (f.catalogue.length && f.catalogue.indexOf(e.source) === -1) return false;
      if (f.status.length && f.status.indexOf(e.status) === -1) return false;
      if (f.milestone.length && !e.milestones.some(function (p) { return f.milestone.indexOf(p) !== -1; })) {
        return false;
      }
      if (!s) return true;
      if (e.name.toLowerCase().indexOf(s) !== -1) return true;
      if (e.description && e.description.toLowerCase().indexOf(s) !== -1) return true;
      return e.psets.some(function (p) { return p.name.toLowerCase().indexOf(s) !== -1; });
    });
  }

  function visibleAttributes(uri) {
    var attributes = K.state.detail[uri];
    if (!attributes) return null;
    var s = searchTerm();
    var f = K.state.facets;
    return attributes.filter(function (m) {
      if (f.milestone.length && !m.milestones.some(function (p) { return f.milestone.indexOf(p) !== -1; })) {
        return false;
      }
      if (!s) return true;
      var heu = (m.name + ' ' + m.pset + ' ' + m.description + ' ' + m.ifcTyp).toLowerCase();
      return heu.indexOf(s) !== -1;
    });
  }

  function attributeByUri() {
    var st = K.state;
    var list = st.objectType ? st.detail[st.objectType] : null;
    if (!list) return null;
    var t = list.filter(function (m) { return m.uri === st.attribute; });
    return t.length ? t[0] : null;
  }

  /* ---------- State in the URL ---------- */

  /* replaceState=true writes the state without a history entry: typing in
     the search box, paging and fine-tuning filters must not flood the back
     button with intermediate states — changing level or view should. */
  function writeUrl(replaceState) {
    if (K.state.silent) return;
    var st = K.state, p = [];

    if (st.objectType) p.push('o=' + encodeURIComponent(st.objectType));
    if (st.attribute)   p.push('m=' + encodeURIComponent(st.attribute));
    if (st.view !== 'list') p.push('v=' + st.view);
    if (st.language !== 'de') p.push('l=' + st.language);
    if (st.sort) p.push('t=' + st.sort.field + (st.sort.direction < 0 ? '.d' : ''));
    /* The writing and reading sides must stay in step: a new parameter
       belongs HERE and in readUrl() — both encode symmetrically. */
    if (st.facets.catalogue.length) {
      p.push('k=' + st.facets.catalogue.map(encodeURIComponent).join(','));
    }
    if (st.facets.status.length) {
      p.push('r=' + st.facets.status.map(encodeURIComponent).join(','));
    }
    if (st.facets.milestone.length) {
      p.push('p=' + st.facets.milestone.map(encodeURIComponent).join(','));
    }
    if (el['search-input'].value.trim()) p.push('q=' + encodeURIComponent(el['search-input'].value.trim()));
    if (st.page > 1) p.push('s=' + st.page);
    if (st.perPage !== 50) p.push('n=' + st.perPage);

    /* The guide is its own top-level page: «#anleitung» (plus the language),
       nothing of the catalogue state — the «Katalog» entry in the navigation
       returns to the plain overview. */
    if (st.guide) p = ['anleitung'].concat(st.language !== 'de' ? ['l=' + st.language] : []);

    var next = p.length ? '#' + p.join('&') : '#';
    /* location.hash returns an empty string for a bare «#» — without this
       compensation the base state would produce dead history entries. */
    if (next !== (location.hash || '#')) {
      if (replaceState) history.replaceState(null, '', next);
      else history.pushState(null, '', next);
    }
  }

  /* The reading side of writeUrl() — every parameter appears in both
     functions. Broken percent encoding (truncated shared links) must not
     paralyse the application: dec() falls back to the raw value. */
  function dec(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  /* Returns true when a reload was started (a language change in the URL) —
     the caller should then not render with the old state. */
  function readUrl() {
    var st = K.state, p = {};
    /* Read from href, not from location.hash: some browsers decode the hash
       on read and broke encoded &/= inside search terms. */
    var raw = location.href.split('#')[1] || '';
    var guide = false;
    raw.split('&').forEach(function (part) {
      var i = part.indexOf('=');
      if (i > 0) p[part.slice(0, i)] = part.slice(i + 1);
      /* «#anleitung» opens the guide; «#guide-…» are the anchors of its
         table of contents — the browser scrolls, the page stays. */
      else if (part === 'anleitung' || part.indexOf('guide-') === 0) guide = true;
    });
    st.guide = guide;

    function list(value) {
      return value ? value.split(',').map(dec).filter(Boolean) : [];
    }

    st.silent = true;
    st.facets.catalogue = list(p.k);
    st.facets.status  = list(p.r);
    st.facets.milestone   = list(p.p);
    el['search-input'].value = p.q ? dec(p.q) : '';
    st.view = (p.v === 'gallery' || p.v === 'graph') ? p.v : 'list';
    updateViewButtons(st.view);
    st.objectType = p.o ? dec(p.o) : null;
    st.attribute   = p.m ? dec(p.m) : null;
    st.page     = Math.max(1, parseInt(p.s, 10) || 1);
    st.perPage  = K.PAGE_SIZES.indexOf(parseInt(p.n, 10)) !== -1
                     ? parseInt(p.n, 10) : K.PAGE_SIZES[0];
    /* On the guide an address without «l=» (a table-of-contents anchor)
       keeps the current language instead of falling back to German */
    st.language   = K.LANGUAGES.indexOf(p.l) !== -1 ? p.l : (guide ? st.language : 'de');
    el.language.value = st.language;
    st.highlighted = null;   // transient graph state does not survive navigation
    st.sort = null;
    if (p.t) {
      var t = p.t.split('.');
      var allowed = p.o ? SORT_ATTRIBUTES : SORT_OVERVIEW;
      if (allowed.indexOf(t[0]) !== -1) {
        st.sort = { field: t[0], direction: t[1] === 'd' ? -1 : 1 };
      }
    }
    st.silent = false;

    /* A different language in the URL (back button, shared link): update
       the interface and reload the catalogue in that language. */
    if (st.connection && st.connection.language !== st.language) {
      K.translateStatic();
      load();
      return true;
    }

    /* A shared link may point at an entry this catalogue does not know —
       that must not end silently on the overview. Nothing is checked before
       the data arrives (popstate during the initial load), otherwise a valid
       deep link would be wrongly erased. */
    if (st.entries.length && st.objectType && !objectTypeByUri(st.objectType)) {
      setStatus(K.t('errors.unknownType'), true);
      st.objectType = null;
      st.attribute = null;
      writeUrl(true);
    }

    /* The same check for the attribute once the detail is in the cache —
       otherwise a «…» crumb would stay up for a phantom attribute. */
    if (st.attribute && st.objectType && st.detail[st.objectType] && !attributeByUri()) {
      setStatus(K.t('errors.unknownAttr'), true);
      st.attribute = null;
      writeUrl(true);
    }

    buildFacets();
    if (st.objectType && !st.detail[st.objectType]) loadDetail(st.objectType);
  }

  /* ---------- Navigation ---------- */

  /* Pressed state of the three view buttons — the only writing site */
  function updateViewButtons(name) {
    ['list', 'gallery', 'graph'].forEach(function (v) {
      document.getElementById('v-' + v).setAttribute('aria-pressed', String(v === name));
    });
  }

  K.goToOverview = function () {
    K.state.objectType = null;
    K.state.attribute = null;
    K.state.highlighted = null;
    K.state.sort = null;   // jede Ebene startet in ihrer Standardreihenfolge
    writeUrl();
    render(true);
  };

  K.goToObjectType = function (uri) {
    if (!objectTypeByUri(uri)) return;
    /* Returning from an attribute to the same object type keeps the sort —
       only a real change starts in the default order. */
    if (K.state.objectType !== uri) K.state.sort = null;
    K.state.objectType = uri;
    K.state.attribute = null;
    /* The highlight travels along if the target type carries that property
       set — the radial view then opens with the group in focus. */
    var target = objectTypeByUri(uri);
    if (!(K.state.highlighted && target && target.psets.some(function (p) {
      return p.name === K.state.highlighted;
    }))) K.state.highlighted = null;
    writeUrl();
    render(true);
    if (!K.state.detail[uri]) loadDetail(uri);
  };

  K.goToAttribute = function (uri) {
    K.state.attribute = uri;
    writeUrl();
    render(true);
  };

  /* Follow-up queries run against the state frozen at load time — not
     against the dialog field, which may have been changed since. */
  function connection() {
    return K.state.connection ||
           { endpoint: endpointUrl(), graph: namedGraphUri(), language: K.state.language };
  }

  function loadDetail(uri) {
    var e = objectTypeByUri(uri);
    var v = connection();
    var gen = K.state.generation;
    delete K.state.detailError[uri];
    busy(true, K.t('loading.attrsOf', { name: e ? e.name : '…' }));
    K.fetchDetail(v, uri).then(function () {
      busy(false);
      if (gen !== K.state.generation) return;   // inzwischen next geladen
      if (K.state.objectType !== uri) return;
      /* An attribute requested by link may turn out to be unknown */
      if (K.state.attribute && !attributeByUri()) {
        setStatus(K.t('errors.unknownAttr'), true);
        K.state.attribute = null;
        writeUrl(true);
        render();
        return;
      }
      setStatus(K.state.detailWithoutValues[uri] ? K.t('values.warning') : '',
                !!K.state.detailWithoutValues[uri]);
      /* With a deep link to an attribute the target view only appears now —
         focus should move there, or the change goes unnoticed. */
      render(!!K.state.attribute);
    }).catch(function (err) {
      busy(false);
      if (gen !== K.state.generation) return;
      K.state.detailError[uri] = errorText(err);
      setStatus(K.t('errors.attrsFailed'), true);
      if (K.state.objectType === uri) render();
    });
  }

  /* ---------- Breadcrumbs ---------- */

  /* The current level is not an action — it is rendered as a <span>, not as
     a disabled button (which screen readers would announce as
     «unavailable» or skip). */
  function crumb(text, onClick, current, language) {
    var li = document.createElement('li');
    var b = document.createElement(current ? 'span' : 'button');
    b.className = 'ob-breadcrumb-label';
    b.appendChild(K.text(text, language));
    if (current) {
      b.setAttribute('aria-current', 'page');
    } else {
      b.type = 'button';
      if (onClick) b.addEventListener('click', onClick);
    }
    li.appendChild(b);
    return li;
  }

  function separator() {
    var li = document.createElement('li');
    var s = document.createElement('span');
    s.className = 'ob-breadcrumb-separator';
    s.setAttribute('aria-hidden', 'true');
    s.appendChild(K.icon('chevron_right_small'));
    li.appendChild(s);
    return li;
  }

  function renderBreadcrumb() {
    var st = K.state;
    el.breadcrumb.innerHTML = '';

    /* The crumb appears from depth 2 on. On the overview it would consist of
       one unlinked item directly above the identical H1 — a path with one
       element carries no information. */
    el.breadcrumb.parentNode.hidden = !st.objectType;
    el.breadcrumb.appendChild(crumb(K.t('overview.title'), K.goToOverview, !st.objectType));

    if (st.objectType) {
      var e = objectTypeByUri(st.objectType);
      el.breadcrumb.appendChild(separator());
      el.breadcrumb.appendChild(crumb(e ? e.name : '…',
        function () { K.goToObjectType(st.objectType); }, !st.attribute,
        e && e.language));
    }
    if (st.attribute) {
      var m = attributeByUri();
      el.breadcrumb.appendChild(separator());
      el.breadcrumb.appendChild(crumb(m ? m.name : '…', null, true, m && m.language));
    }
  }

  /* ---------- Page header ---------- */

  function title(text, kennzahlen, description, language) {
    el['page-title'].textContent = text;
    /* lang markup relative to the INTERFACE language: even a German data
       label needs it when the interface speaks French. */
    if (language && language !== K.state.language) el['page-title'].setAttribute('lang', language);
    else el['page-title'].removeAttribute('lang');
    el['page-meta'].textContent = kennzahlen || '';
    el['page-lead'].hidden = !description;
    el['page-lead'].textContent = description || '';
    document.title = text + ' – KBOB Data Dictionary';
  }

  /* ---------- Rendering ---------- */

  function render(focus) {
    var st = K.state;

    /* The guide does not depend on the catalogue: it renders while the
       data is still loading or has failed, and hands the content area back
       untouched afterwards. */
    updateMainNav();
    if (st.guide) {
      showGuide();
      if (focus) el['page-title'].focus();
      return;
    }
    el['view-guide'].hidden = true;
    if (el.placeholder.hidden && !st.entries.length) el.placeholder.hidden = false;
    if (!st.entries.length) return;
    el.toolbar.hidden = false;
    el['page-header'].hidden = false;

    /* The clear button in the search field follows the field content — also
       when the value was set programmatically (URL, chip removed) */
    var clearButton = document.getElementById('search-clear');
    if (clearButton) {
      var hasValue = !!el['search-input'].value;
      clearButton.hidden = !hasValue;
      /* Oblique gates the clear button on the wrapper class rather than on
         [hidden] — carrying it means a future Oblique text-control stylesheet
         drops straight onto this markup (core/_text-control.scss). */
      clearButton.parentNode.classList.toggle('ob-text-control-clear-has-value', hasValue);
    }

    renderBreadcrumb();

    var onAttribute = !!(st.attribute && attributeByUri());

    /* The way back one level up is the breadcrumb (from depth 2 on) — one
       mechanism, as in the Oblique master layout; a second «back» button
       beside it duplicated the same destination. */

    /* On the attribute level there is nothing to search, filter or switch —
       the toolbar would only be pretending. */
    el.toolbar.hidden = onAttribute;
    if (onAttribute) el['filter-bar'].hidden = true;
    else renderFilterBar();

    /* Base state per render pass: the show* functions then set only what
       actually displays something on their level. */
    el['result-count'].textContent = '';

    if (onAttribute)        showAttribute();
    else if (st.objectType) showObjectType();
    else                   showOverview();

    updateFacetsToggle();

    /* After a level change focus sits on the new heading — otherwise the
       rebuild drops it silently onto <body>. */
    if (focus) el['page-title'].focus();
  }

  /* The guide («Anleitung»): static content in #view-guide, the shared page
     header carries title and figures line; toolbar, filters, paging and
     the loading tile of the catalogue step aside. */
  function showGuide() {
    el.breadcrumb.parentNode.hidden = true;
    el.toolbar.hidden = true;
    el['filter-bar'].hidden = true;
    el.paginator.hidden = true;
    el.placeholder.hidden = true;
    el['page-header'].hidden = false;
    title(K.t('guide.title'), K.t('guide.meta'), null);
    showView('guide');
    loadGuide(K.state.language);
  }

  /* The guide text is one HTML fragment per language (data/guide/<lang>.html),
     fetched once and kept; a language without a fragment falls back to
     German and says so above the text. The fragment's language is marked
     on the container (WCAG 3.1.2), the table-of-contents anchor of the
     address is honoured once the content is there. */
  var guideCache = {};
  var guideRequest = 0;
  function loadGuide(language) {
    var target = el['guide-content'];
    var note = el['guide-lang-note'];
    var myRequest = ++guideRequest;

    function show(html, shownLanguage) {
      if (myRequest !== guideRequest) return;   // a newer language won
      target.innerHTML = html;
      target.setAttribute('lang', shownLanguage);
      note.hidden = shownLanguage === language;
      var anchor = /(^#|&)(guide-[^&]+)/.exec(location.hash);
      var section = anchor && document.getElementById(anchor[2]);
      if (section) section.scrollIntoView();
    }

    function fetchFragment(lang) {
      if (guideCache[lang]) return Promise.resolve(guideCache[lang]);
      return fetch('data/guide/' + lang + '.html').then(function (res) {
        if (!res.ok) throw new Error(String(res.status));
        return res.text();
      }).then(function (html) { guideCache[lang] = html; return html; });
    }

    if (guideCache[language]) { show(guideCache[language], language); return; }
    target.innerHTML = '';
    target.appendChild(K.loadingContent(K.t('guide.loading')));
    fetchFragment(language).then(function (html) {
      show(html, language);
    }, function () {
      if (language === 'de') { show('<p>' + K.t('errors.network') + '</p>', 'de'); return; }
      fetchFragment('de').then(function (html) { show(html, 'de'); },
        function () { show('<p>' + K.t('errors.network') + '</p>', 'de'); });
    });
  }
  K.loadGuide = loadGuide;

  /* aria-current and .active in the Oblique main navigation follow the
     page: the catalogue on every catalogue level, the guide on its page */
  function updateMainNav() {
    var guide = !!K.state.guide;
    [['nav-catalog', !guide], ['nav-guide', guide]].forEach(function (pair) {
      var a = document.getElementById(pair[0]);
      if (!a) return;
      a.classList.toggle('active', pair[1]);
      if (pair[1]) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  /* Phones only (CSS shows the button below sm): the facet fields are
     folded away behind one «Filter» button; its label carries the number of
     facets currently narrowing THIS level. The active values themselves are
     visible anyway — as chips above the list. */
  function updateFacetsToggle() {
    var st = K.state;
    var effective = st.objectType ? ['milestone'] : Object.keys(FACET_TITLES);
    var n = effective.reduce(function (s, k) { return s + (st.facets[k] || []).length; }, 0);
    var title = K.t('facets.toggle');
    el['facets-toggle'].querySelector('.app-facets-toggle-label').textContent =
      title + (n ? ' (' + n + ')' : '');
    el['facets-toggle'].setAttribute('aria-label',
      n ? K.t('facets.selectedCount', { title: title, n: n }) : title);
    /* Nothing to fold away when no facet applies on this level */
    var any = Array.prototype.some.call(el.facets.children, function (box) { return !box.hidden; });
    el['facets-toggle'].hidden = !any;
  }
  K.render = render;

  /* Trims the list to the current page and renders the controls. The graph
     does not paginate — it always shows the whole selection. */
  function pageSlice(total) {
    var st = K.state;
    var pages = Math.max(1, Math.ceil(total / st.perPage));
    if (st.page > pages) {
      st.page = pages;
      writeUrl(true);   // the URL must not stay on a phantom page
    }

    var from = (st.page - 1) * st.perPage;
    var to = Math.min(from + st.perPage, total);

    el.paginator.hidden = (st.view === 'graph') || total === 0;
    if (el.paginator.hidden) return { from: from, to: to };

    el.paginator.innerHTML = '';

    var rangeLabel = document.createElement('span');
    rangeLabel.className = 'app-paginator-range';
    rangeLabel.textContent = total <= st.perPage
      ? K.formatNumber(total) + ' ' + K.plural(total, K.t('unit.entry'), K.t('unit.entries'))
      : K.t('paginator.range', { from: K.formatNumber(from + 1), to: K.formatNumber(to), total: K.formatNumber(total) });
    el.paginator.appendChild(rangeLabel);

    /* With a single page there is nothing to page through — «page 1 of 1»
       with dead buttons would be pure inventory. The entry count stays. */
    if (pages > 1) {
      var nav = document.createElement('span');
      nav.className = 'app-paginator-nav';

      /* Four icon buttons as in the Oblique paginator (first/previous/
         next/last page); the icon comes from the sprite in currentColor,
         the accessible name from aria-label. */
      var button = function (classUri, icon, label, target, off) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'app-paginator-button ' + classUri;
        b.setAttribute('aria-label', label);
        b.disabled = off;
        b.appendChild(K.icon(icon));
        b.addEventListener('click', function () {
          st.page = target;
          writeUrl(true);
          render();
          el['page-title'].focus();
        });
        return b;
      };

      nav.appendChild(button('app-paginator-first', 'chevron_left_double', K.t('paginator.first'), 1, st.page <= 1));
      nav.appendChild(button('app-paginator-prev', 'chevron_left', K.t('paginator.prev'), st.page - 1, st.page <= 1));
      var stand = document.createElement('span');
      stand.textContent = K.t('paginator.pageOf', { page: st.page, pages: pages });
      nav.appendChild(stand);
      nav.appendChild(button('app-paginator-next', 'chevron_right', K.t('paginator.next'), st.page + 1, st.page >= pages));
      nav.appendChild(button('app-paginator-last', 'chevron_right_double', K.t('paginator.last'), pages, st.page >= pages));
      el.paginator.appendChild(nav);
    }

    if (total > K.PAGE_SIZES[0]) {
      var field = document.createElement('div');
      field.className = 'app-paginator-size';
      var lab = document.createElement('label');
      lab.className = 'app-field-label';
      lab.setAttribute('for', 'pro-page');
      lab.textContent = K.t('paginator.perPage');
      var sel = document.createElement('select');
      sel.id = 'pro-page';
      sel.className = 'ob-select';
      K.PAGE_SIZES.forEach(function (n) {
        var o = document.createElement('option');
        o.value = n; o.textContent = n;
        if (n === st.perPage) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () {
        st.perPage = parseInt(sel.value, 10);
        st.page = 1;
        writeUrl(true);
        render();
      });
      field.appendChild(lab);
      field.appendChild(sel);
      el.paginator.appendChild(field);
    }

    return { from: from, to: to };
  }

  /* The only place that knows the four view containers */
  function showView(name) {
    if (name !== 'graph') closeGraphPanel(false);
    ['list', 'gallery', 'graph', 'attribute', 'guide'].forEach(function (v) {
      el['view-' + v].hidden = (v !== name);
    });
  }

  /* Message tile — one blueprint for all of them: loading states as a
     spinner area, everything else as an Oblique alert (type: info | warning
     | error). The action button sits AFTER the alert (deviation C6 in
     docs/OBLIQUE.md): Oblique foresees no controls inside the alert. */
  function message(target, opt) {
    target.innerHTML = '';
    if (opt.loading) {
      var loadingBox = K.e('div', 'app-loading');
      loadingBox.appendChild(K.spinner());
      loadingBox.appendChild(document.createTextNode(opt.title));
      target.appendChild(loadingBox);
      return;
    }
    var alert = K.e('div', 'ob-alert ob-alert-' + (opt.type || 'info'));
    var h = document.createElement('p');
    var bt = document.createElement('b');
    bt.textContent = opt.title;
    h.appendChild(bt);
    alert.appendChild(h);
    if (opt.text) {
      var p = document.createElement('p');
      p.textContent = opt.text;
      alert.appendChild(p);
    }
    target.appendChild(alert);
    if (opt.action) {
      var b = K.button('ob-button ob-button-primary', opt.action.text, opt.action.onClick);
      target.appendChild(b);
      if (opt.action.fokus) b.focus();
    }
  }

  /* --- Overview: all object types, flat and faceted --- */

  /* Are the search or the facets currently narrowing the view? */
  function isFiltered() {
    var f = K.state.facets;
    return !!(searchTerm() || f.catalogue.length || f.status.length || f.milestone.length);
  }

  function showOverview() {
    var st = K.state;
    showFacets(['catalogue', 'status', 'milestone']);
    el['search-input'].placeholder = K.t('search.phOverview');

    var list = sorted(visibleObjectTypes());
    var attributes = list.reduce(function (s, e) { return s + e.count; }, 0);

    /* All three figures describe the visible selection — a constant
       catalogue number next to filtered values would be a property of the
       whole holding stated in the wrong sentence. */
    var sources = {};
    list.forEach(function (e) { sources[e.source] = true; });
    var nQuellen = Object.keys(sources).length;

    title(K.t('overview.title'),
      K.formatNumber(list.length) + ' ' + K.plural(list.length, K.t('unit.type'), K.t('unit.types')) +
      ' · ' + K.formatNumber(attributes) + ' ' + K.plural(attributes, K.t('unit.attr'), K.t('unit.attrs')) +
      ' · ' + K.formatNumber(nQuellen) + ' ' + K.plural(nQuellen, K.t('unit.catalog'), K.t('unit.catalogs')),
      K.t('overview.lead'));

    /* The counter only adds something while a filter is active — unfiltered,
       the same number already stands in the figures. The live region
       stays. */
    el['result-count'].textContent = isFiltered()
      ? K.t('common.nOfTotal', { n: K.formatNumber(list.length), total: K.formatNumber(st.entries.length) })
      : '';

    var off = pageSlice(list.length);
    var page = list.slice(off.from, off.to);
    var mitPhase = milestoneColumnPaysOff(list, function (e) { return e.milestones.length; });

    if (st.view === 'list') {
      showView('list');
      var columns = [
        { title: K.t('col.type'), width: '22%', sort: 'name' },
        { title: K.t('col.description') },
        { title: K.t('col.attrs'), width: '90px', alignEnd: true, sort: 'count', sortStart: -1 },
        { title: K.t('col.status'), width: '100px', sort: 'status' }
      ];
      if (mitPhase) columns.push({ title: K.t('col.milestone'), width: '130px' });
      columns.push({ title: K.t('col.catalog'), width: '18%', sort: 'source' });

      K.renderList({
        title: K.t('table.captionOverview'),
        columns: columns,
        sort: st.sort,
        onSort: sortBy,
        rows: page.map(function (e) {
          var cells = [
            function () {
              return K.rowButton(e.name, e.language,
                function () { K.goToObjectType(e.uri); });
            },
            function () {
              if (!e.description) return K.emptyValue(K.t('empty.description'));
              var s = document.createElement('span');
              s.className = 'app-desc';
              s.textContent = e.description;
              return s;
            },
            function () { return String(e.count); },
            function () { return statusText(e.status) || K.emptyValue(K.t('empty.status')); }
          ];
          if (mitPhase) cells.push(function () { return K.milestones(e.milestones, st.allMilestones); });
          cells.push(function () { return e.source; });
          return {
            onClick: function () { K.goToObjectType(e.uri); },
            cells: cells
          };
        })
      });
    } else if (st.view === 'gallery') {
      showView('gallery');
      K.renderGallery({ cards: page.map(function (e) {
        return {
          name: e.name, language: e.language,
          count: e.count, countText: K.t('unit.attrs'),
          text: e.description,
          tags: e.status ? [{ name: e.status, title: statusExplanation(e.status) }] : [],
          footer: e.source,
          onClick: function () { K.goToObjectType(e.uri); }
        };
      }) });
    } else {
      showView('graph');
      overviewGraph(list);
    }
  }

  /* A network only as long as it stays readable. Document types are left
     out — they would flood the network and all carry the same small
     attribute schema. Whoever explicitly filters for them still gets them. */
  /* ---------- Graph: side panel, highlighting, signature ----------
     Clicking a node shows its details in the panel; navigation happens only
     through the action inside the panel. Highlighting runs as a pure DOM
     operation (no relayout), and an unchanged set of nodes is not rebuilt at
     all — viewBox and zoom stay put. */

  var networkPsetData = {};     // Schluessel -> {name, objectTypes, attributes}
  var buildNetworkLegend = null;
  var letzteNetzSig = '';
  var letzteRadialSig = '';

  function searchNodes(id) {
    var all = el['graph-canvas'].querySelectorAll('.app-graph-node');
    for (var i = 0; i < all.length; i++) {
      if (all[i].getAttribute('data-id') === id) return all[i];
    }
    return null;
  }

  function closeGraphPanel(fokusZurueck) {
    var panel = el['graph-panel'];
    if (panel.hidden) return;
    var selection = K.state.graphAuswahl;
    panel.hidden = true;
    panel.innerHTML = '';
    K.state.graphAuswahl = null;
    K.markGraphSelection(null);
    if (fokusZurueck && selection && selection.knotenId) {
      var g = searchNodes(selection.knotenId);
      (g || el['graph-canvas']).focus();
    }
  }

  /* One blueprint for every kind of panel: head (kind, name, close),
     optional description, key rows, actions. Focus moves to the title;
     Escape and the close button hand it back to the node. */
  function showGraphPanel(data) {
    var panel = el['graph-panel'];
    panel.innerHTML = '';
    panel.hidden = false;
    K.state.graphAuswahl = data.merker;
    K.markGraphSelection(data.merker.knotenId || null);

    var head = K.e('div', 'app-graph-panel-head');
    var titleBox = K.e('div', 'app-graph-panel-title');
    titleBox.appendChild(K.e('span', 'app-graph-panel-kind', data.kind));
    var h = K.e('h2', '', null);
    h.tabIndex = -1;
    h.appendChild(K.text(data.name, data.language));
    titleBox.appendChild(h);
    head.appendChild(titleBox);
    var zu = K.button('app-graph-panel-close', null, function () { closeGraphPanel(true); });
    zu.setAttribute('aria-label', K.t('common.close'));
    zu.appendChild(K.icon('xmark'));
    head.appendChild(zu);
    panel.appendChild(head);

    if (data.description) {
      panel.appendChild(K.e('p', 'app-graph-panel-desc', K.truncate(data.description, 280)));
    }

    if (data.rows && data.rows.length) {
      var dl = K.e('dl', 'app-graph-panel-data');
      data.rows.forEach(function (z) {
        if (!z[1]) return;
        dl.appendChild(K.e('dt', '', z[0]));
        var dd = K.e('dd', '');
        if (typeof z[1] === 'string') dd.textContent = z[1];
        else dd.appendChild(z[1]);
        dl.appendChild(dd);
      });
      panel.appendChild(dl);
    }

    var actions = K.e('div', 'app-graph-panel-actions');
    (data.actions || []).forEach(function (a) {
      var b = K.button('ob-button ' + (a.primaer ? 'ob-button-primary' : 'ob-button-secondary'),
                      a.text, a.onClick);
      if (a.gedrueckt !== undefined) b.setAttribute('aria-pressed', String(a.gedrueckt));
      if (a.name) b.setAttribute('data-action', a.name);
      actions.appendChild(b);
    });
    panel.appendChild(actions);

    panel.addEventListener('keydown', onPanelEscape);
    if (data.fokus !== false) h.focus();
  }

  function onPanelEscape(ev) {
    if (ev.key === 'Escape') { ev.stopPropagation(); closeGraphPanel(true); }
  }

  function showPanelObjectType(e, knotenId, fokus) {
    showGraphPanel({
      merker: { kind: 'type', uri: e.uri, knotenId: knotenId },
      kind: K.t('graph.legendType'), name: e.name, language: e.language,
      description: e.description,
      rows: [
        [K.t('col.attrs'), K.formatNumber(e.count)],
        [K.t('col.psets'), K.formatNumber(e.psets.length)],
        [K.t('col.status'), e.status || ''],
        [K.t('col.catalog'), e.source]
      ],
      actions: [
        { text: K.t('common.open'), primaer: true, name: 'oeffnen',
          onClick: function () { K.goToObjectType(e.uri); } }
      ],
      fokus: fokus
    });
  }

  function showPanelPset(key, knotenId, fokus) {
    var d = networkPsetData[key];
    if (!d) return;
    var active = K.state.highlighted === d.name;
    showGraphPanel({
      merker: { kind: 'pset', key: key, knotenId: knotenId },
      kind: K.t('graph.legendPset'), name: d.name,
      rows: [
        [K.t('overview.title'), K.formatNumber(d.objectTypes)],
        [K.t('col.attrs'), K.formatNumber(d.attributes)]
      ],
      actions: [
        { text: active ? K.t('graph.highlightOff') : K.t('graph.highlightOn'),
          gedrueckt: active, name: 'highlighted',
          onClick: function () { toggleNetworkHighlight(d.name, key, knotenId); } },
        { text: K.t('graph.showInList'), name: 'list',
          onClick: function () {
            el['search-input'].value = d.name;
            K.state.page = 1;
            setView('list');
          } }
      ],
      fokus: fokus
    });
  }

  function toggleNetworkHighlight(name, key, knotenId) {
    K.state.highlighted = (K.state.highlighted === name) ? null : name;
    K.networkHighlight();
    if (buildNetworkLegend) buildNetworkLegend();
    /* Relabel the panel, focus stays on the toggle button */
    showPanelPset(key, knotenId, false);
    var button = el['graph-panel'].querySelector('[data-action="highlighted"]');
    if (button) button.focus();
    K.setStatus(K.state.highlighted
      ? K.t('graph.highlighted', { name: name })
      : K.t('graph.highlightCleared'));
  }

  function clearNetworkHighlight() {
    K.state.highlighted = null;
    K.networkHighlight();
    if (buildNetworkLegend) buildNetworkLegend();
    var offen = K.state.graphAuswahl;
    if (offen && offen.kind === 'pset') showPanelPset(offen.key, offen.knotenId, false);
    K.setStatus(K.t('graph.highlightCleared'));
  }

  function showPanelAttribute(m, e, knotenId, fokus) {
    showGraphPanel({
      merker: { kind: 'attribute', uri: m.uri, knotenId: knotenId },
      kind: K.t('col.attr'), name: m.name, language: m.language,
      description: (m.description && m.description !== m.name) ? m.description : '',
      rows: [
        [K.t('col.pset'), m.pset],
        [K.t('col.datatype'), m.type || ''],
        [K.t('col.unit'), m.unit || ''],
        [K.t('col.status'), m.status || ''],
        [K.t('col.values'), m.list && m.list.count
          ? K.formatNumber(m.list.count) + ': ' + K.truncateList(m.list.values, 90) : '']
      ],
      actions: [
        { text: K.t('common.open'), primaer: true, name: 'oeffnen',
          onClick: function () { K.goToAttribute(m.uri); } }
      ],
      fokus: fokus
    });
  }

  /* A network only as long as it stays readable. Document types are left
     out — they would flood the network and all carry the same small
     attribute schema. Whoever filters for them still gets them. */
  function overviewGraph(list) {
    el['graph-title'].textContent = K.t('graph.titleOverview');

    if (!list.length) {
      graphMessage(K.t('graph.emptyTitle'), K.t('graph.emptyTypes'), false, 'emptyValue');
      return;
    }

    var networkList = list.filter(function (e) { return !e.isDocument; });
    if (!networkList.length) networkList = list;   // the selection consists of document types only
    var hidden = list.length - networkList.length;

    if (networkList.length > K.NETWORK_MAX) {
      graphMessage(K.t('graph.tooManyTitle'),
                   K.t('graph.tooMany', { n: K.formatNumber(networkList.length), max: K.NETWORK_MAX }));
      return;
    }
    graphMessage(null);

    var hintText = K.t('graph.overviewHint') + ' ' +
      (hidden ? K.t('graph.docsHidden', { n: K.formatNumber(hidden) }) + ' ' : '') +
      K.t('graph.controls');

    /* Unchanged set of nodes: build nothing anew — update the highlight and
       the legend, and respect the user's viewBox. */
    var v = connection();
    var sig = [v.graph, K.state.language]
      .concat(networkList.map(function (e) { return e.uri; })).join('|');
    if (sig === letzteNetzSig && el['graph-canvas'].getAttribute('data-modus') === 'netz') {
      el['graph-hint'].textContent = hintText;
      K.networkHighlight();
      if (buildNetworkLegend) buildNetworkLegend();
      return;
    }
    letzteNetzSig = sig;
    closeGraphPanel(false);

    var nodes = [], edges = [], nachPset = {};
    networkPsetData = {};
    networkList.forEach(function (e) {
      var k = {
        id: 'o:' + e.uri, name: e.name, kind: 'type', classUri: 'app-graph-dot-type',
        color: '#2379a4' /* ob interaction-state */, form: 'kreis',
        r: 4 + Math.sqrt(e.count) * 1.5,
        announce: e.name + ', ' + e.count + ' ' +
                  K.plural(e.count, K.t('unit.attr'), K.t('unit.attrs')) + ', ' + e.source,
        rows: [e.source, e.count + ' ' +
                 K.plural(e.count, K.t('unit.attr'), K.t('unit.attrs'))],
        onClick: function () { showPanelObjectType(e, 'o:' + e.uri); }
      };
      nodes.push(k);
      e.psets.forEach(function (p) {
        /* Key = URI (identically named sets from different catalogues stay
           separate nodes); the highlight matches the NAME — there it is the
           domain term that matters. */
        var key = p.uri || 'name:' + p.name;
        var pk = nachPset[key];
        if (!pk) {
          pk = nachPset[key] = {
            id: 'p:' + key, name: p.name, kind: 'pset', classUri: 'app-graph-dot-pset',
            color: '#46596b' /* ob secondary-hover */, form: 'quadrat',
            r: 5, stark: true, objectTypes: 0, attributes: 0,
            onClick: (function (s, kid) {
              return function () { showPanelPset(s, kid); };
            })(key, 'p:' + key)
          };
          nodes.push(pk);
        }
        pk.objectTypes++;
        pk.attributes += p.n;
        edges.push({ a: k, b: pk, n: p.n });
      });
    });

    Object.keys(nachPset).forEach(function (s) {
      var pk = nachPset[s];
      pk.r = 5 + Math.sqrt(pk.objectTypes) * 2.2;
      pk.announce = K.t('graph.psetVorlesen', { name: pk.name, t: pk.objectTypes, a: pk.attributes });
      pk.rows = [K.t('graph.legendPset'),
                   K.t('graph.psetIn', { t: pk.objectTypes, a: pk.attributes })];
      networkPsetData[s] = { name: pk.name, objectTypes: pk.objectTypes, attributes: pk.attributes };
    });

    buildNetworkLegend = function () {
      K.renderLegend([
        { name: K.t('graph.legendType'), n: networkList.length, color: '#2379a4' },
        { name: K.t('graph.legendPset'), n: Object.keys(nachPset).length,
          color: '#46596b', form: 'quadrat' },
        K.state.highlighted
          ? { hint: K.t('graph.highlighted', { name: K.state.highlighted }),
              onDismiss: clearNetworkHighlight,
              ariaLabel: K.t('graph.highlightOff') }
          : { hint: K.t('graph.dotSize') }
      ]);
    };

    K.renderNetwork(nodes, edges, null, hintText, K.t('graph.contentTitle'));
    buildNetworkLegend();
  }

  /* --- One object type and its attributes --- */

  function showObjectType() {
    var st = K.state;
    var e = objectTypeByUri(st.objectType);
    if (!e) { K.goToOverview(); return; }

    /* Catalogue and maturity do not apply here — show only what filters */
    showFacets(['milestone']);
    el['search-input'].placeholder = K.t('search.phType');

    var attributes = visibleAttributes(e.uri);
    if (attributes) attributes = sorted(attributes);

    if (attributes === null && st.detailError[e.uri]) {
      showDetailError(e);
      return;
    }

    if (attributes === null) {
      /* The figures line stays empty — the content spinner already says it */
      title(e.name, '', e.description, e.language);
      el.paginator.hidden = true;
      showView(st.view);
      /* The loading state turns where the eye is: in the content area */
      if (st.view === 'list') {
        K.renderList({ title: e.name, columns: [{ title: K.t('col.attr') }], rows: [],
                         emptyText: K.t('loading.attrs'), loading: true });
      } else if (st.view === 'gallery') {
        K.renderGallery({ cards: [], emptyText: K.t('loading.attrs'), loading: true });
      } else {
        graphMessage(K.t('loading.attrs'), '', true);
      }
      return;
    }

    var psets = {};
    attributes.forEach(function (m) { psets[m.pset] = true; });
    var nPsets = Object.keys(psets).length;

    title(e.name,
      K.formatNumber(attributes.length) +
      (attributes.length === e.count ? ''
        : ' ' + K.t('common.ofTotal', { total: K.formatNumber(e.count) })) +
      ' ' + K.plural(e.count, K.t('unit.attr'), K.t('unit.attrs')) + ' · ' +
      nPsets + ' ' + K.plural(nPsets, K.t('unit.pset'), K.t('unit.psets')) + ' · ' + e.source,
      e.description, e.language);

    el['result-count'].textContent = (searchTerm() || st.facets.milestone.length)
      ? K.t('common.nOfTotal', { n: K.formatNumber(attributes.length), total: K.formatNumber(e.count) })
      : '';

    var off = pageSlice(attributes.length);
    var page = attributes.slice(off.from, off.to);
    var mitPhase = milestoneColumnPaysOff(attributes, function (m) { return m.milestones.length; });

    if (st.view === 'list') {
      showView('list');
      /* Description as its own column (as in the overview); tag order as in
         the attribute detail: property set, datatype, maturity */
      var columns = [
        { title: K.t('col.attr'), width: '18%', sort: 'name' },
        { title: K.t('col.description') },
        { title: K.t('col.pset'), width: '16%', sort: 'pset' },
        { title: K.t('col.datatype'), width: '90px', sort: 'type' },
        { title: K.t('col.status'), width: '90px', sort: 'status' }
      ];
      if (mitPhase) columns.push({ title: K.t('col.milestone'), width: '130px' });
      columns.push({ title: K.t('col.unitValues'), width: '18%' });

      K.renderList({
        title: K.t('table.captionType', { name: e.name }),
        columns: columns,
        sort: st.sort,
        onSort: sortBy,
        rows: page.map(function (m) {
          var cells = [
            function () {
              return K.rowButton(m.name, m.language,
                function () { K.goToAttribute(m.uri); });
            },
            function () {
              if (!m.description || m.description === m.name) {
                return K.emptyValue(K.t('empty.description'));
              }
              var s = document.createElement('span');
              s.className = 'app-desc';
              s.textContent = m.description;
              return s;
            },
            function () { return psetCell(e, m); },
            function () { return m.type || K.emptyValue(K.t('empty.type')); },
            function () { return statusText(m.status) || K.emptyValue(K.t('empty.status')); }
          ];
          if (mitPhase) cells.push(function () { return K.milestones(m.milestones, st.allMilestones); });
          cells.push(function () { return valuesCell(m); });
          return { onClick: function () { K.goToAttribute(m.uri); }, cells: cells };
        })
      });
    } else if (st.view === 'gallery') {
      showView('gallery');
      K.renderGallery({ cards: page.map(function (m) {
        return {
          name: m.name, language: m.language,
          text: (m.description && m.description !== m.name) ? m.description : '',
          tags: [{ name: m.pset, color: e.color[m.pset] }]
            .concat(m.type ? [{ name: m.type }] : [])
            .concat(m.status ? [{ name: m.status, title: statusExplanation(m.status) }] : []),
          footer: [m.unit, m.ifcTyp,
                 m.list && m.list.count ? m.list.count + ' ' + K.t('col.values') : '']
                 .filter(Boolean).join(' · '),
          onClick: function () { K.goToAttribute(m.uri); }
        };
      }) });
    } else {
      showView('graph');
      if (!attributes.length) {
        graphMessage(K.t('graph.emptyTitle'), K.t('graph.emptyAttrs'), false, 'emptyValue');
        return;
      }
      graphMessage(null);
      el['graph-title'].textContent = K.t('graph.attrsOf', { name: e.name });
      var radialSignature = [connection().graph, st.language, e.uri]
        .concat(attributes.map(function (m) { return m.uri; })).join('|');
      if (radialSignature !== letzteRadialSig) closeGraphPanel(false);
      letzteRadialSig = radialSignature;
      K.renderRadial(e, attributes,
        K.t('graph.typeHint', { name: e.name }) + ' ' + K.t('graph.controls'),
        function (uri) {
          var m = null;
          (st.detail[e.uri] || []).forEach(function (kand) { if (kand.uri === uri) m = kand; });
          if (m) showPanelAttribute(m, e, 'm:' + uri);
        }, radialSignature);
    }
  }

  /* If the detail query fails, «loading …» must not stay up — the same rule
     as for the initial load (finding K1), one level down. */
  function showDetailError(e) {
    title(e.name, K.t('errors.attrsLoadFailedMeta'), null, e.language);
    el.paginator.hidden = true;
    /* The error tile sits in the list container — the switch state and
       aria-pressed follow along instead of contradicting it. */
    K.state.view = 'list';
    updateViewButtons('list');
    writeUrl(true);
    showView('list');

    el['view-list'].innerHTML = '';
    var box = K.e('div', 'app-message');
    message(box, {
      title: K.t('errors.attrsTitle'),
      text: K.state.detailError[e.uri],
      type: 'error',
      action: { text: K.t('common.retry'), onClick: function () { loadDetail(e.uri); } }
    });
    el['view-list'].appendChild(box);
  }

  /* ---------- Domain cells: KBOB-specific DOM building blocks ----------
     Deliberately in app.js, not in views.js: they know catalogue semantics
     (maturity explanations, IFC psets, value lists) and are shared by the
     table, the gallery and the attribute detail. */

  /* Maturity. So far the catalogue only knows Candidate and Preview —
     nothing is adopted. That belongs on every entry. Only known values are
     explained: a future status «Approved» must not be labelled «not yet
     adopted». */
  var STATUS_EXPLANATION = { Candidate: 'status.candidate', Preview: 'status.preview' };
  function statusExplanation(value) {
    return STATUS_EXPLANATION[value] ? K.t(STATUS_EXPLANATION[value]) : '';
  }

  /* Plain text in table cells and in the detail — the column header or the
     label already names it, and a tag shape around a single word would be
     pure framing (one text style). Tags stay in the gallery, where several
     values share one row. */
  function statusText(value) {
    if (!value) return null;
    var s = K.text(value, 'en');   // data values are English
    if (STATUS_EXPLANATION[value]) s.title = statusExplanation(value);
    return s;
  }

  /* Instead of an empty canvas: say what to do — or, with a turning ring,
     that something is on its way. */
  function graphMessage(title, text, loading, stil) {
    var zeigen = !!title;
    el['graph-message'].hidden = !zeigen;
    el['graph-frame'].hidden = zeigen;
    el['graph-hint'].hidden = zeigen;
    if (!zeigen) return;
    /* The text version must not outlive the previous graph, and an open
       panel belongs to a graph that is no longer there. */
    el['graph-text'].innerHTML = '';
    closeGraphPanel(false);
    if (!loading && stil === 'emptyValue') {
      /* An empty selection is not an alarm: the same quiet line as in the
         list and the gallery instead of a blue alert tile. */
      el['graph-message'].innerHTML = '';
      var z = K.e('p', 'app-no-results', title + (text ? ' ' + text : ''));
      el['graph-message'].appendChild(z);
      return;
    }
    message(el['graph-message'], { title: title, text: text, loading: loading });
  }

  /* Without a colour dot: in the table the name carries the meaning — the
     property-set colours stay reserved for the graphic and the gallery. */
  function psetCell(e, m) {
    var box = document.createElement('span');
    box.className = 'app-pset';
    var pn = document.createElement('span');
    pn.textContent = m.pset;
    if (m.ifcPset) {
      var ip = document.createElement('span');
      ip.className = 'app-pset-ifc';
      ip.appendChild(document.createTextNode('IFC: '));
      ip.appendChild(K.breakable(m.ifcPset));
      pn.appendChild(ip);
    }
    box.appendChild(pn);
    return box;
  }

  function valuesCell(m) {
    var box = document.createDocumentFragment();
    var etwas = false;
    if (m.unit) {
      var eh = document.createElement('span');
      eh.className = 'app-unit';
      eh.textContent = m.unit;
      box.appendChild(eh);
      etwas = true;
    }
    if (m.list && m.list.count) {
      var w = document.createElement('span');
      w.className = 'app-values';
      w.textContent = K.t('values.count', { n: m.list.count, values: K.truncateList(m.list.values, 70) });
      box.appendChild(w);
      etwas = true;
    }
    return etwas ? box : K.emptyValue(K.t('empty.unitValues'));
  }

  /* --- One attribute --- */

  function showAttribute() {
    var e = objectTypeByUri(K.state.objectType);
    var m = attributeByUri();
    if (!e || !m) { K.state.attribute = null; render(); return; }

    showView('attribute');
    el.paginator.hidden = true;   // the paginator belongs to the list above it

    title(m.name, e.name + ' · ' + m.pset + ' · ' + e.source, null, m.language);

    /* Section structure following the I14Y detail pages: H2 sections, below
       them a bold label over a plain value. */
    var target = el['attribute-detail'];
    target.innerHTML = '';

    function section(name) {
      var s = K.e('section', 'app-detail-section');
      s.appendChild(K.e('h2', '', name));
      target.appendChild(s);
      return s;
    }

    /* With emptyMeaning the row appears even without a value — as an honest
       «—» like in the table. Without emptyMeaning it is dropped entirely. */
    function row(dl, t, value, emptyMeaning) {
      if (!value && !emptyMeaning) return;
      var dt = document.createElement('dt');
      dt.textContent = t;
      var dd = document.createElement('dd');
      if (!value) dd.appendChild(K.emptyValue(emptyMeaning));
      else if (typeof value === 'string') dd.textContent = value;
      else dd.appendChild(value);
      dl.appendChild(dt); dl.appendChild(dd);
    }

    var allg = section(K.t('detail.general'));
    var dlA = K.e('dl', 'app-data-list');
    allg.appendChild(dlA);
    row(dlA, K.t('col.description'),
          (m.description && m.description !== m.name) ? m.description : null,
          K.t('empty.description'));
    row(dlA, K.t('col.type'), K.text(e.name, e.language));
    row(dlA, K.t('col.pset'), psetCell(e, m));
    row(dlA, K.t('col.catalog'), e.source);
    row(dlA, K.t('col.status'), statusText(m.status), K.t('empty.status'));

    /* IRI with a copy button, like the I14Y permalink field */
    var iri = K.e('span', 'app-copy');
    iri.appendChild(K.e('span', 'app-mono', m.uri));
    var kopier = K.button('ob-button ob-button-secondary ob-icon-button', null, function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(m.uri).then(
          function () { setStatus(K.t('detail.copied')); },
          function () { setStatus(K.t('detail.copyFailed'), true); });
      } else {
        setStatus(K.t('detail.copyFailed'), true);
      }
    });
    kopier.setAttribute('aria-label', K.t('detail.copyAria'));
    kopier.title = K.t('detail.copyTitle');
    kopier.appendChild(K.icon('copy'));
    iri.appendChild(kopier);
    row(dlA, K.t('detail.iri'), iri);

    var type = section(K.t('detail.typeUnit'));
    var dlT = K.e('dl', 'app-data-list');
    type.appendChild(dlT);
    row(dlT, K.t('col.datatype'), m.type, K.t('empty.type'));
    row(dlT, K.t('col.unit'), m.unit, K.t('empty.unit'));
    row(dlT, K.t('col.ifcType'), m.ifcTyp);
    row(dlT, K.t('col.ifcPset'), m.ifcPset);

    var values = section(K.t('col.values') +
      (m.list && m.list.count ? ' (' + m.list.count + ')' : ''));
    if (m.list && m.list.count) {
      values.appendChild(K.e('p', 'app-values-list', m.list.values));
    } else {
      values.appendChild(K.e('p', '', K.t('detail.noValues')));
    }

    if (K.state.allMilestones && K.state.allMilestones.length) {
      var loin = section(K.t('detail.milestones'));
      if (m.milestones.length) loin.appendChild(K.milestones(m.milestones, K.state.allMilestones));
      else loin.appendChild(K.e('p', '', K.t('detail.noMilestone')));
    }
  }

  /* ---------- View ---------- */

  function setView(name) {
    K.state.view = name;
    updateViewButtons(name);
    if (K.state.attribute) K.state.attribute = null;
    /* transient means transient: the highlight does not survive a view
       change — as with the back button (readUrl) */
    K.state.highlighted = null;
    writeUrl();
    render();
  }
  K.setView = setView;

  /* ---------- Excel export (XLSX, js/export.js) ---------- */

  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* A workbook with three sheets: object types (one row per object type),
     attributes (one row per attribute and object type) and info (source,
     date, applied filters). «Datentyp» is the translated display value
     (Auswahl, Ja/Nein …), «Datentyp (Katalog)» the raw value from the graph
     (STRING, REAL …) — an integrator needs both. The value separator in the
     «Zulässige Werte» column is « · ». */
  function objectSheetHeader() {
    return [K.t('col.type'), K.t('col.description'), K.t('col.status'), K.t('col.catalog'),
            K.t('col.attrCount'), K.t('col.psets'), K.t('col.milestones'), K.t('col.typeUri')];
  }
  var OBJECT_WIDTHS = [32, 70, 12, 30, 16, 44, 22, 56];

  function attributeSheetHeader() {
    return [K.t('col.type'), K.t('col.attr'), K.t('col.description'), K.t('col.pset'),
            K.t('col.datatype'), K.t('col.datatypeRaw'), K.t('col.unit'), K.t('col.values'),
            K.t('col.status'), K.t('col.ifcPset'), K.t('col.ifcType'), K.t('col.milestones'),
            K.t('col.attrUri')];
  }
  var ATTRIBUTE_WIDTHS = [30, 30, 70, 24, 12, 17, 9, 56, 12, 24, 16, 22, 56];

  function objectRow(e) {
    return [e.name, e.description, e.status, e.source, e.count,
            e.psets.map(function (p) { return p.name; }).join(' · '),
            e.milestones.join(' '), e.uri];
  }

  function attributeRow(e, m) {
    return [e.name, m.name, m.description, m.pset, m.type, m.typeRaw, m.unit,
            m.list ? m.list.values : '', m.status, m.ifcPset, m.ifcTyp,
            m.milestones.join(' '), m.uri];
  }

  function infoSheet(nObjekte, nMerkmale) {
    var st = K.state;
    var v = connection();
    var rows = [
      [K.t('export.source'), K.t('export.sourceValue')],
      [K.t('connection.endpoint'), v.endpoint],
      [K.t('connection.graph'), v.graph],
      [K.t('export.language'), v.language.toUpperCase()],
      [K.t('export.date'), new Date().toLocaleDateString(K.locale())],
      [K.t('overview.title'), nObjekte],
      [K.t('col.attrs'), nMerkmale]
    ];
    if (el['search-input'].value.trim()) rows.push([K.t('export.filterSearch'), el['search-input'].value.trim()]);
    if (st.facets.catalogue.length) rows.push([K.t('export.filterCatalog'), st.facets.catalogue.join(', ')]);
    if (st.facets.status.length) rows.push([K.t('export.filterStatus'), st.facets.status.join(', ')]);
    if (st.facets.milestone.length) rows.push([K.t('export.filterMilestone'), st.facets.milestone.join(', ')]);
    rows.push([K.t('export.app'), 'https://github.com/bbl-dres/kbob-data']);
    return { name: K.t('export.sheetInfo'), header: [K.t('export.key'), K.t('export.value')],
             rows: rows, widths: [28, 70] };
  }

  function saveWorkbook(objects, fileName) {
    var st = K.state;
    var attributeRows = [];
    var withoutValues = false;
    objects.forEach(function (e) {
      if (st.detailWithoutValues[e.uri]) withoutValues = true;
      var attributes = (st.objectType === e.uri ? visibleAttributes(e.uri) : st.detail[e.uri]) || [];
      attributes.forEach(function (m) { attributeRows.push(attributeRow(e, m)); });
    });

    saveBlob(K.xlsxBlob([
      { name: K.t('export.sheetTypes'), header: objectSheetHeader(), widths: OBJECT_WIDTHS,
        rows: objects.map(objectRow) },
      { name: K.t('export.sheetAttrs'), header: attributeSheetHeader(), widths: ATTRIBUTE_WIDTHS,
        rows: attributeRows },
      infoSheet(objects.length, attributeRows.length)
    ]), fileName);

    setStatus(K.t('export.done', {
                types: K.formatNumber(objects.length) + ' ' +
                       K.plural(objects.length, K.t('unit.type'), K.t('unit.types')),
                attrs: K.formatNumber(attributeRows.length)
              }) + (withoutValues ? ' ' + K.t('export.doneNoValues') : ''),
              withoutValues);
  }

  /* An export takes up to a few seconds (one bulk query plus building the
     XLSX). For that whole time the CD spinner arc turns INSIDE the button:
     the feedback sits where the click happened, not only in the status line.
     aria-busy is the single source for both the visuals and the spoken
     state; the button stays disabled so a second click cannot start a
     parallel export. */
  function setExportBusy(busyState) {
    el.xlsx.disabled = busyState;
    if (busyState) el.xlsx.setAttribute('aria-busy', 'true');
    else el.xlsx.removeAttribute('aria-busy');
  }

  /* Building the workbook is synchronous and blocks the frame. Deferring it
     by one turn lets the browser paint the spinner first — otherwise the
     button would only start turning after the work was already done. */
  function saveWorkbookBusy(entries, fileName) {
    setExportBusy(true);
    setTimeout(function () {
      try {
        saveWorkbook(entries, fileName);
      } catch (err) {
        setStatus(K.t('export.abort', { err: errorText(err) }), true);
      }
      setExportBusy(false);
    }, 0);
  }

  /* One object type: straight from the cache. The whole selection: every
     attribute arrives in ONE query (K.fetchAllDetails) — which is why the
     export no longer needs a limit. */
  function exportExcel() {
    var st = K.state;

    /* On the object-type level exactly that object type is exported — if its
       detail is still missing it is fetched first, instead of quietly
       falling into the whole-catalogue branch. */
    if (st.objectType) {
      var e = objectTypeByUri(st.objectType);
      if (!e) return;
      if (st.detail[e.uri]) {
        saveWorkbookBusy([e], 'kbob-' + K.fileName(e.name) + '.xlsx');
        return;
      }
      setExportBusy(true);
      busy(true, K.t('loading.attrsOf', { name: e.name }));
      var typeGen = st.generation;
      K.fetchDetail(connection(), e.uri).then(function () {
        if (typeGen !== st.generation) { setExportBusy(false); return; }
        saveWorkbookBusy([e], 'kbob-' + K.fileName(e.name) + '.xlsx');
      }).catch(function (err) {
        setExportBusy(false);
        if (typeGen !== st.generation) return;
        setStatus(K.t('export.abort', { err: errorText(err) }), true);
      });
      return;
    }

    var selection = visibleObjectTypes();
    if (!selection.length) {
      setStatus(K.t('export.empty'), true);
      return;
    }

    var missing = selection.some(function (e) { return !st.detail[e.uri]; });
    if (!missing) {
      saveWorkbookBusy(selection, 'kbob-' + K.fileName('data-dictionary') + '.xlsx');
      return;
    }

    setExportBusy(true);
    busy(true, K.t('export.loading'));
    var gen = st.generation;

    K.fetchAllDetails(connection()).then(function () {
      if (gen !== st.generation) {
        setExportBusy(false);
        setStatus(K.t('export.abortReload'), true);
        return;
      }
      saveWorkbookBusy(selection, 'kbob-' + K.fileName('data-dictionary') + '.xlsx');
    }).catch(function (err) {
      setExportBusy(false);
      if (gen !== st.generation) return;
      setStatus(K.t('export.abort', { err: errorText(err) }), true);
    });
  }

  /* ---------- Showing the queries ---------- */

  function showQuery(which) {
    ['overview', 'detail', 'values'].forEach(function (w) {
      document.getElementById('tab-' + w).setAttribute('aria-pressed', String(w === which));
    });
    var g = namedGraphUri();
    var l = K.state.language;
    var beispiel = K.state.objectType ||
                   (K.state.entries.length ? K.state.entries[0].uri : 'https://beispiel/classUri');
    document.getElementById('query-text').value =
      which === 'overview' ? K.overviewQuery(g, l)
      : which === 'detail'   ? K.detailQuery(g, beispiel, l)
      :                         K.valuesQuery(g, l);
  }

  /* ---------- Wiring ---------- */

  function wire() {
    /* An early, named diagnosis instead of a late «Cannot read properties of null» */
    Object.keys(el).forEach(function (id) {
      if (!el[id]) throw new Error('index.html: Element #' + id + ' fehlt');
    });

    /* The local proxy passes its query target along as a marker — more
       robust than a byte replacement on the value attribute (see
       lindas-proxy.py). */
    if (window.KBOB_PROXY) el.endpoint.value = window.KBOB_PROXY;

    el.reload.addEventListener('click', load);

    /* Main navigation: handled in script so that the language survives
       (the plain «#» of the catalogue entry would drop «l=»); the hrefs stay
       for open-in-new-tab. */
    document.getElementById('nav-catalog').addEventListener('click', function (ev) {
      ev.preventDefault();
      K.state.guide = false;
      K.goToOverview();
    });
    document.getElementById('nav-guide').addEventListener('click', function (ev) {
      ev.preventDefault();
      if (K.state.guide) { el['page-title'].focus(); return; }
      K.state.guide = true;
      writeUrl();
      render(true);
    });

    /* Phones: fold the facet fields in and out (see updateFacetsToggle) */
    el['facets-toggle'].addEventListener('click', function () {
      var open = el.toolbar.classList.toggle('app-facets-open');
      el['facets-toggle'].setAttribute('aria-expanded', String(open));
    });

    /* The language choice affects the catalogue labels: a new language
       means new queries — the catalogue is reloaded. */
    el.language.addEventListener('change', function () {
      K.state.language = el.language.value;
      K.translateStatic();
      writeUrl();
      load();
    });

    ['list', 'gallery', 'graph'].forEach(function (v) {
      document.getElementById('v-' + v).addEventListener('click', function () { setView(v); });
    });

    el.connection.addEventListener('click', function () {
      showQuery('overview');
      dlgConnection.showModal();
    });
    ['overview', 'detail', 'values'].forEach(function (w) {
      document.getElementById('tab-' + w).addEventListener('click', function () { showQuery(w); });
    });
    document.getElementById('close-connection')
      .addEventListener('click', function () { dlgConnection.close(); });
    /* Only report success if something was really copied — and inside the
       dialog itself: with a modal open the status line in the header is
       inert and invisible. */
    document.getElementById('copy-query').addEventListener('click', function () {
      var ta = document.getElementById('query-text');
      function ok() {
        el['copy-status'].textContent = K.t('connection.copied');
        setTimeout(function () { el['copy-status'].textContent = ''; }, 4000);
      }
      function fehl() {
        el['copy-status'].textContent = K.t('connection.copyFailed');
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(ok, fehl);
      } else {
        ta.select();
        var gelungen = false;
        try { gelungen = document.execCommand('copy'); } catch (e) {}
        if (gelungen) ok(); else fehl();
      }
    });

    el['accessibility-statement'].addEventListener('click', function () { dlgA11y.showModal(); });
    document.getElementById('close-a11y')
      .addEventListener('click', function () { dlgA11y.close(); });

    el.xlsx.addEventListener('click', exportExcel);

    /* Debounced: in the network a rebuild costs up to 200 ms. As with the
       facets: reset the page and the highlight — and do not flood the
       history with typing fragments (replaceState). */
    var searchTimer = null;
    el['search-input'].addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        K.state.page = 1;
        K.state.highlighted = null;
        writeUrl(true);
        render();
      }, K.SEARCH_DEBOUNCE_MS);
    });

    /* Clear button in the search field: clears at once, focus stays in the field */
    document.getElementById('search-clear').addEventListener('click', function () {
      el['search-input'].value = '';
      clearTimeout(searchTimer);
      K.state.page = 1;
      K.state.highlighted = null;
      writeUrl(true);
      render();
      el['search-input'].focus();
    });

    /* A click outside closes open facet menus — focusout alone does not
       carry (Safari/Firefox do not focus clicked checkboxes). */
    document.addEventListener('pointerdown', function (ev) {
      Array.prototype.forEach.call(el.facets.querySelectorAll('.app-facet-menu'), function (menu) {
        if (menu.hidden) return;
        var box = menu.parentNode;
        if (!box.contains(ev.target)) {
          menu.hidden = true;
          box.querySelector('.app-facet-toggle').setAttribute('aria-expanded', 'false');
        }
      });
    });

    window.addEventListener('popstate', function () {
      if (!readUrl()) render();   // bei Sprachwechsel zeichnet load() selbst
    });

    /* Oblique layout state: above 905px expanded (large logo, single-row
       header), below it collapsed + the mobile token density — the same
       threshold as in ob-master-layout. */
    var mq = window.matchMedia('(min-width: 905px)');
    function layoutKlassen() {
      var breit = mq.matches;
      document.body.classList.toggle('ob-layout-expanded', breit);
      document.body.classList.toggle('ob-layout-collapsed', !breit);
      document.body.classList.toggle('ob-viewport-mobile', !breit);
    }
    layoutKlassen();
    if (mq.addEventListener) mq.addEventListener('change', layoutKlassen);
    else if (mq.addListener) mq.addListener(layoutKlassen);

    /* The header sticks — the table headers need to know how tall it is */
    var head = document.querySelector('.ob-master-layout-header');
    function measureHeader() {
      document.documentElement.style.setProperty('--app-header-height', head.offsetHeight + 'px');
    }
    measureHeader();
    if (window.ResizeObserver) {
      var observer = new ResizeObserver(measureHeader);
      observer.observe(head);
    } else {
      window.addEventListener('resize', measureHeader);
    }

    /* Back-to-top tab: appears after half a window height — through the
       CD state class on <body> (ob-master-layout-scrolling), which the
       top-control styles key on */
    var toTop = document.getElementById('to-top');
    window.addEventListener('scroll', function () {
      document.body.classList.toggle('ob-master-layout-scrolling', window.scrollY >= window.innerHeight / 2);
    }, { passive: true });
    toTop.addEventListener('click', function () {
      var ruhig = window.matchMedia &&
                  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: ruhig ? 'auto' : 'smooth' });
      el['page-title'].focus();
    });

    /* Graph hooks: a click on empty space closes the panel; Escape closes
       the panel or clears the highlight. */
    K.onGraphBackground = function () { closeGraphPanel(false); };
    K.onGraphEscape = function () {
      if (!el['graph-panel'].hidden) { closeGraphPanel(true); return true; }
      if (K.state.highlighted && !K.state.objectType) { clearNetworkHighlight(); return true; }
      return false;
    };

    K.graphControls();

    /* The language has to come from the URL before the first load — it
       already determines the overview query. */
    var l = /[#&]l=(de|fr|it|en)(&|$)/.exec(location.hash);
    if (l) { K.state.language = l[1]; el.language.value = l[1]; }

    /* Static labels as soon as the dictionary has arrived — and the guide,
       if the address asks for it: it needs no catalogue and must not wait
       behind the loading tile. */
    K.state.guide = /(^#|&)(anleitung|guide-[^&]*)(&|$)/.test(location.hash);
    K.i18nReady.then(function () {
      K.translateStatic();
      if (K.state.guide) render();
    });
  }

  wire();
  load();      // without a click: the catalogue is already there when it opens
})(KBOB);
