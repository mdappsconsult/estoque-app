// Service Worker para Web Push (notificações de protocolos).
// VERSÃO 2 — sem icon/badge (iOS rejeita ícones não-quadrados e a promessa do
// showNotification falha, fazendo o iOS mostrar uma notificação placeholder
// genérica "controle de estoque / Notificação" em vez do conteúdo real).

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let titulo = 'Açaí do Kim';
  let corpo = 'Você tem um aviso novo';
  let url = '/protocolos';
  let tag = 'protocolo';

  if (event.data) {
    let data = null;
    try {
      data = event.data.json();
    } catch {
      try {
        const raw = event.data.text();
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }
    }
    if (data && typeof data === 'object') {
      if (typeof data.titulo === 'string' && data.titulo.trim()) titulo = data.titulo;
      if (typeof data.corpo === 'string' && data.corpo.trim()) corpo = data.corpo;
      if (typeof data.url === 'string' && data.url.trim()) url = data.url;
      if (typeof data.tag === 'string' && data.tag.trim()) tag = data.tag;
    }
  }

  const opcoes = {
    body: corpo,
    tag,
    renotify: true,
    data: { url },
  };

  event.waitUntil(
    self.registration.showNotification(titulo, opcoes).catch((err) => {
      // Em último caso, mostra algo simples para o usuário não ficar sem aviso.
      console.warn('[sw] showNotification falhou:', err);
      return self.registration.showNotification(titulo, { body: corpo });
    })
  );
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
