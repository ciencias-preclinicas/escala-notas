/*
 * Verificación del motor de cálculo y de los métodos, sin dependencias.
 * Uso: node test/verificar.js
 */
const Escala = require('../js/escala.js');
const Est = require('../js/estadistica.js');
const Metodos = require('../js/metodos/index.js');
require('../js/metodos/ideal.js');
require('../js/metodos/departamental.js');
require('../js/metodos/cohen.js');
require('../js/metodos/cohen-mod.js');

let fallas = 0;
let pruebas = 0;

function comprobar(descripcion, obtenido, esperado, tolerancia) {
  pruebas++;
  const tol = tolerancia === undefined ? 1e-9 : tolerancia;
  const ok = typeof esperado === 'number' ? Math.abs(obtenido - esperado) <= tol : obtenido === esperado;
  if (!ok) fallas++;
  console.log((ok ? 'OK  ' : 'ERR ') + descripcion + ': ' + obtenido + (ok ? '' : ' (esperado ' + esperado + ')'));
}

function seccion(titulo) {
  console.log('\n== ' + titulo);
}

const DIST = [30, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 72];
const BASE = {
  puntajeIdeal: 80,
  puntajeMaximoObtenido: Math.max(...DIST),
  puntajes: DIST,
  exigencia: 0.60,
  nmin: 1.0,
  napr: 4.0,
  nmax: 7.0,
};

const ctx = (extra) => Object.assign({}, BASE, extra);

seccion('Utilidades estadísticas');
comprobar('percentil P95 (interpolación lineal)', Est.percentil(DIST, 0.95), 68.2, 1e-9);
comprobar('percentil P90', Est.percentil(DIST, 0.90), 66.2, 1e-9);
comprobar('percentil P50 (mediana)', Est.percentil(DIST, 0.50), 51, 1e-9);
comprobar('percentil con un solo valor', Est.percentil([42], 0.95), 42);
comprobar('media del 5 % superior (1 caso mínimo)', Est.mediaSuperior(DIST, 0.05), 72);
comprobar('media del 10 % superior', Est.mediaSuperior(DIST, 0.10), 70);
comprobar('puntaje por azar 40 preguntas / 4 alternativas', Est.puntajeAzar(40, 4), 10);
comprobar('puntaje por azar sin alternativas', Est.puntajeAzar(40, 1), 0);
comprobar('tasa de reprobación con corte 48', Est.tasaReprobacion(DIST, 48), 0.4, 1e-12);

seccion('Casos de prueba del encargo (puntaje ideal 80, exigencia 60 %)');
const casos = [
  ['ideal', {}, 48.0, 60.0],
  ['departamental', {}, 45.6, 57.0],
  ['cohen', {}, 40.92, 51.15],
  ['cohen', { corregirAzar: true, nItems: 40, nOpciones: 4 }, 44.92, 56.15],
  ['cohen-mod', {}, 43.03, 53.7875],
];
for (const [id, params, paprEsperado, pctEsperado] of casos) {
  const r = Metodos.evaluar(id, ctx({ params }));
  const etiqueta = id + (params.corregirAzar ? ' (corregido por azar)' : '');
  comprobar('papr de ' + etiqueta, r.papr, paprEsperado, 1e-9);
  comprobar('% del ideal de ' + etiqueta, (r.papr / 80) * 100, pctEsperado, 1e-9);
  comprobar('sin errores en ' + etiqueta, r.errores.length, 0);
}

const refCohen = Metodos.evaluar('cohen', ctx({}));
comprobar('referencia de cohen es P95', refCohen.referencia.valor, 68.2, 1e-9);
comprobar('etiqueta de la referencia', refCohen.referencia.etiqueta, 'P95');
const refMod = Metodos.evaluar('cohen-mod', ctx({}));
comprobar('referencia de cohen-mod es P90', refMod.referencia.valor, 66.2, 1e-9);

seccion('Propiedades de la función de conversión');
for (const [id, params] of [['ideal', {}], ['departamental', {}], ['cohen', {}], ['cohen-mod', {}]]) {
  const r = Metodos.evaluar(id, ctx({ params }));
  const esc = { papr: r.papr, pmax: r.pmax, nmin: 1, napr: 4, nmax: 7 };
  comprobar('nota(0) = nmin en ' + id, Escala.nota(0, esc), 1.0);
  comprobar('nota(papr) = napr en ' + id, Escala.nota(r.papr, esc), 4.0, 1e-12);
  comprobar('nota(pmax) = nmax en ' + id, Escala.nota(r.pmax, esc), 7.0);
  comprobar('nota sobre pmax = nmax en ' + id, Escala.nota(r.pmax + 5, esc), 7.0);
  comprobar('monotonía en ' + id, Escala.nota(r.papr - 1, esc) < Escala.nota(r.papr + 1, esc), true);
}

seccion('Aproximación chilena (truncar a centésimas, luego décimas)');
comprobar('3,95 → 4,0', Escala.aproximarNota(3.95), 4.0);
comprobar('3,94 → 3,9', Escala.aproximarNota(3.94), 3.9);
comprobar('3,94711 → 3,9', Escala.aproximarNota(3.94711), 3.9);
comprobar('3,95146 → 4,0', Escala.aproximarNota(3.95146), 4.0);
comprobar('3,9499 → 3,9', Escala.aproximarNota(3.9499), 3.9);
comprobar('truncado de 3,95146', Escala.truncarCentesimas(3.95146), 3.95, 1e-12);

seccion('Compatibilidad: el método por omisión reproduce el cálculo histórico');
// Fórmula histórica: considerado = promedio con tope 10 %, papr = exigencia × considerado.
function historico(pideal, pobt, exigPct) {
  const tope = pideal * 0.10;
  let pmax = pideal;
  if (pobt !== null && pobt < pideal) {
    const promedio = (pideal + pobt) / 2;
    pmax = promedio < pideal - tope ? pideal - tope : promedio;
  }
  return { papr: (exigPct / 100) * pmax, pmax };
}
for (const [pideal, pobt, exigPct] of [[100, null, 60], [100, 70, 60], [100, 90, 60], [80, 72, 60], [70, 66, 65], [60, 40, 50], [120, 119, 50]]) {
  const esperado = historico(pideal, pobt, exigPct);
  const r = Metodos.evaluar('departamental', {
    puntajeIdeal: pideal, puntajeMaximoObtenido: pobt, puntajes: null,
    exigencia: exigPct / 100, nmin: 1, napr: 4, nmax: 7, params: {},
  });
  const etiqueta = 'ideal=' + pideal + ' obtenido=' + pobt + ' exigencia=' + exigPct + '%';
  comprobar('papr histórico ' + etiqueta, r.papr, esperado.papr, 1e-9);
  comprobar('pmax histórico ' + etiqueta, r.pmax, esperado.pmax, 1e-9);
}

seccion('Banda admisible');
const bandaCtx = ctx({ params: {}, exigencia: 0.40, banda: { activa: true, corteMinPct: 45, corteMaxPct: 65 } });
const recortado = Metodos.evaluar('ideal', bandaCtx);
comprobar('corte 40 % se recorta al mínimo 45 %', recortado.papr, 36, 1e-9);
comprobar('la advertencia del recorte es visible', recortado.advertencias.length > 0, true);
comprobar('queda el valor previo en la trazabilidad', recortado.trazabilidad['Corte antes del recorte'], 32, 1e-9);

const sinBanda = Metodos.evaluar('ideal', ctx({ params: {}, exigencia: 0.40 }));
comprobar('con la banda apagada el corte no cambia', sinBanda.papr, 32, 1e-9);
comprobar('pero igual advierte', sinBanda.advertencias.length > 0, true);

seccion('Disponibilidad de métodos según los datos');
const sinDist = { puntajeIdeal: 80, puntajeMaximoObtenido: 72, puntajes: null, exigencia: 0.6, nmin: 1, napr: 4, nmax: 7, params: {} };
comprobar('cohen no disponible sin distribución', Metodos.evaluar('cohen', sinDist).errores.length, 1);
comprobar('departamental sí disponible sin distribución', Metodos.evaluar('departamental', sinDist).errores.length, 0);
comprobar('métodos registrados', Metodos.lista().length, 4);
comprobar('advertencia por n pequeño', Metodos.evaluar('cohen', ctx({ puntajes: [40, 50, 60, 70], params: {} })).advertencias.length > 0, true);

seccion('Tabla generada');
const rIdeal = Metodos.evaluar('ideal', ctx({ params: {} }));
const tabla = Escala.generar({ pideal: 80, papr: rIdeal.papr, pmax: rIdeal.pmax, nmin: 1, napr: 4, nmax: 7, paso: 1, orden: 'ascendente' });
comprobar('filas de 0 a 80 con paso 1', tabla.filas.length, 81);
comprobar('primera fila es 0 con nota 1,0', tabla.filas[0].nota, 1.0);
comprobar('última fila es 80 con nota 7,0', tabla.filas[80].nota, 7.0);
comprobar('primer puntaje aprobatorio', tabla.pCorte, 48);
comprobar('el corte marcado coincide', tabla.filas.find((f) => f.corte).p, 48);
comprobar('nota en el corte', tabla.filas[48].nota, 4.0);
comprobar('nota justo bajo el corte', tabla.filas[47].nota, 3.9);

console.log('\n' + (fallas ? fallas + ' de ' + pruebas + ' comprobaciones FALLARON' : 'Las ' + pruebas + ' comprobaciones pasaron'));
process.exit(fallas ? 1 : 0);
