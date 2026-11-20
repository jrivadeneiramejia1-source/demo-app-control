/* buzon/Codigo.gs — Apps Script que pasa los correos del Gmail de prueba a la app de la demo.

   Cómo funciona: cada minuto revisa los correos SIN LEER del Gmail de prueba que hablen de una reunión,
   entra a Firebase con la cuenta robot (buzon.demo@example.com) y guarda cada correo en la colección «buzon».
   La Jefe los ve en la app (Reuniones > Correos) y los lee con el agente. Después los marca como leídos en Gmail.

   Qué se guarda: solo el asunto, el texto (máximo 7000 letras, sin la firma ni lo reenviado) y la fecha.
   NO se guarda quién lo mandó, y los correos y teléfonos que aparezcan en el texto se tapan: la demo es pública.
   Manda solo correos INVENTADOS (nada de personas, comunidades ni datos reales).
   Si Firebase rechaza un correo (por ejemplo, las reglas no están pegadas), se marca leído con la etiqueta
   «buzon-error» para que no tape a los nuevos. Para reintentarlo: quítale la etiqueta y márcalo como no leído.

   Propiedades del script (Configuración del proyecto > Propiedades del script). Las escribes tú; no van en el código:
     CLAVE_ROBOT   la clave de la cuenta robot que creaste en Firebase (Authentication).
     REMITENTES    los correos que pueden mandar a la demo, separados por coma. Si está vacío no pasa ninguno.

   Pasos: ver README.md, sección «Correo real (Gmail de prueba)». */

const PROYECTO = 'fir-app-control-d8494';
// Clave web de Firebase de la demo (no es secreta: es la misma que está en config.js).
const API_KEY = 'AIzaSyAo58h-I2Ejfa_fINZtXpwTe4iEjBbCxLg';
const ROBOT = 'buzon.demo@example.com';
// Solo correos sin leer de los últimos 7 días, de los REMITENTES, que hablen de una reunión.
// Los demás correos del buzón ni se miran ni se tocan.
const BUSQUEDA = 'in:inbox is:unread newer_than:7d -label:buzon-error (reunion OR reunión OR reuniones)';
const conRemitentes = lista => BUSQUEDA + ' from:(' + lista.join(' OR ') + ')';
const MAX_TEXTO = 7000;
const ETIQUETA_ERROR = 'buzon-error';

/** La que corre cada minuto (el activador lo crea instalar()). */
function revisarBuzon() {
  const props = PropertiesService.getScriptProperties();
  const clave = props.getProperty('CLAVE_ROBOT');
  if (!clave) throw new Error('Falta la propiedad CLAVE_ROBOT (Configuración del proyecto > Propiedades del script).');
  const permitidos = String(props.getProperty('REMITENTES') || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
  if (!permitidos.length) throw new Error('Falta la propiedad REMITENTES (los correos que pueden mandar a la demo, separados por coma).');
  if (permitidos.some(x => !/^[^\s@()]+@[^\s@()]+$/.test(x))) throw new Error('REMITENTES tiene algo que no es un correo: ' + permitidos.join(', '));
  const hilos = GmailApp.search(conRemitentes(permitidos), 0, 10);
  if (!hilos.length) return;
  let token = null;
  hilos.forEach(hilo => hilo.getMessages().forEach(m => {
    if (!m.isUnread()) return;
    const de = correoDe(m.getFrom());
    if (permitidos.indexOf(de) < 0) return;   // otro correo del mismo hilo que no es de los REMITENTES: no se toca
    if (!token) token = entrar(clave);
    const r = subir(token, m);
    if (r === 'ok') m.markRead();
    else if (r === 'rechazado') { m.markRead(); hilo.addLabel(GmailApp.getUserLabelByName(ETIQUETA_ERROR) || GmailApp.createLabel(ETIQUETA_ERROR)); }
    // 'despues' (sin internet, cupo o error de Google): queda sin leer y se intenta en la próxima vuelta.
  }));
}

/** Entra a Firebase con la cuenta robot y devuelve el token (dura una hora). */
function entrar(clave) {
  const r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + API_KEY, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ email: ROBOT, password: clave, returnSecureToken: true })
  });
  const j = JSON.parse(r.getContentText() || '{}');
  if (r.getResponseCode() !== 200 || !j.idToken) throw new Error('No pudo entrar la cuenta robot: ' + ((j.error && j.error.message) || r.getResponseCode()));
  return j.idToken;
}

/** Guarda un correo en buzon/<id del correo>. Devuelve 'ok' (o ya estaba: 409), 'rechazado' (4xx: no se arregla solo)
    o 'despues' (429 o error del servidor: se reintenta). */
function subir(token, m) {
  const id = String(m.getId()).replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
  const texto = Array.from(tapar(limpiar(m.getPlainBody()))).slice(0, MAX_TEXTO).join('');   // por letras completas (no parte emojis)
  if (texto.length < 10) { console.log('El correo «' + m.getSubject() + '» no tiene texto: no se pasó a la app. Mándalo otra vez con los datos de la reunión.'); return 'ok'; }
  const cuerpo = { fields: {
    asunto: { stringValue: Array.from(tapar(String(m.getSubject() || ''))).slice(0, 200).join('') },
    texto: { stringValue: texto },
    fecha: { stringValue: m.getDate().toISOString() }
  } };
  const url = 'https://firestore.googleapis.com/v1/projects/' + PROYECTO + '/databases/(default)/documents/buzon?documentId=' + id;
  const r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token }, payload: JSON.stringify(cuerpo) });
  const codigo = r.getResponseCode();
  if (codigo === 200 || codigo === 409) return 'ok';
  console.log('No se guardó el correo «' + m.getSubject() + '»: ' + codigo + ' ' + r.getContentText().slice(0, 300));
  return codigo >= 400 && codigo < 500 && codigo !== 429 ? 'rechazado' : 'despues';
}

/** Quita la firma («-- »), lo citado o reenviado de correos anteriores (Gmail y Outlook) y espacios de más. */
function limpiar(t) {
  let s = '\n' + String(t || '').replace(/\r/g, '');
  const corte = s.search(/\n-- ?\n|\nEl .{5,160} escribió:|\nOn .{5,160} wrote:|\n-{5,} ?(Forwarded message|Mensaje reenviado|Original Message|Mensaje original)|\n_{10,}|\n\*?(De|From):\*? .{0,200}\n/i);
  if (corte > 0) s = s.slice(0, corte);
  return s.split('\n').filter(l => !/^\s*>/.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Tapa correos y números de teléfono que aparezcan en el texto (la demo es pública). */
function tapar(t) {
  return String(t || '').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[correo]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, m => (m.replace(/\D/g, '').length >= 10 ? '[teléfono]' : m));   // 10 dígitos o más (no tapa fechas)
}

const correoDe = desde => { const m = /<([^>]+)>/.exec(String(desde || '')); return (m ? m[1] : String(desde || '')).trim().toLowerCase(); };

/** Corre esta UNA vez: crea el activador que revisa el buzón cada minuto. */
function instalar() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'revisarBuzon').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('revisarBuzon').timeBased().everyMinutes(1).create();
  console.log('Listo: el buzón se revisa cada minuto.');
}

/** Para apagarlo cuando ya no se use la demo. */
function desinstalar() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'revisarBuzon').forEach(t => ScriptApp.deleteTrigger(t));
  console.log('Listo: ya no se revisa el buzón.');
}
