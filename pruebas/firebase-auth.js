// Firebase falso (solo pruebas): imita firebase-auth.js v10.12.2.
// Estado en localStorage para que sobreviva recargas y se vea en otras pestañas:
//   '__fb_usuarios' = { correo: { uid, clave } }
//   '__fb_actual'   = uid del usuario con sesion, o '' si no hay.
// Simulacion de fallo: window.__fbFallarAuth = 'auth/network-request-failed'
// hace fallar la PROXIMA llamada a signIn/create con ese code (y se limpia sola).

const K_USUARIOS = '__fb_usuarios';
const K_ACTUAL = '__fb_actual';
const RETRASO_MS = 5; // parecido a la red

// ---------- Utilidades de almacenamiento ----------
function leerUsuarios() {
  try { return JSON.parse(localStorage.getItem(K_USUARIOS) || '{}') || {}; } catch { return {}; }
}
function guardarUsuarios(u) { localStorage.setItem(K_USUARIOS, JSON.stringify(u)); }
function uidActual() { return localStorage.getItem(K_ACTUAL) || ''; }

// Crea un error con la forma de los errores de Firebase (e.code).
function crearError(code) {
  const e = new Error('Firebase: Error (' + code + ').');
  e.name = 'FirebaseError';
  e.code = code;
  return e;
}

// Ejecuta fn tras un retraso pequeño y devuelve una Promise.
function conRetraso(fn) {
  return new Promise((resolver, rechazar) => {
    setTimeout(() => {
      try { resolver(fn()); } catch (e) { rechazar(e); }
    }, RETRASO_MS);
  });
}

// Si hay un fallo de red simulado pendiente, lo consume y lanza el error.
function consumirFalloSimulado() {
  const code = window.__fbFallarAuth;
  if (code) {
    window.__fbFallarAuth = undefined;
    throw crearError(code);
  }
}

// ---------- Usuario actual ----------
// Se cachea el objeto por uid para devolver el mismo objeto mientras no cambie.
let cacheUsuario = null;
function usuarioActual() {
  const uid = uidActual();
  if (!uid) { cacheUsuario = null; return null; }
  if (cacheUsuario && cacheUsuario.uid === uid) return cacheUsuario;
  const usuarios = leerUsuarios();
  const correo = Object.keys(usuarios).find((c) => usuarios[c].uid === uid);
  if (!correo) { cacheUsuario = null; return null; }
  cacheUsuario = { uid, email: correo };
  return cacheUsuario;
}

// ---------- Auth (siempre el mismo objeto) ----------
const auth = {
  get currentUser() { return usuarioActual(); },
};

export function getAuth(_app) { return auth; }

// ---------- Oyentes ----------
const oyentes = new Set();
let ultimoUid = uidActual(); // para detectar cambios hechos en otras pestañas

function notificar() {
  ultimoUid = uidActual();
  const usuario = usuarioActual();
  for (const o of [...oyentes]) {
    setTimeout(() => { if (o.vivo) o.cb(usuario); }, 0);
  }
}

// Cambios hechos en otra pestaña del mismo origen.
window.addEventListener('storage', (e) => {
  if (e.key !== K_ACTUAL && e.key !== K_USUARIOS && e.key !== null) return;
  if (uidActual() !== ultimoUid) notificar();
});

export function onAuthStateChanged(_auth, cb) {
  const o = { cb, vivo: true };
  oyentes.add(o);
  // Primera llamada asincrona con el usuario actual.
  setTimeout(() => { if (o.vivo) cb(usuarioActual()); }, 0);
  return () => { o.vivo = false; oyentes.delete(o); };
}

// ---------- Operaciones ----------
function normalizarCorreo(email) { return String(email == null ? '' : email).trim().toLowerCase(); }

export function signInWithEmailAndPassword(_auth, email, pass) {
  return conRetraso(() => {
    consumirFalloSimulado();
    const usuarios = leerUsuarios();
    const u = usuarios[normalizarCorreo(email)];
    // Misma respuesta si no existe o la clave es mala (proteccion contra enumeracion).
    if (!u || u.clave !== pass) throw crearError('auth/invalid-credential');
    localStorage.setItem(K_ACTUAL, u.uid);
    notificar();
    return { user: usuarioActual() };
  });
}

export function createUserWithEmailAndPassword(_auth, email, pass) {
  return conRetraso(() => {
    consumirFalloSimulado();
    const correo = normalizarCorreo(email);
    if (!correo.includes('@')) throw crearError('auth/invalid-email');
    if (String(pass == null ? '' : pass).length < 6) throw crearError('auth/weak-password');
    const usuarios = leerUsuarios();
    if (usuarios[correo]) throw crearError('auth/email-already-in-use');
    const uid = 'u-' + Math.random().toString(36).slice(2, 10).padEnd(8, '0');
    usuarios[correo] = { uid, clave: pass };
    guardarUsuarios(usuarios);
    localStorage.setItem(K_ACTUAL, uid); // crear tambien inicia sesion
    notificar();
    return { user: usuarioActual() };
  });
}

export function signOut(_auth) {
  return conRetraso(() => {
    localStorage.setItem(K_ACTUAL, '');
    notificar();
  });
}
