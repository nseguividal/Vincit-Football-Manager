import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Topbar from '../components/Topbar'
import Pitch from '../components/Pitch'
import PlayerBadge from '../components/PlayerBadge'

export default function Squad() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedManagerId = searchParams.get('manager')

  const [managers, setManagers] = useState([])
  const [cards, setCards] = useState([])        // totes les fitxes d'aquest manager
  const [lineup, setLineup] = useState({})      // slot -> fantasy_card_id
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('managers')
      .select('id, display_name, avatar_emoji, budget')
      .order('display_name')
      .then(({ data }) => {
        setManagers(data || [])
        if (!selectedManagerId && data?.length) {
          setSearchParams({ manager: data[0].id })
        }
      })
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!selectedManagerId) return
    setLoading(true)

    async function load() {
      const [{ data: cardsData }, { data: lineupData }] = await Promise.all([
        supabase
          .from('fantasy_cards')
          .select('id, current_price, club_players ( full_name, position )')
          .eq('owner_manager_id', selectedManagerId)
          .eq('status', 'owned'),
        supabase
          .from('lineup_slots')
          .select('slot, fantasy_card_id')
          .eq('manager_id', selectedManagerId),
      ])
      setCards(cardsData || [])
      const lu = {}
      ;(lineupData || []).forEach((l) => { lu[l.slot] = l.fantasy_card_id })
      setLineup(lu)
      setLoading(false)
    }
    load()
  }, [selectedManagerId])

  const currentManager = managers.find((m) => m.id === selectedManagerId)

  const pitchSlots = useMemo(() => {
    const bySlot = {}
    for (const [slot, cardId] of Object.entries(lineup)) {
      const c = cards.find((c) => c.id === cardId)
      if (c) {
        bySlot[slot] = {
          name: c.club_players?.full_name,
          position: c.club_players?.position,
          rating: '—',
          price: c.current_price,
        }
      }
    }
    return bySlot
  }, [lineup, cards])

  const bench = cards.filter((c) => !Object.values(lineup).includes(c.id))

  return (
    <div>
      <Topbar
        title="Plantilles"
        subtitle="Consulta la plantilla de qualsevol participant"
        right={
          <select
            className="input w-56"
            value={selectedManagerId || ''}
            onChange={(e) => setSearchParams({ manager: e.target.value })}
          >
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.avatar_emoji} {m.display_name}
              </option>
            ))}
          </select>
        }
      />

      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-6 flex flex-col items-center">
          <h2 className="font-display font-semibold self-start mb-1">Onze titular</h2>
          {currentManager && (
            <p className="text-xs text-ink-dim self-start mb-4">
              Pressupost disponible: <span className="text-accent font-display">{currentManager.budget}M</span>
            </p>
          )}
          {loading ? (
            <p className="text-ink-dim text-sm py-10">Carregant plantilla…</p>
          ) : (
            <Pitch slots={pitchSlots} />
          )}
        </div>

        <div className="lg:col-span-2 card p-6">
          <h2 className="font-display font-semibold mb-4">Banqueta ({bench.length})</h2>
          {loading ? (
            <p className="text-ink-dim text-sm">Carregant…</p>
          ) : bench.length === 0 ? (
            <p className="text-ink-dim text-sm">Tots els jugadors de la plantilla són titulars.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
              {bench.map((c) => (
                <PlayerBadge
                  key={c.id}
                  name={c.club_players?.full_name}
                  position={c.club_players?.position}
                  rating="—"
                  price={c.current_price}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
