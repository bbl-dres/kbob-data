/* Darstellung.

   Drei Sichten auf dieselbe Auswahl: Liste, Galerie, Graph. Die Renderer sind
   generisch — was gezeigt wird, entscheidet app.js und übergibt es fertig
   beschrieben. Der Graph hat durchgehend eine Textfassung und ist mit der
   Tastatur bedienbar; er ist nie die einzige Quelle einer Angabe. */

var KBOB = window.KBOB || (window.KBOB = {});

(function (K) {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';

  /* Darüber wird die Netzdarstellung unlesbar und das O(N²)-Layout teuer. */
  K.NETZ_MAX = 150;

  function svgEl(name, attrs) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* Ladehinweis mit drehendem Ring — für Leerflächen, deren Inhalt gerade
     unterwegs ist. Der Ring ist dekorativ; der Text trägt die Aussage. */
  K.ladeInhalt = function (text) {
    var box = document.createElement('span');
    box.className = 'lade-inhalt';
    var ring = document.createElement('span');
    ring.className = 'ring';
    ring.setAttribute('aria-hidden', 'true');
    box.appendChild(ring);
    box.appendChild(document.createTextNode(text));
    return box;
  };

  K.leer = function (bedeutung) {
    var s = document.createElement('span');
    s.className = 'leer';
    s.textContent = '—';
    if (bedeutung) {
      var sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = bedeutung;
      s.appendChild(sr);
    }
    return s;
  };

  /* Beschriftung aus den Daten. Fällt sie auf Englisch zurück, wird das
     ausgezeichnet (WCAG 3.1.2 Sprache von Teilen). */
  K.text = function (wert, sprache) {
    var s = document.createElement('span');
    s.textContent = wert;
    if (sprache && sprache !== 'de') s.lang = sprache;
    return s;
  };

  /* LOIN-Meilensteine kompakt: alle bekannten Werte als Felder, die
     deklarierten dunkel. Neun Werte passen sonst in keine Tabellenspalte.
     Sichtbar steht die Ziffer, der volle Wert (LZPn) liegt als title auf
     jedem Feld; der Vorlesetext nennt die deklarierten Werte ausgeschrieben. */
  K.phasen = function (gesetzt, alle) {
    if (!alle || !alle.length) return K.leer('ohne LOIN-Meilenstein');

    var box = document.createElement('span');
    box.className = 'phasen';
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', gesetzt.length
      ? 'LOIN-Meilensteine: ' + gesetzt.join(', ')
      : 'Ohne LOIN-Meilenstein');
    box.title = gesetzt.length
      ? 'Deklariert: ' + gesetzt.join(', ')
      : 'Kein Meilenstein deklariert';

    /* Gemeinsames Vorsilbenkürzel (LZP) weglassen, sonst wird es zu breit —
       der title je Feld trägt den vollen Datenwert. */
    var vorsilbe = /^[A-Za-z]+/.exec(alle[0]);
    vorsilbe = vorsilbe ? vorsilbe[0] : '';

    alle.forEach(function (p) {
      var an = gesetzt.indexOf(p) !== -1;
      var f = document.createElement('span');
      f.className = 'ph' + (an ? ' an' : '');
      f.setAttribute('aria-hidden', 'true');
      f.title = p + (an ? ' — deklariert' : ' — nicht deklariert');
      f.textContent = vorsilbe && p.indexOf(vorsilbe) === 0 ? p.slice(vorsilbe.length) : p;
      box.appendChild(f);
    });
    return box;
  };

  K.marken = function (eintraege) {
    var box = document.createElement('span');
    box.className = 'marke-gruppe';
    eintraege.forEach(function (m) {
      var t = document.createElement('span');
      t.className = 'token token--' + (m.art || 'outline');
      if (m.title) t.title = m.title;
      if (m.farbe) {
        var sw = document.createElement('span');
        sw.className = 'swatch';
        sw.style.background = m.farbe;
        t.appendChild(sw);
      }
      t.appendChild(document.createTextNode(m.name));
      if (m.n !== undefined && m.n !== null) {
        var n = document.createElement('span');
        n.className = 'token--zahl';
        n.textContent = m.n;
        t.appendChild(n);
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

    var cap = document.createElement('caption');
    cap.className = 'sr-only';
    cap.textContent = spec.titel || '';
    tab.appendChild(cap);

    var thead = document.createElement('thead');
    var trh = document.createElement('tr');
    spec.spalten.forEach(function (s) {
      var th = document.createElement('th');
      th.scope = 'col';
      if (s.breite) th.style.width = s.breite;
      if (s.rechts) th.className = 'rechts';

      /* Sortierbare Spalten tragen einen Knopf im Kopf; die aktive Spalte
         sagt Richtung und Zustand über aria-sort und einen Pfeil. */
      if (s.sort && spec.onSort) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'sortier-knopf';
        b.textContent = s.titel;
        var aktiv = spec.sort && spec.sort.feld === s.sort;
        if (aktiv) {
          th.setAttribute('aria-sort', spec.sort.richtung > 0 ? 'ascending' : 'descending');
          var pfeil = document.createElement('span');
          pfeil.className = 'sortier-pfeil';
          pfeil.setAttribute('aria-hidden', 'true');
          pfeil.textContent = spec.sort.richtung > 0 ? ' ▲' : ' ▼';
          b.appendChild(pfeil);
        }
        b.addEventListener('click', function () { spec.onSort(s.sort, s.sortStart); });
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
      td0.className = 'kein-treffer';
      var leerText = spec.leerText || 'Kein Treffer für diese Filter.';
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
        if (spec.spalten[i] && spec.spalten[i].rechts) td.className = 'rechts';
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
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'zeilen-knopf';
    b.appendChild(K.text(name, sprache));
    b.addEventListener('click', onClick);
    return b;
  };

  /* =========================================================
     Galerie
     ========================================================= */

  K.zeichneGalerie = function (karten, leerText, laedt) {
    var ziel = K.el.galerie;
    ziel.innerHTML = '';

    if (!karten.length) {
      var p = document.createElement('p');
      p.className = 'kein-treffer';
      var text = leerText || 'Kein Treffer für diese Filter.';
      if (laedt) p.appendChild(K.ladeInhalt(text));
      else p.textContent = text;
      ziel.appendChild(p);
      return;
    }

    karten.forEach(function (k) {
      /* Immer ein div — der Knopf sitzt auf dem Namen und dehnt seine
         Klickfläche per CSS über die Karte. So verschmilzt der Karteninhalt
         für Screenreader nicht zu einem einzigen langen Knopfnamen. */
      var karte = document.createElement('div');
      karte.className = 'karte';
      if (k.id) karte.id = k.id;

      var kopf = document.createElement('span');
      kopf.className = 'karte-kopf';
      var nm;
      if (k.onClick) {
        nm = document.createElement('button');
        nm.type = 'button';
        nm.className = 'karte-knopf';
        nm.addEventListener('click', k.onClick);
      } else {
        nm = document.createElement('span');
        nm.className = 'karte-name';
      }
      nm.appendChild(K.text(k.name, k.sprache));
      kopf.appendChild(nm);
      if (k.zahl !== undefined && k.zahl !== null) {
        var n = document.createElement('span');
        n.className = 'token token--zahl';
        n.textContent = k.zahl;
        if (k.zahlText) {
          var sr = document.createElement('span');
          sr.className = 'sr-only';
          sr.textContent = ' ' + k.zahlText;
          n.appendChild(sr);
        }
        kopf.appendChild(n);
      }
      karte.appendChild(kopf);

      if (k.sub) {
        var src = document.createElement('span');
        src.className = 'karte-quelle';
        src.textContent = k.sub;
        karte.appendChild(src);
      }
      if (k.text) {
        var txt = document.createElement('span');
        txt.className = 'karte-text';
        txt.textContent = k.text;
        karte.appendChild(txt);
      }
      if (k.marken && k.marken.length) karte.appendChild(K.marken(k.marken));
      if (k.fuss) {
        var fuss = document.createElement('span');
        fuss.className = 'karte-fuss';
        fuss.textContent = k.fuss;
        karte.appendChild(fuss);
      }

      ziel.appendChild(karte);
    });
  };

  /* =========================================================
     Graph — gemeinsame Mechanik
     ========================================================= */

  var vb = null, vbStart = null;

  function setViewBox() {
    if (vb) K.el.netz.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
  }

  /* Schriftgrössen sind Nutzerkoordinaten: ein enger Ausschnitt vergrössert die
     Beschriftung mit. Der Ausschnitt bekommt darum das Seitenverhältnis des
     Rahmens und wird nie über 1:1 hineingezoomt. */
  function rahmen(minX, minY, maxX, maxY, rand) {
    var rect = K.el.netz.getBoundingClientRect();
    var RW = rect.width || 1400, RH = rect.height || 900;
    var mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    var w = Math.max(maxX - minX, 10) + rand * 2;
    var h = Math.max(maxY - minY, 10) + rand * 2;
    var seiten = RW / RH;
    if (w / h < seiten) w = h * seiten; else h = w / seiten;
    if (w < RW) { w = RW; h = RH; }
    vb = { x: mx - w / 2, y: my - h / 2, w: w, h: h };
    vbStart = { x: vb.x, y: vb.y, w: vb.w, h: vb.h };
    setViewBox();
  }

  function neuesNetz() {
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
    var h = document.createElement('h2');
    h.textContent = titel;
    ziel.appendChild(h);
    var ul = document.createElement('ul');
    eintraege.forEach(function (t) {
      var li = document.createElement('li');
      li.textContent = t;
      ul.appendChild(li);
    });
    ziel.appendChild(ul);
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
    K.el['graph-hinweis'].textContent = hinweis || '';

    if (!knoten.length) {
      K.el['graph-hinweis'].textContent = 'Kein Treffer für diese Filter.';
      return;
    }

    kraefteLayout(knoten, kanten);

    var kantenG = svgEl('g', { 'aria-hidden': 'true' });
    wurzel.appendChild(kantenG);
    kanten.forEach(function (kn) {
      kantenG.appendChild(svgEl('line', {
        x1: kn.a.x, y1: kn.a.y, x2: kn.b.x, y2: kn.b.y,
        class: 'g-link', 'data-a': kn.a.id, 'data-b': kn.b.id
      }));
    });

    knoten.forEach(function (k) {
      var g = knotenGruppe(k.id, k.vorlesen || k.name, k.onClick);

      if (k.form === 'quadrat') {
        g.appendChild(svgEl('rect', {
          x: k.x - k.r, y: k.y - k.r, width: k.r * 2, height: k.r * 2, rx: 3,
          fill: k.farbe, class: 'g-dot'
        }));
      } else {
        g.appendChild(svgEl('circle', { cx: k.x, cy: k.y, r: k.r, fill: k.farbe, class: 'g-dot' }));
      }

      var t = svgEl('text', {
        class: 'g-label', x: k.x + k.r + 5, y: k.y,
        'dominant-baseline': 'middle', 'aria-hidden': 'true'
      });
      if (k.stark) t.setAttribute('font-weight', '600');
      t.textContent = K.gekuerzt(k.name, 30);
      g.appendChild(t);

      g.appendChild(svgEl('circle', {
        cx: k.x, cy: k.y, r: Math.max(k.r + 8, 14), class: 'g-hit'
      }));

      g.addEventListener('mouseenter', function (ev) { tipKnoten(ev, k); markiere(k.id); });
      g.addEventListener('mousemove', bewegeTip);
      g.addEventListener('mouseleave', function () { versteckeTip(); markiere(null); });
      g.addEventListener('focus', function () { markiere(k.id); });
      g.addEventListener('blur', function () { markiere(null); });

      wurzel.appendChild(g);
    });

    if (K.state.hervor) {
      var behalten = {};
      knoten.forEach(function (k) { if (k.name === K.state.hervor) behalten[k.id] = true; });
      kanten.forEach(function (kn) {
        if (behalten[kn.b.id]) behalten[kn.a.id] = true;
        if (behalten[kn.a.id]) behalten[kn.b.id] = true;
      });
      Array.prototype.forEach.call(wurzel.querySelectorAll('.g-knoten'), function (g) {
        g.classList.toggle('g-fade', !behalten[g.getAttribute('data-id')]);
      });
      Array.prototype.forEach.call(wurzel.querySelectorAll('.g-link'), function (l) {
        l.classList.toggle('g-fade', !(behalten[l.getAttribute('data-a')] &&
                                       behalten[l.getAttribute('data-b')]));
      });
    }

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    knoten.forEach(function (k) {
      minX = Math.min(minX, k.x - k.r); maxX = Math.max(maxX, k.x + k.r + 130);
      minY = Math.min(minY, k.y - k.r); maxY = Math.max(maxY, k.y + k.r);
    });
    rahmen(minX, minY, maxX, maxY, 40);

    zeichneLegende(legende);
    textFassung(textTitel || 'Inhalt der Grafik',
      knoten.map(function (k) { return k.vorlesen || k.name; }));
  };

  function zeichneLegende(eintraege) {
    var leg = K.el.legende;
    leg.innerHTML = '';
    (eintraege || []).forEach(function (e) {
      if (e.hinweis) {
        var h = document.createElement('span');
        h.className = 'legende-hinweis';
        h.textContent = e.hinweis;
        leg.appendChild(h);
        return;
      }
      var b;
      if (e.onClick) {
        b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-pressed', String(!e.aus));
        b.addEventListener('click', e.onClick);
      } else {
        b = document.createElement('span');
        b.className = 'eintrag';
      }
      var sw = document.createElement('span');
      sw.className = 'swatch' + (e.form === 'quadrat' ? '' : ' rund');
      sw.style.background = e.farbe;
      b.appendChild(sw);
      b.appendChild(document.createTextNode(e.name + (e.n !== undefined ? '  ' + e.n : '')));
      leg.appendChild(b);
    });
  }
  K.zeichneLegende = zeichneLegende;

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

  K.zeichneRadial = function (element, merkmale, hinweis) {
    var wurzel = neuesNetz();
    K.el['graph-hinweis'].textContent = hinweis || '';
    if (!merkmale.length) {
      K.el['graph-hinweis'].textContent = 'Kein Treffer für diese Filter.';
      return;
    }

    var namen = {};
    merkmale.forEach(function (m) { namen[m.pset] = true; });

    var gruppen = Object.keys(namen)
      .sort(function (a, b) { return a.localeCompare(b, 'de'); })
      .map(function (p) {
        return {
          pset: p,
          farbe: element.farbe[p] || '#7D8B87',   // = --kante, 3.1:1 auf Weiss
          merkmale: merkmale.filter(function (m) { return m.pset === p; })
        };
      });

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
      links.appendChild(svgEl('path', {
        d: 'M' + z[0] + ',' + z[1] + 'L' + p[0] + ',' + p[1],
        class: 'g-link', 'stroke-width': 2, stroke: gr.farbe, 'data-pset': gr.pset
      }));
      gr.merkmale.forEach(function (m) {
        var ziel = pt(R, m._w);
        var ctrl = pt((Rp + R) / 2, m._w);
        links.appendChild(svgEl('path', {
          d: 'M' + p[0] + ',' + p[1] + 'Q' + ctrl[0] + ',' + ctrl[1] + ' ' + ziel[0] + ',' + ziel[1],
          class: 'g-link', stroke: gr.farbe, 'stroke-opacity': .45, 'data-pset': gr.pset
        }));
      });
    });

    gruppen.forEach(function (gr) {
      gr.merkmale.forEach(function (m) {
        var beschriftung = m.name + ', ' + (m.typ || 'ohne Typangabe') +
                           (m.einheit ? ', ' + m.einheit : '') + ', Property Set ' + gr.pset;
        var knoten = knotenGruppe('m:' + m.uri, beschriftung,
                                  function () { K.geheZuMerkmal(m.uri); });
        knoten.setAttribute('data-pset', gr.pset);
        knoten.classList.add('g-group');

        var grad = m._w * 180 / Math.PI;
        var kippen = (grad > 90 || grad < -90);

        knoten.appendChild(svgEl('circle', {
          class: 'g-dot', cx: R * Math.cos(m._w), cy: R * Math.sin(m._w), r: 5, fill: gr.farbe
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
          cx: R * Math.cos(m._w), cy: R * Math.sin(m._w), r: 13, class: 'g-hit'
        }));

        knoten.addEventListener('mouseenter', function (ev) { tipMerkmal(ev, m, element); });
        knoten.addEventListener('mousemove', bewegeTip);
        knoten.addEventListener('mouseleave', versteckeTip);

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
    sub.textContent = N + ' ' + K.plural(N, 'Merkmal', 'Merkmale');
    zentrum.appendChild(sub);
    wurzel.appendChild(zentrum);

    radialLegende(gruppen);
    hervorhebung();

    textFassung('Merkmale von ' + element.name, gruppen.map(function (gr) {
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
        aus: !!(K.state.hervor && K.state.hervor !== gr.pset),
        onClick: function () {
          K.state.hervor = (K.state.hervor === gr.pset) ? null : gr.pset;
          hervorhebung();
          radialLegende(gruppen);
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
    z.className = 'z';
    z.textContent = text;
    t.appendChild(z);
  }

  function tipMerkmal(ev, m, element) {
    var t = K.el.tip;
    t.innerHTML = '';
    var b = document.createElement('b');
    b.textContent = m.name;
    t.appendChild(b);
    tipZeile(t, element.name + ' · ' + m.pset);
    var typ = m.typ || 'ohne Typangabe';
    if (m.einheit) typ += ' · ' + m.einheit;
    if (m.ifcTyp) typ += ' · ' + m.ifcTyp;
    tipZeile(t, typ);
    if (m.liste && m.liste.anzahl) {
      tipZeile(t, m.liste.anzahl + ' zulässige Werte: ' + K.kurzListe(m.liste.werte, 90));
    }
    if (m.beschreibung && m.beschreibung !== m.name) {
      tipZeile(t, K.gekuerzt(m.beschreibung, 130));
    }
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

  /* ---------- Zoom, Verschieben, Tastatur ---------- */

  function zoom(faktor, fx, fy) {
    if (!vb) return;
    var neuW = Math.min(24000, Math.max(120, vb.w * faktor));
    var neuH = vb.h * (neuW / vb.w);
    vb.x += (vb.w - neuW) * (fx === undefined ? 0.5 : fx);
    vb.y += (vb.h - neuH) * (fy === undefined ? 0.5 : fy);
    vb.w = neuW; vb.h = neuH;
    setViewBox();
  }

  function zuruecksetzen() {
    if (!vbStart) return;
    vb = { x: vbStart.x, y: vbStart.y, w: vbStart.w, h: vbStart.h };
    setViewBox();
  }

  K.grafikSteuerung = function () {
    var svg = K.el.netz;

    /* Zoomen nur mit Ctrl/Cmd oder bei fokussierter Grafik — sonst kapert
       der containerbreite Graph das Scrollrad der ganzen Seite. */
    svg.addEventListener('wheel', function (ev) {
      if (!vb) return;
      if (!ev.ctrlKey && !ev.metaKey && document.activeElement !== svg) return;
      ev.preventDefault();
      var rect = svg.getBoundingClientRect();
      zoom(ev.deltaY > 0 ? 1.12 : 1 / 1.12,
           (ev.clientX - rect.left) / rect.width,
           (ev.clientY - rect.top) / rect.height);
    }, { passive: false });

    var zieht = false, startX = 0, startY = 0, startVb = null;
    svg.addEventListener('pointerdown', function (ev) {
      if (!vb || (ev.target.closest && ev.target.closest('.g-knoten'))) return;
      zieht = true;
      startX = ev.clientX; startY = ev.clientY;
      startVb = { x: vb.x, y: vb.y };
      svg.classList.add('dragging');
      svg.setPointerCapture(ev.pointerId);
    });
    svg.addEventListener('pointermove', function (ev) {
      if (!zieht) return;
      var rect = svg.getBoundingClientRect();
      vb.x = startVb.x - (ev.clientX - startX) * (vb.w / rect.width);
      vb.y = startVb.y - (ev.clientY - startY) * (vb.h / rect.height);
      setViewBox();
    });
    function ende(ev) {
      if (!zieht) return;
      zieht = false;
      svg.classList.remove('dragging');
      try { svg.releasePointerCapture(ev.pointerId); } catch (e) {}
    }
    svg.addEventListener('pointerup', ende);
    svg.addEventListener('pointercancel', ende);

    /* Ohne Maus: Pfeiltasten verschieben, +/− zoomen, 0 setzt zurück */
    svg.addEventListener('keydown', function (ev) {
      if (!vb || ev.target !== svg) return;
      var schritt = vb.w * 0.12;
      var t = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
      if (t) { vb.x += t[0] * schritt; vb.y += t[1] * schritt; setViewBox(); ev.preventDefault(); return; }
      if (ev.key === '+' || ev.key === '=') { zoom(1 / 1.2); ev.preventDefault(); }
      if (ev.key === '-') { zoom(1.2); ev.preventDefault(); }
      if (ev.key === '0') { zuruecksetzen(); ev.preventDefault(); }
    });

    K.el['zoom-plus'].addEventListener('click', function () { zoom(1 / 1.2); });
    K.el['zoom-minus'].addEventListener('click', function () { zoom(1.2); });
    K.el['zoom-reset'].addEventListener('click', zuruecksetzen);
  };
})(KBOB);
