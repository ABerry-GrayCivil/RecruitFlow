import { useState, useEffect } from 'react'
import { supabase, signInWithAzure, signOut, getUserDisplayName } from './lib/supabase'
import RecruitFlow from './components/RecruitFlow'

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(null) // null = checking, true = allowed, false = denied

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session) {
        setAuthorized(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Check portal permissions when user is available
  useEffect(() => {
    if (!user) {
      setAuthorized(null)
      return
    }

    async function checkAccess() {
      try {
        // 1. Get the user's role_id from the portal users table
        const { data: portalUser, error: userErr } = await supabase
          .from('users')
          .select('role_id, is_admin')
          .eq('id', user.id)
          .single()

        if (userErr || !portalUser) {
          // User doesn't exist in portal users table — no access
          setAuthorized(false)
          return
        }

        // Admins always have access
        if (portalUser.is_admin) {
          setAuthorized(true)
          return
        }

        // 2. Find the RecruitFlow app in the apps table
        const { data: app, error: appErr } = await supabase
          .from('apps')
          .select('id')
          .eq('name', 'RecruitFlow')
          .single()

        if (appErr || !app) {
          // App not found in portal — allow access as fallback
          // (means the app hasn't been registered in the portal yet)
          setAuthorized(true)
          return
        }

        // 3. Check if the user's role has access to this app
        const { data: access, error: accessErr } = await supabase
          .from('app_role_access')
          .select('id')
          .eq('app_id', app.id)
          .eq('role_id', portalUser.role_id)
          .limit(1)

        if (accessErr) {
          console.error('Error checking app access:', accessErr)
          setAuthorized(false)
          return
        }

        setAuthorized(access && access.length > 0)
      } catch (err) {
        console.error('Error checking permissions:', err)
        setAuthorized(false)
      }
    }

    checkAccess()
  }, [user])

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

  // Checking permissions
  if (authorized === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F2F1ED' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: '#0D395A', marginBottom: 8 }}>RecruitFlow</h1>
          <p style={{ color: '#888', fontSize: 14 }}>Checking access...</p>
        </div>
      </div>
    )
  }

  // Not authorized — redirect to portal
  if (!authorized) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F2F1ED' }}>
        <div style={{ textAlign: 'center', padding: 40, background: '#fff', borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', maxWidth: 440 }}>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: '#0D395A', marginBottom: 4 }}>RecruitFlow</h1>
          <p style={{ color: '#888', fontSize: 13, marginBottom: 24, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Gray Civil Recruiting</p>
          <div style={{ padding: 20, borderRadius: 10, background: '#FDE8E8', border: '1px solid #E8B8B8', marginBottom: 24 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#B04A4A', fontWeight: 600 }}>Access Denied</p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#666', lineHeight: 1.5 }}>
              Your account does not have permission to access RecruitFlow. Contact an administrator if you believe this is an error.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => window.location.href = 'https://apps.gray-civil.com'}
              style={{
                padding: '10px 24px', borderRadius: 8, border: 'none',
                background: '#0D395A', color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', flex: 1,
              }}
            >
              Go to App Portal
            </button>
            <button
              onClick={signOut}
              style={{
                padding: '10px 24px', borderRadius: 8, border: '1px solid #D5D3CC',
                background: '#fff', color: '#666', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Sign Out
            </button>
          </div>
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
