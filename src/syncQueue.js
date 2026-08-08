// syncQueue.js — Persistent sync queue for Khata
// Queues all write operations in IndexedDB and replays to Turso when online.
// Firebase is used only for periodic backup.

import {
  initTurso,
  isTursoConfigured,
  getTursoStatus,
  pushPeople,
  pushCollection,
  pushDeletePerson,
  pushClearAll,
  pushFullData,
  setSyncTimestamp,
  getLastSyncTime,
  pullAllData,
} from './turso'

const QUEUE_STORE = 'sync_queue'
let db = null
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

// ──── Queue DB Access ────
// Uses the same IndexedDB instance as the main db.js (via shared DB_NAME)
// The sync_queue store is created in db.js's onupgradeneeded handler

const DB_NAME = 'khata-db'
const DB_VERSION = 2

function openQueueDB() {
  if (db) return Promise.resolve(db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const database = e.target.result
      if (!database.objectStoreNames.contains(QUEUE_STORE)) {
        const store = database.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
    req.onsuccess = (e) => {
      db = e.target.result
      resolve(db)
    }
    req.onerror = (e) => reject(e.target.error)
  })
}

// ──── Enqueue ────

export async function enqueue(action, payload) {
  const database = await openQueueDB()
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
      // Try to process immediately if online
      if (navigator.onLine) processQueue()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

// ──── Get pending count ────

async function updatePendingCount() {
  try {
    const database = await openQueueDB()
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

  isProcessing = true
  updateStatus({ isSyncing: true })

  try {
    // Ensure Turso is initialized
    const connected = await initTurso()
    if (!connected) {
      updateStatus({ isSyncing: false, tursoStatus: getTursoStatus().status, error: getTursoStatus().error })
      isProcessing = false
      return
    }

    updateStatus({ tursoStatus: 'Connected' })

    const database = await openQueueDB()
    const items = await getPendingItems(database)

    for (const item of items) {
      let success = false

      try {
        switch (item.action) {
          case 'syncPeople':
            success = await pushPeople(item.payload.people)
            break
          case 'syncCollection':
            success = await pushCollection(item.payload.personId, item.payload.date, item.payload.amount)
            break
          case 'deletePerson':
            success = await pushDeletePerson(item.payload.id)
            break
          case 'clearAll':
            success = await pushClearAll()
            break
          case 'fullSync':
            success = await pushFullData(item.payload)
            break
          default:
            console.warn('Unknown sync action:', item.action)
            success = true // Mark unknown actions as done to not block queue
        }
      } catch (err) {
        console.warn('Sync action failed:', item.action, err.message)
      }

      if (success) {
        await markDone(database, item.id)
      } else {
        await markRetry(database, item.id, item.retryCount)
        // Stop processing on failure — will retry later
        break
      }
    }

    await setSyncTimestamp()
    const lastSync = await getLastSyncTime()
    updateStatus({
      isSyncing: false,
      lastSyncedAt: lastSync,
      tursoStatus: 'Connected',
      error: null,
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
        // After 5 retries, mark as failed
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

// ──── Cleanup old done items (keep last 50) ────

async function cleanupDoneItems() {
  try {
    const database = await openQueueDB()
    const tx = database.transaction(QUEUE_STORE, 'readwrite')
    const store = tx.objectStore(QUEUE_STORE)
    const idx = store.index('status')
    const req = idx.getAll('done')
    req.onsuccess = () => {
      const done = req.result.sort((a, b) => b.completedAt - a.completedAt)
      // Keep last 50, delete the rest
      done.slice(50).forEach((item) => store.delete(item.id))
    }
  } catch {
  }
}

// ──── Cloud restore (Turso) ────

export async function tryTursoRestore() {
  if (!isTursoConfigured() || !navigator.onLine) return null

  try {
    const connected = await initTurso()
    if (!connected) return null

    const data = await pullAllData()
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
    // Process queue when we come back online
    setTimeout(() => processQueue(), 1000)
  })

  window.addEventListener('offline', () => {
    updateStatus({ isOnline: false })
  })

  // Update initial status
  updateStatus({ isOnline: navigator.onLine })
  updatePendingCount()

  // Try to process queue on init
  if (navigator.onLine) {
    setTimeout(() => processQueue(), 2000)
  }

  // Periodic queue processing (every 60s when online)
  setInterval(() => {
    if (navigator.onLine) {
      processQueue()
      cleanupDoneItems()
    }
  }, 60000)

  // Load last sync time
  if (isTursoConfigured() && navigator.onLine) {
    initTurso().then(() => {
      getLastSyncTime().then((t) => {
        if (t) updateStatus({ lastSyncedAt: t, tursoStatus: 'Connected' })
      })
    })
  }
}
