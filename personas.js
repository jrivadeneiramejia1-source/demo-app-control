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
      permisos: { equipos: 'no', inventario: 'pide', vehiculos: 'no', reuniones: 'actas' } }
  ];
  const AREAS = ['Dirección', 'Equipos', 'Inventario', 'Vehículos', 'Reuniones'];
  // Permisos extra: además del rol (que da el código), el Gerente o la Jefe le marcan a cada persona lo que hace de más.
  // Cada uno sirve solo para los roles de la lista. Debe coincidir con firestore.rules (función extraDe).
  const EXTRAS = [
    { id: 'compra', roles: ['asistente'], txt: 'También hace y recibe compras', detalle: 'Ve las compras autorizadas y las registra, como Compras.' },
    { id: 'actas', roles: ['soporte'], txt: 'También sigue las actas de entrega', detalle: 'Además de los equipos, está pendiente de que cada entrega tenga su acta firmada (se usa en la fase de Equipos).' },
    { id: 'encargada', roles: ['administrativo'], txt: 'Encargada de reuniones', detalle: 'Ve todas las tareas de todas las reuniones y la bandeja de correos. Lo que se autoriza sigue siendo de la Jefe.' }
  ];
  const extrasDe = (rol, lista) => (Array.isArray(lista) ? lista : []).filter(x => EXTRAS.some(e => e.id === x && e.roles.includes(rol)));
  // Una persona de prueba por rol (nombres inventados).
  const DE_PRUEBA = [
    ['gerente', 'Ricardo Fuentes', 'ricardo.fuentes@example.com', 'Gerente general'],
    ['jefe', 'Ana Pérez', 'ana.perez@example.com'],
    ['equipos', 'Daniel Ortiz', 'daniel.ortiz@example.com'],
    ['soporte', 'Valentina Ruiz', 'valentina.ruiz@example.com', '', ['actas']],
    ['compras', 'Luis Rodríguez', 'luis.rodriguez@example.com'],
    ['asistente', 'Sofía Herrera', 'sofia.herrera@example.com'],
    ['carros', 'Marta Gómez', 'marta.gomez@example.com'],
    ['conductor', 'Carlos Pinto', 'carlos.pinto@example.com'],
    ['logistica', 'Pedro Castillo', 'pedro.castillo@example.com'],
    ['profesional', 'Laura Medina', 'laura.medina@example.com'],
    ['administrativo', 'Natalia Vargas', 'natalia.vargas@example.com']
  ];
  const PERMISO_TXT = { no: 'Sin acceso', ver: 'Solo ver', pide: 'Pide material', edita: 'Edita', reporta: 'Reporta novedades', autoriza: 'Autoriza',
    compra: 'Hace las compras', bodega: 'Encargada de bodega', gerente: 'Ve todo a detalle', jefe: 'Ve y cambia todo',
    encargado: 'Mantenimiento y actas de entrega', soporte: 'Recibe los registros y sigue las entregas', logistica: 'Logística de la reunión', asiste: 'Asiste a reuniones', actas: 'Registra actas y formatos', informa: 'Informa lo que hay' };

  const rolDe = rol => ROLES.find(r => r.rol === rol) || null;
  const corto = nombre => { const p = String(nombre || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : (p[0] || ''); };
  /** Arma la persona con la que trabaja la app a partir de un rol y un nombre (sirve para prueba y para cuentas reales). */
  function armar(rol, nombre, correo, cargo, extra) {
    const r = rolDe(rol); if (!r) return null;
    const x = Object.assign({}, extra || {});
    x.extras = Object.freeze(extrasDe(rol, x.extras));   // solo los permisos extra que sirven para ese rol
    return Object.freeze(Object.assign({ rol, nombre, corto: corto(nombre), correo: String(correo || '').toLowerCase(), cargo: cargo || r.cargo,
      rolTxt: r.rolTxt, area: r.area, permisos: Object.freeze(Object.assign({}, r.permisos)) }, x));
  }
  // Valentina (Soporte de prueba) tiene el permiso extra de las actas, para mostrar cómo se revisan. Debe coincidir con firestore.rules (extrasPrueba).
  const PERSONAS = DE_PRUEBA.map(([rol, nombre, correo, cargo, extras]) => armar(rol, nombre, correo, cargo, { prueba: true, extras: extras || [] }));

  window.DEMO = Object.freeze({
    CLAVE: CLAVE_DEMO,
    ROLES: Object.freeze(ROLES.map(r => Object.freeze(r))),
    AREAS: Object.freeze(AREAS),
    PERSONAS: Object.freeze(PERSONAS),
    PERMISO_TXT: Object.freeze(PERMISO_TXT),
    EXTRAS: Object.freeze(EXTRAS.map(e => Object.freeze(e))),
    extrasDe,
    rolDe,
    armar,
    rolDeCodigo: c => { const m = /^([A-Z]{3})-/.exec(String(c || '')); const r = m && ROLES.find(x => x.pref === m[1]); return r ? r.rol : null; },
    porRol: rol => PERSONAS.find(p => p.rol === rol) || null,
    porCorreo: c => PERSONAS.find(p => p.correo === String(c || '').toLowerCase()) || null
  });
})();
