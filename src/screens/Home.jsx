import { useState, useEffect, useCallback } from 'react'
import { getAllPeople, getCollectionsByDate, saveCollection } from '../db'

const HOTKEYS = [100, 150, 200, 250, 300]

function formatDate(d) {
  return d.toISOString().split('T')[0]
}

export default function Home({ onViewPerson }) {
  const [people, setPeople] = useState([])
  const [collections, setCollections] = useState({}) // { personId: amount }
  const [date, setDate] = useState(formatDate(new Date()))
  const [activeInput, setActiveInput] = useState(null) // personId currently focused

  const loadData = useCallback(async () => {
    const p = await getAllPeople()
    setPeople(p)
    const c = await getCollectionsByDate(date)
    const map = {}
    c.forEach((entry) => { map[entry.personId] = entry.amount })
    setCollections(map)
  }, [date])

  useEffect(() => { loadData() }, [loadData])

  const handleAmountChange = (personId, value) => {
    const num = value === '' ? '' : parseInt(value, 10) || 0
    setCollections((prev) => ({ ...prev, [personId]: num }))
  }

  const handleAmountSave = async (personId) => {
    const amount = collections[personId]
    if (amount === undefined || amount === '') return
    await saveCollection(personId, date, typeof amount === 'number' ? amount : 0)
  }

  const handleHotkey = async (personId, amount) => {
    setCollections((prev) => ({ ...prev, [personId]: amount }))
    await saveCollection(personId, date, amount)
  }

  const totalCollected = Object.values(collections).reduce(
    (sum, a) => sum + (typeof a === 'number' ? a : 0), 0
  )
  const collectedCount = Object.values(collections).filter(
    (a) => typeof a === 'number' && a > 0
  ).length
  const skippedCount = people.length - collectedCount

  return (
    <div>
      {/* Summary Card */}
      <div className="summary-card">
        <div className="summary-item">
          <div className="label">Today's Total</div>
          <div className="value">
            <span className="rupee"><i className="fa-solid fa-indian-rupee-sign"></i></span>{' '}
            {totalCollected.toLocaleString('en-IN')}
          </div>
        </div>
        <div className="summary-item">
          <div className="label">Collected</div>
          <div className="value">{collectedCount}/{people.length}</div>
        </div>
        <div className="summary-item">
          <div className="label">Skipped</div>
          <div className="value">{skippedCount}/{people.length}</div>
        </div>
      </div>

      {/* Date Navigator */}
      <div className="date-nav">
        <button className="date-nav-btn" onClick={() => {
          const d = new Date(date)
          d.setDate(d.getDate() - 1)
          setDate(formatDate(d))
        }}>
          <i className="fa-solid fa-chevron-left"></i>
        </button>
        <div className="date-nav-center">
          <i className="fa-solid fa-calendar-days date-nav-icon"></i>
          <div className="date-nav-text">
            <span className="date-nav-day">
              {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long' })}
            </span>
            <span className="date-nav-full">
              {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
          {date !== formatDate(new Date()) && (
            <button className="date-nav-today" onClick={() => setDate(formatDate(new Date()))}>
              Today
            </button>
          )}
        </div>
        <button className="date-nav-btn" onClick={() => {
          const d = new Date(date)
          d.setDate(d.getDate() + 1)
          setDate(formatDate(d))
        }}>
          <i className="fa-solid fa-chevron-right"></i>
        </button>
      </div>

      {/* Names label */}
      <div className="names-label">Names</div>

      {/* People List */}
      {people.length === 0 ? (
        <div className="empty-state">
          <i className="fa-solid fa-users"></i>
          <p>No people added yet.<br />Go to People's tab to add.</p>
        </div>
      ) : (
        people.map((person) => {
          const amount = collections[person.id]
          const hasAmount = typeof amount === 'number' && amount > 0
          const cardClass = hasAmount ? 'collected' : (amount === 0 ? 'skipped' : '')

          return (
            <div key={person.id}>
              <div className={`person-card ${cardClass}`}>
                <div className="avatar">
                  {person.name.charAt(0).toUpperCase()}
                </div>
                <div className="person-info">
                  <div className="name">{person.name}</div>
                  {person.mobile && <div className="mobile">{person.mobile}</div>}
                </div>
                <div className="amount-section">
                  <span className="rupee-symbol"><i className="fa-solid fa-indian-rupee-sign"></i></span>
                  <input
                    className="amount-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    enterKeyHint="done"
                    placeholder="---"
                    value={amount !== undefined && amount !== '' ? amount : ''}
                    onChange={(e) => handleAmountChange(person.id, e.target.value)}
                    onFocus={() => setActiveInput(person.id)}
                    onBlur={() => {
                      handleAmountSave(person.id)
                      setActiveInput(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.target.blur()
                    }}
                  />
                </div>
                <button className="chevron-btn" onClick={() => onViewPerson(person.id)}>
                  <i className="fa-solid fa-chevron-right"></i>
                </button>
              </div>

              {/* Hotkey buttons — show when this input is focused */}
              {activeInput === person.id && (
                <div className="hotkeys">
                  {HOTKEYS.map((h) => (
                    <button
                      key={h}
                      className="hotkey-btn"
                      onMouseDown={(e) => {
                        e.preventDefault() // prevent blur before click fires
                        handleHotkey(person.id, h)
                      }}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
