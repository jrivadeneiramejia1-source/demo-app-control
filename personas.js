/* personas.js — Cuentas de prueba de la demo (todas inventadas).
   La clave es la misma para todas y está aquí a propósito: es una demo pública con datos inventados.
   Versión pagada: cada persona entra con su propio correo y su propia clave, y nadie ve las claves de otros.
   Si cambias un correo aquí, cámbialo también en firestore.rules (función cuentas). */
(function () {
  'use strict';
  const CLAVE_DEMO = 'demo-control-2026';
  // Permisos por módulo: 'no' (no lo ve), 'ver', 'pide', 'edita', 'reporta', 'autoriza', 'bodega', 'jefe'.
  // Inventario (consumibles y bodega, con las compras adentro): bodega = encargada; autoriza = aprueba compras; pide = solo pide material.
  const PERSONAS = [
    { rol: 'jefe', nombre: 'Ana Pérez', corto: 'Ana P.', correo: 'ana.perez@example.com', cargo: 'Jefe de reuniones', rolTxt: 'Jefe',
      permisos: { equipos: 'ver', inventario: 'ver', vehiculos: 'ver', reuniones: 'jefe' } },
    { rol: 'compras', nombre: 'Luis Rodríguez', corto: 'Luis R.', correo: 'luis.rodriguez@example.com', cargo: 'Coordinador administrativo', rolTxt: 'Autoriza compras',
      permisos: { equipos: 'no', inventario: 'autoriza', vehiculos: 'no', reuniones: 'autoriza' } },
    { rol: 'carros', nombre: 'Marta Gómez', corto: 'Marta G.', correo: 'marta.gomez@example.com', cargo: 'Coordinadora de transporte', rolTxt: 'Autoriza carros',
      permisos: { equipos: 'no', inventario: 'pide', vehiculos: 'autoriza', reuniones: 'autoriza' } },
    { rol: 'conductor', nombre: 'Carlos Pinto', corto: 'Carlos P.', correo: 'carlos.pinto@example.com', cargo: 'Conductor', rolTxt: 'Conductor',
      permisos: { equipos: 'no', inventario: 'pide', vehiculos: 'reporta', reuniones: 'ver' } },
    { rol: 'asistente', nombre: 'Sofía Herrera', corto: 'Sofía H.', correo: 'sofia.herrera@example.com', cargo: 'Asistente de soporte y bodega', rolTxt: 'Asistente',
      permisos: { equipos: 'edita', inventario: 'bodega', vehiculos: 'no', reuniones: 'ver' } }
  ];
  const PERMISO_TXT = { no: 'Sin acceso', ver: 'Solo ver', pide: 'Pide material', edita: 'Edita', reporta: 'Reporta novedades', autoriza: 'Autoriza', bodega: 'Encargada de bodega', jefe: 'Jefe' };
  window.DEMO = Object.freeze({
    CLAVE: CLAVE_DEMO,
    PERSONAS: Object.freeze(PERSONAS.map(p => Object.freeze(p))),
    PERMISO_TXT: Object.freeze(PERMISO_TXT),
    porRol: rol => PERSONAS.find(p => p.rol === rol) || null,
    porCorreo: c => PERSONAS.find(p => p.correo === String(c || '').toLowerCase()) || null
  });
})();
