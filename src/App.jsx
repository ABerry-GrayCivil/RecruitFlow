import { useState, useEffect } from 'react'
import { supabase, signInWithAzure, signOut, getUserDisplayName } from './lib/supabase'
import RecruitFlow from './components/RecruitFlow'

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F2F1ED' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: '#0D395A', marginBottom: 8 }}>RecruitFlow</h1>
          <p style={{ color: '#888', fontSize: 14 }}>Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F2F1ED' }}>
        <div style={{ textAlign: 'center', padding: 40, background: '#fff', borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', maxWidth: 400 }}>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: '#0D395A', marginBottom: 4 }}>RecruitFlow</h1>
          <p style={{ color: '#888', fontSize: 13, marginBottom: 32, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Gray Civil Recruiting</p>
          <button
            onClick={signInWithAzure}
            style={{
              padding: '12px 32px', borderRadius: 8, border: 'none',
              background: '#0D395A', color: '#fff', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', width: '100%',
            }}
          >
            Sign in with Microsoft 365
          </button>
          <p style={{ marginTop: 16, fontSize: 11, color: '#BBB' }}>Gray Civil employees only</p>
        </div>
      </div>
    )
  }

  return (
    <RecruitFlow
      user={user}
      userName={getUserDisplayName(user)}
      onSignOut={signOut}
    />
  )
}
