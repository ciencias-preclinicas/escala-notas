/*
 * Núcleo de cálculo: conversión de puntaje en nota y generación de la tabla.
 *
 * Es agnóstico al método de determinación del corte: solo recibe el puntaje que
 * otorga la nota de aprobación (papr) y el que otorga la nota máxima (pmax).
 * Cada método (js/metodos/) decide cómo se obtienen esos dos valores.
 *
 * Disponible como window.Escala en el navegador y como módulo CommonJS en Node.
 */
(function (root) {
  'use strict';

  // Límite de filas para no congelar el navegador.
  const MAX_FILAS = 20001;
  const EPS = 1e-9;

  /** Convierte texto ("4,5", "4.5", "") en número, null (vacío) o NaN (inválido). */
  function leerNumero(texto) {
    if (texto === null || texto === undefined) return null;
    if (typeof texto === 'number') return texto;
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
   * Nota exacta, sin aproximar: dos rectas que se unen en el puntaje de aprobación.
   * @param {number} p puntaje obtenido
   * @param {{papr: number, pmax: number, nmin?: number, napr?: number, nmax?: number}} esc
   */
  function nota(p, esc) {
    const nmin = esc.nmin === undefined ? 1.0 : esc.nmin;
    const napr = esc.napr === undefined ? 4.0 : esc.napr;
    const nmax = esc.nmax === undefined ? 7.0 : esc.nmax;
    if (p <= 0) return nmin;
    if (p >= esc.pmax) return nmax;
    return p < esc.papr
      ? nmin + (napr - nmin) * (p / esc.papr)
      : napr + (nmax - napr) * ((p - esc.papr) / (esc.pmax - esc.papr));
  }

  /** Aproximación tradicional chilena: truncar a centésimas y redondear a décimas (5 hacia arriba). */
  function truncarCentesimas(x) {
    return Math.floor(x * 100 + 1e-6) / 100;
  }
  function aproximarNota(x) {
    const centesimas = Math.floor(x * 100 + 1e-6);
    return Math.floor((centesimas + 5) / 10) / 10;
  }

  /**
   * Valida los datos que no dependen del método.
   * @returns {Object} { campo: mensaje }
   */
  function validarBase(v) {
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

  /**
   * Genera la tabla completa de puntajes y notas.
   * @param {{pideal, papr, pmax, nmin, napr, nmax, paso, orden}} cfg
   */
  function generar(cfg) {
    const esc = { papr: cfg.papr, pmax: cfg.pmax, nmin: cfg.nmin, napr: cfg.napr, nmax: cfg.nmax };
    const dec = Math.max(decimalesDe(cfg.paso), decimalesDe(cfg.pideal));

    const fila = (p) => {
      const exacta = nota(p, esc);
      const aproximada = aproximarNota(exacta);
      return {
        p,
        exacta,
        nota: aproximada,
        aprueba: aproximada >= cfg.napr - EPS,
        maxima: p >= cfg.pmax - EPS,
      };
    };

    const filas = [];
    const n = Math.floor(cfg.pideal / cfg.paso + EPS);
    for (let i = 0; i <= n; i++) filas.push(fila(redondear(i * cfg.paso, dec)));
    if (filas[filas.length - 1].p < cfg.pideal - EPS) filas.push(fila(cfg.pideal));

    const primeraAprobada = filas.find((f) => f.aprueba);
    const primeraMaxima = filas.find((f) => f.nota >= cfg.nmax - EPS);
    const pCorte = primeraAprobada ? primeraAprobada.p : null;
    for (const f of filas) f.corte = f.p === pCorte;

    if (cfg.orden === 'descendente') filas.reverse();

    return {
      cfg,
      papr: cfg.papr,
      pmax: cfg.pmax,
      dec,
      filas,
      pCorte,
      pNotaMaxima: primeraMaxima ? primeraMaxima.p : null,
    };
  }

  /** Detalle paso a paso del cálculo de un puntaje. */
  function desglose(res, p) {
    const cfg = res.cfg;
    const exacta = nota(p, cfg);
    const tramo = p >= cfg.pmax ? 'maximo' : p < cfg.papr ? 'bajo' : 'sobre';
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
    MAX_FILAS,
    EPS,
    leerNumero,
    decimalesDe,
    redondear,
    nota,
    truncarCentesimas,
    aproximarNota,
    validarBase,
    generar,
    desglose,
    formatear,
    formatearCorto,
  };

  if (typeof module === 'object' && module.exports) module.exports = Escala;
  else root.Escala = Escala;
})(typeof window !== 'undefined' ? window : globalThis);
