// Firebase configuration for Khata
// BACKUP ONLY: Firebase is the last-resort backup storage.
// Path is dynamic per user: users/{userId}/backups/latest

import { initializeApp } from 'firebase/app'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection
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
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    })
    isReady = true
    console.log('Firebase ready')
  } catch (err) {
    console.warn('Firebase init failed:', err.message)
  }
}

function whenReady() {
  return new Promise((resolve) => {
    if (isReady) return resolve()
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

// ──── Backup: Push full data dump to Firebase (per user) ────

export async function pushFullBackup(data, userId = 'default') {
  if (!isConfigured() || !db) return
  await whenReady()
  try {
    await setDoc(doc(db, `users/${userId}/backups`, 'latest'), {
      people: JSON.stringify(data.people || []),
      collections: JSON.stringify(data.collections || []),
      settings: JSON.stringify(data.settings || []),
      timestamp: Date.now(),
      exportedAt: data.exportedAt || new Date().toISOString(),
    })
    console.log(`Firebase backup pushed for user: ${userId}`)
  } catch (err) {
    console.warn('Firebase backup failed:', err.message)
  }
}

// ──── Restore: Pull data from Firebase (per user) ────

export async function restoreFromCloud(userId = 'default') {
  if (!isConfigured() || !db) return null
  await whenReady()
  try {
    // Try the new backup format first
    const backupDoc = await getDoc(doc(db, `users/${userId}/backups`, 'latest'))
    if (backupDoc.exists()) {
      const d = backupDoc.data()
      return {
        people: JSON.parse(d.people || '[]'),
        collections: JSON.parse(d.collections || '[]'),
      }
    }

    // Fallback to old format (legacy collections)
    const peopleSnap = await getDocs(collection(db, `users/${userId}/people`))
    const collectionsSnap = await getDocs(collection(db, `users/${userId}/collections`))

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
