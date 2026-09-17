/*
 * Método «departamental»: promedio entre el puntaje ideal y el máximo obtenido
 * por el curso, con un tope al descuento. Es el método por omisión y reproduce
 * exactamente el comportamiento histórico de la herramienta.
 */
(function (root) {
  'use strict';

  const Metodos = typeof require === 'function' ? require('./index.js') : root.Metodos;
  const fmt = (n) => Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2, useGrouping: false });

  /** Puntaje máximo considerado: promedio ideal/obtenido, sin descontar más que el tope. */
  function considerado(ideal, obtenido, topeDescuento) {
    if (obtenido === null || obtenido === undefined || obtenido >= ideal) return ideal;
    const promedio = (ideal + obtenido) / 2;
    return Math.min(ideal, Math.max(promedio, (1 - topeDescuento) * ideal));
  }

  const metodo = {
    id: 'departamental',
    nombre: 'Promedio con el máximo obtenido',
    descripcionCorta: 'Baja la escala hasta el promedio entre el puntaje ideal y el mejor puntaje del curso, con un tope de descuento.',
    referenciaBibliografica: 'Criterio propio del Departamento de Ciencias Preclínicas, Facultad de Medicina UFRO.',
    requiere: 'maximoObtenido',

    parametros: [
      {
        id: 'topeDescuento',
        etiqueta: 'Tope de descuento',
        tipo: 'number',
        porDefecto: 0.10,
        min: 0,
        max: 0.5,
        paso: 0.05,
        ayuda: 'Fracción del puntaje ideal que como máximo se puede descontar. 0,10 = 10 %.',
      },
    ],

    calcular(ctx) {
      const ideal = ctx.puntajeIdeal;
      const obtenido = ctx.puntajeMaximoObtenido;
      const tope = ctx.params.topeDescuento;
      const pmax = considerado(ideal, obtenido, tope);
      const ajustado = pmax < ideal - 1e-9;
      const promedio = obtenido === null || obtenido === undefined ? null : (ideal + obtenido) / 2;
      const topeAplicado = promedio !== null && promedio < (1 - tope) * ideal - 1e-9;

      return {
        papr: ctx.exigencia * pmax,
        pmax,
        referencia: { etiqueta: 'Puntaje máximo considerado', valor: pmax },
        trazabilidad: {
          'Método': 'Promedio con el máximo obtenido',
          'Exigencia declarada': fmt(ctx.exigencia * 100) + ' %',
          'Puntaje ideal': ideal,
          'Puntaje máximo obtenido': obtenido === null || obtenido === undefined ? 'no ingresado' : obtenido,
          'Promedio ideal/obtenido': promedio === null ? 'no aplica' : promedio,
          'Tope de descuento': fmt(tope * 100) + ' % (' + fmt(tope * ideal) + ' pts)',
          'Tope aplicado': topeAplicado ? 'sí' : 'no',
          'Puntaje máximo considerado': pmax,
        },
        _ajustado: ajustado,
        _promedio: promedio,
        _topeAplicado: topeAplicado,
      };
    },

    explicar(ctx, res) {
      const ideal = ctx.puntajeIdeal;
      const tope = ctx.params.topeDescuento;
      if (res._promedio === null) {
        return (
          '<p>Sin puntaje máximo obtenido no hay ajuste: la escala se construye sobre el puntaje ideal ' +
          '(' + fmt(ideal) + ' pts), igual que el método de exigencia fija.</p>' +
          '<p class="formula">puntaje de aprobación = ' + fmt(ctx.exigencia * 100) + ' % × ' + fmt(ideal) + ' = ' + fmt(res.papr) + ' pts</p>'
        );
      }
      const partes = [
        '<p>La escala se baja hasta el promedio entre el puntaje ideal y el mejor puntaje del curso:</p>',
        '<p class="formula">(' + fmt(ideal) + ' + ' + fmt(ctx.puntajeMaximoObtenido) + ') ÷ 2 = ' + fmt(res._promedio) + ' pts</p>',
      ];
      if (res._topeAplicado) {
        partes.push(
          '<p>Ese promedio descontaría ' + fmt(ideal - res._promedio) + ' pts, más que el tope de ' +
          fmt(tope * 100) + ' % (' + fmt(tope * ideal) + ' pts), así que el puntaje máximo considerado se queda en ' +
          '<strong>' + fmt(res.pmax) + ' pts</strong>.</p>'
        );
      } else {
        partes.push('<p>El descuento (' + fmt(ideal - res.pmax) + ' pts) está dentro del tope de ' + fmt(tope * 100) + ' %.</p>');
      }
      partes.push(
        '<p class="formula">puntaje de aprobación = ' + fmt(ctx.exigencia * 100) + ' % × ' + fmt(res.pmax) + ' = ' + fmt(res.papr) + ' pts</p>'
      );
      return partes.join('');
    },

    advertencias(ctx, res) {
      const avisos = [];
      if (res._ajustado) {
        const real = (res.papr / ctx.puntajeIdeal) * 100;
        avisos.push(
          'Al bajar la escala, aprobar exige ' + fmt(res.papr) + ' de los ' + fmt(ctx.puntajeIdeal) +
          ' puntos ideales: ' + fmt(real) + ' % del total y no el ' + fmt(ctx.exigencia * 100) + ' % declarado.'
        );
      }
      return avisos;
    },
  };

  metodo.considerado = considerado;
  Metodos.registrar(metodo);
  if (typeof module === 'object' && module.exports) module.exports = metodo;
})(typeof window !== 'undefined' ? window : globalThis);
