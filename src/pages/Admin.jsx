import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatDateDMY, getCurrentMatchday } from '../lib/matchdayUtils'
import { fetchGameSettings, DEFAULT_GAME_SETTINGS } from '../lib/settingsUtils'
import Topbar from '../components/Topbar'
import Toast from '../components/Toast'
import Jersey from '../components/Jersey'
import GameModePanel from '../components/admin/GameModePanel'

function timeLeft(expiresAt) {
  if (!expiresAt) return null
  const diffMs = new Date(expiresAt).getTime() - Date.now()
  if (diffMs <= 0) return 'Expira avui'
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `${days}d ${hours}h`
  return `${hours}h`
}

const TAB_DESCRIPTIONS = {
  'Equips i jugadors': "Panell per gestionar el planter del club: crear equips, afegir nens nous, canviar-los de posició o equip i ajustar el seu preu.",
  'Mercat/Subhastes': "Panell per controlar els jugadors disponibles al mercat o a subhasta oficial del club, definir els preus i quants dies estan actius.",
  'Ofertes pendents': "Panell per revisar les ofertes de jugadors lliures del club. S'atorguen automàticament al millor postor en expirar el període de mercat, o l'administrador pot acceptar-les/rebutjar-les manualment.",
  'Jornades': "Panell per crear i gestionar el calendari de jornades de lliga i configurar les seves dates d'inici i final.",
  'Usuaris': "Panell per crear nous managers, assignar rols (admin/entrenador), modificar pressupostos i canviar contrasenyes.",
  'Mode de Joc': "Configura les regles i modalitats de la lliga: tipus de mercat (actiu o sense mercat amb subhastes de club), visibilitat de les pujes i límit de plantilla.",
}

export default function Admin() {
  const [gameSettings, setGameSettings] = useState(DEFAULT_GAME_SETTINGS)
  const [tab, setTab] = useState('Equips i jugadors')

  async function refreshSettings() {
    try {
      const s = await fetchGameSettings()
      if (s) setGameSettings(s)
    } catch (e) {
      console.warn(e)
    }
  }

  useEffect(() => {
    refreshSettings()
  }, [])

  const isAuctionMode = gameSettings.market_mode === 'no_market'
  const tabs = ['Equips i jugadors', 'Mercat/Subhastes', 'Ofertes pendents', 'Jornades', 'Usuaris', 'Mode de Joc']

  return (
    <div>
      <Topbar title="Administració" subtitle="Accés només per a l'administrador del joc" />
      <div className="px-4 pt-4 sm:px-8 sm:pt-6 flex gap-2 border-b border-base-border overflow-x-auto pb-1 -mb-px">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap min-h-[40px] flex items-center ${
              tab === t ? 'border-accent text-accent font-semibold' : 'border-transparent text-ink-dim hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="p-4 sm:p-8 space-y-5">
        <div className="bg-base-surface/80 border border-base-border/70 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-ink-dim flex items-center gap-2.5 shadow-sm">
          <span className="text-accent text-base select-none">ℹ️</span>
          <span className="font-normal text-ink/90">{TAB_DESCRIPTIONS[tab] || TAB_DESCRIPTIONS['Mode de Joc']}</span>
        </div>

        {tab === 'Equips i jugadors' && <TeamsAndPlayersPanel />}
        {tab === 'Mercat/Subhastes' && (
          <MarketPanel isAuctionMode={isAuctionMode} gameSettings={gameSettings} />
        )}
        {tab === 'Ofertes pendents' && <OffersPanel />}
        {tab === 'Jornades' && <MatchdaysPanel />}
        {tab === 'Usuaris' && <UsersPanel />}
        {tab === 'Mode de Joc' && <GameModePanel />}
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
  POR: { label: 'Porter', emoji: '🧤', badge: 'bg-purple-500/20 text-purple-300 border border-purple-500/30' },
  DEF: { label: 'Tanca', emoji: '🛡️', badge: 'bg-blue-500/20 text-blue-300 border border-blue-500/30' },
  MIG: { label: 'Ala', emoji: '⚡', badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' },
  DAV: { label: 'Pivot', emoji: '🎯', badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' },
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
            id, full_name, position, dorsal, team_id, active, created_at,
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
                          <div className="flex items-center gap-2.5">
                            <Jersey number={p.dorsal} className="w-7 h-7 shrink-0" />
                            <div>
                              <div className="font-semibold text-ink text-xs sm:text-sm">{p.full_name}</div>
                              <div className="text-[11px] text-ink-dim sm:hidden">
                                {p.club_teams?.name}
                              </div>
                            </div>
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
  const [dorsal, setDorsal] = useState('')
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

    const dorsalNum = dorsal !== '' && !isNaN(Number(dorsal)) ? parseInt(dorsal, 10) : null

    try {
      // 1. Intentar via RPC atòmic
      const { error: rpcError } = await supabase.rpc('admin_create_player', {
        p_team_id: teamId,
        p_full_name: fullName.trim(),
        p_position: position,
        p_initial_price: Number(price) || 5,
        p_status: status,
        p_dorsal: dorsalNum,
      })

      if (rpcError) {
        // Fallback directe en dues passes
        const { data: newPlayer, error: pErr } = await supabase
          .from('club_players')
          .insert({
            team_id: teamId,
            full_name: fullName.trim(),
            position,
            dorsal: dorsalNum,
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
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
              <label className="text-sm font-medium text-ink-dim mb-1 block">Dorsal</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="99"
                  className="input text-sm text-center font-bold"
                  placeholder="10"
                  value={dorsal}
                  onChange={(e) => setDorsal(e.target.value)}
                />
                <Jersey number={dorsal} className="w-9 h-9 shrink-0" />
              </div>
            </div>
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
  const [dorsal, setDorsal] = useState(player.dorsal ?? '')
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

    const dorsalNum = dorsal !== '' && !isNaN(Number(dorsal)) ? parseInt(dorsal, 10) : null

    try {
      const { error: rpcError } = await supabase.rpc('admin_update_player', {
        p_player_id: player.id,
        p_team_id: teamId,
        p_full_name: fullName.trim(),
        p_position: position,
        p_price: Number(price),
        p_status: status,
        p_dorsal: dorsalNum,
      })

      if (rpcError) {
        // Fallback directe
        await supabase
          .from('club_players')
          .update({
            full_name: fullName.trim(),
            team_id: teamId,
            position,
            dorsal: dorsalNum,
          })
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
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
              <label className="text-sm font-medium text-ink-dim mb-1 block">Dorsal</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="99"
                  className="input text-sm text-center font-bold"
                  placeholder="10"
                  value={dorsal}
                  onChange={(e) => setDorsal(e.target.value)}
                />
                <Jersey number={dorsal} className="w-9 h-9 shrink-0" />
              </div>
            </div>
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
function MarketPanel({ isAuctionMode = false, gameSettings }) {
  const [cards, setCards] = useState([]) // només jugadors del club sense propietari
  const [allCards, setAllCards] = useState([]) // totes les cartes per comprovar propietaris
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // Filtres per a la llista de jugadors
  const [filterSearch, setFilterSearch] = useState('')
  const [filterTeam, setFilterTeam] = useState('all')
  const [filterPosition, setFilterPosition] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all') // 'all' | 'market' | 'unlisted'
  const [listingDays, setListingDays] = useState(gameSettings?.default_auction_days || 3)

  // Modals per a la taula
  const [publishModal, setPublishModal] = useState(null)
  const [withdrawConfirmModal, setWithdrawConfirmModal] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const [cardsRes, teamsRes, playersRes] = await Promise.all([
        supabase
          .from('fantasy_cards')
          .select(`
            id, current_price, status, owner_manager_id, market_expires_at, market_listed_at, club_player_id,
            club_players ( id, full_name, position, dorsal, team_id, club_teams ( id, name ) )
          `)
          .order('club_player_id'),
        supabase.from('club_teams').select('id, name').order('name'),
        supabase.from('club_players').select('id, full_name, position, dorsal, team_id').order('full_name'),
      ])

      const rawCards = cardsRes.data || []
      setAllCards(rawCards)
      // La taula només mostra els jugadors del club sense propietari
      setCards(rawCards.filter((c) => !c.owner_manager_id))
      setTeams(teamsRes.data || [])
      setPlayers(playersRes.data || [])
      if (gameSettings?.default_auction_days) {
        setListingDays(gameSettings.default_auction_days)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [isAuctionMode])


  // Obre modal per posar a la venda / subhastar amb selecció de preu i temps
  function openPublishModal(card) {
    setPublishModal({
      card,
      price: (card.current_price || 5.0).toString(),
      days: listingDays || 3,
    })
  }

  // Confirma la publicació des del modal
  async function handleConfirmPublishModal(card, price, days) {
    const numDays = Number(days) || 3
    const numPrice = Number(price) || 5.0
    const now = new Date()
    const expiresAt = new Date(now.getTime() + numDays * 24 * 60 * 60 * 1000).toISOString()

    try {
      await supabase.from('fantasy_cards').update({
        status: 'market',
        current_price: numPrice,
        market_listed_at: now.toISOString(),
        market_expires_at: expiresAt,
      }).eq('id', card.id)

      await supabase.from('activity_log').insert({
        type: 'market_new',
        message: isAuctionMode
          ? `📢 S'ha posat a subhasta a ${card.club_players?.full_name || 'un jugador'}`
          : `📢 S'ha posat a la venda a ${card.club_players?.full_name || 'un jugador'} per ${numPrice}M (${numDays} dies)`,
      })

      setMsg(
        isAuctionMode
          ? `🎯 ${card.club_players?.full_name} posat a subhasta durant ${numDays} dies (${numPrice}M)!`
          : `🏷️ ${card.club_players?.full_name} posat a la venda al mercat durant ${numDays} dies (${numPrice}M)!`
      )
      setPublishModal(null)
      load()
    } catch (err) {
      setMsg('Error: ' + err.message)
    }
  }

  // Obre modal per retirar un jugador del mercat / cancel·lar subhasta
  function openWithdrawModal(card) {
    setWithdrawConfirmModal({
      card,
      playerName: card.club_players?.full_name || 'el jugador',
      isAuction: isAuctionMode,
      onConfirm: async () => {
        try {
          await supabase.from('fantasy_cards').update({
            status: 'owned',
            market_listed_at: null,
            market_expires_at: null,
          }).eq('id', card.id)
          setMsg(
            isAuctionMode
              ? `Subhasta cancel·lada per a ${card.club_players?.full_name}.`
              : `${card.club_players?.full_name} s'ha retirat de la venda al mercat.`
          )
          setWithdrawConfirmModal(null)
          load()
        } catch (err) {
          setMsg('Error: ' + err.message)
        }
      },
    })
  }

  // Filtratge de la llista de jugadors sense propietari
  const filteredCards = cards.filter((c) => {
    const p = c.club_players
    if (!p) return false

    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase().trim()
      const nameMatch = p.full_name?.toLowerCase().includes(q)
      const dorsalMatch = p.dorsal?.toString().includes(q)
      const teamMatch = p.club_teams?.name?.toLowerCase().includes(q)
      if (!nameMatch && !dorsalMatch && !teamMatch) return false
    }

    if (filterTeam !== 'all' && p.team_id !== filterTeam) return false
    if (filterPosition !== 'all') {
      const pos = p.position
      const match =
        pos === filterPosition ||
        (filterPosition === 'PORTER' && (pos === 'POR' || pos === 'PORTER')) ||
        (filterPosition === 'TANCA' && (pos === 'DEF' || pos === 'TANCA')) ||
        (filterPosition === 'ALA' && (pos === 'MIG' || pos === 'ALA')) ||
        (filterPosition === 'PIVOT' && (pos === 'DAV' || pos === 'PIVOT'))
      if (!match) return false
    }
    if (filterStatus === 'market' && c.status !== 'market') return false
    if (filterStatus === 'unlisted' && c.status === 'market') return false

    return true
  })

  const hasActiveFilters = filterSearch || filterTeam !== 'all' || filterPosition !== 'all' || filterStatus !== 'all'

  if (loading) return <p className="text-ink-dim text-sm py-4">Carregant dades del mercat…</p>

  return (
    <div className="space-y-5">
      {msg && (
        <div className="p-3 bg-accent/15 border border-accent/30 text-accent rounded-xl text-xs font-semibold flex items-center justify-between animate-fade-in">
          <span>{msg}</span>
          <button onClick={() => setMsg('')} className="text-ink-dim hover:text-ink">✕</button>
        </div>
      )}

      {/* Barra de filtres de jugadors sense propietari */}
      <div className="card p-4 sm:p-5 space-y-4 border border-base-border animate-fade-in bg-base-raised/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-base-border/70 pb-3">
          <div className="flex items-center gap-2.5">
            <h3 className="font-display font-bold text-base sm:text-lg text-yellow-400" style={{ color: '#FACC15' }}>
              📋 Jugadors Sense Propietari
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-base-surface border border-base-border text-ink font-sans font-medium">
              {filteredCards.length} {filteredCards.length === 1 ? 'jugador' : 'jugadors'}
              {hasActiveFilters && ` (de ${cards.length})`}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-ink-dim font-medium">
              {isAuctionMode ? 'Mode Subhastes actiu' : 'Mode Mercat Actiu'}
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setFilterSearch('')
                  setFilterTeam('all')
                  setFilterPosition('all')
                  setFilterStatus('all')
                }}
                className="text-[11px] text-accent hover:underline font-semibold"
              >
                Netejar filtres
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Cerca per nom */}
          <div>
            <label className="text-xs font-semibold text-ink-dim block mb-1">Cerca jugador</label>
            <div className="relative">
              <input
                type="text"
                placeholder="🔍  Cercar jugador..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="input text-xs sm:text-sm w-full bg-base-surface pr-8"
              />
              {filterSearch && (
                <button
                  type="button"
                  onClick={() => setFilterSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-dim hover:text-ink"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Filtre per equip */}
          <div>
            <label className="text-xs font-semibold text-ink-dim block mb-1">Equip</label>
            <select
              value={filterTeam}
              onChange={(e) => setFilterTeam(e.target.value)}
              className="input text-xs sm:text-sm w-full bg-base-surface"
            >
              <option value="all">Tots els equips ({teams.length})</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filtre per posició */}
          <div>
            <label className="text-xs font-semibold text-ink-dim block mb-1">Posició</label>
            <select
              value={filterPosition}
              onChange={(e) => setFilterPosition(e.target.value)}
              className="input text-xs sm:text-sm w-full bg-base-surface"
            >
              <option value="all">Totes les posicions</option>
              <option value="PORTER">🧤 Porter</option>
              <option value="TANCA">🛡️ Tanca</option>
              <option value="ALA">⚡ Ala</option>
              <option value="PIVOT">🎯 Pivot</option>
            </select>
          </div>

          {/* Filtre per estat */}
          <div>
            <label className="text-xs font-semibold text-ink-dim block mb-1">Estat al mercat</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input text-xs sm:text-sm w-full bg-base-surface"
            >
              <option value="all">Tots els estats</option>
              <option value="market">
                {isAuctionMode ? '🏛️ En subhasta' : '🏷️ A la venda'}
              </option>
              <option value="unlisted">
                {isAuctionMode ? '🔒 Fora de subhasta' : '🔒 Fora de mercat'}
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* Llistat de jugadors sense propietari */}
      {cards.length === 0 ? (
        <div className="card p-8 text-center text-ink-dim text-sm space-y-2">
          <p>No hi ha cap jugador sense propietari registrat al club.</p>
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="card p-8 text-center text-ink-dim text-sm space-y-3">
          <p>Cap jugador sense propietari coincideix amb els filtres seleccionats.</p>
          <button
            type="button"
            onClick={() => {
              setFilterSearch('')
              setFilterTeam('all')
              setFilterPosition('all')
              setFilterStatus('all')
            }}
            className="btn-ghost text-xs font-semibold py-1.5 px-3"
          >
            Netejar filtres
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
                  <th className="py-2.5 sm:py-3 px-2 sm:px-4 font-normal">
                    {isAuctionMode ? 'Preu mínim' : 'Preu de sortida'}
                  </th>
                  <th className="py-2.5 sm:py-3 px-3 sm:px-4 font-normal">
                    {isAuctionMode ? 'Temps subhasta' : 'Temps al mercat'}
                  </th>
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
                        <div className="font-semibold text-white text-xs sm:text-sm">
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
                        <span className="font-bold text-yellow-400 text-xs sm:text-sm" style={{ color: '#FACC15' }}>
                          {c.current_price ?? 5}M
                        </span>
                      </td>

                      <td className="py-2.5 sm:py-3 px-3 sm:px-4">
                        {isOnMarket && c.market_expires_at ? (
                          <span className="text-xs font-semibold text-amber-300 flex items-center gap-1">
                            <span>⏳</span>
                            <span>{timeLeft(c.market_expires_at)}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-ink-faint">—</span>
                        )}
                      </td>

                      <td className="hidden md:table-cell py-2.5 sm:py-3 px-3 sm:px-4">
                        <span
                          className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium border ${
                            isOnMarket
                              ? 'bg-ok/15 text-ok border-ok/30'
                              : 'bg-base-raised text-ink-dim border-base-border'
                          }`}
                        >
                          {isAuctionMode
                            ? isOnMarket
                              ? '🏛️ En subhasta'
                              : '🔒 Fora de subhasta'
                            : isOnMarket
                            ? '🏷️ A la venda'
                            : '🔒 Fora de mercat'}
                        </span>
                      </td>

                      <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-right">
                        {isOnMarket ? (
                          <button
                            type="button"
                            onClick={() => openWithdrawModal(c)}
                            className="text-xs py-1.5 px-3 rounded-lg border font-semibold bg-danger/10 border-danger/30 text-danger hover:bg-danger/20 transition-colors"
                          >
                            {isAuctionMode ? '✕ Cancel·lar subhasta' : '✕ Treure del mercat'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openPublishModal(c)}
                            className="text-xs py-1.5 px-3 rounded-lg border font-semibold bg-accent/15 border-accent/40 text-accent hover:bg-accent/25 transition-colors"
                          >
                            {isAuctionMode ? '🚀 Subhastar' : '🏷️ Posar a la venda'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal per posar a la venda o iniciar subhasta amb selecció de preu i durada */}
      {publishModal && (
        <MarketPublishModal
          data={publishModal}
          isAuctionMode={isAuctionMode}
          onClose={() => setPublishModal(null)}
          onConfirm={async (card, price, days) => {
            await handleConfirmPublishModal(card, price, days)
          }}
        />
      )}

      {/* Modal de confirmació per retirar del mercat / cancel·lar subhasta */}
      {withdrawConfirmModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setWithdrawConfirmModal(null)
          }}
          className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 animate-fade-in"
        >
          <div className="card w-full max-w-md p-5 sm:p-6 space-y-4 relative shadow-2xl border border-base-border">
            <div className="flex items-start justify-between gap-3 border-b border-base-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg bg-danger/20 text-danger border border-danger/40">
                  ✕
                </div>
                <div>
                  <h3 className="font-display font-semibold text-base sm:text-lg text-ink">
                    {withdrawConfirmModal.isAuction ? 'Cancel·lar Subhasta' : 'Treure del Mercat'}
                  </h3>
                  <p className="text-xs text-ink-dim mt-0.5">{withdrawConfirmModal.playerName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWithdrawConfirmModal(null)}
                className="text-ink-dim hover:text-ink text-sm p-1 rounded-lg bg-base-raised hover:bg-base-surface"
              >
                ✕
              </button>
            </div>

            <p className="text-xs sm:text-sm text-ink-dim leading-relaxed">
              {withdrawConfirmModal.isAuction
                ? `Segur que vols cancel·lar la subhasta per a ${withdrawConfirmModal.playerName}? El jugador deixarà d'estar visible per a rebre pujes.`
                : `Segur que vols retirar a ${withdrawConfirmModal.playerName} del mercat de fitxatges? El jugador deixarà d'estar visible a la venda.`}
            </p>

            <div className="flex gap-2.5 pt-2 border-t border-base-border">
              <button
                type="button"
                onClick={() => setWithdrawConfirmModal(null)}
                className="btn-ghost flex-1 py-2.5 text-xs sm:text-sm font-semibold min-h-[42px]"
              >
                Cancel·lar
              </button>
              <button
                type="button"
                onClick={withdrawConfirmModal.onConfirm}
                className="bg-danger hover:bg-danger/90 text-white flex-1 py-2.5 text-xs sm:text-sm font-semibold min-h-[42px] flex items-center justify-center gap-1.5 rounded-[10px]"
              >
                {withdrawConfirmModal.isAuction ? '✕ Sí, cancel·lar subhasta' : '✕ Sí, treure del mercat'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={msg} type="ok" onClose={() => setMsg('')} />
    </div>
  )
}

function MarketPublishModal({ data, isAuctionMode, onClose, onConfirm }) {
  const { card } = data
  const player = Array.isArray(card?.club_players) ? card.club_players[0] : card?.club_players
  const teamName = player?.club_teams?.name || (Array.isArray(player?.club_teams) ? player?.club_teams[0]?.name : 'Club')
  const [price, setPrice] = useState(data.price || '5.0')
  const [days, setDays] = useState(data.days || 3)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const numPrice = Number(price)

  async function handleSubmit(e) {
    e.preventDefault()
    if (isNaN(numPrice) || numPrice <= 0) {
      setError('Introdueix una quantitat vàlida superior a 0M')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onConfirm(card, numPrice, days)
    } catch (err) {
      setError(err.message || 'Error publicant jugador')
      setSubmitting(false)
    }
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm"
    >
      <div className="card w-full max-w-md p-5 sm:p-6 space-y-4 relative shadow-2xl border border-base-border animate-scale-up">
        {/* Capçalera */}
        <div className="flex items-start justify-between border-b border-base-border pb-3.5 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent border border-accent/40 flex items-center justify-center text-lg shrink-0 font-bold">
              {isAuctionMode ? '🚀' : '🏷️'}
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-semibold text-lg text-ink truncate leading-tight">
                {isAuctionMode ? 'Iniciar Subhasta' : 'Posar a la Venda'}
              </h3>
              <p className="text-xs text-ink-dim truncate mt-0.5">
                {isAuctionMode ? 'Configura el preu mínim i la durada de la subhasta' : 'Configura el preu de sortida i la durada al mercat'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-ink-dim hover:text-ink text-lg p-1.5 rounded-lg bg-base-raised shrink-0 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Dades del jugador */}
        <div className="p-3.5 rounded-xl bg-base-surface border border-base-border space-y-2">
          <div className="flex items-center gap-3">
            <Jersey number={player?.dorsal} className="w-12 h-12 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold text-ink text-base truncate">{player?.full_name}</p>
              <p className="text-xs text-ink-dim truncate">{teamName} · {player?.position}</p>
            </div>
          </div>
        </div>

        {/* Formulari */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3.5">
            {/* Preu */}
            <div>
              <label className="text-xs font-semibold text-ink-dim block mb-1.5">
                {isAuctionMode ? 'Preu mínim (milions) *' : 'Preu de sortida (milions) *'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="999"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="ex: 5.0"
                  required
                  className="input font-bold text-yellow-400 text-base pr-9 bg-base-surface"
                  style={{ color: '#FACC15' }}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-display font-bold text-sm text-yellow-400 pointer-events-none" style={{ color: '#FACC15' }}>
                  M
                </span>
              </div>
            </div>

            {/* Durada */}
            <div>
              <label className="text-xs font-semibold text-ink-dim block mb-1.5">
                {isAuctionMode ? 'Durada de la subhasta *' : 'Durada al mercat *'}
              </label>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="input font-semibold text-white text-sm bg-base-surface"
              >
                <option value={1}>1 dia</option>
                <option value={2}>2 dies</option>
                <option value={3}>3 dies (Defecte)</option>
                <option value={5}>5 dies</option>
                <option value={7}>7 dies</option>
              </select>
            </div>
          </div>

          {error && (
            <p className="text-danger text-xs bg-danger/10 border border-danger/30 p-2.5 rounded-lg">
              {error}
            </p>
          )}

          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-base-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-ghost py-2.5 px-4 text-xs sm:text-sm min-h-[42px]"
            >
              Cancel·lar
            </button>

            <button
              type="submit"
              disabled={submitting || numPrice <= 0}
              className="btn-primary py-2.5 px-5 text-xs sm:text-sm font-semibold min-h-[42px] flex items-center justify-center gap-1.5"
            >
              <span>{isAuctionMode ? '🚀' : '🏷️'}</span>
              <span>{submitting ? 'Publicant…' : isAuctionMode ? `Iniciar subhasta (${numPrice}M · ${days}d)` : `Posar a la venda (${numPrice}M · ${days}d)`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function OffersPanel() {
  const [offers, setOffers] = useState([])
  const [managerMarketCards, setManagerMarketCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState({ text: '', type: 'ok' })
  const [confirmModal, setConfirmModal] = useState(null)
  const [clubOfferModal, setClubOfferModal] = useState(null)

  async function load() {
    setLoading(true)
    try {
      // 1. Carregar ofertes pendents de traspàs
      const { data: offersData, error: offersErr } = await supabase
        .from('transfer_offers')
        .select(`
          id, amount, counter_amount, counter_by, status, created_at, bidder_manager_id, fantasy_card_id,
          managers:bidder_manager_id ( id, display_name, avatar_emoji, budget ),
          fantasy_cards (
            id, current_price, market_expires_at, owner_manager_id, status,
            club_players ( id, full_name, position, dorsal, club_teams ( id, name ) )
          )
        `)
        .in('status', ['pending', 'countered'])
        .order('created_at', { ascending: false })

      if (!offersErr && offersData) {
        setOffers(offersData)
      } else {
        const { data: rawOffers } = await supabase
          .from('transfer_offers')
          .select('id, amount, counter_amount, counter_by, status, created_at, bidder_manager_id, fantasy_card_id')
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
                club_players ( id, full_name, position, dorsal, club_teams ( id, name ) )
              `)
              .in('id', cardIds),
            bidderIds.length > 0
              ? supabase
                  .from('managers')
                  .select('id, display_name, avatar_emoji, budget')
                  .in('id', bidderIds)
              : Promise.resolve({ data: [] }),
          ])

          const cardMap = new Map((cardsRes.data || []).map((c) => [c.id, c]))
          const bidderMap = new Map((biddersRes.data || []).map((m) => [m.id, m]))

          const enriched = rawOffers.map((o) => ({
            ...o,
            fantasy_cards: cardMap.get(o.fantasy_card_id),
            managers: o.bidder_manager_id ? bidderMap.get(o.bidder_manager_id) : null,
          }))
          setOffers(enriched)
        } else {
          setOffers([])
        }
      }

      // 2. Carregar jugadors posats a la venda per managers (owner_manager_id != null && status = 'market')
      const { data: mmCards, error: mmErr } = await supabase
        .from('fantasy_cards')
        .select(`
          id, current_price, market_expires_at, market_listed_at, owner_manager_id, status,
          club_players ( id, full_name, position, dorsal, club_teams ( id, name ) ),
          managers:owner_manager_id ( id, display_name, avatar_emoji, budget )
        `)
        .eq('status', 'market')
        .not('owner_manager_id', 'is', null)
        .order('market_listed_at', { ascending: false })

      if (!mmErr && mmCards) {
        setManagerMarketCards(mmCards)
      } else {
        setManagerMarketCards([])
      }
    } catch (err) {
      console.error('Error general carregant dades a OffersPanel:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Modal per acceptar oferta d'un manager per a un jugador lliure
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

  // Modal per rebutjar oferta d'un manager
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

  // Obri modal per fer o modificar oferta del Club
  function openClubOfferModal(card, existingOffer = null) {
    setClubOfferModal({
      card,
      offer: existingOffer,
    })
  }

  // Enviar o actualitzar oferta del Club
  async function handleSendClubOffer(card, existingOffer, numAmount) {
    const player = Array.isArray(card.club_players) ? card.club_players[0] : card.club_players
    const seller = Array.isArray(card.managers) ? card.managers[0] : card.managers
    const playerName = player?.full_name || 'el jugador'
    const sellerName = seller?.display_name || 'el mànager'

    if (existingOffer) {
      const { error } = await supabase
        .from('transfer_offers')
        .update({
          amount: numAmount,
          counter_amount: null,
          counter_by: null,
          status: 'pending',
          created_at: new Date().toISOString(),
        })
        .eq('id', existingOffer.id)

      if (error) throw error

      await supabase.from('activity_log').insert({
        type: 'admin_action',
        message: `🏛️ El Club ha actualitzat la seva oferta a ${numAmount}M per ${playerName} a ${sellerName}`,
      })

      setMsg({ text: `Oferta del Club de ${numAmount}M actualitzada per a ${playerName}!`, type: 'ok' })
    } else {
      const { error } = await supabase
        .from('transfer_offers')
        .insert({
          bidder_manager_id: null,
          fantasy_card_id: card.id,
          amount: numAmount,
          status: 'pending',
        })

      if (error) throw error

      await supabase.from('activity_log').insert({
        type: 'admin_action',
        message: `🏛️ El Club ha fet una oferta de ${numAmount}M per ${playerName} a ${sellerName}`,
      })

      setMsg({ text: `Oferta del Club de ${numAmount}M enviada a ${sellerName} per ${playerName}!`, type: 'ok' })
    }

    load()
  }

  // Retirar oferta del Club
  function openWithdrawClubOfferModal(offer, card) {
    const player = Array.isArray(card.club_players) ? card.club_players[0] : card.club_players
    const seller = Array.isArray(card.managers) ? card.managers[0] : card.managers
    const playerName = player?.full_name || 'el jugador'
    const sellerName = seller?.display_name || 'el mànager'

    setConfirmModal({
      icon: '🗑️',
      iconBg: 'bg-danger/20 text-danger border border-danger/40',
      title: "Retirar oferta del Club",
      subtitle: `Cancel·lar la proposta enviada a ${sellerName}`,
      playerName,
      teamName: player?.club_teams?.name,
      position: player?.position,
      amount: `${offer.amount}M`,
      amountLabel: "Oferta actual",
      partyLabel: "Destinatari",
      partyName: sellerName,
      partyEmoji: seller?.avatar_emoji || '👤',
      description: `Es cancel·larà l'oferta de ${offer.amount}M enviada per ${playerName}. El mànager deixarà de veure aquesta oferta al seu mercat.`,
      confirmText: "🗑️ Sí, retirar oferta",
      confirmStyle: 'bg-danger text-white hover:brightness-110',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('transfer_offers')
            .delete()
            .eq('id', offer.id)

          if (error) {
            await supabase.from('transfer_offers').update({ status: 'rejected', resolved_at: new Date().toISOString() }).eq('id', offer.id)
          }

          await supabase.from('activity_log').insert({
            type: 'admin_action',
            message: `🏛️ El Club ha retirat la seva oferta per ${playerName}`,
          })

          setMsg({ text: `Oferta del Club per ${playerName} retirada correctament.`, type: 'ok' })
          setConfirmModal(null)
          load()
        } catch (err) {
          setMsg({ text: err.message || "Error retirant l'oferta", type: 'error' })
        }
      },
    })
  }

  // Acceptar contraoferta del mànager
  function openAcceptManagerCounterModal(offer, card) {
    const player = Array.isArray(card.club_players) ? card.club_players[0] : card.club_players
    const seller = Array.isArray(card.managers) ? card.managers[0] : card.managers
    const playerName = player?.full_name || 'el jugador'
    const sellerName = seller?.display_name || 'el mànager'
    const counterAmount = Number(offer.counter_amount || offer.amount)

    setConfirmModal({
      icon: '🏛️',
      iconBg: 'bg-accent/20 text-accent border border-accent/40',
      title: "Acceptar contraoferta del mànager",
      subtitle: `Fitxatge oficial pel Club de ${playerName}`,
      playerName,
      teamName: player?.club_teams?.name,
      position: player?.position,
      amount: `${counterAmount}M`,
      amountLabel: "Preu acordat",
      partyLabel: "Venedor",
      partyName: sellerName,
      partyEmoji: seller?.avatar_emoji || '👤',
      description: `El Club pagarà ${counterAmount}M a ${sellerName}. ${playerName} passarà immediatament a la borsa del Club com a 'sense propietari'.`,
      confirmText: `🏛️ Sí, acceptar contraoferta (${counterAmount}M)`,
      confirmStyle: 'btn-primary',
      onConfirm: async () => {
        try {
          const sellerId = card.owner_manager_id

          // 1. Ingressar diners al venedor
          if (sellerId && counterAmount > 0) {
            const { data: sData } = await supabase.from('managers').select('budget').eq('id', sellerId).single()
            await supabase.from('managers').update({ budget: (sData?.budget || 0) + counterAmount }).eq('id', sellerId)
          }

          // 2. Transferir carta al club (sense propietari)
          await supabase.from('fantasy_cards').update({
            owner_manager_id: null,
            status: 'owned',
            current_price: counterAmount,
            market_listed_at: null,
            market_expires_at: null,
          }).eq('id', card.id)

          // 3. Marcar oferta com acceptada
          await supabase.from('transfer_offers').update({
            amount: counterAmount,
            status: 'accepted',
            resolved_at: new Date().toISOString(),
          }).eq('id', offer.id)

          // 4. Rebutjar altres ofertes pendents
          await supabase.from('transfer_offers').update({
            status: 'rejected',
            resolved_at: new Date().toISOString(),
          }).eq('fantasy_card_id', card.id).neq('id', offer.id)

          // 5. Registrar activitat
          await supabase.from('activity_log').insert({
            type: 'admin_action',
            message: `🏛️ El Club ha acceptat la contraoferta de ${counterAmount}M per ${playerName} del mànager ${sellerName}`,
          })

          setMsg({ text: `🎉 ${playerName} fitxat correctament pel Club per ${counterAmount}M! Ara és a la borsa sense propietari.`, type: 'ok' })
          setConfirmModal(null)
          load()
        } catch (err) {
          setMsg({ text: err.message || "Error acceptant la contraoferta", type: 'error' })
        }
      },
    })
  }

  // Rebutjar contraoferta del mànager
  function openRejectManagerCounterModal(offer, card) {
    const player = Array.isArray(card.club_players) ? card.club_players[0] : card.club_players
    const seller = Array.isArray(card.managers) ? card.managers[0] : card.managers
    const playerName = player?.full_name || 'el jugador'
    const sellerName = seller?.display_name || 'el mànager'
    const counterAmount = offer.counter_amount

    setConfirmModal({
      icon: '✕',
      iconBg: 'bg-danger/20 text-danger border border-danger/40',
      title: "Rebutjar contraoferta",
      subtitle: `Descartar la proposta de ${counterAmount}M`,
      playerName,
      teamName: player?.club_teams?.name,
      position: player?.position,
      amount: `${counterAmount}M`,
      amountLabel: "Contraoferta rebuda",
      partyLabel: "Venedor",
      partyName: sellerName,
      partyEmoji: seller?.avatar_emoji || '👤',
      description: `Es rebutjarà la contraoferta de ${counterAmount}M de ${sellerName} per ${playerName}. La negociació del Club quedarà cancel·lada.`,
      confirmText: "✕ Sí, rebutjar",
      confirmStyle: 'bg-danger text-white hover:brightness-110',
      onConfirm: async () => {
        try {
          await supabase.from('transfer_offers').update({
            status: 'rejected',
            resolved_at: new Date().toISOString(),
          }).eq('id', offer.id)

          setMsg({ text: `Contraoferta de ${sellerName} per ${playerName} rebutjada.`, type: 'ok' })
          setConfirmModal(null)
          load()
        } catch (err) {
          setMsg({ text: err.message || "Error rebutjant la contraoferta", type: 'error' })
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
    <div className="space-y-8">
      {msg.text && (
        <Toast
          message={msg.text}
          type={msg.type}
          onClose={() => setMsg({ text: '', type: 'ok' })}
        />
      )}

      {/* SECCIÓ 1: JUGADORS A LA VENDA PER MÀNAGERS (OFERTES DEL CLUB) */}
      <div className="space-y-4">
        <div className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 border border-base-border bg-base-raised/30">
          <div className="space-y-1">
            <h3 className="font-display font-semibold text-lg text-ink flex items-center gap-2">
              <span className="text-yellow-400" style={{ color: '#FACC15' }}>🏛️</span>
              <span>Jugadors a la venda posats per mànagers ({managerMarketCards.length})</span>
            </h3>
            <p className="text-xs text-ink-dim leading-relaxed">
              Llistat de jugadors que els usuaris han posat a la venda al mercat de fitxatges. Com a administrador, pots <strong>fer ofertes de fitxatge com a Club</strong>. El mànager rebrà l'oferta oficial a la seva safata de <em>Mercat &gt; Ofertes rebudes</em> de <strong>🏛️ El Club</strong> i podrà acceptar-la, rebutjar-la o fer una contraoferta. Si la transacció es confirma, el jugador tornarà a la borsa del club com a <strong>sense propietari</strong>.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-ink-dim text-sm py-6 text-center">Carregant jugadors a la venda…</p>
        ) : managerMarketCards.length === 0 ? (
          <div className="card p-6 sm:p-8 text-center text-ink-dim text-sm space-y-1 bg-base-raised/20">
            <p className="font-semibold text-ink">No hi ha cap jugador posat a la venda per mànagers</p>
            <p className="text-xs text-ink-faint">
              Quan un mànager posi un jugador seu a la venda al mercat, apareixerà aquí per poder-li fer ofertes des del Club.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {managerMarketCards.map((card) => {
              const player = Array.isArray(card.club_players) ? card.club_players[0] : card.club_players
              const seller = Array.isArray(card.managers) ? card.managers[0] : card.managers
              const pos = player?.position?.toUpperCase()
              const posConfig = POS_CONFIG[pos] || { label: player?.position || 'Jugador', emoji: '⚽', badge: 'bg-base-raised text-ink border-base-border' }

              // Cercar si hi ha una oferta activa del club per aquest jugador
              const clubOffer = offers.find((o) => o.fantasy_card_id === card.id && !o.bidder_manager_id)
              const isPending = clubOffer && clubOffer.status === 'pending'
              const isCountered = clubOffer && clubOffer.status === 'countered'

              return (
                <div
                  key={card.id}
                  className={`card p-4 sm:p-5 flex flex-col justify-between gap-4 border transition-all shadow-sm ${
                    isCountered
                      ? 'border-amber-500/60 bg-amber-950/15'
                      : isPending
                      ? 'border-accent/60 bg-accent/5'
                      : 'border-base-border bg-base-raised/60 hover:border-accent/40'
                  }`}
                >
                  <div className="space-y-3.5">
                    {/* Capçalera Jugador */}
                    <div className="flex items-start justify-between gap-2 border-b border-base-border/70 pb-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Jersey number={player?.dorsal} className="w-12 h-12 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-display font-bold text-ink text-base truncate">
                            {player?.full_name || 'Jugador'}
                          </p>
                          <p className="text-xs text-ink-dim mt-0.5 truncate">
                            {player?.club_teams?.name || 'Club'}
                          </p>
                        </div>
                      </div>
                      <span className={`text-[10px] sm:text-[11px] px-2.5 py-0.5 rounded-full border font-semibold shrink-0 flex items-center gap-1 ${posConfig.badge}`}>
                        <span>{posConfig.label}</span>
                        <span className="select-none">{posConfig.emoji}</span>
                      </span>
                    </div>

                    {/* Dades del Venedor i Preu */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-base-surface border border-base-border">
                        <div>
                          <p className="text-[11px] text-ink-dim">Preu fixat pel mànager</p>
                          <p className="font-display text-xl font-bold text-yellow-400" style={{ color: '#FACC15' }}>
                            {card.current_price}M
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] text-ink-dim">Temps restant</p>
                          <p className="text-xs font-semibold text-accent">
                            {card.market_expires_at ? timeLeft(card.market_expires_at) : 'Sense límit'}
                          </p>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-base-surface/80 border border-base-border/60 text-xs flex items-center justify-between">
                        <span className="text-ink-dim">Propietari / Venedor:</span>
                        <span className="font-bold text-ink flex items-center gap-1.5">
                          <span>{seller?.avatar_emoji || '👤'}</span>
                          <span>{seller?.display_name || 'Mànager'}</span>
                        </span>
                      </div>

                      {/* Estat d'ofertes del Club */}
                      {isCountered ? (
                        <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs space-y-1 animate-fade-in">
                          <div className="flex items-center justify-between">
                            <span className="font-bold flex items-center gap-1.5 text-amber-100">
                              <span>💬</span> Contraoferta del mànager!
                            </span>
                            <span className="font-display font-bold text-sm text-yellow-300" style={{ color: '#FACC15' }}>
                              {clubOffer.counter_amount}M
                            </span>
                          </div>
                          <p className="text-[11px] text-amber-200/90 leading-relaxed">
                            El mànager proposa traspassar el jugador per <strong>{clubOffer.counter_amount}M</strong> (la teva oferta era de {clubOffer.amount}M).
                          </p>
                        </div>
                      ) : isPending ? (
                        <div className="p-2.5 rounded-xl bg-accent/15 border border-accent/30 text-xs flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-accent font-medium">
                            <span>🏛️</span> Oferta del Club enviada:
                          </span>
                          <span className="font-display font-bold text-yellow-400" style={{ color: '#FACC15' }}>
                            {clubOffer.amount}M <span className="text-[10px] text-ink-dim font-normal italic">(Pendent)</span>
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Botons d'acció per fer o gestionar oferta */}
                  <div className="pt-2 border-t border-base-border/70">
                    {isCountered ? (
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => openAcceptManagerCounterModal(clubOffer, card)}
                          className="btn-primary w-full py-2.5 px-3 text-xs sm:text-sm font-semibold min-h-[40px] flex items-center justify-center gap-1.5 shadow-md"
                        >
                          <span>✓</span>
                          <span>Acceptar contraoferta ({clubOffer.counter_amount}M)</span>
                        </button>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openClubOfferModal(card, clubOffer)}
                            className="btn-ghost flex-1 py-2 px-2 text-xs font-semibold border border-base-border hover:border-accent/40 text-ink flex items-center justify-center gap-1"
                          >
                            <span>✏️</span>
                            <span>Proposar nou preu</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openRejectManagerCounterModal(clubOffer, card)}
                            className="py-2 px-3 text-xs font-semibold rounded-xl bg-danger/15 hover:bg-danger/25 text-danger border border-danger/40 flex items-center justify-center gap-1 transition-colors"
                          >
                            <span>✕</span>
                            <span>Rebutjar</span>
                          </button>
                        </div>
                      </div>
                    ) : isPending ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openClubOfferModal(card, clubOffer)}
                          className="btn-ghost flex-1 py-2.5 px-3 text-xs sm:text-sm font-semibold border border-base-border hover:border-accent/50 text-ink min-h-[40px] flex items-center justify-center gap-1.5"
                        >
                          <span>✏️</span>
                          <span>Modificar oferta</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openWithdrawClubOfferModal(clubOffer, card)}
                          className="py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-xl bg-danger/15 hover:bg-danger/25 text-danger border border-danger/40 flex items-center justify-center gap-1.5 transition-colors min-h-[40px]"
                        >
                          <span>🗑️</span>
                          <span>Retirar</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openClubOfferModal(card, null)}
                        className="btn-primary w-full py-2.5 px-3 text-xs sm:text-sm font-semibold min-h-[42px] flex items-center justify-center gap-1.5 shadow-md"
                      >
                        <span>🏛️</span>
                        <span>Fer oferta del Club</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* SECCIÓ 2: OFERTES PENDENTS DE TRASPÀS PER A JUGADORS DEL CLUB */}
      <div className="space-y-4 pt-4 border-t border-base-border">
        <div className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-display font-semibold text-lg text-ink flex items-center gap-2">
              <span>📥</span>
              <span>Ofertes de mànagers per a jugadors lliures del club ({freeAgentOffers.length})</span>
            </h3>
            <p className="text-xs text-ink-dim leading-relaxed">
              Aquestes ofertes s'accepten automàticament quan expira el compte enrere a favor del millor postor. Si ho desitges, pots acceptar o descartar ofertes manualment abans que venci el termini.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-ink-dim text-sm py-6 text-center">Carregant ofertes de jugadors lliures…</p>
        ) : freeAgentOffers.length === 0 ? (
          <div className="card p-6 sm:p-8 text-center text-ink-dim text-sm space-y-1">
            <p className="font-semibold text-ink">No hi ha cap oferta pendent per a jugadors del club</p>
            <p className="text-xs text-ink-faint">
              Quan els mànagers facin ofertes per fitxar jugadors lliures del mercat, apareixeran aquí.
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
      </div>

      {/* Modal de confirmació personalitzat per acceptar, rebutjar o comprar pel club */}
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

      {/* Modal per fer o modificar oferta del Club */}
      {clubOfferModal && (
        <ClubOfferModal
          data={clubOfferModal}
          onClose={() => setClubOfferModal(null)}
          onSubmit={async (amount) => {
            await handleSendClubOffer(clubOfferModal.card, clubOfferModal.offer, amount)
          }}
        />
      )}
    </div>
  )
}

function ClubOfferModal({ data, onClose, onSubmit }) {
  const { card, offer } = data
  const player = Array.isArray(card.club_players) ? card.club_players[0] : card.club_players
  const seller = Array.isArray(card.managers) ? card.managers[0] : card.managers
  const askingPrice = card.current_price || 10

  // 'direct' = Oferir el preu del mànager | 'custom' = Fer contraoferta
  const [offerType, setOfferType] = useState(offer ? 'custom' : 'direct')
  const [customAmount, setCustomAmount] = useState(
    offer ? (offer.counter_amount || offer.amount).toString() : Math.max(0.5, askingPrice - 1).toString()
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const finalAmount = offerType === 'direct' ? Number(askingPrice) : Number(customAmount)

  async function handleSubmit(e) {
    e.preventDefault()
    if (isNaN(finalAmount) || finalAmount <= 0) {
      setError('Introdueix una quantitat vàlida superior a 0M')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onSubmit(finalAmount)
      onClose()
    } catch (err) {
      setError(err.message || 'Error enviant oferta')
      setSubmitting(false)
    }
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm"
    >
      <div className="card w-full max-w-md p-5 sm:p-6 space-y-4 relative shadow-2xl border border-base-border animate-scale-up">
        {/* Capçalera */}
        <div className="flex items-start justify-between border-b border-base-border pb-3.5 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent border border-accent/40 flex items-center justify-center text-lg shrink-0 font-bold">
              🏛️
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-semibold text-lg text-ink truncate leading-tight">
                {offer ? 'Modificar oferta del Club' : 'Fer oferta del Club'}
              </h3>
              <p className="text-xs text-ink-dim truncate mt-0.5">
                Proposta oficial de compra a {seller?.display_name || 'el mànager'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-ink-dim hover:text-ink text-lg p-1.5 rounded-lg bg-base-raised shrink-0 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Dades del jugador i venedor */}
        <div className="p-3.5 rounded-xl bg-base-surface border border-base-border space-y-2">
          <div className="flex items-center gap-3">
            <Jersey number={player?.dorsal} className="w-12 h-12 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold text-ink text-base truncate">{player?.full_name}</p>
              <p className="text-xs text-ink-dim truncate">
                {player?.club_teams?.name || 'Club'} · {player?.position}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs pt-2 border-t border-base-border/60">
            <span className="text-ink-dim">Preu marcat pel mànager:</span>
            <span className="font-display font-bold text-yellow-400 text-sm" style={{ color: '#FACC15' }}>
              {askingPrice}M
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-dim">Propietari actual:</span>
            <span className="font-semibold text-ink flex items-center gap-1">
              <span>{seller?.avatar_emoji || '👤'}</span>
              <span>{seller?.display_name || 'Mànager'}</span>
            </span>
          </div>
        </div>

        {/* Formulari d'opcions */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-ink-dim block">Tria una opció:</label>

            {/* Opció 1: Oferir preu marcat pel mànager */}
            <button
              type="button"
              onClick={() => setOfferType('direct')}
              className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                offerType === 'direct'
                  ? 'bg-accent/15 border-accent shadow-sm'
                  : 'bg-base-surface border-base-border hover:border-base-border/90'
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span className="text-accent">{offerType === 'direct' ? '●' : '○'}</span>
                  <span>Oferir {askingPrice}M per {player?.full_name || 'el jugador'}</span>
                </div>
                <div className="text-[11px] text-ink-dim mt-0.5 pl-4">
                  Oferir el valor que el mànager li ha posat
                </div>
              </div>
              <span className="font-display font-bold text-base text-yellow-400 shrink-0" style={{ color: '#FACC15' }}>
                {askingPrice}M
              </span>
            </button>

            {/* Opció 2: Fer contraoferta */}
            <button
              type="button"
              onClick={() => setOfferType('custom')}
              className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                offerType === 'custom'
                  ? 'bg-accent/15 border-accent shadow-sm'
                  : 'bg-base-surface border-base-border hover:border-base-border/90'
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span className="text-accent">{offerType === 'custom' ? '●' : '○'}</span>
                  <span>Fer contraoferta</span>
                </div>
                <div className="text-[11px] text-ink-dim mt-0.5 pl-4">
                  Escriu una quantitat diferent a oferir
                </div>
              </div>
              <span className="text-xs font-semibold text-accent shrink-0">
                Personalitzat ✏️
              </span>
            </button>

            {/* Camp d'entrada si es tria contraoferta */}
            {offerType === 'custom' && (
              <div className="p-3.5 rounded-xl bg-base-surface border border-accent/40 space-y-1.5 animate-fade-in">
                <label className="text-xs font-semibold text-ink flex items-center justify-between">
                  <span>Quantitat de la contraoferta (milions):</span>
                  <span className="text-yellow-400 font-bold" style={{ color: '#FACC15' }}>
                    {Number(customAmount) > 0 ? `${customAmount}M` : '0M'}
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="999"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder="ex: 8.5"
                    required={offerType === 'custom'}
                    autoFocus
                    className="input w-full text-base font-bold pr-9 bg-base-raised"
                    style={{ color: '#FACC15' }}
                  />
                  <span
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 font-display font-bold text-sm text-yellow-400 pointer-events-none"
                    style={{ color: '#FACC15' }}
                  >
                    M
                  </span>
                </div>
              </div>
            )}
          </div>

          <p className="text-[11px] text-ink-dim leading-relaxed bg-base-surface p-2.5 rounded-xl border border-base-border/50">
            💡 El mànager rebrà la proposta a <strong>Mercat &gt; Ofertes rebudes</strong> de <strong>🏛️ El Club</strong>. Si l'accepta, el jugador tornarà a la borsa del club com a sense propietari.
          </p>

          {error && (
            <p className="text-danger text-xs bg-danger/10 border border-danger/30 p-2.5 rounded-lg">
              {error}
            </p>
          )}

          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-base-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-ghost py-2.5 px-4 text-xs sm:text-sm min-h-[42px]"
            >
              Cancel·lar
            </button>

            <button
              type="submit"
              disabled={submitting || finalAmount <= 0 || isNaN(finalAmount)}
              className="btn-primary py-2.5 px-5 text-xs sm:text-sm font-semibold min-h-[42px] flex items-center justify-center gap-1.5"
            >
              <span>{offerType === 'direct' ? '🏛️' : '💬'}</span>
              <span>
                {submitting
                  ? 'Enviant…'
                  : offerType === 'direct'
                  ? `Oferir ${askingPrice}M per ${player?.full_name || 'el jugador'}`
                  : `Enviar contraoferta (${finalAmount}M)`}
              </span>
            </button>
          </div>
        </form>
      </div>
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
        {/* LLISTA DE JORNADES (esquerra a desktop, abaix a mòbil) */}
        <div className="lg:col-span-7 card p-4 sm:p-5 space-y-3 order-2 lg:order-1">
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

        {/* FORMULARI CREAR NOVA JORNADA (dreta a desktop, adalt a mòbil) */}
        <form onSubmit={addMatchday} className="lg:col-span-5 card p-4 sm:p-5 space-y-3.5 order-1 lg:order-2">
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

        <div className="card overflow-x-auto">
          <table className="w-full text-xs sm:text-sm min-w-[560px]">
            <thead>
              <tr className="text-ink-faint text-left border-b border-base-border bg-base-raised/40">
                <th className="py-2.5 sm:py-3 px-3 sm:px-4 font-normal">Manager</th>
                <th className="py-2.5 sm:py-3 px-3 sm:px-4 font-normal">Usuari</th>
                <th className="py-2.5 sm:py-3 px-2 sm:px-4 font-normal">Pressupost</th>
                <th className="py-2.5 sm:py-3 px-3 sm:px-4 font-normal">Rol</th>
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
                          {coachTeams.length > 0 && (
                            <div className="text-[10px] sm:text-xs text-ink-dim truncate">
                              ⚽ {coachTeams.join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-ink-dim font-mono text-xs">@{m.username}</td>
                    <td className="py-2.5 sm:py-3 px-2 sm:px-4">
                      <span className="text-accent font-display font-semibold text-xs sm:text-sm whitespace-nowrap">
                        {m.budget}M
                      </span>
                    </td>
                    <td className="py-2.5 sm:py-3 px-3 sm:px-4">
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


