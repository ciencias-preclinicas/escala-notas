# Escala de notas

Generador de escalas de notas del **Departamento de Ciencias Preclínicas**, Facultad de Medicina,
Universidad de La Frontera.

Convierte puntajes en calificaciones usando la escala lineal de dos tramos habitual en Chile, con dos
agregados respecto de las herramientas tradicionales:

1. **Ajuste por el puntaje máximo obtenido.** Además del puntaje ideal se puede ingresar el mejor
   puntaje logrado por el curso. La escala se construye sobre el promedio de ambos, con un tope: el
   descuento nunca supera el 10 % del puntaje ideal.
2. **Impresión paginada.** La tabla se reparte en hojas de medidas fijas (Carta, Oficio o A4, vertical
   u horizontal, en tres tamaños de letra), de modo que ninguna columna queda cortada entre páginas.
   El sitio indica de antemano cuántas hojas saldrán y ofrece vista previa.

También advierte la **exigencia real** sobre el puntaje ideal cuando se baja la escala, exporta la
tabla a Excel y permite compartir cada escala como enlace.

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

## Al publicar cambios

`index.html` enlaza los archivos de estilo y de código con una versión (`?v=2`). Al modificar
cualquier archivo de `css/` o `js/`, **hay que subir ese número en las cinco referencias**. Si no, un
navegador puede combinar el HTML nuevo con el código antiguo que tiene guardado y la página falla.

## Cómo se calcula

Con `e` = exigencia, `p_max` = puntaje máximo considerado y `p_apr = e · p_max`:

- Si `p < p_apr`: `n = (n_apr − n_min) · p / p_apr + n_min`
- Si `p ≥ p_apr`: `n = (n_max − n_apr) · (p − p_apr) / (p_max − p_apr) + n_apr`

El resultado se trunca a centésimas y luego se aproxima a décimas (5 hacia arriba), tal como es
tradicional en los establecimientos chilenos.

## Estructura

```
index.html          Página
css/styles.css      Estilos de pantalla e impresión
js/escala.js        Cálculo, ajuste del puntaje máximo y aproximación
js/impresion.js     Reparto de la tabla en hojas
js/xlsx.js          Generador de archivos .xlsx sin dependencias
js/app.js           Interfaz
img/                Logos institucionales
test/               Comparación del cálculo con una referencia pública
```

## Pruebas

```bash
node test/comparar-referencia.js
```

Compara las notas calculadas (sin ajuste) con las de [escaladenotas.cl](https://escaladenotas.cl),
herramienta de Juan Pumarino Rodríguez que inspiró este proyecto, y verifica la regla del puntaje
máximo considerado. Requiere conexión a internet.

## Créditos

Desarrollado para el Departamento de Ciencias Preclínicas, Facultad de Medicina, Universidad de La
Frontera, Temuco, Chile. Los logos institucionales son propiedad de la Universidad de La Frontera.
