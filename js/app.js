(function () {
  'use strict';

  const E = window.Escala;
  const I = window.Impresion;
  const X = window.Xlsx;
  const M = window.Metodos;
  const Est = window.Estadistica;

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
  const METODO_POR_DEFECTO = 'departamental';
  const ANCHO_COLUMNA_PX = 124;
  const MARCA_IMPRESION =
    '<div class="hoja-marca"><img class="emblema" src="img/emblema-color.png" alt="">' +
    '<span class="divisor"></span>' +
    '<img class="texto" src="img/texto-color.png" alt="Universidad de La Frontera · Facultad de Medicina · Departamento de Ciencias Preclínicas"></div>';

  const estado = {
    metodoId: METODO_POR_DEFECTO,
    params: {},                       // { metodoId: { paramId: valor } }
    banda: Object.assign({}, M.BANDA_POR_DEFECTO),
    distribucion: { texto: '', valores: [], descartados: [] },
    pobtAutocompletado: false,
  };

  let resultado = null;      // tabla generada
  let evaluacion = null;     // resultado del método activo
  let contexto = null;
  let columnasPantalla = 0;
  let tablaPendiente = true;

  const campo = (nombre) => form.elements[nombre];
  const fc = (n, dec) => E.formatearCorto(n, dec === undefined ? 2 : dec);
  const fp = (p) => E.formatear(p, resultado ? resultado.dec : 0);
  const fn = (n) => E.formatear(n, 1);
  const esc = (s) => I.escaparHtml(s);

  /* ---------- Estado de métodos ---------- */

  const metodoActivo = () => M.obtener(estado.metodoId) || M.obtener(METODO_POR_DEFECTO);

  function paramsDe(metodoId) {
    const metodo = M.obtener(metodoId);
    if (!metodo) return {};
    if (!estado.params[metodoId]) estado.params[metodoId] = M.parametrosPorDefecto(metodo);
    return estado.params[metodoId];
  }

  function construirContexto(v, metodoId) {
    const valores = estado.distribucion.valores;
    return {
      puntajeIdeal: v.pideal,
      puntajeMaximoObtenido: v.pobt,
      puntajes: valores.length ? valores : null,
      exigencia: v.exig / 100,
      nmin: v.nmin,
      napr: v.napr,
      nmax: v.nmax,
      params: paramsDe(metodoId || estado.metodoId),
      banda: estado.banda,
    };
  }

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

    if (q.has('metodo') && M.obtener(q.get('metodo'))) estado.metodoId = q.get('metodo');
    const metodo = metodoActivo();
    const params = paramsDe(metodo.id);
    for (const def of metodo.parametros || []) {
      if (!q.has('m.' + def.id)) continue;
      const bruto = q.get('m.' + def.id);
      if (def.tipo === 'checkbox') params[def.id] = bruto === '1' || bruto === 'true';
      else if (def.tipo === 'number') { const n = E.leerNumero(bruto); if (n !== null && !Number.isNaN(n)) params[def.id] = n; }
      else if (!def.opciones || def.opciones.some((o) => String(o.valor) === bruto)) params[def.id] = bruto;
    }

    if (q.has('banda')) estado.banda.activa = q.get('banda') === '1';
    for (const [clave, prop] of [['bandaMin', 'corteMinPct'], ['bandaMax', 'corteMaxPct']]) {
      const n = E.leerNumero(q.get(clave));
      if (n !== null && !Number.isNaN(n)) estado.banda[prop] = n;
    }
  }

  function guardarEnUrl() {
    const q = new URLSearchParams();
    for (const k of CAMPOS) {
      const valor = campo(k).value.trim();
      if (valor !== '' && valor !== VALORES_INICIALES[k]) q.set(k, valor);
    }
    const metodo = metodoActivo();
    if (metodo.id !== METODO_POR_DEFECTO) q.set('metodo', metodo.id);
    const params = paramsDe(metodo.id);
    for (const def of metodo.parametros || []) {
      const valor = params[def.id];
      if (valor === def.porDefecto) continue;
      q.set('m.' + def.id, def.tipo === 'checkbox' ? (valor ? '1' : '0') : String(valor));
    }
    if (estado.banda.activa !== M.BANDA_POR_DEFECTO.activa) q.set('banda', estado.banda.activa ? '1' : '0');
    if (estado.banda.corteMinPct !== M.BANDA_POR_DEFECTO.corteMinPct) q.set('bandaMin', String(estado.banda.corteMinPct));
    if (estado.banda.corteMaxPct !== M.BANDA_POR_DEFECTO.corteMaxPct) q.set('bandaMax', String(estado.banda.corteMaxPct));

    const url = location.pathname + (q.toString() ? '?' + q : '');
    try {
      history.replaceState(null, '', url);
      enlaceCompartible = location.href;
    } catch (e) {
      // Algunos navegadores no permiten cambiar la URL al abrir el archivo directamente (file://).
      enlaceCompartible = location.href.split('?')[0] + (q.toString() ? '?' + q : '');
    }
  }

  let enlaceCompartible = location.href;

  /* ---------- Lectura del formulario ---------- */

  function leerBase() {
    const v = {};
    for (const k of NUMERICOS) v[k] = E.leerNumero(campo(k).value);
    v.orden = campo('orden').value;
    return v;
  }

  function mostrarErroresBase(err) {
    for (const k of NUMERICOS) {
      campo(k).setAttribute('aria-invalid', err[k] ? 'true' : 'false');
      $('#err-' + k).textContent = err[k] || '';
    }
  }

  /* ---------- Distribución de puntajes ---------- */

  function leerDistribucion() {
    const texto = $('#puntajes').value;
    const pideal = E.leerNumero(campo('pideal').value);
    const maximo = pideal !== null && !Number.isNaN(pideal) && pideal > 0 ? pideal : undefined;
    estado.distribucion = Object.assign({ texto }, Est.leerDistribucion(texto, { maximo }));

    const valores = estado.distribucion.valores;
    if (valores.length) {
      const maximoObtenido = Math.max(...valores);
      const actual = campo('pobt').value.trim();
      if (actual === '' || estado.pobtAutocompletado) {
        campo('pobt').value = E.formatearCorto(maximoObtenido, 4);
        estado.pobtAutocompletado = true;
      }
    }
    renderDistribucion();
  }

  function renderDistribucion() {
    const { valores, descartados } = estado.distribucion;
    const r = Est.resumen(valores);
    const insignia = $('#dist-insignia');
    insignia.textContent = r ? r.n + ' puntajes' : 'sin cargar';
    insignia.className = 'insignia' + (r ? ' insignia-ok' : '');

    if (!r) {
      $('#dist-estado').innerHTML = descartados.length
        ? avisoDescartados(descartados)
        : '<p class="ayuda">Pega aquí una columna de puntajes (uno por línea). Habilita los métodos de Cohen y ' +
          'permite estimar la tasa de reprobación de cada método.</p>';
      return;
    }
    const fila = (etiqueta, valor) => '<div><dt>' + etiqueta + '</dt><dd>' + fc(valor) + '</dd></div>';
    $('#dist-estado').innerHTML =
      '<dl class="dist-resumen">' +
      fila('n', r.n) + fila('Mínimo', r.min) + fila('Máximo', r.max) + fila('Mediana', r.mediana) +
      fila('P90', r.p90) + fila('P95', r.p95) +
      '</dl>' + (descartados.length ? avisoDescartados(descartados) : '');
  }

  function avisoDescartados(descartados) {
    const detalle = descartados.slice(0, 8).map((d) => '«' + esc(d.texto) + '» (' + d.motivo + ')').join(', ');
    return '<p class="dist-descartes">Se descartaron ' + descartados.length +
      (descartados.length === 1 ? ' valor: ' : ' valores: ') + detalle +
      (descartados.length > 8 ? ' y otros más.' : '.') + '</p>';
  }

  /* ---------- Selector de método y parámetros ---------- */

  function renderSelectorMetodos(v) {
    const contenedor = $('#selector-metodo');
    const ctxBase = v ? construirContexto(v) : null;
    const motivos = [];
    contenedor.innerHTML = M.lista().map((m) => {
      const disp = ctxBase ? M.disponibilidad(m, Object.assign({}, ctxBase, { params: paramsDe(m.id) })) : { ok: true };
      const activo = m.id === estado.metodoId;
      if (!disp.ok) motivos.push('<strong>' + esc(m.nombre) + ':</strong> ' + esc(disp.motivo));
      return '<button type="button" role="radio" aria-checked="' + activo + '" class="seg-boton' +
        (activo ? ' activo' : '') + (disp.ok ? '' : ' no-disponible') + '" data-metodo="' + m.id + '"' +
        (disp.ok || activo ? '' : ' disabled') + '>' + esc(m.nombre) + '</button>';
    }).join('');

    const metodo = metodoActivo();
    $('#metodo-descripcion').innerHTML =
      esc(metodo.descripcionCorta) +
      (metodo.referenciaBibliografica ? ' <span class="cita">' + esc(metodo.referenciaBibliografica) + '</span>' : '');
    $('#metodo-no-disponibles').innerHTML = motivos.length ? motivos.map((m) => '<p>' + m + '</p>').join('') : '';
  }

  function renderParametrosMetodo() {
    const metodo = metodoActivo();
    const params = paramsDe(metodo.id);
    const defs = (metodo.parametros || []).filter((d) => !d.visibleSi || d.visibleSi(params));
    const contenedor = $('#parametros-metodo');
    contenedor.innerHTML = defs.length
      ? defs.map((d) => campoParametro(d, params[d.id])).join('')
      : '<p class="ayuda">Este método no tiene parámetros ajustables.</p>';
  }

  function campoParametro(def, valor) {
    const id = 'param-' + def.id;
    const ayuda = def.ayuda ? '<small class="ayuda">' + esc(def.ayuda) + '</small>' : '';
    if (def.tipo === 'checkbox') {
      return '<div class="campo campo-check"><label for="' + id + '"><input type="checkbox" id="' + id + '" data-param="' +
        def.id + '"' + (valor ? ' checked' : '') + '> ' + esc(def.etiqueta) + '</label>' + ayuda + '</div>';
    }
    if (def.tipo === 'select') {
      const opciones = (def.opciones || []).map((o) =>
        '<option value="' + esc(String(o.valor)) + '"' + (String(o.valor) === String(valor) ? ' selected' : '') + '>' +
        esc(o.etiqueta) + '</option>').join('');
      return '<div class="campo"><label for="' + id + '">' + esc(def.etiqueta) + '</label>' +
        '<select id="' + id + '" data-param="' + def.id + '">' + opciones + '</select>' + ayuda + '</div>';
    }
    return '<div class="campo"><label for="' + id + '">' + esc(def.etiqueta) + '</label>' +
      '<input id="' + id + '" data-param="' + def.id + '" inputmode="decimal" value="' + esc(E.formatearCorto(valor, 4)) + '">' +
      ayuda + '</div>';
  }

  function leerParametroDesdeControl(control) {
    const metodo = metodoActivo();
    const def = (metodo.parametros || []).find((d) => d.id === control.dataset.param);
    if (!def) return false;
    const params = paramsDe(metodo.id);
    if (def.tipo === 'checkbox') {
      params[def.id] = control.checked;
      return true;
    }
    if (def.tipo === 'select') {
      params[def.id] = control.value;
      return true;
    }
    const n = E.leerNumero(control.value);
    if (n === null || Number.isNaN(n)) return false;
    let valor = n;
    if (def.min !== undefined) valor = Math.max(def.min, valor);
    if (def.max !== undefined) valor = Math.min(def.max, valor);
    params[def.id] = valor;
    return true;
  }

  /* ---------- Ciclo principal ---------- */

  function actualizar() {
    guardarEnUrl();
    const v = leerBase();
    const err = E.validarBase(v);
    mostrarErroresBase(err);
    renderSelectorMetodos(Object.keys(err).length ? null : v);

    if (Object.keys(err).length) return limpiarSalida('Revisa los parámetros marcados para generar la escala.');

    contexto = construirContexto(v);
    evaluacion = M.evaluar(estado.metodoId, contexto);

    if (evaluacion.errores && evaluacion.errores.length) {
      renderComparativa(v);
      return limpiarSalida(evaluacion.errores.join(' '));
    }

    resultado = E.generar({
      pideal: v.pideal, papr: evaluacion.papr, pmax: evaluacion.pmax,
      nmin: v.nmin, napr: v.napr, nmax: v.nmax, paso: v.paso, orden: v.orden,
    });
    tablaPendiente = true;

    document.querySelectorAll('.salida .btn').forEach((b) => { b.disabled = false; });
    renderResumen(v);
    renderAdvertencias();
    renderComparativa(v);
    renderExplicacion();
    renderTabla(true);
    renderHojas();
  }

  function limpiarSalida(mensaje) {
    resultado = null;
    tabla.innerHTML = '';
    hojas.innerHTML = '';
    $('#resumen').innerHTML = '<p class="resumen-error">' + esc(mensaje) + '</p>';
    $('#advertencias').innerHTML = '';
    $('#explicacion').innerHTML = '';
    $('#info-paginas').textContent = '';
    document.querySelectorAll('.salida .btn').forEach((b) => { b.disabled = true; });
  }

  /* ---------- Resumen ---------- */

  function renderResumen(v) {
    const r = resultado;
    const exigenciaReal = (evaluacion.papr / v.pideal) * 100;
    const difiere = Math.abs(exigenciaReal - v.exig) > 0.05;
    const referencia = evaluacion.referencia;

    const datos = [
      ['Nota ' + fn(v.napr) + ' desde', r.pCorte === null ? '—' : fp(r.pCorte), 'pts (corte ' + fc(evaluacion.papr) + ')', ''],
      ['Nota ' + fn(v.nmax) + ' desde', r.pNotaMaxima === null ? '—' : fp(r.pNotaMaxima), 'pts', ''],
      ['Exigencia real sobre el puntaje ideal', fc(exigenciaReal) + ' %',
        difiere ? 'declaraste ' + fc(v.exig) + ' %' : 'igual a la declarada', difiere ? ' advertencia' : ''],
      referencia
        ? [referencia.etiqueta, fc(referencia.valor), 'pts de referencia', '']
        : ['Filas de la tabla', String(r.filas.length), '', ''],
    ];

    $('#resumen').innerHTML = datos.map(([etiqueta, valor, extra, clase]) =>
      '<div class="dato' + clase + '"><div class="dato-etiqueta">' + esc(etiqueta) + '</div><div class="dato-valor">' +
      esc(valor) + (extra ? ' <small>' + esc(extra) + '</small>' : '') + '</div></div>'
    ).join('') +
      '<p class="resumen-nota"><strong>' + esc(metodoActivo().nombre) + ':</strong> ' + esc(resumenTrazabilidad()) + '</p>';
  }

  /**
   * Trazabilidad en una línea.
   * @param {string[]} [soloClaves] limita a estas claves, en ese orden (para la hoja impresa,
   *                                donde los parámetros ya aparecen en su propia línea).
   */
  function resumenTrazabilidad(soloClaves) {
    const traza = evaluacion.trazabilidad || {};
    const claves = soloClaves ? soloClaves.filter((k) => k in traza) : Object.keys(traza).filter((k) => k !== 'Método');
    return claves.map((k) => k + ': ' + (typeof traza[k] === 'number' ? fc(traza[k]) : traza[k])).join(' · ');
  }

  // Claves que aportan información nueva en el encabezado impreso.
  const CLAVES_IMPRESION = [
    'Puntajes cargados (n)', 'Puntaje de referencia (X)', 'Convención de percentil',
    'Puntaje máximo considerado', 'Tope aplicado', 'Corrección por azar (R)',
    'Banda admisible', 'Corte antes del recorte',
  ];

  function renderAdvertencias() {
    const avisos = evaluacion.advertencias || [];
    $('#advertencias').innerHTML = avisos.length
      ? avisos.map((a) => '<p class="aviso">' + esc(a) + '</p>').join('')
      : '';
  }

  /* ---------- Panel comparativo ---------- */

  function renderComparativa(v) {
    const valores = estado.distribucion.valores;
    const filas = M.lista().map((m) => {
      const ctx = construirContexto(v, m.id);
      const r = M.evaluar(m.id, ctx);
      const activo = m.id === estado.metodoId;
      if (!r.papr || (r.errores && r.errores.length)) {
        return '<tr' + (activo ? ' class="activo"' : '') + '><th scope="row">' + esc(m.nombre) + '</th>' +
          '<td colspan="3" class="no-disponible">' + esc((r.errores && r.errores[0]) || 'No disponible') + '</td></tr>';
      }
      const pct = (r.papr / v.pideal) * 100;
      const reprobacion = valores.length ? fc(Est.tasaReprobacion(valores, r.papr) * 100) + ' %' : '—';
      return '<tr' + (activo ? ' class="activo"' : '') + '><th scope="row">' + esc(m.nombre) + (activo ? ' <span class="etiqueta-activo">en uso</span>' : '') + '</th>' +
        '<td>' + fc(r.papr) + ' pts</td><td>' + fc(pct) + ' %</td><td>' + reprobacion + '</td></tr>';
    }).join('');

    $('#comparativa').innerHTML =
      '<h2>Comparación de métodos</h2>' +
      '<div class="tabla-desliz"><table class="comparativa"><thead><tr><th scope="col">Método</th>' +
      '<th scope="col">Corte</th><th scope="col">% del ideal</th><th scope="col">Reprobación</th></tr></thead>' +
      '<tbody>' + filas + '</tbody></table></div>' +
      '<p class="ayuda">' + (valores.length
        ? 'Reprobación simulada sobre los ' + valores.length + ' puntajes cargados.'
        : 'Carga los puntajes del curso para estimar la tasa de reprobación de cada método.') + '</p>';
  }

  /* ---------- Explicación dinámica ---------- */

  function renderExplicacion() {
    const metodo = metodoActivo();
    const html = metodo.explicar ? metodo.explicar(contexto, evaluacion) : '';
    $('#explicacion').innerHTML =
      '<h3>' + esc(metodo.nombre) + '</h3>' + html +
      (metodo.referenciaBibliografica ? '<p class="cita">' + esc(metodo.referenciaBibliografica) + '</p>' : '');
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
    const v = r.cfg;
    const d = E.desglose(r, fila.p);
    const p = fp(fila.p);
    const pasos = [];

    pasos.push('<li><strong>Método:</strong> ' + esc(metodoActivo().nombre) + '. ' + esc(resumenTrazabilidad()) + '</li>');
    pasos.push('<li><strong>Puntaje de aprobación:</strong> ' + fc(r.papr, 4) + ' pts · <strong>nota máxima desde:</strong> ' + fc(r.pmax, 4) + ' pts</li>');

    if (d.tramo === 'maximo') {
      pasos.push('<li>Como ' + p + ' ≥ ' + fc(r.pmax) + ', corresponde la nota máxima: <strong>' + fn(v.nmax) + '</strong>.</li>');
    } else {
      const formula = d.tramo === 'bajo'
        ? fc(v.nmin) + ' + (' + fc(v.napr) + ' − ' + fc(v.nmin) + ') × ' + p + ' ÷ ' + fc(r.papr, 4)
        : fc(v.napr) + ' + (' + fc(v.nmax) + ' − ' + fc(v.napr) + ') × (' + p + ' − ' + fc(r.papr, 4) + ') ÷ (' +
          fc(r.pmax, 4) + ' − ' + fc(r.papr, 4) + ')';
      pasos.push('<li>Como ' + p + (d.tramo === 'bajo' ? ' &lt; ' : ' ≥ ') + fc(r.papr, 4) +
        ', se usa el tramo ' + (d.tramo === 'bajo' ? 'bajo' : 'sobre') + ' la aprobación:' +
        '<span class="formula">n = ' + formula + ' = ' + fc(d.exacta, 5) + '</span></li>');
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

  /** Parámetros del método en una línea, para el encabezado impreso. */
  function parametrosEnLinea() {
    const metodo = metodoActivo();
    const params = paramsDe(metodo.id);
    return (metodo.parametros || [])
      .filter((d) => !d.visibleSi || d.visibleSi(params))
      .map((d) => {
        const valor = params[d.id];
        if (d.tipo === 'checkbox') return d.etiqueta + ': ' + (valor ? 'sí' : 'no');
        if (d.tipo === 'select') {
          const op = (d.opciones || []).find((o) => String(o.valor) === String(valor));
          return d.etiqueta + ': ' + (op ? op.etiqueta : valor);
        }
        return d.etiqueta + ': ' + fc(valor, 4);
      })
      .join(' · ');
  }

  function renderHojas() {
    if (!resultado) return;
    const r = resultado;
    const v = r.cfg;
    const d = I.disposicion(opcionesImpresion());
    const titulo = campo('titulo').value.trim();
    const metodo = metodoActivo();
    const n = estado.distribucion.valores.length;
    const pctPapr = (evaluacion.papr / v.pideal) * 100;
    const pctPmax = (evaluacion.pmax / v.pideal) * 100;

    const lineas = [
      'Notas ' + fn(v.nmin) + ' a ' + fn(v.nmax) + ' · aprobación ' + fn(v.napr) + ' · incremento ' + fc(v.paso, 4) +
        ' · puntaje ideal ' + fc(v.pideal),
      'Método: ' + metodo.nombre + (parametrosEnLinea() ? ' · ' + parametrosEnLinea() : '') +
        (n ? ' · n = ' + n : '') + (evaluacion.referencia ? ' · ' + evaluacion.referencia.etiqueta + ' = ' + fc(evaluacion.referencia.valor) : ''),
      'Nota ' + fn(v.napr) + ' desde ' + fc(evaluacion.papr) + ' pts (' + fc(pctPapr) + ' % del ideal) · nota ' + fn(v.nmax) +
        ' desde ' + fc(evaluacion.pmax) + ' pts (' + fc(pctPmax) + ' %)',
      resumenTrazabilidad(CLAVES_IMPRESION),
    ].filter((linea) => linea && linea.trim() !== '');

    const { html, paginas } = I.renderizar({
      titulo: titulo ? 'Escala de notas · ' + titulo : 'Escala de notas',
      lineas,
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
    const v = resultado.cfg;
    const titulo = campo('titulo').value.trim();
    const partes = [
      titulo || 'Escala de notas',
      metodoActivo().nombre,
      fc(v.nmin, 1) + '-' + fc(v.nmax, 1),
      'corte ' + fc(evaluacion.papr) + ' de ' + fc(v.pideal) + ' pts',
    ];
    return partes.join(', ').replace(/[\\/:*?"<>|]+/g, '-') + '.' + ext;
  }

  function exportarExcel() {
    if (!resultado) return;
    const r = resultado;
    const v = r.cfg;
    const titulo = campo('titulo').value.trim();
    const n = estado.distribucion.valores.length;

    const escala = [[{ v: 'Puntaje', s: 'negrita' }, { v: 'Nota', s: 'negrita' }]].concat(
      r.filas.map((f) => [f.p, { v: f.nota, s: f.corte ? 'notaNegrita' : f.aprueba ? 'nota' : 'notaRoja' }])
    );

    const filas = [
      ['Evaluación', titulo || '—'],
      ['Método aplicado', metodoActivo().nombre],
      ['Referencia bibliográfica', metodoActivo().referenciaBibliografica || '—'],
    ];
    for (const [clave, valor] of Object.entries(evaluacion.trazabilidad || {})) {
      if (clave === 'Método') continue;
      filas.push([clave, valor]);
    }
    filas.push(
      ['Puntajes cargados (n)', n || 'no se cargó la distribución'],
      ['Puntaje ideal', v.pideal],
      ['Puntaje de aprobación (papr)', Math.round(evaluacion.papr * 10000) / 10000],
      ['Puntaje de aprobación (% del ideal)', Math.round((evaluacion.papr / v.pideal) * 10000) / 100],
      ['Puntaje de nota máxima (pmax)', Math.round(evaluacion.pmax * 10000) / 10000],
      ['Puntaje de nota máxima (% del ideal)', Math.round((evaluacion.pmax / v.pideal) * 10000) / 100],
      ['Nota mínima', v.nmin],
      ['Nota de aprobación', v.napr],
      ['Nota máxima', v.nmax],
      ['Incremento', v.paso],
      ['Nota de aprobación desde (pts)', r.pCorte === null ? '—' : r.pCorte],
      ['Nota máxima desde (pts)', r.pNotaMaxima === null ? '—' : r.pNotaMaxima],
      ['Aproximación', 'truncar a centésimas y aproximar a décimas (5 hacia arriba)'],
      ['Enlace', enlaceCompartible]
    );
    for (const aviso of evaluacion.advertencias || []) filas.push(['Advertencia', aviso]);

    const hojasExcel = [
      { nombre: 'Escala', anchos: [12, 10], congelarFilas: 1, filas: escala },
      { nombre: 'Parámetros', anchos: [34, 58], filas: filas.map(([k, valor]) => [{ v: k, s: 'negrita' }, valor]) },
    ];
    if (n) {
      const res = Est.resumen(estado.distribucion.valores);
      hojasExcel.push({
        nombre: 'Distribución',
        anchos: [12, 14],
        filas: [[{ v: 'Puntaje', s: 'negrita' }, { v: 'Nota', s: 'negrita' }]].concat(
          [...estado.distribucion.valores].sort((a, b) => a - b).map((p) => [p, { v: E.aproximarNota(E.nota(p, r.cfg)), s: 'nota' }])
        ).concat([
          [], [{ v: 'n', s: 'negrita' }, res.n], [{ v: 'Mínimo', s: 'negrita' }, res.min], [{ v: 'Máximo', s: 'negrita' }, res.max],
          [{ v: 'Mediana', s: 'negrita' }, res.mediana], [{ v: 'P90', s: 'negrita' }, res.p90], [{ v: 'P95', s: 'negrita' }, res.p95],
          [{ v: 'Reprobación', s: 'negrita' }, Math.round(Est.tasaReprobacion(estado.distribucion.valores, evaluacion.papr) * 10000) / 100],
        ])
      });
    }

    const bytes = X.crear(hojasExcel);
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
    if (ev.target.id === 'pobt') estado.pobtAutocompletado = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      if (ev.target.id === 'pideal') leerDistribucion();
      actualizar();
    }, ev.target.tagName === 'SELECT' ? 0 : 250);
  });
  form.addEventListener('change', () => { clearTimeout(temporizador); actualizar(); });
  form.addEventListener('submit', (ev) => { ev.preventDefault(); actualizar(); });

  $('#selector-metodo').addEventListener('click', (ev) => {
    const boton = ev.target.closest('[data-metodo]');
    if (!boton || boton.disabled) return;
    estado.metodoId = boton.dataset.metodo;
    renderParametrosMetodo();
    actualizar();
  });

  const contenedorParams = $('#parametros-metodo');
  contenedorParams.addEventListener('change', (ev) => {
    if (!ev.target.dataset.param) return;
    if (leerParametroDesdeControl(ev.target)) {
      // Los select y checkbox pueden mostrar u ocultar otros parámetros.
      if (ev.target.type === 'checkbox' || ev.target.tagName === 'SELECT') renderParametrosMetodo();
      actualizar();
    }
  });
  contenedorParams.addEventListener('input', (ev) => {
    if (!ev.target.dataset.param || ev.target.tagName === 'SELECT' || ev.target.type === 'checkbox') return;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { if (leerParametroDesdeControl(ev.target)) actualizar(); }, 300);
  });

  let temporizadorDist = null;
  $('#puntajes').addEventListener('input', () => {
    clearTimeout(temporizadorDist);
    temporizadorDist = setTimeout(() => { leerDistribucion(); actualizar(); }, 300);
  });
  $('#dist-limpiar').addEventListener('click', () => {
    $('#puntajes').value = '';
    estado.pobtAutocompletado = false;
    leerDistribucion();
    actualizar();
  });

  $('#banda-activa').addEventListener('change', (ev) => { estado.banda.activa = ev.target.checked; actualizar(); });
  for (const [id, prop] of [['banda-min', 'corteMinPct'], ['banda-max', 'corteMaxPct']]) {
    $('#' + id).addEventListener('change', (ev) => {
      const n = E.leerNumero(ev.target.value);
      if (n !== null && !Number.isNaN(n)) estado.banda[prop] = Math.min(100, Math.max(0, n));
      ev.target.value = E.formatearCorto(estado.banda[prop], 2);
      actualizar();
    });
  }

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

  /* ---------- Arranque ---------- */

  cargarDesdeUrl();
  $('#banda-activa').checked = estado.banda.activa;
  $('#banda-min').value = E.formatearCorto(estado.banda.corteMinPct, 2);
  $('#banda-max').value = E.formatearCorto(estado.banda.corteMaxPct, 2);
  renderParametrosMetodo();
  leerDistribucion();
  actualizar();
})();
