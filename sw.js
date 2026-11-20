/* sw.js: recibe los avisos del teléfono (Web Push) aunque la app esté cerrada.
   No guarda archivos en caché: así nunca sirve una versión vieja de la demo. */
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', e => {
  let d;
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { texto: e.data ? e.data.text() : '' }; }
  const etiqueta = d.etiqueta ? String(d.etiqueta) : undefined;
  e.waitUntil(self.registration.showNotification(d.titulo || 'Control (demo)', {
    body: d.texto || '',
    icon: './iconos/control-192.png?v=5',
    badge: './iconos/control-badge-96.png?v=5',
    tag: etiqueta,
    renotify: !!etiqueta,
    lang: 'es',
    data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const destino = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope);
  // Solo se abren direcciones de la propia demo.
  const url = destino.origin === self.location.origin ? destino.href : self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ventanas => {
    for (const v of ventanas) {
      if (v.url.startsWith(self.registration.scope)) {
        const ir = v.url === url || !v.navigate ? Promise.resolve() : v.navigate(url).catch(() => {});
        return ir.then(() => v.focus());
      }
    }
    return self.clients.openWindow(url);
  }));
});
