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
  log('muestra las once personas de prueba agrupadas por área', await hasta(t.page, () => document.querySelectorAll('#entradaLista .persona-card').length === 11 && document.querySelectorAll('#entradaLista .section-label').length === 5));
  log('la entrada tiene la etiqueta Versión pagada', await visible(t.page, '#vEntrada .pagada'));
  log('entra como Ana Pérez (Jefe)', await entrar(t.page, 'jefe'));
  log('siembra los datos y llena el tablero', await datosListos(t.page));
  await esp(900); // las cifras cuentan hasta su valor
  const sem = await t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos') || '{}'));
  const COLS = ['equipos', 'hojas', 'tareasEq', 'compras', 'articulos', 'movimientos', 'solicitudes', 'vehiculos', 'novedades', 'entregas', 'reuniones', 'necesidades', 'avisos'];
  log('sembró 12 equipos, 6 actas, 3 tareas de equipos, 8 compras, 18 artículos, 13 movimientos, 5 pedidos, 4 carros, 3 novedades, 3 salidas/llegadas, 4 reuniones, 25 tareas de reuniones y 11 avisos',
    COLS.map(c => Object.keys(sem[c] || {}).length).join(',') === '12,6,3,8,18,13,5,4,3,3,4,25,11', COLS.map(c => c + ':' + Object.keys(sem[c] || {}).length).join(' '));
  log('el saludo dice Hola, Ana', (await texto(t.page, '#tInicio')) === 'Hola, Ana');
  log('Jefe ve 10 cifras de pendientes', (await t.page.locator('#sumInicio .sum').count()) === 10);
  log('bodega: 5 agotados o bajos y 3 pedidos por entregar', (await cifra(t.page, 'sumInicio', 0)) === 5 && (await cifra(t.page, 'sumInicio', 1)) === 3);
  log('compras que le toca autorizar = 1 (la de Ana la autoriza el Gerente) y sin autorizar = 1', (await cifra(t.page, 'sumInicio', 2)) === 1 && (await cifra(t.page, 'sumInicio', 3)) === 1 && /te toca autorizar/.test(await texto(t.page, '#sumInicio')));
  log('Jefe ve las 5 pestañas y los 4 módulos abiertos', (await t.page.locator('.tab:not([hidden])').count()) === 5 && (await t.page.locator('#modulosLista .modulo.bloqueado').count()) === 0);
  log('la campana tiene avisos sin leer (3 de la Jefe y 1 para todos)', (await texto(t.page, '#badgeAvisos')) === '4');
  await t.page.screenshot({ path: path.join(CAPTURAS, '01-inicio-jefe.png'), fullPage: true });

  console.log('3. Módulos');
  await t.page.click('.tab[data-vista="equipos"]');
  log('Equipos: la Jefe ve Recibidos (3), el acta con problema, la agenda y las actas por revisar (3)', await hasta(t.page, () => { const x = document.getElementById('eqContenido').textContent; return /Recibidos: mantenimiento y backup \(3\)/.test(x) && /Actas con problema \(1\)/.test(x) && /Agenda \(2\)/.test(x) && /Actas por revisar \(3\)/.test(x); }), await texto(t.page, '#eqContenido'));
  await t.page.click('#eqSecciones [data-sec="equipos"]');
  log('Equipos: lista de 12 con seriales DEMO', await hasta(t.page, () => document.querySelectorAll('#eqContenido .card[data-accion="ver"]').length === 12 && document.getElementById('eqContenido').textContent.includes('DEMO-0001')));
  await t.page.click('#sumEquipos button.sum[data-filtro="recibido"]');
  log('Equipos: tocar "En Recibidos" filtra a 3', await hasta(t.page, () => document.querySelectorAll('#eqContenido .card[data-accion="ver"]').length === 3 && /3 de 12 equipos/.test(document.getElementById('eqContenido').textContent)));
  await t.page.click('#sumEquipos button.sum[data-filtro="recibido"]');
  log('Equipos: tocarla otra vez quita el filtro', await hasta(t.page, () => document.querySelectorAll('#eqContenido .card[data-accion="ver"]').length === 12));
  await t.page.fill('#qEq', 'thinkpad');
  log('Equipos: la búsqueda encuentra ThinkPad', await hasta(t.page, () => { const n = document.querySelectorAll('#eqContenido .card[data-accion="ver"]').length; return n >= 1 && n < 12; }));
  await t.page.fill('#qEq', '');
  await t.page.click('.tab[data-vista="inventario"]');
  log('Inventario: la Jefe empieza en el Panorama (todo el inventario en una pantalla) y no en la lista de tareas', await hasta(t.page, () => document.querySelector('#invSecciones [data-sec="panorama"]').getAttribute('aria-pressed') === 'true' && /Lo urgente/.test(document.getElementById('invContenido').textContent)));
  log('el Panorama dice lo urgente: agotados, compras que esperan a la Jefe y al Gerente, sin autorización, pedidos viejos', await t.page.evaluate(() => { const x = document.getElementById('invContenido').textContent; return /artículos agotados/.test(x) && /compra espera tu decisión/.test(x) && /compra hecha sin autorización/.test(x) && /espera al Gerente/.test(x) && /pedido de material espera hace más de 2 días/.test(x) && /Valor de lo que hay en bodega/.test(x) && /Gastado este mes/.test(x) && /por persona que las pidió/.test(x) && /por proyecto/.test(x); }), await texto(t.page, '#invContenido'));
  await t.page.screenshot({ path: path.join(CAPTURAS, '09-panorama-jefe.png'), fullPage: true });
  await t.page.click('#invContenido [data-accion="ir"][data-sec="existencias"]');
  log('tocar «artículos agotados» lleva a Existencias ya filtradas', await hasta(t.page, () => document.querySelector('#invSecciones [data-sec="existencias"]').getAttribute('aria-pressed') === 'true' && document.querySelectorAll('#invContenido .art').length === 2));
  await t.page.click('#invSecciones [data-sec="hacer"]');
  log('Inventario: la Jefe ve 11 tareas agrupadas por a quién le tocan (también Luis, Sofía y el Gerente)', await hasta(t.page, () => { const x = document.getElementById('invContenido').textContent; return document.querySelectorAll('#invContenido .tarea').length === 11 && /Te toca a ti \(2\)/.test(x) && /Le toca a Sofía H\./.test(x) && /Le toca a Luis R\./.test(x) && /Le toca a Ricardo F\./.test(x); }), await texto(t.page, '#invContenido'));
  log('la Jefe puede hacer cualquier paso (autorizar, comprar, recibir, entregar) pero no autorizar su propia compra', await t.page.evaluate(() => ['autorizar', 'comprar', 'recibir', 'entregar', 'revisada'].every(a => document.querySelector(`#invContenido [data-accion="${a}"]`)) && !!document.querySelector('#invContenido [data-accion="autorizar"][data-id="co-001"]') && !document.querySelector('#invContenido [data-accion="autorizar"][data-id="co-002"]') && /la autoriza el Gerente/.test(document.getElementById('invContenido').textContent)));
  await t.page.click('#invContenido [data-accion="revisada"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.fill('#acNota', 'Fue una urgencia'); await t.page.click('#acPrimario');
  log('la Jefe marca revisada la compra sin autorización y queda en su historial', await hasta(t.page, () => { const c = JSON.parse(localStorage.getItem('__fb_datos')).compras['co-008']; return c.revisada === true && c.historial.some(h => /Fue una urgencia/.test(h.texto)); }));
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
  for (const [sec, re] of [['movimientos', /Registró/], ['solicitudes', /En espera/], ['compras', /En curso/], ['conteo', /conteo/i], ['resumen', /Cómo van las compras[\s\S]*Valor de lo que hay en bodega/]]) {
    await t.page.click(`#invSecciones [data-sec="${sec}"]`);
    log(`Inventario: la parte «${sec}» funciona`, await hasta(t.page, r => new RegExp(r).test(document.getElementById('invContenido').textContent), re.source), (await texto(t.page, '#invContenido')).slice(0, 200));
  }
  log('la Jefe puede descargar el Excel del resumen', !!(await t.page.$('#invContenido [data-accion="excel"]')));
  const [descarga] = await Promise.all([t.page.waitForEvent('download', { timeout: 15000 }).catch(() => null), t.page.click('#invContenido [data-accion="excel"]')]);
  log('el Excel se descarga con 4 hojas', !!descarga && /Inventario demo .*\.xlsx$/.test(descarga.suggestedFilename()), descarga ? descarga.suggestedFilename() : 'sin descarga');
  await t.page.click('#invSecciones [data-sec="compras"]');
  await t.page.click('#invContenido .chip[data-val="todas"]');
  await t.page.click('#invContenido [data-accion="vercompra"][data-id="co-007"]');
  log('el detalle de una compra muestra cómo va (historial)', await hasta(t.page, () => !document.getElementById('shAccion').hidden && document.querySelectorAll('#acCampos .linea li').length >= 3 && /Recibido en bodega/.test(document.getElementById('acCampos').textContent)));
  await t.page.keyboard.press('Escape');
  await t.page.click('#invSecciones [data-sec="hacer"]');
  await t.page.click('.tab[data-vista="vehiculos"]');
  await esp(900);
  log('Vehículos: tablero con 2 disponibles, 1 en uso, 1 novedad sin revisar y 2 documentos mal', await hasta(t.page, () => document.querySelectorAll('#sumVehiculos .sum').length === 4) && (await cifra(t.page, 'sumVehiculos', 0)) === 2 && (await cifra(t.page, 'sumVehiculos', 1)) === 1 && (await cifra(t.page, 'sumVehiculos', 2)) === 1 && (await cifra(t.page, 'sumVehiculos', 3)) === 2, await texto(t.page, '#sumVehiculos'));
  log('Vehículos: a la Jefe le tocan los viajes, el rayón por revisar y los 2 documentos', await hasta(t.page, () => { const x = document.getElementById('vehContenido').textContent; return /Viajes de reuniones \(2\)/.test(x) && /Novedades por revisar \(1\)/.test(x) && /Rayón/.test(x) && /Documentos por vencer o vencidos \(2\)/.test(x); }), await texto(t.page, '#vehContenido'));
  log('Vehículos: al entrar la Jefe se crea el aviso de cada documento para Jefe, Transporte y Bodega (una sola vez)', await hasta(t.page, () => Object.keys(JSON.parse(localStorage.getItem('__fb_datos')).avisos).filter(k => k.startsWith('doc-')).length === 6));
  await t.page.click('#vehSecciones [data-sec="carros"]');
  log('Vehículos: 4 carros con placa, el SOAT por vencer y la técnico-mecánica vencida', await hasta(t.page, () => { const x = document.getElementById('vehContenido').textContent; return document.querySelectorAll('#vehContenido .card .placa').length === 4 && /SOAT: vence en 12 días/.test(x) && /Técnico-mecánica: venció hace 5 días/.test(x) && /En taller/.test(x); }), await texto(t.page, '#vehContenido'));
  await t.page.click('#vehContenido [data-accion="ver"][data-id="ve-abc123"]');
  log('la hoja de vida muestra la novedad, la salida con sus 5 fotos y el historial', await hasta(t.page, () => !document.getElementById('shVeh').hidden && document.querySelectorAll('#veCampos .ent-foto').length === 5 && /Rayón/.test(document.getElementById('veCampos').textContent) && /Salió con Carlos Pinto/.test(document.getElementById('veCampos').textContent)));
  await t.page.screenshot({ path: path.join(CAPTURAS, '06-hoja-de-vida.png'), fullPage: true });
  await t.page.keyboard.press('Escape');
  await t.page.click('#vehSecciones [data-sec="hacer"]');
  await t.page.click('.tab[data-vista="reuniones"]');
  log('Reuniones: la Jefe ve lo que toca a cada quien y las 2 próximas', await hasta(t.page, () => /Le toca a/.test(document.getElementById('reuContenido').textContent) && Number(document.querySelector('#sumReuniones .num')?.textContent) >= 0) && await (async () => { await esp(900); return (await cifra(t.page, 'sumReuniones', 0)) === 2 && (await cifra(t.page, 'sumReuniones', 2)) === 1; })());
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
  await t.page.click('#btnPedirCompra'); await t.page.waitForSelector('#shAccion:not([hidden])');
  await t.page.click('#acPrimario');
  log('pedir compra sin decir qué no deja guardar', await hasta(t.page, () => !document.getElementById('acErr').hidden && /qué se va a comprar/.test(document.getElementById('acErr').textContent)));
  await t.page.fill('#acQue', 'Llanta de repuesto para el ABC 123'); await t.page.fill('#acCant', '1'); await t.page.fill('#acValor', '450000'); await t.page.fill('#acPara', 'La de repuesto está lisa');
  await t.page.click('#acPrimario');
  log('Carlos pide una compra: queda por autorizar, con su rol, y aviso para la Jefe', await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')); const c = Object.values(d.compras).find(x => x.que === 'Llanta de repuesto para el ABC 123'); return c && c.estado === 'pedido' && c.pideRol === 'conductor' && c.historial.length === 1 && Object.values(d.avisos).some(a => a.para === 'jefe' && /Llanta de repuesto/.test(a.texto)); }));
  log('la compra aparece en «Tus compras pedidas»', await hasta(t.page, () => /Tus compras pedidas \(1\)/.test(document.getElementById('invContenido').textContent)));
  await t.page.click('#btnPedirMaterial');
  await t.page.waitForSelector('#shAccion:not([hidden])');
  await t.page.click('#acPrimario');
  log('Pedir material sin decir para qué no deja guardar', await hasta(t.page, () => !document.getElementById('acErr').hidden && /para qué/.test(document.getElementById('acErr').textContent)));
  await t.page.selectOption('#acArt', 'ar-018'); await t.page.fill('#acCant', '1'); await t.page.fill('#acPara', 'Revisar llantas de noche');
  await t.page.click('#acPrimario');
  log('Conductor pide una linterna: queda en sus pedidos', await hasta(t.page, () => document.getElementById('shAccion').hidden && /Tus pedidos de material \(2\)/.test(document.getElementById('invContenido').textContent)));
  const solNueva = await t.page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).solicitudes).find(s => s.paraQue === 'Revisar llantas de noche'));
  log('el pedido se guardó con quién lo pide y en espera', solNueva && solNueva.pide === 'Carlos Pinto' && solNueva.pideRol === 'conductor' && solNueva.estado === 'pendiente' && solNueva.articuloId === 'ar-018', JSON.stringify(solNueva));
  console.log('4a. Gerente (Ricardo): ve todo a detalle y solo autoriza lo que pide la Jefe');
  log('cambia a Ricardo Fuentes (Gerente)', await cambiar(t.page, 'gerente'));
  await t.page.click('.tab[data-vista="inicio"]');
  await esp(900);
  log('el Gerente ve 7 cifras: agotados o bajos, por autorizar (1), en curso, sin autorizar, actas de equipos, documentos de carros y próximas reuniones', (await t.page.locator('#sumInicio .sum').count()) === 7 && /SOAT o técnico-mecánica/.test(await texto(t.page, '#sumInicio')) && (await cifra(t.page, 'sumInicio', 1)) === 1 && /Compras en curso/.test(await texto(t.page, '#sumInicio')) && /Próximas reuniones/.test(await texto(t.page, '#sumInicio')), await texto(t.page, '#sumInicio'));
  log('el Gerente ve todos los módulos (ninguno con candado)', (await t.page.locator('#modulosLista .modulo.bloqueado').count()) === 0);
  await t.page.click('.tab[data-vista="inventario"]');
  log('Inventario del Gerente: Resumen, Compras, Existencias y Pedidos (sin tareas, movimientos ni conteo)', await hasta(t.page, () => [...document.querySelectorAll('#invSecciones [data-sec]')].map(b => b.dataset.sec).join(',') === 'resumen,compras,existencias,solicitudes'));
  log('el Gerente no pide material; solo puede «Hacer una compra» (nace autorizada)', await t.page.locator('#btnPedirMaterial').isHidden() && await t.page.locator('#btnPedirCompra').isVisible() && (await texto(t.page, '#btnPedirCompraTxt')) === 'Hacer una compra');
  log('en el Resumen le toca autorizar solo la compra de Ana (no la de Carlos ni la de Sofía)', await hasta(t.page, () => /Te toca a ti \(1\)/.test(document.getElementById('invContenido').textContent) && document.querySelectorAll('#invContenido [data-accion="autorizar"]').length === 1 && !!document.querySelector('#invContenido [data-accion="autorizar"][data-id="co-002"]')));
  await t.page.screenshot({ path: path.join(CAPTURAS, '04-inventario-gerente.png'), fullPage: true });
  await t.page.click('#invContenido [data-accion="autorizar"][data-id="co-002"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.click('#acPrimario');
  log('el Gerente autoriza el mouse de Ana: pasa a Compras con aviso a Luis y a Ana', await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')); const c = d.compras['co-002']; return c.estado === 'autorizado' && c.autoriza === 'Ricardo Fuentes' && c.historial.some(h => h.texto === 'Autorizó la compra' && h.por === 'Ricardo Fuentes') && Object.values(d.avisos).some(a => a.para === 'compras' && /autorizó comprar/.test(a.texto)) && Object.values(d.avisos).some(a => a.para === 'jefe' && /autorizó tu compra/.test(a.texto)); }));
  await t.page.click('#invSecciones [data-sec="existencias"]');
  log('el Gerente ve las existencias sin botones de bodega', await hasta(t.page, () => document.querySelectorAll('#invContenido .card.art').length === 18 && !document.querySelector('#invContenido [data-accion="nuevoart"], #invContenido [data-accion="entrada"]')));
  await t.page.click('#invContenido [data-accion="verart"][data-id="ar-004"]');
  log('el detalle del artículo no muestra movimientos sueltos ni botones', await hasta(t.page, () => !document.getElementById('shAccion').hidden && /Hay/.test(document.getElementById('acCampos').textContent) && !/Últimos movimientos/.test(document.getElementById('acCampos').textContent) && !document.querySelector('#acCampos [data-accion]')));
  await t.page.keyboard.press('Escape');
  await t.page.click('#invSecciones [data-sec="compras"]');
  log('el Gerente ve las compras a detalle pero no registra compras', await hasta(t.page, () => document.querySelectorAll('#invContenido [data-accion="vercompra"]').length > 0 && !document.querySelector('#invContenido [data-accion="sinaut"]')));
  await t.page.click('#invSecciones [data-sec="solicitudes"]');
  log('el Gerente ve los pedidos de material de todos', await hasta(t.page, () => /Jorge Ibarra/.test(document.getElementById('invContenido').textContent) && !document.querySelector('#invContenido [data-accion="entregar"]')));

  await t.page.click('.tab[data-vista="vehiculos"]');
  log('Vehículos del Gerente: Resumen, Reportes, Carros y Novedades, con el costo del mes', await hasta(t.page, () => [...document.querySelectorAll('#vehSecciones [data-sec]')].map(b => b.dataset.sec).join(',') === 'resumen,reportes,carros,novedades' && /Costo de novedades este mes/.test(document.getElementById('vehContenido').textContent)), await texto(t.page, '#vehContenido'));
  await t.page.click('#vehSecciones [data-sec="reportes"]');
  await t.page.click('#vehContenido [data-periodo="todo"]');
  log('Reportes del Gerente: por carro (4), por conductor y salidas con km recorridos', await hasta(t.page, () => { const x = document.getElementById('vehContenido').textContent; return document.querySelectorAll('#vehContenido .card[data-accion="ver"]').length === 4 && /Por conductor/.test(x) && /Carlos Pinto/.test(x) && /Salidas y llegadas \(2\)/.test(x) && /100 km en/.test(x) && /todavía no llega/.test(x); }), await texto(t.page, '#vehContenido'));
  await t.page.screenshot({ path: path.join(CAPTURAS, '06b-reportes-gerente.png'), fullPage: true });
  const [excelVeh] = await Promise.all([t.page.waitForEvent('download', { timeout: 15000 }).catch(() => null), t.page.click('#vehContenido [data-accion="excelveh"]')]);
  log('el Gerente descarga el Excel de vehículos', !!excelVeh && /^Vehiculos demo .*\.xlsx$/.test(excelVeh.suggestedFilename()), excelVeh ? excelVeh.suggestedFilename() : 'sin descarga');
  await t.page.click('#vehSecciones [data-sec="novedades"]');
  log('el Gerente ve las novedades con su foto pero no puede revisarlas ni reportar', await hasta(t.page, () => document.querySelectorAll('#vehContenido .nov-foto').length === 3 && !document.querySelector('#vehContenido [data-accion="revisar"], #vehContenido [data-accion="novedad"]')));
  await t.page.click('.tab[data-vista="inventario"]');

  console.log('4b. Compras (Luis): hace las compras');
  log('cambia a Luis Rodríguez (Compras)', await cambiar(t.page, 'compras'));
  log('Luis se queda en Inventario porque también lo puede ver', !(await t.page.locator('#vInventario').isHidden()));
  await t.page.click('.tab[data-vista="inicio"]');
  await esp(900);
  log('Luis ve 3 cifras: compras por hacer (2), sin autorizar y sus tareas de reuniones', (await t.page.locator('#sumInicio .sum').count()) === 3 && (await cifra(t.page, 'sumInicio', 0)) === 2 && /Tareas de reuniones para ti/.test(await texto(t.page, '#sumInicio')), await texto(t.page, '#sumInicio'));
  log('la insignia de Inventario dice 2 (las 2 compras autorizadas por hacer)', (await texto(t.page, '[data-badge="inventario"]')) === '2');
  await t.page.click('#btnAvisos');
  log('la campana muestra 3 avisos (resmas autorizadas, el mouse que autorizó el Gerente y el de todos)', await hasta(t.page, () => document.querySelectorAll('#avisosLista .aviso-it').length === 3 && /mouse/i.test(document.getElementById('avisosLista').textContent)));
  log('al abrirla la insignia queda en 0', await hasta(t.page, () => document.getElementById('badgeAvisos').hidden));
  await t.page.keyboard.press('Escape');
  await t.page.click('.tab[data-vista="inventario"]');
  log('Luis tiene botones para comprar y ninguno para autorizar', await hasta(t.page, () => document.querySelectorAll('#invContenido [data-accion="comprar"]').length === 2 && !document.querySelector('#invContenido [data-accion="autorizar"]')));
  await t.page.click('#btnPedirCompra'); await t.page.waitForSelector('#shAccion:not([hidden])');
  log('Compras «hace» una compra (no la pide) y le dice que la autoriza la Jefe', (await texto(t.page, '#btnPedirCompraTxt')) === 'Hacer una compra' && (await texto(t.page, '#acT')) === 'Hacer una compra' && /Ana P\./.test(await texto(t.page, '#acSub')) && /autorizar/.test(await texto(t.page, '#acPrimario')), await texto(t.page, '#acT'));
  await t.page.fill('#acQue', 'Silla de oficina'); await t.page.fill('#acCant', '1'); await t.page.fill('#acValor', '380000'); await t.page.fill('#acPara', 'La mía está rota');
  await t.page.click('#acPrimario');
  log('la compra de Luis queda por autorizar con aviso a la Jefe', await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')); const c = Object.values(d.compras).find(x => x.que === 'Silla de oficina'); return c && c.estado === 'pedido' && c.pideRol === 'compras' && Object.values(d.avisos).some(a => a.para === 'jefe' && /Silla de oficina/.test(a.texto)); }));
  await t.page.click('#invContenido [data-accion="comprar"][data-id="co-002"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.click('#acPrimario');
  log('Luis registra la compra del mouse: queda comprada y le avisa a Sofía para recibirla', await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')); const c = d.compras['co-002']; return c.estado === 'comprado' && c.valorReal > 0 && c.proveedor && c.historial.some(h => /Compró en/.test(h.texto) && h.por === 'Luis Rodríguez') && Object.values(d.avisos).some(a => a.para === 'asistente' && /hay que recibirla/.test(a.titulo)); }));
  await t.page.click('#invContenido [data-accion="comprar"][data-id="co-003"]');
  await t.page.waitForSelector('#shAccion:not([hidden])');
  await t.page.setInputFiles('#acFoto', path.join(RAIZ, 'iconos', 'control-512.png'));
  log('la foto de la factura se achica y se ve antes de guardar', await hasta(t.page, () => !document.getElementById('acFotoVer').hidden && /^data:image\/jpeg/.test(document.getElementById('acFotoVer').src)));
  await t.page.click('#acPrimario');
  log('la compra guarda la foto de la factura', await hasta(t.page, () => /^data:image\/jpeg;base64,/.test(JSON.parse(localStorage.getItem('__fb_datos')).compras['co-003'].factura || '')));
  await t.page.click('#invSecciones [data-sec="compras"]');
  log('Luis puede registrar una compra hecha sin autorización', await hasta(t.page, () => !!document.querySelector('#invContenido [data-accion="sinaut"]')));
  await t.page.click('#invSecciones [data-sec="hacer"]');

  console.log('4c. La Jefe autoriza');
  log('cambia a Ana Pérez (Jefe)', await cambiar(t.page, 'jefe'));
  await t.page.click('.tab[data-vista="inventario"]');
  await t.page.click('#invSecciones [data-sec="hacer"]');
  const coSilla = await t.page.evaluate(() => Object.entries(JSON.parse(localStorage.getItem('__fb_datos')).compras).find(([, c]) => c.que === 'Silla de oficina')[0]);
  const coLlanta = await t.page.evaluate(() => Object.entries(JSON.parse(localStorage.getItem('__fb_datos')).compras).find(([, c]) => /Llanta/.test(c.que))[0]);
  log('la Jefe tiene por autorizar las botas, la llanta de Carlos y la silla de Luis', await hasta(t.page, ids => ids.every(i => document.querySelector(`#invContenido [data-accion="autorizar"][data-id="${i}"]`)), ['co-001', coLlanta, coSilla]));
  await t.page.click(`#invContenido [data-accion="autorizar"][data-id="${coLlanta}"]`);
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.click('#acPrimario');
  log('la Jefe autoriza la llanta: aviso a Luis para comprarla y a Carlos', await hasta(t.page, i => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.compras[i].estado === 'autorizado' && d.compras[i].autoriza === 'Ana Pérez' && Object.values(d.avisos).some(a => a.para === 'compras' && /Llanta/.test(a.texto)) && Object.values(d.avisos).some(a => a.para === 'conductor' && /autorizó tu compra/.test(a.texto)); }, coLlanta));
  await t.page.click('#invContenido [data-accion="rechazar"][data-id="co-001"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.click('#acPrimario');
  log('rechazar sin motivo no deja guardar', await hasta(t.page, () => !document.getElementById('acErr').hidden));
  await t.page.keyboard.press('Escape');

  console.log('4d. Bodega (Sofía)');
  log('cambia a Sofía Herrera (Bodega)', await cambiar(t.page, 'asistente'));
  await t.page.click('.tab[data-vista="inventario"]');
  log('Sofía ve sus tareas con botones (pedir, entregar, recibir) y ya no compra', await hasta(t.page, () => ['pedir', 'entregar', 'recibir'].every(a => document.querySelector(`#invContenido [data-accion="${a}"]`)) && !document.querySelector('#invContenido [data-accion="comprar"]')));
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
  await t.page.click('#invContenido [data-accion="recibir"][data-id="co-002"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.click('#acPrimario');
  log('Sofía recibe el mouse que compró Luis y le avisa a Ana', await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.compras['co-002'].estado === 'recibido' && Object.values(d.avisos).some(a => a.para === 'jefe' && /Llegó tu compra/.test(a.titulo)); }));
  // Entrada y salida
  await t.page.click('#invSecciones [data-sec="movimientos"]');
  const guantes0 = await art('ar-004');
  await t.page.click('#invContenido [data-accion="entrada"]'); await t.page.waitForSelector('#shAccion:not([hidden])');
  await t.page.selectOption('#acArt', 'ar-004'); await t.page.fill('#acCant', '3'); await t.page.fill('#acPersona', 'Paola Ríos');
  await t.page.click('#acPrimario');
  log('una devolución suma a la bodega', await hasta(t.page, x => JSON.parse(localStorage.getItem('__fb_datos')).articulos['ar-004'].cantidad === x, guantes0 + 3));
  await t.page.click('#invContenido [data-accion="salida"]'); await t.page.waitForSelector('#shAccion:not([hidden])');
  await t.page.selectOption('#acArt', 'ar-004'); await t.page.fill('#acCant', '1'); await t.page.selectOption('#acMotivoMov', 'dano');
  await t.page.click('#acPrimario');
  log('daño o pérdida pide la nota', await hasta(t.page, () => !document.getElementById('acErr').hidden && /nota/.test(document.getElementById('acErr').textContent)));
  await t.page.fill('#acNota', 'Se rompieron en campo'); await t.page.click('#acPrimario');
  log('la salida por daño resta y le avisa a la Jefe', await hasta(t.page, x => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.articulos['ar-004'].cantidad === x && Object.values(d.avisos).some(a => a.para === 'jefe' && /daño o pérdida/.test(a.texto)); }, guantes0 + 2));
  // Conteo físico
  await t.page.click('#invSecciones [data-sec="conteo"]');
  await t.page.click('#invContenido [data-accion="conteo"]'); await t.page.waitForSelector('#shAccion:not([hidden])');
  const cafe0 = await art('ar-017');
  await t.page.fill('#cn-ar-017', String(cafe0 - 2)); await t.page.click('#acPrimario');
  log('el conteo con diferencia pide el motivo', await hasta(t.page, () => !document.getElementById('acErr').hidden && /motivo/.test(document.getElementById('acErr').textContent)));
  await t.page.fill('#acMotivo', 'Se usaron en la reunión'); await t.page.click('#acPrimario');
  log('el conteo ajusta la cantidad y deja el ajuste', await hasta(t.page, x => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.articulos['ar-017'].cantidad === x && Object.values(d.movimientos).some(m => m.tipo === 'ajuste' && m.articuloId === 'ar-017' && m.cantidad === -2 && m.saldo === x); }, cafe0 - 2));
  // Artículo nuevo
  await t.page.click('#invSecciones [data-sec="existencias"]');
  await t.page.click('#invContenido [data-accion="nuevoart"]'); await t.page.waitForSelector('#shAccion:not([hidden])');
  await t.page.fill('#acNom', 'Guantes de nitrilo talla M'); await t.page.selectOption('#acUni', 'cajas'); await t.page.fill('#acCantIni', '4'); await t.page.fill('#acMin', '5'); await t.page.fill('#acMax', '3'); await t.page.fill('#acCosto', '18000');
  await t.page.click('#acPrimario');
  log('el máximo menor que el mínimo no deja guardar', await hasta(t.page, () => /máximo debe ser mayor/.test(document.getElementById('acErr').textContent)));
  await t.page.fill('#acMax', '12'); await t.page.click('#acPrimario');
  log('el artículo nuevo entra a la bodega con su movimiento inicial (y sale bajo del mínimo)', await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')); const a = Object.entries(d.articulos).find(([, x]) => x.nombre === 'Guantes de nitrilo talla M'); return a && a[1].cantidad === 4 && Object.values(d.movimientos).some(m => m.articuloId === a[0] && m.motivo === 'inicial'); }) && /Guantes de nitrilo talla M/.test(await texto(t.page, '#invContenido')));
  await t.page.click('#invSecciones [data-sec="hacer"]');
  await t.page.screenshot({ path: path.join(CAPTURAS, '05-inventario-sofia.png'), fullPage: true });
  console.log('4d. Compras con varias líneas, monto del Gerente en dos pasos, sobrecosto, kárdex');
  const IMGP = path.join(RAIZ, 'iconos', 'control-512.png');
  const dI = () => t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos')));
  const compraPor = async q => Object.entries((await dI()).compras).map(([id, c]) => Object.assign({ id }, c)).find(c => q(c));
  const abrirHojaInv = async sel => { await t.page.click(sel); return hasta(t.page, () => !document.getElementById('shAccion').hidden); };
  const enviarHoja = async () => { await t.page.click('#acPrimario'); return hasta(t.page, () => document.getElementById('shAccion').hidden); };
  log('cambia a Luis Rodríguez (Compras)', await cambiar(t.page, 'compras'));
  await t.page.click('.tab[data-vista="inventario"]');
  await abrirHojaInv('#btnPedirCompra');
  await t.page.fill('#acQue', 'Taladro percutor'); await t.page.fill('#acCant', '2'); await t.page.fill('#acValor', '900000');
  await t.page.click('#acCampos [data-accion="masLinea"]');
  await t.page.selectOption('#lxArt0', 'ar-009');
  await t.page.fill('#lxCant0', '10'); await t.page.fill('#lxVal0', '300000');
  await t.page.fill('#acProvSug', 'Ferretería El Faro'); await t.page.fill('#acPara', 'Para la cuadrilla de campo');
  await t.page.setInputFiles('#acCot', [IMGP, IMGP]);
  log('las cotizaciones se achican y se ven antes de guardar (2 fotos)', await hasta(t.page, () => document.querySelectorAll('#acCotVer img').length === 2 && /^data:image\/jpeg/.test(document.querySelector('#acCotVer img').src)));
  await t.page.screenshot({ path: path.join(CAPTURAS, '09b-compra-varias-lineas.png'), fullPage: true });
  await t.page.fill('#lxVal0', '');
  await t.page.click('#acPrimario');
  log('una línea sin valor no deja guardar y dice cuál', await hasta(t.page, () => !document.getElementById('acErr').hidden && /valor total de cada artículo/.test(document.getElementById('acErr').textContent)));
  await t.page.fill('#lxVal0', '300000');
  log('guarda la compra de 2 artículos', await enviarHoja());
  const cv = await compraPor(c => c.que === 'Taladro percutor y 1 más');
  log('la compra queda con sus 2 líneas, el total de 1.200.000, las 2 cotizaciones y la marca de quien la pidió', cv && cv.lineas.length === 2 && cv.valorAprox === 1200000 && cv.cotizaciones.length === 2 && cv.proveedorSug === 'Ferretería El Faro' && cv.estado === 'pedido' && cv.articuloId === '' && cv.lineas[1].articuloId === 'ar-009' && !!cv.pideUid, JSON.stringify(cv && { q: cv.que, n: cv.lineas && cv.lineas.length, v: cv.valorAprox, e: cv.estado }));
  await t.page.click('#invSecciones [data-sec="compras"]');
  log('en Compras sale «2 artículos»', await hasta(t.page, () => /2 artículos/.test(document.getElementById('invContenido').textContent)));

  log('cambia a Ana Pérez (Jefe)', await cambiar(t.page, 'jefe'));
  await t.page.click('.tab[data-vista="inventario"]'); await t.page.click('#invSecciones [data-sec="hacer"]');
  await abrirHojaInv(`#invContenido [data-accion="autorizar"][data-id="${cv.id}"]`);
  log('al autorizar, la Jefe ve cada artículo con su precio, el total, a quién se compra, las cotizaciones y el monto del Gerente', await t.page.evaluate(() => { const x = document.getElementById('acCampos').textContent; return /Taladro percutor/.test(x) && /Juego|Cinta aislante|Quede|Total aprox/.test(x) && /Ferretería El Faro/.test(x) && /Cotizaciones \(2\)/.test(x) && /Monto del Gerente/.test(x) && /pasa al Gerente/.test(x) && document.querySelectorAll('#acCampos .cot-mini img').length === 2; }), await texto(t.page, '#acCampos'));
  await t.page.screenshot({ path: path.join(CAPTURAS, '09c-autorizar-detalle.png'), fullPage: true });
  log('el botón dice «Autorizar y pasar al Gerente»', (await texto(t.page, '#acPrimario')).includes('Autorizar y pasar al Gerente'));
  await enviarHoja();
  const cv2 = await (async () => { await hasta(t.page, id => JSON.parse(localStorage.getItem('__fb_datos')).compras[id].estado === 'por-gerente', cv.id); return compraPor(c => c.id === cv.id); })();
  log('la compra de 1.200.000 queda «por-gerente» (no autorizada) con quién la autorizó y aviso al Gerente', cv2.estado === 'por-gerente' && cv2.autorizaJefe === 'Ana Pérez' && cv2.autoriza === '' && Object.values((await dI()).avisos).some(a => a.para === 'gerente' && /Taladro percutor/.test(a.texto)));
  log('Compras todavía no la puede comprar (falta el Gerente)', !(await (async () => { await cambiar(t.page, 'compras'); await t.page.click('.tab[data-vista="inventario"]'); await t.page.click('#invSecciones [data-sec="hacer"]'); return visible(t.page, `#invContenido [data-accion="comprar"][data-id="${cv.id}"]`); })()));

  log('cambia a Ricardo Fuentes (Gerente)', await cambiar(t.page, 'gerente'));
  await t.page.click('.tab[data-vista="inventario"]');
  log('el Gerente ve «Te toca a ti» con la compra del segundo paso', await hasta(t.page, id => !!document.querySelector(`#invContenido [data-accion="autorizar"][data-id="${id}"]`) && /Autorizar \(segundo paso\)/.test(document.getElementById('invContenido').textContent) && /La Jefe ya la autorizó/.test(document.getElementById('invContenido').textContent), cv.id));
  log('el Gerente ve su monto y que con la persona de prueba no lo cambia', /1\.000\.000/.test(await texto(t.page, '#invContenido')) && /la persona de prueba no puede/.test(await texto(t.page, '#invContenido')) && !(await visible(t.page, '#invContenido [data-accion="monto"]')));
  await abrirHojaInv(`#invContenido [data-accion="autorizar"][data-id="${cv.id}"]`);
  log('el Gerente ve la tabla completa antes de decidir', await t.page.evaluate(() => /Cantidad/.test(document.getElementById('acCampos').textContent) && /Cada uno/.test(document.getElementById('acCampos').textContent) && /1\.200\.000/.test(document.getElementById('acCampos').textContent) && /La Jefe ya la autorizó/.test(document.getElementById('acSub').textContent)));
  await enviarHoja();
  log('el Gerente autoriza y ahora sí queda «autorizado», con las dos firmas y aviso a Compras', await hasta(t.page, id => { const d = JSON.parse(localStorage.getItem('__fb_datos')), c = d.compras[id]; return c.estado === 'autorizado' && c.autoriza === 'Ricardo Fuentes' && c.autorizaJefe === 'Ana Pérez' && Object.values(d.avisos).some(a => a.para === 'compras' && /Taladro percutor/.test(a.texto)); }, cv.id));

  // El Gerente también puede pedir una compra: nace autorizada.
  await abrirHojaInv('#btnPedirCompra');
  await t.page.fill('#acQue', 'Cafetera para sala'); await t.page.fill('#acCant', '1'); await t.page.fill('#acValor', '250000'); await t.page.fill('#acPara', 'Para la sala de reuniones');
  await enviarHoja();
  const cg = await (async () => { await hasta(t.page, () => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).compras).some(c => c.que === 'Cafetera para sala')); return compraPor(c => c.que === 'Cafetera para sala'); })();
  log('la compra que pide el Gerente nace autorizada, marcada como suya, con aviso a Compras y a la Jefe', cg.estado === 'autorizado' && cg.pideRol === 'gerente' && cg.autoriza === 'Ricardo Fuentes' && Object.values((await dI()).avisos).some(a => a.para === 'compras' && /Cafetera/.test(a.texto)) && Object.values((await dI()).avisos).some(a => a.para === 'jefe' && /Gerente pidió/.test(a.titulo)));

  // Compras registra la compra de 1.200.000 pagando de más; la Jefe y el Gerente se enteran.
  log('cambia a Luis Rodríguez (Compras)', await cambiar(t.page, 'compras'));
  await t.page.click('.tab[data-vista="inventario"]'); await t.page.click('#invSecciones [data-sec="hacer"]');
  await abrirHojaInv(`#invContenido [data-accion="comprar"][data-id="${cv.id}"]`);
  await t.page.fill('#acProv', 'Ferretería El Faro'); await t.page.fill('#acValor', '1500000');
  await enviarHoja();
  log('pagar 1.500.000 de 1.200.000 deja el aviso «Pagaron más de lo autorizado» para la Jefe y el Gerente, y queda en el historial', await hasta(t.page, id => { const d = JSON.parse(localStorage.getItem('__fb_datos')), c = d.compras[id]; const av = Object.values(d.avisos).filter(a => /Pagaron más/.test(a.titulo)); return c.estado === 'comprado' && /25 % más/.test(c.historial[c.historial.length - 1].texto) && av.some(a => a.para === 'jefe') && av.some(a => a.para === 'gerente'); }, cv.id));
  await t.page.click('#invSecciones [data-sec="compras"]');
  log('en Compras la tarjeta dice «Pagó 25 % más de lo autorizado»', await hasta(t.page, () => /Pagó 25 % más de lo autorizado/.test(document.getElementById('invContenido').textContent)));

  // Sofía recibe la compra de 2 artículos: lo que va a bodega se suma solo.
  log('cambia a Sofía Herrera (Bodega)', await cambiar(t.page, 'asistente'));
  await t.page.click('.tab[data-vista="inventario"]'); await t.page.click('#invSecciones [data-sec="hacer"]');
  const cinta0 = (await dI()).articulos['ar-009'].cantidad;
  await abrirHojaInv(`#invContenido [data-accion="recibir"][data-id="${cv.id}"]`);
  log('para recibir pide cuánto llegó de cada artículo y dice cuál va a bodega', await t.page.evaluate(() => document.querySelectorAll('#acCampos input[id^="rl"]').length === 2 && /Se suma a la bodega/.test(document.getElementById('acCampos').textContent) && /No va a bodega/.test(document.getElementById('acCampos').textContent)));
  await t.page.fill('#rl1', '8'); await t.page.fill('#acQuien', 'Luis Rodríguez');
  await enviarHoja();
  log('llegaron 8 de 10 cintas: se suman 8 a la bodega, queda su movimiento y la compra pasa a recibida', await hasta(t.page, ([id, c0]) => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.compras[id].estado === 'recibido' && d.articulos['ar-009'].cantidad === c0 + 8 && Object.values(d.movimientos).some(m => m.compraId === id && m.articuloId === 'ar-009' && m.cantidad === 8 && /Llegaron 8 de 10/.test(m.nota)); }, [cv.id, cinta0]));
  log('y la Jefe recibe el aviso «Llegó menos de lo comprado»', Object.values((await dI()).avisos).some(a => a.para === 'jefe' && /Llegó menos/.test(a.titulo)));

  // Kárdex y mínimo sugerido (la Jefe).
  log('cambia a Ana Pérez (Jefe)', await cambiar(t.page, 'jefe'));
  await t.page.click('.tab[data-vista="inventario"]'); await t.page.click('#invSecciones [data-sec="panorama"]');
  log('el Panorama de la Jefe avisa de la compra pagada con más de lo autorizado', await hasta(t.page, () => /compra pagada con más de lo autorizado/.test(document.getElementById('invContenido').textContent) && /Taladro percutor y 1 más \(\+25 %\)/.test(document.getElementById('invContenido').textContent)));
  await t.page.click('#invSecciones [data-sec="existencias"]');
  await t.page.locator('#invContenido [data-accion="verart"][data-id="ar-009"]').click();
  log('el detalle del artículo trae el kárdex', await hasta(t.page, () => !document.getElementById('shAccion').hidden && !!document.querySelector('#acCampos [data-accion="kardex"]')));
  await t.page.click('#acCampos [data-accion="kardex"]');
  log('el kárdex lista cada movimiento con lo que quedó, incluida la entrada de 8', await hasta(t.page, () => /Kárdex: Cinta aislante/.test(document.getElementById('acT').textContent) && /Compra recibida/.test(document.getElementById('acCampos').textContent) && document.querySelectorAll('#acCampos .lineas-tabla tbody tr').length >= 1 && /\+8/.test(document.getElementById('acCampos').textContent)));
  const [descK] = await Promise.all([t.page.waitForEvent('download', { timeout: 15000 }).catch(() => null), t.page.click('#acCampos [data-accion="excelkardex"]')]);
  log('descarga el Excel de ese artículo', !!descK && /^Kardex Cinta aislante .*\.xlsx$/.test(descK.suggestedFilename()), descK && descK.suggestedFilename());
  await t.page.keyboard.press('Escape');
  await t.page.locator('#invContenido [data-accion="verart"][data-id="ar-004"]').click();
  log('un artículo que sale seguido muestra cuánto sale y el mínimo sugerido', await hasta(t.page, () => !document.getElementById('shAccion').hidden && /En los últimos 30 días salieron/.test(document.getElementById('acCampos').textContent) && /mínimo de \d+ alcanza para unos 10 días/.test(document.getElementById('acCampos').textContent), await texto(t.page, '#acCampos')));
  await t.page.keyboard.press('Escape');
  console.log('4e. Vehículos por rol: Conductor, Bodega y Jefe');
  const dat = () => t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos')));
  const IMG = path.join(RAIZ, 'iconos', 'control-512.png');
  const abiertaVeh = () => t.page.waitForSelector('#shVeh:not([hidden])');
  const guardarVeh = async () => { await t.page.click('#vePrimario'); return hasta(t.page, () => document.getElementById('shVeh').hidden); };
  const errVeh = re => hasta(t.page, r => !document.getElementById('veErr').hidden && new RegExp(r).test(document.getElementById('veErr').textContent), re.source);
  const cincoFotos = async () => { for (const k of ['frente', 'atras', 'izquierda', 'derecha', 'llantas']) await t.page.setInputFiles('#vf_' + k, IMG); return hasta(t.page, () => { const im = [...document.querySelectorAll('#veCampos .fotos-grid img')]; return im.length === 5 && im.every(i => !i.hidden); }); };
  const LLANTA = 'La llanta delantera derecha está baja';
  log('cambia a Carlos (Conductor)', await cambiar(t.page, 'conductor'));
  await t.page.click('.tab[data-vista="vehiculos"]');
  log('el Conductor ve sus 2 viajes: el ABC 123 espera la llegada y el JKL 012 está listo para salir', await hasta(t.page, () => /Viajes de reuniones \(2\)/.test(document.getElementById('vehContenido').textContent) && /El carro está en uso/.test(document.getElementById('vehContenido').textContent) && !!document.querySelector('#vehContenido [data-accion="salida"][data-viaje="ne-025"]')), await texto(t.page, '#vehContenido'));
  log('el Conductor no tiene botones de revisar ni de documentos', !(await t.page.$('#vehContenido [data-accion="revisar"], #vehContenido [data-accion="docs"]')) && (await t.page.locator('#vehSecciones [data-sec="resumen"]').count()) === 0);
  await t.page.click('#vehContenido [data-accion="novedad"]'); await abiertaVeh();
  await t.page.selectOption('#vnVeh', 've-jkl012'); await t.page.selectOption('#vnTipo', 'llanta'); await t.page.fill('#vnKm', '21340'); await t.page.fill('#vnDesc', LLANTA);
  log('el Conductor no pone el costo de la novedad', !(await t.page.$('#vnCosto')));
  await t.page.click('#vePrimario');
  log('sin foto no deja reportar la novedad', await errVeh(/Falta la foto/));
  await t.page.setInputFiles('#vnFoto', IMG); await hasta(t.page, () => !document.getElementById('vnFotoVer').hidden);
  log('con la foto, la novedad queda sin revisar, en 0 pesos y con aviso para Jefe, Transporte, Bodega y Gerente', await guardarVeh() && await (async () => { const d = await dat(); const n = Object.values(d.novedades).find(x => x.descripcion === LLANTA); return !!n && n.reportaRol === 'conductor' && n.costo === 0 && !n.revisada && /^data:image\/jpeg;base64,/.test(n.foto) && n.foto.length < 400000 && ['jefe', 'carros', 'asistente', 'gerente'].every(r => Object.values(d.avisos).some(a => a.para === r && /Novedad/.test(a.titulo))); })());
  await t.page.click('#vehContenido [data-accion="salida"][data-viaje="ne-025"]'); await abiertaVeh();
  log('la salida del viaje es con Rafael (el conductor que escogió la Jefe)', /Comunidad Ejemplo Norte/.test(await texto(t.page, '#veSub')) && !(await t.page.$('#vsCond')));
  await t.page.fill('#vsKm', '21300'); await t.page.click('#vePrimario');
  log('un kilometraje menor que el último no deja guardar', await errVeh(/no puede ser menor/));
  await t.page.fill('#vsKm', '21350'); await t.page.click('#vePrimario');
  log('sin las 5 fotos no deja guardar', await errVeh(/Faltan fotos/));
  log('se cargan las 5 fotos (frente, atrás, lados y llantas)', await cincoFotos());
  await t.page.evaluate(() => { document.getElementById('vr_luces').checked = false; }); await t.page.click('#vePrimario');
  log('si marca un problema y no lo cuenta, pide la observación', await errVeh(/observaciones/));
  await t.page.fill('#vsObs', 'Una luz trasera no prende');
  log('la salida queda: JKL 012 en uso con Rafael, ligada a la reunión, con sus fotos, y la Jefe sabe del problema', await guardarVeh() && await (async () => { const d = await dat(); const e = Object.values(d.entregas).find(x => x.vehiculoId === 've-jkl012' && x.tipo === 'salida'); const v = d.vehiculos['ve-jkl012']; return !!e && e.reunionId === 're-001' && e.conductor === 'Rafael Ospino' && e.revision.luces === false && Object.values(e.fotos).length === 5 && Object.values(e.fotos).every(f => /^data:image\/jpeg/.test(f) && f.length < 200000) && v.estado === 'en-uso' && v.km === 21350 && v.conductor === 'Rafael Ospino' && Object.values(d.avisos).some(a => a.para === 'jefe' && /problemas/.test(a.titulo)); })());
  log('el viaje ahora pide registrar la llegada', await hasta(t.page, () => !!document.querySelector('#vehContenido [data-accion="llegada"][data-viaje="ne-025"]')));
  await t.page.click('#vehContenido [data-accion="llegada"][data-viaje="ne-025"]'); await abiertaVeh();
  await t.page.fill('#vsKm', '21420'); await cincoFotos();
  await t.page.screenshot({ path: path.join(CAPTURAS, '07-llegada-conductor.png'), fullPage: true });
  log('la llegada deja el carro disponible con el kilometraje nuevo y el viaje sale de la lista', await guardarVeh() && await (async () => { const d = await dat(); const v = d.vehiculos['ve-jkl012']; return v.estado === 'disponible' && v.km === 21420 && v.conductor === '' && Object.values(d.entregas).filter(x => x.vehiculoId === 've-jkl012').length === 2; })() && await hasta(t.page, () => !document.querySelector('#vehContenido [data-viaje="ne-025"]') && /Viajes de reuniones \(1\)/.test(document.getElementById('vehContenido').textContent)));
  log('cambia a Sofía (Bodega)', await cambiar(t.page, 'asistente'));
  await t.page.click('.tab[data-vista="vehiculos"]');
  const idLlanta = Object.entries((await dat()).novedades).find(([, x]) => x.descripcion === LLANTA)[0];
  log('Bodega ve las 2 novedades por revisar (el rayón y la llanta)', await hasta(t.page, i => /Novedades por revisar \(2\)/.test(document.getElementById('vehContenido').textContent) && !!document.querySelector(`#vehContenido [data-accion="revisar"][data-id="${i}"]`), idLlanta), await texto(t.page, '#vehContenido'));
  await t.page.click(`#vehContenido [data-accion="revisar"][data-id="${idLlanta}"]`); await abiertaVeh();
  await t.page.fill('#vrCosto', '60000'); await t.page.fill('#vrNota', 'Se infló y se revisó la válvula');
  log('Bodega revisa la novedad con costo y nota, y al Conductor le llega el aviso', await guardarVeh() && await (async () => { const d = await dat(); const n = d.novedades[idLlanta]; return n.revisada && n.costo === 60000 && n.revisadaPor === 'Sofía Herrera' && /válvula/.test(n.nota) && Object.values(d.avisos).some(a => a.para === 'conductor' && /Revisaron/.test(a.titulo)); })());
  await t.page.click('#vehSecciones [data-sec="carros"]');
  await t.page.click('#vehContenido [data-accion="ver"][data-id="ve-def456"]'); await abiertaVeh();
  await t.page.click('#veCampos [data-accion="estado"][data-id="ve-def456"]');
  await hasta(t.page, () => /al taller/.test(document.getElementById('veT').textContent));
  await t.page.fill('#veMotivo', 'Revisión de frenos');
  log('Bodega manda el DEF 456 al taller y vuelve a su hoja de vida', await guardarVeh() && (await dat()).vehiculos['ve-def456'].estado === 'en-taller' && await hasta(t.page, () => !document.getElementById('shVeh').hidden && /DEF 456/.test(document.getElementById('veT').textContent) && /En taller/.test(document.getElementById('veCampos').textContent) && /Entró al taller: Revisión de frenos/.test(document.getElementById('veCampos').textContent)));
  await t.page.click('#veCampos [data-accion="estado"][data-id="ve-def456"]');
  await hasta(t.page, () => /salió del taller/.test(document.getElementById('veT').textContent));
  log('y cuando sale del taller queda disponible', await guardarVeh() && await hasta(t.page, () => JSON.parse(localStorage.getItem('__fb_datos')).vehiculos['ve-def456'].estado === 'disponible'));
  await hasta(t.page, () => !document.getElementById('shVeh').hidden); await t.page.keyboard.press('Escape');
  log('cambia a Ana (Jefe)', await cambiar(t.page, 'jefe'));
  await t.page.click('.tab[data-vista="vehiculos"]'); await t.page.click('#vehSecciones [data-sec="hacer"]');
  await t.page.click('#vehContenido [data-accion="docs"][data-id="ve-def456"]'); await abiertaVeh();
  const tecnoNueva = await t.page.evaluate(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); });
  await t.page.fill('#vdTecno', tecnoNueva);
  log('la Jefe actualiza la técnico-mecánica del DEF 456 y sale de los vencidos', await guardarVeh() && (await dat()).vehiculos['ve-def456'].tecno === tecnoNueva && await hasta(t.page, () => /Documentos por vencer o vencidos \(1\)/.test(document.getElementById('vehContenido').textContent)));
  await t.page.click('#vehContenido [data-accion="revisar"][data-id="no-001"]'); await abiertaVeh();
  await t.page.fill('#vrNota', 'Se pulió en el taller');
  log('la Jefe revisa el rayón y ya no quedan novedades por revisar', await guardarVeh() && (await dat()).novedades['no-001'].revisada === true && await hasta(t.page, () => /Novedades por revisar \(0\)/.test(document.getElementById('vehContenido').textContent)));
  await t.page.screenshot({ path: path.join(CAPTURAS, '08-vehiculos-jefe.png'), fullPage: true });


  console.log('4f. Equipos: actas virtuales con firma, Recibidos, agenda y revisión de Soporte');
  const guardarEq = async () => { await t.page.click('#eqPrimario'); return hasta(t.page, () => document.getElementById('shEq').hidden); };
  const errEq = re => hasta(t.page, r => !document.getElementById('eqErr').hidden && new RegExp(r).test(document.getElementById('eqErr').textContent), re.source);
  const abiertaEq = () => t.page.waitForSelector('#shEq:not([hidden])');
  const firmar = async sel => {
    await t.page.evaluate(q => document.querySelector(q).scrollIntoView({ block: 'center' }), sel); await esp(150);
    const b = await t.page.locator(sel).boundingBox();
    await t.page.mouse.move(b.x + 20, b.y + b.height / 2); await t.page.mouse.down();
    for (let k = 1; k <= 20; k++) await t.page.mouse.move(b.x + 20 + k * (b.width - 40) / 20, b.y + b.height / 2 + Math.sin(k) * b.height / 4);
    await t.page.mouse.up();
  };
  log('cambia a Daniel (Encargado de equipos)', await cambiar(t.page, 'equipos'));
  await t.page.click('.tab[data-vista="equipos"]');
  log('Daniel ve Entregar y Recibir, los 3 Recibidos, el acta con problema y su agenda', await hasta(t.page, () => !document.getElementById('eqBotones').hidden && /Recibidos: mantenimiento y backup \(3\)/.test(document.getElementById('eqContenido').textContent) && !!document.querySelector('#eqContenido [data-accion="corregir"][data-id="ac3"]') && !document.querySelector('#eqContenido [data-accion="revisar"]')));
  await t.page.click('#eqContenido [data-accion="mtto"][data-id="eq-010"]'); await abiertaEq();
  await t.page.fill('#ehNota', 'Tecla arreglada y limpieza general');
  log('Daniel registra el mantenimiento del DEMO-0010', await guardarEq() && await hasta(t.page, () => { const e = JSON.parse(localStorage.getItem('__fb_datos')).equipos['eq-010']; return e.pendientes.mtto === false && e.pendientes.backup === true && /Tecla arreglada/.test(e.historial[e.historial.length - 1].nota); }));
  await t.page.click('#eqContenido [data-accion="backup"][data-id="eq-010"]'); await abiertaEq();
  await t.page.fill('#ehNota', 'Documentos al disco de backup');
  await guardarEq();
  await t.page.click('#eqContenido [data-accion="abodega"][data-id="eq-010"]'); await abiertaEq();
  log('con mantenimiento y backup listos, el DEMO-0010 pasa a bodega', await guardarEq() && await hasta(t.page, () => { const e = JSON.parse(localStorage.getItem('__fb_datos')).equipos['eq-010']; return e.estado === 'bodega' && e.asignadoA === '' && e.ultimoBackup && e.ultimoMtto; }));
  await t.page.click('#btnEntregar'); await abiertaEq();
  log('el acta tiene los campos de la hoja: fecha, cédula, nombre, proyecto, código, equipos, otros y firma', await hasta(t.page, () => ['ehFecha', 'ehCedula', 'ehPersona', 'ehProy', 'ehCodigo', 'ehFirmaP'].every(i => document.getElementById(i)) && document.querySelectorAll('#eqCampos input[data-otro]').length === 10 && document.getElementById('ehCodigo').value === 'PCN-01'));
  await t.page.fill('#ehPersona', 'Rosa Prueba Gómez'); await t.page.fill('#ehCedula', '1060708090');
  await t.page.locator('#ehEq_eq-007').check({ force: true });
  log('al marcar el portátil se abren sus observaciones y se suma el cargador en «Otros»', await hasta(t.page, () => !document.querySelector('[data-fila="eq-007"] .eq-acta-det').hidden && document.querySelector('input[data-otro="Cargador"]').value === '1' && document.getElementById('ehFirmaPCC').textContent === '1060708090'));
  await t.page.fill('#ehObs_eq-007', 'ThinkPad con su funda'); await t.page.fill('#ehOt_7', '1');
  await t.page.click('#eqPrimario');
  log('sin la firma de quien recibe no deja guardar el acta', await errEq(/firma de quien recibe/));
  await firmar('#ehFirmaP');
  await t.page.screenshot({ path: path.join(CAPTURAS, '13-acta-virtual.png'), fullPage: true });
  log('el acta se guarda como AC-0007 con sus datos, otros y la firma; el equipo queda asignado y Soporte recibe el aviso', await guardarEq() && await (async () => { const d = await dat(); const h = Object.values(d.hojas).find(x => x.persona === 'Rosa Prueba Gómez'); const e = d.equipos['eq-007']; const hid = Object.keys(d.hojas).find(k => d.hojas[k] === h); return !!h && hid === 'ac7' && h.numero === 7 && h.codigoProyecto === 'PCN-01' && h.equipos[0].obs === 'ThinkPad con su funda' && JSON.stringify(h.otros) === '[{"nombre":"Morral","cantidad":1},{"nombre":"Cargador","cantidad":1}]' && /^data:image\/png;base64,/.test(h.firmaPersona) && h.firmaPersona.length < 80000 && h.revision === 'pendiente' && Array.isArray(h.devoluciones) && !h.devoluciones.length && !h.foto && e.asignadoCedula === '1060708090' && e.estado === 'asignado' && e.asignadoA === 'Rosa Prueba Gómez' && e.historial[e.historial.length - 1].hojaId && Object.values(d.avisos).some(a => a.para === 'soporte' && /Acta de entrega/.test(a.titulo)); })());
  await t.page.click('#btnDevolver'); await abiertaEq();
  await t.page.selectOption('#ehQuien', '1020304050');
  log('en la devolución salen los equipos de esa persona por acta, ya marcados, y su cédula', await hasta(t.page, () => !!document.querySelector('#ehEqD_eq-001') && document.querySelector('#ehEqD_eq-001').checked && document.querySelector('#ehEqD_eq-001').dataset.hoja === 'ac1' && document.getElementById('ehFirmaPCC').textContent === '1020304050' && /AC-0001/.test(document.getElementById('ehLista').textContent)));
  await t.page.fill('#ehObsD_eq-001', 'Bisagra floja');
  await t.page.click('#eqPrimario');
  log('sin la firma de quien devuelve no deja guardar', await errEq(/firma de quien devuelve/));
  await firmar('#ehFirmaP');
  log('la devolución se anota en la misma acta (fecha y firma) y el equipo queda en Recibidos', await guardarEq() && await (async () => { const d = await dat(); const e = d.equipos['eq-001'], h = d.hojas.ac1; return h.devoluciones.length === 1 && h.devoluciones[0].equipos[0] === 'eq-001' && /^data:image\/png/.test(h.devoluciones[0].firma) && h.revision === 'pendiente' && e.estado === 'recibido' && e.pendientes.mtto && e.pendientes.backup && /Bisagra floja/.test(e.obs) && e.historial.slice(-1)[0].hojaId === 'ac1'; })(), await texto(t.page, '#eqErr') + ' | ' + JSON.stringify(Object.values((await dat()).hojas).map(x => [x.numero, x.tipo, x.persona])));
  await t.page.click('#eqContenido [data-accion="corregir"][data-id="ac3"]'); await abiertaEq();
  await t.page.fill('#ehCedula', '1040506071');
  log('Daniel corrige el acta con problema (también queda corregida en el equipo) y vuelve a Soporte', await guardarEq() && await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.hojas.ac3.revision === 'pendiente' && d.hojas.ac3.cedula === '1040506071' && d.equipos['eq-005'].asignadoCedula === '1040506071'; }));
  await t.page.click('#eqContenido [data-accion="hecha"][data-id="ta-001"]'); await abiertaEq();
  await t.page.fill('#ehNota', 'Batería revisada y equipo limpio');
  log('Daniel marca hecha la tarea de la agenda y se actualiza el mantenimiento del equipo', await guardarEq() && await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.tareasEq['ta-001'].estado === 'hecha' && d.equipos['eq-002'].historial.slice(-1)[0].tipo === 'mantenimiento' && Object.values(d.avisos).some(a => a.para === 'soporte' && /hecho/.test(a.titulo)); }));
  log('cambia a Valentina (Soporte, revisa actas)', await cambiar(t.page, 'soporte'));
  await t.page.click('.tab[data-vista="equipos"]');
  log('Valentina tiene 6 actas por revisar y no tiene botones de entregar', await hasta(t.page, () => /Actas por revisar \(6\)/.test(document.getElementById('eqContenido').textContent) && document.getElementById('eqBotones').hidden), await texto(t.page, '#eqContenido'));
  await t.page.click('#eqContenido [data-accion="revisar"][data-id="ac4"]'); await abiertaEq();
  log('al revisar ve el acta igual a la hoja: datos, tabla de equipos y otros, firma de entrega y de devolución', await hasta(t.page, () => { const x = document.getElementById('eqCampos').textContent; return !!document.querySelector('#eqCampos .acta-doc') && document.querySelectorAll('#eqCampos .acta-firma img').length === 2 && /ENTREGA DE EQUIPOS Y HERRAMIENTAS/.test(x) && /COMPUTADORA PORTÁTIL/.test(x) && /DEMO-0010/.test(x) && /FECHA DE DEVOLUCIÓN/.test(x) && /OTROS/.test(x) && /MORRAL/.test(x); }));
  log('Valentina marca bien el acta', await guardarEq() && await hasta(t.page, () => { const h = JSON.parse(localStorage.getItem('__fb_datos')).hojas.ac4; return h.revision === 'ok' && h.revisadaPor === 'Valentina Ruiz'; }));
  const idRosa = Object.entries((await dat()).hojas).find(([, x]) => x.persona === 'Rosa Prueba Gómez')[0];
  await t.page.click(`#eqContenido [data-accion="revisar"][data-id="${idRosa}"]`); await abiertaEq();
  await t.page.locator('input[name="ehRev"][value="problema"]').check({ force: true });
  await t.page.click('#eqPrimario');
  log('si tiene un problema, pide decir qué está mal', await errEq(/qué está mal/));
  await t.page.fill('#ehNotaRev', 'Falta el cargo completo');
  log('el acta queda con problema y al Encargado le llega el aviso', await guardarEq() && await hasta(t.page, i => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.hojas[i].revision === 'problema' && /cargo/.test(d.hojas[i].notaRevision) && Object.values(d.avisos).some(a => a.para === 'equipos' && /problema/.test(a.titulo)); }, idRosa));
  await t.page.click('#eqContenido [data-accion="programar"]'); await abiertaEq();
  await t.page.selectOption('#ehEq', 'eq-009'); await t.page.selectOption('#ehTipo', 'backup'); await t.page.fill('#ehNota', 'Revisar que las copias abran');
  log('Valentina le programa un backup al Encargado', await guardarEq() && await hasta(t.page, () => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).tareasEq).some(x => x.equipoId === 'eq-009' && x.tipo === 'backup' && x.pidio === 'Valentina Ruiz' && x.estado === 'pendiente')));
  await t.page.click('#eqSecciones [data-sec="actas"]');
  await t.page.click('#eqContenido [data-accion="veracta"][data-id="ac2"]'); await abiertaEq();
  log('cualquier acta se puede imprimir o guardar en PDF', await hasta(t.page, () => !!document.querySelector('#eqCampos [data-accion="imprimir"]') && /AC-0002/.test(document.getElementById('eqCampos').textContent)));
  await t.page.screenshot({ path: path.join(CAPTURAS, '14-acta-documento.png'), fullPage: true });
  await t.page.keyboard.press('Escape');
  await t.page.click('#eqSecciones [data-sec="personas"]');
  await t.page.click('#eqContenido [data-accion="persona"][data-clave="1030405060"]'); await abiertaEq();
  log('el historial por persona muestra sus equipos y sus actas', await hasta(t.page, () => /Equipos que tiene \(1\)/.test(document.getElementById('eqCampos').textContent) && /Actas \(2\)/.test(document.getElementById('eqCampos').textContent)));
  await t.page.keyboard.press('Escape');
  log('cambia a Ricardo (Gerente)', await cambiar(t.page, 'gerente'));
  await t.page.click('.tab[data-vista="equipos"]');
  log('el Gerente ve Resumen, Equipos, Actas y Personas, sin botones', await hasta(t.page, () => [...document.querySelectorAll('#eqSecciones [data-sec]')].map(b => b.dataset.sec).join(',') === 'resumen,equipos,actas,personas' && document.getElementById('eqBotones').hidden && document.getElementById('btnNuevoEq').hidden && /Actas este mes/.test(document.getElementById('eqContenido').textContent)));
  await t.page.click('.tab[data-vista="inicio"]');

  log('cambia de nuevo a Luis Rodríguez', await cambiar(t.page, 'compras'));
  await t.page.reload();
  log('al recargar sigue con Luis, y la campana trae los 4 avisos nuevos (llanta, taladro, cafetera y «Llegó tu compra»)', await hasta(t.page, () => document.getElementById('avatarTop').classList.contains('av-compras') && document.getElementById('badgeAvisos').textContent === '4', null, 8000), await texto(t.page, '#badgeAvisos'));

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

  console.log('5b. Cuentas propias: invitaciones por Excel, correo confirmado, Google y permisos por persona');
  const salir = async () => { await t.page.click('#btnPersona'); await t.page.waitForSelector('#shPersona:not([hidden])'); await t.page.click('#btnSalir'); return hasta(t.page, () => !document.getElementById('vEntrada').hidden); };
  const salirCuenta = async () => { await t.page.click('#cuSalir'); return hasta(t.page, () => !document.getElementById('vEntrada').hidden); };
  const aCuenta = async crear => { await t.page.click('#entradaModo [data-modo="cuenta"]'); const esCrear = /Crear/.test(await texto(t.page, '#ctBoton')); if (esCrear !== crear) await t.page.click('#ctCambiar'); };
  const crearCuenta = async (correo, clave, o = {}) => {
    await aCuenta(true); await t.page.fill('#ctCorreo', correo); await t.page.fill('#ctClave', clave);
    if (o.codigo) { await t.page.evaluate(() => { document.getElementById('ctCodigoD').open = true; }); await t.page.fill('#ctNombre', o.nombre || 'Persona Prueba'); await t.page.fill('#ctCodigo', o.codigo); }
    await t.page.click('#ctBoton');
  };
  const entrarCuenta = async (correo, clave) => { await aCuenta(false); await t.page.fill('#ctCorreo', correo); await t.page.fill('#ctClave', clave); await t.page.click('#ctBoton'); };
  const enApp = rolTxt => hasta(t.page, r => !document.getElementById('vInicio').hidden && document.getElementById('rolTop').textContent === r, rolTxt);
  const pideConfirmar = () => hasta(t.page, () => !document.getElementById('vCuenta').hidden && /Confirma tu correo/.test(document.getElementById('tCuenta').textContent));
  // Simula tocar el enlace del correo y luego el botón «Ya toqué el enlace».
  const confirmar = async correo => { await t.page.evaluate(c => window.__fbConfirmar(c), correo); await t.page.click('#cuYa'); };
  const abrirPanel = async () => { await t.page.click('#btnPersona'); await t.page.waitForSelector('#shPersona:not([hidden])'); await t.page.click('#btnGente'); return hasta(t.page, () => !document.getElementById('shGente').hidden && /Agregar personas con un Excel/.test(document.getElementById('genteCuerpo').textContent)); };
  const fb = () => t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos')));
  const correos = () => t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_correos') || '[]'));
  const perfilDe = async correo => Object.entries((await fb()).usuarios || {}).map(([id, u]) => Object.assign({ id }, u)).find(u => u.correo === correo);
  // Excel: se crea y se lee con el mismo lector que carga la página (SheetJS).
  const xlsxCrear = (filas, ruta) => t.page.evaluate(async f => { const X = await window.Inventario.cargarXlsx(), l = X.utils.book_new(); X.utils.book_append_sheet(l, X.utils.json_to_sheet(f), 'Personas'); return X.write(l, { type: 'base64', bookType: 'xlsx' }); }, filas).then(b => fs.writeFileSync(ruta, Buffer.from(b, 'base64')));
  const xlsxLeer = ruta => t.page.evaluate(async b => { const X = await window.Inventario.cargarXlsx(), l = X.read(b, { type: 'base64' }); return { hojas: l.SheetNames, filas: X.utils.sheet_to_json(l.Sheets[l.SheetNames[0]]) }; }, fs.readFileSync(ruta).toString('base64'));

  log('cambia a Ricardo Fuentes (Gerente de prueba)', await cambiar(t.page, 'gerente'));
  await t.page.click('#btnPersona'); await t.page.waitForSelector('#shPersona:not([hidden])');
  log('el Gerente de prueba NO tiene «Personas y permisos» (su clave es pública)', !(await visible(t.page, '#ajustesGente')));
  await t.page.keyboard.press('Escape');
  log('cambia a Ana Pérez (Jefe de prueba)', await cambiar(t.page, 'jefe'));
  await t.page.click('#btnPersona'); await t.page.waitForSelector('#shPersona:not([hidden])');
  log('la Jefe de prueba tampoco tiene «Personas y permisos» (su clave es pública)', !(await visible(t.page, '#ajustesGente')));
  await t.page.keyboard.press('Escape');
  // Jeiler crea a mano en Firebase el primer código de Jefe (así lo haría en la consola).
  await t.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')); d.codigosDireccion = { 'JEF-PRUE-BA23': { rol: 'jefe', activo: true, por: 'consola', en: new Date().toISOString() } }; localStorage.setItem('__fb_datos', JSON.stringify(d)); });
  await salir();

  // --- La primera Jefe: clave de 10 o más, correo confirmado ---
  await crearCuenta('jefa.real@ejemplo.test', 'corta-123', { nombre: 'Jefa Real', codigo: 'JEF-PRUE-BA23' });
  await t.page.screenshot({ path: path.join(CAPTURAS, '08a-entrada-crear-cuenta.png'), fullPage: true });
  log('una clave de menos de 10 caracteres no se acepta', await hasta(t.page, () => /10 caracteres/.test(document.getElementById('ctErr').textContent) && !document.getElementById('ctErr').hidden));
  await t.page.fill('#ctClave', 'clave-jefa-12345'); await t.page.click('#ctBoton');
  log('al crear la cuenta pide confirmar el correo y no deja ver la app', await pideConfirmar() && await t.page.locator('#tabs').isHidden() && !(await visible(t.page, '#cuentaForm')), await texto(t.page, '#vCuenta'));
  log('a su correo llegó el enlace para confirmar', (await correos()).some(c => c.tipo === 'confirmar' && c.correo === 'jefa.real@ejemplo.test'));
  await t.page.screenshot({ path: path.join(CAPTURAS, '08-confirmar-correo.png') });
  await t.page.click('#cuYa');
  log('si todavía no tocó el enlace, la app se lo dice', await hasta(t.page, () => !document.getElementById('cuConfErr').hidden && /Todavía no aparece confirmado/.test(document.getElementById('cuConfErr').textContent)));
  await t.page.click('#cuReenviar');
  log('puede pedir que le reenvíen el correo', await hasta(t.page, () => JSON.parse(localStorage.getItem('__fb_correos') || '[]').filter(c => c.tipo === 'confirmar' && c.correo === 'jefa.real@ejemplo.test').length === 2));
  await confirmar('jefa.real@ejemplo.test');
  log('al confirmar el correo, el código de Jefe la deja entrar como Jefe', await enApp('Jefe'));
  log('el código de Jefe se gastó (sirve una sola vez)', !((await fb()).codigosDireccion || {})['JEF-PRUE-BA23']);
  log('la Jefe con cuenta propia no tiene «Reiniciar los datos de prueba»', await (async () => { await t.page.click('#btnPersona'); await t.page.waitForSelector('#shPersona:not([hidden])'); const r = !(await visible(t.page, '#ajustesJefe')); await t.page.keyboard.press('Escape'); return r; })());
  log('la Jefe abre «Personas y permisos»', await abrirPanel());
  log('el panel trae el Excel, las personas, los códigos y la seguridad', await t.page.evaluate(() => { const x = document.getElementById('genteCuerpo').textContent; return /Descargar plantilla/.test(x) && /Subir Excel/.test(x) && /Personas registradas/.test(x) && /Códigos por rol/.test(x) && /Personas de prueba: encendidas/.test(x); }));

  // --- Excel: plantilla y subida con filas buenas y malas ---
  const [descPlantilla] = await Promise.all([t.page.waitForEvent('download', { timeout: 15000 }).catch(() => null), t.page.click('#genteCuerpo [data-g="plantilla"]')]);
  log('descPlantilla la plantilla de Excel con personas inventadas', !!descPlantilla && descPlantilla.suggestedFilename() === 'Plantilla personas.xlsx', descPlantilla && descPlantilla.suggestedFilename());
  if (descPlantilla) { const ruta = path.join(CAPTURAS, 'plantilla-descPlantillada.xlsx'); await descPlantilla.saveAs(ruta); const l = await xlsxLeer(ruta); log('la plantilla trae 3 ejemplos con el correo example.com y una hoja de ayuda', l.filas.length === 3 && l.filas.every(x => /@example\.com$/.test(x.Correo)) && l.hojas.includes('Ayuda')); }
  const rutaXlsx = path.join(CAPTURAS, 'personas-de-prueba.xlsx');
  await xlsxCrear([
    { Nombre: ' Gina   Gerente ', 'Correo electrónico': 'GINA.Gerente@ejemplo.test', Cargo: 'Gerente' },
    { Nombre: 'Bruno Bodega', Correo: 'bruno.bodega@ejemplo.test', Rol: 'Bodeguero', Equipos: 'Solo ver' },
    { Nombre: 'Nora Admin', Correo: 'nora.admin@ejemplo.test', Rol: 'Administrativa', Extras: 'encargada' },
    { Nombre: 'Mario Prueba', Correo: 'mario.prueba@ejemplo.test', Rol: 'Logística' },
    { Nombre: 'Mario Repetido', Correo: 'mario.prueba@ejemplo.test', Rol: 'Logística' },
    { Nombre: 'Rol Malo', Correo: 'rol.malo@ejemplo.test', Rol: 'Presidente' },
    { Nombre: '=1+1', Correo: 'formula@ejemplo.test', Rol: 'Conductor' }
  ], rutaXlsx);
  await t.page.setInputFiles('#genteArchivo', rutaXlsx);
  log('al subir el Excel muestra lo que entendió: 4 listas y 3 con problema', await hasta(t.page, () => /4 listas para guardar/.test(document.getElementById('genteCuerpo').textContent) && /3 con problema/.test(document.getElementById('genteCuerpo').textContent)), await texto(t.page, '#genteCuerpo'));
  log('marca el correo repetido, el rol que no entiende y el nombre con fórmula', await t.page.evaluate(() => { const x = document.getElementById('genteCuerpo').textContent; return /repetido en el Excel/.test(x) && /No entendí el rol «Presidente»/.test(x) && /no puede empezar con/.test(x); }));
  log('todavía no guardó nada', !Object.keys((await fb()).invitaciones || {}).length);
  await t.page.screenshot({ path: path.join(CAPTURAS, '07-panel-excel.png'), fullPage: true });
  await t.page.click('#genteCuerpo [data-g="guardarinv"]');
  log('«Guardar» deja 4 invitaciones, una por correo en minúscula', await hasta(t.page, () => Object.keys(JSON.parse(localStorage.getItem('__fb_datos')).invitaciones || {}).sort().join() === 'bruno.bodega@ejemplo.test,gina.gerente@ejemplo.test,mario.prueba@ejemplo.test,nora.admin@ejemplo.test'));
  const inv = (await fb()).invitaciones;
  log('la invitación de Bruno lleva su rol, el permiso «Equipos: solo ver» y el nombre limpio', inv['bruno.bodega@ejemplo.test'].rol === 'asistente' && inv['bruno.bodega@ejemplo.test'].permisos.equipos === 'ver' && inv['gina.gerente@ejemplo.test'].nombre === 'Gina Gerente' && inv['gina.gerente@ejemplo.test'].rol === 'gerente', JSON.stringify(inv['bruno.bodega@ejemplo.test']));
  log('las invitaciones quedan en la lista del panel para borrarlas', await hasta(t.page, () => /Invitaciones esperando que la persona entre \(4\)/.test(document.getElementById('genteCuerpo').textContent)));
  await t.page.keyboard.press('Escape'); await salir();

  // --- Bruno: primera vez con correo y clave; entra con lo que dijo la invitación ---
  await crearCuenta('bruno.bodega@ejemplo.test', 'clave-bruno-12345');
  log('Bruno confirma su correo y entra como Bodega, sin escribir ningún código', await pideConfirmar() && (await confirmar('bruno.bodega@ejemplo.test'), await enApp('Bodega')));
  const pBruno = await perfilDe('bruno.bodega@ejemplo.test');
  log('su perfil sale de la invitación (nombre, rol y permiso) y la invitación se gastó', pBruno && pBruno.nombre === 'Bruno Bodega' && pBruno.rol === 'asistente' && pBruno.codigo === 'invitacion' && pBruno.permisos.equipos === 'ver' && !(await fb()).invitaciones['bruno.bodega@ejemplo.test'], JSON.stringify(pBruno));
  log('con «Equipos: solo ver» Bruno ve la pestaña Equipos y no ve Vehículos de Transporte', await t.page.evaluate(() => !document.querySelector('.tab[data-vista="equipos"]').hidden));
  await t.page.click('.tab[data-vista="equipos"]'); await esp(500);
  log('en Equipos de Bruno no hay botones para entregar ni recibir', !(await visible(t.page, '#vEquipos [data-accion="entrega"], #vEquipos [data-accion="nuevo"], #vEquipos [data-eq="entregar"]')));
  await t.page.click('.tab[data-vista="inicio"]'); await salir();

  // --- Nora: primera vez con Google (el correo ya viene confirmado) ---
  await aCuenta(false);
  await t.page.evaluate(() => { window.__fbGoogle = { correo: 'nora.admin@ejemplo.test' }; });
  await t.page.click('#ctGoogle');
  log('Nora entra con Google y queda como Administrativo sin confirmar nada', await enApp('Administrativo'));
  const pNora = await perfilDe('nora.admin@ejemplo.test');
  log('el perfil de Nora trae el permiso extra de la invitación', pNora && JSON.stringify(pNora.extras) === '["encargada"]' && pNora.codigo === 'invitacion', JSON.stringify(pNora));
  await t.page.click('.tab[data-vista="reuniones"]');
  log('Nora encargada ve todas las tareas y la sección Correos', await hasta(t.page, () => !!document.querySelector('#reuSecciones [data-sec="correos"]') && /Le toca a/.test(document.getElementById('reuContenido').textContent)));
  await t.page.click('.tab[data-vista="inicio"]'); await salir();

  // --- Gina: Gerente por invitación. Mario: Logística ---
  await crearCuenta('gina.gerente@ejemplo.test', 'clave-gina-12345'); await pideConfirmar(); await confirmar('gina.gerente@ejemplo.test');
  log('Gina entra como Gerente por invitación', await enApp('Gerente'));
  await t.page.click('#btnPersona'); await t.page.waitForSelector('#shPersona:not([hidden])');
  log('el Gerente con cuenta propia ya NO ve «Personas y permisos»', await visible(t.page, '#cuentaPropia') && !(await visible(t.page, '#ajustesGente')));
  await t.page.keyboard.press('Escape'); await salir();
  await crearCuenta('mario.prueba@ejemplo.test', 'clave-mario-12345'); await pideConfirmar(); await confirmar('mario.prueba@ejemplo.test');
  log('Mario entra como Logística y se llama Mario P.', await enApp('Logística') && (await texto(t.page, '#nombreTop')) === 'Mario P.', await texto(t.page, '#rolTop'));
  await esp(900);
  log('Logística ve en Inicio sus próximas reuniones y no ve Equipos ni Vehículos', /Próximas reuniones/.test(await texto(t.page, '#sumInicio')) && await t.page.evaluate(() => document.querySelector('.tab[data-vista="equipos"]').hidden && document.querySelector('.tab[data-vista="vehiculos"]').hidden && !document.querySelector('.tab[data-vista="reuniones"]').hidden));
  log('Logística ve su aviso de la reunión en la campana', (await texto(t.page, '#badgeAvisos')) === '2');
  await t.page.click('#btnPersona'); await t.page.waitForSelector('#shPersona:not([hidden])');
  log('en el menú de persona sale «Tu cuenta» y no «Personas y permisos»', await visible(t.page, '#cuentaPropia') && !(await visible(t.page, '#ajustesGente')));
  await t.page.keyboard.press('Escape'); await salir();

  // --- Quien no está invitado no entra, ni con clave ni con Google ---
  await crearCuenta('intruso@ejemplo.test', 'clave-intruso-12345'); await pideConfirmar(); await confirmar('intruso@ejemplo.test');
  log('un correo sin invitación queda en «Tu correo no está en la lista» y no ve la app', await hasta(t.page, () => !document.getElementById('vCuenta').hidden && /no está en la lista/.test(document.getElementById('tCuenta').textContent) && !document.getElementById('cuentaForm').hidden) && await t.page.locator('#tabs').isHidden(), await texto(t.page, '#vCuenta'));
  await t.page.screenshot({ path: path.join(CAPTURAS, '08b-sin-invitacion.png') });
  await salirCuenta();
  await aCuenta(false); await t.page.evaluate(() => { window.__fbGoogle = { correo: 'otro.intruso@ejemplo.test' }; }); await t.page.click('#ctGoogle');
  log('con Google, un correo sin invitación tampoco entra', await hasta(t.page, () => !document.getElementById('vCuenta').hidden && /no está en la lista/.test(document.getElementById('tCuenta').textContent)));
  await salirCuenta();
  await aCuenta(false); await t.page.evaluate(() => { window.__fbGoogle = undefined; }); await t.page.click('#ctGoogle');
  log('si cierra la ventana de Google, la app dice qué hacer', await hasta(t.page, () => /Cerraste la ventana de Google/.test(document.getElementById('ctErr').textContent)));
  await t.page.fill('#ctCorreo', 'mario.prueba@ejemplo.test'); await t.page.click('#ctOlvide');
  log('«Olvidé mi clave» manda el correo de cambio de clave', await hasta(t.page, () => JSON.parse(localStorage.getItem('__fb_correos') || '[]').some(c => c.tipo === 'clave' && c.correo === 'mario.prueba@ejemplo.test')));

  // --- La Jefe cambia permisos por persona, pausa y apaga las personas de prueba ---
  await entrarCuenta('jefa.real@ejemplo.test', 'clave-jefa-12345'); await enApp('Jefe'); await abrirPanel();
  const uidBruno = pBruno.id, uidMario = (await perfilDe('mario.prueba@ejemplo.test')).id, uidGina = (await perfilDe('gina.gerente@ejemplo.test')).id;
  log('la Jefe ve a las personas registradas', await hasta(t.page, () => /Bruno Bodega/.test(document.getElementById('genteCuerpo').textContent) && /Mario Prueba/.test(document.getElementById('genteCuerpo').textContent) && /Nora Admin/.test(document.getElementById('genteCuerpo').textContent)));
  log('al Gerente no se le cambia nada desde la app', await t.page.evaluate(i => !document.querySelector(`#genteCuerpo [data-g="rol"][data-id="${i}"]`) && !document.querySelector(`#genteCuerpo [data-g="pausar"][data-id="${i}"]`) && !document.querySelector(`#genteCuerpo [data-g="permiso"][data-id="${i}"]`), uidGina));
  log('cada persona (no Gerente) trae un nivel para cada módulo', await t.page.evaluate(i => ['equipos', 'inventario', 'vehiculos', 'reuniones'].every(m => !!document.getElementById(`pm-${i}-${m}`)), uidBruno));
  await t.page.selectOption(`#pm-${uidBruno}-inventario`, 'ver');
  log('la Jefe le pone a Bruno «Inventario: solo ver» y queda guardado junto al de Equipos', await hasta(t.page, i => { const p = JSON.parse(localStorage.getItem('__fb_datos')).usuarios[i].permisos; return p && p.inventario === 'ver' && p.equipos === 'ver'; }, uidBruno));
  await t.page.selectOption(`#pm-${uidBruno}-equipos`, '');
  log('«Como su rol» le quita el permiso de Equipos y deja el otro', await hasta(t.page, i => { const p = JSON.parse(localStorage.getItem('__fb_datos')).usuarios[i].permisos; return p && p.inventario === 'ver' && !('equipos' in p); }, uidBruno));
  await t.page.selectOption(`#pm-${uidBruno}-inventario`, '');
  log('la Jefe le devuelve a Bruno «Inventario: como su rol» (Bodega)', await hasta(t.page, i => Object.keys(JSON.parse(localStorage.getItem('__fb_datos')).usuarios[i].permisos || {}).length === 0, uidBruno));
  const uidNora = (await perfilDe('nora.admin@ejemplo.test')).id;
  await t.page.selectOption(`#pm-${uidNora}-inventario`, 'ver');
  log('y a Nora le pone «Inventario: solo ver»', await hasta(t.page, i => (JSON.parse(localStorage.getItem('__fb_datos')).usuarios[i].permisos || {}).inventario === 'ver', uidNora));
  await t.page.locator(`#genteCuerpo input[data-g="extra"][data-id="${uidBruno}"][data-x="compra"]`).check({ force: true });
  log('también le marca «También hace y recibe compras»', await hasta(t.page, i => JSON.stringify(JSON.parse(localStorage.getItem('__fb_datos')).usuarios[i].extras) === '["compra"]', uidBruno));
  await t.page.screenshot({ path: path.join(CAPTURAS, '07b-permisos-por-persona.png'), fullPage: true });
  await t.page.click(`#genteCuerpo [data-g="pausar"][data-id="${uidMario}"]`); await t.page.click('#cfSi');
  log('la Jefe pausa el acceso de Mario', await hasta(t.page, i => JSON.parse(localStorage.getItem('__fb_datos')).usuarios[i].activo === false, uidMario));
  await t.page.evaluate(() => { document.getElementById('genteCodigos').open = true; });
  await t.page.click('#genteCuerpo [data-g="crear"][data-rol="logistica"]');
  const codLog = await (async () => (await hasta(t.page, () => !!document.querySelector('#genteCuerpo [data-g="copiar"][data-id^="LOG-"]'))) ? t.page.evaluate(() => document.querySelector('#genteCuerpo [data-g="copiar"][data-id^="LOG-"]').dataset.id) : '')();
  log('la Jefe crea el código de Logística (LOG-XXXX-XXXX)', /^LOG-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(codLog), codLog);
  await t.page.click('#genteCuerpo [data-g="crear"][data-rol="jefe"]');
  log('la Jefe también crea códigos de Jefe y Gerente (de un solo uso)', await hasta(t.page, () => !!document.querySelector('#genteCuerpo [data-g="copiar"][data-id^="JEF-"]') && /Sirve una sola vez/.test(document.getElementById('genteCuerpo').textContent)));
  await t.page.click('#genteCuerpo [data-g="pruebas"]'); await t.page.click('#cfSi');
  log('la Jefe apaga las personas de prueba y queda guardado', await hasta(t.page, () => { const a = (JSON.parse(localStorage.getItem('__fb_datos')).ajustesApp || {}).seguridad; return a && a.personasPrueba === false && /Personas de prueba: apagadas/.test(document.getElementById('genteCuerpo').textContent); }));
  await t.page.click('#genteCuerpo [data-g="pruebas"]'); await t.page.click('#cfSi');
  log('y las vuelve a encender', await hasta(t.page, () => (JSON.parse(localStorage.getItem('__fb_datos')).ajustesApp || {}).seguridad.personasPrueba === true));
  await t.page.keyboard.press('Escape'); await salir();

  // --- Lo que la Jefe decidió se nota en cada persona ---
  await entrarCuenta('mario.prueba@ejemplo.test', 'clave-mario-12345');
  log('Mario entra con su clave pero le dice que su acceso está pausado', await hasta(t.page, () => !document.getElementById('vCuenta').hidden && /pausado/.test(document.getElementById('tCuenta').textContent) && document.getElementById('cuentaForm').hidden));
  await salirCuenta();
  await entrarCuenta('bruno.bodega@ejemplo.test', 'clave-bruno-12345'); await enApp('Bodega');
  await t.page.click('.tab[data-vista="inventario"]');
  log('con el permiso extra, Bruno «hace» compras', await hasta(t.page, () => document.getElementById('btnPedirCompraTxt').textContent === 'Hacer una compra'));
  await t.page.click('#btnPersona'); await t.page.waitForSelector('#shPersona:not([hidden])');
  log('en «Tus permisos» le sale el permiso extra y su nivel de Inventario', /También hace y recibe compras/.test(await texto(t.page, '#permTabla')) && /Encargada de bodega/.test(await texto(t.page, '#permTabla')), await texto(t.page, '#permTabla'));
  await t.page.keyboard.press('Escape'); await t.page.click('.tab[data-vista="inicio"]'); await salir();
  // Nora con «Inventario: solo ver»: lee todo y no puede pedir ni mover nada.
  await aCuenta(false); await t.page.evaluate(() => { window.__fbGoogle = { correo: 'nora.admin@ejemplo.test' }; }); await t.page.click('#ctGoogle'); await enApp('Administrativo');
  await t.page.click('.tab[data-vista="inventario"]');
  log('con «Inventario: solo ver» Nora ve Existencias, Movimientos, Pedidos, Compras y Resumen', await hasta(t.page, () => [...document.querySelectorAll('#invSecciones [data-sec]')].map(b => b.dataset.sec).join(',') === 'existencias,movimientos,solicitudes,compras,resumen'));
  log('y no tiene botones para pedir material ni compras', await t.page.locator('#btnPedirMaterial').isHidden() && await t.page.locator('#btnPedirCompra').isHidden());
  await t.page.click('#invSecciones [data-sec="compras"]');
  log('en Compras de Nora no hay botones para autorizar, comprar ni recibir', await hasta(t.page, () => document.querySelectorAll('#invContenido .card').length > 0) && !(await visible(t.page, '#invContenido [data-accion="autorizar"], #invContenido [data-accion="comprar"], #invContenido [data-accion="recibir"], #invContenido [data-accion="sinaut"]')));
  await t.page.click('#invSecciones [data-sec="existencias"]'); await t.page.locator('#invContenido [data-accion="verart"]').first().click();
  log('en el detalle de un artículo Nora ve el kárdex y no ve botones de entrada, salida ni pedir', await hasta(t.page, () => !document.getElementById('shAccion').hidden && !!document.querySelector('#acCampos [data-accion="kardex"]') && !document.querySelector('#acCampos [data-accion="entrada"], #acCampos [data-accion="salida"], #acCampos [data-accion="pedir"], #acCampos [data-accion="pedirmat"], #acCampos [data-accion="editart"]')));
  await t.page.keyboard.press('Escape'); await t.page.click('.tab[data-vista="inicio"]'); await salir();

  // --- El código de rol sigue sirviendo para quien no está en el Excel ---
  await crearCuenta('con.codigo@ejemplo.test', 'clave-codigo-12345', { nombre: 'Persona Con Codigo', codigo: codLog.toLowerCase().replace(/-/g, ' ') });
  log('con un código de Logística (en minúscula y con espacios) también se puede, y pide confirmar el correo', await pideConfirmar());
  await confirmar('con.codigo@ejemplo.test');
  log('al confirmar entra como Logística', await enApp('Logística'));
  await t.page.click('#btnPersona'); await t.page.waitForSelector('#shPersona:not([hidden])'); await t.page.click('#btnSalir'); await hasta(t.page, () => !document.getElementById('vEntrada').hidden);
  await t.page.click('#entradaModo [data-modo="prueba"]');
  log('vuelve a entrar como Ana Pérez (Jefe de prueba)', await entrar(t.page, 'jefe'));

  console.log('5c. Reuniones: correo, agente y tareas de cada rol');
  const reu = () => t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos')));
  const oriente = async () => { const d = await reu(); const r = Object.entries(d.reuniones).find(([, x]) => x.comunidad === 'Comunidad Ejemplo Oriente'); return r ? { id: r[0], r: r[1], ns: Object.entries(d.necesidades).filter(([, n]) => n.reunionId === r[0]).map(([id, n]) => Object.assign({ id }, n)) } : null; };
  const guardarReu = async () => { await t.page.click('#rePrimario'); return hasta(t.page, () => document.getElementById('shReu').hidden); };
  const tocarReu = async (accion, id) => { await t.page.click(`#reuContenido [data-accion="${accion}"][data-id="${id}"]`); await t.page.waitForSelector('#shReu:not([hidden])'); };
  const irReu = async sec => { await t.page.click('.tab[data-vista="reuniones"]'); if (sec) await t.page.click(`#reuSecciones [data-sec="${sec}"]`); await esp(200); };
  await irReu('correos');
  log('la Jefe ve los 4 correos de ejemplo y que el agente no está conectado', await hasta(t.page, () => document.querySelectorAll('#reuContenido .card.correo').length === 4 && /sin conectar/.test(document.getElementById('reuContenido').textContent)));
  await tocarReu('correo', 'nueva');
  log('el agente lee el correo nuevo (respaldo) y llena la reunión: comunidad, 40 personas, 2 camionetas y falta el lugar', await hasta(t.page, () => document.getElementById('rcCom') && document.getElementById('rcCom').value === 'Comunidad Ejemplo Oriente' && document.getElementById('rcAsis').value === '40' && document.getElementById('rcCarros').value === '2' && document.getElementById('rcLugar').value === '' && /respaldo/i.test(document.getElementById('reCampos').textContent)));
  await t.page.screenshot({ path: path.join(CAPTURAS, '09-correo-agente.png') });
  log('la Jefe crea la reunión y se reparten 6 tareas con su aviso', await guardarReu() && await (async () => { const o = await oriente(); const d = await reu(); return o && o.r.faltan.includes('lugar') && o.ns.length === 6 && ['compras', 'carros', 'logistica', 'profesional', 'administrativo'].every(rol => Object.values(d.avisos).some(a => a.para === rol && /Reunión nueva/.test(a.titulo))); })());
  await tocarReu('correo', 'nueva');
  log('si el mismo correo llega otra vez, no crea otra reunión', await hasta(t.page, () => /ya existe/.test(document.getElementById('reT').textContent)));
  await t.page.keyboard.press('Escape');
  await tocarReu('correo', 'faltantes');
  await hasta(t.page, () => !!document.getElementById('rcLugar'));
  log('con el correo de datos que faltaban llega el lugar y 45 personas', await guardarReu() && await (async () => { const o = await oriente(); return o.r.lugar === 'Casa de la cultura de Ejemplo Oriente' && o.r.asistentes === 45 && o.r.faltan.length === 0 && o.ns.filter(n => ['refrigerios', 'almuerzo'].includes(n.tipo)).every(n => n.cantidad === 45); })());
  let o = await oriente();
  const nec = tipo => o.ns.find(n => n.tipo === tipo && n.estado !== 'cancelado' && n.estado !== 'no-va');
  const informar = async (id, texto) => { await tocarReu('informar', id); await t.page.fill('#rcInf', texto); return guardarReu(); };
  log('cambia a Luis (Compras)', await cambiar(t.page, 'compras'));
  await irReu('proximas');
  await t.page.click('#reuContenido [data-accion="ver"][data-id="re-001"]');
  log('en «Ver reunión» Compras puede informar la comida, ve lo que dijo Bodega y no autoriza', await hasta(t.page, () => !!document.querySelector('#reCampos [data-accion="informar"][data-id="ne-003"]') && !!document.querySelector('#reCampos [data-accion="informar"][data-id="ne-004"]') && !document.querySelector('#reCampos [data-accion="autorizar"]') && /faltan 18/.test(document.getElementById('reCampos').textContent)));
  await t.page.click('#reCampos [data-accion="informar"][data-id="ne-003"]');
  await hasta(t.page, () => !!document.getElementById('rcInf'));
  await t.page.fill('#rcInf', 'Puedo comprar los 18 que faltan en Panadería La Ola.');
  await t.page.click('#rePrimario');
  log('informa desde «Ver reunión», le llega a la Jefe y vuelve a la misma reunión', await hasta(t.page, () => document.getElementById('reT').textContent === 'Comunidad Ejemplo Norte' && !document.querySelector('#reCampos [data-accion="informar"][data-id="ne-003"]') && /Panadería La Ola/.test(document.getElementById('reCampos').textContent)) && await t.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.necesidades['ne-003'].informes.length === 2 && d.necesidades['ne-003'].estado === 'pendiente' && Object.values(d.avisos).some(a => a.para === 'jefe' && /Panadería La Ola/.test(a.texto)); }));
  await t.page.screenshot({ path: path.join(CAPTURAS, '12-ver-reunion-acciones.png') });
  await t.page.keyboard.press('Escape');
  await irReu('hacer');
  log('Compras informa la comida de la reunión nueva', await informar(nec('refrigerios').id, 'No hay en bodega; se compran los 45.'));
  log('cambia a Sofía (Bodega)', await cambiar(t.page, 'asistente'));
  log('Bodega ahora ve Reuniones', !(await t.page.locator('.tab[data-vista="reuniones"]').isHidden()));
  await irReu('hacer');
  log('Bodega informa la comida y los carros', await informar(nec('almuerzo').id, 'Hay 10 almuerzos congelados; faltan 35.') && await informar(nec('carros').id, 'La ABC 123 está libre ese día.') && await (async () => { o = await oriente(); return o.ns.find(n => n.tipo === 'carros').informes.length === 1 && o.ns.find(n => n.tipo === 'almuerzo').informes[0].rol === 'asistente'; })());
  log('cambia a Marta (Transporte)', await cambiar(t.page, 'carros'));
  await irReu('hacer');
  log('Transporte informa qué carros hay', await informar(nec('carros').id, 'También está libre la DEF 456; Carlos y Rafael pueden manejar.'));
  log('cambia a Ana (Jefe)', await cambiar(t.page, 'jefe'));
  await irReu('hacer');
  log('la Jefe tiene que autorizar la comida y los carros, con lo que informaron a la vista', await hasta(t.page, ids => ids.every(i => document.querySelector(`#reuContenido [data-accion]:is([data-accion="autorizar"],[data-accion="carros"])[data-id="${i}"]`)) && /ABC 123/.test(document.getElementById('reuContenido').textContent), [nec('refrigerios').id, nec('almuerzo').id, nec('carros').id]));
  await tocarReu('autorizar', nec('refrigerios').id); await guardarReu();
  await tocarReu('autorizar', nec('almuerzo').id);
  log('la Jefe autoriza el refrigerio y el almuerzo (le avisa a Compras)', await guardarReu() && await (async () => { o = await oriente(); const d = await reu(); return ['refrigerios', 'almuerzo'].every(tp => o.ns.find(n => n.tipo === tp).estado === 'autorizado') && Object.values(d.avisos).some(a => a.para === 'compras' && /Autorizado/.test(a.titulo)); })());
  const viajeDe = c => o.ns.find(n => n.tipo === 'viaje' && n.conductor === c && !['cancelado', 'no-va'].includes(n.estado));
  await tocarReu('carros', nec('carros').id);
  log('para 2 camionetas salen solo los carros libres y al día ese día (ABC 123 y JKL 012), cada uno con su conductor', await hasta(t.page, () => !!document.getElementById('rcVeh1') && [...document.getElementById('rcVeh0').options].map(x => x.value).join(',') === 've-abc123,ve-jkl012' && document.getElementById('rcVeh1').value === 've-jkl012' && document.getElementById('rcCond1').value === 'Rafael Ospino'));
  await t.page.selectOption('#rcVeh1', 've-abc123'); await t.page.click('#rePrimario');
  log('el mismo carro dos veces no deja guardar', await hasta(t.page, () => !document.getElementById('reErr').hidden && /mismo carro/.test(document.getElementById('reErr').textContent)));
  await t.page.selectOption('#rcVeh1', 've-jkl012');
  log('la Jefe autoriza los carros: un viaje por camioneta (Carlos en el ABC 123, Rafael en el JKL 012) y le llega el aviso', await guardarReu() && await (async () => { o = await oriente(); const d = await reu(); const c = o.ns.find(n => n.tipo === 'carros'), v = viajeDe('Carlos Pinto'), w = viajeDe('Rafael Ospino'); return c.estado === 'autorizado' && c.vehiculos.length === 2 && v && v.placa === 'ABC 123' && v.vehiculoId === 've-abc123' && v.carrosId === c.id && v.estado === 'pendiente' && w && w.placa === 'JKL 012' && Object.values(d.avisos).some(a => a.para === 'conductor' && /viaje/.test(a.titulo)); })());
  log('cambia a Carlos (Conductor)', await cambiar(t.page, 'conductor'));
  await irReu('hacer');
  const viajeCarlos = viajeDe('Carlos Pinto').id;
  await tocarReu('nopuedo', viajeCarlos); await t.page.fill('#rcMotivo', 'Tengo una cita médica');
  log('el Conductor no puede: los carros vuelven a la Jefe con el motivo', await guardarReu() && await (async () => { o = await oriente(); const c = o.ns.find(n => n.tipo === 'carros'); return c.estado === 'pendiente' && /cita/.test(c.motivo) && o.ns.find(n => n.id === viajeCarlos).estado === 'no-va'; })());
  log('cambia a Ana otra vez', await cambiar(t.page, 'jefe'));
  await irReu('hacer');
  await tocarReu('carros', nec('carros').id); await t.page.selectOption('#rcCond0', 'Hernán Brito');
  log('la Jefe escoge otro conductor: Hernán en el ABC 123 y los viajes viejos se cancelan', await guardarReu() && await (async () => { o = await oriente(); const vs = o.ns.filter(n => n.tipo === 'viaje' && n.estado === 'pendiente'); return vs.length === 2 && vs.some(n => n.conductor === 'Hernán Brito' && n.placa === 'ABC 123') && vs.some(n => n.conductor === 'Rafael Ospino' && n.placa === 'JKL 012') && o.ns.filter(n => n.tipo === 'viaje' && n.estado === 'cancelado').length === 1; })());
  log('cambia a Pedro (Logística)', await cambiar(t.page, 'logistica'));
  await irReu('hacer');
  await tocarReu('logistica', nec('logistica').id);
  const nItems = await t.page.locator('#reCampos input[type="checkbox"]').count();
  await t.page.locator('#reCampos input[type="checkbox"]').first().check();
  log('Logística marca una cosa y la tarea sigue pendiente', await guardarReu() && await (async () => { o = await oriente(); const l = o.ns.find(n => n.tipo === 'logistica'); return l.estado === 'pendiente' && l.items.filter(x => x.ok).length === 1; })());
  await tocarReu('logistica', nec('logistica').id);
  for (let k = 0; k < nItems; k++) await t.page.locator('#reCampos input[type="checkbox"]').nth(k).check();
  log('Logística marca todo y la reunión queda alistada', await guardarReu() && await (async () => { o = await oriente(); return o.ns.find(n => n.tipo === 'logistica').estado === 'listo'; })());
  log('cambia a Laura (Profesional)', await cambiar(t.page, 'profesional'));
  await irReu('hacer');
  await tocarReu('voy', nec('asistencia').id);
  log('el Profesional confirma que va', await guardarReu() && await (async () => { o = await oriente(); return o.ns.find(n => n.tipo === 'asistencia').estado === 'listo'; })());
  log('cambia a Natalia (Administrativo)', await cambiar(t.page, 'administrativo'));
  await irReu('hacer');
  log('Administrativo tiene el acta de la reunión de ayer y no la de la reunión futura', await hasta(t.page, () => document.querySelectorAll('#reuContenido [data-accion="acta"]').length === 1 && /Occidente/.test(document.getElementById('reuContenido').textContent)));
  await tocarReu('acta', 'ne-024');
  await t.page.fill('#rcAsis', '23'); await t.page.fill('#rcFin', '13:00'); await t.page.fill('#rcObs', 'Se socializó el proyecto y se acordó otra visita.');
  await t.page.click('#rePrimario');
  log('la hora de cierre antes del inicio no deja guardar', await hasta(t.page, () => !document.getElementById('reErr').hidden && /cierre/.test(document.getElementById('reErr').textContent)));
  await t.page.fill('#rcFin', '16:30');
  await t.page.setInputFiles('#rcFoto', path.join(RAIZ, 'iconos', 'control-512.png'));
  await hasta(t.page, () => !document.getElementById('rcFotoVer').hidden);
  log('el acta se guarda con la foto y la reunión queda realizada', await guardarReu() && await (async () => { const d = await reu(); return d.necesidades['ne-024'].estado === 'listo' && d.necesidades['ne-024'].acta.asistentes === 23 && /^data:image\/jpeg/.test(d.necesidades['ne-024'].acta.foto) && d.reuniones['re-004'].estado === 'realizada'; })());
  log('cambia a Ana (Jefe)', await cambiar(t.page, 'jefe'));
  await irReu('correos');
  await tocarReu('correo', 'reprograma');
  await hasta(t.page, () => !!document.getElementById('rcFecha') && document.getElementById('rcFecha').value !== '');
  log('al reprogramar, los carros y la comida vuelven a revisarse y el viaje se cancela', await guardarReu() && await (async () => { o = await oriente(); return o.r.estado === 'reprogramada' && o.ns.find(n => n.tipo === 'carros').estado === 'pendiente' && o.ns.filter(n => n.tipo === 'viaje').every(n => ['cancelado', 'no-va'].includes(n.estado)) && o.ns.find(n => n.tipo === 'refrigerios').estado === 'pendiente'; })());
  // Agente lento: a los 5 s aparece «No esperar» y se sigue con el respaldo.
  await t.ctx.route('https://agente-lento.prueba/', () => new Promise(() => {}));
  await t.page.evaluate(() => { window.AGENTE_DEMO = { url: 'https://agente-lento.prueba/' }; });
  await tocarReu('correo', 'cancela');
  log('si el agente tarda, cuenta los segundos y a los 5 s ofrece no esperar', await hasta(t.page, () => /Leyendo… [5-9] s/.test(document.getElementById('reCampos').textContent) && !document.getElementById('reSecundario').hidden, null, 9000));
  await t.page.click('#reSecundario');
  log('«No esperar» sigue con la respuesta de respaldo', await hasta(t.page, () => /no se esperó/.test(document.getElementById('reCampos').textContent) && !!document.getElementById('rcMotivo')));
  await t.page.keyboard.press('Escape');
  // El agente conectado: se finge el Worker para ver que manda el token y se usa su respuesta.
  let tokenRecibido = '';
  await t.ctx.route('https://agente.prueba/', async r => { tokenRecibido = r.request().headers().authorization || ''; return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, reunion: { tipo: 'cancela', reunionId: '', comunidad: 'Comunidad Ejemplo Oriente', fecha: '', hora: '', lugar: '', asistentes: 0, refrigerios: false, almuerzo: false, carros: 0, logistica: [], faltan: [], motivo: 'Lo pidió la autoridad tradicional', resumen: 'Se cancela la reunión <b>ya</b>.' } }) }); });
  await t.page.evaluate(() => { window.AGENTE_DEMO = { url: 'https://agente.prueba/' }; });
  await tocarReu('correo', 'cancela');
  log('con el agente conectado se usa lo que leyó Gemini (y manda el token de la sesión)', await hasta(t.page, () => /Leído por Gemini/.test(document.getElementById('reCampos').textContent) && document.getElementById('rcMotivo').value === 'Lo pidió la autoridad tradicional') && /^Bearer token-falso-/.test(tokenRecibido), tokenRecibido);
  log('lo que dice el agente se muestra como texto (no ejecuta HTML)', await t.page.evaluate(() => document.querySelector('.agente-res').textContent.includes('<b>ya</b>')));
  log('al cancelar, la reunión y todas sus tareas quedan canceladas', await guardarReu() && await (async () => { o = await oriente(); return o.r.estado === 'cancelada' && o.ns.every(n => ['cancelado', 'no-va'].includes(n.estado)); })());
  await t.page.evaluate(() => { window.AGENTE_DEMO = { url: '' }; });
  // Bandeja: un correo que llegó de verdad al Gmail de prueba (lo sube el Apps Script de buzon/).
  await t.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')); d.buzon = { gm18c3: { asunto: 'Reunión con la Comunidad Ejemplo Este', texto: 'Buenos días. Les confirmo la reunión con la Comunidad Ejemplo Este el próximo martes a las 9:00 a. m. Somos 50 personas; necesitamos refrigerios y 2 camionetas.', fecha: new Date().toISOString() } }; localStorage.setItem('__fb_datos', JSON.stringify(d)); });
  await t.page.reload(); await datosListos(t.page);
  await t.page.evaluate(() => { window.AGENTE_DEMO = { url: '' }; });
  await irReu('correos');
  log('la bandeja muestra el correo que llegó al Gmail de prueba', await hasta(t.page, () => /Bandeja del Gmail de prueba \(1\)/.test(document.getElementById('reuContenido').textContent) && /Comunidad Ejemplo Este/.test(document.getElementById('reuContenido').textContent) && !!document.querySelector('#reuContenido [data-accion="buzon"][data-id="gm18c3"]')), await texto(t.page, '#reuContenido'));
  await tocarReu('buzon', 'gm18c3');
  log('sin agente, un correo de la bandeja no se inventa: dice que no pudo y deja intentar otra vez', await hasta(t.page, () => /no pudo leer/.test(document.getElementById('reT').textContent) && !document.getElementById('reSecundario').hidden && /Intentar otra vez/.test(document.getElementById('reSecundario').textContent)));
  const fechaEste = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10);
  let llamadasAgente2 = 0;
  await t.ctx.route('https://agente2.prueba/', r => (++llamadasAgente2 === 1 ? r.fulfill({ status: 502, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, error: 'gemini', detalle: 'Gemini respondió 503' }) }) : r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, reunion: { tipo: 'nueva', reunionId: '', comunidad: 'Comunidad Ejemplo Este', fecha: fechaEste, hora: '09:00', lugar: '', asistentes: 50, refrigerios: true, almuerzo: false, carros: 2, logistica: [], faltan: ['lugar'], motivo: '', resumen: 'Reunión nueva con 50 personas, refrigerios y 2 camionetas.' } }) })));
  await t.page.evaluate(() => { window.AGENTE_DEMO = { url: 'https://agente2.prueba/' }; });
  await t.page.click('#reSecundario');
  log('si Gemini está saturado (503), espera y vuelve a intentar solo, diciendo en qué va', await hasta(t.page, () => /Gemini está ocupado \(intento 1\)\. Vuelvo a intentar en \d+ s/.test(document.getElementById('reCampos').textContent), null, 8000));
  log('con el agente, el correo arma la reunión: 50 personas, refrigerio y 2 camionetas (al segundo intento)', llamadasAgente2 >= 1 && await hasta(t.page, () => !!document.getElementById('rcCom') && document.getElementById('rcCom').value === 'Comunidad Ejemplo Este' && document.getElementById('rcAsis').value === '50' && document.getElementById('rcCarros').value === '2' && document.getElementById('rcRef').checked, null, 15000) && llamadasAgente2 === 2);
  log('la Jefe la crea, se reparten las tareas y el correo queda «Repartido»', await guardarReu() && await (async () => { const d = await reu(); const r = Object.values(d.reuniones).find(x => x.comunidad === 'Comunidad Ejemplo Este'); return !!r && r.correos.includes('gm-gm18c3') && Object.values(d.necesidades).filter(n => n.comunidad === 'Comunidad Ejemplo Este').length === 5; })() && await hasta(t.page, () => /Repartido/.test(document.getElementById('reuContenido').textContent) && !document.querySelector('#reuContenido [data-accion="buzon"]')));
  await t.page.screenshot({ path: path.join(CAPTURAS, '09b-bandeja.png'), fullPage: true });
  await t.page.click('#reuContenido [data-accion="borrarbuzon"][data-id="gm18c3"]'); await t.page.click('#cfSi');
  log('la Jefe puede borrar el correo de la bandeja', await hasta(t.page, () => !(JSON.parse(localStorage.getItem('__fb_datos')).buzon || {}).gm18c3 && /Bandeja del Gmail de prueba \(0\)/.test(document.getElementById('reuContenido').textContent)));
  await t.page.evaluate(() => { window.AGENTE_DEMO = { url: '' }; });
  await irReu('pasadas');
  await t.page.click('#reuContenido [data-accion="ver"][data-id="re-004"]');
  log('el detalle de la reunión muestra las tareas, el acta con su foto y cómo va', await hasta(t.page, () => /Acta/.test(document.getElementById('reCampos').textContent) && !!document.querySelector('#reCampos img.factura') && document.querySelectorAll('#reCampos .necesidades-l li').length >= 5));
  await t.page.screenshot({ path: path.join(CAPTURAS, '10-reunion-detalle.png') });
  await t.page.keyboard.press('Escape');
  log('cambia a Ricardo (Gerente)', await cambiar(t.page, 'gerente'));
  await irReu();
  log('el Gerente ve Resumen, Próximas y Realizadas, sin correos ni botones', await hasta(t.page, () => [...document.querySelectorAll('#reuSecciones [data-sec]')].map(b => b.dataset.sec).join(',') === 'resumen,proximas,pasadas' && /Tareas pendientes por persona/.test(document.getElementById('reuContenido').textContent) && !document.querySelector('#reuContenido [data-accion="correo"], #reuContenido [data-accion="autorizar"]')));
  await t.page.screenshot({ path: path.join(CAPTURAS, '11-reuniones-gerente.png'), fullPage: true });
  log('vuelve a Ana (Jefe)', await cambiar(t.page, 'jefe'));

  console.log('6. Seguridad y errores');
  await t.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')); d.compras['co-002'].que = '<img src=x onerror="window.__hackeado=1">Prueba'; d.articulos['ar-011'].nombre = '<img src=x onerror="window.__hackeado=2">Mouse'; d.solicitudes[Object.keys(d.solicitudes)[0]].paraQue = '<script>window.__hackeado=3</script>'; d.compras['co-xss'] = { que: 'Compra con texto malo', cantidad: 3, unidad: 'artículos', categoria: 'Otro', valorAprox: 6000, paraQue: '<b onmouseover="window.__hackeado=6">x</b>', pide: 'Ana Pérez', pideRol: 'jefe', autoriza: 'Ricardo Fuentes', autorizaJefe: '', estado: 'comprado', proveedor: '<svg onload="window.__hackeado=7">', valorReal: 6000, fechaPedido: '2026-11-01', fechaCompra: '2026-11-02', entregadoA: '', motivoRechazo: '', articuloId: '', factura: '', revisada: false, historial: [],
      lineas: [{ que: '<img src=x onerror="window.__hackeado=4">Uno', cantidad: 2, unidad: '<i onclick="window.__hackeado=8">u</i>', valor: 4000, articuloId: '' }, { que: 'Dos', cantidad: 1, unidad: 'unidades', valor: 2000, articuloId: '' }],
      cotizaciones: ['javascript:window.__hackeado=9', 'data:image/jpeg;base64,AAAA" onerror="window.__hackeado=5'] };
    localStorage.setItem('__fb_datos', JSON.stringify(d)); });
  await t.page.reload(); await datosListos(t.page);
  await t.page.click('.tab[data-vista="inventario"]'); await t.page.click('#invSecciones [data-sec="hacer"]'); await esp(300);
  await t.page.click('#invContenido [data-accion="vercompra"][data-id="co-xss"]'); await hasta(t.page, () => !document.getElementById('shAccion').hidden);
  log('el detalle de una compra con líneas, proveedor y cotizaciones maliciosas se ve como texto y no se ejecuta', !(await t.page.evaluate(() => window.__hackeado)) && /<img src=x/.test(await texto(t.page, '#acCampos')) && (await t.page.locator('#acCampos .cot-mini img').count()) === 0, await texto(t.page, '#acCampos'));
  await t.page.keyboard.press('Escape');
  await t.page.click('#invContenido [data-accion="recibir"][data-id="co-xss"]'); await hasta(t.page, () => !document.getElementById('shAccion').hidden);
  log('y «Recibir la compra» tampoco ejecuta el nombre de los artículos', !(await t.page.evaluate(() => window.__hackeado)) && /<img src=x/.test(await texto(t.page, '#acCampos')), await texto(t.page, '#acCampos'));
  await t.page.keyboard.press('Escape');
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
  // El 502 que se fingió para probar el reintento del agente lo anota el navegador; no es un error de la app.
  const erroresReales = t.errores.filter(e => !/status of 502/.test(e));
  log('sin errores de consola en todo el recorrido', erroresReales.length === 0, erroresReales.join(' | '));
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
