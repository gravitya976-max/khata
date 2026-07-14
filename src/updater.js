// OTA Update Checker for Khata
// Checks a remote version.json against the local version.
// If newer, prompts the user and reloads from the updated service worker cache.

const LOCAL_VERSION = '1.1.0'

// CHANGE THIS to your GitHub Pages URL or raw GitHub content URL
// Example: 'https://YOUR_USERNAME.github.io/khata'
// For now, set to null (disabled) until you push to GitHub
const UPDATE_BASE_URL = null

export function getLocalVersion() {
  return LOCAL_VERSION
}

export async function checkForUpdate() {
  if (!UPDATE_BASE_URL) return null

  try {
    const res = await fetch(`${UPDATE_BASE_URL}/version.json?t=${Date.now()}`, {
      cache: 'no-store'
    })
    if (!res.ok) return null
    const remote = await res.json()

    if (remote.version && remote.version !== LOCAL_VERSION) {
      return {
        version: remote.version,
        changelog: remote.changelog || 'Bug fixes and improvements',
        url: UPDATE_BASE_URL
      }
    }
    return null
  } catch {
    // Offline or network error — skip silently
    return null
  }
}

export async function applyUpdate(updateInfo) {
  if (!updateInfo) return

  // Force service worker to fetch fresh assets
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.getRegistration()
    if (reg) {
      // Clear old cache
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))

      // Force SW update check
      await reg.update()
    }
  }

  // Store the new version so the app knows it was updated
  localStorage.setItem('khata_last_update', updateInfo.version)

  // Reload the page — service worker will fetch fresh files
  window.location.reload()
}
