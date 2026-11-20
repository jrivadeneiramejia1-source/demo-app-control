# Lo que sigue (pedido de los jefes, 20 de noviembre de 2026)

Los jefes probaron la demo y les gustó. Ahora piden lo siguiente, en este orden.

> **Plan acordado (20 de noviembre de 2026, con las respuestas del jefe): [`.planes/fases-a-b-s.md`](.planes/fases-a-b-s.md).** Cubre las fases A, B y S. Si algo de abajo choca con ese plan, manda el plan. Para empezar, Jeiler dice «haz el plan» o «ejecuta». Equipos, Vehículos y Reuniones se dejan como están en ese plan.

## Antes de empezar
- La corrección de reglas de novedades (commit 91ed074) está en `desarrollo` y falta pasarla a `main` con el «sí» de Jeiler.
- Seguir con la app como está (JS sin compilar, GitHub Pages, Firebase). No pasar a React: habría que rehacer todo y agregar un paso de compilar, sin ganancia para la demo.

## Fase A — Roles, códigos y permisos por persona
1. Los códigos de los roles y la sección de gente los maneja **la Jefe**, no el Gerente. El Gerente solo ve el resumen (como está ahora, eso les gusta), sin detalle ni manejo de personas.
2. Permisos por persona más finos: la Jefe puede darle a alguien una sección que su rol no tiene y elegir el nivel: **solo ver** o **ver y editar**. Ejemplo: un bodeguero que mira Equipos pero no cambia nada. Debe cumplirse también en `firestore.rules`, no solo en la pantalla.
3. Cada rol sigue viendo cosas distintas según su trabajo (ejemplo: en Vehículos, la coordinadora ve unas cosas y el conductor otras). Jeiler irá diciendo qué hace cada rol.
4. Nombres de las personas y qué hace cada una: los manda Jeiler. **El repo es público**: los nombres reales no van en el código ni en `datos-demo.js`. La Jefe los crea desde la app (quedan solo en Firebase).

## Fase B — Inventario a fondo (la prioridad)
1. Investigar apps parecidas y tomar lo que sirva (inventario con bodega, compras y aprobaciones).
2. Revisar con lógica qué ve y qué hace cada rol que toca el inventario: quien compra, Bodega, quien pide material, la Jefe y el Gerente. Agregar lo que haga falta.
3. Compras: que el Gerente vea los montos más detallados (qué se compra, cuánto vale cada cosa, a quién, para qué) antes de autorizar.
4. Cambiar la vista de la Jefe para que vea todo el inventario de forma clara.
5. Todo debe funcionar de verdad: probar cada rol con Playwright y revisar las reglas.

## Fase C — Después
- Reuniones: en la vista del Gerente y de la Jefe, la lista que muestra «pendiente», el nombre de cada uno y un número no se entiende. Aclarar qué es.
- Pulido general.

## Cómo se trabaja
Igual que siempre (ver `CLAUDE.md`): rama `desarrollo`, a `main` solo con «sí», `npm run lint` y `npm run pruebas` antes de entregar, solo datos inventados.
