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
| 6. Reuniones y agente | Worker de Cloudflare con Gemini y cuatro correos de ejemplo | Pendiente |
| 7. Pulido | Modo presentación y guion | Pendiente |

## Cuentas de prueba
Todas con la clave `demo-control-2026` (inventada y pública: la demo solo tiene datos de prueba). La app crea la cuenta en Firebase la primera vez que alguien entra con ella.

| Persona | Rol | Equipos | Inventario | Vehículos | Reuniones |
|---|---|---|---|---|---|
| Ana Pérez | Jefe | Solo ver | Solo ver | Solo ver | Jefe |
| Luis Rodríguez | Autoriza compras | No | Autoriza | No | Autoriza |
| Marta Gómez | Autoriza carros | No | Pide material | Autoriza | Autoriza |
| Carlos Pinto | Conductor | No | Pide material | Reporta novedades | Solo ver |
| Sofía Herrera | Asistente | Edita | Encargada de bodega | No | Solo ver |

## Archivos
- `index.html`, `app.js`, `demo.css`: la app. `inventario.js`: el módulo Inventario (bodega y compras).
- `push.js`, `sw.js`, `manifest.webmanifest`, `iconos/control-*.png`: avisos al teléfono (Web Push) e instalación en la pantalla de inicio.
- `avisos/worker.js`: servidor de avisos «avisos-demo» para Cloudflare Workers (gratis). Se pega a mano en Cloudflare con los secretos `VAPID_D` y `VAPID_PUB`.
- `generar-llaves.html`: crea en el navegador el par de llaves de los avisos. La privada va solo en Cloudflare; la pública va en `config.js` (`window.AVISOS_DEMO`).
- `lib/xlsx/`: SheetJS (Apache-2.0) para descargar el Excel del Resumen.
- `nube.js`: conexión con Firebase (Authentication con correo y clave, y Firestore). Nuevo: no usa la clave compartida de las apps reales ni manda errores a Slack.
- `config.js`: datos del proyecto de Firebase de la demo, ID `fir-app-control-d8494` (no son secretos).
- `personas.js`: las cinco cuentas de prueba y sus permisos. `datos-demo.js`: los datos de ejemplo, con fechas relativas al día en que se cargan.
- `firestore.rules`: reglas de la base de datos (solo entran las cinco cuentas de prueba). Se pegan en Firebase.
- `comun.css`, `comun.js`, `iconos.js`, `fuentes/`, `codigos.js`, `lib/codigos/`: copiados de `apps-consulta-previa` (ver `DESIGN.md`). En `iconos.js` se agregaron iconos Phosphor (licencia MIT): inicio, carro, carrito, reunión, cambiar, pagada, correo y llave.
- `pruebas/`: Firebase falso (`firebase-*.js`) y pruebas con Playwright.

## Datos en Firestore
Colecciones de primer nivel: `equipos`, `compras`, `articulos`, `movimientos`, `solicitudes`, `vehiculos`, `reuniones`, `avisos`, `suscripciones` (teléfonos con avisos activados; Reiniciar no las borra) y `demo/estado` (marca y versión de los datos de ejemplo: si la versión guardada es vieja, la app vuelve a cargar los datos de ejemplo). Solo la Jefe carga, actualiza y reinicia los datos de prueba (así lo piden las reglas): si otra persona entra primero, la app le dice que entre una vez como Ana. La Jefe tiene en **Cambiar de persona** el botón **Reiniciar los datos de prueba** (usarlo antes de presentar).

## Permisos (los hace cumplir Firebase, no solo la pantalla)
- Cualquiera pide material y pide compras a su nombre. Nadie autoriza su propio pedido: las de Luis las autoriza la Jefe.
- Luis autoriza o rechaza sin poder cambiar cantidad ni valor. La bodega (Sofía) compra, recibe, entrega, registra entradas, salidas y conteos; la cantidad nunca queda negativa.
- Cada quien marca como leídos solo sus avisos.

## Pruebas
```
npm ci
npx playwright install chromium     # o usar un Chrome instalado: CHROME=/ruta/a/chrome
npm run lint
npm run pruebas
```
Las capturas quedan en `capturas/`. Sin emulador de Firebase, las reglas (`firestore.rules`) se prueban al entrar en la app publicada.
