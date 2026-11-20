# Plan de las fases A, B y S (acordado con Jeiler el 20 de noviembre de 2026)

Cuando Jeiler diga «haz el plan» o «ejecuta», se hace todo lo de abajo, en este orden, con las respuestas del jefe a las preguntas pendientes. Solo Inventario queda como versión final (como si fuera la pagada, pero gratis). Equipos, Vehículos y Reuniones se dejan como están. Antes: pasar a `SIGUIENTE.md` un enlace a este plan (ya hecho).

## Lo que se encontró al revisar el código

- Las reglas casi no limitan la lectura: `equipos`, `vehiculos`, `novedades`, `entregas`, `compras`, etc. tienen `allow read: if esDemo()`. Un rol con «Sin acceso» los puede leer saltándose la pantalla. Para que «solo ver» sea real hay que cerrar la lectura por módulo (y en `nube.js` escuchar con filtros cuando la regla lo pida, por ejemplo «solo mis compras»).
- Las pruebas usan un Firebase falso: las reglas no se prueban. En el contenedor de la nube sí corre el emulador de Firebase (Java 21 y la descarga del emulador funcionan). Es gratis.

## Fase A — Roles, permisos por persona e ingreso

- **A0.** Emulador de Firestore + pruebas de reglas por rol (qué puede leer y escribir cada uno) y pruebas de ataque (intentar lo prohibido y que falle).
- **A1.** «Personas y códigos» pasa a ser solo de la Jefe. El Gerente ya no lo ve; sigue con su resumen como está.
- **A2.** Permisos por persona: en la ficha de cada persona, por módulo, la Jefe escoge «Como su rol», «Sin acceso», «Solo ver» o un nivel de ese módulo (Equipos: Encargado/Soporte; Inventario: Pide/Compras/Bodega; Vehículos: Reporta/Autoriza; Reuniones: los suyos). Sirve para subir o bajar. Las reglas pasan de preguntar el rol a preguntar el nivel del módulo (`nivel('inventario')`), con los niveles fijos de las personas de prueba dentro de las reglas (como `extrasPrueba`).
- **A2b.** Invitaciones por Excel: la Jefe sube un Excel (nombre, correo, rol, permisos). La app lo organiza sola (espacios, minúsculas, «bodeguero» = Bodega), muestra lo que entendió y marca errores antes de guardar. Se guarda `invitaciones/<correo>`. Se entrega una plantilla con datos inventados. Los datos reales no pasan por el chat ni por el repo.
- **A2c.** Primer ingreso: la persona toca «Es mi primera vez», escribe su correo y una contraseña que ella inventa (mínimo 10 caracteres). Firebase le manda un correo para confirmar que es suyo; sin confirmar no entra. Al confirmar, la app lee la invitación de su correo (la regla exige `email_verified` y que el correo sea el del documento) y crea su perfil con ese rol y permisos; la persona no escoge su rol. Si no está invitada: «Tu correo no está en la lista. Habla con la Jefe». «Olvidé mi clave» manda el correo para cambiarla. Todo gratis en el plan Spark.
- **A2d.** Entrar con Google: botón «Continuar con Google». El correo de Google ya viene confirmado, así que entra directo si está invitado. Solo sirve si el correo es de Google (Gmail o de una empresa con Google); los demás usan correo y clave. Jeiler activa Google en Firebase > Authentication > Sign-in method (con los pasos explicados) y revisa que el dominio de GitHub Pages esté en «Authorized domains» (dominios autorizados).
- **A3.** Lo que ve cada rol: se ajusta a medida que Jeiler diga qué hace cada uno.
- **A4.** Nombres reales solo en Firebase, nunca en el código ni en `datos-demo.js`.

## Fase B — Inventario a fondo (versión final)

Ideas tomadas de apps parecidas: Sortly (estados de la orden y solo el dueño borra), Zoho Inventory (aprobación en varios niveles, el rechazo detiene), Procurify (reglas por monto, comparar lo pedido, pagado y recibido), Snipe-IT y Shelf (lo que se gasta y lo que se presta y vuelve), guías de compras (cotizaciones desde un monto, conteo por turnos según el valor, ABC).

- **B1.** Compras con varias líneas (qué, cantidad, valor de cada uno, subtotal), proveedor, para qué, proyecto y hasta 3 cotizaciones con foto. El Gerente ve todo eso al autorizar, más el último precio pagado y lo que hay en bodega.
- **B2.** Alertas: pagado más de lo autorizado (más del 10 %) y llegó menos de lo comprado.
- **B3.** Pedidos de material con varias líneas y entrega parcial; herramientas prestadas que quedan «por devolver».
- **B4.** Kárdex por artículo (cada entrada y salida con su saldo, a Excel) y mínimo sugerido según lo que salió en 30 días.
- **B5.** Tablero de la Jefe: lo urgente arriba (agotados, por autorizar, sin autorización, pagos de más, pedidos esperando más de 2 días), valor de la bodega, gasto del mes contra el mes pasado, por proyecto y por persona.
- **B6.** Revisar con lógica cada rol que toca el inventario (quien pide, Compras, Bodega, Jefe, Gerente) y cerrar las reglas para que cada quien lea solo lo suyo.
- **B7.** Playwright con cada rol, pruebas de reglas en el emulador y capturas revisadas.

## Fase S — Seguridad (todo gratis)

- Antes de empezar, sobre lo que hay: Semgrep (fallas en el código, como XSS), Gitleaks (claves en el código y el historial), `npm audit`.
- Al terminar la B: lo anterior otra vez, pruebas de ataque a las reglas en el emulador y OWASP ZAP contra la app corriendo en local.
- Además: contraseña de 10 caracteres o más, correo confirmado obligatorio, historial de quién cambió qué en el inventario, y pasos para que Jeiler active Firebase App Check (reCAPTCHA v3, gratis) en la consola.
- Se entrega un informe con lo encontrado y lo arreglado.

## Preguntas pendientes (las responde el jefe)

1. ¿Quién crea los códigos o invitaciones de Gerente y Jefe? a) La Jefe, de un solo uso (recomendado). b) A mano en Firebase.
2. ¿Una Jefe puede pausar o cambiar a otra Jefe? a) No, solo desde Firebase (recomendado). b) Sí.
3. «Ver y editar»: ¿sirve escoger el nivel del módulo (A2)?
4. ¿Qué compras autoriza el Gerente? a) Solo las que pide la Jefe (como ahora). b) Además, todas las que pasen de un monto (¿cuánto?).
5. ¿Una bodega o varias (por proyecto)? Recomendado: una ahora y varias como «Versión pagada».

## Respuestas del jefe (20 de noviembre de 2026, tarde) y decisiones finales

Estas mandan sobre las preguntas pendientes de arriba.

1. **Códigos o invitaciones de Gerente y Jefe:** no respondió. Se aplica lo recomendado: los crea la Jefe y sirven una sola vez. El primer código de Jefe se crea a mano en Firebase (explicarlo en el README).
2. **Pausar o cambiar a otra Jefe:** el jefe dijo que NO se cambia de jefe. Una Jefe no puede pausar ni cambiar el rol de otra Jefe ni del Gerente; eso solo se hace desde la consola de Firebase. «Pausar» = quitarle el acceso a una persona por un tiempo (no ve nada hasta que se lo devuelvan).
3. **Ver y editar:** SÍ, como en A2 (la Jefe escoge por persona y por módulo qué ve y con qué nivel). El jefe prefiere que una sola persona maneje los permisos: el panel de personas y permisos es SOLO de la Jefe.
4. **Compras que autoriza el Gerente:**
   - Hay un monto límite guardado en Firebase (`ajustesApp/compras.montoGerente`), inicial $1.000.000. Solo el Gerente lo cambia (desde su Resumen), para que la Jefe no lo pueda subir y saltarse la revisión. Las reglas lo hacen cumplir.
   - Compra por debajo del monto: la autoriza la Jefe. Igual o mayor al monto: después de la Jefe, la autoriza el Gerente (dos pasos: «autorizada por la Jefe» y luego «autorizada por el Gerente»). Si alguno rechaza, se detiene.
   - Compra que pide la Jefe: siempre la autoriza el Gerente (como ahora), sin importar el monto.
   - El Gerente también puede pedir compras (no es lo normal): pasan directo a Compras marcadas «Pedida por el Gerente», porque nadie está por encima de él; quedan en el resumen y en el historial.
   - Nadie autoriza su propio pedido. El Gerente ve el detalle completo (B1) antes de autorizar.
5. **Una bodega o varias:** no respondió. Se aplica lo recomendado: una bodega ahora; varias bodegas como «Versión pagada».

## Cómo se entrega

Rama `desarrollo`; a `main` solo con el «sí» de Jeiler (también falta pasar el commit 91ed074). `npm run lint`, `npm run pruebas`, pruebas de reglas, capturas revisadas y decir qué quedó sin probar.
