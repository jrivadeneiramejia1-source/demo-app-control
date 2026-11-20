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

let ok = 0, mal = 0;
const t = (n, c, x) => { c ? ok++ : mal++; console.log((c ? 'OK   ' : 'FALLA') + ' ' + n + (c || x == null ? '' : '\n      ' + x)); };

// Se inyecta antes de que cargue la página. opciones: { permiso, iphone, sinConfig, standalone }
function simulacion(o) {
  window.nube = { token: async () => { if (o.sinSesion) throw new Error('sin sesión'); return 'token-de-prueba'; } };
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
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization' };
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    const cuerpoPedido = JSON.parse(req.postData() || '{}');
    pedidos.push(Object.assign({ metodo: req.method(), ruta: new URL(req.url()).pathname, auth: req.headers().authorization }, { cuerpo: cuerpoPedido }));
    const cuerpo = typeof ctx.respuesta === 'function' ? ctx.respuesta(pedidos[pedidos.length - 1]) : { enviados: 1, vencidos: 0, fallidos: 0, ok: true };
    return r.fulfill({ status: ctx.estadoRespuesta || 200, headers: Object.assign({ 'access-control-allow-methods': 'POST, DELETE' }, cors), contentType: 'application/json', body: JSON.stringify(cuerpo) });
  });
  await ctx.route(u => !/^http:\/\/127\.0\.0\.1/.test(u.href) && u.hostname !== 'avisos-demo.prueba.workers.dev', r => { errores.push('salió a internet: ' + r.request().url()); return r.abort(); });
  await ctx.addInitScript(simulacion, opciones);
  const page = await ctx.newPage();
  page.on('pageerror', e => errores.push('error: ' + e.message));
  await page.goto(BASE + '/blanco.html');
  await page.addScriptTag({ url: BASE + '/push.js' });
  return { ctx, page, pedidos, errores };
}

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

  console.log('2. Activar, cambiar de persona y desactivar');
  {
    const { ctx, page, pedidos, errores } = await pagina({ permisoAlPedir: 'granted' });
    const r = await page.evaluate(() => window.Push.activar());
    t('activar devuelve ok:true', r.ok === true, JSON.stringify(r));
    t('pidió permiso, registró "sw.js" (ruta relativa) y se suscribió con userVisibleOnly y la llave VAPID', await page.evaluate(() => window.__pidioPermiso && window.__registro === 'sw.js' && window.__suscribio.userVisibleOnly === true) && JSON.stringify(await page.evaluate(() => window.__suscribio.llave)) === JSON.stringify(Array.from(Buffer.from(VAPID, 'base64url'))));
    const p = pedidos[0];
    t('mandó el teléfono al Worker: POST /suscribir con el token de la sesión', pedidos.length === 1 && p.metodo === 'POST' && p.ruta === '/suscribir' && p.auth === 'Bearer token-de-prueba', JSON.stringify(p));
    t('manda endpoint y keys (sin expirationTime) y el navegador corto, y NO manda rol ni permisos (los saca el Worker de la base)', p.cuerpo.sub.endpoint === ENDPOINT && p.cuerpo.sub.keys.p256dh && p.cuerpo.sub.keys.auth && !('expirationTime' in p.cuerpo.sub) && /^Chrome en Android$/.test(p.cuerpo.navegador) && !('rol' in p.cuerpo) && !('extras' in p.cuerpo), JSON.stringify(p.cuerpo));
    t("después de activar, estado() es 'activo'", await page.evaluate(() => window.Push.estado()) === 'activo');

    const r2 = await page.evaluate(() => window.Push.actualizarRol());
    t('actualizarRol (al cambiar de persona) vuelve a mandar el teléfono al Worker', r2.ok === true && pedidos.length === 2 && pedidos[1].ruta === '/suscribir' && pedidos[1].cuerpo.sub.endpoint === ENDPOINT, JSON.stringify(r2));

    const r3 = await page.evaluate(() => window.Push.desactivar());
    t('desactivar da de baja, le pide al Worker borrarlo (DELETE /suscribir con el endpoint) y estado() vuelve a inactivo', r3.ok === true && (await page.evaluate(() => window.__desuscrito)) === true && pedidos[2].metodo === 'DELETE' && pedidos[2].ruta === '/suscribir' && pedidos[2].cuerpo.endpoint === ENDPOINT && (await page.evaluate(() => window.Push.estado())) === 'inactivo', JSON.stringify(r3));
    const antes = pedidos.length;
    const r4 = await page.evaluate(() => window.Push.actualizarRol());
    t('actualizarRol sin suscripción no manda nada', r4.ok === false && pedidos.length === antes, JSON.stringify(r4));
    t('sin errores en la página ni salidas a internet', errores.length === 0, errores.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page, pedidos } = await pagina({ permiso: 'default', permisoAlPedir: 'denied' });
    const r = await page.evaluate(() => window.Push.activar());
    t('permiso negado al pedirlo: ok:false con motivo en español y no manda nada al Worker', r.ok === false && /Negaste el permiso/.test(r.motivo) && pedidos.length === 0, JSON.stringify(r));
    t("y estado() queda en 'negado'", await page.evaluate(() => window.Push.estado()) === 'negado');
    await ctx.close();
  }
  {
    const { ctx, page } = await pagina({ permiso: 'denied' });
    const r = await page.evaluate(() => window.Push.activar());
    t('permiso ya bloqueado: motivo en español que dice dónde activarlo', r.ok === false && /ajustes del navegador/.test(r.motivo) && !(await page.evaluate(() => window.__pidioPermiso)), JSON.stringify(r));
    await ctx.close();
  }
  {
    const { ctx, page } = await pagina({ permiso: 'default', permisoAlPedir: 'default' });
    const r = await page.evaluate(() => window.Push.activar());
    t('si cierran el aviso sin decidir: ok:false con motivo', r.ok === false && /permiso/i.test(r.motivo), JSON.stringify(r));
    await ctx.close();
  }
  {
    const { ctx, page, pedidos } = await pagina({ permiso: 'granted', sinSesion: true });
    const r = await page.evaluate(() => window.Push.activar());
    t('sin sesión iniciada: ok:false con motivo en español, sin mandar nada', r.ok === false && /sesi/.test(r.motivo) && pedidos.length === 0, JSON.stringify(r));
    await ctx.close();
  }
  {
    const { ctx, page } = await pagina({ permiso: 'granted', yaSuscrito: true });
    ctx.estadoRespuesta = 403; ctx.respuesta = () => ({ error: 'Tu cuenta no tiene permiso para los avisos' });
    const r = await page.evaluate(() => window.Push.activar());
    t('si el Worker dice que no (403): ok:false con el motivo en español, sin lanzar', r.ok === false && /no tiene permiso/.test(r.motivo), JSON.stringify(r));
    t("y no queda en 'activo'", await page.evaluate(() => window.Push.estado()) === 'inactivo');
    await ctx.close();
  }
  {
    const { ctx, page, pedidos } = await pagina({ permiso: 'granted', yaSuscrito: true });
    const r = await page.evaluate(() => window.Push.actualizarRol());
    t('actualizarRol con suscripción previa (otro inicio de sesión) la renueva en el Worker', r.ok === true && pedidos.length === 1 && pedidos[0].ruta === '/suscribir', JSON.stringify(r));
    t("y deja el estado en 'activo'", await page.evaluate(() => window.Push.estado()) === 'activo');
    await ctx.close();
  }

  console.log('3. Enviar');
  const AVISO = { titulo: 'Pedido nuevo', texto: 'Carlos pidió guantes', url: './#inventario', etiqueta: 'pedido-9' };
  {
    const { ctx, page, pedidos } = await pagina({ sinConfig: true });
    const r = await page.evaluate(a => window.Push.enviar('jefe', a), AVISO);
    t("enviar sin url devuelve {ok:false, motivo:'sin-configurar'} y no hace nada", r.ok === false && r.motivo === 'sin-configurar' && r.enviados === 0 && pedidos.length === 0, JSON.stringify(r));
    await ctx.close();
  }
  {
    const { ctx, page, pedidos } = await pagina();
    ctx.respuesta = () => ({ enviados: 2, vencidos: 1, fallidos: 0, destinatarios: 3 });
    const r = await page.evaluate(a => window.Push.enviar('asistente', a), AVISO);
    t('enviar hace un POST /avisar con el token, el rol de destino, titulo, texto, url y etiqueta (y ninguna lista de teléfonos)', pedidos.length === 1 && pedidos[0].ruta === '/avisar' && pedidos[0].auth === 'Bearer token-de-prueba' && JSON.stringify(pedidos[0].cuerpo) === JSON.stringify({ para: 'asistente', titulo: AVISO.titulo, texto: AVISO.texto, url: AVISO.url, etiqueta: AVISO.etiqueta }), JSON.stringify(pedidos));
    t('devuelve ok:true con enviados:2', r.ok === true && r.enviados === 2 && r.vencidos === 1, JSON.stringify(r));
    const y = await page.evaluate(a => window.Push.enviar('yo', a), AVISO);
    t("«yo» también se manda tal cual (el Worker busca los teléfonos de quien pide)", y.ok === true && pedidos[1].cuerpo.para === 'yo', JSON.stringify(pedidos[1]));
    await ctx.close();
  }
  {
    const { ctx, page } = await pagina();
    ctx.estadoRespuesta = 500; ctx.respuesta = () => ({ error: 'faltan los secretos VAPID_D y VAPID_PUB en el Worker' });
    const r = await page.evaluate(a => window.Push.enviar('jefe', a), AVISO);
    t('si el Worker responde error: no lanza, ok:false y trae el motivo', r.ok === false && /VAPID/.test(r.motivo), JSON.stringify(r));
    await ctx.close();
  }
  {
    const { ctx, page } = await pagina();
    ctx.estadoRespuesta = 429; ctx.respuesta = () => ({ error: 'Muchos avisos seguidos: espera un minuto' });
    const r = await page.evaluate(a => window.Push.enviar('jefe', a), AVISO);
    t('si hay demasiados avisos seguidos (429): ok:false con el motivo en español', r.ok === false && /espera un minuto/.test(r.motivo), JSON.stringify(r));
    await ctx.close();
  }
  {
    const { ctx, page } = await pagina({ url: 'https://avisos-demo.prueba.workers.dev/' });
    await ctx.unroute(u => u.hostname === 'avisos-demo.prueba.workers.dev');
    await ctx.route(u => u.hostname === 'avisos-demo.prueba.workers.dev', r => r.abort());
    const r = await page.evaluate(a => window.Push.enviar('jefe', a), AVISO);
    t('sin conexión con el Worker: no lanza, ok:false y motivo en español', r.ok === false && /internet/.test(r.motivo), JSON.stringify(r));
    const r2 = await page.evaluate(() => window.Push.enviar(null, null));
    t('enviar con datos raros (null) tampoco lanza ni manda nada', r2.ok === true && r2.enviados === 0, JSON.stringify(r2));
    await ctx.close();
  }
  {
    const { ctx, page, pedidos } = await pagina({ sinSesion: true });
    const r = await page.evaluate(a => window.Push.enviar('jefe', a), AVISO);
    t('sin sesión: no manda nada al Worker y devuelve ok:false', r.ok === false && pedidos.length === 0, JSON.stringify(r));
    await ctx.close();
  }
} finally {
  await b.close(); srv.close();
}
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
