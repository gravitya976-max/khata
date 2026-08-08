import { useState, useEffect } from 'react'
import Home from './screens/Home'
import Monthly from './screens/Monthly'
import People from './screens/People'
import Share from './screens/Share'
import Settings from './screens/Settings'
import SyncStatusBar from './SyncStatusBar'
import { listenForUpdates, applyUpdate, dismissUpdate, onUpdateStateChange } from './updater'
import { tryCloudRestore, runAutoBackup } from './db'
import { initSyncListeners } from './syncQueue'
import { initFirebase } from './firebase'

const TABS = [
  { id: 'home', label: 'Home', icon: 'fa-house' },
  { id: 'monthly', label: 'Monthly List', icon: 'fa-calendar-days' },
  { id: 'people', label: "People's", icon: 'fa-users' },
  { id: 'share', label: 'Share', icon: 'fa-share-from-square' },
  { id: 'settings', label: 'Settings', icon: 'fa-gear' },
]

export default function App() {
  const [tab, setTab] = useState('home')
  const [selectedPersonId, setSelectedPersonId] = useState(null)
  const [screenKey, setScreenKey] = useState(0)
  const [updateReady, setUpdateReady] = useState(false)
  const [updateInfo, setUpdateInfo] = useState(null)
  const [updating, setUpdating] = useState(false)
  const [showUpdateModal, setShowUpdateModal] = useState(false)

  // Initialize Firebase, sync, and attempt cloud restore (in order)
  useEffect(() => {
    const init = async () => {
      initFirebase()
      initSyncListeners()

      // Small delay to let Firebase init settle
      await new Promise((r) => setTimeout(r, 500))

      const restored = await tryCloudRestore()
      if (restored) {
        setScreenKey((k) => k + 1)
      }

      // Run auto-backup after init
      runAutoBackup()
    }
    init()
  }, [])

  // Listen for service worker update events & check for OTA update on launch
  useEffect(() => {
    listenForUpdates((update) => {
      if (update.state === 'ready' || update.state === 'downloading') {
        setUpdateReady(true)
        setUpdateInfo(update.info)
        setShowUpdateModal(true)
      }
    })

    const unsub = onUpdateStateChange((update) => {
      if (update.state === 'ready' || update.state === 'downloading') {
        setUpdateReady(true)
        setUpdateInfo(update.info)
        setShowUpdateModal(true)
      }
    })

    // Check for OTA updates automatically on launch
    const autoCheck = async () => {
      await new Promise((r) => setTimeout(r, 2000))
      const update = await checkForUpdate()
      if (update) {
        setUpdateReady(true)
        setUpdateInfo({ version: update.version, changelog: update.changelog || 'New update available' })
        setShowUpdateModal(true)
      }
    }
    autoCheck()

    return unsub
  }, [])

  const handleUpdate = () => {
    setUpdating(true)
    applyUpdate()
  }

  const handleDismissUpdate = () => {
    setShowUpdateModal(false)
    dismissUpdate()
  }

  const switchTab = (id) => {
    if (id !== tab) {
      setTab(id)
      setScreenKey((k) => k + 1)
      if (id !== 'monthly') setSelectedPersonId(null)
    }
  }

  const goToPersonMonthly = (personId) => {
    setSelectedPersonId(personId)
    setTab('monthly')
    setScreenKey((k) => k + 1)
  }

  const renderScreen = () => {
    switch (tab) {
      case 'home':
        return <Home onViewPerson={goToPersonMonthly} />
      case 'monthly':
        return <Monthly initialPersonId={selectedPersonId} />
      case 'people':
        return <People />
      case 'share':
        return <Share />
      case 'settings':
        return <Settings />
      default:
        return <Home onViewPerson={goToPersonMonthly} />
    }
  }

  return (
    <div className="app-shell">
      <div className="app-header">
        <h1>Khata</h1>
      </div>

      {/* Sync Status Bar (Settings tab only) */}
      {tab === 'settings' && <SyncStatusBar />}

      {/* Update Modal */}
      {showUpdateModal && updateReady && (
        <div className="modal-overlay" onClick={handleDismissUpdate}>
          <div className="update-modal" onClick={(e) => e.stopPropagation()}>
            <div className="update-modal-icon">
              <i className="fa-solid fa-cloud-arrow-down"></i>
            </div>
            <h3>Update Ready!</h3>
            <p className="update-modal-version">
              Version {updateInfo?.version || 'new'} has been downloaded
            </p>
            <p className="update-modal-changelog">
              {updateInfo?.changelog || 'Bug fixes and improvements'}
            </p>
            <div className="update-modal-actions">
              <button
                className="btn-secondary"
                onClick={handleDismissUpdate}
                disabled={updating}
              >
                Later
              </button>
              <button
                className="btn-primary update-install-btn"
                onClick={handleUpdate}
                disabled={updating}
              >
                {updating ? (
                  <><i className="fa-solid fa-spinner fa-spin"></i> Installing...</>
                ) : (
                  <><i className="fa-solid fa-download"></i> Install Now</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="screen-container" key={screenKey}>
        <div className="screen-enter">
          {renderScreen()}
        </div>
      </div>

      <nav className="bottom-nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-item ${tab === t.id ? 'active' : ''}`}
            onClick={() => switchTab(t.id)}
          >
            <i className={`fa-solid ${t.icon}`}></i>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
