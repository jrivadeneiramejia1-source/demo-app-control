/* avisos-demo: Worker de Cloudflare que envía los avisos al teléfono (Web Push) de la demo.
   La app le manda a quién avisar (las suscripciones guardadas en Firestore) y el texto.
   El Worker cifra el mensaje (RFC 8291, aes128gcm) y lo firma (VAPID, RFC 8292) para el servicio de
   notificaciones del teléfono (Google, Apple, Mozilla o Microsoft). No guarda nada.

   Secretos que hay que crear en Cloudflare (Settings > Variables and Secrets, tipo Secret):
     VAPID_D    la llave privada (d, en base64url). Sale de generar-llaves.html. No se comparte con nadie.
     VAPID_PUB  la llave pública sin comprimir (65 bytes, base64url). Es la misma que va en config.js.
     VAPID_SUB  opcional: contacto para el servicio de notificaciones. Por defecto 'mailto:demo@example.com'. */

const SUJETO_POR_DEFECTO = 'mailto:demo@example.com';
// Páginas que pueden pedir avisos: la demo publicada y las pruebas locales (cualquier puerto).
const ORIGENES_FIJOS = ['https://jrivadeneiramejia1-source.github.io'];
const ORIGEN_LOCAL = /^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}$/;
// Servicios de notificaciones conocidos (Chrome/Android, Firefox, Safari/iPhone, Edge). Evita que el Worker sirva para llamar a cualquier sitio.
const SERVICIOS_PUSH = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)\//;
const MAX_SUBS = 25, MAX_CUERPO = 16 * 1024, MAX_TITULO = 80, MAX_TEXTO = 300, MAX_URL = 300, MAX_ETIQUETA = 80;

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), c => c.charCodeAt(0));
const unir = (...partes) => { const t = new Uint8Array(partes.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of partes) { t.set(p, i); i += p.length; } return t; };

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
  return { 'Access-Control-Allow-Origin': origen, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}
const json = (datos, estado, h) => new Response(JSON.stringify(datos), { status: estado, headers: Object.assign({ 'Content-Type': 'application/json' }, h) });

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

export default {
  async fetch(req, env) {
    const origen = req.headers.get('Origin') || '';
    const permitido = origenPermitido(origen);
    const h = permitido ? cors(origen) : {};
    if (req.method === 'OPTIONS') return new Response(null, { status: permitido ? 204 : 403, headers: h });
    if (req.method === 'GET') return json({ ok: true, servicio: 'avisos-demo', listo: !!(env.VAPID_D && env.VAPID_PUB) }, 200, h);
    if (req.method !== 'POST') return json({ error: 'método no permitido' }, 405, h);
    if (!permitido) return json({ error: 'origen no permitido' }, 403, h);
    if (!env.VAPID_D || !env.VAPID_PUB) return json({ error: 'faltan los secretos VAPID_D y VAPID_PUB en el Worker' }, 500, h);
    let pub;
    try { pub = deB64u(env.VAPID_PUB); } catch (e) { pub = new Uint8Array(0); }
    if (pub.length !== 65 || pub[0] !== 4) return json({ error: 'VAPID_PUB no es una llave pública válida (65 bytes, base64url)' }, 500, h);
    const largo = Number(req.headers.get('Content-Length'));
    if (largo > MAX_CUERPO) return json({ error: 'cuerpo demasiado grande' }, 413, h);
    const bruto = await req.text();
    if (enc.encode(bruto).length > MAX_CUERPO) return json({ error: 'cuerpo demasiado grande' }, 413, h);
    let datos;
    try { datos = JSON.parse(bruto); } catch (e) { return json({ error: 'JSON inválido' }, 400, h); }
    if (!datos || typeof datos !== 'object') return json({ error: 'JSON inválido' }, 400, h);
    const subs = Array.isArray(datos.subs) ? datos.subs.slice(0, MAX_SUBS) : [];
    if (!subs.length) return json({ error: 'no hay a quién avisar' }, 400, h);
    const aviso = { titulo: corto(datos.titulo, MAX_TITULO) || 'Control (demo)', texto: corto(datos.texto, MAX_TEXTO), url: urlSegura(datos.url), etiqueta: corto(datos.etiqueta, MAX_ETIQUETA) };
    const texto = JSON.stringify(aviso), sujeto = env.VAPID_SUB || SUJETO_POR_DEFECTO;
    const resultados = await Promise.all(subs.map(async s => {
      const endpoint = s && typeof s.endpoint === 'string' ? s.endpoint : '';
      try {
        if (!SERVICIOS_PUSH.test(endpoint) || !s.keys) throw new Error('suscripción inválida');
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: await vapid(endpoint, env.VAPID_D, pub, sujeto), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high' },
          body: await cifrar(texto, s.keys.p256dh, s.keys.auth)
        });
        return { endpoint, estado: r.status };
      } catch (e) { return { endpoint, estado: 0 }; }
    }));
    const enviados = resultados.filter(r => r.estado >= 200 && r.estado < 300).length;
    const vencidos = resultados.filter(r => r.estado === 404 || r.estado === 410).map(r => r.endpoint);
    const fallidos = resultados.filter(r => !(r.estado >= 200 && r.estado < 300) && r.estado !== 404 && r.estado !== 410).map(r => r.endpoint);
    return json({ enviados, vencidos, fallidos }, 200, h);
  }
};
