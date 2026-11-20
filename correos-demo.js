/* correos-demo.js — Los 4 correos de ejemplo de Reuniones (100 % inventados) y la respuesta de respaldo de cada uno.
   En la versión pagada el agente lee el buzón real de Outlook; en la demo la Jefe toca «Llegó este correo».
   La respuesta de respaldo es lo que debería entender el agente: se usa si el agente (Gemini) no está conectado o falla,
   para que la presentación no se caiga. Tiene la misma forma que lo que devuelve el Worker agente-demo. */
(function () {
  'use strict';
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const dos = n => String(n).padStart(2, '0');
  const COMUNIDAD = 'Comunidad Ejemplo Oriente';

  /** Correos con fechas relativas a hoy (para que la demo siempre se vea actual). */
  function generar(hoy) {
    const base = hoy instanceof Date && !isNaN(hoy) ? hoy : new Date();
    const dia = n => new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
    const iso = n => { const d = dia(n); return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`; };
    const larga = n => { const d = dia(n); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
    const firma = '\n\nCordialmente,\nCoordinación de reuniones\nProyecto Costa Norte';
    return [
      { id: 'nueva', etiqueta: 'Reunión nueva', de: 'Coordinación de reuniones', asunto: `Convocatoria: reunión con la ${COMUNIDAD}`,
        texto: `Buenos días, equipo.\n\nLes informo que quedó programada la reunión de socialización con la ${COMUNIDAD} para el ${larga(8)} a las 8:30 a. m. ` +
          'El lugar todavía está por confirmar con la autoridad tradicional.\n\nSe esperan unas 40 personas. Necesitamos refrigerio en la mañana y almuerzo para todos, ' +
          'dos camionetas para el equipo de campo, y llevar sonido con micrófono y sillas.' + firma,
        respaldo: { tipo: 'nueva', comunidad: COMUNIDAD, fecha: iso(8), hora: '08:30', lugar: '', asistentes: 40, refrigerios: true, almuerzo: true, carros: 2,
          logistica: ['Sonido y micrófono', 'Sillas'], faltan: ['lugar'], motivo: '', resumen: `Reunión nueva con la ${COMUNIDAD}: 40 personas, refrigerio, almuerzo, 2 camionetas, sonido y sillas. Falta el lugar.` } },
      { id: 'faltantes', etiqueta: 'Datos que faltaban', de: 'Coordinación de reuniones', asunto: `RE: Convocatoria: reunión con la ${COMUNIDAD}`,
        texto: `Hola de nuevo.\n\nYa se confirmó el lugar de la reunión con la ${COMUNIDAD}: será en la Casa de la cultura de Ejemplo Oriente. ` +
          'La autoridad tradicional avisó que llegarán unas 45 personas, así que hay que ajustar la comida. Lo demás sigue igual.' + firma,
        respaldo: { tipo: 'faltantes', comunidad: COMUNIDAD, fecha: '', hora: '', lugar: 'Casa de la cultura de Ejemplo Oriente', asistentes: 45, refrigerios: true, almuerzo: true, carros: 0,
          logistica: [], faltan: [], motivo: '', resumen: 'Llegó el lugar (Casa de la cultura de Ejemplo Oriente) y ahora son 45 personas.' } },
      { id: 'reprograma', etiqueta: 'Reunión reprogramada', de: 'Coordinación de reuniones', asunto: `Cambio de fecha: reunión con la ${COMUNIDAD}`,
        texto: `Buenas tardes.\n\nLa reunión con la ${COMUNIDAD} se mueve para el ${larga(12)} a las 9:00 a. m., en el mismo lugar. ` +
          'La comunidad tiene otra actividad en la fecha que habíamos acordado. Por favor revisen otra vez los carros y la comida.' + firma,
        respaldo: { tipo: 'reprograma', comunidad: COMUNIDAD, fecha: iso(12), hora: '09:00', lugar: '', asistentes: 0, refrigerios: true, almuerzo: true, carros: 0,
          logistica: [], faltan: [], motivo: 'La comunidad tiene otra actividad en la fecha acordada', resumen: `La reunión pasa al ${larga(12)} a las 9:00 a. m. Hay que revisar otra vez carros y comida.` } },
      { id: 'cancela', etiqueta: 'Reunión cancelada', de: 'Coordinación de reuniones', asunto: `Se cancela la reunión con la ${COMUNIDAD}`,
        texto: `Buenos días.\n\nLes informo que la reunión con la ${COMUNIDAD} queda cancelada. La autoridad tradicional pidió aplazarla y todavía no hay fecha nueva. ` +
          'Por favor cancelen la comida, los carros y lo que se haya pedido.' + firma,
        respaldo: { tipo: 'cancela', comunidad: COMUNIDAD, fecha: '', hora: '', lugar: '', asistentes: 0, refrigerios: false, almuerzo: false, carros: 0,
          logistica: [], faltan: [], motivo: 'La autoridad tradicional pidió aplazarla sin fecha nueva', resumen: 'Se cancela la reunión. Hay que cancelar comida, carros y lo pedido.' } }
    ];
  }
  window.CorreosDemo = Object.freeze({ generar, COMUNIDAD });
})();
