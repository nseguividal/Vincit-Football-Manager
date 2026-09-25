import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function DemoBanner({ className = '' }) {
  const { manager } = useAuth()

  if (manager) return null

  return (
    <div
      className={`p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0 select-none">🎭</span>
        <div>
          <h3
            className="font-display font-bold text-sm sm:text-base text-yellow-400"
            style={{ color: '#FACC15' }}
          >
            Mode de demostració · Dades fictícies
          </h3>
          <p className="text-xs sm:text-sm text-ink-dim mt-0.5 max-w-2xl">
            La informació, puntuacions, jugadors i usuaris mostrats són d'exemple. Per veure les dades reals de la lliga i participar-hi, inicia sessió.
          </p>
        </div>
      </div>
      <Link
        to="/login"
        className="btn-primary text-xs sm:text-sm font-semibold px-4 py-2 shrink-0 self-stretch sm:self-auto text-center flex items-center justify-center gap-1.5 shadow-md whitespace-nowrap"
      >
        <span>Inicia sessió</span>
        <span>→</span>
      </Link>
    </div>
  )
}

