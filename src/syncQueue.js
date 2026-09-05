// syncQueue.js — Persistent sync queue for Khata
// Queues all write operations in IndexedDB and replays to Turso when online.
// All Turso operations are namespaced by user ID.

import { openDB, getUserId } from './db'
import {
  initTurso,
  isTursoConfigured,
  getTursoStatus,
  pushPeople,
  pushCollection,
  pushDeletePerson,
  pushDeleteCollection,
  pushClearAll,
  pushFullData,
  setSyncTimestamp,
  getLastSyncTime,
  pullAllData,
} from './turso'

const QUEUE_STORE = 'sync_queue'
let isProcessing = false
let statusListeners = []

// ──── Status ────

let syncStatus = {
  isOnline: navigator.onLine,
  isSyncing: false,
  pending: 0,
  lastSyncedAt: null,
  tursoStatus: 'Not configured',
  error: null,
}

export function getSyncStatus() {
  return { ...syncStatus }
}

export function onSyncStatusChange(callback) {
  statusListeners.push(callback)
  return () => {
    statusListeners = statusListeners.filter((cb) => cb !== callback)
  }
}

function notifyListeners() {
  const status = getSyncStatus()
  statusListeners.forEach((cb) => cb(status))
}

function updateStatus(updates) {
  Object.assign(syncStatus, updates)
  notifyListeners()
}

// ──── Enqueue ────

export async function enqueue(action, payload) {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(QUEUE_STORE, 'readwrite')
    const store = tx.objectStore(QUEUE_STORE)
    store.add({
      action,
      payload,
      status: 'pending',
      createdAt: Date.now(),
      retryCount: 0,
    })
    tx.oncomplete = () => {
      updatePendingCount()
      // Don't process queue here — it runs on background sync (minimize/close/idle)
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

// ──── Get pending count ────

async function updatePendingCount() {
  try {
    const database = await openDB()
    const tx = database.transaction(QUEUE_STORE, 'readonly')
    const store = tx.objectStore(QUEUE_STORE)
    const idx = store.index('status')
    const req = idx.count('pending')
    req.onsuccess = () => {
      updateStatus({ pending: req.result })
    }
  } catch {
  }
}

// ──── Process Queue ────

export async function processQueue() {
  if (isProcessing || !navigator.onLine) return
  if (!isTursoConfigured()) return

  // Must have a user ID to sync
  const userId = await getUserId()
  if (!userId) return

  isProcessing = true
  updateStatus({ isSyncing: true })

  try {
    const connected = await initTurso()
    if (!connected) {
      updateStatus({ isSyncing: false, tursoStatus: getTursoStatus().status, error: getTursoStatus().error })
      isProcessing = false
      return
    }

    updateStatus({ tursoStatus: 'Connected' })

    const database = await openDB()
    const items = await getPendingItems(database)

    let allSucceeded = true

    for (const item of items) {
      let success = false

      try {
        switch (item.action) {
          case 'syncPeople':
            success = await pushPeople(item.payload.people, userId)
            break
          case 'syncCollection':
            success = await pushCollection(item.payload.personId, item.payload.date, item.payload.amount, userId)
            break
          case 'deletePerson':
            success = await pushDeletePerson(item.payload.id, userId)
            break
          case 'deleteCollection':
            success = await pushDeleteCollection(item.payload.personId, item.payload.date, userId)
            break
          case 'clearAll':
            success = await pushClearAll(userId)
            break
          case 'fullSync':
            success = await pushFullData(item.payload, userId)
            break
          default:
            console.warn('Unknown sync action:', item.action)
            success = true
        }
      } catch (err) {
        console.warn('Sync action failed:', item.action, err.message)
      }

      if (success) {
        await markDone(database, item.id)
      } else {
        allSucceeded = false
        await markRetry(database, item.id, item.retryCount)
        break
      }
    }

    if (allSucceeded && items.length > 0) {
      await setSyncTimestamp(userId)
    }

    const lastSync = await getLastSyncTime(userId)
    updateStatus({
      isSyncing: false,
      lastSyncedAt: lastSync,
      tursoStatus: 'Connected',
      error: allSucceeded ? null : 'Some items failed to sync',
    })
    await updatePendingCount()
  } catch (err) {
    console.warn('Queue processing error:', err.message)
    updateStatus({ isSyncing: false, error: err.message })
  }

  isProcessing = false
}

function getPendingItems(database) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(QUEUE_STORE, 'readonly')
    const store = tx.objectStore(QUEUE_STORE)
    const idx = store.index('status')
    const req = idx.getAll('pending')
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.createdAt - b.createdAt))
    req.onerror = () => reject(req.error)
  })
}

function markDone(database, id) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(QUEUE_STORE, 'readwrite')
    const store = tx.objectStore(QUEUE_STORE)
    const req = store.get(id)
    req.onsuccess = () => {
      const item = req.result
      if (item) {
        item.status = 'done'
        item.completedAt = Date.now()
        store.put(item)
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function markRetry(database, id, currentRetry) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(QUEUE_STORE, 'readwrite')
    const store = tx.objectStore(QUEUE_STORE)
    const req = store.get(id)
    req.onsuccess = () => {
      const item = req.result
      if (item) {
        item.retryCount = currentRetry + 1
        if (item.retryCount >= 5) {
          item.status = 'failed'
        }
        store.put(item)
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ──── Cleanup old done items ────

async function cleanupDoneItems() {
  try {
    const database = await openDB()
    const tx = database.transaction(QUEUE_STORE, 'readwrite')
    const store = tx.objectStore(QUEUE_STORE)
    const idx = store.index('status')
    const req = idx.getAll('done')
    req.onsuccess = () => {
      const done = req.result.sort((a, b) => b.completedAt - a.completedAt)
      done.slice(50).forEach((item) => store.delete(item.id))
    }
  } catch {
  }
}

// ──── Cloud restore (Turso, per user) ────

export async function tryTursoRestore(userId) {
  if (!isTursoConfigured() || !navigator.onLine) return null
  if (!userId) return null

  try {
    const connected = await initTurso()
    if (!connected) return null

    const data = await pullAllData(userId)
    return data
  } catch (err) {
    console.warn('Turso restore failed:', err.message)
    return null
  }
}

// ──── Network listeners ────

export function initSyncListeners() {
  window.addEventListener('online', () => {
    updateStatus({ isOnline: true })
  })

  window.addEventListener('offline', () => {
    updateStatus({ isOnline: false })
  })

  updateStatus({ isOnline: navigator.onLine })
  updatePendingCount()

  // Load last sync time for this user
  if (isTursoConfigured() && navigator.onLine) {
    initTurso().then(async () => {
      const userId = await getUserId()
      if (userId) {
        const t = await getLastSyncTime(userId)
        if (t) updateStatus({ lastSyncedAt: t, tursoStatus: 'Connected' })
      }
    })
  }
}
