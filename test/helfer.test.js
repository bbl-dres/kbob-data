/* Tests der reinen Helfer und Query-Invarianten — ohne Browser, ohne Build:

       node --test test/

   data.js und views.js sind DOM-frei ladbar (window-Shim genügt);
   app.js braucht das DOM und bleibt aussen vor. */

'use strict';

var test = require('node:test');
var assert = require('node:assert');

global.window = globalThis;
require('../js/data.js');
var K = globalThis.KBOB;

/* uebernehmeDetail liest K.state — minimaler Zustand genügt */
K.state = { werte: {}, werteGeladen: false, detail: {}, detailOhneWerte: {},
            elemente: [], generation: 1 };

test('csvZelle: Formel-Injection wird entschärft', function () {
  assert.strictEqual(K.csvZelle('=SUMME(A1)'), "'=SUMME(A1)");
  assert.strictEqual(K.csvZelle('+41 31 000 00 00'), "'+41 31 000 00 00");
  assert.strictEqual(K.csvZelle('-1'), "'-1");
  assert.strictEqual(K.csvZelle('@SUM'), "'@SUM");
  assert.strictEqual(K.csvZelle('harmlos'), 'harmlos');
});

test('csvZelle: Quoting bei Semikolon, Anführungszeichen, Zeilenumbrüchen', function () {
  assert.strictEqual(K.csvZelle('a;b'), '"a;b"');
  assert.strictEqual(K.csvZelle('sagt "hallo"'), '"sagt ""hallo"""');
  assert.strictEqual(K.csvZelle('zeile1\nzeile2'), '"zeile1\nzeile2"');
  assert.strictEqual(K.csvZelle('zeile1\rzeile2'), '"zeile1\rzeile2"');
  assert.strictEqual(K.csvZelle(null), '');
});

test('dateiname: Umlaute, Akzente, Leerfall, Datumssuffix', function () {
  assert.match(K.dateiname('Grünfläche'), /^gruenflaeche-\d{4}-\d{2}-\d{2}$/);
  assert.match(K.dateiname('Établissement'), /^etablissement-\d{4}-\d{2}-\d{2}$/);
  assert.match(K.dateiname('!!!'), /^objekttyp-\d{4}-\d{2}-\d{2}$/);
});

test('kurzListe: schneidet nur an Wertgrenzen und beziffert den Rest', function () {
  var werte = 'Alpha · Beta · Gamma · Delta';
  assert.strictEqual(K.kurzListe(werte, 200), werte);
  var kurz = K.kurzListe(werte, 12);
  assert.match(kurz, /^Alpha · Beta … \+2 weitere$/);
  assert.strictEqual(K.kurzListe('', 10), '');
});

test('plural', function () {
  assert.strictEqual(K.plural(1, 'Merkmal', 'Merkmale'), 'Merkmal');
  assert.strictEqual(K.plural(2, 'Merkmal', 'Merkmale'), 'Merkmale');
});

test('deCompare sortiert Umlaute deutsch', function () {
  assert.ok(K.deCompare('Ärger', 'Zoo') < 0);
});

test('sprachStufen: Rückfallketten je Sprache', function () {
  assert.deepStrictEqual(K.sprachStufen('de'), ['de', 'en']);
  assert.deepStrictEqual(K.sprachStufen('fr'), ['fr', 'de', 'en']);
  assert.deepStrictEqual(K.sprachStufen('it'), ['it', 'de', 'en']);
  assert.deepStrictEqual(K.sprachStufen('en'), ['en', 'de']);
  assert.deepStrictEqual(K.sprachStufen('xx'), ['de', 'en']);
  assert.deepStrictEqual(K.sprachStufen(undefined), ['de', 'en']);
});

test('uebersichtQuery: FROM-Klausel und Sprachkette', function () {
  var q = K.uebersichtQuery('https://beispiel/graph', 'fr');
  assert.ok(q.indexOf('FROM <https://beispiel/graph>') !== -1);
  assert.ok(q.indexOf('lang(?k0) = "fr"') !== -1);
  assert.ok(q.indexOf('lang(?k1) = "de" || lang(?k1) = ""') !== -1);
  assert.ok(q.indexOf('lang(?k2) = "en"') !== -1);
  assert.ok(q.indexOf('IF(BOUND(?k0), "fr"') !== -1);
});

test('detailQuery: VALUES-Klausel und rdfs vor skos je Stufe', function () {
  var q = K.detailQuery('https://g', 'https://klasse/raum', 'de');
  assert.ok(q.indexOf('VALUES ?klasse { <https://klasse/raum> }') !== -1);
  assert.ok(q.indexOf('COALESCE(?pr0, ?ps0, ?pr1, ?ps1)') !== -1);
});

test('katalogRang: Prioritätskataloge zuerst, Dokumenttypen zuletzt', function () {
  var fm = K.katalogRang('KBOB Data Dictionary FM', false);
  var flm = K.katalogRang('Data Dictionary Flächenmanagement', false);
  var andere = K.katalogRang('RTE 26201', false);
  var dok = K.katalogRang('KBOB Dokumenttypenkatalog', true);
  assert.ok(fm < flm && flm < andere && andere < dok);
});

test('uebernehmeDetail: Auswahl-Ableitung und triviale Ja/Nein-Liste', function () {
  function lit(v) { return { value: v }; }
  K.state.werte = {
    'https://s/auswahl': { anzahl: 3, werte: 'A · B · C' },
    'https://s/bool':    { anzahl: 2, werte: 'true · false' }
  };
  var rows = [
    { prop: lit('https://p/1'), merkmal: lit('Farbe'), typ: lit('STRING'),
      werteSchema: lit('https://s/auswahl'), phasen: lit('') },
    { prop: lit('https://p/2'), merkmal: lit('Aktiv'), typ: lit('BOOLEAN'),
      werteSchema: lit('https://s/bool'), phasen: lit('') },
    { prop: lit('https://p/3'), merkmal: lit('Breite'), typ: lit('REAL'),
      phasen: lit('') }
  ];
  var attrs = K.uebernehmeDetail('https://klasse/x', rows);
  var nachName = {};
  attrs.forEach(function (a) { nachName[a.name] = a; });
  assert.strictEqual(nachName['Farbe'].typ, 'Auswahl');
  assert.strictEqual(nachName['Aktiv'].typ, 'Ja/Nein');
  assert.strictEqual(nachName['Aktiv'].liste, null);   // true/false sagt nichts Neues
  assert.strictEqual(nachName['Breite'].typ, 'Zahl');
});
