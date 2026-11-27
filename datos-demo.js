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
      // Nunca en el futuro: si se reinicia temprano (antes de la hora del aviso), queda un minuto antes de ahora.
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n, h, min || 0, 0);
      return new Date(Math.min(d.getTime(), base.getTime() - 60000)).toISOString();
    }

    // ---------- EQUIPOS ----------
    // Los que están en Recibidos esperan mantenimiento y backup (pendientes) antes de volver a bodega.
    // Cédulas inventadas de las personas que tienen equipos (el acta las pide).
    const CED = { 'Jorge Ibarra': '1020304050', 'Liliana Torres': '1030405060', 'Camilo Suárez': '1040506070', 'Andrés Mendoza': '1050607080', 'Paola Ríos': '1070809010', 'Oscar Farfán': '1080901020' };
    function equipo(serial, tipo, marca, modelo, estado, asignadoA, proyecto, ultimoMtto, ultimoBackup, obs, historial) {
      return { serial, tipo, marca, modelo, estado, asignadoA: estado === 'bodega' ? '' : asignadoA, asignadoCedula: estado === 'bodega' ? '' : CED[asignadoA] || '', proyecto, ultimoMtto, ultimoBackup, obs,
        pendientes: estado === 'recibido' ? { mtto: true, backup: true } : { mtto: false, backup: false }, historial };
    }
    const H = (n, tipo, persona, nota, hojaId) => Object.assign({ fecha: dias(n), tipo, persona, nota }, hojaId ? { hojaId } : {});

    const equipos = {
      'eq-001': equipo('DEMO-0001', 'Portátil', 'Lenovo', 'ThinkPad E14', 'asignado', 'Jorge Ibarra', 'Proyecto Costa Norte',
        dias(-40), dias(-12), '', [
          H(-120, 'mantenimiento', 'Fabián Barbosa', 'Limpieza general y cambio de pasta térmica'),
          H(-60, 'entrega', 'Jorge Ibarra', 'Entregado para el trabajo de campo', 'ac1'),
          H(-40, 'mantenimiento', 'Fabián Barbosa', 'Revisión de rutina y actualización del sistema'),
          H(-12, 'backup', 'Fabián Barbosa', 'Copia de las carpetas de reuniones')
        ]),
      'eq-002': equipo('DEMO-0002', 'Portátil', 'HP', 'ProBook 440', 'asignado', 'Paola Ríos', 'Proyecto Costa Norte',
        dias(-210), dias(-30), 'Batería dura poco, revisar en el próximo mantenimiento', [
          H(-210, 'mantenimiento', 'Fabián Barbosa', 'Limpieza de ventilador y revisión de disco'),
          H(-150, 'entrega', 'Paola Ríos', 'Entregado a Paola para el registro de asistentes'),
          H(-30, 'backup', 'Fabián Barbosa', 'Copia de fotos y listas de asistencia')
        ]),
      'eq-003': equipo('DEMO-0003', 'Portátil', 'Dell', 'Latitude 5420', 'asignado', 'Andrés Mendoza', 'Proyecto Ruta Alta',
        dias(-95), dias(-20), '', [
          H(-95, 'mantenimiento', 'Fabián Barbosa', 'Mantenimiento preventivo'),
          H(-90, 'entrega', 'Andrés Mendoza', 'Entregado para el Proyecto Ruta Alta'),
          H(-20, 'backup', 'Fabián Barbosa', 'Copia de documentos del proyecto')
        ]),
      'eq-004': equipo('DEMO-0004', 'Tableta', 'Samsung', 'Galaxy Tab A8', 'asignado', 'Liliana Torres', 'Proyecto Ruta Alta',
        dias(-70), '', 'Se usa para tomar fotos y firmas en las reuniones', [
          H(-70, 'mantenimiento', 'Fabián Barbosa', 'Actualización y limpieza de archivos'),
          H(-35, 'entrega', 'Liliana Torres', 'Entregada para las reuniones de la ruta alta', 'ac2')
        ]),
      'eq-005': equipo('DEMO-0005', 'GPS', 'Garmin', 'GPSMAP 65', 'asignado', 'Camilo Suárez', 'Proyecto Costa Norte',
        dias(-100), '', '', [
          H(-100, 'mantenimiento', 'Fabián Barbosa', 'Carga de mapas y revisión de batería'),
          H(-25, 'entrega', 'Camilo Suárez', 'Entregado para la salida a la costa', 'ac3')
        ]),
      'eq-006': equipo('DEMO-0006', 'Celular', 'Motorola', 'Moto G54', 'asignado', 'Oscar Farfán', 'Proyecto Costa Norte',
        dias(-55), '', '', [
          H(-55, 'mantenimiento', 'Fabián Barbosa', 'Limpieza de memoria y actualización'),
          H(-50, 'entrega', 'Oscar Farfán', 'Entregado al conductor para el contacto en ruta')
        ]),
      'eq-007': equipo('DEMO-0007', 'Portátil', 'Lenovo', 'ThinkPad E14', 'bodega', 'Bodega', '',
        dias(-230), dias(-45), 'Listo para entregar', [
          H(-230, 'mantenimiento', 'Fabián Barbosa', 'Mantenimiento completo'),
          H(-150, 'entrega', 'Jorge Ibarra', 'Entregado para el trabajo de campo'),
          H(-45, 'devolucion', 'Jorge Ibarra', 'Devuelto al terminar el proyecto'),
          H(-45, 'backup', 'Fabián Barbosa', 'Copia de la información antes de guardarlo')
        ]),
      'eq-008': equipo('DEMO-0008', 'Impresora', 'Epson', 'EcoTank L3250', 'bodega', 'Bodega', '',
        dias(-60), '', 'Tiene tinta completa', [
          H(-60, 'mantenimiento', 'Fabián Barbosa', 'Limpieza de cabezal y revisión de tanques')
        ]),
      'eq-009': equipo('DEMO-0009', 'Disco duro externo', 'Seagate', 'Expansion 2 TB', 'bodega', 'Bodega', '',
        dias(-20), dias(-20), 'Disco con copias de reuniones anteriores', [
          H(-80, 'entrega', 'Paola Ríos', 'Entregado para guardar videos de reuniones'),
          H(-22, 'devolucion', 'Paola Ríos', 'Devuelto con las copias terminadas'),
          H(-20, 'mantenimiento', 'Fabián Barbosa', 'Revisión del disco sin errores')
        ]),
      'eq-010': equipo('DEMO-0010', 'Portátil', 'HP', 'ProBook 440', 'recibido', 'Liliana Torres', 'Proyecto Ruta Alta',
        dias(-190), dias(-75), 'Teclado con una tecla floja', [
          H(-190, 'mantenimiento', 'Fabián Barbosa', 'Mantenimiento preventivo'),
          H(-130, 'entrega', 'Liliana Torres', 'Entregado para el Proyecto Ruta Alta', 'ac4'),
          H(-75, 'backup', 'Fabián Barbosa', 'Copia de documentos'),
          H(-2, 'devolucion', 'Liliana Torres', 'Traído para mantenimiento por la tecla floja', 'ac4')
        ]),
      'eq-011': equipo('DEMO-0011', 'Tableta', 'Lenovo', 'Tab M10', 'recibido', 'Jorge Ibarra', 'Proyecto Costa Norte',
        dias(-80), '', 'No carga bien, probar el cable y el puerto', [
          H(-80, 'mantenimiento', 'Fabián Barbosa', 'Actualización del sistema'),
          H(-45, 'entrega', 'Jorge Ibarra', 'Entregada para el trabajo de campo', 'ac5'),
          H(-1, 'devolucion', 'Jorge Ibarra', 'Traída porque no carga bien', 'ac5')
        ]),
      'eq-012': equipo('DEMO-0012', 'Portátil', 'Dell', 'Latitude 5420', 'recibido', 'Andrés Mendoza', 'Proyecto Ruta Alta',
        dias(-215), dias(-100), 'Pantalla con una raya y el equipo se calienta', [
          H(-215, 'mantenimiento', 'Fabián Barbosa', 'Limpieza interna'),
          H(-170, 'entrega', 'Andrés Mendoza', 'Entregado para el Proyecto Ruta Alta', 'ac6'),
          H(-100, 'backup', 'Fabián Barbosa', 'Copia de archivos del proyecto'),
          H(0, 'devolucion', 'Andrés Mendoza', 'Traído para revisar el calentamiento', 'ac6')
        ])
    };

    // Ciclo de vida de ejemplo (todo inventado): verificaciones, compras y garantías, una baja pedida (que la Jefe puede aprobar) y un equipo ya dado de baja.
    const SOPORTE = 'Ángel Ortiz', PROV = ['Tecnoventas Ejemplo S. A. S.', 'Equipos del Caribe Ejemplo'];
    ['eq-001', 'eq-002', 'eq-003', 'eq-004', 'eq-005', 'eq-006', 'eq-009'].forEach(id => Object.assign(equipos[id], { verificadoEn: dias(-30), verificadoPor: SOPORTE }));
    Object.assign(equipos['eq-007'], { verificadoEn: dias(-250), verificadoPor: SOPORTE });
    Object.assign(equipos['eq-001'], { fechaCompra: dias(-700), garantiaHasta: dias(18), proveedor: PROV[0], costo: 3200000 });
    Object.assign(equipos['eq-002'], { fechaCompra: dias(-900), garantiaHasta: dias(-100), proveedor: PROV[0], costo: 2800000 });
    Object.assign(equipos['eq-003'], { fechaCompra: dias(-400), garantiaHasta: dias(330), proveedor: PROV[1], costo: 3500000 });
    Object.assign(equipos['eq-004'], { fechaCompra: dias(-340), garantiaHasta: dias(25), proveedor: PROV[1], costo: 1400000 });
    Object.assign(equipos['eq-007'], { fechaCompra: dias(-800), garantiaHasta: dias(-60), proveedor: PROV[0], costo: 3200000 });
    const TXT_BAJA12 = 'La pantalla tiene una raya y el equipo se apaga por el calor; el arreglo sale más caro que uno nuevo.';
    equipos['eq-012'].bajaPedida = { motivo: 'danado', nota: TXT_BAJA12, por: 'Fabián Barbosa', porRol: 'equipos', en: dias(-1) };
    equipos['eq-012'].historial.push(H(-1, 'baja-pedida', 'Fabián Barbosa', 'Dañado sin arreglo: ' + TXT_BAJA12));
    const TXT_BAJA13 = 'Ya no enciende y no hay repuestos para este modelo.';
    equipos['eq-013'] = Object.assign(equipo('DEMO-0013', 'Portátil', 'Acer', 'Aspire 5', 'baja', '', '', dias(-300), dias(-300), 'Retirado: ya no enciende', [
      H(-420, 'mantenimiento', 'Fabián Barbosa', 'Mantenimiento preventivo'),
      H(-300, 'mantenimiento', 'Fabián Barbosa', 'Se cambió el disco y no mejoró'),
      H(-20, 'baja-pedida', 'Fabián Barbosa', 'Obsoleto: ' + TXT_BAJA13),
      H(-18, 'baja', 'Carolina Castillo', 'Obsoleto: ' + TXT_BAJA13)
    ]), { bajaPedida: { motivo: 'obsoleto', nota: TXT_BAJA13, por: 'Fabián Barbosa', porRol: 'equipos', en: dias(-20) }, bajaPor: 'Carolina Castillo', bajaEn: dias(-18),
      fechaCompra: dias(-1500), garantiaHasta: dias(-1100), proveedor: PROV[0], costo: 2100000 });

    // ---------- ACTAS (virtuales, como la hoja «Entrega de equipos y herramientas») ----------
    // Las llena el Encargado con la persona, que firma en la pantalla; la devolución se anota en la misma acta.
    // Le llegan a Soporte para revisarlas. Las firmas son garabatos inventados.
    const FIRMAS = ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAAB4AQAAAAD3P1VXAAADFklEQVR42u1YsY7TQBB9u2fJqS4W1RURccEHUAbp0FkI6Vo+gU+4kuKkM6K5AglKSiSa+wsc7iSuQnwBJOQkKJCwIwoHfDsUM3Z27U3QlSBvkfXGz+M3M29mN1GEGwyNHt2je3SP7tH/F/rbVrRJnRvFaCv6dyYXOX+a7UxmMr8CAKjPPnpUj3zIswmJiOg8p+6wbJc8LYXwIN3GpDgW2sz/Atk2JtMpz08LIiIKqzGvU4vJGn0+5zlk9NCwHwYnPt4XEQDgehACAEWKv/61IYIhAKC6W6+fcEpN5kOfSsKTIAVgYlQAgIXXdn06eNMELgEABF60iYIUAJ5DZ4y9DQC4VDMPuop5jmSZblcsv5hi1MaGAICXXnTZNSbfHHnQufBd3x7Iu3y2567dFRBkNkUX/U5Ck3QIlR500HiHiXXLfVq3UlmPJZqnRx7FDonGRFQS0XsiWlCzXnQ1SJETKjuCLSYrAHaFj6ziXwG7Ht6xa+XKaRc2OkiBKmni3IyJ1Ta6nW3i0dGDukoctC2TXQCX4nzgeKsB6GzNb+l6a/a8TFQrDZbzQdZBf2lFsS6MpNt9xkTPiGguOSwljwVfmnEnl4EUy5WHTd5hciqpFo4Uc4NZiUs22i4Wz3jStk0R2PlTzq1JmN3SrQhBG9kdyCfCfeC7hZ6wqHSrnWhx+jrCJ8d2lQBQOYwjRXE5LmuY7lQqoDOWohK5jI9xYaFH+Jgyz8rJXS3X+7UHXNh0KJItHXGl0tfik4GFprXUUqyLvUniXhZZ6Og4FokWTqEl0teCD7GFHpzVdF870ShFlfqnrcFKukpR7hAR0Qvi/WxRHfCN2YmlQb1TJ3jfyaWRENHIjom6A2cfZtkAVKbAXKnGmrabYChteSJ8oyOl1AERwaoC4JGvF02TQLV+BzsbXPCQszOq7inggK7DjacCIqr4aJJCcWzM4ebzCaD3UCil6OsP3odV+9DhbrWpCgnAMufdD2ebmMwA0FvJ0pT8o/E6j6xt5Fb1l9OjBUY4utFZ8/EGtPL9D2H0TdD92b5H9+ge/U+j/wARzwHUvuhttwAAAABJRU5ErkJggg==',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAAB4AQAAAAD3P1VXAAACzElEQVR42u2YsW7bMBCGf8pCrQKF7aFAPRi10b5ARg8FrAfoQ/QRsnRNmKBAs8UP0QdRiwL12EeQCz+A7MkGFF6Hn5JISk7aoegiLgrJ747H492RjhL8RYvQ0z3d0z3d0z39P+gP3njGT3iHiW1mLE7Lhvzi2h2VliUpVZ86Vde0OXJ+AwAYFxoAzFXWTZdWiErXLx7f5fEdhS40xzMAKPU5n1zx8x4AsHjCg3sCx9sMgEABAE4q76Z/jQEARdXP/+QstyoHYOhHHM7RcaIB4FvVv3SgvEVvrJCna0ehLy16Qu4Ol47n7Nk86DBO5mbFaLkXkaPIDxER9mQ6DuPEeniCJWD9BwBLABjuY98SAZ1hvU5pmQTbjPzYa1oJwFhNi1lAG/qsTDFz/FwFwKAMdOvKBNtGjWz7dEq7IY1RM2llTRrS1gv76lTcBdu6jwgWHTayTZRHLeGhNzDq1H3ghDUhAWLdUWza1Sdu4sPKnlr0rolEHZrfqTuYyOoobtN2Yk1s3dil3QxydMeeCSp3hRxaUE1IqzJEmZtPEQDjFhyovBKqZHOPLusJ48Rtk8aJR8e1Uj84TMrBLNylVVpqFqC0yjGbfS4d5dRXr20Yw6XmoPbOGcXNJ2nidhn6ZeHpVlZ6yfC3WfW6SnoJzvLj+MHpGZogjKbSTfCIJT4CgBkr7IJLTLxdOHSa2uEYAMYUSvSBBjkXRAQAz9kXTY/rrVsEnTpA+g3/nmYJACRZRG/tuFIYsS+tN39mxL6Dp8CV9t2ZNjhOiNGwYsMgyZ2wci/mm7mIiAEL8OBeROQBCeYV4NHFimPzSrYAsPp85p63F/Caz4m3W/VKxOR3HW8IERGpXwwlgIuViIgZOY8Ln2bLASUiJe2K5o/QgN2kGCu7OmP3SSl1LVJ4ZXca1DG2rykGXT/unzm5qmogXzz9ClP9/wp6uqd7uqf/Gf0bp0nBKAiT+AMAAAAASUVORK5CYII=',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAAB4AQAAAAD3P1VXAAADNklEQVR42u2XsY7jVBSGPzsWcbFKIkACoUhxgQQPQDEVY/EizCOEfkUMWontdt9gRcdbYGCkmSeg9sAUFKtVMlvgLOb+FDc3Pk7sGbYDKa58x59P/nv+c871ROItrpgTfaJP9Ik+0f9Nunor+od76ejgbEhrgJfvPxDbS1ADwK8PKfES3vhFaQg3rLu+AGBl/vRXYRbaXSNJUvVakly60v6qz9v7EFszv2kH4GZlK6vuUeK8vN8AaD4G4M8cYFP16P4UgMSH+6ICWF8f+hXo5hyA6zEA36wBvn8MEC9bOgnJeGJCbKYAfFsBXKbHOVk3K0la1JL0i55JctONJE2vjnMS7W6SAig5A5gNenlHCSiz8vxiNu/JSWT2/pQ54HLaAIfOrwGXx61T4BM0OaZvg2flgVSXqy/2Y6ApdoIn7YK06KE/H+yY8oi+ZgFsiSpw+U5xUkBTJFVP7FlxEHIbkHUPbQ32Ju3eieoj+nmwZGkexeV+/4ex4xLu/G2xNwCA/N5Z1RCiAnehAgK9BWVEhy/dhptJX2yfqDNTNVFl3gl0m4DbXnfSw9guN9nYBsNCw3TouLxnUKb3zu+5TfsSSqt0RzcFnJkf94b1dlpUPXgo1J3Y230bTvaO+nTOIC55aehlsLC98tCQhR3L8d7frtTabDkK89HmZDKougrtE3t5rYnjME5cDpOwm2S4Bm2K5Pf11NBzroGxnTRzM1DagR/bg8h1qrzt0zdhHsUAKp73dKRf5MCXzsb+sPSPmtwU37b9uVmeGTr5Kdvr6xTkbvHoMjf0KDRq0Z/8uHs2vJAkd34jSQu9kLTR75K0aCRJTedsuOgkuuj2PzA67oYolJiZ78tuuVkvq8vWvjQUwyaK0uNzXtJiLElXbiWp1neSyoypAWTpZ1NJumo8PS5gcfXawkpsBc18hRSglEyC21ePhnreZQCu+TuK4q1TcfxVZunPADafpGNJo68zgMnPw99s+U0UffDHV41J25Nu6bdbKN5lIal+T5IaVpJUd1Jic/LjjXd5JEnOP6gXHTq2Q8G7nABEvmCTi0HdH9kx8U6nQAa+NYEq+9dfpqf/BE70iT7R/3/6H8WB1q/RBnFCAAAAAElFTkSuQmCC',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAAB4AQAAAAD3P1VXAAADBUlEQVR42u2Yu47TQBSGv/EakmKVBIkKRbsWvMAWFEFCYPEC8AiUlBHVFit5KpYK8gAUW1JCRwVBXJSWN/CiFDRI2UDhIK8PhZ14xp5Nsg0SkqfIxfl8/M+5zVGUcInl0dAN3dAN3dD/hpZL0X/0pZSML/i8eri5Zl0REYlERNJ9qa2K7QTgfAww3ajk1xHAbwBOhxt1hwDfYoCrG21PA4CvAEw2+6QD0M41DDbRub0RAL1tIz8A0EZwz530CECC/EsfyPLfp9qmc6/RKqMWGJkTVGz/rFrNVzrTgOyObToOV0QWmv45ATio2PYmFT8W9/gzIHsQ2/SXIyALfb30Rr4WO4krB1ufRCSN0kgkkUREUklE5EyORSSRrpWD0t6r+Dw1M4dDW0mvLLKFcc+cvnmloLOgB6TaGwP4Ghb4hv67Fp3SXlOS82qehGUZzs0ULt73bFr7NcW5qg4wXWLecmdeDKBimBacua5v1asmxWvboueoGqliOysLOpc7dO+vVjumY4cwKayil0U3qnhwugyxuWZO27kLEvfTfb0qkpXticsbA4Mr6Vxmf1nuPbCbWhau6RB2wliR8nJHjGp6RtAvrKa6brtTKfcLz4ZBdTcDq7ctbDrNgHalVUFWxt+k98qu1LFaVa54XumaaehS2XLr7iaAr0sN5l6HRog9gLbWyxOvtcV5+RYgNiOXheDrBTAwwuAB+DHgzcoId1bNx2HbuwqO4lnuYWTTKgA4THVZGYmuNotSd2x2Pg0tZmVCGYHO6dcA98x2qSr5Y9KPAPYXRoJ+d6W3md89bZTXGFDxtBIB3zg/Tl44ritzIjJsq6eAivP8fA7AHaWidMdpO+8Rs9UxqQgP3sD5K/fJfXvVRbz315SK5GEIeI8vmpRE5PhUBPQHEZGX3fWTEqS3lIqyd2P3wGffDEFLRKQnIiKf99fYVkpF8jEAOMOaBlw+iTSw88NQFa6ZZjTAbg/gmTt7/eqFtvH0m/e3m5GfuIfgGn0lLNvUjdpR1PzH0dAN3dD/Af0XgAJg75VLhSsAAAAASUVORK5CYII='];
    function acta(numero, n, persona, proyecto, codigo, ids, otros, revision, extra) {
      const eqs = ids.map(([id, obs]) => ({ id, serial: equipos[id].serial, tipo: equipos[id].tipo, marca: equipos[id].marca, modelo: equipos[id].modelo, cantidad: 1, obs: obs || '' }));
      return Object.assign({ numero, fecha: dias(n), persona, cedula: CED[persona], proyecto, codigoProyecto: codigo, equipos: eqs, otros: otros.map(([nombre, cantidad]) => ({ nombre, cantidad })),
        firmaPersona: FIRMAS[numero % FIRMAS.length], encargado: 'Fabián Barbosa', por: 'Fabián Barbosa', porRol: 'equipos', en: iso(n, 9, 15), devoluciones: [],
        revision, revisadaPor: revision === 'pendiente' ? '' : 'Ángel Ortiz', revisadaEn: revision === 'pendiente' ? '' : iso(n, 15, 0), notaRevision: '' }, extra || {});
    }
    const dev = (n, ids, persona, obs) => ({ fecha: dias(n), equipos: ids, firma: FIRMAS[(ids.length + n + 9) % FIRMAS.length], obs: obs || '', recibio: 'Fabián Barbosa', en: iso(n, 10, 30) });
    const hojas = {
      ac1: acta(1, -60, 'Jorge Ibarra', 'Proyecto Costa Norte', 'PCN-01', [['eq-001']], [['Cargador', 1], ['Mouse', 1], ['Morral', 1]], 'ok'),
      ac2: acta(2, -35, 'Liliana Torres', 'Proyecto Ruta Alta', 'PRA-02', [['eq-004', 'Con funda']], [['Cargador', 1]], 'ok'),
      ac3: acta(3, -25, 'Camilo Suárez', 'Proyecto Costa Norte', 'PCN-01', [['eq-005']], [['Cable USB', 1]], 'problema', { notaRevision: 'La cédula no coincide con la del contrato. Hay que corregirla.' }),
      ac4: acta(4, -130, 'Liliana Torres', 'Proyecto Ruta Alta', 'PRA-02', [['eq-010']], [['Cargador', 1], ['Mouse', 1]], 'pendiente', { devoluciones: [dev(-2, ['eq-010'], 'Liliana Torres', 'DEMO-0010: una tecla floja')] }),
      ac5: acta(5, -45, 'Jorge Ibarra', 'Proyecto Costa Norte', 'PCN-01', [['eq-011']], [['Cargador', 1]], 'pendiente', { devoluciones: [dev(-1, ['eq-011'], 'Jorge Ibarra', 'DEMO-0011: no carga bien')] }),
      // Las actas de entrega que faltaban para los equipos que ya están asignados (así «Recibir» siempre encuentra su acta abierta).
      ac7: acta(7, -150, 'Paola Ríos', 'Proyecto Costa Norte', 'PCN-01', [['eq-002']], [['Cargador', 1]], 'ok'),
      ac8: acta(8, -90, 'Andrés Mendoza', 'Proyecto Ruta Alta', 'PRA-02', [['eq-003']], [['Cargador', 1]], 'ok'),
      ac9: acta(9, -50, 'Oscar Farfán', 'Proyecto Costa Norte', 'PCN-01', [['eq-006']], [['Cargador', 1]], 'ok'),
      ac6: acta(6, -170, 'Andrés Mendoza', 'Proyecto Ruta Alta', 'PRA-02', [['eq-012']], [['Cargador', 1], ['Morral', 1], ['Diadema', 1]], 'pendiente', { devoluciones: [dev(0, ['eq-012'], 'Andrés Mendoza', 'DEMO-0012: pantalla con una raya y se calienta')] })
    };
    // ---------- AGENDA DE EQUIPOS (mantenimientos y backups que Soporte o la Jefe le programan al Encargado) ----------
    function tarea(equipoId, tipo, n, nota, pidio, pidioRol, estado, extra) {
      return Object.assign({ equipoId, serial: equipos[equipoId].serial, tipo, fecha: dias(n), nota, pidio, pidioRol, estado, hechaPor: '', hechaEn: '', resultado: '', en: iso(Math.min(n, 0) - 3, 10, 0) }, extra || {});
    }
    const tareasEq = {
      'ta-001': tarea('eq-002', 'mantenimiento', -3, 'La batería dura poco: revisarla y limpiar el equipo', 'Ángel Ortiz', 'soporte', 'pendiente'),
      'ta-002': tarea('eq-004', 'backup', 2, 'Copiar las fotos de las reuniones antes de que se llene', 'Carolina Castillo', 'jefe', 'pendiente'),
      'ta-003': tarea('eq-008', 'mantenimiento', -60, 'Limpiar el cabezal antes de guardarla', 'Ángel Ortiz', 'soporte', 'hecha', { hechaPor: 'Fabián Barbosa', hechaEn: iso(-60, 16, 0), resultado: 'Cabezal limpio y tanques revisados' })
    };

    // ---------- COMPRAS ----------
    // Rol de quien pide (sirve para que nadie autorice su propio pedido). Mismos nombres de personas.js.
    // Autorizal Coordinador de compras (Mauricio G.); lo que pide ella y lo que vale más de 5 millones lo autoriza el Gerente general (Oscar M.). Compra Fredy y recibe Andrés.
    const ROL_DE = { 'Oscar Muñoz': 'gerente', 'Carolina Castillo': 'jefe', 'Mauricio Giraldo': 'coordcompras', 'Fredy Torres': 'compras', 'Ángel Ortiz': 'soporte', 'Wilson Muñoz': 'carros', 'Oscar Farfán': 'conductor', 'Andrés Beltrán': 'asistente' };
    function compra(que, cantidad, unidad, categoria, valorAprox, paraQue, pide, autoriza, estado, extra) {
      return Object.assign({
        que, cantidad, unidad, categoria, valorAprox, paraQue, pide, pideRol: ROL_DE[pide] || '', autoriza, estado,
        proveedor: '', valorReal: 0, fechaPedido: '', fechaCompra: '', entregadoA: '', motivoRechazo: '', articuloId: '', factura: '', revisada: false, historial: []
      }, extra);
    }
    const compras = {
      'co-001': compra('Botas de seguridad', 10, 'pares', 'EPP', 850000, 'Para la cuadrilla de campo',
        'Andrés Beltrán', '', 'pedido', { fechaPedido: dias(-1), articuloId: 'ar-001' }),
      'co-002': compra('Mouse inalámbrico', 6, 'unidades', 'Accesorios', 180000, 'Para los portátiles de campo',
        'Carolina Castillo', '', 'pedido', { fechaPedido: dias(0), articuloId: 'ar-011' }),
      'co-003': compra('Resmas de papel carta', 8, 'resmas', 'Papelería', 224000, 'Para imprimir listas de asistencia',
        'Andrés Beltrán', 'Mauricio Giraldo', 'autorizado', { fechaPedido: dias(-4), articuloId: 'ar-013' }),
      'co-004': compra('Cámara web con micrófono', 2, 'unidades', 'Cómputo', 390000, 'Para reuniones con equipos remotos',
        'Mauricio Giraldo', 'Oscar Muñoz', 'rechazado',
        { fechaPedido: dias(-9), motivoRechazo: 'Ya hay cámaras en bodega, usa esas primero' }),
      'co-005': compra('Cables HDMI y adaptadores', 5, 'unidades', 'Accesorios', 140000, 'Para el proyector de las reuniones',
        'Andrés Beltrán', 'Mauricio Giraldo', 'comprado',
        { fechaPedido: dias(-12), proveedor: 'Ferretería El Faro', proveedorId: 'pv-elfaro', valorReal: 152000, fechaCompra: dias(-8), articuloId: 'ar-010' }),
      'co-006': compra('Memorias USB de 64 GB', 10, 'unidades', 'Cómputo', 320000, 'Para entregar copias a los líderes',
        'Mauricio Giraldo', 'Oscar Muñoz', 'comprado',
        { fechaPedido: dias(-7), proveedor: 'Papelería Central', proveedorId: 'pv-papcentral', valorReal: 305000, fechaCompra: dias(-3) }),
      'co-007': compra('Chalecos reflectivos', 12, 'unidades', 'EPP', 420000, 'Para la cuadrilla de campo',
        'Andrés Beltrán', 'Mauricio Giraldo', 'recibido',
        { fechaPedido: dias(-25), proveedor: 'Ferretería El Faro', proveedorId: 'pv-elfaro', valorReal: 438000, fechaCompra: dias(-20), entregadoA: 'Jorge Ibarra', articuloId: 'ar-003' }),
      'co-008': compra('Garrafones de agua', 6, 'unidades', 'Refrigerios', 90000, 'Para la reunión de la semana pasada',
        'Un compañero (sin identificar)', '', 'sin-autorizar',
        { fechaPedido: dias(-5), proveedor: 'Distribuidora Agua Clara', proveedorId: 'pv-aguaclara', valorReal: 96000, fechaCompra: dias(-5) }),
      // Vale más de 5 millones: la Coordinadora ya la autorizó y falta el Gerente general.
      'co-009': compra('Portátiles para el equipo de campo', 2, 'unidades', 'Cómputo', 6800000, 'Para los dos proyectos nuevos',
        'Ángel Ortiz', '', 'por-gerente', { fechaPedido: dias(-2), autorizaJefe: 'Mauricio Giraldo' }),
      // Compras de hace uno o varios meses (ya recibidas), para que cada proveedor tenga historial y se vea si los precios suben.
      'co-010': compra('Chalecos reflectivos', 12, 'unidades', 'EPP', 380000, 'Para la cuadrilla de campo',
        'Andrés Beltrán', 'Mauricio Giraldo', 'recibido', { fechaPedido: dias(-75), proveedor: 'Ferretería El Faro', proveedorId: 'pv-elfaro', valorReal: 396000, fechaCompra: dias(-70), entregadoA: 'Camilo Suárez' }),
      'co-011': compra('Cables HDMI y adaptadores', 5, 'unidades', 'Accesorios', 120000, 'Para el proyector de las reuniones',
        'Andrés Beltrán', 'Mauricio Giraldo', 'recibido', { fechaPedido: dias(-104), proveedor: 'Ferretería El Faro', proveedorId: 'pv-elfaro', valorReal: 130000, fechaCompra: dias(-100), entregadoA: 'Andrés Beltrán' }),
      'co-012': compra('Resmas de papel carta', 8, 'resmas', 'Papelería', 210000, 'Para imprimir listas de asistencia',
        'Andrés Beltrán', 'Mauricio Giraldo', 'recibido', { fechaPedido: dias(-48), proveedor: 'Papelería Central', proveedorId: 'pv-papcentral', valorReal: 216000, fechaCompra: dias(-45), entregadoA: 'Paola Ríos' }),
      'co-013': compra('Mouse inalámbrico', 6, 'unidades', 'Accesorios', 170000, 'Para los portátiles de campo',
        'Carolina Castillo', 'Oscar Muñoz', 'recibido', { fechaPedido: dias(-84), proveedor: 'Tecnoventas Ejemplo S. A. S.', proveedorId: 'pv-tecnoventas', valorReal: 177000, fechaCompra: dias(-80), entregadoA: 'Jorge Ibarra' }),
      'co-014': compra('Teclados USB', 5, 'unidades', 'Accesorios', 210000, 'Para reponer los que se dañaron',
        'Ángel Ortiz', 'Mauricio Giraldo', 'recibido', { fechaPedido: dias(-44), proveedor: 'Equipos del Caribe Ejemplo', proveedorId: 'pv-eqcaribe', valorReal: 225000, fechaCompra: dias(-40), entregadoA: 'Ángel Ortiz' })
    };
    // ---------- PROVEEDORES (todo inventado: NIT con su dígito de verificación bien calculado, teléfonos y correos de ejemplo) ----------
    const proveedores = {
      'pv-elfaro': { nombre: 'Ferretería El Faro', nit: '900000001-2', contacto: 'Marta Ejemplo', telefono: '300 000 0001', correo: 'ventas.elfaro@example.com', nota: 'Entrega en 2 días. Fía a 30 días.' },
      'pv-papcentral': { nombre: 'Papelería Central', nit: '900000003-7', contacto: 'Luis Ejemplo', telefono: '300 000 0003', correo: 'pedidos.papeleriacentral@example.com', nota: 'Descuento si se compran más de 5 resmas.' },
      'pv-aguaclara': { nombre: 'Distribuidora Agua Clara', nit: '', contacto: 'Rosa Ejemplo', telefono: '300 000 0005', correo: '', nota: 'Reparte los martes y los viernes. Todavía sin NIT anotado.' },
      'pv-tecnoventas': { nombre: 'Tecnoventas Ejemplo S. A. S.', nit: '900000011-6', contacto: 'Carlos Ejemplo', telefono: '300 000 0007', correo: 'comercial.tecnoventas@example.com', nota: 'Da garantía de un año en los equipos.' },
      'pv-eqcaribe': { nombre: 'Equipos del Caribe Ejemplo', nit: '900000009-0', contacto: '', telefono: '300 000 0009', correo: '', nota: '' }
    };
    Object.values(proveedores).forEach(v => Object.assign(v, { por: 'Fredy Torres', porRol: 'compras', en: dias(-110) }));
    // Historial de cada compra (cómo va), armado según su estado. Las horas son de oficina y nunca quedan en el futuro.
    const desfase = f => Math.round((new Date(f + 'T12:00:00') - new Date(dias(0) + 'T12:00:00')) / 86400000);
    Object.values(compras).forEach(c => {
      const h = [];
      const paso = (fecha, hora, texto, por) => h.push({ fecha: iso(desfase(fecha), hora, 0), texto, por });
      if (c.estado === 'sin-autorizar') paso(c.fechaCompra, 10, `Compró en ${c.proveedor} sin pedir autorización`, c.pide);
      else paso(c.fechaPedido, 9, 'Pidió la compra', c.pide);
      if (c.estado === 'por-gerente') paso(c.fechaPedido, 15, 'Autorizó y la pasó al Gerente general (vale más de 5.000.000)', c.autorizaJefe);
      if (['autorizado', 'comprado', 'recibido'].includes(c.estado)) paso(c.fechaPedido, 15, 'Autorizó la compra', c.autoriza);
      if (c.estado === 'rechazado') paso(c.fechaPedido, 16, `Rechazó la compra: ${c.motivoRechazo}`, c.autoriza);
      if (['comprado', 'recibido'].includes(c.estado)) paso(c.fechaCompra, 11, `Compró en ${c.proveedor}`, 'Fredy Torres');
      if (c.estado === 'recibido') paso(c.fechaCompra, 16, c.articuloId ? 'Recibido en bodega' : `Entregado a ${c.entregadoA}`, 'Andrés Beltrán');
      c.historial = h;
    });

    // ---------- ARTÍCULOS DE BODEGA ----------
    function articulo(nombre, categoria, unidad, cantidad, minimo, maximo, ubicacion, costo, proveedor, bodega) {
      return { nombre, categoria, unidad, cantidad, minimo, maximo, ubicacion, costo, proveedor, bodega };
    }
    const articulos = {
      'ar-001': articulo('Botas de seguridad talla 40', 'EPP', 'pares', 0, 4, 16, 'Estante A1', 85000, 'Ferretería El Faro', 'Riohacha'),
      'ar-002': articulo('Botas de seguridad talla 42', 'EPP', 'pares', 6, 4, 16, 'Estante A1', 85000, 'Ferretería El Faro', 'Riohacha'),
      'ar-003': articulo('Chalecos reflectivos', 'EPP', 'unidades', 15, 5, 25, 'Estante A2', 35000, 'Ferretería El Faro', 'Riohacha'),
      'ar-004': articulo('Guantes de vaqueta', 'EPP', 'pares', 10, 6, 30, 'Estante A2', 12000, 'Ferretería El Faro', 'Riohacha'),
      'ar-005': articulo('Cascos de seguridad', 'EPP', 'unidades', 9, 4, 15, 'Estante A3', 28000, 'Ferretería El Faro', 'Riohacha'),
      'ar-006': articulo('Tapabocas', 'EPP', 'cajas', 7, 3, 12, 'Estante A3', 18000, 'Distribuidora Costa Salud', 'Riohacha'),
      'ar-007': articulo('Extensión eléctrica de 5 m', 'Eléctricos', 'unidades', 8, 3, 12, 'Estante B1', 32000, 'Tecnoguajira Suministros', 'Riohacha'),
      'ar-008': articulo('Multitoma de 6 puestos', 'Eléctricos', 'unidades', 5, 2, 10, 'Estante B1', 25000, 'Tecnoguajira Suministros', 'Riohacha'),
      'ar-009': articulo('Cinta aislante', 'Eléctricos', 'rollos', 12, 5, 30, 'Estante B2', 4000, 'Tecnoguajira Suministros', 'Riohacha'),
      'ar-010': articulo('Cable HDMI de 2 m', 'Cómputo', 'unidades', 2, 3, 10, 'Estante C1', 28000, 'Tecnoguajira Suministros', 'Riohacha'),
      'ar-011': articulo('Mouse inalámbrico', 'Cómputo', 'unidades', 7, 3, 15, 'Estante C1', 30000, 'Tecnoguajira Suministros', 'Riohacha'),
      'ar-012': articulo('Tóner para impresora', 'Papelería', 'unidades', 1, 2, 6, 'Estante C2', 185000, 'Papelería Central', 'Riohacha'),
      'ar-013': articulo('Resmas de papel carta', 'Papelería', 'resmas', 3, 5, 20, 'Estante C3', 28000, 'Papelería Central', 'Guamal'),
      'ar-014': articulo('Jabón líquido', 'Aseo', 'galones', 4, 2, 8, 'Estante D1', 22000, 'Distribuidora Agua Clara', 'Guamal'),
      'ar-015': articulo('Papel higiénico', 'Aseo', 'paquetes', 10, 4, 20, 'Estante D1', 24000, 'Distribuidora Agua Clara', 'Guamal'),
      'ar-016': articulo('Café molido', 'Cafetería', 'paquetes', 0, 4, 12, 'Estante D2', 16000, 'Distribuidora Agua Clara', 'Bogotá'),
      'ar-017': articulo('Vasos desechables', 'Cafetería', 'paquetes', 8, 3, 15, 'Estante D2', 7000, 'Distribuidora Agua Clara', 'Bogotá'),
      'ar-018': articulo('Linterna recargable', 'Herramientas', 'unidades', 5, 2, 8, 'Estante E1', 38000, 'Ferretería El Faro', 'Bogotá'),
      // Las mismas botas talla 40 que están agotadas en Riohacha, pero en la bodega de Bogotá (para ver «entregar desde otra bodega»), y tapabocas en Guamal (llegaron por traslado).
      'ar-019': articulo('Botas de seguridad talla 40', 'EPP', 'pares', 10, 4, 16, 'Estante A1', 85000, 'Ferretería El Faro', 'Bogotá'),
      'ar-020': articulo('Tapabocas', 'EPP', 'cajas', 2, 1, 6, 'Estante D3', 18000, 'Distribuidora Costa Salud', 'Guamal')
    };

    // Códigos de ejemplo (inventados; algunos artículos no tienen, porque es opcional) y fecha del último conteo (días atrás).
    // Con eso la tarjeta «Te toca contar hoy» muestra algunos artículos al día y otros que ya les toca.
    const CODIGOS = { 'ar-001': 'BOT040', 'ar-002': 'BOT042', 'ar-003': 'CHA001', 'ar-004': 'GUA001', 'ar-005': 'CAS001', 'ar-006': 'TAP001', 'ar-007': 'EXT005', 'ar-008': 'MUL006', 'ar-009': 'CIN001',
      'ar-010': 'HDM002', 'ar-011': 'MOU001', 'ar-012': 'TON001', 'ar-013': '7700000000013' };
    Object.entries(CODIGOS).forEach(([id, c]) => { articulos[id].codigo = c; });
    const CONTEOS = { 'ar-001': -45, 'ar-002': -200, 'ar-003': -100, 'ar-004': -20, 'ar-005': -3, 'ar-006': -30, 'ar-007': -30, 'ar-008': -30, 'ar-009': -30, 'ar-010': -190, 'ar-011': -30,
      'ar-013': -10, 'ar-014': -60, 'ar-015': -30, 'ar-016': -30, 'ar-017': -30, 'ar-018': -30, 'ar-019': -30, 'ar-020': -30 };
    Object.entries(CONTEOS).forEach(([id, n]) => { articulos[id].ultimoConteo = dias(n); });

    // ---------- MOVIMIENTOS DE BODEGA ----------
    const MOTIVO_SO7 = 'En Guamal no hay linternas: se mandó desde Bogotá';
    // El saldo de cada movimiento es la cantidad del artículo justo después de registrarlo.
    function mov(articuloId, tipo, motivo, cantidad, saldo, persona, proyecto, fecha, nota, extra) {
      return Object.assign({
        articuloId, articulo: articulos[articuloId].nombre, tipo, motivo, cantidad, saldo, persona, proyecto,
        por: 'Andrés Beltrán', porRol: 'asistente', fecha, nota, compraId: '', solicitudId: '',
        // Cada movimiento guarda la bodega cuya cantidad cambió (la de su artículo).
        bodega: articulos[articuloId].bodega,
        // Kárdex con plata: cada unidad al costo del artículo (la demo no tiene historia de precios).
        costoUnit: articulos[articuloId].costo, valor: Math.abs(cantidad) * articulos[articuloId].costo, valorSaldo: saldo * articulos[articuloId].costo
      }, extra);
    }
    const movimientos = {
      'mo-001': mov('ar-001', 'entrada', 'inicial', 6, 6, '', '', iso(-28, 8, 30), 'Existencias al empezar el inventario'),
      'mo-002': mov('ar-003', 'entrada', 'inicial', 5, 5, '', '', iso(-28, 8, 40), 'Existencias al empezar el inventario'),
      'mo-003': mov('ar-004', 'entrada', 'inicial', 14, 14, '', '', iso(-28, 8, 50), 'Existencias al empezar el inventario'),
      'mo-004': mov('ar-005', 'entrada', 'inicial', 10, 10, '', '', iso(-28, 9, 0), 'Existencias al empezar el inventario'),
      'mo-005': mov('ar-013', 'entrada', 'inicial', 10, 10, '', '', iso(-28, 9, 10), 'Existencias al empezar el inventario'),
      'mo-006': mov('ar-014', 'entrada', 'inicial', 6, 6, '', '', iso(-28, 9, 20), 'Existencias al empezar el inventario'),
      'mo-007': mov('ar-003', 'entrada', 'compra', 12, 17, 'Ferretería El Faro', '', iso(-18, 10, 15), 'Llegó la compra de chalecos',
        { compraId: 'co-007' }),
      'mo-008': mov('ar-003', 'salida', 'entrega', 2, 15, 'Jorge Ibarra', 'Proyecto Costa Norte', iso(-14, 14, 0), 'Para el trabajo de campo'),
      'mo-009': mov('ar-014', 'salida', 'dano', 2, 4, '', '', iso(-12, 11, 30), 'Los galones llegaron con el empaque roto'),
      'mo-010': mov('ar-013', 'salida', 'entrega', 7, 3, 'Paola Ríos', 'Proyecto Costa Norte', iso(-10, 9, 45), 'Para imprimir las listas de asistencia'),
      'mo-011': mov('ar-001', 'salida', 'entrega', 6, 0, 'Andrés Mendoza', 'Proyecto Ruta Alta', iso(-9, 15, 10), 'Botas para la cuadrilla de la ruta alta'),
      'mo-012': mov('ar-004', 'salida', 'entrega', 4, 10, 'Jorge Ibarra', 'Proyecto Costa Norte', iso(-6, 10, 0), 'Guantes para el trabajo de campo',
        { solicitudId: 'so-004' }),
      'mo-013': mov('ar-005', 'ajuste', 'conteo', -1, 9, '', '', iso(-3, 16, 20), 'Conteo físico: faltaba un casco en el estante'),
      // Un pedido para Guamal que se atendió con una linterna de Bogotá: la salida queda en la bodega que la tenía.
      // Es de hace 95 días a propósito: así queda fuera de los 90 días de la clase ABC y no la cambia.
      'mo-014': mov('ar-018', 'salida', 'entrega', 1, 5, 'Julio Flórez', 'Proyecto Costa Norte', iso(-95, 10, 20), 'Pedido para Guamal: salió de Bogotá',
        { solicitudId: 'so-007', bodega: 'Bogotá', bodegaPedida: 'Guamal', motivoBodega: MOTIVO_SO7 }),
      // Traslado de 2 cajas de tapabocas de Riohacha a Guamal (cada bodega con su movimiento).
      'mo-015': mov('ar-006', 'salida', 'traslado', 2, 7, '', '', iso(-20, 9, 30), 'Traslado a Guamal: para la sede de Guamal',
        { trasladoId: 'tr-demo1', bodega: 'Riohacha', bodegaOtra: 'Guamal' }),
      'mo-016': mov('ar-020', 'entrada', 'traslado', 2, 2, '', '', iso(-20, 9, 30), 'Traslado desde Riohacha: para la sede de Guamal',
        { trasladoId: 'tr-demo1', bodega: 'Guamal', bodegaOtra: 'Riohacha' })
    };

    // ---------- SOLICITUDES DE MATERIAL ----------
    function solicitud(articuloId, cantidad, pide, pideRol, paraQue, proyecto, estado, fecha, extra) {
      return Object.assign({
        articuloId, articulo: articulos[articuloId].nombre, cantidad, pide, pideRol, paraQue, proyecto, estado, fecha,
        // Para qué bodega se pidió (la de su artículo, salvo que se diga otra).
        bodega: articulos[articuloId].bodega,
        entregadaPor: '', fechaEntrega: '', motivo: ''
      }, extra);
    }
    const solicitudes = {
      'so-001': solicitud('ar-003', 2, 'Oscar Farfán', 'conductor', 'Para el viaje a la Comunidad Ejemplo Norte',
        'Proyecto Costa Norte', 'pendiente', iso(-1, 16, 30)),
      'so-002': solicitud('ar-018', 1, 'Wilson Muñoz', 'carros', 'Para revisar los carros de noche',
        'Proyecto Costa Norte', 'pendiente', iso(-1, 17, 5)),
      'so-003': solicitud('ar-002', 8, 'Jorge Ibarra', '', 'Botas para la cuadrilla nueva de campo',
        'Proyecto Costa Norte', 'pendiente', iso(-3, 9, 20)),
      'so-004': solicitud('ar-004', 4, 'Jorge Ibarra', '', 'Guantes para el trabajo de campo',
        'Proyecto Costa Norte', 'entregada', iso(-7, 15, 0), { entregadaPor: 'Andrés Beltrán', fechaEntrega: iso(-6, 10, 0) }),
      'so-005': solicitud('ar-017', 20, 'Andrés Mendoza', '', 'Para una reunión con la comunidad',
        'Proyecto Ruta Alta', 'rechazada', iso(-4, 11, 15), { motivo: 'Es mucho para una sola reunión, pide máximo 5 paquetes' }),
      // Botas talla 40 para Riohacha: allá están agotadas y en Bogotá hay 10 (se puede entregar desde Bogotá con su motivo).
      'so-006': solicitud('ar-001', 4, 'Elkin Bruno', 'logistica', 'Botas para el personal de logística',
        'Proyecto Costa Norte', 'pendiente', iso(-1, 10, 40), { bodega: 'Riohacha' }),
      // Pedido para Guamal que se entregó desde Bogotá (la linterna de Bogotá, ar-018). Su movimiento es mo-014.
      'so-007': solicitud('ar-018', 1, 'Julio Flórez', 'logistica', 'Linterna para el trabajo de noche en Guamal',
        'Proyecto Costa Norte', 'entregada', iso(-96, 9, 0), { bodega: 'Guamal', entregadaPor: 'Andrés Beltrán', fechaEntrega: iso(-95, 10, 20),
          bodegaSurte: 'Bogotá', articuloSurteId: 'ar-018', motivoBodega: MOTIVO_SO7 })
    };

    // ---------- VEHÍCULOS ----------
    // Cada carro tiene su hoja de vida aquí; las novedades y las entregas (salida y llegada) van aparte, con sus fotos.
    // Plan de mantenimiento de ejemplo: { id, tarea, cadaKm, cadaDias, ultimoKm, ultimaFecha (días atrás), ultimoCosto }.
    // «hechos» guarda cada vez que se hizo con su costo (así se suma lo gastado en un periodo).
    const mtto = (id, tarea, cadaKm, cadaDias, ultimoKm, haceDias, ultimoCosto) => ({ id, tarea, cadaKm, cadaDias, ultimoKm, ultimaFecha: dias(haceDias), ultimoCosto,
      hechos: ultimoCosto ? [{ fecha: dias(haceDias), km: ultimoKm, costo: ultimoCosto }] : [] });
    // Líneas del historial de cada carro, con el mismo texto que escribe la app al hacer cada cosa.
    const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
    const fCorta = f => { const [y, m, d] = f.split('-').map(Number); return d + ' ' + MES_CORTO[m - 1] + (y !== base.getFullYear() ? ' ' + y : ''); };
    const kmTxt = n => n.toLocaleString('es-CO') + ' km';
    const copTxt = n => '$ ' + n.toLocaleString('es-CO');
    const hMtto = (tarea, km, haceDias, costo, por) => ({ fecha: iso(-haceDias, 11, 0), texto: `Mantenimiento hecho: ${tarea} (${kmTxt(km)}, ${fCorta(dias(-haceDias))}, costó ${copTxt(costo)})`, por });
    const hDocs = (haceDias, soat, tecno, por) => ({ fecha: iso(-haceDias, 9, 30), texto: `Actualizó los documentos (SOAT ${fCorta(soat)}, técnico-mecánica ${fCorta(tecno)})`, por });
    const hAsigna = (haceDias, cond, por) => ({ fecha: iso(-haceDias, 8, 15), texto: `Asignado a ${cond}`, por });
    const vehiculos = {
      've-abc123': { placa: 'ABC 123', marca: 'Toyota', modelo: 'Hilux', anio: 2022, color: 'Blanco', conductor: 'Oscar Farfán', km: 45210,
        soat: dias(12), tecno: dias(200), estado: 'en-uso', historial: [
          hMtto('Alineación y balanceo', 38000, 200, 120000, 'Wilson Muñoz'), hMtto('Cambio de aceite', 40300, 70, 190000, 'Wilson Muñoz'), hAsigna(60, 'Oscar Farfán', 'Wilson Muñoz'),
          { fecha: iso(-1, 6, 40), texto: 'Salió con Oscar Farfán (45.180 km)', por: 'Oscar Farfán' }],
        mttos: [mtto('mt-aceite', 'Cambio de aceite', 5000, 180, 40300, -70, 190000), mtto('mt-alin', 'Alineación y balanceo', 10000, 365, 38000, -200, 120000)] },
      've-def456': { placa: 'DEF 456', marca: 'Chevrolet', modelo: 'D-Max', anio: 2021, color: 'Gris', conductor: '', km: 62800,
        soat: dias(150), tecno: dias(-5), estado: 'disponible', historial: [hMtto('Cambio de aceite', 57500, 150, 185000, 'Wilson Muñoz')],
        mttos: [mtto('mt-aceite', 'Cambio de aceite', 5000, 180, 57500, -150, 185000)] },
      've-ghi789': { placa: 'GHI 789', marca: 'Mitsubishi', modelo: 'L200', anio: 2020, color: 'Rojo', conductor: '', km: 88450,
        soat: dias(90), tecno: dias(120), estado: 'en-taller', historial: [hMtto('Pastillas de freno', 70000, 8, 260000, 'Wilson Muñoz'), { fecha: iso(-8, 9, 0), texto: 'Entró al taller por mantenimiento', por: 'Wilson Muñoz' }],
        mttos: [mtto('mt-pastillas', 'Pastillas de freno', 30000, 540, 70000, -8, 260000)] },
      've-jkl012': { placa: 'JKL 012', marca: 'Toyota', modelo: 'Fortuner', anio: 2023, color: 'Plata', conductor: '', km: 21340,
        soat: dias(240), tecno: dias(300), estado: 'disponible',
        historial: [hDocs(125, dias(240), dias(300), 'Wilson Muñoz'), hMtto('Revisión de los 10.000 km', 15000, 20, 150000, 'Wilson Muñoz')],
        mttos: [mtto('mt-revision', 'Revisión de los 10.000 km', 10000, 180, 15000, -20, 150000)] }
    };
    // ---------- RESERVAS DE CARRO (viajes que no son reuniones; todo inventado) ----------
    // Una por aprobar (la pidió el Conductor), una aprobada para hoy (el Conductor la ve en «Lo que me toca» y registra la salida) y una rechazada.
    const correoDe = (rol, nombre) => { const p = window.DEMO.PERSONAS.find(x => x.rol === rol && x.nombre === nombre); return p ? p.correo : ''; };
    const reservas = {
      'rs-001': { fecha: dias(1), hora: '07:30', destino: 'Maicao: llevar los contratos firmados', motivo: 'Hay que entregarlos antes del mediodía', estado: 'pedida',
        por: 'Oscar Farfán', porRol: 'conductor', pideCorreo: correoDe('conductor', 'Oscar Farfán'), en: dias(0) },
      'rs-002': { fecha: dias(0), hora: '14:00', destino: 'Riohacha: recoger material en el proveedor', motivo: 'Recoger los chalecos y los cables que ya se pagaron', estado: 'aprobada',
        por: 'Andrés Beltrán', porRol: 'asistente', pideCorreo: correoDe('asistente', 'Andrés Beltrán'), en: dias(-1),
        vehiculoId: 've-jkl012', placa: 'JKL 012', conductor: 'Oscar Farfán', decidePor: 'Wilson Muñoz', decideCorreo: correoDe('carros', 'Wilson Muñoz'), decideEn: dias(-1) },
      'rs-003': { fecha: dias(3), hora: '09:00', destino: 'Uribia: visita al proveedor del agua', motivo: 'Conocer el lugar de donde reparten', estado: 'rechazada',
        por: 'Oscar Farfán', porRol: 'conductor', pideCorreo: correoDe('conductor', 'Oscar Farfán'), en: dias(-2),
        motivoRechazo: 'Ese día no hay carro libre con los papeles al día', decidePor: 'Andrés Beltrán', decideCorreo: correoDe('asistente', 'Andrés Beltrán'), decideEn: dias(-1) }
    };
    // Foto de ejemplo (pequeña e inventada) para las novedades y entregas de muestra.
    const FOTO = 'data:image/jpeg;base64,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';
    const novedades = {
      'no-001': { vehiculoId: 've-abc123', placa: 'ABC 123', tipo: 'rayon', fecha: iso(-2, 17, 50), km: 45150, descripcion: 'Rayón en la puerta derecha, cerca de la manija',
        foto: FOTO, reporta: 'Oscar Farfán', reportaRol: 'conductor', costo: 0, revisada: false, revisadaPor: '', revisadaEn: '', nota: '' },
      'no-002': { vehiculoId: 've-ghi789', placa: 'GHI 789', tipo: 'mantenimiento', fecha: iso(-8, 8, 30), km: 88200, descripcion: 'Cambio de aceite, filtros y revisión de frenos',
        foto: FOTO, reporta: 'Oscar Farfán', reportaRol: 'conductor', costo: 380000, revisada: true, revisadaPor: 'Wilson Muñoz', revisadaEn: iso(-8, 9, 0), nota: 'Se llevó al taller del convenio' },
      'no-003': { vehiculoId: 've-def456', placa: 'DEF 456', tipo: 'llanta', fecha: iso(-15, 14, 0), km: 62500, descripcion: 'Pinchazo en la llanta trasera izquierda',
        foto: FOTO, reporta: 'Oscar Farfán', reportaRol: 'conductor', costo: 45000, revisada: true, revisadaPor: 'Andrés Beltrán', revisadaEn: iso(-15, 16, 0), nota: 'Se despinchó en la vulcanizadora' }
    };
    const fotos5 = { frente: FOTO, atras: FOTO, izquierda: FOTO, derecha: FOTO, llantas: FOTO };
    const revisionOk = { luces: true, llantas: true, documentos: true, herramienta: true };
    const entregas = {
      'en-001': { vehiculoId: 've-def456', placa: 'DEF 456', tipo: 'salida', fecha: iso(-4, 6, 30), km: 62700, combustible: '3/4', conductor: 'Oscar Farfán', con: 'Andrés Beltrán',
        fotos: fotos5, revision: revisionOk, observaciones: '', por: 'Oscar Farfán', porRol: 'conductor', reunionId: '' },
      'en-002': { vehiculoId: 've-def456', placa: 'DEF 456', tipo: 'llegada', fecha: iso(-4, 18, 10), km: 62800, combustible: '1/4', conductor: 'Oscar Farfán', con: 'Andrés Beltrán',
        fotos: fotos5, revision: revisionOk, observaciones: 'Llegó con poco combustible', por: 'Oscar Farfán', porRol: 'conductor', reunionId: '' },
      'en-003': { vehiculoId: 've-abc123', placa: 'ABC 123', tipo: 'salida', fecha: iso(-1, 6, 40), km: 45180, combustible: 'lleno', conductor: 'Oscar Farfán', con: 'Wilson Muñoz',
        fotos: fotos5, revision: revisionOk, observaciones: '', por: 'Oscar Farfán', porRol: 'conductor', reunionId: '' }
    };

    // Tanqueos de ejemplo (valores inventados): [días atrás, hora, km, galones, tanque lleno]. El valor sale del precio del galón de cada carro.
    // El ABC 123 trae un último tanqueo con consumo raro (rindió mucho menos que lo normal) para ver el aviso.
    const tanqueos = {};
    const tanqueosDe = (veh, placa, precio, lista) => lista.forEach(([haceDias, hora, km, galones, lleno], i) => {
      tanqueos['ta-' + veh.slice(3, 6) + '-' + (i + 1)] = { vehiculoId: veh, placa, fecha: iso(-haceDias, hora, 10), km, galones, valor: Math.round(galones * (precio + (i % 3) * 150) / 100) * 100, lleno: lleno !== false,
        foto: FOTO, por: i % 4 === 3 ? 'Wilson Muñoz' : 'Oscar Farfán', porRol: i % 4 === 3 ? 'carros' : 'conductor' };
    });
    tanqueosDe('ve-abc123', 'ABC 123', 12900, [[52, 17, 43380, 18.0], [38, 16, 43900, 17.6], [24, 17, 44420, 17.4], [11, 17, 44930, 17.9], [1, 6, 45170, 15.0]]);
    tanqueosDe('ve-def456', 'DEF 456', 12950, [[48, 16, 61650, 20.5], [33, 17, 62100, 16.8], [26, 15, 62250, 8.0, false], [19, 17, 62430, 4.4], [4, 6, 62690, 9.8]]);
    tanqueosDe('ve-ghi789', 'GHI 789', 12900, [[40, 16, 87300, 21.2], [24, 17, 87800, 18.0], [9, 16, 88190, 14.2]]);
    tanqueosDe('ve-jkl012', 'JKL 012', 15500, [[44, 15, 20300, 22.5], [29, 16, 20720, 17.4], [15, 17, 21100, 15.5], [3, 16, 21340, 10.0]]);

    // ---------- REUNIONES ----------
    // La reunión guarda lo general; lo que le toca a cada rol va aparte en «necesidades» (una por tarea),
    // para que cada persona solo pueda cambiar la suya (lo piden las reglas).
    function correo(comunidad, fecha, hora, lugar) {
      return 'Asunto: Reunión con ' + comunidad + '\n\n' +
        'Buenos días.\n\n' +
        'Te confirmo la reunión con ' + comunidad + ' para el ' + fecha + ' a las ' + hora + ' en ' + lugar + '. ' +
        'Necesitamos carros para el equipo y comida para los asistentes. ' +
        'Por favor revisa lo que corresponde a tu área y avísame si falta algo.\n\n' +
        'Gracias.\n' +
        'Equipo de coordinación de reuniones';
    }
    function reunion(comunidad, n, hora, lugar, asistentes, estado, historial, extra) {
      return Object.assign({ comunidad, fecha: dias(n), hora, lugar, asistentes, jefe: 'Carolina Castillo', estado, faltan: [],
        proyecto: 'Proyecto Costa Norte', correo: correo(comunidad, dias(n), hora, lugar), historial, origen: 'correo' }, extra || {});
    }
    const reuniones = {
      're-001': reunion('Comunidad Ejemplo Norte', 6, '08:00', 'Salón comunal de Ejemplo Norte', 30, 'programada',
        [{ fecha: iso(-3, 9, 30), texto: 'Reunión creada desde el correo recibido', por: 'Agente' }, { fecha: iso(-3, 10, 5), texto: 'La Jefe la revisó y repartió las tareas', por: 'Carolina Castillo' }]),
      're-002': reunion('Comunidad Ejemplo Sur', 13, '09:30', 'Kiosco principal de Ejemplo Sur', 20, 'reprogramada',
        [{ fecha: iso(-6, 10, 0), texto: 'Reunión creada desde el correo recibido', por: 'Agente' },
          { fecha: iso(-1, 15, 20), texto: 'Cambió la fecha del ' + dias(9) + ' al ' + dias(13) + ' porque la comunidad pidió más tiempo', por: 'Carolina Castillo' }],
        { proyecto: 'Proyecto Ruta Alta' }),
      're-003': reunion('Comunidad Ejemplo Centro', -10, '10:00', 'Escuela de Ejemplo Centro', 15, 'realizada',
        [{ fecha: iso(-18, 8, 45), texto: 'Reunión creada desde el correo recibido', por: 'Agente' }, { fecha: iso(-10, 16, 0), texto: 'Acta registrada: 14 asistentes', por: 'Paola Martínez' }]),
      're-004': reunion('Comunidad Ejemplo Occidente', -1, '14:00', 'Cancha de Ejemplo Occidente', 25, 'programada',
        [{ fecha: iso(-7, 11, 0), texto: 'Reunión creada desde el correo recibido', por: 'Agente' }], { proyecto: 'Proyecto Ruta Alta' })
    };
    const ITEMS_LOG = ['Sonido y micrófono', 'Sillas', 'Mesas', 'Refrigerios recibidos'];
    const items = marcados => ITEMS_LOG.map((t, k) => ({ t, ok: marcados.includes(k) }));
    function nec(reunionId, tipo, detalle, cantidad, responsableRol, estado, extra) {
      const r = reuniones[reunionId];
      return Object.assign({ reunionId, comunidad: r.comunidad, fechaReunion: r.fecha, tipo, detalle, cantidad, responsableRol, estado,
        por: '', en: '', motivo: '', conductor: '', items: [], acta: null, informes: [], vehiculos: [], vehiculoId: '', placa: '' }, extra || {});
    }
    // La asistencia y el viaje son por persona: llevan el correo (de prueba) de a quién le toca.
    const deProf = nombre => { const p = window.DEMO.PERSONAS.find(x => x.rol === 'profesional' && x.nombre === nombre); return p ? { responsableCorreo: p.correo, responsableNombre: p.nombre } : {}; };
    const deCond = nombre => { const p = window.DEMO.PERSONAS.find(x => x.rol === 'conductor' && x.nombre === nombre); return p ? { responsableCorreo: p.correo, responsableNombre: p.nombre } : {}; };
    const hecho = (por, n, h) => ({ por, en: iso(n, h, 0) });
    // Lo que informan Compras, Transporte o Bodega para que la Jefe decida.
    const inf = (rol, por, texto, n, h) => ({ rol, por, texto, en: iso(n, h, 0) });
    const necesidades = {
      'ne-001': nec('re-001', 'carros', 'Dos camionetas para el equipo de campo', 2, 'jefe', 'autorizado', Object.assign({ conductor: 'Oscar Farfán, Rafael Ospino',
        vehiculos: [{ vehiculoId: 've-abc123', placa: 'ABC 123', conductor: 'Oscar Farfán' }, { vehiculoId: 've-jkl012', placa: 'JKL 012', conductor: 'Rafael Ospino' }],
        informes: [inf('carros', 'Wilson Muñoz', 'Están libres la ABC 123 y la DEF 456. Oscar puede manejar.', -2, 8)] }, hecho('Carolina Castillo', -2, 9))),
      'ne-002': nec('re-001', 'viaje', 'Llevar al equipo a la Comunidad Ejemplo Norte en el ABC 123', 1, 'conductor', 'pendiente', Object.assign({ conductor: 'Oscar Farfán', vehiculoId: 've-abc123', placa: 'ABC 123', carrosId: 'ne-001' }, deCond('Oscar Farfán'))),
      'ne-025': nec('re-001', 'viaje', 'Llevar al equipo a la Comunidad Ejemplo Norte en el JKL 012', 1, 'conductor', 'listo', Object.assign({ conductor: 'Rafael Ospino', vehiculoId: 've-jkl012', placa: 'JKL 012', carrosId: 'ne-001' }, hecho('Oscar Farfán', -1, 18))),
      'ne-003': nec('re-001', 'refrigerios', 'Refrigerios para 30 personas', 30, 'jefe', 'pendiente', { informes: [inf('asistente', 'Andrés Beltrán', 'En bodega hay 12 refrigerios; faltan 18 por comprar.', -1, 10)] }),
      'ne-004': nec('re-001', 'almuerzo', 'Almuerzo para 30 personas', 30, 'jefe', 'pendiente'),
      'ne-005': nec('re-001', 'logistica', 'Alistar el salón para 30 personas', 30, 'logistica', 'pendiente', { items: items([1]) }),
      'ne-006': nec('re-001', 'asistencia', 'Confirmar si vas a la reunión', 0, 'profesional', 'pendiente', deProf('Margaret Pulido')),
      'ne-007': nec('re-001', 'acta', 'Registrar el acta y el formato diario', 0, 'administrativo', 'pendiente'),
      'ne-008': nec('re-002', 'carros', 'Una camioneta para el equipo', 1, 'jefe', 'pendiente'),
      'ne-009': nec('re-002', 'refrigerios', 'Refrigerios para 20 personas', 20, 'jefe', 'pendiente'),
      'ne-010': nec('re-002', 'logistica', 'Alistar el kiosco para 20 personas', 20, 'logistica', 'pendiente', { items: items([]) }),
      'ne-011': nec('re-002', 'asistencia', 'Confirmar si vas a la reunión', 0, 'profesional', 'listo', Object.assign(deProf('Margaret Pulido'), hecho('Margaret Pulido', -1, 16))),
      'ne-012': nec('re-002', 'acta', 'Registrar el acta y el formato diario', 0, 'administrativo', 'pendiente'),
      'ne-013': nec('re-003', 'carros', 'Una camioneta para el equipo', 1, 'jefe', 'autorizado', Object.assign({ conductor: 'Oscar Farfán', vehiculos: [{ vehiculoId: 've-abc123', placa: 'ABC 123', conductor: 'Oscar Farfán' }] }, hecho('Carolina Castillo', -16, 10))),
      'ne-014': nec('re-003', 'viaje', 'Llevar al equipo a la Comunidad Ejemplo Centro en el ABC 123', 1, 'conductor', 'listo', Object.assign({ conductor: 'Oscar Farfán', vehiculoId: 've-abc123', placa: 'ABC 123' }, deCond('Oscar Farfán'), hecho('Oscar Farfán', -15, 8))),
      'ne-015': nec('re-003', 'almuerzo', 'Almuerzo para 15 personas', 15, 'jefe', 'autorizado', hecho('Carolina Castillo', -16, 11)),
      'ne-016': nec('re-003', 'logistica', 'Alistar la escuela para 15 personas', 15, 'logistica', 'listo', Object.assign({ items: items([0, 1, 2, 3]) }, hecho('Elkin Bruno', -11, 15))),
      'ne-017': nec('re-003', 'asistencia', 'Confirmar si vas a la reunión', 0, 'profesional', 'listo', Object.assign(deProf('Margaret Pulido'), hecho('Margaret Pulido', -14, 9))),
      'ne-018': nec('re-003', 'acta', 'Registrar el acta y el formato diario', 0, 'administrativo', 'listo', Object.assign({
        acta: { asistentes: 14, inicio: '10:00', fin: '12:30', observaciones: 'Se presentó el proyecto. La comunidad pidió una segunda reunión para revisar el cronograma.', foto: '' } }, hecho('Paola Martínez', -10, 16))),
      'ne-019': nec('re-004', 'carros', 'Una camioneta para el equipo', 1, 'jefe', 'autorizado', Object.assign({ conductor: 'Oscar Farfán', vehiculos: [{ vehiculoId: 've-def456', placa: 'DEF 456', conductor: 'Oscar Farfán' }] }, hecho('Carolina Castillo', -6, 9))),
      'ne-020': nec('re-004', 'viaje', 'Llevar al equipo a la Comunidad Ejemplo Occidente en el DEF 456', 1, 'conductor', 'listo', Object.assign({ conductor: 'Oscar Farfán', vehiculoId: 've-def456', placa: 'DEF 456' }, deCond('Oscar Farfán'), hecho('Oscar Farfán', -5, 8))),
      'ne-021': nec('re-004', 'refrigerios', 'Refrigerios para 25 personas', 25, 'jefe', 'autorizado', hecho('Carolina Castillo', -6, 11)),
      'ne-022': nec('re-004', 'logistica', 'Alistar la cancha para 25 personas', 25, 'logistica', 'listo', Object.assign({ items: items([0, 1, 2, 3]) }, hecho('Elkin Bruno', -2, 15))),
      'ne-023': nec('re-004', 'asistencia', 'Confirmar si vas a la reunión', 0, 'profesional', 'listo', Object.assign(deProf('Margaret Pulido'), hecho('Margaret Pulido', -4, 9))),
      'ne-024': nec('re-004', 'acta', 'Registrar el acta y el formato diario', 0, 'administrativo', 'pendiente')
    };

    // ---------- AVISOS ----------
    function aviso(para, titulo, texto, en, modulo) {
      return { para, titulo, texto, en, modulo, leido: {} };
    }
    const avisos = {
      'av-001': aviso('coordcompras', 'Compra por autorizar', 'Andrés Beltrán pide comprar botas de seguridad talla 40, que están agotadas.', iso(0, 8, 15), 'inventario'),
      'av-007': aviso('coordcompras', 'Compra por autorizar', 'Carolina Castillo pide comprar 6 unidades de mouse inalámbrico (aprox. $ 180.000).', iso(0, 8, 20), 'inventario'),
      'av-012': aviso('gerente', 'Compra por autorizar (segundo paso)', 'Mauricio Giraldo autorizó los portátiles para el equipo de campo por $ 6.800.000 y la pasa a tu decisión.', iso(-2, 15, 10), 'inventario'),
      'av-009': aviso('equipos', 'Equipos en Recibidos', 'Hay 3 equipos en Recibidos esperando revisión: DEMO-0010, DEMO-0011 y DEMO-0012.', iso(0, 7, 45), 'equipos'),
      'av-010': aviso('logistica', 'Reunión próxima', 'La reunión en la Comunidad Ejemplo Norte es en 6 días: hay que alistar refrigerios, almuerzo y sonido.', iso(-1, 16, 0), 'reuniones'),
      'av-011': aviso('administrativo', 'Acta por registrar', 'La reunión de ayer en la Comunidad Ejemplo Occidente ya pasó: registra el acta y el formato diario.', iso(0, 7, 30), 'reuniones'),
      'av-008': aviso('compras', 'Compra autorizada: hay que comprar', 'Mauricio Giraldo autorizó comprar 8 resmas de papel carta.', iso(-4, 15, 5), 'inventario'),
      'av-002': aviso('coordcompras', 'Compra sin autorización', 'Se compró algo sin autorización: garrafones de agua.', iso(-5, 17, 40), 'inventario'),
      'av-003': aviso('carros', 'SOAT por vencer', 'El SOAT del ABC 123 vence en 12 días.', iso(-1, 7, 30), 'vehiculos'),
      'av-004': aviso('jefe', 'Novedad en un carro', 'Oscar Farfán reportó un rayón en el ABC 123.', iso(-2, 18, 10), 'vehiculos'),
      'av-005': aviso('todos', 'Bienvenido a la demo', 'Bienvenido a la demo. Aquí todos los datos son inventados, puedes probar todo con calma.', iso(0, 7, 0), 'inicio'),
      'av-006': aviso('asistente', 'Pedidos de material por entregar', 'Tienes 4 pedidos de material por entregar.', iso(-1, 17, 10), 'inventario')
    };

    return { equipos, hojas, tareasEq, compras, proveedores, vehiculos, novedades, entregas, tanqueos, reservas, reuniones, necesidades, avisos, articulos, movimientos, solicitudes };
  }

  window.DatosDemo = Object.freeze({ VERSION: 21, generar, ITEMS_LOG: ['Sonido y micrófono', 'Sillas', 'Mesas', 'Refrigerios recibidos'] });
})();
