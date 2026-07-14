import { useState } from 'react'
import { exportAllData, importAllData, clearAllData } from '../db'

const APP_VERSION = '1.1.0'

export default function Settings() {
  const [toast, setToast] = useState('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)

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

      {/* About */}
      <div className="settings-group">
        <div className="settings-group-title">About</div>
        <div className="settings-item">
          <i className="fa-solid fa-circle-info"></i>
          <span className="settings-label">Khata is a lightweight daily collection tracker that works offline. All data stays on your device.</span>
        </div>
      </div>

      {/* Clear Confirmation */}
      {showClearConfirm && (
        <div className="modal-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Clear All Data</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 14 }}>
              This will permanently delete all people and collection records. Download a backup first if needed. This cannot be undone.
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
