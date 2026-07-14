import { useState, useEffect, useCallback } from 'react'
import { getAllPeople, getCollectionsByDate, getCollectionsByMonth } from '../db'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function formatDate(d) {
  return d.toISOString().split('T')[0]
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

export default function Share() {
  const [mode, setMode] = useState('day') // 'day' | 'whole'
  const [people, setPeople] = useState([])
  const [date, setDate] = useState(formatDate(new Date()))
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth())
  const [dayRows, setDayRows] = useState([]) // [{name, amount, status}]
  const [dayTotal, setDayTotal] = useState(0)
  const [wholeText, setWholeText] = useState('')
  const [toast, setToast] = useState('')

  const loadPeople = useCallback(async () => {
    const p = await getAllPeople()
    setPeople(p)
  }, [])

  useEffect(() => { loadPeople() }, [loadPeople])

  const generatePreview = useCallback(async () => {
    if (mode === 'day') {
      const collections = await getCollectionsByDate(date)
      const rows = []
      let total = 0
      for (const person of people) {
        const entry = collections.find((c) => c.personId === person.id)
        if (entry && entry.amount > 0) {
          rows.push({ name: person.name, amount: entry.amount, status: 'paid' })
          total += entry.amount
        } else {
          rows.push({ name: person.name, amount: 0, status: 'due' })
        }
      }
      setDayRows(rows)
      setDayTotal(total)
    } else if (mode === 'whole') {
      const allC = await getCollectionsByMonth(year, month)
      let text = `=== ALL COLLECTIONS ===\n`
      text += `${MONTH_NAMES[month]} ${year}\n`
      text += `${'═'.repeat(35)}\n\n`

      let grandTotal = 0
      for (const person of people) {
        const personEntries = allC.filter((c) => c.personId === person.id)
        const personTotal = personEntries.reduce((s, c) => s + c.amount, 0)
        const collected = personEntries.filter((c) => c.amount > 0).length

        text += `${person.name}\n`
        text += `  Collected: ${collected} days | Total: Rs.${personTotal}\n\n`
        grandTotal += personTotal
      }

      text += `${'═'.repeat(35)}\n`
      text += `GRAND TOTAL: Rs.${grandTotal}\n`
      text += `${'═'.repeat(35)}\n`

      setWholeText(text)
    }
  }, [mode, date, people, year, month])

  useEffect(() => { generatePreview() }, [generatePreview])

  // Build plain text for single day sharing
  const buildDayText = () => {
    const d = new Date(date + 'T00:00:00')
    const dayName = d.toLocaleDateString('en-IN', { weekday: 'long' })
    const dateLabel = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

    let text = `--- Daily Collection ---\n`
    text += `${dayName}, ${dateLabel}\n`
    text += `${'─'.repeat(32)}\n`
    text += `Name            | Amount\n`
    text += `${'─'.repeat(32)}\n`
    dayRows.forEach((r) => {
      const name = r.name.padEnd(16, ' ').slice(0, 16)
      if (r.status === 'paid') {
        text += `${name}| Rs.${r.amount}\n`
      } else {
        text += `${name}| --DUE--\n`
      }
    })
    text += `${'─'.repeat(32)}\n`
    const paid = dayRows.filter(r => r.status === 'paid').length
    text += `Collected: ${paid}/${dayRows.length}\n`
    text += `TOTAL: Rs.${dayTotal}\n`
    text += `${'─'.repeat(32)}\n`
    return text
  }

  const handleShare = async () => {
    const text = mode === 'day' ? buildDayText() : wholeText
    if (!text) return
    if (navigator.share) {
      try { await navigator.share({ text }) } catch {}
    } else {
      await navigator.clipboard.writeText(text)
      setToast('Copied to clipboard')
      setTimeout(() => setToast(''), 2500)
    }
  }

  const prevDay = () => {
    const d = new Date(date)
    d.setDate(d.getDate() - 1)
    setDate(formatDate(d))
  }

  const nextDay = () => {
    const d = new Date(date)
    d.setDate(d.getDate() + 1)
    setDate(formatDate(d))
  }

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1) }
    else setMonth(month - 1)
  }

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1) }
    else setMonth(month + 1)
  }

  const dateObj = new Date(date + 'T00:00:00')
  const dayName = dateObj.toLocaleDateString('en-IN', { weekday: 'long' })
  const dateLabel = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const paidCount = dayRows.filter(r => r.status === 'paid').length

  return (
    <div>
      {/* Toggle */}
      <div className="share-toggle">
        <button
          className={mode === 'day' ? 'active' : ''}
          onClick={() => setMode('day')}
        >
          Share Daily Collection
        </button>
        <button
          className={mode === 'whole' ? 'active' : ''}
          onClick={() => setMode('whole')}
        >
          Share Whole Month
        </button>
      </div>

      {/* Day Nav (day mode) */}
      {mode === 'day' && (
        <div className="date-nav" style={{margin:'8px 16px'}}>
          <button className="date-nav-btn" onClick={prevDay}>
            <i className="fa-solid fa-chevron-left"></i>
          </button>
          <div className="date-nav-center">
            <i className="fa-solid fa-calendar-days date-nav-icon"></i>
            <div className="date-nav-text">
              <span className="date-nav-day">{dayName}</span>
              <span className="date-nav-full">{dateLabel}</span>
            </div>
            {date !== formatDate(new Date()) && (
              <button className="date-nav-today" onClick={() => setDate(formatDate(new Date()))}>
                Today
              </button>
            )}
          </div>
          <button className="date-nav-btn" onClick={nextDay}>
            <i className="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      )}

      {/* Month Nav (whole mode) */}
      {mode === 'whole' && (
        <div className="month-nav">
          <button onClick={prevMonth}>
            <i className="fa-solid fa-chevron-left"></i>
          </button>
          <span className="month-label">{MONTH_NAMES[month]} {year}</span>
          <button onClick={nextMonth}>
            <i className="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      )}

      {/* Preview */}
      <div style={{padding:'0 16px'}}>
        <div style={{fontSize:18,fontWeight:800,marginBottom:4}}>Preview</div>
        <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8}}>
          Share the data in text table
        </div>
      </div>

      {mode === 'day' ? (
        <div className="preview-box preview-two-col">
          <div className="preview-col-header">
            Daily Collection &mdash; {dateLabel}
          </div>
          <div className="preview-columns">
            <div className="preview-col" style={{gridColumn: dayRows.length <= 8 ? '1 / -1' : undefined}}>
              <div className="preview-col-row preview-col-row-head">
                <span>Name</span><span>Amount</span>
              </div>
              {(dayRows.length <= 8 ? dayRows : dayRows.slice(0, Math.ceil(dayRows.length / 2))).map((r, i) => (
                <div key={i} className={`preview-col-row ${r.status}`}>
                  <span>{r.name}</span>
                  <span>
                    {r.status === 'paid' ? <>Rs.{r.amount}</> : <span style={{color:'var(--danger)'}}>DUE</span>}
                  </span>
                </div>
              ))}
            </div>
            {dayRows.length > 8 && (
              <div className="preview-col">
                <div className="preview-col-row preview-col-row-head">
                  <span>Name</span><span>Amount</span>
                </div>
                {dayRows.slice(Math.ceil(dayRows.length / 2)).map((r, i) => (
                  <div key={i} className={`preview-col-row ${r.status}`}>
                    <span>{r.name}</span>
                    <span>
                      {r.status === 'paid' ? <>Rs.{r.amount}</> : <span style={{color:'var(--danger)'}}>DUE</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="preview-col-total">
            Collected: {paidCount}/{dayRows.length} &nbsp;&bull;&nbsp; Total: <strong>Rs.{dayTotal}</strong>
          </div>
        </div>
      ) : (
        <div className="preview-box">
          {wholeText || 'No data to show.'}
        </div>
      )}

      {/* Share Button */}
      <div className="share-actions">
        <button className="share-btn" onClick={handleShare}>
          <i className="fa-solid fa-share-from-square"></i>
          Share
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
