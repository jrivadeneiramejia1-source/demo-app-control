/* personas.js — Roles de la app y cuentas de prueba de la demo (todas inventadas).
   ROLES: qué puede hacer cada rol en cada módulo. Lo usan las personas de prueba y las cuentas reales
   (las que se registran con el código de su rol; el rol lo revisa Firebase, ver firestore.rules).
   La clave de las personas de prueba es la misma para todas y está aquí a propósito: es una demo pública con datos inventados.
   Si cambias un correo de prueba aquí, cámbialo también en firestore.rules (función cuentas). */
(function () {
  'use strict';
  const CLAVE_DEMO = 'demo-control-2026';
  // Permisos por módulo: 'no' (no lo ve), 'ver', 'pide', 'edita', 'reporta', 'autoriza', 'compra', 'bodega', 'gerente', 'jefe',
  // 'encargado', 'soporte', 'logistica', 'asiste', 'actas', 'informa'. Equipos, Vehículos y Reuniones por ahora solo se ven (sus fases vienen después).
  // pref: las 3 letras con que empieza el código del rol (así se sabe para qué rol es un código).
  const ROLES = [
    { rol: 'gerente', area: 'Dirección', rolTxt: 'Gerente', cargo: 'Gerente', pref: 'GER',
      permisos: { equipos: 'ver', inventario: 'gerente', vehiculos: 'ver', reuniones: 'ver' } },
    { rol: 'jefe', area: 'Dirección', rolTxt: 'Jefe', cargo: 'Jefe de operaciones', pref: 'JEF',
      permisos: { equipos: 'jefe', inventario: 'jefe', vehiculos: 'jefe', reuniones: 'jefe' } },
    // Encargado de equipos: hace el mantenimiento y entrega los equipos con el acta (nombre, firma, computador).
    // Soporte: recibe esos registros y está pendiente de las entregas y del registro de los equipos.
    { rol: 'equipos', area: 'Equipos', rolTxt: 'Encargado de equipos', cargo: 'Encargado de mantenimiento y entregas', pref: 'EQU',
      permisos: { equipos: 'encargado', inventario: 'pide', vehiculos: 'no', reuniones: 'no' } },
    { rol: 'soporte', area: 'Equipos', rolTxt: 'Soporte', cargo: 'Soporte (recibe los registros de equipos)', pref: 'SOP',
      permisos: { equipos: 'soporte', inventario: 'pide', vehiculos: 'no', reuniones: 'no' } },
    { rol: 'compras', area: 'Inventario', rolTxt: 'Compras', cargo: 'Encargado de compras', pref: 'COM',
      permisos: { equipos: 'no', inventario: 'compra', vehiculos: 'no', reuniones: 'informa' } },
    { rol: 'asistente', area: 'Inventario', rolTxt: 'Bodega', cargo: 'Encargada de bodega', pref: 'BOD',
      permisos: { equipos: 'no', inventario: 'bodega', vehiculos: 'autoriza', reuniones: 'informa' } },
    { rol: 'carros', area: 'Vehículos', rolTxt: 'Transporte', cargo: 'Coordinadora de transporte', pref: 'TRA',
      permisos: { equipos: 'no', inventario: 'pide', vehiculos: 'autoriza', reuniones: 'informa' } },
    { rol: 'conductor', area: 'Vehículos', rolTxt: 'Conductor', cargo: 'Conductor', pref: 'CON',
      permisos: { equipos: 'no', inventario: 'pide', vehiculos: 'reporta', reuniones: 'asiste' } },
    { rol: 'logistica', area: 'Reuniones', rolTxt: 'Logística', cargo: 'Auxiliar de logística', pref: 'LOG',
      permisos: { equipos: 'no', inventario: 'pide', vehiculos: 'no', reuniones: 'logistica' } },
    { rol: 'profesional', area: 'Reuniones', rolTxt: 'Profesional', cargo: 'Profesional de campo', pref: 'PRO',
      permisos: { equipos: 'no', inventario: 'pide', vehiculos: 'no', reuniones: 'asiste' } },
    { rol: 'administrativo', area: 'Reuniones', rolTxt: 'Administrativo', cargo: 'Auxiliar administrativa', pref: 'ADM',
      permisos: { equipos: 'no', inventario: 'pide', vehiculos: 'no', reuniones: 'actas' } },
    // Roles generales (para el resto de la empresa). Colaborador: pide material y compras y ve sus cosas. Financiero: ve todas las compras,
    // facturas y gastos (y también pide). Consulta: solo ve inventario y vehículos (revisoría fiscal, cumplimiento).
    { rol: 'colaborador', area: 'General', rolTxt: 'Colaborador', cargo: 'Colaborador', pref: 'COL',
      permisos: { equipos: 'no', inventario: 'pide', vehiculos: 'no', reuniones: 'ver' } },
    { rol: 'financiero', area: 'General', rolTxt: 'Financiero', cargo: 'Gerencia financiera y contabilidad', pref: 'FIN',
      permisos: { equipos: 'no', inventario: 'finanzas', vehiculos: 'no', reuniones: 'ver' } },
    { rol: 'consulta', area: 'General', rolTxt: 'Consulta', cargo: 'Solo consulta (revisoría y cumplimiento)', pref: 'CNS',
      permisos: { equipos: 'no', inventario: 'ver', vehiculos: 'ver', reuniones: 'no' } }
  ];
  const AREAS = ['Dirección', 'Equipos', 'Inventario', 'Vehículos', 'Reuniones', 'General'];
  // Permisos extra: además del rol (que da el código), el Gerente o la Jefe le marcan a cada persona lo que hace de más.
  // Cada uno sirve solo para los roles de la lista. Debe coincidir con firestore.rules (función extraDe).
  const EXTRAS = [
    { id: 'compra', roles: ['asistente'], txt: 'También hace y recibe compras', detalle: 'Ve las compras autorizadas y las registra, como Compras.' },
    { id: 'actas', roles: ['soporte'], txt: 'También sigue las actas de entrega', detalle: 'Además de los equipos, está pendiente de que cada entrega tenga su acta firmada (se usa en la fase de Equipos).' },
    { id: 'encargada', roles: ['administrativo'], txt: 'Encargada de reuniones', detalle: 'Ve todas las tareas de todas las reuniones y la bandeja de correos. Lo que se autoriza sigue siendo de la Jefe.' }
  ];
  const extrasDe = (rol, lista) => (Array.isArray(lista) ? lista : []).filter(x => EXTRAS.some(e => e.id === x && e.roles.includes(rol)));
  // Personas de la demo: el organigrama de la empresa (nombres y cargos reales, para que en la presentación se vea quién es quién).
  // Los correos son INVENTADOS (@example.com) y llevan el rol al principio: así las reglas de Firebase saben el rol de cada persona de
  // prueba por la forma del correo, sin cargar una lista larga. Los casos que se ven en la demo (compras, novedades, reuniones) son inventados.
  // [rol, nombre, cargo, unidad, permisos extra]. Si cambias un correo o un rol aquí, las pruebas (pruebas/reglas.mjs) avisan si las reglas no coinciden.
  const U_GER = 'Gerencia y control', U_SGI = 'SGI y HSE', U_PRO = 'Gerencia de Proyectos', U_ABA = 'Abastecimiento', U_ADM = 'Gerencia Administrativa', U_FIN = 'Gerencia Financiera';
  const UNIDADES = [U_GER, U_SGI, U_PRO, U_ABA, U_ADM, U_FIN];
  const DE_PRUEBA = [
    ['gerente', 'Oscar Muñoz', 'Gerente', U_GER], ['gerente', 'Santiago Valencia', 'Gerente', U_GER],
    ['consulta', 'Revisor Fiscal', 'Revisor Fiscal (sin persona asignada)', U_GER], ['consulta', 'Oficial Cumplimiento', 'Oficial de Cumplimiento SAGRILAFT (sin persona asignada)', U_GER],
    ['profesional', 'Margaret Pulido', 'Coordinador SGI', U_SGI], ['profesional', 'Milena Bermúdez', 'Profesional SGI', U_SGI], ['profesional', 'Jorge Alberto Pérez', 'Profesional SGI', U_SGI],
    ['profesional', 'Luis Humberto López', 'Profesional SGI', U_SGI], ['colaborador', 'Yuliana Murcia', 'Asistente SGI', U_SGI],
    ['logistica', 'Elkin Bruno', 'Profesional logístico HSE', U_SGI], ['logistica', 'Julio Flórez', 'Profesional logístico HSE', U_SGI],
    ['gerente', 'Alejandro Giraldo', 'Gerente de Proyectos', U_PRO], ['profesional', 'Viviana Ardila', 'Líder Gestión de Contratos', U_PRO],
    ['profesional', 'Natalia Herrera', 'Prof. Control de Gestión', U_PRO], ['profesional', 'Edisson Suesca', 'Prof. Control de Gestión', U_PRO],
    ['profesional', 'Camila Santana', 'Prof. Control de Gestión', U_PRO], ['profesional', 'Nicolle Quintero', 'Prof. Control de Gestión', U_PRO],
    ['profesional', 'Luisa Quintero', 'Coord. Licitaciones', U_PRO], ['profesional', 'Katherine Betancur', 'Profesional Licitaciones', U_PRO],
    ['profesional', 'Mauricio Sabogal', 'Profesional Licitaciones', U_PRO], ['profesional', 'Wilson Rodríguez', 'Profesional Licitaciones', U_PRO],
    ['jefe', 'Carolina Castillo', 'Líder Abastecimiento y Coord. Seguimiento y Control', U_ABA],
    ['administrativo', 'Paola Martínez', 'Asistente Seguimiento y Control', U_ABA], ['administrativo', 'Solanyi Surquira', 'Asistente Administrativa', U_ABA, ['encargada']],
    ['compras', 'Mauricio Giraldo', 'Coord. Compras', U_ABA], ['carros', 'Wilson Muñoz', 'Coord. Transporte', U_ABA], ['compras', 'Fredy Torres', 'Auxiliar Compras MGC', U_ABA],
    ['colaborador', 'Iveth Pardo', 'Recepcionista', U_ABA], ['colaborador', 'Alexander Beltrán', 'Mensajero', U_ABA], ['colaborador', 'Giovanna Bohórquez', 'Servicios Generales', U_ABA],
    ['conductor', 'Oscar Farfán', 'Conductor', U_ABA],
    // El organigrama no trae a nadie de bodega: en la demo lo hace el auxiliar administrativo (se cambia desde Personas y permisos).
    ['asistente', 'Andrés Beltrán', 'Auxiliar Administrativo (hace de bodega en la demo)', U_ABA],
    ['colaborador', 'Marcela Tamayo', 'Gerente Administrativa', U_ADM], ['colaborador', 'Osler Monroy', 'Coord. Gestión Humana', U_ADM],
    ['colaborador', 'Alejandra Nivia', 'Asist. Gestión Humana', U_ADM], ['colaborador', 'Melissa Arias', 'Asist. Gestión Humana', U_ADM], ['colaborador', 'Arturo Tovar', 'Aux. Gestión Humana', U_ADM],
    ['soporte', 'Ángel Ortiz', 'Asistente TI', U_ADM, ['actas']], ['equipos', 'Fabián Barbosa', 'Auxiliar TI', U_ADM],
    ['financiero', 'Adriana Patiño', 'Gerente Financiera', U_FIN], ['financiero', 'Nury Acosta', 'Contador', U_FIN], ['financiero', 'Andrea Correa', 'Asist. Contable', U_FIN],
    ['financiero', 'Fanny Benavides', 'Profesional Contable', U_FIN], ['financiero', 'Heidy Lorena Castillo', 'Auxiliar Contable', U_FIN],
    ['financiero', 'Harold Beltrán', 'Asist. Nómina', U_FIN], ['financiero', 'Leidy Ramos', 'Asist. Reembolsables', U_FIN]
  ];
  const sinTildes = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
  /** Correo inventado de una persona de prueba: «rol.nombre.apellido@example.com» (el rol va primero; lo leen las reglas). */
  const correoPrueba = (rol, nombre) => `${rol}.${sinTildes(nombre)}@example.com`;
  const PERMISO_TXT = { no: 'Sin acceso', ver: 'Solo ver', pide: 'Pide material', edita: 'Edita', reporta: 'Reporta novedades', autoriza: 'Autoriza',
    compra: 'Hace las compras', bodega: 'Encargada de bodega', finanzas: 'Ve compras y facturas', gerente: 'Ve todo a detalle', jefe: 'Ve y cambia todo',
    encargado: 'Mantenimiento y actas de entrega', soporte: 'Recibe los registros y sigue las entregas', logistica: 'Logística de la reunión', asiste: 'Asiste a reuniones', actas: 'Registra actas y formatos', informa: 'Informa lo que hay' };

  // Niveles que la Jefe puede dar a una persona en cada módulo (además de «Como su rol», que es no marcar nada, y «Sin acceso»).
  // Nunca «jefe» ni «gerente». Debe coincidir con firestore.rules (función permisosOk).
  const NIVELES = {
    equipos: [['ver', 'Solo ver'], ['encargado', 'Encargado: mantenimiento y entregas'], ['soporte', 'Soporte: recibe y revisa']],
    inventario: [['ver', 'Solo ver'], ['finanzas', 'Ve todas las compras y facturas, y también pide'], ['pide', 'Pide material y compras'], ['compra', 'Hace las compras'], ['bodega', 'Encargada de bodega']],
    vehiculos: [['ver', 'Solo ver'], ['reporta', 'Reporta novedades y registra salidas'], ['autoriza', 'Revisa novedades y documentos']],
    reuniones: [['ver', 'Solo ver']]   // en Reuniones cada rol hace su tarea: aquí solo se sube o se baja a «ver»
  };
  const MODULOS_PERM = Object.keys(NIVELES);
  /** Deja solo los niveles válidos (mapa módulo -> nivel). Lo demás se descarta. */
  const permisosValidos = ov => {
    const o = {};
    if (ov && typeof ov === 'object') MODULOS_PERM.forEach(m => { const v = ov[m]; if (v === 'no' || (NIVELES[m].some(x => x[0] === v))) o[m] = v; });
    return o;
  };
  const rolDe = rol => ROLES.find(r => r.rol === rol) || null;
  const corto = nombre => { const p = String(nombre || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : (p[0] || ''); };
  /** Arma la persona con la que trabaja la app a partir de un rol y un nombre (sirve para prueba y para cuentas reales). */
  function armar(rol, nombre, correo, cargo, extra) {
    const r = rolDe(rol); if (!r) return null;
    const x = Object.assign({}, extra || {});
    x.extras = Object.freeze(extrasDe(rol, x.extras));   // solo los permisos extra que sirven para ese rol
    // Lo que la Jefe le marcó a la persona (por módulo) manda sobre lo de su rol. Las personas de prueba no lo llevan.
    const ajustes = Object.freeze(x.real ? permisosValidos(x.permisos) : {});
    delete x.permisos;
    return Object.freeze(Object.assign({ rol, nombre, corto: corto(nombre), correo: String(correo || '').toLowerCase(), cargo: cargo || r.cargo,
      rolTxt: r.rolTxt, area: r.area, ajustes, permisos: Object.freeze(Object.assign({}, r.permisos, ajustes)) }, x));
  }
  // Permisos extra fijos de dos personas de prueba (Ángel revisa las actas, Solanyi es encargada de reuniones). Debe coincidir con firestore.rules (extrasPrueba).
  const PERSONAS = DE_PRUEBA.map(([rol, nombre, cargo, unidad, extras]) => armar(rol, nombre, correoPrueba(rol, nombre), cargo, { prueba: true, unidad, extras: extras || [] }));

  window.DEMO = Object.freeze({
    CLAVE: CLAVE_DEMO,
    ROLES: Object.freeze(ROLES.map(r => Object.freeze(r))),
    AREAS: Object.freeze(AREAS),
    UNIDADES: Object.freeze(UNIDADES),
    correoPrueba,
    PERSONAS: Object.freeze(PERSONAS),
    PERMISO_TXT: Object.freeze(PERMISO_TXT),
    EXTRAS: Object.freeze(EXTRAS.map(e => Object.freeze(e))),
    extrasDe,
    NIVELES: Object.freeze(NIVELES),
    permisosValidos,
    rolDe,
    armar,
    rolDeCodigo: c => { const m = /^([A-Z]{3})-/.exec(String(c || '')); const r = m && ROLES.find(x => x.pref === m[1]); return r ? r.rol : null; },
    porRol: rol => PERSONAS.find(p => p.rol === rol) || null,
    porCorreo: c => PERSONAS.find(p => p.correo === String(c || '').toLowerCase()) || null
  });
})();
