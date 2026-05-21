// Service Worker para Web Push (notificações de protocolos).
// Mínimo possível: só os listeners `push` e `notificationclick`.
// Não cacheia rotas — Next.js cuida disso.

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {
    titulo: 'Açaí do Kim',
    corpo: 'Você tem um aviso novo',
    url: '/protocolos',
    tag: 'protocolo',
  };
  try {
    if (event.data) {
      const data = event.data.json();
      payload = { ...payload, ...data };
    }
  } catch {
    // Mantém o payload padrão se vier corrompido.
  }

  const opcoes = {
    body: payload.corpo,
    icon: '/branding/acai-do-kim-logo.png',
    badge: '/branding/acai-do-kim-logo.png',
    tag: payload.tag,
    renotify: true,
    data: { url: payload.url },
  };
  event.waitUntil(self.registration.showNotification(payload.titulo, opcoes));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/protocolos';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((lista) => {
        for (const cliente of lista) {
          try {
            const u = new URL(cliente.url);
            // Se já tiver uma janela do app aberta, foca nela e leva para a URL.
            if (u.origin === self.location.origin) {
              cliente.focus();
              if ('navigate' in cliente) return cliente.navigate(url);
              return undefined;
            }
          } catch {
            // ignora URLs inválidas
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
