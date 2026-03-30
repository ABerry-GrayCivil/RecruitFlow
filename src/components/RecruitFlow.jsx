import { useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchCandidates, createCandidate, updateCandidate, deleteCandidate as apiDeleteCandidate,
  fetchPursuits, createPursuit, deletePursuit as apiDeletePursuit,
  fetchNotes, createNote, fetchOutreach, createOutreach,
  fetchRatings, upsertRating, uploadFile, fetchFiles, getFileUrl,
  uploadPhoto,
} from '../lib/supabase'
import {
  STAGES, LEAD_SOURCES, JOB_FAIRS, DEPARTMENTS, POST_INTERVIEW_STAGES,
  getInitials, getAvatarColor, daysSince, avgRating, formatInterviewDate,
} from '../lib/constants'

export default function RecruitFlow({ user, userName, onSignOut }) {
  const [candidates, setCandidates] = useState([])
  const [pursuits, setPursuits] = useState([])
  const [mainTab, setMainTab] = useState('pipeline')
  const [view, setView] = useState('board')
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const [selectedPursuit, setSelectedPursuit] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addLeadSource, setAddLeadSource] = useState('job_fair')
  const [filterSource, setFilterSource] = useState('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [dragOverStage, setDragOverStage] = useState(null)
  const [dragCandidate, setDragCandidate] = useState(null)
  const [showAddPursuit, setShowAddPursuit] = useState(false)
  const [showAddOutreach, setShowAddOutreach] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [outreachForm, setOutreachForm] = useState({ type: 'Phone call', note: '' })
  const [candidateNoteText, setCandidateNoteText] = useState('')
  const [pursuitNoteText, setPursuitNoteText] = useState('')
  const [hoverStar, setHoverStar] = useState(0)
  const [pendingRating, setPendingRating] = useState(0)
  const [scheduleModal, setScheduleModal] = useState(null)
  const [scheduleDateTime, setScheduleDateTime] = useState('')
  const [photos, setPhotos] = useState({})
  const [pendingFile, setPendingFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Detail drawer data
  const [drawerNotes, setDrawerNotes] = useState([])
  const [drawerOutreach, setDrawerOutreach] = useState([])
  const [drawerRatings, setDrawerRatings] = useState([])
  const [drawerFiles, setDrawerFiles] = useState([])

  const [quickForm, setQuickForm] = useState({
    name: '', email: '', phone: '', position: '', fair: '', notes: '', linkedin: '',
    empType: 'full_time', classYear: '', department: '', poc: '',
  })
  const [pursuitForm, setPursuitForm] = useState({
    name: '', email: '', phone: '', position: '', company: '', linkedin: '', notes: '',
  })

  const fileInputRef = useRef(null)
  const resumeInputRef = useRef(null)
  const photoUploadTargetRef = useRef(null)

  // ============================================================
  // DATA LOADING
  // ============================================================
  const loadData = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([fetchCandidates(), fetchPursuits()])
      setCandidates(c)
      setPursuits(p)
    } catch (err) {
      console.error('Error loading data:', err)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const loadDrawerData = useCallback(async (candidateId) => {
    if (!candidateId) return
    try {
      const [notes, ratings, files] = await Promise.all([
        fetchNotes(candidateId, null),
        fetchRatings(candidateId),
        fetchFiles(candidateId),
      ])
      setDrawerNotes(notes)
      setDrawerRatings(ratings)
      setDrawerFiles(files)
    } catch (err) {
      console.error('Error loading drawer data:', err)
    }
  }, [])

  const loadPursuitDrawerData = useCallback(async (pursuitId) => {
    if (!pursuitId) return
    try {
      const [notes, outreach] = await Promise.all([
        fetchNotes(null, pursuitId),
        fetchOutreach(pursuitId),
      ])
      setDrawerNotes(notes)
      setDrawerOutreach(outreach)
    } catch (err) {
      console.error('Error loading pursuit data:', err)
    }
  }, [])

  // ============================================================
  // FILTERING
  // ============================================================
  const filtered = candidates.filter(c => {
    if (filterSource !== 'All' && c.lead_source !== filterSource) return false
    if (searchTerm && !c.name.toLowerCase().includes(searchTerm.toLowerCase()) && !(c.position || '').toLowerCase().includes(searchTerm.toLowerCase())) return false
    return true
  })

  const stageCount = (stageId) => filtered.filter(c => c.stage === stageId).length

  // ============================================================
  // CANDIDATE ACTIONS
  // ============================================================
  const handleAddCandidate = async () => {
    if (!quickForm.name || submitting) return
    setSubmitting(true)
    try {
      const newCandidate = await createCandidate({
        name: quickForm.name, email: quickForm.email, phone: quickForm.phone,
        lead_source: addLeadSource, position: quickForm.position,
        fair: quickForm.fair || null, department: quickForm.department || null,
        emp_type: quickForm.empType, class_year: quickForm.empType === 'intern' ? quickForm.classYear || null : null,
        poc: quickForm.poc || userName, linkedin: quickForm.linkedin || null,
        created_by: user.id,
      })

      if (quickForm.notes) {
        await createNote({ candidateId: newCandidate.id, text: quickForm.notes, authorName: userName, authorId: user.id })
      }

      if (pendingFile) {
        await uploadFile(newCandidate.id, pendingFile, user.id)
      }

      setQuickForm({ name: '', email: '', phone: '', position: '', fair: '', notes: '', linkedin: '', empType: 'full_time', classYear: '', department: '', poc: '' })
      setPendingFile(null)
      setShowAddForm(false)
      await loadData()
    } catch (err) {
      console.error('Error adding candidate:', err)
      alert('Error adding candidate: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const moveCandidate = async (candidateId, newStage) => {
    if (newStage === 'interview_scheduled') {
      setScheduleModal(candidateId)
      setScheduleDateTime('')
      return
    }
    try {
      await updateCandidate(candidateId, { stage: newStage })
      await loadData()
      if (selectedCandidate?.id === candidateId) {
        setSelectedCandidate(prev => prev ? { ...prev, stage: newStage } : null)
      }
    } catch (err) {
      console.error('Error moving candidate:', err)
    }
  }

  const confirmSchedule = async () => {
    if (!scheduleDateTime || !scheduleModal) return
    try {
      await updateCandidate(scheduleModal, { stage: 'interview_scheduled', interview_date: scheduleDateTime })
      await loadData()
      if (selectedCandidate?.id === scheduleModal) {
        setSelectedCandidate(prev => prev ? { ...prev, stage: 'interview_scheduled', interview_date: scheduleDateTime } : null)
      }
      setScheduleModal(null)
      setScheduleDateTime('')
    } catch (err) {
      console.error('Error scheduling:', err)
    }
  }

  const handleDeleteCandidate = async (id) => {
    try {
      await apiDeleteCandidate(id)
      setShowDeleteConfirm(null)
      setSelectedCandidate(null)
      await loadData()
    } catch (err) {
      console.error('Error deleting:', err)
    }
  }

  const markOfferDeclined = async (id, declined) => {
    try {
      await updateCandidate(id, { offer_declined: declined })
      setSelectedCandidate(prev => prev ? { ...prev, offer_declined: declined } : null)
      await loadData()
    } catch (err) {
      console.error('Error updating offer status:', err)
    }
  }

  // ============================================================
  // NOTES
  // ============================================================
  const handleAddCandidateNote = async (candidateId) => {
    if (!candidateNoteText.trim()) return
    try {
      await createNote({ candidateId, text: candidateNoteText.trim(), authorName: userName, authorId: user.id })
      setCandidateNoteText('')
      await loadDrawerData(candidateId)
    } catch (err) {
      console.error('Error adding note:', err)
    }
  }

  const handleAddPursuitNote = async (pursuitId) => {
    if (!pursuitNoteText.trim()) return
    try {
      await createNote({ pursuitId, text: pursuitNoteText.trim(), authorName: userName, authorId: user.id })
      setPursuitNoteText('')
      await loadPursuitDrawerData(pursuitId)
    } catch (err) {
      console.error('Error adding note:', err)
    }
  }

  // ============================================================
  // RATINGS
  // ============================================================
  const submitRating = async (candidateId) => {
    if (!pendingRating) return
    try {
      await upsertRating({ candidateId, score: pendingRating, authorName: userName, authorId: user.id })
      setPendingRating(0)
      setHoverStar(0)
      await loadDrawerData(candidateId)
    } catch (err) {
      console.error('Error submitting rating:', err)
    }
  }

  // ============================================================
  // PURSUITS
  // ============================================================
  const handleAddPursuit = async () => {
    if (!pursuitForm.name || submitting) return
    setSubmitting(true)
    try {
      const p = await createPursuit({
        name: pursuitForm.name, email: pursuitForm.email, phone: pursuitForm.phone,
        position: pursuitForm.position, company: pursuitForm.company,
        linkedin: pursuitForm.linkedin || null, created_by: user.id,
      })
      if (pursuitForm.notes) {
        await createNote({ pursuitId: p.id, text: pursuitForm.notes, authorName: userName, authorId: user.id })
      }
      setPursuitForm({ name: '', email: '', phone: '', position: '', company: '', linkedin: '', notes: '' })
      setShowAddPursuit(false)
      await loadData()
    } catch (err) {
      console.error('Error adding pursuit:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddOutreach = async (pursuitId) => {
    if (!outreachForm.note) return
    try {
      await createOutreach({ pursuitId, contactType: outreachForm.type, note: outreachForm.note, authorName: userName, authorId: user.id })
      setOutreachForm({ type: 'Phone call', note: '' })
      setShowAddOutreach(null)
      await loadPursuitDrawerData(pursuitId)
    } catch (err) {
      console.error('Error adding outreach:', err)
    }
  }

  const handleDeletePursuit = async (id) => {
    try {
      await apiDeletePursuit(id)
      setShowDeleteConfirm(null)
      setSelectedPursuit(null)
      await loadData()
    } catch (err) {
      console.error('Error deleting pursuit:', err)
    }
  }

  const convertPursuitToCandidate = async (pursuit) => {
    if (submitting) return
    setSubmitting(true)
    try {
      await createCandidate({
        name: pursuit.name, email: pursuit.email, phone: pursuit.phone,
        lead_source: 'referral', position: pursuit.position,
        poc: userName, linkedin: pursuit.linkedin, created_by: user.id,
      })
      await apiDeletePursuit(pursuit.id)
      setSelectedPursuit(null)
      setMainTab('pipeline')
      await loadData()
    } catch (err) {
      console.error('Error converting pursuit:', err)
    } finally {
      setSubmitting(false)
    }
  }

  // ============================================================
  // FILE HANDLING
  // ============================================================
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (dragCandidate) return
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      setPendingFile(files[0])
      setAddLeadSource('email')
      setQuickForm({ name: '', email: '', phone: '', position: '', fair: '', notes: '', linkedin: '', empType: 'full_time', classYear: '', department: '', poc: '' })
      setShowAddForm(true)
    }
  }, [dragCandidate])

  const handleFileDownload = async (file) => {
    try {
      const url = await getFileUrl(file.file_path)
      if (url) {
        const a = document.createElement('a')
        a.href = url
        a.download = file.file_name
        a.click()
      }
    } catch (err) {
      console.error('Error downloading file:', err)
    }
  }

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0]
    const targetId = photoUploadTargetRef.current
    if (!file || !targetId) return
    try {
      const url = await uploadPhoto(targetId, file)
      setPhotos(prev => ({ ...prev, [targetId]: url }))
    } catch (err) {
      console.error('Error uploading photo:', err)
    }
    e.target.value = ''
    photoUploadTargetRef.current = null
  }

  // ============================================================
  // OPEN DRAWERS
  // ============================================================
  const openCandidateDrawer = async (candidate) => {
    setSelectedCandidate(candidate)
    setPendingRating(0)
    setHoverStar(0)
    setCandidateNoteText('')
    await loadDrawerData(candidate.id)
  }

  const openPursuitDrawer = async (pursuit) => {
    setSelectedPursuit(pursuit)
    setPursuitNoteText('')
    await loadPursuitDrawerData(pursuit.id)
  }

  // ============================================================
  // DRAG & DROP (Board cards)
  // ============================================================
  const handleCardDragStart = (e, candidate) => { setDragCandidate(candidate); e.dataTransfer.effectAllowed = 'move' }
  const handleStageDragOver = (e, stageId) => { e.preventDefault(); if (dragCandidate) setDragOverStage(stageId) }
  const handleStageDrop = (e, stageId) => {
    e.preventDefault(); e.stopPropagation()
    if (dragCandidate) { moveCandidate(dragCandidate.id, stageId); setDragCandidate(null); setDragOverStage(null) }
  }

  // ============================================================
  // SHARED STYLES
  // ============================================================
  const inputStyle = { padding: '10px 14px', borderRadius: 8, border: '1px solid #D5D3CC', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }
  const btnSecondary = { padding: '8px 20px', borderRadius: 8, border: '1px solid #D5D3CC', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#666' }
  const btnPrimary = (color) => ({ padding: '8px 20px', borderRadius: 8, border: 'none', background: color, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' })

  // ============================================================
  // SUB-COMPONENTS
  // ============================================================
  const Avatar = ({ id, name, size, fontSize, border, clickToUpload, photoUrl }) => {
    const photo = photoUrl || photos[id]
    const base = { width: size, height: size, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden', position: 'relative', ...(border ? { border } : {}) }
    const triggerUpload = clickToUpload ? (e) => { e.stopPropagation(); photoUploadTargetRef.current = id; fileInputRef.current.click() } : undefined

    if (photo) {
      return (
        <div style={{ ...base, cursor: clickToUpload ? 'pointer' : 'default' }} onClick={triggerUpload} title={clickToUpload ? 'Click to change photo' : undefined}>
          <img src={photo} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )
    }
    return (
      <div style={{ ...base, background: getAvatarColor(id), cursor: clickToUpload ? 'pointer' : 'default', fontSize }} onClick={triggerUpload} title={clickToUpload ? 'Click to upload photo' : undefined}>
        {getInitials(name)}
        {clickToUpload && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', padding: '2px 0', textAlign: 'center' }}><span style={{ fontSize: Math.max(8, size * 0.18), color: '#fff', fontWeight: 500 }}>Upload</span></div>}
      </div>
    )
  }

  const StarRow = ({ score, max, size, interactive, onHover, onClick, onLeave }) => (
    <div style={{ display: 'flex', gap: 2 }} onMouseLeave={onLeave}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} onMouseEnter={interactive ? () => onHover(i + 1) : undefined} onClick={interactive ? () => onClick(i + 1) : undefined}
          style={{ fontSize: size, cursor: interactive ? 'pointer' : 'default', color: i < score ? '#D4967D' : '#DDD', transition: 'color 0.1s', lineHeight: 1, userSelect: 'none' }}>★</span>
      ))}
    </div>
  )

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: '#F2F1ED', minHeight: '100vh', color: '#2C2C2C' }}>
      <input type="file" ref={fileInputRef} accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
      <input type="file" ref={resumeInputRef} accept=".pdf,.doc,.docx,.msg,.eml" style={{ display: 'none' }} onChange={(e) => { if (e.target.files[0]) { setPendingFile(e.target.files[0]); e.target.value = '' } }} />

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0D395A 0%, #154B72 50%, #0D395A 100%)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 19, fontFamily: "'Fraunces', serif", fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.3px' }}>RecruitFlow</h1>
            <p style={{ margin: 0, fontSize: 10, color: '#8BAABE', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 500 }}>Gray Civil Recruiting</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '5px 4px', display: 'flex', gap: 2, border: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={() => setMainTab('pipeline')} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: mainTab === 'pipeline' ? 'rgba(255,255,255,0.18)' : 'transparent', color: mainTab === 'pipeline' ? '#fff' : '#8BAABE', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Pipeline</button>
            <button onClick={() => setMainTab('pursuits')} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: mainTab === 'pursuits' ? '#D4967D' : 'transparent', color: mainTab === 'pursuits' ? '#fff' : '#8BAABE', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', position: 'relative' }}>
              Pursuits
              {pursuits.length > 0 && <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: '#D4967D', color: '#fff', fontSize: 9, fontWeight: 700, display: mainTab === 'pursuits' ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center' }}>{pursuits.length}</span>}
            </button>
          </div>
          <div style={{ fontSize: 12, color: '#8BAABE', fontWeight: 500 }}>{userName}</div>
          <button onClick={onSignOut} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#8BAABE', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Sign out</button>
        </div>
      </div>

      {/* PIPELINE TAB */}
      {mainTab === 'pipeline' && (<>
        <div style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, borderBottom: '1px solid #E5E3DC' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <input type="text" placeholder="Search candidates..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ ...inputStyle, width: 200, paddingLeft: 34 }} />
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 13, opacity: 0.4 }}>🔍</span>
            </div>
            <select value={filterSource} onChange={e => setFilterSource(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
              <option value="All">All Sources</option>
              {Object.entries(LEAD_SOURCES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ background: '#fff', borderRadius: 8, padding: '3px', display: 'flex', gap: 2, border: '1px solid #D5D3CC' }}>
              <button onClick={() => setView('board')} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: view === 'board' ? '#0D395A' : 'transparent', color: view === 'board' ? '#fff' : '#666', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Board</button>
              <button onClick={() => setView('list')} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: view === 'list' ? '#0D395A' : 'transparent', color: view === 'list' ? '#fff' : '#666', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>List</button>
            </div>
            <button onClick={() => { setShowAddForm(true); setPendingFile(null) }} style={{ ...btnPrimary('#0D395A'), display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
              <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Add Candidate
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ padding: '10px 24px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STAGES.map(stage => (
            <div key={stage.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: '#fff', border: '1px solid #E5E3DC', fontSize: 11 }}>
              <span>{stage.icon}</span>
              <span style={{ fontWeight: 700, color: stage.color }}>{stageCount(stage.id)}</span>
              <span style={{ color: '#999' }}>{stage.label}</span>
            </div>
          ))}
        </div>

        {/* Drop Zone */}
        <div style={{ padding: '0 24px 10px' }}>
          <div onDragOver={e => { e.preventDefault(); if (!dragCandidate) setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
            style={{ border: `2px dashed ${dragOver ? '#2B6CB0' : '#C5C2BB'}`, borderRadius: 10, padding: dragOver ? '18px' : '10px 18px', textAlign: 'center', background: dragOver ? '#E8EFF8' : '#F7F6F3', transition: 'all 0.25s' }}>
            <div style={{ fontSize: dragOver ? 14 : 12, color: dragOver ? '#2B6CB0' : '#999', fontWeight: 500 }}>
              {dragOver ? 'Drop file to attach and add new candidate' : '📎 Drop an email, resume, or document here to start adding a candidate'}
            </div>
          </div>
        </div>

        {/* Board View */}
        <div style={{ padding: '4px 24px 24px' }}>
          {view === 'board' ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`, gap: 8 }}>
              {STAGES.map(stage => {
                const cards = filtered.filter(c => c.stage === stage.id)
                const isEnd = stage.id === 'hired' || stage.id === 'rejected'
                return (
                  <div key={stage.id}
                    onDragOver={e => handleStageDragOver(e, stage.id)} onDragLeave={() => setDragOverStage(null)} onDrop={e => handleStageDrop(e, stage.id)}
                    style={{ background: dragOverStage === stage.id ? stage.color + '10' : isEnd ? '#F7F6F3' : '#fff', borderRadius: 12, border: dragOverStage === stage.id ? `2px solid ${stage.color}40` : '1px solid #E5E3DC', minHeight: 360, display: 'flex', flexDirection: 'column', transition: 'all 0.2s', opacity: isEnd ? 0.85 : 1 }}>
                    <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #E5E3DC' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 13 }}>{stage.icon}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: stage.color }}>{stage.label}</span>
                        </div>
                        <span style={{ background: stage.color + '18', color: stage.color, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>{cards.length}</span>
                      </div>
                    </div>
                    <div style={{ padding: 6, flex: 1, display: 'flex', flexDirection: 'column', gap: 5, overflowY: 'auto' }}>
                      {cards.map(candidate => (
                        <div key={candidate.id} draggable onDragStart={e => handleCardDragStart(e, candidate)} onDragEnd={() => { setDragCandidate(null); setDragOverStage(null) }}
                          onClick={() => openCandidateDrawer(candidate)}
                          style={{ padding: '9px 10px', borderRadius: 8, background: isEnd ? '#F2F1ED' : '#F7F6F3', border: '1px solid #E5E3DC', cursor: 'pointer', transition: 'all 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = stage.color + '60'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E3DC'; e.currentTarget.style.boxShadow = 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                            <Avatar id={candidate.id} name={candidate.name} size={26} fontSize={9} />
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#2C2C2C', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{candidate.name}</div>
                          </div>
                          <div style={{ fontSize: 10, color: '#777', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{candidate.position}</div>
                          <div style={{ fontSize: 9, color: candidate.emp_type === 'intern' ? '#6B5B95' : '#888', marginBottom: 5, fontWeight: 500 }}>{candidate.emp_type === 'intern' ? 'Intern' + (candidate.class_year ? ' — ' + candidate.class_year : '') : 'Full Time'}</div>
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ padding: '1px 6px', borderRadius: 4, background: LEAD_SOURCES[candidate.lead_source]?.bg || '#f0f0f0', color: LEAD_SOURCES[candidate.lead_source]?.color || '#888', fontSize: 9, fontWeight: 600 }}>{LEAD_SOURCES[candidate.lead_source]?.label || candidate.lead_source}</span>
                            {candidate.fair && <span style={{ padding: '1px 6px', borderRadius: 4, background: candidate.fair === 'UT Career Fair' ? '#FFF0E6' : candidate.fair === 'A&M Career Fair' ? '#F0E6E8' : '#E8F0EC', color: candidate.fair === 'UT Career Fair' ? '#BF5700' : candidate.fair === 'A&M Career Fair' ? '#500000' : '#0D395A', fontSize: 9, fontWeight: 600 }}>{candidate.fair}</span>}
                            {candidate.stage === 'offer' && candidate.offer_declined && <span style={{ padding: '1px 6px', borderRadius: 4, background: '#FDE8E8', color: '#B04A4A', fontSize: 9, fontWeight: 600 }}>Declined</span>}
                            {isEnd && <button onClick={e => { e.stopPropagation(); setShowDeleteConfirm({ type: 'candidate', id: candidate.id, name: candidate.name }) }} style={{ marginLeft: 'auto', padding: '1px 6px', borderRadius: 4, border: '1px solid #ddd', background: '#fff', fontSize: 9, color: '#B04A4A', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Remove</button>}
                          </div>
                        </div>
                      ))}
                      {cards.length === 0 && <div style={{ textAlign: 'center', padding: '20px 8px', color: '#CCC', fontSize: 11, fontStyle: 'italic' }}>No candidates</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E3DC', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F7F6F3', borderBottom: '2px solid #E5E3DC' }}>
                    {['Candidate', 'Position', 'Source', 'Stage', 'Point of Contact', 'Added', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(candidate => {
                    const stage = STAGES.find(s => s.id === candidate.stage)
                    const isEnd = candidate.stage === 'hired' || candidate.stage === 'rejected'
                    return (
                      <tr key={candidate.id} onClick={() => openCandidateDrawer(candidate)}
                        style={{ borderBottom: '1px solid #E5E3DC', cursor: 'pointer', opacity: isEnd ? 0.7 : 1 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F7F6F3'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '9px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar id={candidate.id} name={candidate.name} size={28} fontSize={10} />
                            <div><div style={{ fontWeight: 600, fontSize: 13 }}>{candidate.name}</div><div style={{ fontSize: 11, color: '#888' }}>{candidate.email}</div></div>
                          </div>
                        </td>
                        <td style={{ padding: '9px 12px', color: '#555', fontSize: 12 }}>{candidate.position}</td>
                        <td style={{ padding: '9px 12px' }}><span style={{ padding: '2px 7px', borderRadius: 6, background: LEAD_SOURCES[candidate.lead_source]?.bg, color: LEAD_SOURCES[candidate.lead_source]?.color, fontSize: 10, fontWeight: 600 }}>{LEAD_SOURCES[candidate.lead_source]?.label}</span></td>
                        <td style={{ padding: '9px 12px' }}><span style={{ color: stage?.color, fontWeight: 600, fontSize: 11 }}>{stage?.icon} {stage?.label}</span></td>
                        <td style={{ padding: '9px 12px', color: '#555', fontSize: 12 }}>{candidate.poc}</td>
                        <td style={{ padding: '9px 12px', color: '#999', fontSize: 11 }}>{daysSince(candidate.created_at)}</td>
                        <td style={{ padding: '9px 12px' }}>
                          {isEnd && <button onClick={e => { e.stopPropagation(); setShowDeleteConfirm({ type: 'candidate', id: candidate.id, name: candidate.name }) }} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid #ddd', background: '#fff', fontSize: 10, color: '#B04A4A', cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>)}

      {/* PURSUITS TAB */}
      {mainTab === 'pursuits' && (
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: 0, fontFamily: "'Fraunces', serif", fontSize: 22, color: '#0D395A' }}>Pursuits</h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>People you're actively courting — not yet in the hiring pipeline</p>
            </div>
            <button onClick={() => setShowAddPursuit(true)} style={{ ...btnPrimary('#D4967D'), display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Add Pursuit
            </button>
          </div>
          {pursuits.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#BBB' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#888' }}>No pursuits yet</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Add people from your network that would be great hires</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 14 }}>
              {pursuits.map(p => (
                <div key={p.id} onClick={() => openPursuitDrawer(p)}
                  style={{ background: '#fff', borderRadius: 14, border: '1px solid #E5E3DC', cursor: 'pointer', overflow: 'hidden', transition: 'all 0.15s', borderLeft: '4px solid #D4967D' }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.07)' }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}>
                  <div style={{ padding: '16px 18px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <Avatar id={p.id} name={p.name} size={44} fontSize={15} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#2C2C2C', fontFamily: "'Fraunces', serif" }}>{p.name}</div>
                        <div style={{ fontSize: 13, color: '#666', marginTop: 1 }}>{p.position}</div>
                        <div style={{ fontSize: 12, color: '#999', marginTop: 1 }}>{p.company}</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setShowDeleteConfirm({ type: 'pursuit', id: p.id, name: p.name }) }}
                        style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid #eee', background: '#F7F6F3', fontSize: 10, color: '#B04A4A', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, opacity: 0.6 }}
                        onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}>Remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========== MODALS ========== */}

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontFamily: "'Fraunces', serif", color: '#B04A4A' }}>Remove {showDeleteConfirm.name}?</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#666', lineHeight: 1.5 }}>This will permanently delete this {showDeleteConfirm.type} and all associated data.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDeleteConfirm(null)} style={btnSecondary}>Cancel</button>
              <button onClick={() => showDeleteConfirm.type === 'pursuit' ? handleDeletePursuit(showDeleteConfirm.id) : handleDeleteCandidate(showDeleteConfirm.id)} style={btnPrimary('#B04A4A')}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Interview Modal */}
      {scheduleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 17, fontFamily: "'Fraunces', serif", color: '#2B6CB0' }}>Schedule Interview</h3>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: '#888' }}>Set the date and time for this interview</p>
            <input type="datetime-local" value={scheduleDateTime} onChange={e => setScheduleDateTime(e.target.value)} style={{ ...inputStyle, marginBottom: 18, cursor: 'pointer' }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setScheduleModal(null)} style={btnSecondary}>Cancel</button>
              <button onClick={confirmSchedule} disabled={!scheduleDateTime} style={{ ...btnPrimary('#2B6CB0'), opacity: scheduleDateTime ? 1 : 0.4 }}>Schedule</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Candidate Modal */}
      {showAddForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 500, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 18px', fontFamily: "'Fraunces', serif", fontSize: 18, color: '#0D395A' }}>Add Candidate</h3>
            <div style={{ display: 'flex', gap: 3, marginBottom: 18, background: '#F2F1ED', borderRadius: 8, padding: 4 }}>
              {Object.entries(LEAD_SOURCES).map(([key, s]) => (
                <button key={key} onClick={() => setAddLeadSource(key)} style={{ flex: 1, padding: '6px 6px', borderRadius: 6, border: 'none', background: addLeadSource === key ? '#fff' : 'transparent', color: addLeadSource === key ? s.color : '#888', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxShadow: addLeadSource === key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>{s.label}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <input placeholder="Full Name *" value={quickForm.name} onChange={e => setQuickForm(prev => ({ ...prev, name: e.target.value }))} style={inputStyle} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input type="email" placeholder="Email" value={quickForm.email} onChange={e => setQuickForm(prev => ({ ...prev, email: e.target.value }))} style={inputStyle} />
                <input type="tel" placeholder="Phone" value={quickForm.phone} onChange={e => setQuickForm(prev => ({ ...prev, phone: e.target.value }))} style={inputStyle} />
              </div>
              <input placeholder="Position" value={quickForm.position} onChange={e => setQuickForm(prev => ({ ...prev, position: e.target.value }))} style={inputStyle} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select value={quickForm.empType} onChange={e => setQuickForm(prev => ({ ...prev, empType: e.target.value, classYear: '' }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="full_time">Full Time</option>
                  <option value="intern">Intern</option>
                </select>
                {quickForm.empType === 'intern' && (
                  <select value={quickForm.classYear} onChange={e => setQuickForm(prev => ({ ...prev, classYear: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer', color: quickForm.classYear ? '#2C2C2C' : '#999' }}>
                    <option value="">Class Year...</option>
                    {['Freshman', 'Sophomore', 'Junior', 'Senior', 'Senior +'].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select value={quickForm.department} onChange={e => setQuickForm(prev => ({ ...prev, department: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer', color: quickForm.department ? '#2C2C2C' : '#999' }}>
                  <option value="">Department...</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <input placeholder="Point of Contact" value={quickForm.poc} onChange={e => setQuickForm(prev => ({ ...prev, poc: e.target.value }))} style={inputStyle} />
              </div>
              {addLeadSource === 'job_fair' && (
                <select value={quickForm.fair} onChange={e => setQuickForm(prev => ({ ...prev, fair: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer', color: quickForm.fair ? '#2C2C2C' : '#999' }}>
                  <option value="">Job Fair...</option>
                  {JOB_FAIRS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              )}
              <input type="url" placeholder="LinkedIn URL" value={quickForm.linkedin} onChange={e => setQuickForm(prev => ({ ...prev, linkedin: e.target.value }))} style={inputStyle} />
              <textarea placeholder="Notes" value={quickForm.notes} onChange={e => setQuickForm(prev => ({ ...prev, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              {pendingFile ? (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: '#E8F0EC', border: '1px solid #B8D4C5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>📎</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0D6847' }}>{pendingFile.name}</div>
                      <div style={{ fontSize: 10, color: '#0D395A' }}>File attached</div>
                    </div>
                  </div>
                  <button onClick={() => setPendingFile(null)} style={{ background: 'none', border: 'none', color: '#B04A4A', fontSize: 14, cursor: 'pointer', padding: '2px 6px' }}>✕</button>
                </div>
              ) : (
                <button onClick={() => resumeInputRef.current.click()} style={{ padding: '10px 14px', borderRadius: 8, border: '1px dashed #C5C2BB', background: '#F7F6F3', color: '#888', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <span style={{ fontSize: 14 }}>📎</span> Attach resume, email, or document
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowAddForm(false); setPendingFile(null) }} style={btnSecondary}>Cancel</button>
              <button onClick={handleAddCandidate} disabled={submitting} style={{ ...btnPrimary('#0D395A'), opacity: submitting ? 0.5 : 1 }}>{submitting ? 'Adding...' : 'Add to Pipeline'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Pursuit Modal */}
      {showAddPursuit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 480, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 6px', fontFamily: "'Fraunces', serif", fontSize: 18, color: '#D4967D' }}>Add Pursuit</h3>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: '#888' }}>Someone you've identified as a potential great hire</p>
            <div style={{ display: 'grid', gap: 8 }}>
              {[['name', 'Full Name *', 'text'], ['position', 'Their Current Role', 'text'], ['company', 'Current Company', 'text'], ['email', 'Email', 'email'], ['phone', 'Phone', 'tel'], ['linkedin', 'LinkedIn URL', 'url']].map(([key, label, type]) => (
                <input key={key} type={type} placeholder={label} value={pursuitForm[key]} onChange={e => setPursuitForm(prev => ({ ...prev, [key]: e.target.value }))} style={inputStyle} />
              ))}
              <textarea placeholder="Notes — how do you know them? Why are they a good fit?" value={pursuitForm.notes} onChange={e => setPursuitForm(prev => ({ ...prev, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddPursuit(false)} style={btnSecondary}>Cancel</button>
              <button onClick={handleAddPursuit} disabled={submitting} style={{ ...btnPrimary('#D4967D'), opacity: submitting ? 0.5 : 1 }}>{submitting ? 'Adding...' : 'Add to Pursuits'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Candidate Detail Drawer */}
      {selectedCandidate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end', zIndex: 1000 }} onClick={() => { setSelectedCandidate(null); setCandidateNoteText('') }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '90vw', background: '#fff', height: '100vh', overflowY: 'auto', boxShadow: '-8px 0 30px rgba(0,0,0,0.15)' }}>
            <div style={{ background: 'linear-gradient(135deg, #0D395A 0%, #154B72 100%)', padding: '22px 24px', color: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <Avatar id={selectedCandidate.id} name={selectedCandidate.name} size={50} fontSize={18} border="3px solid rgba(255,255,255,0.2)" clickToUpload />
                <div>
                  <h2 style={{ margin: 0, fontSize: 20, fontFamily: "'Fraunces', serif", fontWeight: 700 }}>{selectedCandidate.name}</h2>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: '#8BAABE' }}>{selectedCandidate.position}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ padding: '3px 9px', borderRadius: 10, background: LEAD_SOURCES[selectedCandidate.lead_source]?.bg, color: LEAD_SOURCES[selectedCandidate.lead_source]?.color, fontSize: 10, fontWeight: 600 }}>{LEAD_SOURCES[selectedCandidate.lead_source]?.label}</span>
                <span style={{ padding: '3px 9px', borderRadius: 10, background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 10, fontWeight: 600 }}>{STAGES.find(s => s.id === selectedCandidate.stage)?.icon} {STAGES.find(s => s.id === selectedCandidate.stage)?.label}</span>
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderBottom: '1px solid #E5E3DC', background: '#F7F6F3' }}>
              <div style={{ fontSize: 10, color: '#888', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '1px' }}>Move to Stage</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {STAGES.map(stage => (
                  <button key={stage.id} onClick={() => moveCandidate(selectedCandidate.id, stage.id)} disabled={selectedCandidate.stage === stage.id}
                    style={{ padding: '4px 10px', borderRadius: 6, border: selectedCandidate.stage === stage.id ? `2px solid ${stage.color}` : '1px solid #D5D3CC', background: selectedCandidate.stage === stage.id ? stage.color + '15' : '#fff', color: stage.color, fontSize: 10, fontWeight: 600, cursor: selectedCandidate.stage === stage.id ? 'default' : 'pointer', fontFamily: 'inherit' }}>{stage.icon} {stage.label}</button>
                ))}
              </div>
            </div>
            <div style={{ padding: '18px 24px' }}>
              <div style={{ display: 'grid', gap: 14 }}>
                {[['📧', 'Email', selectedCandidate.email], ['📱', 'Phone', selectedCandidate.phone], ['👤', 'Point of Contact', selectedCandidate.poc],
                  ['🏢', 'Department', selectedCandidate.department],
                  ['💼', 'Type', selectedCandidate.emp_type === 'intern' ? 'Intern' + (selectedCandidate.class_year ? ' — ' + selectedCandidate.class_year : '') : 'Full Time'],
                  ...(selectedCandidate.fair ? [['🏫', 'Job Fair', selectedCandidate.fair]] : []),
                  ...(selectedCandidate.interview_date ? [['🗓', 'Interview', formatInterviewDate(selectedCandidate.interview_date)]] : []),
                  ...(selectedCandidate.linkedin ? [['🔗', 'LinkedIn', selectedCandidate.linkedin]] : []),
                ].filter(([,,v]) => v).map(([icon, label, val]) => (
                  <div key={label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 15, width: 22, textAlign: 'center' }}>{icon}</span>
                    <div><div style={{ fontSize: 10, color: '#888', fontWeight: 500, marginBottom: 1 }}>{label}</div><div style={{ fontSize: 13, color: '#2C2C2C', fontWeight: 500 }}>{val}</div></div>
                  </div>
                ))}
              </div>

              {/* Files */}
              {drawerFiles.length > 0 && drawerFiles.map(f => (
                <div key={f.id} onClick={() => handleFileDownload(f)}
                  style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#E8F0EC', border: '1px solid #B8D4C5', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <span style={{ fontSize: 18 }}>📎</span>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600, color: '#0D6847' }}>{f.file_name}</div><div style={{ fontSize: 10, color: '#0D395A' }}>Click to download</div></div>
                  <span style={{ fontSize: 16, color: '#0D6847' }}>⬇</span>
                </div>
              ))}

              {/* Offer Status */}
              {selectedCandidate.stage === 'offer' && (
                <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: selectedCandidate.offer_declined ? '#FDE8E8' : '#FAF0EB', border: selectedCandidate.offer_declined ? '1px solid #E8B8B8' : '1px solid #E8CBC0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: selectedCandidate.offer_declined ? '#B04A4A' : '#D4967D' }}>{selectedCandidate.offer_declined ? 'Offer Not Accepted' : 'Offer Pending'}</div>
                    </div>
                    <button onClick={() => markOfferDeclined(selectedCandidate.id, !selectedCandidate.offer_declined)}
                      style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #D5D3CC', background: '#fff', color: selectedCandidate.offer_declined ? '#666' : '#B04A4A', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {selectedCandidate.offer_declined ? 'Undo' : 'Mark Not Accepted'}
                    </button>
                  </div>
                </div>
              )}

              {/* Ratings */}
              {POST_INTERVIEW_STAGES.includes(selectedCandidate.stage) && (
                <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: '#F7F6F3', border: '1px solid #E5E3DC' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Interview Rating</div>
                    {drawerRatings.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: '#D4967D' }}>{avgRating(drawerRatings)}</span>
                        <span style={{ fontSize: 11, color: '#999' }}>/ 10 avg ({drawerRatings.length} rating{drawerRatings.length !== 1 ? 's' : ''})</span>
                      </div>
                    )}
                  </div>
                  {drawerRatings.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {drawerRatings.map((r, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 8, background: r.author_id === user.id ? '#FAF0EB' : '#fff', border: r.author_id === user.id ? '1px solid #E8CBC0' : '1px solid #E5E3DC' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: r.author_id === user.id ? '#D4967D' : '#4A6FA5' }}>{r.author_name}</span>
                            <span style={{ fontSize: 10, color: '#999' }}>{daysSince(r.created_at)}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <StarRow score={r.score} max={10} size={13} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#D4967D', minWidth: 18, textAlign: 'right' }}>{r.score}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: '#fff', border: '1px solid #E5E3DC' }}>
                    <div style={{ fontSize: 11, color: '#888', fontWeight: 500, marginBottom: 6 }}>
                      {drawerRatings.some(r => r.author_id === user.id) ? 'Update your rating' : 'Add your rating'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <StarRow score={hoverStar || pendingRating || (drawerRatings.find(r => r.author_id === user.id) || {}).score || 0} max={10} size={18} interactive
                        onHover={setHoverStar} onClick={setPendingRating} onLeave={() => setHoverStar(0)} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#D4967D', minWidth: 24 }}>{hoverStar || pendingRating || (drawerRatings.find(r => r.author_id === user.id) || {}).score || '—'}</span>
                      {pendingRating > 0 && <button onClick={() => submitRating(selectedCandidate.id)} style={{ ...btnPrimary('#D4967D'), padding: '4px 12px', fontSize: 11 }}>Submit</button>}
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 10, color: '#888', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '1px' }}>Notes ({drawerNotes.length})</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <textarea placeholder="Add a note..." value={candidateNoteText} onChange={e => setCandidateNoteText(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical', flex: 1 }} />
                  <button onClick={() => handleAddCandidateNote(selectedCandidate.id)} disabled={!candidateNoteText.trim()} style={{ ...btnPrimary('#0D395A'), padding: '8px 14px', alignSelf: 'flex-end', opacity: candidateNoteText.trim() ? 1 : 0.4 }}>Add</button>
                </div>
                {drawerNotes.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {drawerNotes.map((n, i) => (
                      <div key={i} style={{ padding: 12, borderRadius: 10, background: n.author_id === user.id ? '#E8F0EC' : '#F7F6F3', border: n.author_id === user.id ? '1px solid #B8D4C5' : '1px solid #E5E3DC' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: n.author_id === user.id ? '#0D6847' : '#4A6FA5' }}>{n.author_name}</span>
                          <span style={{ fontSize: 10, color: '#999' }}>{daysSince(n.created_at)}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#444', lineHeight: 1.6 }}>{n.text}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #E5E3DC', display: 'flex', gap: 8 }}>
              {(selectedCandidate.stage === 'hired' || selectedCandidate.stage === 'rejected') && (
                <button onClick={() => setShowDeleteConfirm({ type: 'candidate', id: selectedCandidate.id, name: selectedCandidate.name })} style={{ ...btnSecondary, color: '#B04A4A', borderColor: '#B04A4A40', flex: 1 }}>Remove</button>
              )}
              <button onClick={() => { setSelectedCandidate(null); setCandidateNoteText('') }} style={{ ...btnSecondary, flex: 1 }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Pursuit Detail Drawer */}
      {selectedPursuit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end', zIndex: 1000 }} onClick={() => { setSelectedPursuit(null); setShowAddOutreach(null); setPursuitNoteText('') }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: '90vw', background: '#fff', height: '100vh', overflowY: 'auto', boxShadow: '-8px 0 30px rgba(0,0,0,0.15)' }}>
            <div style={{ background: 'linear-gradient(135deg, #8B5E47 0%, #D4967D 50%, #8B5E47 100%)', padding: '22px 24px', color: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
                <Avatar id={selectedPursuit.id} name={selectedPursuit.name} size={50} fontSize={18} border="3px solid rgba(255,255,255,0.2)" clickToUpload />
                <div>
                  <h2 style={{ margin: 0, fontSize: 20, fontFamily: "'Fraunces', serif", fontWeight: 700 }}>{selectedPursuit.name}</h2>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: '#D4B8AC' }}>{selectedPursuit.position} at {selectedPursuit.company}</p>
                </div>
              </div>
              <span style={{ padding: '3px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 10, fontWeight: 600 }}>🎯 Pursuit</span>
            </div>
            <div style={{ padding: '18px 24px' }}>
              <div style={{ display: 'grid', gap: 14 }}>
                {[['📧', 'Email', selectedPursuit.email], ['📱', 'Phone', selectedPursuit.phone], ['🏢', 'Company', selectedPursuit.company],
                  ...(selectedPursuit.linkedin ? [['🔗', 'LinkedIn', selectedPursuit.linkedin]] : []),
                ].filter(([,,v]) => v).map(([icon, label, val]) => (
                  <div key={label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 15, width: 22, textAlign: 'center' }}>{icon}</span>
                    <div><div style={{ fontSize: 10, color: '#888', fontWeight: 500, marginBottom: 1 }}>{label}</div><div style={{ fontSize: 13, color: '#2C2C2C', fontWeight: 500 }}>{val}</div></div>
                  </div>
                ))}
              </div>

              {/* Notes */}
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 10, color: '#888', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '1px' }}>Notes ({drawerNotes.length})</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <textarea placeholder="Add a note..." value={pursuitNoteText} onChange={e => setPursuitNoteText(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical', flex: 1 }} />
                  <button onClick={() => handleAddPursuitNote(selectedPursuit.id)} disabled={!pursuitNoteText.trim()} style={{ ...btnPrimary('#8B5E47'), padding: '8px 14px', alignSelf: 'flex-end', opacity: pursuitNoteText.trim() ? 1 : 0.4 }}>Add</button>
                </div>
                {drawerNotes.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                    {drawerNotes.map((n, i) => (
                      <div key={i} style={{ padding: 12, borderRadius: 10, background: n.author_id === user.id ? '#FAF0EB' : '#F7F6F3', border: n.author_id === user.id ? '1px solid #E8CBC0' : '1px solid #E5E3DC' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: n.author_id === user.id ? '#D4967D' : '#4A6FA5' }}>{n.author_name}</span>
                          <span style={{ fontSize: 10, color: '#999' }}>{daysSince(n.created_at)}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#444', lineHeight: 1.6 }}>{n.text}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Outreach */}
              <div style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Outreach Timeline</div>
                  <button onClick={() => setShowAddOutreach(showAddOutreach ? null : selectedPursuit.id)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #D4967D40', background: showAddOutreach ? '#FAF0EB' : '#fff', color: '#D4967D', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Log Contact</button>
                </div>
                {showAddOutreach === selectedPursuit.id && (
                  <div style={{ padding: 14, borderRadius: 10, background: '#FAF0EB', border: '1px solid #E8CBC0', marginBottom: 14 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      {['Phone call', 'Email', 'LinkedIn message', 'In person', 'Text'].map(t => (
                        <button key={t} onClick={() => setOutreachForm(prev => ({ ...prev, type: t }))} style={{ padding: '4px 10px', borderRadius: 6, border: outreachForm.type === t ? '1.5px solid #D4967D' : '1px solid #ddd', background: outreachForm.type === t ? '#fff' : '#F7F6F3', color: outreachForm.type === t ? '#D4967D' : '#888', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{t}</button>
                      ))}
                    </div>
                    <textarea placeholder="What did you talk about?" value={outreachForm.note} onChange={e => setOutreachForm(prev => ({ ...prev, note: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical', marginBottom: 8 }} />
                    <button onClick={() => handleAddOutreach(selectedPursuit.id)} style={btnPrimary('#D4967D')}>Log Contact</button>
                  </div>
                )}
                {drawerOutreach.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 12px', color: '#CCC', border: '1px dashed #ddd', borderRadius: 10 }}>
                    <div style={{ fontSize: 12, fontStyle: 'italic' }}>No outreach logged yet</div>
                  </div>
                ) : (
                  <div style={{ position: 'relative', paddingLeft: 18 }}>
                    <div style={{ position: 'absolute', left: 5, top: 8, bottom: 8, width: 2, background: '#E5E3DC' }} />
                    {drawerOutreach.map((o, i) => (
                      <div key={i} style={{ position: 'relative', marginBottom: 14, paddingLeft: 16 }}>
                        <div style={{ position: 'absolute', left: -14, top: 6, width: 10, height: 10, borderRadius: '50%', background: i === 0 ? '#D4967D' : '#D5D3CC', border: '2px solid #fff' }} />
                        <div style={{ padding: 12, borderRadius: 10, background: '#F7F6F3', border: '1px solid #E5E3DC' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#D4967D' }}>{o.contact_type}</span>
                            <span style={{ fontSize: 10, color: '#999' }}>{daysSince(o.created_at)} · {o.author_name}</span>
                          </div>
                          <div style={{ fontSize: 13, color: '#444', lineHeight: 1.5 }}>{o.note}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #E5E3DC', display: 'flex', gap: 8 }}>
              <button onClick={() => convertPursuitToCandidate(selectedPursuit)} disabled={submitting} style={{ ...btnPrimary('#0D395A'), flex: 1, textAlign: 'center', opacity: submitting ? 0.5 : 1 }}>{submitting ? 'Converting...' : 'Move to Pipeline →'}</button>
              <button onClick={() => { setSelectedPursuit(null); setShowAddOutreach(null); setPursuitNoteText('') }} style={{ ...btnSecondary, flex: 1 }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
