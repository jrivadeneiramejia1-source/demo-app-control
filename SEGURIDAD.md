# Seguridad de la app (informe)

Revisión hecha el 20 de noviembre de 2026 sobre la rama `desarrollo`. Todo con herramientas gratis. Aquí no hay claves ni datos reales.

## Qué se revisó y con qué
| Qué | Herramienta | Resultado |
|---|---|---|
| Fallas en el código (XSS y similares) | Semgrep (`p/javascript`, `p/security-audit`, `p/xss`) | Antes y después: 1 aviso, en un archivo de pruebas (`pruebas/worker.mjs`, cifrado AES-GCM de la prueba). Nada en la app. |
| Claves olvidadas en archivos | detect-secrets | 13 avisos, todos falsos: la clave web de Firebase (`config.js`, pública por diseño), textos de error y claves de prueba inventadas. |
| Claves en todo el historial de git | Búsqueda de patrones (llaves privadas, `ghp_`, `sk-`, `AKIA`, etc.) | 0 hallazgos. Gitleaks no se pudo bajar (GitHub lo bloqueó desde el entorno). |
| Librerías con fallas conocidas | `npm audit` | Antes: 2 moderadas (`eslint`). Ahora: 20 (15 moderadas, 5 altas), **todas en herramientas de prueba** (`firebase`, `firebase-tools` y `@firebase/rules-unit-testing`, para Node). No se publican con la app. Los «arreglos» que propone npm son versiones más viejas, así que se aceptan. |
| Reglas de Firebase | Emulador de Firestore + `pruebas/reglas.mjs` (88 pruebas) | Todas pasan. Incluye pruebas de ataque. |
| La app con navegador | Playwright (`pruebas/prueba.mjs`, 322 pruebas) | Todas pasan. Incluye texto con HTML malicioso en compras, artículos y líneas. |

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

## Nombres reales en una demo pública
Por decisión de Jeiler (20-nov-2026), la demo pública lleva los **nombres y cargos de 44 personas del organigrama de la empresa** y su **logo** (marca registrada), para que en la presentación se vea quién es quién. No lleva correos, cédulas ni teléfonos reales (los correos son `@example.com` y los casos son inventados), y la entrada avisa qué es real y qué inventado. Cualquiera que abra la página puede ver esos nombres, porque la clave de las personas de prueba es pública. Si la empresa pide quitarlos: se cambian en `personas.js` (lista `DE_PRUEBA`) y se reemplaza `iconos/`. La app real con datos de la empresa va aparte (copia privada y otro Firebase).

## Qué NO está hecho o no se probó (dicho claro)
- **App Check** (que solo la app pueda hablar con Firebase): no está en el código. Se activa en la consola (reCAPTCHA v3, gratis) y luego hay que sumar su librería a `nube.js`. Sin eso, quien tenga la configuración pública puede intentar hablar con Firebase directo; lo detienen las reglas, no App Check.
- **OWASP ZAP** (ataque a la app en marcha) y **Gitleaks** no se corrieron (no se pudieron bajar desde el entorno).
- **Las reglas con el Firebase real:** se probaron en el emulador, no en el proyecto publicado. Hay que pegarlas y entrar una vez con cada nivel.
- **Entrar con Google y los correos de confirmar clave** se probaron con un Firebase falso. Con el real hay que activar Google, autorizar el dominio de la app y probar una vez con un correo de verdad.
- **Revisión por la Jefe del total de una compra:** las reglas no pueden sumar las líneas de una compra (no hay bucles), así que el total (`valorAprox`) lo calcula la app. Una persona con conocimientos podría escribir un total menor que la suma de sus líneas para no pasar por el Gerente. Mitigación: el Gerente y la Jefe ven la tabla con cada precio antes de decidir.
- **Avisos (`avisos`)**: todos los que entran a la app pueden leer los avisos de todos (cada pantalla muestra solo los suyos). No llevan montos sensibles más allá de lo que dice la compra. Pendiente cerrarlo por destinatario.
- **El Firebase SDK de la app** se carga desde `gstatic.com` en la versión 10.12.2 (antigua). Conviene subirla a una versión actual y probar con Firebase real.
- **Reuniones**: con un nivel puesto por la Jefe solo se puede subir o bajar a «solo ver»/«sin acceso»; las tareas de cada rol siguen atadas al rol.
- **Pedidos de material con varias líneas y préstamo de herramientas (que quedan «por devolver»)** no se hicieron.
