// db.js — IndexedDB wrapper for Khata
// Local-first: all reads/writes go to IndexedDB (zero network needed)
// Sync: writes are queued and pushed to Turso when online
// Backup: Firebase receives periodic full backup (last-resort only)

import { enqueue, tryTursoRestore } from './syncQueue'
import { pushFullBackup, restoreFromCloud } from './firebase'

const DB_NAME = 'khata-db'
const DB_VERSION = 2

let dbInstance = null

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('people')) {
        const people = db.createObjectStore('people', { keyPath: 'id', autoIncrement: true })
        people.createIndex('order', 'order', { unique: false })
      }
      if (!db.objectStoreNames.contains('collections')) {
        const collections = db.createObjectStore('collections', { keyPath: 'id', autoIncrement: true })
        collections.createIndex('personDate', ['personId', 'date'], { unique: true })
        collections.createIndex('date', 'date', { unique: false })
        collections.createIndex('personId', 'personId', { unique: false })
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        const sq = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true })
        sq.createIndex('status', 'status', { unique: false })
        sq.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
    req.onsuccess = (e) => {
      dbInstance = e.target.result
      resolve(dbInstance)
    }
    req.onerror = (e) => reject(e.target.error)
  })
}

// Generic helpers
async function getAll(storeName) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function put(storeName, data) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const req = store.put(data)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getById(storeName, id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.get(id)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// People
export async function getAllPeople() {
  const people = await getAll('people')
  return people.sort((a, b) => (a.order || 0) - (b.order || 0))
}

export async function addPerson(name, mobile = '') {
  const people = await getAllPeople()
  const order = people.length
  const id = await put('people', { name, mobile, order, createdAt: Date.now() })

  // Queue sync to Turso (background, non-blocking)
  const allPeople = await getAllPeople()
  enqueue('syncPeople', { people: allPeople })
  scheduleFirebaseBackup()

  return id
}

export async function updatePerson(person) {
  const result = await put('people', person)

  // Queue sync to Turso
  const allPeople = await getAllPeople()
  enqueue('syncPeople', { people: allPeople })
  scheduleFirebaseBackup()

  return result
}

export async function deletePerson(id) {
  // Also delete all collections for this person
  const db = await openDB()
  const tx = db.transaction(['people', 'collections'], 'readwrite')
  const peopleStore = tx.objectStore('people')
  const collectionsStore = tx.objectStore('collections')
  const idx = collectionsStore.index('personId')

  peopleStore.delete(id)

  const result = await new Promise((resolve, reject) => {
    const req = idx.openCursor(IDBKeyRange.only(id))
    req.onsuccess = (e) => {
      const cursor = e.target.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  // Queue sync to Turso
  enqueue('deletePerson', { id })
  scheduleFirebaseBackup()

  return result
}

// Collections
export async function getCollectionsByDate(date) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('collections', 'readonly')
    const store = tx.objectStore('collections')
    const idx = store.index('date')
    const req = idx.getAll(date)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getCollectionsByPersonAndMonth(personId, year, month) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('collections', 'readonly')
    const store = tx.objectStore('collections')
    const idx = store.index('personId')
    const req = idx.getAll(personId)
    req.onsuccess = () => {
      const all = req.result
      const filtered = all.filter((c) => {
        const d = new Date(c.date)
        return d.getFullYear() === year && d.getMonth() === month
      })
      resolve(filtered)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function getCollectionsByMonth(year, month) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('collections', 'readonly')
    const store = tx.objectStore('collections')
    const req = store.getAll()
    req.onsuccess = () => {
      const filtered = req.result.filter((c) => {
        const d = new Date(c.date)
        return d.getFullYear() === year && d.getMonth() === month
      })
      resolve(filtered)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function saveCollection(personId, date, amount) {
  const db = await openDB()
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction('collections', 'readwrite')
    const store = tx.objectStore('collections')
    const idx = store.index('personDate')
    const req = idx.get([personId, date])

    req.onsuccess = () => {
      const existing = req.result
      if (existing) {
        existing.amount = amount
        existing.timestamp = Date.now()
        store.put(existing)
      } else {
        store.add({ personId, date, amount, timestamp: Date.now() })
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  // Queue sync to Turso
  enqueue('syncCollection', { personId, date, amount })
  scheduleFirebaseBackup()

  return result
}

export async function deleteCollection(personId, date) {
  const db = await openDB()
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction('collections', 'readwrite')
    const store = tx.objectStore('collections')
    const idx = store.index('personDate')
    const req = idx.get([personId, date])

    req.onsuccess = () => {
      if (req.result) store.delete(req.result.id)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  enqueue('deleteCollection', { personId, date })
  scheduleFirebaseBackup()

  return result
}

// Settings
export async function getSetting(key, defaultValue = null) {
  const record = await getById('settings', key)
  return record ? record.value : defaultValue
}

export async function setSetting(key, value) {
  return put('settings', { key, value })
}

// Backup / Restore
export async function exportAllData() {
  const people = await getAll('people')
  const collections = await getAll('collections')
  const settings = await getAll('settings')
  return { people, collections, settings, exportedAt: new Date().toISOString(), version: 1 }
}

export async function importAllData(data) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['people', 'collections', 'settings'], 'readwrite')
    const pStore = tx.objectStore('people')
    const cStore = tx.objectStore('collections')
    const sStore = tx.objectStore('settings')

    // Clear existing
    pStore.clear()
    cStore.clear()
    sStore.clear()

    // Import
    ;(data.people || []).forEach((p) => pStore.add(p))
    ;(data.collections || []).forEach((c) => cStore.add(c))
    ;(data.settings || []).forEach((s) => sStore.add(s))

    tx.oncomplete = () => {
      dbInstance = null // Reset connection

      // Queue full sync to Turso
      enqueue('fullSync', { people: data.people || [], collections: data.collections || [] })

      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearAllData() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['people', 'collections', 'settings'], 'readwrite')
    tx.objectStore('people').clear()
    tx.objectStore('collections').clear()
    tx.objectStore('settings').clear()
    tx.oncomplete = () => {
      // Queue clear to Turso
      enqueue('clearAll', {})
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

// Cloud recovery — tries Turso first, then Firebase
export async function tryCloudRestore() {
  const people = await getAll('people')
  if (people.length > 0) return false // Local data exists, no need to restore

  // Try Turso first (primary cloud)
  const tursoData = await tryTursoRestore()
  if (tursoData && tursoData.people && tursoData.people.length > 0) {
    await importAllData(tursoData)
    return true
  }

  // Fallback to Firebase (backup)
  const firebaseData = await restoreFromCloud()
  if (firebaseData && firebaseData.people && firebaseData.people.length > 0) {
    await importAllData(firebaseData)
    return true
  }

  return false
}

// ──── Auto-Backup ────
// Local snapshot to IndexedDB every 1h, Firebase push after every change (debounced)

const BACKUP_KEY = 'auto_backups'
const BACKUP_INTERVAL = 60 * 60 * 1000 // 1 hour (local snapshots)
const MAX_BACKUPS = 3

// Debounced Firebase push — fires 10s after last data change
let firebasePushTimer = null
export function scheduleFirebaseBackup() {
  if (firebasePushTimer) clearTimeout(firebasePushTimer)
  firebasePushTimer = setTimeout(async () => {
    try {
      const data = await exportAllData()
      pushFullBackup(data)
      console.log('Firebase backup pushed (debounced)')
    } catch (err) {
      console.warn('Firebase debounced backup failed:', err.message)
    }
  }, 10000) // 10 second debounce
}

export async function runAutoBackup() {
  try {
    const lastRun = await getSetting('auto_backup_last_run', 0)
    const now = Date.now()
    if (now - lastRun < BACKUP_INTERVAL) return false // Too soon

    const data = await exportAllData()
    const existing = await getSetting(BACKUP_KEY, [])

    // Add new backup
    existing.unshift({
      data,
      createdAt: new Date().toISOString(),
      timestamp: now,
    })

    // Keep only last MAX_BACKUPS
    while (existing.length > MAX_BACKUPS) existing.pop()

    await setSetting(BACKUP_KEY, existing)
    await setSetting('auto_backup_last_run', now)

    // Also push to Firebase as backup (non-blocking)
    pushFullBackup(data)

    return true
  } catch (err) {
    console.warn('Auto-backup failed:', err.message)
    return false
  }
}

export async function getAutoBackups() {
  return await getSetting(BACKUP_KEY, [])
}

export async function restoreFromAutoBackup(index) {
  const backups = await getAutoBackups()
  if (index >= 0 && index < backups.length) {
    await importAllData(backups[index].data)
    return true
  }
  return false
}
