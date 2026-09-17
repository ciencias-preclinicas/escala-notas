/*
 * Compara las notas calculadas con las de escaladenotas.cl, que usa la misma
 * escala lineal chilena sin ajuste (equivale al método «ideal»).
 * Uso: node test/comparar-referencia.js   (requiere conexión a internet)
 */
const Escala = require('../js/escala.js');
const Metodos = require('../js/metodos/index.js');
require('../js/metodos/ideal.js');
require('../js/metodos/departamental.js');

const CASOS = [
  { pmax: 100, exig: 60, nmin: 1, napr: 4, nmax: 7, paso: 1 },
  { pmax: 120, exig: 50, nmin: 1, napr: 4, nmax: 7, paso: 1 },
  { pmax: 70, exig: 60, nmin: 2, napr: 4, nmax: 7, paso: 0.5 },
  { pmax: 37, exig: 65, nmin: 1, napr: 4, nmax: 7, paso: 0.1 },
  { pmax: 540, exig: 61.11, nmin: 1, napr: 4, nmax: 7, paso: 1 },
  { pmax: 45, exig: 70, nmin: 1, napr: 4.5, nmax: 7, paso: 0.25 },
  { pmax: 20, exig: 55, nmin: 1, napr: 4, nmax: 7, paso: 0.05 },
];

function escala(c, metodoId, pobt) {
  const r = Metodos.evaluar(metodoId, {
    puntajeIdeal: c.pmax,
    puntajeMaximoObtenido: pobt === undefined ? null : pobt,
    puntajes: null,
    exigencia: c.exig / 100,
    nmin: c.nmin,
    napr: c.napr,
    nmax: c.nmax,
    params: {},
  });
  return Escala.generar({
    pideal: c.pmax, papr: r.papr, pmax: r.pmax,
    nmin: c.nmin, napr: c.napr, nmax: c.nmax, paso: c.paso, orden: 'ascendente',
  });
}

(async () => {
  let fallas = 0;
  for (const c of CASOS) {
    const url = `https://escaladenotas.cl/?pmax=${c.pmax}&exig=${c.exig}&nmin=${c.nmin}&napr=${c.napr}&nmax=${c.nmax}&paso=${c.paso}&orden=ascendente`;
    const html = await (await fetch(url)).text();
    const ref = [...html.matchAll(/aria-label="Puntaje ([\d,]+), nota ([\d,]+)"/g)]
      .map((m) => ({ p: Number(m[1].replace(',', '.')), nota: Number(m[2].replace(',', '.')) }));

    const tabla = escala(c, 'ideal');
    const porP = new Map(tabla.filas.map((f) => [f.p, f.nota]));
    const dif = ref.filter((r) => porP.get(r.p) !== r.nota);

    // Sin puntaje máximo obtenido, el método departamental debe coincidir con «ideal».
    const tablaDep = escala(c, 'departamental', null);
    const difDep = tablaDep.filas.filter((f, i) => f.nota !== tabla.filas[i].nota);

    const ok = ref.length && dif.length === 0 && ref.length === tabla.filas.length && difDep.length === 0;
    if (!ok) fallas++;
    console.log(
      `${ok ? 'OK ' : 'ERR'} pmax=${c.pmax} exig=${c.exig} nmin=${c.nmin} napr=${c.napr} paso=${c.paso}: ` +
      `${ref.length} filas ref / ${tabla.filas.length} propias, ${dif.length} diferencias, ` +
      `${difDep.length} diferencias entre departamental sin ajuste e ideal`
    );
    dif.slice(0, 5).forEach((d) => console.log(`    p=${d.p} ref=${d.nota} propia=${porP.get(d.p)}`));
  }

  // Regla del puntaje máximo considerado del método departamental.
  const casosAjuste = [[100, null, 100], [100, 100, 100], [100, 90, 95], [100, 80, 90], [100, 70, 90], [100, 0, 90], [60, 57, 58.5], [60, 40, 54]];
  for (const [ideal, obt, esperado] of casosAjuste) {
    const r = Metodos.evaluar('departamental', {
      puntajeIdeal: ideal, puntajeMaximoObtenido: obt, puntajes: null,
      exigencia: 0.6, nmin: 1, napr: 4, nmax: 7, params: {},
    });
    const ok = Math.abs(r.pmax - esperado) < 1e-9;
    if (!ok) fallas++;
    console.log(`${ok ? 'OK ' : 'ERR'} ideal=${ideal} obtenido=${obt} → considerado=${r.pmax} (esperado ${esperado})`);
  }
  process.exit(fallas ? 1 : 0);
})();
