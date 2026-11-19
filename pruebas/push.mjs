// Prueba de push.js en Chrome con Playwright, con objetos simulados (Notification, serviceWorker, PushManager, nube).
// Uso: CHROME=/usr/bin/google-chrome node pruebas/push.mjs   (sin CHROME usa el Chromium de Playwright)
// Imprime "OK ..." / "FALLA ..." y sale con 1 si algo falla. No sale a internet: el Worker también es simulado.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/blanco.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>blanco</title>'); }
  const f = path.join(RAIZ, path.normalize(p));
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const WORKER = 'https://avisos-demo.prueba.workers.dev/';
const VAPID = Buffer.concat([Buffer.from([4]), crypto.randomBytes(64)]).toString('base64url');   // 65 bytes cualquiera: no se usa para firmar
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/ejemplo-123';
const idEsperado = e => crypto.createHash('sha256').update(e).digest('hex').slice(0, 32);

let ok = 0, mal = 0;
const t = (n, c, x) => { c ? ok++ : mal++; console.log((c ? 'OK   ' : 'FALLA') + ' ' + n + (c || x == null ? '' : '\n      ' + x)); };

// Se inyecta antes de que cargue la página. opciones: { permiso, iphone, sinConfig, standalone }
function simulacion(o) {
  window.__nube = { docs: {}, borrados: [], mezclas: [] };
  window.nube = {
    mezclar: async (col, id, datos) => { window.__nube.mezclas.push([col, id]); const k = col + '/' + id; window.__nube.docs[k] = Object.assign({}, window.__nube.docs[k], datos); },
    borrar: async (col, id) => { window.__nube.borrados.push(col + '/' + id); delete window.__nube.docs[col + '/' + id]; }
  };
  window.AVISOS_DEMO = o.sinConfig ? { url: '', vapid: '' } : { url: o.url, vapid: o.vapid };
  class Notificacion { static permission = o.permiso; static async requestPermission() { window.__pidioPermiso = true; Notificacion.permission = o.permisoAlPedir || o.permiso; return Notificacion.permission; } }
  Object.defineProperty(window, 'Notification', { value: Notificacion, configurable: true, writable: true });
  let suscripcion = null;
  const sub = () => ({
    endpoint: o.endpoint,
    options: { applicationServerKey: null },
    toJSON() { return { endpoint: o.endpoint, expirationTime: null, keys: { p256dh: 'BPclaveP256dhDePrueba', auth: 'authDePrueba16bytes' } }; },
    unsubscribe: async () => { suscripcion = null; window.__desuscrito = true; return true; }
  });
  const reg = { pushManager: {
    getSubscription: async () => suscripcion,
    subscribe: async op => { window.__suscribio = { userVisibleOnly: op.userVisibleOnly, llave: Array.from(new Uint8Array(op.applicationServerKey)) }; suscripcion = sub(); return suscripcion; }
  } };
  if (o.yaSuscrito) suscripcion = sub();
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
    register: async ruta => { window.__registro = ruta; return reg; },
    ready: Promise.resolve(reg),
    getRegistration: async () => reg
  } });
  if (o.iphone) { delete window.PushManager; delete window.Notification; }
  else if (!('PushManager' in window)) window.PushManager = function () {};
  if (o.standalone) Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
}

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
async function pagina(o = {}) {
  const opciones = Object.assign({ permiso: 'default', url: WORKER, vapid: VAPID, endpoint: ENDPOINT }, o);
  const ctx = await b.newContext(o.iphone ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', viewport: { width: 390, height: 800 }, hasTouch: true } : { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36' });
  const pedidos = [], errores = [];
  await ctx.route(u => u.hostname === 'avisos-demo.prueba.workers.dev', async r => {
    const req = r.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    pedidos.push(JSON.parse(req.postData() || '{}'));
    const cuerpo = typeof ctx.respuesta === 'function' ? ctx.respuesta(pedidos[pedidos.length - 1]) : { enviados: 1, vencidos: [], fallidos: [] };
    return r.fulfill({ status: ctx.estadoRespuesta || 200, headers: cors, contentType: 'application/json', body: JSON.stringify(cuerpo) });
  });
  await ctx.route(u => !/^http:\/\/127\.0\.0\.1/.test(u.href) && u.hostname !== 'avisos-demo.prueba.workers.dev', r => { errores.push('salió a internet: ' + r.request().url()); return r.abort(); });
  await ctx.addInitScript(simulacion, opciones);
  const page = await ctx.newPage();
  page.on('pageerror', e => errores.push('error: ' + e.message));
  await page.goto(BASE + '/blanco.html');
  await page.addScriptTag({ url: BASE + '/push.js' });
  return { ctx, page, pedidos, errores };
}
const doc = (page, id) => page.evaluate(i => window.__nube.docs['suscripciones/' + i], id);

try {
  console.log('1. Estado');
  {
    const { ctx, page } = await pagina();
    t('window.Push existe con sus 6 funciones', await page.evaluate(() => ['soportado', 'estado', 'activar', 'actualizarRol', 'desactivar', 'enviar'].every(f => typeof window.Push[f] === 'function')));
    t('soportado() es true con todo disponible', await page.evaluate(() => window.Push.soportado()) === true);
    t("estado() es 'inactivo' con permiso sin pedir", await page.evaluate(() => window.Push.estado()) === 'inactivo');
    await ctx.close();
  }
  {
    const { ctx, page } = await pagina({ sinConfig: true });
    t("estado() es 'sin-configurar' si falta url o vapid", await page.evaluate(() => window.Push.estado()) === 'sin-configurar');
    t("también si solo falta vapid", await page.evaluate(() => { window.AVISOS_DEMO = { url: 'https://x.y/', vapid: '' }; return window.Push.estado(); }) === 'sin-configurar');
    const r = await page.evaluate(() => window.Push.activar('jefe'));
    t('activar sin configurar devuelve ok:false con motivo en español y no pide permiso', r.ok === false && /config\.js/.test(r.motivo) && !(await page.evaluate(() => window.__pidioPermiso)), JSON.stringify(r));
    await ctx.close();
  }
  {
    const { ctx, page } = await pagina({ iphone: true });
    t("estado() es 'necesita-instalar' en iPhone sin instalar (sin PushManager)", await page.evaluate(() => window.Push.estado()) === 'necesita-instalar');
    t('soportado() es false ahí', await page.evaluate(() => window.Push.soportado()) === false);
    const r = await page.evaluate(() => window.Push.activar('jefe'));
    t('activar en iPhone sin instalar explica cómo instalar', r.ok === false && /Agregar a inicio/.test(r.motivo), JSON.stringify(r));
    await ctx.close();
  }
  {
    const { ctx, page } = await pagina({ iphone: true, standalone: true });
    t("iPhone ya instalado (standalone) pero sin soporte: 'no-soportado' y no 'necesita-instalar'", await page.evaluate(() => window.Push.estado()) === 'no-soportado');
    await ctx.close();
  }
  {
    const { ctx, page } = await pagina({ permiso: 'denied' });
    t("estado() es 'negado' con el permiso bloqueado", await page.evaluate(() => window.Push.estado()) === 'negado');
    await ctx.close();
  }

  console.log('2. Activar, cambiar de rol y desactivar');
  {
    const { ctx, page, errores } = await pagina({ permisoAlPedir: 'granted' });
    const r = await page.evaluate(() => window.Push.activar('conductor'));
    const id = idEsperado(ENDPOINT);
    t('activar devuelve ok:true', r.ok === true, JSON.stringify(r));
    t('pidió permiso, registró "sw.js" (ruta relativa) y se suscribió con userVisibleOnly y la llave VAPID', await page.evaluate(() => window.__pidioPermiso && window.__registro === 'sw.js' && window.__suscribio.userVisibleOnly === true) && JSON.stringify(await page.evaluate(() => window.__suscribio.llave)) === JSON.stringify(Array.from(Buffer.from(VAPID, 'base64url'))));
    const d = await doc(page, id);
    t('guardó en suscripciones/<primeros 32 hex de SHA-256 del endpoint>', !!d && (await page.evaluate(() => window.__nube.mezclas[0][0])) === 'suscripciones' && id.length === 32, JSON.stringify(d));
    t('el documento trae rol, sub (endpoint y keys), navegador corto y fecha ISO', d && d.rol === 'conductor' && d.sub.endpoint === ENDPOINT && d.sub.keys.p256dh && d.sub.keys.auth && !('expirationTime' in d.sub) && /^Chrome en Android$/.test(d.navegador) && !isNaN(Date.parse(d.en)) && d.en.endsWith('Z'), JSON.stringify(d));
    t("después de activar, estado() es 'activo'", await page.evaluate(() => window.Push.estado()) === 'activo');

    const r2 = await page.evaluate(() => window.Push.actualizarRol('asistente'));
    const d2 = await doc(page, id);
    t('actualizarRol cambia el rol guardado (y sigue siendo el mismo documento)', r2.ok === true && d2.rol === 'asistente' && d2.sub.endpoint === ENDPOINT && (await page.evaluate(() => Object.keys(window.__nube.docs).length)) === 1, JSON.stringify(d2));

    const r3 = await page.evaluate(() => window.Push.desactivar());
    t('desactivar da de baja, borra el documento y estado() vuelve a inactivo', r3.ok === true && (await page.evaluate(() => window.__desuscrito)) === true && (await doc(page, id)) === undefined && (await page.evaluate(() => window.__nube.borrados)).includes('suscripciones/' + id) && (await page.evaluate(() => window.Push.estado())) === 'inactivo', JSON.stringify(r3));
    const r4 = await page.evaluate(() => window.Push.actualizarRol('jefe'));
    t('actualizarRol sin suscripción no guarda nada', r4.ok === false && (await doc(page, id)) === undefined, JSON.stringify(r4));
    t('sin errores en la página ni salidas a internet', errores.length === 0, errores.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page } = await pagina({ permiso: 'default', permisoAlPedir: 'denied' });
    const r = await page.evaluate(() => window.Push.activar('jefe'));
    t('permiso negado al pedirlo: ok:false con motivo en español y no guarda nada', r.ok === false && /Negaste el permiso/.test(r.motivo) && (await page.evaluate(() => Object.keys(window.__nube.docs).length)) === 0, JSON.stringify(r));
    t("y estado() queda en 'negado'", await page.evaluate(() => window.Push.estado()) === 'negado');
    await ctx.close();
  }
  {
    const { ctx, page } = await pagina({ permiso: 'denied' });
    const r = await page.evaluate(() => window.Push.activar('jefe'));
    t('permiso ya bloqueado: motivo en español que dice dónde activarlo', r.ok === false && /ajustes del navegador/.test(r.motivo) && !(await page.evaluate(() => window.__pidioPermiso)), JSON.stringify(r));
    await ctx.close();
  }
  {
    const { ctx, page } = await pagina({ permiso: 'default', permisoAlPedir: 'default' });
    const r = await page.evaluate(() => window.Push.activar('jefe'));
    t('si cierran el aviso sin decidir: ok:false con motivo', r.ok === false && /permiso/i.test(r.motivo), JSON.stringify(r));
    await ctx.close();
  }
  {
    const { ctx, page } = await pagina({ permiso: 'granted', yaSuscrito: true });
    const r = await page.evaluate(() => { window.nube.mezclar = async () => { const e = new Error('x'); e.code = 'permission-denied'; throw e; }; return window.Push.activar('jefe'); });
    t('si Firebase niega guardar: ok:false con motivo en español (no lanza)', r.ok === false && /reglas/.test(r.motivo), JSON.stringify(r));
    await ctx.close();
  }
  {
    const { ctx, page } = await pagina({ permiso: 'granted', yaSuscrito: true });
    const r = await page.evaluate(() => window.Push.actualizarRol('jefe'));
    t('actualizarRol con suscripción previa (otro inicio de sesión) guarda el rol nuevo', r.ok === true && (await doc(page, idEsperado(ENDPOINT))).rol === 'jefe', JSON.stringify(r));
    t("y deja el estado en 'activo'", await page.evaluate(() => window.Push.estado()) === 'activo');
    await ctx.close();
  }

  console.log('3. Enviar');
  const SUBS = [
    { id: 'a1', rol: 'jefe', sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/uno', keys: { p256dh: 'P1', auth: 'A1' } } },
    { id: 'b2', rol: 'asistente', sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/dos', keys: { p256dh: 'P2', auth: 'A2' } } },
    { id: 'sin', rol: 'x' }
  ];
  const AVISO = { titulo: 'Pedido nuevo', texto: 'Carlos pidió guantes', url: './#inventario', etiqueta: 'pedido-9' };
  {
    const { ctx, page, pedidos } = await pagina({ sinConfig: true });
    const r = await page.evaluate(([s, a]) => window.Push.enviar(s, a), [SUBS, AVISO]);
    t("enviar sin url devuelve {ok:false, motivo:'sin-configurar'} y no hace nada", r.ok === false && r.motivo === 'sin-configurar' && r.enviados === 0 && pedidos.length === 0, JSON.stringify(r));
    await ctx.close();
  }
  {
    const { ctx, page, pedidos } = await pagina();
    ctx.respuesta = () => ({ enviados: 1, vencidos: ['https://fcm.googleapis.com/fcm/send/dos'], fallidos: [] });
    const r = await page.evaluate(([s, a]) => window.Push.enviar(s, a), [SUBS, AVISO]);
    t('enviar hace un POST al Worker con subs (solo endpoint y keys), titulo, texto, url y etiqueta', pedidos.length === 1 && JSON.stringify(pedidos[0]) === JSON.stringify({ subs: [{ endpoint: SUBS[0].sub.endpoint, keys: SUBS[0].sub.keys }, { endpoint: SUBS[1].sub.endpoint, keys: SUBS[1].sub.keys }], titulo: AVISO.titulo, texto: AVISO.texto, url: AVISO.url, etiqueta: AVISO.etiqueta }), JSON.stringify(pedidos));
    t('ignora los documentos sin suscripción', pedidos[0].subs.length === 2);
    t('devuelve ok:true con enviados:1', r.ok === true && r.enviados === 1, JSON.stringify(r));
    t('borra de Firestore solo la vencida (b2), con nube.borrar("suscripciones", id)', JSON.stringify(await page.evaluate(() => window.__nube.borrados)) === JSON.stringify(['suscripciones/b2']), JSON.stringify(await page.evaluate(() => window.__nube.borrados)));
    await ctx.close();
  }
  {
    const { ctx, page } = await pagina();
    ctx.estadoRespuesta = 500; ctx.respuesta = () => ({ error: 'faltan los secretos VAPID_D y VAPID_PUB en el Worker' });
    const r = await page.evaluate(([s, a]) => window.Push.enviar(s, a), [SUBS, AVISO]);
    t('si el Worker responde error: no lanza, ok:false y trae el motivo; no borra nada', r.ok === false && /VAPID/.test(r.motivo) && (await page.evaluate(() => window.__nube.borrados.length)) === 0, JSON.stringify(r));
    await ctx.close();
  }
  {
    const { ctx, page } = await pagina({ url: 'https://avisos-demo.prueba.workers.dev/' });
    await ctx.route(u => u.hostname === 'avisos-demo.prueba.workers.dev', r => r.abort(), { times: 1 });
    await ctx.unroute(u => u.hostname === 'avisos-demo.prueba.workers.dev');
    await ctx.route(u => u.hostname === 'avisos-demo.prueba.workers.dev', r => r.abort());
    const r = await page.evaluate(([s, a]) => window.Push.enviar(s, a), [SUBS, AVISO]);
    t('sin conexión con el Worker: no lanza, ok:false y motivo en español', r.ok === false && /internet/.test(r.motivo), JSON.stringify(r));
    const r2 = await page.evaluate(() => window.Push.enviar(null, null));
    t('enviar con datos raros (null) tampoco lanza', r2.ok === true && r2.enviados === 0, JSON.stringify(r2));
    await ctx.close();
  }
  {
    const { ctx, page, pedidos } = await pagina();
    const muchas = Array.from({ length: 30 }, (_, i) => ({ id: 'm' + i, rol: 'jefe', sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/m' + i, keys: { p256dh: 'P', auth: 'A' } } }));
    ctx.respuesta = p => ({ enviados: p.subs.length, vencidos: [], fallidos: [] });
    const r = await page.evaluate(([s, a]) => window.Push.enviar(s, a), [muchas, AVISO]);
    t('con 30 suscripciones manda 2 pedidos (25 y 5) y suma enviados', pedidos.length === 2 && pedidos[0].subs.length === 25 && pedidos[1].subs.length === 5 && r.enviados === 30, JSON.stringify(r));
    await ctx.close();
  }
} finally {
  await b.close(); srv.close();
}
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
