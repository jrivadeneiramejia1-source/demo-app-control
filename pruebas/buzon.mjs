// Prueba del Apps Script buzon/Codigo.gs con Gmail, Firebase y propiedades falsos (sin internet).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const codigo = fs.readFileSync(path.join(RAIZ, 'buzon', 'Codigo.gs'), 'utf8');
let ok = 0, mal = 0;
const log = (t, bien, extra) => { if (bien) ok++; else mal++; console.log(`${bien ? 'OK   ' : 'FALLA'} ${t}${!bien && extra ? '\n      ' + extra : ''}`); };

function mensaje(id, de, asunto, cuerpo, leido) {
  return { leido: !!leido, getId: () => id, getFrom: () => de, getSubject: () => asunto, getPlainBody: () => cuerpo,
    getDate: () => new Date('2026-11-20T15:00:00Z'), isUnread() { return !this.leido; }, markRead() { this.leido = true; } };
}
function escenario({ props, hilos, firestore }) {
  const llamadas = [], logs = [];
  const ctx = {
    console: { log: m => logs.push(String(m)) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null }) },
    GmailApp: { search: q => { llamadas.push(['buscar', q]); return hilos.map(ms => ({ getMessages: () => ms, addLabel: e => llamadas.push(['etiqueta', e.nombre]) })); },
      getUserLabelByName: () => null, createLabel: n => ({ nombre: n }) },
    UrlFetchApp: { fetch: (url, o) => {
      llamadas.push(['fetch', url, o]);
      if (url.includes('signInWithPassword')) {
        const p = JSON.parse(o.payload);
        const bien = p.password === 'clave-robot-prueba';
        return { getResponseCode: () => (bien ? 200 : 400), getContentText: () => JSON.stringify(bien ? { idToken: 'tok-robot' } : { error: { message: 'INVALID_PASSWORD' } }) };
      }
      const codigoResp = firestore(url, o);
      return { getResponseCode: () => codigoResp, getContentText: () => '{}' };
    } },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => llamadas.push(['activador']) }) }) }) }
  };
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);
  return { ctx, llamadas, logs };
}

// 1. Sube los correos sin leer de remitentes permitidos, sin quién lo mandó y sin la firma.
{
  const guardados = [];
  const m1 = mensaje('18c3fa01', 'Jeiler <yo@ejemplo.test>', 'Reunión con la Comunidad Ejemplo Este', 'Buenos días.\nReunión el 30 de noviembre, 40 personas, 2 camionetas.\n-- \nMi firma con teléfono 300 000 0000');
  const m2 = mensaje('18c3fa02', 'otro@spam.test', 'Reunión urgente', 'Texto de alguien que no está en la lista');
  const m3 = mensaje('18c3fa03', 'yo@ejemplo.test', 'Reunión vieja', 'Este ya estaba leído', true);
  const { ctx, llamadas } = escenario({ props: { CLAVE_ROBOT: 'clave-robot-prueba', REMITENTES: 'YO@ejemplo.test, otra@ejemplo.test' }, hilos: [[m1, m2, m3]],
    firestore: (url, o) => { guardados.push({ url, cuerpo: JSON.parse(o.payload), auth: o.headers.Authorization }); return 200; } });
  ctx.revisarBuzon();
  log('busca solo correos sin leer, de los REMITENTES, que hablen de reuniones', llamadas[0][0] === 'buscar' && /is:unread/.test(llamadas[0][1]) && /reuni/.test(llamadas[0][1]) && /from:\(yo@ejemplo\.test OR otra@ejemplo\.test\)/.test(llamadas[0][1]), llamadas[0][1]);
  log('entra una sola vez con la cuenta robot y guarda con su token', llamadas.filter(x => x[0] === 'fetch' && x[1].includes('signInWithPassword')).length === 1 && guardados.length === 1 && guardados[0].auth === 'Bearer tok-robot');
  const g = guardados[0] || { url: '', cuerpo: { fields: {} } };
  log('guarda en buzon/<id del correo> del proyecto de la demo', /projects\/fir-app-control-d8494\/databases\/\(default\)\/documents\/buzon\?documentId=18c3fa01$/.test(g.url), g.url);
  log('guarda solo asunto, texto y fecha (no quién lo mandó)', Object.keys(g.cuerpo.fields).sort().join(',') === 'asunto,fecha,texto' && !JSON.stringify(g.cuerpo).includes('yo@ejemplo.test') && !JSON.stringify(g.cuerpo).includes('Jeiler'));
  log('le quita la firma al texto', /2 camionetas/.test(g.cuerpo.fields.texto.stringValue) && !/firma|300 000/.test(g.cuerpo.fields.texto.stringValue), g.cuerpo.fields.texto.stringValue);
  log('marca como leído lo que subió y NO toca los correos de otras personas', !m1.isUnread() && m2.isUnread() && guardados.every(x => !x.url.endsWith('18c3fa02')));
}
// 2. Si ya estaba en la app (409) cuenta como guardado; si Firebase lo rechaza, queda sin leer para intentar otra vez.
{
  const a = mensaje('aaa1', 'x@ejemplo.test', 'Reunión A', 'Texto de la reunión A con datos');
  const b = mensaje('bbb2', 'x@ejemplo.test', 'Reunión B', 'Texto de la reunión B con datos');
  const c = mensaje('ccc9', 'x@ejemplo.test', 'Reunión C', 'Texto de la reunión C con datos');
  const { ctx, logs, llamadas } = escenario({ props: { CLAVE_ROBOT: 'clave-robot-prueba', REMITENTES: 'x@ejemplo.test' }, hilos: [[a, b], [c]], firestore: url => (url.endsWith('aaa1') ? 409 : url.endsWith('bbb2') ? 403 : 503) });
  ctx.revisarBuzon();
  log('si el correo ya estaba en la app, lo marca leído', !a.isUnread());
  log('si Firebase lo rechaza (403), lo marca leído con la etiqueta buzon-error (que solo avisa: la búsqueda ya no excluye el hilo, así una respuesta nueva en ese hilo sí pasa)', !b.isUnread() && llamadas.some(x => x[0] === 'etiqueta' && x[1] === 'buzon-error') && logs.some(l => /403/.test(l)) && !/-label:buzon-error/.test(llamadas[0][1]));
  log('si Google falla un rato (503), lo deja sin leer para la próxima vuelta', c.isUnread());
}
// 2b. Un token vencido (401) a mitad de la vuelta: entra otra vez y reintenta una vez; el correo pasa.
{
  const m = mensaje('ttt1', 'X <x@ejemplo.test>', 'Reunión del sábado', 'Reunión del sábado en la comunidad, con 30 personas y refrigerio.');
  let intentos = 0;
  const { ctx, llamadas } = escenario({ props: { CLAVE_ROBOT: 'clave-robot-prueba', REMITENTES: 'x@ejemplo.test' }, hilos: [[m]], firestore: () => (++intentos === 1 ? 401 : 200) });
  ctx.revisarBuzon();
  log('si el token vence (401) vuelve a entrar y reintenta: el correo pasa y queda leído', m.leido === true && llamadas.filter(x => x[0] === 'fetch' && x[1].includes('signInWithPassword')).length === 2 && intentos === 2);
}
// 2c. Limpiar y tapar: fechas con hora, correos reenviados y frases con «De:».
{
  const { ctx } = escenario({ props: {}, hilos: [], firestore: () => 200 });
  const tapado = ctx.tapar('La reunión es el 2026-11-27 08:30 y también el 27/11/2026. Llama al 300 123 4567 o al +57 (300) 111-2233. Escribe a juan@ejemplo.com');
  log('tapar() no daña una fecha con hora («2026-11-27 08:30») ni «27/11/2026», pero sí tapa teléfonos y correos', tapado.includes('2026-11-27 08:30') && tapado.includes('27/11/2026') && (tapado.match(/\[teléfono\]/g) || []).length === 2 && tapado.includes('[correo]'), tapado);
  const reenviado = ctx.limpiar('Mira esto\n---------- Forwarded message ---------\nDe: Ana <ana@ejemplo.com>\nEnviado: lunes\nPara: yo\nAsunto: Reunión\n\nReunión el sábado con 30 personas en la Comunidad Norte\n-- \nFirma');
  log('un correo reenviado conserva su contenido (la reunión) y solo pierde el rótulo y los encabezados De/Enviado/Para/Asunto', /Reunión el sábado con 30 personas/.test(reenviado) && !/Forwarded|Enviado:|Asunto:/.test(reenviado) && !/Firma/.test(reenviado), reenviado);
  const de = ctx.limpiar('Hola\nDe: la comunidad Norte, el sábado a las 9\nGracias');
  log('una frase que empieza con «De:» no corta el correo', /sábado a las 9/.test(de) && /Gracias/.test(de), de);
}
// 3. Sin correos no entra a Firebase; sin la clave o con clave mala, avisa claro.
{
  const { ctx, llamadas } = escenario({ props: { CLAVE_ROBOT: 'clave-robot-prueba', REMITENTES: 'x@ejemplo.test' }, hilos: [], firestore: () => 200 });
  ctx.revisarBuzon();
  log('sin correos nuevos no gasta llamadas a Firebase', !llamadas.some(x => x[0] === 'fetch'));
  let errR = '';
  try { escenario({ props: { CLAVE_ROBOT: 'clave-robot-prueba' }, hilos: [], firestore: () => 200 }).ctx.revisarBuzon(); } catch (e) { errR = e.message; }
  log('sin REMITENTES no pasa ningún correo y dice qué falta', /REMITENTES/.test(errR), errR);
  let err = '';
  try { escenario({ props: {}, hilos: [], firestore: () => 200 }).ctx.revisarBuzon(); } catch (e) { err = e.message; }
  log('sin la propiedad CLAVE_ROBOT dice qué falta', /CLAVE_ROBOT/.test(err), err);
  err = '';
  const m = mensaje('ccc3', 'x@ejemplo.test', 'Reunión C', 'Texto de la reunión C con datos');
  try { escenario({ props: { CLAVE_ROBOT: 'otra', REMITENTES: 'x@ejemplo.test' }, hilos: [[m]], firestore: () => 200 }).ctx.revisarBuzon(); } catch (e) { err = e.message; }
  log('con la clave mala dice que no pudo entrar la cuenta robot (y el correo queda sin leer)', /robot/.test(err) && /INVALID_PASSWORD/.test(err) && m.isUnread(), err);
}
// 4. Quita lo citado de respuestas anteriores y deja el id limpio.
{
  const guardados = [];
  const m = mensaje('id-con/raros', 'x@ejemplo.test', 'RE: Reunión', 'Cambia la fecha al 3 de diciembre.\n\nEl jue, 20 nov 2026 a las 8:00, Alguien <a@b.c> escribió:\n> texto viejo\n> más viejo');
  const m2 = mensaje('fwd1', 'x@ejemplo.test', 'RV: Reunión', 'Reunión el 2026-12-04 a las 9:00. Llamar al 300 123 4567 o a contacto@empresa.test 😀\n\nDe: Persona Real <real@empresa.test>\nEnviado: jueves\nAsunto: reunión');
  const { ctx } = escenario({ props: { CLAVE_ROBOT: 'clave-robot-prueba', REMITENTES: 'x@ejemplo.test' }, hilos: [[m], [m2]], firestore: (url, o) => { guardados.push({ url, t: JSON.parse(o.payload).fields.texto.stringValue }); return 200; } });
  ctx.revisarBuzon();
  log('quita lo citado del correo anterior', guardados[0] && guardados[0].t === 'Cambia la fecha al 3 de diciembre.', guardados[0] && guardados[0].t);
  log('corta lo reenviado de Outlook (De:) y tapa correos y teléfonos, sin tapar la fecha', guardados[1] && guardados[1].t === 'Reunión el 2026-12-04 a las 9:00. Llamar al [teléfono] o a [correo] 😀', guardados[1] && guardados[1].t);
  log('el id del documento solo tiene letras y números', guardados[0] && guardados[0].url.endsWith('documentId=idconraros'));
  const e2 = escenario({ props: {}, hilos: [], firestore: () => 200 }); e2.ctx.instalar();
  const act = e2.llamadas.filter(x => x[0] === 'activador').length;
  log('instalar() crea el activador de cada minuto', act === 1);
}
console.log(`\n${ok} bien, ${mal} mal.`);
process.exit(mal ? 1 : 0);
