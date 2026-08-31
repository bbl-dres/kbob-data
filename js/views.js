/* Darstellung.

   Drei Sichten auf dieselbe Auswahl: Liste, Galerie, Graph. Die Renderer sind
   generisch — was gezeigt wird, entscheidet app.js und übergibt es fertig
   beschrieben. Der Graph hat durchgehend eine Textfassung und ist mit der
   Tastatur bedienbar; er ist nie die einzige Quelle einer Angabe. */

var KBOB = window.KBOB || (window.KBOB = {});

(function (K) {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';

  /* Darüber wird die Netzdarstellung unlesbar und das O(N²)-Layout teuer.
     Der Cap zählt Objekttypen; mit Property-Set-Knoten sind es real bis
     ~176 Knoten und ~25 ms Layout — gemessen, vertretbar. */
  K.NETZ_MAX = 150;

  /* ---------- DOM-Kurzformen ----------
     Das Muster createElement + className + Inhalt steht dutzendfach in
     app.js und views.js — K.e/K.knopf bündeln es. Attribute (aria-*, id,
     title) setzen die Aufrufer weiterhin selbst. Neuer Code nutzt die
     Helfer; Bestand wird beim Anfassen migriert. */
  K.e = function (tag, klasse, inhalt) {
    var n = document.createElement(tag);
    if (klasse) n.className = klasse;
    if (inhalt !== undefined && inhalt !== null) {
      if (typeof inhalt === 'string') n.textContent = inhalt;
      else n.appendChild(inhalt);
    }
    return n;
  };

  K.knopf = function (klasse, inhalt, onClick) {
    var b = K.e('button', klasse, inhalt);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  };

  function svgEl(name, attrs) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* Oblique-Icons: das Sprite (assets/icons/obliqueIcons.svg) wird einmal in
     den Body injiziert, danach greift jedes <use href="#name"> — auch die
     schon im statischen Markup stehenden Verweise lösen sich damit auf. */
  (function ladeSprite() {
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

  /* Icon aus dem Sprite — immer dekorativ; die Aussage trägt der Text
     oder das aria-label des umgebenden Bedienelements. */
  K.icon = function (name, klasse) {
    var s = svgEl('svg', {
      class: 'ob-icon' + (klasse ? ' ' + klasse : ''),
      focusable: 'false', 'aria-hidden': 'true'
    });
    var u = document.createElementNS(SVGNS, 'use');
    u.setAttribute('href', '#' + name);
    u.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#' + name);
    s.appendChild(u);
    return s;
  };

  /* Oblique-Spinner (lib/spinner): ein Kreisbogen, animiert über ob-spin */
  K.spinner = function () {
    var s = svgEl('svg', { viewBox: '0 0 48 48', 'aria-hidden': 'true' });
    s.appendChild(svgEl('circle', {
      cx: 24, cy: 24, r: 20, fill: 'none',
      stroke: '#2F4356', 'stroke-miterlimit': 10, 'stroke-width': 4
    }));
    return s;
  };

  /* Ladehinweis mit drehendem Bogen — für Leerflächen, deren Inhalt gerade
     unterwegs ist. Der Bogen ist dekorativ; der Text trägt die Aussage. */
  K.ladeInhalt = function (text) {
    var box = K.e('span', 'kbob-spinner-inline');
    box.appendChild(K.spinner());
    box.appendChild(document.createTextNode(text));
    return box;
  };

  K.leer = function (bedeutung) {
    var s = document.createElement('span');
    s.className = 'kbob-empty';
    s.textContent = '—';
    if (bedeutung) {
      var sr = document.createElement('span');
      sr.className = 'ob-screen-reader-only';
      sr.textContent = bedeutung;
      s.appendChild(sr);
    }
    return s;
  };

  /* Beschriftung aus den Daten. Weicht ihre Sprache von der OBERFLÄCHEN-
     Sprache ab, wird das ausgezeichnet (WCAG 3.1.2 Sprache von Teilen) —
     auch ein deutscher Rückfall in der französischen Oberfläche. */
  K.text = function (wert, sprache) {
    var s = document.createElement('span');
    s.textContent = wert;
    var ui = (K.state && K.state.sprache) || 'de';
    if (sprache && sprache !== ui) s.lang = sprache;
    return s;
  };

  /* LOIN-Meilensteine kompakt: alle bekannten Werte als Felder, die
     deklarierten dunkel. Neun Werte passen sonst in keine Tabellenspalte.
     Sichtbar steht die Ziffer, der volle Wert (LZPn) liegt als title auf
     jedem Feld; der Vorlesetext nennt die deklarierten Werte ausgeschrieben. */
  K.phasen = function (gesetzt, alle) {
    if (!alle || !alle.length) return K.leer(K.t('empty.milestone'));

    var box = document.createElement('span');
    box.className = 'kbob-phase-track';
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', gesetzt.length
      ? K.t('phases.label', { liste: gesetzt.join(', ') })
      : K.t('phases.none'));
    box.title = gesetzt.length
      ? K.t('phases.declared', { liste: gesetzt.join(', ') })
      : K.t('phases.noneDeclared');

    /* Gemeinsames Vorsilbenkürzel (LZP) weglassen, sonst wird es zu breit —
       der title je Feld trägt den vollen Datenwert. */
    var vorsilbe = /^[A-Za-z]+/.exec(alle[0]);
    vorsilbe = vorsilbe ? vorsilbe[0] : '';

    alle.forEach(function (p) {
      var an = gesetzt.indexOf(p) !== -1;
      var f = document.createElement('span');
      f.className = 'kbob-phase' + (an ? ' an' : '');
      f.setAttribute('aria-hidden', 'true');
      f.title = an ? K.t('phases.yes', { p: p }) : K.t('phases.no', { p: p });
      f.textContent = vorsilbe && p.indexOf(vorsilbe) === 0 ? p.slice(vorsilbe.length) : p;
      box.appendChild(f);
    });
    return box;
  };

  /* Eine Badge-Form für alle Marken; farbe ergänzt einen Swatch (Galerie) */
  K.marken = function (eintraege) {
    var box = K.e('span', 'kbob-tags');
    eintraege.forEach(function (m) {
      var t = K.e('span', 'kbob-tag');
      if (m.title) t.title = m.title;
      if (m.farbe) {
        var sw = K.e('span', 'kbob-swatch');
        sw.style.background = m.farbe;
        t.appendChild(sw);
      }
      t.appendChild(document.createTextNode(m.name));
      if (m.n !== undefined && m.n !== null) {
        t.appendChild(K.e('span', 'kbob-count', String(m.n)));
      }
      box.appendChild(t);
    });
    return box;
  };

  /* =========================================================
     Liste
     ========================================================= */

  /* Die erste Zelle trägt den Knopf. Die Zeile behält damit ihre
     Tabellensemantik, statt als ein einziger Knopf zu verschmelzen. */
  K.zeichneListe = function (spec) {
    var ziel = K.el['view-liste'];
    ziel.innerHTML = '';

    var tab = document.createElement('table');
    tab.className = 'ob-table';

    var cap = document.createElement('caption');
    cap.className = 'ob-screen-reader-only';
    cap.textContent = spec.titel || '';
    tab.appendChild(cap);

    var thead = document.createElement('thead');
    var trh = document.createElement('tr');
    spec.spalten.forEach(function (s) {
      var th = document.createElement('th');
      th.scope = 'col';
      if (s.breite) th.style.width = s.breite;
      if (s.rechts) th.className = 'kbob-right';

      /* Sortierbare Spalten tragen einen Knopf im Kopf; der Pfeil steht
         immer im Baum (ArrowUp-Glyphe wie im Oblique-Tabellenkopf) —
         sichtbar voll auf der aktiven Spalte, angedeutet bei Hover/Fokus,
         gedreht bei absteigend. aria-sort nur auf der aktiven Spalte. */
      if (s.sort && spec.onSort) {
        var b = K.knopf('kbob-sort', s.titel,
                        function () { spec.onSort(s.sort, s.sortStart); });
        var aktiv = spec.sort && spec.sort.feld === s.sort;
        if (aktiv) {
          th.setAttribute('aria-sort', spec.sort.richtung > 0 ? 'ascending' : 'descending');
        }
        var pfeil = K.e('span', 'kbob-sort-arrow' +
                        (aktiv && spec.sort.richtung < 0 ? ' kbob-desc' : ''));
        pfeil.setAttribute('aria-hidden', 'true');
        b.appendChild(pfeil);
        th.appendChild(b);
      } else {
        th.textContent = s.titel;
      }
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    tab.appendChild(thead);

    var tbody = document.createElement('tbody');

    if (!spec.zeilen.length) {
      var tr0 = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.colSpan = spec.spalten.length;
      td0.className = 'kbob-no-results';
      var leerText = spec.leerText || K.t('common.noResults');
      if (spec.laedt) td0.appendChild(K.ladeInhalt(leerText));
      else td0.textContent = leerText;
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
    }

    spec.zeilen.forEach(function (z) {
      var tr = document.createElement('tr');
      if (z.id) tr.id = z.id;
      if (z.onClick) tr.className = 'klick';

      z.zellen.forEach(function (bau, i) {
        var td = document.createElement('td');
        if (spec.spalten[i] && spec.spalten[i].rechts) td.className = 'kbob-right';
        var inhalt = bau();
        if (inhalt !== null && inhalt !== undefined) {
          if (typeof inhalt === 'string') td.textContent = inhalt;
          else td.appendChild(inhalt);
        }
        tr.appendChild(td);
      });

      /* Klick auf die Zeile bleibt als Bequemlichkeit für die Maus — er trägt
         keine Semantik, der Knopf in der ersten Zelle tut das. Eine aktive
         Textauswahl gewinnt: wer zitiert, wird nicht wegnavigiert. */
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
    ziel.appendChild(tab);
  };

  K.zeilenKnopf = function (name, sprache, onClick) {
    return K.knopf('kbob-row-link', K.text(name, sprache), onClick);
  };

  /* =========================================================
     Galerie
     ========================================================= */

  /* spec: { karten, leerText, laedt } — benannte Felder statt einer
     Boolean-Falle am Aufrufort. */
  K.zeichneGalerie = function (spec) {
    var ziel = K.el.galerie;
    ziel.innerHTML = '';

    if (!spec.karten.length) {
      var p = K.e('p', 'kbob-no-results');
      var text = spec.leerText || K.t('common.noResults');
      if (spec.laedt) p.appendChild(K.ladeInhalt(text));
      else p.textContent = text;
      ziel.appendChild(p);
      return;
    }

    spec.karten.forEach(function (k) {
      /* Immer ein div — der Knopf sitzt auf dem Namen und dehnt seine
         Klickfläche per CSS über die Karte. So verschmilzt der Karteninhalt
         für Screenreader nicht zu einem einzigen langen Knopfnamen. */
      var karte = K.e('div', 'ob-card');
      var kopf = K.e('span', 'kbob-card-head');
      var nm = k.onClick
        ? K.knopf('kbob-card-button', K.text(k.name, k.sprache), k.onClick)
        : K.e('span', 'kbob-card-name', K.text(k.name, k.sprache));
      kopf.appendChild(nm);
      if (k.zahl !== undefined && k.zahl !== null) {
        var n = K.e('span', 'kbob-tag kbob-count', String(k.zahl));
        if (k.zahlText) n.appendChild(K.e('span', 'ob-screen-reader-only', ' ' + k.zahlText));
        kopf.appendChild(n);
      }
      karte.appendChild(kopf);

      if (k.text) karte.appendChild(K.e('span', 'ob-card-content', k.text));
      if (k.marken && k.marken.length) karte.appendChild(K.marken(k.marken));
      if (k.fuss) karte.appendChild(K.e('span', 'kbob-card-footer', k.fuss));

      ziel.appendChild(karte);
    });
  };

  /* =========================================================
     Graph — gemeinsame Mechanik
     ========================================================= */

  var vb = null, vbStart = null, inhaltBox = null;

  function setViewBox() {
    if (vb) K.el.netz.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
  }

  /* Schriftgrössen sind Nutzerkoordinaten: ein enger Ausschnitt vergrössert
     die Beschriftung mit. Der Ausschnitt bekommt das Seitenverhältnis des
     Rahmens; kleine Cluster dürfen moderat vergrössert starten (bis ~1.7×),
     damit sie nicht als winziger Fleck in einer leeren Fläche stehen —
     grosse Graphen behalten den 1:1-Start. */
  function rahmen(minX, minY, maxX, maxY, rand) {
    var rect = K.el.netz.getBoundingClientRect();
    var RW = rect.width || 1400, RH = rect.height || 900;
    var mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    var w = Math.max(maxX - minX, 10) + rand * 2;
    var h = Math.max(maxY - minY, 10) + rand * 2;
    inhaltBox = { x: minX - rand, y: minY - rand, w: w, h: h };
    var seiten = RW / RH;
    if (w / h < seiten) w = h * seiten; else h = w / seiten;
    if (w < RW) {
      var f = Math.max(w / RW, 0.6);
      w = RW * f; h = RH * f;
    }
    vb = { x: mx - w / 2, y: my - h / 2, w: w, h: h };
    vbStart = { x: vb.x, y: vb.y, w: vb.w, h: vb.h };
    setViewBox();
  }

  function neuesNetz() {
    versteckeTip();   // ein schwebender Tooltip überlebt den Neuaufbau nicht
    K.el.netz.innerHTML = '';
    K.el.legende.innerHTML = '';
    K.el['graph-text'].innerHTML = '';
    var g = svgEl('g', {});
    K.el.netz.appendChild(g);
    return g;
  }

  /* Dieselbe Aussage ohne Bild */
  function textFassung(titel, eintraege) {
    var ziel = K.el['graph-text'];
    ziel.innerHTML = '';
    ziel.appendChild(K.e('h2', '', titel));
    var ul = document.createElement('ul');
    eintraege.forEach(function (t) { ul.appendChild(K.e('li', '', t)); });
    ziel.appendChild(ul);
  }

  /* Tooltip-Verdrahtung je Knoten — in Netz und Radial identisch.
     Tastaturfokus zeigt denselben Tooltip (WCAG-Parität): positioniert an
     der Knotenmitte, weg beim Verlassen; Escape schliesst ihn (1.4.13). */
  function bindeTip(g, zeig) {
    g.addEventListener('mouseenter', zeig);
    g.addEventListener('mousemove', bewegeTip);
    g.addEventListener('mouseleave', versteckeTip);
    g.addEventListener('focus', function () {
      var r = g.getBoundingClientRect();
      zeig({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    });
    g.addEventListener('blur', versteckeTip);
  }

  function knotenGruppe(id, beschriftung, onClick) {
    var g = svgEl('g', {
      class: 'g-knoten', 'data-id': id,
      tabindex: '0', role: 'button', 'aria-label': beschriftung
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
     Netz: Objekttypen und ihre Property Sets
     ========================================================= */

  K.zeichneNetz = function (knoten, kanten, legende, hinweis, textTitel) {
    var wurzel = neuesNetz();
    K.el.netz.setAttribute('data-modus', 'netz');
    K.el['graph-hinweis'].textContent = hinweis || '';

    if (!knoten.length) {
      K.el['graph-hinweis'].textContent = K.t('common.noResults');
      return;
    }

    kraefteLayout(knoten, kanten);

    var kantenG = svgEl('g', { 'aria-hidden': 'true' });
    wurzel.appendChild(kantenG);
    kanten.forEach(function (kn) {
      var linie = svgEl('line', {
        x1: kn.a.x, y1: kn.a.y, x2: kn.b.x, y2: kn.b.y,
        class: 'g-link', 'data-a': kn.a.id, 'data-b': kn.b.id
      });
      /* Liniendicke = geteilte Merkmale (inline style, weil die
         .g-link-Regel Präsentationsattribute übersteuern würde) */
      if (kn.n) linie.style.strokeWidth = Math.min(4, 0.8 + Math.sqrt(kn.n));
      kantenG.appendChild(linie);
    });

    knoten.forEach(function (k) {
      var g = knotenGruppe(k.id, k.vorlesen || k.name, k.onClick);
      g.setAttribute('data-name', k.name);
      if (k.art) g.setAttribute('data-art', k.art);

      if (k.form === 'quadrat') {
        g.appendChild(svgEl('rect', {
          x: k.x - k.r, y: k.y - k.r, width: k.r * 2, height: k.r * 2, rx: 3,
          fill: k.farbe, class: 'g-dot' + (k.klasse ? ' ' + k.klasse : '')
        }));
      } else {
        g.appendChild(svgEl('circle', {
          cx: k.x, cy: k.y, r: k.r,
          fill: k.farbe, class: 'g-dot' + (k.klasse ? ' ' + k.klasse : '')
        }));
      }

      var t = svgEl('text', {
        class: 'g-label', x: k.x + k.r + 5, y: k.y,
        'dominant-baseline': 'middle', 'aria-hidden': 'true'
      });
      if (k.stark) t.setAttribute('font-weight', '600');
      t.textContent = K.gekuerzt(k.name, 30);
      g.appendChild(t);

      g.appendChild(svgEl('circle', {
        cx: k.x, cy: k.y, r: Math.max(k.r + 8, 16), class: 'g-hit'
      }));

      bindeTip(g, function (ev) { tipKnoten(ev, k); });
      g.addEventListener('mouseenter', function () { markiere(k.id); });
      g.addEventListener('mouseleave', function () { markiere(null); });
      g.addEventListener('focus', function () { markiere(k.id); });
      g.addEventListener('blur', function () { markiere(null); });

      wurzel.appendChild(g);
    });

    K.hervorhebungNetz();

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    knoten.forEach(function (k) {
      minX = Math.min(minX, k.x - k.r); maxX = Math.max(maxX, k.x + k.r + 130);
      minY = Math.min(minY, k.y - k.r); maxY = Math.max(maxY, k.y + k.r);
    });
    rahmen(minX, minY, maxX, maxY, 40);

    zeichneLegende(legende);
    textFassung(textTitel || K.t('graph.contentTitle'),
      knoten.map(function (k) { return k.vorlesen || k.name; }));
  };

  /* Legende. Einträge: {hinweis, onDismiss} für Notizzeilen (onDismiss macht
     daraus eine abwählbare Chip-Zeile), sonst {name, n, farbe, form,
     onClick, gedrueckt, aus, ariaLabel, schluessel}. gedrueckt steuert
     aria-pressed («ist hervorgehoben»), aus nur die Abblend-Optik. */
  function zeichneLegende(eintraege) {
    var leg = K.el.legende;
    leg.innerHTML = '';
    (eintraege || []).forEach(function (e) {
      if (e.hinweis) {
        if (e.onDismiss) {
          var chip = K.knopf('kbob-legend-clear', e.hinweis, e.onDismiss);
          if (e.ariaLabel) chip.setAttribute('aria-label', e.ariaLabel);
          chip.appendChild(K.icon('xmark'));
          leg.appendChild(chip);
        } else {
          leg.appendChild(K.e('span', 'kbob-legend-note', e.hinweis));
        }
        return;
      }
      var b;
      if (e.onClick) {
        b = K.knopf(e.aus ? 'aus' : '', null, e.onClick);
        b.setAttribute('aria-pressed', String(!!e.gedrueckt));
        if (e.ariaLabel) b.setAttribute('aria-label', e.ariaLabel);
        if (e.schluessel) b.setAttribute('data-legende', e.schluessel);
      } else {
        b = K.e('span', 'eintrag');
      }
      var sw = K.e('span', 'kbob-swatch' + (e.form === 'quadrat' ? '' : ' rund'));
      sw.style.background = e.farbe;
      b.appendChild(sw);
      b.appendChild(document.createTextNode(e.name + (e.n !== undefined ? '  ' + e.n : '')));
      leg.appendChild(b);
    });
  }
  K.zeichneLegende = zeichneLegende;

  /* Hervorhebung im Netz als reine DOM-Operation — kein Neulayout, der
     Ausschnitt der Nutzenden bleibt stehen. hervor ist der NAME des
     Property Sets (namensgleiche Sets aus verschiedenen Katalogen leuchten
     gemeinsam — gewollt: es geht um den fachlichen Begriff). */
  K.hervorhebungNetz = function () {
    var wurzel = K.el.netz;
    var hervor = K.state.hervor;
    var behalten = {};
    if (hervor) {
      Array.prototype.forEach.call(wurzel.querySelectorAll('.g-knoten[data-art="pset"]'), function (g) {
        if (g.getAttribute('data-name') === hervor) behalten[g.getAttribute('data-id')] = true;
      });
      Array.prototype.forEach.call(wurzel.querySelectorAll('.g-link'), function (l) {
        if (l.getAttribute('data-pset')) return;   // radiale Bündel
        if (behalten[l.getAttribute('data-b')]) behalten[l.getAttribute('data-a')] = true;
        if (behalten[l.getAttribute('data-a')]) behalten[l.getAttribute('data-b')] = true;
      });
    }
    Array.prototype.forEach.call(wurzel.querySelectorAll('.g-knoten'), function (g) {
      g.classList.toggle('g-fade', !!hervor && !behalten[g.getAttribute('data-id')]);
    });
    Array.prototype.forEach.call(wurzel.querySelectorAll('.g-link'), function (l) {
      if (l.getAttribute('data-pset')) return;
      l.classList.toggle('g-fade', !!hervor && !(behalten[l.getAttribute('data-a')] &&
                                                 behalten[l.getAttribute('data-b')]));
    });
  };

  /* Ausgewählter Knoten (Seitenpanel offen) — sichtbarer Ring per Klasse */
  K.graphAuswahlMarkieren = function (id) {
    Array.prototype.forEach.call(K.el.netz.querySelectorAll('.g-knoten'), function (g) {
      g.classList.toggle('g-ausgewaehlt', !!id && g.getAttribute('data-id') === id);
    });
  };

  /* Kanten des überfahrenen Knotens hervorheben — per Klasse, damit die
     Farbe eine einzige Quelle hat (main.css). Präsentationsattribute würden
     von den .g-link-Regeln ohnehin übersteuert. */
  function markiere(id) {
    if (K.state.hervor) return;
    var kanten = K.el.netz.querySelectorAll('.g-link');
    for (var i = 0; i < kanten.length; i++) {
      if (kanten[i].getAttribute('data-pset')) continue;   // radiale Bündel nicht anfassen
      var an = kanten[i].getAttribute('data-a') === id ||
               kanten[i].getAttribute('data-b') === id;
      kanten[i].classList.toggle('an', !!(id && an));
    }
  }

  function kraefteLayout(knoten, kanten) {
    var N = knoten.length;
    knoten.forEach(function (k, i) {
      var a = i * 2.399963;                     // goldener Winkel
      var r = 26 * Math.sqrt(i + 1);
      k.x = r * Math.cos(a); k.y = r * Math.sin(a);
      k.vx = 0; k.vy = 0;
    });

    var runden = N <= 100 ? 400 : 260;
    var federLaenge = Math.max(130, 950 / Math.sqrt(N));
    var abstossung = federLaenge * federLaenge * 0.13;
    var feder = 0.045, mitte = 0.009, daempfung = 0.86;

    for (var s = 0; s < runden; s++) {
      for (var i = 0; i < N; i++) {
        var a = knoten[i];
        for (var j = i + 1; j < N; j++) {
          var b = knoten[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < 0.01) { d2 = 0.01; dx = 0.4; dy = 0.4; }
          if (d2 > 360000) continue;
          var d = Math.sqrt(d2);
          /* Grosse Knoten drücken stärker, sonst überlappen sie in der Mitte */
          var f = abstossung * (1 + (a.r + b.r) * 0.16) / d2;
          var ux = dx / d, uy = dy / d;
          a.vx += ux * f; a.vy += uy * f;
          b.vx -= ux * f; b.vy -= uy * f;
        }
      }
      kanten.forEach(function (kn) {
        var dx = kn.b.x - kn.a.x, dy = kn.b.y - kn.a.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        var f = (d - federLaenge) * feder;
        var ux = dx / d, uy = dy / d;
        kn.a.vx += ux * f; kn.a.vy += uy * f;
        kn.b.vx -= ux * f; kn.b.vy -= uy * f;
      });
      for (var m = 0; m < N; m++) {
        var k = knoten[m];
        k.vx -= k.x * mitte; k.vy -= k.y * mitte;
        k.vx *= daempfung;  k.vy *= daempfung;
        k.x += Math.max(-40, Math.min(40, k.vx));
        k.y += Math.max(-40, Math.min(40, k.vy));
      }
    }
  }

  /* =========================================================
     Radial: ein Objekttyp mit Property Sets und Merkmalen
     ========================================================= */

  /* onMerkmal: Callback aus app.js (öffnet das Seitenpanel) — views.js
     navigiert nicht selbst. Der hervor-Toggle in radialLegende schreibt
     K.state.hervor als bewusste Ausnahme direkt (Teil-Rerender ohne
     Neulayout). Bei unveränderter Signatur wird gar nicht neu gebaut —
     der Ausschnitt der Nutzenden bleibt stehen. */
  var radialSig = '', radialGruppen = null;

  K.zeichneRadial = function (element, merkmale, hinweis, onMerkmal, sig) {
    if (sig && sig === radialSig && radialGruppen &&
        K.el.netz.getAttribute('data-modus') === 'radial') {
      K.el['graph-hinweis'].textContent = hinweis || '';
      hervorhebung();
      radialLegende(radialGruppen);
      return;
    }
    radialSig = sig || '';
    radialGruppen = null;

    var wurzel = neuesNetz();
    K.el['graph-hinweis'].textContent = hinweis || '';
    if (!merkmale.length) {
      K.el['graph-hinweis'].textContent = K.t('common.noResults');
      radialSig = '';
      return;
    }

    var namen = {};
    merkmale.forEach(function (m) { namen[m.pset] = true; });

    var gruppen = Object.keys(namen)
      .sort(function (a, b) { return a.localeCompare(b, 'de'); })
      .map(function (p) {
        return {
          pset: p,
          farbe: element.farbe[p] || '#596978',   // ob bg-contrast_low (flipped), 4.6:1 auf Weiss
          merkmale: merkmale.filter(function (m) { return m.pset === p; })
        };
      });
    radialGruppen = gruppen;
    K.el.netz.setAttribute('data-modus', 'radial');

    var N = merkmale.length;
    var LUECKE = 1.8;
    var plaetze = N + gruppen.length * LUECKE;
    var schritt = (Math.PI * 2) / plaetze;

    var R  = Math.max(200, (plaetze * 19) / (Math.PI * 2));
    var Rp = Math.max(84, R * 0.42);
    var Rz = Math.min(58, Math.max(38, R * 0.2));
    var Rb = R + 168;

    var winkel = -Math.PI / 2 + schritt * (LUECKE / 2);
    gruppen.forEach(function (gr) {
      gr.start = winkel;
      gr.merkmale.forEach(function (m) { m._w = winkel; winkel += schritt; });
      gr.ende = winkel - schritt;
      gr.mitte = (gr.start + gr.ende) / 2;
      winkel += schritt * LUECKE;
    });

    var E = Rb + 46;
    rahmen(-E, -E, E, E, 0);

    function pt(r, w) { return [r * Math.cos(w), r * Math.sin(w)]; }

    var links = svgEl('g', { 'aria-hidden': 'true' });
    wurzel.appendChild(links);

    gruppen.forEach(function (gr) {
      var p = pt(Rp, gr.mitte);
      var z = pt(Rz, gr.mitte);
      /* Farben inline (style), nicht als Attribut — die .g-link-Regel
         würde Präsentationsattribute übersteuern und die Set-Farbe töten */
      var stamm = svgEl('path', {
        d: 'M' + z[0] + ',' + z[1] + 'L' + p[0] + ',' + p[1],
        class: 'g-link', 'data-pset': gr.pset
      });
      stamm.style.stroke = gr.farbe;
      stamm.style.strokeWidth = 2;
      links.appendChild(stamm);
      gr.merkmale.forEach(function (m) {
        var ziel = pt(R, m._w);
        var ctrl = pt((Rp + R) / 2, m._w);
        var ast = svgEl('path', {
          d: 'M' + p[0] + ',' + p[1] + 'Q' + ctrl[0] + ',' + ctrl[1] + ' ' + ziel[0] + ',' + ziel[1],
          class: 'g-link', 'data-pset': gr.pset
        });
        ast.style.stroke = gr.farbe;
        ast.style.strokeOpacity = 0.45;
        links.appendChild(ast);
      });
    });

    gruppen.forEach(function (gr) {
      gr.merkmale.forEach(function (m) {
        var beschriftung = m.name + ', ' + (m.typ || K.t('empty.type')) +
                           (m.einheit ? ', ' + m.einheit : '') +
                           ', ' + K.t('unit.pset') + ' ' + gr.pset;
        var knoten = knotenGruppe('m:' + m.uri, beschriftung,
                                  function () { onMerkmal(m.uri); });
        knoten.setAttribute('data-pset', gr.pset);
        knoten.classList.add('g-group');

        var grad = m._w * 180 / Math.PI;
        var kippen = (grad > 90 || grad < -90);

        knoten.appendChild(svgEl('circle', {
          class: 'g-dot', cx: R * Math.cos(m._w), cy: R * Math.sin(m._w), r: 6.5, fill: gr.farbe
        }));

        var t = svgEl('text', {
          class: 'g-label', 'aria-hidden': 'true',
          transform: 'rotate(' + grad + ') translate(' + (R + 11) + ',0)' + (kippen ? ' rotate(180)' : ''),
          'text-anchor': kippen ? 'end' : 'start',
          'dominant-baseline': 'middle'
        });
        t.textContent = K.gekuerzt(m.name, 26);
        knoten.appendChild(t);

        knoten.appendChild(svgEl('circle', {
          cx: R * Math.cos(m._w), cy: R * Math.sin(m._w), r: 15, class: 'g-hit'
        }));

        bindeTip(knoten, function (ev) { tipMerkmal(ev, m, element); });

        wurzel.appendChild(knoten);
      });
    });

    /* Property Sets: Bogen ausserhalb der Beschriftungen. Radial gesetzt liefe
       der Name quer durch die eigenen Merkmale. */
    var bogenNr = 0;
    gruppen.forEach(function (gr) {
      var p = pt(Rp, gr.mitte);
      var knoten = svgEl('g', { class: 'g-group', 'data-pset': gr.pset, 'aria-hidden': 'true' });

      knoten.appendChild(svgEl('circle', {
        cx: p[0], cy: p[1], r: 8, fill: gr.farbe, class: 'g-dot'
      }));

      var halb = Math.max((gr.ende - gr.start) / 2, schritt * 0.55);
      var a0 = gr.mitte - halb, a1 = gr.mitte + halb;
      var unten = Math.sin(gr.mitte) > 0;
      var id = 'bogen-' + (bogenNr++);

      knoten.appendChild(svgEl('path', {
        id: id,
        d: unten ? bogenPfad(Rb, a1, a0, 0) : bogenPfad(Rb, a0, a1, 1),
        fill: 'none', stroke: gr.farbe, 'stroke-width': 2.5,
        'stroke-linecap': 'round', 'stroke-opacity': .85
      }));

      /* Auf dem Bogen, solange dieser lang genug ist — sonst tangential
         daneben, sonst würde der Name abgeschnitten. */
      var beschriftung = K.gekuerzt(gr.pset, 30) + ' · ' + gr.merkmale.length;
      var textBreite = beschriftung.length * 6.9;
      var t;
      if (2 * halb * Rb >= textBreite + 14) {
        t = svgEl('text', { class: 'g-pset-label', dy: unten ? 17 : -9 });
        var tp = svgEl('textPath', { href: '#' + id, startOffset: '50%' });
        tp.setAttribute('text-anchor', 'middle');
        tp.textContent = beschriftung;
        t.appendChild(tp);
      } else {
        var grad = gr.mitte * 180 / Math.PI;
        t = svgEl('text', {
          class: 'g-pset-label',
          transform: 'rotate(' + grad + ') translate(' + (Rb + 15) + ',0) ' +
                     'rotate(' + (unten ? -90 : 90) + ')',
          'text-anchor': 'middle', 'dominant-baseline': 'middle'
        });
        t.textContent = beschriftung;
      }
      knoten.appendChild(t);
      wurzel.appendChild(knoten);
    });

    var zentrum = svgEl('g', { 'aria-hidden': 'true' });
    zentrum.appendChild(svgEl('circle', { class: 'g-center-circle', cx: 0, cy: 0, r: Rz }));
    var zeilen = umbruch(element.name, 13, 3);
    zeilen.forEach(function (zeile, i) {
      var t = svgEl('text', {
        class: 'g-center-label', x: 0,
        y: (i - (zeilen.length - 1) / 2) * 15 - 5,
        'text-anchor': 'middle', 'dominant-baseline': 'middle'
      });
      t.textContent = zeile;
      zentrum.appendChild(t);
    });
    var sub = svgEl('text', {
      class: 'g-center-sub', x: 0, y: (zeilen.length - 1) / 2 * 15 + 12,
      'text-anchor': 'middle', 'dominant-baseline': 'middle'
    });
    sub.textContent = N + ' ' + K.plural(N, K.t('unit.attr'), K.t('unit.attrs'));
    zentrum.appendChild(sub);
    wurzel.appendChild(zentrum);

    radialLegende(gruppen);
    hervorhebung();

    textFassung(K.t('graph.attrsOf', { name: element.name }), gruppen.map(function (gr) {
      return gr.pset + ': ' + gr.merkmale.map(function (m) { return m.name; }).join(', ');
    }));
  };

  function bogenPfad(r, a0, a1, sweep) {
    var x0 = r * Math.cos(a0), y0 = r * Math.sin(a0);
    var x1 = r * Math.cos(a1), y1 = r * Math.sin(a1);
    var gross = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    return 'M' + x0 + ',' + y0 + 'A' + r + ',' + r + ' 0 ' + gross + ' ' + sweep + ' ' + x1 + ',' + y1;
  }

  /* Zu lange Einzelwörter hart trennen — sonst ragt der Name aus dem
     Zentrumskreis und wird dort unsichtbar (weiss auf weiss). */
  function umbruch(text, breite, max) {
    var worte = [];
    text.split(' ').forEach(function (w) {
      while (w.length > breite) { worte.push(w.slice(0, breite)); w = w.slice(breite); }
      if (w) worte.push(w);
    });
    var zeilen = [], akt = '';
    worte.forEach(function (w) {
      if (!akt) { akt = w; return; }
      if ((akt + ' ' + w).length <= breite) akt += ' ' + w;
      else { zeilen.push(akt); akt = w; }
    });
    if (akt) zeilen.push(akt);
    if (zeilen.length > max) {
      zeilen = zeilen.slice(0, max);
      zeilen[max - 1] = K.gekuerzt(zeilen[max - 1], breite - 1);
    }
    return zeilen.map(function (z) { return K.gekuerzt(z, breite + 2); });
  }

  function radialLegende(gruppen) {
    zeichneLegende(gruppen.map(function (gr) {
      return {
        name: gr.pset, n: gr.merkmale.length, farbe: gr.farbe,
        schluessel: gr.pset,
        /* gedrückt = «ist hervorgehoben»; abgeblendet sind die anderen */
        gedrueckt: K.state.hervor === gr.pset,
        aus: !!(K.state.hervor && K.state.hervor !== gr.pset),
        ariaLabel: K.t('graph.legendHighlight', { name: gr.pset, n: gr.merkmale.length }),
        onClick: function () {
          K.state.hervor = (K.state.hervor === gr.pset) ? null : gr.pset;
          hervorhebung();
          radialLegende(gruppen);
          /* Der Neuaufbau darf den Fokus nicht auf <body> fallen lassen */
          var wieder = K.el.legende.querySelector('[data-legende="' +
            gr.pset.replace(/"/g, '\\"') + '"]');
          if (wieder) wieder.focus();
          K.setStatus(K.state.hervor
            ? K.t('graph.highlighted', { name: gr.pset })
            : K.t('graph.highlightCleared'));
        }
      };
    }));
  }

  function hervorhebung() {
    var alle = K.el.netz.querySelectorAll('[data-pset]');
    for (var i = 0; i < alle.length; i++) {
      var passt = !K.state.hervor || alle[i].getAttribute('data-pset') === K.state.hervor;
      alle[i].classList.toggle('g-fade', !passt);
    }
  }

  /* ---------- Tooltip: Zugabe für die Maus, nie einzige Quelle ---------- */

  function tipZeile(t, text) {
    var z = document.createElement('span');
    z.className = 'kbob-tip-line';
    z.textContent = text;
    t.appendChild(z);
  }

  /* Schlank: voller Name plus eine Einordnungszeile — das Datenblatt
     zeigt das Seitenpanel beim Klick (CD-Tooltips sind knappe Etiketten) */
  function tipMerkmal(ev, m, element) {
    var t = K.el.tip;
    t.innerHTML = '';
    var b = document.createElement('b');
    b.textContent = m.name;
    t.appendChild(b);
    var typ = m.pset + ' · ' + (m.typ || K.t('empty.type'));
    if (m.einheit) typ += ' · ' + m.einheit;
    tipZeile(t, typ);
    t.classList.add('on');
    bewegeTip(ev);
  }

  function tipKnoten(ev, k) {
    var t = K.el.tip;
    t.innerHTML = '';
    var b = document.createElement('b');
    b.textContent = k.name;
    t.appendChild(b);
    (k.zeilen || []).forEach(function (z) { tipZeile(t, z); });
    t.classList.add('on');
    bewegeTip(ev);
  }

  function bewegeTip(ev) {
    var tip = K.el.tip;
    var wrap = tip.parentNode.getBoundingClientRect();
    var x = ev.clientX - wrap.left + 14;
    var y = ev.clientY - wrap.top + 14;
    if (x + tip.offsetWidth > wrap.width) x = ev.clientX - wrap.left - tip.offsetWidth - 14;
    if (y + tip.offsetHeight > wrap.height) y = ev.clientY - wrap.top - tip.offsetHeight - 14;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function versteckeTip() { K.el.tip.classList.remove('on'); }

  /* ---------- Zoom, Verschieben, Tastatur, Vollbild ---------- */

  function zoom(faktor, fx, fy) {
    if (!vb) return;
    /* Grenzen relativ zum Startausschnitt: tief genug fuer Details,
       nie so weit hinaus, dass der Inhalt unauffindbar wird */
    var minW = vbStart ? Math.max(60, vbStart.w / 10) : 120;
    var maxW = vbStart ? vbStart.w * 3 : 24000;
    var neuW = Math.min(maxW, Math.max(minW, vb.w * faktor));
    var neuH = vb.h * (neuW / vb.w);
    vb.x += (vb.w - neuW) * (fx === undefined ? 0.5 : fx);
    vb.y += (vb.h - neuH) * (fy === undefined ? 0.5 : fy);
    vb.w = neuW; vb.h = neuH;
    klemmeAusschnitt();
    setViewBox();
  }

  /* Mindestens ein Teil des Inhalts bleibt im Bild — niemand strandet
     beim Verschieben in leerer Flaeche */
  function klemmeAusschnitt() {
    if (!inhaltBox || !vb) return;
    var m = 0.15;
    vb.x = Math.min(Math.max(vb.x, inhaltBox.x - vb.w * (1 - m)),
                    inhaltBox.x + inhaltBox.w - vb.w * m);
    vb.y = Math.min(Math.max(vb.y, inhaltBox.y - vb.h * (1 - m)),
                    inhaltBox.y + inhaltBox.h - vb.h * m);
  }

  function zuruecksetzen() {
    if (!vbStart) return;
    vb = { x: vbStart.x, y: vbStart.y, w: vbStart.w, h: vbStart.h };
    setViewBox();
  }

  /* Hooks fuer app.js: Klick auf den Hintergrund (Panel schliessen) und
     Escape in der Grafik (Hervorhebung/Panel aufheben). */
  K.graphHintergrund = null;
  K.graphEscape = null;

  K.grafikSteuerung = function () {
    var svg = K.el.netz;
    var wrap = document.getElementById('graph-wrap');

    /* Fluechtiger Hinweis nach wirkungslosem Mausrad (Karten-Muster) */
    var hintTimer = null;
    function zeigeRadHinweis() {
      var z = document.getElementById('zoom-hinweis');
      if (!z) return;
      z.textContent = K.t('graph.wheelHint');
      z.hidden = false;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(function () { z.hidden = true; }, 1600);
    }

    /* Zoomen mit Ctrl/Cmd — oder bei SICHTBAR fokussierter Grafik
       (Tastaturweg). Ein blosser Klick fokussiert zwar auch, soll das
       Scrollrad der Seite aber nicht stillschweigend kapern. */
    svg.addEventListener('wheel', function (ev) {
      if (!vb) return;
      var darf = ev.ctrlKey || ev.metaKey ||
                 (svg.matches && svg.matches(':focus-visible'));
      if (!darf) { zeigeRadHinweis(); return; }
      ev.preventDefault();
      var rect = svg.getBoundingClientRect();
      zoom(ev.deltaY > 0 ? 1.12 : 1 / 1.12,
           (ev.clientX - rect.left) / rect.width,
           (ev.clientY - rect.top) / rect.height);
    }, { passive: false });

    /* Doppelklick auf freie Flaeche: an den Punkt heranzoomen */
    svg.addEventListener('dblclick', function (ev) {
      if (!vb || (ev.target.closest && ev.target.closest('.g-knoten'))) return;
      ev.preventDefault();
      var rect = svg.getBoundingClientRect();
      zoom(1 / 1.5, (ev.clientX - rect.left) / rect.width,
                    (ev.clientY - rect.top) / rect.height);
    });

    /* Ein Finger/Maus verschiebt, zwei Finger zoomen (Pinch). touch-action
       pan-y bleibt: eine vertikale Ein-Finger-Geste scrollt die Seite. */
    var zieht = false, startX = 0, startY = 0, startVb = null, bewegt = false;
    var zeiger = {};          // pointerId -> {x, y}
    var pinchDist = 0;

    function zeigerZahl() { return Object.keys(zeiger).length; }
    function pinchWerte() {
      var ids = Object.keys(zeiger);
      var a = zeiger[ids[0]], b = zeiger[ids[1]];
      var dx = a.x - b.x, dy = a.y - b.y;
      return {
        dist: Math.max(10, Math.sqrt(dx * dx + dy * dy)),
        mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2
      };
    }

    svg.addEventListener('pointerdown', function (ev) {
      if (!vb) return;
      zeiger[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      if (zeigerZahl() === 2) {
        /* Pinch beginnt: laufenden Zug beenden */
        zieht = false;
        svg.classList.remove('dragging');
        pinchDist = pinchWerte().dist;
        try { svg.setPointerCapture(ev.pointerId); } catch (e) {}
        return;
      }
      if (ev.button !== 0) return;   // rechte/mittlere Taste zieht nicht
      if (ev.target.closest && ev.target.closest('.g-knoten')) return;
      zieht = true; bewegt = false;
      startX = ev.clientX; startY = ev.clientY;
      startVb = { x: vb.x, y: vb.y };
      svg.classList.add('dragging');
      try { svg.setPointerCapture(ev.pointerId); } catch (e) {}
    });

    svg.addEventListener('pointermove', function (ev) {
      if (zeiger[ev.pointerId]) {
        zeiger[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      }
      if (zeigerZahl() === 2 && vb) {
        var pw = pinchWerte();
        var rect = svg.getBoundingClientRect();
        zoom(pinchDist / pw.dist,
             (pw.mx - rect.left) / rect.width,
             (pw.my - rect.top) / rect.height);
        pinchDist = pw.dist;
        return;
      }
      if (!zieht) return;
      var r = svg.getBoundingClientRect();
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 4) bewegt = true;
      vb.x = startVb.x - (ev.clientX - startX) * (vb.w / r.width);
      vb.y = startVb.y - (ev.clientY - startY) * (vb.h / r.height);
      klemmeAusschnitt();
      setViewBox();
    });

    function ende(ev) {
      delete zeiger[ev.pointerId];
      try { svg.releasePointerCapture(ev.pointerId); } catch (e) {}
      if (!zieht) return;
      zieht = false;
      svg.classList.remove('dragging');
      /* Klick (ohne Zug) auf freie Flaeche: Auswahl/Panel schliessen */
      if (!bewegt && K.graphHintergrund &&
          !(ev.target.closest && ev.target.closest('.g-knoten'))) {
        K.graphHintergrund();
      }
    }
    svg.addEventListener('pointerup', ende);
    svg.addEventListener('pointercancel', ende);
    svg.addEventListener('lostpointercapture', function (ev) {
      delete zeiger[ev.pointerId];
      if (zieht && zeigerZahl() === 0) { zieht = false; svg.classList.remove('dragging'); }
    });

    /* Ohne Maus: Pfeiltasten verschieben, +/- zoomen, 0 setzt zurueck,
       Escape hebt Hervorhebung/Panel auf und schliesst den Tooltip */
    svg.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        versteckeTip();
        if (K.graphEscape && K.graphEscape()) ev.preventDefault();
        return;
      }
      if (!vb || ev.target !== svg) return;
      var schritt = vb.w * 0.12;
      var t = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
      if (t) {
        vb.x += t[0] * schritt; vb.y += t[1] * schritt;
        klemmeAusschnitt(); setViewBox(); ev.preventDefault(); return;
      }
      if (ev.key === '+' || ev.key === '=') { zoom(1 / 1.2); ev.preventDefault(); }
      if (ev.key === '-') { zoom(1.2); ev.preventDefault(); }
      if (ev.key === '0') { zuruecksetzen(); ev.preventDefault(); }
    });

    K.el['zoom-plus'].addEventListener('click', function () { zoom(1 / 1.2); });
    K.el['zoom-minus'].addEventListener('click', function () { zoom(1.2); });
    K.el['zoom-reset'].addEventListener('click', zuruecksetzen);

    /* Vollbild: die ganze Grafikflaeche; Icon und Name wechseln mit */
    var vollbild = document.getElementById('vollbild');
    function vollbildStand() {
      var an = document.fullscreenElement === wrap;
      Array.prototype.forEach.call(vollbild.querySelectorAll('use'), function (u) {
        u.setAttribute('href', an ? '#fullscreen_exit' : '#fullscreen');
        u.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href',
                         an ? '#fullscreen_exit' : '#fullscreen');
      });
      var text = K.t(an ? 'graph.fullscreenExit' : 'graph.fullscreen');
      vollbild.setAttribute('aria-label', text);
      vollbild.title = text;
    }
    if (vollbild && wrap.requestFullscreen) {
      vollbild.addEventListener('click', function () {
        if (document.fullscreenElement === wrap) {
          document.exitFullscreen();
        } else {
          var v = wrap.requestFullscreen();
          if (v && v.catch) v.catch(function () {});   // z. B. ohne Nutzergeste
        }
      });
      document.addEventListener('fullscreenchange', vollbildStand);
    } else if (vollbild) {
      vollbild.hidden = true;   // z. B. iPhone-Safari
    }

    /* Grid-/Fenster-Resize: Seitenverhaeltnis des Ausschnitts nachfuehren,
       sonst driften Zoom-Anker, Zuggeschwindigkeit und Reset-Rahmen */
    if (window.ResizeObserver) {
      var beobachter = new ResizeObserver(function () {
        if (!vb || !vbStart) return;
        var r = svg.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var seiten = r.width / r.height;
        [vb, vbStart].forEach(function (box) {
          var cy = box.y + box.h / 2;
          box.h = box.w / seiten;
          box.y = cy - box.h / 2;
        });
        setViewBox();
      });
      beobachter.observe(svg);
    }

    /* Grafik ueberspringen: direkt zur Textfassung */
    var ueberspringen = document.getElementById('graph-ueberspringen');
    if (ueberspringen) {
      ueberspringen.addEventListener('click', function () {
        K.el['graph-text'].focus();
      });
    }
  };
})(KBOB);
