/* push.js: avisos al teléfono (Web Push) de la demo. Define window.Push.
   Necesita: window.AVISOS_DEMO = { url, vapid } (config.js), window.nube (nube.js) y sw.js junto a la página.
   Un teléfono = la persona que tiene la sesión ahora: al cambiar de persona se llama actualizarRol(rol).
   Nada de aquí lanza errores hacia la app: todo devuelve { ok, motivo }. */
(function () {
  'use strict';
  const COLECCION = 'suscripciones';
  const MARCA = 'control_demo_avisos';   // localStorage: este teléfono activó los avisos
  const POR_LOTE = 25;                   // el Worker atiende máximo 25 suscripciones por pedido
  const NUBE_NO = 'No hay conexión con la base de datos. Entra a la app e intenta otra vez.';

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
  async function idDe(endpoint) {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
    return Array.from(new Uint8Array(h)).map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
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
  async function guardar(rol, sub) {
    const s = limpiar(sub);
    const id = await idDe(s.endpoint);
    // Los permisos extra (por ejemplo, Bodega que también compra) para que le lleguen los avisos de ese trabajo.
    const extras = window.App && window.App.S.persona && Array.isArray(window.App.S.persona.extras) ? window.App.S.persona.extras.slice() : [];
    await window.nube.mezclar(COLECCION, id, { rol: String(rol || ''), extras, sub: s, navegador: navegadorCorto(), en: new Date().toISOString() });
    return id;
  }
  async function registro() {
    await navigator.serviceWorker.register('sw.js');   // ruta relativa a la página
    return Promise.race([navigator.serviceWorker.ready, esperar(8000).then(() => { throw new Error('la app no terminó de prepararse'); })]);
  }

  /** Pide permiso, se suscribe y guarda el teléfono en Firestore con el rol de quien tiene la sesión. */
  async function activar(rol) {
    try {
      if (!configurado()) return { ok: false, motivo: 'Faltan los datos del servidor de avisos en config.js.' };
      if (esIphone() && !instalada()) return { ok: false, motivo: 'En iPhone primero instala la app: toca Compartir, luego Agregar a inicio, y ábrela desde el ícono.' };
      if (!soportado()) return { ok: false, motivo: 'Este navegador no permite avisos. Usa Chrome en Android o en el computador.' };
      if (!window.nube || !window.nube.mezclar) return { ok: false, motivo: NUBE_NO };
      if (Notification.permission === 'denied') return { ok: false, motivo: 'Los avisos están bloqueados. Actívalos en los ajustes del navegador, en Notificaciones de este sitio.' };
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') return { ok: false, motivo: permiso === 'denied' ? 'Negaste el permiso. Puedes activarlo en los ajustes del navegador, en Notificaciones de este sitio.' : 'No diste el permiso. Vuelve a intentar y toca Permitir.' };
      const reg = await registro();
      const llave = b64uABytes(cfg().vapid);
      let sub = await reg.pushManager.getSubscription();
      if (sub && !mismaLlave(sub, llave)) { await sub.unsubscribe(); sub = null; }   // quedó de otra llave: se renueva
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llave });
      await guardar(rol, sub);
      lsSet(true);
      return { ok: true, motivo: '' };
    } catch (e) {
      const c = (e && e.code) || '', n = (e && e.name) || '';
      if (c === 'permission-denied') return { ok: false, motivo: 'Firebase no deja guardar este teléfono: faltan las reglas de la colección suscripciones.' };
      if (n === 'NotAllowedError') return { ok: false, motivo: 'El permiso de avisos fue negado.' };
      if (n === 'AbortError' || n === 'NetworkError') return { ok: false, motivo: 'El servicio de avisos del navegador no respondió. Revisa tu internet y vuelve a intentar.' };
      return { ok: false, motivo: 'No se pudieron activar los avisos: ' + ((e && e.message) || 'error desconocido') };
    }
  }

  /** Si este teléfono ya está suscrito, deja guardado el rol de quien tiene la sesión ahora. */
  async function actualizarRol(rol) {
    try {
      if (!soportado() || !configurado() || Notification.permission !== 'granted') return { ok: false, motivo: 'inactivo' };
      if (!window.nube || !window.nube.mezclar) return { ok: false, motivo: NUBE_NO };
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && await reg.pushManager.getSubscription();
      if (!sub) { lsSet(false); return { ok: false, motivo: 'inactivo' }; }
      await guardar(rol, sub);
      lsSet(true);
      return { ok: true, motivo: '' };
    } catch (e) { return { ok: false, motivo: (e && e.message) || 'error' }; }
  }

  /** Da de baja este teléfono y borra su documento. */
  async function desactivar() {
    let id = '';
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      const sub = reg && await reg.pushManager.getSubscription();
      if (sub) { id = await idDe(sub.endpoint); await sub.unsubscribe(); }
    } catch (e) {}
    lsSet(false);
    try { if (id && window.nube) await window.nube.borrar(COLECCION, id); } catch (e) { return { ok: false, motivo: 'Se desactivó aquí, pero no se pudo borrar el registro de la nube.' }; }
    return { ok: true, motivo: '' };
  }

  /** Manda un aviso a las suscripciones dadas. suscripciones: [{ id, rol, sub }]. aviso: { titulo, texto, url, etiqueta }.
      Borra de Firestore las que el servicio dice que ya no existen. Nunca lanza error. */
  async function enviar(suscripciones, aviso) {
    try {
      if (!cfg().url) return { ok: false, enviados: 0, motivo: 'sin-configurar' };
      const lista = (Array.isArray(suscripciones) ? suscripciones : []).filter(d => d && d.sub && d.sub.endpoint && d.sub.keys);
      if (!lista.length) return { ok: true, enviados: 0, motivo: '' };
      const a = aviso || {};
      const idPorEndpoint = new Map(lista.map(d => [d.sub.endpoint, d.id]));
      let enviados = 0, vencidos = 0, fallidos = 0, motivo = '';
      for (let i = 0; i < lista.length; i += POR_LOTE) {
        const lote = lista.slice(i, i + POR_LOTE);
        try {
          const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
          const r = await fetch(cfg().url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
            body: JSON.stringify({ subs: lote.map(d => ({ endpoint: d.sub.endpoint, keys: d.sub.keys })), titulo: a.titulo, texto: a.texto, url: a.url, etiqueta: a.etiqueta })
          }).finally(() => clearTimeout(t));
          const j = await r.json().catch(() => ({}));
          if (!r.ok) { fallidos += lote.length; motivo = j.error || 'El servidor de avisos respondió ' + r.status; continue; }
          enviados += Number(j.enviados) || 0;
          const venc = Array.isArray(j.vencidos) ? j.vencidos : [];
          vencidos += venc.length;
          fallidos += Array.isArray(j.fallidos) ? j.fallidos.length : 0;
          for (const ep of venc) {
            const id = idPorEndpoint.get(ep);
            try { if (id && window.nube) await window.nube.borrar(COLECCION, id); } catch (e) {}
          }
        } catch (e) { fallidos += lote.length; motivo = 'No se pudo hablar con el servidor de avisos. Revisa tu internet.'; }
      }
      return { ok: enviados > 0 || (!fallidos && !motivo), enviados, vencidos, fallidos, motivo };
    } catch (e) { return { ok: false, enviados: 0, motivo: (e && e.message) || 'error' }; }
  }

  window.Push = Object.freeze({ soportado, estado, activar, actualizarRol, desactivar, enviar });
})();
