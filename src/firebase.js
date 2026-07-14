// Firebase configuration for Khata
// Cloud sync: mirrors IndexedDB data to Firestore for backup/recovery
import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  doc,
  setDoc,
  getDocs,
  collection,
  writeBatch,
  deleteDoc,
  enableIndexedDbPersistence
} from 'firebase/firestore'
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth'

// PASTE YOUR FIREBASE CONFIG HERE after creating a project at:
// https://console.firebase.google.com
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
let userId = null
let isReady = false
let readyCallbacks = []

function isConfigured() {
  return firebaseConfig.apiKey && firebaseConfig.projectId
}

// Initialize Firebase
export function initFirebase() {
  if (!isConfigured()) {
    console.log('Firebase not configured — cloud sync disabled')
    return
  }

  try {
    app = initializeApp(firebaseConfig)
    db = getFirestore(app)

    // Enable offline persistence
    enableIndexedDbPersistence(db).catch(() => {})

    // Anonymous auth — no login needed
    const auth = getAuth(app)
    signInAnonymously(auth).catch((err) => {
      console.warn('Firebase auth failed:', err.message)
    })

    onAuthStateChanged(auth, (user) => {
      if (user) {
        userId = user.uid
        isReady = true
        readyCallbacks.forEach((cb) => cb())
        readyCallbacks = []
      }
    })
  } catch (err) {
    console.warn('Firebase init failed:', err.message)
  }
}

function whenReady() {
  return new Promise((resolve) => {
    if (isReady) return resolve()
    readyCallbacks.push(resolve)
    // Timeout after 5s
    setTimeout(resolve, 5000)
  })
}

// Cloud sync functions

export async function syncPeopleToCloud(people) {
  if (!isConfigured() || !db) return
  await whenReady()
  try {
    const batch = writeBatch(db)
    people.forEach((p) => {
      const ref = doc(db, `users/${userId}/people`, String(p.id))
      batch.set(ref, p)
    })
    await batch.commit()
  } catch (err) {
    console.warn('Cloud sync (people) failed:', err.message)
  }
}

export async function syncCollectionToCloud(personId, date, amount) {
  if (!isConfigured() || !db) return
  await whenReady()
  try {
    const key = `${personId}_${date}`
    await setDoc(doc(db, `users/${userId}/collections`, key), {
      personId,
      date,
      amount,
      timestamp: Date.now()
    })
  } catch (err) {
    console.warn('Cloud sync (collection) failed:', err.message)
  }
}

export async function deletePersonFromCloud(id) {
  if (!isConfigured() || !db) return
  await whenReady()
  try {
    await deleteDoc(doc(db, `users/${userId}/people`, String(id)))
    // Delete person's collections
    const snap = await getDocs(collection(db, `users/${userId}/collections`))
    const batch = writeBatch(db)
    snap.forEach((d) => {
      if (d.data().personId === id) batch.delete(d.ref)
    })
    await batch.commit()
  } catch (err) {
    console.warn('Cloud delete failed:', err.message)
  }
}

export async function restoreFromCloud() {
  if (!isConfigured() || !db) return null
  await whenReady()
  try {
    const peopleSnap = await getDocs(collection(db, `users/${userId}/people`))
    const collectionsSnap = await getDocs(collection(db, `users/${userId}/collections`))

    if (peopleSnap.empty) return null // No cloud data

    const people = []
    peopleSnap.forEach((d) => people.push(d.data()))

    const collections = []
    collectionsSnap.forEach((d) => collections.push(d.data()))

    return { people, collections }
  } catch (err) {
    console.warn('Cloud restore failed:', err.message)
    return null
  }
}

export async function clearCloudData() {
  if (!isConfigured() || !db) return
  await whenReady()
  try {
    const peopleSnap = await getDocs(collection(db, `users/${userId}/people`))
    const collectionsSnap = await getDocs(collection(db, `users/${userId}/collections`))
    const batch = writeBatch(db)
    peopleSnap.forEach((d) => batch.delete(d.ref))
    collectionsSnap.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  } catch (err) {
    console.warn('Cloud clear failed:', err.message)
  }
}

export function getCloudStatus() {
  if (!isConfigured()) return { configured: false, status: 'Not configured' }
  if (!isReady) return { configured: true, status: 'Connecting...' }
  return { configured: true, status: 'Connected', userId }
}
