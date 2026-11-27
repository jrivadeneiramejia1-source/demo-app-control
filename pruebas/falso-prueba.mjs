// Prueba de los modulos falsos de Firebase con Playwright (Chrome real).
// Uso: node falso-prueba.mjs   -> imprime "OK  ..." / "FALLA ..." y sale con 1 si algo falla.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const carpeta = path.dirname(fileURLToPath(import.meta.url));

// Servidor local: pagina en blanco + los tres modulos.
const servidor = http.createServer((req, res) => {
  const nombre = req.url.split('?')[0];
  if (nombre === '/blanco.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end('<!doctype html><title>blanco</title>');
  }
  const archivo = path.join(carpeta, path.basename(nombre));
  if (/^\/firebase-(app|auth|firestore)\.js$/.test(nombre) && fs.existsSync(archivo)) {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    return res.end(fs.readFileSync(archivo));
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + servidor.address().port;

let fallas = 0;
const mostrar = (ok, nombre, detalle) => {
  if (!ok) fallas++;
  console.log((ok ? 'OK  ' : 'FALLA ') + nombre + (!ok && detalle ? '  -> ' + detalle : ''));
};

const navegador = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const contexto = await navegador.newContext();
const pag = await contexto.newPage();
pag.on('pageerror', (e) => mostrar(false, 'error de pagina', e.message));
await pag.goto(base + '/blanco.html');

// Prueba dentro de la pagina: devuelve [[ok, nombre, detalle], ...]
const resultados = await pag.evaluate(async () => {
  const R = [];
  const t = (nombre, ok, detalle) => R.push([!!ok, nombre, detalle === undefined ? '' : String(detalle)]);
  const esp = (ms) => new Promise((r) => setTimeout(r, ms));
  const codigo = async (p) => { try { await p; return 'sin error'; } catch (e) { return e.code || ('sin code: ' + e.message); } };

  // Comparacion profunda sin importar el orden de las claves.
  const ord = (x) => Array.isArray(x) ? x.map(ord) : (x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, ord(x[k])])) : x);
  const igual = (a, b) => JSON.stringify(ord(a)) === JSON.stringify(ord(b));
  const { initializeApp } = await import('/firebase-app.js');
  const A = await import('/firebase-auth.js');
  const F = await import('/firebase-firestore.js');
  localStorage.clear();

  // ===== app =====
  const app = initializeApp({ apiKey: 'x' });
  t('app: initializeApp devuelve objeto con options', app && app.options.apiKey === 'x');

  // ===== auth =====
  const auth = A.getAuth(app);
  t('auth: getAuth devuelve siempre el mismo objeto', A.getAuth(app) === auth && A.getAuth() === auth);
  t('auth: currentUser inicial es null', auth.currentUser === null);

  const eventos = [];
  const baja = A.onAuthStateChanged(auth, (u) => eventos.push(u ? u.email : null));
  t('auth: onAuthStateChanged no llama de forma sincrona', eventos.length === 0);
  await esp(20);
  t('auth: onAuthStateChanged llama async con null al suscribirse', JSON.stringify(eventos) === '[null]', JSON.stringify(eventos));

  const cr = await A.createUserWithEmailAndPassword(auth, '  Ana@Demo.CO ', 'secreto1');
  t('auth: create devuelve {user} con correo en minusculas', cr.user.email === 'ana@demo.co', cr.user.email);
  t('auth: uid con formato u-xxxxxxxx', /^u-[a-z0-9]{8}$/.test(cr.user.uid), cr.user.uid);
  t('auth: create deja currentUser', auth.currentUser && auth.currentUser.uid === cr.user.uid);
  await esp(20);
  t('auth: create notifica al oyente', eventos[eventos.length - 1] === 'ana@demo.co', JSON.stringify(eventos));
  const guardados = JSON.parse(localStorage.getItem('__fb_usuarios'));
  t('auth: __fb_usuarios guarda {correo:{uid,clave}}', guardados['ana@demo.co'] && guardados['ana@demo.co'].clave === 'secreto1' && guardados['ana@demo.co'].uid === cr.user.uid);
  t('auth: __fb_actual guarda el uid', localStorage.getItem('__fb_actual') === cr.user.uid);

  t('auth: create con correo repetido (otra mayuscula) -> email-already-in-use', await codigo(A.createUserWithEmailAndPassword(auth, 'ANA@demo.co', 'otra123')) === 'auth/email-already-in-use');
  t('auth: create con clave corta -> weak-password', await codigo(A.createUserWithEmailAndPassword(auth, 'b@demo.co', '12345')) === 'auth/weak-password');
  t('auth: create con correo sin @ -> invalid-email', await codigo(A.createUserWithEmailAndPassword(auth, 'sinarroba', 'secreto1')) === 'auth/invalid-email');

  await A.signOut(auth);
  await esp(20);
  t('auth: signOut deja currentUser en null', auth.currentUser === null);
  t('auth: signOut notifica null', eventos[eventos.length - 1] === null, JSON.stringify(eventos));
  t('auth: __fb_actual queda vacio', localStorage.getItem('__fb_actual') === '');

  t('auth: signIn usuario inexistente -> invalid-credential', await codigo(A.signInWithEmailAndPassword(auth, 'nadie@demo.co', 'secreto1')) === 'auth/invalid-credential');
  t('auth: signIn clave mala -> invalid-credential', await codigo(A.signInWithEmailAndPassword(auth, 'ana@demo.co', 'mala')) === 'auth/invalid-credential');
  const si = await A.signInWithEmailAndPassword(auth, 'ANA@demo.co', 'secreto1');
  t('auth: signIn correcto devuelve {user} (correo insensible a mayusculas)', si.user.email === 'ana@demo.co' && si.user.uid === cr.user.uid);
  await esp(20);
  t('auth: signIn notifica al oyente', eventos[eventos.length - 1] === 'ana@demo.co');

  window.__fbFallarAuth = 'auth/network-request-failed';
  t('auth: __fbFallarAuth hace fallar signIn con ese code', await codigo(A.signInWithEmailAndPassword(auth, 'ana@demo.co', 'secreto1')) === 'auth/network-request-failed');
  t('auth: __fbFallarAuth se consume (la siguiente llamada funciona)', await codigo(A.signInWithEmailAndPassword(auth, 'ana@demo.co', 'secreto1')) === 'sin error');
  window.__fbFallarAuth = 'auth/network-request-failed';
  t('auth: __fbFallarAuth hace fallar create', await codigo(A.createUserWithEmailAndPassword(auth, 'c@demo.co', 'secreto1')) === 'auth/network-request-failed');

  const n = eventos.length;
  baja();
  await A.signOut(auth);
  await esp(20);
  t('auth: unsubscribe deja de notificar', eventos.length === n);

  // ===== firestore =====
  const db = F.getFirestore(app);
  t('fs: getFirestore devuelve el mismo objeto', F.getFirestore(app) === db);
  const col = F.collection(db, 'equipos');
  t('fs: collection {id,path,type}', col.id === 'equipos' && col.path === 'equipos' && col.type === 'collection');
  const d1 = F.doc(db, 'equipos', 'e1');
  t('fs: doc(db,col,id) {id,path,type,parent.id}', d1.id === 'e1' && d1.path === 'equipos/e1' && d1.type === 'document' && d1.parent.id === 'equipos');
  const d1b = F.doc(col, 'e1');
  t('fs: doc(colRef,id) equivale', d1b.path === 'equipos/e1' && d1b.parent.id === 'equipos' && d1b.type === 'document');

  const pg = F.getDoc(d1);
  t('fs: getDoc devuelve Promise', pg instanceof Promise);
  let s = await pg;
  t('fs: getDoc inexistente: exists() false y data() undefined', s.exists() === false && s.data() === undefined && s.id === 'e1' && s.ref.path === 'equipos/e1');
  let qs = await F.getDocs(col);
  t('fs: getDocs vacio: size 0, empty true, docs []', qs.size === 0 && qs.empty === true && qs.docs.length === 0);

  const original = { serial: 'S1', obs: 'a', historial: [{ n: 1 }], leido: { jefe: false } };
  await F.setDoc(d1, original);
  s = await F.getDoc(d1);
  t('fs: setDoc + getDoc existe y data igual', s.exists() && JSON.stringify(s.data()) === JSON.stringify(original));
  const x = s.data(); x.serial = 'MUTADO'; x.historial.push({ n: 2 });
  t('fs: data() devuelve copia profunda nueva', (await F.getDoc(d1)).data().serial === 'S1' && s.data().serial === 'S1' && s.data().historial.length === 1);
  original.obs = 'cambiado fuera';
  t('fs: setDoc guarda copia (mutar el original no afecta)', (await F.getDoc(d1)).data().obs === 'a');
  t('fs: __fb_datos tiene forma {coleccion:{id:datos}}', JSON.parse(localStorage.getItem('__fb_datos')).equipos.e1.serial === 'S1');

  await F.setDoc(d1, { nuevo: 1 });
  t('fs: setDoc sin merge reemplaza', JSON.stringify((await F.getDoc(d1)).data()) === '{"nuevo":1}');
  await F.setDoc(d1, { a: { b: 1, c: 2 }, arr: [1, 2, 3], k: 'x' });
  await F.setDoc(d1, { a: { c: 9, d: 4 }, arr: [7] }, { merge: true });
  t('fs: setDoc merge mezcla objetos en profundidad y reemplaza arrays', igual((await F.getDoc(d1)).data(), { a: { b: 1, c: 9, d: 4 }, arr: [7], k: 'x' }), JSON.stringify((await F.getDoc(d1)).data()));
  const dm = F.doc(db, 'equipos', 'nuevoMerge');
  await F.setDoc(dm, { z: 1 }, { merge: true });
  t('fs: setDoc merge sobre documento inexistente lo crea', (await F.getDoc(dm)).data().z === 1);

  await F.updateDoc(d1, { 'a.b': 100, 'leido.jefe': true, k: 'y' });
  const u = (await F.getDoc(d1)).data();
  t('fs: updateDoc con rutas de punto (existentes y nuevas)', u.a.b === 100 && u.a.c === 9 && u.leido.jefe === true && u.k === 'y', JSON.stringify(u));
  t('fs: updateDoc inexistente -> not-found', await codigo(F.updateDoc(F.doc(db, 'equipos', 'noExiste'), { a: 1 })) === 'not-found');

  await F.setDoc(F.doc(db, 'equipos', 'e0'), { serial: 'S0' });
  qs = await F.getDocs(col);
  const ids = []; qs.forEach((sn) => ids.push(sn.id));
  t('fs: getDocs docs, size, empty, forEach', qs.size === 3 && qs.empty === false && qs.docs.length === 3 && ids.join() === 'e0,e1,nuevoMerge', ids.join());
  t('fs: docs de getDocs son snaps {id,ref,exists,data}', qs.docs[0].exists() && qs.docs[0].data().serial === 'S0' && qs.docs[0].ref.path === 'equipos/e0');

  await F.deleteDoc(dm);
  t('fs: deleteDoc elimina', (await F.getDoc(dm)).exists() === false);
  t('fs: deleteDoc de inexistente no falla', await codigo(F.deleteDoc(dm)) === 'sin error');

  // --- onSnapshot de coleccion ---
  const llamadasCol = [];
  const bajaCol = F.onSnapshot(col, (q) => llamadasCol.push(q.size), () => llamadasCol.push('ERR'));
  t('fs: onSnapshot no llama sincrono', llamadasCol.length === 0);
  await esp(30);
  t('fs: onSnapshot coleccion: primera llamada async con estado actual', JSON.stringify(llamadasCol) === '[2]', JSON.stringify(llamadasCol));
  await F.setDoc(F.doc(db, 'equipos', 'e2'), { serial: 'S2' });
  await esp(30);
  t('fs: onSnapshot coleccion se dispara en cada cambio', JSON.stringify(llamadasCol) === '[2,3]', JSON.stringify(llamadasCol));
  await F.setDoc(F.doc(db, 'otra', 'x'), { v: 1 });
  await esp(30);
  t('fs: onSnapshot coleccion ignora cambios de otra coleccion', llamadasCol.length === 2, JSON.stringify(llamadasCol));

  // --- onSnapshot de documento ---
  const llamadasDoc = [];
  const bajaDoc = F.onSnapshot(d1, (sn) => llamadasDoc.push(sn.exists() ? sn.data().k : 'no-existe'), () => llamadasDoc.push('ERR'));
  await esp(30);
  await F.updateDoc(F.doc(db, 'equipos', 'e2'), { serial: 'otro' });
  await esp(30);
  t('fs: onSnapshot documento: estado inicial y no se dispara por otros documentos', JSON.stringify(llamadasDoc) === '["y"]', JSON.stringify(llamadasDoc));
  await F.updateDoc(d1, { k: 'z' });
  await esp(30);
  t('fs: onSnapshot documento se dispara si cambia su documento', JSON.stringify(llamadasDoc) === '["y","z"]', JSON.stringify(llamadasDoc));
  await F.deleteDoc(d1);
  await esp(30);
  t('fs: onSnapshot documento notifica el borrado (exists false)', llamadasDoc[llamadasDoc.length - 1] === 'no-existe', JSON.stringify(llamadasDoc));
  bajaDoc();
  await F.setDoc(d1, { k: 'otra vez' });
  await esp(30);
  t('fs: unsubscribe de documento detiene llamadas', llamadasDoc.length === 3);

  // --- writeBatch ---
  const antes = llamadasCol.length;
  const lote = F.writeBatch(db);
  lote.set(F.doc(db, 'equipos', 'b1'), { serial: 'B1' });
  lote.set(F.doc(db, 'equipos', 'b2'), { serial: 'B2', x: { y: 1 } });
  lote.set(F.doc(db, 'equipos', 'b2'), { x: { z: 2 } }, { merge: true });
  lote.update(F.doc(db, 'equipos', 'e0'), { 'q.w': 5 });
  lote.delete(F.doc(db, 'equipos', 'e2'));
  await esp(30);
  t('fs: writeBatch no aplica nada antes de commit', (await F.getDoc(F.doc(db, 'equipos', 'b1'))).exists() === false && llamadasCol.length === antes);
  const pc = lote.commit();
  t('fs: commit devuelve Promise', pc instanceof Promise);
  await pc;
  await esp(30);
  const b2 = (await F.getDoc(F.doc(db, 'equipos', 'b2'))).data();
  t('fs: commit aplica set/set merge/update/delete', (await F.getDoc(F.doc(db, 'equipos', 'b1'))).exists() && b2.x.y === 1 && b2.x.z === 2 && (await F.getDoc(F.doc(db, 'equipos', 'e0'))).data().q.w === 5 && (await F.getDoc(F.doc(db, 'equipos', 'e2'))).exists() === false, JSON.stringify(b2));
  t('fs: commit notifica UNA sola vez por oyente', llamadasCol.length === antes + 1, JSON.stringify(llamadasCol));
  const mal = F.writeBatch(db);
  mal.set(F.doc(db, 'equipos', 'solo-si-ok'), { v: 1 });
  mal.update(F.doc(db, 'equipos', 'fantasma'), { v: 1 });
  t('fs: commit con update a inexistente -> not-found', await codigo(mal.commit()) === 'not-found');
  t('fs: commit fallido no aplica nada (atomico)', (await F.getDoc(F.doc(db, 'equipos', 'solo-si-ok'))).exists() === false);

  // --- increment ---
  await F.setDoc(F.doc(db, 'articulos', 'i1'), { cantidad: 5, n: { c: 1 } });
  await F.updateDoc(F.doc(db, 'articulos', 'i1'), { cantidad: F.increment(-2), 'n.c': F.increment(3) });
  let i1 = (await F.getDoc(F.doc(db, 'articulos', 'i1'))).data();
  t('fs: increment en updateDoc suma y resta (también con ruta de punto)', i1.cantidad === 3 && i1.n.c === 4, JSON.stringify(i1));
  await F.setDoc(F.doc(db, 'articulos', 'i1'), { cantidad: F.increment(10), otro: F.increment(1) }, { merge: true });
  i1 = (await F.getDoc(F.doc(db, 'articulos', 'i1'))).data();
  t('fs: increment en setDoc merge (campo que no existía empieza en 0)', i1.cantidad === 13 && i1.otro === 1, JSON.stringify(i1));
  const li = F.writeBatch(db);
  li.update(F.doc(db, 'articulos', 'i1'), { cantidad: F.increment(-1) });
  li.update(F.doc(db, 'articulos', 'i1'), { cantidad: F.increment(-1) });
  li.set(F.doc(db, 'articulos', 'i2'), { cantidad: F.increment(7) });
  await li.commit();
  t('fs: increment en writeBatch (dos restas seguidas y set nuevo)', (await F.getDoc(F.doc(db, 'articulos', 'i1'))).data().cantidad === 11 && (await F.getDoc(F.doc(db, 'articulos', 'i2'))).data().cantidad === 7);

  // --- simulaciones ---
  window.__fbDenegar = true;
  t('fs: __fbDenegar -> getDoc permission-denied', await codigo(F.getDoc(d1)) === 'permission-denied');
  t('fs: __fbDenegar -> getDocs permission-denied', await codigo(F.getDocs(col)) === 'permission-denied');
  t('fs: __fbDenegar -> setDoc permission-denied', await codigo(F.setDoc(d1, { a: 1 })) === 'permission-denied');
  t('fs: __fbDenegar -> updateDoc permission-denied', await codigo(F.updateDoc(d1, { a: 1 })) === 'permission-denied');
  t('fs: __fbDenegar -> deleteDoc permission-denied', await codigo(F.deleteDoc(d1)) === 'permission-denied');
  const lb = F.writeBatch(db); lb.set(d1, { a: 1 });
  t('fs: __fbDenegar -> commit permission-denied', await codigo(lb.commit()) === 'permission-denied');
  const errs = [];
  F.onSnapshot(col, () => errs.push('next'), (e) => errs.push(e.code));
  await esp(30);
  t('fs: __fbDenegar -> onSnapshot llama al callback de error', JSON.stringify(errs) === '["permission-denied"]', JSON.stringify(errs));
  window.__fbDenegar = false;
  t('fs: sin __fbDenegar todo vuelve a funcionar', (await F.getDoc(F.doc(db, 'equipos', 'b1'))).exists() === true);
  t('fs: el denegar no cambio los datos', (await F.getDoc(d1)).data().k === 'otra vez');
  window.__fbNoDisponible = true;
  t('fs: __fbNoDisponible -> unavailable', await codigo(F.getDocs(col)) === 'unavailable');
  window.__fbNoDisponible = false;

  bajaCol();
  await A.signInWithEmailAndPassword(auth, 'ana@demo.co', 'secreto1'); // deja sesion para la prueba de recarga
  return R;
});
resultados.forEach(([ok, nombre, detalle]) => mostrar(ok, nombre, detalle));

// ===== Persistencia tras recargar =====
await pag.reload();
const tras = await pag.evaluate(async () => {
  const A = await import('/firebase-auth.js');
  const F = await import('/firebase-firestore.js');
  const auth = A.getAuth();
  const vistos = [];
  A.onAuthStateChanged(auth, (u) => vistos.push(u && u.email));
  await new Promise((r) => setTimeout(r, 30));
  const s = await F.getDoc(F.doc(F.getFirestore(), 'equipos', 'b1'));
  return { usuario: auth.currentUser && auth.currentUser.email, vistos, serial: s.exists() && s.data().serial };
});
mostrar(tras.usuario === 'ana@demo.co', 'recarga: auth.currentUser se restaura de localStorage', JSON.stringify(tras));
mostrar(JSON.stringify(tras.vistos) === '["ana@demo.co"]', 'recarga: onAuthStateChanged entrega el usuario restaurado', JSON.stringify(tras.vistos));
mostrar(tras.serial === 'B1', 'recarga: los datos de Firestore sobreviven', JSON.stringify(tras));

// ===== Varias pestañas (evento storage) =====
const pag2 = await contexto.newPage();
await pag2.goto(base + '/blanco.html');
await pag2.evaluate(async () => {
  window.__reg = { auth: [], col: [], doc: [] };
  const A = await import('/firebase-auth.js');
  const F = await import('/firebase-firestore.js');
  A.onAuthStateChanged(A.getAuth(), (u) => window.__reg.auth.push(u && u.email));
  F.onSnapshot(F.collection(F.getFirestore(), 'equipos'), (q) => window.__reg.col.push(q.size));
  F.onSnapshot(F.doc(F.getFirestore(), 'equipos', 'b1'), (s) => window.__reg.doc.push(s.exists() && s.data().serial));
  await new Promise((r) => setTimeout(r, 40));
  window.__reg.auth.length = 0; window.__reg.col.length = 0; window.__reg.doc.length = 0;
});
// La pestaña 1 hace cambios
await pag.evaluate(async () => {
  const A = await import('/firebase-auth.js');
  const F = await import('/firebase-firestore.js');
  await A.signOut(A.getAuth());
  await F.updateDoc(F.doc(F.getFirestore(), 'equipos', 'b1'), { serial: 'DESDE-1' });
});
await pag2.waitForTimeout(150);
const reg = await pag2.evaluate(() => ({ ...window.__reg, actual: JSON.parse(JSON.stringify(localStorage.getItem('__fb_actual'))) }));
mostrar(JSON.stringify(reg.auth) === '[null]', 'pestanas: signOut en una pestaña notifica a la otra', JSON.stringify(reg.auth));
mostrar(reg.col.length === 1 && reg.col[0] >= 1, 'pestanas: cambio de datos dispara onSnapshot de coleccion en la otra', JSON.stringify(reg.col));
mostrar(JSON.stringify(reg.doc) === '["DESDE-1"]', 'pestanas: cambio de datos dispara onSnapshot de documento en la otra', JSON.stringify(reg.doc));
mostrar(reg.actual === '', 'pestanas: __fb_actual compartido', JSON.stringify(reg.actual));
// Cambio en un documento distinto no dispara el oyente de documento
await pag.evaluate(async () => {
  const F = await import('/firebase-firestore.js');
  await F.setDoc(F.doc(F.getFirestore(), 'equipos', 'otro-doc'), { a: 1 });
});
await pag2.waitForTimeout(150);
const reg2 = await pag2.evaluate(() => window.__reg);
mostrar(reg2.col.length === 2 && JSON.stringify(reg2.doc) === '["DESDE-1"]', 'pestanas: cambio de otro documento solo dispara la coleccion', JSON.stringify(reg2));

// ===== runTransaction y perfil nuevo solo con el correo confirmado =====
const tx = await pag.evaluate(async () => {
  const F = await import('/firebase-firestore.js'), db = F.getFirestore();
  await F.setDoc(F.doc(db, 'articulos', 'tx1'), { cantidad: 5 });
  await F.runTransaction(db, async (t) => {
    const s = await t.get(F.doc(db, 'articulos', 'tx1'));
    t.update(F.doc(db, 'articulos', 'tx1'), { cantidad: F.increment(2) });
    t.set(F.doc(db, 'movimientos', 'tx-m1'), { vio: s.data().cantidad });
  });
  const a = (await F.getDoc(F.doc(db, 'articulos', 'tx1'))).data(), m = (await F.getDoc(F.doc(db, 'movimientos', 'tx-m1'))).data();
  let cod = 'sin error';
  try { await F.runTransaction(db, async (t) => { t.set(F.doc(db, 'articulos', 'tx2'), { a: 1 }); throw Object.assign(new Error('x'), { code: 'mio' }); }); } catch (e) { cod = e.code; }
  const t2 = await F.getDoc(F.doc(db, 'articulos', 'tx2'));
  return { a, m, cod, existe: t2.exists() };
});
mostrar(tx.a.cantidad === 7 && tx.m.vio === 5, 'runTransaction: lee, suma con increment y escribe todo junto', JSON.stringify(tx));
mostrar(tx.cod === 'mio' && !tx.existe, 'runTransaction: si la función falla no se guarda nada y el error sale tal cual', JSON.stringify(tx));
const perfil = await pag.evaluate(async () => {
  const A = await import('/firebase-auth.js'), F = await import('/firebase-firestore.js'), db = F.getFirestore();
  const codigo = async (p) => { try { await p; return 'sin error'; } catch (e) { return e.code || e.message; } };
  await A.createUserWithEmailAndPassword(A.getAuth(), 'nuevo.perfil@demo.co', 'clave-larga-123');
  const uid = A.getAuth().currentUser.uid;
  await F.setDoc(F.doc(db, 'codigos', 'LOG-AAAA-BBBB'), { rol: 'logistica', activo: true });
  const datos = { nombre: 'Persona Nueva', correo: 'nuevo.perfil@demo.co', rol: 'logistica', codigo: 'LOG-AAAA-BBBB', activo: true, en: new Date().toISOString() };
  const antes = await codigo(F.setDoc(F.doc(db, 'usuarios', uid), datos));
  window.__fbConfirmar('nuevo.perfil@demo.co');
  const despues = await codigo(F.setDoc(F.doc(db, 'usuarios', uid), datos));
  return { antes, despues };
});
mostrar(perfil.antes === 'permission-denied', 'perfil: con el correo sin confirmar no se crea (como las reglas: email_verified)', JSON.stringify(perfil));
mostrar(perfil.despues === 'sin error', 'perfil: con el correo confirmado y un código válido sí se crea', JSON.stringify(perfil));

await navegador.close();
servidor.close();
console.log(fallas ? '\n' + fallas + ' caso(s) con FALLA' : '\nTodo OK');
process.exit(fallas ? 1 : 0);
