/* ==================== Utilidades de texto ==================== */
function quitarTildes(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function slug(s) {
  return quitarTildes(s.trim().toLowerCase())
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
function prefijo(nombreTabla) {
  const s = slug(nombreTabla).replace(/_/g, "");
  return s.slice(0, 3) || "tab";
}

/* ==================== Estado inicial ==================== */
let formatos = [
  {
    id: 1,
    nombre: "libro",
    texto: `Código Libro
Nombre Libro
Código de Autor (Pueden ser varios)
Editorial (Código, Nombre)`,
  },
  {
    id: 2,
    nombre: "autor",
    texto: `Código Autor
Nombre Autor
E-mail
Nacionalidad (Código, Nombre)
Género`,
  },
  {
    id: 3,
    nombre: "prestamo",
    texto: `Número Préstamo
Código Libro (Pueden ser varios)
Usuario (Código, Nombre, dirección, teléfono)
Fecha Préstamo
Fecha Entrega Propuesta
Fecha Entrega Real
Valor Multa`,
  },
];
let nextId = 4;
let resultado = null;
let pkOverride = {};
let etapaVista = 4;

/* ==================== Parser del diccionario ==================== */
function parsearFormato(fmt) {
  const pref = prefijo(fmt.nombre);
  const campos = [];
  const dft = [];
  const multi = [];
  const lineas = fmt.texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  lineas.forEach((linea) => {
    const m = linea.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    if (!m) {
      campos.push({ nombre: slug(linea) + "_" + pref, etiqueta: linea });
      return;
    }
    const base = m[1].trim();
    const paren = m[2].trim();
    if (/vari/i.test(paren))
      multi.push({ campoOrigen: linea, etiquetaBase: base });
    else if (paren.includes(",")) {
      const subs = paren
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const entidad = slug(base);
      const prefEnt = prefijo(base);
      const sub_campos = subs.map((s, i) => ({
        nombre: i === 0 ? "codigo_" + prefEnt : slug(s) + "_" + prefEnt,
        etiqueta: s,
      }));
      dft.push({ entidad, etiquetaBase: base, prefEnt, campos: sub_campos });
    } else {
      const entidad = slug(base);
      const prefEnt = prefijo(base);
      dft.push({
        entidad,
        etiquetaBase: base,
        prefEnt,
        campos: [{ nombre: "codigo_" + prefEnt, etiqueta: paren }],
      });
    }
  });
  return {
    slugTabla: slug(fmt.nombre),
    nombre: fmt.nombre,
    pref,
    campos,
    dft,
    multi,
  };
}

function emparejarTabla(etiquetaBase, tablasDisponibles) {
  const limpio = quitarTildes(etiquetaBase.toLowerCase())
    .replace(/^codigo\s+de\s+/, "")
    .replace(/^codigo\s+/, "")
    .replace(/^identificacion\s+de\s+/, "")
    .replace(/^identificacion\s+/, "")
    .trim();
  const cand = slug(limpio);
  let hit = tablasDisponibles.find((t) => t.slugTabla === cand);
  if (!hit)
    hit = tablasDisponibles.find(
      (t) => cand.startsWith(t.slugTabla) || t.slugTabla.startsWith(cand),
    );
  return hit || null;
}

/* ==================== Normalización 1FN a 4FN ==================== */
function ejecutarNormalizacion() {
  const parsed = formatos.map(parsearFormato);

  // 1FN: conserva todos los campos, incluidos los compuestos y multivaluados.
  const unoFN = parsed.map((p) => ({
    tabla: p.slugTabla,
    campos: [
      ...p.campos.map((c) => c.nombre),
      ...p.dft.flatMap((g) => g.campos.map((c) => c.nombre)),
      ...p.multi.map((m) => slug(m.etiquetaBase) + "_" + p.pref),
    ],
  }));
  const dosFN = parsed.map((p) => ({
    tabla: p.slugTabla,
    pk: pkOverride[p.slugTabla] || "codigo_" + p.pref,
    dft: p.dft.map((g) => ({
      grupo: g.entidad,
      campos: g.campos.map((c) => c.nombre),
    })),
    multi: p.multi.map((m) => m.etiquetaBase),
  }));

  // 3FN: separa los grupos transitivos en tablas independientes.
  const tablasFinal = {};
  const relaciones = [];
  parsed.forEach((p) => {
    const pk = pkOverride[p.slugTabla] || "codigo_" + p.pref;
    const propios = p.campos.map((c) => c.nombre);
    if (!propios.includes(pk)) propios.unshift(pk);
    tablasFinal[p.slugTabla] = tablasFinal[p.slugTabla] || {
      nombre: p.slugTabla,
      campos: [],
      pk,
    };
    propios.forEach((c) => {
      if (!tablasFinal[p.slugTabla].campos.includes(c))
        tablasFinal[p.slugTabla].campos.push(c);
    });
    p.dft.forEach((g) => {
      tablasFinal[g.entidad] = tablasFinal[g.entidad] || {
        nombre: g.entidad,
        campos: [],
        pk: g.campos[0].nombre,
      };
      g.campos.forEach((c) => {
        if (!tablasFinal[g.entidad].campos.includes(c.nombre))
          tablasFinal[g.entidad].campos.push(c.nombre);
      });
      const campoCodigo = g.campos[0].nombre;
      if (!tablasFinal[p.slugTabla].campos.includes(campoCodigo))
        tablasFinal[p.slugTabla].campos.push(campoCodigo);
      relaciones.push({
        de: g.entidad,
        campoFK: campoCodigo,
        hacia: p.slugTabla,
        tipo: "1:N",
      });
    });
  });
  // 4FN: transforma cada campo multivaluado en una tabla intermedia N:M.
  parsed.forEach((p) =>
    p.multi.forEach((m) => {
      const objetivo = emparejarTabla(m.etiquetaBase, parsed);
      const nombreObjetivo = objetivo
        ? objetivo.slugTabla
        : slug(m.etiquetaBase);
      if (!tablasFinal[nombreObjetivo]) {
        const prefO = prefijo(nombreObjetivo);
        tablasFinal[nombreObjetivo] = {
          nombre: nombreObjetivo,
          campos: ["codigo_" + prefO],
          pk: "codigo_" + prefO,
        };
      }
      const pkA = tablasFinal[p.slugTabla].pk;
      const pkB = tablasFinal[nombreObjetivo].pk;
      const nombreJunction = p.slugTabla + "_" + nombreObjetivo;
      const campoSueltoSlug = slug(m.etiquetaBase) + "_" + p.pref;
      tablasFinal[p.slugTabla].campos = tablasFinal[p.slugTabla].campos.filter(
        (c) => c !== campoSueltoSlug,
      );
      tablasFinal[nombreJunction] = {
        nombre: nombreJunction,
        campos: [pkA, pkB],
        pk: [pkA, pkB],
        junction: true,
      };
      relaciones.push({
        de: p.slugTabla,
        campoFK: pkA,
        hacia: nombreJunction,
        tipo: "1:N",
      });
      relaciones.push({
        de: nombreObjetivo,
        campoFK: pkB,
        hacia: nombreJunction,
        tipo: "1:N",
      });
    }),
  );
  return { unoFN, dosFN, tablasFinal, relaciones, parsed };
}

/* ==================== Renderizado de la interfaz ==================== */
function render() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <header>
      <div class="eyebrow">Bases de datos · Normalización</div>
      <h1>NormiaDB</h1>
      <p class="sub">
        Pega los elementos de información de cada formato (igual que en el
        diccionario de datos del curso). La herramienta detecta compuestos
        <code>Campo (Código, Nombre)</code> como dependencias transitivas (DFT)
        y campos <code>(Pueden ser varios)</code> como relaciones N:M.
      </p>
    </header>

    <section class="panel" aria-labelledby="formatos-titulo">
      <h2 id="formatos-titulo">1. Formatos / diccionario de datos</h2>
      <p class="desc">
        Un bloque por cada FORMATO. La primera línea se toma como candidata a
        llave primaria y puede cambiarse en el paso 2.
      </p>
      <div class="syntax">
        <code>Campo simple</code> → columna normal &nbsp;·&nbsp;
        <code>Campo (Código, Nombre)</code> → grupo compuesto → nueva tabla
        (DFT) &nbsp;·&nbsp;
        <code>Campo (Pueden ser varios)</code> → relación N:M
      </div>
      <div id="formatos"></div>
      <div class="row">
        <button class="btn btn-ghost" onclick="agregarFormato()">
          + Agregar formato
        </button>
        <button class="btn btn-generate" onclick="generar()">
          Generar normalización →
        </button>
      </div>
    </section>

    ${resultado ? renderResultado() : ""}

    <footer class="foot">
      Prototipo de mecanización del proceso de normalización. Revisa siempre
      las PK y relaciones sugeridas.
    </footer>`;
  const cont = document.getElementById("formatos");
  formatos.forEach((f) => {
    const div = document.createElement("div");
    div.className = "formato";
    div.innerHTML = `
      <div class="formato-head">
        <input
          type="text"
          value="${f.nombre}"
          aria-label="Nombre del formato"
          onchange="cambiarNombre(${f.id}, this.value)"
        />
        <button onclick="quitarFormato(${f.id})">Eliminar</button>
      </div>
      <textarea
        aria-label="Campos del formato"
        onchange="cambiarTexto(${f.id}, this.value)"
      >${f.texto}</textarea>`;
    cont.appendChild(div);
  });
  if (resultado) dibujarConectores();
}
// Barra común de acciones de exportación.
function renderExportBar() {
  return `
    <section class="panel exportbar" aria-label="Opciones de exportación">
      <span class="lbl">Exportar:</span>
      <button class="btn-export" onclick="exportarSQL()">
        🗄️ Script SQL (PostgreSQL)
      </button>
      <button class="btn-export" onclick="exportarExcel()">
        📊 Excel (.xlsx)
      </button>
      <button class="btn-export" onclick="exportarPasoAPaso()">
        📄 Paso a paso detallado (PDF)
      </button>
    </section>`;
}
// Selector de la etapa de normalización que se muestra.
function renderResultado() {
  const pasos = [
    { n: 1, label: "1FN · Tablas y campos" },
    { n: 2, label: "2FN · DFD / DFT" },
    { n: 3, label: "3FN · Tablas separadas" },
    { n: 4, label: "4FN · Diagrama final" },
  ];
  let html = renderExportBar() + `<div class="steps">`;
  pasos.forEach(
    (p) =>
      (html += `<div class="step-pill ${etapaVista === p.n ? "active" : ""}" onclick="verEtapa(${p.n})"><span class="n">${p.n}</span>${p.label}</div>`),
  );
  html += "</div>";
  if (etapaVista === 1) html += render1FN(resultado);
  if (etapaVista === 2) html += render2FN(resultado);
  if (etapaVista === 3) html += render3FN(resultado);
  if (etapaVista === 4) html += render4FN(resultado);
  return html;
}
function render1FN(r) {
  const rows = r.unoFN
    .map((t) => `<tr><td>${t.tabla}</td><td>${t.campos.join(", ")}</td></tr>`)
    .join("");
  return `<div class="panel"><h2>1FN — Identificación de tablas y campos</h2><p class="desc">Cada formato se convierte en tabla; los campos compuestos y multivaluados quedan expandidos como columnas.</p><table class="fnt"><tr><th>Tabla</th><th>Campos</th></tr>${rows}</table></div>`;
}
function pkChooserHtml(tablaSlug) {
  const p = resultado.parsed.find((p) => p.slugTabla === tablaSlug);
  const unicos = [
    ...new Set(["codigo_" + p.pref, ...p.campos.map((c) => c.nombre)]),
  ];
  const actual = pkOverride[tablaSlug] || "codigo_" + p.pref;
  return unicos
    .map(
      (o) =>
        `<label class="${o === actual ? "sel" : ""}"><input type="radio" name="pk_${tablaSlug}" ${o === actual ? "checked" : ""} onchange="elegirPK('${tablaSlug}','${o}')">${o}</label>`,
    )
    .join("");
}
function render2FN(r) {
  const rows = r.dosFN
    .map((t) => {
      const dftTxt = t.dft.length
        ? t.dft
            .map(
              (g) =>
                `<span class="fk">${g.grupo}</span>: ${g.campos.join(", ")}`,
            )
            .join("<br>")
        : '<span class="fam">— ninguna —</span>';
      const multiTxt = t.multi.length
        ? t.multi.join(", ")
        : '<span class="fam">— ninguna —</span>';
      return `<tr><td>${t.tabla}<div class="pkchooser">${pkChooserHtml(t.tabla)}</div></td><td>${dftTxt}</td><td>${multiTxt}</td></tr>`;
    })
    .join("");
  return `<div class="panel"><h2>2FN — Dependencia directa (DFD/PK) y transitivas (DFT)</h2><p class="desc">Ajusta la llave primaria (DFD) de cada tabla si el campo sugerido no es el correcto, y vuelve a generar.</p><table class="fnt"><tr><th>Tabla / PK</th><th>Grupos DFT detectados</th><th>Campos marcados N:M</th></tr>${rows}</table><div class="row" style="margin-top:14px"><button class="btn btn-primary" onclick="generar()">Recalcular con estas PK</button></div></div>`;
}
function elegirPK(tabla, campo) {
  pkOverride[tabla] = campo;
  render();
}
function render3FN(r) {
  const nombres = Object.keys(r.tablasFinal).filter(
    (k) => !r.tablasFinal[k].junction,
  );
  const rows = nombres
    .map((k) => {
      const t = r.tablasFinal[k];
      return `<tr><td>${t.nombre}</td><td><span class="pk">${Array.isArray(t.pk) ? t.pk.join("+") : t.pk}</span> · ${t.campos.filter((c) => c !== t.pk).join(", ")}</td></tr>`;
    })
    .join("");
  const rels = r.relaciones
    .filter((x) => !r.tablasFinal[x.hacia].junction)
    .map(
      (x) =>
        `<div><b>${x.de}</b> (1) → <b>${x.hacia}</b> vía <code>${x.campoFK}</code></div>`,
    )
    .join("");
  return `<div class="panel"><h2>3FN — Tablas separadas por DFT + relaciones</h2><p class="desc">Cada grupo transitivo se convirtió en tabla independiente; queda el campo código como llave foránea en la tabla de origen.</p><table class="fnt"><tr><th>Tabla</th><th>Campos (PK en rojo)</th></tr>${rows}</table><div class="rel-list">${rels || '<span class="fam">Sin relaciones 1:N derivadas de DFT.</span>'}</div></div>`;
}
function render4FN(r) {
  const nombres = Object.keys(r.tablasFinal);
  const cards = nombres
    .map((k) => {
      const t = r.tablasFinal[k];
      const pkSet = new Set(Array.isArray(t.pk) ? t.pk : [t.pk]);
      const camposHtml = t.campos
        .map((c) =>
          pkSet.has(c) ? `<div class="pk">${c}</div>` : `<div>${c}</div>`,
        )
        .join("");
      return `<div class="card ${t.junction ? "junction" : ""}" id="card_${k}" data-id="${k}"><div class="title">${t.nombre}</div><div class="fields">${camposHtml}</div></div>`;
    })
    .join("");
  const relTxt = r.relaciones
    .map(
      (x) =>
        `<div><b>${x.de}</b> —1:N→ <b>${x.hacia}</b> <span class="fam">(fk: ${x.campoFK})</span></div>`,
    )
    .join("");
  return `<div class="panel"><h2>4FN — Modelo final con tablas conectadas</h2><p class="desc">Relaciones N:M resueltas con tabla intermedia (en ámbar). Las líneas muestran las llaves foráneas entre tablas.</p><div style="position:relative;"><div class="cards" id="cardsWrap">${cards}</div><svg class="connectors" id="svgConn"></svg></div><div class="legend"><span><span class="dot" style="background:var(--azul-utb)"></span>Tabla</span><span><span class="dot" style="background:var(--ambar)"></span>Tabla intermedia (N:M)</span><span><span class="dot" style="background:#b3261e"></span>Llave primaria</span></div><div class="rel-list" style="margin-top:16px">${relTxt}</div></div>`;
}
/* ==================== Dibujo del diagrama ==================== */
function bordeMasCercano(ra, rb, wrapRect) {
  const ac = {
    x: ra.left - wrapRect.left + ra.width / 2,
    y: ra.top - wrapRect.top + ra.height / 2,
  };
  const bc = {
    x: rb.left - wrapRect.left + rb.width / 2,
    y: rb.top - wrapRect.top + rb.height / 2,
  };
  const dx = bc.x - ac.x,
    dy = bc.y - ac.y;
  const escala = Math.min(
    Math.abs(ra.width / 2 / (dx || 0.0001)),
    Math.abs(ra.height / 2 / (dy || 0.0001)),
  );
  return { x: ac.x + dx * escala, y: ac.y + dy * escala };
}
function dibujarConectores() {
  const svg = document.getElementById("svgConn"),
    wrap = document.getElementById("cardsWrap");
  if (!svg || !wrap || !resultado) return;
  const wrapRect = wrap.getBoundingClientRect();
  svg.setAttribute("width", wrapRect.width);
  svg.setAttribute("height", wrapRect.height);
  let defs =
    '<defs><marker id="arrowN" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#2e6bff"/></marker><marker id="arrowM" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#e8930b"/></marker></defs>';
  let lines = "",
    vistos = {};
  resultado.relaciones.forEach((rel) => {
    const a = document.getElementById("card_" + rel.de),
      b = document.getElementById("card_" + rel.hacia);
    if (!a || !b) return;
    const esNM = !!(
        resultado.tablasFinal[rel.hacia] &&
        resultado.tablasFinal[rel.hacia].junction
      ),
      color = esNM ? "#e8930b" : "#2e6bff",
      marker = esNM ? "arrowM" : "arrowN";
    const ra = a.getBoundingClientRect(),
      rb = b.getBoundingClientRect(),
      p1 = bordeMasCercano(ra, rb, wrapRect),
      p2 = bordeMasCercano(rb, ra, wrapRect),
      key =
        rel.de < rel.hacia
          ? rel.de + "|" + rel.hacia
          : rel.hacia + "|" + rel.de;
    vistos[key] = (vistos[key] || 0) + 1;
    const curv = (vistos[key] - 1) * 18,
      mx = (p1.x + p2.x) / 2,
      my = (p1.y + p2.y) / 2,
      dx = p2.x - p1.x,
      dy = p2.y - p1.y,
      len = Math.hypot(dx, dy) || 1,
      nx = -dy / len,
      ny = dx / len,
      cx = mx + nx * (24 + curv),
      cy = my + ny * (24 + curv);
    lines += `<path d="M ${p1.x},${p1.y} Q ${cx},${cy} ${p2.x},${p2.y}" fill="none" stroke="${color}" stroke-width="1.8" marker-end="url(#${marker})"/><rect x="${cx - 13}" y="${cy - 9}" width="26" height="14" rx="4" fill="#fff" stroke="${color}" stroke-width="1"/><text x="${cx}" y="${cy + 2}" font-size="9" font-family="Consolas,monospace" text-anchor="middle" fill="${color}">${esNM ? "N:M" : "1:N"}</text>`;
  });
  svg.innerHTML = defs + lines;
}

/* ==================== Exportación SQL y Excel ==================== */
function inferirTipoSQL(campo) {
  const c = campo.toLowerCase();
  if (c.includes("fecha")) return "DATE";
  if (
    c.includes("valor") ||
    c.includes("multa") ||
    c.includes("precio") ||
    c.includes("monto")
  )
    return "NUMERIC(10,2)";
  if (c.includes("email") || c.includes("correo")) return "VARCHAR(100)";
  if (c.includes("telefono")) return "VARCHAR(20)";
  if (c.includes("genero")) return "CHAR(1)";
  if (c.startsWith("codigo_") || c.includes("numero_") || c.startsWith("id_"))
    return "VARCHAR(20)";
  return "VARCHAR(100)";
}
function generarSQL(r) {
  let out =
    "-- ===================================================\n-- Script generado por NormiaDB\n-- Motor destino: PostgreSQL\n-- (los tipos son una sugerencia heurística: revísalos antes de ejecutar)\n-- ===================================================\n\n";
  Object.values(r.tablasFinal).forEach((t) => {
    const pkArr = Array.isArray(t.pk) ? t.pk : [t.pk];
    out += `CREATE TABLE ${t.nombre} (\n`;
    const lineas = t.campos.map(
      (c) => `    ${c} ${inferirTipoSQL(c)} NOT NULL`,
    );
    lineas.push(`    PRIMARY KEY (${pkArr.join(", ")})`);
    out += lineas.join(",\n") + "\n);\n\n";
  });
  out += "-- ==================== Llaves foráneas ====================\n\n";
  r.relaciones.forEach((rel) => {
    out += `ALTER TABLE ${rel.hacia}\n    ADD CONSTRAINT fk_${rel.hacia}_${rel.campoFK} FOREIGN KEY (${rel.campoFK})\n    REFERENCES ${rel.de} (${rel.campoFK});\n\n`;
  });
  return out;
}
function descargarArchivo(contenido, nombre, tipoMime) {
  const blob = new Blob([contenido], { type: tipoMime }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function exportarSQL() {
  if (resultado)
    descargarArchivo(
      generarSQL(resultado),
      "normiadb_modelo_postgresql.sql",
      "text/plain;charset=utf-8",
    );
}
function bordeFino() {
  const c = { style: "thin", color: { argb: "FFB7C0D6" } };
  return { top: c, left: c, bottom: c, right: c };
}
function celdaTitulo(cell, texto, colorFill, colorTexto) {
  cell.value = texto;
  cell.font = {
    bold: true,
    size: 12,
    color: { argb: colorTexto || "FF101826" },
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: colorFill },
  };
  cell.alignment = { vertical: "middle", horizontal: "left" };
}
function celdaHeader(cell, texto) {
  cell.value = texto;
  cell.font = { bold: true, size: 11 };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFC6E0B4" },
  };
  cell.border = bordeFino();
  cell.alignment = { vertical: "middle", wrapText: true };
}

async function exportarExcel() {
  if (!resultado) return;
  if (typeof ExcelJS === "undefined") {
    alert(
      "La librería de Excel aún está cargando, intenta de nuevo en un segundo.",
    );
    return;
  }
  const r = resultado,
    wb = new ExcelJS.Workbook();
  wb.creator = "NormiaDB";
  const ws1 = wb.addWorksheet("1FN");
  ws1.columns = [{ width: 20 }, { width: 85 }];
  ws1.mergeCells("A1:B1");
  celdaTitulo(
    ws1.getCell("A1"),
    "1 FN: Identificación de Tablas y Campos",
    "FFFFF200",
  );
  ws1.getRow(1).height = 20;
  celdaHeader(ws1.getCell("A2"), "Tabla");
  celdaHeader(ws1.getCell("B2"), "Campos");
  let f = 3;
  r.unoFN.forEach((t) => {
    const row = ws1.getRow(f);
    row.getCell(1).value = t.tabla;
    row.getCell(1).font = { bold: true, color: { argb: "FF0033A0" } };
    row.getCell(2).value = t.campos.join(", ");
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    row.getCell(1).border = bordeFino();
    row.getCell(2).border = bordeFino();
    f++;
  });
  const ws2 = wb.addWorksheet("2FN");
  ws2.columns = [
    { width: 16 },
    { width: 42 },
    { width: 20 },
    { width: 42 },
    { width: 26 },
  ];
  ws2.mergeCells("A1:E1");
  celdaTitulo(
    ws2.getCell("A1"),
    "2 FN: Identificación de DFD y DFT",
    "FFFFF200",
  );
  [
    "Tabla",
    "Campos",
    "DFD (Llave primaria)",
    "DFT (dependencias transitivas)",
    "Campos marcados N:M",
  ].forEach((txt, i) => celdaHeader(ws2.getRow(2).getCell(i + 1), txt));
  f = 3;
  r.dosFN.forEach((t) => {
    const p = r.parsed.find((pp) => pp.slugTabla === t.tabla),
      camposTodos = [
        ...p.campos.map((c) => c.nombre),
        ...p.dft.flatMap((g) => g.campos.map((c) => c.nombre)),
        ...p.multi.map((m) => slug(m.etiquetaBase) + "_" + p.pref),
      ],
      row = ws2.getRow(f);
    row.getCell(1).value = t.tabla;
    row.getCell(1).font = { bold: true, color: { argb: "FF0033A0" } };
    row.getCell(2).value = camposTodos.join(", ");
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    row.getCell(3).value = t.pk;
    row.getCell(3).font = { bold: true, color: { argb: "FFB3261E" } };
    const hayDft = t.dft.length > 0;
    row.getCell(4).value = hayDft
      ? t.dft.map((g) => `${g.grupo}: ${g.campos.join(", ")}`).join("\n")
      : "—";
    row.getCell(4).alignment = { wrapText: true, vertical: "top" };
    if (hayDft)
      row.getCell(4).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFCE4D6" },
      };
    row.getCell(5).value = t.multi.length ? t.multi.join(", ") : "—";
    row.getCell(5).alignment = { wrapText: true, vertical: "top" };
    for (let c = 1; c <= 5; c++) row.getCell(c).border = bordeFino();
    row.height = Math.max(18, 15 * Math.max(1, t.dft.length));
    f++;
  });
  const ws3 = wb.addWorksheet("3FN");
  ws3.columns = [{ width: 20 }, { width: 60 }];
  ws3.mergeCells("A1:B1");
  celdaTitulo(
    ws3.getCell("A1"),
    "3 FN: Tablas separadas (DFT eliminadas)",
    "FFFFF200",
  );
  celdaHeader(ws3.getCell("A2"), "Tabla");
  celdaHeader(ws3.getCell("B2"), "Campos");
  f = 3;
  Object.values(r.tablasFinal)
    .filter((t) => !t.junction)
    .forEach((t) => {
      const row = ws3.getRow(f);
      row.getCell(1).value = t.nombre;
      row.getCell(1).font = { bold: true, color: { argb: "FF0033A0" } };
      row.getCell(2).value = t.campos.join(", ");
      row.getCell(1).border = bordeFino();
      row.getCell(2).border = bordeFino();
      f++;
    });
  f++;
  ws3.mergeCells(`A${f}:B${f}`);
  celdaTitulo(ws3.getCell(`A${f}`), "Relaciones 1:N generadas", "FFFFF200");
  f++;
  celdaHeader(ws3.getCell(`A${f}`), "Relación");
  f++;
  r.relaciones
    .filter((rel) => !r.tablasFinal[rel.hacia].junction)
    .forEach((rel) => {
      ws3.mergeCells(`A${f}:B${f}`);
      ws3.getCell(`A${f}`).value =
        `${rel.de}  —1:N→  ${rel.hacia}   (fk: ${rel.campoFK})`;
      ws3.getCell(`A${f}`).border = bordeFino();
      f++;
    });
  const ws4 = wb.addWorksheet("Diagrama 4FN"),
    tablas = Object.values(r.tablasFinal),
    maxCampos = Math.max(...tablas.map((t) => t.campos.length), 3),
    boxCols = 2,
    gapCols = 1,
    colsPorCaja = boxCols + gapCols,
    boxHeaderRows = 1,
    gapRows = 1,
    filasPorCaja = boxHeaderRows + maxCampos + gapRows,
    porFila = 4;
  ws4.columns = Array.from({ length: porFila * colsPorCaja }, () => ({
    width: 15,
  }));
  tablas.forEach((t, i) => {
    const banda = Math.floor(i / porFila),
      pos = i % porFila,
      colIni = pos * colsPorCaja + 1,
      filaIni = banda * filasPorCaja + 1,
      colFin = colIni + boxCols - 1;
    ws4.mergeCells(filaIni, colIni, filaIni, colFin);
    const hdr = ws4.getCell(filaIni, colIni);
    celdaTitulo(
      hdr,
      t.nombre,
      t.junction ? "FFE8930B" : "FF0033A0",
      "FFFFFFFF",
    );
    hdr.alignment = { vertical: "middle", horizontal: "center" };
    hdr.border = bordeFino();
    ws4.getRow(filaIni).height = 20;
    const filaCampoIni = filaIni + 1,
      filaCampoFin = filaIni + maxCampos;
    ws4.mergeCells(filaCampoIni, colIni, filaCampoFin, colFin);
    const body = ws4.getCell(filaCampoIni, colIni),
      pkSet = new Set(Array.isArray(t.pk) ? t.pk : [t.pk]),
      runs = [];
    t.campos.forEach((c, idx) =>
      runs.push({
        text: c + (idx < t.campos.length - 1 ? "\n" : ""),
        font: pkSet.has(c)
          ? { bold: true, color: { argb: "FFB3261E" }, size: 10 }
          : { color: { argb: "FF101826" }, size: 10 },
      }),
    );
    body.value = { richText: runs };
    body.alignment = { wrapText: true, vertical: "top", horizontal: "left" };
    body.border = bordeFino();
    body.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF5F7FB" },
    };
  });
  ws4.getRow(1).height = 20;
  const nota = ws4.lastRow ? ws4.rowCount + 2 : 2;
  ws4.mergeCells(nota, 1, nota, porFila * colsPorCaja);
  ws4.getCell(nota, 1).value =
    'Nota: Excel no admite flechas dibujadas por script entre celdas; las relaciones exactas están en la hoja "Relaciones". El color rojo en negrita indica la llave primaria de cada tabla.';
  ws4.getCell(nota, 1).font = {
    italic: true,
    size: 10,
    color: { argb: "FF5B6472" },
  };
  const ws5 = wb.addWorksheet("Relaciones");
  ws5.columns = [{ width: 22 }, { width: 18 }, { width: 22 }, { width: 12 }];
  ["Tabla origen (1)", "Campo FK", "Tabla destino (N)", "Tipo"].forEach(
    (txt, i) => celdaHeader(ws5.getRow(1).getCell(i + 1), txt),
  );
  f = 2;
  r.relaciones.forEach((rel) => {
    const row = ws5.getRow(f);
    row.getCell(1).value = rel.de;
    row.getCell(1).font = { bold: true, color: { argb: "FF0033A0" } };
    row.getCell(2).value = rel.campoFK;
    row.getCell(3).value = rel.hacia;
    const esNM = r.tablasFinal[rel.hacia] && r.tablasFinal[rel.hacia].junction;
    row.getCell(4).value = esNM ? "N:M (vía tabla)" : "1:N";
    row.getCell(4).font = {
      color: { argb: esNM ? "FFE8930B" : "FF2E6BFF" },
      bold: true,
    };
    for (let c = 1; c <= 4; c++) row.getCell(c).border = bordeFino();
    f++;
  });
  const buffer = await wb.xlsx.writeBuffer();
  descargarArchivo(buffer, "normiadb_modelo.xlsx", "application/octet-stream");
}

/* ==================== Exportación del informe ==================== */
function exportarPasoAPaso() {
  if (!resultado) return;
  const r = resultado;
  let html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>NormiaDB — Paso a paso</title><style>body{font-family:'Segoe UI',Arial,sans-serif;padding:32px;color:#101826;max-width:920px;margin:0 auto}h1{color:#0033a0;font-size:24px}h2{color:#0033a0;border-bottom:2px solid #e2e6ec;padding-bottom:5px;margin-top:34px;font-size:17px}p.desc{color:#5b6472;font-size:13.5px}table{border-collapse:collapse;width:100%;margin:10px 0 18px;font-size:12.8px}th{background:#fff200;text-align:left;padding:6px 10px;border:1px solid #d8d100}td{padding:6px 10px;border:1px solid #e2e6ec}.rel{padding:3px 0;font-size:13px}.no-print{position:fixed;top:16px;right:16px}.no-print button{background:#0033a0;color:#fff;border:none;padding:10px 16px;border-radius:8px;font-weight:700;cursor:pointer}@media print{.no-print{display:none}}</style></head><body><div class="no-print"><button onclick="window.print()">Imprimir / Guardar como PDF</button></div><h1>Normalización de base de datos — Paso a paso</h1><p class="desc">Documento generado automáticamente a partir del diccionario de datos ingresado.</p>`;
  html += `<h2>1FN — Identificación de tablas y campos</h2><p class="desc">Cada formato se convierte en tabla; los campos compuestos y multivaluados quedan expandidos como columnas.</p><table><tr><th>Tabla</th><th>Campos</th></tr>`;
  r.unoFN.forEach(
    (t) =>
      (html += `<tr><td>${t.tabla}</td><td>${t.campos.join(", ")}</td></tr>`),
  );
  html += "</table>";
  html += `<h2>2FN — Dependencia directa (DFD) y transitivas (DFT)</h2><p class="desc">La DFD es la llave primaria de la tabla; las DFT son grupos de campos que dependen de un atributo distinto a la PK y que originarán una tabla nueva.</p><table><tr><th>Tabla</th><th>PK (DFD)</th><th>Grupos DFT</th><th>Campos N:M</th></tr>`;
  r.dosFN.forEach((t) => {
    const dftTxt = t.dft.length
      ? t.dft.map((g) => `${g.grupo}: ${g.campos.join(", ")}`).join("<br>")
      : "—";
    html += `<tr><td>${t.tabla}</td><td>${t.pk}</td><td>${dftTxt}</td><td>${t.multi.join(", ") || "—"}</td></tr>`;
  });
  html += "</table>";
  html += `<h2>3FN — Tablas separadas por DFT</h2><p class="desc">Cada DFT se convierte en una tabla independiente; en la tabla de origen queda solo el campo código como llave foránea.</p><table><tr><th>Tabla</th><th>Campos</th></tr>`;
  Object.values(r.tablasFinal)
    .filter((t) => !t.junction)
    .forEach(
      (t) =>
        (html += `<tr><td>${t.nombre}</td><td>${t.campos.join(", ")}</td></tr>`),
    );
  html += "</table>";
  html += `<h2>4FN — Modelo final (relaciones N:M resueltas)</h2><p class="desc">Las relaciones muchos a muchos se resuelven con una tabla intermedia cuya llave primaria compuesta son las PK de las dos tablas relacionadas.</p><table><tr><th>Tabla</th><th>Tipo</th><th>Llave primaria</th><th>Campos</th></tr>`;
  Object.values(r.tablasFinal).forEach(
    (t) =>
      (html += `<tr><td>${t.nombre}</td><td>${t.junction ? "Intermedia" : "Normal"}</td><td>${Array.isArray(t.pk) ? t.pk.join("+") : t.pk}</td><td>${t.campos.join(", ")}</td></tr>`),
  );
  html += "</table><h2>Relaciones finales</h2>";
  r.relaciones.forEach(
    (rel) =>
      (html += `<div class="rel"><b>${rel.de}</b> —1:N→ <b>${rel.hacia}</b> (fk: ${rel.campoFK})</div>`),
  );
  html += "</body></html>";
  const win = window.open("", "_blank");
  if (!win) {
    alert(
      "El navegador bloqueó la ventana emergente. Habilítala para exportar el paso a paso.",
    );
    return;
  }
  win.document.write(html);
  win.document.close();
}
/* ==================== Eventos de la interfaz ==================== */
function agregarFormato() {
  formatos.push({
    id: nextId++,
    nombre: "nueva_tabla",
    texto: "Código\nNombre",
  });
  render();
}
function quitarFormato(id) {
  formatos = formatos.filter((f) => f.id !== id);
  render();
}
function cambiarNombre(id, val) {
  formatos.find((f) => f.id === id).nombre = val;
}
function cambiarTexto(id, val) {
  formatos.find((f) => f.id === id).texto = val;
}
function generar() {
  resultado = ejecutarNormalizacion();
  etapaVista = 4;
  render();
}
function verEtapa(n) {
  etapaVista = n;
  render();
}
window.addEventListener("resize", dibujarConectores);
render();
