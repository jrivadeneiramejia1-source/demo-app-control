# Excel con formato: trabajo hecho y probado, pendiente de aplicar (21-nov-2026)

Todo está en `excel-pendiente.patch` (esta misma carpeta), **menos la librería ExcelJS** (`lib/exceljs/exceljs.min.js`, 947 KB), que un control de seguridad (plugin `seguridad-jeiler`) bloquea al guardar porque sus constantes parecen teléfonos (falso positivo).

## Qué trae el parche
- `excel.js` (nuevo): arma todos los Excel con el mismo formato (título grande en negrilla, subtítulo, columnas en negrilla con fondo, cuadros, anchos, fila fija, filtros, `$` en la plata, listas desplegables). Usa ExcelJS, que se carga solo al descargar.
- `gente.js`: la plantilla de personas trae lo que ya está (gris, «Ya registrada» / «Invitada»), 2 ejemplos (amarillo, se ignoran) y filas vacías con listas; el lector encuentra los títulos aunque estén más abajo; al subir la misma plantilla se omite lo que ya estaba y los ejemplos, y solo se guarda lo nuevo.
- `inventario.js`, `vehiculos.js`: sus Excel (y el kárdex) usan el formato nuevo.
- `equipos.js`, `reuniones.js`, `index.html`: botones y Excel nuevos de Equipos (equipos y actas, sin cédulas ni firmas) y de Reuniones (reuniones y tareas).
- `datos-demo.js`: la solicitud de material `so-003` pasa de hace 2 a hace 3 días (una prueba dependía de la hora del día).
- `pruebas/prueba.mjs`: pruebas nuevas del formato, de la plantilla (ida y vuelta) y de los Excel de Equipos y Reuniones.
- `README.md`, versiones de los scripts en `index.html`, `lib/exceljs/LEEME.txt` y `LICENSE.txt`.

## Cómo aplicarlo
1. `git apply .planes/excel-pendiente.patch` (desde la raíz del repo).
2. Bajar la librería (MIT) en una carpeta nueva y copiarla:
   `npm pack exceljs@4.4.0`, descomprimir el `.tgz` y copiar `package/dist/exceljs.min.js` a `lib/exceljs/exceljs.min.js`.
3. `npm run lint` y `npm run pruebas` (con `CHROME=/opt/pw-browsers/chromium`). Antes de aplicar, 349 pruebas del navegador pasaban con esto.
4. Guardar (commit) y subir a `desarrollo`. Si el control de `seguridad-jeiler` vuelve a bloquear por la librería, el plugin de Jeiler tiene que ignorar `lib/` (línea 19 de `hooks/register.ts`) y estar actualizado en la sesión.
5. Borrar `.planes/excel-pendiente.patch` y este archivo cuando ya esté aplicado.

A `main` solo pasa con el «sí» explícito de Jeiler.
