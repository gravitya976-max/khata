const CACHE_NAME = 'khata-v1.1.0'
const ASSETS = [
  '/',
  '/index.html',
]

// Install: cache core assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  )
  self.skipWaiting()
})

// Activate: clean old caches and notify clients
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => {
      // Tell all open pages that a new version is active
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }))
      })
    })
  )
  self.clients.claim()
})

// Fetch: network-first for HTML, cache-first for assets
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  // Skip non-GET requests
  if (e.request.method !== 'GET') return

  // HTML pages: network first, fallback to cache
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone))
        }
        return res
      }).catch(() => caches.match(e.request))
    )
    return
  }

  // Assets (JS, CSS, images): cache first, update in background
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone))
        }
        return res
      }).catch(() => cached)

      return cached || fetchPromise
    })
  )
})
