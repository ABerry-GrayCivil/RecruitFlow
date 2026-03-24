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
