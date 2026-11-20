# Plan: arreglos de la revisión de seguridad (20 de noviembre de 2026)

Sale de la revisión de seguridad hecha sobre `desarrollo` (commit 04abc95) y de las respuestas de Jeiler:
- Compras de un Gerente: **las autoriza otro Gerente** (nadie se autoriza solo).
- Financieros: **solo Gerente Financiera, Contador y Profesional Contable ven todo**; Asist. Contable, Auxiliar Contable, Asist. Nómina y Asist. Reembolsables pasan a Colaborador (solo ven lo suyo).
- Si la Jefe falta: **el Gerente puede autorizar una compra que lleva más de 2 días sin respuesta de la Jefe**.
- Tareas de reunión: **una por persona** (cada quien decide solo la suya).

Reglas de trabajo: rama `desarrollo`, nada a `main` sin el «sí» de Jeiler, datos inventados, nada que cueste. Un commit por paso. Después de cada paso: `npm run reglas`; al final `npm run lint` y `npm run pruebas` (con `CHROME=/opt/pw-browsers/chromium` si hace falta) y mirar las capturas.

Para cada paso: primero la prueba en `pruebas/reglas.mjs` que **falla** con el código de hoy, después el arreglo, y comprobar que ahora pasa.

---

## Paso 1 — Gerentes y Jefes solo desde la consola (hallazgo 1)
- `firestore.rules`: en `invitaciones` (create/update) agregar `!esDireccion(nuevo().rol)`. En `codigosDireccion`: `allow create: if false` (el delete para gastarlo al registrarse se deja).
- `gente.js`: el Excel rechaza el rol Gerente o Jefe («Gerentes y Jefes se crean desde la consola de Firebase»); quitar Gerente y Jefe de la sección de códigos.
- README y comentarios de las reglas: decir que los códigos de Gerente y Jefe se crean a mano en la consola (como el primero).
- Pruebas: la Jefe no invita ni crea código de `gerente` ni de `jefe`.

## Paso 2 — Compras «sin autorizar» nacen sin revisar y el valor se valida (hallazgos 3 y 6)
- `firestore.rules`, `compras` create: exigir `nuevo().revisada == false` en la rama `sin-autorizar`; en todas las ramas `valorAprox is number && valorAprox >= 0`.
- Sumar las líneas en las reglas (máximo 5): una función `sumaLineas()` que suma `cantidad * precio` de la línea 0 a la 4 según el tamaño, y exigir `valorAprox >= sumaLineas()`. Antes revisar en `inventario.js` cómo se llaman los campos de cada línea. Si pasa del límite de 1000 expresiones, dejar solo `valorAprox >= 0` y anotarlo.
- `SEGURIDAD.md`: corregir lo de «las reglas no pueden sumar».
- Pruebas: `sin-autorizar` con `revisada: true` falla; `valorAprox` negativo, de texto o menor que la suma de las líneas falla.

## Paso 3 — Compras de Gerente con otro Gerente, y respaldo de la Jefe (decisiones b y h)
- Al crear cualquier compra se guardan `pideCorreo` (= correo del token) y `creadoEn` (= `request.time`); las reglas lo exigen.
- Lo que pide un Gerente nace `pedido` (ya no `autorizado`). Lo decide otro Gerente: `esGerente() && antes().pideRol == 'gerente' && antes().pideCorreo != request.auth.token.email`.
- Respaldo: el Gerente puede autorizar o rechazar una compra `pedido` de otra persona (no suya) si `request.time > antes().creadoEn + duration.value(2, 'd')`. Queda `autorizado` directo (él es el paso de arriba).
- `inventario.js`: botones y textos («La pidió un Gerente: la autoriza otro Gerente», «La Jefe no ha respondido en 2 días: puedes autorizarla tú»). `datos-demo.js`: ajustar las compras de ejemplo del Gerente.
- README, tabla «Quién es quién» y sección Compras.
- Pruebas: el Gerente no se autoriza la suya; otro Gerente sí; el Gerente no se salta a la Jefe antes de 2 días; después de 2 días sí. Vigilar el límite de expresiones (la regla de `compras` update es la más cara).

## Paso 4 — El historial de las compras solo crece (hallazgo 4)
- `firestore.rules`: agregar `historialSigue()` a las ramas de decidir (`decideCampos`), comprar, recibir y marcar revisada.
- `inventario.js`: revisar que cada paso agregue una línea al historial (no lo reemplace). Ajustar las pruebas viejas que mandan `historial: []`.
- Pruebas: vaciar o cambiar una línea vieja del historial falla en cada paso.

## Paso 5 — Pausar sí detiene todo, y el código exige correo confirmado (hallazgo 5)
- `firestore.rules`, `novedades` update: `(esJefe() || (esDemo() && nivel('vehiculos') == 'autoriza'))`.
- Buscar cualquier otro `nivel(` o `rol()` usado sin `esDemo()` y cerrarlo igual.
- `porCodigo()`: exigir `request.auth.token.email_verified == true`.
- Pruebas: cuenta pausada de Transporte no revisa una novedad; cuenta sin confirmar no crea su perfil con código.

## Paso 6 — Bodega deja rastro (hallazgo 7)
- `articulos`: limitar los campos que Bodega cambia. Si cambia `cantidad`, exigir un movimiento creado en la misma escritura (`existsAfter` de `movimientos/<id>` que se pasa en el artículo como `ultimoMov`) con la diferencia correcta. Revisar en `inventario.js` cómo se escriben hoy las entradas, salidas, conteos y recepciones, y pasarlas a una sola escritura en lote (batch).
- `solicitudes` update: Bodega solo cambia `estado`, `entregado`, `entregadoPor`, `entregadoEn`, `motivo`, `historial` (revisar los nombres reales en `inventario.js`); nunca `pideUid` ni `pideRol`.
- Pruebas: cambiar la cantidad sin movimiento falla; cambiar `pideUid` falla.
- Si el cambio de cantidad con movimiento pasa del límite de expresiones o rompe mucho la app, hacer solo lo de los campos y anotarlo en `SEGURIDAD.md`.

## Paso 7 — Avisos al teléfono cerrados (hallazgo 2)
- `suscripciones`: el id del documento es el `uid` de la cuenta (o `uid` + teléfono); cada quien lee, crea, cambia y borra solo las suyas. Quien manda un aviso ya no lee las suscripciones de los demás.
- `avisos/worker.js`: exigir el token de Firebase (copiar la revisión del token de `agente/worker.js`); el Worker lee las suscripciones del destinatario en Firestore (REST con el token de quien manda, o una lista por rol que solo el Worker pueda leer) y le pone un límite de envíos por cuenta. Elegir lo más simple que funcione en el plan gratis de Cloudflare.
- `push.js` y `app.js`: mandar el token; ya no mandar la lista de suscripciones.
- Pruebas (`pruebas/push.mjs`): sin token o con token falso → 401; una persona no lee ni borra la suscripción de otra (en `reglas.mjs`).
- Jeiler tendrá que volver a pegar el Worker en Cloudflare (se le dan los pasos; no cuesta).

## Paso 8 — Avisos de la campana sin suplantar (hallazgo 9)
- `avisos` create: `keys().hasOnly([...])` con los campos reales (revisar `app.js`), textos con largo máximo y `deUid == request.auth.uid` (o `deCorreo == correo del token`).
- Pruebas: crear un aviso a nombre de otra persona falla.

## Paso 9 — Tareas de reunión por persona (decisión g)
- Cada tarea (`necesidades`) lleva `responsableCorreo` (correo de la persona de prueba o de la cuenta). Las reglas exigen que quien la decide tenga ese correo; si la tarea no lo trae (datos viejos), se deja por rol.
- La asistencia: la Jefe crea una tarea de asistencia **por profesional** invitado. El viaje: lleva el correo del conductor escogido, y solo ese conductor lo confirma o lo devuelve.
- `reuniones.js`: crear una tarea por persona al repartir; «Mis tareas» filtra por correo; el resumen muestra quién sí, quién no y quién falta (aprovechar para aclarar la lista confusa de la Fase C).
- `datos-demo.js`: tareas de ejemplo con los correos de las personas de prueba.
- Pruebas: un profesional no decide la asistencia de otro; un conductor no devuelve el viaje de otro.

## Paso 10 — Financieros (decisión e)
- `personas.js` (`DE_PRUEBA`): Andrea Correa (Asist. Contable), Heidy Lorena Castillo (Auxiliar Contable), Harold Beltrán (Asist. Nómina) y Leidy Ramos (Asist. Reembolsables) pasan a `colaborador` (su correo de prueba cambia de `financiero.` a `colaborador.`). Adriana Patiño, Nury Acosta y Fanny Benavides siguen en `financiero`.
- `gente.js` (`ROL_ALIAS`): «asist contable», «auxiliar contable», «asist nomina», «asist reembolsables» → `colaborador`.
- README tabla «Quién es quién»: Financiero 3 personas, Colaborador 13.
- Pruebas: la de «los niveles de las reglas coinciden con personas.js» debe seguir pasando.

## Paso 11 — Detalles menores (hallazgos 10 y 11)
- SheetJS: bajar la 0.20.3 de `cdn.sheetjs.com` a `lib/xlsx/` (licencia Apache-2.0, actualizar `LEEME.txt`). Si el entorno no la deja bajar, anotarlo y darle a Jeiler el comando para hacerlo.
- Quién autoriza: guardar además `autorizaCorreo`/`revisadaPorCorreo` = correo del token (las reglas lo exigen), para que el nombre no se pueda falsificar.
- `compras`: cada cotización debe empezar con `data:image/jpeg;base64,` (revisar el formato real en `inventario.js`).
- Extras: en las reglas, `compra` solo cuenta si el rol es `asistente`, `actas` si es `soporte`, `encargada` si es `administrativo` (igual que `personas.js`).
- README «Pasar a uso real»: aclarar que borrar las cuentas de prueba en Firebase no las apaga; solo el interruptor de la Jefe.

## Paso 12 — Cierre
- `npm run lint`, `npm run pruebas`, mirar las capturas.
- Probar el límite de 1000 expresiones con **cuentas propias** (no solo personas de prueba): Bodega recibiendo una compra, Gerente autorizando por respaldo, Compras registrando.
- Actualizar `SEGURIDAD.md` (qué se arregló, qué quedó pendiente) y `SIGUIENTE.md`.
- Push a `desarrollo`. A `main` solo con el «sí» de Jeiler.
- Decirle a Jeiler qué quedó sin probar (el Worker en Cloudflare real, las reglas en el Firebase real).
