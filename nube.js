/* nube.js — Conexión de la demo con Firebase (Authentication con correo y clave + Firestore).
   Es nuevo y aparte del de las apps reales: no usa la clave compartida, no manda errores a Slack ni avisos al teléfono.
   Uso desde app.js:  await nube.iniciar(alCambiarSesion)  ·  nube.entrar(rol)  ·  nube.salir()
                      nube.escuchar(coleccion, fn, fnError)  ·  nube.guardar / nube.mezclar / nube.borrar  ·  nube.sembrar(forzar) */
(function () {
  'use strict';
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const COLECCIONES = ['equipos', 'hojas', 'tareasEq', 'compras', 'articulos', 'movimientos', 'solicitudes', 'vehiculos', 'novedades', 'entregas', 'reuniones', 'necesidades', 'avisos'];
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
      'auth/weak-password': 'La clave debe tener al menos 6 caracteres.',
      'auth/email-already-in-use': 'Ese correo ya tiene cuenta. Toca «Entrar» y escribe tu clave.',
      'codigo-malo': 'Ese código no sirve. Pídele a tu jefe el código de tu rol y escríbelo tal cual (ejemplo: LOG-7KQ4-M2XP).',
      'permission-denied': 'Firebase no dejó hacer este cambio. Puede que otra persona ya lo cambió (revisa la lista otra vez) o que falte pegar las reglas de firestore.rules en Firestore Database, pestaña Reglas.',
      'unavailable': 'Sin conexión con la base de datos. Lo que hagas se guarda cuando vuelva la señal.',
      'not-found': 'Ese registro ya no existe. Puede que otra persona lo haya borrado.',
      'sin-sdk': 'Firebase no alcanzó a cargar. Revisa la conexión a internet y toca Reintentar arriba.',
      'falta-sembrar': 'Todavía no hay datos de prueba. Entra una vez como Ana Pérez (Jefe) para cargarlos.',
      'datos-viejos': 'Hay una versión nueva de los datos de prueba. Entra una vez como Ana Pérez (Jefe) para actualizarlos.'
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
    A.onAuthStateChanged(auth, u => {
      if (oyentePerfil) { oyentePerfil(); oyentePerfil = null; }
      if (!u) { alCambiarSesion(null); return; }
      const prueba = window.DEMO.porCorreo(u.email);
      if (prueba) { alCambiarSesion(prueba); return; }
      // Cuenta real: el rol sale de su perfil (usuarios/<uid>), que solo se crea con un código válido.
      // Se escucha en vivo: si el Jefe le cambia el rol o le quita el acceso, la app cambia al instante.
      let ultimo = '';
      oyentePerfil = F.onSnapshot(F.doc(db, 'usuarios', u.uid), { includeMetadataChanges: true }, s => {
        // Mientras Firebase no confirme el perfil recién escrito (código por revisar), no se entra.
        if (s.metadata && s.metadata.hasPendingWrites) return;
        const d = s.exists() ? s.data() : null;
        const p = !d ? { sinPerfil: true, correo: u.email }
          : d.activo !== true ? { sinAcceso: true, correo: u.email, nombre: d.nombre }
          : (window.DEMO.armar(d.rol, d.nombre, u.email, '', { real: true, uid: u.uid, extras: d.extras }) || { sinPerfil: true, correo: u.email });
        const firma = JSON.stringify([p.rol, p.nombre, !!p.sinPerfil, !!p.sinAcceso, p.extras || []]);
        if (firma !== ultimo) { ultimo = firma; alCambiarSesion(p); }
      }, e => alCambiarSesion({ sinPerfil: true, correo: u.email, error: e && e.code === 'permission-denied' ? '' : explicar(e) }));
    });
  }
  let oyentePerfil = null;

  /* ---------- cuentas reales (con el código del rol) ---------- */
  const uid = () => (auth && auth.currentUser ? auth.currentUser.uid : '');
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
    await A.createUserWithEmailAndPassword(auth, String(correo || '').trim(), clave);
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
  async function entrar(rol) {
    const p = window.DEMO.porRol(rol);
    if (!p) throw new Error('Rol desconocido');
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

  /** Escucha una colección en vivo. fn recibe un arreglo de { id, ...datos }. Devuelve la función para dejar de escuchar. */
  function escuchar(col, fn, fnError) {
    return FS.onSnapshot(FS.collection(db, col),
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
    uid, token, entrarCuenta, crearCuenta, usarCodigo, codigoNuevo, limpiarCodigo });
})();
