// Compara las notas calculadas (sin ajuste) con las de escaladenotas.cl.
// Uso: node test/comparar-referencia.js   (requiere conexión a internet)
const Escala = require('../js/escala.js');

const CASOS = [
  { pmax: 100, exig: 60, nmin: 1, napr: 4, nmax: 7, paso: 1 },
  { pmax: 120, exig: 50, nmin: 1, napr: 4, nmax: 7, paso: 1 },
  { pmax: 70, exig: 60, nmin: 2, napr: 4, nmax: 7, paso: 0.5 },
  { pmax: 37, exig: 65, nmin: 1, napr: 4, nmax: 7, paso: 0.1 },
  { pmax: 540, exig: 61.11, nmin: 1, napr: 4, nmax: 7, paso: 1 },
  { pmax: 45, exig: 70, nmin: 1, napr: 4.5, nmax: 7, paso: 0.25 },
  { pmax: 20, exig: 55, nmin: 1, napr: 4, nmax: 7, paso: 0.05 },
];

(async () => {
  let fallas = 0;
  for (const c of CASOS) {
    const url = `https://escaladenotas.cl/?pmax=${c.pmax}&exig=${c.exig}&nmin=${c.nmin}&napr=${c.napr}&nmax=${c.nmax}&paso=${c.paso}&orden=ascendente`;
    const html = await (await fetch(url)).text();
    const ref = [...html.matchAll(/aria-label="Puntaje ([\d,]+), nota ([\d,]+)"/g)]
      .map((m) => ({ p: Number(m[1].replace(',', '.')), nota: Number(m[2].replace(',', '.')) }));
    const res = Escala.calcular({ pideal: c.pmax, pobt: null, exig: c.exig, nmin: c.nmin, napr: c.napr, nmax: c.nmax, paso: c.paso, orden: 'ascendente' });
    const porP = new Map(res.filas.map((f) => [f.p, f.nota]));
    const dif = ref.filter((r) => porP.get(r.p) !== r.nota);
    const estado = ref.length && dif.length === 0 && ref.length === res.filas.length ? 'OK ' : 'ERR';
    if (estado !== 'OK ') fallas++;
    console.log(`${estado} pmax=${c.pmax} exig=${c.exig} nmin=${c.nmin} napr=${c.napr} paso=${c.paso}: ${ref.length} filas ref / ${res.filas.length} propias, ${dif.length} diferencias`);
    dif.slice(0, 5).forEach((d) => console.log(`    p=${d.p} ref=${d.nota} propia=${porP.get(d.p)}`));
  }

  // Regla del puntaje máximo considerado.
  const casosAjuste = [
    [100, null, 100], [100, 100, 100], [100, 90, 95], [100, 80, 90], [100, 70, 90], [100, 0, 90], [60, 57, 58.5], [60, 40, 54],
  ];
  for (const [ideal, obt, esperado] of casosAjuste) {
    const r = Escala.puntajeConsiderado(ideal, obt);
    const ok = Math.abs(r.pmax - esperado) < 1e-9;
    if (!ok) fallas++;
    console.log(`${ok ? 'OK ' : 'ERR'} ideal=${ideal} obtenido=${obt} → considerado=${r.pmax} (esperado ${esperado})`);
  }
  process.exit(fallas ? 1 : 0);
})();
