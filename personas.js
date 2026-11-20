/* personas.js — Cuentas de prueba de la demo (todas inventadas).
   La clave es la misma para todas y está aquí a propósito: es una demo pública con datos inventados.
   Versión pagada: cada persona entra con su propio correo y su propia clave, y nadie ve las claves de otros.
   Si cambias un correo aquí, cámbialo también en firestore.rules (función cuentas). */
(function () {
  'use strict';
  const CLAVE_DEMO = 'demo-control-2026';
  // Permisos por módulo: 'no' (no lo ve), 'ver', 'pide', 'edita', 'reporta', 'autoriza', 'compra', 'bodega', 'gerente', 'jefe'.
  // Inventario (consumibles y bodega, con las compras adentro):
  //   jefe = autoriza las compras y puede hacer todo · gerente = ve todo a detalle y solo autoriza lo que pide el jefe
  //   compra = hace las compras (proveedor, valor, factura) · bodega = existencias, entregas y recibe lo comprado · pide = solo pide.
  const PERSONAS = [
    { rol: 'gerente', nombre: 'Ricardo Fuentes', corto: 'Ricardo F.', correo: 'ricardo.fuentes@example.com', cargo: 'Gerente general', rolTxt: 'Gerente',
      permisos: { equipos: 'ver', inventario: 'gerente', vehiculos: 'ver', reuniones: 'ver' } },
    { rol: 'jefe', nombre: 'Ana Pérez', corto: 'Ana P.', correo: 'ana.perez@example.com', cargo: 'Jefe de operaciones', rolTxt: 'Jefe',
      permisos: { equipos: 'jefe', inventario: 'jefe', vehiculos: 'jefe', reuniones: 'jefe' } },
    { rol: 'compras', nombre: 'Luis Rodríguez', corto: 'Luis R.', correo: 'luis.rodriguez@example.com', cargo: 'Encargado de compras', rolTxt: 'Compras',
      permisos: { equipos: 'no', inventario: 'compra', vehiculos: 'no', reuniones: 'autoriza' } },
    { rol: 'carros', nombre: 'Marta Gómez', corto: 'Marta G.', correo: 'marta.gomez@example.com', cargo: 'Coordinadora de transporte', rolTxt: 'Autoriza carros',
      permisos: { equipos: 'no', inventario: 'pide', vehiculos: 'autoriza', reuniones: 'autoriza' } },
    { rol: 'conductor', nombre: 'Carlos Pinto', corto: 'Carlos P.', correo: 'carlos.pinto@example.com', cargo: 'Conductor', rolTxt: 'Conductor',
      permisos: { equipos: 'no', inventario: 'pide', vehiculos: 'reporta', reuniones: 'ver' } },
    { rol: 'asistente', nombre: 'Sofía Herrera', corto: 'Sofía H.', correo: 'sofia.herrera@example.com', cargo: 'Asistente de soporte y bodega', rolTxt: 'Bodega',
      permisos: { equipos: 'edita', inventario: 'bodega', vehiculos: 'no', reuniones: 'ver' } }
  ];
  const PERMISO_TXT = { no: 'Sin acceso', ver: 'Solo ver', pide: 'Pide material', edita: 'Edita', reporta: 'Reporta novedades', autoriza: 'Autoriza',
    compra: 'Hace las compras', bodega: 'Encargada de bodega', gerente: 'Ve todo a detalle', jefe: 'Ve y cambia todo' };
  window.DEMO = Object.freeze({
    CLAVE: CLAVE_DEMO,
    PERSONAS: Object.freeze(PERSONAS.map(p => Object.freeze(p))),
    PERMISO_TXT: Object.freeze(PERMISO_TXT),
    porRol: rol => PERSONAS.find(p => p.rol === rol) || null,
    porCorreo: c => PERSONAS.find(p => p.correo === String(c || '').toLowerCase()) || null
  });
})();
