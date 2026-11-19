/* inventario.js — Módulo Inventario de la demo: bodega de consumibles con las compras adentro.
   Muestra (antes del módulo completo): «Qué hay que hacer» con sus botones, «Existencias» y «Pedir material».
   Las tareas salen solas de los datos:
     artículo agotado o bajo sin compra abierta  -> Pedir compra        (encargada de bodega)
     pedido de material pendiente               -> Entregar            (encargada de bodega)
     compra pedida                              -> Autorizar/Rechazar  (autoriza compras)
     compra autorizada                          -> Registrar compra    (encargada de bodega)
     compra hecha de algo de bodega             -> Recibir en bodega   (encargada de bodega; suma a la cantidad)
     compra sin autorización                    -> Para revisar        (jefe)
   Usa las ayudas que app.js publica en window.App (se leen al usarlas, porque este archivo carga antes). */
(function () {
  'use strict';
  const A = () => window.App;
  const $ = id => document.getElementById(id);
  const ABIERTA = ['pedido', 'autorizado', 'comprado'];
  const SECCIONES = [['hacer', 'Qué hay que hacer'], ['existencias', 'Existencias'], ['movimientos', 'Movimientos'], ['solicitudes', 'Pedidos de material'], ['compras', 'Compras'], ['conteo', 'Conteo'], ['resumen', 'Resumen']];
  const LISTAS = ['hacer', 'existencias'];   // las que ya funcionan en la muestra
  const PROYECTOS = ['Proyecto Costa Norte', 'Proyecto Ruta Alta', 'Oficina'];
  const EST_ART = { agotado: ['Agotado', 's-peligro', 'peligro'], bajo: ['Bajo del mínimo', 's-warn', 'org'], bien: ['Bien', 's-disco', 'disco'] };
  let seccion = 'hacer';
  let guardando = false;

  /* ---------- datos derivados ---------- */
  const num = v => Number(v) || 0;
  const estadoArt = a => (num(a.cantidad) <= 0 ? 'agotado' : num(a.cantidad) <= num(a.minimo) ? 'bajo' : 'bien');
  const articulos = () => A().S.datos.articulos;
  const artPorId = id => articulos().find(a => a.id === id) || null;
  const compraAbierta = id => A().S.datos.compras.find(c => c.articuloId === id && ABIERTA.includes(c.estado)) || null;
  const persona = () => A().S.persona;
  const nombreRol = rol => { const p = window.DEMO.porRol(rol); return p ? p.corto : rol; };
  const perm = () => A().permiso('inventario');
  const esMia = t => (t.rol === 'asistente' && perm() === 'bodega') || (t.rol === 'compras' && perm() === 'autoriza') || (t.rol === 'jefe' && persona() && persona().rol === 'jefe');
  // Cantidad con su unidad en singular o plural: 1 par, 2 pares, 1 galón.
  const SINGULAR = { unidades: 'unidad', pares: 'par', cajas: 'caja', resmas: 'resma', rollos: 'rollo', galones: 'galón', paquetes: 'paquete' };
  const cantTxt = (n, unidad) => `${num(n)} ${num(n) === 1 ? (SINGULAR[unidad] || unidad || '') : (unidad || '')}`.trim();

  /** Lista de tareas pendientes, de la más urgente a la menos. */
  function tareas() {
    const d = A().S.datos, out = [];
    articulos().forEach(a => {
      const e = estadoArt(a);
      if (e !== 'bien' && !compraAbierta(a.id)) out.push({ id: 'p-' + a.id, tipo: 'pedir', rol: 'asistente', urg: e === 'agotado' ? 0 : 5, art: a, sug: Math.max(1, num(a.maximo) - num(a.cantidad)) });
    });
    d.solicitudes.filter(s => s.estado === 'pendiente').forEach(s => {
      const a = artPorId(s.articuloId);
      out.push({ id: 'e-' + s.id, tipo: 'entregar', rol: 'asistente', urg: 1, sol: s, art: a, alcanza: !!a && num(a.cantidad) >= num(s.cantidad) });
    });
    d.compras.forEach(c => {
      const a = c.articuloId ? artPorId(c.articuloId) : null;
      if (c.estado === 'pedido') out.push({ id: 'a-' + c.id, tipo: 'autorizar', rol: 'compras', urg: a && estadoArt(a) === 'agotado' ? 0 : 2, compra: c, art: a });
      else if (c.estado === 'autorizado') out.push({ id: 'c-' + c.id, tipo: 'comprar', rol: 'asistente', urg: 3, compra: c, art: a });
      else if (c.estado === 'comprado' && a) out.push({ id: 'r-' + c.id, tipo: 'recibir', rol: 'asistente', urg: 3, compra: c, art: a });
      else if (c.estado === 'sin-autorizar') out.push({ id: 's-' + c.id, tipo: 'revisar', rol: 'jefe', urg: 4, compra: c, art: a });
    });
    return out.sort((x, y) => x.urg - y.urg);
  }

  /** Números para Inicio y para la insignia de la pestaña. */
  function resumen(rol) {
    const d = A().S.datos, p = persona();
    const lista = tareas();
    return {
      faltan: articulos().filter(a => estadoArt(a) !== 'bien').length,
      porEntregar: d.solicitudes.filter(s => s.estado === 'pendiente').length,
      porAutorizar: d.compras.filter(c => c.estado === 'pedido').length,
      sinAutorizar: d.compras.filter(c => c.estado === 'sin-autorizar').length,
      misPedidos: p ? d.solicitudes.filter(s => s.estado === 'pendiente' && s.pide === p.nombre).length : 0,
      mias: lista.filter(t => t.tipo !== 'revisar' && esMia(t)).length
    };
  }

  /* ---------- pintar ---------- */
  function pintar() {
    const App = A(), S = App.S, esH = App.esH;
    if (!S.persona) return;
    const f = S.filtro.inventario;
    if (f === 'agotado' || f === 'bajo') seccion = 'existencias';
    else if (f === 'entregar' || f === 'compras') seccion = 'hacer';
    const arts = articulos();
    App.tablero('inventario', [
      { k: 'v-ago', n: arts.filter(a => estadoArt(a) === 'agotado').length, lbl: 'Agotados', icono: 'aviso', tono: 'peligro', filtro: 'agotado' },
      { k: 'v-baj', n: arts.filter(a => estadoArt(a) === 'bajo').length, lbl: 'Bajos del mínimo', icono: 'caja', tono: 'sol', filtro: 'bajo' },
      { k: 'v-ent', n: S.datos.solicitudes.filter(s => s.estado === 'pendiente').length, lbl: 'Pedidos por entregar', icono: 'entrega', tono: 'listo', filtro: 'entregar' },
      { k: 'v-com', n: S.datos.compras.filter(c => ABIERTA.includes(c.estado)).length, lbl: 'Compras en curso', icono: 'carrito', tono: 'org', filtro: 'compras' }
    ]);
    const mias = resumen().mias;
    $('invSecciones').innerHTML = SECCIONES.map(([k, n]) => `<button type="button" class="chip" data-sec="${k}" aria-pressed="${seccion === k}">${esH(n)}${k === 'hacer' && mias ? ` <span class="n">${mias}</span>` : ''}${LISTAS.includes(k) ? '' : ' ' + window.ico('candado')}</button>`).join('');
    $('qInventario').hidden = seccion !== 'existencias';
    const c = $('invContenido');
    if (App.cargando('articulos') || App.cargando('compras') || App.cargando('solicitudes')) { c.innerHTML = UI.esqueleto(3); return; }
    if (seccion === 'hacer') c.innerHTML = perm() === 'pide' ? htmlMisPedidos() : htmlTareas(f);
    else if (seccion === 'existencias') c.innerHTML = htmlExistencias(f);
    else c.innerHTML = UI.vacio('candado', 'Llega con el módulo completo', 'Esta parte se arma cuando apruebes la muestra de «Qué hay que hacer».');
  }

  function htmlTareas(f) {
    const App = A(), esH = App.esH;
    let lista = tareas();
    if (f === 'entregar') lista = lista.filter(t => t.tipo === 'entregar');
    if (f === 'compras') lista = lista.filter(t => ['autorizar', 'comprar', 'recibir'].includes(t.tipo));
    const mias = lista.filter(esMia), otras = lista.filter(t => !esMia(t));
    const filtroTxt = f === 'entregar' ? ' (solo pedidos por entregar)' : f === 'compras' ? ' (solo compras en curso)' : '';
    let h = '';
    if (persona().rol === 'jefe') {
      // La jefe ve todo, agrupado por a quién le toca.
      const grupos = {};
      lista.forEach(t => { (grupos[t.rol] = grupos[t.rol] || []).push(t); });
      const orden = ['jefe', 'asistente', 'compras'];
      h += Object.keys(grupos).sort((a, b) => orden.indexOf(a) - orden.indexOf(b)).map(rol =>
        `<div class="section-label">${rol === 'jefe' ? 'Para que revises tú' : 'Le toca a ' + esH(nombreRol(rol))} (${grupos[rol].length})${esH(filtroTxt)}</div>
         <div class="list">${grupos[rol].map(t => tarjeta(t, rol === 'jefe')).join('')}</div>`).join('');
      return h || UI.vacio('checkCirculo', 'Nada pendiente', 'La bodega y las compras están al día.');
    }
    h += `<div class="section-label">Te toca a ti (${mias.length})${esH(filtroTxt)}</div>`;
    h += mias.length ? `<div class="list">${mias.map(t => tarjeta(t, true)).join('')}</div>` : UI.vacio('checkCirculo', 'Nada pendiente para ti', 'Cuando algo te toque, aparece aquí con su botón.');
    if (otras.length) h += `<div class="section-label">Le toca a otras personas (${otras.length})</div><div class="list">${otras.map(t => tarjeta(t, false)).join('')}</div>`;
    return h;
  }

  // Una tarea: qué pasa, con qué datos, y el botón para hacerla (solo si le toca a la persona).
  function tarjeta(t, mia) {
    const App = A(), esH = App.esH, pill = App.pill, cop = App.cop;
    const a = t.art, c = t.compra, s = t.sol;
    const unidad = a ? a.unidad : (c ? c.unidad : '');
    let icono, tono, titulo, detalle = [], extra = '', botones = '';
    if (t.tipo === 'pedir') {
      const e = estadoArt(a);
      icono = 'carrito'; tono = e === 'agotado' ? 'peligro' : 'org';
      titulo = `Pedir compra: ${a.nombre}`;
      detalle.push(e === 'agotado' ? 'Se agotó' : `Quedan ${cantTxt(a.cantidad, a.unidad)} y el mínimo es ${num(a.minimo)}`, a.ubicacion);
      extra = App.pill(EST_ART[e][0], EST_ART[e][1]);
      botones = `<button class="btn primary small" type="button" data-accion="pedir" data-id="${esH(a.id)}"><span data-ico="carrito"></span>Pedir compra (${esH(cantTxt(t.sug, a.unidad))})</button>`;
    } else if (t.tipo === 'entregar') {
      icono = 'entrega'; tono = t.alcanza ? 'listo' : 'org';
      titulo = `Entregar a ${s.pide}: ${s.articulo}`;
      detalle.push(cantTxt(s.cantidad, unidad), s.paraQue, s.proyecto, 'pidió ' + App.hace(s.fecha));
      if (!a) extra = pill('El artículo ya no existe en bodega', 's-peligro', 'aviso');
      else if (!t.alcanza) extra = `<div class="aviso warn"><span><b>No alcanza:</b> hay ${esH(cantTxt(a.cantidad, a.unidad))} en bodega.${compraAbierta(a.id) ? ' Ya hay una compra en curso.' : ''}</span></div>`;
      else extra = pill(`Hay ${cantTxt(a.cantidad, a.unidad)}`, 's-disco', 'check');
      if (a) {
        botones = t.alcanza
          ? `<button class="btn primary small" type="button" data-accion="entregar" data-id="${esH(s.id)}"><span data-ico="entrega"></span>Entregar</button>`
          : (num(a.cantidad) > 0 ? `<button class="btn primary small" type="button" data-accion="entregar" data-id="${esH(s.id)}"><span data-ico="entrega"></span>Entregar lo que hay (${esH(num(a.cantidad))})</button>` : '') +
            (compraAbierta(a.id) ? '' : `<button class="btn small" type="button" data-accion="pedir" data-id="${esH(a.id)}" data-cant="${esH(Math.max(num(s.cantidad) - num(a.cantidad), num(a.maximo) - num(a.cantidad), 1))}"><span data-ico="carrito"></span>Pedir compra</button>`);
      }
      botones += `<button class="btn ghost small" type="button" data-accion="noentregar" data-id="${esH(s.id)}">No entregar</button>`;
    } else if (t.tipo === 'autorizar') {
      icono = 'carrito'; tono = 'org';
      titulo = `Autorizar compra: ${a ? a.nombre : c.que}`;
      detalle.push(cantTxt(c.cantidad, c.unidad), 'aprox. ' + cop(c.valorAprox), 'pidió ' + c.pide, c.paraQue);
      if (a && estadoArt(a) !== 'bien') extra = pill(estadoArt(a) === 'agotado' ? 'En bodega: agotado' : `En bodega: quedan ${cantTxt(a.cantidad, a.unidad)}`, EST_ART[estadoArt(a)][1]);
      botones = `<button class="btn primary small" type="button" data-accion="autorizar" data-id="${esH(c.id)}"><span data-ico="check"></span>Autorizar</button><button class="btn ghost small" type="button" data-accion="rechazar" data-id="${esH(c.id)}">Rechazar</button>`;
    } else if (t.tipo === 'comprar') {
      icono = 'carrito'; tono = 'listo';
      titulo = `Comprar: ${a ? a.nombre : c.que}`;
      detalle.push(cantTxt(c.cantidad, c.unidad), 'autorizada por ' + (c.autoriza || 'quien autoriza'), 'aprox. ' + cop(c.valorAprox));
      botones = `<button class="btn primary small" type="button" data-accion="comprar" data-id="${esH(c.id)}"><span data-ico="carrito"></span>Registrar compra</button>`;
    } else if (t.tipo === 'recibir') {
      icono = 'caja'; tono = 'disco';
      titulo = `Recibir en bodega: ${a.nombre}`;
      detalle.push(cantTxt(c.cantidad, c.unidad), `comprado en ${c.proveedor || 'proveedor sin nombre'}`, c.fechaCompra ? App.fechaCorta(c.fechaCompra) : '', c.valorReal ? cop(c.valorReal) : '');
      botones = `<button class="btn primary small" type="button" data-accion="recibir" data-id="${esH(c.id)}"><span data-ico="caja"></span>Recibir en bodega</button>`;
    } else {
      icono = 'aviso'; tono = 'peligro';
      titulo = `Compra sin autorización: ${c.que}`;
      detalle.push(cop(c.valorReal || c.valorAprox), 'compró ' + c.pide, c.proveedor);
      extra = '<span class="meta">Nadie la autorizó antes de comprarla. Habla con quien compró.</span>';
    }
    const pie = t.tipo === 'revisar' ? '' : (mia ? botones : App.pill('Le toca a ' + nombreRol(t.rol), 'none', 'persona'));
    return `<div class="card tarea st-${tono}">
      <div class="tarea-cab"><span class="ico t-${tono}" aria-hidden="true">${window.ico(icono)}</span>
        <div class="tarea-t"><b>${esH(titulo)}</b><span class="meta">${esH(detalle.filter(Boolean).join(' · '))}</span></div></div>
      ${extra}
      ${pie ? `<div class="tarea-pie">${pie}</div>` : ''}
    </div>`;
  }

  const EST_SOL = { pendiente: ['En espera', 's-org'], entregada: ['Entregado', 's-disco'], rechazada: ['No se entregó', 's-peligro'] };
  function htmlMisPedidos() {
    const App = A(), esH = App.esH, p = persona();
    const mios = A().S.datos.solicitudes.filter(s => s.pide === p.nombre).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    if (!mios.length) return `<div class="section-label">Tus pedidos de material</div>` + UI.vacio('caja', 'No has pedido nada', 'Toca «Pedir material de bodega» y la encargada te lo entrega.');
    return `<div class="section-label">Tus pedidos de material (${mios.length})</div><div class="list">${mios.map(s => {
      const e = EST_SOL[s.estado] || ['Sin estado', 'none'];
      return `<div class="card tarea st-${s.estado === 'pendiente' ? 'org' : s.estado === 'entregada' ? 'disco' : 'peligro'}">
        <div class="card-head"><div class="card-title">${esH(s.articulo)}</div>${App.pill(e[0], e[1])}</div>
        <span class="meta">${esH([cantTxt(s.cantidad, (artPorId(s.articuloId) || {}).unidad), s.paraQue, s.proyecto, 'pediste ' + App.hace(s.fecha)].filter(Boolean).join(' · '))}</span>
        ${s.estado === 'pendiente' ? App.pill('Le toca a ' + nombreRol('asistente') + ' entregarlo', 'none', 'persona') : ''}
        ${s.estado === 'entregada' ? `<span class="meta">Te lo entregó ${esH(s.entregadaPor)} ${esH(App.hace(s.fechaEntrega))}${s.motivo ? '. ' + esH(s.motivo) : ''}</span>` : ''}
        ${s.estado === 'rechazada' && s.motivo ? `<span class="meta">Motivo: ${esH(s.motivo)}</span>` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  function htmlExistencias(f) {
    const App = A(), esH = App.esH;
    const q = $('qInventario').value.trim().toLowerCase();
    const orden = { agotado: 0, bajo: 1, bien: 2 };
    const todos = articulos().slice().sort((a, b) => (orden[estadoArt(a)] - orden[estadoArt(b)]) || String(a.nombre).localeCompare(String(b.nombre)));
    const vis = todos.filter(a => (!f || f === estadoArt(a) || !['agotado', 'bajo'].includes(f)) && (!q || [a.nombre, a.categoria, a.ubicacion, a.proveedor].join(' ').toLowerCase().includes(q)));
    const cnt = `<div class="count" aria-live="polite">${vis.length === todos.length ? todos.length + ' artículos' : vis.length + ' de ' + todos.length + ' artículos'}</div>`;
    if (!vis.length) return cnt + UI.vacio('vacio', 'No hay artículos con ese filtro', f ? 'Toca otra vez la cifra de arriba para ver todo.' : '');
    return cnt + `<div class="list">${vis.map(a => {
      const e = estadoArt(a), st = EST_ART[e], abierta = compraAbierta(a.id);
      const pct = Math.max(0, Math.min(100, Math.round(num(a.cantidad) / Math.max(1, num(a.maximo)) * 100)));
      const pctMin = Math.max(0, Math.min(100, Math.round(num(a.minimo) / Math.max(1, num(a.maximo)) * 100)));
      return `<div class="card art st-${st[2]}">
        <div class="card-head"><div class="card-title">${esH(a.nombre)}</div>${App.pill(st[0], st[1])}</div>
        <p class="card-sub">${esH(a.categoria)} · ${esH(a.ubicacion)}</p>
        <div class="nivel"><span class="nivel-n">${esH(num(a.cantidad))} <small>${esH(a.unidad)}</small></span>
          <span class="barra n-${e}" role="img" aria-label="${esH(`${num(a.cantidad)} de ${num(a.maximo)}; mínimo ${num(a.minimo)}`)}"><i style="width:${pct}%"></i><b style="left:${pctMin}%"></b></span>
          <span class="meta">mínimo ${esH(num(a.minimo))} · máximo ${esH(num(a.maximo))}</span></div>
        <div class="docs">${App.pill('Aprox. ' + App.cop(a.costo) + ' c/u', 's-pend')}${abierta ? App.pill('Compra en curso: ' + ({ pedido: 'por autorizar', autorizado: 'autorizada', comprado: 'comprada, falta recibir' })[abierta.estado], 's-listo', 'carrito') : ''}</div>
      </div>`;
    }).join('')}</div>`;
  }

  /* ---------- hoja de acción ---------- */
  const campoNum = (id, lbl, v, min, max, ayuda) => `<div class="field"><label for="${id}">${lbl}</label><input id="${id}" type="number" inputmode="numeric" min="${min}"${max != null ? ` max="${max}"` : ''} step="1" value="${A().esH(v)}">${ayuda ? `<span class="meta">${A().esH(ayuda)}</span>` : ''}</div>`;
  const campoTxt = (id, lbl, v, ph, max) => `<div class="field"><label for="${id}">${lbl}</label><input id="${id}" type="text" maxlength="${max || 120}" autocomplete="off" value="${A().esH(v || '')}" placeholder="${A().esH(ph || '')}"></div>`;
  const campoSel = (id, lbl, ops, v) => `<div class="field"><label for="${id}">${lbl}</label><select id="${id}">${ops.map(([val, txt]) => `<option value="${A().esH(val)}"${val === v ? ' selected' : ''}>${A().esH(txt)}</option>`).join('')}</select></div>`;
  let accion = null;
  function abrirAccion(o) {
    accion = o;
    $('acT').textContent = o.titulo; $('acSub').textContent = o.sub || '';
    $('acCampos').innerHTML = o.campos || '';
    $('acPrimario').innerHTML = (o.icono ? window.ico(o.icono) : '') + A().esH(o.primario);
    const sec = $('acSecundario'); sec.hidden = !o.secundario; sec.textContent = o.secundario || '';
    $('acErr').hidden = true;
    A().abrirHoja('shAccion');
  }
  const valor = id => ($(id) ? $(id).value.trim() : '');
  const entero = id => { const v = valor(id); return /^\d+$/.test(v) ? Number(v) : NaN; };
  function fallar(msg, id) { const e = $('acErr'); e.textContent = msg; e.hidden = false; if (id && $(id)) $(id).focus(); return false; }
  const ahora = () => new Date().toISOString();
  const aviso = (para, titulo, texto) => ['set', 'avisos', window.nube.idNuevo('av'), { para, titulo, texto, en: ahora(), modulo: 'inventario', leido: {} }];
  const movimiento = (o) => ['set', 'movimientos', window.nube.idNuevo('mo'), Object.assign({ persona: '', proyecto: '', nota: '', compraId: '', solicitudId: '', por: persona().nombre, porRol: persona().rol, fecha: ahora() }, o)];

  async function guardar() {
    if (guardando || !accion) return;
    $('acErr').hidden = true;
    const ops = accion.ops();
    if (!ops) return;
    guardando = true; $('acPrimario').disabled = true; $('acSecundario').disabled = true;
    try {
      await window.nube.lote(ops);
      A().cerrarHoja('shAccion');
      try { $('invContenido').focus({ preventScroll: true }); } catch (e) {}
      A().toast(accion.listo);
      accion = null;
    } catch (e) { fallar(window.nube.explicar(e)); }
    finally { guardando = false; $('acPrimario').disabled = false; $('acSecundario').disabled = false; }
  }

  /* ---------- acciones ---------- */
  function pedirCompra(art, cant) {
    const sug = cant || Math.max(1, num(art.maximo) - num(art.cantidad));
    abrirAccion({
      titulo: 'Pedir compra', sub: `${art.nombre}: hay ${cantTxt(art.cantidad, art.unidad)}, mínimo ${num(art.minimo)}, máximo ${num(art.maximo)}.`,
      campos: campoNum('acCant', `Cantidad a comprar (${A().esH(art.unidad)})`, sug, 1, 9999, `Con esto la bodega queda en ${num(art.cantidad) + sug}.`) +
        campoNum('acValor', 'Valor aproximado (pesos)', num(art.costo) * sug, 0, null, `Precio de referencia: ${A().cop(art.costo)} por unidad.`) +
        campoTxt('acPara', 'Para qué', 'Reponer la bodega', 'Ej: reponer la bodega'),
      primario: 'Pedir compra', icono: 'carrito', listo: `Listo: compra pedida. Ahora le toca a ${nombreRol('compras')} autorizarla.`,
      ops: () => {
        const n = entero('acCant'), v = entero('acValor');
        if (!(n > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        if (!(v >= 0)) return fallar('Escribe el valor en pesos, sin puntos ni comas.', 'acValor');
        if (compraAbierta(art.id)) return fallar('Ya hay una compra en curso para este artículo. Revisa «Qué hay que hacer».');
        const quien = window.DEMO.porRol('compras');
        return [
          ['set', 'compras', window.nube.idNuevo('co'), { que: art.nombre, cantidad: n, unidad: art.unidad, categoria: art.categoria, valorAprox: v, paraQue: valor('acPara') || 'Reponer la bodega',
            pide: persona().nombre, autoriza: quien ? quien.nombre : '', estado: 'pedido', proveedor: '', valorReal: 0, fechaPedido: A().hoyISO(), fechaCompra: '', entregadoA: '', motivoRechazo: '', articuloId: art.id }],
          aviso('compras', 'Compra por autorizar', `${persona().nombre} pide comprar ${cantTxt(n, art.unidad)} de ${art.nombre} (aprox. ${A().cop(v)}).`)
        ];
      }
    });
    // El texto de ayuda se actualiza mientras se escribe la cantidad.
    $('acCant').addEventListener('input', () => {
      const n = entero('acCant'), ay = $('acCant').parentNode.querySelector('.meta');
      if (ay) ay.textContent = n > 0 ? `Con esto la bodega queda en ${num(art.cantidad) + n}.` : 'Escribe una cantidad entera.';
      if (n > 0) $('acValor').value = num(art.costo) * n;
    });
  }

  function autorizar(c) {
    const a = c.articuloId ? artPorId(c.articuloId) : null;
    abrirAccion({
      titulo: 'Autorizar compra', sub: `${c.que}: ${cantTxt(c.cantidad, c.unidad)}, aprox. ${A().cop(c.valorAprox)}. Pidió ${c.pide}: ${c.paraQue}.${a ? ` En bodega hay ${cantTxt(a.cantidad, a.unidad)}.` : ''}`,
      primario: 'Autorizar', icono: 'check', secundario: 'Rechazar', listo: `Listo: compra autorizada. Ahora le toca a ${nombreRol('asistente')} comprarla.`,
      ops: () => [
        ['mezclar', 'compras', c.id, { estado: 'autorizado', autoriza: persona().nombre }],
        aviso('asistente', 'Compra autorizada', `${persona().nombre} autorizó comprar ${cantTxt(c.cantidad, c.unidad)} de ${c.que}.`)
      ],
      alSecundario: () => rechazar(c)
    });
  }
  function rechazar(c) {
    abrirAccion({
      titulo: 'Rechazar compra', sub: `${c.que}: ${cantTxt(c.cantidad, c.unidad)}, pedida por ${c.pide}.`,
      campos: campoTxt('acMotivo', 'Motivo (lo verá quien pidió)', '', 'Ej: ya hay en la otra bodega', 160),
      primario: 'Rechazar', listo: 'Listo: compra rechazada.',
      ops: () => {
        if (!valor('acMotivo')) return fallar('Escribe el motivo.', 'acMotivo');
        return [['mezclar', 'compras', c.id, { estado: 'rechazado', motivoRechazo: valor('acMotivo'), autoriza: persona().nombre }],
          aviso('asistente', 'Compra rechazada', `${persona().nombre} rechazó comprar ${c.que}: ${valor('acMotivo')}.`)];
      }
    });
  }

  function registrarCompra(c) {
    const a = c.articuloId ? artPorId(c.articuloId) : null;
    abrirAccion({
      titulo: 'Registrar compra', sub: `${c.que}: ${cantTxt(c.cantidad, c.unidad)}, autorizada por ${c.autoriza || 'quien autoriza'}.`,
      campos: campoTxt('acProv', 'Proveedor', (a && a.proveedor) || c.proveedor, 'Dónde se compró') +
        campoNum('acValor', 'Valor pagado (pesos)', c.valorAprox, 0, null, `Autorizado: aprox. ${A().cop(c.valorAprox)}.`) +
        '<div class="note">La foto de la factura llega con el módulo completo.</div>',
      primario: 'Registrar compra', icono: 'check', listo: a ? 'Listo: compra registrada. Cuando llegue, recíbela en bodega.' : 'Listo: compra registrada.',
      ops: () => {
        const v = entero('acValor');
        if (!valor('acProv')) return fallar('Escribe el proveedor.', 'acProv');
        if (!(v > 0)) return fallar('Escribe el valor pagado en pesos, sin puntos ni comas.', 'acValor');
        return [['mezclar', 'compras', c.id, { estado: a ? 'comprado' : 'recibido', proveedor: valor('acProv'), valorReal: v, fechaCompra: A().hoyISO() }]];
      }
    });
  }

  function recibir(c) {
    const a = artPorId(c.articuloId);
    if (!a) { A().toast('Ese artículo ya no existe en bodega.'); return; }
    abrirAccion({
      titulo: 'Recibir en bodega', sub: `${c.que}: compradas ${cantTxt(c.cantidad, c.unidad)} en ${c.proveedor || 'el proveedor'}. Ahora hay ${cantTxt(a.cantidad, a.unidad)}.`,
      campos: campoNum('acCant', `Cantidad que llegó (${A().esH(a.unidad)})`, c.cantidad, 1, 9999, 'Si llegó menos de lo comprado, escribe lo que llegó.') + campoTxt('acNota', 'Nota (opcional)', '', 'Ej: llegaron en buen estado', 160),
      primario: 'Recibir en bodega', icono: 'caja', listo: 'Listo: recibido en bodega. La cantidad ya se sumó.',
      ops: () => {
        const n = entero('acCant');
        if (!(n > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        const nota = valor('acNota') + (n < num(c.cantidad) ? `${valor('acNota') ? '. ' : ''}Llegaron ${n} de ${num(c.cantidad)}` : '');
        return [
          ['mezclar', 'compras', c.id, { estado: 'recibido' }],
          ['update', 'articulos', a.id, { cantidad: window.nube.incremento(n) }],
          movimiento({ articuloId: a.id, articulo: a.nombre, tipo: 'entrada', motivo: 'compra', cantidad: n, saldo: num(a.cantidad) + n, persona: c.proveedor || '', nota, compraId: c.id })
        ];
      }
    });
  }

  function entregar(s) {
    const a = artPorId(s.articuloId);
    if (!a) { A().toast('Ese artículo ya no existe en bodega.'); return; }
    const max = num(a.cantidad), def = Math.min(num(s.cantidad), max);
    abrirAccion({
      titulo: 'Entregar material', sub: `${s.pide} pidió ${cantTxt(s.cantidad, a.unidad)} de ${a.nombre}. En bodega hay ${cantTxt(a.cantidad, a.unidad)}.`,
      campos: campoNum('acCant', `Cantidad que entregas (${A().esH(a.unidad)})`, def, 1, max, `Máximo ${max}: lo que hay en bodega.`) +
        campoSel('acProy', 'Proyecto', PROYECTOS.map(p => [p, p]), PROYECTOS.includes(s.proyecto) ? s.proyecto : PROYECTOS[0]),
      primario: 'Entregar', icono: 'entrega', listo: `Listo: entregado a ${s.pide}. Ya se restó de la bodega.`,
      ops: () => {
        const n = entero('acCant'), hay = num((artPorId(a.id) || a).cantidad);
        if (!(n > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        if (n > hay) return fallar(`Solo hay ${cantTxt(hay, a.unidad)} en bodega.`, 'acCant');
        const parcial = n < num(s.cantidad) ? `Se entregaron ${n} de ${num(s.cantidad)}` : '';
        const ops = [
          ['mezclar', 'solicitudes', s.id, { estado: 'entregada', entregadaPor: persona().nombre, fechaEntrega: ahora(), motivo: parcial }],
          ['update', 'articulos', a.id, { cantidad: window.nube.incremento(-n) }],
          movimiento({ articuloId: a.id, articulo: a.nombre, tipo: 'salida', motivo: 'entrega', cantidad: n, saldo: hay - n, persona: s.pide, proyecto: valor('acProy'), nota: parcial, solicitudId: s.id })
        ];
        if (s.pideRol) ops.push(aviso(s.pideRol, 'Tu pedido está listo', `${persona().nombre} te entregó ${cantTxt(n, a.unidad)} de ${a.nombre}.`));
        return ops;
      }
    });
  }
  function noEntregar(s) {
    abrirAccion({
      titulo: 'No entregar', sub: `${s.pide} pidió ${s.articulo}: ${s.cantidad}.`,
      campos: campoTxt('acMotivo', 'Motivo (lo verá quien pidió)', '', 'Ej: no hay; ya se pidió la compra', 160),
      primario: 'No entregar', listo: 'Listo: pedido cerrado sin entregar.',
      ops: () => {
        if (!valor('acMotivo')) return fallar('Escribe el motivo.', 'acMotivo');
        const ops = [['mezclar', 'solicitudes', s.id, { estado: 'rechazada', motivo: valor('acMotivo') }]];
        if (s.pideRol) ops.push(aviso(s.pideRol, 'Tu pedido no se entregó', `${s.articulo}: ${valor('acMotivo')}.`));
        return ops;
      }
    });
  }

  function pedirMaterial() {
    const arts = articulos().slice().sort((a, b) => String(a.categoria).localeCompare(String(b.categoria)) || String(a.nombre).localeCompare(String(b.nombre)));
    if (!arts.length) { A().toast('Todavía no hay artículos en bodega.'); return; }
    abrirAccion({
      titulo: 'Pedir material de bodega', sub: 'La encargada de bodega recibe el pedido y te avisa cuando lo entregue.',
      campos: campoSel('acArt', 'Artículo', arts.map(a => [a.id, `${a.nombre} (${num(a.cantidad) > 0 ? 'hay ' + cantTxt(a.cantidad, a.unidad) : 'agotado'})`]), arts[0].id) +
        campoNum('acCant', 'Cantidad', 1, 1, 999) + campoTxt('acPara', 'Para qué', '', 'Ej: viaje a la Comunidad Ejemplo Norte', 120) +
        campoSel('acProy', 'Proyecto', PROYECTOS.map(p => [p, p]), PROYECTOS[0]),
      primario: 'Pedir', icono: 'enviar', listo: `Listo: pedido enviado. Le toca a ${nombreRol('asistente')} entregarlo.`,
      ops: () => {
        const a = artPorId(valor('acArt')), n = entero('acCant');
        if (!a) return fallar('Escoge un artículo.', 'acArt');
        if (!(n > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        if (!valor('acPara')) return fallar('Escribe para qué lo necesitas.', 'acPara');
        return [
          ['set', 'solicitudes', window.nube.idNuevo('so'), { articuloId: a.id, articulo: a.nombre, cantidad: n, pide: persona().nombre, pideRol: persona().rol, paraQue: valor('acPara'), proyecto: valor('acProy'), estado: 'pendiente', fecha: ahora(), entregadaPor: '', fechaEntrega: '', motivo: '' }],
          aviso('asistente', 'Nuevo pedido de material', `${persona().nombre} pide ${cantTxt(n, a.unidad)} de ${a.nombre}.`)
        ];
      }
    });
  }

  /* ---------- eventos ---------- */
  $('invSecciones').addEventListener('click', e => {
    const b = e.target.closest('[data-sec]'); if (!b) return;
    seccion = b.dataset.sec; A().S.filtro.inventario = '';
    A().pintarTodo();
  });
  $('qInventario').addEventListener('input', () => pintar());
  $('btnPedirMaterial').addEventListener('click', pedirMaterial);
  $('invContenido').addEventListener('click', e => {
    const b = e.target.closest('[data-accion]'); if (!b) return;
    const d = A().S.datos, id = b.dataset.id;
    const c = d.compras.find(x => x.id === id), s = d.solicitudes.find(x => x.id === id), a = artPorId(id);
    const que = b.dataset.accion;
    if (que === 'pedir' && a) pedirCompra(a, Number(b.dataset.cant) || 0);
    else if (que === 'autorizar' && c) autorizar(c);
    else if (que === 'rechazar' && c) rechazar(c);
    else if (que === 'comprar' && c) registrarCompra(c);
    else if (que === 'recibir' && c) recibir(c);
    else if (que === 'entregar' && s) entregar(s);
    else if (que === 'noentregar' && s) noEntregar(s);
    else A().toast('Ese registro ya cambió. Revisa la lista otra vez.');
  });
  $('acForm').addEventListener('submit', e => { e.preventDefault(); guardar(); });
  $('acSecundario').addEventListener('click', () => { if (accion && accion.alSecundario) accion.alSecundario(); });

  window.Inventario = Object.freeze({ pintar, resumen, tareas });
})();
