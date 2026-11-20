/* equipos.js — Módulo Equipos de la demo: Equipos y Entregas juntas, con el acta VIRTUAL (sin papel).
   Encargado de equipos (Daniel): registra equipos; entrega y recibe llenando el acta en la app (datos de la persona,
     equipos con su estado y accesorios, compromiso) y las dos firmas en la pantalla; hace el mantenimiento y el backup
     de lo que llega a Recibidos y cumple la agenda.
   Soporte (Valentina): le llegan las actas; con el permiso extra «actas» las revisa (bien o con problema).
     También le programa mantenimientos y backups al Encargado.
   La Jefe puede hacer todo; el Gerente ve todo a detalle sin botones. El acta se puede imprimir o guardar en PDF. */
(function () {
  'use strict';
  const A = () => window.App;
  const $ = id => document.getElementById(id);
  const esH = v => A().esH(v);
  const D = () => A().S.datos;
  const persona = () => A().S.persona;
  const miRol = () => (persona() ? persona().rol : '');
  const perm = () => A().permiso('equipos');
  const esJefe = () => perm() === 'jefe';
  const esGerente = () => miRol() === 'gerente';
  const esEncargado = () => perm() === 'encargado' || esJefe();          // registra, entrega, recibe, mantenimiento
  const esSoporte = () => perm() === 'soporte';
  const revisaActas = () => esJefe() || (esSoporte() && A().tieneExtra('actas'));
  const programa = () => esJefe() || esSoporte();                          // programa tareas al Encargado
  const ahora = () => new Date().toISOString();
  const hoy = () => A().hoyISO();
  const EST = { asignado: ['Asignado', 's-disco', 'disco'], bodega: ['En bodega', 's-pend', 'pend'], recibido: ['En Recibidos', 's-org', 'org'] };
  const TIPO_HOJA = { entrega: 'Entrega', devolucion: 'Devolución' };
  const REV = { pendiente: ['Por revisar', 's-org', 'reloj'], ok: ['Revisada', 's-disco', 'check'], problema: ['Con problema', 's-peligro', 'aviso'] };
  const TIPO_TAREA = { mantenimiento: 'Mantenimiento', backup: 'Backup', revision: 'Revisión' };
  const TIPOS_EQ = ['Portátil', 'Computador de escritorio', 'Tableta', 'Celular', 'GPS', 'Impresora', 'Disco duro externo', 'Cámara', 'Otro'];
  const PROYECTOS = ['Proyecto Costa Norte', 'Proyecto Ruta Alta'];
  const ESTADOS_EQ = ['Bueno', 'Regular', 'Con daño'];
  const ACCESORIOS = ['Cargador', 'Mouse', 'Maletín', 'Teclado', 'Cable USB', 'Funda'];
  const COMPROMISO = { entrega: 'Recibo los equipos descritos en esta acta en el estado indicado. Me comprometo a cuidarlos, a usarlos solo para el trabajo y a devolverlos con sus accesorios al terminar el proyecto o cuando la empresa los pida. Si se dañan o se pierden, aviso de inmediato.',
    devolucion: 'Devuelvo los equipos descritos en esta acta en el estado indicado. Quien los recibe revisa su estado y sus accesorios en el momento.' };
  const MAX_FIRMA = 80000;
  let seccion = '', rolPintado = '', guardando = false, accion = null, pushPendientes = [], buscar = '';

  /* ---------- datos derivados ---------- */
  const equipos = () => D().equipos.slice().sort((a, b) => String(a.serial).localeCompare(String(b.serial)));
  const eqPorId = id => D().equipos.find(e => e.id === id) || null;
  const hojaPorId = id => D().hojas.find(h => h.id === id) || null;
  const hojasDe = id => D().hojas.filter(h => (h.equipos || []).some(x => x && x.id === id)).sort((a, b) => String(b.en).localeCompare(String(a.en)));
  const pend = e => (e && e.pendientes && typeof e.pendientes === 'object' ? e.pendientes : {});
  const historial = e => (Array.isArray(e.historial) ? e.historial : []).filter(x => x && typeof x === 'object');
  const conPaso = (e, paso) => historial(e).concat([Object.assign({ fecha: hoy(), por: persona().nombre }, paso)]);
  const porRevisar = () => D().hojas.filter(h => h.revision === 'pendiente').sort((a, b) => String(a.en).localeCompare(String(b.en)));
  const conProblema = () => D().hojas.filter(h => h.revision === 'problema');
  const tareasPend = () => D().tareasEq.filter(t => t.estado === 'pendiente').sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const recibidos = () => equipos().filter(e => e.estado === 'recibido');
  const dias = f => A().diasHasta(f);
  const viejoMtto = e => { const d = dias(e.ultimoMtto); return d == null || d < -180; };
  /** Personas con equipos o actas (para «Personas» y para escoger a quién se entrega). */
  function personas() {
    const m = new Map();
    const de = n => { const k = String(n || '').trim(); if (!k || /^bodega$/i.test(k)) return null; if (!m.has(k)) m.set(k, { nombre: k, cedula: '', equipos: [], hojas: [] }); return m.get(k); };
    D().equipos.forEach(e => { if (e.estado === 'asignado') { const p = de(e.asignadoA); if (p) p.equipos.push(e); } });
    D().hojas.forEach(h => { const p = de(h.persona); if (p) { p.hojas.push(h); if (h.cedula && !p.cedula) p.cedula = h.cedula; } });
    return Array.from(m.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }
  function resumen() {
    const es = D().equipos;
    const mias = esEncargado() ? recibidos().length + tareasPend().length + conProblema().length : revisaActas() ? porRevisar().length : 0;
    return {
      asignados: es.filter(e => e.estado === 'asignado').length, bodega: es.filter(e => e.estado === 'bodega').length,
      recibidos: es.filter(e => e.estado === 'recibido').length, actas: porRevisar().length,
      tareas: tareasPend().length, atrasadas: tareasPend().filter(t => String(t.fecha) < hoy()).length, mias
    };
  }

  /* ---------- pintar ---------- */
  function secciones() {
    if (esGerente()) return [['resumen', 'Resumen'], ['equipos', 'Equipos'], ['actas', 'Actas'], ['personas', 'Personas']];
    const s = [['hacer', 'Lo que me toca'], ['equipos', 'Equipos'], ['actas', 'Actas'], ['agenda', 'Agenda'], ['personas', 'Personas']];
    if (esJefe()) s.push(['resumen', 'Resumen']);
    return s;
  }
  function pintar() {
    const App = A(), S = App.S;
    if (!S.persona) return;
    if (rolPintado !== S.persona.rol) { rolPintado = S.persona.rol; seccion = secciones()[0][0]; }
    const f = S.filtro.equipos;
    if (['asignado', 'bodega', 'recibido'].includes(f)) seccion = 'equipos';
    if (f === 'actas') seccion = 'actas';
    if (!secciones().some(x => x[0] === seccion)) seccion = secciones()[0][0];
    const n = resumen();
    App.tablero('equipos', [
      { k: 'e-asig', n: n.asignados, lbl: 'Asignados', icono: 'persona', tono: 'disco', filtro: 'asignado' },
      { k: 'e-bod', n: n.bodega, lbl: 'En bodega', icono: 'bolsa', filtro: 'bodega' },
      { k: 'e-rec', n: n.recibidos, lbl: 'En Recibidos', icono: 'recibidos', tono: 'org', filtro: 'recibido' },
      { k: 'e-act', n: n.actas, lbl: 'Actas por revisar', icono: 'hojas', tono: 'peligro', filtro: 'actas' }
    ]);
    $('eqSecciones').innerHTML = secciones().map(([k, t]) => `<button type="button" class="chip" data-sec="${k}" aria-pressed="${seccion === k}">${esH(t)}${k === 'hacer' && n.mias ? ` <span class="n">${n.mias}</span>` : ''}</button>`).join('');
    $('eqBotones').hidden = !esEncargado();
    $('btnNuevoEq').hidden = !esEncargado();
    const c = $('eqContenido');
    if (['equipos', 'hojas', 'tareasEq'].some(App.cargando)) { c.innerHTML = UI.esqueleto(3); return; }
    c.innerHTML = ({ hacer: htmlHacer, equipos: () => htmlEquipos(f), actas: () => htmlActas(f), agenda: htmlAgenda, personas: htmlPersonas, resumen: htmlResumen })[seccion]();
    window.llenarIconos(c);
  }
  const boton = (acc, txt, icono, id, clase, extra) => `<button class="btn ${clase || 'small'}" type="button" data-accion="${acc}" data-id="${esH(id)}"${extra || ''}>${icono ? `<span data-ico="${icono}"></span>` : ''}${esH(txt)}</button>`;
  const firma = s => (typeof s === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(s) ? s : '');
  const numActa = h => 'AC-' + String(h.numero || 0).padStart(4, '0');
  const seriales = h => (h.equipos || []).filter(x => x && typeof x === 'object').map(x => x.serial).join(', ');

  /* --- Lo que me toca --- */
  function htmlHacer() {
    let h = '';
    if (esEncargado()) {
      const rs = recibidos(), ts = tareasPend(), ps = conProblema();
      h += `<div class="section-label">Recibidos: mantenimiento y backup (${rs.length})</div>`;
      h += rs.length ? `<div class="list">${rs.map(tarjetaRecibido).join('')}</div>` : '<p class="meta">No hay equipos en Recibidos.</p>';
      if (ps.length) h += `<div class="section-label">Actas con problema (${ps.length})</div><div class="list">${ps.map(tarjetaActa).join('')}</div>`;
      h += `<div class="section-label">Agenda (${ts.length})</div>`;
      h += ts.length ? `<div class="list">${ts.map(tarjetaTarea).join('')}</div>` : '<p class="meta">No hay tareas programadas.</p>';
    }
    if (revisaActas()) {
      const ps = porRevisar();
      h += `<div class="section-label">Actas por revisar (${ps.length})</div>`;
      h += ps.length ? `<div class="list">${ps.map(tarjetaActa).join('')}</div>` : '<p class="meta">Todas las actas están revisadas.</p>';
    }
    if (esSoporte()) {
      h += `<div class="barra-botones">${boton('programar', 'Programar mantenimiento o backup', 'programar', '', 'primary')}</div>`;
      const mias = tareasPend().filter(t => t.pidio === persona().nombre);
      h += `<div class="section-label">Lo que le programaste al Encargado (${mias.length})</div>`;
      h += mias.length ? `<div class="list">${mias.map(tarjetaTarea).join('')}</div>` : '<p class="meta">No tienes tareas programadas pendientes.</p>';
      if (!revisaActas()) h += '<p class="meta">Las actas de entrega las revisa el Soporte encargado de actas.</p>';
    }
    return h || UI.vacio('checkCirculo', 'Nada pendiente', '');
  }
  function tarjetaRecibido(e) {
    const p = pend(e), listo = !p.mtto && !p.backup;
    const bts = esEncargado() ? (p.mtto ? boton('mtto', 'Mantenimiento hecho', 'mantenimiento', e.id, 'primary small') : '') + (p.backup ? boton('backup', 'Backup hecho', 'backup', e.id, p.mtto ? 'small' : 'primary small') : '') +
      (listo ? boton('abodega', 'Pasar a bodega', 'bolsa', e.id, 'primary small') + boton('entregar', 'Entregar', 'entrega', e.id, 'small') : '') : '';
    return `<div class="card tarea st-org">
      <div class="tarea-t"><b><span class="serial-chip">${esH(e.serial)}</span> ${esH(e.tipo)} ${esH(e.marca)} ${esH(e.modelo)}</b>
        <span class="meta">Lo trajo ${esH(e.asignadoA || 'alguien')}${e.obs ? ' · ' + esH(e.obs) : ''}</span></div>
      <span class="docs">${A().pill(p.mtto ? 'Falta mantenimiento' : 'Mantenimiento listo', p.mtto ? 's-org' : 's-disco', p.mtto ? 'mantenimiento' : 'check')}${A().pill(p.backup ? 'Falta backup' : 'Backup listo', p.backup ? 's-org' : 's-disco', p.backup ? 'backup' : 'check')}</span>
      <div class="tarea-pie">${bts}${boton('ver', 'Hoja de vida', '', e.id, 'ghost small')}</div>
    </div>`;
  }
  function tarjetaActa(h) {
    const r = REV[h.revision] || REV.pendiente, f = firma(h.firmaPersona);
    let bts = '';
    if (h.revision === 'pendiente' && revisaActas()) bts += boton('revisar', 'Revisar el acta', 'check', h.id, 'primary small');
    if (h.revision === 'problema' && esEncargado()) bts += boton('corregir', 'Corregir', 'lapiz', h.id, 'primary small');
    return `<div class="card tarea st-${h.revision === 'problema' ? 'peligro' : h.revision === 'ok' ? 'disco' : 'org'}">
      <div class="nov-fila">${f ? `<img class="firma-mini" src="${esH(f)}" alt="Firma de ${esH(h.persona)}">` : ''}
        <div class="tarea-t"><b>${esH(TIPO_HOJA[h.tipo] || 'Acta')} ${esH(numActa(h))}: ${esH(h.persona)}</b><span class="meta">${esH(seriales(h))} · ${esH(A().fechaCorta(h.fecha))}${h.cedula ? ' · C.C. ' + esH(h.cedula) : ''}</span>
        ${h.notaRevision ? `<span class="meta">Problema: ${esH(h.notaRevision)}</span>` : ''}</div></div>
      <div class="tarea-pie">${bts || A().pill(r[0], r[1], r[2])}${boton('veracta', 'Ver acta', '', h.id, 'ghost small')}</div>
    </div>`;
  }
  function tarjetaTarea(t) {
    const e = eqPorId(t.equipoId), atrasada = t.estado === 'pendiente' && String(t.fecha) < hoy();
    return `<div class="card tarea st-${t.estado === 'hecha' ? 'disco' : atrasada ? 'peligro' : 'org'}">
      <div class="tarea-t"><b>${esH(TIPO_TAREA[t.tipo] || 'Tarea')}: <span class="serial-chip">${esH(t.serial)}</span>${e ? ' ' + esH(e.tipo) + ' ' + esH(e.marca) : ''}</b>
        <span class="meta">${atrasada ? 'Era para el ' : 'Para el '}${esH(A().fechaCorta(t.fecha))} · la pidió ${esH(t.pidio)}</span>${t.nota ? `<span class="meta">${esH(t.nota)}</span>` : ''}
        ${t.estado === 'hecha' ? `<span class="meta">Hecha por ${esH(t.hechaPor)}${t.resultado ? ': ' + esH(t.resultado) : ''}</span>` : ''}</div>
      <div class="tarea-pie">${t.estado === 'pendiente' && esEncargado() ? boton('hecha', 'Marcar hecha', 'check', t.id, 'primary small') : A().pill(t.estado === 'hecha' ? 'Hecha' : atrasada ? 'Atrasada' : 'Pendiente', t.estado === 'hecha' ? 's-disco' : atrasada ? 's-peligro' : 's-org')}${e ? boton('ver', 'Hoja de vida', '', e.id, 'ghost small') : ''}</div>
    </div>`;
  }

  /* --- Equipos --- */
  function htmlEquipos(f) {
    const App = A(), q = buscar.trim().toLowerCase();
    const vis = equipos().filter(e => (!['asignado', 'bodega', 'recibido'].includes(f) || e.estado === f) && (!q || [e.serial, e.asignadoA, e.marca, e.modelo, e.tipo, e.proyecto].join(' ').toLowerCase().includes(q)));
    let h = `<input class="search" id="qEq" type="search" placeholder="Buscar serial, persona o modelo" autocomplete="off" aria-label="Buscar equipo" value="${esH(buscar)}">`;
    h += `<div class="count" aria-live="polite">${vis.length} de ${D().equipos.length} equipos</div>`;
    if (!vis.length) return h + UI.vacio('equipos', 'No hay equipos con ese filtro', '');
    return h + `<div class="list">${vis.map(e => {
      const st = EST[e.estado] || ['Sin estado', 'none', 'pend'];
      return `<button type="button" class="card st-${st[2]}" data-accion="ver" data-id="${esH(e.id)}">
        <span class="card-head"><span class="card-title"><small>${esH(e.serial)}</small>${esH(e.tipo)} ${esH(e.marca)}</span>${App.pill(st[0], st[1])}</span>
        <span class="card-sub">${esH(e.modelo)}</span>
        <span class="facts"><span>${window.ico('persona')} <b>${esH(e.estado === 'bodega' ? 'En bodega' : e.asignadoA || 'Sin asignar')}</b></span>${e.proyecto ? `<span>${esH(e.proyecto)}</span>` : ''}</span>
        <span class="docs">${e.ultimoMtto ? App.pill('Mantenimiento ' + App.fechaCorta(e.ultimoMtto), viejoMtto(e) ? 's-warn' : 's-pend', 'mantenimiento') : App.pill('Sin mantenimiento', 's-warn', 'mantenimiento')}${e.ultimoBackup ? App.pill('Backup ' + App.fechaCorta(e.ultimoBackup), 's-pend', 'backup') : ''}</span>
        ${e.obs ? `<span class="meta">${esH(e.obs)}</span>` : ''}
      </button>`;
    }).join('')}</div>`;
  }
  /* --- Actas --- */
  function htmlActas(f) {
    const hs = D().hojas.slice().sort((a, b) => String(b.en).localeCompare(String(a.en)));
    const ps = hs.filter(h => h.revision !== 'ok'), ok = hs.filter(h => h.revision === 'ok');
    let h = f === 'actas' ? '<p class="meta">Mostrando primero las actas por revisar.</p>' : '';
    h += `<div class="section-label">Por revisar o con problema (${ps.length})</div>` + (ps.length ? `<div class="list">${ps.map(tarjetaActa).join('')}</div>` : '<p class="meta">Ninguna.</p>');
    h += `<div class="section-label">Revisadas (${ok.length})</div>` + (ok.length ? `<div class="list">${ok.map(tarjetaActa).join('')}</div>` : '<p class="meta">Todavía no hay actas revisadas.</p>');
    return h;
  }
  /* --- Agenda --- */
  function htmlAgenda() {
    const ts = D().tareasEq.slice().sort((a, b) => (a.estado === b.estado ? String(a.fecha).localeCompare(String(b.fecha)) : a.estado === 'pendiente' ? -1 : 1));
    let h = programa() ? `<div class="barra-botones">${boton('programar', 'Programar mantenimiento o backup', 'programar', '', 'primary')}</div>` : '';
    return h + (ts.length ? `<div class="list">${ts.map(tarjetaTarea).join('')}</div>` : UI.vacio('calendario', 'No hay tareas', 'Soporte o la Jefe le programan al Encargado los mantenimientos y backups.'));
  }
  /* --- Personas --- */
  function htmlPersonas() {
    const ps = personas();
    if (!ps.length) return UI.vacio('persona', 'Nadie tiene equipos todavía', '');
    return `<div class="list">${ps.map(p => `<button type="button" class="card" data-accion="persona" data-nombre="${esH(p.nombre)}">
      <span class="card-head"><span class="card-title">${esH(p.nombre)}</span>${A().pill(`${p.equipos.length} ${p.equipos.length === 1 ? 'equipo' : 'equipos'}`, p.equipos.length ? 's-disco' : 'none', 'equipos')}</span>
      <span class="meta">${p.cedula ? 'C.C. ' + esH(p.cedula) + ' · ' : ''}${p.hojas.length} ${p.hojas.length === 1 ? 'acta' : 'actas'}${p.equipos.length ? ' · ' + esH(p.equipos.map(e => e.serial).join(', ')) : ''}</span>
    </button>`).join('')}</div>`;
  }
  /* --- Resumen (Jefe y Gerente) --- */
  function htmlResumen() {
    const App = A(), n = resumen(), mes = hoy().slice(0, 7), hs = D().hojas.filter(h => String(h.fecha).slice(0, 7) === mes);
    const viejos = D().equipos.filter(viejoMtto);
    let h = `<div class="resumen-grid">
      <div class="card"><span class="meta">Equipos</span><span class="rm-n">${D().equipos.length}</span><span class="meta">${n.asignados} asignados · ${n.bodega} en bodega · ${n.recibidos} en Recibidos</span></div>
      <div class="card"><span class="meta">Actas este mes</span><span class="rm-n">${hs.length}</span><span class="meta">${hs.filter(x => x.tipo === 'entrega').length} entregas · ${hs.filter(x => x.tipo === 'devolucion').length} devoluciones</span></div>
      <div class="card"><span class="meta">Actas por revisar</span><span class="rm-n">${n.actas}</span>${conProblema().length ? App.pill(`${conProblema().length} con problema`, 's-peligro', 'aviso') : App.pill('Sin problemas', 's-disco', 'check')}</div>
      <div class="card"><span class="meta">Agenda</span><span class="rm-n">${n.tareas}</span>${n.atrasadas ? App.pill(`${n.atrasadas} atrasadas`, 's-peligro', 'aviso') : App.pill('Al día', 's-disco', 'check')}</div>
    </div>`;
    h += `<div class="section-label">Sin mantenimiento hace más de 6 meses (${viejos.length})</div>` + (viejos.length ? `<div class="list">${viejos.map(e => `<button type="button" class="card" data-accion="ver" data-id="${esH(e.id)}"><span class="card-head"><span class="card-title"><small>${esH(e.serial)}</small>${esH(e.tipo)} ${esH(e.marca)}</span>${App.pill(e.ultimoMtto ? 'Último: ' + App.fechaCorta(e.ultimoMtto) : 'Nunca', 's-warn', 'mantenimiento')}</span><span class="meta">${esH(e.estado === 'bodega' ? 'En bodega' : e.asignadoA || '')}</span></button>`).join('')}</div>` : '<p class="meta">Todos los equipos tienen mantenimiento reciente.</p>');
    return h;
  }

  /* ---------- hoja de acción ---------- */
  const campoTxt = (id, lbl, v, ph, max, tipo, lista) => `<div class="field"><label for="${id}">${lbl}</label><input id="${id}" type="${tipo || 'text'}" maxlength="${max || 120}" autocomplete="off" value="${esH(v == null ? '' : v)}" placeholder="${esH(ph || '')}"${lista ? ` list="${lista}"` : ''}></div>`;
  const campoSel = (id, lbl, ops, v) => `<div class="field"><label for="${id}">${lbl}</label><select id="${id}">${ops.map(([val, t]) => `<option value="${esH(val)}"${val === v ? ' selected' : ''}>${esH(t)}</option>`).join('')}</select></div>`;
  const marca = (id, lbl, ok, extra) => `<label class="marca-fila"><input type="checkbox" id="${id}"${ok ? ' checked' : ''}${extra || ''}><span>${lbl}</span></label>`;
  const valor = id => ($(id) ? $(id).value.trim() : '');
  function fallar(msg, id) { const e = $('eqErr'); e.textContent = msg; e.hidden = false; if (id && $(id)) $(id).focus(); return false; }
  function abrir(o) {
    accion = o;
    $('eqT').textContent = o.titulo; $('eqSub').textContent = o.sub || '';
    $('eqCampos').innerHTML = o.campos || '';
    window.llenarIconos($('eqCampos'));
    const pri = $('eqPrimario'); pri.hidden = !o.primario; pri.disabled = false;
    pri.innerHTML = o.primario ? (o.icono ? window.ico(o.icono) : '') + esH(o.primario) : '';
    $('eqCerrar').textContent = o.primario ? 'Cancelar' : 'Cerrar';
    $('eqErr').hidden = true;
    A().abrirHoja('shEq');
    const sh = $('shEq').querySelector('.sheet'); if (sh) sh.scrollTop = 0;
  }
  function aviso(para, titulo, txt) {
    if (!para || para === miRol()) return null;
    pushPendientes.push({ para, titulo, texto: txt });
    return ['set', 'avisos', window.nube.idNuevo('av'), { para, titulo, texto: txt, en: ahora(), modulo: 'equipos', leido: {} }];
  }
  async function guardar() {
    if (guardando || !accion || !accion.ops) return;
    $('eqErr').hidden = true;
    // Si un equipo cambió mientras la hoja estaba abierta (otra persona actuó), no se escribe encima.
    if (accion.base && accion.base.some(b => { const e = eqPorId(b.id); return !e || e.estado !== b.estado || historial(e).length !== historial(b).length; })) return fallar('Un equipo cambió mientras tenías esto abierto. Ciérralo y ábrelo otra vez.');
    if (accion.baseHoja) { const h = hojaPorId(accion.baseHoja.id); if (!h || h.revision !== accion.baseHoja.revision) return fallar('Esa acta cambió mientras la tenías abierta. Ciérrala y ábrela otra vez.'); }
    pushPendientes = [];
    const ops = accion.ops(); if (!ops) return;
    const lista = ops.filter(Boolean), envios = pushPendientes.slice();
    guardando = true; $('eqPrimario').disabled = true;
    try {
      if (lista.length) await window.nube.lote(lista);
      A().cerrarHoja('shEq');
      try { $('eqContenido').focus({ preventScroll: true }); } catch (e) {}
      A().toast(accion.listo);
      const volver = accion.volver;
      accion = null;
      notificar(envios);
      if (volver) setTimeout(() => { const e = eqPorId(volver); if (e && $('shEq').hidden) ver(e); }, 350);
    } catch (e) { fallar(window.nube.explicar(e)); }
    finally { guardando = false; $('eqPrimario').disabled = false; }
  }
  function notificar(envios) {
    if (!window.Push || !envios.length) return;
    const subs = A().S.datos.suscripciones || [];
    envios.forEach(e => {
      const destino = subs.filter(s => s.rol === e.para && (e.para !== 'soporte' || !e.soloActas || (Array.isArray(s.extras) && s.extras.includes('actas'))));
      if (destino.length) Promise.resolve(window.Push.enviar(destino, { titulo: e.titulo, texto: e.texto, url: './#equipos', etiqueta: 'equipos' })).catch(() => {});
    });
  }

  /* ---------- el acta virtual: datos y firmas en la pantalla ---------- */
  const campoFirma = (id, lbl) => `<div class="field firma-campo"><span class="lbl">${esH(lbl)}</span>
      <canvas id="${id}" class="firma-pad" width="600" height="200" aria-label="${esH(lbl)}: firma con el dedo"></canvas>
      <div class="row"><span class="meta" id="${id}Txt">Firma con el dedo dentro del cuadro.</span>${boton('borrarfirma', 'Borrar', 'borrar', id, 'ghost small')}</div></div>`;
  const pads = {};
  /** Prepara un cuadro de firma: se dibuja con el dedo o el mouse; guarda si ya tiene trazos. */
  function activarFirma(id) {
    const cv = $(id); if (!cv) return;
    const ctx = cv.getContext('2d'), pad = { trazos: 0, puntos: 0 };
    ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#13212b';
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    let antes = null;
    const punto = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
    cv.onpointerdown = e => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) {} antes = punto(e); pad.trazos++; ctx.beginPath(); ctx.arc(antes.x, antes.y, 1.4, 0, Math.PI * 2); ctx.fillStyle = '#13212b'; ctx.fill(); };
    cv.onpointermove = e => { if (!antes) return; e.preventDefault(); const p = punto(e); ctx.beginPath(); ctx.moveTo(antes.x, antes.y); ctx.lineTo(p.x, p.y); ctx.stroke(); pad.puntos++; antes = p; const t = $(id + 'Txt'); if (t) t.textContent = 'Firma lista.'; };
    cv.onpointerup = cv.onpointercancel = () => { antes = null; };
    pads[id] = pad;
  }
  function borrarFirma(id) { const cv = $(id); if (!cv) return; const ctx = cv.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height); pads[id] = { trazos: 0, puntos: 0 }; const t = $(id + 'Txt'); if (t) t.textContent = 'Firma con el dedo dentro del cuadro.'; }
  const firmada = id => !!(pads[id] && pads[id].puntos >= 8);
  /** La firma como imagen pequeña (PNG en blanco y negro). */
  function leerFirma(id) {
    const cv = $(id), c = document.createElement('canvas'); c.width = 360; c.height = 120;
    const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(cv, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }
  const campoTexto = (id, lbl, v, ph, max) => `<div class="field"><label for="${id}">${lbl}</label><textarea id="${id}" rows="2" maxlength="${max || 300}" placeholder="${esH(ph || '')}">${esH(v || '')}</textarea></div>`;
  /** Cada equipo del acta, con su estado, accesorios y observación. */
  const filaEq = (e, marcado, datos) => {
    const d = datos || {};
    return `<div class="eq-acta" data-fila="${esH(e.id)}">${marca('ehEq_' + e.id, `<b>${esH(e.serial)}</b> ${esH(e.tipo)} ${esH(e.marca)} ${esH(e.modelo)}`, marcado, ` data-eq="${esH(e.id)}"`)}
      <div class="eq-acta-det"${marcado ? '' : ' hidden'}>
        <div class="fields cols">${campoSel('ehEst_' + e.id, 'Estado', ESTADOS_EQ.map(x => [x, x]), d.estado || 'Bueno')}${campoTxt('ehObs_' + e.id, 'Observación', d.obs || '', 'Ej: pantalla con un rayón', 120)}</div>
        <div class="acc">${ACCESORIOS.map((a, k) => `<label class="chip-check"><input type="checkbox" data-acc="${esH(e.id)}" value="${esH(a)}"${(d.accesorios || (e.tipo === 'Portátil' && k === 0 ? ['Cargador'] : [])).includes(a) ? ' checked' : ''}><span>${esH(a)}</span></label>`).join('')}</div>
      </div></div>`;
  };
  function equiposDelActa() {
    return Array.from($('eqCampos').querySelectorAll('input[data-eq]:checked')).map(c => {
      const e = eqPorId(c.dataset.eq); if (!e) return null;
      return { id: e.id, serial: e.serial, tipo: e.tipo, marca: e.marca, modelo: e.modelo || '', estado: valor('ehEst_' + e.id) || 'Bueno', obs: valor('ehObs_' + e.id),
        accesorios: Array.from($('eqCampos').querySelectorAll(`input[data-acc="${CSS.escape(e.id)}"]:checked`)).map(x => x.value) };
    }).filter(Boolean);
  }
  const siguienteNumero = () => D().hojas.reduce((m, h) => Math.max(m, Number(h.numero) || 0), 0) + 1;
  /** Revisa lo común de un acta: datos, compromiso y las dos firmas. Devuelve el objeto o false. */
  function datosActa(tipo, persona, ced) {
    const cargo = valor('ehCargo'), fecha = valor('ehFecha'), nota = valor('ehNota'), eqs = equiposDelActa();
    if (persona.length < 5) return fallar('Escribe el nombre completo.', 'ehPersona');
    if (ced.length < 5) return fallar('Escribe la cédula.', 'ehCedula');
    if (cargo.length < 3) return fallar('Escribe el cargo.', 'ehCargo');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoy()) return fallar('Revisa la fecha.', 'ehFecha');
    if (!eqs.length) return fallar('Escoge al menos un equipo.');
    if (eqs.some(x => x.estado === 'Con daño' && x.obs.length < 4)) return fallar('Cuenta en la observación cuál es el daño.');
    if (!$('ehAcepto').checked) return fallar(tipo === 'entrega' ? 'Quien recibe tiene que aceptar el compromiso.' : 'Falta confirmar la devolución.', 'ehAcepto');
    if (!firmada('ehFirmaP')) return fallar(tipo === 'entrega' ? 'Falta la firma de quien recibe.' : 'Falta la firma de quien devuelve.');
    if (!firmada('ehFirmaE')) return fallar(tipo === 'entrega' ? 'Falta la firma de quien entrega.' : 'Falta la firma de quien recibe.');
    const fp = leerFirma('ehFirmaP'), fe = leerFirma('ehFirmaE');
    if (fp.length > MAX_FIRMA || fe.length > MAX_FIRMA) return fallar('Una firma quedó muy pesada. Bórrala y fírmala más sencilla.');
    return { tipo, persona, cedula: ced, cargo, fecha, nota, equipos: eqs, compromiso: COMPROMISO[tipo], firmaPersona: fp, firmaEncargado: fe };
  }
  const formActa = (tipo, cuerpoPersona) => cuerpoPersona +
    `<div class="fields cols">${campoTxt('ehCargo', 'Cargo', '', 'Ej: Profesional de campo', 60)}${campoTxt('ehFecha', 'Fecha', hoy(), '', 10, 'date')}</div>` +
    (tipo === 'entrega' ? campoSel('ehProy', 'Proyecto', PROYECTOS.map(p => [p, p]), PROYECTOS[0]) : '') +
    '<div class="field" id="ehLista"></div>' + campoTexto('ehNota', 'Nota del acta', '', tipo === 'entrega' ? 'Ej: se entrega con su maletín' : 'Ej: lo devuelve porque terminó el proyecto', 300) +
    `<div class="field compromiso"><span class="lbl">Compromiso</span><p>${esH(COMPROMISO[tipo])}</p>${marca('ehAcepto', tipo === 'entrega' ? 'Quien recibe leyó y acepta el compromiso' : 'Quien devuelve y quien recibe revisaron los equipos', false)}</div>` +
    campoFirma('ehFirmaP', tipo === 'entrega' ? 'Firma de quien recibe' : 'Firma de quien devuelve') +
    campoFirma('ehFirmaE', tipo === 'entrega' ? `Firma de quien entrega (${persona().nombre})` : `Firma de quien recibe (${persona().nombre})`);
  function prepararActa() { activarFirma('ehFirmaP'); activarFirma('ehFirmaE'); }

  /* ---------- acciones ---------- */
  function entrega(preId) {
    const libres = equipos().filter(e => e.estado === 'bodega' || (e.estado === 'recibido' && !pend(e).mtto && !pend(e).backup));
    const nombres = personas().map(p => p.nombre);
    abrir({ titulo: 'Acta de entrega de equipos', sub: 'Se llena y se firma aquí mismo, sin papel. Después Soporte la revisa.',
      campos: formActa('entrega', `<datalist id="ehNombres">${nombres.map(n => `<option value="${esH(n)}">`).join('')}</datalist>` +
        `<div class="fields cols">${campoTxt('ehPersona', 'Quién recibe', '', 'Nombre completo', 80, 'text', 'ehNombres')}${campoTxt('ehCedula', 'Cédula', '', 'Solo números', 12, 'text')}</div>`),
      primario: 'Guardar el acta', icono: 'entrega', listo: 'Listo: acta de entrega guardada. Soporte ya la tiene para revisarla.',
      base: libres.map(e => Object.assign({}, e)),
      ops: () => {
        const p = valor('ehPersona'), ced = valor('ehCedula').replace(/\D/g, ''), proy = valor('ehProy');
        const a = datosActa('entrega', p, ced); if (!a) return false;
        const hid = window.nube.idNuevo('ho'), es = a.equipos.map(x => eqPorId(x.id)).filter(Boolean);
        if (es.some(e => !libres.some(l => l.id === e.id))) return fallar('Un equipo ya cambió. Cierra y abre otra vez.');
        const ops = [['set', 'hojas', hid, Object.assign(a, { numero: siguienteNumero(), proyecto: proy, encargado: persona().nombre, por: persona().nombre, porRol: miRol(), en: ahora(), revision: 'pendiente', revisadaPor: '', revisadaEn: '', nota: a.nota, notaRevision: '' })]];
        es.forEach(e => ops.push(['mezclar', 'equipos', e.id, { estado: 'asignado', asignadoA: p, proyecto: proy, pendientes: { mtto: false, backup: false }, historial: conPaso(e, { fecha: a.fecha, tipo: 'entrega', persona: p, nota: `Entregado con acta (${proy})`, hojaId: hid }) }]));
        const av = aviso('soporte', 'Acta de entrega para revisar', `${persona().nombre} le entregó a ${p}: ${es.map(e => e.serial).join(', ')}.`);
        if (av) pushPendientes[pushPendientes.length - 1].soloActas = true;
        return ops.concat([av]);
      } });
    $('ehLista').innerHTML = `<span class="lbl">Equipos que se entregan</span>${libres.length ? libres.map(e => filaEq(e, e.id === preId)).join('') : '<p class="meta">No hay equipos en bodega para entregar.</p>'}`;
    prepararActa();
  }
  function devolucion(nombre) {
    const conEquipos = personas().filter(p => p.equipos.length);
    if (!conEquipos.length) { A().toast('Nadie tiene equipos asignados.'); return null; }
    const elegido = conEquipos.find(p => p.nombre === nombre) || conEquipos[0];
    abrir({ titulo: 'Acta de devolución de equipos', sub: 'Lo que llega queda en Recibidos para mantenimiento y backup.',
      campos: formActa('devolucion', `<div class="fields cols">${campoSel('ehQuien', 'Quién devuelve', conEquipos.map(p => [p.nombre, `${p.nombre} (${p.equipos.length})`]), elegido.nombre)}${campoTxt('ehCedula', 'Cédula', elegido.cedula, 'Solo números', 12, 'text')}</div>`),
      primario: 'Guardar el acta', icono: 'devolucion', listo: 'Listo: acta de devolución guardada. Los equipos quedaron en Recibidos.',
      base: D().equipos.filter(e => e.estado === 'asignado').map(e => Object.assign({}, e)),
      ops: () => {
        const quien = valor('ehQuien'), p = personas().find(x => x.nombre === quien), ced = valor('ehCedula').replace(/\D/g, '');
        if (!p) return fallar('Escoge quién devuelve.', 'ehQuien');
        const a = datosActa('devolucion', quien, ced); if (!a) return false;
        const hid = window.nube.idNuevo('ho'), es = a.equipos.map(x => eqPorId(x.id)).filter(e => e && e.estado === 'asignado' && e.asignadoA === quien);
        if (es.length !== a.equipos.length) return fallar('Un equipo ya cambió. Cierra y abre otra vez.');
        const ops = [['set', 'hojas', hid, Object.assign(a, { numero: siguienteNumero(), proyecto: es[0].proyecto || '', encargado: persona().nombre, por: persona().nombre, porRol: miRol(), en: ahora(), revision: 'pendiente', revisadaPor: '', revisadaEn: '', notaRevision: '' })]];
        es.forEach(e => { const x = a.equipos.find(q => q.id === e.id) || {}; ops.push(['mezclar', 'equipos', e.id, { estado: 'recibido', obs: x.obs || a.nota || e.obs || '', pendientes: { mtto: true, backup: true }, historial: conPaso(e, { fecha: a.fecha, tipo: 'devolucion', persona: quien, nota: [x.estado && x.estado !== 'Bueno' ? x.estado : '', x.obs, a.nota].filter(Boolean).join(' · ') || 'Devuelto con acta', hojaId: hid }) }]); });
        const av = aviso('soporte', 'Acta de devolución para revisar', `${quien} devolvió ${es.map(e => e.serial).join(', ')}. Quedaron en Recibidos.`);
        if (av) pushPendientes[pushPendientes.length - 1].soloActas = true;
        return ops.concat([av]);
      } });
    pintarListaDevolucion();
    prepararActa();
    return true;
  }
  function pintarListaDevolucion() {
    const p = personas().find(x => x.nombre === valor('ehQuien'));
    $('ehLista').innerHTML = `<span class="lbl">Equipos que devuelve</span>${p ? p.equipos.map(e => filaEq(e, true)).join('') : ''}`;
    if (p && p.cedula && $('ehCedula')) $('ehCedula').value = p.cedula;
  }
  function trabajo(e, tipo) {
    const mtto = tipo === 'mtto';
    abrir({ titulo: `${mtto ? 'Mantenimiento' : 'Backup'} del ${e.serial}`, sub: `${e.tipo} ${e.marca} ${e.modelo}`,
      campos: campoTxt('ehNota', mtto ? 'Qué se le hizo' : 'Qué se copió y dónde', '', mtto ? 'Ej: limpieza, cambio de pasta térmica, tecla arreglada' : 'Ej: carpetas de reuniones al disco de backup', 160),
      primario: 'Guardar', icono: 'check', listo: mtto ? 'Listo: mantenimiento guardado.' : 'Listo: backup guardado.', base: [Object.assign({}, e)],
      ops: () => {
        const nota = valor('ehNota'); if (nota.length < 4) return fallar('Cuenta en pocas palabras qué se hizo.', 'ehNota');
        const p = Object.assign({ mtto: false, backup: false }, pend(e)); p[mtto ? 'mtto' : 'backup'] = false;
        return [['mezclar', 'equipos', e.id, Object.assign({ pendientes: p, historial: conPaso(e, { tipo: mtto ? 'mantenimiento' : 'backup', persona: persona().nombre, nota }) }, mtto ? { ultimoMtto: hoy() } : { ultimoBackup: hoy() })]];
      } });
  }
  function aBodega(e) {
    abrir({ titulo: `Pasar el ${e.serial} a bodega`, sub: 'Ya tiene mantenimiento y backup. Queda listo para entregar.', primario: 'Pasar a bodega', icono: 'bolsa', listo: 'Listo: el equipo está en bodega.', base: [Object.assign({}, e)],
      ops: () => [['mezclar', 'equipos', e.id, { estado: 'bodega', asignadoA: '', proyecto: '', pendientes: { mtto: false, backup: false }, historial: conPaso(e, { tipo: 'bodega', persona: persona().nombre, nota: 'Listo y guardado en bodega' }) }]] });
  }
  function revisar(h) {
    abrir({ titulo: `Revisar acta ${numActa(h)}`, sub: `${TIPO_HOJA[h.tipo] || 'Acta'} de ${h.persona}`,
      campos: htmlActa(h) + '<p class="meta">Revisa que estén los datos de la persona, los equipos con su estado y las dos firmas.</p>' +
        `<div class="field"><span class="lbl">¿Cómo está el acta?</span><label class="marca-fila"><input type="radio" name="ehRev" value="ok" checked><span>Está bien</span></label><label class="marca-fila"><input type="radio" name="ehRev" value="problema"><span>Tiene un problema</span></label></div>` +
        campoTxt('ehNotaRev', 'Qué está mal (si tiene un problema)', '', 'Ej: la cédula no coincide', 160),
      primario: 'Guardar la revisión', icono: 'check', listo: 'Listo: acta revisada.', baseHoja: Object.assign({}, h),
      ops: () => {
        const r = ($('eqCampos').querySelector('input[name="ehRev"]:checked') || {}).value, nota = valor('ehNotaRev');
        if (r === 'problema' && nota.length < 5) return fallar('Cuenta qué está mal para que el Encargado lo corrija.', 'ehNotaRev');
        return [['mezclar', 'hojas', h.id, { revision: r === 'problema' ? 'problema' : 'ok', revisadaPor: persona().nombre, revisadaEn: ahora(), notaRevision: r === 'problema' ? nota : '' }],
          r === 'problema' ? aviso('equipos', 'Un acta tiene un problema', `${persona().nombre}: acta ${numActa(h)} de ${h.persona} (${seriales(h)}). ${nota}`) : null];
      } });
  }
  function corregir(h) {
    abrir({ titulo: `Corregir acta ${numActa(h)}`, sub: `Problema: ${h.notaRevision || 'sin nota'}`,
      campos: `<div class="fields cols">${campoTxt('ehPersona', 'Nombre', h.persona, '', 80)}${campoTxt('ehCedula', 'Cédula', h.cedula, '', 12)}</div>` + campoTxt('ehCargo', 'Cargo', h.cargo, '', 60) +
        campoTexto('ehNota', 'Nota del acta', h.nota, '', 300) + '<p class="meta">Si el problema es una firma, que la persona firme otra vez:</p>' +
        campoFirma('ehFirmaP', h.tipo === 'entrega' ? 'Firma de quien recibe (otra vez)' : 'Firma de quien devuelve (otra vez)'),
      primario: 'Mandar otra vez a Soporte', icono: 'enviar', listo: 'Listo: el acta volvió a Soporte para revisarla.', baseHoja: Object.assign({}, h),
      ops: () => {
        const ced = valor('ehCedula').replace(/\D/g, ''), p = valor('ehPersona'), cargo = valor('ehCargo');
        if (ced.length < 5 || p.length < 5 || cargo.length < 3) return fallar('Revisa el nombre, la cédula y el cargo.');
        const cambio = { persona: p, cedula: ced, cargo, nota: valor('ehNota'), revision: 'pendiente', revisadaPor: '', revisadaEn: '' };
        if (firmada('ehFirmaP')) cambio.firmaPersona = leerFirma('ehFirmaP');
        const av = aviso('soporte', 'Acta corregida para revisar', `${persona().nombre} corrigió el acta ${numActa(h)} de ${p}.`);
        if (av) pushPendientes[pushPendientes.length - 1].soloActas = true;
        return [['mezclar', 'hojas', h.id, cambio], av];
      } });
    activarFirma('ehFirmaP');
  }
  function programar(e) {
    const ops = equipos().map(x => [x.id, `${x.serial} · ${x.tipo} ${x.marca} (${x.estado === 'bodega' ? 'bodega' : x.asignadoA || x.estado})`]);
    const manana = (() => { const d = new Date(hoy() + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
    abrir({ titulo: 'Programar mantenimiento o backup', sub: 'Le llega al Encargado de equipos con aviso.',
      campos: campoSel('ehEq', 'Equipo', ops, e ? e.id : ops[0][0]) + `<div class="fields cols">${campoSel('ehTipo', 'Qué hay que hacer', Object.keys(TIPO_TAREA).map(k => [k, TIPO_TAREA[k]]), 'mantenimiento')}${campoTxt('ehFecha', 'Para cuándo', manana, '', 10, 'date')}</div>` +
        campoTxt('ehNota', 'Detalle', '', 'Ej: la batería dura poco', 160),
      primario: 'Programar', icono: 'programar', listo: 'Listo: tarea programada. El Encargado ya tiene el aviso.',
      ops: () => {
        const eq = eqPorId(valor('ehEq')), tipo = valor('ehTipo'), fecha = valor('ehFecha'), nota = valor('ehNota');
        if (!eq) return fallar('Escoge el equipo.', 'ehEq');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < hoy()) return fallar('Escoge una fecha de hoy en adelante.', 'ehFecha');
        if (D().tareasEq.some(t => t.estado === 'pendiente' && t.equipoId === eq.id && t.tipo === tipo)) return fallar('Ese equipo ya tiene esa tarea pendiente.');
        return [['set', 'tareasEq', window.nube.idNuevo('ta'), { equipoId: eq.id, serial: eq.serial, tipo, fecha, nota, pidio: persona().nombre, pidioRol: miRol(), estado: 'pendiente', hechaPor: '', hechaEn: '', resultado: '', en: ahora() }],
          aviso('equipos', `${TIPO_TAREA[tipo]} programado`, `${persona().nombre}: ${TIPO_TAREA[tipo].toLowerCase()} del ${eq.serial} para el ${A().fechaCorta(fecha)}.${nota ? ' ' + nota : ''}`)];
      } });
  }
  function hecha(t) {
    const e = eqPorId(t.equipoId);
    abrir({ titulo: `${TIPO_TAREA[t.tipo] || 'Tarea'} del ${t.serial}`, sub: t.nota || '',
      campos: campoTxt('ehNota', 'Qué se hizo', '', 'Ej: batería revisada, se limpió el equipo', 160),
      primario: 'Marcar hecha', icono: 'check', listo: 'Listo: tarea hecha. Ya le avisamos a quien la pidió.', base: e ? [Object.assign({}, e)] : null,
      ops: () => {
        const nota = valor('ehNota'); if (nota.length < 4) return fallar('Cuenta en pocas palabras qué se hizo.', 'ehNota');
        const ops = [['mezclar', 'tareasEq', t.id, { estado: 'hecha', hechaPor: persona().nombre, hechaEn: ahora(), resultado: nota }]];
        if (e && t.tipo !== 'revision') ops.push(['mezclar', 'equipos', e.id, Object.assign({ historial: conPaso(e, { tipo: t.tipo === 'backup' ? 'backup' : 'mantenimiento', persona: persona().nombre, nota }) }, t.tipo === 'backup' ? { ultimoBackup: hoy() } : { ultimoMtto: hoy() })]);
        else if (e) ops.push(['mezclar', 'equipos', e.id, { historial: conPaso(e, { tipo: 'revision', persona: persona().nombre, nota }) }]);
        ops.push(aviso(t.pidioRol, `${TIPO_TAREA[t.tipo] || 'Tarea'} hecho`, `${persona().nombre} hizo ${(TIPO_TAREA[t.tipo] || 'la tarea').toLowerCase()} del ${t.serial}: ${nota}`));
        return ops;
      } });
  }
  function nuevo() {
    abrir({ titulo: 'Registrar equipo nuevo', sub: 'Queda en bodega, listo para entregar.',
      campos: `<div class="fields cols">${campoTxt('ehSerial', 'Serial', '', 'Ej: DEMO-0013', 30)}${campoSel('ehTipo', 'Tipo', TIPOS_EQ.map(t => [t, t]), 'Portátil')}</div>` +
        `<div class="fields cols">${campoTxt('ehMarca', 'Marca', '', 'Ej: Lenovo', 40)}${campoTxt('ehModelo', 'Modelo', '', 'Ej: ThinkPad E14', 60)}</div>` + campoTxt('ehObs', 'Observaciones', '', '', 160),
      primario: 'Registrar', icono: 'mas', listo: 'Listo: equipo registrado en bodega.',
      ops: () => {
        const serial = valor('ehSerial').toUpperCase(), marcaV = valor('ehMarca'), modelo = valor('ehModelo');
        if (!/^[A-Z0-9-]{4,30}$/.test(serial)) return fallar('Escribe el serial (letras, números y guiones).', 'ehSerial');
        if (D().equipos.some(e => String(e.serial).toUpperCase() === serial)) return fallar('Ya hay un equipo con ese serial.', 'ehSerial');
        if (!marcaV) return fallar('Escribe la marca.', 'ehMarca');
        return [['set', 'equipos', window.nube.idNuevo('eq'), { serial, tipo: valor('ehTipo'), marca: marcaV, modelo, estado: 'bodega', asignadoA: '', proyecto: '', ultimoMtto: '', ultimoBackup: '', obs: valor('ehObs'),
          pendientes: { mtto: false, backup: false }, historial: [{ fecha: hoy(), tipo: 'registro', persona: persona().nombre, nota: 'Equipo registrado en bodega', por: persona().nombre }] }]];
      } });
  }

  /* ---------- hoja de vida, acta y persona ---------- */
  const TIPO_PASO = { entrega: 'Entrega', devolucion: 'Devolución', mantenimiento: 'Mantenimiento', backup: 'Backup', bodega: 'A bodega', registro: 'Registro', revision: 'Revisión' };
  function ver(e) {
    const App = A(), st = EST[e.estado] || ['Sin estado', 'none'], hs = hojasDe(e.id), ts = D().tareasEq.filter(t => t.equipoId === e.id && t.estado === 'pendiente');
    const pasos = historial(e).slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const bts = [];
    if (esEncargado()) {
      if (e.estado === 'bodega') bts.push(boton('entregar', 'Entregar', 'entrega', e.id, 'primary small'));
      if (e.estado === 'asignado') bts.push(boton('devolver', 'Recibir (devolución)', 'devolucion', e.id, 'small', ` data-nombre="${esH(e.asignadoA)}"`));
      if (e.estado === 'recibido' && pend(e).mtto) bts.push(boton('mtto', 'Mantenimiento hecho', 'mantenimiento', e.id, 'primary small'));
      if (e.estado === 'recibido' && pend(e).backup) bts.push(boton('backup', 'Backup hecho', 'backup', e.id, 'small'));
    }
    if (programa()) bts.push(boton('programar', 'Programar tarea', 'programar', e.id, 'ghost small'));
    abrir({ titulo: `${e.serial} · ${e.tipo} ${e.marca}`, sub: e.modelo,
      campos: `<div class="row">${App.pill(st[0], st[1])}</div>
        <dl class="datos"><dt>Tiene el equipo</dt><dd>${esH(e.estado === 'bodega' ? 'Bodega' : e.asignadoA || 'Nadie')}</dd>${e.proyecto ? `<dt>Proyecto</dt><dd>${esH(e.proyecto)}</dd>` : ''}
        <dt>Último mantenimiento</dt><dd>${esH(e.ultimoMtto ? App.fechaCorta(e.ultimoMtto) : 'Nunca')}</dd><dt>Último backup</dt><dd>${esH(e.ultimoBackup ? App.fechaCorta(e.ultimoBackup) : 'Nunca')}</dd></dl>
        ${e.obs ? `<p class="meta">${esH(e.obs)}</p>` : ''}${bts.length ? `<div class="tarea-pie">${bts.join('')}</div>` : ''}
        ${ts.length ? `<div class="section-label">Agenda (${ts.length})</div><div class="list">${ts.map(tarjetaTarea).join('')}</div>` : ''}
        <div class="section-label">Actas (${hs.length})</div>${hs.length ? `<div class="list">${hs.map(tarjetaActa).join('')}</div>` : '<p class="meta">Sin actas.</p>'}
        <div class="section-label">Historial</div><ol class="linea">${pasos.map(x => `<li><b>${esH(TIPO_PASO[x.tipo] || x.tipo)}${x.persona ? ': ' + esH(x.persona) : ''}</b><span class="meta">${esH(App.fechaCorta(x.fecha))}${x.nota ? ' · ' + esH(x.nota) : ''}</span></li>`).join('') || '<li><span class="meta">Sin historial.</span></li>'}</ol>` });
    accion.volverA = e.id;
  }
  /** El acta como documento (igual que la hoja de papel): datos, equipos, compromiso y firmas. */
  function htmlActa(h) {
    const App = A(), fp = firma(h.firmaPersona), fe = firma(h.firmaEncargado), entregaT = h.tipo === 'entrega';
    const eqs = (h.equipos || []).filter(x => x && typeof x === 'object');
    return `<article class="acta-doc" id="actaDoc">
      <header><b>ACTA DE ${entregaT ? 'ENTREGA' : 'DEVOLUCIÓN'} DE EQUIPOS</b><span>${esH(numActa(h))} · Documento de prueba</span></header>
      <dl class="acta-datos"><dt>Fecha</dt><dd>${esH(App.fechaCorta(h.fecha))}</dd><dt>${entregaT ? 'Recibe' : 'Devuelve'}</dt><dd>${esH(h.persona)}</dd>
        <dt>Cédula</dt><dd>${esH(h.cedula || '')}</dd><dt>Cargo</dt><dd>${esH(h.cargo || '')}</dd><dt>Proyecto</dt><dd>${esH(h.proyecto || '')}</dd></dl>
      <table class="acta-tabla"><thead><tr><th>Serial</th><th>Equipo</th><th>Estado</th><th>Accesorios</th></tr></thead><tbody>${eqs.map(x => `<tr><td>${esH(x.serial)}</td><td>${esH([x.tipo, x.marca, x.modelo].filter(Boolean).join(' '))}${x.obs ? `<br><small>${esH(x.obs)}</small>` : ''}</td><td>${esH(x.estado || '')}</td><td>${esH((Array.isArray(x.accesorios) ? x.accesorios : []).join(', ') || 'Ninguno')}</td></tr>`).join('')}</tbody></table>
      ${h.nota ? `<p><b>Nota:</b> ${esH(h.nota)}</p>` : ''}
      <p class="acta-compromiso">${esH(h.compromiso || COMPROMISO[h.tipo] || '')}</p>
      <div class="acta-firmas"><figure>${fp ? `<img src="${esH(fp)}" alt="Firma de ${esH(h.persona)}">` : '<span class="meta">Sin firma</span>'}<figcaption>${esH(h.persona)}<br>C.C. ${esH(h.cedula || '')}<br>${entregaT ? 'Recibe' : 'Devuelve'}</figcaption></figure>
        <figure>${fe ? `<img src="${esH(fe)}" alt="Firma de ${esH(h.encargado || h.por)}">` : '<span class="meta">Sin firma</span>'}<figcaption>${esH(h.encargado || h.por)}<br>Encargado de equipos<br>${entregaT ? 'Entrega' : 'Recibe'}</figcaption></figure></div>
    </article>`;
  }
  function verActa(h) {
    const r = REV[h.revision] || REV.pendiente;
    const bts = (h.revision === 'pendiente' && revisaActas() ? boton('revisar', 'Revisar el acta', 'check', h.id, 'primary small') : '') + (h.revision === 'problema' && esEncargado() ? boton('corregir', 'Corregir', 'lapiz', h.id, 'primary small') : '') + boton('imprimir', 'Imprimir o guardar PDF', 'pdf', h.id, 'small');
    abrir({ titulo: `Acta ${numActa(h)}`, sub: `${TIPO_HOJA[h.tipo] || 'Acta'} de ${h.persona}`,
      campos: `<div class="row">${A().pill(r[0], r[1], r[2])}${h.revisadaPor ? `<span class="meta">Revisó ${esH(h.revisadaPor)}</span>` : ''}</div>${h.notaRevision ? `<p class="meta">Problema: ${esH(h.notaRevision)}</p>` : ''}
        ${htmlActa(h)}<div class="tarea-pie">${bts}</div>` });
  }
  /** Imprime solo el acta (en el teléfono sale «Guardar como PDF»). */
  function imprimir() {
    const doc = $('actaDoc'); if (!doc) return;
    const cont = document.createElement('div'); cont.id = 'impresion'; cont.innerHTML = doc.outerHTML;
    document.body.appendChild(cont); document.body.classList.add('imprimiendo');
    const fin = () => { document.body.classList.remove('imprimiendo'); cont.remove(); window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin);
    try { window.print(); } catch (e) {}
    setTimeout(fin, 60000);
  }
  function verPersona(nombre) {
    const p = personas().find(x => x.nombre === nombre); if (!p) return null;
    abrir({ titulo: p.nombre, sub: p.cedula ? 'C.C. ' + p.cedula : '',
      campos: `${esEncargado() && p.equipos.length ? `<div class="tarea-pie">${boton('devolver', 'Recibir sus equipos', 'devolucion', '', 'primary small', ` data-nombre="${esH(p.nombre)}"`)}</div>` : ''}
        <div class="section-label">Equipos que tiene (${p.equipos.length})</div>${p.equipos.length ? `<div class="list">${p.equipos.map(e => `<button type="button" class="card" data-accion="ver" data-id="${esH(e.id)}"><span class="card-title"><small>${esH(e.serial)}</small>${esH(e.tipo)} ${esH(e.marca)} ${esH(e.modelo)}</span></button>`).join('')}</div>` : '<p class="meta">No tiene equipos.</p>'}
        <div class="section-label">Actas (${p.hojas.length})</div>${p.hojas.length ? `<div class="list">${p.hojas.slice().sort((a, b) => String(b.en).localeCompare(String(a.en))).map(tarjetaActa).join('')}</div>` : '<p class="meta">Sin actas.</p>'}` });
    return true;
  }

  /* ---------- eventos ---------- */
  $('eqSecciones').addEventListener('click', e => {
    const b = e.target.closest('[data-sec]'); if (!b) return;
    seccion = b.dataset.sec; A().S.filtro.equipos = '';
    A().pintarTodo();
  });
  function alTocar(e) {
    const b = e.target.closest('[data-accion]'); if (!b || b.disabled) return;
    const id = b.dataset.id, eq = eqPorId(id), h = hojaPorId(id), t = D().tareasEq.find(x => x.id === id);
    const desde = $('eqCampos').contains(b) && accion ? accion.volverA : '';
    const mapa = {
      ver: () => eq && ver(eq), veracta: () => h && verActa(h), persona: () => verPersona(b.dataset.nombre),
      borrarfirma: () => (accion ? borrarFirma(id) : null), imprimir: () => imprimir(),
      entregar: () => (esEncargado() ? entrega(eq ? eq.id : '') : null), devolver: () => (esEncargado() ? devolucion(b.dataset.nombre) : null),
      mtto: () => (eq && esEncargado() && pend(eq).mtto ? trabajo(eq, 'mtto') : null), backup: () => (eq && esEncargado() && pend(eq).backup ? trabajo(eq, 'backup') : null),
      abodega: () => (eq && esEncargado() && eq.estado === 'recibido' && !pend(eq).mtto && !pend(eq).backup ? aBodega(eq) : null),
      revisar: () => (h && h.revision === 'pendiente' && revisaActas() ? revisar(h) : null), corregir: () => (h && h.revision === 'problema' && esEncargado() ? corregir(h) : null),
      programar: () => (programa() ? programar(eq) : null), hecha: () => (t && t.estado === 'pendiente' && esEncargado() ? hecha(t) : null)
    };
    const fn = mapa[b.dataset.accion]; if (!fn) return;
    const r = fn();
    if (r === null) { A().toast('Eso ya cambió o no te toca. Revisa otra vez.'); return; }
    if (desde && accion && !['borrarfirma', 'imprimir'].includes(b.dataset.accion)) accion.volver = desde;
  }
  $('eqContenido').addEventListener('click', alTocar);
  $('eqContenido').addEventListener('input', e => { if (e.target.id === 'qEq') { buscar = e.target.value; const pos = e.target.selectionStart; pintar(); const q = $('qEq'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (x) {} } } });
  $('eqCampos').addEventListener('click', e => { if (e.target.closest('[data-accion]')) alTocar(e); });
  $('eqCampos').addEventListener('change', e => {
    if (e.target.id === 'ehQuien') pintarListaDevolucion();
    // Al marcar un equipo se abren su estado, accesorios y observación.
    const c = e.target.closest('input[data-eq]');
    if (c) { const det = c.closest('.eq-acta').querySelector('.eq-acta-det'); if (det) det.hidden = !c.checked; }
  });
  $('eqForm').addEventListener('submit', e => { e.preventDefault(); guardar(); });
  $('btnEntregar').addEventListener('click', () => { if (esEncargado()) entrega(''); });
  $('btnDevolver').addEventListener('click', () => { if (esEncargado()) devolucion(''); });
  $('btnNuevoEq').addEventListener('click', () => { if (esEncargado()) nuevo(); });

  window.Equipos = Object.freeze({ pintar, resumen });
})();
