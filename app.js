/* app.js — Demo de la app de control (fases 1 y 2): entrada con cuentas de prueba, cambio de persona en vivo,
   menú de los cuatro módulos con datos inventados, campana de avisos y etiquetas "Versión pagada".
   Equipos, Vehículos y Reuniones solo muestran datos en esta fase. El Inventario (consumibles, bodega y compras) vive en inventario.js. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esH = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const MODULOS = [
    { k: 'equipos', n: 'Equipos', ico: 'equipos', txt: 'Inventario, Recibidos, entregas y devoluciones' },
    { k: 'inventario', n: 'Inventario', ico: 'caja', txt: 'Bodega de consumibles: existencias, pedidos de material y compras' },
    { k: 'vehiculos', n: 'Vehículos', ico: 'carro', txt: 'Estado de cada carro, novedades, entrega y recibo' },
    { k: 'reuniones', n: 'Reuniones', ico: 'reunion', txt: 'Reuniones que llegan por correo y lo que cada una necesita' }
  ];
  const VISTAS = { inicio: 'vInicio', equipos: 'vEquipos', inventario: 'vInventario', vehiculos: 'vVehiculos', reuniones: 'vReuniones' };
  const S = {
    persona: null,
    vista: 'inicio',
    datos: { equipos: [], hojas: [], tareasEq: [], compras: [], articulos: [], movimientos: [], solicitudes: [], vehiculos: [], novedades: [], entregas: [], reuniones: [], necesidades: [], avisos: [], suscripciones: [], usuarios: [], codigos: [], codigosDireccion: [], buzon: [], ajustesApp: [], invitaciones: [] },
    llegaron: new Set(),   // colecciones que ya respondieron al menos una vez
    suscritas: new Set(),  // colecciones a las que esta persona se suscribió (las demás no las puede leer y nunca «cargan»)
    oyentes: [],
    filtro: { equipos: '', inventario: '', vehiculos: '', reuniones: '' },
    entrando: false,
    vistos: new Set(),     // avisos que estaban sin leer al abrir la campana (conservan el punto en esa apertura)
    sesion: 0              // sube con cada cambio de sesión; lo que llega tarde de una sesión anterior se ignora
  };

  /* ---------- utilidades ---------- */
  const toast = window.toast = msg => { const t = $('toast'); UI.tostada(t, msg); clearTimeout(t._t); t._t = setTimeout(() => { t.hidden = true; }, 3200); };
  const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const aFecha = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  /** Días desde hoy hasta la fecha (negativo si ya pasó). */
  const diasHasta = s => { const f = aFecha(s); if (!f) return null; const h = aFecha(hoyISO()); return Math.round((f - h) / 86400000); };
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
  const fechaCorta = s => { const f = aFecha(s); if (!f) return ''; const y = f.getFullYear() !== new Date().getFullYear() ? ' ' + f.getFullYear() : ''; return `${f.getDate()} ${MESES[f.getMonth()]}${y}`; };
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
  /** ¿La persona tiene este permiso extra? (los marca el Gerente o la Jefe en «Personas y códigos») */
  const tieneExtra = id => !!(S.persona && Array.isArray(S.persona.extras) && S.persona.extras.includes(id));
  const puedeVer = mod => permiso(mod) !== 'no';
  /** Desde cuánto una compra también la autoriza el Gerente (lo guarda el Gerente en Firebase; por defecto 1.000.000). */
  const MONTO_POR_DEFECTO = 1000000;
  const montoGerente = () => { const d = S.datos.ajustesApp.find(x => x.id === 'compras'); return d && Number.isInteger(d.montoGerente) && d.montoGerente >= 0 ? d.montoGerente : MONTO_POR_DEFECTO; };
  const pill = (txt, clase, icono) => `<span class="pill ${clase}">${icono ? ico(icono) : ''}${esH(txt)}</span>`;

  /* ---------- pantallas ---------- */
  function mostrar(cual) {
    ['vCarga', 'vConfig', 'vEntrada', 'vCuenta'].forEach(id => { $(id).hidden = id !== cual; });
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
      <span class="pc-t"><b>${esH(p.nombre)}</b><span>${esH(p.rolTxt)}${p.cargo && p.cargo !== p.rolTxt ? ' · ' + esH(p.cargo) : ''}</span></span>
      <span class="pc-ir" aria-hidden="true">${actual ? ico('check') : ico('flecha')}</span>
    </button>`;
  }
  // Personas de prueba agrupadas por área (Dirección, Equipos, Inventario, Vehículos, Reuniones).
  const porArea = actual => window.DEMO.AREAS.map(a => {
    const ps = window.DEMO.PERSONAS.filter(p => p.area === a);
    return ps.length ? `<div class="section-label">${esH(a)}</div>${ps.map(p => tarjetaPersona(p, p.rol === actual)).join('')}` : '';
  }).join('');
  const hayPrueba = () => window.PERSONAS_PRUEBA !== false;
  function pintarEntrada() {
    $('entradaLista').innerHTML = hayPrueba() ? porArea('') : '';
    if (!hayPrueba()) modoEntrada = 'cuenta';
    $('entradaModo').hidden = !hayPrueba();
    pintarModoEntrada();
  }
  /* --- Entrar con cuenta propia (correo, clave y el código del rol) --- */
  let modoEntrada = 'prueba', modoCuenta = 'entrar';
  function pintarModoEntrada() {
    document.querySelectorAll('#entradaModo [data-modo]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.modo === modoEntrada)));
    $('entradaPrueba').hidden = modoEntrada !== 'prueba';
    $('entradaCuenta').hidden = modoEntrada !== 'cuenta';
    const crear = modoCuenta === 'crear';
    $('ctCodigoD').hidden = !crear; $('ctClaveAy').hidden = !crear; $('ctOlvide').hidden = crear;
    $('ctClave').autocomplete = crear ? 'new-password' : 'current-password';
    $('ctBoton').innerHTML = ico(crear ? 'mas' : 'flecha') + (crear ? 'Crear mi cuenta' : 'Entrar');
    $('ctCambiar').textContent = crear ? 'Ya tengo cuenta: entrar' : 'Es mi primera vez: crear mi cuenta';
    $('ctTitulo').textContent = crear ? 'Crear tu cuenta (con el correo con el que te invitaron)' : 'Entrar con tu cuenta';
  }
  async function enviarCuenta() {
    if (S.entrando) return;
    const err = $('ctErr'), crear = modoCuenta === 'crear';
    const nombre = $('ctNombre').value.trim(), correo = $('ctCorreo').value.trim(), clave = $('ctClave').value, codigo = nube.limpiarCodigo($('ctCodigo').value);
    const falla = (msg, id) => { err.textContent = msg; err.hidden = false; if (id) $(id).focus(); };
    err.hidden = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return falla('Escribe tu correo.', 'ctCorreo');
    if (!clave) return falla('Escribe la clave.', 'ctClave');
    if (crear && clave.length < 10) return falla('La clave debe tener al menos 10 caracteres. Inventa una que solo tú sepas.', 'ctClave');
    // El código es opcional: si no lo escribes, la app busca la invitación que la Jefe hizo a tu correo.
    const conCodigo = crear && $('ctCodigoD').open && !!$('ctCodigo').value.trim();
    if (conCodigo && nombre.length < 3) return falla('Escribe tu nombre completo.', 'ctNombre');
    if (conCodigo && !window.DEMO.rolDeCodigo(codigo)) return falla('Escribe el código de tu rol tal cual te lo dieron (ejemplo: LOG-7KQ4-M2XP).', 'ctCodigo');
    S.entrando = true; $('ctBoton').disabled = true;
    try {
      if (!crear) { await nube.entrarCuenta(correo, clave); return; }
      if (!conCodigo) { await nube.crearCuenta(correo, clave); return; }   // sigue la pantalla de confirmar el correo
      S.registrando = { nombre, codigo };
      await nube.crearCuenta(correo, clave);
      try { await nube.usarCodigo(nombre, codigo); }
      catch (e) { S.registrando = null; $('cuNombre').value = nombre; $('cuCodigo').value = $('ctCodigo').value; mostrarCuenta({ sinPerfil: true, correo }, nube.explicar(e)); }
    } catch (e) { S.registrando = null; falla(nube.explicar(e)); }
    finally { S.entrando = false; $('ctBoton').disabled = false; $('ctClave').value = ''; }
  }
  // Cuenta sin rol todavía (código malo o sin escribir) o con el acceso quitado por el Jefe.
  function mostrarCuenta(p, msg) {
    const sin = !!p.sinAcceso, conf = !!p.sinConfirmar;
    $('tCuenta').textContent = conf ? 'Confirma tu correo' : sin ? 'Tu acceso está pausado' : 'Tu correo no está en la lista';
    $('cuentaTxt').textContent = conf ? `Te mandamos un correo a ${p.correo} con un enlace. Tócalo y vuelve aquí. Si no lo ves, revisa el correo no deseado (spam).`
      : sin ? `La cuenta ${p.correo} está pausada. Habla con tu jefe para que te devuelva el acceso.`
      : `Entraste como ${p.correo}, pero la Jefe no te ha invitado con ese correo, así que todavía no tienes rol. Pídele que te agregue. Si te dieron un código de rol, escríbelo aquí.`;
    $('cuentaConfirmar').hidden = !conf;
    $('cuConfErr').hidden = true;
    $('cuentaForm').hidden = sin || conf;
    // El error se queda aunque llegue otra vez el aviso de «sin perfil» (pasa justo después de crear la cuenta).
    if (msg) S.errCuenta = msg;
    const m = sin ? '' : S.errCuenta || '';
    $('cuErr').textContent = m; $('cuErr').hidden = !m;
    mostrar('vCuenta');
  }
  async function guardarCodigo() {
    const nombre = $('cuNombre').value.trim(), codigo = nube.limpiarCodigo($('cuCodigo').value), err = $('cuErr');
    err.hidden = true;
    if (nombre.length < 3) { err.textContent = 'Escribe tu nombre completo.'; err.hidden = false; $('cuNombre').focus(); return; }
    if (!window.DEMO.rolDeCodigo(codigo)) { err.textContent = nube.explicar({ code: 'codigo-malo' }); err.hidden = false; $('cuCodigo').focus(); return; }
    const b = $('cuBoton'); b.disabled = true;
    try { await nube.usarCodigo(nombre, codigo); }
    catch (e) { S.errCuenta = err.textContent = nube.explicar(e); err.hidden = false; }
    finally { b.disabled = false; }
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
  function dejarDeEscuchar() { S.oyentes.forEach(f => { try { f(); } catch (e) {} }); S.oyentes = []; S.llegaron.clear(); S.suscritas.clear(); S.erroresLectura = {}; }
  async function alCambiarSesion(p) {
    const mia = ++S.sesion;
    dejarDeEscuchar();
    cerrarHoja('shPersona');
    if (!p || !(p.sinPerfil || p.sinAcceso || p.sinConfirmar)) S.errCuenta = '';
    if (!p) { $('cuNombre').value = ''; $('cuCodigo').value = ''; $('ctNombre').value = ''; $('ctCodigo').value = ''; $('ctCodigoD').open = false; }
    if (!p) { S.persona = null; S.registrando = null; error(S.motivoSalida || ''); S.motivoSalida = ''; pintarEntrada(); mostrar('vEntrada'); return; }
    if (p.sinPerfil || p.sinAcceso || p.sinConfirmar) {
      S.persona = null;
      if (p.sinPerfil && S.registrando) return;   // se está guardando el código recién escrito: espera el perfil
      mostrarCuenta(p, p.error || ''); return;
    }
    S.registrando = null;
    const cambio = S.persona && S.persona.rol !== p.rol;
    S.persona = p;
    // Enlace directo desde una notificación (./#inventario): abre ese módulo si la persona lo puede ver.
    const pedida = (location.hash || '').slice(1);
    if (VISTAS[pedida] && puedeVer(pedida)) { S.vista = pedida; try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
    if (!puedeVer(S.vista) && S.vista !== 'inicio') S.vista = 'inicio';
    document.querySelectorAll('.tab[data-vista]').forEach(t => { t.dataset.vista === S.vista ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current'); });
    pintarPersona();
    mostrar('app');
    pintarTodo();
    if (cambio) toast(`Ahora eres ${p.nombre} (${p.rolTxt})`);
    S.errorFijo = '';
    // Solo la Jefe de prueba carga los datos de ejemplo (una Jefe con cuenta propia no los pisa).
    try { const sembro = await nube.sembrar(false, p.prueba ? p.rol : ''); if (mia === S.sesion && sembro) toast('Listo: se cargaron los datos de prueba'); }
    catch (e) { if (mia === S.sesion) { S.errorFijo = nube.explicar(e); S.errorFijoSeVa = ['falta-sembrar', 'datos-viejos'].includes(e && e.code); error(S.errorFijo); } }
    if (mia === S.sesion) escucharTodo();
    if (window.Push && Push.estado() === 'activo') Push.actualizarRol(p.rol);
    pintarAvisoActivar();
  }
  // Los arreglos dañados (null, texto, mapa o con elementos null) se vuelven arreglos de objetos para que nada se rompa.
  const objetos = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);
  const LIMPIAR = {
    vehiculos: v => Object.assign({}, v, { historial: objetos(v.historial) }),
    reuniones: r => Object.assign({}, r, { historial: objetos(r.historial), faltan: Array.isArray(r.faltan) ? r.faltan.filter(x => typeof x === 'string') : [], correos: Array.isArray(r.correos) ? r.correos : [] }),
    necesidades: n => Object.assign({}, n, { items: objetos(n.items) })
  };
  const errorVisible = () => S.errorFijo || Object.values(S.erroresLectura || {})[0] || '';
  function escucharTodo() {
    // Las personas, los códigos y las invitaciones solo los lee la Jefe con cuenta propia (panel «Personas y permisos»).
    const p = S.persona, panel = p.real && p.rol === 'jefe' ? ['usuarios', 'codigos', 'codigosDireccion', 'invitaciones'] : [];
    // La bandeja de correos (Gmail de prueba) solo la leen la Jefe y la Administrativa encargada.
    if (p.rol === 'jefe' || (p.rol === 'administrativo' && tieneExtra('encargada'))) panel.push('buzon');
    S.errBuzon = '';
    // Cada persona se suscribe solo a lo de los módulos que puede ver (las reglas de Firebase hacen lo mismo).
    const ve = m => permiso(m) !== 'no';
    const cols = ['avisos', 'suscripciones', 'ajustesApp']
      .concat(ve('equipos') ? ['equipos', 'hojas', 'tareasEq'] : [], ve('inventario') ? ['compras', 'articulos', 'solicitudes'].concat(permiso('inventario') === 'pide' ? [] : ['movimientos']) : [],
        ve('vehiculos') ? ['vehiculos', 'novedades', 'entregas'] : [], ve('reuniones') ? ['reuniones', 'necesidades'] : [], panel);
    // Una cuenta real que solo pide material solo puede leer SUS pedidos y compras (las reglas lo exigen): se piden filtrados.
    const soloLoMio = p.real && permiso('inventario') === 'pide';
    const donde = col => (soloLoMio && ['compras', 'solicitudes'].includes(col) ? ['pideUid', nube.uid()] : null);
    cols.forEach(col => {
      S.suscritas.add(col);
      S.oyentes.push(nube.escuchar(col, lista => {
        S.datos[col] = lista.map(LIMPIAR[col] || (x => x)); S.llegaron.add(col);
        // «Faltan los datos de prueba» se quita cuando llegan artículos. Un error de permiso al cargar o al leer
        // (por ejemplo, reglas sin pegar) se queda a la vista hasta recargar.
        if (S.errorFijo && S.errorFijoSeVa && col === 'articulos' && lista.length) S.errorFijo = '';
        if (S.erroresLectura) delete S.erroresLectura[col];
        if (col === 'buzon') S.errBuzon = '';
        if (col !== 'avisos' || !$('avisoError').hidden) error(errorVisible());
        pintarTodo();
      }, e => {
        S.llegaron.add(col);   // así la pantalla deja de mostrar «cargando» y dice qué pasó
        // La bandeja dice su error dentro de Correos (por ejemplo, si todavía no se pegaron las reglas nuevas).
        if (col === 'buzon') { S.errBuzon = nube.explicar(e); pintarTodo(); return; }
        if (['suscripciones', 'usuarios', 'codigos', 'codigosDireccion', 'invitaciones', 'ajustesApp'].includes(col)) return;
        S.erroresLectura = S.erroresLectura || {}; S.erroresLectura[col] = nube.explicar(e);
        error(errorVisible()); pintarTodo();
      }, donde(col)));
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
    $('personaLista').innerHTML = porArea(p.prueba ? p.rol : '');
    $('cuentaPropia').hidden = !p.real;
    if (p.real) $('cuentaPropiaTxt').textContent = `${p.nombre} · ${p.correo} · ${p.rolTxt}. Si tocas una persona de prueba, sales de tu cuenta.`;
    // El panel solo sale con cuentas propias: las personas de prueba tienen la clave pública.
    $('ajustesGente').hidden = !(p.real && p.rol === 'jefe');
    if (!hayPrueba()) $('personaLista').innerHTML = '';
    $('permNombre').textContent = p.nombre;
    $('permTabla').innerHTML = MODULOS.map(m => `<div><span>${esH(m.n)}</span>${pill(window.DEMO.PERMISO_TXT[permiso(m.k)], permiso(m.k) === 'no' ? 'none' : 's-disco')}</div>`).join('') +
      window.DEMO.EXTRAS.filter(e => tieneExtra(e.id)).map(e => `<div><span>Permiso extra</span>${pill(e.txt, 's-disco', 'check')}</div>`).join('');
    // Reiniciar los datos es para presentar: solo con la Jefe de prueba (no con cuentas propias).
    $('ajustesJefe').hidden = !(p.rol === 'jefe' && p.prueba);
    pintarAvisosTel();
    abrirHoja('shPersona');
  }

  /* ---------- avisos al teléfono ---------- */
  const TXT_PUSH = {
    'no-soportado': 'Este navegador no permite avisos. Usa Chrome en Android o en el computador.',
    'sin-configurar': 'Los avisos al teléfono todavía no están conectados (falta el servidor de avisos). Mientras tanto llegan a la campana.',
    'necesita-instalar': 'En iPhone primero instala la app: toca Compartir, luego Agregar a inicio, y ábrela desde el ícono.',
    'negado': 'Los avisos están bloqueados en este navegador. Actívalos en los ajustes, en Notificaciones de este sitio.',
    'activo': 'Activos: a este teléfono le llega lo que le toca a',
    'inactivo': 'Apagados: lo que te toque solo llega a la campana de la app.'
  };
  const estadoPush = () => (window.Push ? Push.estado() : 'no-soportado');
  function pintarAvisosTel() {
    const e = estadoPush(), p = S.persona;
    $('avisosTelTxt').textContent = e === 'activo' ? `${TXT_PUSH.activo} ${p.nombre}.` : TXT_PUSH[e] || '';
    $('avisosTelBtns').innerHTML = e === 'inactivo' ? `<button class="btn small primary" type="button" data-push="activar">${ico('campana')}Activar avisos</button>`
      : e === 'activo' ? `<button class="btn small" type="button" data-push="probar">${ico('enviar')}Mandarme uno de prueba</button><button class="btn small ghost" type="button" data-push="apagar">${ico('campanaNo')}Apagar</button>` : '';
  }
  function pintarAvisoActivar() {
    let oculto = false; try { oculto = localStorage.getItem('demo_avisos_no') === '1'; } catch (e) {}
    $('avisoActivar').hidden = !S.persona || oculto || estadoPush() !== 'inactivo';
  }
  async function accionPush(que, boton) {
    if (boton) boton.disabled = true;
    try {
      if (que === 'activar') {
        const r = await Push.activar(S.persona.rol);
        toast(r.ok ? 'Listo: avisos activados en este teléfono' : r.motivo);
      } else if (que === 'apagar') {
        const r = await Push.desactivar(); toast(r.ok ? 'Avisos apagados en este teléfono' : r.motivo);
      } else if (que === 'probar') {
        const mias = S.datos.suscripciones.filter(x => x.rol === S.persona.rol);
        const r = await Push.enviar(mias, { titulo: 'Aviso de prueba', texto: `Así le llega un aviso a ${S.persona.nombre}.`, url: './', etiqueta: 'prueba' });
        toast(r.ok && r.enviados ? 'Listo: aviso de prueba enviado' : 'No se pudo mandar el aviso de prueba. Revisa la conexión del servidor de avisos.');
      }
    } finally { if (boton) boton.disabled = false; pintarAvisosTel(); pintarAvisoActivar(); }
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
  const cargando = col => S.suscritas.has(col) && !S.llegaron.has(col);

  // Cuenta lo pendiente de cada módulo para la persona que tiene la sesión.
  function pendientes() {
    const d = S.datos, p = S.persona, rol = p ? p.rol : '';
    const inv = window.Inventario.resumen(rol);
    const veh = window.Vehiculos.resumen();
    const eq = window.Equipos.resumen();
    const docsPorVencer = veh.docs, novedades = veh.novedades;
    const reu = window.Reuniones.resumen();
    const recibidos = d.equipos.filter(e => e.estado === 'recibido').length;
    const proximas = d.reuniones.filter(r => r.estado === 'programada' || r.estado === 'reprogramada').length;
    return { inv, reu, veh, eq, docsPorVencer, novedades, recibidos, proximas };
  }

  function pintarInicio() {
    const p = S.persona; if (!p) return;
    $('tInicio').textContent = `Hola, ${p.nombre.split(' ')[0]}`;
    $('inicioSub').textContent = p.cargo && p.cargo !== p.rolTxt ? `${p.cargo} · ${p.rolTxt}` : p.rolTxt;
    const n = pendientes();
    const todas = [
      { mod: 'inventario', k: 'i-bod', n: n.inv.faltan, lbl: 'Artículos agotados o bajos', icono: 'caja', tono: 'peligro', roles: ['gerente', 'jefe', 'asistente'] },
      { mod: 'inventario', k: 'i-ent', n: n.inv.porEntregar, lbl: 'Pedidos de material por entregar', icono: 'entrega', tono: 'listo', roles: ['jefe', 'asistente'] },
      { mod: 'inventario', k: 'i-aut', n: n.inv.porAutorizarMias, lbl: 'Compras que te toca autorizar', icono: 'carrito', tono: 'org', roles: ['gerente', 'jefe'] },
      { mod: 'inventario', k: 'i-com', n: n.inv.porComprar, lbl: 'Compras autorizadas por hacer', icono: 'carrito', tono: 'listo', roles: ['compras'] },
      { mod: 'inventario', k: 'i-cur', n: n.inv.enCurso, lbl: 'Compras en curso', icono: 'carrito', tono: 'listo', roles: ['gerente'] },
      { mod: 'inventario', k: 'i-sin', n: n.inv.sinAutorizar, lbl: 'Compras sin autorizar', icono: 'aviso', tono: 'peligro', roles: ['gerente', 'jefe', 'compras'] },
      { mod: 'inventario', k: 'i-mis', n: n.inv.misPedidos, lbl: 'Tus pedidos de material en espera', icono: 'caja', tono: 'listo', roles: () => permiso('inventario') === 'pide' },
      { mod: 'vehiculos', k: 'i-nov', n: n.novedades, lbl: 'Novedades de carros sin revisar', icono: 'carro', tono: 'org', roles: ['jefe', 'carros', 'asistente'] },
      { mod: 'vehiculos', k: 'i-via', n: n.veh.mias, lbl: 'Viajes por registrar', icono: 'llave', tono: 'listo', roles: ['conductor'] },
      { mod: 'vehiculos', k: 'i-doc', n: n.docsPorVencer, lbl: 'SOAT o técnico-mecánica por vencer o vencidos', icono: 'calendario', tono: 'peligro', roles: ['gerente', 'jefe', 'carros', 'asistente'] },
      { mod: 'reuniones', k: 'i-reu', n: n.reu.conPend, lbl: 'Reuniones con algo pendiente', icono: 'reunion', tono: 'org', roles: ['jefe'] },
      { mod: 'reuniones', k: 'i-act', n: n.reu.actas, lbl: 'Actas por registrar', icono: 'hojas', tono: 'peligro', roles: ['jefe', 'administrativo'] },
      { mod: 'reuniones', k: 'i-rmi', n: n.reu.mias, lbl: 'Tareas de reuniones para ti', icono: 'reunion', tono: 'listo', roles: ['compras', 'asistente', 'carros', 'conductor', 'logistica', 'profesional'] },
      { mod: 'reuniones', k: 'i-prox', n: n.reu.proximas, lbl: 'Próximas reuniones', icono: 'calendario', tono: 'listo', roles: ['gerente', 'logistica', 'profesional', 'administrativo'] },
      { mod: 'equipos', k: 'i-rec', n: n.recibidos, lbl: 'Equipos en Recibidos', icono: 'recibidos', tono: 'listo', roles: ['jefe', 'equipos'] },
      { mod: 'equipos', k: 'i-eac', n: n.eq.actas, lbl: 'Actas de equipos por revisar', icono: 'hojas', tono: 'org', roles: ['jefe', 'soporte', 'gerente'] },
      { mod: 'equipos', k: 'i-eta', n: n.eq.tareas, lbl: 'Mantenimientos y backups programados', icono: 'mantenimiento', tono: n.eq.atrasadas ? 'peligro' : 'listo', roles: ['equipos', 'soporte'] }
    ].filter(c => (typeof c.roles === 'function' ? c.roles() : c.roles.includes(p.rol)) && puedeVer(c.mod));
    const sum = $('sumInicio');
    const algoCargando = ['equipos', 'compras', 'articulos', 'solicitudes', 'vehiculos', 'reuniones'].some(cargando);
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
    const enfocada = el.contains(document.activeElement) ? document.activeElement.dataset.filtro : null;
    el.innerHTML = cifras.map(c => UI.cifra(Object.assign({ activo: S.filtro[mod] === c.filtro }, c))).join('');
    if (enfocada != null) { const b = el.querySelector(`[data-filtro="${CSS.escape(enfocada)}"]`); if (b) b.focus({ preventScroll: true }); }
    el.dataset.mod = mod;
    UI.contar(el);
  }
  /* ---------- avisos (campana) ---------- */
  const misAvisos = () => {
    const rol = S.persona ? S.persona.rol : '';
    // Los avisos del inventario van a la función de cada quien (bodega, compras, jefe, gerente), que sale de su nivel y no solo de su rol.
    const fn = window.Inventario ? window.Inventario.funcion() : '';
    // Bodega con el permiso extra «compra» también recibe los avisos de Compras.
    return S.datos.avisos.filter(a => a.para === rol || a.para === 'todos' || (fn && a.para === fn) || (a.para === 'compras' && rol === 'asistente' && tieneExtra('compra'))).sort((a, b) => String(b.en).localeCompare(String(a.en)));
  };
  // Cada persona marca SUS avisos como leídos (la marca es su id de cuenta), aunque haya varias personas con el mismo rol.
  const yo = () => nube.uid();
  const noLeidos = () => { const u = yo(); return misAvisos().filter(a => !(a.leido && a.leido[u])); };
  const ICO_MOD = { equipos: 'equipos', inventario: 'caja', compras: 'carrito', vehiculos: 'carro', reuniones: 'reunion', inicio: 'campana' };
  function pintarAvisos() {
    const n = noLeidos().length;
    UI.insignia($('badgeAvisos'), n);
    $('btnAvisos').setAttribute('aria-label', n ? `Avisos, ${n} sin leer` : 'Avisos');
    if ($('shAvisos').hidden) return;
    const lst = misAvisos(), u = yo();
    $('shAvisosSub').textContent = lst.length ? `Avisos para ${S.persona.nombre} (${S.persona.rolTxt}).` : '';
    $('avisosLista').innerHTML = lst.length ? lst.map(a => {
      const nuevo = S.vistos.has(a.id) || !(a.leido && a.leido[u]);
      return `<div class="card aviso-it ${nuevo ? 'nuevo' : ''}"><span class="ico">${ico(ICO_MOD[a.modulo] || 'campana')}</span>
        <span class="ai-t"><b>${esH(a.titulo)}</b><span>${esH(a.texto)}</span><span class="meta">${esH(hace(a.en))}</span></span>
        ${nuevo ? '<span class="punto" aria-hidden="true"></span><span class="sr">Nuevo</span>' : ''}</div>`;
    }).join('') : UI.vacio('campana', 'Sin avisos', 'Aquí llegan los avisos de los módulos que te tocan.');
  }
  async function abrirAvisos() {
    // Al abrir la campana se marcan como leídos (los puntos se ven en esta apertura y se van en la siguiente).
    const u = yo(), pend = noLeidos();
    S.vistos = new Set(pend.map(a => a.id));
    abrirHoja('shAvisos');
    pintarAvisos();
    if (!u) return;
    try { await Promise.all(pend.map(a => nube.mezclar('avisos', a.id, { leido: { [u]: true } }))); }
    catch (e) { toast(nube.explicar(e)); }
  }

  /* ---------- insignias de las pestañas ---------- */
  function pintarInsignias() {
    const n = pendientes(), rol = S.persona ? S.persona.rol : '';
    const b = {
      equipos: n.eq.mias,
      inventario: n.inv.mias,
      vehiculos: n.veh.mias,
      reuniones: rol === 'jefe' ? n.reu.conPend : n.reu.mias
    };
    Object.entries(b).forEach(([k, v]) => UI.insignia(document.querySelector(`[data-badge="${k}"]`), puedeVer(k) ? v : 0));
  }

  function pintarTodo() {
    if (!S.persona) return;
    pintarInsignias();
    pintarAvisos();
    ({ inicio: pintarInicio, equipos: () => window.Equipos.pintar(), inventario: () => window.Inventario.pintar(), vehiculos: () => window.Vehiculos.pintar(), reuniones: () => window.Reuniones.pintar() })[S.vista]();
    if (window.Gente) window.Gente.pintar();
  }

  /* ---------- versión pagada ---------- */
  const PAGADA = {
    entrada: ['Entrada y permisos', 'Personas de prueba para mostrar cada rol en vivo, y cuentas propias que se crean con el código del rol.', 'Solo cuentas propias: cada persona entra con su correo y su clave, y el código de su rol decide qué ve. Sin personas de prueba públicas.'],
    inicio: ['La app completa', 'Gratis, con datos de prueba. Los avisos llegan a la campana y al teléfono.', 'Unos USD 20 a 28 al mes: el agente lee el correo real, cuentas con el correo de cada persona y fotos en un almacenamiento aparte.'],
    equipos: ['Equipos', 'Las fotos de las hojas se guardan comprimidas dentro de la base de datos.', 'Las fotos van a un almacenamiento aparte (Cloud Storage): más calidad y la base no se llena.'],
    inventario: ['Inventario y compras', 'Todo funciona: pedir, autorizar, comprar con foto de la factura, recibir, entregar y contar. Avisos a la campana y al teléfono.', 'Las fotos de facturas van a un almacenamiento aparte (más calidad y la base no se llena), avisos también por correo o Teams, y cuentas con el correo real de cada persona.'],
    vehiculos: ['Vehículos', 'Los vencimientos del SOAT y la técnico-mecánica se ven en rojo y amarillo dentro de la app.', 'Avisos automáticos al teléfono antes de que venza el SOAT o la revisión.'],
    reuniones: ['Reuniones y agente', 'Correos de ejemplo pegados en la app; Gemini gratis los lee.', 'El agente lee solo el buzón real de Outlook, con n8n y el permiso de TI.'],
    avisos: ['Avisos', 'La campana dentro de la app y notificaciones al teléfono (gratis, con un servidor pequeño de Cloudflare).', 'Además, avisos por correo o por Teams.']
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
      if (S.persona && S.persona.prueba && b.dataset.rol === S.persona.rol) { cerrarHoja('shPersona'); return; }
      entrarComo(b.dataset.rol, b);
    });
    $('btnPersona').onclick = abrirPersona;
    $('btnAvisos').onclick = abrirAvisos;
    $('btnSalir').onclick = async () => { cerrarHoja('shPersona'); await nube.salir(); };
    $('btnGente').onclick = () => { cerrarHoja('shPersona'); window.Gente.abrir(); };
    $('entradaModo').addEventListener('click', e => { const b = e.target.closest('[data-modo]'); if (!b) return; modoEntrada = b.dataset.modo; $('entradaErr').hidden = true; pintarModoEntrada(); });
    $('ctCambiar').onclick = () => { modoCuenta = modoCuenta === 'crear' ? 'entrar' : 'crear'; $('ctErr').hidden = true; pintarModoEntrada(); };
    $('ctForm').addEventListener('submit', e => { e.preventDefault(); enviarCuenta(); });
    $('cuentaForm').addEventListener('submit', e => { e.preventDefault(); guardarCodigo(); });
    $('cuSalir').onclick = () => nube.salir();
    $('ctGoogle').onclick = async () => {
      if (S.entrando) return;
      S.entrando = true; $('ctErr').hidden = true; $('ctGoogle').disabled = true;
      try { await nube.entrarGoogle(); }
      catch (e) { $('ctErr').textContent = nube.explicar(e); $('ctErr').hidden = false; }
      finally { S.entrando = false; $('ctGoogle').disabled = false; }
    };
    $('ctOlvide').onclick = async () => {
      const correo = $('ctCorreo').value.trim(), err = $('ctErr');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { err.textContent = 'Escribe tu correo arriba y toca otra vez «Olvidé mi clave».'; err.hidden = false; $('ctCorreo').focus(); return; }
      err.hidden = true;
      // Por seguridad la respuesta es la misma exista o no la cuenta (no se revela quién tiene cuenta).
      try { await nube.recuperarClave(correo); toast(`Si ${correo} tiene cuenta, le llegó un correo para poner una clave nueva.`); }
      catch (e) { if (e && ['auth/too-many-requests', 'auth/network-request-failed', 'sin-sdk'].includes(e.code)) { err.textContent = nube.explicar(e); err.hidden = false; } else toast(`Si ${correo} tiene cuenta, le llegó un correo para poner una clave nueva.`); }
    };
    $('cuReenviar').onclick = async () => {
      const b = $('cuReenviar'), e = $('cuConfErr'); b.disabled = true; e.hidden = true;
      try { await nube.reenviarConfirmacion(); toast('Listo: te mandamos otro correo.'); }
      catch (er) { e.textContent = nube.explicar(er); e.hidden = false; }
      finally { setTimeout(() => { b.disabled = false; }, 15000); }   // Firebase frena los reenvíos seguidos
    };
    $('cuYa').onclick = async () => {
      const b = $('cuYa'), e = $('cuConfErr'); b.disabled = true; e.hidden = true;
      try { if (!(await nube.yaConfirme())) { e.textContent = 'Todavía no aparece confirmado. Toca el enlace del correo y vuelve a tocar este botón.'; e.hidden = false; } }
      catch (er) { e.textContent = nube.explicar(er); e.hidden = false; }
      finally { b.disabled = false; }
    };
    $('btnReiniciar').onclick = async () => {
      if (S.persona.rol !== 'jefe' || !S.persona.prueba) return;
      const ok = await confirmar('¿Reiniciar los datos de prueba?', 'Se borra todo lo que se haya cambiado en la demo (para todas las personas) y vuelven los datos de ejemplo con las fechas de hoy. No se puede deshacer.', 'Reiniciar');
      if (!ok) return;
      const b = $('btnReiniciar'); b.disabled = true;
      // Mientras se reinicia no se deja cambiar de persona: con Firebase real, lo que la persona anterior no alcanzó a enviar se queda esperando hasta que ella vuelva a entrar.
      S.entrando = true; document.querySelectorAll('#personaLista .persona-card').forEach(x => x.setAttribute('aria-disabled', 'true'));
      try { await nube.sembrar(true, S.persona.rol); S.errorFijo = ''; error(''); toast('Listo: datos de prueba reiniciados'); cerrarHoja('shPersona'); }
      catch (e) { toast(nube.explicar(e)); }
      finally { b.disabled = false; S.entrando = false; document.querySelectorAll('#personaLista .persona-card').forEach(x => x.removeAttribute('aria-disabled')); }
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
    document.addEventListener('click', e => {
      const p = e.target.closest('[data-pagada]'); if (p) { abrirPagada(p.dataset.pagada); return; }
      if (e.target.closest('[data-cerrar]')) { const bd = e.target.closest('.backdrop'); if (bd) bd.hidden = true; return; }
      // Tocar el fondo oscuro cierra la hoja (salvo la confirmación, que se responde con un botón).
      if (e.target.classList && e.target.classList.contains('backdrop') && !e.target.classList.contains('confirm')) e.target.hidden = true;
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarArriba(); });
    $('btnReintentar').onclick = () => location.reload();
    $('avisosTelBtns').addEventListener('click', e => { const b = e.target.closest('[data-push]'); if (b) accionPush(b.dataset.push, b); });
    $('btnActivarSi').onclick = e => accionPush('activar', e.currentTarget);
    $('btnActivarNo').onclick = () => { try { localStorage.setItem('demo_avisos_no', '1'); } catch (e) {} pintarAvisoActivar(); };
    const red = () => { $('avisoOff').hidden = navigator.onLine !== false; };
    addEventListener('online', red); addEventListener('offline', red); red();
  }

  /* ---------- ayudas para inventario.js ---------- */
  window.App = Object.freeze({
    S, $, esH, pill, cop, hace, fechaCorta, hoyISO, toast, permiso, tieneExtra, tablero, cargando, iniciales, montoGerente,
    abrirHoja, cerrarHoja, confirmar, pintarTodo, diasHasta
  });

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
