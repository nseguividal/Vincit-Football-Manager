import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ClubLogo from './ClubLogo'

export default function ForcePasswordChangeModal() {
  const { manager, refreshManager, logout } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!manager?.must_change_password) {
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (newPassword.length < 6) {
      setError('La contrasenya ha de tenir com a mínim 6 caràcters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Les contrasenyes no coincideixen. Revisa-les si us plau.')
      return
    }

    setLoading(true)

    try {
      // 1. Actualitzar contrasenya a Supabase Auth
      const { error: authErr } = await supabase.auth.updateUser({
        password: newPassword,
      })
      if (authErr) throw authErr

      // 2. Marcar must_change_password = false a la base de dades
      const { error: rpcErr } = await supabase.rpc('complete_first_login_password_change')
      if (rpcErr) {
        // Fallback directe
        await supabase
          .from('managers')
          .update({ must_change_password: false })
          .eq('id', manager.id)
      }

      // 3. Refrescar estat d'autenticació
      await refreshManager()
    } catch (err) {
      console.error('Error canviant contrasenya:', err)
      setError(err.message || 'Error actualitzant la contrasenya.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="card w-full max-w-sm p-6 sm:p-8">
        {/* Capçalera d'estil idèntic a Login */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="mb-3">
            <ClubLogo className="w-16 h-16" rounded="rounded-2xl" />
          </div>
          <h1 className="font-display text-xl font-semibold text-ink">
            Benvingut/da, {manager.display_name}!
          </h1>
          <p className="text-xs text-ink-dim mt-1.5 leading-relaxed">
            Com que és el teu primer accés (o s'ha restablert la teva clau), per seguretat has de triar la teva pròpia contrasenya.
          </p>
        </div>

        {/* Formulari amb classes 'input' estàndard */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-ink-dim block">Nova contrasenya</label>
              <span className="text-[11px] text-accent font-medium">Mínim 6 caràcters</span>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="input w-full pr-10"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Escriu la teva clau..."
                autoComplete="new-password"
                required
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-dim hover:text-ink text-sm p-1 transition-colors"
                tabIndex={-1}
                title={showPassword ? 'Amagar contrasenya' : 'Mostrar contrasenya'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-ink-dim mb-1 block">
              Repeteix la nova contrasenya
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="input w-full pr-10"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Torna a escriure-la..."
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          {error && <p className="text-danger text-xs mt-1">{error}</p>}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !newPassword || !confirmPassword}
              className="btn-primary w-full"
            >
              {loading ? 'Guardant…' : 'Guardar i entrar'}
            </button>

            <button
              type="button"
              onClick={() => logout()}
              className="w-full text-center text-xs text-ink-faint hover:text-ink hover:underline mt-4 transition-colors block"
            >
              Tancar sessió
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
