// Firebase falso (solo pruebas): imita firebase-app.js v10.12.2.
// Solo exporta lo que usa la app: initializeApp(config) -> app.

// Se guarda la app creada para devolver siempre la misma (como el SDK real).
let appPorDefecto = null;

export function initializeApp(config) {
  if (!appPorDefecto) {
    appPorDefecto = { name: '[DEFAULT]', options: config || {}, automaticDataCollectionEnabled: false };
  }
  return appPorDefecto;
}
