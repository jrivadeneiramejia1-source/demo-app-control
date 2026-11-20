/* reglas.mjs — Prueba las reglas de firestore.rules contra el emulador de Firestore (Firebase local, gratis).
   Se corre con:  npm run reglas   (el emulador arranca solo). Cada prueba usa una persona y dice si Firebase debe dejar o negar.
   Los datos son inventados. Las pruebas «de ataque» intentan lo prohibido y deben fallar. */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const CORREOS = {
  gerente: 'ricardo.fuentes@example.com', jefe: 'ana.perez@example.com', equipos: 'daniel.ortiz@example.com', soporte: 'valentina.ruiz@example.com',
  compras: 'luis.rodriguez@example.com', asistente: 'sofia.herrera@example.com', carros: 'marta.gomez@example.com', conductor: 'carlos.pinto@example.com',
  logistica: 'pedro.castillo@example.com', profesional: 'laura.medina@example.com', administrativo: 'natalia.vargas@example.com'
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

const compra = (o = {}) => Object.assign({ que: 'Botas', cantidad: 2, unidad: 'pares', categoria: 'EPP', valorAprox: 100000, paraQue: 'Campo', pide: 'Pedro Castillo', pideRol: 'logistica', autoriza: '',
  estado: 'pedido', proveedor: '', valorReal: 0, fechaPedido: '2026-11-20', fechaCompra: '', entregadoA: '', motivoRechazo: '', articuloId: '', factura: '', revisada: false, historial: [] }, o);

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
await prueba('Bodega crea un artículo con cantidad válida', () => assertSucceeds(setDoc(doc(prueba_('asistente'), 'articulos', 'ar-9'), { nombre: 'X', cantidad: 5 })));

console.log('Compras');
await limpiar();
await prueba('quien pide crea la compra a su nombre', () => assertSucceeds(setDoc(doc(prueba_('logistica'), 'compras', 'co-1'), compra())));
await prueba('nadie pide a nombre de otro rol', () => assertFails(setDoc(doc(prueba_('logistica'), 'compras', 'co-2'), compra({ pideRol: 'jefe' }))));
await prueba('quien pide no se la autoriza solo', () => assertFails(updateDoc(doc(prueba_('logistica'), 'compras', 'co-1'), { estado: 'autorizado', autoriza: 'Pedro Castillo' })));
await prueba('Compras no autoriza (solo compra lo autorizado)', () => assertFails(updateDoc(doc(prueba_('compras'), 'compras', 'co-1'), { estado: 'autorizado', autoriza: 'Luis' })));
await prueba('Compras no compra algo que nadie autorizó', () => assertFails(updateDoc(doc(prueba_('compras'), 'compras', 'co-1'), { estado: 'comprado', proveedor: 'X', valorReal: 100000, fechaCompra: '2026-11-20', factura: '', historial: [] })));
await prueba('la Jefe autoriza la compra de otro', () => assertSucceeds(updateDoc(doc(prueba_('jefe'), 'compras', 'co-1'), { estado: 'autorizado', autoriza: 'Ana Pérez' })));
await prueba('Compras compra lo autorizado', () => assertSucceeds(updateDoc(doc(prueba_('compras'), 'compras', 'co-1'), { estado: 'comprado', proveedor: 'Ferretería', valorReal: 100000, fechaCompra: '2026-11-20', factura: '', historial: [] })));
await prueba('Compras no cambia lo autorizado (la cantidad)', async () => { await sembrar(db => setDoc(doc(db, 'compras', 'co-3'), compra({ estado: 'autorizado' })));
  await assertFails(updateDoc(doc(prueba_('compras'), 'compras', 'co-3'), { estado: 'comprado', cantidad: 99, proveedor: 'X', valorReal: 1, fechaCompra: '2026-11-20', factura: '', historial: [] })); });
await prueba('Bodega recibe lo comprado', () => assertSucceeds(updateDoc(doc(prueba_('asistente'), 'compras', 'co-1'), { estado: 'recibido', entregadoA: 'Sofía', historial: [] })));
await prueba('la Jefe (cuenta propia) no autoriza una compra que pidió ella', async () => {
  await sembrar(db => setDoc(doc(db, 'compras', 'co-4'), compra({ pideRol: 'jefe', pide: 'Jefa' })));
  await assertFails(updateDoc(doc(await cuenta('jefa1', 'jefe'), 'compras', 'co-4'), { estado: 'autorizado', autoriza: 'Jefa' })); });
await prueba('la Jefe (cuenta propia) autoriza la compra de otro', async () => {
  await sembrar(db => setDoc(doc(db, 'compras', 'co-6'), compra()));
  await assertSucceeds(updateDoc(doc(await cuenta('jefa3', 'jefe'), 'compras', 'co-6'), { estado: 'autorizado', autoriza: 'Jefa', historial: [] })); });
await prueba('el Gerente autoriza la compra que pidió la Jefe', () => assertSucceeds(updateDoc(doc(prueba_('gerente'), 'compras', 'co-4'), { estado: 'autorizado', autoriza: 'Ricardo', historial: [] })));
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

await env.cleanup();
console.log(`\n${ok} pruebas bien, ${fallas.length} con falla.`);
if (fallas.length) { console.log('Fallaron:\n - ' + fallas.join('\n - ')); process.exit(1); }
