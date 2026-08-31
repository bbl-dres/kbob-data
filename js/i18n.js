/* Oberflächen-Übersetzungen (i18n).

   Die Frontend-Tokens liegen in data/i18n.json (DE/FR/IT/EN). Kette je
   Schlüssel: gewählte Sprache → Deutsch; fehlt der Schlüssel ganz,
   erscheint sichtbar «MISSING <schlüssel>» — Lücken sollen auffallen,
   nicht raten lassen. Katalog-Inhalte übersetzt nicht diese Datei,
   sondern die SPARQL-Sprachketten in data.js. */

var KBOB = window.KBOB || (window.KBOB = {});

(function (K) {
  'use strict';

  var woerter = null;

  /* K.t('paginator.pageOf', { seite: 2, seiten: 5 }) → «Seite 2 von 5» */
  K.t = function (schluessel, ersatz) {
    var eintrag = woerter && woerter[schluessel];
    var lang = (K.state && K.state.sprache) || 'de';
    var text = eintrag ? (eintrag[lang] || eintrag.de) : undefined;
    if (text === undefined || text === null) text = 'MISSING ' + schluessel;
    if (ersatz) {
      Object.keys(ersatz).forEach(function (n) {
        text = text.split('{' + n + '}').join(ersatz[n]);
      });
    }
    return text;
  };

  /* Statisch ausgezeichnete Knoten in index.html nachführen:
     data-i18n (Textinhalt) sowie data-i18n-title/-aria-label/-placeholder/-alt.
     Ohne Wörterbuch (Abruf gescheitert, z. B. file://) bleiben die im HTML
     eingebackenen deutschen Texte stehen, statt zu MISSING zu werden. */
  K.uebersetzeStatisch = function () {
    document.documentElement.lang = (K.state && K.state.sprache) || 'de';
    if (!woerter) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (n) {
      n.textContent = K.t(n.getAttribute('data-i18n'));
    });
    [['data-i18n-title', 'title'],
     ['data-i18n-aria-label', 'aria-label'],
     ['data-i18n-placeholder', 'placeholder'],
     ['data-i18n-alt', 'alt']].forEach(function (paar) {
      Array.prototype.forEach.call(document.querySelectorAll('[' + paar[0] + ']'), function (n) {
        n.setAttribute(paar[1], K.t(n.getAttribute(paar[0])));
      });
    });
  };

  /* Wer rendert, wartet auf dieses Versprechen (laden() in app.js).
     Scheitert der Abruf, bleibt woerter null: die Statik behält ihr
     Deutsch, dynamische Texte zeigen MISSING — unübersehbar, aber die
     Seite bleibt lesbar. Das Versprechen erfüllt IMMER. */
  K.i18nBereit = fetch('data/i18n.json')
    .then(function (r) { return r.json(); })
    .then(function (json) { woerter = json; },
          function () { /* woerter bleibt null */ });
})(KBOB);
