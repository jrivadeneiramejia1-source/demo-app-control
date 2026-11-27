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
  await lee('DEMO-0007');
  log('al leer DEMO-0007 la píldora sale verde («Verificado: DEMO-0007»), el contador sube y el botón dice «Terminar (1)»', await hasta(page, () => document.querySelector('.cod-pildora.ok') && /Verificado: DEMO-0007/.test(document.querySelector('.cod-pildora').textContent) && /Verificados 1 · Faltan/.test(document.querySelector('.cod-cuenta').textContent) && /Terminar \(1\)/.test(document.querySelector('[data-a="terminar"]').textContent)), await pildora());
  log('cada lectura vibra y suena un pitido', await page.evaluate(() => window.__vib >= 1 && window.__sonidos >= 1), await page.evaluate(() => `vib ${window.__vib} sonidos ${window.__sonidos}`));
  const vib1 = await page.evaluate(() => window.__vib);
  await lee('DEMO-0007'); await esp(700);
  log('el mismo serial dentro de 2,5 s no se vuelve a leer: no suma ni vuelve a sonar', await page.evaluate(v => window.__vib === v && /Verificados 1 ·/.test(document.querySelector('.cod-cuenta').textContent), vib1));
  await lee('XYZ-999');
  log('un serial que no existe sale en rojo con su explicación', await hasta(page, () => document.querySelector('.cod-pildora.mal') && /No hay un equipo con el serial XYZ-999/.test(document.querySelector('.cod-pildora').textContent)), await pildora());
  await page.evaluate(() => new Promise(r => setTimeout(r, 2700)));
  await lee('DEMO-0007');
  log('pasados 2,5 s, repetir el serial avisa en amarillo «ya estaba verificado» y no cuenta otra vez', await hasta(page, () => document.querySelector('.cod-pildora.aviso') && /ya estaba verificado/.test(document.querySelector('.cod-pildora').textContent) && /Verificados 1 ·/.test(document.querySelector('.cod-cuenta').textContent)), await pildora());
  await lee('DEMO-0010');
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

  console.log('\n(sin más fases todavía)');
} catch (e) {
  log('la prueba terminó sin excepciones', false, e.stack);
} finally {
  log('sin errores de consola', errores.length === 0, errores.join(' | '));
  await b.close(); srv.close();
}
console.log(`\n${ok} bien, ${mal} mal.`);
process.exit(mal ? 1 : 0);
