---
version: 1
name: Demo app de control (mismo diseño de Equipos y Entregas)
description: Herramientas de campo para soporte técnico en La Guajira. Encabezado verde petróleo, papel arena, tablero de cifras de colores que se toca para filtrar y seriales en monoespaciada. Vivas pero claras.

colors:
  encabezado: "#0A5A4E → #12806C"  # banda de marca con brillo en la esquina (oscuro: #0D3B37 → #14594F)
  arena: "#F4F1E8"            # fondo claro
  papel: "#FFFFFF"            # superficies (claro)
  arena-2: "#EEE9DC"          # superficies hundidas, notas
  linea: "#DFD8C7"
  tinta: "#14201C"            # texto (claro)
  gris: "#56615B"             # texto suave (claro)
  petroleo: "#0B7563"         # acento: acción principal, chip activo, pestaña activa, foco
  sol: "#F2A93B"              # solo insignias (cuántos faltan); texto oscuro encima
  noche: "#0A1B1C"            # fondo oscuro: petróleo profundo, nunca negro puro
  noche-sup: "#11292A"        # superficies (oscuro)
  petroleo-claro: "#3FD1B0"   # acento en oscuro
  estados:                    # solo para estados, nunca decorativos
    en-espera: naranja (#8F5200 / #F2B552)
    parcial: azul (#1D5BA6 / #8AB8F2)
    listo: verde (#136A42 / #66D69A)
    peligro: rojo (#B0281F / #FF8E84), solo errores y borrar

typography:
  familia: Bricolage Grotesque (variable 200-800, incluida en /fuentes)
  monoespaciada: JetBrains Mono 500 (seriales, fechas, cifras de tabla)
  titulo-vista: 1.55rem / 760 / ancho 92 / -0.02em
  titulo-hoja: 1.35rem / 760
  cifra-tablero: 1.9rem / 720, números tabulares
  cuerpo: 16px / 400 / 1.45
  ayuda: 0.84rem, color gris

shapes:
  controles: 12px        # campos, botones (mínimo 44px de alto)
  tarjetas: 18px
  hojas: 24px            # paneles que suben desde abajo; centrados en escritorio
  chips: 999px           # filtros (40px de alto)

icons: Phosphor regular (relleno en la pestaña activa), 1.25em, color heredado. Copiados en iconos.js para usar sin internet.
---

## Overview
Dos apps hermanas que usa un equipo pequeño en campo, casi siempre desde el teléfono y a veces sin señal.
Equipos lleva lo recibido para mantenimiento y backup; Entregas guarda las hojas firmadas y actualiza Equipos.
La interfaz prioriza leer rápido el estado de cada equipo y hacer la siguiente acción con un toque.

## Signature
El encabezado de color con la marca de cada app, y el tablero de tres cifras de colores arriba de cada lista:
cada cifra tiene su franja, su icono y cuenta hasta su valor; al tocarla filtra la lista (otra vez, la quita).
Las tarjetas llevan franja de estado a la izquierda (naranja en espera, azul a medias, verde listo)
y cada tipo de equipo tiene su placa de color con icono.

## Interacción
- Al cambiar de sección la lista entra escalonada (0,3 s). Al marcar una tarea, el botón brilla en verde.
- Las insignias saltan cuando cambia el número. Los avisos traen icono: verde si salió bien, sol si hay problema.
- Con una hoja abierta, los avisos salen arriba para no tapar Guardar.
- Todo se apaga con "reducir movimiento" del teléfono.

## Do
- Un acento (petróleo) y el sol solo para insignias. Los colores de estado solo dicen estado.
- Cada propiedad moderna (color-mix, dvh) lleva antes un valor de respaldo para teléfonos viejos.
- Tema automático (el del teléfono) con botón en el encabezado para escoger claro u oscuro; se guarda en el teléfono y lo comparten Equipos y Entregas. Probar los tres.
- Español, voz activa, segunda persona. Los errores dicen qué hacer.
- Cargas con esqueletos que imitan la lista; textos de espera con "…".
- Hojas y diálogos: foco adentro al abrir, Escape cierra solo lo de arriba, el foco vuelve al botón que la abrió.
- Avisar antes de cerrar con cambios sin guardar y antes de todo lo que no se puede deshacer.
- Áreas táctiles de 44px como mínimo (chips y segmentos 38 a 40px).

## Don't
- No guion largo, no tres puntos sueltos, no emojis ni símbolos (✓ ✕ 📷) como iconos.
- No iconos dibujados a mano.
- No `prompt()`, `confirm()` ni `alert()` del navegador: todo dentro de la app.
- No `transition: all`; solo transform, colores y sombras.
- No fuentes ni librerías de diseño desde internet: todo está en el repo para que abra sin señal.

## Demo de la app de control (agregado)
- Mismo sistema que Equipos y Entregas: se copió `comun.css` sin cambios; lo propio está en `demo.css`.
- **Marca:** el emblema del logo de la empresa (círculo de franjas celeste, verde, amarillo y café, sobre blanco) en el encabezado, en la pestaña del navegador y en el acceso directo del teléfono; el logo completo, en una tarjeta blanca, arriba de la entrada. El logo original era de 260 px: se agrandó y se limpió a sus colores planos para que se vea nítido. Sigue el azul mar del encabezado (el azul del logo combina con él).
- **Persona:** botón redondo con las iniciales en el encabezado; en la demo todos los avatares van en el mismo azul (ver «Estilo de la demo»). En pantallas de 400 px o menos solo se ven las iniciales.
- **Versión pagada:** franja azul con borde punteado y el ícono `pagada` (chispa). Siempre al final de la vista, nunca tapa una acción.
- **Peligro en el tablero:** `t-peligro` (rojo) solo para lo que es un problema: compra sin autorizar, documento vencido o por vencer.
- **Placa del carro:** amarilla con borde oscuro y letra monoespaciada, como la placa real.
- **Fotos de los carros:** botón «Tomar foto» que abre la cámara (el campo de archivo queda oculto pero accesible); al tomarla sale la miniatura y el botón dice «Cambiar». Salida y llegada en cuadrícula de 5 (frente, atrás, lados y llantas); en la hoja de vida, fila de miniaturas por cada salida o llegada.
- **Fases por venir:** nota con borde punteado y fondo transparente, para que no se confunda con un aviso.


## Estilo de la demo (caribe.css)
Para presentar a toda la empresa, no solo a sistemas: un solo color de marca (azul mar `#0B4058` a `#156E8E`) y profundidad con sombras en capas (relieve) en vez de muchos colores. Los colores de estado (rojo, naranja, azul, verde) solo marcan estados. Todos los avatares van en el mismo azul. Letra Nunito. Ícono: el emblema de la empresa sobre blanco (en el ícono adaptable de Android lleva más margen).
