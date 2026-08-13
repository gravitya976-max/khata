// db.js — IndexedDB wrapper for Khata
// Local-first: all reads/writes go to IndexedDB (zero network needed)
// Sync: writes are queued and pushed to Turso when online (per user)
// Backup: Firebase receives periodic full backup (per user)

import { enqueue, tryTursoRestore } from './syncQueue'
import { pushFullBackup, restoreFromCloud } from './firebase'

const DB_NAME = 'khata-db'
const DB_VERSION = 2

let dbInstance = null

// ──── User ID management ────
// Each user has a unique Khata ID that namespaces their data in Turso & Firebase.
// Stored locally in IndexedDB settings. Same ID across devices = shared data.

let cachedUserId = null

export async function getUserId() {
  if (cachedUserId) return cachedUserId
  const id = await getSetting('khata_user_id', null)
  cachedUserId = id
  return id
}

export async function setUserIdValue(id) {
  cachedUserId = id
  return setSetting('khata_user_id', id)
}

// Exported so syncQueue.js can share the same DB connection
export function openDB() {
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
  const newPerson = { id: Date.now(), name, mobile, order, createdAt: Date.now() }
  const id = await put('people', newPerson)

  const allPeople = await getAllPeople()
  enqueue('syncPeople', { people: allPeople })
  scheduleFirebaseBackup()

  return id
}

export async function updatePerson(person) {
  const result = await put('people', person)

  const allPeople = await getAllPeople()
  enqueue('syncPeople', { people: allPeople })
  scheduleFirebaseBackup()

  return result
}

export async function deletePerson(id) {
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

  enqueue('syncCollection', { personId, date, amount })
  scheduleFirebaseBackup()

  return result
}

// Delete a single collection entry (for clearing wrong amounts)
export async function deleteCollection(personId, date) {
  const db = await openDB()
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction('collections', 'readwrite')
    const store = tx.objectStore('collections')
    const idx = store.index('personDate')
    const req = idx.get([personId, date])

    req.onsuccess = () => {
      const existing = req.result
      if (existing) {
        store.delete(existing.id)
      }
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

    pStore.clear()
    cStore.clear()
    sStore.clear()

    ;(data.people || []).forEach((p) => pStore.put(p))
    ;(data.collections || []).forEach((c) => cStore.put(c))
    ;(data.settings || []).forEach((s) => sStore.put(s))

    tx.oncomplete = () => {
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
      enqueue('clearAll', {})
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

// ── One-time migration: reassign sequential IDs → timestamps ──
export async function migrateIdsToTimestamp() {
  const done = await getSetting('ids_migrated_v1', false)
  if (done) return

  const db = await openDB()
  const people = await getAllPeople()
  const sequential = people.filter((p) => p.id < 1_000_000_000_000)
  if (sequential.length === 0) {
    await setSetting('ids_migrated_v1', true)
    return
  }

  const base = Date.now()
  const randomBytes = new Uint16Array(sequential.length)
  crypto.getRandomValues(randomBytes)
  const idMap = {}
  sequential.forEach((p, i) => {
    idMap[p.id] = base + (i * 1000) + randomBytes[i]
  })

  await new Promise((resolve, reject) => {
    const tx = db.transaction(['people', 'collections'], 'readwrite')
    const pStore = tx.objectStore('people')
    const cStore = tx.objectStore('collections')

    for (const p of sequential) {
      pStore.delete(p.id)
      pStore.put({ ...p, id: idMap[p.id] })
    }

    const req = cStore.getAll()
    req.onsuccess = () => {
      for (const c of req.result) {
        if (idMap[c.personId]) {
          cStore.delete(c.id)
          cStore.put({ ...c, personId: idMap[c.personId] })
        }
      }
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  await setSetting('ids_migrated_v1', true)
}

// Cloud sync — smart bidirectional (per user)
export async function tryCloudRestore() {
  const userId = await getUserId()
  if (!userId) return false

  const tursoData = await tryTursoRestore(userId)
  const localPeople = await getAll('people')
  const localHasData = localPeople.length > 0

  if (!tursoData) {
    if (localHasData) return false
    try {
      const firebaseData = await restoreFromCloud(userId)
      if (firebaseData?.people?.length > 0) {
        await importAllData(firebaseData)
        return true
      }
    } catch (err) {
      console.warn('Firebase restore failed:', err.message)
    }
    return false
  }

  const tursoHasData = tursoData.people.length > 0

  if (tursoHasData && !localHasData) {
    await importAllData(tursoData)
    return true
  }

  if (tursoHasData && localHasData) {
    await mergeFromTurso()
    const localCollections = await getAll('collections')
    enqueue('fullSync', { people: localPeople, collections: localCollections })
    return true
  }

  if (!tursoHasData && localHasData) {
    enqueue('fullSync', { people: localPeople, collections: await getAll('collections') })
    return false
  }

  return false
}

// Merge latest Turso data into local WITHOUT clearing
export async function mergeFromTurso() {
  const userId = await getUserId()
  if (!userId) return false

  const tursoData = await tryTursoRestore(userId)
  if (!tursoData) return false

  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['people', 'collections'], 'readwrite')
    const pStore = tx.objectStore('people')
    const cStore = tx.objectStore('collections')
    const personDateIdx = cStore.index('personDate')

    for (const p of (tursoData.people || [])) {
      pStore.put({ id: p.id, name: p.name, mobile: p.mobile || '', order: p.order || 0, createdAt: p.createdAt || Date.now() })
    }

    let pending = 0
    let completed = 0

    for (const c of (tursoData.collections || [])) {
      pending++
      const lookupReq = personDateIdx.get([c.personId, c.date])
      lookupReq.onsuccess = () => {
        const existing = lookupReq.result
        if (existing) {
          if (!existing.timestamp || (c.timestamp && c.timestamp >= existing.timestamp)) {
            existing.amount = c.amount
            existing.timestamp = c.timestamp || Date.now()
            cStore.put(existing)
          }
        } else {
          cStore.add({ personId: c.personId, date: c.date, amount: c.amount, timestamp: c.timestamp || Date.now() })
        }
        completed++
      }
    }

    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
  })
}

// ──── Auto-Backup (per user) ────

const BACKUP_KEY = 'auto_backups'
const BACKUP_INTERVAL = 60 * 60 * 1000
const MAX_BACKUPS = 3

let firebasePushTimer = null
export function scheduleFirebaseBackup() {
  if (firebasePushTimer) clearTimeout(firebasePushTimer)
  firebasePushTimer = setTimeout(async () => {
    try {
      const userId = await getUserId()
      const data = await exportAllData()
      pushFullBackup(data, userId || 'default')
      console.log('Firebase backup pushed (debounced)')
    } catch (err) {
      console.warn('Firebase debounced backup failed:', err.message)
    }
  }, 10000)
}

export async function runAutoBackup() {
  try {
    const lastRun = await getSetting('auto_backup_last_run', 0)
    const now = Date.now()
    if (now - lastRun < BACKUP_INTERVAL) return false

    const userId = await getUserId()
    const data = await exportAllData()
    const existing = await getSetting(BACKUP_KEY, [])

    existing.unshift({
      data,
      createdAt: new Date().toISOString(),
      timestamp: now,
    })

    while (existing.length > MAX_BACKUPS) existing.pop()

    await setSetting(BACKUP_KEY, existing)
    await setSetting('auto_backup_last_run', now)

    pushFullBackup(data, userId || 'default')

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
