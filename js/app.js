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
   'zurueck', 'graph-panel', 'graph-titel', 'zoom-hinweis',
   'graph-ueberspringen', 'vollbild'].forEach(function (id) {
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
    return NETZFEHLER.test(m) ? K.t('errors.networkShort') : m;
  }

  function laden() {
    if (!endpunkt() || !graphUri()) { setStatus(K.t('errors.fillConnection'), true); return; }
    if (dlgVerbindung.open) dlgVerbindung.close();

    /* Verbindungsstand zur ANFRAGEzeit einfrieren und die Generation
       hochzählen: von zwei schnellen Neu-Laden gewinnt so immer das
       zuletzt angestossene — nicht die zufällig letzte Antwort. Laufende
       geteilte Versprechen der alten Generation werden verworfen. */
    var st = K.state;
    var anfrage = { endpoint: endpunkt(), graph: graphUri(), sprache: st.sprache };
    st.generation += 1;
    K.invalidiereLaufend();
    var meineGen = st.generation;

    el.neuladen.disabled = true;

    /* Sichtbarer Platzhalter (Erststart, erneuter Versuch nach Fehler) —
       erst wenn das Wörterbuch da ist, sonst stünde MISSING im Spinner. */
    K.i18nBereit.then(function () {
      if (meineGen !== st.generation) return;
      if (!el.platzhalter.hidden && !st.elemente.length) {
        meldung(el.platzhalter, { titel: K.t('loading.catalog'), laedt: true });
      }
      /* Neuladen mit bestehendem Inhalt (Sprach-/Endpunktwechsel): die
         Oberflaechentexte wechseln sofort, der Inhalt zeigt den EINEN
         Ladezustand — Spinner in Tabelle, Galerie oder Graph. */
      if (st.elemente.length) {
        el.blaettern.hidden = true;
        if (st.ansicht === 'galerie') {
          sichtbareAnsicht('galerie');
          K.zeichneGalerie({ karten: [], leerText: K.t('loading.catalog'), laedt: true });
        } else if (st.ansicht === 'graph') {
          sichtbareAnsicht('graph');
          graphMeldung(K.t('loading.catalog'), '', true);
        } else {
          sichtbareAnsicht('liste');
          K.zeichneListe({ titel: K.t('loading.catalog'), spalten: [{ titel: '' }],
                           zeilen: [], leerText: K.t('loading.catalog'), laedt: true });
        }
      }
      busy(true, K.t('loading.catalog'));
    });

    Promise.all([
      K.run(anfrage.endpoint, K.uebersichtQuery(anfrage.graph, anfrage.sprache)),
      K.i18nBereit
    ]).then(function (res) {
      if (meineGen !== st.generation) return;   // inzwischen neu geladen
      var rows = res[0].results.bindings;
      busy(false);
      el.neuladen.disabled = false;

      if (!rows.length) {
        zeigeFehler(K.t('errors.emptyGraph', { graph: anfrage.graph }));
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
      /* Aufs Wörterbuch warten, sonst zeigt ein sofortiger Netzfehler
         (CORS, offline) nur MISSING-Marken — i18nBereit erfüllt immer. */
      K.i18nBereit.then(function () {
        if (meineGen !== st.generation) return;
        busy(false);
        el.neuladen.disabled = false;
        var msg = String(err && err.message || err);
        var text = K.t('errors.network');
        if (location.protocol === 'file:') text += ' ' + K.t('errors.file');
        zeigeFehler(NETZFEHLER.test(msg)
          ? text
          : K.t('errors.queryFailed', { msg: msg }));
      });
    });
  }


  /* Der Ladehinweis darf nicht stehen bleiben, wenn das Laden scheitert —
     sonst widerspricht die Seite sich selbst. */
  function zeigeFehler(text) {
    setStatus(K.t('errors.loadFailed'), true);
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
      titel: K.t('errors.catalogTitle'),
      text: text,
      typ: 'error',
      aktion: { text: K.t('common.retry'), onClick: laden, fokus: true }
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

    gruppe(K.t('facets.catalog'), 'katalog', st.kataloge.map(function (q) {
      return { wert: q.name, text: q.name, n: q.objekttypen };
    }));

    st.allePhasen = Object.keys(phasen).sort();

    var statusListe = Object.keys(status).sort();
    if (statusListe.length > 1) {
      gruppe(K.t('facets.status'), 'status', statusListe.map(function (w) {
        return { wert: w, text: w, n: status[w] };
      }));
    }

    /* Nur ein Bruchteil der Merkmale deklariert einen Meilenstein. Die Gruppe
       erscheint darum nur, wenn es überhaupt etwas auszuwählen gibt.
       «LOIN-Meilenstein» ist das Label des Feldes im KBOB-Schema
       (dd:loinMilestone) — «Projektphase» wäre mit SIA 112 verwechselbar. */
    var phasenListe = Object.keys(phasen).sort();
    if (phasenListe.length) {
      gruppe(K.t('facets.milestone'), 'phase', phasenListe.map(function (p) {
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
    /* tabindex=-1: Beim Mousedown auf eine Zeile schickt Chrome den Fokus
       zum nächsten fokussierbaren VORFAHREN. Ohne dieses Attribut ist das
       main#content — der focusout-Wächter unten hielt das für «ausserhalb»
       und schloss das Menü ZWISCHEN Mousedown und Mouseup; der Klick fiel
       auf die Seite dahinter durch («Zeile tut nichts»). Mit tabindex=-1
       bleibt der Fokus im Menü, und die Zeile schaltet zuverlässig. */
    menu.tabIndex = -1;
    knopf.setAttribute('aria-controls', menu.id);

    var reset = null;   // wird unten gebaut; beschrifte() hält ihn aktuell

    function beschrifte() {
      var n = K.state.facetten[schluessel].length;
      wert.textContent = titel + (n ? ' (' + n + ')' : '');
      wert.className = 'kbob-facet-value' + (n ? ' aktiv' : '');
      knopf.setAttribute('aria-label', n ? K.t('facets.selectedCount', { titel: titel, n: n }) : titel);
      if (reset) reset.disabled = n === 0;
    }

    eintraege.forEach(function (e, idx) {
      /* BEWUSST kein <label>: die native Label-Weiterleitung erzeugte je
         nach Engine trotz preventDefault einen zweiten Klick auf die
         Checkbox — Toggle plus Rück-Toggle sah aus wie «Zeile tut nichts».
         Ein neutraler Container mit EINEM expliziten Handler ist in jedem
         Browser eindeutig; den zugänglichen Namen liefert aria-labelledby. */
      var zeile = document.createElement('div');
      zeile.className = 'kbob-facet-option';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'ob-checkbox';
      cb.value = e.wert;
      cb.checked = K.state.facetten[schluessel].indexOf(e.wert) !== -1;

      var textId = id + '-opt-' + idx;
      cb.setAttribute('aria-labelledby', textId);
      cb.addEventListener('change', function () {
        var auswahl = K.state.facetten[schluessel];
        var i = auswahl.indexOf(e.wert);
        if (cb.checked && i === -1) auswahl.push(e.wert);
        if (!cb.checked && i !== -1) auswahl.splice(i, 1);
        beschrifte();
        neuAuswerten();
      });

      zeile.addEventListener('click', function (ev) {
        if (ev.target === cb) return;   // direkter Checkbox-Klick: nativer Weg
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
      });

      zeile.appendChild(cb);
      zeile.appendChild(K.e('span', '', e.text)).id = textId;
      menu.appendChild(zeile);
    });

    var fuss = document.createElement('div');
    fuss.className = 'kbob-facet-footer';
    reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'ob-button ob-button-tertiary';
    reset.textContent = K.t('facets.clear');
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
  var FACETTEN_TITEL = { katalog: 'facets.catalog', status: 'facets.status', phase: 'facets.milestone' };

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
        pillen.push({ art: K.t(FACETTEN_TITEL[schluessel]), wert: wert, schluessel: schluessel });
      });
    });
    if (el.filter.value.trim()) {
      pillen.push({ art: K.t('search.label'), wert: el.filter.value.trim(), schluessel: 'suche' });
    }

    box.hidden = !pillen.length;
    if (!pillen.length) return;

    pillen.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ob-chip';
      b.setAttribute('aria-label', K.t('chips.remove', { art: p.art, wert: p.wert }));

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
    reset.textContent = K.t('chips.reset');
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
    /* location.hash liefert bei nacktem «#» einen Leerstring — ohne den
       Ausgleich entstünden tote History-Einträge im Grundzustand. */
    if (neu !== (location.hash || '#')) {
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

  /* Gibt true zurück, wenn ein Neuladen angestossen wurde (Sprachwechsel
     in der URL) — der Aufrufer soll dann nicht mit altem Stand zeichnen. */
  function ausUrl() {
    var st = K.state, p = {};
    /* Aus href lesen, nicht aus location.hash: manche Browser dekodieren
       hash beim Lesen und zerlegten kodierte &/= in Suchbegriffen. */
    var roh = location.href.split('#')[1] || '';
    roh.split('&').forEach(function (teil) {
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
       Oberfläche nachführen, Katalog in dieser Sprache neu laden. */
    if (st.verbindung && st.verbindung.sprache !== st.sprache) {
      K.uebersetzeStatisch();
      laden();
      return true;
    }

    /* Ein geteilter Link kann auf einen Eintrag zeigen, den dieser Katalog
       nicht kennt — das darf nicht still auf der Übersicht enden. Vor der
       Datenankunft (popstate während des Erstladens) wird nicht geprüft,
       sonst würde ein gültiger Deep-Link fälschlich getilgt. */
    if (st.elemente.length && st.objekttyp && !objekttypVon(st.objekttyp)) {
      setStatus(K.t('errors.unknownType'), true);
      st.objekttyp = null;
      st.merkmal = null;
      inUrl(true);
    }

    /* Dieselbe Prüfung für das Merkmal, wenn das Detail schon im Cache
       liegt — sonst bliebe eine «…»-Krume für ein Phantom-Merkmal stehen. */
    if (st.merkmal && st.objekttyp && st.detail[st.objekttyp] && !merkmalVon()) {
      setStatus(K.t('errors.unknownAttr'), true);
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
    /* Die Hervorhebung reist mit, wenn der Zieltyp dieses Property Set
       fuehrt — die Radialansicht oeffnet dann mit der Gruppe im Fokus. */
    var ziel = objekttypVon(uri);
    if (!(K.state.hervor && ziel && ziel.psets.some(function (p) {
      return p.name === K.state.hervor;
    }))) K.state.hervor = null;
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
    var gen = K.state.generation;
    delete K.state.detailFehler[uri];
    busy(true, K.t('loading.attrsOf', { name: e ? e.name : '…' }));
    K.holeDetail(v, uri).then(function () {
      busy(false);
      if (gen !== K.state.generation) return;   // inzwischen neu geladen
      if (K.state.objekttyp !== uri) return;
      /* Ein per Link angefordertes Merkmal kann sich als unbekannt erweisen */
      if (K.state.merkmal && !merkmalVon()) {
        setStatus(K.t('errors.unknownAttr'), true);
        K.state.merkmal = null;
        inUrl(true);
        zeichne();
        return;
      }
      setStatus(K.state.detailOhneWerte[uri] ? K.t('values.warning') : '',
                !!K.state.detailOhneWerte[uri]);
      /* Bei einem Deep-Link auf ein Merkmal erscheint die Zielansicht erst
         jetzt — der Fokus soll dorthin, sonst bleibt der Wechsel unbemerkt. */
      zeichne(!!K.state.merkmal);
    }).catch(function (err) {
      busy(false);
      if (gen !== K.state.generation) return;
      K.state.detailFehler[uri] = fehlerText(err);
      setStatus(K.t('errors.attrsFailed'), true);
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

    /* Die Krume steht auf jeder Ebene — auch auf der Übersicht (stabiler
       Ankerpunkt, redaktioneller Entscheid). */
    el.krumen.parentNode.hidden = false;
    el.krumen.appendChild(krume(K.t('overview.title'), K.geheZuUebersicht, !st.objekttyp));

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
    /* lang-Auszeichnung relativ zur OBERFLÄCHENsprache: auch ein deutsches
       Datenlabel braucht sie, wenn die Oberfläche französisch spricht. */
    if (sprache && sprache !== K.state.sprache) el.titel.setAttribute('lang', sprache);
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
        ? (objekttypVon(st.objekttyp) || {}).name || K.t('col.type')
        : K.t('overview.title');
      el.zurueck.setAttribute('aria-label', K.t('common.backTo', { name: elternName }));
      el.zurueck.title = K.t('common.backTo', { name: elternName });
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
    if (st.seite > seiten) {
      st.seite = seiten;
      inUrl(true);   // die URL soll nicht auf einer Phantomseite stehen bleiben
    }

    var von = (st.seite - 1) * st.proSeite;
    var bis = Math.min(von + st.proSeite, gesamt);

    el.blaettern.hidden = (st.ansicht === 'graph') || gesamt === 0;
    if (el.blaettern.hidden) return { von: von, bis: bis };

    el.blaettern.innerHTML = '';

    var bereich = document.createElement('span');
    bereich.className = 'kbob-paginator-range';
    bereich.textContent = gesamt <= st.proSeite
      ? K.zahl(gesamt) + ' ' + K.plural(gesamt, K.t('unit.entry'), K.t('unit.entries'))
      : K.t('paginator.range', { von: K.zahl(von + 1), bis: K.zahl(bis), gesamt: K.zahl(gesamt) });
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

      nav.appendChild(knopf('kbob-page-first', 'chevron_left_double', K.t('paginator.first'), 1, st.seite <= 1));
      nav.appendChild(knopf('kbob-page-prev', 'chevron_left', K.t('paginator.prev'), st.seite - 1, st.seite <= 1));
      var stand = document.createElement('span');
      stand.textContent = K.t('paginator.pageOf', { seite: st.seite, seiten: seiten });
      nav.appendChild(stand);
      nav.appendChild(knopf('kbob-page-next', 'chevron_right', K.t('paginator.next'), st.seite + 1, st.seite >= seiten));
      nav.appendChild(knopf('kbob-page-last', 'chevron_right_double', K.t('paginator.last'), seiten, st.seite >= seiten));
      el.blaettern.appendChild(nav);
    }

    if (gesamt > K.SEITENGROESSEN[0]) {
      var feld = document.createElement('div');
      feld.className = 'kbob-paginator-size';
      var lab = document.createElement('label');
      lab.className = 'kbob-field-label';
      lab.setAttribute('for', 'pro-seite');
      lab.textContent = K.t('paginator.perPage');
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
    if (name !== 'graph') schliesseGraphPanel(false);
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
    el.filter.placeholder = K.t('search.phOverview');

    var liste = sortiert(sichtbareObjekttypen());
    var merkmale = liste.reduce(function (s, e) { return s + e.anzahl; }, 0);

    /* Alle drei Kennzahlen beschreiben die sichtbare Auswahl — eine
       konstante Katalogzahl neben gefilterten Werten wäre eine
       Eigenschaft des Gesamtbestands im falschen Satz. */
    var quellen = {};
    liste.forEach(function (e) { quellen[e.quelle] = true; });
    var nQuellen = Object.keys(quellen).length;

    titel(K.t('overview.title'),
      K.zahl(liste.length) + ' ' + K.plural(liste.length, K.t('unit.type'), K.t('unit.types')) +
      ' · ' + K.zahl(merkmale) + ' ' + K.plural(merkmale, K.t('unit.attr'), K.t('unit.attrs')) +
      ' · ' + K.zahl(nQuellen) + ' ' + K.plural(nQuellen, K.t('unit.catalog'), K.t('unit.catalogs')),
      K.t('overview.lead'));

    /* Der Zähler trägt nur bei aktivem Filter etwas bei — ungefiltert stünde
       dieselbe Zahl bereits in den Kennzahlen. Die Live-Region bleibt. */
    el.treffer.textContent = istGefiltert()
      ? K.t('common.nOfTotal', { n: K.zahl(liste.length), total: K.zahl(st.elemente.length) })
      : '';

    var aus = blaettere(liste.length);
    var seite = liste.slice(aus.von, aus.bis);
    var mitPhase = phasenspalteLohnt(liste, function (e) { return e.phasen.length; });

    if (st.ansicht === 'liste') {
      sichtbareAnsicht('liste');
      var spalten = [
        { titel: K.t('col.type'), breite: '22%', sort: 'name' },
        { titel: K.t('col.description') },
        { titel: K.t('col.attrs'), breite: '90px', rechts: true, sort: 'anzahl', sortStart: -1 },
        { titel: K.t('col.status'), breite: '100px', sort: 'status' }
      ];
      if (mitPhase) spalten.push({ titel: K.t('col.milestone'), breite: '130px' });
      spalten.push({ titel: K.t('col.catalog'), breite: '18%', sort: 'quelle' });

      K.zeichneListe({
        titel: K.t('table.captionOverview'),
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
              if (!e.beschreibung) return K.leer(K.t('empty.description'));
              var s = document.createElement('span');
              s.className = 'kbob-desc-text';
              s.textContent = e.beschreibung;
              return s;
            },
            function () { return String(e.anzahl); },
            function () { return statusText(e.status) || K.leer(K.t('empty.status')); }
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
          zahl: e.anzahl, zahlText: K.t('unit.attrs'),
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
  /* ---------- Graph: Seitenpanel, Hervorhebung, Signatur ----------
     Klick auf einen Knoten zeigt Details im Panel; navigiert wird erst
     ueber die Aktion im Panel. Die Hervorhebung laeuft als reine
     DOM-Operation (kein Neulayout), und ein unveraenderter Knotenbestand
     wird gar nicht neu gebaut — Ausschnitt und Zoom bleiben stehen. */

  var netzPsetDaten = {};     // Schluessel -> {name, objekttypen, merkmale}
  var netzLegendeBauen = null;
  var letzteNetzSig = '';
  var letzteRadialSig = '';

  function sucheKnoten(id) {
    var alle = el.netz.querySelectorAll('.g-knoten');
    for (var i = 0; i < alle.length; i++) {
      if (alle[i].getAttribute('data-id') === id) return alle[i];
    }
    return null;
  }

  function schliesseGraphPanel(fokusZurueck) {
    var panel = el['graph-panel'];
    if (panel.hidden) return;
    var auswahl = K.state.graphAuswahl;
    panel.hidden = true;
    panel.innerHTML = '';
    K.state.graphAuswahl = null;
    K.graphAuswahlMarkieren(null);
    if (fokusZurueck && auswahl && auswahl.knotenId) {
      var g = sucheKnoten(auswahl.knotenId);
      (g || el.netz).focus();
    }
  }

  /* Ein Bauplan fuer alle Panel-Arten: Kopf (Art, Name, Schliessen),
     optionale Beschreibung, Kennzeilen, Aktionen. Fokus wandert auf den
     Titel; Escape und der Schliessen-Knopf geben ihn an den Knoten zurueck. */
  function zeigeGraphPanel(daten) {
    var panel = el['graph-panel'];
    panel.innerHTML = '';
    panel.hidden = false;
    K.state.graphAuswahl = daten.merker;
    K.graphAuswahlMarkieren(daten.merker.knotenId || null);

    var kopf = K.e('div', 'kbob-graph-panel-head');
    var titelbox = K.e('div', 'kbob-graph-panel-title');
    titelbox.appendChild(K.e('span', 'kbob-graph-panel-kind', daten.art));
    var h = K.e('h2', '', null);
    h.tabIndex = -1;
    h.appendChild(K.text(daten.name, daten.sprache));
    titelbox.appendChild(h);
    kopf.appendChild(titelbox);
    var zu = K.knopf('kbob-graph-panel-close', null, function () { schliesseGraphPanel(true); });
    zu.setAttribute('aria-label', K.t('common.close'));
    zu.appendChild(K.icon('xmark'));
    kopf.appendChild(zu);
    panel.appendChild(kopf);

    if (daten.beschreibung) {
      panel.appendChild(K.e('p', 'kbob-graph-panel-desc', K.gekuerzt(daten.beschreibung, 280)));
    }

    if (daten.zeilen && daten.zeilen.length) {
      var dl = K.e('dl', 'kbob-graph-panel-data');
      daten.zeilen.forEach(function (z) {
        if (!z[1]) return;
        dl.appendChild(K.e('dt', '', z[0]));
        var dd = K.e('dd', '');
        if (typeof z[1] === 'string') dd.textContent = z[1];
        else dd.appendChild(z[1]);
        dl.appendChild(dd);
      });
      panel.appendChild(dl);
    }

    var aktionen = K.e('div', 'kbob-graph-panel-actions');
    (daten.aktionen || []).forEach(function (a) {
      var b = K.knopf('ob-button ' + (a.primaer ? 'ob-button-primary' : 'ob-button-secondary'),
                      a.text, a.onClick);
      if (a.gedrueckt !== undefined) b.setAttribute('aria-pressed', String(a.gedrueckt));
      if (a.name) b.setAttribute('data-aktion', a.name);
      aktionen.appendChild(b);
    });
    panel.appendChild(aktionen);

    panel.addEventListener('keydown', panelEscape);
    if (daten.fokus !== false) h.focus();
  }

  function panelEscape(ev) {
    if (ev.key === 'Escape') { ev.stopPropagation(); schliesseGraphPanel(true); }
  }

  function zeigePanelTyp(e, knotenId, fokus) {
    zeigeGraphPanel({
      merker: { art: 'typ', uri: e.uri, knotenId: knotenId },
      art: K.t('graph.legendType'), name: e.name, sprache: e.sprache,
      beschreibung: e.beschreibung,
      zeilen: [
        [K.t('col.attrs'), K.zahl(e.anzahl)],
        [K.t('col.psets'), K.zahl(e.psets.length)],
        [K.t('col.status'), e.status || ''],
        [K.t('col.catalog'), e.quelle]
      ],
      aktionen: [
        { text: K.t('common.open'), primaer: true, name: 'oeffnen',
          onClick: function () { K.geheZuObjekttyp(e.uri); } }
      ],
      fokus: fokus
    });
  }

  function zeigePanelPset(schluessel, knotenId, fokus) {
    var d = netzPsetDaten[schluessel];
    if (!d) return;
    var aktiv = K.state.hervor === d.name;
    zeigeGraphPanel({
      merker: { art: 'pset', schluessel: schluessel, knotenId: knotenId },
      art: K.t('graph.legendPset'), name: d.name,
      zeilen: [
        [K.t('overview.title'), K.zahl(d.objekttypen)],
        [K.t('col.attrs'), K.zahl(d.merkmale)]
      ],
      aktionen: [
        { text: aktiv ? K.t('graph.highlightOff') : K.t('graph.highlightOn'),
          gedrueckt: aktiv, name: 'hervor',
          onClick: function () { toggleNetzHervor(d.name, schluessel, knotenId); } },
        { text: K.t('graph.showInList'), name: 'liste',
          onClick: function () {
            el.filter.value = d.name;
            K.state.seite = 1;
            setzeAnsicht('liste');
          } }
      ],
      fokus: fokus
    });
  }

  function toggleNetzHervor(name, schluessel, knotenId) {
    K.state.hervor = (K.state.hervor === name) ? null : name;
    K.hervorhebungNetz();
    if (netzLegendeBauen) netzLegendeBauen();
    /* Panel neu beschriften, Fokus bleibt auf dem Umschaltknopf */
    zeigePanelPset(schluessel, knotenId, false);
    var knopf = el['graph-panel'].querySelector('[data-aktion="hervor"]');
    if (knopf) knopf.focus();
    K.setStatus(K.state.hervor
      ? K.t('graph.highlighted', { name: name })
      : K.t('graph.highlightCleared'));
  }

  function hebeNetzHervorAuf() {
    K.state.hervor = null;
    K.hervorhebungNetz();
    if (netzLegendeBauen) netzLegendeBauen();
    var offen = K.state.graphAuswahl;
    if (offen && offen.art === 'pset') zeigePanelPset(offen.schluessel, offen.knotenId, false);
    K.setStatus(K.t('graph.highlightCleared'));
  }

  function zeigePanelMerkmal(m, e, knotenId, fokus) {
    zeigeGraphPanel({
      merker: { art: 'merkmal', uri: m.uri, knotenId: knotenId },
      art: K.t('col.attr'), name: m.name, sprache: m.sprache,
      beschreibung: (m.beschreibung && m.beschreibung !== m.name) ? m.beschreibung : '',
      zeilen: [
        [K.t('col.pset'), m.pset],
        [K.t('col.datatype'), m.typ || ''],
        [K.t('col.unit'), m.einheit || ''],
        [K.t('col.status'), m.status || ''],
        [K.t('col.values'), m.liste && m.liste.anzahl
          ? K.zahl(m.liste.anzahl) + ': ' + K.kurzListe(m.liste.werte, 90) : '']
      ],
      aktionen: [
        { text: K.t('common.open'), primaer: true, name: 'oeffnen',
          onClick: function () { K.geheZuMerkmal(m.uri); } }
      ],
      fokus: fokus
    });
  }

  /* Netz nur, solange es lesbar bleibt. Die Dokumenttypen bleiben draussen —
     sie wuerden das Netz fluten und fuehren alle dasselbe kleine
     Merkmalschema. Wer nach ihnen filtert, bekommt sie trotzdem. */
  function uebersichtsGraph(liste) {
    el['graph-titel'].textContent = K.t('graph.titleOverview');

    if (!liste.length) {
      graphMeldung(K.t('graph.emptyTitle'), K.t('graph.emptyTypes'), false, 'leer');
      return;
    }

    var netzListe = liste.filter(function (e) { return !e.istDokument; });
    if (!netzListe.length) netzListe = liste;   // Auswahl besteht nur aus Dokumenttypen
    var ausgeblendet = liste.length - netzListe.length;

    if (netzListe.length > K.NETZ_MAX) {
      graphMeldung(K.t('graph.tooManyTitle'),
                   K.t('graph.tooMany', { n: K.zahl(netzListe.length), max: K.NETZ_MAX }));
      return;
    }
    graphMeldung(null);

    var hinweisText = K.t('graph.overviewHint') + ' ' +
      (ausgeblendet ? K.t('graph.docsHidden', { n: K.zahl(ausgeblendet) }) + ' ' : '') +
      K.t('graph.controls');

    /* Unveraenderter Knotenbestand: nichts neu bauen — Hervorhebung und
       Legende nachfuehren, Ausschnitt der Nutzenden respektieren. */
    var v = verbindung();
    var sig = [v.graph, K.state.sprache]
      .concat(netzListe.map(function (e) { return e.uri; })).join('|');
    if (sig === letzteNetzSig && el.netz.getAttribute('data-modus') === 'netz') {
      el['graph-hinweis'].textContent = hinweisText;
      K.hervorhebungNetz();
      if (netzLegendeBauen) netzLegendeBauen();
      return;
    }
    letzteNetzSig = sig;
    schliesseGraphPanel(false);

    var knoten = [], kanten = [], nachPset = {};
    netzPsetDaten = {};
    netzListe.forEach(function (e) {
      var k = {
        id: 'o:' + e.uri, name: e.name, art: 'typ', klasse: 'g-dot-typ',
        farbe: '#2379a4' /* ob interaction-state */, form: 'kreis',
        r: 4 + Math.sqrt(e.anzahl) * 1.5,
        vorlesen: e.name + ', ' + e.anzahl + ' ' +
                  K.plural(e.anzahl, K.t('unit.attr'), K.t('unit.attrs')) + ', ' + e.quelle,
        zeilen: [e.quelle, e.anzahl + ' ' +
                 K.plural(e.anzahl, K.t('unit.attr'), K.t('unit.attrs'))],
        onClick: function () { zeigePanelTyp(e, 'o:' + e.uri); }
      };
      knoten.push(k);
      e.psets.forEach(function (p) {
        /* Schluessel = URI (namensgleiche Sets verschiedener Kataloge
           bleiben eigene Knoten); die Hervorhebung matcht den NAMEN —
           dort geht es um den fachlichen Begriff. */
        var schluessel = p.uri || 'name:' + p.name;
        var pk = nachPset[schluessel];
        if (!pk) {
          pk = nachPset[schluessel] = {
            id: 'p:' + schluessel, name: p.name, art: 'pset', klasse: 'g-dot-pset',
            farbe: '#46596b' /* ob secondary-hover */, form: 'quadrat',
            r: 5, stark: true, objekttypen: 0, merkmale: 0,
            onClick: (function (s, kid) {
              return function () { zeigePanelPset(s, kid); };
            })(schluessel, 'p:' + schluessel)
          };
          knoten.push(pk);
        }
        pk.objekttypen++;
        pk.merkmale += p.n;
        kanten.push({ a: k, b: pk, n: p.n });
      });
    });

    Object.keys(nachPset).forEach(function (s) {
      var pk = nachPset[s];
      pk.r = 5 + Math.sqrt(pk.objekttypen) * 2.2;
      pk.vorlesen = K.t('graph.psetVorlesen', { name: pk.name, t: pk.objekttypen, a: pk.merkmale });
      pk.zeilen = [K.t('graph.legendPset'),
                   K.t('graph.psetIn', { t: pk.objekttypen, a: pk.merkmale })];
      netzPsetDaten[s] = { name: pk.name, objekttypen: pk.objekttypen, merkmale: pk.merkmale };
    });

    netzLegendeBauen = function () {
      K.zeichneLegende([
        { name: K.t('graph.legendType'), n: netzListe.length, farbe: '#2379a4' },
        { name: K.t('graph.legendPset'), n: Object.keys(nachPset).length,
          farbe: '#46596b', form: 'quadrat' },
        K.state.hervor
          ? { hinweis: K.t('graph.highlighted', { name: K.state.hervor }),
              onDismiss: hebeNetzHervorAuf,
              ariaLabel: K.t('graph.highlightOff') }
          : { hinweis: K.t('graph.dotSize') }
      ]);
    };

    K.zeichneNetz(knoten, kanten, null, hinweisText, K.t('graph.contentTitle'));
    netzLegendeBauen();
  }

  /* --- Ein Objekttyp und seine Merkmale --- */

  function zeigeObjekttyp() {
    var st = K.state;
    var e = objekttypVon(st.objekttyp);
    if (!e) { K.geheZuUebersicht(); return; }

    /* Katalog und Reifegrad wirken hier nicht — nur zeigen, was filtert */
    facettenSichtbar(['phase']);
    el.filter.placeholder = K.t('search.phType');

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
        K.zeichneListe({ titel: e.name, spalten: [{ titel: K.t('col.attr') }], zeilen: [],
                         leerText: K.t('loading.attrs'), laedt: true });
      } else if (st.ansicht === 'galerie') {
        K.zeichneGalerie({ karten: [], leerText: K.t('loading.attrs'), laedt: true });
      } else {
        graphMeldung(K.t('loading.attrs'), '', true);
      }
      return;
    }

    var psets = {};
    merkmale.forEach(function (m) { psets[m.pset] = true; });
    var nPsets = Object.keys(psets).length;

    titel(e.name,
      K.zahl(merkmale.length) +
      (merkmale.length === e.anzahl ? ''
        : ' ' + K.t('common.ofTotal', { total: K.zahl(e.anzahl) })) +
      ' ' + K.plural(e.anzahl, K.t('unit.attr'), K.t('unit.attrs')) + ' · ' +
      nPsets + ' ' + K.plural(nPsets, K.t('unit.pset'), K.t('unit.psets')) + ' · ' + e.quelle,
      e.beschreibung, e.sprache);

    el.treffer.textContent = (suchbegriff() || st.facetten.phase.length)
      ? K.t('common.nOfTotal', { n: K.zahl(merkmale.length), total: K.zahl(e.anzahl) })
      : '';

    var aus = blaettere(merkmale.length);
    var seite = merkmale.slice(aus.von, aus.bis);
    var mitPhase = phasenspalteLohnt(merkmale, function (m) { return m.phasen.length; });

    if (st.ansicht === 'liste') {
      sichtbareAnsicht('liste');
      /* Beschreibung als eigene Spalte (wie in der Übersicht);
         Marken-Reihenfolge wie im Merkmaldetail: Property Set, Datentyp, Reifegrad */
      var spalten = [
        { titel: K.t('col.attr'), breite: '18%', sort: 'name' },
        { titel: K.t('col.description') },
        { titel: K.t('col.pset'), breite: '16%', sort: 'pset' },
        { titel: K.t('col.datatype'), breite: '90px', sort: 'typ' },
        { titel: K.t('col.status'), breite: '90px', sort: 'status' }
      ];
      if (mitPhase) spalten.push({ titel: K.t('col.milestone'), breite: '130px' });
      spalten.push({ titel: K.t('col.unitValues'), breite: '18%' });

      K.zeichneListe({
        titel: K.t('table.captionType', { name: e.name }),
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
                return K.leer(K.t('empty.description'));
              }
              var s = document.createElement('span');
              s.className = 'kbob-desc-text';
              s.textContent = m.beschreibung;
              return s;
            },
            function () { return psetZelle(e, m); },
            function () { return m.typ || K.leer(K.t('empty.type')); },
            function () { return statusText(m.status) || K.leer(K.t('empty.status')); }
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
                 m.liste && m.liste.anzahl ? m.liste.anzahl + ' ' + K.t('col.values') : '']
                 .filter(Boolean).join(' · '),
          onClick: function () { K.geheZuMerkmal(m.uri); }
        };
      }) });
    } else {
      sichtbareAnsicht('graph');
      if (!merkmale.length) {
        graphMeldung(K.t('graph.emptyTitle'), K.t('graph.emptyAttrs'), false, 'leer');
        return;
      }
      graphMeldung(null);
      el['graph-titel'].textContent = K.t('graph.attrsOf', { name: e.name });
      var radialSig = [verbindung().graph, st.sprache, e.uri]
        .concat(merkmale.map(function (m) { return m.uri; })).join('|');
      if (radialSig !== letzteRadialSig) schliesseGraphPanel(false);
      letzteRadialSig = radialSig;
      K.zeichneRadial(e, merkmale,
        K.t('graph.typeHint', { name: e.name }) + ' ' + K.t('graph.controls'),
        function (uri) {
          var m = null;
          (st.detail[e.uri] || []).forEach(function (kand) { if (kand.uri === uri) m = kand; });
          if (m) zeigePanelMerkmal(m, e, 'm:' + uri);
        }, radialSig);
    }
  }

  /* Scheitert die Detailabfrage, darf «wird geladen …» nicht stehen bleiben —
     dieselbe Regel wie beim Erstladen (Befund K1), eine Ebene tiefer. */
  function zeigeDetailFehler(e) {
    titel(e.name, K.t('errors.attrsLoadFailedMeta'), null, e.sprache);
    el.blaettern.hidden = true;
    /* Die Fehlerkachel steht im Listencontainer — Zustand und
       aria-pressed der Umschalter ziehen mit, statt zu widersprechen. */
    K.state.ansicht = 'liste';
    ansichtKnoepfe('liste');
    inUrl(true);
    sichtbareAnsicht('liste');

    el['view-liste'].innerHTML = '';
    var box = K.e('div', 'kbob-message');
    meldung(box, {
      titel: K.t('errors.attrsTitle'),
      text: K.state.detailFehler[e.uri],
      typ: 'error',
      aktion: { text: K.t('common.retry'), onClick: function () { ladeDetail(e.uri); } }
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
  var STATUS_ERKLAERUNG = { Candidate: 'status.candidate', Preview: 'status.preview' };
  function statusErklaerung(wert) {
    return STATUS_ERKLAERUNG[wert] ? K.t(STATUS_ERKLAERUNG[wert]) : '';
  }

  function statusMarke(wert) {
    if (!wert) return null;
    var t = document.createElement('span');
    t.className = 'kbob-tag';
    t.appendChild(K.text(wert, 'en'));   // Datenwerte sind englisch
    if (STATUS_ERKLAERUNG[wert]) t.title = statusErklaerung(wert);
    return t;
  }

  /* In Tabellenzellen schlichter Text — der Spaltenkopf beschriftet schon,
     eine Pillenform je Zeile wäre nur Rahmenwerk (eine Zeilenschrift). */
  function statusText(wert) {
    if (!wert) return null;
    var s = K.text(wert, 'en');
    if (STATUS_ERKLAERUNG[wert]) s.title = statusErklaerung(wert);
    return s;
  }

  /* Statt einer leeren Zeichenfläche: sagen, was zu tun ist —
     beziehungsweise mit drehendem Ring, dass etwas unterwegs ist. */
  function graphMeldung(titel, text, laedt, stil) {
    var zeigen = !!titel;
    el['graph-meldung'].hidden = !zeigen;
    el['graph-wrap'].hidden = zeigen;
    el['graph-hinweis'].hidden = zeigen;
    if (!zeigen) return;
    /* Die Textfassung darf den vorigen Graphen nicht ueberleben, und ein
       offenes Panel gehoert zu einem Graphen, der nicht mehr da ist. */
    el['graph-text'].innerHTML = '';
    schliesseGraphPanel(false);
    if (!laedt && stil === 'leer') {
      /* Leere Auswahl ist kein Alarm: dieselbe stille Zeile wie in Liste
         und Galerie statt einer blauen Alert-Kachel. */
      el['graph-meldung'].innerHTML = '';
      var z = K.e('p', 'kbob-no-results', titel + (text ? ' ' + text : ''));
      el['graph-meldung'].appendChild(z);
      return;
    }
    meldung(el['graph-meldung'], { titel: titel, text: text, laedt: laedt });
  }

  function typMarke(m) {
    if (!m.typ) return K.leer(K.t('empty.type'));
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
      w.textContent = K.t('values.count', { n: m.liste.anzahl, werte: K.kurzListe(m.liste.werte, 70) });
      box.appendChild(w);
      etwas = true;
    }
    return etwas ? box : K.leer(K.t('empty.unitValues'));
  }

  /* --- Ein Merkmal --- */

  function zeigeMerkmal() {
    var e = objekttypVon(K.state.objekttyp);
    var m = merkmalVon();
    if (!e || !m) { K.state.merkmal = null; zeichne(); return; }

    sichtbareAnsicht('merkmal');
    el.blaettern.hidden = true;   // die Blätterleiste gehört zur Liste darüber

    titel(m.name, e.name + ' · ' + m.pset + ' · ' + e.quelle, null, m.sprache);

    /* Abschnittsgliederung nach dem Muster der I14Y-Detailseiten:
       H2-Abschnitte, darunter fette Beschriftung über schlichtem Wert. */
    var ziel = el['merkmal-detail'];
    ziel.innerHTML = '';

    function abschnitt(name) {
      var s = K.e('section', 'kbob-detail-section');
      s.appendChild(K.e('h2', '', name));
      ziel.appendChild(s);
      return s;
    }

    /* Mit leerBedeutung erscheint die Zeile auch ohne Wert — als ehrliches
       «—» wie in der Tabelle. Ohne leerBedeutung entfällt sie ganz. */
    function zeile(dl, t, wert, leerBedeutung) {
      if (!wert && !leerBedeutung) return;
      var dt = document.createElement('dt');
      dt.textContent = t;
      var dd = document.createElement('dd');
      if (!wert) dd.appendChild(K.leer(leerBedeutung));
      else if (typeof wert === 'string') dd.textContent = wert;
      else dd.appendChild(wert);
      dl.appendChild(dt); dl.appendChild(dd);
    }

    var allg = abschnitt(K.t('detail.general'));
    var dlA = K.e('dl', 'kbob-data');
    allg.appendChild(dlA);
    zeile(dlA, K.t('col.description'),
          (m.beschreibung && m.beschreibung !== m.name) ? m.beschreibung : null,
          K.t('empty.description'));
    zeile(dlA, K.t('col.type'), K.text(e.name, e.sprache));
    zeile(dlA, K.t('col.pset'), psetZelle(e, m));
    zeile(dlA, K.t('col.catalog'), e.quelle);
    zeile(dlA, K.t('col.status'), statusMarke(m.status), K.t('empty.status'));

    /* IRI mit Kopierknopf, wie das I14Y-Permalink-Feld */
    var iri = K.e('span', 'kbob-copy');
    iri.appendChild(K.e('span', 'kbob-mono', m.uri));
    var kopier = K.knopf('ob-button ob-button-secondary ob-icon-button', null, function () {
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
    zeile(dlA, K.t('detail.iri'), iri);

    var typ = abschnitt(K.t('detail.typeUnit'));
    var dlT = K.e('dl', 'kbob-data');
    typ.appendChild(dlT);
    zeile(dlT, K.t('col.datatype'), typMarke(m));
    zeile(dlT, K.t('col.unit'), m.einheit, K.t('empty.unit'));
    zeile(dlT, K.t('col.ifcType'), m.ifcTyp);
    zeile(dlT, K.t('col.ifcPset'), m.ifcPset);

    var werte = abschnitt(K.t('col.values') +
      (m.liste && m.liste.anzahl ? ' (' + m.liste.anzahl + ')' : ''));
    if (m.liste && m.liste.anzahl) {
      werte.appendChild(K.e('p', 'kbob-values-list', m.liste.werte));
    } else {
      werte.appendChild(K.e('p', '', K.t('detail.noValues')));
    }

    if (K.state.allePhasen && K.state.allePhasen.length) {
      var loin = abschnitt(K.t('detail.milestones'));
      if (m.phasen.length) loin.appendChild(K.phasen(m.phasen, K.state.allePhasen));
      else loin.appendChild(K.e('p', '', K.t('detail.noMilestone')));
    }
  }

  /* ---------- Ansicht ---------- */

  function setzeAnsicht(name) {
    K.state.ansicht = name;
    ansichtKnoepfe(name);
    if (K.state.merkmal) K.state.merkmal = null;
    /* fluechtig heisst fluechtig: die Hervorhebung uebersteht keinen
       Ansichtswechsel — wie beim Zurueck-Knopf (ausUrl) */
    K.state.hervor = null;
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
  function objektBlattKopf() {
    return [K.t('col.type'), K.t('col.description'), K.t('col.status'), K.t('col.catalog'),
            K.t('col.attrCount'), K.t('col.psets'), K.t('col.milestones'), K.t('col.typeUri')];
  }
  var OBJEKT_BREITEN = [32, 70, 12, 30, 16, 44, 22, 56];

  function merkmalBlattKopf() {
    return [K.t('col.type'), K.t('col.attr'), K.t('col.description'), K.t('col.pset'),
            K.t('col.datatype'), K.t('col.datatypeRaw'), K.t('col.unit'), K.t('col.values'),
            K.t('col.status'), K.t('col.ifcPset'), K.t('col.ifcType'), K.t('col.milestones'),
            K.t('col.attrUri')];
  }
  var MERKMAL_BREITEN = [30, 30, 70, 24, 12, 17, 9, 56, 12, 24, 16, 22, 56];

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
      [K.t('export.source'), K.t('export.sourceValue')],
      [K.t('connection.endpoint'), v.endpoint],
      [K.t('connection.graph'), v.graph],
      [K.t('export.language'), v.sprache.toUpperCase()],
      [K.t('export.date'), new Date().toLocaleDateString(K.locale())],
      [K.t('overview.title'), nObjekte],
      [K.t('col.attrs'), nMerkmale]
    ];
    if (el.filter.value.trim()) zeilen.push([K.t('export.filterSearch'), el.filter.value.trim()]);
    if (st.facetten.katalog.length) zeilen.push([K.t('export.filterCatalog'), st.facetten.katalog.join(', ')]);
    if (st.facetten.status.length) zeilen.push([K.t('export.filterStatus'), st.facetten.status.join(', ')]);
    if (st.facetten.phase.length) zeilen.push([K.t('export.filterMilestone'), st.facetten.phase.join(', ')]);
    zeilen.push([K.t('export.app'), 'https://github.com/bbl-dres/kbob-data']);
    return { name: K.t('export.sheetInfo'), kopf: [K.t('export.key'), K.t('export.value')],
             zeilen: zeilen, breiten: [28, 70] };
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
      { name: K.t('export.sheetTypes'), kopf: objektBlattKopf(), breiten: OBJEKT_BREITEN,
        zeilen: objekte.map(objektZeile) },
      { name: K.t('export.sheetAttrs'), kopf: merkmalBlattKopf(), breiten: MERKMAL_BREITEN,
        zeilen: merkmalZeilen },
      infoBlatt(objekte.length, merkmalZeilen.length)
    ]), dateiname);

    setStatus(K.t('export.done', {
                types: K.zahl(objekte.length) + ' ' +
                       K.plural(objekte.length, K.t('unit.type'), K.t('unit.types')),
                attrs: K.zahl(merkmalZeilen.length)
              }) + (ohneWerte ? ' ' + K.t('export.doneNoValues') : ''),
              ohneWerte);
  }

  /* Ein Objekttyp: sofort aus dem Zwischenspeicher. Die ganze Auswahl: alle
     Merkmale kommen in EINER Abfrage (K.holeAlleDetails) — ein Limit braucht
     der Export darum nicht mehr. */
  function exportiereExcel() {
    var st = K.state;

    /* Auf der Objekttyp-Ebene wird genau dieser Objekttyp exportiert —
       fehlt sein Detail noch, wird es erst geholt, statt still in den
       Gesamtkatalog-Zweig zu fallen. */
    if (st.objekttyp) {
      var e = objekttypVon(st.objekttyp);
      if (!e) return;
      if (st.detail[e.uri]) {
        speichereMappe([e], 'kbob-' + K.dateiname(e.name) + '.xlsx');
        return;
      }
      el.csv.disabled = true;
      busy(true, K.t('loading.attrsOf', { name: e.name }));
      var genTyp = st.generation;
      K.holeDetail(verbindung(), e.uri).then(function () {
        el.csv.disabled = false;
        if (genTyp !== st.generation) return;
        speichereMappe([e], 'kbob-' + K.dateiname(e.name) + '.xlsx');
      }).catch(function (err) {
        el.csv.disabled = false;
        if (genTyp !== st.generation) return;
        setStatus(K.t('export.abort', { err: fehlerText(err) }), true);
      });
      return;
    }

    var auswahl = sichtbareObjekttypen();
    if (!auswahl.length) {
      setStatus(K.t('export.empty'), true);
      return;
    }

    var fehlt = auswahl.some(function (e) { return !st.detail[e.uri]; });
    if (!fehlt) {
      speichereMappe(auswahl, 'kbob-' + K.dateiname('data-dictionary') + '.xlsx');
      return;
    }

    el.csv.disabled = true;
    busy(true, K.t('export.loading'));
    var gen = st.generation;

    K.holeAlleDetails(verbindung()).then(function () {
      el.csv.disabled = false;
      if (gen !== st.generation) {
        setStatus(K.t('export.abortReload'), true);
        return;
      }
      speichereMappe(auswahl, 'kbob-' + K.dateiname('data-dictionary') + '.xlsx');
    }).catch(function (err) {
      el.csv.disabled = false;
      if (gen !== st.generation) return;
      setStatus(K.t('export.abort', { err: fehlerText(err) }), true);
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

    el.neuladen.addEventListener('click', laden);

    el.zurueck.addEventListener('click', function () {
      if (K.state.merkmal) K.geheZuObjekttyp(K.state.objekttyp);
      else K.geheZuUebersicht();
    });

    /* Sprachwahl betrifft die Katalogbeschriftungen: neue Sprache heisst
       neue Abfragen — der Katalog wird neu geladen. */
    el.sprache.addEventListener('change', function () {
      K.state.sprache = el.sprache.value;
      K.uebersetzeStatisch();
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

    window.addEventListener('popstate', function () {
      if (!ausUrl()) zeichne();   // bei Sprachwechsel zeichnet laden() selbst
    });

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

    /* Graph-Hooks: Klick auf freie Flaeche schliesst das Panel; Escape
       schliesst Panel oder hebt die Hervorhebung auf. */
    K.graphHintergrund = function () { schliesseGraphPanel(false); };
    K.graphEscape = function () {
      if (!el['graph-panel'].hidden) { schliesseGraphPanel(true); return true; }
      if (K.state.hervor && !K.state.objekttyp) { hebeNetzHervorAuf(); return true; }
      return false;
    };

    K.grafikSteuerung();

    /* Die Sprache muss vor dem ersten Laden aus der URL kommen —
       sie bestimmt bereits die Übersichtsabfrage. */
    var l = /[#&]l=(de|fr|it|en)(&|$)/.exec(location.hash);
    if (l) { K.state.sprache = l[1]; el.sprache.value = l[1]; }

    /* Statische Beschriftungen, sobald das Wörterbuch da ist */
    K.i18nBereit.then(K.uebersetzeStatisch);
  }

  verdrahten();
  laden();      // ohne Klick: der Katalog ist beim Öffnen schon da
})(KBOB);
