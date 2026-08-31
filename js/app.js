/* Navigation, Filter und Start.

   Der Pfad Quelle → Objekttyp → Attribut steuert, was gezeigt wird. Jede Stufe
   laesst sich als Liste, Galerie oder Grafik ansehen. Attribute werden erst
   geholt, wenn ein Objekttyp geoeffnet wird. */

var KBOB = window.KBOB || (window.KBOB = {});

(function (K) {
  'use strict';

  K.state = {
    elemente: [],       // L1: Objekttypen mit Kennzahlen
    quellen: [],        // aus den Objekttypen abgeleitet
    werte: {},          // Wertelisten, einmalig nachgeladen
    werteGeladen: false,
    detail: {},         // Objekttyp-URI -> Attribute
    rohUebersicht: null,
    pfad: { quelle: null, objekttyp: null, attribut: null },
    ansicht: 'liste',
    hervor: null,
    laedt: 0
  };

  var el = K.el = {};
  ['endpoint', 'graph', 'status', 'spinner', 'krumen', 'toolbar', 'empty',
   'view-liste', 'view-galerie', 'view-grafik', 'view-attribut', 'galerie',
   'count', 'filter', 'csv', 'netz', 'legende', 'tip', 'graph-hinweis',
   'neuladen', 'f-phase', 'f-typ', 'attribut-detail'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  function setStatus(text, isError, mode) {
    el.status.className = 'status' + (isError ? ' error' : '');
    el.status.textContent = '';
    if (mode) {
      var tag = document.createElement('span');
      tag.className = 'mode';
      tag.textContent = mode;
      el.status.appendChild(tag);
    }
    el.status.appendChild(document.createTextNode(text));
  }
  K.setStatus = setStatus;

  /* ---------- Ladeanzeige ---------- */

  function busy(an, text) {
    K.state.laedt += an ? 1 : -1;
    if (K.state.laedt < 0) K.state.laedt = 0;
    var laeuft = K.state.laedt > 0;
    el.spinner.hidden = !laeuft;
    el.spinner.textContent = '';
    if (laeuft) {
      var ring = document.createElement('span');
      ring.className = 'ring';
      el.spinner.appendChild(ring);
      el.spinner.appendChild(document.createTextNode(text || 'Wird geladen …'));
    }
    document.body.classList.toggle('laedt', laeuft);
  }
  K.busy = busy;

  /* ---------- Laden ---------- */

  function endpunkt() { return el.endpoint.value.trim(); }
  function graphUri() { return el.graph.value.trim(); }

  function laden() {
    if (!endpunkt() || !graphUri()) { setStatus('Endpunkt und Graph ausfüllen.', true); return; }

    el.neuladen.disabled = true;
    busy(true, 'Katalog wird geladen …');
    setStatus('Katalog wird geladen …');

    K.run(endpunkt(), K.uebersichtQuery(graphUri())).then(function (json) {
      var rows = json.results.bindings;
      busy(false);
      el.neuladen.disabled = false;

      if (!rows.length) {
        setStatus('Der Graph ' + graphUri() + ' liefert keine Datentemplates. ' +
                  'Möglicherweise ist er noch nicht befüllt.', true);
        return;
      }
      K.uebernehmeUebersicht(rows);
      baueQuellen();
      baueFilter();
      zeigeKatalog();
    }).catch(function (err) {
      busy(false);
      el.neuladen.disabled = false;
      var msg = String(err && err.message || err);
      if (/Failed to fetch|NetworkError|CORS/i.test(msg)) {
        setStatus('Der Browser kommt nicht an den Endpunkt — vermutlich CORS. ' +
                  'Starte lindas-proxy.py und rufe http://localhost:8765 auf.', true);
      } else {
        setStatus('Laden fehlgeschlagen: ' + msg, true);
      }
    });
  }

  /* Quellen aus den Objekttypen ableiten */
  function baueQuellen() {
    var map = {};
    K.state.elemente.forEach(function (e) {
      var q = map[e.quelle];
      if (!q) {
        q = map[e.quelle] = {
          name: e.quelle, objekttypen: 0, attribute: 0,
          psets: {}, typen: [], istDokument: e.istDokument
        };
      }
      q.objekttypen++;
      q.attribute += e.anzahl;
      e.psets.forEach(function (p) { q.psets[p.name] = (q.psets[p.name] || 0) + p.n; });
      e.typen.forEach(function (t) { if (q.typen.indexOf(t) === -1) q.typen.push(t); });
    });

    K.state.quellen = Object.keys(map).map(function (n) {
      var q = map[n];
      q.typen.sort();
      q.psetListe = Object.keys(q.psets).sort(function (a, b) { return a.localeCompare(b, 'de'); })
        .map(function (p) { return { name: p, n: q.psets[p] }; });
      return q;
    }).sort(function (a, b) { return b.objekttypen - a.objekttypen; });
  }

  function zeigeKatalog() {
    el.empty.hidden = true;
    el.toolbar.hidden = false;
    el.csv.disabled = false;

    var st = K.state;
    var objekttypen = st.elemente.length;
    var attribute = st.elemente.reduce(function (s, e) { return s + e.anzahl; }, 0);
    var mitPhase = st.elemente.filter(function (e) { return e.phasen.length; }).length;

    var text = K.zahl(st.quellen.length) + ' Quellen, ' + K.zahl(objekttypen) + ' Objekttypen, ' +
               K.zahl(attribute) + ' Attribute. Die Attribute eines Objekttyps werden ' +
               'erst beim Öffnen geladen.';
    if (mitPhase) {
      text += ' Eine Phase (LZP) deklarieren nur ' + K.zahl(mitPhase) + ' Objekttypen.';
    }
    setStatus(text, false, 'Katalog');

    zeichne();
  }

  /* ---------- Filter ---------- */

  function option(sel, wert, text) {
    var o = document.createElement('option');
    o.value = wert;
    o.textContent = text;
    sel.appendChild(o);
  }

  function baueFilter() {
    var phasen = {}, typen = {};
    var vorher = { phase: el['f-phase'].value, typ: el['f-typ'].value };

    K.state.elemente.forEach(function (e) {
      e.typen.forEach(function (t) { typen[t] = true; });
      e.phasen.forEach(function (p) { phasen[p] = true; });
    });

    el['f-phase'].innerHTML = '';
    option(el['f-phase'], '', 'Alle Phasen');
    Object.keys(phasen).sort().forEach(function (p) { option(el['f-phase'], p, p); });

    el['f-typ'].innerHTML = '';
    option(el['f-typ'], '', 'Alle Typen');
    Object.keys(typen).sort(function (a, b) { return a.localeCompare(b, 'de'); })
      .forEach(function (t) { option(el['f-typ'], t, t); });

    wiederherstellen(el['f-phase'], vorher.phase);
    wiederherstellen(el['f-typ'], vorher.typ);
  }

  function wiederherstellen(sel, wert) {
    if (!wert) return;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === wert) { sel.value = wert; return; }
    }
  }

  function suchbegriff() { return el.filter.value.trim().toLowerCase(); }

  /* ---------- Navigation ---------- */

  K.geheZuKatalog = function () {
    K.state.pfad = { quelle: null, objekttyp: null, attribut: null };
    K.state.hervor = null;
    zeichne();
  };

  K.geheZuQuelle = function (name) {
    K.state.pfad = { quelle: name, objekttyp: null, attribut: null };
    K.state.hervor = null;
    zeichne();
  };

  K.geheZuObjekttyp = function (uri) {
    var e = objekttypVon(uri);
    if (!e) return;
    K.state.pfad = { quelle: e.quelle, objekttyp: uri, attribut: null };
    K.state.hervor = null;

    if (K.state.detail[uri]) { zeichne(); return; }

    busy(true, 'Attribute von ' + e.name + ' werden geladen …');
    zeichne();                       // Krumen und Kopf sofort zeigen
    K.holeDetail(endpunkt(), graphUri(), uri).then(function () {
      busy(false);
      zeichne();
    }).catch(function (err) {
      busy(false);
      setStatus('Attribute konnten nicht geladen werden: ' +
                String(err && err.message || err), true);
    });
  };

  K.geheZuAttribut = function (attrUri) {
    K.state.pfad.attribut = attrUri;
    zeichne();
  };

  function objekttypVon(uri) {
    var t = K.state.elemente.filter(function (e) { return e.uri === uri; });
    return t.length ? t[0] : null;
  }

  /* ---------- Auswahl je Stufe ---------- */

  function sichtbareQuellen() {
    var s = suchbegriff();
    var typ = el['f-typ'].value;
    return K.state.quellen.filter(function (q) {
      if (typ && q.typen.indexOf(typ) === -1) return false;
      if (!s) return true;
      return q.name.toLowerCase().indexOf(s) !== -1;
    });
  }

  function sichtbareObjekttypen(quelle) {
    var s = suchbegriff();
    var phase = el['f-phase'].value;
    var typ = el['f-typ'].value;
    return K.state.elemente.filter(function (e) {
      if (quelle && e.quelle !== quelle) return false;
      if (phase && e.phasen.indexOf(phase) === -1) return false;
      if (typ && e.typen.indexOf(typ) === -1) return false;
      if (!s) return true;
      if (e.name.toLowerCase().indexOf(s) !== -1) return true;
      return e.psets.some(function (p) { return p.name.toLowerCase().indexOf(s) !== -1; });
    });
  }

  function sichtbareAttribute(uri) {
    var attrs = K.state.detail[uri];
    if (!attrs) return null;                 // noch nicht geladen
    var s = suchbegriff();
    var phase = el['f-phase'].value;
    var typ = el['f-typ'].value;
    return attrs.filter(function (a) {
      if (phase && a.phasen.indexOf(phase) === -1) return false;
      if (typ && a.typ !== typ) return false;
      if (!s) return true;
      var heu = (a.name + ' ' + a.pset + ' ' + a.beschreibung + ' ' + a.ifcTyp).toLowerCase();
      return heu.indexOf(s) !== -1;
    });
  }

  /* ---------- Brotkrumen ---------- */

  function krume(text, onClick, aktiv) {
    if (aktiv || !onClick) {
      var s = document.createElement('span');
      s.className = 'krume aktiv';
      s.textContent = text;
      return s;
    }
    var a = document.createElement('button');
    a.className = 'krume';
    a.type = 'button';
    a.textContent = text;
    a.addEventListener('click', onClick);
    return a;
  }

  function trenner() {
    var s = document.createElement('span');
    s.className = 'krume-trenner';
    s.textContent = '›';
    return s;
  }

  function zeichneKrumen() {
    var p = K.state.pfad;
    var box = el.krumen;
    box.innerHTML = '';

    box.appendChild(krume('Katalog', K.geheZuKatalog, !p.quelle));

    if (p.quelle) {
      box.appendChild(trenner());
      box.appendChild(krume(p.quelle, function () { K.geheZuQuelle(p.quelle); }, !p.objekttyp));
    }
    if (p.objekttyp) {
      var e = objekttypVon(p.objekttyp);
      box.appendChild(trenner());
      box.appendChild(krume(e ? e.name : '…', function () { K.geheZuObjekttyp(p.objekttyp); }, !p.attribut));
    }
    if (p.attribut) {
      var a = attributVon();
      box.appendChild(trenner());
      box.appendChild(krume(a ? a.name : '…', null, true));
    }
  }

  function attributVon() {
    var p = K.state.pfad;
    var attrs = p.objekttyp ? K.state.detail[p.objekttyp] : null;
    if (!attrs) return null;
    var t = attrs.filter(function (a) { return a.uri === p.attribut; });
    return t.length ? t[0] : null;
  }

  /* ---------- Zeichnen ---------- */

  function zeichne() {
    if (!K.state.elemente.length) return;
    var p = K.state.pfad;

    zeichneKrumen();
    el['view-attribut'].hidden = true;

    if (p.attribut)      zeigeAttribut();
    else if (p.objekttyp)  zeigeObjekttyp();
    else if (p.quelle)   zeigeObjekttypen(p.quelle);
    else                 zeigeQuellen();
  }
  K.zeichne = zeichne;

  function sichtbareAnsicht(name) {
    ['liste', 'galerie', 'grafik'].forEach(function (v) {
      el['view-' + v].hidden = (v !== name);
    });
  }

  /* --- Stufe Quellen --- */

  function zeigeQuellen() {
    var quellen = sichtbareQuellen();
    var attribute = quellen.reduce(function (s, q) { return s + q.attribute; }, 0);
    el.count.textContent = K.zahl(quellen.length) + ' Quellen, ' +
      K.zahl(quellen.reduce(function (s, q) { return s + q.objekttypen; }, 0)) + ' Objekttypen, ' +
      K.zahl(attribute) + ' Attribute';

    if (K.state.ansicht === 'liste') {
      sichtbareAnsicht('liste');
      K.zeichneListe({
        spalten: [
          { titel: 'Quelle', breite: '34%' },
          { titel: 'Objekttypen', breite: '10%', rechts: true },
          { titel: 'Attribute', breite: '10%', rechts: true },
          { titel: 'Property Sets' }
        ],
        zeilen: quellen.map(function (q) {
          return {
            titel: 'Objekttypen von ' + q.name + ' anzeigen',
            onClick: function () { K.geheZuQuelle(q.name); },
            zellen: [
              function () {
                var s = document.createElement('span');
                s.className = 'element-name';
                s.textContent = q.name;
                return s;
              },
              function () { return String(q.objekttypen); },
              function () { return String(q.attribute); },
              function () {
                return K.chips(q.psetListe.slice(0, 6).map(function (p) {
                  return { name: p.name, n: p.n };
                }).concat(q.psetListe.length > 6
                  ? [{ name: '+ ' + (q.psetListe.length - 6) + ' weitere' }] : []));
              }
            ]
          };
        })
      });
    } else if (K.state.ansicht === 'galerie') {
      sichtbareAnsicht('galerie');
      K.zeichneGalerie(quellen.map(function (q) {
        return {
          name: q.name, zahl: q.objekttypen, zahlTitel: q.objekttypen + ' Objekttypen',
          sub: K.zahl(q.attribute) + ' Attribute · ' + q.psetListe.length + ' Property Sets',
          chips: q.psetListe.slice(0, 5).map(function (p) {
            return { name: p.name, n: p.n };
          }),
          fuss: q.typen.join(' · '),
          onClick: function () { K.geheZuQuelle(q.name); }
        };
      }));
    } else {
      sichtbareAnsicht('grafik');
      quellenNetz(quellen);
    }
  }

  /* Ganzer Katalog: Quellen und ihre Objekttypen */
  function quellenNetz(quellen) {
    var knoten = [], kanten = [], nachQuelle = {};
    var namen = {};
    quellen.forEach(function (q) { namen[q.name] = true; });

    quellen.forEach(function (q) {
      var k = {
        id: 'q:' + q.name, name: q.name, farbe: '#B4471F', form: 'quadrat',
        r: 7 + Math.sqrt(q.objekttypen) * 1.7, immerBeschriften: true,
        titelZeilen: [q.objekttypen + ' Objekttypen, ' + q.attribute + ' Attribute',
                      'klicken öffnet die Quelle'],
        onClick: function () { K.geheZuQuelle(q.name); }
      };
      nachQuelle[q.name] = k;
      knoten.push(k);
    });

    sichtbareObjekttypen(null).forEach(function (e) {
      if (!namen[e.quelle]) return;
      var k = {
        id: 'e:' + e.uri, name: e.name, farbe: '#0F5C4E', form: 'kreis',
        r: 3.5 + Math.sqrt(e.anzahl) * 1.1,
        titelZeilen: [e.quelle, e.anzahl + ' Attribute — klicken öffnet den Objekttyp'],
        onClick: function () { K.geheZuObjekttyp(e.uri); }
      };
      knoten.push(k);
      kanten.push({ a: nachQuelle[e.quelle], b: k });
    });

    K.zeichneNetz(knoten, kanten, [
      { name: 'Quelle', n: quellen.length, farbe: '#B4471F', form: 'quadrat' },
      { name: 'Objekttyp', n: knoten.length - quellen.length, farbe: '#0F5C4E' },
      { hinweis: 'Punktgrösse = Anzahl Attribute' }
    ], 'Der ganze Katalog: Quellen und ihre Objekttypen. Auf einen Objekttyp klicken ' +
       'öffnet seine Attribute. Mausrad zoomt, Ziehen verschiebt.');
  }

  /* --- Stufe Objekttypen einer Quelle --- */

  function zeigeObjekttypen(quelle) {
    var objekttypen = sichtbareObjekttypen(quelle);
    el.count.textContent = K.zahl(objekttypen.length) + ' Objekttypen, ' +
      K.zahl(objekttypen.reduce(function (s, e) { return s + e.anzahl; }, 0)) + ' Attribute';

    if (K.state.ansicht === 'liste') {
      sichtbareAnsicht('liste');
      K.zeichneListe({
        spalten: [
          { titel: 'Objekttyp', breite: '26%' },
          { titel: 'Attribute', breite: '10%', rechts: true },
          { titel: 'Property Sets', breite: '40%' },
          { titel: 'Typen' }
        ],
        zeilen: objekttypen.map(function (e) {
          return {
            id: K.anker(e.uri),
            titel: 'Attribute von ' + e.name + ' anzeigen',
            onClick: function () { K.geheZuObjekttyp(e.uri); },
            zellen: [
              function () {
                var s = document.createElement('span');
                s.className = 'element-name';
                s.textContent = e.name;
                return s;
              },
              function () { return String(e.anzahl); },
              function () {
                return K.chips(e.psets.map(function (p) {
                  return { name: p.name, n: p.n };
                }));
              },
              function () {
                if (!e.typen.length) return K.leer();
                var s = document.createElement('span');
                s.className = 'zell-muted';
                s.textContent = e.typen.join(' · ');
                return s;
              }
            ]
          };
        })
      });
    } else if (K.state.ansicht === 'galerie') {
      sichtbareAnsicht('galerie');
      K.zeichneGalerie(objekttypen.map(function (e) {
        return {
          id: K.anker(e.uri),
          name: e.name, zahl: e.anzahl, zahlTitel: e.anzahl + ' Attribute',
          sub: e.quelle,
          chips: e.psets.map(function (p) {
            return { name: p.name, n: p.n };
          }),
          fuss: e.typen.length ? e.typen.join(' · ') : 'ohne Typangabe',
          onClick: function () { K.geheZuObjekttyp(e.uri); }
        };
      }));
    } else {
      sichtbareAnsicht('grafik');
      objekttypNetz(objekttypen);
    }
  }

  /* Objekttypen einer Quelle und die Property Sets, die sie teilen */
  function objekttypNetz(objekttypen) {
    var knoten = [], kanten = [], nachPset = {};

    objekttypen.forEach(function (e) {
      var k = {
        id: 'e:' + e.uri, name: e.name, farbe: '#0F5C4E', form: 'kreis',
        r: 4 + Math.sqrt(e.anzahl) * 1.5,
        titelZeilen: [e.quelle, e.anzahl + ' Attribute — klicken öffnet den Objekttyp'],
        onClick: function () { K.geheZuObjekttyp(e.uri); }
      };
      knoten.push(k);

      e.psets.forEach(function (p) {
        var pk = nachPset[p.name];
        if (!pk) {
          pk = nachPset[p.name] = {
            id: 'p:' + p.name, name: p.name, farbe: '#B4471F', form: 'quadrat',
            r: 5, objekttypen: 0, attribute: 0, immerBeschriften: true,
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
        pk.attribute += p.n;
        kanten.push({ a: k, b: pk });
      });
    });

    Object.keys(nachPset).forEach(function (n) {
      var pk = nachPset[n];
      pk.r = 5 + Math.sqrt(pk.objekttypen) * 2.2;
      pk.titelZeilen = ['Property Set',
                        'in ' + pk.objekttypen + ' Objekttypen, ' + pk.attribute + ' Attribute',
                        'klicken hebt die Objekttypen hervor'];
    });

    K.zeichneNetz(knoten, kanten, [
      { name: 'Objekttyp', n: objekttypen.length, farbe: '#0F5C4E' },
      { name: 'Property Set', n: Object.keys(nachPset).length, farbe: '#B4471F', form: 'quadrat' },
      { hinweis: K.state.hervor
          ? 'Hervorgehoben: ' + K.state.hervor + ' — nochmals klicken hebt auf'
          : 'Punktgrösse = Anzahl Attribute bzw. Objekttypen' }
    ], 'Objekttypen dieser Quelle und die Property Sets, die sie verbinden. ' +
       'Auf einen Objekttyp klicken öffnet seine Attribute.');
  }

  /* --- Stufe Attribute eines Objekttyps --- */

  function zeigeObjekttyp() {
    var e = objekttypVon(K.state.pfad.objekttyp);
    if (!e) { K.geheZuKatalog(); return; }

    var attrs = sichtbareAttribute(e.uri);

    if (attrs === null) {                       // noch am Laden
      el.count.textContent = 'Attribute werden geladen …';
      sichtbareAnsicht(K.state.ansicht);
      if (K.state.ansicht === 'liste') {
        K.zeichneListe({ spalten: [{ titel: 'Attribut' }], zeilen: [],
                         leerText: 'Attribute werden geladen …' });
      } else if (K.state.ansicht === 'galerie') {
        K.zeichneGalerie([], 'Attribute werden geladen …');
      } else {
        K.el['graph-hinweis'].textContent = 'Attribute werden geladen …';
        K.el.netz.innerHTML = '';
        K.el.legende.innerHTML = '';
      }
      return;
    }

    el.count.textContent = K.zahl(attrs.length) + ' von ' + K.zahl(e.anzahl) + ' Attributen';

    if (K.state.ansicht === 'liste') {
      sichtbareAnsicht('liste');
      K.zeichneListe({
        spalten: [
          { titel: 'Attribut', breite: '32%' },
          { titel: 'Typ', breite: '11%' },
          { titel: 'Property Set', breite: '24%' },
          { titel: 'Einheit / Werte' }
        ],
        zeilen: attrs.map(function (a) {
          return {
            titel: a.name + ' im Detail',
            onClick: function () { K.geheZuAttribut(a.uri); },
            zellen: [
              function () {
                var box = document.createDocumentFragment();
                var nm = document.createElement('span');
                nm.className = 'attr-name';
                nm.textContent = a.name;
                box.appendChild(nm);
                if (a.beschreibung && a.beschreibung !== a.name) {
                  var de = document.createElement('span');
                  de.className = 'attr-desc';
                  de.textContent = a.beschreibung;
                  box.appendChild(de);
                }
                return box;
              },
              function () { return typChip(a); },
              function () { return psetZelle(e, a); },
              function () { return einheitZelle(a); }
            ]
          };
        })
      });
    } else if (K.state.ansicht === 'galerie') {
      sichtbareAnsicht('galerie');
      K.zeichneGalerie(attrs.map(function (a) {
        return {
          name: a.name,
          sub: a.beschreibung && a.beschreibung !== a.name
                 ? K.gekuerzt(a.beschreibung, 120) : '',
          chips: [{ name: a.pset, farbe: e.farbe[a.pset] }]
                   .concat(a.typ ? [{ name: a.typ }] : []),
          fuss: [a.einheit, a.ifcTyp,
                 a.liste && a.liste.anzahl ? a.liste.anzahl + ' Werte' : '']
                  .filter(Boolean).join(' · '),
          onClick: function () { K.geheZuAttribut(a.uri); }
        };
      }));
    } else {
      sichtbareAnsicht('grafik');
      K.zeichneRadial(e, attrs,
        'Die Attribute von ' + e.name + ', gruppiert nach Property Set. ' +
        'Auf ein Attribut klicken zeigt es im Detail.');
    }
  }

  function typChip(a) {
    if (!a.typ) return K.leer();
    var tp = document.createElement('span');
    tp.className = 'typ' + (a.typ === 'Auswahl' ? ' auswahl' : '');
    tp.textContent = a.typ;
    if (a.ifcTyp) tp.title = 'IFC-Datentyp: ' + a.ifcTyp;
    return tp;
  }

  function psetZelle(e, a) {
    var box = document.createElement('span');
    box.className = 'pset';
    var sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = e.farbe[a.pset] || 'var(--rule)';
    box.appendChild(sw);
    var pn = document.createElement('span');
    pn.className = 'pset-name';
    pn.textContent = a.pset;
    if (a.ifcPset) {
      var ip = document.createElement('span');
      ip.className = 'pset-ifc';
      ip.textContent = 'IFC: ' + a.ifcPset;
      pn.appendChild(ip);
    }
    box.appendChild(pn);
    return box;
  }

  function einheitZelle(a) {
    var box = document.createDocumentFragment();
    var etwas = false;
    if (a.einheit) {
      var eh = document.createElement('span');
      eh.className = 'einheit';
      eh.textContent = a.einheit;
      box.appendChild(eh);
      etwas = true;
    }
    if (a.liste && a.liste.anzahl) {
      var w = document.createElement('span');
      w.className = 'werte';
      var n = document.createElement('span');
      n.className = 'n';
      n.textContent = a.liste.anzahl + ' Werte: ';
      w.appendChild(n);
      w.appendChild(document.createTextNode(K.gekuerzt(a.liste.werte, 70)));
      w.title = a.liste.werte;
      box.appendChild(w);
      etwas = true;
    }
    return etwas ? box : K.leer();
  }

  /* --- Stufe einzelnes Attribut --- */

  function zeigeAttribut() {
    var e = objekttypVon(K.state.pfad.objekttyp);
    var a = attributVon();
    if (!e || !a) { K.state.pfad.attribut = null; zeichne(); return; }

    sichtbareAnsicht(null);
    el['view-attribut'].hidden = false;
    el.count.textContent = '';

    var ziel = el['attribut-detail'];
    ziel.innerHTML = '';

    var h = document.createElement('h2');
    h.textContent = a.name;
    ziel.appendChild(h);

    if (a.beschreibung && a.beschreibung !== a.name) {
      var p = document.createElement('p');
      p.className = 'attribut-beschreibung';
      p.textContent = a.beschreibung;
      ziel.appendChild(p);
    }

    var dl = document.createElement('dl');
    dl.className = 'daten';

    function zeile(titel, wert, mono) {
      if (!wert) return;
      var dt = document.createElement('dt');
      dt.textContent = titel;
      var dd = document.createElement('dd');
      if (mono) dd.className = 'mono';
      if (typeof wert === 'string') dd.textContent = wert;
      else dd.appendChild(wert);
      dl.appendChild(dt);
      dl.appendChild(dd);
    }

    zeile('Objekttyp', e.name);
    zeile('Quelle', e.quelle);
    zeile('Property Set', psetZelle(e, a));
    zeile('Typ', typChip(a));
    zeile('IFC-Datentyp', a.ifcTyp);
    zeile('IFC-Property-Set', a.ifcPset);
    zeile('Einheit', a.einheit);
    if (a.liste && a.liste.anzahl) {
      zeile('Zulässige Werte (' + a.liste.anzahl + ')', a.liste.werte);
    }
    zeile('Phasen', a.phasen.length ? a.phasen.join(' · ') : '');
    zeile('URI', a.uri, true);

    ziel.appendChild(dl);
  }

  /* ---------- Ansicht umschalten ---------- */

  function setzeAnsicht(name) {
    K.state.ansicht = name;
    ['liste', 'galerie', 'grafik'].forEach(function (v) {
      document.getElementById('v-' + v).setAttribute('aria-pressed', String(v === name));
    });
    if (K.state.pfad.attribut) K.state.pfad.attribut = null;   // Detail verlassen
    zeichne();
  }
  K.setzeAnsicht = setzeAnsicht;

  /* ---------- CSV ---------- */

  function toCsv() {
    var sep = ';';
    function zelle(w) {
      var s = w == null ? '' : String(w);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    var p = K.state.pfad, zeilen, name;

    if (p.objekttyp && K.state.detail[p.objekttyp]) {
      var e = objekttypVon(p.objekttyp);
      var attrs = sichtbareAttribute(p.objekttyp) || [];
      zeilen = [['Objekttyp', 'Quelle', 'Attribut', 'Attribut-URI', 'Beschreibung', 'Typ',
                 'Property Set', 'IFC-Property-Set', 'Einheit', 'Zulässige Werte',
                 'IFC-Datentyp', 'Phasen'].join(sep)];
      attrs.forEach(function (a) {
        zeilen.push([
          zelle(e.name), zelle(e.quelle), zelle(a.name), zelle(a.uri),
          zelle(a.beschreibung), zelle(a.typ), zelle(a.pset), zelle(a.ifcPset),
          zelle(a.einheit), zelle(a.liste ? a.liste.werte : ''),
          zelle(a.ifcTyp), zelle(a.phasen.join(' '))
        ].join(sep));
      });
      name = 'kbob-' + e.name.replace(/[^\wäöüÄÖÜß]+/g, '-').toLowerCase() + '.csv';
    } else {
      var objekttypen = sichtbareObjekttypen(p.quelle);
      zeilen = [['Objekttyp', 'Objekttyp-URI', 'Quelle', 'Attribute', 'Property Sets',
                 'Typen', 'Phasen'].join(sep)];
      objekttypen.forEach(function (b) {
        zeilen.push([
          zelle(b.name), zelle(b.uri), zelle(b.quelle), zelle(b.anzahl),
          zelle(b.psets.map(function (x) { return x.name + ' (' + x.n + ')'; }).join(', ')),
          zelle(b.typen.join(' ')), zelle(b.phasen.join(' '))
        ].join(sep));
      });
      name = 'kbob-objekttypen.csv';
    }

    var blob = new Blob(['﻿' + zeilen.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---------- Dialoge und Ereignisse ---------- */

  var dlgQuery = document.getElementById('dlg-query');

  function zeigeAbfrage(welche) {
    ['uebersicht', 'detail', 'werte'].forEach(function (w) {
      document.getElementById('tab-' + w).setAttribute('aria-pressed', String(w === welche));
    });
    var g = graphUri();
    var beispiel = K.state.pfad.objekttyp ||
                   (K.state.elemente.length ? K.state.elemente[0].uri : 'https://beispiel/klasse');
    document.getElementById('query-text').value =
      welche === 'uebersicht' ? K.uebersichtQuery(g)
      : welche === 'detail'   ? K.detailQuery(g, beispiel)
      :                         K.werteQuery(g);
  }

  function verdrahten() {
    el.neuladen.addEventListener('click', laden);

    ['liste', 'galerie', 'grafik'].forEach(function (v) {
      document.getElementById('v-' + v).addEventListener('click', function () { setzeAnsicht(v); });
    });

    document.getElementById('show-query').addEventListener('click', function () {
      zeigeAbfrage('uebersicht');
      dlgQuery.showModal();
    });
    ['uebersicht', 'detail', 'werte'].forEach(function (w) {
      document.getElementById('tab-' + w).addEventListener('click', function () { zeigeAbfrage(w); });
    });
    document.getElementById('close-query').addEventListener('click', function () { dlgQuery.close(); });
    document.getElementById('copy-query').addEventListener('click', function () {
      var ta = document.getElementById('query-text');
      ta.select();
      try { document.execCommand('copy'); this.textContent = 'Kopiert'; } catch (e) {}
      var b = this;
      setTimeout(function () { b.textContent = 'In Zwischenablage kopieren'; }, 1600);
    });

    el.csv.addEventListener('click', toCsv);
    el.filter.addEventListener('input', zeichne);
    el['f-phase'].addEventListener('change', zeichne);
    el['f-typ'].addEventListener('change', zeichne);

    K.grafikSteuerung();
  }

  verdrahten();
  laden();      // ohne Klick: der Katalog ist beim Öffnen schon da
})(KBOB);
