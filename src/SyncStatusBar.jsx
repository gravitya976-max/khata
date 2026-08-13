// SyncStatusBar.jsx — Shows DB connection and sync status in the app header
import { useState, useEffect } from 'react'
import { getSyncStatus, onSyncStatusChange } from './syncQueue'
import { getFirebaseStatus } from './firebase'

export default function SyncStatusBar() {
  const [status, setStatus] = useState(getSyncStatus())
  const [fbStatus, setFbStatus] = useState(getFirebaseStatus())
  const [showDetail, setShowDetail] = useState(false)
  const [hideBar, setHideBar] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  // Real-time network detection (fetch-based)
  useEffect(() => {
    let mounted = true
    const checkOnline = async () => {
      try {
        await fetch('https://www.google.com/generate_204', {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-store',
        })
        if (mounted) setIsOnline(true)
      } catch {
        if (mounted) setIsOnline(false)
      }
    }

    checkOnline()
    const interval = setInterval(checkOnline, 5000)

    const goOnline = () => { checkOnline() }
    const goOffline = () => { if (mounted) setIsOnline(false) }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    return () => {
      mounted = false
      clearInterval(interval)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  useEffect(() => {
    const unsub = onSyncStatusChange((s) => {
      setStatus(s)
      setHideBar(false)
    })

    const fbInterval = setInterval(() => {
      setFbStatus(getFirebaseStatus())
    }, 5000)

    return () => {
      unsub()
      clearInterval(fbInterval)
    }
  }, [])

  // Auto-hide "Synced" state after 5 seconds
  useEffect(() => {
    if (!status.isSyncing && status.pending === 0 && isOnline && status.tursoStatus === 'Connected') {
      const timer = setTimeout(() => setHideBar(true), 5000)
      return () => clearTimeout(timer)
    }
    setHideBar(false)
  }, [status, isOnline])

  // Determine display state
  let icon, label, colorClass
  if (!isOnline) {
    icon = 'fa-cloud-slash'
    label = status.pending > 0
      ? `Offline · ${status.pending} pending`
      : 'Offline · All saved locally'
    colorClass = 'status-offline'
  } else if (status.isSyncing) {
    icon = 'fa-arrows-rotate fa-spin'
    label = `Syncing${status.pending > 0 ? ` ${status.pending} changes...` : '...'}`
    colorClass = 'status-syncing'
  } else if (status.error || status.tursoStatus === 'Error') {
    icon = 'fa-triangle-exclamation'
    label = 'Sync error'
    colorClass = 'status-error'
  } else if (status.tursoStatus === 'Not configured') {
    icon = 'fa-database'
    label = 'DB not configured'
    colorClass = 'status-warning'
  } else if (status.pending > 0) {
    icon = 'fa-cloud-arrow-up'
    label = `${status.pending} changes pending`
    colorClass = 'status-pending'
  } else {
    icon = 'fa-circle-check'
    label = 'Synced'
    colorClass = 'status-synced'
  }

  if (hideBar) return null

  return (
    <>
      <div
        className={`sync-status-bar ${colorClass}`}
        onClick={() => setShowDetail(!showDetail)}
      >
        <i className={`fa-solid ${icon}`}></i>
        <span className="sync-label">{label}</span>
        <i className={`fa-solid fa-chevron-${showDetail ? 'up' : 'down'} sync-chevron`}></i>
      </div>

      {showDetail && (
        <div className="sync-detail-popup">
          <div className="sync-detail-row">
            <span className="sync-detail-key">Network</span>
            <span className={`sync-detail-val ${isOnline ? 'green' : 'red'}`}>
              <i className={`fa-solid ${isOnline ? 'fa-wifi' : 'fa-wifi-slash'}`}></i>
              {isOnline ? ' Online' : ' Offline'}
            </span>
          </div>
          <div className="sync-detail-row">
            <span className="sync-detail-key">Turso DB</span>
            <span className={`sync-detail-val ${status.tursoStatus === 'Connected' ? 'green' : 'orange'}`}>
              {status.tursoStatus}
            </span>
          </div>
          <div className="sync-detail-row">
            <span className="sync-detail-key">Firebase Backup</span>
            <span className={`sync-detail-val ${fbStatus.status === 'Connected' ? 'green' : 'orange'}`}>
              {fbStatus.status}
            </span>
          </div>
          <div className="sync-detail-row">
            <span className="sync-detail-key">Pending Changes</span>
            <span className="sync-detail-val">{status.pending}</span>
          </div>
          <div className="sync-detail-row">
            <span className="sync-detail-key">Last Synced</span>
            <span className="sync-detail-val">
              {status.lastSyncedAt
                ? new Date(status.lastSyncedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
                : 'Never'}
            </span>
          </div>
          {status.error && (
            <div className="sync-detail-row error-row">
              <span className="sync-detail-key">Error</span>
              <span className="sync-detail-val red">{status.error}</span>
            </div>
          )}
        </div>
      )}
    </>
  )
}
