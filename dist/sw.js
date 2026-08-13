// Khata Service Worker — Independent Update Engine
// This file runs completely independently of the app code.
// Even if the app JS is broken, this SW can still:
// 1. Serve cached assets for offline use
// 2. Check for new versions periodically
// 3. Download and cache new versions
// 4. Self-heal broken updates by replacing with newer versions

const APP_VERSION = '1.3.0'
const CACHE_PREFIX = 'khata-v'
const CACHE_NAME = CACHE_PREFIX + APP_VERSION
const VERSION_CHECK_URL = 'https://gravitya976-max.github.io/khata/version.json'
const BASE_HOSTED_URL = 'https://gravitya976-max.github.io/khata/'

// How often to check for updates (30 minutes)
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000

// Core assets to cache on install
const CORE_ASSETS = [
  '/',
  '/index.html',
]

// External CDN assets for offline use
const EXTERNAL_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/webfonts/fa-solid-900.woff2',
]

// ──── Install: Cache core assets ────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(CORE_ASSETS)
      // Cache external assets (non-blocking failures)
      for (const url of EXTERNAL_ASSETS) {
        try { await cache.add(url) } catch {}
      }
    })
  )
  // Don't skip waiting automatically — let the app or update logic control this
})

// ──── Message handler ────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  if (event.data && event.data.type === 'CHECK_UPDATE') {
    checkForUpdateAndCache()
  }
})

// ──── Activate: Clean old caches, notify clients, start update checker ────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => {
      // Notify all open pages that a new version is active
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({
          type: 'SW_ACTIVATED',
          version: APP_VERSION,
        }))
      })
    })
  )
  self.clients.claim()

  // Start periodic update checks
  startPeriodicUpdateCheck()
})

// ──── Fetch: Serve from cache, update in background ────
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  // Skip non-GET requests
  if (e.request.method !== 'GET') return

  // Skip version.json — always fetch fresh
  if (url.pathname.endsWith('version.json')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)))
    return
  }

  // Skip Turso/Firebase API calls — never cache these
  if (url.hostname.includes('turso.io') ||
      url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebaseio.com')) {
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
      }).catch(() => caches.match(e.request) || caches.match('/index.html'))
    )
    return
  }

  // All other assets: cache first, update in background (stale-while-revalidate)
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

// ──── Periodic Update Check ────

let updateCheckTimer = null

function startPeriodicUpdateCheck() {
  // Clear any existing timer
  if (updateCheckTimer) clearInterval(updateCheckTimer)

  // Check immediately on activation, then periodically
  setTimeout(() => checkForUpdateAndCache(), 5000)
  updateCheckTimer = setInterval(() => checkForUpdateAndCache(), UPDATE_CHECK_INTERVAL)
}

async function checkForUpdateAndCache() {
  try {
    const res = await fetch(VERSION_CHECK_URL, { cache: 'no-store' })
    if (!res.ok) return

    const remote = await res.json()
    if (!remote.version || !isNewer(remote.version, APP_VERSION)) return

    console.log(`[SW] New version ${remote.version} available (current: ${APP_VERSION})`)

    // Download the remote index.html to discover asset URLs
    const htmlRes = await fetch(BASE_HOSTED_URL + 'index.html', { cache: 'no-store' })
    if (!htmlRes.ok) return
    const htmlText = await htmlRes.text()

    // Parse asset URLs from the HTML
    const assetsToCache = [BASE_HOSTED_URL + 'index.html']

    // Find all CSS links
    const cssMatches = htmlText.matchAll(/href="([^"]+\.css[^"]*)"/g)
    for (const match of cssMatches) {
      assetsToCache.push(new URL(match[1], BASE_HOSTED_URL).href)
    }

    // Find all JS scripts
    const jsMatches = htmlText.matchAll(/src="([^"]+\.js[^"]*)"/g)
    for (const match of jsMatches) {
      assetsToCache.push(new URL(match[1], BASE_HOSTED_URL).href)
    }

    // Create a new versioned cache and download all assets
    const newCacheName = CACHE_PREFIX + remote.version
    const newCache = await caches.open(newCacheName)

    let allCached = true
    for (const assetUrl of assetsToCache) {
      try {
        const assetRes = await fetch(assetUrl, { cache: 'no-store' })
        if (assetRes.ok) {
          await newCache.put(assetUrl, assetRes)
        } else {
          allCached = false
        }
      } catch {
        allCached = false
      }
    }

    // Also cache external assets in the new cache
    for (const url of EXTERNAL_ASSETS) {
      try {
        const extRes = await fetch(url, { cache: 'no-store' })
        if (extRes.ok) await newCache.put(url, extRes)
      } catch {}
    }

    if (allCached) {
      console.log(`[SW] Version ${remote.version} cached successfully`)

      // Notify all clients that an update is ready
      const clients = await self.clients.matchAll()
      clients.forEach((client) => {
        client.postMessage({
          type: 'SW_UPDATE_READY',
          version: remote.version,
          changelog: remote.changelog || 'Bug fixes and improvements',
        })
      })
    } else {
      // Partial download — clean up the incomplete cache
      console.warn('[SW] Failed to cache all assets for new version, cleaning up')
      await caches.delete(newCacheName)
    }
  } catch (err) {
    console.warn('[SW] Update check failed:', err.message)
  }
}

function isNewer(remote, local) {
  const r = remote.split('.').map(Number)
  const l = local.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true
    if ((r[i] || 0) < (l[i] || 0)) return false
  }
  return false
}
