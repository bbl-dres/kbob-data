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
    /* — gehört data.js (Zwischenspeicher, geschrieben von uebernehmeX/holeDetail) — */
    elemente: [],
    werte: {},
    werteGeladen: false,
    detail: {},
    detailOhneWerte: {}, // Detail geladen, aber Wertelisten-Abfrage scheiterte

    /* — gehört app.js (Bedien- und Navigationszustand) — */
    kataloge: [],
    detailFehler: {},    // Fehlermeldung je Objekttyp-URI, falls das Detail scheiterte
    generation: 1,       // zählt Neuladen; Antworten älterer Generationen werden verworfen
    verbindung: null,    // beim Laden eingefrorene {endpoint, graph, sprache} —
                         // Folgeabfragen gehen gegen diesen Stand, nicht gegen das Dialogfeld
    objekttyp: null,     // offener Objekttyp (URI)
    merkmal: null,       // offenes Merkmal (URI)
    sprache: 'de',       // Sprache der Katalogbeschriftungen (nicht der Oberfläche)
    sort: null,          // { feld, richtung } — null heisst Standardreihenfolge der Ebene
    ansicht: 'liste',
    hervor: null,        // hervorgehobenes Property Set im Graphen (flüchtig)
    allePhasen: [],      // alle im Katalog vorkommenden LOIN-Meilensteine
    stumm: false,        // true, während die URL gelesen wird
    facetten: { katalog: [], status: [], phase: [] },
    seite: 1,
    proSeite: 50
  };

  K.SEITENGROESSEN = [50, 100, 200];
  K.SUCH_DEBOUNCE_MS = 180;  // Neuaufbau im Netz kostet bis zu ~25 ms Layout

  var el = K.el = {};
  ['endpoint', 'graph', 'status', 'krumen', 'toolbar', 'platzhalter',
   'titelblock', 'titel', 'kennzahlen', 'titel-text',
   'view-liste', 'view-galerie', 'view-graph', 'view-merkmal', 'galerie',
   'treffer', 'filter', 'csv', 'netz', 'legende', 'tip', 'graph-hinweis',
   'graph-text', 'neuladen', 'verbindung', 'barrierefreiheit',
   'graph-meldung', 'graph-wrap', 'graph-steuerung', 'aktive-filter',
   'merkmal-detail', 'zoom-plus', 'zoom-minus', 'zoom-reset',
   'facetten', 'blaettern', 'copy-status', 'sprache',
   'zurueck'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  var dlgVerbindung = document.getElementById('dlg-verbindung');
  var dlgA11y = document.getElementById('dlg-a11y');

  /* leise = nur für Screenreader (Live-Region), ohne sichtbare Zeile —
     Fortschrittstexte stünden sonst doppelt neben dem Spinner im Inhalt. */
  function setStatus(text, isError, leise) {
    el.status.className = 'kbob-status' + (isError ? ' error' : '') +
                          (leise ? ' ob-screen-reader-only' : '');
    el.status.textContent = text;
  }
  K.setStatus = setStatus;

  /* ---------- Ladeanzeige ---------- */

  /* Der Ladezustand dreht als Bogen im Inhaltsbereich (Tabelle, Galerie,
     Graph, Platzhalter); die Statuszeile ist die Live-Region, über die auch
     Screenreader vom Ladevorgang erfahren — sichtbar ist sie dabei nicht. */
  function busy(an, text) {
    if (an && text) setStatus(text, false, true);
  }

  /* ---------- Laden ---------- */

  function endpunkt() { return el.endpoint.value.trim(); }
  function graphUri() { return el.graph.value.trim(); }

  /* Übersetzt rohe Fetch-Fehler in eine deutsche Erklärung — für die
     Fehlerpfade jenseits des Erstladens (Detail, Export). */
  var NETZFEHLER = /Failed to fetch|NetworkError|CORS/i;
  function fehlerText(err) {
    var m = String(err && err.message || err);
    return NETZFEHLER.test(m)
      ? 'Der Datenserver ist nicht erreichbar — Verbindung prüfen (VPN/Proxy).'
      : m;
  }

  function laden() {
    if (!endpunkt() || !graphUri()) { setStatus('Endpunkt und Graph ausfüllen.', true); return; }
    if (dlgVerbindung.open) dlgVerbindung.close();

    /* Sichtbarer Platzhalter (Erststart, erneuter Versuch nach Fehler):
       eine Spinnerfläche — die einzige sichtbare Ladeanzeige. */
    if (!el.platzhalter.hidden) {
      meldung(el.platzhalter, { titel: 'Katalog wird geladen …', laedt: true });
    }

    /* Verbindungsstand zur ANFRAGEzeit einfrieren und die Generation
       hochzählen: von zwei schnellen Neu-Laden gewinnt so immer das
       zuletzt angestossene — nicht die zufällig letzte Antwort. */
    var st = K.state;
    var anfrage = { endpoint: endpunkt(), graph: graphUri(), sprache: st.sprache };
    st.generation += 1;
    var meineGen = st.generation;

    el.neuladen.disabled = true;
    busy(true, 'Katalog wird geladen …');

    K.run(anfrage.endpoint, K.uebersichtQuery(anfrage.graph, anfrage.sprache)).then(function (json) {
      if (meineGen !== st.generation) return;   // inzwischen neu geladen
      var rows = json.results.bindings;
      busy(false);
      el.neuladen.disabled = false;

      if (!rows.length) {
        zeigeFehler('Der Graph ' + anfrage.graph + ' enthält keine Objekttypen. ' +
                    'Den Namen des Graphen unter «Verbindung und Abfrage» prüfen — ' +
                    'möglicherweise ist der Graph noch nicht befüllt.');
        return;
      }

      /* Neuer Stand heisst neuer Stand: alte Details und Wertelisten
         verwerfen, sonst mischen sich beim Endpunktwechsel zwei Quellen. */
      st.detail = {};
      st.detailOhneWerte = {};
      st.detailFehler = {};
      st.werte = {};
      st.werteGeladen = false;
      st.verbindung = anfrage;

      K.uebernehmeUebersicht(rows);
      baueKataloge();

      el.platzhalter.hidden = true;
      el.toolbar.hidden = false;
      el.titelblock.hidden = false;
      el.csv.disabled = false;

      ausUrl();   // baut auch die Facetten
      zeichne();
      setStatus('');
    }).catch(function (err) {
      if (meineGen !== st.generation) return;
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
      zeigeFehler(NETZFEHLER.test(msg)
        ? text
        : 'Die Abfrage ist fehlgeschlagen: ' + msg);
    });
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
    el.platzhalter.className = 'kbob-message';
    meldung(el.platzhalter, {
      titel: 'Der Katalog konnte nicht geladen werden',
      text: text,
      typ: 'error',
      aktion: { text: 'Erneut versuchen', onClick: laden, fokus: true }
    });
  }

  function baueKataloge() {
    var map = {};
    K.state.elemente.forEach(function (e) {
      var q = map[e.quelle];
      if (!q) q = map[e.quelle] = { name: e.quelle, objekttypen: 0, dok: false };
      q.objekttypen++;
      if (e.istDokument) q.dok = true;
    });
    /* Redaktionelle Reihenfolge (K.KATALOG_PRIORITAET): die allgemeinen
       Kataloge zuerst, der Dokumenttypenkatalog zuletzt. */
    K.state.kataloge = Object.keys(map).map(function (n) { return map[n]; })
      .sort(function (a, b) {
        var ra = K.katalogRang(a.name, a.dok);
        var rb = K.katalogRang(b.name, b.dok);
        if (ra !== rb) return ra - rb;
        return b.objekttypen - a.objekttypen;
      });
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
    box.className = 'kbob-field kbob-facet';
    box.setAttribute('data-facette', schluessel);

    /* Der Knopf trägt den Filternamen selbst — «Katalog (2)» sagt auf einen
       Blick, WELCHER Filter wirkt; ein separates Beschriftungszeilchen und
       «n von m gewählt» braucht es dann nicht. */
    var knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'ob-button ob-button-secondary kbob-facet-toggle';
    knopf.setAttribute('aria-expanded', 'false');

    knopf.appendChild(K.icon('filter'));
    var wert = document.createElement('span');
    wert.className = 'kbob-facet-value';
    wert.id = id + '-wert';
    knopf.appendChild(wert);
    knopf.appendChild(K.icon('chevron_down_small'));
    box.appendChild(knopf);

    var menu = document.createElement('div');
    menu.className = 'kbob-facet-menu';
    menu.id = id + '-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', titel);
    knopf.setAttribute('aria-controls', menu.id);

    var reset = null;   // wird unten gebaut; beschrifte() hält ihn aktuell

    function beschrifte() {
      var n = K.state.facetten[schluessel].length;
      wert.textContent = titel + (n ? ' (' + n + ')' : '');
      wert.className = 'kbob-facet-value' + (n ? ' aktiv' : '');
      knopf.setAttribute('aria-label', titel + (n ? ', ' + n + ' gewählt' : ''));
      if (reset) reset.disabled = n === 0;
    }

    eintraege.forEach(function (e) {
      var l = document.createElement('label');
      l.className = 'kbob-facet-option';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'ob-checkbox';
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
      menu.appendChild(l);
    });

    var fuss = document.createElement('div');
    fuss.className = 'kbob-facet-footer';
    reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'ob-button ob-button-tertiary';
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
      b.className = 'ob-chip';
      b.setAttribute('aria-label', 'Filter entfernen: ' + p.art + ' ' + p.wert);

      var art = document.createElement('span');
      art.className = 'kbob-chip-kind';
      art.textContent = p.art + ':';
      b.appendChild(art);
      b.appendChild(K.e('span', 'kbob-chip-value', p.wert));
      b.appendChild(K.icon('xmark', 'ob-chip-trailing-icon'));

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
    reset.className = 'ob-button ob-button-tertiary';
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
    var naechste = el['aktive-filter'].querySelector('.ob-chip');
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

  /* Felder je Ebene — ein t=-Parameter mit einem Feld der falschen Ebene
     würde sonst still umsortieren, ohne dass ein Spaltenkopf es anzeigt. */
  var SORT_UEBERSICHT = ['name', 'anzahl', 'status', 'quelle'];
  var SORT_MERKMALE   = ['name', 'pset', 'typ', 'status'];

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
    /* Schreib- und Leseseite müssen synchron bleiben: ein neuer Parameter
       gehört HIER und in ausUrl() — beide kodieren symmetrisch. */
    if (st.facetten.katalog.length) {
      p.push('k=' + st.facetten.katalog.map(encodeURIComponent).join(','));
    }
    if (st.facetten.status.length) {
      p.push('r=' + st.facetten.status.map(encodeURIComponent).join(','));
    }
    if (st.facetten.phase.length) {
      p.push('p=' + st.facetten.phase.map(encodeURIComponent).join(','));
    }
    if (el.filter.value.trim()) p.push('q=' + encodeURIComponent(el.filter.value.trim()));
    if (st.seite > 1) p.push('s=' + st.seite);
    if (st.proSeite !== 50) p.push('n=' + st.proSeite);

    var neu = p.length ? '#' + p.join('&') : '#';
    if (neu !== location.hash) {
      if (ersetzen) history.replaceState(null, '', neu);
      else history.pushState(null, '', neu);
    }
  }

  /* Leseseite zu inUrl() — jeder Parameter erscheint in beiden Funktionen.
     Kaputtes Prozent-Encoding (abgeschnittene geteilte Links) darf die App
     nicht lahmlegen: dec() fällt auf den Rohwert zurück. */
  function dec(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  function ausUrl() {
    var st = K.state, p = {};
    location.hash.replace(/^#/, '').split('&').forEach(function (teil) {
      var i = teil.indexOf('=');
      if (i > 0) p[teil.slice(0, i)] = teil.slice(i + 1);
    });

    function liste(wert) {
      return wert ? wert.split(',').map(dec).filter(Boolean) : [];
    }

    st.stumm = true;
    st.facetten.katalog = liste(p.k);
    st.facetten.status  = liste(p.r);
    st.facetten.phase   = liste(p.p);
    el.filter.value = p.q ? dec(p.q) : '';
    st.ansicht = (p.v === 'galerie' || p.v === 'graph') ? p.v : 'liste';
    ansichtKnoepfe(st.ansicht);
    st.objekttyp = p.o ? dec(p.o) : null;
    st.merkmal   = p.m ? dec(p.m) : null;
    st.seite     = Math.max(1, parseInt(p.s, 10) || 1);
    st.proSeite  = K.SEITENGROESSEN.indexOf(parseInt(p.n, 10)) !== -1
                     ? parseInt(p.n, 10) : K.SEITENGROESSEN[0];
    st.sprache   = K.SPRACHEN.indexOf(p.l) !== -1 ? p.l : 'de';
    el.sprache.value = st.sprache;
    st.hervor = null;   // flüchtiger Grafikzustand überlebt keine Navigation
    st.sort = null;
    if (p.t) {
      var t = p.t.split('.');
      var erlaubt = p.o ? SORT_MERKMALE : SORT_UEBERSICHT;
      if (erlaubt.indexOf(t[0]) !== -1) {
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
       nicht kennt — das darf nicht still auf der Übersicht enden. Vor der
       Datenankunft (popstate während des Erstladens) wird nicht geprüft,
       sonst würde ein gültiger Deep-Link fälschlich getilgt. */
    if (st.elemente.length && st.objekttyp && !objekttypVon(st.objekttyp)) {
      setStatus('Der verlinkte Eintrag existiert in diesem Katalog nicht.', true);
      st.objekttyp = null;
      st.merkmal = null;
      inUrl(true);
    }

    /* Dieselbe Prüfung für das Merkmal, wenn das Detail schon im Cache
       liegt — sonst bliebe eine «…»-Krume für ein Phantom-Merkmal stehen. */
    if (st.merkmal && st.objekttyp && st.detail[st.objekttyp] && !merkmalVon()) {
      setStatus('Das verlinkte Merkmal existiert bei diesem Objekttyp nicht.', true);
      st.merkmal = null;
      inUrl(true);
    }

    baueFacetten();
    if (st.objekttyp && !st.detail[st.objekttyp]) ladeDetail(st.objekttyp);
  }

  /* ---------- Navigation ---------- */

  /* Gedrückt-Zustand der drei Ansichtsknöpfe — einzige Schreibstelle */
  function ansichtKnoepfe(name) {
    ['liste', 'galerie', 'graph'].forEach(function (v) {
      document.getElementById('v-' + v).setAttribute('aria-pressed', String(v === name));
    });
  }

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
    /* Rückkehr vom Merkmal zum selben Objekttyp behält die Sortierung —
       nur ein echter Wechsel startet in der Standardreihenfolge. */
    if (K.state.objekttyp !== uri) K.state.sort = null;
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

  /* Folgeabfragen gehen gegen den beim Laden eingefrorenen Stand — nicht
     gegen das Dialogfeld, das inzwischen anders ausgefüllt sein kann. */
  function verbindung() {
    return K.state.verbindung ||
           { endpoint: endpunkt(), graph: graphUri(), sprache: K.state.sprache };
  }

  var WERTE_WARNUNG = 'Die Wertelisten konnten nicht geladen werden — ' +
                      'Auswahl-Merkmale erscheinen vorerst als «Text».';

  function ladeDetail(uri) {
    var e = objekttypVon(uri);
    var v = verbindung();
    var gen = K.state.generation;
    delete K.state.detailFehler[uri];
    busy(true, 'Merkmale von ' + (e ? e.name : '…') + ' werden geladen …');
    K.holeDetail(v, uri).then(function () {
      busy(false);
      if (gen !== K.state.generation) return;   // inzwischen neu geladen
      if (K.state.objekttyp !== uri) return;
      /* Ein per Link angefordertes Merkmal kann sich als unbekannt erweisen */
      if (K.state.merkmal && !merkmalVon()) {
        setStatus('Das verlinkte Merkmal existiert bei diesem Objekttyp nicht.', true);
        K.state.merkmal = null;
        inUrl(true);
        zeichne();
        return;
      }
      setStatus(K.state.detailOhneWerte[uri] ? WERTE_WARNUNG : '',
                !!K.state.detailOhneWerte[uri]);
      /* Bei einem Deep-Link auf ein Merkmal erscheint die Zielansicht erst
         jetzt — der Fokus soll dorthin, sonst bleibt der Wechsel unbemerkt. */
      zeichne(!!K.state.merkmal);
    }).catch(function (err) {
      busy(false);
      if (gen !== K.state.generation) return;
      K.state.detailFehler[uri] = fehlerText(err);
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
    b.className = 'ob-breadcrumb-label';
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
    s.className = 'ob-breadcrumb-separator';
    s.setAttribute('aria-hidden', 'true');
    s.appendChild(K.icon('chevron_right_small'));
    li.appendChild(s);
    return li;
  }

  function zeichneKrumen() {
    var st = K.state;
    el.krumen.innerHTML = '';

    /* Auf der Übersicht führt die Krume nirgendwohin und wiederholt nur
       die Überschrift darunter — Brotkrumen erst ab Tiefe 2. */
    el.krumen.parentNode.hidden = !st.objekttyp;
    if (!st.objekttyp) return;

    el.krumen.appendChild(krume('Objekttypen', K.geheZuUebersicht, false));

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

  function titel(text, kennzahlen, beschreibung, sprache) {
    el.titel.textContent = text;
    if (sprache && sprache !== 'de') el.titel.setAttribute('lang', sprache);
    else el.titel.removeAttribute('lang');
    el.kennzahlen.textContent = kennzahlen || '';
    el['titel-text'].hidden = !beschreibung;
    el['titel-text'].textContent = beschreibung || '';
    document.title = text + ' – KBOB Data Dictionary';
  }

  /* ---------- Zeichnen ---------- */

  function zeichne(fokussieren) {
    if (!K.state.elemente.length) return;
    var st = K.state;

    /* Loesch-Knopf im Suchfeld folgt dem Feldinhalt — auch wenn der Wert
       programmatisch gesetzt wurde (URL, Chip entfernt) */
    var leerKnopf = document.getElementById('filter-leeren');
    if (leerKnopf) leerKnopf.hidden = !el.filter.value;

    zeichneKrumen();

    var aufMerkmal = !!(st.merkmal && merkmalVon());

    /* Sichtbarer Rückweg eine Ebene hoch — die Brotkrume ist klein,
       der Knopf trägt das Ziel im zugänglichen Namen. */
    el.zurueck.hidden = !st.objekttyp;
    if (st.objekttyp) {
      var elternName = aufMerkmal
        ? (objekttypVon(st.objekttyp) || {}).name || 'Objekttyp'
        : 'Objekttypen';
      el.zurueck.setAttribute('aria-label', 'Zurück zu ' + elternName);
      el.zurueck.title = 'Zurück zu ' + elternName;
    }

    /* Auf der Merkmal-Ebene gibt es nichts zu suchen, zu filtern oder
       umzuschalten — die Werkzeugleiste würde nur so tun als ob. */
    el.toolbar.hidden = aufMerkmal;
    if (aufMerkmal) el['aktive-filter'].hidden = true;
    else zeichneAktiveFilter();

    /* Grundzustand je Renderdurchlauf: die zeige*-Funktionen setzen nur
       noch, was auf ihrer Ebene tatsächlich etwas anzeigt. */
    el.treffer.textContent = '';

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
    bereich.className = 'kbob-paginator-range';
    bereich.textContent = gesamt <= st.proSeite
      ? K.zahl(gesamt) + (gesamt === 1 ? ' Eintrag' : ' Einträge')
      : K.zahl(von + 1) + '–' + K.zahl(bis) + ' von ' + K.zahl(gesamt);
    el.blaettern.appendChild(bereich);

    /* Bei einer einzigen Seite gibt es nichts zu blättern — «Seite 1 von 1»
       mit toten Knöpfen wäre nur Inventar. Die Eintragszahl bleibt. */
    if (seiten > 1) {
      var nav = document.createElement('span');
      nav.className = 'kbob-paginator-nav';

      /* Vier Icon-Knöpfe wie im Oblique-Paginator (erste/vorherige/
         nächste/letzte Seite); das Icon kommt aus dem Sprite in
         currentColor, der zugängliche Name per aria-label. */
      var knopf = function (klasse, icon, beschriftung, ziel, aus) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'kbob-paginator-button ' + klasse;
        b.setAttribute('aria-label', beschriftung);
        b.disabled = aus;
        b.appendChild(K.icon(icon));
        b.addEventListener('click', function () {
          st.seite = ziel;
          inUrl(true);
          zeichne();
          el.titel.focus();
        });
        return b;
      };

      nav.appendChild(knopf('kbob-page-first', 'chevron_left_double', 'Erste Seite', 1, st.seite <= 1));
      nav.appendChild(knopf('kbob-page-prev', 'chevron_left', 'Vorherige Seite', st.seite - 1, st.seite <= 1));
      var stand = document.createElement('span');
      stand.textContent = 'Seite ' + st.seite + ' von ' + seiten;
      nav.appendChild(stand);
      nav.appendChild(knopf('kbob-page-next', 'chevron_right', 'Nächste Seite', st.seite + 1, st.seite >= seiten));
      nav.appendChild(knopf('kbob-page-last', 'chevron_right_double', 'Letzte Seite', seiten, st.seite >= seiten));
      el.blaettern.appendChild(nav);
    }

    if (gesamt > K.SEITENGROESSEN[0]) {
      var feld = document.createElement('div');
      feld.className = 'kbob-paginator-size';
      var lab = document.createElement('label');
      lab.className = 'kbob-field-label';
      lab.setAttribute('for', 'pro-seite');
      lab.textContent = 'Einträge pro Seite';
      var sel = document.createElement('select');
      sel.id = 'pro-seite';
      sel.className = 'ob-select';
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

  /* Einzige Stelle, die die vier View-Container kennt */
  function sichtbareAnsicht(name) {
    ['liste', 'galerie', 'graph', 'merkmal'].forEach(function (v) {
      el['view-' + v].hidden = (v !== name);
    });
  }

  /* Meldungskachel — ein Bauplan für alle: Ladezustände als Spinner-Fläche,
     alles andere als Oblique-Alert (typ: info | warning | error). Der
     Aktionsknopf steht NACH dem Alert (Abweichung C6 in docs/OBLIQUE.md):
     Oblique sieht im Alert selbst keine Bedienelemente vor. */
  function meldung(ziel, opt) {
    ziel.innerHTML = '';
    if (opt.laedt) {
      var lade = K.e('div', 'kbob-loading');
      lade.appendChild(K.spinner());
      lade.appendChild(document.createTextNode(opt.titel));
      ziel.appendChild(lade);
      return;
    }
    var alert = K.e('div', 'ob-alert ob-alert-' + (opt.typ || 'info'));
    var h = document.createElement('p');
    var bt = document.createElement('b');
    bt.textContent = opt.titel;
    h.appendChild(bt);
    alert.appendChild(h);
    if (opt.text) {
      var p = document.createElement('p');
      p.textContent = opt.text;
      alert.appendChild(p);
    }
    ziel.appendChild(alert);
    if (opt.aktion) {
      var b = K.knopf('ob-button ob-button-primary', opt.aktion.text, opt.aktion.onClick);
      ziel.appendChild(b);
      if (opt.aktion.fokus) b.focus();
    }
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
      'Jeder Objekttyp führt die Merkmale, die der Katalog für ihn vorsieht — ' +
      'mit Datentyp, Einheit beziehungsweise zulässigen Werten und Property Set.');

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
              s.className = 'kbob-desc-text';
              s.textContent = e.beschreibung;
              return s;
            },
            function () { return String(e.anzahl); },
            function () { return statusText(e.status) || K.leer('ohne Reifegrad'); }
          ];
          if (mitPhase) zellen.push(function () { return K.phasen(e.phasen, st.allePhasen); });
          zellen.push(function () { return e.quelle; });
          return {
            onClick: function () { K.geheZuObjekttyp(e.uri); },
            zellen: zellen
          };
        })
      });
    } else if (st.ansicht === 'galerie') {
      sichtbareAnsicht('galerie');
      K.zeichneGalerie({ karten: seite.map(function (e) {
        return {
          name: e.name, sprache: e.sprache,
          zahl: e.anzahl, zahlText: 'Merkmale',
          text: e.beschreibung,
          marken: e.status ? [{ name: e.status, title: statusErklaerung(e.status) }] : [],
          fuss: e.quelle,
          onClick: function () { K.geheZuObjekttyp(e.uri); }
        };
      }) });
    } else {
      sichtbareAnsicht('graph');
      uebersichtsGraph(liste);
    }
  }

  /* Netz nur, solange es lesbar bleibt. Die Dokumenttypen bleiben draussen —
     sie würden das Netz fluten und führen alle dasselbe kleine Merkmalschema.
     Wer ausdrücklich nach ihnen filtert, bekommt sie trotzdem. */
  function uebersichtsGraph(liste) {
    if (!liste.length) {
      graphMeldung('Kein Treffer für diese Filter',
        'Die Auswahl enthält keine Objekttypen. Einen Filter entfernen oder ' +
        'den Suchbegriff ändern — die Pillen über der Ansicht zeigen, was ' +
        'gerade eingrenzt.');
      return;
    }

    var netzListe = liste.filter(function (e) { return !e.istDokument; });
    if (!netzListe.length) netzListe = liste;   // Auswahl besteht nur aus Dokumenttypen
    var ausgeblendet = liste.length - netzListe.length;

    if (netzListe.length > K.NETZ_MAX) {
      graphMeldung('Zu viele Objekttypen für eine Netzdarstellung',
        K.zahl(netzListe.length) + ' Objekttypen ergeben ein unlesbares Knäuel. ' +
        'Die Auswahl über Katalog, Reifegrad oder die Suche auf höchstens ' +
        K.NETZ_MAX + ' Objekttypen eingrenzen — dann erscheint das Netz. ' +
        'Die Liste zeigt die volle Auswahl.');
      return;
    }
    graphMeldung(null);

    var knoten = [], kanten = [], nachPset = {};
    netzListe.forEach(function (e) {
      var k = {
        id: 'o:' + e.uri, name: e.name, farbe: '#2379a4' /* ob interaction-state */, form: 'kreis',
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
            id: 'p:' + p.name, name: p.name, farbe: '#46596b' /* ob secondary-hover */, form: 'quadrat',
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
      { name: 'Objekttyp', n: netzListe.length, farbe: '#2379a4' },
      { name: 'Property Set', n: Object.keys(nachPset).length, farbe: '#46596b', form: 'quadrat' },
      { hinweis: K.state.hervor ? 'Hervorgehoben: ' + K.state.hervor
                                : 'Punktgrösse: Anzahl Merkmale' }
    ], 'Objekttypen und die Property Sets, die sie teilen. Ein Objekttyp öffnet seine ' +
       'Merkmale, ein Property Set hebt seine Objekttypen hervor. ' +
       (ausgeblendet
         ? 'Die ' + K.zahl(ausgeblendet) + ' Dokumenttypen sind hier ausgeblendet ' +
           '(einheitliches Merkmalschema) — über die Katalog-Facette lassen sie ' +
           'sich gezielt zeigen. '
         : '') + GRAFIK_BEDIENUNG,
       'Objekttypen und Property Sets');
  }

  /* Einheitlicher Bedienhinweis beider Grafiken — er verspricht nur, was geht */
  var GRAFIK_BEDIENUNG = 'Zoomen mit Ctrl + Mausrad oder +/−; Pfeiltasten ' +
    'verschieben, 0 setzt zurück (fokussierte Grafik).';

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
      /* Kennzahlenzeile bleibt leer — der Spinner im Inhalt sagt es schon */
      titel(e.name, '', e.beschreibung, e.sprache);
      el.blaettern.hidden = true;
      sichtbareAnsicht(st.ansicht);
      /* Der Ladezustand dreht dort, wo der Blick ist: im Inhaltsbereich */
      if (st.ansicht === 'liste') {
        K.zeichneListe({ titel: e.name, spalten: [{ titel: 'Merkmal' }], zeilen: [],
                         leerText: 'Merkmale werden geladen …', laedt: true });
      } else if (st.ansicht === 'galerie') {
        K.zeichneGalerie({ karten: [], leerText: 'Merkmale werden geladen …', laedt: true });
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
      e.beschreibung, e.sprache);

    el.treffer.textContent = (suchbegriff() || st.facetten.phase.length)
      ? K.zahl(merkmale.length) + ' von ' + K.zahl(e.anzahl)
      : '';

    var aus = blaettere(merkmale.length);
    var seite = merkmale.slice(aus.von, aus.bis);
    var mitPhase = phasenspalteLohnt(merkmale, function (m) { return m.phasen.length; });

    if (st.ansicht === 'liste') {
      sichtbareAnsicht('liste');
      /* Beschreibung als eigene Spalte (wie in der Übersicht);
         Marken-Reihenfolge wie im Merkmaldetail: Property Set, Datentyp, Reifegrad */
      var spalten = [
        { titel: 'Merkmal', breite: '18%', sort: 'name' },
        { titel: 'Beschreibung' },
        { titel: 'Property Set', breite: '16%', sort: 'pset' },
        { titel: 'Datentyp', breite: '90px', sort: 'typ' },
        { titel: 'Reifegrad', breite: '90px', sort: 'status' }
      ];
      if (mitPhase) spalten.push({ titel: 'LOIN-Meilenstein', breite: '130px' });
      spalten.push({ titel: 'Einheit / Zulässige Werte', breite: '18%' });

      K.zeichneListe({
        titel: 'Merkmale von ' + e.name,
        spalten: spalten,
        sort: st.sort,
        onSort: sortiere,
        zeilen: seite.map(function (m) {
          var zellen = [
            function () {
              return K.zeilenKnopf(m.name, m.sprache,
                function () { K.geheZuMerkmal(m.uri); });
            },
            function () {
              if (!m.beschreibung || m.beschreibung === m.name) {
                return K.leer('ohne Beschreibung');
              }
              var s = document.createElement('span');
              s.className = 'kbob-desc-text';
              s.textContent = m.beschreibung;
              return s;
            },
            function () { return psetZelle(e, m); },
            function () { return m.typ || K.leer('ohne Typangabe'); },
            function () { return statusText(m.status) || K.leer('ohne Reifegrad'); }
          ];
          if (mitPhase) zellen.push(function () { return K.phasen(m.phasen, st.allePhasen); });
          zellen.push(function () { return werteZelle(m); });
          return { onClick: function () { K.geheZuMerkmal(m.uri); }, zellen: zellen };
        })
      });
    } else if (st.ansicht === 'galerie') {
      sichtbareAnsicht('galerie');
      K.zeichneGalerie({ karten: seite.map(function (m) {
        return {
          name: m.name, sprache: m.sprache,
          text: (m.beschreibung && m.beschreibung !== m.name) ? m.beschreibung : '',
          marken: [{ name: m.pset, farbe: e.farbe[m.pset] }]
            .concat(m.typ ? [{ name: m.typ }] : [])
            .concat(m.status ? [{ name: m.status, title: statusErklaerung(m.status) }] : []),
          fuss: [m.einheit, m.ifcTyp,
                 m.liste && m.liste.anzahl ? m.liste.anzahl + ' zulässige Werte' : '']
                 .filter(Boolean).join(' · '),
          onClick: function () { K.geheZuMerkmal(m.uri); }
        };
      }) });
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
        'öffnet seine Angaben. ' + GRAFIK_BEDIENUNG,
        K.geheZuMerkmal);
    }
  }

  /* Scheitert die Detailabfrage, darf «wird geladen …» nicht stehen bleiben —
     dieselbe Regel wie beim Erstladen (Befund K1), eine Ebene tiefer. */
  function zeigeDetailFehler(e) {
    titel(e.name, 'Die Merkmale konnten nicht geladen werden.', null, e.sprache);
    el.blaettern.hidden = true;
    sichtbareAnsicht('liste');

    el['view-liste'].innerHTML = '';
    var box = K.e('div', 'kbob-message');
    meldung(box, {
      titel: 'Die Merkmale konnten nicht geladen werden',
      text: K.state.detailFehler[e.uri],
      typ: 'error',
      aktion: { text: 'Erneut versuchen', onClick: function () { ladeDetail(e.uri); } }
    });
    el['view-liste'].appendChild(box);
  }

  /* ---------- Domänen-Zellen: KBOB-spezifische DOM-Bausteine ----------
     Bewusst in app.js, nicht in views.js: sie kennen Katalogsemantik
     (Reifegrad-Erklärungen, IFC-Psets, Wertelisten) und werden von
     Tabelle, Galerie und Merkmaldetail geteilt. */

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
    t.className = 'kbob-tag';
    t.appendChild(K.text(wert, 'en'));   // Datenwerte sind englisch
    if (STATUS_ERKLAERUNG[wert]) t.title = STATUS_ERKLAERUNG[wert];
    return t;
  }

  /* In Tabellenzellen schlichter Text — der Spaltenkopf beschriftet schon,
     eine Pillenform je Zeile wäre nur Rahmenwerk (eine Zeilenschrift). */
  function statusText(wert) {
    if (!wert) return null;
    var s = K.text(wert, 'en');
    if (STATUS_ERKLAERUNG[wert]) s.title = STATUS_ERKLAERUNG[wert];
    return s;
  }

  /* Statt einer leeren Zeichenfläche: sagen, was zu tun ist —
     beziehungsweise mit drehendem Ring, dass etwas unterwegs ist. */
  function graphMeldung(titel, text, laedt) {
    var zeigen = !!titel;
    el['graph-meldung'].hidden = !zeigen;
    el['graph-wrap'].hidden = zeigen;
    el['graph-steuerung'].hidden = zeigen;
    el['graph-hinweis'].hidden = zeigen;
    if (zeigen) meldung(el['graph-meldung'], { titel: titel, text: text, laedt: laedt });
  }

  function typMarke(m) {
    if (!m.typ) return K.leer('ohne Typangabe');
    return K.e('span', 'kbob-tag', m.typ);
  }

  /* Ohne Farbtupfer: in der Tabelle trägt der Name die Aussage — die
     Property-Set-Farben bleiben der Grafik und der Galerie vorbehalten. */
  function psetZelle(e, m) {
    var box = document.createElement('span');
    box.className = 'kbob-pset';
    var pn = document.createElement('span');
    pn.textContent = m.pset;
    if (m.ifcPset) {
      var ip = document.createElement('span');
      ip.className = 'kbob-pset-ifc';
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
      eh.className = 'kbob-unit';
      eh.textContent = m.einheit;
      box.appendChild(eh);
      etwas = true;
    }
    if (m.liste && m.liste.anzahl) {
      var w = document.createElement('span');
      w.className = 'kbob-values';
      w.textContent = m.liste.anzahl + ' zulässige Werte: ' + K.kurzListe(m.liste.werte, 70);
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

    sichtbareAnsicht('merkmal');
    el.blaettern.hidden = true;   // die Blätterleiste gehört zur Liste darüber

    titel(m.name, e.name + ' · ' + m.pset + ' · ' + e.quelle, null, m.sprache);

    var ziel = el['merkmal-detail'];
    ziel.innerHTML = '';

    if (m.beschreibung && m.beschreibung !== m.name) {
      var p = document.createElement('p');
      p.textContent = m.beschreibung;
      ziel.appendChild(p);
    }

    var dl = document.createElement('dl');
    dl.className = 'kbob-data';

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
    uri.className = 'kbob-mono';
    uri.textContent = m.uri;
    zeile('URI', uri);

    ziel.appendChild(dl);
  }

  /* ---------- Ansicht ---------- */

  function setzeAnsicht(name) {
    K.state.ansicht = name;
    ansichtKnoepfe(name);
    if (K.state.merkmal) K.state.merkmal = null;
    inUrl();
    zeichne();
  }
  K.setzeAnsicht = setzeAnsicht;

  /* ---------- Excel-Export (XLSX, js/export.js) ---------- */

  function speichereBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* Arbeitsmappe mit drei Blättern: Objekttypen (eine Zeile je Objekttyp),
     Merkmale (eine Zeile je Merkmal und Objekttyp) und Info (Quelle, Stand,
     angewandte Filter). «Datentyp» ist der übersetzte Anzeigewert (Auswahl,
     Ja/Nein …), «Datentyp (Katalog)» der Rohwert aus dem Graphen (STRING,
     REAL …) — ein Integrator braucht beide. Wertetrennzeichen der Spalte
     «Zulässige Werte» ist « · ». */
  var OBJEKT_BLATT = {
    kopf: ['Objekttyp', 'Beschreibung', 'Reifegrad', 'Katalog', 'Anzahl Merkmale',
           'Property Sets', 'LOIN-Meilensteine', 'Objekttyp-URI'],
    breiten: [32, 70, 12, 30, 16, 44, 22, 56]
  };

  var MERKMAL_BLATT = {
    kopf: ['Objekttyp', 'Merkmal', 'Beschreibung', 'Property Set', 'Datentyp',
           'Datentyp (Katalog)', 'Einheit', 'Zulässige Werte', 'Reifegrad',
           'IFC-Property-Set', 'IFC-Datentyp', 'LOIN-Meilensteine', 'Merkmal-URI'],
    breiten: [30, 30, 70, 24, 12, 17, 9, 56, 12, 24, 16, 22, 56]
  };

  function objektZeile(e) {
    return [e.name, e.beschreibung, e.status, e.quelle, e.anzahl,
            e.psets.map(function (p) { return p.name; }).join(' · '),
            e.phasen.join(' '), e.uri];
  }

  function merkmalZeile(e, m) {
    return [e.name, m.name, m.beschreibung, m.pset, m.typ, m.typRaw, m.einheit,
            m.liste ? m.liste.werte : '', m.status, m.ifcPset, m.ifcTyp,
            m.phasen.join(' '), m.uri];
  }

  function infoBlatt(nObjekte, nMerkmale) {
    var st = K.state;
    var v = verbindung();
    var zeilen = [
      ['Quelle', 'KBOB Data Dictionary über LINDAS'],
      ['SPARQL-Endpunkt', v.endpoint],
      ['Named Graph', v.graph],
      ['Sprache der Beschriftungen', v.sprache.toUpperCase()],
      ['Exportiert am', new Date().toLocaleDateString('de-CH')],
      ['Objekttypen', nObjekte],
      ['Merkmale', nMerkmale]
    ];
    if (el.filter.value.trim()) zeilen.push(['Filter: Suche', el.filter.value.trim()]);
    if (st.facetten.katalog.length) zeilen.push(['Filter: Katalog', st.facetten.katalog.join(', ')]);
    if (st.facetten.status.length) zeilen.push(['Filter: Reifegrad', st.facetten.status.join(', ')]);
    if (st.facetten.phase.length) zeilen.push(['Filter: LOIN-Meilenstein', st.facetten.phase.join(', ')]);
    zeilen.push(['Anwendung', 'https://github.com/bbl-dres/kbob-data']);
    return { name: 'Info', kopf: ['Angabe', 'Wert'], zeilen: zeilen, breiten: [28, 70] };
  }

  function speichereMappe(objekte, dateiname) {
    var st = K.state;
    var merkmalZeilen = [];
    var ohneWerte = false;
    objekte.forEach(function (e) {
      if (st.detailOhneWerte[e.uri]) ohneWerte = true;
      var merkmale = (st.objekttyp === e.uri ? sichtbareMerkmale(e.uri) : st.detail[e.uri]) || [];
      merkmale.forEach(function (m) { merkmalZeilen.push(merkmalZeile(e, m)); });
    });

    speichereBlob(K.xlsxBlob([
      { name: 'Objekttypen', kopf: OBJEKT_BLATT.kopf, breiten: OBJEKT_BLATT.breiten,
        zeilen: objekte.map(objektZeile) },
      { name: 'Merkmale', kopf: MERKMAL_BLATT.kopf, breiten: MERKMAL_BLATT.breiten,
        zeilen: merkmalZeilen },
      infoBlatt(objekte.length, merkmalZeilen.length)
    ]), dateiname);

    setStatus(K.zahl(objekte.length) + ' ' +
              K.plural(objekte.length, 'Objekttyp', 'Objekttypen') + ' mit ' +
              K.zahl(merkmalZeilen.length) + ' Merkmalen als Excel-Arbeitsmappe gespeichert.' +
              (ohneWerte ? ' Die Wertelisten konnten nicht geladen werden — ' +
                           'Auswahl-Merkmale stehen darin als «Text».' : ''),
              ohneWerte);
  }

  /* Ein Objekttyp: sofort aus dem Zwischenspeicher. Die ganze Auswahl: alle
     Merkmale kommen in EINER Abfrage (K.holeAlleDetails) — ein Limit braucht
     der Export darum nicht mehr. */
  function exportiereExcel() {
    var st = K.state;

    if (st.objekttyp && st.detail[st.objekttyp]) {
      var e = objekttypVon(st.objekttyp);
      speichereMappe([e], 'kbob-' + K.dateiname(e.name) + '.xlsx');
      return;
    }

    var auswahl = sichtbareObjekttypen();
    if (!auswahl.length) {
      setStatus('Die Auswahl ist leer — es gibt nichts zu speichern.', true);
      return;
    }

    var fehlt = auswahl.some(function (e) { return !st.detail[e.uri]; });
    if (!fehlt) {
      speichereMappe(auswahl, 'kbob-' + K.dateiname('data-dictionary') + '.xlsx');
      return;
    }

    el.csv.disabled = true;
    busy(true, 'Alle Merkmale werden für den Export geladen …');
    var gen = st.generation;

    K.holeAlleDetails(verbindung()).then(function () {
      el.csv.disabled = false;
      if (gen !== st.generation) {
        setStatus('Export abgebrochen — der Katalog wurde inzwischen neu geladen.', true);
        return;
      }
      speichereMappe(auswahl, 'kbob-' + K.dateiname('data-dictionary') + '.xlsx');
    }).catch(function (err) {
      el.csv.disabled = false;
      if (gen !== st.generation) return;
      setStatus('Export abgebrochen: ' + fehlerText(err), true);
    });
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
    /* Frühe, benannte Diagnose statt spätem «Cannot read properties of null» */
    Object.keys(el).forEach(function (id) {
      if (!el[id]) throw new Error('index.html: Element #' + id + ' fehlt');
    });

    /* Der lokale Proxy gibt sein Abfrageziel per Marker mit — robuster als
       ein Byte-Replace auf dem value-Attribut (siehe lindas-proxy.py). */
    if (window.KBOB_PROXY) el.endpoint.value = window.KBOB_PROXY;

    el.csv.title = 'Exportiert die sichtbare Auswahl als Excel-Arbeitsmappe (XLSX) — ' +
                   'Objekttypen, Merkmale und Quellenangaben als Tabellenblätter';

    el.neuladen.addEventListener('click', laden);

    el.zurueck.addEventListener('click', function () {
      if (K.state.merkmal) K.geheZuObjekttyp(K.state.objekttyp);
      else K.geheZuUebersicht();
    });

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

    el.csv.addEventListener('click', exportiereExcel);

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
      }, K.SUCH_DEBOUNCE_MS);
    });

    /* Loesch-Knopf im Suchfeld: leert sofort, Fokus bleibt im Feld */
    document.getElementById('filter-leeren').addEventListener('click', function () {
      el.filter.value = '';
      clearTimeout(sucheTimer);
      K.state.seite = 1;
      K.state.hervor = null;
      inUrl(true);
      zeichne();
      el.filter.focus();
    });

    /* Klick ausserhalb schliesst offene Facetten-Menüs — focusout allein
       trägt nicht (Safari/Firefox fokussieren angeklickte Checkboxen nicht). */
    document.addEventListener('pointerdown', function (ev) {
      Array.prototype.forEach.call(el.facetten.querySelectorAll('.kbob-facet-menu'), function (menu) {
        if (menu.hidden) return;
        var box = menu.parentNode;
        if (!box.contains(ev.target)) {
          menu.hidden = true;
          box.querySelector('.kbob-facet-toggle').setAttribute('aria-expanded', 'false');
        }
      });
    });

    window.addEventListener('popstate', function () { ausUrl(); zeichne(); });

    /* Oblique-Layoutzustand: oberhalb 905px expanded (grosses Logo,
       Kopf einzeilig), darunter collapsed + mobile Token-Dichte —
       dieselbe Schwelle wie im ob-master-layout. */
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

    /* Die Kopfzeile klebt — die Tabellenköpfe müssen wissen, wie hoch sie ist */
    var kopf = document.querySelector('.ob-master-layout-header');
    function messeKopf() {
      document.documentElement.style.setProperty('--kopf-gesamt', kopf.offsetHeight + 'px');
    }
    messeKopf();
    if (window.ResizeObserver) {
      var beobachter = new ResizeObserver(messeKopf);
      beobachter.observe(kopf);
    } else {
      window.addEventListener('resize', messeKopf);
    }

    /* Zum-Seitenanfang-Reiter: erscheint nach einer halben Fensterhöhe */
    var nachOben = document.getElementById('nach-oben');
    window.addEventListener('scroll', function () {
      nachOben.hidden = window.scrollY < window.innerHeight / 2;
    }, { passive: true });
    nachOben.addEventListener('click', function () {
      var ruhig = window.matchMedia &&
                  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: ruhig ? 'auto' : 'smooth' });
      el.titel.focus();
    });

    K.grafikSteuerung();

    /* Die Sprache muss vor dem ersten Laden aus der URL kommen —
       sie bestimmt bereits die Übersichtsabfrage. */
    var l = /[#&]l=(de|fr|it|en)(&|$)/.exec(location.hash);
    if (l) { K.state.sprache = l[1]; el.sprache.value = l[1]; }
  }

  verdrahten();
  laden();      // ohne Klick: der Katalog ist beim Öffnen schon da
})(KBOB);
