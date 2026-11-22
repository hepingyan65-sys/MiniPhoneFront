// Service Worker：负责在 App 没打开的时候接收推送、弹出通知

self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: '小手机', body: '' };
  try {
    data = event.data.json();
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  const options = {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: data.url || './index.html' }
  };
  event.waitUntil(self.registration.showNotification(data.title || '小手机', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let targetUrl = (event.notification.data && event.notification.data.url) || './index.html';
  // 现在的推送都是 FromAlis 的：点开直接进 FromAlis，不停在封面
  if (!targetUrl.includes('#')) targetUrl += '#alis';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ open: 'alis' }); // App 本来就开着（在后台）：叫它从封面进去
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
