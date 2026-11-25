# Guía completa de la app «Control»
*(para Jeiler, escrita el 21 de noviembre de 2026. Todo en un solo lugar.)*

Esta guía explica **cómo entra cada persona, quién invita a quién, qué hace cada rol en cada pestaña y qué tiene permitido o prohibido**. Está escrita en palabras simples. Si algo no se entiende, dímelo y lo explico mejor.

**Una advertencia antes de empezar.** Hay una parte que ya está hecha y probada pero **todavía no está publicada**: los Excel con formato bonito (título, negrillas, cuadros), la plantilla de personas que trae lo que ya está, y los botones nuevos de Excel en Equipos y Reuniones. Un control de seguridad bloqueó guardarlos (ver el capítulo 13). Cuando lo ajustes y yo guarde, quedan en la app. Todo lo demás de esta guía ya está en la app publicada.

---

## Índice
1. [Qué es la app y de qué partes se compone](#1-qué-es-la-app-y-de-qué-partes-se-compone)
2. [Palabras que se usan (glosario)](#2-palabras-que-se-usan-glosario)
3. [Cómo se entra a la app](#3-cómo-se-entra-a-la-app)
4. [La Jefe: de cero a cien](#4-la-jefe-de-cero-a-cien)
5. [Los Gerentes: cómo entran y qué hacen](#5-los-gerentes-cómo-entran-y-qué-hacen)
6. [Cómo entra la gente normal (invitación y códigos)](#6-cómo-entra-la-gente-normal-invitación-y-códigos)
7. [Las pantallas de la app (lo que se ve)](#7-las-pantallas-de-la-app-lo-que-se-ve)
8. [Inventario a fondo (compras, bodega, pedidos)](#8-inventario-a-fondo-compras-bodega-pedidos)
9. [Equipos](#9-equipos)
10. [Vehículos](#10-vehículos)
11. [Reuniones](#11-reuniones)
12. [Quién es quién: cada persona de la demo y qué hace](#12-quién-es-quién-cada-persona-de-la-demo-y-qué-hace)
13. [Los Excel](#13-los-excel)
14. [Seguridad: qué protege la app y qué no](#14-seguridad-qué-protege-la-app-y-qué-no)
15. [Cosas que faltan o se pueden mejorar](#15-cosas-que-faltan-o-se-pueden-mejorar)
16. [Problemas comunes y qué hacer](#16-problemas-comunes-y-qué-hacer)
17. [Tabla resumen: quién puede qué](#17-tabla-resumen-quién-puede-qué)

---

## 1. Qué es la app y de qué partes se compone

**Control** es una app web (se abre en el navegador, también se puede instalar en el celular). Sirve para llevar el control de una empresa en **cuatro módulos**:

| Módulo | Para qué sirve |
|---|---|
| **Equipos** | Computadores y otros equipos: quién los tiene, mantenimiento, backups y las actas de entrega firmadas. |
| **Inventario** | La bodega (artículos y cantidades), los pedidos de material y las **compras** con su autorización. |
| **Vehículos** | Los carros: hoja de vida, documentos (SOAT y técnico-mecánica), novedades y salidas y llegadas con fotos. |
| **Reuniones** | Reuniones con comunidades: llegan por correo, un agente las lee, la Jefe las reparte y cada persona hace su parte. |

Además hay una pestaña **Inicio** con un resumen de lo que le toca a cada persona.

**Cómo está armada por dentro (solo para que sepas):**
- La app se publica en **GitHub Pages**, en la dirección `jrivadeneiramejia1-source.github.io`.
- Los datos y las cuentas viven en **Firebase** (de Google): ahí están Authentication (quién es quién) y Firestore (los datos).
- Las **reglas de Firebase** (`firestore.rules`) son las que de verdad dejan o niegan cada acción. Aunque alguien trucara la pantalla, Firebase le diría que no.
- Los **avisos al teléfono** y el **agente que lee correos** corren en **Cloudflare** (Workers).
- Esta versión es una **demo** con los nombres y cargos del organigrama de la empresa. Los correos (`@example.com`), las cédulas, los teléfonos y todos los casos (compras, reuniones, novedades) son **inventados**.

---

## 2. Palabras que se usan (glosario)

| Palabra | Qué significa |
|---|---|
| **Rol** | El «puesto» de la persona en la app (Jefe, Gerente, Bodega, Compras…). Hay 14 roles. El rol decide casi todo lo que ve y hace. |
| **Nivel** | Lo que la persona puede hacer **en un módulo**. Cada rol trae un nivel por defecto en cada módulo, y la Jefe lo puede subir o bajar para una persona. Ejemplo: en Inventario, «Pide material», «Hace las compras», «Encargada de bodega». |
| **Permiso extra** | Un permiso suelto que se le suma a un rol. Hay tres: «También hace y recibe compras» (Bodega), «También sigue las actas de entrega» (Soporte) y «Encargada de reuniones» (Administrativo). |
| **Invitación** | Un papelito digital que dice «este correo puede entrar con este rol». La crea la Jefe (con Excel). Sirve una sola vez. |
| **Código** | Un texto como `LOG-7KQ4-M2XP` que alguien escribe al entrar para quedar con un rol. Hay dos clases: de rol (para roles normales) y de dirección (Gerente y Jefe). |
| **Persona de prueba** | Una persona de la lista de la pantalla de entrada. Se entra tocándola, sin clave. Sirve para presentar la demo. **Su clave es pública**, por eso se apagan cuando se use con datos reales. |
| **Cuenta propia** | La cuenta real de una persona, con su correo y su clave (o con Google). |
| **Correo confirmado** | Cuando una persona crea su cuenta con clave, le llega un correo con un enlace. Hasta que lo toca, no ve nada. Con Google no hace falta (Google ya lo confirmó). |
| **Pausar** | La Jefe le quita el acceso a una persona sin borrarla. Se puede devolver. |
| **Campana** | El icono arriba donde llegan los avisos de lo que te toca. |
| **Kárdex** | El historial de entradas y salidas de **un** artículo, con lo que quedó después de cada una. |
| **Acta** | La hoja firmada que dice qué equipos se entregaron a una persona (en Equipos), o el registro de lo que pasó en una reunión (en Reuniones). |

---

## 3. Cómo se entra a la app

Al abrir la app sale la **pantalla de entrada**. Tiene estas partes:

1. **Las personas de prueba** (lista agrupada por unidad, con un buscador). Se toca un nombre y se entra. Sirve para ver cómo se ve cada rol. Si `PERSONAS_PRUEBA` está en `false` en `config.js`, esta lista no aparece.
2. **«Continuar con Google»**: entra con la cuenta de Google de la persona.
3. **Formulario «Entrar con tu cuenta»**: correo y clave.
4. **«Es mi primera vez: crear mi cuenta»**: para quien nunca ha entrado.
5. **«Tengo un código de rol (en vez de invitación)»**: un desplegable para escribir un código.
6. **«Olvidé mi clave»**: manda un correo para poner una clave nueva.

### Las tres formas de tener cuenta

| Forma | Quién la usa | Cómo funciona |
|---|---|---|
| **Persona de prueba** | Para presentar | Tocas el nombre y entras. Solo para demo. |
| **Cuenta con invitación** | La mayoría de la gente real | La Jefe sube un Excel con el correo y el rol. La persona entra con ese correo y queda con ese rol. |
| **Cuenta con código** | Los Gerentes, los Jefes, y quien no esté en el Excel | La persona escribe un código y queda con el rol del código. |

### Qué pasa cuando una persona entra por primera vez

**Con correo y clave:**
1. Toca **«Es mi primera vez: crear mi cuenta»**.
2. Escribe su nombre, su correo y una clave de **10 o más caracteres**.
3. Si tiene invitación, no escribe código. Si no, abre «Tengo un código de rol» y lo escribe.
4. Firebase le manda un **correo de confirmación**. Debe tocar el enlace y volver a la app (si no ve el correo, revisar el spam; hay un botón para reenviarlo).
5. La app busca la invitación de su correo (o usa el código) y le crea el perfil con su rol. Entra.

**Con Google:**
1. Toca **«Continuar con Google»** y escoge su cuenta.
2. Si su correo tiene invitación, entra directo con ese rol.
3. Si no la tiene, la app dice **«Tu correo no está en la lista»** y muestra una casilla **«Código de tu rol»** y otra con su nombre. Escribe su código y entra.

**Reglas importantes de la entrada:**
- Sin correo confirmado, no se ve nada. Esto lo exigen las reglas de Firebase, no solo la pantalla.
- La **invitación sirve una sola vez**: al entrar, se gasta.
- La persona **no escoge su rol**. Lo decide la invitación o el código, y lo revisa Firebase.
- Si el correo **no está en la lista**, la app dice «Tu correo no está en la lista» y no deja ver nada.
- Si la Jefe **pausó** el acceso, la app dice «Tu acceso está pausado».

### Las veces siguientes
Entra con **«Entrar con tu cuenta»** (correo y clave) o con Google. Si olvidó la clave, toca **«Olvidé mi clave»**.

---

## 4. La Jefe: de cero a cien

**Quién es:** Carolina Castillo (Líder de Abastecimiento), según el organigrama. Hoy hay **una sola** Jefe.
**Importante:** tú ya te registraste como Jefe con un código de ejemplo. Ese código **se gastó** y ya no existe.

### 4.1 Crear el código de Jefe (solo si hace falta otro)
Los códigos de **Jefe y Gerente no se crean desde la app**. Se crean **a mano en la consola de Firebase**, y cada uno sirve **una vez y para una persona**.

1. Firebase > **Firestore Database > Datos**.
2. Colección **`codigosDireccion`** (si no existe, **Iniciar colección** con ese nombre).
3. **ID del documento:** el código, en **mayúsculas**, con formato `JEF-XXXX-XXXX` (3 letras, guion, 4, guion, 4). Ejemplo: `JEF-CAR1-A7K2`.
4. Campos:
   - `rol` = `jefe` (texto)
   - `activo` = `true` (booleano)
   - `por` = `consola` (texto)
   - `en` = la fecha de hoy (texto)
5. Guardar.

**¿Por qué no se crean desde la app?** Para que, si alguien le roba la cuenta a la Jefe, no pueda llenar la app de Jefes y Gerentes falsos.

### 4.2 Registrarse como Jefe
1. Abrir la app sin tocar a ninguna persona de prueba.
2. **«Es mi primera vez: crear mi cuenta»**.
3. Escribir nombre, correo y clave (10 o más caracteres), o usar Google.
4. Abrir **«Tengo un código de rol»** y escribir el `JEF-...`.
5. Confirmar el correo si entró con clave.
6. Queda como **Jefe**, y el código desaparece.

### 4.3 Qué ve y qué puede hacer la Jefe
La Jefe es la única que puede **hacer casi todo**. En cada módulo tiene el nivel más alto:

| Módulo | Lo que hace la Jefe |
|---|---|
| **Inventario** | Ve todo, incluido el **Panorama**. Autoriza las compras que piden los demás. Marca como revisadas las compras hechas sin permiso. Puede hacer cualquier paso de bodega y de compras. |
| **Equipos** | Todo: entregar, recibir, mantenimiento, revisar actas, programar tareas. |
| **Vehículos** | Todo: ver, asignar, revisar novedades, actualizar documentos. |
| **Reuniones** | Lee los correos con el agente, revisa y reparte las reuniones, autoriza la comida y los carros (y escoge conductor). |
| **Personas y permisos** | Solo ella lo ve (y solo con cuenta propia). Ver 4.4. |

**Lo único que NO puede hacer la Jefe:**
- **Autorizar compras** (ya no es de la Jefe: las autoriza la Coordinadora de compras y, las de más de 5 millones, el Gerente general).
- Tocar a **otra Jefe** o a **un Gerente** (cambiar su rol, pausarlo, cambiarle permisos). Eso solo se hace desde la consola de Firebase.
- Cambiarse permisos a sí misma.
- Crear códigos de Gerente o Jefe (se crean a mano en Firebase).
- Cambiar el «monto del Gerente» (solo lo cambia el Gerente general).
- Reiniciar los datos de prueba (solo la Jefe **de prueba** puede; la real no).

### 4.4 La pantalla «Personas y permisos»
**Dónde está:** toca tu nombre arriba (se abre el menú de persona) > **Personas y permisos**. Solo aparece si entraste con **tu cuenta propia** como Jefe. Si entras como «Carolina Castillo» de prueba, no aparece (a propósito: su clave es pública).

Tiene **cuatro partes**, de arriba hacia abajo:

**A) Agregar personas con un Excel**
1. Toca **Descargar plantilla**.
2. La llena: una fila por persona (Nombre, Correo y Rol son obligatorios).
3. Toca **Subir Excel**. La app muestra «Esto entendí del Excel» con cada fila **Lista** o **Con problema**, y explica cada error.
4. Toca **Guardar**: queda una invitación por cada correo.

Lo que se puede escribir en la columna **Rol**: el nombre del rol (Bodega, Compras…) **o el cargo del organigrama** (por ejemplo «Contador», «Recepcionista», «Profesional Licitaciones»). La app lo traduce.
Los Gerentes y Jefes **no pueden ir en el Excel**: la app los rechaza.

**B) Invitaciones esperando que la persona entre**
Lista de invitaciones que nadie ha usado. Cada una tiene el botón **Borrar invitación**.

**C) Personas registradas**
Cada persona que ya entró tiene su tarjeta, con:
- Su nombre, correo, rol y cuándo se registró.
- Una **lista de rol**: la cambias y queda guardado.
- **Pausar acceso / Devolver acceso.**
- **«Qué puede hacer en cada módulo»**: 4 listas (Equipos, Inventario, Vehículos, Reuniones). Opciones: *Como su rol*, *Sin acceso*, *Solo ver*, o un nivel de trabajo.
- **Permisos extra** (cuadros para marcar, solo salen a quien le sirven).

Para los Gerentes y la otra Jefe, la tarjeta dice «Gerente o Jefe: solo se cambia desde la consola de Firebase». Para ti dice «Eres tú».
La persona debe **cerrar y abrir la app** para ver el cambio.

**D) Códigos por rol** (un desplegable)
Un renglón por rol, con **Crear código**, **Copiar** y **Cambiar**.
- El código se ve como `LOG-7KQ4-M2XP`; las 3 letras dicen el rol.
- **Lo pueden usar varias personas** del mismo rol.
- **Cambiar** hace uno nuevo y el viejo **deja de servir**.

**Al final: «Seguridad».** Un interruptor para **apagar las personas de prueba**. Se usa cuando la app se vaya a usar con datos reales (ver capítulo 14).

### 4.5 Los niveles que se pueden poner por módulo

| Módulo | Opciones |
|---|---|
| **Equipos** | Sin acceso · Solo ver · Encargado (mantenimiento y entregas) · Soporte (recibe y revisa) |
| **Inventario** | Sin acceso · Solo ver · Finanzas (ve todo y también pide) · Pide material · Hace las compras · Encargada de bodega |
| **Vehículos** | Sin acceso · Solo ver · Reporta (novedades y salidas) · Autoriza (revisa novedades y documentos) |
| **Reuniones** | Sin acceso · Solo ver (cada rol hace su tarea ahí, por eso solo se sube o baja a «ver») |

**Ejemplos de uso:**
- A un Bodega ponerle **Vehículos: Sin acceso**: la pestaña Vehículos desaparece.
- A un Conductor ponerle **Inventario: Encargada de bodega**: ya puede mover la bodega.
- A un Profesional ponerle **Inventario: Solo ver**: ya no puede pedir compras.

### 4.6 Poner la app en marcha de verdad (orden recomendado)
1. Registrar a la **Jefe**.
2. Crear los **3 códigos de Gerente** (uno por persona) y dárselos.
3. Subir el **Excel** con toda la demás gente.
4. Revisar que cada quien tenga el rol correcto y ajustar permisos.
5. Cuando se use con datos de la empresa: **Personas y permisos > Seguridad > Apagar las personas de prueba**, y poner `window.PERSONAS_PRUEBA = false` en `config.js`.

---

## 5. Los Gerentes: cómo entran y qué hacen

### 5.1 Cuántos hay
Hay **3 Gerentes** en la demo: **Oscar Muñoz**, **Santiago Valencia** y **Alejandro Giraldo** (Gerente de Proyectos).

### 5.2 Cómo entra cada uno (¡un código para cada uno!)
**Cada código sirve para una sola persona y una sola vez.** Para tres Gerentes hacen falta **tres códigos distintos**. Si dos usan el mismo, el segundo no entra, porque el código se borró al usarse.

Cómo crearlos, igual que el de Jefe pero con `GER-`:
- Colección `codigosDireccion`, un documento por Gerente.
- ID en mayúsculas, formato `GER-XXXX-XXXX`. Ejemplos: `GER-OSC1-A7K2`, `GER-SAN2-B8M3`, `GER-ALE3-C9P4`.
- Campos: `rol` = `gerente`, `activo` = `true` (booleano), `por` = `consola`, `en` = la fecha.

Cómo entra el Gerente:
1. Toca **«Es mi primera vez: crear mi cuenta»**.
2. Escribe su nombre, correo y clave (o usa Google).
3. Abre **«Tengo un código de rol»** y escribe **su** `GER-...`.
4. Confirma el correo (si entró con clave).
5. Entra como Gerente; el código se borra solo.

### 5.3 Qué puede hacer el Gerente (y el Gerente general)
| Módulo | Qué hace |
|---|---|
| **Inventario** | Ve el **resumen a detalle** y **todas las compras** (qué, cuánto vale cada cosa, a quién, para qué, cotizaciones). **Autoriza compras solo si es el Gerente general** (ver abajo); los demás Gerentes solo ven. Puede **pedir** compras (la del Gerente general nace autorizada). Cambia el **monto del Gerente** (solo el Gerente general). No ve cada movimiento de bodega, solo el resumen. |
| **Equipos** | Solo ver (Resumen, Equipos, Actas, Personas). |
| **Vehículos** | Solo ver (Resumen, Reportes, Carros, Novedades). |
| **Reuniones** | Solo ver (Resumen, Próximas, Realizadas y canceladas). |

**Quién autoriza las compras ahora:**
1. La **Coordinadora de compras** (Mauricio Giraldo en la demo) autoriza las compras de **5.000.000 o menos**, y revisa las hechas sin autorización. La Jefe **ya no** autoriza.
2. Las de **más de 5.000.000**: la Coordinadora las pasa y quedan en «Falta el Gerente general»; las autoriza el **Gerente general** (Oscar Muñoz).
3. Lo que **pide la Coordinadora** lo decide siempre el Gerente general. Lo que **pide el Gerente general nace autorizado**.
4. El Gerente general también puede decidir **cualquier pedido** sin esperar a la Coordinadora (acceso total). Los demás Gerentes (Santiago Valencia, Alejandro Giraldo) solo ven los resúmenes y el detalle de cada cosa.
5. El permiso «Gerente general» **no lo marca la Jefe**: se pone a mano en la consola de Firebase (en `usuarios/<uid>`, el campo `extras` con `["general"]`). Ya no existe el «respaldo de 2 días».

**El monto del Gerente (5.000.000 por defecto, «más de»):** solo el Gerente general (con cuenta propia) lo cambia, con el botón **«Cambiar el monto»** que sale en su **Resumen** de Inventario (tarjeta «Compras que decides tú»). La persona de prueba no puede. Así la Jefe no puede subirlo para saltárselo.

**Lo que NO puede hacer el Gerente:**
- Ver «Personas y permisos» (ni manejar códigos ni personas).
- Autorizar una compra que **él mismo** pidió.
- Comprar ni recibir.
- Cambiar nada en Equipos, Vehículos o Reuniones.

---

## 6. Cómo entra la gente normal (invitación y códigos)

### Camino 1: invitación (el normal)
**Lo hace la Jefe:**
1. Personas y permisos > **Descargar plantilla**.
2. Llena una fila por persona.
3. **Subir Excel** > revisar > **Guardar**.

**Lo hace cada persona:**
1. **«Es mi primera vez: crear mi cuenta»**.
2. Con su correo y una clave (o con Google).
3. Confirma el correo.
4. La app busca su invitación y le pone el rol.

**Detalles:**
- El correo debe ser **el mismo** del Excel.
- La invitación se gasta al entrar.
- Si el correo no está: «Tu correo no está en la lista».

### Camino 2: código por rol
**Lo hace la Jefe:** Personas y permisos > **Códigos por rol** > **Crear código** > **Copiar** > se lo pasa a la persona.
**Lo hace la persona:** «Es mi primera vez» > abre **«Tengo un código de rol»** > lo escribe.
- Lo pueden usar varias personas del mismo rol.
- Si se filtra, la Jefe toca **Cambiar** y el viejo muere.

### Qué pasa después de entrar
La persona ve **solo las pestañas de su rol**. La Jefe puede, después, cambiarle el rol, pausarla o ajustarle permisos.

---

## 7. Las pantallas de la app (lo que se ve)

### 7.1 La barra de arriba
- El **logo** y el nombre «Control».
- La **campana** (avisos). Muestra un número cuando hay avisos nuevos.
- Tu **nombre y rol** (un botón). Al tocarlo se abre el menú de persona.
- El botón de **tema claro/oscuro**.

### 7.2 El menú «Cambiar de persona» (tocando tu nombre)
Es una hoja que sube desde abajo, con estas partes de arriba hacia abajo:
- **Tu cuenta:** tu nombre, correo y rol (solo si entraste con cuenta propia).
- **Personas y permisos:** solo la Jefe con cuenta propia. Abre el panel del capítulo 4.4.
- **La lista de personas de prueba** (agrupada por unidad, con buscador): tocas una y ves la app como la ve ella. Sirve para mostrar los permisos en vivo. Solo mientras las personas de prueba estén encendidas. Si tocas una, sales de tu cuenta propia.
- **Permisos de [la persona]:** una tabla que dice qué puede hacer la persona actual en cada módulo.
- **Avisos en este teléfono:** «Activar avisos», «Mandarme uno de prueba» y «Apagar».
- **Datos de prueba — Reiniciar los datos de prueba:** borra lo que se haya cambiado y vuelve a poner los datos de ejemplo con las fechas de hoy. Solo la Jefe **de prueba** lo ve. Úsalo antes de presentar.
- **Salir** y **Cerrar**.

### 7.3 Las pestañas de abajo
**Inicio · Equipos · Inventario · Vehículos · Reuniones.** Cada persona ve **solo las que su rol permite** (por ejemplo, un Colaborador no ve Equipos ni Vehículos).

### 7.4 Inicio
Un resumen de lo que le toca a la persona en cada módulo que puede ver: números de lo pendiente (compras por autorizar, pedidos por entregar, reuniones próximas, actas por registrar, etc.). Tocar un número lleva a esa lista.

### 7.5 La campana y los avisos
- **Campana (dentro de la app):** a cada rol le llegan los avisos de lo que le toca. Ejemplos: «Compra por autorizar», «Te autorizaron la compra», «Tienes un viaje», «Reunión nueva: ¿vas?».
- **Avisos al teléfono (opcional y gratis):** con «Activar avisos», el teléfono recibe una notificación. En iPhone primero hay que instalar la app (Compartir > Agregar a inicio).
- Cada persona recibe **solo los avisos de su rol**.

### 7.6 «¿Salir sin guardar?»
En Equipos, Vehículos e Inventario, si escribiste algo (o tomaste una foto o dibujaste una firma) y tocas **Cancelar**, la tecla Escape o fuera de la hoja, la app pregunta «¿Salir sin guardar?». **Cancelar** (te quedas y no pierdes nada) o **Salir sin guardar** (Leave without saving: se pierde lo escrito). Al guardar no pregunta, y en las hojas donde solo se mira (hoja de vida, detalle) tampoco.

---

## 8. Inventario a fondo (compras, bodega, pedidos)

### 8.1 Las secciones de Inventario según el nivel de cada persona

| Nivel | Quién lo tiene por defecto | Secciones que ve |
|---|---|---|
| **Jefe** | La Jefe | Panorama, Qué hay que hacer, Existencias, Movimientos, Pedidos de material, Compras, Conteo, Resumen |
| **Bodega** | Bodega (Andrés Beltrán) | Qué hay que hacer, Existencias, Movimientos, Pedidos de material, Compras, Conteo, Resumen |
| **Compra** | Compras | Qué hay que hacer, Existencias, Compras, Pedidos de material, Movimientos, Resumen |
| **Gerente** | Los Gerentes | Resumen, Compras, Existencias, Pedidos de material |
| **Finanzas** | Financieros (3 personas) | Existencias, Movimientos, Pedidos, Compras, Resumen |
| **Ver** | Consulta | Existencias, Movimientos, Pedidos, Compras, Resumen (solo mirar) |
| **Pide** | Casi todos los demás | **Lo mío**, Existencias, Pedidos de material, Compras (y solo ve **lo suyo**) |

**Qué significa «Pide»:** la persona puede pedir material y pedir compras, pero **no ve los movimientos de la bodega**, y con cuenta propia **solo ve sus propios pedidos y compras**.

### 8.2 El camino de una compra (de principio a fin)

```
Alguien pide → (se autoriza) → Compras la compra → Bodega la recibe
```

**Estados que se ven:** Pedido · Falta el Gerente · Autorizado · Rechazado · Comprado · Recibido · Sin autorizar.

**Paso 1. Pedir.**
- Quién: **todos los roles menos Consulta** (con nivel de pedir o más).
- Cómo: botón **«Pedir una compra»**.
- Se escribe: qué se compra, cantidad, unidad, categoría, valor, para qué, proyecto y, si quieres, a quién se le compra.
- Se puede agregar **hasta 5 artículos** en una misma compra y **hasta 3 fotos de cotización**.
- Si el artículo es de la bodega, se llena solo el nombre, unidad, categoría y valor.
- La app no deja pedir un artículo que ya tiene una compra en curso.

**Paso 2. Autorizar** (Quién decide):

| Quién pidió | Quién autoriza |
|---|---|
| Una persona normal | **La Jefe.** Si vale el monto del Gerente o más (por defecto 1.000.000), la Jefe la aprueba y pasa al Gerente («Falta el Gerente»). |
| **La Jefe** | **Siempre un Gerente** (cualquier valor). |
| **Un Gerente** | **Otro Gerente.** Nadie autoriza lo suyo. |
| Cualquiera, y **la Jefe no responde en 2 días** | **Un Gerente** puede autorizar o rechazar (queda autorizada directo). |

Quien autoriza ve la **tabla completa**: cada artículo con su precio, el total, a quién se compra, para qué, las cotizaciones (fotos), lo que hay en bodega y **el último precio pagado** (y avisa si ahora piden más).
Puede **autorizar** o **rechazar** (con un motivo que ve quien pidió).
**Nadie decide una compra que pidió él mismo.**
Quien decide deja su **correo** en la compra (para que nadie se haga pasar por otro).

**Paso 3. Comprar.**
- Quién: **Compras** (y Bodega si tiene el permiso extra «También hace y recibe compras»; y la Jefe).
- Cómo: sobre la compra autorizada, **«Registrar compra»**: proveedor, **valor pagado** y **foto de la factura**.
- Si pagan **más del 10 %** de lo autorizado, queda dicho en el historial y **le avisa a la Jefe** (y al Gerente si él la había autorizado).

**Compra sin autorización:** si Compras compró algo sin pedir permiso, se registra como «**Sin autorizar**» y la Jefe la **marca como revisada** (con una nota).

**Paso 4. Recibir.**
- Quién: **Bodega** (y la Jefe).
- Cómo: «**Recibir en bodega**» (si es un artículo de bodega, se suma solo a las existencias) o «**Recibir la compra**» (si trae varios artículos, se dice cuánto llegó de cada uno).
- Si llegó **menos** de lo comprado, avisa a la Jefe.

**Cada paso queda en el historial de la compra**, y el historial **solo crece**: no se puede borrar ni cambiar lo que ya está.

### 8.3 Pedidos de material (cosas de la bodega)
1. Cualquiera con nivel de pedir: botón **«Pedir material»**: escoge el artículo, cantidad, para qué y proyecto.
2. **Bodega** ve el pedido en «Qué hay que hacer» o «Pedidos de material».
3. Bodega lo **entrega** (también puede entregar **parcial** lo que haya) o **no lo entrega** con un motivo.
4. Al entregar, el stock baja y queda el movimiento.
5. Si el artículo no alcanza, la app propone **pedir una compra**.

### 8.4 La bodega (Existencias y Movimientos)
- **Existencias:** cada artículo con su cantidad, mínimo, máximo, ubicación y estado (**Bien · Bajo del mínimo · Agotado**).
- **Movimientos:** cada entrada, salida y ajuste (del más nuevo al más viejo). Quien solo pide **no los ve**.
- **Quién mueve la bodega:** Bodega y la Jefe.
- Bodega puede: registrar **entradas** (devolución) y **salidas** (entrega, daño o pérdida), **crear y editar artículos** y hacer el **conteo**. Cada movimiento queda con su motivo: *Cantidad inicial, Compra recibida, Entrega, Devolución, Ajuste por conteo* o *Daño o pérdida*.
- **Conteo físico** (en tres pasos, siempre de **una bodega**):
  1. Se escoge la **bodega** (Riohacha, Guamal o Bogotá) y, si se quiere, una **categoría**. Ahí mismo dice cuándo fue el último ajuste por conteo de cada bodega.
  2. Se cuenta. **La app no dice cuánto cree que hay** (así nadie copia el número): cada artículo trae su estante para encontrarlo, y se deja en blanco lo que no se contó. **Lo que se escribe se guarda en el teléfono**: si se cierra a medias, al volver dice «Tienes un conteo sin terminar de Guamal» y se sigue donde se iba (o se empieza de cero).
  3. **Revisar:** recién ahora aparece, por cada artículo, lo contado, lo que decía la app y la diferencia (las que no cuadran van primero y en rojo). Si hay diferencias se escribe el **motivo** y se guarda; la app ajusta y deja un movimiento por cada una. Si mientras se revisaba alguien movió la cantidad de un artículo, la app avisa y muestra la revisión otra vez sin guardar.
  - Un conteo que cuadra del todo no deja ajustes, así que no aparece en «último ajuste por conteo».
- **Kárdex:** el historial de **un** artículo con lo que quedó después de cada movimiento (y su Excel).
- **Regla de oro:** **cada cambio de cantidad deja su movimiento en la misma escritura**. No se puede cambiar el stock sin dejar rastro. La cantidad **nunca queda negativa**.
- Si un artículo se **daña o se pierde**, se avisa a la Jefe.

### 8.5 El Panorama (solo la Jefe)
Lo urgente en un solo lugar: artículos agotados, compras que esperan a la Jefe y al Gerente, compras hechas sin autorización, compras pagadas con más de lo autorizado, pedidos de material que llevan más de 2 días esperando, artículos bajos del mínimo, compras por comprar y por recibir. Más gráficos: gastado este mes, por persona que pidió, por categoría, por proyecto.

### 8.6 El Resumen
Para quien lo ve: valor de lo que hay en bodega, gastado este mes (y lo «sin autorizar»), compras por etapa, y botón de **descargar Excel**.

### 8.7 Lo que nadie puede hacer en Inventario
- Borrar compras ni movimientos (son el rastro de lo gastado).
- Editar una compra ya autorizada.
- Autorizar lo suyo.
- Ver lo de otros, si solo tiene nivel «Pide».

---

## 9. Equipos

**Para qué sirve:** llevar el control de computadores y otros equipos (portátiles, monitores, GPS, cámaras, celulares, etc.): dónde está cada uno, quién lo tiene, cuándo tuvo mantenimiento y backup, y las **actas firmadas** de cada entrega.

**Estados de un equipo:** **En bodega · Asignado · En Recibidos** (devuelto, pendiente de mantenimiento).

### 9.1 Quién hace qué

| Rol / nivel | Qué hace en Equipos |
|---|---|
| **Encargado de equipos** (Fabián Barbosa) | **Entrega** equipos con un acta firmada, **recibe** devoluciones, hace **mantenimiento y backup**, **registra equipos nuevos** y corrige actas con problema. |
| **Soporte** (Ángel Ortiz) | **Recibe y revisa** lo que registra el Encargado, programa tareas en la **Agenda** (mantenimiento, backup, revisión). Con el permiso extra «actas» **revisa las actas** (nunca las suyas). |
| **Jefe** | Todo. Revisa actas y programa tareas. |
| **Gerente** | Solo ver: Resumen, Equipos, Actas, Personas. |
| **Quien tenga «Solo ver»** | Mira, no cambia nada. |
| **Los demás** | No ven Equipos (a menos que la Jefe se lo dé). |

### 9.2 Las pestañas de Equipos
- **Lo que me toca:** tareas pendientes de la persona.
- **Equipos:** la lista de equipos con su estado. Arriba del listado hay **botones por tipo** (Portátil, Monitor, GPS…) con cuántos hay de cada uno; se pueden sumar al filtro de las cifras de arriba (por ejemplo «En bodega · Portátil»). La línea **«Filtro: …»** dice qué filtro está puesto y tiene su botón **Quitar**. Si no hay resultados, sale **«Quitar filtro»**.
- **Actas:** las actas de entrega con su revisión, con **buscador** (persona, serial o número de acta).
- **Agenda:** mantenimientos y backups programados, en grupos: **Atrasadas** (en rojo, solo si hay), **Esta semana** (hasta el domingo) y **Después**. Las ya hechas están plegadas en **«Ver hechas»**.
- **Personas:** quién tiene qué equipo, con **buscador** (nombre, cédula o serial).
- **Resumen:** solo la Jefe (y el Gerente en su versión).

### 9.3 El acta virtual
1. El Encargado toca **«Entregar»** y escoge a quién y qué equipos.
2. Se escribe el nombre y la cédula de quien recibe, el proyecto, otros elementos (cargador, mouse, etc.).
3. **La persona firma en la pantalla.**
4. Queda un acta con **número** (ac1, ac2…).
5. **Soporte** (con permiso de actas) o la **Jefe** la **revisa**: queda «Revisada» o «Con problema». **Nadie revisa lo suyo.**
6. Si hay un problema, el Encargado **corrige** y vuelve a revisión.
7. Al devolver, se agrega la **devolución con su firma** a la **misma acta**.
8. **Las actas no se borran** (solo la Jefe).

### 9.3.1 Escanear el serial con la cámara
El **Encargado de equipos** puede tocar el botón de **códigos de barras** que está junto al buscador de Equipos: la cámara lee el código o QR del serial y abre la hoja de vida de ese equipo (si no existe, lo dice y deja el serial escrito en el buscador). También hay **«Escanear un equipo»** en la **Entrega** (marca el equipo y abre sus observaciones; si lo tiene otra persona, dice quién) y en la **Devolución** (marca el equipo que llega; si es de otra persona, cambia la lista a su nombre). La primera vez el navegador pide permiso para la cámara. Si no sirve, queda **Tomar foto** o **Escribir a mano**. Funciona sin internet.

---

## 10. Vehículos

**Para qué sirve:** la hoja de vida de cada carro (placa, marca, modelo, año, kilometraje, **SOAT** y **técnico-mecánica**), las **novedades** (daños, llantas, choques) y las **salidas y llegadas** con fotos.

**Estados de un carro:** Disponible · En uso · En taller.

### 10.1 Quién hace qué

| Rol / nivel | Qué hace en Vehículos |
|---|---|
| **Conductor** (Oscar Farfán) — nivel «Reporta» | **Reporta novedades** (siempre con foto), **registra la salida y la llegada** del carro (con 5 fotos, kilometraje y combustible). Confirma **su** viaje. |
| **Transporte** (Wilson Muñoz) y **Bodega** (Andrés Beltrán) — nivel «Autoriza» | **Revisan las novedades** (le ponen costo y nota), actualizan los documentos, asignan conductor y ven **Resumen y Reportes**. |
| **Jefe** | Todo. |
| **Gerente** | Solo ver: Resumen, Reportes, Carros, Novedades. |
| **Consulta** y quien tenga «Solo ver» | Solo mirar. |

### 10.2 Las pestañas de Vehículos
- **Lo que me toca**, **Carros**, **Novedades**.
- **Resumen** y **Reportes** (solo Transporte, Bodega, Jefe y, en su versión, el Gerente).

### 10.3 Reglas que se cumplen
- **Novedad:** siempre con **foto**. Tipos: llanta, choque, rayón, mantenimiento, otro. El conductor **no puede poner costo**; lo pone quien la revisa.
- **Salida y llegada:** 5 fotos (frente, atrás, izquierda, derecha, llantas). El **kilometraje nunca baja** (y no puede subir más de 3.000 km de una vez).
- Un carro **solo sale** si no está en el taller y tiene el **SOAT y la técnico-mecánica al día**.
- **Avisos de documentos:** cuando un documento está por vencer o vencido, avisan la Jefe, Transporte y Bodega.
- Las salidas y llegadas **no se cambian después**.
- Si un carro de una reunión ya salió, hay que registrar su llegada antes de reasignarlo.

---

## 11. Reuniones

**Para qué sirve:** organizar las reuniones con comunidades. Llegan por **correo**, un **agente** las lee, la **Jefe** revisa y reparte, y **cada persona hace su parte**.

### 11.1 El camino de una reunión
1. **Llega un correo** al Gmail de prueba (en la demo hay 4 de ejemplo) y aparece en **Reuniones > Correos**.
2. La **Jefe** lo abre y el **agente lo lee** (con Gemini; si no está conectado, usa una respuesta de respaldo). El agente dice qué entendió.
3. Según el correo, puede ser: **reunión nueva**, **datos que faltaban**, **cambio de fecha**, **cancelación** u **otro**.
4. La **Jefe revisa y corrige** lo que haga falta (comunidad, fecha, hora, lugar, personas, camionetas, comida, logística).
5. En la reunión nueva, la Jefe también escoge **quiénes van** (los profesionales invitados).
6. La Jefe toca **«Crear reunión y repartir»**. Se crean las tareas y llegan los avisos.

### 11.2 Las tareas de una reunión y quién las hace

| Tarea | Quién la hace |
|---|---|
| **Refrigerios / Almuerzo** | **Compras y Bodega informan** qué hay y qué falta. **La Jefe autoriza.** |
| **Carros** | **Transporte y Bodega informan** qué carros hay libres. **La Jefe autoriza** y **escoge el conductor** de cada carro. |
| **Viaje** (una por cada carro/conductor) | **Cada conductor confirma SU viaje**, o dice «no puedo» (y la Jefe escoge otro). |
| **Logística** | **Logística** marca la lista: sonido y micrófono, sillas, mesas, refrigerios recibidos. |
| **Asistencia** (una por cada profesional invitado) | **Cada profesional confirma SOLO la suya** («Voy» o «No puedo»). |
| **Acta y formato diario** | **Administrativo** la registra el día de la reunión o después: asistentes, hora de inicio y cierre, observaciones y foto de la lista. Al guardarla, la reunión queda **«Realizada»**. |

**Importante:** la asistencia y el viaje son **por persona**: un profesional no puede decidir la asistencia de otro, y un conductor no puede devolver el viaje de otro. Cada tarea lleva el correo de a quién le toca.

### 11.3 Las pestañas de Reuniones
- **Lo que me toca**, **Próximas**, **Realizadas y canceladas**.
- **Correos** y **Resumen**: solo la **Jefe** (y la Administrativa «encargada» ve Correos).
- El **Gerente** ve: Resumen, Próximas, Realizadas y canceladas (solo ver).

### 11.4 Quién ve y hace qué en Reuniones

| Rol | Qué hace |
|---|---|
| **Jefe** | Todo: lee correos, reparte, autoriza comida y carros. |
| **Compras** | Informa lo que hay de comida. |
| **Bodega** | Informa lo que hay de comida, carros y logística. |
| **Transporte** | Informa qué carros hay. |
| **Conductor** | Confirma su viaje. |
| **Logística** | Alista la reunión. |
| **Profesional** | Confirma su asistencia. |
| **Administrativo** | Registra el acta. |
| **Administrativo con «Encargada de reuniones»** | Además ve **todas** las tareas y la bandeja de **Correos** (no autoriza nada). |
| **Gerente, Colaborador, Financiero** | Solo ven las reuniones. |
| **Equipos, Soporte, Consulta** | No ven Reuniones. |

---

## 12. Quién es quién: cada persona de la demo y qué hace

Los nombres y cargos son **los reales de tu organigrama (versión 18, febrero de 2023)**. Los correos (`rol.nombre.apellido@example.com`), las cédulas y los casos son **inventados**. Los roles de esta lista **los puse yo** para la demo (y se pueden cambiar con el Excel y la pantalla de Personas y permisos).

**Dónde puse supuestos, no dato de tu archivo:**
- **Andrés Beltrán** es «Auxiliar Administrativo» en tu archivo. Yo le di el rol de **Bodega**, porque no hay bodeguero en el organigrama.
- **Revisor Fiscal** y **Oficial de Cumplimiento** no tienen persona asignada en tu archivo: están como **Consulta** con la nota «(sin persona asignada)».
- **Elkin Bruno y Julio Flórez** son «Profesional logístico HSE» (logística de seguridad y ambiente). Los puse como rol **Logística** (alistan las reuniones). Esa interpretación es mía.
- Hay **más gente en la empresa** que no está en el archivo. Se suma con el Excel.

### Gerencia y control
- **Oscar Muñoz y Santiago Valencia — Gerentes.** Ven el resumen del inventario y todas las compras, autorizan compras grandes o pedidas por la Jefe u otro Gerente (o por respaldo a los 2 días), y pueden pedir compras (las decide otro Gerente). Solo miran Equipos, Vehículos y Reuniones.
- **Revisor Fiscal y Oficial de Cumplimiento — Consulta.** Solo miran inventario y vehículos. No cambian nada ni piden.

### SGI y HSE
- **Margaret Pulido (Coordinador SGI), Milena Bermúdez, Jorge Alberto Pérez y Luis Humberto López — Profesionales.** Piden material y compras. En Reuniones confirman **su** asistencia.
- **Yuliana Murcia (Asistente SGI) — Colaborador.** Pide y ve solo lo suyo. En Reuniones solo mira.
- **Elkin Bruno y Julio Flórez — Logística.** Piden. En Reuniones alistan lo de la reunión (sonido, sillas, lugar).

### Gerencia de Proyectos
- **Alejandro Giraldo — Gerente.** Igual que los otros dos Gerentes.
- **Viviana Ardila, Natalia Herrera, Edisson Suesca, Camila Santana, Nicolle Quintero, Luisa Quintero, Katherine Betancur, Mauricio Sabogal y Wilson Rodríguez — Profesionales.** Igual que los Profesionales de SGI.

### Abastecimiento
- **Carolina Castillo — Jefe.** Hace todo en la app (ver capítulo 4).
- **Mauricio Giraldo (Coord. Compras) y Fredy Torres (Auxiliar Compras) — Compras.** Registran las compras ya autorizadas (proveedor, valor, factura). Ven todo el inventario. En Reuniones informan lo que hay de comida.
- **Wilson Muñoz (Coord. Transporte) — Transporte.** Revisa novedades y documentos de los carros. En Reuniones informa qué carros hay. Pide material y compras.
- **Oscar Farfán — Conductor.** Reporta novedades, registra salidas y llegadas, confirma su viaje. Pide material y compras.
- **Andrés Beltrán — Bodega (supuesto).** Recibe compras, entrega material, registra entradas, salidas y conteos, y crea y edita artículos. También revisa novedades de vehículos. Informa en Reuniones.
- **Paola Martínez (Asistente Seguimiento y Control) — Administrativo.** Registra las actas de las reuniones.
- **Solanyi Surquira (Asistente Administrativa) — Administrativo con «Encargada de reuniones».** Registra actas y además ve todas las tareas de reuniones y la bandeja de correos.
- **Iveth Pardo (Recepcionista), Alexander Beltrán (Mensajero) y Giovanna Bohórquez (Servicios Generales) — Colaboradores.** Piden y ven solo lo suyo.

### Gerencia Administrativa
- **Marcela Tamayo (Gerente Administrativa), Osler Monroy, Alejandra Nivia, Melissa Arias y Arturo Tovar (Gestión Humana) — Colaboradores.** Piden y ven solo lo suyo.
- **Ángel Ortiz (Asistente TI) — Soporte con «actas».** En Equipos recibe y revisa; con el permiso revisa las actas (no las suyas). Pide.
- **Fabián Barbosa (Auxiliar TI) — Encargado de equipos.** Entrega con acta firmada, recibe, hace mantenimiento y backup, registra equipos. Pide.

### Gerencia Financiera
- **Adriana Patiño (Gerente Financiera), Nury Acosta (Contador) y Fanny Benavides (Profesional Contable) — Financieros.** Son los **únicos** que ven **todas** las compras, facturas y movimientos del inventario. También pueden pedir. No autorizan ni compran.
- **Andrea Correa (Asist. Contable), Heidy Lorena Castillo (Auxiliar Contable), Harold Beltrán (Asist. Nómina) y Leidy Ramos (Asist. Reembolsables) — Colaboradores.** El apoyo de contabilidad: piden y ven solo lo suyo.

### Lo que hace **cualquier** rol con nivel de pedir
Piden **material** de la bodega y **compras** a su nombre, ven **sus** pedidos y compras, y reciben los avisos que les tocan. Eso incluye casi todos los roles. La excepción es **Consulta**, que solo mira.

---

## 13. Los Excel

### 13.1 Qué Excel hay
| Dónde | Qué baja | Quién lo ve |
|---|---|---|
| **Personas y permisos > Descargar plantilla** | La plantilla de personas | Solo la Jefe |
| **Inventario > Resumen** | Existencias, Movimientos, Compras, Pedidos de material | Quien ve el Resumen |
| **Inventario > un artículo > Kárdex** | El historial de ese artículo | Quien ve los movimientos |
| **Vehículos > Reportes** | Carros, Salidas y llegadas, Novedades, Por conductor | Transporte, Bodega, Jefe, Gerente |
| **Equipos** (botón abajo) | Equipos y Actas de entrega (sin cédulas ni firmas) | Quien ve Equipos |
| **Reuniones** (botón abajo) | Reuniones y Tareas | Quien ve Reuniones |

### 13.2 Cómo salen (formato)
Todos con el mismo formato: **título grande en negrilla** arriba, una línea que explica qué es, **columnas en negrilla con fondo de color**, **cada dato en su cuadro**, columnas del ancho justo, **la fila de títulos fija al bajar** y filtros. La plata sale con `$` y miles.

### 13.3 La plantilla de personas (lo nuevo)
- Trae las personas **ya registradas e invitadas** (en gris, con «Ya registrada» o «Invitada»).
- Trae **2 filas de ejemplo** (en amarillo, «Ejemplo (se ignora)»).
- Debajo, **filas vacías con cuadros** y **listas desplegables** (rol, niveles, permisos extra).
- Hay hojas de **Ayuda** y **Roles**.
- Se agregan las personas nuevas en las filas de abajo y se sube **la misma plantilla**: lo que ya estaba y los ejemplos **se omiten**, y **solo se guarda lo nuevo**.
- El rol y los permisos de quien ya entró **no se cambian por el Excel**: se cambian desde su tarjeta.

> **Estado:** hecho y probado, pero **todavía sin publicar**. Un control de seguridad (el plugin `seguridad-jeiler`) bloquea el guardado porque la librería de Excel (`lib/exceljs/exceljs.min.js`, código de otra gente) tiene números que parecen teléfonos. Hay que ajustar ese control para que ignore la carpeta `lib/`. Mientras tanto, la app publicada baja los Excel **sin ese formato**.

---

## 14. Seguridad: qué protege la app y qué no

### Qué protege (y se probó)
- **Las reglas de Firebase** son las que mandan: aunque alguien truque la pantalla, Firebase dice que no. Hay **147 pruebas** de esas reglas, incluidas pruebas de ataque.
- **Cada módulo se lee solo con su nivel.** «Sin acceso» no lee nada.
- **Correo confirmado obligatorio** para cuentas propias.
- **El rol lo ponen la invitación o el código**, no la persona.
- **Gerentes y Jefes solo se crean desde la consola de Firebase**, y cada código sirve una vez.
- **La Jefe no puede tocar** a otra Jefe ni a un Gerente.
- **Compras:** nadie autoriza lo suyo; el valor se valida; el historial solo crece; cada decisión deja el correo de quien la tomó; las compras y movimientos no se borran.
- **Bodega:** cada cambio de cantidad deja su movimiento.
- **Asistencia y viaje:** cada persona decide solo lo suyo.
- **Avisos de la campana:** llevan la cuenta de quien los crea.
- **Avisos al teléfono:** el servidor (Cloudflare) exige iniciar sesión, saca el rol de la base y limita los avisos por cuenta. Los teléfonos están en Cloudflare, no en Firebase.
- **Clave mínima de 10 caracteres.**
- **Pausar a una persona** la detiene en todos los módulos.
- **Texto limpio:** lo que escribe la gente se muestra sin dejar que se cuele código (probado con ataques).

### El interruptor de las personas de prueba
Las personas de prueba usan una **clave pública**. Cualquiera que la conozca podría entrar con ellas. Por eso:
- La Jefe (con cuenta propia) tiene en **Personas y permisos > Seguridad** un interruptor **«Apagar las personas de prueba»**.
- Apagado, las reglas de Firebase y el servidor de avisos **dejan de aceptarlas**.
- Además se pone `window.PERSONAS_PRUEBA = false` en `config.js` para quitarlas de la pantalla de entrada.
- **Borrar las cuentas de prueba en Firebase NO las apaga** (se pueden volver a crear con la clave pública). Lo que las apaga es **el interruptor**.

---

## 15. Cosas que faltan o se pueden mejorar
**Dicho con claridad, para que no te lleves sorpresas.**

- **App Check** (que solo la app pueda hablar con Firebase) **no está activado**. Hoy lo detienen las reglas.
- **Las reglas se probaron en el emulador**, no con el Firebase real. Hay que pegarlas y probar entrando con cada nivel.
- **Entrar con Google y los correos de confirmación** se probaron con un Firebase falso. Con el real hay que probar con un correo de verdad.
- **El servidor de avisos nuevo** se probó con piezas falsas. Con Cloudflare real hay que crear el KV `AVISOS`, volver a pegar el Worker y volver a activar los avisos en cada teléfono.
- **Los avisos de la campana** todavía los puede **leer** cualquiera con sesión (no los puede crear a nombre de otro). Falta cerrarlo por destinatario.
- **El respaldo del Gerente a los 2 días** no se puede probar «en vivo»: hay que esperar 2 días (o probarlo en el emulador).
- **Pedidos de material con varias líneas** y **préstamo de herramientas** (que queden «por devolver»): no se hicieron.
- **Reuniones:** la Jefe solo puede subir o bajar a «solo ver» o «sin acceso». Logística y acta siguen **por rol** (no por persona).
- **Bodega** es un supuesto mío (Andrés Beltrán).
- **Falta gente** del organigrama real que no estaba en tu archivo.
- **Versión de la librería de Firebase** (10.12.2) es antigua; conviene subirla.
- **OWASP ZAP y Gitleaks** (revisiones de seguridad extra) no se pudieron correr en el entorno.
- **La app real con datos de la empresa** se hará aparte (copia privada y otro Firebase), cuando haya fondos.

---

## 16. Problemas comunes y qué hacer

| Pasa esto | Qué hacer |
|---|---|
| «Tu correo no está en la lista» | El correo no está en el Excel (o es distinto). La Jefe lo agrega, o se le da un código. |
| Se queda en «Confirma tu correo» | Tocar el enlace del correo. Revisar el spam. Hay botón para reenviar. |
| Entró con Google con otro correo | Debe ser el mismo del Excel. |
| «Tu acceso está pausado» | La Jefe le devuelve el acceso (Personas y permisos). |
| El código de un Gerente no sirve | Ya se usó o está mal escrito (mayúsculas y formato `GER-XXXX-XXXX`). Crear otro en `codigosDireccion`. |
| No ves «Personas y permisos» | Entraste como persona de prueba. Entra con tu cuenta propia de Jefe. |
| Un cambio de permiso no se nota | La persona debe cerrar y abrir la app. |
| Firebase «no te deja» hacer algo | Casi siempre: no se pegaron las reglas nuevas, falta confirmar el correo, o la persona no tiene ese permiso. |
| No llegan los avisos al teléfono | Revisar que el Worker diga `"listo":true` y volver a **Activar avisos** en el teléfono. En iPhone, instalar primero la app. |
| La app no muestra lo nuevo | Refrescar fuerte: `Ctrl + Shift + R`. |
| Una compra no se puede autorizar | Puede que la hayas pedido tú (no puedes autorizar lo tuyo) o que le toque a otro (por ejemplo, al Gerente por el monto). |
| Una persona de prueba no puede entrar | Revisa si apagaste las personas de prueba. |

---

## 17. Tabla resumen: quién puede qué

**Nivel por defecto de cada rol en cada módulo** (la Jefe lo puede cambiar por persona):

| Rol | Equipos | Inventario | Vehículos | Reuniones |
|---|---|---|---|---|
| **Gerente** | Solo ver | Resumen y todas las compras; **autoriza** | Solo ver | Solo ver |
| **Jefe** | **Todo** | **Todo** (Panorama) | **Todo** | **Todo** |
| **Encargado de equipos** | **Entrega, recibe, mantenimiento** | Pide | No | No |
| **Soporte** | **Recibe y revisa** | Pide | No | No |
| **Compras** | No | **Hace las compras** | No | Informa |
| **Bodega** | No | **Encargada de bodega** | **Revisa novedades y documentos** | Informa |
| **Transporte** | No | Pide | **Revisa novedades y documentos** | Informa |
| **Conductor** | No | Pide | **Reporta y registra salidas** | Confirma su viaje |
| **Logística** | No | Pide | No | **Alista la reunión** |
| **Profesional** | No | Pide | No | **Confirma su asistencia** |
| **Administrativo** | No | Pide | No | **Registra actas** |
| **Colaborador** | No | Pide (solo ve lo suyo) | No | Solo ver |
| **Financiero** | No | **Ve todo y pide** (no autoriza ni compra) | No | Solo ver |
| **Consulta** | No | Solo ver | Solo ver | No |

**Quién autoriza una compra:**

| La pidió | La autoriza |
|---|---|
| Una persona normal | La Jefe (y luego el Gerente si vale 1.000.000 o más) |
| La Jefe | Un Gerente |
| Un Gerente | Otro Gerente |
| Cualquiera, con la Jefe sin responder 2 días | Un Gerente |

**Quién puede crear cuentas y códigos:**

| Qué | Quién lo hace | Dónde |
|---|---|---|
| Invitar gente (Excel) | La Jefe | Personas y permisos |
| Código de un rol normal | La Jefe | Personas y permisos > Códigos por rol |
| Código de Gerente o de Jefe | **Tú (a mano)** | Consola de Firebase > `codigosDireccion` |
| Cambiar el rol o los permisos de alguien | La Jefe (menos a Gerentes y otras Jefes) | Personas y permisos |
| Cambiar el rol de un Gerente o de otra Jefe | **Tú (a mano)** | Consola de Firebase |
| Apagar las personas de prueba | La Jefe (cuenta propia) | Personas y permisos > Seguridad |
| Cambiar el monto del Gerente | El Gerente (cuenta propia) | Inventario > Resumen |

---

*Fin de la guía. Si algo no queda claro, o quieres que agregue un capítulo (por ejemplo, un paso a paso de cómo probar cada rol uno por uno), dímelo.*
