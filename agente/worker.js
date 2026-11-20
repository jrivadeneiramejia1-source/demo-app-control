/* agente-demo: Worker de Cloudflare que lee un correo de reunión con Gemini y devuelve, en JSON, lo que entendió.
   La app de la demo le manda el correo y las reuniones activas; el Worker NO escribe en la base de datos:
   la Jefe revisa lo que entendió el agente y ella confirma en la app.

   Solo atiende a la Jefe (es la que recibe los correos): revisa el token de Firebase (firma RS256 de Google, proyecto,
   vencimiento) y que la cuenta sea la Jefe de prueba o una cuenta propia con rol Jefe activa. Además tiene un límite de
   llamadas por cuenta. Así nadie de afuera gasta el cupo gratis de Gemini.
   La clave de Gemini debe ser de un proyecto de Google AI Studio SIN facturación: si se acaba el cupo, no cobra.

   Secreto que hay que crear en Cloudflare (Settings > Variables and Secrets, tipo Secret):
     GEMINI_API_KEY   la clave de Google AI Studio. No se comparte con nadie.
   Variables opcionales (tipo Text):
     MODELO           modelo de Gemini. Por defecto prueba 'gemini-3.1-flash-lite' y, si no existe, otros de la lista.
     PROYECTO         ID del proyecto de Firebase. Por defecto 'fir-app-control-d8494'.
   Solo datos inventados: en el plan gratis, Google puede usar lo que se le manda para mejorar sus productos. */

const PROYECTO_POR_DEFECTO = 'fir-app-control-d8494';
const MODELOS = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.5-flash', 'gemini-2.5-flash'];
const JEFE_DE_PRUEBA = 'ana.perez@example.com';
const MAX_POR_MINUTO = 8, MAX_POR_DIA = 150;
const ORIGENES_FIJOS = ['https://jrivadeneiramejia1-source.github.io'];
const ORIGEN_LOCAL = /^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}$/;
const LLAVES_GOOGLE = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MAX_CUERPO = 24 * 1024, MAX_CORREO = 8000, MAX_REUNIONES = 40;
const TIPOS = ['nueva', 'faltantes', 'reprograma', 'cancela', 'otro'];
const ITEMS = ['Sonido y micrófono', 'Sillas', 'Mesas', 'Refrigerios recibidos'];

const origenPermitido = o => ORIGENES_FIJOS.includes(o) || ORIGEN_LOCAL.test(o);
function cors(origen) {
  return { 'Access-Control-Allow-Origin': origen, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}
const json = (datos, estado, cab) => new Response(JSON.stringify(datos), { status: estado || 200, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, cab || {}) });

/* ---------- token de Firebase ---------- */
const deB64u = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), c => c.charCodeAt(0));
const texto64 = s => new TextDecoder().decode(deB64u(s));
let cacheLlaves = { hasta: 0, llaves: null };
async function llavesGoogle() {
  if (cacheLlaves.llaves && Date.now() < cacheLlaves.hasta) return cacheLlaves.llaves;
  const r = await fetch(LLAVES_GOOGLE);
  if (!r.ok) throw new Error('llaves');
  const j = await r.json();
  const edad = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  cacheLlaves = { llaves: Array.isArray(j.keys) ? j.keys : [], hasta: Date.now() + Math.min(6 * 3600, edad ? Number(edad[1]) : 3600) * 1000 };
  return cacheLlaves.llaves;
}
/** Devuelve los datos del token si es de una sesión válida de este proyecto; si no, null. */
async function revisarToken(token, proyecto) {
  try {
    const partes = String(token || '').split('.');
    if (partes.length !== 3) return null;
    const cab = JSON.parse(texto64(partes[0])), cuerpo = JSON.parse(texto64(partes[1]));
    if (cab.alg !== 'RS256' || !cab.kid) return null;
    const ahora = Math.floor(Date.now() / 1000);
    if (cuerpo.aud !== proyecto || cuerpo.iss !== 'https://securetoken.google.com/' + proyecto) return null;
    if (!(cuerpo.exp > ahora) || !(cuerpo.iat <= ahora + 300) || typeof cuerpo.sub !== 'string' || !cuerpo.sub) return null;
    const jwk = (await llavesGoogle()).find(k => k.kid === cab.kid);
    if (!jwk) return null;   // llave desconocida (Google las cambia cada tantas horas; la caché dura lo que Google indica)
    const llave = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', llave, deB64u(partes[2]), new TextEncoder().encode(partes[0] + '.' + partes[1]));
    return ok ? cuerpo : null;
  } catch (e) { return null; }
}

/** ¿Es la Jefe? La de prueba por su correo; una cuenta propia, por su perfil en Firestore (leído con su propio token). */
async function esJefe(token, datos, proyecto) {
  if (datos.email === JEFE_DE_PRUEBA) return true;
  try {
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(proyecto)}/databases/(default)/documents/usuarios/${encodeURIComponent(datos.sub)}`, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return false;
    const f = ((await r.json()) || {}).fields || {};
    return !!(f.rol && f.rol.stringValue === 'jefe' && f.activo && f.activo.booleanValue === true);
  } catch (e) { return false; }
}
/** Límite de llamadas por cuenta (en memoria de este Worker; Cloudflare puede tener varias copias, así que es aproximado). */
const usos = new Map();
function pasaLimite(uid) {
  const t = Date.now(), lista = (usos.get(uid) || []).filter(x => t - x < 86400000);
  if (lista.filter(x => t - x < 60000).length >= MAX_POR_MINUTO || lista.length >= MAX_POR_DIA) { usos.set(uid, lista); return false; }
  lista.push(t); usos.set(uid, lista);
  if (usos.size > 500) usos.delete(usos.keys().next().value);
  return true;
}

/* ---------- Gemini ---------- */
const ESQUEMA = {
  type: 'object',
  properties: {
    tipo: { type: 'string', enum: TIPOS, description: 'nueva = convocan una reunión que no está en la lista; faltantes = llegan datos que faltaban (lugar, número de personas) de una reunión de la lista; reprograma = cambia la fecha u hora; cancela = se cancela; otro = no es de una reunión.' },
    reunionId: { type: 'string', description: 'id de la reunión de la lista a la que se refiere el correo; vacío si es nueva u otro.' },
    comunidad: { type: 'string' },
    fecha: { type: 'string', description: 'Fecha nueva o de la reunión en formato AAAA-MM-DD; vacío si el correo no la dice.' },
    hora: { type: 'string', description: 'Hora en formato 24 h HH:MM; vacío si el correo no la dice.' },
    lugar: { type: 'string', description: 'Lugar exacto; vacío si no lo dice o si dice que está por confirmar.' },
    asistentes: { type: 'integer', description: 'Número de personas esperadas; 0 si no lo dice.' },
    refrigerios: { type: 'boolean' },
    almuerzo: { type: 'boolean' },
    carros: { type: 'integer', description: 'Número de carros o camionetas que piden; 0 si no piden.' },
    logistica: { type: 'array', items: { type: 'string', enum: ITEMS } },
    faltan: { type: 'array', items: { type: 'string' }, description: 'Datos que faltan para la reunión nueva: lugar, hora, fecha o personas.' },
    motivo: { type: 'string', description: 'Motivo del cambio o de la cancelación; vacío si no hay.' },
    resumen: { type: 'string', description: 'Una o dos frases en español sencillo con lo que pide el correo.' }
  },
  required: ['tipo', 'reunionId', 'comunidad', 'fecha', 'hora', 'lugar', 'asistentes', 'refrigerios', 'almuerzo', 'carros', 'logistica', 'faltan', 'motivo', 'resumen']
};
function instrucciones(hoy, reuniones) {
  return 'Eres el asistente de una empresa colombiana que organiza reuniones con comunidades. Lees un correo y devuelves solo JSON con el esquema dado.\n' +
    `Hoy es ${hoy}. Convierte fechas como "jueves 27 de noviembre" a AAAA-MM-DD (el año es el de la próxima fecha que cumpla). Horas a 24 h ("8:30 a. m." = "08:30").\n` +
    'Reuniones activas (para saber si el correo habla de una que ya existe):\n' + JSON.stringify(reuniones) + '\n' +
    'Reglas: no inventes datos; lo que el correo no diga va vacío o en 0. "Por confirmar" = vacío. ' +
    'Sonido o micrófono -> "Sonido y micrófono"; sillas -> "Sillas"; mesas -> "Mesas"; si piden comida agrega "Refrigerios recibidos" en logística solo cuando es una reunión nueva.';
}
const limpiarTexto = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
/** Deja la respuesta dentro de lo esperado, aunque el modelo se equivoque. */
function normalizar(x, ids) {
  const o = x && typeof x === 'object' ? x : {};
  const n = v => Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0;
  return {
    tipo: TIPOS.includes(o.tipo) ? o.tipo : 'otro',
    reunionId: ids.includes(o.reunionId) ? o.reunionId : '',
    comunidad: limpiarTexto(o.comunidad, 80),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(o.fecha) ? o.fecha : '',
    hora: /^([01]\d|2[0-3]):[0-5]\d$/.test(o.hora) ? o.hora : '',
    lugar: limpiarTexto(o.lugar, 120),
    asistentes: Math.max(0, Math.min(5000, n(o.asistentes))),
    refrigerios: o.refrigerios === true, almuerzo: o.almuerzo === true,
    carros: Math.max(0, Math.min(20, n(o.carros))),
    logistica: Array.isArray(o.logistica) ? ITEMS.filter(i => o.logistica.includes(i)) : [],
    faltan: Array.isArray(o.faltan) ? o.faltan.map(f => limpiarTexto(f, 30)).filter(Boolean).slice(0, 6) : [],
    motivo: limpiarTexto(o.motivo, 200),
    resumen: limpiarTexto(o.resumen, 400)
  };
}
function sacarJSON(t) {
  const s = String(t || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(s); } catch (e) { const m = /\{[\s\S]*\}/.exec(s); if (m) { try { return JSON.parse(m[0]); } catch (e2) {} } }
  return null;
}
/** Mensaje corto del error de Gemini (sin la clave), para saber qué pasó. */
async function motivoGemini(r) {
  const j = await r.json().catch(() => null);
  const m = j && j.error && (j.error.message || j.error.status);
  return `Gemini respondió ${r.status}${m ? ': ' + String(m).replace(/key=[^&\s]+/gi, 'key=…').slice(0, 160) : ''}`;
}
/** Llama a Gemini. Por cada modelo prueba tres formas, de la más completa a la más simple, por si el modelo no acepta
    alguna opción (error 400). Si el modelo no existe o no está disponible (404/403) o falla el servidor (5xx), prueba el siguiente. */
// El último modelo que respondió bien: la próxima vez se prueba primero (así no se pierde tiempo con los que no existen).
let modeloBueno = '';
const ESPERA_POR_LLAMADA = 15000, ESPERA_TOTAL = 24000;
async function preguntarGemini(env, prompt, correo) {
  const base = env.MODELO ? [env.MODELO].concat(MODELOS.filter(m => m !== env.MODELO)) : MODELOS;
  const lista = !env.MODELO && modeloBueno ? [modeloBueno].concat(base.filter(m => m !== modeloBueno)) : base;
  const inicio = Date.now();
  let ultimo = 'sin respuesta';
  for (const modelo of lista) {
    // Gemini 3 pide dejar la temperatura por defecto y pensar poco para responder rápido; Gemini 2 va con temperatura 0.
    const g3 = !/^gemini-2/.test(modelo);
    const formas = [
      Object.assign({ responseMimeType: 'application/json', responseSchema: ESQUEMA }, g3 ? { thinkingConfig: { thinkingLevel: 'low' } } : { temperature: 0 }),
      { responseMimeType: 'application/json', responseSchema: ESQUEMA },
      { responseMimeType: 'application/json' }
    ];
    for (const generationConfig of formas) {
      // Si ya se fue mucho tiempo, se para: la app usa el respaldo en vez de dejar a la Jefe esperando.
      if (Date.now() - inicio > ESPERA_TOTAL) return { error: 'lento', detalle: `${ultimo}; Gemini tardó demasiado` };
      const cuerpo = { systemInstruction: { parts: [{ text: prompt }] }, contents: [{ role: 'user', parts: [{ text: 'Correo:\n' + correo }] }], generationConfig };
      let r;
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(Math.min(ESPERA_POR_LLAMADA, ESPERA_TOTAL + 2000 - (Date.now() - inicio))) });
      } catch (e) { ultimo = `${modelo}: no respondió a tiempo`; break; }
      if (r.status === 429) return { error: 'cupo', detalle: await motivoGemini(r) };
      if (r.status === 400) { ultimo = `${modelo}: ${await motivoGemini(r)}`; continue; }
      if (!r.ok) { ultimo = `${modelo}: ${await motivoGemini(r)}`; break; }
      const j = await r.json().catch(() => null);
      const texto = j && j.candidates && j.candidates[0] && j.candidates[0].content && (j.candidates[0].content.parts || []).map(p => p.text || '').join('');
      const datos = sacarJSON(texto);
      if (datos) { if (!env.MODELO) modeloBueno = modelo; return { datos, modelo }; }
      ultimo = `${modelo}: respuesta sin JSON`;
    }
  }
  return { error: 'gemini', detalle: ultimo };
}

export default {
  async fetch(req, env) {
    const origen = req.headers.get('Origin') || '';
    const cab = origenPermitido(origen) ? cors(origen) : {};
    if (req.method === 'OPTIONS') return origenPermitido(origen) ? new Response(null, { status: 204, headers: cab }) : new Response(null, { status: 403 });
    if (req.method === 'GET') return json({ ok: true, servicio: 'agente-demo', listo: !!env.GEMINI_API_KEY }, 200, cab);
    if (req.method !== 'POST') return json({ ok: false, error: 'metodo' }, 405, cab);
    if (!origenPermitido(origen)) return json({ ok: false, error: 'origen' }, 403);
    if (!env.GEMINI_API_KEY) return json({ ok: false, error: 'sin-clave', detalle: 'Falta el secreto GEMINI_API_KEY en Cloudflare' }, 500, cab);
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') || '');
    const proyecto = env.PROYECTO || PROYECTO_POR_DEFECTO;
    const datos = token ? await revisarToken(token[1], proyecto) : null;
    if (!datos) return json({ ok: false, error: 'sesion', detalle: 'Entra a la app otra vez' }, 401, cab);
    if (!(await esJefe(token[1], datos, proyecto))) return json({ ok: false, error: 'permiso', detalle: 'Solo la Jefe usa el agente' }, 403, cab);
    if (!pasaLimite(datos.sub)) return json({ ok: false, error: 'cupo', detalle: 'Muchas lecturas seguidas: espera un minuto' }, 429, cab);
    const largo = Number(req.headers.get('Content-Length') || 0);
    if (largo > MAX_CUERPO) return json({ ok: false, error: 'grande' }, 413, cab);
    const crudo = await req.text();
    if (crudo.length > MAX_CUERPO) return json({ ok: false, error: 'grande' }, 413, cab);
    let p; try { p = JSON.parse(crudo); } catch (e) { return json({ ok: false, error: 'json' }, 400, cab); }
    const correo = limpiarTexto(p && p.asunto ? 'Asunto: ' + p.asunto + '\n\n' + p.correo : p && p.correo, MAX_CORREO);
    if (correo.length < 10) return json({ ok: false, error: 'correo' }, 400, cab);
    const hoy = /^\d{4}-\d{2}-\d{2}$/.test(p.hoy) ? p.hoy : new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);   // hora de Colombia
    const reuniones = (Array.isArray(p.reuniones) ? p.reuniones : []).slice(0, MAX_REUNIONES).map(r => ({
      id: limpiarTexto(r && r.id, 40), comunidad: limpiarTexto(r && r.comunidad, 80), fecha: limpiarTexto(r && r.fecha, 10), hora: limpiarTexto(r && r.hora, 5), lugar: limpiarTexto(r && r.lugar, 120), estado: limpiarTexto(r && r.estado, 20)
    })).filter(r => r.id);
    try {
      const res = await preguntarGemini(env, instrucciones(hoy, reuniones), correo);
      if (res.error) return json({ ok: false, error: res.error, detalle: res.detalle }, 502, cab);
      return json({ ok: true, modelo: res.modelo, reunion: normalizar(res.datos, reuniones.map(r => r.id)) }, 200, cab);
    } catch (e) { return json({ ok: false, error: 'red', detalle: 'No se pudo hablar con Gemini' }, 502, cab); }
  }
};
