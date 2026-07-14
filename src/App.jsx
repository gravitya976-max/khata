import { useState, useEffect } from 'react'
import Home from './screens/Home'
import Monthly from './screens/Monthly'
import People from './screens/People'
import Share from './screens/Share'
import Settings from './screens/Settings'
import { listenForUpdates, applyUpdate, getLocalVersion } from './updater'

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
  const [updateInfo, setUpdateInfo] = useState(null)
  const [updating, setUpdating] = useState(false)

  // Listen for service worker update events
  useEffect(() => {
    listenForUpdates((info) => setUpdateInfo(info))
  }, [])

  const handleUpdate = () => {
    setUpdating(true)
    applyUpdate()
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
        <div className="version">
          <div>version</div>
          <div>{getLocalVersion()}</div>
        </div>
      </div>

      {/* Update Banner */}
      {updateInfo && (
        <div className="update-banner">
          <div className="update-info">
            <i className="fa-solid fa-cloud-arrow-down"></i>
            <div>
              <div className="update-title">Update v{updateInfo.version} available</div>
              <div className="update-desc">{updateInfo.changelog}</div>
            </div>
          </div>
          <button
            className="update-btn"
            onClick={handleUpdate}
            disabled={updating}
          >
            {updating ? 'Updating...' : 'Update Now'}
          </button>
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
