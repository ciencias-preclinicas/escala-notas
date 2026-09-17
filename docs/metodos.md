# Métodos de determinación del corte

La herramienta separa dos responsabilidades:

- **El motor** (`js/escala.js`) convierte puntajes en notas. Solo conoce dos valores:
  `papr` (puntaje que otorga la nota de aprobación) y `pmax` (puntaje que otorga la nota máxima).
- **Los métodos** (`js/metodos/`) deciden de dónde salen esos dos valores.

Esa separación es lo que permite que convivan criterios tan distintos como «60 % del puntaje ideal»
y «60 % del percentil 95 del curso».

```js
function nota(p, { papr, pmax, nmin = 1.0, napr = 4.0, nmax = 7.0 }) {
  if (p <= 0) return nmin;
  if (p >= pmax) return nmax;
  return p < papr
    ? nmin + (napr - nmin) * (p / papr)
    : napr + (nmax - napr) * ((p - papr) / (pmax - papr));
}
```

El resultado se trunca a centésimas y luego se aproxima a décimas (5 hacia arriba), según la
convención tradicional chilena. Eso lo hace el motor, no los métodos.

## El contrato `MetodoEscala`

```js
/**
 * @typedef {Object} Contexto
 * @property {number} puntajeIdeal
 * @property {number|null} puntajeMaximoObtenido
 * @property {number[]|null} puntajes      // distribución del curso, si fue cargada
 * @property {number} exigencia            // fracción, ej. 0.60
 * @property {number} nmin
 * @property {number} napr
 * @property {number} nmax
 * @property {Object} params               // valores de los parámetros del método
 * @property {{activa: boolean, corteMinPct: number, corteMaxPct: number}} banda
 *
 * @typedef {Object} Resultado
 * @property {number} papr
 * @property {number} pmax
 * @property {{etiqueta: string, valor: number}} referencia
 * @property {Object} trazabilidad         // pares clave/valor para impresión y export
 *
 * @typedef {Object} ParamDef
 * @property {string} id
 * @property {string} etiqueta
 * @property {'number'|'select'|'checkbox'} tipo
 * @property {*} porDefecto
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [paso]
 * @property {{valor: *, etiqueta: string}[]} [opciones]
 * @property {string} [ayuda]
 * @property {(params: Object) => boolean} [visibleSi]   // dependencias entre parámetros
 *
 * @typedef {Object} MetodoEscala
 * @property {string} id
 * @property {string} nombre
 * @property {string} descripcionCorta
 * @property {string} [referenciaBibliografica]
 * @property {'ideal'|'maximoObtenido'|'distribucion'} requiere
 * @property {ParamDef[]} parametros
 * @property {(ctx: Contexto) => Resultado} calcular
 * @property {(ctx: Contexto, res: Resultado) => string} explicar    // HTML para «¿Cómo se calcula?»
 * @property {(ctx: Contexto, res: Resultado) => string[]} [advertencias]
 */
```

Notas sobre cada campo:

| Campo | Para qué se usa |
|---|---|
| `requiere` | Determina si el método aparece habilitado. `distribucion` exige al menos 3 puntajes cargados; si faltan, la interfaz explica por qué no está disponible en vez de ocultarlo. |
| `parametros` | La interfaz genera los controles a partir de esta lista. No hay que escribir HTML. Los valores se guardan en la URL como `m.<id>`, de modo que una escala sea reproducible por enlace. |
| `visibleSi` | Permite parámetros dependientes (por ejemplo, el número de alternativas solo aparece si se corrige por azar). |
| `trazabilidad` | Pares clave/valor que terminan en el encabezado de la hoja impresa y en la hoja «Parámetros» del Excel. Es el respaldo formal de la decisión: conviene ser explícito y no ahorrar claves. |
| `advertencias` | Textos que se muestran en pantalla, no en la consola. Sirven para muestras pequeñas, supuestos frágiles o resultados llamativos. |
| `explicar` | HTML que alimenta la sección «¿Cómo se calcula?». Se recomienda mostrar la fórmula con los números concretos del caso. |

El registro (`js/metodos/index.js`) aplica además, de forma transversal a todos los métodos, la
**banda admisible**: si `papr` cae fuera del rango `corteMinPct`–`corteMaxPct` (por omisión 45 %–65 %
del puntaje ideal) se emite una advertencia y, si la banda está activada, el corte se recorta al
límite y queda registrado en la trazabilidad el valor previo al recorte.

> **Por qué la banda viene desactivada:** encendida cambiaría el resultado de escalas ya en uso cuyo
> corte declarado queda fuera del rango (por ejemplo, una exigencia del 40 %). Con ella apagada, el
> cálculo histórico se conserva intacto y el usuario recibe igualmente el aviso.

## Agregar un método nuevo, paso a paso

Supongamos un método que fija el corte en un múltiplo de la mediana del curso.

**1. Crear `js/metodos/mediana.js`.** Se usa el mismo envoltorio que el resto de los archivos, que
funciona tanto en el navegador (variable global) como en Node (CommonJS), sin compilación:

```js
(function (root) {
  'use strict';

  const Metodos = typeof require === 'function' ? require('./index.js') : root.Metodos;
  const Est = typeof require === 'function' ? require('../estadistica.js') : root.Estadistica;
  const fmt = (n) => Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2, useGrouping: false });

  const metodo = {
    id: 'mediana',                       // debe ser único; aparece en la URL como metodo=mediana
    nombre: 'Múltiplo de la mediana',
    descripcionCorta: 'El corte es una fracción de la mediana del curso.',
    referenciaBibliografica: '',
    requiere: 'distribucion',            // sin puntajes cargados, queda deshabilitado

    parametros: [
      {
        id: 'factor',
        etiqueta: 'Factor sobre la mediana',
        tipo: 'number',
        porDefecto: 0.85,
        min: 0.1,
        max: 1.5,
        paso: 0.05,
        ayuda: '0,85 = el corte es el 85 % de la mediana.',
      },
    ],

    calcular(ctx) {
      const mediana = Est.percentil(ctx.puntajes, 0.5);
      return {
        papr: ctx.params.factor * mediana,
        pmax: ctx.puntajeIdeal,
        referencia: { etiqueta: 'Mediana', valor: mediana },
        trazabilidad: {
          'Método': 'Múltiplo de la mediana',
          'Puntajes cargados (n)': ctx.puntajes.length,
          'Mediana': mediana,
          'Factor': fmt(ctx.params.factor),
        },
      };
    },

    explicar(ctx, res) {
      return '<p class="formula">corte = ' + fmt(ctx.params.factor) + ' × ' + fmt(res.referencia.valor) +
        ' = ' + fmt(res.papr) + ' pts</p>';
    },

    advertencias(ctx) {
      return ctx.puntajes.length < 20
        ? ['La distribución tiene ' + ctx.puntajes.length + ' puntajes: la mediana es inestable.']
        : [];
    },
  };

  Metodos.registrar(metodo);
  if (typeof module === 'object' && module.exports) module.exports = metodo;
})(typeof window !== 'undefined' ? window : globalThis);
```

**2. Registrarlo en `index.html`**, después de `js/metodos/index.js` y antes de `js/app.js`:

```html
<script src="js/metodos/mediana.js?v=3"></script>
```

**3. Subir el número de versión** (`?v=`) de todos los archivos de `css/` y `js/` en `index.html`,
para que ningún navegador mezcle versiones guardadas en caché.

**4. Agregar el método a las pruebas** en `test/verificar.js` y ejecutar `node test/verificar.js`.

Eso es todo: el selector, los controles de parámetros, el panel comparativo, la explicación, las
advertencias, la persistencia en la URL y la trazabilidad en impresión y Excel se arman solos a
partir de la declaración.

## Métodos implementados

| `id` | Nombre | Requiere | Corte |
|---|---|---|---|
| `ideal` | Exigencia sobre el puntaje ideal | — | `exigencia × puntajeIdeal` |
| `departamental` | Promedio con el máximo obtenido | máximo obtenido | `exigencia × considerado`, con `considerado = min(ideal, max((ideal + maxObtenido) / 2, (1 − tope) × ideal))` |
| `cohen` | Cohen | distribución | `R + 0,60 × (P95 − R)` |
| `cohen-mod` | Cohen modificado | distribución | `R + 0,65 × (P90 − R)` |

`R` es el puntaje esperable por azar (`n.º de preguntas ÷ alternativas`), y vale 0 si no se activa la
corrección. Los percentiles se calculan por **interpolación lineal**, equivalente a `PERCENTILE.INC`
de Excel; la convención queda registrada en la trazabilidad porque otras convenciones
(`PERCENTILE.EXC`, método del «vecino más cercano») dan cortes distintos con muestras pequeñas.

## Candidatos a incorporar

- **Hofstee**: requiere cuatro juicios (nota de corte mínima y máxima aceptables, tasa de reprobación
  mínima y máxima aceptable) y la distribución acumulada. Encaja con `requiere: 'distribucion'` y
  cuatro parámetros `number`.
- **Beuk**: compromiso entre el nivel de exigencia declarado y la tasa de reprobación observada. Mismo
  requisito de datos que Hofstee.
- **Borderline regression**: necesita, además del puntaje, la calificación global de cada estudiante
  hecha por el evaluador. Eso exige un dato nuevo por caso, así que requeriría extender la entrada de
  datos a dos columnas y agregar un valor a `requiere` (por ejemplo `'distribucionConJuicio'`).
- **Angoff**: se basa en juicios por ítem, no en la distribución. Requeriría una entrada de datos
  propia (una fila por ítem) y un valor de `requiere` distinto.

Los dos primeros se pueden implementar hoy sin tocar la arquitectura; los dos últimos exigen ampliar
la entrada de datos, no el contrato de los métodos.

## Referencias

- Cohen-Schotanus J, van der Vleuten CPM. A standard setting method with the best performing students
  as point of reference: practical and affordable. *Medical Teacher*. 2010;32(2):154-160.
- Taylor CA. Development of a modified Cohen method of standard setting. *Medical Teacher*.
  2011;33(12):e678-e682.
- Hofstee WKB. The case for compromise in educational selection and grading. En: Anderson SB, Helmick
  JS, eds. *On Educational Testing*. San Francisco: Jossey-Bass; 1983:109-127.
- Beuk CH. A method for reaching a compromise between absolute and relative standards in examinations.
  *Journal of Educational Measurement*. 1984;21(2):147-152.
- McKinley DW, Norcini JJ. How to set standards on performance-based examinations: AMEE Guide No. 85.
  *Medical Teacher*. 2014;36(2):97-110.
