// OTA Update for Khata
// Since the app loads from GitHub Pages, the service worker handles
// fetching new assets. This module listens for SW update events
// and shows a reload prompt.

const LOCAL_VERSION = '1.2.0'

export function getLocalVersion() {
  return LOCAL_VERSION
}

// Listen for service worker update messages
export function listenForUpdates(callback) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SW_UPDATED') {
        callback({ version: 'new', changelog: 'App updated in background' })
      }
    })

    // Also check for waiting service worker (update downloaded but not active)
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting) {
        callback({ version: 'new', changelog: 'Update ready to install' })
      }
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              callback({ version: 'new', changelog: 'Update ready to install' })
            }
          })
        }
      })
    })
  }
}

export function applyUpdate() {
  // Force reload to pick up new cached assets
  window.location.reload()
}
