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
  await page.evaluate(() => document.querySelectorAll('#personaLista details.grupo-personas').forEach(d => { d.open = true; }));   // los grupos vienen cerrados salvo el de la persona actual
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
  /** Abre un Excel ya descargado y dice cómo quedó: hojas, título, títulos en negrilla con fondo y bordes, primera fila fija, listas y filas. */
  const excelInfo = ruta => t.page.evaluate(async b64 => {
    const E = await window.Excel.cargar(), wb = new E.Workbook();
    await wb.xlsx.load(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer);
    const hojas = wb.worksheets.map(ws => {
      const a1 = ws.getCell(1, 1), enc = ws.getRow(4), c1 = enc.getCell(1), d1 = ws.getCell(5, 1);
      const titulos = []; enc.eachCell(c => titulos.push(String(c.value)));
      const filas = []; for (let i = 5; i <= ws.rowCount; i++) { const f = ws.getRow(i), v = []; for (let j = 1; j <= titulos.length; j++) v.push(f.getCell(j).value == null ? '' : String(f.getCell(j).value)); filas.push(v); }
      return { nombre: ws.name, oculta: ws.state !== 'visible', titulo: String(a1.value), tituloNegrilla: !!(a1.font && a1.font.bold), tituloTam: a1.font && a1.font.size, fuente: a1.font && a1.font.name,
        titulos, encNegrilla: !!(c1.font && c1.font.bold), encFondo: !!(c1.fill && c1.fill.fgColor && c1.fill.fgColor.argb), encBorde: !!(c1.border && c1.border.top && c1.border.top.style), datoBorde: !!(d1.border && d1.border.left && d1.border.left.style),
        congelada: ws.views && ws.views[0] && ws.views[0].ySplit, filtro: !!ws.autoFilter, lista: ws.getCell(5 + 0, 3).dataValidation ? ws.getCell(5, 3).dataValidation.type : '', filas };
    });
    return hojas;
  }, fs.readFileSync(ruta).toString('base64'));
  const bienFormado = h => h.tituloNegrilla && h.tituloTam >= 14 && h.fuente === 'Arial' && h.encNegrilla && h.encFondo && h.encBorde && h.congelada === 4 && h.filtro;
  await t.page.goto(URL);
  log('muestra las 46 personas del organigrama agrupadas en 6 unidades, con un buscador y el aviso de qué es real y qué inventado', await hasta(t.page, () => document.querySelectorAll('#entradaLista .persona-card').length === 46 && document.querySelectorAll('#entradaLista details.grupo-personas').length === 6 && !!document.querySelector('#entradaLista .filtro-personas') && /nombres y cargos son los del organigrama/.test(document.getElementById('notaDemo').textContent) && !!document.querySelector('img.logo-empresa')));
  await t.page.screenshot({ path: path.join(CAPTURAS, '01b-entrada-organigrama.png'), fullPage: true });
  await t.page.fill('#entradaLista .filtro-personas', 'contab');
  log('el buscador deja solo a quien coincide («contab»: Asist. Contable, Profesional Contable y Auxiliar Contable) y abre su grupo', await hasta(t.page, () => [...document.querySelectorAll('#entradaLista .persona-card')].filter(c => !c.hidden).length === 3 && [...document.querySelectorAll('#entradaLista details.grupo-personas')].filter(d => !d.hidden).length === 1));
  await t.page.fill('#entradaLista .filtro-personas', 'angel');
  log('el buscador no distingue tildes («angel» encuentra a Ángel Ortiz)', await hasta(t.page, () => [...document.querySelectorAll('#entradaLista .persona-card')].filter(c => !c.hidden).map(c => c.textContent).join().includes('Ángel Ortiz')));
  await t.page.fill('#entradaLista .filtro-personas', '');
  log('al borrar la búsqueda vuelven las 46', await hasta(t.page, () => [...document.querySelectorAll('#entradaLista .persona-card')].filter(c => !c.hidden).length === 46));
  log('la entrada tiene la etiqueta Versión pagada', await visible(t.page, '#vEntrada .pagada'));
  log('entra como Carolina Castillo (Jefe)', await entrar(t.page, 'jefe'));
  log('siembra los datos y llena el tablero', await datosListos(t.page));
  await esp(900); // las cifras cuentan hasta su valor
  const sem = await t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos') || '{}'));
  const COLS = ['equipos', 'hojas', 'tareasEq', 'compras', 'proveedores', 'articulos', 'movimientos', 'solicitudes', 'vehiculos', 'novedades', 'entregas', 'reuniones', 'necesidades', 'avisos'];
  log('sembró 13 equipos (12 en uso y 1 de baja), 6 actas, 3 tareas de equipos, 14 compras, 5 proveedores, 18 artículos, 13 movimientos, 5 pedidos, 4 carros, 3 novedades, 3 salidas/llegadas, 4 reuniones, 25 tareas de reuniones y 12 avisos',
    COLS.map(c => Object.keys(sem[c] || {}).length).join(',') === '13,6,3,14,5,18,13,5,4,3,3,4,25,12', COLS.map(c => c + ':' + Object.keys(sem[c] || {}).length).join(' '));
  log('el saludo dice Hola, Carolina', (await texto(t.page, '#tInicio')) === 'Hola, Carolina');
  log('Jefe ve 9 cifras de pendientes (ya no autoriza compras)', (await t.page.locator('#sumInicio .sum').count()) === 9);
  log('bodega: 5 agotados o bajos y 3 pedidos por entregar', (await cifra(t.page, 'sumInicio', 0)) === 5 && (await cifra(t.page, 'sumInicio', 1)) === 3);
  log('a la Jefe ya no le sale «compras que te toca autorizar»; sí las sin autorizar = 1', (await cifra(t.page, 'sumInicio', 2)) === 1 && !/te toca autorizar/.test(await texto(t.page, '#sumInicio')) && /sin autorizar/.test(await texto(t.page, '#sumInicio')));
  log('Jefe ve las 5 pestañas y los 4 módulos abiertos', (await t.page.locator('.tab:not([hidden])').count()) === 5 && (await t.page.locator('#modulosLista .modulo.bloqueado').count()) === 0);
  log('la campana tiene avisos sin leer (1 de la Jefe y 1 para todos)', (await texto(t.page, '#badgeAvisos')) === '2');
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
  // Filtros y vistas de Equipos (Fase 3)
  const eqDatos = () => t.page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).equipos));
  const nPort = (await eqDatos()).filter(e => e.tipo === 'Portátil' && e.estado !== 'baja').length;
  log('Equipos: hay chips por tipo con su número («Todos 12» y los tipos que sí existen)', await hasta(t.page, () => { const c = [...document.querySelectorAll('#eqContenido .chip[data-accion="tipoeq"]')]; const n = x => Number(x.querySelector('.n').textContent); return c.length >= 3 && /^Todos/.test(c[0].textContent) && n(c[0]) === 12 && c.slice(1).reduce((s, x) => s + n(x), 0) === 12; }));
  await t.page.click('#eqContenido .chip[data-id="Portátil"]');
  log('Equipos: escoger «Portátil» deja solo los portátiles, dice «Filtro: Portátil» y cuenta bien', await hasta(t.page, n => document.querySelectorAll('#eqContenido .card[data-accion="ver"]').length === n && new RegExp(`${n} de 12 equipos`).test(document.getElementById('eqContenido').textContent) && /Filtro: Portátil/.test(document.getElementById('eqContenido').textContent) && document.querySelector('#eqContenido .chip[data-id="Portátil"]').getAttribute('aria-pressed') === 'true', nPort));
  await t.page.click('#sumEquipos button.sum[data-filtro="bodega"]');
  log('Equipos: el filtro del tablero y el del tipo se suman («Filtro: En bodega · Portátil»)', await hasta(t.page, () => /Filtro: En bodega · Portátil/.test(document.getElementById('eqContenido').textContent) && [...document.querySelectorAll('#eqContenido .card[data-accion="ver"]')].every(c => /Portátil/.test(c.textContent))));
  await t.page.click('#eqContenido [data-accion="quitarfiltro"]:not([data-modo])');
  log('Equipos: «Quitar» deja otra vez los 12 y la línea del filtro desaparece', await hasta(t.page, () => document.querySelectorAll('#eqContenido .card[data-accion="ver"]').length === 12 && !/Filtro:/.test(document.getElementById('eqContenido').textContent)));
  await t.page.screenshot({ path: path.join(CAPTURAS, '15-equipos-chips.png') });
  await t.page.click('#eqContenido .chip[data-id="Impresora"]'); await t.page.fill('#qEq', 'thinkpad');
  log('Equipos: sin resultados dice «No hay equipos con ese filtro» y ofrece «Quitar filtro»', await hasta(t.page, () => /No hay equipos con ese filtro/.test(document.getElementById('eqContenido').textContent) && !!document.querySelector('#eqContenido [data-accion="quitarfiltro"][data-modo="todo"]')));
  await t.page.click('#eqContenido [data-accion="quitarfiltro"][data-modo="todo"]');
  log('Equipos: «Quitar filtro» limpia el tipo y la búsqueda', await hasta(t.page, () => document.querySelectorAll('#eqContenido .card[data-accion="ver"]').length === 12 && document.getElementById('qEq').value === ''));
  await t.page.click('#eqSecciones [data-sec="actas"]'); await t.page.waitForSelector('#qAc');
  await t.page.fill('#qAc', 'demo-0004');
  log('Actas: el buscador encuentra el acta por un serial', await hasta(t.page, () => { const c = [...document.querySelectorAll('#eqContenido .card.tarea')]; return c.length === 1 && /Liliana Torres/.test(c[0].textContent); }));
  await t.page.fill('#qAc', 'zzzz');
  log('Actas: sin resultados dice qué pasó y ofrece quitar la búsqueda', await hasta(t.page, () => /No hay actas con esa búsqueda/.test(document.getElementById('eqContenido').textContent)));
  await t.page.click('#eqContenido [data-accion="quitarfiltro"][data-modo="actas"]');
  log('Actas: «Quitar búsqueda» vuelve a mostrar todas', await hasta(t.page, () => document.getElementById('qAc').value === '' && document.querySelectorAll('#eqContenido .card.tarea').length >= 4));
  await t.page.click('#eqSecciones [data-sec="personas"]'); await t.page.waitForSelector('#qPe');
  await t.page.fill('#qPe', 'liliana');
  log('Personas: el buscador encuentra a la persona por su nombre', await hasta(t.page, () => { const c = [...document.querySelectorAll('#eqContenido [data-accion="persona"]')]; return c.length === 1 && /Liliana Torres/.test(c[0].textContent); }));
  await t.page.fill('#qPe', 'DEMO-0005');
  log('Personas: también por el serial del equipo que tiene', await hasta(t.page, () => { const c = [...document.querySelectorAll('#eqContenido [data-accion="persona"]')]; return c.length === 1 && /Camilo Suárez/.test(c[0].textContent); }));
  await t.page.fill('#qPe', 'zzzz');
  log('Personas: sin resultados ofrece quitar la búsqueda', await hasta(t.page, () => /No hay nadie con esa búsqueda/.test(document.getElementById('eqContenido').textContent)));
  await t.page.click('#eqContenido [data-accion="quitarfiltro"][data-modo="personas"]');
  log('Personas: «Quitar búsqueda» vuelve a mostrar a todos', await hasta(t.page, () => document.getElementById('qPe').value === '' && document.querySelectorAll('#eqContenido [data-accion="persona"]').length >= 4));
  await t.page.click('#eqSecciones [data-sec="agenda"]');
  const diasAlDomingo = (7 - new Date().getDay()) % 7;
  const gruposAgenda = () => t.page.evaluate(() => [...document.querySelectorAll('#eqContenido .section-label')].map(l => [l.textContent, l.nextElementSibling && l.nextElementSibling.classList.contains('list') ? l.nextElementSibling.textContent : '']));
  log('Agenda: las pendientes salen en «Atrasadas», «Esta semana» y «Después», y la atrasada va en el primer grupo', await hasta(t.page, () => { const g = [...document.querySelectorAll('#eqContenido .section-label')].map(l => l.textContent); return /^Atrasadas \(1\)/.test(g[0]) && /^Esta semana/.test(g[1]) && /^Después/.test(g[2]) && /La batería dura poco/.test(l0()); function l0() { return document.querySelector('#eqContenido .section-label').nextElementSibling.textContent; } }));
  const gs = await gruposAgenda();
  log(`Agenda: la tarea de dentro de 2 días queda en «${diasAlDomingo >= 2 ? 'Esta semana' : 'Después'}» (hoy faltan ${diasAlDomingo} días para el domingo)`, gs.some(([r, x]) => r.startsWith(diasAlDomingo >= 2 ? 'Esta semana' : 'Después') && /Copiar las fotos/.test(x)));
  log('Agenda: las hechas están plegadas («Ver hechas (1)») y no se ven', await hasta(t.page, () => /Ver hechas \(1\)/.test(document.getElementById('eqContenido').textContent) && !/Limpiar el cabezal/.test(document.getElementById('eqContenido').textContent)));
  await t.page.click('#eqContenido [data-accion="verhechas"]');
  log('Agenda: «Ver hechas» las muestra y el botón pasa a «Ocultar hechas»', await hasta(t.page, () => /Limpiar el cabezal/.test(document.getElementById('eqContenido').textContent) && /Ocultar hechas/.test(document.getElementById('eqContenido').textContent)));
  await t.page.screenshot({ path: path.join(CAPTURAS, '15b-agenda-grupos.png'), fullPage: true });
  await t.page.click('#eqContenido [data-accion="verhechas"]');
  await t.page.click('#eqSecciones [data-sec="equipos"]');
  await t.page.click('.tab[data-vista="inventario"]');
  log('Inventario: la Jefe empieza en el Panorama (todo el inventario en una pantalla) y no en la lista de tareas', await hasta(t.page, () => document.querySelector('#invSecciones [data-sec="panorama"]').getAttribute('aria-pressed') === 'true' && /Lo urgente/.test(document.getElementById('invContenido').textContent)));
  log('el Panorama dice lo urgente: agotados, compras que esperan a la Coordinadora y al Gerente general, sin autorización, pedidos viejos', await t.page.evaluate(() => { const x = document.getElementById('invContenido').textContent; return /artículos agotados/.test(x) && /compras esperan a la Coordinadora de compras/.test(x) && /compra hecha sin autorización/.test(x) && /compra espera al Gerente general/.test(x) && /pedido de material espera hace más de 2 días/.test(x) && /Valor de lo que hay en bodega/.test(x) && /Gastado este mes/.test(x) && /por persona que las pidió/.test(x) && /por proyecto/.test(x); }), await texto(t.page, '#invContenido'));
  await t.page.screenshot({ path: path.join(CAPTURAS, '09-panorama-jefe.png'), fullPage: true });
  await t.page.click('#invContenido [data-accion="ir"][data-sec="existencias"]');
  log('tocar «artículos agotados» lleva a Existencias ya filtradas', await hasta(t.page, () => document.querySelector('#invSecciones [data-sec="existencias"]').getAttribute('aria-pressed') === 'true' && document.querySelectorAll('#invContenido .art').length === 2));
  await t.page.click('#invSecciones [data-sec="hacer"]');
  log('Inventario: la Jefe ve 12 tareas agrupadas por a quién le tocan (la Coordinadora, Compras, Andrés y el Gerente general)', await hasta(t.page, () => { const x = document.getElementById('invContenido').textContent; return document.querySelectorAll('#invContenido .tarea').length === 12 && !/Te toca a ti/.test(x) && /Le toca a Mauricio G\. \(3\)/.test(x) && /Le toca a Andrés B\./.test(x) && /Le toca a Fredy T\./.test(x) && /Le toca a Gerente/.test(x); }), await texto(t.page, '#invContenido'));
  log('la Jefe puede comprar, recibir y entregar, pero ya NO autoriza compras ni marca revisadas (eso es de la Coordinadora y del Gerente general)', await t.page.evaluate(() => ['comprar', 'recibir', 'entregar'].every(a => document.querySelector(`#invContenido [data-accion="${a}"]`)) && !document.querySelector('#invContenido [data-accion="autorizar"]') && !document.querySelector('#invContenido [data-accion="rechazar"]') && !document.querySelector('#invContenido [data-accion="revisada"]') && /La pidió la Coordinadora|Le toca a Mauricio/.test(document.getElementById('invContenido').textContent)));
  log('Inventario: sale la tarea de autorizar las botas (agotadas) y no la de pedirlas', /Autorizar compra: Botas de seguridad talla 40/.test(await texto(t.page, '#invContenido')) && !/Pedir compra: Botas de seguridad talla 40/.test(await texto(t.page, '#invContenido')));
  await esp(900);
  log('Inventario: tablero con 2 agotados y 3 bajos', (await cifra(t.page, 'sumInventario', 0)) === 2 && (await cifra(t.page, 'sumInventario', 1)) === 3);
  await t.page.click('#invSecciones [data-sec="existencias"]');
  log('Existencias: 18 artículos, primero los agotados', await hasta(t.page, () => document.querySelectorAll('#invContenido .card.art').length === 18 && /Agotado/.test(document.querySelector('#invContenido .card.art').textContent)));
  await t.page.click('#sumInventario button.sum[data-filtro="agotado"]');
  log('Existencias: tocar "Agotados" deja 2', (await t.page.locator('#invContenido .card.art').count()) === 2);
  await t.page.click('#sumInventario button.sum[data-filtro="agotado"]');
  await t.page.fill('#qInventario', 'botas');
  log('Existencias: la búsqueda encuentra las 2 botas (se repinta 300 ms después de escribir)', await hasta(t.page, () => document.querySelectorAll('#invContenido .card.art').length === 2));
  await t.page.fill('#qInventario', '');
  // Código del artículo, clase ABC, tabla en pantalla ancha y «Te toca contar hoy» (Fase 13), con los datos de ejemplo todavía sin tocar
  log('Existencias: las tarjetas dicen el código de los artículos que lo tienen («Cód. BOT040»)', await hasta(t.page, () => { const c = [...document.querySelectorAll('#invContenido .card.art')].find(x => /Botas de seguridad talla 40/.test(x.textContent)); return !!c && /Cód\. BOT040/.test(c.textContent); }));
  log('en la pantalla angosta no sale el botón Tabla/Tarjetas, pero sí «Escanear código»', await hasta(t.page, () => !document.querySelector('#invContenido .vista-toggle') && !!document.querySelector('#invContenido [data-accion="escanear"]')));
  await t.page.fill('#qInventario', 'bot042');
  log('buscar por código: «bot042» encuentra solo las botas talla 42', await hasta(t.page, () => { const c = document.querySelectorAll('#invContenido .card.art'); return c.length === 1 && /talla 42/.test(c[0].textContent); }));
  await t.page.fill('#qInventario', '7700000000013');
  log('y un código de barras largo encuentra las resmas de papel', await hasta(t.page, () => { const c = document.querySelectorAll('#invContenido .card.art'); return c.length === 1 && /Resmas/.test(c[0].textContent); }));
  await t.page.fill('#qInventario', '');
  await t.page.click('#invSecciones [data-sec="conteo"]');
  log('Conteo: «Te toca contar hoy (5)»: primero la clase A (botas 40), luego la B (chalecos) y las C que nunca se contaron o se pasaron de plazo', await hasta(t.page, () => {
    const c = document.querySelector('#invContenido .cuadro-hoy'); if (!c || !/Te toca contar hoy \(5\)/.test(c.textContent)) return false;
    const f = [...c.querySelectorAll('.hoy-lista li')].map(li => [li.querySelector('.abc').textContent, li.querySelector('.hoy-n').childNodes[0].textContent]);
    return f.length === 5 && f[0].join() === 'A,Botas de seguridad talla 40' && f[1].join() === 'B,Chalecos reflectivos' && f.slice(2).every(x => x[0] === 'C') && f[2][1] === 'Tóner para impresora' && /nunca contado/.test(c.textContent) && /contado hace 45 días/.test(c.textContent); }), await texto(t.page, '#invContenido'));
  log('la tarjeta trae un botón por bodega con cuántos le tocan («Contar en Riohacha (5)»)', await hasta(t.page, () => { const b = [...document.querySelectorAll('#invContenido .cuadro-hoy [data-accion="contarhoy"]')]; return b.length === 1 && /Contar en Riohacha \(5\)/.test(b[0].textContent); }));
  await t.page.screenshot({ path: path.join(CAPTURAS, '28-te-toca-contar.png'), fullPage: true });
  // Tabla de existencias en pantalla ancha (1280 px)
  await t.page.setViewportSize({ width: 1280, height: 860 });
  await t.page.click('#invSecciones [data-sec="existencias"]');
  log('a 1280 px sale el botón Tabla/Tarjetas, empieza en Tarjetas y no hay tabla', await hasta(t.page, () => !!document.querySelector('#invContenido .vista-toggle') && document.querySelector('#invContenido [data-accion="vista"][data-id="tarjetas"]').getAttribute('aria-pressed') === 'true' && !document.querySelector('#invContenido .tabla-inv')));
  await t.page.click('#invContenido [data-accion="vista"][data-id="tabla"]');
  log('al escoger «Tabla» sale la tabla con los 18 artículos, con código, bodega, mínimo, máximo, valor, clase ABC y estado', await hasta(t.page, () => { const th = [...document.querySelectorAll('#invContenido .tabla-inv thead th')].map(x => x.textContent.trim().replace(/[▲▼]/g, '').trim()); return document.querySelectorAll('#invContenido .tabla-inv tbody tr').length === 18 && ['Código', 'Artículo', 'Categoría', 'Bodega', 'Ubicación', 'Hay', 'Mín.', 'Máx.', 'Valor en bodega', 'ABC', 'Estado'].every((x, i) => th[i] === x); }));
  log('la tabla ensancha la ventana (más de 900 px de ancho) y el encabezado queda fijo al bajar (sticky)', await t.page.evaluate(() => document.querySelector('#invContenido .tabla-inv-wrap').getBoundingClientRect().width > 900 && getComputedStyle(document.querySelector('#invContenido .tabla-inv thead th')).position === 'sticky'));
  log('la elección se recuerda en este navegador (inv.vista = tabla)', await t.page.evaluate(() => localStorage.getItem('inv.vista') === 'tabla'));
  log('la clase ABC: 2 A, 3 B y 13 C, y las A son las botas 40 y las resmas (lo que más valor sacó en 90 días)', await hasta(t.page, () => { const f = [...document.querySelectorAll('#invContenido .tabla-inv tbody tr')], por = k => f.filter(r => r.querySelector('.abc') && r.querySelector('.abc').textContent === k); return por('A').length === 2 && por('B').length === 3 && por('C').length === 13 && por('A').every(r => /Botas de seguridad talla 40|Resmas de papel/.test(r.textContent)); }));
  const colTabla = (k, num) => t.page.evaluate(([i, n]) => [...document.querySelectorAll('#invContenido .tabla-inv tbody tr')].map(r => { const x = r.children[i].textContent.trim(); return n ? Number(x.replace(/\D/g, '')) : x; }), [k, num]);
  await t.page.click('#invContenido .th-orden[data-id="cantidad"]');
  const asc = await colTabla(5, true);
  log('ordenar por «Hay»: de menor a mayor (el encabezado lo dice con aria-sort y una flecha)', asc.length === 18 && asc.every((v, i) => i === 0 || asc[i - 1] <= v) && await t.page.evaluate(() => document.querySelector('#invContenido .tabla-inv th[aria-sort="ascending"]') !== null && /▲/.test(document.querySelector('#invContenido .tabla-inv th[aria-sort="ascending"]').textContent)), JSON.stringify(asc));
  await t.page.click('#invContenido .th-orden[data-id="cantidad"]');
  const desc = await colTabla(5, true);
  log('tocar otra vez el mismo encabezado lo ordena de mayor a menor', desc.every((v, i) => i === 0 || desc[i - 1] >= v) && desc[0] === Math.max(...asc), JSON.stringify(desc));
  await t.page.click('#invContenido .th-orden[data-id="valor"]'); await t.page.click('#invContenido .th-orden[data-id="valor"]');
  const vals = await colTabla(8, true);
  log('ordenar por «Valor en bodega» de mayor a menor', vals.every((v, i) => i === 0 || vals[i - 1] >= v), JSON.stringify(vals));
  await t.page.click('#invContenido .th-orden[data-id="nombre"]');
  const nom = await colTabla(1, false);
  log('ordenar por «Artículo»: de la A a la Z', nom.every((v, i) => i === 0 || nom[i - 1].localeCompare(v, 'es', { numeric: true }) <= 0), JSON.stringify(nom));
  log('el pie de la tabla suma el valor de lo que se ve (hay × precio de cada artículo, recalculado aparte)', await hasta(t.page, () => { const d = window.App.S.datos.articulos, total = d.reduce((s, a) => s + (Number(a.cantidad) || 0) * (Number(a.costo) || 0), 0); return document.querySelector('#invContenido .tabla-inv tfoot .num').textContent.trim() === window.App.cop(total) && /Total de 18 artículos/.test(document.querySelector('#invContenido .tabla-inv tfoot').textContent); }));
  await t.page.screenshot({ path: path.join(CAPTURAS, '29-existencias-tabla-1280.png'), fullPage: true });
  await t.page.fill('#qInventario', 'botas');
  log('en la tabla también funciona el buscador (escribir «botas» deja 2 filas)', await hasta(t.page, () => document.querySelectorAll('#invContenido .tabla-inv tbody tr').length === 2));
  await t.page.fill('#qInventario', '');
  await t.page.click('#invContenido .tabla-inv tbody tr:first-child .fila-nombre'); await t.page.waitForSelector('#shAccion:not([hidden])');
  log('tocar un artículo de la tabla abre su hoja, con el código, la clase ABC y el último conteo', await hasta(t.page, () => { const x = document.getElementById('acCampos').textContent; return /Clase ABC/.test(x) && /Último conteo/.test(x); }), await texto(t.page, '#acCampos'));
  await t.page.keyboard.press('Escape'); await hasta(t.page, () => document.getElementById('shAccion').hidden);
  await t.page.setViewportSize({ width: 412, height: 860 });
  log('al achicar la ventana a 412 px la tabla se vuelve tarjetas y desaparece el botón Tabla/Tarjetas', await hasta(t.page, () => !document.querySelector('#invContenido .tabla-inv') && !document.querySelector('#invContenido .vista-toggle') && document.querySelectorAll('#invContenido .card.art').length === 18));
  await t.page.evaluate(() => localStorage.removeItem('inv.vista'));
  for (const [sec, re] of [['movimientos', /Registró/], ['solicitudes', /En espera/], ['compras', /En curso/], ['conteo', /conteo/i], ['resumen', /Cómo van las compras[\s\S]*Valor de lo que hay en bodega/]]) {
    await t.page.click(`#invSecciones [data-sec="${sec}"]`);
    log(`Inventario: la parte «${sec}» funciona`, await hasta(t.page, r => new RegExp(r).test(document.getElementById('invContenido').textContent), re.source), (await texto(t.page, '#invContenido')).slice(0, 200));
  }
  log('la Jefe puede descargar el Excel del resumen', !!(await t.page.$('#invContenido [data-accion="excel"]')));
  const [descarga] = await Promise.all([t.page.waitForEvent('download', { timeout: 15000 }).catch(() => null), t.page.click('#invContenido [data-accion="excel"]')]);
  if (descarga) { const ruta = path.join(CAPTURAS, 'excel-inventario.xlsx'); await descarga.saveAs(ruta); const hs = await excelInfo(ruta); log('el Excel del inventario trae título, columnas en negrilla con cuadros y la primera fila fija (5 hojas)', hs.length === 5 && hs.every(bienFormado) && hs.every(h => h.filas.length >= 1), JSON.stringify(hs.map(h => [h.nombre, bienFormado(h)]))); log('los valores de plata salen en pesos y no como texto', await t.page.evaluate(async b64 => { const E = await window.Excel.cargar(), wb = new E.Workbook(); await wb.xlsx.load(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer); const ws = wb.getWorksheet('Bodega'); let ok = false; ws.getRow(4).eachCell((c, j) => { if (/Precio/.test(String(c.value))) { const x = ws.getRow(5).getCell(j); ok = typeof x.value === 'number' && /\$/.test(x.numFmt || ''); } }); return ok; }, fs.readFileSync(ruta).toString('base64'))); }
  log('el Excel se descarga con 5 hojas', !!descarga && /^Inventario .*\.xlsx$/.test(descarga.suggestedFilename()), descarga ? descarga.suggestedFilename() : 'sin descarga');

  // --- Proveedores (Fase 12): lista, ficha con precios, NIT con su dígito, agregar, editar y borrar ---
  console.log('2a. Proveedores (Jefe)');
  if (descarga) {
    const hsP = (await excelInfo(path.join(CAPTURAS, 'excel-inventario.xlsx'))).find(h => h.nombre === 'Proveedores');
    log('el Excel del inventario trae la hoja «Proveedores» con el mismo formato, una fila por proveedor, su NIT y lo pagado este año en pesos',
      !!hsP && bienFormado(hsP) && hsP.filas.length === 5 && hsP.titulos.join() === 'Proveedor,NIT,Contacto,Teléfono,Correo,Compras hechas,Pagado este año,Última compra,Nota' && hsP.filas.some(f => f[0] === 'Ferretería El Faro' && f[1] === '900000001-2'), hsP && JSON.stringify(hsP.titulos));
  }
  const datosPv = () => t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos')));
  /** Lo que debe decir cada proveedor, calculado aparte desde los datos guardados: compras hechas (con su id) y lo pagado en el año de hoy. */
  const esperadoPv = d => Object.entries(d.proveedores).map(([id, p]) => {
    const cs = Object.values(d.compras).filter(c => ['comprado', 'recibido', 'sin-autorizar'].includes(c.estado) && c.proveedorId === id);
    return { id, nombre: p.nombre, nit: p.nit, n: cs.length, anio: cs.filter(c => String(c.fechaCompra).slice(0, 4) === String(new Date().getFullYear())).reduce((s, c) => s + c.valorReal, 0) };
  }).sort((a, b) => b.anio - a.anio || a.nombre.localeCompare(b.nombre, 'es'));
  const tarjetasPv = () => t.page.evaluate(() => [...document.querySelectorAll('#invContenido .card.tarea')].map(c => ({ nombre: c.querySelector('.card-title').textContent, chip: (c.querySelector('.serial-chip') || {}).textContent || '', texto: c.textContent })));
  const dPv0 = await datosPv(), espPv0 = esperadoPv(dPv0);
  await t.page.click('#invSecciones [data-sec="proveedores"]');
  log('la Jefe ve la parte «Proveedores» con los 5 de ejemplo, el que más se compró este año primero', await hasta(t.page, n => document.querySelectorAll('#invContenido .card.tarea').length === n, 5) && (await tarjetasPv()).map(c => c.nombre).join('|') === espPv0.map(x => x.nombre).join('|'), (await tarjetasPv()).map(c => c.nombre).join('|'));
  log('cada tarjeta dice cuántas compras tiene y cuánto se le pagó este año (cuentas hechas aparte, desde las compras)', await t.page.evaluate(esp => {
    const cop = window.App.cop, cards = [...document.querySelectorAll('#invContenido .card.tarea')];
    return esp.every(x => { const c = cards.find(k => k.querySelector('.card-title').textContent === x.nombre); return !!c && c.textContent.includes(x.n === 1 ? '1 compra' : x.n + ' compras') && c.textContent.includes(x.anio ? cop(x.anio) + ' este año' : 'nada este año'); });
  }, espPv0));
  log('el NIT sale en su chip; el proveedor sin NIT no lo trae', await (async () => { const c = await tarjetasPv(); return c.find(x => x.nombre === 'Ferretería El Faro').chip === '900000001-2' && c.find(x => x.nombre === 'Distribuidora Agua Clara').chip === ''; })());
  log('arriba hay una sola acción llena: «Agregar proveedor»', await t.page.evaluate(() => { const b = [...document.querySelectorAll('#invContenido .acciones-inv .btn.primary')]; return b.length === 1 && /Agregar proveedor/.test(b[0].textContent); }));
  await t.page.screenshot({ path: path.join(CAPTURAS, '30-proveedores.png'), fullPage: true });
  await t.page.fill('#qInventario', 'faro');
  log('el buscador deja solo «Ferretería El Faro»', await hasta(t.page, () => document.querySelectorAll('#invContenido .card.tarea').length === 1 && /Faro/.test(document.querySelector('#invContenido .card-title').textContent)));
  await t.page.fill('#qInventario', 'zzzz');
  log('si nada coincide, dice qué pasó y deja un botón para quitar la búsqueda', await hasta(t.page, () => /Ningún proveedor con ese nombre/.test(document.getElementById('invContenido').textContent) && !!document.querySelector('#invContenido [data-accion="quitarq"]')));
  await t.page.click('#invContenido [data-accion="quitarq"]');
  log('«Quitar la búsqueda» vuelve a mostrar los 5', await hasta(t.page, () => document.getElementById('qInventario').value === '' && document.querySelectorAll('#invContenido .card.tarea').length === 5));

  // Ficha de Ferretería El Faro: precios (con lo que subieron) y compras hechas.
  await t.page.click('#invContenido .card.tarea[data-id="pv-elfaro"]'); await t.page.waitForSelector('#shAccion:not([hidden])');
  const espFaro = espPv0.find(x => x.id === 'pv-elfaro');
  log('la ficha de El Faro dice su NIT, cuántas compras tiene y cuánto se le pagó este año', await t.page.evaluate(x => { const tx = document.getElementById('acCampos').textContent; return document.getElementById('acT').textContent === 'Ferretería El Faro' && tx.includes('900000001-2') && tx.includes(window.App.cop(x.anio)) && new RegExp('Compras hechas\\s*' + x.n + '\\b').test(tx) && /Marta Ejemplo/.test(tx) && /ventas\.elfaro@example\.com/.test(tx); }, espFaro), await texto(t.page, '#acCampos'));
  log('«Último precio por artículo»: los chalecos subieron de 33.000 a 36.500 (11 %) y los cables HDMI de 26.000 a 30.400 (17 %), y lo dice', await t.page.evaluate(() => {
    const cop = window.App.cop, filas = [...document.querySelectorAll('#acCampos .lineas-tabla tbody tr')].map(r => r.textContent);
    const ch = filas.find(f => /Chalecos reflectivos/.test(f)), hd = filas.find(f => /Cables HDMI/.test(f));
    return !!ch && ch.includes(cop(36500)) && /Subió 11 %/.test(ch) && ch.includes('antes ' + cop(33000)) && !!hd && hd.includes(cop(30400)) && /Subió 17 %/.test(hd) && hd.includes('antes ' + cop(26000));
  }), await texto(t.page, '#acCampos .lineas-tabla'));
  log('la ficha lista las compras hechas con su valor y quién la pidió', await hasta(t.page, () => { const li = [...document.querySelectorAll('#acCampos ol.linea li')].map(l => l.textContent); return li.length >= 4 && li.some(l => /Chalecos reflectivos/.test(l) && /pidió Andrés Beltrán/.test(l)); }));
  log('la Jefe ve «Editar» y no «Borrar»: un proveedor con compras no se borra', await t.page.evaluate(() => !!document.querySelector('#acCampos [data-accion="editprov"]') && !document.querySelector('#acCampos [data-accion="borrarprov"]')));
  await t.page.screenshot({ path: path.join(CAPTURAS, '31-proveedor-ficha.png') });
  await t.page.keyboard.press('Escape'); await hasta(t.page, () => document.getElementById('shAccion').hidden);
  await t.page.click('#invContenido .card.tarea[data-id="pv-papcentral"]'); await t.page.waitForSelector('#shAccion:not([hidden])');
  log('en Papelería Central cada artículo se compró una sola vez: lo dice y no inventa una subida', await t.page.evaluate(() => { const cop = window.App.cop, f = [...document.querySelectorAll('#acCampos .lineas-tabla tbody tr')].map(r => r.textContent), rs = f.find(x => /Resmas de papel carta/.test(x)), us = f.find(x => /Memorias USB/.test(x)); return !!rs && rs.includes(cop(27000)) && /Una sola compra/.test(rs) && !!us && us.includes(cop(30500)) && /Una sola compra/.test(us); }), await texto(t.page, '#acCampos .lineas-tabla'));
  await t.page.keyboard.press('Escape'); await hasta(t.page, () => document.getElementById('shAccion').hidden);

  // Editar: cambia la nota y queda guardada.
  await t.page.click('#invContenido .card.tarea[data-id="pv-eqcaribe"]'); await t.page.waitForSelector('#shAccion:not([hidden])');
  await t.page.click('#acCampos [data-accion="editprov"]');
  log('«Editar» abre el formulario con los datos de ese proveedor', await hasta(t.page, () => document.getElementById('acT').textContent === 'Editar proveedor' && document.getElementById('pvNombre').value === 'Equipos del Caribe Ejemplo' && document.getElementById('pvNit').value === '900000009-0'));
  await t.page.fill('#pvNota', 'Entregan en Riohacha en 3 días'); await t.page.fill('#pvContacto', 'Sandra Ejemplo'); await t.page.click('#acPrimario');
  log('al guardar la edición, el proveedor queda con la nota y el contacto nuevos y lo demás igual', await hasta(t.page, () => { const p = JSON.parse(localStorage.getItem('__fb_datos')).proveedores['pv-eqcaribe']; return p.nota === 'Entregan en Riohacha en 3 días' && p.contacto === 'Sandra Ejemplo' && p.nit === '900000009-0' && p.por === 'Fredy Torres'; }));

  // Agregar: el NIT se revisa con su dígito de verificación; las cuentas de cada caso están a la vista en el texto de cada prueba.
  await t.page.click('#invContenido [data-accion="nuevoprov"]'); await t.page.waitForSelector('#shAccion:not([hidden])');
  const errPv = async () => { await t.page.click('#acPrimario'); await hasta(t.page, () => !document.getElementById('acErr').hidden); return texto(t.page, '#acErr'); };
  log('sin nombre no deja guardar y lo dice', /Escribe el nombre del proveedor/.test(await errPv()));
  await t.page.fill('#pvNombre', 'ferreteria EL FARO');
  log('un nombre que ya existe (aunque cambie una mayúscula o una tilde) no se repite: dice cuál es', /Ya hay un proveedor llamado «Ferretería El Faro»/.test(await errPv()));
  await t.page.fill('#pvNombre', 'Almacén La Ceiba');
  for (const [nit, re, que] of [
    ['900000002-9', /termina en -1, no en -9/, '900000002 da 1 (el resto de la suma entre 11 es 1, y entonces el dígito es ese mismo)'],
    ['900000011-0', /termina en -6, no en -0/, '900000011 da 6 (379 entre 11 deja 5, y 11 - 5 = 6)'],
    ['900000009-5', /termina en -0, no en -5/, '900000009 da 0 (396 entre 11 deja 0, y el dígito es ese mismo)'],
    ['900000001-7', /termina en -2, no en -7/, '900000001 da 2 (372 entre 11 deja 9, y 11 - 9 = 2)'],
    ['900000004', /Falta el dígito de verificación[\s\S]*900000004-4/, 'un NIT sin dígito: dice cuál le toca'],
    ['9000000044', /Escríbelo con guion[\s\S]*900000004-4/, 'un NIT con el dígito pegado: dice dónde va el guion'],
    ['abc', /El NIT va con su dígito de verificación/, 'letras']]) {
    await t.page.fill('#pvNit', nit);
    log(`NIT ${nit}: ${que}`, re.test(await errPv()), await texto(t.page, '#acErr'));
  }
  await t.page.fill('#pvNit', '900.000.001-2');
  log('un NIT bueno (con puntos) que ya tiene otro proveedor dice de quién es: así se sabe que el dígito se aceptó', /Ese NIT ya lo tiene «Ferretería El Faro»/.test(await errPv()), await texto(t.page, '#acErr'));
  await t.page.fill('#pvNit', '900000002-1'); await t.page.fill('#pvTel', 'abc');
  log('un teléfono con letras no pasa', /El teléfono lleva solo números/.test(await errPv()));
  await t.page.fill('#pvTel', '300 111 2233'); await t.page.fill('#pvCorreo', 'sin-arroba');
  log('un correo sin arroba no pasa', /Ese correo no está bien escrito/.test(await errPv()));
  await t.page.fill('#pvCorreo', 'contacto.laceiba@example.com'); await t.page.fill('#pvContacto', 'Elena Ejemplo'); await t.page.click('#acPrimario');
  log('con todo bien se agrega: queda a nombre de la Jefe, con su NIT y la fecha de hoy', await hasta(t.page, () => { const ps = Object.values(JSON.parse(localStorage.getItem('__fb_datos')).proveedores); const p = ps.find(x => x.nombre === 'Almacén La Ceiba'); return !!p && p.nit === '900000002-1' && p.telefono === '300 111 2233' && p.correo === 'contacto.laceiba@example.com' && p.por === 'Carolina Castillo' && p.porRol === 'jefe' && /^\d{4}-\d{2}-\d{2}$/.test(p.en); }));
  await t.page.click('#invContenido [data-accion="nuevoprov"]'); await t.page.waitForSelector('#shAccion:not([hidden])');
  await t.page.fill('#pvNombre', 'Distribuciones del Cabo'); await t.page.fill('#pvNit', '900.000.002-1');
  log('el mismo NIT en otro proveedor no se acepta (el de La Ceiba)', /Ese NIT ya lo tiene «Almacén La Ceiba»/.test(await errPv()));
  await t.page.fill('#pvNit', '900.000.004-4'); await t.page.click('#acPrimario');
  log('un NIT con puntos se guarda limpio (900000004-4)', await hasta(t.page, () => { const p = Object.values(JSON.parse(localStorage.getItem('__fb_datos')).proveedores).find(x => x.nombre === 'Distribuciones del Cabo'); return !!p && p.nit === '900000004-4'; }));
  log('la lista ahora tiene 7 y el nuevo sale «Todavía sin compras»', await hasta(t.page, () => { const cs = [...document.querySelectorAll('#invContenido .card.tarea')]; return cs.length === 7 && cs.some(c => /Distribuciones del Cabo/.test(c.textContent) && /Todavía sin compras/.test(c.textContent)); }));

  // Borrar: solo la Jefe y solo si no tiene compras.
  const idCabo = await t.page.evaluate(() => Object.entries(JSON.parse(localStorage.getItem('__fb_datos')).proveedores).find(([, p]) => p.nombre === 'Distribuciones del Cabo')[0]);
  await t.page.click(`#invContenido .card.tarea[data-id="${idCabo}"]`); await t.page.waitForSelector('#shAccion:not([hidden])');
  log('un proveedor sin compras ofrece «Borrar»', await t.page.evaluate(() => !!document.querySelector('#acCampos [data-accion="borrarprov"]')));
  await t.page.click('#acCampos [data-accion="borrarprov"]'); await hasta(t.page, () => document.getElementById('acT').textContent === 'Borrar proveedor');
  await t.page.click('#acPrimario');
  log('al confirmar se borra y quedan 6', await hasta(t.page, id => { const p = JSON.parse(localStorage.getItem('__fb_datos')).proveedores; return !p[id] && Object.keys(p).length === 6; }, idCabo));
  await t.page.click('#invSecciones [data-sec="resumen"]');

  // --- Existencias como base de datos: bajar, cambiar en Excel, subir con vista previa y guardar ---
  console.log('2b. Base de datos de Existencias en Excel (Jefe)');
  const xlsxEx = (filas, ruta) => t.page.evaluate(async f => { const X = await window.Inventario.cargarXlsx(), l = X.utils.book_new(); X.utils.book_append_sheet(l, X.utils.json_to_sheet(f), 'Existencias'); return X.write(l, { type: 'base64', bookType: 'xlsx' }); }, filas).then(b => fs.writeFileSync(ruta, Buffer.from(b, 'base64')));
  const datosApp = () => t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos')));
  await t.page.click('#invSecciones [data-sec="existencias"]');
  log('Bodega trae «Descargar base de datos» y «Subir Excel»', await hasta(t.page, () => !!document.querySelector('#invContenido [data-accion="bdexcel"]') && !!document.getElementById('invArchivo')));
  const [descBd] = await Promise.all([t.page.waitForEvent('download', { timeout: 15000 }).catch(() => null), t.page.click('#invContenido [data-accion="bdexcel"]')]);
  log('la base de datos se baja con nombre «Base de datos Bodega …xlsx»', !!descBd && /^Base de datos Bodega .*\.xlsx$/.test(descBd.suggestedFilename()), descBd && descBd.suggestedFilename());
  if (descBd) {
    const ruta = path.join(CAPTURAS, 'base-existencias.xlsx'); await descBd.saveAs(ruta); const hs = await excelInfo(ruta), e = hs.find(h => h.nombre === 'Bodega');
    log('trae las hojas Bodega, Ayuda y una de listas oculta', ['Bodega', 'Ayuda', 'Listas'].every(n => hs.some(h => h.nombre === n)) && hs.find(h => h.nombre === 'Listas').oculta && !e.oculta, JSON.stringify(hs.map(h => h.nombre)));
    log('Bodega tiene el formato (título, negrillas, cuadros, fila fija, filtros) y las columnas de una base de datos', !!e && bienFormado(e) && e.titulos.join() === 'ID,Acción,Bodega,Artículo,Categoría,Unidad,Cantidad hoy,Cantidad real (conteo),Mínimo,Máximo,Ubicación,Precio aprox.,Proveedor,Estado,Valor en bodega', JSON.stringify(e && e.titulos));
    log('trae los 18 artículos con su código, una fila de ejemplo y filas vacías para agregar', !!e && e.filas.filter(f => /^ar-\d+$/.test(f[0])).length === 18 && e.filas.filter(f => /^Ejemplo/.test(f[1])).length === 1 && ['Riohacha', 'Guamal', 'Bogotá'].every(b => e.filas.some(f => f[2] === b)) && e.filas.filter(f => f.slice(0, 13).every(x => x === '')).length >= 15, JSON.stringify(e && e.filas.slice(17, 21)));
    log('tiene listas desplegables (acción, bodega, categoría, unidad), solo enteros desde 0 y fórmulas de Estado y Valor', await t.page.evaluate(async b64 => {
      const E = await window.Excel.cargar(), wb = new E.Workbook(); await wb.xlsx.load(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer);
      const ws = wb.getWorksheet('Bodega'), fila = ws.rowCount, dv = c => (ws.getCell(fila, c).dataValidation || {}).type;
      const f5 = ws.getCell(5, 14).value, v5 = ws.getCell(5, 15).value;
      return dv(2) === 'list' && dv(3) === 'list' && dv(5) === 'list' && dv(6) === 'list' && dv(8) === 'whole' && dv(9) === 'whole' && dv(10) === 'whole' && dv(12) === 'whole' && !dv(4) && !!f5 && /IF\(/.test(f5.formula || '') && !!v5 && /\*/.test(v5.formula || '');
    }, fs.readFileSync(ruta).toString('base64')));
  }
  // Un Excel con cambios buenos (precio, conteo, artículo nuevo, eliminar) y filas malas.
  const rutaBd = path.join(CAPTURAS, 'base-existencias-cambiada.xlsx');
  const nuevaFila = { Bodega: 'Riohacha', Artículo: 'Pilas AA', Categoría: 'Eléctricos', Unidad: 'paquetes', 'Cantidad real (conteo)': 7, Mínimo: 3, Máximo: 12, 'Precio aprox.': '$9.500', Ubicación: 'Bodega Riohacha · Estante B3', Proveedor: 'Tecnoguajira Suministros' };
  await xlsxEx([
    { ID: 'ar-002', 'Precio aprox.': 90000 },
    { ID: 'ar-003', 'Cantidad real (conteo)': 12 },
    nuevaFila,
    { ID: 'ar-015', Acción: 'Eliminar' },
    { ID: 'ar-004', Artículo: 'Guantes de vaqueta' },
    { Acción: 'Ejemplo (se ignora)', Artículo: 'Artículo de ejemplo', Categoría: 'EPP', Unidad: 'unidades', Mínimo: 2, Máximo: 10, 'Precio aprox.': 12000 },
    { ID: 'ar-999', Acción: 'Cambiar' },
    { Bodega: 'Riohacha', Artículo: 'Botas de seguridad talla 40', Categoría: 'EPP', Unidad: 'pares', Mínimo: 1, Máximo: 5, 'Precio aprox.': 1000 },
    { Bodega: 'Guamal', Artículo: 'Botas de seguridad talla 40', Categoría: 'EPP', Unidad: 'pares', Mínimo: 2, Máximo: 8, 'Precio aprox.': 85000 },
    { Bodega: 'Riohacha', Artículo: '=1+1', Categoría: 'EPP', Unidad: 'pares', Mínimo: 1, Máximo: 5, 'Precio aprox.': 1000 },
    { Bodega: 'Riohacha', Artículo: 'Cable raro', Categoría: 'Cosas', Unidad: 'unidades', Mínimo: 1, Máximo: 5, 'Precio aprox.': 1000 },
    { Bodega: 'Riohacha', Artículo: 'Mal máximo', Categoría: 'EPP', Unidad: 'pares', Mínimo: 5, Máximo: 2, 'Precio aprox.': 1 },
    { Bodega: 'Medellín', Artículo: 'En otra ciudad', Categoría: 'EPP', Unidad: 'pares', Mínimo: 1, Máximo: 5, 'Precio aprox.': 1000 },
    { ID: 'ar-001', Bodega: 'Guamal' },
    { Artículo: 'Sin bodega', Categoría: 'EPP', Unidad: 'pares', Mínimo: 1, Máximo: 5, 'Precio aprox.': 1000 }
  ], rutaBd);
  const antesBd = await datosApp();
  await t.page.setInputFiles('#invArchivo', rutaBd);
  log('al subir el Excel muestra lo que entendió: 2 para agregar, 2 para cambiar, 1 para eliminar, 8 con problema', await hasta(t.page, () => { const x = document.getElementById('invContenido').textContent; return /2 para agregar · 2 para cambiar · 1 para eliminar/.test(x) && /8 con problema/.test(x) && /1 ya estaba igual/.test(x) && /1 fila de ejemplo/.test(x); }), (await texto(t.page, '#invContenido')).slice(0, 400));
  log('explica cada cambio: el precio, el ajuste de cantidad, el artículo nuevo y que se elimina', await t.page.evaluate(() => { const x = document.getElementById('invContenido').textContent; return /Precio: \$\s?85\.000 → \$\s?90\.000/.test(x) && /Cantidad: 15 → 12 \(ajuste por conteo\)/.test(x) && /Cantidad inicial: 7/.test(x) && /Se elimina el artículo/.test(x) && /Pilas AA/.test(x); }), (await texto(t.page, '#invContenido')).slice(0, 900));
  log('marca el código que no existe, el nombre repetido en la misma bodega (en otra bodega sí se puede), la fórmula, la categoría mala, el máximo menor, la bodega que no existe, el cambio de bodega y la bodega que falta', await t.page.evaluate(() => { const x = document.getElementById('invContenido').textContent; return /El código ar-999 no está en la app/.test(x) && /Ya hay un artículo con ese nombre en la bodega de Riohacha/.test(x) && !/Ya hay un artículo con ese nombre en la bodega de Guamal/.test(x) && /No entendí la bodega «Medell/.test(x) && /no cambia un artículo de bodega/.test(x) && /Falta la bodega/.test(x) && /no puede empezar con/.test(x) && /No entendí la categoría «Cosas»/.test(x) && /El máximo debe ser mayor que el mínimo/.test(x); }));
  await t.page.screenshot({ path: path.join(CAPTURAS, '12-excel-existencias-vista-previa.png'), fullPage: true });
  const duranteVista = await datosApp();
  log('mientras se ve la vista previa no se guarda nada', Object.keys(duranteVista.articulos).length === Object.keys(antesBd.articulos).length && duranteVista.articulos['ar-002'].costo === antesBd.articulos['ar-002'].costo && !!duranteVista.articulos['ar-015']);
  await t.page.click('#invContenido [data-accion="exguardar"]');
  log('al haber algo que eliminar, la app pregunta antes', await hasta(t.page, () => !document.getElementById('cfSi').closest('[hidden]') && /Eliminar 1 artículo/.test(document.body.textContent)));
  await t.page.click('#cfSi');
  log('se guarda y avisa qué quedó hecho', await hasta(t.page, () => !document.querySelector('#invContenido [data-accion="exguardar"]') && /2 agregados, 2 cambiados, 1 eliminado/.test(document.body.textContent)), await texto(t.page, '#toast'));
  const despBd = await datosApp(), pilas = Object.entries(despBd.articulos).find(([, a]) => a.nombre === 'Pilas AA');
  log('el precio cambió y los demás datos de ese artículo quedaron igual', despBd.articulos['ar-002'].costo === 90000 && despBd.articulos['ar-002'].nombre === antesBd.articulos['ar-002'].nombre && despBd.articulos['ar-002'].cantidad === antesBd.articulos['ar-002'].cantidad);
  log('el conteo ajustó la cantidad a 12 y dejó su movimiento de ajuste (-3, saldo 12)', (() => { const a = despBd.articulos['ar-003'], m = despBd.movimientos[a.ultimoMov]; return a.cantidad === 12 && !!m && m.tipo === 'ajuste' && m.cantidad === -3 && m.saldo === 12 && m.articuloId === 'ar-003'; })());
  log('el artículo nuevo quedó con 7, precio 9500 y su movimiento de cantidad inicial', !!pilas && pilas[1].cantidad === 7 && pilas[1].costo === 9500 && pilas[1].categoria === 'Eléctricos' && despBd.movimientos[pilas[1].ultimoMov].motivo === 'inicial' && despBd.movimientos[pilas[1].ultimoMov].articuloId === pilas[0]);
  log('el cambio de precio dejó su ajuste de valor (cantidad 0, con el precio nuevo) y el artículo apunta a él', (() => { const a = despBd.articulos['ar-002'], m = despBd.movimientos[a.ultimoMov]; return !!m && m.tipo === 'ajuste' && m.motivo === 'precio' && m.cantidad === 0 && m.costoUnit === 90000 && m.articuloId === 'ar-002' && /Cambió el precio/.test(m.nota); })());
  log('se eliminó Papel higiénico y no se borró ningún movimiento (solo se sumaron el ajuste, la cantidad inicial y el cambio de precio)', !despBd.articulos['ar-015'] && Object.keys(despBd.movimientos).length === Object.keys(antesBd.movimientos).length + 3);
  log('las filas con problema no guardaron nada (sigue 1 sola «Botas de seguridad talla 40» en Riohacha y otra nueva en Guamal, no hay «Cable raro»)', Object.values(despBd.articulos).filter(a => a.nombre === 'Botas de seguridad talla 40' && a.bodega === 'Riohacha').length === 1 && Object.values(despBd.articulos).filter(a => a.nombre === 'Botas de seguridad talla 40' && a.bodega === 'Guamal').length === 1 && !Object.values(despBd.articulos).some(a => /Cable raro|Mal máximo|^=/.test(a.nombre)));
  // Volver a subir el mismo Excel no repite nada. (Se espera un momento a que lleguen los datos nuevos: si la lista se repinta justo mientras se escoge el archivo, el archivo se pierde.)
  await esp(900);
  await t.page.setInputFiles('#invArchivo', rutaBd);
  log('al subir el mismo Excel otra vez no hay nada nuevo que guardar (el artículo nuevo no se duplica)', await hasta(t.page, () => { const x = document.getElementById('invContenido').textContent; return /nada para guardar/.test(x) && !!document.querySelector('#invContenido [data-accion="exguardar"][disabled]'); }), (await texto(t.page, '#invContenido')).slice(0, 300));
  await t.page.click('#invContenido [data-accion="exdescartar"]');
  log('«Descartar» quita la vista previa', await hasta(t.page, () => !document.querySelector('#invContenido [data-accion="exguardar"]')));
  const rutaMal = path.join(CAPTURAS, 'no-es-existencias.xlsx');
  await t.page.evaluate(async () => { window.__x = await window.Inventario.cargarXlsx(); });
  fs.writeFileSync(rutaMal, Buffer.from(await t.page.evaluate(() => { const X = window.__x, l = X.utils.book_new(); X.utils.book_append_sheet(l, X.utils.json_to_sheet([{ Color: 'rojo', Peso: 3 }]), 'Otra'); return X.write(l, { type: 'base64', bookType: 'xlsx' }); }), 'base64'));
  await t.page.setInputFiles('#invArchivo', rutaMal);
  log('un Excel que no es de existencias se explica en español y no guarda nada', await hasta(t.page, () => /No encontré los títulos \(Artículo, Categoría, Unidad…\)/.test(document.getElementById('invContenido').textContent)));
  console.log('2c. Las 3 bodegas y los traslados (Jefe)');
  await t.page.click('#invSecciones [data-sec="existencias"]');
  await t.page.click('#invContenido [data-accion="exdescartar"]').catch(() => {});
  log('la sección se llama «Bodega» y trae el filtro de las 3 bodegas (Todas, Riohacha, Guamal y Bogotá)', await hasta(t.page, () => document.querySelector('#invSecciones [data-sec="existencias"]').textContent.trim() === 'Bodega' && [...document.querySelectorAll('#invContenido .chip[data-sub="bodega"]')].map(c => c.dataset.val).join() === 'todas,Riohacha,Guamal,Bogotá'));
  await t.page.click('#invContenido .chip[data-sub="bodega"][data-val="Guamal"]');
  log('al escoger Guamal solo salen los artículos de esa bodega', await hasta(t.page, () => { const c = [...document.querySelectorAll('#invContenido .card.art')]; return c.length >= 3 && c.every(x => /Bodega Guamal/.test(x.textContent)); }));
  await t.page.click('#invContenido [data-accion="nuevoart"]');
  log('«Agregar artículo» pide la bodega (3 opciones) y propone la que está filtrada', await hasta(t.page, () => { const s = document.getElementById('acBod'); return !!s && [...s.options].map(o => o.value).join() === 'Riohacha,Guamal,Bogotá' && s.value === 'Guamal'; }));
  await t.page.fill('#acNom', 'Extintor de 10 libras'); await t.page.fill('#acCosto', '95000'); await t.page.click('#acPrimario');
  log('el artículo nuevo se guarda en la bodega de Guamal', await hasta(t.page, () => !document.getElementById('shAccion') || document.getElementById('shAccion').hidden) && Object.values((await datosApp()).articulos).some(a => a.nombre === 'Extintor de 10 libras' && a.bodega === 'Guamal'));
  await t.page.click('#invContenido [data-accion="nuevoart"]');
  await t.page.fill('#acNom', 'extintor de 10 libras'); await t.page.fill('#acCosto', '95000'); await t.page.click('#acPrimario');
  log('el mismo nombre en la misma bodega no se deja', await hasta(t.page, () => !document.getElementById('acErr').hidden && /Ya hay un artículo con ese nombre en la bodega de Guamal/.test(document.getElementById('acErr').textContent)));
  await t.page.selectOption('#acBod', 'Bogotá'); await t.page.click('#acPrimario');
  log('en otra bodega el mismo nombre sí (Bogotá)', await hasta(t.page, () => !document.getElementById('shAccion') || document.getElementById('shAccion').hidden) && Object.values((await datosApp()).articulos).filter(a => a.nombre.toLowerCase() === 'extintor de 10 libras').map(a => a.bodega).sort().join() === 'Bogotá,Guamal');
  await t.page.click('#invContenido .chip[data-sub="bodega"][data-val="todas"]');
  // Traslado: Guantes de vaqueta (Riohacha, 10) -> Bogotá. Primero se crea allá; el segundo se suma al que ya está.
  await t.page.click('#invContenido [data-accion="verart"][data-id="ar-004"]');
  await t.page.click('#acCampos [data-accion="trasladar"]');
  log('«Trasladar» ofrece solo las otras 2 bodegas', await hasta(t.page, () => { const s = document.getElementById('acDest'); return !!s && [...s.options].map(o => o.value).join() === 'Guamal,Bogotá'; }));
  await t.page.selectOption('#acDest', 'Bogotá'); await t.page.fill('#acCant', '99'); await t.page.click('#acPrimario');
  log('no deja trasladar más de lo que hay', await hasta(t.page, () => !document.getElementById('acErr').hidden && /Solo hay 10 pares en Riohacha/.test(document.getElementById('acErr').textContent)));
  await t.page.fill('#acCant', '3'); await t.page.fill('#acNota', 'Para el proyecto de Bogotá'); await t.page.click('#acPrimario');
  await hasta(t.page, () => !document.getElementById('shAccion') || document.getElementById('shAccion').hidden);
  const d1 = await datosApp(), origen = d1.articulos['ar-004'], destino = Object.entries(d1.articulos).find(([, a]) => a.nombre === 'Guantes de vaqueta' && a.bodega === 'Bogotá');
  log('el traslado restó 3 en Riohacha y creó el artículo en Bogotá con 3 (mismos datos)', origen.cantidad === 7 && !!destino && destino[1].cantidad === 3 && destino[1].categoria === origen.categoria && destino[1].costo === origen.costo && destino[1].unidad === origen.unidad);
  const mSale = d1.movimientos[origen.ultimoMov], mEntra = destino && d1.movimientos[destino[1].ultimoMov];
  log('cada bodega dejó su movimiento (salida y entrada), unidos por el mismo traslado y con la nota', !!mSale && !!mEntra && mSale.tipo === 'salida' && mSale.motivo === 'traslado' && mSale.cantidad === 3 && mEntra.tipo === 'entrada' && mEntra.motivo === 'traslado' && mEntra.cantidad === 3 && !!mSale.trasladoId && mSale.trasladoId === mEntra.trasladoId && /Bogotá: Para el proyecto/.test(mSale.nota) && /desde Riohacha/.test(mEntra.nota));
  log('el traslado lleva el mismo costo: la salida y la entrada valen lo mismo (3 por el costo del artículo) y el artículo nuevo en Bogotá nace con ese costo', !!mSale && !!mEntra && mSale.costoUnit === origen.costo && mEntra.costoUnit === origen.costo && mSale.valor === 3 * origen.costo && mEntra.valor === 3 * origen.costo && mEntra.valorSaldo === 3 * origen.costo && destino[1].costo === origen.costo);
  await t.page.click('#invContenido [data-accion="verart"][data-id="ar-004"]');
  await t.page.click('#acCampos [data-accion="trasladar"]');
  await t.page.selectOption('#acDest', 'Bogotá'); await t.page.fill('#acCant', '2'); await t.page.click('#acPrimario');
  await hasta(t.page, () => !document.getElementById('shAccion') || document.getElementById('shAccion').hidden);
  const d2 = await datosApp(), enBogota = Object.values(d2.articulos).filter(a => a.nombre === 'Guantes de vaqueta' && a.bodega === 'Bogotá');
  log('un segundo traslado se suma al que ya estaba en Bogotá (no crea otro): 5 allá y 5 en Riohacha', enBogota.length === 1 && enBogota[0].cantidad === 5 && d2.articulos['ar-004'].cantidad === 5);
  log('el detalle del artículo dice en qué bodega está y el Resumen suma el valor de cada bodega', await t.page.evaluate(async () => { document.querySelector('#invSecciones [data-sec="resumen"]').click(); await new Promise(r => setTimeout(r, 300)); const x = document.getElementById('invContenido').textContent; return /Riohacha: \$[\s\d.]+ · Guamal: \$[\s\d.]+ · Bogotá: \$[\s\d.]+/.test(x); }), (await texto(t.page, '#invContenido')).slice(0, 400));
  await t.page.click('#invSecciones [data-sec="resumen"]');
  await t.page.click('#invSecciones [data-sec="compras"]');
  await t.page.click('#invContenido .chip[data-val="todas"]');
  await t.page.click('#invContenido [data-accion="vercompra"][data-id="co-007"]');
  log('el detalle de una compra muestra cómo va (historial)', await hasta(t.page, () => !document.getElementById('shAccion').hidden && document.querySelectorAll('#acCampos .linea li').length >= 3 && /Recibido en bodega/.test(document.getElementById('acCampos').textContent)));
  await t.page.keyboard.press('Escape');
  await t.page.click('#invSecciones [data-sec="hacer"]');
  await t.page.click('.tab[data-vista="vehiculos"]');
  await esp(900);
  log('Vehículos: tablero con 2 disponibles, 1 en uso, 1 novedad sin revisar y 4 «documentos y mantenimientos» (2 documentos mal y 2 mantenimientos por hacer)', await hasta(t.page, () => document.querySelectorAll('#sumVehiculos .sum').length === 4) && (await cifra(t.page, 'sumVehiculos', 0)) === 2 && (await cifra(t.page, 'sumVehiculos', 1)) === 1 && (await cifra(t.page, 'sumVehiculos', 2)) === 1 && (await cifra(t.page, 'sumVehiculos', 3)) === 4 && /Documentos y mantenimientos/.test(await texto(t.page, '#sumVehiculos')), await texto(t.page, '#sumVehiculos'));
  log('Vehículos: a la Jefe le tocan los viajes, el rayón por revisar y los 2 documentos', await hasta(t.page, () => { const x = document.getElementById('vehContenido').textContent; return /Viajes de reuniones \(2\)/.test(x) && /Novedades por revisar \(1\)/.test(x) && /Rayón/.test(x) && /Documentos por vencer o vencidos \(2\)/.test(x); }), await texto(t.page, '#vehContenido'));
  log('Vehículos: al entrar la Jefe se crea el aviso de cada documento para Jefe, Transporte y Bodega (una sola vez)', await hasta(t.page, () => Object.keys(JSON.parse(localStorage.getItem('__fb_datos')).avisos).filter(k => k.startsWith('doc-')).length === 6));
  // Plan de mantenimiento por km o fecha (Fase 9)
  log('Vehículos: a la Jefe le toca «Mantenimientos por hacer (2)»: el DEF 456 ya tocaba (va primero) y el ABC 123 está por tocar', await hasta(t.page, () => { const s = [...document.querySelectorAll('#vehContenido .section-label')].find(x => /Mantenimientos por hacer \(2\)/.test(x.textContent)); if (!s) return false; const c = [...s.nextElementSibling.querySelectorAll('.card')]; return c.length === 2 && /DEF 456/.test(c[0].textContent) && /Toca ya: se pasó 300 km/.test(c[0].textContent) && /ABC 123/.test(c[1].textContent) && /Pronto: faltan 90 km/.test(c[1].textContent) && c.every(x => !!x.querySelector('[data-accion="mttohecho"]')); }), await t.page.evaluate(() => { const s = [...document.querySelectorAll('#vehContenido .section-label')].find(x => /Mantenimientos por hacer/.test(x.textContent)); return s ? s.textContent + ' || ' + [...s.nextElementSibling.querySelectorAll('.card')].map(c => c.textContent.replace(/\s+/g, ' ')).join(' ## ') : 'sin sección'; }));
  // Tanqueos y costo por carro (Fase 10), con los datos de ejemplo todavía sin tocar
  await t.page.click('#vehSecciones [data-sec="tanqueos"]');
  log('«Tanqueos» lista los 17 de ejemplo (el más nuevo primero) y avisa que hay 1 con consumo raro, el del ABC 123', await hasta(t.page, () => { const c = document.querySelectorAll('#vehContenido .list .card'), x = document.getElementById('vehContenido').textContent; return c.length === 17 && /1 tanqueo con consumo raro/.test(x) && /ABC 123/.test(c[0].textContent) && /Consumo raro: \d+ % menos de lo normal/.test(c[0].textContent) && /Rindió 16,0 km por galón/.test(c[0].textContent); }), await texto(t.page, '#vehContenido'));
  log('solo los tanques llenos que cierran un tramo dicen lo que rindieron (12 de 17) y el que no llenó el tanque lo dice', await hasta(t.page, () => { const c = [...document.querySelectorAll('#vehContenido .list .card')]; return c.filter(x => /Rindió/.test(x.textContent)).length === 12 && c.filter(x => /no llenó el tanque/.test(x.textContent)).length === 1 && c.filter(x => /Consumo raro:/.test(x.textContent)).length === 1; }));
  log('la Jefe ve el botón «Registrar tanqueo» y cada tanqueo trae la foto del recibo', await hasta(t.page, () => !!document.querySelector('#vehContenido [data-accion="tanqueo"]') && [...document.querySelectorAll('#vehContenido .list .card')].every(x => !!x.querySelector('img.nov-foto'))));
  await t.page.screenshot({ path: path.join(CAPTURAS, '22-tanqueos.png'), fullPage: true });
  await t.page.click('#vehSecciones [data-sec="resumen"]');
  log('Resumen: el costo total del mes es novedades + mantenimientos hechos + combustible (lo recalculo aparte, desde los datos)', await hasta(t.page, () => { const App = window.App, d = App.S.datos, ini = App.hoyISO().slice(0, 8) + '01', en = f => String(f || '').slice(0, 10) >= ini;
    const nov = d.novedades.filter(n => en(n.fecha)).reduce((s, n) => s + (Number(n.costo) || 0), 0), mtt = d.vehiculos.flatMap(v => (v.mttos || []).flatMap(m => m.hechos || [])).filter(h => en(h.fecha)).reduce((s, h) => s + h.costo, 0), comb = d.tanqueos.filter(x => en(x.fecha)).reduce((s, x) => s + x.valor, 0);
    const card = [...document.querySelectorAll('#vehContenido .resumen-grid .card')].find(c => /Costo total de los carros este mes/.test(c.textContent));
    return comb > 0 && !!card && card.querySelector('.rm-n').textContent === App.cop(nov + mtt + comb) && card.textContent.includes('combustible ' + App.cop(comb)) && card.textContent.includes('mantenimientos ' + App.cop(mtt)); }), await texto(t.page, '#vehContenido'));
  log('Resumen: «Costo de cada carro este mes» trae los 4 carros, el que más gastó primero, y su combustible', await hasta(t.page, () => { const App = window.App, d = App.S.datos, ini = App.hoyISO().slice(0, 8) + '01';
    const s = [...document.querySelectorAll('#vehContenido .section-label')].find(x => /Costo de cada carro este mes/.test(x.textContent)); if (!s) return false;
    const c = [...s.nextElementSibling.querySelectorAll('.card')], tot = k => parseInt(k.querySelector('.valor').textContent.replace(/\D/g, ''), 10);
    return c.length === 4 && c.every((k, i) => i === 0 || tot(c[i - 1]) >= tot(k)) && c.every(k => { const placa = (k.querySelector('.placa') || {}).textContent, v = d.vehiculos.find(x => x.placa === placa); return !!v && k.textContent.includes('Combustible ' + App.cop(d.tanqueos.filter(x => x.vehiculoId === v.id && String(x.fecha).slice(0, 10) >= ini).reduce((q, x) => q + x.valor, 0))); }); }), await texto(t.page, '#vehContenido'));
  await t.page.screenshot({ path: path.join(CAPTURAS, '23-costo-por-carro.png'), fullPage: true });
  await t.page.click('#vehSecciones [data-sec="hacer"]');
  const abiertaV = () => t.page.waitForSelector('#shVeh:not([hidden])');
  const hoyApp = await t.page.evaluate(() => window.App.hoyISO());
  await t.page.click('#vehContenido [data-accion="mttohecho"][data-id="ve-def456"]'); await abiertaV();
  log('«Hecho» pide el kilometraje (ya puesto), la fecha de hoy, el costo y una nota', await hasta(t.page, h => /Mantenimiento hecho: Cambio de aceite/.test(document.getElementById('veT').textContent) && document.getElementById('vmKm').value === '62800' && document.getElementById('vmFecha').value === h && !!document.getElementById('vmCosto') && !!document.getElementById('vmNota'), hoyApp));
  await t.page.fill('#vmKm', '70000'); await t.page.click('#vePrimario');
  log('un kilometraje muy alto no deja guardar', await hasta(t.page, () => !document.getElementById('veErr').hidden && /muy alto/.test(document.getElementById('veErr').textContent)));
  await t.page.fill('#vmKm', '62800'); await t.page.fill('#vmFecha', '2000-01-01'); await t.page.click('#vePrimario');
  log('una fecha anterior a la última vez que se hizo no deja guardar (el plan no va hacia atrás)', await hasta(t.page, () => !document.getElementById('veErr').hidden && /anterior a la última vez/.test(document.getElementById('veErr').textContent)));
  await t.page.fill('#vmFecha', hoyApp); await t.page.fill('#vmKm', '10'); await t.page.click('#vePrimario');
  log('un kilometraje menor que el de la última vez no deja guardar', await hasta(t.page, () => !document.getElementById('veErr').hidden && /menor que el de la última vez/.test(document.getElementById('veErr').textContent)));
  await t.page.fill('#vmKm', '62900'); await t.page.fill('#vmCosto', '210000'); await t.page.fill('#vmNota', 'También se cambió el filtro');
  await t.page.click('#vePrimario');
  log('al guardar, el plan queda al día (último km, fecha y costo), el carro sube de kilometraje y el historial guarda la línea', await hasta(t.page, h => { const v = JSON.parse(localStorage.getItem('__fb_datos')).vehiculos['ve-def456'], m = v.mttos.find(x => x.id === 'mt-aceite'); return v.km === 62900 && m.ultimoKm === 62900 && m.ultimaFecha === h && m.ultimoCosto === 210000 && /Mantenimiento hecho: Cambio de aceite \(62\.900 km/.test(v.historial[v.historial.length - 1].texto) && /costó/.test(v.historial[v.historial.length - 1].texto) && /filtro/.test(v.historial[v.historial.length - 1].texto); }, hoyApp));
  await hasta(t.page, () => /Mantenimientos por hacer \(1\)/.test(document.getElementById('vehContenido').textContent)); await esp(900);
  log('y el DEF 456 sale de «Mantenimientos por hacer» (queda 1) y el tablero baja a 3', await hasta(t.page, () => /Mantenimientos por hacer \(1\)/.test(document.getElementById('vehContenido').textContent) && !/DEF 456[\s\S]{0,40}Toca ya/.test(document.getElementById('vehContenido').textContent)), await texto(t.page, '#sumVehiculos'));
  log('el tablero de Vehículos baja a 3 (2 documentos y 1 mantenimiento)', (await cifra(t.page, 'sumVehiculos', 3)) === 3, await texto(t.page, '#sumVehiculos'));
  await t.page.click('#vehSecciones [data-sec="carros"]');
  log('Carros: la tarjeta del ABC 123 avisa «Cambio de aceite: faltan 90 km»', await hasta(t.page, () => [...document.querySelectorAll('#vehContenido .card')].some(c => /ABC 123/.test(c.textContent) && /Cambio de aceite: faltan 90 km/.test(c.textContent))));
  await t.page.click('#vehContenido [data-accion="ver"][data-id="ve-jkl012"]'); await abiertaV();
  log('la hoja de vida trae el «Plan de mantenimiento» con su tarea al día y el botón «Agregar tarea al plan»', await hasta(t.page, () => /Plan de mantenimiento \(1\)/.test(document.getElementById('veCampos').textContent) && /Revisión de los 10\.000 km/.test(document.getElementById('veCampos').textContent) && /Al día/.test(document.getElementById('veCampos').textContent) && !!document.querySelector('#veCampos [data-accion="mttonuevo"]')));
  await t.page.screenshot({ path: path.join(CAPTURAS, '21-plan-mantenimiento.png'), fullPage: true });
  await t.page.click('#veCampos [data-accion="mttonuevo"]'); await hasta(t.page, () => !!document.getElementById('vtTarea'));
  await t.page.click('#vePrimario');
  log('agregar una tarea sin nombre no deja guardar', await hasta(t.page, () => !document.getElementById('veErr').hidden && /Escribe qué se hace/.test(document.getElementById('veErr').textContent)));
  await t.page.fill('#vtTarea', 'Rotación de llantas'); await t.page.fill('#vtCadaKm', '0'); await t.page.fill('#vtCadaDias', '0'); await t.page.click('#vePrimario');
  log('sin «cada cuántos km» ni «cada cuántos días» no deja guardar', await hasta(t.page, () => /al menos uno/.test(document.getElementById('veErr').textContent)));
  await t.page.fill('#vtCadaKm', '8000'); await t.page.fill('#vtUltKm', '99999'); await t.page.click('#vePrimario');
  log('el kilometraje de la última vez no puede ser mayor que el de hoy', await hasta(t.page, () => /no puede ser mayor/.test(document.getElementById('veErr').textContent)));
  await t.page.fill('#vtUltKm', '21340'); await t.page.click('#vePrimario');
  log('con todo bien, la tarea se agrega, la hoja vuelve a la hoja de vida y la tarea sale «Al día: faltan 8.000 km»', await hasta(t.page, () => { const v = JSON.parse(localStorage.getItem('__fb_datos')).vehiculos['ve-jkl012']; return v.mttos.length === 2 && v.mttos[1].tarea === 'Rotación de llantas' && v.mttos[1].cadaKm === 8000 && /Plan de mantenimiento: agregó «Rotación de llantas»/.test(v.historial[v.historial.length - 1].texto) && /Plan de mantenimiento \(2\)/.test(document.getElementById('veCampos').textContent) && /Al día: faltan 8\.000 km/.test(document.getElementById('veCampos').textContent); }));
  // Una tarea solo por días: la última vez fue hace 20 días y es cada 30, así que faltan 10 y ya es «Pronto»
  const hace20 = await t.page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 20); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await hasta(t.page, () => !!document.querySelector('#veCampos [data-accion="mttonuevo"]'));
  await t.page.click('#veCampos [data-accion="mttonuevo"]'); await hasta(t.page, () => !!document.getElementById('vtTarea'));
  await t.page.fill('#vtTarea', 'Revisión de gases'); await t.page.fill('#vtCadaKm', '0'); await t.page.fill('#vtCadaDias', '30'); await t.page.fill('#vtUltFecha', hace20);
  await t.page.click('#vePrimario');
  log('una tarea solo por días (cada 30, la última vez hace 20) sale «Pronto: faltan 10 días»', await hasta(t.page, () => /Plan de mantenimiento \(3\)/.test(document.getElementById('veCampos').textContent) && /Revisión de gases[\s\S]*Pronto: faltan 10 días/.test(document.getElementById('veCampos').textContent)));
  const quitarTarea = async nombre => {
    const id = await t.page.evaluate(n => JSON.parse(localStorage.getItem('__fb_datos')).vehiculos['ve-jkl012'].mttos.find(m => m.tarea === n).id, nombre);
    await hasta(t.page, () => !!document.querySelector('#veCampos [data-accion="mttoquitar"]'));
    await t.page.click(`#veCampos [data-accion="mttoquitar"][data-mtto="${id}"]`); await hasta(t.page, n => document.getElementById('veT').textContent.includes('Quitar «' + n + '»'), nombre);
    await t.page.click('#vePrimario');
    return hasta(t.page, n => { const v = JSON.parse(localStorage.getItem('__fb_datos')).vehiculos['ve-jkl012']; return !v.mttos.some(m => m.tarea === n) && v.historial[v.historial.length - 1].texto.includes('quitó «' + n + '»'); }, nombre);
  };
  log('«Quitar del plan» la saca y el historial guarda que se quitó', await quitarTarea('Revisión de gases'));
  await quitarTarea('Rotación de llantas');
  await hasta(t.page, () => !document.getElementById('shVeh').hidden && /Plan de mantenimiento \(1\)/.test(document.getElementById('veCampos').textContent)); await esp(600);
  await t.page.keyboard.press('Escape'); await hasta(t.page, () => document.getElementById('shVeh').hidden);
  await t.page.click('#vehSecciones [data-sec="hacer"]');
  await t.page.click('#vehSecciones [data-sec="carros"]');
  log('Vehículos: 4 carros con placa, el SOAT por vencer y la técnico-mecánica vencida', await hasta(t.page, () => { const x = document.getElementById('vehContenido').textContent; return document.querySelectorAll('#vehContenido .card .placa').length === 4 && /SOAT: vence en 12 días/.test(x) && /Técnico-mecánica: venció hace 5 días/.test(x) && /En taller/.test(x); }), await texto(t.page, '#vehContenido'));
  // Buscador y filtros de Carros (Fase 8)
  const vehs = Object.values((await datosApp()).vehiculos), nEstado = e => vehs.filter(v => v.estado === e).length;
  const tarjetasCarros = () => t.page.evaluate(() => [...document.querySelectorAll('#vehContenido .card .placa')].map(x => x.textContent));
  log('Carros: hay un buscador y chips Todos, Disponible, En uso, En taller y Documentos, cada uno con su número', await hasta(t.page, ([n, d, u, ta]) => { const c = [...document.querySelectorAll('#vehContenido .chip[data-accion="filtroveh"]')].map(x => [x.firstChild.textContent.trim(), Number(x.querySelector('.n').textContent)]); return !!document.getElementById('qVeh') && c.map(x => x[0]).join() === 'Todos,Disponible,En uso,En taller,Documentos y mantenimientos' && c[0][1] === n && c[1][1] === d && c[2][1] === u && c[3][1] === ta; }, [vehs.length, nEstado('disponible'), nEstado('en-uso'), nEstado('en-taller')]));
  await t.page.click('#vehContenido .chip[data-id="uso"]');
  log('Carros: el chip «En uso» deja solo esos carros y también marca la cifra de arriba', await hasta(t.page, n => document.querySelectorAll('#vehContenido .card .placa').length === n && [...document.querySelectorAll('#vehContenido .card')].every(c => /En uso/.test(c.textContent)) && document.querySelector('#vehContenido .chip[data-id="uso"]').getAttribute('aria-pressed') === 'true' && document.querySelector('#sumVehiculos button.sum[data-filtro="uso"]').getAttribute('aria-pressed') === 'true', nEstado('en-uso')));
  await t.page.click('#vehContenido .chip[data-id="docs"]');
  log('Carros: el chip «Documentos y mantenimientos» deja los de SOAT, técnico-mecánica o plan de mantenimiento por vencer o vencidos', await hasta(t.page, () => { const c = [...document.querySelectorAll('#vehContenido .card')]; return c.length >= 1 && c.every(x => /vence en|venció hace|Cambio de aceite|faltan|se pasó/.test(x.textContent)); }));
  await t.page.click('#vehContenido .chip[data-id=""]');
  log('Carros: «Todos» quita el filtro', await hasta(t.page, n => document.querySelectorAll('#vehContenido .card .placa').length === n, vehs.length));
  await t.page.fill('#qVeh', 'jkl');
  log('Carros: el buscador encuentra por la placa (aunque se escriba en minúscula)', await hasta(t.page, () => { const p = [...document.querySelectorAll('#vehContenido .card .placa')].map(x => x.textContent); return p.length === 1 && /JKL 012/.test(p[0]); }));
  await t.page.fill('#qVeh', 'farf');
  log('Carros: también por el conductor', await hasta(t.page, n => { const p = [...document.querySelectorAll('#vehContenido .card .placa')].map(x => x.textContent); return p.length >= 1 && p.length <= n; }, vehs.length - 1));
  await t.page.fill('#qVeh', 'jkl'); await t.page.click('#vehContenido .chip[data-id="uso"]');
  log('Carros: buscador y chip se suman; sin resultados dice «No hay carros con ese filtro» y ofrece «Quitar filtro»', await hasta(t.page, () => /No hay carros con ese filtro/.test(document.getElementById('vehContenido').textContent) && !!document.querySelector('#vehContenido [data-accion="filtroveh"][data-modo="todo"]')));
  await t.page.click('#vehContenido [data-accion="filtroveh"][data-modo="todo"]');
  log('Carros: «Quitar filtro» limpia el chip y la búsqueda', await hasta(t.page, n => document.querySelectorAll('#vehContenido .card .placa').length === n && document.getElementById('qVeh').value === '', vehs.length));
  await t.page.click('#vehContenido [data-accion="ver"][data-id="ve-abc123"]');
  log('la hoja de vida muestra la novedad, la salida con sus 5 fotos y el historial', await hasta(t.page, () => !document.getElementById('shVeh').hidden && document.querySelectorAll('#veCampos .ent-foto').length === 5 && /Rayón/.test(document.getElementById('veCampos').textContent) && /Salió con Oscar Farfán/.test(document.getElementById('veCampos').textContent)));
  log('la hoja de vida dice cómo salió la revisión por grupos (las salidas viejas, de 4 casillas, también se leen)', await hasta(t.page, () => /Críticos: bien · Otros: bien/.test(document.getElementById('veCampos').textContent)));
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
  log('cambia a Oscar Farfán (Conductor)', await cambiar(t.page, 'conductor'));
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
  log('Carlos pide una compra: queda por autorizar, con su rol, y aviso para la Coordinadora de compras', await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')); const c = Object.values(d.compras).find(x => x.que === 'Llanta de repuesto para el ABC 123'); return c && c.estado === 'pedido' && c.pideRol === 'conductor' && c.historial.length === 1 && Object.values(d.avisos).some(a => a.para === 'coordcompras' && /Llanta de repuesto/.test(a.texto)); }));
  log('la compra aparece en «Tus compras pedidas»', await hasta(t.page, () => /Tus compras pedidas \(1\)/.test(document.getElementById('invContenido').textContent)));
  await t.page.click('#btnPedirMaterial');
  await t.page.waitForSelector('#shAccion:not([hidden])');
  await t.page.click('#acPrimario');
  log('Pedir material sin decir para qué no deja guardar', await hasta(t.page, () => !document.getElementById('acErr').hidden && /para qué/.test(document.getElementById('acErr').textContent)));
  await t.page.selectOption('#acArt', 'ar-018'); await t.page.fill('#acCant', '1'); await t.page.fill('#acPara', 'Revisar llantas de noche');
  await t.page.click('#acPrimario');
  log('Conductor pide una linterna: queda en sus pedidos', await hasta(t.page, () => document.getElementById('shAccion').hidden && /Tus pedidos de material \(2\)/.test(document.getElementById('invContenido').textContent)));
  const solNueva = await t.page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).solicitudes).find(s => s.paraQue === 'Revisar llantas de noche'));
  log('el pedido se guardó con quién lo pide y en espera', solNueva && solNueva.pide === 'Oscar Farfán' && solNueva.pideRol === 'conductor' && solNueva.estado === 'pendiente' && solNueva.articuloId === 'ar-018', JSON.stringify(solNueva));
  console.log('4a. Gerente general (Oscar): ve todo a detalle y autoriza lo grande y lo que pide la Coordinadora');
  log('cambia a Oscar Muñoz (Gerente)', await cambiar(t.page, 'gerente'));
  await t.page.click('.tab[data-vista="inicio"]');
  await esp(900);
  log('el Gerente ve 7 cifras: agotados o bajos, por autorizar (1), en curso, sin autorizar, actas de equipos, documentos de carros y próximas reuniones', (await t.page.locator('#sumInicio .sum').count()) === 7 && /SOAT o técnico-mecánica/.test(await texto(t.page, '#sumInicio')) && (await cifra(t.page, 'sumInicio', 1)) === 1 && /Compras en curso/.test(await texto(t.page, '#sumInicio')) && /Próximas reuniones/.test(await texto(t.page, '#sumInicio')), await texto(t.page, '#sumInicio'));
  log('el Gerente ve todos los módulos (ninguno con candado)', (await t.page.locator('#modulosLista .modulo.bloqueado').count()) === 0);
  await t.page.click('.tab[data-vista="inventario"]');
  log('Inventario del Gerente: Resumen, Compras, Proveedores, Existencias y Pedidos (sin tareas, movimientos ni conteo)', await hasta(t.page, () => [...document.querySelectorAll('#invSecciones [data-sec]')].map(b => b.dataset.sec).join(',') === 'resumen,compras,proveedores,existencias,solicitudes'));
  await t.page.click('#invSecciones [data-sec="proveedores"]');
  log('el Gerente ve los proveedores y lo que se les ha comprado, sin botón para agregar', await hasta(t.page, () => document.querySelectorAll('#invContenido .card.tarea').length >= 5 && !document.querySelector('#invContenido [data-accion="nuevoprov"]') && /Aquí ves a quién se le compra/.test(document.getElementById('invContenido').textContent)));
  await t.page.click('#invSecciones [data-sec="resumen"]');
  log('el Gerente general no pide material; solo puede «Hacer una compra» (nace autorizada)', await t.page.locator('#btnPedirMaterial').isHidden() && await t.page.locator('#btnPedirCompra').isVisible() && (await texto(t.page, '#btnPedirCompraTxt')) === 'Hacer una compra');
  log('en el Resumen le toca autorizar solo los portátiles de Ángel (más de 5 millones, ya pasados por la Coordinadora): no la de Carlos ni la de Ana', await hasta(t.page, () => /Te toca a ti \(1\)/.test(document.getElementById('invContenido').textContent) && document.querySelectorAll('#invContenido [data-accion="autorizar"]').length === 1 && !!document.querySelector('#invContenido [data-accion="autorizar"][data-id="co-009"]') && /Cambiar el monto|El monto lo cambia el Gerente general/.test(document.getElementById('invContenido').textContent)));
  await t.page.screenshot({ path: path.join(CAPTURAS, '04-inventario-gerente.png'), fullPage: true });
  await t.page.click('#invContenido [data-accion="autorizar"][data-id="co-009"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.click('#acPrimario');
  log('el Gerente general autoriza los portátiles: pasa a Compras con aviso a Compras y a la Coordinadora', await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')); const c = d.compras['co-009']; return c.estado === 'autorizado' && c.autoriza === 'Oscar Muñoz' && c.autorizaJefe === 'Mauricio Giraldo' && c.historial.some(h => h.texto === 'El Gerente general autorizó la compra' && h.por === 'Oscar Muñoz') && Object.values(d.avisos).some(a => a.para === 'compras' && /autorizó comprar 2 unidades de Portátiles/.test(a.texto)) && Object.values(d.avisos).some(a => a.para === 'coordcompras' && /Gerente general autorizó la compra/.test(a.titulo)); }));
  await t.page.click('#invSecciones [data-sec="existencias"]');
  log('el Gerente ve las existencias sin botones de bodega', await hasta(t.page, () => document.querySelectorAll('#invContenido .card.art').length === Object.keys(JSON.parse(localStorage.getItem('__fb_datos')).articulos).length && !document.querySelector('#invContenido [data-accion="nuevoart"], #invContenido [data-accion="entrada"]')));
  await t.page.click('#invContenido [data-accion="verart"][data-id="ar-004"]');
  log('el detalle del artículo no muestra movimientos sueltos ni botones', await hasta(t.page, () => !document.getElementById('shAccion').hidden && /Hay/.test(document.getElementById('acCampos').textContent) && !/Últimos movimientos/.test(document.getElementById('acCampos').textContent) && !document.querySelector('#acCampos [data-accion]')));
  await t.page.keyboard.press('Escape');
  await t.page.click('#invSecciones [data-sec="compras"]');
  log('el Gerente ve las compras a detalle pero no registra compras', await hasta(t.page, () => document.querySelectorAll('#invContenido [data-accion="vercompra"]').length > 0 && !document.querySelector('#invContenido [data-accion="sinaut"]')));
  await t.page.click('#invSecciones [data-sec="solicitudes"]');
  log('el Gerente ve los pedidos de material de todos', await hasta(t.page, () => /Jorge Ibarra/.test(document.getElementById('invContenido').textContent) && !document.querySelector('#invContenido [data-accion="entregar"]')));

  await t.page.click('.tab[data-vista="vehiculos"]');
  log('Vehículos del Gerente: Resumen, Reportes, Carros, Novedades y Tanqueos, con el costo del mes', await hasta(t.page, () => [...document.querySelectorAll('#vehSecciones [data-sec]')].map(b => b.dataset.sec).join(',') === 'resumen,reportes,carros,novedades,tanqueos' && /Costo de novedades este mes/.test(document.getElementById('vehContenido').textContent) && /Costo total de los carros este mes/.test(document.getElementById('vehContenido').textContent)), await texto(t.page, '#vehContenido'));
  await t.page.click('#vehSecciones [data-sec="reportes"]');
  await t.page.click('#vehContenido [data-periodo="todo"]');
  log('Reportes del Gerente: por carro (4), por conductor y salidas con km recorridos', await hasta(t.page, () => { const x = document.getElementById('vehContenido').textContent; return document.querySelectorAll('#vehContenido .card[data-accion="ver"]').length === 4 && /Por conductor/.test(x) && /Oscar Farfán/.test(x) && /Salidas y llegadas \(2\)/.test(x) && /100 km en/.test(x) && /todavía no llega/.test(x); }), await texto(t.page, '#vehContenido'));
  log('Reportes del Gerente: trae el costo total de los carros y, en cada carro, el combustible, lo que rinde (ABC 123: 26,4 km por galón) y el total', await hasta(t.page, () => { const c = [...document.querySelectorAll('#vehContenido .card[data-accion="ver"]')], abc = c.find(x => /ABC 123/.test(x.textContent)); return /Costo total de los carros/.test(document.getElementById('vehContenido').textContent) && !!abc && /26,4 km por galón/.test(abc.textContent) && /Combustible \$/.test(abc.textContent) && /Total \$/.test(abc.textContent) && c.every(x => /Total \$/.test(x.textContent)); }), await texto(t.page, '#vehContenido'));
  await t.page.screenshot({ path: path.join(CAPTURAS, '06b-reportes-gerente.png'), fullPage: true });
  const [excelVeh] = await Promise.all([t.page.waitForEvent('download', { timeout: 15000 }).catch(() => null), t.page.click('#vehContenido [data-accion="excelveh"]')]);
  if (excelVeh) { const ruta = path.join(CAPTURAS, 'excel-vehiculos.xlsx'); await excelVeh.saveAs(ruta); const hs = await excelInfo(ruta); log('el Excel de vehículos tiene el mismo formato (título, negrillas, cuadros) en sus 5 hojas', hs.length === 5 && hs.every(bienFormado), JSON.stringify(hs.map(h => [h.nombre, bienFormado(h)]))); }
  log('el Gerente descarga el Excel de vehículos', !!excelVeh && /^Vehiculos .*\.xlsx$/.test(excelVeh.suggestedFilename()), excelVeh ? excelVeh.suggestedFilename() : 'sin descarga');
  if (excelVeh) { const hs2 = await excelInfo(path.join(CAPTURAS, 'excel-vehiculos.xlsx')); log('el Excel de salidas y llegadas trae la revisión por grupos (críticos y otros, de la salida y de la llegada)', hs2.some(h => ['Críticos (salida)', 'Otros (salida)', 'Críticos (llegada)', 'Otros (llegada)'].every(c => h.titulos.includes(c))), JSON.stringify(hs2.map(h => h.titulos.join('|'))).slice(0, 300)); }
  if (excelVeh) {
    const hs3 = await excelInfo(path.join(CAPTURAS, 'excel-vehiculos.xlsx')), carros = hs3.find(h => h.nombre === 'Carros'), tan = hs3.find(h => h.nombre === 'Tanqueos');
    log('el Excel de Carros trae el costo de mantenimientos, de combustible y el total, y lo que rinde cada carro', !!carros && ['Costo mantenimientos', 'Costo combustible', 'Costo total', 'Km por galón', 'Costo combustible por km'].every(c => carros.titulos.includes(c)), carros && carros.titulos.join('|'));
    const iTot = carros ? carros.titulos.indexOf('Costo total') : -1, iNov = carros ? carros.titulos.indexOf('Costo novedades') : -1, iMtt = carros ? carros.titulos.indexOf('Costo mantenimientos') : -1, iCom = carros ? carros.titulos.indexOf('Costo combustible') : -1;
    log('en cada carro, el costo total del Excel es novedades + mantenimientos + combustible', !!carros && carros.filas.length === 4 && carros.filas.every(f => Number(f[iTot]) === Number(f[iNov]) + Number(f[iMtt]) + Number(f[iCom]) && Number(f[iCom]) > 0), carros && JSON.stringify(carros.filas.map(f => [f[0], f[iNov], f[iMtt], f[iCom], f[iTot]])));
    log('la hoja «Tanqueos» trae los 17 tanqueos con placa, galones, valor y lo que rindió (12), y marca 1 con consumo raro', !!tan && tan.filas.length === 17 && ['Fecha', 'Placa', 'Km', 'Galones', 'Valor', 'Km por galón', 'Consumo raro', 'Registró'].every(c => tan.titulos.includes(c)) && tan.filas.filter(f => f[tan.titulos.indexOf('Consumo raro')] === 'Sí').length === 1 && tan.filas.filter(f => f[tan.titulos.indexOf('Km por galón')] !== '').length === 12, tan && JSON.stringify(tan.filas.slice(0, 3)));
  }
  await t.page.click('.tab[data-vista="equipos"]'); await esp(300);
  const [excelEq] = await Promise.all([t.page.waitForEvent('download', { timeout: 15000 }).catch(() => null), t.page.click('#btnExcelEq')]);
  if (excelEq) { const ruta = path.join(CAPTURAS, 'excel-equipos.xlsx'); await excelEq.saveAs(ruta); const hs = await excelInfo(ruta);
    log('el Excel de Equipos trae equipos y actas con el mismo formato, y sin cédulas ni firmas', /^Equipos .*\.xlsx$/.test(excelEq.suggestedFilename()) && hs.length === 2 && hs.every(bienFormado) && hs[0].filas.length >= 5 && !JSON.stringify(hs).match(/\b(1020304050|1030405060|1040506070|1050607080|1070809010|1080901020)\b|data:image/), JSON.stringify(hs.map(h => [h.nombre, bienFormado(h), h.filas.length]))); }
  else log('el Excel de Equipos se descarga', false);
  await t.page.click('.tab[data-vista="reuniones"]'); await esp(300);
  const [excelReu] = await Promise.all([t.page.waitForEvent('download', { timeout: 15000 }).catch(() => null), t.page.click('#btnExcelReu')]);
  if (excelReu) { const ruta = path.join(CAPTURAS, 'excel-reuniones.xlsx'); await excelReu.saveAs(ruta); const hs = await excelInfo(ruta);
    log('el Excel de Reuniones trae reuniones y tareas con el mismo formato', /^Reuniones .*\.xlsx$/.test(excelReu.suggestedFilename()) && hs.length === 2 && hs.every(bienFormado) && hs[0].filas.length >= 4 && hs[1].filas.length >= 10, JSON.stringify(hs.map(h => [h.nombre, bienFormado(h), h.filas.length]))); }
  else log('el Excel de Reuniones se descarga', false);
  await t.page.click('.tab[data-vista="vehiculos"]'); await esp(200);
  await t.page.click('#vehSecciones [data-sec="novedades"]');
  log('el Gerente ve las novedades con su foto pero no puede revisarlas ni reportar', await hasta(t.page, () => document.querySelectorAll('#vehContenido .nov-foto').length === 3 && !document.querySelector('#vehContenido [data-accion="revisar"], #vehContenido [data-accion="novedad"]')));
  await t.page.click('.tab[data-vista="inventario"]');

  console.log('4b. Compras (Luis): hace las compras');
  log('cambia a Fredy Torres (Compras)', await cambiar(t.page, 'compras'));
  log('Luis se queda en Inventario porque también lo puede ver', !(await t.page.locator('#vInventario').isHidden()));
  await t.page.click('.tab[data-vista="inicio"]');
  await esp(900);
  log('Luis ve 3 cifras: compras por hacer (2), sin autorizar y sus tareas de reuniones', (await t.page.locator('#sumInicio .sum').count()) === 3 && (await cifra(t.page, 'sumInicio', 0)) === 2 && /Tareas de reuniones para ti/.test(await texto(t.page, '#sumInicio')), await texto(t.page, '#sumInicio'));
  log('la insignia de Inventario dice 2 (las 2 compras autorizadas por hacer)', (await texto(t.page, '[data-badge="inventario"]')) === '2');
  await t.page.click('#btnAvisos');
  log('la campana muestra 3 avisos (resmas autorizadas, los portátiles que autorizó el Gerente general y el de todos)', await hasta(t.page, () => document.querySelectorAll('#avisosLista .aviso-it').length === 3 && /portátiles/i.test(document.getElementById('avisosLista').textContent)));
  log('al abrirla la insignia queda en 0', await hasta(t.page, () => document.getElementById('badgeAvisos').hidden));
  await t.page.keyboard.press('Escape');
  await t.page.click('.tab[data-vista="inventario"]');
  log('Luis tiene botones para comprar y ninguno para autorizar', await hasta(t.page, () => document.querySelectorAll('#invContenido [data-accion="comprar"]').length === 2 && !document.querySelector('#invContenido [data-accion="autorizar"]')));
  await t.page.click('#btnPedirCompra'); await t.page.waitForSelector('#shAccion:not([hidden])');
  log('Compras «hace» una compra (no la pide) y le dice que la autoriza la Coordinadora de compras (y el Gerente general si pasa de 5 millones)', (await texto(t.page, '#btnPedirCompraTxt')) === 'Hacer una compra' && (await texto(t.page, '#acT')) === 'Hacer una compra' && /Mauricio G\./.test(await texto(t.page, '#acSub')) && /Gerente general/.test(await texto(t.page, '#acSub')) && /autorizar/.test(await texto(t.page, '#acPrimario')), await texto(t.page, '#acT'));
  // «¿Salir sin guardar?» en la hoja de compras
  const salirPregunta = () => hasta(t.page, () => !document.getElementById('shConfirmar').hidden && /Salir sin guardar/.test(document.getElementById('cfSi').textContent));
  await esp(100);
  await t.page.click('#acCerrar');
  log('sin escribir nada, Cancelar cierra la hoja de compras sin preguntar', await hasta(t.page, () => document.getElementById('shAccion').hidden && document.getElementById('shConfirmar').hidden));
  await t.page.click('#btnPedirCompra'); await t.page.waitForSelector('#shAccion:not([hidden])'); await esp(100);
  await t.page.fill('#acQue', 'Silla borrador');
  await t.page.click('#acCerrar');
  log('con algo escrito, Cancelar pregunta «¿Salir sin guardar?» y la hoja sigue abierta', await salirPregunta() && !(await t.page.evaluate(() => document.getElementById('shAccion').hidden)));
  await t.page.click('#cfNo');
  log('si dice Cancelar, la hoja sigue con lo escrito', await hasta(t.page, () => document.getElementById('shConfirmar').hidden && !document.getElementById('shAccion').hidden && document.getElementById('acQue').value === 'Silla borrador'));
  await t.page.keyboard.press('Escape');
  log('Escape también pregunta', await salirPregunta());
  await t.page.click('#cfSi');
  log('«Salir sin guardar» cierra la hoja y no crea ninguna compra', await hasta(t.page, () => document.getElementById('shAccion').hidden && document.getElementById('shConfirmar').hidden && !Object.values(JSON.parse(localStorage.getItem('__fb_datos')).compras).some(c => /Silla borrador/.test(JSON.stringify(c)))));
  await t.page.click('#btnPedirCompra'); await t.page.waitForSelector('#shAccion:not([hidden])');
  await t.page.fill('#acQue', 'Silla de oficina'); await t.page.fill('#acCant', '1'); await t.page.fill('#acValor', '380000'); await t.page.fill('#acPara', 'La mía está rota');
  await t.page.click('#acPrimario');
  log('la compra de Luis queda por autorizar con aviso a la Coordinadora de compras', await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')); const c = Object.values(d.compras).find(x => x.que === 'Silla de oficina'); return c && c.estado === 'pedido' && c.pideRol === 'compras' && Object.values(d.avisos).some(a => a.para === 'coordcompras' && /Silla de oficina/.test(a.texto)); }));
  await t.page.click('#invContenido [data-accion="comprar"][data-id="co-009"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.fill('#acProv', 'Tecnoguajira Suministros');
  const nProvAntes = Object.keys((await datosPv()).proveedores).length;
  log('al registrar una compra, el proveedor es una lista con los que ya hay (y deja escribir uno nuevo); uno que no está avisa que se agregará', await t.page.evaluate(n => document.getElementById('acProv').getAttribute('list') === 'acProvLista' && document.querySelectorAll('#acProvLista option').length === n && /«Tecnoguajira Suministros» es nuevo: se agrega a Proveedores al guardar/.test(document.getElementById('acProvAy').textContent), nProvAntes));
  await t.page.click('#acPrimario');
  log('el proveedor nuevo se agregó solo a Proveedores (a nombre de Fredy, sin NIT todavía) y la compra queda ligada a él', await hasta(t.page, n => { const d = JSON.parse(localStorage.getItem('__fb_datos')), ps = Object.entries(d.proveedores), x = ps.find(([, p]) => p.nombre === 'Tecnoguajira Suministros'); return !!x && ps.length === n + 1 && x[1].por === 'Fredy Torres' && x[1].porRol === 'compras' && x[1].nit === '' && d.compras['co-009'].proveedorId === x[0] && d.compras['co-009'].proveedor === 'Tecnoguajira Suministros'; }, nProvAntes));
  log('Luis registra la compra de los portátiles: queda comprada y le avisa a Sofía para recibirla', await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')); const c = d.compras['co-009']; return c.estado === 'comprado' && c.valorReal > 0 && c.proveedor && c.historial.some(h => /Compró en/.test(h.texto) && h.por === 'Fredy Torres') && Object.values(d.avisos).some(a => a.para === 'asistente' && /hay que recibirla/.test(a.titulo)); }));
  await t.page.click('#invContenido [data-accion="comprar"][data-id="co-003"]');
  await t.page.waitForSelector('#shAccion:not([hidden])');
  await t.page.setInputFiles('#acFoto', path.join(RAIZ, 'iconos', 'control-512.png'));
  log('la foto de la factura se achica y se ve antes de guardar', await hasta(t.page, () => !document.getElementById('acFotoVer').hidden && /^data:image\/jpeg/.test(document.getElementById('acFotoVer').src)));
  const nProvAntes2 = Object.keys((await datosPv()).proveedores).length;
  await t.page.fill('#acProv', 'papeleria  CENTRAL');
  log('al escribir un proveedor que ya existe (sin tilde y en mayúsculas) la app dice cuál es y su NIT', await hasta(t.page, () => /Es «Papelería Central», NIT 900000003-7\./.test(document.getElementById('acProvAy').textContent)), await texto(t.page, '#acProvAy'));
  await t.page.click('#acPrimario');
  log('la compra usa el proveedor de la lista (con su nombre bien escrito y su id) y no crea otro igual', await hasta(t.page, n => { const d = JSON.parse(localStorage.getItem('__fb_datos')), c = d.compras['co-003']; return c.estado === 'comprado' && c.proveedor === 'Papelería Central' && c.proveedorId === 'pv-papcentral' && Object.keys(d.proveedores).length === n; }, nProvAntes2));
  log('la compra guarda la foto de la factura', await hasta(t.page, () => /^data:image\/jpeg;base64,/.test(JSON.parse(localStorage.getItem('__fb_datos')).compras['co-003'].factura || '')));
  await t.page.click('#invSecciones [data-sec="compras"]');
  log('Luis puede registrar una compra hecha sin autorización', await hasta(t.page, () => !!document.querySelector('#invContenido [data-accion="sinaut"]')));
  await t.page.click('#invSecciones [data-sec="hacer"]');

  console.log('4c. La Coordinadora de compras autoriza');
  log('cambia a Mauricio Giraldo (Coordinador de compras)', await cambiar(t.page, 'coordcompras'));
  await t.page.click('.tab[data-vista="inventario"]');
  await t.page.click('#invSecciones [data-sec="hacer"]');
  const coSilla = await t.page.evaluate(() => Object.entries(JSON.parse(localStorage.getItem('__fb_datos')).compras).find(([, c]) => c.que === 'Silla de oficina')[0]);
  const coLlanta = await t.page.evaluate(() => Object.entries(JSON.parse(localStorage.getItem('__fb_datos')).compras).find(([, c]) => /Llanta/.test(c.que))[0]);
  log('la Coordinadora tiene por autorizar las botas, el mouse de la Jefe, la llanta de Carlos y la silla de Luis', await hasta(t.page, ids => ids.every(i => document.querySelector(`#invContenido [data-accion="autorizar"][data-id="${i}"]`)), ['co-001', 'co-002', coLlanta, coSilla]));
  await t.page.click(`#invContenido [data-accion="autorizar"][data-id="${coLlanta}"]`);
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.click('#acPrimario');
  log('la Coordinadora autoriza la llanta: aviso a Luis para comprarla y a Carlos', await hasta(t.page, i => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.compras[i].estado === 'autorizado' && d.compras[i].autoriza === 'Mauricio Giraldo' && d.compras[i].autorizaJefe === 'Mauricio Giraldo' && Object.values(d.avisos).some(a => a.para === 'compras' && /Llanta/.test(a.texto)) && Object.values(d.avisos).some(a => a.para === 'conductor' && /autorizó tu compra/.test(a.texto)); }, coLlanta));
  await t.page.click('#invContenido [data-accion="rechazar"][data-id="co-001"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.click('#acPrimario');
  log('rechazar sin motivo no deja guardar', await hasta(t.page, () => !document.getElementById('acErr').hidden));
  await t.page.keyboard.press('Escape');

  console.log('4d. Bodega (Sofía)');
  log('cambia a Andrés Beltrán (Bodega)', await cambiar(t.page, 'asistente'));
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
  log('la entrega deja su movimiento (quién, a quién y saldo)', mov && mov.tipo === 'salida' && mov.persona === 'Oscar Farfán' && mov.por === 'Andrés Beltrán' && mov.saldo === chal0 - 2, JSON.stringify(mov));
  log('el pedido de Carlos queda entregado y le llega un aviso', await t.page.evaluate(i => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.solicitudes[i].estado === 'entregada' && Object.values(d.avisos).some(a => a.para === 'conductor' && /entregó/.test(a.texto)); }, solChal));
  log('cuando no alcanza, lo dice y ofrece entregar lo que hay', /No alcanza/.test(await texto(t.page, '#invContenido')) && /Entregar lo que hay \(6\)/.test(await texto(t.page, '#invContenido')));
  const hdmi0 = await art('ar-010');
  const hdmiCosto0 = await t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos')).articulos['ar-010'].costo);
  await t.page.click('#invContenido [data-accion="recibir"][data-id="co-005"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.click('#acPrimario');
  const cant5 = await t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos')).compras['co-005'].cantidad);
  const sumo = await hasta(t.page, x => JSON.parse(localStorage.getItem('__fb_datos')).articulos['ar-010'].cantidad === x, hdmi0 + cant5);
  const est5 = await t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos')).compras['co-005'].estado);
  log('recibir en bodega suma lo comprado y cierra la compra', sumo && est5 === 'recibido', `${hdmi0} + ${cant5} -> ${await art('ar-010')} (${est5})`);
  // Kárdex con plata: costo promedio ponderado
  const costoEsperado = Math.round((hdmi0 * hdmiCosto0 + cant5 * Math.round(152000 / cant5)) / (hdmi0 + cant5));
  log('al recibir la compra, el costo del artículo pasa a ser el promedio (lo que había y lo que entró a $30.400 c/u)', await hasta(t.page, x => JSON.parse(localStorage.getItem('__fb_datos')).articulos['ar-010'].costo === x, costoEsperado), `${hdmiCosto0} -> ${await t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos')).articulos['ar-010'].costo)} (esperado ${costoEsperado})`);
  log('el movimiento de la entrada guarda el costo de cada unidad, su valor y lo que valía lo que quedó', await t.page.evaluate(([n, cp, x]) => { const m = Object.values(JSON.parse(localStorage.getItem('__fb_datos')).movimientos).find(q => q.compraId === 'co-005'); return !!m && m.costoUnit === 30400 && m.valor === 152000 && m.valorSaldo === Math.round(m.saldo * x); }, [cant5, hdmiCosto0, costoEsperado]));
  // El ejemplo del plan con números redondos: 10 a $1.000, llegan 5 a $1.300 → $1.100; sale 3 → $3.300; quedan 12 por $13.200.
  await t.page.evaluate(() => window.nube.lote([
    ['set', 'articulos', 'ar-kx', { nombre: 'Prueba de kárdex', categoria: 'Otro', unidad: 'unidades', cantidad: 10, minimo: 1, maximo: 50, ubicacion: 'Estante Z9', costo: 1000, proveedor: '', bodega: 'Riohacha' }],
    ['set', 'compras', 'co-kx', { que: 'Prueba de kárdex', cantidad: 5, unidad: 'unidades', categoria: 'Otro', valorAprox: 6500, paraQue: 'Prueba', pide: 'Andrés Beltrán', pideRol: 'asistente', autoriza: 'Mauricio Giraldo', autorizaJefe: 'Mauricio Giraldo', estado: 'comprado', proveedor: 'Ferretería El Faro', valorReal: 6500, fechaPedido: '2026-01-01', fechaCompra: '2026-01-02', entregadoA: '', motivoRechazo: '', articuloId: 'ar-kx', factura: '', revisada: false, historial: [] }]]));
  await t.page.click('#invContenido [data-accion="recibir"][data-id="co-kx"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.click('#acPrimario');
  log('10 a $1.000 y llegan 5 a $1.300: el costo promedio queda en $1.100 y hay 15', await hasta(t.page, () => { const a = JSON.parse(localStorage.getItem('__fb_datos')).articulos['ar-kx']; return a.cantidad === 15 && a.costo === 1100; }));
  await t.page.click('#invSecciones [data-sec="movimientos"]');
  await t.page.click('#invContenido [data-accion="salida"]'); await t.page.waitForSelector('#shAccion:not([hidden])');
  await t.page.selectOption('#acArt', 'ar-kx'); await t.page.fill('#acCant', '3'); await t.page.selectOption('#acMotivoMov', 'dano'); await t.page.fill('#acNota', 'Se dañaron en la prueba'); await t.page.click('#acPrimario');
  log('sale 3: el movimiento vale $3.300 y lo que queda (12) vale $13.200', await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')), ms = Object.values(d.movimientos).filter(m => m.articuloId === 'ar-kx'); const s = ms.find(m => m.tipo === 'salida'), e = ms.find(m => m.motivo === 'compra'); return !!s && s.costoUnit === 1100 && s.valor === 3300 && s.saldo === 12 && s.valorSaldo === 13200 && !!e && e.costoUnit === 1300 && e.valor === 6500 && e.valorSaldo === 16500 && d.articulos['ar-kx'].costo === 1100; }));
  await t.page.click('#invSecciones [data-sec="existencias"]');
  await t.page.locator('#invContenido [data-accion="verart"][data-id="ar-kx"]').click(); await hasta(t.page, () => !!document.querySelector('#acCampos [data-accion="kardex"]'));
  await t.page.click('#acCampos [data-accion="kardex"]');
  log('el kárdex en pantalla muestra costo por unidad, valor y lo que valía lo que quedó', await hasta(t.page, () => { const x = document.getElementById('acCampos').textContent; return /Kárdex: Prueba de kárdex/.test(document.getElementById('acT').textContent) && /Hay 12 unidades, que valen \$\s?13\.200/.test(document.getElementById('acSub').textContent) && /\$\s?3\.300/.test(x) && /a \$\s?1\.100 c\/u/.test(x) && /\$\s?13\.200/.test(x) && /\$\s?16\.500/.test(x); }), await texto(t.page, '#acSub'));
  await t.page.screenshot({ path: path.join(CAPTURAS, '17-karde-con-plata.png') });
  const [descKP] = await Promise.all([t.page.waitForEvent('download', { timeout: 15000 }).catch(() => null), t.page.click('#acCampos [data-accion="excelkardex"]')]);
  if (descKP) { const ruta = path.join(CAPTURAS, 'excel-kardex-plata.xlsx'); await descKP.saveAs(ruta); const hs = await excelInfo(ruta); log('el Excel del kárdex trae costo unitario, valor y valor que quedó', hs.length === 1 && ['Costo unitario', 'Valor', 'Valor que quedó'].every(c => hs[0].titulos.includes(c)), JSON.stringify(hs.map(h => h.titulos))); }
  await t.page.keyboard.press('Escape');
  // Se quita lo que se creó para esta prueba.
  await t.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return window.nube.lote([['borrar', 'articulos', 'ar-kx'], ['borrar', 'compras', 'co-kx']].concat(Object.entries(d.movimientos).filter(([, m]) => m.articuloId === 'ar-kx').map(([id]) => ['borrar', 'movimientos', id]))); });
  await t.page.click('#invSecciones [data-sec="hacer"]');
  // «Pedir compra de todo lo bajo»
  const nBajos = await t.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')), abiertas = ['pedido', 'por-gerente', 'autorizado', 'comprado']; const enCurso = id => Object.values(d.compras).some(c => abiertas.includes(c.estado) && (c.articuloId === id || (c.lineas || []).some(l => l.articuloId === id))); return Object.entries(d.articulos).filter(([id, a]) => a.cantidad <= a.minimo && !enCurso(id)).length; });
  log('con varios artículos por reponer sale el botón «Pedir compra de todo lo bajo (N)», con N igual a los que están agotados o bajos y sin compra en curso', nBajos >= 2 && await hasta(t.page, n => !!document.querySelector('#invContenido [data-accion="pedirbajo"]') && new RegExp(`Pedir compra de todo lo bajo \\(${n}\\)`).test(document.querySelector('#invContenido [data-accion="pedirbajo"]').textContent), nBajos), `${nBajos} artículos por reponer; botón: ${await t.page.evaluate(() => (document.querySelector('#invContenido [data-accion="pedirbajo"]') || {}).textContent)}`);
  await t.page.click('#invContenido [data-accion="pedirbajo"]'); await t.page.waitForSelector('#shAccion:not([hidden])'); await esp(150);
  const esperadas = Math.min(nBajos, 5);
  log('abre una sola compra con los artículos más urgentes ya puestos (el agotado primero, con su cantidad y su valor)', await hasta(t.page, n => { const extras = [...document.querySelectorAll('#acExtra .linea-extra')]; const ids = [document.getElementById('acArt').value].concat(extras.map(f => f.querySelector('[data-lx="art"]').value)); return ids.length === n && ids.every(Boolean) && new Set(ids).size === n && (a => !a.some(x => x.cantidad === 0) || a[0].cantidad === 0)(ids.map(i => JSON.parse(localStorage.getItem('__fb_datos')).articulos[i])) && extras.every(f => Number(f.querySelector('[data-lx="cant"]').value) >= 1 && Number(f.querySelector('[data-lx="val"]').value) > 0) && Number(document.getElementById('acCant').value) >= 1; }, esperadas));
  await t.page.screenshot({ path: path.join(CAPTURAS, '18b-pedir-todo-bajo.png'), fullPage: true });
  await t.page.click('#acCerrar');
  log('si no se toca nada, Cancelar cierra sin preguntar', await hasta(t.page, () => document.getElementById('shAccion').hidden && document.getElementById('shConfirmar').hidden));
  await t.page.click('#invContenido [data-accion="pedir"][data-id="ar-016"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.click('#acPrimario');
  log('pedir compra del café crea la compra por autorizar y quita la tarea', await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return Object.values(d.compras).some(c => c.articuloId === 'ar-016' && c.estado === 'pedido') && !document.querySelector('#invContenido [data-accion="pedir"][data-id="ar-016"]'); }));
  const nBajos2 = await t.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')), abiertas = ['pedido', 'por-gerente', 'autorizado', 'comprado']; const enCurso = id => Object.values(d.compras).some(c => abiertas.includes(c.estado) && (c.articuloId === id || (c.lineas || []).some(l => l.articuloId === id))); return Object.entries(d.articulos).filter(([id, a]) => a.cantidad <= a.minimo && !enCurso(id)).length; });
  if (nBajos2 >= 2) {
    await t.page.click('#invContenido [data-accion="pedirbajo"]'); await t.page.waitForSelector('#shAccion:not([hidden])'); await esp(150);
    await t.page.click('#acPrimario');
    log('«Pedir todo lo bajo» guarda UNA compra con una línea por artículo (hasta 5) y quita esas tareas', await hasta(t.page, ([n, antes]) => { const d = JSON.parse(localStorage.getItem('__fb_datos')); const cs = Object.values(d.compras).filter(c => c.estado === 'pedido' && Array.isArray(c.lineas) && c.lineas.length > 1 && c.paraQue.startsWith('Reponer la bodega')); const c = cs[0]; return !!c && c.lineas.length === Math.min(n, 5) && c.lineas.every(l => l.articuloId && l.cantidad >= 1 && l.valor > 0) && c.valorAprox === c.lineas.reduce((s, l) => s + l.valor, 0) && document.querySelectorAll('#invContenido [data-accion="pedir"]').length < antes; }, [nBajos2, await t.page.locator('#invContenido [data-accion="pedir"]').count()]));
  }
  await t.page.click('#invContenido [data-accion="recibir"][data-id="co-009"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.click('#acPrimario');
  log('Sofía recibe los portátiles que compró Luis y le avisa a Ángel', await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.compras['co-009'].estado === 'recibido' && Object.values(d.avisos).some(a => a.para === 'soporte' && /Llegó tu compra/.test(a.titulo)); }));
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
  // Conteo físico: por bodega, a ciegas y con borrador en el teléfono
  await t.page.click('#invSecciones [data-sec="conteo"]');
  await t.page.click('#invContenido [data-accion="conteo"]'); await t.page.waitForSelector('#shAccion:not([hidden])');
  log('el conteo empieza escogiendo la bodega y la categoría, y dice cuándo fue el último ajuste de cada una', await hasta(t.page, () => !!document.getElementById('acBod') && document.querySelectorAll('#acBod option').length === 3 && !!document.getElementById('acCat') && /Último ajuste por conteo: Riohacha: .*Guamal: .*Bogotá: /.test(document.getElementById('acCampos').textContent)));
  await t.page.selectOption('#acBod', 'Bogotá');
  log('al escoger Bogotá, las categorías son exactamente las de los artículos de esa bodega', await t.page.evaluate(() => { const d = Object.values(JSON.parse(localStorage.getItem('__fb_datos')).articulos).filter(a => a.bodega === 'Bogotá').map(a => a.categoria).filter(Boolean); const esperadas = ['Todas las categorías'].concat(Array.from(new Set(d)).sort((x, y) => x.localeCompare(y))); const o = [...document.querySelectorAll('#acCat option')].map(x => x.textContent); return JSON.stringify(o) === JSON.stringify(esperadas) && o.length >= 3; }));
  await t.page.click('#acPrimario');
  log('solo salen los artículos de Bogotá con su estante, y no dicen cuánto cree la app que hay (a ciegas)', await hasta(t.page, () => { const f = [...document.querySelectorAll('#acCampos .conteo-f')]; const x = document.getElementById('acCampos').textContent; return f.length >= 3 && !!document.getElementById('cn-ar-017') && !document.getElementById('cn-ar-003') && /Estante D2/.test(x) && !/La app dice/.test(x) && f.every(r => r.querySelector('input').placeholder === 'Contado'); }));
  const vasos0 = await art('ar-017');
  await t.page.fill('#cn-ar-017', String(vasos0 - 2));
  log('lo que se escribe queda guardado en el teléfono (borrador)', await t.page.evaluate(() => { const j = JSON.parse(localStorage.getItem('conteo.Bogotá') || 'null'); return !!j && j.vals['ar-017'] != null; }));
  await t.page.click('#acCerrar');
  log('cerrar el conteo a medias no pregunta nada, porque el borrador queda guardado', await hasta(t.page, () => document.getElementById('shAccion').hidden && document.getElementById('shConfirmar').hidden));
  await t.page.click('#invContenido [data-accion="conteo"]'); await t.page.waitForSelector('#shAccion:not([hidden])');
  await t.page.selectOption('#acBod', 'Bogotá');
  log('al volver avisa «Tienes un conteo sin terminar de Bogotá»', await hasta(t.page, () => /Tienes un conteo sin terminar de Bogotá \(1 cantidad escrita/.test(document.getElementById('acBorrador').textContent)));
  await t.page.evaluate(() => localStorage.setItem('conteo.Guamal', JSON.stringify({ vals: { x: '5' }, en: new Date(Date.now() - 3 * 86400000).toISOString() })));
  await t.page.selectOption('#acBod', 'Guamal');
  log('un borrador de conteo de hace 3 días no se ofrece: se descarta solo', await hasta(t.page, () => !document.getElementById('acBorrador').textContent.trim()) && await t.page.evaluate(() => localStorage.getItem('conteo.Guamal') === null));
  await t.page.selectOption('#acBod', 'Bogotá');
  await t.page.click('#acPrimario');
  log('y al empezar sigue donde iba: la cantidad escrita está en su lugar', await hasta(t.page, n => !!document.getElementById('cn-ar-017') && document.getElementById('cn-ar-017').value === String(n), vasos0 - 2));
  await t.page.click('#acPrimario');
  log('«Revisar» muestra lo contado, lo que decía la app y la diferencia (-2) solo en ese momento', await hasta(t.page, n => { const r = document.querySelector('#acCampos .conteo-r.difiere'); return !!r && /Vasos desechables/.test(r.textContent) && /-2/.test(r.querySelector('.cr-d').textContent) && r.querySelectorAll('.cr-v b')[1].textContent === String(n); }, vasos0));
  await t.page.screenshot({ path: path.join(CAPTURAS, '16-conteo-revisar.png') });
  await t.page.click('#acCampos [data-accion="volverconteo"]');
  log('«Volver a contar» regresa a los números escritos', await hasta(t.page, n => !!document.getElementById('cn-ar-017') && document.getElementById('cn-ar-017').value === String(n), vasos0 - 2));
  await t.page.click('#acPrimario'); await t.page.click('#acPrimario');
  log('el conteo con diferencia pide el motivo', await hasta(t.page, () => !document.getElementById('acErr').hidden && /motivo/.test(document.getElementById('acErr').textContent)));
  await t.page.evaluate(n => window.nube.lote([['update', 'articulos', 'ar-017', { cantidad: n }]]), vasos0 + 5);
  await t.page.fill('#acMotivo', 'Se usaron en la reunión'); await t.page.click('#acPrimario');
  log('si mientras se revisa cambia la cantidad de un artículo, avisa y vuelve a mostrar la revisión sin guardar', await hasta(t.page, n => !document.getElementById('acErr').hidden && /cambió la cantidad/.test(document.getElementById('acErr').textContent) && document.querySelector('#acCampos .conteo-r.difiere').querySelectorAll('.cr-v b')[1].textContent === String(n), vasos0 + 5));
  await t.page.fill('#acMotivo', 'Se usaron en la reunión'); await t.page.click('#acPrimario');
  log('el conteo ajusta la cantidad y deja el ajuste con lo que había al revisar', await hasta(t.page, x => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.articulos['ar-017'].cantidad === x && Object.values(d.movimientos).some(m => m.tipo === 'ajuste' && m.motivo === 'conteo' && m.articuloId === 'ar-017' && m.cantidad === -7 && m.saldo === x); }, vasos0 - 2));
  log('al guardar el conteo se borra el borrador del teléfono', await t.page.evaluate(() => localStorage.getItem('conteo.Bogotá') === null));
  log('el artículo contado con diferencia también queda con la fecha de hoy como su último conteo', await hasta(t.page, () => window.App.S.datos.articulos.find(a => a.id === 'ar-017').ultimoConteo === window.App.hoyISO()));
  // Artículo nuevo
  await t.page.click('#invSecciones [data-sec="existencias"]');
  await t.page.click('#invContenido [data-accion="nuevoart"]'); await t.page.waitForSelector('#shAccion:not([hidden])');
  await t.page.fill('#acNom', 'Guantes de nitrilo talla M'); await t.page.selectOption('#acUni', 'cajas'); await t.page.fill('#acCantIni', '4'); await t.page.fill('#acMin', '5'); await t.page.fill('#acMax', '3'); await t.page.fill('#acCosto', '18000');
  await t.page.click('#acPrimario');
  log('el máximo menor que el mínimo no deja guardar', await hasta(t.page, () => /máximo debe ser mayor/.test(document.getElementById('acErr').textContent)));
  await t.page.fill('#acMax', '12'); await t.page.click('#acPrimario');
  log('el artículo nuevo entra a la bodega con su movimiento inicial (y sale bajo del mínimo)', await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')); const a = Object.entries(d.articulos).find(([, x]) => x.nombre === 'Guantes de nitrilo talla M'); return a && a[1].cantidad === 4 && Object.values(d.movimientos).some(m => m.articuloId === a[0] && m.motivo === 'inicial') && /Guantes de nitrilo talla M/.test(document.getElementById('invContenido').textContent); }));
  await t.page.click('#invSecciones [data-sec="hacer"]');
  await t.page.screenshot({ path: path.join(CAPTURAS, '05-inventario-sofia.png'), fullPage: true });
  console.log('4d. Compras con varias líneas, monto del Gerente general en dos pasos, sobrecosto, kárdex');
  const IMGP = path.join(RAIZ, 'iconos', 'control-512.png');
  const dI = () => t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos')));
  const compraPor = async q => Object.entries((await dI()).compras).map(([id, c]) => Object.assign({ id }, c)).find(c => q(c));
  const abrirHojaInv = async sel => { await t.page.click(sel); return hasta(t.page, () => !document.getElementById('shAccion').hidden); };
  const enviarHoja = async () => { await t.page.click('#acPrimario'); return hasta(t.page, () => document.getElementById('shAccion').hidden); };
  log('cambia a Fredy Torres (Compras)', await cambiar(t.page, 'compras'));
  await t.page.click('.tab[data-vista="inventario"]');
  await abrirHojaInv('#btnPedirCompra');
  await t.page.fill('#acQue', 'Taladro percutor'); await t.page.fill('#acCant', '2'); await t.page.fill('#acValor', '4700000');
  await t.page.click('#acCampos [data-accion="masLinea"]');
  await t.page.selectOption('#lxArt0', 'ar-009');
  await t.page.fill('#lxCant0', '10'); await t.page.fill('#lxVal0', '1300000');
  await t.page.fill('#acProvSug', 'Ferretería El Faro'); await t.page.fill('#acPara', 'Para la cuadrilla de campo');
  await t.page.setInputFiles('#acCot', [IMGP, IMGP]);
  log('las cotizaciones se achican y se ven antes de guardar (2 fotos)', await hasta(t.page, () => document.querySelectorAll('#acCotVer img').length === 2 && /^data:image\/jpeg/.test(document.querySelector('#acCotVer img').src)));
  await t.page.screenshot({ path: path.join(CAPTURAS, '09b-compra-varias-lineas.png'), fullPage: true });
  await t.page.fill('#lxVal0', '');
  await t.page.click('#acPrimario');
  log('una línea sin valor no deja guardar y dice cuál', await hasta(t.page, () => !document.getElementById('acErr').hidden && /valor total de cada artículo/.test(document.getElementById('acErr').textContent)));
  await t.page.fill('#lxVal0', '1300000');
  log('guarda la compra de 2 artículos', await enviarHoja());
  const cv = await compraPor(c => c.que === 'Taladro percutor y 1 más');
  log('la compra queda con sus 2 líneas, el total de 6.000.000, las 2 cotizaciones y la marca de quien la pidió', cv && cv.lineas.length === 2 && cv.valorAprox === 6000000 && cv.cotizaciones.length === 2 && cv.proveedorSug === 'Ferretería El Faro' && cv.estado === 'pedido' && cv.articuloId === '' && cv.lineas[1].articuloId === 'ar-009' && !!cv.pideUid, JSON.stringify(cv && { q: cv.que, n: cv.lineas && cv.lineas.length, v: cv.valorAprox, e: cv.estado }));
  await t.page.click('#invSecciones [data-sec="compras"]');
  log('en Compras sale «2 artículos»', await hasta(t.page, () => /2 artículos/.test(document.getElementById('invContenido').textContent)));

  log('cambia a Mauricio Giraldo (Coordinador de compras)', await cambiar(t.page, 'coordcompras'));
  await t.page.click('.tab[data-vista="inventario"]'); await t.page.click('#invSecciones [data-sec="hacer"]');
  await abrirHojaInv(`#invContenido [data-accion="autorizar"][data-id="${cv.id}"]`);
  log('al autorizar, la Coordinadora ve cada artículo con su precio, el total, a quién se compra, las cotizaciones y el monto del Gerente', await t.page.evaluate(() => { const x = document.getElementById('acCampos').textContent; return /Taladro percutor/.test(x) && /Juego|Cinta aislante|Quede|Total aprox/.test(x) && /Ferretería El Faro/.test(x) && /Cotizaciones \(2\)/.test(x) && /Monto del Gerente/.test(x) && /pasa al Gerente general/.test(x) && document.querySelectorAll('#acCampos .cot-mini img').length === 2; }), await texto(t.page, '#acCampos'));
  await t.page.screenshot({ path: path.join(CAPTURAS, '09c-autorizar-detalle.png'), fullPage: true });
  log('el botón dice «Autorizar y pasar al Gerente general»', (await texto(t.page, '#acPrimario')).includes('Autorizar y pasar al Gerente general'));
  await enviarHoja();
  const cv2 = await (async () => { await hasta(t.page, id => JSON.parse(localStorage.getItem('__fb_datos')).compras[id].estado === 'por-gerente', cv.id); return compraPor(c => c.id === cv.id); })();
  log('la compra de 6.000.000 queda «por-gerente» (no autorizada) con quién la autorizó y aviso al Gerente', cv2.estado === 'por-gerente' && cv2.autorizaJefe === 'Mauricio Giraldo' && cv2.autoriza === '' && Object.values((await dI()).avisos).some(a => a.para === 'gerente' && /Taladro percutor/.test(a.texto)));
  log('Compras todavía no la puede comprar (falta el Gerente)', !(await (async () => { await cambiar(t.page, 'compras'); await t.page.click('.tab[data-vista="inventario"]'); await t.page.click('#invSecciones [data-sec="hacer"]'); return visible(t.page, `#invContenido [data-accion="comprar"][data-id="${cv.id}"]`); })()));

  log('cambia a Oscar Muñoz (Gerente general)', await cambiar(t.page, 'gerente'));
  await t.page.click('.tab[data-vista="inventario"]');
  log('el Gerente general ve «Te toca a ti» con la compra del segundo paso', await hasta(t.page, id => !!document.querySelector(`#invContenido [data-accion="autorizar"][data-id="${id}"]`) && /Autorizar \(segundo paso\)/.test(document.getElementById('invContenido').textContent) && /La Coordinadora ya la autorizó/.test(document.getElementById('invContenido').textContent), cv.id));
  log('el Gerente general ve su monto (5.000.000) y que con la persona de prueba no lo cambia', /5\.000\.000/.test(await texto(t.page, '#invContenido')) && /la persona de prueba no puede/.test(await texto(t.page, '#invContenido')) && !(await visible(t.page, '#invContenido [data-accion="monto"]')));
  await abrirHojaInv(`#invContenido [data-accion="autorizar"][data-id="${cv.id}"]`);
  log('el Gerente ve la tabla completa antes de decidir', await t.page.evaluate(() => /Cantidad/.test(document.getElementById('acCampos').textContent) && /Cada uno/.test(document.getElementById('acCampos').textContent) && /6\.000\.000/.test(document.getElementById('acCampos').textContent) && /La Coordinadora ya la autorizó/.test(document.getElementById('acSub').textContent)));
  await enviarHoja();
  log('el Gerente autoriza y ahora sí queda «autorizado», con las dos firmas y aviso a Compras', await hasta(t.page, id => { const d = JSON.parse(localStorage.getItem('__fb_datos')), c = d.compras[id]; return c.estado === 'autorizado' && c.autoriza === 'Oscar Muñoz' && c.autorizaJefe === 'Mauricio Giraldo' && Object.values(d.avisos).some(a => a.para === 'compras' && /Taladro percutor/.test(a.texto)); }, cv.id));

  // El Gerente general también hace una compra y nace autorizada (nadie autoriza lo suyo).
  await abrirHojaInv('#btnPedirCompra');
  await t.page.fill('#acQue', 'Cafetera para sala'); await t.page.fill('#acCant', '1'); await t.page.fill('#acValor', '250000'); await t.page.fill('#acPara', 'Para la sala de reuniones');
  await enviarHoja();
  const cg = await (async () => { await hasta(t.page, () => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).compras).some(c => c.que === 'Cafetera para sala')); return compraPor(c => c.que === 'Cafetera para sala'); })();
  log('la compra que hace el Gerente general nace «autorizado», con su correo y la hora, y avisa a Compras (no a otro Gerente ni a la Coordinadora)', cg.estado === 'autorizado' && cg.pideRol === 'gerente' && cg.autoriza === 'Oscar Muñoz' && cg.autorizaCorreo === 'gerente.oscar.munoz@example.com' && cg.pideCorreo === 'gerente.oscar.munoz@example.com' && !!cg.creadoEn && cg.historial.length === 2 && Object.values((await dI()).avisos).some(a => a.para === 'compras' && /Cafetera/.test(a.texto)) && !Object.values((await dI()).avisos).some(a => ['gerente', 'coordcompras'].includes(a.para) && /Cafetera/.test(a.texto)));
  log('esa compra no le pide autorización a nadie: no sale en «Por autorizar» de nadie', await t.page.evaluate(id => !document.querySelector(`#invContenido [data-accion="autorizar"][data-id="${id}"]`), cg.id));

  // Compras registra la compra de 6.000.000 pagando de más; la Coordinadora y el Gerente general se enteran.
  log('cambia a Fredy Torres (Compras)', await cambiar(t.page, 'compras'));
  await t.page.click('.tab[data-vista="inventario"]'); await t.page.click('#invSecciones [data-sec="hacer"]');
  await abrirHojaInv(`#invContenido [data-accion="comprar"][data-id="${cv.id}"]`);
  await t.page.fill('#acProv', 'Ferretería El Faro'); await t.page.fill('#acValor', '7500000');
  await enviarHoja();
  log('pagar 7.500.000 de 6.000.000 deja el aviso «Pagaron más de lo autorizado» para la Coordinadora y el Gerente general, y queda en el historial', await hasta(t.page, id => { const d = JSON.parse(localStorage.getItem('__fb_datos')), c = d.compras[id]; const av = Object.values(d.avisos).filter(a => /Pagaron más/.test(a.titulo)); return c.estado === 'comprado' && /25 % más/.test(c.historial[c.historial.length - 1].texto) && av.some(a => a.para === 'coordcompras') && av.some(a => a.para === 'gerente'); }, cv.id));
  log('esa compra queda ligada a Ferretería El Faro (pv-elfaro), sin repetir el proveedor', await hasta(t.page, id => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.compras[id].proveedorId === 'pv-elfaro' && d.compras[id].proveedor === 'Ferretería El Faro' && Object.values(d.proveedores).filter(p => /El Faro/.test(p.nombre)).length === 1; }, cv.id));
  await t.page.click('#invSecciones [data-sec="compras"]');
  log('en Compras la tarjeta dice «Pagó 25 % más de lo autorizado»', await hasta(t.page, () => /Pagó 25 % más de lo autorizado/.test(document.getElementById('invContenido').textContent)));

  // Sofía recibe la compra de 2 artículos: lo que va a bodega se suma solo.
  log('cambia a Andrés Beltrán (Bodega)', await cambiar(t.page, 'asistente'));
  await t.page.click('.tab[data-vista="inventario"]'); await t.page.click('#invSecciones [data-sec="hacer"]');
  const cinta0 = (await dI()).articulos['ar-009'].cantidad;
  await abrirHojaInv(`#invContenido [data-accion="recibir"][data-id="${cv.id}"]`);
  log('para recibir pide cuánto llegó de cada artículo y dice cuál va a bodega', await t.page.evaluate(() => document.querySelectorAll('#acCampos input[id^="rl"]').length === 2 && /Se suma a la bodega/.test(document.getElementById('acCampos').textContent) && /No va a bodega/.test(document.getElementById('acCampos').textContent)));
  await t.page.fill('#rl1', '8'); await t.page.fill('#acQuien', 'Mauricio Giraldo');
  await enviarHoja();
  log('llegaron 8 de 10 cintas: se suman 8 a la bodega, queda su movimiento y la compra pasa a recibida', await hasta(t.page, ([id, c0]) => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.compras[id].estado === 'recibido' && d.articulos['ar-009'].cantidad === c0 + 8 && Object.values(d.movimientos).some(m => m.compraId === id && m.articuloId === 'ar-009' && m.cantidad === 8 && /Llegaron 8 de 10/.test(m.nota)); }, [cv.id, cinta0]));
  log('y la Coordinadora recibe el aviso «Llegó menos de lo comprado»', Object.values((await dI()).avisos).some(a => a.para === 'coordcompras' && /Llegó menos/.test(a.titulo)));

  // Kárdex y mínimo sugerido (la Jefe).
  log('cambia a Carolina Castillo (Jefe)', await cambiar(t.page, 'jefe'));
  await t.page.click('.tab[data-vista="inventario"]'); await t.page.click('#invSecciones [data-sec="panorama"]');
  log('el Panorama de la Jefe avisa de la compra pagada con más de lo autorizado', await hasta(t.page, () => /compra pagada con más de lo autorizado/.test(document.getElementById('invContenido').textContent) && /Taladro percutor y 1 más \(\+25 %\)/.test(document.getElementById('invContenido').textContent)));
  await t.page.click('#invSecciones [data-sec="existencias"]');
  await t.page.locator('#invContenido [data-accion="verart"][data-id="ar-009"]').click();
  log('el detalle del artículo trae el kárdex', await hasta(t.page, () => !document.getElementById('shAccion').hidden && !!document.querySelector('#acCampos [data-accion="kardex"]')));
  await t.page.click('#acCampos [data-accion="kardex"]');
  log('el kárdex lista cada movimiento con lo que quedó, incluida la entrada de 8', await hasta(t.page, () => /Kárdex: Cinta aislante/.test(document.getElementById('acT').textContent) && /Compra recibida/.test(document.getElementById('acCampos').textContent) && document.querySelectorAll('#acCampos .lineas-tabla tbody tr').length >= 1 && /\+8/.test(document.getElementById('acCampos').textContent)));
  const [descK] = await Promise.all([t.page.waitForEvent('download', { timeout: 15000 }).catch(() => null), t.page.click('#acCampos [data-accion="excelkardex"]')]);
  if (descK) { const ruta = path.join(CAPTURAS, 'excel-kardex.xlsx'); await descK.saveAs(ruta); const hs = await excelInfo(ruta); log('el Excel del kárdex tiene formato y su título dice el artículo', hs.length === 1 && bienFormado(hs[0]) && /Cinta aislante/.test(hs[0].titulo), JSON.stringify(hs.map(h => [h.nombre, h.titulo]))); }
  log('descarga el Excel de ese artículo', !!descK && /^Kardex Cinta aislante .*\.xlsx$/.test(descK.suggestedFilename()), descK && descK.suggestedFilename());
  await t.page.keyboard.press('Escape');
  // Cuadro Autorizado · Pagado · Recibido en el detalle de la compra
  await t.page.click('#invSecciones [data-sec="compras"]');
  await t.page.click(`#invContenido [data-accion="vercompra"][data-id="${cv.id}"]`); await hasta(t.page, () => !document.getElementById('shAccion').hidden);
  log('el detalle de una compra pagada y recibida trae el cuadro Autorizado · Pagado · Recibido, una fila por artículo', await hasta(t.page, () => { const th = [...document.querySelectorAll('#acCampos .cuadro-compra thead th')].map(x => x.textContent); return th.join() === 'Qué,Autorizado,Pagado,Recibido' && document.querySelectorAll('#acCampos .cuadro-compra tbody tr').length === 2; }));
  log('lo pagado se reparte por artículo (+25 %) y lo que no va a bodega dice a quién se entregó', await hasta(t.page, () => { const f = [...document.querySelectorAll('#acCampos .cuadro-compra tbody tr')].map(r => r.textContent); return /Taladro percutor/.test(f[0]) && /\$\s?5\.875\.000/.test(f[0]) && /\+25 %/.test(f[0]) && /No va a bodega: se entregó a Mauricio Giraldo/.test(f[0]) && /\$\s?1\.625\.000/.test(f[1]); }));
  log('si llegó menos, lo marca en rojo (llegaron 8 de 10: faltan 2) y el total dice lo autorizado y lo pagado', await hasta(t.page, () => { const f = document.querySelectorAll('#acCampos .cuadro-compra tbody tr')[1], pie = document.querySelector('#acCampos .cuadro-compra tfoot').textContent; return /8 .*faltan 2/.test(f.textContent) && !!f.querySelector('.err-txt') && /Total aprox\./.test(pie) && /\$\s?6\.000\.000/.test(pie) && /\$\s?7\.500\.000/.test(pie) && /\+25 %/.test(pie) && /llegó menos en 1 artículo/.test(pie); }));
  await t.page.screenshot({ path: path.join(CAPTURAS, '18-compra-cuadro.png') });
  await t.page.keyboard.press('Escape');
  // Orden de compra imprimible (Fase 7): solo en compras autorizadas o compradas
  await t.page.evaluate(() => { window.__impresas = []; window.print = () => { const d = document.getElementById('impresion'); window.__impresas.push({ texto: d ? d.textContent : '', cuerpo: document.body.classList.contains('imprimiendo'), articulos: d ? d.querySelectorAll('.acta-tabla tbody tr').length : 0 }); }; });
  const abrirCompraInv = async id => { await t.page.click(`#invContenido [data-accion="vercompra"][data-id="${id}"]`); await hasta(t.page, () => !document.getElementById('shAccion').hidden); };
  await abrirCompraInv('co-002');
  log('una compra apenas pedida no trae el botón de la orden de compra', await hasta(t.page, () => /Mouse inalámbrico/.test(document.getElementById('acT').textContent) && !document.querySelector('#acCampos [data-accion="imprimirorden"]')));
  await t.page.keyboard.press('Escape');
  await abrirCompraInv('co-006');
  log('una compra ya comprada sí trae «Orden de compra (imprimir o PDF)»', await hasta(t.page, () => !!document.querySelector('#acCampos [data-accion="imprimirorden"]') && /Orden de compra/.test(document.querySelector('#acCampos [data-accion="imprimirorden"]').textContent)));
  await t.page.click('#acCampos [data-accion="imprimirorden"]');
  log('al tocarlo arma el documento con el número OC-, el proveedor, cada artículo, el total y «Documento de prueba», y manda a imprimir solo eso', await t.page.evaluate(() => { const x = (window.__impresas || [])[0]; return !!x && x.cuerpo && x.articulos === 1 && /ORDEN DE COMPRA/.test(x.texto) && /OC-006/.test(x.texto) && /Papelería Central/.test(x.texto) && /Memorias USB de 64 GB/.test(x.texto) && /\$\s?320\.000/.test(x.texto) && /Documento de prueba/.test(x.texto) && /AUTORIZÓ:/.test(x.texto) && /Mauricio Giraldo/.test(x.texto) && /Oscar Muñoz/.test(x.texto); }), JSON.stringify(await t.page.evaluate(() => (window.__impresas || [])[0])).slice(0, 400));
  await t.page.emulateMedia({ media: 'print' }); await esp(150);
  await t.page.screenshot({ path: path.join(CAPTURAS, '19-orden-compra.png') });
  await t.page.emulateMedia({ media: null });
  await t.page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  log('al terminar de imprimir se quita el documento de la pantalla', await hasta(t.page, () => !document.getElementById('impresion') && !document.body.classList.contains('imprimiendo')));
  await t.page.keyboard.press('Escape');
  await abrirCompraInv(cv.id);
  log('una compra ya recibida no trae el botón de la orden de compra', await hasta(t.page, () => /Taladro percutor/.test(document.getElementById('acT').textContent) && !document.querySelector('#acCampos [data-accion="imprimirorden"]')));
  await t.page.keyboard.press('Escape');
  await t.page.click('#invSecciones [data-sec="existencias"]');
  // Kárdex largo: con 120 movimientos más se muestran de 50 en 50 y «Ver más» agrega los siguientes sin rehacer la lista.
  await t.page.evaluate(() => { const S = window.App.S, base = S.datos.movimientos.find(m => m.articuloId === 'ar-009'); S.datos.movimientos = S.datos.movimientos.concat(Array.from({ length: 120 }, (_, i) => Object.assign({}, base, { id: 'mov-prueba-' + i, fecha: new Date(Date.now() - (i + 1) * 3600000).toISOString() }))); });
  await t.page.locator('#invContenido [data-accion="verart"][data-id="ar-009"]').click();
  await t.page.click('#acCampos [data-accion="kardex"]');
  const filasK = () => t.page.evaluate(() => document.querySelectorAll('#acCampos .lineas-tabla tbody tr').length);
  const totalK = await t.page.evaluate(() => window.App.S.datos.movimientos.filter(m => m.articuloId === 'ar-009').length);
  log('el kárdex largo muestra solo 50 filas y el botón dice cuántas faltan', await hasta(t.page, n => document.querySelectorAll('#acCampos .lineas-tabla tbody tr').length === 50 && new RegExp(`Ver más \\(${n - 50} más\\)`).test((document.querySelector('#acCampos .ver-mas') || {}).textContent || ''), totalK));
  await t.page.click('#acCampos .ver-mas');
  log('«Ver más» agrega otras 50 filas', (await filasK()) === 100);
  await t.page.click('#acCampos .ver-mas');
  log('al llegar al final, se muestran todas y el botón desaparece', (await filasK()) === totalK && !(await t.page.locator('#acCampos .ver-mas').count()));
  await t.page.keyboard.press('Escape');
  await t.page.locator('#invContenido [data-accion="verart"][data-id="ar-004"]').click();
  log('un artículo que sale seguido muestra cuánto sale y el mínimo sugerido', await hasta(t.page, () => !document.getElementById('shAccion').hidden && /En los últimos 30 días salieron/.test(document.getElementById('acCampos').textContent) && /mínimo de \d+ alcanza para unos 10 días/.test(document.getElementById('acCampos').textContent), await texto(t.page, '#acCampos')));
  await t.page.keyboard.press('Escape');
  console.log('4f. Roles nuevos del organigrama: Colaborador, Financiero, Consulta y otro Gerente');
  const cambiarA = async correo => { await t.page.click('#btnPersona'); await t.page.waitForSelector('#shPersona:not([hidden])');
    await t.page.evaluate(() => document.querySelectorAll('#personaLista details.grupo-personas').forEach(d => { d.open = true; }));
    await t.page.click(`#personaLista [data-correo="${correo}"]`); return hasta(t.page, c => document.getElementById('shPersona').hidden && document.getElementById('btnPersona').getAttribute('aria-label').length > 0 && c, correo); };
  const secs = () => t.page.evaluate(() => [...document.querySelectorAll('#invSecciones [data-sec]')].map(b => b.dataset.sec).join(','));
  const tabs = () => t.page.evaluate(() => [...document.querySelectorAll('.tab[data-vista]')].filter(x => !x.hidden).map(x => x.dataset.vista).join(','));
  await cambiarA('colaborador.yuliana.murcia@example.com'); await esp(400);
  log('Yuliana (Colaborador): entra con su nombre y su cargo, y no ve Equipos ni Vehículos', (await texto(t.page, '#nombreTop')) === 'Yuliana M.' && (await texto(t.page, '#rolTop')) === 'Colaborador' && (await tabs()) === 'inicio,inventario,reuniones', await tabs());
  await t.page.click('.tab[data-vista="inventario"]');
  log('el Colaborador ve «Lo mío», Existencias, Pedidos y Compras, y puede pedir material y compras', await hasta(t.page, () => [...document.querySelectorAll('#invSecciones [data-sec]')].map(b => b.dataset.sec).join(',') === 'hacer,existencias,solicitudes,compras' && /Lo mío/.test(document.getElementById('invSecciones').textContent) && !document.getElementById('btnPedirMaterial').hidden && !document.getElementById('btnPedirCompra').hidden));
  log('el Colaborador no ve botones de autorizar, comprar ni recibir', !(await visible(t.page, '#invContenido [data-accion="autorizar"], #invContenido [data-accion="comprar"], #invContenido [data-accion="recibir"]')));
  await cambiarA('financiero.adriana.patino@example.com'); await t.page.click('.tab[data-vista="inventario"]');
  log('Adriana (Financiero): ve Existencias, Movimientos, Pedidos, Compras, Proveedores y Resumen, y también puede pedir', await hasta(t.page, () => [...document.querySelectorAll('#invSecciones [data-sec]')].map(b => b.dataset.sec).join(',') === 'existencias,movimientos,solicitudes,compras,proveedores,resumen' && !document.getElementById('btnPedirCompra').hidden));
  log('el Financiero ve todos los módulos que le tocan y no Equipos ni Vehículos', (await tabs()) === 'inicio,inventario,reuniones', await tabs());
  await t.page.click('#invSecciones [data-sec="proveedores"]');
  log('el Financiero ve los proveedores pero no puede agregar ni cambiar ninguno', await hasta(t.page, () => document.querySelectorAll('#invContenido .card.tarea').length >= 6 && !document.querySelector('#invContenido [data-accion="nuevoprov"]')) && await (async () => { await t.page.click('#invContenido .card.tarea'); await t.page.waitForSelector('#shAccion:not([hidden])'); const r = await t.page.evaluate(() => !document.querySelector('#acCampos [data-accion="editprov"]') && !document.querySelector('#acCampos [data-accion="borrarprov"]') && /Último precio por artículo/.test(document.getElementById('acCampos').textContent)); await t.page.keyboard.press('Escape'); await hasta(t.page, () => document.getElementById('shAccion').hidden); return r; })());
  await t.page.click('#invSecciones [data-sec="compras"]'); await t.page.click('#invContenido [data-accion="vercompra"]');
  log('el Financiero abre cualquier compra y ve el detalle y la foto de factura, sin botones de decidir', await hasta(t.page, () => !document.getElementById('shAccion').hidden && /Total aprox\./.test(document.getElementById('acCampos').textContent) && !document.querySelector('#acCampos [data-accion="autorizar"], #acCampos [data-accion="comprar"], #acCampos [data-accion="recibir"]')));
  await t.page.keyboard.press('Escape');
  await cambiarA('consulta.revisor.fiscal@example.com'); await esp(300);
  log('el Revisor Fiscal (Consulta): ve Inventario y Vehículos, y no Equipos ni Reuniones', (await tabs()) === 'inicio,inventario,vehiculos', await tabs());
  await t.page.click('.tab[data-vista="inventario"]');
  log('y en Inventario solo mira: sin botones de pedir', await hasta(t.page, () => document.getElementById('btnPedirMaterial').hidden && document.getElementById('btnPedirCompra').hidden && [...document.querySelectorAll('#invSecciones [data-sec]')].map(b => b.dataset.sec).join(',') === 'existencias,movimientos,solicitudes,compras,resumen'));
  await cambiarA('gerente.alejandro.giraldo@example.com'); await t.page.click('.tab[data-vista="inventario"]');
  log('Alejandro Giraldo (Gerente de Proyectos) tiene el mismo Inventario de Gerente: Resumen, Compras, Proveedores, Existencias y Pedidos', (await texto(t.page, '#nombreTop')) === 'Alejandro G.' && (await texto(t.page, '#rolTop')) === 'Gerente' && (await secs()) === 'resumen,compras,proveedores,existencias,solicitudes', await secs());
  await t.page.screenshot({ path: path.join(CAPTURAS, '09d-gerente-alejandro.png'), fullPage: true });
  console.log('4e. Vehículos por rol: Conductor, Bodega y Jefe');
  const dat = () => t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos')));
  const IMG = path.join(RAIZ, 'iconos', 'control-512.png');
  const abiertaVeh = () => t.page.waitForSelector('#shVeh:not([hidden])');
  const guardarVeh = async () => { await t.page.click('#vePrimario'); return hasta(t.page, () => document.getElementById('shVeh').hidden); };
  const errVeh = re => hasta(t.page, r => !document.getElementById('veErr').hidden && new RegExp(r).test(document.getElementById('veErr').textContent), re.source);
  const cincoFotos = async () => { for (const k of ['frente', 'atras', 'izquierda', 'derecha', 'llantas']) await t.page.setInputFiles('#vf_' + k, IMG); return hasta(t.page, () => { const im = [...document.querySelectorAll('#veCampos .fotos-grid img')]; return im.length === 5 && im.every(i => !i.hidden); }); };
  const LLANTA = 'La llanta delantera derecha está baja';
  const marcarRev = malos => t.page.evaluate(m => { document.querySelectorAll('#veCampos input[type="radio"]').forEach(r => { const k = r.name.replace('vr_', ''); if (r.value === (m.includes(k) ? 'mal' : 'bien')) r.click(); }); }, malos);
  log('cambia a Carlos (Conductor)', await cambiar(t.page, 'conductor'));
  await t.page.click('.tab[data-vista="vehiculos"]');
  log('el Conductor ve sus 2 viajes: el ABC 123 espera la llegada y el JKL 012 está listo para salir', await hasta(t.page, () => /Viajes de reuniones \(2\)/.test(document.getElementById('vehContenido').textContent) && /El carro está en uso/.test(document.getElementById('vehContenido').textContent) && !!document.querySelector('#vehContenido [data-accion="salida"][data-viaje="ne-025"]')), await texto(t.page, '#vehContenido'));
  log('el Conductor no tiene botones de revisar ni de documentos', !(await t.page.$('#vehContenido [data-accion="revisar"], #vehContenido [data-accion="docs"]')) && (await t.page.locator('#vehSecciones [data-sec="resumen"]').count()) === 0);
  await t.page.click('#vehSecciones [data-sec="carros"]'); await t.page.click('#vehContenido [data-accion="ver"][data-id="ve-abc123"]'); await abiertaVeh();
  log('el Conductor ve el plan de mantenimiento del carro, pero sin botones para agregar, marcar hecho ni quitar tareas', await hasta(t.page, () => /Plan de mantenimiento \(2\)/.test(document.getElementById('veCampos').textContent) && /Cambio de aceite/.test(document.getElementById('veCampos').textContent) && !document.querySelector('#veCampos [data-accion="mttonuevo"], #veCampos [data-accion="mttohecho"], #veCampos [data-accion="mttoquitar"]')));
  await t.page.keyboard.press('Escape'); await hasta(t.page, () => document.getElementById('shVeh').hidden);
  await t.page.click('#vehSecciones [data-sec="hacer"]');
  // ---------- Pedir un carro (Fase 14): el Conductor pide, ve su viaje reservado y cancela ----------
  console.log('4e-2. Pedir un carro (Fase 14): el Conductor');
  const hoyV = await t.page.evaluate(() => window.App.hoyISO());
  const masDiasV = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const txtVeh = () => texto(t.page, '#vehContenido');
  log('el Conductor ve «Pedir un carro», su viaje con carro reservado (1: el JKL 012 de hoy) y sus pedidos (el que espera y el que rechazaron)', await hasta(t.page, () => { const x = document.getElementById('vehContenido').textContent; return !!document.querySelector('#vehContenido [data-accion="pedircarro"]') && /Mis viajes con carro reservado \(1\)/.test(x) && /Mis pedidos de carro \(2\)/.test(x) && /Riohacha: recoger material/.test(x) && /Ese día no hay carro libre con los papeles al día/.test(x); }), await txtVeh());
  log('el Conductor no ve «Carros por aprobar» (eso es de Transporte, Bodega y la Jefe)', !/Carros por aprobar/.test(await txtVeh()));
  log('la reserva de hoy dice el carro y el conductor, y trae «Registrar salida» porque el JKL 012 está disponible', await t.page.evaluate(() => { const c = document.querySelector('#vehContenido [data-reserva-card="rs-002"]'); return !!c && !!c.querySelector('[data-accion="salida"][data-reserva="rs-002"]') && /Conductor: Oscar Farfán/.test(c.textContent) && /JKL 012/.test(c.textContent) && /Aprobada/.test(c.textContent); }));
  log('el pedido que espera trae «Cancelar el pedido» y el rechazado dice quién lo rechazó y por qué', await t.page.evaluate(() => { const a = document.querySelector('#vehContenido [data-reserva-card="rs-001"]'), r = document.querySelector('#vehContenido [data-reserva-card="rs-003"]'); return !!a && !!a.querySelector('[data-accion="cancelares"]') && /Por aprobar/.test(a.textContent) && !!r && /Rechazó Andrés Beltrán: Ese día no hay carro libre/.test(r.textContent) && !r.querySelector('[data-accion]'); }));
  await t.page.screenshot({ path: path.join(CAPTURAS, '32-pedir-carro-conductor.png'), fullPage: true });
  await t.page.click('#vehContenido [data-accion="pedircarro"]'); await abiertaVeh();
  log('«Pedir un carro» abre con mañana, las 08:00 y cuántos carros hay libres ese día (el ABC 123 y el JKL 012)', await hasta(t.page, r => document.getElementById('vpFecha').value === r && document.getElementById('vpHora').value === '08:00' && /Ese día hay 2 carros libres/.test(document.getElementById('vpLibres').textContent), masDiasV(hoyV, 1)), await texto(t.page, '#vpLibres'));
  await t.page.fill('#vpFecha', masDiasV(hoyV, 6)); await esp(200);
  log('el día de una reunión con 2 camionetas autorizadas (dentro de 6 días) ya no hay carros libres: las reuniones también cuentan', /no hay carros libres/.test(await texto(t.page, '#vpLibres')), await texto(t.page, '#vpLibres'));
  await t.page.fill('#vpFecha', hoyV); await esp(200);
  log('hoy queda 1 libre (el ABC 123): el JKL 012 ya tiene la reserva de hoy, y las reservas también cuentan', /Ese día hay 1 carro libre/.test(await texto(t.page, '#vpLibres')), await texto(t.page, '#vpLibres'));
  await t.page.fill('#vpFecha', masDiasV(hoyV, -1)); await t.page.fill('#vpDestino', 'Valledupar'); await t.page.fill('#vpMotivo', 'Llevar soportes');
  await t.page.click('#vePrimario');
  log('un día que ya pasó no se acepta', await errVeh(/Escoge el día/));
  await t.page.fill('#vpFecha', masDiasV(hoyV, 1)); await t.page.fill('#vpHora', ''); await t.page.click('#vePrimario');
  log('sin hora no se acepta', await errVeh(/Escribe la hora/));
  await t.page.fill('#vpHora', '10:15'); await t.page.fill('#vpDestino', 'ab'); await t.page.click('#vePrimario');
  log('un destino de menos de 3 letras tampoco', await errVeh(/Escribe a dónde va/));
  await t.page.fill('#vpDestino', 'Valledupar: reunión con el contador'); await t.page.fill('#vpMotivo', 'x'); await t.page.click('#vePrimario');
  log('ni un motivo de una letra', await errVeh(/Cuenta para qué/));
  await t.page.fill('#vpMotivo', 'Llevar los soportes de la contabilidad');
  log('con todo bien se guarda y la hoja se cierra', await guardarVeh());
  log('el pedido queda «pedida» a nombre del Conductor, con su correo, y les avisa a la Jefe, Transporte y Bodega (no a otro Conductor)', await (async () => { const d = await dat(), r = Object.values(d.reservas).find(x => x.destino === 'Valledupar: reunión con el contador'); return !!r && r.estado === 'pedida' && r.por === 'Oscar Farfán' && r.porRol === 'conductor' && r.pideCorreo === 'conductor.oscar.farfan@example.com' && r.fecha === masDiasV(hoyV, 1) && r.hora === '10:15' && ['jefe', 'carros', 'asistente'].every(rol => Object.values(d.avisos).some(a => a.para === rol && /Piden un carro/.test(a.titulo))) && !Object.values(d.avisos).some(a => a.para === 'conductor' && /Piden un carro/.test(a.titulo)); })());
  log('y aparece en «Mis pedidos de carro (3)»', await hasta(t.page, () => /Mis pedidos de carro \(3\)/.test(document.getElementById('vehContenido').textContent) && /Valledupar: reunión con el contador/.test(document.getElementById('vehContenido').textContent)));
  // Otro pedido que el Conductor cancela él mismo.
  await t.page.click('#vehContenido [data-accion="pedircarro"]'); await abiertaVeh();
  await t.page.fill('#vpFecha', masDiasV(hoyV, 4)); await t.page.fill('#vpDestino', 'Fonseca: recoger una encomienda'); await t.page.fill('#vpMotivo', 'Es una encomienda de la oficina');
  await guardarVeh();
  const idEnc = await t.page.evaluate(() => Object.entries(JSON.parse(localStorage.getItem('__fb_datos')).reservas).find(([, r]) => r.destino === 'Fonseca: recoger una encomienda')[0]);
  await t.page.click(`#vehContenido [data-accion="cancelares"][data-id="${idEnc}"]`); await abiertaVeh();
  log('«Cancelar el pedido» pide confirmar y dice que no se puede deshacer', /Cancelar el pedido/.test(await texto(t.page, '#veT')) && /no se puede deshacer/.test(await texto(t.page, '#veCampos')));
  log('al confirmar, el pedido queda cancelado (por quien lo pidió), sin avisarle a nadie, y sale de la lista', await guardarVeh() && await (async () => { const d = await dat(), r = d.reservas[idEnc]; return r.estado === 'cancelada' && r.canceladaPor === 'Oscar Farfán' && !Object.values(d.avisos).some(a => /Cancelaron un carro/.test(a.titulo)); })() && await hasta(t.page, () => /Mis pedidos de carro \(3\)/.test(document.getElementById('vehContenido').textContent) && !/Fonseca/.test(document.getElementById('vehContenido').textContent)));
  await t.page.click('#vehContenido [data-accion="novedad"]'); await abiertaVeh();
  await t.page.selectOption('#vnVeh', 've-jkl012'); await t.page.selectOption('#vnTipo', 'llanta'); await t.page.fill('#vnKm', '21340'); await t.page.fill('#vnDesc', LLANTA);
  log('el Conductor no pone el costo de la novedad', !(await t.page.$('#vnCosto')));
  await t.page.click('#vePrimario');
  log('sin foto no deja reportar la novedad', await errVeh(/Falta la foto/));
  await t.page.setInputFiles('#vnFoto', IMG); await hasta(t.page, () => !document.getElementById('vnFotoVer').hidden);
  log('con la foto, la novedad queda sin revisar, en 0 pesos y con aviso para Jefe, Transporte, Bodega y Gerente', await guardarVeh() && await (async () => { const d = await dat(); const n = Object.values(d.novedades).find(x => x.descripcion === LLANTA); return !!n && n.reportaRol === 'conductor' && n.costo === 0 && !n.revisada && /^data:image\/jpeg;base64,/.test(n.foto) && n.foto.length < 400000 && ['jefe', 'carros', 'asistente', 'gerente'].every(r => Object.values(d.avisos).some(a => a.para === r && /Novedad/.test(a.titulo))); })());
  // Tanqueos (Fase 10): el Conductor los registra con la foto del recibo
  const fotoTanq = async () => { await t.page.setInputFiles('#vqFoto', IMG); return hasta(t.page, () => !document.getElementById('vqFotoVer').hidden); };
  const nuevoTanq = async (veh, km, gal, pagado, lleno = true) => { await t.page.click('#vehContenido [data-accion="tanqueo"]'); await abiertaVeh(); await t.page.selectOption('#vqVeh', veh); await t.page.fill('#vqKm', String(km)); await t.page.fill('#vqGal', String(gal)); await t.page.fill('#vqValor', String(pagado)); if (!lleno) await t.page.evaluate(() => document.getElementById('vqLleno').click()); await fotoTanq(); return guardarVeh(); };
  await t.page.click('#vehContenido [data-accion="tanqueo"]'); await abiertaVeh();
  log('«Registrar tanqueo» pide carro, kilometraje, galones, lo pagado, si llenó el tanque (marcado) y la foto del recibo', await hasta(t.page, () => ['vqVeh', 'vqKm', 'vqGal', 'vqValor', 'vqLleno', 'vqFoto'].every(i => !!document.getElementById(i)) && document.getElementById('vqLleno').checked));
  await t.page.selectOption('#vqVeh', 've-abc123'); await t.page.click('#vePrimario');
  log('sin kilometraje no deja guardar', await errVeh(/Escribe el kilometraje/));
  await t.page.fill('#vqKm', '45100'); await t.page.fill('#vqGal', '12,5'); await t.page.fill('#vqValor', '160000'); await t.page.click('#vePrimario');
  log('un kilometraje menor que el del último tanqueo del carro no deja guardar', await errVeh(/menor que el del último tanqueo \(45\.170 km\)/));
  await t.page.fill('#vqKm', '48500'); await t.page.click('#vePrimario');
  log('un kilometraje muy alto no deja guardar', await errVeh(/muy alto/));
  await t.page.fill('#vqKm', '45500'); await t.page.fill('#vqGal', 'doce'); await t.page.click('#vePrimario');
  log('unos galones que no son un número no dejan guardar', await errVeh(/Escribe los galones/));
  await t.page.fill('#vqGal', '12,5'); await t.page.fill('#vqValor', '20000'); await t.page.click('#vePrimario');
  log('un valor que da un precio imposible por galón (1.600) no deja guardar', await errVeh(/por galón/));
  await t.page.fill('#vqValor', '160000'); await t.page.click('#vePrimario');
  log('sin la foto del recibo no deja guardar', await errVeh(/Falta la foto del recibo/));
  await fotoTanq();
  log('con todo bien, el tanqueo se guarda a nombre del Conductor, con los galones en decimales, el tanque lleno y la foto en JPEG pequeña', await guardarVeh() && await (async () => { const d = await dat(); const x = Object.values(d.tanqueos).find(y => y.km === 45500); return !!x && x.vehiculoId === 've-abc123' && x.placa === 'ABC 123' && x.galones === 12.5 && x.valor === 160000 && x.lleno === true && x.porRol === 'conductor' && /^data:image\/jpeg;base64,/.test(x.foto) && x.foto.length < 400000 && Object.keys(d.tanqueos).length === 18; })());
  log('ese tanqueo rinde lo normal (330 km con 12,5 galones = 26,4), así que no manda aviso de consumo raro', Object.values((await dat()).avisos).filter(a => a.titulo === 'Consumo raro en un carro').length === 0);
  log('dos tanques llenos con el mismo km no cierran tramo y los galones del segundo se suman al siguiente (300 km con 8 + 12 galones = 15 km por galón)', await t.page.evaluate(() => {
    const ts = [{ id: 'a', km: 1000, galones: 10, valor: 100000, lleno: true }, { id: 'b', km: 1000, galones: 8, valor: 80000, lleno: true }, { id: 'c', km: 1300, galones: 12, valor: 120000, lleno: true }];
    const x = window.Vehiculos.tramosDe(ts), y = window.Vehiculos.tramosDe([ts[0], ts[2]]);
    return x.length === 1 && x[0].km === 300 && x[0].galones === 20 && x[0].valor === 200000 && x[0].kmGal === 15 && y.length === 1 && y[0].galones === 12 && y[0].kmGal === 25;
  }));
  log('un tanqueo que rinde mucho menos (100 km con 20 galones = 5 km por galón) se guarda y avisa a Transporte, Bodega y la Jefe', await nuevoTanq('ve-abc123', 45600, 20, 258000) && await (async () => { const av = Object.values((await dat()).avisos).filter(a => a.titulo === 'Consumo raro en un carro'); return av.length === 3 && ['carros', 'asistente', 'jefe'].every(r => av.some(a => a.para === r)) && av.every(a => /ABC 123 rindió 5,0 km por galón; lo normal es 26,\d/.test(a.texto)); })());
  log('un tanqueo sin llenar el tanque se guarda como parcial (lleno: falso) y no avisa nada', await nuevoTanq('ve-jkl012', 21400, 5, 77500, false) && await (async () => { const d = await dat(), x = Object.values(d.tanqueos).find(y => y.km === 21400); return !!x && x.lleno === false && Object.values(d.avisos).filter(a => a.titulo === 'Consumo raro en un carro').length === 3; })());
  await t.page.click('#vehSecciones [data-sec="tanqueos"]');
  log('el Conductor ve «Tanqueos» con los 20, el botón para registrar otro, y avisa que hay 2 con consumo raro', await hasta(t.page, () => document.querySelectorAll('#vehContenido .list .card').length === 20 && !!document.querySelector('#vehContenido [data-accion="tanqueo"]') && /2 tanqueos con consumo raro/.test(document.getElementById('vehContenido').textContent)), await texto(t.page, '#vehContenido'));
  await t.page.click('#vehSecciones [data-sec="carros"]'); await t.page.click('#vehContenido [data-accion="ver"][data-id="ve-abc123"]'); await abiertaVeh();
  log('la hoja de vida del ABC 123 dice «Combustible y costo (7 tanqueos)», cuánto rinde, el costo del mes y el botón «Registrar tanqueo»', await hasta(t.page, () => { const x = document.getElementById('veCampos').textContent; return /Combustible y costo \(7 tanqueos\)/.test(x) && /Rinde[\s\S]{0,12}\d+,\d km por galón/.test(x) && !!document.querySelector('#veCampos [data-accion="tanqueo"]') && /Costo este mes/.test(x); }), await texto(t.page, '#veCampos'));
  await t.page.screenshot({ path: path.join(CAPTURAS, '24-hoja-combustible.png'), fullPage: true });
  await t.page.keyboard.press('Escape'); await hasta(t.page, () => document.getElementById('shVeh').hidden);
  await t.page.click('#vehSecciones [data-sec="hacer"]');
  await t.page.click('#vehContenido [data-accion="salida"][data-viaje="ne-025"]'); await abiertaVeh();
  log('la salida del viaje es con Rafael (el conductor que escogió la Jefe)', /Comunidad Ejemplo Norte/.test(await texto(t.page, '#veSub')) && !(await t.page.$('#vsCond')));
  log('la revisión antes de salir trae 15 puntos con «Bien» y «Mal» (4 críticos y 11 más), todos sin marcar', await t.page.evaluate(() => { const g = [...document.querySelectorAll('#veCampos .seg')]; return g.length === 15 && g.every(x => x.getAttribute('role') === 'radiogroup' && !x.querySelector('input:checked')) && document.querySelectorAll('#veCampos .seg input[name="vr_frenos"]').length === 2 && /Extintor \(vigente\)/.test(document.getElementById('veCampos').textContent) && /Llanta de repuesto/.test(document.getElementById('veCampos').textContent); }));
  await t.page.evaluate(() => { const s = document.querySelector('#shVeh .sheet'); s.scrollTop = 1250; }); await esp(200);
  await t.page.screenshot({ path: path.join(CAPTURAS, '20-revision-salida.png') });
  await t.page.evaluate(() => { document.querySelector('#shVeh .sheet').scrollTop = 0; });
  await marcarRev(['frenos']);
  log('con los frenos mal sale «Este carro no debe salir» y el botón pasa a «Reportar y no salir»', await hasta(t.page, () => /Este carro no debe salir/.test(document.getElementById('vsAlerta').textContent) && /frenos/.test(document.getElementById('vsAlerta').textContent) && /Reportar y no salir/.test(document.getElementById('vePrimario').textContent)));
  await t.page.screenshot({ path: path.join(CAPTURAS, '20b-no-debe-salir.png'), fullPage: true });
  await t.page.click('#vePrimario');
  log('para reportar pide contar qué falla', await errVeh(/Cuenta qué falla/));
  await t.page.fill('#vsObs', 'Al frenar el pedal baja hasta el fondo');
  await t.page.click('#vePrimario');
  log('y pide al menos una foto del problema', await errVeh(/al menos una foto/));
  await t.page.setInputFiles('#vf_frente', IMG); await hasta(t.page, () => !document.getElementById('vf_frenteVer').hidden);
  const entregas0 = Object.keys((await dat()).entregas).length;
  log('con una foto y la observación, reporta el problema y la hoja se cierra', await guardarVeh());
  log('el carro NO salió (sigue disponible y no hay salida nueva) y quedó una novedad sin revisar con la foto y lo que falla', await (async () => { const d = await dat(); const n = Object.values(d.novedades).find(x => /Revisión antes de salir: frenos mal/.test(x.descripcion)); return !!n && d.vehiculos['ve-jkl012'].estado === 'disponible' && Object.keys(d.entregas).length === entregas0 && !n.revisada && n.tipo === 'mantenimiento' && /pedal baja/.test(n.descripcion) && /^data:image\/jpeg/.test(n.foto) && n.costo === 0; })());
  log('le avisa a la Jefe, Transporte, Bodega y Gerente que el carro no debe salir', await (async () => { const d = await dat(); return ['jefe', 'carros', 'asistente', 'gerente'].every(r => Object.values(d.avisos).some(a => a.para === r && /no debe salir/.test(a.titulo))); })());
  // Se quita lo que se creó para esta prueba y se vuelve a abrir la salida.
  await t.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return window.nube.lote(Object.entries(d.novedades).filter(([, n]) => /Revisión antes de salir/.test(n.descripcion)).map(([id]) => ['borrar', 'novedades', id]).concat(Object.entries(d.avisos).filter(([, a]) => /no debe salir/.test(a.titulo)).map(([id]) => ['borrar', 'avisos', id]))); });
  await t.page.click('#vehContenido [data-accion="salida"][data-viaje="ne-025"]'); await abiertaVeh();
  await t.page.fill('#vsKm', '21300'); await t.page.click('#vePrimario');
  log('un kilometraje menor que el último no deja guardar', await errVeh(/no puede ser menor/));
  await t.page.fill('#vsKm', '21350'); await t.page.click('#vePrimario');
  log('sin las 5 fotos no deja guardar', await errVeh(/Faltan fotos/));
  log('se cargan las 5 fotos (frente, atrás, lados y llantas)', await cincoFotos());
  await t.page.click('#vePrimario');
  log('sin marcar Bien o Mal en cada punto de la revisión no deja registrar la salida', await errVeh(/Falta marcar Bien o Mal/));
  await marcarRev(['pito']); await t.page.click('#vePrimario');
  log('si marca un problema y no lo cuenta, pide la observación', await errVeh(/observaciones/));
  log('un punto que no es crítico (el pito) no bloquea la salida: el botón sigue diciendo «Registrar salida»', /Registrar salida/.test(await texto(t.page, '#vePrimario')) && !(await texto(t.page, '#vsAlerta')).trim());
  await t.page.fill('#vsObs', 'El pito no suena');
  log('la salida queda: JKL 012 en uso con Rafael, ligada a la reunión, con sus fotos, y la Jefe sabe del problema', await guardarVeh() && await (async () => { const d = await dat(); const e = Object.values(d.entregas).find(x => x.vehiculoId === 've-jkl012' && x.tipo === 'salida'); const v = d.vehiculos['ve-jkl012']; return !!e && e.reunionId === 're-001' && e.conductor === 'Rafael Ospino' && e.revision.pito === false && e.revision.frenos === true && Object.keys(e.revision).length === 15 && Object.values(e.fotos).length === 5 && Object.values(e.fotos).every(f => /^data:image\/jpeg/.test(f) && f.length < 200000) && v.estado === 'en-uso' && v.km === 21350 && v.conductor === 'Rafael Ospino' && Object.values(d.avisos).some(a => a.para === 'jefe' && /problemas/.test(a.titulo)); })());
  log('el viaje ahora pide registrar la llegada', await hasta(t.page, () => !!document.querySelector('#vehContenido [data-accion="llegada"][data-viaje="ne-025"]')));
  await t.page.click('#vehContenido [data-accion="llegada"][data-viaje="ne-025"]'); await abiertaVeh();
  await t.page.fill('#vsKm', '21420'); await cincoFotos();
  await t.page.screenshot({ path: path.join(CAPTURAS, '07-llegada-conductor.png'), fullPage: true });
  log('la llegada deja el carro disponible con el kilometraje nuevo y el viaje sale de la lista', await guardarVeh() && await (async () => { const d = await dat(); const v = d.vehiculos['ve-jkl012']; return v.estado === 'disponible' && v.km === 21420 && v.conductor === '' && Object.values(d.entregas).filter(x => x.vehiculoId === 've-jkl012').length === 2; })() && await hasta(t.page, () => !document.querySelector('#vehContenido [data-viaje="ne-025"]') && /Viajes de reuniones \(1\)/.test(document.getElementById('vehContenido').textContent)));
  // La salida y la llegada de la reserva de hoy (JKL 012) quedan ligadas a ella.
  await t.page.click('#vehContenido [data-accion="salida"][data-reserva="rs-002"]'); await abiertaVeh();
  log('la salida de una reserva dice a dónde va y con quién', /Riohacha: recoger material/.test(await texto(t.page, '#veSub')) && /Oscar Farfán/.test(await texto(t.page, '#veSub')));
  await t.page.fill('#vsKm', '21430'); await cincoFotos(); await marcarRev([]);
  log('la salida queda ligada a la reserva (reservaId) y el JKL 012 pasa a «en uso»', await guardarVeh() && await (async () => { const d = await dat(), e = Object.values(d.entregas).find(x => x.reservaId === 'rs-002' && x.tipo === 'salida'); return !!e && e.vehiculoId === 've-jkl012' && e.conductor === 'Oscar Farfán' && d.vehiculos['ve-jkl012'].estado === 'en-uso' && /viaje a Riohacha/.test(d.vehiculos['ve-jkl012'].historial.slice(-1)[0].texto); })());
  log('la reserva ahora dice que ya salió y pide la llegada', await hasta(t.page, () => { const c = document.querySelector('#vehContenido [data-reserva-card="rs-002"]'); return !!c && /ya salió: falta la llegada/.test(c.textContent) && !!c.querySelector('[data-accion="llegada"][data-reserva="rs-002"]') && !c.querySelector('[data-accion="salida"]') && !c.querySelector('[data-accion="cancelares"]'); }));
  await t.page.click('#vehContenido [data-accion="llegada"][data-reserva="rs-002"]'); await abiertaVeh();
  await t.page.fill('#vsKm', '21480'); await cincoFotos();
  log('la llegada deja el carro disponible, ligada a la misma reserva, y la reserva sale de la lista', await guardarVeh() && await (async () => { const d = await dat(), e = Object.values(d.entregas).find(x => x.reservaId === 'rs-002' && x.tipo === 'llegada'); return !!e && d.vehiculos['ve-jkl012'].estado === 'disponible' && d.vehiculos['ve-jkl012'].km === 21480; })() && await hasta(t.page, () => /Mis viajes con carro reservado \(0\)/.test(document.getElementById('vehContenido').textContent) && !document.querySelector('#vehContenido [data-reserva-card="rs-002"]')));
  log('cambia a Sofía (Bodega)', await cambiar(t.page, 'asistente'));
  await t.page.click('.tab[data-vista="vehiculos"]');
  // ---------- Pedir un carro (Fase 14): Bodega aprueba, rechaza y cancela; nadie decide lo suyo ----------
  console.log('4e-3. Pedir un carro (Fase 14): Bodega decide');
  log('Bodega ve «Carros por aprobar (2)»: el de Maicao y el de Valledupar, los dos de mañana, con 2 carros libres cada uno', await hasta(t.page, () => { const x = document.getElementById('vehContenido').textContent; return /Carros por aprobar \(2\)/.test(x) && /Maicao: llevar los contratos/.test(x) && /Valledupar: reunión con el contador/.test(x) && (x.match(/Carros libres ese día: 2/g) || []).length === 2; }), await txtVeh());
  await t.page.screenshot({ path: path.join(CAPTURAS, '33-carros-por-aprobar.png'), fullPage: true });
  await t.page.click('#vehContenido [data-accion="aprobares"][data-id="rs-001"]'); await abiertaVeh();
  log('al aprobar solo ofrece carros libres ese día (ABC 123 y JKL 012) y propone como conductor a quien lo pidió', await t.page.evaluate(() => { const o = [...document.querySelectorAll('#vrVeh option')].map(x => x.value).sort(); const c = document.getElementById('vrCond'); return o.join() === 've-abc123,ve-jkl012' && c.value === 'Oscar Farfán' && c.options.length === 3; }));
  await t.page.selectOption('#vrVeh', 've-abc123');
  log('Bodega aprueba el pedido de Maicao con el ABC 123', await guardarVeh() && await (async () => { const r = (await dat()).reservas['rs-001']; return r.estado === 'aprobada' && r.vehiculoId === 've-abc123' && r.placa === 'ABC 123' && r.conductor === 'Oscar Farfán' && r.decidePor === 'Andrés Beltrán' && r.decideCorreo === 'asistente.andres.beltran@example.com' && r.decideEn === hoyV; })());
  log('el Conductor recibe el aviso de que le aprobaron el carro', await (async () => Object.values((await dat()).avisos).some(a => a.para === 'conductor' && /Te aprobaron el carro/.test(a.titulo) && /ABC 123/.test(a.texto)))());
  log('con esa reserva, el ABC 123 ya no está libre mañana para una reunión (libresPara, el que usa Reuniones), pero sí para la misma reserva', await t.page.evaluate(f => { const sin = window.Vehiculos.libresPara(f, '', '').map(v => v.id), con = window.Vehiculos.libresPara(f, '', 'rs-001').map(v => v.id); return !sin.includes('ve-abc123') && sin.includes('ve-jkl012') && con.includes('ve-abc123'); }, masDiasV(hoyV, 1)));
  await t.page.click('#vehContenido [data-accion="aprobares"]'); await abiertaVeh();
  log('al aprobar el otro pedido del mismo día solo queda el JKL 012: no se puede repetir carro', await t.page.evaluate(() => [...document.querySelectorAll('#vrVeh option')].map(x => x.value).join() === 've-jkl012'));
  await t.page.selectOption('#vrCond', 'Rafael Ospino');
  log('Bodega aprueba el de Valledupar con el JKL 012 y Rafael como conductor', await guardarVeh() && await (async () => { const r = Object.values((await dat()).reservas).find(x => x.destino === 'Valledupar: reunión con el contador'); return r.estado === 'aprobada' && r.vehiculoId === 've-jkl012' && r.conductor === 'Rafael Ospino'; })());
  log('«Carros por aprobar (0)» y «Carros reservados (2)», con «Cancelar la reserva» y sin «Registrar salida» (son de mañana)', await hasta(t.page, () => { const x = document.getElementById('vehContenido').textContent; return /Carros por aprobar \(0\)/.test(x) && /Carros reservados \(2\)/.test(x) && document.querySelectorAll('#vehContenido [data-accion="cancelares"]').length === 2 && !document.querySelector('#vehContenido [data-accion="salida"]'); }), await txtVeh());
  const idVall = await t.page.evaluate(() => Object.entries(JSON.parse(localStorage.getItem('__fb_datos')).reservas).find(([, r]) => r.destino === 'Valledupar: reunión con el contador')[0]);
  await t.page.click(`#vehContenido [data-accion="cancelares"][data-id="${idVall}"]`); await abiertaVeh();
  log('al cancelar una reserva aprobada la hoja dice que el carro queda libre', /Cancelar la reserva/.test(await texto(t.page, '#veT')) && /queda libre otra vez/.test(await texto(t.page, '#veCampos')));
  log('la reserva queda cancelada, le avisa al conductor y el JKL 012 vuelve a estar libre mañana', await guardarVeh() && await (async () => { const d = await dat(), r = d.reservas[idVall]; return r.estado === 'cancelada' && r.canceladaPor === 'Andrés Beltrán' && Object.values(d.avisos).some(a => a.para === 'conductor' && /Cancelaron un carro/.test(a.titulo)); })() && await t.page.evaluate(f => window.Vehiculos.libresPara(f).map(v => v.id).includes('ve-jkl012'), masDiasV(hoyV, 1)));
  // Un pedido de la Jefe (puesto aquí para la prueba): Bodega lo rechaza con un motivo.
  await t.page.evaluate(f => window.nube.lote([['set', 'reservas', 'rs-prueba1', { fecha: f, hora: '09:00', destino: 'Albania: visita a la obra', motivo: 'Revisar cómo va la obra', estado: 'pedida', por: 'Carolina Castillo', porRol: 'jefe', pideCorreo: 'jefe.carolina.castillo@example.com', en: new Date().toISOString().slice(0, 10) }]]), masDiasV(hoyV, 9));
  await t.page.click('#vehContenido [data-accion="rechazares"][data-id="rs-prueba1"]'); await abiertaVeh();
  await t.page.click('#vePrimario');
  log('para rechazar hay que decir por qué', await errVeh(/Cuenta por qué no/));
  await t.page.fill('#vrMotivo', 'Ese día todos los carros están en la reunión');
  log('Bodega rechaza el pedido de la Jefe con su motivo y a ella le llega el aviso', await guardarVeh() && await (async () => { const d = await dat(), r = d.reservas['rs-prueba1']; return r.estado === 'rechazada' && r.motivoRechazo === 'Ese día todos los carros están en la reunión' && r.decidePor === 'Andrés Beltrán' && Object.values(d.avisos).some(a => a.para === 'jefe' && /Rechazaron tu pedido de carro/.test(a.titulo)); })());
  // Bodega pide un carro para él: no lo puede aprobar ni rechazar.
  await t.page.click('#vehContenido [data-accion="pedircarro"]'); await abiertaVeh();
  await t.page.fill('#vpFecha', masDiasV(hoyV, 10)); await t.page.fill('#vpDestino', 'Barrancas: llevar material'); await t.page.fill('#vpMotivo', 'Entregar el pedido de la cuadrilla');
  await guardarVeh();
  const idBarr = await t.page.evaluate(() => Object.entries(JSON.parse(localStorage.getItem('__fb_datos')).reservas).find(([, r]) => r.destino === 'Barrancas: llevar material')[0]);
  log('el pedido de Bodega sale en «Mis pedidos de carro» con «Cancelar el pedido» y NO en «Carros por aprobar»: nadie decide lo suyo', await hasta(t.page, id => { const x = document.getElementById('vehContenido').textContent, c = document.querySelector(`#vehContenido [data-reserva-card="${id}"]`); return /Carros por aprobar \(0\)/.test(x) && /Mis pedidos de carro \(1\)/.test(x) && !!c && !!c.querySelector('[data-accion="cancelares"]') && !c.querySelector('[data-accion="aprobares"], [data-accion="rechazares"]'); }, idBarr));
  await t.page.click(`#vehContenido [data-accion="cancelares"][data-id="${idBarr}"]`); await abiertaVeh();
  log('Bodega cancela su propio pedido', await guardarVeh() && (await dat()).reservas[idBarr].estado === 'cancelada');
  const idLlanta = Object.entries((await dat()).novedades).find(([, x]) => x.descripcion === LLANTA)[0];
  log('Bodega (nivel Autoriza) también ve «Mantenimientos por hacer» (1: el ABC 123) y puede marcarlos como hechos', await hasta(t.page, () => /Mantenimientos por hacer \(1\)/.test(document.getElementById('vehContenido').textContent) && !!document.querySelector('#vehContenido [data-accion="mttohecho"][data-id="ve-abc123"]')));
  log('Bodega ve las 2 novedades por revisar (el rayón y la llanta)', await hasta(t.page, i => /Novedades por revisar \(2\)/.test(document.getElementById('vehContenido').textContent) && !!document.querySelector(`#vehContenido [data-accion="revisar"][data-id="${i}"]`), idLlanta), await texto(t.page, '#vehContenido'));
  await t.page.click(`#vehContenido [data-accion="revisar"][data-id="${idLlanta}"]`); await abiertaVeh();
  await t.page.fill('#vrCosto', '60000'); await t.page.fill('#vrNota', 'Se infló y se revisó la válvula');
  log('Bodega revisa la novedad con costo y nota, y al Conductor le llega el aviso', await guardarVeh() && await (async () => { const d = await dat(); const n = d.novedades[idLlanta]; return n.revisada && n.costo === 60000 && n.revisadaPor === 'Andrés Beltrán' && /válvula/.test(n.nota) && Object.values(d.avisos).some(a => a.para === 'conductor' && /Revisaron/.test(a.titulo)); })());
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
  log('cambia a Carolina Castillo (Jefe)', await cambiar(t.page, 'jefe'));
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
  // Escáner de seriales: codigos.js se baja al usarlo. La cámara no se prueba aquí: después del primer intento real se reemplaza el lector por uno falso.
  log('codigos.js no se descarga al abrir la app, solo al tocar Escanear', await t.page.evaluate(() => !window.Codigos && !document.querySelector('script[src^="codigos.js"]')));
  await t.page.click('#eqSecciones [data-sec="equipos"]'); await t.page.waitForSelector('#qEq');
  await t.page.screenshot({ path: path.join(CAPTURAS, '14-equipos-escanear.png') });
  await t.page.click('#eqContenido [data-accion="escanear"]');
  log('al tocar Escanear junto al buscador se baja codigos.js y se abre el lector', await hasta(t.page, () => !!window.Codigos && !!document.querySelector('.cod')));
  await t.page.click('.cod [data-a="cancelar"]');
  log('Cancelar en el lector no cambia nada', await hasta(t.page, () => !document.querySelector('.cod') && document.getElementById('shEq').hidden && document.getElementById('qEq').value === ''));
  log('el lector de códigos se prepara con los archivos de lib/codigos, sin pedir nada a internet', await t.page.evaluate(async () => { try { await window.Codigos.cargar(); const r = performance.getEntriesByType('resource').map(x => x.name); return r.some(n => /lib\/codigos\/zxing_reader\.wasm/.test(n)) && !r.some(n => /jsdelivr/.test(n)); } catch (e) { return String(e); } }));
  const fingir = serial => t.page.evaluate(s => { window.Codigos.leer = async () => s; }, serial);
  const tocarEscaneo = sel => t.page.click(sel + ' [data-accion="escanear"]');
  await fingir('demo-0003'); await tocarEscaneo('#eqContenido');
  log('un serial que existe (aunque venga en minúscula) abre la hoja de vida de ese equipo', await hasta(t.page, () => !document.getElementById('shEq').hidden && /DEMO-0003/.test(document.getElementById('eqT').textContent)));
  await t.page.click('#eqCerrar'); await hasta(t.page, () => document.getElementById('shEq').hidden);
  await fingir('XYZ-999'); await tocarEscaneo('#eqContenido');
  log('un serial que no existe lo dice y lo deja escrito en el buscador', await hasta(t.page, () => /No hay un equipo con el serial XYZ-999/.test(document.getElementById('toast').textContent) && document.getElementById('qEq').value === 'XYZ-999' && /0 de \d+ equipos/.test(document.getElementById('eqContenido').textContent)));
  await t.page.fill('#qEq', '');
  await t.page.click('#btnEntregar'); await abiertaEq(); await esp(100);
  await fingir('demo-0007'); await tocarEscaneo('#eqCampos');
  log('en la entrega, escanear un equipo de bodega lo marca y abre sus observaciones', await hasta(t.page, () => document.getElementById('ehEq_eq-007').checked && !document.querySelector('[data-fila="eq-007"] .eq-acta-det').hidden && /Marcado: DEMO-0007/.test(document.getElementById('toast').textContent)));
  await esp(300); await t.page.screenshot({ path: path.join(CAPTURAS, '14b-entrega-escanear.png') });
  await fingir('DEMO-0001'); await tocarEscaneo('#eqCampos');
  log('en la entrega, escanear un equipo que ya tiene alguien dice quién lo tiene y no lo marca', await hasta(t.page, () => /DEMO-0001 no se puede entregar: lo tiene Jorge Ibarra/.test(document.getElementById('toast').textContent)) && !(await t.page.$('#ehEq_eq-001')));
  await fingir('NOEXISTE1'); await tocarEscaneo('#eqCampos');
  log('en la entrega, un serial que no existe solo avisa', await hasta(t.page, () => /No hay un equipo con el serial NOEXISTE1/.test(document.getElementById('toast').textContent)));
  await t.page.click('#eqCerrar'); await t.page.click('#cfSi'); await hasta(t.page, () => document.getElementById('shEq').hidden);
  await t.page.click('#btnDevolver'); await abiertaEq(); await esp(100);
  await t.page.selectOption('#ehQuien', '1020304050');
  await fingir('DEMO-0004'); await tocarEscaneo('#eqCampos');
  log('en la devolución, escanear el equipo de otra persona cambia la lista a su nombre y lo marca', await hasta(t.page, () => document.getElementById('ehQuien').value !== '1020304050' && /Liliana Torres/.test(document.getElementById('ehQuien').selectedOptions[0].textContent) && !!document.getElementById('ehEqD_eq-004') && document.getElementById('ehEqD_eq-004').checked && /Es de Liliana Torres/.test(document.getElementById('toast').textContent)));
  await t.page.click('#eqCerrar'); await t.page.click('#cfSi'); await hasta(t.page, () => document.getElementById('shEq').hidden);
  await t.page.click('#eqSecciones [data-sec="hacer"]');
  // «¿Salir sin guardar?» en la hoja de actas
  const salirPreguntaEq = () => hasta(t.page, () => !document.getElementById('shConfirmar').hidden && /Salir sin guardar/.test(document.getElementById('cfSi').textContent));
  await t.page.click('#btnEntregar'); await abiertaEq(); await esp(100);
  await t.page.click('#eqCerrar');
  log('sin escribir nada, Cancelar cierra el acta sin preguntar', await hasta(t.page, () => document.getElementById('shEq').hidden && document.getElementById('shConfirmar').hidden));
  await t.page.click('#btnEntregar'); await abiertaEq(); await esp(100);
  await t.page.fill('#ehPersona', 'Persona Borrador');
  await t.page.click('#eqCerrar');
  log('con el nombre escrito, Cancelar pregunta «¿Salir sin guardar?» y el acta sigue abierta', await salirPreguntaEq() && !(await t.page.evaluate(() => document.getElementById('shEq').hidden)));
  await esp(500); await t.page.screenshot({ path: path.join(CAPTURAS, '13b-salir-sin-guardar.png') });
  await t.page.click('#cfNo');
  log('si dice Cancelar, el acta conserva lo escrito', await hasta(t.page, () => document.getElementById('shConfirmar').hidden && !document.getElementById('shEq').hidden && document.getElementById('ehPersona').value === 'Persona Borrador'));
  await t.page.keyboard.press('Escape');
  log('Escape también pregunta en el acta', await salirPreguntaEq());
  await t.page.click('#cfSi');
  log('«Salir sin guardar» cierra el acta', await hasta(t.page, () => document.getElementById('shEq').hidden && document.getElementById('shConfirmar').hidden));
  await t.page.click('#btnEntregar'); await abiertaEq(); await esp(100);
  await firmar('#ehFirmaP');
  await t.page.click('#eqCerrar');
  log('solo con la firma dibujada también pregunta antes de cerrar', await salirPreguntaEq());
  await t.page.click('#cfSi');
  await hasta(t.page, () => document.getElementById('shEq').hidden);
  await t.page.click('#eqContenido [data-accion="ver"]'); await abiertaEq(); await esp(100);
  await t.page.click('#eqCerrar');
  log('la hoja de vida de un equipo (solo ver) se cierra sin preguntar', await hasta(t.page, () => document.getElementById('shEq').hidden && document.getElementById('shConfirmar').hidden));
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
  log('Valentina marca bien el acta', await guardarEq() && await hasta(t.page, () => { const h = JSON.parse(localStorage.getItem('__fb_datos')).hojas.ac4; return h.revision === 'ok' && h.revisadaPor === 'Ángel Ortiz'; }));
  const idRosa = Object.entries((await dat()).hojas).find(([, x]) => x.persona === 'Rosa Prueba Gómez')[0];
  await t.page.click(`#eqContenido [data-accion="revisar"][data-id="${idRosa}"]`); await abiertaEq();
  await t.page.locator('input[name="ehRev"][value="problema"]').check({ force: true });
  await t.page.click('#eqPrimario');
  log('si tiene un problema, pide decir qué está mal', await errEq(/qué está mal/));
  await t.page.fill('#ehNotaRev', 'Falta el cargo completo');
  log('el acta queda con problema y al Encargado le llega el aviso', await guardarEq() && await hasta(t.page, i => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.hojas[i].revision === 'problema' && /cargo/.test(d.hojas[i].notaRevision) && Object.values(d.avisos).some(a => a.para === 'equipos' && /problema/.test(a.titulo)); }, idRosa));
  await t.page.click('#eqContenido [data-accion="programar"]'); await abiertaEq();
  await t.page.selectOption('#ehEq', 'eq-009'); await t.page.selectOption('#ehTipo', 'backup'); await t.page.fill('#ehNota', 'Revisar que las copias abran');
  log('Valentina le programa un backup al Encargado', await guardarEq() && await hasta(t.page, () => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).tareasEq).some(x => x.equipoId === 'eq-009' && x.tipo === 'backup' && x.pidio === 'Ángel Ortiz' && x.estado === 'pendiente')));
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

  log('cambia de nuevo a Fredy Torres', await cambiar(t.page, 'compras'));
  await t.page.reload();
  log('al recargar sigue con Luis, y la campana trae los 4 avisos nuevos (llanta, taladro, la cafetera del Gerente general y «Llegó tu compra»)', await hasta(t.page, () => document.getElementById('avatarTop').classList.contains('av-compras') && document.getElementById('badgeAvisos').textContent === '4', null, 8000), await texto(t.page, '#badgeAvisos'));

  console.log('4f. Coordinadora de compras, Gerente general y los demás Gerentes');
  const cambiarCorreo = async (correo, rol) => { await t.page.click('#btnPersona'); await t.page.waitForSelector('#shPersona:not([hidden])'); await t.page.evaluate(() => document.querySelectorAll('#personaLista details.grupo-personas').forEach(d => { d.open = true; })); await t.page.click(`#personaLista [data-correo="${correo}"]`); return hasta(t.page, r => document.getElementById('avatarTop').classList.contains('av-' + r) && document.getElementById('shPersona').hidden, rol); };
  log('cambia a Santiago Valencia (Gerente, pero no general)', await cambiarCorreo('gerente.santiago.valencia@example.com', 'gerente'));
  await t.page.click('.tab[data-vista="inventario"]');
  log('el Gerente que no es general solo ve: sin «Te toca a ti», sin botón de monto y con el aviso de quién autoriza', await hasta(t.page, () => { const x = document.getElementById('invContenido').textContent; return /Solo ves/.test(x) && /Coordinadora de compras/.test(x) && /Gerente general/.test(x) && !/Te toca a ti/.test(x) && !document.querySelector('#invContenido [data-accion="autorizar"], #invContenido [data-accion="monto"]'); }), await texto(t.page, '#invContenido'));
  log('para él el botón dice «Pedir una compra» (no «Hacer»: su compra no nace autorizada)', (await texto(t.page, '#btnPedirCompraTxt')) === 'Pedir una compra');
  await t.page.click('#invSecciones [data-sec="compras"]');
  await abrirHojaInv('#invContenido [data-accion="vercompra"][data-id="co-001"]');
  log('en el detalle de una compra por autorizar no puede autorizar ni rechazar', await t.page.evaluate(() => !document.querySelector('#acCampos [data-accion="autorizar"], #acCampos [data-accion="rechazar"]')));
  await t.page.keyboard.press('Escape');
  await abrirHojaInv('#btnPedirCompra');
  await t.page.fill('#acQue', 'Sillas para la sala de juntas'); await t.page.fill('#acCant', '4'); await t.page.fill('#acValor', '1600000'); await t.page.fill('#acPara', 'Para la sala de juntas');
  await enviarHoja();
  const cs = await (async () => { await hasta(t.page, () => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).compras).some(c => c.que === 'Sillas para la sala de juntas')); return compraPor(c => c.que === 'Sillas para la sala de juntas'); })();
  log('la compra de un Gerente que no es general nace «pedido» y avisa a la Coordinadora', cs.estado === 'pedido' && cs.pideRol === 'gerente' && cs.autoriza === '' && Object.values((await dI()).avisos).some(a => a.para === 'coordcompras' && /Sillas para la sala/.test(a.texto)));

  log('cambia a Mauricio Giraldo (Coordinador de compras)', await cambiar(t.page, 'coordcompras'));
  await t.page.click('.tab[data-vista="inventario"]'); await t.page.click('#invSecciones [data-sec="hacer"]');
  log('la Coordinadora tiene los botones de autorizar y de marcar revisada la compra sin autorización, y no puede comprar ni recibir', await hasta(t.page, id => !!document.querySelector(`#invContenido [data-accion="autorizar"][data-id="${id}"]`) && !!document.querySelector('#invContenido [data-accion="revisada"]') && !document.querySelector('#invContenido [data-accion="comprar"], #invContenido [data-accion="recibir"]'), cs.id));
  await t.page.click('#invContenido [data-accion="revisada"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await t.page.fill('#acNota', 'Fue una urgencia'); await t.page.click('#acPrimario');
  log('la Coordinadora marca revisada la compra sin autorización y queda en su historial', await hasta(t.page, () => { const c = JSON.parse(localStorage.getItem('__fb_datos')).compras['co-008']; return c.revisada === true && c.historial.some(h => /Fue una urgencia/.test(h.texto)); }));
  await abrirHojaInv('#btnPedirCompra');
  log('al pedir, la Coordinadora lee que su compra la autoriza el Gerente general', /Gerente general/.test(await texto(t.page, '#acSub')));
  await t.page.fill('#acQue', 'Escritorio para compras'); await t.page.fill('#acCant', '1'); await t.page.fill('#acValor', '700000'); await t.page.fill('#acPara', 'Para el equipo de compras');
  await enviarHoja();
  const cc = await (async () => { await hasta(t.page, () => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).compras).some(c => c.que === 'Escritorio para compras')); return compraPor(c => c.que === 'Escritorio para compras'); })();
  log('lo que pide la Coordinadora queda «pedido» y avisa al Gerente general (no a ella)', cc.estado === 'pedido' && cc.pideRol === 'coordcompras' && Object.values((await dI()).avisos).some(a => a.para === 'gerente' && /Escritorio para compras/.test(a.texto)) && !Object.values((await dI()).avisos).some(a => a.para === 'coordcompras' && /Escritorio para compras/.test(a.texto)));
  await t.page.click('#invSecciones [data-sec="hacer"]');
  log('ella no puede autorizar lo suyo (le toca al Gerente general)', await hasta(t.page, id => !!document.querySelector(`#invContenido .tarea [data-id="${id}"], #invContenido [data-id="${id}"]`) || /Escritorio para compras/.test(document.getElementById('invContenido').textContent), cc.id) && await t.page.evaluate(id => !document.querySelector(`#invContenido [data-accion="autorizar"][data-id="${id}"]`), cc.id));
  await abrirHojaInv(`#invContenido [data-accion="autorizar"][data-id="${cs.id}"]`);
  await enviarHoja();
  log('la Coordinadora autoriza la compra de Santiago (1.600.000, menos de 5 millones): queda «autorizado» directo', await hasta(t.page, id => { const c = JSON.parse(localStorage.getItem('__fb_datos')).compras[id]; return c.estado === 'autorizado' && c.autoriza === 'Mauricio Giraldo' && c.autorizaJefe === 'Mauricio Giraldo'; }, cs.id));

  log('cambia a Oscar Muñoz (Gerente general)', await cambiar(t.page, 'gerente'));
  await t.page.click('.tab[data-vista="inventario"]'); await t.page.click('#invSecciones [data-sec="resumen"]');
  log('al Gerente general le toca lo que pidió la Coordinadora (y solo eso)', await hasta(t.page, id => /Te toca a ti \(1\)/.test(document.getElementById('invContenido').textContent) && document.querySelectorAll('#invContenido [data-accion="autorizar"]').length === 1 && !!document.querySelector(`#invContenido [data-accion="autorizar"][data-id="${id}"]`), cc.id));
  await t.page.click('#invSecciones [data-sec="compras"]');
  await abrirHojaInv('#invContenido [data-accion="vercompra"][data-id="co-001"]');
  log('pero él puede decidir cualquier pedido sin esperar (aquí unas botas): el botón está en el detalle', await t.page.evaluate(() => !!document.querySelector('#acCampos [data-accion="autorizar"]') && !!document.querySelector('#acCampos [data-accion="rechazar"]')));
  await t.page.click('#acCampos [data-accion="autorizar"]');
  await t.page.waitForSelector('#shAccion:not([hidden])'); await enviarHoja();
  log('el Gerente general autoriza las botas directo: queda «autorizado» sin pasar por la Coordinadora', await hasta(t.page, () => { const c = JSON.parse(localStorage.getItem('__fb_datos')).compras['co-001']; return c.estado === 'autorizado' && c.autoriza === 'Oscar Muñoz' && !c.autorizaJefe && c.historial.some(h => h.texto === 'El Gerente general autorizó la compra'); }));

  console.log('5. Reiniciar los datos (solo Jefe)');
  await t.page.click('#btnPersona'); await t.page.waitForSelector('#shPersona:not([hidden])');
  log('Luis no ve el botón de reiniciar', await t.page.locator('#ajustesJefe').isHidden());
  await t.page.evaluate(() => document.querySelectorAll('#personaLista details.grupo-personas').forEach(d => { d.open = true; }));
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

  log('cambia a Oscar Muñoz (Gerente de prueba)', await cambiar(t.page, 'gerente'));
  await t.page.click('#btnPersona'); await t.page.waitForSelector('#shPersona:not([hidden])');
  log('el Gerente de prueba NO tiene «Personas y permisos» (su clave es pública)', !(await visible(t.page, '#ajustesGente')));
  await t.page.keyboard.press('Escape');
  log('cambia a Carolina Castillo (Jefe de prueba)', await cambiar(t.page, 'jefe'));
  await t.page.click('#btnPersona'); await t.page.waitForSelector('#shPersona:not([hidden])');
  log('la Jefe de prueba tampoco tiene «Personas y permisos» (su clave es pública)', !(await visible(t.page, '#ajustesGente')));
  await t.page.keyboard.press('Escape');
  // Jeiler crea a mano en Firebase el primer código de Jefe (así lo haría en la consola).
  await t.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')); d.codigosDireccion = { 'JEF-PRUE-BA23': { rol: 'jefe', activo: true, por: 'consola', en: new Date().toISOString() }, 'GER-PRUE-BA23': { rol: 'gerente', activo: true, por: 'consola', en: new Date().toISOString() } }; localStorage.setItem('__fb_datos', JSON.stringify(d)); });
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
  log('el panel «Personas y permisos» no se descarga hasta que la Jefe lo abre', await t.page.evaluate(() => !window.Gente && ![...document.scripts].some(s => /gente\.js/.test(s.src))));
  log('la Jefe abre «Personas y permisos»', await abrirPanel());
  log('al abrirlo se descarga una sola vez y queda listo', await t.page.evaluate(() => !!window.Gente && [...document.scripts].filter(s => /gente\.js/.test(s.src)).length === 1));
  log('el panel trae el Excel, las personas, los códigos y la seguridad', await t.page.evaluate(() => { const x = document.getElementById('genteCuerpo').textContent; return /Descargar plantilla/.test(x) && /Subir Excel/.test(x) && /Personas registradas/.test(x) && /Códigos por rol/.test(x) && /Personas de prueba: encendidas/.test(x); }));

  // --- Excel: plantilla y subida con filas buenas y malas ---
  let plantillaBajada = '';
  const [descPlantilla] = await Promise.all([t.page.waitForEvent('download', { timeout: 15000 }).catch(() => null), t.page.click('#genteCuerpo [data-g="plantilla"]')]);
  log('descPlantilla la plantilla de Excel con personas inventadas', !!descPlantilla && descPlantilla.suggestedFilename() === 'Plantilla personas.xlsx', descPlantilla && descPlantilla.suggestedFilename());
  if (descPlantilla) {
    const ruta = path.join(CAPTURAS, 'plantilla-descPlantillada.xlsx'); await descPlantilla.saveAs(ruta); const hs = await excelInfo(ruta), p = hs.find(h => h.nombre === 'Personas');
    log('la plantilla trae las hojas Personas, Ayuda, Roles y una de listas oculta', ['Personas', 'Ayuda', 'Roles', 'Listas'].every(n => hs.some(h => h.nombre === n)) && hs.find(h => h.nombre === 'Listas').oculta && !p.oculta, JSON.stringify(hs.map(h => h.nombre)));
    log('la hoja Personas tiene título en negrilla, columnas en negrilla con color y cuadros, y la primera fila fija', !!p && bienFormado(p) && p.titulo === 'Plantilla de personas' && p.titulos.join() === 'Nombre,Correo,Rol,Equipos,Inventario,Vehículos,Reuniones,Permisos extra,Estado', JSON.stringify(p && p.titulos));
    log('trae a la Jefe que ya está (Ya registrada) y 2 filas de ejemplo, y debajo filas vacías con cuadros', !!p && p.filas.some(f => /jefa\.real@ejemplo\.test/.test(f[1]) && f[8] === 'Ya registrada') && p.filas.filter(f => /^Ejemplo/.test(f[8])).length === 2 && p.filas.filter(f => f.every(x => x === '')).length >= 10);
    log('Rol, Equipos, Inventario, Vehículos, Reuniones y Permisos extra tienen lista desplegable', await t.page.evaluate(async b64 => { const E = await window.Excel.cargar(), wb = new E.Workbook(); await wb.xlsx.load(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer); const ws = wb.getWorksheet('Personas'), fila = ws.rowCount; return [3, 4, 5, 6, 7, 8].every(c => { const v = ws.getCell(fila, c).dataValidation; return v && v.type === 'list'; }) && !ws.getCell(fila, 1).dataValidation; }, fs.readFileSync(ruta).toString('base64')));
    plantillaBajada = ruta;
  }
  const rutaXlsx = path.join(CAPTURAS, 'personas-de-prueba.xlsx');
  await xlsxCrear([
    { Nombre: ' Gina   Gerente ', 'Correo electrónico': 'GINA.Gerente@ejemplo.test', Cargo: 'Profesional' },
    { Nombre: 'Gerardo Dirección', Correo: 'gerardo.direccion@ejemplo.test', Rol: 'Gerente' },
    { Nombre: 'Bruno Bodega', Correo: 'bruno.bodega@ejemplo.test', Rol: 'Bodeguero', Equipos: 'Solo ver' },
    { Nombre: 'Nora Admin', Correo: 'nora.admin@ejemplo.test', Rol: 'Administrativa', Extras: 'encargada' },
    { Nombre: 'Mario Prueba', Correo: 'mario.prueba@ejemplo.test', Rol: 'Logística' },
    { Nombre: 'Mario Repetido', Correo: 'mario.prueba@ejemplo.test', Rol: 'Logística' },
    { Nombre: 'Rol Malo', Correo: 'rol.malo@ejemplo.test', Rol: 'Presidente' },
    { Nombre: '=1+1', Correo: 'formula@ejemplo.test', Rol: 'Conductor' }
  ], rutaXlsx);
  await t.page.setInputFiles('#genteArchivo', rutaXlsx);
  log('al subir el Excel muestra lo que entendió: 4 listas y 4 con problema', await hasta(t.page, () => /4 listas para guardar/.test(document.getElementById('genteCuerpo').textContent) && /4 con problema/.test(document.getElementById('genteCuerpo').textContent)), await texto(t.page, '#genteCuerpo'));
  log('marca el correo repetido, el rol que no entiende y el nombre con fórmula', await t.page.evaluate(() => { const x = document.getElementById('genteCuerpo').textContent; return /repetido en el Excel/.test(x) && /No entendí el rol «Presidente»/.test(x) && /no puede empezar con/.test(x) && /Los Gerentes y las Jefes se crean desde la consola de Firebase/.test(x); }));
  log('todavía no guardó nada', !Object.keys((await fb()).invitaciones || {}).length);
  await t.page.screenshot({ path: path.join(CAPTURAS, '07-panel-excel.png'), fullPage: true });
  await t.page.click('#genteCuerpo [data-g="guardarinv"]');
  log('«Guardar» deja 4 invitaciones, una por correo en minúscula', await hasta(t.page, () => Object.keys(JSON.parse(localStorage.getItem('__fb_datos')).invitaciones || {}).sort().join() === 'bruno.bodega@ejemplo.test,gina.gerente@ejemplo.test,mario.prueba@ejemplo.test,nora.admin@ejemplo.test'));
  const inv = (await fb()).invitaciones;
  log('la invitación de Bruno lleva su rol, el permiso «Equipos: solo ver» y el nombre limpio', inv['bruno.bodega@ejemplo.test'].rol === 'asistente' && inv['bruno.bodega@ejemplo.test'].permisos.equipos === 'ver' && inv['gina.gerente@ejemplo.test'].nombre === 'Gina Gerente' && inv['gina.gerente@ejemplo.test'].rol === 'profesional', JSON.stringify(inv['bruno.bodega@ejemplo.test']));
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

  // --- Gerardo: Gerente con un código que se puso a mano en la consola. Mario: Logística ---
  await crearCuenta('gerardo.direccion@ejemplo.test', 'clave-gerardo-12345', { nombre: 'Gerardo Dirección', codigo: 'GER-PRUE-BA23' }); await pideConfirmar(); await confirmar('gerardo.direccion@ejemplo.test');
  log('Gerardo entra como Gerente con el código de la consola, y el código se gastó', await enApp('Gerente') && !((await fb()).codigosDireccion || {})['GER-PRUE-BA23']);
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
  const uidBruno = pBruno.id, uidMario = (await perfilDe('mario.prueba@ejemplo.test')).id, uidGerardo = (await perfilDe('gerardo.direccion@ejemplo.test')).id;
  log('la Jefe ve a las personas registradas', await hasta(t.page, () => /Bruno Bodega/.test(document.getElementById('genteCuerpo').textContent) && /Mario Prueba/.test(document.getElementById('genteCuerpo').textContent) && /Nora Admin/.test(document.getElementById('genteCuerpo').textContent)));
  log('al Gerente no se le cambia nada desde la app', await t.page.evaluate(i => !document.querySelector(`#genteCuerpo [data-g="rol"][data-id="${i}"]`) && !document.querySelector(`#genteCuerpo [data-g="pausar"][data-id="${i}"]`) && !document.querySelector(`#genteCuerpo [data-g="permiso"][data-id="${i}"]`), uidGerardo));
  log('cada persona (no Gerente) trae un nivel para cada módulo', await t.page.evaluate(i => ['equipos', 'inventario', 'vehiculos', 'reuniones'].every(m => !!document.getElementById(`pm-${i}-${m}`)), uidBruno));
  await t.page.selectOption(`#pm-${uidBruno}-inventario`, 'ver');
  log('la Jefe le pone a Bruno «Inventario: solo ver» y queda guardado junto al de Equipos', await hasta(t.page, i => { const p = JSON.parse(localStorage.getItem('__fb_datos')).usuarios[i].permisos; return p && p.inventario === 'ver' && p.equipos === 'ver'; }, uidBruno));
  await t.page.waitForTimeout(250);   // el panel termina de guardar el cambio anterior antes de aceptar otro
  await t.page.selectOption(`#pm-${uidBruno}-equipos`, '');
  log('«Como su rol» le quita el permiso de Equipos y deja el otro', await hasta(t.page, i => { const p = JSON.parse(localStorage.getItem('__fb_datos')).usuarios[i].permisos; return p && p.inventario === 'ver' && !('equipos' in p); }, uidBruno));
  await t.page.waitForTimeout(250);   // el panel termina de guardar el cambio anterior antes de aceptar otro
  await t.page.selectOption(`#pm-${uidBruno}-inventario`, '');
  log('la Jefe le devuelve a Bruno «Inventario: como su rol» (Bodega)', await hasta(t.page, i => Object.keys(JSON.parse(localStorage.getItem('__fb_datos')).usuarios[i].permisos || {}).length === 0, uidBruno));
  const uidNora = (await perfilDe('nora.admin@ejemplo.test')).id;
  await t.page.waitForTimeout(250);   // el panel termina de guardar el cambio anterior antes de aceptar otro
  await t.page.selectOption(`#pm-${uidNora}-inventario`, 'ver');
  log('y a Nora le pone «Inventario: solo ver»', await hasta(t.page, i => (JSON.parse(localStorage.getItem('__fb_datos')).usuarios[i].permisos || {}).inventario === 'ver', uidNora));
  await t.page.waitForTimeout(250);   // el panel termina de guardar el cambio anterior antes de aceptar otro
  await t.page.locator(`#genteCuerpo input[data-g="extra"][data-id="${uidBruno}"][data-x="compra"]`).check({ force: true });
  log('también le marca «También hace y recibe compras»', await hasta(t.page, i => JSON.stringify(JSON.parse(localStorage.getItem('__fb_datos')).usuarios[i].extras) === '["compra"]', uidBruno));
  await t.page.screenshot({ path: path.join(CAPTURAS, '07b-permisos-por-persona.png'), fullPage: true });
  await t.page.click(`#genteCuerpo [data-g="pausar"][data-id="${uidMario}"]`); await t.page.click('#cfSi');
  log('la Jefe pausa el acceso de Mario', await hasta(t.page, i => JSON.parse(localStorage.getItem('__fb_datos')).usuarios[i].activo === false, uidMario));
  // --- La misma plantilla, con una persona nueva agregada, se vuelve a subir: solo se guarda lo nuevo ---
  const rutaIda = path.join(CAPTURAS, 'plantilla-con-nueva.xlsx');
  fs.writeFileSync(rutaIda, Buffer.from(await t.page.evaluate(async b64 => {
    const E = await window.Excel.cargar(), wb = new E.Workbook(); await wb.xlsx.load(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer);
    const ws = wb.getWorksheet('Personas'); let fila = 5; while (ws.getCell(fila, 1).value) fila++;
    [['Nueva Persona Plantilla', 'nueva.plantilla@ejemplo.test', 'Logística', '', '', '', '', '', ''], ['Fila Con Error', 'sin-arroba', 'Presidente', '', '', '', '', '', '']].forEach((v, k) => v.forEach((x, c) => { ws.getCell(fila + k, c + 1).value = x; }));
    const buf = await wb.xlsx.writeBuffer(); let s = ''; new Uint8Array(buf).forEach(c => { s += String.fromCharCode(c); }); return btoa(s);
  }, fs.readFileSync(plantillaBajada).toString('base64')), 'base64'));
  await t.page.setInputFiles('#genteArchivo', rutaIda);
  log('al subir la plantilla con una persona nueva: 1 lista, 1 con problema, y lo que ya estaba y los ejemplos se omiten', await hasta(t.page, () => { const x = document.getElementById('genteCuerpo').textContent; return /1 lista para guardar/.test(x) && /1 con problema/.test(x) && /ya estaba(n)? en la app \(no se tocan\)/.test(x) && /2 filas de ejemplo \(se ignoran\)/.test(x); }), await texto(t.page, '#genteCuerpo'));
  log('las filas ya registradas no salen como error ni como lista nueva', await t.page.evaluate(() => !/Esa persona ya tiene cuenta/.test(document.getElementById('genteCuerpo').textContent) && !/Jefa Real/.test(document.querySelector('#genteCuerpo .persona-reg.pausada, #genteCuerpo .persona-reg') ? [...document.querySelectorAll('#genteCuerpo .persona-reg')].filter(c => /Fila \d+/.test(c.textContent)).map(c => c.textContent).join(' ') : '')));
  await t.page.click('#genteCuerpo [data-g="guardarinv"]');
  log('«Guardar» deja solo la invitación nueva', await hasta(t.page, () => { const i = JSON.parse(localStorage.getItem('__fb_datos')).invitaciones || {}; return !!i['nueva.plantilla@ejemplo.test'] && i['nueva.plantilla@ejemplo.test'].rol === 'logistica' && !i['jefa.real@ejemplo.test'] && !i['persona.uno@example.com']; }));
  await t.page.setInputFiles('#genteArchivo', rutaIda);
  log('si sube la misma plantilla otra vez, la invitación que ya estaba tampoco se repite', await hasta(t.page, () => /0 listas para guardar/.test(document.getElementById('genteCuerpo').textContent) && /ya estaba(n)? en la app/.test(document.getElementById('genteCuerpo').textContent)));
  await t.page.click('#genteCuerpo [data-g="descartar"]');
  await t.page.evaluate(() => { document.getElementById('genteCodigos').open = true; });
  await t.page.click('#genteCuerpo [data-g="crear"][data-rol="logistica"]');
  const codLog = await (async () => (await hasta(t.page, () => !!document.querySelector('#genteCuerpo [data-g="copiar"][data-id^="LOG-"]'))) ? t.page.evaluate(() => document.querySelector('#genteCuerpo [data-g="copiar"][data-id^="LOG-"]').dataset.id) : '')();
  log('la Jefe crea el código de Logística (LOG-XXXX-XXXX)', /^LOG-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(codLog), codLog);
  log('la Jefe no ve cómo crear códigos de Jefe ni de Gerente (esos se crean en la consola)', await t.page.evaluate(() => !document.querySelector('#genteCuerpo [data-g="crear"][data-rol="jefe"], #genteCuerpo [data-g="crear"][data-rol="gerente"], #genteCuerpo [data-g="cambiar"][data-rol="jefe"], #genteCuerpo [data-g="cambiar"][data-rol="gerente"]')));
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
  log('vuelve a entrar como Carolina Castillo (Jefe de prueba)', await entrar(t.page, 'jefe'));

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
  const nProf = await t.page.evaluate(() => window.DEMO.PERSONAS.filter(p => p.rol === 'profesional').length);
  log('la Jefe ve a quiénes invita (todos los profesionales marcados) y crea la reunión: 5 tareas más una de asistencia por profesional, con su aviso', await t.page.evaluate(n => document.querySelectorAll('#rcInvitados input[type="checkbox"]:checked').length === n, nProf) && await guardarReu() && await (async () => { const o = await oriente(); const d = await reu(); return o && o.r.faltan.includes('lugar') && o.ns.length === 5 + nProf && o.ns.filter(n => n.tipo === 'asistencia').every(n => /^profesional\..*@example\.com$/.test(n.responsableCorreo) && n.responsableNombre) && ['compras', 'carros', 'logistica', 'profesional', 'administrativo'].every(rol => Object.values(d.avisos).some(a => a.para === rol && /Reunión nueva/.test(a.titulo))); })());
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
  log('cambia a Carolina Castillo (Jefe)', await cambiar(t.page, 'jefe'));
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
  log('la Jefe autoriza los carros: un viaje por camioneta (Carlos en el ABC 123, Rafael en el JKL 012) y le llega el aviso', await guardarReu() && await (async () => { o = await oriente(); const d = await reu(); const c = o.ns.find(n => n.tipo === 'carros'), v = viajeDe('Oscar Farfán'), w = viajeDe('Rafael Ospino'); return c.estado === 'autorizado' && c.vehiculos.length === 2 && v && v.placa === 'ABC 123' && v.vehiculoId === 've-abc123' && v.carrosId === c.id && v.estado === 'pendiente' && w && w.placa === 'JKL 012' && Object.values(d.avisos).some(a => a.para === 'conductor' && /viaje/.test(a.titulo)); })());
  log('cambia a Carlos (Conductor)', await cambiar(t.page, 'conductor'));
  await irReu('hacer');
  const viajeCarlos = viajeDe('Oscar Farfán').id;
  await tocarReu('nopuedo', viajeCarlos); await t.page.fill('#rcMotivo', 'Tengo una cita médica');
  log('el Conductor no puede: los carros vuelven a la Jefe con el motivo', await guardarReu() && await (async () => { o = await oriente(); const c = o.ns.find(n => n.tipo === 'carros'); return c.estado === 'pendiente' && /cita/.test(c.motivo) && o.ns.find(n => n.id === viajeCarlos).estado === 'no-va'; })());
  log('cambia a Carolina Castillo otra vez', await cambiar(t.page, 'jefe'));
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
  const suya = () => o.ns.find(n => n.tipo === 'asistencia' && n.responsableNombre === 'Margaret Pulido');
  log('el Profesional solo ve SUS tareas de asistencia (la de ayer y la nueva), no las de los demás', await hasta(t.page, () => document.querySelectorAll('#reuContenido [data-accion="voy"]').length === 2));
  await tocarReu('voy', suya().id);
  log('el Profesional confirma que va (solo cambia la suya)', await guardarReu() && await (async () => { o = await oriente(); return suya().estado === 'listo' && o.ns.filter(n => n.tipo === 'asistencia' && n.estado === 'pendiente').length === nProf - 1; })());
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
  log('cambia a Carolina Castillo (Jefe)', await cambiar(t.page, 'jefe'));
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
  // Clave de Gemini mala: el agente lo dice («clave») y la app no pierde minutos reintentando: respaldo en seguida con el motivo real.
  let llamadasClave = 0;
  await t.ctx.route('https://agente-clave.prueba/', r => { llamadasClave++; return r.fulfill({ status: 502, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, error: 'clave', detalle: 'gemini-3.1-flash-lite: Gemini respondió 400: API key not valid. Please pass a valid API key.' }) }); });
  await t.page.evaluate(() => { window.AGENTE_DEMO = { url: 'https://agente-clave.prueba/' }; });
  await tocarReu('correo', 'cancela');
  log('si la clave de Gemini no sirve, no reintenta: usa el respaldo en seguida y dice el motivo real', await hasta(t.page, () => /Respuesta de respaldo: el agente respondió 502: .*API key not valid/.test(document.getElementById('reCampos').textContent), null, 8000) && llamadasClave === 1, String(llamadasClave));
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
  log('si Gemini está saturado (503), espera y vuelve a intentar solo, diciendo en qué va', await hasta(t.page, () => /Gemini no respondió \(intento 1\): el agente respondió 502: Gemini respondió 503\. Vuelvo a intentar en \d+ s/.test(document.getElementById('reCampos').textContent), null, 8000));
  log('con el agente, el correo arma la reunión: 50 personas, refrigerio y 2 camionetas (al segundo intento)', llamadasAgente2 >= 1 && await hasta(t.page, () => !!document.getElementById('rcCom') && document.getElementById('rcCom').value === 'Comunidad Ejemplo Este' && document.getElementById('rcAsis').value === '50' && document.getElementById('rcCarros').value === '2' && document.getElementById('rcRef').checked, null, 15000) && llamadasAgente2 === 2);
  log('la Jefe la crea, se reparten las tareas y el correo queda «Repartido»', await guardarReu() && await (async () => { const d = await reu(); const r = Object.values(d.reuniones).find(x => x.comunidad === 'Comunidad Ejemplo Este'); return !!r && r.correos.includes('gm-gm18c3') && Object.values(d.necesidades).filter(n => n.comunidad === 'Comunidad Ejemplo Este').length === 4 + nProf; })() && await hasta(t.page, () => /Repartido/.test(document.getElementById('reuContenido').textContent) && !document.querySelector('#reuContenido [data-accion="buzon"]')));
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
  log('vuelve a Carolina Castillo (Jefe)', await cambiar(t.page, 'jefe'));

  console.log('6a. Bases de datos en Excel de Equipos, Carros, Reuniones y Compras');
  await cambiar(t.page, 'jefe');
  const xlsxHoja = (hoja, filas, ruta) => t.page.evaluate(async ([h, f]) => { const X = await window.Inventario.cargarXlsx(), l = X.utils.book_new(); X.utils.book_append_sheet(l, X.utils.json_to_sheet(f), h); return X.write(l, { type: 'base64', bookType: 'xlsx' }); }, [hoja, filas]).then(b => fs.writeFileSync(ruta, Buffer.from(b, 'base64')));
  const dBD = () => t.page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos')));
  const texto6 = sel => texto(t.page, sel);
  const bajarBD = async (cont, nombreRe, rutaSalida) => { const [d] = await Promise.all([t.page.waitForEvent('download', { timeout: 15000 }).catch(() => null), t.page.click(`${cont} [data-xbd="bajar"]`)]); if (d) await d.saveAs(rutaSalida); return d; };
  const subirBD = async (cont, clave, ruta) => { await t.page.setInputFiles(`${cont} input[data-xbd-archivo="${clave}"]`, ruta); };
  const guardarBD = async cont => { await t.page.click(`${cont} [data-xbd="guardar"]`); };

  // ---------- Equipos ----------
  await t.page.click('.tab[data-vista="equipos"]'); await t.page.click('#eqSecciones [data-sec="equipos"]');
  log('Equipos trae «Descargar base de datos» y «Subir Excel»', await hasta(t.page, () => !!document.querySelector('#eqContenido [data-xbd="bajar"]') && !!document.querySelector('#eqContenido input[data-xbd-archivo="equipos"]')));
  const rutaBdEq = path.join(CAPTURAS, 'bd-equipos.xlsx'), dEq = await bajarBD('#eqContenido', /Equipos/, rutaBdEq);
  log('se baja «Base de datos Equipos …xlsx»', !!dEq && /^Base de datos Equipos .*\.xlsx$/.test(dEq.suggestedFilename()), dEq && dEq.suggestedFilename());
  if (dEq) {
    const hs = await excelInfo(rutaBdEq), e = hs.find(h => h.nombre === 'Equipos');
    log('trae las hojas Equipos, Ayuda y una de listas oculta, con formato y las columnas esperadas', ['Equipos', 'Ayuda', 'Listas'].every(n => hs.some(h => h.nombre === n)) && hs.find(h => h.nombre === 'Listas').oculta && bienFormado(e) && e.titulos.join() === 'ID,Acción,Serial,Tipo,Marca,Modelo,Estado,Asignado a,Proyecto,Último mantenimiento,Último backup,Fecha de compra,Garantía hasta,Proveedor,Costo,Observaciones', JSON.stringify(e.titulos));
    log('trae los 12 equipos con su código, una fila de ejemplo y filas vacías', e.filas.filter(f => /^eq-\d+$/.test(f[0])).length === 12 && e.filas.filter(f => /^Ejemplo/.test(f[1])).length === 1 && e.filas.filter(f => f.slice(0, 12).every(x => x === '')).length >= 15);
  }
  const rutaEq = path.join(CAPTURAS, 'bd-equipos-cambiada.xlsx');
  await xlsxHoja('Equipos', [
    { Serial: 'demo-0099', Tipo: 'Portátil', Marca: 'Lenovo', Modelo: 'ThinkPad E14', Observaciones: 'Nuevo desde el Excel' },
    { ID: 'eq-004', 'Último backup': '2026-11-20', Observaciones: 'Se copiaron las fotos' },
    { ID: 'eq-002', Acción: 'Eliminar' },
    { Serial: 'DEMO-0001', Tipo: 'Portátil', Marca: 'X' },
    { Serial: 'DEMO-0098', Tipo: 'Nave espacial', Marca: 'X' },
    { ID: 'eq-006', Marca: 'Otra marca' },
    { Serial: 'ab', Tipo: 'Portátil', Marca: 'Y' }
  ], rutaEq);
  await subirBD('#eqContenido', 'equipos', rutaEq);
  log('al subir muestra: 1 para agregar, 1 para cambiar y 5 con problema', await hasta(t.page, () => { const x = document.getElementById('eqContenido').textContent; return /1 para agregar · 1 para cambiar/.test(x) && /5 con problema/.test(x); }), (await texto6('#eqContenido')).slice(0, 500));
  log('marca el equipo asignado que no se elimina, el serial repetido, el tipo que no está, el dato fijo y el serial mal escrito', await t.page.evaluate(() => { const x = document.getElementById('eqContenido').textContent; return /Está asignado a una persona/.test(x) && /ya hay uno con «DEMO-0001»/.test(x) && /Tipo: «Nave espacial» no está en la lista/.test(x) && /Marca: el Excel no cambia este dato/.test(x) && /Serial: usa letras, números y guiones/.test(x); }));
  const antesEq = await dBD();
  log('mientras se ve la vista previa no se guarda nada', Object.keys(antesEq.equipos).length === 13);
  await guardarBD('#eqContenido');
  log('guarda 1 agregado y 1 cambiado', await hasta(t.page, () => /1 agregado, 1 cambiado/.test(document.body.textContent) && !document.querySelector('#eqContenido [data-xbd="guardar"]')));
  const dEq1 = await dBD(), nuevoEq = Object.entries(dEq1.equipos).find(([, e]) => e.serial === 'DEMO-0099');
  log('el equipo nuevo queda en bodega, con el serial en mayúsculas y su línea de historial', !!nuevoEq && nuevoEq[1].estado === 'bodega' && nuevoEq[1].marca === 'Lenovo' && nuevoEq[1].obs === 'Nuevo desde el Excel' && nuevoEq[1].historial.length === 1 && nuevoEq[1].pendientes.mtto === false);
  log('el equipo que cambió guarda la fecha y la observación, suma una línea al historial y no cambia lo demás', dEq1.equipos['eq-004'].ultimoBackup === '2026-11-20' && dEq1.equipos['eq-004'].obs === 'Se copiaron las fotos' && dEq1.equipos['eq-004'].historial.length === antesEq.equipos['eq-004'].historial.length + 1 && dEq1.equipos['eq-004'].estado === antesEq.equipos['eq-004'].estado && dEq1.equipos['eq-004'].asignadoA === antesEq.equipos['eq-004'].asignadoA && !!dEq1.equipos['eq-002']);
  await esp(900);
  await subirBD('#eqContenido', 'equipos', rutaEq);
  log('subir el mismo Excel otra vez no repite nada (ni el equipo nuevo)', await hasta(t.page, () => /nada para guardar/.test(document.getElementById('eqContenido').textContent) && !!document.querySelector('#eqContenido [data-xbd="guardar"][disabled]')), (await texto6('#eqContenido')).slice(0, 400));
  await t.page.click('#eqContenido [data-xbd="descartar"]');
  const rutaEq2 = path.join(CAPTURAS, 'bd-equipos-eliminar.xlsx');
  await xlsxHoja('Equipos', [{ ID: nuevoEq[0], Acción: 'Eliminar', Serial: 'DEMO-0099' }], rutaEq2);
  await esp(900);
  await subirBD('#eqContenido', 'equipos', rutaEq2);
  log('«Eliminar» muestra 1 para eliminar', await hasta(t.page, () => /1 para eliminar/.test(document.getElementById('eqContenido').textContent)));
  await guardarBD('#eqContenido'); await t.page.click('#cfSi');
  log('el equipo se elimina (solo la Jefe) y los 13 de siempre siguen', await hasta(t.page, () => Object.keys(JSON.parse(localStorage.getItem('__fb_datos')).equipos).length === 13 && !Object.values(JSON.parse(localStorage.getItem('__fb_datos')).equipos).some(e => e.serial === 'DEMO-0099')));
  await t.page.screenshot({ path: path.join(CAPTURAS, '13-excel-equipos-bd.png'), fullPage: true });

  // ---------- Carros ----------
  await t.page.click('.tab[data-vista="vehiculos"]'); await t.page.click('#vehSecciones [data-sec="carros"]');
  log('Carros trae «Descargar base de datos» y «Subir Excel» (solo la Jefe)', await hasta(t.page, () => !!document.querySelector('#vehContenido [data-xbd="bajar"]') && !!document.querySelector('#vehContenido input[data-xbd-archivo="vehiculos"]')));
  const rutaBdVe = path.join(CAPTURAS, 'bd-carros.xlsx'), dVe = await bajarBD('#vehContenido', /Carros/, rutaBdVe);
  log('se baja «Base de datos Carros …xlsx» con los 4 carros, su formato y fecha como texto', !!dVe && /^Base de datos Carros .*\.xlsx$/.test(dVe.suggestedFilename()) && await (async () => { const hs = await excelInfo(rutaBdVe), e = hs.find(h => h.nombre === 'Carros'); return !!e && bienFormado(e) && e.titulos.join() === 'ID,Acción,Placa,Marca,Modelo,Año,Color,Kilometraje,SOAT vence,Técnico-mecánica vence,Conductor,Estado' && e.filas.filter(f => /^ve-/.test(f[0])).length === 4; })());
  const rutaVe = path.join(CAPTURAS, 'bd-carros-cambiada.xlsx');
  await xlsxHoja('Carros', [
    { Placa: 'xyz 789', Marca: 'Toyota', Modelo: 'Hilux', Año: 2024, Color: 'Blanco', Kilometraje: 0, 'SOAT vence': '2027-06-30', 'Técnico-mecánica vence': 46568 },
    { ID: 've-jkl012', Kilometraje: 21500, Color: 'Plata brillante' },
    { ID: 've-def456', Kilometraje: 100 },
    { ID: 've-abc123', Acción: 'Eliminar' },
    { ID: 've-ghi789', Acción: 'Eliminar' },
    { Placa: 'ABC 123', Marca: 'X', Modelo: 'Y', Año: 2020, Kilometraje: 1, 'SOAT vence': '2027-01-01', 'Técnico-mecánica vence': '2027-01-01' },
    { Placa: 'QWE 456', Marca: 'X', Modelo: 'Y', Año: 1800, Kilometraje: 1, 'SOAT vence': 'mañana', 'Técnico-mecánica vence': '2027-01-01' }
  ], rutaVe);
  await subirBD('#vehContenido', 'vehiculos', rutaVe);
  log('al subir muestra: 1 para agregar, 1 para cambiar y 5 con problema', await hasta(t.page, () => { const x = document.getElementById('vehContenido').textContent; return /1 para agregar · 1 para cambiar/.test(x) && /5 con problema/.test(x); }), (await texto6('#vehContenido')).slice(0, 500));
  log('marca el kilometraje que baja, el carro en uso, el que tiene novedades, la placa repetida y el año y la fecha mal', await t.page.evaluate(() => { const x = document.getElementById('vehContenido').textContent; return /no puede bajar/.test(x) && /Está en uso/.test(x) && /Tiene salidas, llegadas o novedades/.test(x) && /Placa: ya hay uno con «ABC 123»/.test(x) && /Año: debe ser 1990 o más/.test(x) && /SOAT vence: «?.*no es una fecha/.test(x); }));
  await guardarBD('#vehContenido');
  log('guarda el carro nuevo y el cambio', await hasta(t.page, () => /1 agregado, 1 cambiado/.test(document.body.textContent)));
  const dVe1 = await dBD(), nuevoVe = dVe1.vehiculos['ve-xyz789'];
  log('el carro nuevo queda «disponible», con la placa en mayúsculas y las fechas (también la que venía como fecha de Excel)', !!nuevoVe && nuevoVe.placa === 'XYZ 789' && nuevoVe.estado === 'disponible' && nuevoVe.soat === '2027-06-30' && nuevoVe.tecno === '2027-06-30' && nuevoVe.anio === 2024 && nuevoVe.historial.length === 1);
  log('el carro que cambió guarda el kilometraje y el color con una línea de historial', dVe1.vehiculos['ve-jkl012'].km === 21500 && dVe1.vehiculos['ve-jkl012'].color === 'Plata brillante' && dVe1.vehiculos['ve-jkl012'].historial.length === 1 && dVe1.vehiculos['ve-def456'].km === 62800 && !!dVe1.vehiculos['ve-abc123']);
  const rutaVe2 = path.join(CAPTURAS, 'bd-carros-eliminar.xlsx');
  await xlsxHoja('Carros', [{ ID: 've-xyz789', Acción: 'Eliminar', Placa: 'XYZ 789' }], rutaVe2);
  await esp(900);
  await subirBD('#vehContenido', 'vehiculos', rutaVe2);
  await hasta(t.page, () => /1 para eliminar/.test(document.getElementById('vehContenido').textContent));
  await guardarBD('#vehContenido'); await t.page.click('#cfSi');
  log('el carro nuevo, sin movimientos, sí se elimina', await hasta(t.page, () => !JSON.parse(localStorage.getItem('__fb_datos')).vehiculos['ve-xyz789'] && Object.keys(JSON.parse(localStorage.getItem('__fb_datos')).vehiculos).length === 4));

  // ---------- Reuniones ----------
  await t.page.click('.tab[data-vista="reuniones"]'); await t.page.click('#reuSecciones [data-sec="proximas"]');
  log('Reuniones trae «Descargar base de datos» y «Subir Excel» (solo la Jefe)', await hasta(t.page, () => !!document.querySelector('#reuContenido [data-xbd="bajar"]') && !!document.querySelector('#reuContenido input[data-xbd-archivo="reuniones"]')));
  const rutaBdRe = path.join(CAPTURAS, 'bd-reuniones.xlsx'), dRe = await bajarBD('#reuContenido', /Reuniones/, rutaBdRe);
  log('se baja «Base de datos Reuniones …xlsx» con las reuniones que ya están y lo que trae cada una', !!dRe && /^Base de datos Reuniones .*\.xlsx$/.test(dRe.suggestedFilename()) && await (async () => { const hs = await excelInfo(rutaBdRe), e = hs.find(h => h.nombre === 'Reuniones'); return !!e && bienFormado(e) && e.titulos.join() === 'ID,Acción,Comunidad,Fecha,Hora,Lugar,Personas esperadas,Camionetas,Refrigerio,Almuerzo,Estado' && e.filas.filter(f => /^re-/.test(f[0])).length >= 4; })());
  const activa = Object.values((await dBD()).reuniones).find(r => ['programada', 'reprogramada'].includes(r.estado)).comunidad;
  const rutaRe = path.join(CAPTURAS, 'bd-reuniones-nuevas.xlsx');
  await xlsxHoja('Reuniones', [
    { Comunidad: 'Comunidad Excel Uno', Fecha: '2030-02-10', Hora: '09:30', Lugar: 'Casa comunal', 'Personas esperadas': 25, Camionetas: 1, Refrigerio: 'Sí', Almuerzo: 'No' },
    { Comunidad: 'Comunidad Excel Dos', Fecha: '10/03/2030', Hora: '14:00' },
    { Comunidad: 'Comunidad Pasada', Fecha: '2020-01-01', Hora: '09:00' },
    { Comunidad: 'Comunidad Excel Tres', Fecha: '2030-04-01', Hora: '08:00' },
    { Comunidad: 'comunidad excel tres', Fecha: '2030-04-02', Hora: '08:00' },
    { Comunidad: activa, Fecha: '2030-05-01', Hora: '08:00' },
    { Comunidad: 'Comunidad Hora Mala', Fecha: '2030-06-01', Hora: 'tarde' }
  ], rutaRe);
  const re0 = await dBD(), nRe0 = Object.keys(re0.reuniones).length, nNe0 = Object.keys(re0.necesidades).length;
  await subirBD('#reuContenido', 'reuniones', rutaRe);
  log('al subir muestra: 2 para agregar y 5 con problema (fecha pasada, comunidad repetida en el Excel o ya activa, hora mala)', await hasta(t.page, () => { const x = document.getElementById('reuContenido').textContent; return /2 para agregar/.test(x) && /5 con problema/.test(x) && /Fecha: ya pasó/.test(x) && /repetida en el Excel/.test(x) && /Ya hay una reunión activa con esa comunidad/.test(x) && /Hora: no es una hora/.test(x) && /faltan las personas/.test(x); }), (await texto6('#reuContenido')).slice(0, 600));
  await guardarBD('#reuContenido');
  log('guarda las 2 reuniones nuevas', await hasta(t.page, () => /2 agregados/.test(document.body.textContent)));
  const re1 = await dBD(), uno = Object.entries(re1.reuniones).find(([, r]) => r.comunidad === 'Comunidad Excel Uno'), dos = Object.entries(re1.reuniones).find(([, r]) => r.comunidad === 'Comunidad Excel Dos');
  const tareasDe = id => Object.values(re1.necesidades).filter(n => n.reunionId === id).map(n => n.tipo).sort().join();
  log('la reunión completa queda programada con su reparto: comida, carros, logística, asistencia de los profesionales y acta', !!uno && uno[1].estado === 'programada' && uno[1].fecha === '2030-02-10' && uno[1].lugar === 'Casa comunal' && uno[1].asistentes === 25 && uno[1].faltan.length === 0 && /refrigerios/.test(tareasDe(uno[0])) && !/almuerzo/.test(tareasDe(uno[0])) && /carros/.test(tareasDe(uno[0])) && /logistica/.test(tareasDe(uno[0])) && /asistencia/.test(tareasDe(uno[0])) && /acta/.test(tareasDe(uno[0])), uno && tareasDe(uno[0]));
  log('la que no trae lugar ni personas queda con «faltan» y solo con logística, asistencia y acta (fecha escrita día/mes/año)', !!dos && dos[1].fecha === '2030-03-10' && dos[1].faltan.join() === 'lugar,personas' && !/refrigerios|almuerzo|carros/.test(tareasDe(dos[0])) && /acta/.test(tareasDe(dos[0])));
  log('cada reunión nueva avisa a los roles (comida a Compras, carros a Transporte, bodega, logística, profesionales y administrativo)', ['compras', 'carros', 'asistente', 'logistica', 'profesional', 'administrativo'].every(r => Object.values(re1.avisos).some(a => a.para === r && /Comunidad Excel Uno/.test(a.texto))) && Object.keys(re1.reuniones).length === nRe0 + 2 && Object.keys(re1.necesidades).length > nNe0);
  await esp(900);
  await subirBD('#reuContenido', 'reuniones', rutaRe);
  log('subir el mismo Excel otra vez no las repite: ahora salen como «ya hay una reunión activa»', await hasta(t.page, () => { const x = document.getElementById('reuContenido').textContent; return /Ya hay una reunión activa con esa comunidad/.test(x) && !/2 para agregar/.test(x); }));
  await t.page.click('#reuContenido [data-xbd="descartar"]');

  // ---------- Compras ----------
  await t.page.click('.tab[data-vista="inventario"]'); await t.page.click('#invSecciones [data-sec="compras"]');
  log('Compras trae «Descargar base de datos» y «Subir Excel»', await hasta(t.page, () => !!document.querySelector('#invContenido [data-xbd="bajar"]') && !!document.querySelector('#invContenido input[data-xbd-archivo="compras"]')));
  const rutaBdCo = path.join(CAPTURAS, 'bd-compras.xlsx'), dCo = await bajarBD('#invContenido', /Compras/, rutaBdCo);
  log('se baja «Base de datos Compras …xlsx» con las compras que ya están (en gris) y las listas de unidad, categoría y proyecto', !!dCo && /^Base de datos Compras .*\.xlsx$/.test(dCo.suggestedFilename()) && await (async () => { const hs = await excelInfo(rutaBdCo), e = hs.find(h => h.nombre === 'Compras'); return !!e && bienFormado(e) && e.filas.filter(f => /^co-/.test(f[0])).length === 14 && e.titulos.slice(0, 9).join() === 'ID,Acción,Qué,Cantidad,Unidad,Categoría,Valor total,Para qué,Proyecto'; })());
  const rutaCo = path.join(CAPTURAS, 'bd-compras-nuevas.xlsx');
  await xlsxHoja('Compras', [
    { Qué: 'Resmas de papel oficio', Cantidad: 5, Unidad: 'resmas', Categoría: 'Papelería', 'Valor total': '$140.000', 'Para qué': 'Para imprimir las listas', Proyecto: 'Oficina', 'Proveedor sugerido': 'Papelería Central' },
    { Qué: 'Cable de red de 10 m', Cantidad: 3, Unidad: 'unidades', Categoría: 'Cómputo', 'Valor total': 45000, 'Para qué': 'Para la oficina nueva' },
    { Qué: 'Algo sin valor', Cantidad: 1, Unidad: 'unidades', Categoría: 'Otro', 'Valor total': 0, 'Para qué': 'X' },
    { Qué: 'Unidad rara', Cantidad: 1, Unidad: 'galaxias', Categoría: 'Otro', 'Valor total': 1000, 'Para qué': 'X' },
    { Qué: 'Sin para qué', Cantidad: 1, Unidad: 'unidades', Categoría: 'Otro', 'Valor total': 1000 },
    { ID: 'co-001', Qué: 'Cambiar una que ya está', Cantidad: 99 }
  ], rutaCo);
  const co0 = await dBD(), nCo0 = Object.keys(co0.compras).length;
  await subirBD('#invContenido', 'compras', rutaCo);
  log('al subir muestra: 2 para agregar, 3 con problema y 1 que ya estaba (no se toca)', await hasta(t.page, () => { const x = document.getElementById('invContenido').textContent; return /2 para agregar/.test(x) && /3 con problema/.test(x) && /1 ya estaba en la app \(no se tocan; para cambiarlos usa la app\)/.test(x) && /Valor total: debe ser 1 o más/.test(x) && /«galaxias» no está en la lista/.test(x) && /Falta Para qué/.test(x); }), (await texto6('#invContenido')).slice(0, 600));
  await guardarBD('#invContenido');
  log('guarda las 2 compras', await hasta(t.page, () => /2 agregados/.test(document.body.textContent)));
  const co1 = await dBD(), nuevasCo = Object.values(co1.compras).filter(c => /desde el Excel/.test((c.historial[0] || {}).texto || ''));
  log('las compras nuevas quedan «pedido» (la Jefe no se autoriza), con su rol, correo, hora, una línea y el valor en pesos', nuevasCo.length === 2 && nuevasCo.every(c => c.estado === 'pedido' && c.pideRol === 'jefe' && !!c.pideUid && !!c.pideCorreo && !!c.creadoEn && c.lineas.length === 1 && c.autoriza === '') && nuevasCo.find(c => /oficio/.test(c.que)).valorAprox === 140000 && nuevasCo.find(c => /oficio/.test(c.que)).proyecto === 'Oficina' && nuevasCo.find(c => /Cable/.test(c.que)).proyecto === 'Proyecto Costa Norte' && Object.keys(co1.compras).length === nCo0 + 2);
  log('la Coordinadora de compras recibe un solo aviso por las 2 compras', Object.values(co1.avisos).filter(a => a.para === 'coordcompras' && /2 compras desde un Excel/.test(a.texto)).length === 1);
  await cambiar(t.page, 'gerente');
  await t.page.click('.tab[data-vista="inventario"]'); await t.page.click('#invSecciones [data-sec="compras"]');
  const rutaCo2 = path.join(CAPTURAS, 'bd-compras-gerente.xlsx');
  await xlsxHoja('Compras', [{ Qué: 'Cafetera industrial', Cantidad: 1, Unidad: 'unidades', Categoría: 'Cafetería', 'Valor total': 900000, 'Para qué': 'Para la sala de juntas' }], rutaCo2);
  await subirBD('#invContenido', 'compras', rutaCo2);
  await hasta(t.page, () => /1 para agregar/.test(document.getElementById('invContenido').textContent));
  await guardarBD('#invContenido');
  log('lo que sube el Gerente general desde el Excel nace «autorizado» y avisa a Compras', await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')), c = Object.values(d.compras).find(x => x.que === 'Cafetera industrial'); return !!c && c.estado === 'autorizado' && c.autoriza === 'Oscar Muñoz' && c.autorizaCorreo === 'gerente.oscar.munoz@example.com' && c.historial.length === 2 && Object.values(d.avisos).some(a => a.para === 'compras' && /1 compra desde un Excel/.test(a.texto)); }));
  await cambiar(t.page, 'conductor');
  await t.page.click('.tab[data-vista="inventario"]'); await t.page.click('#invSecciones [data-sec="compras"]');
  log('quien solo pide compras también ve los botones de Excel de Compras, pero no los de Bodega', await hasta(t.page, () => !!document.querySelector('#invContenido [data-xbd="bajar"]') && !document.querySelector('#invContenido [data-accion="bdexcel"]')));
  await cambiar(t.page, 'consulta');
  await t.page.click('.tab[data-vista="vehiculos"]'); await t.page.click('#vehSecciones [data-sec="carros"]');
  log('quien solo consulta no ve ninguna subida de Excel (ni en Carros)', await hasta(t.page, () => !document.querySelector('#vehContenido [data-xbd]')));
  await cambiar(t.page, 'jefe');

  console.log('6b. Equipos: baja, verificación y compra y garantía (Fase 11)');
  const hoy11 = await t.page.evaluate(() => window.App.hoyISO());
  const cerrarEq = async () => { await esp(700); if (!(await t.page.evaluate(() => document.getElementById('shEq').hidden))) await t.page.keyboard.press('Escape'); return hasta(t.page, () => document.getElementById('shEq').hidden); };
  const txtEq = () => texto(t.page, '#eqContenido');
  await t.page.click('.tab[data-vista="equipos"]'); await t.page.click('#eqSecciones [data-sec="equipos"]'); await t.page.waitForSelector('#qEq'); await t.page.fill('#qEq', '');
  log('Equipos: los 12 en uso salen en la lista y el de baja queda aparte, en «De baja (1)» (no cuenta en «12 de 12 equipos»)', await hasta(t.page, () => { const x = document.getElementById('eqContenido').textContent; return document.querySelectorAll('#eqContenido .card[data-accion="ver"]').length === 12 && /12 de 12 equipos/.test(x) && /De baja \(1\)/.test(x) && !!document.querySelector('#eqContenido [data-accion="verbaja"]'); }), await txtEq());
  await t.page.click('#eqContenido [data-accion="verbaja"]');
  log('«Ver los de baja» muestra la tarjeta del DEMO-0013 con su estado «De baja» y el motivo', await hasta(t.page, () => { const c = document.querySelector('#eqContenido .card[data-id="eq-013"]'); return !!c && /De baja/.test(c.textContent) && /Obsoleto/.test(c.textContent) && !/Mantenimiento/.test(c.textContent); }));
  await t.page.click('#eqContenido .card[data-id="eq-013"]'); await abiertaEq();
  log('la hoja de vida del equipo de baja dice desde cuándo, por qué, quién la pidió y quién la aprobó, trae su historial y no tiene botones para cambiarlo', await hasta(t.page, () => { const x = document.getElementById('eqCampos').textContent; return /De baja desde/.test(x) && /Obsoleto/.test(x) && /Fabián Barbosa/.test(x) && /Carolina Castillo/.test(x) && /Baja pedida/.test(x) && !document.querySelector('#eqCampos [data-accion="entregar"], #eqCampos [data-accion="pedirbaja"], #eqCampos [data-accion="datoscompra"], #eqCampos [data-accion="programar"], #eqCampos [data-accion="aprobarbaja"]'); }), await texto(t.page, '#eqCampos'));
  await t.page.keyboard.press('Escape'); await hasta(t.page, () => document.getElementById('shEq').hidden);
  await t.page.click('#eqSecciones [data-sec="hacer"]');
  log('a la Jefe le toca «Bajas por aprobar (1)»: el DEMO-0012, con «Aprobar la baja» y «No aprobar»', await hasta(t.page, () => { const s = [...document.querySelectorAll('#eqContenido .section-label')].find(x => /Bajas por aprobar \(1\)/.test(x.textContent)); if (!s) return false; const c = s.nextElementSibling; return /DEMO-0012/.test(c.textContent) && /Dañado sin arreglo/.test(c.textContent) && !!c.querySelector('[data-accion="aprobarbaja"]') && !!c.querySelector('[data-accion="noaprobarbaja"]'); }), await txtEq());
  await t.page.screenshot({ path: path.join(CAPTURAS, '25-baja-por-aprobar.png'), fullPage: true });
  await t.page.click('#eqSecciones [data-sec="resumen"]');
  log('Resumen: el equipo de baja queda fuera de la cifra, y salen «Sin verificar hace más de 6 meses (5)» y «Garantías que vencen en 30 días (2)»', await hasta(t.page, () => { const x = document.getElementById('eqContenido').textContent; return /Equipos[\s\S]{0,12}12[\s\S]{0,80}1 de baja \(fuera de la cifra\)/.test(x) && /Sin verificar hace más de 6 meses \(5\)/.test(x) && /Garantías que vencen en 30 días \(2\)/.test(x) && /vence en 18 días/.test(x) && /vence en 25 días/.test(x); }), await txtEq());
  await t.page.screenshot({ path: path.join(CAPTURAS, '26-resumen-equipos-ciclo.png'), fullPage: true });

  log('cambia a Daniel (Encargado de equipos)', await cambiar(t.page, 'equipos'));
  await t.page.click('.tab[data-vista="equipos"]'); await t.page.click('#eqSecciones [data-sec="equipos"]'); await t.page.waitForSelector('#qEq');
  await t.page.click('#eqContenido .card[data-id="eq-001"]'); await abiertaEq();
  log('el Encargado ve el DEMO-0001 (asignado): no puede pedir su baja y la hoja le explica que primero hay que recibirlo; trae «Compra y garantía» y la garantía por vencer', await hasta(t.page, () => { const x = document.getElementById('eqCampos').textContent; return !document.querySelector('#eqCampos [data-accion="pedirbaja"]') && /primero hay que recibirlo/.test(x) && !!document.querySelector('#eqCampos [data-accion="datoscompra"]') && /Garantía vence en 18 días/.test(x) && /Tecnoventas Ejemplo/.test(x); }), await texto(t.page, '#eqCampos'));
  await t.page.keyboard.press('Escape'); await hasta(t.page, () => document.getElementById('shEq').hidden);
  await t.page.click('#eqContenido .card[data-id="eq-009"]'); await abiertaEq();
  await t.page.click('#eqCampos [data-accion="pedirbaja"]'); await hasta(t.page, () => !!document.getElementById('ebNota'));
  await t.page.click('#eqPrimario');
  log('pedir la baja sin contar qué pasó no deja guardar', await errEq(/Cuenta qué pasó/));
  await t.page.selectOption('#ebMotivo', 'perdido'); await t.page.fill('#ebNota', 'No apareció en el conteo de la bodega');
  log('con motivo y nota, la baja queda pedida: el equipo sigue en bodega, con su línea de historial y el aviso para la Jefe', await guardarEq() && await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')), e = d.equipos['eq-009'], b = e.bajaPedida; const ult = e.historial[e.historial.length - 1]; return e.estado === 'bodega' && !!b && b.motivo === 'perdido' && b.porRol === 'equipos' && /No apareció/.test(b.nota) && ult.tipo === 'baja-pedida' && Object.values(d.avisos).some(a => a.para === 'jefe' && a.titulo === 'Piden la baja de un equipo' && /DEMO-0009/.test(a.texto)); }));
  await cerrarEq();
  await t.page.click('#btnEntregar'); await abiertaEq(); await esp(100);
  log('un equipo con la baja pedida ya no se ofrece para entregar', await hasta(t.page, () => !document.getElementById('ehEq_eq-009') && !!document.getElementById('ehEq_eq-007')));
  await t.page.click('#eqCerrar'); await hasta(t.page, () => document.getElementById('shEq').hidden);
  await t.page.click('#eqSecciones [data-sec="hacer"]');
  log('el Encargado ve «Bajas que pediste (esperan a la Jefe) (2)» y no tiene los botones de aprobar', await hasta(t.page, () => { const s = [...document.querySelectorAll('#eqContenido .section-label')].find(x => /Bajas que pediste \(esperan a la Jefe\) \(2\)/.test(x.textContent)); return !!s && /Esperando a la Jefe/.test(s.nextElementSibling.textContent) && !document.querySelector('#eqContenido [data-accion="aprobarbaja"]'); }), await txtEq());
  await t.page.click('#eqSecciones [data-sec="equipos"]'); await t.page.click('#eqContenido .card[data-id="eq-008"]'); await abiertaEq();
  await t.page.click('#eqCampos [data-accion="datoscompra"]'); await hasta(t.page, () => !!document.getElementById('ehFCompra'));
  await t.page.fill('#ehFCompra', '2026-01-10'); await t.page.fill('#ehGarantia', '2025-01-01'); await t.page.click('#eqPrimario');
  log('una garantía que termina antes de la compra no deja guardar', await errEq(/no puede terminar antes de la compra/));
  await t.page.fill('#ehGarantia', '2028-01-10'); await t.page.fill('#ehProveedor', 'Tecnoventas Ejemplo S. A. S.'); await t.page.fill('#ehCosto', '1.250.000');
  log('con datos buenos, la compra y la garantía se guardan (costo como número) y dejan su línea en el historial', await guardarEq() && await hasta(t.page, () => { const e = JSON.parse(localStorage.getItem('__fb_datos')).equipos['eq-008'], ult = e.historial[e.historial.length - 1]; return e.fechaCompra === '2026-01-10' && e.garantiaHasta === '2028-01-10' && e.proveedor === 'Tecnoventas Ejemplo S. A. S.' && e.costo === 1250000 && ult.tipo === 'compra'; }));
  await cerrarEq();
  await t.page.click('#btnNuevoEq'); await abiertaEq();
  await t.page.fill('#ehSerial', 'demo-0100'); await t.page.fill('#ehMarca', 'Lenovo'); await t.page.fill('#ehModelo', 'ThinkPad E14'); await t.page.fill('#ehFCompra', '2026-11-01'); await t.page.fill('#ehGarantia', '2029-11-01'); await t.page.fill('#ehProveedor', 'Equipos del Caribe Ejemplo'); await t.page.fill('#ehCosto', '3100000');
  log('un equipo nuevo se registra con sus datos de compra y garantía', await guardarEq() && await hasta(t.page, () => { const e = Object.values(JSON.parse(localStorage.getItem('__fb_datos')).equipos).find(x => x.serial === 'DEMO-0100'); return !!e && e.estado === 'bodega' && e.fechaCompra === '2026-11-01' && e.garantiaHasta === '2029-11-01' && e.costo === 3100000 && e.proveedor === 'Equipos del Caribe Ejemplo'; }));
  await t.page.click('#btnNuevoEq'); await abiertaEq();
  await t.page.fill('#ehSerial', 'demo0100'); await t.page.fill('#ehMarca', 'Lenovo'); await t.page.fill('#ehModelo', 'ThinkPad E14'); await t.page.click('#eqPrimario');
  log('un serial igual a otro pero sin el guion (DEMO0100 y DEMO-0100) no se registra: el escáner los confundiría', await errEq(/Ya hay un equipo con ese serial/));
  await t.page.keyboard.press('Escape'); await hasta(t.page, () => !document.getElementById('shConfirmar').hidden); await t.page.click('#cfSi'); await hasta(t.page, () => document.getElementById('shEq').hidden);

  log('cambia a Carolina Castillo (Jefe)', await cambiar(t.page, 'jefe'));
  await t.page.click('.tab[data-vista="equipos"]'); await t.page.click('#eqSecciones [data-sec="hacer"]');
  await t.page.click('#eqContenido [data-accion="aprobarbaja"][data-id="eq-009"]'); await abiertaEq();
  log('«Aprobar la baja» muestra lo que se pidió y para qué sirve', await hasta(t.page, () => /Aprobar la baja del DEMO-0009/.test(document.getElementById('eqT').textContent) && /Perdido/.test(document.getElementById('eqCampos').textContent) && /sale de las cifras/.test(document.getElementById('eqCampos').textContent)));
  log('la Jefe aprueba la baja: el equipo pasa a «baja» con la fecha y quién la aprobó, con su línea de historial, y el Encargado recibe el aviso', await guardarEq() && await hasta(t.page, h => { const d = JSON.parse(localStorage.getItem('__fb_datos')), e = d.equipos['eq-009'], ult = e.historial[e.historial.length - 1]; return e.estado === 'baja' && e.bajaEn === h && !!e.bajaPor && e.bajaPedida.motivo === 'perdido' && ult.tipo === 'baja' && Object.values(d.avisos).some(a => a.para === 'equipos' && a.titulo === 'Aprobaron la baja' && /DEMO-0009/.test(a.texto)); }, hoy11));
  await esp(500);
  await t.page.click('#eqContenido [data-accion="noaprobarbaja"][data-id="eq-012"]'); await abiertaEq();
  await t.page.click('#eqPrimario');
  log('no aprobar una baja sin decir por qué no deja guardar', await errEq(/Cuenta por qué no se aprueba/));
  await t.page.fill('#ebPorque', 'Todavía sirve: se arregla cambiando la pantalla');
  log('la Jefe no aprueba la del DEMO-0012: la solicitud se quita, el equipo sigue en Recibidos y queda la línea «Baja no aprobada»', await guardarEq() && await hasta(t.page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')), e = d.equipos['eq-012'], ult = e.historial[e.historial.length - 1]; return e.estado === 'recibido' && e.bajaPedida === null && ult.tipo === 'baja-no' && /Todavía sirve/.test(ult.nota) && Object.values(d.avisos).some(a => a.para === 'equipos' && a.titulo === 'No aprobaron la baja'); }));
  await t.page.click('#eqSecciones [data-sec="equipos"]'); await t.page.click('#eqContenido .card[data-id="eq-008"]'); await abiertaEq();
  log('la Jefe ve «Dar de baja» (directa) en un equipo de bodega', await hasta(t.page, () => { const b = document.querySelector('#eqCampos [data-accion="pedirbaja"]'); return !!b && /Dar de baja/.test(b.textContent); }));
  await t.page.click('#eqCampos [data-accion="pedirbaja"]'); await hasta(t.page, () => !!document.getElementById('ebNota'));
  await t.page.selectOption('#ebMotivo', 'obsoleto'); await t.page.fill('#ebNota', 'Ya no se usa y no tiene repuestos');
  log('la Jefe la da de baja directa: pasa a «baja» sin solicitud previa, con ella misma como quien la pidió y la aprobó', await guardarEq() && await hasta(t.page, () => { const e = JSON.parse(localStorage.getItem('__fb_datos')).equipos['eq-008']; return e.estado === 'baja' && e.bajaPedida.porRol === 'jefe' && e.bajaPedida.motivo === 'obsoleto' && !!e.bajaPor; }));
  await cerrarEq();
  log('las cifras de arriba no cuentan los 3 de baja (bodega baja de 3 a 1)', await hasta(t.page, () => { const x = document.getElementById('sumEquipos').textContent; return /En bodega/.test(x) && Number([...document.querySelectorAll('#sumEquipos .sum')].find(s => /En bodega/.test(s.textContent)).querySelector('.num').textContent) === 2; }), await texto(t.page, '#sumEquipos'));

  log('cambia a Ángel (Soporte)', await cambiar(t.page, 'soporte'));
  await t.page.click('.tab[data-vista="equipos"]'); await t.page.click('#eqSecciones [data-sec="hacer"]');
  log('Soporte ve el botón «Verificar equipos» en Lo que me toca', await hasta(t.page, () => !!document.querySelector('#eqContenido [data-accion="verificar"]')));
  await t.page.click('#eqSecciones [data-sec="equipos"]'); await t.page.click('#eqContenido .card[data-id="eq-007"]'); await abiertaEq();
  log('en la hoja de vida de Soporte no hay botones de baja ni de compra', await hasta(t.page, () => !document.querySelector('#eqCampos [data-accion="pedirbaja"], #eqCampos [data-accion="datoscompra"], #eqCampos [data-accion="aprobarbaja"]') && /Última verificación/.test(document.getElementById('eqCampos').textContent)));
  await t.page.keyboard.press('Escape'); await hasta(t.page, () => document.getElementById('shEq').hidden);
  await t.page.evaluate(async () => { await window.UI.cargarScript('codigos.js?v=1'); });
  await t.page.click('#eqContenido [data-accion="verificar"]'); await abiertaEq();
  const faltanVer = alc => t.page.evaluate(a => Object.values(window.App.S.datos.equipos).filter(e => e.estado !== 'baja' && (a === 'todos' || (a === 'asignado' ? e.estado === 'asignado' : e.estado !== 'asignado'))).length, alc);
  const nBod0 = await faltanVer('bodega');
  log('«Verificar equipos» abre con «Verificados 0 · Sin encontrar N» (los de bodega y Recibidos que no están de baja) y avisa cuántos llevan más de 6 meses', await hasta(t.page, n => /Verificados 0 · Sin encontrar/.test(document.getElementById('evLista').textContent) && document.getElementById('evLista').textContent.includes('Sin encontrar ' + n) && /llevan más de 6 meses sin verificarse/.test(document.getElementById('eqSub').textContent), nBod0), await texto(t.page, '#evLista'));
  await t.page.click('#eqPrimario');
  log('guardar sin haber verificado ninguno no deja', await errEq(/Escanea o escribe al menos un equipo/));
  await t.page.evaluate(() => { const q = ['demo-0007', 'DEMO-0010', 'XYZ-999', 'DEMO-0009', 'demo-0007']; window.Codigos.leer = async () => (q.length ? q.shift() : null); });
  await t.page.click('#eqCampos [data-accion="verescanear"]');
  log('escanear uno tras otro: verifica DEMO-0007 y DEMO-0010, no cuenta el serial que no existe, el de baja, ni el repetido', await hasta(t.page, n => { const x = document.getElementById('evLista').textContent; return x.includes('Verificados 2 · Sin encontrar ' + (n - 2)) && /DEMO-0007/.test(x) && /DEMO-0010/.test(x) && !/DEMO-0009/.test(document.querySelector('#evLista .ver-lista').textContent); }, nBod0), await texto(t.page, '#evLista'));
  await t.page.fill('#evSerial', 'demo-0011'); await t.page.press('#evSerial', 'Enter');
  log('escribir un serial y tocar Enter lo agrega sin guardar la hoja (siguen abiertas con 3 verificados)', await hasta(t.page, n => !document.getElementById('shEq').hidden && document.getElementById('evLista').textContent.includes('Verificados 3 · Sin encontrar ' + (n - 3)) && document.getElementById('evSerial').value === '', nBod0));
  await t.page.selectOption('#evAlcance', 'asignado');
  const nAsig = await faltanVer('asignado');
  log('al escoger «Los asignados a personas» el «Sin encontrar» cambia a los 6 asignados (ninguno verificado en esta ronda)', await hasta(t.page, n => document.getElementById('evLista').textContent.includes('Verificados 3 · Sin encontrar ' + n), nAsig) && nAsig === 6);
  await t.page.selectOption('#evAlcance', 'todos');
  await t.page.screenshot({ path: path.join(CAPTURAS, '27-verificar-equipos.png'), fullPage: true });
  const antesV = (await dat()).equipos;
  log('guardar deja a los 3 con la fecha de hoy y quién los verificó (y el DEMO-0001 sigue con su fecha vieja)', await guardarEq() && await hasta(t.page, h => { const e = JSON.parse(localStorage.getItem('__fb_datos')).equipos; return ['eq-007', 'eq-010', 'eq-011'].every(i => e[i].verificadoEn === h && !!e[i].verificadoPor) && e['eq-001'].verificadoEn !== h; }, hoy11));
  const desp = (await dat()).equipos;
  log('el historial de los verificados no cambió y los de baja no se tocaron', ['eq-007', 'eq-010', 'eq-011'].every(i => desp[i].historial.length === antesV[i].historial.length) && desp['eq-009'].verificadoEn === antesV['eq-009'].verificadoEn && desp['eq-013'].verificadoEn === antesV['eq-013'].verificadoEn);
  log('el mensaje final dice «Verificados 3 · Sin encontrar …»', await hasta(t.page, () => /Verificados 3 · Sin encontrar \d+/.test(document.getElementById('toast').textContent)));
  log('cambia a Carolina Castillo (Jefe) otra vez', await cambiar(t.page, 'jefe'));
  await t.page.click('.tab[data-vista="equipos"]'); await t.page.click('#eqSecciones [data-sec="resumen"]');
  log('Resumen: ahora quedan 2 sin verificar hace más de 6 meses (el DEMO-0012 y el DEMO-0100 recién registrado) y el Resumen cuenta 3 de baja', await hasta(t.page, () => { const x = document.getElementById('eqContenido').textContent; return /Sin verificar hace más de 6 meses \(2\)/.test(x) && /3 de baja \(fuera de la cifra\)/.test(x); }), await txtEq());

  console.log('6c. Inventario: escáner de códigos, código del artículo y conteo de lo que toca hoy (Fase 13)');
  const hoy13 = await t.page.evaluate(() => window.App.hoyISO());
  const errAc = re => hasta(t.page, r => !document.getElementById('acErr').hidden && new RegExp(r).test(document.getElementById('acErr').textContent), re.source);
  await t.page.click('.tab[data-vista="inventario"]'); await t.page.click('#invSecciones [data-sec="existencias"]'); await t.page.fill('#qInventario', '');
  await t.page.evaluate(async () => { await window.UI.cargarScript('codigos.js?v=1'); });
  const fingirCod = c => t.page.evaluate(s => { window.Codigos.leer = async () => s; }, c);
  await fingirCod('bot-042');
  await t.page.click('#invContenido [data-accion="escanear"]'); await t.page.waitForSelector('#shAccion:not([hidden])');
  log('escanear un código que existe (aunque venga en minúscula y con guion) abre la hoja de ese artículo', await hasta(t.page, () => /Botas de seguridad talla 42/.test(document.getElementById('acT').textContent)));
  await t.page.click('#acCerrar'); await hasta(t.page, () => document.getElementById('shAccion').hidden);
  await fingirCod('ZZZ999');
  await t.page.click('#invContenido [data-accion="escanear"]');
  log('escanear un código que no existe lo dice y lo deja escrito en el buscador', await hasta(t.page, () => /No hay un artículo con el código ZZZ999/.test(document.getElementById('toast').textContent) && document.getElementById('qInventario').value === 'ZZZ999'));
  await t.page.fill('#qInventario', '');
  await t.page.evaluate(() => window.nube.lote([['mezclar', 'articulos', 'ar-017', { codigo: 'BOT042' }]]));
  await fingirCod('BOT042');
  await t.page.click('#invContenido [data-accion="escanear"]');
  log('si dos bodegas tienen el mismo código, lo dice y deja las dos en el buscador para escoger', await hasta(t.page, () => /Hay 2 artículos con el código BOT042/.test(document.getElementById('toast').textContent) && document.getElementById('qInventario').value === 'BOT042' && document.querySelectorAll('#invContenido .card.art').length === 2));
  await t.page.evaluate(() => window.nube.lote([['mezclar', 'articulos', 'ar-017', { codigo: '' }]]));
  await t.page.fill('#qInventario', '');
  await t.page.click('#invContenido .card.art[data-id="ar-012"]'); await t.page.waitForSelector('#shAccion:not([hidden])');
  await t.page.click('#acCampos [data-accion="editart"]'); await hasta(t.page, () => !!document.getElementById('acCodigo'));
  log('«Editar artículo» trae el campo del código con su botón de escanear y el código que ya tiene (TON001)', await hasta(t.page, () => document.getElementById('acCodigo').value === 'TON001' && !!document.querySelector('#acCampos [data-accion="escancodigo"]')));
  await t.page.fill('#acCodigo', 'TON 001'); await t.page.click('#acPrimario');
  log('un código con espacio no deja guardar', await errAc(/de 3 a 30 letras o números, sin espacios ni guiones/));
  await t.page.fill('#acCodigo', 'bot040'); await t.page.click('#acPrimario');
  log('un código que ya tiene otro artículo de la misma bodega no deja guardar, y dice cuál', await errAc(/Ese código ya lo tiene «Botas de seguridad talla 40» en la bodega de Riohacha/));
  await fingirCod('7-70-123'); await t.page.click('#acCampos [data-accion="escancodigo"]');
  log('el botón de escanear del formulario escribe el código limpio (sin guiones) en el campo', await hasta(t.page, () => document.getElementById('acCodigo').value === '770123'));
  await t.page.click('#acPrimario');
  log('guarda el código nuevo y el artículo se encuentra con él', await hasta(t.page, () => document.getElementById('shAccion').hidden && window.App.S.datos.articulos.find(a => a.id === 'ar-012').codigo === '770123'));
  // «Te toca contar hoy»: contar solo esos artículos
  await t.page.evaluate(() => localStorage.setItem('conteo.Riohacha', JSON.stringify({ vals: { 'ar-009': '12' }, en: new Date().toISOString() })));
  await t.page.click('#invSecciones [data-sec="conteo"]');
  const nBtn = await t.page.evaluate(() => { const b = document.querySelector('#invContenido .cuadro-hoy [data-accion="contarhoy"]'); const m = b && /\((\d+)\)/.exec(b.textContent); return m ? Number(m[1]) : 0; });
  log('Conteo: hay artículos que tocan hoy y el botón dice cuántos', nBtn >= 1, String(nBtn));
  const movs0 = Object.keys((await dat()).movimientos).length, avisos0 = Object.values((await dat()).avisos).filter(a => a.titulo === 'Conteo con diferencias').length;
  await t.page.click('#invContenido .cuadro-hoy [data-accion="contarhoy"]'); await t.page.waitForSelector('#shAccion:not([hidden])');
  log('«Contar en …» abre el conteo solo con esos artículos, con «los de hoy» en el título', await hasta(t.page, n => /los de hoy/.test(document.getElementById('acT').textContent) && document.querySelectorAll('#acCampos input[data-art]').length === n, nBtn));
  const ids13 = await t.page.evaluate(() => [...document.querySelectorAll('#acCampos input[data-art]')].map(i => i.dataset.art)), dd13 = (await dat()).articulos;
  for (const id of ids13) await t.page.fill('#cn-' + id, String(dd13[id].cantidad));
  log('lo escrito se suma al borrador de la bodega sin borrar lo que ya había de otros artículos (ar-009 sigue en 12)', await t.page.evaluate(n => { const j = JSON.parse(localStorage.getItem('conteo.Riohacha') || 'null'); return !!j && j.vals['ar-009'] === '12' && Object.keys(j.vals).length === n + 1; }, ids13.length));
  await t.page.click('#acPrimario');
  log('«Revisar» dice que todo cuadra con la app', await hasta(t.page, n => new RegExp(`Contaste ${n} (artículo|artículos): todo cuadra con la app`).test(document.getElementById('acSub').textContent), ids13.length), await texto(t.page, '#acSub'));
  await t.page.click('#acPrimario');
  log('al guardar un conteo que cuadra: queda la fecha de hoy como último conteo de cada uno, sin tocar cantidades ni crear movimientos ni avisos', await hasta(t.page, () => document.getElementById('shAccion').hidden) && await (async () => { const d = await dat(); return ids13.every(id => d.articulos[id].ultimoConteo === hoy13 && d.articulos[id].cantidad === dd13[id].cantidad) && Object.keys(d.movimientos).length === movs0 && Object.values(d.avisos).filter(a => a.titulo === 'Conteo con diferencias').length === avisos0; })());
  log('lo contado sale de «Te toca contar hoy» y el borrador conserva solo lo de ar-009', await hasta(t.page, ([ids, nombres]) => { const c = document.querySelector('#invContenido .cuadro-hoy'); return !!c && nombres.every(n => !c.textContent.includes(n)); }, [ids13, ids13.map(id => dd13[id].nombre)]) && await t.page.evaluate(() => { const j = JSON.parse(localStorage.getItem('conteo.Riohacha') || 'null'); return !!j && Object.keys(j.vals).join() === 'ar-009'; }));
  await t.page.evaluate(() => localStorage.removeItem('conteo.Riohacha'));
  // Quien solo pide material: sin clase ABC (sale de los movimientos, que no ve)
  log('cambia a Pedro (Logística, solo pide material)', await cambiar(t.page, 'logistica'));
  await t.page.click('.tab[data-vista="inventario"]'); await t.page.click('#invSecciones [data-sec="existencias"]');
  await t.page.click('#invContenido .card.art'); await t.page.waitForSelector('#shAccion:not([hidden])');
  log('quien solo pide ve el código del artículo pero no su clase ABC', await hasta(t.page, () => { const x = document.getElementById('acCampos').textContent; return !/Clase ABC/.test(x) && /Último conteo/.test(x); }), await texto(t.page, '#acCampos'));
  await t.page.keyboard.press('Escape'); await hasta(t.page, () => document.getElementById('shAccion').hidden);
  await t.page.setViewportSize({ width: 1280, height: 860 });
  await t.page.evaluate(() => localStorage.setItem('inv.vista', 'tabla'));
  await t.page.click('#invSecciones [data-sec="solicitudes"]'); await t.page.click('#invSecciones [data-sec="existencias"]');
  log('y su tabla de existencias no trae la columna ABC', await hasta(t.page, () => { const th = [...document.querySelectorAll('#invContenido .tabla-inv thead th')].map(x => x.textContent.trim()); return th.length === 10 && !th.some(x => /^ABC/.test(x)); }));
  await t.page.setViewportSize({ width: 412, height: 860 });
  await t.page.evaluate(() => localStorage.removeItem('inv.vista'));
  log('cambia a Carolina Castillo (Jefe) otra vez', await cambiar(t.page, 'jefe'));

  console.log('6. Seguridad y errores');
  await t.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')); d.compras['co-002'].que = '<img src=x onerror="window.__hackeado=1">Prueba'; d.articulos['ar-011'].nombre = '<img src=x onerror="window.__hackeado=2">Mouse'; d.solicitudes[Object.keys(d.solicitudes)[0]].paraQue = '<script>window.__hackeado=3</script>'; d.compras['co-xss'] = { que: 'Compra con texto malo', cantidad: 3, unidad: 'artículos', categoria: 'Otro', valorAprox: 6000, paraQue: '<b onmouseover="window.__hackeado=6">x</b>', pide: 'Carolina Castillo', pideRol: 'jefe', autoriza: 'Oscar Muñoz', autorizaJefe: '', estado: 'comprado', proveedor: '<svg onload="window.__hackeado=7">', valorReal: 6000, fechaPedido: '2026-11-01', fechaCompra: '2026-11-02', entregadoA: '', motivoRechazo: '', articuloId: '', factura: '', revisada: false, historial: [],
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
