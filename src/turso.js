// turso.js — Turso DB client for Khata
// Primary cloud sync via libSQL HTTP API
// All data is namespaced by user_id for per-user isolation

import { createClient } from '@libsql/client/web'

// ──── Configuration ────
const TURSO_CONFIG = {
  url: 'libsql://khata-apk-dta-khatabook.aws-ap-south-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYxODE0MTEsImlkIjoiMDE5ZmUwYjEtYWMwMS03NDRhLWIwM2ItNzE3YjJlNTZkOGQxIiwia2lkIjoiSGk4STlzcEtFZ0xfTnFFdTg2RGF6UHhIS1hVVjFnRVhGUFNvMGNBaVlFUSIsInJpZCI6IjIxZGZiMjg1LTY0N2ItNDg0MC05MzI3LTEyMzlmMzc2MzMyMiJ9.M8AeFudukN5Et2xYIQbVOGT-Zf65dn8N-9_6p4i5z9YNd37byOfZAIhPc7mqBH-gvw-iRHBLVSn4JhvgiLJMAg',
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

  // Guard: don't recreate if already connected
  if (client && isConnected) return true

  try {
    client = createClient({
      url: TURSO_CONFIG.url,
      authToken: TURSO_CONFIG.authToken,
    })

    // Create tables with user_id for per-user isolation
    await client.batch([
      `CREATE TABLE IF NOT EXISTS people (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        mobile TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        user_id TEXT NOT NULL DEFAULT 'default'
      )`,
      `CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY,
        person_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        amount INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        user_id TEXT NOT NULL DEFAULT 'default',
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

    // Migration: add user_id column to existing tables that don't have it yet
    try {
      await client.batch([
        `ALTER TABLE people ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'`,
        `ALTER TABLE collections ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'`,
      ])
      console.log('Turso: migrated tables with user_id column')
    } catch {
      // Column already exists — ignore
    }

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

// ──── Migrate old 'default' data to a new user ID ────

export async function migrateUserData(newUserId) {
  if (!client || !isConnected) return false
  try {
    await client.batch([
      { sql: `UPDATE people SET user_id = ? WHERE user_id = 'default'`, args: [newUserId] },
      { sql: `UPDATE collections SET user_id = ? WHERE user_id = 'default'`, args: [newUserId] },
    ])
    console.log(`Turso: migrated default data to user '${newUserId}'`)
    return true
  } catch (err) {
    console.warn('Turso migrateUserData failed:', err.message)
    return false
  }
}

// ──── Sync: Push local data to Turso ────

export async function pushPeople(people, userId) {
  if (!client || !isConnected) return false
  try {
    const stmts = people.map((p) => ({
      sql: `INSERT OR REPLACE INTO people (id, name, mobile, sort_order, created_at, updated_at, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [p.id, p.name, p.mobile || '', p.order || 0, p.createdAt || Date.now(), Date.now(), userId],
    }))
    if (stmts.length > 0) await client.batch(stmts)
    return true
  } catch (err) {
    console.warn('Turso pushPeople failed:', err.message)
    connectionError = err.message
    return false
  }
}

export async function pushCollection(personId, date, amount, userId) {
  if (!client || !isConnected) return false
  try {
    await client.execute({
      sql: `INSERT OR REPLACE INTO collections (person_id, date, amount, timestamp, user_id)
            VALUES (?, ?, ?, ?, ?)`,
      args: [personId, date, amount, Date.now(), userId],
    })
    return true
  } catch (err) {
    console.warn('Turso pushCollection failed:', err.message)
    connectionError = err.message
    return false
  }
}

export async function pushDeletePerson(id, userId) {
  if (!client || !isConnected) return false
  try {
    await client.batch([
      { sql: 'DELETE FROM people WHERE id = ? AND user_id = ?', args: [id, userId] },
      { sql: 'DELETE FROM collections WHERE person_id = ? AND user_id = ?', args: [id, userId] },
    ])
    return true
  } catch (err) {
    console.warn('Turso pushDeletePerson failed:', err.message)
    connectionError = err.message
    return false
  }
}

export async function pushDeleteCollection(personId, date, userId) {
  if (!client || !isConnected) return false
  try {
    await client.execute({
      sql: 'DELETE FROM collections WHERE person_id = ? AND date = ? AND user_id = ?',
      args: [personId, date, userId],
    })
    return true
  } catch (err) {
    console.warn('Turso pushDeleteCollection failed:', err.message)
    connectionError = err.message
    return false
  }
}

export async function pushClearAll(userId) {
  if (!client || !isConnected) return false
  try {
    await client.batch([
      { sql: 'DELETE FROM people WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM collections WHERE user_id = ?', args: [userId] },
    ])
    return true
  } catch (err) {
    console.warn('Turso pushClearAll failed:', err.message)
    connectionError = err.message
    return false
  }
}

// ──── Sync: Pull data from Turso (filtered by user_id) ────

export async function pullAllData(userId) {
  if (!client || !isConnected) return null
  try {
    const [peopleResult, collectionsResult] = await client.batch([
      { sql: 'SELECT * FROM people WHERE user_id = ? ORDER BY sort_order ASC', args: [userId] },
      { sql: 'SELECT * FROM collections WHERE user_id = ?', args: [userId] },
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

export async function pushFullData(data, userId) {
  if (!client || !isConnected) return false
  try {
    const stmts = [
      { sql: 'DELETE FROM people WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM collections WHERE user_id = ?', args: [userId] },
    ]

    for (const p of (data.people || [])) {
      stmts.push({
        sql: `INSERT INTO people (id, name, mobile, sort_order, created_at, updated_at, user_id)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [p.id, p.name, p.mobile || '', p.order || 0, p.createdAt || Date.now(), Date.now(), userId],
      })
    }

    for (const c of (data.collections || [])) {
      stmts.push({
        sql: `INSERT INTO collections (person_id, date, amount, timestamp, user_id)
              VALUES (?, ?, ?, ?, ?)`,
        args: [c.personId, c.date, c.amount, c.timestamp || Date.now(), userId],
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

// ──── Sync timestamp (per user) ────

export async function setSyncTimestamp(userId) {
  if (!client || !isConnected) return
  try {
    await client.execute({
      sql: `INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)`,
      args: [`last_sync_${userId}`, new Date().toISOString()],
    })
  } catch {
  }
}

export async function getLastSyncTime(userId) {
  if (!client || !isConnected) return null
  try {
    const result = await client.execute({
      sql: `SELECT value FROM sync_meta WHERE key = ?`,
      args: [`last_sync_${userId}`],
    })
    return result.rows.length > 0 ? result.rows[0].value : null
  } catch {
    return null
  }
}
