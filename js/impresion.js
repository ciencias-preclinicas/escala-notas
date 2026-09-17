/*
 * Paginación para impresión.
 * Cada hoja tiene medidas fijas en milímetros, así que se sabe de antemano cuántas
 * filas y columnas caben: ninguna columna se corta entre dos páginas.
 */
(function (root) {
  'use strict';

  const PAPELES = {
    carta: { nombre: 'Carta', w: 215.9, h: 279.4 },
    oficio: { nombre: 'Oficio', w: 215.9, h: 330.2 },
    a4: { nombre: 'A4', w: 210, h: 297 },
  };

  // fila: alto de fila (mm) · col: ancho mínimo de columna (mm) · fuente: pt
  const DENSIDADES = {
    compacta: { nombre: 'Compacta', fila: 4.2, col: 21, fuente: 7.5 },
    normal: { nombre: 'Normal', fila: 5.2, col: 25, fuente: 9 },
    grande: { nombre: 'Grande', fila: 6.6, col: 31, fuente: 11 },
  };

  const MARGEN = 10; // margen de @page
  const HOLGURA = 3; // evita que el navegador agregue una hoja en blanco por redondeo
  const SEPARACION = 4; // entre columnas
  const ENCABEZADO = 22;
  const CABECERA_COLUMNA = 6;
  const PIE = 6;

  function disposicion(opciones) {
    const papel = PAPELES[opciones.papel] || PAPELES.carta;
    const dens = DENSIDADES[opciones.densidad] || DENSIDADES.normal;
    const horizontal = opciones.orientacion === 'horizontal';
    const w = horizontal ? papel.h : papel.w;
    const h = horizontal ? papel.w : papel.h;
    const ancho = w - 2 * MARGEN;
    const alto = h - 2 * MARGEN - HOLGURA;
    const columnas = Math.max(1, Math.floor((ancho + SEPARACION) / (dens.col + SEPARACION)));
    const filas = Math.max(5, Math.floor((alto - ENCABEZADO - PIE - CABECERA_COLUMNA) / dens.fila));
    return { papel, dens, w, h, ancho, alto, columnas, filas, porPagina: columnas * filas };
  }

  /**
   * Reparte `total` filas en páginas → columnas → [inicio, fin).
   * En la última página las columnas se equilibran para que no quede una sola columna larga.
   */
  function paginar(total, d) {
    const paginas = [];
    for (let inicio = 0; inicio < total; inicio += d.porPagina) {
      const resto = Math.min(d.porPagina, total - inicio);
      const filasCol = Math.min(d.filas, Math.ceil(resto / d.columnas));
      const cols = [];
      for (let desde = 0; desde < resto; desde += filasCol) {
        cols.push([inicio + desde, inicio + Math.min(desde + filasCol, resto)]);
      }
      paginas.push(cols);
    }
    return paginas;
  }

  function escaparHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function reglaPagina(d) {
    return '@page { size: ' + d.w + 'mm ' + d.h + 'mm; margin: ' + MARGEN + 'mm; }';
  }

  /**
   * Genera el HTML de las hojas.
   * contenido: { titulo, lineas: [texto], pie, filas, celda(fila) → { p, n, clase }, marcaHtml? }
   */
  function renderizar(contenido, d) {
    const paginas = paginar(contenido.filas.length, d);
    const total = paginas.length;
    const estilo = [
      '--hoja-w:' + d.ancho + 'mm',
      '--hoja-h:' + d.alto + 'mm',
      '--fila:' + d.dens.fila + 'mm',
      '--fuente:' + d.dens.fuente + 'pt',
      '--cols:' + d.columnas,
      '--sep:' + SEPARACION + 'mm',
      '--encabezado:' + ENCABEZADO + 'mm',
      '--cab-col:' + CABECERA_COLUMNA + 'mm',
      '--pie:' + PIE + 'mm',
    ].join(';');

    const lineas = contenido.lineas.map((l) => '<div class="hoja-linea">' + escaparHtml(l) + '</div>').join('');
    const partes = [];
    paginas.forEach((cols, i) => {
      partes.push('<section class="hoja" style="' + estilo + '" aria-label="Página ' + (i + 1) + ' de ' + total + '">');
      partes.push(
        '<header class="hoja-encabezado">' + (contenido.marcaHtml || '') +
        '<div class="hoja-datos"><div class="hoja-titulo"><strong>' + escaparHtml(contenido.titulo) +
        '</strong><span>Página ' + (i + 1) + ' de ' + total + '</span></div>' + lineas + '</div></header>'
      );
      partes.push('<div class="hoja-cuerpo">');
      for (const [desde, hasta] of cols) {
        partes.push('<div class="hoja-col"><div class="hoja-cab"><span>Puntaje</span><span>Nota</span></div>');
        for (let k = desde; k < hasta; k++) {
          const c = contenido.celda(contenido.filas[k]);
          partes.push('<div class="hoja-fila ' + c.clase + '"><span>' + c.p + '</span><span class="n">' + c.n + '</span></div>');
        }
        partes.push('</div>');
      }
      partes.push('</div>');
      partes.push('<footer class="hoja-pie"><span>' + escaparHtml(contenido.pie[0]) + '</span><span>' + escaparHtml(contenido.pie[1]) + '</span></footer>');
      partes.push('</section>');
    });
    return { html: partes.join(''), paginas: total };
  }

  const Impresion = { PAPELES, DENSIDADES, disposicion, paginar, renderizar, reglaPagina, escaparHtml };

  if (typeof module === 'object' && module.exports) module.exports = Impresion;
  else root.Impresion = Impresion;
})(typeof window !== 'undefined' ? window : globalThis);
