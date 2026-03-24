export const STAGES = [
  { id: 'new_lead', label: 'New Lead', color: '#0D395A', icon: '🟢' },
  { id: 'interview_scheduled', label: 'Interview Scheduled', color: '#2B6CB0', icon: '📅' },
  { id: 'interview_completed', label: 'Interview Completed', color: '#6B5B95', icon: '✅' },
  { id: 'offer', label: 'Offer Extended', color: '#D4967D', icon: '📨' },
  { id: 'hired', label: 'Hired', color: '#0D6847', icon: '🎉' },
  { id: 'rejected', label: 'Not a Fit', color: '#B04A4A', icon: '✕' },
]

export const LEAD_SOURCES = {
  job_fair: { label: 'Job Fair', color: '#0D395A', bg: '#E8F0EC' },
  website: { label: 'Website', color: '#2B6CB0', bg: '#E8EFF8' },
  email: { label: 'Emailed Resume', color: '#6B5B95', bg: '#EEEAF4' },
  referral: { label: 'Referral', color: '#D4967D', bg: '#FAF0EB' },
}

export const JOB_FAIRS = ['UT Career Fair', 'A&M Career Fair', 'ACC Career Fair']
export const DEPARTMENTS = ['Admin', 'Engineering', 'Construction', 'CAD']
export const POST_INTERVIEW_STAGES = ['interview_completed', 'offer', 'hired', 'rejected']

const AVATAR_COLORS = ['#0D395A','#6B5B95','#2B6CB0','#D4967D','#3A8A8A','#8B635C','#5C6D8E','#7C6D54','#6A7B4A','#8E5B7A']

export function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase()
}

export function getAvatarColor(id) {
  if (!id) return AVATAR_COLORS[0]
  // Hash the UUID string to get a consistent index
  let hash = 0
  const str = typeof id === 'string' ? id : String(id)
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function daysSince(dateStr) {
  if (!dateStr) return null
  const diff = Math.floor((new Date() - new Date(dateStr)) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 30) return `${diff} days ago`
  if (diff < 60) return '1 month ago'
  return `${Math.floor(diff / 30)} months ago`
}

export function avgRating(ratings) {
  if (!ratings || ratings.length === 0) return null
  return (ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length).toFixed(1)
}

export function formatInterviewDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}
