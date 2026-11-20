/* reglas.mjs — Prueba las reglas de firestore.rules contra el emulador de Firestore (Firebase local, gratis).
   Se corre con:  npm run reglas   (el emulador arranca solo). Cada prueba usa una persona y dice si Firebase debe dejar o negar.
   Los datos son inventados. Las pruebas «de ataque» intentan lo prohibido y deben fallar. */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';

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
await prueba('Conductor con «Inventario: bodega» sí crea artículos', async () => assertSucceeds(setDoc(doc(await cuenta('con1', 'conductor', { permisos: { inventario: 'bodega' } }), 'articulos', 'ar-78'), { nombre: 'X', cantidad: 1 })));
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
await prueba('una compra grande no la autoriza la Jefe sola', () => assertFails(updateDoc(doc(jefe1, 'compras', 'g1'), { estado: 'autorizado', autoriza: 'Jefa', historial: [] })));
await prueba('una compra grande pasa de la Jefe al Gerente («por-gerente»)', () => assertSucceeds(updateDoc(doc(jefe1, 'compras', 'g1'), { estado: 'por-gerente', autorizaJefe: 'Jefa', historial: [] })));
await prueba('una compra chica no necesita al Gerente', async () => { await assertFails(updateDoc(doc(jefe1, 'compras', 'g2'), { estado: 'por-gerente', autorizaJefe: 'Jefa', historial: [] }));
  await assertSucceeds(updateDoc(doc(jefe1, 'compras', 'g2'), { estado: 'autorizado', autoriza: 'Jefa', historial: [] })); });
await prueba('la Jefe sí puede rechazar una compra grande', () => assertSucceeds(updateDoc(doc(jefe1, 'compras', 'g3'), { estado: 'rechazado', motivoRechazo: 'Muy cara', autoriza: 'Jefa', historial: [] })));
await prueba('el Gerente autoriza lo que le pasó la Jefe', () => assertSucceeds(updateDoc(doc(ger1, 'compras', 'g1'), { estado: 'autorizado', autoriza: 'Gerente', historial: [] })));
await prueba('el Gerente no se salta a la Jefe: no autoriza una compra que sigue «pedido»', async () => { await sembrar(db => setDoc(doc(db, 'compras', 'g5'), compra({ valorAprox: 2000000 })));
  await assertFails(updateDoc(doc(ger1, 'compras', 'g5'), { estado: 'autorizado', autoriza: 'Gerente', historial: [] })); });
await prueba('Compras no compra una que está «por-gerente»', async () => { await sembrar(db => setDoc(doc(db, 'compras', 'g6'), compra({ estado: 'por-gerente' })));
  await assertFails(updateDoc(doc(prueba_('compras'), 'compras', 'g6'), { estado: 'comprado', proveedor: 'X', valorReal: 1, fechaCompra: '2026-11-20', factura: '', historial: [] })); });
await prueba('la Jefe no autoriza lo que pidió ella (lo decide el Gerente)', () => assertFails(updateDoc(doc(jefe1, 'compras', 'g4'), { estado: 'autorizado', autoriza: 'Jefa', historial: [] })));
await prueba('el Gerente decide lo que pidió la Jefe aunque sea barato', () => assertSucceeds(updateDoc(doc(ger1, 'compras', 'g4'), { estado: 'autorizado', autoriza: 'Gerente', historial: [] })));
await prueba('la Jefe no cambia el valor de una compra ya autorizada', () => assertFails(updateDoc(doc(jefe1, 'compras', 'g2'), { valorAprox: 1 })));
await prueba('la Jefe no borra compras', () => assertFails(deleteDoc(doc(jefe1, 'compras', 'g2'))));
await prueba('el Gerente puede pedir una compra y nace autorizada', async () => { await assertSucceeds(setDoc(doc(ger1, 'compras', 'g7'), compra({ pide: 'Gerente', pideRol: 'gerente', estado: 'autorizado' })));
  await assertFails(setDoc(doc(ger1, 'compras', 'g8'), compra({ pide: 'Gerente', pideRol: 'gerente', estado: 'pedido' }))); });
await prueba('nadie más crea una compra ya autorizada', () => assertFails(setDoc(doc(jefe1, 'compras', 'g9'), compra({ pideRol: 'jefe', estado: 'autorizado' }))));
await prueba('solo el Gerente cambia el monto', async () => { await assertFails(setDoc(doc(jefe1, 'ajustesApp', 'compras'), { montoGerente: 99999999 }));
  await assertFails(setDoc(doc(prueba_('gerente'), 'ajustesApp', 'compras'), { montoGerente: 1 })); await assertSucceeds(setDoc(doc(ger1, 'ajustesApp', 'compras'), { montoGerente: 50000 }));
  await assertFails(setDoc(doc(ger1, 'ajustesApp', 'compras'), { montoGerente: -5 })); });
await prueba('con el monto más bajo, una compra de 100.000 ya pasa por el Gerente', async () => { await sembrar(db => setDoc(doc(db, 'compras', 'g10'), compra({ valorAprox: 100000 })));
  await assertFails(updateDoc(doc(jefe1, 'compras', 'g10'), { estado: 'autorizado', autoriza: 'Jefa', historial: [] }));
  await assertSucceeds(updateDoc(doc(jefe1, 'compras', 'g10'), { estado: 'por-gerente', autorizaJefe: 'Jefa', historial: [] })); });

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
  const base = txt.slice(txt.indexOf('function BASE()'), txt.indexOf('function nivel('));
  const filas = [...base.matchAll(/'(\w+)': \{ 'equipos': '(\w+)', 'inventario': '(\w+)', 'vehiculos': '(\w+)', 'reuniones': '(\w+)' \}/g)];
  if (filas.length !== D.ROLES.length) throw new Error(`reglas tienen ${filas.length} roles y personas.js ${D.ROLES.length}`);
  for (const [, rol, e, i, v, r] of filas) { const x = D.rolDe(rol); if (!x) throw new Error('rol que no está en personas.js: ' + rol);
    for (const [m, val] of [['equipos', e], ['inventario', i], ['vehiculos', v], ['reuniones', r]]) if (x.permisos[m] !== val) throw new Error(`${rol}/${m}: reglas «${val}», personas.js «${x.permisos[m]}»`); }
  const cuentasTxt = txt.slice(txt.indexOf('function cuentas()'), txt.indexOf('function ROLES()'));
  for (const p of D.PERSONAS) if (!cuentasTxt.includes(`'${p.correo}': '${p.rol}'`)) throw new Error('persona de prueba que falta en las reglas: ' + p.correo); });


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
  await assertSucceeds(setDoc(doc(db, 'compras', 'cp-n1'), compra({ pideRol: 'profesional', pideUid: 'pide3' })));
  await assertFails(setDoc(doc(db, 'compras', 'cp-n2'), compra({ pideRol: 'profesional', pideUid: 'pide1' }))); });
await prueba('una compra con más de 5 líneas o más de 3 cotizaciones no se acepta', async () => {
  const db = await cuenta('pide4', 'profesional'), l = { que: 'X', cantidad: 1, unidad: 'unidades', valor: 1 };
  await assertSucceeds(setDoc(doc(db, 'compras', 'cp-l1'), compra({ pideRol: 'profesional', pideUid: 'pide4', lineas: [l, l, l, l, l], cotizaciones: ['a', 'b', 'c'] })));
  await assertFails(setDoc(doc(db, 'compras', 'cp-l2'), compra({ pideRol: 'profesional', pideUid: 'pide4', lineas: [l, l, l, l, l, l] })));
  await assertFails(setDoc(doc(db, 'compras', 'cp-l3'), compra({ pideRol: 'profesional', pideUid: 'pide4', cotizaciones: ['a', 'b', 'c', 'd'] }))); });
await prueba('una persona solo con «solo ver» en Inventario no pide material ni compras', async () => {
  const db = await cuenta('ver2', 'conductor', { permisos: { inventario: 'ver' } });
  await assertFails(setDoc(doc(db, 'compras', 'cp-v'), compra({ pideRol: 'conductor', pideUid: 'ver2' })));
  await assertFails(setDoc(doc(db, 'solicitudes', 'so-v'), { articulo: 'X', cantidad: 1, pideRol: 'conductor', estado: 'pendiente', pideUid: 'ver2' })); });

await env.cleanup();
console.log(`\n${ok} pruebas bien, ${fallas.length} con falla.`);
if (fallas.length) { console.log('Fallaron:\n - ' + fallas.join('\n - ')); process.exit(1); }
