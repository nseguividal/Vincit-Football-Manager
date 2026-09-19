import { useSearchParams } from 'react-router-dom'
import Topbar from '../../components/Topbar'
import { useAuth } from '../../context/AuthContext'
import OfferForm from './OfferForm'
import SellForm from './SellForm'
import LineupForm from './LineupForm'
import CoachForm from './CoachForm'

const TABS = [
  { key: 'oferta', label: 'Fer oferta', component: OfferForm },
  { key: 'venda', label: 'Vendre jugador', component: SellForm },
  { key: 'alineacio', label: 'Canviar titular', component: LineupForm },
  { key: 'entrenador', label: 'Entrenador', component: CoachForm, coachOnly: true },
]

export default function Forms() {
  const { isCoach, isAdmin } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'oferta'

  const visibleTabs = TABS.filter((t) => !t.coachOnly || isCoach || isAdmin)
  const ActiveComponent = visibleTabs.find((t) => t.key === activeTab)?.component || OfferForm

  return (
    <div>
      <Topbar title="Formularis" subtitle="Totes les accions requereixen confirmar amb el teu usuari" />

      <div className="px-8 pt-6">
        <div className="flex gap-2 border-b border-base-border">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setSearchParams({ tab: t.key })}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === t.key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink-dim hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-8 max-w-2xl">
        <ActiveComponent />
      </div>
    </div>
  )
}
