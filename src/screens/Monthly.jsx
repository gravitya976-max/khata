import { useState, useEffect, useCallback } from 'react'
import { getAllPeople, getCollectionsByPersonAndMonth, getCollectionsByMonth } from '../db'

const DAYS = ['MON', 'TUES', 'WEDNES', 'THURS', 'FRI', 'SATUR', 'SUN']
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getMonthGrid(year, month) {
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = new Date(year, month, 1).getDay() // 0=Sun
  const startIdx = firstDay === 0 ? 6 : firstDay - 1
  const weeks = Math.ceil((daysInMonth + startIdx) / 7)
  const grid = []

  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    const row = []
    for (let week = 0; week < weeks; week++) {
      const dayNum = week * 7 + dayOfWeek - startIdx + 1
      if (dayNum >= 1 && dayNum <= daysInMonth) {
        row.push(dayNum)
      } else {
        row.push(null)
      }
    }
    grid.push(row)
  }
  return { grid, weeks }
}

function getTodayDate() {
  const now = new Date()
  return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() }
}

export default function Monthly({ initialPersonId }) {
  const [people, setPeople] = useState([])
  const [selectedPerson, setSelectedPerson] = useState(initialPersonId || null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth())
  const [personCollections, setPersonCollections] = useState({})
  const [allSummary, setAllSummary] = useState([])
  const [showPersonPicker, setShowPersonPicker] = useState(false)

  const loadPeople = useCallback(async () => {
    const p = await getAllPeople()
    setPeople(p)
    if (!selectedPerson && p.length > 0) {
      setSelectedPerson(p[0].id)
    }
  }, [selectedPerson])

  useEffect(() => { loadPeople() }, [loadPeople])

  const loadCollections = useCallback(async () => {
    if (!selectedPerson) return
    const c = await getCollectionsByPersonAndMonth(selectedPerson, year, month)
    const map = {}
    c.forEach((entry) => { map[entry.date] = entry.amount })
    setPersonCollections(map)
  }, [selectedPerson, year, month])

  useEffect(() => { loadCollections() }, [loadCollections])

  const loadSummary = useCallback(async () => {
    const allC = await getCollectionsByMonth(year, month)
    const daysInMonth = getDaysInMonth(year, month)
    const summary = people.map((p) => {
      const personEntries = allC.filter((c) => c.personId === p.id)
      const collected = personEntries.filter((c) => c.amount > 0).length
      return {
        person: p,
        collected,
        skipped: daysInMonth - collected,
      }
    })
    setAllSummary(summary)
  }, [people, year, month])

  useEffect(() => { loadSummary() }, [loadSummary])

  const currentPerson = people.find((p) => p.id === selectedPerson)
  const { grid, weeks } = getMonthGrid(year, month)
  const personTotal = Object.values(personCollections).reduce((s, a) => s + a, 0)
  const today = getTodayDate()

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1) }
    else setMonth(month - 1)
  }

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1) }
    else setMonth(month + 1)
  }

  const formatDateStr = (day) => {
    const m = String(month + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${year}-${m}-${d}`
  }

  // Determine cell class based on past/future + paid/due
  const getCellClass = (day, _dayOfWeekIdx) => {
    if (day === null) return 'empty'

    const dateStr = formatDateStr(day)
    const amount = personCollections[dateStr]
    const cellDate = new Date(year, month, day)
    const todayDate = new Date(today.y, today.m, today.d)

    // Future day
    if (cellDate > todayDate) return 'future'

    // Past or today: check if paid
    if (amount !== undefined && amount > 0) return 'collected'

    // Past/today with no payment or ₹0 = due
    return 'due'
  }

  const selectPerson = (id) => {
    setSelectedPerson(id)
    setShowPersonPicker(false)
  }

  return (
    <div>
      {/* Person Header — acts as selector */}
      {currentPerson && (
        <div
          className="month-header"
          onClick={() => setShowPersonPicker(!showPersonPicker)}
          style={{ cursor: 'pointer', position: 'relative' }}
        >
          <div className="avatar">
            {currentPerson.name.charAt(0).toUpperCase()}
          </div>
          <div className="person-detail">
            <div className="name">{currentPerson.name}</div>
            <div className="total">
              Total: <i className="fa-solid fa-indian-rupee-sign" style={{fontSize:11}}></i> {personTotal.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="month-picker">
            <i className={`fa-solid fa-chevron-${showPersonPicker ? 'up' : 'down'}`} style={{fontSize:14}}></i>
          </div>
        </div>
      )}

      {/* Person Picker Dropdown (inside header) */}
      {showPersonPicker && (
        <div className="person-dropdown">
          {people.map((p) => (
            <div
              key={p.id}
              className={`person-dropdown-item ${p.id === selectedPerson ? 'active' : ''}`}
              onClick={() => selectPerson(p.id)}
            >
              <div className="avatar" style={{width:28,height:28,fontSize:12}}>
                {p.name.charAt(0).toUpperCase()}
              </div>
              <span>{p.name}</span>
              {p.id === selectedPerson && (
                <i className="fa-solid fa-circle-check" style={{marginLeft:'auto',color:'var(--primary)'}}></i>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Month Navigation */}
      <div className="month-nav">
        <button onClick={prevMonth}>
          <i className="fa-solid fa-chevron-left"></i>
        </button>
        <span className="month-label">
          <i className="fa-solid fa-calendar-days" style={{marginRight:6, color:'var(--primary)'}}></i>
          {MONTH_NAMES[month]} {year}
        </span>
        <button onClick={nextMonth}>
          <i className="fa-solid fa-chevron-right"></i>
        </button>
      </div>

      {/* Calendar Grid */}
      {people.length === 0 ? (
        <div className="empty-state">
          <i className="fa-solid fa-calendar-days"></i>
          <p>Add people first to see monthly data.</p>
        </div>
      ) : (
        <div className="calendar-grid" style={{ gridTemplateColumns: `auto repeat(${weeks}, 1fr)` }}>
          {grid.map((row, dayIdx) => (
            <div key={dayIdx} style={{ display: 'contents' }}>
              {/* Day label — green for Mon-Sat, pastel red for Sunday */}
              <div className={`cal-day-label ${dayIdx === 6 ? 'sunday' : ''}`}>
                <span style={{fontWeight:800, fontSize:12}}>{DAYS[dayIdx]}</span>
                <span style={{fontSize:9}}>day</span>
              </div>
              {/* Week cells */}
              {row.map((day, weekIdx) => {
                if (day === null) {
                  return <div key={weekIdx} className="cal-cell empty"></div>
                }
                const dateStr = formatDateStr(day)
                const amount = personCollections[dateStr]
                const hasAmount = amount !== undefined && amount > 0
                const cellClass = getCellClass(day, dayIdx)

                return (
                  <div key={weekIdx} className={`cal-cell ${cellClass}`}>
                    <span className="cal-date">{day}</span>
                    {hasAmount && (
                      <span className="cal-amount">
                        <i className="fa-solid fa-indian-rupee-sign" style={{fontSize:8}}></i>{amount}
                      </span>
                    )}
                    {cellClass === 'collected' && (
                      <span className="cal-status check">
                        <i className="fa-solid fa-circle-check"></i>
                      </span>
                    )}
                    {cellClass === 'due' && (
                      <span className="cal-status cross">
                        <i className="fa-solid fa-circle-xmark"></i>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {allSummary.length > 0 && (
        <div className="monthly-summary">
          <div className="summary-title">
            <span>Names</span>
            <span># Serial Number</span>
          </div>
          {allSummary.map((s) => (
            <div key={s.person.id} className="summary-person-row">
              <div className="avatar" style={{width:28,height:28,fontSize:12}}>
                {s.person.name.charAt(0).toUpperCase()}
              </div>
              <div className="name">{s.person.name}</div>
              <div className="counts">
                <span className="collected-count">
                  <i className="fa-solid fa-circle-check"></i> {s.collected}
                </span>
                <span className="skipped-count">
                  <i className="fa-solid fa-circle-xmark"></i> {s.skipped}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
