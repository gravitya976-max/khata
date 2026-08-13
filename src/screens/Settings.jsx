import { useState, useEffect, useCallback } from 'react'
import { exportAllData, importAllData, clearAllData, getAutoBackups, restoreFromAutoBackup, runAutoBackup, getUserId } from '../db'
import { getFirebaseStatus } from '../firebase'
import { getSyncStatus } from '../syncQueue'
import { getLocalVersion, checkForUpdate } from '../updater'

export default function Settings() {
  const [toast, setToast] = useState('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showBackupList, setShowBackupList] = useState(false)
  const [autoBackups, setAutoBackups] = useState([])
  const [syncStatus, setSyncStatus] = useState(getSyncStatus())
  const [fbStatus, setFbStatus] = useState(getFirebaseStatus())
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [khataId, setKhataId] = useState('')

  // Real-time network detection (fetch-based for Android WebView reliability)
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

    // Check immediately and every 5 seconds
    checkOnline()
    const interval = setInterval(checkOnline, 5000)

    // Also listen to native events as a fast path
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

  // Periodic sync/firebase status refresh
  const refreshStatus = useCallback(async () => {
    setSyncStatus(getSyncStatus())
    setFbStatus(getFirebaseStatus())
    const id = await getUserId()
    if (id) setKhataId(id)
  }, [])

  useEffect(() => {
    const interval = setInterval(refreshStatus, 3000)
    return () => clearInterval(interval)
  }, [refreshStatus])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const handleBackup = async () => {
    try {
      const data = await exportAllData()
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `khata-backup-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      showToast('Backup downloaded')
    } catch (err) {
      showToast('Backup failed: ' + err.message)
    }
  }

  const handleRestore = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        if (!data.people || !data.collections) {
          showToast('Invalid backup file')
          return
        }
        await importAllData(data)
        showToast('Data restored successfully. Refresh the app.')
      } catch (err) {
        showToast('Restore failed: ' + err.message)
      }
    }
    input.click()
  }

  const handleClear = async () => {
    await clearAllData()
    setShowClearConfirm(false)
    showToast('All data cleared')
  }

  const handleForceBackup = async () => {
    const result = await runAutoBackup()
    showToast(result ? 'Backup saved' : 'Backup already recent')
  }

  const handleShowAutoBackups = async () => {
    const backups = await getAutoBackups()
    setAutoBackups(backups)
    setShowBackupList(true)
  }

  const handleRestoreAutoBackup = async (index) => {
    const success = await restoreFromAutoBackup(index)
    setShowBackupList(false)
    showToast(success ? 'Restored from auto-backup. Refresh the app.' : 'Restore failed')
  }

  const handleCheckUpdate = async () => {
    if (checkingUpdate) return
    setCheckingUpdate(true)
    showToast('Checking for updates...')
    try {
      const update = await checkForUpdate()
      if (update) {
        showToast(`Update found! Version ${update.version}`)
      } else {
        showToast('App is up to date (v' + getLocalVersion() + ')')
      }
    } catch {
      showToast('Failed to check for updates')
    } finally {
      setCheckingUpdate(false)
    }
  }

  const tursoStatusColor =
    syncStatus.tursoStatus === 'Connected' ? 'var(--primary)' :
    syncStatus.tursoStatus === 'Error' ? 'var(--danger)' : 'var(--text-muted)'

  const fbStatusColor =
    fbStatus.status === 'Connected' ? 'var(--primary)' :
    fbStatus.status === 'Not configured' ? 'var(--danger)' : 'var(--text-muted)'

  return (
    <div className="settings-section">
      {/* App Info */}
      <div className="settings-group">
        <div className="settings-group-title">App Info</div>
        <div className="settings-item">
          <i className="fa-solid fa-bookmark"></i>
          <span className="settings-label">App Name</span>
          <span className="settings-value">Khata</span>
        </div>
        <div className="settings-item">
          <i className="fa-solid fa-code-branch"></i>
          <span className="settings-label">Version</span>
          <span className="settings-value">{getLocalVersion()}</span>
        </div>
        <div className="settings-item">
          <i className="fa-solid fa-user-tag" style={{ color: 'var(--primary)' }}></i>
          <span className="settings-label">Khata ID</span>
          <span className="settings-value" style={{ fontWeight: 700, color: 'var(--primary-dark)' }}>{khataId || '...'}</span>
        </div>
        <div className="settings-item" onClick={handleCheckUpdate} style={{ cursor: 'pointer' }}>
          <i className="fa-solid fa-cloud-arrow-down" style={{ color: 'var(--primary)' }}></i>
          <span className="settings-label" style={{ fontWeight: 600 }}>Check for Updates</span>
          <span className="settings-value">
            {checkingUpdate ? (
              <i className="fa-solid fa-spinner fa-spin" style={{ color: 'var(--primary)' }}></i>
            ) : (
              <i className="fa-solid fa-chevron-right" style={{ fontSize: 12, color: 'var(--text-muted)' }}></i>
            )}
          </span>
        </div>
        <div className="settings-item">
          <i className="fa-solid fa-signal"></i>
          <span className="settings-label">Network</span>
          <span className="settings-value" style={{
            color: isOnline ? 'var(--primary)' : 'var(--danger)'
          }}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

      </div>

      {/* Cloud Databases */}
      <div className="settings-group">
        <div className="settings-group-title">Cloud Sync</div>

        {/* Turso (Primary) */}
        <div className="settings-item">
          <i className="fa-solid fa-database" style={{color: tursoStatusColor}}></i>
          <span className="settings-label">Turso DB (Primary)</span>
          <span className="settings-value" style={{ color: tursoStatusColor }}>
            {syncStatus.tursoStatus}
          </span>
        </div>

        {/* Firebase (Backup) */}
        <div className="settings-item">
          <i className="fa-solid fa-cloud" style={{color: fbStatusColor}}></i>
          <span className="settings-label">Firebase (Backup)</span>
          <span className="settings-value" style={{ color: fbStatusColor }}>
            {fbStatus.status}
          </span>
        </div>

        {/* Sync stats */}
        <div className="settings-item">
          <i className="fa-solid fa-arrows-rotate" style={{color:'var(--primary)'}}></i>
          <span className="settings-label">Pending Changes</span>
          <span className="settings-value" style={{
            color: syncStatus.pending > 0 ? 'var(--danger)' : 'var(--primary)',
            fontWeight: 700
          }}>
            {syncStatus.pending}
          </span>
        </div>

        <div className="settings-item">
          <i className="fa-solid fa-clock" style={{color:'var(--text-secondary)'}}></i>
          <span className="settings-label">Last Synced</span>
          <span className="settings-value">
            {syncStatus.lastSyncedAt
              ? new Date(syncStatus.lastSyncedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
              : 'Never'}
          </span>
        </div>

        <div className="settings-item" style={{flexDirection:'column',alignItems:'flex-start',gap:6}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <i className="fa-solid fa-circle-info" style={{color:'var(--primary)'}}></i>
            <span className="settings-label" style={{fontWeight:700}}>About Cloud Storage</span>
          </div>
          <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6,paddingLeft:28}}>
            <div style={{marginBottom:6}}>
              <strong>Primary Sync:</strong> Turso DB (SQLite-native cloud database). All your data syncs here when online.
            </div>
            <div style={{marginBottom:6}}>
              <strong>Backup:</strong> Firebase (Google Cloud). Periodic full backup for disaster recovery.
            </div>
            <div style={{marginBottom:6}}>
              <strong>Offline:</strong> App works fully offline. Data is saved locally and synced when you're back online.
            </div>
            <div>
              <strong>Recovery:</strong> If local data is lost, app auto-restores from Turso first, then Firebase.
            </div>
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="settings-group">
        <div className="settings-group-title">Data Management</div>
        <div className="settings-item" onClick={handleBackup}>
          <i className="fa-solid fa-download"></i>
          <span className="settings-label">Backup Data</span>
          <i className="fa-solid fa-chevron-right" style={{fontSize:12,color:'var(--text-muted)'}}></i>
        </div>
        <div className="settings-item" onClick={handleRestore}>
          <i className="fa-solid fa-upload"></i>
          <span className="settings-label">Restore Data</span>
          <i className="fa-solid fa-chevron-right" style={{fontSize:12,color:'var(--text-muted)'}}></i>
        </div>
        <div className="settings-item" onClick={handleForceBackup}>
          <i className="fa-solid fa-shield-halved"></i>
          <span className="settings-label">Force Auto-Backup Now</span>
          <i className="fa-solid fa-chevron-right" style={{fontSize:12,color:'var(--text-muted)'}}></i>
        </div>
        <div className="settings-item" onClick={handleShowAutoBackups}>
          <i className="fa-solid fa-clock-rotate-left"></i>
          <span className="settings-label">Restore from Auto-Backup</span>
          <i className="fa-solid fa-chevron-right" style={{fontSize:12,color:'var(--text-muted)'}}></i>
        </div>
        <div className="settings-item danger" onClick={() => setShowClearConfirm(true)}>
          <i className="fa-solid fa-trash"></i>
          <span className="settings-label">Clear All Data</span>
          <i className="fa-solid fa-chevron-right" style={{fontSize:12,color:'var(--text-muted)'}}></i>
        </div>
      </div>

      {/* Clear Confirmation */}
      {showClearConfirm && (
        <div className="modal-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Clear All Data</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 14 }}>
              This will permanently delete all people and collection records from this device AND the cloud. Download a backup first if needed. This cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowClearConfirm(false)}>
                Cancel
              </button>
              <button className="btn-danger" onClick={handleClear} style={{ flex: 1 }}>
                Clear Everything
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Backup List */}
      {showBackupList && (
        <div className="modal-overlay" onClick={() => setShowBackupList(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Auto-Backups</h3>
            {autoBackups.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 14 }}>
                No auto-backups found. Backups are created automatically every 24 hours.
              </p>
            ) : (
              <div style={{marginBottom: 16}}>
                {autoBackups.map((b, i) => (
                  <div
                    key={i}
                    className="settings-item"
                    onClick={() => handleRestoreAutoBackup(i)}
                    style={{marginBottom: 4}}
                  >
                    <i className="fa-solid fa-clock-rotate-left" style={{color:'var(--primary)'}}></i>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600}}>
                        Backup #{i + 1}
                      </div>
                      <div style={{fontSize:11,color:'var(--text-secondary)'}}>
                        {new Date(b.createdAt).toLocaleString('en-IN')}
                        {' · '}
                        {b.data?.people?.length || 0} people,
                        {' '}
                        {b.data?.collections?.length || 0} records
                      </div>
                    </div>
                    <i className="fa-solid fa-rotate-left" style={{fontSize:14,color:'var(--primary)'}}></i>
                  </div>
                ))}
              </div>
            )}
            <button className="btn-secondary" onClick={() => setShowBackupList(false)} style={{width:'100%'}}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
