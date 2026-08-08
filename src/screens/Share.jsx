import { useState, useEffect, useCallback } from 'react'
import { getAllPeople, getCollectionsByDate, getCollectionsByMonth, getCollectionsByPersonAndMonth } from '../db'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getMonthGrid(year, month) {
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = new Date(year, month, 1).getDay() // 0=Sun
  const startIdx = firstDay === 0 ? 6 : firstDay - 1 // Monday-based
  const totalCells = daysInMonth + startIdx
  const weeks = Math.ceil(totalCells / 7)

  const grid = []
  for (let row = 0; row < 7; row++) {
    const weekRow = []
    for (let col = 0; col < weeks; col++) {
      const dayNum = col * 7 + row - startIdx + 1
      if (dayNum >= 1 && dayNum <= daysInMonth) {
        weekRow.push({ day: dayNum, currentMonth: true })
      } else if (dayNum < 1) {
        const prevMonth = month === 0 ? 11 : month - 1
        const prevYear = month === 0 ? year - 1 : year
        const prevDays = getDaysInMonth(prevYear, prevMonth)
        weekRow.push({ day: prevDays + dayNum, currentMonth: false })
      } else {
        weekRow.push(null)
      }
    }
    grid.push(weekRow)
  }
  return { grid, weeks }
}

export default function Share() {
  const [mode, setMode] = useState('person') // 'person' | 'whole'
  const [people, setPeople] = useState([])
  const [showPersonDropdown, setShowPersonDropdown] = useState(false)

  // ──── Person mode state (single person, whole month) ────
  const [selectedPersonId, setSelectedPersonId] = useState(null)
  const [pYear, setPYear] = useState(new Date().getFullYear())
  const [pMonth, setPMonth] = useState(new Date().getMonth())
  const [personMonthData, setPersonMonthData] = useState([]) // [{date, amount}]
  const [personMonthTotal, setPersonMonthTotal] = useState(0)

  // ──── Whole month mode state ────
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth())
  const [dailyTotals, setDailyTotals] = useState({})
  const [monthTotal, setMonthTotal] = useState(0)
  const [prevMonths, setPrevMonths] = useState([])

  // Date detail popup state
  const [showDateDetail, setShowDateDetail] = useState(false)
  const [detailDate, setDetailDate] = useState(null)
  const [detailRows, setDetailRows] = useState([])
  const [detailTotal, setDetailTotal] = useState(0)

  const [toast, setToast] = useState('')

  const loadPeople = useCallback(async () => {
    const p = await getAllPeople()
    setPeople(p)
    if (p.length > 0 && !selectedPersonId) {
      setSelectedPersonId(p[0].id)
    }
  }, [selectedPersonId])

  useEffect(() => { loadPeople() }, [loadPeople])

  // ──── Person mode: load single person's month data ────
  const loadPersonMonthData = useCallback(async () => {
    if (mode !== 'person' || !selectedPersonId) return
    const collections = await getCollectionsByPersonAndMonth(selectedPersonId, pYear, pMonth)
    const daysInMonth = getDaysInMonth(pYear, pMonth)
    const data = []
    let total = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const m = String(pMonth + 1).padStart(2, '0')
      const dd = String(d).padStart(2, '0')
      const dateStr = `${pYear}-${m}-${dd}`
      const entry = collections.find((c) => c.date === dateStr)
      const amount = entry ? entry.amount : 0
      data.push({ day: d, date: dateStr, amount })
      total += amount
    }
    setPersonMonthData(data)
    setPersonMonthTotal(total)
  }, [mode, selectedPersonId, pYear, pMonth])

  useEffect(() => { loadPersonMonthData() }, [loadPersonMonthData])

  // ──── Whole month data ────
  const loadMonthData = useCallback(async () => {
    if (mode !== 'whole') return
    const allC = await getCollectionsByMonth(year, month)
    const daysInMonth = getDaysInMonth(year, month)
    const totals = {}
    let mTotal = 0

    for (let d = 1; d <= daysInMonth; d++) {
      const m = String(month + 1).padStart(2, '0')
      const dd = String(d).padStart(2, '0')
      const dateStr = `${year}-${m}-${dd}`
      const dayEntries = allC.filter((c) => c.date === dateStr)
      const sum = dayEntries.reduce((s, c) => s + c.amount, 0)
      totals[dateStr] = sum
      mTotal += sum
    }

    setDailyTotals(totals)
    setMonthTotal(mTotal)
  }, [mode, year, month])

  useEffect(() => { loadMonthData() }, [loadMonthData])

  // ──── Previous months data ────
  const loadPrevMonths = useCallback(async () => {
    if (mode !== 'whole') return
    const months = []
    for (let i = 1; i <= 6; i++) {
      let pm = month - i
      let py = year
      while (pm < 0) { pm += 12; py -= 1 }
      const allC = await getCollectionsByMonth(py, pm)
      const total = allC.reduce((s, c) => s + c.amount, 0)
      if (total > 0) {
        months.push({ name: MONTH_NAMES[pm], year: py, month: pm, total })
      }
    }
    setPrevMonths(months)
  }, [mode, year, month])

  useEffect(() => { loadPrevMonths() }, [loadPrevMonths])

  // ──── Date detail popup ────
  const openDateDetail = async (dayNum) => {
    const m = String(month + 1).padStart(2, '0')
    const d = String(dayNum).padStart(2, '0')
    const dateStr = `${year}-${m}-${d}`
    setDetailDate(dateStr)

    const collections = await getCollectionsByDate(dateStr)
    const rows = []
    let total = 0
    for (const person of people) {
      const entry = collections.find((c) => c.personId === person.id)
      if (entry && entry.amount > 0) {
        rows.push({ id: person.id, name: person.name, mobile: person.mobile, amount: entry.amount, status: 'paid' })
        total += entry.amount
      } else {
        rows.push({ id: person.id, name: person.name, mobile: person.mobile, amount: 0, status: 'due' })
      }
    }
    setDetailRows(rows)
    setDetailTotal(total)
    setShowDateDetail(true)
  }

  // ──── Build text for sharing ────
  const buildPersonMonthText = () => {
    const person = people.find((p) => p.id === selectedPersonId)
    if (!person) return ''
    const daysInMonth = getDaysInMonth(pYear, pMonth)

    const amounts = []
    for (let d = 1; d <= daysInMonth; d++) {
      const entry = personMonthData.find((e) => e.day === d)
      amounts.push(entry ? entry.amount : 0)
    }
    const maxAmtLen = Math.max(...amounts.map((a) => String(a).length), String(personMonthTotal).length, 4)

    const dateWidth = 5
    const amtWidth = maxAmtLen + 3
    const half = Math.ceil(daysInMonth / 2)

    const colHeader = `Date`.padEnd(dateWidth) + `| ` + `Amount`.padStart(amtWidth)
    const lineHalf = '─'.repeat(dateWidth + amtWidth + 2)
    const LINE = (dateWidth + amtWidth + 2) * 2 + 3

    let text = `=== ${person.name} — ${MONTH_NAMES[pMonth]} ${pYear} ===\n`
    text += `${'═'.repeat(LINE)}\n`
    text += `${colHeader} │ ${colHeader}\n`
    text += `${lineHalf}┼${lineHalf}\n`

    for (let d = 1; d <= half; d++) {
      const d1 = d
      const d2 = d + half

      const entry1 = personMonthData.find((e) => e.day === d1)
      const amt1 = entry1 ? entry1.amount : 0
      const leftCol = `${String(d1).padEnd(dateWidth)}| ${('Rs.' + amt1).padStart(amtWidth)}`

      let rightCol = ''
      if (d2 <= daysInMonth) {
        const entry2 = personMonthData.find((e) => e.day === d2)
        const amt2 = entry2 ? entry2.amount : 0
        rightCol = `${String(d2).padEnd(dateWidth)}| ${('Rs.' + amt2).padStart(amtWidth)}`
      } else {
        rightCol = `${''.padEnd(dateWidth)}| ${''.padStart(amtWidth)}`
      }

      text += `${leftCol} │ ${rightCol}\n`
      text += `${lineHalf}┼${lineHalf}\n`
    }

    text += `TOTAL: Rs.${personMonthTotal}\n`
    text += `${'═'.repeat(LINE)}\n`
    return text
  }

  const buildDayText = (rows, dateStr, total) => {
    const d = new Date(dateStr + 'T00:00:00')
    const dayName = d.toLocaleDateString('en-IN', { weekday: 'long' })
    const dateLabel = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

    const maxNameLen = Math.max(...rows.map((r) => r.name.length), 14)
    const maxAmtLen = Math.max(...rows.map((r) => String(r.amount).length), String(total).length, 6)
    const LINE = maxNameLen + maxAmtLen + 7

    let text = `--- Daily Collection ---\n`
    text += `${dayName}, ${dateLabel}\n`
    text += `${'═'.repeat(LINE)}\n`
    text += `Name`.padEnd(maxNameLen) + ` | ` + `Amount`.padStart(maxAmtLen + 3) + `\n`
    text += `${'─'.repeat(LINE)}\n`
    rows.forEach((r) => {
      const name = r.name.padEnd(maxNameLen, ' ')
      const amtCol = `Rs.${r.amount}`.padStart(maxAmtLen + 3)
      text += `${name} | ${amtCol}\n`
      text += `${'─'.repeat(LINE)}\n`
    })
    const paid = rows.filter(r => r.status === 'paid').length
    text += `Collected: ${paid}/${rows.length}\n`
    text += `${'TOTAL'.padEnd(maxNameLen)} | ${'Rs.' + total}`.padEnd(LINE) + `\n`
    text += `${'═'.repeat(LINE)}\n`
    return text
  }

  const buildWholeMonthText = () => {
    const daysInMonth = getDaysInMonth(year, month)
    const LINE = 28

    let text = `=== ${MONTH_NAMES[month]} ${year} ===\n`
    text += `${'═'.repeat(LINE)}\n`
    text += `Date        | Amount\n`
    text += `${'─'.repeat(LINE)}\n`

    for (let d = 1; d <= daysInMonth; d++) {
      const m = String(month + 1).padStart(2, '0')
      const dd = String(d).padStart(2, '0')
      const dateStr = `${year}-${m}-${dd}`
      const amount = dailyTotals[dateStr] || 0
      const dateObj = new Date(dateStr + 'T00:00:00')
      const dayName = dateObj.toLocaleDateString('en-IN', { weekday: 'short' })
      const dateCol = `${dayName} ${dd}/${m}`.padEnd(11)
      const amtCol = `Rs.${amount}`.padStart(10)
      text += `${dateCol} | ${amtCol}\n`
      text += `${'─'.repeat(LINE)}\n`
    }

    text += `${'TOTAL'.padEnd(11)} | ${'Rs.' + monthTotal}`.padStart(LINE) + `\n`
    text += `${'═'.repeat(LINE)}\n`
    return text
  }

  // ──── Share handlers ────
  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const handleSharePerson = async () => {
    const text = buildPersonMonthText()
    if (navigator.share) {
      try { await navigator.share({ text }) } catch {}
    } else {
      await navigator.clipboard.writeText(text)
      showToast('Copied to clipboard')
    }
  }

  const handleShareDateDetail = async () => {
    const text = buildDayText(detailRows, detailDate, detailTotal)
    if (navigator.share) {
      try { await navigator.share({ text }) } catch {}
    } else {
      await navigator.clipboard.writeText(text)
      showToast('Copied to clipboard')
    }
  }

  const handleShareMonth = async () => {
    const text = buildWholeMonthText()
    if (navigator.share) {
      try { await navigator.share({ text }) } catch {}
    } else {
      await navigator.clipboard.writeText(text)
      showToast('Copied to clipboard')
    }
  }

  // ──── Person month navigation ────
  const prevPMonth = () => {
    if (pMonth === 0) { setPMonth(11); setPYear(pYear - 1) }
    else setPMonth(pMonth - 1)
  }
  const nextPMonth = () => {
    if (pMonth === 11) { setPMonth(0); setPYear(pYear + 1) }
    else setPMonth(pMonth + 1)
  }

  // ──── Calendar grid ────
  const { grid, weeks } = getMonthGrid(year, month)

  const formatDateStr = (day) => {
    const m = String(month + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${year}-${m}-${d}`
  }

  // Split person month data into two columns for the preview table
  const daysInPMonth = getDaysInMonth(pYear, pMonth)
  const half = Math.ceil(daysInPMonth / 2)
  const col1 = personMonthData.slice(0, half)
  const col2 = personMonthData.slice(half)
  const selectedPerson = people.find((p) => p.id === selectedPersonId)

  return (
    <div>
      {/* Toggle Tabs */}
      <div className="share-toggle">
        <button
          className={mode === 'person' ? 'active' : ''}
          onClick={() => setMode('person')}
        >
          Share Single Person Data
        </button>
        <button
          className={mode === 'whole' ? 'active' : ''}
          onClick={() => setMode('whole')}
        >
          Share Whole Month Data
        </button>
      </div>

      {/* ════════════════════════════════════════ */}
      {/* PERSON MODE (single person, full month) */}
      {/* ════════════════════════════════════════ */}
      {mode === 'person' && (
        <>
          {/* Person Selector - Custom Dropdown */}
          <div style={{padding:'0 16px',marginBottom:8,position:'relative'}}>
            <div
              className="person-select"
              onClick={() => setShowPersonDropdown(!showPersonDropdown)}
            >
              <span>{selectedPerson ? selectedPerson.name : 'Select person'}</span>
              <i className={`fa-solid fa-chevron-${showPersonDropdown ? 'up' : 'down'}`} style={{fontSize:12,color:'var(--primary)'}}></i>
            </div>
            {showPersonDropdown && (
              <div className="person-dropdown-list">
                {people.map((p) => (
                  <div
                    key={p.id}
                    className={`person-dropdown-item ${p.id === selectedPersonId ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedPersonId(p.id)
                      setShowPersonDropdown(false)
                    }}
                  >
                    <div className="avatar" style={{width:28,height:28,fontSize:12}}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <span>{p.name}</span>
                    {p.id === selectedPersonId && (
                      <i className="fa-solid fa-check" style={{marginLeft:'auto',color:'var(--primary)',fontSize:14}}></i>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Month Nav */}
          <div className="month-nav">
            <button onClick={prevPMonth}>
              <i className="fa-solid fa-chevron-left"></i>
            </button>
            <span className="month-label">{MONTH_NAMES[pMonth]} {pYear}</span>
            <button onClick={nextPMonth}>
              <i className="fa-solid fa-chevron-right"></i>
            </button>
          </div>

          {/* Preview */}
          <div style={{padding:'0 16px'}}>
            <div style={{fontSize:18,fontWeight:800,marginBottom:4}}>Preview</div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8}}>
              Share the data in text table
            </div>
          </div>

          <div className="preview-box preview-two-col">
            <div className="preview-col-header">
              {selectedPerson ? selectedPerson.name : ''} &mdash; {MONTH_NAMES[pMonth]} {pYear}
            </div>
            <div className="preview-columns">
              <div className="preview-col">
                <div className="preview-col-row preview-col-row-head">
                  <span>DATE</span><span>AMOUNT</span>
                </div>
                {col1.map((r) => (
                  <div key={r.day} className={`preview-col-row ${r.amount > 0 ? 'paid' : 'due'}`}>
                    <span>{r.day}</span>
                    <span>{r.amount > 0 ? <>Rs.{r.amount}</> : ''}</span>
                  </div>
                ))}
              </div>
              <div className="preview-col">
                <div className="preview-col-row preview-col-row-head">
                  <span>DATE</span><span>AMOUNT</span>
                </div>
                {col2.map((r) => (
                  <div key={r.day} className={`preview-col-row ${r.amount > 0 ? 'paid' : 'due'}`}>
                    <span>{r.day}</span>
                    <span>{r.amount > 0 ? <>Rs.{r.amount}</> : ''}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="preview-col-total">
              Total: <strong>Rs.{personMonthTotal}</strong>
            </div>
          </div>

          {/* Share Button */}
          <div className="share-actions">
            <button className="share-btn" onClick={handleSharePerson}>
              <i className="fa-solid fa-share-from-square"></i>
              Share
            </button>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════ */}
      {/* WHOLE MONTH MODE (new calendar UI)      */}
      {/* ════════════════════════════════════════ */}
      {mode === 'whole' && (
        <>
          {/* Month Header Card */}
          <div className="share-month-header">
            <div className="share-month-info">
              <div className="share-month-name">{MONTH_NAMES[month]} {year}</div>
              <div className="share-month-total">
                <i className="fa-solid fa-indian-rupee-sign"></i>
                <span className="share-month-amount">{monthTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>
            <button className="share-month-btn" onClick={handleShareMonth}>
              <i className="fa-solid fa-share"></i>
              <span>SHARE</span>
            </button>
          </div>

          {/* Month Navigation */}
          <div className="month-nav" style={{padding:'4px 16px'}}>
            <button onClick={() => {
              if (month === 0) { setMonth(11); setYear(year - 1) }
              else setMonth(month - 1)
            }}>
              <i className="fa-solid fa-chevron-left"></i>
            </button>
            <span className="month-label" style={{fontSize:13}}>
              {MONTH_NAMES[month]} {year}
            </span>
            <button onClick={() => {
              if (month === 11) { setMonth(0); setYear(year + 1) }
              else setMonth(month + 1)
            }}>
              <i className="fa-solid fa-chevron-right"></i>
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="share-calendar" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}>
            {grid.map((row, rowIdx) => (
              row.map((cell, colIdx) => {
                if (!cell) {
                  return <div key={`${rowIdx}-${colIdx}`} className="share-cal-cell empty"></div>
                }

                const dateStr = cell.currentMonth ? formatDateStr(cell.day) : null
                const amount = dateStr ? (dailyTotals[dateStr] || 0) : 0
                const hasAmount = amount > 0
                const isPrevMonth = !cell.currentMonth
                const cellClass = isPrevMonth ? 'prev-month' : (hasAmount ? 'collected' : 'zero')

                return (
                  <div
                    key={`${rowIdx}-${colIdx}`}
                    className={`share-cal-cell ${cellClass}`}
                    onClick={() => {
                      if (cell.currentMonth) openDateDetail(cell.day)
                    }}
                  >
                    <span className="share-cal-day">{cell.day}</span>
                    <span className="share-cal-amount">
                      <i className="fa-solid fa-indian-rupee-sign" style={{fontSize:9}}></i>
                      {cell.currentMonth ? amount : ''}
                    </span>
                  </div>
                )
              })
            ))}
          </div>

          {/* Previous Months */}
          {prevMonths.length > 0 && (
            <div className="share-prev-months">
              {prevMonths.map((pm, i) => (
                <div key={i} className="share-prev-month-row">
                  <span className="share-prev-name">{pm.name} {pm.year}</span>
                  <span className="share-prev-total">
                    Total <i className="fa-solid fa-indian-rupee-sign" style={{fontSize:12}}></i>
                    {pm.total.toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════ */}
      {/* DATE DETAIL POPUP                       */}
      {/* ════════════════════════════════════════ */}
      {showDateDetail && detailDate && (
        <div className="modal-overlay" onClick={() => setShowDateDetail(false)}>
          <div className="date-detail-modal" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="date-detail-header">
              <div className="date-detail-header-left">
                <button className="date-detail-close" onClick={() => setShowDateDetail(false)}>
                  <i className="fa-solid fa-chevron-left"></i>
                </button>
                <div className="date-detail-icon">
                  <i className="fa-solid fa-calendar-days"></i>
                </div>
                <div className="date-detail-date">
                  DATE : {new Date(detailDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </div>
              </div>
              <div className="date-detail-total-section">
                <div className="date-detail-total-label">TOTAL AMOUNT</div>
                <div className="date-detail-total-value">
                  <i className="fa-solid fa-indian-rupee-sign"></i>
                  {detailTotal.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {/* Names header */}
            <div className="date-detail-names-header">
              <span className="date-detail-names-title">NAMES</span>
              <button className="date-detail-share-btn" onClick={handleShareDateDetail}>
                share <i className="fa-solid fa-share"></i>
              </button>
            </div>

            {/* People list */}
            <div className="date-detail-list">
              {detailRows.map((r, i) => (
                <div key={i} className={`date-detail-person ${r.status === 'paid' ? 'paid' : 'due'}`}>
                  <div className="avatar" style={{width:36,height:36,fontSize:14}}>
                    {r.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="date-detail-person-info">
                    <div className="date-detail-person-name">{r.name}</div>
                    {r.mobile && <div className="date-detail-person-mobile">{r.mobile}</div>}
                  </div>
                  <div className="date-detail-person-amount">
                    <i className="fa-solid fa-indian-rupee-sign" style={{fontSize:12}}></i>
                    <span>{r.status === 'paid' ? r.amount : '---'}</span>
                  </div>
                  <i className="fa-solid fa-chevron-right" style={{fontSize:12,color:'var(--text-muted)'}}></i>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
