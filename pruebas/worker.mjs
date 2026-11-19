// Prueba del Worker avisos-demo, sin red: descifra lo que enviaría (como lo haría el teléfono) y verifica la firma VAPID.
// Uso: node pruebas/worker.mjs   -> imprime "OK ..." / "FALLA ..." y sale con 1 si algo falla.
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = (await import(pathToFileURL(path.join(RAIZ, 'avisos', 'worker.js')).href)).default;
let ok = 0, mal = 0;
const t = (nombre, cond, extra) => { cond ? ok++ : mal++; console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre + (cond || extra == null ? '' : '\n      ' + extra)); };

// Llaves VAPID de prueba (creadas aquí, no son las reales).
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = privateKey.export({ format: 'jwk' });
const PUB = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
const env = { VAPID_D: jwk.d, VAPID_PUB: PUB.toString('base64url') };

// "Teléfono": llaves de la suscripción (ECDH P-256 y secreto de autenticación de 16 bytes).
const crear = endpoint => {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, auth, sub: { endpoint, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } } };
};
// Descifrado aes128gcm (RFC 8188 + RFC 8291) escrito aparte, con node:crypto, para no depender del código del Worker.
function descifrar(cuerpo, tel) {
  const sal = cuerpo.subarray(0, 16), idlen = cuerpo[20], asPub = cuerpo.subarray(21, 21 + idlen), datos = cuerpo.subarray(21 + idlen);
  const uaPub = tel.ecdh.getPublicKey();
  const compartido = tel.ecdh.computeSecret(asPub);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', compartido, tel.auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(datos.subarray(datos.length - 16));
  const claro = Buffer.concat([d.update(datos.subarray(0, datos.length - 16)), d.final()]);
  let fin = claro.length - 1; while (fin >= 0 && claro[fin] === 0) fin--;
  return { texto: claro.subarray(0, fin).toString('utf8'), delimitador: claro[fin], rs: cuerpo.readUInt32BE(16) };
}

// fetch falso: guarda lo que el Worker mandaría al servicio de notificaciones. La respuesta depende del endpoint.
let llamadas = [];
globalThis.fetch = async (url, o) => {
  llamadas.push({ url, o });
  const estado = /vencida410/.test(url) ? 410 : /vencida404/.test(url) ? 404 : /error500/.test(url) ? 500 : 201;
  return new Response('', { status: estado });
};
const GH = 'https://jrivadeneiramejia1-source.github.io';
const pedir = (cuerpo, { origen = GH, metodo = 'POST', env: e = env, crudo } = {}) => W.fetch(new Request('https://avisos-demo.x.workers.dev/', {
  method: metodo, headers: Object.assign({ 'Content-Type': 'application/json' }, origen === null ? {} : { Origin: origen }),
  body: metodo === 'POST' ? (crudo != null ? crudo : JSON.stringify(cuerpo)) : undefined
}), e);

// 1) Envío normal: cifrado, firma y encabezados
const tel = crear('https://fcm.googleapis.com/fcm/send/abc123');
const aviso = { titulo: 'Compra autorizada', texto: 'Luis autorizó «Botas ñandú» áéíóú 😀', url: './#inventario', etiqueta: 'compra-1' };
let r = await pedir(Object.assign({ subs: [tel.sub] }, aviso));
let j = await r.json();
t('responde 200 con enviados:1, vencidos y fallidos vacíos', r.status === 200 && j.enviados === 1 && j.vencidos.length === 0 && j.fallidos.length === 0, JSON.stringify(j));
t('llamó una vez al servicio de notificaciones del endpoint', llamadas.length === 1 && llamadas[0].url === tel.sub.endpoint);
const h = llamadas[0].o.headers;
t('encabezados: Content-Encoding aes128gcm, TTL y tipo binario', h['Content-Encoding'] === 'aes128gcm' && Number(h.TTL) > 0 && h['Content-Type'] === 'application/octet-stream', JSON.stringify(h).slice(0, 200));
const cuerpo = Buffer.from(llamadas[0].o.body);
let dec; try { dec = descifrar(cuerpo, tel); } catch (e) { dec = { texto: 'ERROR ' + e.message }; }
t('el cuerpo cifrado se descifra con la llave privada de la suscripción', dec.texto && dec.texto.startsWith('{'), dec.texto);
const msg = JSON.parse(dec.texto || '{}');
t('el JSON descifrado trae titulo, texto, url y etiqueta enviados (con tildes y emoji)', msg.titulo === aviso.titulo && msg.texto === aviso.texto && msg.url === aviso.url && msg.etiqueta === aviso.etiqueta, dec.texto);
t('el registro es de 4096 y termina con el delimitador 2', dec.rs === 4096 && dec.delimitador === 2);
const a = h.Authorization;
const m = a.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/);
t('Authorization tiene la forma "vapid t=<jwt>, k=<llave>"', !!m, a);
if (m) {
  const [, cab, cue, fir, k] = m;
  const claims = JSON.parse(Buffer.from(cue, 'base64url'));
  t('la firma ES256 del JWT es válida con la llave pública', crypto.verify('sha256', Buffer.from(cab + '.' + cue), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(fir, 'base64url')));
  t('la cabecera del JWT es ES256', JSON.parse(Buffer.from(cab, 'base64url')).alg === 'ES256');
  const ahora = Date.now() / 1000;
  t('aud = origen del endpoint y exp en menos de 24 h (y a futuro)', claims.aud === 'https://fcm.googleapis.com' && claims.exp > ahora && claims.exp - ahora < 86400, JSON.stringify(claims));
  t('sub por defecto mailto:demo@example.com', claims.sub === 'mailto:demo@example.com');
  t('k es la llave pública sin comprimir (65 bytes)', k === env.VAPID_PUB && Buffer.from(k, 'base64url').length === 65);
}
t('CORS: responde solo al origen que preguntó', r.headers.get('Access-Control-Allow-Origin') === GH);

// 2) VAPID_SUB opcional
llamadas = [];
await pedir(Object.assign({ subs: [tel.sub] }, aviso), { env: Object.assign({ VAPID_SUB: 'mailto:otro@example.org' }, env) });
const sub2 = JSON.parse(Buffer.from(llamadas[0].o.headers.Authorization.match(/t=[\w-]+\.([\w-]+)\./)[1], 'base64url')).sub;
t('VAPID_SUB cambia el sub del JWT', sub2 === 'mailto:otro@example.org');

// 3) Vencidos y fallidos
llamadas = [];
const t404 = crear('https://fcm.googleapis.com/fcm/send/vencida404'), t410 = crear('https://updates.push.services.mozilla.com/wpush/v2/vencida410'), t500 = crear('https://fcm.googleapis.com/fcm/send/error500');
r = await pedir({ subs: [tel.sub, t404.sub, t410.sub, t500.sub], titulo: 'x' }); j = await r.json();
t('404 y 410 salen en vencidos', j.vencidos.length === 2 && j.vencidos.includes(t404.sub.endpoint) && j.vencidos.includes(t410.sub.endpoint), JSON.stringify(j));
t('otro error (500) sale en fallidos', j.fallidos.length === 1 && j.fallidos[0] === t500.sub.endpoint && j.enviados === 1, JSON.stringify(j));
llamadas = [];
r = await pedir({ subs: [{ endpoint: 'https://sitio-cualquiera.com/x', keys: tel.sub.keys }, { endpoint: 'http://fcm.googleapis.com/fcm/send/a', keys: tel.sub.keys }, { endpoint: 'https://fcm.googleapis.com/fcm/send/ok', keys: { p256dh: 'corto', auth: 'x' } }, null, {}] }); j = await r.json();
t('endpoints que no son de un servicio de notificaciones, sin https o con llaves malas: fallidos y no se llama a fetch con ellos', j.enviados === 0 && j.fallidos.length === 5 && llamadas.filter(l => !l.url.includes('/ok')).length === 0, JSON.stringify(j) + ' ' + llamadas.length);

// 4) Origen y método
llamadas = [];
for (const o of ['https://otro-sitio.com', 'https://jrivadeneiramejia1-source.github.io.evil.com', 'http://127.0.0.1.evil.com:8000', 'http://localhost', 'https://127.0.0.1:8000', '', null]) {
  r = await pedir({ subs: [tel.sub] }, { origen: o });
  t(`origen ${JSON.stringify(o)} recibe 403, sin CORS y sin enviar nada`, r.status === 403 && !r.headers.get('Access-Control-Allow-Origin') && llamadas.length === 0);
}
for (const o of ['http://127.0.0.1:8811', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://localhost:80']) {
  r = await pedir({ subs: [tel.sub] }, { origen: o });
  t(`origen ${o} permitido (cualquier puerto)`, r.status === 200 && r.headers.get('Access-Control-Allow-Origin') === o);
}
r = await pedir(null, { metodo: 'OPTIONS' });
t('OPTIONS desde la demo responde el preflight (204, POST permitido, Content-Type)', r.status === 204 && r.headers.get('Access-Control-Allow-Methods').includes('POST') && r.headers.get('Access-Control-Allow-Headers').includes('Content-Type') && r.headers.get('Access-Control-Allow-Origin') === GH);
r = await pedir(null, { metodo: 'OPTIONS', origen: 'https://otro-sitio.com' });
t('OPTIONS desde otro origen: 403', r.status === 403);
r = await W.fetch(new Request('https://x/', { method: 'PUT', headers: { Origin: GH } }), env);
t('otro método (PUT): 405', r.status === 405);

// 5) GET
r = await pedir(null, { metodo: 'GET' }); j = await r.json();
t('GET dice servicio avisos-demo y listo:true', r.status === 200 && j.ok === true && j.servicio === 'avisos-demo' && j.listo === true, JSON.stringify(j));
r = await pedir(null, { metodo: 'GET', env: { VAPID_D: jwk.d } }); j = await r.json();
t('GET con solo VAPID_D dice listo:false', j.listo === false);
r = await pedir(null, { metodo: 'GET', env: {} }); j = await r.json();
t('GET sin secretos dice listo:false', j.listo === false);

// 6) Límites y validaciones
llamadas = [];
r = await pedir({ subs: [tel.sub] }, { env: {} });
t('sin secretos, el POST avisa claro (500) y no envía', r.status === 500 && (await r.json()).error.includes('VAPID_D') && llamadas.length === 0);
r = await pedir({ subs: [tel.sub] }, { env: { VAPID_D: jwk.d, VAPID_PUB: 'abc' } });
t('VAPID_PUB inválida: 500 claro', r.status === 500 && llamadas.length === 0);
r = await pedir({ subs: [] }); t('sin suscripciones: 400', r.status === 400);
r = await pedir(null, { crudo: 'no es json' }); t('JSON inválido: 400', r.status === 400);
r = await pedir(null, { crudo: 'null' }); t('JSON null: 400', r.status === 400);
llamadas = [];
r = await pedir({ subs: [tel.sub], texto: 'a'.repeat(20000) });
t('cuerpo de más de 16 KB: 413 y no envía', r.status === 413 && llamadas.length === 0);
llamadas = [];
const muchas = Array.from({ length: 40 }, (_, i) => crear('https://fcm.googleapis.com/fcm/send/n' + i).sub);
r = await pedir({ subs: muchas, titulo: 'x' }); j = await r.json();
t('más de 25 suscripciones: solo envía a 25', j.enviados === 25 && llamadas.length === 25, JSON.stringify(j));
llamadas = [];
await pedir({ subs: [tel.sub], titulo: 'T'.repeat(200), texto: 'x'.repeat(1000) + '😀', url: 'https://malo.com/robo', etiqueta: 'e'.repeat(500) });
let rec = JSON.parse(descifrar(Buffer.from(llamadas[0].o.body), tel).texto);
t('título se corta a 80 letras y texto a 300', rec.titulo.length === 80 && rec.texto.length === 300, rec.titulo.length + ' ' + rec.texto.length);
t('la url de otro sitio se cambia por ./', rec.url === './');
for (const [entrada, esperada] of [['./#reuniones', './#reuniones'], ['/demo-app-control/', '/demo-app-control/'], ['', './'], ['//malo.com', './'], ['javascript:alert(1)', './'], ['data:text/html,x', './'], [GH + '/demo-app-control/', GH + '/demo-app-control/'], ['http://localhost:8811/x', 'http://localhost:8811/x'], ['http://localhost.malo.com/x', './'], ['\\\\malo.com', './']]) {
  llamadas = [];
  await pedir({ subs: [tel.sub], url: entrada });
  rec = JSON.parse(descifrar(Buffer.from(llamadas[0].o.body), tel).texto);
  t(`url ${JSON.stringify(entrada)} queda como ${JSON.stringify(esperada)}`, rec.url === esperada, rec.url);
}
llamadas = [];
await pedir({ subs: [tel.sub] });
rec = JSON.parse(descifrar(Buffer.from(llamadas[0].o.body), tel).texto);
t('sin título usa uno por defecto, y sin texto/url/etiqueta quedan vacíos o ./', rec.titulo === 'Control (demo)' && rec.texto === '' && rec.url === './' && rec.etiqueta === '');

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
