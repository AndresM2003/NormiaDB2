# NormiaDB

NormiaDB es una herramienta web para apoyar el proceso de normalización de bases de datos desde la primera forma normal (1FN) hasta la cuarta forma normal (4FN).

La aplicación recibe los campos de distintos formatos o entidades, identifica grupos compuestos y campos multivaluados, y genera una propuesta de tablas, llaves y relaciones.

> La herramienta utiliza reglas heurísticas. Las llaves primarias, llaves foráneas y relaciones sugeridas deben ser revisadas antes de implementarse en una base de datos real.

## Características principales

- Registro de varios formatos o entidades.
- Detección de campos simples.
- Detección de grupos compuestos como dependencias funcionales transitivas (DFT).
- Detección de campos multivaluados como relaciones muchos a muchos (N:M).
- Selección manual de la llave primaria sugerida.
- Visualización de las etapas 1FN, 2FN, 3FN y 4FN.
- Diagrama visual de tablas y relaciones.
- Exportación de un script SQL para PostgreSQL.
- Exportación de un archivo Excel con las etapas de normalización.
- Generación de un informe paso a paso para imprimir o guardar como PDF.

## Requisitos

- Un navegador web moderno: Chrome, Edge, Firefox o similar.
- Visual Studio Code.
- Extensión **Live Server** de Visual Studio Code, recomendada para ejecutar el proyecto.
- Conexión a Internet para cargar ExcelJS desde CDN y generar archivos Excel.

No se necesita instalar Node.js, una base de datos ni un servidor backend para utilizar la aplicación.

## Estructura del proyecto

```text
NormiaDB/
├── normiadb.html   # Documento HTML principal
├── styles.css      # Estilos visuales de la aplicación
├── app.js          # Estado, lógica, normalización y exportaciones
└── README.md       # Documentación del sistema
```

### `normiadb.html`

Contiene la estructura mínima del documento, el contenedor principal de la aplicación y las referencias a los archivos CSS y JavaScript.

También carga la biblioteca externa ExcelJS:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"></script>
```

### `styles.css`

Define la apariencia de la aplicación: colores, tipografías, paneles, formularios, tablas, botones, tarjetas del diagrama y estilos de exportación.

### `app.js`

Contiene toda la lógica de funcionamiento:

- Estado inicial de los formatos.
- Limpieza y transformación de nombres de campos.
- Análisis del diccionario de datos.
- Construcción de las tablas normalizadas.
- Renderizado de las etapas.
- Dibujo de conectores entre tablas.
- Exportación SQL, Excel y del informe paso a paso.

## Cómo ejecutar el sistema

1. Abre la carpeta `NormiaDB` en Visual Studio Code.
2. Abre el archivo `normiadb.html`.
3. Haz clic derecho sobre el archivo.
4. Selecciona **Open with Live Server**.
5. El navegador abrirá la aplicación en una dirección local similar a:

```text
http://127.0.0.1:5500/normiadb.html
```

La ruta o el puerto pueden variar según la configuración de Live Server.

## Cómo ingresar la información

Cada formato se registra con:

- Un nombre de tabla o entidad.
- Una lista de campos, escribiendo un campo por línea.

### Campo simple

Un campo sin paréntesis se interpreta como una columna normal:

```text
Código Libro
Nombre Libro
Género
```

La aplicación transforma los nombres en identificadores usando minúsculas, sin tildes y con guiones bajos. Por ejemplo:

```text
Código Libro -> codigo_libro_lib
```

El sufijo se obtiene a partir de las primeras letras del nombre del formato.

### Grupo compuesto

Un campo con varios elementos separados por comas se interpreta como un grupo compuesto y origina una tabla independiente:

```text
Editorial (Código, Nombre)
```

En este caso, se genera una tabla `editorial` con campos similares a:

```text
codigo_edi
nombre_edi
```

El primer elemento del grupo se considera la llave primaria sugerida de la nueva tabla.

### Campo multivaluado

Un campo que contiene la expresión `Pueden ser varios` se interpreta como una relación N:M:

```text
Código de Autor (Pueden ser varios)
```

La aplicación intenta relacionar ese campo con un formato existente. Si encuentra la entidad correspondiente, crea una tabla intermedia con las llaves de ambas tablas.

## Flujo de normalización

### 1FN: tablas y campos

Cada formato se convierte en una tabla. En esta etapa se muestran todos los campos, incluidos los campos compuestos y multivaluados todavía sin separar.

### 2FN: DFD y DFT

Se identifica una llave primaria sugerida para cada tabla. También se muestran:

- DFD: dependencia funcional directa respecto de la llave primaria.
- DFT: grupos de campos que dependen de un atributo distinto de la llave primaria.
- Campos marcados como relaciones N:M.

La llave primaria puede cambiarse mediante los selectores disponibles en esta etapa.

### 3FN: separación de dependencias transitivas

Cada grupo DFT se convierte en una tabla independiente. El campo código correspondiente permanece en la tabla de origen como referencia.

### 4FN: resolución de relaciones N:M

Cada relación multivaluada se transforma en una tabla intermedia o tabla de unión. Esta tabla utiliza una llave primaria compuesta por las llaves de las dos entidades relacionadas.

El diagrama final muestra las tablas, las llaves primarias y las conexiones entre ellas.

## Exportaciones

Después de pulsar **Generar normalización**, aparecen tres opciones:

### Script SQL

Descarga un archivo `normiadb_modelo_postgresql.sql` con instrucciones `CREATE TABLE` y `ALTER TABLE` para PostgreSQL.

Los tipos de datos se infieren por el nombre del campo. Por ejemplo, los nombres que incluyen `fecha` se proponen como `DATE` y los que incluyen `multa`, `valor` o `monto` como `NUMERIC(10,2)`.

Estos tipos son sugerencias y deben revisarse antes de ejecutar el script.

### Excel

Descarga `normiadb_modelo.xlsx` con hojas para:

- 1FN.
- 2FN.
- 3FN.
- Diagrama 4FN.
- Relaciones.

La generación depende de la biblioteca ExcelJS cargada desde Internet.

### Informe paso a paso

Abre una nueva ventana con un informe HTML que incluye las etapas de normalización. Desde esa ventana se puede utilizar la opción de impresión del navegador y seleccionar **Guardar como PDF**.

Si la ventana no aparece, se deben permitir las ventanas emergentes para el sitio local.

## Consideraciones y limitaciones

- La aplicación trabaja completamente en el navegador.
- Los datos ingresados se mantienen en memoria mientras la página está abierta.
- Al recargar la página, los datos vuelven a los valores iniciales.
- No existe persistencia en una base de datos.
- La identificación de entidades depende del nombre escrito por el usuario.
- La coincidencia entre una relación multivaluada y otra tabla se realiza por coincidencia exacta o parcial del nombre.
- El script SQL generado es una propuesta y requiere revisión manual.
- La exportación Excel necesita conexión a Internet para cargar ExcelJS.

## Organización interna del código

El código está dividido por responsabilidades para facilitar su revisión:

1. `normiadb.html` define la estructura del documento.
2. `styles.css` contiene la presentación visual.
3. `app.js` administra el estado y ejecuta la lógica.
4. `parsearFormato()` interpreta las líneas escritas por el usuario.
5. `ejecutarNormalizacion()` construye las estructuras de 1FN a 4FN.
6. Las funciones `render...()` generan las vistas de cada etapa.
7. `exportarSQL()`, `exportarExcel()` y `exportarPasoAPaso()` generan los archivos de salida.

## Validación básica

Para comprobar la sintaxis del JavaScript desde la carpeta del proyecto:

```powershell
node --check app.js
```

El proyecto no incluye pruebas automatizadas ni un proceso de compilación, porque se trata de una aplicación HTML, CSS y JavaScript ejecutada directamente en el navegador.
