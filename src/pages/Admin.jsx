import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatDateDMY, getCurrentMatchday } from '../lib/matchdayUtils'
import Topbar from '../components/Topbar'
import Toast from '../components/Toast'

function timeLeft(expiresAt) {
  if (!expiresAt) return null
  const diffMs = new Date(expiresAt).getTime() - Date.now()
  if (diffMs <= 0) return 'Expira avui'
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `${days}d ${hours}h`
  return `${hours}h`
}

const TABS = ['Equips i jugadors', 'Mercat setmanal', 'Ofertes pendents', 'Jornades', 'Usuaris']

const TAB_DESCRIPTIONS = {
  'Equips i jugadors': "Panell per gestionar el planter del club: crear equips, afegir nens nous, canviar-los de posició o equip i ajustar el seu preu.",
  'Mercat setmanal': "Panell per controlar els jugadors disponibles al mercat de fitxatges i modificar els seus preus de sortida.",
  'Ofertes pendents': "Panell per revisar les ofertes de jugadors lliures del club. S'atorguen automàticament al millor postor en expirar el període de mercat, o l'administrador pot acceptar-les/rebutjar-les manualment.",
  'Jornades': "Panell per crear i gestionar el calendari de jornades de lliga i configurar les seves dates d'inici i final.",
  'Usuaris': "Panell per crear nous managers, assignar rols (admin/entrenador), modificar pressupostos i canviar contrasenyes.",
}

export default function Admin() {
  const [tab, setTab] = useState(TABS[0])

  return (
    <div>
      <Topbar title="Administració" subtitle="Accés només per a l'administrador del joc" />
      <div className="px-4 pt-4 sm:px-8 sm:pt-6 flex gap-2 border-b border-base-border overflow-x-auto pb-1 -mb-px">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap min-h-[40px] flex items-center ${
              tab === t ? 'border-accent text-accent' : 'border-transparent text-ink-dim hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="p-4 sm:p-8 space-y-5">
        <div className="bg-base-surface/80 border border-base-border/70 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-ink-dim flex items-center gap-2.5 shadow-sm">
          <span className="text-accent text-base select-none">ℹ️</span>
          <span className="font-normal text-ink/90">{TAB_DESCRIPTIONS[tab]}</span>
        </div>

        {tab === 'Equips i jugadors' && <TeamsAndPlayersPanel />}
        {tab === 'Mercat setmanal' && <MarketPanel />}
        {tab === 'Ofertes pendents' && <OffersPanel />}
        {tab === 'Jornades' && <MatchdaysPanel />}
        {tab === 'Usuaris' && <UsersPanel />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PANELL D'EQUIPS I JUGADORS
// ---------------------------------------------------------------------------
const POS_CONFIG = {
  PORTER: { label: 'Porter', emoji: '🧤', badge: 'bg-purple-500/20 text-purple-300 border border-purple-500/30' },
  TANCA: { label: 'Tanca', emoji: '🛡️', badge: 'bg-blue-500/20 text-blue-300 border border-blue-500/30' },
  ALA: { label: 'Ala', emoji: '⚡', badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' },
  PIVOT: { label: 'Pivot', emoji: '🎯', badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' },
}

const PRESET_CATEGORIES = ['Escolar', 'Prebenjamí', 'Benjamí', 'Aleví', 'Infantil', 'Cadet', 'Juvenil', 'Sènior', 'Veterans']

function TeamsAndPlayersPanel() {
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState({ text: '', type: 'ok' })

  // Filtres
  const [selectedTeamId, setSelectedTeamId] = useState('all')
  const [selectedPos, setSelectedPos] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Modals
  const [showCreatePlayer, setShowCreatePlayer] = useState(false)
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState(null)
  const [editingTeam, setEditingTeam] = useState(null)
  const [deletingPlayer, setDeletingPlayer] = useState(null)

  async function loadData() {
    setLoading(true)
    try {
      const [teamsRes, playersRes] = await Promise.all([
        supabase.from('club_teams').select('*').order('name'),
        supabase
          .from('club_players')
          .select(`
            id, full_name, position, team_id, active, created_at,
            club_teams ( id, name, category ),
            fantasy_cards (
              id, current_price, status, owner_manager_id,
              managers ( display_name, username )
            )
          `)
          .order('full_name'),
      ])

      setTeams(teamsRes.data || [])
      setPlayers(playersRes.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Jugadors filtrats
  const filteredPlayers = players.filter((p) => {
    if (selectedTeamId !== 'all' && p.team_id !== selectedTeamId) return false
    if (selectedPos !== 'all' && p.position !== selectedPos) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchName = p.full_name?.toLowerCase().includes(q)
      const matchTeam = p.club_teams?.name?.toLowerCase().includes(q)
      if (!matchName && !matchTeam) return false
    }
    return true
  })

  // Estadístiques
  const totalTeams = teams.length
  const totalPlayers = players.length
  const getPlayerCard = (p) => (Array.isArray(p.fantasy_cards) ? p.fantasy_cards[0] : p.fantasy_cards)
  const marketPlayers = players.filter((p) => getPlayerCard(p)?.status === 'market').length
  const ownedPlayers = players.filter((p) => !!getPlayerCard(p)?.owner_manager_id).length

  if (loading) return <p className="text-ink-dim text-sm py-4">Carregant equips i jugadors…</p>

  return (
    <div className="space-y-6">
      {/* Targetes de resum */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="card p-3.5 sm:p-4">
          <div className="text-xs text-ink-dim font-medium">Equips del club</div>
          <div className="text-xl sm:text-2xl font-bold font-display text-ink mt-1 flex items-center gap-1.5">
            <span>🛡️</span> {totalTeams}
          </div>
        </div>
        <div className="card p-3.5 sm:p-4">
          <div className="text-xs text-ink-dim font-medium">Jugadors totals</div>
          <div className="text-xl sm:text-2xl font-bold font-display text-accent mt-1 flex items-center gap-1.5">
            <span>🏃</span> {totalPlayers}
          </div>
        </div>
        <div className="card p-3.5 sm:p-4">
          <div className="text-xs text-ink-dim font-medium">Al mercat</div>
          <div className="text-xl sm:text-2xl font-bold font-display text-ok mt-1 flex items-center gap-1.5">
            <span>🏷️</span> {marketPlayers}
          </div>
        </div>
        <div className="card p-3.5 sm:p-4">
          <div className="text-xs text-ink-dim font-medium">Amb propietari</div>
          <div className="text-xl sm:text-2xl font-bold font-display text-purple-400 mt-1 flex items-center gap-1.5">
            <span>👑</span> {ownedPlayers}
          </div>
        </div>
      </div>

      {/* Toast flotant de feedback */}
      <Toast
        message={msg.text}
        type={msg.type}
        onClose={() => setMsg({ text: '', type: 'ok' })}
      />

      {/* Secció de Gestió d'Equips */}
      <div className="card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-base-border/70 pb-3">
          <div>
            <h3 className="font-display font-semibold text-base sm:text-lg text-ink flex items-center gap-2">
              <span>⚽</span> Equips del club
            </h3>
            <p className="text-xs text-ink-dim mt-0.5">
              Crea noves categories o modifica els equips existents.
            </p>
          </div>
          <button
            onClick={() => setShowCreateTeam(true)}
            className="btn-primary text-xs sm:text-sm py-2 px-3.5 min-h-[38px] flex items-center justify-center gap-1.5 font-semibold w-full sm:w-auto"
          >
            <span>➕</span> Crear nou equip
          </button>
        </div>

        {teams.length === 0 ? (
          <p className="text-xs text-ink-dim py-2">No hi ha cap equip creat. Fes clic a "Crear nou equip".</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {teams.map((t) => {
              const teamPlayerCount = players.filter((p) => p.team_id === t.id).length
              const isFiltered = selectedTeamId === t.id
              return (
                <div
                  key={t.id}
                  className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                    isFiltered
                      ? 'bg-accent/15 border-accent/40 shadow-sm'
                      : 'bg-base-raised/60 border-base-border hover:border-base-border/80'
                  }`}
                >
                  <button
                    onClick={() => setSelectedTeamId(isFiltered ? 'all' : t.id)}
                    className="text-left flex-1 min-w-0"
                    title={`Filtrar jugadors de ${t.name}`}
                  >
                    <div className="font-semibold text-xs sm:text-sm text-ink truncate flex items-center gap-1.5">
                      <span>{t.name}</span>
                      {isFiltered && <span className="text-[10px] text-accent font-bold">✓</span>}
                    </div>
                    <div className="text-[11px] text-ink-dim mt-0.5 flex items-center gap-2">
                      <span>{t.category || 'Sense cat.'}</span>
                      <span>·</span>
                      <span className="font-medium text-ink-faint">{teamPlayerCount} jugadors</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setEditingTeam(t)}
                    className="btn-ghost text-xs p-1.5 text-ink-dim hover:text-accent rounded-lg"
                    title="Editar equip"
                  >
                    ✏️
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Secció de Gestió de Jugadors */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-semibold text-base sm:text-lg text-ink flex items-center gap-2">
              <span>🏃</span> Jugadors ({filteredPlayers.length} de {players.length})
            </h3>
            <p className="text-xs text-ink-dim mt-0.5">
              Afegeix nens nous, canvia'ls de posició o equip, i assigna el seu preu de mercat.
            </p>
          </div>
          <button
            onClick={() => setShowCreatePlayer(true)}
            className="btn-primary text-xs sm:text-sm py-2 px-4 min-h-[40px] flex items-center justify-center gap-2 font-semibold w-full sm:w-auto shadow-md"
          >
            <span>➕</span> Afegir nou jugador
          </button>
        </div>

        {/* Barra de Filtres */}
        <div className="card p-3 sm:p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Cerca per nom */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim text-sm select-none pointer-events-none">🔍</span>
              <input
                type="text"
                placeholder="Cerca jugador..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input text-xs sm:text-sm py-2 pr-8 !pl-9 w-full min-h-[38px]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink text-xs p-1"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filtre per equip */}
            <div>
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="input text-xs sm:text-sm py-2 px-2.5 w-full min-h-[38px]"
              >
                <option value="all">Tots els equips ({players.length})</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({players.filter((p) => p.team_id === t.id).length})
                  </option>
                ))}
              </select>
            </div>

            {/* Filtre per posició */}
            <div>
              <select
                value={selectedPos}
                onChange={(e) => setSelectedPos(e.target.value)}
                className="input text-xs sm:text-sm py-2 px-2.5 w-full min-h-[38px]"
              >
                <option value="all">Totes les posicions</option>
                <option value="PORTER">🧤 Porter</option>
                <option value="TANCA">🛡️ Tanca</option>
                <option value="ALA">⚡ Ala</option>
                <option value="PIVOT">🎯 Pivot</option>
              </select>
            </div>
          </div>
        </div>

        {/* Llistat de jugadors */}
        {filteredPlayers.length === 0 ? (
          <div className="card p-8 text-center text-ink-dim text-sm space-y-2">
            <p>No s'ha trobat cap jugador amb els filtres seleccionats.</p>
            {players.length === 0 ? (
              <button
                onClick={() => setShowCreatePlayer(true)}
                className="btn-primary text-xs py-1.5 px-3 font-semibold mt-2"
              >
                + Afegir el primer jugador
              </button>
            ) : (
              <button
                onClick={() => {
                  setSelectedTeamId('all')
                  setSelectedPos('all')
                  setSearchQuery('')
                }}
                className="btn-ghost text-xs text-accent underline mt-1"
              >
                Restablir filtres
              </button>
            )}
          </div>
        ) : (
          <div className="card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="text-ink-faint text-left border-b border-base-border bg-base-raised/40">
                    <th className="py-2.5 sm:py-3 px-3 sm:px-4 font-normal">Jugador</th>
                    <th className="py-2.5 sm:py-3 px-2 sm:px-4 font-normal">Posició</th>
                    <th className="hidden sm:table-cell py-2.5 sm:py-3 px-3 sm:px-4 font-normal">Equip</th>
                    <th className="py-2.5 sm:py-3 px-2 sm:px-4 font-normal">Preu</th>
                    <th className="hidden md:table-cell py-2.5 sm:py-3 px-3 sm:px-4 font-normal">Estat fantasy</th>
                    <th className="py-2.5 sm:py-3 px-3 sm:px-4 font-normal text-right">Accions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlayers.map((p) => {
                    const card = Array.isArray(p.fantasy_cards) ? p.fantasy_cards[0] : p.fantasy_cards
                    const posInfo = POS_CONFIG[p.position] || { label: p.position, emoji: '⚽', badge: 'bg-base-raised text-ink-dim' }
                    const price = card?.current_price ?? 5
                    const owner = card?.managers?.display_name
                    const status = card?.status

                    return (
                      <tr
                        key={p.id}
                        className="border-b border-base-border/60 last:border-0 hover:bg-base-surface/40 transition-colors"
                      >
                        <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-medium text-ink">
                          <div className="font-semibold text-ink text-xs sm:text-sm">{p.full_name}</div>
                          <div className="text-[11px] text-ink-dim sm:hidden">
                            {p.club_teams?.name}
                          </div>
                        </td>

                        <td className="py-2.5 sm:py-3 px-2 sm:px-4">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] sm:text-xs px-2 py-0.5 rounded-full font-medium ${posInfo.badge}`}
                          >
                            <span>{posInfo.emoji}</span>
                            <span>{posInfo.label}</span>
                          </span>
                        </td>

                        <td className="hidden sm:table-cell py-2.5 sm:py-3 px-3 sm:px-4 text-ink-dim">
                          <span className="font-medium text-ink">{p.club_teams?.name}</span>
                          {p.club_teams?.category && (
                            <span className="text-[11px] text-ink-faint block">{p.club_teams.category}</span>
                          )}
                        </td>

                        <td className="py-2.5 sm:py-3 px-2 sm:px-4">
                          <span className="text-accent font-display font-semibold text-xs sm:text-sm whitespace-nowrap">
                            {price}M
                          </span>
                        </td>

                        <td className="hidden md:table-cell py-2.5 sm:py-3 px-3 sm:px-4">
                          {owner ? (
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 font-medium">
                              👤 {owner}
                            </span>
                          ) : status === 'market' ? (
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-ok/15 text-ok border border-ok/30 font-medium">
                              🏷️ Al mercat
                            </span>
                          ) : (
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-base-raised text-ink-dim border border-base-border font-medium">
                              Lliure
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-right">
                          <div className="flex items-center justify-end gap-1 sm:gap-2">
                            <button
                              onClick={() => setEditingPlayer(p)}
                              className="btn-ghost text-xs py-1.5 px-2.5 text-ink hover:text-accent flex items-center gap-1"
                              title="Modificar dades d'aquest jugador"
                            >
                              <span>✏️</span>
                              <span className="hidden sm:inline">Modificar</span>
                            </button>
                            <button
                              onClick={() => setDeletingPlayer(p)}
                              className="btn-ghost text-xs py-1.5 px-2 text-ink-faint hover:text-danger"
                              title="Eliminar jugador"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreatePlayer && (
        <CreatePlayerModal
          teams={teams}
          defaultTeamId={selectedTeamId !== 'all' ? selectedTeamId : teams[0]?.id}
          onClose={() => setShowCreatePlayer(false)}
          onSuccess={(name) => {
            setShowCreatePlayer(false)
            setMsg({ text: `Jugador "${name}" afegit correctament al club!`, type: 'ok' })
            loadData()
          }}
        />
      )}

      {showCreateTeam && (
        <CreateTeamModal
          onClose={() => setShowCreateTeam(false)}
          onSuccess={(name) => {
            setShowCreateTeam(false)
            setMsg({ text: `Equip "${name}" creat correctament!`, type: 'ok' })
            loadData()
          }}
        />
      )}

      {editingPlayer && (
        <EditPlayerModal
          player={editingPlayer}
          teams={teams}
          onClose={() => setEditingPlayer(null)}
          onSaved={() => {
            const name = editingPlayer.full_name
            setEditingPlayer(null)
            setMsg({ text: `Jugador "${name}" modificat correctament!`, type: 'ok' })
            loadData()
          }}
          onDeleted={() => {
            const name = editingPlayer.full_name
            setEditingPlayer(null)
            setMsg({ text: `Jugador "${name}" eliminat del club.`, type: 'ok' })
            loadData()
          }}
        />
      )}

      {editingTeam && (
        <EditTeamModal
          team={editingTeam}
          playerCount={players.filter((p) => p.team_id === editingTeam.id).length}
          onClose={() => setEditingTeam(null)}
          onSaved={() => {
            const name = editingTeam.name
            setEditingTeam(null)
            setMsg({ text: `Equip "${name}" actualitzat correctament!`, type: 'ok' })
            loadData()
          }}
          onDeleted={() => {
            const name = editingTeam.name
            setEditingTeam(null)
            if (selectedTeamId === editingTeam.id) setSelectedTeamId('all')
            setMsg({ text: `Equip "${name}" eliminat correctament.`, type: 'ok' })
            loadData()
          }}
        />
      )}

      {deletingPlayer && (
        <DeletePlayerModal
          player={deletingPlayer}
          onClose={() => setDeletingPlayer(null)}
          onConfirm={async () => {
            try {
              const { error } = await supabase.rpc('admin_delete_player', { p_player_id: deletingPlayer.id })
              if (error) {
                // Fallback directe
                await supabase.from('club_players').delete().eq('id', deletingPlayer.id)
              }
              const name = deletingPlayer.full_name
              setDeletingPlayer(null)
              setMsg({ text: `Jugador "${name}" eliminat del club.`, type: 'ok' })
              loadData()
            } catch (err) {
              alert('Error eliminant jugador: ' + err.message)
            }
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MODALS D'EQUIPS I JUGADORS
// ---------------------------------------------------------------------------

function CreatePlayerModal({ teams, defaultTeamId, onClose, onSuccess }) {
  const [fullName, setFullName] = useState('')
  const [teamId, setTeamId] = useState(defaultTeamId || teams[0]?.id || '')
  const [position, setPosition] = useState('ALA')
  const [price, setPrice] = useState('5')
  const [status, setStatus] = useState('market') // 'market' o 'owned'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fullName.trim()) {
      setError('El nom del jugador és obligatori')
      return
    }
    if (!teamId) {
      setError('Has de seleccionar un equip')
      return
    }

    setSaving(true)
    setError('')

    try {
      // 1. Intentar via RPC atòmic
      const { error: rpcError } = await supabase.rpc('admin_create_player', {
        p_team_id: teamId,
        p_full_name: fullName.trim(),
        p_position: position,
        p_initial_price: Number(price) || 5,
        p_status: status,
      })

      if (rpcError) {
        // Fallback directe en dues passes
        const { data: newPlayer, error: pErr } = await supabase
          .from('club_players')
          .insert({
            team_id: teamId,
            full_name: fullName.trim(),
            position,
            active: true,
          })
          .select()
          .single()

        if (pErr) throw pErr

        const isMarket = status === 'market'
        await supabase.from('fantasy_cards').insert({
          club_player_id: newPlayer.id,
          current_price: Number(price) || 5,
          status,
          market_listed_at: isMarket ? new Date().toISOString() : null,
          market_expires_at: isMarket ? new Date(Date.now() + 7 * 86400000).toISOString() : null,
        })
      }

      onSuccess(fullName.trim())
    } catch (err) {
      setError(err.message || 'Error creant el jugador')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6 space-y-5 relative max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between border-b border-base-border pb-3">
          <div>
            <h3 className="font-display font-semibold text-lg text-ink flex items-center gap-2">
              <span>➕</span> Afegir nou jugador al club
            </h3>
            <p className="text-xs text-ink-dim mt-0.5">
              Introdueix les dades del nen per incorporar-lo al planter i al mercat fantasy.
            </p>
          </div>
          <button onClick={onClose} className="text-ink-dim hover:text-ink text-lg p-1">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-ink-dim mb-1 block">Nom i cognoms *</label>
            <input
              type="text"
              className="input text-sm"
              placeholder="p.ex. Marc Soler Vidal"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium text-ink-dim mb-1 block">Equip del club *</label>
            {teams.length === 0 ? (
              <p className="text-xs text-danger">No hi ha equips. Crea primer un equip.</p>
            ) : (
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="input text-sm"
                required
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.category ? `(${t.category})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Selector de posició */}
          <div>
            <label className="text-sm font-medium text-ink-dim mb-1.5 block">Posició a la pista *</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(POS_CONFIG).map(([posKey, pos]) => {
                const isSelected = position === posKey
                return (
                  <button
                    key={posKey}
                    type="button"
                    onClick={() => setPosition(posKey)}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      isSelected
                        ? `${pos.badge} ring-2 ring-accent/50 scale-[1.02]`
                        : 'bg-base-raised text-ink-dim border-base-border hover:text-ink'
                    }`}
                  >
                    <span>{pos.emoji}</span>
                    <span>{pos.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Preu inicial i Estat */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-sm font-medium text-ink-dim mb-1 block">Preu inicial Fantasy (M)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="100"
                  className="input text-sm pr-8"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-accent font-semibold text-xs">M</span>
              </div>
              <span className="text-[11px] text-ink-faint mt-0.5 block">Valor amb què sortirà al joc.</span>
            </div>

            <div>
              <label className="text-sm font-medium text-ink-dim mb-1 block">Estat inicial</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="input text-sm"
              >
                <option value="market">🏷️ Posar al mercat (7 dies)</option>
                <option value="owned">🔒 Lliure (sense mercat)</option>
              </select>
            </div>
          </div>

          {error && <p className="text-danger text-sm">{error}</p>}

          <div className="flex gap-3 pt-3 border-t border-base-border">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 text-sm py-2.5">
              Cancel·lar
            </button>
            <button
              type="submit"
              disabled={saving || teams.length === 0}
              className="btn-primary flex-1 text-sm py-2.5 font-semibold"
            >
              {saving ? 'Afegint…' : 'Afegir jugador'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditPlayerModal({ player, teams, onClose, onSaved, onDeleted }) {
  const card = Array.isArray(player.fantasy_cards) ? player.fantasy_cards[0] : player.fantasy_cards
  const [fullName, setFullName] = useState(player.full_name)
  const [teamId, setTeamId] = useState(player.team_id)
  const [position, setPosition] = useState(player.position)
  const [price, setPrice] = useState(card?.current_price ?? 5)
  const [status, setStatus] = useState(card?.status || 'market')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fullName.trim()) {
      setError('El nom del jugador és obligatori')
      return
    }

    setSaving(true)
    setError('')

    try {
      const { error: rpcError } = await supabase.rpc('admin_update_player', {
        p_player_id: player.id,
        p_team_id: teamId,
        p_full_name: fullName.trim(),
        p_position: position,
        p_price: Number(price),
        p_status: status,
      })

      if (rpcError) {
        // Fallback directe
        await supabase
          .from('club_players')
          .update({ full_name: fullName.trim(), team_id: teamId, position })
          .eq('id', player.id)

        if (card?.id) {
          await supabase
            .from('fantasy_cards')
            .update({ current_price: Number(price), status })
            .eq('id', card.id)
        }
      }

      onSaved()
    } catch (err) {
      setError(err.message || 'Error modificant el jugador')
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const { error: rpcError } = await supabase.rpc('admin_delete_player', { p_player_id: player.id })
      if (rpcError) {
        await supabase.from('club_players').delete().eq('id', player.id)
      }
      onDeleted()
    } catch (err) {
      setError(err.message || 'Error eliminant el jugador')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6 space-y-5 relative max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between border-b border-base-border pb-3">
          <div>
            <h3 className="font-display font-semibold text-lg text-ink flex items-center gap-2">
              <span>✏️</span> Modificar jugador
            </h3>
            <p className="text-xs text-ink-dim mt-0.5">
              Edita la informació de <strong className="text-accent">{player.full_name}</strong>
            </p>
          </div>
          <button onClick={onClose} className="text-ink-dim hover:text-ink text-lg p-1">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-ink-dim mb-1 block">Nom i cognoms *</label>
            <input
              type="text"
              className="input text-sm"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-ink-dim mb-1 block">Equip del club</label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="input text-sm"
              required
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.category ? `(${t.category})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Posició */}
          <div>
            <label className="text-sm font-medium text-ink-dim mb-1.5 block">Posició a la pista</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(POS_CONFIG).map(([posKey, pos]) => {
                const isSelected = position === posKey
                return (
                  <button
                    key={posKey}
                    type="button"
                    onClick={() => setPosition(posKey)}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      isSelected
                        ? `${pos.badge} ring-2 ring-accent/50 scale-[1.02]`
                        : 'bg-base-raised text-ink-dim border-base-border hover:text-ink'
                    }`}
                  >
                    <span>{pos.emoji}</span>
                    <span>{pos.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Preu i Estat */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-sm font-medium text-ink-dim mb-1 block">Preu Fantasy (M)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  className="input text-sm pr-8"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-accent font-semibold text-xs">M</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-ink-dim mb-1 block">Estat al mercat</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="input text-sm"
              >
                <option value="market">🏷️ Al mercat</option>
                <option value="owned">🔒 A plantilla / Lliure</option>
              </select>
            </div>
          </div>

          {card?.managers?.display_name && (
            <div className="p-3 bg-base-raised rounded-xl text-xs text-ink-dim flex items-center justify-between">
              <span>Propietari actual:</span>
              <span className="font-semibold text-accent">@{card.managers.username} ({card.managers.display_name})</span>
            </div>
          )}

          {error && <p className="text-danger text-sm">{error}</p>}

          <div className="flex gap-3 pt-3 border-t border-base-border">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 text-sm py-2.5">
              Cancel·lar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1 text-sm py-2.5 font-semibold"
            >
              {saving ? 'Guardant…' : 'Guardar canvis'}
            </button>
          </div>
        </form>

        {/* Zona perill: Eliminar jugador */}
        <div className="pt-3 border-t border-base-border/70">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-danger hover:underline flex items-center gap-1 font-medium"
            >
              <span>🗑️</span>
              <span>Donar de baixa / Eliminar aquest jugador</span>
            </button>
          ) : (
            <div className="p-3.5 bg-danger/10 border border-danger/30 rounded-xl space-y-2">
              <p className="text-xs font-semibold text-danger">
                ⚠️ Segur que vols eliminar {player.full_name}? S'eliminarà també la seva fitxa fantasy i estadístiques.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="bg-danger text-white text-xs px-3.5 py-1.5 rounded-lg font-bold hover:brightness-110 transition-all"
                >
                  {deleting ? 'Eliminant…' : 'Sí, eliminar definitivament'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="btn-ghost text-xs py-1.5 px-3 text-ink-dim"
                >
                  Cancel·lar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DeletePlayerModal({ player, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-base-border pb-3">
          <h3 className="font-display font-semibold text-lg text-danger flex items-center gap-2">
            <span>🗑️</span> Eliminar jugador
          </h3>
          <button onClick={onClose} className="text-ink-dim hover:text-ink text-lg p-1">
            ✕
          </button>
        </div>

        <p className="text-sm text-ink">
          Estàs a punt d'eliminar a <strong>{player.full_name}</strong> ({player.club_teams?.name}).
        </p>
        <p className="text-xs text-ink-dim">
          Aquesta acció eliminarà la seva fitxa del mercat, estadístiques de partits i les alineacions on estigui present.
        </p>

        <div className="flex gap-3 pt-3 border-t border-base-border">
          <button type="button" onClick={onClose} className="btn-ghost flex-1 text-sm py-2.5">
            Cancel·lar
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true)
              await onConfirm()
            }}
            className="bg-danger text-white flex-1 text-sm py-2.5 rounded-xl font-semibold hover:brightness-110 transition-all"
          >
            {deleting ? 'Eliminant…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateTeamModal({ onClose, onSuccess }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Aleví')
  const [gender, setGender] = useState('Mixt') // 'Mixt' | 'Femení'
  const [customCategory, setCustomCategory] = useState('')
  const [useCustomCategory, setUseCustomCategory] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) {
      setError("El nom de l'equip és obligatori")
      return
    }

    setSaving(true)
    setError('')

    const baseCategory = useCustomCategory ? customCategory.trim() : category
    const finalCategory = baseCategory ? `${baseCategory} (${gender})` : gender

    try {
      const { error: rpcError } = await supabase.rpc('admin_create_team', {
        p_name: name.trim(),
        p_category: finalCategory || null,
      })

      if (rpcError) {
        const { error: insertErr } = await supabase.from('club_teams').insert({
          name: name.trim(),
          category: finalCategory || null,
        })
        if (insertErr) throw insertErr
      }

      onSuccess(name.trim())
    } catch (err) {
      setError(err.message || "Error creant l'equip")
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6 space-y-5 relative shadow-2xl">
        <div className="flex items-center justify-between border-b border-base-border pb-3">
          <div>
            <h3 className="font-display font-semibold text-lg text-ink flex items-center gap-2">
              <span>🛡️</span> Crear nou equip
            </h3>
            <p className="text-xs text-ink-dim mt-0.5">
              Afegeix una nova categoria o equip al club Vincit.
            </p>
          </div>
          <button onClick={onClose} className="text-ink-dim hover:text-ink text-lg p-1">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-ink-dim mb-1 block">Nom de l'equip *</label>
            <input
              type="text"
              className="input text-sm"
              placeholder="p.ex. Aleví A, Cadet B..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          {/* Modalitat / Gènere */}
          <div>
            <label className="text-sm font-medium text-ink-dim mb-1.5 block">Modalitat / Gènere *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGender('Mixt')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center transition-all ${
                  gender === 'Mixt'
                    ? 'bg-accent text-base border-accent font-bold shadow-sm'
                    : 'bg-base-raised text-ink-dim border-base-border hover:text-ink'
                }`}
              >
                <span>Equip Mixt</span>
              </button>
              <button
                type="button"
                onClick={() => setGender('Femení')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center transition-all ${
                  gender === 'Femení'
                    ? 'bg-accent text-base border-accent font-bold shadow-sm'
                    : 'bg-base-raised text-ink-dim border-base-border hover:text-ink'
                }`}
              >
                <span>Equip Femení</span>
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-ink-dim mb-1.5 block">Categoria</label>
            {!useCustomCategory ? (
              <div className="space-y-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="input text-sm"
                >
                  {PRESET_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setUseCustomCategory(true)}
                  className="text-xs text-accent hover:underline block"
                >
                  + Escriure una altra categoria
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  className="input text-sm"
                  placeholder="Escriu la categoria..."
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setUseCustomCategory(false)}
                  className="text-xs text-ink-dim hover:underline block"
                >
                  ← Tornar al llistat predefinit
                </button>
              </div>
            )}
          </div>

          {error && <p className="text-danger text-sm">{error}</p>}

          <div className="flex gap-3 pt-3 border-t border-base-border">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 text-sm py-2.5">
              Cancel·lar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1 text-sm py-2.5 font-semibold"
            >
              {saving ? 'Creant…' : 'Crear equip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditTeamModal({ team, playerCount, onClose, onSaved, onDeleted }) {
  const [name, setName] = useState(team.name)
  
  // Extreure gènere i categoria base
  const initialIsFem = team.category?.toLowerCase().includes('femení') || team.category?.toLowerCase().includes('femeni')
  const initialGender = initialIsFem ? 'Femení' : 'Mixt'
  const initialBaseCat = team.category
    ? team.category.replace(/\s*\((femení|femeni|mixt)\)/i, '').replace(/\s*(femení|femeni|mixt)/i, '').trim()
    : 'Aleví'

  const isPreset = PRESET_CATEGORIES.includes(initialBaseCat)
  const [category, setCategory] = useState(isPreset ? initialBaseCat : (PRESET_CATEGORIES[0] || 'Aleví'))
  const [gender, setGender] = useState(initialGender)
  const [customCategory, setCustomCategory] = useState(!isPreset && initialBaseCat ? initialBaseCat : '')
  const [useCustomCategory, setUseCustomCategory] = useState(!isPreset && !!initialBaseCat)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) {
      setError("El nom de l'equip és obligatori")
      return
    }

    setSaving(true)
    setError('')

    const baseCategory = useCustomCategory ? customCategory.trim() : category
    const finalCategory = baseCategory ? `${baseCategory} (${gender})` : gender

    try {
      const { error: rpcError } = await supabase.rpc('admin_update_team', {
        p_team_id: team.id,
        p_name: name.trim(),
        p_category: finalCategory || null,
      })

      if (rpcError) {
        const { error: updateErr } = await supabase
          .from('club_teams')
          .update({ name: name.trim(), category: finalCategory || null })
          .eq('id', team.id)
        if (updateErr) throw updateErr
      }

      onSaved()
    } catch (err) {
      setError(err.message || "Error modificant l'equip")
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const { error: rpcError } = await supabase.rpc('admin_delete_team', { p_team_id: team.id })
      if (rpcError) {
        const { error: delErr } = await supabase.from('club_teams').delete().eq('id', team.id)
        if (delErr) throw delErr
      }
      onDeleted()
    } catch (err) {
      setError(err.message || "Error eliminant l'equip")
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6 space-y-5 relative shadow-2xl">
        <div className="flex items-center justify-between border-b border-base-border pb-3">
          <div>
            <h3 className="font-display font-semibold text-lg text-ink flex items-center gap-2">
              <span>✏️</span> Modificar equip
            </h3>
            <p className="text-xs text-ink-dim mt-0.5">
              Edita el nom o la categoria de l'equip.
            </p>
          </div>
          <button onClick={onClose} className="text-ink-dim hover:text-ink text-lg p-1">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-ink-dim mb-1 block">Nom de l'equip *</label>
            <input
              type="text"
              className="input text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Modalitat / Gènere */}
          <div>
            <label className="text-sm font-medium text-ink-dim mb-1.5 block">Modalitat / Gènere *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGender('Mixt')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center transition-all ${
                  gender === 'Mixt'
                    ? 'bg-accent text-base border-accent font-bold shadow-sm'
                    : 'bg-base-raised text-ink-dim border-base-border hover:text-ink'
                }`}
              >
                <span>Equip Mixt</span>
              </button>
              <button
                type="button"
                onClick={() => setGender('Femení')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center transition-all ${
                  gender === 'Femení'
                    ? 'bg-accent text-base border-accent font-bold shadow-sm'
                    : 'bg-base-raised text-ink-dim border-base-border hover:text-ink'
                }`}
              >
                <span>Equip Femení</span>
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-ink-dim mb-1.5 block">Categoria</label>
            {!useCustomCategory ? (
              <div className="space-y-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="input text-sm"
                >
                  {PRESET_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setUseCustomCategory(true)}
                  className="text-xs text-accent hover:underline block"
                >
                  + Escriure una altra categoria
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  className="input text-sm"
                  placeholder="Escriu la categoria..."
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setUseCustomCategory(false)}
                  className="text-xs text-ink-dim hover:underline block"
                >
                  ← Tornar al llistat predefinit
                </button>
              </div>
            )}
          </div>

          <div className="p-3 bg-base-raised rounded-xl text-xs text-ink-dim flex items-center justify-between">
            <span>Jugadors vinculats a aquest equip:</span>
            <span className="font-bold text-ink">{playerCount} jugadors</span>
          </div>

          {error && <p className="text-danger text-sm">{error}</p>}

          <div className="flex gap-3 pt-3 border-t border-base-border">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 text-sm py-2.5">
              Cancel·lar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1 text-sm py-2.5 font-semibold"
            >
              {saving ? 'Guardant…' : 'Guardar canvis'}
            </button>
          </div>
        </form>

        {/* Zona perill */}
        <div className="pt-3 border-t border-base-border/70">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-danger hover:underline flex items-center gap-1 font-medium"
            >
              <span>🗑️</span>
              <span>Eliminar aquest equip</span>
            </button>
          ) : (
            <div className="p-3.5 bg-danger/10 border border-danger/30 rounded-xl space-y-2">
              <p className="text-xs font-semibold text-danger">
                ⚠️ Segur que vols eliminar l'equip "{team.name}"? {playerCount > 0 && `S'eliminaran també els ${playerCount} jugadors assignats.`}
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="bg-danger text-white text-xs px-3.5 py-1.5 rounded-lg font-bold hover:brightness-110 transition-all"
                >
                  {deleting ? 'Eliminant…' : 'Sí, eliminar equip'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="btn-ghost text-xs py-1.5 px-3 text-ink-dim"
                >
                  Cancel·lar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function MarketPanel() {
  const [cards, setCards] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // Filtres
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTeamId, setSelectedTeamId] = useState('all')
  const [selectedPos, setSelectedPos] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all') // 'all' | 'market' | 'unlisted'

  async function load() {
    setLoading(true)
    try {
      const [cardsRes, teamsRes] = await Promise.all([
        supabase
          .from('fantasy_cards')
          .select(`
            id, current_price, status, owner_manager_id,
            club_players ( id, full_name, position, team_id, club_teams ( id, name ) )
          `)
          .is('owner_manager_id', null)
          .order('club_player_id'),
        supabase.from('club_teams').select('id, name').order('name'),
      ])

      setCards(cardsRes.data || [])
      setTeams(teamsRes.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function setPrice(cardId, price) {
    const numPrice = Number(price)
    if (isNaN(numPrice) || numPrice <= 0) return
    await supabase.from('fantasy_cards').update({ current_price: numPrice }).eq('id', cardId)
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, current_price: numPrice } : c))
    )
    setMsg('Preu actualitzat correctament.')
  }

  async function toggleMarket(card) {
    if (card.status === 'market') {
      await supabase.from('fantasy_cards').update({
        status: 'owned',
        market_listed_at: null,
        market_expires_at: null,
      }).eq('id', card.id)
      setMsg(`${card.club_players?.full_name} s'ha retirat del mercat.`)
    } else {
      await supabase.from('fantasy_cards').update({
        status: 'market',
        market_listed_at: new Date().toISOString(),
        market_expires_at: new Date(Date.now() + 2 * 86400000).toISOString(),
      }).eq('id', card.id)
      await supabase.from('activity_log').insert({
        type: 'market_new',
        message: `${card.club_players?.full_name} ha sortit al mercat per ${card.current_price}M`,
      })
      setMsg(`${card.club_players?.full_name} s'ha posat al mercat.`)
    }
    load()
  }

  const filteredCards = cards.filter((c) => {
    const player = c.club_players
    if (!player) return false

    if (selectedTeamId !== 'all' && player.team_id !== selectedTeamId) return false
    if (selectedPos !== 'all' && player.position !== selectedPos) return false
    if (selectedStatus === 'market' && c.status !== 'market') return false
    if (selectedStatus === 'unlisted' && c.status === 'market') return false

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchName = player.full_name?.toLowerCase().includes(q)
      const matchTeam = player.club_teams?.name?.toLowerCase().includes(q)
      if (!matchName && !matchTeam) return false
    }

    return true
  })

  const countOnMarket = cards.filter((c) => c.status === 'market').length
  const countUnlisted = cards.length - countOnMarket

  if (loading) return <p className="text-ink-dim text-sm py-4">Carregant mercat setmanal…</p>

  return (
    <div className="space-y-5">
      {/* Targetes de resum */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="card p-3.5 sm:p-4">
          <div className="text-xs text-ink-dim font-medium">Jugadors lliures</div>
          <div className="text-xl sm:text-2xl font-bold font-display text-ink mt-1">
            {cards.length}
          </div>
          <div className="text-[11px] text-ink-faint mt-0.5">Sense propietari</div>
        </div>
        <div className="card p-3.5 sm:p-4">
          <div className="text-xs text-ink-dim font-medium">Actius al mercat</div>
          <div className="text-xl sm:text-2xl font-bold font-display text-ok mt-1">
            {countOnMarket}
          </div>
          <div className="text-[11px] text-ink-faint mt-0.5">Visibles per fitxar</div>
        </div>
        <div className="card p-3.5 sm:p-4 col-span-2 sm:col-span-1">
          <div className="text-xs text-ink-dim font-medium">Fora de mercat</div>
          <div className="text-xl sm:text-2xl font-bold font-display text-ink-dim mt-1">
            {countUnlisted}
          </div>
          <div className="text-[11px] text-ink-faint mt-0.5">Pendent de publicar</div>
        </div>
      </div>

      {/* Barra de filtres */}
      <div className="card p-3.5 sm:p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Cerca */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim text-sm select-none pointer-events-none">🔍</span>
            <input
              type="text"
              placeholder="Cerca jugador..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input text-xs sm:text-sm py-2 pr-8 !pl-9 w-full min-h-[38px]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink text-xs p-1"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filtre per equip */}
          <div>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="input text-xs sm:text-sm py-2 px-2.5 w-full min-h-[38px]"
            >
              <option value="all">Tots els equips ({cards.length})</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({cards.filter((c) => c.club_players?.team_id === t.id).length})
                </option>
              ))}
            </select>
          </div>

          {/* Filtre per posició */}
          <div>
            <select
              value={selectedPos}
              onChange={(e) => setSelectedPos(e.target.value)}
              className="input text-xs sm:text-sm py-2 px-2.5 w-full min-h-[38px]"
            >
              <option value="all">Totes les posicions</option>
              <option value="PORTER">🧤 Porter</option>
              <option value="TANCA">🛡️ Tanca</option>
              <option value="ALA">⚡ Ala</option>
              <option value="PIVOT">🎯 Pivot</option>
            </select>
          </div>

          {/* Filtre per estat mercat */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="input text-xs sm:text-sm py-2 px-2.5 w-full min-h-[38px]"
            >
              <option value="all">Tots els estats</option>
              <option value="market">🏷️ Només al mercat ({countOnMarket})</option>
              <option value="unlisted">🔒 Només fora de mercat ({countUnlisted})</option>
            </select>
          </div>
        </div>
      </div>

      {/* Llistat de jugadors lliures per al mercat */}
      {filteredCards.length === 0 ? (
        <div className="card p-8 text-center text-ink-dim text-sm space-y-2">
          <p>No s'ha trobat cap jugador lliure amb els filtres seleccionats.</p>
          <button
            onClick={() => {
              setSelectedTeamId('all')
              setSelectedPos('all')
              setSelectedStatus('all')
              setSearchQuery('')
            }}
            className="btn-ghost text-xs text-accent underline mt-1"
          >
            Restablir filtres
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-ink-faint text-left border-b border-base-border bg-base-raised/40">
                  <th className="py-2.5 sm:py-3 px-3 sm:px-4 font-normal">Jugador</th>
                  <th className="py-2.5 sm:py-3 px-2 sm:px-4 font-normal">Posició</th>
                  <th className="hidden sm:table-cell py-2.5 sm:py-3 px-3 sm:px-4 font-normal">Equip</th>
                  <th className="py-2.5 sm:py-3 px-2 sm:px-4 font-normal">Preu de sortida</th>
                  <th className="hidden md:table-cell py-2.5 sm:py-3 px-3 sm:px-4 font-normal">Estat</th>
                  <th className="py-2.5 sm:py-3 px-3 sm:px-4 font-normal text-right">Accions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCards.map((c) => {
                  const posInfo = POS_CONFIG[c.club_players?.position] || {
                    label: c.club_players?.position,
                    emoji: '⚽',
                    badge: 'bg-base-raised text-ink-dim',
                  }
                  const isOnMarket = c.status === 'market'

                  return (
                    <tr
                      key={c.id}
                      className="border-b border-base-border/60 last:border-0 hover:bg-base-surface/40 transition-colors"
                    >
                      <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-medium text-ink">
                        <div className="font-semibold text-ink text-xs sm:text-sm">
                          {c.club_players?.full_name}
                        </div>
                        <div className="text-[11px] text-ink-dim sm:hidden">
                          {c.club_players?.club_teams?.name}
                        </div>
                      </td>

                      <td className="py-2.5 sm:py-3 px-2 sm:px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] sm:text-xs px-2 py-0.5 rounded-full font-medium ${posInfo.badge}`}
                        >
                          <span>{posInfo.emoji}</span>
                          <span>{posInfo.label}</span>
                        </span>
                      </td>

                      <td className="hidden sm:table-cell py-2.5 sm:py-3 px-3 sm:px-4 text-ink-dim">
                        <span className="font-medium text-ink">{c.club_players?.club_teams?.name}</span>
                      </td>

                      <td className="py-2.5 sm:py-3 px-2 sm:px-4">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            defaultValue={c.current_price}
                            className="input py-1 px-2 w-16 sm:w-20 text-xs sm:text-sm min-h-[32px] sm:min-h-[36px]"
                            onBlur={(e) => setPrice(c.id, e.target.value)}
                          />
                          <span className="text-xs text-accent font-semibold">M</span>
                        </div>
                      </td>

                      <td className="hidden md:table-cell py-2.5 sm:py-3 px-3 sm:px-4">
                        <span
                          className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium border ${
                            isOnMarket
                              ? 'bg-ok/15 text-ok border-ok/30'
                              : 'bg-base-raised text-ink-dim border-base-border'
                          }`}
                        >
                          {isOnMarket ? '🏷️ Al mercat' : '🔒 Fora de mercat'}
                        </span>
                      </td>

                      <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-right">
                        <button
                          onClick={() => toggleMarket(c)}
                          className={`text-xs py-1.5 px-3 rounded-lg border font-semibold transition-colors ${
                            isOnMarket
                              ? 'bg-danger/10 border-danger/30 text-danger hover:bg-danger/20'
                              : 'bg-accent/15 border-accent/40 text-accent hover:bg-accent/25'
                          }`}
                        >
                          {isOnMarket ? 'Treure del mercat' : 'Posar al mercat'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Toast message={msg} type="ok" onClose={() => setMsg('')} />
    </div>
  )
}

// ---------------------------------------------------------------------------
function OffersPanel() {
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState({ text: '', type: 'ok' })
  const [confirmModal, setConfirmModal] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('transfer_offers')
        .select(`
          id, amount, counter_amount, status, created_at, bidder_manager_id, fantasy_card_id,
          managers:bidder_manager_id ( id, display_name, avatar_emoji, budget ),
          fantasy_cards (
            id, current_price, market_expires_at, owner_manager_id, status,
            club_players ( id, full_name, position, club_teams ( id, name ) )
          )
        `)
        .in('status', ['pending', 'countered'])
        .order('created_at', { ascending: false })

      if (error) {
        console.warn('Avís carregant ofertes amb join directe:', error.message)
        // Fallback amb consultes separades per garantir 100% que es carreguen
        const { data: rawOffers } = await supabase
          .from('transfer_offers')
          .select('id, amount, counter_amount, status, created_at, bidder_manager_id, fantasy_card_id')
          .in('status', ['pending', 'countered'])
          .order('created_at', { ascending: false })

        if (rawOffers && rawOffers.length > 0) {
          const cardIds = rawOffers.map((o) => o.fantasy_card_id).filter(Boolean)
          const bidderIds = rawOffers.map((o) => o.bidder_manager_id).filter(Boolean)

          const [cardsRes, biddersRes] = await Promise.all([
            supabase
              .from('fantasy_cards')
              .select(`
                id, current_price, market_expires_at, owner_manager_id, status,
                club_players ( id, full_name, position, club_teams ( id, name ) )
              `)
              .in('id', cardIds),
            supabase
              .from('managers')
              .select('id, display_name, avatar_emoji, budget')
              .in('id', bidderIds),
          ])

          const cardMap = new Map((cardsRes.data || []).map((c) => [c.id, c]))
          const bidderMap = new Map((biddersRes.data || []).map((m) => [m.id, m]))

          const enriched = rawOffers.map((o) => ({
            ...o,
            fantasy_cards: cardMap.get(o.fantasy_card_id),
            managers: bidderMap.get(o.bidder_manager_id),
          }))
          setOffers(enriched)
        } else {
          setOffers([])
        }
      } else {
        setOffers(data || [])
      }
    } catch (err) {
      console.error('Error general carregant ofertes:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openAcceptModal(offer) {
    const card = Array.isArray(offer.fantasy_cards) ? offer.fantasy_cards[0] : offer.fantasy_cards
    const player = card ? (Array.isArray(card.club_players) ? card.club_players[0] : card.club_players) : null
    const bidder = Array.isArray(offer.managers) ? offer.managers[0] : offer.managers
    const playerName = player?.full_name || 'el jugador'
    const bidderName = bidder?.display_name || 'el mànager'
    const finalAmount = offer.status === 'countered' && offer.counter_amount ? offer.counter_amount : offer.amount

    setConfirmModal({
      icon: '✓',
      iconBg: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
      title: "Acceptar oferta de traspàs",
      subtitle: "Fitxatge de jugador lliure del club",
      playerName,
      teamName: player?.club_teams?.name,
      position: player?.position,
      amount: `${finalAmount}M`,
      amountLabel: "Preu de fitxatge",
      partyLabel: "Comprador",
      partyName: bidderName,
      partyEmoji: bidder?.avatar_emoji || '👤',
      marketExpiresAt: card?.market_expires_at,
      description: `S'acceptarà l'oferta de ${finalAmount}M i ${bidderName} fitxarà ${playerName}. Els diners es descomptaran del seu pressupost i la resta d'ofertes per aquest jugador seran descartades.`,
      confirmText: `✓ Sí, acceptar oferta (${finalAmount}M)`,
      confirmStyle: 'btn-primary',
      onConfirm: async () => {
        try {
          const { error } = await supabase.rpc('accept_transfer_offer', { p_offer_id: offer.id })
          if (error) throw error
          setMsg({ text: `Oferta per ${playerName} acceptada correctament!`, type: 'ok' })
          setConfirmModal(null)
          load()
        } catch (err) {
          setMsg({ text: err.message || "Error acceptant l'oferta", type: 'error' })
        }
      },
    })
  }

  function openRejectModal(offer) {
    const card = Array.isArray(offer.fantasy_cards) ? offer.fantasy_cards[0] : offer.fantasy_cards
    const player = card ? (Array.isArray(card.club_players) ? card.club_players[0] : card.club_players) : null
    const bidder = Array.isArray(offer.managers) ? offer.managers[0] : offer.managers
    const playerName = player?.full_name || 'el jugador'
    const bidderName = bidder?.display_name || 'el mànager'

    setConfirmModal({
      icon: '✕',
      iconBg: 'bg-danger/20 text-danger border border-danger/40',
      title: "Rebutjar oferta de traspàs",
      subtitle: `Cancel·lar la proposta de ${bidderName}`,
      playerName,
      teamName: player?.club_teams?.name,
      position: player?.position,
      amount: `${offer.amount}M`,
      amountLabel: "Oferta realitzada",
      partyLabel: "Postor",
      partyName: bidderName,
      partyEmoji: bidder?.avatar_emoji || '👤',
      marketExpiresAt: card?.market_expires_at,
      description: `Es rebutjarà l'oferta de ${offer.amount}M de ${bidderName} per ${playerName}. El postor serà notificat i el seu pressupost reservat serà alliberat.`,
      confirmText: `✕ Sí, rebutjar oferta`,
      confirmStyle: 'bg-danger text-white hover:brightness-110',
      onConfirm: async () => {
        try {
          const { error } = await supabase.rpc('reject_transfer_offer', { p_offer_id: offer.id })
          if (error) throw error
          setMsg({ text: `Oferta de ${bidderName} per ${playerName} rebutjada.`, type: 'ok' })
          setConfirmModal(null)
          load()
        } catch (err) {
          setMsg({ text: err.message || "Error rebutjant l'oferta", type: 'error' })
        }
      },
    })
  }

  // Només ofertes de jugadors sense propietari (club / lliures)
  const freeAgentOffers = offers.filter((o) => {
    const card = Array.isArray(o.fantasy_cards) ? o.fantasy_cards[0] : o.fantasy_cards
    return card && !card.owner_manager_id
  })

  return (
    <div className="space-y-6">
      {msg.text && (
        <Toast
          message={msg.text}
          type={msg.type}
          onClose={() => setMsg({ text: '', type: 'ok' })}
        />
      )}

      {/* Capçalera */}
      <div className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-display font-semibold text-lg text-ink flex items-center gap-2">
            <span>🏛️</span> Ofertes per a jugadors del club ({freeAgentOffers.length})
          </h3>
          <p className="text-xs text-ink-dim leading-relaxed">
            Aquestes ofertes de jugadors s'acceptaran automàticament quan acabi el període de mercat del jugador a l'usuari que més diners hagi apostat pel jugador. Però en cas excepcional l'administrador pot acceptar o rebutjar individualment les ofertes de fitxatge per a jugadors del mercat que no tenen propietari.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-ink-dim text-sm py-8 text-center">Carregant ofertes de jugadors del club…</p>
      ) : freeAgentOffers.length === 0 ? (
        <div className="card p-8 sm:p-12 text-center text-ink-dim text-sm space-y-2">
          <p className="text-base font-semibold text-ink">No hi ha cap oferta pendent per a jugadors del club</p>
          <p className="text-xs text-ink-faint">
            Quan els mànagers facin ofertes per fitxar jugadors lliures del mercat, apareixeran aquí perquè les puguis acceptar o rebutjar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {freeAgentOffers.map((offer) => {
            const card = Array.isArray(offer.fantasy_cards) ? offer.fantasy_cards[0] : offer.fantasy_cards
            const player = card ? (Array.isArray(card.club_players) ? card.club_players[0] : card.club_players) : null
            const bidder = Array.isArray(offer.managers) ? offer.managers[0] : offer.managers
            const pos = player?.position?.toUpperCase()
            const posConfig = POS_CONFIG[pos] || { label: player?.position || 'Jugador', emoji: '⚽', badge: 'bg-base-raised text-ink border-base-border' }

            return (
              <div
                key={offer.id}
                className="card p-4 sm:p-5 flex flex-col justify-between gap-4 border border-base-border bg-base-raised/60 hover:border-base-border/90 transition-all shadow-sm"
              >
                <div className="space-y-3.5">
                  {/* Capçalera Jugador */}
                  <div className="flex items-start justify-between gap-2 border-b border-base-border/70 pb-3">
                    <div className="min-w-0">
                      <p className="font-display font-bold text-ink text-base truncate">
                        {player?.full_name || 'Jugador'}
                      </p>
                      <p className="text-xs text-ink-dim mt-0.5 truncate">
                        {player?.club_teams?.name || 'Club'} · <strong className="text-accent">Jugador lliure (Club)</strong>
                      </p>
                    </div>
                    <span className={`text-[10px] sm:text-[11px] px-2.5 py-0.5 rounded-full border font-semibold shrink-0 flex items-center gap-1 ${posConfig.badge}`}>
                      <span>{posConfig.label}</span>
                      <span className="select-none">{posConfig.emoji}</span>
                    </span>
                  </div>

                  {/* Informació de l'oferta i postor */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-base-surface border border-base-border">
                      <div>
                        <p className="text-[11px] text-ink-dim">Oferta rebuda</p>
                        <p className="font-display text-lg font-bold text-yellow-400" style={{ color: '#FACC15' }}>
                          {offer.amount}M
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-ink-dim">Preu de sortida</p>
                        <p className="text-sm font-semibold text-ink">
                          {card?.current_price}M
                        </p>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-base-surface/80 border border-base-border/60 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-ink-dim">Postor:</span>
                        <span className="font-bold text-ink flex items-center gap-1">
                          <span>{bidder?.avatar_emoji || '👤'}</span>
                          <span>{bidder?.display_name || 'Mànager'}</span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-ink-dim">Pressupost postor:</span>
                        <span className="font-semibold text-yellow-400 font-display">
                          {bidder?.budget}M
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-base-border/50 text-[11px]">
                        <span className="text-ink-dim flex items-center gap-1">
                          <span>⏱️</span> Temps al mercat:
                        </span>
                        <span className="font-semibold text-accent">
                          {card?.market_expires_at ? timeLeft(card.market_expires_at) : 'Sense caducitat'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Botons d'acció per a l'administrador */}
                <div className="pt-2 border-t border-base-border/70 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openAcceptModal(offer)}
                    className="btn-primary flex-1 py-2.5 px-3 text-xs sm:text-sm font-semibold min-h-[40px] flex items-center justify-center gap-1.5"
                  >
                    <span>✓</span>
                    <span>Acceptar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openRejectModal(offer)}
                    className="py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-xl bg-danger/15 hover:bg-danger/25 text-danger border border-danger/40 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>✕</span>
                    <span>Rebutjar</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de confirmació personalitzat per acceptar o rebutjar */}
      {confirmModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmModal(null)
          }}
          className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 animate-fade-in"
        >
          <div className="card w-full max-w-md p-5 sm:p-6 space-y-4 relative shadow-2xl border border-base-border">
            <div className="flex items-start justify-between gap-3 border-b border-base-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${confirmModal.iconBg}`}>
                  {confirmModal.icon}
                </div>
                <div>
                  <h3 className="font-display font-semibold text-base sm:text-lg text-ink">
                    {confirmModal.title}
                  </h3>
                  <p className="text-xs text-ink-dim mt-0.5">{confirmModal.subtitle}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="text-ink-dim hover:text-ink text-sm p-1 rounded-lg bg-base-raised hover:bg-base-surface"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-base-raised/70 border border-base-border/80 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-dim">Jugador:</span>
                <span className="font-bold text-ink">{confirmModal.playerName}</span>
              </div>
              {confirmModal.teamName && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-dim">Equip:</span>
                  <span className="font-medium text-ink">{confirmModal.teamName}</span>
                </div>
              )}
              {confirmModal.partyName && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-dim">{confirmModal.partyLabel || 'Mànager'}:</span>
                  <span className="font-medium text-ink flex items-center gap-1">
                    <span>{confirmModal.partyEmoji || '👤'}</span>
                    <span>{confirmModal.partyName}</span>
                  </span>
                </div>
              )}
              {confirmModal.amount && (
                <div className="flex items-center justify-between text-xs pt-1 border-t border-base-border/50">
                  <span className="text-ink-dim">{confirmModal.amountLabel || 'Import'}:</span>
                  <span className="font-bold text-yellow-400 font-display text-sm" style={{ color: '#FACC15' }}>
                    {confirmModal.amount}
                  </span>
                </div>
              )}
              {confirmModal.marketExpiresAt && (
                <div className="flex items-center justify-between text-xs pt-1 border-t border-base-border/50">
                  <span className="text-ink-dim flex items-center gap-1">
                    <span>⏱️</span> Temps restant al mercat:
                  </span>
                  <span className="font-semibold text-accent">
                    {timeLeft(confirmModal.marketExpiresAt)}
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs text-ink-dim leading-relaxed">
              {confirmModal.description}
            </p>

            <div className="flex gap-2.5 pt-2 border-t border-base-border">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="btn-ghost flex-1 py-2.5 text-xs sm:text-sm font-semibold min-h-[42px]"
              >
                Cancel·lar
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className={`${confirmModal.confirmStyle || 'btn-primary'} flex-1 py-2.5 text-xs sm:text-sm font-semibold min-h-[42px] flex items-center justify-center gap-1.5`}
              >
                {confirmModal.confirmText || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MatchdaysPanel() {
  const [matchdays, setMatchdays] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState({ text: '', type: 'ok' })

  // Formulari de creació
  const [number, setNumber] = useState('')
  const [label, setLabel] = useState('')
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')
  const [isExtra, setIsExtra] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Estat per editar
  const [editingMatchday, setEditingMatchday] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)

  // Estat per eliminar
  const [deletingMatchday, setDeletingMatchday] = useState(null)
  const [statsCount, setStatsCount] = useState(0)
  const [checkingStats, setCheckingStats] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('matchdays').select('*').order('number')
    if (!error) {
      setMatchdays(data || [])
      const nextNum = ((data || [])[(data || []).length - 1]?.number || 0) + 1
      setNumber(nextNum)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function addMatchday(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const num = Number(number) || (matchdays[matchdays.length - 1]?.number || 0) + 1
      const { error } = await supabase.from('matchdays').insert({
        number: num,
        label: label || `Jornada ${num}`,
        starts_at: starts,
        ends_at: ends,
        is_extra: isExtra,
      })
      if (error) throw error

      setMsg({ text: `Jornada "${label || 'Jornada ' + num}" creada correctament!`, type: 'ok' })
      setLabel('')
      setStarts('')
      setEnds('')
      setIsExtra(false)
      load()
    } catch (err) {
      setMsg({ text: err.message || 'Error creant la jornada', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdateMatchday(e) {
    e.preventDefault()
    if (!editingMatchday) return
    setSavingEdit(true)
    try {
      const { error } = await supabase
        .from('matchdays')
        .update({
          number: Number(editingMatchday.number),
          label: editingMatchday.label,
          starts_at: editingMatchday.starts_at,
          ends_at: editingMatchday.ends_at,
          is_extra: Boolean(editingMatchday.is_extra),
        })
        .eq('id', editingMatchday.id)

      if (error) throw error

      setMsg({ text: `Jornada "${editingMatchday.label}" actualitzada correctament!`, type: 'ok' })
      setEditingMatchday(null)
      load()
    } catch (err) {
      setMsg({ text: err.message || 'Error actualitzant la jornada', type: 'error' })
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleStartDelete(m) {
    setDeletingMatchday(m)
    setCheckingStats(true)
    setStatsCount(0)
    try {
      const { count, error } = await supabase
        .from('player_matchday_stats')
        .select('id', { count: 'exact', head: true })
        .eq('matchday_id', m.id)

      if (!error) {
        setStatsCount(count || 0)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setCheckingStats(false)
    }
  }

  async function handleConfirmDelete() {
    if (!deletingMatchday) return
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('matchdays')
        .delete()
        .eq('id', deletingMatchday.id)

      if (error) throw error

      setMsg({ text: `S'ha eliminat la jornada "${deletingMatchday.label || 'Jornada ' + deletingMatchday.number}".`, type: 'ok' })
      setDeletingMatchday(null)
      load()
    } catch (err) {
      setMsg({ text: err.message || 'Error eliminant la jornada', type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  const autoCurrentMatchday = getCurrentMatchday(matchdays)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        {/* LLISTA DE JORNADES (esquerra) */}
        <div className="lg:col-span-7 card p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-base-border">
            <div>
              <h3 className="font-display font-semibold text-lg text-ink">Jornades creades ({matchdays.length})</h3>
              <p className="text-xs text-ink-dim mt-0.5">La jornada actual es calcula automàticament per dates.</p>
            </div>
          </div>

          {loading ? (
            <p className="text-xs text-ink-dim py-4">Carregant jornades…</p>
          ) : matchdays.length === 0 ? (
            <p className="text-xs text-ink-dim py-4">Encara no hi ha cap jornada creada.</p>
          ) : (
            <div className="space-y-2.5">
              {matchdays.map((m) => {
                const isCurrent = autoCurrentMatchday?.id === m.id
                return (
                  <div
                    key={m.id}
                    className={`bg-base-raised border rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                      isCurrent ? 'border-accent/40 bg-accent/[0.04] ring-1 ring-accent/20' : 'border-base-border/70 hover:border-base-border'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-ink">{m.label || `Jornada ${m.number}`}</span>
                        {isCurrent && (
                          <span
                            title="Jornada actual o més propera calculada automàticament per dates"
                            className="text-[10px] text-accent font-semibold px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 flex items-center gap-1"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Actual
                          </span>
                        )}
                        {m.is_extra && (
                          <span
                            title="Aquesta jornada no suma punts per a la classificació"
                            className="text-[10px] text-purple-300 font-semibold px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center gap-1"
                          >
                            <span>⭐</span> Jornada Extra
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-ink-dim mt-1 flex items-center gap-2">
                        <span>Jornada <strong className="text-ink">{m.number}</strong></span>
                        <span>·</span>
                        <span>{formatDateDMY(m.starts_at)} fins a {formatDateDMY(m.ends_at)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-base-border/50 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditingMatchday({ ...m })}
                        className="text-xs text-ink-dim hover:text-ink py-1.5 px-2.5 rounded-lg bg-base-surface hover:bg-base-raised border border-base-border flex items-center gap-1 transition-colors"
                      >
                        <span>✏️</span> Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartDelete(m)}
                        className="text-xs text-danger/80 hover:text-danger py-1.5 px-2.5 rounded-lg bg-danger/10 hover:bg-danger/20 border border-danger/30 flex items-center gap-1 transition-colors"
                        title="Eliminar jornada"
                      >
                        <span>🗑️</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* FORMULARI CREAR NOVA JORNADA (dreta) */}
        <form onSubmit={addMatchday} className="lg:col-span-5 card p-4 sm:p-5 space-y-3.5">
          <h3 className="font-display font-semibold text-lg text-ink">Nova jornada</h3>
          <p className="text-xs text-ink-dim">Introdueix les dates i configura si és una jornada estàndard o extra.</p>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="col-span-1">
              <label className="text-xs text-ink-dim mb-1 block">Número *</label>
              <input
                type="number"
                min="1"
                className="input text-sm min-h-[44px]"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                required
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-ink-dim mb-1 block">Etiqueta / Nom *</label>
              <input
                type="text"
                className="input text-sm min-h-[44px]"
                placeholder="Ex: Jornada 4"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink-dim mb-1 block">Data inici *</label>
              <input
                type="date"
                className="input text-sm min-h-[44px]"
                value={starts}
                onChange={(e) => setStarts(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-xs text-ink-dim mb-1 block">Data fi *</label>
              <input
                type="date"
                className="input text-sm min-h-[44px]"
                value={ends}
                onChange={(e) => setEnds(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Casella Jornada Extra */}
          <div className="p-3 rounded-xl bg-base-raised border border-base-border/70 space-y-1.5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isExtra}
                onChange={(e) => setIsExtra(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-base-border accent-accent cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-semibold text-ink block">Jornada extra</span>
                <span className="text-ink-dim block leading-relaxed mt-0.5">
                  Es mostrarà a la web i permetrà registrar estadístiques, però <strong>NO sumarà punts</strong> per a la classificació general.
                </span>
              </div>
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full min-h-[44px] text-sm font-semibold flex items-center justify-center gap-1.5"
          >
            <span>➕</span> {submitting ? 'Creant…' : 'Crear jornada'}
          </button>
        </form>
      </div>

      {/* MODAL EDITAR JORNADA */}
      {editingMatchday && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingEdit) setEditingMatchday(null)
          }}
          className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 animate-fade-in"
        >
          <div className="card w-full max-w-lg p-5 sm:p-6 space-y-4 relative shadow-2xl border border-base-border">
            <div className="flex items-center justify-between border-b border-base-border pb-3">
              <h3 className="font-display font-semibold text-lg text-ink flex items-center gap-2">
                <span>✏️</span> Modificar jornada
              </h3>
              <button
                type="button"
                onClick={() => setEditingMatchday(null)}
                disabled={savingEdit}
                className="text-ink-dim hover:text-ink text-lg p-1.5 rounded-lg bg-base-raised"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateMatchday} className="space-y-3.5">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="col-span-1">
                  <label className="text-xs text-ink-dim mb-1 block">Número *</label>
                  <input
                    type="number"
                    min="1"
                    className="input text-sm min-h-[44px]"
                    value={editingMatchday.number}
                    onChange={(e) => setEditingMatchday({ ...editingMatchday, number: e.target.value })}
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-ink-dim mb-1 block">Etiqueta / Nom *</label>
                  <input
                    type="text"
                    className="input text-sm min-h-[44px]"
                    value={editingMatchday.label || ''}
                    onChange={(e) => setEditingMatchday({ ...editingMatchday, label: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-ink-dim mb-1 block">Data inici *</label>
                  <input
                    type="date"
                    className="input text-sm min-h-[44px]"
                    value={editingMatchday.starts_at || ''}
                    onChange={(e) => setEditingMatchday({ ...editingMatchday, starts_at: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-ink-dim mb-1 block">Data fi *</label>
                  <input
                    type="date"
                    className="input text-sm min-h-[44px]"
                    value={editingMatchday.ends_at || ''}
                    onChange={(e) => setEditingMatchday({ ...editingMatchday, ends_at: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Casella Jornada Extra */}
              <div className="p-3 rounded-xl bg-base-raised border border-base-border/70 space-y-1.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingMatchday.is_extra)}
                    onChange={(e) => setEditingMatchday({ ...editingMatchday, is_extra: e.target.checked })}
                    className="mt-0.5 w-4 h-4 rounded border-base-border accent-accent cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-ink block">Jornada extra</span>
                    <span className="text-ink-dim block leading-relaxed mt-0.5">
                      No sumarà punts per a la classificació general del joc.
                    </span>
                  </div>
                </label>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-base-border">
                <button
                  type="button"
                  onClick={() => setEditingMatchday(null)}
                  disabled={savingEdit}
                  className="btn-ghost py-2.5 px-4 text-xs sm:text-sm min-h-[42px]"
                >
                  Cancel·lar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="btn-primary py-2.5 px-5 text-xs sm:text-sm font-semibold min-h-[42px]"
                >
                  {savingEdit ? 'Desant…' : 'Desar canvis'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMACIÓ ELIMINAR JORNADA */}
      {deletingMatchday && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) setDeletingMatchday(null)
          }}
          className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 animate-fade-in"
        >
          <div className="card w-full max-w-md p-5 sm:p-6 space-y-4 relative shadow-2xl border border-danger/40">
            <div className="flex items-center gap-3 border-b border-base-border pb-3">
              <div className="w-10 h-10 rounded-xl bg-danger/15 text-danger flex items-center justify-center text-lg shrink-0">
                🗑️
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-semibold text-base text-ink">
                  Eliminar jornada
                </h3>
                <p className="text-xs text-ink-dim truncate">
                  {deletingMatchday.label || `Jornada ${deletingMatchday.number}`}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-ink-dim">
              {checkingStats ? (
                <p>Comprovant dades associades a aquesta jornada…</p>
              ) : statsCount > 0 ? (
                <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/30 text-danger space-y-2">
                  <p className="font-semibold flex items-center gap-1.5">
                    <span>⚠️</span> Atenció: Hi ha dades guardades!
                  </p>
                  <p className="text-xs text-danger/90 leading-relaxed">
                    Aquesta jornada té <strong>{statsCount}</strong> registres d'actes i puntuacions de jugadors. Si l'elimines, <strong>s'eliminaran permanentment</strong> totes les estadístiques associades.
                  </p>
                </div>
              ) : (
                <p>No hi ha puntuacions registrades per aquesta jornada. Es pot eliminar sense pèrdua de dades.</p>
              )}

              <p className="text-xs text-ink font-medium">
                Estàs segur que vols eliminar la <strong>{deletingMatchday.label || `Jornada ${deletingMatchday.number}`}</strong>?
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-base-border">
              <button
                type="button"
                onClick={() => setDeletingMatchday(null)}
                disabled={deleting}
                className="btn-ghost py-2.5 px-4 text-xs sm:text-sm min-h-[42px]"
              >
                Cancel·lar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="py-2.5 px-4 rounded-xl bg-danger hover:bg-danger/90 text-white text-xs sm:text-sm font-semibold min-h-[42px] transition-colors"
              >
                {deleting ? 'Eliminant…' : 'Eliminar definitivament'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast de feedback */}
      <Toast
        message={msg.text}
        type={msg.type}
        onClose={() => setMsg({ text: '', type: 'ok' })}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
const AVATAR_EMOJIS = [
  // Futbol i esports
  '⚽', '🥅', '🧤', '👟', '🏃', '🏃‍♂️', '🏃‍♀️', '🏆', '🥇', '🥈', '🥉', '🎖️', '🏅', '🎯', '⏱️', '📣',
  // Animals i caràcter
  '🦁', '🐯', '🐆', '🐺', '🦅', '🦈', '🐻', '🦍', '🐲', '🐉', '🦊', '🐂', '🐍', '⚡', '🔥', '🌪️', '💥',
  // Poder, màgia i actitud
  '🛡️', '⚔️', '👑', '💎', '🚀', '⭐', '🌟', '🕶️', '🤠', '🤖', '👽', '👾', '🎩', '🧙‍♂️', '🪄', '💪'
]

function UsersPanel() {
  const [managers, setManagers] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState({ text: '', type: 'ok' })

  // Camps del formulari de nou usuari
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [budget, setBudget] = useState('100')
  const [avatarEmoji, setAvatarEmoji] = useState('⚽')
  const [isAdmin, setIsAdmin] = useState(false)
  const [isCoach, setIsCoach] = useState(false)
  const [selectedTeams, setSelectedTeams] = useState([])
  const [playerTeamId, setPlayerTeamId] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  // Estat per canviar contrasenya
  const [resetPwdUserId, setResetPwdUserId] = useState(null)
  const [newPassword, setNewPassword] = useState('')

  // Estat per editar usuari
  const [editingManager, setEditingManager] = useState(null)

  async function loadData() {
    setLoading(true)
    try {
      const [mgrRes, teamsRes] = await Promise.all([
        supabase
          .from('managers')
          .select(`
            *,
            coach_assignments (
              team_id,
              club_teams ( id, name )
            )
          `)
          .order('display_name'),
        supabase.from('club_teams').select('id, name, category').order('name'),
      ])

      setManagers(mgrRes.data || [])
      setTeams(teamsRes.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function toggleTeam(teamId) {
    setSelectedTeams((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    )
  }

  async function handleCreateUser(e) {
    e.preventDefault()
    setMsg({ text: '', type: 'ok' })

    if (!isAdmin && !isCoach && !playerTeamId) {
      setMsg({ text: "Has de seleccionar l'equip on juga el jugador", type: 'error' })
      return
    }

    setSaving(true)

    try {
      const { error } = await supabase.rpc('admin_create_manager', {
        p_username: username.trim().toLowerCase(),
        p_password: password,
        p_display_name: displayName.trim(),
        p_budget: Number(budget) || 100,
        p_avatar_emoji: avatarEmoji || '⚽',
        p_is_admin: isAdmin,
        p_is_coach: isCoach,
        p_team_ids: isCoach ? selectedTeams : [],
        p_player_team_id: !isAdmin && !isCoach && playerTeamId ? playerTeamId : null,
      })

      if (error) throw error

      setMsg({ text: `Usuari "${displayName}" creat correctament!`, type: 'ok' })
      setUsername('')
      setPassword('')
      setDisplayName('')
      setBudget('100')
      setAvatarEmoji('⚽')
      setIsAdmin(false)
      setIsCoach(false)
      setSelectedTeams([])
      setPlayerTeamId('')
      setShowEmojiPicker(false)
      loadData()
    } catch (err) {
      setMsg({ text: err.message || 'Error creant usuari', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleResetPassword(managerId) {
    if (!newPassword) return
    try {
      const { error } = await supabase.rpc('admin_update_manager_password', {
        p_manager_id: managerId,
        p_new_password: newPassword,
      })
      if (error) throw error
      alert('Contrasenya actualitzada amb èxit!')
      setResetPwdUserId(null)
      setNewPassword('')
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  function startEdit(mgr) {
    const assignedTeamIds = mgr.coach_assignments?.map((ca) => ca.team_id) || []
    setEditingManager({
      id: mgr.id,
      username: mgr.username,
      display_name: mgr.display_name,
      budget: mgr.budget,
      avatar_emoji: mgr.avatar_emoji || '⚽',
      is_admin: !!mgr.is_admin,
      is_coach: !!mgr.is_coach,
      team_ids: assignedTeamIds,
      player_team_id: mgr.player_team_id || '',
    })
  }

  if (loading) return <p className="text-ink-dim text-sm">Carregant usuaris…</p>

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
      {/* Formulari per crear nou usuari */}
      <div className="xl:col-span-1">
        <form onSubmit={handleCreateUser} className="card p-6 space-y-4 sticky top-6">
          <div>
            <h3 className="font-display font-semibold text-lg text-ink">Afegir nou usuari</h3>
            <p className="text-sm text-ink-dim mt-1">
              Es crearà l'accés d'inici de sessió i el compte de manager.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-ink-dim mb-1 block">Nom d'usuari (login) *</label>
            <input
              className="input text-sm"
              placeholder="p.ex. jordi"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoCapitalize="none"
            />
            <span className="text-xs text-ink-faint mt-1 block">
              Sense espais ni majúscules. S'usarà per entrar a l'app.
            </span>
          </div>

          <div>
            <label className="text-sm font-medium text-ink-dim mb-1 block">Contrasenya inicial *</label>
            <input
              type="password"
              className="input text-sm"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-ink-dim mb-1 block">Nom visible (al joc) *</label>
            <input
              className="input text-sm"
              placeholder="p.ex. Jordi Puig"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-ink-dim mb-1 block">Pressupost (M)</label>
              <input
                type="number"
                step="1"
                className="input text-sm"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-dim mb-1 block">Avatar Emoji</label>
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="input text-center text-xl py-1 flex items-center justify-center gap-2 hover:border-accent transition-colors"
              >
                <span>{avatarEmoji}</span>
                <span className="text-xs text-ink-dim">Tria</span>
              </button>
            </div>
          </div>

          {/* Selector desplegable de +40 emojis */}
          {showEmojiPicker && (
            <div className="bg-base-surface border border-base-border rounded-xl p-3 shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-ink-dim">Tria una emoticona ({AVATAR_EMOJIS.length})</span>
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(false)}
                  className="text-xs text-ink-faint hover:text-ink"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-8 gap-1.5 max-h-44 overflow-y-auto pr-1">
                {AVATAR_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      setAvatarEmoji(em)
                      setShowEmojiPicker(false)
                    }}
                    className={`h-9 w-9 text-lg rounded-lg flex items-center justify-center transition-all ${
                      avatarEmoji === em
                        ? 'bg-accent text-base font-bold scale-110'
                        : 'bg-base-raised hover:bg-base-border text-ink'
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Rols */}
          <div className="pt-2 border-t border-base-border space-y-2">
            <span className="text-xs font-semibold text-ink-dim block uppercase tracking-wider">Tipus d'usuari (Rol) *</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-stretch">
              <button
                type="button"
                onClick={() => { setIsAdmin(false); setIsCoach(false); }}
                className={`p-3 rounded-xl border text-left flex flex-col h-full transition-all ${
                  !isAdmin && !isCoach
                    ? 'bg-blue-500/15 border-blue-500/60 text-ink ring-1 ring-blue-500/40'
                    : 'bg-base-surface border-base-border text-ink-dim hover:text-ink'
                }`}
              >
                <div className="flex items-center justify-between w-full h-6 mb-2">
                  <span className="text-lg">⚽</span>
                  {!isAdmin && !isCoach && <span className="text-blue-400 text-xs font-bold">✓</span>}
                </div>
                <div className="font-semibold text-xs text-ink">Jugador</div>
                <div className="text-[10px] text-ink-dim mt-1 leading-tight">Jugadors del club.</div>
              </button>

              <button
                type="button"
                onClick={() => { setIsAdmin(false); setIsCoach(true); }}
                className={`p-3 rounded-xl border text-left flex flex-col h-full transition-all ${
                  !isAdmin && isCoach
                    ? 'bg-emerald-500/15 border-emerald-500/60 text-ink ring-1 ring-emerald-500/40'
                    : 'bg-base-surface border-base-border text-ink-dim hover:text-ink'
                }`}
              >
                <div className="flex items-center justify-between w-full h-6 mb-2">
                  <span className="text-lg">📋</span>
                  {!isAdmin && isCoach && <span className="text-emerald-400 text-xs font-bold">✓</span>}
                </div>
                <div className="font-semibold text-xs text-ink">Entrenador</div>
                <div className="text-[10px] text-ink-dim mt-1 leading-tight">Pot afegir puntuacions dels seus equips.</div>
              </button>

              <button
                type="button"
                onClick={() => { setIsAdmin(true); setIsCoach(false); }}
                className={`p-3 rounded-xl border text-left flex flex-col h-full transition-all ${
                  isAdmin
                    ? 'bg-danger/15 border-danger/60 text-ink ring-1 ring-danger/40'
                    : 'bg-base-surface border-base-border text-ink-dim hover:text-ink'
                }`}
              >
                <div className="flex items-center justify-between w-full h-6 mb-2">
                  <span className="text-lg">🛠️</span>
                  {isAdmin && <span className="text-danger text-xs font-bold">✓</span>}
                </div>
                <div className="font-semibold text-xs text-ink">Administrador</div>
                <div className="text-[10px] text-ink-dim mt-1 leading-tight">Accés complet a tot el panell d'admin.</div>
              </button>
            </div>
          </div>

          {/* Selecció d'equips si és entrenador */}
          {isCoach && (
            <div className="bg-base-surface/80 p-3 rounded-lg border border-base-border space-y-2">
              <span className="text-sm text-accent font-medium block">
                Selecciona els equips que entrena:
              </span>
              {teams.length === 0 ? (
                <p className="text-xs text-ink-faint">No hi ha equips registrats a club_teams.</p>
              ) : (
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {teams.map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-2 text-sm text-ink-dim hover:text-ink cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTeams.includes(t.id)}
                        onChange={() => toggleTeam(t.id)}
                        className="rounded border-base-border text-accent focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>{t.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Selecció d'equip si és jugador */}
          {!isAdmin && !isCoach && (
            <div className="bg-base-surface/80 p-3 rounded-lg border border-base-border space-y-2">
              <label className="text-sm text-blue-400 font-medium block">
                Equip on juga (Jugador) *:
              </label>
              <select
                value={playerTeamId}
                onChange={(e) => setPlayerTeamId(e.target.value)}
                className="input text-sm w-full"
                required
              >
                <option value="">-- Selecciona l'equip on juga --</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-ink-dim">
                Com a norma del joc, aquest usuari no podrà fitxar jugadors que juguin al seu mateix equip.
              </p>
            </div>
          )}

          <Toast
            message={msg.text}
            type={msg.type}
            onClose={() => setMsg({ text: '', type: 'ok' })}
          />

          <button type="submit" disabled={saving} className="btn-primary w-full text-sm">
            {saving ? 'Creant usuari…' : 'Crear usuari'}
          </button>
        </form>
      </div>

      {/* Llistat d'usuaris existents */}
      <div className="xl:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg text-ink">
            Usuaris registrats ({managers.length})
          </h3>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="text-ink-faint text-left border-b border-base-border bg-base-raised/40">
                <th className="py-2.5 sm:py-3 px-3 sm:px-4 font-normal">Manager</th>
                <th className="hidden md:table-cell py-2.5 sm:py-3 px-3 sm:px-4 font-normal">Usuari</th>
                <th className="py-2.5 sm:py-3 px-2 sm:px-4 font-normal">Pressupost</th>
                <th className="hidden sm:table-cell py-2.5 sm:py-3 px-3 sm:px-4 font-normal">Rol</th>
                <th className="py-2.5 sm:py-3 px-3 sm:px-4 font-normal text-right">Accions</th>
              </tr>
            </thead>
            <tbody>
              {managers.map((m) => {
                const coachTeams = m.coach_assignments?.map((ca) => ca.club_teams?.name).filter(Boolean) || []
                const playerTeam = teams.find((t) => t.id === m.player_team_id)
                return (
                  <tr key={m.id} className="border-b border-base-border/60 last:border-0 hover:bg-base-surface/40">
                    <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-medium text-ink">
                      <div className="flex items-center gap-2">
                        <span className="text-xl sm:text-2xl">{m.avatar_emoji || '⚽'}</span>
                        <div className="min-w-0">
                          <div className="font-semibold text-ink text-xs sm:text-sm truncate">{m.display_name}</div>
                          <div className="text-[11px] text-ink-dim font-mono md:hidden truncate">@{m.username}</div>
                          {coachTeams.length > 0 && (
                            <div className="text-[10px] sm:text-xs text-ink-dim truncate">
                              ⚽ {coachTeams.join(', ')}
                            </div>
                          )}
                          {!m.is_admin && !m.is_coach && playerTeam && (
                            <div className="text-[10px] sm:text-xs text-blue-400 truncate">
                              🏃 {playerTeam.name}
                            </div>
                          )}
                          <div className="flex sm:hidden gap-1 mt-0.5">
                            {m.is_admin && (
                              <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-danger/20 text-danger border border-danger/30">
                                Admin
                              </span>
                            )}
                            {m.is_coach && (
                              <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                Entrenador
                              </span>
                            )}
                            {!m.is_admin && !m.is_coach && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                Jugador {playerTeam ? `(${playerTeam.name})` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell py-2.5 sm:py-3 px-3 sm:px-4 text-ink-dim font-mono text-xs">{m.username}</td>
                    <td className="py-2.5 sm:py-3 px-2 sm:px-4">
                      <span className="text-accent font-display font-semibold text-xs sm:text-sm whitespace-nowrap">
                        {m.budget}M
                      </span>
                    </td>
                    <td className="hidden sm:table-cell py-2.5 sm:py-3 px-3 sm:px-4">
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {m.is_admin && (
                          <span className="text-xs uppercase font-semibold px-2 py-0.5 rounded bg-danger/20 text-danger border border-danger/30">
                            Admin
                          </span>
                        )}
                        {m.is_coach && (
                          <span className="text-xs uppercase font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Entrenador
                          </span>
                        )}
                        {!m.is_admin && !m.is_coach && (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1 w-fit">
                              <span>⚽</span> Jugador
                            </span>
                            {playerTeam && (
                              <span className="text-[11px] text-ink-dim">
                                {playerTeam.name}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 sm:py-3 px-2 sm:px-4 text-right">
                      <div className="flex items-center justify-end gap-1 sm:gap-2">
                        <button
                          onClick={() => startEdit(m)}
                          className="btn-ghost text-xs py-1.5 px-2 sm:px-3 text-ink hover:text-accent flex items-center gap-1"
                          title="Modificar dades d'aquest usuari"
                        >
                          <span>✏️</span>
                          <span className="hidden sm:inline">Modificar</span>
                        </button>

                        <button
                          onClick={() => {
                            setResetPwdUserId(m)
                            setNewPassword('')
                          }}
                          className="btn-ghost text-sm py-1.5 px-2 text-ink-dim hover:text-ink"
                          title="Canviar contrasenya d'aquest usuari"
                        >
                          🔑
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
    </div>

      {/* Modal gran per canviar contrasenya */}
      {resetPwdUserId && (
        <ResetPasswordModal
          manager={resetPwdUserId}
          onClose={() => setResetPwdUserId(null)}
          onSuccess={() => {
            const name = resetPwdUserId.display_name
            setResetPwdUserId(null)
            setMsg({ text: `Contrasenya actualitzada correctament per a "${name}"!`, type: 'ok' })
          }}
        />
      )}

      {/* Modal d'edició d'usuari */}
      {editingManager && (
        <EditManagerModal
          manager={editingManager}
          teams={teams}
          onClose={() => setEditingManager(null)}
          onSaved={() => {
            setEditingManager(null)
            loadData()
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function ResetPasswordModal({ manager, onClose, onSuccess }) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!password || password.length < 3) {
      setError('La contrasenya ha de tenir com a mínim 3 caràcters')
      return
    }
    setError('')
    setSaving(true)

    try {
      const { error: rpcError } = await supabase.rpc('admin_update_manager_password', {
        p_manager_id: manager.id,
        p_new_password: password,
      })

      if (rpcError) throw rpcError

      onSuccess()
    } catch (err) {
      setError(err.message || 'Error canviant la contrasenya')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6 space-y-5 relative shadow-2xl">
        <div className="flex items-center justify-between border-b border-base-border pb-3">
          <div>
            <h3 className="font-display font-semibold text-lg text-ink flex items-center gap-2">
              <span>🔑</span> Canviar contrasenya
            </h3>
            <p className="text-sm text-ink-dim mt-0.5">
              Usuari: <strong className="text-accent">{manager.display_name}</strong> (@{manager.username})
            </p>
          </div>
          <button onClick={onClose} className="text-ink-dim hover:text-ink text-lg p-1">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-ink-dim mb-1.5 block">
              Nova contrasenya *
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="input text-base py-2.5 px-3 pr-10 w-full"
                placeholder="Escriu la nova contrasenya..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-dim hover:text-ink text-base p-1"
                title={showPassword ? 'Ocultar' : 'Mostrar'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
            <p className="text-xs text-ink-faint mt-1.5">
              L'usuari podrà entrar a l'app immediatament amb aquesta contrasenya.
            </p>
          </div>

          {error && <p className="text-danger text-sm">{error}</p>}

          <div className="flex gap-3 pt-3 border-t border-base-border">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost flex-1 text-sm py-2.5"
            >
              Cancel·lar
            </button>
            <button
              type="submit"
              disabled={saving || !password}
              className="btn-primary flex-1 text-sm py-2.5 font-semibold"
            >
              {saving ? 'Guardant…' : 'Actualitzar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function EditManagerModal({ manager, teams, onClose, onSaved }) {
  const [displayName, setDisplayName] = useState(manager.display_name)
  const [budget, setBudget] = useState(manager.budget)
  const [avatarEmoji, setAvatarEmoji] = useState(manager.avatar_emoji || '⚽')
  const [isAdmin, setIsAdmin] = useState(manager.is_admin)
  const [isCoach, setIsCoach] = useState(manager.is_coach)
  const [selectedTeams, setSelectedTeams] = useState(manager.team_ids || [])
  const [playerTeamId, setPlayerTeamId] = useState(manager.player_team_id || '')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteStep, setDeleteStep] = useState(0) // 0: no actiu, 1: primera confirmació, 2: segona confirmació definitiva
  const [error, setError] = useState('')

  function toggleTeam(teamId) {
    setSelectedTeams((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    try {
      const { error: rpcError } = await supabase.rpc('admin_update_manager', {
        p_manager_id: manager.id,
        p_display_name: displayName.trim(),
        p_budget: Number(budget),
        p_avatar_emoji: avatarEmoji || '⚽',
        p_is_admin: isAdmin,
        p_is_coach: isCoach,
        p_team_ids: isCoach ? selectedTeams : [],
        p_player_team_id: !isAdmin && !isCoach && playerTeamId ? playerTeamId : null,
      })

      if (rpcError) throw rpcError

      onSaved()
    } catch (err) {
      setError(err.message || 'Error guardant canvis')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteUser() {
    setDeleting(true)
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('admin_delete_manager', {
        p_manager_id: manager.id,
      })

      if (rpcError) throw rpcError

      onSaved()
    } catch (err) {
      setError(err.message || "Error eliminant l'usuari")
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6 space-y-5 relative max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between border-b border-base-border pb-3">
          <div>
            <h3 className="font-display font-semibold text-lg text-ink">
              Modificar usuari: <span className="text-accent font-mono">@{manager.username}</span>
            </h3>
            <p className="text-xs text-ink-dim mt-0.5">
              Edita el nom, diners, avatar, rols o elimina el compte.
            </p>
          </div>
          <button onClick={onClose} className="text-ink-dim hover:text-ink text-lg p-1">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-ink-dim mb-1 block">Nom visible</label>
            <input
              className="input text-sm"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-ink-dim mb-1 block">Pressupost (M)</label>
              <input
                type="number"
                step="1"
                className="input text-sm"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-dim mb-1 block">Avatar Emoji</label>
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="input text-center text-xl py-1 flex items-center justify-center gap-2 hover:border-accent transition-colors"
              >
                <span>{avatarEmoji}</span>
                <span className="text-xs text-ink-dim">Canviar</span>
              </button>
            </div>
          </div>

          {/* Selector d'emojis */}
          {showEmojiPicker && (
            <div className="bg-base-surface border border-base-border rounded-xl p-3 shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-ink-dim">Tria una emoticona ({AVATAR_EMOJIS.length})</span>
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(false)}
                  className="text-xs text-ink-faint hover:text-ink"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-8 gap-1.5 max-h-40 overflow-y-auto pr-1">
                {AVATAR_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      setAvatarEmoji(em)
                      setShowEmojiPicker(false)
                    }}
                    className={`h-9 w-9 text-lg rounded-lg flex items-center justify-center transition-all ${
                      avatarEmoji === em
                        ? 'bg-accent text-base font-bold scale-110'
                        : 'bg-base-raised hover:bg-base-border text-ink'
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Rols */}
          <div className="pt-2 border-t border-base-border space-y-2">
            <span className="text-xs font-semibold text-ink-dim block uppercase tracking-wider">Tipus d'usuari (Rol) *</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-stretch">
              <button
                type="button"
                onClick={() => { setIsAdmin(false); setIsCoach(false); }}
                className={`p-3 rounded-xl border text-left flex flex-col h-full transition-all ${
                  !isAdmin && !isCoach
                    ? 'bg-blue-500/15 border-blue-500/60 text-ink ring-1 ring-blue-500/40'
                    : 'bg-base-surface border-base-border text-ink-dim hover:text-ink'
                }`}
              >
                <div className="flex items-center justify-between w-full h-6 mb-2">
                  <span className="text-lg">⚽</span>
                  {!isAdmin && !isCoach && <span className="text-blue-400 text-xs font-bold">✓</span>}
                </div>
                <div className="font-semibold text-xs text-ink">Jugador</div>
                <div className="text-[10px] text-ink-dim mt-1 leading-tight">Jugadors del club.</div>
              </button>

              <button
                type="button"
                onClick={() => { setIsAdmin(false); setIsCoach(true); }}
                className={`p-3 rounded-xl border text-left flex flex-col h-full transition-all ${
                  !isAdmin && isCoach
                    ? 'bg-emerald-500/15 border-emerald-500/60 text-ink ring-1 ring-emerald-500/40'
                    : 'bg-base-surface border-base-border text-ink-dim hover:text-ink'
                }`}
              >
                <div className="flex items-center justify-between w-full h-6 mb-2">
                  <span className="text-lg">📋</span>
                  {!isAdmin && isCoach && <span className="text-emerald-400 text-xs font-bold">✓</span>}
                </div>
                <div className="font-semibold text-xs text-ink">Entrenador</div>
                <div className="text-[10px] text-ink-dim mt-1 leading-tight">Pot afegir puntuacions dels seus equips.</div>
              </button>

              <button
                type="button"
                onClick={() => { setIsAdmin(true); setIsCoach(false); }}
                className={`p-3 rounded-xl border text-left flex flex-col h-full transition-all ${
                  isAdmin
                    ? 'bg-danger/15 border-danger/60 text-ink ring-1 ring-danger/40'
                    : 'bg-base-surface border-base-border text-ink-dim hover:text-ink'
                }`}
              >
                <div className="flex items-center justify-between w-full h-6 mb-2">
                  <span className="text-lg">🛠️</span>
                  {isAdmin && <span className="text-danger text-xs font-bold">✓</span>}
                </div>
                <div className="font-semibold text-xs text-ink">Administrador</div>
                <div className="text-[10px] text-ink-dim mt-1 leading-tight">Accés complet a tot el panell d'admin.</div>
              </button>
            </div>
          </div>

          {/* Selecció d'equips si és entrenador */}
          {isCoach && (
            <div className="bg-base-surface/80 p-3 rounded-lg border border-base-border space-y-2">
              <span className="text-sm text-accent font-medium block">
                Equips que entrena:
              </span>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {teams.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-2 text-sm text-ink-dim hover:text-ink cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTeams.includes(t.id)}
                      onChange={() => toggleTeam(t.id)}
                      className="rounded border-base-border text-accent focus:ring-0 w-3.5 h-3.5"
                    />
                    <span>{t.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Selecció d'equip si és jugador */}
          {!isAdmin && !isCoach && (
            <div className="bg-base-surface/80 p-3 rounded-lg border border-base-border space-y-2">
              <label className="text-sm text-blue-400 font-medium block">
                Equip on juga (Jugador):
              </label>
              <select
                value={playerTeamId}
                onChange={(e) => setPlayerTeamId(e.target.value)}
                className="input text-sm w-full"
              >
                <option value="">-- Sense equip assignat --</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-ink-dim">
                Com a norma del joc, aquest usuari no podrà fitxar jugadors que juguin al seu mateix equip.
              </p>
            </div>
          )}

          {error && <p className="text-danger text-sm">{error}</p>}

          <div className="flex gap-3 pt-3 border-t border-base-border">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost flex-1 text-sm py-2"
            >
              Cancel·lar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1 text-sm py-2 font-semibold"
            >
              {saving ? 'Guardant…' : 'Guardar canvis'}
            </button>
          </div>
        </form>

        {/* Zona de perill: Eliminar usuari amb doble confirmació */}
        <div className="pt-4 border-t border-base-border/60">
          {deleteStep === 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-faint">Zona de perill</span>
              <button
                type="button"
                onClick={() => setDeleteStep(1)}
                className="text-xs text-danger hover:underline flex items-center gap-1 font-medium"
              >
                <span>🗑️</span>
                <span>Eliminar usuari</span>
              </button>
            </div>
          )}

          {deleteStep === 1 && (
            <div className="p-4 bg-danger/10 border border-danger/30 rounded-xl space-y-3">
              <p className="text-xs font-semibold text-danger flex items-center gap-1.5">
                <span>⚠️</span>
                <span>Confirmació 1 de 2: Segur que vols eliminar @{manager.username}?</span>
              </p>
              <p className="text-xs text-ink-dim">
                Es donarà de baixa el seu compte d'inici de sessió i els seus jugadors tornaran al mercat.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDeleteStep(2)}
                  className="bg-danger text-white text-xs px-3.5 py-2 rounded-lg font-semibold hover:brightness-110 transition-all"
                >
                  Continuar a confirmació final
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteStep(0)}
                  className="btn-ghost text-xs py-2 px-3 text-ink-dim"
                >
                  Cancel·lar
                </button>
              </div>
            </div>
          )}

          {deleteStep === 2 && (
            <div className="p-4 bg-danger/20 border-2 border-danger rounded-xl space-y-3">
              <p className="text-xs font-bold text-danger uppercase tracking-wide flex items-center gap-1.5">
                <span>🚨</span>
                <span>Confirmació 2 de 2: Acció definitiva</span>
              </p>
              <p className="text-xs text-ink">
                Estàs a punt d'eliminar definitivament <strong>{manager.display_name}</strong> (<span className="font-mono text-accent">@{manager.username}</span>). Aquesta acció no es pot desfer.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDeleteUser}
                  className="bg-danger text-white text-xs px-4 py-2.5 rounded-lg font-bold hover:brightness-110 flex-1 shadow-lg transition-all"
                >
                  {deleting ? 'Eliminant…' : '⚠️ SÍ, ELIMINAR DEFINITIVAMENT'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteStep(0)}
                  className="btn-ghost text-xs py-2.5 px-3 text-ink-dim"
                >
                  Cancel·lar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


