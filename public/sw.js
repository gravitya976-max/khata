const CACHE_NAME = 'khata-v1.2.0'
const ASSETS = [
  '/',
  '/index.html',
]

// External assets to cache for offline
const EXTERNAL_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/webfonts/fa-solid-900.woff2',
]

// Install: cache core assets + external CDN
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(ASSETS)
      // Cache external assets (non-blocking failures)
      for (const url of EXTERNAL_ASSETS) {
        try { await cache.add(url) } catch {}
      }
    })
  )
  // Don't skip waiting automatically — let the app control when to activate
})

// Listen for SKIP_WAITING message from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
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

// Fetch: network-first for HTML/API, cache-first for assets
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  // Skip non-GET requests
  if (e.request.method !== 'GET') return

  // Skip version.json — always fetch fresh (for update checks)
  if (url.pathname.endsWith('version.json')) {
    e.respondWith(fetch(e.request))
    return
  }

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

  // Assets (JS, CSS, images, fonts): cache first, update in background
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
