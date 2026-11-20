// Firebase falso (solo pruebas): imita firebase-firestore.js v10.12.2.
// Estado en localStorage '__fb_datos' = { coleccion: { id: datos } }.
// Simulaciones activables desde la pagina:
//   window.__fbDenegar = true       -> todo falla con code 'permission-denied'
//   window.__fbNoDisponible = true  -> todo falla con code 'unavailable'
// (en onSnapshot, el fallo se entrega al callback de error y el oyente se da de baja).

const K_DATOS = '__fb_datos';
const RETRASO_MS = 5; // parecido a la red

// ---------- Utilidades ----------
function leer() {
  try { return JSON.parse(localStorage.getItem(K_DATOS) || '{}') || {}; } catch { return {}; }
}
function guardar(datos) { localStorage.setItem(K_DATOS, JSON.stringify(datos)); }

function crearError(code, mensaje) {
  const e = new Error(mensaje || ('Firebase: Error (' + code + ').'));
  e.name = 'FirebaseError';
  e.code = code;
  return e;
}

// Devuelve el error simulado activo (o null).
function falloSimulado() {
  if (window.__fbDenegar) return crearError('permission-denied', 'Missing or insufficient permissions.');
  if (window.__fbNoDisponible) return crearError('unavailable', 'The service is currently unavailable.');
  return null;
}

// Ejecuta fn tras un retraso pequeño; las lecturas/escrituras fallan si hay fallo simulado.
function operacion(fn) {
  return new Promise((resolver, rechazar) => {
    setTimeout(() => {
      try {
        const f = falloSimulado();
        if (f) throw f;
        resolver(fn());
      } catch (e) { rechazar(e); }
    }, RETRASO_MS);
  });
}

const copia = (x) => structuredClone(x);
const esPlano = (x) => Object.prototype.toString.call(x) === '[object Object]';

// increment(n): como el de Firebase, suma n al número guardado (o lo pone en n si no había número).
export function increment(n) { return { __incremento: Number(n) }; }
const esIncremento = (x) => esPlano(x) && Object.keys(x).length === 1 && typeof x.__incremento === 'number';
const sumar = (actual, inc) => (typeof actual === 'number' ? actual : 0) + inc.__incremento;
// Cambia los increment() que queden en un objeto nuevo (set sin merge) por su número.
function resolver(x) {
  if (esIncremento(x)) return x.__incremento;
  if (esPlano(x)) { for (const k of Object.keys(x)) x[k] = resolver(x[k]); }
  return x;
}

// Mezcla profunda: objetos planos se mezclan; arrays y valores se reemplazan.
function mezclar(destino, origen) {
  for (const k of Object.keys(origen)) {
    if (esIncremento(origen[k])) destino[k] = sumar(destino[k], origen[k]);
    else if (esPlano(origen[k]) && esPlano(destino[k])) mezclar(destino[k], origen[k]);
    else destino[k] = resolver(origen[k]);
  }
  return destino;
}

// ---------- Referencias ----------
export function getFirestore(_app) { return db; }
const db = { type: 'firestore' };

export function collection(_db, nombre) {
  return { id: String(nombre), path: String(nombre), type: 'collection' };
}

export function doc(base, a, b) {
  let col, id;
  if (base && base.type === 'collection') { col = base.id; id = a; }   // doc(colRef, id)
  else { col = a; id = b; }                                            // doc(db, col, id)
  if (!col || id === undefined || id === null || id === '') {
    throw new Error('Referencia de documento invalida');
  }
  return { id: String(id), path: col + '/' + id, type: 'document', parent: { id: String(col) } };
}

function exigirDoc(ref) {
  if (!ref || ref.type !== 'document') throw new TypeError('Se esperaba una referencia de documento');
}

// ---------- Instantaneas ----------
function snapDoc(ref, datosGuardados) {
  const existe = datosGuardados !== undefined;
  const fija = existe ? copia(datosGuardados) : undefined; // copia propia de la instantanea
  return {
    id: ref.id,
    ref,
    exists: () => existe,
    metadata: { hasPendingWrites: false, fromCache: false },
    data: () => (existe ? copia(fija) : undefined), // siempre una copia nueva
  };
}

// query(colRef, where(campo, '==', valor)): solo el filtro de igualdad (lo único que usa la app).
export function where(campo, op, valor) { return { campo, op, valor }; }
export function query(colRef, ...filtros) { return Object.assign({}, colRef, { filtros }); }
function snapColeccion(colRef, datos) {
  const col = datos[colRef.id] || {};
  const pasa = (d) => (colRef.filtros || []).every((f) => f.op === '==' && d[f.campo] === f.valor);
  // Firestore ordena por id de documento.
  const docs = Object.keys(col).sort().filter((id) => pasa(col[id])).map((id) => snapDoc(doc(colRef, id), col[id]));
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (fn) => docs.forEach(fn),
  };
}

// ---------- Lecturas ----------
export function getDoc(ref) {
  exigirDoc(ref);
  return operacion(() => snapDoc(ref, (leer()[ref.parent.id] || {})[ref.id]));
}

export function getDocs(colRef) {
  return operacion(() => snapColeccion(colRef, leer()));
}

// ---------- Escrituras (funciones puras sobre un objeto 'datos') ----------
// Copia de la regla de firestore.rules para crear un perfil: el código debe existir, estar activo y ser del mismo rol.
function revisarPerfilNuevo(datos, ref, data) {
  if (ref.parent.id !== 'usuarios' || (datos.usuarios && datos.usuarios[ref.id])) return;
  // Con invitación: la de su correo tiene que existir y decir el mismo nombre y rol (lo demás lo revisan las reglas reales).
  if (data && data.codigo === 'invitacion') {
    const inv = (datos.invitaciones || {})[String(data.correo || '').toLowerCase()];
    if (!inv || inv.rol !== data.rol || inv.nombre !== data.nombre || data.activo !== true) throw crearError('permission-denied', 'Missing or insufficient permissions.');
    return;
  }
  const col = data && ['gerente', 'jefe'].includes(data.rol) ? 'codigosDireccion' : 'codigos';
  const c = (datos[col] || {})[data && data.codigo];
  if (!c || c.activo !== true || c.rol !== data.rol || data.activo !== true) throw crearError('permission-denied', 'Missing or insufficient permissions.');
}

function aplicarSet(datos, ref, data, opciones) {
  exigirDoc(ref);
  revisarPerfilNuevo(datos, ref, data);
  const col = (datos[ref.parent.id] = datos[ref.parent.id] || {});
  const nuevo = copia(data);
  if (opciones && opciones.merge && esPlano(col[ref.id])) col[ref.id] = mezclar(col[ref.id], nuevo);
  else col[ref.id] = resolver(nuevo);
}

function aplicarUpdate(datos, ref, data) {
  exigirDoc(ref);
  const actual = (datos[ref.parent.id] || {})[ref.id];
  if (actual === undefined) throw crearError('not-found', 'No document to update: ' + ref.path);
  for (const clave of Object.keys(data)) {
    const valor = copia(data[clave]);
    const partes = clave.split('.');
    let nodo = actual;
    for (let i = 0; i < partes.length - 1; i++) {
      if (!esPlano(nodo[partes[i]])) nodo[partes[i]] = {};
      nodo = nodo[partes[i]];
    }
    const ultima = partes[partes.length - 1];
    nodo[ultima] = esIncremento(valor) ? sumar(nodo[ultima], valor) : resolver(valor);
  }
}

function aplicarDelete(datos, ref) {
  exigirDoc(ref);
  const col = datos[ref.parent.id];
  if (!col) return;
  delete col[ref.id];
  if (Object.keys(col).length === 0) delete datos[ref.parent.id]; // no dejar colecciones vacias
}

// Aplica una lista de operaciones de forma atomica (todo o nada) y notifica una vez.
function escribir(ops) {
  const antes = leer();
  const despues = copia(antes);
  for (const op of ops) op(despues); // si alguna lanza, no se guarda nada
  guardar(despues);
  emitir(antes, despues);
}

export function setDoc(ref, data, opciones) {
  return operacion(() => escribir([(d) => aplicarSet(d, ref, data, opciones)]));
}
export function updateDoc(ref, data) {
  return operacion(() => escribir([(d) => aplicarUpdate(d, ref, data)]));
}
export function deleteDoc(ref) {
  return operacion(() => escribir([(d) => aplicarDelete(d, ref)]));
}

export function writeBatch(_db) {
  const ops = [];
  let terminado = false;
  const lote = {
    set(ref, data, opciones) { ops.push((d) => aplicarSet(d, ref, data, opciones)); return lote; },
    update(ref, data) { ops.push((d) => aplicarUpdate(d, ref, data)); return lote; },
    delete(ref) { ops.push((d) => aplicarDelete(d, ref)); return lote; },
    commit() {
      if (terminado) return Promise.reject(new Error('Un lote de escritura solo se puede confirmar una vez.'));
      terminado = true;
      return operacion(() => escribir(ops));
    },
  };
  return lote;
}

// ---------- Oyentes (onSnapshot) ----------
const oyentes = new Set();
let visto = leer(); // ultimo estado conocido, para comparar cuando cambia otra pestaña

// Calcula que documentos cambiaron entre dos estados.
function diferencias(antes, despues) {
  const cols = new Set(); const docs = new Set();
  for (const c of new Set([...Object.keys(antes), ...Object.keys(despues)])) {
    const a = antes[c] || {}; const b = despues[c] || {};
    for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (JSON.stringify(a[id]) !== JSON.stringify(b[id])) { cols.add(c); docs.add(c + '/' + id); }
    }
  }
  return { cols, docs };
}

// Avisa UNA sola vez a cada oyente afectado (aunque el lote toque varios documentos).
function emitir(antes, despues) {
  visto = despues;
  const { cols, docs } = diferencias(antes, despues);
  for (const o of [...oyentes]) {
    const afecta = o.ref.type === 'collection' ? cols.has(o.ref.id) : docs.has(o.ref.path);
    if (afecta) setTimeout(() => entregar(o), 0);
  }
}

function entregar(o) {
  if (!o.vivo) return;
  const f = falloSimulado();
  if (f) { // un oyente con error termina, como en Firebase real
    o.vivo = false; oyentes.delete(o);
    if (typeof o.error === 'function') o.error(f);
    return;
  }
  const datos = leer();
  o.next(o.ref.type === 'collection'
    ? snapColeccion(o.ref, datos)
    : snapDoc(o.ref, (datos[o.ref.parent.id] || {})[o.ref.id]));
}

// Cambios hechos desde otra pestaña del mismo origen.
window.addEventListener('storage', (e) => {
  if (e.key !== K_DATOS && e.key !== null) return;
  emitir(visto, leer());
});

export function onSnapshot(ref, a, b, c) {
  // Igual que el real: onSnapshot(ref, next, error) u onSnapshot(ref, opciones, next, error).
  const conOpciones = a && typeof a === 'object' && typeof a !== 'function';
  const next = conOpciones ? b : a, error = conOpciones ? c : b;
  const o = { ref, next, error, vivo: true };
  oyentes.add(o);
  setTimeout(() => entregar(o), RETRASO_MS); // primera llamada asincrona con el estado actual
  return () => { o.vivo = false; oyentes.delete(o); };
}
