/* Excel-Export ohne Abhängigkeiten.

   Baut eine echte XLSX-Arbeitsmappe (Office Open XML in einem ZIP-Container,
   Speicherverfahren «store», keine Kompression) mit mehreren Tabellenblättern.
   Zellen stehen als Inline-Strings im Blatt — Excel wertet solche Zellen nie
   als Formeln aus, die frühere CSV-Injection-Entschärfung entfällt damit.

   Öffentlich: K.xlsxBlob(blaetter) und, für Tests, K.xlsxSheetXml/K.crc32. */

var KBOB = window.KBOB || (window.KBOB = {});

(function (K) {
  'use strict';

  /* ---------- XML-Bausteine ---------- */

  function xmlEsc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      /* Steuerzeichen sind in XML 1.0 verboten und stammen höchstens aus
         kaputten Quelldaten — sie fliegen raus statt die Datei zu brechen. */
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  /* Ein Tabellenblatt: Kopfzeile fett (Stil 1) und eingefroren, danach die
     Datenzeilen. Zahlen bleiben Zahlen (t="n"), alles andere ist Text. */
  K.xlsxSheetXml = function (kopf, zeilen, breiten) {
    var teile = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" ' +
        'activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    ];
    if (breiten && breiten.length) {
      var cols = breiten.map(function (b, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + b + '" customWidth="1"/>';
      });
      teile.push('<cols>' + cols.join('') + '</cols>');
    }
    teile.push('<sheetData>');

    function zelle(wert, stil) {
      if (typeof wert === 'number' && isFinite(wert)) {
        return '<c t="n"' + (stil ? ' s="' + stil + '"' : '') + '><v>' + wert + '</v></c>';
      }
      if (wert === null || wert === undefined || wert === '') {
        return '<c' + (stil ? ' s="' + stil + '"' : '') + '/>';
      }
      return '<c t="inlineStr"' + (stil ? ' s="' + stil + '"' : '') +
             '><is><t xml:space="preserve">' + xmlEsc(wert) + '</t></is></c>';
    }

    teile.push('<row r="1">' + kopf.map(function (k) { return zelle(k, 1); }).join('') + '</row>');
    zeilen.forEach(function (z, i) {
      teile.push('<row r="' + (i + 2) + '">' + z.map(function (w) { return zelle(w, 0); }).join('') + '</row>');
    });
    teile.push('</sheetData></worksheet>');
    return teile.join('');
  };

  /* Blattnamen: Excel erlaubt höchstens 31 Zeichen und kein : \ / ? * [ ] */
  function blattName(name, i) {
    var s = String(name || 'Blatt' + (i + 1)).replace(/[:\\\/?*\[\]]/g, ' ');
    return s.length > 31 ? s.slice(0, 31) : s;
  }

  function workbookXml(blaetter) {
    var sheets = blaetter.map(function (b, i) {
      return '<sheet name="' + xmlEsc(blattName(b.name, i)) + '" sheetId="' + (i + 1) +
             '" r:id="rId' + (i + 1) + '"/>';
    });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' + sheets.join('') + '</sheets></workbook>';
  }

  function workbookRels(blaetter) {
    var rels = blaetter.map(function (b, i) {
      return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/' +
             'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
    });
    rels.push('<Relationship Id="rId' + (blaetter.length + 1) + '" Type="http://schemas.' +
              'openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      rels.join('') + '</Relationships>';
  }

  function contentTypes(blaetter) {
    var overrides = blaetter.map(function (b, i) {
      return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType=' +
             '"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType=' +
      '"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType=' +
      '"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      overrides.join('') + '</Types>';
  }

  var ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/' +
    'relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';

  /* Zwei Zellstile: 0 = normal, 1 = fett (Kopfzeile). Die zweite Füllung
     (gray125) verlangt das Format als festen Platzhalter. */
  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border/></borders>' +
    '<cellStyleXfs count="1"><xf/></cellStyleXfs>' +
    '<cellXfs count="2"><xf xfId="0"/><xf fontId="1" xfId="0" applyFont="1"/></cellXfs>' +
    '</styleSheet>';

  /* ---------- ZIP (store, ohne Kompression) ---------- */

  function utf8Bytes(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xD800 && c <= 0xDBFF) {
        /* Nur ein GÜLTIGES Paar als 4-Byte-Zeichen; ein einsames Surrogat
           würde ungültiges UTF-8 ergeben (Excel kann die Datei abweisen) —
           es wird zu U+FFFD, ohne das Folgezeichen zu verschlucken. */
        var lo = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
        if (lo >= 0xDC00 && lo <= 0xDFFF) {
          i++;
          var cp = 0x10000 + ((c - 0xD800) << 10) + (lo - 0xDC00);
          out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63),
                   0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
        } else {
          out.push(0xEF, 0xBF, 0xBD);
        }
      } else if (c >= 0xDC00 && c <= 0xDFFF) {
        out.push(0xEF, 0xBF, 0xBD);   // einsames Low-Surrogat
      } else {
        out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
    }
    return new Uint8Array(out);
  }

  var CRC_TABELLE = (function () {
    var t = new Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();

  K.crc32 = function (bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      c = CRC_TABELLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  };

  function w16(a, o, v) { a[o] = v & 255; a[o + 1] = (v >> 8) & 255; }
  function w32(a, o, v) { w16(a, o, v); w16(a, o + 2, (v >>> 16)); }

  function dosZeit(d) {
    return {
      zeit: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      datum: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }

  /* eintraege: [{ name, text }] — alle Namen sind ASCII (Paketpfade) */
  function zipStore(eintraege) {
    var jetzt = dosZeit(new Date());
    var lokal = [], zentral = [], offset = 0;

    eintraege.forEach(function (e) {
      var name = utf8Bytes(e.name);
      var daten = utf8Bytes(e.text);
      var crc = K.crc32(daten);

      var kopf = new Uint8Array(30 + name.length);
      w32(kopf, 0, 0x04034B50); w16(kopf, 4, 20); w16(kopf, 6, 0x0800);
      w16(kopf, 8, 0); w16(kopf, 10, jetzt.zeit); w16(kopf, 12, jetzt.datum);
      w32(kopf, 14, crc); w32(kopf, 18, daten.length); w32(kopf, 22, daten.length);
      w16(kopf, 26, name.length); w16(kopf, 28, 0);
      kopf.set(name, 30);
      lokal.push(kopf, daten);

      var z = new Uint8Array(46 + name.length);
      w32(z, 0, 0x02014B50); w16(z, 4, 20); w16(z, 6, 20); w16(z, 8, 0x0800);
      w16(z, 10, 0); w16(z, 12, jetzt.zeit); w16(z, 14, jetzt.datum);
      w32(z, 16, crc); w32(z, 20, daten.length); w32(z, 24, daten.length);
      w16(z, 28, name.length);
      w32(z, 42, offset);
      z.set(name, 46);
      zentral.push(z);

      offset += kopf.length + daten.length;
    });

    var zentralLaenge = zentral.reduce(function (s, t) { return s + t.length; }, 0);
    var ende = new Uint8Array(22);
    w32(ende, 0, 0x06054B50);
    w16(ende, 8, eintraege.length); w16(ende, 10, eintraege.length);
    w32(ende, 12, zentralLaenge); w32(ende, 16, offset);

    return lokal.concat(zentral, [ende]);
  }

  /* ---------- Öffentlich: Arbeitsmappe bauen ----------
     blaetter: [{ name, kopf, zeilen, breiten }] */
  K.xlsxBlob = function (blaetter) {
    var teile = [
      { name: '[Content_Types].xml', text: contentTypes(blaetter) },
      { name: '_rels/.rels', text: ROOT_RELS },
      { name: 'xl/workbook.xml', text: workbookXml(blaetter) },
      { name: 'xl/_rels/workbook.xml.rels', text: workbookRels(blaetter) },
      { name: 'xl/styles.xml', text: STYLES }
    ];
    blaetter.forEach(function (b, i) {
      teile.push({
        name: 'xl/worksheets/sheet' + (i + 1) + '.xml',
        text: K.xlsxSheetXml(b.kopf, b.zeilen, b.breiten)
      });
    });
    return new Blob(zipStore(teile),
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };
})(KBOB);
