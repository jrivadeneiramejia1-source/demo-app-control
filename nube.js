/* nube.js — Conexión de la demo con Firebase (Authentication con correo y clave + Firestore).
   Es nuevo y aparte del de las apps reales: no usa la clave compartida, no manda errores a Slack ni avisos al teléfono.
   Uso desde app.js:  await nube.iniciar(alCambiarSesion)  ·  nube.entrar(rol)  ·  nube.salir()
                      nube.escuchar(coleccion, fn, fnError)  ·  nube.guardar / nube.mezclar / nube.borrar  ·  nube.sembrar(forzar) */
(function () {
  'use strict';
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const COLECCIONES = ['equipos', 'compras', 'vehiculos', 'reuniones', 'avisos'];
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
      'permission-denied': 'Firebase no deja leer ni guardar: falta pegar las reglas de firestore.rules en Firestore Database, pestaña Reglas.',
      'unavailable': 'Sin conexión con la base de datos. Lo que hagas se guarda cuando vuelva la señal.',
      'not-found': 'Ese registro ya no existe. Puede que otra persona lo haya borrado.',
      'sin-sdk': 'Firebase no alcanzó a cargar. Revisa la conexión a internet y toca Reintentar arriba.'
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
    A.onAuthStateChanged(auth, u => alCambiarSesion(u ? (window.DEMO.porCorreo(u.email) || { desconocido: true, correo: u.email }) : null));
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
      const s = await FS.getDoc(estadoRef);
      if (s.exists()) return false;
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

  window.nube = Object.freeze({ configLista, explicar, iniciar, entrar, salir, escuchar, guardar, mezclar, borrar, sembrar, COLECCIONES });
})();
