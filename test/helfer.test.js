/* Tests der reinen Helfer und Query-Invarianten — ohne Browser, ohne Build:

       node --test test/

   data.js und views.js sind DOM-frei ladbar (window-Shim genügt);
   app.js braucht das DOM und bleibt aussen vor. */

'use strict';

var test = require('node:test');
var assert = require('node:assert');

global.window = globalThis;
/* i18n.js holt data/i18n.json per fetch — im Test kommt die echte Datei
   über einen Stub, damit K.t gegen den realen Bestand prüfbar ist. */
var fs = require('node:fs');
var pfad = require('node:path');
global.fetch = function () {
  var json = JSON.parse(fs.readFileSync(pfad.join(__dirname, '..', 'data', 'i18n.json'), 'utf8'));
  return Promise.resolve({ json: function () { return Promise.resolve(json); } });
};
require('../js/data.js');
require('../js/export.js');
require('../js/i18n.js');
var K = globalThis.KBOB;

/* uebernehmeDetail liest K.state — minimaler Zustand genügt */
K.state = { werte: {}, werteGeladen: false, detail: {}, detailOhneWerte: {},
            elemente: [], generation: 1 };

test('K.t: Sprachkette, Platzhalter, MISSING-Markierung', async function () {
  await K.i18nBereit;
  K.state.sprache = 'fr';
  assert.strictEqual(K.t('common.close'), 'Fermer');
  assert.strictEqual(K.t('paginator.pageOf', { seite: 2, seiten: 5 }), 'Page 2 sur 5');
  K.state.sprache = 'de';
  assert.strictEqual(K.t('common.close'), 'Schliessen');
  assert.strictEqual(K.t('gibt.es.nicht'), 'MISSING gibt.es.nicht');
});

test('i18n.json: jeder Schlüssel führt alle vier Sprachen', function () {
  var json = JSON.parse(require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'data', 'i18n.json'), 'utf8'));
  Object.keys(json).forEach(function (schluessel) {
    if (schluessel.charAt(0) === '_') return;
    ['de', 'fr', 'it', 'en'].forEach(function (lang) {
      assert.ok(json[schluessel][lang], schluessel + ' ohne ' + lang);
    });
  });
});

test('crc32: bekannter Prüfwert der ZIP-Spezifikation', function () {
  var bytes = Buffer.from('123456789', 'ascii');
  assert.strictEqual(K.crc32(bytes), 0xCBF43926);
  assert.strictEqual(K.crc32(new Uint8Array(0)), 0);
});

test('xlsxSheetXml: Escaping, Zahlzellen, eingefrorene Kopfzeile', function () {
  var xml = K.xlsxSheetXml(['Name', 'Anzahl'], [['<A> & "B"', 28], ['=SUMME(A1)', '']]);
  assert.ok(xml.indexOf('&lt;A&gt; &amp; &quot;B&quot;') !== -1);   // escaped
  assert.ok(xml.indexOf('<c t="n"><v>28</v></c>') !== -1);          // Zahl bleibt Zahl
  /* Formel-Zeichen bleiben Text: Inline-Strings wertet Excel nie aus */
  assert.ok(xml.indexOf('=SUMME(A1)') !== -1);
  assert.ok(xml.indexOf('state="frozen"') !== -1);
  assert.ok(xml.indexOf('<row r="1">') !== -1);
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

test('alleDetailsQuery: keine VALUES-Klausel, gruppiert nach Klasse', function () {
  var q = K.alleDetailsQuery('https://g', 'de');
  assert.ok(q.indexOf('VALUES ?klasse') === -1);
  assert.ok(q.indexOf('SELECT ?klasse ?prop ?gop') !== -1);
  assert.ok(q.indexOf('GROUP BY ?klasse ?prop ?gop') !== -1);
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
