/* sw.js: recibe los avisos del teléfono (Web Push) aunque la app esté cerrada.
   Del resto de la app no guarda nada en caché (así nunca sirve una versión vieja). La única excepción es el lector de códigos
   (lib/codigos/: ponyfill.js y el motor zxing_reader.wasm, 1 MB), que casi nunca cambia: se guarda con un número de versión
   para que el escáner abra aunque no haya internet. Si algún día se cambian esos archivos, se sube el número de CACHE_CODIGOS. */
const CACHE_CODIGOS = 'codigos-v1';
const ARCHIVOS_CODIGOS = ['lib/codigos/ponyfill.js', 'lib/codigos/zxing_reader.wasm'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_CODIGOS)
    .then(c => Promise.all(ARCHIVOS_CODIGOS.map(f => c.add(new Request(new URL(f, self.registration.scope), { cache: 'reload' })).catch(() => {}))))
    .catch(() => {})
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('codigos-') && k !== CACHE_CODIGOS).map(k => caches.delete(k)))).catch(() => {}).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || !/\/lib\/codigos\/(ponyfill\.js|zxing_reader\.wasm)$/.test(u.pathname)) return;
  const clave = u.origin + u.pathname;
  e.respondWith(caches.open(CACHE_CODIGOS).then(c => c.match(clave).then(hit => hit || fetch(e.request).then(r => { if (r && r.ok) c.put(clave, r.clone()); return r; }))));
});

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
        // Con la app ya abierta se le avisa por mensaje (cambiar solo el # no recarga la página) y, si se puede, se lleva a esa dirección.
        try { v.postMessage({ tipo: 'abrir', url }); } catch (x) { /* sin mensaje: igual se navega */ }
        const ir = v.url === url || !v.navigate ? Promise.resolve() : v.navigate(url).catch(() => {});
        return ir.then(() => v.focus());
      }
    }
    return self.clients.openWindow(url);
  }));
});
