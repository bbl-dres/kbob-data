/* Excel export without dependencies.

   Builds a real XLSX workbook (Office Open XML in a ZIP container, storage
   method «store», no compression) with several worksheets. Cells are inline
   strings in the sheet — Excel never evaluates such cells as formulas, which
   makes the earlier CSV-injection defusing unnecessary.

   Public: K.xlsxBlob(sheets) and, for the tests, K.xlsxSheetXml/K.crc32. */

var KBOB = window.KBOB || (window.KBOB = {});

(function (K) {
  'use strict';

  /* ---------- XML building blocks ---------- */

  function xmlEsc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      /* Control characters are forbidden in XML 1.0 and can only come from
         broken source data — they are dropped instead of breaking the file. */
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  /* One worksheet: header row bold (style 1) and frozen, then the data
     rows. Numbers stay numbers (t="n"), everything else is text. */
  K.xlsxSheetXml = function (header, rows, widths) {
    var parts = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" ' +
        'activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    ];
    if (widths && widths.length) {
      var cols = widths.map(function (b, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + b + '" customWidth="1"/>';
      });
      parts.push('<cols>' + cols.join('') + '</cols>');
    }
    parts.push('<sheetData>');

    function cell(value, style) {
      if (typeof value === 'number' && isFinite(value)) {
        return '<c t="n"' + (style ? ' s="' + style + '"' : '') + '><v>' + value + '</v></c>';
      }
      if (value === null || value === undefined || value === '') {
        return '<c' + (style ? ' s="' + style + '"' : '') + '/>';
      }
      return '<c t="inlineStr"' + (style ? ' s="' + style + '"' : '') +
             '><is><t xml:space="preserve">' + xmlEsc(value) + '</t></is></c>';
    }

    parts.push('<row r="1">' + header.map(function (k) { return cell(k, 1); }).join('') + '</row>');
    rows.forEach(function (z, i) {
      parts.push('<row r="' + (i + 2) + '">' + z.map(function (w) { return cell(w, 0); }).join('') + '</row>');
    });
    parts.push('</sheetData></worksheet>');
    return parts.join('');
  };

  /* Sheet names: Excel allows at most 31 characters and no : \ / ? * [ ] */
  function sheetName(name, i) {
    var s = String(name || 'Sheet' + (i + 1)).replace(/[:\\\/?*\[\]]/g, ' ');
    return s.length > 31 ? s.slice(0, 31) : s;
  }

  function workbookXml(sheets) {
    var refs = sheets.map(function (b, i) {
      return '<sheet name="' + xmlEsc(sheetName(b.name, i)) + '" sheetId="' + (i + 1) +
             '" r:id="rId' + (i + 1) + '"/>';
    });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' + refs.join('') + '</sheets></workbook>';
  }

  function workbookRels(sheets) {
    var rels = sheets.map(function (b, i) {
      return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/' +
             'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
    });
    rels.push('<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.' +
              'openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      rels.join('') + '</Relationships>';
  }

  function contentTypes(sheets) {
    var overrides = sheets.map(function (b, i) {
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

  /* Two cell styles: 0 = normal, 1 = bold (header row). The second fill
     (gray125) is required by the format as a fixed placeholder. */
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

  /* ---------- ZIP (store, no compression) ---------- */

  function utf8Bytes(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xD800 && c <= 0xDBFF) {
        /* Only a VALID pair becomes a 4-byte character; a lone surrogate
           would yield invalid UTF-8 (Excel may reject the file) — it becomes
           U+FFFD without swallowing the following character. */
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
        out.push(0xEF, 0xBF, 0xBD);   // lone low surrogate
      } else {
        out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
    }
    return new Uint8Array(out);
  }

  var CRC_TABLE = (function () {
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
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  };

  function w16(a, o, v) { a[o] = v & 255; a[o + 1] = (v >> 8) & 255; }
  function w32(a, o, v) { w16(a, o, v); w16(a, o + 2, (v >>> 16)); }

  function dosTime(d) {
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }

  /* entries: [{ name, text }] — all names are ASCII (package paths) */
  function zipStore(entries) {
    var now = dosTime(new Date());
    var local = [], central = [], offset = 0;

    entries.forEach(function (e) {
      var name = utf8Bytes(e.name);
      var data = utf8Bytes(e.text);
      var crc = K.crc32(data);

      var header = new Uint8Array(30 + name.length);
      w32(header, 0, 0x04034B50); w16(header, 4, 20); w16(header, 6, 0x0800);
      w16(header, 8, 0); w16(header, 10, now.time); w16(header, 12, now.date);
      w32(header, 14, crc); w32(header, 18, data.length); w32(header, 22, data.length);
      w16(header, 26, name.length); w16(header, 28, 0);
      header.set(name, 30);
      local.push(header, data);

      var z = new Uint8Array(46 + name.length);
      w32(z, 0, 0x02014B50); w16(z, 4, 20); w16(z, 6, 20); w16(z, 8, 0x0800);
      w16(z, 10, 0); w16(z, 12, now.time); w16(z, 14, now.date);
      w32(z, 16, crc); w32(z, 20, data.length); w32(z, 24, data.length);
      w16(z, 28, name.length);
      w32(z, 42, offset);
      z.set(name, 46);
      central.push(z);

      offset += header.length + data.length;
    });

    var centralLength = central.reduce(function (s, t) { return s + t.length; }, 0);
    var end = new Uint8Array(22);
    w32(end, 0, 0x06054B50);
    w16(end, 8, entries.length); w16(end, 10, entries.length);
    w32(end, 12, centralLength); w32(end, 16, offset);

    return local.concat(central, [end]);
  }

  /* ---------- Public: build the workbook ----------
     sheets: [{ name, header, rows, widths }] */
  K.xlsxBlob = function (sheets) {
    var parts = [
      { name: '[Content_Types].xml', text: contentTypes(sheets) },
      { name: '_rels/.rels', text: ROOT_RELS },
      { name: 'xl/workbook.xml', text: workbookXml(sheets) },
      { name: 'xl/_rels/workbook.xml.rels', text: workbookRels(sheets) },
      { name: 'xl/styles.xml', text: STYLES }
    ];
    sheets.forEach(function (b, i) {
      parts.push({
        name: 'xl/worksheets/sheet' + (i + 1) + '.xml',
        text: K.xlsxSheetXml(b.header, b.rows, b.widths)
      });
    });
    return new Blob(zipStore(parts),
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };
})(KBOB);
