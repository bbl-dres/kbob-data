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
    detailFehler: {},    // Fehlermeldung je Objekttyp-URI, falls das Detail scheiterte
    rohUebersicht: null,
    verbindung: null,    // beim Laden eingefrorene {endpoint, graph} — Folgeabfragen
                         // gehen gegen diesen Stand, nicht gegen das Dialogfeld
    objekttyp: null,     // offener Objekttyp (URI)
    merkmal: null,       // offenes Merkmal (URI)
    sprache: 'de',       // Sprache der Katalogbeschriftungen (nicht der Oberfläche)
    sort: null,          // { feld, richtung } — null heisst Standardreihenfolge der Ebene
    ansicht: 'liste',
    hervor: null,
    laedt: 0,
    stumm: false,        // true, während die URL gelesen wird
    facetten: { katalog: [], status: [], phase: [] },
    seite: 1,
    proSeite: 50
  };

  K.SEITENGROESSEN = [50, 100, 200];

  var el = K.el = {};
  ['endpoint', 'graph', 'status', 'krumen', 'toolbar', 'platzhalter',
   'titelblock', 'titel', 'kennzahlen', 'titel-text', 'hinweis',
   'view-liste', 'view-galerie', 'view-graph', 'view-merkmal', 'galerie',
   'treffer', 'filter', 'csv', 'netz', 'legende', 'tip', 'graph-hinweis',
   'graph-text', 'neuladen', 'version', 'verbindung', 'barrierefreiheit',
   'graph-meldung', 'graph-wrap', 'graph-steuerung', 'aktive-filter',
   'merkmal-detail', 'zoom-plus', 'zoom-minus', 'zoom-reset',
   'facetten', 'blaettern', 'datenstand', 'copy-status', 'sprache'].forEach(function (id) {
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

  /* Der Ladezustand dreht als Ring im Inhaltsbereich (Tabelle, Galerie,
     Graph, Platzhalter); die Statuszeile ist die Live-Region, über die auch
     Screenreader vom Ladevorgang erfahren. */
  function busy(an, text) {
    K.state.laedt += an ? 1 : -1;
    if (K.state.laedt < 0) K.state.laedt = 0;
    if (an && text) setStatus(text);
  }

  /* ---------- Laden ---------- */

  function endpunkt() { return el.endpoint.value.trim(); }
  function graphUri() { return el.graph.value.trim(); }

  function laden() {
    if (!endpunkt() || !graphUri()) { setStatus('Endpunkt und Graph ausfüllen.', true); return; }
    if (dlgVerbindung.open) dlgVerbindung.close();

    el.neuladen.disabled = true;
    busy(true, 'Katalog wird geladen …');

    K.run(endpunkt(), K.uebersichtQuery(graphUri(), K.state.sprache)).then(function (json) {
      var rows = json.results.bindings;
      busy(false);
      el.neuladen.disabled = false;

      if (!rows.length) {
        zeigeFehler('Der Graph ' + graphUri() + ' enthält keine Objekttypen. ' +
                    'Den Namen des Graphen unter «Verbindung und Abfrage» prüfen — ' +
                    'möglicherweise ist der Graph noch nicht befüllt.');
        return;
      }

      /* Neuer Stand heisst neuer Stand: alte Details und Wertelisten
         verwerfen, sonst mischen sich beim Endpunktwechsel zwei Quellen. */
      var st = K.state;
      st.detail = {};
      st.detailFehler = {};
      st.werte = {};
      st.werteGeladen = false;
      st.verbindung = { endpoint: endpunkt(), graph: graphUri(), sprache: st.sprache };

      K.uebernehmeUebersicht(rows);
      baueKataloge();
      baueFacetten();
      zeigeDatenstand();

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
      var text = 'Die Anwendung erreicht den Datenserver nicht. Die Verbindung prüfen ' +
                 'und «Erneut versuchen» wählen; im Firmennetz kann ein VPN oder ' +
                 'Proxy die Abfrage blockieren.';
      if (location.protocol === 'file:') {
        text += ' Technischer Hintergrund: Direkt aus dem Dateisystem geöffnet ' +
                'blockiert der Browser die Abfrage (CORS). Abhilfe: lindas-proxy.py ' +
                'starten und http://localhost:8765 öffnen.';
      }
      zeigeFehler(/Failed to fetch|NetworkError|CORS/i.test(msg)
        ? text
        : 'Die Abfrage ist fehlgeschlagen: ' + msg);
    });
  }

  /* Fusszeile: wann und woher der angezeigte Stand stammt. Der Satz zur
     Integrationsumgebung gilt nur für den LINDAS-INT-Endpunkt — bei einem
     anderen Endpunkt wäre er eine falsche Behauptung. */
  function zeigeDatenstand() {
    var jetzt = new Date();
    var text = 'Abgefragt am ' + jetzt.toLocaleDateString('de-CH') +
               ', ' + jetzt.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) + '.';
    var host = '';
    try { host = new URL(endpunkt(), location.href).host; } catch (e) {}
    var ist_int = !host || host.indexOf('int.lindas.admin.ch') !== -1 ||
                  host === location.host;   // Proxy: gleiche Origin, Ziel bleibt INT
    if (!ist_int) text = 'Daten von ' + host + '. ' + text;
    document.getElementById('hinweis-int').hidden = !ist_int;
    el.datenstand.textContent = text;
  }

  /* Der Ladehinweis darf nicht stehen bleiben, wenn das Laden scheitert —
     sonst widerspricht die Seite sich selbst. */
  function zeigeFehler(text) {
    setStatus('Laden fehlgeschlagen.', true);
    el.titelblock.hidden = true;
    el.toolbar.hidden = true;
    el['aktive-filter'].hidden = true;
    el.blaettern.hidden = true;
    el.csv.disabled = true;
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

    /* Nur ein Bruchteil der Merkmale deklariert einen Meilenstein. Die Gruppe
       erscheint darum nur, wenn es überhaupt etwas auszuwählen gibt.
       «LOIN-Meilenstein» ist das Label des Feldes im KBOB-Schema
       (dd:loinMilestone) — «Projektphase» wäre mit SIA 112 verwechselbar. */
    var phasenListe = Object.keys(phasen).sort();
    if (phasenListe.length) {
      gruppe('LOIN-Meilenstein', 'phase', phasenListe.map(function (p) {
        return { wert: p, text: p };
      }));
    }
  }

  /* Auf tieferen Ebenen wirken nicht alle Facetten — die wirkungslosen
     werden ausgeblendet statt totgestellt (ehrliche Filter, E7). */
  function facettenSichtbar(schluessel) {
    Array.prototype.forEach.call(el.facetten.children, function (box) {
      box.hidden = schluessel.indexOf(box.getAttribute('data-facette')) === -1;
    });
  }

  /* Auswahlfeld mit Mehrfachauswahl. Kein natives <select multiple> — das ist
     mit der Maus kaum bedienbar und zeigt den Zustand nicht an. */
  function gruppe(titel, schluessel, eintraege) {
    var id = 'fac-' + schluessel;

    var box = document.createElement('div');
    box.className = 'dropdown';
    box.setAttribute('data-facette', schluessel);

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
    menu.id = id + '-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-labelledby', id);
    knopf.setAttribute('aria-controls', menu.id);

    var reset = null;   // wird unten gebaut; beschrifte() hält ihn aktuell

    function beschrifte() {
      var n = K.state.facetten[schluessel].length;
      wert.textContent = n ? n + ' von ' + eintraege.length + ' gewählt' : 'Alle';
      wert.className = 'dd-wert' + (n ? ' aktiv' : '');
      if (reset) reset.disabled = n === 0;
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
    reset = document.createElement('button');
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
    /* focusout nur mit bekanntem Ziel auswerten: Safari und Firefox/macOS
       fokussieren angeklickte Checkboxen nicht (relatedTarget = null) —
       das Menü klappte sonst beim ersten Klick auf eine Option zu.
       Klicks ausserhalb schliesst der Sammel-Listener in verdrahten(). */
    box.addEventListener('focusout', function (ev) {
      if (ev.relatedTarget && !box.contains(ev.relatedTarget)) auf(false);
    });

    el.facetten.appendChild(box);
  }

  /* Was gerade eingrenzt, gehört sichtbar über die Liste — sonst sucht man
     den Grund für eine kurze Trefferliste in den zugeklappten Auswahlfeldern. */
  var FACETTEN_TITEL = { katalog: 'Katalog', status: 'Reifegrad', phase: 'LOIN-Meilenstein' };

  function zeichneAktiveFilter() {
    var st = K.state;
    var box = el['aktive-filter'];
    box.innerHTML = '';

    /* Auf der Objekttyp-Ebene wirken nur Meilenstein-Filter und Suche —
       Pillen für Katalog und Reifegrad würden dort einen Filter behaupten,
       der nicht greift. Der Zustand bleibt erhalten und erscheint wieder
       auf der Übersicht. */
    var wirksam = st.objekttyp ? ['phase'] : Object.keys(FACETTEN_TITEL);

    var pillen = [];
    wirksam.forEach(function (schluessel) {
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
        fokusNachPille();
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
      fokusNachPille();
    });
    box.appendChild(reset);
  }

  /* Beim Entfernen einer Pille verschwindet das fokussierte Element —
     der Fokus soll nicht still auf <body> fallen. */
  function fokusNachPille() {
    var naechste = el['aktive-filter'].querySelector('.pille');
    (naechste || el.filter).focus();
  }

  /* Die Meilensteinspalte lohnt sich erst, wenn sie etwas unterscheidet. Bei
     6 von 719 Zeilen mit Meilenstein wären es 713 leere Kästchenreihen. */
  function phasenspalteLohnt(liste, hatPhasen) {
    if (!K.state.allePhasen || !K.state.allePhasen.length) return false;
    if (K.state.facetten.phase.length) return true;
    var mit = liste.filter(hatPhasen).length;
    return mit > 0 && mit >= liste.length / 3;
  }

  /* ---------- Sortieren ---------- */

  /* Felder, nach denen die Listen sortieren können (auch aus der URL). */
  var SORT_FELDER = ['name', 'anzahl', 'status', 'quelle', 'pset', 'typ'];

  /* Klick auf denselben Spaltenkopf kehrt die Richtung um; eine neue Spalte
     startet aufsteigend — Zahlenspalten absteigend (das Grosse zuerst). */
  function sortiere(feld, start) {
    var st = K.state;
    if (st.sort && st.sort.feld === feld) {
      st.sort.richtung = -st.sort.richtung;
    } else {
      st.sort = { feld: feld, richtung: start || 1 };
    }
    st.seite = 1;
    inUrl(true);
    zeichne();
  }

  function vergleicher(feld, richtung) {
    return function (a, b) {
      var x = a[feld], y = b[feld], r;
      if (typeof x === 'number' || typeof y === 'number') r = (x || 0) - (y || 0);
      else r = String(x || '').localeCompare(String(y || ''), 'de');
      /* stabiler Zweitschlüssel, damit gleiche Werte nicht springen */
      if (r === 0 && feld !== 'name') {
        r = String(a.name || '').localeCompare(String(b.name || ''), 'de');
      }
      return r * richtung;
    };
  }

  function sortiert(liste) {
    var s = K.state.sort;
    return s ? liste.slice().sort(vergleicher(s.feld, s.richtung)) : liste;
  }

  /* Filteränderung wechselt die Ebene nicht: wer im Objekttyp den
     Meilenstein-Filter anfasst, bleibt im Objekttyp. */
  function neuAuswerten() {
    K.state.hervor = null;
    K.state.seite = 1;
    inUrl(true);
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

  /* ersetzen=true schreibt den Zustand ohne History-Eintrag (replaceState):
     Suchtippen, Blättern und Filter-Feinjustage sollen den Zurück-Knopf
     nicht mit Zwischenständen fluten — Ebenen- und Ansichtswechsel schon. */
  function inUrl(ersetzen) {
    if (K.state.stumm) return;
    var st = K.state, p = [];

    if (st.objekttyp) p.push('o=' + encodeURIComponent(st.objekttyp));
    if (st.merkmal)   p.push('m=' + encodeURIComponent(st.merkmal));
    if (st.ansicht !== 'liste') p.push('v=' + st.ansicht);
    if (st.sprache !== 'de') p.push('l=' + st.sprache);
    if (st.sort) p.push('t=' + st.sort.feld + (st.sort.richtung < 0 ? '.d' : ''));
    if (st.facetten.katalog.length) {
      p.push('k=' + st.facetten.katalog.map(encodeURIComponent).join(','));
    }
    if (st.facetten.status.length) p.push('r=' + st.facetten.status.join(','));
    if (st.facetten.phase.length) p.push('p=' + st.facetten.phase.join(','));
    if (el.filter.value.trim()) p.push('q=' + encodeURIComponent(el.filter.value.trim()));
    if (st.seite > 1) p.push('s=' + st.seite);
    if (st.proSeite !== 50) p.push('n=' + st.proSeite);

    var neu = p.length ? '#' + p.join('&') : '#';
    if (neu !== location.hash) {
      if (ersetzen) history.replaceState(null, '', neu);
      else history.pushState(null, '', neu);
    }
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
                     ? parseInt(p.n, 10) : 50;
    st.sprache   = K.SPRACHEN.indexOf(p.l) !== -1 ? p.l : 'de';
    el.sprache.value = st.sprache;
    st.sort = null;
    if (p.t) {
      var t = p.t.split('.');
      if (SORT_FELDER.indexOf(t[0]) !== -1) {
        st.sort = { feld: t[0], richtung: t[1] === 'd' ? -1 : 1 };
      }
    }
    st.stumm = false;

    /* Andere Sprache in der URL (Zurück-Knopf, geteilter Link):
       der Katalog muss in dieser Sprache neu geladen werden. */
    if (st.verbindung && st.verbindung.sprache !== st.sprache) {
      laden();
      return;
    }

    /* Ein geteilter Link kann auf einen Eintrag zeigen, den dieser Katalog
       nicht kennt — das darf nicht still auf der Übersicht enden. */
    if (st.objekttyp && !objekttypVon(st.objekttyp)) {
      setStatus('Der verlinkte Eintrag existiert in diesem Katalog nicht.', true);
      st.objekttyp = null;
      st.merkmal = null;
      inUrl(true);
    }

    baueFacetten();
    if (st.objekttyp && !st.detail[st.objekttyp]) ladeDetail(st.objekttyp);
  }

  /* ---------- Navigation ---------- */

  K.geheZuUebersicht = function () {
    K.state.objekttyp = null;
    K.state.merkmal = null;
    K.state.hervor = null;
    K.state.sort = null;   // jede Ebene startet in ihrer Standardreihenfolge
    inUrl();
    zeichne(true);
  };

  K.geheZuObjekttyp = function (uri) {
    if (!objekttypVon(uri)) return;
    K.state.objekttyp = uri;
    K.state.merkmal = null;
    K.state.hervor = null;
    K.state.sort = null;
    inUrl();
    zeichne(true);
    if (!K.state.detail[uri]) ladeDetail(uri);
  };

  K.geheZuMerkmal = function (uri) {
    K.state.merkmal = uri;
    inUrl();
    zeichne(true);
  };

  /* Folgeabfragen gehen gegen den beim Laden eingefrorenen Stand — nicht
     gegen das Dialogfeld, das inzwischen anders ausgefüllt sein kann. */
  function verbindung() {
    return K.state.verbindung ||
           { endpoint: endpunkt(), graph: graphUri(), sprache: K.state.sprache };
  }

  function ladeDetail(uri) {
    var e = objekttypVon(uri);
    var v = verbindung();
    delete K.state.detailFehler[uri];
    busy(true, 'Merkmale von ' + (e ? e.name : '…') + ' werden geladen …');
    K.holeDetail(v.endpoint, v.graph, uri, v.sprache).then(function () {
      busy(false);
      if (K.state.objekttyp !== uri) return;
      /* Ein per Link angefordertes Merkmal kann sich als unbekannt erweisen */
      if (K.state.merkmal && !merkmalVon()) {
        setStatus('Das verlinkte Merkmal existiert bei diesem Objekttyp nicht.', true);
        K.state.merkmal = null;
        inUrl(true);
        zeichne();
        return;
      }
      setStatus('');
      /* Bei einem Deep-Link auf ein Merkmal erscheint die Zielansicht erst
         jetzt — der Fokus soll dorthin, sonst bleibt der Wechsel unbemerkt. */
      zeichne(!!K.state.merkmal);
    }).catch(function (err) {
      busy(false);
      K.state.detailFehler[uri] = String(err && err.message || err);
      setStatus('Merkmale konnten nicht geladen werden.', true);
      if (K.state.objekttyp === uri) zeichne();
    });
  }

  /* ---------- Brotkrumen ---------- */

  /* Die aktuelle Ebene ist keine Aktion — sie wird als <span> gerendert,
     nicht als deaktivierter Knopf (den Screenreader als «nicht verfügbar»
     ansagen oder überspringen würden). */
  function krume(text, onClick, aktuell, sprache) {
    var li = document.createElement('li');
    var b = document.createElement(aktuell ? 'span' : 'button');
    b.className = 'krume';
    b.appendChild(K.text(text, sprache));
    if (aktuell) {
      b.setAttribute('aria-current', 'page');
    } else {
      b.type = 'button';
      if (onClick) b.addEventListener('click', onClick);
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
    el.krumen.appendChild(krume('Objekttypen', K.geheZuUebersicht, !st.objekttyp));

    if (st.objekttyp) {
      var e = objekttypVon(st.objekttyp);
      el.krumen.appendChild(trenner());
      el.krumen.appendChild(krume(e ? e.name : '…',
        function () { K.geheZuObjekttyp(st.objekttyp); }, !st.merkmal,
        e && e.sprache));
    }
    if (st.merkmal) {
      var m = merkmalVon();
      el.krumen.appendChild(trenner());
      el.krumen.appendChild(krume(m ? m.name : '…', null, true, m && m.sprache));
    }
  }

  /* ---------- Titelblock ---------- */

  function titel(text, kennzahlen, beschreibung, hinweis, sprache) {
    el.titel.textContent = text;
    if (sprache && sprache !== 'de') el.titel.setAttribute('lang', sprache);
    else el.titel.removeAttribute('lang');
    el.kennzahlen.textContent = kennzahlen || '';
    el['titel-text'].hidden = !beschreibung;
    el['titel-text'].textContent = beschreibung || '';
    el.hinweis.hidden = !hinweis;
    if (hinweis) el.hinweis.textContent = hinweis;
    document.title = text + ' – KBOB Data Dictionary';
  }

  /* ---------- Zeichnen ---------- */

  function zeichne(fokussieren) {
    if (!K.state.elemente.length) return;
    var st = K.state;

    zeichneKrumen();

    var aufMerkmal = !!(st.merkmal && merkmalVon());

    /* Auf der Merkmal-Ebene gibt es nichts zu suchen, zu filtern oder
       umzuschalten — die Werkzeugleiste würde nur so tun als ob. */
    el.toolbar.hidden = aufMerkmal;
    if (aufMerkmal) el['aktive-filter'].hidden = true;
    else zeichneAktiveFilter();

    el['view-merkmal'].hidden = true;

    if (aufMerkmal)        zeigeMerkmal();
    else if (st.objekttyp) zeigeObjekttyp();
    else                   zeigeUebersicht();

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

    /* Bei einer einzigen Seite gibt es nichts zu blättern — «Seite 1 von 1»
       mit zwei toten Knöpfen wäre nur Inventar. Die Eintragszahl bleibt. */
    if (seiten > 1) {
      var nav = document.createElement('span');
      nav.className = 'seiten';

      var knopf = function (text, beschriftung, ziel, aus) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ghost';
        b.textContent = text;
        b.setAttribute('aria-label', beschriftung);
        b.disabled = aus;
        b.addEventListener('click', function () {
          st.seite = ziel;
          inUrl(true);
          zeichne();
          el.titel.focus();
        });
        return b;
      };

      nav.appendChild(knopf('Zurück', 'Vorherige Seite', st.seite - 1, st.seite <= 1));
      var stand = document.createElement('span');
      stand.textContent = 'Seite ' + st.seite + ' von ' + seiten;
      nav.appendChild(stand);
      nav.appendChild(knopf('Weiter', 'Nächste Seite', st.seite + 1, st.seite >= seiten));
      el.blaettern.appendChild(nav);
    }

    if (gesamt > K.SEITENGROESSEN[0]) {
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
        inUrl(true);
        zeichne();
      });
      feld.appendChild(lab);
      feld.appendChild(sel);
      el.blaettern.appendChild(feld);
    }

    return { von: von, bis: bis };
  }

  function sichtbareAnsicht(name) {
    ['liste', 'galerie', 'graph'].forEach(function (v) {
      el['view-' + v].hidden = (v !== name);
    });
  }

  /* --- Übersicht: alle Objekttypen, flach und facettiert --- */

  /* Grenzen Suche oder Facetten die Sicht gerade ein? */
  function istGefiltert() {
    var f = K.state.facetten;
    return !!(suchbegriff() || f.katalog.length || f.status.length || f.phase.length);
  }

  function zeigeUebersicht() {
    var st = K.state;
    facettenSichtbar(['katalog', 'status', 'phase']);
    el.filter.placeholder = 'Objekttyp oder Beschreibung';

    var liste = sortiert(sichtbareObjekttypen());
    var merkmale = liste.reduce(function (s, e) { return s + e.anzahl; }, 0);

    /* Alle drei Kennzahlen beschreiben die sichtbare Auswahl — eine
       konstante Katalogzahl neben gefilterten Werten wäre eine
       Eigenschaft des Gesamtbestands im falschen Satz. */
    var quellen = {};
    liste.forEach(function (e) { quellen[e.quelle] = true; });
    var nQuellen = Object.keys(quellen).length;

    titel('Objekttypen',
      K.zahl(liste.length) + ' ' + K.plural(liste.length, 'Objekttyp', 'Objekttypen') +
      ' · ' + K.zahl(merkmale) + ' ' + K.plural(merkmale, 'Merkmal', 'Merkmale') +
      ' · ' + K.zahl(nQuellen) + ' ' + K.plural(nQuellen, 'Katalog', 'Kataloge'),
      'Jeder Objekttyp führt die Merkmale, die der Katalog für ihn vorsieht — mit ' +
      'Datentyp, Einheit beziehungsweise zulässigen Werten und Property Set. Alle ' +
      'Merkmale sind gleichrangig; eine Pflicht-/Kann-Unterscheidung kennt der ' +
      'Katalog nicht.',
      null);

    /* Der Zähler trägt nur bei aktivem Filter etwas bei — ungefiltert stünde
       dieselbe Zahl bereits in den Kennzahlen. Die Live-Region bleibt. */
    el.treffer.textContent = istGefiltert()
      ? K.zahl(liste.length) + ' von ' + K.zahl(st.elemente.length)
      : '';

    var aus = blaettere(liste.length);
    var seite = liste.slice(aus.von, aus.bis);
    var mitPhase = phasenspalteLohnt(liste, function (e) { return e.phasen.length; });

    if (st.ansicht === 'liste') {
      sichtbareAnsicht('liste');
      var spalten = [
        { titel: 'Objekttyp', breite: '22%', sort: 'name' },
        { titel: 'Beschreibung' },
        { titel: 'Merkmale', breite: '90px', rechts: true, sort: 'anzahl', sortStart: -1 },
        { titel: 'Reifegrad', breite: '100px', sort: 'status' }
      ];
      if (mitPhase) spalten.push({ titel: 'LOIN-Meilenstein', breite: '130px' });
      spalten.push({ titel: 'Katalog', breite: '18%', sort: 'quelle' });

      K.zeichneListe({
        titel: 'Objekttypen im Katalog',
        spalten: spalten,
        sort: st.sort,
        onSort: sortiere,
        zeilen: seite.map(function (e) {
          var zellen = [
            function () {
              return K.zeilenKnopf(e.name, e.sprache,
                function () { K.geheZuObjekttyp(e.uri); });
            },
            function () {
              if (!e.beschreibung) return K.leer('ohne Beschreibung');
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
          marken: e.status ? [{ name: e.status, art: 'status',
                                title: statusErklaerung(e.status) }] : [],
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
    if (!liste.length) {
      graphMeldung('Kein Treffer für diese Filter',
        'Die Auswahl enthält keine Objekttypen. Einen Filter entfernen oder ' +
        'den Suchbegriff ändern — die Pillen über der Ansicht zeigen, was ' +
        'gerade eingrenzt.');
      return;
    }
    if (liste.length > K.NETZ_MAX) {
      graphMeldung('Zu viele Objekttypen für eine Netzdarstellung',
        K.zahl(liste.length) + ' Objekttypen ergeben ein unlesbares Knäuel. ' +
        'Die Auswahl über Katalog, Reifegrad oder die Suche auf höchstens ' +
        K.NETZ_MAX + ' Objekttypen eingrenzen — dann erscheint das Netz. ' +
        'Die Liste zeigt die volle Auswahl.');
      return;
    }
    graphMeldung(null);

    var knoten = [], kanten = [], nachPset = {};
    liste.forEach(function (e) {
      var k = {
        id: 'o:' + e.uri, name: e.name, farbe: '#0F5C4E' /* = --pine */, form: 'kreis',
        r: 4 + Math.sqrt(e.anzahl) * 1.5,
        vorlesen: e.name + ', ' + e.anzahl + ' ' +
                  K.plural(e.anzahl, 'Merkmal', 'Merkmale') + ', ' + e.quelle,
        zeilen: [e.quelle, e.anzahl + ' ' +
                 K.plural(e.anzahl, 'Merkmal', 'Merkmale') + ' — öffnen'],
        onClick: function () { K.geheZuObjekttyp(e.uri); }
      };
      knoten.push(k);
      e.psets.forEach(function (p) {
        var pk = nachPset[p.name];
        if (!pk) {
          pk = nachPset[p.name] = {
            id: 'p:' + p.name, name: p.name, farbe: '#6B5B4A' /* = --graph-pset */, form: 'quadrat',
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
       'Merkmale, ein Property Set hebt seine Objekttypen hervor. ' + GRAFIK_BEDIENUNG,
       'Objekttypen und Property Sets');
  }

  /* Einheitlicher Bedienhinweis beider Grafiken — er verspricht nur, was geht */
  var GRAFIK_BEDIENUNG = 'Ctrl + Mausrad oder +/− zoomt; ist die Grafik fokussiert, ' +
    'verschieben die Pfeiltasten den Ausschnitt und 0 setzt ihn zurück.';

  /* --- Ein Objekttyp und seine Merkmale --- */

  function zeigeObjekttyp() {
    var st = K.state;
    var e = objekttypVon(st.objekttyp);
    if (!e) { K.geheZuUebersicht(); return; }

    /* Katalog und Reifegrad wirken hier nicht — nur zeigen, was filtert */
    facettenSichtbar(['phase']);
    el.filter.placeholder = 'Merkmal oder Property Set';

    var merkmale = sichtbareMerkmale(e.uri);
    if (merkmale) merkmale = sortiert(merkmale);

    if (merkmale === null && st.detailFehler[e.uri]) {
      zeigeDetailFehler(e);
      return;
    }

    if (merkmale === null) {
      titel(e.name, 'Merkmale werden geladen …', e.beschreibung, null, e.sprache);
      el.treffer.textContent = '';
      el.blaettern.hidden = true;
      sichtbareAnsicht(st.ansicht);
      /* Der Ladezustand dreht dort, wo der Blick ist: im Inhaltsbereich */
      if (st.ansicht === 'liste') {
        K.zeichneListe({ titel: e.name, spalten: [{ titel: 'Merkmal' }], zeilen: [],
                         leerText: 'Merkmale werden geladen …', laedt: true });
      } else if (st.ansicht === 'galerie') {
        K.zeichneGalerie([], 'Merkmale werden geladen …', true);
      } else {
        graphMeldung('Merkmale werden geladen …', '', true);
      }
      return;
    }

    var psets = {};
    merkmale.forEach(function (m) { psets[m.pset] = true; });
    var nPsets = Object.keys(psets).length;

    titel(e.name,
      K.zahl(merkmale.length) +
      (merkmale.length === e.anzahl ? '' : ' von ' + K.zahl(e.anzahl)) +
      ' ' + K.plural(e.anzahl, 'Merkmal', 'Merkmale') + ' · ' +
      nPsets + ' ' + K.plural(nPsets, 'Property Set', 'Property Sets') + ' · ' + e.quelle,
      e.beschreibung, null, e.sprache);

    el.treffer.textContent = (suchbegriff() || st.facetten.phase.length)
      ? K.zahl(merkmale.length) + ' von ' + K.zahl(e.anzahl)
      : '';

    var aus = blaettere(merkmale.length);
    var seite = merkmale.slice(aus.von, aus.bis);
    var mitPhase = phasenspalteLohnt(merkmale, function (m) { return m.phasen.length; });

    if (st.ansicht === 'liste') {
      sichtbareAnsicht('liste');
      /* Reihenfolge wie im Merkmaldetail: Property Set, Datentyp, Reifegrad */
      var spalten = [
        { titel: 'Merkmal', breite: '28%', sort: 'name' },
        { titel: 'Property Set', breite: '20%', sort: 'pset' },
        { titel: 'Datentyp', breite: '10%', sort: 'typ' },
        { titel: 'Reifegrad', breite: '10%', sort: 'status' }
      ];
      if (mitPhase) spalten.push({ titel: 'LOIN-Meilenstein', breite: '130px' });
      spalten.push({ titel: 'Einheit / Zulässige Werte' });

      K.zeichneListe({
        titel: 'Merkmale von ' + e.name,
        spalten: spalten,
        sort: st.sort,
        onSort: sortiere,
        zeilen: seite.map(function (m) {
          var zellen = [
            function () {
              var box = document.createDocumentFragment();
              box.appendChild(K.zeilenKnopf(m.name, m.sprache,
                function () { K.geheZuMerkmal(m.uri); }));
              if (m.beschreibung && m.beschreibung !== m.name) {
                var de = document.createElement('span');
                de.className = 'merkmal-desc';
                de.textContent = m.beschreibung;
                box.appendChild(de);
              }
              return box;
            },
            function () { return psetZelle(e, m); },
            function () { return typMarke(m); },
            function () { return statusMarke(m.status) || K.leer('ohne Reifegrad'); }
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
          name: m.name, sprache: m.sprache,
          text: (m.beschreibung && m.beschreibung !== m.name) ? m.beschreibung : '',
          marken: [{ name: m.pset, farbe: e.farbe[m.pset] }]
            .concat(m.typ ? [{ name: m.typ, art: 'fill' }] : [])
            .concat(m.status ? [{ name: m.status, art: 'status',
                                  title: statusErklaerung(m.status) }] : []),
          fuss: [m.einheit, m.ifcTyp,
                 m.liste && m.liste.anzahl ? m.liste.anzahl + ' zulässige Werte' : '']
                 .filter(Boolean).join(' · '),
          onClick: function () { K.geheZuMerkmal(m.uri); }
        };
      }));
    } else {
      sichtbareAnsicht('graph');
      if (!merkmale.length) {
        graphMeldung('Kein Treffer für diese Filter',
          'Die Auswahl enthält keine Merkmale. Einen Filter entfernen oder ' +
          'den Suchbegriff ändern.');
        return;
      }
      graphMeldung(null);
      K.zeichneRadial(e, merkmale,
        'Die Merkmale von ' + e.name + ', gruppiert nach Property Set. Ein Merkmal ' +
        'öffnet seine Angaben. ' + GRAFIK_BEDIENUNG);
    }
  }

  /* Scheitert die Detailabfrage, darf «wird geladen …» nicht stehen bleiben —
     dieselbe Regel wie beim Erstladen (Befund K1), eine Ebene tiefer. */
  function zeigeDetailFehler(e) {
    titel(e.name, 'Die Merkmale konnten nicht geladen werden.', null, null, e.sprache);
    el.treffer.textContent = '';
    el.blaettern.hidden = true;
    sichtbareAnsicht('liste');

    var ziel = el['view-liste'];
    ziel.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'meldung';
    var h = document.createElement('h2');
    h.textContent = 'Die Merkmale konnten nicht geladen werden';
    box.appendChild(h);
    var p = document.createElement('p');
    p.textContent = K.state.detailFehler[e.uri];
    box.appendChild(p);
    var b = document.createElement('button');
    b.textContent = 'Erneut versuchen';
    b.addEventListener('click', function () { ladeDetail(e.uri); });
    box.appendChild(b);
    ziel.appendChild(box);
  }

  /* Reifegrad. Der Katalog kennt bisher nur Candidate und Preview —
     verabschiedet ist nichts. Das gehört an jeden Eintrag.
     Nur bekannte Werte werden erklärt: ein künftiger Status «Approved»
     dürfte nicht als «noch nicht verabschiedet» beschriftet werden. */
  var STATUS_ERKLAERUNG = {
    Candidate: 'Kandidat — vorgeschlagen, noch nicht verabschiedet',
    Preview:   'Vorschau — noch in Erarbeitung'
  };
  function statusErklaerung(wert) { return STATUS_ERKLAERUNG[wert] || ''; }

  function statusMarke(wert) {
    if (!wert) return null;
    var t = document.createElement('span');
    t.className = 'token token--status';
    t.appendChild(K.text(wert, 'en'));   // Datenwerte sind englisch
    if (STATUS_ERKLAERUNG[wert]) t.title = STATUS_ERKLAERUNG[wert];
    return t;
  }

  /* Statt einer leeren Zeichenfläche: sagen, was zu tun ist —
     beziehungsweise mit drehendem Ring, dass etwas unterwegs ist. */
  function graphMeldung(titel, text, laedt) {
    var zeigen = !!titel;
    el['graph-meldung'].hidden = !zeigen;
    el['graph-wrap'].hidden = zeigen;
    el['graph-steuerung'].hidden = zeigen;
    el['graph-hinweis'].hidden = zeigen;
    if (!zeigen) return;

    el['graph-meldung'].innerHTML = '';
    var h = document.createElement('h2');
    if (laedt) h.appendChild(K.ladeInhalt(titel));
    else h.textContent = titel;
    el['graph-meldung'].appendChild(h);
    if (text) {
      var p = document.createElement('p');
      p.textContent = text;
      el['graph-meldung'].appendChild(p);
    }
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
      n.textContent = m.liste.anzahl + ' zulässige Werte: ';
      w.appendChild(n);
      w.appendChild(document.createTextNode(K.kurzListe(m.liste.werte, 70)));
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
    el.blaettern.hidden = true;   // die Blätterleiste gehört zur Liste darüber

    titel(m.name, e.name + ' · ' + m.pset + ' · ' + e.quelle, null, null, m.sprache);

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

    /* Mit leerBedeutung erscheint die Zeile auch ohne Wert — als ehrliches
       «—» wie in der Tabelle. Ohne leerBedeutung entfällt sie ganz. */
    function zeile(t, wert, leerBedeutung) {
      if (!wert && !leerBedeutung) return;
      var dt = document.createElement('dt');
      dt.textContent = t;
      var dd = document.createElement('dd');
      if (!wert) dd.appendChild(K.leer(leerBedeutung));
      else if (typeof wert === 'string') dd.textContent = wert;
      else dd.appendChild(wert);
      dl.appendChild(dt); dl.appendChild(dd);
    }

    zeile('Objekttyp', K.text(e.name, e.sprache));
    zeile('Katalog', e.quelle);
    zeile('Property Set', psetZelle(e, m));
    zeile('Datentyp', typMarke(m));
    zeile('Reifegrad', statusMarke(m.status), 'ohne Reifegrad');
    zeile('IFC-Datentyp', m.ifcTyp);
    zeile('IFC-Property-Set', m.ifcPset);
    zeile('Einheit', m.einheit, 'ohne Einheit');
    zeile('Zulässige Werte' + (m.liste && m.liste.anzahl ? ' (' + m.liste.anzahl + ')' : ''),
          m.liste && m.liste.anzahl ? m.liste.werte : null,
          'ohne Werteliste');
    if (K.state.allePhasen && K.state.allePhasen.length) {
      zeile('LOIN-Meilensteine (LZP)',
            m.phasen.length ? K.phasen(m.phasen, K.state.allePhasen) : null,
            'kein Meilenstein deklariert');
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
    /* Führende =, +, -, @ oder Tabs liest Excel als Formel — die Werte
       stammen aus einem fremden Graphen (OWASP: CSV Injection). Ein
       vorangestelltes Hochkomma entschärft sie. */
    if (/^[=+\-@\t]/.test(s)) s = "'" + s;
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
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

  /* «Datentyp» ist der übersetzte Anzeigewert (Auswahl, Ja/Nein …),
     «Datentyp (Katalog)» der Rohwert aus dem Graphen (STRING, REAL …) —
     ein Integrator braucht beide. Wertetrennzeichen der Spalte
     «Zulässige Werte» ist « · ». */
  var KOPF = ['Objekttyp', 'Reifegrad Objekttyp', 'Katalog', 'Merkmal', 'Merkmal-URI',
              'Beschreibung', 'Datentyp', 'Datentyp (Katalog)', 'Reifegrad Merkmal',
              'Property Set', 'IFC-Property-Set', 'Einheit', 'Zulässige Werte',
              'IFC-Datentyp', 'LOIN-Meilensteine'];

  function merkmalZeile(e, m) {
    return [e.name, e.status, e.quelle, m.name, m.uri, m.beschreibung, m.typ, m.typRaw,
            m.status, m.pset, m.ifcPset, m.einheit, m.liste ? m.liste.werte : '',
            m.ifcTyp, m.phasen.join(' ')].map(csvZelle).join(';');
  }

  function dateiname(s) {
    s = s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
    if (String.prototype.normalize) {
      s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');   // é -> e, à -> a …
    }
    s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    /* Datum im Namen: zwei Exporte von verschiedenen Tagen bleiben
       unterscheidbar, solange die Quelle eine Integrationsumgebung ist. */
    var d = new Date();
    var datum = d.getFullYear() + '-' +
                ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
                ('0' + d.getDate()).slice(-2);
    return (s || 'objekttyp') + '-' + datum;
  }

  /* Ein Objekttyp: sofort. Eine ganze Auswahl: die Merkmale werden dafür
     nachgeladen — genau das braucht die Datenübergabe an einen Integrator.
     Nachgeladen wird in kleinen Bündeln mit sichtbarem Fortschritt, nicht
     als Abfrage-Burst gegen den Endpunkt. */
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
    if (!auswahl.length) {
      setStatus('Die Auswahl ist leer — es gibt nichts zu speichern.', true);
      return;
    }

    if (auswahl.length > 60) {
      setStatus('Für den Export die Auswahl auf höchstens 60 Objekttypen eingrenzen — ' +
                'die Liste zeigt zurzeit ' + K.zahl(auswahl.length) + '. Die Merkmale ' +
                'werden je Objekttyp einzeln nachgeladen.', true);
      return;
    }

    el.csv.disabled = true;
    busy(true, 'Merkmale für den Export werden geladen …');

    var v = verbindung();
    var BUENDEL = 6;
    var i = 0;

    function fertig() {
      busy(false);
      el.csv.disabled = false;
      var zeilen = [KOPF.join(';')];
      auswahl.forEach(function (e) {
        (st.detail[e.uri] || []).forEach(function (m) { zeilen.push(merkmalZeile(e, m)); });
      });
      speichere(zeilen, 'kbob-' + dateiname('merkmale') + '.csv');
      setStatus(K.zahl(auswahl.length) + ' Objekttypen mit ' + K.zahl(zeilen.length - 1) +
                ' Merkmalen gespeichert.');
    }

    function naechstesBuendel() {
      if (i >= auswahl.length) { fertig(); return; }
      var teil = auswahl.slice(i, i + BUENDEL);
      i += teil.length;
      setStatus('Merkmale für den Export werden geladen — ' +
                Math.min(i, auswahl.length) + ' von ' + auswahl.length + ' Objekttypen …');
      Promise.all(teil.map(function (e) {
        return K.holeDetail(v.endpoint, v.graph, e.uri, v.sprache);
      })).then(naechstesBuendel).catch(function (err) {
        busy(false);
        el.csv.disabled = false;
        setStatus('Export abgebrochen bei «' + teil[0].name + '»: ' +
                  String(err && err.message || err), true);
      });
    }

    naechstesBuendel();
  }

  /* ---------- Abfragen zeigen ---------- */

  function zeigeAbfrage(welche) {
    ['uebersicht', 'detail', 'werte'].forEach(function (w) {
      document.getElementById('tab-' + w).setAttribute('aria-pressed', String(w === welche));
    });
    var g = graphUri();
    var l = K.state.sprache;
    var beispiel = K.state.objekttyp ||
                   (K.state.elemente.length ? K.state.elemente[0].uri : 'https://beispiel/klasse');
    document.getElementById('query-text').value =
      welche === 'uebersicht' ? K.uebersichtQuery(g, l)
      : welche === 'detail'   ? K.detailQuery(g, beispiel, l)
      :                         K.werteQuery(g, l);
  }

  /* ---------- Verdrahtung ---------- */

  function verdrahten() {
    el.version.textContent = 'kbob-data ' + K.VERSION;

    el.neuladen.addEventListener('click', laden);

    /* Sprachwahl betrifft die Katalogbeschriftungen: neue Sprache heisst
       neue Abfragen — der Katalog wird neu geladen. */
    el.sprache.addEventListener('change', function () {
      K.state.sprache = el.sprache.value;
      inUrl();
      laden();
    });

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
    /* Erfolg nur melden, wenn wirklich kopiert wurde — und im Dialog selbst:
       die Statuszeile im Kopf ist bei offenem Modal inert und unsichtbar. */
    document.getElementById('copy-query').addEventListener('click', function () {
      var ta = document.getElementById('query-text');
      function ok() {
        el['copy-status'].textContent = 'Abfrage kopiert.';
        setTimeout(function () { el['copy-status'].textContent = ''; }, 4000);
      }
      function fehl() {
        el['copy-status'].textContent =
          'Kopieren nicht möglich — den Text markieren und mit Ctrl+C kopieren.';
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

    el.barrierefreiheit.addEventListener('click', function () { dlgA11y.showModal(); });
    document.getElementById('close-a11y')
      .addEventListener('click', function () { dlgA11y.close(); });

    el.csv.addEventListener('click', toCsv);

    /* Entprellt: im Netz kostet ein Neuaufbau bis zu 200 ms.
       Wie bei den Facetten: Seite und Hervorhebung zurücksetzen —
       und die History nicht mit Tippfragmenten fluten (replaceState). */
    var sucheTimer = null;
    el.filter.addEventListener('input', function () {
      clearTimeout(sucheTimer);
      sucheTimer = setTimeout(function () {
        K.state.seite = 1;
        K.state.hervor = null;
        inUrl(true);
        zeichne();
      }, 180);
    });

    /* Klick ausserhalb schliesst offene Facetten-Menüs — focusout allein
       trägt nicht (Safari/Firefox fokussieren angeklickte Checkboxen nicht). */
    document.addEventListener('pointerdown', function (ev) {
      Array.prototype.forEach.call(el.facetten.querySelectorAll('.dd-menu'), function (menu) {
        if (menu.hidden) return;
        var box = menu.parentNode;
        if (!box.contains(ev.target)) {
          menu.hidden = true;
          box.querySelector('.dd-knopf').setAttribute('aria-expanded', 'false');
        }
      });
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

    /* Die Sprache muss vor dem ersten Laden aus der URL kommen —
       sie bestimmt bereits die Übersichtsabfrage. */
    var l = /[#&]l=(de|fr|it|en)(&|$)/.exec(location.hash);
    if (l) { K.state.sprache = l[1]; el.sprache.value = l[1]; }
  }

  verdrahten();
  laden();      // ohne Klick: der Katalog ist beim Öffnen schon da
})(KBOB);
