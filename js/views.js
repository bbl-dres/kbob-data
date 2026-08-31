/* Ansichten.

   Die App navigiert in drei Stufen: Quelle → Objekttyp → Attribut.
   Jede Sammlung laesst sich als Liste, Galerie oder Grafik ansehen; die
   Renderer hier sind darum generisch und bekommen fertige Beschreibungen. */

var KBOB = window.KBOB || (window.KBOB = {});

(function (K) {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';

  function svgEl(name, attrs) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    return n;
  }

  K.leer = function () {
    var s = document.createElement('span');
    s.className = 'leer';
    s.textContent = '—';
    return s;
  };

  /* Farbige Chips, etwa fuer die Property Sets eines Objekttyps */
  K.chips = function (eintraege) {
    var box = document.createElement('span');
    box.className = 'chips';
    eintraege.forEach(function (c) {
      var chip = document.createElement('span');
      chip.className = 'chip';
      if (c.farbe) {
        var sw = document.createElement('span');
        sw.className = 'swatch';
        sw.style.background = c.farbe;
        chip.appendChild(sw);
      }
      chip.appendChild(document.createTextNode(c.name + ' '));
      if (c.n !== undefined && c.n !== null) {
        var n = document.createElement('span');
        n.className = 'chip-n';
        n.textContent = c.n;
        chip.appendChild(n);
      }
      box.appendChild(chip);
    });
    return box;
  };

  /* =========================================================
     Liste — Tabelle aus einer Spaltenbeschreibung
     ========================================================= */

  K.zeichneListe = function (spec) {
    var ziel = K.el['view-liste'];
    ziel.innerHTML = '';

    var tab = document.createElement('table');
    var thead = document.createElement('thead');
    var trh = document.createElement('tr');
    spec.spalten.forEach(function (s) {
      var th = document.createElement('th');
      th.textContent = s.titel;
      if (s.breite) th.style.width = s.breite;
      if (s.rechts) th.className = 'rechts';
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
      td0.textContent = spec.leerText || 'Kein Treffer für diese Filter.';
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
    }

    spec.zeilen.forEach(function (z) {
      var tr = document.createElement('tr');
      if (z.id) tr.id = z.id;
      if (z.onClick) {
        tr.className = 'klickbar';
        tr.tabIndex = 0;
        tr.setAttribute('role', 'button');
        if (z.titel) tr.title = z.titel;
        tr.addEventListener('click', z.onClick);
        tr.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); z.onClick(); }
        });
      }
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
      tbody.appendChild(tr);
    });

    tab.appendChild(tbody);
    ziel.appendChild(tab);
  };

  /* =========================================================
     Galerie — eine Karte je Eintrag
     ========================================================= */

  K.zeichneGalerie = function (karten, leerText) {
    var ziel = K.el.galerie;
    ziel.innerHTML = '';

    if (!karten.length) {
      var p = document.createElement('p');
      p.className = 'kein-treffer';
      p.textContent = leerText || 'Kein Treffer für diese Filter.';
      ziel.appendChild(p);
      return;
    }

    karten.forEach(function (k) {
      var karte = document.createElement(k.onClick ? 'button' : 'div');
      karte.className = 'karte';
      if (k.onClick) { karte.type = 'button'; karte.addEventListener('click', k.onClick); }
      if (k.id) karte.id = k.id;

      var kopf = document.createElement('span');
      kopf.className = 'karte-kopf';
      var nm = document.createElement('span');
      nm.className = 'karte-name';
      nm.textContent = k.name;
      kopf.appendChild(nm);
      if (k.zahl !== undefined && k.zahl !== null) {
        var n = document.createElement('span');
        n.className = 'karte-zahl';
        n.textContent = k.zahl;
        if (k.zahlTitel) n.title = k.zahlTitel;
        kopf.appendChild(n);
      }
      karte.appendChild(kopf);

      if (k.sub) {
        var src = document.createElement('span');
        src.className = 'karte-quelle';
        src.textContent = k.sub;
        karte.appendChild(src);
      }

      if (k.chips && k.chips.length) karte.appendChild(K.chips(k.chips));

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
     Grafik — gemeinsame Mechanik
     ========================================================= */

  var vb = null;

  function setViewBox() {
    if (vb) K.el.netz.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
  }

  /* Schriftgroessen sind Nutzerkoordinaten: ein enger Ausschnitt vergroessert
     die Beschriftung mit. Der Ausschnitt bekommt darum das Seitenverhaeltnis
     des Rahmens und wird nie ueber 1:1 hineingezoomt. */
  function rahmen(minX, minY, maxX, maxY, rand) {
    var rect = K.el.netz.getBoundingClientRect();
    var RW = rect.width || 1400, RH = rect.height || 900;

    var mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    var w = Math.max(maxX - minX, 10) + rand * 2;
    var h = Math.max(maxY - minY, 10) + rand * 2;

    var seiten = RW / RH;
    if (w / h < seiten) w = h * seiten; else h = w / seiten;

    if (w < RW) { w = RW; h = RH; }      // nicht vergroessern

    vb = { x: mx - w / 2, y: my - h / 2, w: w, h: h };
    setViewBox();
  }

  function neuesNetz() {
    K.el.netz.innerHTML = '';
    K.el.legende.innerHTML = '';
    var g = svgEl('g', {});
    K.el.netz.appendChild(g);
    return g;
  }

  /* ---------- Netz aus Knoten und Kanten ---------- */

  /* knoten: [{id, art, name, r, farbe, form, titelZeilen, onClick}]
     kanten: [{a, b}] mit Verweisen auf Knotenobjekte */
  K.zeichneNetz = function (knoten, kanten, legende, hinweis) {
    var wurzel = neuesNetz();
    K.el['graph-hinweis'].textContent = hinweis || '';

    if (!knoten.length) {
      K.el['graph-hinweis'].textContent = 'Kein Treffer für diese Filter.';
      return;
    }

    kraefteLayout(knoten, kanten);

    var kantenG = svgEl('g', {});
    wurzel.appendChild(kantenG);
    kanten.forEach(function (kn) {
      kantenG.appendChild(svgEl('line', {
        x1: kn.a.x, y1: kn.a.y, x2: kn.b.x, y2: kn.b.y,
        class: 'n-kante', 'data-a': kn.a.id, 'data-b': kn.b.id
      }));
    });

    var viele = knoten.length > 90;
    knoten.forEach(function (k) {
      var g = svgEl('g', { class: 'n-knoten', 'data-id': k.id });

      if (k.form === 'quadrat') {
        g.appendChild(svgEl('rect', {
          x: k.x - k.r, y: k.y - k.r, width: k.r * 2, height: k.r * 2, rx: 3,
          fill: k.farbe, class: 'n-form'
        }));
      } else {
        g.appendChild(svgEl('circle', { cx: k.x, cy: k.y, r: k.r, fill: k.farbe, class: 'n-form' }));
      }

      if (k.immerBeschriften || !viele || k.r > 9) {
        var t = svgEl('text', {
          class: 'n-label' + (k.immerBeschriften ? ' stark' : ''),
          x: k.x + k.r + 4, y: k.y, 'dominant-baseline': 'middle'
        });
        t.textContent = K.gekuerzt(k.name, 28);
        g.appendChild(t);
      }

      g.appendChild(svgEl('circle', {
        cx: k.x, cy: k.y, r: Math.max(k.r + 6, 11), class: 'g-hit'
      }));

      g.style.cursor = k.onClick ? 'pointer' : 'default';
      g.addEventListener('mouseenter', function (ev) { tipKnoten(ev, k); markiere(k.id); });
      g.addEventListener('mousemove', bewegeTip);
      g.addEventListener('mouseleave', function () { versteckeTip(); markiere(null); });
      if (k.onClick) g.addEventListener('click', k.onClick);

      wurzel.appendChild(g);
    });

    if (K.state.hervor) {
      var behalten = {};
      knoten.forEach(function (k) { if (k.name === K.state.hervor) behalten[k.id] = true; });
      kanten.forEach(function (kn) {
        if (behalten[kn.b.id]) behalten[kn.a.id] = true;
        if (behalten[kn.a.id]) behalten[kn.b.id] = true;
      });
      Array.prototype.forEach.call(wurzel.querySelectorAll('.n-knoten'), function (g) {
        g.classList.toggle('g-fade', !behalten[g.getAttribute('data-id')]);
      });
      Array.prototype.forEach.call(wurzel.querySelectorAll('.n-kante'), function (l) {
        l.classList.toggle('g-fade', !(behalten[l.getAttribute('data-a')] &&
                                       behalten[l.getAttribute('data-b')]));
      });
    }

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    knoten.forEach(function (k) {
      minX = Math.min(minX, k.x - k.r); maxX = Math.max(maxX, k.x + k.r + 120);
      minY = Math.min(minY, k.y - k.r); maxY = Math.max(maxY, k.y + k.r);
    });
    rahmen(minX, minY, maxX, maxY, 40);

    zeichneLegende(legende);
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
      var item = document.createElement('span');
      item.className = 'item' + (e.aus ? ' aus' : '');
      var sw = document.createElement('span');
      sw.className = 'swatch ' + (e.form === 'quadrat' ? 'eckig' : 'rund');
      sw.style.background = e.farbe;
      sw.style.marginTop = '0';
      item.appendChild(sw);
      item.appendChild(document.createTextNode(e.name + ' '));
      if (e.n !== undefined) {
        var n = document.createElement('span');
        n.className = 'n';
        n.textContent = e.n;
        item.appendChild(n);
      }
      if (e.onClick) item.addEventListener('click', e.onClick);
      else item.style.cursor = 'default';
      leg.appendChild(item);
    });
  }
  K.zeichneLegende = zeichneLegende;

  function markiere(id) {
    if (K.state.hervor) return;                 // Hervorhebung hat Vorrang
    var kanten = K.el.netz.querySelectorAll('.n-kante');
    for (var i = 0; i < kanten.length; i++) {
      var an = kanten[i].getAttribute('data-a') === id ||
               kanten[i].getAttribute('data-b') === id;
      kanten[i].classList.toggle('betont', !!id && an);
    }
  }

  /* ---------- Kraeftebasiertes Layout ---------- */

  function kraefteLayout(knoten, kanten) {
    var N = knoten.length;

    /* Deterministische Startlage auf einer Spirale — gleiche Daten, gleiches Bild */
    knoten.forEach(function (k, i) {
      var a = i * 2.399963;                     // goldener Winkel
      var r = 26 * Math.sqrt(i + 1);
      k.x = r * Math.cos(a); k.y = r * Math.sin(a);
      k.vx = 0; k.vy = 0;
    });

    var runden = N <= 100 ? 400 : (N <= 320 ? 240 : 140);

    /* In kleinen Netzen traegt jeder Knoten eine Beschriftung — die brauchen
       mehr Luft als die Punktwolke eines grossen Netzes. Der Abstand waechst
       darum, je weniger Knoten es sind. */
    var eng = N > 90;
    var federLaenge = eng ? 74 : Math.max(130, 950 / Math.sqrt(N));
    var abstossung = eng ? 1400 : federLaenge * federLaenge * 0.13;
    var feder = 0.045, mitte = eng ? 0.014 : 0.009, daempfung = 0.86;

    for (var s = 0; s < runden; s++) {
      for (var i = 0; i < N; i++) {
        var a = knoten[i];
        for (var j = i + 1; j < N; j++) {
          var b = knoten[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < 0.01) { d2 = 0.01; dx = 0.4; dy = 0.4; }
          if (d2 > 360000) continue;            // weit entfernt: vernachlaessigbar
          var d = Math.sqrt(d2);
          /* Grosse Knoten druecken staerker, sonst ueberlappen die wenigen
             dicken Quellenknoten in der Mitte des Knaeuels. */
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
     Radiale Grafik: ein Objekttyp mit Property Sets und Attributen
     ========================================================= */

  K.zeichneRadial = function (element, attrs, hinweis) {
    var wurzel = neuesNetz();
    K.el['graph-hinweis'].textContent = hinweis || '';
    if (!attrs.length) {
      K.el['graph-hinweis'].textContent = 'Kein Treffer für diese Filter.';
      return;
    }

    var namen = {};
    attrs.forEach(function (a) { namen[a.pset] = true; });

    var gruppen = Object.keys(namen)
      .sort(function (a, b) { return a.localeCompare(b, 'de'); })
      .map(function (p) {
        return {
          pset: p,
          farbe: element.farbe[p] || '#8A9A96',
          attrs: attrs.filter(function (a) { return a.pset === p; })
        };
      });

    var N = attrs.length;
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
      gr.attrs.forEach(function (a) { a._w = winkel; winkel += schritt; });
      gr.ende = winkel - schritt;
      gr.mitte = (gr.start + gr.ende) / 2;
      winkel += schritt * LUECKE;
    });

    var E = Rb + 46;
    rahmen(-E, -E, E, E, 0);

    function pt(r, w) { return [r * Math.cos(w), r * Math.sin(w)]; }

    var links = svgEl('g', {});
    wurzel.appendChild(links);

    gruppen.forEach(function (gr) {
      var p = pt(Rp, gr.mitte);
      var z = pt(Rz, gr.mitte);

      links.appendChild(svgEl('path', {
        d: 'M' + z[0] + ',' + z[1] + 'L' + p[0] + ',' + p[1],
        class: 'g-link', 'stroke-width': 2, stroke: gr.farbe, 'data-pset': gr.pset
      }));

      gr.attrs.forEach(function (a) {
        var ziel = pt(R, a._w);
        var ctrl = pt((Rp + R) / 2, a._w);
        links.appendChild(svgEl('path', {
          d: 'M' + p[0] + ',' + p[1] + 'Q' + ctrl[0] + ',' + ctrl[1] + ' ' + ziel[0] + ',' + ziel[1],
          class: 'g-link', stroke: gr.farbe, 'stroke-opacity': .45, 'data-pset': gr.pset
        }));
      });
    });

    gruppen.forEach(function (gr) {
      gr.attrs.forEach(function (a) {
        var knoten = svgEl('g', { class: 'g-attr g-group', 'data-pset': gr.pset });
        var grad = a._w * 180 / Math.PI;
        var kippen = (grad > 90 || grad < -90);

        knoten.appendChild(svgEl('circle', {
          class: 'g-dot',
          cx: R * Math.cos(a._w), cy: R * Math.sin(a._w), r: 5, fill: gr.farbe
        }));

        var t = svgEl('text', {
          class: 'g-label',
          transform: 'rotate(' + grad + ') translate(' + (R + 11) + ',0)' + (kippen ? ' rotate(180)' : ''),
          'text-anchor': kippen ? 'end' : 'start',
          'dominant-baseline': 'middle'
        });
        t.textContent = K.gekuerzt(a.name, 26);
        knoten.appendChild(t);

        knoten.appendChild(svgEl('circle', {
          cx: R * Math.cos(a._w), cy: R * Math.sin(a._w), r: 11, class: 'g-hit'
        }));

        knoten.style.cursor = 'pointer';
        knoten.addEventListener('mouseenter', function (ev) { tipAttribut(ev, a, element); });
        knoten.addEventListener('mousemove', bewegeTip);
        knoten.addEventListener('mouseleave', versteckeTip);
        knoten.addEventListener('click', function () { K.geheZuAttribut(a.uri); });

        wurzel.appendChild(knoten);
      });
    });

    /* Property-Set-Knoten mit Bogen. Der Name laeuft auf einem Bogen ausserhalb
       der Attributbeschriftungen — radial gesetzt liefe er quer durch die
       eigenen Attribute. */
    var bogenNr = 0;
    gruppen.forEach(function (gr) {
      var p = pt(Rp, gr.mitte);
      var knoten = svgEl('g', { class: 'g-group', 'data-pset': gr.pset });

      knoten.appendChild(svgEl('circle', {
        cx: p[0], cy: p[1], r: 8, fill: gr.farbe, stroke: '#fff', 'stroke-width': 2
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

      /* Beschriftung auf dem Bogen, solange dieser lang genug ist —
         sonst tangential daneben, sonst wuerde der Name abgeschnitten. */
      var beschriftung = K.gekuerzt(gr.pset, 30) + ' · ' + gr.attrs.length;
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

      knoten.style.cursor = 'pointer';
      knoten.addEventListener('click', function () {
        K.state.hervor = (K.state.hervor === gr.pset) ? null : gr.pset;
        hervorhebung();
        radialLegende(gruppen);
      });

      wurzel.appendChild(knoten);
    });

    var zentrum = svgEl('g', {});
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
    sub.textContent = N + ' Attribute';
    zentrum.appendChild(sub);
    wurzel.appendChild(zentrum);

    radialLegende(gruppen);
    hervorhebung();
  };

  /* Kreisbogen als Pfad, Richtung ueber `sweep` */
  function bogenPfad(r, a0, a1, sweep) {
    var x0 = r * Math.cos(a0), y0 = r * Math.sin(a0);
    var x1 = r * Math.cos(a1), y1 = r * Math.sin(a1);
    var gross = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    return 'M' + x0 + ',' + y0 + 'A' + r + ',' + r + ' 0 ' + gross + ' ' + sweep + ' ' + x1 + ',' + y1;
  }

  /* Text auf hoechstens `max` Zeilen à `breite` Zeichen umbrechen.
     Zu lange Einzelwoerter werden hart getrennt — sonst ragt der Name aus
     dem Zentrumskreis und wird dort unsichtbar (weiss auf weiss). */
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
        name: gr.pset, n: gr.attrs.length, farbe: gr.farbe,
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

  /* ---------- Tooltip ---------- */

  function tipZeile(t, text) {
    var z = document.createElement('span');
    z.className = 'z';
    z.textContent = text;
    t.appendChild(z);
  }

  function tipAttribut(ev, a, element) {
    var t = K.el.tip;
    t.innerHTML = '';
    var b = document.createElement('b');
    b.textContent = a.name;
    t.appendChild(b);

    tipZeile(t, element.name + ' · ' + a.pset);
    var typ = a.typ || 'ohne Typangabe';
    if (a.einheit) typ += ' · ' + a.einheit;
    if (a.ifcTyp) typ += ' · ' + a.ifcTyp;
    tipZeile(t, typ);
    if (a.liste && a.liste.anzahl) {
      tipZeile(t, a.liste.anzahl + ' zulässige Werte: ' + K.gekuerzt(a.liste.werte, 90));
    }
    if (a.beschreibung && a.beschreibung !== a.name) {
      tipZeile(t, K.gekuerzt(a.beschreibung, 130));
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
    (k.titelZeilen || []).forEach(function (z) { tipZeile(t, z); });
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

  /* ---------- Zoom und Verschieben ---------- */

  K.grafikSteuerung = function () {
    var svg = K.el.netz;

    svg.addEventListener('wheel', function (ev) {
      if (!vb) return;
      ev.preventDefault();
      var rect = svg.getBoundingClientRect();
      var fx = (ev.clientX - rect.left) / rect.width;
      var fy = (ev.clientY - rect.top) / rect.height;
      var faktor = ev.deltaY > 0 ? 1.12 : 1 / 1.12;
      var neuW = Math.min(24000, Math.max(120, vb.w * faktor));
      var neuH = vb.h * (neuW / vb.w);
      vb.x += (vb.w - neuW) * fx;
      vb.y += (vb.h - neuH) * fy;
      vb.w = neuW; vb.h = neuH;
      setViewBox();
    }, { passive: false });

    var zieht = false, startX = 0, startY = 0, startVb = null;

    svg.addEventListener('pointerdown', function (ev) {
      if (!vb) return;
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
  };
})(KBOB);
