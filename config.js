/* Datos del proyecto de Firebase de la DEMO (ID del proyecto: fir-app-control-d8494). No son secretos: son los mismos que van dentro de la página.
   Lo que protege la información son las reglas de firestore.rules y las cuentas de Authentication.
   Para llenarlo: Firebase > rueda de Configuración del proyecto (Project settings) > General > Tus apps (Your apps) > Configuración del SDK (SDK setup and configuration) > Configuración (Config). */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAo58h-I2Ejfa_fINZtXpwTe4iEjBbCxLg",
  authDomain: "fir-app-control-d8494.firebaseapp.com",
  projectId: "fir-app-control-d8494",
  storageBucket: "fir-app-control-d8494.firebasestorage.app",
  messagingSenderId: "433360043841",
  appId: "1:433360043841:web:da6dc035b1f025eb572bc0"
};

/* Avisos al teléfono (Web Push, gratis) con el Worker "avisos-demo" de Cloudflare.
     url:   la dirección del Worker avisos-demo.
     vapid: la llave PÚBLICA de generar-llaves.html (no es secreta; la privada está solo en Cloudflare como VAPID_D). */
window.AVISOS_DEMO = {
  url: "https://avisos-demo.jrivadeneiramejia1.workers.dev",
  vapid: "BM7_pE-Z6EtHdsDWdW48Q4Sh3-wipaXFKCcFMph30Qe8P8FsqTxfiOQF0ViK-nQQVa_LApA7bH-qIcyq8ryPqEE"
};
// Agente de reuniones (Worker «agente-demo» en Cloudflare con Gemini). Vacío = se usa la respuesta de respaldo de cada correo.
window.AGENTE_DEMO = { url: "https://agente-demo.jrivadeneiramejia1.workers.dev" };
