/* equipos.js — Módulo Equipos de la demo: Equipos y Entregas juntas, con el acta VIRTUAL (sin papel).
   El acta es igual a la hoja «Entrega de equipos y herramientas»: fecha, nombre, cédula, proyecto y código de proyecto;
   la tabla de equipos (serial, cantidad, observaciones) y la de «Otros»; la firma de quien recibe con su cédula;
   y abajo la fecha de devolución con su firma, en la misma acta.
   Encargado de equipos (Fabián): registra equipos, hace las actas (la persona firma en la pantalla), recibe las
     devoluciones, hace el mantenimiento y el backup de lo que llega a Recibidos y cumple la agenda.
   Soporte (Ángel): le llegan las actas; con el permiso extra «actas» las revisa (bien o con problema).
     También le programa mantenimientos y backups al Encargado.
   La Jefe puede hacer todo menos revisar sus propias actas; el Gerente ve todo a detalle sin botones.
   El acta se puede imprimir o guardar en PDF.
   Ciclo de vida: el Encargado anota la compra y la garantía; Soporte y la Jefe verifican los equipos con el escáner; el Encargado pide la
   baja (dañado, robado, perdido u obsoleto) y solo la Jefe la aprueba. Un equipo de baja sale de las cifras y su hoja de vida queda en «De baja». */
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
  const esEncargado = () => perm() === 'encargado' || esJefe();          // actas, devoluciones, mantenimiento
  const esSoporte = () => perm() === 'soporte';
  const revisaActas = () => esJefe() || (esSoporte() && A().tieneExtra('actas'));
  const puedeRevisar = h => revisaActas() && h.revision === 'pendiente' && h.porRol !== miRol();   // nadie revisa lo suyo
  const programa = () => esJefe() || esSoporte();                          // programa tareas al Encargado
  const ahora = () => new Date().toISOString();
  const hoy = () => A().hoyISO();
  const EST = { asignado: ['Asignado', 's-disco', 'disco'], bodega: ['En bodega', 's-pend', 'pend'], recibido: ['En Recibidos', 's-org', 'org'], baja: ['De baja', 'none', 'pend'] };
  const MOTIVO_BAJA = { danado: 'Dañado sin arreglo', robado: 'Robado', perdido: 'Perdido', obsoleto: 'Obsoleto' };
  const REV = { pendiente: ['Por revisar', 's-org', 'reloj'], ok: ['Revisada', 's-disco', 'check'], problema: ['Con problema', 's-peligro', 'aviso'] };
  const TIPO_TAREA = { mantenimiento: 'Mantenimiento', backup: 'Backup', revision: 'Revisión' };
  const TIPOS_EQ = ['Portátil', 'Computador de escritorio', 'Monitor', 'GPS', 'Tableta', 'Cámara semi', 'Cámara digital', 'Celular', 'Video beam', 'Impresora', 'Bafle', 'Radio', 'Disco duro externo', 'Otro'];
  // Filas fijas de la hoja de papel, y en cuál va cada tipo de equipo.
  const FILAS_EQ = ['COMPUTADORA PORTÁTIL', 'MONITOR', 'GPS', 'TABLET', 'CÁMARA SEMI', 'CÁMARA DIGITAL', 'CELULAR', 'VIDEO BEAM', 'IMPRESORA', 'BAFLE', 'RADIOS', 'DISCO DURO'];
  const FILA_DE = { 'Portátil': 'COMPUTADORA PORTÁTIL', 'Monitor': 'MONITOR', 'GPS': 'GPS', 'Tableta': 'TABLET', 'Cámara semi': 'CÁMARA SEMI', 'Cámara digital': 'CÁMARA DIGITAL', 'Cámara': 'CÁMARA DIGITAL',
    'Celular': 'CELULAR', 'Video beam': 'VIDEO BEAM', 'Impresora': 'IMPRESORA', 'Bafle': 'BAFLE', 'Radio': 'RADIOS', 'Disco duro externo': 'DISCO DURO' };
  const OTROS = ['Base portátil', 'Base monitor', 'Mouse', 'Teclado', 'Pad mouse', 'Pad teclado', 'Descansapiés', 'Morral', 'Diadema', 'Cargador'];
  const PROYECTOS = [['Proyecto Costa Norte', 'PCN-01'], ['Proyecto Ruta Alta', 'PRA-02']];
  const MAX_FIRMA = 79000;
  let seccion = '', rolPintado = '', guardando = false, accion = null, pushPendientes = [], buscar = '', tipoEq = '', buscarActa = '', buscarPers = '', hechasAbiertas = false, bajasAbiertas = false, verif = null;

  /* ---------- datos derivados ---------- */
  const equipos = () => D().equipos.slice().sort((a, b) => String(a.serial).localeCompare(String(b.serial)));
  const eqPorId = id => D().equipos.find(e => e.id === id) || null;
  const hojaPorId = id => D().hojas.find(h => h.id === id) || null;
  const lista = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);
  const devueltos = h => new Set(lista(h.devoluciones).flatMap(d => (Array.isArray(d.equipos) ? d.equipos : [])));
  const porDevolver = h => lista(h.equipos).filter(x => !devueltos(h).has(x.id));
  const estadoActa = h => (!lista(h.devoluciones).length ? 'entregada' : porDevolver(h).length ? 'parcial' : 'devuelta');
  const EST_ACTA = { entregada: ['Entregada', 's-disco'], parcial: ['Devolución parcial', 's-org'], devuelta: ['Devuelta', 's-pend'] };
  const hojasDe = id => D().hojas.filter(h => lista(h.equipos).some(x => x.id === id)).sort((a, b) => String(b.en).localeCompare(String(a.en)));
  const pend = e => (e && e.pendientes && typeof e.pendientes === 'object' ? e.pendientes : {});
  const historial = e => lista(e.historial);
  const conPaso = (e, paso) => historial(e).concat([Object.assign({ fecha: hoy(), por: persona().nombre }, paso)]);
  const porRevisar = () => D().hojas.filter(h => h.revision === 'pendiente').sort((a, b) => String(a.en).localeCompare(String(b.en)));
  const conProblema = () => D().hojas.filter(h => h.revision === 'problema');
  const tareasPend = () => D().tareasEq.filter(t => t.estado === 'pendiente').sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const recibidos = () => equipos().filter(e => e.estado === 'recibido');
  const dias = f => A().diasHasta(f);
  const viejoMtto = e => { const d = dias(e.ultimoMtto); return d == null || d < -180; };
  /* ciclo de vida: baja, verificación y garantía */
  const activos = () => equipos().filter(e => e.estado !== 'baja');
  const deBaja = () => equipos().filter(e => e.estado === 'baja');
  const bajaDe = e => (e && e.bajaPedida && typeof e.bajaPedida === 'object' ? e.bajaPedida : null);
  /** Bajas pedidas que esperan a la Jefe (solo cuentan los equipos que siguen en bodega o en Recibidos). */
  const bajasPend = () => equipos().filter(e => ['bodega', 'recibido'].includes(e.estado) && bajaDe(e)).sort((a, b) => String(bajaDe(a).en).localeCompare(String(bajaDe(b).en)));
  const sinVerificar = e => { const d = dias(e.verificadoEn); return d == null || d < -180; };
  const garantiaPronto = e => { const d = dias(e.garantiaHasta); return d != null && d >= 0 && d <= 30; };
  const textoGarantia = e => { const d = dias(e.garantiaHasta); return d == null ? '' : d < 0 ? `venció hace ${-d} días` : d === 0 ? 'vence hoy' : `vence en ${d} días`; };
  const numActa = h => 'AC-' + String(h.numero || 0).padStart(4, '0');
  /** Personas con equipos o actas. Se agrupan por cédula (dos personas pueden llamarse igual). */
  function personas() {
    const m = new Map();
    const de = (nombre, cedula) => {
      const n = String(nombre || '').trim(), c = String(cedula || '').replace(/\D/g, '');
      if (!n || /^bodega$/i.test(n)) return null;
      const k = c || 'n:' + n.toLowerCase();
      if (!m.has(k)) m.set(k, { clave: k, nombre: n, cedula: c, equipos: [], hojas: [] });
      return m.get(k);
    };
    D().hojas.forEach(h => { const p = de(h.persona, h.cedula); if (p) p.hojas.push(h); });
    D().equipos.forEach(e => { if (e.estado === 'asignado') { const p = de(e.asignadoA, e.asignadoCedula); if (p) p.equipos.push(e); } });
    return Array.from(m.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }
  function resumen() {
    const es = D().equipos;
    const mias = (esEncargado() ? recibidos().length + tareasPend().length + conProblema().length : 0) + (esJefe() ? bajasPend().length : 0) + (revisaActas() ? porRevisar().filter(h => h.porRol !== miRol()).length : 0);
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
  /** Excel de Equipos: la lista de equipos y las actas de entrega (sin cédulas ni firmas: esos datos se quedan en la app). */
  async function descargarExcel(b) {
    b.disabled = true;
    try {
      const gen = `Generado el ${A().hoyISO()}.`, f = window.Inventario.fechaLocal, E = window.Excel;
      const equipos = D().equipos.slice().sort((x, y) => String(x.serial).localeCompare(String(y.serial))).map(e => ({ Serial: e.serial, Tipo: e.tipo, Marca: e.marca, Modelo: e.modelo, Estado: (EST[e.estado] || [e.estado])[0],
        'Asignado a': e.asignadoA || '', Proyecto: e.proyecto || '', 'Último mantenimiento': e.ultimoMtto || '', 'Último backup': e.ultimoBackup || '', 'Última verificación': e.verificadoEn || '',
        'Fecha de compra': e.fechaCompra || '', 'Garantía hasta': e.garantiaHasta || '', Proveedor: e.proveedor || '', Costo: Number(e.costo) || 0,
        'Motivo de la baja': e.estado === 'baja' && bajaDe(e) ? `${MOTIVO_BAJA[bajaDe(e).motivo] || bajaDe(e).motivo}: ${bajaDe(e).nota}` : '', Observaciones: e.obs || '' }));
      const actas = D().hojas.slice().sort((x, y) => Number(y.numero) - Number(x.numero)).map(h => ({ 'Acta N.°': Number(h.numero) || 0, Fecha: f(h.en, false) || h.fecha || '', 'Recibió': h.persona, Proyecto: h.proyecto || '',
        'Equipos entregados': lista(h.equipos).map(x => `${x.serial} (${x.tipo})`).join(', '), 'Otros elementos': lista(h.otros).map(x => `${x.nombre} x${x.cantidad}`).join(', '), 'Devoluciones': lista(h.devoluciones).length,
        'Revisión': ({ pendiente: 'Por revisar', ok: 'Bien', problema: 'Con problema' })[h.revision] || h.revision, 'Nota de la revisión': h.notaRevision || '', Entregó: h.encargado || h.por || '' }));
      await E.descargar({ archivo: `Equipos ${A().hoyISO()}`, hojas: [
        E.deObjetos('Equipos', 'Equipos', `Cada equipo con su estado, a quién está asignado, su último mantenimiento, backup y verificación, su compra y garantía, y el motivo si está de baja. ${gen}`, equipos),
        E.deObjetos('Actas de entrega', 'Actas de entrega', `Cada acta con lo que se entregó y cómo salió la revisión. No trae cédulas ni firmas. ${gen}`, actas)] });
      A().toast('Listo: Excel descargado');
    } catch (e) { A().toast('No se pudo preparar el Excel. Revisa la conexión y vuelve a intentar.'); }
    finally { b.disabled = false; }
  }
  $('btnExcelEq').addEventListener('click', e => descargarExcel(e.currentTarget));
  function pintar() {
    const App = A(), S = App.S;
    if (!S.persona) return;
    if (rolPintado !== S.persona.rol) { rolPintado = S.persona.rol; seccion = secciones()[0][0]; tipoEq = buscarActa = buscarPers = ''; }
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
    if (['equipos', 'hojas', 'tareasEq'].some(App.cargando)) { UI.poner(c, UI.esqueleto(3)); return; }
    if (UI.poner(c, ({ hacer: htmlHacer, equipos: () => htmlEquipos(f), actas: () => htmlActas(f), agenda: htmlAgenda, personas: htmlPersonas, resumen: htmlResumen })[seccion]())) window.llenarIconos(c);
  }
  const boton = (acc, txt, icono, id, clase, extra) => `<button class="btn ${clase || 'small'}" type="button" data-accion="${acc}" data-id="${esH(id)}"${extra || ''}>${icono ? `<span data-ico="${icono}"></span>` : ''}${esH(txt)}</button>`;
  const firma = s => (typeof s === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(s) ? s : '');
  const seriales = h => lista(h.equipos).map(x => x.serial).join(', ');

  /* --- Lo que me toca --- */
  const botonVerificar = clase => boton('verificar', 'Verificar equipos', 'codigo', '', clase || 'small');
  /** Una baja pedida: la Jefe la aprueba o no; el Encargado ve que sigue esperando. */
  function tarjetaBaja(e) {
    const b = bajaDe(e);
    return `<div class="card tarea st-org">
      <div class="tarea-t"><b><span class="serial-chip">${esH(e.serial)}</span> ${esH(e.tipo)} ${esH(e.marca)} ${esH(e.modelo)}</b>
        <span class="meta">${esH(MOTIVO_BAJA[b.motivo] || b.motivo)}: ${esH(b.nota)}</span><span class="meta">La pidió ${esH(b.por)} · ${esH(A().fechaCorta(b.en))} · ${esH(quienTiene(e))}</span></div>
      <div class="tarea-pie">${esJefe() ? boton('aprobarbaja', 'Aprobar la baja', 'check', e.id, 'primary small') + boton('noaprobarbaja', 'No aprobar', 'x', e.id, 'small') : A().pill('Esperando a la Jefe', 's-org', 'reloj')}${boton('ver', 'Hoja de vida', '', e.id, 'ghost small')}</div>
    </div>`;
  }
  function htmlHacer() {
    let h = '';
    if (programa()) h += `<div class="barra-botones">${botonVerificar('small')}</div>`;
    if (esEncargado()) {
      const bs = bajasPend();
      if (bs.length) h += `<div class="section-label">${esJefe() ? 'Bajas por aprobar' : 'Bajas que pediste (esperan a la Jefe)'} (${bs.length})</div><div class="list">${bs.map(tarjetaBaja).join('')}</div>`;
    }
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
      if (!revisaActas()) h += '<p class="meta">Las actas las revisa el Soporte encargado de actas.</p>';
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
    const r = REV[h.revision] || REV.pendiente, f = firma(h.firmaPersona), ea = EST_ACTA[estadoActa(h)];
    let bts = '';
    if (puedeRevisar(h)) bts += boton('revisar', 'Revisar el acta', 'check', h.id, 'primary small');
    if (h.revision === 'problema' && esEncargado()) bts += boton('corregir', 'Corregir', 'lapiz', h.id, 'primary small');
    const ultimaDev = lista(h.devoluciones).slice(-1)[0];
    return `<div class="card tarea st-${h.revision === 'problema' ? 'peligro' : h.revision === 'ok' ? 'disco' : 'org'}">
      <div class="nov-fila">${f ? `<img class="firma-mini" src="${esH(f)}" alt="Firma de ${esH(h.persona)}">` : ''}
        <div class="tarea-t"><b>Acta ${esH(numActa(h))}: ${esH(h.persona)}</b><span class="meta">${esH(seriales(h))} · entregado el ${esH(A().fechaCorta(h.fecha))}${h.cedula ? ' · C.C. ' + esH(h.cedula) : ''}</span>
        ${ultimaDev ? `<span class="meta">Devolución: ${esH(A().fechaCorta(ultimaDev.fecha))}</span>` : ''}${h.notaRevision ? `<span class="meta">Problema: ${esH(h.notaRevision)}</span>` : ''}</div></div>
      <span class="docs">${A().pill(ea[0], ea[1])}${bts ? '' : A().pill(r[0], r[1], r[2])}</span>
      <div class="tarea-pie">${bts}${boton('veracta', 'Ver acta', '', h.id, 'ghost small')}</div>
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
  const quienTiene = e => (e.estado === 'baja' ? 'Retirado (de baja)' : e.estado === 'bodega' ? 'En bodega' : e.estado === 'recibido' ? `En Recibidos (lo trajo ${e.asignadoA || 'alguien'})` : e.asignadoA || 'Sin asignar');

  /* --- Equipos --- */
  const buscador = (id, valor, ph, aria) => `<input class="search" id="${id}" type="search" placeholder="${esH(ph)}" autocomplete="off" aria-label="${esH(aria)}" value="${esH(valor)}">`;
  const cardEquipo = e => {
    const App = A(), st = EST[e.estado] || ['Sin estado', 'none', 'pend'];
    return `<button type="button" class="card st-${st[2]}" data-accion="ver" data-id="${esH(e.id)}">
        <span class="card-head"><span class="card-title"><small>${esH(e.serial)}</small>${esH(e.tipo)} ${esH(e.marca)}</span>${App.pill(st[0], st[1])}</span>
        <span class="card-sub">${esH(e.modelo)}</span>
        <span class="facts"><span>${window.ico('persona')} <b>${esH(quienTiene(e))}</b></span>${e.proyecto ? `<span>${esH(e.proyecto)}</span>` : ''}</span>
        <span class="docs">${e.estado === 'baja' ? '' : (e.ultimoMtto ? App.pill('Mantenimiento ' + App.fechaCorta(e.ultimoMtto), viejoMtto(e) ? 's-warn' : 's-pend', 'mantenimiento') : App.pill('Sin mantenimiento', 's-warn', 'mantenimiento')) + (e.ultimoBackup ? App.pill('Backup ' + App.fechaCorta(e.ultimoBackup), 's-pend', 'backup') : '')}${e.estado !== 'baja' && bajaDe(e) ? App.pill('Baja pedida', 's-org', 'aviso') : ''}${e.estado !== 'baja' && garantiaPronto(e) ? App.pill('Garantía ' + textoGarantia(e), 's-warn', 'aviso') : ''}${e.estado === 'baja' && bajaDe(e) ? App.pill(MOTIVO_BAJA[bajaDe(e).motivo] || 'De baja', 's-warn', 'aviso') : ''}</span>
        ${e.obs ? `<span class="meta">${esH(e.obs)}</span>` : ''}
      </button>`;
  };
  /** «De baja»: los equipos retirados quedan fuera de las cifras y de la lista; su hoja de vida se sigue pudiendo abrir. */
  function seccionBaja(f, q) {
    if (['asignado', 'bodega', 'recibido'].includes(f)) return '';
    const bs = deBaja().filter(e => !q || [e.serial, e.asignadoA, e.marca, e.modelo, e.tipo].join(' ').toLowerCase().includes(q));
    if (!bs.length) return '';
    const abierta = bajasAbiertas || !!q;
    return `<div class="section-label">De baja (${bs.length})</div>` + (abierta ? `<div class="list">${bs.map(cardEquipo).join('')}</div>` : '') +
      (q ? '' : `<div class="barra-botones">${boton('verbaja', abierta ? 'Ocultar los de baja' : 'Ver los de baja', abierta ? 'arriba' : 'abajo', '', 'ghost small')}</div>`);
  }
  function htmlEquipos(f) {
    const q = buscar.trim().toLowerCase();
    const base = activos().filter(e => (!['asignado', 'bodega', 'recibido'].includes(f) || e.estado === f) && (!q || [e.serial, e.asignadoA, e.marca, e.modelo, e.tipo, e.proyecto].join(' ').toLowerCase().includes(q)));
    const vis = tipoEq ? base.filter(e => e.tipo === tipoEq) : base;
    // Chips por tipo: solo los tipos que hay (con su número), más el escogido aunque ya no tenga equipos.
    const tipos = Array.from(new Set(base.map(e => e.tipo).concat(tipoEq ? [tipoEq] : []))).sort((a, b) => String(a).localeCompare(String(b)));
    const chipTipo = (t, txt, n) => `<button type="button" class="chip" data-accion="tipoeq" data-id="${esH(t)}" aria-pressed="${tipoEq === t}">${esH(txt)} <span class="n">${n}</span></button>`;
    const rotuloEstado = { asignado: 'Asignados', bodega: 'En bodega', recibido: 'En Recibidos' }[f];
    const filtros = [rotuloEstado, tipoEq].filter(Boolean);
    let h = `<div class="con-scan"><input class="search" id="qEq" type="search" placeholder="Buscar serial, persona o modelo" autocomplete="off" aria-label="Buscar equipo" value="${esH(buscar)}"><button type="button" class="btn-scan" data-accion="escanear" data-id="" aria-label="Escanear el serial con la cámara" title="Escanear el serial"><span data-ico="codigo"></span></button></div>`;
    h += window.ExcelBD.html(cfgEquipos());
    if (programa()) h += `<div class="barra-botones">${botonVerificar('small')}</div>`;
    if (tipos.length > 1 || tipoEq) h += `<div class="chips" role="group" aria-label="Filtrar por tipo de equipo">${chipTipo('', 'Todos', base.length)}${tipos.map(t => chipTipo(t, t, base.filter(e => e.tipo === t).length)).join('')}</div>`;
    if (filtros.length) h += `<div class="filtro-activo"><span>Filtro: <b>${esH(filtros.join(' · '))}</b></span>${boton('quitarfiltro', 'Quitar', 'x', '', 'ghost small')}</div>`;
    h += `<div class="count" aria-live="polite">${vis.length} de ${activos().length} equipos</div>`;
    if (!vis.length) return h + UI.vacio('equipos', 'No hay equipos con ese filtro', '') + (filtros.length || q ? `<div class="barra-botones">${boton('quitarfiltro', 'Quitar filtro', 'x', '', 'primary', ' data-modo="todo"')}</div>` : '') + seccionBaja(f, q);
    return h + `<div class="list">${vis.map(cardEquipo).join('')}</div>` + seccionBaja(f, q);
  }
  /* --- Actas --- */
  function htmlActas(f) {
    const q = buscarActa.trim().toLowerCase();
    const hs = D().hojas.slice().sort((a, b) => String(b.en).localeCompare(String(a.en))).filter(h => !q || [numActa(h), h.persona, h.cedula, seriales(h), h.proyecto].join(' ').toLowerCase().includes(q));
    const ps = hs.filter(h => h.revision !== 'ok'), ok = hs.filter(h => h.revision === 'ok');
    let h = buscador('qAc', buscarActa, 'Buscar persona, serial o número de acta', 'Buscar acta');
    if (q && !hs.length) return h + UI.vacio('hojas', 'No hay actas con esa búsqueda', '') + `<div class="barra-botones">${boton('quitarfiltro', 'Quitar búsqueda', 'x', '', 'primary', ' data-modo="actas"')}</div>`;
    h += f === 'actas' ? '<p class="meta">Mostrando primero las actas por revisar.</p>' : '';
    h += `<div class="section-label">Por revisar o con problema (${ps.length})</div>` + (ps.length ? `<div class="list">${ps.map(tarjetaActa).join('')}</div>` : '<p class="meta">Ninguna.</p>');
    h += `<div class="section-label">Revisadas (${ok.length})</div>` + (ok.length ? `<div class="list">${ok.map(tarjetaActa).join('')}</div>` : '<p class="meta">Todavía no hay actas revisadas.</p>');
    return h;
  }
  /* --- Agenda --- */
  function htmlAgenda() {
    const h = programa() ? `<div class="barra-botones">${boton('programar', 'Programar mantenimiento o backup', 'programar', '', 'primary')}</div>` : '';
    if (!D().tareasEq.length) return h + UI.vacio('calendario', 'No hay tareas', 'Soporte o la Jefe le programan al Encargado los mantenimientos y backups.');
    // Pendientes en tres grupos: atrasadas, las de esta semana (hasta el domingo) y las de después. Las hechas, al final y plegadas.
    const ps = tareasPend(), hechas = D().tareasEq.filter(t => t.estado !== 'pendiente').sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const domingo = (7 - new Date().getDay()) % 7;
    const atras = ps.filter(t => String(t.fecha) < hoy()), semana = ps.filter(t => String(t.fecha) >= hoy() && dias(t.fecha) <= domingo);
    const despues = ps.filter(t => !atras.includes(t) && !semana.includes(t));
    const grupo = (rotulo, ts, vacio, clase) => `<div class="section-label${clase || ''}">${rotulo} (${ts.length})</div>` + (ts.length ? `<div class="list">${ts.map(tarjetaTarea).join('')}</div>` : `<p class="meta">${vacio}</p>`);
    return h + (atras.length ? grupo('Atrasadas', atras, '', ' atrasadas') : '') + grupo('Esta semana', semana, 'Nada para esta semana.') + grupo('Después', despues, 'Nada programado más adelante.')
      + (hechas.length ? `<div class="barra-botones">${boton('verhechas', hechasAbiertas ? 'Ocultar hechas' : `Ver hechas (${hechas.length})`, hechasAbiertas ? 'arriba' : 'abajo', '', 'ghost small')}</div>` + (hechasAbiertas ? `<div class="list">${hechas.map(tarjetaTarea).join('')}</div>` : '') : '');
  }
  /* --- Personas --- */
  function htmlPersonas() {
    const todas = personas(), q = buscarPers.trim().toLowerCase();
    if (!todas.length) return UI.vacio('persona', 'Nadie tiene equipos todavía', '');
    const ps = todas.filter(p => !q || [p.nombre, p.cedula, p.equipos.map(e => e.serial).join(' ')].join(' ').toLowerCase().includes(q));
    const caja = buscador('qPe', buscarPers, 'Buscar nombre, cédula o serial', 'Buscar persona');
    if (!ps.length) return caja + UI.vacio('persona', 'No hay nadie con esa búsqueda', '') + `<div class="barra-botones">${boton('quitarfiltro', 'Quitar búsqueda', 'x', '', 'primary', ' data-modo="personas"')}</div>`;
    return caja + `<div class="list">${ps.map(p => `<button type="button" class="card" data-accion="persona" data-clave="${esH(p.clave)}">
      <span class="card-head"><span class="card-title">${esH(p.nombre)}</span>${A().pill(`${p.equipos.length} ${p.equipos.length === 1 ? 'equipo' : 'equipos'}`, p.equipos.length ? 's-disco' : 'none', 'equipos')}</span>
      <span class="meta">${p.cedula ? 'C.C. ' + esH(p.cedula) + ' · ' : ''}${p.hojas.length} ${p.hojas.length === 1 ? 'acta' : 'actas'}${p.equipos.length ? ' · ' + esH(p.equipos.map(e => e.serial).join(', ')) : ''}</span>
    </button>`).join('')}</div>`;
  }
  /* --- Resumen (Jefe y Gerente) --- */
  function htmlResumen() {
    const App = A(), n = resumen(), mes = hoy().slice(0, 7), hs = D().hojas;
    const entregas = hs.filter(h => String(h.fecha).slice(0, 7) === mes).length;
    const devs = hs.reduce((c, h) => c + lista(h.devoluciones).filter(d => String(d.fecha).slice(0, 7) === mes).length, 0);
    const viejos = activos().filter(viejoMtto), sv = activos().filter(sinVerificar), gp = activos().filter(garantiaPronto).sort((a, b) => String(a.garantiaHasta).localeCompare(String(b.garantiaHasta)));
    let h = `<div class="resumen-grid">
      <div class="card"><span class="meta">Equipos</span><span class="rm-n">${activos().length}</span><span class="meta">${n.asignados} asignados · ${n.bodega} en bodega · ${n.recibidos} en Recibidos${deBaja().length ? ` · ${deBaja().length} de baja (fuera de la cifra)` : ''}</span></div>
      <div class="card"><span class="meta">Actas este mes</span><span class="rm-n">${entregas + devs}</span><span class="meta">${entregas} entregas · ${devs} devoluciones</span></div>
      <div class="card"><span class="meta">Actas por revisar</span><span class="rm-n">${n.actas}</span>${conProblema().length ? App.pill(`${conProblema().length} con problema`, 's-peligro', 'aviso') : App.pill('Sin problemas', 's-disco', 'check')}</div>
      <div class="card"><span class="meta">Agenda</span><span class="rm-n">${n.tareas}</span>${n.atrasadas ? App.pill(`${n.atrasadas} atrasadas`, 's-peligro', 'aviso') : App.pill('Al día', 's-disco', 'check')}</div>
    </div>`;
    h += `<div class="section-label">Sin mantenimiento hace más de 6 meses (${viejos.length})</div>` + (viejos.length ? `<div class="list">${viejos.map(e => `<button type="button" class="card" data-accion="ver" data-id="${esH(e.id)}"><span class="card-head"><span class="card-title"><small>${esH(e.serial)}</small>${esH(e.tipo)} ${esH(e.marca)}</span>${App.pill(e.ultimoMtto ? 'Último: ' + App.fechaCorta(e.ultimoMtto) : 'Nunca', 's-warn', 'mantenimiento')}</span><span class="meta">${esH(quienTiene(e))}</span></button>`).join('')}</div>` : '<p class="meta">Todos los equipos tienen mantenimiento reciente.</p>');
    const fila = (e, pill) => `<button type="button" class="card" data-accion="ver" data-id="${esH(e.id)}"><span class="card-head"><span class="card-title"><small>${esH(e.serial)}</small>${esH(e.tipo)} ${esH(e.marca)}</span>${pill}</span><span class="meta">${esH(quienTiene(e))}</span></button>`;
    h += `<div class="section-label">Sin verificar hace más de 6 meses (${sv.length})</div>` + (sv.length ? `<div class="list">${sv.map(e => fila(e, App.pill(e.verificadoEn ? 'Verificado: ' + App.fechaCorta(e.verificadoEn) : 'Nunca verificado', 's-warn', 'codigo'))).join('')}</div>` : '<p class="meta">Todos los equipos se verificaron en los últimos 6 meses.</p>');
    h += `<div class="section-label">Garantías que vencen en 30 días (${gp.length})</div>` + (gp.length ? `<div class="list">${gp.map(e => fila(e, App.pill('Garantía ' + textoGarantia(e), 's-warn', 'aviso'))).join('')}</div>` : '<p class="meta">Ninguna garantía vence en los próximos 30 días.</p>');
    return h;
  }

  /* ---------- hoja de acción ---------- */
  const campoTxt = (id, lbl, v, ph, max, tipo, lst) => `<div class="field"><label for="${esH(id)}">${lbl}</label><input id="${esH(id)}" type="${tipo || 'text'}" maxlength="${max || 120}" autocomplete="off" value="${esH(v == null ? '' : v)}" placeholder="${esH(ph || '')}"${lst ? ` list="${esH(lst)}"` : ''}></div>`;
  const campoSel = (id, lbl, ops, v) => `<div class="field"><label for="${esH(id)}">${lbl}</label><select id="${esH(id)}">${ops.map(([val, t]) => `<option value="${esH(val)}"${val === v ? ' selected' : ''}>${esH(t)}</option>`).join('')}</select></div>`;
  const marca = (id, lbl, ok, extra) => `<label class="marca-fila"><input type="checkbox" id="${esH(id)}"${ok ? ' checked' : ''}${extra || ''}><span>${lbl}</span></label>`;
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
    A().vigilar('shEq', () => $('eqForm'), () => Object.keys(pads).filter(id => $(id) && $('eqCampos').contains($(id))).map(id => pads[id].puntos).join());
    const sh = $('shEq').querySelector('.sheet'); if (sh) sh.scrollTop = 0;
  }
  function aviso(para, titulo, txt, soloActas) {
    if (!para || para === miRol()) return null;
    pushPendientes.push({ para, titulo, texto: txt, soloActas: !!soloActas });
    return ['set', 'avisos', window.nube.idNuevo('av'), { para, titulo, texto: txt, en: ahora(), modulo: 'equipos', leido: {}, deUid: window.nube.uid() }];
  }
  /** ¿Cambió alguno de estos equipos mientras la hoja estaba abierta? (otra persona actuó) */
  const cambiaron = ids => ids.some(id => { const e = eqPorId(id), b = (accion.base || {})[id]; return !e || !b || e.estado !== b.estado || historial(e).length !== historial(b).length; });
  const fotoBase = es => Object.fromEntries(es.map(e => [e.id, Object.assign({}, e)]));
  async function guardar() {
    if (guardando || !accion || !accion.ops) return;
    $('eqErr').hidden = true;
    if (accion.baseHoja) { const h = hojaPorId(accion.baseHoja.id); if (!h || h.revision !== accion.baseHoja.revision || lista(h.devoluciones).length !== lista(accion.baseHoja.devoluciones).length) return fallar('Esa acta cambió mientras la tenías abierta. Ciérrala y ábrela otra vez.'); }
    pushPendientes = [];
    const ops = accion.ops(); if (!ops) return;
    const lote = ops.filter(Boolean), envios = pushPendientes.slice();
    guardando = true; $('eqPrimario').disabled = true;
    try {
      if (lote.length) await window.nube.lote(lote);
      A().cerrarHoja('shEq');
      try { $('eqContenido').focus({ preventScroll: true }); } catch (e) {}
      A().toast(accion.listo);
      const volver = accion.volver;
      accion = null;
      notificar(envios);
      if (volver) setTimeout(() => { const e = eqPorId(volver); if (e && $('shEq').hidden) ver(e); }, 350);
    } catch (e) {
      // Dos actas con el mismo número a la vez: la segunda se rechaza; al volver a guardar toma el número siguiente.
      fallar(e && e.code === 'permission-denied' && accion && accion.numerada ? 'Otra persona guardó un acta al mismo tiempo. Toca guardar otra vez.' : window.nube.explicar(e));
    }
    finally { guardando = false; $('eqPrimario').disabled = false; }
  }
  function notificar(envios) {
    if (!window.Push || !envios.length) return;
    envios.forEach(e => Promise.resolve(window.Push.enviar(e.para, { titulo: e.titulo, texto: e.texto, url: './#equipos', etiqueta: 'equipos', exige: e.soloActas && e.para === 'soporte' ? 'actas' : undefined })).catch(() => {}));
  }

  /* ---------- firma en la pantalla ---------- */
  const campoFirma = (id, lbl, cc) => `<div class="field firma-campo"><span class="lbl">${esH(lbl)}</span>
      <canvas id="${esH(id)}" class="firma-pad" width="600" height="200" aria-label="${esH(lbl)}: firma con el dedo"></canvas>
      <div class="row"><span class="meta" id="${esH(id)}Txt">Firma con el dedo dentro del cuadro.</span>${boton('borrarfirma', 'Borrar', 'borrar', id, 'ghost small')}</div>
      ${cc ? `<span class="meta">C.C. <b id="${esH(id)}CC">${esH(cc)}</b></span>` : ''}</div>`;
  const pads = {};
  /** Prepara un cuadro de firma: se dibuja con el dedo o el mouse. */
  function activarFirma(id) {
    const cv = $(id); if (!cv) return;
    const ctx = cv.getContext('2d'), pad = { puntos: 0 };
    ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#13212b';
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    let antes = null;
    const punto = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
    cv.onpointerdown = e => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) {} antes = punto(e); };
    cv.onpointermove = e => { if (!antes) return; e.preventDefault(); const p = punto(e); ctx.beginPath(); ctx.moveTo(antes.x, antes.y); ctx.lineTo(p.x, p.y); ctx.stroke(); pad.puntos++; antes = p; const t = $(id + 'Txt'); if (t) t.textContent = 'Firma lista.'; };
    cv.onpointerup = cv.onpointercancel = () => { antes = null; };
    pads[id] = pad;
  }
  function borrarFirma(id) { const cv = $(id); if (!cv) return; const ctx = cv.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height); pads[id] = { puntos: 0 }; const t = $(id + 'Txt'); if (t) t.textContent = 'Firma con el dedo dentro del cuadro.'; }
  const firmada = id => !!(pads[id] && pads[id].puntos >= 8);
  /** La firma como imagen pequeña (PNG). */
  function leerFirma(id) {
    const c = document.createElement('canvas'); c.width = 360; c.height = 120;
    const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height); x.drawImage($(id), 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  /* ---------- acta de entrega (igual a la hoja de papel) ---------- */
  const siguienteNumero = () => D().hojas.reduce((m, h) => Math.max(m, Number(h.numero) || 0), 0) + 1;
  const filaEq = (e, marcado) => `<div class="eq-acta" data-fila="${esH(e.id)}">${marca('ehEq_' + e.id, `<b>${esH(e.serial)}</b> ${esH(e.tipo)} ${esH(e.marca)} ${esH(e.modelo)}`, marcado, ` data-eq="${esH(e.id)}"`)}
      <div class="eq-acta-det"${marcado ? '' : ' hidden'}>${campoTxt('ehObs_' + e.id, 'Observaciones', '', 'Ej: con su funda; pantalla con un rayón', 120)}</div></div>`;
  const filaOtro = (nombre, k) => `<div class="otro-fila"><label for="ehOt_${k}">${esH(nombre)}</label><input type="number" inputmode="numeric" min="0" max="99" step="1" value="0" id="ehOt_${k}" data-otro="${esH(nombre)}"></div>`;
  const filaOtroLibre = k => `<div class="otro-fila libre"><input type="text" maxlength="40" id="ehOtN_${k}" placeholder="Otro (ej: grabadora de voz)" aria-label="Otro elemento ${k + 1}"><input type="number" inputmode="numeric" min="0" max="99" step="1" value="0" id="ehOtC_${k}" aria-label="Cantidad del otro elemento ${k + 1}"></div>`;
  function leerOtros() {
    const out = [];
    $('eqCampos').querySelectorAll('input[data-otro]').forEach(i => { const n = Math.round(Number(i.value) || 0); if (n > 0) out.push({ nombre: i.dataset.otro, cantidad: Math.min(99, n) }); });
    [0, 1].forEach(k => { const nom = valor('ehOtN_' + k), n = Math.round(Number(valor('ehOtC_' + k)) || 0); if (nom && n > 0) out.push({ nombre: nom.slice(0, 40), cantidad: Math.min(99, n) }); });
    return out;
  }
  function entrega(preId) {
    const libres = equipos().filter(e => !bajaDe(e) && (e.estado === 'bodega' || (e.estado === 'recibido' && !pend(e).mtto && !pend(e).backup)));
    const nombres = personas().map(p => p.nombre);
    abrir({ titulo: 'Entrega de equipos y herramientas', sub: 'El acta se llena y se firma aquí mismo, sin papel. Después Soporte la revisa.',
      campos: `<datalist id="ehNombres">${nombres.map(n => `<option value="${esH(n)}">`).join('')}</datalist>` +
        `<div class="fields cols">${campoTxt('ehFecha', 'Fecha', hoy(), '', 10, 'date')}${campoTxt('ehCedula', 'Cédula', '', 'Solo números', 12, 'text')}</div>` +
        campoTxt('ehPersona', 'Nombre', '', 'Nombre completo de quien recibe', 80, 'text', 'ehNombres') +
        `<div class="fields cols">${campoSel('ehProy', 'Proyecto', PROYECTOS.map(p => [p[0], p[0]]), PROYECTOS[0][0])}${campoTxt('ehCodigo', 'Código del proyecto', PROYECTOS[0][1], '', 20)}</div>` +
        `<div class="field"><span class="lbl">Equipos (serial, cantidad y observaciones)</span>${libres.length ? boton('escanear', 'Escanear un equipo', 'codigo', '', 'small', ' data-modo="entrega"') + libres.map(e => filaEq(e, e.id === preId)).join('') : '<p class="meta">No hay equipos en bodega para entregar.</p>'}</div>` +
        `<div class="field"><span class="lbl">Otros (cantidad)</span><div class="otros">${OTROS.map(filaOtro).join('')}${filaOtroLibre(0)}${filaOtroLibre(1)}</div></div>` +
        campoFirma('ehFirmaP', 'Firma de quien recibe', '—'),
      primario: 'Guardar el acta', icono: 'entrega', listo: 'Listo: acta guardada. Soporte ya la tiene para revisarla.', base: fotoBase(libres), numerada: true,
      ops: () => {
        const ids = Array.from($('eqCampos').querySelectorAll('input[data-eq]:checked')).map(x => x.dataset.eq);
        const p = valor('ehPersona'), ced = valor('ehCedula').replace(/\D/g, ''), fecha = valor('ehFecha'), proy = valor('ehProy'), cod = valor('ehCodigo');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoy()) return fallar('Revisa la fecha.', 'ehFecha');
        if (p.length < 5) return fallar('Escribe el nombre completo de quien recibe.', 'ehPersona');
        if (ced.length < 5 || ced.length > 12) return fallar('Escribe la cédula (solo números).', 'ehCedula');
        if (!ids.length) return fallar('Escoge al menos un equipo.');
        if (cambiaron(ids)) return fallar('Un equipo cambió mientras tenías esto abierto. Ciérralo y ábrelo otra vez.');
        if (!firmada('ehFirmaP')) return fallar('Falta la firma de quien recibe.');
        const fp = leerFirma('ehFirmaP'); if (fp.length > MAX_FIRMA) return fallar('La firma quedó muy pesada. Bórrala y fírmala más sencilla.');
        const es = ids.map(eqPorId), numero = siguienteNumero(), hid = 'ac' + numero;
        const ops = [['set', 'hojas', hid, { numero, fecha, persona: p, cedula: ced, proyecto: proy, codigoProyecto: cod,
          equipos: es.map(e => ({ id: e.id, serial: e.serial, tipo: e.tipo, marca: e.marca, modelo: e.modelo || '', cantidad: 1, obs: valor('ehObs_' + e.id) })), otros: leerOtros(),
          firmaPersona: fp, encargado: persona().nombre, por: persona().nombre, porRol: miRol(), en: ahora(), devoluciones: [], revision: 'pendiente', revisadaPor: '', revisadaEn: '', notaRevision: '' }]];
        es.forEach(e => ops.push(['mezclar', 'equipos', e.id, { estado: 'asignado', asignadoA: p, asignadoCedula: ced, proyecto: proy, pendientes: { mtto: false, backup: false }, historial: conPaso(e, { fecha, tipo: 'entrega', persona: p, nota: `Acta ${numActa({ numero })} (${proy})`, hojaId: hid }) }]));
        return ops.concat([aviso('soporte', 'Acta de entrega para revisar', `${persona().nombre} le entregó a ${p}: ${es.map(e => e.serial).join(', ')} (acta ${numActa({ numero })}).`, true)]);
      } });
    activarFirma('ehFirmaP');
  }
  /* ---------- devolución: se firma en la misma acta ---------- */
  function devolucion(clave) {
    const conEquipos = personas().filter(p => p.hojas.some(h => porDevolver(h).some(x => { const e = eqPorId(x.id); return e && e.estado === 'asignado'; })));
    if (!conEquipos.length) { A().toast('Nadie tiene equipos por devolver.'); return null; }
    const elegido = conEquipos.find(p => p.clave === clave) || conEquipos[0];
    abrir({ titulo: 'Devolución de equipos', sub: 'Se anota en la misma acta de la entrega, con la fecha de devolución y la firma. Lo que llega queda en Recibidos.',
      campos: campoSel('ehQuien', 'Quién devuelve', conEquipos.map(p => [p.clave, `${p.nombre}${p.cedula ? ' · C.C. ' + p.cedula : ''}`]), elegido.clave) +
        campoTxt('ehFecha', 'Fecha de devolución', hoy(), '', 10, 'date') + `<div class="acc-rap">${boton('escanear', 'Escanear un equipo', 'codigo', '', 'small', ' data-modo="devolucion"')}</div><div class="field" id="ehLista"></div>` +
        campoFirma('ehFirmaP', 'Firma de quien devuelve', elegido.cedula || '—'),
      primario: 'Guardar la devolución', icono: 'devolucion', listo: 'Listo: devolución anotada en el acta. Los equipos quedaron en Recibidos.',
      base: fotoBase(D().equipos.filter(e => e.estado === 'asignado')),
      ops: () => {
        const p = personas().find(x => x.clave === valor('ehQuien')), fecha = valor('ehFecha');
        const marcados = Array.from($('eqCampos').querySelectorAll('input[data-eq]:checked')).map(x => ({ id: x.dataset.eq, hoja: x.dataset.hoja }));
        if (!p) return fallar('Escoge quién devuelve.', 'ehQuien');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoy()) return fallar('Revisa la fecha de devolución.', 'ehFecha');
        if (!marcados.length) return fallar('Escoge al menos un equipo.');
        if (cambiaron(marcados.map(m => m.id))) return fallar('Un equipo cambió mientras tenías esto abierto. Ciérralo y ábrelo otra vez.');
        if (!firmada('ehFirmaP')) return fallar('Falta la firma de quien devuelve.');
        const fp = leerFirma('ehFirmaP'); if (fp.length > MAX_FIRMA) return fallar('La firma quedó muy pesada. Bórrala y fírmala más sencilla.');
        const ops = [], porHoja = {};
        marcados.forEach(m => { (porHoja[m.hoja] = porHoja[m.hoja] || []).push(m.id); });
        for (const [hid, ids] of Object.entries(porHoja)) {
          const h = hojaPorId(hid); if (!h) return fallar('Un acta ya no existe. Cierra y abre otra vez.');
          const obs = ids.map(id => { const o = valor('ehObsD_' + id), e = eqPorId(id); return o ? `${e ? e.serial : id}: ${o}` : ''; }).filter(Boolean).join('; ');
          ops.push(['mezclar', 'hojas', hid, { devoluciones: lista(h.devoluciones).concat([{ fecha, equipos: ids, firma: fp, obs, recibio: persona().nombre, en: ahora() }]), revision: 'pendiente', revisadaPor: '', revisadaEn: '', notaRevision: '' }]);
          ids.forEach(id => { const e = eqPorId(id), o = valor('ehObsD_' + id); ops.push(['mezclar', 'equipos', id, { estado: 'recibido', obs: o || e.obs || '', pendientes: { mtto: true, backup: true }, historial: conPaso(e, { fecha, tipo: 'devolucion', persona: p.nombre, nota: o || `Devuelto (acta ${numActa(h)})`, hojaId: hid }) }]); });
        }
        return ops.concat([aviso('soporte', 'Devolución para revisar', `${p.nombre} devolvió ${marcados.map(m => (eqPorId(m.id) || {}).serial).join(', ')}. Quedaron en Recibidos.`, true)]);
      } });
    pintarListaDevolucion();
    activarFirma('ehFirmaP');
    return true;
  }
  function pintarListaDevolucion() {
    const p = personas().find(x => x.clave === valor('ehQuien'));
    const abiertas = p ? p.hojas.filter(h => porDevolver(h).length) : [];
    $('ehLista').innerHTML = '<span class="lbl">Equipos que devuelve</span>' + abiertas.map(h => `<div class="eq-acta"><span class="meta">Acta ${esH(numActa(h))} · entregado el ${esH(A().fechaCorta(h.fecha))}</span>
      ${porDevolver(h).filter(x => { const e = eqPorId(x.id); return e && e.estado === 'asignado'; }).map(x => `${marca('ehEqD_' + x.id, `<b>${esH(x.serial)}</b> ${esH(x.tipo)} ${esH(x.marca)} ${esH(x.modelo || '')}`, true, ` data-eq="${esH(x.id)}" data-hoja="${esH(h.id)}"`)}
        <div class="eq-acta-det">${campoTxt('ehObsD_' + x.id, 'Cómo llega', '', 'Ej: bisagra floja; sin el mouse', 120)}</div>`).join('')}
      ${lista(h.otros).length ? `<span class="meta">Otros de esa acta: ${esH(lista(h.otros).map(o => `${o.nombre} (${o.cantidad})`).join(', '))}</span>` : ''}</div>`).join('');
    const cc = $('ehFirmaPCC'); if (cc) cc.textContent = p && p.cedula ? p.cedula : '—';
  }
  function trabajo(e, tipo) {
    const mtto = tipo === 'mtto';
    abrir({ titulo: `${mtto ? 'Mantenimiento' : 'Backup'} del ${e.serial}`, sub: `${e.tipo} ${e.marca} ${e.modelo}`,
      campos: campoTxt('ehNota', mtto ? 'Qué se le hizo' : 'Qué se copió y dónde', '', mtto ? 'Ej: limpieza, cambio de pasta térmica, tecla arreglada' : 'Ej: carpetas de reuniones al disco de backup', 160),
      primario: 'Guardar', icono: 'check', listo: mtto ? 'Listo: mantenimiento guardado.' : 'Listo: backup guardado.', base: fotoBase([e]),
      ops: () => {
        const nota = valor('ehNota'); if (nota.length < 4) return fallar('Cuenta en pocas palabras qué se hizo.', 'ehNota');
        if (cambiaron([e.id])) return fallar('El equipo cambió mientras tenías esto abierto. Ciérralo y ábrelo otra vez.');
        const p = Object.assign({ mtto: false, backup: false }, pend(e)); p[mtto ? 'mtto' : 'backup'] = false;
        const ops = [['mezclar', 'equipos', e.id, Object.assign({ pendientes: p, historial: conPaso(e, { tipo: mtto ? 'mantenimiento' : 'backup', persona: persona().nombre, nota }) }, mtto ? { ultimoMtto: hoy() } : { ultimoBackup: hoy() })]];
        // Si la agenda tenía esa misma tarea para el equipo, queda hecha también.
        tareasPend().filter(t => t.equipoId === e.id && t.tipo === (mtto ? 'mantenimiento' : 'backup')).forEach(t => {
          ops.push(['mezclar', 'tareasEq', t.id, { estado: 'hecha', hechaPor: persona().nombre, hechaEn: ahora(), resultado: nota }]);
          ops.push(aviso(t.pidioRol, `${TIPO_TAREA[t.tipo]} hecho`, `${persona().nombre} hizo ${TIPO_TAREA[t.tipo].toLowerCase()} del ${t.serial}: ${nota}`));
        });
        return ops;
      } });
  }
  function aBodega(e) {
    abrir({ titulo: `Pasar el ${e.serial} a bodega`, sub: 'Ya tiene mantenimiento y backup. Queda listo para entregar.', primario: 'Pasar a bodega', icono: 'bolsa', listo: 'Listo: el equipo está en bodega.', base: fotoBase([e]),
      ops: () => (cambiaron([e.id]) ? fallar('El equipo cambió. Ciérralo y ábrelo otra vez.')
        : [['mezclar', 'equipos', e.id, { estado: 'bodega', asignadoA: '', asignadoCedula: '', proyecto: '', pendientes: { mtto: false, backup: false }, historial: conPaso(e, { tipo: 'bodega', persona: persona().nombre, nota: 'Listo y guardado en bodega' }) }]]) });
  }
  function revisar(h) {
    abrir({ titulo: `Revisar acta ${numActa(h)}`, sub: `${h.persona}${lista(h.devoluciones).length ? ' · con devolución' : ''}`,
      campos: htmlActa(h) + '<p class="meta">Revisa la fecha, el nombre, la cédula, el proyecto, los seriales, los otros elementos y las firmas.</p>' +
        '<div class="field"><span class="lbl">¿Cómo está el acta?</span><label class="marca-fila"><input type="radio" name="ehRev" value="ok" checked><span>Está bien</span></label><label class="marca-fila"><input type="radio" name="ehRev" value="problema"><span>Tiene un problema</span></label></div>' +
        campoTxt('ehNotaRev', 'Qué está mal (si tiene un problema)', '', 'Ej: la cédula no coincide', 160),
      primario: 'Guardar la revisión', icono: 'check', listo: 'Listo: acta revisada.', baseHoja: Object.assign({}, h),
      ops: () => {
        const r = ($('eqCampos').querySelector('input[name="ehRev"]:checked') || {}).value, nota = valor('ehNotaRev');
        if (r === 'problema' && nota.length < 5) return fallar('Cuenta qué está mal para que el Encargado lo corrija.', 'ehNotaRev');
        return [['mezclar', 'hojas', h.id, { revision: r === 'problema' ? 'problema' : 'ok', revisadaPor: persona().nombre, revisadaEn: ahora(), notaRevision: r === 'problema' ? nota : '' }],
          r === 'problema' ? aviso('equipos', 'Un acta tiene un problema', `${persona().nombre}: acta ${numActa(h)} de ${h.persona}. ${nota}`) : null];
      } });
  }
  function corregir(h) {
    abrir({ titulo: `Corregir acta ${numActa(h)}`, sub: `Problema: ${h.notaRevision || 'sin nota'}`,
      campos: `<div class="fields cols">${campoTxt('ehPersona', 'Nombre', h.persona, '', 80)}${campoTxt('ehCedula', 'Cédula', h.cedula, '', 12)}</div>` +
        `<div class="fields cols">${campoSel('ehProy', 'Proyecto', PROYECTOS.map(p => [p[0], p[0]]), h.proyecto)}${campoTxt('ehCodigo', 'Código del proyecto', h.codigoProyecto, '', 20)}</div>` +
        '<p class="meta">Si el problema es la firma de la entrega, que la persona firme otra vez (si no, déjalo en blanco):</p>' + campoFirma('ehFirmaP', 'Firma de quien recibe (otra vez)', ''),
      primario: 'Mandar otra vez a Soporte', icono: 'enviar', listo: 'Listo: el acta volvió a Soporte para revisarla.', baseHoja: Object.assign({}, h),
      ops: () => {
        const ced = valor('ehCedula').replace(/\D/g, ''), p = valor('ehPersona');
        if (p.length < 5 || ced.length < 5 || ced.length > 12) return fallar('Revisa el nombre y la cédula.');
        const cambio = { persona: p, cedula: ced, proyecto: valor('ehProy'), codigoProyecto: valor('ehCodigo'), revision: 'pendiente', revisadaPor: '', revisadaEn: '' };
        if (firmada('ehFirmaP')) { cambio.firmaPersona = leerFirma('ehFirmaP'); if (cambio.firmaPersona.length > MAX_FIRMA) return fallar('La firma quedó muy pesada. Bórrala y fírmala más sencilla.'); }
        const ops = [['mezclar', 'hojas', h.id, cambio]];
        // Si cambió el nombre o la cédula, los equipos que siguen con esa persona quedan con el dato corregido.
        porDevolver(h).forEach(x => { const e = eqPorId(x.id); if (e && e.estado === 'asignado' && (e.asignadoA !== p || e.asignadoCedula !== ced)) ops.push(['mezclar', 'equipos', e.id, { asignadoA: p, asignadoCedula: ced, historial: conPaso(e, { tipo: 'correccion', persona: p, nota: `Se corrigió el acta ${numActa(h)}`, hojaId: h.id }) }]); });
        return ops.concat([aviso('soporte', 'Acta corregida para revisar', `${persona().nombre} corrigió el acta ${numActa(h)} de ${p}.`, true)]);
      } });
    activarFirma('ehFirmaP');
  }
  function programar(e) {
    const ops = activos().map(x => [x.id, `${x.serial} · ${x.tipo} ${x.marca} (${x.estado === 'bodega' ? 'bodega' : x.asignadoA || x.estado})`]);
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
      primario: 'Marcar hecha', icono: 'check', listo: 'Listo: tarea hecha. Ya le avisamos a quien la pidió.', base: e ? fotoBase([e]) : {},
      ops: () => {
        const nota = valor('ehNota'); if (nota.length < 4) return fallar('Cuenta en pocas palabras qué se hizo.', 'ehNota');
        if (e && cambiaron([e.id])) return fallar('El equipo cambió mientras tenías esto abierto. Ciérralo y ábrelo otra vez.');
        const ops = [['mezclar', 'tareasEq', t.id, { estado: 'hecha', hechaPor: persona().nombre, hechaEn: ahora(), resultado: nota }]];
        if (e && e.estado !== 'baja') {
          const tipo = t.tipo === 'backup' ? 'backup' : t.tipo === 'mantenimiento' ? 'mantenimiento' : 'revision';
          const cambio = { historial: conPaso(e, { tipo, persona: persona().nombre, nota }) };
          if (tipo === 'mantenimiento') cambio.ultimoMtto = hoy();
          if (tipo === 'backup') cambio.ultimoBackup = hoy();
          // Si el equipo está en Recibidos, esa parte queda lista allá también.
          if (e.estado === 'recibido' && tipo !== 'revision') cambio.pendientes = Object.assign({ mtto: false, backup: false }, pend(e), { [tipo === 'backup' ? 'backup' : 'mtto']: false });
          ops.push(['mezclar', 'equipos', e.id, cambio]);
        }
        ops.push(aviso(t.pidioRol, `${TIPO_TAREA[t.tipo] || 'Tarea'} hecho`, `${persona().nombre} hizo ${(TIPO_TAREA[t.tipo] || 'la tarea').toLowerCase()} del ${t.serial}: ${nota}`));
        return ops;
      } });
  }
  function nuevo() {
    abrir({ titulo: 'Registrar equipo nuevo', sub: 'Queda en bodega, listo para entregar.',
      campos: `<div class="fields cols">${campoTxt('ehSerial', 'Serial', '', 'Ej: DEMO-0013', 30)}${campoSel('ehTipo', 'Tipo', TIPOS_EQ.map(t => [t, t]), 'Portátil')}</div>` +
        `<div class="fields cols">${campoTxt('ehMarca', 'Marca', '', 'Ej: Lenovo', 40)}${campoTxt('ehModelo', 'Modelo', '', 'Ej: ThinkPad E14', 60)}</div>` + campoTxt('ehObs', 'Observaciones', '', '', 160) + camposCompra({}),
      primario: 'Registrar', icono: 'mas', listo: 'Listo: equipo registrado en bodega.',
      ops: () => {
        const serial = valor('ehSerial').toUpperCase(), marcaV = valor('ehMarca'), modelo = valor('ehModelo');
        if (!/^[A-Z0-9-]{4,30}$/.test(serial)) return fallar('Escribe el serial (letras, números y guiones).', 'ehSerial');
        if (D().equipos.some(e => String(e.serial).toUpperCase() === serial)) return fallar('Ya hay un equipo con ese serial.', 'ehSerial');
        if (!marcaV) return fallar('Escribe la marca.', 'ehMarca');
        const compra = leerCompra(); if (typeof compra === 'string') return false;
        return [['set', 'equipos', window.nube.idNuevo('eq'), { serial, tipo: valor('ehTipo'), marca: marcaV, modelo, estado: 'bodega', asignadoA: '', asignadoCedula: '', proyecto: '', ultimoMtto: '', ultimoBackup: '', obs: valor('ehObs'), ...compra,
          pendientes: { mtto: false, backup: false }, historial: [{ fecha: hoy(), tipo: 'registro', persona: persona().nombre, nota: 'Equipo registrado en bodega', por: persona().nombre }] }]];
      } });
  }

  /* ---------- compra y garantía ---------- */
  /** Los 4 datos de compra (todos opcionales): fecha de compra, garantía hasta, proveedor y costo en pesos. */
  const camposCompra = e => `<div class="section-label">Compra y garantía (opcional)</div><div class="fields cols">${campoTxt('ehFCompra', 'Fecha de compra', e.fechaCompra || '', '', 10, 'date')}${campoTxt('ehGarantia', 'Garantía hasta', e.garantiaHasta || '', '', 10, 'date')}</div>` +
    campoTxt('ehProveedor', 'Proveedor', e.proveedor || '', 'Ej: Tecnoventas Ejemplo S. A. S.', 60) + campoTxt('ehCosto', 'Costo en pesos', Number(e.costo) > 0 ? e.costo : '', 'Solo números', 12, 'text');
  /** Lee y revisa esos 4 datos: devuelve el objeto o falla con un aviso (y devuelve un texto). */
  function leerCompra() {
    const fc = valor('ehFCompra'), gh = valor('ehGarantia'), pv = valor('ehProveedor'), cs = valor('ehCosto').replace(/[\s$.]/g, '');
    if (fc && (!/^\d{4}-\d{2}-\d{2}$/.test(fc) || fc > hoy())) return fallar('Revisa la fecha de compra: no puede ser de mañana.', 'ehFCompra') || 'x';
    if (gh && !/^\d{4}-\d{2}-\d{2}$/.test(gh)) return fallar('Revisa la fecha en que termina la garantía.', 'ehGarantia') || 'x';
    if (fc && gh && gh < fc) return fallar('La garantía no puede terminar antes de la compra.', 'ehGarantia') || 'x';
    if (cs && !/^\d{1,10}$/.test(cs)) return fallar('Escribe el costo en pesos, solo números.', 'ehCosto') || 'x';
    return { fechaCompra: fc, garantiaHasta: gh, proveedor: pv, costo: cs ? Number(cs) : 0 };
  }
  function datosCompra(e) {
    abrir({ titulo: `Compra y garantía del ${e.serial}`, sub: `${e.tipo} ${e.marca} ${e.modelo}. Todo es opcional.`, campos: camposCompra(e),
      primario: 'Guardar', icono: 'check', listo: 'Listo: datos de compra y garantía guardados.', base: fotoBase([e]),
      ops: () => {
        const c = leerCompra(); if (typeof c === 'string') return false;
        if (cambiaron([e.id])) return fallar('El equipo cambió mientras tenías esto abierto. Ciérralo y ábrelo otra vez.');
        return [['mezclar', 'equipos', e.id, Object.assign({}, c, { historial: conPaso(e, { tipo: 'compra', persona: persona().nombre, nota: [c.fechaCompra ? 'compra ' + A().fechaCorta(c.fechaCompra) : '', c.garantiaHasta ? 'garantía hasta ' + A().fechaCorta(c.garantiaHasta) : '', c.proveedor, c.costo ? A().cop(c.costo) : ''].filter(Boolean).join(' · ') || 'Se borraron los datos de compra' }) })]];
      } });
  }

  /* ---------- baja de un equipo ---------- */
  /** Pedir la baja (Encargado) o darla directamente (la Jefe): motivo y una nota obligatoria. */
  function baja(e) {
    const directa = esJefe();
    abrir({ titulo: `${directa ? 'Dar de baja' : 'Pedir la baja del'} ${directa ? 'el ' : ''}${e.serial}`, sub: directa ? 'El equipo sale de las cifras y ya no se puede entregar. Su hoja de vida queda en «De baja».' : 'La Jefe decide. Mientras tanto el equipo sigue donde está.',
      campos: `<p class="meta">${esH(`${e.tipo} ${e.marca} ${e.modelo}`)} · ${esH(quienTiene(e))}</p>` + campoSel('ebMotivo', 'Por qué', Object.keys(MOTIVO_BAJA).map(k => [k, MOTIVO_BAJA[k]]), 'danado') +
        campoTxt('ebNota', 'Cuenta qué pasó (obligatorio)', '', 'Ej: no enciende y el arreglo cuesta más que uno nuevo', 200),
      primario: directa ? 'Dar de baja' : 'Pedir la baja', icono: 'borrar', listo: directa ? 'Listo: el equipo quedó de baja.' : 'Listo: la baja quedó pedida. La Jefe ya tiene el aviso.', base: fotoBase([e]),
      ops: () => {
        const motivo = valor('ebMotivo'), nota = valor('ebNota');
        if (nota.length < 5) return fallar('Cuenta qué pasó (al menos unas palabras).', 'ebNota');
        if (!['bodega', 'recibido'].includes(e.estado)) return fallar('Un equipo asignado primero se recibe (devolución) y después se da de baja.');
        if (cambiaron([e.id])) return fallar('El equipo cambió mientras tenías esto abierto. Ciérralo y ábrelo otra vez.');
        const pedida = { motivo, nota, por: persona().nombre, porRol: miRol(), en: hoy() }, texto = `${MOTIVO_BAJA[motivo]}: ${nota}`;
        if (!directa) return [['mezclar', 'equipos', e.id, { bajaPedida: pedida, historial: conPaso(e, { tipo: 'baja-pedida', persona: persona().nombre, nota: texto }) }],
          aviso('jefe', 'Piden la baja de un equipo', `${persona().nombre} pide dar de baja el ${e.serial} (${e.tipo} ${e.marca}). ${texto}`)];
        return cerrarBaja(e, pedida, texto);
      } });
  }
  /** Lo que se escribe al dar de baja: el equipo pasa a «baja» y las tareas pendientes de la agenda se cierran. */
  function cerrarBaja(e, pedida, texto) {
    const ops = [['mezclar', 'equipos', e.id, { estado: 'baja', bajaPedida: pedida, bajaPor: persona().nombre, bajaEn: hoy(), historial: conPaso(e, { tipo: 'baja', persona: persona().nombre, nota: texto }) }]];
    tareasPend().filter(t => t.equipoId === e.id).forEach(t => ops.push(['mezclar', 'tareasEq', t.id, { estado: 'hecha', hechaPor: persona().nombre, hechaEn: ahora(), resultado: 'El equipo se dio de baja' }]));
    if (pedida.porRol && pedida.porRol !== miRol()) ops.push(aviso(pedida.porRol, 'Aprobaron la baja', `${persona().nombre} aprobó la baja del ${e.serial}. ${texto}`));
    return ops;
  }
  function aprobarBaja(e) {
    const b = bajaDe(e);
    abrir({ titulo: `Aprobar la baja del ${e.serial}`, sub: `${e.tipo} ${e.marca} ${e.modelo}`,
      campos: `<p><b>${esH(MOTIVO_BAJA[b.motivo] || b.motivo)}:</b> ${esH(b.nota)}</p><p class="meta">La pidió ${esH(b.por)} el ${esH(A().fechaCorta(b.en))}. Al aprobarla, el equipo sale de las cifras, ya no se puede entregar y las tareas pendientes de la agenda se cierran. La hoja de vida queda en «De baja».</p>`,
      primario: 'Aprobar la baja', icono: 'check', listo: 'Listo: el equipo quedó de baja.', base: fotoBase([e]),
      ops: () => (cambiaron([e.id]) ? fallar('El equipo cambió mientras tenías esto abierto. Ciérralo y ábrelo otra vez.') : cerrarBaja(e, b, `${MOTIVO_BAJA[b.motivo] || b.motivo}: ${b.nota}`)) });
  }
  function noAprobarBaja(e) {
    const b = bajaDe(e);
    abrir({ titulo: `No aprobar la baja del ${e.serial}`, sub: `${MOTIVO_BAJA[b.motivo] || b.motivo}: ${b.nota}`,
      campos: campoTxt('ebPorque', 'Por qué no (obligatorio)', '', 'Ej: todavía sirve, se arregla con una pieza', 160),
      primario: 'No aprobar', icono: 'x', listo: 'Listo: no se aprobó la baja. El equipo sigue igual.', base: fotoBase([e]),
      ops: () => {
        const por = valor('ebPorque'); if (por.length < 5) return fallar('Cuenta por qué no se aprueba.', 'ebPorque');
        if (cambiaron([e.id])) return fallar('El equipo cambió mientras tenías esto abierto. Ciérralo y ábrelo otra vez.');
        return [['mezclar', 'equipos', e.id, { bajaPedida: null, historial: conPaso(e, { tipo: 'baja-no', persona: persona().nombre, nota: `No se aprobó la baja (${MOTIVO_BAJA[b.motivo] || b.motivo}): ${por}` }) }],
          b.porRol && b.porRol !== miRol() ? aviso(b.porRol, 'No aprobaron la baja', `${persona().nombre} no aprobó la baja del ${e.serial}: ${por}`) : null];
      } });
  }

  /* ---------- verificar equipos (contar con el escáner) ---------- */
  const ALCANCES = [['bodega', 'Los que están en bodega y en Recibidos'], ['asignado', 'Los asignados a personas'], ['todos', 'Todos']];
  const esperados = () => activos().filter(e => verif.alcance === 'todos' || (verif.alcance === 'asignado' ? e.estado === 'asignado' : e.estado !== 'asignado'));
  const filaVerif = e => `<li><span class="serial-chip">${esH(e.serial)}</span> <span class="meta">${esH(e.tipo)} ${esH(e.marca)} · ${esH(quienTiene(e))}</span></li>`;
  /** Lo que se ve debajo del escáner: el resumen en vivo («Verificados 18 · Sin encontrar 2») y las dos listas. */
  function pintarVerif() {
    const c = $('evLista'); if (!c || !verif) return;
    const hechos = Array.from(verif.hechos).map(eqPorId).filter(Boolean), faltan = esperados().filter(e => !verif.hechos.has(e.id));
    c.innerHTML = `<p class="ver-resumen" role="status"><b>Verificados ${hechos.length}</b> · <b>Sin encontrar ${faltan.length}</b></p>` +
      `<div class="section-label">Verificados (${hechos.length})</div>${hechos.length ? `<ul class="ver-lista">${hechos.slice().reverse().map(filaVerif).join('')}</ul>` : '<p class="meta">Todavía no has escaneado ninguno.</p>'}` +
      `<div class="section-label">Sin encontrar todavía (${faltan.length})</div>${faltan.length ? `<ul class="ver-lista">${faltan.map(filaVerif).join('')}</ul>` : '<p class="meta">Ya está todo lo que esperabas.</p>'}`;
  }
  function verificar() {
    verif = { alcance: 'bodega', hechos: new Set() };
    const viejos = activos().filter(sinVerificar).length;
    abrir({ titulo: 'Verificar equipos', sub: viejos ? `${viejos} ${viejos === 1 ? 'equipo lleva' : 'equipos llevan'} más de 6 meses sin verificarse.` : 'Todos se verificaron en los últimos 6 meses.',
      campos: campoSel('evAlcance', 'Qué vas a revisar', ALCANCES, 'bodega') + `<div class="acc-rap">${boton('verescanear', 'Escanear equipos', 'codigo', '', 'primary small')}</div>` +
        `<div class="field"><label for="evSerial">O escribe el serial</label><div class="con-scan"><input id="evSerial" type="text" maxlength="40" autocomplete="off" placeholder="Ej: DEMO-0001"><button type="button" class="btn small" data-accion="veragregar" data-id="">Agregar</button></div></div><div id="evLista"></div>`,
      primario: 'Guardar la verificación', icono: 'check', listo: 'Listo: equipos verificados.', esVerif: true,
      ops: () => {
        const ids = Array.from(verif.hechos).map(eqPorId).filter(e => e && e.estado !== 'baja');
        if (!ids.length) return fallar('Escanea o escribe al menos un equipo.');
        if (ids.length > 400) return fallar('Son muchos equipos para guardar de una vez: guarda esta parte y sigue con la otra.');
        accion.listo = `Listo: Verificados ${ids.length} · Sin encontrar ${esperados().filter(e => !verif.hechos.has(e.id)).length}.`;
        return ids.map(e => ['mezclar', 'equipos', e.id, { verificadoEn: hoy(), verificadoPor: persona().nombre }]);
      } });
    A().vigilar('shEq', () => $('eqForm'), () => (verif ? verif.hechos.size : 0));
    pintarVerif();
  }
  /** Marca un equipo como verificado (por escáner o escrito a mano). */
  function agregarVerif(s) {
    if (!verif || !accion || !accion.esVerif) return;
    const e = porSerial(s);
    if (!e) { A().toast(`No hay un equipo con el serial ${s}`); return; }
    if (e.estado === 'baja') { A().toast(`El ${e.serial} está de baja: no se verifica.`); return; }
    if (verif.hechos.has(e.id)) { A().toast(`${e.serial} ya estaba verificado.`); return; }
    verif.hechos.add(e.id); pintarVerif();
    A().toast(`Verificado: ${e.serial}`);
  }
  /** Escanea uno tras otro hasta que se cierre la cámara. */
  async function escanearVerif() {
    while (accion && accion.esVerif && !$('shEq').hidden) {
      const s = await leerSerial('Escanear un equipo para verificarlo', activos().map(e => e.serial));
      if (!s || !accion || !accion.esVerif || $('shEq').hidden) break;
      agregarVerif(s);
    }
    return true;
  }

  /* ---------- hoja de vida, acta y persona ---------- */
  const TIPO_PASO = { entrega: 'Entrega', devolucion: 'Devolución', mantenimiento: 'Mantenimiento', backup: 'Backup', bodega: 'A bodega', registro: 'Registro', revision: 'Revisión', correccion: 'Corrección del acta', compra: 'Compra y garantía', 'baja-pedida': 'Baja pedida', baja: 'De baja', 'baja-no': 'Baja no aprobada' };
  function ver(e) {
    const App = A(), st = EST[e.estado] || ['Sin estado', 'none'], hs = hojasDe(e.id), ts = D().tareasEq.filter(t => t.equipoId === e.id && t.estado === 'pendiente');
    const pasos = historial(e).slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    // El historial de un equipo crece con cada mantenimiento y backup: se muestra de 30 en 30.
    const pgH = UI.pagina('hist-eq-' + e.id, pasos.map(x => `<li><b>${esH(TIPO_PASO[x.tipo] || x.tipo)}${x.persona ? ': ' + esH(x.persona) : ''}</b><span class="meta">${esH(App.fechaCorta(x.fecha))}${x.nota ? ' · ' + esH(x.nota) : ''}</span></li>`), { n: 30, reiniciar: true });
    const bts = [], b = bajaDe(e), enBaja = e.estado === 'baja', gd = dias(e.garantiaHasta);
    if (esEncargado() && !enBaja) {
      if (e.estado === 'bodega' && !b) bts.push(boton('entregar', 'Entregar', 'entrega', e.id, 'primary small'));
      if (e.estado === 'asignado') { const p = personas().find(x => x.equipos.some(y => y.id === e.id)); if (p) bts.push(boton('devolver', 'Recibir (devolución)', 'devolucion', '', 'small', ` data-clave="${esH(p.clave)}"`)); }
      if (e.estado === 'recibido' && pend(e).mtto) bts.push(boton('mtto', 'Mantenimiento hecho', 'mantenimiento', e.id, 'primary small'));
      if (e.estado === 'recibido' && pend(e).backup) bts.push(boton('backup', 'Backup hecho', 'backup', e.id, 'small'));
      if (['bodega', 'recibido'].includes(e.estado) && !b) bts.push(boton('pedirbaja', esJefe() ? 'Dar de baja' : 'Pedir la baja', 'borrar', e.id, 'ghost small'));
      bts.push(boton('datoscompra', 'Compra y garantía', 'lapiz', e.id, 'ghost small'));
    }
    if (esJefe() && b && !enBaja) bts.push(boton('aprobarbaja', 'Aprobar la baja', 'check', e.id, 'primary small'), boton('noaprobarbaja', 'No aprobar', 'x', e.id, 'small'));
    if (programa() && !enBaja) bts.push(boton('programar', 'Programar tarea', 'programar', e.id, 'ghost small'));
    abrir({ titulo: `${e.serial} · ${e.tipo} ${e.marca}`, sub: e.modelo,
      campos: `<div class="row">${App.pill(st[0], st[1])}</div>
        <dl class="datos"><dt>Dónde está</dt><dd>${esH(quienTiene(e))}</dd>${e.proyecto ? `<dt>Proyecto</dt><dd>${esH(e.proyecto)}</dd>` : ''}
        <dt>Último mantenimiento</dt><dd>${esH(e.ultimoMtto ? App.fechaCorta(e.ultimoMtto) : 'Nunca')}</dd><dt>Último backup</dt><dd>${esH(e.ultimoBackup ? App.fechaCorta(e.ultimoBackup) : 'Nunca')}</dd>
        <dt>Última verificación</dt><dd>${esH(e.verificadoEn ? `${App.fechaCorta(e.verificadoEn)}${e.verificadoPor ? ' (' + e.verificadoPor + ')' : ''}` : 'Nunca')}</dd>
        ${e.fechaCompra ? `<dt>Comprado</dt><dd>${esH(App.fechaCorta(e.fechaCompra))}</dd>` : ''}${e.garantiaHasta ? `<dt>Garantía</dt><dd>hasta ${esH(App.fechaCorta(e.garantiaHasta))} <span class="meta">(${esH(textoGarantia(e))})</span></dd>` : ''}
        ${e.proveedor ? `<dt>Proveedor</dt><dd>${esH(e.proveedor)}</dd>` : ''}${Number(e.costo) > 0 ? `<dt>Costo</dt><dd>${esH(App.cop(e.costo))}</dd>` : ''}</dl>
        ${enBaja && b ? `<div class="aviso peligro" role="status"><span><b>De baja desde el ${esH(App.fechaCorta(e.bajaEn))}</b> (${esH(MOTIVO_BAJA[b.motivo] || b.motivo)}): ${esH(b.nota)}. La pidió ${esH(b.por)} y la aprobó ${esH(e.bajaPor || 'la Jefe')}. Ya no se entrega ni se cambia.</span></div>` : ''}
        ${!enBaja && b ? `<div class="aviso" role="status"><span><b>Baja pedida:</b> ${esH(MOTIVO_BAJA[b.motivo] || b.motivo)}: ${esH(b.nota)}. La pidió ${esH(b.por)} el ${esH(App.fechaCorta(b.en))}. Espera a la Jefe.</span></div>` : ''}
        ${!enBaja && e.estado === 'asignado' && esEncargado() ? '<p class="meta">Para darlo de baja primero hay que recibirlo (devolución).</p>' : ''}${!enBaja && gd != null && gd >= 0 && gd <= 30 ? `<div>${App.pill('Garantía ' + textoGarantia(e), 's-warn', 'aviso')}</div>` : ''}
        ${e.obs ? `<p class="meta">${esH(e.obs)}</p>` : ''}${bts.length ? `<div class="tarea-pie">${bts.join('')}</div>` : ''}
        ${ts.length ? `<div class="section-label">Agenda (${ts.length})</div><div class="list">${ts.map(tarjetaTarea).join('')}</div>` : ''}
        <div class="section-label">Actas (${hs.length})</div>${hs.length ? `<div class="list">${hs.map(tarjetaActa).join('')}</div>` : '<p class="meta">Sin actas.</p>'}
        <div class="section-label">Historial</div><ol class="linea">${pgH.html || '<li><span class="meta">Sin historial.</span></li>'}</ol>${pgH.mas}` });
    accion.volverA = e.id;
  }
  /** El acta como la hoja de papel: encabezado, datos, tabla de equipos y de otros, firma y devolución. */
  function htmlActa(h) {
    const App = A(), fp = firma(h.firmaPersona), eqs = lista(h.equipos), otros = lista(h.otros);
    const porFila = {}; eqs.forEach(x => { const f = FILA_DE[x.tipo] || String(x.tipo || 'OTRO').toUpperCase(); (porFila[f] = porFila[f] || []).push(x); });
    const filas = FILAS_EQ.concat(Object.keys(porFila).filter(f => !FILAS_EQ.includes(f)));
    const celdaEq = f => { const xs = porFila[f] || []; return `<tr${xs.length ? ' class="llena"' : ''}><td>${esH(f)}</td><td>${esH(xs.map(x => x.serial).join(', '))}</td><td>${xs.length ? xs.reduce((c, x) => c + (Number(x.cantidad) || 1), 0) : ''}</td><td>${esH(xs.map(x => [x.marca, x.modelo, x.obs].filter(Boolean).join(' ')).join('; '))}</td></tr>`; };
    const otrosFijos = OTROS.filter(o => o !== 'Cargador'), extraOtros = otros.filter(o => !otrosFijos.includes(o.nombre));
    const celdaOtro = (nombre, cant) => `<tr${cant ? ' class="llena"' : ''}><td>${esH(String(nombre).toUpperCase())}</td><td></td><td>${esH(cant || '')}</td><td></td></tr>`;
    const devs = lista(h.devoluciones);
    return `<article class="acta-doc" id="actaDoc">
      <header class="acta-cab"><span class="acta-logo">Control<br><small>demo</small></span><b>ENTREGA DE EQUIPOS Y HERRAMIENTAS</b><span class="acta-cod">Código: FT-DEMO<br>Versión: 01<br>Acta ${esH(numActa(h))}</span></header>
      <dl class="acta-datos"><dt>FECHA:</dt><dd>${esH(App.fechaCorta(h.fecha))}</dd><dt>NOMBRE:</dt><dd>${esH(h.persona)}</dd><dt>CÉDULA:</dt><dd>${esH(h.cedula || '')}</dd>
        <dt>PROYECTO:</dt><dd>${esH(h.proyecto || '')}</dd><dt>CÓDIGO PROYECTO:</dt><dd>${esH(h.codigoProyecto || '')}</dd></dl>
      <table class="acta-tabla"><thead><tr><th>EQUIPO</th><th>SERIAL</th><th>CANTIDAD</th><th>OBSERVACIONES</th></tr></thead>
        <tbody>${filas.map(celdaEq).join('')}<tr class="sep"><td colspan="4">OTROS</td></tr>${otrosFijos.map(o => celdaOtro(o, (otros.find(x => x.nombre === o) || {}).cantidad)).join('')}${extraOtros.map(o => celdaOtro(o.nombre, o.cantidad)).join('')}</tbody></table>
      <div class="acta-firma"><span>Firma recibido:</span>${fp ? `<img src="${esH(fp)}" alt="Firma de ${esH(h.persona)}">` : '<i></i>'}<span>CC ${esH(h.cedula || '')}</span></div>
      <div class="acta-dev"><b>FECHA DE DEVOLUCIÓN</b><span>${esH(devs.map(d => App.fechaCorta(d.fecha)).join(' · '))}</span></div>
      ${devs.length ? devs.map(d => `<div class="acta-firma"><span>Firma recibido:</span>${firma(d.firma) ? `<img src="${esH(firma(d.firma))}" alt="Firma de la devolución">` : '<i></i>'}<span>CC ${esH(h.cedula || '')} · ${esH(App.fechaCorta(d.fecha))}${Array.isArray(d.equipos) && d.equipos.length < eqs.length ? ' · ' + esH(eqs.filter(x => d.equipos.includes(x.id)).map(x => x.serial).join(', ')) : ''}</span></div>${d.obs ? `<p class="acta-nota">${esH(d.obs)}</p>` : ''}`).join('')
        : '<div class="acta-firma"><span>Firma recibido:</span><i></i><span>CC</span></div>'}
      <p class="acta-pie">Entregó: ${esH(h.encargado || h.por)} (Encargado de equipos)${devs.length ? ' · Recibió la devolución: ' + esH(devs.map(d => d.recibio).join(', ')) : ''} · Documento de prueba</p>
    </article>`;
  }
  function verActa(h) {
    const r = REV[h.revision] || REV.pendiente, ea = EST_ACTA[estadoActa(h)];
    const bts = (puedeRevisar(h) ? boton('revisar', 'Revisar el acta', 'check', h.id, 'primary small') : '') + (h.revision === 'problema' && esEncargado() ? boton('corregir', 'Corregir', 'lapiz', h.id, 'primary small') : '') + boton('imprimir', 'Imprimir o guardar PDF', 'pdf', h.id, 'small');
    abrir({ titulo: `Acta ${numActa(h)}`, sub: h.persona,
      campos: `<div class="row">${A().pill(ea[0], ea[1])}${A().pill(r[0], r[1], r[2])}${h.revisadaPor ? `<span class="meta">Revisó ${esH(h.revisadaPor)}</span>` : ''}</div>${h.notaRevision ? `<p class="meta">Problema: ${esH(h.notaRevision)}</p>` : ''}
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
  function verPersona(clave) {
    const p = personas().find(x => x.clave === clave); if (!p) return null;
    abrir({ titulo: p.nombre, sub: p.cedula ? 'C.C. ' + p.cedula : '',
      campos: `${esEncargado() && p.equipos.length ? `<div class="tarea-pie">${boton('devolver', 'Recibir sus equipos', 'devolucion', '', 'primary small', ` data-clave="${esH(p.clave)}"`)}</div>` : ''}
        <div class="section-label">Equipos que tiene (${p.equipos.length})</div>${p.equipos.length ? `<div class="list">${p.equipos.map(e => `<button type="button" class="card" data-accion="ver" data-id="${esH(e.id)}"><span class="card-title"><small>${esH(e.serial)}</small>${esH(e.tipo)} ${esH(e.marca)} ${esH(e.modelo)}</span></button>`).join('')}</div>` : '<p class="meta">No tiene equipos.</p>'}
        <div class="section-label">Actas (${p.hojas.length})</div>${p.hojas.length ? `<div class="list">${p.hojas.slice().sort((a, b) => String(b.en).localeCompare(String(a.en))).map(tarjetaActa).join('')}</div>` : '<p class="meta">Sin actas.</p>'}` });
    return true;
  }

  /* ---------- escáner de seriales ----------
     codigos.js (lector con la cámara) se descarga solo cuando se toca «Escanear». Si la cámara no sirve, queda escribir a mano. */
  const normSerial = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const porSerial = s => equipos().find(e => normSerial(e.serial) === normSerial(s));
  async function leerSerial(titulo, conocidos) {
    try { await UI.cargarScript('codigos.js?v=1'); }
    catch (e) { A().toast('No se pudo abrir el lector de códigos. Revisa la conexión o escribe el serial.'); return null; }
    return window.Codigos.leer({ titulo, conocidos });
  }
  /** Quién tiene el equipo, para decirlo cuando no se puede entregar. */
  const dondeEsta = e => (e.estado === 'baja' ? 'está de baja' : bajaDe(e) ? 'tiene una baja pedida' : e.estado === 'asignado' ? `lo tiene ${e.asignadoA || 'alguien'}` : e.estado === 'recibido' ? 'está en Recibidos y falta su mantenimiento o backup' : 'no está en bodega');
  async function escanear(modo) {
    if (modo === 'entrega' || modo === 'devolucion') return escanearEnActa(modo);
    const s = await leerSerial('Escanear el serial del equipo', equipos().map(e => e.serial));
    if (!s) return true;
    const e = porSerial(s);
    if (e) { ver(e); return true; }
    buscar = s; pintar();
    A().toast(`No hay un equipo con el serial ${s}`);
    return true;
  }
  /** En el acta de entrega marca el equipo escaneado; en la de devolución marca el que llega (y cambia de persona si es de otra). */
  async function escanearEnActa(modo) {
    const cajas = () => Array.from($('eqCampos').querySelectorAll('input[data-eq]'));
    const deSerial = s => cajas().find(c => { const e = eqPorId(c.dataset.eq); return e && normSerial(e.serial) === normSerial(s); });
    const s = await leerSerial(modo === 'entrega' ? 'Escanear el equipo que se entrega' : 'Escanear el equipo que devuelve', cajas().map(c => (eqPorId(c.dataset.eq) || {}).serial));
    if (!s || !accion || $('shEq').hidden) return true;
    const marcar = c => {
      const e = eqPorId(c.dataset.eq);
      if (c.checked) { A().toast(`${e.serial} ya está marcado.`); return; }
      c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
      try { c.closest('.eq-acta').scrollIntoView({ block: 'center' }); } catch (x) {}
      A().toast(`Marcado: ${e.serial}`);
    };
    let c = deSerial(s);
    if (c) { marcar(c); return true; }
    const e = porSerial(s);
    if (!e) { A().toast(`No hay un equipo con el serial ${s}`); return true; }
    if (modo === 'entrega') { A().toast(`El ${e.serial} no se puede entregar: ${dondeEsta(e)}.`); return true; }
    const dueno = e.estado === 'asignado' ? personas().find(p => p.equipos.some(x => x.id === e.id)) : null;
    const op = dueno && $('ehQuien') ? Array.from($('ehQuien').options).find(o => o.value === dueno.clave) : null;
    if (!op) { A().toast(`El ${e.serial} no está por devolver: ${e.estado === 'asignado' ? dondeEsta(e) : 'ya está en ' + (e.estado === 'bodega' ? 'bodega' : 'Recibidos')}.`); return true; }
    $('ehQuien').value = dueno.clave; $('ehQuien').dispatchEvent(new Event('change', { bubbles: true }));
    c = deSerial(s); if (c) { if (!c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } A().toast(`Es de ${dueno.nombre}: cambié la lista a su nombre y marqué el ${e.serial}.`); }
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
      ver: () => eq && ver(eq), veracta: () => h && verActa(h), persona: () => verPersona(b.dataset.clave),
      borrarfirma: () => (accion ? borrarFirma(id) : null), imprimir: () => imprimir(),
      entregar: () => (esEncargado() ? entrega(eq ? eq.id : '') : null), devolver: () => (esEncargado() ? devolucion(b.dataset.clave) : null),
      mtto: () => (eq && esEncargado() && pend(eq).mtto ? trabajo(eq, 'mtto') : null), backup: () => (eq && esEncargado() && pend(eq).backup ? trabajo(eq, 'backup') : null),
      abodega: () => (eq && esEncargado() && eq.estado === 'recibido' && !pend(eq).mtto && !pend(eq).backup ? aBodega(eq) : null),
      revisar: () => (h && puedeRevisar(h) ? revisar(h) : null), corregir: () => (h && h.revision === 'problema' && esEncargado() ? corregir(h) : null),
      escanear: () => escanear(b.dataset.modo || ''),
      tipoeq: () => { tipoEq = tipoEq === id ? '' : id; pintar(); return true; },
      verhechas: () => { hechasAbiertas = !hechasAbiertas; pintar(); return true; },
      quitarfiltro: () => {
        const m = b.dataset.modo;
        if (m === 'actas') buscarActa = ''; else if (m === 'personas') buscarPers = ''; else { tipoEq = ''; A().S.filtro.equipos = ''; if (m === 'todo') buscar = ''; }
        A().pintarTodo(); return true;
      },
      pedirbaja: () => (eq && esEncargado() && ['bodega', 'recibido'].includes(eq.estado) && !bajaDe(eq) ? baja(eq) : null),
      aprobarbaja: () => (eq && esJefe() && bajaDe(eq) && ['bodega', 'recibido'].includes(eq.estado) ? aprobarBaja(eq) : null),
      noaprobarbaja: () => (eq && esJefe() && bajaDe(eq) && ['bodega', 'recibido'].includes(eq.estado) ? noAprobarBaja(eq) : null),
      datoscompra: () => (eq && esEncargado() && eq.estado !== 'baja' ? datosCompra(eq) : null),
      verbaja: () => { bajasAbiertas = !bajasAbiertas; pintar(); return true; },
      verificar: () => (programa() ? verificar() : null), verescanear: () => (accion && accion.esVerif ? escanearVerif() : null),
      veragregar: () => { if (!accion || !accion.esVerif) return null; agregarVerif(valor('evSerial')); if ($('evSerial')) { $('evSerial').value = ''; $('evSerial').focus(); } return true; },
      programar: () => (programa() ? programar(eq) : null), hecha: () => (t && t.estado === 'pendiente' && esEncargado() ? hecha(t) : null)
    };
    const fn = mapa[b.dataset.accion]; if (!fn) return;
    const r = fn();
    if (r === null) { A().toast('Eso ya cambió o no te toca. Revisa otra vez.'); return; }
    if (desde && accion && !['borrarfirma', 'imprimir'].includes(b.dataset.accion)) accion.volver = desde;
  }
  const ponerCC = () => { const cc = $('ehFirmaPCC'); if (cc && $('ehCedula')) cc.textContent = $('ehCedula').value.replace(/\D/g, '') || '—'; };
  $('eqContenido').addEventListener('click', alTocar);
  // Lo escrito se guarda al instante, pero la lista se repinta 300 ms después de la última tecla.
  let cajaBuscando = 'qEq';
  const buscarLuego = UI.retardar(() => { const q = $(cajaBuscando), pos = q ? q.selectionStart : 0; pintar(); const n = $(cajaBuscando); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {} } }, 300);
  $('eqContenido').addEventListener('input', e => {
    const id = e.target.id;
    if (id === 'qEq') buscar = e.target.value; else if (id === 'qAc') buscarActa = e.target.value; else if (id === 'qPe') buscarPers = e.target.value; else return;
    cajaBuscando = id; buscarLuego();
  });
  $('eqCampos').addEventListener('click', e => { if (e.target.closest('[data-accion]')) alTocar(e); });
  // En «Verificar equipos», Enter agrega el serial escrito (no guarda la hoja); y cambiar lo que se revisa recalcula «Sin encontrar».
  $('eqCampos').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'evSerial') { e.preventDefault(); agregarVerif(e.target.value.trim()); e.target.value = ''; } });
  $('eqCampos').addEventListener('input', e => { if (e.target.id === 'ehCedula' && $('ehQuien') === null) ponerCC(); });
  $('eqCampos').addEventListener('change', e => {
    if (e.target.id === 'ehQuien') pintarListaDevolucion();
    if (e.target.id === 'evAlcance' && verif) { verif.alcance = e.target.value; pintarVerif(); }
    if (e.target.id === 'ehProy') { const p = PROYECTOS.find(x => x[0] === e.target.value); if (p && $('ehCodigo')) $('ehCodigo').value = p[1]; }
    // Al marcar un equipo se abren sus observaciones; si es un portátil, se suma un cargador en «Otros».
    const c = e.target.closest('input[data-eq]');
    if (c) {
      const det = c.closest('.eq-acta').querySelector('.eq-acta-det'); if (det && !c.dataset.hoja) det.hidden = !c.checked;
      const eqx = eqPorId(c.dataset.eq), car = $('eqCampos').querySelector('input[data-otro="Cargador"]');
      if (c.checked && eqx && eqx.tipo === 'Portátil' && car && !(Number(car.value) > 0)) car.value = 1;
    }
  });
  $('eqForm').addEventListener('submit', e => { e.preventDefault(); guardar(); });
  $('btnEntregar').addEventListener('click', () => { if (esEncargado()) entrega(''); });
  $('btnDevolver').addEventListener('click', () => { if (esEncargado()) devolucion(''); });
  $('btnNuevoEq').addEventListener('click', () => { if (esEncargado()) nuevo(); });

  /* ---------- base de datos en Excel (excel-bd.js): agregar equipos y cambiar fechas y observaciones ---------- */
  const cfgEquipos = () => ({
    clave: 'equipos', hoja: 'Equipos', titulo: 'Base de datos: equipos', sub: 'Una fila por equipo', archivo: 'Base de datos Equipos',
    acciones: ['Agregar', 'Cambiar', 'Eliminar'], puedeSubir: esEncargado, puedeEliminar: esJefe,
    columnas: [
      { t: 'Serial', k: 'serial', clave: true, obligatoria: true, fija: true, unico: true, mayus: true, max: 30, ancho: 18 },
      { t: 'Tipo', k: 'tipo', obligatoria: true, fija: true, lista: TIPOS_EQ, ancho: 24 },
      { t: 'Marca', k: 'marca', obligatoria: true, fija: true, max: 40, ancho: 18 },
      { t: 'Modelo', k: 'modelo', fija: true, max: 60, ancho: 22 },
      { t: 'Estado', k: 'estado', gris: true, ancho: 16 }, { t: 'Asignado a', k: 'asignadoA', gris: true, ancho: 24 }, { t: 'Proyecto', k: 'proyecto', gris: true, ancho: 22 },
      { t: 'Último mantenimiento', k: 'ultimoMtto', tipo: 'fecha' }, { t: 'Último backup', k: 'ultimoBackup', tipo: 'fecha' },
      { t: 'Fecha de compra', k: 'fechaCompra', tipo: 'fecha' }, { t: 'Garantía hasta', k: 'garantiaHasta', tipo: 'fecha' }, { t: 'Proveedor', k: 'proveedor', max: 60, ancho: 26 }, { t: 'Costo', k: 'costo', tipo: 'dinero', min: 0, max: 1000000000 },
      { t: 'Observaciones', k: 'obs', max: 160, ancho: 40 }],
    // Los equipos de baja no van en la base de datos: ya no se cambian.
    filas: () => activos().map(e => ({ id: e.id, v: { serial: e.serial, tipo: e.tipo, marca: e.marca, modelo: e.modelo || '', estado: (EST[e.estado] || [e.estado])[0], asignadoA: e.asignadoA || '', proyecto: e.proyecto || '', ultimoMtto: e.ultimoMtto || '', ultimoBackup: e.ultimoBackup || '',
      fechaCompra: e.fechaCompra || '', garantiaHasta: e.garantiaHasta || '', proveedor: e.proveedor || '', costo: Number(e.costo) || 0, obs: e.obs || '' } })),
    ejemplo: { serial: 'DEMO-0099', tipo: 'Portátil', marca: 'Lenovo', modelo: 'ThinkPad E14', obs: 'Equipo de ejemplo' },
    ayuda: [['Equipo nuevo', 'Queda en bodega, listo para entregar. Obligatorios: Serial (letras, números y guiones), Tipo y Marca.'],
      ['Qué se puede cambiar', 'Solo la fecha del último mantenimiento, la del último backup, la compra y garantía (fecha de compra, garantía hasta, proveedor y costo) y las observaciones (queda una línea en su historial). El serial, el tipo, la marca y el modelo no cambian en un equipo ya registrado. Entregar o recibir equipos se hace con el acta, en la app.'],
      ['Eliminar', 'Solo la Jefe, y solo un equipo que no esté asignado, sin actas ni tareas pendientes.']],
    revisar: (x, { nuevo }) => {
      if (nuevo && !/^[A-Z0-9-]{4,30}$/.test(String(x.v.serial))) x.errores.push('Serial: usa letras, números y guiones (de 4 a 30).');
      if (x.v.fechaCompra && x.v.fechaCompra > hoy()) x.errores.push('Fecha de compra: no puede ser de mañana.');
      if (x.v.fechaCompra && x.v.garantiaHasta && x.v.garantiaHasta < x.v.fechaCompra) x.errores.push('Garantía hasta: no puede ser antes de la compra.');
    },
    bloqueaEliminar: id => {
      const e = eqPorId(id);
      if (!e) return 'Ese equipo ya no existe.';
      if (e.estado === 'asignado') return 'Está asignado a una persona: recíbelo primero.';
      if (hojasDe(id).length) return 'Tiene actas de entrega: se guardan como rastro y no se puede eliminar.';
      if (D().tareasEq.some(t => t.equipoId === id && t.estado === 'pendiente')) return 'Tiene tareas de mantenimiento o backup pendientes.';
      return null;
    },
    opsAgregar: x => [['set', 'equipos', window.nube.idNuevo('eq'), { serial: x.v.serial, tipo: x.v.tipo, marca: x.v.marca, modelo: x.v.modelo, estado: 'bodega', asignadoA: '', asignadoCedula: '', proyecto: '', ultimoMtto: x.v.ultimoMtto, ultimoBackup: x.v.ultimoBackup, fechaCompra: x.v.fechaCompra || '', garantiaHasta: x.v.garantiaHasta || '', proveedor: x.v.proveedor || '', costo: Number(x.v.costo) || 0, obs: x.v.obs,
      pendientes: { mtto: false, backup: false }, historial: [{ fecha: hoy(), tipo: 'registro', persona: persona().nombre, nota: 'Equipo registrado en bodega (desde el Excel)', por: persona().nombre }] }]],
    opsCambiar: x => { const e = eqPorId(x.id); return e ? [['mezclar', 'equipos', e.id, Object.assign({}, x.datos, { historial: conPaso(e, { tipo: 'revision', persona: persona().nombre, nota: 'Datos cambiados desde el Excel' }) })]] : []; },
    opsEliminar: x => [['borrar', 'equipos', x.id]]
  });
  window.ExcelBD.conectar($('eqContenido'), { equipos: cfgEquipos }, () => pintar());

  window.Equipos = Object.freeze({ pintar, resumen });
})();
