/* reuniones.js — Módulo Reuniones de la demo.
   Un correo llega (en la demo, la Jefe toca «Llegó este correo») → el agente (Worker agente-demo con Gemini) lo lee
   → la Jefe revisa lo que entendió y confirma → se reparten las tareas, cada una en «necesidades»:
     refrigerios y almuerzo -> Compras autoriza          carros -> Transporte autoriza y escoge conductor
     viaje -> el Conductor confirma                      logistica -> Logística marca lo alistado
     asistencia -> el Profesional confirma si va         acta -> Administrativo registra el acta (el día de la reunión o después)
   Si el agente no está conectado o falla, se usa la respuesta de respaldo del correo (correos-demo.js).
   La Jefe puede hacer cualquier paso; el Gerente ve todo a detalle sin botones. */
(function () {
  'use strict';
  const A = () => window.App;
  const $ = id => document.getElementById(id);
  const esH = v => A().esH(v);
  const D = () => A().S.datos;
  const persona = () => A().S.persona;
  const miRol = () => (persona() ? persona().rol : '');
  const perm = () => A().permiso('reuniones');
  const esJefe = () => perm() === 'jefe';
  const esGerente = () => miRol() === 'gerente';
  const puedoHacer = rol => miRol() === rol || esJefe();
  const ahora = () => new Date().toISOString();
  const num = v => Number(v) || 0;
  const ITEMS_LOG = () => window.DatosDemo.ITEMS_LOG;
  const CONDUCTORES = ['Carlos Pinto', 'Rafael Ospino', 'Hernán Brito'];
  const ACTIVA = ['programada', 'reprogramada'];
  const EST_RE = { programada: ['Programada', 's-listo', 'listo'], reprogramada: ['Reprogramada', 's-org', 'org'], cancelada: ['Cancelada', 's-peligro', 'peligro'], realizada: ['Realizada', 's-disco', 'disco'] };
  const TIPO = {
    refrigerios: ['Refrigerios', 'bolsa'], almuerzo: ['Almuerzo', 'bolsa'], carros: ['Carros', 'carro'], viaje: ['Viaje', 'carro'],
    logistica: ['Logística', 'tarea'], asistencia: ['Asistencia', 'persona'], acta: ['Acta y formato diario', 'hojas']
  };
  const EST_NE = { pendiente: ['Pendiente', 's-org'], autorizado: ['Autorizado', 's-disco'], listo: ['Listo', 's-disco'], rechazado: ['Rechazado', 's-peligro'], 'no-va': ['No puede', 's-peligro'], cancelado: ['Cancelado', 'none'] };
  const HECHO = ['autorizado', 'listo', 'cancelado'];
  let seccion = '', rolPintado = '', guardando = false, accion = null, pushPendientes = [], fotoActa = '';

  /* ---------- datos derivados ---------- */
  const reunionPorId = id => D().reuniones.find(r => r.id === id) || null;
  const necDe = id => D().necesidades.filter(n => n.reunionId === id);
  const hoy = () => A().hoyISO();
  const yaPaso = r => String(r.fecha) <= hoy();
  const nombreRol = rol => { const p = window.DEMO.porRol(rol), r = window.DEMO.rolDe(rol); return persona() && persona().prueba && p ? p.corto : (r ? r.rolTxt : rol); };
  const ordenFecha = (a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.hora).localeCompare(String(b.hora));
  /** Una necesidad es tarea ahora si está pendiente, su reunión sigue activa, y (si es el acta) la reunión ya fue. */
  function esTarea(n) {
    const r = reunionPorId(n.reunionId);
    if (!r || !ACTIVA.includes(r.estado) || n.estado !== 'pendiente') return false;
    return n.tipo !== 'acta' || yaPaso(r);
  }
  const tareas = () => D().necesidades.filter(esTarea).sort((a, b) => ordenFecha(reunionPorId(a.reunionId), reunionPorId(b.reunionId)));
  function progreso(r) {
    const ns = necDe(r.id).filter(n => n.estado !== 'cancelado' && n.tipo !== 'acta' && !(n.tipo === 'viaje' && n.estado === 'no-va'));
    return { hechas: ns.filter(n => HECHO.includes(n.estado)).length, total: ns.length };
  }
  /** Números para Inicio y para la insignia de la pestaña. */
  function resumen() {
    const rs = D().reuniones, ts = tareas();
    return {
      proximas: rs.filter(r => ACTIVA.includes(r.estado) && !yaPaso(r)).length,
      conPend: rs.filter(r => ACTIVA.includes(r.estado) && ts.some(t => t.reunionId === r.id)).length,
      actas: ts.filter(t => t.tipo === 'acta').length,
      mias: ts.filter(t => t.responsableRol === miRol()).length
    };
  }

  /* ---------- pintar ---------- */
  function secciones() {
    if (esGerente()) return [['resumen', 'Resumen'], ['proximas', 'Próximas'], ['pasadas', 'Realizadas y canceladas']];
    const s = [['hacer', 'Lo que me toca'], ['proximas', 'Próximas'], ['pasadas', 'Realizadas y canceladas']];
    if (esJefe()) s.splice(1, 0, ['correos', 'Correos']), s.push(['resumen', 'Resumen']);
    return s;
  }
  function pintar() {
    const App = A(), S = App.S;
    if (!S.persona) return;
    if (rolPintado !== S.persona.rol) { rolPintado = S.persona.rol; seccion = secciones()[0][0]; }
    const f = S.filtro.reuniones;
    if (f === 'proximas' || f === 'realizada') seccion = f === 'proximas' ? 'proximas' : 'pasadas';
    if (f === 'pendiente' || f === 'actas') seccion = esGerente() ? 'resumen' : 'hacer';
    if (!secciones().some(x => x[0] === seccion)) seccion = secciones()[0][0];
    const rs = D().reuniones, n = resumen();
    App.tablero('reuniones', [
      { k: 'r-prox', n: n.proximas, lbl: 'Próximas', icono: 'calendario', tono: 'listo', filtro: 'proximas' },
      { k: 'r-pend', n: n.conPend, lbl: 'Con algo pendiente', icono: 'reloj', tono: 'org', filtro: 'pendiente' },
      { k: 'r-acta', n: n.actas, lbl: 'Actas por registrar', icono: 'hojas', tono: 'peligro', filtro: 'actas' },
      { k: 'r-hech', n: rs.filter(r => r.estado === 'realizada').length, lbl: 'Realizadas', icono: 'checkCirculo', tono: 'disco', filtro: 'realizada' }
    ]);
    $('reuSecciones').innerHTML = secciones().map(([k, t]) => `<button type="button" class="chip" data-sec="${k}" aria-pressed="${seccion === k}">${esH(t)}${k === 'hacer' && n.mias ? ` <span class="n">${n.mias}</span>` : ''}</button>`).join('');
    const c = $('reuContenido');
    if (['reuniones', 'necesidades'].some(App.cargando)) { c.innerHTML = UI.esqueleto(3); return; }
    c.innerHTML = ({ hacer: () => htmlTareas(f), correos: htmlCorreos, proximas: () => htmlLista(true), pasadas: () => htmlLista(false), resumen: htmlResumen })[seccion]();
    window.llenarIconos(c);
  }
  const boton = (acc, txt, icono, id, clase) => `<button class="btn ${clase || 'small'}" type="button" data-accion="${acc}" data-id="${esH(id)}">${icono ? `<span data-ico="${icono}"></span>` : ''}${esH(txt)}</button>`;
  const cuando = r => { const d = Math.round((new Date(r.fecha + 'T12:00:00') - new Date(hoy() + 'T12:00:00')) / 86400000); return d === 0 ? 'hoy' : d === 1 ? 'mañana' : d === -1 ? 'ayer' : d > 0 ? `en ${d} días` : `hace ${-d} días`; };
  const hora12 = h => { const m = /^(\d{1,2}):(\d{2})/.exec(String(h || '')); if (!m) return ''; const x = +m[1]; return `${((x + 11) % 12) + 1}:${m[2]} ${x < 12 ? 'a. m.' : 'p. m.'}`; };
  const fechaTxt = r => `${A().fechaCorta(r.fecha)}${r.hora ? ', ' + hora12(r.hora) : ''} (${cuando(r)})`;

  /* --- Lo que me toca --- */
  function htmlTareas(f) {
    let lista = tareas();
    if (f === 'actas') lista = lista.filter(t => t.tipo === 'acta');
    const mias = lista.filter(t => t.responsableRol === miRol()), otras = lista.filter(t => t.responsableRol !== miRol());
    let h = '';
    if (esJefe()) {
      const orden = ['compras', 'carros', 'conductor', 'logistica', 'profesional', 'administrativo'];
      const grupos = {};
      lista.forEach(t => { (grupos[t.responsableRol] = grupos[t.responsableRol] || []).push(t); });
      if (lista.length) h += '<p class="meta">Como Jefe puedes hacer cualquier paso aunque le toque a otra persona.</p>';
      h += Object.keys(grupos).sort((a, b) => orden.indexOf(a) - orden.indexOf(b)).map(rol =>
        `<div class="section-label">Le toca a ${esH(nombreRol(rol))} (${grupos[rol].length})</div><div class="list">${grupos[rol].map(tarjeta).join('')}</div>`).join('');
      return h || UI.vacio('checkCirculo', 'Nada pendiente', 'Todas las reuniones están al día. Cuando llegue un correo, revísalo en «Correos».');
    }
    h += `<div class="section-label">Te toca a ti (${mias.length})</div>`;
    h += mias.length ? `<div class="list">${mias.map(tarjeta).join('')}</div>` : UI.vacio('checkCirculo', 'Nada pendiente para ti', 'Cuando una reunión necesite algo de ti, aparece aquí con su botón y te llega un aviso.');
    if (otras.length && persona().rol !== 'profesional') h += `<div class="section-label">Le toca a otras personas (${otras.length})</div><div class="list">${otras.slice(0, 12).map(tarjeta).join('')}</div>`;
    return h;
  }
  function tarjeta(n) {
    const App = A(), r = reunionPorId(n.reunionId), puede = puedoHacer(n.responsableRol);
    const tt = TIPO[n.tipo] || [n.tipo, 'tarea'];
    let titulo = '', botones = '', extra = '';
    if (n.tipo === 'refrigerios' || n.tipo === 'almuerzo') { titulo = `Autorizar ${tt[0].toLowerCase()}`; botones = boton('autorizar', 'Autorizar', 'check', n.id, 'primary small') + boton('rechazar', 'Rechazar', '', n.id, 'ghost small'); }
    else if (n.tipo === 'carros') { titulo = 'Autorizar carros y escoger conductor'; botones = boton('carros', 'Autorizar y escoger conductor', 'carro', n.id, 'primary small') + boton('rechazar', 'Rechazar', '', n.id, 'ghost small'); }
    else if (n.tipo === 'viaje') { titulo = 'Confirmar el viaje'; extra = `<span class="meta">Conductor: ${esH(n.conductor || 'sin nombre')}</span>`; botones = boton('viajeok', 'Confirmo el viaje', 'check', n.id, 'primary small') + boton('nopuedo', 'No puedo', '', n.id, 'ghost small'); }
    else if (n.tipo === 'logistica') { const it = Array.isArray(n.items) ? n.items : []; titulo = 'Alistar la reunión'; extra = `<span class="meta">${it.filter(x => x && x.ok).length} de ${it.length} listos</span>`; botones = boton('logistica', 'Abrir la lista', 'tarea', n.id, 'primary small'); }
    else if (n.tipo === 'asistencia') { titulo = '¿Vas a la reunión?'; botones = boton('voy', 'Voy', 'check', n.id, 'primary small') + boton('nopuedo', 'No puedo', '', n.id, 'ghost small'); }
    else if (n.tipo === 'acta') { titulo = 'Registrar el acta y el formato diario'; botones = boton('acta', 'Registrar acta', 'hojas', n.id, 'primary small'); }
    if (n.motivo) extra += `<span class="meta">Nota: ${esH(n.motivo)}</span>`;
    const pie = puede ? botones : App.pill('Le toca a ' + nombreRol(n.responsableRol), 'none', 'persona');
    return `<div class="card tarea st-org">
      <div class="tarea-cab"><span class="ico t-org" aria-hidden="true">${window.ico(tt[1])}</span>
        <div class="tarea-t"><b>${esH(titulo)}: ${esH(r ? r.comunidad : n.comunidad)}</b><span class="meta">${esH([n.detalle, r ? fechaTxt(r) : '', r && r.lugar].filter(Boolean).join(' · '))}</span></div></div>
      ${extra}
      <div class="tarea-pie">${pie}${boton('ver', 'Ver reunión', '', n.reunionId, 'ghost small')}</div>
    </div>`;
  }

  /* --- Lista de reuniones --- */
  function htmlLista(proximas) {
    const App = A();
    const todas = D().reuniones.filter(r => proximas ? ACTIVA.includes(r.estado) : !ACTIVA.includes(r.estado));
    todas.sort(proximas ? ordenFecha : (a, b) => ordenFecha(b, a));
    if (!todas.length) return UI.vacio('calendario', proximas ? 'No hay reuniones próximas' : 'Todavía no hay reuniones realizadas ni canceladas', proximas && esJefe() ? 'Cuando llegue un correo de reunión, revísalo en «Correos».' : '');
    return `<div class="list">${todas.map(r => {
      const st = EST_RE[r.estado] || ['Sin estado', 'none', 'pend'], p = progreso(r), acta = necDe(r.id).find(n => n.tipo === 'acta');
      const faltaActa = ACTIVA.includes(r.estado) && yaPaso(r) && acta && acta.estado === 'pendiente';
      const pct = p.total ? Math.round(p.hechas / p.total * 100) : 0;
      return `<button type="button" class="card reu st-${st[2]}" data-accion="ver" data-id="${esH(r.id)}">
        <span class="card-head"><span class="card-title">${esH(r.comunidad)}</span>${App.pill(st[0], st[1])}</span>
        <span class="card-sub">${esH(fechaTxt(r))} · ${r.lugar ? esH(r.lugar) : '<b class="t-falta">Falta el lugar</b>'}</span>
        ${ACTIVA.includes(r.estado) ? `<span class="nivel"><span class="barra n-${p.hechas === p.total ? 'bien' : 'bajo'}" role="img" aria-label="${esH(`${p.hechas} de ${p.total} tareas listas`)}"><i style="width:${pct}%"></i></span><span class="meta">${p.hechas} de ${p.total} tareas listas · ${num(r.asistentes)} personas</span></span>` : `<span class="meta">${num(r.asistentes)} personas esperadas</span>`}
        <span class="docs">${necDe(r.id).filter(n => n.tipo !== 'acta' && n.estado !== 'cancelado').map(n => App.pill((TIPO[n.tipo] || [n.tipo])[0], HECHO.includes(n.estado) ? 's-disco' : ['rechazado', 'no-va'].includes(n.estado) ? 's-peligro' : 's-pend', HECHO.includes(n.estado) ? 'check' : '')).join('')}${faltaActa ? App.pill('Falta el acta', 's-peligro', 'aviso') : ''}${r.estado === 'realizada' ? App.pill('Acta registrada', 's-disco', 'hojas') : ''}</span>
      </button>`;
    }).join('')}</div>`;
  }

  /* --- Correos (Jefe) --- */
  const correos = () => window.CorreosDemo.generar(new Date());
  const yaLlego = id => D().reuniones.some(r => Array.isArray(r.correos) && r.correos.includes(id));
  function htmlCorreos() {
    const App = A(), conectado = !!(window.AGENTE_DEMO && window.AGENTE_DEMO.url);
    let h = `<div class="note">En la versión pagada el agente lee solo el buzón de Outlook. Aquí toca «Llegó este correo» para simular que llegó: el agente lo lee, tú revisas lo que entendió y se reparten las tareas.</div>`;
    h += App.pill(conectado ? 'Agente conectado (Gemini)' : 'Agente sin conectar: se usa la respuesta de respaldo', conectado ? 's-disco' : 's-pend', conectado ? 'check' : 'info');
    h += `<div class="list">${correos().map((c, k) => `<div class="card correo">
      <span class="card-head"><span class="card-title">${k + 1}. ${esH(c.etiqueta)}</span>${yaLlego(c.id) ? App.pill('Ya llegó', 's-disco', 'check') : ''}</span>
      <span class="meta"><b>${esH(c.de)}</b> · ${esH(c.asunto)}</span>
      <span class="correo-prev">${esH(c.texto.split('\n').filter(Boolean)[1] || '')}</span>
      <div class="tarea-pie">${boton('correo', 'Llegó este correo', 'correo', c.id, 'primary small')}</div>
    </div>`).join('')}</div>`;
    return h;
  }

  /* --- Resumen (Jefe y Gerente) --- */
  function htmlResumen() {
    const App = A(), ts = tareas(), rs = D().reuniones, n = resumen();
    const orden = ['compras', 'carros', 'conductor', 'logistica', 'profesional', 'administrativo'];
    const porRol = orden.map(rol => [nombreRol(rol), ts.filter(t => t.responsableRol === rol).length]).filter(x => x[1] > 0);
    const max = Math.max(1, ...porRol.map(x => x[1]));
    const delMes = rs.filter(r => r.estado === 'realizada' && String(r.fecha).slice(0, 7) === hoy().slice(0, 7));
    const asistentes = delMes.reduce((s, r) => { const a = necDe(r.id).find(x => x.tipo === 'acta'); return s + num(a && a.acta && a.acta.asistentes); }, 0);
    let h = `<div class="resumen-grid">
      <div class="card"><span class="meta">Reuniones próximas</span><span class="rm-n">${n.proximas}</span><span class="meta">${n.conPend} con algo pendiente</span></div>
      <div class="card"><span class="meta">Realizadas este mes</span><span class="rm-n">${delMes.length}</span><span class="meta">${asistentes} asistentes en las actas</span></div>
      <div class="card"><span class="meta">Actas por registrar</span><span class="rm-n">${n.actas}</span>${n.actas ? App.pill('Le toca a ' + nombreRol('administrativo'), 's-peligro', 'aviso') : App.pill('Al día', 's-disco', 'check')}</div>
    </div>`;
    h += `<div class="section-label">Tareas pendientes por persona</div><div class="card">${porRol.length ? `<div class="barras">${porRol.map(([t, v]) => `<div class="bf"><span class="bf-n">${esH(t)}</span><span class="bf-b"><i style="width:${Math.max(4, Math.round(v / max * 100))}%"></i></span><span class="bf-v">${v}</span></div>`).join('')}</div>` : '<p class="meta">Nadie tiene tareas pendientes.</p>'}</div>`;
    h += `<div class="section-label">Próximas reuniones</div>` + htmlLista(true);
    return h;
  }

  /* ---------- hoja de acción ---------- */
  const campoTxt = (id, lbl, v, ph, max, tipo) => `<div class="field"><label for="${id}">${lbl}</label><input id="${id}" type="${tipo || 'text'}" maxlength="${max || 120}" autocomplete="off" value="${esH(v || '')}" placeholder="${esH(ph || '')}"></div>`;
  const campoNum = (id, lbl, v, min, max) => `<div class="field"><label for="${id}">${lbl}</label><input id="${id}" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${esH(v)}"></div>`;
  const campoSel = (id, lbl, ops, v) => `<div class="field"><label for="${id}">${lbl}</label><select id="${id}">${ops.map(([val, t]) => `<option value="${esH(val)}"${val === v ? ' selected' : ''}>${esH(t)}</option>`).join('')}</select></div>`;
  const marca = (id, lbl, ok) => `<label class="marca-fila"><input type="checkbox" id="${id}"${ok ? ' checked' : ''}><span>${esH(lbl)}</span></label>`;
  const valor = id => ($(id) ? $(id).value.trim() : '');
  const entero = id => { const v = valor(id); return /^\d+$/.test(v) ? Number(v) : NaN; };
  function fallar(msg, id) { const e = $('reErr'); e.textContent = msg; e.hidden = false; if (id && $(id)) $(id).focus(); return false; }
  function abrir(o) {
    accion = o;
    $('reT').textContent = o.titulo; $('reSub').textContent = o.sub || '';
    $('reCampos').innerHTML = o.campos || '';
    window.llenarIconos($('reCampos'));
    const pri = $('rePrimario'); pri.hidden = !o.primario; pri.disabled = false;
    pri.innerHTML = o.primario ? (o.icono ? window.ico(o.icono) : '') + esH(o.primario) : '';
    const sec = $('reSecundario'); sec.hidden = !o.secundario; sec.textContent = o.secundario || '';
    $('reCerrar').textContent = o.primario ? 'Cancelar' : 'Cerrar';
    $('reErr').hidden = true;
    A().abrirHoja('shReu');
    const sh = $('shReu').querySelector('.sheet'); if (sh) sh.scrollTop = 0;
  }
  function aviso(para, titulo, txt) {
    if (!para || para === miRol()) return null;
    pushPendientes.push({ para, titulo, texto: txt });
    return ['set', 'avisos', window.nube.idNuevo('av'), { para, titulo, texto: txt, en: ahora(), modulo: 'reuniones', leido: {} }];
  }
  const historial = r => (Array.isArray(r.historial) ? r.historial : []).filter(x => x && typeof x === 'object');
  const paso = (r, texto, por) => historial(r).concat([{ fecha: ahora(), texto, por: por || persona().nombre }]);
  const hecho = extra => Object.assign({ por: persona().nombre, en: ahora() }, extra || {});
  async function guardar() {
    if (guardando || !accion || !accion.ops) return;
    $('reErr').hidden = true;
    // Si la tarea o la reunión cambió mientras la hoja estaba abierta (otra persona actuó), no se escribe encima.
    if (accion.base) {
      const act = necPorId(accion.base.id);
      if (!act || !esTarea(act) || ['estado', 'cantidad', 'fechaReunion', 'conductor'].some(k => act[k] !== accion.base[k])) return fallar('Esa tarea cambió mientras la tenías abierta. Ciérrala y ábrela otra vez.');
    }
    if (accion.reunion) {
      const act = reunionPorId(accion.reunion.id);
      if (!act || !ACTIVA.includes(act.estado) || act.fecha !== accion.reunion.fecha || act.lugar !== accion.reunion.lugar || num(act.asistentes) !== num(accion.reunion.asistentes)) return fallar('La reunión cambió mientras revisabas. Toca otra vez «Llegó este correo».');
    }
    pushPendientes = [];
    const ops = accion.ops(); if (!ops) return;
    const lista = ops.filter(Boolean), envios = pushPendientes.slice();
    guardando = true; $('rePrimario').disabled = true; $('reSecundario').disabled = true;
    try {
      if (lista.length) await window.nube.lote(lista);
      A().cerrarHoja('shReu');
      try { $('reuContenido').focus({ preventScroll: true }); } catch (e) {}
      A().toast(accion.listo);
      accion = null;
      notificar(envios);
    } catch (e) { fallar(window.nube.explicar(e)); }
    finally { guardando = false; $('rePrimario').disabled = false; $('reSecundario').disabled = false; }
  }
  function notificar(envios) {
    if (!window.Push || !envios.length) return;
    const subs = A().S.datos.suscripciones || [];
    envios.forEach(e => {
      const destino = subs.filter(s => s.rol === e.para);
      if (destino.length) Promise.resolve(window.Push.enviar(destino, { titulo: e.titulo, texto: e.texto, url: './#reuniones', etiqueta: 'reuniones' })).catch(() => {});
    });
  }

  /* ---------- el agente ---------- */
  const normal = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const TIPOS_AGENTE = ['nueva', 'faltantes', 'reprograma', 'cancela', 'otro'];
  /** Limpia lo que devuelve el agente: nada raro entra a la base de datos aunque el modelo se equivoque. */
  function limpiar(x) {
    const o = x && typeof x === 'object' ? x : {};
    const txt = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(o.fecha) ? o.fecha : '';
    const hora = /^([01]\d|2[0-3]):[0-5]\d$/.test(o.hora) ? o.hora : '';
    const items = Array.isArray(o.logistica) ? ITEMS_LOG().filter(i => o.logistica.some(l => normal(l).includes(normal(i).split(' ')[0]))) : [];
    return {
      tipo: TIPOS_AGENTE.includes(o.tipo) ? o.tipo : 'otro', reunionId: txt(o.reunionId, 40), comunidad: txt(o.comunidad, 80), fecha, hora, lugar: txt(o.lugar, 120),
      asistentes: Math.max(0, Math.min(5000, Math.round(num(o.asistentes)))), refrigerios: o.refrigerios === true, almuerzo: o.almuerzo === true,
      carros: Math.max(0, Math.min(20, Math.round(num(o.carros)))), logistica: items,
      faltan: Array.isArray(o.faltan) ? o.faltan.map(f => txt(f, 30)).filter(Boolean).slice(0, 6) : [], motivo: txt(o.motivo, 200), resumen: txt(o.resumen, 400)
    };
  }
  /** Le pide al Worker agente-demo que lea el correo. Si no está conectado o falla, usa la respuesta de respaldo. */
  async function leerConAgente(c) {
    const cfg = window.AGENTE_DEMO || {};
    const activas = D().reuniones.filter(r => ACTIVA.includes(r.estado)).map(r => ({ id: r.id, comunidad: r.comunidad, fecha: r.fecha, hora: r.hora, lugar: r.lugar, estado: r.estado }));
    if (cfg.url) {
      try {
        const token = await window.nube.token();
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 25000);
        const r = await fetch(cfg.url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ correo: c.texto, asunto: c.asunto, hoy: hoy(), reuniones: activas }), signal: ctl.signal });
        clearTimeout(t);
        const j = await r.json().catch(() => null);
        if (r.ok && j && j.ok && j.reunion) return { datos: limpiar(j.reunion), fuente: 'gemini' };
      } catch (e) { /* se usa el respaldo */ }
    }
    return { datos: limpiar(c.respaldo), fuente: 'respaldo' };
  }
  function buscarReunion(d) {
    const activas = D().reuniones.filter(r => ACTIVA.includes(r.estado));
    return activas.find(r => r.id === d.reunionId) || activas.find(r => normal(r.comunidad) === normal(d.comunidad)) || null;
  }

  let lectura = 0;
  async function procesarCorreo(c) {
    const yo = ++lectura;
    abrir({ titulo: 'El agente está leyendo el correo…', sub: c.asunto, campos: `<div class="leyendo">${UI.esqueleto(2)}</div>` });
    const leyendo = accion;
    const { datos: d, fuente } = await leerConAgente(c);
    if (yo !== lectura || $('shReu').hidden || accion !== leyendo) return;   // la cerraron o abrieron otra cosa mientras leía
    const etiqueta = fuente === 'gemini' ? A().pill('Leído por Gemini', 's-disco', 'check') : A().pill('Respuesta de respaldo: el agente no está conectado o no respondió', 's-pend', 'info');
    const encabezado = `<div class="row">${etiqueta}</div><div class="card agente-res"><b>Lo que entendió</b><span>${esH(d.resumen || 'Sin resumen')}</span></div>
      <details class="correo-orig"><summary>Ver el correo</summary><pre>${esH(c.texto)}</pre></details>`;
    const r = d.tipo === 'nueva' ? null : buscarReunion(d);
    if (d.tipo === 'otro') return abrir({ titulo: 'Este correo no es de una reunión', sub: c.asunto, campos: encabezado });
    if (d.tipo === 'nueva') {
      const existe = D().reuniones.find(x => ACTIVA.includes(x.estado) && normal(x.comunidad) === normal(d.comunidad));
      if (existe) return abrir({ titulo: 'Esa reunión ya existe', sub: `Ya hay una reunión activa con la ${existe.comunidad}. Si quieres repetir la prueba, reinicia los datos de prueba.`, campos: encabezado });
      return confirmarNueva(c, d, encabezado, fuente);
    }
    if (!r) return abrir({ titulo: 'No encontré la reunión de este correo', sub: `No hay una reunión activa con la ${d.comunidad || 'comunidad del correo'}. Primero tiene que llegar el correo de la reunión nueva.`, campos: encabezado });
    if (d.tipo === 'faltantes') confirmarFaltantes(c, d, r, encabezado, fuente);
    else if (d.tipo === 'reprograma') confirmarReprograma(c, d, r, encabezado, fuente);
    else confirmarCancela(c, d, r, encabezado, fuente);
    accion.reunion = Object.assign({}, r);
  }
  const origen = f => (f === 'gemini' ? 'Agente (Gemini)' : 'Agente (respaldo)');
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  function confirmarNueva(c, d, encabezado, fuente) {
    abrir({
      titulo: 'Reunión nueva: revisa y reparte', sub: 'Corrige lo que haga falta antes de repartir. Lo vacío queda como «falta».',
      campos: encabezado + campoTxt('rcCom', 'Comunidad', d.comunidad, '', 80) +
        `<div class="fields cols">${campoTxt('rcFecha', 'Fecha', d.fecha, '', 10, 'date')}${campoTxt('rcHora', 'Hora', d.hora, '', 5, 'time')}</div>` +
        campoTxt('rcLugar', 'Lugar', d.lugar, 'Falta: déjalo vacío si no ha llegado', 120) +
        `<div class="fields cols">${campoNum('rcAsis', 'Personas esperadas', d.asistentes || '', 0, 5000)}${campoNum('rcCarros', 'Camionetas', d.carros, 0, 20)}</div>` +
        `<div class="field"><span class="lbl">Comida</span>${marca('rcRef', 'Refrigerio', d.refrigerios)}${marca('rcAlm', 'Almuerzo', d.almuerzo)}</div>` +
        `<div class="field"><span class="lbl">Logística</span>${ITEMS_LOG().map((t, k) => marca('rcLog' + k, t, d.logistica.includes(t) || t === 'Refrigerios recibidos' && (d.refrigerios || d.almuerzo))).join('')}</div>`,
      primario: 'Crear reunión y repartir', icono: 'enviar', listo: 'Listo: reunión creada. Cada persona ya tiene su tarea y su aviso.',
      ops: () => {
        const com = valor('rcCom'), fecha = valor('rcFecha'), hora = valor('rcHora'), lugar = valor('rcLugar'), asis = entero('rcAsis') || 0, carros = entero('rcCarros') || 0;
        if (!com) return fallar('Escribe la comunidad.', 'rcCom');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fallar('Escribe la fecha.', 'rcFecha');
        if (fecha < hoy()) return fallar('La fecha ya pasó. Revísala.', 'rcFecha');
        if (!/^\d{2}:\d{2}$/.test(hora)) return fallar('Escribe la hora.', 'rcHora');
        if (D().reuniones.some(x => ACTIVA.includes(x.estado) && normal(x.comunidad) === normal(com))) return fallar('Ya hay una reunión activa con esa comunidad.', 'rcCom');
        const faltan = [!lugar && 'lugar', !asis && 'personas'].filter(Boolean);
        const ref = $('rcRef').checked, alm = $('rcAlm').checked;
        const items = ITEMS_LOG().filter((t, k) => $('rcLog' + k).checked);
        const id = window.nube.idNuevo('re'), yo = persona().nombre;
        const r = { comunidad: com, fecha, hora, lugar, asistentes: asis, jefe: yo, estado: 'programada', faltan, proyecto: 'Proyecto Costa Norte', correo: c.texto, correos: [c.id], origen: fuente,
          historial: [{ fecha: ahora(), texto: 'El agente leyó el correo y armó la reunión', por: origen(fuente) }, { fecha: ahora(), texto: 'La Jefe la revisó y repartió las tareas', por: yo }] };
        const n = (tipo, detalle, cantidad, rol, extra) => ['set', 'necesidades', window.nube.idNuevo('ne'), Object.assign({ reunionId: id, comunidad: com, fechaReunion: fecha, tipo, detalle, cantidad, responsableRol: rol, estado: 'pendiente', por: '', en: '', motivo: '', conductor: '', items: [], acta: null }, extra || {})];
        const quienes = asis ? plural(asis, 'persona', 'personas') : 'las personas que lleguen';
        const ops = [['set', 'reuniones', id, r]];
        if (ref) ops.push(n('refrigerios', `Refrigerios para ${quienes}`, asis, 'compras'));
        if (alm) ops.push(n('almuerzo', `Almuerzo para ${quienes}`, asis, 'compras'));
        if (carros) ops.push(n('carros', `${plural(carros, 'camioneta', 'camionetas')} para el equipo de campo`, carros, 'carros'));
        ops.push(n('logistica', `Alistar ${lugar || 'el lugar'} para ${quienes}`, asis, 'logistica', { items: (items.length ? items : ITEMS_LOG()).map(t => ({ t, ok: false })) }));
        ops.push(n('asistencia', 'Confirmar si vas a la reunión', 0, 'profesional'));
        ops.push(n('acta', 'Registrar el acta y el formato diario', 0, 'administrativo'));
        const cuandoTxt = `${A().fechaCorta(fecha)} a las ${hora12(hora)}`;
        if (ref || alm) ops.push(aviso('compras', 'Reunión nueva: comida por autorizar', `${com}, ${cuandoTxt}: ${[ref && 'refrigerio', alm && 'almuerzo'].filter(Boolean).join(' y ')} para ${quienes}.`));
        if (carros) ops.push(aviso('carros', 'Reunión nueva: carros por autorizar', `${com}, ${cuandoTxt}: ${plural(carros, 'camioneta', 'camionetas')}.`));
        ops.push(aviso('logistica', 'Reunión nueva: hay que alistar', `${com}, ${cuandoTxt}${lugar ? ' en ' + lugar : ' (falta el lugar)'}.`));
        ops.push(aviso('profesional', 'Reunión nueva: ¿vas?', `${com}, ${cuandoTxt}. Confirma si vas.`));
        ops.push(aviso('administrativo', 'Reunión nueva', `${com}, ${cuandoTxt}. Ese día registras el acta y el formato diario.`));
        return ops;
      }
    });
  }

  function confirmarFaltantes(c, d, r, encabezado, fuente) {
    abrir({
      titulo: `Datos nuevos: ${r.comunidad}`, sub: `${fechaTxt(r)}. Revisa los cambios antes de avisar.`,
      campos: encabezado + campoTxt('rcLugar', 'Lugar', d.lugar || r.lugar, 'Falta', 120) + campoNum('rcAsis', 'Personas esperadas', d.asistentes || r.asistentes || '', 0, 5000),
      primario: 'Actualizar y avisar', icono: 'enviar', listo: 'Listo: reunión actualizada y avisos enviados.',
      ops: () => {
        const lugar = valor('rcLugar'), asis = entero('rcAsis') || 0;
        if (lugar === (r.lugar || '') && asis === num(r.asistentes)) return fallar('No hay nada que cambiar.');
        const cambios = [lugar !== (r.lugar || '') && `lugar: ${lugar || 'sin lugar'}`, asis !== num(r.asistentes) && `personas: ${num(r.asistentes)} → ${asis}`].filter(Boolean).join('; ');
        const faltan = [!lugar && 'lugar', !asis && 'personas'].filter(Boolean);
        const ops = [['mezclar', 'reuniones', r.id, { lugar, asistentes: asis, faltan, correos: (Array.isArray(r.correos) ? r.correos : []).concat([c.id]), historial: paso(r, `Datos nuevos del correo (${cambios})`, persona().nombre) }]];
        const comida = necDe(r.id).filter(n => ['refrigerios', 'almuerzo'].includes(n.tipo) && n.estado !== 'cancelado');
        if (asis !== num(r.asistentes)) comida.forEach(n => ops.push(['mezclar', 'necesidades', n.id, Object.assign({ cantidad: asis, detalle: `${(TIPO[n.tipo] || [''])[0]} para ${plural(asis, 'persona', 'personas')}` },
          n.estado === 'autorizado' || n.estado === 'rechazado' ? { estado: 'pendiente', motivo: `Cambió el número de personas a ${asis}: revísalo otra vez` } : {})]));
        necDe(r.id).filter(n => n.tipo === 'logistica' && n.estado !== 'cancelado').forEach(n => ops.push(['mezclar', 'necesidades', n.id, { detalle: `Alistar ${lugar || 'el lugar'} para ${plural(asis, 'persona', 'personas')}` }]));
        if (asis !== num(r.asistentes) && comida.length) ops.push(aviso('compras', 'Cambió la comida de una reunión', `${r.comunidad}: ahora son ${asis} personas. Revisa otra vez.`));
        ops.push(aviso('logistica', 'Datos nuevos de una reunión', `${r.comunidad}: ${cambios}.`));
        if (lugar !== (r.lugar || '')) new Set(necDe(r.id).filter(n => ['carros', 'viaje'].includes(n.tipo) && !['cancelado', 'no-va'].includes(n.estado)).map(n => n.responsableRol))
          .forEach(rol => ops.push(aviso(rol, 'Cambió el lugar de una reunión', `${r.comunidad}: ${cambios}.`)));
        ops.push(aviso('profesional', 'Datos nuevos de una reunión', `${r.comunidad}: ${cambios}.`));
        return ops;
      }
    });
  }

  function confirmarReprograma(c, d, r, encabezado, fuente) {
    abrir({
      titulo: `Cambio de fecha: ${r.comunidad}`, sub: `Antes: ${fechaTxt(r)}. Al cambiar la fecha, los carros, el viaje, la comida y la asistencia se revisan otra vez.`,
      campos: encabezado + `<div class="fields cols">${campoTxt('rcFecha', 'Fecha nueva', d.fecha, '', 10, 'date')}${campoTxt('rcHora', 'Hora', d.hora || r.hora, '', 5, 'time')}</div>` + campoTxt('rcMotivo', 'Motivo', d.motivo, '', 200),
      primario: 'Reprogramar y avisar', icono: 'calendario', listo: 'Listo: reunión reprogramada. Todos tienen el aviso para revisar otra vez.',
      ops: () => {
        const fecha = valor('rcFecha'), hora = valor('rcHora'), motivo = valor('rcMotivo');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < hoy()) return fallar('Escribe una fecha nueva que no haya pasado.', 'rcFecha');
        if (!/^\d{2}:\d{2}$/.test(hora)) return fallar('Escribe la hora.', 'rcHora');
        const antes = `${A().fechaCorta(r.fecha)} ${hora12(r.hora)}`, despues = `${A().fechaCorta(fecha)} ${hora12(hora)}`;
        const ops = [['mezclar', 'reuniones', r.id, { fecha, hora, estado: 'reprogramada', correos: (Array.isArray(r.correos) ? r.correos : []).concat([c.id]), historial: paso(r, `Cambió del ${antes} al ${despues}${motivo ? ': ' + motivo : ''}`, persona().nombre) }]];
        const roles = new Set();
        necDe(r.id).filter(n => n.estado !== 'cancelado').forEach(n => {
          let cambio = { fechaReunion: fecha };
          if (n.tipo === 'viaje') cambio = Object.assign(cambio, { estado: 'cancelado', motivo: 'La reunión cambió de fecha' });
          else if (n.tipo === 'carros') cambio = Object.assign(cambio, { estado: 'pendiente', conductor: '', motivo: `La reunión cambió al ${despues}: revisa otra vez` });
          else if (['refrigerios', 'almuerzo', 'asistencia'].includes(n.tipo) && n.estado !== 'pendiente') cambio = Object.assign(cambio, { estado: 'pendiente', motivo: `La reunión cambió al ${despues}: revisa otra vez` });
          ops.push(['mezclar', 'necesidades', n.id, cambio]);
          roles.add(n.responsableRol);
        });
        roles.forEach(rol => ops.push(aviso(rol, 'Una reunión cambió de fecha', `${r.comunidad}: pasa del ${antes} al ${despues}.${motivo ? ' ' + motivo + '.' : ''}`)));
        return ops;
      }
    });
  }

  function confirmarCancela(c, d, r, encabezado, fuente) {
    abrir({
      titulo: `Cancelar: ${r.comunidad}`, sub: `${fechaTxt(r)}. Se cancelan la comida, los carros y todo lo pendiente, y se avisa a cada persona.`,
      campos: encabezado + campoTxt('rcMotivo', 'Motivo', d.motivo, '', 200),
      primario: 'Cancelar la reunión y avisar', icono: 'x', listo: 'Listo: reunión cancelada y avisos enviados.',
      ops: () => {
        const motivo = valor('rcMotivo') || 'Sin motivo';
        const ops = [['mezclar', 'reuniones', r.id, { estado: 'cancelada', motivo, correos: (Array.isArray(r.correos) ? r.correos : []).concat([c.id]), historial: paso(r, `Reunión cancelada: ${motivo}`, persona().nombre) }]];
        const roles = new Set();
        necDe(r.id).filter(n => n.estado !== 'cancelado').forEach(n => { ops.push(['mezclar', 'necesidades', n.id, { estado: 'cancelado', motivo: 'La reunión se canceló' }]); roles.add(n.responsableRol); });
        roles.forEach(rol => ops.push(aviso(rol, 'Se canceló una reunión', `${r.comunidad} (${A().fechaCorta(r.fecha)}): ${motivo}.`)));
        return ops;
      }
    });
  }

  /* ---------- tareas de cada rol ---------- */
  const necPorId = id => D().necesidades.find(n => n.id === id) || null;
  function autorizar(n) {
    const r = reunionPorId(n.reunionId);
    abrir({ titulo: `Autorizar ${(TIPO[n.tipo] || [''])[0].toLowerCase()}`, sub: `${n.detalle}. ${r ? r.comunidad + ', ' + fechaTxt(r) : ''}`, primario: 'Autorizar', icono: 'check', secundario: 'Rechazar',
      listo: 'Listo: autorizado.', alSecundario: () => { rechazar(n); accion.base = Object.assign({}, n); },
      ops: () => [['mezclar', 'necesidades', n.id, hecho({ estado: 'autorizado', motivo: '' })]] });
  }
  function rechazar(n) {
    const r = reunionPorId(n.reunionId);
    abrir({ titulo: `Rechazar ${(TIPO[n.tipo] || [''])[0].toLowerCase()}`, sub: `${n.detalle}. ${r ? r.comunidad : ''}`, campos: campoTxt('rcMotivo', 'Motivo (lo verá la Jefe)', '', 'Ej: no hay presupuesto para esa fecha', 160),
      primario: 'Rechazar', listo: 'Listo: rechazado. La Jefe ya tiene el aviso.',
      ops: () => {
        if (!valor('rcMotivo')) return fallar('Escribe el motivo.', 'rcMotivo');
        return [['mezclar', 'necesidades', n.id, hecho({ estado: 'rechazado', motivo: valor('rcMotivo') })],
          aviso('jefe', `Rechazaron ${(TIPO[n.tipo] || [''])[0].toLowerCase()}`, `${r ? r.comunidad : n.comunidad}: ${valor('rcMotivo')}.`)];
      } });
  }
  function carros(n) {
    const r = reunionPorId(n.reunionId);
    abrir({ titulo: 'Autorizar carros y escoger conductor', sub: `${n.detalle}. ${r ? r.comunidad + ', ' + fechaTxt(r) : ''}`,
      campos: campoSel('rcCond', 'Conductor', CONDUCTORES.map(x => [x, x]), CONDUCTORES[0]),
      primario: 'Autorizar y avisar al conductor', icono: 'carro', listo: 'Listo: carros autorizados. El conductor ya tiene el aviso.',
      ops: () => {
        const cond = valor('rcCond');
        return [['mezclar', 'necesidades', n.id, hecho({ estado: 'autorizado', conductor: cond, motivo: '' })],
          ['set', 'necesidades', window.nube.idNuevo('ne'), { reunionId: n.reunionId, comunidad: n.comunidad, fechaReunion: n.fechaReunion, tipo: 'viaje', detalle: `Llevar al equipo a la ${n.comunidad}`, cantidad: n.cantidad,
            responsableRol: 'conductor', estado: 'pendiente', por: '', en: '', motivo: '', conductor: cond, items: [], acta: null, carrosId: n.id }],
          aviso('conductor', 'Tienes un viaje', `${cond}: llevar al equipo a la ${n.comunidad}${r ? ', ' + fechaTxt(r) : ''}. Confírmalo.`)];
      } });
  }
  function viajeOk(n) {
    abrir({ titulo: 'Confirmar el viaje', sub: `${n.detalle}. Conductor: ${n.conductor}.`, primario: 'Confirmo el viaje', icono: 'check', listo: 'Listo: viaje confirmado.',
      ops: () => [['mezclar', 'necesidades', n.id, hecho({ estado: 'listo', motivo: '' })]] });
  }
  function noPuedo(n) {
    const viaje = n.tipo === 'viaje';
    abrir({ titulo: viaje ? 'No puedo hacer el viaje' : 'No puedo ir a la reunión', sub: n.comunidad, campos: campoTxt('rcMotivo', 'Motivo', '', viaje ? 'Ej: el carro está en el taller' : 'Ej: tengo otra reunión ese día', 160),
      primario: 'Avisar que no puedo', listo: viaje ? 'Listo: Transporte ya sabe que tiene que buscar otro conductor.' : 'Listo: la Jefe ya sabe que no vas.',
      ops: () => {
        if (!valor('rcMotivo')) return fallar('Escribe el motivo.', 'rcMotivo');
        const ops = [['mezclar', 'necesidades', n.id, hecho({ estado: 'no-va', motivo: valor('rcMotivo') })]];
        if (viaje) {
          const carro = necDe(n.reunionId).find(x => x.tipo === 'carros' && x.estado === 'autorizado');
          if (carro) ops.push(['mezclar', 'necesidades', carro.id, { estado: 'pendiente', conductor: '', motivo: `${n.conductor} no puede: ${valor('rcMotivo')}` }]);
          ops.push(aviso('carros', 'El conductor no puede', `${n.comunidad}: ${n.conductor} no puede (${valor('rcMotivo')}). Escoge otro conductor.`));
        } else ops.push(aviso('jefe', 'Alguien no va a una reunión', `${persona().nombre} no va a la ${n.comunidad}: ${valor('rcMotivo')}.`));
        return ops;
      } });
  }
  function voy(n) {
    abrir({ titulo: 'Confirmar que vas', sub: n.comunidad, primario: 'Voy', icono: 'check', listo: 'Listo: confirmaste que vas.',
      ops: () => [['mezclar', 'necesidades', n.id, hecho({ estado: 'listo', motivo: '' })]] });
  }
  function logistica(n) {
    const it = (Array.isArray(n.items) ? n.items : []).filter(x => x && typeof x === 'object');
    abrir({ titulo: 'Alistar la reunión', sub: `${n.detalle}. Marca lo que ya está listo; cuando todo esté, queda alistada.`,
      campos: `<div class="field">${it.map((x, k) => marca('rcIt' + k, x.t, x.ok)).join('')}</div>`,
      primario: 'Guardar', icono: 'check', listo: 'Listo: lista guardada.',
      ops: () => {
        const nuevos = it.map((x, k) => ({ t: String(x.t), ok: !!($('rcIt' + k) && $('rcIt' + k).checked) }));
        const todo = nuevos.length && nuevos.every(x => x.ok);
        accion.listo = todo ? 'Listo: la reunión quedó alistada.' : `Listo: ${nuevos.filter(x => x.ok).length} de ${nuevos.length} listos.`;
        return [['mezclar', 'necesidades', n.id, hecho({ items: nuevos, estado: todo ? 'listo' : 'pendiente' })]];
      } });
  }
  function acta(n) {
    const r = reunionPorId(n.reunionId);
    if (!r) return null;
    fotoActa = '';
    abrir({ titulo: 'Registrar el acta y el formato diario', sub: `${r.comunidad}, ${fechaTxt(r)}.`,
      campos: `<div class="fields cols">${campoNum('rcAsis', 'Asistentes', '', 0, 5000)}<div></div></div>` +
        `<div class="fields cols">${campoTxt('rcIni', 'Hora de inicio', r.hora, '', 5, 'time')}${campoTxt('rcFin', 'Hora de cierre', '', '', 5, 'time')}</div>` +
        `<div class="field"><label for="rcObs">Observaciones y compromisos</label><textarea id="rcObs" rows="3" maxlength="600" placeholder="Ej: la comunidad pidió una segunda reunión"></textarea></div>` +
        `<div class="field"><span class="lbl">Foto de la lista firmada</span><label class="btn foto-btn"><span data-ico="camara"></span><span id="rcFotoTxt">Tomar o escoger foto</span><input id="rcFoto" class="archivo-oculto" type="file" accept="image/*" capture="environment"></label><img id="rcFotoVer" class="factura-mini" alt="Foto de la lista firmada" hidden></div>`,
      primario: 'Guardar acta', icono: 'check', listo: 'Listo: acta registrada. La reunión quedó como realizada.',
      ops: () => {
        const asis = entero('rcAsis'), ini = valor('rcIni'), fin = valor('rcFin'), obs = valor('rcObs');
        if (!(asis >= 0)) return fallar('Escribe cuántas personas asistieron.', 'rcAsis');
        if (!/^\d{2}:\d{2}$/.test(ini)) return fallar('Escribe la hora de inicio.', 'rcIni');
        if (!/^\d{2}:\d{2}$/.test(fin) || fin <= ini) return fallar('La hora de cierre debe ser después de la de inicio.', 'rcFin');
        if (obs.length < 5) return fallar('Escribe las observaciones de la reunión.', 'rcObs');
        return [['mezclar', 'necesidades', n.id, hecho({ estado: 'listo', acta: { asistentes: asis, inicio: ini, fin, observaciones: obs, foto: fotoActa } })],
          ['mezclar', 'reuniones', r.id, { estado: 'realizada', actaId: n.id, historial: paso(r, `Acta registrada: ${plural(asis, 'asistente', 'asistentes')}`) }],
          aviso('jefe', 'Acta registrada', `${r.comunidad}: ${plural(asis, 'asistente', 'asistentes')}. ${obs.slice(0, 120)}`)];
      } });
    $('rcFoto').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      $('rcFotoTxt').textContent = 'Preparando la foto…';
      try { fotoActa = await window.Inventario.leerFoto(f); const v = $('rcFotoVer'); v.src = fotoActa; v.hidden = false; $('rcFotoTxt').textContent = 'Cambiar foto'; $('reErr').hidden = true; }
      catch (er) { fotoActa = ''; $('rcFotoTxt').textContent = 'Tomar o escoger foto'; fallar(er.message === 'grande' ? 'La foto es muy pesada. Toma otra más de cerca.' : 'Ese archivo no es una foto. Escoge una imagen.'); }
    });
    return true;
  }

  /* ---------- detalle de una reunión ---------- */
  function ver(r) {
    const App = A(), st = EST_RE[r.estado] || ['Sin estado', 'none'], ns = necDe(r.id);
    const acta = ns.find(n => n.tipo === 'acta' && n.acta);
    const foto = acta && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(typeof acta.acta.foto === 'string' ? acta.acta.foto : '') ? acta.acta.foto : '';
    const orden = ['refrigerios', 'almuerzo', 'carros', 'viaje', 'logistica', 'asistencia', 'acta'];
    const filas = ns.slice().sort((a, b) => orden.indexOf(a.tipo) - orden.indexOf(b.tipo)).map(n => {
      const e = EST_NE[n.estado] || [n.estado, 'none'];
      const quien = n.por ? `${n.por}${n.en ? ', ' + App.hace(n.en) : ''}` : 'Le toca a ' + nombreRol(n.responsableRol);
      const mas = [n.conductor && `conductor: ${n.conductor}`, n.tipo === 'logistica' && Array.isArray(n.items) && `${n.items.filter(x => x && x.ok).length} de ${n.items.length} listos`, n.motivo].filter(Boolean).join(' · ');
      return `<li><span class="nf-t"><b>${esH((TIPO[n.tipo] || [n.tipo])[0])}</b><span class="meta">${esH(n.detalle)}</span><span class="meta">${esH(quien)}${mas ? ' · ' + esH(mas) : ''}</span></span>${App.pill(e[0], e[1])}</li>`;
    }).join('');
    const hist = historial(r).slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    abrir({ titulo: r.comunidad, sub: `${fechaTxt(r)}`,
      campos: `<div class="row">${App.pill(st[0], st[1])}${(r.faltan || []).length ? App.pill('Falta: ' + r.faltan.join(', '), 's-peligro', 'aviso') : ''}</div>
        <dl class="datos"><dt>Lugar</dt><dd>${esH(r.lugar || 'Falta el lugar')}</dd><dt>Personas</dt><dd>${num(r.asistentes) || 'Sin dato'}</dd><dt>Jefe</dt><dd>${esH(r.jefe || '')}</dd>${r.motivo ? `<dt>Motivo</dt><dd>${esH(r.motivo)}</dd>` : ''}</dl>
        <div class="section-label">Tareas</div><ul class="necesidades-l">${filas || '<li><span class="meta">Sin tareas.</span></li>'}</ul>
        ${acta ? `<div class="section-label">Acta</div><dl class="datos"><dt>Asistentes</dt><dd>${num(acta.acta.asistentes)}</dd><dt>Horario</dt><dd>${esH(acta.acta.inicio)} a ${esH(acta.acta.fin)}</dd><dt>Observaciones</dt><dd>${esH(acta.acta.observaciones)}</dd></dl>${foto ? `<img class="factura" src="${esH(foto)}" alt="Lista firmada de ${esH(r.comunidad)}">` : ''}` : ''}
        ${typeof r.correo === 'string' && r.correo ? `<details class="correo-orig"><summary>Ver el correo original</summary><pre>${esH(r.correo)}</pre></details>` : ''}
        <div class="section-label">Cómo va</div><ol class="linea">${hist.map(x => `<li><b>${esH(x.texto)}</b><span class="meta">${esH(x.por || '')} · ${esH(App.hace(x.fecha))}</span></li>`).join('') || '<li><span class="meta">Sin historial.</span></li>'}</ol>` });
  }

  /* ---------- eventos ---------- */
  $('reuSecciones').addEventListener('click', e => {
    const b = e.target.closest('[data-sec]'); if (!b) return;
    seccion = b.dataset.sec; A().S.filtro.reuniones = '';
    A().pintarTodo();
  });
  function alTocar(e) {
    const b = e.target.closest('[data-accion]'); if (!b) return;
    const id = b.dataset.id, n = necPorId(id), r = reunionPorId(id);
    const conRol = fn => { if (!(n && puedoHacer(n.responsableRol) && esTarea(n))) return null; const x = fn(n); if (accion) accion.base = Object.assign({}, n); return x === undefined ? true : x; };
    const mapa = {
      ver: () => r && ver(r), correo: () => { const c = correos().find(x => x.id === id); return c && esJefe() ? (procesarCorreo(c), true) : null; },
      autorizar: () => conRol(autorizar), rechazar: () => conRol(rechazar), carros: () => conRol(carros), viajeok: () => conRol(viajeOk), nopuedo: () => conRol(noPuedo),
      voy: () => conRol(voy), logistica: () => conRol(logistica), acta: () => conRol(acta)
    };
    const fn = mapa[b.dataset.accion];
    if (!fn) return;
    if (fn() === null) A().toast('Esa tarea ya cambió. Revisa la lista otra vez.');
  }
  $('reuContenido').addEventListener('click', alTocar);
  $('reForm').addEventListener('submit', e => { e.preventDefault(); guardar(); });
  $('reSecundario').addEventListener('click', () => { if (accion && accion.alSecundario) accion.alSecundario(); });

  window.Reuniones = Object.freeze({ pintar, resumen, tareas, limpiar });
})();
