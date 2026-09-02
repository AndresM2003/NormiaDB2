# Limitaciones actuales de NormiaDB

NormiaDB es un prototipo que ayuda a **mecanizar** el proceso de normalización (1FN–4FN) a partir de un diccionario de datos escrito en texto. Usa reglas heurísticas, no un análisis semántico real, por lo que el resultado siempre debe revisarse antes de usarse en una base de datos real.

## 1. Detección de relaciones

- **No detecta relaciones 1:N simples por referencia.** Solo reconoce dos patrones explícitos: campos compuestos con coma `Campo (Código, Nombre)` (→ nueva tabla por DFT) y campos marcados como `(Pueden ser varios)` (→ relación N:M). Una referencia simple a otra tabla ya existente (ej. `Código Vendedor` dentro de la tabla `pedido`) **no se conecta automáticamente** — hay que ajustarla a mano.
- **No soporta paréntesis anidados.** Si un campo compuesto contiene, a su vez, otro campo compuesto dentro (paréntesis dentro de paréntesis), hay que separarlo manualmente en dos líneas antes de pegarlo.
- **No distingue tablas "detalle" con atributos propios**, como el detalle de un pedido (cantidad, valor unitario, etc.). Estas relaciones con atributos deben darse de alta como un formato aparte, no se infieren solas.
- **El emparejamiento de un campo N:M con su tabla destino es por coincidencia de nombre** (exacta o parcial). Si el nombre del campo no se parece lo suficiente al nombre de la tabla, no logra conectarlos y crea una tabla nueva en su lugar.

## 2. Llaves primarias

- **La llave primaria se asume por defecto** como el primer campo de cada formato (`codigo_<prefijo>`). Debe verificarse y corregirse manualmente en el paso 2FN si no es la correcta.

## 3. Exportación SQL

- **Los tipos de datos son una sugerencia heurística** basada en el nombre del campo (ej. "fecha" → `DATE`, "valor"/"multa"/"precio" → `NUMERIC(10,2)`), no un análisis real de los datos. Siempre deben revisarse antes de ejecutar el script.
- Todos los campos se generan como `NOT NULL`; el diseñador debe ajustar la nulabilidad según el caso real.

## 4. Exportación Excel

- **El diagrama dentro del Excel no dibuja líneas de conexión** entre tablas — es una limitación técnica de la librería usada (ExcelJS no soporta conectores/flechas por script). Las relaciones solo quedan visibles como texto en la hoja "Relaciones" y en el diagrama de la propia app web.
- La generación del Excel **requiere conexión a Internet**, porque la librería ExcelJS se carga desde un CDN externo.

## 5. Persistencia y sesión

- **No hay guardado entre sesiones.** Si se recarga o cierra la página, el trabajo ingresado se pierde — no existe una base de datos ni almacenamiento local todavía.
- Todo el procesamiento ocurre en el navegador del usuario; no hay backend ni servidor.

## 6. Alcance del proceso

- **Solo llega hasta 4FN**, con la lógica simplificada que se usa en el curso. No cubre casos más avanzados de dependencias multivaluadas reales, Forma Normal de Boyce-Codd (FNBC), ni 5FN.
- La calidad del resultado depende directamente de qué tan bien escrito esté el diccionario de datos de entrada (nombres claros, formato consistente).

---

**En resumen:** NormiaDB es una herramienta de apoyo para agilizar el proceso de normalización, no un reemplazo del criterio del diseñador de la base de datos. El resultado que genera siempre debe revisarse y corregirse antes de implementarse.
