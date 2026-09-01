/* Interface translations (i18n).

   The frontend tokens live in data/i18n.json (DE/FR/IT/EN). Chain per key:
   selected language → German; if the key is missing entirely, a visible
   «MISSING <key>» appears — gaps should be noticed, not guessed at.
   Catalogue content is not translated here but by the SPARQL language
   chains in data.js. */

var KBOB = window.KBOB || (window.KBOB = {});

(function (K) {
  'use strict';

  var words = null;

  /* K.t('paginator.pageOf', { page: 2, pages: 5 }) → «Seite 2 von 5» */
  K.t = function (key, params) {
    var entry = words && words[key];
    var lang = (K.state && K.state.language) || 'de';
    var text = entry ? (entry[lang] || entry.de) : undefined;
    if (text === undefined || text === null) text = 'MISSING ' + key;
    if (params) {
      Object.keys(params).forEach(function (n) {
        text = text.split('{' + n + '}').join(params[n]);
      });
    }
    return text;
  };

  /* Update the statically marked nodes in index.html:
     data-i18n (text content) plus data-i18n-title/-aria-label/-placeholder/
     -href/-alt. Without a dictionary (fetch failed, e.g. file://) the German
     texts baked into the HTML stay put instead of turning into MISSING. */
  K.translateStatic = function () {
    document.documentElement.lang = (K.state && K.state.language) || 'de';
    if (!words) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (n) {
      n.textContent = K.t(n.getAttribute('data-i18n'));
    });
    [['data-i18n-title', 'title'],
     ['data-i18n-aria-label', 'aria-label'],
     ['data-i18n-placeholder', 'placeholder'],
     ['data-i18n-href', 'href'],
     ['data-i18n-alt', 'alt']].forEach(function (pair) {
      Array.prototype.forEach.call(document.querySelectorAll('[' + pair[0] + ']'), function (n) {
        n.setAttribute(pair[1], K.t(n.getAttribute(pair[0])));
      });
    });
  };

  /* Whoever renders waits for this promise (load() in app.js). If the fetch
     fails, words stays null: the static markup keeps its German, dynamic
     texts show MISSING — impossible to miss, but the page stays readable.
     The promise ALWAYS resolves. */
  K.i18nReady = fetch('data/i18n.json')
    .then(function (r) { return r.json(); })
    .then(function (json) { words = json; },
          function () { /* words stays null */ });
})(KBOB);
