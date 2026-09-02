/* Presentation.

   Three views of the same selection: list, gallery, graph. The renderers are
   generic — what is shown is decided by app.js, which hands it over fully
   described. The graph always has a text version and is keyboard operable;
   it is never the only source of a fact. */

var KBOB = window.KBOB || (window.KBOB = {});

(function (K) {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';

  /* Above this the network becomes unreadable and the O(N²) layout
     expensive. The cap counts object types; with property-set nodes that is
     really up to ~176 nodes and ~25 ms of layout — measured, acceptable. */
  K.NETWORK_MAX = 150;

  /* ---------- DOM shorthands ----------
     The createElement + className + content pattern appears dozens of times
     in app.js and views.js — K.e/K.button bundle it. Attributes (aria-*, id,
     title) are still set by the callers. New code uses the helpers; existing
     code is migrated when touched. */
  K.e = function (tag, cssClass, content) {
    var n = document.createElement(tag);
    if (cssClass) n.className = cssClass;
    if (content !== undefined && content !== null) {
      if (typeof content === 'string') n.textContent = content;
      else n.appendChild(content);
    }
    return n;
  };

  K.button = function (cssClass, content, onClick) {
    var b = K.e('button', cssClass, content);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  };

  function svgEl(name, attrs) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* Oblique icons: the sprite (assets/icons/obliqueIcons.svg) is injected
     into the body once, after which every <use href="#name"> resolves —
     including the references already sitting in the static markup. */
  (function loadSprite() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'assets/icons/obliqueIcons.svg', true);
    xhr.onload = function () {
      if (xhr.status !== 200 && xhr.status !== 0) return;
      var box = document.createElement('div');
      box.setAttribute('hidden', '');
      box.setAttribute('aria-hidden', 'true');
      box.innerHTML = xhr.responseText;
      document.body.insertBefore(box, document.body.firstChild);
    };
    xhr.send();
  })();

  /* An icon from the sprite — always decorative; the meaning is carried by
     the text or the aria-label of the surrounding control. */
  K.icon = function (name, cssClass) {
    var s = svgEl('svg', {
      class: 'ob-icon' + (cssClass ? ' ' + cssClass : ''),
      focusable: 'false', 'aria-hidden': 'true'
    });
    var u = document.createElementNS(SVGNS, 'use');
    u.setAttribute('href', '#' + name);
    u.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#' + name);
    s.appendChild(u);
    return s;
  };

  /* Oblique spinner (lib/spinner): a circular arc animated through ob-spin */
  K.spinner = function () {
    var s = svgEl('svg', { viewBox: '0 0 48 48', 'aria-hidden': 'true' });
    s.appendChild(svgEl('circle', {
      cx: 24, cy: 24, r: 20, fill: 'none',
      stroke: '#2F4356', 'stroke-miterlimit': 10, 'stroke-width': 4
    }));
    return s;
  };

  /* Loading note with a turning arc — for empty areas whose content is on
     its way. The arc is decorative; the text carries the meaning. */
  K.loadingContent = function (text) {
    var box = K.e('span', 'app-spinner-inline');
    box.appendChild(K.spinner());
    box.appendChild(document.createTextNode(text));
    return box;
  };

  /* Identifiers such as «Pset_ManufacturerTypeInformation» offer no break
     opportunity, so the browser breaks them mid-word. A <wbr> after every
     underscore gives it a sensible place — nothing changes visually, and the
     identifier is copied unchanged. */
  K.breakable = function (value) {
    var frag = document.createDocumentFragment();
    String(value).split('_').forEach(function (part, i) {
      if (i) {
        frag.appendChild(document.createTextNode('_'));
        frag.appendChild(document.createElement('wbr'));
      }
      frag.appendChild(document.createTextNode(part));
    });
    return frag;
  };

  K.emptyValue = function (meaning) {
    var s = document.createElement('span');
    s.className = 'app-empty';
    s.textContent = '—';
    if (meaning) {
      var sr = document.createElement('span');
      sr.className = 'ob-screen-reader-only';
      sr.textContent = meaning;
      s.appendChild(sr);
    }
    return s;
  };

  /* A label from the data. If its language differs from the INTERFACE
     language, that is marked up (WCAG 3.1.2 Language of Parts) — including a
     German fallback inside a French interface. */
  K.text = function (value, language) {
    var s = document.createElement('span');
    s.textContent = value;
    var ui = (K.state && K.state.language) || 'de';
    if (language && language !== ui) s.lang = language;
    return s;
  };

  /* LOIN milestones, compact: every known value as a box, the declared ones
     dark. Nine values fit into no table column otherwise. The digit is what
     is visible, the full value (LZPn) sits as a title on each box; the
     spoken text names the declared values in full. */
  K.milestones = function (declared, all) {
    if (!all || !all.length) return K.emptyValue(K.t('empty.milestone'));

    var box = document.createElement('span');
    box.className = 'app-phase-track';
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', declared.length
      ? K.t('phases.label', { list: declared.join(', ') })
      : K.t('phases.none'));
    box.title = declared.length
      ? K.t('phases.declared', { list: declared.join(', ') })
      : K.t('phases.noneDeclared');

    /* Drop the shared prefix (LZP), otherwise it gets too wide — the title
       on each box carries the full data value. */
    var prefix = /^[A-Za-z]+/.exec(all[0]);
    prefix = prefix ? prefix[0] : '';

    all.forEach(function (p) {
      var an = declared.indexOf(p) !== -1;
      var f = document.createElement('span');
      f.className = 'app-phase' + (an ? ' ob-active' : '');
      f.setAttribute('aria-hidden', 'true');
      f.title = an ? K.t('phases.yes', { p: p }) : K.t('phases.no', { p: p });
      f.textContent = prefix && p.indexOf(prefix) === 0 ? p.slice(prefix.length) : p;
      box.appendChild(f);
    });
    return box;
  };

  /* One badge shape for all tags; color adds a swatch (gallery) */
  K.tags = function (items) {
    var box = K.e('span', 'app-tags');
    items.forEach(function (m) {
      var t = K.e('span', 'app-tag');
      if (m.title) t.title = m.title;
      if (m.color) {
        var sw = K.e('span', 'app-swatch');
        sw.style.background = m.color;
        t.appendChild(sw);
      }
      t.appendChild(document.createTextNode(m.name));
      if (m.n !== undefined && m.n !== null) {
        t.appendChild(K.e('span', 'app-tag-count', String(m.n)));
      }
      box.appendChild(t);
    });
    return box;
  };

  /* =========================================================
     Liste
     ========================================================= */

  /* The first cell carries the button. That keeps the row's table semantics
     instead of merging it into a single button. */
  K.renderList = function (spec) {
    var target = K.el['view-list'];
    target.innerHTML = '';

    var tab = document.createElement('table');
    tab.className = 'ob-table';

    var cap = document.createElement('caption');
    cap.className = 'ob-screen-reader-only';
    cap.textContent = spec.title || '';
    tab.appendChild(cap);

    var thead = document.createElement('thead');
    var trh = document.createElement('tr');
    spec.columns.forEach(function (s) {
      var th = document.createElement('th');
      th.scope = 'col';
      if (s.width) th.style.width = s.width;
      if (s.alignEnd) th.className = 'app-align-end';

      /* Sortable columns carry a button in the header; the arrow is always
         in the tree (the ArrowUp glyph of the Oblique table header) —
         visible in full on the active column, hinted at on hover/focus,
         rotated when descending. aria-sort only on the active column. */
      if (s.sort && spec.onSort) {
        var b = K.button('app-sort', s.title,
                        function () { spec.onSort(s.sort, s.sortStart); });
        var active = spec.sort && spec.sort.field === s.sort;
        if (active) {
          th.setAttribute('aria-sort', spec.sort.direction > 0 ? 'ascending' : 'descending');
        }
        var pfeil = K.e('span', 'app-sort-arrow' +
                        (active && spec.sort.direction < 0 ? ' app-sort-arrow-desc' : ''));
        pfeil.setAttribute('aria-hidden', 'true');
        b.appendChild(pfeil);
        th.appendChild(b);
      } else {
        th.textContent = s.title;
      }
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    tab.appendChild(thead);

    var tbody = document.createElement('tbody');

    if (!spec.rows.length) {
      var tr0 = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.colSpan = spec.columns.length;
      td0.className = 'app-no-results';
      var emptyText = spec.emptyText || K.t('common.noResults');
      if (spec.loading) td0.appendChild(K.loadingContent(emptyText));
      else td0.textContent = emptyText;
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
    }

    spec.rows.forEach(function (z) {
      var tr = document.createElement('tr');
      if (z.id) tr.id = z.id;
      if (z.onClick) tr.className = 'app-row-clickable';

      z.cells.forEach(function (bau, i) {
        var td = document.createElement('td');
        if (spec.columns[i] && spec.columns[i].alignEnd) td.className = 'app-align-end';
        var content = bau();
        if (content !== null && content !== undefined) {
          if (typeof content === 'string') td.textContent = content;
          else td.appendChild(content);
        }
        tr.appendChild(td);
      });

      /* Clicking the row stays as a convenience for the mouse — it carries
         no semantics, the button in the first cell does. An active text
         selection wins: whoever is quoting is not navigated away. */
      if (z.onClick) {
        tr.addEventListener('click', function (ev) {
          if (ev.target.closest('button, a')) return;
          if (window.getSelection && String(window.getSelection())) return;
          z.onClick();
        });
      }
      tbody.appendChild(tr);
    });

    tab.appendChild(tbody);
    target.appendChild(tab);
  };

  K.rowButton = function (name, language, onClick) {
    return K.button('app-row-link', K.text(name, language), onClick);
  };

  /* =========================================================
     Galerie
     ========================================================= */

  /* spec: { cards, emptyText, loading } — named fields instead of a boolean
     trap at the call site. */
  K.renderGallery = function (spec) {
    var target = K.el.gallery;
    target.innerHTML = '';

    if (!spec.cards.length) {
      var p = K.e('p', 'app-no-results');
      var text = spec.emptyText || K.t('common.noResults');
      if (spec.loading) p.appendChild(K.loadingContent(text));
      else p.textContent = text;
      target.appendChild(p);
      return;
    }

    spec.cards.forEach(function (k) {
      /* Always a div — the button sits on the name and stretches its click
         area over the card through CSS. That way the card content does not
         merge into one long button name for screen readers. */
      var card = K.e('div', 'ob-card');
      var head = K.e('span', 'app-card-head');
      var nm = k.onClick
        ? K.button('ob-button-card', K.text(k.name, k.language), k.onClick)
        : K.e('span', 'app-card-name', K.text(k.name, k.language));
      head.appendChild(nm);
      if (k.count !== undefined && k.count !== null) {
        var n = K.e('span', 'app-tag app-tag-count', String(k.count));
        if (k.countText) n.appendChild(K.e('span', 'ob-screen-reader-only', ' ' + k.countText));
        head.appendChild(n);
      }
      card.appendChild(head);

      /* Header, then the content block (description + tags), then the
         signature line — the three blocks of the Oblique/Material card
         (header, content, signature), 16px apart. */
      if (k.text || (k.tags && k.tags.length)) {
        var body = K.e('div', 'app-card-body');
        if (k.text) body.appendChild(K.e('span', 'ob-card-content', k.text));
        if (k.tags && k.tags.length) body.appendChild(K.tags(k.tags));
        card.appendChild(body);
      }
      if (k.footer) card.appendChild(K.e('span', 'app-card-footer', k.footer));

      target.appendChild(card);
    });
  };

  /* =========================================================
     Graph — gemeinsame Mechanik
     ========================================================= */

  var vb = null, vbStart = null, inhaltBox = null;

  function setViewBox() {
    if (vb) K.el['graph-canvas'].setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
  }

  /* Font sizes are user coordinates: a tight viewBox scales the labels with
     it. The viewBox takes the aspect ratio of the frame; small clusters may
     start moderately enlarged (up to ~1.7×) so they do not sit as a tiny
     speck in an empty area — large graphs keep the 1:1 start. */
  function frame(minX, minY, maxX, maxY, rand) {
    var rect = K.el['graph-canvas'].getBoundingClientRect();
    var RW = rect.width || 1400, RH = rect.height || 900;
    var mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    var w = Math.max(maxX - minX, 10) + rand * 2;
    var h = Math.max(maxY - minY, 10) + rand * 2;
    inhaltBox = { x: minX - rand, y: minY - rand, w: w, h: h };
    var pages = RW / RH;
    if (w / h < pages) w = h * pages; else h = w / pages;
    if (w < RW) {
      var f = Math.max(w / RW, 0.6);
      w = RW * f; h = RH * f;
    }
    vb = { x: mx - w / 2, y: my - h / 2, w: w, h: h };
    vbStart = { x: vb.x, y: vb.y, w: vb.w, h: vb.h };
    setViewBox();
  }

  /* Hit areas are user coordinates and shrink with the scale — on large
     graphs in narrow frames below any touch usability. After the frame is
     known they are raised to at least ~24 CSS pixels in diameter
     (WCAG 2.5.8), measured against the starting scale. */
  function scaleHitAreas() {
    if (!vb) return;
    var rect = K.el['graph-canvas'].getBoundingClientRect();
    if (!rect.width) return;
    var minRadius = 12 * (vb.w / rect.width);
    Array.prototype.forEach.call(K.el['graph-canvas'].querySelectorAll('.app-graph-hit'), function (h) {
      if (parseFloat(h.getAttribute('r')) < minRadius) h.setAttribute('r', minRadius);
    });
  }

  function freshNetwork() {
    hideTooltip();   // a floating tooltip does not survive the rebuild
    K.el['graph-canvas'].innerHTML = '';
    K.el.legend.innerHTML = '';
    K.el['graph-text'].innerHTML = '';
    var g = svgEl('g', {});
    K.el['graph-canvas'].appendChild(g);
    return g;
  }

  /* Dieselbe Aussage ohne Bild */
  function textVersion(title, items) {
    var target = K.el['graph-text'];
    target.innerHTML = '';
    target.appendChild(K.e('h2', '', title));
    var ul = document.createElement('ul');
    items.forEach(function (t) { ul.appendChild(K.e('li', '', t)); });
    target.appendChild(ul);
  }

  /* Tooltip wiring per node — identical in the network and the radial view.
     Keyboard focus shows the same tooltip (WCAG parity): positioned at the
     node centre, gone on leave; Escape closes it (1.4.13). */
  function bindTooltip(g, zeig) {
    g.addEventListener('mouseenter', zeig);
    g.addEventListener('mousemove', moveTooltip);
    g.addEventListener('mouseleave', hideTooltip);
    g.addEventListener('focus', function () {
      var r = g.getBoundingClientRect();
      zeig({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    });
    g.addEventListener('blur', hideTooltip);
  }

  function nodeGroups(id, label, onClick) {
    var g = svgEl('g', {
      class: 'app-graph-node', 'data-id': id,
      tabindex: '0', role: 'button', 'aria-label': label
    });
    if (onClick) {
      g.addEventListener('click', onClick);
      g.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onClick(); }
      });
    }
    return g;
  }

  /* =========================================================
     Network: object types and their property sets
     ========================================================= */

  K.renderNetwork = function (nodes, edges, legend, hint, textTitle) {
    var root = freshNetwork();
    K.el['graph-canvas'].setAttribute('data-modus', 'netz');
    K.el['graph-hint'].textContent = hint || '';

    if (!nodes.length) {
      K.el['graph-hint'].textContent = K.t('common.noResults');
      return;
    }

    forceLayout(nodes, edges);

    var edgeLayer = svgEl('g', { 'aria-hidden': 'true' });
    root.appendChild(edgeLayer);
    edges.forEach(function (kn) {
      var line = svgEl('line', {
        x1: kn.a.x, y1: kn.a.y, x2: kn.b.x, y2: kn.b.y,
        class: 'app-graph-edge', 'data-a': kn.a.id, 'data-b': kn.b.id
      });
      /* Line width = shared attributes (inline style, because the
         .app-graph-edge rule would override presentation attributes) */
      if (kn.n) line.style.strokeWidth = Math.min(4, 0.8 + Math.sqrt(kn.n));
      edgeLayer.appendChild(line);
    });

    nodes.forEach(function (k) {
      var g = nodeGroups(k.id, k.announce || k.name, k.onClick);
      g.setAttribute('data-name', k.name);
      if (k.kind) g.setAttribute('data-kind', k.kind);

      if (k.form === 'quadrat') {
        g.appendChild(svgEl('rect', {
          x: k.x - k.r, y: k.y - k.r, width: k.r * 2, height: k.r * 2, rx: 3,
          fill: k.color, class: 'app-graph-dot' + (k.klasse ? ' ' + k.klasse : '')
        }));
      } else {
        g.appendChild(svgEl('circle', {
          cx: k.x, cy: k.y, r: k.r,
          fill: k.color, class: 'app-graph-dot' + (k.klasse ? ' ' + k.klasse : '')
        }));
      }

      var t = svgEl('text', {
        class: 'app-graph-label', x: k.x + k.r + 5, y: k.y,
        'dominant-baseline': 'middle', 'aria-hidden': 'true'
      });
      if (k.stark) t.setAttribute('font-weight', '600');
      t.textContent = K.truncate(k.name, 30);
      g.appendChild(t);

      g.appendChild(svgEl('circle', {
        cx: k.x, cy: k.y, r: Math.max(k.r + 8, 16), class: 'app-graph-hit'
      }));

      bindTooltip(g, function (ev) { tooltipNode(ev, k); });
      g.addEventListener('mouseenter', function () { mark(k.id); });
      g.addEventListener('mouseleave', function () { mark(null); });
      g.addEventListener('focus', function () { mark(k.id); });
      g.addEventListener('blur', function () { mark(null); });

      root.appendChild(g);
    });

    K.networkHighlight();

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(function (k) {
      minX = Math.min(minX, k.x - k.r); maxX = Math.max(maxX, k.x + k.r + 130);
      minY = Math.min(minY, k.y - k.r); maxY = Math.max(maxY, k.y + k.r);
    });
    frame(minX, minY, maxX, maxY, 40);
    scaleHitAreas();

    renderLegend(legend);
    textVersion(textTitle || K.t('graph.contentTitle'),
      nodes.map(function (k) { return k.announce || k.name; }));
  };

  /* Legend. Items: {hint, onDismiss} for note rows (onDismiss turns them
     into a dismissable chip row), otherwise {name, n, color, shape, onClick,
     pressed, off, ariaLabel, key}. pressed drives aria-pressed («is
     highlighted»), off only the dimmed look. */
  function renderLegend(items) {
    var leg = K.el.legend;
    leg.innerHTML = '';
    (items || []).forEach(function (e) {
      if (e.hint) {
        if (e.onDismiss) {
          var chip = K.button('app-legend-clear', e.hint, e.onDismiss);
          if (e.ariaLabel) chip.setAttribute('aria-label', e.ariaLabel);
          chip.appendChild(K.icon('xmark'));
          leg.appendChild(chip);
        } else {
          leg.appendChild(K.e('span', 'app-legend-note', e.hint));
        }
        return;
      }
      var b;
      if (e.onClick) {
        b = K.button(e.off ? 'app-is-muted' : '', null, e.onClick);
        b.setAttribute('aria-pressed', String(!!e.gedrueckt));
        if (e.ariaLabel) b.setAttribute('aria-label', e.ariaLabel);
        if (e.key) b.setAttribute('data-legend', e.key);
      } else {
        b = K.e('span', 'app-legend-item');
      }
      var sw = K.e('span', 'app-swatch' + (e.form === 'quadrat' ? '' : ' app-swatch-round'));
      sw.style.background = e.color;
      b.appendChild(sw);
      b.appendChild(document.createTextNode(e.name + (e.n !== undefined ? '  ' + e.n : '')));
      leg.appendChild(b);
    });
  }
  K.renderLegend = renderLegend;

  /* Highlighting in the network as a pure DOM operation — no relayout, the
     user's viewBox stays put. highlighted is the NAME of the property set
     (identically named sets from different catalogues light up together —
     intended: what matters is the domain term). */
  K.networkHighlight = function () {
    var root = K.el['graph-canvas'];
    var highlighted = K.state.highlighted;
    var kept = {};
    if (highlighted) {
      Array.prototype.forEach.call(root.querySelectorAll('.app-graph-node[data-kind="pset"]'), function (g) {
        if (g.getAttribute('data-name') === highlighted) kept[g.getAttribute('data-id')] = true;
      });
      Array.prototype.forEach.call(root.querySelectorAll('.app-graph-edge'), function (l) {
        if (l.getAttribute('data-pset')) return;   // radial bundles
        if (kept[l.getAttribute('data-b')]) kept[l.getAttribute('data-a')] = true;
        if (kept[l.getAttribute('data-a')]) kept[l.getAttribute('data-b')] = true;
      });
    }
    Array.prototype.forEach.call(root.querySelectorAll('.app-graph-node'), function (g) {
      g.classList.toggle('app-graph-faded', !!highlighted && !kept[g.getAttribute('data-id')]);
    });
    Array.prototype.forEach.call(root.querySelectorAll('.app-graph-edge'), function (l) {
      if (l.getAttribute('data-pset')) return;
      l.classList.toggle('app-graph-faded', !!highlighted && !(kept[l.getAttribute('data-a')] &&
                                                 kept[l.getAttribute('data-b')]));
    });
  };

  /* Selected node (side panel open) — a visible ring through a class */
  K.markGraphSelection = function (id) {
    Array.prototype.forEach.call(K.el['graph-canvas'].querySelectorAll('.app-graph-node'), function (g) {
      g.classList.toggle('app-graph-selected', !!id && g.getAttribute('data-id') === id);
    });
  };

  /* Highlight the edges of the hovered node — through a class, so the
     colour has a single source (main.css). Presentation attributes would be
     overridden by the .app-graph-edge rules anyway. */
  function mark(id) {
    if (K.state.highlighted) return;
    var edges = K.el['graph-canvas'].querySelectorAll('.app-graph-edge');
    for (var i = 0; i < edges.length; i++) {
      if (edges[i].getAttribute('data-pset')) continue;   // leave the radial bundles alone
      var an = edges[i].getAttribute('data-a') === id ||
               edges[i].getAttribute('data-b') === id;
      edges[i].classList.toggle('ob-active', !!(id && an));
    }
  }

  function forceLayout(nodes, edges) {
    var N = nodes.length;
    nodes.forEach(function (k, i) {
      var a = i * 2.399963;                     // goldener Winkel
      var r = 26 * Math.sqrt(i + 1);
      k.x = r * Math.cos(a); k.y = r * Math.sin(a);
      k.vx = 0; k.vy = 0;
    });

    var round = N <= 100 ? 400 : 260;
    var springLength = Math.max(130, 950 / Math.sqrt(N));
    var repulsion = springLength * springLength * 0.13;
    var spring = 0.045, mitte = 0.009, daempfung = 0.86;

    for (var s = 0; s < round; s++) {
      for (var i = 0; i < N; i++) {
        var a = nodes[i];
        for (var j = i + 1; j < N; j++) {
          var b = nodes[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < 0.01) { d2 = 0.01; dx = 0.4; dy = 0.4; }
          if (d2 > 360000) continue;
          var d = Math.sqrt(d2);
          /* Large nodes push harder, otherwise they overlap in the centre */
          var f = repulsion * (1 + (a.r + b.r) * 0.16) / d2;
          var ux = dx / d, uy = dy / d;
          a.vx += ux * f; a.vy += uy * f;
          b.vx -= ux * f; b.vy -= uy * f;
        }
      }
      edges.forEach(function (kn) {
        var dx = kn.b.x - kn.a.x, dy = kn.b.y - kn.a.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        var f = (d - springLength) * spring;
        var ux = dx / d, uy = dy / d;
        kn.a.vx += ux * f; kn.a.vy += uy * f;
        kn.b.vx -= ux * f; kn.b.vy -= uy * f;
      });
      for (var m = 0; m < N; m++) {
        var k = nodes[m];
        k.vx -= k.x * mitte; k.vy -= k.y * mitte;
        k.vx *= daempfung;  k.vy *= daempfung;
        k.x += Math.max(-40, Math.min(40, k.vx));
        k.y += Math.max(-40, Math.min(40, k.vy));
      }
    }
  }

  /* =========================================================
     Radial: one object type with its property sets and attributes
     ========================================================= */

  /* onAttribute: a callback from app.js (opens the side panel) — views.js
     never navigates on its own. The highlight toggle in radialLegend writes
     K.state.highlighted directly as a deliberate exception (partial rerender
     without relayout). If the signature is unchanged nothing is rebuilt at
     all — the user's viewBox stays put. */
  var radialSignature = '', radialGruppen = null;

  K.renderRadial = function (element, attributes, hint, onMerkmal, sig) {
    if (sig && sig === radialSignature && radialGruppen &&
        K.el['graph-canvas'].getAttribute('data-modus') === 'radial') {
      K.el['graph-hint'].textContent = hint || '';
      highlight();
      radialLegend(radialGruppen);
      return;
    }
    radialSignature = sig || '';
    radialGruppen = null;

    var root = freshNetwork();
    K.el['graph-hint'].textContent = hint || '';
    if (!attributes.length) {
      K.el['graph-hint'].textContent = K.t('common.noResults');
      radialSignature = '';
      return;
    }

    var namen = {};
    attributes.forEach(function (m) { namen[m.pset] = true; });

    var groups = Object.keys(namen)
      .sort(function (a, b) { return a.localeCompare(b, 'de'); })
      .map(function (p) {
        return {
          pset: p,
          color: element.color[p] || '#596978',   // ob bg-contrast_low (flipped), 4.6:1 on white
          attributes: attributes.filter(function (m) { return m.pset === p; })
        };
      });
    radialGruppen = groups;
    K.el['graph-canvas'].setAttribute('data-modus', 'radial');

    var N = attributes.length;
    var GAP = 1.8;
    var slots = N + groups.length * GAP;
    var step = (Math.PI * 2) / slots;

    var R  = Math.max(200, (slots * 19) / (Math.PI * 2));
    var Rp = Math.max(84, R * 0.42);
    var Rz = Math.min(58, Math.max(38, R * 0.2));
    var Rb = R + 168;

    var angle = -Math.PI / 2 + step * (GAP / 2);
    groups.forEach(function (gr) {
      gr.start = angle;
      gr.attributes.forEach(function (m) { m._w = angle; angle += step; });
      gr.ende = angle - step;
      gr.mitte = (gr.start + gr.ende) / 2;
      angle += step * GAP;
    });

    var E = Rb + 46;
    frame(-E, -E, E, E, 0);

    function pt(r, w) { return [r * Math.cos(w), r * Math.sin(w)]; }

    var left = svgEl('g', { 'aria-hidden': 'true' });
    root.appendChild(left);

    groups.forEach(function (gr) {
      var p = pt(Rp, gr.mitte);
      var z = pt(Rz, gr.mitte);
      /* Colours inline (style), not as an attribute — the .app-graph-edge
         rule would override presentation attributes and kill the set colour */
      var stem = svgEl('path', {
        d: 'M' + z[0] + ',' + z[1] + 'L' + p[0] + ',' + p[1],
        class: 'app-graph-edge', 'data-pset': gr.pset
      });
      stem.style.stroke = gr.color;
      stem.style.strokeWidth = 2;
      left.appendChild(stem);
      gr.attributes.forEach(function (m) {
        var target = pt(R, m._w);
        var ctrl = pt((Rp + R) / 2, m._w);
        var branch = svgEl('path', {
          d: 'M' + p[0] + ',' + p[1] + 'Q' + ctrl[0] + ',' + ctrl[1] + ' ' + target[0] + ',' + target[1],
          class: 'app-graph-edge', 'data-pset': gr.pset
        });
        branch.style.stroke = gr.color;
        branch.style.strokeOpacity = 0.45;
        left.appendChild(branch);
      });
    });

    groups.forEach(function (gr) {
      gr.attributes.forEach(function (m) {
        var label = m.name + ', ' + (m.type || K.t('empty.type')) +
                           (m.unit ? ', ' + m.unit : '') +
                           ', ' + K.t('unit.pset') + ' ' + gr.pset;
        var nodes = nodeGroups('m:' + m.uri, label,
                                  function () { onMerkmal(m.uri); });
        nodes.setAttribute('data-pset', gr.pset);
        nodes.classList.add('app-graph-group');

        var degree = m._w * 180 / Math.PI;
        var flip = (degree > 90 || degree < -90);

        nodes.appendChild(svgEl('circle', {
          class: 'app-graph-dot', cx: R * Math.cos(m._w), cy: R * Math.sin(m._w), r: 6.5, fill: gr.color
        }));

        var t = svgEl('text', {
          class: 'app-graph-label', 'aria-hidden': 'true',
          transform: 'rotate(' + degree + ') translate(' + (R + 11) + ',0)' + (flip ? ' rotate(180)' : ''),
          'text-anchor': flip ? 'end' : 'start',
          'dominant-baseline': 'middle'
        });
        t.textContent = K.truncate(m.name, 26);
        nodes.appendChild(t);

        nodes.appendChild(svgEl('circle', {
          cx: R * Math.cos(m._w), cy: R * Math.sin(m._w), r: 15, class: 'app-graph-hit'
        }));

        bindTooltip(nodes, function (ev) { tooltipAttribute(ev, m, element); });

        root.appendChild(nodes);
      });
    });

    /* Property sets: the arc sits outside the labels. Set radially, the
       name would run straight through its own attributes. */
    var arcIndex = 0;
    groups.forEach(function (gr) {
      var p = pt(Rp, gr.mitte);
      var nodes = svgEl('g', { class: 'app-graph-group', 'data-pset': gr.pset, 'aria-hidden': 'true' });

      nodes.appendChild(svgEl('circle', {
        cx: p[0], cy: p[1], r: 8, fill: gr.color, class: 'app-graph-dot'
      }));

      var half = Math.max((gr.ende - gr.start) / 2, step * 0.55);
      var a0 = gr.mitte - half, a1 = gr.mitte + half;
      var below = Math.sin(gr.mitte) > 0;
      var id = 'bogen-' + (arcIndex++);

      nodes.appendChild(svgEl('path', {
        id: id,
        d: below ? arcPath(Rb, a1, a0, 0) : arcPath(Rb, a0, a1, 1),
        fill: 'none', stroke: gr.color, 'stroke-width': 2.5,
        'stroke-linecap': 'round', 'stroke-opacity': .85
      }));

      /* On the arc as long as it is long enough — otherwise tangentially
         beside it, or the name would be clipped. */
      var label = K.truncate(gr.pset, 30) + ' · ' + gr.attributes.length;
      var textWidth = label.length * 6.9;
      var t;
      if (2 * half * Rb >= textWidth + 14) {
        t = svgEl('text', { class: 'app-graph-pset-label', dy: below ? 17 : -9 });
        var tp = svgEl('textPath', { href: '#' + id, startOffset: '50%' });
        tp.setAttribute('text-anchor', 'middle');
        tp.textContent = label;
        t.appendChild(tp);
      } else {
        var degree = gr.mitte * 180 / Math.PI;
        t = svgEl('text', {
          class: 'app-graph-pset-label',
          transform: 'rotate(' + degree + ') translate(' + (Rb + 15) + ',0) ' +
                     'rotate(' + (below ? -90 : 90) + ')',
          'text-anchor': 'middle', 'dominant-baseline': 'middle'
        });
        t.textContent = label;
      }
      nodes.appendChild(t);
      root.appendChild(nodes);
    });

    var center = svgEl('g', { 'aria-hidden': 'true' });
    center.appendChild(svgEl('circle', { class: 'app-graph-center-circle', cx: 0, cy: 0, r: Rz }));
    var rows = wrap(element.name, 13, 3);
    rows.forEach(function (row, i) {
      var t = svgEl('text', {
        class: 'app-graph-center-label', x: 0,
        y: (i - (rows.length - 1) / 2) * 15 - 5,
        'text-anchor': 'middle', 'dominant-baseline': 'middle'
      });
      t.textContent = row;
      center.appendChild(t);
    });
    var sub = svgEl('text', {
      class: 'app-graph-center-sub', x: 0, y: (rows.length - 1) / 2 * 15 + 12,
      'text-anchor': 'middle', 'dominant-baseline': 'middle'
    });
    sub.textContent = N + ' ' + K.plural(N, K.t('unit.attr'), K.t('unit.attrs'));
    center.appendChild(sub);
    root.appendChild(center);

    scaleHitAreas();
    radialLegend(groups);
    highlight();

    textVersion(K.t('graph.attrsOf', { name: element.name }), groups.map(function (gr) {
      return gr.pset + ': ' + gr.attributes.map(function (m) { return m.name; }).join(', ');
    }));
  };

  function arcPath(r, a0, a1, sweep) {
    var x0 = r * Math.cos(a0), y0 = r * Math.sin(a0);
    var x1 = r * Math.cos(a1), y1 = r * Math.sin(a1);
    var large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    return 'M' + x0 + ',' + y0 + 'A' + r + ',' + r + ' 0 ' + large + ' ' + sweep + ' ' + x1 + ',' + y1;
  }

  /* Break over-long single words hard — otherwise the name juts out of the
     centre circle and becomes invisible there (white on white). */
  function wrap(text, width, max) {
    var words = [];
    text.split(' ').forEach(function (w) {
      while (w.length > width) { words.push(w.slice(0, width)); w = w.slice(width); }
      if (w) words.push(w);
    });
    var rows = [], akt = '';
    words.forEach(function (w) {
      if (!akt) { akt = w; return; }
      if ((akt + ' ' + w).length <= width) akt += ' ' + w;
      else { rows.push(akt); akt = w; }
    });
    if (akt) rows.push(akt);
    if (rows.length > max) {
      rows = rows.slice(0, max);
      rows[max - 1] = K.truncate(rows[max - 1], width - 1);
    }
    return rows.map(function (z) { return K.truncate(z, width + 2); });
  }

  function radialLegend(groups) {
    renderLegend(groups.map(function (gr) {
      return {
        name: gr.pset, n: gr.attributes.length, color: gr.color,
        key: gr.pset,
        /* pressed = «is highlighted»; the others are dimmed */
        gedrueckt: K.state.highlighted === gr.pset,
        off: !!(K.state.highlighted && K.state.highlighted !== gr.pset),
        ariaLabel: K.t('graph.legendHighlight', { name: gr.pset, n: gr.attributes.length }),
        onClick: function () {
          K.state.highlighted = (K.state.highlighted === gr.pset) ? null : gr.pset;
          highlight();
          radialLegend(groups);
          /* The rebuild must not let focus fall onto <body> */
          var again = K.el.legend.querySelector('[data-legend="' +
            gr.pset.replace(/"/g, '\\"') + '"]');
          if (again) again.focus();
          K.setStatus(K.state.highlighted
            ? K.t('graph.highlighted', { name: gr.pset })
            : K.t('graph.highlightCleared'));
        }
      };
    }));
  }

  function highlight() {
    var all = K.el['graph-canvas'].querySelectorAll('[data-pset]');
    for (var i = 0; i < all.length; i++) {
      var fits = !K.state.highlighted || all[i].getAttribute('data-pset') === K.state.highlighted;
      all[i].classList.toggle('app-graph-faded', !fits);
    }
  }

  /* ---------- Tooltip: an extra for the mouse, never the only source ---------- */

  function tooltipLine(t, text) {
    var z = document.createElement('span');
    z.className = 'app-tooltip-line';
    z.textContent = text;
    t.appendChild(z);
  }

  /* Lean: the full name plus one line of context — the data sheet is shown
     by the side panel on click (CD tooltips are terse labels) */
  function tooltipAttribute(ev, m, element) {
    var t = K.el.tooltip;
    t.innerHTML = '';
    var b = document.createElement('b');
    b.textContent = m.name;
    t.appendChild(b);
    var type = m.pset + ' · ' + (m.type || K.t('empty.type'));
    if (m.unit) type += ' · ' + m.unit;
    tooltipLine(t, type);
    t.classList.add('app-is-visible');
    moveTooltip(ev);
  }

  function tooltipNode(ev, k) {
    var t = K.el.tooltip;
    t.innerHTML = '';
    var b = document.createElement('b');
    b.textContent = k.name;
    t.appendChild(b);
    (k.rows || []).forEach(function (z) { tooltipLine(t, z); });
    t.classList.add('app-is-visible');
    moveTooltip(ev);
  }

  function moveTooltip(ev) {
    var tip = K.el.tooltip;
    var wrap = tip.parentNode.getBoundingClientRect();
    var x = ev.clientX - wrap.left + 14;
    var y = ev.clientY - wrap.top + 14;
    if (x + tip.offsetWidth > wrap.width) x = ev.clientX - wrap.left - tip.offsetWidth - 14;
    if (y + tip.offsetHeight > wrap.height) y = ev.clientY - wrap.top - tip.offsetHeight - 14;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function hideTooltip() { K.el.tooltip.classList.remove('app-is-visible'); }

  /* ---------- Zoom, panning, keyboard, fullscreen ---------- */

  function zoom(faktor, fx, fy) {
    if (!vb) return;
    /* Limits relative to the starting viewBox: deep enough for detail,
       never so far out that the content becomes unfindable */
    var minWidth = vbStart ? Math.max(60, vbStart.w / 10) : 120;
    var maxWidth = vbStart ? vbStart.w * 3 : 24000;
    var newWidth = Math.min(maxWidth, Math.max(minWidth, vb.w * faktor));
    var newHeight = vb.h * (newWidth / vb.w);
    vb.x += (vb.w - newWidth) * (fx === undefined ? 0.5 : fx);
    vb.y += (vb.h - newHeight) * (fy === undefined ? 0.5 : fy);
    vb.w = newWidth; vb.h = newHeight;
    clampViewBox();
    setViewBox();
  }

  /* At least part of the content stays in view — nobody strands in empty
     space while panning */
  function clampViewBox() {
    if (!inhaltBox || !vb) return;
    var m = 0.15;
    vb.x = Math.min(Math.max(vb.x, inhaltBox.x - vb.w * (1 - m)),
                    inhaltBox.x + inhaltBox.w - vb.w * m);
    vb.y = Math.min(Math.max(vb.y, inhaltBox.y - vb.h * (1 - m)),
                    inhaltBox.y + inhaltBox.h - vb.h * m);
  }

  function resetView() {
    if (!vbStart) return;
    vb = { x: vbStart.x, y: vbStart.y, w: vbStart.w, h: vbStart.h };
    setViewBox();
  }

  /* Hooks for app.js: a click on the background (close the panel) and
     Escape inside the graphic (clear the highlight/panel). */
  K.onGraphBackground = null;
  K.onGraphEscape = null;

  K.graphControls = function () {
    var svg = K.el['graph-canvas'];
    var wrap = document.getElementById('graph-frame');

    /* Fluechtiger Hinweis nach wirkungslosem Mausrad (Karten-Muster) */
    var hintTimer = null;
    function showWheelHint() {
      var z = document.getElementById('zoom-hint');
      if (!z) return;
      z.textContent = K.t('graph.wheelHint');
      /* Float above the legend, however tall it currently wraps */
      z.style.bottom = (K.el.legend.offsetHeight + 16) + 'px';
      z.hidden = false;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(function () { z.hidden = true; }, 1600);
    }

    /* Zoom with Ctrl/Cmd — or when the graphic is VISIBLY focused (the
       keyboard route). A plain click also focuses, but must not silently
       hijack the page's scroll wheel. */
    svg.addEventListener('wheel', function (ev) {
      if (!vb) return;
      var allowed = ev.ctrlKey || ev.metaKey ||
                 (svg.matches && svg.matches(':focus-visible'));
      if (!allowed) { showWheelHint(); return; }
      ev.preventDefault();
      var rect = svg.getBoundingClientRect();
      zoom(ev.deltaY > 0 ? 1.12 : 1 / 1.12,
           (ev.clientX - rect.left) / rect.width,
           (ev.clientY - rect.top) / rect.height);
    }, { passive: false });

    /* Double click on empty space: zoom in on that point */
    svg.addEventListener('dblclick', function (ev) {
      if (!vb || (ev.target.closest && ev.target.closest('.app-graph-node'))) return;
      ev.preventDefault();
      var rect = svg.getBoundingClientRect();
      zoom(1 / 1.5, (ev.clientX - rect.left) / rect.width,
                    (ev.clientY - rect.top) / rect.height);
    });

    /* One finger/mouse pans, two fingers zoom (pinch). touch-action pan-y
       stays: a vertical one-finger gesture scrolls the page. */
    var dragging = false, startX = 0, startY = 0, startVb = null, bewegt = false;
    var pointers = {};          // pointerId -> {x, y}
    var pinchDistance = 0;

    function pointerCount() { return Object.keys(pointers).length; }
    function pinchState() {
      var ids = Object.keys(pointers);
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var dx = a.x - b.x, dy = a.y - b.y;
      return {
        dist: Math.max(10, Math.sqrt(dx * dx + dy * dy)),
        mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2
      };
    }

    svg.addEventListener('pointerdown', function (ev) {
      if (!vb) return;
      pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      if (pointerCount() === 2) {
        /* Pinch beginnt: laufenden Zug beenden */
        dragging = false;
        svg.classList.remove('app-is-dragging');
        pinchDistance = pinchState().dist;
        try { svg.setPointerCapture(ev.pointerId); } catch (e) {}
        return;
      }
      if (ev.button !== 0) return;   // right/middle button does not drag
      if (ev.target.closest && ev.target.closest('.app-graph-node')) return;
      dragging = true; bewegt = false;
      startX = ev.clientX; startY = ev.clientY;
      startVb = { x: vb.x, y: vb.y };
      svg.classList.add('app-is-dragging');
      try { svg.setPointerCapture(ev.pointerId); } catch (e) {}
    });

    svg.addEventListener('pointermove', function (ev) {
      if (pointers[ev.pointerId]) {
        pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      }
      if (pointerCount() === 2 && vb) {
        var pw = pinchState();
        var rect = svg.getBoundingClientRect();
        zoom(pinchDistance / pw.dist,
             (pw.mx - rect.left) / rect.width,
             (pw.my - rect.top) / rect.height);
        pinchDistance = pw.dist;
        return;
      }
      if (!dragging) return;
      var r = svg.getBoundingClientRect();
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 4) bewegt = true;
      vb.x = startVb.x - (ev.clientX - startX) * (vb.w / r.width);
      vb.y = startVb.y - (ev.clientY - startY) * (vb.h / r.height);
      clampViewBox();
      setViewBox();
    });

    function ende(ev) {
      delete pointers[ev.pointerId];
      try { svg.releasePointerCapture(ev.pointerId); } catch (e) {}
      if (!dragging) return;
      dragging = false;
      svg.classList.remove('app-is-dragging');
      /* A click (without dragging) on empty space closes the selection and
         the panel. ONLY on a real pointerup — a pointercancel (the browser
         takes the gesture over as a page scroll) is not a click and must not
         close the panel. */
      if (ev.type === 'pointerup' && !bewegt && K.onGraphBackground &&
          !(ev.target.closest && ev.target.closest('.app-graph-node'))) {
        K.onGraphBackground();
      }
    }
    svg.addEventListener('pointerup', ende);
    svg.addEventListener('pointercancel', ende);
    svg.addEventListener('lostpointercapture', function (ev) {
      delete pointers[ev.pointerId];
      if (dragging && pointerCount() === 0) { dragging = false; svg.classList.remove('app-is-dragging'); }
    });

    /* Without a mouse: arrow keys pan, +/- zoom, 0 resets, Escape clears
       the highlight/panel and closes the tooltip */
    svg.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        hideTooltip();
        if (K.onGraphEscape && K.onGraphEscape()) ev.preventDefault();
        return;
      }
      if (!vb || ev.target !== svg) return;
      var step = vb.w * 0.12;
      var t = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
      if (t) {
        vb.x += t[0] * step; vb.y += t[1] * step;
        clampViewBox(); setViewBox(); ev.preventDefault(); return;
      }
      if (ev.key === '+' || ev.key === '=') { zoom(1 / 1.2); ev.preventDefault(); }
      if (ev.key === '-') { zoom(1.2); ev.preventDefault(); }
      if (ev.key === '0') { resetView(); ev.preventDefault(); }
    });

    K.el['zoom-in'].addEventListener('click', function () { zoom(1 / 1.2); });
    K.el['zoom-out'].addEventListener('click', function () { zoom(1.2); });
    K.el['zoom-reset'].addEventListener('click', resetView);

    /* Fullscreen: the whole graphic area; icon and name change with it */
    var fullscreen = document.getElementById('graph-fullscreen');
    function fullscreenState() {
      var an = document.fullscreenElement === wrap;
      Array.prototype.forEach.call(fullscreen.querySelectorAll('use'), function (u) {
        u.setAttribute('href', an ? '#fullscreen_exit' : '#fullscreen');
        u.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href',
                         an ? '#fullscreen_exit' : '#fullscreen');
      });
      var text = K.t(an ? 'graph.fullscreenExit' : 'graph.fullscreen');
      fullscreen.setAttribute('aria-label', text);
      fullscreen.title = text;
    }
    if (fullscreen && wrap.requestFullscreen) {
      fullscreen.addEventListener('click', function () {
        if (document.fullscreenElement === wrap) {
          document.exitFullscreen();
        } else {
          var v = wrap.requestFullscreen();
          if (v && v.catch) v.catch(function () {});   // z. B. ohne Nutzergeste
        }
      });
      document.addEventListener('fullscreenchange', fullscreenState);
    } else if (fullscreen) {
      fullscreen.hidden = true;   // z. B. iPhone-Safari
    }

    /* Grid/window resize: keep the viewBox aspect ratio in step, otherwise
       the zoom anchor, drag speed and reset frame drift apart */
    if (window.ResizeObserver) {
      var observer = new ResizeObserver(function () {
        if (!vb || !vbStart) return;
        var r = svg.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var pages = r.width / r.height;
        [vb, vbStart].forEach(function (box) {
          var cy = box.y + box.h / 2;
          box.h = box.w / pages;
          box.y = cy - box.h / 2;
        });
        setViewBox();
      });
      observer.observe(svg);
    }

    /* Skip the graphic: straight to the text version */
    var skip = document.getElementById('graph-skip');
    if (skip) {
      skip.addEventListener('click', function () {
        K.el['graph-text'].focus();
      });
    }
  };
})(KBOB);
