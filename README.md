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
| 5. Compras | Pedir, autorizar, comprar, resumen del mes | Pendiente |
| 6. Reuniones y agente | Worker de Cloudflare con Gemini y cuatro correos de ejemplo | Pendiente |
| 7. Pulido | Modo presentación y guion | Pendiente |

## Cuentas de prueba
Todas con la clave `demo-control-2026` (inventada y pública: la demo solo tiene datos de prueba). La app crea la cuenta en Firebase la primera vez que alguien entra con ella.

| Persona | Rol | Equipos | Compras | Vehículos | Reuniones |
|---|---|---|---|---|---|
| Ana Pérez | Jefe | Solo ver | Solo ver | Solo ver | Jefe |
| Luis Rodríguez | Autoriza compras | No | Autoriza | No | Autoriza |
| Marta Gómez | Autoriza carros | No | No | Autoriza | Autoriza |
| Carlos Pinto | Conductor | No | No | Reporta novedades | Solo ver |
| Sofía Herrera | Asistente | Edita | Pide | No | Solo ver |

## Archivos
- `index.html`, `app.js`, `demo.css`: la app.
- `nube.js`: conexión con Firebase (Authentication con correo y clave, y Firestore). Nuevo: no usa la clave compartida de las apps reales ni manda errores a Slack.
- `config.js`: datos del proyecto de Firebase de la demo (no son secretos).
- `personas.js`: las cinco cuentas de prueba y sus permisos. `datos-demo.js`: los datos de ejemplo, con fechas relativas al día en que se cargan.
- `firestore.rules`: reglas de la base de datos (solo entran las cinco cuentas de prueba). Se pegan en Firebase.
- `comun.css`, `comun.js`, `iconos.js`, `fuentes/`, `codigos.js`, `lib/codigos/`: copiados de `apps-consulta-previa` (ver `DESIGN.md`). En `iconos.js` se agregaron iconos Phosphor (licencia MIT): inicio, carro, carrito, reunión, cambiar, pagada, correo y llave.
- `pruebas/`: Firebase falso (`firebase-*.js`) y pruebas con Playwright.

## Datos en Firestore
Colecciones de primer nivel: `equipos`, `compras`, `vehiculos`, `reuniones`, `avisos` y `demo/estado` (marca de que ya se cargaron los datos). La persona Jefe tiene en **Cambiar de persona** el botón **Reiniciar los datos de prueba** (usarlo antes de presentar).

## Pruebas
```
npm ci
npx playwright install chromium     # o usar un Chrome instalado: CHROME=/ruta/a/chrome
npm run lint
npm run pruebas
```
Las capturas quedan en `capturas/`. Sin emulador de Firebase, las reglas (`firestore.rules`) se prueban al entrar en la app publicada.
