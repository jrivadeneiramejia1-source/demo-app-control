# Seguridad de la app (informe)

Revisión hecha el 20 de noviembre de 2026 sobre la rama `desarrollo`. Todo con herramientas gratis. Aquí no hay claves ni datos reales.

## Qué se revisó y con qué
| Qué | Herramienta | Resultado |
|---|---|---|
| Fallas en el código (XSS y similares) | Semgrep (`p/javascript`, `p/security-audit`, `p/xss`) | Antes y después: 1 aviso, en un archivo de pruebas (`pruebas/worker.mjs`, cifrado AES-GCM de la prueba). Nada en la app. |
| Claves olvidadas en archivos | detect-secrets | 13 avisos, todos falsos: la clave web de Firebase (`config.js`, pública por diseño), textos de error y claves de prueba inventadas. |
| Claves en todo el historial de git | Búsqueda de patrones (llaves privadas, `ghp_`, `sk-`, `AKIA`, etc.) | 0 hallazgos. Gitleaks no se pudo bajar (GitHub lo bloqueó desde el entorno). |
| Librerías con fallas conocidas | `npm audit` | Antes: 2 moderadas (`eslint`). Ahora: 20 (15 moderadas, 5 altas), **todas en herramientas de prueba** (`firebase`, `firebase-tools` y `@firebase/rules-unit-testing`, para Node). No se publican con la app. Los «arreglos» que propone npm son versiones más viejas, así que se aceptan. |
| Reglas de Firebase | Emulador de Firestore + `pruebas/reglas.mjs` (**265 pruebas**, última corrida) | Todas pasan. Incluye pruebas de ataque y los pasos más pesados con **cuentas propias** (no solo personas de prueba), para comprobar el límite de 1000 expresiones. |
| La app con navegador | Playwright (`pruebas/prueba.mjs`; 789 bien y 0 mal en la pasada final de las 3 bodegas) | Todas pasan. Incluye texto con HTML malicioso en compras, artículos y líneas. |

## Qué se encontró y se arregló
1. **Las reglas dejaban leer casi todo a cualquier persona con sesión** (Equipos, Vehículos, compras, reuniones), aunque la pantalla dijera «sin acceso». Ahora cada módulo se lee solo con su nivel.
2. **Cualquiera con una cuenta nueva podía entrar sin confirmar su correo.** Ahora las reglas exigen el correo confirmado.
3. **Las personas de prueba (clave pública) mandaban igual que las reales.** Ahora la Jefe (con cuenta propia) puede apagarlas desde el panel; las reglas lo hacen cumplir.
4. **El Gerente manejaba códigos y personas.** Ahora solo la Jefe, y la Jefe no puede tocar a otra Jefe ni al Gerente.
5. **La Jefe podía editar compras ya autorizadas y borrar compras y movimientos.** Ahora cada paso solo cambia sus campos y el rastro de lo gastado no se borra.
6. **Una regla de Compras se pasaba del límite de 1000 expresiones de Firebase** y habría impedido a una Bodega recibir una compra. Se rehízo revisando primero lo barato (el estado).
7. **Texto sin limpiar en «Recibir la compra»** (el nombre de un artículo se pegaba como HTML). Se arregló y hay una prueba de ataque que falla sin el arreglo.
8. **Nombres que empiezan con `=`, `+`, `-` o `@`** en el Excel de personas (se vuelven fórmulas al abrirlos en Excel): se rechazan.
9. **Clave mínima de 6 caracteres:** ahora la app pide 10.
10. **Quien solo pide material veía todo lo de los demás:** ahora, con cuenta propia, solo ve lo suyo, y no ve los movimientos de la bodega.

## Segunda revisión (con Opus) y lo que se arregló
Una revisión aparte sobre `desarrollo` encontró lo siguiente; todo está arreglado y con pruebas que **fallaban antes del arreglo**:
1. **Gerentes y Jefes solo se crean desde la consola de Firebase.** Antes una cuenta robada de la Jefe podía invitar o crear códigos de Gerente y Jefe. Ahora las invitaciones y el Excel los rechazan y `codigosDireccion` no se puede crear desde la app.
2. **Avisos al teléfono cerrados.** Los teléfonos ya no están en Firestore: los guarda el Worker de avisos en Cloudflare KV. El Worker exige el token de Firebase en cada pedido, **saca el rol de la base** (no de lo que diga la app), respeta el interruptor de las personas de prueba y limita los avisos por cuenta (20 por minuto, 300 por día). Nadie lee ni borra los teléfonos de otros.
3. **Compras «sin autorizar» nacen sin revisar**, y el valor de cualquier compra se valida (número, no negativo, no menor que la suma de sus líneas).
4. **El historial de las compras solo crece** en cada paso (decidir, comprar, recibir, revisar): no se vacía ni se cambia una línea vieja.
5. **Pausar una cuenta ahora sí la detiene** también en novedades de vehículos, y el código de rol exige el correo confirmado.
6. **La bodega deja rastro:** cada cambio de cantidad de un artículo viene con su movimiento en la misma escritura y con la diferencia exacta; los pedidos de material solo se entregan o se cierran y nunca cambian de dueño.
7. **Las compras de un Gerente las decide otro Gerente.** Respaldo: si la Jefe no responde en 2 días, el Gerente puede autorizar o rechazar lo que pidió otra persona. Cada compra guarda el correo de quien la pidió y la hora del servidor.
8. **Los avisos de la campana llevan la cuenta de quien los crea** (no se escriben a nombre de otra persona), solo los campos de siempre y textos de largo razonable.
9. **La asistencia y el viaje son por persona:** cada profesional decide solo su asistencia y cada conductor solo su viaje (llevan el correo de a quién le toca).
10. **Quien decide una compra deja su correo** (`autorizaCorreo`, `revisadaPorCorreo`): el nombre escrito no se puede usar para hacerse pasar por otra persona. La segunda firma no puede cambiar el nombre de la primera.
11. **Los permisos extra solo valen en su rol** (`compra` en Bodega, `actas` en Soporte, `encargada` en Administrativo) y **las cotizaciones deben ser fotos JPEG**.
12. **SheetJS (Excel) subido de 0.18.5 a 0.20.3** (la vieja tenía fallos al leer archivos de otras personas).
13. **Financieros:** solo la Gerente Financiera, el Contador y la Profesional Contable ven todo el inventario; las asistentes y auxiliares de contabilidad quedaron como Colaboradores (solo ven lo suyo).
14. **Límite de 1000 expresiones:** se hicieron más baratas las consultas de nivel y de las tareas de reunión; hay pruebas con cuentas propias de cada paso pesado.

## Tercera revisión: las 3 bodegas (reglas nuevas)
Cada movimiento y cada pedido de material guardan su bodega (Riohacha, Guamal o Bogotá), y si un pedido sale de otra bodega queda escrito por qué. Lo que cambió en `firestore.rules` (todo con pruebas en `pruebas/reglas.mjs`):
1. **Movimientos (crear):** `bodega` es obligatoria, es una de las 3 y **es la misma de su artículo** (un artículo viejo sin bodega deja pasar). Si trae `bodegaOtra` (traslado), también es una de las 3. Si trae `bodegaPedida` distinta de `bodega` (se atendió el pedido de otra bodega), debe traer `motivoBodega` de 5 a 160 letras. Un movimiento sin bodega, con «Medellín» o con «riohacha» (minúscula) ya no se crea.
2. **Pedidos (crear):** `bodega` obligatoria y una de las 3 (sin bodega o «bogota» no pasa).
3. **Pedidos (entregar o cerrar):** además de `estado`, `entregadaPor`, `fechaEntrega` y `motivo` se permiten `bodegaSurte`, `articuloSurteId` y `motivoBodega`, y **la bodega del pedido no se puede cambiar**. Si `bodegaSurte` no es la pedida, hace falta el motivo (5 a 160 letras). Un pedido viejo sin bodega se entrega sin motivo. Quien solo pide no puede poner esos campos.
4. **Nada reescribe historiales** y Bodega con cuenta propia sigue sin poder editar ni borrar movimientos.
5. **Lo que NO miran las reglas (solo la app):** la bodega de cada línea de una compra (`lineas[i].bodega`), a qué bodega llegó lo recibido (`lineaArticuloId`), que `articuloSurteId` sea el artículo del que salió lo entregado y que `solicitudId` de una compra exista. Se dejó así para no gastar el margen de las reglas (ver el punto siguiente).
6. **Límite de 1000 expresiones, antes y después:** se midió cuánto margen quedaba agregando relleno (K ≈ 20 expresiones de más por regla marcada). **K antes = 2 y K después = 2**: las reglas nuevas no gastaron margen. **La regla más justa es la de crear una compra del Gerente general**, que ya estaba así y no se tocó. El margen es corto (unas 40 expresiones): hay que medirlo de nuevo antes de agregar condiciones a esa regla.
7. **Pruebas de reglas: 265, todas bien.** Incluyen la siembra de los datos de ejemplo versión 20 con la Jefe de prueba y una entrega desde otra bodega en un solo lote (pedido, artículo, movimiento y aviso) con cuenta propia de Bodega.

**Publicar reglas y app juntas (importante).** Reglas nuevas con la app vieja = **no se crean pedidos ni movimientos** (la app vieja no manda `bodega`). App nueva con reglas viejas = falla «Entregar» desde otra bodega (las reglas viejas no aceptan los campos nuevos del pedido). Por eso se pegan las reglas en Firebase justo antes de pasar la app a `main`, y se entra una vez con cada nivel. Además, **al subir los datos de ejemplo a la versión 20, la primera vez que entre la Jefe de prueba a la demo publicada se borran y recargan los datos de prueba** (avisar antes).

**Historial completo de carros y artículos:** se arma en pantalla con datos que ya existen y **no escribe nada nuevo**; por eso no cambió ninguna regla de Vehículos ni se le dieron permisos nuevos al Conductor.

## Nombres reales en una demo pública
Por decisión de Jeiler (20-nov-2026), la demo pública lleva los **nombres y cargos de 44 personas del organigrama de la empresa** y su **logo** (marca registrada), para que en la presentación se vea quién es quién. No lleva correos, cédulas ni teléfonos reales (los correos son `@example.com` y los casos son inventados), y la entrada avisa qué es real y qué inventado. Cualquiera que abra la página puede ver esos nombres, porque la clave de las personas de prueba es pública. Si la empresa pide quitarlos: se cambian en `personas.js` (lista `DE_PRUEBA`) y se reemplaza `iconos/`. La app real con datos de la empresa va aparte (copia privada y otro Firebase).

## Qué NO está hecho o no se probó (dicho claro)
- **App Check** (que solo la app pueda hablar con Firebase): no está en el código. Se activa en la consola (reCAPTCHA v3, gratis) y luego hay que sumar su librería a `nube.js`. Sin eso, quien tenga la configuración pública puede intentar hablar con Firebase directo; lo detienen las reglas, no App Check.
- **OWASP ZAP** (ataque a la app en marcha) y **Gitleaks** no se corrieron (no se pudieron bajar desde el entorno).
- **Las reglas con el Firebase real:** se probaron en el emulador, no en el proyecto publicado. Hay que pegarlas y entrar una vez con cada nivel.
- **Entrar con Google y los correos de confirmar clave** se probaron con un Firebase falso. Con el real hay que activar Google, autorizar el dominio de la app y probar una vez con un correo de verdad.
- **Total de una compra (arreglado):** las reglas ahora suman el valor de cada línea (hasta 5) y exigen que el total (`valorAprox`) no sea menor, que sea un número y que no sea negativo. Una compra «sin autorizar» nace sin revisar.
- **Avisos de la campana (`avisos`)**: todos los que entran a la app siguen pudiendo **leer** los avisos de todos (cada pantalla muestra solo los suyos); ya no se pueden crear a nombre de otra persona. No llevan montos sensibles más allá de lo que dice la compra. Pendiente cerrarlo por destinatario.
- **El Worker de avisos nuevo no se probó con Cloudflare real:** se probó con un KV, un Firestore y un servicio de notificaciones falsos. Hay que enlazar el KV `AVISOS` en Cloudflare, volver a pegar el Worker (ver README) y volver a activar los avisos en cada teléfono. El límite por cuenta del Worker es aproximado (vive en la memoria de cada copia).
- **Los extras de las personas de prueba** (Ángel con «actas», Solanyi «encargada») siguen fijos en las reglas por su correo.
- **El Firebase SDK de la app** se carga desde `gstatic.com` en la versión 10.12.2 (antigua). Conviene subirla a una versión actual y probar con Firebase real.
- **Reuniones**: con un nivel puesto por la Jefe solo se puede subir o bajar a «solo ver»/«sin acceso». La asistencia y el viaje ya son por persona; las demás tareas (logística, acta) siguen por rol.
- **Respaldo del Gerente a los 2 días:** se probó con fechas del emulador; el reloj es el del servidor de Firebase, pero hay que ver cómo se siente en la práctica (¿2 días corridos o hábiles?).
- **Las tareas de ejemplo de datos-demo** con `creadoEn` como texto no sirven para probar el respaldo: se prueba creando una compra nueva y esperando (o en el emulador).
- **Pedidos de material con varias líneas y préstamo de herramientas (que quedan «por devolver»)** no se hicieron.
- **Las 3 bodegas, sin probar de verdad:** las reglas nuevas con el Firebase real; los Excel nuevos abiertos en Excel o LibreOffice reales; imprimir la orden de compra («ENTREGAR EN») en un celular real; el historial con cientos de registros reales; los avisos al teléfono con los textos nuevos; dos personas sacando lo último a la vez; la clase ABC con datos reales.
