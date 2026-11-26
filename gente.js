/* gente.js — Panel «Personas y permisos» (solo la Jefe, con cuenta propia).
   Aquí la Jefe: (1) sube un Excel con las personas (nombre, correo, rol y permisos) y queda una invitación por correo;
   (2) le cambia a cada persona el rol, el acceso (pausar) y el nivel que tiene en cada módulo (sin acceso, solo ver o un nivel de trabajo);
   (3) maneja los códigos de rol; (4) apaga las personas de prueba cuando la app pase a uso real.
   Persona que entra: usuarios/<uid> = { nombre, correo, rol, codigo, activo, extras, permisos }. Invitación: invitaciones/<correo>.
   A los Gerentes y a otras Jefes no se les cambia nada desde aquí (solo desde la consola de Firebase): así una Jefe no puede sacar a otra.
   Los nombres y correos reales solo viven en Firebase: este archivo no lleva ninguno. */
(function () {
  'use strict';
  const A = () => window.App;
  const $ = id => document.getElementById(id);
  const esH = v => A().esH(v);
  const yo = () => A().S.persona;
  const esJefeReal = () => !!yo() && yo().real === true && yo().rol === 'jefe';
  const esDireccion = rol => ['gerente', 'jefe'].includes(rol);
  const MAX_FILAS = 200, MAX_BYTES = 1000000;
  let ocupado = false, previa = null;   // previa: las filas del Excel ya entendidas, esperando el «Guardar»

  /* ---------- entender el Excel ---------- */
  // Sin tildes, en minúscula y con espacios simples, para que «Bodeguera», «bodega » y «BODEGA» sean lo mismo.
  const norm = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@._ ;,-]/g, ' ').replace(/\s+/g, ' ').trim();
  const ROL_ALIAS = {
    gerente: 'gerente', 'gerente general': 'gerente', jefe: 'jefe', jefa: 'jefe', 'jefe de operaciones': 'jefe',
    equipos: 'equipos', 'encargado de equipos': 'equipos', 'encargada de equipos': 'equipos', soporte: 'soporte',
    compras: 'compras', 'encargado de compras': 'compras', 'encargada de compras': 'compras',
    bodega: 'asistente', bodeguero: 'asistente', bodeguera: 'asistente', 'encargado de bodega': 'asistente', 'encargada de bodega': 'asistente', asistente: 'asistente',
    transporte: 'carros', carros: 'carros', 'coordinador de transporte': 'carros', 'coordinadora de transporte': 'carros',
    conductor: 'conductor', conductora: 'conductor', logistica: 'logistica', 'auxiliar de logistica': 'logistica',
    profesional: 'profesional', 'profesional de campo': 'profesional',
    administrativo: 'administrativo', administrativa: 'administrativo', 'auxiliar administrativo': 'administrativo', 'auxiliar administrativa': 'administrativo',
    // Cargos del organigrama de la empresa
    'gerente de proyectos': 'gerente', 'lider abastecimiento': 'jefe', 'lider abastecimiento y coord seguimiento y control': 'jefe', 'coord seguimiento y control': 'jefe',
    'asistente ti': 'soporte', 'auxiliar ti': 'equipos', 'coord compras': 'coordcompras', 'coordinador de compras': 'coordcompras', 'coordinadora de compras': 'coordcompras', 'auxiliar compras': 'compras', 'auxiliar compras mgc': 'compras', 'coord transporte': 'carros',
    'profesional logistico hse': 'logistica', 'profesional logistico': 'logistica', 'asistente administrativa': 'administrativo', 'asistente seguimiento y control': 'administrativo',
    'coordinador sgi': 'profesional', 'profesional sgi': 'profesional', 'prof control de gestion': 'profesional', 'profesional control de gestion': 'profesional',
    'lider gestion de contratos': 'profesional', 'coord licitaciones': 'profesional', 'profesional licitaciones': 'profesional',
    colaborador: 'colaborador', colaboradora: 'colaborador', recepcionista: 'colaborador', mensajero: 'colaborador', 'servicios generales': 'colaborador', 'asistente sgi': 'colaborador',
    'coord gestion humana': 'colaborador', 'asist gestion humana': 'colaborador', 'aux gestion humana': 'colaborador', 'gerente administrativa': 'colaborador',
    financiero: 'financiero', financiera: 'financiero', contador: 'financiero', contadora: 'financiero', 'profesional contable': 'financiero',
    'asist contable': 'colaborador', 'auxiliar contable': 'colaborador', 'asist nomina': 'colaborador', 'asist reembolsables': 'colaborador', 'gerente financiera': 'financiero', 'gerente financiero': 'financiero',
    consulta: 'consulta', 'revisor fiscal': 'consulta', 'oficial de cumplimiento': 'consulta', auditor: 'consulta', auditora: 'consulta'
  };
  const NIVEL_ALIAS = {
    '': '', 'como su rol': '', 'sin acceso': 'no', no: 'no', ninguno: 'no', 'solo ver': 'ver', ver: 'ver', encargado: 'encargado', soporte: 'soporte',
    pide: 'pide', 'pide material': 'pide', finanzas: 'finanzas', 've compras y facturas': 'finanzas', compra: 'compra', compras: 'compra', 'hace las compras': 'compra', bodega: 'bodega', 'encargada de bodega': 'bodega', reporta: 'reporta', autoriza: 'autoriza', coordina: 'coordina', 'coordina compras': 'coordina', 'coordinador de compras': 'coordina', 'coordinadora de compras': 'coordina'
  };
  const EXTRA_ALIAS = { compra: 'compra', compras: 'compra', actas: 'actas', encargada: 'encargada', 'encargada de reuniones': 'encargada' };
  const COLUMNA = { nombre: 'nombre', nombres: 'nombre', 'nombre completo': 'nombre', correo: 'correo', email: 'correo', 'e-mail': 'correo', 'correo electronico': 'correo', rol: 'rol', cargo: 'rol',
    equipos: 'equipos', inventario: 'inventario', vehiculos: 'vehiculos', reuniones: 'reuniones', extras: 'extras', 'permisos extra': 'extras', 'permiso extra': 'extras', estado: 'estado' };
  const rolDeTexto = t => {
    const n = norm(t).replace(/\./g, ' ').replace(/\s+/g, ' ').trim(); if (!n) return null;
    if (ROL_ALIAS[n]) return ROL_ALIAS[n];
    const r = window.DEMO.ROLES.find(x => norm(x.rolTxt) === n || norm(x.cargo) === n);
    return r ? r.rol : null;
  };

  /** Convierte las filas del Excel en filas ya revisadas: cada una trae lo que se guardaría o lo que está mal. */
  function entender(filasCrudas) {
    const D = window.DEMO, S = A().S, vistos = new Set();
    const registrados = new Set(S.datos.usuarios.map(u => String(u.correo || '').toLowerCase()));
    const invitados = new Set(S.datos.invitaciones.map(i => String(i.id).toLowerCase()));
    return filasCrudas.map((crudo, i) => {
      const f = {};
      // Si hay dos columnas que significan lo mismo (Correo y Correo electrónico), una vacía no pisa a la que tiene el dato.
      Object.keys(crudo).forEach(k => { const c = COLUMNA[norm(k)]; if (c && String(f[c] == null ? '' : f[c]).trim() === '') f[c] = crudo[k]; });
      const errores = [], avisos = [];
      const nombre = String(f.nombre == null ? '' : f.nombre).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
      const correo = String(f.correo == null ? '' : f.correo).replace(/\s+/g, '').toLowerCase();
      const rol = rolDeTexto(f.rol);
      const fila = crudo.__fila || i + 2;
      // Lo que ya está en la app (o es de ejemplo) no se vuelve a guardar: así se puede subir la misma plantilla con las personas nuevas agregadas.
      const marca = norm(f.estado);
      if (marca.startsWith('ejemplo')) return { fila, nombre, correo, rol, permisos: {}, extras: [], errores, avisos, omitida: 'ejemplo' };
      if (correo && registrados.has(correo)) { vistos.add(correo); return { fila, nombre, correo, rol, permisos: {}, extras: [], errores, avisos, omitida: 'registrada' }; }
      if (nombre.length < 3) errores.push('Falta el nombre (mínimo 3 letras).');
      else if (/^[=+\-@]/.test(nombre)) errores.push('El nombre no puede empezar con = + - ni @.');
      if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(correo) || correo.length > 80) errores.push('El correo no está bien escrito.');
      else if (D.porCorreo(correo)) errores.push('Ese correo es de una persona de prueba.');
      else if (vistos.has(correo)) errores.push('El correo está repetido en el Excel.');
      if (correo) vistos.add(correo);
      if (!rol) errores.push(`No entendí el rol «${String(f.rol == null ? '' : f.rol).slice(0, 30)}». Usa uno de la hoja Ayuda.`);
      const permisos = {};
      ['equipos', 'inventario', 'vehiculos', 'reuniones'].forEach(m => {
        const txt = String(f[m] == null ? '' : f[m]), n = norm(txt);
        if (!(n in NIVEL_ALIAS)) { errores.push(`No entendí el nivel «${txt.slice(0, 30)}» de ${m}.`); return; }
        const v = NIVEL_ALIAS[n]; if (!v) return;
        if (v !== 'no' && !D.NIVELES[m].some(x => x[0] === v)) { errores.push(`El nivel «${txt.slice(0, 30)}» no sirve en ${m}.`); return; }
        permisos[m] = v;
      });
      if (rol && esDireccion(rol)) errores.push('Los Gerentes y las Jefes se crean desde la consola de Firebase, no desde el Excel.');
      const extras = [];
      String(f.extras == null ? '' : f.extras).split(/[;,]/).map(norm).filter(Boolean).forEach(t => {
        const id = EXTRA_ALIAS[t], e = D.EXTRAS.find(x => x.id === id);
        if (!e) errores.push(`No entendí el permiso extra «${t.slice(0, 30)}».`);
        else if (rol && !e.roles.includes(rol)) errores.push(`El permiso extra «${e.txt}» no sirve para ese rol.`);
        else if (!extras.includes(id)) extras.push(id);
      });
      if (!errores.length && invitados.has(correo)) {
        const ya = S.datos.invitaciones.find(x => String(x.id).toLowerCase() === correo), mismo = ya && ya.nombre === nombre && ya.rol === rol
          && JSON.stringify(Object.entries(ya.permisos || {}).sort()) === JSON.stringify(Object.entries(permisos).sort()) && JSON.stringify((ya.extras || []).slice().sort()) === JSON.stringify(extras.slice().sort());
        if (mismo) return { fila, nombre, correo, rol, permisos, extras, errores, avisos, omitida: 'invitada' };
        avisos.push('Ya tenía invitación: se reemplaza con lo nuevo.');
      }
      return { fila, nombre, correo, rol, permisos, extras, errores, avisos, omitida: '' };
    });
  }

  const xlsx = () => (window.Inventario ? window.Inventario.cargarXlsx() : Promise.reject(new Error('xlsx')));
  async function leerArchivo(archivo) {
    if (!archivo) return;
    if (archivo.size > MAX_BYTES) throw new Error('El archivo pesa mucho. Usa uno de menos de 1 MB.');
    if (!/\.(xlsx|xls|csv)$/i.test(archivo.name)) throw new Error('Sube un archivo de Excel (.xlsx) o CSV.');
    const X = await xlsx();
    const libro = X.read(await archivo.arrayBuffer(), { type: 'array' });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    // Los títulos pueden estar en la fila 1 (archivo simple) o más abajo (la plantilla trae un título y una explicación arriba).
    const matriz = X.utils.sheet_to_json(hoja, { header: 1, defval: '', raw: false, blankrows: true });
    const esTitulos = fila => fila.filter(c => COLUMNA[norm(c)]).length >= 2 && fila.some(c => COLUMNA[norm(c)] === 'correo');
    const h = matriz.slice(0, 20).findIndex(esTitulos);
    if (h < 0) throw new Error('No encontré los títulos (Nombre, Correo y Rol). Usa la plantilla que baja el botón «Descargar plantilla».');
    const titulos = matriz[h].map(c => String(c));
    const filas = [];
    matriz.slice(h + 1).forEach((fila, k) => {
      if (!fila.some(c => String(c == null ? '' : c).trim() !== '')) return;   // fila vacía: se salta
      const o = { __fila: h + k + 2 };
      titulos.forEach((tt, j) => { if (tt.trim() !== '') o[tt] = fila[j] == null ? '' : fila[j]; });
      filas.push(o);
    });
    if (!filas.length) throw new Error('No encontré filas con personas. Escribe las personas debajo de los títulos.');
    if (filas.length > MAX_FILAS) throw new Error(`El Excel tiene ${filas.length} filas y el máximo es ${MAX_FILAS}. Súbelo en partes.`);
    return entender(filas);
  }
  // Texto de cada nivel como lo entiende el lector del Excel (y como sale en las listas desplegables).
  const NIVEL_TXT = { no: 'Sin acceso', ver: 'Solo ver', encargado: 'Encargado', soporte: 'Soporte', pide: 'Pide material', finanzas: 'Finanzas', coordina: 'Coordina compras', compra: 'Hace las compras', bodega: 'Encargada de bodega', reporta: 'Reporta', autoriza: 'Autoriza' };
  const MODULOS = [['equipos', 'Equipos'], ['inventario', 'Inventario'], ['vehiculos', 'Vehículos'], ['reuniones', 'Reuniones']];
  const nivelTxt = (p, m) => { const v = (p || {})[m]; return v ? (NIVEL_TXT[v] || '') : ''; };
  const extrasTxt = (rol, lista) => window.DEMO.extrasDe(rol, lista).join(', ');
  /** Plantilla con formato: título, columnas en negrilla, lo que ya está en la app, dos ejemplos y filas vacías con listas desplegables.
      La misma plantilla se puede volver a subir: lo que ya está y los ejemplos se ignoran, solo se guarda lo nuevo. */
  async function descargarPlantilla(b) {
    b.disabled = true;
    try {
      const D = window.DEMO, S = A().S, roles = D.ROLES.filter(r => !esDireccion(r.rol));
      const rolTxt = rol => { const r = D.rolDe(rol); return r ? r.rolTxt : rol; };
      const porNombre = (x, y) => String(x.nombre).localeCompare(String(y.nombre));
      const filas = [];
      S.datos.usuarios.slice().sort(porNombre).forEach(u => filas.push({ estilo: 'gris', celdas: [u.nombre, u.correo, rolTxt(u.rol),
        nivelTxt(u.permisos, 'equipos'), nivelTxt(u.permisos, 'inventario'), nivelTxt(u.permisos, 'vehiculos'), nivelTxt(u.permisos, 'reuniones'), extrasTxt(u.rol, u.extras), u.activo === true ? 'Ya registrada' : 'Ya registrada (pausada)'] }));
      S.datos.invitaciones.slice().sort(porNombre).forEach(i => filas.push({ estilo: 'gris', celdas: [i.nombre, i.id, rolTxt(i.rol),
        nivelTxt(i.permisos, 'equipos'), nivelTxt(i.permisos, 'inventario'), nivelTxt(i.permisos, 'vehiculos'), nivelTxt(i.permisos, 'reuniones'), extrasTxt(i.rol, i.extras), 'Invitada'] }));
      filas.push({ estilo: 'ejemplo', celdas: ['Persona Ejemplo Uno', 'persona.uno@example.com', 'Bodega', 'Solo ver', '', '', '', '', 'Ejemplo (se ignora)'] });
      filas.push({ estilo: 'ejemplo', celdas: ['Persona Ejemplo Dos', 'persona.dos@example.com', 'Compras', '', '', 'Sin acceso', '', '', 'Ejemplo (se ignora)'] });
      const nivelesDe = m => ['Sin acceso'].concat(D.NIVELES[m].map(x => NIVEL_TXT[x[0]]).filter(Boolean));
      // Hoja oculta con las opciones de los menús desplegables (sus datos empiezan en la fila 5: título, explicación, respiro y títulos).
      const cols = [roles.map(r => r.rolTxt)].concat(MODULOS.map(([m]) => nivelesDe(m)), [D.EXTRAS.filter(e => !e.roles.includes('gerente')).map(e => e.id)]);
      const listas = { nombre: 'Listas', titulo: 'Listas de opciones (no tocar)', subtitulo: 'Estas opciones alimentan los menús desplegables de la hoja Personas.', oculta: true,
        columnas: [{ t: 'Rol', ancho: 24 }].concat(MODULOS.map(([, n]) => ({ t: n, ancho: 24 })), [{ t: 'Permisos extra', ancho: 24 }]), filas: [] };
      for (let k = 0; k < Math.max(...cols.map(c => c.length)); k++) listas.filas.push(cols.map(c => c[k] || ''));
      const rango = (col, n) => ({ hoja: 'Listas', rango: `$${col}$5:$${col}$${4 + Math.max(1, n)}` });
      const personas = { nombre: 'Personas', titulo: 'Plantilla de personas', vacias: 12,
        subtitulo: 'Una fila por persona. Las filas en gris ya están en la app: déjalas como están. Agrega las personas nuevas en las filas de abajo (Nombre, Correo y Rol son obligatorios; el resto se deja vacío si la persona hace lo que dice su rol) y sube este mismo archivo. Las filas amarillas son de ejemplo y se ignoran. Gerentes y Jefes no van aquí: se crean desde la consola de Firebase.',
        columnas: [{ t: 'Nombre', ancho: 30 }, { t: 'Correo', ancho: 36 }, { t: 'Rol', ancho: 22, lista: rango('A', roles.length) }, { t: 'Equipos', ancho: 20, lista: rango('B', cols[1].length) },
          { t: 'Inventario', ancho: 22, lista: rango('C', cols[2].length) }, { t: 'Vehículos', ancho: 20, lista: rango('D', cols[3].length) }, { t: 'Reuniones', ancho: 20, lista: rango('E', cols[4].length) },
          { t: 'Permisos extra', ancho: 22, lista: rango('F', cols[5].length) }, { t: 'Estado', ancho: 24 }],
        filas };
      const ayuda = { nombre: 'Ayuda', titulo: 'Cómo llenar la plantilla', subtitulo: 'Roles, niveles y permisos extra que sirven. Si dejas un nivel vacío, la persona hace lo que dice su rol.',
        columnas: [{ t: 'Qué', ancho: 28 }, { t: 'Opciones o explicación', ancho: 90 }],
        filas: [['Rol', roles.map(r => r.rolTxt).join(', ')], ['Equipos', nivelesDe('equipos').join(', ')], ['Inventario', nivelesDe('inventario').join(', ')], ['Vehículos', nivelesDe('vehiculos').join(', ')],
          ['Reuniones', nivelesDe('reuniones').join(', ')], ['Permisos extra', D.EXTRAS.filter(e => !e.roles.includes('gerente')).map(e => `${e.id}: ${e.txt} (solo para ${e.roles.join(', ')})`).join(' · ')],
          ['Estado', 'Lo llena la app (Ya registrada, Invitada, Ejemplo). En las filas nuevas déjalo vacío.'], ['Correo', 'El mismo con el que la persona va a entrar (con Google o con su clave).'],
          ['Cargos del organigrama', 'En la columna Rol también puedes escribir el cargo (por ejemplo «Contador» o «Recepcionista»): la app lo traduce al rol.']] };
      const hojaRoles = { nombre: 'Roles', titulo: 'Roles de la app', subtitulo: 'Para qué sirve cada uno.', columnas: [{ t: 'Rol', ancho: 24 }, { t: 'Quién es', ancho: 44 }, { t: 'Inventario', ancho: 40 }],
        filas: roles.map(r => [r.rolTxt, r.cargo, D.PERMISO_TXT[r.permisos.inventario] || '']) };
      await window.Excel.descargar({ archivo: 'Plantilla personas', hojas: [personas, ayuda, hojaRoles, listas] });
    } catch (e) { A().toast('No se pudo preparar la plantilla. Revisa la conexión y vuelve a intentar.'); }
    finally { b.disabled = false; }
  }

  /* ---------- pantalla ---------- */
  function abrir() {
    if (!esJefeReal()) return;
    pintar(true);
    A().abrirHoja('shGente');
  }
  const resumenPermisos = (p, rol) => {
    const D = window.DEMO, r = D.rolDe(rol), partes = Object.entries(p || {}).map(([m, v]) => `${m}: ${v === 'no' ? 'sin acceso' : (D.PERMISO_TXT[v] || v).toLowerCase()}`);
    return partes.length ? partes.join(' · ') : `Como ${r ? r.rolTxt : rol}`;
  };
  function htmlPrevia() {
    const todas = previa, f = todas.filter(x => !x.omitida), buenas = f.filter(x => !x.errores.length), A_ = A(), D = window.DEMO;
    const ya = todas.filter(x => x.omitida === 'registrada' || x.omitida === 'invitada').length, ejemplo = todas.filter(x => x.omitida === 'ejemplo').length;
    const omit = [ya ? `${ya} ya ${ya === 1 ? 'estaba' : 'estaban'} en la app (no se tocan)` : '', ejemplo ? `${ejemplo} ${ejemplo === 1 ? 'fila de ejemplo' : 'filas de ejemplo'} (se ignoran)` : ''].filter(Boolean).join(' · ');
    let h = `<div class="card"><b>Esto entendí del Excel (${todas.length} ${todas.length === 1 ? 'fila' : 'filas'})</b><span class="meta">${buenas.length} lista${buenas.length === 1 ? '' : 's'} para guardar${f.length - buenas.length ? ` · ${f.length - buenas.length} con problema (no se guardan)` : ''}${omit ? ' · ' + omit : ''}. Revisa y toca «Guardar».</span></div>`;
    h += `<div class="list">${f.map(x => `<div class="card persona-reg${x.errores.length ? ' pausada' : ''}">
      <span class="card-head"><span class="card-title">${esH(x.nombre || '(sin nombre)')}</span>${A_.pill(x.errores.length ? 'Con problema' : 'Lista', x.errores.length ? 's-peligro' : 's-disco', x.errores.length ? 'aviso' : 'check')}</span>
      <span class="meta">Fila ${x.fila} · ${esH(x.correo || 'sin correo')} · ${esH(x.rol ? D.rolDe(x.rol).rolTxt : 'sin rol')}</span>
      ${x.errores.length ? x.errores.map(e => `<span class="meta err-txt">${esH(e)}</span>`).join('') : `<span class="meta">${esH(resumenPermisos(x.permisos, x.rol))}${x.extras.length ? ' · extra: ' + esH(x.extras.join(', ')) : ''}</span>`}
      ${x.avisos.map(e => `<span class="meta">${esH(e)}</span>`).join('')}
    </div>`).join('')}</div>`;
    h += `<div class="row acciones-inv"><button class="btn primary" type="button" data-g="guardarinv"${buenas.length ? '' : ' disabled'}>${window.ico('check')}Guardar ${buenas.length} ${buenas.length === 1 ? 'invitación' : 'invitaciones'}</button><button class="btn ghost" type="button" data-g="descartar">Descartar</button></div>`;
    return h;
  }
  function htmlInvitaciones() {
    const S = A().S, D = window.DEMO, lista = S.datos.invitaciones.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
    let h = `<div class="section-label">Agregar personas con un Excel</div>
      <p class="meta">Descarga la plantilla, llénala con nombre, correo y rol, y súbela. Cada persona entra con ese correo (con Google o creando su clave) y la app le pone el rol y los permisos que dijiste.</p>
      <div class="row acciones-inv"><button class="btn" type="button" data-g="plantilla">${window.ico('excel')}Descargar plantilla</button>
      <label class="btn primary foto-btn"><span data-ico="importar"></span>Subir Excel<input id="genteArchivo" class="archivo-oculto" type="file" accept=".xlsx,.xls,.csv"></label></div>
      <div class="err" id="genteErr" role="alert" hidden></div>`;
    if (previa) h += htmlPrevia();
    if (lista.length) {
      h += `<div class="section-label">Invitaciones esperando que la persona entre (${lista.length})</div><div class="list">${lista.map(i => {
        const r = D.rolDe(i.rol);
        return `<div class="card persona-reg"><span class="card-head"><span class="card-title">${esH(i.nombre)}</span>${A().pill(r ? r.rolTxt : esH(i.rol), 's-pend')}</span>
          <span class="meta">${esH(i.id)} · ${esH(resumenPermisos(i.permisos, i.rol))}</span>
          <div class="row"><button class="btn small ghost" type="button" data-g="borrarinv" data-id="${esH(i.id)}">Borrar invitación</button></div></div>`;
      }).join('')}</div>`;
    }
    return h;
  }
  // El nivel que la persona tiene en un módulo: lo que le puso la Jefe o, si no, el de su rol.
  function htmlPermisos(u, maneja) {
    const D = window.DEMO, r = D.rolDe(u.rol), ov = D.permisosValidos(u.permisos);
    if (!r) return '';
    if (!maneja) return `<span class="meta">${esH(resumenPermisos(ov, u.rol))}</span>`;
    const mods = [['equipos', 'Equipos'], ['inventario', 'Inventario'], ['vehiculos', 'Vehículos'], ['reuniones', 'Reuniones']];
    return `<fieldset class="extras"><legend class="meta">Qué puede hacer en cada módulo</legend><div class="perm-grid">${mods.map(([m, n]) => {
      const base = D.PERMISO_TXT[r.permisos[m]] || r.permisos[m];
      const ops = [['', `Como su rol (${base})`], ['no', 'Sin acceso']].concat(D.NIVELES[m]);
      return `<div class="field"><label for="pm-${esH(u.id)}-${m}">${n}</label><select id="pm-${esH(u.id)}-${m}" data-g="permiso" data-id="${esH(u.id)}" data-m="${m}">${ops.map(([v, t]) => `<option value="${esH(v)}"${(ov[m] || '') === v ? ' selected' : ''}>${esH(t)}</option>`).join('')}</select></div>`;
    }).join('')}</div></fieldset>`;
  }
  function htmlExtras(u, maneja) {
    const D = window.DEMO, del = D.EXTRAS.filter(e => e.roles.includes(u.rol)), tiene = D.extrasDe(u.rol, u.extras);
    if (!del.length) return '';
    if (!maneja) return tiene.length ? `<span class="meta">Permisos extra: ${esH(del.filter(e => tiene.includes(e.id)).map(e => e.txt).join(', '))}</span>` : '';
    return `<fieldset class="extras"><legend class="meta">Permisos extra</legend>${del.map(e => `<label class="marca-fila"><input type="checkbox" data-g="extra" data-id="${esH(u.id)}" data-x="${esH(e.id)}"${tiene.includes(e.id) ? ' checked' : ''}><span><b>${esH(e.txt)}</b><span class="meta">${esH(e.detalle)}</span></span></label>`).join('')}</fieldset>`;
  }
  function htmlGente() {
    const S = A().S, D = window.DEMO;
    const gente = S.datos.usuarios.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
    let h = `<div class="section-label">Personas registradas (${gente.length})</div>`;
    h += gente.length ? `<div class="list">${gente.map(u => {
      const r = D.rolDe(u.rol), maneja = !esDireccion(u.rol) && u.id !== window.nube.uid();
      const opciones = D.ROLES.filter(x => !esDireccion(x.rol)).map(x => `<option value="${esH(x.rol)}"${x.rol === u.rol ? ' selected' : ''}>${esH(x.rolTxt)}</option>`).join('');
      return `<div class="card persona-reg${u.activo === true ? '' : ' pausada'}">
        <span class="card-head"><span class="card-title">${esH(u.nombre)}</span>${A().pill(u.activo === true ? (r ? r.rolTxt : u.rol) : 'Acceso pausado', u.activo === true ? 's-disco' : 's-peligro')}</span>
        <span class="meta">${esH(u.correo)}${u.en ? ' · se registró ' + esH(A().hace(u.en)) : ''}</span>
        ${maneja ? `<div class="row"><label class="sr" for="gr-${esH(u.id)}">Rol de ${esH(u.nombre)}</label><select id="gr-${esH(u.id)}" data-g="rol" data-id="${esH(u.id)}">${opciones}</select>
          <button class="btn small ${u.activo === true ? 'ghost' : 'primary'}" type="button" data-g="${u.activo === true ? 'pausar' : 'devolver'}" data-id="${esH(u.id)}">${u.activo === true ? 'Pausar acceso' : 'Devolver acceso'}</button></div>`
          : `<span class="meta">${u.id === window.nube.uid() ? 'Eres tú.' : 'Gerente o Jefe: solo se cambia desde la consola de Firebase.'}</span>`}
        ${htmlPermisos(u, maneja)}${htmlExtras(u, maneja)}
      </div>`;
    }).join('')}</div>` : UI.vacio('persona', 'Todavía nadie se registró', 'Sube el Excel con las personas arriba. Cada una entra con su correo y queda con el rol que le diste.');
    return h;
  }
  function htmlCodigos() {
    const S = A().S, D = window.DEMO, codigos = S.datos.codigos.filter(c => c.activo === true);
    return `<details class="ct-codigo" id="genteCodigos"><summary>Códigos por rol (para quien no está en el Excel)</summary>${D.AREAS.map(area => {
      const roles = D.ROLES.filter(r => r.area === area && !esDireccion(r.rol));
      return `<div class="gente-area"><b class="meta">${esH(area)}</b>${roles.map(r => {
        const c = codigos.filter(x => x.rol === r.rol).sort((a, b) => String(b.en).localeCompare(String(a.en)))[0];
        const botones = c ? `<button class="btn small" type="button" data-g="copiar" data-id="${esH(c.id)}">Copiar</button><button class="btn small ghost" type="button" data-g="cambiar" data-rol="${esH(r.rol)}">Cambiar</button>`
          : `<button class="btn small primary" type="button" data-g="crear" data-rol="${esH(r.rol)}">${window.ico('mas')}Crear código</button>`;
        return `<div class="codigo-fila"><span class="cf-t"><b>${esH(r.rolTxt)}</b>${c ? `<code>${esH(c.id)}</code>` : '<span class="meta">Sin código</span>'}</span><span class="row">${botones}</span></div>`;
      }).join('')}</div>`;
    }).join('')}</details>`;
  }
  function htmlSeguridad() {
    const d = A().S.datos.ajustesApp.find(x => x.id === 'seguridad'), activas = !(d && d.personasPrueba === false);
    return `<div class="section-label">Seguridad</div><div class="card"><b>Personas de prueba: ${activas ? 'encendidas' : 'apagadas'}</b>
      <span class="meta">${activas ? 'Tienen una clave pública, así que cualquiera podría entrar con ellas. Apágalas cuando la app se use con datos de la empresa. Los datos de prueba dejan de cargarse solos.' : 'Nadie puede entrar ni leer datos con las cuentas de prueba. Además pon «window.PERSONAS_PRUEBA = false» en config.js para quitarlas de la pantalla de entrada.'}</span>
      <div class="row"><button class="btn small ${activas ? 'primary' : 'ghost'}" type="button" data-g="pruebas" data-on="${activas ? '0' : '1'}">${activas ? 'Apagar las personas de prueba' : 'Volver a encenderlas'}</button></div></div>`;
  }
  function pintar(forzar) {
    if (!forzar && $('shGente').hidden) return;
    if (!esJefeReal()) { $('shGente').hidden = true; return; }
    const A_ = A();
    if (['usuarios', 'codigos', 'invitaciones'].some(c => A_.cargando(c))) { $('genteCuerpo').innerHTML = UI.esqueleto(3); return; }
    // Si la Jefe está eligiendo un archivo, no se vuelve a dibujar todo (se perdería la selección).
    // Al redibujar se recuerda si la lista de códigos estaba abierta (si no, se cerraría al crear un código).
    const codigosAbiertos = !!document.querySelector('#genteCodigos[open]');
    $('genteCuerpo').innerHTML = htmlInvitaciones() + htmlGente() + htmlCodigos() + htmlSeguridad();
    if (codigosAbiertos && $('genteCodigos')) $('genteCodigos').open = true;
    window.llenarIconos($('genteCuerpo'));
  }

  /* ---------- acciones ---------- */
  async function hacer(fn, listo) {
    if (ocupado) return;
    ocupado = true;
    try { await fn(); if (listo) A().toast(listo); }
    catch (e) { A().toast(window.nube.explicar(e)); }
    finally { ocupado = false; pintar(); }
  }
  // Código nuevo para el rol; los viejos de ese rol se borran (dejan de servir para registrarse).
  function nuevo(rol) {
    const col = 'codigos', viejos = (A().S.datos[col] || []).filter(c => c.rol === rol);
    const c = window.nube.codigoNuevo(rol);
    return window.nube.lote(viejos.map(v => ['borrar', col, v.id]).concat([['set', col, c, { rol, activo: true, por: yo().nombre, en: new Date().toISOString() }]]));
  }
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); A().toast(`Copiado: ${texto}`); }
    catch (e) { A().toast(`Tu código es ${texto}. Cópialo a mano.`); }
  }
  const usuario = id => A().S.datos.usuarios.find(x => x.id === id);
  const manejable = u => !!u && !esDireccion(u.rol) && u.id !== window.nube.uid();

  $('genteCuerpo').addEventListener('click', async e => {
    if (!esJefeReal()) return;
    const b = e.target.closest('button[data-g]'); if (!b) return;
    const g = b.dataset.g, rol = b.dataset.rol, id = b.dataset.id, D = window.DEMO;
    if (g === 'copiar') return copiar(id);
    if (g === 'plantilla') return descargarPlantilla(b);
    if (g === 'descartar') { previa = null; return pintar(); }
    if (g === 'guardarinv') {
      const buenas = (previa || []).filter(x => !x.errores.length && !x.omitida); if (!buenas.length) return;
      return hacer(async () => { await window.nube.invitar(buenas.map(x => ({ nombre: x.nombre, correo: x.correo, rol: x.rol, permisos: x.permisos, extras: x.extras })), yo().nombre); previa = null; },
        `Listo: ${buenas.length} ${buenas.length === 1 ? 'invitación guardada' : 'invitaciones guardadas'}. Cada persona entra con su correo.`);
    }
    if (g === 'borrarinv') {
      const ok = await A().confirmar('¿Borrar esta invitación?', `${id} ya no va a poder crear su cuenta con esa invitación.`, 'Borrar invitación');
      if (ok) hacer(() => window.nube.borrar('invitaciones', id), 'Listo: invitación borrada.');
      return;
    }
    if (g === 'pruebas') {
      const apagar = b.dataset.on === '0';
      const ok = await A().confirmar(apagar ? '¿Apagar las personas de prueba?' : '¿Volver a encender las personas de prueba?',
        apagar ? 'Nadie podrá entrar con las cuentas de prueba (Carolina, Oscar y las demás) ni leer datos con ellas. Tú sigues entrando con tu cuenta.' : 'Cualquiera con la clave pública volverá a poder entrar y ver los datos. Hazlo solo para presentar la demo.',
        apagar ? 'Apagarlas' : 'Encenderlas');
      if (ok) hacer(() => window.nube.guardar('ajustesApp', 'seguridad', { personasPrueba: !apagar }), apagar ? 'Listo: personas de prueba apagadas.' : 'Listo: personas de prueba encendidas.');
      return;
    }
    if (g === 'crear') return hacer(() => nuevo(rol), `Listo: código de ${D.rolDe(rol).rolTxt} creado. Cópialo y mándaselo a quien corresponda.`);
    if (g === 'cambiar') {
      const ok = await A().confirmar(`¿Cambiar el código de ${D.rolDe(rol).rolTxt}?`, 'El código viejo deja de servir para registrarse. Las personas que ya entraron siguen igual.', 'Cambiar código');
      if (ok) hacer(() => nuevo(rol), 'Listo: código cambiado. El viejo ya no sirve.');
      return;
    }
    const u = usuario(id);
    if (!manejable(u)) return;
    if (g === 'pausar') {
      const ok = await A().confirmar(`¿Pausar el acceso de ${u.nombre}?`, 'No podrá ver ni hacer nada en la app hasta que le devuelvas el acceso.', 'Pausar acceso');
      if (ok) hacer(() => window.nube.mezclar('usuarios', u.id, { activo: false }), `Listo: acceso de ${u.nombre} pausado.`);
    }
    if (g === 'devolver') hacer(() => window.nube.mezclar('usuarios', u.id, { activo: true }), `Listo: ${u.nombre} ya puede entrar otra vez.`);
  });
  $('genteCuerpo').addEventListener('change', async e => {
    if (!esJefeReal()) return;
    const D = window.DEMO;
    const arch = e.target.closest('#genteArchivo');
    if (arch) {
      const err = $('genteErr'); err.hidden = true;
      try { previa = await leerArchivo(arch.files && arch.files[0]); pintar(); }
      catch (er) { previa = null; pintar(); const x = $('genteErr'); x.textContent = er && er.message === 'xlsx' ? 'No se pudo cargar el lector de Excel. Revisa la conexión y vuelve a intentar.' : (er && er.message) || 'No se pudo leer el archivo.'; x.hidden = false; }
      return;
    }
    const x = e.target.closest('input[data-g="extra"]');
    if (x) {
      const u = usuario(x.dataset.id); if (!manejable(u)) return;
      const antes = D.extrasDe(u.rol, u.extras), extras = x.checked ? antes.concat([x.dataset.x]) : antes.filter(v => v !== x.dataset.x);
      const ex = D.EXTRAS.find(v => v.id === x.dataset.x);
      return hacer(() => window.nube.mezclar('usuarios', u.id, { extras: D.extrasDe(u.rol, Array.from(new Set(extras))) }),
        `Listo: ${u.nombre} ${x.checked ? 'ya tiene' : 'ya no tiene'} el permiso «${ex ? ex.txt : 'extra'}».`);
    }
    const p = e.target.closest('select[data-g="permiso"]');
    if (p) {
      const u = usuario(p.dataset.id); if (!manejable(u)) return;
      // Se arma el mapa completo con lo que marcan los cuatro módulos de esa persona (vacío = como su rol).
      const permisos = {};
      ['equipos', 'inventario', 'vehiculos', 'reuniones'].forEach(m => { const s = $(`pm-${u.id}-${m}`); if (s && s.value) permisos[m] = s.value; });
      return hacer(() => window.nube.lote([['update', 'usuarios', u.id, { permisos: D.permisosValidos(permisos) }]]), `Listo: cambió lo que ${u.nombre} puede hacer.`);
    }
    const s = e.target.closest('select[data-g="rol"]'); if (!s) return;
    const u = usuario(s.dataset.id), rol = s.value;
    if (!manejable(u) || esDireccion(rol) || rol === u.rol) return;
    // Al cambiar de rol se quitan los permisos extra que no sirven para el rol nuevo.
    hacer(() => window.nube.mezclar('usuarios', u.id, { rol, extras: D.extrasDe(rol, u.extras) }), `Listo: ${u.nombre} ahora es ${D.rolDe(rol).rolTxt}.`);
  });

  window.Gente = Object.freeze({ abrir, pintar, entender });
})();
