/* inventario.js — Módulo Inventario de la demo: bodega de consumibles con las compras adentro.
   Partes: Qué hay que hacer · Bodega (3 bodegas: Riohacha, Guamal y Bogotá, con traslados) · Movimientos · Pedidos de material · Compras · Conteo · Resumen.
   Las tareas salen solas de los datos:
     artículo agotado o bajo sin compra abierta  -> Pedir compra        (bodega)
     pedido de material pendiente               -> Entregar            (bodega)
     compra pedida                              -> Autorizar/Rechazar  (la Jefe; si vale el monto del Gerente o más, después el Gerente;
                                                                        si la pidió la Jefe, solo el Gerente; si la pide el Gerente, nace autorizada)
     compra autorizada                          -> Registrar compra    (Compras: proveedor, valor y foto de la factura)
     compra hecha                               -> Recibir             (bodega; si es de bodega, suma a la cantidad)
     compra sin autorización sin revisar        -> Revisar             (Jefe)
   La Jefe puede hacer cualquier paso (menos autorizar lo que ella misma pidió).
   El Gerente ve todo a detalle (resumen, compras, existencias, pedidos) sin lo operativo; autoriza lo que pide la Jefe y lo que
   llega al monto que él mismo fija (ajustesApp/compras). Todo se decide por NIVEL en el módulo (no por rol): la Jefe puede subir o bajar
   a cada persona (pide, compra, bodega, solo ver, sin acceso). Quien solo pide ve solo lo suyo (las reglas de Firebase lo exigen).
   Cada acción deja un aviso en la campana de quien sigue y, si tiene los avisos activados, una notificación en su teléfono.
   Usa las ayudas que app.js publica en window.App (se leen al usarlas, porque este archivo carga antes). */
(function () {
  'use strict';
  const A = () => window.App;
  const $ = id => document.getElementById(id);
  const ABIERTA = ['pedido', 'por-gerente', 'autorizado', 'comprado'];
  const SECCIONES = [['hacer', 'Qué hay que hacer'], ['existencias', 'Bodega'], ['movimientos', 'Movimientos'], ['solicitudes', 'Pedidos de material'], ['compras', 'Compras'], ['conteo', 'Conteo'], ['resumen', 'Resumen']];
  const SEC = Object.fromEntries(SECCIONES);
  const sec = (...ks) => ks.map(k => [k, SEC[k]]);
  // Qué partes ve cada nivel. El Gerente ve todo a detalle pero sin lo del día a día; quien solo pide ve lo suyo y las existencias;
  // quien solo ve, todo sin botones; la Jefe empieza por el Panorama (todo el inventario en una pantalla).
  const SECCIONES_NIVEL = {
    jefe: [['panorama', 'Panorama']].concat(SECCIONES),
    bodega: SECCIONES,
    compra: sec('hacer', 'existencias', 'compras', 'solicitudes', 'movimientos', 'resumen'),
    pide: [['hacer', 'Lo mío']].concat(sec('existencias', 'solicitudes', 'compras')),
    ver: sec('existencias', 'movimientos', 'solicitudes', 'compras', 'resumen'),
    finanzas: sec('existencias', 'movimientos', 'solicitudes', 'compras', 'resumen'),
    gerente: sec('resumen', 'compras', 'existencias', 'solicitudes')
  };
  const PROYECTOS = ['Proyecto Costa Norte', 'Proyecto Ruta Alta', 'Oficina'];
  const CATEGORIAS = ['EPP', 'Eléctricos', 'Cómputo', 'Accesorios', 'Papelería', 'Aseo', 'Cafetería', 'Refrigerios', 'Herramientas', 'Otro'];
  const UNIDADES = ['unidades', 'pares', 'cajas', 'resmas', 'rollos', 'galones', 'paquetes'];
  const SINGULAR = { unidades: 'unidad', pares: 'par', cajas: 'caja', resmas: 'resma', rollos: 'rollo', galones: 'galón', paquetes: 'paquete' };
  const EST_ART = { agotado: ['Agotado', 's-peligro', 'peligro'], bajo: ['Bajo del mínimo', 's-warn', 'org'], bien: ['Bien', 's-disco', 'disco'] };
  const EST_CO = {
    pedido: ['Por autorizar', 's-org', 'org'], 'por-gerente': ['Falta el Gerente', 's-org', 'org'], autorizado: ['Falta comprar', 's-listo', 'listo'], rechazado: ['Rechazada', 'none', 'pend'],
    comprado: ['Falta recibir', 's-listo', 'listo'], recibido: ['Recibida', 's-disco', 'disco'], 'sin-autorizar': ['Sin autorizar', 's-peligro', 'peligro']
  };
  const EST_SOL = { pendiente: ['En espera', 's-org', 'org'], entregada: ['Entregado', 's-disco', 'disco'], rechazada: ['No se entregó', 's-peligro', 'peligro'] };
  const MOTIVO_MOV = { traslado: 'Traslado entre bodegas', inicial: 'Cantidad inicial', compra: 'Compra recibida', entrega: 'Entrega', devolucion: 'Devolución', conteo: 'Ajuste por conteo', dano: 'Daño o pérdida' };
  let seccion = 'hacer';
  const sub = { movimientos: 'todos', solicitudes: 'pendiente', compras: 'curso', bodega: 'todas' };
  let guardando = false, accion = null, pushPendientes = [], rolPintado = '';

  /* ---------- datos derivados ---------- */
  const num = v => Number(v) || 0;
  const esH = v => A().esH(v);
  const cantTxt = (n, unidad) => `${num(n)} ${num(n) === 1 ? (SINGULAR[unidad] || unidad || '') : (unidad || '')}`.trim();
  const estadoArt = a => (num(a.cantidad) <= 0 ? 'agotado' : num(a.cantidad) <= num(a.minimo) ? 'bajo' : 'bien');
  const D = () => A().S.datos;
  const articulos = () => D().articulos;
  // Las 3 bodegas son siempre las mismas (Riohacha, Guamal y Bogotá). Un artículo viejo sin bodega se cuenta en Riohacha.
  const BODEGAS = window.DEMO.BODEGAS;
  const bodegaDe = a => (BODEGAS.includes(a.bodega) ? a.bodega : 'Riohacha');
  const artPorId = id => articulos().find(a => a.id === id) || null;
  // Las líneas de una compra (las compras viejas tienen una sola, sin lista).
  const lineasDe = c => {
    const l = Array.isArray(c.lineas) ? c.lineas.filter(x => x && typeof x === 'object') : [];
    return l.length ? l : [{ que: c.que, cantidad: num(c.cantidad), unidad: c.unidad, valor: num(c.valorAprox), articuloId: c.articuloId || '' }];
  };
  const compraAbierta = id => D().compras.find(c => ABIERTA.includes(c.estado) && (c.articuloId === id || lineasDe(c).some(l => l.articuloId === id))) || null;
  // «Pagaron más de lo autorizado»: más del 10 % sobre el valor aprobado.
  const sobrecosto = c => (['comprado', 'recibido'].includes(c.estado) && num(c.valorAprox) > 0 && num(c.valorReal) > num(c.valorAprox) * 1.1 ? { pct: Math.round((num(c.valorReal) / num(c.valorAprox) - 1) * 100) } : null);
  const persona = () => A().S.persona;
  // En la demo con personas de prueba se nombra a la persona (Andrés B.); con cuentas propias, el rol (Bodega), porque puede haber varias.
  // Con varias personas en un mismo rol (por ejemplo, 3 Gerentes) se dice el rol; si hay una sola, su nombre.
  const nombreRol = rol => { const ps = window.DEMO.PERSONAS.filter(x => x.rol === rol), r = window.DEMO.rolDe(rol); return persona() && persona().prueba && ps.length === 1 ? ps[0].corto : (r ? r.rolTxt : rol); };
  const perm = () => A().permiso('inventario');
  const esJefe = () => perm() === 'jefe';
  const esGerente = () => perm() === 'gerente';
  const esBodega = () => perm() === 'bodega' || esJefe();       // la Jefe también puede mover la bodega
  const secciones = () => SECCIONES_NIVEL[perm()] || SECCIONES_NIVEL.ver;
  // Las compras pasan por la Jefe y, si valen el monto del Gerente o más (o las pidió la Jefe), por el Gerente. Nadie autoriza lo suyo.
  const autorizadorDe = c => (c.estado === 'por-gerente' || c.pideRol === 'jefe' || c.pideRol === 'gerente' ? 'gerente' : 'jefe');
  const esPorAutorizar = c => c.estado === 'pedido' || c.estado === 'por-gerente';
  // Nadie decide lo suyo (se compara el correo que dejó la compra al crearse; las de antes, sin correo, por el nombre).
  const esMiaLaCompra = c => (c.pideCorreo ? c.pideCorreo === persona().correo : c.pide === persona().nombre);
  // Si la Jefe no responde en 2 días, el Gerente puede autorizar o rechazar lo que pidió otra persona (lo mismo que exigen las reglas).
  const hora = f => (f && typeof f.toMillis === 'function' ? f.toMillis() : Date.parse(f));
  const respaldoVencido = c => c.estado === 'pedido' && !['jefe', 'gerente'].includes(c.pideRol) && Number.isFinite(hora(c.creadoEn)) && Date.now() > hora(c.creadoEn) + 2 * 86400000;
  const puedoDecidir = c => esPorAutorizar(c) && !esMiaLaCompra(c) && (puedoHacer(autorizadorDe(c)) || (esGerente() && respaldoVencido(c)));
  // Qué papel hace la persona en el flujo, según su NIVEL (no su rol): así sirve también cuando la Jefe le sube o le baja el nivel.
  const miFuncion = () => (esJefe() ? 'jefe' : esGerente() ? 'gerente' : perm() === 'bodega' ? 'asistente' : perm() === 'compra' ? 'compras' : '');
  // Bodega con el permiso extra «compra» también hace y registra compras (como Compras).
  const hagoCompras = () => perm() === 'compra' || (perm() === 'bodega' && A().tieneExtra('compra'));
  // Quién puede hacer una tarea: la persona con ese papel, o la Jefe (que puede hacer todo menos lo del Gerente).
  const puedoHacer = rol => miFuncion() === rol || (rol === 'compras' && hagoCompras()) || (esJefe() && rol !== 'gerente');
  const esMia = t => miFuncion() === t.rol || (t.rol === 'compras' && hagoCompras());
  const veTodo = () => perm() !== 'pide';                                       // quien solo pide ve solo lo suyo
  const veMovs = () => veTodo() && !esGerente();                                // el Gerente ve el resumen, no cada movimiento
  const puedoPedirMaterial = () => ['pide', 'finanzas', 'compra', 'bodega', 'jefe'].includes(perm());
  const puedoPedirCompra = () => ['pide', 'finanzas', 'compra', 'bodega', 'gerente', 'jefe'].includes(perm());
  // Marcas que exigen las reglas al pedir: la cuenta, su correo y la hora del servidor (no se pueden inventar).
  const misMarcas = () => ({ pideUid: window.nube.uid(), pideCorreo: window.nube.correo(), creadoEn: window.nube.ahoraServidor() });
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
      if (esPorAutorizar(c)) {
        out.push({ tipo: 'autorizar', rol: autorizadorDe(c), urg: a && estadoArt(a) === 'agotado' ? 0 : 2, compra: c, art: a });
        if (respaldoVencido(c)) out.push({ tipo: 'autorizar', rol: 'gerente', urg: 1, compra: c, art: a, respaldo: true });
      }
      else if (c.estado === 'autorizado') out.push({ tipo: 'comprar', rol: 'compras', urg: 3, compra: c, art: a });
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
      porAutorizar: d.compras.filter(esPorAutorizar).length,
      porAutorizarMias: p ? d.compras.filter(c => esPorAutorizar(c) && autorizadorDe(c) === miFuncion()).length : 0,
      porComprar: d.compras.filter(c => c.estado === 'autorizado').length,
      enCurso: d.compras.filter(c => ABIERTA.includes(c.estado)).length,
      sinAutorizar: d.compras.filter(c => c.estado === 'sin-autorizar' && !c.revisada).length,
      misPedidos: p ? d.solicitudes.filter(s => s.estado === 'pendiente' && s.pide === p.nombre).length + d.compras.filter(c => c.pide === p.nombre && ABIERTA.includes(c.estado)).length : 0,
      mias: tareas().filter(esMia).length
    };
  }

  /* ---------- pintar ---------- */
  function pintar() {
    const App = A(), S = App.S;
    if (!S.persona) return;
    // Al cambiar de persona se vuelve a la primera parte (cada rol ve partes distintas).
    if (rolPintado !== S.persona.rol + '/' + perm()) { rolPintado = S.persona.rol + '/' + perm(); seccion = secciones()[0][0]; }
    const f = S.filtro.inventario;
    if (f === 'agotado' || f === 'bajo') seccion = 'existencias';
    else if (esGerente() && f === 'entregar') { seccion = 'solicitudes'; sub.solicitudes = 'pendiente'; }
    else if (esGerente() && f === 'compras') { seccion = 'compras'; sub.compras = 'curso'; }
    else if (f === 'entregar' || f === 'compras') seccion = 'hacer';
    if (!secciones().some(x => x[0] === seccion)) seccion = secciones()[0][0];
    $('btnPedirMaterial').hidden = !puedoPedirMaterial(); $('btnPedirCompra').hidden = !puedoPedirCompra();
    $('btnPedirMaterial').parentElement.hidden = $('btnPedirMaterial').hidden && $('btnPedirCompra').hidden;
    // Quien hace las compras «hace» una compra (la Jefe la autoriza antes); los demás la piden. El Gerente la hace y nace autorizada.
    $('btnPedirCompraTxt').textContent = hagoCompras() || esGerente() ? 'Hacer una compra' : 'Pedir una compra';
    const arts = articulos();
    App.tablero('inventario', [
      { k: 'v-ago', n: arts.filter(a => estadoArt(a) === 'agotado').length, lbl: 'Agotados', icono: 'aviso', tono: 'peligro', filtro: 'agotado' },
      { k: 'v-baj', n: arts.filter(a => estadoArt(a) === 'bajo').length, lbl: 'Bajos del mínimo', icono: 'caja', tono: 'sol', filtro: 'bajo' },
      { k: 'v-ent', n: S.datos.solicitudes.filter(s => s.estado === 'pendiente').length, lbl: 'Pedidos por entregar', icono: 'entrega', tono: 'listo', filtro: 'entregar' },
      { k: 'v-com', n: S.datos.compras.filter(c => ABIERTA.includes(c.estado)).length, lbl: 'Compras en curso', icono: 'carrito', tono: 'org', filtro: 'compras' }
    ]);
    const mias = resumen().mias;
    $('invSecciones').innerHTML = secciones().map(([k, n]) => `<button type="button" class="chip" data-sec="${k}" aria-pressed="${seccion === k}">${esH(n)}${k === 'hacer' && mias ? ` <span class="n">${mias}</span>` : ''}</button>`).join('');
    const q = $('qInventario');
    q.hidden = !['existencias', 'movimientos', 'compras'].includes(seccion);
    q.placeholder = seccion === 'movimientos' ? 'Buscar artículo, persona o proyecto' : seccion === 'compras' ? 'Buscar compra, proveedor o persona' : 'Buscar artículo, categoría o ubicación';
    const c = $('invContenido');
    if (['articulos', 'compras', 'solicitudes', 'movimientos'].some(App.cargando)) { UI.poner(c, UI.esqueleto(seccion === 'movimientos' ? 5 : 3, true, seccion === 'movimientos' ? 'fila' : undefined)); return; }
    const html = { panorama: htmlPanorama, hacer: perm() === 'pide' ? htmlMios : () => htmlTareas(f), existencias: () => htmlExistencias(f), movimientos: htmlMovimientos, solicitudes: htmlSolicitudes, compras: htmlCompras, conteo: htmlConteo, resumen: htmlResumen }[seccion];
    if (UI.poner(c, html())) window.llenarIconos(c);
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
    if (esJefe()) {
      // La Jefe ve todo agrupado por quién tiene que hacerlo, y puede hacer cualquier paso ella misma.
      const grupos = {};
      lista.forEach(t => { (grupos[t.rol] = grupos[t.rol] || []).push(t); });
      const orden = ['jefe', 'compras', 'asistente', 'gerente'];
      if (Object.keys(grupos).some(r => r !== 'jefe' && r !== 'gerente')) h += '<p class="meta">Como Jefe puedes hacer cualquier paso aunque le toque a otra persona.</p>';
      h += Object.keys(grupos).sort((a, b) => orden.indexOf(a) - orden.indexOf(b)).map(rol =>
        `<div class="section-label">${rol === 'jefe' ? 'Te toca a ti' : 'Le toca a ' + esH(nombreRol(rol))} (${grupos[rol].length})${esH(filtroTxt)}</div>
         <div class="list">${grupos[rol].map(tarjeta).join('')}</div>`).join('');
      return h || UI.vacio('checkCirculo', 'Nada pendiente', 'La bodega y las compras están al día.');
    }
    h += `<div class="section-label">Te toca a ti (${mias.length})${esH(filtroTxt)}</div>`;
    h += mias.length ? `<div class="list">${mias.map(tarjeta).join('')}</div>` : UI.vacio('checkCirculo', 'Nada pendiente para ti', 'Cuando algo te toque, aparece aquí con su botón y te llega un aviso.');
    if (otras.length) h += `<div class="section-label">Le toca a otras personas (${otras.length})</div><div class="list">${otras.map(tarjeta).join('')}</div>`;
    return h;
  }

  // Una tarea: qué pasa, con qué datos, y el botón para hacerla (solo si la persona puede hacerla).
  function tarjeta(t) {
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
      titulo = `${c.estado === 'por-gerente' ? 'Autorizar (segundo paso)' : 'Autorizar compra'}: ${a ? a.nombre : c.que}`;
      detalle.push(cantTxt(c.cantidad, c.unidad), 'aprox. ' + cop(c.valorAprox), 'pidió ' + c.pide, c.paraQue);
      if (a && estadoArt(a) !== 'bien') extra = pill(estadoArt(a) === 'agotado' ? 'En bodega: agotado' : `En bodega: quedan ${cantTxt(a.cantidad, a.unidad)}`, EST_ART[estadoArt(a)][1]);
      if (c.pideRol === 'jefe') extra += pill('La pidió la Jefe: la autoriza el Gerente', 's-pend', 'info');
      if (c.pideRol === 'gerente') extra += pill('La pidió un Gerente: la autoriza otro Gerente', 's-pend', 'info');
      if (t.respaldo) extra += pill('La Jefe no ha respondido en 2 días: puedes autorizarla tú', 's-pend', 'info');
      if (c.estado === 'por-gerente') extra += pill(`La Jefe ya la autorizó${c.autorizaJefe ? ' (' + c.autorizaJefe + ')' : ''}: falta el Gerente`, 's-pend', 'info');
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
    // Nadie autoriza ni rechaza lo que pidió.
    const puede = puedoHacer(t.rol) && !(t.tipo === 'autorizar' && c && esMiaLaCompra(c));
    const pie = puede ? botones + detalleBtn : App.pill('Le toca a ' + nombreRol(t.rol), 'none', 'persona') + detalleBtn;
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
    h += comps.length ? `<div class="list">${comps.map(tarjetaCompra).join('')}</div>` : UI.vacio('carrito', hagoCompras() ? 'No has hecho compras' : 'No has pedido compras', hagoCompras() ? 'Toca «Hacer una compra»: le llega el aviso a quien autoriza y, cuando la autorice, la compras.' : 'Toca «Pedir una compra»: le llega el aviso a quien autoriza.');
    return h;
  }

  /* --- Existencias --- */
  function htmlExistencias(f) {
    const App = A();
    const q = $('qInventario').value.trim().toLowerCase();
    const orden = { agotado: 0, bajo: 1, bien: 2 };
    const todos = articulos().slice().sort((a, b) => (orden[estadoArt(a)] - orden[estadoArt(b)]) || String(a.nombre).localeCompare(String(b.nombre)));
    const vis = todos.filter(a => (!['agotado', 'bajo'].includes(f) || f === estadoArt(a)) && (sub.bodega === 'todas' || bodegaDe(a) === sub.bodega) && (!q || texto(a.nombre, a.categoria, bodegaDe(a), a.ubicacion, a.proveedor).includes(q)));
    let h = barraBotones(esBodega() ? [boton('nuevoart', 'Agregar artículo', 'mas'), boton('entrada', 'Registrar entrada', 'importar'), boton('salida', 'Registrar salida', 'entrega'),
      boton('bdexcel', 'Descargar base de datos', 'excel'), `<label class="btn small foto-btn"><span data-ico="importar"></span>Subir Excel<input id="invArchivo" class="archivo-oculto" type="file" accept=".xlsx,.xls,.csv"></label>`] : []);
    if (esBodega() && errorEx) h += `<div class="err" role="alert">${esH(errorEx)}</div>`;
    if (esBodega() && previaEx) h += htmlPreviaEx();
    h += subChips('bodega', [['todas', 'Todas las bodegas', todos.length]].concat(BODEGAS.map(b => [b, b, todos.filter(a => bodegaDe(a) === b).length])));
    h += `<div class="count" aria-live="polite">${vis.length === todos.length ? todos.length + ' artículos' : vis.length + ' de ' + todos.length + ' artículos'}</div>`;
    if (!vis.length) return h + UI.vacio('vacio', 'No hay artículos con ese filtro', f ? 'Toca otra vez la cifra de arriba para ver todo.' : '');
    return h + `<div class="list">${vis.map(a => {
      const e = estadoArt(a), st = EST_ART[e], abierta = compraAbierta(a.id);
      const pct = Math.max(0, Math.min(100, Math.round(num(a.cantidad) / Math.max(1, num(a.maximo)) * 100)));
      const pctMin = Math.max(0, Math.min(100, Math.round(num(a.minimo) / Math.max(1, num(a.maximo)) * 100)));
      return `<button type="button" class="card art st-${st[2]}" data-accion="verart" data-id="${esH(a.id)}">
        <span class="card-head"><span class="card-title">${esH(a.nombre)}</span>${App.pill(st[0], st[1])}</span>
        <span class="card-sub">${esH([a.categoria, 'Bodega ' + bodegaDe(a), a.ubicacion].filter(Boolean).join(' · '))}</span>
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
    const pg = UI.pagina(`mov|${sub.movimientos}|${q}`, vis.map(m => {
      const a = artPorId(m.articuloId), u = a ? a.unidad : '';
      const signo = m.tipo === 'entrada' ? '+' : m.tipo === 'salida' ? '-' : (num(m.cantidad) > 0 ? '+' : '');
      const tono = m.tipo === 'entrada' ? 'disco' : m.tipo === 'salida' ? 'listo' : 'org';
      return `<div class="card mov st-${tono}">
        <div class="card-head"><div class="card-title">${esH(m.articulo)}</div><span class="mov-n t-${tono}">${esH(signo + Math.abs(num(m.cantidad)))}</span></div>
        <span class="meta">${esH([MOTIVO_MOV[m.motivo] || m.motivo, m.persona ? (m.tipo === 'salida' ? 'a ' : 'de ') + m.persona : '', m.proyecto, 'quedan ' + cantTxt(m.saldo, u)].filter(Boolean).join(' · '))}</span>
        <span class="meta">${esH(`Registró ${m.por} ${App.hace(m.fecha)}`)}${m.nota ? ' · ' + esH(m.nota) : ''}</span>
      </div>`;
    }), { n: 50 });
    return h + `<div class="list">${pg.html}</div>${pg.mas}`;
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
    const p = persona(), todas = D().solicitudes.filter(s => veTodo() || s.pide === p.nombre).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const cuenta = e => todas.filter(s => s.estado === e).length;
    const vis = todas.filter(s => sub.solicitudes === 'todos' || s.estado === sub.solicitudes);
    let h = subChips('solicitudes', [['pendiente', 'En espera', cuenta('pendiente')], ['entregada', 'Entregados', cuenta('entregada')], ['rechazada', 'No entregados', cuenta('rechazada')], ['todos', 'Todos', todas.length]]);
    if (!veTodo()) h = '<p class="meta">Aquí ves solo tus pedidos.</p>' + h;
    return h + (vis.length ? `<div class="list">${vis.map(tarjetaSolicitud).join('')}</div>` : UI.vacio('caja', 'No hay pedidos aquí', 'Cambia el filtro de arriba o pide material.'));
  }

  /* --- Compras --- */
  function tarjetaCompra(c) {
    const App = A(), e = EST_CO[c.estado] || ['Sin estado', 'none', 'pend'];
    const valor = c.valorReal ? App.cop(c.valorReal) : 'aprox. ' + App.cop(c.valorAprox);
    return `<button type="button" class="card tarea st-${e[2]}" data-accion="vercompra" data-id="${esH(c.id)}">
      <span class="card-head"><span class="card-title">${esH(c.que)}</span>${App.pill(e[0], e[1], c.estado === 'sin-autorizar' ? 'aviso' : '')}</span>
      <span class="meta">${esH([lineasDe(c).length > 1 ? `${lineasDe(c).length} artículos` : cantTxt(c.cantidad, c.unidad), c.categoria, valor].join(' · '))}</span>
      <span class="meta">${esH([`Pidió ${c.pide} el ${App.fechaCorta(c.fechaPedido || c.fechaCompra)}`, c.proveedor, c.articuloId ? 'va a bodega' : ''].filter(Boolean).join(' · '))}</span>
      <span class="docs">${c.factura ? App.pill('Con foto de factura', 's-pend', 'camara') : ''}${c.estado === 'sin-autorizar' && c.revisada ? App.pill('Revisada', 's-pend', 'check') : ''}${esPorAutorizar(c) ? App.pill('Le toca a ' + nombreRol(autorizadorDe(c)), 'none', 'persona') : ''}${sobrecosto(c) ? App.pill(`Pagó ${sobrecosto(c).pct} % más de lo autorizado`, 's-peligro', 'aviso') : ''}${c.pideRol === 'gerente' ? App.pill('La pidió el Gerente', 's-pend', 'info') : ''}</span>
    </button>`;
  }
  function htmlCompras() {
    const q = $('qInventario').value.trim().toLowerCase();
    const todas = D().compras.filter(c => veTodo() || c.pide === persona().nombre).sort((a, b) => String(b.fechaPedido || b.fechaCompra).localeCompare(String(a.fechaPedido || a.fechaCompra)));
    const grupo = c => (ABIERTA.includes(c.estado) ? 'curso' : c.estado === 'recibido' ? 'recibidas' : c.estado === 'rechazado' ? 'rechazadas' : 'sin');
    const cuenta = g => todas.filter(c => grupo(c) === g).length;
    const vis = todas.filter(c => (sub.compras === 'todas' || grupo(c) === sub.compras) && (!q || texto(c.que, c.proveedor, c.pide, c.categoria, c.paraQue).includes(q)));
    let h = barraBotones(puedoHacer('compras') ? [boton('sinaut', 'Registrar compra hecha sin autorización', 'aviso')] : []);
    h += subChips('compras', [['curso', 'En curso', cuenta('curso')], ['recibidas', 'Recibidas', cuenta('recibidas')], ['rechazadas', 'Rechazadas', cuenta('rechazadas')], ['sin', 'Sin autorizar', cuenta('sin')], ['todas', 'Todas', todas.length]]);
    return h + (vis.length ? `<div class="list">${vis.map(tarjetaCompra).join('')}</div>` : UI.vacio('carrito', 'No hay compras aquí', `Cambia el filtro o toca «${hagoCompras() ? 'Hacer' : 'Pedir'} una compra».`));
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
    let h = '';
    if (esGerente()) {
      // Lo único que el Gerente tiene que hacer: autorizar las compras que pide la Jefe.
      const mias = tareas().filter(esMia);
      h += `<div class="section-label">Te toca a ti (${mias.length})</div>`;
      h += mias.length ? `<div class="list">${mias.map(tarjeta).join('')}</div>` : '<p class="meta">Nada por autorizar. Las compras que pida la Jefe te llegan aquí y al teléfono.</p>';
    }
    if (esGerente()) {
      h += `<div class="card"><b>Compras que decides tú</b><span class="meta">Las que pide la Jefe, y las que valen ${esH(cop(App.montoGerente()))} o más (la Jefe las autoriza antes y te las pasa).</span>
        ${persona().real ? `<div class="row">${boton('monto', 'Cambiar el monto', 'lapiz', '', 'small')}</div>` : '<span class="meta">El monto lo cambia el Gerente con su cuenta propia (la persona de prueba no puede).</span>'}</div>`;
    }
    h += barraBotones(perm() !== 'pide' ? [boton('excel', 'Descargar Excel', 'excel', '', 'primary')] : []);
    // Cómo van las compras: cada paso con quién lo tiene.
    const etapa = (estado, lbl, quien) => { const n = d.compras.filter(c => c.estado === estado).length; return `<div class="etapa${n ? ' con' : ''}"><span class="rm-n">${n}</span><b>${esH(lbl)}</b><span class="meta">${esH(quien)}</span></div>`; };
    h += `<div class="section-label">Cómo van las compras</div><div class="card etapas">
      ${etapa('pedido', 'Por autorizar', 'Jefe o Gerente')}${etapa('por-gerente', 'Falta el Gerente', 'Gerente')}${etapa('autorizado', 'Falta comprar', nombreRol('compras'))}${etapa('comprado', 'Falta recibir', nombreRol('asistente'))}
    </div>`;
    h += `<div class="resumen-grid">
      <div class="card"><span class="meta">Valor de lo que hay en bodega</span><span class="rm-n valor">${esH(cop(valorBodega))}</span><span class="meta">${articulos().length} artículos</span><span class="meta">${esH(BODEGAS.map(b => `${b}: ${cop(articulos().filter(a => bodegaDe(a) === b).reduce((x, a) => x + num(a.cantidad) * num(a.costo), 0))}`).join(' · '))}</span></div>
      <div class="card"><span class="meta">Comprado este mes (${comprasMes.length})</span><span class="rm-n valor">${esH(cop(totalMes))}</span>${sinAutMes ? App.pill('Sin autorizar: ' + cop(sinAutMes), 's-peligro', 'aviso') : App.pill('Todo autorizado', 's-disco', 'check')}</div>
      <div class="card"><span class="meta">Salió de bodega este mes</span><span class="rm-n valor">${esH(cop(salidas.reduce((s, m) => s + costoDe(m), 0)))}</span><span class="meta">${salidas.length} salidas</span></div>
    </div>`;
    h += `<div class="section-label">Compras del mes por categoría</div><div class="card">${barras(agrupar(comprasMes, c => c.categoria, c => num(c.valorReal || c.valorAprox)), cop)}</div>`;
    h += `<div class="section-label">Consumo del mes por proyecto</div><div class="card">${barras(agrupar(salidas, m => m.proyecto, costoDe), cop)}</div>`;
    h += `<div class="section-label">Consumo del mes por categoría</div><div class="card">${barras(agrupar(salidas, catDe, costoDe), cop)}</div>`;
    h += `<div class="section-label">Lo que más sale (unidades este mes)</div><div class="card">${barras(agrupar(salidas, m => m.articulo, m => num(m.cantidad)).slice(0, 5), v => String(v))}</div>`;
    return h;
  }

  /* --- Panorama de la Jefe: todo el inventario en una pantalla --- */
  const mesAnterior = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  function htmlPanorama() {
    const App = A(), cop = App.cop, d = D();
    const ir = (sec, subk, subv, filtro) => ` data-accion="ir" data-sec="${sec}" data-subk="${subk || ''}" data-subv="${subv || ''}" data-filtro="${filtro || ''}"`;
    const item = (tono, icono, titulo, detalle, datos) => `<button type="button" class="card tarea st-${tono}"${datos}><div class="tarea-cab"><span class="ico t-${tono}" aria-hidden="true">${window.ico(icono)}</span><div class="tarea-t"><b>${esH(titulo)}</b><span class="meta">${esH(detalle)}</span></div></div></button>`;
    const suma = l => l.reduce((x, c) => x + num(c.valorAprox), 0);
    const ago = articulos().filter(a => estadoArt(a) === 'agotado'), baj = articulos().filter(a => estadoArt(a) === 'bajo');
    const pedJefe = d.compras.filter(c => c.estado === 'pedido' && autorizadorDe(c) === 'jefe'), esperaG = d.compras.filter(c => (c.estado === 'por-gerente') || (c.estado === 'pedido' && autorizadorDe(c) === 'gerente'));
    const falta = d.compras.filter(c => c.estado === 'autorizado'), llegar = d.compras.filter(c => c.estado === 'comprado');
    const sinAut = d.compras.filter(c => c.estado === 'sin-autorizar' && !c.revisada), demas = d.compras.filter(c => sobrecosto(c));
    const viejos = d.solicitudes.filter(s => s.estado === 'pendiente' && Date.now() - Date.parse(s.fecha) > 2 * 86400000);
    const nom = l => l.slice(0, 3).map(x => x.nombre || x.que || x.articulo).join(', ') + (l.length > 3 ? '…' : '');
    const u = [];
    if (ago.length) u.push(item('peligro', 'aviso', `${ago.length} ${ago.length === 1 ? 'artículo agotado' : 'artículos agotados'}`, nom(ago), ir('existencias', '', '', 'agotado')));
    if (pedJefe.length) u.push(item('org', 'carrito', `${pedJefe.length} ${pedJefe.length === 1 ? 'compra espera tu decisión' : 'compras esperan tu decisión'}`, `${cop(suma(pedJefe))} en total`, ir('hacer')));
    if (sinAut.length) u.push(item('peligro', 'aviso', `${sinAut.length} ${sinAut.length === 1 ? 'compra hecha sin autorización' : 'compras hechas sin autorización'}`, `${cop(sinAut.reduce((x, c) => x + num(c.valorReal || c.valorAprox), 0))}: habla con quien compró y márcala revisada`, ir('compras', 'compras', 'sin')));
    if (demas.length) u.push(item('peligro', 'aviso', `${demas.length} ${demas.length === 1 ? 'compra pagada con más de lo autorizado' : 'compras pagadas con más de lo autorizado'}`, demas.slice(0, 3).map(c => `${c.que} (+${sobrecosto(c).pct} %)`).join(', '), ir('compras', 'compras', 'todas')));
    if (esperaG.length) u.push(item('org', 'persona', `${esperaG.length} ${esperaG.length === 1 ? 'compra espera al Gerente' : 'compras esperan al Gerente'}`, `${cop(suma(esperaG))} en total`, ir('compras', 'compras', 'curso')));
    if (viejos.length) u.push(item('org', 'entrega', `${viejos.length} ${viejos.length === 1 ? 'pedido de material espera' : 'pedidos de material esperan'} hace más de 2 días`, nom(viejos), ir('solicitudes', 'solicitudes', 'pendiente')));
    if (baj.length) u.push(item('org', 'caja', `${baj.length} ${baj.length === 1 ? 'artículo bajo del mínimo' : 'artículos bajos del mínimo'}`, nom(baj), ir('existencias', '', '', 'bajo')));
    if (falta.length) u.push(item('listo', 'carrito', `${falta.length} ${falta.length === 1 ? 'compra falta comprarla' : 'compras faltan por comprar'}`, `${cop(suma(falta))} autorizados`, ir('compras', 'compras', 'curso')));
    if (llegar.length) u.push(item('listo', 'caja', `${llegar.length} ${llegar.length === 1 ? 'compra falta recibirla' : 'compras faltan por recibir'}`, nom(llegar), ir('compras', 'compras', 'curso')));
    const valorBodega = articulos().reduce((x, a) => x + num(a.cantidad) * num(a.costo), 0);
    const gasto = mes => d.compras.filter(c => ['comprado', 'recibido', 'sin-autorizar'].includes(c.estado) && String(c.fechaCompra || '').slice(0, 7) === mes).reduce((x, c) => x + num(c.valorReal || c.valorAprox), 0);
    const hoyMes = App.hoyISO().slice(0, 7), g1 = gasto(hoyMes), g0 = gasto(mesAnterior());
    const delta = g0 > 0 ? Math.round((g1 / g0 - 1) * 100) : null;
    const salidas = d.movimientos.filter(m => m.tipo === 'salida' && delMes(m.fecha));
    const costoDe = m => num(m.cantidad) * num((artPorId(m.articuloId) || {}).costo);
    const comprasMes = d.compras.filter(c => ['comprado', 'recibido', 'sin-autorizar'].includes(c.estado) && delMes(c.fechaCompra));
    let h = `<div class="section-label">Lo urgente</div>` + (u.length ? `<div class="list">${u.join('')}</div>` : UI.vacio('checkCirculo', 'Todo en orden', 'No hay nada urgente en el inventario.'));
    h += barraBotones([boton('excel', 'Descargar Excel', 'excel', '', 'primary')]);
    h += `<div class="resumen-grid">
      <div class="card"><span class="meta">Valor de lo que hay en bodega</span><span class="rm-n valor">${esH(cop(valorBodega))}</span><span class="meta">${articulos().length} artículos</span></div>
      <div class="card"><span class="meta">Gastado este mes</span><span class="rm-n valor">${esH(cop(g1))}</span><span class="meta">${delta == null ? 'El mes pasado no hubo compras' : `${delta > 0 ? '+' : ''}${delta} % frente al mes pasado (${esH(cop(g0))})`}</span></div>
      <div class="card"><span class="meta">Salió de bodega este mes</span><span class="rm-n valor">${esH(cop(salidas.reduce((x, m) => x + costoDe(m), 0)))}</span><span class="meta">${salidas.length} salidas</span></div></div>`;
    h += `<div class="section-label">Compras del mes por persona que las pidió</div><div class="card">${barras(agrupar(comprasMes, c => c.pide, c => num(c.valorReal || c.valorAprox)), cop)}</div>`;
    h += `<div class="section-label">Lo que salió de bodega este mes por persona</div><div class="card">${barras(agrupar(salidas, m => m.persona, costoDe), cop)}</div>`;
    h += `<div class="section-label">Lo que salió de bodega este mes por proyecto</div><div class="card">${barras(agrupar(salidas, m => m.proyecto, costoDe), cop)}</div>`;
    h += `<div class="section-label">Compras del mes por categoría</div><div class="card">${barras(agrupar(comprasMes, c => c.categoria, c => num(c.valorReal || c.valorAprox)), cop)}</div>`;
    return h;
  }
  /** El Gerente fija desde cuánto autoriza él (además de lo que pide la Jefe). Solo con cuenta propia: las reglas no dejan a la persona de prueba. */
  function cambiarMonto() {
    abrirAccion({
      titulo: 'Desde cuánto autorizas tú', sub: `Hoy: ${A().cop(A().montoGerente())}. Las compras de ese valor o más pasan por la Jefe y después por ti. Lo que pide la Jefe lo decides siempre.`,
      campos: campoNum('acMonto', 'Monto (pesos)', A().montoGerente(), 0, 1000000000, 'Sin puntos ni comas. Con 0, decides todas las compras.'),
      primario: 'Guardar el monto', icono: 'check', listo: 'Listo: monto guardado. Vale desde la próxima compra que autorice la Jefe.',
      ops: () => {
        const n = entero('acMonto');
        if (!(n >= 0 && n <= 1000000000)) return fallar('Escribe un monto entero en pesos, sin puntos ni comas.', 'acMonto');
        return [['set', 'ajustesApp', 'compras', { montoGerente: n }]];
      }
    });
  }

  /* ---------- hoja de acción ---------- */
  const campoNum = (id, lbl, v, min, max, ayuda) => `<div class="field"><label for="${id}">${lbl}</label><input id="${id}" type="number" inputmode="numeric" min="${min}"${max != null ? ` max="${max}"` : ''} step="1" value="${esH(v)}">${ayuda ? `<span class="meta" id="${id}Ay">${esH(ayuda)}</span>` : ''}</div>`;
  const campoTxt = (id, lbl, v, ph, max) => `<div class="field"><label for="${id}">${lbl}</label><input id="${id}" type="text" maxlength="${max || 120}" autocomplete="off" value="${esH(v || '')}" placeholder="${esH(ph || '')}"></div>`;
  const campoSel = (id, lbl, ops, v) => `<div class="field"><label for="${id}">${lbl}</label><select id="${id}">${ops.map(([val, txt]) => `<option value="${esH(val)}"${val === v ? ' selected' : ''}>${esH(txt)}</option>`).join('')}</select></div>`;
  const opsArt = vacio => (vacio ? [['', vacio]] : []).concat(articulos().slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))).map(a => [a.id, `${a.nombre} · ${bodegaDe(a)} (${num(a.cantidad) > 0 ? 'hay ' + cantTxt(a.cantidad, a.unidad) : 'agotado'})`]));
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
  function aviso(para, titulo, txt, aOtros) {
    if (!para || (!aOtros && persona() && para === persona().rol)) return null;
    pushPendientes.push({ para, titulo, texto: txt });
    return ['set', 'avisos', window.nube.idNuevo('av'), { para, titulo, texto: txt, en: ahora(), modulo: 'inventario', leido: {}, deUid: window.nube.uid() }];
  }
  /** Cambia la cantidad de un artículo y deja su movimiento en la misma escritura: el artículo apunta a su movimiento (ultimoMov) y las reglas lo comprueban. */
  const mover = (a, delta, o) => { const id = window.nube.idNuevo('mo'); return [['update', 'articulos', a.id, { cantidad: window.nube.incremento(delta), ultimoMov: id }], movimiento(o, id)]; };
  const movimiento = (o, id) => ['set', 'movimientos', id || window.nube.idNuevo('mo'), Object.assign({ persona: '', proyecto: '', nota: '', compraId: '', solicitudId: '', por: persona().nombre, porRol: persona().rol, fecha: ahora() }, o)];
  const historial = c => (Array.isArray(c.historial) ? c.historial : []).filter(h => h && typeof h === 'object');
  const paso = (c, txt) => historial(c).concat([{ fecha: ahora(), texto: txt, por: persona().nombre }]);

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
    envios.forEach(e => Promise.resolve(window.Push.enviar(e.para, { titulo: e.titulo, texto: e.texto, url: './#inventario', etiqueta: 'inventario' })).catch(() => {}));
  }

  /* ---------- acciones: compras ---------- */
  let cotizaciones = [], extrasN = 0;
  const MAX_EXTRA = 4, optionsHtml = (ops, v) => ops.map(([val, txt]) => `<option value="${esH(val)}"${val === v ? ' selected' : ''}>${esH(txt)}</option>`).join('');
  const filaExtra = n => `<div class="linea-extra" data-n="${n}"><b>Artículo ${n + 2}</b>
    <div class="field"><label for="lxArt${n}">¿Es para la bodega?</label><select id="lxArt${n}" data-lx="art">${optionsHtml(opsArt('No va a bodega'), '')}</select></div>
    <div class="field"><label for="lxQue${n}">Qué se va a comprar</label><input id="lxQue${n}" data-lx="que" type="text" maxlength="100" autocomplete="off"></div>
    <div class="fields cols"><div class="field"><label for="lxCant${n}">Cantidad</label><input id="lxCant${n}" data-lx="cant" type="number" inputmode="numeric" min="1" step="1" value="1"></div>
      <div class="field"><label for="lxVal${n}">Valor total (pesos)</label><input id="lxVal${n}" data-lx="val" type="number" inputmode="numeric" min="0" step="1"></div></div>
    <button class="btn small ghost" type="button" data-accion="quitarLinea" data-n="${n}">Quitar este artículo</button></div>`;
  function pedirCompra(artId, cantSug) {
    const a = artId ? artPorId(artId) : null;
    const sug = cantSug || (a ? Math.max(1, num(a.maximo) - num(a.cantidad)) : 1);
    const elGerente = esGerente(), aut = autorizadorDe({ pideRol: persona().rol, estado: 'pedido' }), monto = A().montoGerente();
    cotizaciones = []; extrasN = 0;
    abrirAccion({
      titulo: hagoCompras() ? 'Hacer una compra' : 'Pedir una compra',
      sub: elGerente ? 'Como Gerente no te autorizas tú: la autoriza otro Gerente (le llega el aviso).'
        : hagoCompras() ? `Escribe qué vas a comprar. Antes de comprar, ${nombreRol(aut)} la autoriza (le llega el aviso)${aut === 'jefe' ? `; si vale ${A().cop(monto)} o más, después la autoriza el Gerente` : ''}.`
        : `Escribe qué se va a comprar. Le llega el aviso a ${nombreRol(aut)} para que la autorice${aut === 'jefe' ? `; si vale ${A().cop(monto)} o más, después la autoriza el Gerente` : ''}.`,
      campos: campoSel('acArt', '¿Es para la bodega?', opsArt('No va a bodega'), a ? a.id : '') +
        campoTxt('acQue', 'Qué se va a comprar', a ? a.nombre : '', 'Ej: botas de seguridad talla 40', 100) +
        `<div class="fields cols">${campoNum('acCant', 'Cantidad', sug, 1, 99999)}${campoSel('acUni', 'Unidad', UNIDADES.map(u => [u, u]), a ? a.unidad : 'unidades')}</div>` +
        `<div class="fields cols">${campoSel('acCat', 'Categoría', CATEGORIAS.map(x => [x, x]), a && CATEGORIAS.includes(a.categoria) ? a.categoria : 'Otro')}${campoNum('acValor', 'Valor total de este artículo (pesos)', a ? num(a.costo) * sug : '', 0, null)}</div>` +
        `<div id="acExtra"></div><div class="row"><button class="btn small ghost" type="button" data-accion="masLinea">${window.ico('mas')}Agregar otro artículo a esta compra</button></div>` +
        campoTxt('acProvSug', 'A quién se le va a comprar (opcional)', a ? a.proveedor : '', 'Ej: Ferretería El Faro', 80) +
        campoTxt('acPara', 'Para qué', a ? 'Reponer la bodega' : '', 'Ej: para la cuadrilla de campo', 140) +
        campoSel('acProy', 'Proyecto', PROYECTOS.map(p => [p, p]), PROYECTOS[0]) +
        `<div class="field"><span class="lbl">Cotizaciones (opcional, hasta 3 fotos)</span><label class="btn foto-btn"><span data-ico="camara"></span><span id="acCotTxt">Adjuntar fotos de cotizaciones</span><input id="acCot" class="archivo-oculto" type="file" accept="image/*" multiple></label><div id="acCotVer" class="cot-mini"></div></div>`,
      primario: hagoCompras() ? 'Enviar para autorizar' : 'Pedir la compra', icono: 'enviar',
      listo: elGerente ? 'Listo: compra pedida. Le llegó el aviso a los otros Gerentes para autorizarla.' : hagoCompras() ? `Listo: le llegó el aviso a ${nombreRol(aut)}. Cuando la autorice, haces la compra y la registras.` : `Listo: compra pedida. Le llegó el aviso a ${nombreRol(aut)} para autorizarla.`,
      ops: () => {
        const art = artPorId(valor('acArt')), n = entero('acCant'), v = entero('acValor');
        if (!valor('acQue')) return fallar('Escribe qué se va a comprar.', 'acQue');
        if (!(n > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        if (!(v > 0)) return fallar('Escribe el valor de este artículo en pesos, sin puntos ni comas.', 'acValor');
        if (!valor('acPara')) return fallar('Escribe para qué es la compra.', 'acPara');
        const lineas = [{ que: valor('acQue'), cantidad: n, unidad: valor('acUni'), valor: v, articuloId: art ? art.id : '' }];
        for (const f of document.querySelectorAll('#acExtra .linea-extra')) {
          const g = k => f.querySelector(`[data-lx="${k}"]`), q = g('que').value.trim(), c = Number(g('cant').value), val = Number(g('val').value), ar = artPorId(g('art').value);
          if (!q) return fallar('Escribe qué se va a comprar en cada artículo que agregaste.', g('que').id);
          if (!(Number.isInteger(c) && c > 0)) return fallar('La cantidad de cada artículo debe ser un número entero mayor que 0.', g('cant').id);
          if (!(Number.isInteger(val) && val > 0)) return fallar('Escribe el valor total de cada artículo en pesos, sin puntos ni comas.', g('val').id);
          lineas.push({ que: q, cantidad: c, unidad: ar ? ar.unidad : 'unidades', valor: val, articuloId: ar ? ar.id : '' });
        }
        const repetida = lineas.find((l, i) => l.articuloId && lineas.findIndex(x => x.articuloId === l.articuloId) !== i);
        if (repetida) return fallar(`El artículo «${repetida.que}» está dos veces en esta compra.`, 'acQue');
        const abierta = lineas.find(l => l.articuloId && compraAbierta(l.articuloId));
        if (abierta) return fallar(`Ya hay una compra en curso de ${abierta.que}. Revísala en Compras.`, 'acArt');
        const unico = lineas.length === 1, total = lineas.reduce((x, l) => x + l.valor, 0);
        const proyecto = valor('acProy'), resumenTxt = unico ? valor('acQue') : `${valor('acQue')} y ${lineas.length - 1} más`;
        const doc = Object.assign({ que: resumenTxt, cantidad: unico ? n : lineas.reduce((x, l) => x + l.cantidad, 0), unidad: unico ? valor('acUni') : 'artículos', categoria: valor('acCat'), valorAprox: total,
          paraQue: valor('acPara') + (proyecto ? ` (${proyecto})` : ''), proyecto, proveedorSug: valor('acProvSug'), lineas, cotizaciones: cotizaciones.slice(),
          pide: persona().nombre, pideRol: persona().rol, autoriza: '', autorizaJefe: '', estado: 'pedido', proveedor: '', valorReal: 0, fechaPedido: A().hoyISO(), fechaCompra: '', entregadoA: '', motivoRechazo: '',
          articuloId: unico && art ? art.id : '', factura: '', revisada: false }, misMarcas());
        doc.historial = [{ fecha: ahora(), texto: 'Pidió la compra', por: persona().nombre }];
        return [['set', 'compras', window.nube.idNuevo('co'), doc],
          aviso(aut, 'Compra por autorizar', `${persona().nombre} pide comprar ${resumenTxt} por ${A().cop(total)}.`, elGerente)];
      }
    });
    // Al escoger un artículo de bodega se llenan solos el nombre, la unidad, la categoría y el valor.
    $('acArt').addEventListener('change', () => {
      const x = artPorId(valor('acArt')); if (!x) return;
      $('acQue').value = x.nombre; $('acUni').value = x.unidad; $('acCat').value = CATEGORIAS.includes(x.categoria) ? x.categoria : 'Otro';
      const n = Math.max(1, num(x.maximo) - num(x.cantidad)); $('acCant').value = n; $('acValor').value = num(x.costo) * n;
      if (!valor('acPara')) $('acPara').value = 'Reponer la bodega';
      if (!valor('acProvSug')) $('acProvSug').value = x.proveedor || '';
    });
    $('acCot').addEventListener('change', async e => {
      const fs = [...(e.target.files || [])].slice(0, 3); if (!fs.length) return;
      $('acCotTxt').textContent = 'Preparando las fotos…';
      try {
        cotizaciones = await Promise.all(fs.map(f => leerFoto(f, 1000, 130000)));
        $('acCotVer').innerHTML = cotizaciones.map((c, i) => `<img src="${esH(c)}" alt="Cotización ${i + 1}">`).join('');
        $('acCotTxt').textContent = `Cambiar fotos (${cotizaciones.length})`; $('acErr').hidden = true;
      } catch (er) { cotizaciones = []; $('acCotVer').innerHTML = ''; $('acCotTxt').textContent = 'Adjuntar fotos de cotizaciones'; fallar(er.message === 'grande' ? 'Una foto es muy pesada. Toma otra más de cerca.' : 'Ese archivo no es una foto. Escoge imágenes.'); }
    });
  }
  // Agregar o quitar artículos extra de una compra (hasta 5 en total).
  function masLinea() {
    const cont = $('acExtra'); if (!cont) return;
    if (cont.querySelectorAll('.linea-extra').length >= MAX_EXTRA) { A().toast('Una compra lleva hasta 5 artículos. Haz otra compra para los demás.'); return; }
    cont.insertAdjacentHTML('beforeend', filaExtra(extrasN++));
    window.llenarIconos(cont);
  }
  function quitarLinea(n) { const f = document.querySelector(`#acExtra .linea-extra[data-n="${n}"]`); if (f) f.remove(); }

  /** Último precio pagado por un artículo (misma bodega o mismo nombre), para que quien autoriza compare. */
  function ultimoPrecio(l) {
    const nombre = String(l.que || '').trim().toLowerCase();
    const previas = D().compras.filter(c => ['comprado', 'recibido'].includes(c.estado) && num(c.valorReal) > 0 && lineasDe(c).length === 1 && num(c.cantidad) > 0
      && ((l.articuloId && c.articuloId === l.articuloId) || String(c.que || '').trim().toLowerCase() === nombre)).sort((x, y) => String(y.fechaCompra).localeCompare(String(x.fechaCompra)));
    const c = previas[0];
    return c ? { cada: Math.round(num(c.valorReal) / num(c.cantidad)), proveedor: c.proveedor, fecha: c.fechaCompra } : null;
  }
  /** Todo lo que hay que saber de una compra antes de decidir: líneas con precio de cada uno, para qué, a quién, cotizaciones, bodega y último precio. */
  function detalleCompra(c, conMonto) {
    const App = A(), cop = App.cop, lineas = lineasDe(c);
    const filas = lineas.map(l => {
      const a = l.articuloId ? artPorId(l.articuloId) : null, ult = ultimoPrecio(l), cada = num(l.cantidad) > 0 ? Math.round(num(l.valor) / num(l.cantidad)) : 0;
      const sube = ult && ult.cada > 0 && cada > ult.cada * 1.1;
      return `<tr><td><b>${esH(l.que)}</b>${a ? `<span class="meta">En bodega hay ${esH(cantTxt(a.cantidad, a.unidad))}</span>` : '<span class="meta">No va a bodega</span>'}${ult ? `<span class="meta${sube ? ' err-txt' : ''}">Último precio pagado: ${esH(cop(ult.cada))} c/u${ult.proveedor ? ' en ' + esH(ult.proveedor) : ''}${ult.fecha ? ', ' + esH(App.fechaCorta(ult.fecha)) : ''}${sube ? ' (ahora piden más)' : ''}</span>` : ''}</td>
        <td>${esH(String(num(l.cantidad)))} ${esH(l.unidad || '')}</td><td>${esH(cop(cada))}</td><td>${esH(cop(l.valor))}</td></tr>`;
    }).join('');
    const cots = Array.isArray(c.cotizaciones) ? c.cotizaciones.filter(x => /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(typeof x === 'string' ? x : '')) : [];
    return `<table class="lineas-tabla"><thead><tr><th>Qué</th><th>Cantidad</th><th>Cada uno</th><th>Total</th></tr></thead><tbody>${filas}</tbody>
      <tfoot><tr><td colspan="3"><b>Total aprox.</b></td><td><b>${esH(cop(c.valorAprox))}</b></td></tr></tfoot></table>
      <dl class="datos"><dt>Pidió</dt><dd>${esH(c.pide)}${c.fechaPedido ? ' el ' + esH(App.fechaCorta(c.fechaPedido)) : ''}</dd><dt>Para qué</dt><dd>${esH(c.paraQue)}</dd>
        ${c.proveedorSug ? `<dt>A quién se le compra</dt><dd>${esH(c.proveedorSug)}</dd>` : ''}
        ${conMonto ? `<dt>Monto del Gerente</dt><dd>${esH(cop(App.montoGerente()))}: desde ahí la compra también la autoriza el Gerente</dd>` : ''}</dl>
      ${cots.length ? `<div class="field"><span class="lbl">Cotizaciones (${cots.length})</span><div class="cot-mini">${cots.map((x, i) => `<img src="${esH(x)}" alt="Cotización ${i + 1} de ${esH(c.que)}">`).join('')}</div></div>` : ''}`;
  }

  function autorizar(c) {
    const App = A(), monto = App.montoGerente(), segundo = c.estado === 'por-gerente';
    // La Jefe pasa al Gerente lo que vale el monto o más (salvo lo que pidió ella: eso siempre lo decide el Gerente).
    const pasaAlGerente = !segundo && esJefe() && !['jefe', 'gerente'].includes(c.pideRol) && num(c.valorAprox) >= monto;
    abrirAccion({
      titulo: segundo ? 'Autorizar compra (segundo paso)' : 'Autorizar compra', sub: `${c.que}: aprox. ${App.cop(c.valorAprox)}.${segundo ? ` La Jefe ya la autorizó${c.autorizaJefe ? ' (' + c.autorizaJefe + ')' : ''}.` : ''}`,
      campos: detalleCompra(c, true) + (pasaAlGerente ? `<div class="aviso warn"><span>Vale ${esH(App.cop(monto))} o más: al autorizarla pasa al Gerente, que la autoriza después. Aún no se puede comprar.</span></div>` : ''),
      primario: pasaAlGerente ? 'Autorizar y pasar al Gerente' : 'Autorizar', icono: 'check', secundario: 'Rechazar',
      listo: pasaAlGerente ? 'Listo: autorizada. Le llegó el aviso al Gerente para el segundo paso.' : `Listo: compra autorizada. Le llegó el aviso a ${nombreRol('compras')} para comprarla.`,
      ops: () => {
        if (esMiaLaCompra(c)) return fallar('No puedes autorizar una compra que pediste tú.');
        if (!puedoDecidir(c)) return fallar(c.pideRol === 'gerente' ? 'Esta compra la autoriza otro Gerente.' : `Esta compra la autoriza ${nombreRol(autorizadorDe(c))}.`);
        const porRespaldo = esGerente() && respaldoVencido(c);
        if (pasaAlGerente) {
          return [['mezclar', 'compras', c.id, { estado: 'por-gerente', autorizaJefe: persona().nombre, autorizaCorreo: window.nube.correo(), historial: paso(c, `Autorizó y la pasó al Gerente (vale ${App.cop(c.valorAprox)}, desde ${App.cop(monto)} decide él)`) }],
            aviso('gerente', 'Compra por autorizar (segundo paso)', `${persona().nombre} autorizó ${c.que} por ${App.cop(c.valorAprox)} y la pasa a tu decisión.`)];
        }
        const campos = { estado: 'autorizado', autoriza: persona().nombre, autorizaCorreo: window.nube.correo(), historial: paso(c, porRespaldo ? 'El Gerente autorizó la compra (la Jefe no respondió en 2 días)' : segundo ? 'El Gerente autorizó la compra' : c.pideRol === 'gerente' ? 'Otro Gerente autorizó la compra' : 'Autorizó la compra') };
        if (esJefe() && !segundo) campos.autorizaJefe = persona().nombre;
        return [['mezclar', 'compras', c.id, campos],
          aviso('compras', 'Compra autorizada: hay que comprar', `${persona().nombre} autorizó comprar ${cantTxt(c.cantidad, c.unidad)} de ${c.que}.`),
          c.pideRol !== 'compras' ? aviso(c.pideRol, 'Te autorizaron la compra', `${persona().nombre} autorizó tu compra de ${c.que}.`, c.pideRol === 'gerente') : null,
          (segundo && c.autorizaJefe) || porRespaldo ? aviso('jefe', porRespaldo ? 'El Gerente autorizó una compra que esperaba tu respuesta' : 'El Gerente autorizó la compra', `${persona().nombre} autorizó ${c.que}.`) : null];
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
        if (esMiaLaCompra(c)) return fallar('No puedes decidir sobre una compra que pediste tú.');
        if (!puedoDecidir(c)) return fallar(c.pideRol === 'gerente' ? 'Esta compra la decide otro Gerente.' : `Esta compra la decide ${nombreRol(autorizadorDe(c))}.`);
        return [['mezclar', 'compras', c.id, { estado: 'rechazado', motivoRechazo: valor('acMotivo'), autoriza: persona().nombre, autorizaCorreo: window.nube.correo(), historial: paso(c, `Rechazó la compra: ${valor('acMotivo')}`) }],
          aviso(c.pideRol, 'Rechazaron tu compra', `${c.que}: ${valor('acMotivo')}.`, c.pideRol === 'gerente'),
          c.estado === 'por-gerente' && c.autorizaJefe ? aviso('jefe', 'El Gerente rechazó la compra', `${c.que}: ${valor('acMotivo')}.`) : null];
      }
    });
  }

  // Foto de la factura: se achica en el teléfono (máximo 1280 px, JPEG) y se guarda con la compra.
  let fotoFactura = '';
  // lado: medida máxima en píxeles; maximo: tamaño máximo del texto de la foto (las entregas llevan 5 fotos, por eso más chicas).
  function leerFoto(archivo, lado, maximo) {
    const L = lado || 1280, M = maximo || 450000;
    return new Promise((res, rej) => {
      if (!archivo || !/^image\//.test(archivo.type) || /svg/i.test(archivo.type)) { rej(new Error('tipo')); return; }
      const url = URL.createObjectURL(archivo), img = new Image();
      img.onload = () => { try {
        const esc = Math.min(1, L / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * esc); cv.height = Math.round(img.height * esc);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        let q = 0.62, dato = cv.toDataURL('image/jpeg', q);
        while (dato.length > M && q > 0.25) { q -= 0.08; dato = cv.toDataURL('image/jpeg', q); }
        if (dato.length > M * 1.25) rej(new Error('grande')); else res(dato);
      } catch (e) { URL.revokeObjectURL(url); rej(new Error('tipo')); } };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('tipo')); };
      img.src = url;
    });
  }
  function registrarCompra(c, sinAutorizacion) {
    const a = c && c.articuloId ? artPorId(c.articuloId) : null;
    fotoFactura = '';
    abrirAccion({
      titulo: sinAutorizacion ? 'Registrar compra hecha sin autorización' : 'Registrar compra',
      sub: sinAutorizacion ? 'Para que quede el registro: la Jefe recibe el aviso y la compra se ve en rojo en el resumen.' : `${c.que}: ${cantTxt(c.cantidad, c.unidad)}, autorizada por ${c.autoriza || 'la Jefe'}.`,
      campos: (sinAutorizacion ? campoTxt('acQue', 'Qué se compró', '', 'Ej: garrafones de agua', 100) + `<div class="fields cols">${campoNum('acCant', 'Cantidad', 1, 1, 99999)}${campoSel('acUni', 'Unidad', UNIDADES.map(u => [u, u]), 'unidades')}</div>` + campoSel('acCat', 'Categoría', CATEGORIAS.map(x => [x, x]), 'Otro') + campoTxt('acPara', 'Para qué', '', 'Ej: para la reunión de hoy', 140) + campoTxt('acQuien', 'Quién compró', '', 'Nombre', 60) : '') +
        campoTxt('acProv', 'Proveedor', (a && a.proveedor) || (c && c.proveedor) || '', 'Dónde se compró') +
        campoNum('acValor', 'Valor pagado (pesos)', c ? c.valorAprox : '', 0, null, c ? `Autorizado: aprox. ${A().cop(c.valorAprox)}.` : '') +
        `<div class="field"><span class="lbl">Foto de la factura</span><label class="btn foto-btn"><span data-ico="camara"></span><span id="acFotoTxt">Tomar o escoger foto</span><input id="acFoto" class="archivo-oculto" type="file" accept="image/*" capture="environment"></label><img id="acFotoVer" class="factura-mini" alt="Foto de la factura" hidden></div>`,
      primario: 'Guardar compra', icono: 'check',
      listo: sinAutorizacion ? 'Listo: compra registrada. Quedó marcada sin autorización.' : `Listo: compra registrada. Le llegó el aviso a ${nombreRol('asistente')} para recibirla.`,
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
            factura: fotoFactura, revisada: false, historial: [{ fecha: ahora(), texto: `Registró una compra de ${valor('acQuien')} hecha sin autorización en ${valor('acProv')}`, por: persona().nombre }], ...misMarcas() }],
            aviso('jefe', 'Compra sin autorización', `${valor('acQuien')} compró ${valor('acQue')} en ${valor('acProv')} (${A().cop(v)}) sin autorización.`),
            aviso('compras', 'Compra sin autorización', `${valor('acQuien')} compró ${valor('acQue')} (${A().cop(v)}) sin autorización.`)];
        }
        // Más del 10 % sobre lo autorizado: queda dicho en el historial y le avisa a la Jefe (y al Gerente si él la había autorizado).
        const sobre = num(c.valorAprox) > 0 && v > num(c.valorAprox) * 1.1, pct = Math.round((v / Math.max(1, num(c.valorAprox)) - 1) * 100);
        return [['mezclar', 'compras', c.id, { estado: 'comprado', proveedor: valor('acProv'), valorReal: v, fechaCompra: A().hoyISO(), factura: fotoFactura || c.factura || '', historial: paso(c, `Compró en ${valor('acProv')} por ${A().cop(v)}${sobre ? ` (${pct} % más de lo autorizado)` : ''}`) }],
          aviso('asistente', 'Compra en camino: hay que recibirla', `${persona().nombre} compró ${cantTxt(c.cantidad, c.unidad)} de ${c.que} en ${valor('acProv')}. ${a ? 'Recíbela en bodega cuando llegue.' : `Cuando llegue, entrégala a ${c.pide}.`}`),
          c.pideRol !== 'asistente' ? aviso(c.pideRol, 'Ya se compró', `Se compró ${c.que} en ${valor('acProv')}.`) : null,
          sobre ? aviso('jefe', 'Pagaron más de lo autorizado', `${c.que}: autorizado ${A().cop(c.valorAprox)}, pagado ${A().cop(v)} (${pct} % más).`) : null,
          sobre && c.estado === 'autorizado' && c.autorizaJefe && c.autoriza !== c.autorizaJefe ? aviso('gerente', 'Pagaron más de lo autorizado', `${c.que}: autorizado ${A().cop(c.valorAprox)}, pagado ${A().cop(v)} (${pct} % más).`) : null];
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

  function recibir(c) { return lineasDe(c).length > 1 ? recibirVarios(c) : recibirUno(c); }
  // Compra con varios artículos: se anota cuánto llegó de cada uno; lo que va a bodega se suma solo.
  function recibirVarios(c) {
    const lineas = lineasDe(c);
    if (lineas.some(l => l.articuloId && !artPorId(l.articuloId))) { A().toast('Un artículo de esta compra ya no existe en bodega.'); return; }
    const hayFuera = lineas.some(l => !l.articuloId);
    abrirAccion({
      titulo: 'Recibir la compra', sub: `${c.que}: comprada en ${c.proveedor || 'el proveedor'}. Escribe cuánto llegó de cada artículo.`,
      campos: lineas.map((l, i) => campoNum('rl' + i, esH(`Llegó: ${l.que} (compradas ${num(l.cantidad)})`), num(l.cantidad), 0, 99999, l.articuloId ? 'Se suma a la bodega.' : 'No va a bodega.')).join('') +
        (hayFuera ? campoTxt('acQuien', 'A quién se entregó lo que no va a bodega', c.pide, '', 60) : '') + campoTxt('acNota', 'Nota (opcional)', '', 'Ej: llegaron en buen estado', 160),
      primario: 'Recibir la compra', icono: 'caja', listo: 'Listo: compra recibida. Lo que va a bodega ya se sumó.',
      ops: () => {
        const llegaron = lineas.map((l, i) => entero('rl' + i));
        if (llegaron.some(n => !(n >= 0))) return fallar('Escribe un número entero (0 o más) en cada artículo.');
        if (hayFuera && !valor('acQuien')) return fallar('Escribe a quién se entregó lo que no va a bodega.', 'acQuien');
        const stock = {}, ops = [], faltan = [];
        lineas.forEach((l, i) => {
          const n = llegaron[i], a = l.articuloId ? artPorId(l.articuloId) : null;
          if (n < num(l.cantidad)) faltan.push(`${l.que}: ${n} de ${num(l.cantidad)}`);
          if (!a || n === 0) return;
          stock[a.id] = (stock[a.id] === undefined ? num(a.cantidad) : stock[a.id]) + n;
          ops.push(...mover(a, n, { articuloId: a.id, articulo: a.nombre, tipo: 'entrada', motivo: 'compra', cantidad: n, saldo: stock[a.id], persona: c.proveedor || '', nota: [valor('acNota'), n < num(l.cantidad) ? `Llegaron ${n} de ${num(l.cantidad)}` : ''].filter(Boolean).join('. '), compraId: c.id }));
        });
        const nota = [valor('acNota'), faltan.length ? 'Llegó menos: ' + faltan.join('; ') : ''].filter(Boolean).join('. ');
        return [['mezclar', 'compras', c.id, { estado: 'recibido', entregadoA: hayFuera ? valor('acQuien') : '', historial: paso(c, `Recibida${nota ? '. ' + nota : ''}`) }]].concat(ops,
          [c.pideRol !== 'asistente' ? aviso(c.pideRol, 'Llegó tu compra', `${c.que} ya llegó.`) : null],
          faltan.length ? [aviso('jefe', 'Llegó menos de lo comprado', `${c.que}. ${faltan.join('; ')}.`)] : []);
      }
    });
  }
  function recibirUno(c) {
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
        const n = entero('acCant'), hay = num((artPorId(a.id) || a).cantidad);
        if (!(n > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        const nota = [valor('acNota'), n < num(c.cantidad) ? `Llegaron ${n} de ${num(c.cantidad)}` : ''].filter(Boolean).join('. ');
        return [
          ['mezclar', 'compras', c.id, { estado: 'recibido', historial: paso(c, `Recibido en bodega: ${cantTxt(n, a.unidad)}${nota ? '. ' + nota : ''}`) }],
          ...mover(a, n, { articuloId: a.id, articulo: a.nombre, tipo: 'entrada', motivo: 'compra', cantidad: n, saldo: hay + n, persona: c.proveedor || '', nota, compraId: c.id }),
          c.pideRol !== 'asistente' ? aviso(c.pideRol, 'Llegó tu compra', `${c.que} ya está en bodega.`) : null,
          n < num(c.cantidad) ? aviso('jefe', 'Llegó menos de lo comprado', `${c.que}: llegaron ${n} de ${num(c.cantidad)}.`) : null
        ];
      }
    });
  }
  function marcarRevisada(c) {
    abrirAccion({
      titulo: 'Marcar como revisada', sub: `${c.que}: ${A().cop(c.valorReal || c.valorAprox)}, compró ${c.pide} sin autorización.`,
      campos: campoTxt('acNota', 'Qué se habló (opcional)', '', 'Ej: hablé con Andrés, fue una urgencia', 160),
      primario: 'Marcar como revisada', icono: 'check', listo: 'Listo: compra revisada. Sigue contando en el resumen del mes.',
      ops: () => [['mezclar', 'compras', c.id, { revisada: true, revisadaPorCorreo: window.nube.correo(), historial: paso(c, 'Revisó la compra sin autorización' + (valor('acNota') ? ': ' + valor('acNota') : '')) }]]
    });
  }

  function verCompra(c) {
    const App = A(), e = EST_CO[c.estado] || ['Sin estado', 'none'], sobre = sobrecosto(c);
    const botones = [];
    if (puedoDecidir(c)) botones.push(boton('autorizar', 'Autorizar', 'check', ` data-id="${esH(c.id)}"`, 'primary small'), boton('rechazar', 'Rechazar', '', ` data-id="${esH(c.id)}"`, 'ghost small'));
    if (c.estado === 'autorizado' && puedoHacer('compras')) botones.push(boton('comprar', 'Registrar compra', 'carrito', ` data-id="${esH(c.id)}"`, 'primary small'));
    if (c.estado === 'comprado' && puedoHacer('asistente')) botones.push(boton('recibir', lineasDe(c).length > 1 ? 'Recibir la compra' : c.articuloId ? 'Recibir en bodega' : 'Marcar como recibida', 'caja', ` data-id="${esH(c.id)}"`, 'primary small'));
    if (c.estado === 'sin-autorizar' && !c.revisada && esJefe()) botones.push(boton('revisada', 'Marcar como revisada', 'check', ` data-id="${esH(c.id)}"`, 'small'));
    const hist = historial(c).sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)));
    abrirAccion({
      titulo: c.que, sub: `${lineasDe(c).length > 1 ? lineasDe(c).length + ' artículos' : cantTxt(c.cantidad, c.unidad)} · ${c.categoria}`,
      campos: `<div class="row">${App.pill(e[0], e[1])}${esPorAutorizar(c) ? App.pill('Le toca a ' + nombreRol(autorizadorDe(c)), 'none', 'persona') : ''}${sobre ? App.pill(`Pagó ${sobre.pct} % más de lo autorizado`, 's-peligro', 'aviso') : ''}${c.pideRol === 'gerente' ? App.pill('La pidió el Gerente', 's-pend', 'info') : ''}</div>
        ${detalleCompra(c, esPorAutorizar(c))}
        <dl class="datos">
          ${num(c.valorReal) ? `<dt>Pagado</dt><dd>${esH(App.cop(c.valorReal))}${sobre ? ' (' + esH(String(sobre.pct)) + ' % más)' : ''}</dd>` : ''}
          ${c.autorizaJefe ? `<dt>Autorizó la Jefe</dt><dd>${esH(c.autorizaJefe)}</dd>` : ''}
          ${c.autoriza ? `<dt>${esPorAutorizar(c) ? 'Autoriza' : 'Decidió'}</dt><dd>${esH(c.autoriza)}</dd>` : ''}
          ${c.proveedor ? `<dt>Proveedor</dt><dd>${esH(c.proveedor)}${c.fechaCompra ? ', ' + esH(App.fechaCorta(c.fechaCompra)) : ''}</dd>` : ''}
          ${c.motivoRechazo ? `<dt>Motivo</dt><dd>${esH(c.motivoRechazo)}</dd>` : ''}
          ${c.entregadoA ? `<dt>Entregado a</dt><dd>${esH(c.entregadoA)}</dd>` : ''}
        </dl>
        ${/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(typeof c.factura === 'string' ? c.factura : '') ? `<div class="field"><span class="lbl">Foto de la factura</span><img class="factura" src="${esH(c.factura)}" alt="Foto de la factura de ${esH(c.que)}"></div>` : ''}
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
          ...mover(a, -n, { articuloId: a.id, articulo: a.nombre, tipo: 'salida', motivo: 'entrega', cantidad: n, saldo: hay - n, persona: s.pide, proyecto: valor('acProy'), nota: parcial, solicitudId: s.id }),
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
          ['set', 'solicitudes', window.nube.idNuevo('so'), { articuloId: a.id, articulo: a.nombre, cantidad: n, pide: persona().nombre, pideRol: persona().rol, paraQue: valor('acPara'), proyecto: valor('acProy'), estado: 'pendiente', fecha: ahora(), entregadaPor: '', fechaEntrega: '', motivo: '', pideUid: window.nube.uid() }],
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
          ...mover(a, entrada ? n : -n, { articuloId: a.id, articulo: a.nombre, tipo: entrada ? 'entrada' : 'salida', motivo, cantidad: n, saldo: entrada ? hay + n : hay - n, persona: valor('acPersona'), proyecto: valor('acProy'), nota: valor('acNota') }),
          motivo === 'dano' ? aviso('jefe', 'Material dañado o perdido', `${persona().nombre} registró ${cantTxt(n, a.unidad)} de ${a.nombre} como daño o pérdida: ${valor('acNota')}.`) : null
        ];
      }
    });
  }
  function editarArticulo(a) {
    const nuevo = !a;
    abrirAccion({
      titulo: nuevo ? 'Agregar artículo' : 'Editar artículo', sub: nuevo ? 'Un artículo nuevo para una de las 3 bodegas.' : `Cambia los datos de ${a.nombre} (bodega ${bodegaDe(a)}). La cantidad se cambia con entradas, salidas o conteo, y de bodega con un traslado.`,
      campos: (nuevo ? campoSel('acBod', 'Bodega', BODEGAS.map(b => [b, b]), BODEGAS.includes(sub.bodega) ? sub.bodega : BODEGAS[0]) : '') +
        campoTxt('acNom', 'Nombre', a ? a.nombre : '', 'Ej: guantes de nitrilo talla M', 80) +
        `<div class="fields cols">${campoSel('acCat', 'Categoría', CATEGORIAS.map(x => [x, x]), a && CATEGORIAS.includes(a.categoria) ? a.categoria : 'EPP')}${campoSel('acUni', 'Unidad', UNIDADES.map(u => [u, u]), a ? a.unidad : 'unidades')}</div>` +
        (nuevo ? campoNum('acCantIni', 'Cantidad que hay ahora', 0, 0, 99999) : '') +
        `<div class="fields cols">${campoNum('acMin', 'Mínimo (avisa al bajar de aquí)', a ? a.minimo : 2, 0, 99999)}${campoNum('acMax', 'Máximo (hasta dónde se compra)', a ? a.maximo : 10, 1, 99999)}</div>` +
        campoTxt('acUbi', 'Ubicación dentro de la bodega', a ? a.ubicacion : 'Estante ', 'Ej: Estante B1', 80) +
        `<div class="fields cols">${campoNum('acCosto', 'Precio aprox. por unidad (pesos)', a ? a.costo : '', 0, null)}${campoTxt('acProvH', 'Proveedor habitual', a ? a.proveedor : '', 'Ej: Ferretería El Faro', 60)}</div>`,
      primario: nuevo ? 'Agregar' : 'Guardar cambios', icono: 'check', listo: nuevo ? 'Listo: artículo agregado a la bodega.' : 'Listo: artículo actualizado.',
      ops: () => {
        const mn = entero('acMin'), mx = entero('acMax'), costo = entero('acCosto'), ini = nuevo ? entero('acCantIni') : 0;
        if (!valor('acNom')) return fallar('Escribe el nombre.', 'acNom');
        const bod = nuevo ? valor('acBod') : bodegaDe(a);
        if (!BODEGAS.includes(bod)) return fallar('Escoge una de las 3 bodegas.', 'acBod');
        if (articulos().some(x => String(x.nombre).toLowerCase() === valor('acNom').toLowerCase() && bodegaDe(x) === bod && (!a || x.id !== a.id))) return fallar(`Ya hay un artículo con ese nombre en la bodega de ${bod}.`, 'acNom');
        if (!(mn >= 0)) return fallar('El mínimo debe ser un número entero, 0 o más.', 'acMin');
        if (!(mx > mn)) return fallar('El máximo debe ser mayor que el mínimo.', 'acMax');
        if (!(costo >= 0)) return fallar('Escribe el precio en pesos, sin puntos ni comas.', 'acCosto');
        if (nuevo && !(ini >= 0)) return fallar('La cantidad debe ser un número entero, 0 o más.', 'acCantIni');
        const datos = { nombre: valor('acNom'), categoria: valor('acCat'), unidad: valor('acUni'), minimo: mn, maximo: mx, ubicacion: valor('acUbi'), costo, proveedor: valor('acProvH') };
        if (!nuevo) return [['mezclar', 'articulos', a.id, datos]];
        datos.bodega = bod;
        const id = window.nube.idNuevo('ar');
        const movId = window.nube.idNuevo('mo');
        return [['set', 'articulos', id, Object.assign({ cantidad: ini }, ini > 0 ? { ultimoMov: movId } : {}, datos)],
          ini > 0 ? movimiento({ articuloId: id, articulo: datos.nombre, tipo: 'entrada', motivo: 'inicial', cantidad: ini, saldo: ini, nota: 'Artículo nuevo' }, movId) : null];
      }
    });
  }
  /** Traslado entre bodegas: sale de la bodega de origen y entra a la de destino (cada una con su movimiento), todo en una sola escritura.
      Si en la bodega de destino ya hay ese artículo (mismo nombre), se le suma; si no, se crea ahí con los mismos datos. */
  function trasladar(a) {
    const origen = bodegaDe(a), destinos = BODEGAS.filter(b => b !== origen);
    abrirAccion({
      titulo: 'Trasladar a otra bodega', sub: `${a.nombre}: hoy hay ${cantTxt(a.cantidad, a.unidad)} en la bodega de ${origen}.`,
      campos: campoSel('acDest', 'Bodega de destino', destinos.map(b => [b, b]), destinos[0]) + campoNum('acCant', 'Cantidad que se traslada', 1, 1, 99999) + campoTxt('acNota', 'Nota (opcional)', '', 'Ej: para el proyecto de Bogotá', 160),
      primario: 'Trasladar', icono: 'entrega', listo: 'Listo: traslado registrado. Ya salió de una bodega y entró a la otra.',
      ops: () => {
        const n = entero('acCant'), dest = valor('acDest'), hay = num(a.cantidad), nota = valor('acNota');
        if (!destinos.includes(dest)) return fallar('Escoge la bodega de destino.', 'acDest');
        if (!(n > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        if (n > hay) return fallar(`Solo hay ${cantTxt(hay, a.unidad)} en ${origen}.`, 'acCant');
        const tid = window.nube.idNuevo('tr'), d = articulos().find(x => x.id !== a.id && String(x.nombre).toLowerCase() === String(a.nombre).toLowerCase() && bodegaDe(x) === dest);
        const sale = mover(a, -n, { articuloId: a.id, articulo: a.nombre, tipo: 'salida', motivo: 'traslado', cantidad: n, saldo: hay - n, nota: `Traslado a ${dest}${nota ? ': ' + nota : ''}`, trasladoId: tid });
        const notaIn = `Traslado desde ${origen}${nota ? ': ' + nota : ''}`;
        if (d) return [...sale, ...mover(d, n, { articuloId: d.id, articulo: d.nombre, tipo: 'entrada', motivo: 'traslado', cantidad: n, saldo: num(d.cantidad) + n, nota: notaIn, trasladoId: tid })];
        const id = window.nube.idNuevo('ar'), movId = window.nube.idNuevo('mo');
        return [...sale, ['set', 'articulos', id, { nombre: a.nombre, categoria: a.categoria, unidad: a.unidad, cantidad: n, ultimoMov: movId, minimo: num(a.minimo), maximo: num(a.maximo), ubicacion: '', costo: num(a.costo), proveedor: a.proveedor || '', bodega: dest }],
          movimiento({ articuloId: id, articulo: a.nombre, tipo: 'entrada', motivo: 'traslado', cantidad: n, saldo: n, nota: notaIn, trasladoId: tid }, movId)];
      }
    });
  }
  /** Cuánto sale de un artículo (últimos 30 días) y qué mínimo alcanzaría para unos 10 días. */
  function sugerido(a) {
    const desde = Date.now() - 30 * 86400000;
    const total = D().movimientos.filter(m => m.articuloId === a.id && m.tipo === 'salida' && Date.parse(m.fecha) >= desde).reduce((x, m) => x + num(m.cantidad), 0);
    if (!total) return null;
    const dia = total / 30;
    return { total, semana: Math.round(dia * 7 * 10) / 10, minimo: Math.max(1, Math.ceil(dia * 10)) };
  }
  const movsDe = a => D().movimientos.filter(m => m.articuloId === a.id).sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)));
  const signoMov = m => (m.tipo === 'entrada' ? '+' : m.tipo === 'salida' ? '-' : (num(m.cantidad) > 0 ? '+' : '')) + Math.abs(num(m.cantidad));
  function verArticulo(a) {
    const App = A(), e = estadoArt(a), movs = movsDe(a).slice(0, 8), sug = sugerido(a);
    const abierta = compraAbierta(a.id);
    const botones = (esBodega()
      ? [boton('entrada', 'Entrada', 'importar', ` data-id="${esH(a.id)}"`), boton('salida', 'Salida', 'entrega', ` data-id="${esH(a.id)}"`), boton('trasladar', 'Trasladar', 'entrega', ` data-id="${esH(a.id)}"`), boton('editart', 'Editar', 'lapiz', ` data-id="${esH(a.id)}"`)].concat(abierta || !puedoPedirCompra() ? [] : [boton('pedir', 'Pedir compra', 'carrito', ` data-id="${esH(a.id)}"`)])
      : puedoPedirMaterial() ? [boton('pedirmat', 'Pedir de este artículo', 'mas', ` data-id="${esH(a.id)}"`, 'primary small')] : [])
      .concat(veMovs() ? [boton('kardex', 'Kárdex', 'historial', ` data-id="${esH(a.id)}"`)] : []);
    abrirAccion({
      titulo: a.nombre, sub: [a.categoria, 'Bodega ' + bodegaDe(a), a.ubicacion].filter(Boolean).join(' · '),
      campos: `<div class="row">${App.pill(EST_ART[e][0], EST_ART[e][1])}${abierta ? App.pill('Compra en curso: ' + EST_CO[abierta.estado][0].toLowerCase(), 's-listo', 'carrito') : ''}</div>
        <dl class="datos"><dt>Bodega</dt><dd>${esH(bodegaDe(a))}${a.ubicacion ? ' · ' + esH(a.ubicacion) : ''}</dd><dt>Hay</dt><dd><b>${esH(cantTxt(a.cantidad, a.unidad))}</b></dd><dt>Mínimo y máximo</dt><dd>${esH(num(a.minimo))} y ${esH(num(a.maximo))}</dd>
          <dt>Precio aprox.</dt><dd>${esH(App.cop(a.costo))} por ${esH(SINGULAR[a.unidad] || 'unidad')}</dd><dt>Proveedor</dt><dd>${esH(a.proveedor || 'Sin dato')}</dd></dl>
        ${veMovs() && sug ? `<div class="note">En los últimos 30 días salieron ${esH(num(sug.total))} (unas ${esH(sug.semana)} por semana). Un mínimo de ${esH(sug.minimo)} alcanza para unos 10 días.${sug.minimo > num(a.minimo) ? ` <b>Tu mínimo (${esH(num(a.minimo))}) está bajo.</b>` : ' Tu mínimo está bien.'}</div>` : ''}
        ${botones.length ? `<div class="tarea-pie">${botones.join('')}</div>` : ''}
        ${veMovs() ? `<div class="section-label">Últimos movimientos</div>
        ${movs.length ? `<ol class="linea">${movs.map(m => `<li><b>${esH(signoMov(m) + ' · ' + (MOTIVO_MOV[m.motivo] || m.motivo))}</b><span class="meta">${esH([m.persona, m.proyecto, 'quedan ' + num(m.saldo), m.por, App.hace(m.fecha)].filter(Boolean).join(' · '))}</span></li>`).join('')}</ol>` : '<p class="meta">Sin movimientos.</p>'}` : ''}`
    });
  }
  /** Kárdex: todas las entradas y salidas de un artículo, con su saldo, y el Excel de ese artículo. */
  function kardex(a) {
    const movs = movsDe(a);
    // Un artículo puede tener cientos de movimientos: se muestran de 50 en 50.
    const pg = UI.pagina('kardex-' + a.id, movs.map(m => `<tr><td>${esH(fechaLocal(m.fecha, false))}</td><td>${esH(MOTIVO_MOV[m.motivo] || m.motivo)}<span class="meta">${esH([m.persona, m.proyecto, m.por].filter(Boolean).join(' · '))}</span></td><td>${esH(signoMov(m))}</td><td>${esH(num(m.saldo))}</td></tr>`), { reiniciar: true });
    abrirAccion({
      titulo: `Kárdex: ${a.nombre}`, sub: `Hay ${cantTxt(a.cantidad, a.unidad)}. Cada entrada y salida con lo que quedó.`,
      campos: `<div class="row">${boton('excelkardex', 'Descargar Excel de este artículo', 'excel', ` data-id="${esH(a.id)}"`, 'primary small')}</div>` +
        (movs.length ? `<table class="lineas-tabla"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Cant.</th><th>Quedó</th></tr></thead><tbody>${pg.html}</tbody></table>${pg.mas}` : '<p class="meta">Sin movimientos.</p>')
    });
  }
  async function descargarKardex(b, a) {
    b.disabled = true;
    try {
      const hojas = [];
      const filas = movsDe(a).reverse().map(m => ({ Fecha: fechaLocal(m.fecha, true), Movimiento: m.tipo, Motivo: MOTIVO_MOV[m.motivo] || m.motivo, Cantidad: signoMov(m), Quedó: num(m.saldo), Persona: m.persona, Proyecto: m.proyecto, Registró: m.por, Nota: m.nota }));
      hojas.push(window.Excel.deObjetos('Kárdex', `Kárdex: ${a.nombre}`, `Cada entrada y salida con lo que quedó. Hoy hay ${cantTxt(a.cantidad, a.unidad)}. Generado el ${A().hoyISO()}.`, filas));
      await window.Excel.descargar({ archivo: `Kardex ${String(a.nombre).slice(0, 40)} ${A().hoyISO()}`, hojas });
      A().toast('Listo: Excel descargado');
    } catch (e) { A().toast('No se pudo preparar el Excel. Revisa la conexión y vuelve a intentar.'); }
    finally { b.disabled = false; }
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
        return difs.flatMap(x => mover(x.a, x.dif, { articuloId: x.a.id, articulo: x.a.nombre, tipo: 'ajuste', motivo: 'conteo', cantidad: x.dif, saldo: x.contado, nota: valor('acMotivo') })).concat([aviso('jefe', 'Conteo con diferencias', `${persona().nombre} contó la bodega: ${difs.length} ${difs.length === 1 ? 'artículo no cuadró' : 'artículos no cuadraron'} (${valor('acMotivo')}).`)]);
      }
    });
  }

  /* ---------- Excel del resumen ---------- */
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
  // Fecha y hora del teléfono (Colombia), no la hora universal en que se guardan.
  const dosC = n => String(n).padStart(2, '0');
  const fechaLocal = (iso, conHora) => { const d = new Date(iso); if (isNaN(d)) return ''; const f = `${d.getFullYear()}-${dosC(d.getMonth() + 1)}-${dosC(d.getDate())}`; return conHora ? `${f} ${dosC(d.getHours())}:${dosC(d.getMinutes())}` : f; };
  async function descargarExcel(b) {
    b.disabled = true;
    try {
      const d = D(), hojas = [], gen = `Generado el ${A().hoyISO()}.`;
      const TIT = { Bodega: ['Bodega: lo que hay en cada bodega', 'Cuánto hay de cada artículo en Riohacha, Guamal y Bogotá, su estado y su valor.'], Movimientos: ['Movimientos de la bodega', 'Cada entrada, salida y ajuste, del más nuevo al más viejo.'],
        Compras: ['Compras', 'Todas las compras: quién pidió, quién autorizó, cuánto costó y en qué va.'], 'Pedidos de material': ['Pedidos de material', 'Lo que pidió cada persona a la bodega y si se entregó.'] };
      const hoja = (nombre, filas) => hojas.push(window.Excel.deObjetos(nombre, TIT[nombre][0], `${TIT[nombre][1]} ${gen}`, filas));
      hoja('Bodega', articulos().map(a => ({ Bodega: bodegaDe(a), Artículo: a.nombre, Categoría: a.categoria, Cantidad: num(a.cantidad), Unidad: a.unidad, Mínimo: num(a.minimo), Máximo: num(a.maximo), Estado: EST_ART[estadoArt(a)][0], Ubicación: a.ubicacion, 'Precio aprox.': num(a.costo), 'Valor en bodega': num(a.cantidad) * num(a.costo), Proveedor: a.proveedor })));
      hoja('Movimientos', d.movimientos.slice().sort((x, y) => String(y.fecha).localeCompare(String(x.fecha))).map(m => ({ Fecha: fechaLocal(m.fecha, true), Artículo: m.articulo, Tipo: m.tipo, Motivo: MOTIVO_MOV[m.motivo] || m.motivo, Cantidad: num(m.cantidad), Saldo: num(m.saldo), Persona: m.persona, Proyecto: m.proyecto, Registró: m.por, Nota: m.nota })));
      hoja('Compras', d.compras.map(c => ({ Qué: c.que, Cantidad: num(c.cantidad), Unidad: c.unidad, Categoría: c.categoria, Estado: (EST_CO[c.estado] || [c.estado])[0], Pidió: c.pide, Autoriza: c.autoriza, 'Valor aprox.': num(c.valorAprox), 'Valor pagado': num(c.valorReal), Proveedor: c.proveedor, 'Fecha pedido': c.fechaPedido, 'Fecha compra': c.fechaCompra, 'Para qué': c.paraQue })));
      hoja('Pedidos de material', d.solicitudes.map(s => ({ Fecha: fechaLocal(s.fecha, false), Artículo: s.articulo, Cantidad: num(s.cantidad), Pidió: s.pide, 'Para qué': s.paraQue, Proyecto: s.proyecto, Estado: (EST_SOL[s.estado] || [s.estado])[0], Entregó: s.entregadaPor, Motivo: s.motivo })));
      await window.Excel.descargar({ archivo: `Inventario ${A().hoyISO()}`, hojas });
      A().toast('Listo: Excel descargado');
    } catch (e) { A().toast('No se pudo preparar el Excel. Revisa la conexión y vuelve a intentar.'); }
    finally { b.disabled = false; }
  }


  /* ---------- Existencias como base de datos en Excel ----------
     «Descargar base de datos» baja una fila por artículo con su código (ID). Se cambia en Excel y se sube con «Subir Excel»:
     la app muestra primero qué agregaría, cambiaría o eliminaría, y solo guarda cuando se toca «Guardar».
     Reglas: sin código = artículo nuevo · con código y datos distintos = cambio · «Eliminar» en la columna Acción = se elimina (solo la Jefe).
     Lo que se deja vacío en un artículo que ya existe se queda como está. La cantidad solo cambia con «Cantidad real (conteo)» y deja su movimiento. */
  const normEx = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const COL_EX = [['id', 'id'], ['codigo', 'id'], ['accion', 'accion'], ['bodega', 'bodega'], ['articulo', 'nombre'], ['nombre', 'nombre'], ['categoria', 'categoria'], ['unidad', 'unidad'], ['cantidad hoy', 'hoy'], ['cantidad real', 'real'],
    ['minimo', 'minimo'], ['maximo', 'maximo'], ['ubicacion', 'ubicacion'], ['precio', 'costo'], ['proveedor', 'proveedor']];
  const colEx = t => { const n = normEx(t), m = COL_EX.find(([k]) => n === k || n.startsWith(k + ' ')); return m ? m[1] : ''; };
  // Texto limpio (sin caracteres raros); el apostrofo con que Excel protege un texto que empieza con = + - @ se quita.
  const txtEx = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'(?=[=+\-@])/, '').slice(0, max);
  /** Número entero de una celda: null si está vacía, NaN si no es un entero. Acepta $ y puntos o comas de miles. */
  function numEx(v) {
    if (typeof v === 'number') return Number.isInteger(v) ? v : NaN;
    const t = String(v == null ? '' : v).replace(/[\s$]/g, '');
    if (t === '') return null;
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
    if (/^\d{1,3}(,\d{3})+$/.test(t)) return Number(t.replace(/,/g, ''));
    return /^\d+$/.test(t) ? Number(t) : NaN;
  }
  const ETIQ_EX = { nombre: 'Nombre', categoria: 'Categoría', unidad: 'Unidad', minimo: 'Mínimo', maximo: 'Máximo', ubicacion: 'Ubicación', costo: 'Precio', proveedor: 'Proveedor' };
  let previaEx = null, errorEx = '', aplicandoEx = false;   // previaEx: { crudas } = las filas del Excel, esperando el «Guardar»

  /** Convierte las filas del Excel en filas ya revisadas: cada una trae lo que se haría o lo que está mal. Se vuelve a calcular con los datos de ahora. */
  function entenderEx(crudas) {
    const cop = A().cop, arts = articulos(), vistos = new Set();
    const buscar = (lista, t) => lista.find(x => normEx(x) === normEx(t));
    const filas = crudas.map((crudo, i) => {
      const f = {};
      Object.keys(crudo).forEach(k => { const c = colEx(k); if (c && String(f[c] == null ? '' : f[c]).trim() === '') f[c] = crudo[k]; });
      const errores = [], avisos = [], cambios = [], acc = normEx(f.accion);
      const r = { fila: crudo.__fila || i + 2, tipo: '', id: txtEx(f.id, 60), nombre: '', bodega: '', datos: {}, real: null, a: null, cambios, errores, avisos, omitida: '' };
      if (acc.startsWith('ejemplo')) { r.omitida = 'ejemplo'; return r; }
      const a = r.id ? artPorId(r.id) : null; r.a = a;
      r.nombre = txtEx(f.nombre, 80) || (a ? a.nombre : '');
      if (acc !== '' && !['agregar', 'cambiar', 'eliminar'].includes(acc)) { errores.push(`No entendí la acción «${txtEx(f.accion, 20)}». Usa Agregar, Cambiar o Eliminar (o déjala vacía).`); return r; }
      if (r.id && !a) { errores.push(`El código ${r.id} no está en la app (¿lo eliminaron?). Para agregarlo como nuevo, deja el código vacío.`); return r; }
      if (!r.id && (acc === 'cambiar' || acc === 'eliminar')) { errores.push(`«${acc === 'cambiar' ? 'Cambiar' : 'Eliminar'}» necesita el código de la fila (columna ID).`); return r; }
      if (r.id && acc === 'agregar') { errores.push('Ese artículo ya está en la app (tiene código). Para cambiarlo, deja la acción vacía o escribe «Cambiar».'); return r; }
      if (r.id && vistos.has(r.id)) { errores.push('El código está repetido en el Excel.'); return r; }
      if (r.id) vistos.add(r.id);
      if (acc === 'eliminar') {
        r.tipo = 'eliminar';
        if (!esJefe()) errores.push('Solo la Jefe puede eliminar artículos.');
        else if (compraAbierta(r.id)) errores.push('Tiene una compra en curso. Termínala antes de eliminarlo.');
        else if (D().solicitudes.some(s => s.estado === 'pendiente' && s.articuloId === r.id)) errores.push('Tiene pedidos de material esperando. Entrégalos o ciérralos antes.');
        else avisos.push('Se elimina el artículo. Sus movimientos quedan en el historial.');
        return r;
      }
      const nuevo = !a; r.tipo = nuevo ? 'agregar' : 'cambiar';
      const v = nuevo ? { ubicacion: '', proveedor: '' } : { nombre: a.nombre, categoria: a.categoria, unidad: a.unidad, minimo: num(a.minimo), maximo: num(a.maximo), ubicacion: a.ubicacion || '', costo: num(a.costo), proveedor: a.proveedor || '' };
      v.nombre = r.nombre;
      if (!v.nombre) errores.push('Falta el nombre del artículo.');
      else if (v.nombre !== (a && a.nombre) && /^[=+\-@]/.test(v.nombre)) errores.push('El nombre no puede empezar con = + - ni @.');
      let bod = a ? bodegaDe(a) : '';
      const tb = txtEx(f.bodega, 20);
      if (tb !== '') {
        const ok = buscar(BODEGAS, tb);
        if (!ok) errores.push(`No entendí la bodega «${tb.slice(0, 20)}». Usa Riohacha, Guamal o Bogotá.`);
        else if (a && ok !== bod) errores.push(`El Excel no cambia un artículo de bodega (hoy está en ${bod}). Para moverlo usa «Trasladar» en la app.`);
        else bod = ok;
      } else if (nuevo) errores.push('Falta la bodega (Riohacha, Guamal o Bogotá).');
      r.bodega = bod;
      const lista = (k, opciones, rotulo) => {
        const t = txtEx(f[k], 30);
        if (t === '') { if (nuevo) errores.push(`Falta ${rotulo}.`); return; }
        const ok = buscar(opciones, t);
        if (ok) v[k] = ok; else errores.push(`No entendí ${rotulo} «${t.slice(0, 24)}». Usa una de la lista.`);
      };
      lista('categoria', CATEGORIAS, 'la categoría'); lista('unidad', UNIDADES, 'la unidad');
      ['minimo', 'maximo', 'costo'].forEach(k => {
        const n = numEx(f[k]), rotulo = { minimo: 'el mínimo', maximo: 'el máximo', costo: 'el precio' }[k];
        if (n === null) { if (nuevo) errores.push(`Falta ${rotulo}.`); } else if (Number.isNaN(n)) errores.push(`${rotulo[0].toUpperCase() + rotulo.slice(1)} debe ser un número entero, 0 o más, sin letras.`); else v[k] = n;
      });
      const u = txtEx(f.ubicacion, 80); if (u) v.ubicacion = u;
      const p = txtEx(f.proveedor, 60); if (p) v.proveedor = p;
      const real = numEx(f.real);
      if (Number.isNaN(real)) errores.push('La cantidad real debe ser un número entero, 0 o más.');
      if (!errores.length && (nuevo || v.minimo !== num(a.minimo) || v.maximo !== num(a.maximo)) && !(v.maximo > v.minimo)) errores.push('El máximo debe ser mayor que el mínimo.');
      if (errores.length) return r;
      Object.keys(ETIQ_EX).forEach(k => {
        if (nuevo) { r.datos[k] = v[k]; return; }
        if (v[k] === (k === 'minimo' || k === 'maximo' || k === 'costo' ? num(a[k]) : (a[k] || ''))) return;
        r.datos[k] = v[k];
        cambios.push(`${ETIQ_EX[k]}: ${k === 'costo' ? cop(a.costo) : (a[k] == null || a[k] === '' ? '(vacío)' : a[k])} → ${k === 'costo' ? cop(v[k]) : v[k]}`);
      });
      if (nuevo) r.datos.bodega = bod;
      if (nuevo) cambios.push(`Bodega ${bod} · ${v.categoria} · ${v.unidad} · mínimo ${v.minimo}, máximo ${v.maximo} · ${cop(v.costo)} c/u`);
      if (real !== null && (nuevo ? real > 0 : real !== num(a.cantidad))) { r.real = real; cambios.push(nuevo ? `Cantidad inicial: ${real}` : `Cantidad: ${num(a.cantidad)} → ${real} (ajuste por conteo)`); }
      if (!nuevo && !cambios.length) r.omitida = 'igual';
      return r;
    });
    // Los nombres no se pueden repetir, contando lo que cambia el mismo Excel.
    const quita = new Set(filas.filter(x => x.tipo === 'eliminar' && !x.errores.length).map(x => x.id));
    const renombra = new Map(filas.filter(x => x.tipo === 'cambiar' && !x.errores.length && x.datos.nombre).map(x => [x.id, x.datos.nombre]));
    const cuenta = new Map(), clave = (b, n) => `${b}|${String(n).toLowerCase()}`, sumar = (b, n) => { const k = clave(b, n); cuenta.set(k, (cuenta.get(k) || 0) + 1); };
    arts.filter(a => !quita.has(a.id)).forEach(a => sumar(bodegaDe(a), renombra.get(a.id) || String(a.nombre)));
    filas.filter(x => x.tipo === 'agregar' && !x.errores.length).forEach(x => sumar(x.bodega, x.datos.nombre));
    filas.forEach(x => { if (!x.errores.length && x.datos.nombre && cuenta.get(clave(x.bodega, x.datos.nombre)) > 1) x.errores.push(`Ya hay un artículo con ese nombre en la bodega de ${x.bodega} (en la app o repetido en el Excel).`); });
    return filas;
  }

  async function leerExcelExistencias(archivo) {
    if (!archivo) return null;
    if (archivo.size > 1048576) throw new Error('El archivo pesa mucho. Usa uno de menos de 1 MB.');
    if (!/\.(xlsx|xls|csv)$/i.test(archivo.name)) throw new Error('Sube un archivo de Excel (.xlsx) o CSV.');
    const X = await cargarXlsx(), libro = X.read(await archivo.arrayBuffer(), { type: 'array' });
    const orden = libro.SheetNames.filter(n => ['bodega', 'existencias'].includes(normEx(n))).concat(libro.SheetNames);
    for (const n of orden) {
      // Los números se leen como números (raw) para no confundir «$85,000» con texto.
      const m = X.utils.sheet_to_json(libro.Sheets[n], { header: 1, defval: '', raw: true, blankrows: true });
      const h = m.slice(0, 20).findIndex(fila => { const c = fila.map(colEx); return c.includes('nombre') && c.includes('categoria') && c.filter(Boolean).length >= 4; });
      if (h < 0) continue;
      const titulos = m[h].map(c => String(c)), filas = [];
      m.slice(h + 1).forEach((fila, k) => {
        if (!fila.some(c => String(c == null ? '' : c).trim() !== '')) return;   // fila vacía: se salta
        const o = { __fila: h + k + 2 };
        titulos.forEach((t, j) => { if (t.trim() !== '') o[t] = fila[j] == null ? '' : fila[j]; });
        filas.push(o);
      });
      if (!filas.length) throw new Error('No encontré filas con artículos. Escríbelos debajo de los títulos.');
      if (filas.length > 300) throw new Error(`El Excel tiene ${filas.length} filas y el máximo es 300. Súbelo en partes.`);
      return filas;
    }
    throw new Error('No encontré los títulos (Artículo, Categoría, Unidad…). Usa el Excel que baja el botón «Descargar base de datos».');
  }

  async function descargarBase(b) {
    b.disabled = true;
    try {
      const hoy = A().hoyISO(), rango = (col, n) => ({ hoja: 'Listas', rango: `$${col}$5:$${col}$${4 + Math.max(1, n)}` });
      const ACCIONES = ['Agregar', 'Cambiar', 'Eliminar'];
      const arts = articulos().slice().sort((x, y) => BODEGAS.indexOf(bodegaDe(x)) - BODEGAS.indexOf(bodegaDe(y)) || String(x.categoria).localeCompare(String(y.categoria)) || String(x.nombre).localeCompare(String(y.nombre)));
      const filas = arts.map(a => [a.id, '', bodegaDe(a), a.nombre, a.categoria, a.unidad, num(a.cantidad), '', num(a.minimo), num(a.maximo), a.ubicacion, num(a.costo), a.proveedor, EST_ART[estadoArt(a)][0], num(a.cantidad) * num(a.costo)]);
      filas.push({ estilo: 'ejemplo', celdas: ['', 'Ejemplo (se ignora)', 'Riohacha', 'Artículo de ejemplo', 'EPP', 'unidades', '', 5, 2, 10, 'Estante A1', 12000, 'Proveedor de ejemplo', '', ''] });
      const base = { nombre: 'Bodega', titulo: 'Base de datos: bodega (Riohacha, Guamal y Bogotá)', vacias: 20,
        subtitulo: `Una fila por artículo (${hoy}). Cambia lo que quieras en las filas de siempre y escribe los artículos nuevos en las filas de abajo, sin código (ID). Luego sube este mismo archivo en la app (Inventario › Bodega › Subir Excel): la app te muestra qué cambia y tú confirmas. Las columnas grises solo se miran. Lo que dejes vacío en un artículo que ya existe se queda como está. La fila amarilla es de ejemplo y se ignora.`,
        columnas: [{ t: 'ID', ancho: 12, gris: true }, { t: 'Acción', ancho: 14, lista: rango('C', ACCIONES.length) }, { t: 'Bodega', ancho: 13, lista: rango('D', BODEGAS.length) }, { t: 'Artículo', ancho: 34 }, { t: 'Categoría', ancho: 16, lista: rango('A', CATEGORIAS.length) },
          { t: 'Unidad', ancho: 12, lista: rango('B', UNIDADES.length) }, { t: 'Cantidad hoy', ancho: 12, tipo: 'numero', gris: true }, { t: 'Cantidad real (conteo)', ancho: 15, tipo: 'numero', validar: { min: 0 } },
          { t: 'Mínimo', ancho: 10, tipo: 'numero', validar: { min: 0 } }, { t: 'Máximo', ancho: 10, tipo: 'numero', validar: { min: 1 } }, { t: 'Ubicación', ancho: 32 }, { t: 'Precio aprox.', ancho: 14, tipo: 'dinero', validar: { min: 0 } },
          { t: 'Proveedor', ancho: 26 },
          { t: 'Estado', ancho: 17, gris: true, formula: r => `IF(OR(D${r}="",G${r}=""),"",IF(G${r}<=0,"Agotado",IF(G${r}<=I${r},"Bajo del mínimo","Bien")))`,
            resaltar: [{ texto: 'Agotado', fondo: 'FFF8D3CF', letra: 'FF9B1C14' }, { texto: 'Bajo del mínimo', fondo: 'FFFDE7BF', letra: 'FF7A4B00' }] },
          { t: 'Valor en bodega', ancho: 16, tipo: 'dinero', gris: true, formula: r => `IF(OR(G${r}="",L${r}=""),"",G${r}*L${r})` }],
        filas };
      const ayuda = { nombre: 'Ayuda', titulo: 'Cómo usar esta base de datos', subtitulo: 'Cada fila es un artículo de la bodega. Lo que cambies aquí se aplica en la app cuando subes el archivo y confirmas.', columnas: [{ t: 'Qué', ancho: 30 }, { t: 'Cómo', ancho: 100 }],
        filas: [['Artículo nuevo', 'Escríbelo en las filas vacías de abajo, sin código (ID). Obligatorios: Bodega (Riohacha, Guamal o Bogotá), Artículo, Categoría, Unidad, Mínimo, Máximo y Precio. La Cantidad real es la que hay ahora (opcional).'],
          ['Cambiar un artículo', 'Cambia la celda (nombre, categoría, unidad, mínimo, máximo, ubicación, precio o proveedor). La app lo detecta sola; la columna Acción puede quedar vacía.'],
          ['Cambiar la cantidad', 'Escribe lo que contaste en «Cantidad real (conteo)». La app guarda un ajuste en Movimientos. «Cantidad hoy» no se usa al subir.'],
          ['Cambiar de bodega', 'El Excel no mueve artículos entre bodegas. Para eso usa «Trasladar» en la app: sale de una bodega y entra a la otra, cada una con su movimiento. El mismo artículo puede estar en las 3 bodegas (una fila en cada una).'],
          ['Eliminar un artículo', 'Escribe «Eliminar» en la columna Acción. Solo la Jefe puede, y solo si no tiene compras ni pedidos en curso. Borrar la fila NO elimina nada.'],
          ['Código (ID)', 'No lo cambies: así la app sabe qué artículo es. Una fila sin código es un artículo nuevo.'],
          ['Bodegas', BODEGAS.join(', ') + ' (siempre son estas 3)'], ['Categorías', CATEGORIAS.join(', ')], ['Unidades', UNIDADES.join(', ')],
          ['Estado y Valor en bodega', 'Se calculan solos en Excel (no se suben). Estado: Agotado, Bajo del mínimo o Bien.'],
          ['Atajos de Excel', 'Los títulos tienen filtros (flecha), la primera fila queda fija al bajar, Ctrl+Shift+L activa o quita filtros y Ctrl+F busca un artículo.'],
          ['Después de subir', 'La app te muestra qué agregaría, cambiaría o eliminaría. Nada se guarda hasta que toques «Guardar». Si subes el mismo archivo otra vez, lo que ya quedó guardado no se repite.']] };
      const listas = { nombre: 'Listas', titulo: 'Listas de opciones (no tocar)', subtitulo: 'Alimentan los menús desplegables de la hoja Bodega.', oculta: true, columnas: [{ t: 'Categoría', ancho: 20 }, { t: 'Unidad', ancho: 16 }, { t: 'Acción', ancho: 16 }, { t: 'Bodega', ancho: 16 }], filas: [] };
      for (let k = 0; k < Math.max(CATEGORIAS.length, UNIDADES.length, ACCIONES.length); k++) listas.filas.push([CATEGORIAS[k] || '', UNIDADES[k] || '', ACCIONES[k] || '', BODEGAS[k] || '']);
      await window.Excel.descargar({ archivo: `Base de datos Bodega ${hoy}`, hojas: [base, ayuda, listas] });
      A().toast('Listo: base de datos descargada');
    } catch (e) { A().toast('No se pudo preparar el Excel. Revisa la conexión y vuelve a intentar.'); }
    finally { b.disabled = false; }
  }

  /** Las escrituras de una fila del Excel. El cambio de cantidad y su movimiento van en la misma escritura (lo piden las reglas). */
  function opsEx(x) {
    if (x.tipo === 'eliminar') return [['borrar', 'articulos', x.id]];
    if (x.tipo === 'agregar') {
      const id = window.nube.idNuevo('ar'), movId = window.nube.idNuevo('mo'), ini = x.real || 0;
      return [['set', 'articulos', id, Object.assign({ cantidad: ini }, ini > 0 ? { ultimoMov: movId } : {}, x.datos)],
        ini > 0 ? movimiento({ articuloId: id, articulo: x.datos.nombre, tipo: 'entrada', motivo: 'inicial', cantidad: ini, saldo: ini, nota: 'Artículo nuevo (desde el Excel)' }, movId) : null].filter(Boolean);
    }
    const a = x.a;
    if (x.real === null) return Object.keys(x.datos).length ? [['mezclar', 'articulos', a.id, x.datos]] : [];
    const dif = x.real - num(a.cantidad), movId = window.nube.idNuevo('mo');
    return [['update', 'articulos', a.id, Object.assign({}, x.datos, { cantidad: window.nube.incremento(dif), ultimoMov: movId })],
      movimiento({ articuloId: a.id, articulo: x.datos.nombre || a.nombre, tipo: 'ajuste', motivo: 'conteo', cantidad: dif, saldo: x.real, nota: 'Ajuste desde el Excel' }, movId)];
  }
  const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  async function guardarExcelExistencias() {
    if (aplicandoEx || !previaEx) return;
    let buenas = entenderEx(previaEx.crudas).filter(x => !x.omitida && !x.errores.length);
    if (!buenas.length) return;
    const elim = buenas.filter(x => x.tipo === 'eliminar');
    if (elim.length) {
      const ok = await A().confirmar(`¿Eliminar ${pl(elim.length, 'artículo', 'artículos')}?`, `${elim.slice(0, 8).map(x => x.nombre).join(', ')}${elim.length > 8 ? '…' : ''}. Sus movimientos quedan en el historial.`, 'Eliminar');
      if (!ok) return;
      buenas = entenderEx(previaEx.crudas).filter(x => !x.omitida && !x.errores.length);   // los datos pudieron cambiar mientras se pensaba
    }
    aplicandoEx = true; errorEx = ''; pushPendientes = [];
    const cuenta = t => buenas.filter(x => x.tipo === t).length, ajustes = buenas.filter(x => x.real !== null && x.tipo === 'cambiar').length;
    const lotes = []; let cur = [], pesados = 0;
    const cerrar = () => { if (cur.length) lotes.push(cur); cur = []; pesados = 0; };
    buenas.forEach(x => {   // pocos artículos con movimiento por lote: así Firebase no se pasa de su límite al revisar las reglas
      const ops = opsEx(x), pesado = x.tipo !== 'eliminar' && x.real !== null;
      if (pesados + (pesado ? 1 : 0) > 6 || cur.length + ops.length > 150) cerrar();
      cur.push(...ops); if (pesado) pesados++;
    });
    cerrar();
    const resumen = [cuenta('agregar') ? pl(cuenta('agregar'), 'agregado', 'agregados') : '', cuenta('cambiar') ? pl(cuenta('cambiar'), 'cambiado', 'cambiados') : '', cuenta('eliminar') ? pl(cuenta('eliminar'), 'eliminado', 'eliminados') : ''].filter(Boolean).join(', ');
    let hechos = 0;
    try {
      for (let k = 0; k < lotes.length; k++) {
        if (k === lotes.length - 1 && (ajustes || cuenta('eliminar'))) lotes[k].push(aviso('jefe', 'Excel de la bodega', `${persona().nombre} subió un Excel de la bodega: ${resumen}${ajustes ? `; ${pl(ajustes, 'artículo ajustado', 'artículos ajustados')} por conteo` : ''}.`));
        await window.nube.lote(lotes[k].filter(Boolean)); hechos += lotes[k].length;
      }
      previaEx = null;
      A().toast(`Listo: ${resumen}.`);
      notificar(pushPendientes.slice());
    } catch (e) {
      errorEx = `${window.nube.explicar(e)}${hechos ? ' Una parte ya se guardó: revisa abajo y vuelve a subir el mismo Excel (lo que ya quedó no se repite).' : ''}`;
    } finally { aplicandoEx = false; pintar(); }
  }

  function htmlPreviaEx() {
    const App = A(), todas = entenderEx(previaEx.crudas), act = todas.filter(x => !x.omitida), buenas = act.filter(x => !x.errores.length);
    const n = t => buenas.filter(x => x.tipo === t).length, malas = act.length - buenas.length;
    const iguales = todas.filter(x => x.omitida === 'igual').length, ejemplo = todas.filter(x => x.omitida === 'ejemplo').length;
    const omit = [iguales ? `${pl(iguales, 'ya estaba igual', 'ya estaban iguales')} (no se tocan)` : '', ejemplo ? `${pl(ejemplo, 'fila de ejemplo', 'filas de ejemplo')} (se ignoran)` : ''].filter(Boolean).join(' · ');
    const partes = [n('agregar') ? `${n('agregar')} para agregar` : '', n('cambiar') ? `${n('cambiar')} para cambiar` : '', n('eliminar') ? `${n('eliminar')} para eliminar` : ''].filter(Boolean).join(' · ') || 'nada para guardar';
    let h = `<div class="card"><b>Esto entendí del Excel (${pl(todas.length, 'fila', 'filas')})</b><span class="meta">${esH(partes)}${malas ? ` · ${malas} con problema (no se guardan)` : ''}${omit ? ' · ' + esH(omit) : ''}. Revisa y toca «Guardar». Nada se guarda antes.</span></div>`;
    h += `<div class="list">${act.map(x => {
      const tono = x.errores.length ? ['Con problema', 's-peligro', 'aviso'] : x.tipo === 'agregar' ? ['Agregar', 's-disco', 'mas'] : x.tipo === 'eliminar' ? ['Eliminar', 's-peligro', 'aviso'] : ['Cambiar', 's-pend', 'lapiz'];
      return `<div class="card persona-reg${x.errores.length ? ' pausada' : ''}"><span class="card-head"><span class="card-title">${esH(x.nombre || '(sin nombre)')}</span>${App.pill(tono[0], tono[1], tono[2])}</span>
        <span class="meta">Fila ${x.fila}${x.id ? ' · ' + esH(x.id) : ' · artículo nuevo'}</span>
        ${x.errores.map(e => `<span class="meta err-txt">${esH(e)}</span>`).join('')}${x.errores.length ? '' : x.cambios.map(c => `<span class="meta">${esH(c)}</span>`).join('')}${x.errores.length ? '' : x.avisos.map(c => `<span class="meta">${esH(c)}</span>`).join('')}</div>`;
    }).join('')}</div>`;
    return h + `<div class="row acciones-inv"><button class="btn primary" type="button" data-accion="exguardar"${buenas.length && !aplicandoEx ? '' : ' disabled'}>${window.ico('check')}Guardar ${pl(buenas.length, 'cambio', 'cambios')}</button><button class="btn ghost" type="button" data-accion="exdescartar">Descartar</button></div>`;
  }

  /* ---------- eventos ---------- */
  $('invSecciones').addEventListener('click', e => {
    const b = e.target.closest('[data-sec]'); if (!b) return;
    seccion = b.dataset.sec; A().S.filtro.inventario = ''; $('qInventario').value = '';
    A().pintarTodo();
  });
  $('qInventario').addEventListener('input', UI.retardar(() => pintar(), 300));
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
      trasladar: () => a && trasladar(a), conteo: () => conteo(), excel: () => descargarExcel(b), bdexcel: () => descargarBase(b), exguardar: () => guardarExcelExistencias(), exdescartar: () => { previaEx = null; errorEx = ''; pintar(); }, monto: () => cambiarMonto(), kardex: () => a && kardex(a), excelkardex: () => a && descargarKardex(b, a),
      masLinea: () => masLinea(), quitarLinea: () => quitarLinea(b.dataset.n),
      ir: () => { seccion = b.dataset.sec; if (b.dataset.subk) sub[b.dataset.subk] = b.dataset.subv; A().S.filtro.inventario = b.dataset.filtro || ''; $('qInventario').value = ''; A().pintarTodo(); }
    };
    const fn = mapa[b.dataset.accion];
    // Si el registro ya no existe (otra persona lo cambió o borró), se avisa en vez de no hacer nada.
    if (!fn || fn() === null) A().toast('Ese registro ya cambió. Revisa la lista otra vez.');
  }
  $('invContenido').addEventListener('click', alTocar);
  $('invContenido').addEventListener('change', async e => {
    const arch = e.target.closest('#invArchivo'); if (!arch || !esBodega()) return;
    errorEx = '';
    try { const filas = await leerExcelExistencias(arch.files && arch.files[0]); previaEx = filas ? { crudas: filas } : null; }
    catch (er) { previaEx = null; errorEx = er && er.message === 'xlsx' ? 'No se pudo cargar el lector de Excel. Revisa la conexión y vuelve a intentar.' : (er && er.message) || 'No se pudo leer el archivo.'; }
    pintar();
  });
  $('acCampos').addEventListener('click', alTocar);
  $('acForm').addEventListener('submit', e => { e.preventDefault(); guardar(); });
  $('acSecundario').addEventListener('click', () => { if (accion && accion.alSecundario) accion.alSecundario(); });

  // Los selectores de las líneas extra de una compra llenan solos el nombre y el valor, como el primero.
  $('acCampos').addEventListener('change', e => {
    const sel = e.target.closest('select[data-lx="art"]'); if (!sel) return;
    const f = sel.closest('.linea-extra'), x = artPorId(sel.value); if (!f || !x) return;
    const n = Math.max(1, num(x.maximo) - num(x.cantidad));
    f.querySelector('[data-lx="que"]').value = x.nombre; f.querySelector('[data-lx="cant"]').value = n; f.querySelector('[data-lx="val"]').value = num(x.costo) * n;
  });

  window.Inventario = Object.freeze({ pintar, resumen, tareas, leerFoto, cargarXlsx, fechaLocal, funcion: miFuncion, irA: s => { if (secciones().some(x => x[0] === s)) seccion = s; } });
})();
