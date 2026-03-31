import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  // Verify this is called by Vercel Cron (not a random visitor)
  const authHeader = req.headers['authorization']
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    // Find unsent reminders that are due
    const now = new Date().toISOString()
    const { data: reminders, error: fetchErr } = await supabase
      .from('recruit_reminders')
      .select('*')
      .eq('sent', false)
      .lte('remind_at', now)
      .limit(50)

    if (fetchErr) throw fetchErr
    if (!reminders || reminders.length === 0) {
      return res.status(200).json({ message: 'No reminders due', count: 0 })
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY
    const FROM_EMAIL = process.env.FROM_EMAIL || 'RecruitFlow <noreply@gray-civil.com>'
    let sentCount = 0

    for (const reminder of reminders) {
      // Get event details for the email body
      let eventTitle = 'Recruiting Event'
      let eventDate = ''
      let eventDetails = ''

      if (reminder.event_id) {
        const { data: event } = await supabase
          .from('recruit_events')
          .select('*')
          .eq('id', reminder.event_id)
          .single()
        if (event) {
          eventTitle = event.title
          eventDate = formatDate(event.event_date)
          if (event.event_time) eventDate += ' at ' + formatTime(event.event_time)
          if (event.location) eventDetails += `Location: ${event.location}\n`
          if (event.description) eventDetails += `${event.description}\n`
        }
      } else if (reminder.candidate_id) {
        const { data: candidate } = await supabase
          .from('recruit_candidates')
          .select('*')
          .eq('id', reminder.candidate_id)
          .single()
        if (candidate) {
          if (reminder.event_source === 'interview') {
            eventTitle = `Interview: ${candidate.name}`
            eventDate = candidate.interview_date
              ? formatDateTime(candidate.interview_date)
              : 'Date TBD'
            eventDetails = `Position: ${candidate.position || 'Not specified'}\nPoint of Contact: ${candidate.poc || 'Not specified'}`
          } else if (reminder.event_source === 'offer_sent') {
            eventTitle = `Offer Sent: ${candidate.name}`
            eventDate = candidate.offer_sent_date
              ? formatDate(candidate.offer_sent_date)
              : 'Date TBD'
            eventDetails = `Position: ${candidate.position || 'Not specified'}`
          } else if (reminder.event_source === 'new_hire_start') {
            eventTitle = `New Hire Start: ${candidate.name}`
            eventDate = candidate.hire_start_date
              ? formatDate(candidate.hire_start_date)
              : 'Date TBD'
            eventDetails = `Position: ${candidate.position || 'Not specified'}`
          }
        }
      }

      const remindLabel = {
        'morning_of': 'Today',
        '1_day': 'Tomorrow',
        '2_days': 'In 2 days',
        '1_week': 'In 1 week',
      }[reminder.remind_before] || 'Upcoming'

      // Send email via Resend
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [reminder.recipient_email],
            subject: `Reminder: ${eventTitle} — ${remindLabel}`,
            html: buildEmailHtml({
              recipientName: reminder.recipient_name,
              eventTitle,
              eventDate,
              eventDetails,
              remindLabel,
            }),
          }),
        })

        if (emailRes.ok) {
          // Mark reminder as sent
          await supabase
            .from('recruit_reminders')
            .update({ sent: true, sent_at: new Date().toISOString() })
            .eq('id', reminder.id)
          sentCount++
        } else {
          const errBody = await emailRes.text()
          console.error(`Failed to send reminder ${reminder.id}:`, errBody)
        }
      } catch (emailErr) {
        console.error(`Error sending reminder ${reminder.id}:`, emailErr)
      }
    }

    return res.status(200).json({
      message: `Processed ${reminders.length} reminders, sent ${sentCount}`,
      count: sentCount,
    })
  } catch (err) {
    console.error('Cron error:', err)
    return res.status(500).json({ error: err.message })
  }
}

// ============================================================
// HELPERS
// ============================================================
function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function formatTime(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${h12}:${m} ${ampm}`
}

function formatDateTime(dtStr) {
  if (!dtStr) return ''
  if (dtStr.includes('T')) {
    const [date, time] = dtStr.split('T')
    return formatDate(date) + ' at ' + formatTime(time.substring(0, 5))
  }
  return formatDate(dtStr)
}

function buildEmailHtml({ recipientName, eventTitle, eventDate, eventDetails, remindLabel }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background: #F2F1ED; margin: 0; padding: 0;">
  <div style="max-width: 560px; margin: 0 auto; padding: 32px 20px;">
    <div style="background: #0D395A; border-radius: 12px 12px 0 0; padding: 24px 28px;">
      <h1 style="margin: 0; font-size: 20px; color: #FFFFFF; font-weight: 700;">RecruitFlow</h1>
      <p style="margin: 4px 0 0; font-size: 11px; color: #8BAABE; text-transform: uppercase; letter-spacing: 1.5px;">Gray Civil Recruiting</p>
    </div>
    <div style="background: #FFFFFF; padding: 28px; border: 1px solid #E5E3DC; border-top: none;">
      <p style="margin: 0 0 8px; font-size: 14px; color: #666;">
        ${recipientName ? `Hi ${recipientName},` : 'Hi,'}
      </p>
      <p style="margin: 0 0 20px; font-size: 14px; color: #666; line-height: 1.5;">
        This is a reminder for an upcoming recruiting event:
      </p>
      <div style="background: #F7F6F3; border-radius: 10px; padding: 18px 20px; border-left: 4px solid #D4967D; margin-bottom: 20px;">
        <div style="font-size: 10px; color: #D4967D; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">${remindLabel}</div>
        <div style="font-size: 18px; font-weight: 700; color: #0D395A; margin-bottom: 6px;">${eventTitle}</div>
        ${eventDate ? `<div style="font-size: 14px; color: #555; margin-bottom: 4px;">📅 ${eventDate}</div>` : ''}
        ${eventDetails ? `<div style="font-size: 13px; color: #777; white-space: pre-line; margin-top: 8px;">${eventDetails}</div>` : ''}
      </div>
      <p style="margin: 0; font-size: 12px; color: #AAA;">
        This reminder was set up in RecruitFlow. Visit <a href="https://recruit.gray-civil.com" style="color: #2B6CB0;">recruit.gray-civil.com</a> for details.
      </p>
    </div>
    <div style="background: #F7F6F3; border-radius: 0 0 12px 12px; padding: 14px 28px; border: 1px solid #E5E3DC; border-top: none;">
      <p style="margin: 0; font-size: 11px; color: #BBB; text-align: center;">Gray Civil Engineering · Austin, TX</p>
    </div>
  </div>
</body>
</html>`
}
