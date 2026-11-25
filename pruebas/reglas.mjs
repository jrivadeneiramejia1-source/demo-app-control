/* reglas.mjs — Prueba las reglas de firestore.rules contra el emulador de Firestore (Firebase local, gratis).
   Se corre con:  npm run reglas   (el emulador arranca solo). Cada prueba usa una persona y dice si Firebase debe dejar o negar.
   Los datos son inventados. Las pruebas «de ataque» intentan lo prohibido y deben fallar. */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';

// Una persona de prueba por rol (del organigrama de la empresa). El rol va al principio del correo.
const CORREOS = {
  gerente: 'gerente.oscar.munoz@example.com', jefe: 'jefe.carolina.castillo@example.com', equipos: 'equipos.fabian.barbosa@example.com', soporte: 'soporte.angel.ortiz@example.com',
  compras: 'compras.fredy.torres@example.com', coordcompras: 'coordcompras.mauricio.giraldo@example.com', asistente: 'asistente.andres.beltran@example.com', carros: 'carros.wilson.munoz@example.com', conductor: 'conductor.oscar.farfan@example.com',
  logistica: 'logistica.elkin.bruno@example.com', profesional: 'profesional.margaret.pulido@example.com', administrativo: 'administrativo.paola.martinez@example.com',
  colaborador: 'colaborador.yuliana.murcia@example.com', financiero: 'financiero.adriana.patino@example.com', consulta: 'consulta.revisor.fiscal@example.com'
};
const env = await initializeTestEnvironment({ projectId: 'demo-reglas', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } });
let ok = 0; const fallas = [];
async function prueba(nombre, fn) {
  try { await fn(); ok++; console.log('  ok  ', nombre); }
  catch (e) { fallas.push(nombre); console.log('  FALLA', nombre, '\n        ', String(e.message || e).split('\n')[0].slice(0, 160)); }
}
const sembrar = fn => env.withSecurityRulesDisabled(async c => fn(c.firestore()));
const limpiar = () => env.clearFirestore();

/** Persona de prueba (clave pública): se reconoce por el correo. */
const prueba_ = rol => env.authenticatedContext('uid-' + rol, { email: CORREOS[rol], email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
/** Cuenta propia: su perfil dice el rol. */
async function cuenta(uid, rol, extra = {}) {
  await sembrar(db => setDoc(doc(db, 'usuarios', uid), Object.assign({ nombre: 'Persona ' + uid, correo: uid + '@correo-inventado.test', rol, codigo: 'X', activo: true, en: '2026-11-20' }, extra)));
  return env.authenticatedContext(uid, { email: uid + '@correo-inventado.test', email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
}
const anonimo = () => env.unauthenticatedContext().firestore();

const compra = (o = {}) => Object.assign({ que: 'Botas', cantidad: 2, unidad: 'pares', categoria: 'EPP', valorAprox: 100000, paraQue: 'Campo', pide: 'Persona Uno', pideRol: 'logistica', autoriza: '',
  estado: 'pedido', proveedor: '', valorReal: 0, fechaPedido: '2026-11-20', fechaCompra: '', entregadoA: '', motivoRechazo: '', articuloId: '', factura: '', revisada: false, historial: [] }, o);
/** Una compra nueva como la crea la app: con el correo de quien la pide y la hora del servidor. quien: un rol de prueba o un correo. */
const nueva = (quien, o = {}) => compra(Object.assign({ pideCorreo: quien.includes('@') ? quien : CORREOS[quien], creadoEn: serverTimestamp() }, o));
/** Historiales de una, dos o tres líneas (cada paso agrega una: nunca se borra ni se cambia lo anterior). */
const hist = n => Array.from({ length: n }, (_, i) => ({ fecha: '2026-11-20T10:0' + i + ':00Z', texto: 'Paso ' + (i + 1), por: 'Alguien' }));
const H1 = hist(1), H2 = hist(2), H3 = hist(3);
const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ';
const correoCuenta = uid => uid + '@correo-inventado.test';

console.log('Lectura');
await limpiar(); await sembrar(db => setDoc(doc(db, 'articulos', 'ar-1'), { nombre: 'Guantes', cantidad: 3 }));
await prueba('sin sesión no lee nada', () => assertFails(getDoc(doc(anonimo(), 'articulos', 'ar-1'))));
await prueba('cuenta propia sin perfil no lee nada', () => assertFails(getDoc(doc(env.authenticatedContext('sin-perfil', { email: 'x@correo-inventado.test', email_verified: true }).firestore(), 'articulos', 'ar-1'))));
await prueba('cuenta con el acceso pausado no lee nada', async () => assertFails(getDoc(doc(await cuenta('pausada', 'compras', { activo: false }), 'articulos', 'ar-1'))));
await prueba('persona de prueba lee los artículos', () => assertSucceeds(getDoc(doc(prueba_('logistica'), 'articulos', 'ar-1'))));
await prueba('ajustes no se leen ni se escriben', async () => { const db = prueba_('jefe'); await assertFails(getDoc(doc(db, 'ajustes', 'buzon'))); await assertFails(setDoc(doc(db, 'ajustes', 'buzon'), { uid: 'x' })); });

console.log('Bodega');
await limpiar();
await prueba('el Conductor no crea artículos', () => assertFails(setDoc(doc(prueba_('conductor'), 'articulos', 'ar-9'), { nombre: 'X', cantidad: 1 })));
await prueba('Bodega no deja la cantidad en negativo', () => assertFails(setDoc(doc(prueba_('asistente'), 'articulos', 'ar-9'), { nombre: 'X', cantidad: -1 })));
await prueba('Bodega crea un artículo con cantidad válida (empieza en 0; con más, trae su movimiento: ver paso 6)', () => assertSucceeds(setDoc(doc(prueba_('asistente'), 'articulos', 'ar-9'), { nombre: 'X', cantidad: 0, bodega: 'Riohacha' })));

console.log('Compras');
await limpiar();
await prueba('quien pide crea la compra a su nombre', () => assertSucceeds(setDoc(doc(prueba_('logistica'), 'compras', 'co-1'), nueva('logistica'))));
await prueba('nadie pide a nombre de otro rol', () => assertFails(setDoc(doc(prueba_('logistica'), 'compras', 'co-2'), nueva('logistica', { pideRol: 'jefe' }))));
await prueba('quien pide no se la autoriza solo', () => assertFails(updateDoc(doc(prueba_('logistica'), 'compras', 'co-1'), { autorizaCorreo: CORREOS.logistica, estado: 'autorizado', autoriza: 'Persona Uno' })));
await prueba('Compras no autoriza (solo compra lo autorizado)', () => assertFails(updateDoc(doc(prueba_('compras'), 'compras', 'co-1'), { autorizaCorreo: CORREOS.compras, estado: 'autorizado', autoriza: 'Luis' })));
await prueba('Compras no compra algo que nadie autorizó', () => assertFails(updateDoc(doc(prueba_('compras'), 'compras', 'co-1'), { estado: 'comprado', proveedor: 'X', valorReal: 100000, fechaCompra: '2026-11-20', factura: '', historial: H1 })));
await prueba('la Coordinadora de compras autoriza la compra de otro', () => assertSucceeds(updateDoc(doc(prueba_('coordcompras'), 'compras', 'co-1'), { autorizaCorreo: CORREOS.coordcompras, estado: 'autorizado', autoriza: 'Ana Pérez', historial: H1 })));
await prueba('Compras compra lo autorizado', () => assertSucceeds(updateDoc(doc(prueba_('compras'), 'compras', 'co-1'), { estado: 'comprado', proveedor: 'Ferretería', valorReal: 100000, fechaCompra: '2026-11-20', factura: '', historial: H2 })));
await prueba('Compras no cambia lo autorizado (la cantidad)', async () => { await sembrar(db => setDoc(doc(db, 'compras', 'co-3'), compra({ estado: 'autorizado' })));
  await assertFails(updateDoc(doc(prueba_('compras'), 'compras', 'co-3'), { estado: 'comprado', cantidad: 99, proveedor: 'X', valorReal: 1, fechaCompra: '2026-11-20', factura: '', historial: H1 })); });
await prueba('Bodega recibe lo comprado', () => assertSucceeds(updateDoc(doc(prueba_('asistente'), 'compras', 'co-1'), { estado: 'recibido', entregadoA: 'Sofía', historial: H3 })));
await prueba('la Coordinadora (cuenta propia) no autoriza una compra que pidió ella', async () => {
  await sembrar(db => setDoc(doc(db, 'compras', 'co-4b'), compra({ pideRol: 'coordcompras', pide: 'Coordinadora', pideCorreo: correoCuenta('coord1') })));
  await assertFails(updateDoc(doc(await cuenta('coord1', 'coordcompras'), 'compras', 'co-4b'), { autorizaCorreo: correoCuenta('coord1'), estado: 'autorizado', autoriza: 'Coordinadora', historial: H1 })); });
await prueba('la Jefe (cuenta propia) ya NO autoriza la compra de otro', async () => {
  await sembrar(db => setDoc(doc(db, 'compras', 'co-6'), compra()));
  await assertFails(updateDoc(doc(await cuenta('jefa3', 'jefe'), 'compras', 'co-6'), { autorizaCorreo: correoCuenta('jefa3'), estado: 'autorizado', autoriza: 'Jefa', historial: H1 })); });
await prueba('la Coordinadora (cuenta propia) autoriza la compra de otro', async () => {
  await assertSucceeds(updateDoc(doc(await cuenta('coord3', 'coordcompras'), 'compras', 'co-6'), { autorizaCorreo: correoCuenta('coord3'), estado: 'autorizado', autoriza: 'Coordinadora', historial: H1 })); });
await prueba('el Gerente general (de prueba) puede decidir también lo que pidió la Jefe', async () => { await sembrar(db => setDoc(doc(db, 'compras', 'co-4'), compra({ pideRol: 'jefe', pide: 'Jefa' })));
  await assertSucceeds(updateDoc(doc(prueba_('gerente'), 'compras', 'co-4'), { autorizaCorreo: CORREOS.gerente, estado: 'autorizado', autoriza: 'Ricardo', historial: H1 })); });
await prueba('el Gerente no cambia el valor al autorizar', async () => { await sembrar(db => setDoc(doc(db, 'compras', 'co-5'), compra({ pideRol: 'jefe', pide: 'Jefa' })));
  await assertFails(updateDoc(doc(prueba_('gerente'), 'compras', 'co-5'), { autorizaCorreo: CORREOS.gerente, estado: 'autorizado', autoriza: 'Ricardo', valorAprox: 1 })); });

console.log('Personas y códigos');
await limpiar();
await prueba('nadie escoge un rol alto sin un código que exista', async () => {
  const db = env.authenticatedContext('nuevo1', { email: 'nuevo1@correo-inventado.test', email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
  await assertFails(setDoc(doc(db, 'usuarios', 'nuevo1'), { nombre: 'Nuevo Uno', correo: 'nuevo1@correo-inventado.test', rol: 'gerente', codigo: 'GER-AAAA-BBBB', activo: true, en: '2026-11-20' })); });
await prueba('con un código válido de su rol, la persona crea su perfil', async () => {
  await sembrar(db => setDoc(doc(db, 'codigos', 'BOD-AAAA-BBBB'), { rol: 'asistente', activo: true, por: 'Jefa', en: '2026-11-20' }));
  const db = env.authenticatedContext('nuevo2', { email: 'nuevo2@correo-inventado.test', email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
  await assertSucceeds(setDoc(doc(db, 'usuarios', 'nuevo2'), { nombre: 'Nuevo Dos', correo: 'nuevo2@correo-inventado.test', rol: 'asistente', codigo: 'BOD-AAAA-BBBB', activo: true, en: '2026-11-20' })); });
await prueba('nadie se cambia a sí mismo el rol', async () => assertFails(updateDoc(doc(await cuenta('jefa2', 'jefe'), 'usuarios', 'jefa2'), { rol: 'gerente' })));
await prueba('la persona de bodega no se da permisos extra', async () => assertFails(updateDoc(doc(await cuenta('bod1', 'asistente'), 'usuarios', 'bod1'), { extras: ['compra'] })));
await prueba('las personas de prueba no listan las cuentas', () => assertFails(getDocs(collection(prueba_('jefe'), 'usuarios'))));


console.log('Quién puede leer cada módulo (A1)');
await limpiar();
await sembrar(async db => { await setDoc(doc(db, 'equipos', 'eq-1'), { serial: 'ABC', estado: 'bodega', historial: [] }); await setDoc(doc(db, 'hojas', 'ac1'), { numero: 1 });
  await setDoc(doc(db, 'vehiculos', 've-1'), { placa: 'AAA111', km: 10 }); await setDoc(doc(db, 'novedades', 'no-1'), { placa: 'AAA111' }); await setDoc(doc(db, 'reuniones', 're-1'), { titulo: 'X' }); });
const lee = (rol, col, id) => getDoc(doc(prueba_(rol), col, id));
await prueba('el Conductor no lee Equipos', () => assertFails(lee('conductor', 'equipos', 'eq-1')));
await prueba('Compras no lee las actas', () => assertFails(lee('compras', 'hojas', 'ac1')));
await prueba('Logística no lee Vehículos ni novedades', async () => { await assertFails(lee('logistica', 'vehiculos', 've-1')); await assertFails(lee('logistica', 'novedades', 'no-1')); });
await prueba('El Encargado de equipos no lee las reuniones', () => assertFails(lee('equipos', 'reuniones', 're-1')));
await prueba('el Gerente lee Equipos (solo ver)', () => assertSucceeds(lee('gerente', 'equipos', 'eq-1')));
await prueba('el Conductor lee Vehículos', () => assertSucceeds(lee('conductor', 'vehiculos', 've-1')));
await prueba('el Encargado de equipos lee Equipos', () => assertSucceeds(lee('equipos', 'equipos', 'eq-1')));

console.log('Permisos por persona (A2)');
const equipoNuevo = { serial: 'SER1', estado: 'bodega', historial: [{ fecha: '2026-11-20', texto: 'Creado', por: 'X' }] };
await prueba('Bodega con «Equipos: solo ver» lee pero no cambia nada', async () => {
  const db = await cuenta('bod2', 'asistente', { permisos: { equipos: 'ver' } });
  await assertSucceeds(getDoc(doc(db, 'equipos', 'eq-1'))); await assertFails(setDoc(doc(db, 'equipos', 'eq-nuevo1'), equipoNuevo)); });
await prueba('Bodega sin ese permiso no lee Equipos', async () => assertFails(getDoc(doc(await cuenta('bod3', 'asistente'), 'equipos', 'eq-1'))));
await prueba('Pedir material con «Equipos: encargado» sí crea equipos', async () => assertSucceeds(setDoc(doc(await cuenta('prof1', 'profesional', { permisos: { equipos: 'encargado' } }), 'equipos', 'eq-nuevo2'), equipoNuevo)));
await prueba('Bodega con «Inventario: solo ver» no crea artículos', async () => assertFails(setDoc(doc(await cuenta('bod4', 'asistente', { permisos: { inventario: 'ver' } }), 'articulos', 'ar-77'), { nombre: 'X', cantidad: 1 })));
await prueba('Conductor con «Inventario: bodega» sí crea artículos', async () => assertSucceeds(setDoc(doc(await cuenta('con1', 'conductor', { permisos: { inventario: 'bodega' } }), 'articulos', 'ar-78'), { nombre: 'X', cantidad: 0, bodega: 'Guamal' })));
await prueba('«Sin acceso» a Inventario quita hasta la lectura', async () => assertFails(getDoc(doc(await cuenta('bod5', 'asistente', { permisos: { inventario: 'no' } }), 'articulos', 'ar-9'))));
await prueba('Persona con Reuniones «solo ver» no cambia una tarea', async () => {
  await sembrar(db => setDoc(doc(db, 'necesidades', 'ne-1'), { tipo: 'viaje', responsableRol: 'conductor', estado: 'pendiente', reunionId: 're-1' }));
  const db = await cuenta('con2', 'conductor', { permisos: { reuniones: 'ver' } });
  await assertSucceeds(getDoc(doc(db, 'necesidades', 'ne-1'))); await assertFails(updateDoc(doc(db, 'necesidades', 'ne-1'), { estado: 'listo' })); });

console.log('Quién maneja a las personas (A1)');
await limpiar();
await prueba('el Gerente (cuenta propia) ya no lista las personas', async () => assertFails(getDocs(collection(await cuenta('ger1', 'gerente'), 'usuarios'))));
await prueba('la Jefe (cuenta propia) lista las personas', async () => assertSucceeds(getDocs(collection(await cuenta('jef1', 'jefe'), 'usuarios'))));
await prueba('la Jefe cambia el nivel de una persona', async () => { const j = await cuenta('jef2', 'jefe'); await cuenta('bod6', 'asistente');
  await assertSucceeds(updateDoc(doc(j, 'usuarios', 'bod6'), { permisos: { equipos: 'ver' } })); });
await prueba('la Jefe no da un nivel que no existe ni «jefe»', async () => { const j = await cuenta('jef3', 'jefe'); await cuenta('bod7', 'asistente');
  await assertFails(updateDoc(doc(j, 'usuarios', 'bod7'), { permisos: { equipos: 'jefe' } })); await assertFails(updateDoc(doc(j, 'usuarios', 'bod7'), { permisos: { equipos: 'inventado' } }));
  await assertFails(updateDoc(doc(j, 'usuarios', 'bod7'), { permisos: { otro: 'ver' } })); });
await prueba('la Jefe no pausa ni cambia a otra Jefe', async () => { const j = await cuenta('jef4', 'jefe'); await cuenta('jef5', 'jefe');
  await assertFails(updateDoc(doc(j, 'usuarios', 'jef5'), { activo: false })); await assertFails(updateDoc(doc(j, 'usuarios', 'jef5'), { rol: 'asistente' })); });
await prueba('la Jefe no pausa ni cambia al Gerente', async () => { const j = await cuenta('jef6', 'jefe'); await cuenta('ger2', 'gerente');
  await assertFails(updateDoc(doc(j, 'usuarios', 'ger2'), { activo: false })); });
await prueba('la Jefe no se sube ni se da permisos a sí misma', async () => assertFails(updateDoc(doc(await cuenta('jef7', 'jefe'), 'usuarios', 'jef7'), { permisos: { equipos: 'encargado' } })));
await prueba('la Jefe pausa a una persona de bodega', async () => { const j = await cuenta('jef8', 'jefe'); await cuenta('bod8', 'asistente'); await assertSucceeds(updateDoc(doc(j, 'usuarios', 'bod8'), { activo: false })); });
await prueba('una cuenta con el correo sin confirmar no entra', async () => {
  await sembrar(db => setDoc(doc(db, 'usuarios', 'sinconf'), { nombre: 'Sin Confirmar', correo: 'sinconf@correo-inventado.test', rol: 'asistente', codigo: 'X', activo: true, en: '2026-11-20' }));
  await assertFails(getDoc(doc(env.authenticatedContext('sinconf', { email: 'sinconf@correo-inventado.test', email_verified: false }).firestore(), 'articulos', 'ar-9'))); });


console.log('Compras: monto del Gerente general y dos pasos (B)');
await limpiar();
const conCuenta = async (uid, rol, extra) => cuenta(uid, rol, extra);
const jefe1 = await conCuenta('jefM', 'jefe'), coord1 = await conCuenta('coordM', 'coordcompras'), ger1 = await conCuenta('gerM', 'gerente', { extras: ['general'] }), gerNo = await conCuenta('gerN', 'gerente');
await sembrar(async db => { await setDoc(doc(db, 'compras', 'g1'), compra({ valorAprox: 6000000 })); await setDoc(doc(db, 'compras', 'g2'), compra({ valorAprox: 100000 }));
  await setDoc(doc(db, 'compras', 'g3'), compra({ valorAprox: 6000000 })); await setDoc(doc(db, 'compras', 'g4'), compra({ valorAprox: 100000, pideRol: 'coordcompras', pide: 'Coordinadora' })); });
await prueba('una compra de más de 5 millones no la autoriza la Coordinadora sola', () => assertFails(updateDoc(doc(coord1, 'compras', 'g1'), { autorizaCorreo: correoCuenta('coordM'), estado: 'autorizado', autoriza: 'Coordinadora', historial: H1 })));
await prueba('una compra grande pasa de la Coordinadora al Gerente general («por-gerente»)', () => assertSucceeds(updateDoc(doc(coord1, 'compras', 'g1'), { autorizaCorreo: correoCuenta('coordM'), estado: 'por-gerente', autorizaJefe: 'Coordinadora', historial: H1 })));
await prueba('una compra chica no necesita al Gerente', async () => { await assertFails(updateDoc(doc(coord1, 'compras', 'g2'), { autorizaCorreo: correoCuenta('coordM'), estado: 'por-gerente', autorizaJefe: 'Coordinadora', historial: H1 }));
  await assertSucceeds(updateDoc(doc(coord1, 'compras', 'g2'), { autorizaCorreo: correoCuenta('coordM'), estado: 'autorizado', autoriza: 'Coordinadora', historial: H1 })); });
await prueba('justo 5.000.000 todavía no necesita al Gerente (el Gerente decide solo las de MÁS de 5 millones)', async () => { await sembrar(db => setDoc(doc(db, 'compras', 'g11'), compra({ valorAprox: 5000000 })));
  await assertFails(updateDoc(doc(coord1, 'compras', 'g11'), { autorizaCorreo: correoCuenta('coordM'), estado: 'por-gerente', autorizaJefe: 'Coordinadora', historial: H1 }));
  await assertSucceeds(updateDoc(doc(coord1, 'compras', 'g11'), { autorizaCorreo: correoCuenta('coordM'), estado: 'autorizado', autoriza: 'Coordinadora', historial: H1 })); });
await prueba('la Coordinadora sí puede rechazar una compra grande', () => assertSucceeds(updateDoc(doc(coord1, 'compras', 'g3'), { autorizaCorreo: correoCuenta('coordM'), estado: 'rechazado', motivoRechazo: 'Muy cara', autoriza: 'Coordinadora', historial: H1 })));
await prueba('el Gerente general autoriza lo que le pasó la Coordinadora', () => assertSucceeds(updateDoc(doc(ger1, 'compras', 'g1'), { autorizaCorreo: correoCuenta('gerM'), estado: 'autorizado', autoriza: 'Gerente general', historial: H2 })));
await prueba('un Gerente que no es general no autoriza ni rechaza nada (ni lo que pasó la Coordinadora, ni un pedido)', async () => {
  await sembrar(async db => { await setDoc(doc(db, 'compras', 'g12'), compra({ estado: 'por-gerente', valorAprox: 6000000 })); await setDoc(doc(db, 'compras', 'g13'), compra({ valorAprox: 2000000 })); });
  for (const id of ['g12', 'g13']) { await assertFails(updateDoc(doc(gerNo, 'compras', id), { autorizaCorreo: correoCuenta('gerN'), estado: 'autorizado', autoriza: 'Gerente', historial: H2 }));
    await assertFails(updateDoc(doc(gerNo, 'compras', id), { autorizaCorreo: correoCuenta('gerN'), estado: 'rechazado', motivoRechazo: 'No', autoriza: 'Gerente', historial: H2 })); } });
await prueba('la Jefe ya no autoriza ni rechaza compras', async () => { await sembrar(db => setDoc(doc(db, 'compras', 'g14'), compra({ valorAprox: 100000 })));
  await assertFails(updateDoc(doc(jefe1, 'compras', 'g14'), { autorizaCorreo: correoCuenta('jefM'), estado: 'autorizado', autoriza: 'Jefa', historial: H1 }));
  await assertFails(updateDoc(doc(jefe1, 'compras', 'g14'), { autorizaCorreo: correoCuenta('jefM'), estado: 'rechazado', motivoRechazo: 'No', autoriza: 'Jefa', historial: H1 })); });
await prueba('el Gerente general decide cualquier pedido sin esperar a la Coordinadora (también uno grande)', async () => {
  await sembrar(async db => { await setDoc(doc(db, 'compras', 'g15'), compra({ valorAprox: 2000000 })); await setDoc(doc(db, 'compras', 'g16'), compra({ valorAprox: 6000000 })); });
  for (const id of ['g15', 'g16']) await assertSucceeds(updateDoc(doc(ger1, 'compras', id), { autorizaCorreo: correoCuenta('gerM'), estado: 'autorizado', autoriza: 'Gerente general', historial: H1 })); });
await prueba('Compras no compra una que está «por-gerente»', async () => { await sembrar(db => setDoc(doc(db, 'compras', 'g6'), compra({ estado: 'por-gerente' })));
  await assertFails(updateDoc(doc(prueba_('compras'), 'compras', 'g6'), { estado: 'comprado', proveedor: 'X', valorReal: 1, fechaCompra: '2026-11-20', factura: '', historial: H1 })); });
await prueba('lo que pide la Coordinadora lo decide siempre el Gerente general, aunque sea barato (ni ella, ni la Jefe, ni otro Gerente)', async () => {
  await assertFails(updateDoc(doc(coord1, 'compras', 'g4'), { autorizaCorreo: correoCuenta('coordM'), estado: 'autorizado', autoriza: 'Coordinadora', historial: H1 }));
  await assertFails(updateDoc(doc(jefe1, 'compras', 'g4'), { autorizaCorreo: correoCuenta('jefM'), estado: 'autorizado', autoriza: 'Jefa', historial: H1 }));
  await assertFails(updateDoc(doc(gerNo, 'compras', 'g4'), { autorizaCorreo: correoCuenta('gerN'), estado: 'autorizado', autoriza: 'Gerente', historial: H1 }));
  await assertSucceeds(updateDoc(doc(ger1, 'compras', 'g4'), { autorizaCorreo: correoCuenta('gerM'), estado: 'autorizado', autoriza: 'Gerente general', historial: H1 })); });
await prueba('la Jefe no cambia el valor de una compra ya autorizada', () => assertFails(updateDoc(doc(jefe1, 'compras', 'g2'), { valorAprox: 1 })));
await prueba('la Jefe no borra compras', () => assertFails(deleteDoc(doc(jefe1, 'compras', 'g2'))));
await prueba('el Gerente general pide una compra y nace autorizada (con su correo); los demás Gerentes no', async () => {
  const gen = (uid, o = {}) => nueva(correoCuenta(uid), Object.assign({ pide: 'Gerente', pideRol: 'gerente', pideUid: uid }, o));
  await assertSucceeds(setDoc(doc(ger1, 'compras', 'g8'), gen('gerM', { estado: 'autorizado', autoriza: 'Gerente general', autorizaCorreo: correoCuenta('gerM'), historial: H2 })));
  await assertFails(setDoc(doc(ger1, 'compras', 'g8b'), gen('gerM', { estado: 'autorizado', autoriza: 'Gerente general' })));
  await assertFails(setDoc(doc(gerNo, 'compras', 'g8c'), gen('gerN', { estado: 'autorizado', autoriza: 'Gerente', autorizaCorreo: correoCuenta('gerN'), historial: H2 })));
  await assertSucceeds(setDoc(doc(gerNo, 'compras', 'g7'), gen('gerN', { estado: 'pedido' }))); });
await prueba('nadie más crea una compra ya autorizada', async () => { await assertFails(setDoc(doc(jefe1, 'compras', 'g9'), nueva(correoCuenta('jefM'), { pideRol: 'jefe', estado: 'autorizado' })));
  await assertFails(setDoc(doc(coord1, 'compras', 'g9b'), nueva(correoCuenta('coordM'), { pideRol: 'coordcompras', estado: 'autorizado', autorizaCorreo: correoCuenta('coordM') }))); });
await prueba('solo el Gerente general cambia el monto (ni la Jefe, ni la Coordinadora, ni otro Gerente, ni la persona de prueba)', async () => {
  for (const [db, v] of [[jefe1, 99999999], [coord1, 1], [gerNo, 1], [prueba_('gerente'), 1]]) await assertFails(setDoc(doc(db, 'ajustesApp', 'compras'), { montoGerente: v }));
  await assertSucceeds(setDoc(doc(ger1, 'ajustesApp', 'compras'), { montoGerente: 50000 }));
  await assertFails(setDoc(doc(ger1, 'ajustesApp', 'compras'), { montoGerente: -5 })); });
await prueba('con el monto más bajo, una compra de 100.000 ya pasa por el Gerente general', async () => { await sembrar(db => setDoc(doc(db, 'compras', 'g10'), compra({ valorAprox: 100000 })));
  await assertFails(updateDoc(doc(coord1, 'compras', 'g10'), { autorizaCorreo: correoCuenta('coordM'), estado: 'autorizado', autoriza: 'Coordinadora', historial: H1 }));
  await assertSucceeds(updateDoc(doc(coord1, 'compras', 'g10'), { autorizaCorreo: correoCuenta('coordM'), estado: 'por-gerente', autorizaJefe: 'Coordinadora', historial: H1 })); });

console.log('Invitaciones y primer ingreso (A2)');
await limpiar();
const jefeI = await cuenta('jefI', 'jefe');
const inv = (o = {}) => Object.assign({ nombre: 'Persona Inventada', rol: 'asistente', permisos: { equipos: 'ver' }, extras: [], por: 'Jefa', en: '2026-11-20' }, o);
const nuevoCtx = (uid, correo, verificado = true) => env.authenticatedContext(uid, { email: correo, email_verified: verificado, firebase: { sign_in_provider: 'password' } }).firestore();
const perfilDe = (correo, o = {}) => Object.assign({ nombre: 'Persona Inventada', correo, rol: 'asistente', codigo: 'invitacion', activo: true, en: '2026-11-20', permisos: { equipos: 'ver' }, extras: [] }, o);
async function entrarCon(uid, correo, perfil, { verificado = true, borrar = true } = {}) {
  const db = nuevoCtx(uid, correo, verificado), b = writeBatch(db);
  b.set(doc(db, 'usuarios', uid), perfil); if (borrar) b.delete(doc(db, 'invitaciones', correo)); return b.commit(); }
await prueba('la Jefe crea una invitación', () => assertSucceeds(setDoc(doc(jefeI, 'invitaciones', 'ana.nueva@correo-inventado.test'), inv())));
await prueba('nadie más crea invitaciones', async () => { await assertFails(setDoc(doc(await cuenta('bodI', 'asistente'), 'invitaciones', 'otra@correo-inventado.test'), inv()));
  await assertFails(setDoc(doc(prueba_('jefe'), 'invitaciones', 'otra@correo-inventado.test'), inv())); });
await prueba('la invitación no sirve con un rol o nivel inventado, ni con el correo en mayúsculas', async () => {
  await assertFails(setDoc(doc(jefeI, 'invitaciones', 'x1@correo-inventado.test'), inv({ rol: 'dios' })));
  await assertFails(setDoc(doc(jefeI, 'invitaciones', 'x2@correo-inventado.test'), inv({ permisos: { inventario: 'jefe' } })));
  await assertFails(setDoc(doc(jefeI, 'invitaciones', 'X3@correo-inventado.test'), inv())); });
await prueba('con el correo confirmado, la persona crea su perfil con lo de la invitación y la gasta', () => entrarCon('u1', 'ana.nueva@correo-inventado.test', perfilDe('ana.nueva@correo-inventado.test')).then(() => assertSucceeds(getDoc(doc(nuevoCtx('u1', 'ana.nueva@correo-inventado.test'), 'usuarios', 'u1')))));
await prueba('la invitación ya no existe (sirvió una sola vez)', async () => { let existe = true; await env.withSecurityRulesDisabled(async c => { existe = (await getDoc(doc(c.firestore(), 'invitaciones', 'ana.nueva@correo-inventado.test'))).exists(); }); if (existe) throw new Error('sigue existiendo'); });
await prueba('sin correo confirmado no se entra con invitación', async () => { await sembrar(db => setDoc(doc(db, 'invitaciones', 'dos@correo-inventado.test'), inv()));
  await assertFails(entrarCon('u2', 'dos@correo-inventado.test', perfilDe('dos@correo-inventado.test'), { verificado: false })); });
await prueba('nadie se pone otro rol que el de su invitación', async () => { await sembrar(db => setDoc(doc(db, 'invitaciones', 'tres@correo-inventado.test'), inv()));
  await assertFails(entrarCon('u3', 'tres@correo-inventado.test', perfilDe('tres@correo-inventado.test', { rol: 'jefe' }))); });
await prueba('nadie se da permisos de más que los de su invitación', async () => assertFails(entrarCon('u3', 'tres@correo-inventado.test', perfilDe('tres@correo-inventado.test', { permisos: { equipos: 'encargado' } }))));
await prueba('no se puede cambiar el nombre de la invitación', async () => assertFails(entrarCon('u3', 'tres@correo-inventado.test', perfilDe('tres@correo-inventado.test', { nombre: 'Otro Nombre' }))));
await prueba('no se queda con la invitación para usarla otra vez', async () => assertFails(entrarCon('u3', 'tres@correo-inventado.test', perfilDe('tres@correo-inventado.test'), { borrar: false })));
await prueba('un correo sin invitación no entra', async () => assertFails(entrarCon('u4', 'nadie@correo-inventado.test', perfilDe('nadie@correo-inventado.test'))));
await prueba('nadie usa la invitación de otro correo', async () => assertFails(entrarCon('u5', 'intruso@correo-inventado.test', perfilDe('tres@correo-inventado.test'))));
await prueba('cada persona lee solo su invitación', async () => { await assertSucceeds(getDoc(doc(nuevoCtx('u6', 'tres@correo-inventado.test'), 'invitaciones', 'tres@correo-inventado.test')));
  await assertFails(getDoc(doc(nuevoCtx('u7', 'intruso@correo-inventado.test'), 'invitaciones', 'tres@correo-inventado.test')));
  await assertFails(getDoc(doc(nuevoCtx('u6', 'tres@correo-inventado.test', false), 'invitaciones', 'tres@correo-inventado.test'))); });
await prueba('la persona entra con Google (correo ya confirmado)', async () => { await sembrar(db => setDoc(doc(db, 'invitaciones', 'goo@correo-inventado.test'), inv({ rol: 'compras', permisos: {} })));
  const db = env.authenticatedContext('ug', { email: 'goo@correo-inventado.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore(), b = writeBatch(db);
  b.set(doc(db, 'usuarios', 'ug'), perfilDe('goo@correo-inventado.test', { rol: 'compras', permisos: {} })); b.delete(doc(db, 'invitaciones', 'goo@correo-inventado.test')); await assertSucceeds(b.commit()); });

console.log('Personas de prueba y consistencia');
await limpiar();
await prueba('la Jefe apaga las personas de prueba y dejan de leer y escribir', async () => {
  await sembrar(db => setDoc(doc(db, 'articulos', 'ar-1'), { nombre: 'Guantes', cantidad: 3 }));
  await assertFails(setDoc(doc(prueba_('jefe'), 'ajustesApp', 'seguridad'), { personasPrueba: false }));
  const j = await cuenta('jefS', 'jefe'); await assertSucceeds(setDoc(doc(j, 'ajustesApp', 'seguridad'), { personasPrueba: false }));
  await assertFails(getDoc(doc(prueba_('logistica'), 'articulos', 'ar-1'))); await assertSucceeds(getDoc(doc(j, 'articulos', 'ar-1')));
  await assertSucceeds(setDoc(doc(j, 'ajustesApp', 'seguridad'), { personasPrueba: true })); await assertSucceeds(getDoc(doc(prueba_('logistica'), 'articulos', 'ar-1'))); });
await prueba('los niveles de las reglas coinciden con personas.js', async () => {
  globalThis.window = {}; await import('../personas.js'); const D = globalThis.window.DEMO, txt = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const base = txt.slice(txt.indexOf('function baseDe('), txt.indexOf('function nivel('));
  const filas = [...base.matchAll(/r == '(\w+)' \? \{ 'equipos': '(\w+)', 'inventario': '(\w+)', 'vehiculos': '(\w+)', 'reuniones': '(\w+)' \}/g)];
  if (filas.length !== D.ROLES.length) throw new Error(`reglas tienen ${filas.length} roles y personas.js ${D.ROLES.length}`);
  for (const [, rol, e, i, v, r] of filas) { const x = D.rolDe(rol); if (!x) throw new Error('rol que no está en personas.js: ' + rol);
    for (const [m, val] of [['equipos', e], ['inventario', i], ['vehiculos', v], ['reuniones', r]]) if (x.permisos[m] !== val) throw new Error(`${rol}/${m}: reglas «${val}», personas.js «${x.permisos[m]}»`); }
  // Cada persona de prueba: su correo tiene la forma que aceptan las reglas, el rol del correo es el de la persona y no se repite.
  const patron = new RegExp(txt.match(/matches\('(\^\(gerente[^']*)'\)/)[1]), vistos = new Set();
  for (const p of D.PERSONAS) {
    if (!patron.test(p.correo)) throw new Error('las reglas no aceptan el correo de ' + p.nombre + ': ' + p.correo);
    if (p.correo.split('.')[0] !== p.rol) throw new Error('el rol del correo no coincide con el de ' + p.nombre);
    if (vistos.has(p.correo)) throw new Error('correo repetido: ' + p.correo);
    vistos.add(p.correo);
  }
  const rolesRegla = txt.match(/function ROLES\(\) \{ return \[([^\]]*)\]/)[1].split(',').map(x => x.replace(/[' ]/g, '')).sort().join();
  if (rolesRegla !== D.ROLES.map(r => r.rol).sort().join()) throw new Error('ROLES() de las reglas no coincide con personas.js: ' + rolesRegla);
  // Los permisos extra fijos de las personas de prueba están en las reglas (y solo esas tres personas los tienen).
  for (const p of D.PERSONAS) for (const x of p.extras) if (!txt.includes(`'${p.correo}' ? ['${x}']`)) throw new Error('falta en las reglas el permiso extra «' + x + '» de ' + p.nombre);
  if (D.PERSONAS.filter(p => p.extras.length).length !== 3) throw new Error('las reglas solo conocen 3 personas de prueba con permisos extra'); });


console.log('Inventario: cada nivel lee solo lo suyo (B6)');
await limpiar();
await sembrar(async db => { await setDoc(doc(db, 'movimientos', 'mo-1'), { articulo: 'Guantes', cantidad: 2, tipo: 'salida' });
  await setDoc(doc(db, 'compras', 'cp-a'), compra({ pideUid: 'pide1', pide: 'Persona Uno' })); await setDoc(doc(db, 'compras', 'cp-b'), compra({ pideUid: 'pide2', pide: 'Persona Dos' }));
  await setDoc(doc(db, 'solicitudes', 'so-a'), { articulo: 'Guantes', cantidad: 1, pideUid: 'pide1', pideRol: 'profesional', estado: 'pendiente' });
  await setDoc(doc(db, 'solicitudes', 'so-b'), { articulo: 'Guantes', cantidad: 1, pideUid: 'pide2', pideRol: 'profesional', estado: 'pendiente' }); });
await prueba('quien solo pide no lee los movimientos de la bodega', async () => assertFails(getDoc(doc(await cuenta('pide1', 'profesional'), 'movimientos', 'mo-1'))));
await prueba('Bodega, Compras y quien solo ve sí leen los movimientos', async () => { await assertSucceeds(getDoc(doc(prueba_('asistente'), 'movimientos', 'mo-1')));
  await assertSucceeds(getDoc(doc(prueba_('compras'), 'movimientos', 'mo-1'))); await assertSucceeds(getDoc(doc(await cuenta('ver1', 'conductor', { permisos: { inventario: 'ver' } }), 'movimientos', 'mo-1'))); });
await prueba('una cuenta real que solo pide lee sus compras y sus pedidos, y no los de otros', async () => {
  const db = await cuenta('pide1', 'profesional');
  await assertSucceeds(getDoc(doc(db, 'compras', 'cp-a'))); await assertFails(getDoc(doc(db, 'compras', 'cp-b')));
  await assertSucceeds(getDoc(doc(db, 'solicitudes', 'so-a'))); await assertFails(getDoc(doc(db, 'solicitudes', 'so-b'))); });
await prueba('la lista que trae solo lo suyo se deja leer; la lista de todo, no', async () => {
  const db = await cuenta('pide1', 'profesional'), { query, where } = await import('firebase/firestore');
  await assertSucceeds(getDocs(query(collection(db, 'compras'), where('pideUid', '==', 'pide1'))));
  await assertFails(getDocs(collection(db, 'compras'))); await assertFails(getDocs(query(collection(db, 'compras'), where('pideUid', '==', 'pide2')))); });
await prueba('Bodega, Compras, la Jefe y el Gerente leen todas las compras', async () => { for (const r of ['asistente', 'compras', 'jefe', 'gerente']) await assertSucceeds(getDocs(collection(prueba_(r), 'compras'))); });
await prueba('al pedir, la cuenta real deja marcada su propia cuenta (no la de otra persona)', async () => {
  const db = await cuenta('pide3', 'profesional');
  await assertSucceeds(setDoc(doc(db, 'compras', 'cp-n1'), nueva(correoCuenta('pide3'), { pideRol: 'profesional', pideUid: 'pide3' })));
  await assertFails(setDoc(doc(db, 'compras', 'cp-n2'), nueva(correoCuenta('pide3'), { pideRol: 'profesional', pideUid: 'pide1' }))); });
await prueba('una compra con más de 5 líneas o más de 3 cotizaciones no se acepta', async () => {
  const db = await cuenta('pide4', 'profesional'), l = { que: 'X', cantidad: 1, unidad: 'unidades', valor: 1 };
  await assertSucceeds(setDoc(doc(db, 'compras', 'cp-l1'), nueva(correoCuenta('pide4'), { pideRol: 'profesional', pideUid: 'pide4', valorAprox: 5, lineas: [l, l, l, l, l], cotizaciones: [FOTO, FOTO, FOTO] })));
  await assertFails(setDoc(doc(db, 'compras', 'cp-l2'), nueva(correoCuenta('pide4'), { pideRol: 'profesional', pideUid: 'pide4', valorAprox: 6, lineas: [l, l, l, l, l, l] })));
  await assertFails(setDoc(doc(db, 'compras', 'cp-l3'), nueva(correoCuenta('pide4'), { pideRol: 'profesional', pideUid: 'pide4', cotizaciones: [FOTO, FOTO, FOTO, FOTO] }))); });
await prueba('una persona solo con «solo ver» en Inventario no pide material ni compras', async () => {
  const db = await cuenta('ver2', 'conductor', { permisos: { inventario: 'ver' } });
  await assertFails(setDoc(doc(db, 'compras', 'cp-v'), nueva(correoCuenta('ver2'), { pideRol: 'conductor', pideUid: 'ver2' })));
  await assertFails(setDoc(doc(db, 'solicitudes', 'so-v'), { articulo: 'X', cantidad: 1, pideRol: 'conductor', estado: 'pendiente', pideUid: 'ver2' })); });


console.log('Roles nuevos: Colaborador, Financiero y Consulta');
await limpiar();
await sembrar(async db => { await setDoc(doc(db, 'movimientos', 'mo-9'), { articulo: 'Guantes', cantidad: 2, tipo: 'salida' }); await setDoc(doc(db, 'compras', 'cp-z'), compra({ pide: 'Persona Uno' }));
  await setDoc(doc(db, 'equipos', 'eq-9'), { serial: 'ZZZ', estado: 'bodega', historial: [] }); await setDoc(doc(db, 'vehiculos', 've-9'), { placa: 'AAA111', km: 10 }); await setDoc(doc(db, 'reuniones', 're-9'), { titulo: 'X' }); });
await prueba('Financiero lee todas las compras y los movimientos, y no lee Equipos ni Vehículos', async () => { const db = prueba_('financiero');
  await assertSucceeds(getDoc(doc(db, 'compras', 'cp-z'))); await assertSucceeds(getDoc(doc(db, 'movimientos', 'mo-9')));
  await assertFails(getDoc(doc(db, 'equipos', 'eq-9'))); await assertFails(getDoc(doc(db, 'vehiculos', 've-9'))); });
await prueba('Financiero también pide compras a su nombre, pero no las autoriza ni las compra', async () => { const db = prueba_('financiero');
  await assertSucceeds(setDoc(doc(db, 'compras', 'cp-f1'), nueva('financiero', { pideRol: 'financiero' })));
  await assertFails(updateDoc(doc(db, 'compras', 'cp-z'), { autorizaCorreo: CORREOS.financiero, estado: 'autorizado', autoriza: 'X' })); });
await prueba('Consulta lee inventario y vehículos y no cambia nada ni lee Equipos', async () => { const db = prueba_('consulta');
  await assertSucceeds(getDoc(doc(db, 'compras', 'cp-z'))); await assertSucceeds(getDoc(doc(db, 'vehiculos', 've-9'))); await assertFails(getDoc(doc(db, 'equipos', 'eq-9')));
  await assertFails(setDoc(doc(db, 'compras', 'cp-c1'), nueva('consulta', { pideRol: 'consulta' }))); await assertFails(setDoc(doc(db, 'articulos', 'ar-c'), { nombre: 'X', cantidad: 1 })); });
await prueba('Colaborador pide, ve las reuniones solo para leer y no ve Equipos, Vehículos ni movimientos', async () => { const db = prueba_('colaborador');
  await assertSucceeds(setDoc(doc(db, 'compras', 'cp-o1'), nueva('colaborador', { pideRol: 'colaborador' })));
  await assertSucceeds(getDoc(doc(db, 'reuniones', 're-9'))); await assertFails(getDoc(doc(db, 'equipos', 'eq-9'))); await assertFails(getDoc(doc(db, 'vehiculos', 've-9')));
  await assertFails(getDoc(doc(db, 'movimientos', 'mo-9'))); });
await prueba('la Jefe le da a un Colaborador el nivel «finanzas» y ahora lee todas las compras', async () => {
  const j = await cuenta('jefN', 'jefe'); await cuenta('colN', 'colaborador');
  await assertSucceeds(updateDoc(doc(j, 'usuarios', 'colN'), { permisos: { inventario: 'finanzas' } }));
  await assertSucceeds(getDocs(collection(env.authenticatedContext('colN', { email: 'colN@correo-inventado.test', email_verified: true }).firestore(), 'compras'))); });
await prueba('solo vale el correo con el rol al principio y @example.com', async () => {
  const como = c => env.authenticatedContext('x-' + c, { email: c, email_verified: false }).firestore();
  await assertSucceeds(getDoc(doc(como('jefe.cualquiera.nombre@example.com'), 'compras', 'cp-z')));
  for (const malo of ['jefe@example.com', 'otro.jefe.nombre@example.com', 'jefe.nombre@otro.com', 'Jefe.Nombre@example.com', 'dios.nombre@example.com', 'jefe.nombre@example.com.mx'])
    await assertFails(getDoc(doc(como(malo), 'compras', 'cp-z'))); });

console.log('Revisión de seguridad, paso 1: Gerentes y Jefes solo desde la consola');
await limpiar();
await prueba('la Jefe no invita a un Gerente ni a otra Jefe', async () => { const j = await cuenta('jefR1', 'jefe');
  await assertFails(setDoc(doc(j, 'invitaciones', 'ger.nuevo@correo-inventado.test'), inv({ rol: 'gerente', permisos: {} })));
  await assertFails(setDoc(doc(j, 'invitaciones', 'jef.nueva@correo-inventado.test'), inv({ rol: 'jefe', permisos: {} })));
  await assertSucceeds(setDoc(doc(j, 'invitaciones', 'bod.nuevo@correo-inventado.test'), inv())); });
await prueba('la Jefe no crea códigos de Gerente ni de Jefe (se crean a mano en la consola)', async () => { const j = await cuenta('jefR2', 'jefe');
  await assertFails(setDoc(doc(j, 'codigosDireccion', 'GER-CODIGO-LARGO-1'), { rol: 'gerente', activo: true, por: 'Jefa', en: '2026-11-20' }));
  await assertFails(setDoc(doc(j, 'codigosDireccion', 'JEF-CODIGO-LARGO-1'), { rol: 'jefe', activo: true, por: 'Jefa', en: '2026-11-20' })); });
await prueba('un código de Gerente puesto a mano en la consola sirve una sola vez', async () => {
  await sembrar(db => setDoc(doc(db, 'codigosDireccion', 'GER-A-MANO-1234'), { rol: 'gerente', activo: true, por: 'consola', en: '2026-11-20' }));
  const db = nuevoCtx('gerNuevo', 'gernuevo@correo-inventado.test'), b = writeBatch(db);
  b.set(doc(db, 'usuarios', 'gerNuevo'), { nombre: 'Gerente Nuevo', correo: 'gernuevo@correo-inventado.test', rol: 'gerente', codigo: 'GER-A-MANO-1234', activo: true, en: '2026-11-20' });
  b.delete(doc(db, 'codigosDireccion', 'GER-A-MANO-1234')); await assertSucceeds(b.commit()); });

console.log('Revisión de seguridad, pasos 2 y 3: compras (valor, sin autorizar, Gerente con otro Gerente, respaldo de 2 días)');
await limpiar();
const hace = dias => Timestamp.fromMillis(Date.now() - dias * 86400000);
const linea = (valor, extra = {}) => Object.assign({ que: 'X', cantidad: 1, unidad: 'unidades', valor, articuloId: '' }, extra);
await prueba('una compra «sin autorizar» nace sin revisar (la cuenta real de Compras la registra bien)', async () => { const db = await cuenta('cmpS', 'compras'), yo = correoCuenta('cmpS');
  await assertFails(setDoc(doc(db, 'compras', 'sa-1'), nueva(yo, { estado: 'sin-autorizar', pideRol: 'compras', revisada: true, pideUid: 'cmpS' })));
  await assertSucceeds(setDoc(doc(db, 'compras', 'sa-2'), nueva(yo, { estado: 'sin-autorizar', pideRol: 'compras', revisada: false, pideUid: 'cmpS' }))); });
await prueba('el valor de la compra: no negativo, número, y no menor que la suma de sus líneas', async () => { const db = prueba_('logistica');
  await assertFails(setDoc(doc(db, 'compras', 'v-1'), nueva('logistica', { valorAprox: -5 })));
  await assertFails(setDoc(doc(db, 'compras', 'v-2'), nueva('logistica', { valorAprox: '100' })));
  await assertFails(setDoc(doc(db, 'compras', 'v-3'), nueva('logistica', { valorAprox: 10, lineas: [linea(500000), linea(600000)] })));
  await assertSucceeds(setDoc(doc(db, 'compras', 'v-4'), nueva('logistica', { valorAprox: 1100000, lineas: [linea(500000), linea(600000)] }))); });
await prueba('una línea sin valor numérico no se acepta', () => assertFails(setDoc(doc(prueba_('logistica'), 'compras', 'v-5'), nueva('logistica', { valorAprox: 100, lineas: [linea('mucho')] }))));
await prueba('la compra lleva el correo de quien la pide y la hora del servidor (no se inventan)', async () => { const db = prueba_('logistica');
  await assertFails(setDoc(doc(db, 'compras', 'm-1'), nueva('logistica', { pideCorreo: 'otra.persona@example.com' })));
  await assertFails(setDoc(doc(db, 'compras', 'm-2'), compra({ pideRol: 'logistica' })));
  await assertFails(setDoc(doc(db, 'compras', 'm-3'), nueva('logistica', { creadoEn: hace(5) })));
  await assertFails(setDoc(doc(db, 'compras', 'm-4'), nueva('logistica', { creadoEn: '2026-11-20' }))); });
const gerA = await cuenta('gerA', 'gerente'), gerB = await cuenta('gerB', 'gerente'), genG = await cuenta('genG', 'gerente', { extras: ['general'] }), jefG = await cuenta('jefG', 'jefe'), coordG = await cuenta('coordG', 'coordcompras');
await prueba('lo que pide un Gerente (no general) lo decide la Coordinadora: no él, ni la Jefe, ni otro Gerente que no es general', async () => {
  await assertSucceeds(setDoc(doc(gerA, 'compras', 'gg-1'), nueva(correoCuenta('gerA'), { pide: 'Gerente A', pideRol: 'gerente', pideUid: 'gerA' })));
  await assertFails(updateDoc(doc(gerA, 'compras', 'gg-1'), { autorizaCorreo: correoCuenta('gerA'), estado: 'autorizado', autoriza: 'Gerente A', historial: H1 }));
  await assertFails(updateDoc(doc(jefG, 'compras', 'gg-1'), { autorizaCorreo: correoCuenta('jefG'), estado: 'autorizado', autoriza: 'Jefa', historial: H1 }));
  await assertFails(updateDoc(doc(gerB, 'compras', 'gg-1'), { autorizaCorreo: correoCuenta('gerB'), estado: 'autorizado', autoriza: 'Gerente B', historial: H1 }));
  await assertSucceeds(updateDoc(doc(coordG, 'compras', 'gg-1'), { autorizaCorreo: correoCuenta('coordG'), estado: 'autorizado', autoriza: 'Coordinadora', historial: H1 })); });
await prueba('el Gerente general también puede rechazar la compra de otro Gerente', async () => {
  await assertSucceeds(setDoc(doc(gerA, 'compras', 'gg-2'), nueva(correoCuenta('gerA'), { pide: 'Gerente A', pideRol: 'gerente', pideUid: 'gerA' })));
  await assertSucceeds(updateDoc(doc(genG, 'compras', 'gg-2'), { autorizaCorreo: correoCuenta('genG'), estado: 'rechazado', autoriza: 'Gerente general', motivoRechazo: 'No', historial: H1 })); });
await prueba('la compra de un Gerente de prueba la decide la Coordinadora de prueba; Oscar (Gerente general de prueba) no decide lo suyo, y otro Gerente que no es general tampoco', async () => {
  await sembrar(db => setDoc(doc(db, 'compras', 'gg-3'), nueva('gerente.oscar.munoz@example.com', { pide: 'Oscar', pideRol: 'gerente' })));
  await assertFails(updateDoc(doc(prueba_('gerente'), 'compras', 'gg-3'), { autorizaCorreo: CORREOS.gerente, estado: 'autorizado', autoriza: 'Oscar', historial: H1 }));
  const otro = env.authenticatedContext('uid-otro-gerente', { email: 'gerente.otra.persona@example.com', email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
  await assertFails(updateDoc(doc(otro, 'compras', 'gg-3'), { autorizaCorreo: 'gerente.otra.persona@example.com', estado: 'autorizado', autoriza: 'Otra', historial: H1 }));
  await assertSucceeds(updateDoc(doc(prueba_('coordcompras'), 'compras', 'gg-3'), { autorizaCorreo: CORREOS.coordcompras, estado: 'autorizado', autoriza: 'Coordinadora', historial: H1 })); });
await prueba('no hay «respaldo de 2 días»: un Gerente que no es general no se salta a la Coordinadora por mucho que pasen los días; el Gerente general decide sin esperar', async () => {
  await sembrar(async db => { await setDoc(doc(db, 'compras', 'rs-1'), compra({ pideRol: 'logistica', pideCorreo: CORREOS.logistica, creadoEn: hace(1) }));
    await setDoc(doc(db, 'compras', 'rs-2'), compra({ pideRol: 'logistica', pideCorreo: CORREOS.logistica, creadoEn: hace(3), valorAprox: 5000000 })); });
  await assertFails(updateDoc(doc(gerA, 'compras', 'rs-2'), { autorizaCorreo: correoCuenta('gerA'), estado: 'autorizado', autoriza: 'Gerente A', historial: H1 }));
  await assertFails(updateDoc(doc(gerA, 'compras', 'rs-2'), { autorizaCorreo: correoCuenta('gerA'), estado: 'rechazado', autoriza: 'Gerente A', motivoRechazo: 'No', historial: H1 }));
  await assertSucceeds(updateDoc(doc(genG, 'compras', 'rs-1'), { autorizaCorreo: correoCuenta('genG'), estado: 'autorizado', autoriza: 'Gerente general', historial: H1 })); });
await prueba('con cuentas propias cada paso cabe en el límite de expresiones: Compras compra y Bodega recibe', async () => {
  const cmp = await cuenta('cmpL', 'compras'), bod = await cuenta('bodL', 'asistente');
  await sembrar(db => setDoc(doc(db, 'compras', 'lm-1'), compra({ estado: 'autorizado' })));
  await assertSucceeds(updateDoc(doc(cmp, 'compras', 'lm-1'), { estado: 'comprado', proveedor: 'Ferretería', valorReal: 100000, fechaCompra: '2026-11-20', factura: '', historial: H1 }));
  await assertSucceeds(updateDoc(doc(bod, 'compras', 'lm-1'), { estado: 'recibido', entregadoA: 'Persona', historial: H2 })); });
await prueba('con cuentas propias: la Coordinadora revisa lo «sin autorizar» (la Jefe ya no) y el Gerente general autoriza lo que le pasó la Coordinadora', async () => {
  await sembrar(async db => { await setDoc(doc(db, 'compras', 'lm-2'), compra({ estado: 'sin-autorizar' })); await setDoc(doc(db, 'compras', 'lm-3'), compra({ estado: 'por-gerente', valorAprox: 6000000 })); await setDoc(doc(db, 'compras', 'lm-4'), compra({ estado: 'por-gerente', valorAprox: 6000000 })); });
  await assertFails(updateDoc(doc(jefG, 'compras', 'lm-2'), { revisadaPorCorreo: correoCuenta('jefG'), revisada: true, historial: H1 }));
  await assertSucceeds(updateDoc(doc(coordG, 'compras', 'lm-2'), { revisadaPorCorreo: correoCuenta('coordG'), revisada: true, historial: H1 }));
  await assertFails(updateDoc(doc(gerA, 'compras', 'lm-3'), { autorizaCorreo: correoCuenta('gerA'), estado: 'autorizado', autoriza: 'Gerente A', historial: H1 }));
  await assertSucceeds(updateDoc(doc(genG, 'compras', 'lm-3'), { autorizaCorreo: correoCuenta('genG'), estado: 'autorizado', autoriza: 'Gerente general', historial: H1 }));
  await assertFails(updateDoc(doc(coordG, 'compras', 'lm-4'), { autorizaCorreo: correoCuenta('coordG'), estado: 'autorizado', autoriza: 'Coordinadora', historial: H1 })); });

console.log('Revisión de seguridad, paso 4: el historial de las compras solo crece');
await limpiar();
const lineaH = { fecha: '2026-11-20T12:00:00Z', texto: 'Paso nuevo', por: 'Alguien' }, coordH = await cuenta('coordH', 'coordcompras');
const cambiada = [Object.assign({}, H1[0], { texto: 'Lo borré y puse otra cosa' }), lineaH];
const pasos4 = [
  ['decidir (la Coordinadora autoriza)', () => coordH, { estado: 'pedido' }, { estado: 'autorizado', autoriza: 'Coordinadora', autorizaCorreo: correoCuenta('coordH') }],
  ['comprar (Compras)', () => prueba_('compras'), { estado: 'autorizado' }, { estado: 'comprado', proveedor: 'X', valorReal: 1, fechaCompra: '2026-11-20', factura: '' }],
  ['recibir (Bodega)', () => prueba_('asistente'), { estado: 'comprado' }, { estado: 'recibido', entregadoA: 'Persona' }],
  ['marcar revisada (la Coordinadora)', () => coordH, { estado: 'sin-autorizar' }, { revisada: true, revisadaPorCorreo: correoCuenta('coordH') }]
];
for (const [nombre, quien, semilla, cambio] of pasos4) {
  await prueba('historial, ' + nombre + ': vaciarlo, no tocarlo, cambiar una línea vieja o agregar dos, falla; agregar una línea sí', async () => {
    const id = 'h-' + nombre.slice(0, 5).replace(/\W/g, '');
    await sembrar(db => setDoc(doc(db, 'compras', id), compra(Object.assign({ historial: H1 }, semilla))));
    const d = doc(quien(), 'compras', id);
    await assertFails(updateDoc(d, Object.assign({}, cambio, { historial: [] })));
    await assertFails(updateDoc(d, Object.assign({}, cambio)));
    await assertFails(updateDoc(d, Object.assign({}, cambio, { historial: cambiada })));
    await assertFails(updateDoc(d, Object.assign({}, cambio, { historial: H1.concat([lineaH, lineaH]) })));
    await assertSucceeds(updateDoc(d, Object.assign({}, cambio, { historial: H1.concat([lineaH]) }))); });
}

console.log('Revisión de seguridad, paso 5: pausar detiene todo y el código exige correo confirmado');
await limpiar();
await prueba('una cuenta pausada de Transporte no revisa una novedad (pausar sí detiene todo)', async () => {
  await sembrar(db => setDoc(doc(db, 'novedades', 'nv-p'), { placa: 'AAA111', costo: 0, revisada: false, tipo: 'llanta' }));
  const pausada = await cuenta('carP', 'carros', { activo: false }), activa = await cuenta('carA', 'carros');
  const cambio = { costo: 10, revisada: true, revisadaPor: 'X', revisadaEn: '2026-11-20', nota: '' };
  await assertFails(updateDoc(doc(pausada, 'novedades', 'nv-p'), cambio));
  await assertSucceeds(updateDoc(doc(activa, 'novedades', 'nv-p'), cambio)); });
await prueba('una cuenta sin perfil o con el correo sin confirmar tampoco revisa novedades', async () => {
  await sembrar(db => setDoc(doc(db, 'novedades', 'nv-q'), { placa: 'AAA111', costo: 0, revisada: false, tipo: 'llanta' }));
  const cambio = { costo: 10, revisada: true, revisadaPor: 'X', revisadaEn: '2026-11-20', nota: '' };
  await sembrar(db => setDoc(doc(db, 'usuarios', 'carS'), { nombre: 'Sin Confirmar', correo: 'cars@correo-inventado.test', rol: 'carros', codigo: 'X', activo: true, en: '2026-11-20' }));
  await assertFails(updateDoc(doc(env.authenticatedContext('carS', { email: 'cars@correo-inventado.test', email_verified: false }).firestore(), 'novedades', 'nv-q'), cambio));
  await assertFails(updateDoc(doc(env.authenticatedContext('sinPerfil2', { email: 'sp2@correo-inventado.test', email_verified: true }).firestore(), 'novedades', 'nv-q'), cambio)); });
await prueba('con el código, el perfil solo se crea con el correo confirmado', async () => {
  await sembrar(db => setDoc(doc(db, 'codigos', 'BOD-SINC-ONFI'), { rol: 'asistente', activo: true, por: 'Jefa', en: '2026-11-20' }));
  const perfilCod = correo => ({ nombre: 'Persona Nueva', correo, rol: 'asistente', codigo: 'BOD-SINC-ONFI', activo: true, en: '2026-11-20' });
  await assertFails(setDoc(doc(nuevoCtx('cc1', 'cc1@correo-inventado.test', false), 'usuarios', 'cc1'), perfilCod('cc1@correo-inventado.test')));
  await assertSucceeds(setDoc(doc(nuevoCtx('cc2', 'cc2@correo-inventado.test', true), 'usuarios', 'cc2'), perfilCod('cc2@correo-inventado.test'))); });

console.log('Revisión de seguridad, paso 6: la bodega deja rastro de cada cambio de cantidad');
await limpiar();
const movDe = (o = {}) => Object.assign({ articuloId: 'ar-m', articulo: 'Guantes', tipo: 'entrada', motivo: 'compra', cantidad: 2, saldo: 7, persona: '', proyecto: '', nota: '', compraId: '', solicitudId: '', por: 'Bodega', porRol: 'asistente', fecha: '2026-11-20T10:00:00Z' }, o);
const lote = (db, escribir) => { const b = writeBatch(db); escribir(b); return b.commit(); };
const bodegaR = await cuenta('bodR', 'asistente');
const sembrarArt = (id = 'ar-m', extra = {}) => sembrar(db => setDoc(doc(db, 'articulos', id), Object.assign({ nombre: 'Guantes', categoria: 'EPP', unidad: 'pares', cantidad: 5, minimo: 2, maximo: 10, ubicacion: 'A1', costo: 100, proveedor: 'X', bodega: 'Riohacha' }, extra)));
await prueba('Bodega no cambia la cantidad sin dejar el movimiento (ni con la prueba pública ni con cuenta propia)', async () => { await sembrarArt();
  await assertFails(updateDoc(doc(prueba_('asistente'), 'articulos', 'ar-m'), { cantidad: 99 }));
  await assertFails(updateDoc(doc(bodegaR, 'articulos', 'ar-m'), { cantidad: 99 }));
  await assertFails(updateDoc(doc(bodegaR, 'articulos', 'ar-m'), { cantidad: 6, ultimoMov: 'mo-que-no-existe' })); });
await prueba('con su movimiento en la misma escritura y la diferencia exacta, sí (entrada, salida y ajuste)', async () => {
  await assertSucceeds(lote(bodegaR, b => { b.update(doc(bodegaR, 'articulos', 'ar-m'), { cantidad: 7, ultimoMov: 'mo-1' }); b.set(doc(bodegaR, 'movimientos', 'mo-1'), movDe()); }));
  await assertSucceeds(lote(bodegaR, b => { b.update(doc(bodegaR, 'articulos', 'ar-m'), { cantidad: 4, ultimoMov: 'mo-2' }); b.set(doc(bodegaR, 'movimientos', 'mo-2'), movDe({ tipo: 'salida', motivo: 'entrega', cantidad: 3, saldo: 4 })); }));
  await assertSucceeds(lote(bodegaR, b => { b.update(doc(bodegaR, 'articulos', 'ar-m'), { cantidad: 1, ultimoMov: 'mo-3' }); b.set(doc(bodegaR, 'movimientos', 'mo-3'), movDe({ tipo: 'ajuste', motivo: 'conteo', cantidad: -3, saldo: 1 })); })); });
await prueba('la diferencia tiene que ser la del movimiento (no más, no menos, no con otro signo)', async () => { await sembrarArt();
  await assertFails(lote(bodegaR, b => { b.update(doc(bodegaR, 'articulos', 'ar-m'), { cantidad: 50, ultimoMov: 'mo-4' }); b.set(doc(bodegaR, 'movimientos', 'mo-4'), movDe()); }));
  await assertFails(lote(bodegaR, b => { b.update(doc(bodegaR, 'articulos', 'ar-m'), { cantidad: 7, ultimoMov: 'mo-5' }); b.set(doc(bodegaR, 'movimientos', 'mo-5'), movDe({ tipo: 'salida' })); }));
  await assertFails(lote(bodegaR, b => { b.update(doc(bodegaR, 'articulos', 'ar-m'), { cantidad: 7, ultimoMov: 'mo-6' }); b.set(doc(bodegaR, 'movimientos', 'mo-6'), movDe({ articuloId: 'otro-articulo' })); })); });
await prueba('no se reusa un movimiento viejo para justificar otro cambio', async () => { await sembrarArt();
  await sembrar(db => setDoc(doc(db, 'movimientos', 'mo-viejo'), movDe()));
  await assertFails(updateDoc(doc(bodegaR, 'articulos', 'ar-m'), { cantidad: 7, ultimoMov: 'mo-viejo' })); });
await prueba('Bodega edita datos del artículo (sin cambiar la cantidad) y no puede meter campos raros', async () => { await sembrarArt();
  await assertSucceeds(updateDoc(doc(bodegaR, 'articulos', 'ar-m'), { ubicacion: 'B2', costo: 150, minimo: 3 }));
  await assertFails(updateDoc(doc(bodegaR, 'articulos', 'ar-m'), { extraRaro: 'x' })); });
await prueba('un artículo nuevo con cantidad trae su movimiento; sin cantidad no hace falta', async () => {
  await assertFails(setDoc(doc(bodegaR, 'articulos', 'ar-n1'), { nombre: 'Nuevo', cantidad: 8, bodega: 'Riohacha' }));
  await assertSucceeds(setDoc(doc(bodegaR, 'articulos', 'ar-n2'), { nombre: 'Nuevo', cantidad: 0, bodega: 'Riohacha' }));
  await assertSucceeds(lote(bodegaR, b => { b.set(doc(bodegaR, 'articulos', 'ar-n3'), { nombre: 'Nuevo', cantidad: 8, ultimoMov: 'mo-n3', bodega: 'Bogotá' }); b.set(doc(bodegaR, 'movimientos', 'mo-n3'), movDe({ articuloId: 'ar-n3', motivo: 'inicial', cantidad: 8, saldo: 8 })); })); });
await prueba('las 3 bodegas: un artículo nuevo solo nace en Riohacha, Guamal o Bogotá (sin bodega o con otra, no)', async () => {
  for (const b of ['Riohacha', 'Guamal', 'Bogotá']) await assertSucceeds(setDoc(doc(bodegaR, 'articulos', 'ar-b-' + b), { nombre: 'Nuevo ' + b, cantidad: 0, bodega: b }));
  await assertFails(setDoc(doc(bodegaR, 'articulos', 'ar-b-sin'), { nombre: 'Sin bodega', cantidad: 0 }));
  await assertFails(setDoc(doc(bodegaR, 'articulos', 'ar-b-otra'), { nombre: 'Otra', cantidad: 0, bodega: 'Medellín' }));
  await assertFails(setDoc(doc(bodegaR, 'articulos', 'ar-b-min'), { nombre: 'Minúscula', cantidad: 0, bodega: 'riohacha' })); });
await prueba('un artículo no cambia de bodega con una edición (para eso es el traslado)', async () => { await sembrarArt();
  await assertFails(updateDoc(doc(bodegaR, 'articulos', 'ar-m'), { bodega: 'Guamal' }));
  await assertSucceeds(updateDoc(doc(bodegaR, 'articulos', 'ar-m'), { ubicacion: 'Estante B2' })); });
await prueba('traslado entre bodegas: sale de una (con su movimiento) y entra a la otra, en una sola escritura', async () => {
  await sembrarArt('ar-t1', { cantidad: 10, bodega: 'Riohacha' }); await sembrarArt('ar-t2', { cantidad: 1, bodega: 'Guamal' });
  await assertSucceeds(lote(bodegaR, b => {
    b.update(doc(bodegaR, 'articulos', 'ar-t1'), { cantidad: 6, ultimoMov: 'mo-t1' }); b.set(doc(bodegaR, 'movimientos', 'mo-t1'), movDe({ articuloId: 'ar-t1', tipo: 'salida', motivo: 'traslado', cantidad: 4, saldo: 6, trasladoId: 'tr-1' }));
    b.update(doc(bodegaR, 'articulos', 'ar-t2'), { cantidad: 5, ultimoMov: 'mo-t2' }); b.set(doc(bodegaR, 'movimientos', 'mo-t2'), movDe({ articuloId: 'ar-t2', tipo: 'entrada', motivo: 'traslado', cantidad: 4, saldo: 5, trasladoId: 'tr-1' })); }));
  // Si en la bodega de destino no estaba, se crea ahí con su movimiento.
  await assertSucceeds(lote(bodegaR, b => {
    b.update(doc(bodegaR, 'articulos', 'ar-t1'), { cantidad: 4, ultimoMov: 'mo-t3' }); b.set(doc(bodegaR, 'movimientos', 'mo-t3'), movDe({ articuloId: 'ar-t1', tipo: 'salida', motivo: 'traslado', cantidad: 2, saldo: 4, trasladoId: 'tr-2' }));
    b.set(doc(bodegaR, 'articulos', 'ar-t3'), { nombre: 'Guantes', categoria: 'EPP', unidad: 'pares', cantidad: 2, ultimoMov: 'mo-t4', minimo: 2, maximo: 10, ubicacion: '', costo: 100, proveedor: 'X', bodega: 'Bogotá' });
    b.set(doc(bodegaR, 'movimientos', 'mo-t4'), movDe({ articuloId: 'ar-t3', tipo: 'entrada', motivo: 'traslado', cantidad: 2, saldo: 2, trasladoId: 'tr-2' })); }));
  // No se puede sacar de una bodega más de lo que hay, ni sumar a la otra sin que salga de la primera.
  await assertFails(lote(bodegaR, b => { b.update(doc(bodegaR, 'articulos', 'ar-t1'), { cantidad: -1, ultimoMov: 'mo-t5' }); b.set(doc(bodegaR, 'movimientos', 'mo-t5'), movDe({ articuloId: 'ar-t1', tipo: 'salida', motivo: 'traslado', cantidad: 5, saldo: -1 })); }));
  await assertFails(lote(bodegaR, b => { b.update(doc(bodegaR, 'articulos', 'ar-t2'), { cantidad: 50, ultimoMov: 'mo-t6' }); b.set(doc(bodegaR, 'movimientos', 'mo-t6'), movDe({ articuloId: 'ar-t2', tipo: 'entrada', motivo: 'traslado', cantidad: 4, saldo: 50 })); })); });
await prueba('recibir una compra de 5 artículos (cuenta propia de Bodega) cabe en los límites de las reglas', async () => {
  const ids = ['r1', 'r2', 'r3', 'r4', 'r5'];
  await sembrar(async db => { for (const i of ids) await setDoc(doc(db, 'articulos', 'ar-' + i), { nombre: i, cantidad: 1 });
    await setDoc(doc(db, 'compras', 'cp-5'), compra({ estado: 'comprado', historial: H1 })); });
  await assertSucceeds(lote(bodegaR, b => { b.update(doc(bodegaR, 'compras', 'cp-5'), { estado: 'recibido', entregadoA: '', historial: H2 });
    for (const i of ids) { b.update(doc(bodegaR, 'articulos', 'ar-' + i), { cantidad: 3, ultimoMov: 'mo-' + i }); b.set(doc(bodegaR, 'movimientos', 'mo-' + i), movDe({ articuloId: 'ar-' + i })); } })); });
await prueba('movimientos: Bodega solo crea entrada, salida o ajuste con números', async () => {
  await assertFails(setDoc(doc(bodegaR, 'movimientos', 'mo-x1'), movDe({ tipo: 'regalo' })));
  await assertFails(setDoc(doc(bodegaR, 'movimientos', 'mo-x2'), movDe({ cantidad: 'dos' })));
  await assertSucceeds(setDoc(doc(bodegaR, 'movimientos', 'mo-x3'), movDe())); });
await prueba('pedidos de material: Bodega solo los entrega o los cierra y nunca cambia de quién son', async () => {
  const sol = { articulo: 'Guantes', cantidad: 1, pideUid: 'pide1', pideRol: 'profesional', estado: 'pendiente', pide: 'Persona', fecha: '2026-11-20' };
  await sembrar(async db => { await setDoc(doc(db, 'solicitudes', 'so-1'), sol); await setDoc(doc(db, 'solicitudes', 'so-2'), sol); await setDoc(doc(db, 'solicitudes', 'so-3'), Object.assign({}, sol, { estado: 'entregada' })); });
  await assertFails(updateDoc(doc(bodegaR, 'solicitudes', 'so-1'), { pideUid: 'otra-cuenta' }));
  await assertFails(updateDoc(doc(bodegaR, 'solicitudes', 'so-1'), { estado: 'entregada', pideRol: 'jefe' }));
  await assertFails(updateDoc(doc(bodegaR, 'solicitudes', 'so-1'), { estado: 'pendiente', motivo: 'x' }));
  await assertSucceeds(updateDoc(doc(bodegaR, 'solicitudes', 'so-1'), { estado: 'entregada', entregadaPor: 'Bodega', fechaEntrega: '2026-11-20', motivo: '' }));
  await assertSucceeds(updateDoc(doc(bodegaR, 'solicitudes', 'so-2'), { estado: 'rechazada', motivo: 'No hay' }));
  await assertFails(updateDoc(doc(bodegaR, 'solicitudes', 'so-3'), { estado: 'rechazada', motivo: 'Ya estaba entregada' })); });

console.log('Revisión de seguridad, paso 7: los teléfonos con avisos ya no están en Firestore');
await limpiar();
await prueba('nadie lee, crea, cambia ni borra «suscripciones» (ahora las guarda el Worker de avisos)', async () => {
  await sembrar(db => setDoc(doc(db, 'suscripciones', 'tel-1'), { rol: 'jefe', sub: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'a', auth: 'b' } } }));
  for (const db of [prueba_('jefe'), prueba_('logistica'), await cuenta('susA', 'asistente'), await cuenta('susJ', 'jefe')]) {
    await assertFails(getDoc(doc(db, 'suscripciones', 'tel-1'))); await assertFails(setDoc(doc(db, 'suscripciones', 'tel-2'), { rol: 'jefe' }));
    await assertFails(updateDoc(doc(db, 'suscripciones', 'tel-1'), { rol: 'gerente' })); await assertFails(deleteDoc(doc(db, 'suscripciones', 'tel-1'))); await assertFails(getDocs(collection(db, 'suscripciones'))); } });

console.log('Revisión de seguridad, paso 8: avisos de la campana sin suplantar');
await limpiar();
const avisoNuevo = (uid, o = {}) => Object.assign({ para: 'jefe', titulo: 'Compra por autorizar', texto: 'Alguien pide comprar botas.', en: '2026-11-20T10:00:00Z', modulo: 'inventario', leido: {}, deUid: uid }, o);
await prueba('un aviso lleva la cuenta de quien lo crea (no se escribe a nombre de otra persona)', async () => {
  const db = await cuenta('avA', 'logistica');
  await assertSucceeds(setDoc(doc(db, 'avisos', 'av-1'), avisoNuevo('avA')));
  await assertFails(setDoc(doc(db, 'avisos', 'av-2'), avisoNuevo('otra-cuenta')));
  const sin = avisoNuevo('avA'); delete sin.deUid; await assertFails(setDoc(doc(db, 'avisos', 'av-3b'), sin)); });
await prueba('las personas de prueba también: deUid es su propia cuenta', async () => {
  await assertSucceeds(setDoc(doc(prueba_('compras'), 'avisos', 'av-4'), avisoNuevo('uid-compras')));
  await assertFails(setDoc(doc(prueba_('compras'), 'avisos', 'av-5'), avisoNuevo('uid-jefe'))); });
await prueba('un aviso no lleva campos de más, ni textos enormes, ni un destino inventado, ni nace leído', async () => { const db = await cuenta('avB', 'logistica');
  await assertFails(setDoc(doc(db, 'avisos', 'av-6'), avisoNuevo('avB', { extra: 'x' })));
  await assertFails(setDoc(doc(db, 'avisos', 'av-7'), avisoNuevo('avB', { texto: 'x'.repeat(2000) })));
  await assertFails(setDoc(doc(db, 'avisos', 'av-8'), avisoNuevo('avB', { titulo: 'x'.repeat(500) })));
  await assertFails(setDoc(doc(db, 'avisos', 'av-9'), avisoNuevo('avB', { para: 'todos' })));
  await assertFails(setDoc(doc(db, 'avisos', 'av-10'), avisoNuevo('avB', { leido: { avB: true } })));
  await assertFails(setDoc(doc(db, 'avisos', 'av-11'), avisoNuevo('avB', { modulo: 'otro' })));
  await assertFails(setDoc(doc(db, 'avisos', 'av-12'), avisoNuevo('avB', { texto: 5 }))); });
await prueba('sin sesión o sin perfil nadie crea avisos, y cada quien sigue marcando solo SU «leído»', async () => {
  await assertFails(setDoc(doc(anonimo(), 'avisos', 'av-13'), avisoNuevo('x')));
  const db = await cuenta('avC', 'logistica');
  await assertSucceeds(updateDoc(doc(db, 'avisos', 'av-1'), { leido: { avC: true } }));
  await assertFails(updateDoc(doc(db, 'avisos', 'av-1'), { leido: { otro: true } }));
  await assertFails(updateDoc(doc(db, 'avisos', 'av-1'), { texto: 'cambiado' })); });

console.log('Revisión de seguridad, paso 9: las tareas de reunión son por persona');
await limpiar();
const comoPrueba = (uid, correo) => env.authenticatedContext(uid, { email: correo, email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
const otroConductor = comoPrueba('uid-cond-2', 'conductor.otro.chofer@example.com'), otroProf = comoPrueba('uid-prof-2', 'profesional.otra.persona@example.com');
const decide = (est = 'listo') => ({ estado: est, por: 'Alguien', en: '2026-11-20T10:00:00Z', motivo: '' });
await sembrar(async db => {
  await setDoc(doc(db, 'reuniones', 're-p'), { comunidad: 'X', fecha: '2026-12-01', estado: 'programada' });
  await setDoc(doc(db, 'necesidades', 'ne-v1'), { reunionId: 're-p', tipo: 'viaje', responsableRol: 'conductor', responsableCorreo: CORREOS.conductor, estado: 'pendiente', carrosId: 'ne-c1', conductor: 'Oscar' });
  await setDoc(doc(db, 'necesidades', 'ne-v2'), { reunionId: 're-p', tipo: 'viaje', responsableRol: 'conductor', responsableCorreo: 'conductor.otro.chofer@example.com', estado: 'pendiente', carrosId: 'ne-c2', conductor: 'Otro' });
  await setDoc(doc(db, 'necesidades', 'ne-c1'), { reunionId: 're-p', tipo: 'carros', responsableRol: 'jefe', estado: 'autorizado', conductor: 'Oscar', vehiculos: [] });
  await setDoc(doc(db, 'necesidades', 'ne-a1'), { reunionId: 're-p', tipo: 'asistencia', responsableRol: 'profesional', responsableCorreo: CORREOS.profesional, estado: 'pendiente' });
  await setDoc(doc(db, 'necesidades', 'ne-a2'), { reunionId: 're-p', tipo: 'asistencia', responsableRol: 'profesional', responsableCorreo: 'profesional.otra.persona@example.com', estado: 'pendiente' });
  await setDoc(doc(db, 'necesidades', 'ne-a3'), { reunionId: 're-p', tipo: 'asistencia', responsableRol: 'profesional', estado: 'pendiente' });
});
await prueba('un Profesional decide SU asistencia y no la de otro', async () => {
  await assertFails(updateDoc(doc(otroProf, 'necesidades', 'ne-a1'), decide()));
  await assertFails(updateDoc(doc(prueba_('profesional'), 'necesidades', 'ne-a2'), decide()));
  await assertSucceeds(updateDoc(doc(prueba_('profesional'), 'necesidades', 'ne-a1'), decide('no-va')));
  await assertSucceeds(updateDoc(doc(otroProf, 'necesidades', 'ne-a2'), decide())); });
await prueba('un Conductor confirma SU viaje y no el de otro (con cuenta propia tampoco)', async () => {
  await assertFails(updateDoc(doc(otroConductor, 'necesidades', 'ne-v1'), decide()));
  await assertFails(updateDoc(doc(prueba_('conductor'), 'necesidades', 'ne-v2'), decide()));
  await assertSucceeds(updateDoc(doc(prueba_('conductor'), 'necesidades', 'ne-v1'), decide()));
  const real = await cuenta('condReal', 'conductor');
  await assertFails(updateDoc(doc(real, 'necesidades', 'ne-v2'), decide()));
  await assertSucceeds(updateDoc(doc(otroConductor, 'necesidades', 'ne-v2'), decide())); });
await prueba('una tarea vieja sin persona (datos de antes) la decide cualquiera de ese rol; otro rol no', async () => {
  await assertFails(updateDoc(doc(prueba_('conductor'), 'necesidades', 'ne-a3'), decide()));
  await assertSucceeds(updateDoc(doc(prueba_('profesional'), 'necesidades', 'ne-a3'), decide())); });
await prueba('un Conductor no devuelve el viaje de otro (ni deja los carros pendientes por él)', async () => {
  await sembrar(async db => { await setDoc(doc(db, 'necesidades', 'ne-v1'), { reunionId: 're-p', tipo: 'viaje', responsableRol: 'conductor', responsableCorreo: CORREOS.conductor, estado: 'pendiente', carrosId: 'ne-c1', conductor: 'Oscar' }); });
  const devolver = (db, viaje) => lote(db, b => { b.update(doc(db, 'necesidades', viaje), { estado: 'no-va', por: 'X', en: '2026-11-20T10:00:00Z', motivo: 'No puedo' });
    b.update(doc(db, 'necesidades', 'ne-c1'), { estado: 'pendiente', conductor: '', motivo: 'No puede', devuelto: viaje }); });
  await assertFails(devolver(otroConductor, 'ne-v1'));
  await assertSucceeds(devolver(prueba_('conductor'), 'ne-v1')); });

console.log('Revisión de seguridad, paso 11: nombre que no se falsifica, extras por rol y cotizaciones que son fotos');
await limpiar();
const jefD = await cuenta('coordD', 'coordcompras'), gerD = await cuenta('gerD', 'gerente', { extras: ['general'] });
await prueba('quien decide una compra deja SU correo: sin él, o con el de otra persona, no se acepta', async () => {
  await sembrar(db => setDoc(doc(db, 'compras', 'n-1'), compra({ historial: H1, pideRol: 'logistica' })));
  await assertFails(updateDoc(doc(jefD, 'compras', 'n-1'), { estado: 'autorizado', autoriza: 'Gerente Oscar', historial: H2 }));
  await assertFails(updateDoc(doc(jefD, 'compras', 'n-1'), { estado: 'autorizado', autoriza: 'Gerente Oscar', autorizaCorreo: correoCuenta('gerD'), historial: H2 }));
  await assertSucceeds(updateDoc(doc(jefD, 'compras', 'n-1'), { estado: 'autorizado', autoriza: 'Coordinadora', autorizaCorreo: correoCuenta('coordD'), historial: H2 })); });
await prueba('el Gerente general de la segunda firma no cambia el nombre de la Coordinadora que ya autorizó', async () => {
  await sembrar(db => setDoc(doc(db, 'compras', 'n-2'), compra({ estado: 'por-gerente', autorizaJefe: 'Carolina', valorAprox: 3000000, historial: H1 })));
  await assertFails(updateDoc(doc(gerD, 'compras', 'n-2'), { estado: 'autorizado', autoriza: 'Gerente', autorizaJefe: 'Otro Nombre', autorizaCorreo: correoCuenta('gerD'), historial: H2 }));
  await assertSucceeds(updateDoc(doc(gerD, 'compras', 'n-2'), { estado: 'autorizado', autoriza: 'Gerente', autorizaCorreo: correoCuenta('gerD'), historial: H2 })); });
await prueba('marcar revisada una compra sin autorizar también deja el correo de quien la revisa', async () => {
  await sembrar(db => setDoc(doc(db, 'compras', 'n-3'), compra({ estado: 'sin-autorizar', historial: H1 })));
  await assertFails(updateDoc(doc(jefD, 'compras', 'n-3'), { revisada: true, historial: H2 }));
  await assertFails(updateDoc(doc(jefD, 'compras', 'n-3'), { revisada: true, revisadaPorCorreo: 'otra@correo-inventado.test', historial: H2 }));
  await assertSucceeds(updateDoc(doc(jefD, 'compras', 'n-3'), { revisada: true, revisadaPorCorreo: correoCuenta('coordD'), historial: H2 })); });
await prueba('el permiso extra «compra» solo vale en Bodega (un Conductor con nivel de bodega y ese extra no registra compras)', async () => {
  const falso = await cuenta('conE', 'conductor', { permisos: { inventario: 'bodega' }, extras: ['compra'] }), bueno = await cuenta('bodE', 'asistente', { extras: ['compra'] });
  const sa = uid => nueva(correoCuenta(uid), { estado: 'sin-autorizar', pideRol: 'x', revisada: false, pideUid: uid });
  await assertFails(setDoc(doc(falso, 'compras', 'ex-1'), sa('conE')));
  await assertSucceeds(setDoc(doc(bueno, 'compras', 'ex-2'), sa('bodE'))); });
await prueba('el permiso extra «actas» solo vale con el nivel de Soporte en Equipos y el rol Soporte', async () => {
  await sembrar(db => setDoc(doc(db, 'hojas', 'ac-x'), { numero: 9, revision: 'pendiente', porRol: 'equipos', persona: 'Persona Uno', cedula: '123456', equipos: [{}], otros: [], devoluciones: [] }));
  const cambio = { revision: 'ok', revisadaPor: 'X', revisadaEn: '2026-11-20', notaRevision: '' };
  const falso = await cuenta('prfA', 'profesional', { permisos: { equipos: 'soporte' }, extras: ['actas'] }), bueno = await cuenta('sopA', 'soporte', { extras: ['actas'] });
  await assertFails(updateDoc(doc(falso, 'hojas', 'ac-x'), cambio));
  await assertSucceeds(updateDoc(doc(bueno, 'hojas', 'ac-x'), cambio)); });
await prueba('las cotizaciones son fotos JPEG (no texto cualquiera ni otro tipo de archivo)', async () => { const db = prueba_('logistica');
  await assertSucceeds(setDoc(doc(db, 'compras', 'ct-1'), nueva('logistica', { cotizaciones: [FOTO] })));
  await assertFails(setDoc(doc(db, 'compras', 'ct-2'), nueva('logistica', { cotizaciones: ['hola'] })));
  await assertFails(setDoc(doc(db, 'compras', 'ct-3'), nueva('logistica', { cotizaciones: [FOTO, 'javascript:alert(1)'] })));
  await assertFails(setDoc(doc(db, 'compras', 'ct-4'), nueva('logistica', { cotizaciones: ['data:text/html;base64,PGI+'] })));
  await assertFails(setDoc(doc(db, 'compras', 'ct-5'), nueva('logistica', { cotizaciones: [FOTO + 'A'.repeat(200000)] }))); });

await prueba('la Jefe no marca «Gerente general» a nadie, pero sí puede dar el nivel «coordina» (Coordinadora de compras) a una cuenta', async () => {
  const jefX = await cuenta('jefX', 'jefe'); await cuenta('tgtX', 'colaborador');
  await assertFails(updateDoc(doc(jefX, 'usuarios', 'tgtX'), { extras: ['general'] }));
  await assertSucceeds(updateDoc(doc(jefX, 'usuarios', 'tgtX'), { permisos: { inventario: 'coordina' } })); });
await prueba('una cuenta con nivel «coordina» autoriza compras igual que la Coordinadora, y un Gerente con «general» puesto en la consola decide lo grande', async () => {
  const c = await cuenta('cooX', 'colaborador', { permisos: { inventario: 'coordina' } }), g = await cuenta('genX', 'gerente', { extras: ['general'] });
  await sembrar(async db => { await setDoc(doc(db, 'compras', 'cx-1'), compra({ valorAprox: 9000000 })); await setDoc(doc(db, 'compras', 'cx-2'), compra({ estado: 'por-gerente', valorAprox: 9000000 })); });
  await assertSucceeds(updateDoc(doc(c, 'compras', 'cx-1'), { autorizaCorreo: correoCuenta('cooX'), estado: 'por-gerente', autorizaJefe: 'Coordinadora', historial: H1 }));
  await assertSucceeds(updateDoc(doc(g, 'compras', 'cx-2'), { autorizaCorreo: correoCuenta('genX'), estado: 'autorizado', autoriza: 'Gerente general', historial: H1 })); });

console.log('Excel de Equipos, Carros, Reuniones y Compras: lo que sube el Excel cumple las reglas');
await limpiar();
const histE = n => Array.from({ length: n }, (_, i) => ({ fecha: '2026-11-20', tipo: 'registro', persona: 'X', nota: 'Paso ' + i, por: 'X' }));
await prueba('Equipos: el Encargado agrega un equipo en bodega y cambia fechas y observaciones con una línea de historial; solo la Jefe elimina', async () => {
  const enc = await cuenta('encX', 'equipos'), jefe = await cuenta('jefEq', 'jefe');
  const nuevoEq = { serial: 'DEMO-0099', tipo: 'Portátil', marca: 'Lenovo', modelo: 'E14', estado: 'bodega', asignadoA: '', asignadoCedula: '', proyecto: '', ultimoMtto: '', ultimoBackup: '', obs: '', pendientes: { mtto: false, backup: false }, historial: histE(1) };
  await assertSucceeds(setDoc(doc(enc, 'equipos', 'eq-nuevo1'), nuevoEq));
  await assertFails(setDoc(doc(enc, 'equipos', 'eq-nuevo2'), Object.assign({}, nuevoEq, { estado: 'asignado' })));
  await assertSucceeds(setDoc(doc(enc, 'equipos', 'eq-nuevo1'), { obs: 'Se copiaron las fotos', ultimoBackup: '2026-11-20', historial: histE(2) }, { merge: true }));
  await assertFails(setDoc(doc(enc, 'equipos', 'eq-nuevo1'), { marca: 'Otra', historial: histE(3) }, { merge: true }));
  await assertFails(deleteDoc(doc(enc, 'equipos', 'eq-nuevo1')));
  await assertSucceeds(deleteDoc(doc(jefe, 'equipos', 'eq-nuevo1'))); });
await prueba('Carros: solo la Jefe agrega, cambia y elimina carros desde el Excel (Transporte no crea ni borra)', async () => {
  const jefe = await cuenta('jefVe', 'jefe'), tra = await cuenta('traVe', 'carros');
  const ve = { placa: 'XYZ 789', marca: 'Toyota', modelo: 'Hilux', anio: 2024, color: 'Blanco', conductor: '', km: 0, soat: '2027-06-30', tecno: '2027-06-30', estado: 'disponible', historial: [{ fecha: '2026-11-20', texto: 'Se registró desde el Excel', por: 'X' }] };
  await assertFails(setDoc(doc(tra, 'vehiculos', 've-xyz789'), ve));
  await assertSucceeds(setDoc(doc(jefe, 'vehiculos', 've-xyz789'), ve));
  await assertSucceeds(setDoc(doc(jefe, 'vehiculos', 've-xyz789'), { km: 500, color: 'Gris', historial: ve.historial.concat(ve.historial) }, { merge: true }));
  await assertFails(deleteDoc(doc(tra, 'vehiculos', 've-xyz789')));
  await assertSucceeds(deleteDoc(doc(jefe, 'vehiculos', 've-xyz789'))); });
await prueba('Reuniones: la Jefe (cuenta propia) agrega varias reuniones con sus tareas y avisos en un solo lote; nadie más', async () => {
  const jefe = await cuenta('jefRe', 'jefe'), adm = await cuenta('admRe', 'administrativo');
  const aviso = (para, n) => ({ para, titulo: 'Reunión nueva ' + n, texto: 'X', en: '2026-11-20T10:00:00Z', modulo: 'reuniones', leido: {}, deUid: 'jefRe' });
  const nec = (rid, tipo, rol) => ({ reunionId: rid, comunidad: 'C', fechaReunion: '2030-02-10', tipo, detalle: 'X', cantidad: 0, responsableRol: rol, estado: 'pendiente', por: '', en: '', motivo: '', conductor: '', items: [], acta: null, informes: [] });
  const reu = c => ({ comunidad: c, fecha: '2030-02-10', hora: '09:30', lugar: '', asistentes: 0, jefe: 'Jefa', estado: 'programada', faltan: ['lugar', 'personas'], proyecto: 'P', correo: '', correos: [], origen: 'excel', historial: histE(2) });
  await assertSucceeds(lote(jefe, b => { for (let i = 0; i < 6; i++) { const rid = 're-x' + i; b.set(doc(jefe, 'reuniones', rid), reu('Comunidad ' + i));
    b.set(doc(jefe, 'necesidades', 'ne-x' + i + 'a'), nec(rid, 'logistica', 'logistica')); b.set(doc(jefe, 'necesidades', 'ne-x' + i + 'b'), nec(rid, 'asistencia', 'profesional')); b.set(doc(jefe, 'necesidades', 'ne-x' + i + 'c'), nec(rid, 'acta', 'administrativo'));
    b.set(doc(jefe, 'avisos', 'av-x' + i + 'a'), aviso('logistica', i)); b.set(doc(jefe, 'avisos', 'av-x' + i + 'b'), aviso('coordcompras', i)); } }));
  await assertFails(setDoc(doc(adm, 'reuniones', 're-no'), reu('No'))); });
await prueba('Compras: un lote de 100 compras nuevas de una cuenta propia (con el correo, la hora y una sola línea cada una) cabe en el límite de las reglas; nacen «pedido»', async () => {
  const db = await cuenta('colX', 'colaborador');
  await assertSucceeds(lote(db, b => { for (let i = 0; i < 100; i++) b.set(doc(db, 'compras', 'cx-' + i), nueva(correoCuenta('colX'), { pide: 'Persona', pideRol: 'colaborador', pideUid: 'colX', valorAprox: 1000, lineas: [{ que: 'X', cantidad: 1, unidad: 'unidades', valor: 1000, articuloId: '' }], cotizaciones: [], historial: H1 })); }));
  await assertFails(lote(db, b => { b.set(doc(db, 'compras', 'cx-malo'), nueva(correoCuenta('colX'), { pide: 'Persona', pideRol: 'colaborador', pideUid: 'colX', estado: 'autorizado', autorizaCorreo: correoCuenta('colX') })); })); });

console.log('Paso 12: el límite de 1000 expresiones con CUENTAS PROPIAS (no solo personas de prueba)');
await limpiar();
const PNG = 'data:image/png;base64,iVBORw0KGgo', JPG = 'data:image/jpeg;base64,/9j/4AAQ';
await prueba('cuenta propia: pedir una compra de 5 artículos con 3 cotizaciones', async () => { const db = await cuenta('lmP', 'profesional'), l = (v, i) => linea(v, { que: 'Art ' + i });
  await assertSucceeds(setDoc(doc(db, 'compras', 'lim-1'), nueva(correoCuenta('lmP'), { pideRol: 'profesional', pideUid: 'lmP', valorAprox: 150, lineas: [l(10, 1), l(20, 2), l(30, 3), l(40, 4), l(50, 5)], cotizaciones: [FOTO, FOTO, FOTO] }))); });
await prueba('cuenta propia de Compras: registrar una compra «sin autorizar» con 5 líneas', async () => { const db = await cuenta('lmC', 'compras');
  await assertSucceeds(setDoc(doc(db, 'compras', 'lim-2'), nueva(correoCuenta('lmC'), { estado: 'sin-autorizar', pideRol: 'compras', pideUid: 'lmC', valorAprox: 15, lineas: [linea(1), linea(2), linea(3), linea(4), linea(5)], cotizaciones: [FOTO, FOTO, FOTO] }))); });
await prueba('cuenta propia de Bodega: entregar un pedido de material (pedido + artículo + movimiento)', async () => { const db = await cuenta('bodR', 'asistente');
  await sembrar(async d => { await setDoc(doc(d, 'articulos', 'ar-e'), { nombre: 'Guantes', cantidad: 9, minimo: 1, maximo: 20 });
    await setDoc(doc(d, 'solicitudes', 'so-e'), { articulo: 'Guantes', cantidad: 2, pideUid: 'x', pideRol: 'profesional', estado: 'pendiente' }); });
  await assertSucceeds(lote(db, b => { b.set(doc(db, 'solicitudes', 'so-e'), { estado: 'entregada', entregadaPor: 'Bodega', fechaEntrega: '2026-11-20', motivo: '' }, { merge: true });
    b.update(doc(db, 'articulos', 'ar-e'), { cantidad: 7, ultimoMov: 'mo-e' }); b.set(doc(db, 'movimientos', 'mo-e'), movDe({ articuloId: 'ar-e', tipo: 'salida', motivo: 'entrega', cantidad: 2, saldo: 7, solicitudId: 'so-e' })); })); });
await prueba('cuenta propia de Transporte: el Conductor registra una salida (vehículo + salida con 5 fotos)', async () => { const db = await cuenta('lmV', 'conductor');
  await sembrar(db0 => setDoc(doc(db0, 'vehiculos', 've-l'), { placa: 'AAA111', estado: 'disponible', km: 1000, conductor: '', historial: H1, soat: '2027-01-01', tecno: '2027-01-01' }));
  const fotos = { frente: JPG, atras: JPG, izquierda: JPG, derecha: JPG, llantas: JPG };
  await assertSucceeds(lote(db, b => { b.update(doc(db, 'vehiculos', 've-l'), { estado: 'en-uso', km: 1100, conductor: 'Persona', historial: H2, ultimaEntrega: 'en-l' });
    b.set(doc(db, 'entregas', 'en-l'), { vehiculoId: 've-l', km: 1100, tipo: 'salida', porRol: 'conductor', fotos }); })); });
await prueba('cuenta propia Administrativo: registrar el acta (reunión realizada + acta lista)', async () => { const db = await cuenta('lmA', 'administrativo');
  await sembrar(async d => { await setDoc(doc(d, 'reuniones', 're-l'), { comunidad: 'X', fecha: '2020-01-01', estado: 'programada', historial: H1 });
    await setDoc(doc(d, 'necesidades', 'ne-l'), { reunionId: 're-l', tipo: 'acta', responsableRol: 'administrativo', estado: 'pendiente', fechaReunion: '2020-01-01' }); });
  await assertSucceeds(lote(db, b => { b.update(doc(db, 'reuniones', 're-l'), { estado: 'realizada', historial: H2, actaId: 'ne-l' });
    b.update(doc(db, 'necesidades', 'ne-l'), { estado: 'listo', por: 'Natalia', en: '2026-11-20', acta: { asistentes: 10 } }); })); });
await prueba('cuenta propia Encargado de equipos: entregar un equipo con su acta firmada', async () => { const db = await cuenta('lmE', 'equipos');
  await sembrar(d => setDoc(doc(d, 'equipos', 'eq-l'), { serial: 'S1', estado: 'bodega', historial: H1, asignadoA: '', asignadoCedula: '', proyecto: '' }));
  const paso = { fecha: '2026-11-20T10:00:00Z', texto: 'Entregado', por: 'Fabián', hojaId: 'ac7', tipo: 'entrega' };
  await assertSucceeds(lote(db, b => { b.update(doc(db, 'equipos', 'eq-l'), { estado: 'asignado', asignadoA: 'Persona Uno', asignadoCedula: '123456', proyecto: 'P', historial: H1.concat([paso]) });
    b.set(doc(db, 'hojas', 'ac7'), { numero: 7, porRol: 'equipos', revision: 'pendiente', devoluciones: [], persona: 'Persona Uno', cedula: '123456', equipos: [{ serial: 'S1' }], otros: [], firmaPersona: PNG }); })); });
await prueba('cuenta propia de Compras informa lo que hay y cuenta propia de Profesional confirma SU asistencia', async () => {
  await sembrar(async d => { await setDoc(doc(d, 'necesidades', 'ne-i'), { reunionId: 're-l', tipo: 'refrigerios', responsableRol: 'jefe', estado: 'pendiente', informes: [] });
    await setDoc(doc(d, 'necesidades', 'ne-as'), { reunionId: 're-l', tipo: 'asistencia', responsableRol: 'profesional', responsableCorreo: correoCuenta('lmQ'), estado: 'pendiente' }); });
  const cmp = await cuenta('lmC2', 'compras'), prof = await cuenta('lmQ', 'profesional');
  await assertSucceeds(updateDoc(doc(cmp, 'necesidades', 'ne-i'), { informes: [{ rol: 'compras', por: 'Mauricio', texto: 'Hay 12', en: '2026-11-20' }] }));
  await assertSucceeds(updateDoc(doc(prof, 'necesidades', 'ne-as'), decide())); });

console.log('Fase 9: plan de mantenimiento de cada carro (mttos)');
await limpiar();
const MT = (i, extra) => Object.assign({ id: 'mt' + i, tarea: 'Cambio de aceite ' + i, cadaKm: 5000, cadaDias: 180, ultimoKm: 40000, ultimaFecha: '2026-05-01', ultimoCosto: 0 }, extra);
const VE9 = { placa: 'AAA111', estado: 'disponible', km: 44700, conductor: '', historial: H1, soat: '2027-01-01', tecno: '2027-01-01' };
await prueba('Plan de mantenimiento: Transporte y Bodega ponen y cambian el plan de un carro con una línea nueva de historial', async () => {
  const tra = await cuenta('mtTra', 'carros'), bod = await cuenta('mtBod', 'asistente');
  await sembrar(d => setDoc(doc(d, 'vehiculos', 've-m1'), VE9));
  await assertSucceeds(updateDoc(doc(tra, 'vehiculos', 've-m1'), { mttos: [MT(1)], historial: H2 }));
  await assertSucceeds(updateDoc(doc(bod, 'vehiculos', 've-m1'), { mttos: [MT(1, { ultimoKm: 44700, ultimaFecha: '2026-11-25', ultimoCosto: 180000 })], km: 44700, historial: H3 })); });
await prueba('Plan de mantenimiento: sin la línea nueva de historial, no pasa', async () => {
  const tra = await cuenta('mtTra2', 'carros');
  await sembrar(d => setDoc(doc(d, 'vehiculos', 've-m2'), VE9));
  await assertFails(updateDoc(doc(tra, 'vehiculos', 've-m2'), { mttos: [MT(1)] })); });
await prueba('Plan de mantenimiento: una lista de 10 tareas pasa y una de 11 no', async () => {
  const tra = await cuenta('mtTra3', 'carros');
  await sembrar(d => setDoc(doc(d, 'vehiculos', 've-m3'), VE9));
  await assertSucceeds(updateDoc(doc(tra, 'vehiculos', 've-m3'), { mttos: Array.from({ length: 10 }, (_, i) => MT(i)), historial: H2 }));
  await assertFails(updateDoc(doc(tra, 'vehiculos', 've-m3'), { mttos: Array.from({ length: 11 }, (_, i) => MT(i)), historial: H3 })); });
await prueba('Plan de mantenimiento: lo que no es una lista no pasa', async () => {
  const tra = await cuenta('mtTra4', 'carros');
  await sembrar(d => setDoc(doc(d, 'vehiculos', 've-m4'), VE9));
  await assertFails(updateDoc(doc(tra, 'vehiculos', 've-m4'), { mttos: 'cambio de aceite', historial: H2 }));
  await assertFails(updateDoc(doc(tra, 'vehiculos', 've-m4'), { mttos: { a: 1 }, historial: H2 })); });
await prueba('Plan de mantenimiento: el Conductor no lo puede cambiar (ni borrarlo)', async () => {
  const con = await cuenta('mtCon', 'conductor');
  await sembrar(d => setDoc(doc(d, 'vehiculos', 've-m5'), Object.assign({}, VE9, { mttos: [MT(1)] })));
  await assertFails(updateDoc(doc(con, 'vehiculos', 've-m5'), { mttos: [MT(1, { ultimoKm: 44700 })], historial: H2 }));
  await assertFails(updateDoc(doc(con, 'vehiculos', 've-m5'), { mttos: [], historial: H2 })); });
await prueba('Plan de mantenimiento: quien solo consulta tampoco, y la Jefe sí (con el mismo límite de 10)', async () => {
  const cons = await cuenta('mtCons', 'consulta'), jefe = await cuenta('mtJef', 'jefe');
  await sembrar(d => setDoc(doc(d, 'vehiculos', 've-m6'), VE9));
  await assertFails(updateDoc(doc(cons, 'vehiculos', 've-m6'), { mttos: [MT(1)], historial: H2 }));
  await assertSucceeds(updateDoc(doc(jefe, 'vehiculos', 've-m6'), { mttos: [MT(1)], historial: H2 }));
  await assertFails(updateDoc(doc(jefe, 'vehiculos', 've-m6'), { mttos: Array.from({ length: 11 }, (_, i) => MT(i)), historial: H3 })); });
await prueba('Plan de mantenimiento: sigue sin poderse cambiar otro dato del carro junto con el plan (la placa)', async () => {
  const tra = await cuenta('mtTra5', 'carros');
  await sembrar(d => setDoc(doc(d, 'vehiculos', 've-m7'), VE9));
  await assertFails(updateDoc(doc(tra, 'vehiculos', 've-m7'), { mttos: [MT(1)], placa: 'ZZZ999', historial: H2 })); });

console.log('Fase 10: tanqueos (combustible, con la foto del recibo)');
await limpiar();
const TQ = extra => Object.assign({ vehiculoId: 've-t1', placa: 'AAA111', fecha: '2026-11-25T10:00:00Z', km: 45500, galones: 12.5, valor: 160000, lleno: true, foto: JPG, por: 'Persona', porRol: 'conductor' }, extra);
const sembrarT = () => sembrar(d => setDoc(doc(d, 'vehiculos', 've-t1'), { placa: 'AAA111', estado: 'disponible', km: 45210, conductor: '', historial: H1, soat: '2027-01-01', tecno: '2027-01-01' }));
await prueba('Tanqueos: el Conductor, Transporte, Bodega y la Jefe (cuentas propias) crean un tanqueo a su nombre', async () => {
  await sembrarT();
  await assertSucceeds(setDoc(doc(await cuenta('tqCon', 'conductor'), 'tanqueos', 'ta-1'), TQ({ porRol: 'conductor' })));
  await assertSucceeds(setDoc(doc(await cuenta('tqTra', 'carros'), 'tanqueos', 'ta-2'), TQ({ porRol: 'carros' })));
  await assertSucceeds(setDoc(doc(await cuenta('tqBod', 'asistente'), 'tanqueos', 'ta-3'), TQ({ porRol: 'asistente' })));
  await assertSucceeds(setDoc(doc(await cuenta('tqJef', 'jefe'), 'tanqueos', 'ta-4'), TQ({ porRol: 'jefe' }))); });
await prueba('Tanqueos: las personas de prueba (Conductor y Transporte) también', async () => {
  await sembrarT();
  await assertSucceeds(setDoc(doc(prueba_('conductor'), 'tanqueos', 'ta-5'), TQ({ porRol: 'conductor' })));
  await assertSucceeds(setDoc(doc(prueba_('carros'), 'tanqueos', 'ta-6'), TQ({ porRol: 'carros' }))); });
await prueba('Tanqueos: nadie lo crea a nombre de otro rol', async () => {
  await sembrarT();
  await assertFails(setDoc(doc(await cuenta('tqCon2', 'conductor'), 'tanqueos', 'ta-7'), TQ({ porRol: 'jefe' }))); });
await prueba('Tanqueos: la foto del recibo tiene que ser JPEG (una PNG, un texto cualquiera o nada no pasan)', async () => {
  await sembrarT(); const db = await cuenta('tqCon3', 'conductor'), sinFoto = TQ(); delete sinFoto.foto;
  await assertFails(setDoc(doc(db, 'tanqueos', 'ta-8'), TQ({ foto: PNG })));
  await assertFails(setDoc(doc(db, 'tanqueos', 'ta-9'), TQ({ foto: 'hola' })));
  await assertFails(setDoc(doc(db, 'tanqueos', 'ta-10'), TQ({ foto: 12345 })));
  await assertFails(setDoc(doc(db, 'tanqueos', 'ta-11'), sinFoto)); });
await prueba('Tanqueos: una foto de 400.000 caracteres o más no pasa; una de menos sí', async () => {
  await sembrarT(); const db = await cuenta('tqCon4', 'conductor');
  await assertFails(setDoc(doc(db, 'tanqueos', 'ta-12'), TQ({ foto: JPG + 'A'.repeat(400000) })));
  await assertSucceeds(setDoc(doc(db, 'tanqueos', 'ta-13'), TQ({ foto: JPG + 'A'.repeat(300000) }))); });
await prueba('Tanqueos: kilometraje, galones y valor tienen que ser números dentro de lo razonable', async () => {
  await sembrarT(); const db = await cuenta('tqCon5', 'conductor');
  await assertFails(setDoc(doc(db, 'tanqueos', 'ta-14'), TQ({ km: -1 })));
  await assertFails(setDoc(doc(db, 'tanqueos', 'ta-15'), TQ({ km: '45500' })));
  await assertFails(setDoc(doc(db, 'tanqueos', 'ta-16'), TQ({ galones: 0 })));
  await assertFails(setDoc(doc(db, 'tanqueos', 'ta-17'), TQ({ galones: 101 })));
  await assertFails(setDoc(doc(db, 'tanqueos', 'ta-18'), TQ({ valor: 0 })));
  await assertFails(setDoc(doc(db, 'tanqueos', 'ta-19'), TQ({ valor: 5000001 })));
  await assertFails(setDoc(doc(db, 'tanqueos', 'ta-20'), TQ({ valor: 'mucho' })));
  await assertSucceeds(setDoc(doc(db, 'tanqueos', 'ta-21'), TQ({ galones: 0.5, valor: 1, km: 0 }))); });
await prueba('Tanqueos: «lleno» tiene que ser verdadero o falso', async () => {
  await sembrarT(); const db = await cuenta('tqCon6', 'conductor');
  await assertFails(setDoc(doc(db, 'tanqueos', 'ta-22'), TQ({ lleno: 'si' })));
  await assertSucceeds(setDoc(doc(db, 'tanqueos', 'ta-23'), TQ({ lleno: false }))); });
await prueba('Tanqueos: un campo de más (por ejemplo «aprobado») no pasa', async () => {
  await sembrarT();
  await assertFails(setDoc(doc(await cuenta('tqCon7', 'conductor'), 'tanqueos', 'ta-24'), TQ({ aprobado: true }))); });
await prueba('Tanqueos: el carro tiene que existir', async () => {
  await sembrarT();
  await assertFails(setDoc(doc(await cuenta('tqCon8', 'conductor'), 'tanqueos', 'ta-25'), TQ({ vehiculoId: 've-no-existe' })));
  await assertFails(setDoc(doc(await cuenta('tqCon9', 'conductor'), 'tanqueos', 'ta-26'), TQ({ vehiculoId: 123 }))); });
await prueba('Tanqueos: no se editan ni se borran (ni el Conductor ni Transporte ni Bodega)', async () => {
  await sembrarT(); await sembrar(d => setDoc(doc(d, 'tanqueos', 'ta-e'), TQ()));
  for (const [uid, rol] of [['tqE1', 'conductor'], ['tqE2', 'carros'], ['tqE3', 'asistente']]) { const db = await cuenta(uid, rol);
    await assertFails(updateDoc(doc(db, 'tanqueos', 'ta-e'), { valor: 1000 }));
    await assertFails(deleteDoc(doc(db, 'tanqueos', 'ta-e'))); } });
await prueba('Tanqueos: solo la Jefe corrige o borra uno', async () => {
  await sembrarT(); await sembrar(d => setDoc(doc(d, 'tanqueos', 'ta-j'), TQ()));
  const j = await cuenta('tqJ1', 'jefe');
  await assertSucceeds(updateDoc(doc(j, 'tanqueos', 'ta-j'), { valor: 150000 }));
  await assertSucceeds(deleteDoc(doc(j, 'tanqueos', 'ta-j'))); });
await prueba('Tanqueos: sin acceso a Vehículos (Colaborador) no lee ni crea; con «solo ver» (Consulta y Gerente) lee pero no crea', async () => {
  await sembrarT(); await sembrar(d => setDoc(doc(d, 'tanqueos', 'ta-l'), TQ()));
  const col = await cuenta('tqCol', 'colaborador'), cons = await cuenta('tqCons', 'consulta'), ger = await cuenta('tqGer', 'gerente');
  await assertFails(getDoc(doc(col, 'tanqueos', 'ta-l'))); await assertFails(setDoc(doc(col, 'tanqueos', 'ta-m'), TQ({ porRol: 'colaborador' })));
  await assertSucceeds(getDoc(doc(cons, 'tanqueos', 'ta-l'))); await assertFails(setDoc(doc(cons, 'tanqueos', 'ta-n'), TQ({ porRol: 'consulta' })));
  await assertSucceeds(getDoc(doc(ger, 'tanqueos', 'ta-l'))); await assertFails(setDoc(doc(ger, 'tanqueos', 'ta-o'), TQ({ porRol: 'gerente' }))); });
await prueba('Tanqueos: un Conductor al que la Jefe le quitó Vehículos (permiso «no») ya no lo crea ni lo lee; con «reporta» sí', async () => {
  await sembrarT(); await sembrar(d => setDoc(doc(d, 'tanqueos', 'ta-p'), TQ()));
  const sin = await cuenta('tqSin', 'conductor', { permisos: { vehiculos: 'no' } }), con = await cuenta('tqConP', 'colaborador', { permisos: { vehiculos: 'reporta' } });
  await assertFails(getDoc(doc(sin, 'tanqueos', 'ta-p'))); await assertFails(setDoc(doc(sin, 'tanqueos', 'ta-q'), TQ({ porRol: 'conductor' })));
  await assertSucceeds(setDoc(doc(con, 'tanqueos', 'ta-r'), TQ({ porRol: 'colaborador' }))); });
await prueba('Tanqueos: una cuenta pausada o sin el correo confirmado no crea', async () => {
  await sembrarT();
  await assertFails(setDoc(doc(await cuenta('tqPau', 'conductor', { activo: false }), 'tanqueos', 'ta-s'), TQ()));
  await sembrar(d => setDoc(doc(d, 'usuarios', 'tqNoConf'), { nombre: 'Sin Confirmar', correo: 'tqnoconf@correo-inventado.test', rol: 'conductor', codigo: 'X', activo: true, en: '2026-11-20' }));
  await assertFails(setDoc(doc(env.authenticatedContext('tqNoConf', { email: 'tqnoconf@correo-inventado.test', email_verified: false }).firestore(), 'tanqueos', 'ta-t'), TQ())); });
await prueba('Tanqueos: la Jefe de prueba carga los datos de ejemplo (sin pasar por las revisiones del formulario) en un lote grande', async () => {
  const db = prueba_('jefe');
  await assertSucceeds(lote(db, b => { for (let i = 0; i < 30; i++) b.set(doc(db, 'tanqueos', 'ta-ej-' + i), { vehiculoId: 've-ej', placa: 'ABC 123', km: i, galones: 10, valor: 100000, lleno: true, foto: JPG, por: 'Oscar', porRol: 'conductor', fecha: '2026-11-25T10:00:00Z' }); })); });
await prueba('Tanqueos: un lote de 100 tanqueos de una cuenta propia cabe en el límite de las reglas', async () => {
  await sembrarT(); const db = await cuenta('tqLote', 'conductor');
  await assertSucceeds(lote(db, b => { for (let i = 0; i < 100; i++) b.set(doc(db, 'tanqueos', 'ta-lt-' + i), TQ({ km: 45500 + i })); })); });

console.log('Fase 11: equipos (baja, verificación y compra/garantía)');
await limpiar();
const EQ11 = extra => Object.assign({ serial: 'S1', tipo: 'Portátil', marca: 'Lenovo', modelo: 'E14', estado: 'bodega', asignadoA: '', asignadoCedula: '', proyecto: '', ultimoMtto: '', ultimoBackup: '', obs: '', pendientes: { mtto: false, backup: false }, historial: H1 }, extra);
const BP = extra => Object.assign({ motivo: 'danado', nota: 'No enciende y no tiene arreglo', por: 'Persona', porRol: 'equipos', en: '2026-11-25' }, extra);
const sembrarEq = (id, extra) => sembrar(d => setDoc(doc(d, 'equipos', id), EQ11(extra)));
await prueba('Baja: el Encargado pide la baja de un equipo en bodega y de uno en Recibidos, con su línea de historial', async () => {
  await sembrarEq('eq-b1'); await sembrarEq('eq-b2', { estado: 'recibido' }); const enc = await cuenta('bjEnc', 'equipos');
  await assertSucceeds(updateDoc(doc(enc, 'equipos', 'eq-b1'), { bajaPedida: BP(), historial: H2 }));
  await assertSucceeds(updateDoc(doc(enc, 'equipos', 'eq-b2'), { bajaPedida: BP({ motivo: 'obsoleto' }), historial: H2 })); });
await prueba('Baja: la persona de prueba Encargado de equipos también la pide', async () => {
  await sembrarEq('eq-b3'); await assertSucceeds(updateDoc(doc(prueba_('equipos'), 'equipos', 'eq-b3'), { bajaPedida: BP(), historial: H2 })); });
await prueba('Baja: un equipo asignado no se pide para baja (primero se recibe)', async () => {
  await sembrarEq('eq-b4', { estado: 'asignado', asignadoA: 'Persona Uno', asignadoCedula: '123456' });
  await assertFails(updateDoc(doc(await cuenta('bjEnc2', 'equipos'), 'equipos', 'eq-b4'), { bajaPedida: BP(), historial: H2 })); });
await prueba('Baja: el motivo tiene que ser uno de los 4, la nota de 5 a 200 letras y no puede haber campos de más', async () => {
  await sembrarEq('eq-b5'); const enc = await cuenta('bjEnc3', 'equipos');
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-b5'), { bajaPedida: BP({ motivo: 'me dio pereza' }), historial: H2 }));
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-b5'), { bajaPedida: BP({ nota: 'no' }), historial: H2 }));
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-b5'), { bajaPedida: BP({ nota: 'x'.repeat(201) }), historial: H2 }));
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-b5'), { bajaPedida: BP({ aprobada: true }), historial: H2 }));
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-b5'), { bajaPedida: 'dañado', historial: H2 }));
  await assertSucceeds(updateDoc(doc(enc, 'equipos', 'eq-b5'), { bajaPedida: BP({ nota: 'x'.repeat(200) }), historial: H2 })); });
await prueba('Baja: sin la línea nueva de historial, o junto con otro dato, no pasa', async () => {
  await sembrarEq('eq-b6'); const enc = await cuenta('bjEnc4', 'equipos');
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-b6'), { bajaPedida: BP() }));
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-b6'), { bajaPedida: BP(), obs: 'otra cosa', historial: H2 })); });
await prueba('Baja: el Encargado no la aprueba (no pone el estado «baja»), ni quita la solicitud, ni pide otra encima', async () => {
  await sembrarEq('eq-b7', { bajaPedida: BP() }); const enc = await cuenta('bjEnc5', 'equipos');
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-b7'), { estado: 'baja', bajaPor: 'Persona', bajaEn: '2026-11-25', historial: H2 }));
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-b7'), { bajaPedida: null, historial: H2 }));
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-b7'), { bajaPedida: BP({ nota: 'otra nota distinta' }), historial: H2 })); });
await prueba('Baja: Soporte intenta dar de baja (pedirla o aprobarla) y falla; Compras y el Gerente tampoco', async () => {
  await sembrarEq('eq-b8'); await sembrarEq('eq-b9', { bajaPedida: BP() });
  const sop = await cuenta('bjSop', 'soporte'), ger = await cuenta('bjGer', 'gerente');
  await assertFails(updateDoc(doc(sop, 'equipos', 'eq-b8'), { bajaPedida: BP({ porRol: 'soporte' }), historial: H2 }));
  await assertFails(updateDoc(doc(sop, 'equipos', 'eq-b9'), { estado: 'baja', bajaPor: 'Persona', bajaEn: '2026-11-25', historial: H2 }));
  await assertFails(updateDoc(doc(ger, 'equipos', 'eq-b9'), { estado: 'baja', bajaPor: 'Persona', bajaEn: '2026-11-25', historial: H2 }));
  await assertFails(updateDoc(doc(await cuenta('bjCom', 'compras'), 'equipos', 'eq-b8'), { bajaPedida: BP({ porRol: 'compras' }), historial: H2 })); });
await prueba('Baja: la Jefe aprueba lo pedido (estado «baja», fecha y quién la aprobó, con su línea de historial)', async () => {
  await sembrarEq('eq-c1', { bajaPedida: BP() }); const jef = await cuenta('bjJef', 'jefe');
  await assertSucceeds(updateDoc(doc(jef, 'equipos', 'eq-c1'), { estado: 'baja', bajaPedida: BP(), bajaPor: 'Persona Jefe', bajaEn: '2026-11-25', historial: H2 })); });
await prueba('Baja: la Jefe no cambia lo que pidió el Encargado al aprobarla, ni aprueba sin fecha, ni uno asignado', async () => {
  await sembrarEq('eq-c2', { bajaPedida: BP() }); await sembrarEq('eq-c3', { estado: 'asignado', asignadoA: 'Persona Uno', bajaPedida: BP() }); const jef = await cuenta('bjJef2', 'jefe');
  await assertFails(updateDoc(doc(jef, 'equipos', 'eq-c2'), { estado: 'baja', bajaPedida: BP({ motivo: 'robado' }), bajaPor: 'Persona Jefe', bajaEn: '2026-11-25', historial: H2 }));
  await assertFails(updateDoc(doc(jef, 'equipos', 'eq-c2'), { estado: 'baja', bajaPedida: BP(), bajaPor: 'Persona Jefe', bajaEn: 'ayer', historial: H2 }));
  await assertFails(updateDoc(doc(jef, 'equipos', 'eq-c3'), { estado: 'baja', bajaPedida: BP(), bajaPor: 'Persona Jefe', bajaEn: '2026-11-25', historial: H2 })); });
await prueba('Baja: la Jefe también la da directa (sin solicitud) con motivo y nota; sin eso no pasa', async () => {
  await sembrarEq('eq-d1'); await sembrarEq('eq-d2'); const jef = await cuenta('bjJef3', 'jefe');
  await assertFails(updateDoc(doc(jef, 'equipos', 'eq-d1'), { estado: 'baja', bajaPor: 'Persona Jefe', bajaEn: '2026-11-25', historial: H2 }));
  await assertFails(updateDoc(doc(jef, 'equipos', 'eq-d1'), { estado: 'baja', bajaPedida: BP({ nota: 'ok' }), bajaPor: 'Persona Jefe', bajaEn: '2026-11-25', historial: H2 }));
  await assertSucceeds(updateDoc(doc(jef, 'equipos', 'eq-d2'), { estado: 'baja', bajaPedida: BP({ porRol: 'jefe' }), bajaPor: 'Persona Jefe', bajaEn: '2026-11-25', historial: H2 })); });
await prueba('Baja: la Jefe puede no aprobar (quita la solicitud con su línea de historial); el Encargado no', async () => {
  await sembrarEq('eq-e1', { bajaPedida: BP() }); await sembrarEq('eq-e2', { bajaPedida: BP() });
  await assertSucceeds(updateDoc(doc(await cuenta('bjJef4', 'jefe'), 'equipos', 'eq-e1'), { bajaPedida: null, historial: H2 }));
  await assertFails(updateDoc(doc(await cuenta('bjEnc6', 'equipos'), 'equipos', 'eq-e2'), { bajaPedida: null, historial: H2 })); });
await prueba('Baja: un equipo de baja ya no se mueve: ni el Encargado (volverlo a bodega, cambiar datos) ni la Jefe (quitarle la baja)', async () => {
  await sembrarEq('eq-f1', { estado: 'baja', bajaPedida: BP(), bajaPor: 'Persona Jefe', bajaEn: '2026-11-25' });
  const enc = await cuenta('bjEnc7', 'equipos'), jef = await cuenta('bjJef5', 'jefe');
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-f1'), { estado: 'bodega', historial: H2 }));
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-f1'), { obs: 'lo arreglé', historial: H2 }));
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-f1'), { proveedor: 'Otro', historial: H2 }));
  await assertFails(updateDoc(doc(jef, 'equipos', 'eq-f1'), { bajaPedida: null, historial: H2 }));
  await assertFails(updateDoc(doc(jef, 'equipos', 'eq-f1'), { verificadoEn: '2026-11-25', verificadoPor: 'Persona' })); });
await prueba('Verificar: Soporte y la Jefe dejan la fecha y quién verificó, sin tocar nada más (sin línea de historial)', async () => {
  await sembrarEq('eq-v1'); await sembrarEq('eq-v2');
  await assertSucceeds(updateDoc(doc(await cuenta('vrSop', 'soporte'), 'equipos', 'eq-v1'), { verificadoEn: '2026-11-25', verificadoPor: 'Persona Soporte' }));
  await assertSucceeds(updateDoc(doc(await cuenta('vrJef', 'jefe'), 'equipos', 'eq-v2'), { verificadoEn: '2026-11-25', verificadoPor: 'Persona Jefe' })); });
await prueba('Verificar: la persona de prueba de Soporte también', async () => {
  await sembrarEq('eq-v3'); await assertSucceeds(updateDoc(doc(prueba_('soporte'), 'equipos', 'eq-v3'), { verificadoEn: '2026-11-25', verificadoPor: 'Ángel' })); });
await prueba('Verificar: con una fecha mala, con otro dato junto (el estado, la baja) o por quien no es Soporte ni la Jefe, no pasa', async () => {
  await sembrarEq('eq-v4'); const sop = await cuenta('vrSop2', 'soporte');
  await assertFails(updateDoc(doc(sop, 'equipos', 'eq-v4'), { verificadoEn: 'hoy', verificadoPor: 'Persona' }));
  await assertFails(updateDoc(doc(sop, 'equipos', 'eq-v4'), { verificadoEn: '2026-11-25', verificadoPor: 'x'.repeat(81) }));
  await assertFails(updateDoc(doc(sop, 'equipos', 'eq-v4'), { verificadoEn: '2026-11-25', verificadoPor: 'Persona', estado: 'asignado' }));
  await assertFails(updateDoc(doc(sop, 'equipos', 'eq-v4'), { verificadoEn: '2026-11-25', verificadoPor: 'Persona', obs: 'cambio' }));
  await assertFails(updateDoc(doc(await cuenta('vrEnc', 'equipos'), 'equipos', 'eq-v4'), { verificadoEn: '2026-11-25', verificadoPor: 'Persona' }));
  await assertFails(updateDoc(doc(await cuenta('vrCol', 'colaborador'), 'equipos', 'eq-v4'), { verificadoEn: '2026-11-25', verificadoPor: 'Persona' }));
  await assertFails(updateDoc(doc(await cuenta('vrGer', 'gerente'), 'equipos', 'eq-v4'), { verificadoEn: '2026-11-25', verificadoPor: 'Persona' })); });
await prueba('Verificar: un lote de 100 equipos de una cuenta propia de Soporte cabe en el límite de las reglas', async () => {
  await sembrar(async d => { for (let i = 0; i < 100; i++) await setDoc(doc(d, 'equipos', 'eq-vl' + i), EQ11({ serial: 'VL' + i })); });
  const sop = await cuenta('vrSop3', 'soporte');
  await assertSucceeds(lote(sop, b => { for (let i = 0; i < 100; i++) b.update(doc(sop, 'equipos', 'eq-vl' + i), { verificadoEn: '2026-11-25', verificadoPor: 'Persona Soporte' }); })); });
await prueba('Compra y garantía: el Encargado anota fecha de compra, garantía, proveedor y costo, con su línea de historial', async () => {
  await sembrarEq('eq-g1'); const enc = await cuenta('cgEnc', 'equipos');
  await assertSucceeds(updateDoc(doc(enc, 'equipos', 'eq-g1'), { fechaCompra: '2025-01-10', garantiaHasta: '2027-01-10', proveedor: 'Tecnoventas Ejemplo', costo: 3200000, historial: H2 }));
  await assertSucceeds(updateDoc(doc(enc, 'equipos', 'eq-g1'), { fechaCompra: '', garantiaHasta: '', proveedor: '', costo: 0, historial: H3 })); });
await prueba('Compra y garantía: fechas mal escritas, costo negativo o con letras, proveedor larguísimo y sin historial, no pasan', async () => {
  await sembrarEq('eq-g2'); const enc = await cuenta('cgEnc2', 'equipos');
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-g2'), { fechaCompra: 'ayer', historial: H2 }));
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-g2'), { garantiaHasta: '10/01/2027', historial: H2 }));
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-g2'), { costo: -1, historial: H2 }));
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-g2'), { costo: 'caro', historial: H2 }));
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-g2'), { costo: 2000000000, historial: H2 }));
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-g2'), { proveedor: 'x'.repeat(61), historial: H2 }));
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-g2'), { proveedor: 123, historial: H2 }));
  await assertFails(updateDoc(doc(enc, 'equipos', 'eq-g2'), { costo: 100000 })); });
await prueba('Compra y garantía: Soporte no la cambia; al registrar un equipo nuevo se puede anotar (y un costo negativo no pasa)', async () => {
  await sembrarEq('eq-g3');
  await assertFails(updateDoc(doc(await cuenta('cgSop', 'soporte'), 'equipos', 'eq-g3'), { costo: 100, historial: H2 }));
  const enc = await cuenta('cgEnc3', 'equipos');
  await assertSucceeds(setDoc(doc(enc, 'equipos', 'eq-nuevo9'), EQ11({ serial: 'NUEVO9', fechaCompra: '2026-11-01', garantiaHasta: '2027-11-01', proveedor: 'Equipos del Caribe Ejemplo', costo: 1500000 })));
  await assertFails(setDoc(doc(enc, 'equipos', 'eq-nuevo8'), EQ11({ serial: 'NUEVO8', costo: -5 })));
  await assertFails(setDoc(doc(enc, 'equipos', 'eq-nuevo7'), EQ11({ serial: 'NUEVO7', fechaCompra: 'mañana' }))); });
await prueba('Baja: la Jefe de prueba carga los datos de ejemplo con equipos de baja sin pasar por las revisiones', async () => {
  const db = prueba_('jefe'); await assertSucceeds(setDoc(doc(db, 'equipos', 'eq-ej1'), EQ11({ serial: 'EJ1', estado: 'baja', bajaPedida: BP(), bajaPor: 'Persona Jefe', bajaEn: '2026-11-25' }))); });
await prueba('Baja: un lote de 100 equipos dados de baja por una cuenta propia de la Jefe cabe en el límite de las reglas', async () => {
  await sembrar(async d => { for (let i = 0; i < 100; i++) await setDoc(doc(d, 'equipos', 'eq-bl' + i), EQ11({ serial: 'BL' + i, bajaPedida: BP() })); });
  const jef = await cuenta('bjJef6', 'jefe');
  await assertSucceeds(lote(jef, b => { for (let i = 0; i < 100; i++) b.update(doc(jef, 'equipos', 'eq-bl' + i), { estado: 'baja', bajaPedida: BP(), bajaPor: 'Persona Jefe', bajaEn: '2026-11-25', historial: H2 }); })); });

console.log('Fase 13: código del artículo y fecha del último conteo');
await limpiar();
const AR13 = extra => Object.assign({ nombre: 'Guantes', categoria: 'EPP', unidad: 'pares', cantidad: 0, minimo: 2, maximo: 10, ubicacion: 'Estante A1', costo: 12000, proveedor: 'Ferretería', bodega: 'Riohacha' }, extra);
await prueba('Código: Bodega crea un artículo con código de 3 a 30 letras o números en mayúscula, o sin código', async () => {
  const bod = await cuenta('cdBod', 'asistente');
  await assertSucceeds(setDoc(doc(bod, 'articulos', 'ar-cd1'), AR13({ codigo: 'BOT042' })));
  await assertSucceeds(setDoc(doc(bod, 'articulos', 'ar-cd2'), AR13({ codigo: 'ABC' })));
  await assertSucceeds(setDoc(doc(bod, 'articulos', 'ar-cd3'), AR13({ codigo: '7'.repeat(30) })));
  await assertSucceeds(setDoc(doc(bod, 'articulos', 'ar-cd4'), AR13({ codigo: '' })));
  await assertSucceeds(setDoc(doc(bod, 'articulos', 'ar-cd5'), AR13())); });
await prueba('Código: en minúscula, con guion, con espacio, muy corto, muy largo o que no es texto, no pasa', async () => {
  const bod = await cuenta('cdBod2', 'asistente');
  for (const [i, c] of [['a', 'bot042'], ['b', 'BOT-042'], ['c', 'BOT 042'], ['d', 'AB'], ['e', '7'.repeat(31)], ['f', 12345], ['g', 'ÑANDÚ1']]) await assertFails(setDoc(doc(bod, 'articulos', 'ar-cx' + i), AR13({ codigo: c }))); });
await prueba('Código y último conteo: Bodega los pone y los cambia en un artículo que ya existe (sin tocar la cantidad)', async () => {
  await sembrar(d => setDoc(doc(d, 'articulos', 'ar-cd6'), AR13({ cantidad: 5 })));
  const bod = await cuenta('cdBod3', 'asistente');
  await assertSucceeds(updateDoc(doc(bod, 'articulos', 'ar-cd6'), { codigo: 'GUA001' }));
  await assertSucceeds(updateDoc(doc(bod, 'articulos', 'ar-cd6'), { ultimoConteo: '2026-11-25' }));
  await assertSucceeds(updateDoc(doc(bod, 'articulos', 'ar-cd6'), { codigo: '', ultimoConteo: '' })); });
await prueba('Código y último conteo: con formato malo no pasan (código con guion, fecha «ayer» o con otro formato, fecha que no es texto)', async () => {
  await sembrar(d => setDoc(doc(d, 'articulos', 'ar-cd7'), AR13({ cantidad: 5 })));
  const bod = await cuenta('cdBod4', 'asistente');
  await assertFails(updateDoc(doc(bod, 'articulos', 'ar-cd7'), { codigo: 'GUA-001' }));
  await assertFails(updateDoc(doc(bod, 'articulos', 'ar-cd7'), { ultimoConteo: 'ayer' }));
  await assertFails(updateDoc(doc(bod, 'articulos', 'ar-cd7'), { ultimoConteo: '25/11/2026' }));
  await assertFails(updateDoc(doc(bod, 'articulos', 'ar-cd7'), { ultimoConteo: 20261125 })); });
await prueba('Código y último conteo: quien no maneja la bodega (Conductor, Colaborador, Gerente, Consulta) no los cambia', async () => {
  await sembrar(d => setDoc(doc(d, 'articulos', 'ar-cd8'), AR13({ cantidad: 5 })));
  for (const [uid, rol] of [['cdCon', 'conductor'], ['cdCol', 'colaborador'], ['cdGer', 'gerente'], ['cdCons', 'consulta']]) { const db = await cuenta(uid, rol);
    await assertFails(updateDoc(doc(db, 'articulos', 'ar-cd8'), { codigo: 'HACK01' }));
    await assertFails(updateDoc(doc(db, 'articulos', 'ar-cd8'), { ultimoConteo: '2026-11-25' })); } });
await prueba('Conteo con diferencia: la cantidad cambia junto con su movimiento y la fecha del último conteo; sin el movimiento no pasa', async () => {
  await sembrar(d => setDoc(doc(d, 'articulos', 'ar-cd9'), AR13({ cantidad: 5 })));
  const bod = await cuenta('cdBod5', 'asistente');
  await assertFails(updateDoc(doc(bod, 'articulos', 'ar-cd9'), { cantidad: 3, ultimoConteo: '2026-11-25' }));
  await assertSucceeds(lote(bod, b => { b.update(doc(bod, 'articulos', 'ar-cd9'), { cantidad: 3, ultimoMov: 'mo-cd9', ultimoConteo: '2026-11-25' });
    b.set(doc(bod, 'movimientos', 'mo-cd9'), movDe({ articuloId: 'ar-cd9', tipo: 'ajuste', motivo: 'conteo', cantidad: -2, saldo: 3 })); })); });
await prueba('Conteo: un lote de 100 artículos que cuadran (solo la fecha del conteo) de una cuenta propia de Bodega cabe en el límite de las reglas', async () => {
  await sembrar(async d => { for (let i = 0; i < 100; i++) await setDoc(doc(d, 'articulos', 'ar-lc' + i), AR13({ nombre: 'Art ' + i, cantidad: 4 })); });
  const bod = await cuenta('cdBod6', 'asistente');
  await assertSucceeds(lote(bod, b => { for (let i = 0; i < 100; i++) b.set(doc(bod, 'articulos', 'ar-lc' + i), { ultimoConteo: '2026-11-25' }, { merge: true }); })); });
await prueba('Código: la Jefe de prueba carga los datos de ejemplo con códigos sin pasar por las revisiones', async () => {
  await assertSucceeds(setDoc(doc(prueba_('jefe'), 'articulos', 'ar-ej9'), AR13({ cantidad: 4, codigo: '7700000000013', ultimoConteo: '2026-10-11' }))); });

console.log('Fase 12: proveedores');
await limpiar();
const PV = (rol, o = {}) => Object.assign({ nombre: 'Ferretería El Faro', nit: '900000001-2', contacto: 'Marta Ejemplo', telefono: '300 000 0001', correo: 'ventas@elfaro.example.com', nota: 'Entrega en 2 días', por: 'Persona de prueba', porRol: rol, en: '2026-11-25' }, o);
await prueba('Proveedores: Compras crea un proveedor (completo, o solo con el nombre y sin NIT)', async () => {
  const com = await cuenta('pvCom1', 'compras');
  await assertSucceeds(setDoc(doc(com, 'proveedores', 'pv-elfaro'), PV('compras')));
  await assertSucceeds(setDoc(doc(com, 'proveedores', 'pv-aguaclara'), { nombre: 'Distribuidora Agua Clara', nit: '', contacto: '', telefono: '', correo: '', nota: '', por: 'Persona de prueba', porRol: 'compras', en: '2026-11-25' })); });
await prueba('Proveedores: la Jefe y Bodega con el extra «compra» también los crean; Bodega sin el extra, no', async () => {
  await assertSucceeds(setDoc(doc(await cuenta('pvJef1', 'jefe'), 'proveedores', 'pv-jefe1'), PV('jefe', { nombre: 'Papelería Central', nit: '900000003-7' })));
  await assertSucceeds(setDoc(doc(await cuenta('pvBod1', 'asistente', { extras: ['compra'] }), 'proveedores', 'pv-bodega1'), PV('asistente', { nombre: 'Tecnoventas Ejemplo S. A. S.', nit: '901234567-7' })));
  await assertFails(setDoc(doc(await cuenta('pvBod2', 'asistente'), 'proveedores', 'pv-bodega2'), PV('asistente', { nombre: 'Otro proveedor', nit: '' }))); });
await prueba('Proveedores: la Coordinadora, el Financiero, el Gerente, el Conductor, el Colaborador y Consulta no los crean', async () => {
  for (const [uid, rol] of [['pvCoo', 'coordcompras'], ['pvFin', 'financiero'], ['pvGer', 'gerente'], ['pvCon', 'conductor'], ['pvCol', 'colaborador'], ['pvCons', 'consulta']])
    await assertFails(setDoc(doc(await cuenta(uid, rol), 'proveedores', 'pv-x' + uid.toLowerCase()), PV(rol))); });
await prueba('Proveedores: sin nombre, con nombre de una letra o de más de 80, no pasan', async () => {
  const com = await cuenta('pvCom2', 'compras');
  for (const [i, n] of [['a', ''], ['b', 'X'], ['c', 'N'.repeat(81)], ['d', 12345]]) await assertFails(setDoc(doc(com, 'proveedores', 'pv-nom' + i), PV('compras', { nombre: n })));
  await assertSucceeds(setDoc(doc(com, 'proveedores', 'pv-nome'), PV('compras', { nombre: 'N'.repeat(80), nit: '' }))); });
await prueba('Proveedores: un NIT mal escrito (sin guion, con puntos, con dos dígitos al final o con letras) no pasa', async () => {
  const com = await cuenta('pvCom3', 'compras');
  for (const [i, nit] of [['a', '9000000012'], ['b', '900.000.001-2'], ['c', '900000001-12'], ['d', '9000-2'], ['e', 'ABC-1'], ['f', 900000001]]) await assertFails(setDoc(doc(com, 'proveedores', 'pv-nit' + i), PV('compras', { nit })));
  await assertSucceeds(setDoc(doc(com, 'proveedores', 'pv-nitg'), PV('compras', { nombre: 'Nit de quince', nit: '123456789012345-0' }))); });
await prueba('Proveedores: un correo sin arroba, un texto muy largo o un campo de más no pasan', async () => {
  const com = await cuenta('pvCom4', 'compras');
  await assertFails(setDoc(doc(com, 'proveedores', 'pv-cor1'), PV('compras', { correo: 'ventas.elfaro' })));
  await assertFails(setDoc(doc(com, 'proveedores', 'pv-cor2'), PV('compras', { nota: 'x'.repeat(201) })));
  await assertFails(setDoc(doc(com, 'proveedores', 'pv-cor3'), PV('compras', { telefono: '3'.repeat(26) })));
  await assertFails(setDoc(doc(com, 'proveedores', 'pv-cor4'), PV('compras', { contacto: 'c'.repeat(61) })));
  await assertFails(setDoc(doc(com, 'proveedores', 'pv-cor5'), PV('compras', { activo: true }))); });
await prueba('Proveedores: no se pone a nombre de otro rol, con otra fecha rara ni con un código que no es pv-…', async () => {
  const com = await cuenta('pvCom5', 'compras');
  await assertFails(setDoc(doc(com, 'proveedores', 'pv-rol1'), PV('jefe')));
  await assertFails(setDoc(doc(com, 'proveedores', 'pv-rol2'), PV('compras', { en: 'ayer' })));
  await assertFails(setDoc(doc(com, 'proveedores', 'PV-ROL3'), PV('compras')));
  await assertFails(setDoc(doc(com, 'proveedores', 'xx-rol4'), PV('compras')));
  await assertFails(setDoc(doc(com, 'proveedores', 'pv-ab'), PV('compras'))); });
await prueba('Proveedores: los ven Compras, la Coordinadora, Bodega, el Financiero, el Gerente y la Jefe; no los ven el Conductor, Consulta ni quien está sin acceso al inventario', async () => {
  await sembrar(d => setDoc(doc(d, 'proveedores', 'pv-lee1'), PV('compras')));
  for (const [uid, rol] of [['pvL1', 'compras'], ['pvL2', 'coordcompras'], ['pvL3', 'asistente'], ['pvL4', 'financiero'], ['pvL5', 'gerente'], ['pvL6', 'jefe']]) await assertSucceeds(getDoc(doc(await cuenta(uid, rol), 'proveedores', 'pv-lee1')));
  for (const [uid, rol] of [['pvN1', 'conductor'], ['pvN2', 'consulta'], ['pvN3', 'colaborador'], ['pvN4', 'carros'], ['pvN5', 'logistica']]) await assertFails(getDoc(doc(await cuenta(uid, rol), 'proveedores', 'pv-lee1')));
  await assertFails(getDoc(doc(await cuenta('pvN6', 'compras', { permisos: { inventario: 'no' } }), 'proveedores', 'pv-lee1')));
  await assertFails(getDoc(doc(anonimo(), 'proveedores', 'pv-lee1')));
  await assertSucceeds(getDocs(collection(prueba_('compras'), 'proveedores'))); });
await prueba('Proveedores: Compras cambia el nombre, el NIT, el contacto, el teléfono, el correo y la nota; no quién lo creó ni cuándo', async () => {
  await sembrar(d => setDoc(doc(d, 'proveedores', 'pv-ed1'), PV('compras')));
  const com = await cuenta('pvCom6', 'compras');
  await assertSucceeds(updateDoc(doc(com, 'proveedores', 'pv-ed1'), { nombre: 'Ferretería El Faro S. A. S.', nit: '900000003-7', contacto: 'Luis Ejemplo', telefono: '300 000 0003', correo: 'otro@elfaro.example.com', nota: '' }));
  await assertFails(updateDoc(doc(com, 'proveedores', 'pv-ed1'), { por: 'Otra persona' }));
  await assertFails(updateDoc(doc(com, 'proveedores', 'pv-ed1'), { porRol: 'jefe' }));
  await assertFails(updateDoc(doc(com, 'proveedores', 'pv-ed1'), { en: '2020-01-01' }));
  await assertFails(updateDoc(doc(com, 'proveedores', 'pv-ed1'), { activo: false })); });
await prueba('Proveedores: al cambiarlo, el NIT y el correo siguen con su formato (nada de dejar un nombre vacío)', async () => {
  const com = await cuenta('pvCom7', 'compras');
  await assertFails(updateDoc(doc(com, 'proveedores', 'pv-ed1'), { nit: '123' }));
  await assertFails(updateDoc(doc(com, 'proveedores', 'pv-ed1'), { correo: 'sin-arroba' }));
  await assertFails(updateDoc(doc(com, 'proveedores', 'pv-ed1'), { nombre: '' }));
  await assertSucceeds(updateDoc(doc(com, 'proveedores', 'pv-ed1'), { nit: '' })); });
await prueba('Proveedores: la Coordinadora, el Financiero, el Gerente y Bodega sin el extra no los cambian', async () => {
  for (const [uid, rol] of [['pvE1', 'coordcompras'], ['pvE2', 'financiero'], ['pvE3', 'gerente'], ['pvE4', 'asistente']]) await assertFails(updateDoc(doc(await cuenta(uid, rol), 'proveedores', 'pv-ed1'), { nota: 'cambiada' }));
  await assertSucceeds(updateDoc(doc(await cuenta('pvE5', 'asistente', { extras: ['compra'] }), 'proveedores', 'pv-ed1'), { nota: 'la cambia Bodega con el extra' })); });
await prueba('Proveedores: solo la Jefe los borra', async () => {
  await sembrar(async d => { await setDoc(doc(d, 'proveedores', 'pv-bo1'), PV('compras')); await setDoc(doc(d, 'proveedores', 'pv-bo2'), PV('compras')); });
  await assertFails(deleteDoc(doc(await cuenta('pvB1', 'compras'), 'proveedores', 'pv-bo1')));
  await assertFails(deleteDoc(doc(await cuenta('pvB2', 'asistente', { extras: ['compra'] }), 'proveedores', 'pv-bo1')));
  await assertSucceeds(deleteDoc(doc(await cuenta('pvB3', 'jefe'), 'proveedores', 'pv-bo1')));
  await assertSucceeds(deleteDoc(doc(prueba_('jefe'), 'proveedores', 'pv-bo2'))); });
await prueba('Proveedores: la Jefe de prueba carga los datos de ejemplo sin pasar por las revisiones', async () => {
  await assertSucceeds(setDoc(doc(prueba_('jefe'), 'proveedores', 'pv-elfaro2'), { nombre: 'Ferretería El Faro', nit: '900000001-2', contacto: 'Marta Ejemplo', telefono: '300 000 0001', correo: 'ventas@elfaro.example.com', nota: '', por: 'Fredy Torres', porRol: 'compras', en: '2026-08-07' })); });
await prueba('Compra con proveedor: Compras registra la compra con el id de un proveedor que ya existe', async () => {
  await sembrar(async d => { await setDoc(doc(d, 'proveedores', 'pv-existe'), PV('compras')); await setDoc(doc(d, 'compras', 'co-pv1'), compra({ estado: 'autorizado' })); });
  await assertSucceeds(updateDoc(doc(await cuenta('pvC1', 'compras'), 'compras', 'co-pv1'), { estado: 'comprado', proveedor: 'Ferretería El Faro', proveedorId: 'pv-existe', valorReal: 100000, fechaCompra: '2026-11-25', factura: '', historial: H1 })); });
await prueba('Compra con proveedor: con un id que no existe, o que no es pv-…, no pasa', async () => {
  await sembrar(async d => { await setDoc(doc(d, 'compras', 'co-pv2'), compra({ estado: 'autorizado' })); await setDoc(doc(d, 'compras', 'co-pv3'), compra({ estado: 'autorizado' })); });
  const com = await cuenta('pvC2', 'compras');
  await assertFails(updateDoc(doc(com, 'compras', 'co-pv2'), { estado: 'comprado', proveedor: 'Fantasma', proveedorId: 'pv-fantasma', valorReal: 100000, fechaCompra: '2026-11-25', factura: '', historial: H1 }));
  await assertFails(updateDoc(doc(com, 'compras', 'co-pv3'), { estado: 'comprado', proveedor: 'Raro', proveedorId: 'cualquier-cosa', valorReal: 100000, fechaCompra: '2026-11-25', factura: '', historial: H1 })); });
await prueba('Compra con proveedor nuevo: se crea el proveedor y se registra la compra en la misma escritura', async () => {
  await sembrar(d => setDoc(doc(d, 'compras', 'co-pv4'), compra({ estado: 'autorizado' })));
  const com = await cuenta('pvC3', 'compras');
  await assertSucceeds(lote(com, b => { b.set(doc(com, 'proveedores', 'pv-nuevo1'), { nombre: 'Almacén Nuevo', nit: '', contacto: '', telefono: '', correo: '', nota: '', por: 'Persona de prueba', porRol: 'compras', en: '2026-11-25' });
    b.update(doc(com, 'compras', 'co-pv4'), { estado: 'comprado', proveedor: 'Almacén Nuevo', proveedorId: 'pv-nuevo1', valorReal: 100000, fechaCompra: '2026-11-25', factura: '', historial: H1 }); })); });
await prueba('Compra con proveedor nuevo: si el proveedor no se crea (o se crea mal), la compra tampoco pasa', async () => {
  await sembrar(d => setDoc(doc(d, 'compras', 'co-pv5'), compra({ estado: 'autorizado' })));
  const com = await cuenta('pvC4', 'compras');
  await assertFails(lote(com, b => { b.set(doc(com, 'proveedores', 'pv-malo1'), { nombre: 'X', nit: '', contacto: '', telefono: '', correo: '', nota: '', por: 'Persona de prueba', porRol: 'compras', en: '2026-11-25' });
    b.update(doc(com, 'compras', 'co-pv5'), { estado: 'comprado', proveedor: 'X', proveedorId: 'pv-malo1', valorReal: 100000, fechaCompra: '2026-11-25', factura: '', historial: H1 }); })); });
await prueba('Compra sin autorización con proveedor: lo pide un proveedor que existe; con uno inventado, no', async () => {
  await sembrar(d => setDoc(doc(d, 'proveedores', 'pv-sinaut'), PV('compras')));
  const com = await cuenta('pvC5', 'compras'), correo = correoCuenta('pvC5');
  await assertSucceeds(setDoc(doc(com, 'compras', 'co-pv6'), nueva(correo, { estado: 'sin-autorizar', pideRol: 'compras', proveedor: 'Ferretería El Faro', proveedorId: 'pv-sinaut', valorReal: 96000, fechaCompra: '2026-11-25', historial: H1 })));
  await assertFails(setDoc(doc(com, 'compras', 'co-pv7'), nueva(correo, { estado: 'sin-autorizar', pideRol: 'compras', proveedor: 'Ferretería El Faro', proveedorId: 'pv-inventado', valorReal: 96000, fechaCompra: '2026-11-25', historial: H1 }))); });
await prueba('Compra con proveedor: una vez recibida, nadie le cambia el proveedor (ni Bodega ni Compras)', async () => {
  await sembrar(async d => { await setDoc(doc(d, 'proveedores', 'pv-fijo'), PV('compras')); await setDoc(doc(d, 'compras', 'co-pv8'), compra({ estado: 'comprado', proveedor: 'Ferretería El Faro', proveedorId: 'pv-fijo', valorReal: 100000, fechaCompra: '2026-11-25', historial: H2 })); });
  await assertFails(updateDoc(doc(await cuenta('pvC6', 'compras'), 'compras', 'co-pv8'), { proveedorId: 'pv-otro' }));
  await assertFails(updateDoc(doc(await cuenta('pvC7', 'asistente'), 'compras', 'co-pv8'), { estado: 'recibido', entregadoA: 'Sofía', proveedorId: 'pv-otro', historial: H3 }));
  await assertSucceeds(updateDoc(doc(await cuenta('pvC8', 'asistente'), 'compras', 'co-pv8'), { estado: 'recibido', entregadoA: 'Sofía', historial: H3 })); });

await env.cleanup();
console.log(`\n${ok} pruebas bien, ${fallas.length} con falla.`);
if (fallas.length) { console.log('Fallaron:\n - ' + fallas.join('\n - ')); process.exit(1); }
