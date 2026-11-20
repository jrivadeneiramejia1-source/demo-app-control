/* push.js: avisos al teléfono (Web Push) de la demo. Define window.Push.
   Necesita: window.AVISOS_DEMO = { url, vapid } (config.js), window.nube (nube.js) y sw.js junto a la página.
   Los teléfonos con avisos los guarda el Worker de Cloudflare (avisos/worker.js), no Firestore: la app solo le dice «suscribe este
   teléfono» o «avisa a este rol», siempre con el token de la sesión, y el Worker saca el rol de la base. Nadie lee los teléfonos de otros.
   Un teléfono = la persona que tiene la sesión ahora: al cambiar de persona se llama actualizarRol(rol).
   Nada de aquí lanza errores hacia la app: todo devuelve { ok, motivo }. */
(function () {
  'use strict';
  const MARCA = 'control_demo_avisos';   // localStorage: este teléfono activó los avisos
  const NUBE_NO = 'No hay sesión iniciada. Entra a la app e intenta otra vez.';

  const cfg = () => window.AVISOS_DEMO || {};
  const configurado = () => !!(cfg().url && cfg().vapid);
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  const lsGet = () => { try { return localStorage.getItem(MARCA) === '1'; } catch (e) { return false; } };
  const lsSet = v => { try { if (v) localStorage.setItem(MARCA, '1'); else localStorage.removeItem(MARCA); } catch (e) {} };

  function soportado() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function esIphone() {
    const ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);   // iPad nuevo se presenta como Mac
  }
  function instalada() {
    try { return navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); } catch (e) { return false; }
  }
  /** 'no-soportado' | 'sin-configurar' | 'necesita-instalar' | 'negado' | 'activo' | 'inactivo' */
  function estado() {
    if (!configurado()) return 'sin-configurar';
    if (esIphone() && !instalada()) return 'necesita-instalar';   // en iPhone, sin la app en la pantalla de inicio no hay PushManager
    if (!soportado()) return 'no-soportado';
    if (Notification.permission === 'denied') return 'negado';
    return Notification.permission === 'granted' && lsGet() ? 'activo' : 'inactivo';
  }

  function navegadorCorto() {
    const ua = navigator.userAgent || '';
    const so = /iphone/i.test(ua) ? 'iPhone' : /ipad/i.test(ua) ? 'iPad' : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'Windows' : /macintosh/i.test(ua) ? 'Mac' : /linux/i.test(ua) ? 'Linux' : 'otro sistema';
    const nav = /edg\//i.test(ua) ? 'Edge' : /firefox|fxios/i.test(ua) ? 'Firefox' : /samsungbrowser/i.test(ua) ? 'Samsung Internet' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'navegador';
    return nav + ' en ' + so;
  }
  function b64uABytes(s) {
    const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4));
    return Uint8Array.from(b, c => c.charCodeAt(0));
  }
  /** Deja solo endpoint y keys (sin expirationTime ni nada que Firestore no necesite). */
  function limpiar(sub) {
    const j = JSON.parse(JSON.stringify(sub));
    return { endpoint: j.endpoint, keys: { p256dh: (j.keys || {}).p256dh, auth: (j.keys || {}).auth } };
  }
  function mismaLlave(sub, bytes) {
    try {
      const k = sub.options && sub.options.applicationServerKey;
      if (!k) return true;
      const a = new Uint8Array(k);
      return a.length === bytes.length && a.every((v, i) => v === bytes[i]);
    } catch (e) { return true; }
  }
  /** Habla con el Worker con el token de la sesión. Devuelve { r, j } o lanza un error con el motivo en español. */
  async function llamar(ruta, metodo, cuerpo) {
    if (!window.nube || !window.nube.token) throw Object.assign(new Error(NUBE_NO), { motivo: NUBE_NO });
    let token;
    try { token = await window.nube.token(); } catch (e) { throw Object.assign(new Error(NUBE_NO), { motivo: NUBE_NO }); }
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
    let r;
    try {
      r = await fetch(cfg().url.replace(/\/+$/, '') + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(cuerpo), signal: ctl.signal });
    } catch (e) { throw Object.assign(new Error('red'), { motivo: 'No se pudo hablar con el servidor de avisos. Revisa tu internet.' }); }
    finally { clearTimeout(t); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'respuesta ' + r.status), { motivo: j.error || 'El servidor de avisos respondió ' + r.status });
    return { r, j };
  }
  /** Guarda este teléfono en el Worker. El rol (y los permisos extra, como «Bodega que también compra») los saca el Worker de la base. */
  async function guardar(sub) {
    await llamar('/suscribir', 'POST', { sub: limpiar(sub), navegador: navegadorCorto() });
  }
  async function registro() {
    await navigator.serviceWorker.register('sw.js');   // ruta relativa a la página
    return Promise.race([navigator.serviceWorker.ready, esperar(8000).then(() => { throw new Error('la app no terminó de prepararse'); })]);
  }

  /** Pide permiso, se suscribe y guarda el teléfono en el Worker (que le pone el rol de quien tiene la sesión). */
  async function activar() {
    try {
      if (!configurado()) return { ok: false, motivo: 'Faltan los datos del servidor de avisos en config.js.' };
      if (esIphone() && !instalada()) return { ok: false, motivo: 'En iPhone primero instala la app: toca Compartir, luego Agregar a inicio, y ábrela desde el ícono.' };
      if (!soportado()) return { ok: false, motivo: 'Este navegador no permite avisos. Usa Chrome en Android o en el computador.' };
      if (!window.nube || !window.nube.token) return { ok: false, motivo: NUBE_NO };
      if (Notification.permission === 'denied') return { ok: false, motivo: 'Los avisos están bloqueados. Actívalos en los ajustes del navegador, en Notificaciones de este sitio.' };
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') return { ok: false, motivo: permiso === 'denied' ? 'Negaste el permiso. Puedes activarlo en los ajustes del navegador, en Notificaciones de este sitio.' : 'No diste el permiso. Vuelve a intentar y toca Permitir.' };
      const reg = await registro();
      const llave = b64uABytes(cfg().vapid);
      let sub = await reg.pushManager.getSubscription();
      if (sub && !mismaLlave(sub, llave)) { await sub.unsubscribe(); sub = null; }   // quedó de otra llave: se renueva
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llave });
      await guardar(sub);
      lsSet(true);
      return { ok: true, motivo: '' };
    } catch (e) {
      const n = (e && e.name) || '';
      if (e && e.motivo) return { ok: false, motivo: e.motivo };
      if (n === 'NotAllowedError') return { ok: false, motivo: 'El permiso de avisos fue negado.' };
      if (n === 'AbortError' || n === 'NetworkError') return { ok: false, motivo: 'El servicio de avisos del navegador no respondió. Revisa tu internet y vuelve a intentar.' };
      return { ok: false, motivo: 'No se pudieron activar los avisos: ' + ((e && e.message) || 'error desconocido') };
    }
  }

  /** Si este teléfono ya está suscrito, el Worker le deja el rol de quien tiene la sesión ahora. */
  async function actualizarRol() {
    try {
      if (!soportado() || !configurado() || Notification.permission !== 'granted') return { ok: false, motivo: 'inactivo' };
      if (!window.nube || !window.nube.token) return { ok: false, motivo: NUBE_NO };
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && await reg.pushManager.getSubscription();
      if (!sub) { lsSet(false); return { ok: false, motivo: 'inactivo' }; }
      await guardar(sub);
      lsSet(true);
      return { ok: true, motivo: '' };
    } catch (e) { return { ok: false, motivo: (e && (e.motivo || e.message)) || 'error' }; }
  }

  /** Da de baja este teléfono y lo borra del Worker. */
  async function desactivar() {
    let endpoint = '';
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      const sub = reg && await reg.pushManager.getSubscription();
      if (sub) { endpoint = sub.endpoint; await sub.unsubscribe(); }
    } catch (e) {}
    lsSet(false);
    try { if (endpoint) await llamar('/suscribir', 'DELETE', { endpoint }); } catch (e) { return { ok: false, motivo: 'Se desactivó aquí, pero no se pudo borrar el registro del servidor de avisos.' }; }
    return { ok: true, motivo: '' };
  }

  /** Manda un aviso a los teléfonos de un rol (para: 'jefe', 'compras'… o 'yo' = los de quien tiene la sesión). El Worker busca los teléfonos.
      aviso: { titulo, texto, url, etiqueta, exige } (exige: solo a quien tenga ese permiso extra). Nunca lanza error. */
  async function enviar(para, aviso) {
    try {
      if (!cfg().url) return { ok: false, enviados: 0, motivo: 'sin-configurar' };
      if (typeof para !== 'string' || !para) return { ok: true, enviados: 0, motivo: '' };
      const a = aviso || {};
      const { j } = await llamar('/avisar', 'POST', { para, titulo: a.titulo, texto: a.texto, url: a.url, etiqueta: a.etiqueta, exige: a.exige });
      const enviados = Number(j.enviados) || 0;
      return { ok: enviados > 0 || !Number(j.fallidos), enviados, vencidos: Number(j.vencidos) || 0, fallidos: Number(j.fallidos) || 0, motivo: '' };
    } catch (e) { return { ok: false, enviados: 0, motivo: (e && (e.motivo || e.message)) || 'error' }; }
  }

  window.Push = Object.freeze({ soportado, estado, activar, actualizarRol, desactivar, enviar });
})();
