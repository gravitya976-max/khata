// Firebase configuration for Khata
// BACKUP ONLY: Firebase is the last-resort backup storage.
// Primary sync goes through Turso DB (see turso.js + syncQueue.js).
// Firebase receives a periodic full JSON dump for disaster recovery.

import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  enableIndexedDbPersistence
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyA66RxabVxDBB5E3i9-En1w6htzANAXFtk',
  authDomain: 'khata-booo.firebaseapp.com',
  projectId: 'khata-booo',
  storageBucket: 'khata-booo.firebasestorage.app',
  messagingSenderId: '186073368181',
  appId: '1:186073368181:web:17dfceedd7a4ef10bf1a3c'
}

let app = null
let db = null
const USER_KEY = 'khata-default'  // Fixed key — all installs share the same backup
let isReady = false

function isConfigured() {
  return firebaseConfig.apiKey && firebaseConfig.projectId
}

// Initialize Firebase
export function initFirebase() {
  if (!isConfigured()) {
    console.log('Firebase not configured — backup disabled')
    return
  }

  try {
    app = initializeApp(firebaseConfig)
    db = getFirestore(app)

    // Enable offline persistence
    enableIndexedDbPersistence(db).catch(() => {})

    isReady = true
    console.log('Firebase ready (fixed key: ' + USER_KEY + ')')
  } catch (err) {
    console.warn('Firebase init failed:', err.message)
  }
}

function whenReady() {
  return new Promise((resolve) => {
    if (isReady) return resolve()
    // Retry for up to 3s
    let elapsed = 0
    const interval = setInterval(() => {
      elapsed += 200
      if (isReady || elapsed >= 3000) {
        clearInterval(interval)
        resolve()
      }
    }, 200)
  })
}

// ──── Backup: Push full data dump to Firebase ────

export async function pushFullBackup(data) {
  if (!isConfigured() || !db) return
  await whenReady()
  try {
    await setDoc(doc(db, `users/${USER_KEY}/backups`, 'latest'), {
      people: JSON.stringify(data.people || []),
      collections: JSON.stringify(data.collections || []),
      settings: JSON.stringify(data.settings || []),
      timestamp: Date.now(),
      exportedAt: data.exportedAt || new Date().toISOString(),
    })
    console.log('Firebase backup pushed')
  } catch (err) {
    console.warn('Firebase backup failed:', err.message)
  }
}

// ──── Restore: Pull data from Firebase (last resort) ────

export async function restoreFromCloud() {
  if (!isConfigured() || !db) return null
  await whenReady()
  try {
    // Try the new backup format first
    const backupDoc = await getDoc(doc(db, `users/${USER_KEY}/backups`, 'latest'))
    if (backupDoc.exists()) {
      const d = backupDoc.data()
      return {
        people: JSON.parse(d.people || '[]'),
        collections: JSON.parse(d.collections || '[]'),
      }
    }

    // Fallback to old format (legacy collections)
    const peopleSnap = await getDocs(collection(db, `users/${USER_KEY}/people`))
    const collectionsSnap = await getDocs(collection(db, `users/${USER_KEY}/collections`))

    if (peopleSnap.empty) return null

    const people = []
    peopleSnap.forEach((d) => people.push(d.data()))

    const collections = []
    collectionsSnap.forEach((d) => collections.push(d.data()))

    return { people, collections }
  } catch (err) {
    console.warn('Firebase restore failed:', err.message)
    return null
  }
}

// ──── Status ────

export function getFirebaseStatus() {
  if (!isConfigured()) return { configured: false, status: 'Not configured' }
  if (!isReady) return { configured: true, status: 'Connecting...' }
  return { configured: true, status: 'Connected' }
}
