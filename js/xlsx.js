/*
 * Generador mínimo de archivos .xlsx (Office Open XML) sin dependencias.
 * Empaqueta las hojas en un ZIP sin compresión, suficiente para tablas pequeñas.
 */
(function (root) {
  'use strict';

  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const encoder = new TextEncoder();

  // Índices de estilo definidos en styles.xml
  const ESTILOS = { normal: 0, negrita: 1, nota: 2, notaRoja: 3, notaNegrita: 4 };

  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zip(archivos) {
    const partes = [];
    const central = [];
    let offset = 0;
    const FECHA_DOS = (1 << 5) | 1; // 1980-01-01

    for (const a of archivos) {
      const nombre = encoder.encode(a.nombre);
      const datos = encoder.encode(a.contenido);
      const crc = crc32(datos);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(12, FECHA_DOS, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, datos.length, true);
      local.setUint32(22, datos.length, true);
      local.setUint16(26, nombre.length, true);
      partes.push(new Uint8Array(local.buffer), nombre, datos);

      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(14, FECHA_DOS, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, datos.length, true);
      cd.setUint32(24, datos.length, true);
      cd.setUint16(28, nombre.length, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), nombre);

      offset += 30 + nombre.length + datos.length;
    }

    const tamCentral = central.reduce((s, b) => s + b.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, archivos.length, true);
    fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tamCentral, true);
    fin.setUint32(16, offset, true);

    const bloques = partes.concat(central, [new Uint8Array(fin.buffer)]);
    const salida = new Uint8Array(bloques.reduce((s, b) => s + b.length, 0));
    let pos = 0;
    for (const b of bloques) { salida.set(b, pos); pos += b.length; }
    return salida;
  }

  function escaparXml(s) {
    return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
  }

  function letraColumna(i) {
    let s = '';
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }

  function celdaXml(valor, ref) {
    if (valor === null || valor === undefined || valor === '') return '';
    const obj = typeof valor === 'object' ? valor : { v: valor };
    const s = obj.s ? ' s="' + ESTILOS[obj.s] + '"' : '';
    if (typeof obj.v === 'number') return '<c r="' + ref + '"' + s + '><v>' + obj.v + '</v></c>';
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + escaparXml(obj.v) + '</t></is></c>';
  }

  function hojaXml(hoja) {
    const vista = hoja.congelarFilas
      ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + hoja.congelarFilas + '" topLeftCell="A' + (hoja.congelarFilas + 1) +
        '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      : '';
    const cols = hoja.anchos
      ? '<cols>' + hoja.anchos.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>'
      : '';
    const filas = hoja.filas.map((fila, r) => {
      const celdas = fila.map((v, c) => celdaXml(v, letraColumna(c) + (r + 1))).join('');
      return '<row r="' + (r + 1) + '">' + celdas + '</row>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="' + NS + '" xmlns:r="' + NS_R + '">' +
      vista + cols + '<sheetData>' + filas + '</sheetData></worksheet>';
  }

  const ESTILOS_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="' + NS + '">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts>' +
    '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '<font><sz val="11"/><color rgb="FFC00000"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="5">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  /**
   * hojas: [{ nombre, anchos?: [número], congelarFilas?: número, filas: [[valor | {v, s}]] }]
   * Devuelve un Uint8Array con el contenido del .xlsx.
   */
  function crear(hojas) {
    const archivos = [
      {
        nombre: '[Content_Types].xml',
        contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          hojas.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
          '</Types>',
      },
      {
        nombre: '_rels/.rels',
        contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="' + NS_R + '/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      },
      {
        nombre: 'xl/workbook.xml',
        contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="' + NS + '" xmlns:r="' + NS_R + '"><sheets>' +
          hojas.map((h, i) => '<sheet name="' + escaparXml(h.nombre.slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') +
          '</sheets></workbook>',
      },
      {
        nombre: 'xl/_rels/workbook.xml.rels',
        contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          hojas.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + NS_R + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
          '<Relationship Id="rId' + (hojas.length + 1) + '" Type="' + NS_R + '/styles" Target="styles.xml"/></Relationships>',
      },
      { nombre: 'xl/styles.xml', contenido: ESTILOS_XML },
    ];
    hojas.forEach((h, i) => archivos.push({ nombre: 'xl/worksheets/sheet' + (i + 1) + '.xml', contenido: hojaXml(h) }));
    return zip(archivos);
  }

  const Xlsx = { MIME, crear };

  if (typeof module === 'object' && module.exports) module.exports = Xlsx;
  else root.Xlsx = Xlsx;
})(typeof window !== 'undefined' ? window : globalThis);
