// db.js — IndexedDB wrapper for Khata
// ponytail: raw IndexedDB, no idb library. It's 1 file.

const DB_NAME = 'khata-db';
const DB_VERSION = 1;

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('people')) {
        const people = db.createObjectStore('people', { keyPath: 'id', autoIncrement: true });
        people.createIndex('order', 'order', { unique: false });
      }
      if (!db.objectStoreNames.contains('collections')) {
        const collections = db.createObjectStore('collections', { keyPath: 'id', autoIncrement: true });
        collections.createIndex('personDate', ['personId', 'date'], { unique: true });
        collections.createIndex('date', 'date', { unique: false });
        collections.createIndex('personId', 'personId', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

// Generic helpers
async function getAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteRecord(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getById(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// People
export async function getAllPeople() {
  const people = await getAll('people');
  return people.sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function addPerson(name, mobile = '') {
  const people = await getAllPeople();
  const order = people.length;
  return put('people', { name, mobile, order, createdAt: Date.now() });
}

export async function updatePerson(person) {
  return put('people', person);
}

export async function deletePerson(id) {
  // Also delete all collections for this person
  const db = await openDB();
  const tx = db.transaction(['people', 'collections'], 'readwrite');
  const peopleStore = tx.objectStore('people');
  const collectionsStore = tx.objectStore('collections');
  const idx = collectionsStore.index('personId');

  peopleStore.delete(id);

  return new Promise((resolve, reject) => {
    const req = idx.openCursor(IDBKeyRange.only(id));
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Collections
export async function getCollectionsByDate(date) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('collections', 'readonly');
    const store = tx.objectStore('collections');
    const idx = store.index('date');
    const req = idx.getAll(date);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCollectionsByPersonAndMonth(personId, year, month) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('collections', 'readonly');
    const store = tx.objectStore('collections');
    const idx = store.index('personId');
    const req = idx.getAll(personId);
    req.onsuccess = () => {
      const all = req.result;
      const filtered = all.filter((c) => {
        const d = new Date(c.date);
        return d.getFullYear() === year && d.getMonth() === month;
      });
      resolve(filtered);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getCollectionsByMonth(year, month) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('collections', 'readonly');
    const store = tx.objectStore('collections');
    const req = store.getAll();
    req.onsuccess = () => {
      const filtered = req.result.filter((c) => {
        const d = new Date(c.date);
        return d.getFullYear() === year && d.getMonth() === month;
      });
      resolve(filtered);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveCollection(personId, date, amount) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('collections', 'readwrite');
    const store = tx.objectStore('collections');
    const idx = store.index('personDate');
    const req = idx.get([personId, date]);

    req.onsuccess = () => {
      const existing = req.result;
      if (existing) {
        existing.amount = amount;
        existing.timestamp = Date.now();
        store.put(existing);
      } else {
        store.add({ personId, date, amount, timestamp: Date.now() });
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Settings
export async function getSetting(key, defaultValue = null) {
  const record = await getById('settings', key);
  return record ? record.value : defaultValue;
}

export async function setSetting(key, value) {
  return put('settings', { key, value });
}

// Backup / Restore
export async function exportAllData() {
  const people = await getAll('people');
  const collections = await getAll('collections');
  const settings = await getAll('settings');
  return { people, collections, settings, exportedAt: new Date().toISOString(), version: 1 };
}

export async function importAllData(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['people', 'collections', 'settings'], 'readwrite');
    const pStore = tx.objectStore('people');
    const cStore = tx.objectStore('collections');
    const sStore = tx.objectStore('settings');

    // Clear existing
    pStore.clear();
    cStore.clear();
    sStore.clear();

    // Import
    (data.people || []).forEach((p) => pStore.add(p));
    (data.collections || []).forEach((c) => cStore.add(c));
    (data.settings || []).forEach((s) => sStore.add(s));

    tx.oncomplete = () => {
      dbInstance = null; // Reset connection
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllData() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['people', 'collections', 'settings'], 'readwrite');
    tx.objectStore('people').clear();
    tx.objectStore('collections').clear();
    tx.objectStore('settings').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
