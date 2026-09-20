import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Topbar from '../components/Topbar'
import Pitch from '../components/Pitch'
import PlayerBadge from '../components/PlayerBadge'
import Toast from '../components/Toast'
import { getActiveMatchdayNow, formatDateDMY } from '../lib/matchdayUtils'

const POS_ORDER = { PORTER: 1, TANCA: 2, ALA: 3, PIVOT: 4 }

const POS_CONFIG = {
  PORTER: { label: 'Porter', emoji: '🧤', shortPos: 'POR', badge: 'bg-purple-500/20 text-purple-300 border border-purple-500/30' },
  TANCA: { label: 'Tanca', emoji: '🛡️', shortPos: 'TAN', badge: 'bg-blue-500/20 text-blue-300 border border-blue-500/30' },
  ALA: { label: 'Ala', emoji: '⚡', shortPos: 'ALA', badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' },
  PIVOT: { label: 'Pivot', emoji: '🎯', shortPos: 'PIV', badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' },
}

const SLOT_INFO = {
  PORTER: { label: 'Porter', position: 'PORTER', icon: '🧤', shortPos: 'POR' },
  TANCA: { label: 'Tanca', position: 'TANCA', icon: '🛡️', shortPos: 'TAN' },
  ALA_1: { label: 'Ala (esquerra)', position: 'ALA', icon: '⚡', shortPos: 'ALA' },
  ALA_2: { label: 'Ala (dreta)', position: 'ALA', icon: '⚡', shortPos: 'ALA' },
  PIVOT: { label: 'Pivot', position: 'PIVOT', icon: '🎯', shortPos: 'PIV' },
}

// Punts acumulats en jornades normals (les extres no compten)
function calculatePlayerPoints(clubPlayer) {
  if (!clubPlayer?.player_matchday_stats) return 0
  return clubPlayer.player_matchday_stats.reduce((acc, stat) => {
    if (stat.matchdays?.is_extra === true) return acc
    return acc + (Number(stat.points) || 0)
  }, 0)
}

export default function Squad() {
  const { manager: authManager } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedManagerId = searchParams.get('manager') || authManager?.id || ''

  const [managers, setManagers] = useState([])
  const [cards, setCards] = useState([])              // totes les fitxes en propietat d'aquest manager
  const [lineup, setLineup] = useState({})            // slot -> fantasy_card_id
  const [lineupCards, setLineupCards] = useState({})  // slot -> dades completes de la fitxa (inclou venuts al 5 titular)
  const [matchdays, setMatchdays] = useState([])      // llistat de jornades
  const [loading, setLoading] = useState(true)
  const [activeSlotModal, setActiveSlotModal] = useState(null)
  const [selectedManageCard, setSelectedManageCard] = useState(null)
  const [savingSlot, setSavingSlot] = useState(false)
  const [toast, setToast] = useState({ msg: '', type: 'ok' })

  // Comprovar si hi ha una jornada activa en aquest instant exacte (00:00h a 24:00h)
  const activeMatchday = useMemo(() => getActiveMatchdayNow(matchdays), [matchdays])
  const isLineupLocked = Boolean(activeMatchday)

  // ÚNICAMENT l'usuari registrat pot modificar la seva pròpia plantilla.
  const isOwnSquad = Boolean(authManager && selectedManagerId === authManager.id)
  const canEdit = isOwnSquad

  useEffect(() => {
    supabase
      .from('managers')
      .select('id, display_name, avatar_emoji, budget')
      .order('display_name')
      .then(({ data }) => {
        const mgrList = data || []
        setManagers(mgrList)
        if (!searchParams.get('manager')) {
          const defaultId = authManager?.id || mgrList[0]?.id
          if (defaultId) {
            setSearchParams({ manager: defaultId }, { replace: true })
          }
        }
      })
  }, [authManager]) // eslint-disable-line

  useEffect(() => {
    if (authManager?.id && !searchParams.get('manager')) {
      setSearchParams({ manager: authManager.id }, { replace: true })
    }
  }, [authManager, searchParams, setSearchParams])

  async function loadData() {
    if (!selectedManagerId) return
    setLoading(true)
    try {
      const [{ data: cardsData }, { data: lineupData }, { data: matchdaysData }] = await Promise.all([
        supabase
          .from('fantasy_cards')
          .select(`
            id, current_price, status, market_expires_at,
            club_players (
              id, full_name, position, club_teams ( name ),
              player_matchday_stats (
                points,
                matchdays ( id, is_extra )
              )
            )
          `)
          .eq('owner_manager_id', selectedManagerId),
        supabase
          .from('lineup_slots')
          .select(`
            slot, fantasy_card_id,
            fantasy_cards (
              id, current_price, status, owner_manager_id,
              club_players (
                id, full_name, position, club_teams ( name ),
                player_matchday_stats (
                  points,
                  matchdays ( id, is_extra )
                )
              )
            )
          `)
          .eq('manager_id', selectedManagerId),
        supabase
          .from('matchdays')
          .select('id, number, label, starts_at, ends_at, is_extra')
          .order('number'),
      ])

      const mList = matchdaysData || []
      setMatchdays(mList)
      const currentActive = getActiveMatchdayNow(mList)

      // Si NO hi ha jornada activa i és la pròpia plantilla, netegem de lineup_slots els jugadors venuts
      if (!currentActive && isOwnSquad && lineupData?.length) {
        const soldExpiredSlots = lineupData.filter(
          (l) => l.fantasy_cards && l.fantasy_cards.owner_manager_id !== selectedManagerId
        )
        if (soldExpiredSlots.length > 0) {
          for (const s of soldExpiredSlots) {
            await supabase
              .from('lineup_slots')
              .delete()
              .eq('manager_id', selectedManagerId)
              .eq('slot', s.slot)
          }
        }
      }

      setCards(cardsData || [])

      const lu = {}
      const luCards = {}
      ;(lineupData || []).forEach((l) => {
        // Si no hi ha jornada activa, filtrem els que ja no pertanyen al manager
        if (!currentActive && l.fantasy_cards && l.fantasy_cards.owner_manager_id !== selectedManagerId) {
          return
        }
        lu[l.slot] = l.fantasy_card_id
        if (l.fantasy_cards) {
          luCards[l.slot] = l.fantasy_cards
        }
      })
      setLineup(lu)
      setLineupCards(luCards)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedManagerId])

  const currentManager = managers.find((m) => m.id === selectedManagerId)

  // Jugadors del planter ordenats per: Porter -> Tanca -> Ala -> Pivot
  const sortedPlanter = useMemo(() => {
    return [...cards].sort((a, b) => {
      const posA = POS_ORDER[a.club_players?.position?.toUpperCase()] || 99
      const posB = POS_ORDER[b.club_players?.position?.toUpperCase()] || 99
      if (posA !== posB) return posA - posB
      return (a.club_players?.full_name || '').localeCompare(b.club_players?.full_name || '')
    })
  }, [cards])

  const pitchSlots = useMemo(() => {
    const bySlot = {}
    for (const [slot, cardId] of Object.entries(lineup)) {
      const c = cards.find((c) => c.id === cardId) || lineupCards[slot]
      if (c) {
        bySlot[slot] = {
          name: c.club_players?.full_name,
          position: c.club_players?.position,
          totalPoints: calculatePlayerPoints(c.club_players),
          isForSale: c.status === 'market',
        }
      }
    }
    return bySlot
  }, [lineup, cards, lineupCards])

  const bench = cards.filter((c) => !Object.values(lineup).includes(c.id))

  async function handleSelectSlotPlayer(targetSlotKey, cardId) {
    if (!canEdit || !selectedManagerId || selectedManagerId !== authManager?.id) return

    if (isLineupLocked) {
      setToast({
        msg: `🔒 Jornada ${activeMatchday.number} en curs: Alineacions bloquejades fins el dia ${formatDateDMY(activeMatchday.ends_at)} a les 24h.`,
        type: 'warn',
      })
      return
    }

    setSavingSlot(true)
    try {
      // 1. Si el jugador estava en un altre slot, l'eliminem d'aquell altre slot
      const otherSlotKey = Object.keys(lineup).find(
        (k) => k !== targetSlotKey && lineup[k] === cardId
      )
      if (otherSlotKey) {
        const { error: delErr } = await supabase
          .from('lineup_slots')
          .delete()
          .eq('manager_id', selectedManagerId)
          .eq('slot', otherSlotKey)
        if (delErr) throw delErr
      }

      // 2. Upsert a la posició objectiu
      const { error: upsertErr } = await supabase
        .from('lineup_slots')
        .upsert(
          {
            manager_id: selectedManagerId,
            slot: targetSlotKey,
            fantasy_card_id: cardId,
          },
          { onConflict: 'manager_id,slot' }
        )
      if (upsertErr) throw upsertErr

      // 3. Log a activity_log
      const chosenCard = cards.find((c) => c.id === cardId) || lineupCards[targetSlotKey]
      const playerName = chosenCard?.club_players?.full_name || 'un jugador'
      const slotLabel = SLOT_INFO[targetSlotKey]?.label || targetSlotKey
      await supabase.from('activity_log').insert({
        manager_id: selectedManagerId,
        type: 'lineup_change',
        message: `${currentManager?.display_name || 'Manager'} ha alineat ${playerName} com a ${slotLabel}`,
      })

      // 4. Actualitzar estat local
      setLineup((prev) => {
        const next = { ...prev }
        if (otherSlotKey) delete next[otherSlotKey]
        next[targetSlotKey] = cardId
        return next
      })

      if (chosenCard) {
        setLineupCards((prev) => {
          const next = { ...prev }
          if (otherSlotKey) delete next[otherSlotKey]
          next[targetSlotKey] = chosenCard
          return next
        })
      }

      setActiveSlotModal(null)
      setSelectedManageCard(null)
      setToast({ msg: `S'ha alineat ${playerName} correctament.`, type: 'ok' })
    } catch (err) {
      setToast({ msg: err.message || "Error guardant l'alineació", type: 'error' })
    } finally {
      setSavingSlot(false)
    }
  }

  async function handleRemoveSlotPlayer(targetSlotKey) {
    if (!canEdit || !selectedManagerId || selectedManagerId !== authManager?.id) return

    if (isLineupLocked) {
      setToast({
        msg: `🔒 Jornada ${activeMatchday.number} en curs: Alineacions bloquejades fins el dia ${formatDateDMY(activeMatchday.ends_at)} a les 24h.`,
        type: 'warn',
      })
      return
    }

    setSavingSlot(true)
    try {
      const { error } = await supabase
        .from('lineup_slots')
        .delete()
        .eq('manager_id', selectedManagerId)
        .eq('slot', targetSlotKey)
      if (error) throw error

      setLineup((prev) => {
        const next = { ...prev }
        delete next[targetSlotKey]
        return next
      })

      setLineupCards((prev) => {
        const next = { ...prev }
        delete next[targetSlotKey]
        return next
      })

      setActiveSlotModal(null)
      setSelectedManageCard(null)
      setToast({ msg: 'Jugador enviat a la banqueta.', type: 'ok' })
    } catch (err) {
      setToast({ msg: err.message || 'Error treient el jugador del cinc titular', type: 'error' })
    } finally {
      setSavingSlot(false)
    }
  }

  function handleBenchClick(c) {
    if (!canEdit) return
    if (isLineupLocked) {
      setToast({
        msg: `🔒 Jornada ${activeMatchday.number} en curs: Alineacions bloquejades fins el dia ${formatDateDMY(activeMatchday.ends_at)} a les 24h.`,
        type: 'warn',
      })
      return
    }
    const pos = c.club_players?.position?.toUpperCase()
    if (pos === 'PORTER') {
      setActiveSlotModal('PORTER')
    } else if (pos === 'TANCA') {
      setActiveSlotModal('TANCA')
    } else if (pos === 'PIVOT') {
      setActiveSlotModal('PIVOT')
    } else if (pos === 'ALA') {
      // Si un dels dos ales està buit, anem a aquell; si no, al primer
      if (!lineup['ALA_1']) setActiveSlotModal('ALA_1')
      else if (!lineup['ALA_2']) setActiveSlotModal('ALA_2')
      else setActiveSlotModal('ALA_1')
    }
  }

  return (
    <div>
      <Topbar
        title="El teu cinc"
        subtitle="Consulta la plantilla de qualsevol participant"
      />

      <div className="p-4 sm:p-8">
        {/* Selector d'usuari NOMÉS visible a mòbil (a dalt de tot, abans del 5 titular) */}
        <div className="block lg:hidden card p-3 sm:p-4 mb-5">
          <label className="text-xs font-semibold text-ink-dim block mb-1.5">
            Selecciona usuari:
          </label>
          <select
            className="input w-full text-sm min-h-[42px] font-medium bg-base-surface"
            value={selectedManagerId || ''}
            onChange={(e) => setSearchParams({ manager: e.target.value })}
          >
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.avatar_emoji} {m.display_name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
          {/* COLUMNA ESQUERRA: Cinc titular + Banqueta a sota */}
          <div className="lg:col-span-5 card p-3.5 sm:p-6 flex flex-col items-center space-y-4">
            <div className="self-start w-full">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display font-semibold text-lg text-ink">Cinc titular</h2>
                {canEdit ? (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-accent/20 text-accent font-semibold">
                    La teva plantilla
                  </span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-base-raised text-ink-dim border border-base-border font-medium">
                    Només visualització
                  </span>
                )}
              </div>
              {currentManager && (
                <p className="text-xs text-ink-dim mt-0.5">
                  Pressupost disponible: <span className="text-yellow-400 font-display font-bold">{currentManager.budget}M</span>
                </p>
              )}
              {!canEdit && (
                <p className="text-[11px] text-ink-dim mt-1">
                  Estàs consultant la plantilla de <strong className="text-ink">{currentManager?.display_name || 'aquest usuari'}</strong>.
                </p>
              )}
            </div>

            {/* Pista amb cinc titular */}
            {loading ? (
              <p className="text-ink-dim text-sm py-10">Carregant plantilla…</p>
            ) : (
              <Pitch
                slots={pitchSlots}
                onSlotClick={
                  canEdit
                    ? (slotKey) => {
                        if (isLineupLocked) {
                          setToast({
                            msg: `🔒 Jornada ${activeMatchday.number} en curs: Alineacions bloquejades fins el dia ${formatDateDMY(activeMatchday.ends_at)} a les 24h.`,
                            type: 'warn',
                          })
                        } else {
                          setActiveSlotModal(slotKey)
                        }
                      }
                    : undefined
                }
              />
            )}

            {/* Secció BANQUETA a sota de la pista */}
            <div className="w-full pt-4 border-t border-base-border/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-base text-white flex items-center gap-1.5">
                  <span>🪑</span> Banqueta ({bench.length})
                </h3>
              </div>

              {loading ? (
                <p className="text-ink-dim text-xs py-2">Carregant…</p>
              ) : bench.length === 0 ? (
                <p className="text-xs text-ink-dim py-2">Tots els jugadors de la plantilla són titulars.</p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-5 gap-2.5 sm:gap-3 pt-1">
                  {bench.map((c) => (
                    <PlayerBadge
                      key={c.id}
                      name={c.club_players?.full_name}
                      position={c.club_players?.position}
                      totalPoints={calculatePlayerPoints(c.club_players)}
                      isForSale={c.status === 'market'}
                      onClick={canEdit ? () => handleBenchClick(c) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* COLUMNA DRETA: Selector d'usuari a sobre (Desktop) + PLANTER */}
          <div className="lg:col-span-7 space-y-4">
            {/* Selector d'usuari situat a sobre del planter (visible només a Desktop) */}
            <div className="hidden lg:flex card p-3 sm:p-4 flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <label className="text-xs font-semibold text-ink-dim shrink-0">
                Selecciona usuari:
              </label>
              <select
                className="input w-full sm:w-72 text-sm min-h-[42px] font-medium bg-base-surface"
                value={selectedManagerId || ''}
                onChange={(e) => setSearchParams({ manager: e.target.value })}
              >
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.avatar_emoji} {m.display_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="card p-4 sm:p-6 flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b border-base-border/70 pb-3">
                <h2 className="font-display font-semibold text-lg sm:text-xl text-ink flex items-center gap-2">
                  <span>⚽</span> Planter ({sortedPlanter.length})
                </h2>
              </div>

              {loading ? (
                <p className="text-ink-dim text-sm py-8">Carregant jugadors del planter…</p>
              ) : sortedPlanter.length === 0 ? (
                <div className="p-8 text-center text-ink-dim text-sm space-y-1">
                  <p>Aquest mànager encara no té cap jugador al seu planter.</p>
                  <p className="text-xs text-ink-faint">Acudeix al Mercat de fitxatges per fer ofertes per nous jugadors.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {sortedPlanter.map((c) => {
                    const player = c.club_players
                    const posKey = player?.position?.toUpperCase()
                    const posInfo = POS_CONFIG[posKey] || { label: player?.position || 'JUG', emoji: '⚽', shortPos: 'JUG' }
                    const isTitular = Object.values(lineup).includes(c.id)
                    const isForSale = c.status === 'market'

                    return (
                      <div
                        key={c.id}
                        onClick={canEdit ? () => setSelectedManageCard(c) : undefined}
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                          canEdit
                            ? 'cursor-pointer bg-base-raised/70 border-base-border/70 hover:border-accent/50 hover:bg-base-raised shadow-sm'
                            : 'bg-base-raised/50 border-base-border/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Cercle amb posició: groc si està alineat, gris si no */}
                          <div
                            title={isTitular ? 'Jugador alineat al cinc titular' : 'Jugador a la banqueta'}
                            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-sm sm:text-base shrink-0 shadow-sm transition-colors ${
                              isTitular
                                ? 'bg-accent/20 border-2 border-accent'
                                : 'bg-base-surface border-2 border-base-border'
                            }`}
                          >
                            <span className="select-none">{posInfo.emoji}</span>
                          </div>

                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-ink truncate flex items-center gap-1.5">
                              <span className="truncate">{player?.full_name}</span>
                              {isForSale && (
                                <span
                                  title="Jugador posat a la venda"
                                  className="text-[11px] leading-none bg-[#0B1220] border border-white/30 rounded-full p-0.5 shadow-sm shrink-0"
                                >
                                  🏷️
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-ink-dim mt-1 flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full font-semibold ${posInfo.badge}`}>
                                {posInfo.label}
                              </span>
                              {player?.club_teams?.name && (
                                <>
                                  <span className="text-ink-faint">·</span>
                                  <span className="text-ink-dim font-medium">{player.club_teams.name}</span>
                                </>
                              )}
                              <span className="text-ink-faint">·</span>
                              <span className="text-accent font-display font-semibold">{c.current_price}M</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-center justify-center shrink-0 min-w-[36px]">
                          {/* Cercle amb punts acumulats */}
                          <div
                            title={`Punts acumulats: ${calculatePlayerPoints(player)} pts (jornades normals)`}
                            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-display font-bold text-xs shrink-0 shadow-sm ${
                              isTitular
                                ? 'bg-accent text-base border-2 border-accent'
                                : 'bg-base-surface text-ink border-2 border-base-border'
                            }`}
                          >
                            {calculatePlayerPoints(player)}
                          </div>
                          <span className="text-[10px] text-ink-dim font-medium mt-0.5 leading-none">pts</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal d'Accions del Jugador (Vendre / Alinear directament) */}
      {selectedManageCard && (
        <ManagePlayerModal
          card={selectedManageCard}
          lineup={lineup}
          isLineupLocked={isLineupLocked}
          activeMatchday={activeMatchday}
          onClose={() => setSelectedManageCard(null)}
          onSelectSlot={handleSelectSlotPlayer}
          onRemoveSlot={handleRemoveSlotPlayer}
          onUpdated={() => {
            setSelectedManageCard(null)
            loadData()
          }}
          setToast={setToast}
        />
      )}

      {/* Modal per escollir jugador del 5 titular */}
      {activeSlotModal && (
        <SelectPlayerModal
          slotKey={activeSlotModal}
          cards={cards}
          lineup={lineup}
          onSelect={handleSelectSlotPlayer}
          onRemove={handleRemoveSlotPlayer}
          onClose={() => setActiveSlotModal(null)}
          saving={savingSlot}
        />
      )}

      <Toast
        message={toast.msg}
        type={toast.type}
        onClose={() => setToast({ msg: '', type: 'ok' })}
      />
    </div>
  )
}

function ManagePlayerModal({
  card,
  lineup,
  isLineupLocked,
  activeMatchday,
  onClose,
  onSelectSlot,
  onRemoveSlot,
  onUpdated,
  setToast,
}) {
  const player = card.club_players
  const posKey = player?.position?.toUpperCase()
  const posInfo = POS_CONFIG[posKey] || { label: player?.position || 'Jugador', emoji: '⚽', shortPos: 'JUG', badge: '' }

  const [price, setPrice] = useState(card.current_price || '5')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isTitularSlotKey = Object.keys(lineup).find((k) => lineup[k] === card.id)
  const isTitular = Boolean(isTitularSlotKey)
  const isOnMarket = card.status === 'market'

  async function handleListForSale(e) {
    e.preventDefault()
    const numPrice = Number(price)
    if (isNaN(numPrice) || numPrice <= 0) {
      setError('Introdueix un preu vàlid superior a 0M')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const { error: rpcErr } = await supabase.rpc('list_player_for_sale', {
        p_card_id: card.id,
        p_price: numPrice,
      })

      if (rpcErr) {
        // Fallback directe
        await supabase
          .from('fantasy_cards')
          .update({
            status: 'market',
            current_price: numPrice,
            market_listed_at: new Date().toISOString(),
            market_expires_at: new Date(Date.now() + 2 * 86400000).toISOString(),
          })
          .eq('id', card.id)
      }

      setToast({
        msg: `${player?.full_name} s'ha posat a la venda per ${numPrice}M. Seguirà a la teva plantilla fins que algú el compri.`,
        type: 'ok',
      })
      onUpdated()
    } catch (err) {
      setError(err.message || 'Error posant el jugador a la venda')
      setSubmitting(false)
    }
  }

  async function handleCancelSale() {
    setSubmitting(true)
    setError('')
    try {
      const { error: updErr } = await supabase
        .from('fantasy_cards')
        .update({
          status: 'owned',
          market_listed_at: null,
          market_expires_at: null,
        })
        .eq('id', card.id)

      if (updErr) throw updErr

      setToast({
        msg: `${player?.full_name} s'ha retirat del mercat de fitxatges.`,
        type: 'ok',
      })
      onUpdated()
    } catch (err) {
      setError(err.message || 'Error retirant el jugador del mercat')
      setSubmitting(false)
    }
  }

  function handleQuickAlign() {
    if (posKey === 'PORTER') onSelectSlot('PORTER', card.id)
    else if (posKey === 'TANCA') onSelectSlot('TANCA', card.id)
    else if (posKey === 'PIVOT') onSelectSlot('PIVOT', card.id)
    else if (posKey === 'ALA') {
      if (!lineup['ALA_1']) onSelectSlot('ALA_1', card.id)
      else if (!lineup['ALA_2']) onSelectSlot('ALA_2', card.id)
      else onSelectSlot('ALA_1', card.id)
    }
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 animate-fade-in"
    >
      <div className="card w-full max-w-lg p-5 sm:p-6 space-y-5 relative max-h-[90vh] overflow-y-auto shadow-2xl border border-base-border">
        {/* Capçalera del modal */}
        <div className="flex items-center justify-between border-b border-base-border/80 pb-3.5 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 font-display font-bold text-xs sm:text-sm tracking-wide shrink-0 ${posInfo.badge}`}>
              <span>{posKey || posInfo.label?.toUpperCase()}</span>
              <span>{posInfo.emoji}</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-semibold text-lg text-ink truncate">
                {player?.full_name}
              </h3>
              <p className="text-xs text-ink-dim truncate">
                {player?.club_teams?.name} · Valor actual: <strong className="text-accent">{card.current_price}M</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-ink-dim hover:text-ink text-lg p-1.5 rounded-lg bg-base-raised shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Estat actual */}
        <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
          <div className="p-3 rounded-xl bg-base-raised border border-base-border/70">
            <div className="text-[11px] text-ink-faint uppercase font-medium">Punts totals</div>
            <div className="text-xs sm:text-sm font-display font-bold text-yellow-400 mt-0.5">
              {calculatePlayerPoints(player)} pts
            </div>
          </div>

          <div className="p-3 rounded-xl bg-base-raised border border-base-border/70">
            <div className="text-[11px] text-ink-faint uppercase font-medium">Alineació</div>
            <div className="text-xs sm:text-sm font-semibold text-ink mt-0.5">
              {isTitular ? (
                <span className="text-accent">Titular</span>
              ) : (
                <span className="text-ink-dim">🪑 Suplent</span>
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-base-raised border border-base-border/70">
            <div className="text-[11px] text-ink-faint uppercase font-medium">Estat al mercat</div>
            <div className="text-xs sm:text-sm font-semibold text-ink mt-0.5 truncate">
              {isOnMarket ? (
                <span className="text-amber-300 flex items-center gap-1">
                  <span>🏷️</span> En venda
                </span>
              ) : (
                <span className="text-ink-dim">🔒 No en venda</span>
              )}
            </div>
          </div>
        </div>

        {/* Secció 1: Posar o retirar del mercat de fitxatges */}
        <div className="p-4 rounded-xl bg-base-surface border border-base-border space-y-3">
          <h4 className="font-display font-semibold text-sm text-ink flex items-center gap-2">
            <span>🏷️</span> Mercat de fitxatges
          </h4>

          {isOnMarket ? (
            <div className="space-y-3">
              <p className="text-xs text-amber-300/90 leading-relaxed bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg">
                Aquest jugador ja està publicat al mercat per <strong>{card.current_price}M</strong>. La resta de mànagers poden fer ofertes per fitxar-lo.
              </p>
              <button
                type="button"
                disabled={submitting}
                onClick={handleCancelSale}
                className="w-full py-2.5 px-4 rounded-xl bg-danger/15 border border-danger/40 text-danger font-semibold text-xs sm:text-sm hover:bg-danger/25 transition-colors"
              >
                {submitting ? 'Retirant…' : '✕ Cancel·lar venda i retirar del mercat'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleListForSale} className="space-y-3">
              <p className="text-xs text-ink-dim leading-relaxed">
                Pots posar el jugador a la venda al preu que vulguis. Apareixerà al mercat durant 2 dies i seguirà al teu equip fins que algú el compri.
              </p>
              <div>
                <label className="text-xs text-ink-dim font-medium block mb-1">
                  Preu de venda (M) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="500"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="input text-sm pr-8 min-h-[42px]"
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-accent font-semibold text-xs">M</span>
                </div>
              </div>

              {error && <p className="text-danger text-xs">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full py-2.5 text-xs sm:text-sm font-semibold min-h-[42px] flex items-center justify-center gap-1.5"
              >
                {submitting ? 'Publicant…' : '🏷️ Posar a la venda'}
              </button>
            </form>
          )}
        </div>

        {/* Secció 2: Canviar titularitat */}
        <div className="p-4 rounded-xl bg-base-surface border border-base-border space-y-3">
          <h4 className="font-display font-semibold text-sm text-ink flex items-center gap-2">
            <span>⚽</span> Cinc titular
          </h4>

          {isLineupLocked ? (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-1">
              <p className="font-semibold flex items-center gap-1.5 text-amber-100">
                <span>🔒</span> Jornada {activeMatchday?.number} en curs
              </p>
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                Alineacions bloquejades fins el dia {formatDateDMY(activeMatchday?.ends_at)} a les 24h.
              </p>
            </div>
          ) : isTitular ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => onRemoveSlot(isTitularSlotKey)}
              className="w-full py-2.5 px-4 rounded-xl bg-base-raised hover:bg-base-border border border-base-border text-ink-dim hover:text-ink font-semibold text-xs sm:text-sm transition-colors flex items-center justify-center gap-2"
            >
              <span>🪑</span> Enviar a la banqueta
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleQuickAlign}
              className="w-full py-2.5 px-4 rounded-xl bg-accent/15 hover:bg-accent/25 border border-accent/40 text-accent font-semibold text-xs sm:text-sm transition-colors flex items-center justify-center gap-2"
            >
              <span>⚽</span> Alinear al cinc titular
            </button>
          )}
        </div>

        <div className="pt-2 border-t border-base-border/70 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost py-2 px-5 text-xs sm:text-sm"
          >
            Tancar
          </button>
        </div>
      </div>
    </div>
  )
}

function SelectPlayerModal({
  slotKey,
  cards,
  lineup,
  onSelect,
  onRemove,
  onClose,
  saving,
}) {
  const slot = SLOT_INFO[slotKey]
  if (!slot) return null

  // Filtrat estricte per posició requerida
  const eligibleCards = cards.filter(
    (c) => c.club_players?.position?.toUpperCase() === slot.position.toUpperCase()
  )

  const currentCardId = lineup[slotKey]

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
    >
      <div className="card w-full max-w-md p-5 sm:p-6 space-y-4 relative max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between border-b border-base-border pb-3">
          <div>
            <h3 className="font-display font-semibold text-lg text-ink flex items-center gap-2">
              <span>{slot.icon}</span> {slot.label}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-ink-dim hover:text-ink text-lg p-1"
          >
            ✕
          </button>
        </div>

        {eligibleCards.length === 0 ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm text-ink-dim">
              No tens cap {slot.label.toLowerCase()} a la teva plantilla.
            </p>
            <p className="text-xs text-ink-faint">
              Acudeix al <span className="text-ink-dim font-medium">Mercat de Fitxatges</span> per fitxar un jugador d'aquesta posició.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-dim">Tria el jugador que vols col·locar com a titular:</p>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {eligibleCards.map((c) => {
                const isCurrentInSlot = c.id === currentCardId
                const otherSlotKey = Object.keys(lineup).find(
                  (k) => k !== slotKey && lineup[k] === c.id
                )
                const isOtherSlot = !!otherSlotKey
                const isForSale = c.status === 'market'

                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={saving || isCurrentInSlot}
                    onClick={() => onSelect(slotKey, c.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                      isCurrentInSlot
                        ? 'border-accent bg-accent/15 cursor-default ring-1 ring-accent'
                        : 'border-base-border bg-base-surface hover:bg-base-raised hover:border-accent/40 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-base-raised border border-base-border flex items-center justify-center font-display font-bold text-xs text-accent">
                        {slot.shortPos}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-ink truncate flex items-center gap-1.5">
                          <span className="text-sm select-none">{slot.icon}</span>
                          <span className="truncate">{c.club_players?.full_name}</span>
                          {isForSale && (
                            <span className="text-[10px] leading-none bg-[#0B1220] border border-white/30 rounded-full p-0.5 shadow-sm">
                              🏷️
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-accent font-display font-medium">
                          {c.current_price}M
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {isCurrentInSlot && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-accent/20 text-accent font-semibold">
                          Titular actual
                        </span>
                      )}
                      {isOtherSlot && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
                          Moure de {SLOT_INFO[otherSlotKey]?.label || otherSlotKey}
                        </span>
                      )}
                      {!isCurrentInSlot && !isOtherSlot && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-base-raised text-ink-dim">
                          A la banqueta
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {currentCardId && (
          <div className="pt-3 border-t border-base-border flex items-center justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => onRemove(slotKey)}
              className="text-xs text-ink-dim hover:text-ink py-2 px-3.5 rounded-lg bg-base-raised hover:bg-base-border transition-colors font-medium flex items-center gap-1.5"
            >
              <span>🪑</span> Enviar a la banqueta
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
