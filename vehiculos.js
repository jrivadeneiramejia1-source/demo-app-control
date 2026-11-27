/* vehiculos.js — Módulo Vehículos de la demo.
   Hoja de vida de cada carro (placa, modelo, conductor, kilometraje, SOAT y técnico-mecánica, estado).
   Novedades (llanta, choque, rayón, mantenimiento u otro) con foto obligatoria: las reporta el Conductor (o Transporte,
   Bodega o la Jefe) y las revisan Transporte, Bodega o la Jefe (costo, nota, si va al taller).
   Salida y llegada del carro: kilometraje, combustible, fotos de los 4 lados y las llantas, y revisión de luces, llantas,
   documentos y herramienta. Si el carro va a una reunión, la salida queda unida a ese viaje.
   Avisos dentro de la app cuando el SOAT o la técnico-mecánica están por vencer (30 días) o vencidos.
   Tanqueos con la foto del recibo: de un tanque lleno al siguiente se saca cuántos km rinde el carro y cuánto cuesta el combustible por km;
   si un tanqueo rinde más de 25 % menos que lo normal del carro, se avisa a Transporte, Bodega y la Jefe. El costo total de cada carro suma
   novedades, mantenimientos del plan y combustible.
   Pedir un carro (viajes que no son reuniones): quien tiene nivel de trabajo en Vehículos pide fecha, hora, destino y motivo; Transporte, Bodega o la Jefe
   (nunca quien lo pidió) lo aprueban escogiendo un carro libre ese día (libresPara, que también mira las reuniones) y el conductor, o lo rechazan.
   El conductor ve su viaje en «Lo que me toca» y la salida queda ligada a la reserva.
   La Jefe puede todo; el Gerente ve el resumen y la hoja de vida sin botones. */
(function () {
  'use strict';
  const A = () => window.App;
  const $ = id => document.getElementById(id);
  const esH = v => A().esH(v);
  const D = () => A().S.datos;
  const persona = () => A().S.persona;
  const miRol = () => (persona() ? persona().rol : '');
  const perm = () => A().permiso('vehiculos');
  const esJefe = () => perm() === 'jefe';
  const esGerente = () => miRol() === 'gerente';
  const esAdmin = () => esJefe() || perm() === 'autoriza';          // Jefe, Transporte y Bodega
  const esConductor = () => perm() === 'reporta';
  const puedeReportar = () => esAdmin() || esConductor();
  const ahora = () => new Date().toISOString();
  const num = v => Number(v) || 0;
  const km = v => `${num(v).toLocaleString('es-CO')} km`;
  const ACTIVA = ['programada', 'reprogramada'];
  const RES_EST = { pedida: ['Por aprobar', 's-org', 'org'], aprobada: ['Aprobada', 's-listo', 'listo'], rechazada: ['Rechazada', 's-peligro', 'peligro'], cancelada: ['Cancelada', 'none', 'pend'] };
  const RES_MAX_DIAS = 90;
  const EST = { disponible: ['Disponible', 's-disco', 'disco'], 'en-uso': ['En uso', 's-listo', 'listo'], 'en-taller': ['En taller', 's-org', 'org'] };
  const TIPO_NOV = { llanta: 'Llanta', choque: 'Choque', rayon: 'Rayón', mantenimiento: 'Mantenimiento', otro: 'Otro' };
  const COMBUSTIBLE = [['vacio', 'Vacío'], ['1/4', '1/4'], ['1/2', '1/2'], ['3/4', '3/4'], ['lleno', 'Lleno']];
  const LADOS = [['frente', 'Frente'], ['atras', 'Atrás'], ['izquierda', 'Lado izquierdo'], ['derecha', 'Lado derecho'], ['llantas', 'Llantas']];
  // Revisión antes de salir (preoperacional). Los «críticos» impiden salir si alguno está mal; el resto pide contar el problema.
  // La lista es la del plan (no hay formato oficial único: cada empresa arma el suyo); si Transporte da el suyo, se cambia aquí.
  const REV_CRITICOS = [['frenos', 'Frenos'], ['llantas', 'Llantas'], ['luces', 'Luces'], ['direccion', 'Dirección']];
  const REV_OTROS = [['aceite', 'Nivel de aceite'], ['agua', 'Nivel de agua (refrigerante)'], ['liquidoFrenos', 'Líquido de frenos'], ['cinturones', 'Cinturones'], ['pito', 'Pito'], ['espejos', 'Espejos'],
    ['limpiabrisas', 'Limpiabrisas'], ['extintor', 'Extintor (vigente)'], ['botiquin', 'Botiquín'], ['kit', 'Kit de carretera'], ['repuesto', 'Llanta de repuesto']];
  const REVISION = REV_CRITICOS.concat(REV_OTROS);
  // Las salidas guardadas antes de esta lista traían 4 casillas (luces, llantas, documentos, herramienta): se siguen leyendo.
  const NOMBRE_REV = Object.assign(Object.fromEntries(REVISION), { documentos: 'Documentos', herramienta: 'Herramienta y kit' });
  const esCritico = k => REV_CRITICOS.some(([x]) => x === k);
  /** Resumen de una revisión guardada: «bien», «2 mal (pito, botiquín)» o «sin revisar», por grupo. */
  function textoRevision(rev) {
    rev = rev && typeof rev === 'object' ? rev : {};
    const grupo = pred => { const ks = Object.keys(rev).filter(pred); if (!ks.length) return 'sin revisar'; const mal = ks.filter(k => !rev[k]); return mal.length ? `${mal.length} mal (${mal.map(k => (NOMBRE_REV[k] || k).toLowerCase()).join(', ')})` : 'bien'; };
    return { criticos: grupo(esCritico), otros: grupo(k => !esCritico(k)) };
  }
  const CONDUCTORES = ['Oscar Farfán', 'Rafael Ospino', 'Hernán Brito'];
  const QUIEN_ENTREGA = ['Wilson Muñoz', 'Andrés Beltrán'];
  let seccion = '', rolPintado = '', guardando = false, accion = null, pushPendientes = [], fotos = {}, fotoNov = '', fotoTan = '', periodo = 'mes', buscar = '';
  // Historial completo de la hoja de vida: filtro, orden y el carro al que pertenecen (se reinician al abrir otro carro).
  let lineaFiltro = 'todo', lineaOrden = 'nuevo', lineaVeh = '';

  /* ---------- datos derivados ---------- */
  const vehPorId = id => D().vehiculos.find(v => v.id === id) || null;
  const novDe = id => D().novedades.filter(n => n.vehiculoId === id).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const entDe = id => D().entregas.filter(e => e.vehiculoId === id).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const tanDe = id => D().tanqueos.filter(t => t.vehiculoId === id).sort((a, b) => num(a.km) - num(b.km) || String(a.fecha).localeCompare(String(b.fecha)));
  const sinRevisar = () => D().novedades.filter(n => !n.revisada);
  const dias = f => A().diasHasta(f);
  /** Estado de un documento: vencido, por vencer (30 días) o al día. */
  const estDoc = f => { const d = dias(f); return d == null ? 'sin' : d < 0 ? 'vencido' : d <= 30 ? 'pronto' : 'ok'; };
  const docsMal = v => ['soat', 'tecno'].filter(k => estDoc(v[k]) !== 'ok');
  /* ---------- plan de mantenimiento: tareas por kilómetros y/o por días ---------- */
  const MTTO_PRONTO_KM = 500, MTTO_PRONTO_DIAS = 15;
  const masDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const mttosDe = v => (Array.isArray(v.mttos) ? v.mttos.filter(x => x && typeof x === 'object' && x.id) : []);
  /** Cuánto falta para una tarea del plan: por km (último km + cada cuántos km − km de hoy) y por días; manda lo que llegue primero. */
  function estMtto(m, v) {
    const kmFalta = num(m.cadaKm) > 0 ? num(m.ultimoKm) + num(m.cadaKm) - num(v.km) : null;
    const venceEl = num(m.cadaDias) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(m.ultimaFecha || '') ? masDias(m.ultimaFecha, num(m.cadaDias)) : '';
    const diasFalta = venceEl ? dias(venceEl) : null;
    const vencido = (kmFalta != null && kmFalta <= 0) || (diasFalta != null && diasFalta < 0);
    const pronto = !vencido && ((kmFalta != null && kmFalta <= MTTO_PRONTO_KM) || (diasFalta != null && diasFalta <= MTTO_PRONTO_DIAS));
    // Se dice lo que hizo que toque: si ya tocaba, lo que ya se pasó; si falta poco, lo que está cerca; si está al día, las dos cuentas.
    const kmMal = kmFalta != null && kmFalta <= 0, diasMal = diasFalta != null && diasFalta < 0;
    const kmCerca = kmFalta != null && kmFalta <= MTTO_PRONTO_KM, diasCerca = diasFalta != null && diasFalta <= MTTO_PRONTO_DIAS;
    const faltan = [], pasado = [];
    if (kmFalta != null && (vencido ? kmMal : pronto ? kmCerca : true)) { if (kmFalta > 0) faltan.push(km(kmFalta)); else pasado.push(kmFalta < 0 ? `se pasó ${km(-kmFalta)}` : 'ya llegó a los km'); }
    if (diasFalta != null && (vencido ? diasMal : pronto ? diasCerca : true)) { if (diasFalta > 0) faltan.push(`${diasFalta} días`); else pasado.push(diasFalta < 0 ? `se pasó hace ${-diasFalta} días` : 'toca hoy'); }
    return { est: vencido ? 'vencido' : pronto ? 'pronto' : 'ok', kmFalta, diasFalta, texto: pasado.concat(faltan.length ? ['faltan ' + faltan.join(' o ')] : []).join(' y ') || (kmFalta == null && diasFalta == null ? 'falta anotar la fecha de la última vez' : '') };
  }
  const conMtto = v => mttosDe(v).some(m => estMtto(m, v).est !== 'ok');
  /** Tareas del plan de todos los carros que ya tocan o están por tocar (las vencidas primero). */
  const mttosPend = () => D().vehiculos.flatMap(v => mttosDe(v).map(m => ({ v, m, e: estMtto(m, v) }))).filter(x => x.e.est !== 'ok')
    .sort((a, b) => (a.e.est === b.e.est ? String(a.v.placa).localeCompare(String(b.v.placa)) : a.e.est === 'vencido' ? -1 : 1));
  /* ---------- combustible: tanqueos, rendimiento y costo ---------- */
  const TAN_RARO = 0.75, TAN_MIN_TRAMOS = 2, TAN_PRECIO_MIN = 5000, TAN_PRECIO_MAX = 40000;
  const nGal = v => Number(v || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 });
  const nKmGal = v => Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  /** Tramos de rendimiento (los tanqueos van ordenados por km): de un tanque lleno al siguiente, los km recorridos entre los galones echados
      desde el primero (los tanqueos que no llenan el tanque suman sus galones al siguiente lleno). Un tramo es «raro» si rindió más de 25 %
      menos que el promedio de los tramos anteriores (hacen falta al menos 2 para tener un promedio). */
  function tramosDe(ts) {
    const out = []; let ancla = null, g = 0, val = 0, sumKm = 0, sumGal = 0;
    ts.forEach(t => {
      if (ancla) { g += num(t.galones); val += num(t.valor); }
      if (t.lleno === false) return;
      if (ancla && !(num(t.km) > num(ancla.km))) return;   // otro tanque lleno con el mismo km: no cierra tramo y sus galones se suman al siguiente
      if (ancla && g > 0) {
        const k = num(t.km) - num(ancla.km), prom = out.length >= TAN_MIN_TRAMOS ? sumKm / sumGal : 0;
        out.push({ t, km: k, galones: g, valor: val, kmGal: k / g, costoKm: val / k, prom, raro: prom > 0 && k / g < prom * TAN_RARO });
        sumKm += k; sumGal += g;
      }
      ancla = t; g = 0; val = 0;
    });
    return out;
  }
  const tramosVeh = id => tramosDe(tanDe(id));
  /** Promedio de varios tramos: km por galón y pesos de combustible por km. */
  function rendimiento(trs) {
    const k = trs.reduce((s, x) => s + x.km, 0), g = trs.reduce((s, x) => s + x.galones, 0), v = trs.reduce((s, x) => s + x.valor, 0);
    return { tramos: trs.length, km: k, kmGal: g ? k / g : 0, costoKm: k ? v / k : 0 };
  }
  /** Lo que costó cada mantenimiento «Hecho» del plan (los planes anteriores solo guardaban el último). */
  const gastosMtto = v => mttosDe(v).flatMap(m => (Array.isArray(m.hechos) ? m.hechos.filter(h => h && typeof h === 'object')
    : num(m.ultimoCosto) > 0 && m.ultimaFecha ? [{ fecha: m.ultimaFecha, costo: m.ultimoCosto }] : []));
  /** Cuánto costó un carro desde `ini` (YYYY-MM-DD; vacío = todo): novedades, mantenimientos del plan y combustible. */
  function costosDe(v, ini) {
    const en = f => !ini || String(f || '').slice(0, 10) >= ini;
    const nov = novDe(v.id).filter(n => en(n.fecha)).reduce((s, n) => s + num(n.costo), 0);
    const mtt = gastosMtto(v).filter(h => en(h.fecha)).reduce((s, h) => s + num(h.costo), 0);
    const comb = tanDe(v.id).filter(t => en(t.fecha)).reduce((s, t) => s + num(t.valor), 0);
    return { nov, mtt, comb, total: nov + mtt + comb };
  }
  /** Un reporte de «Revisión antes de salir» que nadie ha revisado todavía: mientras tanto el carro no sale otra vez. */
  const PREFIJO_REV = 'Revisión antes de salir:';
  const reporteSinRevisar = v => D().novedades.find(n => n.vehiculoId === v.id && !n.revisada && String(n.descripcion || '').startsWith(PREFIJO_REV)) || null;
  const ultimaSalida = v => entDe(v.id).find(e => e.tipo === 'salida') || null;
  const reunionPorId = id => D().reuniones.find(r => r.id === id) || null;
  /** Viajes de reunión con carro asignado que todavía no terminan (para el conductor). */
  function viajes() {
    return D().necesidades.filter(n => n.tipo === 'viaje' && n.vehiculoId && ['pendiente', 'listo'].includes(n.estado)).filter(n => {
      const r = reunionPorId(n.reunionId); if (!r || !ACTIVA.includes(r.estado) || String(r.fecha) < A().hoyISO()) return false;
      const llegada = D().entregas.some(e => e.reunionId === n.reunionId && e.vehiculoId === n.vehiculoId && e.tipo === 'llegada');
      return !llegada;
    }).sort((a, b) => String(a.fechaReunion).localeCompare(String(b.fechaReunion)));
  }
  const salioEn = n => D().entregas.some(e => e.reunionId === n.reunionId && e.vehiculoId === n.vehiculoId && e.tipo === 'salida');
  // Los viajes le llegan al rol Conductor (en la demo hay un solo conductor con cuenta).
  const misViajes = () => viajes();
  /* ---------- reservas de carro (viajes que no son reuniones) ---------- */
  const reservas = () => D().reservas || [];
  const resPorId = id => reservas().find(r => r.id === id) || null;
  const miCorreo = () => (window.nube && window.nube.correo ? window.nube.correo() : '');
  // «Mía»: la que pedí yo (por mi correo; las de datos viejos, por mi nombre).
  const esMiaRes = r => (r.pideCorreo ? r.pideCorreo === miCorreo() : r.por === persona().nombre);
  const salioRes = r => D().entregas.some(e => e.reservaId === r.id && e.tipo === 'salida');
  const llegoRes = r => D().entregas.some(e => e.reservaId === r.id && e.tipo === 'llegada');
  const porFecha = (a, b) => String(a.fecha + a.hora).localeCompare(String(b.fecha + b.hora));
  /** Pedidos que esperan respuesta de Transporte, Bodega o la Jefe (los de fechas que ya pasaron y los propios no cuentan: nadie decide lo suyo). */
  const porAprobar = () => reservas().filter(r => r.estado === 'pedida' && r.fecha >= A().hoyISO() && !esMiaRes(r)).sort(porFecha);
  /** Reservas aprobadas que todavía no terminan (sin llegada): todas para Transporte, Bodega y la Jefe; para el Conductor, las suyas. */
  const verReservada = r => esAdmin() || (esConductor() && r.conductor === persona().nombre);
  const reservadas = () => reservas().filter(r => r.estado === 'aprobada' && !llegoRes(r) && verReservada(r)).sort(porFecha);
  /** Mis pedidos: los que esperan respuesta, los que rechazaron hace poco y las aprobadas que no veo en «reservados» (las pidió uno y las maneja otro). */
  function misPedidos() {
    const corte = masDias(A().hoyISO(), -7);
    return reservas().filter(esMiaRes).filter(r => r.estado === 'pedida' || (r.estado === 'rechazada' && String(r.decideEn) >= corte) || (r.estado === 'aprobada' && !llegoRes(r) && !verReservada(r))).sort(porFecha);
  }
  const cancelable = r => !salioRes(r) && ((esAdmin() && ['pedida', 'aprobada'].includes(r.estado)) || (r.estado === 'pedida' && esMiaRes(r) && puedeReportar()));
  function resumen() {
    const vs = D().vehiculos;
    return {
      disponibles: vs.filter(v => v.estado === 'disponible').length,
      enUso: vs.filter(v => v.estado === 'en-uso').length,
      novedades: sinRevisar().length,
      docs: vs.reduce((n, v) => n + docsMal(v).length, 0),
      mttos: mttosPend().length,
      mias: esAdmin() ? sinRevisar().length + vs.filter(v => docsMal(v).length).length + mttosPend().length + porAprobar().length : esConductor() ? misViajes().length + reservadas().length : 0
    };
  }
  /** Carros que se pueden asignar a una reunión o a una reserva en esa fecha (no en taller, papeles al día ese día, sin otro viaje ese día). */
  function libresPara(fecha, reunionId, reservaId) {
    const ocupados = new Set(D().necesidades.filter(n => n.tipo === 'carros' && n.estado === 'autorizado' && n.reunionId !== reunionId && n.fechaReunion === fecha)
      .flatMap(n => (Array.isArray(n.vehiculos) ? n.vehiculos : []).map(x => x && x.vehiculoId)));
    // Un carro con una reserva aprobada ese día tampoco está libre (menos para la misma reserva, que lo cambia).
    reservas().filter(r => r.estado === 'aprobada' && r.fecha === fecha && r.id !== reservaId).forEach(r => ocupados.add(r.vehiculoId));
    return D().vehiculos.filter(v => v.estado !== 'en-taller' && !ocupados.has(v.id) && String(v.soat) >= fecha && String(v.tecno) >= fecha)
      .sort((a, b) => String(a.placa).localeCompare(String(b.placa)));
  }

  /* ---------- avisos de vencimiento (dentro de la app) ---------- */
  // Al entrar Transporte, Bodega o la Jefe, se crea un aviso por cada documento por vencer o vencido (una sola vez por fecha).
  let revisados = '';
  function avisarVencimientos() {
    if (!esAdmin() || A().cargando('vehiculos') || A().cargando('avisos')) return;
    const firma = D().vehiculos.map(v => v.id + v.soat + v.tecno).join('|') + miRol();
    if (firma === revisados) return;
    revisados = firma;
    const ops = [];
    D().vehiculos.forEach(v => docsMal(v).forEach(k => {
      const nombre = k === 'soat' ? 'SOAT' : 'técnico-mecánica', d = dias(v[k]);
      const id = `doc-${v.id}-${k}-${v[k]}`.replace(/[^A-Za-z0-9-]/g, '');
      if (D().avisos.some(a => a.id === id)) return;
      const txt = d < 0 ? `La ${nombre} del ${v.placa} venció hace ${-d} días. Ese carro no debe salir.` : `La ${nombre} del ${v.placa} vence en ${d} días.`;
      ['jefe', 'carros', 'asistente'].forEach(rol => ops.push(['set', 'avisos', `${id}-${rol}`, { para: rol, titulo: d < 0 ? `${nombre} vencido` : `${nombre} por vencer`, texto: txt, en: ahora(), modulo: 'vehiculos', leido: {}, deUid: window.nube.uid() }]));
    }));
    const nuevos = ops.filter(o => !D().avisos.some(a => a.id === o[2]));
    if (nuevos.length) window.nube.lote(nuevos).catch(() => {});
  }

  /* ---------- pintar ---------- */
  function secciones() {
    if (esGerente()) return [['resumen', 'Resumen'], ['reportes', 'Reportes'], ['carros', 'Carros'], ['novedades', 'Novedades'], ['tanqueos', 'Tanqueos']];
    const s = [['hacer', 'Lo que me toca'], ['carros', 'Carros'], ['novedades', 'Novedades'], ['tanqueos', 'Tanqueos']];
    if (esAdmin()) s.push(['resumen', 'Resumen'], ['reportes', 'Reportes']);
    return s;
  }
  function pintar() {
    const App = A(), S = App.S;
    if (!S.persona) return;
    if (rolPintado !== S.persona.rol) { rolPintado = S.persona.rol; seccion = secciones()[0][0]; }
    const f = S.filtro.vehiculos;
    if (['disponible', 'docs', 'uso', 'taller'].includes(f)) seccion = 'carros';
    if (f === 'novedad') seccion = 'novedades';
    if (!secciones().some(x => x[0] === seccion)) seccion = secciones()[0][0];
    const n = resumen();
    App.tablero('vehiculos', [
      { k: 'v-disp', n: n.disponibles, lbl: 'Disponibles', icono: 'carro', tono: 'disco', filtro: 'disponible' },
      { k: 'v-uso', n: n.enUso, lbl: 'En uso', icono: 'persona', tono: 'listo', filtro: 'uso' },
      { k: 'v-nov', n: n.novedades, lbl: 'Novedades sin revisar', icono: 'aviso', tono: 'org', filtro: 'novedad' },
      { k: 'v-doc', n: n.docs + n.mttos, lbl: 'Documentos y mantenimientos', icono: 'calendario', tono: 'peligro', filtro: 'docs' }
    ]);
    $('vehSecciones').innerHTML = secciones().map(([k, t]) => `<button type="button" class="chip" data-sec="${k}" aria-pressed="${seccion === k}">${esH(t)}${k === 'hacer' && n.mias ? ` <span class="n">${n.mias}</span>` : ''}</button>`).join('');
    const c = $('vehContenido');
    if (['vehiculos', 'novedades', 'entregas', 'tanqueos', 'reservas'].some(App.cargando)) { UI.poner(c, UI.esqueleto(3)); return; }
    if (UI.poner(c, ({ hacer: htmlHacer, carros: () => htmlCarros(f), novedades: () => htmlNovedades(f), tanqueos: htmlTanqueos, resumen: htmlResumen, reportes: htmlReportes })[seccion]())) window.llenarIconos(c);
    avisarVencimientos();
  }
  const boton = (acc, txt, icono, id, clase, extra) => `<button class="btn ${clase || 'small'}" type="button" data-accion="${acc}" data-id="${esH(id)}"${extra || ''}>${icono ? `<span data-ico="${icono}"></span>` : ''}${esH(txt)}</button>`;
  const docPill = (nombre, f) => { const e = estDoc(f), d = dias(f); return A().pill(`${nombre}: ${e === 'vencido' ? `venció hace ${-d} días` : e === 'pronto' ? `vence en ${d} días` : e === 'sin' ? 'sin fecha' : A().fechaCorta(f)}`, e === 'vencido' ? 's-peligro' : e === 'pronto' ? 's-org' : 's-disco', e === 'ok' ? 'check' : 'aviso'); };
  const foto = s => (typeof s === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(s) ? s : '');

  /* --- Lo que me toca --- */
  function htmlHacer() {
    let h = '';
    if (puedeReportar()) h += `<div class="barra-botones">${boton('novedad', 'Reportar una novedad', 'aviso', '', 'primary')}${boton('pedircarro', 'Pedir un carro', 'carro', '', 'small')}${boton('tanqueo', 'Registrar tanqueo', 'pagada', '', 'small')}</div>`;
    if (esAdmin()) {
      const pa = porAprobar();
      h += `<div class="section-label">Carros por aprobar (${pa.length})</div>`;
      h += pa.length ? `<div class="list">${pa.map(r => tarjetaReserva(r, 'decidir')).join('')}</div>` : '<p class="meta">No hay pedidos de carro por aprobar.</p>';
    }
    if (esAdmin() || esConductor()) {
      const rs = reservadas();
      h += `<div class="section-label">${esConductor() ? 'Mis viajes con carro reservado' : 'Carros reservados'} (${rs.length})</div>`;
      h += rs.length ? `<div class="list">${rs.map(r => tarjetaReserva(r, 'reservada')).join('')}</div>` : `<p class="meta">${esConductor() ? 'Cuando te aprueben un carro para un viaje, aparece aquí para registrar la salida y la llegada.' : 'No hay carros reservados.'}</p>`;
    }
    if (puedeReportar()) {
      const mp = misPedidos();
      if (mp.length) h += `<div class="section-label">Mis pedidos de carro (${mp.length})</div><div class="list">${mp.map(r => tarjetaReserva(r, 'mia')).join('')}</div>`;
    }
    if (esConductor() || esJefe()) {
      const vs = esJefe() ? viajes() : misViajes();
      h += `<div class="section-label">Viajes de reuniones (${vs.length})</div>`;
      h += vs.length ? `<div class="list">${vs.map(tarjetaViaje).join('')}</div>` : UI.vacio('carro', 'No tienes viajes pendientes', 'Cuando la Jefe te asigne un carro para una reunión, aparece aquí para registrar la salida y la llegada.');
      if (esConductor()) {
        const enUso = D().vehiculos.filter(v => v.estado === 'en-uso' && v.conductor === persona().nombre && !vs.some(x => x.vehiculoId === v.id && salioEn(x)));
        if (enUso.length) h += `<div class="section-label">Carros que tienes</div><div class="list">${enUso.map(v => `<div class="card tarea st-listo"><div class="tarea-t"><b><span class="placa">${esH(v.placa)}</span> ${esH(v.marca)} ${esH(v.modelo)}</b><span class="meta">Salió ${esH(A().hace((ultimaSalida(v) || {}).fecha))}</span></div><div class="tarea-pie">${boton('llegada', 'Registrar llegada', 'llave', v.id, 'primary small')}${boton('ver', 'Hoja de vida', '', v.id, 'ghost small')}</div></div>`).join('')}</div>`;
      }
    }
    if (esAdmin()) {
      const ns = sinRevisar().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
      h += `<div class="section-label">Novedades por revisar (${ns.length})</div>`;
      h += ns.length ? `<div class="list">${ns.map(tarjetaNovedad).join('')}</div>` : '<p class="meta">No hay novedades por revisar.</p>';
      const docs = D().vehiculos.filter(v => docsMal(v).length);
      h += `<div class="section-label">Documentos por vencer o vencidos (${docs.length})</div>`;
      h += docs.length ? `<div class="list">${docs.map(v => `<div class="card tarea st-${docsMal(v).some(k => estDoc(v[k]) === 'vencido') ? 'peligro' : 'org'}"><div class="tarea-t"><b><span class="placa">${esH(v.placa)}</span> ${esH(v.marca)} ${esH(v.modelo)}</b></div><span class="docs">${docPill('SOAT', v.soat)}${docPill('Técnico-mecánica', v.tecno)}</span><div class="tarea-pie">${boton('docs', 'Actualizar fechas', 'calendario', v.id, 'primary small')}${boton('ver', 'Hoja de vida', '', v.id, 'ghost small')}</div></div>`).join('')}</div>` : '<p class="meta">Todos los documentos están al día.</p>';
      const mp = mttosPend();
      h += `<div class="section-label">Mantenimientos por hacer (${mp.length})</div>`;
      h += mp.length ? `<div class="list">${mp.map(x => tarjetaMtto(x, true)).join('')}</div>` : '<p class="meta">No hay mantenimientos por vencer.</p>';
    }
    return h;
  }
  /** Una tarea del plan de un carro: qué es, cada cuánto, cuándo se hizo por última vez y cuánto falta. */
  function tarjetaMtto({ v, m, e }, conPlaca = true) {
    const cada = [num(m.cadaKm) > 0 ? `cada ${km(m.cadaKm)}` : '', num(m.cadaDias) > 0 ? `cada ${num(m.cadaDias)} días` : ''].filter(Boolean).join(' o ');
    const tono = e.est === 'vencido' ? 'peligro' : e.est === 'pronto' ? 'org' : 'disco';
    return `<div class="card tarea st-${tono}"><div class="tarea-t"><b>${conPlaca ? `<span class="placa">${esH(v.placa)}</span> ` : ''}${esH(m.tarea)}</b>
      <span class="meta">${esH(cada)}. Último: ${esH(km(m.ultimoKm))}${m.ultimaFecha ? ' · ' + esH(A().fechaCorta(m.ultimaFecha)) : ''}${num(m.ultimoCosto) ? ' · costó ' + esH(A().cop(m.ultimoCosto)) : ''}</span></div>
      <span class="docs">${A().pill(e.est === 'vencido' ? `Toca ya: ${e.texto}` : e.est === 'pronto' ? `Pronto: ${e.texto}` : `Al día: ${e.texto}`, e.est === 'vencido' ? 's-peligro' : e.est === 'pronto' ? 's-org' : 's-disco', e.est === 'ok' ? 'check' : 'mantenimiento')}</span>
      ${esAdmin() ? `<div class="tarea-pie">${boton('mttohecho', 'Hecho', 'check', v.id, e.est === 'ok' ? 'small' : 'primary small', ` data-mtto="${esH(m.id)}"`)}${conPlaca ? boton('ver', 'Hoja de vida', '', v.id, 'ghost small') : boton('mttoquitar', 'Quitar del plan', '', v.id, 'ghost small', ` data-mtto="${esH(m.id)}"`)}</div>` : ''}</div>`;
  }
  /** Un pedido de carro. modo: «decidir» (Transporte, Bodega o la Jefe aprueban o rechazan), «reservada» (con la salida y la llegada) o «mia» (lo que yo pedí). */
  function tarjetaReserva(r, modo) {
    const App = A(), e = RES_EST[r.estado] || ['Sin estado', 'none', 'pend'], v = r.vehiculoId ? vehPorId(r.vehiculoId) : null, hoy = App.hoyISO();
    const salio = salioRes(r), pasoDia = r.fecha < hoy && !salio && ['pedida', 'aprobada'].includes(r.estado);
    const bts = [];
    if (modo === 'decidir') bts.push(boton('aprobares', 'Aprobar y escoger carro', 'check', r.id, 'primary small'), boton('rechazares', 'Rechazar', '', r.id, 'ghost small'));
    if (modo === 'reservada' && v) {
      const puede = esAdmin() || (esConductor() && r.conductor === persona().nombre);
      if (salio) { if (puede && v.estado === 'en-uso') bts.push(boton('llegada', 'Registrar llegada', 'llave', v.id, 'primary small', ` data-reserva="${esH(r.id)}"`)); }
      else if (r.fecha <= hoy) bts.push(puede && v.estado === 'disponible' ? boton('salida', 'Registrar salida', 'llave', v.id, 'primary small', ` data-reserva="${esH(r.id)}"`) : App.pill(v.estado === 'en-uso' ? 'El carro está en uso: espera la llegada' : v.estado === 'en-taller' ? 'El carro está en taller' : 'Aún no puedes sacarlo', 's-org', 'aviso'));
    }
    if (cancelable(r) && (modo === 'reservada' || modo === 'mia')) bts.push(boton('cancelares', modo === 'mia' ? 'Cancelar el pedido' : 'Cancelar la reserva', 'x', r.id, 'ghost small'));
    const libres = modo === 'decidir' ? libresPara(r.fecha, '', r.id).length : null;
    return `<div class="card tarea st-${pasoDia ? 'peligro' : e[2]}" data-reserva-card="${esH(r.id)}">
      <div class="tarea-t"><b>${r.estado === 'aprobada' ? `<span class="placa">${esH(r.placa)}</span> → ` : ''}${esH(r.destino)}</b>
        <span class="meta">${esH(App.fechaCorta(r.fecha))}, ${esH(r.hora)} · pidió ${esH(r.por)}${esMiaRes(r) && modo !== 'mia' ? ' (tú)' : ''}</span>
        <span class="meta">${esH(r.motivo)}</span>
        ${r.estado === 'aprobada' ? `<span class="meta">Conductor: ${esH(r.conductor)} · aprobó ${esH(r.decidePor)}${salio ? ' · ya salió: falta la llegada' : ''}</span>` : ''}
        ${r.estado === 'rechazada' ? `<span class="meta">Rechazó ${esH(r.decidePor)}: ${esH(r.motivoRechazo)}</span>` : ''}</div>
      <span class="docs">${App.pill(e[0], e[1])}${pasoDia ? App.pill('Ya pasó el día', 's-peligro', 'aviso') : ''}${libres != null ? App.pill(libres ? `Carros libres ese día: ${libres}` : 'No hay carros libres ese día', libres ? 's-disco' : 's-peligro', libres ? 'carro' : 'aviso') : ''}</span>
      ${bts.length ? `<div class="tarea-pie">${bts.join('')}</div>` : ''}
    </div>`;
  }
  function tarjetaViaje(n) {
    const v = vehPorId(n.vehiculoId), r = reunionPorId(n.reunionId);
    const salio = salioEn(n);
    const puede = esJefe() || esConductor();
    const bt = !puede ? '' : salio ? boton('llegada', 'Registrar llegada', 'llave', n.vehiculoId, 'primary small', ` data-viaje="${esH(n.id)}"`) : (v && v.estado !== 'disponible' ? A().pill(v.estado === 'en-uso' ? 'El carro está en uso: espera la llegada' : 'El carro está en taller', 's-org', 'aviso') : boton('salida', 'Registrar salida', 'llave', n.vehiculoId, 'primary small', ` data-viaje="${esH(n.id)}"`));
    return `<div class="card tarea st-${salio ? 'listo' : 'org'}">
      <div class="tarea-t"><b><span class="placa">${esH(n.placa || (v && v.placa) || '')}</span> → ${esH(n.comunidad)}</b><span class="meta">${esH(r ? `${A().fechaCorta(r.fecha)}, ${r.hora}${r.lugar ? ' · ' + r.lugar : ''}` : A().fechaCorta(n.fechaReunion))} · conductor: ${esH(n.conductor || 'sin asignar')}</span>
      ${n.estado === 'pendiente' ? '<span class="meta">Falta confirmar el viaje en Reuniones.</span>' : ''}${salio ? '<span class="meta">Ya salió: falta registrar la llegada.</span>' : ''}</div>
      <div class="tarea-pie">${bt}${boton('ver', 'Hoja de vida', '', n.vehiculoId, 'ghost small')}</div>
    </div>`;
  }
  function tarjetaNovedad(n) {
    const f = foto(n.foto);
    return `<div class="card tarea st-${n.revisada ? 'disco' : 'org'}">
      <div class="nov-fila">${f ? `<img class="nov-foto" src="${esH(f)}" alt="Foto de la novedad del ${esH(n.placa)}">` : ''}
        <div class="tarea-t"><b>${esH(TIPO_NOV[n.tipo] || 'Novedad')}: <span class="placa">${esH(n.placa)}</span></b><span class="meta">${esH(n.descripcion)}</span>
        <span class="meta">${esH(n.reporta)} · ${esH(A().hace(n.fecha))} · ${esH(km(n.km))}${n.revisada ? ` · revisó ${esH(n.revisadaPor)}${num(n.costo) ? ' · ' + esH(A().cop(n.costo)) : ''}` : ''}</span>${n.nota ? `<span class="meta">Nota: ${esH(n.nota)}</span>` : ''}</div></div>
      <div class="tarea-pie">${!n.revisada && esAdmin() ? boton('revisar', 'Revisar', 'check', n.id, 'primary small') : n.revisada ? A().pill('Revisada', 's-disco', 'check') : A().pill('Sin revisar', 's-org')}${boton('ver', 'Hoja de vida', '', n.vehiculoId, 'ghost small')}</div>
    </div>`;
  }

  /* --- Carros --- */
  function htmlCarros(f) {
    const App = A();
    const q = buscar.trim().toLowerCase();
    const base = D().vehiculos.slice().sort((a, b) => String(a.placa).localeCompare(String(b.placa)))
      .filter(v => !q || [v.placa, v.marca, v.modelo, v.conductor, v.color].join(' ').toLowerCase().includes(q));
    const FILTROS = { disponible: v => v.estado === 'disponible', uso: v => v.estado === 'en-uso', taller: v => v.estado === 'en-taller', docs: v => docsMal(v).length > 0 || conMtto(v) };
    const vs = FILTROS[f] ? base.filter(FILTROS[f]) : base;
    const chip = (k, txt, n) => `<button type="button" class="chip" data-accion="filtroveh" data-id="${k}" aria-pressed="${(f || '') === k}">${esH(txt)} <span class="n">${n}</span></button>`;
    const bd = `<input class="search" id="qVeh" type="search" placeholder="Buscar placa, marca, modelo o conductor" autocomplete="off" aria-label="Buscar carro" value="${esH(buscar)}">`
      + window.ExcelBD.html(cfgVehiculos())
      + `<div class="chips" role="group" aria-label="Filtrar carros">${chip('', 'Todos', base.length)}${chip('disponible', 'Disponible', base.filter(FILTROS.disponible).length)}${chip('uso', 'En uso', base.filter(FILTROS.uso).length)}${chip('taller', 'En taller', base.filter(FILTROS.taller).length)}${chip('docs', 'Documentos y mantenimientos', base.filter(FILTROS.docs).length)}</div>`;
    if (!vs.length) return bd + UI.vacio('carro', 'No hay carros con ese filtro', '') + (f || q ? `<div class="barra-botones">${boton('filtroveh', 'Quitar filtro', 'x', '', 'primary', ' data-modo="todo"')}</div>` : '');
    return bd + `<div class="list">${vs.map(v => {
      const st = EST[v.estado] || ['Sin estado', 'none', 'pend'], pend = novDe(v.id).filter(n => !n.revisada).length;
      return `<button type="button" class="card st-${pend ? 'org' : st[2]}" data-accion="ver" data-id="${esH(v.id)}">
        <span class="card-head"><span class="card-title"><span class="placa">${esH(v.placa)}</span></span>${App.pill(st[0], st[1])}</span>
        <span class="card-sub">${esH(v.marca)} ${esH(v.modelo)} ${esH(v.anio)}${v.color ? ' · ' + esH(v.color) : ''}</span>
        <span class="facts"><span>${window.ico('persona')} <b>${esH(v.conductor || 'Sin conductor')}</b></span><span class="valor">${esH(km(v.km))}</span></span>
        <span class="docs">${docPill('SOAT', v.soat)}${docPill('Técnico-mecánica', v.tecno)}${pend ? App.pill(`${pend} ${pend === 1 ? 'novedad' : 'novedades'} sin revisar`, 's-org', 'aviso') : ''}${mttosDe(v).map(m => ({ m, e: estMtto(m, v) })).filter(x => x.e.est !== 'ok').slice(0, 2).map(x => App.pill(`${x.m.tarea}: ${x.e.texto}`, x.e.est === 'vencido' ? 's-peligro' : 's-org', 'mantenimiento')).join('')}</span>
      </button>`;
    }).join('')}</div>`;
  }
  function htmlNovedades() {
    const ns = D().novedades.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    let h = puedeReportar() ? `<div class="barra-botones">${boton('novedad', 'Reportar una novedad', 'aviso', '', 'primary')}</div>` : '';
    return h + (ns.length ? `<div class="list">${ns.map(tarjetaNovedad).join('')}</div>` : UI.vacio('checkCirculo', 'No hay novedades', ''));
  }
  /** Un tanqueo: cuánto echó, cuánto pagó, la foto del recibo y, si cerró un tramo entre dos tanques llenos, lo que rindió. */
  function tarjetaTanqueo(t, x) {
    const f = foto(t.foto);
    return `<div class="card tarea st-${x && x.raro ? 'peligro' : 'disco'}">
      <div class="nov-fila">${f ? `<img class="nov-foto" src="${esH(f)}" alt="Recibo del tanqueo del ${esH(t.placa)}">` : ''}
        <div class="tarea-t"><b><span class="placa">${esH(t.placa)}</span> ${esH(A().cop(t.valor))}</b>
        <span class="meta">${esH(nGal(t.galones))} galones${t.lleno === false ? ' (no llenó el tanque)' : ''} · ${esH(km(t.km))} · ${esH(t.por)} · ${esH(A().hace(t.fecha))}</span>
        ${x ? `<span class="meta">Rindió ${esH(nKmGal(x.kmGal))} km por galón${x.raro ? ` (lo normal: ${esH(nKmGal(x.prom))})` : ''} · el combustible costó ${esH(A().cop(Math.round(x.costoKm)))} por km</span>` : ''}</div></div>
      ${x && x.raro ? `<span class="docs">${A().pill(`Consumo raro: ${Math.round((1 - x.kmGal / x.prom) * 100)} % menos de lo normal`, 's-peligro', 'aviso')}</span>` : ''}
    </div>`;
  }
  function htmlTanqueos() {
    const ts = D().tanqueos.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const tramos = new Map(); D().vehiculos.forEach(v => tramosVeh(v.id).forEach(x => tramos.set(x.t.id, x)));
    const h = puedeReportar() ? `<div class="barra-botones">${boton('tanqueo', 'Registrar tanqueo', 'pagada', '', 'primary')}</div>` : '';
    if (!ts.length) return h + UI.vacio('pagada', 'Todavía no hay tanqueos', puedeReportar() ? 'Cuando un carro eche combustible, registra el tanqueo con la foto del recibo.' : '');
    const raros = ts.filter(t => tramos.get(t.id) && tramos.get(t.id).raro).length;
    return h + (raros ? `<div class="aviso peligro" role="status"><span><b>${raros} ${raros === 1 ? 'tanqueo con consumo raro' : 'tanqueos con consumo raro'}:</b> el carro rindió mucho menos de lo normal. Revisa el recibo y pregunta qué pasó.</span></div>` : '')
      + `<div class="list">${ts.slice(0, 40).map(t => tarjetaTanqueo(t, tramos.get(t.id))).join('')}</div>`
      + (ts.length > 40 ? `<p class="meta">Se muestran los últimos 40 de ${ts.length}. Todos van en el Excel de Reportes.</p>` : '');
  }
  function htmlResumen() {
    const App = A(), vs = D().vehiculos, mes = A().hoyISO().slice(0, 7);
    const delMes = D().novedades.filter(n => String(n.fecha).slice(0, 7) === mes);
    const costo = delMes.reduce((s, n) => s + num(n.costo), 0);
    const porTipo = Object.keys(TIPO_NOV).map(t => [TIPO_NOV[t], delMes.filter(n => n.tipo === t).length]).filter(x => x[1]);
    const max = Math.max(1, ...porTipo.map(x => x[1]));
    const proximos = viajes();
    const ini = mes + '-01', cs = vs.slice().sort((a, b) => String(a.placa).localeCompare(String(b.placa))).map(v => ({ v, c: costosDe(v, ini) }));
    const tot = cs.reduce((t, x) => ({ nov: t.nov + x.c.nov, mtt: t.mtt + x.c.mtt, comb: t.comb + x.c.comb, total: t.total + x.c.total }), { nov: 0, mtt: 0, comb: 0, total: 0 });
    let h = `<div class="resumen-grid">
      <div class="card"><span class="meta">Costo total de los carros este mes</span><span class="rm-n">${esH(App.cop(tot.total))}</span><span class="meta">Novedades ${esH(App.cop(tot.nov))} · mantenimientos ${esH(App.cop(tot.mtt))} · combustible ${esH(App.cop(tot.comb))}</span></div>
      <div class="card"><span class="meta">Costo de novedades este mes</span><span class="rm-n">${esH(App.cop(costo))}</span><span class="meta">${delMes.length} novedades</span></div>
      <div class="card"><span class="meta">Carros</span><span class="rm-n">${vs.length}</span><span class="meta">${resumen().disponibles} disponibles · ${resumen().enUso} en uso · ${vs.filter(v => v.estado === 'en-taller').length} en taller</span></div>
      <div class="card"><span class="meta">Documentos por vencer o vencidos</span><span class="rm-n">${resumen().docs}</span>${resumen().docs ? App.pill('Revisar fechas', 's-peligro', 'aviso') : App.pill('Al día', 's-disco', 'check')}</div>
    </div>`;
    h += `<div class="section-label">Costo de cada carro este mes</div><div class="list">${cs.sort((a, b) => b.c.total - a.c.total).map(({ v, c }) => `<button type="button" class="card" data-accion="ver" data-id="${esH(v.id)}">
      <span class="card-head"><span class="card-title"><span class="placa">${esH(v.placa)}</span> ${esH(v.marca)} ${esH(v.modelo)}</span><b class="valor">${esH(App.cop(c.total))}</b></span>
      <span class="facts"><span>Novedades ${esH(App.cop(c.nov))}</span><span>Mantenimientos ${esH(App.cop(c.mtt))}</span><span>Combustible ${esH(App.cop(c.comb))}</span></span></button>`).join('')}</div>`;
    h += `<div class="section-label">Novedades del mes por tipo</div><div class="card">${porTipo.length ? `<div class="barras">${porTipo.map(([t, v]) => `<div class="bf"><span class="bf-n">${esH(t)}</span><span class="bf-b"><i style="width:${Math.max(4, Math.round(v / max * 100))}%"></i></span><span class="bf-v">${v}</span></div>`).join('')}</div>` : '<p class="meta">Sin novedades este mes.</p>'}</div>`;
    h += `<div class="section-label">Carros para las próximas reuniones (${proximos.length})</div>` + (proximos.length ? `<div class="list">${proximos.map(n => `<div class="card"><b><span class="placa">${esH(n.placa)}</span> → ${esH(n.comunidad)}</b><span class="meta">${esH(App.fechaCorta(n.fechaReunion))} · ${esH(n.conductor)}</span></div>`).join('')}</div>` : '<p class="meta">Ninguna reunión tiene carro asignado todavía.</p>');
    return h;
  }

  /* --- Reportes (Gerente, Jefe, Transporte y Bodega) --- */
  const PERIODOS = [['mes', 'Este mes'], ['3m', 'Últimos 3 meses'], ['todo', 'Todo']];
  function desde() {
    const h = new Date(A().hoyISO() + 'T00:00:00');
    if (periodo === 'mes') return A().hoyISO().slice(0, 8) + '01';
    if (periodo === '3m') { h.setMonth(h.getMonth() - 3); return h.toISOString().slice(0, 10); }
    return '';
  }
  const enPeriodo = f => !desde() || String(f || '').slice(0, 10) >= desde();
  /** Cada viaje: una salida con su llegada (si ya llegó), con los km recorridos y las horas fuera. */
  function viajesHechos() {
    const out = [];
    D().vehiculos.forEach(v => {
      const es = D().entregas.filter(e => e.vehiculoId === v.id).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
      es.forEach((e, k) => {
        if (e.tipo !== 'salida') return;
        const sig = es.slice(k + 1).find(x => x.tipo === 'llegada' || x.tipo === 'salida');
        const lleg = sig && sig.tipo === 'llegada' ? sig : null;
        const r = reunionPorId(e.reunionId || (lleg && lleg.reunionId));
        out.push({ v, salida: e, llegada: lleg, km: lleg ? Math.max(0, num(lleg.km) - num(e.km)) : 0,
          horas: lleg ? Math.max(0, Math.round((new Date(lleg.fecha) - new Date(e.fecha)) / 360000) / 10) : 0,
          problemas: [e, lleg].filter(Boolean).some(x => !Object.values(x.revision || {}).every(Boolean)), reunion: r ? r.comunidad : '' });
      });
    });
    return out.sort((a, b) => String(b.salida.fecha).localeCompare(String(a.salida.fecha)));
  }
  function datosReporte() {
    const vs = viajesHechos().filter(x => enPeriodo(x.salida.fecha)), ns = D().novedades.filter(n => enPeriodo(n.fecha));
    const porCarro = D().vehiculos.slice().sort((a, b) => String(a.placa).localeCompare(String(b.placa))).map(v => {
      const mv = vs.filter(x => x.v.id === v.id), mn = ns.filter(n => n.vehiculoId === v.id);
      const c = costosDe(v, desde()), rd = rendimiento(tramosVeh(v.id).filter(x => enPeriodo(x.t.fecha)));
      return { v, salidas: mv.length, km: mv.reduce((s, x) => s + x.km, 0), problemas: mv.filter(x => x.problemas).length, novedades: mn.length, costo: mn.reduce((s, n) => s + num(n.costo), 0), sinRevisar: mn.filter(n => !n.revisada).length,
        mtt: c.mtt, comb: c.comb, total: c.nov + c.mtt + c.comb, kmGal: rd.kmGal, costoKm: rd.costoKm };
    });
    const nombres = Array.from(new Set(vs.map(x => x.salida.conductor).concat(ns.filter(n => n.reportaRol === 'conductor').map(n => n.reporta)).filter(Boolean))).sort();
    const porConductor = nombres.map(c => {
      const mv = vs.filter(x => x.salida.conductor === c);
      return { c, salidas: mv.length, km: mv.reduce((s, x) => s + x.km, 0), problemas: mv.filter(x => x.problemas).length, novedades: ns.filter(n => n.reporta === c).length };
    });
    const ts = D().tanqueos.filter(t => enPeriodo(t.fecha)).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    return { vs, ns, ts, porCarro, porConductor };
  }
  function htmlReportes() {
    const App = A(), r = datosReporte(), kmTotal = r.vs.reduce((s, x) => s + x.km, 0), costo = r.ns.reduce((s, n) => s + num(n.costo), 0);
    let h = `<div class="chips sub" role="group" aria-label="Periodo">${PERIODOS.map(([k, t]) => `<button type="button" class="chip" data-periodo="${k}" aria-pressed="${periodo === k}">${esH(t)}</button>`).join('')}</div>`;
    h += `<div class="resumen-grid">
      <div class="card"><span class="meta">Salidas</span><span class="rm-n">${r.vs.length}</span><span class="meta">${r.vs.filter(x => !x.llegada).length} sin llegada todavía</span></div>
      <div class="card"><span class="meta">Kilómetros recorridos</span><span class="rm-n">${esH(kmTotal.toLocaleString('es-CO'))}</span><span class="meta">${r.vs.filter(x => x.problemas).length} salidas con problemas en la revisión</span></div>
      <div class="card"><span class="meta">Novedades</span><span class="rm-n">${r.ns.length}</span><span class="meta">${esH(App.cop(costo))} en costos · ${r.ns.filter(n => !n.revisada).length} sin revisar</span></div>
      <div class="card"><span class="meta">Costo total de los carros</span><span class="rm-n">${esH(App.cop(r.porCarro.reduce((t, x) => t + x.total, 0)))}</span><span class="meta">Novedades ${esH(App.cop(costo))} · mantenimientos ${esH(App.cop(r.porCarro.reduce((t, x) => t + x.mtt, 0)))} · combustible ${esH(App.cop(r.porCarro.reduce((t, x) => t + x.comb, 0)))}</span></div>
    </div>`;
    h += `<div class="barra-botones">${boton('excelveh', 'Descargar Excel', 'excel', '', 'small')}</div>`;
    h += `<div class="section-label">Por carro</div><div class="list">${r.porCarro.map(x => `<button type="button" class="card" data-accion="ver" data-id="${esH(x.v.id)}">
      <span class="card-head"><span class="card-title"><span class="placa">${esH(x.v.placa)}</span> ${esH(x.v.marca)} ${esH(x.v.modelo)}</span>${App.pill((EST[x.v.estado] || ['Sin estado'])[0], (EST[x.v.estado] || ['', 'none'])[1])}</span>
      <span class="facts"><span>${x.salidas} ${x.salidas === 1 ? 'salida' : 'salidas'}</span><span>${esH(km(x.km))} recorridos</span><span>${x.novedades} ${x.novedades === 1 ? 'novedad' : 'novedades'}${x.costo ? ' · ' + esH(App.cop(x.costo)) : ''}</span></span>
      <span class="facts"><span>Combustible ${esH(App.cop(x.comb))}</span><span>${x.kmGal ? esH(nKmGal(x.kmGal)) + ' km por galón' : 'sin rendimiento todavía'}</span><span><b>Total ${esH(App.cop(x.total))}</b></span></span>
      <span class="docs">${docPill('SOAT', x.v.soat)}${docPill('Técnico-mecánica', x.v.tecno)}${x.problemas ? App.pill(`${x.problemas} con problemas en la revisión`, 's-peligro', 'aviso') : ''}${x.sinRevisar ? App.pill(`${x.sinRevisar} sin revisar`, 's-org', 'aviso') : ''}</span>
    </button>`).join('')}</div>`;
    h += `<div class="section-label">Por conductor</div>` + (r.porConductor.length ? `<div class="list">${r.porConductor.map(x => `<div class="card"><span class="card-head"><span class="card-title">${esH(x.c)}</span>${x.problemas ? App.pill(`${x.problemas} con problemas`, 's-peligro', 'aviso') : ''}</span>
      <span class="facts"><span>${x.salidas} ${x.salidas === 1 ? 'salida' : 'salidas'}</span><span>${esH(km(x.km))} recorridos</span><span>${x.novedades} ${x.novedades === 1 ? 'novedad reportada' : 'novedades reportadas'}</span></span></div>`).join('')}</div>` : '<p class="meta">Sin salidas en este periodo.</p>');
    h += `<div class="section-label">Salidas y llegadas (${r.vs.length})</div>` + (r.vs.length ? `<ul class="necesidades-l">${r.vs.slice(0, 40).map(x => `<li><span class="nf-cab"><span class="nf-t"><b><span class="placa">${esH(x.v.placa)}</span> ${esH(x.salida.conductor)}${x.reunion ? ' → ' + esH(x.reunion) : ''}</b>
      <span class="meta">Salió ${esH(App.hace(x.salida.fecha))} (${esH(km(x.salida.km))}, combustible ${esH(x.salida.combustible)})${x.llegada ? ` · llegó con ${esH(km(x.llegada.km))}, combustible ${esH(x.llegada.combustible)} · ${esH(km(x.km))} en ${esH(String(x.horas).replace('.', ','))} h` : ' · todavía no llega'}</span>
      ${[x.salida.observaciones, x.llegada && x.llegada.observaciones].filter(Boolean).map(o => `<span class="meta">${esH(o)}</span>`).join('')}
      <span class="docs">${x.problemas ? App.pill('Revisión con problemas', 's-peligro', 'aviso') : App.pill('Revisión bien', 's-disco', 'check')}</span></span></span></li>`).join('')}</ul>` : '<p class="meta">Sin salidas en este periodo.</p>');
    return h;
  }
  async function excelVehiculos(b) {
    b.disabled = true;
    try {
      const f = window.Inventario.fechaLocal, r = datosReporte(), hojas = [], gen = `Generado el ${A().hoyISO()}.`;
      const TIT = { Carros: ['Carros', 'Estado, kilometraje y salidas de cada carro.'], 'Salidas y llegadas': ['Salidas y llegadas', 'Cada salida con su llegada, kilómetros y revisión.'],
        Novedades: ['Novedades', 'Lo que reportaron los conductores, con su costo y si ya se revisó.'], 'Por conductor': ['Por conductor', 'Resumen de cada conductor.'],
        Tanqueos: ['Tanqueos', 'Cada vez que un carro echó combustible, con lo que rindió entre un tanque lleno y el siguiente.'] };
      const hoja = (nombre, filas) => hojas.push(window.Excel.deObjetos(nombre, TIT[nombre][0], `${TIT[nombre][1]} ${gen}`, filas));
      hoja('Carros', r.porCarro.map(x => ({ Placa: x.v.placa, Carro: `${x.v.marca} ${x.v.modelo} ${x.v.anio}`, Estado: (EST[x.v.estado] || [x.v.estado])[0], Conductor: x.v.conductor, Kilometraje: num(x.v.km), Salidas: x.salidas, 'Km recorridos': x.km, 'Con problemas': x.problemas, Novedades: x.novedades, 'Costo novedades': x.costo, 'Costo mantenimientos': x.mtt, 'Costo combustible': x.comb, 'Costo total': x.total, 'Km por galón': x.kmGal ? Math.round(x.kmGal * 10) / 10 : '', 'Costo combustible por km': x.costoKm ? Math.round(x.costoKm) : '', 'SOAT vence': x.v.soat, 'Técnico-mecánica vence': x.v.tecno })));
      hoja('Salidas y llegadas', r.vs.map(x => ({ Placa: x.v.placa, Conductor: x.salida.conductor, Reunión: x.reunion, Salió: f(x.salida.fecha, true), 'Km salida': num(x.salida.km), 'Combustible salida': x.salida.combustible, Entregó: x.salida.con, Llegó: x.llegada ? f(x.llegada.fecha, true) : 'Todavía no', 'Km llegada': x.llegada ? num(x.llegada.km) : '', 'Combustible llegada': x.llegada ? x.llegada.combustible : '', Recibió: x.llegada ? x.llegada.con : '', 'Km recorridos': x.km, Horas: x.horas, Revisión: x.problemas ? 'Con problemas' : 'Bien', 'Críticos (salida)': textoRevision(x.salida.revision).criticos, 'Otros (salida)': textoRevision(x.salida.revision).otros, 'Críticos (llegada)': x.llegada ? textoRevision(x.llegada.revision).criticos : '', 'Otros (llegada)': x.llegada ? textoRevision(x.llegada.revision).otros : '', Observaciones: [x.salida.observaciones, x.llegada && x.llegada.observaciones].filter(Boolean).join(' · ') })));
      hoja('Novedades', r.ns.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).map(n => ({ Fecha: f(n.fecha, true), Placa: n.placa, Tipo: TIPO_NOV[n.tipo] || n.tipo, Qué: n.descripcion, Km: num(n.km), Reportó: n.reporta, Costo: num(n.costo), Revisada: n.revisada ? 'Sí' : 'No', 'Revisó': n.revisadaPor, Nota: n.nota })));
      const tramos = new Map(); D().vehiculos.forEach(v => tramosVeh(v.id).forEach(x => tramos.set(x.t.id, x)));
      hoja('Tanqueos', r.ts.map(t => { const x = tramos.get(t.id); return { Fecha: f(t.fecha, true), Placa: t.placa, Km: num(t.km), Galones: num(t.galones), Valor: num(t.valor), 'Tanque lleno': t.lleno === false ? 'No' : 'Sí',
        'Km por galón': x ? Math.round(x.kmGal * 10) / 10 : '', 'Costo combustible por km': x ? Math.round(x.costoKm) : '', 'Consumo raro': x ? (x.raro ? 'Sí' : 'No') : '', Registró: t.por }; }));
      hoja('Por conductor', r.porConductor.map(x => ({ Conductor: x.c, Salidas: x.salidas, 'Km recorridos': x.km, 'Con problemas': x.problemas, 'Novedades reportadas': x.novedades })));
      await window.Excel.descargar({ archivo: `Vehiculos ${A().hoyISO()}`, hojas });
      A().toast('Listo: Excel descargado');
    } catch (e) { A().toast('No se pudo preparar el Excel. Revisa la conexión y vuelve a intentar.'); }
    finally { b.disabled = false; }
  }

  /* ---------- hoja de acción ---------- */
  const campoTxt = (id, lbl, v, ph, max, tipo) => `<div class="field"><label for="${id}">${lbl}</label><input id="${id}" type="${tipo || 'text'}" maxlength="${max || 120}" autocomplete="off" value="${esH(v == null ? '' : v)}" placeholder="${esH(ph || '')}"></div>`;
  const campoNum = (id, lbl, v, min, max) => `<div class="field"><label for="${id}">${lbl}</label><input id="${id}" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${esH(v)}"></div>`;
  const campoSel = (id, lbl, ops, v) => `<div class="field"><label for="${id}">${lbl}</label><select id="${id}">${ops.map(([val, t]) => `<option value="${esH(val)}"${val === v ? ' selected' : ''}>${esH(t)}</option>`).join('')}</select></div>`;
  const marca = (id, lbl, ok) => `<label class="marca-fila"><input type="checkbox" id="${id}"${ok ? ' checked' : ''}><span>${esH(lbl)}</span></label>`;
  // Cada punto de la revisión se marca «Bien» o «Mal» (dos botones). Empiezan sin marcar para que nadie pase de largo sin mirar.
  const filaRev = ([k, t]) => `<div class="rev-fila"><span class="rev-t" id="vrt_${k}">${esH(t)}</span><div class="seg" role="radiogroup" aria-labelledby="vrt_${k}"><label><input type="radio" name="vr_${k}" value="bien"><span>Bien</span></label><label><input type="radio" name="vr_${k}" value="mal"><span>Mal</span></label></div></div>`;
  const revisionMarcada = () => { const r = {}; REVISION.forEach(([k]) => { const x = document.querySelector(`#veCampos input[name="vr_${k}"]:checked`); if (x) r[k] = x.value === 'bien'; }); return r; };
  /** En una salida, si un punto crítico está mal: aviso «no debe salir» y el botón pasa a «Reportar y no salir». */
  function alCambiarRevision() {
    if (!accion || !accion.esSalida) return;
    const mal = REV_CRITICOS.filter(([k]) => revisionMarcada()[k] === false).map(([, t]) => t.toLowerCase());
    const al = $('vsAlerta'), pri = $('vePrimario');
    if (al) al.innerHTML = mal.length ? `<div class="aviso peligro" role="alert"><span><b>Este carro no debe salir:</b> ${esH(mal.join(', '))} ${mal.length === 1 ? 'está mal' : 'están mal'}. Cuenta qué falla en observaciones y toma una foto del problema: se le avisa a Transporte, Bodega y la Jefe.</span></div>` : '';
    pri.innerHTML = mal.length ? window.ico('aviso') + 'Reportar y no salir' : (accion.icono ? window.ico(accion.icono) : '') + esH(accion.primario);
  }
  const campoFoto = (id, lbl) => `<div class="field foto-campo"><span class="lbl">${esH(lbl)}</span><label class="btn foto-btn"><span data-ico="camara"></span><span id="${id}Txt">Tomar foto</span><input id="${id}" class="archivo-oculto" type="file" accept="image/*" capture="environment" data-foto="${id}"></label><img id="${id}Ver" class="nov-foto" alt="${esH(lbl)}" hidden></div>`;
  const valor = id => ($(id) ? $(id).value.trim() : '');
  const entero = id => { const v = valor(id); return /^\d+$/.test(v) ? Number(v) : NaN; };
  /** Pesos escritos por una persona: vacío = 0; acepta «150000», «150.000» o «$ 150.000»; cualquier otra cosa da NaN (no se guarda en silencio como $ 0). */
  const pesos = id => {
    const el = $(id); if (!el) return 0;
    const v = el.value.trim().replace(/^\$\s*/, '');
    if (v === '') return el.validity && el.validity.badInput ? NaN : 0;
    if (/^\d+$/.test(v)) return Number(v);
    if (/^\d{1,3}(\.\d{3})+$/.test(v)) return Number(v.replace(/\./g, ''));
    return NaN;
  };
  // Decimal con coma o punto y hasta 2 decimales (los galones: 12,5).
  const decimal = id => { const v = valor(id).replace(',', '.'); return /^\d{1,3}(\.\d{1,2})?$/.test(v) ? Number(v) : NaN; };
  function fallar(msg, id) { const e = $('veErr'); e.textContent = msg; e.hidden = false; if (id && $(id)) $(id).focus(); return false; }
  function abrir(o) {
    accion = o;
    $('veT').textContent = o.titulo; $('veSub').textContent = o.sub || '';
    $('veCampos').innerHTML = o.campos || '';
    window.llenarIconos($('veCampos'));
    const pri = $('vePrimario'); pri.hidden = !o.primario; pri.disabled = false;
    pri.innerHTML = o.primario ? (o.icono ? window.ico(o.icono) : '') + esH(o.primario) : '';
    $('veCerrar').textContent = o.primario ? 'Cancelar' : 'Cerrar';
    $('veErr').hidden = true;
    A().abrirHoja('shVeh');
    A().vigilar('shVeh', () => $('veForm'), () => JSON.stringify([fotoNov.length, fotoTan.length, Object.entries(fotos).map(([k, f]) => [k, f.length])]));
    const sh = $('shVeh').querySelector('.sheet'); if (sh) sh.scrollTop = 0;
  }
  function aviso(para, titulo, txt) {
    if (!para || para === miRol()) return null;
    pushPendientes.push({ para, titulo, texto: txt });
    return ['set', 'avisos', window.nube.idNuevo('av'), { para, titulo, texto: txt, en: ahora(), modulo: 'vehiculos', leido: {}, deUid: window.nube.uid() }];
  }
  const historial = v => (Array.isArray(v.historial) ? v.historial : []).filter(x => x && typeof x === 'object');
  const paso = (v, texto) => historial(v).concat([{ fecha: ahora(), texto, por: persona().nombre }]);
  async function guardar() {
    if (guardando || !accion || !accion.ops) return;
    $('veErr').hidden = true;
    if (accion.base) {
      const act = vehPorId(accion.base.id);
      if (!act || act.estado !== accion.base.estado || num(act.km) !== num(accion.base.km) || historial(act).length !== historial(accion.base).length) return fallar('El carro cambió mientras tenías esto abierto. Ciérralo y ábrelo otra vez.');
    }
    pushPendientes = [];
    const ops = accion.ops(); if (!ops) return;
    const lista = ops.filter(Boolean), envios = pushPendientes.slice();
    guardando = true; $('vePrimario').disabled = true;
    try {
      if (lista.length) await window.nube.lote(lista);
      A().cerrarHoja('shVeh');
      try { $('vehContenido').focus({ preventScroll: true }); } catch (e) {}
      A().toast(accion.listo);
      const volver = accion.volver;
      accion = null;
      notificar(envios);
      if (volver) setTimeout(() => { const v = vehPorId(volver); if (v && $('shVeh').hidden) ver(v); }, 350);
    } catch (e) { fallar(window.nube.explicar(e)); }
    finally { guardando = false; $('vePrimario').disabled = false; }
  }
  function notificar(envios) {
    if (!window.Push || !envios.length) return;
    envios.forEach(e => Promise.resolve(window.Push.enviar(e.para, { titulo: e.titulo, texto: e.texto, url: './#vehiculos', etiqueta: 'vehiculos' })).catch(() => {}));
  }
  // Fotos: cada input con data-foto se achica y se guarda en «fotos» (o en fotoNov para la novedad).
  async function alEscogerFoto(e) {
    const inp = e.target.closest('input[data-foto]'); if (!inp) return;
    const f = inp.files && inp.files[0], id = inp.dataset.foto; inp.value = ''; if (!f) return;
    const txt = $(id + 'Txt'), ver = $(id + 'Ver');
    txt.textContent = 'Preparando…';
    try {
      const grande = id === 'vnFoto' || id === 'vqFoto';   // la novedad y el recibo llevan una sola foto más grande; las 5 de la salida, pequeñas
      const dato = await window.Inventario.leerFoto(f, grande ? 1280 : 720, grande ? 300000 : 100000);
      if (id === 'vnFoto') fotoNov = dato; else if (id === 'vqFoto') fotoTan = dato; else fotos[id] = dato;
      ver.src = dato; ver.hidden = false; txt.textContent = 'Cambiar'; $('veErr').hidden = true;
    } catch (er) { txt.textContent = 'Tomar foto'; fallar(er.message === 'grande' ? 'La foto es muy pesada. Toma otra más de cerca.' : 'Ese archivo no es una foto.'); }
  }

  /* ---------- acciones ---------- */
  function novedad(v) {
    fotoNov = '';
    const opciones = D().vehiculos.slice().sort((a, b) => String(a.placa).localeCompare(String(b.placa))).map(x => [x.id, `${x.placa} · ${x.marca} ${x.modelo}`]);
    abrir({ titulo: 'Reportar una novedad', sub: 'La foto es obligatoria. Transporte, Bodega y la Jefe reciben el aviso.',
      campos: campoSel('vnVeh', 'Carro', opciones, v ? v.id : (D().vehiculos.find(x => x.conductor === persona().nombre) || D().vehiculos[0] || {}).id) +
        campoSel('vnTipo', 'Tipo', Object.keys(TIPO_NOV).map(k => [k, TIPO_NOV[k]]), 'rayon') +
        campoNum('vnKm', 'Kilometraje', '', 0, 2000000) +
        `<div class="field"><label for="vnDesc">Qué pasó</label><textarea id="vnDesc" rows="3" maxlength="300" placeholder="Ej: rayón en la puerta derecha, cerca de la manija"></textarea></div>` +
        campoFoto('vnFoto', 'Foto de la novedad (obligatoria)') +
        (esAdmin() ? campoNum('vnCosto', 'Costo (si ya se sabe)', '', 0, 100000000) : ''),
      primario: 'Reportar', icono: 'enviar', listo: 'Listo: novedad reportada. Ya les llegó el aviso.',
      ops: () => {
        const veh = vehPorId(valor('vnVeh')), kmv = entero('vnKm'), desc = valor('vnDesc'), costo = esAdmin() ? pesos('vnCosto') : 0;
        if (!veh) return fallar('Escoge el carro.', 'vnVeh');
        if (!(kmv >= 0)) return fallar('Escribe el kilometraje.', 'vnKm');
        if (kmv + 5000 < num(veh.km)) return fallar(`El kilometraje parece bajo: el carro va en ${km(veh.km)}.`, 'vnKm');
        if (desc.length < 5) return fallar('Cuenta qué pasó.', 'vnDesc');
        if (!(costo >= 0)) return fallar('Escribe el costo en pesos, solo números (ejemplo: 150000).', 'vnCosto');
        if (!fotoNov) return fallar('Falta la foto de la novedad.');
        const tipo = valor('vnTipo');
        return [['set', 'novedades', window.nube.idNuevo('no'), { vehiculoId: veh.id, placa: veh.placa, tipo, fecha: ahora(), km: kmv, descripcion: desc, foto: fotoNov,
          reporta: persona().nombre, reportaRol: miRol(), costo, revisada: false, revisadaPor: '', revisadaEn: '', nota: '' }]]
          .concat(['jefe', 'carros', 'asistente', 'gerente'].map(rol => aviso(rol, 'Novedad en un carro', `${persona().nombre} reportó ${(TIPO_NOV[tipo] || 'una novedad').toLowerCase()} en el ${veh.placa}: ${desc.slice(0, 100)}`)));
      } });
  }
  /** Un tanqueo: kilometraje, galones, lo pagado y la foto del recibo. Si rinde mucho menos de lo normal del carro, avisa a Transporte, Bodega y la Jefe. */
  function tanqueo(v) {
    fotoTan = '';
    const opciones = D().vehiculos.slice().sort((a, b) => String(a.placa).localeCompare(String(b.placa))).map(x => [x.id, `${x.placa} · ${x.marca} ${x.modelo}`]);
    abrir({ titulo: 'Registrar un tanqueo', sub: 'La foto del recibo es obligatoria. Con dos tanques llenos seguidos se calcula cuántos km rinde el carro.',
      campos: campoSel('vqVeh', 'Carro', opciones, v ? v.id : (D().vehiculos.find(x => x.conductor === persona().nombre) || D().vehiculos[0] || {}).id) +
        `<div class="fields cols">${campoNum('vqKm', 'Kilometraje', '', 0, 2000000)}<div class="field"><label for="vqGal">Galones</label><input id="vqGal" type="text" inputmode="decimal" maxlength="6" autocomplete="off" placeholder="Ej: 12,5"></div></div>` +
        campoNum('vqValor', 'Lo que se pagó, en pesos', '', 0, 5000000) +
        marca('vqLleno', 'Llené el tanque hasta arriba', true) + '<p class="meta">Quita la marca si fue solo un poco de combustible: así el cálculo de km por galón sale bien.</p>' +
        campoFoto('vqFoto', 'Foto del recibo (obligatoria)'),
      primario: 'Guardar tanqueo', icono: 'check', listo: 'Listo: tanqueo guardado.',
      ops: () => {
        const veh = vehPorId(valor('vqVeh')), kmv = entero('vqKm'), g = decimal('vqGal'), pagado = entero('vqValor'), lleno = $('vqLleno').checked;
        if (!veh) return fallar('Escoge el carro.', 'vqVeh');
        if (!(kmv >= 0)) return fallar('Escribe el kilometraje (solo números).', 'vqKm');
        const ult = tanDe(veh.id).slice(-1)[0];
        if (ult && kmv < num(ult.km)) return fallar(`El kilometraje no puede ser menor que el del último tanqueo (${km(ult.km)}).`, 'vqKm');
        if (kmv + 5000 < num(veh.km)) return fallar(`El kilometraje parece bajo: el carro va en ${km(veh.km)}.`, 'vqKm');
        if (kmv > num(veh.km) + 3000) return fallar('El kilometraje parece muy alto. Revísalo.', 'vqKm');
        if (!(g >= 0.5 && g <= 100)) return fallar('Escribe los galones (de 0,5 a 100), por ejemplo 12,5.', 'vqGal');
        if (!(pagado > 0 && pagado <= 5000000)) return fallar('Escribe lo que se pagó en pesos, sin puntos ni comas.', 'vqValor');
        const precio = pagado / g;
        if (precio < TAN_PRECIO_MIN || precio > TAN_PRECIO_MAX) return fallar(`Eso da ${A().cop(Math.round(precio))} por galón. Revisa los galones y lo que se pagó.`, 'vqValor');
        if (!fotoTan) return fallar('Falta la foto del recibo.');
        const id = window.nube.idNuevo('ta');
        const nuevo = { vehiculoId: veh.id, placa: veh.placa, fecha: ahora(), km: kmv, galones: g, valor: pagado, lleno, foto: fotoTan, por: persona().nombre, porRol: miRol() };
        const x = tramosDe(tanDe(veh.id).concat([Object.assign({ id }, nuevo)])).find(y => y.t.id === id);
        const ops = [['set', 'tanqueos', id, nuevo]];
        if (x && x.raro) {
          const txt = `El ${veh.placa} rindió ${nKmGal(x.kmGal)} km por galón; lo normal es ${nKmGal(x.prom)}. Tanqueó ${persona().nombre}.`;
          accion.listo = 'Listo: tanqueo guardado. El consumo salió raro y ya les llegó el aviso.';
          ['carros', 'asistente', 'jefe'].forEach(rol => ops.push(aviso(rol, 'Consumo raro en un carro', txt)));
        }
        return ops;
      } });
  }
  function revisar(n) {
    const v = vehPorId(n.vehiculoId), f = foto(n.foto);
    abrir({ titulo: `Revisar: ${TIPO_NOV[n.tipo] || 'novedad'} del ${n.placa}`, sub: `${n.reporta}, ${A().hace(n.fecha)} · ${km(n.km)}`,
      campos: `<p>${esH(n.descripcion)}</p>${f ? `<img class="factura" src="${esH(f)}" alt="Foto de la novedad">` : ''}` +
        campoNum('vrCosto', 'Costo', num(n.costo) || '', 0, 100000000) + campoTxt('vrNota', 'Nota', '', 'Ej: se llevó al taller del convenio', 160) +
        (v && v.estado === 'disponible' ? marca('vrTaller', 'Mandar el carro al taller', n.tipo === 'choque') : v && v.estado === 'en-uso' ? '<p class="meta">El carro está en uso. Si hay que llevarlo al taller, hazlo después de que llegue.</p>' : ''),
      primario: 'Marcar como revisada', icono: 'check', listo: 'Listo: novedad revisada.', base: v ? Object.assign({}, v) : null,
      ops: () => {
        const costo = pesos('vrCosto'), nota = valor('vrNota');
        if (!(costo >= 0)) return fallar('Escribe el costo en pesos, solo números (ejemplo: 150000).', 'vrCosto');
        const ops = [['mezclar', 'novedades', n.id, { costo, nota, revisada: true, revisadaPor: persona().nombre, revisadaEn: ahora() }]];
        if (v && $('vrTaller') && $('vrTaller').checked) ops.push(['mezclar', 'vehiculos', v.id, { estado: 'en-taller', conductor: '', historial: paso(v, `Entró al taller: ${TIPO_NOV[n.tipo] || 'novedad'}`) }]);
        if (n.reportaRol && n.reportaRol !== miRol()) ops.push(aviso(n.reportaRol, 'Revisaron tu novedad', `${persona().nombre} revisó ${(TIPO_NOV[n.tipo] || 'la novedad').toLowerCase()} del ${n.placa}${nota ? ': ' + nota : '.'}`));
        return ops;
      } });
  }
  function docs(v) {
    abrir({ titulo: `Documentos del ${v.placa}`, sub: 'Escribe las fechas nuevas de vencimiento.',
      campos: `<div class="fields cols">${campoTxt('vdSoat', 'SOAT vence', v.soat, '', 10, 'date')}${campoTxt('vdTecno', 'Técnico-mecánica vence', v.tecno, '', 10, 'date')}</div>`,
      primario: 'Guardar fechas', icono: 'check', listo: 'Listo: fechas actualizadas.', base: Object.assign({}, v),
      ops: () => {
        const soat = valor('vdSoat'), tecno = valor('vdTecno');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(soat) || !/^\d{4}-\d{2}-\d{2}$/.test(tecno)) return fallar('Escribe las dos fechas.');
        return [['mezclar', 'vehiculos', v.id, { soat, tecno, historial: paso(v, `Actualizó los documentos (SOAT ${A().fechaCorta(soat)}, técnico-mecánica ${A().fechaCorta(tecno)})`) }]];
      } });
  }
  /** El mantenimiento ya se hizo: se anota con qué kilometraje, qué día y cuánto costó, y el plan se pone al día. */
  function mttoHecho(v, mid) {
    const m = mttosDe(v).find(x => x.id === mid); if (!m) return null;
    abrir({ titulo: `Mantenimiento hecho: ${m.tarea}`, sub: `${v.placa} · ${v.marca} ${v.modelo}. Va en ${km(v.km)}.`,
      campos: `<div class="fields cols">${campoNum('vmKm', 'Kilometraje al hacerlo', v.km, 0, 2000000)}${campoTxt('vmFecha', 'Fecha', A().hoyISO(), '', 10, 'date')}</div>` +
        campoNum('vmCosto', 'Costo en pesos (0 si no se sabe)', 0, 0, 100000000) + campoTxt('vmNota', 'Nota (opcional)', '', 'Ej: también se cambió el filtro', 120),
      primario: 'Guardar', icono: 'check', listo: 'Listo: mantenimiento anotado. El plan quedó al día.', base: Object.assign({}, v),
      ops: () => {
        const kmv = entero('vmKm'), fecha = valor('vmFecha'), costo = valor('vmCosto') === '' ? 0 : entero('vmCosto'), nota = valor('vmNota');
        if (!(kmv >= 0)) return fallar('Escribe el kilometraje (solo números).', 'vmKm');
        if (kmv > num(v.km) + 3000) return fallar('El kilometraje parece muy alto. Revísalo.', 'vmKm');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > A().hoyISO()) return fallar('Revisa la fecha: no puede ser de mañana.', 'vmFecha');
        if (!(costo >= 0)) return fallar('Escribe el costo en pesos, sin puntos ni comas.', 'vmCosto');
        if (/^\d{4}-\d{2}-\d{2}$/.test(m.ultimaFecha || '') && fecha < m.ultimaFecha) return fallar(`La fecha no puede ser anterior a la última vez que se hizo (${A().fechaCorta(m.ultimaFecha)}).`, 'vmFecha');
        if (num(m.ultimoKm) > kmv) return fallar(`El kilometraje no puede ser menor que el de la última vez (${km(m.ultimoKm)}).`, 'vmKm');
        const act = vehPorId(v.id) || v;
        // Cada «Hecho» con costo se guarda (hasta 12 por tarea) para sumar lo gastado en cualquier periodo; los planes anteriores traían solo el último.
        const previos = Array.isArray(m.hechos) ? m.hechos : num(m.ultimoCosto) > 0 && m.ultimaFecha ? [{ fecha: m.ultimaFecha, km: m.ultimoKm, costo: m.ultimoCosto }] : [];
        const hechos = costo > 0 ? previos.concat([{ fecha, km: kmv, costo }]).slice(-12) : previos;
        const campos = { mttos: mttosDe(act).map(x => (x.id === mid ? Object.assign({}, x, { ultimoKm: kmv, ultimaFecha: fecha, ultimoCosto: costo, hechos }) : x)),
          historial: paso(act, `Mantenimiento hecho: ${m.tarea} (${km(kmv)}, ${A().fechaCorta(fecha)}${costo ? ', costó ' + A().cop(costo) : ''})${nota ? '. ' + nota : ''}`) };
        if (kmv > num(act.km)) campos.km = kmv;
        return [['mezclar', 'vehiculos', v.id, campos]];
      } });
  }
  /** Una tarea nueva del plan: qué se hace, cada cuántos km y/o días, y cuándo se hizo por última vez. */
  function mttoNuevo(v) {
    abrir({ titulo: `Agregar tarea al plan del ${v.placa}`, sub: 'Escribe cada cuánto se hace: por kilómetros, por días o por las dos (lo que llegue primero).',
      campos: campoTxt('vtTarea', 'Qué se hace', '', 'Ej: cambio de aceite', 60) +
        `<div class="fields cols">${campoNum('vtCadaKm', 'Cada cuántos km (0 = no aplica)', 5000, 0, 200000)}${campoNum('vtCadaDias', 'Cada cuántos días (0 = no aplica)', 180, 0, 3650)}</div>` +
        `<div class="fields cols">${campoNum('vtUltKm', 'La última vez: kilometraje', v.km, 0, 2000000)}${campoTxt('vtUltFecha', 'La última vez: fecha', A().hoyISO(), '', 10, 'date')}</div>`,
      primario: 'Agregar al plan', icono: 'check', listo: 'Listo: tarea agregada al plan.', base: Object.assign({}, v),
      ops: () => {
        const act = vehPorId(v.id) || v, tarea = valor('vtTarea'), cadaKm = entero('vtCadaKm'), cadaDias = entero('vtCadaDias'), ultKm = entero('vtUltKm'), fecha = valor('vtUltFecha');
        if (mttosDe(act).length >= 10) return fallar('Un carro lleva hasta 10 tareas en su plan.');
        if (tarea.length < 3) return fallar('Escribe qué se hace (por ejemplo, cambio de aceite).', 'vtTarea');
        if (!(cadaKm >= 0) || !(cadaDias >= 0)) return fallar('Escribe cada cuánto: solo números (0 si no aplica).', 'vtCadaKm');
        if (cadaKm === 0 && cadaDias === 0) return fallar('Escribe cada cuántos km o cada cuántos días (al menos uno).', 'vtCadaKm');
        if (!(ultKm >= 0) || ultKm > num(act.km)) return fallar(`El kilometraje de la última vez no puede ser mayor que el de hoy (${km(act.km)}).`, 'vtUltKm');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > A().hoyISO()) return fallar('Revisa la fecha de la última vez: no puede ser de mañana.', 'vtUltFecha');
        const nueva = { id: 'mt' + Date.now().toString(36), tarea, cadaKm, cadaDias, ultimoKm: ultKm, ultimaFecha: fecha, ultimoCosto: 0 };
        const cada = [cadaKm > 0 ? `cada ${km(cadaKm)}` : '', cadaDias > 0 ? `cada ${cadaDias} días` : ''].filter(Boolean).join(' o ');
        return [['mezclar', 'vehiculos', v.id, { mttos: mttosDe(act).concat([nueva]), historial: paso(act, `Plan de mantenimiento: agregó «${tarea}» (${cada})`) }]];
      } });
  }
  function mttoQuitar(v, mid) {
    const m = mttosDe(v).find(x => x.id === mid); if (!m) return null;
    abrir({ titulo: `Quitar «${m.tarea}» del plan`, sub: `${v.placa}. Se quita del plan; el historial del carro guarda que se quitó.`, campos: '<p class="meta">Si solo cambió cada cuánto se hace, quítala y agrégala otra vez con los datos nuevos.</p>',
      primario: 'Quitar del plan', icono: 'borrar', listo: 'Listo: tarea quitada del plan.', base: Object.assign({}, v),
      ops: () => { const act = vehPorId(v.id) || v; return [['mezclar', 'vehiculos', v.id, { mttos: mttosDe(act).filter(x => x.id !== mid), historial: paso(act, `Plan de mantenimiento: quitó «${m.tarea}»`) }]]; } });
  }
  function estado(v) {
    const aTaller = v.estado !== 'en-taller';
    abrir({ titulo: aTaller ? `Mandar el ${v.placa} al taller` : `El ${v.placa} salió del taller`, sub: aTaller ? 'Mientras esté en el taller no se puede asignar a reuniones.' : 'Queda disponible para salir.',
      campos: campoTxt('veMotivo', aTaller ? 'Motivo' : 'Qué se le hizo', '', aTaller ? 'Ej: revisión de frenos' : 'Ej: cambio de pastillas', 160),
      primario: aTaller ? 'Mandar al taller' : 'Marcar disponible', icono: 'check', listo: aTaller ? 'Listo: el carro está en el taller.' : 'Listo: el carro está disponible.', base: Object.assign({}, v),
      ops: () => {
        const m = valor('veMotivo');
        if (aTaller && v.estado === 'en-uso') return fallar('El carro está en uso. Primero registra la llegada.');
        return [['mezclar', 'vehiculos', v.id, { estado: aTaller ? 'en-taller' : 'disponible', conductor: '', historial: paso(v, (aTaller ? 'Entró al taller' : 'Salió del taller') + (m ? ': ' + m : '')) }]];
      } });
  }
  /* ---------- pedir un carro: pedir, aprobar, rechazar y cancelar ---------- */
  const fechaValida = f => /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(new Date(f + 'T12:00:00')) && masDias(f, 0) === f;
  function pedirCarro() {
    const hoy = A().hoyISO(), max = masDias(hoy, RES_MAX_DIAS);
    abrir({ titulo: 'Pedir un carro', sub: 'Para un viaje que no es una reunión. Transporte, Bodega o la Jefe lo aprueban y escogen el carro.',
      campos: `<div class="fields cols"><div class="field"><label for="vpFecha">Qué día</label><input id="vpFecha" type="date" min="${hoy}" max="${max}" value="${masDias(hoy, 1)}"></div>
        <div class="field"><label for="vpHora">A qué hora</label><input id="vpHora" type="time" value="08:00"></div></div><p class="meta" id="vpLibres" aria-live="polite"></p>` +
        campoTxt('vpDestino', 'A dónde va', '', 'Ej: Maicao, oficina del cliente', 80) + campoTxt('vpMotivo', 'Para qué', '', 'Ej: entregar los contratos firmados', 140),
      primario: 'Pedir el carro', icono: 'enviar', listo: 'Listo: pedido enviado. Transporte, Bodega y la Jefe ya recibieron el aviso.',
      ops: () => {
        const f = valor('vpFecha'), h = valor('vpHora'), dest = valor('vpDestino'), mot = valor('vpMotivo');
        if (!fechaValida(f) || f < hoy || f > max) return fallar(`Escoge el día: desde hoy hasta dentro de ${RES_MAX_DIAS} días.`, 'vpFecha');
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(h)) return fallar('Escribe la hora, por ejemplo 08:30.', 'vpHora');
        if (dest.length < 3) return fallar('Escribe a dónde va.', 'vpDestino');
        if (mot.length < 3) return fallar('Cuenta para qué es el viaje.', 'vpMotivo');
        const cuando = `${A().fechaCorta(f)} a las ${h}`;
        return [['set', 'reservas', window.nube.idNuevo('rs'), { fecha: f, hora: h, destino: dest, motivo: mot, estado: 'pedida', por: persona().nombre, porRol: miRol(), pideCorreo: miCorreo(), en: hoy }]]
          .concat(['jefe', 'carros', 'asistente'].map(rol => aviso(rol, 'Piden un carro', `${persona().nombre} pide un carro para el ${cuando}: ${dest}. Entra a Vehículos para aprobarlo.`)));
      } });
    const libresHoy = () => { const f = valor('vpFecha'), el = $('vpLibres'); if (!el) return; el.textContent = fechaValida(f) ? (() => { const n = libresPara(f).length; return n ? `Ese día hay ${n} ${n === 1 ? 'carro libre' : 'carros libres'} con los papeles al día.` : 'Ese día no hay carros libres con los papeles al día. Igual puedes pedirlo: Transporte lo revisa.'; })() : ''; };
    $('veCampos').oninput = $('veCampos').onchange = e => { if (e.target && e.target.id === 'vpFecha') libresHoy(); };
    libresHoy();
  }
  function aprobarCarro(r) {
    const libres = libresPara(r.fecha, '', r.id), conds = Array.from(new Set((r.porRol === 'conductor' ? [r.por] : []).concat(CONDUCTORES)));
    abrir({ titulo: 'Aprobar el carro', sub: `${r.destino}: ${A().fechaCorta(r.fecha)}, ${r.hora}. Pidió ${r.por} (${r.motivo}).`,
      campos: libres.length ? campoSel('vrVeh', 'Carro libre ese día', libres.map(v => [v.id, `${v.placa} · ${v.marca} ${v.modelo}${v.estado === 'en-uso' ? ' (ahora en uso)' : ''}`]), libres[0].id) + campoSel('vrCond', 'Conductor', conds.map(x => [x, x]), conds[0])
        + '<p class="meta">Solo salen carros que no están en el taller, con el SOAT y la técnico-mecánica al día ese día, y sin otra reserva ni reunión.</p>'
        : '<div class="note">No hay carros libres con los papeles al día para esa fecha. Puedes rechazar el pedido y decir por qué.</div>',
      primario: libres.length ? 'Aprobar' : '', icono: 'check', listo: 'Listo: carro aprobado. Ya le llegó el aviso a quien lo pidió y al conductor.',
      ops: () => {
        const act = resPorId(r.id);
        if (!act || act.estado !== 'pedida') return fallar('Este pedido ya cambió. Ciérralo y revisa la lista.');
        if (act.fecha < A().hoyISO()) return fallar('La fecha de este pedido ya pasó. Recházalo y dile a la persona que pida otro.');
        if (esMiaRes(act)) return fallar('Nadie aprueba lo suyo: lo decide otra persona.');
        const veh = libresPara(act.fecha, '', act.id).find(x => x.id === valor('vrVeh')), cond = valor('vrCond');
        if (!veh) return fallar('Ese carro ya no está libre ese día. Cierra esto y vuelve a abrirlo.', 'vrVeh');
        if (cond.length < 3) return fallar('Escoge el conductor.', 'vrCond');
        const txt = `${veh.placa} para el ${A().fechaCorta(act.fecha)} a las ${act.hora} (${act.destino}). Conductor: ${cond}.`;
        return [['mezclar', 'reservas', act.id, { estado: 'aprobada', vehiculoId: veh.id, placa: veh.placa, conductor: cond, decidePor: persona().nombre, decideCorreo: miCorreo(), decideEn: A().hoyISO() }]]
          .concat(Array.from(new Set([act.porRol, 'conductor'])).map(rol => aviso(rol, rol === 'conductor' && act.porRol !== 'conductor' ? 'Te tocó un viaje' : 'Te aprobaron el carro', txt)));
      } });
  }
  function rechazarCarro(r) {
    abrir({ titulo: 'Rechazar el pedido', sub: `${r.destino}: ${A().fechaCorta(r.fecha)}, ${r.hora}. Pidió ${r.por}.`,
      campos: campoTxt('vrMotivo', 'Por qué no', '', 'Ej: ese día todos los carros están en la reunión', 140),
      primario: 'Rechazar', icono: 'x', listo: 'Listo: pedido rechazado. Ya le llegó el aviso a quien lo pidió.',
      ops: () => {
        const act = resPorId(r.id), mot = valor('vrMotivo');
        if (!act || act.estado !== 'pedida') return fallar('Este pedido ya cambió. Ciérralo y revisa la lista.');
        if (esMiaRes(act)) return fallar('Nadie rechaza lo suyo: si ya no lo necesitas, cancélalo.');
        if (mot.length < 3) return fallar('Cuenta por qué no se puede.', 'vrMotivo');
        return [['mezclar', 'reservas', act.id, { estado: 'rechazada', motivoRechazo: mot, decidePor: persona().nombre, decideCorreo: miCorreo(), decideEn: A().hoyISO() }],
          aviso(act.porRol, 'Rechazaron tu pedido de carro', `${act.destino}, ${A().fechaCorta(act.fecha)}: ${mot}`)];
      } });
  }
  function cancelarReserva(r) {
    const aprobada = r.estado === 'aprobada';
    abrir({ titulo: aprobada ? 'Cancelar la reserva' : 'Cancelar el pedido', sub: `${r.destino}: ${A().fechaCorta(r.fecha)}, ${r.hora}${aprobada ? ` · ${r.placa}, conductor ${r.conductor}` : ''}.`,
      campos: `<div class="note">${aprobada ? 'El carro queda libre otra vez ese día.' : 'El pedido se cierra y ya no le llega a nadie.'} Esto no se puede deshacer: si hace falta, se pide de nuevo.</div>`,
      primario: aprobada ? 'Cancelar la reserva' : 'Cancelar el pedido', icono: 'x', listo: aprobada ? 'Listo: reserva cancelada. El carro quedó libre.' : 'Listo: pedido cancelado.',
      ops: () => {
        const act = resPorId(r.id);
        if (!act || !['pedida', 'aprobada'].includes(act.estado) || !cancelable(act)) return fallar('Esto ya cambió (por ejemplo, el carro ya salió). Ciérralo y revisa la lista.');
        const quien = esMiaRes(act) ? '' : `${persona().nombre} canceló ${act.estado === 'aprobada' ? 'la reserva' : 'el pedido'} de carro para el ${A().fechaCorta(act.fecha)} (${act.destino}).`;
        return [['mezclar', 'reservas', act.id, { estado: 'cancelada', canceladaPor: persona().nombre, canceladaEn: A().hoyISO() }]]
          .concat(quien ? Array.from(new Set([act.porRol].concat(act.estado === 'aprobada' ? ['conductor'] : []))).map(rol => aviso(rol, 'Cancelaron un carro', quien)) : []);
      } });
  }
  /** Salida o llegada del carro (con las 5 fotos y la revisión). */
  function entrega(v, tipo, viajeId, reservaId) {
    fotos = {};
    const salida = tipo === 'salida';
    // Si sale desde la hoja de vida y el carro tiene un viaje hoy, la salida queda ligada a ese viaje.
    const viaje = viajeId ? D().necesidades.find(n => n.id === viajeId) : salida ? viajes().find(n => n.vehiculoId === v.id && n.fechaReunion === A().hoyISO() && !salioEn(n)) || null : null;
    const ultima = ultimaSalida(v);
    // Si no es un viaje de reunión, puede ser una reserva aprobada: la que se tocó o, al salir desde la hoja de vida, la de hoy de ese carro (la llegada sigue la de su salida).
    const reserva = viaje ? null : reservaId ? resPorId(reservaId) : salida ? reservas().find(r => r.estado === 'aprobada' && r.vehiculoId === v.id && r.fecha === A().hoyISO() && !salioRes(r)) || null : (ultima && ultima.reservaId ? resPorId(ultima.reservaId) : null);
    const ligada = reserva && reserva.estado === 'aprobada' && reserva.vehiculoId === v.id ? reserva : null;
    const condDefecto = viaje ? viaje.conductor : ligada && salida ? ligada.conductor : salida ? (esConductor() ? persona().nombre : CONDUCTORES[0]) : (v.conductor || '');
    const conductores = Array.from(new Set([condDefecto, persona().nombre].concat(CONDUCTORES).filter(Boolean)));
    abrir({ titulo: `${salida ? 'Salida' : 'Llegada'} del ${v.placa}`, sub: viaje ? `Viaje a la ${viaje.comunidad}. Conductor: ${viaje.conductor || 'sin asignar'}.` : ligada ? `Viaje a ${ligada.destino}. Conductor: ${ligada.conductor}.` : `${v.marca} ${v.modelo}. Va en ${km(v.km)}.`,
      campos: (esConductor() && salida ? '' : campoSel('vsCond', 'Conductor', conductores.map(x => [x, x]), condDefecto)) +
        `<div class="fields cols">${campoNum('vsKm', 'Kilometraje', '', 0, 2000000)}${campoSel('vsComb', 'Combustible', COMBUSTIBLE, salida ? 'lleno' : '1/2')}</div>` +
        `<div class="field"><label for="vsCon">${salida ? 'Quién entrega el carro' : 'Quién recibe el carro'}</label><input id="vsCon" list="vsConLista" maxlength="60" autocomplete="off" value="${esH(miRol() === 'conductor' ? QUIEN_ENTREGA[0] : persona().nombre)}"><datalist id="vsConLista">${QUIEN_ENTREGA.map(x => `<option value="${esH(x)}">`).join('')}</datalist></div>` +
        `<div class="field"><span class="lbl">Fotos (todas obligatorias)</span><div class="fotos-grid">${LADOS.map(([k, t]) => campoFoto('vf_' + k, t)).join('')}</div></div>` +
        (salida ? '' : '<p class="meta">Revisión al llegar: marca solo lo que notes (los puntos que no marques no se cuentan).</p>') +
        `<div class="field"><span class="lbl">${salida ? 'Revisión antes de salir: lo más importante' : 'Revisión: lo más importante'}</span>${REV_CRITICOS.map(filaRev).join('')}</div>` +
        `<div class="field"><span class="lbl">${salida ? 'Revisión antes de salir: lo demás' : 'Revisión: lo demás'}</span>${REV_OTROS.map(filaRev).join('')}</div><div id="vsAlerta"></div>` +
        `<div class="field"><label for="vsObs">Observaciones</label><textarea id="vsObs" rows="2" maxlength="300" placeholder="Ej: llegó con poco combustible"></textarea></div>`,
      primario: salida ? 'Registrar salida' : 'Registrar llegada', icono: 'llave', listo: salida ? 'Listo: salida registrada. Transporte y Bodega ya saben.' : 'Listo: llegada registrada. El carro quedó disponible.',
      base: Object.assign({}, v), esSalida: salida,
      ops: () => {
        // Salida con un punto crítico mal: no sale. Se reporta el problema (con una foto) y se avisa; no hacen falta el kilometraje ni las 5 fotos.
        if (salida) {
          const rev0 = revisionMarcada(), criticos = REV_CRITICOS.filter(([k]) => rev0[k] === false).map(([, t]) => t);
          if (criticos.length) {
            const obs0 = valor('vsObs'), f0 = LADOS.map(([k]) => fotos['vf_' + k]).find(Boolean);
            if (obs0.length < 5) return fallar(`Este carro no debe salir (${criticos.join(', ').toLowerCase()}). Cuenta qué falla en observaciones.`, 'vsObs');
            if (!f0) return fallar('Toma al menos una foto del problema (cualquiera de las 5).');
            const desc = `${PREFIJO_REV} ${criticos.join(', ').toLowerCase()} mal. ${obs0}`.slice(0, 300);
            accion.listo = 'Listo: problema reportado. El carro no salió y ya les llegó el aviso.';
            return [['set', 'novedades', window.nube.idNuevo('no'), { vehiculoId: v.id, placa: v.placa, tipo: 'mantenimiento', fecha: ahora(), km: num(v.km), descripcion: desc, foto: f0,
              reporta: persona().nombre, reportaRol: miRol(), costo: 0, revisada: false, revisadaPor: '', revisadaEn: '', nota: '' }]]
              .concat(['jefe', 'carros', 'asistente', 'gerente'].map(rol => aviso(rol, 'Un carro no debe salir', `${persona().nombre} no sacó el ${v.placa}: ${desc.slice(0, 120)}`)));
          }
        }
        const sinPapel = salida ? ['soat', 'tecno'].filter(k => !['ok', 'pronto'].includes(estDoc(v[k]))).map(k => k === 'soat' ? 'el SOAT' : 'la técnico-mecánica') : [];
        if (sinPapel.length) return fallar(`Este carro tiene ${sinPapel.join(' y ')} vencido o sin fecha y no puede salir. Actualiza las fechas en «Documentos» (Transporte, Bodega o la Jefe).`);
        if (salida && reporteSinRevisar(v)) return fallar('Este carro tiene un problema reportado en la revisión y nadie lo ha revisado. Transporte o Bodega lo revisan primero (en Novedades).');
        const kmv = entero('vsKm'), cond = $('vsCond') ? valor('vsCond') : (viaje && viaje.conductor) || persona().nombre, con = valor('vsCon');
        if (!(kmv >= num(v.km))) return fallar(`El kilometraje no puede ser menor que el último registrado (${km(v.km)}).`, 'vsKm');
        if (!salida && ultima && kmv < num(ultima.km)) return fallar(`El kilometraje no puede ser menor que el de la salida (${km(ultima.km)}).`, 'vsKm');
        if (kmv > num(v.km) + 3000) return fallar('El kilometraje parece muy alto. Revísalo.', 'vsKm');
        if (!cond) return fallar('Escoge el conductor.', 'vsCond');
        if (con.length < 3) return fallar(salida ? 'Escribe quién entrega el carro.' : 'Escribe quién recibe el carro.', 'vsCon');
        const faltan = LADOS.filter(([k]) => !fotos['vf_' + k]).map(([, t]) => t.toLowerCase());
        if (faltan.length) return fallar(`Faltan fotos: ${faltan.join(', ')}.`);
        const revision = revisionMarcada();
        const sinMarcar = REVISION.filter(([k]) => !(k in revision)).map(([, t]) => t.toLowerCase());
        if (salida && sinMarcar.length) return fallar(`Falta marcar Bien o Mal en la revisión: ${sinMarcar.slice(0, 4).join(', ')}${sinMarcar.length > 4 ? ' y ' + (sinMarcar.length - 4) + ' más' : ''}.`);
        const malos = REVISION.filter(([k]) => revision[k] === false).map(([, t]) => t.toLowerCase());
        const obs = valor('vsObs');
        if (malos.length && obs.length < 5) return fallar(`Marcaste un problema (${malos.join(', ')}): cuéntalo en observaciones.`, 'vsObs');
        const ent = { vehiculoId: v.id, placa: v.placa, tipo, fecha: ahora(), km: kmv, combustible: valor('vsComb'), conductor: cond, con,
          fotos: { frente: fotos.vf_frente, atras: fotos.vf_atras, izquierda: fotos.vf_izquierda, derecha: fotos.vf_derecha, llantas: fotos.vf_llantas },
          revision, observaciones: obs, por: persona().nombre, porRol: miRol(), reunionId: viaje ? viaje.reunionId : (!salida && ultima ? ultima.reunionId || '' : ''), reservaId: ligada ? ligada.id : '' };
        const entId = window.nube.idNuevo('en');
        const ops = [['set', 'entregas', entId, ent],
          ['mezclar', 'vehiculos', v.id, { estado: salida ? 'en-uso' : 'disponible', km: kmv, conductor: salida ? cond : '', ultimaEntrega: entId, historial: paso(v, `${salida ? 'Salió con' : 'Llegó con'} ${cond} (${km(kmv)})${viaje ? ' · viaje a la ' + viaje.comunidad : ligada ? ' · viaje a ' + ligada.destino : ''}`) }]];
        const txt = `${v.placa} ${salida ? 'salió' : 'llegó'} con ${cond} (${km(kmv)}, combustible ${valor('vsComb')}).${malos.length ? ' Problemas: ' + malos.join(', ') + '.' : ''}`;
        ['carros', 'asistente'].forEach(rol => ops.push(aviso(rol, salida ? 'Salió un carro' : 'Llegó un carro', txt)));
        if (malos.length) ['jefe', 'gerente'].forEach(rol => ops.push(aviso(rol, 'Un carro tiene problemas', `${txt} ${obs}`)));
        return ops;
      } });
  }
  function asignar(v) {
    abrir({ titulo: `Conductor del ${v.placa}`, sub: 'El conductor que tiene el carro asignado.', campos: campoSel('vaCond', 'Conductor', [['', 'Sin conductor']].concat(CONDUCTORES.map(x => [x, x])), v.conductor || ''),
      primario: 'Guardar', icono: 'check', listo: 'Listo: conductor guardado.', base: Object.assign({}, v),
      ops: () => [['mezclar', 'vehiculos', v.id, { conductor: valor('vaCond'), historial: paso(v, valor('vaCond') ? `Asignado a ${valor('vaCond')}` : 'Quedó sin conductor') }]] });
  }

  /* ---------- historial completo del carro ---------- */
  // Se arma en pantalla con datos que ya existen (historial del carro, entregas, novedades, tanqueos y reservas); no escribe nada nuevo.
  const LINEA_FILTROS = [['todo', 'Todo'], ['viajes', 'Viajes'], ['mtto', 'Mantenimiento y llantas'], ['novedades', 'Novedades'], ['combustible', 'Combustible'], ['papeles', 'Papeles y taller'], ['reservas', 'Reservas']];
  const LINEA_TIPO = { viajes: 'Viajes', mtto: 'Mantenimiento y llantas', novedades: 'Novedades', combustible: 'Combustible', papeles: 'Papeles y taller', reservas: 'Reservas', otros: 'Otros' };
  const msFecha = f => { const s = String(f == null ? '' : f).trim(), d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s), t = d ? new Date(+d[1], +d[2] - 1, +d[3], 12).getTime() : Date.parse(s); return Number.isFinite(t) ? t : 0; };
  /** Todos los pasos de la vida del carro: [{ fecha, titulo, quien, detalle, tipos }]. Las líneas «Salió con…» y «Llegó con…» del historial se dejan: salen de las entregas, que traen más datos. */
  function pasosDe(v) {
    const pasos = [], trs = tramosVeh(v.id);
    historial(v).filter(x => !/^(Salió|Llegó) con /.test(String(x.texto || ''))).forEach(x => {
      const t = String(x.texto || '');
      pasos.push({ fecha: x.fecha, titulo: t, quien: x.por, tipos: [/^(Mantenimiento hecho|Plan de mantenimiento)/.test(t) ? 'mtto' : /^(Actualizó los documentos|Entró al taller|Salió del taller)/.test(t) ? 'papeles' : 'otros'] });
    });
    entDe(v.id).forEach(e => {
      const sal = e.tipo === 'salida', res = e.reservaId ? resPorId(e.reservaId) : null, reu = e.reunionId ? reunionPorId(e.reunionId) : null;
      pasos.push({ fecha: e.fecha, titulo: `${sal ? 'Salió con' : 'Llegó con'} ${e.conductor || 'sin nombre'}`, quien: e.por, tipos: ['viajes'],
        detalle: [km(e.km), res ? 'viaje a ' + res.destino : reu ? 'viaje a la ' + reu.comunidad : '', e.combustible ? 'combustible ' + e.combustible : '', e.con ? `${sal ? 'entregó' : 'recibió'} ${e.con}` : '', e.observaciones].filter(Boolean).join(' · ') });
    });
    novDe(v.id).forEach(n => {
      const tipo = TIPO_NOV[n.tipo] || 'Otro', tipos = ['novedades'].concat(['llanta', 'mantenimiento'].includes(n.tipo) ? ['mtto'] : []);
      pasos.push({ fecha: n.fecha, titulo: `Novedad: ${tipo}`, quien: n.reporta, tipos, detalle: [n.descripcion, km(n.km)].filter(Boolean).join(' · ') });
      if (n.revisada) pasos.push({ fecha: n.revisadaEn || n.fecha, titulo: `Novedad revisada: ${tipo}`, quien: n.revisadaPor, tipos, detalle: [num(n.costo) ? 'costó ' + A().cop(n.costo) : '', n.nota ? 'nota: ' + n.nota : ''].filter(Boolean).join(' · ') });
    });
    tanDe(v.id).forEach(t => {
      const x = trs.find(y => y.t.id === t.id);
      pasos.push({ fecha: t.fecha, titulo: `Tanqueo: ${A().cop(t.valor)}`, quien: t.por, tipos: ['combustible'],
        detalle: [`${nGal(t.galones)} galones${t.lleno === false ? ' (no llenó el tanque)' : ''}`, km(t.km), x ? `rindió ${nKmGal(x.kmGal)} km por galón${x.raro ? ' (consumo raro)' : ''}` : ''].filter(Boolean).join(' · ') });
    });
    // Reservas de este carro que se aprobaron (y las que luego se cancelaron). Quien solo conduce ve las suyas.
    reservas().filter(r => r.vehiculoId === v.id && ['aprobada', 'cancelada'].includes(r.estado) && (!esConductor() || esMiaRes(r) || r.conductor === persona().nombre)).forEach(r => {
      const det = [`para el ${A().fechaCorta(r.fecha)}${r.hora ? ', ' + r.hora : ''}`, r.conductor ? 'conductor ' + r.conductor : '', r.por ? 'pidió ' + r.por : ''].filter(Boolean).join(' · ');
      if (r.decideEn) pasos.push({ fecha: r.decideEn, titulo: `Reserva aprobada: ${r.destino}`, quien: r.decidePor, tipos: ['reservas'], detalle: det });
      if (r.estado === 'cancelada') pasos.push({ fecha: r.canceladaEn || r.decideEn || r.fecha, titulo: `Reserva cancelada: ${r.destino}`, quien: r.canceladaPor, tipos: ['reservas'], detalle: det });
    });
    return pasos;
  }
  /** Quién ha tenido el carro: cada salida con su llegada, por conductor (veces, km recorridos y última vez). */
  function quienLoHaTenido(v) {
    const es = entDe(v.id).slice().sort((a, b) => msFecha(a.fecha) - msFecha(b.fecha)), viajes = []; let abierto = null;
    es.forEach(e => {
      if (e.tipo === 'salida') { abierto = { sal: e, lle: null }; viajes.push(abierto); }
      else if (e.tipo === 'llegada' && abierto) { abierto.lle = e; abierto = null; }
    });
    const por = new Map(), ultimo = viajes[viajes.length - 1];
    viajes.forEach(x => {
      const c = x.sal.conductor || 'Sin nombre', p = por.get(c) || { c, veces: 0, km: 0, ultima: x.sal.fecha, ahora: false };
      p.veces++;
      if (x.lle && num(x.lle.km) > num(x.sal.km)) p.km += num(x.lle.km) - num(x.sal.km);
      if (msFecha(x.sal.fecha) >= msFecha(p.ultima)) p.ultima = x.sal.fecha;
      if (x === ultimo && !x.lle && v.estado === 'en-uso') p.ahora = true;
      por.set(c, p);
    });
    return Array.from(por.values()).sort((a, b) => msFecha(b.ultima) - msFecha(a.ultima));
  }
  /** Los dos apartados de la hoja de vida: «Quién lo ha tenido» y «Historial completo» (filtros, orden, línea de tiempo y Excel). */
  function htmlHistorialCarro(v) {
    const App = A(), pasos = pasosDe(v), quien = quienLoHaTenido(v);
    const sel = lineaFiltro === 'todo' ? pasos : pasos.filter(p => p.tipos.includes(lineaFiltro));
    const r = App.lineaTiempo(`veh-${v.id}-${lineaFiltro}`, sel, { orden: lineaOrden, reiniciar: true });
    const chip = (acc, k, txt, n, on) => `<button type="button" class="chip" data-accion="${acc}" data-id="${esH(k)}" data-veh="${esH(v.id)}" aria-pressed="${on}">${esH(txt)}${n == null ? '' : ` <span class="n">${n}</span>`}</button>`;
    const cuantos = k => k === 'todo' ? pasos.length : pasos.filter(p => p.tipos.includes(k)).length;
    return `<div class="section-label">Quién lo ha tenido</div>` + (quien.length ? `<div class="list">${quien.map(x => `<div class="card"><span class="card-head"><span class="card-title">${esH(x.c)}</span>${x.ahora ? App.pill('Lo tiene ahora', 's-listo', 'listo') : ''}</span>
        <span class="facts"><span>${x.veces} ${x.veces === 1 ? 'vez' : 'veces'}</span><span>${x.km ? esH(km(x.km)) + ' recorridos' : 'sin llegada todavía'}</span><span>última vez ${esH(App.hace(x.ultima))}</span></span></div>`).join('')}</div>` : '<p class="meta">Todavía nadie ha salido con este carro.</p>')
      + `<div class="section-label">Historial completo</div>
        <div class="chips sub" role="group" aria-label="Filtrar el historial">${LINEA_FILTROS.map(([k, t]) => chip('lineafiltro', k, t, cuantos(k), lineaFiltro === k)).join('')}</div>
        <div class="chips sub" role="group" aria-label="Orden del historial">${chip('lineaorden', 'nuevo', 'Lo más nuevo primero', null, lineaOrden === 'nuevo')}${chip('lineaorden', 'viejo', 'Desde el comienzo', null, lineaOrden === 'viejo')}</div>
        <p class="meta" role="status">${r.total ? `${r.total} ${r.total === 1 ? 'registro' : 'registros'}${r.primera ? ' desde el ' + esH(r.primera) : ''}` : 'Sin registros en este filtro.'}</p>
        ${r.ol}`
      + (esAdmin() || esGerente() ? `<div class="barra-botones">${boton('excelhist', 'Bajar el historial en Excel', 'excel', v.id, 'small', ` data-veh="${esH(v.id)}"`)}</div>` : '');
  }
  /** Excel con todo el historial del carro (sin filtro) y quién lo ha tenido. Solo lee. */
  async function excelHistorial(v, b) {
    b.disabled = true;
    try {
      const f = window.Inventario.fechaLocal, gen = `Generado el ${A().hoyISO()}.`;
      const filas = pasosDe(v).sort((a, c) => msFecha(c.fecha) - msFecha(a.fecha))
        .map(p => ({ Fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(p.fecha)) ? p.fecha : f(p.fecha, true), Tipo: p.tipos.map(k => LINEA_TIPO[k]).join(', '), Qué: p.titulo, Quién: p.quien || '', Detalle: p.detalle || '' }));
      const quien = quienLoHaTenido(v).map(x => ({ Conductor: x.c, Veces: x.veces, 'Km recorridos': x.km, 'Última vez': /^\d{4}-\d{2}-\d{2}$/.test(String(x.ultima)) ? x.ultima : f(x.ultima, true), 'Lo tiene ahora': x.ahora ? 'Sí' : 'No' }));
      await window.Excel.descargar({ archivo: `Historial ${v.placa} ${A().hoyISO()}`, hojas: [
        window.Excel.deObjetos('Historial', `Historial del ${v.placa}`, `Todo lo que ha pasado con el carro, de lo más nuevo a lo más viejo. ${gen}`, filas),
        window.Excel.deObjetos('Quién lo ha tenido', `Quién ha tenido el ${v.placa}`, `Cada conductor con sus salidas. ${gen}`, quien)] });
      A().toast('Listo: Excel descargado');
    } catch (e) { A().toast('No se pudo preparar el Excel. Revisa la conexión y vuelve a intentar.'); }
    finally { b.disabled = false; }
  }
  /** Filtro, orden y Excel del historial: se repinta la hoja de vida en el mismo lugar. */
  function historialAccion(b) {
    const v = vehPorId(b.dataset.veh); if (!v) return;
    if (b.dataset.accion === 'excelhist') { excelHistorial(v, b); return; }
    if (b.dataset.accion === 'lineafiltro' && LINEA_FILTROS.some(([k]) => k === b.dataset.id)) lineaFiltro = b.dataset.id;
    else if (b.dataset.accion === 'lineaorden') lineaOrden = b.dataset.id === 'viejo' ? 'viejo' : 'nuevo';
    const sh = $('shVeh').querySelector('.sheet'), arriba = sh ? sh.scrollTop : 0;
    ver(v);
    if (sh) sh.scrollTop = arriba;
    const igual = Array.from($('veCampos').querySelectorAll('[data-accion]')).find(x => x.dataset.accion === b.dataset.accion && x.dataset.id === b.dataset.id);
    if (igual) { try { igual.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* ---------- hoja de vida ---------- */
  function ver(v) {
    const App = A(), st = EST[v.estado] || ['Sin estado', 'none'];
    const tans = tanDe(v.id).slice().reverse(), trs = tramosVeh(v.id), rd = rendimiento(trs), cm = costosDe(v, A().hoyISO().slice(0, 8) + '01');
    const ns = novDe(v.id), es = entDe(v.id).slice(0, 6);
    if (lineaVeh !== v.id) { lineaVeh = v.id; lineaFiltro = 'todo'; lineaOrden = 'nuevo'; }
    const bts = [];
    if (puedeReportar()) { bts.push(boton('novedad', 'Reportar novedad', 'aviso', v.id, 'small')); bts.push(boton('tanqueo', 'Registrar tanqueo', 'pagada', v.id, 'small')); }
    if ((esAdmin() || esConductor()) && v.estado === 'disponible') bts.push(boton('salida', 'Registrar salida', 'llave', v.id, 'primary small'));
    if (v.estado === 'en-uso' && (esAdmin() || (esConductor() && (v.conductor === persona().nombre || !persona().prueba)))) bts.push(boton('llegada', 'Registrar llegada', 'llave', v.id, 'primary small'));
    if (esAdmin()) {
      bts.push(boton('docs', 'Actualizar SOAT y técnico', 'calendario', v.id, 'small'));
      bts.push(boton('estado', v.estado === 'en-taller' ? 'Salió del taller' : 'Mandar al taller', '', v.id, 'ghost small'));
      if (v.estado !== 'en-uso') bts.push(boton('asignar', 'Cambiar conductor', 'persona', v.id, 'ghost small'));
    }
    const fotosDe = e => LADOS.map(([k, t]) => { const f = foto(e.fotos && e.fotos[k]); return f ? `<img class="ent-foto" src="${esH(f)}" alt="${esH(t)} (${esH(e.placa)})">` : ''; }).join('');
    abrir({ titulo: `${v.placa} · ${v.marca} ${v.modelo}`, sub: `${v.anio}${v.color ? ' · ' + v.color : ''}`,
      campos: `<div class="row">${App.pill(st[0], st[1])}</div>
        <dl class="datos"><dt>Conductor</dt><dd>${esH(v.conductor || 'Sin conductor')}</dd><dt>Kilometraje</dt><dd>${esH(km(v.km))}</dd></dl>
        <div class="docs">${docPill('SOAT', v.soat)}${docPill('Técnico-mecánica', v.tecno)}</div>
        ${bts.length ? `<div class="tarea-pie">${bts.join('')}</div>` : ''}
        <div class="section-label">Plan de mantenimiento (${mttosDe(v).length})</div>${mttosDe(v).length ? `<div class="list">${mttosDe(v).map(m => tarjetaMtto({ v, m, e: estMtto(m, v) }, false)).join('')}</div>` : '<p class="meta">Este carro todavía no tiene plan de mantenimiento.</p>'}${esAdmin() && mttosDe(v).length < 10 ? `<div class="tarea-pie">${boton('mttonuevo', 'Agregar tarea al plan', 'mas', v.id, 'small')}</div>` : ''}
        <div class="section-label">Combustible y costo (${tans.length} ${tans.length === 1 ? 'tanqueo' : 'tanqueos'})</div>
        <dl class="datos"><dt>Rinde</dt><dd>${trs.length ? esH(nKmGal(rd.kmGal)) + ' km por galón' : 'Falta calcularlo'}</dd><dt>Combustible</dt><dd>${trs.length ? esH(App.cop(Math.round(rd.costoKm))) + ' por km' : 'Con dos tanques llenos seguidos se calcula'}</dd><dt>Costo este mes</dt><dd>${esH(App.cop(cm.total))} <span class="meta">(novedades ${esH(App.cop(cm.nov))}, mantenimientos ${esH(App.cop(cm.mtt))}, combustible ${esH(App.cop(cm.comb))})</span></dd></dl>
        ${tans.length ? `<div class="list">${tans.slice(0, 4).map(t => tarjetaTanqueo(t, trs.find(x => x.t.id === t.id))).join('')}</div>${tans.length > 4 ? `<p class="meta">Los últimos 4 de ${tans.length}. Todos están en Tanqueos.</p>` : ''}` : '<p class="meta">Todavía no hay tanqueos de este carro.</p>'}
        <div class="section-label">Novedades (${ns.length})</div>${ns.length ? `<div class="list">${ns.map(tarjetaNovedad).join('')}</div>` : '<p class="meta">Sin novedades.</p>'}
        <div class="section-label">Salidas y llegadas</div>${es.length ? `<ul class="necesidades-l">${es.map(e => `<li><span class="nf-cab"><span class="nf-t"><b>${e.tipo === 'salida' ? 'Salida' : 'Llegada'} · ${esH(km(e.km))}</b><span class="meta">${esH(e.conductor)} · ${e.tipo === 'salida' ? 'entregó' : 'recibió'} ${esH(e.con)} · ${esH(App.hace(e.fecha))} · combustible ${esH(e.combustible)}</span>${e.observaciones ? `<span class="meta">${esH(e.observaciones)}</span>` : ''}</span>${Object.values(e.revision || {}).every(Boolean) ? App.pill('Revisión bien', 's-disco', 'check') : App.pill('Con problemas', 's-peligro', 'aviso')}</span><span class="meta rev-res">Críticos: ${esH(textoRevision(e.revision).criticos)} · Otros: ${esH(textoRevision(e.revision).otros)}</span><div class="fotos-fila">${fotosDe(e)}</div></li>`).join('')}</ul>` : '<p class="meta">Todavía no hay salidas registradas.</p>'}
        ${htmlHistorialCarro(v)}` });
    accion.volverA = v.id;
  }

  /* ---------- eventos ---------- */
  $('vehSecciones').addEventListener('click', e => {
    const b = e.target.closest('[data-sec]'); if (!b) return;
    seccion = b.dataset.sec; A().S.filtro.vehiculos = '';
    A().pintarTodo();
  });
  function alTocar(e) {
    const p = e.target.closest('[data-periodo]');
    if (p) { periodo = p.dataset.periodo; A().pintarTodo(); return; }
    const b = e.target.closest('[data-accion]'); if (!b) return;
    if (b.dataset.accion === 'excelveh') { excelVehiculos(b); return; }
    if (['lineafiltro', 'lineaorden', 'excelhist'].includes(b.dataset.accion)) { historialAccion(b); return; }
    const id = b.dataset.id, v = vehPorId(id), n = D().novedades.find(x => x.id === id), rs = resPorId(id);
    const desde = $('veCampos').contains(b) && accion ? accion.volverA : '';
    const mapa = {
      ver: () => v && ver(v),
      filtroveh: () => { const s = A().S; s.filtro.vehiculos = !id || s.filtro.vehiculos === id ? '' : id; if (b.dataset.modo === 'todo') buscar = ''; A().pintarTodo(); return true; },
      novedad: () => puedeReportar() ? novedad(v) : null,
      tanqueo: () => puedeReportar() ? tanqueo(v) : null,
      revisar: () => n && !n.revisada && esAdmin() ? revisar(n) : null,
      docs: () => v && esAdmin() ? docs(v) : null,
      estado: () => v && esAdmin() ? estado(v) : null,
      asignar: () => v && esAdmin() ? asignar(v) : null,
      mttohecho: () => v && esAdmin() ? mttoHecho(v, b.dataset.mtto) : null,
      mttonuevo: () => v && esAdmin() && mttosDe(v).length < 10 ? mttoNuevo(v) : null,
      mttoquitar: () => v && esAdmin() ? mttoQuitar(v, b.dataset.mtto) : null,
      salida: () => v && v.estado === 'disponible' && (esAdmin() || esConductor()) ? entrega(v, 'salida', b.dataset.viaje, b.dataset.reserva) : null,
      llegada: () => v && v.estado === 'en-uso' && (esAdmin() || esConductor()) ? entrega(v, 'llegada', b.dataset.viaje, b.dataset.reserva) : null,
      pedircarro: () => puedeReportar() ? (pedirCarro(), true) : null,
      aprobares: () => rs && rs.estado === 'pedida' && rs.fecha >= A().hoyISO() && esAdmin() && !esMiaRes(rs) ? (aprobarCarro(rs), true) : null,
      rechazares: () => rs && rs.estado === 'pedida' && esAdmin() && !esMiaRes(rs) ? (rechazarCarro(rs), true) : null,
      cancelares: () => rs && cancelable(rs) ? (cancelarReserva(rs), true) : null
    };
    const fn = mapa[b.dataset.accion]; if (!fn) return;
    if (fn() === null) { A().toast('Eso ya cambió o no te toca. Revisa otra vez.'); return; }
    // Si se abrió desde la hoja de vida, al terminar se vuelve a ella.
    if (desde && accion) accion.volver = desde;
  }
  $('vehContenido').addEventListener('click', alTocar);
  $('veCampos').addEventListener('click', e => { if (e.target.closest('[data-accion]')) alTocar(e); });
  $('veCampos').addEventListener('change', alEscogerFoto);
  $('veCampos').addEventListener('change', e => { if (e.target.matches && e.target.matches('input[type="radio"][name^="vr_"]')) alCambiarRevision(); });
  // El buscador repinta 300 ms después de la última tecla y deja el cursor donde estaba.
  const buscarLuego = UI.retardar(() => { const q = $('qVeh'), pos = q ? q.selectionStart : 0; pintar(); const n = $('qVeh'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {} } }, 300);
  $('vehContenido').addEventListener('input', e => { if (e.target.id === 'qVeh') { buscar = e.target.value; buscarLuego(); } });
  $('veForm').addEventListener('submit', e => { e.preventDefault(); guardar(); });

  /* ---------- base de datos en Excel (excel-bd.js): solo la Jefe agrega, cambia y elimina carros ---------- */
  const cfgVehiculos = () => ({
    clave: 'vehiculos', hoja: 'Carros', titulo: 'Base de datos: carros', sub: 'Una fila por carro', archivo: 'Base de datos Carros',
    acciones: ['Agregar', 'Cambiar', 'Eliminar'], puedeSubir: esJefe, puedeEliminar: esJefe,
    columnas: [
      { t: 'Placa', k: 'placa', clave: true, obligatoria: true, fija: true, unico: true, normaliza: v => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, ''), mayus: true, max: 10, ancho: 12 },
      { t: 'Marca', k: 'marca', obligatoria: true, max: 30, ancho: 16 }, { t: 'Modelo', k: 'modelo', obligatoria: true, max: 40, ancho: 18 },
      { t: 'Año', k: 'anio', tipo: 'entero', min: 1990, max: 2100, obligatoria: true }, { t: 'Color', k: 'color', max: 20, ancho: 14 },
      { t: 'Kilometraje', k: 'km', tipo: 'entero', min: 0, obligatoria: true },
      { t: 'SOAT vence', k: 'soat', tipo: 'fecha', obligatoria: true }, { t: 'Técnico-mecánica vence', k: 'tecno', tipo: 'fecha', obligatoria: true },
      { t: 'Conductor', k: 'conductor', gris: true, ancho: 22 }, { t: 'Estado', k: 'estado', gris: true, ancho: 14 }],
    filas: () => D().vehiculos.slice().sort((a, b) => String(a.placa).localeCompare(String(b.placa))).map(v => ({ id: v.id, v: { placa: v.placa, marca: v.marca, modelo: v.modelo, anio: v.anio, color: v.color || '', km: num(v.km), soat: v.soat || '', tecno: v.tecno || '', conductor: v.conductor || '', estado: (EST[v.estado] || [v.estado])[0] } })),
    ejemplo: { placa: 'XYZ 789', marca: 'Toyota', modelo: 'Hilux', anio: 2024, color: 'Blanco', km: 0, soat: '2027-06-30', tecno: '2027-06-30' },
    ayuda: [['Carro nuevo', 'Queda «Disponible». Obligatorios: Placa, Marca, Modelo, Año, Kilometraje y las fechas en que vencen el SOAT y la técnico-mecánica.'],
      ['Qué se puede cambiar', 'Marca, modelo, año, color, kilometraje (nunca hacia atrás) y las fechas de los documentos. La placa no cambia. El conductor y el estado se mueven con las salidas y llegadas, en la app.'],
      ['Eliminar', 'Solo si el carro no está en uso y no tiene salidas, llegadas ni novedades registradas.']],
    revisar: (x, { nuevo, ex }) => {
      if (nuevo && !/^[A-Z0-9][A-Z0-9 -]{3,8}[A-Z0-9]$/.test(String(x.v.placa))) x.errores.push('Placa: letras y números, por ejemplo «ABC 123».');
      if (!nuevo && ex && x.v.km < num(ex.v.km)) x.errores.push(`Kilometraje: no puede bajar (hoy tiene ${num(ex.v.km)}).`);
    },
    bloqueaEliminar: id => {
      const v = D().vehiculos.find(z => z.id === id);
      if (!v) return 'Ese carro ya no existe.';
      if (v.estado === 'en-uso') return 'Está en uso: espera a que llegue.';
      if (D().entregas.some(e => e.vehiculoId === id) || D().novedades.some(n => n.vehiculoId === id)) return 'Tiene salidas, llegadas o novedades registradas: se guardan como rastro.';
      return null;
    },
    opsAgregar: x => [['set', 'vehiculos', 've-' + String(x.v.placa).toLowerCase().replace(/[^a-z0-9]/g, ''), { placa: x.v.placa, marca: x.v.marca, modelo: x.v.modelo, anio: x.v.anio, color: x.v.color, conductor: '', km: x.v.km, soat: x.v.soat, tecno: x.v.tecno, estado: 'disponible',
      historial: [{ fecha: ahora(), texto: 'Se registró desde el Excel', por: persona().nombre }] }]],
    opsCambiar: x => { const v = D().vehiculos.find(z => z.id === x.id); return v ? [['mezclar', 'vehiculos', v.id, Object.assign({}, x.datos, { historial: (Array.isArray(v.historial) ? v.historial : []).concat([{ fecha: ahora(), texto: 'Datos cambiados desde el Excel', por: persona().nombre }]) })]] : []; },
    opsEliminar: x => [['borrar', 'vehiculos', x.id]]
  });
  window.ExcelBD.conectar($('vehContenido'), { vehiculos: cfgVehiculos }, () => pintar());

  window.Vehiculos = Object.freeze({ pintar, resumen, libresPara, tramosDe });
})();
