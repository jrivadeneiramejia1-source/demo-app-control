/* vehiculos.js — Módulo Vehículos de la demo.
   Hoja de vida de cada carro (placa, modelo, conductor, kilometraje, SOAT y técnico-mecánica, estado).
   Novedades (llanta, choque, rayón, mantenimiento u otro) con foto obligatoria: las reporta el Conductor (o Transporte,
   Bodega o la Jefe) y las revisan Transporte, Bodega o la Jefe (costo, nota, si va al taller).
   Salida y llegada del carro: kilometraje, combustible, fotos de los 4 lados y las llantas, y revisión de luces, llantas,
   documentos y herramienta. Si el carro va a una reunión, la salida queda unida a ese viaje.
   Avisos dentro de la app cuando el SOAT o la técnico-mecánica están por vencer (30 días) o vencidos.
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
  const EST = { disponible: ['Disponible', 's-disco', 'disco'], 'en-uso': ['En uso', 's-listo', 'listo'], 'en-taller': ['En taller', 's-org', 'org'] };
  const TIPO_NOV = { llanta: 'Llanta', choque: 'Choque', rayon: 'Rayón', mantenimiento: 'Mantenimiento', otro: 'Otro' };
  const COMBUSTIBLE = [['vacio', 'Vacío'], ['1/4', '1/4'], ['1/2', '1/2'], ['3/4', '3/4'], ['lleno', 'Lleno']];
  const LADOS = [['frente', 'Frente'], ['atras', 'Atrás'], ['izquierda', 'Lado izquierdo'], ['derecha', 'Lado derecho'], ['llantas', 'Llantas']];
  const REVISION = [['luces', 'Luces'], ['llantas', 'Llantas'], ['documentos', 'Documentos'], ['herramienta', 'Herramienta y kit']];
  const CONDUCTORES = ['Oscar Farfán', 'Rafael Ospino', 'Hernán Brito'];
  const QUIEN_ENTREGA = ['Wilson Muñoz', 'Andrés Beltrán'];
  let seccion = '', rolPintado = '', guardando = false, accion = null, pushPendientes = [], fotos = {}, fotoNov = '', periodo = 'mes';

  /* ---------- datos derivados ---------- */
  const vehPorId = id => D().vehiculos.find(v => v.id === id) || null;
  const novDe = id => D().novedades.filter(n => n.vehiculoId === id).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const entDe = id => D().entregas.filter(e => e.vehiculoId === id).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const sinRevisar = () => D().novedades.filter(n => !n.revisada);
  const dias = f => A().diasHasta(f);
  /** Estado de un documento: vencido, por vencer (30 días) o al día. */
  const estDoc = f => { const d = dias(f); return d == null ? 'sin' : d < 0 ? 'vencido' : d <= 30 ? 'pronto' : 'ok'; };
  const docsMal = v => ['soat', 'tecno'].filter(k => estDoc(v[k]) !== 'ok');
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
  function resumen() {
    const vs = D().vehiculos;
    return {
      disponibles: vs.filter(v => v.estado === 'disponible').length,
      enUso: vs.filter(v => v.estado === 'en-uso').length,
      novedades: sinRevisar().length,
      docs: vs.reduce((n, v) => n + docsMal(v).length, 0),
      mias: esAdmin() ? sinRevisar().length + vs.filter(v => docsMal(v).length).length : esConductor() ? misViajes().length : 0
    };
  }
  /** Carros que se pueden asignar a una reunión en esa fecha (no en taller, papeles al día ese día, sin otro viaje ese día). */
  function libresPara(fecha, reunionId) {
    const ocupados = new Set(D().necesidades.filter(n => n.tipo === 'carros' && n.estado === 'autorizado' && n.reunionId !== reunionId && n.fechaReunion === fecha)
      .flatMap(n => (Array.isArray(n.vehiculos) ? n.vehiculos : []).map(x => x && x.vehiculoId)));
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
    if (esGerente()) return [['resumen', 'Resumen'], ['reportes', 'Reportes'], ['carros', 'Carros'], ['novedades', 'Novedades']];
    const s = [['hacer', 'Lo que me toca'], ['carros', 'Carros'], ['novedades', 'Novedades']];
    if (esAdmin()) s.push(['resumen', 'Resumen'], ['reportes', 'Reportes']);
    return s;
  }
  function pintar() {
    const App = A(), S = App.S;
    if (!S.persona) return;
    if (rolPintado !== S.persona.rol) { rolPintado = S.persona.rol; seccion = secciones()[0][0]; }
    const f = S.filtro.vehiculos;
    if (['disponible', 'docs', 'uso'].includes(f)) seccion = 'carros';
    if (f === 'novedad') seccion = 'novedades';
    if (!secciones().some(x => x[0] === seccion)) seccion = secciones()[0][0];
    const n = resumen();
    App.tablero('vehiculos', [
      { k: 'v-disp', n: n.disponibles, lbl: 'Disponibles', icono: 'carro', tono: 'disco', filtro: 'disponible' },
      { k: 'v-uso', n: n.enUso, lbl: 'En uso', icono: 'persona', tono: 'listo', filtro: 'uso' },
      { k: 'v-nov', n: n.novedades, lbl: 'Novedades sin revisar', icono: 'aviso', tono: 'org', filtro: 'novedad' },
      { k: 'v-doc', n: n.docs, lbl: 'Documentos por vencer o vencidos', icono: 'calendario', tono: 'peligro', filtro: 'docs' }
    ]);
    $('vehSecciones').innerHTML = secciones().map(([k, t]) => `<button type="button" class="chip" data-sec="${k}" aria-pressed="${seccion === k}">${esH(t)}${k === 'hacer' && n.mias ? ` <span class="n">${n.mias}</span>` : ''}</button>`).join('');
    const c = $('vehContenido');
    if (['vehiculos', 'novedades', 'entregas'].some(App.cargando)) { c.innerHTML = UI.esqueleto(3); return; }
    c.innerHTML = ({ hacer: htmlHacer, carros: () => htmlCarros(f), novedades: () => htmlNovedades(f), resumen: htmlResumen, reportes: htmlReportes })[seccion]();
    window.llenarIconos(c);
    avisarVencimientos();
  }
  const boton = (acc, txt, icono, id, clase, extra) => `<button class="btn ${clase || 'small'}" type="button" data-accion="${acc}" data-id="${esH(id)}"${extra || ''}>${icono ? `<span data-ico="${icono}"></span>` : ''}${esH(txt)}</button>`;
  const docPill = (nombre, f) => { const e = estDoc(f), d = dias(f); return A().pill(`${nombre}: ${e === 'vencido' ? `venció hace ${-d} días` : e === 'pronto' ? `vence en ${d} días` : e === 'sin' ? 'sin fecha' : A().fechaCorta(f)}`, e === 'vencido' ? 's-peligro' : e === 'pronto' ? 's-org' : 's-disco', e === 'ok' ? 'check' : 'aviso'); };
  const foto = s => (typeof s === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(s) ? s : '');

  /* --- Lo que me toca --- */
  function htmlHacer() {
    let h = '';
    if (puedeReportar()) h += `<div class="barra-botones">${boton('novedad', 'Reportar una novedad', 'aviso', '', 'primary')}</div>`;
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
    }
    return h;
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
    let vs = D().vehiculos.slice().sort((a, b) => String(a.placa).localeCompare(String(b.placa)));
    if (f === 'disponible') vs = vs.filter(v => v.estado === 'disponible');
    if (f === 'uso') vs = vs.filter(v => v.estado === 'en-uso');
    if (f === 'docs') vs = vs.filter(v => docsMal(v).length);
    if (!vs.length) return UI.vacio('carro', 'No hay carros con ese filtro', '');
    return `<div class="list">${vs.map(v => {
      const st = EST[v.estado] || ['Sin estado', 'none', 'pend'], pend = novDe(v.id).filter(n => !n.revisada).length;
      return `<button type="button" class="card st-${pend ? 'org' : st[2]}" data-accion="ver" data-id="${esH(v.id)}">
        <span class="card-head"><span class="card-title"><span class="placa">${esH(v.placa)}</span></span>${App.pill(st[0], st[1])}</span>
        <span class="card-sub">${esH(v.marca)} ${esH(v.modelo)} ${esH(v.anio)}${v.color ? ' · ' + esH(v.color) : ''}</span>
        <span class="facts"><span>${window.ico('persona')} <b>${esH(v.conductor || 'Sin conductor')}</b></span><span class="valor">${esH(km(v.km))}</span></span>
        <span class="docs">${docPill('SOAT', v.soat)}${docPill('Técnico-mecánica', v.tecno)}${pend ? App.pill(`${pend} ${pend === 1 ? 'novedad' : 'novedades'} sin revisar`, 's-org', 'aviso') : ''}</span>
      </button>`;
    }).join('')}</div>`;
  }
  function htmlNovedades() {
    const ns = D().novedades.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    let h = puedeReportar() ? `<div class="barra-botones">${boton('novedad', 'Reportar una novedad', 'aviso', '', 'primary')}</div>` : '';
    return h + (ns.length ? `<div class="list">${ns.map(tarjetaNovedad).join('')}</div>` : UI.vacio('checkCirculo', 'No hay novedades', ''));
  }
  function htmlResumen() {
    const App = A(), vs = D().vehiculos, mes = A().hoyISO().slice(0, 7);
    const delMes = D().novedades.filter(n => String(n.fecha).slice(0, 7) === mes);
    const costo = delMes.reduce((s, n) => s + num(n.costo), 0);
    const porTipo = Object.keys(TIPO_NOV).map(t => [TIPO_NOV[t], delMes.filter(n => n.tipo === t).length]).filter(x => x[1]);
    const max = Math.max(1, ...porTipo.map(x => x[1]));
    const proximos = viajes();
    let h = `<div class="resumen-grid">
      <div class="card"><span class="meta">Costo de novedades este mes</span><span class="rm-n">${esH(App.cop(costo))}</span><span class="meta">${delMes.length} novedades</span></div>
      <div class="card"><span class="meta">Carros</span><span class="rm-n">${vs.length}</span><span class="meta">${resumen().disponibles} disponibles · ${resumen().enUso} en uso · ${vs.filter(v => v.estado === 'en-taller').length} en taller</span></div>
      <div class="card"><span class="meta">Documentos por vencer o vencidos</span><span class="rm-n">${resumen().docs}</span>${resumen().docs ? App.pill('Revisar fechas', 's-peligro', 'aviso') : App.pill('Al día', 's-disco', 'check')}</div>
    </div>`;
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
      return { v, salidas: mv.length, km: mv.reduce((s, x) => s + x.km, 0), problemas: mv.filter(x => x.problemas).length, novedades: mn.length, costo: mn.reduce((s, n) => s + num(n.costo), 0), sinRevisar: mn.filter(n => !n.revisada).length };
    });
    const nombres = Array.from(new Set(vs.map(x => x.salida.conductor).concat(ns.filter(n => n.reportaRol === 'conductor').map(n => n.reporta)).filter(Boolean))).sort();
    const porConductor = nombres.map(c => {
      const mv = vs.filter(x => x.salida.conductor === c);
      return { c, salidas: mv.length, km: mv.reduce((s, x) => s + x.km, 0), problemas: mv.filter(x => x.problemas).length, novedades: ns.filter(n => n.reporta === c).length };
    });
    return { vs, ns, porCarro, porConductor };
  }
  function htmlReportes() {
    const App = A(), r = datosReporte(), kmTotal = r.vs.reduce((s, x) => s + x.km, 0), costo = r.ns.reduce((s, n) => s + num(n.costo), 0);
    let h = `<div class="chips sub" role="group" aria-label="Periodo">${PERIODOS.map(([k, t]) => `<button type="button" class="chip" data-periodo="${k}" aria-pressed="${periodo === k}">${esH(t)}</button>`).join('')}</div>`;
    h += `<div class="resumen-grid">
      <div class="card"><span class="meta">Salidas</span><span class="rm-n">${r.vs.length}</span><span class="meta">${r.vs.filter(x => !x.llegada).length} sin llegada todavía</span></div>
      <div class="card"><span class="meta">Kilómetros recorridos</span><span class="rm-n">${esH(kmTotal.toLocaleString('es-CO'))}</span><span class="meta">${r.vs.filter(x => x.problemas).length} salidas con problemas en la revisión</span></div>
      <div class="card"><span class="meta">Novedades</span><span class="rm-n">${r.ns.length}</span><span class="meta">${esH(App.cop(costo))} en costos · ${r.ns.filter(n => !n.revisada).length} sin revisar</span></div>
    </div>`;
    h += `<div class="barra-botones">${boton('excelveh', 'Descargar Excel', 'excel', '', 'small')}</div>`;
    h += `<div class="section-label">Por carro</div><div class="list">${r.porCarro.map(x => `<button type="button" class="card" data-accion="ver" data-id="${esH(x.v.id)}">
      <span class="card-head"><span class="card-title"><span class="placa">${esH(x.v.placa)}</span> ${esH(x.v.marca)} ${esH(x.v.modelo)}</span>${App.pill((EST[x.v.estado] || ['Sin estado'])[0], (EST[x.v.estado] || ['', 'none'])[1])}</span>
      <span class="facts"><span>${x.salidas} ${x.salidas === 1 ? 'salida' : 'salidas'}</span><span>${esH(km(x.km))} recorridos</span><span>${x.novedades} ${x.novedades === 1 ? 'novedad' : 'novedades'}${x.costo ? ' · ' + esH(App.cop(x.costo)) : ''}</span></span>
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
        Novedades: ['Novedades', 'Lo que reportaron los conductores, con su costo y si ya se revisó.'], 'Por conductor': ['Por conductor', 'Resumen de cada conductor.'] };
      const hoja = (nombre, filas) => hojas.push(window.Excel.deObjetos(nombre, TIT[nombre][0], `${TIT[nombre][1]} ${gen}`, filas));
      hoja('Carros', r.porCarro.map(x => ({ Placa: x.v.placa, Carro: `${x.v.marca} ${x.v.modelo} ${x.v.anio}`, Estado: (EST[x.v.estado] || [x.v.estado])[0], Conductor: x.v.conductor, Kilometraje: num(x.v.km), Salidas: x.salidas, 'Km recorridos': x.km, 'Con problemas': x.problemas, Novedades: x.novedades, 'Costo novedades': x.costo, 'SOAT vence': x.v.soat, 'Técnico-mecánica vence': x.v.tecno })));
      hoja('Salidas y llegadas', r.vs.map(x => ({ Placa: x.v.placa, Conductor: x.salida.conductor, Reunión: x.reunion, Salió: f(x.salida.fecha, true), 'Km salida': num(x.salida.km), 'Combustible salida': x.salida.combustible, Entregó: x.salida.con, Llegó: x.llegada ? f(x.llegada.fecha, true) : 'Todavía no', 'Km llegada': x.llegada ? num(x.llegada.km) : '', 'Combustible llegada': x.llegada ? x.llegada.combustible : '', Recibió: x.llegada ? x.llegada.con : '', 'Km recorridos': x.km, Horas: x.horas, Revisión: x.problemas ? 'Con problemas' : 'Bien', Observaciones: [x.salida.observaciones, x.llegada && x.llegada.observaciones].filter(Boolean).join(' · ') })));
      hoja('Novedades', r.ns.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).map(n => ({ Fecha: f(n.fecha, true), Placa: n.placa, Tipo: TIPO_NOV[n.tipo] || n.tipo, Qué: n.descripcion, Km: num(n.km), Reportó: n.reporta, Costo: num(n.costo), Revisada: n.revisada ? 'Sí' : 'No', 'Revisó': n.revisadaPor, Nota: n.nota })));
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
  const campoFoto = (id, lbl) => `<div class="field foto-campo"><span class="lbl">${esH(lbl)}</span><label class="btn foto-btn"><span data-ico="camara"></span><span id="${id}Txt">Tomar foto</span><input id="${id}" class="archivo-oculto" type="file" accept="image/*" capture="environment" data-foto="${id}"></label><img id="${id}Ver" class="nov-foto" alt="${esH(lbl)}" hidden></div>`;
  const valor = id => ($(id) ? $(id).value.trim() : '');
  const entero = id => { const v = valor(id); return /^\d+$/.test(v) ? Number(v) : NaN; };
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
    const f = inp.files && inp.files[0], id = inp.dataset.foto; if (!f) return;
    const txt = $(id + 'Txt'), ver = $(id + 'Ver');
    txt.textContent = 'Preparando…';
    try {
      const dato = await window.Inventario.leerFoto(f, id === 'vnFoto' ? 1280 : 720, id === 'vnFoto' ? 300000 : 140000);
      if (id === 'vnFoto') fotoNov = dato; else fotos[id] = dato;
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
        const veh = vehPorId(valor('vnVeh')), kmv = entero('vnKm'), desc = valor('vnDesc'), costo = esAdmin() ? (entero('vnCosto') || 0) : 0;
        if (!veh) return fallar('Escoge el carro.', 'vnVeh');
        if (!(kmv >= 0)) return fallar('Escribe el kilometraje.', 'vnKm');
        if (kmv + 5000 < num(veh.km)) return fallar(`El kilometraje parece bajo: el carro va en ${km(veh.km)}.`, 'vnKm');
        if (desc.length < 5) return fallar('Cuenta qué pasó.', 'vnDesc');
        if (!fotoNov) return fallar('Falta la foto de la novedad.');
        const tipo = valor('vnTipo');
        return [['set', 'novedades', window.nube.idNuevo('no'), { vehiculoId: veh.id, placa: veh.placa, tipo, fecha: ahora(), km: kmv, descripcion: desc, foto: fotoNov,
          reporta: persona().nombre, reportaRol: miRol(), costo, revisada: false, revisadaPor: '', revisadaEn: '', nota: '' }]]
          .concat(['jefe', 'carros', 'asistente', 'gerente'].map(rol => aviso(rol, 'Novedad en un carro', `${persona().nombre} reportó ${(TIPO_NOV[tipo] || 'una novedad').toLowerCase()} en el ${veh.placa}: ${desc.slice(0, 100)}`)));
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
        const costo = entero('vrCosto') || 0, nota = valor('vrNota');
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
  /** Salida o llegada del carro (con las 5 fotos y la revisión). */
  function entrega(v, tipo, viajeId) {
    fotos = {};
    const salida = tipo === 'salida';
    // Si sale desde la hoja de vida y el carro tiene un viaje hoy, la salida queda ligada a ese viaje.
    const viaje = viajeId ? D().necesidades.find(n => n.id === viajeId) : salida ? viajes().find(n => n.vehiculoId === v.id && n.fechaReunion === A().hoyISO() && !salioEn(n)) || null : null;
    const ultima = ultimaSalida(v);
    const condDefecto = viaje ? viaje.conductor : salida ? (esConductor() ? persona().nombre : CONDUCTORES[0]) : (v.conductor || '');
    const conductores = Array.from(new Set([condDefecto, persona().nombre].concat(CONDUCTORES).filter(Boolean)));
    abrir({ titulo: `${salida ? 'Salida' : 'Llegada'} del ${v.placa}`, sub: viaje ? `Viaje a la ${viaje.comunidad}. Conductor: ${viaje.conductor || 'sin asignar'}.` : `${v.marca} ${v.modelo}. Va en ${km(v.km)}.`,
      campos: (esConductor() && salida ? '' : campoSel('vsCond', 'Conductor', conductores.map(x => [x, x]), condDefecto)) +
        `<div class="fields cols">${campoNum('vsKm', 'Kilometraje', '', 0, 2000000)}${campoSel('vsComb', 'Combustible', COMBUSTIBLE, salida ? 'lleno' : '1/2')}</div>` +
        `<div class="field"><label for="vsCon">${salida ? 'Quién entrega el carro' : 'Quién recibe el carro'}</label><input id="vsCon" list="vsConLista" maxlength="60" autocomplete="off" value="${esH(miRol() === 'conductor' ? QUIEN_ENTREGA[0] : persona().nombre)}"><datalist id="vsConLista">${QUIEN_ENTREGA.map(x => `<option value="${esH(x)}">`).join('')}</datalist></div>` +
        `<div class="field"><span class="lbl">Fotos (todas obligatorias)</span><div class="fotos-grid">${LADOS.map(([k, t]) => campoFoto('vf_' + k, t)).join('')}</div></div>` +
        `<div class="field"><span class="lbl">Revisión</span>${REVISION.map(([k, t]) => marca('vr_' + k, t, true)).join('')}</div>` +
        `<div class="field"><label for="vsObs">Observaciones</label><textarea id="vsObs" rows="2" maxlength="300" placeholder="Ej: llegó con poco combustible"></textarea></div>`,
      primario: salida ? 'Registrar salida' : 'Registrar llegada', icono: 'llave', listo: salida ? 'Listo: salida registrada. Transporte y Bodega ya saben.' : 'Listo: llegada registrada. El carro quedó disponible.',
      base: Object.assign({}, v),
      ops: () => {
        const kmv = entero('vsKm'), cond = $('vsCond') ? valor('vsCond') : (viaje && viaje.conductor) || persona().nombre, con = valor('vsCon');
        if (!(kmv >= num(v.km))) return fallar(`El kilometraje no puede ser menor que el último registrado (${km(v.km)}).`, 'vsKm');
        if (!salida && ultima && kmv < num(ultima.km)) return fallar(`El kilometraje no puede ser menor que el de la salida (${km(ultima.km)}).`, 'vsKm');
        if (kmv > num(v.km) + 3000) return fallar('El kilometraje parece muy alto. Revísalo.', 'vsKm');
        if (!cond) return fallar('Escoge el conductor.', 'vsCond');
        if (con.length < 3) return fallar(salida ? 'Escribe quién entrega el carro.' : 'Escribe quién recibe el carro.', 'vsCon');
        const faltan = LADOS.filter(([k]) => !fotos['vf_' + k]).map(([, t]) => t.toLowerCase());
        if (faltan.length) return fallar(`Faltan fotos: ${faltan.join(', ')}.`);
        const revision = {}; REVISION.forEach(([k]) => { revision[k] = !!$('vr_' + k).checked; });
        const malos = REVISION.filter(([k]) => !revision[k]).map(([, t]) => t.toLowerCase());
        const obs = valor('vsObs');
        if (malos.length && obs.length < 5) return fallar(`Marcaste un problema (${malos.join(', ')}): cuéntalo en observaciones.`, 'vsObs');
        const ent = { vehiculoId: v.id, placa: v.placa, tipo, fecha: ahora(), km: kmv, combustible: valor('vsComb'), conductor: cond, con,
          fotos: { frente: fotos.vf_frente, atras: fotos.vf_atras, izquierda: fotos.vf_izquierda, derecha: fotos.vf_derecha, llantas: fotos.vf_llantas },
          revision, observaciones: obs, por: persona().nombre, porRol: miRol(), reunionId: viaje ? viaje.reunionId : (!salida && ultima ? ultima.reunionId || '' : '') };
        const entId = window.nube.idNuevo('en');
        const ops = [['set', 'entregas', entId, ent],
          ['mezclar', 'vehiculos', v.id, { estado: salida ? 'en-uso' : 'disponible', km: kmv, conductor: salida ? cond : '', ultimaEntrega: entId, historial: paso(v, `${salida ? 'Salió con' : 'Llegó con'} ${cond} (${km(kmv)})${viaje ? ' · viaje a la ' + viaje.comunidad : ''}`) }]];
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

  /* ---------- hoja de vida ---------- */
  function ver(v) {
    const App = A(), st = EST[v.estado] || ['Sin estado', 'none'];
    const ns = novDe(v.id), es = entDe(v.id).slice(0, 6), hist = historial(v).slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 8);
    const bts = [];
    if (puedeReportar()) bts.push(boton('novedad', 'Reportar novedad', 'aviso', v.id, 'small'));
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
        <div class="section-label">Novedades (${ns.length})</div>${ns.length ? `<div class="list">${ns.map(tarjetaNovedad).join('')}</div>` : '<p class="meta">Sin novedades.</p>'}
        <div class="section-label">Salidas y llegadas</div>${es.length ? `<ul class="necesidades-l">${es.map(e => `<li><span class="nf-cab"><span class="nf-t"><b>${e.tipo === 'salida' ? 'Salida' : 'Llegada'} · ${esH(km(e.km))}</b><span class="meta">${esH(e.conductor)} · ${e.tipo === 'salida' ? 'entregó' : 'recibió'} ${esH(e.con)} · ${esH(App.hace(e.fecha))} · combustible ${esH(e.combustible)}</span>${e.observaciones ? `<span class="meta">${esH(e.observaciones)}</span>` : ''}</span>${Object.values(e.revision || {}).every(Boolean) ? App.pill('Revisión bien', 's-disco', 'check') : App.pill('Con problemas', 's-peligro', 'aviso')}</span><div class="fotos-fila">${fotosDe(e)}</div></li>`).join('')}</ul>` : '<p class="meta">Todavía no hay salidas registradas.</p>'}
        <div class="section-label">Historial</div><ol class="linea">${hist.map(x => `<li><b>${esH(x.texto)}</b><span class="meta">${esH(x.por || '')} · ${esH(App.hace(x.fecha))}</span></li>`).join('') || '<li><span class="meta">Sin historial.</span></li>'}</ol>` });
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
    const id = b.dataset.id, v = vehPorId(id), n = D().novedades.find(x => x.id === id);
    const desde = $('veCampos').contains(b) && accion ? accion.volverA : '';
    const mapa = {
      ver: () => v && ver(v),
      novedad: () => puedeReportar() ? novedad(v) : null,
      revisar: () => n && !n.revisada && esAdmin() ? revisar(n) : null,
      docs: () => v && esAdmin() ? docs(v) : null,
      estado: () => v && esAdmin() ? estado(v) : null,
      asignar: () => v && esAdmin() ? asignar(v) : null,
      salida: () => v && v.estado === 'disponible' && (esAdmin() || esConductor()) ? entrega(v, 'salida', b.dataset.viaje) : null,
      llegada: () => v && v.estado === 'en-uso' && (esAdmin() || esConductor()) ? entrega(v, 'llegada', b.dataset.viaje) : null
    };
    const fn = mapa[b.dataset.accion]; if (!fn) return;
    if (fn() === null) { A().toast('Eso ya cambió o no te toca. Revisa otra vez.'); return; }
    // Si se abrió desde la hoja de vida, al terminar se vuelve a ella.
    if (desde && accion) accion.volver = desde;
  }
  $('vehContenido').addEventListener('click', alTocar);
  $('veCampos').addEventListener('click', e => { if (e.target.closest('[data-accion]')) alTocar(e); });
  $('veCampos').addEventListener('change', alEscogerFoto);
  $('veForm').addEventListener('submit', e => { e.preventDefault(); guardar(); });

  window.Vehiculos = Object.freeze({ pintar, resumen, libresPara });
})();
