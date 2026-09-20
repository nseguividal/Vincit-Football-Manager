import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, usernameToEmail } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [manager, setManager] = useState(null) // fila de la taula `managers`
  const [loading, setLoading] = useState(true)

  const loadManager = useCallback(async (userId) => {
    if (!userId) {
      setManager(null)
      return
    }
    const { data, error } = await supabase
      .from('managers')
      .select(`
        *,
        coach_assignments (
          team_id,
          club_teams ( id, name )
        )
      `)
      .eq('user_id', userId)
      .single()
    if (!error && data) {
      setManager(data)
    } else {
      const { data: fbData } = await supabase.from('managers').select('*').eq('user_id', userId).single()
      if (fbData) setManager(fbData)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      loadManager(session?.user?.id).finally(() => setLoading(false))
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      loadManager(session?.user?.id)
    })

    return () => listener.subscription.unsubscribe()
  }, [loadManager])

  async function login(username, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    })
    if (error) throw error
    return data
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  // Reconfirmar la contrasenya abans d'una acció sensible (formularis).
  // No canvia la sessió activa, només valida que l'usuari la coneix.
  async function verifyPassword(password) {
    if (!manager) throw new Error('No hi ha sessió activa')
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(manager.username),
      password,
    })
    if (error) throw new Error('Contrasenya incorrecta')
    return true
  }

  const value = {
    session,
    manager,
    loading,
    isAdmin: !!manager?.is_admin,
    isCoach: !!manager?.is_coach,
    isPlayer: !manager?.is_admin && !manager?.is_coach,
    login,
    logout,
    verifyPassword,
    refreshManager: () => loadManager(session?.user?.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth ha d\'usar-se dins de <AuthProvider>')
  return ctx
}
