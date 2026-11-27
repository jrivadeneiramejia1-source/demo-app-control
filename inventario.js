/* inventario.js — Módulo Inventario de la demo: bodega de consumibles con las compras adentro.
   Partes: Qué hay que hacer · Bodega (3 bodegas: Riohacha, Guamal y Bogotá, con traslados) · Movimientos · Pedidos de material · Compras · Proveedores · Conteo · Resumen.
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
  const SECCIONES = [['hacer', 'Qué hay que hacer'], ['existencias', 'Bodega'], ['movimientos', 'Movimientos'], ['solicitudes', 'Pedidos de material'], ['compras', 'Compras'], ['proveedores', 'Proveedores'], ['conteo', 'Conteo'], ['resumen', 'Resumen']];
  const SEC = Object.fromEntries(SECCIONES);
  const sec = (...ks) => ks.map(k => [k, SEC[k]]);
  // Qué partes ve cada nivel. El Gerente ve todo a detalle pero sin lo del día a día; quien solo pide ve lo suyo y las existencias;
  // quien solo ve, todo sin botones; la Jefe empieza por el Panorama (todo el inventario en una pantalla).
  const SECCIONES_NIVEL = {
    jefe: [['panorama', 'Panorama']].concat(SECCIONES),
    bodega: SECCIONES,
    compra: sec('hacer', 'existencias', 'compras', 'proveedores', 'solicitudes', 'movimientos', 'resumen'),
    coordina: sec('hacer', 'compras', 'proveedores', 'existencias', 'solicitudes', 'movimientos', 'resumen'),
    pide: [['hacer', 'Lo mío']].concat(sec('existencias', 'solicitudes', 'compras')),
    ver: sec('existencias', 'movimientos', 'solicitudes', 'compras', 'resumen'),
    finanzas: sec('existencias', 'movimientos', 'solicitudes', 'compras', 'proveedores', 'resumen'),
    gerente: sec('resumen', 'compras', 'proveedores', 'existencias', 'solicitudes')
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
  const MOTIVO_MOV = { traslado: 'Traslado entre bodegas', inicial: 'Cantidad inicial', compra: 'Compra recibida', entrega: 'Entrega', devolucion: 'Devolución', conteo: 'Ajuste por conteo', dano: 'Daño o pérdida', precio: 'Cambio de precio' };
  let seccion = 'hacer';
  const sub = { movimientos: 'todos', solicitudes: 'pendiente', compras: 'curso', bodega: 'todas', bodMov: 'todas', bodSol: 'todas', bodCom: 'todas', bodCon: 'todas', bodHacer: 'todas', bodRes: 'todas' };
  // Qué clave de filtro de bodega tiene cada parte (el Panorama la reinicia al llevar a una parte).
  const BOD_DE_SEC = { hacer: 'bodHacer', movimientos: 'bodMov', solicitudes: 'bodSol', compras: 'bodCom', conteo: 'bodCon', resumen: 'bodRes' };
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
  // Bodega de cada cosa. Con datos viejos (sin bodega guardada) NO se inventa una: movimiento y pedido toman la de su artículo; si no hay artículo, sale sin bodega.
  const bodegaMov = m => { if (BODEGAS.includes(m.bodega)) return m.bodega; const a = artPorId(m.articuloId); return a ? bodegaDe(a) : ''; };
  const bodegaSol = s => { if (BODEGAS.includes(s.bodega)) return s.bodega; const a = artPorId(s.articuloId); return a ? bodegaDe(a) : ''; };
  const bodegaSurteDe = s => (BODEGAS.includes(s.bodegaSurte) ? s.bodegaSurte : '');
  const bodegaLinea = l => { if (BODEGAS.includes(l.bodega)) return l.bodega; const a = l.articuloId ? artPorId(l.articuloId) : null; return a ? bodegaDe(a) : ''; };
  const bodegasPedidasCompra = c => Array.from(new Set(lineasDe(c).map(bodegaLinea).filter(Boolean)));
  // Una compra recibida: sus movimientos dicen a qué bodega entró cada línea (puede ser otra que la pedida). Solo los ve quien ve movimientos; si no, queda la pedida.
  const movsDeCompra = c => (c.estado === 'recibido' && veMovs() ? D().movimientos.filter(m => m.compraId === c.id && m.motivo === 'compra') : []);
  // Los movimientos de una línea (la `i`-ésima de la compra): el que juntó varias líneas en uno solo trae `partes` ({ i, cantidad }); los demás se reconocen por el artículo pedido (`lineaArticuloId`) o, si no lo trae, por el artículo.
  const movsDeLinea = (movs, l, i) => movs.filter(m => (Array.isArray(m.partes) ? m.partes.some(p => p.i === i) : m.lineaArticuloId ? m.lineaArticuloId === l.articuloId : m.articuloId === l.articuloId));
  const cantidadDeLinea = (m, i) => (Array.isArray(m.partes) ? m.partes.filter(p => p.i === i).reduce((s, p) => s + num(p.cantidad), 0) : num(m.cantidad));
  const bodegaRealLinea = (l, movs, i) => {
    const bs = l.articuloId ? movsDeLinea(movs, l, i).map(bodegaMov).filter(Boolean) : [];
    return bs.length ? bs[0] : bodegaLinea(l);
  };
  /** Las bodegas donde de verdad entró lo de una compra recibida (la pedida si no hay movimientos que ver). */
  const bodegasRealesCompra = c => { const movs = movsDeCompra(c); return Array.from(new Set(lineasDe(c).map((l, i) => bodegaRealLinea(l, movs, i)).filter(Boolean))); };
  // Las de cada línea y, si ya se recibió, también donde entró (para el filtro por bodega).
  const bodegasCompra = c => Array.from(new Set(bodegasPedidasCompra(c).concat(bodegasRealesCompra(c))));
  // Un pedido sale en el filtro de la bodega que lo pidió y en el de la que lo entregó; una compra, en el de cada bodega a la que va alguna línea.
  const bodegasSol = s => Array.from(new Set([bodegaSol(s), bodegaSurteDe(s)].filter(Boolean)));
  const pillBod = b => (b ? A().pill(b, 's-pend', 'caja') : '');
  const compraAbierta = id => D().compras.find(c => ABIERTA.includes(c.estado) && (c.articuloId === id || lineasDe(c).some(l => l.articuloId === id))) || null;
  // «Pagaron más de lo autorizado»: más del 10 % sobre el valor aprobado.
  const sobrecosto = c => (['comprado', 'recibido'].includes(c.estado) && num(c.valorAprox) > 0 && num(c.valorReal) > num(c.valorAprox) * 1.1 ? { pct: Math.round((num(c.valorReal) / num(c.valorAprox) - 1) * 100) } : null);
  const persona = () => A().S.persona;
  // En la demo con personas de prueba se nombra a la persona (Andrés B.); con cuentas propias, el rol (Bodega), porque puede haber varias.
  // Con varias personas en un mismo rol (por ejemplo, 3 Gerentes) se dice el rol; si hay una sola, su nombre.
  const nombreRol = rol => { rol = ROL_DE[rol] || rol; const ps = window.DEMO.PERSONAS.filter(x => x.rol === rol), r = window.DEMO.rolDe(rol); return persona() && persona().prueba && ps.length === 1 ? ps[0].corto : (r ? r.rolTxt : rol); };
  const perm = () => A().permiso('inventario');
  const esJefe = () => perm() === 'jefe';
  const esGerente = () => perm() === 'gerente';
  const esBodega = () => perm() === 'bodega' || esJefe();       // la Jefe también puede mover la bodega
  const secciones = () => SECCIONES_NIVEL[perm()] || SECCIONES_NIVEL.ver;
  // Las compras las autoriza la Coordinadora de compras (ya no la Jefe) y, si valen MÁS del monto del Gerente, después el Gerente general.
  // Lo que pide la Coordinadora lo decide el Gerente general; lo que pide el Gerente general nace autorizado. Nadie autoriza lo suyo.
  const esCoordinador = () => perm() === 'coordina';
  const esGerenteGeneral = () => esGerente() && A().tieneExtra('general');
  const ROL_DE = { coordina: 'coordcompras', gerente: 'gerente', jefe: 'jefe', compras: 'compras', asistente: 'asistente' };   // papel -> rol (para nombrarlo y avisarle)
  const autorizadorDe = c => (c.estado === 'por-gerente' || c.pideRol === 'coordcompras' ? 'gerente' : 'coordina');
  const esPorAutorizar = c => c.estado === 'pedido' || c.estado === 'por-gerente';
  // Nadie decide lo suyo (se compara el correo que dejó la compra al crearse; las de antes, sin correo, por el nombre).
  const esMiaLaCompra = c => (c.pideCorreo ? c.pideCorreo === persona().correo : c.pide === persona().nombre);
  const puedoDecidir = c => esPorAutorizar(c) && !esMiaLaCompra(c) && puedoHacer(autorizadorDe(c));
  // Qué papel hace la persona en el flujo, según su NIVEL (no su rol): así sirve también cuando la Jefe le sube o le baja el nivel.
  const miFuncion = () => (esJefe() ? 'jefe' : esGerenteGeneral() ? 'gerente' : esGerente() ? '' : perm() === 'bodega' ? 'asistente' : perm() === 'compra' ? 'compras' : perm() === 'coordina' ? 'coordina' : '');
  // Bodega con el permiso extra «compra» también hace y registra compras (como Compras).
  const hagoCompras = () => perm() === 'compra' || (perm() === 'bodega' && A().tieneExtra('compra'));
  // Quién puede hacer una tarea: la persona con ese papel; el Gerente general también hace lo de la Coordinadora (acceso total); la Jefe hace todo menos autorizar (ni lo del Gerente ni lo de la Coordinadora).
  const puedoHacer = rol => miFuncion() === rol || (rol === 'compras' && hagoCompras()) || (rol === 'coordina' && esGerenteGeneral()) || (esJefe() && rol !== 'gerente' && rol !== 'coordina');
  const esMia = t => miFuncion() === t.rol || (t.rol === 'compras' && hagoCompras());
  const veTodo = () => perm() !== 'pide';                                       // quien solo pide ve solo lo suyo
  const veMovs = () => veTodo() && !esGerente();                                // el Gerente ve el resumen, no cada movimiento
  const puedoPedirMaterial = () => ['pide', 'finanzas', 'coordina', 'compra', 'bodega', 'jefe'].includes(perm());
  const puedoPedirCompra = () => ['pide', 'finanzas', 'coordina', 'compra', 'bodega', 'gerente', 'jefe'].includes(perm());
  // Marcas que exigen las reglas al pedir: la cuenta, su correo y la hora del servidor (no se pueden inventar).
  const misMarcas = () => ({ pideUid: window.nube.uid(), pideCorreo: window.nube.correo(), creadoEn: window.nube.ahoraServidor() });
  const ahora = () => new Date().toISOString();
  const delMes = f => String(f || '').slice(0, 7) === A().hoyISO().slice(0, 7);
  const texto = (...partes) => partes.filter(Boolean).join(' ').toLowerCase();

  /* ---------- código del artículo, vista de tabla, clase ABC y qué contar hoy ---------- */
  const normCod = v => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const LS_VISTA = 'inv.vista';
  const ancho = () => { try { return window.matchMedia('(min-width: 900px)').matches; } catch (e) { return false; } };
  const leerVista = () => { try { return localStorage.getItem(LS_VISTA) === 'tabla' ? 'tabla' : 'tarjetas'; } catch (e) { return 'tarjetas'; } };
  const guardarVista = v => { try { localStorage.setItem(LS_VISTA, v === 'tabla' ? 'tabla' : 'tarjetas'); } catch (e) { /* sin guardar: igual se ve */ } };
  const vistaTabla = () => ancho() && leerVista() === 'tabla';
  let ordenT = { col: '', dir: 1 };
  const verAbc = () => perm() !== 'pide';       // la clase sale de los movimientos, que quien solo pide no ve
  /** Clase ABC con lo que salió de la bodega en 90 días (entregas y daños; los traslados no), valorizado: A = lo que suma el 80 % del valor,
      B = el 15 % siguiente y C = el resto (lo que no salió nada, también). Sin ninguna salida, todo queda sin clase. */
  function abcDe() {
    const desde = Date.now() - 90 * 86400000, valores = new Map();
    D().movimientos.forEach(m => {
      if (m.tipo !== 'salida' || !['entrega', 'dano'].includes(m.motivo) || !(Date.parse(m.fecha) >= desde)) return;
      const a = artPorId(m.articuloId); if (!a) return;
      valores.set(a.id, (valores.get(a.id) || 0) + (m.valor != null ? num(m.valor) : Math.abs(num(m.cantidad)) * num(a.costo)));
    });
    const total = Array.from(valores.values()).reduce((x, v) => x + v, 0), out = new Map();
    let antes = 0;
    Array.from(valores.entries()).sort((x, y) => y[1] - x[1]).forEach(([id, v]) => { const p = total ? antes / total : 1; out.set(id, { clase: p < 0.8 ? 'A' : p < 0.95 ? 'B' : 'C', valor: v, pct: total ? v / total : 0 }); antes += v; });
    articulos().forEach(a => { if (!out.has(a.id)) out.set(a.id, { clase: total ? 'C' : '', valor: 0, pct: 0 }); });
    return out;
  }
  // Cada cuántos días se cuenta un artículo según su clase.
  const FREC_CONTEO = { A: 30, B: 90, C: 180 };
  /** Último conteo de un artículo: la fecha que se guarda al contarlo (cuadre o no) o, en datos viejos, su último ajuste por conteo. */
  const ultimoConteoDe = a => {
    const fs = D().movimientos.filter(m => m.articuloId === a.id && m.motivo === 'conteo').map(m => String(m.fecha).slice(0, 10));
    if (/^\d{4}-\d{2}-\d{2}$/.test(a.ultimoConteo || '')) fs.push(a.ultimoConteo);
    return fs.sort().pop() || '';
  };
  /** Lo que ya toca contar (nunca contado o pasado su plazo), lo más valioso y lo más viejo primero. */
  function porContarHoy() {
    const abc = abcDe();
    return articulos().map(a => { const clase = (abc.get(a.id) || {}).clase || 'C', u = ultimoConteoDe(a), hace = u ? -A().diasHasta(u) : null; return { a, clase, u, hace, debe: hace == null || hace >= FREC_CONTEO[clase] }; })
      .filter(x => x.debe).sort((x, y) => x.clase.localeCompare(y.clase) || (y.hace == null ? 1e9 : y.hace) - (x.hace == null ? 1e9 : x.hace) || String(x.a.nombre).localeCompare(String(y.a.nombre)));
  }
  const HOY_MAX = 10;
  const contarHoyDe = bod => porContarHoy().slice(0, HOY_MAX).filter(x => bodegaDe(x.a) === bod).map(x => x.a.id);

  /* ---------- proveedores ---------- */
  const PESOS_NIT = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  /** Dígito de verificación de un NIT (el de la DIAN): cada cifra, de derecha a izquierda, se multiplica por su peso y se suma;
      el resto de dividir esa suma entre 11 es el dígito (si el resto es 0 o 1, ese mismo; si no, 11 menos el resto). */
  const dvNit = base => { const sum = String(base).split('').reverse().reduce((t, c, i) => t + Number(c) * PESOS_NIT[i], 0), r = sum % 11; return r > 1 ? 11 - r : r; };
  /** Lee el NIT que escribió la persona: devuelve { nit } (vacío si no escribió nada) o { error } diciendo cómo arreglarlo. */
  function leerNit(txt) {
    const t = String(txt == null ? '' : txt).replace(/[.\s]/g, '').replace(/[–—−]/g, '-');
    if (!t) return { nit: '' };
    const m = /^(\d{5,15})-(\d)$/.exec(t);
    if (!m) {
      if (/^\d{6,16}$/.test(t) && Number(t.slice(-1)) === dvNit(t.slice(0, -1))) return { error: `Escríbelo con guion antes del último número: ${t.slice(0, -1)}-${t.slice(-1)}.` };
      if (/^\d{5,15}$/.test(t)) return { error: `Falta el dígito de verificación. Si ${t} es el NIT sin dígito, escríbelo así: ${t}-${dvNit(t)}.` };
      return { error: 'El NIT va con su dígito de verificación después de un guion, sin puntos. Ejemplo: 900000001-2.' };
    }
    const bueno = dvNit(m[1]);
    if (Number(m[2]) !== bueno) return { error: `El dígito de verificación no cuadra: el NIT ${m[1]} termina en -${bueno}, no en -${m[2]}.` };
    return { nit: m[1] + '-' + m[2] };
  }
  const provs = () => D().proveedores || [];
  const normNom = v => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  /** El mismo artículo: mismo nombre (sin mayúsculas ni tildes) y misma unidad. */
  const mismoArt = (x, y) => normNom(x.nombre) === normNom(y.nombre) && String(x.unidad || '') === String(y.unidad || '');
  /** Los mismos artículos que hay en las OTRAS bodegas. */
  const gemelos = a => articulos().filter(x => x.id !== a.id && bodegaDe(x) !== bodegaDe(a) && mismoArt(x, a));
  /** Dónde está lo de un pedido: `a` (el artículo del pedido), `todos` (ese y sus iguales de otras bodegas), `propio` (el de la bodega pedida, si la tiene),
      cuánto hay allí (`hayPed`) y `otras`: los artículos de las OTRAS bodegas que tienen algo. Sin artículo, null. */
  const dondeSol = s => {
    const a = artPorId(s.articuloId); if (!a) return null;
    const todos = [a].concat(gemelos(a)).sort((x, y) => BODEGAS.indexOf(bodegaDe(x)) - BODEGAS.indexOf(bodegaDe(y)));
    const ped = bodegaSol(s), propio = todos.find(x => bodegaDe(x) === ped) || null;
    return { a, todos, ped, propio, hayPed: propio ? num(propio.cantidad) : 0, otras: todos.filter(x => x !== propio && num(x.cantidad) > 0) };
  };
  const textoOtras = d => d.otras.map(x => `En ${bodegaDe(x)} hay ${cantTxt(x.cantidad, x.unidad)}.`).join(' ');
  /** «No alcanza: en Riohacha hay 0 pares. En Bogotá hay 10 pares.» */
  const avisoNoAlcanza = (d, final) => `<div class="aviso warn"><span><b>No alcanza:</b> en ${esH(d.ped)} hay ${esH(cantTxt(d.hayPed, d.a.unidad))}.${d.otras.length ? ' ' + esH(textoOtras(d)) : ''}${final || ''}</span></div>`;
  /** Los botones para entregar un pedido: «Entregar» si la bodega pedida alcanza; si no, «Entregar lo que hay» y un «Entregar desde X» por cada otra bodega que tenga. */
  const botonesEntregar = (s, d) => {
    const id = ` data-id="${esH(s.id)}"`;
    if (d.hayPed >= num(s.cantidad)) return boton('entregar', 'Entregar', 'entrega', id, 'primary small');
    return (d.hayPed > 0 ? boton('entregar', `Entregar lo que hay (${d.hayPed})`, 'entrega', id, 'primary small') : '')
      + d.otras.map(x => boton('entregar', `Entregar desde ${bodegaDe(x)}`, 'entrega', `${id} data-desde="${esH(x.id)}"`, d.hayPed > 0 ? 'small' : 'primary small')).join('');
  };
  /** Otras bodegas donde SOBRA de este artículo (más que su mínimo): se puede traer con un traslado. */
  const sobraEnOtras = a => gemelos(a).map(x => ({ x, bod: bodegaDe(x), sobra: num(x.cantidad) - num(x.minimo) })).filter(o => o.sobra > 0).sort((p, q) => q.sobra - p.sobra);
  const textoSobra = a => sobraEnOtras(a).map(o => `En ${o.bod} hay ${cantTxt(o.x.cantidad, o.x.unidad)}.`).join(' ');
  const botonesTraer = a => (esBodega() ? sobraEnOtras(a).map(o => boton('traer', `Traer de ${o.bod}`, 'entrega', ` data-id="${esH(o.x.id)}" data-dest="${esH(bodegaDe(a))}" data-cant="${Math.max(1, Math.min(o.sobra, num(a.maximo) - num(a.cantidad)))}"`)).join('') : '');
  /** Para qué bodega se pidió lo que movió un movimiento: la `bodegaPedida` (entrega desde otra bodega) o, en una compra que llegó a otra bodega, la del artículo pedido (`lineaArticuloId`). */
  const bodegaPedidaMov = m => { if (BODEGAS.includes(m.bodegaPedida)) return m.bodegaPedida; const x = m.lineaArticuloId ? artPorId(m.lineaArticuloId) : null; return x ? bodegaDe(x) : ''; };
  /** Dónde entra lo que llegó de un artículo a la bodega `dest`: él mismo, el mismo artículo de esa bodega (mismo nombre y unidad), o uno nuevo allí. Si ya hay uno con otra unidad, un error. */
  const destinoLlegada = (a, dest) => {
    if (bodegaDe(a) === dest) return { art: a };
    const d = articulos().find(x => x.id !== a.id && bodegaDe(x) === dest && normNom(x.nombre) === normNom(a.nombre));
    if (d && !mismoArt(d, a)) return { error: `En la bodega de ${dest} ya hay «${d.nombre}» en otra unidad (${d.unidad}). Cámbiale la unidad o el nombre antes de recibirlo allí.` };
    return d ? { art: d } : { nuevo: true };
  };
  /** El texto del botón de recibir, con la bodega a la que va cuando se sabe. */
  const textoRecibir = c => {
    const bods = bodegasCompra(c);
    if (lineasDe(c).length > 1) return bods.length === 1 ? `Recibir la compra en ${bods[0]}` : 'Recibir la compra';
    return c.articuloId ? (bods.length === 1 ? `Recibir en bodega de ${bods[0]}` : 'Recibir en bodega') : 'Marcar como recibida';
  };
  const sinPunto = t => String(t).replace(/[.\s]+$/, '');   // para unir un motivo al aviso sin dejar «..»
  const recorta = (t, max) => (String(t).length > max ? String(t).slice(0, max - 1) + '…' : String(t));
  const provPorNombre = n => provs().find(p => normNom(p.nombre) === normNom(n)) || null;
  const nitSolo = n => String(n || '').split('-')[0];
  const veProv = () => ['compra', 'coordina', 'bodega', 'jefe', 'finanzas', 'gerente'].includes(perm());
  // Agrega y cambia proveedores quien hace las compras (Compras, la Jefe y Bodega con el extra «compra»: lo mismo que piden las reglas).
  const gestionaProv = () => puedoHacer('compras');
  const HECHAS = ['comprado', 'recibido', 'sin-autorizar'];
  const delAnio = f => String(f || '').slice(0, 4) === A().hoyISO().slice(0, 4);
  /** Compras ya hechas a un proveedor: las que guardan su id y, en las de antes (solo con el nombre escrito), las del mismo nombre. */
  const comprasDe = p => D().compras.filter(c => HECHAS.includes(c.estado) && (c.proveedorId ? c.proveedorId === p.id : normNom(c.proveedor) === normNom(p.nombre)))
    .sort((x, y) => String(y.fechaCompra).localeCompare(String(x.fechaCompra)));
  function statsProv(p) {
    const cs = comprasDe(p);
    return { cs, n: cs.length, anio: cs.filter(c => delAnio(c.fechaCompra)).reduce((t, c) => t + num(c.valorReal), 0), ultima: cs.length ? cs[0].fechaCompra : '' };
  }
  /** Último precio pagado por cada artículo en las compras de ese proveedor (con el anterior, para ver si subió). Lo pagado se anota por toda la compra:
      en una compra con varios artículos se reparte según lo que valía cada uno al pedirlo. `cs` va de la más nueva a la más vieja. */
  function preciosProv(cs) {
    const por = new Map();
    cs.forEach(c => {
      const ls = lineasDe(c), suma = ls.reduce((t, l) => t + num(l.valor), 0), pagado = num(c.valorReal), factor = pagado > 0 && suma > 0 ? pagado / suma : 1;
      ls.forEach(l => {
        const pag = ls.length === 1 ? pagado : Math.round(num(l.valor) * factor);
        if (!(num(l.cantidad) > 0) || !(pag > 0)) return;
        const k = normNom(l.que), cada = Math.round(pag / num(l.cantidad)), x = por.get(k);
        if (!x) por.set(k, { que: l.que, cada, fecha: c.fechaCompra, previo: 0 });
        else if (!x.previo) { x.previo = cada; x.previoFecha = c.fechaCompra; }
      });
    });
    return Array.from(por.values()).sort((x, y) => String(x.que).localeCompare(String(y.que), 'es'));
  }

  /** Lista de tareas pendientes, de la más urgente a la menos. */
  function tareas() {
    const d = D(), out = [];
    articulos().forEach(a => {
      const e = estadoArt(a);
      if (e !== 'bien' && !compraAbierta(a.id)) out.push({ tipo: 'pedir', rol: 'asistente', urg: e === 'agotado' ? 0 : 5, art: a, sug: Math.max(1, num(a.maximo) - num(a.cantidad)) });
    });
    d.solicitudes.filter(s => s.estado === 'pendiente').forEach(s => {
      const a = artPorId(s.articuloId), d = dondeSol(s);
      out.push({ tipo: 'entregar', rol: 'asistente', urg: 1, sol: s, art: a, alcanza: !!d && d.hayPed >= num(s.cantidad) });
    });
    d.compras.forEach(c => {
      const a = c.articuloId ? artPorId(c.articuloId) : null;
      if (esPorAutorizar(c)) {
        out.push({ tipo: 'autorizar', rol: autorizadorDe(c), urg: a && estadoArt(a) === 'agotado' ? 0 : 2, compra: c, art: a });
      }
      else if (c.estado === 'autorizado') out.push({ tipo: 'comprar', rol: 'compras', urg: 3, compra: c, art: a });
      else if (c.estado === 'comprado') out.push({ tipo: 'recibir', rol: 'asistente', urg: 3, compra: c, art: a });
      else if (c.estado === 'sin-autorizar' && !c.revisada) out.push({ tipo: 'revisar', rol: 'coordina', urg: 4, compra: c, art: a });
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
    // Quien hace las compras «hace» una compra (la Coordinadora la autoriza antes); los demás la piden. El Gerente general la hace y nace autorizada.
    $('btnPedirCompraTxt').textContent = hagoCompras() || esGerenteGeneral() ? 'Hacer una compra' : 'Pedir una compra';
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
    q.hidden = !['existencias', 'movimientos', 'compras', 'proveedores'].includes(seccion);
    q.placeholder = seccion === 'movimientos' ? 'Buscar artículo, persona o proyecto' : seccion === 'compras' ? 'Buscar compra, proveedor o persona' : seccion === 'proveedores' ? 'Buscar proveedor, NIT o contacto' : 'Buscar artículo, categoría o ubicación';
    const c = $('invContenido');
    if (['articulos', 'compras', 'solicitudes', 'movimientos'].some(App.cargando) || (seccion === 'proveedores' && App.cargando('proveedores'))) { UI.poner(c, UI.esqueleto(seccion === 'movimientos' ? 5 : 3, true, seccion === 'movimientos' ? 'fila' : undefined)); return; }
    $('vInventario').classList.toggle('ancha', seccion === 'existencias' && vistaTabla());
    const html = { panorama: htmlPanorama, hacer: perm() === 'pide' ? htmlMios : () => htmlTareas(f), existencias: () => htmlExistencias(f), movimientos: htmlMovimientos, solicitudes: htmlSolicitudes, compras: htmlCompras, proveedores: htmlProveedores, conteo: htmlConteo, resumen: htmlResumen }[seccion];
    if (UI.poner(c, html())) window.llenarIconos(c);
  }

  const subChips = (clave, ops, etiqueta) => `<div class="chips sub" role="group" aria-label="${esH(etiqueta || 'Filtrar')}">${ops.map(([k, n, cuenta]) => `<button type="button" class="chip" data-sub="${clave}" data-val="${k}" aria-pressed="${sub[clave] === k}">${esH(n)}${cuenta != null ? ` <span class="n">${cuenta}</span>` : ''}</button>`).join('')}</div>`;
  /** Filtro «Todas las bodegas / Riohacha / Guamal / Bogotá» con el número de cada una. `lista`: lo que se cuenta; `bodsDe(x)`: las bodegas de cada cosa (lo que no tiene bodega solo cuenta en «Todas»). */
  const chipsBodega = (clave, lista, bodsDe, total) => subChips(clave, [['todas', 'Todas las bodegas', total == null ? lista.length : total]].concat(BODEGAS.map(b => [b, b, lista.filter(x => bodsDe(x).includes(b)).length])), 'Filtrar por bodega');
  const enBodFiltro = (clave, bods) => sub[clave] === 'todas' || bods.includes(sub[clave]);
  const barraBotones = botones => botones.length ? `<div class="row acciones-inv">${botones.join('')}</div>` : '';
  const boton = (accionId, txt, icono, extra, clase) => `<button class="btn ${clase || 'small'}" type="button" data-accion="${accionId}"${extra || ''}>${icono ? `<span data-ico="${icono}"></span>` : ''}${esH(txt)}</button>`;

  /* --- Qué hay que hacer --- */
  function htmlTareas(f) {
    let lista = tareas();
    if (f === 'entregar') lista = lista.filter(t => t.tipo === 'entregar');
    if (f === 'compras') lista = lista.filter(t => ['autorizar', 'comprar', 'recibir'].includes(t.tipo));
    const sinBodega = lista, chips = chipsBodega('bodHacer', sinBodega, bodsTarea);
    lista = lista.filter(t => enBodFiltro('bodHacer', bodsTarea(t)));
    const mias = lista.filter(esMia), otras = lista.filter(t => !esMia(t));
    const filtroTxt = f === 'entregar' ? ' (solo pedidos por entregar)' : f === 'compras' ? ' (solo compras en curso)' : '';
    let h = '';
    // Con dos o más artículos por reponer, una sola compra con todos (en vez de una por artículo).
    const nBajos = (esJefe() ? sinBodega : sinBodega.filter(esMia)).filter(t => t.tipo === 'pedir').length;
    if (nBajos >= 2 && puedoPedirCompra() && !f) h += barraBotones([boton('pedirbajo', `Pedir compra de todo lo bajo (${nBajos})`, 'carrito', '', 'primary')]);
    h += chips;
    if (esJefe()) {
      // La Jefe ve todo agrupado por quién tiene que hacerlo, y puede hacer cualquier paso ella misma.
      const grupos = {};
      lista.forEach(t => { (grupos[t.rol] = grupos[t.rol] || []).push(t); });
      const orden = ['jefe', 'coordina', 'compras', 'asistente', 'gerente'];
      if (Object.keys(grupos).some(r => r !== 'jefe' && r !== 'gerente' && r !== 'coordina')) h += '<p class="meta">Como Jefe puedes hacer cualquier paso aunque le toque a otra persona, menos autorizar compras (eso es de la Coordinadora de compras y del Gerente general).</p>';
      h += Object.keys(grupos).sort((a, b) => orden.indexOf(a) - orden.indexOf(b)).map(rol =>
        `<div class="section-label">${rol === 'jefe' ? 'Te toca a ti' : 'Le toca a ' + esH(nombreRol(rol))} (${grupos[rol].length})${esH(filtroTxt)}</div>
         <div class="list">${grupos[rol].map(tarjeta).join('')}</div>`).join('');
      return h + (lista.length ? '' : UI.vacio('checkCirculo', 'Nada pendiente', sub.bodHacer === 'todas' ? 'La bodega y las compras están al día.' : `En la bodega de ${sub.bodHacer} no hay nada pendiente.`));
    }
    h += `<div class="section-label">Te toca a ti (${mias.length})${esH(filtroTxt)}</div>`;
    h += mias.length ? `<div class="list">${mias.map(tarjeta).join('')}</div>` : UI.vacio('checkCirculo', 'Nada pendiente para ti', 'Cuando algo te toque, aparece aquí con su botón y te llega un aviso.');
    if (otras.length) h += `<div class="section-label">Le toca a otras personas (${otras.length})</div><div class="list">${otras.map(tarjeta).join('')}</div>`;
    return h;
  }

  // Las bodegas de una tarea: la del artículo a reponer, la del pedido, o a las que va la compra.
  const bodsTarea = t => (t.sol ? bodegasSol(t.sol) : t.compra ? bodegasCompra(t.compra) : t.art ? [bodegaDe(t.art)] : []);
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
      if (sobraEnOtras(a).length) extra += `<span class="meta">${esH(textoSobra(a))}</span>`;
      botones = boton('pedir', `Pedir compra (${cantTxt(t.sug, a.unidad)})`, 'carrito', ` data-id="${esH(a.id)}"`, 'primary small') + botonesTraer(a);
    } else if (t.tipo === 'entregar') {
      const unidad = a ? a.unidad : '', d = dondeSol(s), base = d ? (d.propio || d.a) : null;
      icono = 'entrega'; tono = t.alcanza ? 'listo' : 'org';
      titulo = `Entregar a ${s.pide}: ${s.articulo}`;
      detalle.push(cantTxt(s.cantidad, unidad), s.paraQue, s.proyecto, 'pidió ' + App.hace(s.fecha));
      if (!d) extra = pill('El artículo ya no existe en bodega', 's-peligro', 'aviso');
      else if (!t.alcanza) extra = avisoNoAlcanza(d, compraAbierta(base.id) ? ' Ya hay una compra en curso.' : '');
      else extra = pill(`Hay ${cantTxt(d.hayPed, d.a.unidad)}`, 's-disco', 'check');
      if (d) {
        botones = botonesEntregar(s, d) +
          (t.alcanza || compraAbierta(base.id) ? '' : boton('pedir', 'Pedir compra', 'carrito', ` data-id="${esH(base.id)}" data-sol="${esH(s.id)}" data-cant="${esH(Math.max(num(s.cantidad) - d.hayPed, num(base.maximo) - num(base.cantidad), 1))}"`));
      }
      botones += boton('noentregar', 'No entregar', '', ` data-id="${esH(s.id)}"`, 'ghost small');
    } else if (t.tipo === 'autorizar') {
      icono = 'carrito'; tono = 'org';
      titulo = `${c.estado === 'por-gerente' ? 'Autorizar (segundo paso)' : 'Autorizar compra'}: ${a ? a.nombre : c.que}`;
      detalle.push(cantTxt(c.cantidad, c.unidad), 'aprox. ' + cop(c.valorAprox), 'pidió ' + c.pide, c.paraQue);
      if (a && estadoArt(a) !== 'bien') extra = pill(estadoArt(a) === 'agotado' ? 'En bodega: agotado' : `En bodega: quedan ${cantTxt(a.cantidad, a.unidad)}`, EST_ART[estadoArt(a)][1]);
      if (c.pideRol === 'coordcompras') extra += pill('La pidió la Coordinadora de compras: la autoriza el Gerente general', 's-pend', 'info');
      if (c.estado === 'por-gerente') extra += pill(`La Coordinadora ya la autorizó${c.autorizaJefe ? ' (' + c.autorizaJefe + ')' : ''}: falta el Gerente general`, 's-pend', 'info');
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
      botones = boton('recibir', textoRecibir(c), 'caja', ` data-id="${esH(c.id)}"`, 'primary small');
    } else {
      icono = 'aviso'; tono = 'peligro';
      titulo = `Compra sin autorización: ${c.que}`;
      detalle.push(cop(c.valorReal || c.valorAprox), 'compró ' + c.pide, c.proveedor);
      extra = '<span class="meta">Nadie la autorizó antes de comprarla. Habla con quien compró y márcala como revisada.</span>';
      botones = boton('revisada', 'Marcar como revisada', 'check', ` data-id="${esH(c.id)}"`, 'small');
    }
    extra += bodsTarea(t).map(pillBod).join('');
    const detalleBtn = c ? boton('vercompra', 'Ver detalle', '', ` data-id="${esH(c.id)}"`, 'ghost small') : s ? boton('versol', 'Ver detalle', '', ` data-id="${esH(s.id)}"`, 'ghost small') : '';
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
  const vistaToggle = tabla => `<div class="vista-toggle" role="group" aria-label="Cómo ver los artículos"><button type="button" data-accion="vista" data-id="tarjetas" aria-pressed="${!tabla}">Tarjetas</button><button type="button" data-accion="vista" data-id="tabla" aria-pressed="${tabla}">Tabla</button></div>`;
  const tarjetaArt = a => {
    const App = A(), e = estadoArt(a), st = EST_ART[e], abierta = compraAbierta(a.id);
    const pct = Math.max(0, Math.min(100, Math.round(num(a.cantidad) / Math.max(1, num(a.maximo)) * 100)));
    const pctMin = Math.max(0, Math.min(100, Math.round(num(a.minimo) / Math.max(1, num(a.maximo)) * 100)));
    return `<button type="button" class="card art st-${st[2]}" data-accion="verart" data-id="${esH(a.id)}">
        <span class="card-head"><span class="card-title">${esH(a.nombre)}</span>${App.pill(st[0], st[1])}</span>
        <span class="card-sub">${esH([a.codigo ? 'Cód. ' + a.codigo : '', a.categoria, 'Bodega ' + bodegaDe(a), a.ubicacion].filter(Boolean).join(' · '))}</span>
        <span class="nivel"><span class="nivel-n">${esH(num(a.cantidad))} <small>${esH(a.unidad)}</small></span>
          <span class="barra n-${e}" role="img" aria-label="${esH(`${num(a.cantidad)} de ${num(a.maximo)}; mínimo ${num(a.minimo)}`)}"><i style="width:${pct}%"></i><b style="left:${pctMin}%"></b></span>
          <span class="meta">mínimo ${esH(num(a.minimo))} · máximo ${esH(num(a.maximo))}</span></span>
        <span class="docs">${App.pill('Aprox. ' + App.cop(a.costo) + ' c/u', 's-pend')}${abierta ? App.pill('Compra en curso: ' + EST_CO[abierta.estado][0].toLowerCase(), 's-listo', 'carrito') : ''}</span>
      </button>`;
  };
  // Tabla de existencias (solo en pantallas anchas): cada encabezado ordena, el encabezado queda fijo al bajar y el total suma lo que se ve.
  const COLS_T = [['codigo', 'Código'], ['nombre', 'Artículo'], ['categoria', 'Categoría'], ['bodega', 'Bodega'], ['ubicacion', 'Ubicación'], ['cantidad', 'Hay', 1], ['minimo', 'Mín.', 1], ['maximo', 'Máx.', 1],
    ['valor', 'Valor en bodega', 1], ['abc', 'ABC'], ['estado', 'Estado']];
  function htmlTabla(vis, abc) {
    const App = A(), cols = COLS_T.filter(([k]) => k !== 'abc' || verAbc());
    const valorDe = a => num(a.cantidad) * num(a.costo);
    const val = { codigo: a => a.codigo || '', nombre: a => a.nombre, categoria: a => a.categoria, bodega: a => bodegaDe(a), ubicacion: a => a.ubicacion || '', cantidad: a => num(a.cantidad), minimo: a => num(a.minimo), maximo: a => num(a.maximo),
      valor: valorDe, abc: a => ({ A: 1, B: 2, C: 3 })[(abc.get(a.id) || {}).clase] || 4, estado: a => ({ agotado: 0, bajo: 1, bien: 2 })[estadoArt(a)] };
    const filas = vis.slice();
    if (ordenT.col && val[ordenT.col]) { const g = val[ordenT.col]; filas.sort((x, y) => { const p = g(x), r = g(y); return (typeof p === 'number' ? p - r : String(p).localeCompare(String(r), 'es', { numeric: true })) * ordenT.dir || String(x.nombre).localeCompare(String(y.nombre)); }); }
    const th = ([k, t, n]) => { const act = ordenT.col === k; return `<th scope="col"${n ? ' class="num"' : ''} aria-sort="${act ? (ordenT.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="th-orden" data-accion="ordenar" data-id="${k}">${esH(t)}<span aria-hidden="true">${act ? (ordenT.dir > 0 ? ' ▲' : ' ▼') : ''}</span></button></th>`; };
    const fila = a => {
      const e = estadoArt(a), st = EST_ART[e], c = abc.get(a.id) || {};
      return `<tr data-accion="verart" data-id="${esH(a.id)}" class="fila-${e}"><td class="mono">${esH(a.codigo || '')}</td><td><button type="button" class="fila-nombre" data-accion="verart" data-id="${esH(a.id)}">${esH(a.nombre)}</button></td>
        <td>${esH(a.categoria)}</td><td>${esH(bodegaDe(a))}</td><td>${esH(a.ubicacion || '')}</td><td class="num"><b>${esH(num(a.cantidad))}</b> <small>${esH(a.unidad)}</small></td><td class="num">${esH(num(a.minimo))}</td><td class="num">${esH(num(a.maximo))}</td>
        <td class="num">${esH(App.cop(valorDe(a)))}</td>${verAbc() ? `<td>${c.clase ? `<span class="abc abc-${c.clase}" title="${esH(`Clase ${c.clase}: salieron ${App.cop(c.valor)} en 90 días`)}">${c.clase}</span>` : '—'}</td>` : ''}<td>${App.pill(st[0], st[1])}</td></tr>`;
    };
    const total = filas.reduce((x, a) => x + valorDe(a), 0);
    return `<div class="tabla-inv-wrap"><table class="tabla-inv"><thead><tr>${cols.map(th).join('')}</tr></thead><tbody>${filas.map(fila).join('')}</tbody>
      <tfoot><tr><th scope="row" colspan="8">Total de ${filas.length} ${filas.length === 1 ? 'artículo' : 'artículos'}</th><td class="num"><b>${esH(App.cop(total))}</b></td><td colspan="${cols.length - 9}"></td></tr></tfoot></table></div>`;
  }
  function htmlExistencias(f) {
    const q = $('qInventario').value.trim().toLowerCase();
    const orden = { agotado: 0, bajo: 1, bien: 2 };
    const todos = articulos().slice().sort((a, b) => (orden[estadoArt(a)] - orden[estadoArt(b)]) || String(a.nombre).localeCompare(String(b.nombre)));
    const vis = todos.filter(a => (!['agotado', 'bajo'].includes(f) || f === estadoArt(a)) && (sub.bodega === 'todas' || bodegaDe(a) === sub.bodega) && (!q || texto(a.nombre, a.categoria, bodegaDe(a), a.ubicacion, a.proveedor, a.codigo).includes(q)));
    const tabla = vistaTabla();
    let h = `<div class="row acciones-inv barra-vista">${boton('escanear', 'Escanear código', 'codigo', ' data-id=""')}${ancho() ? vistaToggle(tabla) : ''}</div>`;
    h += barraBotones(esBodega() ? [boton('nuevoart', 'Agregar artículo', 'mas'), boton('entrada', 'Registrar entrada', 'importar'), boton('salida', 'Registrar salida', 'entrega'),
      boton('bdexcel', 'Descargar base de datos', 'excel'), `<label class="btn small foto-btn"><span data-ico="importar"></span>Subir Excel<input id="invArchivo" class="archivo-oculto" type="file" accept=".xlsx,.xls,.csv"></label>`] : []);
    if (esBodega() && errorEx) h += `<div class="err" role="alert">${esH(errorEx)}</div>`;
    if (esBodega() && previaEx) h += htmlPreviaEx();
    h += subChips('bodega', [['todas', 'Todas las bodegas', todos.length]].concat(BODEGAS.map(b => [b, b, todos.filter(a => bodegaDe(a) === b).length])));
    h += `<div class="count" aria-live="polite">${vis.length === todos.length ? todos.length + ' artículos' : vis.length + ' de ' + todos.length + ' artículos'}</div>`;
    if (!vis.length) return h + UI.vacio('vacio', 'No hay artículos con ese filtro', f ? 'Toca otra vez la cifra de arriba para ver todo.' : '');
    return h + (tabla ? htmlTabla(vis, verAbc() ? abcDe() : new Map()) : `<div class="list">${vis.map(tarjetaArt).join('')}</div>`);
  }

  /* --- Movimientos --- */
  /** «Traslado de Riohacha a Guamal» (sin flechas): la salida va de su bodega a la otra y la entrada, de la otra a la suya. Vacío si no es un traslado con bodegas conocidas. */
  const textoTraslado = m => {
    const mia = bodegaMov(m), otra = BODEGAS.includes(m.bodegaOtra) ? m.bodegaOtra : '';
    if (m.motivo !== 'traslado' || !mia || !otra) return '';
    return m.tipo === 'salida' ? `Traslado de ${mia} a ${otra}` : `Traslado de ${otra} a ${mia}`;
  };
  function htmlMovimientos() {
    const App = A();
    const q = $('qInventario').value.trim().toLowerCase();
    const todos = D().movimientos.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const bodsM = m => [bodegaMov(m)].filter(Boolean);
    const bodOk = m => enBodFiltro('bodMov', bodsM(m)), tipoOk = m => sub.movimientos === 'todos' || m.tipo === sub.movimientos;
    const cuenta = t => todos.filter(m => bodOk(m) && m.tipo === t).length;
    const vis = todos.filter(m => bodOk(m) && tipoOk(m) && (!q || texto(m.articulo, m.persona, m.proyecto, m.por, m.nota, bodegaMov(m), m.bodegaOtra, m.bodegaPedida, m.motivoBodega).includes(q)));
    let h = barraBotones(esBodega() ? [boton('entrada', 'Registrar entrada', 'importar'), boton('salida', 'Registrar salida', 'entrega')] : []);
    h += subChips('movimientos', [['todos', 'Todos', todos.filter(bodOk).length], ['entrada', 'Entradas', cuenta('entrada')], ['salida', 'Salidas', cuenta('salida')], ['ajuste', 'Ajustes', cuenta('ajuste')]]);
    h += chipsBodega('bodMov', todos.filter(tipoOk), bodsM);
    if (!vis.length) return h + UI.vacio('historial', 'No hay movimientos', sub.bodMov === 'todas' ? 'Aquí queda cada entrada y salida de la bodega.' : `No hay movimientos de la bodega de ${sub.bodMov} con ese filtro.`);
    const pg = UI.pagina(`mov|${sub.movimientos}|${sub.bodMov}|${q}`, vis.map(m => {
      const a = artPorId(m.articuloId), u = a ? a.unidad : '', mia = bodegaMov(m);
      const signo = m.tipo === 'entrada' ? '+' : m.tipo === 'salida' ? '-' : (num(m.cantidad) > 0 ? '+' : '');
      const tono = m.tipo === 'entrada' ? 'disco' : m.tipo === 'salida' ? 'listo' : 'org';
      const pedidaMov = bodegaPedidaMov(m), paraOtra = pedidaMov && pedidaMov !== mia ? `${m.motivo === 'compra' ? 'comprado' : 'pedido'} para ${pedidaMov}` : '';
      return `<div class="card mov st-${tono}">
        <div class="card-head"><div class="card-title">${esH(m.articulo)}</div><span class="mov-n t-${tono}">${esH(signo + Math.abs(num(m.cantidad)))}</span></div>
        <span class="meta">${esH([textoTraslado(m) || MOTIVO_MOV[m.motivo] || m.motivo, m.persona ? (m.tipo === 'salida' ? 'a ' : 'de ') + m.persona : '', paraOtra, m.proyecto, 'quedan ' + cantTxt(m.saldo, u)].filter(Boolean).join(' · '))}</span>
        ${m.motivoBodega ? `<span class="meta">${esH((m.tipo === 'entrada' ? 'Por qué llegó a otra bodega: ' : 'Por qué salió de otra bodega: ') + m.motivoBodega)}</span>` : ''}
        <span class="meta">${esH(`Registró ${m.por} ${App.hace(m.fecha)}`)}${m.nota ? ' · ' + esH(m.nota) : ''}</span>
        ${mia ? `<span class="docs">${pillBod(mia)}</span>` : ''}
      </div>`;
    }), { n: 50 });
    return h + `<div class="list">${pg.html}</div>${pg.mas}`;
  }

  /* --- Pedidos de material --- */
  function tarjetaSolicitud(s) {
    const App = A(), a = artPorId(s.articuloId), d = dondeSol(s), e = EST_SOL[s.estado] || ['Sin estado', 'none', 'pend'];
    const acciones = s.estado === 'pendiente' && esBodega() && d ? botonesEntregar(s, d) + boton('noentregar', 'No entregar', '', ` data-id="${esH(s.id)}"`, 'ghost small') : '';
    const pie = acciones + boton('versol', 'Ver detalle', '', ` data-id="${esH(s.id)}"`, 'ghost small');
    const pedida = bodegaSol(s), surte = bodegaSurteDe(s);
    return `<div class="card tarea st-${e[2]}">
      <div class="card-head"><div class="card-title">${esH(s.articulo)}</div>${App.pill(e[0], e[1])}</div>
      <span class="meta">${esH([cantTxt(s.cantidad, a ? a.unidad : ''), 'pidió ' + s.pide, s.paraQue, s.proyecto, App.hace(s.fecha)].filter(Boolean).join(' · '))}</span>
      ${pedida ? `<span class="docs">${pillBod(pedida)}</span>` : ''}
      ${s.estado === 'pendiente' && d && d.hayPed < num(s.cantidad) ? avisoNoAlcanza(d) : ''}
      ${s.estado === 'pendiente' && !esBodega() ? App.pill('Le toca a ' + nombreRol('asistente') + ' entregarlo', 'none', 'persona') : ''}
      ${s.estado === 'entregada' ? `<span class="meta">Entregó ${esH(s.entregadaPor)} ${esH(App.hace(s.fechaEntrega))}${s.motivo ? '. ' + esH(s.motivo) : ''}</span>` : ''}
      ${s.estado === 'entregada' && surte && surte !== pedida ? `<span class="meta">${esH(`Salió de ${surte}${s.motivoBodega ? ': ' + s.motivoBodega : ''}`)}</span>` : ''}
      ${s.estado === 'rechazada' && s.motivo ? `<span class="meta">Motivo: ${esH(s.motivo)}</span>` : ''}
      <div class="tarea-pie">${pie}</div>
    </div>`;
  }
  /** El detalle de un pedido: sus datos y su recorrido, armado con lo que el pedido mismo guarda (quien solo pide no ve los movimientos) y con las compras que nacieron de él, si puede verlas. */
  function verSolicitud(s) {
    const App = A(), e = EST_SOL[s.estado] || ['Sin estado', 'none', 'pend'], a = artPorId(s.articuloId), pedida = bodegaSol(s), surte = bodegaSurteDe(s);
    const otra = !!surte && surte !== pedida, compras = D().compras.filter(c => c.solicitudId === s.id);
    const pasos = [{ fecha: s.fecha, titulo: `Pidió ${cantTxt(s.cantidad, a ? a.unidad : '')} de ${s.articulo}`, quien: s.pide, detalle: [pedida ? `para la bodega de ${pedida}` : '', s.paraQue, s.proyecto].filter(Boolean).join(' · ') }];
    if (s.estado === 'entregada') {
      if (otra) pasos.push({ fecha: s.fechaEntrega, titulo: `Salió de la bodega de ${surte}`, quien: s.entregadaPor, detalle: s.motivoBodega });
      pasos.push({ fecha: s.fechaEntrega, titulo: 'Se entregó', quien: s.entregadaPor, detalle: s.motivo });
    } else if (s.estado === 'rechazada') pasos.push({ fecha: s.fechaEntrega, titulo: 'No se entregó', quien: s.entregadaPor, detalle: s.motivo });
    compras.forEach(c => historial(c).forEach(h => pasos.push({ fecha: h.fecha, titulo: h.texto, quien: h.por, detalle: `compra de ${c.que}` })));
    const tl = App.lineaTiempo('sol-' + s.id, pasos, { orden: 'viejo', reiniciar: true });
    abrirAccion({
      titulo: s.articulo, sub: `${cantTxt(s.cantidad, a ? a.unidad : '')}${pedida ? ' para la bodega de ' + pedida : ''} · pidió ${s.pide}`,
      campos: `<div class="row">${App.pill(e[0], e[1])}${pillBod(pedida)}${otra ? App.pill('Salió de ' + surte, 's-pend', 'caja') : ''}</div>
        <dl class="datos">
          <dt>Pidió</dt><dd>${esH(s.pide)} ${esH(App.hace(s.fecha))}</dd>
          ${s.paraQue ? `<dt>Para qué</dt><dd>${esH(s.paraQue)}${s.proyecto ? ' (' + esH(s.proyecto) + ')' : ''}</dd>` : ''}
          ${pedida ? `<dt>Bodega pedida</dt><dd>${esH(pedida)}</dd>` : ''}
          ${s.estado === 'entregada' ? `<dt>Entregó</dt><dd>${esH(s.entregadaPor)} ${esH(App.hace(s.fechaEntrega))}</dd>` : ''}
          ${otra ? `<dt>Salió de</dt><dd>${esH(surte)}${s.motivoBodega ? ': ' + esH(s.motivoBodega) : ''}</dd>` : ''}
          ${s.motivo ? `<dt>${s.estado === 'rechazada' ? 'Motivo' : 'Nota'}</dt><dd>${esH(s.motivo)}</dd>` : ''}
        </dl>
        ${compras.length ? `<div class="tarea-pie">${compras.map(c => boton('vercompra', `Ver la compra: ${c.que}`, '', ` data-id="${esH(c.id)}"`, 'ghost small')).join('')}</div>` : ''}
        <div class="section-label">Cómo va</div>${tl.ol}`
    });
  }
  function htmlSolicitudes() {
    const p = persona(), todas = D().solicitudes.filter(s => veTodo() || s.pide === p.nombre).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const bodOk = s => enBodFiltro('bodSol', bodegasSol(s)), estOk = s => sub.solicitudes === 'todos' || s.estado === sub.solicitudes;
    const cuenta = e => todas.filter(s => bodOk(s) && s.estado === e).length;
    const vis = todas.filter(s => estOk(s) && bodOk(s));
    let h = subChips('solicitudes', [['pendiente', 'En espera', cuenta('pendiente')], ['entregada', 'Entregados', cuenta('entregada')], ['rechazada', 'No entregados', cuenta('rechazada')], ['todos', 'Todos', todas.filter(bodOk).length]]);
    h += chipsBodega('bodSol', todas.filter(estOk), bodegasSol);
    if (!veTodo()) h = '<p class="meta">Aquí ves solo tus pedidos.</p>' + h;
    return h + (vis.length ? `<div class="list">${vis.map(tarjetaSolicitud).join('')}</div>` : UI.vacio('caja', 'No hay pedidos aquí', 'Cambia el filtro de arriba o pide material.'));
  }

  /* --- Compras --- */
  /** «llegó a Bogotá»: una compra recibida cuyo artículo entró a una bodega distinta de la pedida (se sabe por sus movimientos). */
  const llegoAOtra = c => {
    if (c.estado !== 'recibido' || !veMovs()) return '';
    const bs = Array.from(new Set(D().movimientos.filter(m => m.compraId === c.id && m.lineaArticuloId).map(bodegaMov).filter(Boolean)));
    return bs.length ? 'llegó a ' + bs.join(' y ') : '';
  };
  function tarjetaCompra(c) {
    const App = A(), e = EST_CO[c.estado] || ['Sin estado', 'none', 'pend'];
    const valor = c.valorReal ? App.cop(c.valorReal) : 'aprox. ' + App.cop(c.valorAprox), bods = bodegasCompra(c);
    return `<button type="button" class="card tarea st-${e[2]}" data-accion="vercompra" data-id="${esH(c.id)}">
      <span class="card-head"><span class="card-title">${esH(c.que)}</span>${App.pill(e[0], e[1], c.estado === 'sin-autorizar' ? 'aviso' : '')}</span>
      <span class="meta">${esH([lineasDe(c).length > 1 ? `${lineasDe(c).length} artículos` : cantTxt(c.cantidad, c.unidad), c.categoria, valor].join(' · '))}</span>
      <span class="meta">${esH([`Pidió ${c.pide} el ${App.fechaCorta(c.fechaPedido || c.fechaCompra)}`, c.proveedor, bods.length ? 'va a ' + bods.join(' y ') : c.articuloId ? 'va a bodega' : '', llegoAOtra(c)].filter(Boolean).join(' · '))}</span>
      <span class="docs">${bods.map(pillBod).join('')}${c.factura ? App.pill('Con foto de factura', 's-pend', 'camara') : ''}${c.estado === 'sin-autorizar' && c.revisada ? App.pill('Revisada', 's-pend', 'check') : ''}${esPorAutorizar(c) ? App.pill('Le toca a ' + nombreRol(autorizadorDe(c)), 'none', 'persona') : ''}${sobrecosto(c) ? App.pill(`Pagó ${sobrecosto(c).pct} % más de lo autorizado`, 's-peligro', 'aviso') : ''}${c.pideRol === 'gerente' ? App.pill('La pidió el Gerente', 's-pend', 'info') : ''}</span>
    </button>`;
  }
  function htmlCompras() {
    const q = $('qInventario').value.trim().toLowerCase();
    const todas = D().compras.filter(c => veTodo() || c.pide === persona().nombre).sort((a, b) => String(b.fechaPedido || b.fechaCompra).localeCompare(String(a.fechaPedido || a.fechaCompra)));
    const grupo = c => (ABIERTA.includes(c.estado) ? 'curso' : c.estado === 'recibido' ? 'recibidas' : c.estado === 'rechazado' ? 'rechazadas' : 'sin');
    const bodOk = c => enBodFiltro('bodCom', bodegasCompra(c)), grupoOk = c => sub.compras === 'todas' || grupo(c) === sub.compras;
    const cuenta = g => todas.filter(c => bodOk(c) && grupo(c) === g).length;
    const vis = todas.filter(c => grupoOk(c) && bodOk(c) && (!q || texto(c.que, c.proveedor, c.pide, c.categoria, c.paraQue, ...bodegasCompra(c)).includes(q)));
    let h = barraBotones(puedoHacer('compras') ? [boton('sinaut', 'Registrar compra hecha sin autorización', 'aviso')] : []);
    h += window.ExcelBD.html(cfgCompras());
    h += subChips('compras', [['curso', 'En curso', cuenta('curso')], ['recibidas', 'Recibidas', cuenta('recibidas')], ['rechazadas', 'Rechazadas', cuenta('rechazadas')], ['sin', 'Sin autorizar', cuenta('sin')], ['todas', 'Todas', todas.filter(bodOk).length]]);
    h += chipsBodega('bodCom', todas.filter(grupoOk), bodegasCompra);
    return h + (vis.length ? `<div class="list">${vis.map(tarjetaCompra).join('')}</div>` : UI.vacio('carrito', 'No hay compras aquí', `Cambia el filtro o toca «${hagoCompras() ? 'Hacer' : 'Pedir'} una compra».`));
  }

  /* --- Proveedores --- */
  function tarjetaProv(p, st) {
    const App = A();
    return `<button type="button" class="card tarea st-${st.n ? 'disco' : 'pend'}" data-accion="verprov" data-id="${esH(p.id)}">
      <span class="card-head"><span class="card-title">${esH(p.nombre)}</span>${p.nit ? `<span class="serial-chip">${esH(p.nit)}</span>` : ''}</span>
      <span class="meta">${esH(st.n ? `${st.n} ${st.n === 1 ? 'compra' : 'compras'} · ${st.anio ? App.cop(st.anio) + ' este año' : 'nada este año'} · la última el ${App.fechaCorta(st.ultima)}` : 'Todavía sin compras')}</span>
      <span class="meta">${esH([p.contacto, p.telefono].filter(Boolean).join(' · ') || 'Sin contacto anotado')}</span>
    </button>`;
  }
  function htmlProveedores() {
    const q = $('qInventario').value.trim().toLowerCase();
    const todos = provs().map(p => ({ p, st: statsProv(p) })).sort((x, y) => y.st.anio - x.st.anio || String(x.p.nombre).localeCompare(String(y.p.nombre), 'es'));
    const vis = todos.filter(x => !q || texto(x.p.nombre, x.p.nit, x.p.contacto, x.p.telefono, x.p.correo, x.p.nota).includes(q));
    let h = gestionaProv() ? barraBotones([boton('nuevoprov', 'Agregar proveedor', 'mas', '', 'primary small')]) : '<p class="meta">Aquí ves a quién se le compra y cuánto. Los agrega y cambia quien hace las compras.</p>';
    h += `<div class="count" aria-live="polite">${vis.length === todos.length ? todos.length + (todos.length === 1 ? ' proveedor' : ' proveedores') : vis.length + ' de ' + todos.length + ' proveedores'}</div>`;
    if (!vis.length) return h + (todos.length ? UI.vacio('vacio', 'Ningún proveedor con ese nombre', 'Quita lo que escribiste en el buscador para ver todos.') + `<div class="acc-rap">${boton('quitarq', 'Quitar la búsqueda', 'x', '', 'ghost small')}</div>`
      : UI.vacio('carrito', 'Todavía no hay proveedores', gestionaProv() ? 'Toca «Agregar proveedor». También se agregan solos cuando registras una compra con un proveedor nuevo.' : 'Los agrega quien hace las compras.'));
    return h + `<div class="list">${vis.map(x => tarjetaProv(x.p, x.st)).join('')}</div>`;
  }

  /* --- Conteo --- */
  /** «Te toca contar hoy»: lo que ya toca contar según su clase ABC (A cada 30 días, B cada 90 y C cada 180), de a 10, con un botón por bodega. */
  function cuadroHoy() {
    const lista = porContarHoy();
    if (!lista.length) return '<div class="card cuadro-hoy"><b>Hoy no toca contar nada</b><span class="meta">Todo se contó dentro de su plazo: clase A cada 30 días, B cada 90 y C cada 180.</span></div>';
    const hoy = lista.slice(0, HOY_MAX), bods = BODEGAS.map(b => [b, hoy.filter(x => bodegaDe(x.a) === b)]).filter(([, l]) => l.length);
    return `<div class="card cuadro-hoy"><b>Te toca contar hoy (${hoy.length})</b><span class="meta">Primero lo que más valor mueve: clase A cada 30 días, B cada 90 y C cada 180.${lista.length > hoy.length ? ` Hay ${lista.length - hoy.length} más para los próximos días.` : ''}</span>
      <ul class="hoy-lista">${hoy.map(x => `<li><span class="abc abc-${x.clase}" title="Clase ${x.clase}">${x.clase}</span><span class="hoy-n">${esH(x.a.nombre)}<span class="meta">${esH([bodegaDe(x.a), x.a.ubicacion].filter(Boolean).join(' · '))} · ${x.u ? (x.hace <= 0 ? 'contado hoy' : `contado hace ${x.hace} días`) : 'nunca contado'}</span></span></li>`).join('')}</ul>
      <div class="acc-rap">${bods.map(([b, l]) => boton('contarhoy', `Contar en ${b} (${l.length})`, 'tarea', ` data-bod="${esH(b)}"`, 'primary small')).join('')}</div></div>`;
  }
  function htmlConteo() {
    const App = A();
    const todosAj = D().movimientos.filter(m => m.motivo === 'conteo').sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const bodsAj = m => [bodegaMov(m)].filter(Boolean), ajustes = todosAj.filter(m => enBodFiltro('bodCon', bodsAj(m)));
    let h = `<div class="note">El conteo físico compara lo que hay en los estantes con lo que dice la app. Las diferencias se ajustan con un motivo y quedan en Movimientos.</div>`;
    h += esBodega() ? barraBotones([boton('conteo', 'Empezar conteo', 'tarea', '', 'primary')]) + cuadroHoy() : '<p class="meta">El conteo lo hace la encargada de bodega.</p>';
    if (!todosAj.length) return h + UI.vacio('tarea', 'Todavía no hay ajustes por conteo', '');
    const u = todosAj[0];
    h += `<div class="card"><b>Último ajuste por conteo</b><span class="meta">${esH(`${u.por}, ${App.hace(u.fecha)}`)}</span><span class="meta">${esH(textoUltimosAjustes())}</span></div>`;
    h += `<div class="section-label">Ajustes por conteo (${ajustes.length})</div>` + chipsBodega('bodCon', todosAj, bodsAj);
    if (!ajustes.length) return h + UI.vacio('tarea', 'No hay ajustes por conteo', `No hay ajustes de la bodega de ${esH(sub.bodCon)} con ese filtro.`);
    h += `<div class="list">${ajustes.slice(0, 30).map(m => `<div class="card mov st-org">
      <div class="card-head"><div class="card-title">${esH(m.articulo)}</div><span class="mov-n t-org">${esH((num(m.cantidad) > 0 ? '+' : '') + num(m.cantidad))}</span></div>
      <span class="meta">${esH([`quedan ${num(m.saldo)}`, m.nota, `${m.por} ${App.hace(m.fecha)}`].filter(Boolean).join(' · '))}</span>${bodegaMov(m) ? `<span class="docs">${pillBod(bodegaMov(m))}</span>` : ''}</div>`).join('')}</div>`;
    return h;
  }

  /* --- Resumen --- */
  function barras(filas, fmt) {
    const max = Math.max(1, ...filas.map(f => f[1]));
    if (!filas.length) return '<p class="meta">Sin datos este mes.</p>';
    return `<div class="barras">${filas.map(([n, v]) => `<div class="bf"><span class="bf-n">${esH(n)}</span><span class="bf-b"><i style="width:${Math.max(3, Math.round(v / max * 100))}%"></i></span><span class="bf-v">${esH(fmt(v))}</span></div>`).join('')}</div>`;
  }
  const agrupar = (lista, clave, valor) => Object.entries(lista.reduce((o, x) => { const k = clave(x) || 'Sin dato'; o[k] = (o[k] || 0) + valor(x); return o; }, {})).sort((a, b) => b[1] - a[1]);
  /** «hoy», «ayer» o «hace 20 días» para una fecha sin hora (2026-11-06). */
  const haceFecha = f => { const n = -A().diasHasta(f); return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`; };
  /** Una tarjeta por bodega (Resumen y Panorama): lo que vale, cuántos artículos, agotados y bajos, pedidos por entregar, compras en curso y el último conteo. */
  function tarjetasBodega() {
    const cop = A().cop, d = D();
    return `<div class="section-label">Cómo está cada bodega</div><div class="resumen-grid">${BODEGAS.map(b => {
      const arts = articulos().filter(a => bodegaDe(a) === b), valor = arts.reduce((x, a) => x + num(a.cantidad) * num(a.costo), 0);
      const ago = arts.filter(a => estadoArt(a) === 'agotado').length, baj = arts.filter(a => estadoArt(a) === 'bajo').length;
      const ped = d.solicitudes.filter(s => s.estado === 'pendiente' && bodegaSol(s) === b).length, com = d.compras.filter(c => ABIERTA.includes(c.estado) && bodegasCompra(c).includes(b)).length;
      const ult = arts.map(ultimoConteoDe).filter(Boolean).sort().pop() || '';
      return `<div class="card card-bodega" data-bodega="${esH(b)}"><b>${esH(b)}</b><span class="rm-n valor">${esH(cop(valor))}</span><span class="meta">${esH(pl(arts.length, 'artículo', 'artículos'))}</span>
        <span class="meta">${esH(`${pl(ago, 'agotado', 'agotados')} · ${pl(baj, 'bajo del mínimo', 'bajos del mínimo')}`)}</span>
        <span class="meta">${esH(`${pl(ped, 'pedido por entregar', 'pedidos por entregar')} · ${pl(com, 'compra en curso', 'compras en curso')}`)}</span>
        <span class="meta">${esH('Último conteo: ' + (ult ? haceFecha(ult) : 'nunca'))}</span></div>`;
    }).join('')}</div>`;
  }
  /** Lo que vale de una compra en una bodega: si va a una sola, todo; con varias líneas, solo las de esa bodega, repartidas como en el cuadro de la compra (lo pagado según lo que valía cada una). */
  function valorCompraEn(c, bod) {
    const total = num(c.valorReal || c.valorAprox);
    if (bod === 'todas') return total;
    const ls = lineasDe(c), movs = movsDeCompra(c), mias = ls.filter((l, i) => bodegaRealLinea(l, movs, i) === bod);
    if (!mias.length) return 0;
    if (ls.length === 1) return total;
    const suma = ls.reduce((x, l) => x + num(l.valor), 0), pagado = num(c.valorReal), factor = pagado > 0 && suma > 0 ? pagado / suma : 1;
    return mias.reduce((x, l) => x + Math.round(num(l.valor) * factor), 0);
  }
  function htmlResumen() {
    const App = A(), cop = App.cop, d = D(), bod = sub.bodRes;
    const artsB = articulos().filter(a => bod === 'todas' || bodegaDe(a) === bod);
    const valorBodega = artsB.reduce((s, a) => s + num(a.cantidad) * num(a.costo), 0);
    const comprasMes = d.compras.filter(c => ['comprado', 'recibido', 'sin-autorizar'].includes(c.estado) && delMes(c.fechaCompra) && (bod === 'todas' || bodegasRealesCompra(c).includes(bod)));
    const valC = c => valorCompraEn(c, bod);
    const totalMes = comprasMes.reduce((s, c) => s + valC(c), 0);
    const sinAutMes = comprasMes.filter(c => c.estado === 'sin-autorizar').reduce((s, c) => s + valC(c), 0);
    const salidas = d.movimientos.filter(m => m.tipo === 'salida' && delMes(m.fecha) && (bod === 'todas' || bodegaMov(m) === bod));
    const costoDe = m => (m.valor == null ? num(m.cantidad) * num((artPorId(m.articuloId) || {}).costo) : num(m.valor));
    const catDe = m => (artPorId(m.articuloId) || {}).categoria;
    let h = '';
    if (esGerenteGeneral()) {
      // Lo que le toca al Gerente general: las compras de más del monto (ya pasadas por la Coordinadora) y las que pide la Coordinadora.
      const mias = tareas().filter(esMia);
      h += `<div class="section-label">Te toca a ti (${mias.length})</div>`;
      h += mias.length ? `<div class="list">${mias.map(tarjeta).join('')}</div>` : '<p class="meta">Nada por autorizar. Las compras de más de ' + esH(cop(App.montoGerente())) + ' y las que pida la Coordinadora te llegan aquí y al teléfono.</p>';
      h += `<div class="card"><b>Compras que decides tú</b><span class="meta">Las de más de ${esH(cop(App.montoGerente()))} (la Coordinadora las autoriza antes y te las pasa) y las que pide la Coordinadora. Lo que pides tú nace autorizado. También puedes decidir cualquier pedido sin esperar.</span>
        ${persona().real ? `<div class="row">${boton('monto', 'Cambiar el monto', 'lapiz', '', 'small')}</div>` : '<span class="meta">El monto lo cambia el Gerente general con su cuenta propia (la persona de prueba no puede).</span>'}</div>`;
    } else if (esGerente()) {
      h += `<div class="card"><b>Solo ves</b><span class="meta">Las compras las autoriza la Coordinadora de compras y, las de más de ${esH(cop(App.montoGerente()))}, el Gerente general. Tú ves los resúmenes y el detalle de cada cosa.</span></div>`;
    }
    h += barraBotones(perm() !== 'pide' ? [boton('excel', 'Descargar Excel', 'excel', '', 'primary')] : []);
    // Cómo van las compras: cada paso con quién lo tiene.
    const etapa = (estado, lbl, quien) => { const n = d.compras.filter(c => c.estado === estado).length; return `<div class="etapa${n ? ' con' : ''}"><span class="rm-n">${n}</span><b>${esH(lbl)}</b><span class="meta">${esH(quien)}</span></div>`; };
    h += `<div class="section-label">Cómo van las compras</div><div class="card etapas">
      ${etapa('pedido', 'Por autorizar', 'Coordinadora de compras')}${etapa('por-gerente', 'Falta el Gerente general', 'Gerente general')}${etapa('autorizado', 'Falta comprar', nombreRol('compras'))}${etapa('comprado', 'Falta recibir', nombreRol('asistente'))}
    </div>`;
    h += tarjetasBodega();
    h += `<div class="section-label">Valor y movimiento${bod === 'todas' ? '' : ' de ' + esH(bod)}</div>` + chipsBodega('bodRes', articulos(), a => [bodegaDe(a)]);
    h += `<div class="resumen-grid">
      <div class="card"><span class="meta">Valor de lo que hay en bodega${bod === 'todas' ? '' : ' (' + esH(bod) + ')'}</span><span class="rm-n valor">${esH(cop(valorBodega))}</span><span class="meta">${artsB.length} artículos</span>${bod === 'todas' ? `<span class="meta">${esH(BODEGAS.map(b => `${b}: ${cop(articulos().filter(a => bodegaDe(a) === b).reduce((x, a) => x + num(a.cantidad) * num(a.costo), 0))}`).join(' · '))}</span>` : ''}</div>
      <div class="card"><span class="meta">Comprado este mes (${comprasMes.length})</span><span class="rm-n valor">${esH(cop(totalMes))}</span>${sinAutMes ? App.pill('Sin autorizar: ' + cop(sinAutMes), 's-peligro', 'aviso') : App.pill('Todo autorizado', 's-disco', 'check')}</div>
      <div class="card"><span class="meta">Salió de bodega este mes</span><span class="rm-n valor">${esH(cop(salidas.reduce((s, m) => s + costoDe(m), 0)))}</span><span class="meta">${salidas.length} salidas</span></div>
    </div>`;
    h += `<div class="section-label">Compras del mes por categoría</div><div class="card">${barras(agrupar(comprasMes, c => c.categoria, valC), cop)}</div>`;
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
    const pedJefe = d.compras.filter(c => c.estado === 'pedido' && autorizadorDe(c) === 'coordina'), esperaG = d.compras.filter(c => (c.estado === 'por-gerente') || (c.estado === 'pedido' && autorizadorDe(c) === 'gerente'));
    const falta = d.compras.filter(c => c.estado === 'autorizado'), llegar = d.compras.filter(c => c.estado === 'comprado');
    const sinAut = d.compras.filter(c => c.estado === 'sin-autorizar' && !c.revisada), demas = d.compras.filter(c => sobrecosto(c));
    const viejos = d.solicitudes.filter(s => s.estado === 'pendiente' && Date.now() - Date.parse(s.fecha) > 2 * 86400000);
    const nom = l => l.slice(0, 3).map(x => x.nombre || x.que || x.articulo).join(', ') + (l.length > 3 ? '…' : '');
    const u = [];
    if (ago.length) u.push(item('peligro', 'aviso', `${ago.length} ${ago.length === 1 ? 'artículo agotado' : 'artículos agotados'}`, nom(ago), ir('existencias', '', '', 'agotado')));
    if (pedJefe.length) u.push(item('org', 'carrito', `${pedJefe.length} ${pedJefe.length === 1 ? 'compra espera a la Coordinadora de compras' : 'compras esperan a la Coordinadora de compras'}`, `${cop(suma(pedJefe))} en total`, ir('compras', 'compras', 'curso')));
    if (sinAut.length) u.push(item('peligro', 'aviso', `${sinAut.length} ${sinAut.length === 1 ? 'compra hecha sin autorización' : 'compras hechas sin autorización'}`, `${cop(sinAut.reduce((x, c) => x + num(c.valorReal || c.valorAprox), 0))}: habla con quien compró y márcala revisada`, ir('compras', 'compras', 'sin')));
    if (demas.length) u.push(item('peligro', 'aviso', `${demas.length} ${demas.length === 1 ? 'compra pagada con más de lo autorizado' : 'compras pagadas con más de lo autorizado'}`, demas.slice(0, 3).map(c => `${c.que} (+${sobrecosto(c).pct} %)`).join(', '), ir('compras', 'compras', 'todas')));
    if (esperaG.length) u.push(item('org', 'persona', `${esperaG.length} ${esperaG.length === 1 ? 'compra espera al Gerente general' : 'compras esperan al Gerente general'}`, `${cop(suma(esperaG))} en total`, ir('compras', 'compras', 'curso')));
    if (viejos.length) u.push(item('org', 'entrega', `${viejos.length} ${viejos.length === 1 ? 'pedido de material espera' : 'pedidos de material esperan'} hace más de 2 días`, nom(viejos), ir('solicitudes', 'solicitudes', 'pendiente')));
    if (baj.length) u.push(item('org', 'caja', `${baj.length} ${baj.length === 1 ? 'artículo bajo del mínimo' : 'artículos bajos del mínimo'}`, nom(baj), ir('existencias', '', '', 'bajo')));
    if (falta.length) u.push(item('listo', 'carrito', `${falta.length} ${falta.length === 1 ? 'compra falta comprarla' : 'compras faltan por comprar'}`, `${cop(suma(falta))} autorizados`, ir('compras', 'compras', 'curso')));
    if (llegar.length) u.push(item('listo', 'caja', `${llegar.length} ${llegar.length === 1 ? 'compra falta recibirla' : 'compras faltan por recibir'}`, nom(llegar), ir('compras', 'compras', 'curso')));
    const valorBodega = articulos().reduce((x, a) => x + num(a.cantidad) * num(a.costo), 0);
    const gasto = mes => d.compras.filter(c => ['comprado', 'recibido', 'sin-autorizar'].includes(c.estado) && String(c.fechaCompra || '').slice(0, 7) === mes).reduce((x, c) => x + num(c.valorReal || c.valorAprox), 0);
    const hoyMes = App.hoyISO().slice(0, 7), g1 = gasto(hoyMes), g0 = gasto(mesAnterior());
    const delta = g0 > 0 ? Math.round((g1 / g0 - 1) * 100) : null;
    const salidas = d.movimientos.filter(m => m.tipo === 'salida' && delMes(m.fecha));
    const costoDe = m => (m.valor == null ? num(m.cantidad) * num((artPorId(m.articuloId) || {}).costo) : num(m.valor));
    const comprasMes = d.compras.filter(c => ['comprado', 'recibido', 'sin-autorizar'].includes(c.estado) && delMes(c.fechaCompra));
    let h = `<div class="section-label">Lo urgente</div>` + (u.length ? `<div class="list">${u.join('')}</div>` : UI.vacio('checkCirculo', 'Todo en orden', 'No hay nada urgente en el inventario.'));
    h += barraBotones([boton('excel', 'Descargar Excel', 'excel', '', 'primary')]);
    h += `<div class="resumen-grid">
      <div class="card"><span class="meta">Valor de lo que hay en bodega</span><span class="rm-n valor">${esH(cop(valorBodega))}</span><span class="meta">${articulos().length} artículos</span></div>
      <div class="card"><span class="meta">Gastado este mes</span><span class="rm-n valor">${esH(cop(g1))}</span><span class="meta">${delta == null ? 'El mes pasado no hubo compras' : `${delta > 0 ? '+' : ''}${delta} % frente al mes pasado (${esH(cop(g0))})`}</span></div>
      <div class="card"><span class="meta">Salió de bodega este mes</span><span class="rm-n valor">${esH(cop(salidas.reduce((x, m) => x + costoDe(m), 0)))}</span><span class="meta">${salidas.length} salidas</span></div></div>`;
    h += tarjetasBodega();
    h += `<div class="section-label">Compras del mes por persona que las pidió</div><div class="card">${barras(agrupar(comprasMes, c => c.pide, c => num(c.valorReal || c.valorAprox)), cop)}</div>`;
    h += `<div class="section-label">Lo que salió de bodega este mes por persona</div><div class="card">${barras(agrupar(salidas, m => m.persona, costoDe), cop)}</div>`;
    h += `<div class="section-label">Lo que salió de bodega este mes por proyecto</div><div class="card">${barras(agrupar(salidas, m => m.proyecto, costoDe), cop)}</div>`;
    h += `<div class="section-label">Compras del mes por categoría</div><div class="card">${barras(agrupar(comprasMes, c => c.categoria, c => num(c.valorReal || c.valorAprox)), cop)}</div>`;
    return h;
  }
  /** El Gerente general fija desde cuánto autoriza él (además de lo que pide la Coordinadora). Solo con cuenta propia: las reglas no dejan a la persona de prueba. */
  function cambiarMonto() {
    abrirAccion({
      titulo: 'Desde cuánto autorizas tú', sub: `Hoy: ${A().cop(A().montoGerente())}. Las compras de MÁS de ese valor pasan por la Coordinadora y después por ti. Lo que pide la Coordinadora lo decides siempre.`,
      campos: campoNum('acMonto', 'Monto (pesos)', A().montoGerente(), 0, 1000000000, 'Sin puntos ni comas. Con 0, decides todas las compras.'),
      primario: 'Guardar el monto', icono: 'check', listo: 'Listo: monto guardado. Vale desde la próxima compra que autorice la Coordinadora.',
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
  /** Campo de proveedor con lista para escoger (y escribir uno nuevo). Cada campo trae su propia lista con los proveedores que hay. */
  const campoProv = (id, lbl, v, ph, max, ayuda) => `<div class="field"><label for="${id}">${lbl}</label><input id="${id}" type="text" maxlength="${max || 80}" autocomplete="off" list="${id}Lista" value="${esH(v || '')}" placeholder="${esH(ph || '')}"><datalist id="${id}Lista">${provs().map(x => `<option value="${esH(x.nombre)}">${esH(x.nit || '')}</option>`).join('')}</datalist>${ayuda ? `<span class="meta" id="${id}Ay">${esH(ayuda)}</span>` : ''}</div>`;
  const campoSel = (id, lbl, ops, v) => `<div class="field"><label for="${id}">${lbl}</label><select id="${id}">${ops.map(([val, txt]) => `<option value="${esH(val)}"${val === v ? ' selected' : ''}>${esH(txt)}</option>`).join('')}</select></div>`;
  const opsArt = vacio => (vacio ? [['', vacio]] : []).concat(articulos().slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))).map(a => [a.id, `${a.nombre} · ${bodegaDe(a)} (${num(a.cantidad) > 0 ? 'hay ' + cantTxt(a.cantidad, a.unidad) : 'agotado'})`]));
  /** Artículos de UNA bodega para escoger (entradas y salidas: primero se escoge la bodega). */
  const opsArtBod = bod => articulos().filter(a => bodegaDe(a) === bod).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))).map(a => [a.id, `${a.nombre} (${num(a.cantidad) > 0 ? 'hay ' + cantTxt(a.cantidad, a.unidad) : 'agotado'})`]);
  function abrirAccion(o) {
    accion = o;
    $('acCampos').oninput = null;
    $('acT').textContent = o.titulo; $('acSub').textContent = o.sub || '';
    $('acCampos').innerHTML = o.campos || '';
    window.llenarIconos($('acCampos'));
    const pri = $('acPrimario'); pri.hidden = !o.primario;
    pri.innerHTML = o.primario ? (o.icono ? window.ico(o.icono) : '') + esH(o.primario) : '';
    const sec = $('acSecundario'); sec.hidden = !o.secundario; sec.textContent = o.secundario || '';
    $('acCerrar').textContent = o.primario ? 'Cancelar' : 'Cerrar';
    $('acErr').hidden = true;
    A().abrirHoja('shAccion');
    A().vigilar('shAccion', () => $('acForm'), () => JSON.stringify([cotizaciones.length, extrasN, fotoFactura.length]));
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
  /* Kárdex con plata: cada movimiento guarda a cuánto salió o entró cada unidad (costoUnit), cuánto vale el movimiento (valor)
     y cuánto vale lo que quedó (valorSaldo, al costo promedio de ese momento). El costo del artículo es el promedio ponderado:
     cuando llega una compra se recalcula con lo que había y lo que entra. Salidas, traslados y ajustes usan el costo vigente. */
  const promedio = (hay, costoHay, n, costoN) => (hay + n > 0 ? Math.round((hay * costoHay + n * costoN) / (hay + n)) : Math.round(costoN));
  const conPlata = o => {
    if (o.costoUnit == null) return o;
    const r = Object.assign({}, o, { valor: Math.round(Math.abs(num(o.cantidad)) * num(o.costoUnit)), valorSaldo: Math.round(num(o.saldo) * num(o.costoProm == null ? o.costoUnit : o.costoProm)) });
    delete r.costoProm;
    return r;
  };
  /** `o.costoUnit`: a cuánto entra o sale cada unidad (si no, al costo del artículo). `o.costoNuevo`: el nuevo costo promedio del artículo (solo cuando entra algo con otro precio).
      `mover()` pone `bodega` sola (la del artículo). Quien llama a `movimiento()` directo debe pasar `bodega` (la bodega cuya cantidad cambió): aquí no se inventa ninguna. */
  const mover = (a, delta, o) => {
    const id = window.nube.idNuevo('mo'), cu = o.costoUnit == null ? num(a.costo) : num(o.costoUnit), prom = o.costoNuevo == null ? num(a.costo) : num(o.costoNuevo);
    const resto = Object.assign({}, o, { costoUnit: cu, costoProm: prom, bodega: bodegaDe(a) }); delete resto.costoNuevo;   // el movimiento queda en la bodega de ese artículo
    const datos = { cantidad: window.nube.incremento(delta), ultimoMov: id };
    if (o.costoNuevo != null) datos.costo = prom;
    return [['update', 'articulos', a.id, datos], movimiento(resto, id)];
  };
  const movimiento = (o, id) => ['set', 'movimientos', id || window.nube.idNuevo('mo'), Object.assign({ persona: '', proyecto: '', nota: '', compraId: '', solicitudId: '', por: persona().nombre, porRol: persona().rol, fecha: ahora() }, conPlata(o))];
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
      if (accion.alGuardar) accion.alGuardar();
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
  /** `solId`: el pedido de material del que nace esta compra (queda guardado en la compra como `solicitudId`). */
  function pedirCompra(artId, cantSug, otros, solId) {
    const a = artId ? artPorId(artId) : null;
    const sug = cantSug || (a ? Math.max(1, num(a.maximo) - num(a.cantidad)) : 1);
    const general = esGerenteGeneral(), aut = autorizadorDe({ pideRol: persona().rol, estado: 'pedido' }), monto = A().montoGerente(), quienAut = aut === 'gerente' ? 'el Gerente general' : nombreRol(aut);
    cotizaciones = []; extrasN = 0;
    abrirAccion({
      titulo: hagoCompras() ? 'Hacer una compra' : 'Pedir una compra',
      sub: general ? `Como Gerente general no necesitas que nadie la autorice: queda autorizada y le llega el aviso a ${nombreRol('compras')} para comprarla.`
        : hagoCompras() ? `Escribe qué vas a comprar. Antes de comprar, ${quienAut} la autoriza (le llega el aviso)${aut === 'coordina' ? `; si vale más de ${A().cop(monto)}, después la autoriza el Gerente general` : ''}.`
        : `Escribe qué se va a comprar. Le llega el aviso a ${quienAut} para que la autorice${aut === 'coordina' ? `; si vale más de ${A().cop(monto)}, después la autoriza el Gerente general` : ''}.`,
      campos: campoSel('acArt', '¿Es para la bodega?', opsArt('No va a bodega'), a ? a.id : '') +
        campoTxt('acQue', 'Qué se va a comprar', a ? a.nombre : '', 'Ej: botas de seguridad talla 40', 100) +
        `<div class="fields cols">${campoNum('acCant', 'Cantidad', sug, 1, 99999)}${campoSel('acUni', 'Unidad', UNIDADES.map(u => [u, u]), a ? a.unidad : 'unidades')}</div>` +
        `<div class="fields cols">${campoSel('acCat', 'Categoría', CATEGORIAS.map(x => [x, x]), a && CATEGORIAS.includes(a.categoria) ? a.categoria : 'Otro')}${campoNum('acValor', 'Valor total de este artículo (pesos)', a ? num(a.costo) * sug : '', 0, null)}</div>` +
        `<div id="acExtra"></div><div class="row"><button class="btn small ghost" type="button" data-accion="masLinea">${window.ico('mas')}Agregar otro artículo a esta compra</button></div>` +
        campoProv('acProvSug', 'A quién se le va a comprar (opcional)', a ? a.proveedor : '', 'Ej: Ferretería El Faro', 80) +
        campoTxt('acPara', 'Para qué', a ? 'Reponer la bodega' : '', 'Ej: para la cuadrilla de campo', 140) +
        campoSel('acProy', 'Proyecto', PROYECTOS.map(p => [p, p]), PROYECTOS[0]) +
        `<div class="field"><span class="lbl">Cotizaciones (opcional, hasta 3 fotos)</span><label class="btn foto-btn"><span data-ico="camara"></span><span id="acCotTxt">Adjuntar fotos de cotizaciones</span><input id="acCot" class="archivo-oculto" type="file" accept="image/*" multiple></label><div id="acCotVer" class="cot-mini"></div></div>`,
      primario: hagoCompras() ? 'Enviar para autorizar' : 'Pedir la compra', icono: 'enviar',
      listo: general ? `Listo: compra autorizada. Le llegó el aviso a ${nombreRol('compras')} para comprarla.` : hagoCompras() ? `Listo: le llegó el aviso a ${quienAut}. Cuando la autorice, haces la compra y la registras.` : `Listo: compra pedida. Le llegó el aviso a ${quienAut} para autorizarla.`,
      ops: () => {
        const art = artPorId(valor('acArt')), n = entero('acCant'), v = entero('acValor');
        if (!valor('acQue')) return fallar('Escribe qué se va a comprar.', 'acQue');
        if (!(n > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        if (!(v > 0)) return fallar('Escribe el valor de este artículo en pesos, sin puntos ni comas.', 'acValor');
        if (!valor('acPara')) return fallar('Escribe para qué es la compra.', 'acPara');
        const lineas = [{ que: valor('acQue'), cantidad: n, unidad: valor('acUni'), valor: v, articuloId: art ? art.id : '', bodega: art ? bodegaDe(art) : '' }];
        for (const f of document.querySelectorAll('#acExtra .linea-extra')) {
          const g = k => f.querySelector(`[data-lx="${k}"]`), q = g('que').value.trim(), c = Number(g('cant').value), val = Number(g('val').value), ar = artPorId(g('art').value);
          if (!q) return fallar('Escribe qué se va a comprar en cada artículo que agregaste.', g('que').id);
          if (!(Number.isInteger(c) && c > 0)) return fallar('La cantidad de cada artículo debe ser un número entero mayor que 0.', g('cant').id);
          if (!(Number.isInteger(val) && val > 0)) return fallar('Escribe el valor total de cada artículo en pesos, sin puntos ni comas.', g('val').id);
          lineas.push({ que: q, cantidad: c, unidad: ar ? ar.unidad : 'unidades', valor: val, articuloId: ar ? ar.id : '', bodega: ar ? bodegaDe(ar) : '' });
        }
        const repetida = lineas.find((l, i) => l.articuloId && lineas.findIndex(x => x.articuloId === l.articuloId) !== i);
        if (repetida) return fallar(`El artículo «${repetida.que}» está dos veces en esta compra.`, 'acQue');
        const abierta = lineas.find(l => l.articuloId && compraAbierta(l.articuloId));
        if (abierta) return fallar(`Ya hay una compra en curso de ${abierta.que}. Revísala en Compras.`, 'acArt');
        const unico = lineas.length === 1, total = lineas.reduce((x, l) => x + l.valor, 0);
        const proyecto = valor('acProy'), resumenTxt = unico ? valor('acQue') : `${valor('acQue')} y ${lineas.length - 1} más`;
        const doc = Object.assign({ que: resumenTxt, cantidad: unico ? n : lineas.reduce((x, l) => x + l.cantidad, 0), unidad: unico ? valor('acUni') : 'artículos', categoria: valor('acCat'), valorAprox: total,
          paraQue: valor('acPara') + (proyecto ? ` (${proyecto})` : ''), proyecto, proveedorSug: valor('acProvSug'), lineas, cotizaciones: cotizaciones.slice(),
          pide: persona().nombre, pideRol: persona().rol, autoriza: general ? persona().nombre : '', autorizaJefe: '', estado: general ? 'autorizado' : 'pedido', proveedor: '', valorReal: 0, fechaPedido: A().hoyISO(), fechaCompra: '', entregadoA: '', motivoRechazo: '',
          articuloId: unico && art ? art.id : '', factura: '', revisada: false }, misMarcas());
        if (solId) doc.solicitudId = solId;
        doc.historial = [{ fecha: ahora(), texto: solId ? 'Pidió la compra para un pedido de material' : 'Pidió la compra', por: persona().nombre }];
        if (general) { doc.autorizaCorreo = window.nube.correo(); doc.historial.push({ fecha: ahora(), texto: 'Autorizó la compra (Gerente general: lo que pide no necesita autorización)', por: persona().nombre }); }
        return [['set', 'compras', window.nube.idNuevo('co'), doc],
          general ? aviso('compras', 'Compra autorizada: hay que comprar', `${persona().nombre} autorizó comprar ${resumenTxt} por ${A().cop(total)}.`)
            : aviso(ROL_DE[aut], 'Compra por autorizar', `${persona().nombre} pide comprar ${resumenTxt} por ${A().cop(total)}.`)];
      }
    });
    // «Pedir todo lo bajo»: el primer artículo va en la línea de arriba y los demás en líneas extra, ya con su cantidad y su valor.
    if (otros && otros.length) {
      $('acProvSug').value = '';
      otros.slice(0, MAX_EXTRA).forEach(x => {
        masLinea();
        const k = extrasN - 1, n = Math.max(1, num(x.maximo) - num(x.cantidad));
        $('lxArt' + k).value = x.id; $('lxQue' + k).value = x.nombre; $('lxCant' + k).value = n; $('lxVal' + k).value = num(x.costo) * n;
      });
    }
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
  /** Una sola compra con todo lo agotado o bajo del mínimo (lo más urgente primero, hasta 5 artículos). */
  function pedirBajo() {
    const bajos = tareas().filter(t => t.tipo === 'pedir').map(t => t.art);
    if (!bajos.length) return null;
    const lote = bajos.slice(0, MAX_EXTRA + 1);
    pedirCompra(lote[0].id, 0, lote.slice(1));
    if (bajos.length > lote.length) A().toast(`Hay ${bajos.length} artículos por reponer: en esta compra van los ${lote.length} más urgentes. Después haces otra con el resto.`);
    return true;
  }
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
  function detalleCompra(c, conMonto, tablaPropia) {
    const App = A(), cop = App.cop, lineas = lineasDe(c);
    const filas = lineas.map(l => {
      const a = l.articuloId ? artPorId(l.articuloId) : null, ult = ultimoPrecio(l), cada = num(l.cantidad) > 0 ? Math.round(num(l.valor) / num(l.cantidad)) : 0;
      const sube = ult && ult.cada > 0 && cada > ult.cada * 1.1;
      return `<tr><td><b>${esH(l.que)}</b>${bodegaLinea(l) ? `<span class="docs">${pillBod(bodegaLinea(l))}</span>` : ''}${a ? `<span class="meta">En bodega hay ${esH(cantTxt(a.cantidad, a.unidad))}</span>` : '<span class="meta">No va a bodega</span>'}${ult ? `<span class="meta${sube ? ' err-txt' : ''}">Último precio pagado: ${esH(cop(ult.cada))} c/u${ult.proveedor ? ' en ' + esH(ult.proveedor) : ''}${ult.fecha ? ', ' + esH(App.fechaCorta(ult.fecha)) : ''}${sube ? ' (ahora piden más)' : ''}</span>` : ''}</td>
        <td>${esH(String(num(l.cantidad)))} ${esH(l.unidad || '')}</td><td>${esH(cop(cada))}</td><td>${esH(cop(l.valor))}</td></tr>`;
    }).join('');
    const cots = Array.isArray(c.cotizaciones) ? c.cotizaciones.filter(x => /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(typeof x === 'string' ? x : '')) : [];
    const tabla = `<table class="lineas-tabla"><thead><tr><th>Qué</th><th>Cantidad</th><th>Cada uno</th><th>Total</th></tr></thead><tbody>${filas}</tbody>
      <tfoot><tr><td colspan="3"><b>Total aprox.</b></td><td><b>${esH(cop(c.valorAprox))}</b></td></tr></tfoot></table>`;
    return `${tablaPropia || tabla}
      <dl class="datos"><dt>Pidió</dt><dd>${esH(c.pide)}${c.fechaPedido ? ' el ' + esH(App.fechaCorta(c.fechaPedido)) : ''}</dd><dt>Para qué</dt><dd>${esH(c.paraQue)}</dd>
        ${c.proveedorSug ? `<dt>A quién se le compra</dt><dd>${esH(c.proveedorSug)}</dd>` : ''}
        ${conMonto ? `<dt>Monto del Gerente</dt><dd>${esH(cop(App.montoGerente()))}: si la compra vale más de eso, también la autoriza el Gerente general</dd>` : ''}</dl>
      ${cots.length ? `<div class="field"><span class="lbl">Cotizaciones (${cots.length})</span><div class="cot-mini">${cots.map((x, i) => `<img src="${esH(x)}" alt="Cotización ${i + 1} de ${esH(c.que)}">`).join('')}</div></div>` : ''}`;
  }

  /** Lo autorizado, lo pagado y lo recibido de cada artículo, lado a lado, con las diferencias en rojo.
      Lo pagado se anota por toda la compra: por artículo se reparte según lo que valía cada uno al pedirlo. Lo recibido sale de los movimientos de bodega. */
  function cuadroCompra(c) {
    const App = A(), cop = App.cop, lineas = lineasDe(c), pagado = num(c.valorReal), recibida = c.estado === 'recibido';
    const suma = lineas.reduce((s, l) => s + num(l.valor), 0), factor = pagado > 0 && suma > 0 ? pagado / suma : 1;
    const movs = D().movimientos.filter(m => m.compraId === c.id && m.motivo === 'compra');
    const aviso = txt => `<span class="err-txt">${window.ico('aviso')} ${esH(txt)}</span>`;
    let faltaron = 0;
    const filas = lineas.map((l, idx) => {
      const pag = lineas.length === 1 ? pagado : Math.round(num(l.valor) * factor);
      const mas = num(l.valor) > 0 && pag > num(l.valor) * 1.1;
      let rec;
      if (!recibida) rec = '<span class="meta">Falta recibir</span>';
      else if (!l.articuloId) rec = `<span class="meta">No va a bodega${c.entregadoA ? ': se entregó a ' + esH(c.entregadoA) : ''}</span>`;
      else if (!veMovs()) rec = '<span class="meta">—</span>';
      else {
        // Lo que llegó a otra bodega también cuenta: ese movimiento guarda el artículo pedido (lineaArticuloId).
        const delas = movsDeLinea(movs, l, idx);
        const llego = delas.reduce((s, m) => s + cantidadDeLinea(m, idx), 0), ped = bodegaLinea(l);
        const otras = Array.from(new Set(delas.map(bodegaMov).filter(b => b && b !== ped)));
        if (llego < num(l.cantidad)) faltaron++;
        rec = `${esH(String(llego))} ${esH(l.unidad || '')}${otras.length ? `<span class="meta">${esH('llegó a ' + otras.join(' y '))}</span>` : ''}${llego < num(l.cantidad) ? `<br>${aviso(`faltan ${num(l.cantidad) - llego}`)}` : ''}`;
      }
      return `<tr><td><b>${esH(l.que)}</b>${bodegaLinea(l) ? `<span class="docs">${pillBod(bodegaLinea(l))}</span>` : ''}</td><td>${esH(String(num(l.cantidad)))} ${esH(l.unidad || '')}<span class="meta">${esH(cop(l.valor))}</span></td>
        <td>${esH(cop(pag))}${mas ? `<br>${aviso(`+${Math.round((pag / num(l.valor) - 1) * 100)} %`)}` : ''}</td><td>${rec}</td></tr>`;
    }).join('');
    const sobre = sobrecosto(c);
    return `<table class="lineas-tabla cuadro-compra"><thead><tr><th>Qué</th><th>Autorizado</th><th>Pagado</th><th>Recibido</th></tr></thead><tbody>${filas}</tbody>
      <tfoot><tr><td><b>Total aprox.</b></td><td><b>${esH(cop(c.valorAprox))}</b></td><td><b>${esH(cop(c.valorReal))}</b>${sobre ? `<br>${aviso(`+${sobre.pct} %`)}` : ''}</td><td>${faltaron ? aviso(faltaron === 1 ? 'llegó menos en 1 artículo' : `llegó menos en ${faltaron} artículos`) : ''}</td></tr></tfoot></table>
      <p class="meta">Lo pagado se anota por toda la compra; por artículo se reparte según lo que valía cada uno al pedirlo.</p>`;
  }

  /** Orden de compra para mandar al proveedor. Se arma con los datos de la compra autorizada y se imprime solo ese documento
      (en el teléfono sale «Guardar como PDF»). El número es el código corto de la compra. */
  function imprimirOrden(c) {
    const App = A(), cop = App.cop, lineas = lineasDe(c);
    const numero = 'OC-' + String(c.id).replace(/^co-/i, '').slice(-6).toUpperCase();
    const quien = [c.autorizaJefe, c.autoriza].filter(Boolean).filter((x, i, l) => l.indexOf(x) === i);
    // Dónde se entrega: la bodega de cada línea. Si hay varias bodegas (o algo no va a bodega) cada línea dice la suya.
    const bods = bodegasCompra(c), variasBod = bods.length > 1 || (bods.length > 0 && lineas.some(l => !bodegaLinea(l)));
    const entregarEn = bods.length ? (bods.length === 1 ? 'Bodega de ' + bods[0] : 'Bodegas de ' + bods.join(', ')) : 'No va a bodega';
    const doc = `<article class="acta-doc" id="ordenDoc">
      <header class="acta-cab"><span class="acta-logo"><img src="iconos/logo-empresa.png" alt="Logo de la empresa" width="54" height="49"></span><b>ORDEN DE COMPRA</b><span class="acta-cod">Orden ${esH(numero)}<br>Código: FT-DEMO<br>Versión: 01</span></header>
      <dl class="acta-datos"><dt>FECHA:</dt><dd>${esH(App.fechaCorta(App.hoyISO()))}</dd><dt>PEDIDA EL:</dt><dd>${esH(c.fechaPedido ? App.fechaCorta(c.fechaPedido) : '')}</dd>
        <dt>PROVEEDOR:</dt><dd>${esH(c.proveedor || c.proveedorSug || 'Por definir')}</dd><dt>PARA:</dt><dd>${esH(c.paraQue || '')}</dd>
        <dt>ENTREGAR EN:</dt><dd>${esH(entregarEn)}</dd></dl>
      <table class="acta-tabla"><thead><tr><th>ARTÍCULO</th><th>CANTIDAD</th><th>UNIDAD</th><th>VALOR APROX.</th></tr></thead>
        <tbody>${lineas.map(l => `<tr class="llena"><td>${esH(l.que)}${variasBod ? esH(` (${bodegaLinea(l) || 'No va a bodega'})`) : ''}</td><td>${esH(String(num(l.cantidad)))}</td><td>${esH(l.unidad || '')}</td><td>${esH(cop(l.valor))}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3"><b>TOTAL APROX.</b></td><td><b>${esH(cop(c.valorAprox))}</b></td></tr></tfoot></table>
      <dl class="acta-datos"><dt>PIDIÓ:</dt><dd>${esH(c.pide || '')}</dd><dt>AUTORIZÓ:</dt><dd>${esH(quien.join(' y '))}</dd></dl>
      <p class="acta-pie">Orden ${esH(numero)} · Documento de prueba: no es una orden de compra real.</p>
    </article>`;
    const previo = document.getElementById('impresion'); if (previo) previo.remove();
    const cont = document.createElement('div'); cont.id = 'impresion'; cont.innerHTML = doc;
    document.body.appendChild(cont); document.body.classList.add('imprimiendo');
    const fin = () => { document.body.classList.remove('imprimiendo'); cont.remove(); window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin);
    try { window.print(); } catch (e) {}
    setTimeout(fin, 60000);
    return true;
  }

  function autorizar(c) {
    const App = A(), monto = App.montoGerente(), segundo = c.estado === 'por-gerente';
    // La Coordinadora pasa al Gerente general lo que vale MÁS del monto (lo que pidió ella siempre lo decide el Gerente general, y él decide directo).
    const pasaAlGerente = !segundo && esCoordinador() && num(c.valorAprox) > monto;
    abrirAccion({
      titulo: segundo ? 'Autorizar compra (segundo paso)' : 'Autorizar compra', sub: `${c.que}: aprox. ${App.cop(c.valorAprox)}.${segundo ? ` La Coordinadora ya la autorizó${c.autorizaJefe ? ' (' + c.autorizaJefe + ')' : ''}.` : ''}`,
      campos: detalleCompra(c, true) + (pasaAlGerente ? `<div class="aviso warn"><span>Vale más de ${esH(App.cop(monto))}: al autorizarla pasa al Gerente general, que la autoriza después. Aún no se puede comprar.</span></div>` : ''),
      primario: pasaAlGerente ? 'Autorizar y pasar al Gerente general' : 'Autorizar', icono: 'check', secundario: 'Rechazar',
      listo: pasaAlGerente ? 'Listo: autorizada. Le llegó el aviso al Gerente general para el segundo paso.' : `Listo: compra autorizada. Le llegó el aviso a ${nombreRol('compras')} para comprarla.`,
      ops: () => {
        if (esMiaLaCompra(c)) return fallar('No puedes autorizar una compra que pediste tú.');
        if (!puedoDecidir(c)) return fallar(`Esta compra la autoriza ${nombreRol(autorizadorDe(c))}.`);
        if (pasaAlGerente) {
          return [['mezclar', 'compras', c.id, { estado: 'por-gerente', autorizaJefe: persona().nombre, autorizaCorreo: window.nube.correo(), historial: paso(c, `Autorizó y la pasó al Gerente general (vale ${App.cop(c.valorAprox)}, más de ${App.cop(monto)} decide él)`) }],
            aviso('gerente', 'Compra por autorizar (segundo paso)', `${persona().nombre} autorizó ${c.que} por ${App.cop(c.valorAprox)} y la pasa a tu decisión.`)];
        }
        const campos = { estado: 'autorizado', autoriza: persona().nombre, autorizaCorreo: window.nube.correo(), historial: paso(c, segundo ? 'El Gerente general autorizó la compra' : esGerenteGeneral() ? 'El Gerente general autorizó la compra' : 'Autorizó la compra') };
        if (esCoordinador() && !segundo) campos.autorizaJefe = persona().nombre;
        const avisaCoord = (segundo || esGerenteGeneral()) && c.pideRol !== 'coordcompras';
        return [['mezclar', 'compras', c.id, campos],
          aviso('compras', 'Compra autorizada: hay que comprar', `${persona().nombre} autorizó comprar ${cantTxt(c.cantidad, c.unidad)} de ${c.que}.`),
          c.pideRol !== 'compras' ? aviso(c.pideRol, 'Te autorizaron la compra', `${persona().nombre} autorizó tu compra de ${c.que}.`, ['gerente', 'coordcompras'].includes(c.pideRol)) : null,
          avisaCoord ? aviso('coordcompras', 'El Gerente general autorizó la compra', `${persona().nombre} autorizó ${c.que}.`) : null];
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
        if (!puedoDecidir(c)) return fallar(`Esta compra la decide ${nombreRol(autorizadorDe(c))}.`);
        return [['mezclar', 'compras', c.id, { estado: 'rechazado', motivoRechazo: valor('acMotivo'), autoriza: persona().nombre, autorizaCorreo: window.nube.correo(), historial: paso(c, `Rechazó la compra: ${valor('acMotivo')}`) }],
          aviso(c.pideRol, 'Rechazaron tu compra', `${c.que}: ${valor('acMotivo')}.`, ['gerente', 'coordcompras'].includes(c.pideRol)),
          c.estado === 'por-gerente' && c.autorizaJefe ? aviso('coordcompras', 'El Gerente general rechazó la compra', `${c.que}: ${valor('acMotivo')}.`) : null];
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
      sub: sinAutorizacion ? 'Para que quede el registro: la Coordinadora de compras recibe el aviso y la compra se ve en rojo en el resumen.' : `${c.que}: ${cantTxt(c.cantidad, c.unidad)}, autorizada por ${c.autoriza || 'la Coordinadora'}.`,
      campos: (sinAutorizacion ? campoTxt('acQue', 'Qué se compró', '', 'Ej: garrafones de agua', 100) + `<div class="fields cols">${campoNum('acCant', 'Cantidad', 1, 1, 99999)}${campoSel('acUni', 'Unidad', UNIDADES.map(u => [u, u]), 'unidades')}</div>` + campoSel('acCat', 'Categoría', CATEGORIAS.map(x => [x, x]), 'Otro') + campoTxt('acPara', 'Para qué', '', 'Ej: para la reunión de hoy', 140) + campoTxt('acQuien', 'Quién compró', '', 'Nombre', 60) : '') +
        campoProv('acProv', 'Proveedor', (a && a.proveedor) || (c && c.proveedor) || '', 'Escribe o escoge de la lista', 80, 'Si no está en la lista, se agrega solo a Proveedores.') +
        campoNum('acValor', 'Valor pagado (pesos)', c ? c.valorAprox : '', 0, null, c ? `Autorizado: aprox. ${A().cop(c.valorAprox)}.` : '') +
        `<div class="field"><span class="lbl">Foto de la factura</span><label class="btn foto-btn"><span data-ico="camara"></span><span id="acFotoTxt">Tomar o escoger foto</span><input id="acFoto" class="archivo-oculto" type="file" accept="image/*" capture="environment"></label><img id="acFotoVer" class="factura-mini" alt="Foto de la factura" hidden></div>`,
      primario: 'Guardar compra', icono: 'check',
      listo: sinAutorizacion ? 'Listo: compra registrada. Quedó marcada sin autorización.' : `Listo: compra registrada. Le llegó el aviso a ${nombreRol('asistente')} para recibirla.`,
      ops: () => {
        const v = entero('acValor');
        if (sinAutorizacion && !valor('acQue')) return fallar('Escribe qué se compró.', 'acQue');
        if (sinAutorizacion && !(entero('acCant') > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        if (sinAutorizacion && !valor('acQuien')) return fallar('Escribe quién compró.', 'acQuien');
        if (valor('acProv').length < 2) return fallar('Escribe el proveedor.', 'acProv');
        if (!(v > 0)) return fallar('Escribe el valor pagado en pesos, sin puntos ni comas.', 'acValor');
        // Si el proveedor ya está en la lista (aunque cambie una mayúscula o una tilde) se usa ese; si no, se agrega a Proveedores en la misma escritura.
        const conocido = provPorNombre(valor('acProv')), provId = conocido ? conocido.id : window.nube.idNuevo('pv'), provNom = conocido ? conocido.nombre : valor('acProv');
        const opsProv = conocido ? [] : [['set', 'proveedores', provId, { nombre: provNom, nit: '', contacto: '', telefono: '', correo: '', nota: '', por: persona().nombre, porRol: persona().rol, en: A().hoyISO() }]];
        if (sinAutorizacion) {
          return [...opsProv, ['set', 'compras', window.nube.idNuevo('co'), { que: valor('acQue'), cantidad: entero('acCant'), unidad: valor('acUni'), categoria: valor('acCat'), valorAprox: v, paraQue: valor('acPara') || 'Sin dato',
            pide: valor('acQuien'), pideRol: persona().rol, autoriza: '', estado: 'sin-autorizar', proveedor: provNom, proveedorId: provId, valorReal: v, fechaPedido: A().hoyISO(), fechaCompra: A().hoyISO(), entregadoA: '', motivoRechazo: '', articuloId: '',
            factura: fotoFactura, revisada: false, historial: [{ fecha: ahora(), texto: `Registró una compra de ${valor('acQuien')} hecha sin autorización en ${provNom}`, por: persona().nombre }], ...misMarcas() }],
            aviso('coordcompras', 'Compra sin autorización', `${valor('acQuien')} compró ${valor('acQue')} en ${provNom} (${A().cop(v)}) sin autorización.`),
            aviso('compras', 'Compra sin autorización', `${valor('acQuien')} compró ${valor('acQue')} (${A().cop(v)}) sin autorización.`)];
        }
        const tope = num(c.valorAprox) > 0 ? num(c.valorAprox) * 1.5 : A().montoGerente();
        if (v > tope) return fallar(`Eso pasa mucho de lo autorizado (${A().cop(c.valorAprox)}; lo más que se puede pagar son ${A().cop(Math.round(tope))}). Pide una autorización nueva.`, 'acValor');
        // Más del 10 % sobre lo autorizado: queda dicho en el historial y le avisa a la Coordinadora (y al Gerente general si él la había autorizado).
        const sobre = num(c.valorAprox) > 0 && v > num(c.valorAprox) * 1.1, pct = Math.round((v / Math.max(1, num(c.valorAprox)) - 1) * 100);
        return [...opsProv, ['mezclar', 'compras', c.id, { estado: 'comprado', proveedor: provNom, proveedorId: provId, valorReal: v, fechaCompra: A().hoyISO(), factura: fotoFactura || c.factura || '', historial: paso(c, `Compró en ${provNom} por ${A().cop(v)}${sobre ? ` (${pct} % más de lo autorizado)` : ''}`) }],
          aviso('asistente', 'Compra en camino: hay que recibirla', `${persona().nombre} compró ${cantTxt(c.cantidad, c.unidad)} de ${c.que} en ${provNom}. ${a ? 'Recíbela en bodega cuando llegue.' : `Cuando llegue, entrégala a ${c.pide}.`}`),
          c.pideRol !== 'asistente' ? aviso(c.pideRol, 'Ya se compró', `Se compró ${c.que} en ${provNom}.`) : null,
          sobre ? aviso('coordcompras', 'Pagaron más de lo autorizado', `${c.que}: autorizado ${A().cop(c.valorAprox)}, pagado ${A().cop(v)} (${pct} % más).`) : null,
          sobre && c.estado === 'autorizado' && c.autorizaJefe && c.autoriza !== c.autorizaJefe ? aviso('gerente', 'Pagaron más de lo autorizado', `${c.que}: autorizado ${A().cop(c.valorAprox)}, pagado ${A().cop(v)} (${pct} % más).`) : null];
      }
    });
    // Mientras escribe, la app dice si ese proveedor ya existe o se va a agregar.
    const avisoProv = () => { const t = valor('acProv'), ay = $('acProvAy'); if (!ay) return; const k = provPorNombre(t); ay.textContent = t.length < 2 ? 'Si no está en la lista, se agrega solo a Proveedores.' : k ? `Es «${k.nombre}»${k.nit ? ', NIT ' + k.nit : ''}.` : `«${t}» es nuevo: se agrega a Proveedores al guardar.`; };
    $('acCampos').oninput = e => { if (e.target && e.target.id === 'acProv') avisoProv(); };
    avisoProv();
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
  /** Lo que entra de una o más líneas de compra que llegaron al MISMO artículo de la bodega `dest` (`partes`: { i (la línea), l, a, n, unit, motivo } en el orden de la compra): se suma a ese artículo
      (si no está, se crea allí con la misma unidad, categoría, costo y proveedor, como en el traslado) y deja UN solo movimiento (la regla no deja dos al mismo artículo en una escritura).
      El costo promedio se calcula línea por línea, en orden. Si alguna línea no era para `dest`, el movimiento guarda el artículo pedido de la primera de ellas (`lineaArticuloId`) y el porqué (`motivoBodega`).
      Devuelve { ops } o { error }. */
  const claveLlegada = (a, dest) => { const d = destinoLlegada(a, dest); return { d, clave: d.art ? d.art.id : `nuevo|${dest}|${normNom(a.nombre)}|${a.unidad}` }; };
  function entradaCompra(c, partes, dest, nota) {
    const a = partes[0].a, d = destinoLlegada(a, dest);
    if (d.error) return { error: d.error };
    const total = partes.reduce((x, p) => x + p.n, 0), otras = partes.filter(p => dest !== (bodegaLinea(p.l) || bodegaDe(p.a)));
    const motivos = Array.from(new Set(otras.map(p => p.motivo).filter(Boolean)));
    // Cada unidad entra a lo que se pagó por ella y el costo de ese artículo pasa a ser el promedio (de lo que había allí y lo que entra, línea por línea).
    let hay = d.art ? num(d.art.cantidad) : 0, costo = d.art ? num(d.art.costo) : 0;
    const pagoTotal = partes.reduce((x, p) => x + p.n * p.unit, 0);
    partes.forEach(p => { costo = promedio(hay, costo, p.n, p.unit); hay += p.n; });
    const unit = Math.round(pagoTotal / total);
    const base = { tipo: 'entrada', motivo: 'compra', cantidad: total, persona: c.proveedor || '', nota, compraId: c.id };
    const extra = Object.assign(otras.length ? { lineaArticuloId: otras[0].a.id, motivoBodega: recorta(motivos.join('; '), 160) } : {},
      partes.length > 1 ? { partes: partes.map(p => ({ i: p.i, cantidad: p.n })) } : {});   // qué línea de la compra puso cuánto (para el cuadro de la compra)
    if (d.art) {
      const t = d.art;
      return { ops: mover(t, total, Object.assign({ costoUnit: unit, costoNuevo: costo, articuloId: t.id, articulo: t.nombre, saldo: num(t.cantidad) + total }, base, extra)) };
    }
    const id = window.nube.idNuevo('ar'), movId = window.nube.idNuevo('mo');
    const codigoAlla = a.codigo && !articulos().some(x => x.codigo === a.codigo && bodegaDe(x) === dest) ? a.codigo : '';
    return { ops: [['set', 'articulos', id, { nombre: a.nombre, codigo: codigoAlla, categoria: a.categoria, unidad: a.unidad, cantidad: total, ultimoMov: movId, minimo: num(a.minimo), maximo: num(a.maximo), ubicacion: '', costo, proveedor: a.proveedor || '', bodega: dest }],
      movimiento(Object.assign({ bodega: dest, costoUnit: unit, articuloId: id, articulo: a.nombre, saldo: total }, base, extra), movId)] };
  }
  /** «Llegó a la bodega»: la pedida por defecto; si es otra, aparece el porqué y se dice qué pasará allí (se suma al artículo que ya está o se crea). */
  const campoLlegada = (idSel, idBox, idMotivo, etiqueta, a, ped) => campoSel(idSel, etiqueta, BODEGAS.map(b => [b, b + (b === ped ? ' (la pedida)' : '')]), ped)
    + `<span class="meta" id="${idSel}Ay"></span><div id="${idBox}" hidden>${campoTxt(idMotivo, esH('¿Por qué llegó a otra bodega?'), '', 'Ej: en ' + ped + ' ya no se necesita', 160)}<span class="meta">Lo verá quien pidió y queda en el registro.</span></div>`;
  /** Compra con varios artículos: se anota cuánto llegó de cada uno y a qué bodega; lo que va a bodega se suma solo. */
  function recibirVarios(c) {
    const lineas = lineasDe(c);
    if (lineas.some(l => l.articuloId && !artPorId(l.articuloId))) { A().toast('Un artículo de esta compra ya no existe en bodega.'); return; }
    const hayFuera = lineas.some(l => !l.articuloId);
    const peds = lineas.map(l => (l.articuloId ? bodegaLinea(l) || bodegaDe(artPorId(l.articuloId)) : ''));
    abrirAccion({
      titulo: 'Recibir la compra', sub: `${c.que}: comprada en ${c.proveedor || 'el proveedor'}. Escribe cuánto llegó de cada artículo y a qué bodega.`,
      campos: lineas.map((l, i) => campoNum('rl' + i, esH(`Llegó: ${l.que} (compradas ${num(l.cantidad)})`), num(l.cantidad), 0, 99999, l.articuloId ? 'Se suma a la bodega.' : 'No va a bodega.')
        + (l.articuloId ? campoLlegada('rb' + i, 'rbBox' + i, 'rm' + i, esH(`Llegó a la bodega: ${l.que}`), artPorId(l.articuloId), peds[i]) : '')).join('') +
        (hayFuera ? campoTxt('acQuien', 'A quién se entregó lo que no va a bodega', c.pide, '', 60) : '') + campoTxt('acNota', 'Nota (opcional)', '', 'Ej: llegaron en buen estado', 160),
      primario: 'Recibir la compra', icono: 'caja', listo: 'Listo: compra recibida. Lo que va a bodega ya se sumó.',
      ops: () => {
        const llegaron = lineas.map((l, i) => entero('rl' + i));
        if (llegaron.some(n => !(n >= 0))) return fallar('Escribe un número entero (0 o más) en cada artículo.');
        if (hayFuera && !valor('acQuien')) return fallar('Escribe a quién se entregó lo que no va a bodega.', 'acQuien');
        // A qué bodega llegó cada línea (y el porqué si no es la pedida); solo lo que llegó de verdad (más de 0) lo pide.
        for (let i = 0; i < lineas.length; i++) {
          if (!lineas[i].articuloId || !(llegaron[i] > 0)) continue;
          const dest = valor('rb' + i);
          if (!BODEGAS.includes(dest)) return fallar('Escoge a qué bodega llegó cada artículo.', 'rb' + i);
          if (dest !== peds[i] && valor('rm' + i).length < 5) return fallar(`Escribe por qué «${lineas[i].que}» llegó a otra bodega (lo verá quien pidió y queda en el registro).`, 'rm' + i);
        }
        const ops = [], faltan = [], donde = [], llegoA = [], grupos = new Map();
        // Lo pagado se reparte entre las líneas en proporción a lo que valía cada una al pedirla; cada unidad entra a ese precio.
        const suma = lineas.reduce((s, l) => s + num(l.valor), 0), pagado = num(c.valorReal), factor = pagado > 0 && suma > 0 ? pagado / suma : 1;
        // Las líneas que llegan al MISMO artículo de una bodega se juntan en una sola entrada (un solo movimiento por artículo).
        for (let i = 0; i < lineas.length; i++) {
          const l = lineas[i], n = llegaron[i], a = l.articuloId ? artPorId(l.articuloId) : null;
          if (n < num(l.cantidad)) faltan.push(`${l.que}: ${n} de ${num(l.cantidad)}`);
          if (!a || n === 0) continue;
          const dest = valor('rb' + i), otra = dest !== peds[i], motivoBod = otra ? valor('rm' + i) : '';
          const unit = num(l.valor) > 0 && num(l.cantidad) > 0 ? Math.round(num(l.valor) * factor / num(l.cantidad)) : num(a.costo);
          const k = claveLlegada(a, dest).clave;
          if (!grupos.has(k)) grupos.set(k, { dest, i, partes: [] });
          grupos.get(k).partes.push({ i, l, a, n, unit, motivo: motivoBod });
          if (!llegoA.includes(dest)) llegoA.push(dest);
          if (otra) donde.push({ que: l.que, dest, ped: peds[i], motivo: motivoBod });
        }
        for (const g of grupos.values()) {
          const detalle = g.partes.length > 1 ? 'Junta ' + g.partes.map(p => `${p.l.que} (${p.n})`).join(' + ') : '';
          const r = entradaCompra(c, g.partes, g.dest, [valor('acNota'), ...g.partes.filter(p => p.n < num(p.l.cantidad)).map(p => g.partes.length > 1 ? `${p.l.que}: llegaron ${p.n} de ${num(p.l.cantidad)}` : `Llegaron ${p.n} de ${num(p.l.cantidad)}`), detalle].filter(Boolean).join('. '));
          if (r.error) return fallar(r.error, 'rb' + g.i);
          ops.push(...r.ops);
        }
        const nota = [valor('acNota'), faltan.length ? 'Llegó menos: ' + faltan.join('; ') : '', ...donde.map(o => `${o.que} llegó a ${o.dest} (se pidió para ${o.ped}): ${sinPunto(o.motivo)}`)].filter(Boolean).join('. ');
        const aBod = llegoA.length ? ` a ${llegoA.length > 1 ? 'las bodegas' : 'la bodega'} de ${llegoA.join(' y ')}` : '';
        return [['mezclar', 'compras', c.id, { estado: 'recibido', entregadoA: hayFuera ? valor('acQuien') : '', historial: paso(c, `Recibida${nota ? '. ' + nota : ''}`) }]].concat(ops,
          [c.pideRol !== 'asistente' ? aviso(c.pideRol, 'Llegó tu compra', recorta(`${c.que} ya llegó${aBod}.${donde.length ? ' ' + donde.map(o => `${o.que} se pidió para ${o.ped}: ${sinPunto(o.motivo)}.`).join(' ') : ''}`, 780)) : null],
          faltan.length ? [aviso('coordcompras', 'Llegó menos de lo comprado', `${c.que}. ${faltan.join('; ')}.`)] : []);
      }
    });
    // Al escoger otra bodega para una línea, aparece su porqué y se dice qué pasará allí.
    lineas.forEach((l, i) => {
      const sel = $('rb' + i); if (!sel) return;
      const a = artPorId(l.articuloId), mostrar = () => {
        const dest = sel.value, otra = dest !== peds[i], d = otra ? destinoLlegada(a, dest) : { art: a };
        $('rbBox' + i).hidden = !otra;
        $('rb' + i + 'Ay').textContent = !otra ? '' : d.error ? d.error : d.art ? `En ${dest} ya hay ${cantTxt(d.art.cantidad, d.art.unidad)}: se le suma lo que llegó.` : `En ${dest} todavía no está este artículo: se crea allí.`;
      };
      sel.addEventListener('change', mostrar);
    });
  }
  function recibirUno(c) {
    const a = c.articuloId ? artPorId(c.articuloId) : null;
    if (c.articuloId && !a) { A().toast('Ese artículo ya no existe en bodega.'); return; }
    const l = lineasDe(c)[0], ped = a ? bodegaLinea(l) || bodegaDe(a) : '';
    abrirAccion({
      titulo: a ? 'Recibir en bodega' : 'Marcar como recibida',
      sub: a ? `${c.que}: compradas ${cantTxt(c.cantidad, c.unidad)} en ${c.proveedor || 'el proveedor'}, para la bodega de ${ped}. Ahora hay ${cantTxt(a.cantidad, a.unidad)}.` : `${c.que}: no va a bodega. Se entrega a ${c.pide}.`,
      campos: (a ? campoNum('acCant', `Cantidad que llegó (${esH(a.unidad)})`, c.cantidad, 1, 99999, 'Si llegó menos de lo comprado, escribe lo que llegó.') + campoLlegada('acBodLlego', 'acMotivoBodBox', 'acMotivoBod', 'Llegó a la bodega', a, ped)
        : campoTxt('acQuien', 'A quién se entregó', c.pide, '', 60)) + campoTxt('acNota', 'Nota (opcional)', '', 'Ej: llegaron en buen estado', 160),
      primario: a ? 'Recibir en bodega' : 'Marcar como recibida', icono: 'caja', listo: a ? 'Listo: recibido en bodega. La cantidad ya se sumó.' : 'Listo: compra recibida y entregada.',
      ops: () => {
        if (!a) {
          if (!valor('acQuien')) return fallar('Escribe a quién se entregó.', 'acQuien');
          return [['mezclar', 'compras', c.id, { estado: 'recibido', entregadoA: valor('acQuien'), historial: paso(c, `Entregado a ${valor('acQuien')}${valor('acNota') ? '. ' + valor('acNota') : ''}`) }],
            aviso(c.pideRol, 'Llegó tu compra', `${c.que} ya llegó y se entregó a ${valor('acQuien')}.`)];
        }
        const act = artPorId(a.id) || a, n = entero('acCant'), dest = valor('acBodLlego') || ped, otra = dest !== ped, motivoBod = valor('acMotivoBod');
        if (!(n > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        if (!BODEGAS.includes(dest)) return fallar('Escoge a qué bodega llegó.', 'acBodLlego');
        if (otra && motivoBod.length < 5) return fallar('Escribe por qué llegó a otra bodega (lo verá quien pidió y queda en el registro).', 'acMotivoBod');
        // Cada unidad entra a lo que se pagó por ella (total pagado ÷ cantidad comprada) y el costo del artículo que recibe pasa a ser el promedio.
        const unit = num(c.valorReal) > 0 && num(c.cantidad) > 0 ? Math.round(num(c.valorReal) / num(c.cantidad)) : num(act.costo);
        const nota = [valor('acNota'), n < num(c.cantidad) ? `Llegaron ${n} de ${num(c.cantidad)}` : ''].filter(Boolean).join('. ');
        const r = entradaCompra(c, [{ l, a: act, n, unit, motivo: otra ? motivoBod : '' }], dest, nota);
        if (r.error) return fallar(r.error, 'acBodLlego');
        accion.listo = otra ? `Listo: recibido en la bodega de ${dest}. La cantidad ya se sumó allí.` : 'Listo: recibido en bodega. La cantidad ya se sumó.';
        return [
          ['mezclar', 'compras', c.id, { estado: 'recibido', historial: paso(c, `Recibido en bodega: ${cantTxt(n, a.unidad)}${otra ? `. Llegó a ${dest} (se pidió para ${ped}): ${sinPunto(motivoBod)}` : ''}${nota ? '. ' + nota : ''}`) }],
          ...r.ops,
          c.pideRol !== 'asistente' ? aviso(c.pideRol, 'Llegó tu compra', recorta(`${c.que} ya está en la bodega de ${dest}${otra ? ` (se pidió para ${ped}). ${sinPunto(motivoBod)}.` : '.'}`, 780)) : null,
          n < num(c.cantidad) ? aviso('coordcompras', 'Llegó menos de lo comprado', `${c.que}: llegaron ${n} de ${num(c.cantidad)}.`) : null
        ];
      }
    });
    if (a) {
      const sel = $('acBodLlego');
      sel.addEventListener('change', () => {
        const dest = sel.value, otra = dest !== ped, d = otra ? destinoLlegada(a, dest) : { art: a };
        $('acMotivoBodBox').hidden = !otra;
        $('acBodLlegoAy').textContent = !otra ? '' : d.error ? d.error : d.art ? `En ${dest} ya hay ${cantTxt(d.art.cantidad, d.art.unidad)}: se le suma lo que llegó.` : `En ${dest} todavía no está este artículo: se crea allí.`;
      });
    }
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
    if (['autorizado', 'comprado'].includes(c.estado)) botones.push(boton('imprimirorden', 'Orden de compra (imprimir o PDF)', 'pdf', ` data-id="${esH(c.id)}"`, 'small'));
    if (c.estado === 'comprado' && puedoHacer('asistente')) botones.push(boton('recibir', textoRecibir(c), 'caja', ` data-id="${esH(c.id)}"`, 'primary small'));
    if (c.estado === 'sin-autorizar' && !c.revisada && (esCoordinador() || esGerenteGeneral())) botones.push(boton('revisada', 'Marcar como revisada', 'check', ` data-id="${esH(c.id)}"`, 'small'));
    const hist = historial(c).sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)));
    const solDe = c.solicitudId ? D().solicitudes.find(x => x.id === c.solicitudId) || null : null;
    // Lo que entró a bodega con esta compra (quien no ve los movimientos de la bodega no lo ve): cada uno con su bodega y, si llegó a otra, por qué.
    const movsC = veMovs() ? D().movimientos.filter(m => m.compraId === c.id).sort((x, y) => String(x.fecha).localeCompare(String(y.fecha))) : [];
    const htmlMovs = movsC.length ? `<div class="section-label">Lo que entró a bodega</div><ol class="linea">${movsC.map(m => {
      const mia = bodegaMov(m), ped = bodegaPedidaMov(m);
      return `<li><b>${esH(signoMov(m) + ' · ' + m.articulo)}</b><span class="meta">${esH([`quedan ${num(m.saldo)}`, ped && ped !== mia ? `se pidió para ${ped}` : '', m.motivoBodega ? `por qué llegó a otra bodega: ${m.motivoBodega}` : '', `${m.por} ${App.hace(m.fecha)}`].filter(Boolean).join(' · '))}</span>${mia ? `<span class="docs">${pillBod(mia)}</span>` : ''}</li>`;
    }).join('')}</ol>` : '';
    if (solDe) botones.push(boton('versol', 'Ver el pedido', '', ` data-id="${esH(solDe.id)}"`, 'ghost small'));
    abrirAccion({
      titulo: c.que, sub: `${lineasDe(c).length > 1 ? lineasDe(c).length + ' artículos' : cantTxt(c.cantidad, c.unidad)} · ${c.categoria}`,
      campos: `<div class="row">${App.pill(e[0], e[1])}${esPorAutorizar(c) ? App.pill('Le toca a ' + nombreRol(autorizadorDe(c)), 'none', 'persona') : ''}${sobre ? App.pill(`Pagó ${sobre.pct} % más de lo autorizado`, 's-peligro', 'aviso') : ''}${c.pideRol === 'gerente' ? App.pill('La pidió el Gerente', 's-pend', 'info') : ''}</div>
        ${detalleCompra(c, esPorAutorizar(c), ['comprado', 'recibido'].includes(c.estado) && num(c.valorReal) > 0 ? cuadroCompra(c) : '')}
        <dl class="datos">
          ${num(c.valorReal) ? `<dt>Pagado</dt><dd>${esH(App.cop(c.valorReal))}${sobre ? ' (' + esH(String(sobre.pct)) + ' % más)' : ''}</dd>` : ''}
          ${c.autorizaJefe ? `<dt>Primero autorizó</dt><dd>${esH(c.autorizaJefe)}</dd>` : ''}
          ${c.autoriza ? `<dt>${esPorAutorizar(c) ? 'Autoriza' : 'Decidió'}</dt><dd>${esH(c.autoriza)}</dd>` : ''}
          ${c.proveedor ? `<dt>Proveedor</dt><dd>${esH(c.proveedor)}${c.fechaCompra ? ', ' + esH(App.fechaCorta(c.fechaCompra)) : ''}</dd>` : ''}
          ${c.motivoRechazo ? `<dt>Motivo</dt><dd>${esH(c.motivoRechazo)}</dd>` : ''}
          ${c.entregadoA ? `<dt>Entregado a</dt><dd>${esH(c.entregadoA)}</dd>` : ''}
          ${c.solicitudId ? `<dt>Salió del pedido</dt><dd>${solDe ? esH(`${solDe.pide} pidió ${cantTxt(solDe.cantidad, (artPorId(solDe.articuloId) || {}).unidad)} de ${solDe.articulo} (${App.hace(solDe.fecha)})`) : 'Un pedido de material'}</dd>` : ''}
        </dl>
        ${htmlMovs}
        ${/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(typeof c.factura === 'string' ? c.factura : '') ? `<div class="field"><span class="lbl">Foto de la factura</span><img class="factura" src="${esH(c.factura)}" alt="Foto de la factura de ${esH(c.que)}"></div>` : ''}
        ${botones.length ? `<div class="tarea-pie">${botones.join('')}</div>` : ''}
        <div class="section-label">Cómo va</div>
        <ol class="linea">${hist.length ? hist.map(h => `<li><b>${esH(h.texto)}</b><span class="meta">${esH(h.por)} · ${esH(App.hace(h.fecha))}</span></li>`).join('') : '<li><span class="meta">Sin historial.</span></li>'}</ol>`
    });
  }

  /* ---------- proveedores: ficha, agregar, editar y borrar ---------- */
  function verProv(p) {
    const App = A(), st = statsProv(p), precios = preciosProv(st.cs);
    const botones = [];
    if (gestionaProv()) botones.push(boton('editprov', 'Editar', 'lapiz', ` data-id="${esH(p.id)}"`));
    if (esJefe() && !st.n) botones.push(boton('borrarprov', 'Borrar', 'borrar', ` data-id="${esH(p.id)}"`, 'ghost small'));
    const cambio = x => { if (!x.previo) return '<span class="meta">Una sola compra</span>'; const pct = Math.round((x.cada / x.previo - 1) * 100);
      return pct > 0 ? `<span class="err-txt">Subió ${pct} %</span><span class="meta">antes ${esH(App.cop(x.previo))}</span>` : pct < 0 ? `<span>Bajó ${-pct} %</span><span class="meta">antes ${esH(App.cop(x.previo))}</span>` : `<span class="meta">Igual que antes</span>`; };
    abrirAccion({
      titulo: p.nombre, sub: p.nit ? 'Proveedor' : 'Proveedor · sin NIT anotado',
      campos: `<dl class="datos">${p.nit ? `<dt>NIT</dt><dd><span class="serial-chip">${esH(p.nit)}</span></dd>` : ''}${p.contacto ? `<dt>Contacto</dt><dd>${esH(p.contacto)}</dd>` : ''}${p.telefono ? `<dt>Teléfono</dt><dd>${esH(p.telefono)}</dd>` : ''}${p.correo ? `<dt>Correo</dt><dd>${esH(p.correo)}</dd>` : ''}${p.nota ? `<dt>Nota</dt><dd>${esH(p.nota)}</dd>` : ''}
          <dt>Compras hechas</dt><dd><b>${esH(String(st.n))}</b>${st.ultima ? `<span class="meta"> · la última el ${esH(App.fechaCorta(st.ultima))}</span>` : ''}</dd><dt>Este año</dt><dd><b>${esH(App.cop(st.anio))}</b></dd></dl>
        ${botones.length ? `<div class="tarea-pie">${botones.join('')}</div>` : ''}
        <div class="section-label">Último precio por artículo</div>
        ${precios.length ? `<table class="lineas-tabla"><thead><tr><th>Artículo</th><th>Cada uno</th><th>Cambio</th></tr></thead><tbody>${precios.map(x => `<tr><td><b>${esH(x.que)}</b><span class="meta">${esH(App.fechaCorta(x.fecha))}</span></td><td>${esH(App.cop(x.cada))}</td><td>${cambio(x)}</td></tr>`).join('')}</tbody></table>
        <p class="meta">Lo pagado se anota por toda la compra; en las de varios artículos se reparte según lo que valía cada uno al pedirlo.</p>` : '<p class="meta">Todavía no hay compras con precio.</p>'}
        <div class="section-label">Compras hechas${st.n ? ` (${st.n})` : ''}</div>
        ${st.n ? `<ol class="linea">${st.cs.slice(0, 8).map(c => `<li><b>${esH(c.que)} · ${esH(App.cop(c.valorReal))}</b><span class="meta">${esH([App.fechaCorta(c.fechaCompra), (EST_CO[c.estado] || [''])[0], 'pidió ' + c.pide].filter(Boolean).join(' · '))}</span></li>`).join('')}</ol>${st.n > 8 ? `<p class="meta">Se ven las 8 más nuevas. Todas están en Compras.</p>` : ''}` : '<p class="meta">Todavía no se le ha comprado nada.</p>'}`
    });
  }
  function formProv(p) {
    const nuevoP = !p;
    abrirAccion({
      titulo: nuevoP ? 'Agregar proveedor' : 'Editar proveedor', sub: nuevoP ? 'Con el nombre basta; lo demás se puede completar después.' : `Cambia los datos de ${p.nombre}. Las compras que ya se le hicieron siguen siendo suyas.`,
      campos: campoTxt('pvNombre', 'Nombre', p ? p.nombre : '', 'Ej: Ferretería El Faro', 80) +
        `<div class="field"><label for="pvNit">NIT con su dígito (opcional)</label><input id="pvNit" type="text" inputmode="numeric" maxlength="20" autocomplete="off" value="${esH(p ? p.nit || '' : '')}" placeholder="Ej: 900000001-2"><span class="meta">Sin puntos, con un guion y el dígito de verificación. La app revisa que el dígito esté bien.</span></div>` +
        campoTxt('pvContacto', 'Persona de contacto (opcional)', p ? p.contacto : '', 'Nombre', 60) +
        `<div class="fields cols">${campoTxt('pvTel', 'Teléfono (opcional)', p ? p.telefono : '', 'Ej: 300 000 0000', 25)}${campoTxt('pvCorreo', 'Correo (opcional)', p ? p.correo : '', 'Ej: ventas@ejemplo.com', 80)}</div>` +
        campoTxt('pvNota', 'Nota (opcional)', p ? p.nota : '', 'Ej: entrega en 2 días, fía a 30', 200),
      primario: nuevoP ? 'Agregar' : 'Guardar cambios', icono: 'check', listo: nuevoP ? 'Listo: proveedor agregado.' : 'Listo: proveedor actualizado.',
      ops: () => {
        const nom = valor('pvNombre'), tel = valor('pvTel'), correo = valor('pvCorreo');
        if (nom.length < 2) return fallar('Escribe el nombre del proveedor.', 'pvNombre');
        const igual = provs().find(x => (!p || x.id !== p.id) && normNom(x.nombre) === normNom(nom));
        if (igual) return fallar(`Ya hay un proveedor llamado «${igual.nombre}».`, 'pvNombre');
        const n = leerNit(valor('pvNit'));
        if (n.error) return fallar(n.error, 'pvNit');
        const dueno = n.nit && provs().find(x => (!p || x.id !== p.id) && x.nit && nitSolo(x.nit) === nitSolo(n.nit));
        if (dueno) return fallar(`Ese NIT ya lo tiene «${dueno.nombre}».`, 'pvNit');
        if (!/^[0-9 +()-]*$/.test(tel)) return fallar('El teléfono lleva solo números, espacios, + o guiones.', 'pvTel');
        if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return fallar('Ese correo no está bien escrito.', 'pvCorreo');
        const datos = { nombre: nom, nit: n.nit, contacto: valor('pvContacto'), telefono: tel, correo, nota: valor('pvNota') };
        if (p) return [['mezclar', 'proveedores', p.id, datos]];
        return [['set', 'proveedores', window.nube.idNuevo('pv'), Object.assign(datos, { por: persona().nombre, porRol: persona().rol, en: A().hoyISO() })]];
      }
    });
  }
  function borrarProv(p) {
    abrirAccion({
      titulo: 'Borrar proveedor', sub: `${p.nombre} no tiene compras. Si lo borras, se pierden sus datos de contacto.`,
      campos: '<div class="note">Un proveedor con compras no se puede borrar: así no se pierde de dónde salió lo que se compró.</div>',
      primario: 'Borrar el proveedor', icono: 'borrar', listo: 'Listo: proveedor borrado.',
      ops: () => (comprasDe(p).length ? fallar('Ya tiene compras: no se puede borrar.') : [['borrar', 'proveedores', p.id]])
    });
  }

  /* ---------- acciones: bodega ---------- */
  /** Entregar un pedido. La bodega que entrega se escoge («Sale de la bodega»): propone la que se pidió si alcanza; si no, la primera que alcanza y, si ninguna, la que más tiene.
      Si sale de una bodega distinta a la pedida, hay que escribir por qué (lo ve quien pidió y queda en el pedido y en el movimiento). `desdeId`: el artículo de la bodega que ya viene escogida. */
  function entregar(s, desdeId) {
    const d = dondeSol(s);
    if (!d) { A().toast('Ese artículo ya no existe en bodega.'); return; }
    const { a, todos, ped } = d, pedido = num(s.cantidad);
    if (!todos.some(x => num(x.cantidad) > 0)) { A().toast(`No hay ${a.nombre} en ninguna bodega. Pide la compra o cierra el pedido con «No entregar».`); return; }
    const dado = desdeId ? todos.find(x => x.id === desdeId) : null;
    const inicial = dado || (d.propio && num(d.propio.cantidad) >= pedido ? d.propio : null) || todos.find(x => num(x.cantidad) >= pedido) || todos.reduce((m, x) => (num(x.cantidad) > num(m.cantidad) ? x : m), todos[0]);
    // El texto que ya viene escrito cuando sale de otra bodega: no había o no alcanzaba en la que se pidió.
    const motivoPre = x => (bodegaDe(x) === ped || d.hayPed >= pedido ? '' : `En ${ped} ${d.hayPed > 0 ? 'no alcanzaba' : 'no había'}`);
    const maxDe = x => num(x.cantidad), ayudaMax = x => `Máximo ${maxDe(x)}: lo que hay en la bodega de ${bodegaDe(x)}.`;
    const opsDesde = todos.map(x => [x.id, `${bodegaDe(x)} · ${num(x.cantidad) > 0 ? 'hay ' + cantTxt(x.cantidad, x.unidad) : 'agotado'}${bodegaDe(x) === ped ? ' (la que pidió)' : ''}`]);
    abrirAccion({
      titulo: 'Entregar material', sub: `${s.pide} pidió ${cantTxt(pedido, a.unidad)} de ${a.nombre} para la bodega de ${ped}.`,
      campos: campoSel('acDesde', 'Sale de la bodega', opsDesde, inicial.id) +
        `<div id="acMotivoBodBox"${bodegaDe(inicial) === ped ? ' hidden' : ''}>${campoTxt('acMotivoBod', '¿Por qué sale de otra bodega?', motivoPre(inicial), 'Ej: En ' + ped + ' no había', 160)}<span class="meta">Lo verá quien pidió y queda en el registro.</span></div>` +
        campoNum('acCant', `Cantidad que entregas (${esH(a.unidad)})`, Math.min(pedido, maxDe(inicial)), 1, maxDe(inicial), ayudaMax(inicial)) +
        campoSel('acProy', 'Proyecto', PROYECTOS.map(p => [p, p]), PROYECTOS.includes(s.proyecto) ? s.proyecto : PROYECTOS[0]),
      primario: 'Entregar', icono: 'entrega', listo: `Listo: entregado a ${s.pide}. Ya se restó de la bodega.`,
      ops: () => {
        const desde = artPorId(valor('acDesde')), n = entero('acCant');
        if (!desde || !todos.some(x => x.id === desde.id)) return fallar('Escoge de qué bodega sale.', 'acDesde');
        // La cantidad se vuelve a leer aquí: otra persona pudo sacar mientras la hoja estaba abierta.
        const bod = bodegaDe(desde), otra = bod !== ped, hay = num(desde.cantidad), motivoBod = valor('acMotivoBod');
        if (!(n > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        if (n > hay) return fallar(`Solo hay ${cantTxt(hay, desde.unidad)} en la bodega de ${bod}.`, 'acCant');
        if (otra && motivoBod.length < 5) return fallar('Escribe por qué sale de otra bodega (lo verá quien pidió y queda en el registro).', 'acMotivoBod');
        const parcial = n < pedido ? `Se entregaron ${n} de ${pedido}` : '';
        accion.listo = otra ? `Listo: entregado a ${s.pide}. Salió de la bodega de ${bod} y ya se restó de ahí.` : `Listo: entregado a ${s.pide}. Ya se restó de la bodega.`;
        const datosSol = { estado: 'entregada', entregadaPor: persona().nombre, fechaEntrega: ahora(), motivo: parcial, bodegaSurte: bod, articuloSurteId: desde.id };
        if (otra) datosSol.motivoBodega = motivoBod;
        const datosMov = { articuloId: desde.id, articulo: desde.nombre, tipo: 'salida', motivo: 'entrega', cantidad: n, saldo: hay - n, persona: s.pide, proyecto: valor('acProy'), nota: parcial, solicitudId: s.id };
        if (otra) Object.assign(datosMov, { bodegaPedida: ped, motivoBodega: motivoBod });   // el movimiento queda en la bodega que entrega (mover() pone `bodega`)
        return [
          ['mezclar', 'solicitudes', s.id, datosSol],
          ...mover(desde, -n, datosMov),
          aviso(s.pideRol, 'Tu pedido está listo', otra
            ? `${persona().nombre} te entregó ${cantTxt(n, desde.unidad)} de ${desde.nombre}: salió de la bodega de ${bod} (pediste para ${ped}). ${sinPunto(motivoBod)}.`
            : `${persona().nombre} te entregó ${cantTxt(n, desde.unidad)} de ${desde.nombre} (bodega ${bod}).`)
        ];
      }
    });
    // Al escoger otra bodega cambian el máximo y el texto del porqué (si todavía es el que venía escrito).
    let pre = motivoPre(inicial);
    $('acDesde').addEventListener('change', () => {
      const x = artPorId(valor('acDesde')); if (!x) return;
      const otra = bodegaDe(x) !== ped, c = $('acCant');
      $('acMotivoBodBox').hidden = !otra;
      if (otra && (!valor('acMotivoBod') || valor('acMotivoBod') === pre)) $('acMotivoBod').value = motivoPre(x);
      pre = motivoPre(x);
      c.max = maxDe(x); c.value = Math.min(pedido, maxDe(x)) || 1;
      if ($('acCantAy')) $('acCantAy').textContent = ayudaMax(x);
    });
  }
  function noEntregar(s) {
    abrirAccion({
      titulo: 'No entregar', sub: `${s.pide} pidió ${s.articulo}: ${num(s.cantidad)}.`,
      campos: campoTxt('acMotivo', 'Motivo (lo verá quien pidió)', '', 'Ej: no hay; ya se pidió la compra', 160),
      primario: 'No entregar', listo: 'Listo: pedido cerrado sin entregar.',
      ops: () => {
        if (!valor('acMotivo')) return fallar('Escribe el motivo.', 'acMotivo');
        return [['mezclar', 'solicitudes', s.id, { estado: 'rechazada', entregadaPor: persona().nombre, fechaEntrega: ahora(), motivo: valor('acMotivo') }],
          aviso(s.pideRol, 'Tu pedido no se entregó', `${s.articulo}: ${valor('acMotivo')}.`)];
      }
    });
  }
  /* «Pedir material»: primero se escoge para qué bodega y luego el artículo. La última bodega se recuerda en el teléfono (solo una comodidad: si no se puede guardar, se pregunta de nuevo). */
  const LS_BODEGA = 'inv.miBodega';
  const leerMiBodega = () => { try { const b = localStorage.getItem(LS_BODEGA); return BODEGAS.includes(b) ? b : ''; } catch (e) { return ''; } };
  const guardarMiBodega = b => { try { localStorage.setItem(LS_BODEGA, b); } catch (e) { /* sin guardar: no pasa nada */ } };
  /** Los artículos para un pedido «para la bodega X»: los de X y, aparte, los que X no tiene y alguna otra bodega sí (uno por artículo: el de la bodega que más tiene). */
  const opcionesPedido = bod => {
    const porNombre = (x, y) => String(x.nombre).localeCompare(String(y.nombre));
    const propios = articulos().filter(a => bodegaDe(a) === bod).sort(porNombre), otros = [];
    articulos().filter(a => bodegaDe(a) !== bod && !propios.some(p => mismoArt(p, a))).forEach(a => {
      const i = otros.findIndex(o => mismoArt(o, a));
      if (i < 0) otros.push(a); else if (num(a.cantidad) > num(otros[i].cantidad)) otros[i] = a;
    });
    return { propios, otros: otros.sort(porNombre) };
  };
  const htmlOpcionesPedido = (bod, v) => {
    const { propios, otros } = opcionesPedido(bod);
    const op = (a, conBodega) => `<option value="${esH(a.id)}"${a.id === v ? ' selected' : ''}>${esH(`${a.nombre}${conBodega ? ' · ' + bodegaDe(a) : ''} (${num(a.cantidad) > 0 ? 'hay ' + cantTxt(a.cantidad, a.unidad) : 'agotado'})`)}</option>`;
    return (propios.length ? `<optgroup label="${esH('Bodega de ' + bod)}">${propios.map(a => op(a, false)).join('')}</optgroup>` : '')
      + (otros.length ? `<optgroup label="Solo en otras bodegas">${otros.map(a => op(a, true)).join('')}</optgroup>` : '');
  };
  function pedirMaterial(artId) {
    if (!articulos().length) { A().toast('Todavía no hay artículos en bodega.'); return; }
    const a0 = artId ? artPorId(artId) : null, bod0 = a0 ? bodegaDe(a0) : (leerMiBodega() || BODEGAS[0]);
    const primero = x => { const o = opcionesPedido(x); return (o.propios[0] || o.otros[0] || {}).id || ''; };
    const ayudaArt = () => { const x = artPorId(valor('acArt')); return x && bodegaDe(x) !== valor('acBod') ? `Ese artículo no está en la bodega de ${valor('acBod')}: quien entrega lo sacará de ${bodegaDe(x)} y dejará escrito por qué.` : ''; };
    abrirAccion({
      titulo: 'Pedir material de bodega', sub: `Le llega el aviso a ${nombreRol('asistente')} y te avisa cuando lo entregue.`,
      campos: campoSel('acBod', '¿Para qué bodega?', BODEGAS.map(b => [b, b]), bod0) +
        `<div class="field"><label for="acArt">Artículo</label><select id="acArt">${htmlOpcionesPedido(bod0, a0 ? a0.id : primero(bod0))}</select><span class="meta" id="acArtAy"></span></div>` +
        campoNum('acCant', 'Cantidad', 1, 1, 999) +
        campoTxt('acPara', 'Para qué', '', 'Ej: viaje a la Comunidad Ejemplo Norte', 120) + campoSel('acProy', 'Proyecto', PROYECTOS.map(p => [p, p]), PROYECTOS[0]),
      primario: 'Pedir', icono: 'enviar', listo: `Listo: pedido enviado. Le llegó el aviso a ${nombreRol('asistente')}.`,
      ops: () => {
        const a = artPorId(valor('acArt')), n = entero('acCant'), bod = valor('acBod');
        if (!BODEGAS.includes(bod)) return fallar('Escoge para qué bodega es el pedido.', 'acBod');
        if (!a) return fallar('Escoge un artículo.', 'acArt');
        if (!(n > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        if (!valor('acPara')) return fallar('Escribe para qué lo necesitas.', 'acPara');
        guardarMiBodega(bod);
        return [
          ['set', 'solicitudes', window.nube.idNuevo('so'), { articuloId: a.id, articulo: a.nombre, cantidad: n, pide: persona().nombre, pideRol: persona().rol, paraQue: valor('acPara'), proyecto: valor('acProy'), estado: 'pendiente', fecha: ahora(), entregadaPor: '', fechaEntrega: '', motivo: '', bodega: bod, pideUid: window.nube.uid() }],
          aviso('asistente', 'Nuevo pedido de material', `${persona().nombre} pide ${cantTxt(n, a.unidad)} de ${a.nombre} para la bodega de ${bod}${bodegaDe(a) !== bod ? ` (el artículo está en ${bodegaDe(a)})` : ''}.`)
        ];
      }
    });
    $('acArtAy').textContent = ayudaArt();
    // Al cambiar de bodega, la lista pasa a ser la de esa bodega (y se queda el mismo artículo si también lo tiene).
    $('acBod').addEventListener('change', () => {
      const x = artPorId(valor('acArt')), bod = valor('acBod'), o = opcionesPedido(bod);
      const igual = x ? (o.propios.find(p => mismoArt(p, x)) || o.otros.find(p => mismoArt(p, x))) : null;
      $('acArt').innerHTML = htmlOpcionesPedido(bod, igual ? igual.id : primero(bod));
      $('acArtAy').textContent = ayudaArt();
    });
    $('acArt').addEventListener('change', () => { $('acArtAy').textContent = ayudaArt(); });
  }
  /** Primer paso de «Registrar entrada»: ¿qué está entrando? Una devolución o una compra que llegó. */
  function entradaPaso1(artId) {
    const idA = artId ? ` data-id="${esH(artId)}"` : '';
    abrirAccion({
      titulo: 'Registrar entrada', sub: '¿Qué está entrando a la bodega?',
      campos: `<div class="list">${boton('entdev', 'Es una devolución', 'importar', idA, 'primary')}${boton('entcompra', 'Llegó una compra', 'caja', '', 'primary')}</div>
        <p class="meta">Una compra se recibe aparte porque queda atada a su pedido: se suma lo que llegó y se avisa si llegó menos.</p>`
    });
  }
  /** Segundo paso: las compras ya hechas que faltan por recibir; cada una se recibe con su propio formulario. */
  function entradaCompras() {
    const lista = D().compras.filter(c => c.estado === 'comprado');
    abrirAccion({
      titulo: 'Llegó una compra', sub: lista.length ? 'Escoge la compra que llegó. Ahí escribes cuánto llegó de cada cosa.' : 'Ahora no hay compras por recibir. Cuando alguien registre una compra, aparece aquí.',
      campos: lista.length ? `<div class="list">${lista.map(c => `<div class="card"><b>${esH(c.que)}</b><span class="meta">${esH(['comprada en ' + (c.proveedor || 'el proveedor'), 'pidió ' + c.pide].join(' · '))}</span>${bodegasCompra(c).length ? `<span class="docs">${bodegasCompra(c).map(pillBod).join('')}</span>` : ''}${boton('recibir', textoRecibir(c), 'caja', ` data-id="${esH(c.id)}"`, 'primary small')}</div>`).join('')}</div>` : ''
    });
  }
  function entradaSalida(tipo, artId, directo) {
    const entrada = tipo === 'entrada';
    if (entrada && !directo) { entradaPaso1(artId); return; }
    // Primero la bodega y luego los artículos de esa bodega (cada una tiene su propia cantidad).
    const a0 = artId ? artPorId(artId) : null, bod0 = a0 ? bodegaDe(a0) : (BODEGAS.includes(sub.bodega) ? sub.bodega : BODEGAS[0]);
    abrirAccion({
      titulo: entrada ? 'Registrar entrada' : 'Registrar salida',
      sub: entrada ? 'Para lo que vuelve a la bodega (devoluciones).' : 'Para lo que sale sin pedido en la app: entrega directa, o algo dañado o perdido.',
      campos: campoSel('acBod', 'Bodega', BODEGAS.map(b => [b, b]), bod0) + campoSel('acArt', 'Artículo', opsArtBod(bod0), a0 ? a0.id : (opsArtBod(bod0)[0] || [''])[0]) + campoNum('acCant', 'Cantidad', 1, 1, 99999) +
        (entrada ? campoTxt('acPersona', 'Quién lo devolvió', '', 'Nombre', 60)
          : campoSel('acMotivoMov', 'Motivo', [['entrega', 'Entrega a una persona'], ['dano', 'Daño o pérdida']], 'entrega') + campoTxt('acPersona', 'A quién se entregó', '', 'Nombre (si es entrega)', 60)) +
        campoSel('acProy', 'Proyecto', [['', 'Sin proyecto']].concat(PROYECTOS.map(p => [p, p])), '') + campoTxt('acNota', entrada ? 'Nota (opcional)' : 'Nota (obligatoria si es daño o pérdida)', '', 'Ej: llegó con la caja rota', 160),
      primario: entrada ? 'Registrar entrada' : 'Registrar salida', icono: entrada ? 'importar' : 'entrega',
      listo: entrada ? 'Listo: entrada registrada. Ya se sumó a la bodega.' : 'Listo: salida registrada. Ya se restó de la bodega.',
      ops: () => {
        const a = artPorId(valor('acArt')), n = entero('acCant');
        if (!a) return fallar('Escoge un artículo.', 'acArt');
        if (bodegaDe(a) !== valor('acBod')) return fallar('Escoge un artículo de esa bodega.', 'acArt');
        if (!(n > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        const hay = num(a.cantidad), motivo = entrada ? 'devolucion' : valor('acMotivoMov');
        if (!entrada && n > hay) return fallar(`Solo hay ${cantTxt(hay, a.unidad)} en bodega.`, 'acCant');
        if (entrada && !valor('acPersona')) return fallar('Escribe quién lo devolvió.', 'acPersona');
        if (motivo === 'entrega' && !valor('acPersona')) return fallar('Escribe a quién se entregó.', 'acPersona');
        if (motivo === 'dano' && !valor('acNota')) return fallar('Escribe qué pasó en la nota.', 'acNota');
        return [
          ...mover(a, entrada ? n : -n, { articuloId: a.id, articulo: a.nombre, tipo: entrada ? 'entrada' : 'salida', motivo, cantidad: n, saldo: entrada ? hay + n : hay - n, persona: valor('acPersona'), proyecto: valor('acProy'), nota: valor('acNota') }),
          motivo === 'dano' ? aviso('jefe', 'Material dañado o perdido', `${persona().nombre} registró ${cantTxt(n, a.unidad)} de ${a.nombre} (bodega ${bodegaDe(a)}) como daño o pérdida: ${valor('acNota')}.`) : null
        ];
      }
    });
    // Al cambiar de bodega, la lista de artículos pasa a ser la de esa bodega.
    $('acBod').addEventListener('change', () => { $('acArt').innerHTML = optionsHtml(opsArtBod(valor('acBod')), ''); });
  }
  function editarArticulo(a) {
    const nuevo = !a;
    abrirAccion({
      titulo: nuevo ? 'Agregar artículo' : 'Editar artículo', sub: nuevo ? 'Un artículo nuevo para una de las 3 bodegas.' : `Cambia los datos de ${a.nombre} (bodega ${bodegaDe(a)}). La cantidad se cambia con entradas, salidas o conteo, y de bodega con un traslado.`,
      campos: (nuevo ? campoSel('acBod', 'Bodega', BODEGAS.map(b => [b, b]), BODEGAS.includes(sub.bodega) ? sub.bodega : BODEGAS[0]) : '') +
        campoTxt('acNom', 'Nombre', a ? a.nombre : '', 'Ej: guantes de nitrilo talla M', 80) +
        `<div class="field"><label for="acCodigo">Código de barras o el que tú uses (opcional)</label><div class="con-scan"><input id="acCodigo" type="text" maxlength="30" autocomplete="off" value="${esH(a ? a.codigo || '' : '')}" placeholder="Ej: BOT042 o el de la etiqueta"><button type="button" class="btn-scan" data-accion="escancodigo" data-id="" aria-label="Escanear el código con la cámara" title="Escanear el código"><span data-ico="codigo"></span></button></div><span class="meta">De 3 a 30 letras o números, sin espacios ni guiones. Con él se encuentra el artículo escaneándolo.</span></div>` +
        `<div class="fields cols">${campoSel('acCat', 'Categoría', CATEGORIAS.map(x => [x, x]), a && CATEGORIAS.includes(a.categoria) ? a.categoria : 'EPP')}${campoSel('acUni', 'Unidad', UNIDADES.map(u => [u, u]), a ? a.unidad : 'unidades')}</div>` +
        (nuevo ? campoNum('acCantIni', 'Cantidad que hay ahora', 0, 0, 99999) : '') +
        `<div class="fields cols">${campoNum('acMin', 'Mínimo (avisa al bajar de aquí)', a ? a.minimo : 2, 0, 99999)}${campoNum('acMax', 'Máximo (hasta dónde se compra)', a ? a.maximo : 10, 1, 99999)}</div>` +
        campoTxt('acUbi', 'Ubicación dentro de la bodega', a ? a.ubicacion : 'Estante ', 'Ej: Estante B1', 80) +
        `<div class="fields cols">${campoNum('acCosto', 'Precio aprox. por unidad (pesos)', a ? a.costo : '', 0, null)}${campoProv('acProvH', 'Proveedor habitual', a ? a.proveedor : '', 'Ej: Ferretería El Faro', 60)}</div>`,
      primario: nuevo ? 'Agregar' : 'Guardar cambios', icono: 'check', listo: nuevo ? 'Listo: artículo agregado a la bodega.' : 'Listo: artículo actualizado.',
      ops: () => {
        const mn = entero('acMin'), mx = entero('acMax'), costo = entero('acCosto'), ini = nuevo ? entero('acCantIni') : 0;
        if (!valor('acNom')) return fallar('Escribe el nombre.', 'acNom');
        const cod = valor('acCodigo').toUpperCase();
        if (cod && !/^[A-Z0-9]{3,30}$/.test(cod)) return fallar('El código lleva de 3 a 30 letras o números, sin espacios ni guiones.', 'acCodigo');
        const bod = nuevo ? valor('acBod') : bodegaDe(a);
        if (!BODEGAS.includes(bod)) return fallar('Escoge una de las 3 bodegas.', 'acBod');
        if (articulos().some(x => String(x.nombre).toLowerCase() === valor('acNom').toLowerCase() && bodegaDe(x) === bod && (!a || x.id !== a.id))) return fallar(`Ya hay un artículo con ese nombre en la bodega de ${bod}.`, 'acNom');
        const dueno = cod && articulos().find(x => x.codigo && normCod(x.codigo) === cod && bodegaDe(x) === bod && (!a || x.id !== a.id));
        if (dueno) return fallar(`Ese código ya lo tiene «${dueno.nombre}» en la bodega de ${bod}.`, 'acCodigo');
        if (!(mn >= 0)) return fallar('El mínimo debe ser un número entero, 0 o más.', 'acMin');
        if (!(mx > mn)) return fallar('El máximo debe ser mayor que el mínimo.', 'acMax');
        if (!(costo >= 0)) return fallar('Escribe el precio en pesos, sin puntos ni comas.', 'acCosto');
        if (nuevo && !(ini >= 0)) return fallar('La cantidad debe ser un número entero, 0 o más.', 'acCantIni');
        const datos = { nombre: valor('acNom'), codigo: cod, categoria: valor('acCat'), unidad: valor('acUni'), minimo: mn, maximo: mx, ubicacion: valor('acUbi'), costo, proveedor: valor('acProvH') };
        if (!nuevo) {
          if (costo === num(a.costo)) return [['mezclar', 'articulos', a.id, datos]];
          // El precio es el costo promedio del kárdex: cambiarlo a mano deja un ajuste de valor (cantidad 0) con el precio de antes y el de ahora.
          const movId = window.nube.idNuevo('mo');
          return [['mezclar', 'articulos', a.id, Object.assign({ ultimoMov: movId }, datos)],
            movimiento({ bodega: bodegaDe(a), costoUnit: costo, articuloId: a.id, articulo: datos.nombre, tipo: 'ajuste', motivo: 'precio', cantidad: 0, saldo: num(a.cantidad), nota: `Cambió el precio de ${A().cop(num(a.costo))} a ${A().cop(costo)}` }, movId)];
        }
        datos.bodega = bod;
        const id = window.nube.idNuevo('ar');
        const movId = window.nube.idNuevo('mo');
        return [['set', 'articulos', id, Object.assign({ cantidad: ini }, ini > 0 ? { ultimoMov: movId } : {}, datos)],
          ini > 0 ? movimiento({ bodega: bod, costoUnit: datos.costo, articuloId: id, articulo: datos.nombre, tipo: 'entrada', motivo: 'inicial', cantidad: ini, saldo: ini, nota: 'Artículo nuevo' }, movId) : null];
      }
    });
  }
  /** Traslado entre bodegas: sale de la bodega de origen y entra a la de destino (cada una con su movimiento), todo en una sola escritura.
      Si en la bodega de destino ya hay ese artículo (mismo nombre sin tildes ni mayúsculas, y misma unidad), se le suma; si no, se crea ahí con los mismos datos. */
  function trasladar(a0, destIni, cantIni) {
    const a = a0, origen = bodegaDe(a), destinos = BODEGAS.filter(b => b !== origen);
    abrirAccion({
      titulo: 'Trasladar a otra bodega', sub: `${a.nombre}: hoy hay ${cantTxt(a.cantidad, a.unidad)} en la bodega de ${origen}.`,
      campos: campoSel('acDest', 'Bodega de destino', destinos.map(b => [b, b]), destinos.includes(destIni) ? destIni : destinos[0]) + campoNum('acCant', 'Cantidad que se traslada', cantIni > 0 ? Math.min(cantIni, Math.max(1, num(a.cantidad))) : 1, 1, 99999) + campoTxt('acNota', 'Nota (opcional)', '', 'Ej: para el proyecto de Bogotá', 160),
      primario: 'Trasladar', icono: 'entrega', listo: 'Listo: traslado registrado. Ya salió de una bodega y entró a la otra.',
      ops: () => {
        // Se usan los datos de este momento (otra persona pudo mover cantidades o el precio mientras la hoja estaba abierta).
        const a = artPorId(a0.id) || a0, n = entero('acCant'), dest = valor('acDest'), hay = num(a.cantidad), nota = valor('acNota');
        if (!destinos.includes(dest)) return fallar('Escoge la bodega de destino.', 'acDest');
        if (!(n > 0)) return fallar('Escribe una cantidad entera mayor que 0.', 'acCant');
        if (n > hay) return fallar(`Solo hay ${cantTxt(hay, a.unidad)} en ${origen}.`, 'acCant');
        const tid = window.nube.idNuevo('tr'), d = articulos().find(x => x.id !== a.id && bodegaDe(x) === dest && normNom(x.nombre) === normNom(a.nombre));
        if (d && !mismoArt(d, a)) return fallar(`En la bodega de ${dest} ya hay «${d.nombre}» en otra unidad (${d.unidad}). Cámbiale la unidad o el nombre antes de trasladar.`, 'acDest');
        const sale = mover(a, -n, { articuloId: a.id, articulo: a.nombre, tipo: 'salida', motivo: 'traslado', cantidad: n, saldo: hay - n, nota: `Traslado a ${dest}${nota ? ': ' + nota : ''}`, trasladoId: tid, bodegaOtra: dest });
        const notaIn = `Traslado desde ${origen}${nota ? ': ' + nota : ''}`;
        if (d) return [...sale, ...mover(d, n, { costoUnit: num(a.costo), costoNuevo: promedio(num(d.cantidad), num(d.costo), n, num(a.costo)), articuloId: d.id, articulo: d.nombre, tipo: 'entrada', motivo: 'traslado', cantidad: n, saldo: num(d.cantidad) + n, nota: notaIn, trasladoId: tid, bodegaOtra: origen })];
        const id = window.nube.idNuevo('ar'), movId = window.nube.idNuevo('mo');
        const codigoAlla = a.codigo && !articulos().some(x => x.codigo === a.codigo && bodegaDe(x) === dest) ? a.codigo : '';
        return [...sale, ['set', 'articulos', id, { nombre: a.nombre, codigo: codigoAlla, categoria: a.categoria, unidad: a.unidad, cantidad: n, ultimoMov: movId, minimo: num(a.minimo), maximo: num(a.maximo), ubicacion: '', costo: num(a.costo), proveedor: a.proveedor || '', bodega: dest }],
          movimiento({ bodega: dest, bodegaOtra: origen, costoUnit: num(a.costo), articuloId: id, articulo: a.nombre, tipo: 'entrada', motivo: 'traslado', cantidad: n, saldo: n, nota: notaIn, trasladoId: tid }, movId)];
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
  /** La cantidad de un movimiento con su signo, como número: entrada suma, salida resta y un ajuste trae su propio signo. */
  const cantFirmada = m => (m.tipo === 'entrada' ? Math.abs(num(m.cantidad)) : m.tipo === 'salida' ? -Math.abs(num(m.cantidad)) : num(m.cantidad));
  const signoMov = m => (cantFirmada(m) > 0 ? '+' : cantFirmada(m) < 0 ? '-' : '') + Math.abs(num(m.cantidad));
  /* El historial del artículo: TODOS sus movimientos, de 30 en 30, cada uno con su porqué. Se puede ver también lo de las otras bodegas y cambiar el orden. */
  let histOtras = false, histOrden = 'nuevo';
  const pasoMov = (m, conBodega) => {
    const mia = bodegaMov(m), ped = bodegaPedidaMov(m);
    return { fecha: m.fecha, titulo: `${signoMov(m)} · ${MOTIVO_MOV[m.motivo] || m.motivo}`, quien: m.por,
      detalle: [conBodega && mia ? 'Bodega de ' + mia : '', textoTraslado(m), m.persona ? (m.tipo === 'salida' ? 'a ' : 'de ') + m.persona : '', m.proyecto, ped && ped !== mia ? `${m.motivo === 'compra' ? 'comprado' : 'pedido'} para ${ped}` : '',
        'quedan ' + num(m.saldo), m.nota, m.motivoBodega ? `${m.tipo === 'entrada' ? 'por qué llegó' : 'por qué salió'} de otra bodega: ${m.motivoBodega}` : ''].filter(Boolean).join(' · ') };
  };
  function htmlHistArt(a) {
    const App = A(), id = ` data-id="${esH(a.id)}"`, hayOtras = gemelos(a).length > 0;
    const movs = histOtras ? movsDe(a).concat(gemelos(a).flatMap(movsDe)) : movsDe(a);
    const tl = App.lineaTiempo('art-' + a.id + (histOtras ? '|otras' : ''), movs.map(m => pasoMov(m, histOtras)), { orden: histOrden, n: 30, reiniciar: true });
    const chip = (acc, txt, val, on) => `<button type="button" class="chip" data-accion="${acc}"${id} data-val="${val}" aria-pressed="${on}">${esH(txt)}</button>`;
    return `<div class="chips sub" role="group" aria-label="Orden del historial">${chip('historden', 'Lo más nuevo primero', 'nuevo', histOrden === 'nuevo')}${chip('historden', 'Desde el comienzo', 'viejo', histOrden === 'viejo')}</div>`
      + (hayOtras ? `<div class="chips sub" role="group" aria-label="Otras bodegas">${chip('histotras', 'Ver también las otras bodegas', '', histOtras)}</div>` : '')
      + (tl.total ? `<p class="meta">${esH(`${tl.total} ${tl.total === 1 ? 'movimiento' : 'movimientos'}${tl.primera ? ' desde el ' + tl.primera : ''}`)}</p>${tl.ol}` : '<p class="meta">Sin movimientos.</p>');
  }
  const repintarHist = a => { const x = $('artHist'); if (x) { x.innerHTML = htmlHistArt(a); } return true; };
  function verArticulo(a) {
    histOtras = false; histOrden = 'nuevo';
    const App = A(), e = estadoArt(a), sug = sugerido(a);
    const abierta = compraAbierta(a.id), clase = verAbc() ? abcDe().get(a.id) : null, ultC = ultimoConteoDe(a);
    const botones = (esBodega()
      ? [boton('entrada', 'Entrada', 'importar', ` data-id="${esH(a.id)}"`), boton('salida', 'Salida', 'entrega', ` data-id="${esH(a.id)}"`), boton('trasladar', 'Trasladar', 'entrega', ` data-id="${esH(a.id)}"`), boton('editart', 'Editar', 'lapiz', ` data-id="${esH(a.id)}"`)].concat(abierta || !puedoPedirCompra() ? [] : [boton('pedir', 'Pedir compra', 'carrito', ` data-id="${esH(a.id)}"`)]).concat(e !== 'bien' && sobraEnOtras(a).length ? [botonesTraer(a)] : [])
      : puedoPedirMaterial() ? [boton('pedirmat', 'Pedir de este artículo', 'mas', ` data-id="${esH(a.id)}"`, 'primary small')] : [])
      .concat(veMovs() ? [boton('kardex', 'Kárdex', 'historial', ` data-id="${esH(a.id)}"`)] : []);
    abrirAccion({
      titulo: a.nombre, sub: [a.categoria, 'Bodega ' + bodegaDe(a), a.ubicacion].filter(Boolean).join(' · '),
      campos: `<div class="row">${App.pill(EST_ART[e][0], EST_ART[e][1])}${abierta ? App.pill('Compra en curso: ' + EST_CO[abierta.estado][0].toLowerCase(), 's-listo', 'carrito') : ''}</div>
        <dl class="datos">${a.codigo ? `<dt>Código</dt><dd><span class="serial-chip">${esH(a.codigo)}</span></dd>` : ''}<dt>Bodega</dt><dd>${esH(bodegaDe(a))}${a.ubicacion ? ' · ' + esH(a.ubicacion) : ''}</dd><dt>Hay</dt><dd><b>${esH(cantTxt(a.cantidad, a.unidad))}</b></dd>${gemelos(a).length ? `<dt>En otras bodegas</dt><dd>${esH(gemelos(a).map(x => `${bodegaDe(x)} ${num(x.cantidad)}`).join(', '))}</dd>` : ''}<dt>Mínimo y máximo</dt><dd>${esH(num(a.minimo))} y ${esH(num(a.maximo))}</dd>
          <dt>Precio aprox.</dt><dd>${esH(App.cop(a.costo))} por ${esH(SINGULAR[a.unidad] || 'unidad')}</dd><dt>Proveedor</dt><dd>${esH(a.proveedor || 'Sin dato')}</dd>${clase ? `<dt>Clase ABC</dt><dd><span class="abc abc-${clase.clase}">${clase.clase}</span> <span class="meta">${clase.valor ? `salieron ${esH(App.cop(clase.valor))} en 90 días (el ${esH(Math.round(clase.pct * 100))} % del total)` : 'no salió nada en 90 días'}</span></dd>` : ''}${ultC ? `<dt>Último conteo</dt><dd>${esH(A().fechaCorta(ultC))}</dd>` : ''}</dl>
        ${veMovs() && sug ? `<div class="note">En los últimos 30 días salieron ${esH(num(sug.total))} (unas ${esH(sug.semana)} por semana). Un mínimo de ${esH(sug.minimo)} alcanza para unos 10 días.${sug.minimo > num(a.minimo) ? ` <b>Tu mínimo (${esH(num(a.minimo))}) está bajo.</b>` : ' Tu mínimo está bien.'}</div>` : ''}
        ${botones.length ? `<div class="tarea-pie">${botones.join('')}</div>` : ''}
        ${veMovs() ? `<div class="section-label">Historial completo</div><div id="artHist">${htmlHistArt(a)}</div>` : ''}`
    });
  }
  /** Kárdex: todas las entradas y salidas de un artículo, con su saldo, y el Excel de ese artículo. */
  function kardex(a) {
    const App = A(), movs = movsDe(a), cop = App.cop, sinDato = '<span class="meta">sin dato</span>';
    // Un artículo puede tener cientos de movimientos: se muestran de 50 en 50. Los movimientos viejos, de antes del kárdex con plata, no traen valores.
    const pg = UI.pagina('kardex-' + a.id, movs.map(m => `<tr><td>${esH(App.fechaCorta(m.fecha))}</td><td>${esH(MOTIVO_MOV[m.motivo] || m.motivo)}<span class="meta">${esH([m.persona, m.proyecto, m.por].filter(Boolean).join(' · '))}</span></td><td class="num">${esH(signoMov(m))}</td><td class="num">${m.valor == null ? sinDato : `${esH((m.tipo === 'salida' || (m.tipo === 'ajuste' && num(m.cantidad) < 0) ? '-' : '') + cop(m.valor))}<span class="meta">a ${esH(cop(m.costoUnit))} c/u</span>`}</td><td class="num">${esH(num(m.saldo))}${m.valorSaldo == null ? '' : `<span class="meta">${esH(cop(m.valorSaldo))}</span>`}</td></tr>`), { reiniciar: true });
    abrirAccion({
      titulo: `Kárdex: ${a.nombre} (Bodega ${bodegaDe(a)})`, sub: `Hay ${cantTxt(a.cantidad, a.unidad)}, que valen ${cop(num(a.cantidad) * num(a.costo))} (costo promedio ${cop(a.costo)} por unidad). Cada entrada y salida con su valor y lo que quedó.`,
      campos: `<div class="row">${boton('excelkardex', 'Descargar Excel de este artículo', 'excel', ` data-id="${esH(a.id)}"`, 'primary small')}</div>` +
        (movs.length ? `<table class="lineas-tabla kardex-tabla"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Cant.</th><th>Valor</th><th>Quedó</th></tr></thead><tbody>${pg.html}</tbody></table>${pg.mas}` : '<p class="meta">Sin movimientos.</p>')
    });
  }
  async function descargarKardex(b, a) {
    b.disabled = true;
    try {
      const hojas = [];
      const filas = movsDe(a).reverse().map(m => ({ Fecha: fechaLocal(m.fecha, true), Bodega: bodegaMov(m), Movimiento: m.tipo, Motivo: MOTIVO_MOV[m.motivo] || m.motivo, Cantidad: cantFirmada(m), 'Costo unitario': m.costoUnit == null ? '' : num(m.costoUnit), Valor: m.valor == null ? '' : num(m.valor), Quedó: num(m.saldo), 'Valor que quedó': m.valorSaldo == null ? '' : num(m.valorSaldo), Persona: m.persona, Proyecto: m.proyecto, Registró: m.por, Nota: m.nota }));
      hojas.push(window.Excel.deObjetos('Kárdex', `Kárdex: ${a.nombre} (Bodega ${bodegaDe(a)})`, `Cada entrada y salida con su valor y lo que quedó. Hoy hay ${cantTxt(a.cantidad, a.unidad)}, que valen ${A().cop(num(a.cantidad) * num(a.costo))} (costo promedio ${A().cop(a.costo)}). Los movimientos viejos no traen valores. Generado el ${A().hoyISO()}.`, filas));
      await window.Excel.descargar({ archivo: `Kardex ${String(a.nombre).slice(0, 40)} ${A().hoyISO()}`, hojas });
      A().toast('Listo: Excel descargado');
    } catch (e) { A().toast('No se pudo preparar el Excel. Revisa la conexión y vuelve a intentar.'); }
    finally { b.disabled = false; }
  }
  /* ---------- conteo físico: por bodega, a ciegas y con borrador en el teléfono ----------
     Pasos: 1) escoger bodega y categoría, 2) contar (la app no dice cuánto cree que hay), 3) revisar las diferencias y guardar. */
  let conteoEst = null;
  const LS_CONTEO = b => 'conteo.' + b;
  const leerBorrador = b => {
    try {
      const j = JSON.parse(localStorage.getItem(LS_CONTEO(b)) || 'null');
      if (!j || typeof j !== 'object' || !j.vals || typeof j.vals !== 'object') return null;
      // Un borrador de hace más de un día ya no sirve (el stock cambió): se descarta solo.
      if (j.en && Date.now() - Date.parse(j.en) > 864e5) { localStorage.removeItem(LS_CONTEO(b)); return null; }
      const vals = Object.fromEntries(Object.entries(j.vals).filter(([, v]) => /^\d{1,9}$/.test(String(v))).map(([k, v]) => [k, String(v)]));
      return Object.keys(vals).length ? { vals, en: String(j.en || '') } : null;
    } catch (e) { return null; }
  };
  const guardarBorrador = b => {
    // Si se cuentan solo algunos artículos, lo escrito antes de otros artículos de la bodega se conserva.
    const vals = Object.assign({}, (leerBorrador(b) || { vals: {} }).vals);
    $('acCampos').querySelectorAll('input[data-art]').forEach(i => { if (i.value.trim() !== '') vals[i.dataset.art] = i.value.trim(); else delete vals[i.dataset.art]; });
    try { if (Object.keys(vals).length) localStorage.setItem(LS_CONTEO(b), JSON.stringify({ vals, en: new Date().toISOString() })); else localStorage.removeItem(LS_CONTEO(b)); } catch (e) {}
  };
  const borrarBorrador = b => { try { localStorage.removeItem(LS_CONTEO(b)); } catch (e) {} };
  /** Al terminar un conteo de solo algunos artículos, se quita del borrador lo de ellos y se guarda lo demás. */
  const quitarDeBorrador = (b, ids) => {
    const br = leerBorrador(b); if (!br) return;
    ids.forEach(id => { delete br.vals[id]; });
    try { if (Object.keys(br.vals).length) localStorage.setItem(LS_CONTEO(b), JSON.stringify({ vals: br.vals, en: br.en })); else localStorage.removeItem(LS_CONTEO(b)); } catch (e) {}
  };
  /** Último ajuste por conteo de una bodega. Si un conteo cuadró del todo no deja ajustes, así que no cuenta aquí. */
  function ultimoAjusteConteo(b) {
    const fs = D().movimientos.filter(m => m.motivo === 'conteo' && bodegaMov(m) === b).map(m => String(m.fecha)).sort();
    return fs.length ? fs[fs.length - 1] : '';
  }
  const textoUltimosAjustes = () => BODEGAS.map(b => { const f = ultimoAjusteConteo(b); return `${b}: ${f ? A().hace(f) : 'nunca'}`; }).join(' · ');

  function conteo(bodIni) {
    const bod0 = BODEGAS.includes(bodIni) ? bodIni : (BODEGAS.includes(sub.bodega) ? sub.bodega : BODEGAS[0]);
    abrirAccion({
      titulo: 'Conteo físico', sub: 'Escoge en qué bodega vas a contar. Cuentas sin ver lo que dice la app.',
      campos: campoSel('acBod', 'Bodega', BODEGAS.map(b => [b, b]), bod0) + '<div class="field"><label for="acCat">Categoría</label><select id="acCat"></select></div><div id="acBorrador"></div>' +
        `<p class="meta">Último ajuste por conteo: ${esH(textoUltimosAjustes())}</p>`,
      primario: 'Empezar a contar', icono: 'tarea',
      ops: () => { conteoContar(valor('acBod'), valor('acCat')); return null; }
    });
    A().vigilar('shAccion', () => null);   // escoger bodega no es algo que se pierda
    const refrescar = () => {
      const b = valor('acBod'), previa = valor('acCat');
      const cats = Array.from(new Set(articulos().filter(a => bodegaDe(a) === b).map(a => a.categoria).filter(Boolean))).sort((x, y) => String(x).localeCompare(String(y)));
      $('acCat').innerHTML = [['', 'Todas las categorías']].concat(cats.map(c => [c, c])).map(([v, tx]) => `<option value="${esH(v)}"${v === previa ? ' selected' : ''}>${esH(tx)}</option>`).join('');
      const br = leerBorrador(b), n = br ? Object.keys(br.vals).length : 0;
      $('acBorrador').innerHTML = br ? `<div class="note">Tienes un conteo sin terminar de ${esH(b)} (${n} ${n === 1 ? 'cantidad escrita' : 'cantidades escritas'}${br.en ? ', ' + esH(A().hace(br.en)) : ''}). Al empezar sigues donde ibas.</div><div class="acc-rap">${boton('borrarborrador', 'Empezar de cero (borra lo escrito)', 'borrar', ` data-bod="${esH(b)}"`, 'ghost small')}</div>` : '';
      window.llenarIconos($('acBorrador'));
    };
    $('acBod').onchange = refrescar; refrescar();
  }
  function conteoContar(bod, cat, solo) {
    if (!BODEGAS.includes(bod)) return fallar('Escoge una de las 3 bodegas.', 'acBod');
    const arts = articulos().filter(a => bodegaDe(a) === bod && (!cat || a.categoria === cat) && (!solo || solo.includes(a.id)))
      .sort((a, b) => String(a.ubicacion).localeCompare(String(b.ubicacion), 'es', { numeric: true }) || String(a.nombre).localeCompare(String(b.nombre)));
    if (!arts.length) return fallar('No hay artículos en esa bodega y categoría.', 'acCat');
    const br = leerBorrador(bod), vals = (br || { vals: {} }).vals, deBorrador = !!br && arts.some(a => vals[a.id] != null);
    conteoEst = { bod, cat, solo: solo || null, ids: arts.map(a => a.id), conteos: {}, revisado: '' };
    abrirAccion({
      titulo: `Conteo físico: ${bod}${cat ? ' · ' + cat : ''}${solo ? ' · los de hoy' : ''}`, sub: 'Cuenta en los estantes y escribe cuánto hay de verdad. La app no dice cuánto cree que hay, para que cuentes sin pistas. Deja en blanco lo que no contaste. Lo que escribes se guarda en este teléfono.',
      campos: (deBorrador ? `<div class="note">Estas cantidades vienen de un conteo sin terminar${br.en ? ' (' + esH(A().hace(br.en)) + ')' : ''}. Revísalas antes de guardar.</div>` : '') + `<div class="conteo">${arts.map(a => `<div class="conteo-f"><label for="cn-${esH(a.id)}">${esH(a.nombre)}<span class="meta">${esH([a.categoria, a.ubicacion, a.unidad].filter(Boolean).join(' · '))}</span></label><input id="cn-${esH(a.id)}" data-art="${esH(a.id)}" type="number" inputmode="numeric" min="0" step="1" placeholder="Contado" value="${esH(vals[a.id] == null ? '' : vals[a.id])}"></div>`).join('')}</div>`,
      primario: 'Revisar', icono: 'check',
      ops: () => {
        const filas = Array.from($('acCampos').querySelectorAll('input[data-art]')).filter(i => i.value.trim() !== '');
        if (!filas.length) return fallar('Escribe al menos una cantidad contada.');
        const mala = filas.find(i => !/^\d+$/.test(i.value.trim()));
        if (mala) return fallar('Las cantidades deben ser números enteros, 0 o más.', mala.id);
        conteoEst.conteos = Object.fromEntries(filas.map(i => [i.dataset.art, Number(i.value.trim())]));
        conteoRevisar();
        return null;
      }
    });
    // Lo escrito ya queda guardado en el teléfono: cerrar esta hoja no pierde nada, así que no pregunta «¿Salir sin guardar?».
    A().vigilar('shAccion', () => null);
    $('acCampos').oninput = e => { if (e.target.matches && e.target.matches('input[data-art]')) guardarBorrador(bod); };
  }
  const difsDeConteo = () => conteoEst.ids.filter(id => id in conteoEst.conteos).map(id => artPorId(id)).filter(Boolean)
    .map(a => ({ a, contado: conteoEst.conteos[a.id], antes: num(a.cantidad), dif: conteoEst.conteos[a.id] - num(a.cantidad) }));
  function conteoRevisar() {
    const e = conteoEst, filas = difsDeConteo(), difs = filas.filter(x => x.dif !== 0), sin = e.ids.length - filas.length;
    e.revisado = JSON.stringify(difs.map(x => [x.a.id, x.antes]));
    const fila = x => `<div class="conteo-r${x.dif ? ' difiere' : ''}"><span class="cr-n">${esH(x.a.nombre)}<span class="meta">${esH([x.a.ubicacion, x.a.unidad].filter(Boolean).join(' · '))}</span></span><span class="cr-v"><span class="meta">Contaste</span><b class="num">${x.contado}</b></span><span class="cr-v"><span class="meta">La app decía</span><b class="num">${x.antes}</b></span><span class="cr-d num">${x.dif ? (x.dif > 0 ? '+' : '') + x.dif : 'Cuadra'}</span></div>`;
    abrirAccion({
      titulo: `Revisar el conteo: ${e.bod}`, sub: difs.length ? `Contaste ${filas.length} ${filas.length === 1 ? 'artículo' : 'artículos'}: ${difs.length} no ${difs.length === 1 ? 'cuadra' : 'cuadran'} con la app.` : `Contaste ${filas.length} ${filas.length === 1 ? 'artículo' : 'artículos'}: todo cuadra con la app.`,
      campos: `<div class="conteo-rev">${filas.slice().sort((a, b) => (b.dif !== 0) - (a.dif !== 0)).map(fila).join('')}</div>` + (sin ? `<p class="meta">Sin contar: ${sin}. Esos no se cambian.</p>` : '') +
        (difs.length ? campoTxt('acMotivo', 'Motivo de las diferencias', '', 'Ej: se usaron sin registrar en la reunión', 160) : '') + `<div class="acc-rap">${boton('volverconteo', 'Volver a contar', 'atras', '', 'ghost small')}</div>`,
      primario: 'Guardar conteo', icono: 'check', listo: 'Listo: conteo guardado.', alGuardar: () => (e.solo ? quitarDeBorrador(e.bod, e.ids) : borrarBorrador(e.bod)),
      ops: () => {
        const ahora = difsDeConteo().filter(x => x.dif !== 0);
        if (JSON.stringify(ahora.map(x => [x.a.id, x.antes])) !== e.revisado) { conteoRevisar(); fallar('Mientras revisabas cambió la cantidad de algún artículo. Revisa otra vez.'); return null; }
        if (ahora.length && !valor('acMotivo')) return fallar(`Hay ${ahora.length} ${ahora.length === 1 ? 'diferencia' : 'diferencias'}: escribe el motivo.`, 'acMotivo');
        accion.listo = ahora.length ? `Listo: conteo guardado. Se ajustaron ${ahora.length} ${ahora.length === 1 ? 'artículo' : 'artículos'}.` : 'Listo: conteo guardado. Todo cuadra con la app.';
        // Cada artículo contado, cuadre o no, queda con la fecha de hoy como su último conteo (así se sabe cuándo le toca de nuevo).
        const hoyC = A().hoyISO(), cuadran = difsDeConteo().filter(x => x.dif === 0).map(x => ['mezclar', 'articulos', x.a.id, { ultimoConteo: hoyC }]);
        if (!ahora.length) return cuadran;
        return ahora.flatMap(x => { const o = mover(x.a, x.dif, { articuloId: x.a.id, articulo: x.a.nombre, tipo: 'ajuste', motivo: 'conteo', cantidad: x.dif, saldo: x.contado, nota: valor('acMotivo') }); o[0][3].ultimoConteo = hoyC; return o; }).concat(cuadran, [aviso('jefe', 'Conteo con diferencias', `${persona().nombre} contó la bodega de ${e.bod}: ${ahora.length} ${ahora.length === 1 ? 'artículo no cuadró' : 'artículos no cuadraron'} (${valor('acMotivo')}).`)]);
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
        Compras: ['Compras', 'Todas las compras: quién pidió, quién autorizó, cuánto costó y en qué va.'], Proveedores: ['Proveedores', 'A quién se le compra: NIT, contacto, compras hechas y lo que se le ha pagado este año.'], 'Pedidos de material': ['Pedidos de material', 'Lo que pidió cada persona a la bodega y si se entregó.'] };
      const hoja = (nombre, filas) => hojas.push(window.Excel.deObjetos(nombre, TIT[nombre][0], `${TIT[nombre][1]} ${gen}`, filas));
      hoja('Bodega', articulos().map(a => ({ Bodega: bodegaDe(a), Artículo: a.nombre, Categoría: a.categoria, Cantidad: num(a.cantidad), Unidad: a.unidad, Mínimo: num(a.minimo), Máximo: num(a.maximo), Estado: EST_ART[estadoArt(a)][0], Ubicación: a.ubicacion, 'Precio aprox.': num(a.costo), 'Valor en bodega': num(a.cantidad) * num(a.costo), Proveedor: a.proveedor })));
      hoja('Movimientos', d.movimientos.slice().sort((x, y) => String(y.fecha).localeCompare(String(x.fecha))).map(m => ({ Fecha: fechaLocal(m.fecha, true), Bodega: bodegaMov(m), Artículo: m.articulo, Tipo: m.tipo, Motivo: MOTIVO_MOV[m.motivo] || m.motivo, Cantidad: num(m.cantidad), Saldo: num(m.saldo), Persona: m.persona, Proyecto: m.proyecto, Registró: m.por, Nota: m.nota,
        'Traslado: otra bodega': BODEGAS.includes(m.bodegaOtra) ? m.bodegaOtra : '', 'Pedido para': bodegaPedidaMov(m), 'Motivo de la bodega': m.motivoBodega || '' })));
      hoja('Compras', d.compras.map(c => ({ Qué: c.que, Cantidad: num(c.cantidad), Unidad: c.unidad, Categoría: c.categoria, Estado: (EST_CO[c.estado] || [c.estado])[0], Pidió: c.pide, Autoriza: c.autoriza, 'Valor aprox.': num(c.valorAprox), 'Valor pagado': num(c.valorReal), Proveedor: c.proveedor, 'Fecha pedido': c.fechaPedido, 'Fecha compra': c.fechaCompra, 'Para qué': c.paraQue, 'Bodega destino': bodegasCompra(c).join(' y ') || (lineasDe(c).some(l => l.articuloId) ? '' : 'No va a bodega') })));
      if (veProv()) hoja('Proveedores', provs().map(p => { const st = statsProv(p); return { Proveedor: p.nombre, NIT: p.nit, Contacto: p.contacto, Teléfono: p.telefono, Correo: p.correo, 'Compras hechas': st.n, 'Pagado este año': st.anio, 'Última compra': st.ultima, Nota: p.nota }; }));
      hoja('Pedidos de material', d.solicitudes.map(s => ({ Fecha: fechaLocal(s.fecha, false), 'Bodega pedida': bodegaSol(s), Artículo: s.articulo, Cantidad: num(s.cantidad), Pidió: s.pide, 'Para qué': s.paraQue, Proyecto: s.proyecto, Estado: (EST_SOL[s.estado] || [s.estado])[0], Entregó: s.entregadaPor, Motivo: s.motivo,
        'Salió de': bodegaSurteDe(s), 'Motivo de la bodega': s.motivoBodega || '' })));
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
        ini > 0 ? movimiento({ bodega: x.datos.bodega, costoUnit: num(x.datos.costo), articuloId: id, articulo: x.datos.nombre, tipo: 'entrada', motivo: 'inicial', cantidad: ini, saldo: ini, nota: 'Artículo nuevo (desde el Excel)' }, movId) : null].filter(Boolean);
    }
    const a = x.a;
    if (x.real === null) {
      if (!Object.keys(x.datos).length) return [];
      if (x.datos.costo == null || num(x.datos.costo) === num(a.costo)) return [['mezclar', 'articulos', a.id, x.datos]];
      const idP = window.nube.idNuevo('mo');
      return [['mezclar', 'articulos', a.id, Object.assign({ ultimoMov: idP }, x.datos)],
        movimiento({ bodega: bodegaDe(a), costoUnit: num(x.datos.costo), articuloId: a.id, articulo: x.datos.nombre || a.nombre, tipo: 'ajuste', motivo: 'precio', cantidad: 0, saldo: num(a.cantidad), nota: `Cambió el precio de ${A().cop(num(a.costo))} a ${A().cop(num(x.datos.costo))} (desde el Excel)` }, idP)];
    }
    const dif = x.real - num(a.cantidad), movId = window.nube.idNuevo('mo');
    return [['update', 'articulos', a.id, Object.assign({}, x.datos, { cantidad: window.nube.incremento(dif), ultimoMov: movId, ultimoConteo: A().hoyISO() })],
      movimiento({ bodega: bodegaDe(a), costoUnit: num(x.datos.costo != null ? x.datos.costo : a.costo), articuloId: a.id, articulo: x.datos.nombre || a.nombre, tipo: 'ajuste', motivo: 'conteo', cantidad: dif, saldo: x.real, nota: 'Ajuste desde el Excel' }, movId)];
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

  /* ---------- base de datos en Excel de las compras (excel-bd.js): agregar muchas a la vez; lo que ya está solo se mira ---------- */
  const cfgCompras = () => ({
    clave: 'compras', hoja: 'Compras', titulo: 'Base de datos: compras', sub: 'Una fila por compra', archivo: 'Base de datos Compras',
    acciones: ['Agregar'], puedeSubir: puedoPedirCompra,
    columnas: [
      { t: 'Qué', k: 'que', clave: true, obligatoria: true, max: 100, ancho: 34 }, { t: 'Cantidad', k: 'cantidad', tipo: 'entero', min: 1, max: 99999, obligatoria: true },
      { t: 'Unidad', k: 'unidad', lista: UNIDADES, obligatoria: true }, { t: 'Categoría', k: 'categoria', lista: CATEGORIAS, obligatoria: true },
      { t: 'Valor total', k: 'valor', tipo: 'dinero', min: 1, obligatoria: true }, { t: 'Para qué', k: 'paraQue', obligatoria: true, max: 140, ancho: 36 },
      { t: 'Proyecto', k: 'proyecto', lista: PROYECTOS, defecto: PROYECTOS[0] }, { t: 'Proveedor sugerido', k: 'provSug', max: 80, ancho: 24 },
      { t: 'Estado', k: 'estado', gris: true, ancho: 16 }, { t: 'Pidió', k: 'pide', gris: true, ancho: 22 }, { t: 'Fecha del pedido', k: 'fecha', gris: true }, { t: 'Valor pagado', k: 'pagado', tipo: 'dinero', gris: true },
      { t: 'Bodega', k: 'bodega', gris: true, ancho: 18 }],
    filas: () => D().compras.filter(c => veTodo() || c.pide === persona().nombre).sort((a, b) => String(b.fechaPedido || b.fechaCompra).localeCompare(String(a.fechaPedido || a.fechaCompra)))
      .map(c => ({ id: c.id, v: { que: c.que, cantidad: num(c.cantidad), unidad: c.unidad, categoria: c.categoria, valor: num(c.valorAprox), paraQue: c.paraQue, proyecto: c.proyecto || '', provSug: c.proveedorSug || '', estado: (EST_CO[c.estado] || [c.estado])[0], pide: c.pide, fecha: c.fechaPedido || c.fechaCompra || '', pagado: num(c.valorReal), bodega: bodegasCompra(c).join(' y ') } })),
    ejemplo: { que: 'Resmas de papel carta', cantidad: 5, unidad: 'resmas', categoria: 'Papelería', valor: 140000, paraQue: 'Para imprimir listas de asistencia', proyecto: PROYECTOS[0], provSug: 'Papelería Central' },
    ayuda: [['Compra nueva', 'Cada fila nueva pide una compra de UN artículo que no va a bodega: queda «Por autorizar» y le llega el aviso a quien la autoriza (si eres el Gerente general queda autorizada). Obligatorios: Qué, Cantidad, Unidad, Categoría, Valor total y Para qué. Para varios artículos en una compra, o con fotos de cotizaciones, usa «Pedir una compra» en la app.'],
      ['Compras que ya están', 'Aquí solo se miran: no se cambian ni se eliminan desde el Excel (son el rastro de lo que se gastó).']],
    opsAgregar: x => {
      const g = esGerenteGeneral(), v = x.v;
      const doc = Object.assign({ que: v.que, cantidad: v.cantidad, unidad: v.unidad, categoria: v.categoria, valorAprox: v.valor, paraQue: v.paraQue + (v.proyecto ? ` (${v.proyecto})` : ''), proyecto: v.proyecto, proveedorSug: v.provSug,
        lineas: [{ que: v.que, cantidad: v.cantidad, unidad: v.unidad, valor: v.valor, articuloId: '', bodega: '' }], cotizaciones: [], pide: persona().nombre, pideRol: persona().rol, autoriza: g ? persona().nombre : '', autorizaJefe: '', estado: g ? 'autorizado' : 'pedido',
        proveedor: '', valorReal: 0, fechaPedido: A().hoyISO(), fechaCompra: '', entregadoA: '', motivoRechazo: '', articuloId: '', factura: '', revisada: false }, misMarcas());
      doc.historial = [{ fecha: ahora(), texto: 'Pidió la compra (desde el Excel)', por: persona().nombre }];
      if (g) { doc.autorizaCorreo = window.nube.correo(); doc.historial.push({ fecha: ahora(), texto: 'Autorizó la compra (Gerente general: lo que pide no necesita autorización)', por: persona().nombre }); }
      return [['set', 'compras', window.nube.idNuevo('co'), doc]];
    },
    alGuardar: buenas => {
      pushPendientes = [];
      return [esGerenteGeneral() ? aviso('compras', 'Compras autorizadas: hay que comprar', `${persona().nombre} autorizó ${buenas.length} ${buenas.length === 1 ? 'compra' : 'compras'} desde un Excel.`)
        : aviso(ROL_DE[autorizadorDe({ pideRol: persona().rol, estado: 'pedido' })], 'Compras por autorizar', `${persona().nombre} pidió ${buenas.length} ${buenas.length === 1 ? 'compra' : 'compras'} desde un Excel.`)];
    },
    despues: () => notificar(pushPendientes.slice())
  });
  window.ExcelBD.conectar($('invContenido'), { compras: cfgCompras }, () => pintar());

  /* ---------- eventos ---------- */
  $('invSecciones').addEventListener('click', e => {
    const b = e.target.closest('[data-sec]'); if (!b) return;
    seccion = b.dataset.sec; A().S.filtro.inventario = ''; $('qInventario').value = '';
    A().pintarTodo();
  });
  $('qInventario').addEventListener('input', UI.retardar(() => pintar(), 300));
  $('btnPedirMaterial').addEventListener('click', () => pedirMaterial());
  $('btnPedirCompra').addEventListener('click', () => pedirCompra());
  /* ---------- escanear el código de un artículo ---------- */
  async function leerCodigoArt(titulo) {
    try { await UI.cargarScript('codigos.js?v=1'); }
    catch (e) { A().toast('No se pudo abrir el lector de códigos. Revisa la conexión o escribe el código.'); return null; }
    return window.Codigos.leer({ titulo, conocidos: articulos().map(a => a.codigo).filter(Boolean) });
  }
  /** Escanea y abre el artículo con ese código; si no hay (o hay uno en cada bodega) deja el código en el buscador. */
  async function escanearArt() {
    const s = await leerCodigoArt('Escanear el código del artículo');
    if (!s) return true;
    const c = normCod(s), hay = articulos().filter(a => a.codigo && normCod(a.codigo) === c);
    if (hay.length === 1) { verArticulo(hay[0]); return true; }
    $('qInventario').value = s; sub.bodega = 'todas'; A().S.filtro.inventario = ''; pintar();
    A().toast(hay.length ? `Hay ${hay.length} artículos con el código ${s}: escoge el de tu bodega.` : `No hay un artículo con el código ${s}`);
    return true;
  }
  /** En el formulario del artículo: escanea y escribe el código en su campo. */
  async function escanearParaCampo() {
    const s = await leerCodigoArt('Escanear el código del artículo');
    if (!s || !accion || $('shAccion').hidden || !$('acCodigo')) return true;
    $('acCodigo').value = normCod(s).slice(0, 30);
    return true;
  }
  function alTocar(e) {
    const sb = e.target.closest('[data-sub]');
    if (sb) { sub[sb.dataset.sub] = sb.dataset.val; pintar(); return; }
    const b = e.target.closest('[data-accion]'); if (!b) return;
    const d = D(), id = b.dataset.id;
    const c = d.compras.find(x => x.id === id) || null, s = d.solicitudes.find(x => x.id === id) || null, a = artPorId(id), pv = provs().find(x => x.id === id) || null;
    const mapa = {
      pedir: () => a && pedirCompra(a.id, Number(b.dataset.cant) || 0, null, b.dataset.sol || ''), pedirbajo: () => pedirBajo(), autorizar: () => c && autorizar(c), rechazar: () => c && rechazar(c),
      comprar: () => c && registrarCompra(c), imprimirorden: () => c && imprimirOrden(c), recibir: () => c && recibir(c), revisada: () => c && marcarRevisada(c), vercompra: () => c && verCompra(c),
      entregar: () => s && entregar(s, b.dataset.desde || ''), versol: () => s && (verSolicitud(s), true), traer: () => a && esBodega() && (trasladar(a, b.dataset.dest, Number(b.dataset.cant) || 0), true), noentregar: () => s && noEntregar(s), sinaut: () => registrarCompra(null, true),
      entrada: () => entradaSalida('entrada', a ? a.id : ''), entdev: () => entradaSalida('entrada', a ? a.id : '', true), entcompra: () => (entradaCompras(), true), salida: () => entradaSalida('salida', a ? a.id : ''),
      nuevoart: () => editarArticulo(null), editart: () => a && editarArticulo(a), verart: () => a && verArticulo(a), pedirmat: () => a && pedirMaterial(a.id),
      historden: () => a && (histOrden = b.dataset.val === 'viejo' ? 'viejo' : 'nuevo', repintarHist(a)), histotras: () => a && (histOtras = !histOtras, repintarHist(a)),
      trasladar: () => a && trasladar(a), conteo: () => conteo(), volverconteo: () => (conteoEst ? conteoContar(conteoEst.bod, conteoEst.cat, conteoEst.solo) : conteo()), contarhoy: () => { const ids = contarHoyDe(b.dataset.bod); if (!ids.length) { A().toast('Ya no queda nada por contar hoy en esa bodega.'); return true; } return conteoContar(b.dataset.bod, '', ids); }, borrarborrador: () => { borrarBorrador(b.dataset.bod); conteo(b.dataset.bod); }, excel: () => descargarExcel(b), bdexcel: () => descargarBase(b), exguardar: () => guardarExcelExistencias(), exdescartar: () => { previaEx = null; errorEx = ''; pintar(); }, monto: () => cambiarMonto(), kardex: () => a && kardex(a), excelkardex: () => a && descargarKardex(b, a),
      escanear: () => escanearArt(), escancodigo: () => escanearParaCampo(),
      verprov: () => pv && verProv(pv), nuevoprov: () => gestionaProv() && (formProv(null), true), editprov: () => pv && gestionaProv() && (formProv(pv), true), borrarprov: () => pv && esJefe() && (borrarProv(pv), true),
      quitarq: () => { $('qInventario').value = ''; pintar(); return true; },
      vista: () => { guardarVista(id); pintar(); return true; },
      ordenar: () => { ordenT = ordenT.col === id ? { col: id, dir: -ordenT.dir } : { col: id, dir: 1 }; pintar(); return true; },
      masLinea: () => masLinea(), quitarLinea: () => quitarLinea(b.dataset.n),
      ir: () => { seccion = b.dataset.sec; if (BOD_DE_SEC[seccion]) sub[BOD_DE_SEC[seccion]] = 'todas'; if (b.dataset.subk) sub[b.dataset.subk] = b.dataset.subv; A().S.filtro.inventario = b.dataset.filtro || ''; $('qInventario').value = ''; A().pintarTodo(); }
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

  // Al agrandar o achicar la ventana cruzando los 900 px, la tabla aparece o se vuelve tarjetas.
  try { window.matchMedia('(min-width: 900px)').addEventListener('change', () => { if (A().S.persona && A().S.vista === 'inventario' && seccion === 'existencias') pintar(); }); } catch (e) { /* navegador viejo: se repinta al tocar algo */ }
  window.Inventario = Object.freeze({ pintar, resumen, tareas, leerFoto, cargarXlsx, fechaLocal, funcion: miFuncion, irA: s => { if (secciones().some(x => x[0] === s)) seccion = s; } });
})();
