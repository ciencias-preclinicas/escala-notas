/* Método «ideal»: exigencia fija sobre el puntaje ideal (escala lineal clásica). */
(function (root) {
  'use strict';

  const Metodos = typeof require === 'function' ? require('./index.js') : root.Metodos;
  const fmt = (n) => Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2, useGrouping: false });

  const metodo = {
    id: 'ideal',
    nombre: 'Exigencia sobre el puntaje ideal',
    descripcionCorta: 'El corte es un porcentaje fijo del puntaje ideal, sin mirar los resultados del curso.',
    referenciaBibliografica: 'Uso tradicional en establecimientos chilenos (no normado por el Mineduc).',
    requiere: 'ideal',
    parametros: [],

    calcular(ctx) {
      const papr = ctx.exigencia * ctx.puntajeIdeal;
      return {
        papr,
        pmax: ctx.puntajeIdeal,
        referencia: { etiqueta: 'Puntaje ideal', valor: ctx.puntajeIdeal },
        trazabilidad: {
          'Método': 'Exigencia sobre el puntaje ideal',
          'Exigencia declarada': fmt(ctx.exigencia * 100) + ' %',
          'Puntaje ideal': ctx.puntajeIdeal,
        },
      };
    },

    resumenCorto(ctx, res) {
      return 'El corte es el ' + fmt(ctx.exigencia * 100) + ' % del puntaje ideal (' + fmt(ctx.puntajeIdeal) +
        ' pts), sin considerar los resultados del curso.';
    },

    explicar(ctx, res) {
      return (
        '<p>El corte se fija por decisión pedagógica, como un porcentaje del puntaje ideal, ' +
        'independientemente de cómo le fue al curso.</p>' +
        '<p class="formula">puntaje de aprobación = ' + fmt(ctx.exigencia * 100) + ' % × ' + fmt(ctx.puntajeIdeal) +
        ' = ' + fmt(res.papr) + ' pts</p>' +
        '<p>La nota máxima se obtiene con el puntaje ideal (' + fmt(ctx.puntajeIdeal) + ' pts).</p>'
      );
    },
  };

  Metodos.registrar(metodo);
  if (typeof module === 'object' && module.exports) module.exports = metodo;
})(typeof window !== 'undefined' ? window : globalThis);
