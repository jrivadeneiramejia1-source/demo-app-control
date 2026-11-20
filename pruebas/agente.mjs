// Prueba del Worker agente-demo, sin red: token de Firebase firmado aquí con una llave de prueba y Gemini falso.
// Uso: node pruebas/agente.mjs   -> imprime "OK ..." / "FALLA ..." y sale con 1 si algo falla.
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = (await import(pathToFileURL(path.join(RAIZ, 'agente', 'worker.js')).href)).default;
let ok = 0, mal = 0;
const t = (nombre, cond, extra) => { cond ? ok++ : mal++; console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre + (cond || extra == null ? '' : '\n      ' + extra)); };

const PROY = 'fir-app-control-d8494';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const otra = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = Object.assign(publicKey.export({ format: 'jwk' }), { kid: 'k1', alg: 'RS256', use: 'sig' });
const b64u = x => Buffer.from(x).toString('base64url');
function token(cambios = {}, llave = privateKey, kid = 'k1') {
  const ahora = Math.floor(Date.now() / 1000);
  const cab = b64u(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const cuerpo = b64u(JSON.stringify(Object.assign({ aud: PROY, iss: 'https://securetoken.google.com/' + PROY, sub: 'uid-prueba', iat: ahora - 10, exp: ahora + 3600 }, cambios)));
  const firma = crypto.sign('sha256', Buffer.from(cab + '.' + cuerpo), llave).toString('base64url');
  return `${cab}.${cuerpo}.${firma}`;
}

// fetch falso: llaves de Google y Gemini. modoGemini decide qué contesta Gemini.
let llamadas = [], modoGemini = 'bien', respuesta = null;
const RESP_BIEN = { tipo: 'nueva', reunionId: '', comunidad: 'Comunidad Ejemplo Oriente', fecha: '2026-11-27', hora: '08:30', lugar: '', asistentes: 40, refrigerios: true, almuerzo: true, carros: 2, logistica: ['Sonido y micrófono', 'Sillas'], faltan: ['lugar'], motivo: '', resumen: 'Reunión nueva.' };
globalThis.fetch = async (url, op = {}) => {
  url = String(url);
  if (url.includes('securetoken@system.gserviceaccount.com')) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'cache-control': 'public, max-age=3600' } });
  if (url.startsWith('https://generativelanguage.googleapis.com/')) {
    const cuerpo = JSON.parse(op.body);
    llamadas.push({ url, cuerpo, clave: (op.headers || {})['x-goog-api-key'] });
    const conEsquema = !!cuerpo.generationConfig.responseSchema;
    if (modoGemini === 'sin-modelo' && url.includes('gemini-flash-latest')) return new Response('{}', { status: 404 });
    if (modoGemini === 'sin-esquema' && conEsquema) return new Response('{}', { status: 400 });
    if (modoGemini === 'cupo') return new Response('{}', { status: 429 });
    const texto = modoGemini === 'cercado' ? '```json\n' + JSON.stringify(respuesta || RESP_BIEN) + '\n```' : JSON.stringify(respuesta || RESP_BIEN);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }] }), { status: 200 });
  }
  throw new Error('salió a internet: ' + url);
};

const ORIGEN = 'https://jrivadeneiramejia1-source.github.io';
const env = { GEMINI_API_KEY: 'clave-de-prueba' };
const pedir = async ({ metodo = 'POST', origen = ORIGEN, tok = token(), cuerpo, entorno = env } = {}) => {
  const h = { 'Content-Type': 'application/json' };
  if (origen) h.Origin = origen;
  if (tok) h.Authorization = 'Bearer ' + tok;
  const c = cuerpo === undefined ? JSON.stringify({ correo: 'Buenos días, reunión con la Comunidad Ejemplo Oriente el jueves.', asunto: 'Convocatoria', hoy: '2026-11-19', reuniones: [{ id: 're-001', comunidad: 'Comunidad Ejemplo Norte', fecha: '2026-11-25', hora: '08:00', lugar: 'Salón', estado: 'programada' }] }) : cuerpo;
  const r = await W.fetch(new Request('https://agente-demo.ejemplo.workers.dev/', { method: metodo, headers: h, body: metodo === 'POST' ? c : undefined }), entorno);
  let j = null; try { j = await r.json(); } catch (e) {}
  return { r, j };
};

console.log('1. Estado y permisos');
{ const { r, j } = await pedir({ metodo: 'GET' }); t('GET dice que está listo con la clave puesta', r.status === 200 && j.listo === true && j.servicio === 'agente-demo'); }
{ const { j } = await pedir({ metodo: 'GET', entorno: {} }); t('GET dice listo:false si falta la clave', j.listo === false); }
{ const r = await W.fetch(new Request('https://x/', { method: 'OPTIONS', headers: { Origin: ORIGEN } }), env); t('OPTIONS desde la app publicada: 204 con permiso para Authorization', r.status === 204 && /Authorization/.test(r.headers.get('Access-Control-Allow-Headers'))); }
{ const r = await W.fetch(new Request('https://x/', { method: 'OPTIONS', headers: { Origin: 'https://otro.sitio' } }), env); t('OPTIONS desde otro sitio: 403', r.status === 403); }
{ const { r } = await pedir({ origen: 'https://otro.sitio' }); t('POST desde otro sitio: 403', r.status === 403); }
{ const { r, j } = await pedir({ entorno: {} }); t('sin GEMINI_API_KEY: 500 con explicación', r.status === 500 && j.error === 'sin-clave'); }

console.log('2. Token de Firebase');
{ const { r } = await pedir({ tok: '' }); t('sin token: 401', r.status === 401); }
{ const { r } = await pedir({ tok: 'basura.que.no' }); t('token dañado: 401', r.status === 401); }
{ const { r } = await pedir({ tok: token({ exp: Math.floor(Date.now() / 1000) - 5 }) }); t('token vencido: 401', r.status === 401); }
{ const { r } = await pedir({ tok: token({ aud: 'otro-proyecto', iss: 'https://securetoken.google.com/otro-proyecto' }) }); t('token de otro proyecto: 401', r.status === 401); }
{ const { r } = await pedir({ tok: token({}, otra.privateKey) }); t('token firmado con otra llave: 401', r.status === 401); }
{ const { r } = await pedir({ tok: token({}, privateKey, 'k-desconocida') }); t('token con llave desconocida: 401', r.status === 401); }
{ const { r } = await pedir({ tok: token({ sub: '' }) }); t('token sin usuario: 401', r.status === 401); }
t('ninguna de esas llamó a Gemini', llamadas.length === 0, llamadas.length);

console.log('3. Lectura del correo');
llamadas = []; modoGemini = 'bien';
{
  const { r, j } = await pedir();
  t('con token válido responde 200 con la reunión entendida', r.status === 200 && j.ok && j.reunion.comunidad === 'Comunidad Ejemplo Oriente' && j.reunion.carros === 2 && j.reunion.faltan[0] === 'lugar', JSON.stringify(j));
  const c = llamadas[0];
  t('manda la clave solo en el encabezado x-goog-api-key', c && c.clave === 'clave-de-prueba' && !c.url.includes('clave-de-prueba'));
  t('le pide JSON con el esquema y temperatura 0', c.cuerpo.generationConfig.responseMimeType === 'application/json' && c.cuerpo.generationConfig.responseSchema.required.includes('tipo') && c.cuerpo.generationConfig.temperature === 0);
  t('las instrucciones llevan la fecha de hoy y las reuniones activas', /Hoy es 2026-11-19/.test(c.cuerpo.systemInstruction.parts[0].text) && /re-001/.test(c.cuerpo.systemInstruction.parts[0].text));
  t('el correo va con su asunto', /Asunto: Convocatoria/.test(c.cuerpo.contents[0].parts[0].text));
}
llamadas = []; modoGemini = 'sin-modelo';
{ const { r, j } = await pedir(); t('si el modelo no existe, prueba el siguiente', r.status === 200 && j.modelo !== 'gemini-flash-latest' && llamadas.length === 2, llamadas.map(x => x.url.split('/models/')[1]).join(' ')); }
llamadas = []; modoGemini = 'sin-esquema';
{ const { r } = await pedir(); t('si no acepta el esquema, lo pide solo como JSON', r.status === 200 && llamadas.length === 2 && !llamadas[1].cuerpo.generationConfig.responseSchema); }
llamadas = []; modoGemini = 'cercado';
{ const { r, j } = await pedir(); t('entiende el JSON aunque venga entre ```', r.status === 200 && j.reunion.tipo === 'nueva'); }
llamadas = []; modoGemini = 'bien'; respuesta = { tipo: 'borrar-todo', reunionId: 're-999', comunidad: 'X'.repeat(300), fecha: 'mañana', hora: '25:99', asistentes: -4, carros: 999, logistica: ['Sillas', 'Cohetes'], faltan: 'lugar', refrigerios: 'si', resumen: 'a\u0000b' };
{ const { j } = await pedir(); const x = j.reunion; t('si el modelo devuelve cosas raras, quedan limpias', x.tipo === 'otro' && x.reunionId === '' && x.comunidad.length === 80 && x.fecha === '' && x.hora === '' && x.asistentes === 0 && x.carros === 20 && x.logistica.join() === 'Sillas' && Array.isArray(x.faltan) && x.faltan.length === 0 && x.refrigerios === false && x.resumen === 'a b', JSON.stringify(x)); }
respuesta = Object.assign({}, RESP_BIEN, { tipo: 'faltantes', reunionId: 're-001' });
{ const { j } = await pedir(); t('el id de reunión se acepta solo si está en la lista que mandó la app', j.reunion.reunionId === 're-001'); }
respuesta = null; modoGemini = 'cupo';
{ const { r, j } = await pedir(); t('si Gemini llega al límite gratis: 502 «cupo» (la app usa el respaldo)', r.status === 502 && j.error === 'cupo'); }
modoGemini = 'bien';
{ const { r } = await pedir({ cuerpo: JSON.stringify({ correo: 'x'.repeat(30 * 1024) }) }); t('cuerpo muy grande: 413', r.status === 413); }
{ const { r } = await pedir({ cuerpo: '{no es json' }); t('cuerpo que no es JSON: 400', r.status === 400); }
{ const { r } = await pedir({ cuerpo: JSON.stringify({ correo: 'hola' }) }); t('correo vacío o muy corto: 400', r.status === 400); }

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
