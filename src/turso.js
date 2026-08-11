// turso.js — Turso DB client for Khata
// Primary cloud sync via libSQL HTTP API
// Works in browser via @libsql/client/web

import { createClient } from '@libsql/client/web'

// ──── Configuration ────
// Set your Turso database URL and auth token here
// Create a free database at https://turso.tech
const TURSO_CONFIG = {
  url: 'libsql://khata-apk-dta-khatabook.aws-ap-south-1.turso.io',       // e.g. 'libsql://your-db-name-your-org.turso.io'
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYxODE0MTEsImlkIjoiMDE5ZmUwYjEtYWMwMS03NDRhLWIwM2ItNzE3YjJlNTZkOGQxIiwia2lkIjoiSGk4STlzcEtFZ0xfTnFFdTg2RGF6UHhIS1hVVjFnRVhGUFNvMGNBaVlFUSIsInJpZCI6IjIxZGZiMjg1LTY0N2ItNDg0MC05MzI3LTEyMzlmMzc2MzMyMiJ9.M8AeFudukN5Et2xYIQbVOGT-Zf65dn8N-9_6p4i5z9YNd37byOfZAIhPc7mqBH-gvw-iRHBLVSn4JhvgiLJMAg', // e.g. 'eyJhbGciOiJFZDI1NTE5...'
}

let client = null
let isConnected = false
let connectionError = null

export function isTursoConfigured() {
  return !!(TURSO_CONFIG.url && TURSO_CONFIG.authToken)
}

export function getTursoStatus() {
  if (!isTursoConfigured()) return { configured: false, status: 'Not configured', error: null }
  if (connectionError) return { configured: true, status: 'Error', error: connectionError }
  if (!isConnected) return { configured: true, status: 'Connecting...', error: null }
  return { configured: true, status: 'Connected', error: null }
}

// ──── Initialize ────

export async function initTurso() {
  if (!isTursoConfigured()) {
    console.log('Turso not configured — cloud sync disabled')
    return false
  }

  try {
    client = createClient({
      url: TURSO_CONFIG.url,
      authToken: TURSO_CONFIG.authToken,
    })

    // Create tables if they don't exist
    await client.batch([
      `CREATE TABLE IF NOT EXISTS people (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        mobile TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY,
        person_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        amount INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        UNIQUE(person_id, date)
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      )`,
    ])

    isConnected = true
    connectionError = null
    console.log('Turso connected and tables ready')
    return true
  } catch (err) {
    connectionError = err.message
    isConnected = false
    console.warn('Turso init failed:', err.message)
    return false
  }
}

// ──── Sync: Push local data to Turso ────

export async function pushPeople(people) {
  if (!client || !isConnected) return false
  try {
    // Upsert all people
    const stmts = people.map((p) => ({
      sql: `INSERT OR REPLACE INTO people (id, name, mobile, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [p.id, p.name, p.mobile || '', p.order || 0, p.createdAt || Date.now(), Date.now()],
    }))
    if (stmts.length > 0) await client.batch(stmts)
    return true
  } catch (err) {
    console.warn('Turso pushPeople failed:', err.message)
    connectionError = err.message
    return false
  }
}

export async function pushCollection(personId, date, amount) {
  if (!client || !isConnected) return false
  try {
    await client.execute({
      sql: `INSERT OR REPLACE INTO collections (person_id, date, amount, timestamp)
            VALUES (?, ?, ?, ?)`,
      args: [personId, date, amount, Date.now()],
    })
    return true
  } catch (err) {
    console.warn('Turso pushCollection failed:', err.message)
    connectionError = err.message
    return false
  }
}

export async function pushDeleteCollection(personId, date) {
  if (!client || !isConnected) return false
  try {
    await client.execute({
      sql: 'DELETE FROM collections WHERE person_id = ? AND date = ?',
      args: [personId, date],
    })
    return true
  } catch (err) {
    console.warn('Turso collection delete failed:', err.message)
    connectionError = err.message
    return false
  }
}

export async function pushDeletePerson(id) {
  if (!client || !isConnected) return false
  try {
    await client.batch([
      { sql: 'DELETE FROM people WHERE id = ?', args: [id] },
      { sql: 'DELETE FROM collections WHERE person_id = ?', args: [id] },
    ])
    return true
  } catch (err) {
    console.warn('Turso pushDeletePerson failed:', err.message)
    connectionError = err.message
    return false
  }
}

export async function pushClearAll() {
  if (!client || !isConnected) return false
  try {
    await client.batch([
      'DELETE FROM people',
      'DELETE FROM collections',
      'DELETE FROM settings',
    ])
    return true
  } catch (err) {
    console.warn('Turso pushClearAll failed:', err.message)
    connectionError = err.message
    return false
  }
}

// ──── Sync: Pull data from Turso ────

export async function pullAllData() {
  if (!client || !isConnected) return null
  try {
    const [peopleResult, collectionsResult] = await client.batch([
      'SELECT * FROM people ORDER BY sort_order ASC',
      'SELECT * FROM collections',
    ])

    const people = peopleResult.rows.map((r) => ({
      id: r.id,
      name: r.name,
      mobile: r.mobile || '',
      order: r.sort_order || 0,
      createdAt: r.created_at,
    }))

    const collections = collectionsResult.rows.map((r) => ({
      personId: r.person_id,
      date: r.date,
      amount: r.amount,
      timestamp: r.timestamp,
    }))

    return { people, collections }
  } catch (err) {
    console.warn('Turso pullAllData failed:', err.message)
    connectionError = err.message
    return null
  }
}

// ──── Full push (for import/restore) ────

export async function pushFullData(data) {
  if (!client || !isConnected) return false
  try {
    const stmts = [
      'DELETE FROM people',
      'DELETE FROM collections',
    ]

    for (const p of (data.people || [])) {
      stmts.push({
        sql: `INSERT INTO people (id, name, mobile, sort_order, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [p.id, p.name, p.mobile || '', p.order || 0, p.createdAt || Date.now(), Date.now()],
      })
    }

    for (const c of (data.collections || [])) {
      stmts.push({
        sql: `INSERT INTO collections (person_id, date, amount, timestamp)
              VALUES (?, ?, ?, ?)`,
        args: [c.personId, c.date, c.amount, c.timestamp || Date.now()],
      })
    }

    await client.batch(stmts)
    return true
  } catch (err) {
    console.warn('Turso pushFullData failed:', err.message)
    connectionError = err.message
    return false
  }
}

// ──── Update sync timestamp ────

export async function setSyncTimestamp() {
  if (!client || !isConnected) return
  try {
    await client.execute({
      sql: `INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_sync', ?)`,
      args: [new Date().toISOString()],
    })
  } catch {
  }
}

export async function getLastSyncTime() {
  if (!client || !isConnected) return null
  try {
    const result = await client.execute({
      sql: `SELECT value FROM sync_meta WHERE key = 'last_sync'`,
      args: [],
    })
    return result.rows.length > 0 ? result.rows[0].value : null
  } catch {
    return null
  }
}
