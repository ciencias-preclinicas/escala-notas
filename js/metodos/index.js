/*
 * Registro de métodos de determinación del corte.
 *
 * Un método declara qué datos necesita, qué parámetros ofrece y cómo calcula el
 * puntaje de aprobación (papr) y el de nota máxima (pmax). La interfaz se arma
 * sola a partir de esa declaración: agregar un método no exige tocar la UI.
 *
 * El contrato completo está documentado en docs/metodos.md.
 */
(function (root) {
  'use strict';

  const EPS = 1e-9;

  /** Banda admisible para el corte, transversal a todos los métodos. */
  const BANDA_POR_DEFECTO = {
    // Apagada por omisión: encendida cambiaría silenciosamente escalas ya en uso
    // cuyo corte declarado queda fuera de la banda. Con ella apagada solo se avisa.
    activa: false,
    corteMinPct: 45,
    corteMaxPct: 65,
  };

  const fmt = (n) => Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2, useGrouping: false });

  const registro = [];

  function registrar(metodo) {
    if (!metodo || !metodo.id) throw new Error('El método debe declarar un id.');
    if (registro.some((m) => m.id === metodo.id)) throw new Error('Método duplicado: ' + metodo.id);
    registro.push(metodo);
    return metodo;
  }

  const lista = () => registro.slice();
  const obtener = (id) => registro.find((m) => m.id === id) || null;

  /** Valores por omisión de los parámetros declarados por un método. */
  function parametrosPorDefecto(metodo) {
    const valores = {};
    for (const def of metodo.parametros || []) valores[def.id] = def.porDefecto;
    return valores;
  }

  /** Completa los parámetros faltantes con sus valores por omisión. */
  function conValoresPorDefecto(metodo, params) {
    return Object.assign(parametrosPorDefecto(metodo), params || {});
  }

  /**
   * ¿Se puede usar el método con los datos disponibles?
   * @returns {{ok: boolean, motivo?: string}}
   */
  function disponibilidad(metodo, ctx) {
    if (metodo.requiere === 'distribucion') {
      const n = ctx.puntajes ? ctx.puntajes.length : 0;
      if (!n) return { ok: false, motivo: 'Requiere los puntajes del curso: cárgalos en «Puntajes del curso».' };
      if (n < 3) return { ok: false, motivo: 'Requiere al menos 3 puntajes cargados.' };
    }
    if (metodo.requiere === 'maximoObtenido' && (ctx.puntajeMaximoObtenido === null || ctx.puntajeMaximoObtenido === undefined)) {
      // No es impedimento: el método decide cómo comportarse sin ese dato.
      return { ok: true };
    }
    return { ok: true };
  }

  /**
   * Evalúa un método y aplica la banda admisible.
   * @returns {{papr, pmax, referencia, trazabilidad, advertencias, errores, metodo, params}}
   */
  function evaluar(metodoOId, contexto) {
    const metodo = typeof metodoOId === 'string' ? obtener(metodoOId) : metodoOId;
    if (!metodo) return { errores: ['Método desconocido.'], advertencias: [] };

    const ctx = Object.assign({}, contexto);
    ctx.params = conValoresPorDefecto(metodo, contexto.params);
    ctx.banda = Object.assign({}, BANDA_POR_DEFECTO, contexto.banda);

    const disp = disponibilidad(metodo, ctx);
    if (!disp.ok) return { metodo, params: ctx.params, errores: [disp.motivo], advertencias: [] };

    const base = metodo.calcular(ctx);
    const advertencias = (metodo.advertencias ? metodo.advertencias(ctx, base) : []).slice();
    const trazabilidad = Object.assign({}, base.trazabilidad);
    const errores = [];

    let papr = base.papr;
    const pmax = base.pmax;

    // Banda admisible: el corte no debería alejarse demasiado del puntaje ideal.
    const minimo = (ctx.banda.corteMinPct / 100) * ctx.puntajeIdeal;
    const maximo = (ctx.banda.corteMaxPct / 100) * ctx.puntajeIdeal;
    const banda = ctx.banda.corteMinPct + ' %–' + ctx.banda.corteMaxPct + ' % del ideal';
    const fuera = papr < minimo - EPS ? 'bajo' : papr > maximo + EPS ? 'sobre' : null;

    if (fuera && ctx.banda.activa) {
      const original = papr;
      papr = fuera === 'bajo' ? minimo : maximo;
      trazabilidad['Banda admisible'] = banda + ' (recorte aplicado)';
      trazabilidad['Corte antes del recorte'] = original;
      advertencias.push(
        'El corte calculado (' + fmt(original) + ' pts) quedó ' + (fuera === 'bajo' ? 'bajo' : 'sobre') +
        ' la banda admisible de ' + banda + ', así que se recortó a ' + fmt(papr) + ' pts.'
      );
    } else if (fuera) {
      trazabilidad['Banda admisible'] = banda + ' (solo aviso)';
      advertencias.push(
        'El corte (' + fmt(papr) + ' pts) queda ' + (fuera === 'bajo' ? 'bajo' : 'sobre') + ' la banda admisible de ' +
        banda + '. Actívala en «Banda admisible» si quieres que se recorte al límite.'
      );
    } else if (ctx.banda.activa) {
      trazabilidad['Banda admisible'] = banda + ' (dentro de la banda)';
    }

    if (!(papr > 0)) errores.push('El puntaje de aprobación resultó ' + papr + ': revisa los parámetros del método.');
    if (!(pmax > papr)) {
      errores.push(
        'El puntaje de nota máxima (' + fmt(pmax) + ') debe ser mayor que el de aprobación (' +
        fmt(papr) + ').'
      );
    }

    return {
      metodo,
      params: ctx.params,
      papr,
      pmax,
      referencia: base.referencia || null,
      trazabilidad,
      advertencias,
      errores,
    };
  }

  const Metodos = {
    BANDA_POR_DEFECTO,
    registrar,
    lista,
    obtener,
    parametrosPorDefecto,
    conValoresPorDefecto,
    disponibilidad,
    evaluar,
  };

  if (typeof module === 'object' && module.exports) module.exports = Metodos;
  else root.Metodos = Metodos;
})(typeof window !== 'undefined' ? window : globalThis);
