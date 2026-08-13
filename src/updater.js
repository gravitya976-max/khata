// updater.js — UI-only update notifications for Khata
// All actual update logic lives in sw.js (independent of app code).
// This module only provides UI hooks to display update prompts.

const LOCAL_VERSION = '1.3.1'
const VERSION_CHECK_URL = 'https://gravitya976-max.github.io/khata/version.json'

// Update state for UI
let updateState = 'idle'
let updateInfo = null
let stateListeners = []

// ──── State getters & helpers ────

export function getLocalVersion() {
  return LOCAL_VERSION
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

// ──── Check for updates (UI-only — just reads version.json) ────

export async function checkForUpdate() {
  if (!navigator.onLine) return null

  setState('checking')
  try {
    const res = await fetch(VERSION_CHECK_URL, { cache: 'no-store' })
    if (!res.ok) {
      setState('idle')
      return null
    }
    const remote = await res.json()

    if (remote.version && remote.version !== LOCAL_VERSION && isNewer(remote.version, LOCAL_VERSION)) {
      setState('ready', {
        version: remote.version,
        changelog: remote.changelog || 'Bug fixes and improvements',
      })

      // Ask SW to check and download the update
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CHECK_UPDATE' })
      }

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

// ──── Listen for SW update messages ────

export function listenForUpdates(callback) {
  if (!('serviceWorker' in navigator)) return

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data) {
      if (event.data.type === 'SW_UPDATE_READY') {
        const info = {
          version: event.data.version || 'new',
          changelog: event.data.changelog || 'Bug fixes and improvements',
        }
        setState('ready', info)
        callback({ state: 'ready', info })
      }
      if (event.data.type === 'SW_ACTIVATED') {
        // New SW version is active — no action needed, just informational
        console.log('[Updater] SW activated version:', event.data.version)
      }
    }
  })
}

// ──── Apply update: Tell SW to activate and reload ────

export function applyUpdate() {
  setState('installing')

  // Tell waiting SW to activate
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      }
    })
  }

  // Reload after a brief delay to let SW activate
  setTimeout(() => {
    window.location.reload()
  }, 500)
}

// ──── Dismiss update ────

export function dismissUpdate() {
  setState('idle')
}
