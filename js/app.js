/* Navigation, Filter und Start.

   Zwei Ebenen statt drei: eine flache, facettierte Liste aller Objekttypen —
   und darunter die Merkmale eines Objekttyps. Der Katalog ist eine Facette,
   keine Navigationsstufe: 666 der 719 Objekttypen stammen aus einer einzigen
   Quelle, eine Gliederung danach wäre eine Hürde statt einer Hilfe.

   Der Zustand steht in der URL, damit Ansichten teilbar bleiben und der
   Zurück-Knopf tut, was er soll. */

var KBOB = window.KBOB || (window.KBOB = {});

(function (K) {
  'use strict';

  K.state = {
    elemente: [],
    kataloge: [],
    werte: {},
    werteGeladen: false,
    detail: {},
    rohUebersicht: null,
    objekttyp: null,     // offener Objekttyp (URI)
    merkmal: null,       // offenes Merkmal (URI)
    ansicht: 'liste',
    hervor: null,
    laedt: 0,
    stumm: false,        // true, während die URL gelesen wird
    facetten: { katalog: [], status: [], phase: [] },
    seite: 1,
    proSeite: 100
  };

  K.SEITENGROESSEN = [100, 200, 500];

  var el = K.el = {};
  ['endpoint', 'graph', 'status', 'spinner', 'krumen', 'toolbar', 'platzhalter',
   'titelblock', 'titel', 'kennzahlen', 'titel-text', 'hinweis',
   'view-liste', 'view-galerie', 'view-graph', 'view-merkmal', 'galerie',
   'treffer', 'filter', 'csv', 'netz', 'legende', 'tip', 'graph-hinweis',
   'graph-text', 'neuladen', 'version', 'verbindung', 'barrierefreiheit',
   'graph-meldung', 'graph-wrap', 'graph-steuerung', 'aktive-filter',
   'merkmal-detail', 'zoom-plus', 'zoom-minus', 'zoom-reset',
   'facetten', 'blaettern'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  var dlgVerbindung = document.getElementById('dlg-verbindung');
  var dlgA11y = document.getElementById('dlg-a11y');

  function setStatus(text, isError) {
    el.status.className = 'status' + (isError ? ' error' : '');
    el.status.textContent = text;
  }
  K.setStatus = setStatus;

  /* ---------- Ladeanzeige ---------- */

  function busy(an, text) {
    K.state.laedt += an ? 1 : -1;
    if (K.state.laedt < 0) K.state.laedt = 0;
    var laeuft = K.state.laedt > 0;
    el.spinner.hidden = !laeuft;
    if (laeuft && text) {
      el.spinner.textContent = '';
      var ring = document.createElement('span');
      ring.className = 'ring';
      el.spinner.appendChild(ring);
      el.spinner.appendChild(document.createTextNode(text));
    }
  }

  /* ---------- Laden ---------- */

  function endpunkt() { return el.endpoint.value.trim(); }
  function graphUri() { return el.graph.value.trim(); }

  function laden() {
    if (!endpunkt() || !graphUri()) { setStatus('Endpunkt und Graph ausfüllen.', true); return; }
    if (dlgVerbindung.open) dlgVerbindung.close();

    el.neuladen.disabled = true;
    busy(true, 'Katalog wird geladen …');
    setStatus('Katalog wird geladen …');

    K.run(endpunkt(), K.uebersichtQuery(graphUri())).then(function (json) {
      var rows = json.results.bindings;
      busy(false);
      el.neuladen.disabled = false;

      if (!rows.length) {
        zeigeFehler('Der Graph ' + graphUri() + ' liefert keine Datentemplates. ' +
                    'Möglicherweise ist er noch nicht befüllt.');
        return;
      }
      K.uebernehmeUebersicht(rows);
      baueKataloge();
      baueFacetten();

      el.platzhalter.hidden = true;
      el.toolbar.hidden = false;
      el.titelblock.hidden = false;
      el.csv.disabled = false;

      ausUrl();
      zeichne();
      setStatus('');
    }).catch(function (err) {
      busy(false);
      el.neuladen.disabled = false;
      var msg = String(err && err.message || err);
      zeigeFehler(/Failed to fetch|NetworkError|CORS/i.test(msg)
        ? 'Der Browser kommt nicht an den Endpunkt. Meist liegt das an CORS — etwa ' +
          'wenn die Datei direkt per file:// geöffnet wurde. Starte lindas-proxy.py ' +
          'und rufe http://localhost:8765 auf.'
        : 'Die Abfrage ist fehlgeschlagen: ' + msg);
    });
  }

  /* Der Ladehinweis darf nicht stehen bleiben, wenn das Laden scheitert —
     sonst widerspricht die Seite sich selbst. */
  function zeigeFehler(text) {
    setStatus('Laden fehlgeschlagen.', true);
    el.titelblock.hidden = true;
    el.toolbar.hidden = true;
    ['view-liste', 'view-galerie', 'view-graph', 'view-merkmal'].forEach(function (v) {
      el[v].hidden = true;
    });

    el.platzhalter.hidden = false;
    el.platzhalter.className = 'meldung';
    el.platzhalter.innerHTML = '';

    var h = document.createElement('h2');
    h.textContent = 'Der Katalog konnte nicht geladen werden';
    el.platzhalter.appendChild(h);

    var p = document.createElement('p');
    p.textContent = text;
    el.platzhalter.appendChild(p);

    var b = document.createElement('button');
    b.textContent = 'Erneut versuchen';
    b.addEventListener('click', laden);
    el.platzhalter.appendChild(b);
    b.focus();
  }

  function baueKataloge() {
    var map = {};
    K.state.elemente.forEach(function (e) {
      var q = map[e.quelle];
      if (!q) q = map[e.quelle] = { name: e.quelle, objekttypen: 0, merkmale: 0, dok: false };
      q.objekttypen++;
      q.merkmale += e.anzahl;
      if (e.istDokument) q.dok = true;
    });
    K.state.kataloge = Object.keys(map).map(function (n) { return map[n]; })
      .sort(function (a, b) { return b.objekttypen - a.objekttypen; });
  }

  /* ---------- Facetten ---------- */

  /* Facetten aus den Daten. Mehrfachauswahl innerhalb einer Gruppe (ODER),
     zwischen den Gruppen wird geschnitten (UND). Nichts angekreuzt heisst
     «alle» — ausser bei der Art, die einen sinnvollen Standard braucht. */
  function baueFacetten() {
    var st = K.state;
    var phasen = {}, status = {};

    st.elemente.forEach(function (e) {
      e.phasen.forEach(function (p) { phasen[p] = true; });
      if (e.status) status[e.status] = (status[e.status] || 0) + 1;
    });

    el.facetten.innerHTML = '';

    gruppe('Katalog', 'katalog', st.kataloge.map(function (q) {
      return { wert: q.name, text: q.name, n: q.objekttypen };
    }));

    st.allePhasen = Object.keys(phasen).sort();

    var statusListe = Object.keys(status).sort();
    if (statusListe.length > 1) {
      gruppe('Reifegrad', 'status', statusListe.map(function (w) {
        return { wert: w, text: w, n: status[w] };
      }));
    }

    /* Nur ein Bruchteil der Merkmale deklariert eine Phase. Die Gruppe
       erscheint darum nur, wenn es überhaupt etwas auszuwählen gibt. */
    var phasenListe = Object.keys(phasen).sort();
    if (phasenListe.length) {
      gruppe('Projektphase', 'phase', phasenListe.map(function (p) {
        return { wert: p, text: p };
      }));
    }
  }

  /* Auswahlfeld mit Mehrfachauswahl. Kein natives <select multiple> — das ist
     mit der Maus kaum bedienbar und zeigt den Zustand nicht an. */
  function gruppe(titel, schluessel, eintraege) {
    var id = 'fac-' + schluessel;

    var box = document.createElement('div');
    box.className = 'dropdown';

    var lab = document.createElement('span');
    lab.className = 'label';
    lab.id = id;
    lab.textContent = titel;
    box.appendChild(lab);

    var knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'dd-knopf';
    knopf.setAttribute('aria-expanded', 'false');
    knopf.setAttribute('aria-labelledby', id + ' ' + id + '-wert');

    var wert = document.createElement('span');
    wert.className = 'dd-wert';
    wert.id = id + '-wert';
    knopf.appendChild(wert);

    var pfeil = document.createElement('span');
    pfeil.className = 'pfeil';
    pfeil.setAttribute('aria-hidden', 'true');
    pfeil.textContent = '▾';
    knopf.appendChild(pfeil);
    box.appendChild(knopf);

    var menu = document.createElement('div');
    menu.className = 'dd-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-labelledby', id);

    function beschrifte() {
      var n = K.state.facetten[schluessel].length;
      wert.textContent = n ? n + ' von ' + eintraege.length + ' gewählt' : 'Alle';
      wert.className = 'dd-wert' + (n ? ' aktiv' : '');
    }

    eintraege.forEach(function (e) {
      var l = document.createElement('label');
      l.className = 'opt';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = e.wert;
      cb.checked = K.state.facetten[schluessel].indexOf(e.wert) !== -1;
      cb.addEventListener('change', function () {
        var auswahl = K.state.facetten[schluessel];
        var i = auswahl.indexOf(e.wert);
        if (cb.checked && i === -1) auswahl.push(e.wert);
        if (!cb.checked && i !== -1) auswahl.splice(i, 1);
        beschrifte();
        neuAuswerten();
      });

      l.appendChild(cb);
      l.appendChild(document.createTextNode(e.text));
      if (e.n !== undefined) {
        var n = document.createElement('span');
        n.className = 'opt-n';
        n.textContent = e.n;
        l.appendChild(n);
      }
      menu.appendChild(l);
    });

    var fuss = document.createElement('div');
    fuss.className = 'dd-fuss';
    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'link';
    reset.textContent = 'Auswahl aufheben';
    reset.addEventListener('click', function () {
      K.state.facetten[schluessel] = [];
      Array.prototype.forEach.call(menu.querySelectorAll('input'), function (cb) {
        cb.checked = false;
      });
      beschrifte();
      neuAuswerten();
    });
    fuss.appendChild(reset);
    menu.appendChild(fuss);

    box.appendChild(menu);
    beschrifte();

    function auf(zustand) {
      menu.hidden = !zustand;
      knopf.setAttribute('aria-expanded', String(zustand));
    }
    knopf.addEventListener('click', function () { auf(menu.hidden); });
    box.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !menu.hidden) { auf(false); knopf.focus(); }
    });
    box.addEventListener('focusout', function (ev) {
      if (!box.contains(ev.relatedTarget)) auf(false);
    });

    el.facetten.appendChild(box);
  }

  /* Was gerade eingrenzt, gehört sichtbar über die Liste — sonst sucht man
     den Grund für eine kurze Trefferliste in den zugeklappten Auswahlfeldern. */
  var FACETTEN_TITEL = { katalog: 'Katalog', status: 'Reifegrad', phase: 'Projektphase' };

  function zeichneAktiveFilter() {
    var st = K.state;
    var box = el['aktive-filter'];
    box.innerHTML = '';

    var pillen = [];
    Object.keys(FACETTEN_TITEL).forEach(function (schluessel) {
      (st.facetten[schluessel] || []).forEach(function (wert) {
        pillen.push({ art: FACETTEN_TITEL[schluessel], wert: wert, schluessel: schluessel });
      });
    });
    if (el.filter.value.trim()) {
      pillen.push({ art: 'Suche', wert: el.filter.value.trim(), schluessel: 'suche' });
    }

    box.hidden = !pillen.length;
    if (!pillen.length) return;

    pillen.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pille';
      b.setAttribute('aria-label', 'Filter entfernen: ' + p.art + ' ' + p.wert);

      var art = document.createElement('span');
      art.className = 'art';
      art.textContent = p.art + ':';
      b.appendChild(art);
      b.appendChild(document.createTextNode(p.wert));

      var x = document.createElement('span');
      x.className = 'x';
      x.setAttribute('aria-hidden', 'true');
      x.textContent = '×';
      b.appendChild(x);

      b.addEventListener('click', function () {
        if (p.schluessel === 'suche') {
          el.filter.value = '';
        } else {
          var liste = st.facetten[p.schluessel];
          var i = liste.indexOf(p.wert);
          if (i !== -1) liste.splice(i, 1);
        }
        baueFacetten();
        neuAuswerten();
      });

      box.appendChild(b);
    });

    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'link filter-reset';
    reset.textContent = 'Alle Filter zurücksetzen';
    reset.addEventListener('click', function () {
      Object.keys(FACETTEN_TITEL).forEach(function (k) { st.facetten[k] = []; });
      el.filter.value = '';
      baueFacetten();
      neuAuswerten();
    });
    box.appendChild(reset);
  }

  function neuAuswerten() {
    K.state.hervor = null;
    K.state.seite = 1;
    K.state.objekttyp = null;
    K.state.merkmal = null;
    inUrl();
    zeichne();
  }

  function suchbegriff() { return el.filter.value.trim().toLowerCase(); }

  /* ---------- Auswahl ---------- */

  function objekttypVon(uri) {
    var t = K.state.elemente.filter(function (e) { return e.uri === uri; });
    return t.length ? t[0] : null;
  }

  function sichtbareObjekttypen() {
    var s = suchbegriff();
    var f = K.state.facetten;

    return K.state.elemente.filter(function (e) {
      if (f.katalog.length && f.katalog.indexOf(e.quelle) === -1) return false;
      if (f.status.length && f.status.indexOf(e.status) === -1) return false;
      if (f.phase.length && !e.phasen.some(function (p) { return f.phase.indexOf(p) !== -1; })) {
        return false;
      }
      if (!s) return true;
      if (e.name.toLowerCase().indexOf(s) !== -1) return true;
      if (e.beschreibung && e.beschreibung.toLowerCase().indexOf(s) !== -1) return true;
      return e.psets.some(function (p) { return p.name.toLowerCase().indexOf(s) !== -1; });
    });
  }

  function sichtbareMerkmale(uri) {
    var merkmale = K.state.detail[uri];
    if (!merkmale) return null;
    var s = suchbegriff();
    var f = K.state.facetten;
    return merkmale.filter(function (m) {
      if (f.phase.length && !m.phasen.some(function (p) { return f.phase.indexOf(p) !== -1; })) {
        return false;
      }
      if (!s) return true;
      var heu = (m.name + ' ' + m.pset + ' ' + m.beschreibung + ' ' + m.ifcTyp).toLowerCase();
      return heu.indexOf(s) !== -1;
    });
  }

  function merkmalVon() {
    var st = K.state;
    var liste = st.objekttyp ? st.detail[st.objekttyp] : null;
    if (!liste) return null;
    var t = liste.filter(function (m) { return m.uri === st.merkmal; });
    return t.length ? t[0] : null;
  }

  /* ---------- Zustand in der URL ---------- */

  function inUrl() {
    if (K.state.stumm) return;
    var st = K.state, p = [];

    if (st.objekttyp) p.push('o=' + encodeURIComponent(st.objekttyp));
    if (st.merkmal)   p.push('m=' + encodeURIComponent(st.merkmal));
    if (st.ansicht !== 'liste') p.push('v=' + st.ansicht);
    if (st.facetten.katalog.length) {
      p.push('k=' + st.facetten.katalog.map(encodeURIComponent).join(','));
    }
    if (st.facetten.status.length) p.push('r=' + st.facetten.status.join(','));
    if (st.facetten.phase.length) p.push('p=' + st.facetten.phase.join(','));
    if (el.filter.value.trim()) p.push('q=' + encodeURIComponent(el.filter.value.trim()));
    if (st.seite > 1) p.push('s=' + st.seite);
    if (st.proSeite !== 100) p.push('n=' + st.proSeite);

    var neu = p.length ? '#' + p.join('&') : '#';
    if (neu !== location.hash) history.pushState(null, '', neu);
  }

  function ausUrl() {
    var st = K.state, p = {};
    location.hash.replace(/^#/, '').split('&').forEach(function (teil) {
      var i = teil.indexOf('=');
      if (i > 0) p[teil.slice(0, i)] = teil.slice(i + 1);
    });

    function liste(wert) {
      return wert ? wert.split(',').map(decodeURIComponent).filter(Boolean) : [];
    }

    st.stumm = true;
    st.facetten.katalog = liste(p.k);
    st.facetten.status  = liste(p.r);
    st.facetten.phase   = liste(p.p);
    el.filter.value = p.q ? decodeURIComponent(p.q) : '';
    st.ansicht = (p.v === 'galerie' || p.v === 'graph') ? p.v : 'liste';
    ['liste', 'galerie', 'graph'].forEach(function (v) {
      document.getElementById('v-' + v).setAttribute('aria-pressed', String(v === st.ansicht));
    });
    st.objekttyp = p.o ? decodeURIComponent(p.o) : null;
    st.merkmal   = p.m ? decodeURIComponent(p.m) : null;
    st.seite     = Math.max(1, parseInt(p.s, 10) || 1);
    st.proSeite  = K.SEITENGROESSEN.indexOf(parseInt(p.n, 10)) !== -1
                     ? parseInt(p.n, 10) : 100;
    st.stumm = false;

    baueFacetten();
    if (st.objekttyp && !st.detail[st.objekttyp]) ladeDetail(st.objekttyp);
  }

  /* ---------- Navigation ---------- */

  K.geheZuUebersicht = function () {
    K.state.objekttyp = null;
    K.state.merkmal = null;
    K.state.hervor = null;
    inUrl();
    zeichne(true);
  };

  K.geheZuObjekttyp = function (uri) {
    if (!objekttypVon(uri)) return;
    K.state.objekttyp = uri;
    K.state.merkmal = null;
    K.state.hervor = null;
    inUrl();
    zeichne(true);
    if (!K.state.detail[uri]) ladeDetail(uri);
  };

  K.geheZuMerkmal = function (uri) {
    K.state.merkmal = uri;
    inUrl();
    zeichne(true);
  };

  function ladeDetail(uri) {
    var e = objekttypVon(uri);
    busy(true, 'Merkmale von ' + (e ? e.name : '…') + ' werden geladen …');
    K.holeDetail(endpunkt(), graphUri(), uri).then(function () {
      busy(false);
      if (K.state.objekttyp === uri) zeichne();
    }).catch(function (err) {
      busy(false);
      setStatus('Merkmale konnten nicht geladen werden: ' +
                String(err && err.message || err), true);
    });
  }

  /* ---------- Brotkrumen ---------- */

  function krume(text, onClick, aktuell) {
    var li = document.createElement('li');
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'krume';
    b.textContent = text;
    if (aktuell) {
      b.setAttribute('aria-current', 'page');
      b.disabled = true;
    } else if (onClick) {
      b.addEventListener('click', onClick);
    }
    li.appendChild(b);
    return li;
  }

  function trenner() {
    var li = document.createElement('li');
    var s = document.createElement('span');
    s.className = 'krume-trenner';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = '›';
    li.appendChild(s);
    return li;
  }

  function zeichneKrumen() {
    var st = K.state;
    el.krumen.innerHTML = '';
    el.krumen.appendChild(krume('Übersicht', K.geheZuUebersicht, !st.objekttyp));

    if (st.objekttyp) {
      var e = objekttypVon(st.objekttyp);
      el.krumen.appendChild(trenner());
      el.krumen.appendChild(krume(e ? e.name : '…',
        function () { K.geheZuObjekttyp(st.objekttyp); }, !st.merkmal));
    }
    if (st.merkmal) {
      var m = merkmalVon();
      el.krumen.appendChild(trenner());
      el.krumen.appendChild(krume(m ? m.name : '…', null, true));
    }
  }

  /* ---------- Titelblock ---------- */

  function titel(text, kennzahlen, beschreibung, hinweis) {
    el.titel.textContent = text;
    el.kennzahlen.textContent = kennzahlen || '';
    el['titel-text'].hidden = !beschreibung;
    el['titel-text'].textContent = beschreibung || '';
    el.hinweis.hidden = !hinweis;
    if (hinweis) el.hinweis.textContent = hinweis;
    document.title = text + ', KBOB Data Dictionary';
  }

  /* ---------- Zeichnen ---------- */

  function zeichne(fokussieren) {
    if (!K.state.elemente.length) return;
    var st = K.state;

    zeichneKrumen();
    zeichneAktiveFilter();
    el['view-merkmal'].hidden = true;

    if (st.merkmal && merkmalVon()) zeigeMerkmal();
    else if (st.objekttyp)          zeigeObjekttyp();
    else                            zeigeUebersicht();

    /* Nach einem Ebenenwechsel steht der Fokus auf der neuen Überschrift —
       sonst landet er beim Neuaufbau still auf <body>. */
    if (fokussieren) el.titel.focus();
  }
  K.zeichne = zeichne;

  /* Schneidet die Liste auf die aktuelle Seite zu und zeichnet die Bedienung.
     Der Graph blättert nicht — er zeigt immer die ganze Auswahl. */
  function blaettere(gesamt) {
    var st = K.state;
    var seiten = Math.max(1, Math.ceil(gesamt / st.proSeite));
    if (st.seite > seiten) st.seite = seiten;

    var von = (st.seite - 1) * st.proSeite;
    var bis = Math.min(von + st.proSeite, gesamt);

    el.blaettern.hidden = (st.ansicht === 'graph') || gesamt === 0;
    if (el.blaettern.hidden) return { von: von, bis: bis };

    el.blaettern.innerHTML = '';

    var bereich = document.createElement('span');
    bereich.className = 'bereich';
    bereich.textContent = gesamt <= st.proSeite
      ? K.zahl(gesamt) + (gesamt === 1 ? ' Eintrag' : ' Einträge')
      : K.zahl(von + 1) + '–' + K.zahl(bis) + ' von ' + K.zahl(gesamt);
    el.blaettern.appendChild(bereich);

    var feld = document.createElement('div');
    feld.className = 'feld';
    var lab = document.createElement('label');
    lab.className = 'label';
    lab.setAttribute('for', 'pro-seite');
    lab.textContent = 'Pro Seite';
    var sel = document.createElement('select');
    sel.id = 'pro-seite';
    K.SEITENGROESSEN.forEach(function (n) {
      var o = document.createElement('option');
      o.value = n; o.textContent = n;
      if (n === st.proSeite) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      st.proSeite = parseInt(sel.value, 10);
      st.seite = 1;
      inUrl();
      zeichne();
    });
    feld.appendChild(lab);
    feld.appendChild(sel);

    var nav = document.createElement('span');
    nav.className = 'seiten';

    function knopf(text, ziel, aus) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ghost';
      b.textContent = text;
      b.disabled = aus;
      b.addEventListener('click', function () {
        st.seite = ziel;
        inUrl();
        zeichne();
        el.titel.focus();
      });
      return b;
    }

    nav.appendChild(knopf('Zurück', st.seite - 1, st.seite <= 1));
    var stand = document.createElement('span');
    stand.textContent = 'Seite ' + st.seite + ' von ' + seiten;
    nav.appendChild(stand);
    nav.appendChild(knopf('Weiter', st.seite + 1, st.seite >= seiten));
    el.blaettern.appendChild(nav);
    el.blaettern.appendChild(feld);

    return { von: von, bis: bis };
  }

  function sichtbareAnsicht(name) {
    ['liste', 'galerie', 'graph'].forEach(function (v) {
      el['view-' + v].hidden = (v !== name);
    });
  }

  /* --- Übersicht: alle Objekttypen, flach und facettiert --- */

  function zeigeUebersicht() {
    var st = K.state;
    var liste = sichtbareObjekttypen();
    var merkmale = liste.reduce(function (s, e) { return s + e.anzahl; }, 0);
    titel('Objekttypen',
      K.zahl(liste.length) + ' Objekttypen · ' + K.zahl(merkmale) + ' Merkmale · ' +
      K.zahl(st.kataloge.length) + ' Kataloge',
      'Jeder Objekttyp führt die Merkmale, die der Katalog für ihn vorsieht — mit ' +
      'Datentyp, Einheit beziehungsweise zulässigen Werten und Property Set. Alle ' +
      'Merkmale sind gleichrangig; eine Pflicht-/Kann-Unterscheidung kennt der ' +
      'Katalog nicht.',
      null);

    el.treffer.textContent = K.zahl(liste.length) + ' Treffer';

    var aus = blaettere(liste.length);
    var seite = liste.slice(aus.von, aus.bis);
    var mitPhase = liste.some(function (e) { return e.phasen.length; });

    if (st.ansicht === 'liste') {
      sichtbareAnsicht('liste');
      var spalten = [
        { titel: 'Objekttyp', breite: '22%' },
        { titel: 'Beschreibung' },
        { titel: 'Merkmale', breite: '90px', rechts: true },
        { titel: 'Reifegrad', breite: '100px' }
      ];
      if (mitPhase) spalten.push({ titel: 'Projektphase', breite: '130px' });
      spalten.push({ titel: 'Katalog', breite: '18%' });

      K.zeichneListe({
        titel: 'Objekttypen im Katalog',
        spalten: spalten,
        zeilen: seite.map(function (e) {
          var zellen = [
            function () {
              return K.zeilenKnopf(e.name, e.sprache,
                function () { K.geheZuObjekttyp(e.uri); });
            },
            function () {
              if (!e.beschreibung) return K.leer('keine Beschreibung');
              var s = document.createElement('span');
              s.className = 'beschreibung';
              s.textContent = e.beschreibung;
              return s;
            },
            function () { return String(e.anzahl); },
            function () { return statusMarke(e.status) || K.leer('ohne Reifegrad'); }
          ];
          if (mitPhase) zellen.push(function () { return K.phasen(e.phasen, st.allePhasen); });
          zellen.push(function () {
            var s = document.createElement('span');
            s.className = 'zell-muted';
            s.textContent = e.quelle;
            return s;
          });
          return {
            id: K.anker(e.uri),
            onClick: function () { K.geheZuObjekttyp(e.uri); },
            zellen: zellen
          };
        })
      });
    } else if (st.ansicht === 'galerie') {
      sichtbareAnsicht('galerie');
      K.zeichneGalerie(seite.map(function (e) {
        return {
          id: K.anker(e.uri), name: e.name, sprache: e.sprache,
          zahl: e.anzahl, zahlText: 'Merkmale',
          text: e.beschreibung,
          marken: e.status ? [{ name: e.status, art: 'status' }] : [],
          fuss: e.quelle,
          onClick: function () { K.geheZuObjekttyp(e.uri); }
        };
      }));
    } else {
      sichtbareAnsicht('graph');
      uebersichtsGraph(liste);
    }
  }

  /* Netz nur, solange es lesbar bleibt. Darüber hilft keine Ersatzgrafik —
     die Auswahl muss enger werden, und das sagt die Meldung. */
  function uebersichtsGraph(liste) {
    if (liste.length > K.NETZ_MAX) {
      graphMeldung('Zu viele Objekttypen für eine Netzdarstellung',
        K.zahl(liste.length) + ' Objekttypen ergeben ein unlesbares Knäuel. ' +
        'Grenze die Auswahl über Katalog, Reifegrad oder die Suche auf höchstens ' +
        K.NETZ_MAX + ' Objekttypen ein — dann erscheint das Netz. Die Liste zeigt ' +
        'die volle Auswahl.');
      return;
    }
    graphMeldung(null);

    var knoten = [], kanten = [], nachPset = {};
    liste.forEach(function (e) {
      var k = {
        id: 'o:' + e.uri, name: e.name, farbe: '#0F5C4E', form: 'kreis',
        r: 4 + Math.sqrt(e.anzahl) * 1.5,
        vorlesen: e.name + ', ' + e.anzahl + ' Merkmale, ' + e.quelle,
        zeilen: [e.quelle, e.anzahl + ' Merkmale — öffnen'],
        onClick: function () { K.geheZuObjekttyp(e.uri); }
      };
      knoten.push(k);
      e.psets.forEach(function (p) {
        var pk = nachPset[p.name];
        if (!pk) {
          pk = nachPset[p.name] = {
            id: 'p:' + p.name, name: p.name, farbe: '#6B5B4A', form: 'quadrat',
            r: 5, stark: true, objekttypen: 0, merkmale: 0,
            onClick: (function (nm) {
              return function () {
                K.state.hervor = (K.state.hervor === nm) ? null : nm;
                zeichne();
              };
            })(p.name)
          };
          knoten.push(pk);
        }
        pk.objekttypen++;
        pk.merkmale += p.n;
        kanten.push({ a: k, b: pk });
      });
    });

    Object.keys(nachPset).forEach(function (n) {
      var pk = nachPset[n];
      pk.r = 5 + Math.sqrt(pk.objekttypen) * 2.2;
      pk.vorlesen = 'Property Set ' + pk.name + ', in ' + pk.objekttypen +
                    ' Objekttypen, ' + pk.merkmale + ' Merkmale';
      pk.zeilen = ['Property Set',
                   'in ' + pk.objekttypen + ' Objekttypen, ' + pk.merkmale + ' Merkmale',
                   'hervorheben'];
    });

    K.zeichneNetz(knoten, kanten, [
      { name: 'Objekttyp', n: liste.length, farbe: '#0F5C4E' },
      { name: 'Property Set', n: Object.keys(nachPset).length, farbe: '#6B5B4A', form: 'quadrat' },
      { hinweis: K.state.hervor ? 'Hervorgehoben: ' + K.state.hervor
                                : 'Punktgrösse: Anzahl Merkmale' }
    ], 'Objekttypen und die Property Sets, die sie teilen. Ein Objekttyp öffnet seine ' +
       'Merkmale, ein Property Set hebt seine Objekttypen hervor. Mausrad oder +/− zoomt, ' +
       'Pfeiltasten verschieben.', 'Objekttypen und Property Sets');
  }

  /* --- Ein Objekttyp und seine Merkmale --- */

  function zeigeObjekttyp() {
    var st = K.state;
    var e = objekttypVon(st.objekttyp);
    if (!e) { K.geheZuUebersicht(); return; }

    var merkmale = sichtbareMerkmale(e.uri);

    if (merkmale === null) {
      titel(e.name, 'Merkmale werden geladen …', e.beschreibung, null);
      el.treffer.textContent = '';
      el.blaettern.hidden = true;
      sichtbareAnsicht(st.ansicht);
      if (st.ansicht === 'liste') {
        K.zeichneListe({ titel: e.name, spalten: [{ titel: 'Merkmal' }], zeilen: [],
                         leerText: 'Merkmale werden geladen …' });
      } else if (st.ansicht === 'galerie') {
        K.zeichneGalerie([], 'Merkmale werden geladen …');
      } else {
        el['graph-hinweis'].textContent = 'Merkmale werden geladen …';
        el.netz.innerHTML = '';
      }
      return;
    }

    var psets = {};
    merkmale.forEach(function (m) { psets[m.pset] = true; });

    titel(e.name,
      K.zahl(merkmale.length) +
      (merkmale.length === e.anzahl ? '' : ' von ' + K.zahl(e.anzahl)) +
      ' Merkmale · ' + Object.keys(psets).length + ' Property Sets · ' + e.quelle,
      e.beschreibung, null);

    el.treffer.textContent = K.zahl(merkmale.length) + ' Treffer';

    var aus = blaettere(merkmale.length);
    var seite = merkmale.slice(aus.von, aus.bis);
    var mitPhase = merkmale.some(function (m) { return m.phasen.length; });

    if (st.ansicht === 'liste') {
      sichtbareAnsicht('liste');
      var spalten = [
        { titel: 'Merkmal', breite: '28%' },
        { titel: 'Datentyp', breite: '10%' },
        { titel: 'Reifegrad', breite: '10%' },
        { titel: 'Property Set', breite: '20%' }
      ];
      if (mitPhase) spalten.push({ titel: 'Projektphase', breite: '130px' });
      spalten.push({ titel: 'Einheit / Zulässige Werte' });

      K.zeichneListe({
        titel: 'Merkmale von ' + e.name,
        spalten: spalten,
        zeilen: seite.map(function (m) {
          var zellen = [
            function () {
              var box = document.createDocumentFragment();
              box.appendChild(K.zeilenKnopf(m.name, null,
                function () { K.geheZuMerkmal(m.uri); }));
              if (m.beschreibung && m.beschreibung !== m.name) {
                var de = document.createElement('span');
                de.className = 'merkmal-desc';
                de.textContent = m.beschreibung;
                box.appendChild(de);
              }
              return box;
            },
            function () { return typMarke(m); },
            function () { return statusMarke(m.status) || K.leer('ohne Reifegrad'); },
            function () { return psetZelle(e, m); }
          ];
          if (mitPhase) zellen.push(function () { return K.phasen(m.phasen, st.allePhasen); });
          zellen.push(function () { return werteZelle(m); });
          return { onClick: function () { K.geheZuMerkmal(m.uri); }, zellen: zellen };
        })
      });
    } else if (st.ansicht === 'galerie') {
      sichtbareAnsicht('galerie');
      K.zeichneGalerie(seite.map(function (m) {
        return {
          name: m.name,
          text: (m.beschreibung && m.beschreibung !== m.name) ? m.beschreibung : '',
          marken: [{ name: m.pset, farbe: e.farbe[m.pset] }]
            .concat(m.typ ? [{ name: m.typ, art: 'fill' }] : [])
            .concat(m.status ? [{ name: m.status, art: 'status' }] : []),
          fuss: [m.einheit, m.ifcTyp,
                 m.liste && m.liste.anzahl ? m.liste.anzahl + ' zulässige Werte' : '']
                 .filter(Boolean).join(' · '),
          onClick: function () { K.geheZuMerkmal(m.uri); }
        };
      }));
    } else {
      sichtbareAnsicht('graph');
      graphMeldung(null);
      K.zeichneRadial(e, merkmale,
        'Die Merkmale von ' + e.name + ', gruppiert nach Property Set. Ein Merkmal öffnet ' +
        'seine Angaben. Mausrad oder +/− zoomt, Pfeiltasten verschieben.');
    }
  }

  /* Reifegrad. Der Katalog kennt bisher nur Candidate und Preview —
     verabschiedet ist nichts. Das gehört an jeden Eintrag. */
  function statusMarke(wert) {
    if (!wert) return null;
    var t = document.createElement('span');
    t.className = 'token token--status';
    t.textContent = wert;
    t.title = wert === 'Preview'
      ? 'Vorschau — noch in Erarbeitung'
      : 'Kandidat — vorgeschlagen, noch nicht verabschiedet';
    return t;
  }

  /* Statt einer leeren Zeichenfläche: sagen, was zu tun ist */
  function graphMeldung(titel, text) {
    var zeigen = !!titel;
    el['graph-meldung'].hidden = !zeigen;
    el['graph-wrap'].hidden = zeigen;
    el['graph-steuerung'].hidden = zeigen;
    el['graph-hinweis'].hidden = zeigen;
    if (!zeigen) return;

    el['graph-meldung'].innerHTML = '';
    var h = document.createElement('h2');
    h.textContent = titel;
    el['graph-meldung'].appendChild(h);
    var p = document.createElement('p');
    p.textContent = text;
    el['graph-meldung'].appendChild(p);
  }

  function typMarke(m) {
    if (!m.typ) return K.leer('ohne Typangabe');
    var t = document.createElement('span');
    t.className = 'token token--fill';
    t.textContent = m.typ;
    return t;
  }

  function psetZelle(e, m) {
    var box = document.createElement('span');
    box.className = 'pset';
    var sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = e.farbe[m.pset] || 'var(--rule)';
    box.appendChild(sw);
    var pn = document.createElement('span');
    pn.className = 'pset-name';
    pn.textContent = m.pset;
    if (m.ifcPset) {
      var ip = document.createElement('span');
      ip.className = 'pset-ifc';
      ip.textContent = 'IFC: ' + m.ifcPset;
      pn.appendChild(ip);
    }
    box.appendChild(pn);
    return box;
  }

  function werteZelle(m) {
    var box = document.createDocumentFragment();
    var etwas = false;
    if (m.einheit) {
      var eh = document.createElement('span');
      eh.className = 'einheit';
      eh.textContent = m.einheit;
      box.appendChild(eh);
      etwas = true;
    }
    if (m.liste && m.liste.anzahl) {
      var w = document.createElement('span');
      w.className = 'werte';
      var n = document.createElement('span');
      n.className = 'werte-n';
      n.textContent = m.liste.anzahl + ' Werte: ';
      w.appendChild(n);
      w.appendChild(document.createTextNode(K.gekuerzt(m.liste.werte, 70)));
      box.appendChild(w);
      etwas = true;
    }
    return etwas ? box : K.leer('ohne Einheit und ohne Werteliste');
  }

  /* --- Ein Merkmal --- */

  function zeigeMerkmal() {
    var e = objekttypVon(K.state.objekttyp);
    var m = merkmalVon();
    if (!e || !m) { K.state.merkmal = null; zeichne(); return; }

    sichtbareAnsicht(null);
    el['view-merkmal'].hidden = false;
    el.treffer.textContent = '';

    titel(m.name, e.name + ' · ' + m.pset + ' · ' + e.quelle, null, null);

    var ziel = el['merkmal-detail'];
    ziel.innerHTML = '';

    if (m.beschreibung && m.beschreibung !== m.name) {
      var p = document.createElement('p');
      p.className = 'lead';
      p.textContent = m.beschreibung;
      ziel.appendChild(p);
    }

    var dl = document.createElement('dl');
    dl.className = 'daten';

    function zeile(t, wert) {
      if (!wert) return;
      var dt = document.createElement('dt');
      dt.textContent = t;
      var dd = document.createElement('dd');
      if (typeof wert === 'string') dd.textContent = wert;
      else dd.appendChild(wert);
      dl.appendChild(dt); dl.appendChild(dd);
    }

    zeile('Objekttyp', e.name);
    zeile('Katalog', e.quelle);
    zeile('Property Set', psetZelle(e, m));
    zeile('Datentyp', typMarke(m));
    zeile('Reifegrad', statusMarke(m.status));
    zeile('IFC-Datentyp', m.ifcTyp);
    zeile('IFC-Property-Set', m.ifcPset);
    zeile('Einheit', m.einheit);
    if (m.liste && m.liste.anzahl) {
      zeile('Zulässige Werte (' + m.liste.anzahl + ')', m.liste.werte);
    }
    if (K.state.allePhasen && K.state.allePhasen.length) {
      zeile('Projektphasen', K.phasen(m.phasen, K.state.allePhasen));
    }
    var uri = document.createElement('span');
    uri.className = 'mono';
    uri.textContent = m.uri;
    zeile('URI', uri);

    ziel.appendChild(dl);
  }

  /* ---------- Ansicht ---------- */

  function setzeAnsicht(name) {
    K.state.ansicht = name;
    ['liste', 'galerie', 'graph'].forEach(function (v) {
      document.getElementById('v-' + v).setAttribute('aria-pressed', String(v === name));
    });
    if (K.state.merkmal) K.state.merkmal = null;
    inUrl();
    zeichne();
  }
  K.setzeAnsicht = setzeAnsicht;

  /* ---------- CSV ---------- */

  function csvZelle(w) {
    var s = w == null ? '' : String(w);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function speichere(zeilen, name) {
    var blob = new Blob(['﻿' + zeilen.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  var KOPF = ['Objekttyp', 'Reifegrad Objekttyp', 'Katalog', 'Merkmal', 'Merkmal-URI',
              'Beschreibung', 'Datentyp', 'Reifegrad Merkmal', 'Property Set',
              'IFC-Property-Set', 'Einheit', 'Zulässige Werte', 'IFC-Datentyp',
              'Projektphasen'];

  function merkmalZeile(e, m) {
    return [e.name, e.status, e.quelle, m.name, m.uri, m.beschreibung, m.typ, m.status,
            m.pset, m.ifcPset, m.einheit, m.liste ? m.liste.werte : '', m.ifcTyp,
            m.phasen.join(' ')].map(csvZelle).join(';');
  }

  function dateiname(s) {
    return s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /* Ein Objekttyp: sofort. Eine ganze Auswahl: die Merkmale werden dafür
     nachgeladen — genau das braucht die Datenübergabe an einen Integrator. */
  function toCsv() {
    var st = K.state;

    if (st.objekttyp && st.detail[st.objekttyp]) {
      var e = objekttypVon(st.objekttyp);
      var zeilen = [KOPF.join(';')];
      (sichtbareMerkmale(st.objekttyp) || []).forEach(function (m) {
        zeilen.push(merkmalZeile(e, m));
      });
      speichere(zeilen, 'kbob-' + dateiname(e.name) + '.csv');
      setStatus(K.zahl(zeilen.length - 1) + ' Merkmale gespeichert.');
      return;
    }

    var auswahl = sichtbareObjekttypen();
    if (!auswahl.length) return;

    if (auswahl.length > 60) {
      setStatus('Für den Export bitte auf höchstens 60 Objekttypen filtern — aktuell sind ' +
                K.zahl(auswahl.length) + ' ausgewählt.', true);
      return;
    }

    el.csv.disabled = true;
    busy(true, 'Merkmale für den Export werden geladen …');

    Promise.all(auswahl.map(function (e) {
      return K.holeDetail(endpunkt(), graphUri(), e.uri);
    })).then(function () {
      busy(false);
      el.csv.disabled = false;
      var zeilen = [KOPF.join(';')];
      auswahl.forEach(function (e) {
        (st.detail[e.uri] || []).forEach(function (m) { zeilen.push(merkmalZeile(e, m)); });
      });
      speichere(zeilen, 'kbob-merkmale.csv');
      setStatus(K.zahl(auswahl.length) + ' Objekttypen mit ' + K.zahl(zeilen.length - 1) +
                ' Merkmalen gespeichert.');
    }).catch(function (err) {
      busy(false);
      el.csv.disabled = false;
      setStatus('Export fehlgeschlagen: ' + String(err && err.message || err), true);
    });
  }

  /* ---------- Abfragen zeigen ---------- */

  function zeigeAbfrage(welche) {
    ['uebersicht', 'detail', 'werte'].forEach(function (w) {
      document.getElementById('tab-' + w).setAttribute('aria-pressed', String(w === welche));
    });
    var g = graphUri();
    var beispiel = K.state.objekttyp ||
                   (K.state.elemente.length ? K.state.elemente[0].uri : 'https://beispiel/klasse');
    document.getElementById('query-text').value =
      welche === 'uebersicht' ? K.uebersichtQuery(g)
      : welche === 'detail'   ? K.detailQuery(g, beispiel)
      :                         K.werteQuery(g);
  }

  /* ---------- Verdrahtung ---------- */

  function verdrahten() {
    el.version.textContent = 'kbob-data ' + K.VERSION;

    el.neuladen.addEventListener('click', laden);

    ['liste', 'galerie', 'graph'].forEach(function (v) {
      document.getElementById('v-' + v).addEventListener('click', function () { setzeAnsicht(v); });
    });

    el.verbindung.addEventListener('click', function () {
      zeigeAbfrage('uebersicht');
      dlgVerbindung.showModal();
    });
    ['uebersicht', 'detail', 'werte'].forEach(function (w) {
      document.getElementById('tab-' + w).addEventListener('click', function () { zeigeAbfrage(w); });
    });
    document.getElementById('close-verbindung')
      .addEventListener('click', function () { dlgVerbindung.close(); });
    document.getElementById('copy-query').addEventListener('click', function () {
      var ta = document.getElementById('query-text');
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      setStatus('Abfrage in die Zwischenablage kopiert.');
    });

    el.barrierefreiheit.addEventListener('click', function () { dlgA11y.showModal(); });
    document.getElementById('close-a11y')
      .addEventListener('click', function () { dlgA11y.close(); });

    el.csv.addEventListener('click', toCsv);

    /* Entprellt: im Netz kostet ein Neuaufbau bis zu 200 ms */
    var sucheTimer = null;
    el.filter.addEventListener('input', function () {
      clearTimeout(sucheTimer);
      sucheTimer = setTimeout(function () { inUrl(); zeichne(); }, 180);
    });

    window.addEventListener('popstate', function () { ausUrl(); zeichne(); });

    /* Die Kopfzeile klebt — die Tabellenköpfe müssen wissen, wie hoch sie ist */
    var kopf = document.querySelector('header');
    var subkopf = document.querySelector('.subkopf');
    function messeKopf() {
      var wurzel = document.documentElement;
      wurzel.style.setProperty('--kopf', kopf.offsetHeight + 'px');
      wurzel.style.setProperty('--kopf-gesamt', (kopf.offsetHeight + subkopf.offsetHeight) + 'px');
    }
    messeKopf();
    if (window.ResizeObserver) {
      var beobachter = new ResizeObserver(messeKopf);
      beobachter.observe(kopf);
      beobachter.observe(subkopf);
    } else {
      window.addEventListener('resize', messeKopf);
    }

    K.grafikSteuerung();
  }

  verdrahten();
  laden();      // ohne Klick: der Katalog ist beim Öffnen schon da
})(KBOB);
