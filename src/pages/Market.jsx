import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Topbar from '../components/Topbar'

function timeLeft(expiresAt) {
  if (!expiresAt) return null
  const diffMs = new Date(expiresAt).getTime() - Date.now()
  if (diffMs <= 0) return 'Expira avui'
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `${days}d ${hours}h restants`
  return `${hours}h restants`
}

export default function Market() {
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('fantasy_cards')
        .select(`
          id, current_price, market_listed_at, market_expires_at,
          club_players ( full_name, position, club_teams ( name ) ),
          managers ( display_name )
        `)
        .eq('status', 'market')
        .order('market_expires_at', { ascending: true })

      if (!error) setListings(data || [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div>
      <Topbar
        title="Mercat de fitxatges"
        subtitle="Jugadors disponibles per fitxar aquesta setmana"
      />

      <div className="p-8">
        {loading ? (
          <p className="text-ink-dim text-sm">Carregant mercat…</p>
        ) : listings.length === 0 ? (
          <div className="card p-10 text-center text-ink-dim">
            No hi ha cap jugador al mercat ara mateix. Torna-ho a comprovar aviat.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map((card) => (
              <div key={card.id} className="card p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-display font-semibold">{card.club_players?.full_name}</p>
                    <p className="text-xs text-ink-dim">
                      {card.club_players?.position} · {card.club_players?.club_teams?.name}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-base-raised text-ink-dim">
                    {card.managers ? 'Venda de jugador' : 'Nou al mercat'}
                  </span>
                </div>

                <div className="flex items-end justify-between mt-2">
                  <div>
                    <p className="text-xs text-ink-faint">Preu de sortida</p>
                    <p className="font-display text-lg font-semibold text-accent">
                      {card.current_price}M
                    </p>
                  </div>
                  <p className="text-xs text-ink-dim text-right">
                    {timeLeft(card.market_expires_at)}
                  </p>
                </div>

                {card.managers && (
                  <p className="text-xs text-ink-faint">Ven: {card.managers.display_name}</p>
                )}

                <Link
                  to={`/formularis?tab=oferta&card=${card.id}`}
                  className="btn-primary text-center text-sm mt-1"
                >
                  Fer una oferta
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
