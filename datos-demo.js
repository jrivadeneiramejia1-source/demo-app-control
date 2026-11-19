/* datos-demo.js — Datos de ejemplo de la demo (100 % inventados).
   Define window.DatosDemo.generar(hoy) y devuelve los documentos de cada colección
   con IDs fijos. Todas las fechas son relativas a `hoy`, para que la demo siempre se vea actual.
   Esquema: sección "Colecciones" de la especificación de la fase 2. */
(function () {
  'use strict';

  function generar(hoy) {
    const esFecha = Object.prototype.toString.call(hoy) === '[object Date]' && !isNaN(hoy);
    const base = esFecha ? hoy : new Date();
    const dos = n => String(n).padStart(2, '0');

    // Fecha local 'YYYY-MM-DD' desplazada n días respecto a hoy (maneja cambio de mes y de año).
    function dias(n) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
      return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
    }
    // Marca de tiempo ISO desplazada n días, a la hora local indicada.
    function iso(n, h, min) {
      return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n, h, min || 0, 0).toISOString();
    }

    // ---------- EQUIPOS ----------
    function equipo(serial, tipo, marca, modelo, estado, asignadoA, proyecto, ultimoMtto, ultimoBackup, obs, historial) {
      return { serial, tipo, marca, modelo, estado, asignadoA, proyecto, ultimoMtto, ultimoBackup, obs, historial };
    }
    const H = (n, tipo, persona, nota) => ({ fecha: dias(n), tipo, persona, nota });

    const equipos = {
      'eq-001': equipo('DEMO-0001', 'Portátil', 'Lenovo', 'ThinkPad E14', 'asignado', 'Jorge Ibarra', 'Proyecto Costa Norte',
        dias(-40), dias(-12), '', [
          H(-120, 'mantenimiento', 'Sofía Herrera', 'Limpieza general y cambio de pasta térmica'),
          H(-60, 'entrega', 'Jorge Ibarra', 'Entregado para el trabajo de campo'),
          H(-40, 'mantenimiento', 'Sofía Herrera', 'Revisión de rutina y actualización del sistema'),
          H(-12, 'backup', 'Sofía Herrera', 'Copia de las carpetas de reuniones')
        ]),
      'eq-002': equipo('DEMO-0002', 'Portátil', 'HP', 'ProBook 440', 'asignado', 'Paola Ríos', 'Proyecto Costa Norte',
        dias(-210), dias(-30), 'Batería dura poco, revisar en el próximo mantenimiento', [
          H(-210, 'mantenimiento', 'Sofía Herrera', 'Limpieza de ventilador y revisión de disco'),
          H(-150, 'entrega', 'Paola Ríos', 'Entregado a Paola para el registro de asistentes'),
          H(-30, 'backup', 'Sofía Herrera', 'Copia de fotos y listas de asistencia')
        ]),
      'eq-003': equipo('DEMO-0003', 'Portátil', 'Dell', 'Latitude 5420', 'asignado', 'Andrés Mendoza', 'Proyecto Ruta Alta',
        dias(-95), dias(-20), '', [
          H(-95, 'mantenimiento', 'Sofía Herrera', 'Mantenimiento preventivo'),
          H(-90, 'entrega', 'Andrés Mendoza', 'Entregado para el Proyecto Ruta Alta'),
          H(-20, 'backup', 'Sofía Herrera', 'Copia de documentos del proyecto')
        ]),
      'eq-004': equipo('DEMO-0004', 'Tableta', 'Samsung', 'Galaxy Tab A8', 'asignado', 'Liliana Torres', 'Proyecto Ruta Alta',
        dias(-70), '', 'Se usa para tomar fotos y firmas en las reuniones', [
          H(-70, 'mantenimiento', 'Sofía Herrera', 'Actualización y limpieza de archivos'),
          H(-35, 'entrega', 'Liliana Torres', 'Entregada para las reuniones de la ruta alta')
        ]),
      'eq-005': equipo('DEMO-0005', 'GPS', 'Garmin', 'GPSMAP 65', 'asignado', 'Camilo Suárez', 'Proyecto Costa Norte',
        dias(-100), '', '', [
          H(-100, 'mantenimiento', 'Sofía Herrera', 'Carga de mapas y revisión de batería'),
          H(-25, 'entrega', 'Camilo Suárez', 'Entregado para la salida a la costa')
        ]),
      'eq-006': equipo('DEMO-0006', 'Celular', 'Motorola', 'Moto G54', 'asignado', 'Carlos Pinto', 'Proyecto Costa Norte',
        dias(-55), '', '', [
          H(-55, 'mantenimiento', 'Sofía Herrera', 'Limpieza de memoria y actualización'),
          H(-50, 'entrega', 'Carlos Pinto', 'Entregado al conductor para el contacto en ruta')
        ]),
      'eq-007': equipo('DEMO-0007', 'Portátil', 'Lenovo', 'ThinkPad E14', 'bodega', 'Bodega', '',
        dias(-230), dias(-45), 'Listo para entregar', [
          H(-230, 'mantenimiento', 'Sofía Herrera', 'Mantenimiento completo'),
          H(-150, 'entrega', 'Jorge Ibarra', 'Entregado para el trabajo de campo'),
          H(-45, 'devolucion', 'Jorge Ibarra', 'Devuelto al terminar el proyecto'),
          H(-45, 'backup', 'Sofía Herrera', 'Copia de la información antes de guardarlo')
        ]),
      'eq-008': equipo('DEMO-0008', 'Impresora', 'Epson', 'EcoTank L3250', 'bodega', 'Bodega', '',
        dias(-60), '', 'Tiene tinta completa', [
          H(-60, 'mantenimiento', 'Sofía Herrera', 'Limpieza de cabezal y revisión de tanques')
        ]),
      'eq-009': equipo('DEMO-0009', 'Disco duro externo', 'Seagate', 'Expansion 2 TB', 'bodega', 'Bodega', '',
        dias(-20), dias(-20), 'Disco con copias de reuniones anteriores', [
          H(-80, 'entrega', 'Paola Ríos', 'Entregado para guardar videos de reuniones'),
          H(-22, 'devolucion', 'Paola Ríos', 'Devuelto con las copias terminadas'),
          H(-20, 'mantenimiento', 'Sofía Herrera', 'Revisión del disco sin errores')
        ]),
      'eq-010': equipo('DEMO-0010', 'Portátil', 'HP', 'ProBook 440', 'recibido', 'Liliana Torres', 'Proyecto Ruta Alta',
        dias(-190), dias(-75), 'Teclado con una tecla floja', [
          H(-190, 'mantenimiento', 'Sofía Herrera', 'Mantenimiento preventivo'),
          H(-130, 'entrega', 'Liliana Torres', 'Entregado para el Proyecto Ruta Alta'),
          H(-75, 'backup', 'Sofía Herrera', 'Copia de documentos'),
          H(-2, 'devolucion', 'Liliana Torres', 'Traído para mantenimiento por la tecla floja')
        ]),
      'eq-011': equipo('DEMO-0011', 'Tableta', 'Lenovo', 'Tab M10', 'recibido', 'Jorge Ibarra', 'Proyecto Costa Norte',
        dias(-80), '', 'No carga bien, probar el cable y el puerto', [
          H(-80, 'mantenimiento', 'Sofía Herrera', 'Actualización del sistema'),
          H(-45, 'entrega', 'Jorge Ibarra', 'Entregada para el trabajo de campo'),
          H(-1, 'devolucion', 'Jorge Ibarra', 'Traída porque no carga bien')
        ]),
      'eq-012': equipo('DEMO-0012', 'Portátil', 'Dell', 'Latitude 5420', 'recibido', 'Andrés Mendoza', 'Proyecto Ruta Alta',
        dias(-215), dias(-100), 'Pantalla con una raya y el equipo se calienta', [
          H(-215, 'mantenimiento', 'Sofía Herrera', 'Limpieza interna'),
          H(-170, 'entrega', 'Andrés Mendoza', 'Entregado para el Proyecto Ruta Alta'),
          H(-100, 'backup', 'Sofía Herrera', 'Copia de archivos del proyecto'),
          H(0, 'devolucion', 'Andrés Mendoza', 'Traído para revisar el calentamiento')
        ])
    };

    // ---------- COMPRAS ----------
    function compra(que, cantidad, unidad, categoria, valorAprox, paraQue, pide, autoriza, estado, extra) {
      return Object.assign({
        que, cantidad, unidad, categoria, valorAprox, paraQue, pide, autoriza, estado,
        proveedor: '', valorReal: 0, fechaPedido: '', fechaCompra: '', entregadoA: '', motivoRechazo: ''
      }, extra);
    }
    const compras = {
      'co-001': compra('Botas de seguridad', 10, 'pares', 'EPP', 850000, 'Para la cuadrilla de campo',
        'Sofía Herrera', '', 'pedido', { fechaPedido: dias(-1) }),
      'co-002': compra('Mouse inalámbrico', 6, 'unidades', 'Accesorios', 180000, 'Para los portátiles de campo',
        'Ana Pérez', '', 'pedido', { fechaPedido: dias(0) }),
      'co-003': compra('Resmas de papel carta', 8, 'resmas', 'Papelería', 224000, 'Para imprimir listas de asistencia',
        'Sofía Herrera', 'Luis Rodríguez', 'autorizado', { fechaPedido: dias(-4) }),
      'co-004': compra('Cámara web con micrófono', 2, 'unidades', 'Cómputo', 390000, 'Para reuniones con equipos remotos',
        'Ana Pérez', 'Luis Rodríguez', 'rechazado',
        { fechaPedido: dias(-9), motivoRechazo: 'Ya hay cámaras en bodega, usa esas primero' }),
      'co-005': compra('Cables HDMI y adaptadores', 5, 'unidades', 'Accesorios', 140000, 'Para el proyector de las reuniones',
        'Sofía Herrera', 'Luis Rodríguez', 'comprado',
        { fechaPedido: dias(-12), proveedor: 'Ferretería El Faro', valorReal: 152000, fechaCompra: dias(-8) }),
      'co-006': compra('Memorias USB de 64 GB', 10, 'unidades', 'Cómputo', 320000, 'Para entregar copias a los líderes',
        'Ana Pérez', 'Luis Rodríguez', 'comprado',
        { fechaPedido: dias(-7), proveedor: 'Papelería Central', valorReal: 305000, fechaCompra: dias(-3) }),
      'co-007': compra('Chalecos reflectivos', 12, 'unidades', 'EPP', 420000, 'Para la cuadrilla de campo',
        'Sofía Herrera', 'Luis Rodríguez', 'recibido',
        { fechaPedido: dias(-25), proveedor: 'Ferretería El Faro', valorReal: 438000, fechaCompra: dias(-20), entregadoA: 'Jorge Ibarra' }),
      'co-008': compra('Garrafones de agua', 6, 'unidades', 'Refrigerios', 90000, 'Para la reunión de la semana pasada',
        'Sofía Herrera', '', 'sin-autorizar',
        { fechaPedido: dias(-5), proveedor: 'Distribuidora Agua Clara', valorReal: 96000, fechaCompra: dias(-5) })
    };

    // ---------- VEHÍCULOS ----------
    const vehiculos = {
      've-abc123': {
        placa: 'ABC 123', marca: 'Toyota', modelo: 'Hilux', anio: 2022, conductor: 'Carlos Pinto', km: 45210,
        soat: dias(12), tecno: dias(200), estado: 'en-uso',
        novedades: [
          { id: 'no-001', tipo: 'rayon', fecha: dias(-2), km: 45150, desc: 'Rayón en la puerta derecha, cerca de la manija',
            reporta: 'Carlos Pinto', costo: 0, revisada: false }
        ]
      },
      've-def456': {
        placa: 'DEF 456', marca: 'Chevrolet', modelo: 'D-Max', anio: 2021, conductor: '', km: 62800,
        soat: dias(150), tecno: dias(-5), estado: 'disponible',
        novedades: []
      },
      've-ghi789': {
        placa: 'GHI 789', marca: 'Mitsubishi', modelo: 'L200', anio: 2020, conductor: '', km: 88450,
        soat: dias(90), tecno: dias(120), estado: 'en-taller',
        novedades: [
          { id: 'no-002', tipo: 'mantenimiento', fecha: dias(-8), km: 88200, desc: 'Cambio de aceite, filtros y revisión de frenos',
            reporta: 'Carlos Pinto', costo: 380000, revisada: true }
        ]
      }
    };

    // ---------- REUNIONES ----------
    function correo(comunidad, fecha, hora, lugar) {
      return 'Asunto: Reunión con ' + comunidad + '\n\n' +
        'Buenos días.\n\n' +
        'Te confirmo la reunión con ' + comunidad + ' para el ' + fecha + ' a las ' + hora + ' en ' + lugar + '. ' +
        'Necesitamos carros para el equipo y comida para los asistentes. ' +
        'Por favor revisa lo que corresponde a tu área y avísame si falta algo.\n\n' +
        'Gracias.\n' +
        'Equipo de coordinación de reuniones';
    }
    const reuniones = {
      're-001': {
        comunidad: 'Comunidad Los Olivos', fecha: dias(6), hora: '08:00', lugar: 'Salón comunal de Los Olivos',
        jefe: 'Ana Pérez', asistentes: ['Jorge Ibarra', 'Paola Ríos', 'Andrés Mendoza', 'Liliana Torres'],
        estado: 'programada',
        necesidades: [
          { id: 'ne-001', tipo: 'carros', cantidad: 2, detalle: 'Dos camionetas para el equipo de campo',
            responsable: 'Marta Gómez', responsableRol: 'carros', estado: 'autorizado' },
          { id: 'ne-002', tipo: 'refrigerios', cantidad: 30, detalle: 'Refrigerios para 30 personas',
            responsable: 'Luis Rodríguez', responsableRol: 'compras', estado: 'pendiente' },
          { id: 'ne-003', tipo: 'almuerzo', cantidad: 30, detalle: 'Almuerzo para 30 personas',
            responsable: 'Luis Rodríguez', responsableRol: 'compras', estado: 'pendiente' }
        ],
        correo: correo('Comunidad Los Olivos', dias(6), '08:00', 'el salón comunal de Los Olivos'),
        historial: [{ fecha: iso(-3, 9, 30), texto: 'Reunión creada desde el correo recibido' }]
      },
      're-002': {
        comunidad: 'Comunidad El Cardón', fecha: dias(13), hora: '09:30', lugar: 'Kiosco principal de El Cardón',
        jefe: 'Ana Pérez', asistentes: ['Paola Ríos', 'Camilo Suárez', 'Liliana Torres'],
        estado: 'reprogramada',
        necesidades: [
          { id: 'ne-004', tipo: 'carros', cantidad: 1, detalle: 'Una camioneta para el equipo',
            responsable: 'Marta Gómez', responsableRol: 'carros', estado: 'pendiente' },
          { id: 'ne-005', tipo: 'refrigerios', cantidad: 20, detalle: 'Refrigerios para 20 personas',
            responsable: 'Luis Rodríguez', responsableRol: 'compras', estado: 'pendiente' }
        ],
        correo: correo('Comunidad El Cardón', dias(9), '09:30', 'el kiosco principal de El Cardón'),
        historial: [
          { fecha: iso(-6, 10, 0), texto: 'Reunión creada desde el correo recibido' },
          { fecha: iso(-1, 15, 20), texto: 'Cambió la fecha del ' + dias(9) + ' al ' + dias(13) + ' porque la comunidad pidió más tiempo' }
        ]
      },
      're-003': {
        comunidad: 'Comunidad Punta Arena', fecha: dias(-10), hora: '10:00', lugar: 'Escuela de Punta Arena',
        jefe: 'Ana Pérez', asistentes: ['Jorge Ibarra', 'Paola Ríos', 'Camilo Suárez'],
        estado: 'realizada',
        necesidades: [
          { id: 'ne-006', tipo: 'carros', cantidad: 1, detalle: 'Una camioneta para el equipo',
            responsable: 'Marta Gómez', responsableRol: 'carros', estado: 'autorizado' },
          { id: 'ne-007', tipo: 'almuerzo', cantidad: 15, detalle: 'Almuerzo para 15 personas',
            responsable: 'Luis Rodríguez', responsableRol: 'compras', estado: 'autorizado' }
        ],
        correo: correo('Comunidad Punta Arena', dias(-10), '10:00', 'la escuela de Punta Arena'),
        historial: [
          { fecha: iso(-18, 8, 45), texto: 'Reunión creada desde el correo recibido' },
          { fecha: iso(-10, 16, 0), texto: 'Reunión realizada sin novedades' }
        ]
      }
    };

    // ---------- AVISOS ----------
    function aviso(para, titulo, texto, en, modulo) {
      return { para, titulo, texto, en, modulo, leido: {} };
    }
    const avisos = {
      'av-001': aviso('compras', 'Compras por autorizar', 'Tienes 2 compras por autorizar.', iso(0, 8, 15), 'compras'),
      'av-002': aviso('jefe', 'Compra sin autorización', 'Se compró algo sin autorización: garrafones de agua.', iso(-5, 17, 40), 'compras'),
      'av-003': aviso('carros', 'SOAT por vencer', 'El SOAT del ABC 123 vence en 12 días.', iso(-1, 7, 30), 'vehiculos'),
      'av-004': aviso('jefe', 'Novedad en un carro', 'Carlos Pinto reportó un rayón en el ABC 123.', iso(-2, 18, 10), 'vehiculos'),
      'av-005': aviso('todos', 'Bienvenido a la demo', 'Bienvenido a la demo. Aquí todos los datos son inventados, puedes probar todo con calma.', iso(0, 7, 0), 'inicio')
    };

    return { equipos, compras, vehiculos, reuniones, avisos };
  }

  window.DatosDemo = Object.freeze({ VERSION: 1, generar });
})();
