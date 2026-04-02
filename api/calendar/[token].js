import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const { token } = req.query

  if (!token) {
    return res.status(400).send('Missing token')
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    // Verify the token is valid
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('recruit_calendar_tokens')
      .select('id')
      .eq('token', token)
      .single()

    if (tokenErr || !tokenRow) {
      return res.status(403).send('Invalid calendar token')
    }

    // Fetch all manual events (career fairs, deadlines, custom, new hire starts)
    const { data: events, error: evtErr } = await supabase
      .from('recruit_events')
      .select('*')
      .order('event_date', { ascending: true })
    if (evtErr) throw evtErr

    // Fetch all candidates with interview dates
    const { data: interviews, error: intErr } = await supabase
      .from('recruit_candidates')
      .select('id, name, position, interview_date, poc, stage')
      .not('interview_date', 'is', null)
    if (intErr) throw intErr

    // Fetch candidates with offer_sent_date
    const { data: offers, error: offErr } = await supabase
      .from('recruit_candidates')
      .select('id, name, position, offer_sent_date, poc, stage')
      .not('offer_sent_date', 'is', null)
    if (offErr) throw offErr

    // Fetch candidates with hire_start_date
    const { data: hires, error: hireErr } = await supabase
      .from('recruit_candidates')
      .select('id, name, position, hire_start_date, poc, stage')
      .not('hire_start_date', 'is', null)
    if (hireErr) throw hireErr

    // Build iCal
    const now = formatICalDate(new Date())
    let ical = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Gray Civil//RecruitFlow//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:RecruitFlow - Recruiting Calendar',
      'X-WR-TIMEZONE:America/Chicago',
    ]

    // Manual events
    for (const evt of events) {
      const uid = `recruitflow-event-${evt.id}@gray-civil.com`
      const dtStart = formatICalDateFromParts(evt.event_date, evt.event_time)
      const dtEnd = evt.end_date
        ? formatICalDateFromParts(evt.end_date, evt.end_time)
        : null

      const typeLabels = {
        career_fair: '🏫 Career Fair',
        offer_deadline: '⏳ Offer Deadline',
        new_hire_start: '🎉 Start Date',
        custom: '📌 Event',
      }
      const prefix = typeLabels[evt.event_type] || 'Event'
      const summary = `${prefix}: ${evt.title}`

      ical.push('BEGIN:VEVENT')
      ical.push(`UID:${uid}`)
      ical.push(`DTSTAMP:${now}`)

      if (evt.event_time) {
        ical.push(`DTSTART;TZID=America/Chicago:${dtStart}`)
        if (dtEnd) ical.push(`DTEND;TZID=America/Chicago:${dtEnd}`)
      } else {
        // All-day event
        ical.push(`DTSTART;VALUE=DATE:${evt.event_date.replace(/-/g, '')}`)
        if (evt.end_date) {
          // iCal all-day end date is exclusive, so add 1 day
          const end = new Date(evt.end_date + 'T12:00:00')
          end.setDate(end.getDate() + 1)
          ical.push(`DTEND;VALUE=DATE:${formatICalDateOnly(end)}`)
        }
      }

      ical.push(`SUMMARY:${escapeIcal(summary)}`)
      if (evt.location) ical.push(`LOCATION:${escapeIcal(evt.location)}`)
      if (evt.description) ical.push(`DESCRIPTION:${escapeIcal(evt.description)}`)
      ical.push('END:VEVENT')
    }

    // Interviews
    for (const c of interviews) {
      const uid = `recruitflow-interview-${c.id}@gray-civil.com`
      let dtStart
      if (c.interview_date.includes('T')) {
        const [date, time] = c.interview_date.split('T')
        dtStart = formatICalDateFromParts(date, time.substring(0, 5))
        ical.push('BEGIN:VEVENT')
        ical.push(`UID:${uid}`)
        ical.push(`DTSTAMP:${now}`)
        ical.push(`DTSTART;TZID=America/Chicago:${dtStart}`)
        // Default 1 hour duration
        const endDate = new Date(`${date}T${time.substring(0, 5)}:00`)
        endDate.setHours(endDate.getHours() + 1)
        ical.push(`DTEND;TZID=America/Chicago:${formatICalDate(endDate)}`)
      } else {
        ical.push('BEGIN:VEVENT')
        ical.push(`UID:${uid}`)
        ical.push(`DTSTAMP:${now}`)
        ical.push(`DTSTART;VALUE=DATE:${c.interview_date.replace(/-/g, '')}`)
      }
      ical.push(`SUMMARY:${escapeIcal(`📅 Interview: ${c.name}`)}`)
      const desc = [`Position: ${c.position || 'Not specified'}`]
      if (c.poc) desc.push(`Point of Contact: ${c.poc}`)
      ical.push(`DESCRIPTION:${escapeIcal(desc.join('\\n'))}`)
      ical.push('END:VEVENT')
    }

    // Offers sent
    for (const c of offers) {
      const uid = `recruitflow-offer-${c.id}@gray-civil.com`
      ical.push('BEGIN:VEVENT')
      ical.push(`UID:${uid}`)
      ical.push(`DTSTAMP:${now}`)
      ical.push(`DTSTART;VALUE=DATE:${c.offer_sent_date.replace(/-/g, '')}`)
      ical.push(`SUMMARY:${escapeIcal(`📨 Offer Sent: ${c.name}`)}`)
      ical.push(`DESCRIPTION:${escapeIcal(`Position: ${c.position || 'Not specified'}`)}`)
      ical.push('END:VEVENT')
    }

    // Hire start dates
    for (const c of hires) {
      const uid = `recruitflow-hire-${c.id}@gray-civil.com`
      ical.push('BEGIN:VEVENT')
      ical.push(`UID:${uid}`)
      ical.push(`DTSTAMP:${now}`)
      ical.push(`DTSTART;VALUE=DATE:${c.hire_start_date.replace(/-/g, '')}`)
      ical.push(`SUMMARY:${escapeIcal(`🎉 Start Date: ${c.name}`)}`)
      ical.push(`DESCRIPTION:${escapeIcal(`Position: ${c.position || 'Not specified'}`)}`)
      ical.push('END:VEVENT')
    }

    ical.push('END:VCALENDAR')

    const icalString = ical.join('\r\n')

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', 'inline; filename="recruitflow.ics"')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    return res.status(200).send(icalString)

  } catch (err) {
    console.error('Calendar feed error:', err)
    return res.status(500).send('Error generating calendar feed')
  }
}

// ============================================================
// HELPERS
// ============================================================

function formatICalDate(d) {
  return d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') + 'T' +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    String(d.getSeconds()).padStart(2, '0')
}

function formatICalDateOnly(d) {
  return d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0')
}

function formatICalDateFromParts(dateStr, timeStr) {
  // dateStr: '2026-03-30', timeStr: '10:00' or null
  const datePart = dateStr.replace(/-/g, '')
  if (!timeStr) return datePart
  const timePart = timeStr.replace(/:/g, '').padEnd(6, '0') // '1000' -> '100000'
  return datePart + 'T' + timePart
}

function escapeIcal(str) {
  if (!str) return ''
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}
