import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Auth helpers
export async function signInWithAzure() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'openid profile email',
      redirectTo: window.location.origin,
    },
  })
  if (error) console.error('Login error:', error)
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) console.error('Logout error:', error)
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export function getUserDisplayName(user) {
  if (!user) return 'Unknown'
  return user.user_metadata?.full_name
    || user.user_metadata?.name
    || user.email?.split('@')[0]
    || 'Unknown'
}

// ============================================================
// CANDIDATES
// ============================================================
export async function fetchCandidates() {
  const { data, error } = await supabase
    .from('recruit_candidates')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createCandidate(candidate) {
  const { data, error } = await supabase
    .from('recruit_candidates')
    .insert(candidate)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCandidate(id, updates) {
  const { data, error } = await supabase
    .from('recruit_candidates')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCandidate(id) {
  const { error } = await supabase
    .from('recruit_candidates')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ============================================================
// PURSUITS
// ============================================================
export async function fetchPursuits() {
  const { data, error } = await supabase
    .from('recruit_pursuits')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createPursuit(pursuit) {
  const { data, error } = await supabase
    .from('recruit_pursuits')
    .insert(pursuit)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deletePursuit(id) {
  const { error } = await supabase
    .from('recruit_pursuits')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ============================================================
// NOTES
// ============================================================
export async function fetchNotes(candidateId, pursuitId) {
  let query = supabase
    .from('recruit_notes')
    .select('*')
    .order('created_at', { ascending: false })

  if (candidateId) query = query.eq('candidate_id', candidateId)
  if (pursuitId) query = query.eq('pursuit_id', pursuitId)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createNote({ candidateId, pursuitId, text, authorName, authorId }) {
  const { data, error } = await supabase
    .from('recruit_notes')
    .insert({
      candidate_id: candidateId || null,
      pursuit_id: pursuitId || null,
      text,
      author_name: authorName,
      author_id: authorId,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================
// OUTREACH
// ============================================================
export async function fetchOutreach(pursuitId) {
  const { data, error } = await supabase
    .from('recruit_outreach')
    .select('*')
    .eq('pursuit_id', pursuitId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createOutreach({ pursuitId, contactType, note, authorName, authorId }) {
  const { data, error } = await supabase
    .from('recruit_outreach')
    .insert({
      pursuit_id: pursuitId,
      contact_type: contactType,
      note,
      author_name: authorName,
      author_id: authorId,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================
// RATINGS
// ============================================================
export async function fetchRatings(candidateId) {
  const { data, error } = await supabase
    .from('recruit_ratings')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function upsertRating({ candidateId, score, authorName, authorId }) {
  const { data, error } = await supabase
    .from('recruit_ratings')
    .upsert(
      {
        candidate_id: candidateId,
        score,
        author_name: authorName,
        author_id: authorId,
      },
      { onConflict: 'candidate_id,author_id' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================
// FILES (Storage)
// ============================================================
export async function uploadFile(candidateId, file, userId) {
  const filePath = `${candidateId}/${Date.now()}_${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('recruit-files')
    .upload(filePath, file)
  if (uploadError) throw uploadError

  const { data, error: dbError } = await supabase
    .from('recruit_files')
    .insert({
      candidate_id: candidateId,
      file_name: file.name,
      file_path: filePath,
      file_type: file.type,
      file_size: file.size,
      uploaded_by: userId,
    })
    .select()
    .single()
  if (dbError) throw dbError
  return data
}

export async function fetchFiles(candidateId) {
  const { data, error } = await supabase
    .from('recruit_files')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getFileUrl(filePath) {
  const { data } = await supabase.storage
    .from('recruit-files')
    .createSignedUrl(filePath, 3600) // 1 hour
  return data?.signedUrl
}

// ============================================================
// PHOTOS
// ============================================================
export async function uploadPhoto(entityId, file) {
  const filePath = `${entityId}/${Date.now()}_photo.${file.name.split('.').pop()}`

  const { error } = await supabase.storage
    .from('recruit-photos')
    .upload(filePath, file)
  if (error) throw error

  const { data } = supabase.storage
    .from('recruit-photos')
    .getPublicUrl(filePath)

  return data.publicUrl
}

// ============================================================
// ADD THESE FUNCTIONS TO src/lib/supabase.js
// ============================================================

// ============================================================
// EVENTS
// ============================================================
export async function fetchEvents() {
  const { data, error } = await supabase
    .from('recruit_events')
    .select('*')
    .order('event_date', { ascending: true })
  if (error) throw error
  return data
}

export async function createEvent(event) {
  const { data, error } = await supabase
    .from('recruit_events')
    .insert(event)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateEvent(id, updates) {
  const { data, error } = await supabase
    .from('recruit_events')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteEvent(id) {
  const { error } = await supabase
    .from('recruit_events')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ============================================================
// REMINDERS
// ============================================================
export async function fetchReminders(eventId, candidateId) {
  let query = supabase
    .from('recruit_reminders')
    .select('*')
    .order('remind_at', { ascending: true })

  if (eventId) query = query.eq('event_id', eventId)
  if (candidateId) query = query.eq('candidate_id', candidateId)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createReminder(reminder) {
  const { data, error } = await supabase
    .from('recruit_reminders')
    .insert(reminder)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteReminder(id) {
  const { error } = await supabase
    .from('recruit_reminders')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ============================================================
// CALENDAR HELPERS — fetch all events for a date range
// Combines manual events + auto-populated from candidates
// ============================================================
export async function fetchCalendarEvents(startDate, endDate) {
  // 1. Manual events in range
  const { data: manualEvents, error: evtErr } = await supabase
    .from('recruit_events')
    .select('*')
    .gte('event_date', startDate)
    .lte('event_date', endDate)
    .order('event_date', { ascending: true })
  if (evtErr) throw evtErr

  // 2. Candidates with interview dates in range
  const { data: interviews, error: intErr } = await supabase
    .from('recruit_candidates')
    .select('id, name, position, interview_date, poc, stage')
    .not('interview_date', 'is', null)
    .gte('interview_date', startDate)
    .lte('interview_date', endDate + 'T23:59:59')
  if (intErr) throw intErr

  // 3. Candidates with offer_sent_date in range
  const { data: offers, error: offErr } = await supabase
    .from('recruit_candidates')
    .select('id, name, position, offer_sent_date, poc, stage')
    .not('offer_sent_date', 'is', null)
    .gte('offer_sent_date', startDate)
    .lte('offer_sent_date', endDate)
  if (offErr) throw offErr

  // 4. Candidates with hire_start_date in range
  const { data: hires, error: hireErr } = await supabase
    .from('recruit_candidates')
    .select('id, name, position, hire_start_date, poc, stage')
    .not('hire_start_date', 'is', null)
    .gte('hire_start_date', startDate)
    .lte('hire_start_date', endDate)
  if (hireErr) throw hireErr

  // Normalize into a unified format
  const allEvents = [
    ...manualEvents.map(e => ({
      id: e.id,
      title: e.title,
      type: e.event_type,
      date: e.event_date,
      time: e.event_time,
      endDate: e.end_date,
      endTime: e.end_time,
      location: e.location,
      description: e.description,
      candidateId: e.candidate_id,
      source: 'manual',
      createdBy: e.created_by_name,
    })),
    ...interviews.map(c => ({
      id: 'interview-' + c.id,
      title: `Interview: ${c.name}`,
      type: 'interview',
      date: c.interview_date.split('T')[0],
      time: c.interview_date.includes('T') ? c.interview_date.split('T')[1]?.substring(0, 5) : null,
      candidateId: c.id,
      candidateName: c.name,
      position: c.position,
      poc: c.poc,
      source: 'auto',
    })),
    ...offers.map(c => ({
      id: 'offer-' + c.id,
      title: `Offer Sent: ${c.name}`,
      type: 'offer_sent',
      date: c.offer_sent_date,
      candidateId: c.id,
      candidateName: c.name,
      position: c.position,
      source: 'auto',
    })),
    ...hires.map(c => ({
      id: 'hire-' + c.id,
      title: `Start Date: ${c.name}`,
      type: 'new_hire_start',
      date: c.hire_start_date,
      candidateId: c.id,
      candidateName: c.name,
      position: c.position,
      source: 'auto',
    })),
  ]

  return allEvents.sort((a, b) => {
    const da = a.date + (a.time || '99:99')
    const db = b.date + (b.time || '99:99')
    return da.localeCompare(db)
  })
}
