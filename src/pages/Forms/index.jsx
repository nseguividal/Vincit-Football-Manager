import { Link } from 'react-router-dom'
import Topbar from '../../components/Topbar'
import { useAuth } from '../../context/AuthContext'
import CoachForm from './CoachForm'

export default function Forms() {
  const { isCoach, isAdmin, manager } = useAuth()

  const hasAccess = isCoach || isAdmin

  return (
    <div>
      <Topbar
        title="Afegir puntuacions"
        subtitle="Espai per a entrenadors per introduir les actes i estadístiques dels partits"
      />

      <div className="p-4 sm:p-8 max-w-3xl mx-auto">
        {hasAccess ? (
          <CoachForm />
        ) : (
          <div className="card p-6 sm:p-8 text-center space-y-4 max-w-xl mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-accent/15 text-accent flex items-center justify-center text-2xl mx-auto">
              📋
            </div>
            <div className="space-y-1.5">
              <h2 className="font-display font-semibold text-lg text-ink">
                Formulari d'Actes per a Entrenadors
              </h2>
              <p className="text-xs sm:text-sm text-ink-dim leading-relaxed">
                {manager
                  ? `Hola ${manager.display_name}, aquest apartat és d'ús exclusiu per als entrenadors del club per enregistrar les dades dels partits jugats.`
                  : 'Aquest apartat és d\'ús exclusiu per als entrenadors del club.'}
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-center">
              <Link to="/mercat" className="btn-primary text-xs sm:text-sm py-2.5 px-4 text-center">
                Anar al Mercat de fitxatges
              </Link>
              <Link to="/plantilla" className="btn-ghost text-xs sm:text-sm py-2.5 px-4 text-center">
                Veure el teu cinc
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
