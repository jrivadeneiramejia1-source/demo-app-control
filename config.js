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

/* Avisos al teléfono (Web Push, gratis). Se llena cuando exista el Worker "avisos-demo" de Cloudflare:
     url:   la dirección del Worker avisos-demo (algo como https://avisos-demo.TU-SUBDOMINIO.workers.dev).
     vapid: la llave PÚBLICA que muestra generar-llaves.html (no es secreta; la privada va solo en Cloudflare).
   Mientras estén vacíos, la app funciona igual y solo no manda avisos al teléfono.
   Descomenta y llena así:
window.AVISOS_DEMO = { url: '', vapid: '' };
*/
