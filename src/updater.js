// OTA Update for Khata
// Assets are bundled locally in the APK (offline-first).
// When online, checks for a new version from the hosted version.json.
// Service worker handles caching; this module manages the update UX.

const LOCAL_VERSION = '1.2.0'

// Update state machine: idle → checking → downloading → ready → installing
let updateState = 'idle'
let updateInfo = null
let stateListeners = []

const HOSTED_APP_URL = 'https://gravitya976-max.github.io/khata/'

export function getLocalVersion() {
  return localStorage.getItem('ota_version') || LOCAL_VERSION
}

export function isOTAActive() {
  return localStorage.getItem('ota_active') === 'true'
}

export function resetOTA() {
  localStorage.removeItem('ota_active')
  localStorage.removeItem('ota_version')
  window.location.href = 'http://localhost/'
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

// ──── Check for updates via version.json ────

const VERSION_CHECK_URL = 'https://gravitya976-max.github.io/khata/version.json'

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

// ──── Service Worker update detection ────

export function listenForUpdates(callback) {
  if (!('serviceWorker' in navigator)) return

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SW_UPDATED') {
      setState('ready', updateInfo || { version: 'new', changelog: 'App updated in background' })
      callback({ state: 'ready', info: updateInfo || { version: 'new', changelog: 'App updated in background' } })
    }
  })

  navigator.serviceWorker.ready.then((reg) => {
    if (reg.waiting) {
      setState('ready', updateInfo || { version: 'new', changelog: 'Update ready to install' })
      callback({ state: 'ready', info: updateInfo || { version: 'new', changelog: 'Update ready to install' } })
    }
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setState('ready', updateInfo || { version: 'new', changelog: 'Update ready to install' })
            callback({ state: 'ready', info: updateInfo || { version: 'new', changelog: 'Update ready to install' } })
          }
        })
      }
    })
  })
}

// ──── Apply update ────

export function applyUpdate() {
  setState('installing')

  if (updateInfo && updateInfo.version) {
    localStorage.setItem('ota_version', updateInfo.version)
  }
  localStorage.setItem('ota_active', 'true')

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      }
    })
  }

  setTimeout(() => {
    window.location.href = HOSTED_APP_URL
  }, 300)
}

// ──── Dismiss update (persist reminder) ────

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
