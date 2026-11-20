/* avisos-demo: Worker de Cloudflare que envía los avisos al teléfono (Web Push) de la demo.
   Guarda los teléfonos con avisos activados en Cloudflare KV (no en Firestore): así nadie lee los teléfonos de los demás.
   Todo pedido lleva el token de Firebase de quien lo hace: el Worker revisa la firma (RS256 de Google, proyecto, vencimiento)
   y saca el ROL de la persona de la base (cuenta propia: su perfil activo y con correo confirmado; persona de prueba: su correo y
   el interruptor de la Jefe). El rol no se acepta de la app. Además hay un límite de avisos por cuenta.
   Rutas (todas con «Authorization: Bearer <token>» menos GET /):
     POST   /suscribir   { sub: { endpoint, keys }, navegador }    guarda el teléfono de quien lo pide (hasta 5 por cuenta)
     DELETE /suscribir   { endpoint }                             borra ese teléfono
     POST   /avisar      { para, titulo, texto, url, etiqueta, exige }   le avisa a los teléfonos de un rol («yo» = los de quien pide);
                         exige = solo a quien tenga ese permiso extra («actas», «compra», «encargada»)
   El Worker cifra el mensaje (RFC 8291, aes128gcm) y lo firma (VAPID, RFC 8292) para el servicio de notificaciones del
   teléfono (Google, Apple, Mozilla o Microsoft).

   Hay que crear en Cloudflare:
     Un KV namespace (Storage & databases > KV > Create) y enlazarlo al Worker con el nombre de variable AVISOS
       (Worker > Settings > Bindings > Add > KV namespace). Gratis: el plan gratis alcanza de sobra para la demo.
     Secretos (Settings > Variables and Secrets, tipo Secret):
       VAPID_D    la llave privada (d, en base64url). Sale de generar-llaves.html. No se comparte con nadie.
       VAPID_PUB  la llave pública sin comprimir (65 bytes, base64url). Es la misma que va en config.js.
     Opcionales (tipo Text):
       VAPID_SUB  contacto para el servicio de notificaciones. Por defecto 'mailto:demo@example.com'.
       PROYECTO   ID del proyecto de Firebase. Por defecto 'fir-app-control-d8494'. */

const PROYECTO_POR_DEFECTO = 'fir-app-control-d8494';
const SUJETO_POR_DEFECTO = 'mailto:demo@example.com';
// Páginas que pueden pedir avisos: la demo publicada y las pruebas locales (cualquier puerto).
const ORIGENES_FIJOS = ['https://jrivadeneiramejia1-source.github.io'];
const ORIGEN_LOCAL = /^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}$/;
// Servicios de notificaciones conocidos (Chrome/Android, Firefox, Safari/iPhone, Edge). Evita que el Worker sirva para llamar a cualquier sitio.
const SERVICIOS_PUSH = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)\//;
const LLAVES_GOOGLE = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const ROLES = ['gerente', 'jefe', 'equipos', 'soporte', 'compras', 'asistente', 'carros', 'conductor', 'logistica', 'profesional', 'administrativo', 'colaborador', 'financiero', 'consulta'];
// Igual que las reglas de Firebase: «rol.nombre.apellido@example.com» es una persona de prueba y el rol es lo primero.
const PRUEBA = /^(gerente|jefe|equipos|soporte|compras|asistente|carros|conductor|logistica|profesional|administrativo|colaborador|financiero|consulta)[.][a-z.]+@example[.]com$/;
const EXTRAS = ['compra', 'actas', 'encargada'];
const MAX_DESTINOS = 25, MAX_TELEFONOS = 5, DIAS_VIGENTE = 60, MAX_CUERPO = 16 * 1024, MAX_TITULO = 80, MAX_TEXTO = 300, MAX_URL = 300, MAX_ETIQUETA = 80;
const MAX_POR_MINUTO = 20, MAX_POR_DIA = 300;

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), c => c.charCodeAt(0));
const unir = (...partes) => { const t = new Uint8Array(partes.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of partes) { t.set(p, i); i += p.length; } return t; };
const texto64 = s => new TextDecoder().decode(deB64u(s));

async function hkdf(salt, ikm, info, largo) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, largo * 8));
}

// Cifrado aes128gcm para Web Push (RFC 8291).
async function cifrar(texto, p256dh, auth) {
  const uaPub = deB64u(p256dh), secreto = deB64u(auth);
  if (uaPub.length !== 65 || secreto.length !== 16) throw new Error('suscripción inválida');
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(secreto, compartido, unir(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const llave = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const claro = unir(enc.encode(texto), new Uint8Array([2]));   // 2 = último registro, sin relleno
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, llave, claro));
  const rs = new Uint8Array([0, 0, 16, 0]);   // tamaño de registro: 4096
  return unir(sal, rs, new Uint8Array([65]), asPub, cifrado);
}

// Firma VAPID (JWT ES256) para el servicio de notificaciones. pub: 65 bytes (04 + x + y).
async function vapid(endpoint, d, pub, sujeto) {
  const x = b64u(pub.slice(1, 33)), y = b64u(pub.slice(33, 65));
  const llave = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x, y, d, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const cab = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const cuerpo = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sujeto })));
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, llave, enc.encode(cab + '.' + cuerpo));
  return `vapid t=${cab}.${cuerpo}.${b64u(firma)}, k=${b64u(pub)}`;
}

const origenPermitido = o => ORIGENES_FIJOS.includes(o) || ORIGEN_LOCAL.test(o);
function cors(origen) {
  return { 'Access-Control-Allow-Origin': origen, 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}
const json = (datos, estado, h) => new Response(JSON.stringify(datos), { status: estado, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, h) });

// Quita caracteres de control y recorta por letras (no corta a la mitad un emoji ni una letra con tilde).
const corto = (v, n) => Array.from(String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ')).slice(0, n).join('');
// La url del aviso solo puede ser relativa o de un origen permitido. Cualquier otra cosa se cambia por './'.
function urlSegura(v) {
  const u = String(v == null ? '' : v).trim();
  if (!u) return './';
  if (u.length > MAX_URL || /[\u0000-\u001f\\]/.test(u) || u.startsWith('//')) return './';
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) {   // tiene esquema: solo vale si es de un origen permitido
    try { const o = new URL(u); return (o.protocol === 'https:' || o.protocol === 'http:') && origenPermitido(o.origin) ? u : './'; } catch (e) { return './'; }
  }
  return u;
}

/* ---------- token de Firebase y rol de quien pide ---------- */
let cacheLlaves = { hasta: 0, llaves: null };
async function llavesGoogle() {
  if (cacheLlaves.llaves && Date.now() < cacheLlaves.hasta) return cacheLlaves.llaves;
  const r = await fetch(LLAVES_GOOGLE);
  if (!r.ok) throw new Error('llaves');
  const j = await r.json();
  const edad = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  cacheLlaves = { llaves: Array.isArray(j.keys) ? j.keys : [], hasta: Date.now() + Math.min(6 * 3600, edad ? Number(edad[1]) : 3600) * 1000 };
  return cacheLlaves.llaves;
}
/** Devuelve los datos del token si es de una sesión válida de este proyecto; si no, null. */
async function revisarToken(token, proyecto) {
  try {
    const partes = String(token || '').split('.');
    if (partes.length !== 3) return null;
    const cab = JSON.parse(texto64(partes[0])), cuerpo = JSON.parse(texto64(partes[1]));
    if (cab.alg !== 'RS256' || !cab.kid) return null;
    const ahora = Math.floor(Date.now() / 1000);
    if (cuerpo.aud !== proyecto || cuerpo.iss !== 'https://securetoken.google.com/' + proyecto) return null;
    if (!(cuerpo.exp > ahora) || !(cuerpo.iat <= ahora + 300) || typeof cuerpo.sub !== 'string' || !cuerpo.sub) return null;
    const jwk = (await llavesGoogle()).find(k => k.kid === cab.kid);
    if (!jwk) return null;
    const llave = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', llave, deB64u(partes[2]), enc.encode(partes[0] + '.' + partes[1]));
    return ok ? cuerpo : null;
  } catch (e) { return null; }
}
/** Quién es y qué rol tiene, sacado de la base (leída con el token de la propia persona): { uid, rol, extras } o null. */
async function identidad(token, datos, proyecto) {
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(proyecto)}/databases/(default)/documents/`;
  const leer = ruta => fetch(base + ruta, { headers: { Authorization: 'Bearer ' + token } });
  try {
    const correo = typeof datos.email === 'string' ? datos.email : '';
    if (PRUEBA.test(correo)) {   // persona de prueba: el rol sale de su correo, mientras la Jefe no las haya apagado
      const r = await leer('ajustesApp/seguridad');
      if (r.status !== 404) {
        if (!r.ok) return null;
        const f = ((await r.json()) || {}).fields || {};
        if (f.personasPrueba && f.personasPrueba.booleanValue === false) return null;
      }
      return { uid: datos.sub, rol: correo.split('.')[0], extras: [] };
    }
    if (datos.email_verified !== true) return null;   // cuenta propia: correo confirmado y perfil activo
    const r = await leer('usuarios/' + encodeURIComponent(datos.sub));
    if (!r.ok) return null;
    const f = ((await r.json()) || {}).fields || {};
    if (!(f.rol && ROLES.includes(f.rol.stringValue) && f.activo && f.activo.booleanValue === true)) return null;
    const valores = (f.extras && f.extras.arrayValue && f.extras.arrayValue.values) || [];
    return { uid: datos.sub, rol: f.rol.stringValue, extras: valores.map(v => v.stringValue).filter(x => typeof x === 'string').slice(0, 5) };
  } catch (e) { return null; }
}
/** Límite de avisos por cuenta (en memoria de este Worker; Cloudflare puede tener varias copias, así que es aproximado). */
const usos = new Map();
function pasaLimite(uid) {
  const t = Date.now(), lista = (usos.get(uid) || []).filter(x => t - x < 86400000);
  if (lista.filter(x => t - x < 60000).length >= MAX_POR_MINUTO || lista.length >= MAX_POR_DIA) { usos.set(uid, lista); return false; }
  lista.push(t); usos.set(uid, lista);
  if (usos.size > 500) usos.delete(usos.keys().next().value);
  return true;
}

/* ---------- teléfonos guardados (KV): clave «u:<uid>:<id del teléfono>», metadatos { uid, rol, extras } ---------- */
async function idTelefono(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(endpoint));
  return Array.from(new Uint8Array(h)).map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
async function claves(env, prefijo) {
  const out = []; let cursor;
  for (let i = 0; i < 5; i++) {
    const r = await env.AVISOS.list({ prefix: prefijo, cursor });
    out.push(...r.keys);
    if (r.list_complete) break;
    cursor = r.cursor;
  }
  return out;
}
function subValida(s) {
  try {
    return !!s && typeof s.endpoint === 'string' && SERVICIOS_PUSH.test(s.endpoint) && s.endpoint.length < 600 && !!s.keys
      && deB64u(s.keys.p256dh).length === 65 && deB64u(s.keys.auth).length === 16;
  } catch (e) { return false; }
}
async function suscribir(env, quien, p) {
  if (!subValida(p && p.sub)) return { estado: 400, cuerpo: { error: 'suscripción inválida' } };
  const { endpoint, keys } = p.sub, id = await idTelefono(endpoint), clave = `u:${quien.uid}:${id}`;
  const propias = await claves(env, `u:${quien.uid}:`);
  if (propias.length >= MAX_TELEFONOS && !propias.some(k => k.name === clave)) return { estado: 429, cuerpo: { error: `Ya hay ${MAX_TELEFONOS} teléfonos con avisos en esta cuenta. Apaga alguno.` } };
  // Un teléfono es de una sola persona: si estaba guardado con otra cuenta, se quita (así no le llegan los avisos de la anterior).
  for (const k of await claves(env, 'u:')) if (k.name.endsWith(':' + id) && k.name !== clave) await env.AVISOS.delete(k.name);
  await env.AVISOS.put(clave, JSON.stringify({ sub: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, navegador: corto(p.navegador, 60), en: new Date().toISOString() }),
    { expirationTtl: DIAS_VIGENTE * 86400, metadata: { uid: quien.uid, rol: quien.rol, extras: quien.extras } });
  return { estado: 200, cuerpo: { ok: true } };
}
async function quitar(env, quien, p) {
  const endpoint = p && typeof p.endpoint === 'string' ? p.endpoint : '';
  if (!endpoint) return { estado: 400, cuerpo: { error: 'falta el teléfono' } };
  await env.AVISOS.delete(`u:${quien.uid}:${await idTelefono(endpoint)}`);
  return { estado: 200, cuerpo: { ok: true } };
}
async function avisar(env, quien, p, pub, sujeto) {
  const para = p && typeof p.para === 'string' ? p.para : '';
  if (para !== 'yo' && !ROLES.includes(para)) return { estado: 400, cuerpo: { error: 'no hay a quién avisar' } };
  const aviso = { titulo: corto(p.titulo, MAX_TITULO) || 'Control (demo)', texto: corto(p.texto, MAX_TEXTO), url: urlSegura(p.url), etiqueta: corto(p.etiqueta, MAX_ETIQUETA) };
  // exige: solo a quien tenga ese permiso extra (por ejemplo, las actas de Equipos solo le avisan a Soporte con el permiso «actas»).
  const exige = typeof p.exige === 'string' && EXTRAS.includes(p.exige) ? p.exige : '';
  const tiene = (m, x) => Array.isArray(m.extras) && m.extras.includes(x);
  const destino = (await claves(env, 'u:')).filter(k => { const m = k.metadata || {};
    return para === 'yo' ? m.uid === quien.uid : (m.rol === para || (para === 'compras' && m.rol === 'asistente' && tiene(m, 'compra'))) && (!exige || tiene(m, exige)); }).slice(0, MAX_DESTINOS);
  const texto = JSON.stringify(aviso);
  const resultados = await Promise.all(destino.map(async k => {
    try {
      const guardado = JSON.parse(await env.AVISOS.get(k.name));
      if (!subValida(guardado.sub)) throw new Error('suscripción inválida');
      const endpoint = guardado.sub.endpoint;
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: await vapid(endpoint, env.VAPID_D, pub, sujeto), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high' },
        body: await cifrar(texto, guardado.sub.keys.p256dh, guardado.sub.keys.auth)
      });
      return { clave: k.name, estado: r.status };
    } catch (e) { return { clave: k.name, estado: 0 }; }
  }));
  const bien = r => r.estado >= 200 && r.estado < 300, vencido = r => r.estado === 404 || r.estado === 410;
  for (const r of resultados.filter(vencido)) await env.AVISOS.delete(r.clave);
  return { estado: 200, cuerpo: { enviados: resultados.filter(bien).length, vencidos: resultados.filter(vencido).length, fallidos: resultados.filter(r => !bien(r) && !vencido(r)).length, destinatarios: destino.length } };
}

export default {
  async fetch(req, env) {
    const origen = req.headers.get('Origin') || '';
    const permitido = origenPermitido(origen);
    const h = permitido ? cors(origen) : {};
    if (req.method === 'OPTIONS') return new Response(null, { status: permitido ? 204 : 403, headers: h });
    if (req.method === 'GET') return json({ ok: true, servicio: 'avisos-demo', listo: !!(env.VAPID_D && env.VAPID_PUB && env.AVISOS) }, 200, h);
    if (req.method !== 'POST' && req.method !== 'DELETE') return json({ error: 'método no permitido' }, 405, h);
    if (!permitido) return json({ error: 'origen no permitido' }, 403, h);
    const ruta = new URL(req.url).pathname.replace(/\/+$/, '');
    if (!['/suscribir', '/avisar'].includes(ruta) || (ruta === '/avisar' && req.method !== 'POST') || (ruta === '/suscribir' && req.method === 'GET')) return json({ error: 'ruta no encontrada' }, 404, h);
    if (!env.VAPID_D || !env.VAPID_PUB) return json({ error: 'faltan los secretos VAPID_D y VAPID_PUB en el Worker' }, 500, h);
    if (!env.AVISOS) return json({ error: 'falta enlazar el KV namespace con el nombre AVISOS en el Worker' }, 500, h);
    let pub;
    try { pub = deB64u(env.VAPID_PUB); } catch (e) { pub = new Uint8Array(0); }
    if (pub.length !== 65 || pub[0] !== 4) return json({ error: 'VAPID_PUB no es una llave pública válida (65 bytes, base64url)' }, 500, h);
    // Quién pide: sin sesión válida de la app no se hace nada.
    const proyecto = env.PROYECTO || PROYECTO_POR_DEFECTO;
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') || '');
    const datos = m ? await revisarToken(m[1], proyecto) : null;
    if (!datos) return json({ error: 'Entra a la app otra vez' }, 401, h);
    const quien = await identidad(m[1], datos, proyecto);
    if (!quien) return json({ error: 'Tu cuenta no tiene permiso para los avisos' }, 403, h);
    const largo = Number(req.headers.get('Content-Length'));
    if (largo > MAX_CUERPO) return json({ error: 'cuerpo demasiado grande' }, 413, h);
    const bruto = await req.text();
    if (enc.encode(bruto).length > MAX_CUERPO) return json({ error: 'cuerpo demasiado grande' }, 413, h);
    let p;
    try { p = JSON.parse(bruto); } catch (e) { return json({ error: 'JSON inválido' }, 400, h); }
    if (!p || typeof p !== 'object') return json({ error: 'JSON inválido' }, 400, h);
    if (ruta === '/avisar' && !pasaLimite(quien.uid)) return json({ error: 'Muchos avisos seguidos: espera un minuto' }, 429, h);
    const sujeto = env.VAPID_SUB || SUJETO_POR_DEFECTO;
    const res = ruta === '/avisar' ? await avisar(env, quien, p, pub, sujeto) : req.method === 'DELETE' ? await quitar(env, quien, p) : await suscribir(env, quien, p);
    return json(res.cuerpo, res.estado, h);
  }
};
