# Demo de la app de control

App de muestra, **gratis y con datos inventados**, para presentar a los jefes los cuatro módulos (Equipos, Compras, Vehículos y Reuniones) y el agente de reuniones. Es una copia aparte: no toca las apps reales de Equipos y Entregas ni sus datos.

Cada pantalla trae una etiqueta azul **Versión pagada**: al tocarla dice qué cambia pagando.

## Estado
| Fase | Qué | Estado |
|---|---|---|
| 1. Preparación | Repositorio, diseño y piezas copiadas de Equipos y Entregas | Hecha |
| 2. Base y entrada | Cuentas de prueba, cambio de persona, menú de los módulos, datos inventados, campana y etiquetas | Hecha |
| 3. Equipos | Equipos y Entregas juntas | Pendiente |
| 4. Vehículos | Hoja de vida, novedades con foto, entrega y recibo | Pendiente |
| 5. Inventario y compras | Bodega con las compras adentro: Qué hay que hacer, Existencias, Movimientos, Pedidos de material, Compras (con foto de factura e historial), Conteo físico y Resumen con Excel. Permisos por rol en las reglas y avisos al teléfono | Hecha (va antes que 3 y 4, a pedido de los jefes) |
| 6. Reuniones y agente | Cuatro correos de ejemplo; el agente (Worker `agente-demo` con Gemini) los lee y la Jefe confirma y reparte: Compras autoriza la comida, Transporte los carros y el conductor, el Conductor confirma, Logística alista, el Profesional confirma si va y Administrativo registra el acta con foto. Resumen para Jefe y Gerente | Hecha (falta conectar Gemini) |
| 7. Pulido | Modo presentación y guion | Pendiente |

## Cómo se entra
Dos formas, desde la pantalla de entrada:

1. **Personas de prueba** (para presentar): una por rol, todas con la clave `demo-control-2026` (inventada y pública). Se cambia de persona en vivo desde el botón de arriba.
2. **Mi cuenta** (como sería el uso real): cada persona crea su cuenta con su correo, su clave y el **código de su rol**. El código decide el rol: aunque alguien diga ser jefe, entra con el rol del código. Firebase revisa el código (las reglas), no solo la pantalla.

Los códigos se manejan en **Cambiar de persona > Personas y códigos**, que solo sale con una cuenta propia de Gerente o de Jefe (las personas de prueba tienen la clave pública, por eso no lo ven). Hay un código por rol, con el formato `LOG-7KQ4-M2XP` (las 3 letras dicen el rol). Ahí mismo se ve quién se registró, se le cambia el rol o se pausa su acceso. Si un código se riega, se cambia y el viejo deja de servir.
- Los códigos de **Gerente y Jefe** solo los ve y crea el Gerente, y **sirven una sola vez** (colección `codigosDireccion`). El Jefe maneja los demás roles.
- El **primer código de Gerente** se crea a mano en Firebase: Firestore Database > Datos > Iniciar colección `codigosDireccion`, documento con ID `GER-XXXX-XXXX` y campos `rol` = `gerente`, `activo` = `true` (booleano), `por` = `consola`, `en` = la fecha.
- En Firebase debe quedar activa la creación de cuentas (**Authentication > Settings > User actions > Enable create (sign-up)**).

| Área | Persona de prueba | Rol | Equipos | Inventario | Vehículos | Reuniones |
|---|---|---|---|---|---|---|
| Dirección | Ricardo Fuentes | Gerente | Solo ver | Ve todo a detalle y autoriza lo que pide la Jefe | Solo ver | Solo ver |
| Dirección | Ana Pérez | Jefe | Ve y cambia todo | Autoriza las compras y puede hacer cualquier paso | Ve y cambia todo | Ve y cambia todo |
| Equipos | Daniel Ortiz | Encargado de equipos | Encargado | Pide material | No | No |
| Equipos | Valentina Ruiz | Soporte | Mantenimiento y entregas | Pide material | No | No |
| Inventario | Luis Rodríguez | Compras | No | Hace las compras | No | Autoriza |
| Inventario | Sofía Herrera | Bodega | No | Encargada de bodega | No | No |
| Vehículos | Marta Gómez | Transporte | No | Pide material | Autoriza | Autoriza |
| Vehículos | Carlos Pinto | Conductor | No | Pide material | Reporta novedades | Asiste |
| Reuniones | Pedro Castillo | Logística | No | Pide material | No | Logística |
| Reuniones | Laura Medina | Profesional | No | Pide material | No | Asiste |
| Reuniones | Natalia Vargas | Administrativo | No | Pide material | No | Registra actas y formatos |

Equipos, Vehículos y Reuniones por ahora solo se ven: lo que hace cada rol ahí se arma en sus fases.

## Archivos
- `index.html`, `app.js`, `demo.css`: la app. `inventario.js`: el módulo Inventario (bodega y compras).
- `push.js`, `sw.js`, `manifest.webmanifest`, `iconos/control-*.png`: avisos al teléfono (Web Push) e instalación en la pantalla de inicio.
- `reuniones.js`: el módulo Reuniones. `correos-demo.js`: los 4 correos de ejemplo y la respuesta de respaldo de cada uno (se usa si el agente no está conectado o falla).
- `agente/worker.js`: Worker «agente-demo» para Cloudflare. Solo atiende a la Jefe (revisa el token de Firebase y el rol) y tiene límite de lecturas por cuenta; le pasa el correo a Gemini y devuelve en JSON lo que entendió (no escribe en la base). La clave de Gemini debe ser de un proyecto sin facturación. Secreto `GEMINI_API_KEY`; su dirección va en `config.js` (`window.AGENTE_DEMO`).
- `avisos/worker.js`: servidor de avisos «avisos-demo» para Cloudflare Workers (gratis). Se pega a mano en Cloudflare con los secretos `VAPID_D` y `VAPID_PUB`.
- `generar-llaves.html`: crea en el navegador el par de llaves de los avisos. La privada va solo en Cloudflare; la pública va en `config.js` (`window.AVISOS_DEMO`).
- `lib/xlsx/`: SheetJS (Apache-2.0) para descargar el Excel del Resumen.
- `nube.js`: conexión con Firebase (Authentication con correo y clave, y Firestore). Nuevo: no usa la clave compartida de las apps reales ni manda errores a Slack.
- `config.js`: datos del proyecto de Firebase de la demo, ID `fir-app-control-d8494` (no son secretos).
- `personas.js`: los roles, sus permisos y las personas de prueba. `datos-demo.js`: los datos de ejemplo, con fechas relativas al día en que se cargan.
- `firestore.rules`: reglas de la base de datos (entran las personas de prueba y las cuentas con un código válido). Se pegan en Firebase.
- `caribe.css`: el estilo de la demo (azul mar sobrio, relieve con sombras, letra Nunito en `fuentes/nunito.woff2`, licencia SIL OFL 1.1). Va después de `demo.css`.
- `comun.css`, `comun.js`, `iconos.js`, `fuentes/`, `codigos.js`, `lib/codigos/`: copiados de `apps-consulta-previa` (ver `DESIGN.md`). En `iconos.js` se agregaron iconos Phosphor (licencia MIT): inicio, carro, carrito, reunión, cambiar, pagada, correo y llave.
- `gente.js`: panel «Personas y códigos» (Gerente y Jefe).
- `pruebas/`: Firebase falso (`firebase-*.js`) y pruebas con Playwright.

## Datos en Firestore
Colecciones de primer nivel: `reuniones` y `necesidades` (una tarea por documento: comida, carros, viaje, logística, asistencia y acta), `usuarios` (perfil de cada cuenta propia: nombre, rol y si tiene acceso), `codigos` (código de cada rol de trabajo; lo leen Gerente y Jefe con cuenta propia), `codigosDireccion` (códigos de Gerente y Jefe, de un solo uso; solo el Gerente), `equipos`, `compras`, `articulos`, `movimientos`, `solicitudes`, `vehiculos`, `reuniones`, `avisos`, `suscripciones` (teléfonos con avisos activados; Reiniciar no las borra) y `demo/estado` (marca y versión de los datos de ejemplo: si la versión guardada es vieja, la app vuelve a cargar los datos de ejemplo). Solo la Jefe carga, actualiza y reinicia los datos de prueba (así lo piden las reglas): si otra persona entra primero, la app le dice que entre una vez como Ana. La Jefe de prueba (Ana) tiene en **Cambiar de persona** el botón **Reiniciar los datos de prueba** (usarlo antes de presentar).

## Permisos (los hace cumplir Firebase, no solo la pantalla)
- Compras: alguien pide → la Jefe autoriza (si la pidió la Jefe, el Gerente) → Compras (Luis) la compra → Bodega (Sofía) la recibe. Nadie autoriza su propio pedido.
- Cualquiera pide material y pide compras a su nombre. El Gerente autoriza o rechaza sin poder cambiar cantidad ni valor; Compras registra la compra sin tocar lo autorizado.
- La bodega (Sofía) recibe, entrega, registra entradas, salidas y conteos; la cantidad nunca queda negativa. La Jefe puede hacer cualquier paso.
- Cada quien marca como leídos solo sus avisos.

## Pruebas
```
npm ci
npx playwright install chromium     # o usar un Chrome instalado: CHROME=/ruta/a/chrome
npm run lint
npm run pruebas
```
Las capturas quedan en `capturas/`. Sin emulador de Firebase, las reglas (`firestore.rules`) se prueban al entrar en la app publicada.
