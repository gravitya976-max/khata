import { useState } from 'react'
import { setUserIdValue } from '../db'
import { initTurso, migrateUserData } from '../turso'

export default function Setup({ onComplete }) {
  const [khataId, setKhataId] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    const id = khataId.trim().toLowerCase()

    if (id.length < 2) {
      setError('Khata ID must be at least 2 characters')
      return
    }

    if (!/^[a-z0-9_-]+$/.test(id)) {
      setError('Only letters, numbers, dash and underscore allowed')
      return
    }

    setSaving(true)
    setError('')

    try {
      // Save user ID locally
      await setUserIdValue(id)

      // Try to migrate any existing 'default' data in Turso to this user
      if (navigator.onLine) {
        const connected = await initTurso()
        if (connected) {
          await migrateUserData(id)
        }
      }

      onComplete(id)
    } catch (err) {
      setError('Something went wrong. Try again.')
      setSaving(false)
    }
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-icon">
          <i className="fa-solid fa-book-open"></i>
        </div>

        <h1 className="setup-title">Welcome to Khata</h1>
        <p className="setup-subtitle">
          Your daily money collection tracker
        </p>

        <div className="setup-form">
          <label className="setup-label">Choose your Khata ID</label>
          <input
            className="setup-input"
            type="text"
            placeholder="e.g. sahil, ravi, shop1"
            value={khataId}
            onChange={(e) => {
              setKhataId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))
              setError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
            }}
            maxLength={30}
            autoFocus
          />
          <p className="setup-hint">
            <i className="fa-solid fa-circle-info"></i>{' '}
            Use the <strong>same ID</strong> on all your devices to sync data.
            Different ID = separate data.
          </p>

          {error && (
            <p className="setup-error">
              <i className="fa-solid fa-triangle-exclamation"></i> {error}
            </p>
          )}

          <button
            className="setup-btn"
            onClick={handleSubmit}
            disabled={saving || khataId.trim().length < 2}
          >
            {saving ? (
              <><i className="fa-solid fa-spinner fa-spin"></i> Setting up...</>
            ) : (
              <><i className="fa-solid fa-arrow-right"></i> Start Khata</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
