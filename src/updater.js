// OTA Update for Khata
// Downloads updated JS/CSS bundle into local IndexedDB and executes in-place.
// Offline-first: works 100% offline once downloaded. No website URL redirects.

const LOCAL_VERSION = '1.2.0'
const VERSION_CHECK_URL = 'https://gravitya976-max.github.io/khata/version.json'
const BASE_HOSTED_URL = 'https://gravitya976-max.github.io/khata/'

// Update state machine: idle → checking → downloading → ready → installing
let updateState = 'idle'
let updateInfo = null
let stateListeners = []

// ──── IndexedDB OTA Storage ────

function openOtaDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('khata_ota_cache', 1)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('bundle')) {
        db.createObjectStore('bundle')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function storeOtaBundle(css, js, version) {
  try {
    const db = await openOtaDB()
    const tx = db.transaction('bundle', 'readwrite')
    tx.objectStore('bundle').put({ css, js, version, time: Date.now() }, 'current')
    await new Promise((res) => { tx.oncomplete = res })
  } catch (err) {
    console.warn('Failed to store OTA bundle:', err)
  }
}

export async function getOtaBundle() {
  try {
    const db = await openOtaDB()
    const tx = db.transaction('bundle', 'readonly')
    const req = tx.objectStore('bundle').get('current')
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function clearOtaBundle() {
  try {
    const db = await openOtaDB()
    const tx = db.transaction('bundle', 'readwrite')
    tx.objectStore('bundle').delete('current')
  } catch {}
}

// ──── State getters & helpers ────

export function getLocalVersion() {
  return localStorage.getItem('ota_version') || LOCAL_VERSION
}

export function isOTAActive() {
  return localStorage.getItem('ota_active') === 'true'
}

export async function resetOTA() {
  localStorage.removeItem('ota_active')
  localStorage.removeItem('ota_version')
  await clearOtaBundle()
  window.location.reload()
}

export function getUpdateState() {
  return { state: updateState, info: updateInfo }
}

export function onUpdateStateChange(callback) {
  stateListeners.push(callback)
  return () => {
    stateListeners = stateListeners.filter((cb) => cb !== callback)
  }
}

function setState(state, info = null) {
  updateState = state
  if (info) updateInfo = info
  stateListeners.forEach((cb) => cb({ state: updateState, info: updateInfo }))
}

// ──── Check for updates & download bundle ────

export async function checkForUpdate() {
  if (!navigator.onLine) return null

  const currentVer = getLocalVersion()
  setState('checking')
  try {
    const res = await fetch(VERSION_CHECK_URL, { cache: 'no-store' })
    if (!res.ok) {
      setState('idle')
      return null
    }
    const remote = await res.json()

    if (remote.version && remote.version !== currentVer && isNewer(remote.version, currentVer)) {
      // Background download of remote bundle
      try {
        const htmlRes = await fetch(BASE_HOSTED_URL + 'index.html', { cache: 'no-store' })
        const htmlText = await htmlRes.text()

        const cssMatch = htmlText.match(/href="([^"]+\.css)"/)
        const jsMatch = htmlText.match(/src="([^"]+\.js)"/)

        if (cssMatch && jsMatch) {
          const cssUrl = new URL(cssMatch[1], BASE_HOSTED_URL).href
          const jsUrl = new URL(jsMatch[1], BASE_HOSTED_URL).href

          const [cssRes, jsRes] = await Promise.all([
            fetch(cssUrl, { cache: 'no-store' }),
            fetch(jsUrl, { cache: 'no-store' })
          ])

          if (cssRes.ok && jsRes.ok) {
            const cssText = await cssRes.text()
            const jsText = await jsRes.text()
            await storeOtaBundle(cssText, jsText, remote.version)
          }
        }
      } catch (e) {
        console.warn('Bundle download failed:', e)
      }

      setState('downloading', {
        version: remote.version,
        changelog: remote.changelog || 'Bug fixes and improvements',
        timestamp: remote.timestamp,
      })
      return remote
    }

    setState('idle')
    return null
  } catch (err) {
    console.warn('Update check failed:', err.message)
    setState('idle')
    return null
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

export function listenForUpdates(callback) {
  if (!('serviceWorker' in navigator)) return

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SW_UPDATED') {
      setState('ready', updateInfo || { version: 'new', changelog: 'App updated in background' })
      callback({ state: 'ready', info: updateInfo || { version: 'new', changelog: 'App updated in background' } })
    }
  })
}

// ──── Apply update ────

export async function applyUpdate() {
  setState('installing')

  if (updateInfo && updateInfo.version) {
    localStorage.setItem('ota_version', updateInfo.version)
  }
  localStorage.setItem('ota_active', 'true')

  setTimeout(() => {
    window.location.reload()
  }, 300)
}

// ──── Dismiss update ────

let dismissedVersion = null

export function dismissUpdate() {
  if (updateInfo) {
    dismissedVersion = updateInfo.version
  }
  setState('idle')
}

export function isDismissed() {
  return updateInfo && updateInfo.version === dismissedVersion
}
