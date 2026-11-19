/* inventario.js — Módulo Inventario de la demo: bodega de consumibles con las compras adentro.
   Partes: Qué hay que hacer · Existencias · Movimientos · Pedidos de material · Compras · Conteo · Resumen.
   Las tareas salen solas de los datos:
     artículo agotado o bajo sin compra abierta  -> Pedir compra        (encargada de bodega)
     pedido de material pendiente               -> Entregar            (encargada de bodega)
     compra pedida                              -> Autorizar/Rechazar  (autoriza compras; si la pidió él, la Jefe)
     compra autorizada                          -> Registrar compra    (encargada de bodega)
     compra hecha                               -> Recibir             (encargada de bodega; si es de bodega, suma a la cantidad)
     compra sin autorización sin revisar        -> Revisar             (Jefe)
   Cada acción deja un aviso en la campana de quien sigue y, si tiene los avisos activados, una notificación en su teléfono.
   Usa las ayudas que app.js publica en window.App (se leen al usarlas, porque este archivo carga antes). */
(function () {
  'use strict';
  const A = () => window.App;
  const $ = id => document.getElementById(id);
  const ABIERTA = ['pedido', 'autorizado', 'comprado'];
  const SECCIONES = [['hacer', 'Qué hay que hacer'], ['existencias', 'Existencias'], ['movimientos', 'Movimientos'], ['solicitudes', 'Pedidos de material'], ['compras', 'Compras'], ['conteo', 'Conteo'], ['resumen', 'Resumen']];
  const PROYECTOS = ['Proyecto Costa Norte', 'Proyecto Ruta Alta', 'Oficina'];
  const CATEGORIAS = ['EPP', 'Eléctricos', 'Cómputo', 'Accesorios', 'Papelería', 'Aseo', 'Cafetería', 'Refrigerios', 'Herramientas', 'Otro'];
  const UNIDADES = ['unidades', 'pares', 'cajas', 'resmas', 'rollos', 'galones', 'paquetes'];
  const SINGULAR = { unidades: 'unidad', pares: 'par', cajas: 'caja', resmas: 'resma', rollos: 'rollo', galones: 'galón', paquetes: 'paquete' };
  const EST_ART = { agotado: ['Agotado', 's-peligro', 'peligro'], bajo: ['Bajo del mínimo', 's-warn', 'org'], bien: ['Bien', 's-disco', 'disco'] };
  const EST_CO = {
    pedido: ['Por autorizar', 's-org', 'org'], autorizado: ['Autorizada, falta comprar', 's-listo', 'listo'], rechazado: ['Rechazada', 'none', 'pend'],
    comprado: ['Comprada, falta recibir', 's-listo', 'listo'], recibido: ['Recibida', 's-disco', 'disco'], 'sin-autorizar': ['Sin autorizar', 's-peligro', 'peligro']
  };
  const EST_SOL = { pendiente: ['En espera', 's-org', 'org'], entregada: ['Entregado', 's-disco', 'disco'], rechazada: ['No se entregó', 's-peligro', 'peligro'] };
  const MOTIVO_MOV = { inicial: 'Cantidad inicial', compra: 'Compra recibida', entrega: 'Entrega', devolucion: 'Devolución', conteo: 'Ajuste por conteo', dano: 'Daño o pérdida' };
  let seccion = 'hacer';
  const sub = { movimientos: 'todos', solicitudes: 'pendiente', compras: 'curso' };
  let guardando = false, accion = null, pushPendientes = [];

  /* ---------- datos derivados ---------- */
  const num = v => Number(v) || 0;
  const esH = v => A().esH(v);
  const cantTxt = (n, unidad) => `${num(n)} ${num(n) === 1 ? (SINGULAR[unidad] || unidad || '') : (unidad || '')}`.trim();
  const estadoArt = a => (num(a.cantidad) <= 0 ? 'agotado' : num(a.cantidad) <= num(a.minimo) ? 'bajo' : 'bien');
  const D = () => A().S.datos;
  const articulos = () => D().articulos;
  const artPorId = id => articulos().find(a => a.id === id) || null;
  const compraAbierta = id => D().compras.find(c => c.articuloId === id && ABIERTA.includes(c.estado)) || null;
  const persona = () => A().S.persona;
  const nombreRol = rol => { const p = window.DEMO.porRol(rol); return p ? p.corto : rol; };
  const perm = () => A().permiso('inventario');
  const esBodega = () => perm() === 'bodega';
  const autorizadorDe = c => (c.pideRol === 'compras' ? 'jefe' : 'compras');   // nadie autoriza su propio pedido
  const puedoHacer = rol => (rol === 'asistente' && esBodega()) || (rol === 'compras' && perm() === 'autoriza') || (rol === 'jefe' && persona() && persona().rol === 'jefe');
  const esMia = t => puedoHacer(t.rol);
  const ahora = () => new Date().toISOString();
  const delMes = f => String(f || '').slice(0, 7) === A().hoyISO().slice(0, 7);
  const texto = (...partes) => partes.filter(Boolean).join(' ').toLowerCase();

  /** Lista de tareas pendientes, de la más urgente a la menos. */
  function tareas() {
    const d = D(), out = [];
    articulos().forEach(a => {
      const e = estadoArt(a);
      if (e !== 'bien' && !compraAbierta(a.id)) out.push({ tipo: 'pedir', rol: 'asistente', urg: e === 'agotado' ? 0 : 5, art: a, sug: Math.max(1, num(a.maximo) - num(a.cantidad)) });
    });
    d.solicitudes.filter(s => s.estado === 'pendiente').forEach(s => {
      const a = artPorId(s.articuloId);
      out.push({ tipo: 'entregar', rol: 'asistente', urg: 1, sol: s, art: a, alcanza: !!a && num(a.cantidad) >= num(s.cantidad) });
    });
    d.compras.forEach(c => {
      const a = c.articuloId ? artPorId(c.articuloId) : null;
      if (c.estado === 'pedido') out.push({ tipo: 'autorizar', rol: autorizadorDe(c), urg: a && estadoArt(a) === 'agotado' ? 0 : 2, compra: c, art: a });
      else if (c.estado === 'autorizado') out.push({ tipo: 'comprar', rol: 'asistente', urg: 3, compra: c, art: a });
      else if (c.estado === 'comprado') out.push({ tipo: 'recibir', rol: 'asistente', urg: 3, compra: c, art: a });
      else if (c.estado === 'sin-autorizar' && !c.revisada) out.push({ tipo: 'revisar', rol: 'jefe', urg: 4, compra: c, art: a });
    });
    return out.sort((x, y) => x.urg - y.urg);
  }

  /** Números para Inicio y para la insignia de la pestaña. */
  function resumen() {
    const d = D(), p = persona();
    return {
      faltan: articulos().filter(a => estadoArt(a) !== 'bien').length,
      porEntregar: d.solicitudes.filter(s => s.estado === 'pendiente').length,
      porAutorizar: d.compras.filter(c => c.estado === 'pedido').length,
      sinAutorizar: d.compras.filter(c => c.estado === 'sin-autorizar' && !c.revisada).length,
      misPedidos: p ? d.solicitudes.filter(s => s.estado === 'pendiente' && s.pide === p.nombre).length + d.compras.filter(c => c.pide === p.nombre && ABIERTA.includes(c.estado)).length : 0,
      mias: tareas().filter(esMia).length
    };
  }

  /* ---------- pintar ---------- */
  function pintar() {
    const App = A(), S = App.S;
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
    $('invSecciones').innerHTML = SECCIONES.map(([k, n]) => `<button type="button" class="chip" data-sec="${k}" aria-pressed="${seccion === k}">${esH(n)}${k === 'hacer' && mias ? ` <span class="n">${mias}</span>` : ''}</button>`).join('');
    const q = $('qInventario');
    q.hidden = !['existencias', 'movimientos', 'compras'].includes(seccion);
    q.placeholder = seccion === 'movimientos' ? 'Buscar artículo, persona o proyecto' : seccion === 'compras' ? 'Buscar compra, proveedor o persona' : 'Buscar artículo, categoría o ubicación';
    const c = $('invContenido');
    if (['articulos', 'compras', 'solicitudes', 'movimientos'].some(App.cargando)) { c.innerHTML = UI.esqueleto(3); return; }
    const html = { hacer: perm() === 'pide' ? htmlMios : () => htmlTareas(f), existencias: () => htmlExistencias(f), movimientos: htmlMovimientos, solicitudes: htmlSolicitudes, compras: htmlCompras, conteo: htmlConteo, resumen: htmlResumen }[seccion];
    c.innerHTML = html();
    window.llenarIconos(c);
  }

  const subChips = (clave, ops) => `<div class="chips sub" role="group" aria-label="Filtrar">${ops.map(([k, n, cuenta]) => `<button type="button" class="chip" data-sub="${clave}" data-val="${k}" aria-pressed="${sub[clave] === k}">${esH(n)}${cuenta != null ? ` <span class="n">${cuenta}</span>` : ''}</button>`).join('')}</div>`;
  const barraBotones = botones => botones.length ? `<div class="row acciones-inv">${botones.join('')}</div>` : '';
  const boton = (accionId, txt, icono, extra, clase) => `<button class="btn ${clase || 'small'}" type="button" data-accion="${accionId}"${extra || ''}>${icono ? `<span data-ico="${icono}"></span>` : ''}${esH(txt)}</button>`;

  /* --- Qué hay que hacer --- */
  function htmlTareas(f) {
    let lista = tareas();
    if (f === 'entregar') lista = lista.filter(t => t.tipo === 'entregar');
    if (f === 'compras') lista = lista.filter(t => ['autorizar', 'comprar', 'recibir'].includes(t.tipo));
    const mias = lista.filter(esMia), otras = lista.filter(t => !esMia(t));
    const filtroTxt = f === 'entregar' ? ' (solo pedidos por entregar)' : f === 'compras' ? ' (solo compras en curso)' : '';
    let h = '';
    if (persona().rol === 'jefe') {
      const grupos = {};
      lista.forEach(t => { (grupos[t.rol] = grupos[t.rol] || []).push(t); });
      const orden = ['jefe', 'asistente', 'compras'];
      h += Object.keys(grupos).sort((a, b) => orden.indexOf(a) - orden.indexOf(b)).map(rol =>
        `<div class="section-label">${rol === 'jefe' ? 'Te toca a ti' : 'Le toca a ' + esH(nombreRol(rol))} (${grupos[rol].length})${esH(filtroTxt)}</div>
         <div class="list">${grupos[rol].map(t => tarjeta(t, rol === 'jefe')).join('')}</div>`).join('');
      return h || UI.vacio('checkCirculo', 'Nada pendiente', 'La bodega y las compras están al día.');
    }
    h += `<div class="section-label">Te toca a ti (${mias.length})${esH(filtroTxt)}</div>`;
    h += mias.length ? `<div class="list">${mias.map(t => tarjeta(t, true)).join('')}</div>` : UI.vacio('checkCirculo', 'Nada pendiente para ti', 'Cuando algo te toque, aparece aquí con su botón y te llega un aviso.');
    if (otras.length) h += `<div class="section-label">Le toca a otras personas (${otras.length})</div><div class="list">${otras.map(t => tarjeta(t, false)).join('')}</div>`;
    return h;
  }

  // Una tarea: qué pasa, con qué datos, y el botón para hacerla (solo si le toca a la persona).
  function tarjeta(t, mia) {
    const App = A(), pill = App.pill, cop = App.cop;
    const a = t.art, c = t.compra, s = t.sol;
    let icono, tono, titulo, detalle = [], extra = '', botones = '';
    if (t.tipo === 'pedir') {
      const e = estadoArt(a);
      icono = 'carrito'; tono = e === 'agotado' ? 'peligro' : 'org';
      titulo = `Pedir compra: ${a.nombre}`;
      detalle.push(e === 'agotado' ? 'Se agotó' : `Quedan ${cantTxt(a.cantidad, a.unidad)} y el mínimo es ${num(a.minimo)}`, a.ubicacion);
      extra = pill(EST_ART[e][0], EST_ART[e][1]);
      botones = boton('pedir', `Pedir compra (${cantTxt(t.sug, a.unidad)})`, 'carrito', ` data-id="${esH(a.id)}"`, 'primary small');
    } else if (t.tipo === 'entregar') {
      const unidad = a ? a.unidad : '';
      icono = 'entrega'; tono = t.alcanza ? 'listo' : 'org';
      titulo = `Entregar a ${s.pide}: ${s.articulo}`;
      detalle.push(cantTxt(s.cantidad, unidad), s.paraQue, s.proyecto, 'pidió ' + App.hace(s.fecha));
      if (!a) extra = pill('El artículo ya no existe en bodega', 's-peligro', 'aviso');
      else if (!t.alcanza) extra = `<div class="aviso warn"><span><b>No alcanza:</b> hay ${esH(cantTxt(a.cantidad, a.unidad))} en bodega.${compraAbierta(a.id) ? ' Ya hay una compra en curso.' : ''}</span></div>`;
      else extra = pill(`Hay ${cantTxt(a.cantidad, a.unidad)}`, 's-disco', 'check');
      if (a) {
        botones = t.alcanza ? boton('entregar', 'Entregar', 'entrega', ` data-id="${esH(s.id)}"`, 'primary small')
          : (num(a.cantidad) > 0 ? boton('entregar', `Entregar lo que hay (${num(a.cantidad)})`, 'entrega', ` data-id="${esH(s.id)}"`, 'primary small') : '') +
            (compraAbierta(a.id) ? '' : boton('pedir', 'Pedir compra', 'carrito', ` data-id="${esH(a.id)}" data-cant="${esH(Math.max(num(s.cantidad) - num(a.cantidad), num(a.maximo) - num(a.cantidad), 1))}"`));
      }
      botones += boton('noentregar', 'No entregar', '', ` data-id="${esH(s.id)}"`, 'ghost small');
    } else if (t.tipo === 'autorizar') {
      icono = 'carrito'; tono = 'org';
      titulo = `Autorizar compra: ${a ? a.nombre : c.que}`;
      detalle.push(cantTxt(c.cantidad, c.unidad), 'aprox. ' + cop(c.valorAprox), 'pidió ' + c.pide, c.paraQue);
      if (a && estadoArt(a) !== 'bien') extra = pill(estadoArt(a) === 'agotado' ? 'En bodega: agotado' : `En bodega: quedan ${cantTxt(a.cantidad, a.unidad)}`, EST_ART[estadoArt(a)][1]);
      if (c.pideRol === 'compras') extra += pill('La pidió quien autoriza: la autoriza la Jefe', 's-pend', 'info');
      botones = boton('autorizar', 'Autorizar', 'check', ` data-id="${esH(c.id)}"`, 'primary small') + boton('rechazar', 'Rechazar', '', ` data-id="${esH(c.id)}"`, 'ghost small');
    } else if (t.tipo === 'comprar') {
      icono = 'carrito'; tono = 'listo';
      titulo = `Comprar: ${a ? a.nombre : c.que}`;
      detalle.push(cantTxt(c.cantidad, c.unidad), 'autorizada por ' + (c.autoriza || 'quien autoriza'), 'aprox. ' + cop(c.valorAprox));
      botones = boton('comprar', 'Registrar compra', 'carrito', ` data-id="${esH(c.id)}"`, 'primary small');
    } else if (t.tipo === 'recibir') {
      icono = 'caja'; tono = 'disco';
      titulo = a ? `Recibir en bodega: ${a.nombre}` : `Recibir y entregar: ${c.que}`;
      detalle.push(cantTxt(c.cantidad, c.unidad), `comprado en ${c.proveedor || 'proveedor sin nombre'}`, c.fechaCompra ? App.fechaCorta(c.fechaCompra) : '', c.valorReal ? cop(c.valorReal) : '');
      if (!a) extra = `<span class="meta">No va a bodega: se entrega a ${esH(c.pide)}.</span>`;
      botones = boton('recibir', a ? 'Recibir en bodega' : 'Marcar como recibida', 'caja', ` data-id="${esH(c.id)}"`, 'primary small');
    } else {
      icono = 'aviso'; tono = 'peligro';
      titulo = `Compra sin autorización: ${c.que}`;
      detalle.push(cop(c.valorReal || c.valorAprox), 'compró ' + c.pide, c.proveedor);
      extra = '<span class="meta">Nadie la autorizó antes de comprarla. Habla con quien compró y márcala como revisada.</span>';
      botones = boton('revisada', 'Marcar como revisada', 'check', ` data-id="${esH(c.id)}"`, 'small');
    }
    const detalleBtn = c ? boton('vercompra', 'Ver detalle', '', ` data-id="${esH(c.id)}"`, 'ghost small') : '';
    const pie = mia ? botones + detalleBtn : App.pill('Le toca a ' + nombreRol(t.rol), 'none', 'persona') + detalleBtn;
    return `<div class="card tarea st-${tono}">
      <div class="tarea-cab"><span class="ico t-${tono}" aria-hidden="true">${window.ico(icono)}</span>
        <div class="tarea-t"><b>${esH(titulo)}</b><span class="meta">${esH(detalle.filter(Boolean).join(' · '))}</span></div></div>
      ${extra}
      <div class="tarea-pie">${pie}</div>
    </div>`;
  }

  /* --- Lo mío (quien solo pide) --- */
  function htmlMios() {
    const p = persona();
    const sols = D().solicitudes.filter(s => s.pide === p.nombre).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const comps = D().compras.filter(c => c.pide === p.nombre).sort((a, b) => String(b.fechaPedido).localeCompare(String(a.fechaPedido)));
    let h = `<div class="section-label">Tus pedidos de material (${sols.length})</div>`;
    h += sols.length ? `<div class="list">${sols.map(tarjetaSolicitud).join('')}</div>` : UI.vacio('caja', 'No has pedido material', 'Toca «Pedir material» y la encargada de bodega te lo entrega.');
    h += `<div class="section-label">Tus compras pedidas (${comps.length})</div>`;
    h += comps.length ? `<div class="list">${comps.map(tarjetaCompra).join('')}</div>` : UI.vacio('carrito', 'No has pedido compras', 'Toca «Pedir una compra»: le llega el aviso a quien autoriza.');
    return h;
  }

  /* --- Existencias --- */
  function htmlExistencias(f) {
    const App = A();
    const q = $('qInventario').value.trim().toLowerCase();
    const orden = { agotado: 0, bajo: 1, bien: 2 };
    const todos = articulos().slice().sort((a, b) => (orden[estadoArt(a)] - orden[estadoArt(b)]) || String(a.nombre).localeCompare(String(b.nombre)));
    const vis = todos.filter(a => (!['agotado', 'bajo'].includes(f) || f === estadoArt(a)) && (!q || texto(a.nombre, a.categoria, a.ubicacion, a.proveedor).includes(q)));
    let h = barraBotones(esBodega() ? [boton('nuevoart', 'Agregar artículo', 'mas'), boton('entrada', 'Registrar entrada', 'importar'), boton('salida', 'Registrar salida', 'entrega')] : []);
    h += `<div class="count" aria-live="polite">${vis.length === todos.length ? todos.length + ' artículos' : vis.length + ' de ' + todos.length + ' artículos'}</div>`;
    if (!vis.length) return h + UI.vacio('vacio', 'No hay artículos con ese filtro', f ? 'Toca otra vez la cifra de arriba para ver todo.' : '');
    return h + `<div class="list">${vis.map(a => {
      const e = estadoArt(a), st = EST_ART[e], abierta = compraAbierta(a.id);
      const pct = Math.max(0, Math.min(100, Math.round(num(a.cantidad) / Math.max(1, num(a.maximo)) * 100)));
      const pctMin = Math.max(0, Math.min(100, Math.round(num(a.minimo) / Math.max(1, num(a.maximo)) * 100)));
      return `<button type="button" class="card art st-${st[2]}" data-accion="verart" data-id="${esH(a.id)}">
        <span class="card-head"><span class="card-title">${esH(a.nombre)}</span>${App.pill(st[0], st[1])}</span>
        <span class="card-sub">${esH(a.categoria)} · ${esH(a.ubicacion)}</span>
        <span class="nivel"><span class="nivel-n">${esH(num(a.cantidad))} <small>${esH(a.unidad)}</small></span>
          <span class="barra n-${e}" role="img" aria-label="${esH(`${num(a.cantidad)} de ${num(a.maximo)}; mínimo ${num(a.minimo)}`)}"><i style="width:${pct}%"></i><b style="left:${pctMin}%"></b></span>
          <span class="meta">mínimo ${esH(num(a.minimo))} · máximo ${esH(num(a.maximo))}</span></span>
        <span class="docs">${App.pill('Aprox. ' + App.cop(a.costo) + ' c/u', 's-pend')}${abierta ? App.pill('Compra en curso: ' + EST_CO[abierta.estado][0].toLowerCase(), 's-listo', 'carrito') : ''}</span>
      </button>`;
    }).join('')}</div>`;
  }

  /* --- Movimientos --- */
  function htmlMovimientos() {
    const App = A();
    const q = $('qInventario').value.trim().toLowerCase();
    const todos = D().movimientos.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const cuenta = t => todos.filter(m => m.tipo === t).length;
    const vis = todos.filter(m => (sub.movimientos === 'todos' || m.tipo === sub.movimientos) && (!q || texto(m.articulo, m.persona, m.proyecto, m.por, m.nota).includes(q)));
    let h = barraBotones(esBodega() ? [boton('entrada', 'Registrar entrada', 'importar'), boton('salida', 'Registrar salida', 'entrega')] : []);
    h += subChips('movimientos', [['todos', 'Todos', todos.length], ['entrada', 'Entradas', cuenta('entrada')], ['salida', 'Salidas', cuenta('salida')], ['ajuste', 'Ajustes', cuenta('ajuste')]]);
    if (!vis.length) return h + UI.vacio('historial', 'No hay movimientos', 'Aquí queda cada entrada y salida de la bodega.');
    return h + `<div class="list">${vis.slice(0, 80).map(m => {
      const a = artPorId(m.articuloId), u = a ? a.unidad : '';
      const signo = m.tipo === 'entrada' ? '+' : m.tipo === 'salida' ? '-' : (num(m.cantidad) > 0 ? '+' : '');
      const tono = m.tipo === 'entrada' ? 'disco' : m.tipo === 'salida' ? 'listo' : 'org';
      return `<div class="card mov st-${tono}">
        <div class="card-head"><div class="card-title">${esH(m.articulo)}</div><span class="mov-n t-${tono}">${esH(signo + Math.abs(num(m.cantidad)))}</span></div>
        <span class="meta">${esH([MOTIVO_MOV[m.motivo] || m.motivo, m.persona ? (m.tipo === 'salida' ? 'a ' : 'de ') + m.persona : '', m.proyecto, 'quedan ' + cantTxt(m.saldo, u)].filter(Boolean).join(' · '))}</span>
        <span class="meta">${esH(`Registró ${m.por} ${App.hace(m.fecha)}`)}${m.nota ? ' · ' + esH(m.nota) : ''}</span>
      </div>`;
    }).join('')}</div>${vis.length > 80 ? `<p class="meta">Se muestran los 80 más recientes de ${vis.length}.</p>` : ''}`;
  }

  /* --- Pedidos de material --- */
  function tarjetaSolicitud(s) {
    const App = A(), a = artPorId(s.articuloId), e = EST_SOL[s.estado] || ['Sin estado', 'none', 'pend'];
    const acciones = s.estado === 'pendiente' && esBodega() && a
      ? (num(a.cantidad) > 0 ? boton('entregar', num(a.cantidad) >= num(s.cantidad) ? 'Entregar' : `Entregar lo que hay (${num(a.cantidad)})`, 'entrega', ` data-id="${esH(s.id)}"`, 'primary small') : '') + boton('noentregar', 'No entregar', '', ` data-id="${esH(s.id)}"`, 'ghost small') : '';
    return `<div class="card tarea st-${e[2]}">
      <div class="card-head"><div class="card-title">${esH(s.articulo)}</div>${App.pill(e[0], e[1])}</div>
      <span class="meta">${esH([cantTxt(s.cantidad, a ? a.unidad : ''), 'pidió ' + s.pide, s.paraQue, s.proyecto, App.hace(s.fecha)].filter(Boolean).join(' · '))}</span>
      ${s.estado === 'pendiente' && a && num(a.cantidad) < num(s.cantidad) ? `<div class="aviso warn"><span><b>No alcanza:</b> hay ${esH(cantTxt(a.cantidad, a.unidad))}.</span></div>` : ''}
      ${s.estado === 'pendiente' && !esBodega() ? App.pill('Le toca a ' + nombreRol('asistente') + ' entregarlo', 'none', 'persona') : ''}
      ${s.estado === 'entregada' ? `<span class="meta">Entregó ${esH(s.entregadaPor)} ${esH(App.hace(s.fechaEntrega))}${s.motivo ? '. ' + esH(s.motivo) : ''}</span>` : ''}
      ${s.estado === 'rechazada' && s.motivo ? `<span class="meta">Motivo: ${esH(s.motivo)}</span>` : ''}
      ${acciones ? `<div class="tarea-pie">${acciones}</div>` : ''}
    </div>`;
  }
  function htmlSolicitudes() {
    const p = persona(), todas = D().solicitudes.filter(s => esBodega() || p.rol === 'jefe' || s.pide === p.nombre).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const cuenta = e => todas.filter(s => s.estado === e).length;
    const vis = todas.filter(s => sub.solicitudes === 'todos' || s.estado === sub.solicitudes);
    let h = subChips('solicitudes', [['pendiente', 'En espera', cuenta('pendiente')], ['entregada', 'Entregados', cuenta('entregada')], ['rechazada', 'No entregados', cuenta('rechazada')], ['todos', 'Todos', todas.length]]);
    if (!esBodega() && p.rol !== 'jefe') h = '<p class="meta">Aquí ves solo tus pedidos.</p>' + h;
    return h + (vis.length ? `<div class="list">${vis.map(tarjetaSolicitud).join('')}</div>` : UI.vacio('caja', 'No hay pedidos aquí', 'Cambia el filtro de arriba o pide material.'));
  }

  /* --- Compras --- */
  function tarjetaCompra(c) {
    const App = A(), e = EST_CO[c.estado] || ['Sin estado', 'none', 'pend'];
    const valor = c.valorReal ? App.cop(c.valorReal) : 'aprox. ' + App.cop(c.valorAprox);
    return `<button type="button" class="card tarea st-${e[2]}" data-accion="vercompra" data-id="${esH(c.id)}">
      <span class="card-head"><span class="card-title">${esH(c.que)}</span>${App.pill(e[0], e[1], c.estado === 'sin-autorizar' ? 'aviso' : '')}</span>
      <span class="meta">${esH([cantTxt(c.cantidad, c.unidad), c.categoria, valor].join(' · '))}</span>
      <span class="meta">${esH([`Pidió ${c.pide} el ${App.fechaCorta(c.fechaPedido || c.fechaCompra)}`, c.proveedor, c.articuloId ? 'va a bodega' : ''].filter(Boolean).join(' · '))}</span>
      <span class="docs">${c.factura ? App.pill('Con foto de factura', 's-pend', 'camara') : ''}${c.estado === 'sin-autorizar' && c.revisada ? App.pill('Revisada', 's-pend', 'check') : ''}${c.estado === 'pedido' ? App.pill('Le toca a ' + nombreRol(autorizadorDe(c)), 'none', 'persona') : ''}</span>
    </button>`;
  }
  function htmlCompras() {
    const q = $('qInventario').value.trim().toLowerCase();
    const todas = D().compras.slice().sort((a, b) => String(b.fechaPedido || b.fechaCompra).localeCompare(String(a.fechaPedido || a.fechaCompra)));
    const grupo = c => (ABIERTA.includes(c.estado) ? 'curso' : c.estado === 'recibido' ? 'recibidas' : c.estado === 'rechazado' ? 'rechazadas' : 'sin');
    const cuenta = g => todas.filter(c => grupo(c) === g).length;
    const vis = todas.filter(c => (sub.compras === 'todas' || grupo(c) === sub.compras) && (!q || texto(c.que, c.proveedor, c.pide, c.categoria, c.paraQue).includes(q)));
    let h = barraBotones(esBodega() ? [boton('sinaut', 'Registrar compra hecha sin autorización', 'aviso')] : []);
    h += subChips('compras', [['curso', 'En curso', cuenta('curso')], ['recibidas', 'Recibidas', cuenta('recibidas')], ['rechazadas', 'Rechazadas', cuenta('rechazadas')], ['sin', 'Sin autorizar', cuenta('sin')], ['todas', 'Todas', todas.length]]);
    return h + (vis.length ? `<div class="list">${vis.map(tarjetaCompra).join('')}</div>` : UI.vacio('carrito', 'No hay compras aquí', 'Cambia el filtro o toca «Pedir una compra».'));
  }

  /* --- Conteo --- */
  function htmlConteo() {
    const App = A();
    const ajustes = D().movimientos.filter(m => m.motivo === 'conteo').sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    let h = `<div class="note">El conteo físico compara lo que hay en los estantes con lo que dice la app. Las diferencias se ajustan con un motivo y quedan en Movimientos.</div>`;
    h += esBodega() ? barraBotones([boton('conteo', 'Empezar conteo', 'tarea', '', 'primary')]) : '<p class="meta">El conteo lo hace la encargada de bodega.</p>';
    if (!ajustes.length) return h + UI.vacio('tarea', 'Todavía no hay ajustes por conteo', '');
    const u = ajustes[0];
    h += `<div class="card"><b>Último ajuste por conteo</b><span class="meta">${esH(`${u.por}, ${App.hace(u.fecha)}`)}</span></div>`;
    h += `<div class="section-label">Ajustes por conteo (${ajustes.length})</div><div class="list">${ajustes.slice(0, 30).map(m => `<div class="card mov st-org">
      <div class="card-head"><div class="card-title">${esH(m.articulo)}</div><span class="mov-n t-org">${esH((num(m.cantidad) > 0 ? '+' : '') + num(m.cantidad))}</span></div>
      <span class="meta">${esH([`quedan ${num(m.saldo)}`, m.nota, `${m.por} ${App.hace(m.fecha)}`].filter(Boolean).join(' · '))}</span></div>`).join('')}</div>`;
    return h;
  }

  /* --- Resumen --- */
  function barras(filas, fmt) {
    const max = Math.max(1, ...filas.map(f => f[1]));
    if (!filas.length) return '<p class="meta">Sin datos este mes.</p>';
    return `<div class="barras">${filas.map(([n, v]) => `<div class="bf"><span class="bf-n">${esH(n)}</span><span class="bf-b"><i style="width:${Math.max(3, Math.round(v / max * 100))}%"></i></span><span class="bf-v">${esH(fmt(v))}</span></div>`).join('')}</div>`;
  }
  const agrupar = (lista, clave, valor) => Object.entries(lista.reduce((o, x) => { const k = clave(x) || 'Sin dato'; o[k] = (o[k] || 0) + valor(x); return o; }, {})).sort((a, b) => b[1] - a[1]);
  function htmlResumen() {
    const App = A(), cop = App.cop, d = D();
    const valorBodega = articulos().reduce((s, a) => s + num(a.cantidad) * num(a.costo), 0);
    const comprasMes = d.compras.filter(c => ['comprado', 'recibido', 'sin-autorizar'].includes(c.estado) && delMes(c.fechaCompra));
    const totalMes = comprasMes.reduce((s, c) => s + num(c.valorReal || c.valorAprox), 0);
    const sinAutMes = comprasMes.filter(c => c.estado === 'sin-autorizar').reduce((s, c) => s + num(c.valorReal || c.valorAprox), 0);
    const salidas = d.movimientos.filter(m => m.tipo === 'salida' && delMes(m.fecha));
    const costoDe = m => num(m.cantidad) * num((artPorId(m.articuloId) || {}).costo);
    const catDe = m => (artPorId(m.articuloId) || {}).categoria;
    let h = barraBotones(perm() !== 'pide' ? [boton('excel', 'Descargar Excel', 'excel', '', 'primary')] : []);
    h += `<div class="resumen-grid">
      <div class="card"><span class="meta">Valor de lo que hay en bodega</span><span class="rm-n valor">${esH(cop(valorBodega))}</span><span class="meta">${articulos().length} artículos</span></div>
      <div class="card"><span class="meta">Comprado este mes (${comprasMes.length})</span><span class="rm-n valor">${esH(cop(totalMes))}</span>${sinAutMes ? App.pill('Sin autorizar: ' + cop(sinAutMes), 's-peligro', 'aviso') : App.pill('Todo autorizado', 's-disco', 'check')}</div>
      <div class="card"><span class="meta">Salió de bodega este mes</span><span class="rm-n valor">${esH(cop(salidas.reduce((s, m) => s + costoDe(m), 0)))}</span><span class="meta">${salidas.length} salidas</span></div>
    </div>`;
    h += `<div class="section-label">Compras del mes por categoría</div><div class="card">${barras(agrupar(comprasMes, c => c.categoria, c => num(c.valorReal || c.valorAprox)), cop)}</div>`;
    h += `<div class="section-label">Consumo del mes por proyecto</div><div class="card">${barras(agrupar(salidas, m => m.proyecto, costoDe), cop)}</div>`;
    h += `<div class="section-label">Consumo del mes por categoría</div><div class="card">${barras(agrupar(salidas, catDe, costoDe), cop)}</div>`;
    h += `<div class="section-label">Lo que más sale (unidades este mes)</div><div class="card">${barras(agrupar(salidas, m => m.articulo, m => num(m.cantidad)).slice(0, 5), v => String(v))}</div>`;
    return h;
  }

  /* ---------- hoja de acción ---------- */
  const campoNum = (id, lbl, v, min, max, ayuda) => `<div class="field"><label for="${id}">${lbl}</label><input id="${id}" type="number" inputmode="numeric" min="${min}"${max != null ? ` max="${max}"` : ''} step="1" value="${esH(v)}">${ayuda ? `<span class="meta" id="${id}Ay">${esH(ayuda)}</span>` : ''}</div>`;
  const campoTxt = (id, lbl, v, ph, max) => `<div class="field"><label for="${id}">${lbl}</label><input id="${id}" type="text" maxlength="${max || 120}" autocomplete="off" value="${esH(v || '')}" placeholder="${esH(ph || '')}"></div>`;
  const campoSel = (id, lbl, ops, v) => `<div class="field"><label for="${id}">${lbl}</label><select id="${id}">${ops.map(([val, txt]) => `<option value="${esH(val)}"${val === v ? ' selected' : ''}>${esH(txt)}</option>`).join('')}</select></div>`;
  const opsArt = vacio => (vacio ? [['', vacio]] : []).concat(articulos().slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))).map(a => [a.id, `${a.nombre} (${num(a.cantidad) > 0 ? 'hay ' + cantTxt(a.cantidad, a.unidad) : 'agotado'})`]));
  function abrirAccion(o) {
    accion = o;
    $('acT').textContent = o.titulo; $('acSub').textContent = o.sub || '';
    $('acCampos').innerHTML = o.campos || '';
    window.llenarIconos($('acCampos'));
    const pri = $('acPrimario'); pri.hidden = !o.primario;
    pri.innerHTML = o.primario ? (o.icono ? window.ico(o.icono) : '') + esH(o.primario) : '';
    const sec = $('acSecundario'); sec.hidden = !o.secundario; sec.textContent = o.secundario || '';
    $('acCerrar').textContent = o.primario ? 'Cancelar' : 'Cerrar';
    $('acErr').hidden = true;
    A().abrirHoja('shAccion');
    const sh = $('shAccion').querySelector('.sheet'); if (sh) sh.scrollTop = 0;
  }
  const valor = id => ($(id) ? $(id).value.trim() : '');
  const entero = id => { const v = valor(id); return /^-?\d+$/.test(v) ? Number(v) : NaN; };
  function fallar(msg, id) { const e = $('acErr'); e.textContent = msg; e.hidden = false; if (id && $(id)) $(id).focus(); return false; }
  /** Aviso en la campana de un rol; después de guardar también va al teléfono de quien tenga ese rol. No se avisa a uno mismo. */
  function aviso(para, titulo, txt) {
    if (!para || (persona() && para === persona().rol)) return null;
    pushPendientes.push({ para, titulo, texto: txt });
    return ['set', 'avisos', window.nube.idNuevo('av'), { para, titulo, texto: txt, en: ahora(), modulo: 'inventario', leido: {} }];
  }
  const movimiento = o => ['set', 'movimientos', window.nube.idNuevo('mo'), Object.assign({ persona: '', proyecto: '', nota: '', compraId: '', solicitudId: '', por: persona().nombre, porRol: persona().rol, fecha: ahora() }, o)];
  const paso = (c, txt) => (Array.isArray(c.historial) ? c.historial : []).concat([{ fecha: ahora(), texto: txt, por: persona().nombre }]);

  async function guardar() {
    if (guardando || !accion || !accion.ops) return;
    $('acErr').hidden = true;
    pushPendientes = [];
    const ops = accion.ops();
    if (!ops) return;
    const lista = ops.filter(Boolean), envios = pushPendientes.slice();
    guardando = true; $('acPrimario').disabled = true; $('acSecundario').disabled = true;
    try {
      if (lista.length) await window.nube.lote(lista);
      A().cerrarHoja('shAccion');
      try { $('invContenido').focus({ preventScroll: true }); } catch (e) {}
      A().toast(accion.listo);
      accion = null;
      notificar(envios);
    } catch (e) { fallar(window.nube.explicar(e)); }
    finally { guardando = false; $('acPrimario').disabled = false; $('acSecundario').disabled = false; }
  }
  // Manda las notificaciones al teléfono (si hay teléfonos con avisos activados para ese rol). Nunca frena la app.
  function notificar(envios) {
    if (!window.Push || !envios.length) return;
    const subs = A().S.datos.suscripciones || [];
    envios.forEach(e => {
      const destino = subs.filter(s => s.rol === e.para);
      if (destino.length) Promise.resolve(window.Push.enviar(destino, { titulo: e.titulo, texto: e.texto, url: './#inventario', etiqueta: 'inventario' })).catch(() => {});
    });
  }

  /* ---------- acciones: compras ---------- */
  function pedirCompra(artId, cantSug) {
    const a = artId ? artPorId(artId) : null;
    const sug = cantSug || (a ? Math.max(1, num(a.maximo) - num(a.cantidad)) : 1);
    const aut = autorizadorDe({ pideRol: persona().rol });
    abrirAccion({
      titulo: 'Pedir una compra', sub: `Escribe qué se va a comprar. Le llega el aviso a ${nombreRol(aut)} para que la autorice.`,
      campos: campoSel('acArt', '¿Es para la bodega?', opsArt('No va a bodega'), a ? a.id : '') +
        campoTxt('acQue', 'Qué se va a comprar', a ? a.nombre : '', 'Ej: botas de seguridad talla 40', 100) +
        `<div class="fields cols">${campoNum('acCant', 'Cantidad', sug, 1, 99999)}${campoSel('acUni', 'Unidad', UNIDADES.map(u => [u, u]), a ? a.unidad : 'unidades')}</div>` +
        `<div class="fields cols">${campoSel('acCat', 'Categoría', CATEGORIAS.map(x => [x, x]), a && CATEGORIAS.includes(a.categoria) ? a.categoria : 'Otro')}${campoNum('acValor', 'Valor aproximado (pesos)', a ? num(a.costo) * sug : '', 0, null)}</div>` +
        campoTxt('acPara', 'Para qué', a ? 'Reponer la bodega' : '', 'Ej: para la cuadrilla de campo', 140) +
        campoSel('acProy', 'Proyecto', PROYECTOS.map(p => [p, p]), PROYECTOS[0]),
      primario: 'Pedir la compra', icono: 'enviar', listo: `Listo: compra pedida. Le llegó el aviso a ${nombreRol(aut)} para autorizarla.`,
      ops: () => {
        const art = artPorId(valor('acArt')), n = entero('acCant'), v = entero('acValor');
        if (!valor('acQue')) return fallar('Escribe qué se va a comprar.', 'acQue');
        if (!(n > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        if (!(v > 0)) return fallar('Escribe el valor aproximado en pesos, sin puntos ni comas.', 'acValor');
        if (!valor('acPara')) return fallar('Escribe para qué es la compra.', 'acPara');
        if (art && compraAbierta(art.id)) return fallar(`Ya hay una compra en curso de ${art.nombre}. Revísala en Compras.`, 'acArt');
        const quien = window.DEMO.porRol(aut);
        return [
          ['set', 'compras', window.nube.idNuevo('co'), { que: valor('acQue'), cantidad: n, unidad: valor('acUni'), categoria: valor('acCat'), valorAprox: v,
            paraQue: valor('acPara') + (valor('acProy') ? ` (${valor('acProy')})` : ''), pide: persona().nombre, pideRol: persona().rol, autoriza: quien ? quien.nombre : '',
            estado: 'pedido', proveedor: '', valorReal: 0, fechaPedido: A().hoyISO(), fechaCompra: '', entregadoA: '', motivoRechazo: '', articuloId: art ? art.id : '',
            factura: '', revisada: false, historial: [{ fecha: ahora(), texto: 'Pidió la compra', por: persona().nombre }] }],
          aviso(aut, 'Compra por autorizar', `${persona().nombre} pide comprar ${cantTxt(n, valor('acUni'))} de ${valor('acQue')} (aprox. ${A().cop(v)}).`)
        ];
      }
    });
    // Al escoger un artículo de bodega se llenan solos el nombre, la unidad, la categoría y el valor.
    $('acArt').addEventListener('change', () => {
      const x = artPorId(valor('acArt')); if (!x) return;
      $('acQue').value = x.nombre; $('acUni').value = x.unidad; $('acCat').value = CATEGORIAS.includes(x.categoria) ? x.categoria : 'Otro';
      const n = Math.max(1, num(x.maximo) - num(x.cantidad)); $('acCant').value = n; $('acValor').value = num(x.costo) * n;
      if (!valor('acPara')) $('acPara').value = 'Reponer la bodega';
    });
  }

  function autorizar(c) {
    const a = c.articuloId ? artPorId(c.articuloId) : null;
    abrirAccion({
      titulo: 'Autorizar compra', sub: `${c.que}: ${cantTxt(c.cantidad, c.unidad)}, aprox. ${A().cop(c.valorAprox)}. Pidió ${c.pide}: ${c.paraQue}.${a ? ` En bodega hay ${cantTxt(a.cantidad, a.unidad)}.` : ''}`,
      primario: 'Autorizar', icono: 'check', secundario: 'Rechazar', listo: `Listo: compra autorizada. Le llegó el aviso a ${nombreRol('asistente')} para comprarla.`,
      ops: () => {
        if (c.pide === persona().nombre) return fallar('No puedes autorizar una compra que pediste tú.');
        return [
          ['mezclar', 'compras', c.id, { estado: 'autorizado', autoriza: persona().nombre, historial: paso(c, 'Autorizó la compra') }],
          aviso('asistente', 'Compra autorizada: hay que comprar', `${persona().nombre} autorizó comprar ${cantTxt(c.cantidad, c.unidad)} de ${c.que}.`),
          c.pideRol !== 'asistente' ? aviso(c.pideRol, 'Te autorizaron la compra', `${persona().nombre} autorizó tu compra de ${c.que}.`) : null
        ];
      },
      alSecundario: () => rechazar(c)
    });
  }
  function rechazar(c) {
    abrirAccion({
      titulo: 'Rechazar compra', sub: `${c.que}: ${cantTxt(c.cantidad, c.unidad)}, pedida por ${c.pide}.`,
      campos: campoTxt('acMotivo', 'Motivo (lo verá quien pidió)', '', 'Ej: ya hay en la otra bodega', 160),
      primario: 'Rechazar', listo: 'Listo: compra rechazada. Quien la pidió ya tiene el aviso.',
      ops: () => {
        if (!valor('acMotivo')) return fallar('Escribe el motivo.', 'acMotivo');
        if (c.pide === persona().nombre) return fallar('No puedes decidir sobre una compra que pediste tú.');
        return [['mezclar', 'compras', c.id, { estado: 'rechazado', motivoRechazo: valor('acMotivo'), autoriza: persona().nombre, historial: paso(c, `Rechazó la compra: ${valor('acMotivo')}`) }],
          aviso(c.pideRol, 'Rechazaron tu compra', `${c.que}: ${valor('acMotivo')}.`)];
      }
    });
  }

  // Foto de la factura: se achica en el teléfono (máximo 1280 px, JPEG) y se guarda con la compra.
  let fotoFactura = '';
  function leerFoto(archivo) {
    return new Promise((res, rej) => {
      if (!archivo || !/^image\//.test(archivo.type)) { rej(new Error('tipo')); return; }
      const url = URL.createObjectURL(archivo), img = new Image();
      img.onload = () => {
        const esc = Math.min(1, 1280 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * esc); cv.height = Math.round(img.height * esc);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        let q = 0.62, dato = cv.toDataURL('image/jpeg', q);
        while (dato.length > 700000 && q > 0.3) { q -= 0.1; dato = cv.toDataURL('image/jpeg', q); }
        if (dato.length > 900000) rej(new Error('grande')); else res(dato);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('tipo')); };
      img.src = url;
    });
  }
  function registrarCompra(c, sinAutorizacion) {
    const a = c && c.articuloId ? artPorId(c.articuloId) : null;
    fotoFactura = '';
    abrirAccion({
      titulo: sinAutorizacion ? 'Registrar compra hecha sin autorización' : 'Registrar compra',
      sub: sinAutorizacion ? 'Para que quede el registro: la Jefe y quien autoriza reciben el aviso y la ven en rojo.' : `${c.que}: ${cantTxt(c.cantidad, c.unidad)}, autorizada por ${c.autoriza || 'quien autoriza'}.`,
      campos: (sinAutorizacion ? campoTxt('acQue', 'Qué se compró', '', 'Ej: garrafones de agua', 100) + `<div class="fields cols">${campoNum('acCant', 'Cantidad', 1, 1, 99999)}${campoSel('acUni', 'Unidad', UNIDADES.map(u => [u, u]), 'unidades')}</div>` + campoSel('acCat', 'Categoría', CATEGORIAS.map(x => [x, x]), 'Otro') + campoTxt('acPara', 'Para qué', '', 'Ej: para la reunión de hoy', 140) + campoTxt('acQuien', 'Quién compró', '', 'Nombre', 60) : '') +
        campoTxt('acProv', 'Proveedor', (a && a.proveedor) || (c && c.proveedor) || '', 'Dónde se compró') +
        campoNum('acValor', 'Valor pagado (pesos)', c ? c.valorAprox : '', 0, null, c ? `Autorizado: aprox. ${A().cop(c.valorAprox)}.` : '') +
        `<div class="field"><span class="lbl">Foto de la factura</span><label class="btn"><span data-ico="camara"></span><span id="acFotoTxt">Tomar o escoger foto</span><input id="acFoto" type="file" accept="image/*" capture="environment" hidden></label><img id="acFotoVer" class="factura-mini" alt="Foto de la factura" hidden></div>`,
      primario: 'Guardar compra', icono: 'check',
      listo: sinAutorizacion ? 'Listo: compra registrada. Quedó marcada sin autorización.' : (a ? 'Listo: compra registrada. Cuando llegue, recíbela en bodega.' : 'Listo: compra registrada. Cuando llegue, márcala como recibida.'),
      ops: () => {
        const v = entero('acValor');
        if (sinAutorizacion && !valor('acQue')) return fallar('Escribe qué se compró.', 'acQue');
        if (sinAutorizacion && !(entero('acCant') > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        if (sinAutorizacion && !valor('acQuien')) return fallar('Escribe quién compró.', 'acQuien');
        if (!valor('acProv')) return fallar('Escribe el proveedor.', 'acProv');
        if (!(v > 0)) return fallar('Escribe el valor pagado en pesos, sin puntos ni comas.', 'acValor');
        if (sinAutorizacion) {
          return [['set', 'compras', window.nube.idNuevo('co'), { que: valor('acQue'), cantidad: entero('acCant'), unidad: valor('acUni'), categoria: valor('acCat'), valorAprox: v, paraQue: valor('acPara') || 'Sin dato',
            pide: valor('acQuien'), pideRol: persona().rol, autoriza: '', estado: 'sin-autorizar', proveedor: valor('acProv'), valorReal: v, fechaPedido: A().hoyISO(), fechaCompra: A().hoyISO(), entregadoA: '', motivoRechazo: '', articuloId: '',
            factura: fotoFactura, revisada: false, historial: [{ fecha: ahora(), texto: `Registró una compra de ${valor('acQuien')} hecha sin autorización en ${valor('acProv')}`, por: persona().nombre }] }],
            aviso('jefe', 'Compra sin autorización', `${valor('acQuien')} compró ${valor('acQue')} en ${valor('acProv')} (${A().cop(v)}) sin autorización.`),
            aviso('compras', 'Compra sin autorización', `${valor('acQuien')} compró ${valor('acQue')} (${A().cop(v)}) sin autorización.`)];
        }
        return [['mezclar', 'compras', c.id, { estado: 'comprado', proveedor: valor('acProv'), valorReal: v, fechaCompra: A().hoyISO(), factura: fotoFactura || c.factura || '', historial: paso(c, `Compró en ${valor('acProv')} por ${A().cop(v)}`) }],
          c.pideRol !== 'asistente' ? aviso(c.pideRol, 'Ya se compró', `Se compró ${c.que} en ${valor('acProv')}.`) : null];
      }
    });
    $('acFoto').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      $('acFotoTxt').textContent = 'Preparando la foto…';
      try {
        fotoFactura = await leerFoto(f);
        const ver = $('acFotoVer'); ver.src = fotoFactura; ver.hidden = false; $('acFotoTxt').textContent = 'Cambiar foto';
        $('acErr').hidden = true;
      } catch (er) { fotoFactura = ''; $('acFotoTxt').textContent = 'Tomar o escoger foto'; fallar(er.message === 'grande' ? 'La foto es muy pesada. Toma otra más de cerca.' : 'Ese archivo no es una foto. Escoge una imagen.'); }
    });
  }

  function recibir(c) {
    const a = c.articuloId ? artPorId(c.articuloId) : null;
    if (c.articuloId && !a) { A().toast('Ese artículo ya no existe en bodega.'); return; }
    abrirAccion({
      titulo: a ? 'Recibir en bodega' : 'Marcar como recibida',
      sub: a ? `${c.que}: compradas ${cantTxt(c.cantidad, c.unidad)} en ${c.proveedor || 'el proveedor'}. Ahora hay ${cantTxt(a.cantidad, a.unidad)}.` : `${c.que}: no va a bodega. Se entrega a ${c.pide}.`,
      campos: (a ? campoNum('acCant', `Cantidad que llegó (${esH(a.unidad)})`, c.cantidad, 1, 99999, 'Si llegó menos de lo comprado, escribe lo que llegó.') : campoTxt('acQuien', 'A quién se entregó', c.pide, '', 60)) + campoTxt('acNota', 'Nota (opcional)', '', 'Ej: llegaron en buen estado', 160),
      primario: a ? 'Recibir en bodega' : 'Marcar como recibida', icono: 'caja', listo: a ? 'Listo: recibido en bodega. La cantidad ya se sumó.' : 'Listo: compra recibida y entregada.',
      ops: () => {
        if (!a) {
          if (!valor('acQuien')) return fallar('Escribe a quién se entregó.', 'acQuien');
          return [['mezclar', 'compras', c.id, { estado: 'recibido', entregadoA: valor('acQuien'), historial: paso(c, `Entregado a ${valor('acQuien')}${valor('acNota') ? '. ' + valor('acNota') : ''}`) }],
            aviso(c.pideRol, 'Llegó tu compra', `${c.que} ya llegó y se entregó a ${valor('acQuien')}.`)];
        }
        const n = entero('acCant');
        if (!(n > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        const nota = [valor('acNota'), n < num(c.cantidad) ? `Llegaron ${n} de ${num(c.cantidad)}` : ''].filter(Boolean).join('. ');
        return [
          ['mezclar', 'compras', c.id, { estado: 'recibido', historial: paso(c, `Recibido en bodega: ${cantTxt(n, a.unidad)}${nota ? '. ' + nota : ''}`) }],
          ['update', 'articulos', a.id, { cantidad: window.nube.incremento(n) }],
          movimiento({ articuloId: a.id, articulo: a.nombre, tipo: 'entrada', motivo: 'compra', cantidad: n, saldo: num(a.cantidad) + n, persona: c.proveedor || '', nota, compraId: c.id }),
          c.pideRol !== 'asistente' ? aviso(c.pideRol, 'Llegó tu compra', `${c.que} ya está en bodega.`) : null
        ];
      }
    });
  }
  function marcarRevisada(c) {
    abrirAccion({
      titulo: 'Marcar como revisada', sub: `${c.que}: ${A().cop(c.valorReal || c.valorAprox)}, compró ${c.pide} sin autorización.`,
      campos: campoTxt('acNota', 'Qué se habló (opcional)', '', 'Ej: hablé con Sofía, fue una urgencia', 160),
      primario: 'Marcar como revisada', icono: 'check', listo: 'Listo: compra revisada. Sigue contando en el resumen del mes.',
      ops: () => [['mezclar', 'compras', c.id, { revisada: true, historial: paso(c, 'Revisó la compra sin autorización' + (valor('acNota') ? ': ' + valor('acNota') : '')) }]]
    });
  }

  function verCompra(c) {
    const App = A(), a = c.articuloId ? artPorId(c.articuloId) : null, e = EST_CO[c.estado] || ['Sin estado', 'none'];
    const botones = [];
    if (c.estado === 'pedido' && puedoHacer(autorizadorDe(c)) && c.pide !== persona().nombre) botones.push(boton('autorizar', 'Autorizar', 'check', ` data-id="${esH(c.id)}"`, 'primary small'), boton('rechazar', 'Rechazar', '', ` data-id="${esH(c.id)}"`, 'ghost small'));
    if (c.estado === 'autorizado' && esBodega()) botones.push(boton('comprar', 'Registrar compra', 'carrito', ` data-id="${esH(c.id)}"`, 'primary small'));
    if (c.estado === 'comprado' && esBodega()) botones.push(boton('recibir', a ? 'Recibir en bodega' : 'Marcar como recibida', 'caja', ` data-id="${esH(c.id)}"`, 'primary small'));
    if (c.estado === 'sin-autorizar' && !c.revisada && persona().rol === 'jefe') botones.push(boton('revisada', 'Marcar como revisada', 'check', ` data-id="${esH(c.id)}"`, 'small'));
    const hist = (Array.isArray(c.historial) ? c.historial : []).slice().sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)));
    abrirAccion({
      titulo: c.que, sub: `${cantTxt(c.cantidad, c.unidad)} · ${c.categoria}`,
      campos: `<div class="row">${App.pill(e[0], e[1])}${c.estado === 'pedido' ? App.pill('Le toca a ' + nombreRol(autorizadorDe(c)), 'none', 'persona') : ''}</div>
        <dl class="datos">
          <dt>Pidió</dt><dd>${esH(c.pide)} el ${esH(App.fechaCorta(c.fechaPedido))}</dd>
          <dt>Para qué</dt><dd>${esH(c.paraQue)}</dd>
          <dt>Valor</dt><dd>aprox. ${esH(App.cop(c.valorAprox))}${c.valorReal ? ` · pagado ${esH(App.cop(c.valorReal))}` : ''}</dd>
          ${c.autoriza ? `<dt>${c.estado === 'pedido' ? 'Autoriza' : 'Decidió'}</dt><dd>${esH(c.autoriza)}</dd>` : ''}
          ${c.proveedor ? `<dt>Proveedor</dt><dd>${esH(c.proveedor)}${c.fechaCompra ? ', ' + esH(App.fechaCorta(c.fechaCompra)) : ''}</dd>` : ''}
          <dt>Bodega</dt><dd>${a ? `${esH(a.nombre)} (hay ${esH(cantTxt(a.cantidad, a.unidad))})` : 'No va a bodega'}</dd>
          ${c.motivoRechazo ? `<dt>Motivo</dt><dd>${esH(c.motivoRechazo)}</dd>` : ''}
          ${c.entregadoA ? `<dt>Entregado a</dt><dd>${esH(c.entregadoA)}</dd>` : ''}
        </dl>
        ${/^data:image\/jpeg;base64,/.test(c.factura || '') ? `<div class="field"><span class="lbl">Foto de la factura</span><img class="factura" src="${esH(c.factura)}" alt="Foto de la factura de ${esH(c.que)}"></div>` : ''}
        ${botones.length ? `<div class="tarea-pie">${botones.join('')}</div>` : ''}
        <div class="section-label">Cómo va</div>
        <ol class="linea">${hist.length ? hist.map(h => `<li><b>${esH(h.texto)}</b><span class="meta">${esH(h.por)} · ${esH(App.hace(h.fecha))}</span></li>`).join('') : '<li><span class="meta">Sin historial.</span></li>'}</ol>`
    });
  }

  /* ---------- acciones: bodega ---------- */
  function entregar(s) {
    const a = artPorId(s.articuloId);
    if (!a) { A().toast('Ese artículo ya no existe en bodega.'); return; }
    const max = num(a.cantidad), def = Math.min(num(s.cantidad), max);
    abrirAccion({
      titulo: 'Entregar material', sub: `${s.pide} pidió ${cantTxt(s.cantidad, a.unidad)} de ${a.nombre}. En bodega hay ${cantTxt(a.cantidad, a.unidad)}.`,
      campos: campoNum('acCant', `Cantidad que entregas (${esH(a.unidad)})`, def, 1, max, `Máximo ${max}: lo que hay en bodega.`) +
        campoSel('acProy', 'Proyecto', PROYECTOS.map(p => [p, p]), PROYECTOS.includes(s.proyecto) ? s.proyecto : PROYECTOS[0]),
      primario: 'Entregar', icono: 'entrega', listo: `Listo: entregado a ${s.pide}. Ya se restó de la bodega.`,
      ops: () => {
        const n = entero('acCant'), hay = num((artPorId(a.id) || a).cantidad);
        if (!(n > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        if (n > hay) return fallar(`Solo hay ${cantTxt(hay, a.unidad)} en bodega.`, 'acCant');
        const parcial = n < num(s.cantidad) ? `Se entregaron ${n} de ${num(s.cantidad)}` : '';
        return [
          ['mezclar', 'solicitudes', s.id, { estado: 'entregada', entregadaPor: persona().nombre, fechaEntrega: ahora(), motivo: parcial }],
          ['update', 'articulos', a.id, { cantidad: window.nube.incremento(-n) }],
          movimiento({ articuloId: a.id, articulo: a.nombre, tipo: 'salida', motivo: 'entrega', cantidad: n, saldo: hay - n, persona: s.pide, proyecto: valor('acProy'), nota: parcial, solicitudId: s.id }),
          aviso(s.pideRol, 'Tu pedido está listo', `${persona().nombre} te entregó ${cantTxt(n, a.unidad)} de ${a.nombre}.`)
        ];
      }
    });
  }
  function noEntregar(s) {
    abrirAccion({
      titulo: 'No entregar', sub: `${s.pide} pidió ${s.articulo}: ${num(s.cantidad)}.`,
      campos: campoTxt('acMotivo', 'Motivo (lo verá quien pidió)', '', 'Ej: no hay; ya se pidió la compra', 160),
      primario: 'No entregar', listo: 'Listo: pedido cerrado sin entregar.',
      ops: () => {
        if (!valor('acMotivo')) return fallar('Escribe el motivo.', 'acMotivo');
        return [['mezclar', 'solicitudes', s.id, { estado: 'rechazada', motivo: valor('acMotivo') }],
          aviso(s.pideRol, 'Tu pedido no se entregó', `${s.articulo}: ${valor('acMotivo')}.`)];
      }
    });
  }
  function pedirMaterial(artId) {
    if (!articulos().length) { A().toast('Todavía no hay artículos en bodega.'); return; }
    abrirAccion({
      titulo: 'Pedir material de bodega', sub: `Le llega el aviso a ${nombreRol('asistente')} y te avisa cuando lo entregue.`,
      campos: campoSel('acArt', 'Artículo', opsArt(), artId || opsArt()[0][0]) + campoNum('acCant', 'Cantidad', 1, 1, 999) +
        campoTxt('acPara', 'Para qué', '', 'Ej: viaje a la Comunidad Ejemplo Norte', 120) + campoSel('acProy', 'Proyecto', PROYECTOS.map(p => [p, p]), PROYECTOS[0]),
      primario: 'Pedir', icono: 'enviar', listo: `Listo: pedido enviado. Le llegó el aviso a ${nombreRol('asistente')}.`,
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
  function entradaSalida(tipo, artId) {
    const entrada = tipo === 'entrada';
    abrirAccion({
      titulo: entrada ? 'Registrar entrada' : 'Registrar salida',
      sub: entrada ? 'Para lo que vuelve a la bodega (devoluciones). Las compras entran con «Recibir en bodega».' : 'Para lo que sale sin pedido en la app: entrega directa, o algo dañado o perdido.',
      campos: campoSel('acArt', 'Artículo', opsArt(), artId || opsArt()[0][0]) + campoNum('acCant', 'Cantidad', 1, 1, 99999) +
        (entrada ? campoTxt('acPersona', 'Quién lo devolvió', '', 'Nombre', 60)
          : campoSel('acMotivoMov', 'Motivo', [['entrega', 'Entrega a una persona'], ['dano', 'Daño o pérdida']], 'entrega') + campoTxt('acPersona', 'A quién se entregó', '', 'Nombre (si es entrega)', 60)) +
        campoSel('acProy', 'Proyecto', [['', 'Sin proyecto']].concat(PROYECTOS.map(p => [p, p])), '') + campoTxt('acNota', entrada ? 'Nota (opcional)' : 'Nota (obligatoria si es daño o pérdida)', '', 'Ej: llegó con la caja rota', 160),
      primario: entrada ? 'Registrar entrada' : 'Registrar salida', icono: entrada ? 'importar' : 'entrega',
      listo: entrada ? 'Listo: entrada registrada. Ya se sumó a la bodega.' : 'Listo: salida registrada. Ya se restó de la bodega.',
      ops: () => {
        const a = artPorId(valor('acArt')), n = entero('acCant');
        if (!a) return fallar('Escoge un artículo.', 'acArt');
        if (!(n > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        const hay = num(a.cantidad), motivo = entrada ? 'devolucion' : valor('acMotivoMov');
        if (!entrada && n > hay) return fallar(`Solo hay ${cantTxt(hay, a.unidad)} en bodega.`, 'acCant');
        if (entrada && !valor('acPersona')) return fallar('Escribe quién lo devolvió.', 'acPersona');
        if (motivo === 'entrega' && !valor('acPersona')) return fallar('Escribe a quién se entregó.', 'acPersona');
        if (motivo === 'dano' && !valor('acNota')) return fallar('Escribe qué pasó en la nota.', 'acNota');
        return [
          ['update', 'articulos', a.id, { cantidad: window.nube.incremento(entrada ? n : -n) }],
          movimiento({ articuloId: a.id, articulo: a.nombre, tipo: entrada ? 'entrada' : 'salida', motivo, cantidad: n, saldo: entrada ? hay + n : hay - n, persona: valor('acPersona'), proyecto: valor('acProy'), nota: valor('acNota') }),
          motivo === 'dano' ? aviso('jefe', 'Material dañado o perdido', `${persona().nombre} registró ${cantTxt(n, a.unidad)} de ${a.nombre} como daño o pérdida: ${valor('acNota')}.`) : null
        ];
      }
    });
  }
  function editarArticulo(a) {
    const nuevo = !a;
    abrirAccion({
      titulo: nuevo ? 'Agregar artículo' : 'Editar artículo', sub: nuevo ? 'Un artículo nuevo para la bodega.' : `Cambia los datos de ${a.nombre}. La cantidad se cambia con entradas, salidas o conteo.`,
      campos: campoTxt('acNom', 'Nombre', a ? a.nombre : '', 'Ej: guantes de nitrilo talla M', 80) +
        `<div class="fields cols">${campoSel('acCat', 'Categoría', CATEGORIAS.map(x => [x, x]), a && CATEGORIAS.includes(a.categoria) ? a.categoria : 'EPP')}${campoSel('acUni', 'Unidad', UNIDADES.map(u => [u, u]), a ? a.unidad : 'unidades')}</div>` +
        (nuevo ? campoNum('acCantIni', 'Cantidad que hay ahora', 0, 0, 99999) : '') +
        `<div class="fields cols">${campoNum('acMin', 'Mínimo (avisa al bajar de aquí)', a ? a.minimo : 2, 0, 99999)}${campoNum('acMax', 'Máximo (hasta dónde se compra)', a ? a.maximo : 10, 1, 99999)}</div>` +
        campoTxt('acUbi', 'Ubicación', a ? a.ubicacion : 'Bodega Riohacha · Estante ', 'Ej: Bodega Riohacha · Estante B1', 80) +
        `<div class="fields cols">${campoNum('acCosto', 'Precio aprox. por unidad (pesos)', a ? a.costo : '', 0, null)}${campoTxt('acProvH', 'Proveedor habitual', a ? a.proveedor : '', 'Ej: Ferretería El Faro', 60)}</div>`,
      primario: nuevo ? 'Agregar' : 'Guardar cambios', icono: 'check', listo: nuevo ? 'Listo: artículo agregado a la bodega.' : 'Listo: artículo actualizado.',
      ops: () => {
        const mn = entero('acMin'), mx = entero('acMax'), costo = entero('acCosto'), ini = nuevo ? entero('acCantIni') : 0;
        if (!valor('acNom')) return fallar('Escribe el nombre.', 'acNom');
        if (articulos().some(x => String(x.nombre).toLowerCase() === valor('acNom').toLowerCase() && (!a || x.id !== a.id))) return fallar('Ya hay un artículo con ese nombre.', 'acNom');
        if (!(mn >= 0)) return fallar('El mínimo debe ser un número entero, 0 o más.', 'acMin');
        if (!(mx > mn)) return fallar('El máximo debe ser mayor que el mínimo.', 'acMax');
        if (!(costo >= 0)) return fallar('Escribe el precio en pesos, sin puntos ni comas.', 'acCosto');
        if (nuevo && !(ini >= 0)) return fallar('La cantidad debe ser un número entero, 0 o más.', 'acCantIni');
        const datos = { nombre: valor('acNom'), categoria: valor('acCat'), unidad: valor('acUni'), minimo: mn, maximo: mx, ubicacion: valor('acUbi'), costo, proveedor: valor('acProvH') };
        if (!nuevo) return [['mezclar', 'articulos', a.id, datos]];
        const id = window.nube.idNuevo('ar');
        return [['set', 'articulos', id, Object.assign({ cantidad: ini }, datos)],
          ini > 0 ? movimiento({ articuloId: id, articulo: datos.nombre, tipo: 'entrada', motivo: 'inicial', cantidad: ini, saldo: ini, nota: 'Artículo nuevo' }) : null];
      }
    });
  }
  function verArticulo(a) {
    const App = A(), e = estadoArt(a), movs = D().movimientos.filter(m => m.articuloId === a.id).sort((x, y) => String(y.fecha).localeCompare(String(x.fecha))).slice(0, 8);
    const abierta = compraAbierta(a.id);
    const botones = esBodega()
      ? [boton('entrada', 'Entrada', 'importar', ` data-id="${esH(a.id)}"`), boton('salida', 'Salida', 'entrega', ` data-id="${esH(a.id)}"`), boton('editart', 'Editar', 'lapiz', ` data-id="${esH(a.id)}"`)].concat(abierta ? [] : [boton('pedir', 'Pedir compra', 'carrito', ` data-id="${esH(a.id)}"`)])
      : [boton('pedirmat', 'Pedir de este artículo', 'mas', ` data-id="${esH(a.id)}"`, 'primary small')];
    abrirAccion({
      titulo: a.nombre, sub: `${a.categoria} · ${a.ubicacion}`,
      campos: `<div class="row">${App.pill(EST_ART[e][0], EST_ART[e][1])}${abierta ? App.pill('Compra en curso: ' + EST_CO[abierta.estado][0].toLowerCase(), 's-listo', 'carrito') : ''}</div>
        <dl class="datos"><dt>Hay</dt><dd><b>${esH(cantTxt(a.cantidad, a.unidad))}</b></dd><dt>Mínimo y máximo</dt><dd>${esH(num(a.minimo))} y ${esH(num(a.maximo))}</dd>
          <dt>Precio aprox.</dt><dd>${esH(App.cop(a.costo))} por ${esH(SINGULAR[a.unidad] || 'unidad')}</dd><dt>Proveedor</dt><dd>${esH(a.proveedor || 'Sin dato')}</dd></dl>
        <div class="tarea-pie">${botones.join('')}</div>
        <div class="section-label">Últimos movimientos</div>
        ${movs.length ? `<ol class="linea">${movs.map(m => `<li><b>${esH((m.tipo === 'entrada' ? '+' : m.tipo === 'salida' ? '-' : (num(m.cantidad) > 0 ? '+' : '')) + Math.abs(num(m.cantidad)) + ' · ' + (MOTIVO_MOV[m.motivo] || m.motivo))}</b><span class="meta">${esH([m.persona, m.proyecto, 'quedan ' + num(m.saldo), m.por, App.hace(m.fecha)].filter(Boolean).join(' · '))}</span></li>`).join('')}</ol>` : '<p class="meta">Sin movimientos.</p>'}`
    });
  }
  function conteo() {
    const arts = articulos().slice().sort((a, b) => String(a.categoria).localeCompare(String(b.categoria)) || String(a.nombre).localeCompare(String(b.nombre)));
    abrirAccion({
      titulo: 'Conteo físico', sub: 'Cuenta en los estantes y escribe cuánto hay de verdad. Deja en blanco lo que no contaste.',
      campos: `<div class="conteo">${arts.map(a => `<div class="conteo-f"><label for="cn-${esH(a.id)}">${esH(a.nombre)}<span class="meta">La app dice ${esH(cantTxt(a.cantidad, a.unidad))}</span></label><input id="cn-${esH(a.id)}" data-art="${esH(a.id)}" type="number" inputmode="numeric" min="0" step="1" placeholder="${esH(num(a.cantidad))}"></div>`).join('')}</div>` +
        campoTxt('acMotivo', 'Motivo de las diferencias (si hay)', '', 'Ej: se usaron sin registrar en la reunión', 160),
      primario: 'Guardar conteo', icono: 'check', listo: 'Listo: conteo guardado.',
      ops: () => {
        const filas = [...$('acCampos').querySelectorAll('input[data-art]')].filter(i => i.value.trim() !== '');
        if (!filas.length) return fallar('Escribe al menos una cantidad contada.');
        const malas = filas.find(i => !/^\d+$/.test(i.value.trim()));
        if (malas) return fallar('Las cantidades deben ser números enteros, 0 o más.', malas.id);
        const difs = filas.map(i => { const a = artPorId(i.dataset.art), contado = Number(i.value.trim()); return { a, contado, dif: a ? contado - num(a.cantidad) : 0 }; }).filter(x => x.a && x.dif !== 0);
        if (difs.length && !valor('acMotivo')) return fallar(`Hay ${difs.length} ${difs.length === 1 ? 'diferencia' : 'diferencias'}: escribe el motivo.`, 'acMotivo');
        accion.listo = difs.length ? `Listo: conteo guardado. Se ajustaron ${difs.length} ${difs.length === 1 ? 'artículo' : 'artículos'}.` : 'Listo: conteo guardado. Todo cuadra con la app.';
        if (!difs.length) return [];
        return difs.flatMap(x => [
          ['update', 'articulos', x.a.id, { cantidad: window.nube.incremento(x.dif) }],
          movimiento({ articuloId: x.a.id, articulo: x.a.nombre, tipo: 'ajuste', motivo: 'conteo', cantidad: x.dif, saldo: x.contado, nota: valor('acMotivo') })
        ]).concat([aviso('jefe', 'Conteo con diferencias', `${persona().nombre} contó la bodega: ${difs.length} ${difs.length === 1 ? 'artículo no cuadró' : 'artículos no cuadraron'} (${valor('acMotivo')}).`)]);
      }
    });
  }

  /* ---------- Excel del resumen ---------- */
  let cargaXlsx = null;
  function cargarXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    cargaXlsx = cargaXlsx || new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'lib/xlsx/xlsx.full.min.js';
      s.onload = () => (window.XLSX ? res(window.XLSX) : rej(new Error('xlsx'))); s.onerror = () => { cargaXlsx = null; rej(new Error('xlsx')); };
      document.head.appendChild(s);
    });
    return cargaXlsx;
  }
  async function descargarExcel(b) {
    b.disabled = true;
    try {
      const X = await cargarXlsx(), d = D(), libro = X.utils.book_new();
      const hoja = (nombre, filas) => X.utils.book_append_sheet(libro, X.utils.json_to_sheet(filas.length ? filas : [{ Nota: 'Sin datos' }]), nombre);
      hoja('Existencias', articulos().map(a => ({ Artículo: a.nombre, Categoría: a.categoria, Cantidad: num(a.cantidad), Unidad: a.unidad, Mínimo: num(a.minimo), Máximo: num(a.maximo), Estado: EST_ART[estadoArt(a)][0], Ubicación: a.ubicacion, 'Precio aprox.': num(a.costo), 'Valor en bodega': num(a.cantidad) * num(a.costo), Proveedor: a.proveedor })));
      hoja('Movimientos', d.movimientos.slice().sort((x, y) => String(y.fecha).localeCompare(String(x.fecha))).map(m => ({ Fecha: String(m.fecha).slice(0, 16).replace('T', ' '), Artículo: m.articulo, Tipo: m.tipo, Motivo: MOTIVO_MOV[m.motivo] || m.motivo, Cantidad: num(m.cantidad), Saldo: num(m.saldo), Persona: m.persona, Proyecto: m.proyecto, Registró: m.por, Nota: m.nota })));
      hoja('Compras', d.compras.map(c => ({ Qué: c.que, Cantidad: num(c.cantidad), Unidad: c.unidad, Categoría: c.categoria, Estado: (EST_CO[c.estado] || [c.estado])[0], Pidió: c.pide, Autoriza: c.autoriza, 'Valor aprox.': num(c.valorAprox), 'Valor pagado': num(c.valorReal), Proveedor: c.proveedor, 'Fecha pedido': c.fechaPedido, 'Fecha compra': c.fechaCompra, 'Para qué': c.paraQue })));
      hoja('Pedidos de material', d.solicitudes.map(s => ({ Fecha: String(s.fecha).slice(0, 10), Artículo: s.articulo, Cantidad: num(s.cantidad), Pidió: s.pide, 'Para qué': s.paraQue, Proyecto: s.proyecto, Estado: (EST_SOL[s.estado] || [s.estado])[0], Entregó: s.entregadaPor, Motivo: s.motivo })));
      X.writeFile(libro, `Inventario demo ${A().hoyISO()}.xlsx`);
      A().toast('Listo: Excel descargado');
    } catch (e) { A().toast('No se pudo preparar el Excel. Revisa la conexión y vuelve a intentar.'); }
    finally { b.disabled = false; }
  }

  /* ---------- eventos ---------- */
  $('invSecciones').addEventListener('click', e => {
    const b = e.target.closest('[data-sec]'); if (!b) return;
    seccion = b.dataset.sec; A().S.filtro.inventario = ''; $('qInventario').value = '';
    A().pintarTodo();
  });
  $('qInventario').addEventListener('input', () => pintar());
  $('btnPedirMaterial').addEventListener('click', () => pedirMaterial());
  $('btnPedirCompra').addEventListener('click', () => pedirCompra());
  function alTocar(e) {
    const sb = e.target.closest('[data-sub]');
    if (sb) { sub[sb.dataset.sub] = sb.dataset.val; pintar(); return; }
    const b = e.target.closest('[data-accion]'); if (!b) return;
    const d = D(), id = b.dataset.id;
    const c = d.compras.find(x => x.id === id) || null, s = d.solicitudes.find(x => x.id === id) || null, a = artPorId(id);
    const mapa = {
      pedir: () => a && pedirCompra(a.id, Number(b.dataset.cant) || 0), autorizar: () => c && autorizar(c), rechazar: () => c && rechazar(c),
      comprar: () => c && registrarCompra(c), recibir: () => c && recibir(c), revisada: () => c && marcarRevisada(c), vercompra: () => c && verCompra(c),
      entregar: () => s && entregar(s), noentregar: () => s && noEntregar(s), sinaut: () => registrarCompra(null, true),
      entrada: () => entradaSalida('entrada', a ? a.id : ''), salida: () => entradaSalida('salida', a ? a.id : ''),
      nuevoart: () => editarArticulo(null), editart: () => a && editarArticulo(a), verart: () => a && verArticulo(a), pedirmat: () => a && pedirMaterial(a.id),
      conteo: () => conteo(), excel: () => descargarExcel(b)
    };
    const fn = mapa[b.dataset.accion];
    // Si el registro ya no existe (otra persona lo cambió o borró), se avisa en vez de no hacer nada.
    if (!fn || fn() === null) A().toast('Ese registro ya cambió. Revisa la lista otra vez.');
  }
  $('invContenido').addEventListener('click', alTocar);
  $('acCampos').addEventListener('click', alTocar);
  $('acForm').addEventListener('submit', e => { e.preventDefault(); guardar(); });
  $('acSecundario').addEventListener('click', () => { if (accion && accion.alSecundario) accion.alSecundario(); });

  window.Inventario = Object.freeze({ pintar, resumen, tareas, irA: s => { if (SECCIONES.some(x => x[0] === s)) seccion = s; } });
})();
