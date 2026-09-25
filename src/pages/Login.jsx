import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ClubLogo from '../components/ClubLogo'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username.trim().toLowerCase(), password)
      navigate('/')
    } catch (err) {
      setError('Usuari o contrasenya incorrectes.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
        aria-label="Tancar i sortir"
        title="Tornar enrere"
        className="absolute top-6 left-6 flex items-center justify-center w-10 h-10 rounded-xl bg-base-surface border border-base-border text-ink-dim hover:text-ink hover:bg-base-raised transition-all"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <form onSubmit={handleSubmit} className="card w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="mb-3">
            <ClubLogo className="w-16 h-16" rounded="rounded-2xl" />
          </div>
          <h1 className="font-display text-xl font-semibold">Vincit Fantasy</h1>
          <p className="text-sm text-ink-dim mt-1">Entra amb el teu usuari del club</p>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-ink-dim block">Usuari</label>
            <span className="text-[11px] text-accent font-medium">Tot en minúscules</span>
          </div>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="p.ex. jordi"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            autoComplete="username"
            required
          />
          <p className="text-[11px] text-ink-dim mt-1 flex items-center gap-1">
            <span>💡</span> Recorda escriure l'usuari en minúscules.
          </p>
        </div>

        <div className="mb-2">
          <label className="text-xs text-ink-dim mb-1 block">Contrasenya</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              className="input w-full pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
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

        {error && <p className="text-danger text-sm mt-2">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full mt-5">
          {loading ? 'Entrant…' : 'Entrar'}
        </button>

        <p className="text-xs text-ink-faint text-center mt-5">
          Sense usuari? Demana'l a l'administrador del joc.
        </p>
      </form>
    </div>
  )
}
