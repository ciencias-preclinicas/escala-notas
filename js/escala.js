/*
 * Cálculo de escalas de notas (sin dependencias).
 * Disponible como window.Escala en el navegador y como módulo CommonJS en Node.
 */
(function (root) {
  'use strict';

  // Máximo descuento permitido sobre el puntaje ideal (10 %).
  const TOPE_DESCUENTO = 0.10;
  // Límite de filas para no congelar el navegador.
  const MAX_FILAS = 20001;
  const EPS = 1e-9;

  /** Convierte texto ("4,5", "4.5", "") en número, null (vacío) o NaN (inválido). */
  function leerNumero(texto) {
    if (texto === null || texto === undefined) return null;
    const s = String(texto).trim().replace(/\s+/g, '').replace(',', '.');
    if (s === '') return null;
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return Number(s);
  }

  function decimalesDe(n) {
    const s = String(n);
    const i = s.indexOf('.');
    return i < 0 ? 0 : Math.min(4, s.length - i - 1);
  }

  function redondear(x, dec) {
    const f = Math.pow(10, dec);
    return Math.round(x * f) / f;
  }

  /**
   * Puntaje máximo considerado para la escala.
   * Promedio entre el ideal y el máximo obtenido, sin descontar más del 10 % del ideal.
   */
  function puntajeConsiderado(ideal, obtenido) {
    const tope = ideal * TOPE_DESCUENTO;
    if (obtenido === null || obtenido === undefined || obtenido >= ideal) {
      return { pmax: ideal, ajustado: false, promedio: null, descuento: 0, descuentoPromedio: 0, tope, topeAplicado: false };
    }
    const promedio = (ideal + obtenido) / 2;
    const descuentoPromedio = ideal - promedio;
    const topeAplicado = descuentoPromedio > tope + EPS;
    const pmax = topeAplicado ? ideal - tope : promedio;
    return { pmax, ajustado: true, promedio, descuento: ideal - pmax, descuentoPromedio, tope, topeAplicado };
  }

  /** Nota sin aproximar: dos rectas unidas en el punto de aprobación. */
  function notaExacta(p, e) {
    if (p >= e.pmax) return e.nmax;
    if (p < e.papr) return (e.napr - e.nmin) * p / e.papr + e.nmin;
    return (e.nmax - e.napr) * (p - e.papr) / (e.pmax - e.papr) + e.napr;
  }

  /** Aproximación tradicional chilena: truncar a centésimas y redondear a décimas (5 hacia arriba). */
  function truncarCentesimas(x) {
    return Math.floor(x * 100 + 1e-6) / 100;
  }
  function aproximarNota(x) {
    const centesimas = Math.floor(x * 100 + 1e-6);
    return Math.floor((centesimas + 5) / 10) / 10;
  }

  /** Devuelve un objeto { campo: mensaje } con los errores encontrados. */
  function validar(v) {
    const err = {};
    const requerido = (k, nombre) => {
      if (v[k] === null) err[k] = 'Ingresa ' + nombre + '.';
      else if (Number.isNaN(v[k])) err[k] = 'Debe ser un número.';
    };
    requerido('pideal', 'el puntaje ideal');
    requerido('exig', 'la exigencia');
    requerido('nmin', 'la nota mínima');
    requerido('napr', 'la nota de aprobación');
    requerido('nmax', 'la nota máxima');
    requerido('paso', 'el incremento');
    if (Number.isNaN(v.pobt)) err.pobt = 'Debe ser un número.';

    if (!err.pideal && v.pideal <= 0) err.pideal = 'Debe ser mayor que 0.';
    if (!err.pobt && v.pobt !== null) {
      if (v.pobt < 0) err.pobt = 'No puede ser negativo.';
      else if (!err.pideal && v.pobt > v.pideal) err.pobt = 'No puede superar el puntaje ideal.';
    }
    if (!err.exig && (v.exig <= 0 || v.exig >= 100)) err.exig = 'Debe estar entre 0 y 100.';
    if (!err.nmin && !err.napr && v.napr <= v.nmin) err.napr = 'Debe ser mayor que la nota mínima.';
    if (!err.napr && !err.nmax && v.nmax <= v.napr) err.nmax = 'Debe ser mayor que la nota de aprobación.';
    if (!err.paso && v.paso <= 0) err.paso = 'Debe ser mayor que 0.';
    if (!err.pideal && !err.paso && Math.floor(v.pideal / v.paso + EPS) + 1 > MAX_FILAS) {
      err.paso = 'La tabla tendría más de ' + MAX_FILAS + ' filas. Usa un incremento mayor.';
    }
    return err;
  }

  /** Genera la escala completa. Supone parámetros ya validados. */
  function calcular(v) {
    const ajuste = puntajeConsiderado(v.pideal, v.pobt);
    const pmax = ajuste.pmax;
    const papr = v.exig * pmax / 100;
    const esc = { nmin: v.nmin, napr: v.napr, nmax: v.nmax, pmax, papr };
    const dec = Math.max(decimalesDe(v.paso), decimalesDe(v.pideal));

    const fila = (p) => {
      const exacta = notaExacta(p, esc);
      const nota = aproximarNota(exacta);
      return { p, exacta, nota, aprueba: nota >= v.napr - EPS, maxima: p >= pmax - EPS };
    };

    const filas = [];
    const n = Math.floor(v.pideal / v.paso + EPS);
    for (let i = 0; i <= n; i++) filas.push(fila(redondear(i * v.paso, dec)));
    if (filas[filas.length - 1].p < v.pideal - EPS) filas.push(fila(v.pideal));

    const primeraAprobada = filas.find((f) => f.aprueba);
    const primeraMaxima = filas.find((f) => f.nota >= v.nmax - EPS);
    const pCorte = primeraAprobada ? primeraAprobada.p : null;
    for (const f of filas) f.corte = f.p === pCorte;

    if (v.orden === 'descendente') filas.reverse();

    return {
      params: v,
      ajuste,
      pmax,
      papr,
      dec,
      filas,
      pCorte,
      pNotaMaxima: primeraMaxima ? primeraMaxima.p : null,
    };
  }

  /** Detalle paso a paso del cálculo para un puntaje. */
  function desglose(res, p) {
    const v = res.params;
    const esc = { nmin: v.nmin, napr: v.napr, nmax: v.nmax, pmax: res.pmax, papr: res.papr };
    const exacta = notaExacta(p, esc);
    const tramo = p >= res.pmax ? 'maximo' : p < res.papr ? 'bajo' : 'sobre';
    return { p, tramo, exacta, truncada: truncarCentesimas(exacta), nota: aproximarNota(exacta) };
  }

  function formatear(n, dec) {
    return n.toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: false });
  }

  /** Formato con hasta `maxDec` decimales, sin ceros sobrantes. */
  function formatearCorto(n, maxDec) {
    return n.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: maxDec === undefined ? 2 : maxDec, useGrouping: false });
  }

  const Escala = {
    TOPE_DESCUENTO,
    MAX_FILAS,
    leerNumero,
    decimalesDe,
    puntajeConsiderado,
    notaExacta,
    truncarCentesimas,
    aproximarNota,
    validar,
    calcular,
    desglose,
    formatear,
    formatearCorto,
  };

  if (typeof module === 'object' && module.exports) module.exports = Escala;
  else root.Escala = Escala;
})(typeof window !== 'undefined' ? window : globalThis);
