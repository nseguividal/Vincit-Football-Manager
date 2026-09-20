import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ClubLogo from './ClubLogo'

export default function Sidebar() {
  const { manager, isAdmin, isCoach, logout } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const location = useLocation()

  const navItems = [
    { to: '/', label: 'Classificació', icon: '🏆' },
    { to: '/mercat', label: 'Mercat de fitxatges', icon: '💰' },
    { to: '/plantilla', label: 'El teu cinc', icon: '👥' },
    { to: '/equips', label: 'Resum d\'equips', icon: '📋' },
    ...((isAdmin || isCoach) ? [{ to: '/formularis', label: 'Afegir puntuacions', icon: '📝' }] : []),
  ]

  // Tancar el menú mòbil automàticament en canviar de pàgina
  useEffect(() => {
    setIsOpen(false)
  }, [location.pathname, location.search])

  return (
    <>
      {/* ------------------------------------------------------------------- */}
      {/* CAPÇALERA SUPERIOR PER A MÒBIL (<768px)                             */}
      {/* ------------------------------------------------------------------- */}
      <header className="md:hidden sticky top-0 z-40 bg-base-surface/95 backdrop-blur border-b border-base-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-label="Obrir menú de navegació"
            className="w-10 h-10 rounded-xl bg-base-raised border border-base-border flex items-center justify-center text-ink hover:text-accent transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-2.5">
            <ClubLogo className="w-8 h-8" />
            <div>
              <span className="font-display font-bold text-sm tracking-tight text-ink">VINCIT</span>
              <span className="text-[10px] text-ink-dim tracking-wider ml-1 font-semibold">FANTASY</span>
            </div>
          </div>
        </div>

        {manager ? (
          <div className="flex items-center gap-2 bg-base-raised/70 border border-base-border px-2.5 py-1 rounded-lg">
            <span className="text-base">{manager.avatar_emoji || '⚽'}</span>
            <span className="text-xs text-yellow-400 font-display font-bold" style={{ color: '#FACC15' }}>{manager.budget}M</span>
          </div>
        ) : (
          <NavLink
            to="/login"
            className="btn-ghost text-xs py-1.5 px-3 min-h-[36px] flex items-center"
          >
            Entrar
          </NavLink>
        )}
      </header>

      {/* ------------------------------------------------------------------- */}
      {/* DRAWER DESPLEGABLE MÒBIL (OVERLAY + MENU)                          */}
      {/* ------------------------------------------------------------------- */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Fons fosc clicable per tancar */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Panell lateral que s'obre */}
          <div className="relative w-72 max-w-[80vw] h-full bg-base-surface border-r border-base-border flex flex-col z-10 shadow-2xl">
            <div className="px-5 py-4 flex items-center justify-between border-b border-base-border">
              <div className="flex items-center gap-2.5">
                <ClubLogo className="w-9 h-9" />
                <div>
                  <div className="font-display font-semibold leading-tight text-ink text-sm">VINCIT</div>
                  <div className="text-[10px] text-ink-dim tracking-wide leading-tight">FANTASY</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Tancar menú"
                className="w-8 h-8 rounded-lg bg-base-raised flex items-center justify-center text-ink-dim hover:text-ink text-sm"
              >
                ✕
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
              {navItems.map((item) => {
                const isForm = item.to === '/formularis'
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => setIsOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-3 rounded-lg text-sm min-h-[44px] transition-colors ${
                        isActive
                          ? isForm
                            ? 'bg-emerald-500/20 border border-emerald-500/60 text-emerald-300 font-semibold'
                            : 'bg-accent text-base font-semibold'
                          : 'text-ink-dim hover:bg-base-raised hover:text-ink'
                      }`
                    }
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}

              {isAdmin && (
                <NavLink
                  to="/admin"
                  onClick={() => setIsOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-3 rounded-lg text-sm min-h-[44px] transition-colors mt-4 border ${
                      isActive
                        ? 'bg-danger/20 border-danger text-danger font-semibold'
                        : 'border-base-border text-ink-dim hover:bg-base-raised hover:text-ink'
                    }`
                  }
                >
                  <span className="text-base">🛠️</span>
                  <span>Administració</span>
                </NavLink>
              )}
            </nav>

            <div className="p-4 border-t border-base-border bg-base-surface">
              {manager ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-2xl">{manager.avatar_emoji || '⚽'}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate text-ink">{manager.display_name}</div>
                      <div className="text-xs text-yellow-400 font-display font-bold" style={{ color: '#FACC15' }}>{manager.budget}M disponibles</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      logout()
                      setIsOpen(false)
                    }}
                    className="text-xs text-ink-faint hover:text-danger p-2 min-h-[40px] flex items-center transition-colors"
                  >
                    Sortir
                  </button>
                </div>
              ) : (
                <NavLink
                  to="/login"
                  onClick={() => setIsOpen(false)}
                  className="btn-ghost w-full text-center block text-sm py-2.5 min-h-[44px]"
                >
                  Iniciar sessió
                </NavLink>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* BARRA LATERAL FIXA PER A ESCRIPTORI (>=768px / md:)               */}
      {/* ------------------------------------------------------------------- */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:h-screen md:sticky md:top-0 bg-base-surface border-r border-base-border flex-col">
        <div className="px-5 py-6 flex items-center gap-3 border-b border-base-border">
          <ClubLogo className="w-10 h-10" />
          <div>
            <div className="font-display font-semibold leading-tight text-ink">VINCIT</div>
            <div className="text-xs text-ink-dim tracking-wide leading-tight">FANTASY</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isForm = item.to === '/formularis'
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isActive
                      ? isForm
                        ? 'bg-emerald-500/20 border border-emerald-500/60 text-emerald-300 font-semibold'
                        : 'bg-accent text-base font-semibold'
                      : 'text-ink-dim hover:bg-base-raised hover:text-ink'
                  }`
                }
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            )
          })}

          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors mt-4 border ${
                  isActive
                    ? 'bg-danger/20 border-danger text-danger font-semibold'
                    : 'border-base-border text-ink-dim hover:bg-base-raised hover:text-ink'
                }`
              }
            >
              <span>🛠️</span>
              <span>Administració</span>
            </NavLink>
          )}
        </nav>

        <div className="px-4 py-4 border-t border-base-border">
          {manager ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl">{manager.avatar_emoji || '⚽'}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate text-ink">{manager.display_name}</div>
                  <div className="text-xs text-yellow-400 font-display font-bold" style={{ color: '#FACC15' }}>{manager.budget}M</div>
                </div>
              </div>
              <button
                onClick={logout}
                className="text-xs text-ink-faint hover:text-danger transition-colors p-1"
                title="Tancar sessió"
              >
                Sortir
              </button>
            </div>
          ) : (
            <NavLink to="/login" className="btn-ghost w-full text-center block text-sm">
              Iniciar sessió
            </NavLink>
          )}
        </div>
      </aside>
    </>
  )
}
