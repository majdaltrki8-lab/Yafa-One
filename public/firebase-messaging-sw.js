// Firebase Cloud Messaging Service Worker for Yafa One Android & Web Push Notifications
if (typeof self !== 'undefined' && typeof importScripts === 'function') {
  try {
    importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js')
    importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js')

    if (typeof firebase !== 'undefined') {
      firebase.initializeApp({
        projectId: "yafa-one",
        appId: "1:1086740919006:web:f9daa71d15bca8cca0484f",
        apiKey: "AIzaSyAT2SraD1gYe6A1oviIoT6RwCSk-ERn_uY",
        messagingSenderId: "1086740919006"
      })

      const messaging = firebase.messaging()

      messaging.onBackgroundMessage((payload) => {
        const notificationTitle = payload.notification?.title || 'يافع ون | إشعار جديد'
        const notificationOptions = {
          body: payload.notification?.body || 'لديك تحديث جديد في منصة يافع ون',
          icon: '/icons/icon-512.png',
          badge: '/icons/icon-512.png',
          data: {
            url: payload.data?.url || '/'
          }
        }

        if (self.registration) {
          self.registration.showNotification(notificationTitle, notificationOptions)
        }
      })
    }
  } catch (err) {
    console.warn('[FCM SW] Service worker init notice:', err)
  }

  self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const targetUrl = event.notification.data?.url || '/'
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        for (let client of windowClients) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus()
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl)
        }
      })
    )
  })
}
