/* excel-bd.js — Base de datos en Excel para una ventana de la app (Equipos, Vehículos, Reuniones, Compras…).
   Lo mismo que hace «Bodega»: «Descargar base de datos» baja una fila por cosa con su código (ID), listas desplegables, solo números
   enteros donde toca y una hoja de Ayuda; se cambia en Excel y «Subir Excel» muestra primero qué agregaría, cambiaría o eliminaría
   (y marca lo que está mal). Nada se guarda hasta tocar «Guardar». Subir el mismo archivo otra vez no repite nada.
   Cada ventana le dice a este módulo sus columnas y cómo se guarda cada cosa (cumpliendo las reglas de Firebase de esa ventana).
   Uso:  ExcelBD.html(cfg)  → botones + vista previa para pintar dentro de la ventana
         ExcelBD.conectar(contenedor, { clave: () => cfg }, repintar)  → conecta los botones y la subida del archivo
   cfg = { clave, hoja, titulo, sub, archivo, acciones: ['Agregar', 'Cambiar', 'Eliminar'] (o solo ['Agregar']), puedeSubir(), puedeEliminar(),
           columnas: [{ t, k, tipo: 'texto'|'entero'|'dinero'|'fecha'|'hora'|'sino', lista, ancho, gris, fija, obligatoria, clave, max, min, defecto, alias }],
           filas(): [{ id, v: { k: valor } }], ejemplo: { k: valor }, ayuda: [[qué, cómo]], revisar(x, { nuevo, ex }), revisarTodo(filas), bloqueaEliminar(id),
           nombre(v), resumenNuevo(v), opsAgregar(x), opsCambiar(x), opsEliminar(x), alGuardar(buenas), despues(buenas), maxOps }
   Columnas: gris = solo se mira (no se sube); fija = en un registro que ya existe no se cambia desde el Excel; obligatoria = hace falta en una fila nueva. */
(function () {
  'use strict';
  const A = () => window.App;
  const esH = v => A().esH(v);
  const MAX_FILAS = 300, MAX_BYTES = 1048576;
  const estados = {};
  const st = k => (estados[k] = estados[k] || { previa: null, error: '', aplicando: false });
  const norm = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  // Texto limpio (sin caracteres raros); el apostrofo con que Excel protege un texto que empieza con = + - @ se quita.
  const limpio = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'(?=[=+\-@])/, '').slice(0, max || 200);
  const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const dosD = n => String(n).padStart(2, '0');
  const isoDe = d => `${d.getUTCFullYear()}-${dosD(d.getUTCMonth() + 1)}-${dosD(d.getUTCDate())}`;

  let cargaXlsx = null;
  function cargarXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    cargaXlsx = cargaXlsx || new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'lib/xlsx/xlsx.full.min.js?v=2';
      s.onload = () => (window.XLSX ? res(window.XLSX) : rej(new Error('xlsx'))); s.onerror = () => { cargaXlsx = null; rej(new Error('xlsx')); };
      document.head.appendChild(s);
    });
    return cargaXlsx;
  }

  /* ---------- leer cada tipo de celda ---------- */
  function enteroDe(v) {
    if (typeof v === 'number') return Number.isInteger(v) ? v : NaN;
    const t = String(v).replace(/[\s$]/g, '');
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
    if (/^\d{1,3}(,\d{3})+$/.test(t)) return Number(t.replace(/,/g, ''));
    return /^\d+$/.test(t) ? Number(t) : NaN;
  }
  function fechaDe(v) {
    let y, m, d;
    if (v instanceof Date && !isNaN(v)) return isoDe(v);
    if (typeof v === 'number') { if (!(v > 20000 && v < 80000)) return null; return isoDe(new Date(Math.round((v - 25569) * 86400000))); }   // fecha de Excel
    const t = String(v).trim();
    let k = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
    if (k) { y = +k[1]; m = +k[2]; d = +k[3]; } else if ((k = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t))) { d = +k[1]; m = +k[2]; y = +k[3]; } else return null;   // día/mes/año (Colombia)
    const f = new Date(Date.UTC(y, m - 1, d));
    return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? `${y}-${dosD(m)}-${dosD(d)}` : null;
  }
  function horaDe(v) {
    if (typeof v === 'number') { if (!(v >= 0 && v < 1)) return null; const tot = Math.round(v * 1440); return `${dosD(Math.floor(tot / 60) % 24)}:${dosD(tot % 60)}`; }
    const k = /^(\d{1,2}):(\d{2})/.exec(String(v).trim());
    return k && +k[1] < 24 && +k[2] < 60 ? `${dosD(+k[1])}:${k[2]}` : null;
  }
  /** Lee una celda según el tipo de la columna: { vacio } | { v } | { error }. Los valores se manejan «como se ven» (Sí/No, texto de la lista, número). */
  function leer(col, crudo) {
    if (crudo === null || crudo === undefined || String(crudo).trim() === '') return { vacio: true };
    const tipo = col.tipo || 'texto';
    if (tipo === 'entero' || tipo === 'dinero') {
      const n = enteroDe(crudo);
      if (Number.isNaN(n)) return { error: 'debe ser un número entero, sin letras' };
      if (col.min != null && n < col.min) return { error: `debe ser ${col.min} o más` };
      if (col.max != null && n > col.max) return { error: `debe ser ${col.max} o menos` };
      return { v: n };
    }
    if (tipo === 'fecha') { const f = fechaDe(crudo); return f ? { v: f } : { error: 'no es una fecha (escríbela como 2026-11-30 o 30/11/2026)' }; }
    if (tipo === 'hora') { const h = horaDe(crudo); return h ? { v: h } : { error: 'no es una hora (escríbela como 14:30)' }; }
    if (tipo === 'sino') { const n = norm(crudo); return ['si', 's', 'x', '1', 'true'].includes(n) ? { v: 'Sí' } : ['no', 'n', '0', 'false'].includes(n) ? { v: 'No' } : { error: 'escribe Sí o No' }; }
    let t = limpio(crudo, col.max || 120);
    if (col.mayus) t = t.toUpperCase();
    if (col.lista) { const ok = col.lista.find(x => norm(x) === norm(t)); return ok ? { v: ok } : { error: `«${t.slice(0, 24)}» no está en la lista` }; }
    return { v: t };
  }
  const defectoDe = col => (col.defecto !== undefined ? col.defecto : col.tipo === 'entero' || col.tipo === 'dinero' ? 0 : col.tipo === 'sino' ? 'No' : '');
  const mismo = (col, a, b) => ((col.tipo === 'entero' || col.tipo === 'dinero') ? Number(a || 0) === Number(b || 0) : String(a == null ? '' : a).trim() === String(b == null ? '' : b).trim());
  const dineroTxt = n => A().cop(n);
  const verValor = (col, v) => (v === '' || v == null ? '(vacío)' : col.tipo === 'dinero' ? dineroTxt(v) : String(v));

  /* ---------- entender lo que trae el Excel ---------- */
  const colDe = (cfg, t) => {
    const n = norm(t);
    if (n === 'id' || n === 'codigo') return '__id';
    if (n === 'accion') return '__accion';
    const c = cfg.columnas.find(x => norm(x.t) === n || (x.alias || []).some(a => norm(a) === n));
    return c ? c.k : '';
  };
  /** Convierte las filas del Excel en filas ya revisadas: cada una trae lo que se haría o lo que está mal. Se vuelve a calcular con los datos de ahora. */
  function entender(cfg, crudas) {
    const existentes = new Map(cfg.filas().map(f => [f.id, f])), vistos = new Set(), soloAgregar = !cfg.acciones.includes('Cambiar'), acciones = cfg.acciones.map(norm);
    const editables = cfg.columnas.filter(c => !c.gris);
    const filas = crudas.map((crudo, i) => {
      const f = {};
      Object.keys(crudo).forEach(t => { const k = colDe(cfg, t); if (k && (f[k] == null || String(f[k]).trim() === '')) f[k] = crudo[t]; });
      const errores = [], avisos = [], cambios = [], acc = norm(f.__accion);
      const x = { fila: crudo.__fila || i + 2, tipo: '', id: limpio(f.__id, 80), ex: null, v: {}, datos: {}, nombre: '', cambios, errores, avisos, omitida: '' };
      if (acc.startsWith('ejemplo')) { x.omitida = 'ejemplo'; return x; }
      const ex = x.id ? existentes.get(x.id) : null; x.ex = ex || null;
      if (x.id && !ex) { errores.push(`El código ${x.id} no está en la app (¿lo eliminaron?). Para agregarlo como nuevo, deja el código vacío.`); return x; }
      if (soloAgregar && ex) { x.omitida = 'ya'; return x; }
      if (acc !== '' && !acciones.includes(acc)) { errores.push(`No entendí la acción «${limpio(f.__accion, 20)}». Usa ${cfg.acciones.join(', ')} (o déjala vacía).`); return x; }
      if (!x.id && (acc === 'cambiar' || acc === 'eliminar')) { errores.push(`«${acc === 'cambiar' ? 'Cambiar' : 'Eliminar'}» necesita el código de la fila (columna ID).`); return x; }
      if (x.id && acc === 'agregar') { errores.push('Ese ya está en la app (tiene código). Para cambiarlo, deja la acción vacía o escribe «Cambiar».'); return x; }
      if (x.id && vistos.has(x.id)) { errores.push('El código está repetido en el Excel.'); return x; }
      if (x.id) vistos.add(x.id);
      const claveCol = cfg.columnas.find(c => c.clave) || cfg.columnas[0];
      if (acc === 'eliminar') {
        x.tipo = 'eliminar'; x.nombre = String(ex.v[claveCol.k] || x.id);
        const bloqueo = !cfg.puedeEliminar() ? 'No tienes permiso para eliminar aquí.' : (cfg.bloqueaEliminar && cfg.bloqueaEliminar(x.id));
        if (bloqueo) errores.push(bloqueo); else avisos.push('Se elimina. Lo que quedó escrito en su historial no se borra.');
        return x;
      }
      const nuevo = !ex; x.tipo = nuevo ? 'agregar' : 'cambiar';
      editables.forEach(col => {
        const r = leer(col, f[col.k]);
        if (r.error) { errores.push(`${col.t}: ${r.error}.`); return; }
        if (r.vacio) {
          if (nuevo) { if (col.obligatoria) errores.push(`Falta ${col.t}.`); x.v[col.k] = defectoDe(col); } else x.v[col.k] = ex.v[col.k];   // vacío en uno que ya existe = se queda como está
          return;
        }
        x.v[col.k] = r.v;
      });
      x.nombre = String(x.v[claveCol.k] || (ex && ex.v[claveCol.k]) || '');
      if (!errores.length && !nuevo) {
        editables.forEach(col => {
          if (mismo(col, ex.v[col.k], x.v[col.k])) return;
          if (col.fija) { errores.push(`${col.t}: el Excel no cambia este dato de algo que ya está registrado (hoy dice «${verValor(col, ex.v[col.k])}»).`); return; }
          x.datos[col.k] = x.v[col.k]; cambios.push(`${col.t}: ${verValor(col, ex.v[col.k])} → ${verValor(col, x.v[col.k])}`);
        });
      }
      if (!errores.length && cfg.revisar) cfg.revisar(x, { nuevo, ex });
      if (!errores.length) {
        if (nuevo) cambios.push(cfg.resumenNuevo ? cfg.resumenNuevo(x.v) : editables.filter(c => !c.clave && x.v[c.k] !== '' && x.v[c.k] != null).map(c => `${c.t}: ${c.tipo === 'dinero' ? dineroTxt(x.v[c.k]) : x.v[c.k]}`).join(' · '));
        else if (!cambios.length) x.omitida = 'igual';
      }
      return x;
    });
    // Lo que debe ser único (serial, placa…) no se puede repetir entre las filas nuevas, ni con lo que ya está.
    cfg.columnas.filter(c => c.unico).forEach(col => {
      const quita = new Set(filas.filter(x => x.tipo === 'eliminar' && !x.errores.length).map(x => x.id)), cuenta = new Map(), n = v => norm(v);
      cfg.filas().filter(f => !quita.has(f.id)).forEach(f => cuenta.set(n(f.v[col.k]), (cuenta.get(n(f.v[col.k])) || 0) + 1));
      filas.filter(x => x.tipo === 'agregar' && !x.errores.length).forEach(x => cuenta.set(n(x.v[col.k]), (cuenta.get(n(x.v[col.k])) || 0) + 1));
      filas.forEach(x => { if (x.tipo === 'agregar' && !x.errores.length && cuenta.get(n(x.v[col.k])) > 1) x.errores.push(`${col.t}: ya hay uno con «${x.v[col.k]}» (en la app o repetido en el Excel).`); });
    });
    if (cfg.revisarTodo) cfg.revisarTodo(filas);   // revisiones entre varias filas (por ejemplo, nombres repetidos que solo molestan entre ciertas filas)
    return filas;
  }

  async function leerArchivo(cfg, archivo) {
    if (!archivo) return null;
    if (archivo.size > MAX_BYTES) throw new Error('El archivo pesa mucho. Usa uno de menos de 1 MB.');
    if (!/\.(xlsx|xls|csv)$/i.test(archivo.name)) throw new Error('Sube un archivo de Excel (.xlsx) o CSV.');
    const X = await cargarXlsx(), libro = X.read(await archivo.arrayBuffer(), { type: 'array' });
    const orden = libro.SheetNames.filter(n => norm(n) === norm(cfg.hoja)).concat(libro.SheetNames), claveCol = cfg.columnas.find(c => c.clave) || cfg.columnas[0];
    for (const n of orden) {
      // Los números se leen como números (raw) para no confundir «$85,000» con texto.
      const m = X.utils.sheet_to_json(libro.Sheets[n], { header: 1, defval: '', raw: true, blankrows: true });
      const h = m.slice(0, 20).findIndex(fila => { const c = fila.map(t => colDe(cfg, t)); return c.includes(claveCol.k) && c.filter(Boolean).length >= Math.min(3, cfg.columnas.length); });
      if (h < 0) continue;
      const titulos = m[h].map(c => String(c)), filas = [];
      m.slice(h + 1).forEach((fila, k) => {
        if (!fila.some(c => String(c == null ? '' : c).trim() !== '')) return;   // fila vacía: se salta
        const o = { __fila: h + k + 2 };
        titulos.forEach((t, j) => { if (t.trim() !== '') o[t] = fila[j] == null ? '' : fila[j]; });
        filas.push(o);
      });
      if (!filas.length) throw new Error('No encontré filas. Escríbelas debajo de los títulos.');
      if (filas.length > MAX_FILAS) throw new Error(`El Excel tiene ${filas.length} filas y el máximo es ${MAX_FILAS}. Súbelo en partes.`);
      return filas;
    }
    throw new Error(`No encontré los títulos (${cfg.columnas.filter(c => !c.gris).slice(0, 3).map(c => c.t).join(', ')}…). Usa el Excel que baja el botón «Descargar base de datos».`);
  }

  /* ---------- descargar ---------- */
  async function descargar(cfg, b) {
    b.disabled = true;
    try {
      const hoy = A().hoyISO(), L = window.Excel.letra, listas = [], rangoDe = (titulo, valores) => { const i = listas.length; listas.push({ t: titulo, valores }); return { hoja: 'Listas', rango: `$${L(i + 1)}$5:$${L(i + 1)}$${4 + Math.max(1, valores.length)}` }; };
      const conAcc = cfg.acciones.length > 0;
      const cols = [{ t: 'ID', ancho: 16, gris: true }];
      if (conAcc) cols.push({ t: 'Acción', ancho: 14, lista: rangoDe('Acción', cfg.acciones) });
      cfg.columnas.forEach(c => {
        const o = { t: c.t, ancho: c.ancho || (c.tipo === 'fecha' || c.tipo === 'hora' ? 16 : c.tipo === 'sino' ? 12 : undefined), gris: c.gris };
        if (c.tipo === 'entero' || c.tipo === 'dinero') { o.tipo = c.tipo === 'dinero' ? 'dinero' : 'numero'; if (!o.gris) o.validar = { min: c.min || 0 }; }
        if (c.lista && !o.gris) o.lista = rangoDe(c.t, c.lista); else if (c.tipo === 'sino' && !o.gris) o.lista = rangoDe(c.t, ['Sí', 'No']);
        cols.push(o);
      });
      const celda = (c, v) => ((c.tipo === 'entero' || c.tipo === 'dinero') ? (v === '' || v == null ? '' : Number(v)) : (v == null ? '' : v));
      const soloAgregar = !cfg.acciones.includes('Cambiar');   // lo que ya está se muestra en gris: aquí solo se agrega
      const filas = cfg.filas().map(f => { const celdas = [f.id].concat(conAcc ? [''] : [], cfg.columnas.map(c => celda(c, f.v[c.k]))); return soloAgregar ? { estilo: 'gris', celdas } : celdas; });
      filas.push({ estilo: 'ejemplo', celdas: [''].concat(conAcc ? ['Ejemplo (se ignora)'] : [], cfg.columnas.map(c => celda(c, (cfg.ejemplo || {})[c.k]))) });
      const base = { nombre: cfg.hoja, titulo: cfg.titulo, vacias: 20, columnas: cols, filas,
        subtitulo: `${cfg.sub} (${hoy}). Escribe lo nuevo en las filas de abajo, sin código (ID), y sube este mismo archivo en la app: te muestra qué cambia y tú confirmas. Las columnas grises solo se miran. La fila amarilla es de ejemplo y se ignora.` };
      const gen = [['Cómo se usa', 'Una fila nueva (sin código) se agrega. Nada se guarda hasta que subes el archivo y tocas «Guardar» en la app. Si subes el mismo archivo otra vez, lo que ya quedó guardado no se repite.']];
      if (cfg.acciones.includes('Cambiar')) gen.push(['Cambiar', 'Cambia la celda de una fila que ya tiene código; la app lo detecta sola (la columna Acción puede quedar vacía). Lo que dejes vacío se queda como está.']);
      if (cfg.acciones.includes('Eliminar')) gen.push(['Eliminar', 'Escribe «Eliminar» en la columna Acción. Borrar la fila NO elimina nada.']); else gen.push(['Eliminar o cambiar lo que ya está', 'No se hace desde el Excel (para cuidar el rastro): se hace en la app.']);
      gen.push(['Código (ID)', 'No lo cambies: así la app sabe de cuál se trata.']);
      const ayuda = { nombre: 'Ayuda', titulo: 'Cómo usar esta base de datos', subtitulo: cfg.sub, columnas: [{ t: 'Qué', ancho: 30 }, { t: 'Cómo', ancho: 100 }], filas: gen.concat(cfg.ayuda || [], cfg.columnas.filter(c => c.lista).map(c => [c.t, c.lista.join(', ')])) };
      const hojas = [base, ayuda];
      if (listas.length) {
        const alto = Math.max(...listas.map(l => l.valores.length));
        hojas.push({ nombre: 'Listas', titulo: 'Listas de opciones (no tocar)', subtitulo: `Alimentan los menús desplegables de la hoja ${cfg.hoja}.`, oculta: true, columnas: listas.map(l => ({ t: l.t, ancho: 22 })),
          filas: Array.from({ length: alto }, (_, k) => listas.map(l => l.valores[k] || '')) });
      }
      await window.Excel.descargar({ archivo: `${cfg.archivo} ${hoy}`, hojas });
      A().toast('Listo: base de datos descargada');
    } catch (e) { A().toast('No se pudo preparar el Excel. Revisa la conexión y vuelve a intentar.'); }
    finally { b.disabled = false; }
  }

  /* ---------- vista previa ---------- */
  function htmlPrevia(cfg) {
    const e = st(cfg.clave), App = A(), todas = entender(cfg, e.previa.crudas), act = todas.filter(x => !x.omitida), buenas = act.filter(x => !x.errores.length);
    const n = t => buenas.filter(x => x.tipo === t).length, malas = act.length - buenas.length;
    const iguales = todas.filter(x => x.omitida === 'igual').length, ya = todas.filter(x => x.omitida === 'ya').length, ejemplo = todas.filter(x => x.omitida === 'ejemplo').length;
    const omit = [iguales ? `${pl(iguales, 'ya estaba igual', 'ya estaban iguales')} (no se tocan)` : '', ya ? `${pl(ya, 'ya estaba', 'ya estaban')} en la app (no se tocan; para cambiarlos usa la app)` : '', ejemplo ? `${pl(ejemplo, 'fila de ejemplo', 'filas de ejemplo')} (se ignoran)` : ''].filter(Boolean).join(' · ');
    const partes = [n('agregar') ? `${n('agregar')} para agregar` : '', n('cambiar') ? `${n('cambiar')} para cambiar` : '', n('eliminar') ? `${n('eliminar')} para eliminar` : ''].filter(Boolean).join(' · ') || 'nada para guardar';
    let h = `<div class="card"><b>Esto entendí del Excel (${pl(todas.length, 'fila', 'filas')})</b><span class="meta">${esH(partes)}${malas ? ` · ${malas} con problema (no se guardan)` : ''}${omit ? ' · ' + esH(omit) : ''}. Revisa y toca «Guardar». Nada se guarda antes.</span></div>`;
    h += `<div class="list">${act.map(x => {
      const tono = x.errores.length ? ['Con problema', 's-peligro', 'aviso'] : x.tipo === 'agregar' ? ['Agregar', 's-disco', 'mas'] : x.tipo === 'eliminar' ? ['Eliminar', 's-peligro', 'aviso'] : ['Cambiar', 's-pend', 'lapiz'];
      return `<div class="card persona-reg${x.errores.length ? ' pausada' : ''}"><span class="card-head"><span class="card-title">${esH(x.nombre || '(sin nombre)')}</span>${App.pill(tono[0], tono[1], tono[2])}</span>
        <span class="meta">Fila ${x.fila}${x.id ? ' · ' + esH(x.id) : ' · nuevo'}</span>
        ${x.errores.map(m => `<span class="meta err-txt">${esH(m)}</span>`).join('')}${x.errores.length ? '' : x.cambios.concat(x.avisos).filter(Boolean).map(m => `<span class="meta">${esH(m)}</span>`).join('')}</div>`;
    }).join('')}</div>`;
    return h + `<div class="row acciones-inv"><button class="btn primary" type="button" data-xbd="guardar" data-clave="${esH(cfg.clave)}"${buenas.length && !e.aplicando ? '' : ' disabled'}>${window.ico('check')}Guardar ${pl(buenas.length, 'cambio', 'cambios')}</button><button class="btn ghost" type="button" data-xbd="descartar" data-clave="${esH(cfg.clave)}">Descartar</button></div>`;
  }
  /** Botones, error y vista previa de una ventana (vacío si la persona no puede subir). */
  function html(cfg) {
    if (!cfg.puedeSubir()) return '';
    const e = st(cfg.clave);
    let h = `<div class="row acciones-inv"><button class="btn small" type="button" data-xbd="bajar" data-clave="${esH(cfg.clave)}"><span data-ico="excel"></span>Descargar base de datos</button>` +
      `<label class="btn small foto-btn"><span data-ico="importar"></span>Subir Excel<input class="archivo-oculto" type="file" accept=".xlsx,.xls,.csv" data-xbd-archivo="${esH(cfg.clave)}"></label></div>`;
    if (e.error) h += `<div class="err" role="alert">${esH(e.error)}</div>`;
    if (e.previa) h += htmlPrevia(cfg);
    return h;
  }

  /* ---------- guardar ---------- */
  async function guardar(cfg, repintar) {
    const e = st(cfg.clave);
    if (e.aplicando || !e.previa) return;
    const hechas = () => entender(cfg, e.previa.crudas).filter(x => !x.omitida && !x.errores.length);
    let buenas = hechas();
    if (!buenas.length) return;
    const elim = buenas.filter(x => x.tipo === 'eliminar');
    if (elim.length) {
      const ok = await A().confirmar(`¿Eliminar ${pl(elim.length, 'registro', 'registros')}?`, `${elim.slice(0, 8).map(x => x.nombre).join(', ')}${elim.length > 8 ? '…' : ''}. Lo que quedó escrito en su historial no se borra.`, 'Eliminar');
      if (!ok) return;
      buenas = hechas();   // los datos pudieron cambiar mientras se pensaba
    }
    e.aplicando = true; e.error = '';
    const cuenta = t => buenas.filter(x => x.tipo === t).length, tope = cfg.maxOps || 100;
    const lotes = []; let cur = [];
    buenas.forEach(x => {
      const ops = (x.tipo === 'agregar' ? cfg.opsAgregar(x) : x.tipo === 'cambiar' ? cfg.opsCambiar(x) : cfg.opsEliminar(x)).filter(Boolean);
      if (cur.length && cur.length + ops.length > tope) { lotes.push(cur); cur = []; }
      cur.push(...ops);
    });
    const extra = cfg.alGuardar ? cfg.alGuardar(buenas).filter(Boolean) : [];
    if (cur.length || !lotes.length) lotes.push(cur);
    lotes[lotes.length - 1].push(...extra);
    const resumen = [cuenta('agregar') ? pl(cuenta('agregar'), 'agregado', 'agregados') : '', cuenta('cambiar') ? pl(cuenta('cambiar'), 'cambiado', 'cambiados') : '', cuenta('eliminar') ? pl(cuenta('eliminar'), 'eliminado', 'eliminados') : ''].filter(Boolean).join(', ');
    let hechos = 0;
    try {
      for (const lote of lotes) { await window.nube.lote(lote); hechos += lote.length; }
      e.previa = null;
      A().toast(`Listo: ${resumen}.`);
      if (cfg.despues) cfg.despues(buenas);   // por ejemplo, mandar los avisos al teléfono
    } catch (er) {
      e.error = `${window.nube.explicar(er)}${hechos ? ' Una parte ya se guardó: revisa y vuelve a subir el mismo Excel (lo que ya quedó no se repite).' : ''}`;
    } finally { e.aplicando = false; repintar(); }
  }

  /** Conecta los botones y la subida del archivo de una ventana. cfgs: { clave: () => cfg }. */
  function conectar(cont, cfgs, repintar) {
    cont.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-xbd]'); if (!b || !cfgs[b.dataset.clave]) return;
      const cfg = cfgs[b.dataset.clave](), e = st(cfg.clave);
      if (!cfg.puedeSubir()) return;
      if (b.dataset.xbd === 'bajar') return descargar(cfg, b);
      if (b.dataset.xbd === 'guardar') return guardar(cfg, repintar);
      if (b.dataset.xbd === 'descartar') { e.previa = null; e.error = ''; repintar(); }
    });
    cont.addEventListener('change', async ev => {
      const a = ev.target.closest('input[data-xbd-archivo]'); if (!a || !cfgs[a.dataset.xbdArchivo]) return;
      const cfg = cfgs[a.dataset.xbdArchivo](), e = st(cfg.clave);
      if (!cfg.puedeSubir()) return;
      e.error = '';
      try { const filas = await leerArchivo(cfg, a.files && a.files[0]); e.previa = filas ? { crudas: filas } : null; }
      catch (er) { e.previa = null; e.error = er && er.message === 'xlsx' ? 'No se pudo cargar el lector de Excel. Revisa la conexión y vuelve a intentar.' : (er && er.message) || 'No se pudo leer el archivo.'; }
      repintar();
    });
  }

  window.ExcelBD = Object.freeze({ html, conectar, entender });
})();
