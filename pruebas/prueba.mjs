// Prueba de la demo (fases 1 y 2) en Chrome con Playwright y el Firebase falso de esta carpeta.
// Uso: CHROME=/usr/bin/google-chrome node pruebas/prueba.mjs   (sin CHROME usa el Chromium de Playwright)
// Capturas en capturas/ (claro, oscuro y pantalla de 360 px). Sale con código 1 si algo falla.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAPTURAS = path.join(RAIZ, 'capturas');
fs.mkdirSync(CAPTURAS, { recursive: true });
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.json': 'application/json' };

// Servidor local de la carpeta del repo (como GitHub Pages).
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, path.normalize(p));
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const URL = `http://127.0.0.1:${srv.address().port}/`;
const SIN_CONFIG = 'window.FIREBASE_CONFIG = { apiKey: "PEGA_AQUI", projectId: "demo-app-control", appId: "PEGA_AQUI" };';
const CONFIG = 'window.FIREBASE_CONFIG = { apiKey: "clave-de-prueba", authDomain: "demo.firebaseapp.com", projectId: "demo-app-control", appId: "1:1:web:1" };';

let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || x == null ? '' : '\n      ' + x)); };
const esp = ms => new Promise(r => setTimeout(r, ms));

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
async function telefono({ conConfig = true, ancho = 412, oscuro = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: 860 }, colorScheme: oscuro ? 'dark' : 'light', locale: 'es-CO' });
  const errores = [];
  // Siempre se reemplaza config.js: con datos de prueba, o con el texto de ejemplo para probar la pantalla "Falta conectar Firebase".
  await ctx.route(/\/config\.js/, r => r.fulfill({ body: conConfig ? CONFIG : SIN_CONFIG, contentType: 'text/javascript' }));
  await ctx.route(/gstatic\.com\/firebasejs\//, r => {
    const n = r.request().url().split('/').pop();
    return r.fulfill({ body: fs.readFileSync(path.join(RAIZ, 'pruebas', n)), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
  });
  // Nada debe salir a internet (fuera del SDK, que se sirve aquí).
  await ctx.route(u => !/^http:\/\/127\.0\.0\.1/.test(u.href) && !/gstatic\.com\/firebasejs/.test(u.href), r => { errores.push('salió a internet: ' + r.request().url()); return r.abort(); });
  const page = await ctx.newPage();
  page.on('pageerror', e => errores.push('error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push('consola: ' + m.text()); });
  return { ctx, page, errores };
}
const visible = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);
const texto = (page, sel) => page.locator(sel).first().innerText().catch(() => '');
const cifra = (page, caja, i) => page.evaluate(([c, i]) => { const n = document.querySelectorAll(`#${c} .sum .num`)[i]; return n ? Number(n.textContent) : NaN; }, [caja, i]);
const hasta = (page, fn, arg, ms = 6000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
async function entrar(page, rol) {
  await page.click(`#entradaLista [data-rol="${rol}"]`);
  return hasta(page, r => !document.getElementById('vInicio').hidden && document.getElementById('avatarTop').classList.contains('av-' + r), rol);
}
async function cambiar(page, rol) {
  await page.click('#btnPersona'); await page.waitForSelector('#shPersona:not([hidden])');
  await page.click(`#personaLista [data-rol="${rol}"]`);
  return hasta(page, r => document.getElementById('avatarTop').classList.contains('av-' + r) && document.getElementById('shPersona').hidden, rol);
}
const datosListos = page => hasta(page, () => document.querySelectorAll('#sumInicio .sum').length > 0 && !document.querySelector('#modulosLista .esq') && Number(document.querySelector('#sumInicio .num')?.textContent) >= 0, null, 8000);

try {
  console.log('1. Sin configuración de Firebase');
  {
    const t = await telefono({ conConfig: false });
    await t.page.goto(URL);
    log('dice que falta conectar Firebase (no se queda cargando)', await hasta(t.page, () => !document.getElementById('vConfig').hidden));
    log('no muestra pestañas ni la entrada', !(await visible(t.page, '#tabs')) && !(await visible(t.page, '#vEntrada')));
    log('sin errores de consola', t.errores.length === 0, t.errores.join(' | '));
    await t.ctx.close();
  }

  console.log('2. Entrada y datos de prueba (Jefe)');
  const t = await telefono();
  await t.page.goto(URL);
  log('muestra las cinco personas de prueba', await hasta(t.page, () => document.querySelectorAll('#entradaLista .persona-card').length === 5));
  log('la entrada tiene la etiqueta Versión pagada', await visible(t.page, '#vEntrada .pagada'));
  log('entra como Ana Pérez (Jefe)', await entrar(t.page, 'jefe'));
  log('siembra los datos y llena el tablero', await datosListos(t.page));
  await esp(900); // las cifras cuentan hasta su valor
  const sem = await t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos') || '{}'));
  const COLS = ['equipos', 'compras', 'articulos', 'movimientos', 'solicitudes', 'vehiculos', 'reuniones', 'avisos'];
  log('sembró 12 equipos, 8 compras, 18 artículos, 13 movimientos, 5 pedidos, 3 carros, 3 reuniones y 6 avisos',
    COLS.map(c => Object.keys(sem[c] || {}).length).join(',') === '12,8,18,13,5,3,3,6', COLS.map(c => c + ':' + Object.keys(sem[c] || {}).length).join(' '));
  log('el saludo dice Hola, Ana', (await texto(t.page, '#tInicio')) === 'Hola, Ana');
  log('Jefe ve 7 cifras de pendientes', (await t.page.locator('#sumInicio .sum').count()) === 7);
  log('bodega: 5 agotados o bajos y 3 pedidos por entregar', (await cifra(t.page, 'sumInicio', 0)) === 5 && (await cifra(t.page, 'sumInicio', 1)) === 3);
  log('compras por autorizar = 2 y sin autorizar = 1', (await cifra(t.page, 'sumInicio', 2)) === 2 && (await cifra(t.page, 'sumInicio', 3)) === 1);
  log('Jefe ve las 5 pestañas y los 4 módulos abiertos', (await t.page.locator('.tab:not([hidden])').count()) === 5 && (await t.page.locator('#modulosLista .modulo.bloqueado').count()) === 0);
  log('la campana tiene avisos sin leer (2 del jefe y 1 para todos)', (await texto(t.page, '#badgeAvisos')) === '3');
  await t.page.screenshot({ path: path.join(CAPTURAS, '01-inicio-jefe.png'), fullPage: true });

  console.log('3. Módulos');
  await t.page.click('.tab[data-vista="equipos"]');
  log('Equipos: lista de 12 con seriales DEMO', await hasta(t.page, () => document.querySelectorAll('#listaEquipos .card').length === 12 && document.getElementById('listaEquipos').textContent.includes('DEMO-0001')));
  await t.page.click('#sumEquipos button.sum[data-filtro="recibido"]');
  log('Equipos: tocar "En Recibidos" filtra a 3', (await t.page.locator('#listaEquipos .card').count()) === 3 && (await texto(t.page, '#cntEquipos')) === '3 de 12 equipos');
  await t.page.click('#sumEquipos button.sum[data-filtro="recibido"]');
  log('Equipos: tocarla otra vez quita el filtro', (await t.page.locator('#listaEquipos .card').count()) === 12);
  await t.page.fill('#qEquipos', 'thinkpad');
  log('Equipos: la búsqueda encuentra ThinkPad', (await t.page.locator('#listaEquipos .card').count()) >= 1 && (await t.page.locator('#listaEquipos .card').count()) < 12);
  await t.page.fill('#qEquipos', '');
  await t.page.click('.tab[data-vista="inventario"]');
  log('Inventario: la Jefe ve 10 tareas agrupadas por a quién le tocan', await hasta(t.page, () => document.querySelectorAll('#invContenido .tarea').length === 10 && /Le toca a Sofía H\./.test(document.getElementById('invContenido').textContent) && /Le toca a Luis R\./.test(document.getElementById('invContenido').textContent)), await texto(t.page, '#invContenido'));
  log('Inventario: la Jefe solo mira, no tiene botones de acción', (await t.page.locator('#invContenido [data-accion]').count()) === 0);
  log('Inventario: sale la tarea de autorizar las botas (agotadas) y no la de pedirlas', /Autorizar compra: Botas de seguridad talla 40/.test(await texto(t.page, '#invContenido')) && !/Pedir compra: Botas de seguridad talla 40/.test(await texto(t.page, '#invContenido')));
  await esp(900);
  log('Inventario: tablero con 2 agotados y 3 bajos', (await cifra(t.page, 'sumInventario', 0)) === 2 && (await cifra(t.page, 'sumInventario', 1)) === 3);
  await t.page.click('#invSecciones [data-sec="existencias"]');
  log('Existencias: 18 artículos, primero los agotados', await hasta(t.page, () => document.querySelectorAll('#invContenido .card.art').length === 18 && /Agotado/.test(document.querySelector('#invContenido .card.art').textContent)));
  await t.page.click('#sumInventario button.sum[data-filtro="agotado"]');
  log('Existencias: tocar "Agotados" deja 2', (await t.page.locator('#invContenido .card.art').count()) === 2);
  await t.page.click('#sumInventario button.sum[data-filtro="agotado"]');
  await t.page.fill('#qInventario', 'botas');
  log('Existencias: la búsqueda encuentra las 2 botas', (await t.page.locator('#invContenido .card.art').count()) === 2);
  await t.page.fill('#qInventario', '');
  await t.page.click('#invSecciones [data-sec="conteo"]');
  log('las partes que faltan dicen que llegan con el módulo completo', /módulo completo/.test(await texto(t.page, '#invContenido')));
  await t.page.click('#invSecciones [data-sec="hacer"]');
  await t.page.click('.tab[data-vista="vehiculos"]');
  log('Vehículos: 3 carros con placa', await hasta(t.page, () => document.querySelectorAll('#listaVehiculos .placa').length === 3));
  log('Vehículos: avisa el SOAT por vencer y la revisión vencida', /SOAT vence en 12 días/.test(await texto(t.page, '#listaVehiculos')) && /vencido hace 5 días/.test(await texto(t.page, '#listaVehiculos')), await texto(t.page, '#listaVehiculos'));
  log('Vehículos: el rayón sin revisar aparece', /Rayón sin revisar/.test(await texto(t.page, '#listaVehiculos')));
  await t.page.click('.tab[data-vista="reuniones"]');
  log('Reuniones: 3 reuniones con sus necesidades', await hasta(t.page, () => document.querySelectorAll('#listaReuniones .card').length === 3 && document.querySelectorAll('#listaReuniones .necesidades li').length >= 3));
  log('cada módulo tiene su etiqueta Versión pagada', await t.page.evaluate(() => ['vEquipos', 'vInventario', 'vVehiculos', 'vReuniones', 'vInicio'].every(v => document.querySelector('#' + v + ' .pagada'))));
  await t.page.click('#vReuniones .pagada');
  log('la etiqueta abre la hoja con demo frente a pagando', await hasta(t.page, () => !document.getElementById('shPagada').hidden && /Outlook/.test(document.getElementById('pagadaCuerpo').textContent)));
  await t.page.keyboard.press('Escape');
  log('Escape cierra la hoja', await hasta(t.page, () => document.getElementById('shPagada').hidden));

  console.log('4. Cambio de persona y permisos');
  log('cambia a Carlos Pinto (Conductor)', await cambiar(t.page, 'conductor'));
  log('Conductor no ve Equipos; sí ve Inventario (para pedir) y Vehículos', await t.page.evaluate(() => document.querySelector('.tab[data-vista="equipos"]').hidden && !document.querySelector('.tab[data-vista="inventario"]').hidden && !document.querySelector('.tab[data-vista="vehiculos"]').hidden));
  log('volvió a Inicio porque Reuniones sí lo ve pero arrancó donde estaba', !(await t.page.locator('#vReuniones').isHidden()) || !(await t.page.locator('#vInicio').isHidden()));
  await t.page.click('.tab[data-vista="inicio"]');
  log('en Inicio, Equipos sale con candado', (await t.page.locator('#modulosLista .modulo.bloqueado').count()) === 1);
  await t.page.click('#modulosLista [data-ir="equipos"]', { force: true });
  log('tocar un módulo bloqueado explica que no tiene permiso', await hasta(t.page, () => /no tiene permiso/.test(document.getElementById('toast').textContent)));
  log('la campana del Conductor solo cuenta el aviso para todos', (await texto(t.page, '#badgeAvisos')) === '1');
  await t.page.click('.tab[data-vista="inventario"]');
  log('Conductor: en Inventario ve sus pedidos (los 2 chalecos en espera)', await hasta(t.page, () => /Tus pedidos de material \(1\)/.test(document.getElementById('invContenido').textContent) && /En espera/.test(document.getElementById('invContenido').textContent)));
  await t.page.click('#btnPedirMaterial');
  await t.page.waitForSelector('#shAccion:not([hidden])');
  await t.page.click('#acPrimario');
  log('Pedir material sin decir para qué no deja guardar', await hasta(t.page, () => !document.getElementById('acErr').hidden && /para qué/.test(document.getElementById('acErr').textContent)));
  await t.page.selectOption('#acArt', 'ar-018'); await t.page.fill('#acCant', '1'); await t.page.fill('#acPara', 'Revisar llantas de noche');
  await t.page.click('#acPrimario');
  log('Conductor pide una linterna: queda en sus pedidos', await hasta(t.page, () => document.getElementById('shAccion').hidden && /Tus pedidos de material \(2\)/.test(document.getElementById('invContenido').textContent)));
  const solNueva = await t.page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).solicitudes).find(s => s.paraQue === 'Revisar llantas de noche'));
  log('el pedido se guardó con quién lo pide y en espera', solNueva && solNueva.pide === 'Carlos Pinto' && solNueva.pideRol === 'conductor' && solNueva.estado === 'pendiente' && solNueva.articuloId === 'ar-018', JSON.stringify(solNueva));
  log('cambia a Luis Rodríguez (Autoriza compras)', await cambiar(t.page, 'compras'));
  log('Luis se queda en Inventario porque también lo puede ver', !(await t.page.locator('#vInventario').isHidden()));
  await t.page.click('.tab[data-vista="inicio"]');
  await esp(900);
  log('Luis ve 3 cifras: por autorizar, sin autorizar y reuniones que esperan su respuesta', (await t.page.locator('#sumInicio .sum').count()) === 3 && /esperan tu respuesta/.test(await texto(t.page, '#sumInicio')), (await t.page.locator('#sumInicio .sum').count()) + ' | ' + (await texto(t.page, '#sumInicio')) + ' | vista: ' + (await t.page.evaluate(() => [...document.querySelectorAll('.view')].filter(v => !v.hidden).map(v => v.id).join(','))));
  log('la insignia de Inventario dice 2 (las 2 compras por autorizar)', (await texto(t.page, '[data-badge="inventario"]')) === '2');
  await t.page.click('#btnAvisos');
  log('la campana muestra 2 avisos (el suyo y el de todos)', await hasta(t.page, () => document.querySelectorAll('#avisosLista .aviso-it').length === 2));
  log('al abrirla la insignia queda en 0', await hasta(t.page, () => document.getElementById('badgeAvisos').hidden));
  await t.page.keyboard.press('Escape');
  await t.page.click('.tab[data-vista="inventario"]');
  log('Luis tiene 2 compras por autorizar con sus botones', await hasta(t.page, () => document.querySelectorAll('#invContenido [data-accion="autorizar"]').length === 2));
  await t.page.click('#invContenido [data-accion="autorizar"][data-id="co-002"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.click('#acPrimario');
  log('Luis autoriza el mouse: la compra queda autorizada y pasa a Sofía', await hasta(t.page, () => JSON.parse(localStorage.getItem('__fb_datos')).compras['co-002'].estado === 'autorizado' && document.querySelectorAll('#invContenido [data-accion="autorizar"]').length === 1));
  await t.page.click('#invContenido [data-accion="rechazar"][data-id="co-001"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.click('#acPrimario');
  log('rechazar sin motivo no deja guardar', await hasta(t.page, () => !document.getElementById('acErr').hidden));
  await t.page.keyboard.press('Escape');

  console.log('4b. Encargada de bodega (Sofía)');
  log('cambia a Sofía Herrera (Asistente, encargada de bodega)', await cambiar(t.page, 'asistente'));
  await t.page.click('.tab[data-vista="inventario"]');
  log('Sofía ve sus tareas con botones (pedir, entregar, comprar, recibir)', await hasta(t.page, () => ['pedir', 'entregar', 'comprar', 'recibir'].every(a => document.querySelector(`#invContenido [data-accion="${a}"]`))));
  const art = id => t.page.evaluate(i => JSON.parse(localStorage.getItem('__fb_datos')).articulos[i].cantidad, id);
  const chal0 = await art('ar-003');
  const solChal = await t.page.evaluate(() => Object.entries(JSON.parse(localStorage.getItem('__fb_datos')).solicitudes).find(([, s]) => s.estado === 'pendiente' && s.articuloId === 'ar-003')[0]);
  await t.page.click(`#invContenido [data-accion="entregar"][data-id="${solChal}"]`);
  await t.page.waitForSelector('#shAccion:not([hidden])');
  await t.page.fill('#acCant', '999'); await t.page.click('#acPrimario');
  log('entregar más de lo que hay no deja guardar', await hasta(t.page, () => !document.getElementById('acErr').hidden && /Solo hay/.test(document.getElementById('acErr').textContent)));
  await t.page.fill('#acCant', '2'); await t.page.click('#acPrimario');
  log('entregar 2 chalecos resta 2 de la bodega', await hasta(t.page, x => JSON.parse(localStorage.getItem('__fb_datos')).articulos['ar-003'].cantidad === x, chal0 - 2), String(await art('ar-003')));
  const mov = await t.page.evaluate(i => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).movimientos).find(m => m.solicitudId === i), solChal);
  log('la entrega deja su movimiento (quién, a quién y saldo)', mov && mov.tipo === 'salida' && mov.persona === 'Carlos Pinto' && mov.por === 'Sofía Herrera' && mov.saldo === chal0 - 2, JSON.stringify(mov));
  log('el pedido de Carlos queda entregado y le llega un aviso', await t.page.evaluate(i => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.solicitudes[i].estado === 'entregada' && Object.values(d.avisos).some(a => a.para === 'conductor' && /entregó/.test(a.texto)); }, solChal));
  log('cuando no alcanza, lo dice y ofrece entregar lo que hay', /No alcanza/.test(await texto(t.page, '#invContenido')) && /Entregar lo que hay \(6\)/.test(await texto(t.page, '#invContenido')));
  const hdmi0 = await art('ar-010');
  await t.page.click('#invContenido [data-accion="recibir"][data-id="co-005"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.click('#acPrimario');
  const cant5 = await t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos')).compras['co-005'].cantidad);
  const sumo = await hasta(t.page, x => JSON.parse(localStorage.getItem('__fb_datos')).articulos['ar-010'].cantidad === x, hdmi0 + cant5);
  const est5 = await t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos')).compras['co-005'].estado);
  log('recibir en bodega suma lo comprado y cierra la compra', sumo && est5 === 'recibido', `${hdmi0} + ${cant5} -> ${await art('ar-010')} (${est5})`);
  await t.page.click('#invContenido [data-accion="pedir"][data-id="ar-016"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.click('#acPrimario');
  log('pedir compra del café crea la compra por autorizar y quita la tarea', await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return Object.values(d.compras).some(c => c.articuloId === 'ar-016' && c.estado === 'pedido') && !document.querySelector('#invContenido [data-accion="pedir"][data-id="ar-016"]'); }));
  await t.page.click('#invContenido [data-accion="comprar"][data-id="co-002"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.click('#acPrimario');
  log('registrar la compra del mouse la deja comprada (falta recibir)', await hasta(t.page, () => { const c = JSON.parse(localStorage.getItem('__fb_datos')).compras['co-002']; return c.estado === 'comprado' && c.valorReal > 0 && c.proveedor; }) && !!(await t.page.$('#invContenido [data-accion="recibir"][data-id="co-002"]')));
  await t.page.screenshot({ path: path.join(CAPTURAS, '05-inventario-sofia.png'), fullPage: true });
  log('cambia de nuevo a Luis Rodríguez', await cambiar(t.page, 'compras'));
  await t.page.reload();
  log('al recargar sigue con Luis y los avisos leídos', await hasta(t.page, () => document.getElementById('avatarTop').classList.contains('av-compras') && document.getElementById('badgeAvisos').hidden, null, 8000));

  console.log('5. Reiniciar los datos (solo Jefe)');
  await t.page.click('#btnPersona'); await t.page.waitForSelector('#shPersona:not([hidden])');
  log('Luis no ve el botón de reiniciar', await t.page.locator('#ajustesJefe').isHidden());
  await t.page.click('#personaLista [data-rol="jefe"]');
  await hasta(t.page, () => document.getElementById('avatarTop').classList.contains('av-jefe'));
  // Se cambia algo a mano (como si alguien hubiera usado la demo) y se agrega un registro de más.
  await t.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')); d.compras['co-001'].estado = 'rechazado'; d.compras['extra-1'] = { que: 'sobra' }; localStorage.setItem('__fb_datos', JSON.stringify(d)); });
  await t.page.reload(); await datosListos(t.page);
  await t.page.click('#btnPersona'); await t.page.waitForSelector('#shPersona:not([hidden])');
  await t.page.click('#btnReiniciar');
  log('pide confirmar dentro de la app', await hasta(t.page, () => !document.getElementById('shConfirmar').hidden));
  await t.page.click('#cfNo');
  log('Cancelar no borra nada', await t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos')).compras['extra-1'] != null));
  await t.page.click('#btnReiniciar'); await t.page.click('#cfSi');
  log('Reiniciar devuelve los datos de ejemplo y quita lo que sobraba', await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.compras['co-001'].estado === 'pedido' && !d.compras['extra-1']; }));
  log('después de reiniciar avisa que quedó listo', await hasta(t.page, () => /reiniciados/.test(document.getElementById('toast').textContent)));

  console.log('6. Seguridad y errores');
  await t.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')); d.compras['co-002'].que = '<img src=x onerror="window.__hackeado=1">Prueba'; d.articulos['ar-011'].nombre = '<img src=x onerror="window.__hackeado=2">Mouse'; d.solicitudes[Object.keys(d.solicitudes)[0]].paraQue = '<script>window.__hackeado=3</script>'; localStorage.setItem('__fb_datos', JSON.stringify(d)); });
  await t.page.reload(); await datosListos(t.page);
  await t.page.click('.tab[data-vista="inventario"]'); await esp(300);
  log('un texto con HTML se muestra como texto y no se ejecuta', !(await t.page.evaluate(() => window.__hackeado)) && /<img src=x/.test(await texto(t.page, '#invContenido')), await texto(t.page, '#invContenido'));
  await t.page.evaluate(() => { window.__fbDenegar = true; });
  await t.page.reload();
  await t.page.evaluate(() => { window.__fbDenegar = true; });
  log('si Firebase no deja leer, dice que faltan las reglas', await hasta(t.page, () => !document.getElementById('avisoError').hidden && /reglas/.test(document.getElementById('avisoErrorTxt').textContent), null, 8000), await texto(t.page, '#avisoErrorTxt'));
  await t.page.evaluate(() => { window.__fbDenegar = false; });
  await t.page.click('#btnPersona'); await t.page.waitForSelector('#shPersona:not([hidden])');
  await t.page.click('#btnSalir');
  log('Salir vuelve a la entrada', await hasta(t.page, () => !document.getElementById('vEntrada').hidden && document.getElementById('tabs').hidden));
  await t.page.evaluate(() => { window.__fbFallarAuth = 'auth/network-request-failed'; });
  await t.page.click('#entradaLista [data-rol="carros"]');
  log('sin internet al entrar, lo dice en español', await hasta(t.page, () => !document.getElementById('entradaErr').hidden && /conexión/.test(document.getElementById('entradaErr').textContent)));
  // Doble toque rápido: no debe romper ni dejar dos sesiones
  await t.page.locator('#entradaLista [data-rol="carros"]').dblclick();
  log('doble toque al entrar deja una sola sesión (Marta)', await hasta(t.page, () => document.getElementById('avatarTop').classList.contains('av-carros')));
  log('sin errores de consola en todo el recorrido', t.errores.length === 0, t.errores.join(' | '));
  await t.ctx.close();

  console.log('7. Tema oscuro, pantalla de 360 px y accesibilidad');
  for (const [nombre, op] of [['oscuro', { oscuro: true }], ['360px', { ancho: 360 }]]) {
    const x = await telefono(op);
    await x.page.goto(URL); await x.page.waitForSelector('#entradaLista .persona-card');
    await x.page.screenshot({ path: path.join(CAPTURAS, `02-entrada-${nombre}.png`), fullPage: true });
    await entrar(x.page, 'jefe'); await datosListos(x.page); await esp(900);
    await x.page.screenshot({ path: path.join(CAPTURAS, `03-inicio-${nombre}.png`), fullPage: true });
    log(`${nombre}: nada se sale de la pantalla a lo ancho`, await x.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    for (const v of ['equipos', 'inventario', 'vehiculos', 'reuniones']) {
      await x.page.click(`.tab[data-vista="${v}"]`); await esp(250);
      if (nombre === '360px' || v === 'vehiculos') await x.page.screenshot({ path: path.join(CAPTURAS, `04-${v}-${nombre}.png`), fullPage: true });
    }
    log(`${nombre}: sin desborde en los módulos`, await x.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    // axe-core: revisión automática de accesibilidad (contraste, etiquetas, nombres de botones).
    await x.page.addScriptTag({ content: fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8') });
    for (const v of ['inicio', 'inventario']) {
      await x.page.click(`.tab[data-vista="${v}"]`); await esp(700);
      const r = await x.page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] }));
      const graves = r.violations.filter(v => ['serious', 'critical'].includes(v.impact));
      log(`${nombre}: accesibilidad sin fallas graves en ${v}`, graves.length === 0, graves.map(g => g.id + ' (' + g.nodes.length + '): ' + g.nodes.slice(0, 2).map(n => n.target.join(' ')).join(', ')).join(' | '));
    }
    log(`${nombre}: sin errores de consola`, x.errores.length === 0, x.errores.join(' | '));
    await x.ctx.close();
  }
} catch (e) {
  log('la prueba terminó sin excepciones', false, e.stack);
} finally {
  await b.close(); srv.close();
}
console.log(`\n${ok} bien, ${mal} mal. Capturas en capturas/`);
process.exit(mal ? 1 : 0);
