import { useState, useEffect } from 'react'
import { exportAllData, importAllData, clearAllData } from '../db'
import { getCloudStatus } from '../firebase'

const APP_VERSION = '1.2.0'

export default function Settings() {
  const [toast, setToast] = useState('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [cloudStatus, setCloudStatus] = useState({ configured: false, status: 'Checking...' })

  useEffect(() => {
    const check = () => setCloudStatus(getCloudStatus())
    check()
    const interval = setInterval(check, 3000)
    return () => clearInterval(interval)
  }, [])

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
          <span className="settings-value">{APP_VERSION}</span>
        </div>
      </div>

      {/* Cloud Database */}
      <div className="settings-group">
        <div className="settings-group-title">Cloud Database</div>
        <div className="settings-item">
          <i className={`fa-solid ${cloudStatus.configured ? 'fa-cloud-arrow-up' : 'fa-cloud-xmark'}`}
             style={{color: cloudStatus.configured ? 'var(--primary)' : 'var(--text-muted)'}}></i>
          <span className="settings-label">Cloud Sync</span>
          <span className="settings-value" style={{
            color: cloudStatus.status === 'Connected' ? 'var(--primary)' :
                   cloudStatus.status === 'Not configured' ? 'var(--danger)' : 'var(--text-muted)'
          }}>
            {cloudStatus.status}
          </span>
        </div>
        <div className="settings-item" style={{flexDirection:'column',alignItems:'flex-start',gap:6}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <i className="fa-solid fa-circle-info" style={{color:'var(--primary)'}}></i>
            <span className="settings-label" style={{fontWeight:700}}>About Cloud Storage</span>
          </div>
          <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6,paddingLeft:28}}>
            <div style={{marginBottom:6}}>
              <strong>Provider:</strong> Google Firebase (Firestore)
            </div>
            <div style={{marginBottom:6}}>
              <strong>Cost:</strong> Completely FREE. Firebase Spark plan includes 1GB storage and 50,000 reads/day. Khata uses less than 1MB and fewer than 100 reads/day.
            </div>
            <div style={{marginBottom:6}}>
              <strong>Reliable:</strong> Firebase is owned and operated by Google. 99.95% uptime SLA. Same infrastructure used by apps with millions of users.
            </div>
            <div style={{marginBottom:6}}>
              <strong>Long-term:</strong> Firebase has been running since 2012 (14+ years). Google has invested billions in it. Your data is stored in Google Cloud data centers with automatic backups.
            </div>
            <div style={{marginBottom:6}}>
              <strong>Privacy:</strong> Data is tied to an anonymous device ID. No personal info is shared. Only you can access your data.
            </div>
            <div>
              <strong>Recovery:</strong> If you clear app data or switch phones, your collections restore automatically from the cloud on next app open.
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

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
