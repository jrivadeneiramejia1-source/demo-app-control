/* nube.js — Conexión de la demo con Firebase (Authentication con correo y clave + Firestore).
   Es nuevo y aparte del de las apps reales: no usa la clave compartida, no manda errores a Slack ni avisos al teléfono.
   Uso desde app.js:  await nube.iniciar(alCambiarSesion)  ·  nube.entrar(rol)  ·  nube.salir()
                      nube.escuchar(coleccion, fn, fnError)  ·  nube.guardar / nube.mezclar / nube.borrar  ·  nube.sembrar(forzar) */
(function () {
  'use strict';
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const COLECCIONES = ['equipos', 'hojas', 'tareasEq', 'compras', 'articulos', 'movimientos', 'solicitudes', 'vehiculos', 'novedades', 'entregas', 'tanqueos', 'reservas', 'proveedores', 'reuniones', 'necesidades', 'avisos'];
  let A = null, FS = null, auth = null, db = null;

  /** ¿config.js ya tiene los datos del proyecto? (si no, la app explica qué falta en vez de fallar). */
  function configLista() {
    const c = window.FIREBASE_CONFIG;
    return !!(c && typeof c === 'object' && c.apiKey && c.projectId && !/PEGA|AQU[IÍ]/i.test(String(c.apiKey) + c.projectId));
  }

  /** Mensaje claro en español para cada error de Firebase. */
  function explicar(e) {
    const c = (e && e.code) || '';
    const t = {
      'auth/network-request-failed': 'No hay conexión a internet. Revisa la señal y vuelve a intentar.',
      'auth/too-many-requests': 'Firebase frenó los intentos por un rato. Espera un minuto y vuelve a intentar.',
      'auth/operation-not-allowed': 'En Firebase falta activar el inicio con correo y contraseña (Authentication).',
      'auth/admin-restricted-operation': 'En Firebase está apagada la creación de cuentas. Actívala o crea las cuentas de prueba a mano.',
      'auth/invalid-api-key': 'La configuración de config.js no es válida. Vuelve a copiarla desde Firebase.',
      'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'La configuración de config.js no es válida. Vuelve a copiarla desde Firebase.',
      'auth/clave-distinta': 'Esta cuenta de prueba ya existe en Firebase con otra clave. Bórrala en Authentication y vuelve a entrar.',
      'auth/invalid-credential': 'El correo o la clave no coinciden. Revísalos y vuelve a intentar.',
      'auth/invalid-email': 'Ese correo no está bien escrito.',
      'auth/missing-password': 'Escribe la clave.',
      'auth/weak-password': 'La clave es muy débil. Usa 10 caracteres o más.',
      'auth/popup-closed-by-user': 'Cerraste la ventana de Google antes de terminar. Toca el botón otra vez.',
      'auth/cancelled-popup-request': 'Ya hay una ventana de Google abierta. Termina ahí o ciérrala y vuelve a intentar.',
      'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Permítela y vuelve a intentar.',
      'auth/account-exists-with-different-credential': 'Ese correo ya tiene cuenta con otra forma de entrar. Entra con tu correo y tu clave.',
      'auth/unauthorized-domain': 'En Firebase falta autorizar esta dirección de la app (Authentication > Settings > Authorized domains).',
      'auth/email-already-in-use': 'Ese correo ya tiene cuenta. Toca «Entrar» y escribe tu clave.',
      'codigo-malo': 'Ese código no sirve. Pídele a tu jefe el código de tu rol y escríbelo tal cual (ejemplo: LOG-7KQ4-M2XP).',
      'permission-denied': 'Firebase no dejó hacer este cambio. Puede que otra persona ya lo cambió (revisa la lista otra vez) o que falte pegar las reglas de firestore.rules en Firestore Database, pestaña Reglas.',
      'unavailable': 'Sin conexión con la base de datos. Lo que hagas se guarda cuando vuelva la señal.',
      'not-found': 'Ese registro ya no existe. Puede que otra persona lo haya borrado.',
      'sin-sdk': 'Firebase no alcanzó a cargar. Revisa la conexión a internet y toca Reintentar arriba.',
      'falta-sembrar': 'Todavía no hay datos de prueba. Entra una vez con la Jefe de prueba (Carolina Castillo) para cargarlos.',
      'datos-viejos': 'Hay una versión nueva de los datos de prueba. Entra una vez con la Jefe de prueba (Carolina Castillo) para actualizarlos.'
    };
    return t[c] || ('Algo salió mal con Firebase' + (c ? ' (' + c + ')' : '') + '. Vuelve a intentar.');
  }

  /** Carga el SDK, abre Firebase y avisa cada vez que cambia la persona que tiene la sesión. */
  async function iniciar(alCambiarSesion) {
    if (!configLista()) { const e = new Error('Falta la configuración de Firebase'); e.code = 'sin-config'; throw e; }
    const [App, Au, F] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
    A = Au; FS = F;
    const app = App.initializeApp(window.FIREBASE_CONFIG);
    auth = A.getAuth(app);
    db = F.getFirestore(app);
    auth.languageCode = 'es';
    A.getRedirectResult(auth).catch(() => {});   // si volvió de Google por redirección, termina el ingreso
    alCambiarSesionFn = alCambiarSesion;
    A.onAuthStateChanged(auth, u => abrirSesion(u));
  }
  let alCambiarSesionFn = null, oyentePerfil = null;
  const yaProbeInvitacion = new Set();
  const conClave = u => (u.providerData || []).length > 0 && u.providerData.every(x => x.providerId === 'password');

  /** Decide qué ve la persona al abrir sesión: prueba, correo sin confirmar, perfil (con su rol y permisos) o «sin perfil». */
  function abrirSesion(u) {
    const alCambiarSesion = alCambiarSesionFn;
    if (oyentePerfil) { oyentePerfil(); oyentePerfil = null; }
    if (!u) { alCambiarSesion(null); return; }
    const prueba = window.DEMO.porCorreo(u.email);
    if (prueba) { alCambiarSesion(prueba); return; }
    // Cuenta real con correo y clave: tiene que confirmar el correo (el enlace que le llega). Con Google ya viene confirmado.
    if (!u.emailVerified && conClave(u)) { alCambiarSesion({ sinConfirmar: true, correo: u.email }); return; }
    // Cuenta real: el rol y los permisos salen de su perfil (usuarios/<uid>), que solo se crea con un código válido o con la
    // invitación que la Jefe hizo a su correo. Se escucha en vivo: si la Jefe le cambia el rol o le quita el acceso, la app cambia al instante.
    let ultimo = '';
    oyentePerfil = FS.onSnapshot(FS.doc(db, 'usuarios', u.uid), { includeMetadataChanges: true }, s => {
      // Mientras Firebase no confirme el perfil recién escrito (código por revisar), no se entra.
      if (s.metadata && s.metadata.hasPendingWrites) return;
      const d = s.exists() ? s.data() : null;
      if (!d && !yaProbeInvitacion.has(u.uid)) {
        // Primera vez: se busca la invitación de su correo. Si hay, se crea el perfil y este mismo oyente lo recibe.
        yaProbeInvitacion.add(u.uid);
        reclamarInvitacion(u).then(ok => { if (!ok) { ultimo = ''; alCambiarSesion({ sinPerfil: true, correo: u.email, sinInvitacion: true }); } });
        return;
      }
      const p = !d ? { sinPerfil: true, correo: u.email, sinInvitacion: true }
        : d.activo !== true ? { sinAcceso: true, correo: u.email, nombre: d.nombre }
        : (window.DEMO.armar(d.rol, d.nombre, u.email, '', { real: true, uid: u.uid, extras: d.extras, permisos: d.permisos }) || { sinPerfil: true, correo: u.email });
      const firma = JSON.stringify([p.rol, p.nombre, !!p.sinPerfil, !!p.sinAcceso, p.extras || [], p.ajustes || {}]);
      if (firma !== ultimo) { ultimo = firma; alCambiarSesion(p); }
    }, e => alCambiarSesion({ sinPerfil: true, correo: u.email, error: e && e.code === 'permission-denied' ? '' : explicar(e) }));
  }

  /** Crea el perfil con lo que dice la invitación (nombre, rol y permisos) y la gasta (una sola vez). Devuelve false si no hay invitación. */
  async function reclamarInvitacion(u) {
    const correo = String(u.email || '').toLowerCase(), ref = FS.doc(db, 'invitaciones', correo);
    try {
      const s = await FS.getDoc(ref);
      if (!s.exists()) return false;
      const d = s.data(), b = FS.writeBatch(db);
      b.set(FS.doc(db, 'usuarios', u.uid), { nombre: d.nombre, correo: u.email, rol: d.rol, codigo: 'invitacion', activo: true, en: new Date().toISOString(),
        permisos: d.permisos && typeof d.permisos === 'object' ? d.permisos : {}, extras: Array.isArray(d.extras) ? d.extras : [] });
      b.delete(ref);
      await b.commit();
      return true;
    } catch (e) { return false; }
  }

  /** Confirmar el correo: reenviar el enlace y revisar si ya lo tocó. */
  async function reenviarConfirmacion() {
    if (!auth || !auth.currentUser) { const e = new Error('sin sesión'); e.code = 'sin-sdk'; throw e; }
    await A.sendEmailVerification(auth.currentUser);
  }
  async function yaConfirme() {
    const u = auth && auth.currentUser; if (!u) return false;
    await u.reload();
    if (!u.emailVerified) return false;
    await u.getIdToken(true);   // el permiso nuevo (correo confirmado) viaja en el token: hay que renovarlo
    abrirSesion(auth.currentUser);
    return true;
  }
  /** «Olvidé mi clave»: Firebase manda un correo con el enlace para poner una nueva. */
  async function recuperarClave(correo) {
    if (!auth) { const e = new Error('Firebase no cargó'); e.code = 'sin-sdk'; throw e; }
    await A.sendPasswordResetEmail(auth, String(correo || '').trim());
  }
  /** Entrar con Google (el correo ya viene confirmado). Si el navegador no deja la ventana, se usa la redirección. */
  async function entrarGoogle() {
    if (!auth) { const e = new Error('Firebase no cargó'); e.code = 'sin-sdk'; throw e; }
    const prov = new A.GoogleAuthProvider(); prov.setCustomParameters({ prompt: 'select_account' });
    try { await A.signInWithPopup(auth, prov); }
    catch (e) { if (e && ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) { await A.signInWithRedirect(auth, prov); return; } throw e; }
  }

  /* ---------- cuentas reales (con el código del rol) ---------- */
  const uid = () => (auth && auth.currentUser ? auth.currentUser.uid : '');
  /** Correo de la sesión (el mismo que las reglas leen en el token). */
  const correo = () => (auth && auth.currentUser && auth.currentUser.email ? auth.currentUser.email : '');
  /** Token de la sesión (lo revisa el Worker del agente para saber que es alguien de la app). */
  const token = () => (auth && auth.currentUser ? auth.currentUser.getIdToken() : Promise.reject(new Error('sin sesión')));
  const limpiarCodigo = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]{3})([A-Z0-9]{4})([A-Z0-9]{4})$/, '$1-$2-$3');
  async function entrarCuenta(correo, clave) {
    if (!auth) { const e = new Error('Firebase no cargó'); e.code = 'sin-sdk'; throw e; }
    await A.signInWithEmailAndPassword(auth, String(correo || '').trim(), clave);
  }
  async function crearCuenta(correo, clave) {
    if (!auth) { const e = new Error('Firebase no cargó'); e.code = 'sin-sdk'; throw e; }
    if (window.DEMO.porCorreo(correo)) { const e = new Error('prueba'); e.code = 'auth/email-already-in-use'; throw e; }
    const c = await A.createUserWithEmailAndPassword(auth, String(correo || '').trim(), clave);
    try { await A.sendEmailVerification(c.user); } catch (e) { /* si falla, en la pantalla de confirmar está el botón para reenviarlo */ }
  }
  /** Guarda el perfil con el rol del código. Firebase revisa que el código exista, esté activo y sea de ese rol. */
  async function usarCodigo(nombre, codigo) {
    const u = auth && auth.currentUser;
    const c = limpiarCodigo(codigo), rol = window.DEMO.rolDeCodigo(c);
    if (!u || !rol) { const e = new Error('Código'); e.code = 'codigo-malo'; throw e; }
    // Los códigos de Gerente y Jefe son de un solo uso: se borran en la misma escritura que crea el perfil.
    const b = FS.writeBatch(db);
    b.set(FS.doc(db, 'usuarios', u.uid), { nombre: String(nombre || '').trim().slice(0, 60), correo: String(u.email || ''), rol, codigo: c, activo: true, en: new Date().toISOString() });
    if (['gerente', 'jefe'].includes(rol)) b.delete(FS.doc(db, 'codigosDireccion', c));
    try { await b.commit(); }
    catch (e) { if (e && e.code === 'permission-denied') { const x = new Error('Código'); x.code = 'codigo-malo'; throw x; } throw e; }
  }
  /** Código nuevo para un rol: 3 letras del rol + 8 caracteres al azar (sin 0, O, 1, I ni L para que no se confundan). */
  function codigoNuevo(rol) {
    const r = window.DEMO.rolDe(rol); if (!r) return '';
    const L = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', a = new Uint32Array(8);
    crypto.getRandomValues(a);
    const x = [...a].map(n => L[n % L.length]).join('');
    return `${r.pref}-${x.slice(0, 4)}-${x.slice(4)}`;
  }

  /** Entra con la cuenta de prueba de ese rol. Si la cuenta todavía no existe en Firebase, la crea (solo la primera vez). */
  async function entrar(quien) {
    // quien: el correo de la persona de prueba (también sirve el rol: entra la primera de ese rol).
    const p = window.DEMO.porCorreo(quien) || window.DEMO.porRol(quien);
    if (!p) throw new Error('Persona desconocida');
    if (!auth) { const e = new Error('Firebase no cargó'); e.code = 'sin-sdk'; throw e; }
    if (auth.currentUser && auth.currentUser.email === p.correo) return p;
    // No se cierra la sesión antes: entrar con otra cuenta la reemplaza directo y así la pantalla de entrada no parpadea.
    try {
      await A.signInWithEmailAndPassword(auth, p.correo, window.DEMO.CLAVE);
    } catch (e) {
      // Con la protección contra enumeración de Firebase, "no existe" y "clave mala" dan el mismo error.
      if (!['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password', 'auth/invalid-login-credentials'].includes(e.code)) throw e;
      try { await A.createUserWithEmailAndPassword(auth, p.correo, window.DEMO.CLAVE); }
      catch (e2) {
        if (e2.code === 'auth/email-already-in-use') {
          // Puede que otro teléfono la haya creado hace un instante: se intenta entrar una vez más antes de culpar a la clave.
          try { await A.signInWithEmailAndPassword(auth, p.correo, window.DEMO.CLAVE); return p; }
          catch (e3) { if (!['auth/invalid-credential', 'auth/wrong-password', 'auth/invalid-login-credentials'].includes(e3.code)) throw e3; }
          const x = new Error('Clave distinta'); x.code = 'auth/clave-distinta'; throw x;
        }
        throw e2;
      }
    }
    return p;
  }

  const salir = () => (auth ? A.signOut(auth) : Promise.resolve());

  /** La Jefe sube la lista de personas: una invitación por correo (el documento se llama como el correo, en minúscula). */
  async function invitar(lista, por) {
    const ahora = new Date().toISOString();
    for (let i = 0; i < lista.length; i += 450) {
      const b = FS.writeBatch(db);
      lista.slice(i, i + 450).forEach(x => b.set(FS.doc(db, 'invitaciones', x.correo), { nombre: x.nombre, rol: x.rol, permisos: x.permisos || {}, extras: x.extras || [], por: String(por || ''), en: ahora }));
      await b.commit();
    }
  }

  /** Escucha una colección en vivo. fn recibe un arreglo de { id, ...datos }. Devuelve la función para dejar de escuchar.
      donde = [campo, valor]: solo los documentos con ese valor (las reglas lo exigen a quien solo puede leer lo suyo). */
  function escuchar(col, fn, fnError, donde) {
    const ref = donde ? FS.query(FS.collection(db, col), FS.where(donde[0], '==', donde[1])) : FS.collection(db, col);
    return FS.onSnapshot(ref,
      s => fn(s.docs.map(d => Object.assign({ id: d.id }, d.data()))),
      e => { if (fnError) fnError(e); });
  }
  const guardar = (col, id, datos) => FS.setDoc(FS.doc(db, col, id), datos);
  const mezclar = (col, id, datos) => FS.setDoc(FS.doc(db, col, id), datos, { merge: true });
  const borrar = (col, id) => FS.deleteDoc(FS.doc(db, col, id));

  /** Pone los datos de ejemplo. Sin forzar, solo si la base está vacía (demo/estado no existe).
      Con forzar (botón Reiniciar), borra todo lo de las colecciones de la demo y vuelve a sembrar con fechas de hoy. */
  async function sembrar(forzar, rol) {
    const estadoRef = FS.doc(db, 'demo', 'estado');
    if (!forzar) {
      // Se siembra si la base está vacía o si los datos guardados son de una versión anterior de la demo.
      const s = await FS.getDoc(estadoRef);
      if (s.exists() && Number(s.data().version) >= window.DatosDemo.VERSION) return false;
      // Solo la Jefe carga o actualiza los datos de prueba (así lo piden las reglas).
      if (rol !== 'jefe') { const e = new Error('Faltan datos'); e.code = s.exists() ? 'datos-viejos' : 'falta-sembrar'; throw e; }
      if (s.exists()) forzar = true;
    }
    const datos = window.DatosDemo.generar(new Date());
    // Primero se borra lo que sobre (solo al reiniciar), en lotes de máximo 450 operaciones (el límite de Firebase es 500).
    const ops = [];
    if (forzar) {
      for (const col of COLECCIONES) {
        const s = await FS.getDocs(FS.collection(db, col));
        s.docs.forEach(d => { if (!(datos[col] && datos[col][d.id])) ops.push(['del', FS.doc(db, col, d.id)]); });
      }
    }
    COLECCIONES.forEach(col => Object.entries(datos[col] || {}).forEach(([id, v]) => ops.push(['set', FS.doc(db, col, id), v])));
    ops.push(['set', estadoRef, { sembrado: new Date().toISOString(), version: window.DatosDemo.VERSION, por: rol || '' }]);
    for (let i = 0; i < ops.length; i += 450) {
      const b = FS.writeBatch(db);
      ops.slice(i, i + 450).forEach(([t, ref, v]) => (t === 'del' ? b.delete(ref) : b.set(ref, v)));
      await b.commit();
    }
    return true;
  }

  /** Id nuevo para un documento (fecha + azar), legible y ordenable por fecha. */
  const idNuevo = pref => `${pref}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  /** Suma o resta a un número guardado sin pisar lo que otra persona haya cambiado al mismo tiempo. */
  const incremento = n => FS.increment(n);
  /** La hora del servidor de Firebase (no se puede inventar desde el teléfono). */
  const ahoraServidor = () => FS.serverTimestamp();
  /** Varias escrituras que se guardan todas juntas o ninguna. ops: [['set'|'mezclar'|'update'|'borrar', col, id, datos]]. */
  async function lote(ops) {
    const b = FS.writeBatch(db);
    ops.forEach(([t, col, id, datos]) => {
      const ref = FS.doc(db, col, id);
      if (t === 'set') b.set(ref, datos); else if (t === 'mezclar') b.set(ref, datos, { merge: true }); else if (t === 'borrar') b.delete(ref); else b.update(ref, datos);
    });
    await b.commit();
  }

  window.nube = Object.freeze({ configLista, explicar, iniciar, entrar, salir, escuchar, guardar, mezclar, borrar, sembrar, idNuevo, incremento, lote, COLECCIONES,
    uid, correo, ahoraServidor, token, entrarCuenta, crearCuenta, usarCodigo, codigoNuevo, limpiarCodigo, entrarGoogle, reenviarConfirmacion, yaConfirme, invitar, recuperarClave });
})();
