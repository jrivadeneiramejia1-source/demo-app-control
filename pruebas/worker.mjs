// Prueba del Worker avisos-demo, sin red: token de Firebase firmado aquí con una llave de prueba, Firestore, KV y servicio de
// notificaciones falsos. Descifra lo que enviaría (como lo haría el teléfono) y verifica la firma VAPID.
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


// Token de Firebase firmado con una llave de prueba (el Worker baja las públicas de Google: aquí son estas).
const PROY = 'fir-app-control-d8494';
const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }), otraRsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwkRsa = Object.assign(rsa.publicKey.export({ format: 'jwk' }), { kid: 'k1', alg: 'RS256', use: 'sig' });
const b64u = x => Buffer.from(x).toString('base64url');
function token(cambios = {}, llave = rsa.privateKey, kid = 'k1') {
  const ahora = Math.floor(Date.now() / 1000);
  const cab = b64u(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const cuerpo = b64u(JSON.stringify(Object.assign({ aud: PROY, iss: 'https://securetoken.google.com/' + PROY, iat: ahora - 10, exp: ahora + 3600, email_verified: false }, cambios)));
  return `${cab}.${cuerpo}.${crypto.sign('sha256', Buffer.from(cab + '.' + cuerpo), llave).toString('base64url')}`;
}
// Personas: de prueba (el rol sale del correo) y cuentas propias (el rol sale de su perfil en Firestore).
const PERFILES = {
  'uid-bodega': { rol: 'asistente', activo: true, extras: ['compra'] }, 'uid-bodega2': { rol: 'asistente', activo: true, extras: [] }, 'uid-pausada': { rol: 'jefe', activo: false, extras: [] },
  'uid-gerenta': { rol: 'gerente', activo: true, extras: [] }, 'uid-rara': { rol: 'dios', activo: true, extras: [] }
};
const quien = {
  jefe: () => token({ sub: 'uid-jefe', email: 'jefe.carolina.castillo@example.com' }),
  compras: () => token({ sub: 'uid-compras', email: 'compras.mauricio.giraldo@example.com' }),
  conductor: () => token({ sub: 'uid-conductor', email: 'conductor.oscar.farfan@example.com' }),
  bodega: () => token({ sub: 'uid-bodega', email: 'bodega@correo-inventado.test', email_verified: true }),
  bodega2: () => token({ sub: 'uid-bodega2', email: 'bodega2@correo-inventado.test', email_verified: true })
};
let nFresco = 0;
/** Una persona de prueba distinta cada vez (así no se gasta el límite de avisos por cuenta). */
const fresco = () => token({ sub: 'uid-fresco-' + (++nFresco), email: 'colaborador.f.f@example.com' });
let personasPrueba = null;   // null: sin documento (404); true/false: lo que dice el interruptor de la Jefe

// KV falso: guarda valores y metadatos; list devuelve las claves con su metadato, de 20 en 20 para probar la paginación.
class KV {
  constructor() { this.m = new Map(); }
  async put(k, v, o = {}) { this.m.set(k, { v, metadata: o.metadata, ttl: o.expirationTtl }); }
  async get(k) { return this.m.has(k) ? this.m.get(k).v : null; }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '', cursor } = {}) {
    const todas = [...this.m.keys()].filter(k => k.startsWith(prefix)).sort(), desde = cursor ? Number(cursor) : 0, tanda = todas.slice(desde, desde + 20);
    return { keys: tanda.map(name => ({ name, metadata: this.m.get(name).metadata })), list_complete: desde + 20 >= todas.length, cursor: String(desde + 20) };
  }
}
const kv = new KV();
const env = { VAPID_D: jwk.d, VAPID_PUB: PUB.toString('base64url'), AVISOS: kv };

// fetch falso: llaves de Google, Firestore (perfil e interruptor) y servicio de notificaciones (la respuesta depende del endpoint).
let llamadas = [];
globalThis.fetch = async (url, o = {}) => {
  url = String(url);
  if (url.includes('securetoken@system.gserviceaccount.com')) return new Response(JSON.stringify({ keys: [jwkRsa] }), { status: 200, headers: { 'cache-control': 'public, max-age=3600' } });
  if (url.startsWith('https://firestore.googleapis.com/')) {
    if (!/^Bearer /.test((o.headers || {}).Authorization || '')) return new Response('{}', { status: 401 });
    if (url.endsWith('/ajustesApp/seguridad')) return personasPrueba === null ? new Response('{}', { status: 404 }) : new Response(JSON.stringify({ fields: { personasPrueba: { booleanValue: personasPrueba } } }), { status: 200 });
    const f = PERFILES[decodeURIComponent(url.split('/usuarios/')[1] || '')];
    if (!f) return new Response('{}', { status: 403 });
    return new Response(JSON.stringify({ fields: { rol: { stringValue: f.rol }, activo: { booleanValue: f.activo }, extras: { arrayValue: { values: f.extras.map(x => ({ stringValue: x })) } } } }), { status: 200 });
  }
  llamadas.push({ url, o });
  const estado = /vencida410/.test(url) ? 410 : /vencida404/.test(url) ? 404 : /error500/.test(url) ? 500 : 201;
  return new Response('', { status: estado });
};
const GH = 'https://jrivadeneiramejia1-source.github.io';
const pedir = async (ruta, cuerpo, { origen = GH, metodo = 'POST', env: e = env, crudo, tok } = {}) => {
  const h = { 'Content-Type': 'application/json' };
  if (origen) h.Origin = origen;
  if (tok) h.Authorization = 'Bearer ' + tok;
  const r = await W.fetch(new Request('https://avisos-demo.x.workers.dev' + ruta, { method: metodo, headers: h, body: metodo === 'POST' || metodo === 'DELETE' ? (crudo != null ? crudo : JSON.stringify(cuerpo)) : undefined }), e);
  let j = null; try { j = await r.clone().json(); } catch (er) { /* sin cuerpo */ }
  return { r, j };
};
const guardar = (tel, tok) => pedir('/suscribir', { sub: tel.sub, navegador: 'Chrome en Android' }, { tok });
const avisar = (para, tok, extra = {}) => pedir('/avisar', Object.assign({ para, titulo: 'Compra autorizada', texto: 'Luis autorizó «Botas ñandú» áéíóú 😀', url: './#inventario', etiqueta: 'compra-1' }, extra), { tok: tok || fresco() });
const clavesDe = pref => [...kv.m.keys()].filter(k => k.startsWith(pref));

console.log('1. Suscribir un teléfono');
const telJefe = crear('https://fcm.googleapis.com/fcm/send/abc123');
let { r, j } = await guardar(telJefe, quien.jefe());
t('la persona de prueba (Jefe) guarda su teléfono: 200 y queda en KV con su rol sacado del correo', r.status === 200 && clavesDe('u:uid-jefe:').length === 1 && kv.m.get(clavesDe('u:uid-jefe:')[0]).metadata.rol === 'jefe', JSON.stringify(j));
const valor = JSON.parse(kv.m.get(clavesDe('u:uid-jefe:')[0]).v);
t('guarda solo endpoint y llaves, el navegador y la fecha, y vence a los 60 días', valor.sub.endpoint === telJefe.sub.endpoint && Object.keys(valor.sub).join() === 'endpoint,keys' && valor.navegador === 'Chrome en Android' && !isNaN(Date.parse(valor.en)) && kv.m.get(clavesDe('u:uid-jefe:')[0]).ttl === 60 * 86400);
t('CORS: responde solo al origen que preguntó y permite Authorization', r.headers.get('Access-Control-Allow-Origin') === GH && r.headers.get('Access-Control-Allow-Headers').includes('Authorization'));
({ r } = await pedir('/suscribir', { sub: telJefe.sub, rol: 'gerente', extras: ['compra'] }, { tok: quien.compras() }));
t('el rol que diga la app no vale: Compras se queda con el suyo (compras), no con «gerente»', r.status === 200 && kv.m.get(clavesDe('u:uid-compras:')[0]).metadata.rol === 'compras');
t('un teléfono es de una sola persona: al guardarlo Compras, se le quita a la Jefe', clavesDe('u:uid-jefe:').length === 0 && clavesDe('u:uid-compras:').length === 1);
await guardar(telJefe, quien.jefe());
const telCompras = crear('https://fcm.googleapis.com/fcm/send/compras1');
await guardar(telCompras, quien.compras());
const telBodega = crear('https://updates.push.services.mozilla.com/wpush/v2/bodega1');
({ r } = await guardar(telBodega, quien.bodega()));
t('una cuenta propia (Bodega con permiso extra «compra») guarda su teléfono con el rol y los extras de SU perfil', r.status === 200 && JSON.stringify(kv.m.get(clavesDe('u:uid-bodega:')[0]).metadata) === JSON.stringify({ uid: 'uid-bodega', rol: 'asistente', extras: ['compra'] }));

console.log('2. Quién puede pedir (token y cuenta)');
llamadas = [];
for (const [nombre, tok] of [['sin token', null], ['token mal firmado (otra llave)', token({ sub: 'x', email: 'jefe.a.b@example.com' }, otraRsa.privateKey)], ['token vencido', token({ sub: 'x', email: 'jefe.a.b@example.com', exp: Math.floor(Date.now() / 1000) - 5 })],
  ['token de otro proyecto', token({ sub: 'x', email: 'jefe.a.b@example.com', aud: 'otro', iss: 'https://securetoken.google.com/otro' })], ['llave que Google no tiene', token({ sub: 'x', email: 'jefe.a.b@example.com' }, rsa.privateKey, 'k-desconocida')], ['texto cualquiera', 'esto.no.es-un-token']]) {
  for (const ruta of ['/suscribir', '/avisar']) {
    ({ r } = await pedir(ruta, { para: 'jefe', sub: telJefe.sub }, { tok }));
    t(`${ruta}: ${nombre} → 401 y no hace nada`, r.status === 401 && llamadas.length === 0);
  }
}
({ r } = await pedir('/suscribir', { sub: telJefe.sub }, { tok: token({ sub: 'uid-bodega', email: 'bodega@correo-inventado.test', email_verified: false }) }));
t('cuenta propia con el correo sin confirmar → 403', r.status === 403);
({ r } = await pedir('/avisar', { para: 'jefe' }, { tok: token({ sub: 'uid-pausada', email: 'pausada@correo-inventado.test', email_verified: true }) }));
t('cuenta propia con el acceso pausado → 403', r.status === 403);
({ r } = await pedir('/avisar', { para: 'jefe' }, { tok: token({ sub: 'uid-rara', email: 'rara@correo-inventado.test', email_verified: true }) }));
t('cuenta con un rol que no existe → 403', r.status === 403);
({ r } = await pedir('/avisar', { para: 'jefe' }, { tok: token({ sub: 'uid-sin-perfil', email: 'sinperfil@correo-inventado.test', email_verified: true }) }));
t('cuenta sin perfil en la base → 403', r.status === 403);
({ r } = await pedir('/avisar', { para: 'jefe' }, { tok: token({ sub: 'uid-falsa', email: 'jefe.falso@otro-dominio.com', email_verified: true }) }));
t('un correo que parece de prueba pero no es @example.com se trata como cuenta propia (sin perfil → 403)', r.status === 403);
personasPrueba = false;
({ r } = await avisar('jefe'));
t('si la Jefe apagó las personas de prueba, ellas ya no mandan avisos → 403', r.status === 403);
({ r } = await guardar(crear('https://fcm.googleapis.com/fcm/send/otro'), quien.compras()));
t('ni guardan teléfonos → 403', r.status === 403);
personasPrueba = true;
({ r } = await avisar('jefe'));
t('con el interruptor encendido sí (200)', r.status === 200);
personasPrueba = null;

console.log('3. Avisar: cifrado, firma y a quién llega');
llamadas = [];
({ r, j } = await avisar('jefe'));
t('responde 200 con enviados:1, vencidos y fallidos en 0', r.status === 200 && j.enviados === 1 && j.vencidos === 0 && j.fallidos === 0 && j.destinatarios === 1, JSON.stringify(j));
t('llamó una sola vez al servicio de notificaciones del teléfono de la Jefe', llamadas.length === 1 && llamadas[0].url === telJefe.sub.endpoint);
const h = llamadas[0].o.headers;
t('encabezados: Content-Encoding aes128gcm, TTL y tipo binario', h['Content-Encoding'] === 'aes128gcm' && Number(h.TTL) > 0 && h['Content-Type'] === 'application/octet-stream', JSON.stringify(h).slice(0, 200));
let dec; try { dec = descifrar(Buffer.from(llamadas[0].o.body), telJefe); } catch (e) { dec = { texto: 'ERROR ' + e.message }; }
t('el cuerpo cifrado se descifra con la llave privada del teléfono', dec.texto && dec.texto.startsWith('{'), dec.texto);
const msg = JSON.parse(dec.texto || '{}');
t('el JSON descifrado trae titulo, texto, url y etiqueta enviados (con tildes y emoji)', msg.titulo === 'Compra autorizada' && msg.texto === 'Luis autorizó «Botas ñandú» áéíóú 😀' && msg.url === './#inventario' && msg.etiqueta === 'compra-1', dec.texto);
t('el registro es de 4096 y termina con el delimitador 2', dec.rs === 4096 && dec.delimitador === 2);
const m = h.Authorization.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/);
t('Authorization tiene la forma "vapid t=<jwt>, k=<llave>"', !!m, h.Authorization);
if (m) {
  const [, cab, cue, fir, k] = m, claims = JSON.parse(Buffer.from(cue, 'base64url')), ahora = Date.now() / 1000;
  t('la firma ES256 del JWT es válida con la llave pública y la cabecera es ES256', crypto.verify('sha256', Buffer.from(cab + '.' + cue), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(fir, 'base64url')) && JSON.parse(Buffer.from(cab, 'base64url')).alg === 'ES256');
  t('aud = origen del endpoint, exp en menos de 24 h y a futuro, sub por defecto', claims.aud === 'https://fcm.googleapis.com' && claims.exp > ahora && claims.exp - ahora < 86400 && claims.sub === 'mailto:demo@example.com', JSON.stringify(claims));
  t('k es la llave pública sin comprimir (65 bytes)', k === env.VAPID_PUB && Buffer.from(k, 'base64url').length === 65);
}
llamadas = [];
await avisar('jefe', undefined, {}).then(() => {});
await pedir('/avisar', { para: 'jefe', titulo: 'x' }, { tok: fresco(), env: Object.assign({ VAPID_SUB: 'mailto:otro@example.org' }, env) });
t('VAPID_SUB cambia el sub del JWT', JSON.parse(Buffer.from(llamadas[llamadas.length - 1].o.headers.Authorization.match(/t=[\w-]+\.([\w-]+)\./)[1], 'base64url')).sub === 'mailto:otro@example.org');
llamadas = [];
({ j } = await avisar('conductor'));
t('un aviso para un rol sin teléfonos no llama a nadie (destinatarios 0)', j.destinatarios === 0 && j.enviados === 0 && llamadas.length === 0);
llamadas = [];
({ j } = await avisar('compras'));
t('«compras» le llega a Compras Y a Bodega con el permiso extra «compra»', j.destinatarios === 2 && llamadas.some(l => l.url === telBodega.sub.endpoint) && llamadas.some(l => l.url === telCompras.sub.endpoint));
const telBod2 = crear('https://fcm.googleapis.com/fcm/send/bod2');
await guardar(telBod2, quien.bodega2());
llamadas = [];
({ j } = await avisar('compras'));
t('Bodega sin el permiso extra no recibe lo de Compras (y la Jefe tampoco)', j.destinatarios === 2 && !llamadas.some(l => l.url === telBod2.sub.endpoint) && !llamadas.some(l => l.url === telJefe.sub.endpoint));
llamadas = [];
({ j } = await avisar('asistente'));
t('«asistente» le llega a las dos Bodegas', j.destinatarios === 2 && llamadas.some(l => l.url === telBod2.sub.endpoint) && llamadas.some(l => l.url === telBodega.sub.endpoint));
llamadas = [];
({ j } = await avisar('compras', undefined, { exige: 'compra' }));
t('«exige» manda solo a quien tiene ese permiso extra (Bodega con «compra» sí; Compras sin extras no)', j.destinatarios === 1 && llamadas[0].url === telBodega.sub.endpoint, JSON.stringify(j));
({ j } = await avisar('compras', undefined, { exige: 'permiso-inventado' }));
t('un «exige» inventado se ignora', j.destinatarios === 2);
llamadas = [];
({ j } = await avisar('yo', quien.bodega2()));
t('«yo» solo le llega a los teléfonos de quien lo pide', j.destinatarios === 1 && llamadas[0].url === telBod2.sub.endpoint);

console.log('4. Vencidos, fallidos y límites');
const t404 = crear('https://fcm.googleapis.com/fcm/send/vencida404'), t410 = crear('https://updates.push.services.mozilla.com/wpush/v2/vencida410'), t500 = crear('https://fcm.googleapis.com/fcm/send/error500');
for (const [tel, tok] of [[t404, token({ sub: 'uid-prueba-a', email: 'conductor.a.a@example.com' })], [t410, token({ sub: 'uid-prueba-b', email: 'conductor.b.b@example.com' })], [t500, token({ sub: 'uid-prueba-c', email: 'conductor.c.c@example.com' })]]) await guardar(tel, tok);
llamadas = [];
({ j } = await avisar('conductor'));
t('404 y 410 salen en vencidos y se borran de KV; un 500 sale en fallidos y se queda', j.destinatarios === 3 && j.vencidos === 2 && j.fallidos === 1 && j.enviados === 0 && clavesDe('u:uid-prueba-a:').length === 0 && clavesDe('u:uid-prueba-b:').length === 0 && clavesDe('u:uid-prueba-c:').length === 1, JSON.stringify(j));
({ r } = await guardar(crear('https://sitio-cualquiera.com/x'), quien.jefe()));
t('un teléfono que no es de un servicio de notificaciones no se guarda (400)', r.status === 400);
({ r } = await guardar(crear('http://fcm.googleapis.com/fcm/send/a'), quien.jefe()));
t('ni uno sin https (400)', r.status === 400);
({ r } = await pedir('/suscribir', { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/ok', keys: { p256dh: 'corto', auth: 'x' } } }, { tok: quien.jefe() }));
t('ni con llaves malas (400)', r.status === 400);
for (let i = 0; i < 5; i++) await guardar(crear('https://fcm.googleapis.com/fcm/send/lleno' + i), token({ sub: 'uid-gerenta', email: 'gerenta@correo-inventado.test', email_verified: true }));
t('hasta 5 teléfonos por cuenta; el sexto se rechaza (429)', clavesDe('u:uid-gerenta:').length === 5 && (await guardar(crear('https://fcm.googleapis.com/fcm/send/sexto'), token({ sub: 'uid-gerenta', email: 'gerenta@correo-inventado.test', email_verified: true }))).r.status === 429);
t('pero sí puede volver a guardar uno que ya tenía (se renueva, no cuenta como uno más)', (await guardar(crear('https://fcm.googleapis.com/fcm/send/lleno0'), token({ sub: 'uid-gerenta', email: 'gerenta@correo-inventado.test', email_verified: true }))).r.status === 200 && clavesDe('u:uid-gerenta:').length === 5);
llamadas = [];
for (let i = 0; i < 30; i++) await guardar(crear('https://fcm.googleapis.com/fcm/send/n' + i), token({ sub: 'uid-prueba-m' + i, email: 'profesional.m.m@example.com' }));
({ j } = await avisar('profesional'));
t('más de 25 teléfonos del rol: solo envía a 25', j.destinatarios === 25 && llamadas.length === 25, JSON.stringify(j));
llamadas = [];
await avisar('jefe', undefined, { titulo: 'T'.repeat(200), texto: 'x'.repeat(1000) + '😀', url: 'https://malo.com/robo', etiqueta: 'e'.repeat(500) });
let rec = JSON.parse(descifrar(Buffer.from(llamadas[0].o.body), telJefe).texto);
t('título se corta a 80 letras y texto a 300, y la url de otro sitio se cambia por ./', rec.titulo.length === 80 && rec.texto.length === 300 && rec.url === './', rec.titulo.length + ' ' + rec.texto.length + ' ' + rec.url);
for (const [entrada, esperada] of [['./#reuniones', './#reuniones'], ['/demo-app-control/', '/demo-app-control/'], ['', './'], ['//malo.com', './'], ['javascript:alert(1)', './'], ['data:text/html,x', './'], [GH + '/demo-app-control/', GH + '/demo-app-control/'], ['http://localhost:8811/x', 'http://localhost:8811/x'], ['http://localhost.malo.com/x', './'], ['\\\\malo.com', './']]) {
  llamadas = [];
  await avisar('jefe', undefined, { url: entrada });
  rec = JSON.parse(descifrar(Buffer.from(llamadas[0].o.body), telJefe).texto);
  t(`url ${JSON.stringify(entrada)} queda como ${JSON.stringify(esperada)}`, rec.url === esperada, rec.url);
}
llamadas = [];
await pedir('/avisar', { para: 'jefe' }, { tok: fresco() });
rec = JSON.parse(descifrar(Buffer.from(llamadas[0].o.body), telJefe).texto);
t('sin título usa uno por defecto, y sin texto/url/etiqueta quedan vacíos o ./', rec.titulo === 'Control (demo)' && rec.texto === '' && rec.url === './' && rec.etiqueta === '');
// Límite por cuenta: 20 por minuto.
const tokSpam = token({ sub: 'uid-spam', email: 'colaborador.s.s@example.com' });
let codigos = [];
for (let i = 0; i < 22; i++) codigos.push((await avisar('jefe', tokSpam)).r.status);
t('una cuenta no manda más de 20 avisos por minuto (el 21 recibe 429)', codigos.slice(0, 20).every(c => c === 200) && codigos[20] === 429 && codigos[21] === 429, codigos.join());
t('otra cuenta no se ve afectada', (await avisar('jefe')).r.status === 200);

console.log('5. Borrar un teléfono');
await pedir('/suscribir', { endpoint: telBodega.sub.endpoint }, { metodo: 'DELETE', tok: quien.jefe() });
t('borrar con la cuenta de otra persona no quita su teléfono', clavesDe('u:uid-bodega:').length === 1);
({ r } = await pedir('/suscribir', { endpoint: telBodega.sub.endpoint }, { metodo: 'DELETE', tok: quien.bodega() }));
t('cada quien borra el suyo', r.status === 200 && clavesDe('u:uid-bodega:').length === 0);
({ r } = await pedir('/suscribir', {}, { metodo: 'DELETE', tok: quien.bodega() }));
t('DELETE sin teléfono: 400', r.status === 400);
({ r } = await pedir('/suscribir', { endpoint: 'x' }, { metodo: 'DELETE' }));
t('DELETE sin token: 401', r.status === 401);

console.log('6. Origen, método, rutas y configuración');
llamadas = [];
for (const o of ['https://otro-sitio.com', 'https://jrivadeneiramejia1-source.github.io.evil.com', 'http://127.0.0.1.evil.com:8000', 'http://localhost', 'https://127.0.0.1:8000', '', null]) {
  ({ r } = await pedir('/avisar', { para: 'jefe' }, { origen: o, tok: fresco() }));
  t(`origen ${JSON.stringify(o)} recibe 403, sin CORS`, r.status === 403 && !r.headers.get('Access-Control-Allow-Origin'));
}
for (const o of ['http://127.0.0.1:8811', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://localhost:80']) {
  ({ r } = await pedir('/avisar', { para: 'jefe' }, { origen: o, tok: fresco() }));
  t(`origen ${o} permitido (cualquier puerto)`, r.status === 200 && r.headers.get('Access-Control-Allow-Origin') === o);
}
r = await W.fetch(new Request('https://x/avisar', { method: 'OPTIONS', headers: { Origin: GH } }), env);
t('OPTIONS desde la demo: 204, POST y DELETE permitidos, y los encabezados Content-Type y Authorization', r.status === 204 && r.headers.get('Access-Control-Allow-Methods').includes('DELETE') && r.headers.get('Access-Control-Allow-Headers').includes('Authorization') && r.headers.get('Access-Control-Allow-Origin') === GH);
r = await W.fetch(new Request('https://x/avisar', { method: 'OPTIONS', headers: { Origin: 'https://otro-sitio.com' } }), env);
t('OPTIONS desde otro origen: 403', r.status === 403);
r = await W.fetch(new Request('https://x/avisar', { method: 'PUT', headers: { Origin: GH } }), env);
t('otro método (PUT): 405', r.status === 405);
({ r } = await pedir('/otra-ruta', { para: 'jefe' }, { tok: quien.compras() }));
t('una ruta que no existe: 404', r.status === 404);
({ r } = await pedir('', { para: 'jefe' }, { tok: quien.compras() }));
t('la raíz con POST ya no sirve (404): hay que usar /avisar o /suscribir', r.status === 404);
({ r, j } = await pedir('/', null, { metodo: 'GET' }));
t('GET dice servicio avisos-demo y listo:true', r.status === 200 && j.servicio === 'avisos-demo' && j.listo === true, JSON.stringify(j));
({ j } = await pedir('/', null, { metodo: 'GET', env: { VAPID_D: jwk.d, VAPID_PUB: env.VAPID_PUB } }));
t('GET sin el KV enlazado dice listo:false', j.listo === false);
({ j } = await pedir('/', null, { metodo: 'GET', env: {} }));
t('GET sin nada dice listo:false', j.listo === false);
({ r, j } = await pedir('/avisar', { para: 'jefe' }, { tok: fresco(), env: {} }));
t('sin secretos, el POST avisa claro (500)', r.status === 500 && j.error.includes('VAPID_D'));
({ r, j } = await pedir('/avisar', { para: 'jefe' }, { tok: fresco(), env: { VAPID_D: jwk.d, VAPID_PUB: env.VAPID_PUB } }));
t('sin el KV enlazado, el POST avisa claro (500)', r.status === 500 && /AVISOS/.test(j.error));
({ r } = await pedir('/avisar', { para: 'jefe' }, { tok: fresco(), env: { VAPID_D: jwk.d, VAPID_PUB: 'abc', AVISOS: kv } }));
t('VAPID_PUB inválida: 500 claro', r.status === 500);
({ r } = await pedir('/avisar', { para: 'nadie' }, { tok: fresco() }));
t('un rol que no existe: 400', r.status === 400);
({ r } = await pedir('/avisar', {}, { tok: fresco() }));
t('sin «para»: 400', r.status === 400);
({ r } = await pedir('/avisar', null, { tok: fresco(), crudo: 'no es json' })); t('JSON inválido: 400', r.status === 400);
({ r } = await pedir('/avisar', null, { tok: fresco(), crudo: 'null' })); t('JSON null: 400', r.status === 400);
llamadas = [];
({ r } = await pedir('/avisar', { para: 'jefe', texto: 'a'.repeat(20000) }, { tok: fresco() }));
t('cuerpo de más de 16 KB: 413 y no envía', r.status === 413 && llamadas.length === 0);

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
