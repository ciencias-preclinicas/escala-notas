/*
 * Utilidades estadísticas compartidas por los métodos y por la lectura de la
 * distribución de puntajes del curso.
 */
(function (root) {
  'use strict';

  /**
   * Percentil por interpolación lineal, equivalente a PERCENTILE.INC de Excel.
   * @param {number[]} valores
   * @param {number} p fracción entre 0 y 1
   */
  function percentil(valores, p) {
    const x = [...valores].sort((a, b) => a - b);
    if (!x.length) return NaN;
    if (x.length === 1) return x[0];
    const idx = (x.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return lo === hi ? x[lo] : x[lo] + (idx - lo) * (x[hi] - x[lo]);
  }

  /** Media del tramo superior (frac = 0,05 → mejores 5 %); siempre al menos un caso. */
  function mediaSuperior(valores, frac) {
    const x = [...valores].sort((a, b) => b - a);
    if (!x.length) return NaN;
    const k = Math.max(1, Math.round(x.length * frac));
    return x.slice(0, k).reduce((s, v) => s + v, 0) / k;
  }

  /** Puntaje esperable por azar en una prueba de selección múltiple. */
  const puntajeAzar = (nItems, nOpciones) => (nOpciones > 1 ? nItems / nOpciones : 0);

  /** Fracción del curso bajo el puntaje de aprobación. */
  const tasaReprobacion = (valores, papr) =>
    valores.length ? valores.filter((v) => v < papr).length / valores.length : NaN;

  /** Resumen descriptivo de la distribución. */
  function resumen(valores) {
    if (!valores || !valores.length) return null;
    const x = [...valores].sort((a, b) => a - b);
    return {
      n: x.length,
      min: x[0],
      max: x[x.length - 1],
      mediana: percentil(x, 0.5),
      p90: percentil(x, 0.9),
      p95: percentil(x, 0.95),
      media: x.reduce((s, v) => s + v, 0) / x.length,
    };
  }

  /**
   * Lee la distribución pegada por el usuario.
   * Tolera una columna copiada desde Excel (un valor por línea, separadores por
   * tabulación o punto y coma) y coma o punto como separador decimal.
   * @param {string} texto
   * @param {{maximo?: number}} opciones
   * @returns {{valores: number[], descartados: {texto: string, motivo: string}[]}}
   */
  function leerDistribucion(texto, opciones) {
    const maximo = opciones && opciones.maximo;
    const valores = [];
    const descartados = [];
    const piezas = String(texto || '')
      .split(/[\n\r\t;]+/)
      .map((s) => s.trim())
      .filter((s) => s !== '');

    for (const pieza of piezas) {
      const limpia = pieza.replace(/\s+/g, '').replace(',', '.');
      if (!/^-?(\d+\.?\d*|\.\d+)$/.test(limpia)) {
        descartados.push({ texto: pieza, motivo: 'no es un número' });
        continue;
      }
      const valor = Number(limpia);
      if (valor < 0) {
        descartados.push({ texto: pieza, motivo: 'es negativo' });
        continue;
      }
      if (maximo !== undefined && maximo !== null && valor > maximo) {
        descartados.push({ texto: pieza, motivo: 'supera el puntaje ideal' });
        continue;
      }
      valores.push(valor);
    }
    return { valores, descartados };
  }

  const Estadistica = { percentil, mediaSuperior, puntajeAzar, tasaReprobacion, resumen, leerDistribucion };

  if (typeof module === 'object' && module.exports) module.exports = Estadistica;
  else root.Estadistica = Estadistica;
})(typeof window !== 'undefined' ? window : globalThis);
