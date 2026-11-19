# Reglas para trabajar en este repo (es público)
- **Solo datos inventados.** Nada de personas, clientes, comunidades ni correos reales. El plan gratis de Gemini puede usar lo que se le manda.
- **Nunca pedir ni guardar claves, tokens ni contraseñas.** La de Gemini la pega Jeiler directo en Cloudflare. La única clave en el código es la de las cuentas de prueba (`personas.js`), inventada y pública a propósito.
- **No tocar las apps reales:** `apps-consulta-previa` solo se lee para copiar la base. Este repo usa su propio proyecto de Firebase (ID `fir-app-control-d8494`).
- Nada se publica solo: se trabaja en la rama `desarrollo`; a `main` (la que publica GitHub Pages) solo pasa lo que Jeiler apruebe con un «sí».
- Nada que gaste plata o créditos sin el «sí» de Jeiler. Nada del SENA en textos, nombres ni logos.
- Antes de entregar una fase: `npm run lint` y `npm run pruebas` (con `CHROME=/ruta/a/chrome` si no está el Chromium de Playwright), mirar las capturas y decir qué quedó sin probar.
- Responder a Jeiler en español simple; los botones en inglés, traducidos entre paréntesis.
- Diseño: seguir `DESIGN.md` (mismo sistema de Equipos y Entregas).
