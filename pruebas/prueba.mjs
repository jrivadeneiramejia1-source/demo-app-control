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
const CONFIG = 'window.FIREBASE_CONFIG = { apiKey: "clave-de-prueba", authDomain: "demo.firebaseapp.com", projectId: "demo-app-control", appId: "1:1:web:1" };';

let ok = 0, mal = 0;
const log = (n, t, x) => { t ? ok++ : mal++; console.log((t ? 'OK   ' : 'FALLA') + ' ' + n + (t || x == null ? '' : '\n      ' + x)); };
const esp = ms => new Promise(r => setTimeout(r, ms));

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
async function telefono({ conConfig = true, ancho = 412, oscuro = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: 860 }, colorScheme: oscuro ? 'dark' : 'light', locale: 'es-CO' });
  const errores = [];
  if (conConfig) await ctx.route(/\/config\.js/, r => r.fulfill({ body: CONFIG, contentType: 'text/javascript' }));
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
  log('sembró 12 equipos, 8 compras, 3 carros, 3 reuniones y 5 avisos',
    ['equipos', 'compras', 'vehiculos', 'reuniones', 'avisos'].map(c => Object.keys(sem[c] || {}).length).join(',') === '12,8,3,3,5',
    ['equipos', 'compras', 'vehiculos', 'reuniones', 'avisos'].map(c => c + ':' + Object.keys(sem[c] || {}).length).join(' '));
  log('el saludo dice Hola, Ana', (await texto(t.page, '#tInicio')) === 'Hola, Ana');
  log('Jefe ve 6 cifras de pendientes', (await t.page.locator('#sumInicio .sum').count()) === 6);
  log('compras por autorizar = 2 y sin autorizar = 1', (await cifra(t.page, 'sumInicio', 0)) === 2 && (await cifra(t.page, 'sumInicio', 1)) === 1);
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
  await t.page.click('.tab[data-vista="compras"]');
  log('Compras: 8 compras y la de botas de seguridad', await hasta(t.page, () => document.querySelectorAll('#listaCompras .card').length === 8 && /Botas de seguridad/.test(document.getElementById('listaCompras').textContent)));
  log('Compras: la compra sin autorizar sale en rojo', (await t.page.locator('#listaCompras .card.st-peligro').count()) === 1);
  log('Compras: el resumen del mes muestra un valor en pesos', /\$\s?[\d.]+/.test(await texto(t.page, '#resumenMes')), await texto(t.page, '#resumenMes'));
  await t.page.click('.tab[data-vista="vehiculos"]');
  log('Vehículos: 3 carros con placa', await hasta(t.page, () => document.querySelectorAll('#listaVehiculos .placa').length === 3));
  log('Vehículos: avisa el SOAT por vencer y la revisión vencida', /SOAT vence en 12 días/.test(await texto(t.page, '#listaVehiculos')) && /vencido hace 5 días/.test(await texto(t.page, '#listaVehiculos')), await texto(t.page, '#listaVehiculos'));
  log('Vehículos: el rayón sin revisar aparece', /Rayón sin revisar/.test(await texto(t.page, '#listaVehiculos')));
  await t.page.click('.tab[data-vista="reuniones"]');
  log('Reuniones: 3 reuniones con sus necesidades', await hasta(t.page, () => document.querySelectorAll('#listaReuniones .card').length === 3 && document.querySelectorAll('#listaReuniones .necesidades li').length >= 3));
  log('cada módulo tiene su etiqueta Versión pagada', await t.page.evaluate(() => ['vEquipos', 'vCompras', 'vVehiculos', 'vReuniones', 'vInicio'].every(v => document.querySelector('#' + v + ' .pagada'))));
  await t.page.click('#vReuniones .pagada');
  log('la etiqueta abre la hoja con demo frente a pagando', await hasta(t.page, () => !document.getElementById('shPagada').hidden && /Outlook/.test(document.getElementById('pagadaCuerpo').textContent)));
  await t.page.keyboard.press('Escape');
  log('Escape cierra la hoja', await hasta(t.page, () => document.getElementById('shPagada').hidden));

  console.log('4. Cambio de persona y permisos');
  log('cambia a Carlos Pinto (Conductor)', await cambiar(t.page, 'conductor'));
  log('Conductor no ve Equipos ni Compras en las pestañas', await t.page.evaluate(() => document.querySelector('.tab[data-vista="equipos"]').hidden && document.querySelector('.tab[data-vista="compras"]').hidden && !document.querySelector('.tab[data-vista="vehiculos"]').hidden));
  log('volvió a Inicio porque Reuniones sí lo ve pero arrancó donde estaba', !(await t.page.locator('#vReuniones').isHidden()) || !(await t.page.locator('#vInicio').isHidden()));
  await t.page.click('.tab[data-vista="inicio"]');
  log('en Inicio, Equipos y Compras salen con candado', (await t.page.locator('#modulosLista .modulo.bloqueado').count()) === 2);
  await t.page.click('#modulosLista [data-ir="compras"]', { force: true });
  log('tocar un módulo bloqueado explica que no tiene permiso', await hasta(t.page, () => /no tiene permiso/.test(document.getElementById('toast').textContent)));
  log('la campana del Conductor solo cuenta el aviso para todos', (await texto(t.page, '#badgeAvisos')) === '1');
  log('cambia a Luis Rodríguez (Autoriza compras)', await cambiar(t.page, 'compras'));
  await esp(900);
  log('Luis ve 3 cifras: por autorizar, sin autorizar y reuniones que esperan su respuesta', (await t.page.locator('#sumInicio .sum').count()) === 3 && /esperan tu respuesta/.test(await texto(t.page, '#sumInicio')));
  log('la insignia de Compras dice 3 (2 por autorizar y 1 sin autorizar)', (await texto(t.page, '[data-badge="compras"]')) === '3');
  await t.page.click('#btnAvisos');
  log('la campana muestra 2 avisos (el suyo y el de todos)', await hasta(t.page, () => document.querySelectorAll('#avisosLista .aviso-it').length === 2));
  log('al abrirla la insignia queda en 0', await hasta(t.page, () => document.getElementById('badgeAvisos').hidden));
  await t.page.keyboard.press('Escape');
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
  await t.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')); d.compras['co-002'].que = '<img src=x onerror="window.__hackeado=1">Prueba'; localStorage.setItem('__fb_datos', JSON.stringify(d)); });
  await t.page.reload(); await datosListos(t.page);
  await t.page.click('.tab[data-vista="compras"]'); await esp(300);
  log('un texto con HTML se muestra como texto y no se ejecuta', !(await t.page.evaluate(() => window.__hackeado)) && /<img src=x/.test(await texto(t.page, '#listaCompras')));
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
    for (const v of ['equipos', 'compras', 'vehiculos', 'reuniones']) {
      await x.page.click(`.tab[data-vista="${v}"]`); await esp(250);
      if (nombre === '360px' || v === 'vehiculos') await x.page.screenshot({ path: path.join(CAPTURAS, `04-${v}-${nombre}.png`), fullPage: true });
    }
    log(`${nombre}: sin desborde en los módulos`, await x.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    // axe-core: revisión automática de accesibilidad (contraste, etiquetas, nombres de botones).
    await x.page.addScriptTag({ content: fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8') });
    for (const v of ['inicio', 'compras']) {
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
