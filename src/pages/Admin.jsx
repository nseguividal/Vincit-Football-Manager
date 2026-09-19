import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Topbar from '../components/Topbar'

const TABS = ['Mercat setmanal', 'Ofertes pendents', 'Jornades', 'Usuaris']

export default function Admin() {
  const [tab, setTab] = useState(TABS[0])

  return (
    <div>
      <Topbar title="Administració" subtitle="Accés només per a l'administrador del joc" />
      <div className="px-8 pt-6 flex gap-2 border-b border-base-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t ? 'border-accent text-accent' : 'border-transparent text-ink-dim hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="p-8">
        {tab === 'Mercat setmanal' && <MarketPanel />}
        {tab === 'Ofertes pendents' && <OffersPanel />}
        {tab === 'Jornades' && <MatchdaysPanel />}
        {tab === 'Usuaris' && <UsersPanel />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function MarketPanel() {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('fantasy_cards')
      .select(`
        id, current_price, status,
        club_players ( id, full_name, position, club_teams ( name ) )
      `)
      .order('club_player_id')
    setCards(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function setPrice(cardId, price) {
    await supabase.from('fantasy_cards').update({ current_price: Number(price) }).eq('id', cardId)
  }

  async function toggleMarket(card) {
    if (card.status === 'market') {
      await supabase.from('fantasy_cards').update({
        status: 'owned', market_listed_at: null, market_expires_at: null,
      }).eq('id', card.id)
    } else {
      await supabase.from('fantasy_cards').update({
        status: 'market',
        market_listed_at: new Date().toISOString(),
        market_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }).eq('id', card.id)
      await supabase.from('activity_log').insert({
        type: 'market_new',
        message: `${card.club_players?.full_name} ha sortit al mercat per ${card.current_price}M`,
      })
    }
    setMsg('Actualitzat.')
    load()
  }

  if (loading) return <p className="text-ink-dim text-sm">Carregant…</p>

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-ink-faint text-left border-b border-base-border bg-base-raised/40">
            <th className="py-3 px-5 font-normal">Jugador</th>
            <th className="py-3 px-5 font-normal">Equip</th>
            <th className="py-3 px-5 font-normal">Valor</th>
            <th className="py-3 px-5 font-normal">Estat</th>
            <th className="py-3 px-5 font-normal"></th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={c.id} className="border-b border-base-border/60 last:border-0">
              <td className="py-2.5 px-5 font-medium">{c.club_players?.full_name}</td>
              <td className="py-2.5 px-5 text-ink-dim">{c.club_players?.club_teams?.name}</td>
              <td className="py-2.5 px-5">
                <input
                  type="number" step="0.5" defaultValue={c.current_price}
                  className="input py-1 w-24 text-sm"
                  onBlur={(e) => setPrice(c.id, e.target.value)}
                />
              </td>
              <td className="py-2.5 px-5">
                <span className={`text-xs px-2 py-1 rounded-full ${
                  c.status === 'market' ? 'bg-accent/20 text-accent' : 'bg-base-raised text-ink-dim'
                }`}>
                  {c.status === 'market' ? 'Al mercat' : 'A plantilla'}
                </span>
              </td>
              <td className="py-2.5 px-5 text-right">
                <button onClick={() => toggleMarket(c)} className="btn-ghost text-xs py-1.5">
                  {c.status === 'market' ? 'Treure del mercat' : 'Posar al mercat'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {msg && <p className="text-ok text-xs px-5 py-2">{msg}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
function OffersPanel() {
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('transfer_offers')
      .select(`
        id, amount, created_at,
        managers ( display_name ),
        fantasy_cards ( club_players ( full_name ) )
      `)
      .eq('status', 'pending')
      .order('amount', { ascending: false })
    setOffers(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function accept(offerId) {
    const { error } = await supabase.rpc('accept_transfer_offer', { p_offer_id: offerId })
    if (error) alert(error.message)
    load()
  }

  if (loading) return <p className="text-ink-dim text-sm">Carregant…</p>
  if (offers.length === 0) return <p className="text-ink-dim text-sm">No hi ha ofertes pendents.</p>

  return (
    <div className="space-y-3">
      {offers.map((o) => (
        <div key={o.id} className="card p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">
              {o.managers?.display_name} ofereix <span className="text-accent font-display">{o.amount}M</span> per {o.fantasy_cards?.club_players?.full_name}
            </p>
            <p className="text-xs text-ink-faint mt-0.5">
              {new Date(o.created_at).toLocaleString('ca-ES')}
            </p>
          </div>
          <button onClick={() => accept(o.id)} className="btn-primary text-sm py-2">Acceptar</button>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
function MatchdaysPanel() {
  const [matchdays, setMatchdays] = useState([])
  const [label, setLabel] = useState('')
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')

  async function load() {
    const { data } = await supabase.from('matchdays').select('*').order('number')
    setMatchdays(data || [])
  }
  useEffect(() => { load() }, [])

  async function addMatchday(e) {
    e.preventDefault()
    const nextNumber = (matchdays[matchdays.length - 1]?.number || 0) + 1
    await supabase.from('matchdays').insert({
      number: nextNumber, label, starts_at: starts, ends_at: ends,
    })
    setLabel(''); setStarts(''); setEnds('')
    load()
  }

  async function setCurrent(id) {
    await supabase.from('matchdays').update({ is_current: false }).neq('id', id)
    await supabase.from('matchdays').update({ is_current: true }).eq('id', id)
    load()
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="card p-5">
        <h3 className="font-display font-semibold mb-3">Jornades</h3>
        <div className="space-y-2">
          {matchdays.map((m) => (
            <div key={m.id} className="flex items-center justify-between bg-base-raised rounded-lg px-3 py-2">
              <span className="text-sm">{m.label || `Jornada ${m.number}`}</span>
              {m.is_current ? (
                <span className="text-xs text-accent">Actual</span>
              ) : (
                <button onClick={() => setCurrent(m.id)} className="text-xs text-ink-dim hover:text-accent">
                  Marcar com actual
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={addMatchday} className="card p-5 space-y-3">
        <h3 className="font-display font-semibold">Nova jornada</h3>
        <input className="input" placeholder="Etiqueta (ex: Jornada 4)" value={label} onChange={(e) => setLabel(e.target.value)} required />
        <div className="grid grid-cols-2 gap-3">
          <input type="date" className="input" value={starts} onChange={(e) => setStarts(e.target.value)} required />
          <input type="date" className="input" value={ends} onChange={(e) => setEnds(e.target.value)} required />
        </div>
        <button type="submit" className="btn-primary w-full">Crear jornada</button>
      </form>
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
            <span className="text-sm font-semibold text-ink block">Rols i permisos:</span>

            <label className="flex items-center gap-2.5 text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                className="rounded border-base-border text-accent focus:ring-0 w-4 h-4"
              />
              <span>És <strong>Administrador</strong> (accés a aquest panell)</span>
            </label>

            <label className="flex items-center gap-2.5 text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={isCoach}
                onChange={(e) => setIsCoach(e.target.checked)}
                className="rounded border-base-border text-accent focus:ring-0 w-4 h-4"
              />
              <span>És <strong>Entrenador</strong> (pot pujar punts dels seus equips)</span>
            </label>
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

          {msg.text && (
            <div
              className={`p-3 rounded-lg text-sm ${
                msg.type === 'ok' ? 'bg-ok/20 text-ok border border-ok/30' : 'bg-danger/20 text-danger border border-danger/30'
              }`}
            >
              {msg.text}
            </div>
          )}

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
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ink-faint text-left border-b border-base-border bg-base-raised/40">
                <th className="py-3 px-4 font-normal">Manager</th>
                <th className="py-3 px-4 font-normal">Usuari</th>
                <th className="py-3 px-4 font-normal">Pressupost</th>
                <th className="py-3 px-4 font-normal">Rols</th>
                <th className="py-3 px-4 font-normal text-right">Accions</th>
              </tr>
            </thead>
            <tbody>
              {managers.map((m) => {
                const coachTeams = m.coach_assignments?.map((ca) => ca.club_teams?.name).filter(Boolean) || []
                return (
                  <tr key={m.id} className="border-b border-base-border/60 last:border-0 hover:bg-base-surface/40">
                    <td className="py-3 px-4 font-medium text-ink">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{m.avatar_emoji || '⚽'}</span>
                        <div>
                          <div className="font-semibold text-ink">{m.display_name}</div>
                          {coachTeams.length > 0 && (
                            <div className="text-xs text-ink-dim mt-0.5">
                              ⚽ {coachTeams.join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-ink-dim font-mono text-xs">{m.username}</td>
                    <td className="py-3 px-4">
                      <span className="text-accent font-display font-semibold text-sm">
                        {m.budget}M
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1.5">
                        {m.is_admin && (
                          <span className="text-xs uppercase font-semibold px-2 py-0.5 rounded bg-danger/20 text-danger border border-danger/30">
                            Admin
                          </span>
                        )}
                        {m.is_coach && (
                          <span className="text-xs uppercase font-semibold px-2 py-0.5 rounded bg-accent/20 text-accent border border-accent/30">
                            Entrenador
                          </span>
                        )}
                        {!m.is_admin && !m.is_coach && (
                          <span className="text-xs px-2 py-0.5 rounded bg-base-raised text-ink-dim">
                            Jugador
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => startEdit(m)}
                          className="btn-ghost text-xs py-1.5 px-3 text-ink hover:text-accent flex items-center gap-1"
                          title="Modificar dades d'aquest usuari"
                        >
                          ✏️ Modificar
                        </button>

                        <button
                          onClick={() => {
                            setResetPwdUserId(m)
                            setNewPassword('')
                          }}
                          className="btn-ghost text-sm py-1.5 px-2.5 text-ink-dim hover:text-ink"
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
            <span className="text-sm font-semibold text-ink block">Rols i permisos:</span>

            <label className="flex items-center gap-2.5 text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                className="rounded border-base-border text-accent focus:ring-0 w-4 h-4"
              />
              <span>És <strong>Administrador</strong></span>
            </label>

            <label className="flex items-center gap-2.5 text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={isCoach}
                onChange={(e) => setIsCoach(e.target.checked)}
                className="rounded border-base-border text-accent focus:ring-0 w-4 h-4"
              />
              <span>És <strong>Entrenador</strong></span>
            </label>
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


