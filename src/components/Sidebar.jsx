import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV_ITEMS = [
  { to: '/', label: 'Inici', icon: '🏠' },
  { to: '/mercat', label: 'Mercat de fitxatges', icon: '💰' },
  { to: '/plantilla', label: 'Plantilles', icon: '👥' },
  { to: '/equips', label: 'Resum d\'equips', icon: '📋' },
  { to: '/formularis', label: 'Formularis', icon: '📝' },
]

export default function Sidebar() {
  const { manager, isAdmin, logout } = useAuth()

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-base-surface border-r border-base-border flex flex-col">
      <div className="px-5 py-6 flex items-center gap-3 border-b border-base-border">
        <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center text-lg">⚽</div>
        <div>
          <div className="font-display font-semibold leading-tight">VINCIT</div>
          <div className="text-xs text-ink-dim tracking-wide leading-tight">MANAGER</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-accent text-base font-semibold'
                  : 'text-ink-dim hover:bg-base-raised hover:text-ink'
              }`
            }
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}

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
                <div className="text-sm font-medium truncate">{manager.display_name}</div>
                <div className="text-xs text-accent font-display">{manager.budget}M</div>
              </div>
            </div>
            <button
              onClick={logout}
              className="text-xs text-ink-faint hover:text-danger transition-colors"
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
  )
}
