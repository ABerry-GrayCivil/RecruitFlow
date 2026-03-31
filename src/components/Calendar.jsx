import { useState, useEffect, useCallback } from 'react'
import {
  fetchCalendarEvents, fetchEvents, createEvent, deleteEvent,
  createReminder, fetchReminders, deleteReminder,
} from '../lib/supabase'

const EVENT_TYPES = {
  career_fair: { label: 'Career Fair', color: '#0D6847', bg: '#E8F0EC', icon: '🏫' },
  interview: { label: 'Interview', color: '#2B6CB0', bg: '#E8EFF8', icon: '📅' },
  offer_sent: { label: 'Offer Sent', color: '#D4967D', bg: '#FAF0EB', icon: '📨' },
  offer_deadline: { label: 'Offer Deadline', color: '#B04A4A', bg: '#FDE8E8', icon: '⏳' },
  new_hire_start: { label: 'Start Date', color: '#0D395A', bg: '#E8F0EC', icon: '🎉' },
  custom: { label: 'Event', color: '#6B5B95', bg: '#EEEAF4', icon: '📌' },
}

const REMIND_OPTIONS = [
  { value: 'morning_of', label: 'Morning of' },
  { value: '1_day', label: '1 day before' },
  { value: '2_days', label: '2 days before' },
  { value: '1_week', label: '1 week before' },
  { value: '1_month', label: '1 month before' },
]

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getMonthDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()
  const days = []

  for (let i = firstDay - 1; i >= 0; i--) {
    days.push({ day: daysInPrevMonth - i, currentMonth: false, date: new Date(year, month - 1, daysInPrevMonth - i) })
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ day: i, currentMonth: true, date: new Date(year, month, i) })
  }
  const remaining = 42 - days.length
  for (let i = 1; i <= remaining; i++) {
    days.push({ day: i, currentMonth: false, date: new Date(year, month + 1, i) })
  }
  return days
}

function formatDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function formatTime12(time) {
  if (!time) return ''
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${h12}:${m} ${ampm}`
}

function computeRemindAt(eventDate, eventTime, remindBefore) {
  // eventTime could be '10:10', '10:10:00', or null
  let timeStr = eventTime || '09:00'
  // Normalize to HH:MM format
  if (timeStr.split(':').length > 2) {
    timeStr = timeStr.split(':').slice(0, 2).join(':')
  }
  const d = new Date(eventDate + 'T' + timeStr + ':00')
  if (isNaN(d.getTime())) {
    // Fallback if date is still invalid
    const fallback = new Date(eventDate + 'T09:00:00')
    fallback.setHours(8, 0, 0, 0)
    return fallback.toISOString()
  }
  switch (remindBefore) {
    case 'morning_of': d.setHours(8, 0, 0, 0); break
    case '1_day': d.setDate(d.getDate() - 1); d.setHours(8, 0, 0, 0); break
    case '2_days': d.setDate(d.getDate() - 2); d.setHours(8, 0, 0, 0); break
    case '1_week': d.setDate(d.getDate() - 7); d.setHours(8, 0, 0, 0); break
    case '1_month': d.setMonth(d.getMonth() - 1); d.setHours(8, 0, 0, 0); break
    default: break
  }
  return d.toISOString()
}

export default function Calendar({ user, userName }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [calView, setCalView] = useState('month')
  const [events, setEvents] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [eventReminders, setEventReminders] = useState([])

  const [eventForm, setEventForm] = useState({
    title: '', event_type: 'career_fair', event_date: '', event_time: '',
    end_date: '', end_time: '', location: '', description: '',
  })
  const [reminderForm, setReminderForm] = useState({
    recipient_email: '', recipient_name: '', remind_before: '1_day',
  })

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const startDate = formatDate(new Date(year, month - 1, 1))
  const endDate = formatDate(new Date(year, month + 2, 0))

  const loadEvents = useCallback(async () => {
    try {
      const data = await fetchCalendarEvents(startDate, endDate)
      setEvents(data)
    } catch (err) {
      console.error('Error loading calendar events:', err)
    }
  }, [startDate, endDate])

  useEffect(() => { loadEvents() }, [loadEvents])

  const loadEventReminders = async (event) => {
    try {
      if (event.source === 'manual') {
        const r = await fetchReminders(event.id, null)
        setEventReminders(r)
      } else if (event.candidateId) {
        const r = await fetchReminders(null, event.candidateId)
        setEventReminders(r.filter(rem => rem.event_source === event.type))
      } else {
        setEventReminders([])
      }
    } catch (err) {
      console.error('Error loading reminders:', err)
      setEventReminders([])
    }
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToday = () => setCurrentDate(new Date())

  const getEventsForDate = (dateStr) => events.filter(e => e.date === dateStr)
  const todayStr = formatDate(new Date())
  const monthDays = getMonthDays(year, month)

  // Agenda: all events in current month
  const agendaEvents = events.filter(e => {
    const d = e.date
    return d >= formatDate(new Date(year, month, 1)) && d <= formatDate(new Date(year, month + 1, 0))
  })

  const handleAddEvent = async () => {
    if (!eventForm.title || !eventForm.event_date || submitting) return
    setSubmitting(true)
    try {
      await createEvent({
        title: eventForm.title,
        event_type: eventForm.event_type,
        event_date: eventForm.event_date,
        event_time: eventForm.event_time || null,
        end_date: eventForm.end_date || null,
        end_time: eventForm.end_time || null,
        location: eventForm.location || null,
        description: eventForm.description || null,
        created_by: user.id,
        created_by_name: userName,
      })
      setEventForm({ title: '', event_type: 'career_fair', event_date: '', event_time: '', end_date: '', end_time: '', location: '', description: '' })
      setShowAddEvent(false)
      await loadEvents()
    } catch (err) {
      console.error('Error creating event:', err)
      alert('Error creating event: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteEvent = async (eventId) => {
    try {
      await deleteEvent(eventId)
      setSelectedEvent(null)
      await loadEvents()
    } catch (err) {
      console.error('Error deleting event:', err)
    }
  }

  const handleAddReminder = async () => {
    const emailsRaw = reminderForm.recipient_email.trim()
    if (!emailsRaw || !selectedEvent) {
      alert('Missing email or no event selected')
      return
    }
    const emails = emailsRaw.split(',').map(e => e.trim()).filter(e => e)
    if (emails.length === 0) return
    try {
      const eventDate = selectedEvent.date
      const eventTime = selectedEvent.time
      const remindAt = computeRemindAt(eventDate, eventTime, reminderForm.remind_before)
      for (const email of emails) {
        // Extract name from email if it's a gray-civil address (e.g., aberry@ → Adam Berry style)
        const namePart = email.split('@')[0] || ''
        await createReminder({
          event_id: selectedEvent.source === 'manual' ? selectedEvent.id : null,
          candidate_id: selectedEvent.candidateId || null,
          event_source: selectedEvent.source === 'manual' ? 'manual' : selectedEvent.type,
          recipient_email: email,
          recipient_name: namePart,
          remind_before: reminderForm.remind_before,
          remind_at: remindAt,
          created_by: user.id,
        })
      }
      setReminderForm({ recipient_email: '', recipient_name: '', remind_before: '1_day' })
      await loadEventReminders(selectedEvent)
    } catch (err) {
      console.error('Error adding reminder:', err)
      alert('Error adding reminder: ' + (err.message || JSON.stringify(err)))
    }
  }

  const handleDeleteReminder = async (reminderId) => {
    try {
      await deleteReminder(reminderId)
      if (selectedEvent) await loadEventReminders(selectedEvent)
    } catch (err) {
      console.error('Error deleting reminder:', err)
    }
  }

  const openEventDetail = async (event) => {
    setSelectedEvent(event)
    await loadEventReminders(event)
  }

  const inputStyle = { padding: '10px 14px', borderRadius: 8, border: '1px solid #D5D3CC', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }
  const btnSecondary = { padding: '8px 20px', borderRadius: 8, border: '1px solid #D5D3CC', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#666' }
  const btnPrimary = (color) => ({ padding: '8px 20px', borderRadius: 8, border: 'none', background: color, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' })

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Calendar Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h2 style={{ margin: 0, fontFamily: "'Fraunces', serif", fontSize: 22, color: '#0D395A' }}>Calendar</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={prevMonth} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #D5D3CC', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#666' }}>‹</button>
            <button onClick={goToday} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #D5D3CC', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#0D395A' }}>Today</button>
            <button onClick={nextMonth} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #D5D3CC', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#666' }}>›</button>
          </div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#2C2C2C' }}>{MONTHS[month]} {year}</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '3px', display: 'flex', gap: 2, border: '1px solid #D5D3CC' }}>
            <button onClick={() => setCalView('month')} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: calView === 'month' ? '#0D395A' : 'transparent', color: calView === 'month' ? '#fff' : '#666', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Month</button>
            <button onClick={() => setCalView('agenda')} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: calView === 'agenda' ? '#0D395A' : 'transparent', color: calView === 'agenda' ? '#fff' : '#666', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Agenda</button>
          </div>
          <button onClick={() => { setShowAddEvent(true); setEventForm(prev => ({ ...prev, event_date: formatDate(new Date()) })) }} style={{ ...btnPrimary('#0D395A'), display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Add Event
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {Object.entries(EVENT_TYPES).map(([key, t]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#666' }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: t.color }} />
            <span>{t.label}</span>
          </div>
        ))}
      </div>

      {/* Month View */}
      {calView === 'month' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E3DC', overflow: 'hidden' }}>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #E5E3DC' }}>
            {DAYS.map(d => (
              <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>{d}</div>
            ))}
          </div>
          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {monthDays.map((d, idx) => {
              const dateStr = formatDate(d.date)
              const dayEvents = getEventsForDate(dateStr)
              const isToday = dateStr === todayStr
              return (
                <div key={idx}
                  onClick={() => { setSelectedDate(dateStr); setEventForm(prev => ({ ...prev, event_date: dateStr })) }}
                  style={{
                    minHeight: 90, padding: '4px 6px', borderRight: (idx + 1) % 7 !== 0 ? '1px solid #F0EFEB' : 'none',
                    borderBottom: idx < 35 ? '1px solid #F0EFEB' : 'none',
                    background: isToday ? '#EDF2F7' : d.currentMonth ? '#fff' : '#FAFAF8',
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!isToday) e.currentTarget.style.background = '#F7F6F3' }}
                  onMouseLeave={e => { if (!isToday) e.currentTarget.style.background = d.currentMonth ? '#fff' : '#FAFAF8' }}>
                  <div style={{ fontSize: 12, fontWeight: isToday ? 700 : d.currentMonth ? 500 : 400, color: isToday ? '#0D395A' : d.currentMonth ? '#2C2C2C' : '#CCC', marginBottom: 4 }}>
                    {isToday ? <span style={{ background: '#0D395A', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>{d.day}</span> : d.day}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {dayEvents.slice(0, 3).map((evt, i) => {
                      const t = EVENT_TYPES[evt.type] || EVENT_TYPES.custom
                      return (
                        <div key={i} onClick={e => { e.stopPropagation(); openEventDetail(evt) }}
                          style={{ padding: '1px 4px', borderRadius: 3, background: t.bg, color: t.color, fontSize: 9, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', borderLeft: `2px solid ${t.color}` }}>
                          {evt.time && <span style={{ marginRight: 3 }}>{formatTime12(evt.time).replace(' ', '')}</span>}
                          {evt.title}
                        </div>
                      )
                    })}
                    {dayEvents.length > 3 && (
                      <div style={{ fontSize: 9, color: '#999', paddingLeft: 4 }}>+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Agenda View */}
      {calView === 'agenda' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E3DC', overflow: 'hidden' }}>
          {agendaEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#BBB' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#888' }}>No events this month</div>
            </div>
          ) : (
            <div>
              {agendaEvents.map((evt, i) => {
                const t = EVENT_TYPES[evt.type] || EVENT_TYPES.custom
                const d = new Date(evt.date + 'T12:00:00')
                const prevDate = i > 0 ? agendaEvents[i - 1].date : null
                const showDateHeader = evt.date !== prevDate
                return (
                  <div key={evt.id}>
                    {showDateHeader && (
                      <div style={{ padding: '10px 16px', background: '#F7F6F3', borderBottom: '1px solid #E5E3DC', fontSize: 12, fontWeight: 700, color: '#0D395A' }}>
                        {d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                        {evt.date === todayStr && <span style={{ marginLeft: 8, padding: '1px 8px', borderRadius: 10, background: '#0D395A', color: '#fff', fontSize: 9 }}>TODAY</span>}
                      </div>
                    )}
                    <div onClick={() => openEventDetail(evt)}
                      style={{ padding: '12px 16px', borderBottom: '1px solid #F0EFEB', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F7F6F3'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#2C2C2C' }}>{evt.title}</div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                          {evt.time && formatTime12(evt.time)}
                          {evt.location && (evt.time ? ' · ' : '') + evt.location}
                          {evt.source === 'auto' && (evt.time || evt.location ? ' · ' : '') + 'Auto-populated'}
                        </div>
                      </div>
                      <span style={{ padding: '2px 8px', borderRadius: 6, background: t.bg, color: t.color, fontSize: 10, fontWeight: 600, flexShrink: 0 }}>{t.icon} {t.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Add Event Modal */}
      {showAddEvent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 480, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 18px', fontFamily: "'Fraunces', serif", fontSize: 18, color: '#0D395A' }}>Add Event</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              <select value={eventForm.event_type} onChange={e => setEventForm(prev => ({ ...prev, event_type: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="career_fair">🏫 Career Fair</option>
                <option value="offer_deadline">⏳ Offer Deadline</option>
                <option value="new_hire_start">🎉 New Hire Start Date</option>
                <option value="custom">📌 Custom Event</option>
              </select>
              <input placeholder="Event Title *" value={eventForm.title} onChange={e => setEventForm(prev => ({ ...prev, title: e.target.value }))} style={inputStyle} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 10, color: '#888', fontWeight: 600, marginBottom: 4, display: 'block' }}>Start Date *</label>
                  <input type="date" value={eventForm.event_date} onChange={e => setEventForm(prev => ({ ...prev, event_date: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: '#888', fontWeight: 600, marginBottom: 4, display: 'block' }}>Start Time</label>
                  <input type="time" value={eventForm.event_time} onChange={e => setEventForm(prev => ({ ...prev, event_time: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 10, color: '#888', fontWeight: 600, marginBottom: 4, display: 'block' }}>End Date</label>
                  <input type="date" value={eventForm.end_date} onChange={e => setEventForm(prev => ({ ...prev, end_date: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: '#888', fontWeight: 600, marginBottom: 4, display: 'block' }}>End Time</label>
                  <input type="time" value={eventForm.end_time} onChange={e => setEventForm(prev => ({ ...prev, end_time: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }} />
                </div>
              </div>
              <input placeholder="Location" value={eventForm.location} onChange={e => setEventForm(prev => ({ ...prev, location: e.target.value }))} style={inputStyle} />
              <textarea placeholder="Description" value={eventForm.description} onChange={e => setEventForm(prev => ({ ...prev, description: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddEvent(false)} style={btnSecondary}>Cancel</button>
              <button onClick={handleAddEvent} disabled={submitting} style={{ ...btnPrimary('#0D395A'), opacity: submitting ? 0.5 : 1 }}>{submitting ? 'Adding...' : 'Add Event'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={() => setSelectedEvent(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 28, width: 480, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            {(() => {
              const t = EVENT_TYPES[selectedEvent.type] || EVENT_TYPES.custom
              const d = new Date(selectedEvent.date + 'T12:00:00')
              return (<>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{t.icon}</div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontFamily: "'Fraunces', serif", color: '#0D395A' }}>{selectedEvent.title}</h3>
                    <span style={{ padding: '2px 8px', borderRadius: 6, background: t.bg, color: t.color, fontSize: 10, fontWeight: 600 }}>{t.label}</span>
                    {selectedEvent.source === 'auto' && <span style={{ marginLeft: 6, padding: '2px 8px', borderRadius: 6, background: '#F7F6F3', color: '#999', fontSize: 10, fontWeight: 500 }}>Auto-populated</span>}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span style={{ fontSize: 15, width: 22, textAlign: 'center' }}>📅</span>
                    <div>
                      <div style={{ fontSize: 10, color: '#888', fontWeight: 500 }}>Date</div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>
                        {d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                        {selectedEvent.time && ' at ' + formatTime12(selectedEvent.time)}
                      </div>
                    </div>
                  </div>
                  {selectedEvent.endDate && (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <span style={{ fontSize: 15, width: 22, textAlign: 'center' }}>🏁</span>
                      <div>
                        <div style={{ fontSize: 10, color: '#888', fontWeight: 500 }}>End</div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>
                          {new Date(selectedEvent.endDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                          {selectedEvent.endTime && ' at ' + formatTime12(selectedEvent.endTime)}
                        </div>
                      </div>
                    </div>
                  )}
                  {selectedEvent.location && (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <span style={{ fontSize: 15, width: 22, textAlign: 'center' }}>📍</span>
                      <div><div style={{ fontSize: 10, color: '#888', fontWeight: 500 }}>Location</div><div style={{ fontSize: 14, fontWeight: 500 }}>{selectedEvent.location}</div></div>
                    </div>
                  )}
                  {selectedEvent.description && (
                    <div style={{ padding: 12, borderRadius: 10, background: '#F7F6F3', border: '1px solid #E5E3DC', fontSize: 13, lineHeight: 1.6, color: '#444' }}>{selectedEvent.description}</div>
                  )}
                  {selectedEvent.poc && (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <span style={{ fontSize: 15, width: 22, textAlign: 'center' }}>👤</span>
                      <div><div style={{ fontSize: 10, color: '#888', fontWeight: 500 }}>Point of Contact</div><div style={{ fontSize: 14, fontWeight: 500 }}>{selectedEvent.poc}</div></div>
                    </div>
                  )}
                </div>

                {/* Reminders */}
                <div style={{ borderTop: '1px solid #E5E3DC', paddingTop: 16 }}>
                  <div style={{ fontSize: 10, color: '#888', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '1px' }}>Email Reminders ({eventReminders.length})</div>

                  {eventReminders.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                      {eventReminders.map(r => (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 8, background: r.sent ? '#E8F0EC' : '#F7F6F3', border: '1px solid #E5E3DC' }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#2C2C2C' }}>{r.recipient_name || r.recipient_email}</div>
                            <div style={{ fontSize: 10, color: '#888' }}>
                              {REMIND_OPTIONS.find(o => o.value === r.remind_before)?.label || r.remind_before}
                              {r.sent && <span style={{ marginLeft: 6, color: '#0D6847', fontWeight: 600 }}>✓ Sent</span>}
                            </div>
                          </div>
                          <button onClick={() => handleDeleteReminder(r.id)} style={{ background: 'none', border: 'none', color: '#B04A4A', fontSize: 12, cursor: 'pointer', padding: '2px 6px' }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add reminder form */}
                  <div style={{ padding: 12, borderRadius: 10, background: '#F7F6F3', border: '1px solid #E5E3DC' }}>
                    <div style={{ fontSize: 11, color: '#888', fontWeight: 500, marginBottom: 8 }}>Add a reminder</div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <input placeholder="Emails (comma-separated) *" value={reminderForm.recipient_email} onChange={e => setReminderForm(prev => ({ ...prev, recipient_email: e.target.value }))} style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} />
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <select value={reminderForm.remind_before} onChange={e => setReminderForm(prev => ({ ...prev, remind_before: e.target.value }))} style={{ ...inputStyle, padding: '8px 10px', fontSize: 12, cursor: 'pointer', flex: 1 }}>
                          {REMIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <button onClick={handleAddReminder} disabled={!reminderForm.recipient_email.trim()} style={{ ...btnPrimary('#0D395A'), padding: '8px 14px', fontSize: 12, opacity: reminderForm.recipient_email.trim() ? 1 : 0.4 }}>Add</button>
                      </div>
                      <div style={{ fontSize: 10, color: '#AAA', fontStyle: 'italic' }}>e.g. aberry@gray-civil.com, nkelly@gray-civil.com</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                  {selectedEvent.source === 'manual' && (
                    <button onClick={() => handleDeleteEvent(selectedEvent.id)} style={{ ...btnSecondary, color: '#B04A4A', borderColor: '#B04A4A40' }}>Delete Event</button>
                  )}
                  <button onClick={() => setSelectedEvent(null)} style={btnSecondary}>Close</button>
                </div>
              </>)
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
