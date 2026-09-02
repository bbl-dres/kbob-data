/* Tests of the pure helpers and query invariants — no browser, no build:

       node --test test/

   data.js and views.js load without a DOM (a window shim is enough);
   app.js needs the DOM and stays out of scope. */

'use strict';

var test = require('node:test');
var assert = require('node:assert');

global.window = globalThis;
/* i18n.js fetches data/i18n.json — in the test the real file comes through
   a stub, so that K.t can be checked against the actual content. */
var fs = require('node:fs');
var path = require('node:path');
global.fetch = function () {
  var json = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'i18n.json'), 'utf8'));
  return Promise.resolve({ json: function () { return Promise.resolve(json); } });
};
require('../js/data.js');
require('../js/export.js');
require('../js/i18n.js');
var K = globalThis.KBOB;

/* applyDetail reads K.state — a minimal state is enough */
K.state = { values: {}, valuesLoaded: false, detail: {}, detailWithoutValues: {},
            entries: [], generation: 1 };

test('K.t: language chain, placeholders, MISSING marker', async function () {
  await K.i18nReady;
  K.state.language = 'fr';
  assert.strictEqual(K.t('common.close'), 'Fermer');
  assert.strictEqual(K.t('paginator.pageOf', { page: 2, pages: 5 }), 'Page 2 sur 5');
  K.state.language = 'de';
  assert.strictEqual(K.t('common.close'), 'Schliessen');
  assert.strictEqual(K.t('does.not.exist'), 'MISSING does.not.exist');
});

test('i18n.json: every key carries all four languages', function () {
  var json = JSON.parse(require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'data', 'i18n.json'), 'utf8'));
  Object.keys(json).forEach(function (key) {
    if (key.charAt(0) === '_') return;
    ['de', 'fr', 'it', 'en'].forEach(function (lang) {
      assert.ok(json[key][lang], key + ' without ' + lang);
    });
  });
});

test('crc32: known check value from the ZIP specification', function () {
  var bytes = Buffer.from('123456789', 'ascii');
  assert.strictEqual(K.crc32(bytes), 0xCBF43926);
  assert.strictEqual(K.crc32(new Uint8Array(0)), 0);
});

test('xlsxSheetXml: escaping, numeric cells, frozen header row', function () {
  var xml = K.xlsxSheetXml(['Name', 'Count'], [['<A> & "B"', 28], ['=SUM(A1)', '']]);
  assert.ok(xml.indexOf('&lt;A&gt; &amp; &quot;B&quot;') !== -1);   // escaped
  assert.ok(xml.indexOf('<c t="n"><v>28</v></c>') !== -1);          // a number stays a number
  /* Formula characters stay text: Excel never evaluates inline strings */
  assert.ok(xml.indexOf('=SUM(A1)') !== -1);
  assert.ok(xml.indexOf('state="frozen"') !== -1);
  assert.ok(xml.indexOf('<row r="1">') !== -1);
});

test('fileName: umlauts, accents, empty case, date suffix', function () {
  assert.match(K.fileName('Grünfläche'), /^gruenflaeche-\d{4}-\d{2}-\d{2}$/);
  assert.match(K.fileName('Établissement'), /^etablissement-\d{4}-\d{2}-\d{2}$/);
  assert.match(K.fileName('!!!'), /^objecttype-\d{4}-\d{2}-\d{2}$/);
});

test('truncateList: cuts only at value boundaries and counts the rest', function () {
  var values = 'Alpha · Beta · Gamma · Delta';
  assert.strictEqual(K.truncateList(values, 200), values);
  var short = K.truncateList(values, 12);
  assert.match(short, /^Alpha · Beta … \+2 weitere$/);
  assert.strictEqual(K.truncateList('', 10), '');
});

test('plural', function () {
  assert.strictEqual(K.plural(1, 'Merkmal', 'Merkmale'), 'Merkmal');
  assert.strictEqual(K.plural(2, 'Merkmal', 'Merkmale'), 'Merkmale');
});

test('compare sorts umlauts by the interface locale', function () {
  assert.ok(K.compare('Ärger', 'Zoo') < 0);
});

test('languageChain: fallback chains per language', function () {
  assert.deepStrictEqual(K.languageChain('de'), ['de', 'en']);
  assert.deepStrictEqual(K.languageChain('fr'), ['fr', 'de', 'en']);
  assert.deepStrictEqual(K.languageChain('it'), ['it', 'de', 'en']);
  assert.deepStrictEqual(K.languageChain('en'), ['en', 'de']);
  assert.deepStrictEqual(K.languageChain('xx'), ['de', 'en']);
  assert.deepStrictEqual(K.languageChain(undefined), ['de', 'en']);
});

test('overviewQuery: FROM clause and language chain', function () {
  var q = K.overviewQuery('https://example/graph', 'fr');
  assert.ok(q.indexOf('FROM <https://example/graph>') !== -1);
  assert.ok(q.indexOf('lang(?c0) = "fr"') !== -1);
  assert.ok(q.indexOf('lang(?c1) = "de" || lang(?c1) = ""') !== -1);
  assert.ok(q.indexOf('lang(?c2) = "en"') !== -1);
  assert.ok(q.indexOf('IF(BOUND(?c0), "fr"') !== -1);
});

test('overviewQuery: comments are English (they are shown to every user)', function () {
  var q = K.overviewQuery('https://example/graph', 'de');
  q.split('\n').filter(function (line) { return line.trim().charAt(0) === '#'; })
    .forEach(function (line) {
      assert.ok(!/[äöüÄÖÜßé]|\b(der|die|das|und|nicht|mit|Objekttyp)\b/.test(line),
                'non-English query comment: ' + line);
    });
});

test('detailQuery: VALUES clause and rdfs before skos per chain step', function () {
  var q = K.detailQuery('https://g', 'https://class/room', 'de');
  assert.ok(q.indexOf('VALUES ?class { <https://class/room> }') !== -1);
  assert.ok(q.indexOf('COALESCE(?pr0, ?ps0, ?pr1, ?ps1)') !== -1);
});

test('allDetailsQuery: no VALUES clause, grouped by class', function () {
  var q = K.allDetailsQuery('https://g', 'de');
  assert.ok(q.indexOf('VALUES ?class') === -1);
  assert.ok(q.indexOf('SELECT ?class ?prop ?gop') !== -1);
  assert.ok(q.indexOf('GROUP BY ?class ?prop ?gop') !== -1);
});

test('catalogueRank: priority catalogues first, document types last', function () {
  var fm = K.catalogueRank('KBOB Data Dictionary FM', false);
  var flm = K.catalogueRank('Data Dictionary Flächenmanagement', false);
  var other = K.catalogueRank('RTE 26201', false);
  var doc = K.catalogueRank('KBOB Dokumenttypenkatalog', true);
  assert.ok(fm < flm && flm < other && other < doc);
});

test('applyDetail: enumeration derivation and trivial yes/no list', function () {
  function lit(v) { return { value: v }; }
  K.state.values = {
    'https://s/enum': { count: 3, values: 'A · B · C' },
    'https://s/bool': { count: 2, values: 'true · false' }
  };
  var rows = [
    { prop: lit('https://p/1'), name: lit('Farbe'), type: lit('STRING'),
      valueScheme: lit('https://s/enum'), milestones: lit('') },
    { prop: lit('https://p/2'), name: lit('Aktiv'), type: lit('BOOLEAN'),
      valueScheme: lit('https://s/bool'), milestones: lit('') },
    { prop: lit('https://p/3'), name: lit('Breite'), type: lit('REAL'),
      milestones: lit('') }
  ];
  var attrs = K.applyDetail('https://class/x', rows);
  var byName = {};
  attrs.forEach(function (a) { byName[a.name] = a; });
  assert.strictEqual(byName['Farbe'].type, 'Auswahl');
  assert.strictEqual(byName['Aktiv'].type, 'Ja/Nein');
  assert.strictEqual(byName['Aktiv'].valueList, null);   // true/false says nothing new
  assert.strictEqual(byName['Breite'].type, 'Zahl');
});

/* The guide exists once per interface language; every fragment carries the
   same section anchors, so the table of contents and «#guide-…» links work
   in every language. */
test('guide fragments: one per language, identical section ids', function () {
  var dir = path.join(__dirname, '..', 'data', 'guide');
  var ids = null;
  ['de', 'fr', 'it', 'en'].forEach(function (lang) {
    var html = fs.readFileSync(path.join(dir, lang + '.html'), 'utf8');
    var found = (html.match(/<section id="[^"]+"/g) || []).map(function (s) { return s.slice(13, -1); });
    assert.ok(found.length >= 8, lang + ': sections');
    if (ids) assert.deepStrictEqual(found, ids, lang + ': section ids differ from de');
    ids = ids || found;
    assert.ok(/aria-label="[^"]+"/.test(html), lang + ': toc label');
    assert.ok(html.indexOf('<svg') === -1, lang + ': plain links only');
  });
});
