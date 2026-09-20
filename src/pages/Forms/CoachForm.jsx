import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { getCurrentMatchday } from '../../lib/matchdayUtils'
import { useAuth } from '../../context/AuthContext'
import ConfirmPasswordField from '../../components/ConfirmPasswordField'
import Toast from '../../components/Toast'

export default function CoachForm() {
  const { manager, isAdmin, verifyPassword } = useAuth()

  const [teams, setTeams] = useState([])
  const [teamId, setTeamId] = useState('')
  const [matchdays, setMatchdays] = useState([])
  const [matchdayId, setMatchdayId] = useState('')
  const [players, setPlayers] = useState([])
  const [rows, setRows] = useState({}) // player_id -> { attended, points, goals, assists, saves }
  const [matchResult, setMatchResult] = useState('win') // 'win' | 'draw' | 'loss'
  const [hasExistingData, setHasExistingData] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!manager) return
    async function loadTeams() {
      if (isAdmin) {
        const { data } = await supabase.from('club_teams').select('id, name').order('name')
        setTeams(data || [])
      } else {
        const { data } = await supabase
          .from('coach_assignments')
          .select('club_teams ( id, name )')
          .eq('manager_id', manager.id)
        setTeams((data || []).map((d) => d.club_teams))
      }
    }
    loadTeams()
    supabase
      .from('matchdays')
      .select('id, number, label, starts_at, ends_at, is_extra')
      .order('number')
      .then(({ data }) => {
        const list = data || []
        setMatchdays(list)
        if (list.length > 0) {
          const autoMd = getCurrentMatchday(list)
          if (autoMd) setMatchdayId((prev) => prev || autoMd.id)
        }
      })
  }, [manager, isAdmin])

  useEffect(() => {
    if (!teamId) {
      setPlayers([])
      setRows({})
      setHasExistingData(false)
      return
    }

    async function loadPlayersAndStats() {
      setLoadingData(true)
      try {
        const { data: playersData, error: pErr } = await supabase
          .from('club_players')
          .select('id, full_name, position')
          .eq('team_id', teamId)
          .eq('active', true)
          .order('full_name')

        if (pErr) throw pErr
        const currentPlayers = playersData || []
        setPlayers(currentPlayers)

        if (currentPlayers.length === 0) {
          setRows({})
          setHasExistingData(false)
          return
        }

        // Check if there are existing stats for this team & matchday
        if (matchdayId) {
          const playerIds = currentPlayers.map((p) => p.id)
          const { data: statsData, error: sErr } = await supabase
            .from('player_matchday_stats')
            .select('*')
            .in('club_player_id', playerIds)
            .eq('matchday_id', matchdayId)

          if (!sErr && statsData && statsData.length > 0) {
            setHasExistingData(true)
            const statsMap = {}
            statsData.forEach((s) => {
              statsMap[s.club_player_id] = s
            })

            let foundResult = null
            const initial = {}
            currentPlayers.forEach((p) => {
              const existing = statsMap[p.id]
              if (existing) {
                if (existing.match_result) foundResult = existing.match_result
                initial[p.id] = {
                  attended: existing.attended ?? true,
                  points: existing.points ?? 0,
                  goals: existing.goals ?? 0,
                  assists: existing.assists ?? 0,
                  saves: existing.saves ?? 0,
                }
              } else {
                initial[p.id] = { attended: false, points: 0, goals: 0, assists: 0, saves: 0 }
              }
            })

            setRows(initial)

            // If matchResult not in stats column, check activity_log
            if (!foundResult) {
              const { data: logs } = await supabase
                .from('activity_log')
                .select('message')
                .ilike('message', `%[MATCH_RESULT:${teamId}:${matchdayId}:%`)
                .order('created_at', { ascending: false })
                .limit(1)

              if (logs && logs.length > 0) {
                const match = logs[0].message.match(/\[MATCH_RESULT:[^:]+:[^:]+:([^\]]+)\]/)
                if (match) foundResult = match[1]
              }
            }

            if (foundResult) {
              setMatchResult(foundResult)
            }
            return
          }
        }

        // Default initial empty stats
        setHasExistingData(false)
        const initial = {}
        currentPlayers.forEach((p) => {
          initial[p.id] = { attended: true, points: 0, goals: 0, assists: 0, saves: 0 }
        })
        setRows(initial)
      } catch (err) {
        console.error('Error carregant jugadors o estadístiques:', err)
      } finally {
        setLoadingData(false)
      }
    }

    loadPlayersAndStats()
  }, [teamId, matchdayId])

  function updateRow(playerId, field, value) {
    setRows((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [field]: value } }))
  }

  function handleFormSubmit(e) {
    e.preventDefault()
    if (hasExistingData) {
      setShowConfirmModal(true)
    } else {
      executeSubmit()
    }
  }

  async function executeSubmit() {
    setShowConfirmModal(false)
    setStatus(null)
    setSubmitting(true)
    try {
      await verifyPassword(password)

      const payload = players.map((p) => ({
        club_player_id: p.id,
        matchday_id: matchdayId,
        attended: rows[p.id]?.attended ?? false,
        points: rows[p.id]?.attended ? Number(rows[p.id]?.points || 0) : 0,
        goals: rows[p.id]?.attended ? Number(rows[p.id]?.goals || 0) : 0,
        assists: rows[p.id]?.attended ? Number(rows[p.id]?.assists || 0) : 0,
        saves: rows[p.id]?.attended ? Number(rows[p.id]?.saves || 0) : 0,
        entered_by: manager.id,
        match_result: matchResult,
      }))

      let { error } = await supabase
        .from('player_matchday_stats')
        .upsert(payload, { onConflict: 'club_player_id,matchday_id' })

      if (error && (error.message?.includes('match_result') || error.code === '42703')) {
        // Fallback si la columna match_result encara no existeix a Supabase
        const fallbackPayload = payload.map(({ match_result: _mr, ...rest }) => rest)
        const { error: fbError } = await supabase
          .from('player_matchday_stats')
          .upsert(fallbackPayload, { onConflict: 'club_player_id,matchday_id' })
        if (fbError) throw fbError
      } else if (error) {
        throw error
      }

      const resLabel = matchResult === 'win' ? 'Victòria' : matchResult === 'draw' ? 'Empat' : 'Derrota'
      const teamName = teams.find((t) => t.id === teamId)?.name || 'l\'equip'
      const mdObj = matchdays.find((m) => m.id === matchdayId)
      const mdLabel = mdObj?.label || (mdObj?.number ? `Jornada ${mdObj.number}` : '')
      await supabase.from('activity_log').insert({
        manager_id: manager.id,
        type: 'points_added',
        message: `${manager.display_name} ha ${hasExistingData ? 'modificat' : 'pujat'} les puntuacions de ${teamName} (${mdLabel}) (${resLabel}) [MATCH_RESULT:${teamId}:${matchdayId}:${matchResult}]`,
      })

      setHasExistingData(true)
      setStatus({
        type: 'ok',
        msg: hasExistingData
          ? `Puntuacions modificades i actualitzades correctament (${resLabel}).`
          : `Puntuacions desades correctament (${resLabel}).`,
      })
      setPassword('')
    } catch (err) {
      setStatus({ type: 'error', msg: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const selectedMatchdayObj = matchdays.find((m) => m.id === matchdayId)
  const matchdayLabel = selectedMatchdayObj ? (selectedMatchdayObj.label || `Jornada ${selectedMatchdayObj.number}`) : 'aquesta jornada'

  return (
    <>
      <form onSubmit={handleFormSubmit} className="card p-4 sm:p-6 space-y-4 sm:space-y-5">
        <div>
          <h2 className="font-display font-semibold text-lg text-ink">Puntuar l'equip (entrenador)</h2>
          <p className="text-xs sm:text-sm text-ink-dim mt-1">
            Marca qui ha jugat, afegeix la puntuació, els esdeveniments i el resultat del partit.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className="text-xs text-ink-dim mb-1 block">Equip *</label>
            <select
              className="input text-sm min-h-[44px]"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              required
            >
              <option value="" disabled>Selecciona el teu equip…</option>
              {teams.map((t) => t && <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-ink-dim mb-1 block">Jornada *</label>
            <select
              className="input text-sm min-h-[44px]"
              value={matchdayId}
              onChange={(e) => setMatchdayId(e.target.value)}
              required
            >
              <option value="" disabled>Selecciona la jornada…</option>
              {matchdays.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label || `Jornada ${m.number}`}{m.is_extra ? ' ⭐ (Jornada Extra - No puntua)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedMatchdayObj?.is_extra && (
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3 text-xs sm:text-sm text-purple-300 flex items-start gap-2.5">
            <span className="text-base leading-none mt-0.5">⭐</span>
            <div>
              <p className="font-semibold text-purple-200">Jornada Extra</p>
              <p className="text-purple-300/80 mt-0.5">
                Aquesta és una jornada extra. Les puntuacions i estadístiques es guardaran i es mostraran a la fitxa d'equips, però <strong>no sumaran punts per a la classificació general fantasy</strong>.
              </p>
            </div>
          </div>
        )}

        {hasExistingData && !loadingData && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs sm:text-sm text-amber-300 flex items-center justify-between gap-2">
            <span>S'han carregat les dades guardades prèviament per {matchdayLabel}. Pots modificar-les i desar els canvis.</span>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 shrink-0">Ja enviat</span>
          </div>
        )}

        <div>
          <label className="text-xs text-ink-dim mb-1.5 block">Resultat del partit *</label>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setMatchResult('win')}
              className={`py-2 px-3 rounded-xl border text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors min-h-[42px] ${
                matchResult === 'win'
                  ? 'bg-ok/20 border-ok text-ok ring-1 ring-ok'
                  : 'bg-base-surface border-base-border text-ink-dim hover:text-ink'
              }`}
            >
              <span className="text-base">✓</span> Victòria
            </button>
            <button
              type="button"
              onClick={() => setMatchResult('draw')}
              className={`py-2 px-3 rounded-xl border text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors min-h-[42px] ${
                matchResult === 'draw'
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300 ring-1 ring-amber-500'
                  : 'bg-base-surface border-base-border text-ink-dim hover:text-ink'
              }`}
            >
              <span className="text-base">=</span> Empat
            </button>
            <button
              type="button"
              onClick={() => setMatchResult('loss')}
              className={`py-2 px-3 rounded-xl border text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors min-h-[42px] ${
                matchResult === 'loss'
                  ? 'bg-danger/20 border-danger text-danger ring-1 ring-danger'
                  : 'bg-base-surface border-base-border text-ink-dim hover:text-ink'
              }`}
            >
              <span className="text-base">✕</span> Derrota
            </button>
          </div>
        </div>

        {loadingData ? (
          <div className="py-8 text-center text-xs sm:text-sm text-ink-faint">
            Carregant dades dels jugadors…
          </div>
        ) : players.length > 0 && (
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {players.map((p) => {
              const r = rows[p.id] || { attended: false, points: 0, goals: 0, assists: 0, saves: 0 }
              return (
                <div key={p.id} className="bg-base-raised/80 rounded-xl p-3 sm:p-3.5 border border-base-border/60">
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <label className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-ink cursor-pointer">
                      <input
                        type="checkbox"
                        checked={r.attended}
                        onChange={(e) => updateRow(p.id, 'attended', e.target.checked)}
                        className="rounded border-base-border text-accent focus:ring-0 w-4 h-4"
                      />
                      <span>{p.full_name}</span>
                      <span className="text-xs text-ink-faint font-normal">({p.position})</span>
                    </label>
                    {r.attended && (
                      <span className="text-xs sm:text-sm">
                        {'⚽'.repeat(Number(r.goals) || 0)}
                        {'👟'.repeat(Number(r.assists) || 0)}
                        {'🧤'.repeat(Number(r.saves) || 0)}
                      </span>
                    )}
                  </div>

                  {r.attended && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-base-border/40">
                      <div>
                        <label className="text-[11px] text-ink-faint block mb-0.5">Punts</label>
                        <input
                          type="number"
                          step="0.5"
                          className="input py-1.5 text-sm min-h-[38px]"
                          value={r.points}
                          onChange={(e) => updateRow(p.id, 'points', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-ink-faint block mb-0.5">⚽ Gols</label>
                        <input
                          type="number"
                          min="0"
                          className="input py-1.5 text-sm min-h-[38px]"
                          value={r.goals}
                          onChange={(e) => updateRow(p.id, 'goals', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-ink-faint block mb-0.5">👟 Assist.</label>
                        <input
                          type="number"
                          min="0"
                          className="input py-1.5 text-sm min-h-[38px]"
                          value={r.assists}
                          onChange={(e) => updateRow(p.id, 'assists', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-ink-faint block mb-0.5">🧤 Parades</label>
                        <input
                          type="number"
                          min="0"
                          className="input py-1.5 text-sm min-h-[38px]"
                          value={r.saves}
                          onChange={(e) => updateRow(p.id, 'saves', e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <ConfirmPasswordField value={password} onChange={setPassword} />

        <Toast
          message={status?.msg}
          type={status?.type || 'ok'}
          onClose={() => setStatus(null)}
        />

        <button
          type="submit"
          disabled={submitting || players.length === 0 || loadingData}
          className="btn-primary w-full min-h-[44px] text-sm font-semibold"
        >
          {submitting
            ? hasExistingData
              ? 'Actualitzant…'
              : 'Desant…'
            : hasExistingData
            ? 'Actualitzar puntuacions'
            : 'Desar puntuacions'}
        </button>
      </form>

      {/* Confirmation Modal for updating existing matchday data */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="card max-w-md w-full p-5 sm:p-6 space-y-4 border border-base-border shadow-2xl">
            <h3 className="font-display font-semibold text-lg text-ink">Confirmar modificació</h3>
            <p className="text-sm text-ink-dim leading-relaxed">
              Estàs segur que vols modificar les dades de la <strong className="text-accent">{matchdayLabel}</strong>? Les dades guardades anteriorment seran substituïdes per les que has introduït.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="btn-ghost flex-1 py-2 text-sm"
              >
                Cancel·lar
              </button>
              <button
                type="button"
                onClick={executeSubmit}
                disabled={submitting}
                className="btn-primary flex-1 py-2 text-sm font-semibold"
              >
                {submitting ? 'Actualitzant…' : 'Sí, actualitzar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
