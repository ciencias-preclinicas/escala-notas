/*
 * Método de Cohen: el corte se fija como una fracción del rendimiento de los
 * mejores del curso, en lugar de un porcentaje del puntaje ideal.
 *
 *   papr = R + mult × (X − R)
 *
 * donde X es el puntaje de referencia (un percentil alto, o la media del tramo
 * superior) y R el puntaje esperable por azar.
 *
 * Este archivo exporta además `construir`, que arma variantes del método con
 * otros valores por omisión (lo usa cohen-mod.js).
 */
(function (root) {
  'use strict';

  const Metodos = typeof require === 'function' ? require('./index.js') : root.Metodos;
  const Est = typeof require === 'function' ? require('../estadistica.js') : root.Estadistica;
  const fmt = (n) => Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2, useGrouping: false });

  /**
   * @param {{id, nombre, descripcionCorta, referenciaBibliografica, percentil, mult, corregirAzar}} opciones
   */
  function construir(opciones) {
    const metodo = {
      id: opciones.id,
      nombre: opciones.nombre,
      descripcionCorta: opciones.descripcionCorta,
      referenciaBibliografica: opciones.referenciaBibliografica,
      requiere: 'distribucion',

      parametros: [
        {
          id: 'tipoReferencia',
          etiqueta: 'Puntaje de referencia',
          tipo: 'select',
          porDefecto: 'percentil',
          opciones: [
            { valor: 'percentil', etiqueta: 'Percentil' },
            { valor: 'mediaSuperior', etiqueta: 'Media del tramo superior' },
          ],
          ayuda: 'Cómo se resume el rendimiento de los mejores del curso.',
        },
        {
          id: 'percentil',
          etiqueta: 'Percentil',
          tipo: 'number',
          porDefecto: opciones.percentil,
          min: 0.5,
          max: 1,
          paso: 0.01,
          ayuda: 'Fracción entre 0 y 1. Con «media del tramo superior» define el tramo: 0,95 → mejores 5 %.',
        },
        {
          id: 'mult',
          etiqueta: 'Multiplicador',
          tipo: 'number',
          porDefecto: opciones.mult,
          min: 0.1,
          max: 1,
          paso: 0.05,
          ayuda: 'Fracción del puntaje de referencia exigida para aprobar.',
        },
        {
          id: 'corregirAzar',
          etiqueta: 'Corregir por azar (selección múltiple)',
          tipo: 'checkbox',
          porDefecto: opciones.corregirAzar,
          ayuda: 'Descuenta el puntaje que se obtendría respondiendo al azar.',
        },
        {
          id: 'nItems',
          etiqueta: 'N.º de preguntas',
          tipo: 'number',
          porDefecto: 40,
          min: 1,
          paso: 1,
          visibleSi: (params) => !!params.corregirAzar,
        },
        {
          id: 'nOpciones',
          etiqueta: 'Alternativas por pregunta',
          tipo: 'number',
          porDefecto: 4,
          min: 2,
          paso: 1,
          visibleSi: (params) => !!params.corregirAzar,
        },
        {
          id: 'origenPmax',
          etiqueta: 'Nota máxima con',
          tipo: 'select',
          porDefecto: 'ideal',
          opciones: [
            { valor: 'ideal', etiqueta: 'El puntaje ideal' },
            { valor: 'referencia', etiqueta: 'El puntaje de referencia' },
          ],
          ayuda: 'Con «referencia», quienes igualan a los mejores del curso obtienen la nota máxima.',
        },
      ],

      calcular(ctx) {
        const p = ctx.params;
        const esPercentil = p.tipoReferencia !== 'mediaSuperior';
        const X = esPercentil
          ? Est.percentil(ctx.puntajes, p.percentil)
          : Est.mediaSuperior(ctx.puntajes, 1 - p.percentil);
        const R = p.corregirAzar ? Est.puntajeAzar(p.nItems, p.nOpciones) : 0;
        const papr = R + p.mult * (X - R);
        const pmax = p.origenPmax === 'referencia' ? X : ctx.puntajeIdeal;
        const etiqueta = esPercentil
          ? 'P' + fmt(p.percentil * 100)
          : 'Media del ' + fmt((1 - p.percentil) * 100) + ' % superior';

        return {
          papr,
          pmax,
          referencia: { etiqueta, valor: X },
          trazabilidad: {
            'Método': opciones.nombre,
            'Puntajes cargados (n)': ctx.puntajes.length,
            'Tipo de referencia': esPercentil ? 'Percentil' : 'Media del tramo superior',
            'Convención de percentil': 'interpolación lineal (PERCENTILE.INC de Excel)',
            'Percentil': fmt(p.percentil * 100) + ' %',
            'Puntaje de referencia (X)': X,
            'Multiplicador': fmt(p.mult),
            'Corrección por azar (R)': p.corregirAzar
              ? fmt(R) + ' pts (' + p.nItems + ' preguntas ÷ ' + p.nOpciones + ' alternativas)'
              : 'no aplicada',
            'Nota máxima con': p.origenPmax === 'referencia' ? 'el puntaje de referencia' : 'el puntaje ideal',
          },
          _X: X,
          _R: R,
          _esPercentil: esPercentil,
        };
      },

      explicar(ctx, res) {
        const p = ctx.params;
        const detalle = res._esPercentil
          ? 'el percentil ' + fmt(p.percentil * 100) + ' de los ' + ctx.puntajes.length + ' puntajes cargados'
          : 'la media del ' + fmt((1 - p.percentil) * 100) + ' % superior de los ' + ctx.puntajes.length + ' puntajes cargados';
        const partes = [
          '<p>El corte se deriva del rendimiento de los mejores del curso, no de un porcentaje fijo del puntaje ideal. ' +
            'El puntaje de referencia (X) es ' + detalle + ':</p>',
          '<p class="formula">X = ' + fmt(res._X) + ' pts</p>',
        ];
        if (p.corregirAzar) {
          partes.push(
            '<p>Se descuenta el puntaje esperable por azar: ' + p.nItems + ' preguntas ÷ ' + p.nOpciones +
            ' alternativas = <strong>R = ' + fmt(res._R) + ' pts</strong>.</p>'
          );
        }
        partes.push(
          '<p class="formula">puntaje de aprobación = ' + fmt(res._R) + ' + ' + fmt(p.mult) + ' × (' + fmt(res._X) +
          ' − ' + fmt(res._R) + ') = ' + fmt(res.papr) + ' pts</p>',
          '<p>Equivale al ' + fmt((res.papr / ctx.puntajeIdeal) * 100) + ' % del puntaje ideal. La nota máxima se obtiene con ' +
          fmt(res.pmax) + ' pts.</p>'
        );
        return partes.join('');
      },

      advertencias(ctx, res) {
        const avisos = [];
        const n = ctx.puntajes.length;
        if (n < 20) {
          avisos.push(
            'La distribución tiene ' + n + ' puntajes. Bajo 20 casos, los métodos basados en el rendimiento del curso ' +
            'son inestables: un solo resultado alto mueve el corte.'
          );
        }
        if (res._X <= res._R) {
          avisos.push('El puntaje de referencia no supera al esperable por azar: el corte resultante no es interpretable.');
        }
        if (ctx.params.origenPmax === 'referencia' && res.pmax < ctx.puntajeIdeal) {
          avisos.push(
            'La nota máxima se alcanza con ' + fmt(res.pmax) + ' pts, bajo el puntaje ideal (' + fmt(ctx.puntajeIdeal) +
            '): todos los puntajes superiores obtienen igualmente la nota máxima.'
          );
        }
        return avisos;
      },
    };
    return metodo;
  }

  const metodo = construir({
    id: 'cohen',
    nombre: 'Cohen',
    descripcionCorta: 'El corte es el 60 % del percentil 95 del curso: referencia relativa al mejor rendimiento observado.',
    referenciaBibliografica:
      'Cohen-Schotanus J, van der Vleuten CPM. A standard setting method with the best performing students as point of reference. Med Teach. 2010;32(2):154-160.',
    percentil: 0.95,
    mult: 0.60,
    corregirAzar: false,
  });

  Metodos.registrar(metodo);

  if (typeof module === 'object' && module.exports) module.exports = { metodo, construir };
  else root.MetodoCohen = { metodo, construir };
})(typeof window !== 'undefined' ? window : globalThis);
