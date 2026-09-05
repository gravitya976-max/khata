import { useState, useEffect } from 'react'
import Home from './screens/Home'
import Monthly from './screens/Monthly'
import People from './screens/People'
import Share from './screens/Share'
import Settings from './screens/Settings'
import Setup from './screens/Setup'
import SyncStatusBar from './SyncStatusBar'
import { listenForUpdates, applyUpdate, dismissUpdate, onUpdateStateChange, checkForUpdate } from './updater'
import { tryCloudRestore, runAutoBackup, mergeFromTurso, migrateIdsToTimestamp, getUserId } from './db'
import { initSyncListeners, processQueue } from './syncQueue'
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

  // User setup state
  const [userId, setUserId] = useState(null)
  const [checkingUser, setCheckingUser] = useState(true)

  // Check if user has set up their Khata ID
  useEffect(() => {
    const checkUser = async () => {
      const id = await getUserId()
      setUserId(id)
      setCheckingUser(false)
    }
    checkUser()
  }, [])

  // One-time local setup after user is set up
  // Only touches IndexedDB (local, instant) — zero network calls
  useEffect(() => {
    if (!userId) return

    const localInit = async () => {
      // One-time local migration (checks a flag, skips if already done)
      await migrateIdsToTimestamp()

      // Only restore from cloud if this is a fresh install (empty local DB)
      const restored = await tryCloudRestore()
      if (restored) {
        setScreenKey((k) => k + 1)
      }
    }
    localInit()
  }, [userId])

  // Background sync — only runs when app is NOT in active use
  // Triggers: app minimized, app closing, or user idle for 5s
  useEffect(() => {
    if (!userId) return

    let idleTimer = null
    let isSyncing = false

    // The actual sync work — runs in background only
    const runBackgroundSync = async () => {
      if (isSyncing || !navigator.onLine) return
      isSyncing = true

      try {
        initFirebase()
        initSyncListeners()
        await processQueue()
        await mergeFromTurso()
        await runAutoBackup()
      } catch {}

      isSyncing = false
    }

    // Trigger 1: App minimized (user switched to another app)
    const onVisibilityChange = () => {
      if (document.hidden) {
        runBackgroundSync()
      } else {
        // App came back to foreground — refresh data
        setScreenKey((k) => k + 1)
      }
    }

    // Trigger 2: App closing (swipe kill, navigate away)
    const onPageHide = () => {
      runBackgroundSync()
    }

    // Trigger 3: User idle for 5s — quietly sync if there are pending writes
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        if (navigator.onLine) runBackgroundSync()
      }, 5000)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)

    // Track user activity to detect idle
    document.addEventListener('pointerdown', resetIdleTimer, { passive: true })
    document.addEventListener('scroll', resetIdleTimer, { passive: true })

    // Initial idle timer — sync 5s after app opens if user hasn't interacted
    resetIdleTimer()

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('pointerdown', resetIdleTimer)
      document.removeEventListener('scroll', resetIdleTimer)
      if (idleTimer) clearTimeout(idleTimer)
    }
  }, [userId])

  // Listen for SW update messages
  useEffect(() => {
    const handleUpdate = (update) => {
      if (update.state === 'ready') {
        setUpdateReady(true)
        setUpdateInfo(update.info)
        setShowUpdateModal(true)
      }
    }

    listenForUpdates(handleUpdate)
    const unsub = onUpdateStateChange(handleUpdate)

    const autoCheck = async () => {
      await new Promise((r) => setTimeout(r, 3000))
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

  const handleSetupComplete = (id) => {
    setUserId(id)
  }

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

  // Show loading while checking user
  if (checkingUser) return null

  // Show setup screen if no user ID
  if (!userId) {
    return <Setup onComplete={handleSetupComplete} />
  }

  return (
    <div className="app-shell">
      <div className="app-header">
        <h1>Khata</h1>
      </div>

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
