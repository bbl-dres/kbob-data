#!/usr/bin/env node
/* Generates the exact POST bodies the app sends to the SPARQL endpoint.

   The bodies are byte-identical to the browser requests ('query=' +
   encodeURIComponent(...) over the very same query builders), so probe
   requests share Varnish cache entries with real app users — the cache
   layer hashes the raw body (see SwissFederalArchives/lindas-varnish-post).

   Usage:  node tools/cache-probe-gen.cjs <outdir> [graph]

   Writes:  overview-de.body, overview-fr.body, detail-room-de.body,
            values-de.body, alldetails-de.body — plus a .sparql twin of
            each for reading. No trailing newline in .body files. */

'use strict';

var fs = require('node:fs');
var path = require('node:path');

global.window = globalThis;
global.fetch = function () {
  var json = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'i18n.json'), 'utf8'));
  return Promise.resolve({ json: function () { return Promise.resolve(json); } });
};
require(path.join(__dirname, '..', 'js', 'data.js'));
var K = globalThis.KBOB;

var outdir = process.argv[2];
if (!outdir) {
  console.error('usage: node tools/cache-probe-gen.cjs <outdir> [graph]');
  process.exit(1);
}
var GRAPH = process.argv[3] || 'https://lindas.admin.ch/fobl/kbob/dd-fm';
/* Any object type works for the detail probe; Raum is a stable, populated one. */
var ROOM = GRAPH + '/0.3.0/classes/room';

fs.mkdirSync(outdir, { recursive: true });

function emit(name, query) {
  fs.writeFileSync(path.join(outdir, name + '.sparql'), query);
  fs.writeFileSync(path.join(outdir, name + '.body'), 'query=' + encodeURIComponent(query));
  console.log(name + ': query ' + query.length + ' chars, body ' +
              Buffer.byteLength('query=' + encodeURIComponent(query)) + ' bytes');
}

emit('overview-de',    K.overviewQuery(GRAPH, 'de'));
emit('overview-fr',    K.overviewQuery(GRAPH, 'fr'));
emit('detail-room-de', K.detailQuery(GRAPH, ROOM, 'de'));
emit('values-de',      K.valuesQuery(GRAPH, 'de'));
emit('alldetails-de',  K.allDetailsQuery(GRAPH, 'de'));

/* Cache-busted overview twins: unique comment, same semantics — forces a
   Varnish MISS, which is how cold evaluation time is measured fairly. */
for (var i = 1; i <= 2; i++) {
  var busted = '# cache probe variant ' + i + ' ' + Date.now() + '\n' + K.overviewQuery(GRAPH, 'de');
  emit('overview-de-bust' + i, busted);
}
