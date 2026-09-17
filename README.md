# Escala de notas

Generador de escalas de notas del **Departamento de Ciencias Preclínicas**, Facultad de Medicina,
Universidad de La Frontera.

Convierte puntajes en calificaciones usando la escala lineal de dos tramos habitual en Chile, con
tres agregados respecto de las herramientas tradicionales:

1. **Varios métodos para determinar el corte**, intercambiables desde la interfaz: exigencia fija
   sobre el puntaje ideal, promedio con el máximo obtenido (el criterio del departamento), y los
   métodos de Cohen y Cohen modificado, que derivan el corte del rendimiento del propio curso. Un
   panel comparativo muestra el corte y la tasa de reprobación simulada de todos los métodos a la
   vez. Ver [docs/metodos.md](docs/metodos.md).
2. **Ajuste por el puntaje máximo obtenido.** Además del puntaje ideal se puede ingresar el mejor
   puntaje logrado por el curso. La escala se construye sobre el promedio de ambos, con un tope: el
   descuento nunca supera el 10 % del puntaje ideal.
3. **Impresión paginada.** La tabla se reparte en hojas de medidas fijas (Carta, Oficio o A4, vertical
   u horizontal, en tres tamaños de letra), de modo que ninguna columna queda cortada entre páginas.
   El sitio indica de antemano cuántas hojas saldrán y ofrece vista previa.

También advierte la **exigencia real** sobre el puntaje ideal cuando se baja la escala, exporta la
tabla a Excel con toda la trazabilidad del método aplicado, y permite compartir cada escala como
enlace.

## Uso

Es un sitio estático: no necesita servidor, base de datos ni conexión a internet.

- **En el computador:** abrir `index.html` con doble clic.
- **En un servidor:** copiar la carpeta completa a la raíz del sitio.

Los parámetros viajan en la dirección web, por ejemplo:

```
index.html?pideal=100&pobt=70&exig=60&nmin=1&napr=4&nmax=7&paso=0.1&orden=ascendente
```

| Parámetro | Significado | Valor por omisión |
|---|---|---|
| `pideal` | Puntaje máximo ideal | 100 |
| `pobt` | Puntaje máximo obtenido (opcional) | sin ajuste |
| `exig` | Exigencia declarada (%) | 60 |
| `nmin` / `napr` / `nmax` | Nota mínima / de aprobación / máxima | 1 / 4 / 7 |
| `paso` | Incremento de puntaje | 1 |
| `orden` | `ascendente` o `descendente` | ascendente |
| `titulo` | Nombre de la evaluación impreso en la hoja | vacío |
| `papel` / `orientacion` / `densidad` | Opciones de impresión | carta / vertical / normal |
| `metodo` | Método de corte (`ideal`, `departamental`, `cohen`, `cohen-mod`) | departamental |
| `m.<id>` | Parámetros del método activo, por ejemplo `m.percentil=0.9` | los del método |
| `banda`, `bandaMin`, `bandaMax` | Banda admisible del corte | apagada, 45 %, 65 % |

La distribución de puntajes del curso **no** viaja en la URL: se pega en la propia página y no se
guarda en ninguna parte.

## Al publicar cambios

`index.html` enlaza los archivos de estilo y de código con una versión (`?v=3`). Al modificar
cualquier archivo de `css/` o `js/`, **hay que subir ese número en todas las referencias**. Si no, un
navegador puede combinar el HTML nuevo con el código antiguo que tiene guardado y la página falla.

## Cómo se calcula

El motor es agnóstico al método: solo recibe `papr` (puntaje que otorga la nota de aprobación) y
`pmax` (puntaje que otorga la nota máxima). Cada método decide cómo se obtienen.

- Si `p < papr`: `n = n_min + (n_apr − n_min) · p / papr`
- Si `p ≥ papr`: `n = n_apr + (n_max − n_apr) · (p − papr) / (pmax − papr)`

El resultado se trunca a centésimas y luego se aproxima a décimas (5 hacia arriba), tal como es
tradicional en los establecimientos chilenos.

## Estructura

```
index.html             Página
css/styles.css         Estilos de pantalla e impresión
js/escala.js           Conversión de puntaje en nota, aproximación y tabla
js/estadistica.js      Percentiles, media del tramo superior, azar, reprobación
js/metodos/index.js    Registro de métodos y banda admisible
js/metodos/*.js        Un archivo por método
js/impresion.js        Reparto de la tabla en hojas
js/xlsx.js             Generador de archivos .xlsx sin dependencias
js/app.js              Interfaz
img/                   Logos institucionales
docs/metodos.md        Contrato de método y cómo agregar uno nuevo
test/                  Verificación del cálculo y de los métodos
```

## Pruebas

```bash
node test/verificar.js            # cálculo, métodos, banda y aproximación (sin red)
node test/comparar-referencia.js  # contraste con una herramienta pública (requiere internet)
```

`verificar.js` comprueba los valores esperados de cada método, las propiedades de la conversión
(`nota(0) = n_min`, `nota(papr) = n_apr`, `nota(pmax) = n_max`), la aproximación en los bordes
(3,95 → 4,0; 3,94 → 3,9) y que el método por omisión siga reproduciendo el cálculo histórico.

`comparar-referencia.js` contrasta las notas con las de [escaladenotas.cl](https://escaladenotas.cl),
herramienta de Juan Pumarino Rodríguez que inspiró este proyecto.

## Créditos

Desarrollado para el Departamento de Ciencias Preclínicas, Facultad de Medicina, Universidad de La
Frontera, Temuco, Chile. Los logos institucionales son propiedad de la Universidad de La Frontera.
