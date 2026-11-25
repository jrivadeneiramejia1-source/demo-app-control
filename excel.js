/* excel.js — Todos los Excel que se descargan de la app salen con el mismo formato, ordenado y listo para leer:
   arriba el título (letra grande y negrilla) y una línea con lo que es; debajo los títulos de cada columna en negrilla sobre fondo de color;
   y luego los datos, cada uno en su cuadro, con las columnas del ancho justo, la primera fila fija al bajar y filtros en los títulos.
   Usa ExcelJS (gratis, MIT), que se carga solo al descargar. Define window.Excel.
   Uso: Excel.descargar({ archivo: 'Plantilla personas', hojas: [hoja, ...] })
   hoja = { nombre, titulo, subtitulo, columnas: [{ t, ancho, tipo, lista }], filas: [[...] o { celdas: [...], estilo }], vacias: 10, oculta }
     tipo: 'texto' (por defecto), 'numero', 'dinero'.  lista: { hoja, rango } = menú desplegable que toma sus opciones de otra hoja.
     validar: { min } = solo deja escribir números enteros desde ese mínimo.  gris: true = columna que solo se mira (código, fórmulas).
     formula: fila => '=...' = columna que se calcula sola en Excel (también en las filas vacías de abajo).  resaltar: [{ texto, fondo, letra }] = colorea la celda si dice ese texto.
     estilo de fila: 'gris' (ya está en la app), 'ejemplo' (de ejemplo: se ignora al subirlo).
   Excel.deObjetos(nombre, titulo, subtitulo, objetos) arma una hoja a partir de filas {Columna: valor}. */
(function () {
  'use strict';
  const FUENTE = 'Arial';
  const COLOR = { titulo: 'FF0F3D4C', encabezado: 'FF1F5F7A', borde: 'FFB7C3CB', cebra: 'FFF2F6F9', gris: 'FFEDEDED', ejemplo: 'FFFFF6D6', sub: 'FF5B6770' };
  const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const FORMATO = { numero: '#,##0', dinero: '"$"#,##0' };

  let carga = null;
  /** Baja la librería (una sola vez) cuando se necesita. */
  function cargar() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (!carga) carga = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'lib/exceljs/exceljs.min.js?v=1';
      s.onload = () => (window.ExcelJS ? res(window.ExcelJS) : rej(new Error('exceljs')));
      s.onerror = () => { carga = null; rej(new Error('exceljs')); };
      document.head.appendChild(s);
    });
    return carga;
  }

  const letra = n => { let s = ''; for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
  const lado = { style: 'thin', color: { argb: COLOR.borde } };
  const bordes = { top: lado, left: lado, bottom: lado, right: lado };
  const limpio = v => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ') : v);
  // Un texto que empieza con = + - @ se volvería fórmula al abrirlo en Excel: se guarda como texto.
  const seguro = v => (typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v);

  function armarHoja(libro, h) {
    const cols = h.columnas, n = cols.length, ws = libro.addWorksheet(String(h.nombre).slice(0, 31), { properties: { tabColor: { argb: COLOR.encabezado } } });
    // Fila 1: título. Fila 2: qué es. Fila 3: respiro. Fila 4: títulos de las columnas.
    ws.mergeCells(1, 1, 1, n); const t = ws.getCell(1, 1);
    t.value = h.titulo || h.nombre; t.font = { name: FUENTE, size: 16, bold: true, color: { argb: COLOR.titulo } }; t.alignment = { vertical: 'middle' }; ws.getRow(1).height = 28;
    ws.mergeCells(2, 1, 2, n); const s = ws.getCell(2, 1);
    s.value = h.subtitulo || ''; s.font = { name: FUENTE, size: 10, italic: true, color: { argb: COLOR.sub } }; s.alignment = { vertical: 'top', wrapText: true };
    ws.getRow(2).height = Math.max(18, 14 * Math.ceil(String(h.subtitulo || '').length / Math.max(40, cols.reduce((a, c) => a + (c.ancho || 16), 0) * 1.1)));
    ws.getRow(3).height = 6;
    const FILA_TITULOS = 4, enc = ws.getRow(FILA_TITULOS); enc.height = 24;
    cols.forEach((c, i) => {
      const x = enc.getCell(i + 1);
      x.value = c.t; x.font = { name: FUENTE, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.encabezado } };
      x.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; x.border = bordes;
    });
    const filas = (h.filas || []).map(f => (Array.isArray(f) ? { celdas: f } : f));
    const total = filas.length + (h.vacias || 0);
    for (let r = 0; r < total; r++) {
      const fila = filas[r] || { celdas: [] }, fx = ws.getRow(FILA_TITULOS + 1 + r);
      cols.forEach((c, i) => {
        const x = fx.getCell(i + 1);
        let v = fila.celdas[i]; v = v === undefined || v === null ? '' : limpio(v);
        const filaExcel = FILA_TITULOS + 1 + r;
        x.value = c.formula ? { formula: c.formula(filaExcel).replace(/^=/, ''), result: v } : (c.tipo === 'texto' || !c.tipo ? seguro(v) : v);
        x.font = { name: FUENTE, size: 10 };
        x.alignment = { vertical: 'top', wrapText: true, horizontal: c.tipo === 'numero' || c.tipo === 'dinero' ? 'right' : 'left' };
        x.border = bordes;
        if (FORMATO[c.tipo]) x.numFmt = FORMATO[c.tipo];
        if (fila.estilo === 'gris') { x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.gris } }; x.font = { name: FUENTE, size: 10, italic: true, color: { argb: 'FF555555' } }; }
        else if (fila.estilo === 'ejemplo') { x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.ejemplo } }; x.font = { name: FUENTE, size: 10, italic: true, color: { argb: 'FF7A5C00' } }; }
        else if (r % 2 === 1) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.cebra } };
        if (c.gris && fila.estilo !== 'ejemplo') { x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.gris } }; x.font = { name: FUENTE, size: 10, color: { argb: 'FF555555' } }; }
        if (c.validar) x.dataValidation = { type: 'whole', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [c.validar.min || 0], showErrorMessage: true, errorStyle: 'stop', errorTitle: c.t, error: `Escribe un número entero, ${c.validar.min || 0} o más, sin puntos ni comas.` };
        if (c.lista) x.dataValidation = { type: 'list', allowBlank: true, formulae: [`${c.lista.hoja}!${c.lista.rango}`], showErrorMessage: true, errorStyle: 'warning', errorTitle: c.t, error: 'Escoge una opción de la lista (también puedes dejarla vacía).' };
      });
    }
    // Ancho de cada columna: el que dice la hoja o el del texto más largo (entre 12 y 48).
    cols.forEach((c, i) => {
      let w = c.ancho;
      if (!w) { w = Math.max(String(c.t).length + 4, ...filas.slice(0, 200).map(f => String(f.celdas[i] == null ? '' : f.celdas[i]).length + 2)); w = Math.min(48, Math.max(12, w)); }
      ws.getColumn(i + 1).width = w;
    });
    cols.forEach((c, i) => {
      if (!c.resaltar || !total) return;
      const col = letra(i + 1), ref = `${col}${FILA_TITULOS + 1}:${col}${FILA_TITULOS + total}`;
      ws.addConditionalFormatting({ ref, rules: c.resaltar.map((q, k) => ({ type: 'containsText', operator: 'containsText', text: q.texto, priority: k + 1,
        style: { font: { color: { argb: q.letra || 'FF000000' }, bold: true }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: q.fondo } } } })) });
    });
    ws.views = [{ state: 'frozen', ySplit: FILA_TITULOS, showGridLines: false }];
    if (total) ws.autoFilter = { from: { row: FILA_TITULOS, column: 1 }, to: { row: FILA_TITULOS + Math.max(1, total), column: n } };
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    if (h.oculta) ws.state = 'hidden';
    return ws;
  }

  /** Arma el libro y lo baja. Devuelve el nombre del archivo. */
  async function descargar(o) {
    const E = await cargar(), libro = new E.Workbook();
    libro.creator = 'Control (demo)'; libro.created = new Date();
    libro.properties.date1904 = false;
    o.hojas.forEach(h => armarHoja(libro, h));
    const buf = await libro.xlsx.writeBuffer();
    // Nombre sin tildes ni símbolos (algunos navegadores lo cambian por «download» si los trae).
    const nombre = String(o.archivo).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w .-]/g, '').trim().slice(0, 60) + '.xlsx';
    const url = URL.createObjectURL(new Blob([buf], { type: TIPO_XLSX }));
    const a = document.createElement('a'); a.href = url; a.download = nombre; a.hidden = true; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return nombre;
  }

  /** Hoja a partir de filas {Columna: valor} (las columnas salen de las llaves). Los números de plata llevan $ y miles. */
  function deObjetos(nombre, titulo, subtitulo, objetos, extra) {
    const lista = objetos && objetos.length ? objetos : [{ Nota: 'Sin datos todavía' }], llaves = Object.keys(lista[0]);
    const dinero = k => /valor|precio|costo|pagad/i.test(k) && !/estado/i.test(k);
    const columnas = llaves.map(k => ({ t: k, tipo: lista.every(f => typeof f[k] === 'number' || f[k] === '' || f[k] == null) && lista.some(f => typeof f[k] === 'number') ? (dinero(k) ? 'dinero' : 'numero') : 'texto' }));
    return Object.assign({ nombre, titulo, subtitulo, columnas, filas: lista.map(f => llaves.map(k => f[k])) }, extra || {});
  }

  window.Excel = Object.freeze({ cargar, descargar, deObjetos, letra });
})();
