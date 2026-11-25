# Demo de la app de control

App de muestra, **gratis y con datos inventados**, para presentar a los jefes los cuatro módulos (Equipos, Compras, Vehículos y Reuniones) y el agente de reuniones. Es una copia aparte: no toca las apps reales de Equipos y Entregas ni sus datos.

Cada pantalla trae una etiqueta azul **Versión pagada**: al tocarla dice qué cambia pagando.

## Estado
| Fase | Qué | Estado |
|---|---|---|
| 1. Preparación | Repositorio, diseño y piezas copiadas de Equipos y Entregas | Hecha |
| 2. Base y entrada | Cuentas de prueba, cambio de persona, menú de los módulos, datos inventados, campana y etiquetas | Hecha |
| 3. Equipos | Equipos y Entregas juntas, con el **acta virtual** igual a la hoja «Entrega de equipos y herramientas»: fecha, nombre, cédula, proyecto y código; tabla de equipos (serial, cantidad, observaciones) y de «Otros»; firma de quien recibe en la pantalla con su cédula; la devolución se anota en la misma acta con su fecha y firma. Recibidos con mantenimiento y backup, agenda que Soporte le programa al Encargado, revisión de actas por Soporte (nadie revisa las suyas), historial por equipo y por persona, acta imprimible o en PDF | Hecha |
| 4. Vehículos | Hoja de vida de cada carro; el Conductor reporta novedades con foto y registra la salida y la llegada (kilometraje, combustible, 5 fotos y revisión); Transporte y Bodega revisan novedades (costo, nota, taller), actualizan SOAT y técnico-mecánica y reciben avisos de vencimiento. En Reuniones la Jefe escoge carro y conductor por camioneta, y el viaje queda ligado a ese carro | Hecha |
| 5. Inventario y compras | Bodega con las compras adentro: Qué hay que hacer, Existencias, Movimientos, Pedidos de material, Compras (con foto de factura e historial), Conteo físico y Resumen con Excel. Permisos por rol en las reglas y avisos al teléfono | Hecha (va antes que 3 y 4, a pedido de los jefes) |
| 6. Reuniones y agente | Cuatro correos de ejemplo; el agente (Worker `agente-demo` con Gemini) los lee y la Jefe confirma y reparte: Compras, Transporte y Bodega informan lo que hay y la Jefe autoriza la comida y los carros (escoge el conductor); el Conductor confirma, Logística alista, el Profesional confirma si va y Administrativo registra el acta con foto. Resumen para Jefe y Gerente | Hecha (falta conectar Gemini) |
| 7. Pulido | Modo presentación y guion | Pendiente |
| 8. Permisos, invitaciones y seguridad (Fases A y S) | Personas y permisos solo de la Jefe, niveles por módulo y por persona, invitaciones por Excel, correo confirmado, entrar con Google, reglas de Firebase cerradas por módulo y probadas en el emulador (`npm run reglas`) | Hecha |
| 10. Organigrama y logo de la empresa | Las 46 personas del organigrama con su cargo (lista agrupada por unidad y con buscador), 3 roles nuevos (Colaborador, Financiero, Consulta) y el logo de la empresa como ícono y en la entrada | Hecha |
| 9. Inventario a fondo (Fase B) | Inventario por niveles, **Panorama de la Jefe**, compras con varias líneas y cotizaciones, **monto del Gerente** con autorización en dos pasos, el Gerente también puede pedir, alerta si pagan más de lo autorizado o llega menos, recibir compras de varios artículos, kárdex y mínimo sugerido, cada quien lee solo lo suyo | Hecha (faltan los préstamos de herramientas y los pedidos de material con varias líneas) |

## Cómo se entra
Desde la pantalla de entrada hay dos formas:

1. **Personas de prueba** (para presentar): una por rol, todas con la clave `demo-control-2026` (inventada y pública). Se cambia de persona en vivo desde el botón de arriba. **Para uso real con datos de la empresa se apagan** (ver «Pasar a uso real»).
2. **Mi cuenta** (uso real): la persona entra **con Google** o con **su correo y una clave que ella inventa** (10 caracteres o más). Su rol y sus permisos los pone la Jefe de antes; la persona no los escoge ni los cambia (lo revisa Firebase, no solo la pantalla).

### Cómo entra cada persona (invitaciones)
1. **La Jefe** abre **Cambiar de persona > Personas y permisos** (solo ella lo ve; el Gerente no), descarga la **plantilla de Excel**, la llena (nombre, correo y rol; los niveles y permisos extra son opcionales) y la sube. La app muestra lo que entendió y marca lo que está mal (rol que no existe, correo repetido, nombre con `=`). Al tocar **Guardar** queda una invitación por correo.
2. **La persona** abre la app, toca **Es mi primera vez** y escribe su correo y una clave (o toca **Continuar con Google**).
3. **Con correo y clave**, Firebase le manda un correo para confirmar que el correo es suyo; sin confirmarlo no ve nada. **Con Google** no hace falta: Google ya lo confirmó.
4. Al confirmar, la app busca la invitación de ese correo y le crea el perfil con el rol, los niveles y los permisos extra que dijo la Jefe. **La invitación sirve una sola vez.**
5. Si su correo **no está en la lista**, la app le dice «Tu correo no está en la lista» y no ve nada. **Olvidé mi clave** manda el correo de cambio de clave.

Alternativa sin Excel: la Jefe puede crear un **código por rol** (`LOG-7KQ4-M2XP`, las 3 letras dicen el rol) y dárselo a la persona, que lo escribe en «Tengo un código de rol». Los códigos de **Gerente y Jefe no se crean desde la app**: se ponen a mano en la consola de Firebase (así una cuenta robada de la Jefe no puede llenar la app de Gerentes) y **sirven una sola vez**.
- **Los códigos de Jefe y de Gerente se crean a mano** (el primero y todos los demás) en Firebase: Firestore Database > Datos > Iniciar colección `codigosDireccion`, documento con ID `JEF-XXXX-XXXX` y campos `rol` = `jefe`, `activo` = `true` (booleano), `por` = `consola`, `en` = la fecha. Con ese código se registra la primera Jefe.
- **A un Gerente o a otra Jefe no se les cambia nada desde la app** (ni rol, ni pausa, ni permisos): solo desde la consola de Firebase. Así una Jefe no puede sacar a otra.

### Base de datos en Excel en cada ventana (`excel-bd.js`)
Lo mismo que Bodega, con un módulo común: **Descargar base de datos** (una fila por cosa con su código, listas desplegables, solo enteros, fechas y una hoja de Ayuda) y **Subir Excel** (vista previa de lo que agregaría, cambiaría o eliminaría, con lo que está mal marcado; nada se guarda hasta tocar «Guardar»; subir el mismo archivo otra vez no repite nada). Qué permite cada ventana (siempre dentro de lo que dejan las reglas de Firebase):

| Ventana | Quién | Agregar | Cambiar | Eliminar |
|---|---|---|---|---|
| **Bodega** | Bodega y Jefe | Sí (en una de las 3 bodegas) | Datos y cantidad (con conteo y su movimiento) | Solo la Jefe, sin compras ni pedidos en curso |
| **Equipos** | Encargado y Jefe | Sí (queda en bodega) | Fecha del último mantenimiento y backup, observaciones (con línea de historial) | Solo la Jefe: no asignado, sin actas ni tareas |
| **Carros** | Solo la Jefe | Sí (queda «Disponible») | Marca, modelo, año, color, kilometraje (nunca hacia atrás) y fechas de SOAT y técnico-mecánica | Solo la Jefe: no en uso y sin salidas ni novedades |
| **Reuniones** | Solo la Jefe | Sí: cada fila crea la reunión **y reparte las tareas y avisos** como al confirmar un correo | No (cambiar fecha, lugar o cancelar se hace en la app, para avisar a quien toca) | No |
| **Compras** | Quien puede pedir compras | Sí: cada fila pide una compra de un artículo (queda «Por autorizar»; la del Gerente general nace autorizada) | No (son el rastro de lo gastado) | No |

Lo que ya está se baja para verlo (en gris donde no se cambia). No es sincronización en vivo: para eso la app final necesitaría algo como Google Sheets (con claves, solo en la copia privada). Pedidos de material y Movimientos siguen con su Excel de lectura de siempre.

### Las 3 bodegas
La bodega son siempre **3: Riohacha, Guamal y Bogotá** (la app, el Excel y las reglas de Firebase lo exigen; ninguna otra). Cada artículo vive en **una** bodega y no cambia de bodega con una edición; para moverlo se hace un **traslado** (botón «Trasladar» en el detalle del artículo): sale de una bodega y entra a la otra, cada una con su movimiento, en una sola escritura. Si en la bodega de destino ya hay ese artículo (mismo nombre) se le suma; si no, se crea ahí con los mismos datos. El mismo nombre puede estar en las 3 bodegas (una vez en cada una). En Inventario, la parte se llama **Bodega** y trae un filtro por bodega; el Resumen suma el valor de cada una.

### Los Excel de la app
Todos los Excel que baja la app salen con el mismo formato: **título en negrilla arriba**, una línea que dice qué es, **columnas en negrilla con color**, cada dato en su cuadro, columnas del ancho justo, la fila de títulos fija al bajar y filtros. Los hay en Inventario (resumen y kárdex de cada artículo), Vehículos, Equipos (equipos y actas, sin cédulas ni firmas), Reuniones (reuniones y tareas) y la **plantilla de personas**.

**Existencias como base de datos de Excel** (modelo; las demás ventanas siguen igual por ahora). En Inventario > Existencias, la Bodega y la Jefe tienen **Descargar base de datos** y **Subir Excel**. El Excel trae una fila por artículo con su código (ID), listas desplegables, solo enteros, Estado y Valor que se calculan solos, filtros y una hoja de Ayuda. Se cambia en Excel y se sube: la app muestra primero qué **agregaría** (fila sin código), **cambiaría** (código con datos distintos; lo vacío se queda como está) y **eliminaría** (solo si la columna Acción dice «Eliminar» y solo la Jefe; borrar la fila no elimina nada), marca lo que está mal y **no guarda nada hasta tocar «Guardar»**. La cantidad solo cambia con «Cantidad real (conteo)» y deja su movimiento de ajuste. Subir el mismo Excel otra vez no repite nada. No es sincronización en vivo: para eso la app final necesitaría algo como Google Sheets (con claves, solo en la copia privada).

La **plantilla de personas** (Personas y permisos > Descargar plantilla) trae lo que ya está: las personas registradas e invitadas en gris («Ya registrada» / «Invitada»), 2 filas de ejemplo en amarillo y debajo filas vacías con **listas desplegables** (rol, niveles y permisos extra). Se agregan las personas nuevas abajo y se sube **la misma plantilla**: lo que ya estaba y los ejemplos se omiten y solo se guarda lo nuevo. (El rol y los permisos de quien ya entró se cambian desde su tarjeta, no desde el Excel.) Los Excel se arman con ExcelJS (`lib/exceljs`, gratis, MIT) y se leen con SheetJS (`lib/xlsx`); ambos se cargan solo al tocar el botón.

### Niveles por persona
Además de su rol, la Jefe le puede poner a cada persona, **por módulo** (Equipos, Inventario, Vehículos, Reuniones): *Como su rol*, *Sin acceso*, *Solo ver* o un nivel de trabajo de ese módulo (por ejemplo, Inventario: *Pide material*, *Hace las compras*, *Encargada de bodega*). Sirve para subir o bajar: un bodeguero que solo mira Equipos, o un conductor que también atiende la bodega. En Reuniones solo se sube o se baja a *Solo ver* (allí cada rol hace su tarea). Las reglas de Firebase lo cumplen: con *Solo ver* o *Sin acceso* ni siquiera se puede leer lo que no toca.

### Quién es quién en la demo (organigrama de la empresa)
Las 46 personas de la demo son las del organigrama (versión 18, febrero de 2023), agrupadas por unidad y con un buscador. **Los nombres y cargos son los reales; los correos (`rol.nombre.apellido@example.com`) y todos los casos que se ven (compras, novedades, reuniones, equipos, cédulas) son inventados.** Todas entran con la misma clave pública `demo-control-2026`.

| Rol en la app | Quiénes | Equipos | Inventario | Vehículos | Reuniones |
|---|---|---|---|---|---|
| Gerente | Oscar Muñoz, Santiago Valencia, Alejandro Giraldo (Proyectos) | Solo ver | Resumen a detalle, sin autorizar. **Solo el Gerente general (Oscar, permiso extra «general»)** autoriza las compras de más de 5 millones y las que pide la Coordinadora; lo que él pide nace autorizado | Solo ver | Solo ver |
| Coordinador de compras (nuevo) | Mauricio Giraldo (Coord. Compras) | No | **Autoriza las compras** (hasta 5 millones; las de más pasan al Gerente general) y revisa las hechas sin autorización. No compra | No | No |
| Jefe | Carolina Castillo (Líder de Abastecimiento) | Todo | Panorama y personas; **ya no autoriza compras** | Todo | Todo |
| Encargado de equipos | Fabián Barbosa (Auxiliar TI) | Mantenimiento y entregas | Pide | No | No |
| Soporte | Ángel Ortiz (Asistente TI; permiso extra: revisa actas) | Recibe y revisa | Pide | No | No |
| Compras | Mauricio Giraldo (Coord. Compras), Fredy Torres | No | Hace las compras | No | Informa |
| Bodega | Andrés Beltrán (**supuesto**: el organigrama no trae bodega) | No | Encargado de bodega | Revisa novedades | Informa |
| Transporte | Wilson Muñoz (Coord. Transporte) | No | Pide | Revisa novedades y documentos | Informa |
| Conductor | Oscar Farfán | No | Pide | Reporta y registra salidas | Confirma el viaje |
| Logística | Elkin Bruno, Julio Flórez (Logístico HSE) | No | Pide | No | Logística |
| Profesional | 13 personas: SGI, Contratos, Control de Gestión, Licitaciones | No | Pide | No | Asiste |
| Administrativo | Paola Martínez; Solanyi Surquira (permiso extra: encargada de reuniones) | No | Pide | No | Registra actas |
| **Colaborador** (nuevo) | 13 personas: recepción, mensajería, servicios generales, Gestión Humana, Gerencia Administrativa, Asistente SGI y el apoyo de contabilidad (Asist. Contable, Auxiliar Contable, Asist. Nómina, Asist. Reembolsables: solo ven lo suyo) | No | Pide | No | Solo ver |
| **Financiero** (nuevo) | 3 personas: Gerente Financiera, Contador y Profesional Contable (los únicos que ven todo el inventario y las compras) | No | Ve todas las compras, facturas y movimientos, y también pide | No | Solo ver |
| **Consulta** (nuevo) | Revisor Fiscal y Oficial de Cumplimiento (el organigrama no trae persona) | No | Solo ver | Solo ver | No |

En Equipos, el **Encargado** hace el mantenimiento y entrega los equipos con el acta (nombre, firma y computador); **Soporte** recibe esos registros y está pendiente de las entregas.

**Permisos extra.** Además del rol que da el código, el Gerente o la Jefe le marcan a cada persona lo que hace de más, en **Personas y códigos** (solo con cuentas propias):
- Bodega: **También hace y recibe compras** (registra las compras autorizadas, como Compras).
- Soporte: **También sigue las actas de entrega** (revisa cada acta: bien o con problema). Ángel, el Soporte de prueba, lo tiene para mostrarlo.
- Administrativo: **Encargada de reuniones** (ve todas las tareas de todas las reuniones y la bandeja de correos; lo que se autoriza sigue siendo de la Jefe).
Firebase revisa los permisos extra en las reglas, no solo la pantalla.

## Archivos
- `index.html`, `app.js`, `demo.css`: la app. `inventario.js`: el módulo Inventario (bodega y compras).
- `push.js`, `sw.js`, `manifest.webmanifest`, `iconos/control-*.png`: avisos al teléfono (Web Push) e instalación en la pantalla de inicio.
- `equipos.js`: el módulo Equipos (Equipos y Entregas juntas, actas virtuales con firma en la pantalla).
- `vehiculos.js`: el módulo Vehículos (las fotos se achican a JPEG antes de guardarse para no pasar el límite de Firebase).
- `reuniones.js`: el módulo Reuniones. `correos-demo.js`: los 4 correos de ejemplo y la respuesta de respaldo de cada uno (se usa si el agente no está conectado o falla).
- `agente/worker.js`: Worker «agente-demo» para Cloudflare. Solo atiende a la Jefe (revisa el token de Firebase y el rol) y tiene límite de lecturas por cuenta; le pasa el correo a Gemini y devuelve en JSON lo que entendió (no escribe en la base). La clave de Gemini debe ser de un proyecto sin facturación. Secreto `GEMINI_API_KEY`; su dirección va en `config.js` (`window.AGENTE_DEMO`).
- `avisos/worker.js`: servidor de avisos «avisos-demo» para Cloudflare Workers (gratis). **Guarda los teléfonos en Cloudflare KV** (no en Firestore, así nadie lee los de los demás), exige el token de Firebase en cada pedido, saca el rol de la base (no de la app) y limita los avisos por cuenta. Se pega a mano en Cloudflare con los secretos `VAPID_D` y `VAPID_PUB` y un **KV namespace enlazado con el nombre `AVISOS`** (Cloudflare > Storage & databases > KV > Create; luego en el Worker: Settings > Bindings > Add > KV namespace, nombre de variable `AVISOS`). La URL del Worker en `config.js` no cambia. Los teléfonos que ya estaban activados hay que activarlos otra vez (se guardaban en Firestore).
- `generar-llaves.html`: crea en el navegador el par de llaves de los avisos. La privada va solo en Cloudflare; la pública va en `config.js` (`window.AVISOS_DEMO`).
- `lib/xlsx/`: SheetJS (Apache-2.0) para descargar el Excel del Resumen.
- `nube.js`: conexión con Firebase (Authentication con correo y clave, y Firestore). Nuevo: no usa la clave compartida de las apps reales ni manda errores a Slack.
- `config.js`: datos del proyecto de Firebase de la demo, ID `fir-app-control-d8494` (no son secretos).
- `personas.js`: los roles, sus permisos y las personas de prueba. `datos-demo.js`: los datos de ejemplo, con fechas relativas al día en que se cargan.
- `firestore.rules`: reglas de la base de datos (entran las personas de prueba y las cuentas propias con correo confirmado; cada nivel lee y escribe solo lo suyo). `firebase.json` solo sirve para el emulador de las pruebas.
- `SEGURIDAD.md`: qué se revisó, qué se encontró y se arregló, y qué falta. Se pegan en Firebase.
- `caribe.css`: el estilo de la demo (azul mar sobrio, relieve con sombras, letra Nunito en `fuentes/nunito.woff2`, licencia SIL OFL 1.1). Va después de `demo.css`.
- `comun.css`, `comun.js`, `iconos.js`, `fuentes/`, `codigos.js`, `lib/codigos/`: copiados de `apps-consulta-previa` (ver `DESIGN.md`). En `iconos.js` se agregaron iconos Phosphor (licencia MIT): inicio, carro, carrito, reunión, cambiar, pagada, correo y llave.
- `gente.js`: panel «Personas y permisos» (solo la Jefe): invitaciones por Excel, personas registradas, rol, acceso, niveles por módulo, permisos extra, códigos y el interruptor de las personas de prueba.
- `buzon/Codigo.gs`: Apps Script del Gmail de prueba. Cada minuto pasa a la app los correos sin leer que hablen de reuniones (solo asunto, texto y fecha; no guarda quién lo mandó).
- `pruebas/`: Firebase falso (`firebase-*.js`) y pruebas con Playwright.

## Rendimiento (frontend)
- **Esqueletos** (`UI.esqueleto`, `UI.esqueletoCifras`): mientras llegan los datos se ven tarjetas, renglones y cuadritos fantasma; el tablero ya no muestra un «0» falso.
- **Buscadores** de Equipos e Inventario: repintan 300 ms después de la última tecla (`UI.retardar`). Vehículos no tiene buscador, solo filtros de un toque.
- **Carga bajo demanda**: `gente.js` (panel de la Jefe) y `codigos.js` (lector de códigos con la cámara, usado en Equipos con el botón «Escanear») se descargan al usarlos (`UI.cargarScript`). Equipos, Inventario, Vehículos y Reuniones siguen cargando al inicio porque Inicio usa sus resúmenes.
- **Repintado**: los datos que llegan en ráfaga repintan una sola vez cada 50 ms (`pintarLuego` en `app.js`); si solo llegaron avisos se repinta la campana y no el módulo; `UI.poner` no rehace una lista si su HTML no cambió.
- **Listas largas** (`UI.pagina`): Kárdex y Movimientos de 50 en 50, historial de un equipo de 30 en 30, con botón «Ver más».
- **Cambios sin guardar**: en las hojas de Equipos, Vehículos e Inventario, si hay algo escrito (o una foto o una firma) y se toca Cancelar, Escape o fuera de la hoja, la app pregunta «¿Salir sin guardar?» (`App.vigilar` en `app.js`). Al guardar no pregunta, y las hojas de solo ver tampoco. Reuniones no pregunta todavía.

## Datos en Firestore
Colecciones nuevas: `invitaciones` (una por correo, en minúscula: nombre, rol, niveles y permisos extra; la crea la Jefe y se gasta al entrar la persona) y `ajustesApp` (`compras` = `{ montoGerente }`, lo cambia solo el Gerente con cuenta propia; `seguridad` = `{ personasPrueba }`, lo cambia solo la Jefe con cuenta propia). En `usuarios`, además del rol, cada perfil puede llevar `permisos` (nivel por módulo que le puso la Jefe). En `compras` y `solicitudes` las cuentas propias dejan su `pideUid`.

Colecciones de primer nivel: `reuniones` y `necesidades` (una tarea por documento: comida, carros, viaje, logística, asistencia y acta), `usuarios` (perfil de cada cuenta propia: nombre, rol y si tiene acceso), `codigos` (código de cada rol de trabajo; lo leen Gerente y Jefe con cuenta propia), `codigosDireccion` (códigos de Gerente y Jefe, de un solo uso; solo el Gerente), `equipos`, `compras`, `articulos`, `movimientos`, `solicitudes`, `vehiculos`, `reuniones`, `hojas` (actas de entrega y devolución con sus firmas), `tareasEq` (agenda de mantenimientos y backups), `avisos`, `buzon` (correos del Gmail de prueba; los leen la Jefe y la Administrativa encargada), `suscripciones` (teléfonos con avisos activados; Reiniciar no las borra) y `demo/estado` (marca y versión de los datos de ejemplo: si la versión guardada es vieja, la app vuelve a cargar los datos de ejemplo). Solo la Jefe carga, actualiza y reinicia los datos de prueba (así lo piden las reglas): si otra persona entra primero, la app le dice que entre una vez como Ana. La Jefe de prueba (Carolina Castillo) tiene en **Cambiar de persona** el botón **Reiniciar los datos de prueba** (usarlo antes de presentar).

## Permisos (los hace cumplir Firebase, no solo la pantalla)
Las reglas (`firestore.rules`) no preguntan «¿qué rol tiene?» sino «¿qué **nivel** tiene en este módulo?» (el de su rol, o el que le puso la Jefe). Cada nivel solo lee lo que le toca: sin acceso no lee nada del módulo, y quien solo pide material no ve los movimientos de la bodega y, con cuenta propia, solo ve **sus** pedidos y compras.
- **Compras**: alguien pide → la **Coordinadora de compras** autoriza → Compras la compra → Bodega la recibe. Nadie autoriza su propio pedido. La Jefe ya **no** autoriza.
  - Si la compra vale **más del monto del Gerente** (por defecto **5.000.000**; lo cambia solo el Gerente general con su cuenta, así la Jefe no lo puede subir), después de la Coordinadora la autoriza el **Gerente general** (estado «Falta el Gerente general»). Lo que pide la Coordinadora lo decide siempre el Gerente general. **Lo que pide el Gerente general nace autorizado** (nadie lo autoriza). El Gerente general también puede decidir cualquier pedido sin esperar (acceso total). Los demás Gerentes y la Jefe **no autorizan**. Cada compra guarda el correo de quien la pidió y la hora del servidor, así no se pueden inventar.
  - **Gerente general:** es un permiso extra («general») que **no marca la Jefe**: se pone a mano en la consola de Firebase (`usuarios/<uid>`, campo `extras` = `["general"]`), igual que los códigos de Gerente. En la demo, Oscar Muñoz lo trae fijo.
  - Antes de decidir se ve todo: cada artículo con su precio, el total, a quién se compra, para qué, las cotizaciones (hasta 3 fotos), lo que hay en bodega y el último precio pagado.
  - Si pagan más del 10 % de lo autorizado, o llega menos de lo comprado, la Coordinadora recibe el aviso (y el Gerente general si él la había autorizado).
- Cualquiera con nivel de pedir pide material y compras a su nombre. Compras registra la compra sin tocar lo autorizado. Las compras y los movimientos no se borran ni se editan (el rastro de lo gastado).
- La bodega recibe, entrega, registra entradas, salidas y conteos; la cantidad nunca queda negativa. La Jefe puede hacer cualquier paso **menos autorizar compras**.
- Cada quien marca como leídos solo sus avisos.

## Pasar a uso real (pasos en la consola de Firebase)
1. Firestore Database > Reglas (Rules): pegar `firestore.rules` y **Publicar**.
2. Authentication > Sign-in method: activar **Correo/contraseña** y **Google**. En Settings > **Authorized domains** debe estar la dirección donde se publica la app (por ejemplo `usuario.github.io`).
3. Authentication > Settings > **Password policy**: poner el mínimo en 10 caracteres y activar «Require email verification» si aparece (la app ya exige el correo confirmado, y las reglas también). En Templates puedes poner en español el correo de confirmación.
4. Crear a mano el **primer código de Jefe** (ver «Cómo entra cada persona»).
5. Cuando se use con datos de la empresa: entrar con la cuenta de la Jefe > Personas y permisos > Seguridad > **Apagar las personas de prueba**, y poner `window.PERSONAS_PRUEBA = false` en `config.js` para quitarlas de la pantalla de entrada. **Ojo:** borrar las cuentas de prueba en Firebase Authentication **no** las apaga (cualquiera puede volver a crearlas con la clave pública y las reglas las aceptan por su correo): lo que las apaga es **el interruptor de la Jefe**. Con el interruptor apagado, las reglas y el Worker de avisos ya no las aceptan.
6. Recomendado (aún no está en el código): activar **App Check** (reCAPTCHA v3, gratis) en Firebase > App Check para que solo la app pueda hablar con la base de datos. Ver `SEGURIDAD.md`.

## Correo real (Gmail de prueba)
El correo llega de verdad: alguien manda un correo de reunión al Gmail de prueba y en menos de un minuto aparece en **Reuniones > Correos** de la Jefe; ella lo lee con el agente y reparte. Solo correos **inventados**: la demo es pública.

Cómo va: Gmail de prueba → Apps Script (no guarda quién lo mandó y tapa correos y teléfonos del texto) (`buzon/Codigo.gs`, corre gratis en Google cada minuto) → entra a Firebase con la cuenta robot `buzon.demo@example.com` → colección `buzon` → la app. La cuenta robot solo puede crear correos en `buzon` (no tiene perfil ni rol).

Pasos (una sola vez):
1. Crear un Gmail nuevo solo para la demo.
2. Firebase > Authentication > Users > **Add user** (agregar usuario): correo `buzon.demo@example.com` y una clave larga que inventes. Esa clave no se le pasa a nadie. Copia el **User UID** (identificador) que le sale.
3. Firestore Database > Datos > **Start collection** (iniciar colección) `ajustes`, documento con ID `buzon` y un campo `uid` (texto) = el UID del paso 2. Así, aunque alguien se registre con ese correo, no puede meter correos: las reglas solo dejan a ese UID.
4. Entrar a script.google.com con el Gmail de prueba > **New project** (proyecto nuevo) > pegar `buzon/Codigo.gs` > guardar.
5. **Project Settings** (configuración del proyecto) > **Script properties** (propiedades del script) > `CLAVE_ROBOT` = la clave del paso 2, y `REMITENTES` = los correos desde donde vas a escribir, separados por coma (si queda vacío no pasa ningún correo).
6. Escoger la función `instalar` > **Run** (ejecutar) > aceptar los permisos de Gmail. Desde ahí revisa el buzón cada minuto. Para apagarlo: `desinstalar`.

## Pruebas
```
npm install            # no hay package-lock.json: npm ci no sirve
npx playwright install chromium     # o usar un Chrome instalado: CHROME=/ruta/a/chrome
npm run lint
npm run pruebas        # corre todo: reglas de Firebase, Workers y la app con navegador
npm run reglas         # solo las reglas, contra el emulador de Firestore (gratis; necesita Java)
```
Las capturas quedan en `capturas/`. Las reglas de Firebase se prueban con el emulador (`pruebas/reglas.mjs`): cada persona intenta lo permitido y lo prohibido (incluidos ataques) y Firebase debe dejar o negar. Después de pegar las reglas en Firebase conviene entrar una vez con cada nivel.
