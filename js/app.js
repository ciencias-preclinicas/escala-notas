(function () {
  'use strict';

  const E = window.Escala;
  const I = window.Impresion;
  const X = window.Xlsx;

  const $ = (sel) => document.querySelector(sel);
  const form = $('#form');
  const tabla = $('#tabla');
  const hojas = $('#hojas');
  const dialogo = $('#detalle');

  const NUMERICOS = ['pideal', 'pobt', 'exig', 'nmin', 'napr', 'nmax', 'paso'];
  const VALORES_INICIALES = {
    pideal: '100', pobt: '', exig: '60', nmin: '1,0', napr: '4,0', nmax: '7,0',
    paso: '1', orden: 'ascendente', titulo: '', papel: 'carta', orientacion: 'vertical', densidad: 'normal',
  };
  const CAMPOS = Object.keys(VALORES_INICIALES);
  const ANCHO_COLUMNA_PX = 124;
  const MARCA_IMPRESION =
    '<div class="hoja-marca"><img class="emblema" src="img/emblema-color.png" alt="">' +
    '<span class="divisor"></span>' +
    '<img class="texto" src="img/texto-color.png" alt="Universidad de La Frontera · Facultad de Medicina · Departamento de Ciencias Preclínicas"></div>';

  let resultado = null;
  let columnasPantalla = 0;
  // Queda en true mientras la tabla en pantalla no refleje el último cálculo.
  let tablaPendiente = true;
  // Normalmente es la URL de la barra de direcciones; sirve de respaldo cuando el
  // navegador no deja actualizarla (archivo abierto con doble clic).
  let enlaceCompartible = location.href;

  const campo = (nombre) => form.elements[nombre];
  const fc = (n, dec) => E.formatearCorto(n, dec === undefined ? 2 : dec);
  const fp = (p) => E.formatear(p, resultado.dec);
  const fn = (n) => E.formatear(n, 1);
  const pct = (x) => fc(x * 100, 2) + ' %';

  /* ---------- Estado en la URL ---------- */

  function cargarDesdeUrl() {
    const q = new URLSearchParams(location.search);
    for (const k of CAMPOS) {
      const el = campo(k);
      const valor = q.has(k) ? q.get(k) : VALORES_INICIALES[k];
      if (el.tagName === 'SELECT' && ![...el.options].some((o) => o.value === valor)) {
        if (k === 'paso' && E.leerNumero(valor) > 0) {
          el.add(new Option(valor.replace('.', ','), valor));
          el.value = valor;
        } else {
          el.value = VALORES_INICIALES[k];
        }
      } else {
        el.value = valor;
      }
    }
  }

  function guardarEnUrl() {
    const q = new URLSearchParams();
    for (const k of CAMPOS) {
      const valor = campo(k).value.trim();
      if (valor !== '' && valor !== VALORES_INICIALES[k]) q.set(k, valor);
    }
    const url = location.pathname + (q.toString() ? '?' + q : '');
    try {
      history.replaceState(null, '', url);
      enlaceCompartible = location.href;
    } catch (e) {
      // Algunos navegadores no permiten cambiar la URL al abrir el archivo directamente (file://).
      enlaceCompartible = location.href.split('?')[0] + (q.toString() ? '?' + q : '');
    }
  }

  /* ---------- Cálculo ---------- */

  function leerParametros() {
    const v = {};
    for (const k of NUMERICOS) v[k] = E.leerNumero(campo(k).value);
    v.orden = campo('orden').value;
    return v;
  }

  function mostrarErrores(err) {
    for (const k of NUMERICOS) {
      campo(k).setAttribute('aria-invalid', err[k] ? 'true' : 'false');
      $('#err-' + k).textContent = err[k] || '';
    }
  }

  function actualizar() {
    guardarEnUrl();
    const v = leerParametros();
    const err = E.validar(v);
    mostrarErrores(err);

    const hayErrores = Object.keys(err).length > 0;
    document.querySelectorAll('.salida .btn').forEach((b) => { b.disabled = hayErrores; });

    if (hayErrores) {
      resultado = null;
      tabla.innerHTML = '';
      hojas.innerHTML = '';
      $('#resumen').innerHTML = '<p class="resumen-error">Revisa los parámetros marcados para generar la escala.</p>';
      $('#info-paginas').textContent = '';
      return;
    }

    resultado = E.calcular(v);
    tablaPendiente = true;
    renderResumen();
    renderTabla(true);
    renderHojas();
  }

  /* ---------- Resumen ---------- */

  function textoAjuste(r) {
    const v = r.params;
    const a = r.ajuste;
    const tope = Math.round(E.TOPE_DESCUENTO * 100) + ' %';
    if (!a.ajustado) {
      return v.pobt === null
        ? 'Sin ajuste: se usa el puntaje ideal (' + fc(v.pideal) + '). Ingresa el puntaje máximo obtenido para ajustar la escala.'
        : 'Sin ajuste: el puntaje máximo obtenido es igual al ideal.';
    }
    const base = 'Promedio entre ideal (' + fc(v.pideal) + ') y obtenido (' + fc(v.pobt) + ') = ' + fc(a.promedio) + '. ';
    if (a.topeAplicado) {
      return base + 'Eso descontaría ' + fc(a.descuentoPromedio) + ' puntos (' + pct(a.descuentoPromedio / v.pideal) +
        '), más que el tope de ' + tope + ', así que se descuentan solo ' + fc(a.descuento) + ' puntos.';
    }
    return base + 'Descuento de ' + fc(a.descuento) + ' puntos (' + pct(a.descuento / v.pideal) + '), dentro del tope de ' + tope + '.';
  }

  /** Exigencia efectiva: qué fracción del puntaje ideal se necesita realmente para aprobar. */
  function exigenciaReal(r) {
    return (r.papr / r.params.pideal) * 100;
  }

  function renderResumen() {
    const r = resultado;
    const v = r.params;
    const real = exigenciaReal(r);
    const datos = [
      ['Puntaje máximo considerado', fc(r.pmax), r.ajuste.ajustado ? 'de ' + fc(v.pideal) : '', ''],
      ['Nota ' + fn(v.napr) + ' desde', r.pCorte === null ? '—' : fp(r.pCorte), 'pts (' + fc(v.exig) + ' % = ' + fc(r.papr) + ')', ''],
      ['Nota ' + fn(v.nmax) + ' desde', r.pNotaMaxima === null ? '—' : fp(r.pNotaMaxima), 'pts', ''],
      [
        'Exigencia real sobre el puntaje ideal',
        fc(real) + ' %',
        r.ajuste.ajustado ? 'declaraste ' + fc(v.exig) + ' %' : 'igual a la declarada',
        r.ajuste.ajustado ? ' advertencia' : '',
      ],
    ];
    const aviso = r.ajuste.ajustado
      ? '<p class="resumen-aviso"><strong>Atención:</strong> al bajar la escala, aprobar exige ' + fc(r.papr) + ' de los ' +
        fc(v.pideal) + ' puntos ideales, es decir ' + fc(real) + ' % del total y no el ' + fc(v.exig) + ' % declarado.</p>'
      : '';
    $('#resumen').innerHTML = datos.map(([etiqueta, valor, extra, clase]) =>
      '<div class="dato' + clase + '"><div class="dato-etiqueta">' + etiqueta + '</div><div class="dato-valor">' + valor +
      (extra ? ' <small>' + extra + '</small>' : '') + '</div></div>'
    ).join('') + '<p class="resumen-nota">' + I.escaparHtml(textoAjuste(r)) + '</p>' + aviso;
  }

  /* ---------- Tabla en pantalla ---------- */

  function renderTabla(forzar) {
    if (!resultado) return;
    // La tabla puede medir 0 si la pestaña aún no tiene tamaño (abierta en segundo
    // plano o en una ventana oculta). En ese caso se estima el ancho y, cuando el
    // observador de tamaño avise el ancho real, se redibuja.
    const ancho = tabla.clientWidth || document.documentElement.clientWidth || 1000;
    const columnas = Math.max(1, Math.min(10, Math.floor((ancho + 12) / ANCHO_COLUMNA_PX)));
    if (!forzar && !tablaPendiente && columnas === columnasPantalla) return;
    columnasPantalla = columnas;
    tablaPendiente = false;

    const filas = resultado.filas;
    const porColumna = Math.ceil(filas.length / columnas);
    const partes = [];
    for (let inicio = 0; inicio < filas.length; inicio += porColumna) {
      partes.push('<div class="col"><div class="col-cab" aria-hidden="true"><span>Puntaje</span><span>Nota</span></div>');
      for (let i = inicio; i < Math.min(inicio + porColumna, filas.length); i++) {
        const f = filas[i];
        const p = fp(f.p);
        const n = fn(f.nota);
        partes.push(
          '<button type="button" class="celda ' + (f.aprueba ? 'ok' : 'no') + (f.corte ? ' corte' : '') + '" data-i="' + i +
          '" aria-label="Puntaje ' + p + ', nota ' + n + '"><span class="p">' + p + '</span><span class="n">' + n + '</span></button>'
        );
      }
      partes.push('</div>');
    }
    tabla.style.setProperty('--cols', Math.ceil(filas.length / porColumna));
    tabla.innerHTML = partes.join('');
  }

  /* ---------- Detalle de una celda ---------- */

  function abrirDetalle(fila) {
    const r = resultado;
    const v = r.params;
    const d = E.desglose(r, fila.p);
    const p = fp(fila.p);
    const pasos = [];

    pasos.push('<li><strong>Puntaje máximo considerado: ' + fc(r.pmax) + '.</strong> ' + I.escaparHtml(textoAjuste(r)) + '</li>');
    pasos.push('<li><strong>Puntaje de aprobación:</strong> ' + fc(v.exig) + ' % × ' + fc(r.pmax) + ' = ' + fc(r.papr, 4) + '</li>');

    if (d.tramo === 'maximo') {
      pasos.push('<li>Como ' + p + ' ≥ ' + fc(r.pmax) + ', corresponde la nota máxima: <strong>' + fn(v.nmax) + '</strong>.</li>');
    } else {
      let formula;
      if (d.tramo === 'bajo') {
        formula = '(' + fc(v.napr) + ' − ' + fc(v.nmin) + ') × ' + p + ' ÷ ' + fc(r.papr, 4) + ' + ' + fc(v.nmin);
        pasos.push('<li>Como ' + p + ' &lt; ' + fc(r.papr, 4) + ', se usa el tramo bajo la aprobación:' +
          '<span class="formula">n = ' + formula + ' = ' + fc(d.exacta, 5) + '</span></li>');
      } else {
        formula = '(' + fc(v.nmax) + ' − ' + fc(v.napr) + ') × (' + p + ' − ' + fc(r.papr, 4) + ') ÷ (' + fc(r.pmax) + ' − ' +
          fc(r.papr, 4) + ') + ' + fc(v.napr);
        pasos.push('<li>Como ' + p + ' ≥ ' + fc(r.papr, 4) + ', se usa el tramo sobre la aprobación:' +
          '<span class="formula">n = ' + formula + ' = ' + fc(d.exacta, 5) + '</span></li>');
      }
      pasos.push('<li><strong>Aproximación:</strong> se trunca a ' + E.formatear(d.truncada, 2) + ' y se aproxima a <strong>' + fn(d.nota) + '</strong>.</li>');
    }

    $('#detalle-titulo').textContent = 'Puntaje ' + p + ' → nota ' + fn(fila.nota);
    $('#detalle-cuerpo').innerHTML = '<ol class="pasos">' + pasos.join('') + '</ol>';
    dialogo.showModal();
  }

  /* ---------- Impresión ---------- */

  function opcionesImpresion() {
    return { papel: campo('papel').value, orientacion: campo('orientacion').value, densidad: campo('densidad').value };
  }

  function renderHojas() {
    if (!resultado) return;
    const r = resultado;
    const v = r.params;
    const d = I.disposicion(opcionesImpresion());
    const titulo = campo('titulo').value.trim();

    const linea1 = [
      'Notas ' + fn(v.nmin) + ' a ' + fn(v.nmax),
      'aprobación ' + fn(v.napr),
      'exigencia ' + fc(v.exig) + ' %',
      'incremento ' + fc(v.paso, 4),
    ].join(' · ');
    const linea2 = r.ajuste.ajustado
      ? 'Ideal ' + fc(v.pideal) + ' pts · máx. obtenido ' + fc(v.pobt) + ' · máx. considerado ' + fc(r.pmax) +
        (r.ajuste.topeAplicado ? ' (tope ' + Math.round(E.TOPE_DESCUENTO * 100) + ' %)' : ' (promedio)')
      : 'Puntaje máximo ' + fc(v.pideal) + ' (sin ajuste)';
    const linea3 = 'Nota ' + fn(v.napr) + ' desde ' + (r.pCorte === null ? '—' : fp(r.pCorte)) + ' pts · nota ' + fn(v.nmax) +
      ' desde ' + (r.pNotaMaxima === null ? '—' : fp(r.pNotaMaxima)) + ' pts';

    const { html, paginas } = I.renderizar({
      titulo: titulo ? 'Escala de notas · ' + titulo : 'Escala de notas',
      lineas: [linea1, linea2, linea3],
      marcaHtml: MARCA_IMPRESION,
      pie: [
        'En rojo: notas bajo ' + fn(v.napr) + ' · línea gruesa: primer puntaje aprobatorio',
        'Depto. de Ciencias Preclínicas · Facultad de Medicina UFRO · ' + new Date().toLocaleDateString('es-CL'),
      ],
      filas: r.filas,
      celda: (f) => ({ p: fp(f.p), n: fn(f.nota), clase: (f.aprueba ? 'ok' : 'no') + (f.corte ? ' corte' : '') }),
    }, d);

    hojas.innerHTML = html;
    $('#regla-pagina').textContent = I.reglaPagina(d);

    const texto = paginas + (paginas === 1 ? ' página' : ' páginas') + ' en ' + d.papel.nombre.toLowerCase() + ' ' +
      campo('orientacion').value + ' · hasta ' + d.columnas + ' columnas de ' + d.filas + ' filas por página';
    $('#info-paginas').textContent = r.filas.length + ' filas · se imprimirá en ' + texto + '.';
    $('#info-vista').textContent = texto;
  }

  async function imprimir() {
    if (!resultado) return;
    renderHojas();
    // Espera a que los logos estén decodificados para que no salgan en blanco.
    const logos = [...hojas.querySelectorAll('.hoja:first-child img')];
    await Promise.all(logos.map((img) => img.decode().catch(() => {})));
    window.print();
  }

  function abrirVistaPrevia() {
    if (!resultado) return;
    renderHojas();
    document.body.classList.add('vista-previa');
    window.scrollTo(0, 0);
    $('#btn-vista-cerrar').focus();
  }

  function cerrarVistaPrevia() {
    document.body.classList.remove('vista-previa');
    $('#btn-vista').focus();
  }

  /* ---------- Exportación ---------- */

  function nombreArchivo(ext) {
    const r = resultado;
    const v = r.params;
    const titulo = campo('titulo').value.trim();
    const partes = [
      titulo || 'Escala de notas',
      fc(v.nmin, 1) + '-' + fc(v.nmax, 1),
      fc(r.pmax) + ' pts' + (r.ajuste.ajustado ? ' (ideal ' + fc(v.pideal) + ')' : ''),
      fc(v.exig) + ' pct',
    ];
    return partes.join(', ').replace(/[\\/:*?"<>|]+/g, '-') + '.' + ext;
  }

  function exportarExcel() {
    if (!resultado) return;
    const r = resultado;
    const v = r.params;
    const titulo = campo('titulo').value.trim();

    const escala = [[{ v: 'Puntaje', s: 'negrita' }, { v: 'Nota', s: 'negrita' }]].concat(
      r.filas.map((f) => [f.p, { v: f.nota, s: f.corte ? 'notaNegrita' : f.aprueba ? 'nota' : 'notaRoja' }])
    );

    const parametros = [
      ['Evaluación', titulo || '—'],
      ['Puntaje máximo ideal', v.pideal],
      ['Puntaje máximo obtenido', v.pobt === null ? 'Sin ajuste' : v.pobt],
      ['Promedio ideal / obtenido', r.ajuste.ajustado ? r.ajuste.promedio : '—'],
      ['Tope de descuento', E.TOPE_DESCUENTO * 100 + ' % (' + fc(r.ajuste.tope) + ' pts)'],
      ['Descuento aplicado (pts)', r.ajuste.descuento],
      ['Puntaje máximo considerado', r.pmax],
      ['Exigencia (%)', v.exig],
      ['Puntaje de aprobación (exacto)', Math.round(r.papr * 10000) / 10000],
      ['Nota mínima', v.nmin],
      ['Nota de aprobación', v.napr],
      ['Nota máxima', v.nmax],
      ['Incremento', v.paso],
      ['Nota de aprobación desde (pts)', r.pCorte === null ? '—' : r.pCorte],
      ['Nota máxima desde (pts)', r.pNotaMaxima === null ? '—' : r.pNotaMaxima],
      ['Enlace', enlaceCompartible],
    ].map(([k, valor]) => [{ v: k, s: 'negrita' }, valor]);

    const bytes = X.crear([
      { nombre: 'Escala', anchos: [12, 10], congelarFilas: 1, filas: escala },
      { nombre: 'Parámetros', anchos: [32, 40], filas: parametros },
    ]);
    descargar(new Blob([bytes], { type: X.MIME }), nombreArchivo('xlsx'));
  }

  function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- Eventos ---------- */

  let temporizador = null;
  form.addEventListener('input', (ev) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(actualizar, ev.target.tagName === 'SELECT' ? 0 : 250);
  });
  form.addEventListener('change', () => { clearTimeout(temporizador); actualizar(); });
  form.addEventListener('submit', (ev) => { ev.preventDefault(); actualizar(); });

  tabla.addEventListener('click', (ev) => {
    const celda = ev.target.closest('.celda');
    if (celda && resultado) abrirDetalle(resultado.filas[Number(celda.dataset.i)]);
  });

  $('#btn-imprimir').addEventListener('click', imprimir);
  $('#btn-vista-imprimir').addEventListener('click', imprimir);
  $('#btn-vista').addEventListener('click', abrirVistaPrevia);
  $('#btn-vista-cerrar').addEventListener('click', cerrarVistaPrevia);
  $('#btn-excel').addEventListener('click', exportarExcel);

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && document.body.classList.contains('vista-previa') && !dialogo.open) cerrarVistaPrevia();
  });

  // Ctrl+P / Cmd+P también imprime las hojas paginadas.
  window.addEventListener('beforeprint', renderHojas);

  // Redibuja al cambiar el ancho disponible, incluida la primera vez que la pestaña
  // recibe tamaño (por ejemplo si se abrió en segundo plano).
  let esperaAncho = null;
  const alCambiarAncho = () => {
    clearTimeout(esperaAncho);
    esperaAncho = setTimeout(() => renderTabla(false), 120);
  };
  if (window.ResizeObserver) new ResizeObserver(alCambiarAncho).observe(tabla);
  window.addEventListener('resize', alCambiarAncho);

  cargarDesdeUrl();
  actualizar();
})();
