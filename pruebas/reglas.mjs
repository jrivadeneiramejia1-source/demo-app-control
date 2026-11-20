/* reglas.mjs — Prueba las reglas de firestore.rules contra el emulador de Firestore (Firebase local, gratis).
   Se corre con:  npm run reglas   (el emulador arranca solo). Cada prueba usa una persona y dice si Firebase debe dejar o negar.
   Los datos son inventados. Las pruebas «de ataque» intentan lo prohibido y deben fallar. */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';

// Una persona de prueba por rol (del organigrama de la empresa). El rol va al principio del correo.
const CORREOS = {
  gerente: 'gerente.oscar.munoz@example.com', jefe: 'jefe.carolina.castillo@example.com', equipos: 'equipos.fabian.barbosa@example.com', soporte: 'soporte.angel.ortiz@example.com',
  compras: 'compras.mauricio.giraldo@example.com', asistente: 'asistente.andres.beltran@example.com', carros: 'carros.wilson.munoz@example.com', conductor: 'conductor.oscar.farfan@example.com',
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
await prueba('Bodega crea un artículo con cantidad válida (empieza en 0; con más, trae su movimiento: ver paso 6)', () => assertSucceeds(setDoc(doc(prueba_('asistente'), 'articulos', 'ar-9'), { nombre: 'X', cantidad: 0 })));

console.log('Compras');
await limpiar();
await prueba('quien pide crea la compra a su nombre', () => assertSucceeds(setDoc(doc(prueba_('logistica'), 'compras', 'co-1'), nueva('logistica'))));
await prueba('nadie pide a nombre de otro rol', () => assertFails(setDoc(doc(prueba_('logistica'), 'compras', 'co-2'), nueva('logistica', { pideRol: 'jefe' }))));
await prueba('quien pide no se la autoriza solo', () => assertFails(updateDoc(doc(prueba_('logistica'), 'compras', 'co-1'), { estado: 'autorizado', autoriza: 'Persona Uno' })));
await prueba('Compras no autoriza (solo compra lo autorizado)', () => assertFails(updateDoc(doc(prueba_('compras'), 'compras', 'co-1'), { estado: 'autorizado', autoriza: 'Luis' })));
await prueba('Compras no compra algo que nadie autorizó', () => assertFails(updateDoc(doc(prueba_('compras'), 'compras', 'co-1'), { estado: 'comprado', proveedor: 'X', valorReal: 100000, fechaCompra: '2026-11-20', factura: '', historial: H1 })));
await prueba('la Jefe autoriza la compra de otro', () => assertSucceeds(updateDoc(doc(prueba_('jefe'), 'compras', 'co-1'), { estado: 'autorizado', autoriza: 'Ana Pérez', historial: H1 })));
await prueba('Compras compra lo autorizado', () => assertSucceeds(updateDoc(doc(prueba_('compras'), 'compras', 'co-1'), { estado: 'comprado', proveedor: 'Ferretería', valorReal: 100000, fechaCompra: '2026-11-20', factura: '', historial: H2 })));
await prueba('Compras no cambia lo autorizado (la cantidad)', async () => { await sembrar(db => setDoc(doc(db, 'compras', 'co-3'), compra({ estado: 'autorizado' })));
  await assertFails(updateDoc(doc(prueba_('compras'), 'compras', 'co-3'), { estado: 'comprado', cantidad: 99, proveedor: 'X', valorReal: 1, fechaCompra: '2026-11-20', factura: '', historial: H1 })); });
await prueba('Bodega recibe lo comprado', () => assertSucceeds(updateDoc(doc(prueba_('asistente'), 'compras', 'co-1'), { estado: 'recibido', entregadoA: 'Sofía', historial: H3 })));
await prueba('la Jefe (cuenta propia) no autoriza una compra que pidió ella', async () => {
  await sembrar(db => setDoc(doc(db, 'compras', 'co-4'), compra({ pideRol: 'jefe', pide: 'Jefa' })));
  await assertFails(updateDoc(doc(await cuenta('jefa1', 'jefe'), 'compras', 'co-4'), { estado: 'autorizado', autoriza: 'Jefa' })); });
await prueba('la Jefe (cuenta propia) autoriza la compra de otro', async () => {
  await sembrar(db => setDoc(doc(db, 'compras', 'co-6'), compra()));
  await assertSucceeds(updateDoc(doc(await cuenta('jefa3', 'jefe'), 'compras', 'co-6'), { estado: 'autorizado', autoriza: 'Jefa', historial: H1 })); });
await prueba('el Gerente autoriza la compra que pidió la Jefe', () => assertSucceeds(updateDoc(doc(prueba_('gerente'), 'compras', 'co-4'), { estado: 'autorizado', autoriza: 'Ricardo', historial: H1 })));
await prueba('el Gerente no cambia el valor al autorizar', async () => { await sembrar(db => setDoc(doc(db, 'compras', 'co-5'), compra({ pideRol: 'jefe', pide: 'Jefa' })));
  await assertFails(updateDoc(doc(prueba_('gerente'), 'compras', 'co-5'), { estado: 'autorizado', autoriza: 'Ricardo', valorAprox: 1 })); });

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
await prueba('Conductor con «Inventario: bodega» sí crea artículos', async () => assertSucceeds(setDoc(doc(await cuenta('con1', 'conductor', { permisos: { inventario: 'bodega' } }), 'articulos', 'ar-78'), { nombre: 'X', cantidad: 0 })));
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


console.log('Compras: monto del Gerente y dos pasos (B)');
await limpiar();
const conCuenta = async (uid, rol) => cuenta(uid, rol);
const jefe1 = await conCuenta('jefM', 'jefe'), ger1 = await conCuenta('gerM', 'gerente');
await sembrar(async db => { await setDoc(doc(db, 'compras', 'g1'), compra({ valorAprox: 2000000 })); await setDoc(doc(db, 'compras', 'g2'), compra({ valorAprox: 100000 }));
  await setDoc(doc(db, 'compras', 'g3'), compra({ valorAprox: 2000000 })); await setDoc(doc(db, 'compras', 'g4'), compra({ valorAprox: 100000, pideRol: 'jefe', pide: 'Jefa' })); });
await prueba('una compra grande no la autoriza la Jefe sola', () => assertFails(updateDoc(doc(jefe1, 'compras', 'g1'), { estado: 'autorizado', autoriza: 'Jefa', historial: H1 })));
await prueba('una compra grande pasa de la Jefe al Gerente («por-gerente»)', () => assertSucceeds(updateDoc(doc(jefe1, 'compras', 'g1'), { estado: 'por-gerente', autorizaJefe: 'Jefa', historial: H1 })));
await prueba('una compra chica no necesita al Gerente', async () => { await assertFails(updateDoc(doc(jefe1, 'compras', 'g2'), { estado: 'por-gerente', autorizaJefe: 'Jefa', historial: H1 }));
  await assertSucceeds(updateDoc(doc(jefe1, 'compras', 'g2'), { estado: 'autorizado', autoriza: 'Jefa', historial: H1 })); });
await prueba('la Jefe sí puede rechazar una compra grande', () => assertSucceeds(updateDoc(doc(jefe1, 'compras', 'g3'), { estado: 'rechazado', motivoRechazo: 'Muy cara', autoriza: 'Jefa', historial: H1 })));
await prueba('el Gerente autoriza lo que le pasó la Jefe', () => assertSucceeds(updateDoc(doc(ger1, 'compras', 'g1'), { estado: 'autorizado', autoriza: 'Gerente', historial: H2 })));
await prueba('el Gerente no se salta a la Jefe: no autoriza una compra que sigue «pedido»', async () => { await sembrar(db => setDoc(doc(db, 'compras', 'g5'), compra({ valorAprox: 2000000 })));
  await assertFails(updateDoc(doc(ger1, 'compras', 'g5'), { estado: 'autorizado', autoriza: 'Gerente', historial: H1 })); });
await prueba('Compras no compra una que está «por-gerente»', async () => { await sembrar(db => setDoc(doc(db, 'compras', 'g6'), compra({ estado: 'por-gerente' })));
  await assertFails(updateDoc(doc(prueba_('compras'), 'compras', 'g6'), { estado: 'comprado', proveedor: 'X', valorReal: 1, fechaCompra: '2026-11-20', factura: '', historial: H1 })); });
await prueba('la Jefe no autoriza lo que pidió ella (lo decide el Gerente)', () => assertFails(updateDoc(doc(jefe1, 'compras', 'g4'), { estado: 'autorizado', autoriza: 'Jefa', historial: H1 })));
await prueba('el Gerente decide lo que pidió la Jefe aunque sea barato', () => assertSucceeds(updateDoc(doc(ger1, 'compras', 'g4'), { estado: 'autorizado', autoriza: 'Gerente', historial: H1 })));
await prueba('la Jefe no cambia el valor de una compra ya autorizada', () => assertFails(updateDoc(doc(jefe1, 'compras', 'g2'), { valorAprox: 1 })));
await prueba('la Jefe no borra compras', () => assertFails(deleteDoc(doc(jefe1, 'compras', 'g2'))));
await prueba('el Gerente puede pedir una compra, pero no nace autorizada (la decide otro Gerente)', async () => { await assertSucceeds(setDoc(doc(ger1, 'compras', 'g7'), nueva(correoCuenta('gerM'), { pide: 'Gerente', pideRol: 'gerente', estado: 'pedido' })));
  await assertFails(setDoc(doc(ger1, 'compras', 'g8'), nueva(correoCuenta('gerM'), { pide: 'Gerente', pideRol: 'gerente', estado: 'autorizado' }))); });
await prueba('nadie más crea una compra ya autorizada', () => assertFails(setDoc(doc(jefe1, 'compras', 'g9'), nueva(correoCuenta('jefM'), { pideRol: 'jefe', estado: 'autorizado' }))));
await prueba('solo el Gerente cambia el monto', async () => { await assertFails(setDoc(doc(jefe1, 'ajustesApp', 'compras'), { montoGerente: 99999999 }));
  await assertFails(setDoc(doc(prueba_('gerente'), 'ajustesApp', 'compras'), { montoGerente: 1 })); await assertSucceeds(setDoc(doc(ger1, 'ajustesApp', 'compras'), { montoGerente: 50000 }));
  await assertFails(setDoc(doc(ger1, 'ajustesApp', 'compras'), { montoGerente: -5 })); });
await prueba('con el monto más bajo, una compra de 100.000 ya pasa por el Gerente', async () => { await sembrar(db => setDoc(doc(db, 'compras', 'g10'), compra({ valorAprox: 100000 })));
  await assertFails(updateDoc(doc(jefe1, 'compras', 'g10'), { estado: 'autorizado', autoriza: 'Jefa', historial: H1 }));
  await assertSucceeds(updateDoc(doc(jefe1, 'compras', 'g10'), { estado: 'por-gerente', autorizaJefe: 'Jefa', historial: H1 })); });

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
  // Los permisos extra fijos de las personas de prueba están en las reglas (y solo esas dos personas los tienen).
  for (const p of D.PERSONAS) for (const x of p.extras) if (!txt.includes(`'${p.correo}' ? ['${x}']`)) throw new Error('falta en las reglas el permiso extra «' + x + '» de ' + p.nombre);
  if (D.PERSONAS.filter(p => p.extras.length).length !== 2) throw new Error('las reglas solo conocen 2 personas de prueba con permisos extra'); });


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
  await assertSucceeds(setDoc(doc(db, 'compras', 'cp-l1'), nueva(correoCuenta('pide4'), { pideRol: 'profesional', pideUid: 'pide4', valorAprox: 5, lineas: [l, l, l, l, l], cotizaciones: ['a', 'b', 'c'] })));
  await assertFails(setDoc(doc(db, 'compras', 'cp-l2'), nueva(correoCuenta('pide4'), { pideRol: 'profesional', pideUid: 'pide4', valorAprox: 6, lineas: [l, l, l, l, l, l] })));
  await assertFails(setDoc(doc(db, 'compras', 'cp-l3'), nueva(correoCuenta('pide4'), { pideRol: 'profesional', pideUid: 'pide4', cotizaciones: ['a', 'b', 'c', 'd'] }))); });
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
  await assertFails(updateDoc(doc(db, 'compras', 'cp-z'), { estado: 'autorizado', autoriza: 'X' })); });
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
const gerA = await cuenta('gerA', 'gerente'), gerB = await cuenta('gerB', 'gerente'), jefG = await cuenta('jefG', 'jefe');
await prueba('lo que pide un Gerente lo decide otro Gerente, no él ni la Jefe', async () => {
  await assertSucceeds(setDoc(doc(gerA, 'compras', 'gg-1'), nueva(correoCuenta('gerA'), { pide: 'Gerente A', pideRol: 'gerente', pideUid: 'gerA' })));
  await assertFails(updateDoc(doc(gerA, 'compras', 'gg-1'), { estado: 'autorizado', autoriza: 'Gerente A', historial: H1 }));
  await assertFails(updateDoc(doc(jefG, 'compras', 'gg-1'), { estado: 'autorizado', autoriza: 'Jefa', historial: H1 }));
  await assertSucceeds(updateDoc(doc(gerB, 'compras', 'gg-1'), { estado: 'autorizado', autoriza: 'Gerente B', historial: H1 })); });
await prueba('el otro Gerente también puede rechazar la compra de un Gerente', async () => {
  await assertSucceeds(setDoc(doc(gerA, 'compras', 'gg-2'), nueva(correoCuenta('gerA'), { pide: 'Gerente A', pideRol: 'gerente', pideUid: 'gerA' })));
  await assertSucceeds(updateDoc(doc(gerB, 'compras', 'gg-2'), { estado: 'rechazado', autoriza: 'Gerente B', motivoRechazo: 'No', historial: H1 })); });
await prueba('la Jefe sigue decidiendo lo de los demás, y la compra de un Gerente de prueba la decide otro Gerente de prueba', async () => {
  await sembrar(db => setDoc(doc(db, 'compras', 'gg-3'), nueva('gerente.oscar.munoz@example.com', { pide: 'Oscar', pideRol: 'gerente' })));
  await assertFails(updateDoc(doc(prueba_('gerente'), 'compras', 'gg-3'), { estado: 'autorizado', autoriza: 'Oscar', historial: H1 }));
  const otro = env.authenticatedContext('uid-otro-gerente', { email: 'gerente.otra.persona@example.com', email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
  await assertSucceeds(updateDoc(doc(otro, 'compras', 'gg-3'), { estado: 'autorizado', autoriza: 'Otra', historial: H1 })); });
await prueba('el Gerente NO se salta a la Jefe antes de 2 días', async () => {
  await sembrar(db => setDoc(doc(db, 'compras', 'rs-1'), compra({ pideRol: 'logistica', pideCorreo: CORREOS.logistica, creadoEn: hace(1) })));
  await assertFails(updateDoc(doc(gerA, 'compras', 'rs-1'), { estado: 'autorizado', autoriza: 'Gerente A', historial: H1 }));
  await assertFails(updateDoc(doc(gerA, 'compras', 'rs-1'), { estado: 'rechazado', autoriza: 'Gerente A', motivoRechazo: 'No', historial: H1 })); });
await prueba('pasados 2 días sin respuesta de la Jefe, el Gerente autoriza o rechaza (queda autorizada directo)', async () => {
  await sembrar(async db => { await setDoc(doc(db, 'compras', 'rs-2'), compra({ pideRol: 'logistica', pideCorreo: CORREOS.logistica, creadoEn: hace(3), valorAprox: 5000000 }));
    await setDoc(doc(db, 'compras', 'rs-3'), compra({ pideRol: 'logistica', pideCorreo: CORREOS.logistica, creadoEn: hace(3) })); });
  await assertFails(updateDoc(doc(gerA, 'compras', 'rs-2'), { estado: 'por-gerente', autorizaJefe: 'Gerente A', historial: H1 }));
  await assertSucceeds(updateDoc(doc(gerA, 'compras', 'rs-2'), { estado: 'autorizado', autoriza: 'Gerente A', historial: H1 }));
  await assertSucceeds(updateDoc(doc(gerA, 'compras', 'rs-3'), { estado: 'rechazado', autoriza: 'Gerente A', motivoRechazo: 'No', historial: H1 })); });
await prueba('una compra vieja sin fecha (datos de antes) no se salta a la Jefe', async () => {
  await sembrar(db => setDoc(doc(db, 'compras', 'rs-4'), compra({ pideRol: 'logistica' })));
  await assertFails(updateDoc(doc(gerA, 'compras', 'rs-4'), { estado: 'autorizado', autoriza: 'Gerente A', historial: H1 })); });
await prueba('con cuentas propias cada paso cabe en el límite de expresiones: Compras compra y Bodega recibe', async () => {
  const cmp = await cuenta('cmpL', 'compras'), bod = await cuenta('bodL', 'asistente');
  await sembrar(db => setDoc(doc(db, 'compras', 'lm-1'), compra({ estado: 'autorizado' })));
  await assertSucceeds(updateDoc(doc(cmp, 'compras', 'lm-1'), { estado: 'comprado', proveedor: 'Ferretería', valorReal: 100000, fechaCompra: '2026-11-20', factura: '', historial: H1 }));
  await assertSucceeds(updateDoc(doc(bod, 'compras', 'lm-1'), { estado: 'recibido', entregadoA: 'Persona', historial: H2 })); });
await prueba('con cuentas propias: la Jefe revisa lo «sin autorizar» y el Gerente autoriza lo que le pasó la Jefe', async () => {
  await sembrar(async db => { await setDoc(doc(db, 'compras', 'lm-2'), compra({ estado: 'sin-autorizar' })); await setDoc(doc(db, 'compras', 'lm-3'), compra({ estado: 'por-gerente', valorAprox: 3000000 })); });
  await assertSucceeds(updateDoc(doc(jefG, 'compras', 'lm-2'), { revisada: true, historial: H1 }));
  await assertSucceeds(updateDoc(doc(gerA, 'compras', 'lm-3'), { estado: 'autorizado', autoriza: 'Gerente A', historial: H1 })); });

console.log('Revisión de seguridad, paso 4: el historial de las compras solo crece');
await limpiar();
const lineaH = { fecha: '2026-11-20T12:00:00Z', texto: 'Paso nuevo', por: 'Alguien' }, jefH = await cuenta('jefH', 'jefe');
const cambiada = [Object.assign({}, H1[0], { texto: 'Lo borré y puse otra cosa' }), lineaH];
const pasos4 = [
  ['decidir (la Jefe autoriza)', () => jefH, { estado: 'pedido' }, { estado: 'autorizado', autoriza: 'Jefa' }],
  ['comprar (Compras)', () => prueba_('compras'), { estado: 'autorizado' }, { estado: 'comprado', proveedor: 'X', valorReal: 1, fechaCompra: '2026-11-20', factura: '' }],
  ['recibir (Bodega)', () => prueba_('asistente'), { estado: 'comprado' }, { estado: 'recibido', entregadoA: 'Persona' }],
  ['marcar revisada (la Jefe)', () => jefH, { estado: 'sin-autorizar' }, { revisada: true }]
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
const sembrarArt = (id = 'ar-m', extra = {}) => sembrar(db => setDoc(doc(db, 'articulos', id), Object.assign({ nombre: 'Guantes', categoria: 'EPP', unidad: 'pares', cantidad: 5, minimo: 2, maximo: 10, ubicacion: 'A1', costo: 100, proveedor: 'X' }, extra)));
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
  await assertFails(setDoc(doc(bodegaR, 'articulos', 'ar-n1'), { nombre: 'Nuevo', cantidad: 8 }));
  await assertSucceeds(setDoc(doc(bodegaR, 'articulos', 'ar-n2'), { nombre: 'Nuevo', cantidad: 0 }));
  await assertSucceeds(lote(bodegaR, b => { b.set(doc(bodegaR, 'articulos', 'ar-n3'), { nombre: 'Nuevo', cantidad: 8, ultimoMov: 'mo-n3' }); b.set(doc(bodegaR, 'movimientos', 'mo-n3'), movDe({ articuloId: 'ar-n3', motivo: 'inicial', cantidad: 8, saldo: 8 })); })); });
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

await env.cleanup();
console.log(`\n${ok} pruebas bien, ${fallas.length} con falla.`);
if (fallas.length) { console.log('Fallaron:\n - ' + fallas.join('\n - ')); process.exit(1); }
