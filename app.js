/* app.js — Demo de la app de control (fases 1 y 2): entrada con cuentas de prueba, cambio de persona en vivo,
   menú de los cuatro módulos con datos inventados, campana de avisos y etiquetas "Versión pagada".
   Los módulos de Equipos, Compras, Vehículos y Reuniones solo muestran datos en esta fase; las acciones llegan en las fases 3 a 6. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esH = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const MODULOS = [
    { k: 'equipos', n: 'Equipos', ico: 'equipos', txt: 'Inventario, Recibidos, entregas y devoluciones' },
    { k: 'compras', n: 'Compras', ico: 'carrito', txt: 'Pedir, autorizar, comprar y resumen del mes' },
    { k: 'vehiculos', n: 'Vehículos', ico: 'carro', txt: 'Estado de cada carro, novedades, entrega y recibo' },
    { k: 'reuniones', n: 'Reuniones', ico: 'reunion', txt: 'Reuniones que llegan por correo y lo que cada una necesita' }
  ];
  const VISTAS = { inicio: 'vInicio', equipos: 'vEquipos', compras: 'vCompras', vehiculos: 'vVehiculos', reuniones: 'vReuniones' };
  const S = {
    persona: null,
    vista: 'inicio',
    datos: { equipos: [], compras: [], vehiculos: [], reuniones: [], avisos: [] },
    llegaron: new Set(),   // colecciones que ya respondieron al menos una vez
    oyentes: [],
    filtro: { equipos: '', compras: '', vehiculos: '', reuniones: '' },
    entrando: false
  };

  /* ---------- utilidades ---------- */
  const toast = window.toast = msg => { const t = $('toast'); UI.tostada(t, msg); clearTimeout(t._t); t._t = setTimeout(() => { t.hidden = true; }, 3200); };
  const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const aFecha = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  /** Días desde hoy hasta la fecha (negativo si ya pasó). */
  const diasHasta = s => { const f = aFecha(s); if (!f) return null; const h = aFecha(hoyISO()); return Math.round((f - h) / 86400000); };
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
  const fechaCorta = s => { const f = aFecha(s); if (!f) return ''; const y = f.getFullYear() !== new Date().getFullYear() ? ' ' + f.getFullYear() : ''; return `${f.getDate()} ${MESES[f.getMonth()]}${y}`; };
  const hora12 = h => { const m = /^(\d{1,2}):(\d{2})/.exec(String(h || '')); if (!m) return ''; const n = +m[1]; return `${((n + 11) % 12) + 1}:${m[2]} ${n < 12 ? 'a. m.' : 'p. m.'}`; };
  const cuando = d => d == null ? '' : d === 0 ? 'hoy' : d === 1 ? 'mañana' : d === -1 ? 'ayer' : d > 0 ? `en ${d} días` : `hace ${-d} días`;
  const hace = iso => {
    const t = Date.parse(iso); if (!Number.isFinite(t)) return '';
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'ahora'; if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60); if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24); return d === 1 ? 'ayer' : `hace ${d} días`;
  };
  let fmtCop;
  try { fmtCop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }); } catch (e) { fmtCop = null; }
  const cop = n => { const v = Number(n) || 0; return fmtCop ? fmtCop.format(v) : 'COP ' + Math.round(v).toLocaleString(); };
  const iniciales = nombre => String(nombre || '').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase();
  const permiso = mod => (S.persona && S.persona.permisos[mod]) || 'no';
  const puedeVer = mod => permiso(mod) !== 'no';
  const pill = (txt, clase, icono) => `<span class="pill ${clase}">${icono ? ico(icono) : ''}${esH(txt)}</span>`;

  /* ---------- pantallas ---------- */
  function mostrar(cual) {
    ['vCarga', 'vConfig', 'vEntrada'].forEach(id => { $(id).hidden = id !== cual; });
    const dentro = cual === 'app';
    Object.values(VISTAS).forEach(id => { $(id).hidden = !dentro || id !== VISTAS[S.vista]; });
    $('tabs').hidden = !dentro;
    $('btnPersona').hidden = !dentro;
    $('btnAvisos').hidden = !dentro;
    document.body.style.paddingBottom = dentro ? '' : '24px';
  }
  function error(msg) { $('avisoErrorTxt').textContent = msg || ''; $('avisoError').hidden = !msg; }

  /* ---------- entrada ---------- */
  function tarjetaPersona(p, actual) {
    return `<button type="button" class="card persona-card" data-rol="${esH(p.rol)}" ${actual ? 'aria-current="true"' : ''}>
      <span class="avatar grande av-${esH(p.rol)}" aria-hidden="true">${esH(iniciales(p.nombre))}</span>
      <span class="pc-t"><b>${esH(p.nombre)}</b><span>${esH(p.rolTxt)} · ${esH(p.cargo)}</span></span>
      <span class="pc-ir" aria-hidden="true">${actual ? ico('check') : ico('flecha')}</span>
    </button>`;
  }
  function pintarEntrada() {
    $('entradaLista').innerHTML = window.DEMO.PERSONAS.map(p => tarjetaPersona(p, false)).join('');
  }
  async function entrarComo(rol, boton) {
    if (S.entrando) return;
    S.entrando = true;
    const err = $('entradaErr'); err.hidden = true;
    document.querySelectorAll('.persona-card').forEach(b => { b.setAttribute('aria-busy', b === boton ? 'true' : 'false'); });
    try {
      const p = await nube.entrar(rol);
      if (S.persona && S.persona.rol === p.rol) cerrarHoja('shPersona');
    } catch (e) {
      const msg = nube.explicar(e);
      if (!$('vEntrada').hidden) { err.textContent = msg; err.hidden = false; } else toast(msg);
    } finally {
      S.entrando = false;
      document.querySelectorAll('.persona-card').forEach(b => b.removeAttribute('aria-busy'));
    }
  }

  /* ---------- sesión y datos ---------- */
  function dejarDeEscuchar() { S.oyentes.forEach(f => { try { f(); } catch (e) {} }); S.oyentes = []; S.llegaron.clear(); }
  async function alCambiarSesion(p) {
    dejarDeEscuchar();
    cerrarHoja('shPersona');
    if (!p) { S.persona = null; error(''); pintarEntrada(); mostrar('vEntrada'); return; }
    if (p.desconocido) { error('Esta cuenta no es de la demo. Sal y entra con una de las personas de prueba.'); S.persona = null; await nube.salir(); return; }
    const cambio = S.persona && S.persona.rol !== p.rol;
    S.persona = p;
    if (!puedeVer(S.vista) && S.vista !== 'inicio') S.vista = 'inicio';
    pintarPersona();
    mostrar('app');
    pintarTodo();
    if (cambio) toast(`Ahora eres ${p.nombre} (${p.rolTxt})`);
    try { if (await nube.sembrar(false, p.rol)) toast('Listo: se cargaron los datos de prueba'); }
    catch (e) { error(nube.explicar(e)); }
    escucharTodo();
  }
  function escucharTodo() {
    ['equipos', 'compras', 'vehiculos', 'reuniones', 'avisos'].forEach(col => {
      S.oyentes.push(nube.escuchar(col, lista => {
        S.datos[col] = lista; S.llegaron.add(col);
        if (col !== 'avisos' || !$('avisoError').hidden) error('');
        pintarTodo();
      }, e => { error(nube.explicar(e)); }));
    });
  }

  /* ---------- encabezado y persona ---------- */
  function pintarPersona() {
    const p = S.persona; if (!p) return;
    const av = $('avatarTop'); av.className = 'avatar av-' + p.rol; av.textContent = iniciales(p.nombre);
    $('nombreTop').textContent = p.corto; $('rolTop').textContent = p.rolTxt;
    $('btnPersona').setAttribute('aria-label', `${p.nombre}, ${p.rolTxt}. Cambiar de persona`);
    // Las pestañas de los módulos sin permiso no se muestran.
    document.querySelectorAll('.tab[data-vista]').forEach(t => { const k = t.dataset.vista; t.hidden = k !== 'inicio' && !puedeVer(k); });
    MODULOS.forEach(m => { const el = $('perm' + m.k[0].toUpperCase() + m.k.slice(1)); if (el) el.textContent = window.DEMO.PERMISO_TXT[permiso(m.k)]; });
  }
  function abrirPersona() {
    const p = S.persona; if (!p) return;
    $('personaLista').innerHTML = window.DEMO.PERSONAS.map(x => tarjetaPersona(x, x.rol === p.rol)).join('');
    $('permNombre').textContent = p.nombre;
    $('permTabla').innerHTML = MODULOS.map(m => `<div><span>${esH(m.n)}</span>${pill(window.DEMO.PERMISO_TXT[permiso(m.k)], permiso(m.k) === 'no' ? 'none' : 's-disco')}</div>`).join('');
    $('ajustesJefe').hidden = p.rol !== 'jefe';
    abrirHoja('shPersona');
  }

  /* ---------- vistas ---------- */
  function irA(vista) {
    if (!VISTAS[vista]) return;
    if (vista !== 'inicio' && !puedeVer(vista)) { toast(`${S.persona.nombre} no tiene permiso para ${MODULOS.find(m => m.k === vista).n}`); return; }
    S.vista = vista;
    Object.entries(VISTAS).forEach(([k, id]) => { $(id).hidden = k !== vista; });
    document.querySelectorAll('.tab[data-vista]').forEach(t => { t.dataset.vista === vista ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current'); });
    UI.entrar($(VISTAS[vista]));
    window.scrollTo(0, 0);
    pintarTodo();
  }
  const cargando = col => !S.llegaron.has(col);

  // Cuenta lo pendiente de cada módulo para la persona que tiene la sesión.
  function pendientes() {
    const d = S.datos, p = S.persona, rol = p ? p.rol : '';
    const porAutorizar = d.compras.filter(c => c.estado === 'pedido').length;
    const sinAutorizar = d.compras.filter(c => c.estado === 'sin-autorizar').length;
    const docsPorVencer = d.vehiculos.reduce((n, v) => n + [v.soat, v.tecno].filter(f => { const x = diasHasta(f); return x != null && x <= 30; }).length, 0);
    const novedades = d.vehiculos.reduce((n, v) => n + (v.novedades || []).filter(x => !x.revisada).length, 0);
    const necesidadesDe = r => (r.necesidades || []).filter(x => x.estado === 'pendiente' && (rol === 'jefe' || x.responsableRol === rol));
    const reunionesPend = d.reuniones.filter(r => r.estado !== 'cancelada' && r.estado !== 'realizada' && necesidadesDe(r).length).length;
    const recibidos = d.equipos.filter(e => e.estado === 'recibido').length;
    return { porAutorizar, sinAutorizar, docsPorVencer, novedades, reunionesPend, recibidos };
  }

  function pintarInicio() {
    const p = S.persona; if (!p) return;
    $('tInicio').textContent = `Hola, ${p.nombre.split(' ')[0]}`;
    $('inicioSub').textContent = `${p.cargo} · ${p.rolTxt}`;
    const n = pendientes();
    const todas = [
      { mod: 'compras', k: 'i-aut', n: n.porAutorizar, lbl: 'Compras por autorizar', icono: 'carrito', tono: 'org', roles: ['jefe', 'compras'] },
      { mod: 'compras', k: 'i-sin', n: n.sinAutorizar, lbl: 'Compras sin autorizar', icono: 'aviso', tono: 'peligro', roles: ['jefe', 'compras'] },
      { mod: 'vehiculos', k: 'i-nov', n: n.novedades, lbl: 'Novedades sin revisar', icono: 'carro', tono: 'org', roles: ['jefe', 'carros', 'conductor'] },
      { mod: 'vehiculos', k: 'i-doc', n: n.docsPorVencer, lbl: 'SOAT o revisión por vencer', icono: 'calendario', tono: 'peligro', roles: ['jefe', 'carros', 'conductor'] },
      { mod: 'reuniones', k: 'i-reu', n: n.reunionesPend, lbl: p.rol === 'jefe' ? 'Reuniones con algo pendiente' : 'Reuniones que esperan tu respuesta', icono: 'reunion', tono: 'listo', roles: ['jefe', 'compras', 'carros'] },
      { mod: 'equipos', k: 'i-rec', n: n.recibidos, lbl: 'Equipos en Recibidos', icono: 'recibidos', tono: 'listo', roles: ['jefe', 'asistente'] }
    ].filter(c => c.roles.includes(p.rol) && puedeVer(c.mod));
    const sum = $('sumInicio');
    const algoCargando = ['equipos', 'compras', 'vehiculos', 'reuniones'].some(cargando);
    sum.className = 'summary' + (todas.length === 2 || todas.length === 4 ? ' dos' : '');
    sum.innerHTML = todas.map(c => UI.cifra({ k: c.k, n: algoCargando ? 0 : c.n, lbl: c.lbl, icono: c.icono, tono: c.tono, filtro: c.mod, activo: false })).join('');
    UI.contar(sum);
    $('modulosLista').innerHTML = MODULOS.map(m => {
      const ok = puedeVer(m.k);
      return `<button type="button" class="card modulo ${ok ? '' : 'bloqueado'}" data-ir="${m.k}" ${ok ? '' : 'aria-disabled="true"'}>
        <span class="ico">${ico(ok ? m.ico : 'candado')}</span><b>${esH(m.n)}</b>
        <span class="meta">${ok ? esH(m.txt) : 'Sin permiso con esta persona'}</span>
        ${pill(window.DEMO.PERMISO_TXT[permiso(m.k)], ok ? 's-disco' : 'none')}
      </button>`;
    }).join('');
  }

  /** Tablero con filtro: al tocar una cifra filtra la lista; tocarla otra vez quita el filtro. */
  function tablero(mod, cifras) {
    const el = $('sum' + mod[0].toUpperCase() + mod.slice(1));
    el.className = 'summary' + (cifras.length === 2 || cifras.length === 4 ? ' dos' : '');
    el.innerHTML = cifras.map(c => UI.cifra(Object.assign({ activo: S.filtro[mod] === c.filtro }, c))).join('');
    el.dataset.mod = mod;
    UI.contar(el);
  }
  function contar(id, n, total, palabra) {
    $(id).textContent = n === total ? `${total} ${palabra}` : `${n} de ${total} ${palabra}`;
  }
  function lista(id, col, html, vacioTxt) {
    const el = $(id);
    if (cargando(col)) { el.innerHTML = UI.esqueleto(3); return; }
    el.innerHTML = html || UI.vacio('vacio', vacioTxt, S.filtro[col] ? 'Toca otra vez la cifra de arriba para ver todo.' : '');
  }

  const EST_EQ = { asignado: ['Asignado', 's-disco', 'disco'], bodega: ['En bodega', 's-pend', 'pend'], recibido: ['En Recibidos', 's-org', 'org'] };
  function pintarEquipos() {
    const todos = S.datos.equipos.slice().sort((a, b) => String(a.serial).localeCompare(String(b.serial)));
    const c = k => todos.filter(e => e.estado === k).length;
    tablero('equipos', [
      { k: 'e-asig', n: c('asignado'), lbl: 'Asignados', icono: 'persona', tono: 'disco', filtro: 'asignado' },
      { k: 'e-bod', n: c('bodega'), lbl: 'En bodega', icono: 'bolsa', filtro: 'bodega' },
      { k: 'e-rec', n: c('recibido'), lbl: 'En Recibidos', icono: 'recibidos', tono: 'org', filtro: 'recibido' }
    ]);
    const q = $('qEquipos').value.trim().toLowerCase();
    const vis = todos.filter(e => (!S.filtro.equipos || e.estado === S.filtro.equipos) &&
      (!q || [e.serial, e.asignadoA, e.marca, e.modelo, e.tipo, e.proyecto].join(' ').toLowerCase().includes(q)));
    contar('cntEquipos', vis.length, todos.length, 'equipos');
    lista('listaEquipos', 'equipos', vis.map(e => {
      const st = EST_EQ[e.estado] || ['Sin estado', 'none', 'pend'];
      const dm = diasHasta(e.ultimoMtto), viejo = dm != null && dm < -180;
      return `<div class="card st-${st[2]}">
        <div class="card-head"><div class="card-title"><small>${esH(e.serial)}</small>${esH(e.tipo)} ${esH(e.marca)}</div>${pill(st[0], st[1])}</div>
        <p class="card-sub">${esH(e.modelo)}</p>
        <div class="facts"><span>${ico('persona')} <b>${esH(e.asignadoA || 'Sin asignar')}</b></span>${e.proyecto ? `<span>${esH(e.proyecto)}</span>` : ''}</div>
        <div class="docs">${e.ultimoMtto ? pill('Mantenimiento ' + fechaCorta(e.ultimoMtto), viejo ? 's-warn' : 's-pend', 'mantenimiento') : pill('Sin mantenimiento', 's-warn', 'mantenimiento')}
          ${e.ultimoBackup ? pill('Backup ' + fechaCorta(e.ultimoBackup), 's-pend', 'backup') : ''}</div>
        ${e.obs ? `<div class="meta">${esH(e.obs)}</div>` : ''}
      </div>`;
    }).join(''), 'No hay equipos con ese filtro');
  }

  const EST_CO = {
    pedido: ['Por autorizar', 's-org', 'org'], autorizado: ['Autorizado', 's-listo', 'listo'], rechazado: ['Rechazado', 'none', 'pend'],
    comprado: ['Comprado', 's-disco', 'disco'], recibido: ['Recibido', 's-disco', 'disco'], 'sin-autorizar': ['Sin autorizar', 's-peligro', 'peligro']
  };
  function pintarCompras() {
    const todas = S.datos.compras.slice().sort((a, b) => String(b.fechaPedido).localeCompare(String(a.fechaPedido)));
    const c = f => todas.filter(f).length;
    tablero('compras', [
      { k: 'c-aut', n: c(x => x.estado === 'pedido'), lbl: 'Por autorizar', icono: 'reloj', tono: 'org', filtro: 'pedido' },
      { k: 'c-sin', n: c(x => x.estado === 'sin-autorizar'), lbl: 'Sin autorizar', icono: 'aviso', tono: 'peligro', filtro: 'sin-autorizar' },
      { k: 'c-com', n: c(x => x.estado === 'comprado' || x.estado === 'recibido'), lbl: 'Compradas', icono: 'checkCirculo', tono: 'disco', filtro: 'comprado' }
    ]);
    // Resumen del mes: lo comprado (o recibido) con fecha de compra en el mes actual.
    const mes = hoyISO().slice(0, 7);
    const delMes = todas.filter(x => ['comprado', 'recibido', 'sin-autorizar'].includes(x.estado) && String(x.fechaCompra || x.fechaPedido).slice(0, 7) === mes);
    const total = delMes.reduce((s, x) => s + (Number(x.valorReal) || Number(x.valorAprox) || 0), 0);
    const sinAut = delMes.filter(x => x.estado === 'sin-autorizar').reduce((s, x) => s + (Number(x.valorReal) || Number(x.valorAprox) || 0), 0);
    $('resumenMes').innerHTML = cargando('compras') ? '<span class="meta">Calculando el resumen del mes…</span>' :
      `<div class="rm-t"><span class="meta">Comprado este mes (${delMes.length})</span><span class="rm-n valor">${esH(cop(total))}</span></div>
       ${sinAut ? pill('Sin autorizar: ' + cop(sinAut), 's-peligro', 'aviso') : pill('Todo autorizado', 's-disco', 'check')}`;
    const vis = todas.filter(x => !S.filtro.compras || x.estado === S.filtro.compras || (S.filtro.compras === 'comprado' && x.estado === 'recibido'));
    contar('cntCompras', vis.length, todas.length, 'compras');
    lista('listaCompras', 'compras', vis.map(x => {
      const st = EST_CO[x.estado] || ['Sin estado', 'none', 'pend'];
      const valor = x.valorReal ? esH(cop(x.valorReal)) : `<span class="aprox">aprox.</span>${esH(cop(x.valorAprox))}`;
      return `<div class="card st-${st[2]}">
        <div class="card-head"><div class="card-title">${esH(x.que)}</div>${pill(st[0], st[1], x.estado === 'sin-autorizar' ? 'aviso' : '')}</div>
        <p class="card-sub">${esH(x.cantidad)} ${esH(x.unidad)} · ${esH(x.categoria)}</p>
        <div class="facts"><span class="valor">${valor}</span><span>${esH(x.paraQue)}</span></div>
        <div class="meta">Pidió ${esH(x.pide)} el ${esH(fechaCorta(x.fechaPedido))}${x.autoriza ? ` · Autoriza ${esH(x.autoriza)}` : ''}${x.proveedor ? ` · ${esH(x.proveedor)}` : ''}${x.entregadoA ? ` · Entregado a ${esH(x.entregadoA)}` : ''}</div>
        ${x.motivoRechazo ? `<div class="meta">Motivo del rechazo: ${esH(x.motivoRechazo)}</div>` : ''}
      </div>`;
    }).join(''), 'No hay compras con ese filtro');
  }

  const EST_VE = { disponible: ['Disponible', 's-disco', 'disco'], 'en-uso': ['En uso', 's-listo', 'listo'], 'en-taller': ['En taller', 's-org', 'org'] };
  const NOV_TXT = { llanta: 'Llanta', choque: 'Choque', rayon: 'Rayón', mantenimiento: 'Mantenimiento', otro: 'Otro' };
  function docPill(nombre, fecha) {
    const d = diasHasta(fecha);
    if (d == null) return pill(nombre + ' sin fecha', 's-warn', 'calendario');
    if (d < 0) return pill(`${nombre} vencido ${cuando(d)}`, 's-peligro', 'aviso');
    if (d <= 30) return pill(`${nombre} vence ${cuando(d)}`, 's-warn', 'calendario');
    return pill(`${nombre} hasta ${fechaCorta(fecha)}`, 's-pend', 'calendario');
  }
  function pintarVehiculos() {
    const todos = S.datos.vehiculos.slice().sort((a, b) => String(a.placa).localeCompare(String(b.placa)));
    const vence = v => [v.soat, v.tecno].some(f => { const x = diasHasta(f); return x != null && x <= 30; });
    const nov = v => (v.novedades || []).filter(x => !x.revisada).length;
    tablero('vehiculos', [
      { k: 'v-disp', n: todos.filter(v => v.estado === 'disponible').length, lbl: 'Disponibles', icono: 'carro', tono: 'disco', filtro: 'disponible' },
      { k: 'v-nov', n: todos.filter(nov).length, lbl: 'Con novedades sin revisar', icono: 'aviso', tono: 'org', filtro: 'novedad' },
      { k: 'v-doc', n: todos.filter(vence).length, lbl: 'Documentos por vencer', icono: 'calendario', tono: 'peligro', filtro: 'docs' }
    ]);
    const f = S.filtro.vehiculos;
    const vis = todos.filter(v => !f || (f === 'disponible' && v.estado === 'disponible') || (f === 'novedad' && nov(v)) || (f === 'docs' && vence(v)));
    contar('cntVehiculos', vis.length, todos.length, 'carros');
    lista('listaVehiculos', 'vehiculos', vis.map(v => {
      const st = EST_VE[v.estado] || ['Sin estado', 'none', 'pend'];
      const pend = (v.novedades || []).filter(x => !x.revisada);
      return `<div class="card st-${pend.length ? 'org' : st[2]}">
        <div class="card-head"><div class="card-title"><span class="placa">${esH(v.placa)}</span></div>${pill(st[0], st[1])}</div>
        <p class="card-sub">${esH(v.marca)} ${esH(v.modelo)} ${esH(v.anio)}</p>
        <div class="facts"><span>${ico('persona')} <b>${esH(v.conductor || 'Sin conductor')}</b></span><span class="valor">${esH((Number(v.km) || 0).toLocaleString('es-CO'))} km</span></div>
        <div class="docs">${docPill('SOAT', v.soat)}${docPill('Técnico-mecánica', v.tecno)}</div>
        ${pend.map(x => `<div class="aviso warn"><span><b>${esH(NOV_TXT[x.tipo] || 'Novedad')} sin revisar</b> · ${esH(x.desc)} (${esH(x.reporta)}, ${esH(fechaCorta(x.fecha))})</span></div>`).join('')}
      </div>`;
    }).join(''), 'No hay carros con ese filtro');
  }

  const EST_RE = { programada: ['Programada', 's-listo', 'listo'], reprogramada: ['Reprogramada', 's-org', 'org'], cancelada: ['Cancelada', 's-peligro', 'peligro'], realizada: ['Realizada', 's-disco', 'disco'] };
  const NEC_TXT = { carros: 'Carros', refrigerios: 'Refrigerios', almuerzo: 'Almuerzo' };
  const NEC_EST = { pendiente: ['Pendiente', 's-org'], autorizado: ['Autorizado', 's-disco'], rechazado: ['Rechazado', 's-peligro'] };
  function pintarReuniones() {
    const proximas = r => r.estado === 'programada' || r.estado === 'reprogramada';
    // Primero las próximas (la más cercana arriba); después las realizadas o canceladas (la más reciente arriba).
    const todas = S.datos.reuniones.slice().sort((a, b) => (proximas(b) - proximas(a)) || (proximas(a) ? String(a.fecha).localeCompare(String(b.fecha)) : String(b.fecha).localeCompare(String(a.fecha))));
    const conPend = r => (r.necesidades || []).some(x => x.estado === 'pendiente');
    tablero('reuniones', [
      { k: 'r-prox', n: todas.filter(proximas).length, lbl: 'Próximas', icono: 'calendario', tono: 'listo', filtro: 'proximas' },
      { k: 'r-pend', n: todas.filter(r => proximas(r) && conPend(r)).length, lbl: 'Con algo pendiente', icono: 'reloj', tono: 'org', filtro: 'pendiente' },
      { k: 'r-hech', n: todas.filter(r => r.estado === 'realizada').length, lbl: 'Realizadas', icono: 'checkCirculo', tono: 'disco', filtro: 'realizada' }
    ]);
    const f = S.filtro.reuniones;
    const vis = todas.filter(r => !f || (f === 'proximas' && proximas(r)) || (f === 'pendiente' && proximas(r) && conPend(r)) || (f === 'realizada' && r.estado === 'realizada'));
    contar('cntReuniones', vis.length, todas.length, 'reuniones');
    lista('listaReuniones', 'reuniones', vis.map(r => {
      const st = EST_RE[r.estado] || ['Sin estado', 'none', 'pend'];
      const d = diasHasta(r.fecha);
      return `<div class="card st-${st[2]}">
        <div class="card-head"><div class="card-title">${esH(r.comunidad)}</div>${pill(st[0], st[1])}</div>
        <p class="card-sub">${esH(fechaCorta(r.fecha))}, ${esH(hora12(r.hora))} (${esH(cuando(d))}) · ${esH(r.lugar)}</p>
        <div class="facts"><span>Jefe: <b>${esH(r.jefe)}</b></span><span>${(r.asistentes || []).length} asistentes</span></div>
        ${(r.necesidades || []).length ? `<ul class="necesidades">${r.necesidades.map(x => {
          const e = NEC_EST[x.estado] || ['Sin estado', 'none'];
          return `<li><span><b>${esH(NEC_TXT[x.tipo] || x.tipo)}</b> · ${esH(x.detalle || x.cantidad)} · ${esH(x.responsable)}</span>${pill(e[0], e[1])}</li>`;
        }).join('')}</ul>` : ''}
      </div>`;
    }).join(''), 'No hay reuniones con ese filtro');
  }

  /* ---------- avisos (campana) ---------- */
  const misAvisos = () => {
    const rol = S.persona ? S.persona.rol : '';
    return S.datos.avisos.filter(a => a.para === rol || a.para === 'todos').sort((a, b) => String(b.en).localeCompare(String(a.en)));
  };
  const noLeidos = () => { const rol = S.persona ? S.persona.rol : ''; return misAvisos().filter(a => !(a.leido && a.leido[rol])); };
  const ICO_MOD = { equipos: 'equipos', compras: 'carrito', vehiculos: 'carro', reuniones: 'reunion', inicio: 'campana' };
  function pintarAvisos() {
    const n = noLeidos().length;
    UI.insignia($('badgeAvisos'), n);
    $('btnAvisos').setAttribute('aria-label', n ? `Avisos, ${n} sin leer` : 'Avisos');
    if ($('shAvisos').hidden) return;
    const lst = misAvisos(), rol = S.persona.rol;
    $('shAvisosSub').textContent = lst.length ? `Avisos para ${S.persona.nombre} (${S.persona.rolTxt}).` : '';
    $('avisosLista').innerHTML = lst.length ? lst.map(a => {
      const nuevo = !(a._visto || (a.leido && a.leido[rol]));
      return `<div class="card aviso-it ${nuevo ? 'nuevo' : ''}"><span class="ico">${ico(ICO_MOD[a.modulo] || 'campana')}</span>
        <span class="ai-t"><b>${esH(a.titulo)}</b><span>${esH(a.texto)}</span><span class="meta">${esH(hace(a.en))}</span></span>
        ${nuevo ? '<span class="punto" aria-label="Nuevo"></span>' : ''}</div>`;
    }).join('') : UI.vacio('campana', 'Sin avisos', 'Aquí llegan los avisos de los módulos que te tocan.');
  }
  async function abrirAvisos() {
    abrirHoja('shAvisos');
    pintarAvisos();
    // Al abrir la campana se marcan como leídos (los puntos se ven en esta apertura y se van en la siguiente).
    const rol = S.persona.rol, pend = noLeidos();
    pend.forEach(a => { a._visto = true; });
    try { await Promise.all(pend.map(a => nube.mezclar('avisos', a.id, { leido: { [rol]: true } }))); }
    catch (e) { toast(nube.explicar(e)); }
  }

  /* ---------- insignias de las pestañas ---------- */
  function pintarInsignias() {
    const n = pendientes(), rol = S.persona ? S.persona.rol : '';
    const b = {
      equipos: ['jefe', 'asistente'].includes(rol) ? n.recibidos : 0,
      compras: ['jefe', 'compras'].includes(rol) ? n.porAutorizar + n.sinAutorizar : 0,
      vehiculos: ['jefe', 'carros', 'conductor'].includes(rol) ? n.novedades : 0,
      reuniones: ['jefe', 'compras', 'carros'].includes(rol) ? n.reunionesPend : 0
    };
    Object.entries(b).forEach(([k, v]) => UI.insignia(document.querySelector(`[data-badge="${k}"]`), puedeVer(k) ? v : 0));
  }

  function pintarTodo() {
    if (!S.persona) return;
    pintarInsignias();
    pintarAvisos();
    ({ inicio: pintarInicio, equipos: pintarEquipos, compras: pintarCompras, vehiculos: pintarVehiculos, reuniones: pintarReuniones })[S.vista]();
  }

  /* ---------- versión pagada ---------- */
  const PAGADA = {
    entrada: ['Entrada y permisos', 'Cuentas de prueba y un botón para cambiar de persona en vivo.', 'Cuentas reales con el correo de cada persona. Cada una entra con su clave y solo ve lo suyo.'],
    inicio: ['La app completa', 'Gratis, con datos de prueba y avisos solo dentro de la app.', 'Unos USD 20 a 28 al mes: el agente lee el correo real y los avisos llegan al teléfono.'],
    equipos: ['Equipos', 'Las fotos de las hojas se guardan comprimidas dentro de la base de datos.', 'Las fotos van a un almacenamiento aparte (Cloud Storage): más calidad y la base no se llena.'],
    compras: ['Compras', 'Quien autoriza ve lo pendiente al abrir la app.', 'A quien autoriza le llega un aviso al teléfono apenas alguien pide algo.'],
    vehiculos: ['Vehículos', 'Los vencimientos del SOAT y la técnico-mecánica se ven en rojo y amarillo dentro de la app.', 'Avisos automáticos al teléfono antes de que venza el SOAT o la revisión.'],
    reuniones: ['Reuniones y agente', 'Correos de ejemplo pegados en la app; Gemini gratis los lee.', 'El agente lee solo el buzón real de Outlook, con n8n y el permiso de TI.'],
    avisos: ['Avisos', 'Una campana dentro de la app.', 'Avisos al teléfono, por correo o por Teams.']
  };
  function abrirPagada(k) {
    const x = PAGADA[k] || PAGADA.inicio;
    $('shPagadaT').textContent = 'Versión pagada: ' + x[0];
    $('pagadaCuerpo').innerHTML = `<div class="pagada-tabla"><div class="pagada-fila">
      <div class="hoy"><small>En la demo (gratis)</small>${esH(x[1])}</div>
      <div class="pago"><small>Pagando</small>${esH(x[2])}</div></div>
      <p class="costo meta">Costo aproximado de la versión pagada: Firebase USD 0 a 3 al mes y el agente (n8n con Gemini) unos USD 20 a 25 al mes.</p></div>`;
    abrirHoja('shPagada');
  }

  /* ---------- hojas y confirmación ---------- */
  function abrirHoja(id) { $(id).hidden = false; }
  function cerrarHoja(id) { const el = $(id); if (el && !el.hidden) el.hidden = true; }
  function confirmar(titulo, texto, boton) {
    return new Promise(res => {
      $('cfT').textContent = titulo; $('cfTxt').textContent = texto; $('cfSi').textContent = boton;
      const fin = v => { $('cfSi').onclick = $('cfNo').onclick = null; cerrarHoja('shConfirmar'); res(v); };
      $('cfSi').onclick = () => fin(true); $('cfNo').onclick = () => fin(false);
      $('shConfirmar')._cancelar = () => fin(false);
      abrirHoja('shConfirmar');
    });
  }
  function cerrarArriba() {
    const top = UI.arriba(); if (!top) return;
    if (top._cancelar) top._cancelar(); else top.hidden = true;
  }

  /* ---------- eventos ---------- */
  function conectarEventos() {
    $('entradaLista').addEventListener('click', e => { const b = e.target.closest('[data-rol]'); if (b) entrarComo(b.dataset.rol, b); });
    $('personaLista').addEventListener('click', e => {
      const b = e.target.closest('[data-rol]'); if (!b) return;
      if (S.persona && b.dataset.rol === S.persona.rol) { cerrarHoja('shPersona'); return; }
      entrarComo(b.dataset.rol, b);
    });
    $('btnPersona').onclick = abrirPersona;
    $('btnAvisos').onclick = abrirAvisos;
    $('btnSalir').onclick = async () => { cerrarHoja('shPersona'); await nube.salir(); };
    $('btnReiniciar').onclick = async () => {
      if (S.persona.rol !== 'jefe') return;
      const ok = await confirmar('¿Reiniciar los datos de prueba?', 'Se borra todo lo que se haya cambiado en la demo (para todas las personas) y vuelven los datos de ejemplo con las fechas de hoy. No se puede deshacer.', 'Reiniciar');
      if (!ok) return;
      const b = $('btnReiniciar'); b.disabled = true;
      try { await nube.sembrar(true, S.persona.rol); toast('Listo: datos de prueba reiniciados'); cerrarHoja('shPersona'); }
      catch (e) { toast(nube.explicar(e)); }
      finally { b.disabled = false; }
    };
    document.querySelector('.tabs').addEventListener('click', e => { const t = e.target.closest('.tab[data-vista]'); if (t) irA(t.dataset.vista); });
    $('modulosLista').addEventListener('click', e => {
      const b = e.target.closest('[data-ir]'); if (!b) return;
      if (b.getAttribute('aria-disabled') === 'true') { toast(`${S.persona.nombre} no tiene permiso para este módulo. Cambia de persona para verlo.`); return; }
      irA(b.dataset.ir);
    });
    // Cifras del tablero: en Inicio llevan al módulo; en los módulos filtran la lista.
    document.addEventListener('click', e => {
      const c = e.target.closest('button.sum[data-filtro]'); if (!c) return;
      const caja = c.closest('.summary');
      if (caja.id === 'sumInicio') { irA(c.dataset.filtro); return; }
      const mod = caja.dataset.mod; if (!mod) return;
      S.filtro[mod] = S.filtro[mod] === c.dataset.filtro ? '' : c.dataset.filtro;
      pintarTodo();
    });
    $('qEquipos').addEventListener('input', () => pintarEquipos());
    document.addEventListener('click', e => {
      const p = e.target.closest('[data-pagada]'); if (p) { abrirPagada(p.dataset.pagada); return; }
      if (e.target.closest('[data-cerrar]')) { const bd = e.target.closest('.backdrop'); if (bd) bd.hidden = true; return; }
      // Tocar el fondo oscuro cierra la hoja (salvo la confirmación, que se responde con un botón).
      if (e.target.classList && e.target.classList.contains('backdrop') && !e.target.classList.contains('confirm')) e.target.hidden = true;
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarArriba(); });
    $('btnReintentar').onclick = () => location.reload();
    const red = () => { $('avisoOff').hidden = navigator.onLine !== false; };
    addEventListener('online', red); addEventListener('offline', red); red();
  }

  /* ---------- arranque ---------- */
  async function arrancar() {
    $('cargaLista').innerHTML = UI.esqueleto(3, false);
    conectarEventos();
    if (!nube.configLista()) { mostrar('vConfig'); return; }
    mostrar('vCarga');
    try { await nube.iniciar(p => { alCambiarSesion(p).catch(e => error(nube.explicar(e))); }); }
    catch (e) {
      mostrar('vEntrada'); pintarEntrada();
      error(e && /import|fetch|module/i.test(String(e.message)) ? 'No se pudo cargar Firebase. Revisa la conexión a internet y toca Reintentar.' : nube.explicar(e));
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();
})();
