// Pruebas de las mejoras de «Plan de mejoras» (Fase 1 en adelante), en Chrome con el Firebase falso de esta carpeta.
// Uso: CHROME=/usr/bin/google-chrome node pruebas/mejoras.mjs   (sin CHROME usa el Chromium de Playwright)
// Es aparte de prueba.mjs para correr rápido; cada fase agrega su bloque al final. Sale con código 1 si algo falla.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(RAIZ, 'capturas'); fs.mkdirSync(TMP, { recursive: true });
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.json': 'application/json' };
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
const hasta = (page, fn, arg, ms = 6000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const texto = (page, sel) => page.locator(sel).first().innerText().catch(() => '');
const visible = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);

// Cámara de mentira (Chrome genera un video de prueba) para probar el escáner sin cámara real.
const b = await chromium.launch(Object.assign({ args: ['--use-fake-device-for-media-stream=device-count=3', '--use-fake-ui-for-media-stream'] }, process.env.CHROME ? { executablePath: process.env.CHROME } : {}));
const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, locale: 'es-CO', permissions: ['camera'] });
const errores = [];
await ctx.route(/\/config\.js/, r => r.fulfill({ body: CONFIG, contentType: 'text/javascript' }));
await ctx.route(/gstatic\.com\/firebasejs\//, r => {
  const n = r.request().url().split('/').pop();
  return r.fulfill({ body: fs.readFileSync(path.join(RAIZ, 'pruebas', n)), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
});
await ctx.route(u => !/^http:\/\/127\.0\.0\.1/.test(u.href) && !/gstatic\.com\/firebasejs/.test(u.href), r => { errores.push('salió a internet: ' + r.request().url()); return r.abort(); });
const page = await ctx.newPage();
page.on('pageerror', e => errores.push('error: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errores.push('consola: ' + m.text()); });

async function entrar(rol) {
  await page.click(`#entradaLista [data-rol="${rol}"]`);
  return hasta(page, r => !document.getElementById('vInicio').hidden && document.getElementById('avatarTop').classList.contains('av-' + r), rol);
}
async function cambiar(rol) {
  await page.click('#btnPersona'); await page.waitForSelector('#shPersona:not([hidden])');
  await page.evaluate(() => document.querySelectorAll('#personaLista details.grupo-personas').forEach(d => { d.open = true; }));
  await page.click(`#personaLista [data-rol="${rol}"]`);
  return hasta(page, r => document.getElementById('avatarTop').classList.contains('av-' + r) && document.getElementById('shPersona').hidden, rol);
}
const fb = () => page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos') || '{}'));
const lotesHechos = () => page.evaluate(() => window.__fbEscrituras || 0);
const datosListos = () => hasta(page, () => window.App && window.App.S.datos.articulos.length > 0 && window.App.S.datos.equipos.length > 0);

try {
  await page.goto(URL);
  log('entra la Jefe de prueba y se cargan los datos', await entrar('jefe') && await datosListos());

  /* ================= FASE 1 ================= */
  console.log('Fase 1: registro con código, guardado seguro y bugs de Equipos y Carros');

  // --- 1. Registro con código: el perfil se crea al confirmar el correo, no antes ---
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')); d.codigosDireccion = Object.assign(d.codigosDireccion || {}, { 'JEF-PRUE-BA23': { rol: 'jefe', activo: true, por: 'consola', en: new Date().toISOString() } }); localStorage.setItem('__fb_datos', JSON.stringify(d)); });
  await page.click('#btnPersona'); await page.waitForSelector('#shPersona:not([hidden])'); await page.click('#btnSalir'); await hasta(page, () => !document.getElementById('vEntrada').hidden);
  await page.click('#entradaModo [data-modo="cuenta"]');
  if (!/Crear/.test(await texto(page, '#ctBoton'))) await page.click('#ctCambiar');
  await page.fill('#ctCorreo', 'jefa.codigo@ejemplo.test'); await page.fill('#ctClave', 'clave-jefa-12345');
  await page.evaluate(() => { document.getElementById('ctCodigoD').open = true; }); await page.fill('#ctNombre', 'Jefa Con Código'); await page.fill('#ctCodigo', 'JEF-PRUE-BA23');
  await page.click('#ctBoton');
  log('con código, al crear la cuenta primero pide confirmar el correo', await hasta(page, () => !document.getElementById('vCuenta').hidden && /Confirma tu correo/.test(document.getElementById('tCuenta').textContent)));
  await esp(300);
  log('y todavía no se creó el perfil ni se gastó el código (antes daba el falso «Ese código no sirve»)', await (async () => { const d = await fb(); return !Object.values(d.usuarios || {}).some(u => u.correo === 'jefa.codigo@ejemplo.test') && !!(d.codigosDireccion || {})['JEF-PRUE-BA23']; })());
  log('crear el perfil con el correo sin confirmar lo rechaza el Firebase falso (como las reglas)', await page.evaluate(async () => { try { await window.nube.usarCodigo('Jefa Con Código', 'JEF-PRUE-BA23'); return false; } catch (e) { return e.code === 'codigo-malo'; } }));
  await page.evaluate(() => window.__fbConfirmar('jefa.codigo@ejemplo.test')); await page.click('#cuYa');
  log('al confirmar el correo, el código se aplica solo y entra como Jefe, sin volver a escribir nada', await hasta(page, () => !document.getElementById('vInicio').hidden && document.getElementById('rolTop').textContent === 'Jefe'));
  log('el perfil quedó con el rol del código y el código de Jefe se gastó', await (async () => { const d = await fb(); const u = Object.values(d.usuarios || {}).find(x => x.correo === 'jefa.codigo@ejemplo.test'); return !!u && u.rol === 'jefe' && u.nombre === 'Jefa Con Código' && !(d.codigosDireccion || {})['JEF-PRUE-BA23']; })());

  // --- 2. Al cambiar de persona se limpian los datos y lo que quedó a medias ---
  await page.click('#btnPersona'); await page.waitForSelector('#shPersona:not([hidden])'); await page.click('#btnSalir'); await hasta(page, () => !document.getElementById('vEntrada').hidden);
  log('al cerrar sesión se vaciaron los datos de la persona anterior', await page.evaluate(() => Object.values(window.App.S.datos).every(l => Array.isArray(l) && l.length === 0)));
  await page.click('#entradaModo [data-modo="prueba"]');
  await page.evaluate(() => { window.__cambios = 0; window.addEventListener('app:persona-cambio', () => { window.__cambios++; }); });
  log('vuelve a entrar la Jefe de prueba', await entrar('jefe') && await datosListos());
  log('entrar avisa «cambió la persona» una sola vez (los módulos sueltan lo que tenían a medias)', await page.evaluate(() => window.__cambios === 1));
  log('cambiar a otra persona también lo avisa', await cambiar('asistente') && await hasta(page, () => window.App.S.datos.articulos.length > 0) && await page.evaluate(() => window.__cambios === 2), await page.evaluate(() => 'cambios: ' + window.__cambios));

  // --- 3. Conteo físico: se guarda en lotes de máximo 5 artículos con movimiento ---
  await page.click('.tab[data-vista="inventario"]'); await page.click('#invSecciones [data-sec="conteo"]');
  await page.click('#invContenido [data-accion="conteo"]'); await page.waitForSelector('#shAccion:not([hidden])');
  await page.selectOption('#acBod', 'Riohacha'); await page.click('#acPrimario');
  await hasta(page, () => document.querySelectorAll('#acCampos .conteo-f input').length >= 7);
  const aCambiar = await page.evaluate(() => [...document.querySelectorAll('#acCampos .conteo-f input')].map(i => i.id.replace('cn-', '')));
  const art0 = await page.evaluate(ids => Object.fromEntries(ids.map(id => [id, window.App.S.datos.articulos.find(a => a.id === id).cantidad])), aCambiar);
  const siete = aCambiar.slice(0, 7);
  log('el conteo de Riohacha trae al menos 7 artículos', siete.length === 7, aCambiar.length);
  for (const id of aCambiar) await page.fill('#cn-' + id, String(siete.includes(id) ? art0[id] + 1 : art0[id]));
  await page.click('#acPrimario');
  await hasta(page, () => !!document.getElementById('acMotivo'));
  await page.fill('#acMotivo', 'Prueba: había más de lo que decía la app');
  const antesLotes = await lotesHechos();
  await page.click('#acPrimario');
  log('el conteo con 7 diferencias se guarda y la hoja se cierra', await hasta(page, () => document.getElementById('shAccion').hidden, null, 9000));
  const lotes = (await lotesHechos()) - antesLotes;
  log('se hizo en 2 lotes (5 artículos con movimiento y luego 2 más), no en uno solo', lotes === 2, 'lotes: ' + lotes);
  const d3 = await fb();
  log('los 7 artículos quedaron ajustados (+1) y cada uno con su movimiento de conteo', siete.every(id => d3.articulos[id].cantidad === art0[id] + 1 && Object.values(d3.movimientos).some(m => m.articuloId === id && m.motivo === 'conteo' && m.cantidad === 1 && m.saldo === art0[id] + 1)));

  // --- 4. Si otra persona movió el artículo mientras tanto, no se desajusta el kárdex ---
  const a4 = 'ar-004', c4 = (await fb()).articulos[a4].cantidad;
  await page.click('#invSecciones [data-sec="movimientos"]');
  await page.click('#invContenido [data-accion="entrada"]'); await page.waitForSelector('#shAccion:not([hidden])');
  await page.click('#acCampos [data-accion="entdev"]'); await page.waitForSelector('#acPersona');
  await page.selectOption('#acArt', a4); await page.fill('#acCant', '2'); await page.fill('#acPersona', 'Paola Ríos');
  // Otra persona cambia la cantidad en Firebase y a este teléfono todavía no le llega el cambio:
  await page.evaluate(([id, n]) => { const d = JSON.parse(localStorage.getItem('__fb_datos')); d.articulos[id].cantidad = n; localStorage.setItem('__fb_datos', JSON.stringify(d)); }, [a4, c4 + 10]);
  const movs0 = Object.keys((await fb()).movimientos).length;
  await page.click('#acPrimario');
  log('si otra persona movió ese artículo, avisa claro y no guarda nada', await hasta(page, () => !document.getElementById('acErr').hidden && /Otra persona movió este artículo/.test(document.getElementById('acErr').textContent)));
  const d4 = await fb();
  log('la cantidad queda como la dejó la otra persona y no se creó ningún movimiento', d4.articulos[a4].cantidad === c4 + 10 && Object.keys(d4.movimientos).length === movs0);
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')); localStorage.setItem('__fb_datos', JSON.stringify(d)); });
  await page.keyboard.press('Escape'); await hasta(page, () => document.getElementById('shAccion').hidden || !document.getElementById('shConfirmar').hidden);
  if (!(await page.evaluate(() => document.getElementById('shConfirmar').hidden))) await page.click('#cfSi');
  await hasta(page, () => document.getElementById('shAccion').hidden);
  // Con la pantalla al día, el mismo movimiento sí se guarda:
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: null })));
  await esp(300);
  await page.click('#invContenido [data-accion="entrada"]'); await page.waitForSelector('#shAccion:not([hidden])');
  await page.click('#acCampos [data-accion="entdev"]'); await page.waitForSelector('#acPersona');
  await page.selectOption('#acArt', a4); await page.fill('#acCant', '2'); await page.fill('#acPersona', 'Paola Ríos');
  await page.click('#acPrimario');
  log('con la pantalla al día, la entrada sí se guarda y el saldo del movimiento es el correcto', await hasta(page, ([id, n]) => { const d = JSON.parse(localStorage.getItem('__fb_datos')); const m = Object.values(d.movimientos).find(x => x.articuloId === id && x.tipo === 'entrada' && x.cantidad === 2 && x.saldo === n + 2); return d.articulos[id].cantidad === n + 2 && !!m; }, [a4, c4 + 10]));

  // --- 5. Fotos: nunca pasan del tope (1 MB por documento en Firebase) ---
  const fotos = await page.evaluate(async () => {
    // Una foto de 3000×2000 con ruido (difícil de comprimir).
    const cv = document.createElement('canvas'); cv.width = 3000; cv.height = 2000; const x = cv.getContext('2d'), im = x.createImageData(3000, 2000);
    for (let i = 0; i < im.data.length; i += 4) { im.data[i] = Math.random() * 255; im.data[i + 1] = Math.random() * 255; im.data[i + 2] = Math.random() * 255; im.data[i + 3] = 255; }
    x.putImageData(im, 0, 0);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png')), f = new File([blob], 'ruido.png', { type: 'image/png' });
    const r = {};
    for (const [k, lado, max] of [['cot', 1000, 110000], ['fac', 1280, 250000], ['carro', 720, 100000]]) {
      try { const d = await window.Inventario.leerFoto(f, lado, max); r[k] = d.length; } catch (e) { r[k] = 'error ' + e.message; }
    }
    return r;
  });
  log('una foto muy pesada se achica hasta quedar dentro del tope: cotización ≤ 110 KB, factura ≤ 250 KB, foto de carro ≤ 100 KB', typeof fotos.cot === 'number' && fotos.cot <= 110000 && typeof fotos.fac === 'number' && fotos.fac <= 250000 && typeof fotos.carro === 'number' && fotos.carro <= 100000, JSON.stringify(fotos));

  // --- 6. Equipos: la firma se puede deshacer y borrar, y después de borrar sigue contando ---
  log('cambia a Daniel (Encargado de equipos)', await cambiar('equipos'));
  await page.click('.tab[data-vista="equipos"]'); await page.click('#btnEntregar'); await page.waitForSelector('#shEq:not([hidden])'); await esp(200);
  const trazo = async (desdeY = 0) => {
    await page.evaluate(() => document.querySelector('#ehFirmaP').scrollIntoView({ block: 'center' })); await esp(120);
    const bb = await page.locator('#ehFirmaP').boundingBox();
    await page.mouse.move(bb.x + 20, bb.y + bb.height / 2 + desdeY); await page.mouse.down();
    for (let k = 1; k <= 12; k++) await page.mouse.move(bb.x + 20 + k * (bb.width - 40) / 12, bb.y + bb.height / 2 + desdeY + Math.sin(k) * 10);
    await page.mouse.up();
  };
  const firmaTxt = () => texto(page, '#ehFirmaPTxt');
  await trazo();
  log('al firmar dice «Firma lista»', /Firma lista/.test(await firmaTxt()));
  log('el cuadro de firma trae «Deshacer» y «Borrar»', await visible(page, '#eqCampos [data-accion="deshacerfirma"]') && await visible(page, '#eqCampos [data-accion="borrarfirma"]'));
  await trazo(30);
  await page.click('#eqCampos [data-accion="deshacerfirma"]');
  log('«Deshacer» quita solo el último trazo: la firma sigue lista', /Firma lista/.test(await firmaTxt()));
  await page.click('#eqCampos [data-accion="deshacerfirma"]');
  log('al deshacer el único trazo que queda, vuelve a pedir la firma', /Firma con el dedo/.test(await firmaTxt()));
  await trazo(); await page.click('#eqCampos [data-accion="borrarfirma"]');
  log('«Borrar» deja el cuadro vacío', /Firma con el dedo/.test(await firmaTxt()));
  await trazo();
  await page.fill('#ehPersona', 'Rosa Firma Prueba'); await page.fill('#ehCedula', '1060708099'); await page.locator('#ehEq_eq-007').check({ force: true });
  await page.click('#eqPrimario'); await esp(400);
  log('después de Borrar y firmar de nuevo, la firma sí cuenta (antes salía «Falta la firma» para siempre)', !/Falta la firma/.test(await texto(page, '#eqErr')) && await hasta(page, () => !!Object.values(JSON.parse(localStorage.getItem('__fb_datos')).hojas).find(h => h.persona === 'Rosa Firma Prueba')));

  // --- 7. Equipos asignados: todos tienen su acta de entrega abierta ---
  const d7 = await fb();
  const asig = Object.values(d7.equipos).filter(e => e.estado === 'asignado' && e.asignadoA !== 'Rosa Firma Prueba');
  log('los equipos asignados de los datos de ejemplo tienen todos su acta de entrega (DEMO-0002, 0003 y 0006 ya no quedan sin acta)', asig.length === 6 && asig.every(e => Object.values(d7.hojas).some(h => h.persona === e.asignadoA && h.equipos.some(x => x.id === Object.keys(d7.equipos).find(k => d7.equipos[k] === e)))));
  const dev = await page.evaluate(() => { const h = document.getElementById('eqContenido'); return !!h; });
  log('la pantalla de Equipos sigue abierta', dev);

  // --- 8. Carros: el costo de una novedad no se guarda en silencio como $ 0 ---
  await page.keyboard.press('Escape'); await hasta(page, () => document.getElementById('shEq').hidden || !document.getElementById('shConfirmar').hidden);
  if (!(await page.evaluate(() => document.getElementById('shConfirmar').hidden))) await page.click('#cfSi');
  log('cambia a la Jefe', await cambiar('jefe'));
  await page.click('.tab[data-vista="vehiculos"]'); await page.click('#vehSecciones [data-sec="novedades"]').catch(() => {});
  await page.click('#vehContenido [data-accion="novedad"]'); await page.waitForSelector('#shVeh:not([hidden])');
  await page.selectOption('#vnVeh', 've-jkl012'); await page.selectOption('#vnTipo', 'llanta'); await page.fill('#vnKm', '21340'); await page.fill('#vnDesc', 'Llanta con corte en el costado');
  await page.setInputFiles('#vnFoto', path.join(RAIZ, 'iconos', 'control-512.png')); await hasta(page, () => !document.getElementById('vnFotoVer').hidden);
  await page.fill('#vnCosto', '150.5'); await page.click('#vePrimario');
  log('un costo con decimales no se guarda como $ 0: pide escribirlo bien', await hasta(page, () => !document.getElementById('veErr').hidden && /Escribe el costo en pesos/.test(document.getElementById('veErr').textContent)));
  await page.fill('#vnCosto', '150.000'); await page.click('#vePrimario');
  log('«150.000» se entiende como 150000 pesos', await hasta(page, () => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).novedades).some(n => n.descripcion === 'Llanta con corte en el costado' && n.costo === 150000)));

  // --- 9. Excel de Carros: «ABC123» no pisa a «ABC 123» ---
  const rutaX = path.join(TMP, 'mejoras-carros.xlsx');
  const b64 = await page.evaluate(async () => { const X = await window.Inventario.cargarXlsx(), l = X.utils.book_new(); X.utils.book_append_sheet(l, X.utils.json_to_sheet([{ Placa: 'ABC123', Marca: 'X', Modelo: 'Y', Año: 2020, Kilometraje: 1, 'SOAT vence': '2027-01-01', 'Técnico-mecánica vence': '2027-01-01' }, { Placa: 'ZZZ-111', Marca: 'X', Modelo: 'Y', Año: 2020, Kilometraje: 1, 'SOAT vence': '2027-01-01', 'Técnico-mecánica vence': '2027-01-01' }, { Placa: 'ZZZ 111', Marca: 'X', Modelo: 'Y', Año: 2020, Kilometraje: 1, 'SOAT vence': '2027-01-01', 'Técnico-mecánica vence': '2027-01-01' }]), 'Carros'); return X.write(l, { type: 'base64', bookType: 'xlsx' }); });
  fs.writeFileSync(rutaX, Buffer.from(b64, 'base64'));
  await page.keyboard.press('Escape').catch(() => {});
  await page.click('#vehSecciones [data-sec="carros"]').catch(() => {});
  await page.setInputFiles('#vehContenido input[data-xbd-archivo="vehiculos"]', rutaX);
  log('subir «ABC123» (el carro «ABC 123» ya existe) y «ZZZ-111» con «ZZZ 111» (repetidos) da error y no agrega nada', await hasta(page, () => { const x = document.getElementById('vehContenido').textContent; return /3 con problema/.test(x) && (x.match(/ya hay uno con/g) || []).length >= 3; }), (await texto(page, '#vehContenido')).slice(0, 400));
  log('no se agregó ni se pisó ningún carro', await (async () => { const d = await fb(); return Object.keys(d.vehiculos).length === 4 && !d.vehiculos['ve-zzz111']; })());

  /* ================= FASE 2 ================= */
  console.log('Fase 2: escáner (lector continuo, pitido, cámara, códigos)');
  await page.evaluate(() => window.UI.cargarScript('codigos.js?v=2'));
  // --- limpiar(): lo que trae el código → serial ---
  const lim = await page.evaluate(() => ['SN8472910', 'S/N: abc123', 'SN 5566', 'Serial No. xy99', 'SERIAL9', 'https://soporte.ejemplo.test/p?ServiceTag=7abcd12', 'https://soporte.ejemplo.test/p?SN=Q1W2E3'].map(x => window.Codigos.limpiar(x)));
  log('un serial real que empieza con SN (SN8472910) no pierde las letras; «S/N: …», «SN …» y «Serial No. …» sí pierden el rótulo', lim.slice(0, 5).join(',') === 'SN8472910,ABC123,5566,XY99,SERIAL9', lim.join(','));
  log('el serial de un enlace se saca sin importar mayúsculas o minúsculas del parámetro (ServiceTag, SN)', lim[5] === '7ABCD12' && lim[6] === 'Q1W2E3', lim.slice(5).join(','));

  // --- Lector falso: el navegador «lee» lo que la prueba le va entregando, con la cámara falsa de Chrome ---
  await page.evaluate(() => {
    window.__lecturas = []; window.__vib = 0; window.__gum = 0; window.__sonidos = 0;
    window.BarcodeDetector = class { static async getSupportedFormats() { return ['code_128', 'qr_code', 'code_39', 'ean_13']; } async detect() { return window.__lecturas.length ? window.__lecturas.shift() : []; } };
    window.__codigosSinNativo = false;
    navigator.vibrate = () => { window.__vib++; return true; };
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = c => { window.__gum++; return gum(c); };
    const AC = window.AudioContext; window.AudioContext = class extends AC { createOscillator() { window.__sonidos++; return super.createOscillator(); } };
  });
  const lee = (...seriales) => page.evaluate(s => { window.__lecturas.push(s.map(x => ({ rawValue: x }))); }, seriales);
  const pildora = () => texto(page, '.cod-pildora');
  log('cambia a la Jefe y abre «Verificar equipos»', await cambiar('jefe'));
  await page.click('.tab[data-vista="equipos"]');
  await page.click('#eqSecciones [data-sec="hacer"]').catch(() => {});
  await page.click('#eqContenido [data-accion="verificar"]'); await page.waitForSelector('#shEq:not([hidden])');
  await page.click('#eqCampos [data-accion="verescanear"]');
  log('el lector continuo abre la cámara y muestra el contador «Verificados 0 · Faltan N» dentro de la misma pantalla', await hasta(page, () => !!document.querySelector('.cod') && !document.querySelector('.cod-vivo').hidden && /Verificados 0 · Faltan \d+/.test(document.querySelector('.cod-cuenta').textContent), null, 9000), await texto(page, '.cod'));
  log('trae el botón «Terminar» y no «Escribir a mano»', await visible(page, '.cod [data-a="terminar"]') && !(await visible(page, '.cod [data-a="escribir"]')));
  await hasta(page, () => document.querySelector('.cod-estado').textContent.includes('uno tras otro'), null, 9000);
  await lee('DEMO-0008');
  log('al leer DEMO-0008 la píldora sale verde («Verificado: DEMO-0008»), el contador sube y el botón dice «Terminar (1)»', await hasta(page, () => document.querySelector('.cod-pildora.ok') && /Verificado: DEMO-0008/.test(document.querySelector('.cod-pildora').textContent) && /Verificados 1 · Faltan/.test(document.querySelector('.cod-cuenta').textContent) && /Terminar \(1\)/.test(document.querySelector('[data-a="terminar"]').textContent)), await pildora());
  log('cada lectura vibra y suena un pitido', await page.evaluate(() => window.__vib >= 1 && window.__sonidos >= 1), await page.evaluate(() => `vib ${window.__vib} sonidos ${window.__sonidos}`));
  const vib1 = await page.evaluate(() => window.__vib);
  await lee('DEMO-0008'); await esp(700);
  log('el mismo serial dentro de 2,5 s no se vuelve a leer: no suma ni vuelve a sonar', await page.evaluate(v => window.__vib === v && /Verificados 1 ·/.test(document.querySelector('.cod-cuenta').textContent), vib1));
  await lee('XYZ-999');
  log('un serial que no existe sale en rojo con su explicación', await hasta(page, () => document.querySelector('.cod-pildora.mal') && /No hay un equipo con el serial XYZ-999/.test(document.querySelector('.cod-pildora').textContent)), await pildora());
  await page.evaluate(() => new Promise(r => setTimeout(r, 2700)));
  await lee('DEMO-0008');
  log('pasados 2,5 s, repetir el serial avisa en amarillo «ya estaba verificado» y no cuenta otra vez', await hasta(page, () => document.querySelector('.cod-pildora.aviso') && /ya estaba verificado/.test(document.querySelector('.cod-pildora').textContent) && /Verificados 1 ·/.test(document.querySelector('.cod-cuenta').textContent)), await pildora());
  await lee('DEMO-0009');
  log('otro serial sigue sumando en la misma pantalla de cámara (Terminar (2))', await hasta(page, () => /Terminar \(2\)/.test(document.querySelector('[data-a="terminar"]').textContent)));
  log('la cámara se abrió una sola vez en todo el recorrido (no se reinicia entre lecturas)', await page.evaluate(() => window.__gum === 1), await page.evaluate(() => 'getUserMedia: ' + window.__gum));
  log('la linterna y la cámara no repiten botones: el botón de linterna solo sale si esa lente la tiene (la falsa no)', await page.evaluate(() => document.querySelector('.cod [data-a="linterna"]').hidden === true));
  await page.focus('body').catch(() => {}); await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Escape');
  log('Escape cierra el lector aunque el foco esté fuera, y NO cierra la hoja de verificación que hay detrás', await hasta(page, () => !document.querySelector('.cod')) && await visible(page, '#shEq'));
  log('al cerrar, la hoja de atrás tiene los 2 verificados escaneados', await hasta(page, () => /Verificados 2 · Sin encontrar/.test(document.getElementById('evLista').textContent)));
  await page.evaluate(() => { window.__gum = 0; });
  await page.click('#eqCampos [data-accion="verescanear"]');
  await hasta(page, () => !!document.querySelector('.cod [data-a="terminar"]:not([hidden])'), null, 9000);
  await page.click('.cod [data-a="terminar"]');
  log('«Terminar» cierra el lector y deja todo anotado', await hasta(page, () => !document.querySelector('.cod')) && await visible(page, '#shEq'));
  log('al cerrar el lector se apagó la cámara (no queda luz prendida)', await page.evaluate(() => [...document.querySelectorAll('video')].every(v => !v.srcObject || v.srcObject.getTracks().every(t => t.readyState === 'ended'))));
  await page.keyboard.press('Escape'); await hasta(page, () => !document.getElementById('shConfirmar').hidden || document.getElementById('shEq').hidden);
  if (!(await page.evaluate(() => document.getElementById('shConfirmar').hidden))) await page.click('#cfSi');
  await hasta(page, () => document.getElementById('shEq').hidden);

  // --- Un código leído normal (no continuo): varios códigos y auto-aceptar ---
  const unico = await page.evaluate(async () => {
    const r = window.Codigos.leer({ titulo: 'Prueba' }); await new Promise(x => setTimeout(x, 1200));
    window.__lecturas.push([{ rawValue: 'SN8472910' }]); window.__lecturas.push([{ rawValue: 'SN8472910' }]);
    return Promise.race([r, new Promise(x => setTimeout(() => x('no cerró'), 6000))]);
  });
  log('con una sola lectura repetida dos veces se acepta sola (sin pedir tocar nada) y entrega el serial tal cual (SN8472910)', unico === 'SN8472910', String(unico));
  const dos = await page.evaluate(async () => {
    const r = window.Codigos.leer({ titulo: 'Prueba' }); await new Promise(x => setTimeout(x, 1200));
    for (let i = 0; i < 4; i++) window.__lecturas.push([{ rawValue: 'ABC-111' }, { rawValue: 'PN-555' }]);
    await new Promise(x => setTimeout(x, 1500));
    const botones = [...document.querySelectorAll('.cod-elegir [data-usar]')], b0 = botones[0];
    await new Promise(x => setTimeout(x, 900));
    const mismo = b0 && b0.isConnected;   // el botón no se reescribe cada 120 ms
    if (b0) b0.click();
    return { v: await Promise.race([r, new Promise(x => setTimeout(() => x('no cerró'), 4000))]), n: botones.length, mismo };
  });
  log('con dos códigos en la etiqueta salen dos botones para escoger, que no se vuelven a dibujar mientras sigue apuntando', dos.n === 2 && dos.mismo === true && dos.v === 'ABC-111', JSON.stringify(dos));

  // --- Varias lentes: «Cámara N de M», se suelta la anterior y la linterna se actualiza ---
  await page.evaluate(() => { window.__gum = 0; window.__abiertas = 0; window.__maxAbiertas = 0; const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async c => { const f = await gum(c); window.__abiertas++; window.__maxAbiertas = Math.max(window.__maxAbiertas, window.__abiertas); f.getTracks().forEach(t => t.addEventListener('ended', () => { window.__abiertas--; })); const parar = t => { const o = t.stop.bind(t); t.stop = () => { if (t.readyState !== 'ended') window.__abiertas--; o(); }; }; f.getTracks().forEach(parar); return f; };
    window.__lector = window.Codigos.leer({ titulo: 'Cámaras' }); });
  await hasta(page, () => !!document.querySelector('.cod') && !document.querySelector('.cod [data-a="otra"]').hidden, null, 9000);
  log('con 3 cámaras traseras aparece «Cambiar cámara»', await visible(page, '.cod [data-a="otra"]'));
  await page.click('.cod [data-a="otra"]');
  log('al cambiar dice «Cámara 2 de 3» (antes decía «Cámara 0 de 3»)', await hasta(page, () => /Cámara 2 de 3/.test(document.querySelector('.cod-estado').textContent), null, 9000), await texto(page, '.cod-estado'));
  await page.click('.cod [data-a="otra"]'); await hasta(page, () => /Cámara 3 de 3/.test(document.querySelector('.cod-estado').textContent), null, 9000);
  await page.click('.cod [data-a="otra"]');
  log('después de la última vuelve a «Cámara 1 de 3»', await hasta(page, () => /Cámara 1 de 3/.test(document.querySelector('.cod-estado').textContent), null, 9000), await texto(page, '.cod-estado'));
  log('nunca hubo dos cámaras abiertas a la vez (se suelta la actual antes de abrir la otra)', await page.evaluate(() => window.__maxAbiertas <= 1), await page.evaluate(() => 'máximo abiertas: ' + window.__maxAbiertas));
  await page.keyboard.press('Escape'); await hasta(page, () => !document.querySelector('.cod'));

  // --- El lector queda guardado para usarlo sin internet (sw.js) ---
  const sw = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    for (let i = 0; i < 40; i++) { const k = await caches.keys(); if (k.includes('codigos-v1') && (await (await caches.open('codigos-v1')).keys()).length >= 2) break; await new Promise(r => setTimeout(r, 250)); }
    const c = await caches.open('codigos-v1'), claves = (await c.keys()).map(r => new URL(r.url).pathname.split('/').pop());
    return { caches: await caches.keys(), claves };
  });
  log('el service worker guardó el lector (ponyfill.js y zxing_reader.wasm) en la caché «codigos-v1»', sw.caches.includes('codigos-v1') && sw.claves.includes('ponyfill.js') && sw.claves.includes('zxing_reader.wasm'), JSON.stringify(sw));

  // --- Equipos: «Escanear» junto al serial de un equipo nuevo ---
  await page.click('.tab[data-vista="equipos"]');
  log('cambia a Daniel (Encargado de equipos)', await cambiar('equipos'));
  await page.click('#btnNuevoEq'); await page.waitForSelector('#shEq:not([hidden])');
  log('«Registrar equipo nuevo» trae «Escanear» junto al serial', await visible(page, '#eqCampos [data-accion="escanear"][data-modo="nuevo"]'));
  await page.evaluate(() => { window.Codigos.leer = async () => 'SN8472910'; });
  await page.click('#eqCampos [data-accion="escanear"][data-modo="nuevo"]');
  log('el serial leído se escribe en el campo tal cual', await hasta(page, () => document.getElementById('ehSerial').value === 'SN8472910'));
  await page.evaluate(() => { window.Codigos.leer = async () => 'DEMO-0001'; });
  await page.click('#eqCampos [data-accion="escanear"][data-modo="nuevo"]');
  log('si el serial ya existe, avisa «ya hay un equipo»', await hasta(page, () => /ya hay un equipo con el serial DEMO-0001/.test(document.getElementById('toast').textContent)));
  await page.evaluate(() => { window.Codigos.leer = async () => 'X'.repeat(45); });
  await page.click('#eqCampos [data-accion="escanear"][data-modo="nuevo"]');
  log('un serial de más de 30 caracteres se deja completo y se avisa (no se recorta en silencio)', await hasta(page, () => document.getElementById('ehSerial').value === 'X'.repeat(45) && /de 4 a 30/.test(document.getElementById('toast').textContent)));
  await page.keyboard.press('Escape'); await hasta(page, () => !document.getElementById('shConfirmar').hidden || document.getElementById('shEq').hidden);
  if (!(await page.evaluate(() => document.getElementById('shConfirmar').hidden))) await page.click('#cfSi');
  await hasta(page, () => document.getElementById('shEq').hidden);

  // --- Inventario: códigos que no existen, bodega filtrada, BOT-040, y escáner dentro de los formularios ---
  log('cambia a Bodega', await cambiar('asistente'));
  await page.click('.tab[data-vista="inventario"]'); await page.click('#invSecciones [data-sec="existencias"]');
  await page.evaluate(() => { window.Codigos.leer = async () => 'ZZZ999'; });
  await page.click('#invContenido [data-accion="escanear"]');
  log('escanear un código que no existe ofrece «Agregar artículo con este código»', await hasta(page, () => !document.getElementById('shConfirmar').hidden && /No hay un artículo con el código ZZZ999/.test(document.getElementById('shConfirmar').textContent) && /Agregar artículo con este código/.test(document.getElementById('cfSi').textContent)));
  await page.click('#cfSi');
  log('al aceptar, el formulario de artículo nuevo ya trae el código escrito', await hasta(page, () => !document.getElementById('shAccion').hidden && document.getElementById('acCodigo').value === 'ZZZ999'));
  await page.evaluate(() => { window.Codigos.leer = async () => 'A'.repeat(31) + '1'; });
  await page.click('#acCampos [data-accion="escancodigo"]');
  log('un código de más de 30 caracteres no se recorta en silencio: se avisa y el campo no cambia', await hasta(page, () => /máximo es 30/.test(document.getElementById('toast').textContent)) && await page.evaluate(() => document.getElementById('acCodigo').value === 'ZZZ999'));
  await page.keyboard.press('Escape'); await hasta(page, () => !document.getElementById('shConfirmar').hidden || document.getElementById('shAccion').hidden);
  if (!(await page.evaluate(() => document.getElementById('shConfirmar').hidden))) await page.click('#cfSi');
  await hasta(page, () => document.getElementById('shAccion').hidden);
  await page.fill('#qInventario', 'bot-040');
  log('buscar «bot-040» encuentra el código BOT040', await hasta(page, () => [...document.querySelectorAll('#invContenido .card.art, #invContenido tbody tr')].some(x => /BOT040/.test(x.textContent))));
  await page.fill('#qInventario', '');
  // Bodega filtrada: ar-001 (BOT040) está en Riohacha; con Guamal filtrada, escanear BOT040 avisa y lo abre igual
  await page.evaluate(() => { window.Codigos.leer = async () => 'bot-040'; });
  const bodDe = await page.evaluate(() => window.App.S.datos.articulos.find(a => a.id === 'ar-001').bodega);
  const otra = ['Riohacha', 'Guamal', 'Bogotá'].find(x => x !== bodDe);
  await page.click(`#invContenido .chips.sub [data-val="${otra}"]`).catch(() => {});
  await page.click('#invContenido [data-accion="escanear"]');
  log('escanear «bot-040» (con otra bodega filtrada) abre igual el artículo y dice en cuál bodega está', await hasta(page, () => !document.getElementById('shAccion').hidden && /BOT040/.test(document.getElementById('acCampos').textContent)));
  await page.keyboard.press('Escape'); await hasta(page, () => document.getElementById('shAccion').hidden);
  // Escáner dentro de «Registrar salida»
  await page.click('#invContenido [data-accion="salida"]'); await page.waitForSelector('#shAccion:not([hidden])');
  log('«Registrar salida» trae el botón de escanear el código del artículo', await visible(page, '#acCampos [data-accion="escanearform"]'));
  await page.selectOption('#acBod', bodDe);
  await page.evaluate(() => { window.Codigos.leer = async () => 'BOT042'; });
  await page.click('#acCampos [data-accion="escanearform"]');
  log('escanear BOT042 escoge ese artículo en la lista de la bodega', await hasta(page, () => document.getElementById('acArt').value === 'ar-002' || /Escogido|está en la bodega/.test(document.getElementById('toast').textContent)), await page.evaluate(() => document.getElementById('acArt').value + ' · ' + document.getElementById('toast').textContent));
  await page.keyboard.press('Escape'); await hasta(page, () => document.getElementById('shAccion').hidden || !document.getElementById('shConfirmar').hidden);
  if (!(await page.evaluate(() => document.getElementById('shConfirmar').hidden))) await page.click('#cfSi');
  // Escáner dentro del conteo físico
  await page.click('#invSecciones [data-sec="conteo"]'); await page.click('#invContenido [data-accion="conteo"]'); await page.waitForSelector('#shAccion:not([hidden])');
  await page.selectOption('#acBod', bodDe); await page.click('#acPrimario');
  await hasta(page, () => !!document.getElementById('cn-ar-001'));
  log('el conteo trae el botón de escanear', await visible(page, '#acCampos [data-accion="escanearform"][data-modo="conteo"]'));
  await page.evaluate(() => { window.Codigos.leer = async () => 'BOT040'; });
  await page.click('#acCampos [data-accion="escanearform"][data-modo="conteo"]');
  log('escanear BOT040 salta al campo de ese artículo para escribir lo contado', await hasta(page, () => document.activeElement && document.activeElement.id === 'cn-ar-001'));
  await page.keyboard.press('Escape'); await hasta(page, () => document.getElementById('shAccion').hidden);
  // Pedir material (Jefe)
  log('cambia a Fredy (Compras)', await cambiar('compras'));
  const pm = await page.evaluate(() => !!document.getElementById('btnPedirMaterial'));
  log('Pedir material existe para este rol', pm);
  await page.click('#btnPedirMaterial'); await page.waitForSelector('#shAccion:not([hidden])');
  log('«Pedir material» trae el botón de escanear', await visible(page, '#acCampos [data-accion="escanearform"]'));
  await page.keyboard.press('Escape'); await hasta(page, () => document.getElementById('shAccion').hidden || !document.getElementById('shConfirmar').hidden);
  if (!(await page.evaluate(() => document.getElementById('shConfirmar').hidden))) await page.click('#cfSi');

  /* ================= FASE 3 ================= */
  console.log('Fase 3: inventario, artículos, compras y Excel');
  const cerrarHoja = async (id = 'shAccion') => {
    await page.keyboard.press('Escape');
    await hasta(page, i => document.getElementById(i).hidden || !document.getElementById('shConfirmar').hidden, id);
    if (!(await page.evaluate(() => document.getElementById('shConfirmar').hidden))) await page.click('#cfSi');
    await hasta(page, i => document.getElementById(i).hidden, id);
  };
  const acErr = () => hasta(page, () => !document.getElementById('acErr').hidden && document.getElementById('acErr').textContent.length > 3);
  const refrescar = async () => { await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: null }))); await esp(350); };
  const inyectar = ops => page.evaluate(o => window.nube.lote(o), ops);
  log('cambia a Bodega', await cambiar('asistente'));
  await page.click('.tab[data-vista="inventario"]'); await page.click('#invSecciones [data-sec="existencias"]');
  await page.click('#invContenido [data-accion="nuevoart"]'); await page.waitForSelector('#shAccion:not([hidden])');
  log('«Agregar artículo» ya no trae «Estante » escrito en la ubicación (solo el ejemplo gris)', await page.evaluate(() => document.getElementById('acUbi').value === ''));
  log('el proveedor habitual admite hasta 80 letras', await page.evaluate(() => document.getElementById('acProvH').maxLength === 80));
  await page.selectOption('#acBod', 'Guamal'); await page.fill('#acNom', 'Té de prueba'); await page.fill('#acMin', '1'); await page.fill('#acMax', '5'); await page.fill('#acCosto', '8000');
  await page.click('#acPrimario');
  log('se agrega «Té de prueba» en Guamal (con 0 en bodega)', await hasta(page, () => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).articulos).some(a => a.nombre === 'Té de prueba' && a.bodega === 'Guamal' && a.cantidad === 0)));
  await page.click('#invContenido [data-accion="nuevoart"]'); await page.waitForSelector('#shAccion:not([hidden])');
  await page.selectOption('#acBod', 'Guamal'); await page.fill('#acNom', '  te   DE   prueba '); await page.fill('#acMin', '1'); await page.fill('#acMax', '5'); await page.fill('#acCosto', '8000');
  await page.click('#acPrimario');
  log('«  te   DE   prueba » se rechaza como repetido de «Té de prueba» (sin importar tildes, mayúsculas ni espacios)', await acErr() && /Ya hay un artículo con ese nombre en la bodega de Guamal/.test(await texto(page, '#acErr')));
  await cerrarHoja();
  const idTe = await page.evaluate(() => Object.entries(JSON.parse(localStorage.getItem('__fb_datos')).articulos).find(([, a]) => a.nombre === 'Té de prueba')[0]);
  await page.fill('#qInventario', 'Té de prueba');
  await page.click(`#invContenido [data-accion="verart"][data-id="${idTe}"]`); await page.waitForSelector('#shAccion:not([hidden])');
  log('la ficha de un artículo sin existencias no ofrece «Salida» ni «Trasladar» (sí «Entrada», «Editar» y «Crear en otra bodega»)', await page.evaluate(() => !document.querySelector('#acCampos [data-accion="salida"]') && !document.querySelector('#acCampos [data-accion="trasladar"]') && !!document.querySelector('#acCampos [data-accion="entrada"]') && !!document.querySelector('#acCampos [data-accion="editart"]') && !!document.querySelector('#acCampos [data-accion="copiaart"]')));
  await page.keyboard.press('Escape');
  log('cerrar la ficha (solo ver) NO pregunta «¿Salir sin guardar?»', await hasta(page, () => document.getElementById('shAccion').hidden && document.getElementById('shConfirmar').hidden));
  // Crear en otra bodega
  await page.click(`#invContenido [data-accion="verart"][data-id="${idTe}"]`); await page.waitForSelector('#shAccion:not([hidden])');
  await page.click('#acCampos [data-accion="copiaart"]');
  log('«Crear en otra bodega» abre el formulario con los datos copiados y solo las bodegas donde falta', await hasta(page, () => document.getElementById('acNom').value === 'Té de prueba' && document.getElementById('acCosto').value === '8000' && [...document.getElementById('acBod').options].map(o => o.value).join() === 'Riohacha,Bogotá'));
  await page.selectOption('#acBod', 'Bogotá'); await page.click('#acPrimario');
  log('se crea el mismo artículo en Bogotá con sus datos y 0 en bodega', await hasta(page, () => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).articulos).some(a => a.nombre === 'Té de prueba' && a.bodega === 'Bogotá' && a.cantidad === 0 && a.costo === 8000 && a.minimo === 1 && a.maximo === 5)));
  // Editar: solo se manda lo que cambió y se avisa si cambia la unidad
  await page.click(`#invContenido [data-accion="verart"][data-id="${idTe}"]`); await page.waitForSelector('#shAccion:not([hidden])');
  await page.click('#acCampos [data-accion="editart"]'); await page.waitForSelector('#acNom');
  await page.selectOption('#acUni', 'cajas');
  log('al cambiar la unidad avisa que no convierte la cantidad', await hasta(page, () => !document.getElementById('acUniAy').hidden && /NO convierte la cantidad/.test(document.getElementById('acUniAy').textContent)));
  await page.selectOption('#acUni', 'unidades');
  await page.evaluate(id => { const d = JSON.parse(localStorage.getItem('__fb_datos')); d.articulos[id].ubicacion = 'Estante Z9'; d.articulos[id].proveedor = 'Otro proveedor'; localStorage.setItem('__fb_datos', JSON.stringify(d)); }, idTe);
  await refrescar();
  await page.fill('#acMin', '2'); await page.click('#acPrimario');
  log('al guardar solo se cambia el mínimo: la ubicación y el proveedor que puso otra persona NO se pisan', await hasta(page, id => { const a = JSON.parse(localStorage.getItem('__fb_datos')).articulos[id]; return a.minimo === 2 && a.ubicacion === 'Estante Z9' && a.proveedor === 'Otro proveedor'; }, idTe));
  await page.click(`#invContenido [data-accion="verart"][data-id="${idTe}"]`); await page.waitForSelector('#shAccion:not([hidden])');
  await page.click('#acCampos [data-accion="editart"]'); await page.waitForSelector('#acNom'); await page.click('#acPrimario');
  log('guardar sin cambiar nada dice «No cambiaste nada» y no escribe', await hasta(page, () => /No cambiaste nada/.test(document.getElementById('toast').textContent)));
  // Eliminar (Jefe)
  log('cambia a la Jefe', await cambiar('jefe'));
  await page.click('.tab[data-vista="inventario"]'); await page.click('#invSecciones [data-sec="existencias"]'); await page.fill('#qInventario', 'Té de prueba');
  await page.click(`#invContenido [data-accion="verart"][data-id="${idTe}"]`); await page.waitForSelector('#shAccion:not([hidden])');
  log('la Jefe ve «Eliminar artículo» en la ficha', await visible(page, '#acCampos [data-accion="eliminarart"]'));
  await page.click('#acCampos [data-accion="eliminarart"]');
  log('pide confirmar antes de eliminar y dice que no se puede deshacer', await hasta(page, () => !document.getElementById('shConfirmar').hidden && /No se puede deshacer/.test(document.getElementById('cfTxt').textContent)));
  await page.click('#cfSi');
  log('al confirmar el artículo se elimina (sus movimientos quedan)', await hasta(page, id => !JSON.parse(localStorage.getItem('__fb_datos')).articulos[id], idTe));
  // Un artículo con compra en curso no se elimina
  const idCompraArt = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')); const c = Object.values(d.compras).find(x => ['pedido', 'autorizado', 'por-gerente', 'comprado'].includes(x.estado) && x.articuloId); return c ? c.articuloId : ''; });
  if (idCompraArt) {
    await page.fill('#qInventario', ''); await page.click('#invSecciones [data-sec="existencias"]'); await page.click('#invContenido .chips.sub [data-val="todas"]').catch(() => {});
    await page.click(`#invContenido [data-accion="verart"][data-id="${idCompraArt}"]`); await page.waitForSelector('#shAccion:not([hidden])');
    await page.click('#acCampos [data-accion="eliminarart"]');
    log('un artículo con compra en curso no se puede eliminar: lo dice y no pregunta', await hasta(page, () => /compra en curso/.test(document.getElementById('toast').textContent)) && await page.evaluate(() => document.getElementById('shConfirmar').hidden));
    await page.keyboard.press('Escape'); await hasta(page, () => document.getElementById('shAccion').hidden);
  }

  // --- 3.2 Movimientos, Conteo, Resumen, Panorama ---
  const hoyD = new Date(), ultimoMesPasado = new Date(hoyD.getFullYear(), hoyD.getMonth(), 0, 20, 0, 0);   // el último día del mes pasado, 8 p. m. (hora local = ya es el mes nuevo en hora universal)
  const salidaBase = { articuloId: 'ar-001', articulo: 'Botas de seguridad', tipo: 'salida', motivo: 'entrega', cantidad: 1, saldo: 5, persona: 'Prueba', proyecto: '', nota: '', por: 'Prueba', porRol: 'asistente', bodega: 'Riohacha', costoUnit: 100000, valor: 100000, valorSaldo: 0 };
  const salidoMes = () => page.evaluate(() => { const c = [...document.querySelectorAll('#invContenido .card')].find(x => /Salió de bodega este mes/.test(x.textContent)); return c ? c.querySelector('.rm-n').textContent : ''; });
  await page.click('#invSecciones [data-sec="resumen"]'); await hasta(page, () => /Salió de bodega este mes/.test(document.getElementById('invContenido').textContent));
  const antesSal = await salidoMes();
  await inyectar([['set', 'movimientos', 'mo-prueba-traslado', Object.assign({}, salidaBase, { motivo: 'traslado', cantidad: 9, valor: 9000000, bodegaOtra: 'Guamal', fecha: new Date().toISOString() })],
    ['set', 'movimientos', 'mo-prueba-finmes', Object.assign({}, salidaBase, { valor: 777000, fecha: ultimoMesPasado.toISOString() })]]);
  await esp(500); await page.click('#invSecciones [data-sec="movimientos"]'); await page.click('#invSecciones [data-sec="resumen"]');
  log('un traslado entre bodegas ($ 9.000.000) NO suma a «Salió de bodega este mes»', await hasta(page, a => /Salió de bodega este mes/.test(document.getElementById('invContenido').textContent), antesSal) && (await salidoMes()) === antesSal, `${antesSal} → ${await salidoMes()}`);
  log('y una salida del último día del mes pasado a las 8 p. m. (hora de Colombia) tampoco cuenta como de este mes', (await salidoMes()) === antesSal);
  await inyectar([['set', 'movimientos', 'mo-prueba-ajuste', Object.assign({}, salidaBase, { tipo: 'ajuste', motivo: 'conteo', cantidad: -3, valor: 300000, fecha: new Date().toISOString() })]]);
  await page.click('#invSecciones [data-sec="movimientos"]'); await esp(400);
  log('en Movimientos un ajuste que resta se ve con «-3» (antes salía «3»)', await hasta(page, () => [...document.querySelectorAll('#invContenido .card.mov')].some(c => /Botas de seguridad/.test(c.textContent) && c.querySelector('.mov-n').textContent === '-3')));
  await inyectar([['borrar', 'movimientos', 'mo-prueba-traslado'], ['borrar', 'movimientos', 'mo-prueba-finmes'], ['borrar', 'movimientos', 'mo-prueba-ajuste']]);
  // «Te toca contar hoy»: hasta 10 por bodega
  const doce = Array.from({ length: 12 }, (_, i) => ['set', 'articulos', 'ar-prueba-g' + i, { nombre: 'Artículo de prueba G' + i, codigo: '', categoria: 'Otro', unidad: 'unidades', cantidad: 3, minimo: 1, maximo: 9, ubicacion: '', costo: 1000, proveedor: '', bodega: 'Guamal' }]);
  await inyectar(doce); await esp(400);
  log('cambia a Bodega', await cambiar('asistente'));
  await page.click('.tab[data-vista="inventario"]'); await page.click('#invSecciones [data-sec="conteo"]');
  log('«Te toca contar hoy» da hasta 10 de CADA bodega (Guamal: 10 aunque haya 12 atrasados)', await hasta(page, () => [...document.querySelectorAll('#invContenido [data-accion="contarhoy"]')].some(b => /Contar en Guamal \(10\)/.test(b.textContent))), await page.evaluate(() => [...document.querySelectorAll('#invContenido [data-accion="contarhoy"]')].map(b => b.textContent).join(' | ')));
  await inyectar(doce.map(o => ['borrar', 'articulos', o[2]]));
  // Conteo por categoría: guarda solo lo contado y deja el borrador de otras categorías
  await page.evaluate(() => localStorage.setItem('conteo.Riohacha', JSON.stringify({ vals: { 'ar-fantasma': '4' }, en: new Date().toISOString() })));
  await page.click('#invContenido [data-accion="conteo"]'); await page.waitForSelector('#shAccion:not([hidden])');
  await page.selectOption('#acBod', 'Riohacha');
  const cat = await page.evaluate(() => { const d = Object.values(JSON.parse(localStorage.getItem('__fb_datos')).articulos).filter(a => a.bodega === 'Riohacha'); return d[0].categoria; });
  await page.selectOption('#acCat', cat); await page.click('#acPrimario');
  const idsCat = await page.evaluate(() => [...document.querySelectorAll('#acCampos input[data-art]')].map(i => i.dataset.art));
  const cant0 = await page.evaluate(id => window.App.S.datos.articulos.find(a => a.id === id).cantidad, idsCat[0]);
  await page.fill('#cn-' + idsCat[0], String(cant0)); await page.click('#acPrimario'); await hasta(page, () => !!document.querySelector('#acCampos [data-accion="volverconteo"]'));
  await page.click('#acPrimario');
  log('al guardar un conteo por categoría, lo escrito de otras categorías en el borrador NO se borra', await hasta(page, () => document.getElementById('shAccion').hidden) && await page.evaluate(() => { const j = JSON.parse(localStorage.getItem('conteo.Riohacha') || 'null'); return !!j && j.vals['ar-fantasma'] === '4'; }));
  await page.evaluate(() => localStorage.removeItem('conteo.Riohacha'));
  // Tarjetas de «Cómo está cada bodega»
  log('cambia a la Jefe', await cambiar('jefe'));
  await page.click('.tab[data-vista="inventario"]'); await page.click('#invSecciones [data-sec="resumen"]');
  await hasta(page, () => !!document.querySelector('#invContenido .card-bodega'));
  log('las tarjetas «Cómo está cada bodega» se pueden tocar (son botones)', await page.evaluate(() => [...document.querySelectorAll('#invContenido .card-bodega')].every(c => c.getAttribute('role') === 'button' && c.tabIndex === 0)));
  await page.click('#invContenido .card-bodega[data-bodega="Bogotá"]');
  log('tocar la de Bogotá abre Existencias filtradas por Bogotá', await hasta(page, () => document.querySelector('#invSecciones [data-sec="existencias"][aria-pressed="true"]') && document.querySelector('#invContenido .chips.sub [data-val="Bogotá"][aria-pressed="true"]') && [...document.querySelectorAll('#invContenido .card.art, #invContenido tbody tr')].length > 0));
  await page.click('#invContenido .chips.sub [data-val="todas"]');

  // --- 3.3 Compras ---
  log('cambia a Fredy (Compras)', await cambiar('compras'));
  await page.click('.tab[data-vista="inventario"]');
  await page.click('#btnPedirCompra'); await page.waitForSelector('#shAccion:not([hidden])');
  await page.click('#acCampos [data-accion="masLinea"]');
  await page.selectOption('#lxVa0', 'si'); await page.selectOption('#lxArt0', '__nuevo');
  log('un artículo nuevo en la línea 2 deja escoger su bodega, su unidad y su categoría', await hasta(page, () => ['lxBod0', 'lxUni0', 'lxCat0'].every(i => document.getElementById(i) && document.getElementById(i).offsetParent !== null)));
  await page.fill('#acQue', 'Resma de papel'); await page.fill('#acValor', '10000'); await page.fill('#acPara', 'Para imprimir');
  const unidadDe = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).articulos).find(a => a.bodega === 'Riohacha' && a.unidad !== 'cajas'));
  await page.fill('#lxQue0', unidadDe.nombre); await page.fill('#lxVal0', '5000');
  await page.selectOption('#lxBod0', 'Riohacha'); await page.selectOption('#lxUni0', 'cajas'); await page.selectOption('#lxCat0', 'Papelería');
  await page.click('#acPrimario');
  log('un artículo nuevo con el mismo nombre de uno que ya hay en esa bodega (aunque sea en otra unidad) se rechaza', await acErr() && /Ya existe «/.test(await texto(page, '#acErr')), await texto(page, '#acErr'));
  await page.fill('#lxQue0', 'Carpetas de prueba'); await page.click('#acPrimario');
  log('con un nombre nuevo se guarda: la línea lleva la unidad y la categoría escogidas', await hasta(page, () => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).compras).some(c => Array.isArray(c.lineas) && c.lineas.some(l => l.que === 'Carpetas de prueba' && l.unidad === 'cajas' && l.categoria === 'Papelería' && l.nuevo === true))));
  // Recibir: con 0 en todo no cierra; con más de lo comprado pide confirmar
  const arts2 = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).articulos).slice(0, 2).map(a => Object.keys(JSON.parse(localStorage.getItem('__fb_datos')).articulos).find(k => JSON.parse(localStorage.getItem('__fb_datos')).articulos[k] === a)));
  await inyectar([['set', 'compras', 'co-prueba-varios', { que: 'Dos artículos y más', cantidad: 5, unidad: 'artículos', categoria: 'Otro', valorAprox: 20000, paraQue: 'Prueba', proyecto: '', proveedorSug: 'Proveedor Sugerido SA', pide: 'Fredy Torres', pideRol: 'compras', autoriza: 'X', autorizaJefe: '', estado: 'comprado', proveedor: 'Papelería Prueba', valorReal: 20000, fechaPedido: '2026-11-01', fechaCompra: '2026-11-05', entregadoA: '', motivoRechazo: '', articuloId: '', factura: '', revisada: false,
    lineas: [{ que: 'A', cantidad: 2, unidad: 'unidades', valor: 8000, articuloId: arts2[0], bodega: '' }, { que: 'B', cantidad: 3, unidad: 'unidades', valor: 12000, articuloId: arts2[1], bodega: '' }], cotizaciones: [], historial: [{ fecha: new Date().toISOString(), texto: 'Compró', por: 'Fredy Torres' }] }]]);
  await cerrarHoja();
  log('cambia a Bodega', await cambiar('asistente'));
  await page.click('.tab[data-vista="inventario"]'); await page.click('#invSecciones [data-sec="compras"]');
  await page.click('#invContenido [data-accion="vercompra"][data-id="co-prueba-varios"]').catch(async () => { await page.click('#invContenido .card[data-id="co-prueba-varios"]'); });
  await page.waitForSelector('#shAccion:not([hidden])');
  log('una compra recibida o por recibir se puede imprimir como orden (también la ya recibida: ver más abajo)', await visible(page, '#acCampos [data-accion="recibir"]'));
  await page.click('#acCampos [data-accion="recibir"]'); await page.waitForSelector('#rl0');
  await page.fill('#rl0', '0'); await page.fill('#rl1', '0'); await page.click('#acPrimario');
  log('recibir con 0 en todos los artículos no cierra la compra y lo explica', await acErr() && /0 en todos los artículos/.test(await texto(page, '#acErr')));
  await page.fill('#rl0', '5'); await page.fill('#rl1', '3'); await page.click('#acPrimario');
  log('si llega más de lo comprado (5 de 2) avisa y hay que confirmar con otro toque', await hasta(page, () => /Llegó más de lo comprado/.test(document.getElementById('acErr').textContent)) && await page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos')).compras['co-prueba-varios'].estado === 'comprado'));
  await page.click('#acPrimario');
  log('al tocar otra vez con los mismos números, se recibe', await hasta(page, () => JSON.parse(localStorage.getItem('__fb_datos')).compras['co-prueba-varios'].estado === 'recibido'));
  // Registrar compra: el proveedor sugerido sale escrito
  await inyectar([['set', 'compras', 'co-prueba-sug', { que: 'Cosa sugerida', cantidad: 1, unidad: 'unidades', categoria: 'Otro', valorAprox: 10000, paraQue: 'Prueba', proyecto: '', proveedorSug: 'Ferretería Sugerida', pide: 'Luis', pideRol: 'colaborador', autoriza: 'X', autorizaJefe: '', estado: 'autorizado', proveedor: '', valorReal: 0, fechaPedido: '2026-11-20', fechaCompra: '', entregadoA: '', motivoRechazo: '', articuloId: '', factura: '', revisada: false, lineas: [{ que: 'Cosa sugerida', cantidad: 1, unidad: 'unidades', valor: 10000, articuloId: '', bodega: '' }], cotizaciones: [], historial: [] }]]);
  log('cambia a Fredy (Compras)', await cambiar('compras'));
  await page.click('.tab[data-vista="inventario"]'); await page.click('#invSecciones [data-sec="hacer"]');
  await page.click('#invContenido [data-accion="comprar"][data-id="co-prueba-sug"]'); await page.waitForSelector('#acProv');
  log('«Registrar compra» ya trae escrito el proveedor que se sugirió al pedirla', await page.evaluate(() => document.getElementById('acProv').value === 'Ferretería Sugerida'));
  await cerrarHoja();
  // NIT sin guion
  await page.click('#invSecciones [data-sec="proveedores"]'); await page.click('#invContenido [data-accion="nuevoprov"]').catch(() => {});
  const dv = await page.evaluate(() => { const P = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71], b = '900000123', sum = b.split('').reverse().reduce((t, c, i) => t + Number(c) * P[i], 0), r = sum % 11; return r > 1 ? 11 - r : r; });
  if (await page.evaluate(() => !!document.getElementById('pvNit'))) {
    log('el NIT trae teclado de teléfono (con guion) para el iPhone', await page.evaluate(() => document.getElementById('pvNit').getAttribute('inputmode') === 'tel'));
    await page.fill('#pvNit', '900000123' + dv); await page.dispatchEvent('#pvNit', 'change');
    log('un NIT escrito sin guion pero con su dígito de verificación correcto se arregla solo', await page.evaluate(d => document.getElementById('pvNit').value === `900000123-${d}`, dv));
    await cerrarHoja();
  } else log('el formulario de proveedor abre (no se pudo abrir en la prueba)', false);
  // «Lo mío» por cuenta (pideUid), no solo por nombre
  const mios0 = await page.evaluate(() => window.Inventario.resumen('compras').misPedidos);
  await inyectar([['set', 'compras', 'co-prueba-otro', { que: 'Compra de un tocayo', cantidad: 1, unidad: 'unidades', categoria: 'Otro', valorAprox: 1000, paraQue: 'Prueba', pide: 'x', pideRol: 'compras', pideUid: 'otra-cuenta-distinta', estado: 'pedido', fechaPedido: '2026-11-20', lineas: [], cotizaciones: [], historial: [] }]]);
  await page.evaluate(n => { const d = JSON.parse(localStorage.getItem('__fb_datos')); d.compras['co-prueba-otro'].pide = window.App.S.persona.nombre; localStorage.setItem('__fb_datos', JSON.stringify(d)); }, 0);
  await refrescar();
  log('una compra de otra cuenta que tiene el mismo nombre NO cuenta como «tuya»', await page.evaluate(n => window.Inventario.resumen('compras').misPedidos === n, mios0), await page.evaluate(() => 'misPedidos ' + window.Inventario.resumen('compras').misPedidos));
  await inyectar([['borrar', 'compras', 'co-prueba-otro'], ['borrar', 'compras', 'co-prueba-sug']]);

  // --- Orden de compra: se puede imprimir también la ya recibida, con su fecha real y el NIT del proveedor ---
  await inyectar([['set', 'compras', 'co-prueba-oc', { que: 'Cosa para la orden', cantidad: 2, unidad: 'unidades', categoria: 'Otro', valorAprox: 20000, paraQue: 'Prueba', proyecto: '', pide: 'Luis', pideRol: 'colaborador', autoriza: 'X', autorizaJefe: '', estado: 'recibido', proveedor: 'Ferretería El Faro', valorReal: 20000, fechaPedido: '2026-10-10', fechaCompra: '2026-10-12', entregadoA: 'Luis', motivoRechazo: '', articuloId: '', factura: '', revisada: false, lineas: [{ que: 'Cosa para la orden', cantidad: 2, unidad: 'unidades', valor: 20000, articuloId: '', bodega: '' }], cotizaciones: [], historial: [] }]]);
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('#invSecciones [data-sec="compras"]'); await page.click('#invContenido .chips.sub [data-val="todas"]').catch(() => {});
  await page.click('#invContenido [data-accion="vercompra"][data-id="co-prueba-oc"]').catch(async () => { await page.click('#invContenido .card[data-id="co-prueba-oc"]'); });
  await page.waitForSelector('#shAccion:not([hidden])');
  log('una compra ya recibida también ofrece «Orden de compra (imprimir o PDF)»', await visible(page, '#acCampos [data-accion="imprimirorden"]'));
  await page.click('#acCampos [data-accion="imprimirorden"]');
  const oc = await page.evaluate(() => { const d = document.getElementById('ordenDoc'); return d ? d.textContent : ''; });
  const nitFaro = await page.evaluate(() => (JSON.parse(localStorage.getItem('__fb_datos')).proveedores['pv-ferreteria'] || Object.values(JSON.parse(localStorage.getItem('__fb_datos')).proveedores).find(p => p.nombre === 'Ferretería El Faro') || {}).nit);
  log('la orden trae la fecha real de la compra (12 de octubre) y no la de hoy', /12/.test(oc) && /oct/i.test(oc), oc.slice(0, 200));
  log('y el NIT del proveedor', !!nitFaro && oc.includes('NIT ' + nitFaro), oc.slice(0, 260));
  await page.evaluate(() => { const c = document.getElementById('impresion'); if (c) c.remove(); document.body.classList.remove('imprimiendo'); });
  await cerrarHoja();
  await inyectar([['borrar', 'compras', 'co-prueba-oc']]);

  // --- 3.4 Excel de bodega y de compras ---
  const leerXlsx = ruta => page.evaluate(async b64 => {
    const E = await window.Excel.cargar(), wb = new E.Workbook();
    await wb.xlsx.load(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer);
    return wb.worksheets.map(ws => { const enc = ws.getRow(4), titulos = []; enc.eachCell(c => titulos.push(String(c.value))); const f = ws.getRow(5), celdas = []; for (let j = 1; j <= titulos.length; j++) { const v = f.getCell(j).value; celdas.push(v && typeof v === 'object' && v.formula ? '=' + v.formula : v == null ? '' : String(v)); } return { nombre: ws.name, titulos, celdas }; });
  }, fs.readFileSync(ruta).toString('base64'));
  const xlsxHoja = (hoja, filas, ruta) => page.evaluate(async ([h, f]) => { const X = await window.Inventario.cargarXlsx(), l = X.utils.book_new(); X.utils.book_append_sheet(l, X.utils.json_to_sheet(f), h); return X.write(l, { type: 'base64', bookType: 'xlsx' }); }, [hoja, filas]).then(b => fs.writeFileSync(ruta, Buffer.from(b, 'base64')));
  log('cambia a Bodega', await cambiar('asistente'));
  await page.click('.tab[data-vista="inventario"]'); await page.click('#invSecciones [data-sec="existencias"]'); await page.click('#invContenido .chips.sub [data-val="todas"]').catch(() => {});
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#invContenido [data-accion="bdexcel"]')]);
  const rutaB = path.join(TMP, 'mejoras-bodega.xlsx'); await dl.saveAs(rutaB);
  const hb = (await leerXlsx(rutaB)).find(h => h.nombre === 'Bodega');
  log('la base de datos de Bodega trae la columna «Código» (de barras) después de «Artículo», aparte del ID', !!hb && hb.titulos.slice(0, 5).join() === 'ID,Acción,Bodega,Artículo,Código', hb && hb.titulos.join());
  const fE = hb ? hb.celdas[hb.titulos.indexOf('Estado')] : '', fV = hb ? hb.celdas[hb.titulos.indexOf('Valor en bodega')] : '';
  log('Estado y Valor en bodega se calculan con la «Cantidad real (conteo)» si está escrita (y si no, con la de hoy)', /I\d+<>""/.test(fE) && /I\d+<>""/.test(fV) && /H\d+/.test(fE), fE + ' || ' + fV);
  const rutaBu = path.join(TMP, 'mejoras-bodega-sube.xlsx');
  const art1 = await page.evaluate(() => { const a = JSON.parse(localStorage.getItem('__fb_datos')).articulos['ar-001']; return { nombre: a.nombre, codigo: a.codigo, cantidad: a.cantidad }; });
  await xlsxHoja('Bodega', [
    { ID: 'ar-001', 'Cantidad real (conteo)': -4 },
    { ID: 'ar-002', Código: 'bot-099' },
    { Bodega: 'Riohacha', Artículo: art1.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase() + '  ', Categoría: 'EPP', Unidad: 'unidades', Mínimo: 1, Máximo: 5, 'Precio aprox.': 1000 },
    { Bodega: 'Riohacha', Artículo: 'Artículo con código repetido', Código: 'CHA001', Categoría: 'EPP', Unidad: 'unidades', Mínimo: 1, Máximo: 5, 'Precio aprox.': 1000 },
    { Bodega: 'Riohacha', Artículo: 'Artículo con código malo', Código: 'a b', Categoría: 'EPP', Unidad: 'unidades', Mínimo: 1, Máximo: 5, 'Precio aprox.': 1000 }
  ], rutaBu);
  await page.setInputFiles('#invArchivo', rutaBu);
  await hasta(page, () => /Esto entendí del Excel/.test(document.getElementById('invContenido').textContent));
  const txtEx = await texto(page, '#invContenido');
  log('una cantidad real negativa (-4) se rechaza', /Fila 2[\s\S]{0,200}cantidad real debe ser un número entero, 0 o más/.test(txtEx), txtEx.slice(0, 400));
  log('la columna «Código» cambia el código de barras (BOT-099 → BOT099), no el ID', /Código: BOT042 → BOT099/.test(txtEx), txtEx.slice(0, 500));
  log('un artículo nuevo con el mismo nombre sin tildes, en mayúsculas y con espacios de más se rechaza como repetido', /Ya hay un artículo con ese nombre en la bodega de Riohacha/.test(txtEx));
  log('un código que ya tiene otro artículo de la bodega se rechaza, y uno con espacios («a b») no sirve', /El código CHA001 ya lo tiene otro artículo/.test(txtEx) && /no sirve: lleva de 3 a 30 letras o números/.test(txtEx));
  log('el campo de archivo queda vacío (se puede volver a subir el mismo Excel)', await page.evaluate(() => { const i = document.getElementById('invArchivo'); return !i || i.value === ''; }));
  await page.click('#invContenido [data-accion="exdescartar"]').catch(() => {});
  // Excel de Compras: la misma fila subida dos veces no pide la compra dos veces
  const rutaC = path.join(TMP, 'mejoras-compras.xlsx');
  await xlsxHoja('Compras', [{ Qué: 'Resmas de prueba Excel', Cantidad: 5, Unidad: 'resmas', Categoría: 'Papelería', 'Valor total': 140000, 'Para qué': 'Imprimir listas' },
    { Qué: 'Resmas de prueba excel', Cantidad: 5, Unidad: 'resmas', Categoría: 'Papelería', 'Valor total': 140000, 'Para qué': 'Imprimir listas' }], rutaC);
  await page.click('#invSecciones [data-sec="compras"]');
  await page.setInputFiles('#invContenido input[data-xbd-archivo="compras"]', rutaC);
  await hasta(page, () => /Esto entendí del Excel/.test(document.getElementById('invContenido').textContent));
  log('dos filas iguales en el mismo Excel de compras: la segunda se rechaza («Es igual a la fila 2»)', /Es igual a la fila 2/.test(await texto(page, '#invContenido')), (await texto(page, '#invContenido')).slice(0, 300));
  await xlsxHoja('Compras', [{ Qué: 'Resmas de prueba Excel', Cantidad: 5, Unidad: 'resmas', Categoría: 'Papelería', 'Valor total': 140000, 'Para qué': 'Imprimir listas' }], rutaC);
  await page.setInputFiles('#invContenido input[data-xbd-archivo="compras"]', rutaC);
  await hasta(page, () => /1 para agregar/.test(document.getElementById('invContenido').textContent));
  await page.click('#invContenido [data-xbd="guardar"]');
  log('la compra del Excel se guarda', await hasta(page, () => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).compras).some(c => c.que === 'Resmas de prueba Excel')));
  await page.setInputFiles('#invContenido input[data-xbd-archivo="compras"]', rutaC);
  await hasta(page, () => /Esto entendí del Excel/.test(document.getElementById('invContenido').textContent));
  log('volver a subir el mismo archivo no vuelve a pedir la misma compra: sale «Ya pediste esta misma compra»', /Ya pediste esta misma compra/.test(await texto(page, '#invContenido')), (await texto(page, '#invContenido')).slice(0, 300));
  await page.click('#invContenido [data-xbd="descartar"]').catch(() => {});
  // seguro(): un texto que empieza con espacios o tabulador y luego = + - @ también se protege
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.evaluate(() => window.Excel.descargar({ archivo: 'seguro', hojas: [window.Excel.deObjetos('H', 'T', 's', [{ A: '  =SUMA(1)', B: '\t+1', C: '=2+2', D: 'normal' }])] }))]);
  const rutaS = path.join(TMP, 'mejoras-seguro.xlsx'); await dl2.saveAs(rutaS);
  const hs = (await leerXlsx(rutaS))[0];
  log('en el Excel, «  =SUMA(1)», «tab +1» y «=2+2» salen como texto (con apóstrofo), no como fórmula; «normal» queda igual', hs.celdas[0].startsWith("'") && hs.celdas[1].startsWith("'") && hs.celdas[2].startsWith("'") && hs.celdas[3] === 'normal', JSON.stringify(hs.celdas));

  // --- Permisos delegados: Inicio y la campana siguen el NIVEL de la persona, no solo su rol ---
  log('cambia a Luisa (Logística, que solo pide material)', await cambiar('logistica'));
  const nivelInicio = async nivel => {
    await page.evaluate(n => { const p = window.App.S.persona; window.App.S.persona = Object.assign({}, p, { permisos: Object.assign({}, p.permisos, { inventario: n }) }); window.App.pintarTodo(); }, nivel);
    await page.click('.tab[data-vista="inicio"]'); await esp(500);
    return page.evaluate(() => [...document.querySelectorAll('#sumInicio .sum')].map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  };
  const comoPide = await nivelInicio('pide');
  log('con nivel «pide», Inicio no muestra cifras de compras en curso ni sin autorizar', !/Compras en curso|Compras sin autorizar/.test(comoPide), comoPide);
  const comoCoordina = await nivelInicio('coordina');
  log('si la Jefe le sube el nivel a «coordina», Inicio le muestra «Compras en curso» y «Compras sin autorizar»', /Compras en curso/.test(comoCoordina) && /Compras sin autorizar/.test(comoCoordina), comoCoordina);
  await inyectar([['set', 'avisos', 'av-prueba-coord', { para: 'coordcompras', titulo: 'Compra por autorizar (prueba)', texto: 'Aviso para quien coordina', en: new Date().toISOString(), modulo: 'inventario', leido: {}, deUid: 'otro' }]]);
  await refrescar();
  const campana = await page.evaluate(() => (window.App.S.persona.rol === 'logistica') && document.getElementById('badgeAvisos').textContent.trim());
  log('y la campana le trae los avisos del Coordinador de compras (antes solo los recibía quien tenía ese rol)', Number(campana) >= 1, 'campana: ' + campana);
  await inyectar([['borrar', 'avisos', 'av-prueba-coord']]);
  await nivelInicio('pide');

  /* ================= FASE 4 ================= */
  console.log('Fase 4: equipos, carros, reuniones y avisos');
  const cerrarEq = async () => { await page.keyboard.press('Escape'); await hasta(page, () => document.getElementById('shEq').hidden || !document.getElementById('shConfirmar').hidden); if (!(await page.evaluate(() => document.getElementById('shConfirmar').hidden))) await page.click('#cfSi'); await hasta(page, () => document.getElementById('shEq').hidden); };
  const errEq = () => hasta(page, () => !document.getElementById('eqErr').hidden && document.getElementById('eqErr').textContent.length > 3);
  // --- Equipos: verificación con avance guardado, ×, fuera de alcance ---
  log('cambia a la Jefe', await cambiar('jefe'));
  await page.click('.tab[data-vista="equipos"]'); await page.click('#eqSecciones [data-sec="hacer"]').catch(() => {});
  await page.evaluate(() => localStorage.removeItem('equipos.verificacion'));
  await page.click('#eqContenido [data-accion="verificar"]'); await page.waitForSelector('#shEq:not([hidden])');
  await page.fill('#evSerial', 'DEMO-0007'); await page.click('#eqCampos [data-accion="veragregar"]');
  await page.fill('#evSerial', 'DEMO-0001'); await page.click('#eqCampos [data-accion="veragregar"]');
  log('un equipo asignado, cuando se escogió «los de bodega», se anota pero avisa que está fuera de lo que se iba a revisar', await hasta(page, () => /no está en lo que escogiste revisar/.test(document.getElementById('toast').textContent)) && await page.evaluate(() => /fuera de lo que escogiste/.test(document.getElementById('evLista').textContent)));
  log('el avance queda guardado en el teléfono', await page.evaluate(() => { const j = JSON.parse(localStorage.getItem('equipos.verificacion') || 'null'); return !!j && j.ids.length === 2; }));
  await cerrarEq();
  await page.click('#eqContenido [data-accion="verificar"]'); await page.waitForSelector('#shEq:not([hidden])');
  log('al volver a abrir «Verificar equipos» sigue donde iba (2 verificados) y lo dice', await hasta(page, () => /Sigues donde ibas: ya llevas 2/.test(document.getElementById('eqCampos').textContent) && /Verificados 2 ·/.test(document.getElementById('evLista').textContent)));
  await page.click('#evLista [data-accion="verquitar"]');
  log('la × quita un equipo de los verificados (queda 1) y se guarda', await hasta(page, () => /Verificados 1 ·/.test(document.getElementById('evLista').textContent)) && await page.evaluate(() => JSON.parse(localStorage.getItem('equipos.verificacion')).ids.length === 1));
  await page.click('#eqPrimario');
  log('al guardar la verificación se borra el avance guardado', await hasta(page, () => document.getElementById('shEq').hidden) && await page.evaluate(() => localStorage.getItem('equipos.verificacion') === null));
  // Más de 400 equipos se guardan en varios lotes
  await inyectar(Array.from({ length: 450 }, (_, i) => ['set', 'equipos', 'eq-masivo-' + i, { serial: 'MAS' + String(i).padStart(4, '0'), tipo: 'Portátil', marca: 'X', modelo: 'Y', estado: 'bodega', asignadoA: '', asignadoCedula: '', proyecto: '', pendientes: { mtto: false, backup: false }, historial: [] }]));
  await esp(600);
  await page.click('#eqContenido [data-accion="verificar"]'); await page.waitForSelector('#shEq:not([hidden])');
  await page.selectOption('#evAlcance', 'todos');
  await page.evaluate(() => { const ids = window.App.S.datos.equipos.filter(e => e.id.startsWith('eq-masivo-')).map(e => e.serial); window.__ids = ids; });
  const ant = await lotesHechos();
  await page.evaluate(async () => { for (const sr of window.__ids) { const c = document.querySelector('#evSerial'); c.value = sr; document.querySelector('#eqCampos [data-accion="veragregar"]').click(); } });
  await hasta(page, () => /Verificados 450 ·/.test(document.getElementById('evLista').textContent), null, 9000);
  await page.click('#eqPrimario');
  log('verificar 450 equipos de una vez se guarda sin fallar (en 2 lotes de hasta 400)', await hasta(page, () => document.getElementById('shEq').hidden, null, 12000) && (await lotesHechos()) - ant === 2, 'lotes: ' + ((await lotesHechos()) - ant));
  await inyectar(Array.from({ length: 450 }, (_, i) => ['borrar', 'equipos', 'eq-masivo-' + i]));
  // --- Equipos: acta con más de 20 equipos, corregir acta ---
  log('cambia a Daniel (Encargado de equipos)', await cambiar('equipos'));
  await page.click('.tab[data-vista="equipos"]');
  await inyectar(Array.from({ length: 22 }, (_, i) => ['set', 'equipos', 'eq-v20-' + i, { serial: 'VEI' + String(i).padStart(4, '0'), tipo: 'Portátil', marca: 'X', modelo: 'Y', estado: 'bodega', asignadoA: '', asignadoCedula: '', proyecto: '', pendientes: { mtto: false, backup: false }, historial: [] }]));
  await esp(500);
  await page.click('#btnEntregar'); await page.waitForSelector('#shEq:not([hidden])');
  await page.fill('#ehPersona', 'Persona Muchos Equipos'); await page.fill('#ehCedula', '1099887766');
  await page.evaluate(() => { for (let i = 0; i < 21; i++) { const c = document.getElementById('ehEq_eq-v20-' + i); if (c) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } } });
  await page.evaluate(() => document.querySelector('#ehFirmaP').scrollIntoView({ block: 'center' })); await esp(150);
  const bb = await page.locator('#ehFirmaP').boundingBox(); await page.mouse.move(bb.x + 20, bb.y + 40); await page.mouse.down(); for (let k = 1; k <= 12; k++) await page.mouse.move(bb.x + 20 + k * 20, bb.y + 40 + Math.sin(k) * 10); await page.mouse.up();
  await page.click('#eqPrimario');
  log('un acta con 21 equipos no se guarda: dice que el máximo es 20', await errEq() && /hasta 20 equipos/.test(await texto(page, '#eqErr')), await texto(page, '#eqErr'));
  await cerrarEq();
  await inyectar(Array.from({ length: 22 }, (_, i) => ['borrar', 'equipos', 'eq-v20-' + i]));
  // Corregir acta con proyecto personalizado
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')); d.hojas.ac3.proyecto = 'Proyecto Personalizado Z'; d.hojas.ac3.revision = 'problema'; d.hojas.ac3.notaRevision = 'La cédula no coincide'; localStorage.setItem('__fb_datos', JSON.stringify(d)); });
  await refrescar();
  await page.click('#eqContenido [data-accion="corregir"][data-id="ac3"]').catch(async () => { await page.click('#eqSecciones [data-sec="hacer"]'); await page.click('#eqContenido [data-accion="corregir"][data-id="ac3"]'); });
  await page.waitForSelector('#ehProy');
  log('corregir un acta con un proyecto que no está en la lista lo conserva (no lo cambia por el primero)', await page.evaluate(() => document.getElementById('ehProy').value === 'Proyecto Personalizado Z'));
  await page.selectOption('#ehProy', 'Proyecto Ruta Alta').catch(() => {});
  await page.click('#eqPrimario');
  log('al guardar la corrección: la nota de la revisión queda vacía y el equipo de esa persona cambia de proyecto', await hasta(page, () => { const d = JSON.parse(localStorage.getItem('__fb_datos')); return d.hojas.ac3.revision === 'pendiente' && d.hojas.ac3.notaRevision === '' && d.equipos['eq-005'].proyecto === d.hojas.ac3.proyecto; }));
  // Hoja de vida: Pasar a bodega, sin Entregar con baja pedida
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')); const e = d.equipos['eq-011']; e.estado = 'recibido'; e.pendientes = { mtto: false, backup: false }; delete e.bajaPedida; localStorage.setItem('__fb_datos', JSON.stringify(d)); });
  await refrescar(); await page.click('#eqSecciones [data-sec="equipos"]').catch(() => {});
  await page.click('#eqContenido .card[data-id="eq-011"]').catch(async () => { await page.fill('#qEq', 'DEMO-0011'); await esp(500); await page.click('#eqContenido [data-accion="ver"]'); });
  await page.waitForSelector('#shEq:not([hidden])');
  log('la hoja de vida de un equipo en Recibidos con todo listo trae «Pasar a bodega»', await visible(page, '#eqCampos [data-accion="abodega"]'));
  await cerrarEq();
  // Excel de equipos: el serial de uno dado de baja no se registra otra vez
  const rutaEq = path.join(TMP, 'mejoras-equipos.xlsx');
  await xlsxHoja('Equipos', [{ Serial: 'demo-0013', Tipo: 'Portátil', Marca: 'Acer' }, { Serial: 'NUEVO-0001', Tipo: 'Portátil', Marca: 'Acer' }, { Serial: 'NUEVO0001', Tipo: 'Portátil', Marca: 'Acer' }], rutaEq);
  await page.click('#eqSecciones [data-sec="equipos"]').catch(() => {});
  await page.setInputFiles('#eqContenido input[data-xbd-archivo="equipos"]', rutaEq);
  await hasta(page, () => /Esto entendí del Excel/.test(document.getElementById('eqContenido').textContent));
  const tEq = await texto(page, '#eqContenido');
  log('el Excel rechaza el serial de un equipo de baja (DEMO-0013) y los seriales repetidos sin importar guiones o espacios', (tEq.match(/ya hay uno con/g) || []).length >= 3, tEq.slice(0, 400));
  await page.click('#eqContenido [data-xbd="descartar"]').catch(() => {});

  // --- Vehículos ---
  const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  const hoyIso = await page.evaluate(() => window.App.hoyISO());
  const masD = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const cerrarVeh = async () => { await page.keyboard.press('Escape'); await hasta(page, () => document.getElementById('shVeh').hidden || !document.getElementById('shConfirmar').hidden); if (!(await page.evaluate(() => document.getElementById('shConfirmar').hidden))) await page.click('#cfSi'); await hasta(page, () => document.getElementById('shVeh').hidden); };
  const errVeh = () => hasta(page, () => !document.getElementById('veErr').hidden && document.getElementById('veErr').textContent.length > 3);
  log('cambia a la Jefe', await cambiar('jefe'));
  await page.click('.tab[data-vista="vehiculos"]');
  // Visor de fotos
  await inyectar([['set', 'novedades', 'no-prueba-foto', { vehiculoId: 've-abc123', placa: 'ABC 123', tipo: 'llanta', fecha: new Date().toISOString(), km: 45000, descripcion: 'Llanta con corte (prueba del visor)', foto: JPG, reporta: 'Carlos Pérez', reportaRol: 'conductor', costo: 0, revisada: false, revisadaPor: '', revisadaEn: '', nota: '' }]]);
  await page.click('#vehSecciones [data-sec="novedades"]'); await esp(400);
  await page.click('#vehContenido img.nov-foto');
  log('tocar la foto de una novedad la abre a pantalla completa', await hasta(page, () => !!document.querySelector('.visor .visor-img') && document.querySelector('.visor-pie').textContent.length > 3));
  await page.keyboard.press('Escape');
  log('Escape cierra solo el visor', await hasta(page, () => !document.querySelector('.visor')) && await visible(page, '#vehContenido'));
  // Corregir y borrar un tanqueo (Jefe)
  const idsT = ['ta-pr-1', 'ta-pr-2', 'ta-pr-3', 'ta-pr-4', 'ta-pr-5', 'ta-pr-6'];
  const tq = (id, km, gal, valor, extra) => ['set', 'tanqueos', id, Object.assign({ vehiculoId: 've-ghi789', placa: 'GHI 789', fecha: new Date(Date.now() - 86400000 * (20 - km / 1000)).toISOString(), km, galones: gal, valor, lleno: true, foto: JPG, por: 'Prueba', porRol: 'conductor' }, extra || {})];
  await inyectar([tq('ta-pr-1', 1000, 10, 100000), tq('ta-pr-2', 1300, 10, 100000), tq('ta-pr-3', 1600, 10, 100000), tq('ta-pr-4', 1900, 10, 100000), tq('ta-pr-5', 3100, 10, 100000), tq('ta-pr-6', 3400, 10, 100000)]);
  await page.click('#vehSecciones [data-sec="tanqueos"]'); await esp(500);
  const tarjetaTan = km => page.locator('#vehContenido .card.tarea', { hasText: `${km.toLocaleString('es-CO')} km` }).first();
  log('el tanqueo que rinde muchísimo más que lo normal (1.200 km con 10 galones) avisa «¿falta anotar un tanqueo?»', await hasta(page, () => [...document.querySelectorAll('#vehContenido .card.tarea')].some(c => /3\.100 km/.test(c.textContent) && /falta anotar un tanqueo/.test(c.textContent))));
  log('y ese tramo no estropea lo «normal»: el tanqueo siguiente (30 km por galón otra vez) NO sale como consumo raro', await page.evaluate(() => { const c = [...document.querySelectorAll('#vehContenido .card.tarea')].find(x => /3\.400 km/.test(x.textContent)); return !!c && !/Consumo raro/.test(c.textContent); }));
  await page.click('#vehContenido [data-accion="edtan"][data-id="ta-pr-6"]'); await page.waitForSelector('#vqValor');
  await page.fill('#vqValor', '120000'); await page.fill('#vqGal', '10,5'); await page.click('#vePrimario');
  log('la Jefe corrige un tanqueo (valor y galones) y queda guardado', await hasta(page, () => { const t = JSON.parse(localStorage.getItem('__fb_datos')).tanqueos['ta-pr-6']; return t && t.valor === 120000 && t.galones === 10.5; }));
  await page.click('#vehContenido [data-accion="edtan"][data-id="ta-pr-6"]'); await page.waitForSelector('#vqKm');
  await page.fill('#vqKm', '2000'); await page.click('#vePrimario');
  log('no deja un kilometraje menor que el del tanqueo anterior', await errVeh() && /menor que el tanqueo anterior/.test(await texto(page, '#veErr')));
  await cerrarVeh();
  await page.click('#vehContenido [data-accion="bortan"][data-id="ta-pr-6"]'); await page.waitForSelector('#vePrimario:not([hidden])'); await page.click('#vePrimario');
  log('la Jefe borra un tanqueo', await hasta(page, () => !JSON.parse(localStorage.getItem('__fb_datos')).tanqueos['ta-pr-6']));
  await inyectar(['ta-pr-1', 'ta-pr-2', 'ta-pr-3', 'ta-pr-4', 'ta-pr-5'].map(id => ['borrar', 'tanqueos', id]).concat([['borrar', 'novedades', 'no-prueba-foto']]));
  // Plan de mantenimiento: editar y «Toca ya»
  const hoyMenos30 = masD(hoyIso, -30);
  await page.evaluate(([f]) => { const d = JSON.parse(localStorage.getItem('__fb_datos')); const v = d.vehiculos['ve-def456']; v.mttos = [{ id: 'mt-prueba', tarea: 'Revisión de prueba', cadaKm: 0, cadaDias: 30, ultimoKm: 100, ultimaFecha: f, ultimoCosto: 55000, hechos: [{ fecha: f, km: 100, costo: 55000 }] }]; localStorage.setItem('__fb_datos', JSON.stringify(d)); }, [hoyMenos30]);
  await refrescar();
  await page.click('#vehSecciones [data-sec="hacer"]').catch(() => {}); await esp(300);
  log('una tarea del plan que vence HOY dice «Toca ya» (antes decía «Pronto»)', await hasta(page, () => [...document.querySelectorAll('#vehContenido .card')].some(c => /Revisión de prueba/.test(c.textContent) && /Toca ya/.test(c.textContent))));
  await page.click('#vehSecciones [data-sec="carros"]'); await esp(300);
  await page.click('#vehContenido [data-accion="ver"][data-id="ve-def456"]'); await page.waitForSelector('#shVeh:not([hidden])');
  await page.click('#veCampos [data-accion="mttoeditar"][data-mtto="mt-prueba"]'); await page.waitForSelector('#vtTarea');
  await page.fill('#vtTarea', 'Revisión general'); await page.fill('#vtCadaDias', '60'); await page.click('#vePrimario');
  log('«Editar tarea» cambia el nombre y cada cuánto, y conserva la última vez y los costos de antes', await hasta(page, () => { const m = JSON.parse(localStorage.getItem('__fb_datos')).vehiculos['ve-def456'].mttos.find(x => x.id === 'mt-prueba'); return m && m.tarea === 'Revisión general' && m.cadaDias === 60 && m.ultimoCosto === 55000 && m.hechos.length === 1 && m.ultimoKm === 100; }));
  await esp(800); if (!(await page.evaluate(() => document.getElementById('shVeh').hidden))) await cerrarVeh();   // al guardar vuelve a abrir la hoja de vida
  // SOAT sin fecha: el aviso no dice «null»
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')); d.vehiculos['ve-ghi789'].soat = ''; localStorage.setItem('__fb_datos', JSON.stringify(d)); });
  await refrescar(); await page.click('#vehSecciones [data-sec="resumen"]').catch(() => {}); await page.click('#vehSecciones [data-sec="carros"]'); await esp(1200);
  const avSoat = await page.evaluate(() => JSON.parse(localStorage.getItem('__fb_datos')).avisos);
  log('un carro sin fecha de SOAT genera el aviso «no tiene anotada la fecha» y nunca «vence en null días»', Object.values(avSoat).some(a => /no tiene anotada la fecha de la SOAT/.test(a.texto)) && !Object.values(avSoat).some(a => /null/.test(a.texto || '')));
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fb_datos')); d.vehiculos['ve-ghi789'].soat = new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10); localStorage.setItem('__fb_datos', JSON.stringify(d)); });
  await refrescar();
  // Un carro con una falla grave sin revisar no está libre
  // Un día en que haya carros libres con los papeles al día (incluido el JKL 012): sirve para esta prueba y para la de reservas.
  const Fok = await page.evaluate(h => { const mas = n => { const d = new Date(h + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    for (let i = 1; i <= 12; i++) { const f = mas(i), l = window.Vehiculos.libresPara(f, '').map(v => v.id); if (l.includes('ve-jkl012') && l.length >= 2) return f; } return ''; }, hoyIso);
  await inyectar([['borrar', 'novedades', 'no-prueba-rev']]); await esp(400);
  const libAntes = await page.evaluate(f => window.Vehiculos.libresPara(f, '').map(v => v.id), Fok);
  await inyectar([['set', 'novedades', 'no-prueba-rev', { vehiculoId: 've-jkl012', placa: 'JKL 012', tipo: 'mantenimiento', fecha: new Date().toISOString(), km: 21000, descripcion: 'Revisión antes de salir: frenos mal. Suena raro', foto: JPG, reporta: 'X', reportaRol: 'conductor', costo: 0, revisada: false, revisadaPor: '', revisadaEn: '', nota: '' }]]); await esp(400);
  const lib = await page.evaluate(f => window.Vehiculos.libresPara(f, '').map(v => v.id), Fok);
  log('un carro con un problema grave reportado y sin revisar no sale como «libre» para reuniones ni reservas (y sin el reporte sí)', !!Fok && libAntes.includes('ve-jkl012') && !lib.includes('ve-jkl012') && lib.length >= 1, `${Fok} antes: ${libAntes.join()} · después: ${lib.join()}`);
  await page.click('#vehContenido [data-accion="ver"][data-id="ve-jkl012"]'); await page.waitForSelector('#shVeh:not([hidden])');
  log('y su hoja de vida lo dice: «Este carro no debe salir»', await hasta(page, () => /Este carro no debe salir/.test(document.getElementById('veCampos').textContent)));
  await cerrarVeh();
  await inyectar([['borrar', 'novedades', 'no-prueba-rev']]);
  // Reservas: próximas en la hoja de vida, el mismo conductor no tiene dos viajes el mismo día, y las vencidas sin respuesta se cierran
  const F = Fok || masD(hoyIso, 6);
  await inyectar([
    ['set', 'reservas', 'rs-prueba-a', { fecha: F, hora: '08:00', destino: 'Fonseca (prueba A)', motivo: 'Prueba de conductor repetido', estado: 'aprobada', por: 'Luis', porRol: 'compras', pideCorreo: 'luis@ejemplo.test', en: hoyIso, vehiculoId: 've-abc123', placa: 'ABC 123', conductor: 'Oscar Farfán', decidePor: 'X', decideEn: hoyIso }],
    ['set', 'reservas', 'rs-prueba-b', { fecha: F, hora: '14:00', destino: 'Maicao (prueba B)', motivo: 'Segundo viaje del mismo día', estado: 'pedida', por: 'Ana', porRol: 'colaborador', pideCorreo: 'ana@ejemplo.test', en: hoyIso }],
    ['set', 'reservas', 'rs-prueba-zombi', { fecha: masD(hoyIso, -3), hora: '08:00', destino: 'Viaje que ya pasó (zombi)', motivo: 'Nadie respondió', estado: 'pedida', por: 'Ana', porRol: 'colaborador', pideCorreo: 'ana@ejemplo.test', en: masD(hoyIso, -5) }]]);
  await refrescar(); await page.click('#vehSecciones [data-sec="hacer"]').catch(() => {}); await esp(900);
  log('una reserva pedida cuya fecha ya pasó y nadie respondió se cierra sola (queda cancelada)', await hasta(page, () => JSON.parse(localStorage.getItem('__fb_datos')).reservas['rs-prueba-zombi'].estado === 'cancelada'));
  await page.click('#vehSecciones [data-sec="carros"]'); await page.click('#vehContenido [data-accion="ver"][data-id="ve-abc123"]'); await page.waitForSelector('#shVeh:not([hidden])');
  log('la hoja de vida del carro muestra sus «Reservas próximas»', await hasta(page, () => /Reservas próximas \(1\)/.test(document.getElementById('veCampos').textContent) && /Fonseca \(prueba A\)/.test(document.getElementById('veCampos').textContent)));
  await cerrarVeh();
  log('cambia a Transporte', await cambiar('carros'));
  await page.click('.tab[data-vista="vehiculos"]'); await page.click('#vehSecciones [data-sec="hacer"]').catch(() => {}); await esp(500);
  await page.click('#vehContenido [data-accion="aprobares"][data-id="rs-prueba-b"]'); await page.waitForSelector('#vrCond');
  await page.selectOption('#vrCond', 'Oscar Farfán'); await page.click('#vePrimario');
  log('aprobar un viaje con un conductor que ya tiene otro viaje ese día no se deja', await errVeh() && /ya tiene otro viaje ese día/.test(await texto(page, '#veErr')), await texto(page, '#veErr'));
  await cerrarVeh();
  await inyectar([['borrar', 'reservas', 'rs-prueba-a'], ['borrar', 'reservas', 'rs-prueba-b'], ['borrar', 'reservas', 'rs-prueba-zombi']]);
  // Excel: hoja Reservas y carro con tanqueos no se borra
  log('cambia a la Jefe', await cambiar('jefe'));
  await page.click('.tab[data-vista="vehiculos"]');
  await inyectar([['set', 'vehiculos', 've-solo-tan', { placa: 'TAN 001', marca: 'X', modelo: 'Y', anio: 2020, color: '', conductor: '', km: 10, soat: masD(hoyIso, 200), tecno: masD(hoyIso, 200), estado: 'disponible', mttos: [], historial: [] }], tq('ta-solo-1', 5, 10, 100000, { vehiculoId: 've-solo-tan', placa: 'TAN 001' })]);
  await esp(400);
  const rutaCar = path.join(TMP, 'mejoras-carros-borrar.xlsx');
  await xlsxHoja('Carros', [{ ID: 've-solo-tan', Acción: 'Eliminar', Placa: 'TAN 001', Marca: 'X', Modelo: 'Y', Año: 2020, Kilometraje: 10, 'SOAT vence': masD(hoyIso, 200), 'Técnico-mecánica vence': masD(hoyIso, 200) }], rutaCar);
  await page.click('#vehSecciones [data-sec="carros"]');
  await page.setInputFiles('#vehContenido input[data-xbd-archivo="vehiculos"]', rutaCar);
  await hasta(page, () => /Esto entendí del Excel/.test(document.getElementById('vehContenido').textContent));
  log('el Excel no deja eliminar un carro que tiene tanqueos (se guardan como rastro)', /Tiene tanqueos registrados/.test(await texto(page, '#vehContenido')), (await texto(page, '#vehContenido')).slice(0, 300));
  await page.click('#vehContenido [data-xbd="descartar"]').catch(() => {});
  await inyectar([['borrar', 'tanqueos', 'ta-solo-1'], ['borrar', 'vehiculos', 've-solo-tan']]);
  await page.click('#vehSecciones [data-sec="reportes"]'); await esp(400);
  const [dlR] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#vehContenido [data-accion="excelveh"]')]);
  const rutaR = path.join(TMP, 'mejoras-reportes-carros.xlsx'); await dlR.saveAs(rutaR);
  const hojasR = (await leerXlsx(rutaR)).map(h => h.nombre);
  log('el Excel de reportes de Vehículos trae la hoja «Reservas»', hojasR.includes('Reservas'), hojasR.join());
  // Revisión antes de salir: contador, foto del problema
  await page.click('#vehSecciones [data-sec="carros"]'); await page.click('#vehContenido [data-accion="ver"][data-id="ve-def456"]'); await page.waitForSelector('#shVeh:not([hidden])');
  const haySalida = await visible(page, '#veCampos [data-accion="salida"]');
  if (haySalida) {
    await page.click('#veCampos [data-accion="salida"]'); await page.waitForSelector('#vsFalta');
    log('la salida muestra «Faltan 15 de 15 puntos» con un botón que lleva al primero', await hasta(page, () => /Faltan 15 de 15 puntos/.test(document.getElementById('vsFalta').textContent)));
    await page.click('#vsFalta [data-accion="irpunto"]');
    log('«Ir al primero» deja el cursor en el primer punto sin marcar', await page.evaluate(() => document.activeElement && document.activeElement.name === 'vr_frenos'));
    await page.check('input[name="vr_frenos"][value="bien"]', { force: true });
    log('al marcar uno baja a «Faltan 14 de 15»', await hasta(page, () => /Faltan 14 de 15 puntos/.test(document.getElementById('vsFalta').textContent)));
    log('la foto del problema no se ve mientras todo esté bien', await page.evaluate(() => document.getElementById('vsFotoProbBox').hidden));
    await page.check('input[name="vr_llantas"][value="mal"]', { force: true });
    log('si un punto importante está mal aparece la foto del problema (aparte de las 5 fotos de la salida)', await hasta(page, () => !document.getElementById('vsFotoProbBox').hidden) && await visible(page, '#vf_problema').then(() => true).catch(() => true));
    await page.fill('#vsObs', 'La llanta delantera tiene un corte'); await page.click('#vePrimario');
    log('sin la foto del problema no deja reportar', await errVeh() && /foto del problema/.test(await texto(page, '#veErr')), await texto(page, '#veErr'));
    await page.setInputFiles('#vf_problema', path.join(RAIZ, 'iconos', 'control-512.png')); await hasta(page, () => !document.getElementById('vf_problemaVer').hidden);
    await page.click('#vePrimario');
    log('con la foto del problema el reporte se guarda con esa foto (no con la de «Frente»)', await hasta(page, () => Object.values(JSON.parse(localStorage.getItem('__fb_datos')).novedades).some(n => /Revisión antes de salir/.test(n.descripcion) && n.placa === 'DEF 456' && /^data:image\/jpeg/.test(n.foto))));
  } else log('el carro DEF 456 está disponible para probar la salida', false);

  await esp(900); if (!(await page.evaluate(() => document.getElementById('shVeh').hidden))) await cerrarVeh();
  // --- Reuniones: gráfico del resumen, «Solo ver», «¿Salir sin guardar?» ---
  await page.click('.tab[data-vista="reuniones"]'); await page.click('#reuSecciones [data-sec="resumen"]');
  await hasta(page, () => !!document.querySelector('#reuContenido .barras .bf'));
  const bf = await page.evaluate(() => { const f = document.querySelector('#reuContenido .barras .bf'); return f ? { orden: [...f.children].map(c => c.className).join(','), valor: f.querySelector('.bf-v').textContent, nombre: f.querySelector('.bf-n').textContent } : null; });
  log('el gráfico «Tareas pendientes por persona» pone primero el nombre, luego el número con su unidad («3 tareas») y debajo la barra', !!bf && bf.orden === 'bf-n,bf-v,bf-b' && /^\d+ tareas?$/.test(bf.valor), JSON.stringify(bf));
  log('cada barra dice a quién le toca (en la demo, la persona y su rol)', !!bf && /·/.test(bf.nombre), bf && bf.nombre);
  log('cambia a Fredy (Compras)', await cambiar('compras'));
  await page.click('.tab[data-vista="reuniones"]'); await page.click('#reuSecciones [data-sec="hacer"]').catch(() => {}); await esp(500);
  const botonesAntes = await page.evaluate(() => document.querySelectorAll('#reuContenido [data-accion="informar"], #reuContenido [data-accion="autorizar"], #reuContenido [data-accion="nopuedo"], #reuContenido [data-accion="voy"], #reuContenido [data-accion="viajeok"]').length);
  await page.evaluate(() => { const p = window.App.S.persona; window.App.S.persona = Object.assign({}, p, { permisos: Object.assign({}, p.permisos, { reuniones: 'ver' }) }); window.App.pintarTodo(); }); await esp(500);
  const botonesVer = await page.evaluate(() => document.querySelectorAll('#reuContenido [data-accion="informar"], #reuContenido [data-accion="autorizar"], #reuContenido [data-accion="nopuedo"], #reuContenido [data-accion="voy"], #reuContenido [data-accion="viajeok"]').length);
  log('con el nivel «Solo ver» en Reuniones no sale ningún botón para informar ni decidir (aunque su rol sí los tenga)', botonesVer === 0 && botonesAntes >= 0, `antes ${botonesAntes} · con «solo ver» ${botonesVer}`);
  log('cambia a la Jefe', await cambiar('jefe'));
  await page.click('.tab[data-vista="reuniones"]'); await page.click('#reuSecciones [data-sec="proximas"]').catch(() => {}); await esp(500);
  // --- Avisos: etiqueta por evento y abrir el módulo al tocar la notificación con la app abierta ---
  const et = await page.evaluate(() => [window.Push.etiqueta('inventario', 'Compra', 'Luis pidió botas'), window.Push.etiqueta('inventario', 'Compra', 'Luis pidió botas'), window.Push.etiqueta('inventario', 'Compra', 'Ana pidió guantes')]);
  log('cada aviso tiene su propia etiqueta (el mismo aviso repetido se reemplaza; dos distintos no se pisan)', et[0] === et[1] && et[0] !== et[2] && /^inventario-/.test(et[0]), et.join(' · '));
  await page.click('.tab[data-vista="inicio"]');
  await page.evaluate(() => { navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { tipo: 'abrir', url: new URL('./#inventario', location.href).href } })); });
  log('el mensaje del service worker (tocar la notificación con la app ya abierta) abre Inventario', await hasta(page, () => !document.getElementById('vInventario').hidden));
  await page.click('.tab[data-vista="inicio"]');
  await page.evaluate(() => { location.hash = '#reuniones'; });
  log('y cambiar el # de la dirección (por ejemplo, al abrir la notificación de nuevo) abre Reuniones', await hasta(page, () => !document.getElementById('vReuniones').hidden) && await page.evaluate(() => location.hash === ''));
  await page.click('.tab[data-vista="inicio"]');

  /* ================= FASE 5 ================= */
  console.log('Fase 5: rendimiento, móvil, accesibilidad y pulido');
  log('la barra del teléfono toma el azul Caribe del encabezado (#0B4058), no el verde de antes', await page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].some(m => /0B4058|0D3B37/i.test(m.getAttribute('content')) && !/0A5A4E/i.test(m.getAttribute('content')))), await page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map(m => m.getAttribute('content')).join()));
  const pesoLogo = await page.evaluate(async () => (await (await fetch('iconos/logo-empresa.png')).arrayBuffer()).byteLength);
  log('el logo de la empresa pesa menos de 40 KB (antes 142 KB) y sigue viéndose nítido', pesoLogo < 40000, pesoLogo + ' bytes');
  log('cambia a la Jefe', await cambiar('jefe'));
  await page.click('.tab[data-vista="vehiculos"]'); await page.click('#vehSecciones [data-sec="tanqueos"]'); await esp(400);
  log('«Registrar tanqueo» y «Todavía no hay tanqueos» usan el ícono de surtidor (no la chispa)', await page.evaluate(() => { const b = document.querySelector('#vehContenido [data-accion="tanqueo"] [data-ico]'); return !!b && b.dataset.ico === 'gasolina' && !!b.querySelector('svg path'); }));
  // Fondo inerte con una hoja abierta
  await page.click('#btnPersona'); await page.waitForSelector('#shPersona:not([hidden])');
  log('con una hoja abierta, el encabezado, el contenido y las pestañas quedan «inertes» (no reciben foco ni toques ni los lee el lector de pantalla)', await page.evaluate(() => ['header.top', 'main', 'nav.tabs'].every(q => document.querySelector(q).hasAttribute('inert')) && !document.getElementById('shPersona').hasAttribute('inert')));
  await page.keyboard.press('Escape'); await hasta(page, () => document.getElementById('shPersona').hidden);
  log('al cerrar la hoja el fondo vuelve a funcionar', await page.evaluate(() => ['header.top', 'main', 'nav.tabs'].every(q => !document.querySelector(q).hasAttribute('inert'))));
  // aria-invalid
  log('cambia a Bodega', await cambiar('asistente'));
  await page.click('.tab[data-vista="inventario"]'); await page.click('#invSecciones [data-sec="existencias"]');
  await page.click('#invContenido [data-accion="nuevoart"]'); await page.waitForSelector('#acNom');
  await page.click('#acPrimario');
  log('un campo con error queda marcado para los lectores de pantalla (aria-invalid y aria-describedby al mensaje)', await page.evaluate(() => { const c = document.getElementById('acNom'); return c.getAttribute('aria-invalid') === 'true' && c.getAttribute('aria-describedby') === 'acErr'; }));
  await page.fill('#acNom', 'Algo');
  log('y la marca se quita en cuanto se corrige', await page.evaluate(() => !document.getElementById('acNom').hasAttribute('aria-invalid') && !document.getElementById('acNom').hasAttribute('aria-describedby')));
  // Contraste y tamaño de letra
  const estilos = await page.evaluate(() => { const i = document.getElementById('acNom'), cs = getComputedStyle(i); return { borde: cs.borderTopColor }; });
  log('el borde de los campos usa el color de control con buen contraste (rgb 107, 127, 136 en tema claro)', estilos.borde === 'rgb(107, 127, 136)', estilos.borde);
  await cerrarHoja();
  await page.click('#invSecciones [data-sec="conteo"]'); await page.click('#invContenido [data-accion="conteo"]'); await page.waitForSelector('#shAccion:not([hidden])');
  await page.click('#acPrimario'); await hasta(page, () => !!document.querySelector('#acCampos .conteo-f input'));
  log('los campos de las tablas y de las filas del conteo miden 16 px (el iPhone no agranda la pantalla al tocarlos)', await page.evaluate(() => getComputedStyle(document.querySelector('#acCampos .conteo-f input')).fontSize === '16px'));
  await cerrarHoja();
  // Tablas anchas con desplazamiento
  await page.click('#invSecciones [data-sec="compras"]'); await page.click('#invContenido .chips.sub [data-val="todas"]').catch(() => {});
  await page.click('#invContenido [data-accion="vercompra"]').catch(async () => { await page.click('#invContenido .card[data-id]'); });
  await page.waitForSelector('#shAccion:not([hidden])');
  log('las tablas de las hojas (compras, kárdex) van dentro de un contenedor que se mueve de lado en el teléfono', await page.evaluate(() => [...document.querySelectorAll('#acCampos table')].every(t => t.parentElement.classList.contains('tabla-scroll'))));
  await cerrarHoja();
  // Índices
  const idx = await page.evaluate(() => { const l = [{ id: 'a', g: 1 }, { id: 'b', g: 1 }, { id: 'c', g: 2 }]; return [window.UI.indice(l).get('b').g, window.UI.agrupar(l, 'g').get(1).length, window.UI.indice(l) === window.UI.indice(l), window.UI.indice([{ id: 'z' }]).get('a') === undefined]; });
  log('los índices en memoria buscan por id y agrupan, y se reutilizan mientras la lista no cambie', idx[0] === 1 && idx[1] === 2 && idx[2] === true && idx[3] === true, JSON.stringify(idx));
  // El buscador de Equipos no roba el foco al abrir una hoja
  log('cambia a Daniel (Encargado de equipos)', await cambiar('equipos'));
  await page.click('.tab[data-vista="equipos"]'); await page.click('#eqSecciones [data-sec="equipos"]').catch(() => {});
  await page.fill('#qEq', 'DEMO-000'); await esp(60);
  await page.click('#eqContenido .card[data-accion="ver"]').catch(() => {});
  await page.waitForSelector('#shEq:not([hidden])'); await esp(700);
  log('si se toca un resultado antes de que la lista termine de filtrarse, el buscador no le roba el foco a la hoja que se abrió', await page.evaluate(() => !document.getElementById('shEq').hidden && document.activeElement && document.activeElement.id !== 'qEq'));
  await cerrarEq();

  console.log('\n(sin más fases todavía)');
} catch (e) {
  log('la prueba terminó sin excepciones', false, e.stack);
} finally {
  log('sin errores de consola', errores.length === 0, errores.join(' | '));
  await b.close(); srv.close();
}
console.log(`\n${ok} bien, ${mal} mal.`);
process.exit(mal ? 1 : 0);
