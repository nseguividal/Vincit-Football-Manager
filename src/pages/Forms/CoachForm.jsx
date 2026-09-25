import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { getCurrentMatchday } from '../../lib/matchdayUtils'
import { useAuth } from '../../context/AuthContext'
import Toast from '../../components/Toast'

export default function CoachForm() {
  const { manager, isAdmin } = useAuth()

  const [teams, setTeams] = useState([])
  const [teamId, setTeamId] = useState('')
  const [matchdays, setMatchdays] = useState([])
  const [matchdayId, setMatchdayId] = useState('')
  const [players, setPlayers] = useState([])
  const [rows, setRows] = useState({}) // player_id -> { attended, points, goals, assists, saves, yellow_card, red_card }
  const [matchResult, setMatchResult] = useState('win') // 'win' | 'draw' | 'loss'
  const [goalsFor, setGoalsFor] = useState('')
  const [goalsAgainst, setGoalsAgainst] = useState('')
  const [opponentName, setOpponentName] = useState('')
  const [venue, setVenue] = useState('home') // 'home' | 'away'
  const [hasExistingData, setHasExistingData] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [status, setStatus] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

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
      setGoalsFor('')
      setGoalsAgainst('')
      setOpponentName('')
      setVenue('home')
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
          setGoalsFor('')
          setGoalsAgainst('')
          setOpponentName('')
          setVenue('home')
          return
        }

        // Comprovar si ja hi ha dades per a aquest equip i jornada
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
            let foundScore = null
            let foundOpponent = null
            let foundVenue = 'home'

            const sample = statsData[0]
            if (sample) {
              if (sample.match_result) foundResult = sample.match_result
              if (sample.match_score) foundScore = sample.match_score
              if (sample.opponent_name) foundOpponent = sample.opponent_name
              if (sample.is_home !== undefined && sample.is_home !== null) {
                foundVenue = sample.is_home ? 'home' : 'away'
              }
            }

            const initial = {}
            currentPlayers.forEach((p) => {
              const existing = statsMap[p.id]
              if (existing) {
                if (!foundResult && existing.match_result) foundResult = existing.match_result
                if (!foundScore && existing.match_score) foundScore = existing.match_score
                if (!foundOpponent && existing.opponent_name) foundOpponent = existing.opponent_name
                if (existing.is_home !== undefined && existing.is_home !== null) {
                  foundVenue = existing.is_home ? 'home' : 'away'
                }

                initial[p.id] = {
                  attended: existing.attended ?? true,
                  points: existing.points ?? 0,
                  goals: existing.goals ?? 0,
                  assists: existing.assists ?? 0,
                  saves: existing.saves ?? 0,
                  yellow_card: Boolean((existing.yellow_cards || 0) > 0),
                  red_card: Boolean((existing.red_cards || 0) > 0),
                }
              } else {
                initial[p.id] = {
                  attended: false,
                  points: 0,
                  goals: 0,
                  assists: 0,
                  saves: 0,
                  yellow_card: false,
                  red_card: false,
                }
              }
            })

            setRows(initial)

            // Fallback a activity_log si cal
            if (!foundResult || !foundScore || !foundOpponent) {
              const { data: logs } = await supabase
                .from('activity_log')
                .select('message')
                .ilike('message', `%[MATCH_RESULT:${teamId}:${matchdayId}:%`)
                .order('created_at', { ascending: false })
                .limit(1)

              if (logs && logs.length > 0) {
                const match = logs[0].message.match(/\[MATCH_RESULT:([^:]+):([^:]+):([^:\]]+)(?::([^:\]]*))?(?::([^:\]]*))?(?::([^\]]*))?\]/)
                if (match) {
                  const res = match[3]
                  let score = match[4]
                  let ven = match[5]
                  let opp = match[6]

                  if (score === 'home' || score === 'away') {
                    ven = score
                    score = null
                    opp = match[5]
                  }

                  if (!foundResult && res) foundResult = res
                  if (!foundScore && score && score !== 'home' && score !== 'away') foundScore = score
                  if (ven === 'home' || ven === 'away') foundVenue = ven
                  if (!foundOpponent && opp) {
                    try {
                      opp = decodeURIComponent(opp)
                    } catch {}
                    if (opp && opp !== 'home' && opp !== 'away' && !opp.startsWith('away:') && !opp.startsWith('home:')) {
                      foundOpponent = opp
                    }
                  }
                }
              }
            }

            if (foundResult) setMatchResult(foundResult)
            if (foundOpponent) setOpponentName(foundOpponent)
            setVenue(foundVenue)

            if (foundScore) {
              const [gf, ga] = String(foundScore).split('-')
              if (gf !== undefined) setGoalsFor(gf.trim())
              if (ga !== undefined) setGoalsAgainst(ga.trim())
            } else {
              setGoalsFor('')
              setGoalsAgainst('')
            }
            return
          }
        }

        // Estat buit per defecte
        setHasExistingData(false)
        setGoalsFor('')
        setGoalsAgainst('')
        setOpponentName('')
        setVenue('home')
        const initial = {}
        currentPlayers.forEach((p) => {
          initial[p.id] = {
            attended: true,
            points: 0,
            goals: 0,
            assists: 0,
            saves: 0,
            yellow_card: false,
            red_card: false,
          }
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
    setRows((prev) => {
      const currentRow = prev[playerId] || {}
      const updated = { ...currentRow, [field]: value }
      if (field === 'yellow_card' && value) {
        updated.red_card = false
      } else if (field === 'red_card' && value) {
        updated.yellow_card = false
      }
      return { ...prev, [playerId]: updated }
    })
  }

  function handleFormSubmit(e) {
    e.preventDefault()
    if (hasExistingData) {
      setShowConfirmModal(true)
    } else {
      executeSubmit()
    }
  }

  function handleGoalsChange(newGf, newGa) {
    setGoalsFor(newGf)
    setGoalsAgainst(newGa)
    if (newGf !== '' && newGa !== '') {
      const gf = Number(newGf)
      const ga = Number(newGa)
      if (!isNaN(gf) && !isNaN(ga)) {
        if (gf > ga) setMatchResult('win')
        else if (gf === ga) setMatchResult('draw')
        else setMatchResult('loss')
      }
    }
  }

  async function executeSubmit() {
    setShowConfirmModal(false)
    setStatus(null)
    setSubmitting(true)
    try {
      const scoreStr = (goalsFor !== '' && goalsAgainst !== '') ? `${goalsFor}-${goalsAgainst}` : null
      const oppClean = opponentName.trim()

      const payload = players.map((p) => ({
        club_player_id: p.id,
        matchday_id: matchdayId,
        attended: rows[p.id]?.attended ?? false,
        points: rows[p.id]?.attended ? Number(rows[p.id]?.points || 0) : 0,
        goals: rows[p.id]?.attended ? Number(rows[p.id]?.goals || 0) : 0,
        assists: rows[p.id]?.attended ? Number(rows[p.id]?.assists || 0) : 0,
        saves: rows[p.id]?.attended ? Number(rows[p.id]?.saves || 0) : 0,
        yellow_cards: rows[p.id]?.attended ? (rows[p.id]?.yellow_card ? 1 : 0) : 0,
        red_cards: rows[p.id]?.attended ? (rows[p.id]?.red_card ? 1 : 0) : 0,
        opponent_name: oppClean || null,
        is_home: venue === 'home',
        entered_by: manager.id,
        match_result: matchResult,
        match_score: scoreStr,
      }))

      let rpcOk = false
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('save_matchday_stats', {
          p_team_id: teamId,
          p_matchday_id: matchdayId,
          p_stats: payload,
          p_match_result: matchResult,
          p_match_score: scoreStr,
          p_is_home: venue === 'home',
          p_opponent_name: oppClean || null,
        })
        if (!rpcErr && (!rpcRes || rpcRes.success !== false)) {
          rpcOk = true
        } else if (rpcErr) {
          console.warn('RPC save_matchday_stats fallat, fent fallback:', rpcErr.message)
        }
      } catch (errRpc) {
        console.warn('RPC save_matchday_stats excepció:', errRpc)
      }

      if (!rpcOk) {
        // Fallback: Intentar desar amb totes les columnes
        let { error } = await supabase
          .from('player_matchday_stats')
          .upsert(payload, { onConflict: 'club_player_id,matchday_id' })

        if (error && (error.message?.includes('column') || error.code === '42703' || error.message?.includes('schema cache'))) {
          // Fallback 1: sense opponent_name, is_home, yellow_cards, red_cards
          const fallback1 = payload.map(({ opponent_name: _on, is_home: _ih, yellow_cards: _yc, red_cards: _rc, ...rest }) => rest)
          const { error: err1 } = await supabase
            .from('player_matchday_stats')
            .upsert(fallback1, { onConflict: 'club_player_id,matchday_id' })

          if (err1 && (err1.message?.includes('column') || err1.code === '42703' || err1.message?.includes('schema cache'))) {
            // Fallback 2: només columnes base
            const fallbackBase = payload.map(({ club_player_id, matchday_id, attended, points, goals, assists, saves, entered_by }) => ({
              club_player_id,
              matchday_id,
              attended,
              points,
              goals,
              assists,
              saves,
              entered_by,
            }))
            const { error: errBase } = await supabase
              .from('player_matchday_stats')
              .upsert(fallbackBase, { onConflict: 'club_player_id,matchday_id' })
            if (errBase) throw errBase
          } else if (err1) {
            throw err1
          }
        } else if (error) {
          throw error
        }

        const resLabel = matchResult === 'win' ? 'Victòria' : matchResult === 'draw' ? 'Empat' : 'Derrota'
        const teamName = teams.find((t) => t.id === teamId)?.name || 'l\'equip'
        const mdObj = matchdays.find((m) => m.id === matchdayId)
        const mdLabel = mdObj?.label || (mdObj?.number ? `Jornada ${mdObj.number}` : '')
        const scoreLog = scoreStr ? ` (${goalsFor} - ${goalsAgainst})` : ''
        const oppLog = oppClean ? ` vs ${oppClean}` : ''
        const venueLog = venue === 'home' ? 'Casa' : 'Visitant'
        const encodedOpp = encodeURIComponent(oppClean || '')

        await supabase.from('activity_log').insert({
          manager_id: manager.id,
          type: 'points_added',
          message: `${manager.display_name} ha ${hasExistingData ? 'modificat' : 'pujat'} les puntuacions de ${teamName} (${mdLabel}) (${resLabel}${scoreLog}${oppLog} - ${venueLog}) [MATCH_RESULT:${teamId}:${matchdayId}:${matchResult}:${scoreStr || ''}:${venue}:${encodedOpp}]`,
        })
      }

      const resLabel = matchResult === 'win' ? 'Victòria' : matchResult === 'draw' ? 'Empat' : 'Derrota'
      const scoreLog = scoreStr ? ` (${goalsFor} - ${goalsAgainst})` : ''

      setHasExistingData(true)
      setStatus({
        type: 'ok',
        msg: hasExistingData
          ? `Puntuacions modificades i actualitzades correctament (${resLabel}${scoreLog}).`
          : `Puntuacions desades correctament (${resLabel}${scoreLog}).`,
      })
    } catch (err) {
      console.error(err)
      setStatus({ type: 'error', msg: err.message || 'Error desant les puntuacions.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function executeDelete() {
    setShowDeleteConfirmModal(false)
    setStatus(null)
    setDeleting(true)
    try {
      const playerIds = players.map((p) => p.id)
      if (playerIds.length === 0 || !matchdayId) {
        throw new Error('No hi ha jugadors seleccionats o jornada invàlida.')
      }

      const teamName = teams.find((t) => t.id === teamId)?.name || 'l\'equip'
      const mdObj = matchdays.find((m) => m.id === matchdayId)
      const mdLabel = mdObj?.label || (mdObj?.number ? `Jornada ${mdObj.number}` : '')

      // 1. Provar d'eliminar mitjançant la funció RPC
      let rpcSuccess = false
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('delete_matchday_stats', {
          p_team_id: teamId,
          p_matchday_id: matchdayId,
        })
        if (!rpcErr && (!rpcData || rpcData.success !== false)) {
          rpcSuccess = true
        }
      } catch (e) {
        console.warn('RPC delete_matchday_stats no disponible:', e)
      }

      // 2. Si l'RPC no s'ha executat, fer eliminació directa
      if (!rpcSuccess) {
        const { error: delErr } = await supabase
          .from('player_matchday_stats')
          .delete()
          .eq('matchday_id', matchdayId)
          .in('club_player_id', playerIds)

        if (delErr) throw delErr

        // Netejar possibles activity_logs residuals de MATCH_RESULT
        try {
          await supabase
            .from('activity_log')
            .delete()
            .ilike('message', `%[MATCH_RESULT:${teamId}:${matchdayId}:%`)
        } catch {}

        try {
          await supabase.from('activity_log').insert({
            manager_id: manager.id,
            type: 'points_added',
            message: `${manager.display_name} ha eliminat el registre de puntuacions de ${teamName} (${mdLabel})`,
          })
        } catch {}
      }

      // Reiniciar formulari a l'estat buit
      setHasExistingData(false)
      setGoalsFor('')
      setGoalsAgainst('')
      setOpponentName('')
      setVenue('home')
      setMatchResult('win')
      const initial = {}
      players.forEach((p) => {
        initial[p.id] = {
          attended: true,
          points: 0,
          goals: 0,
          assists: 0,
          saves: 0,
          yellow_card: false,
          red_card: false,
        }
      })
      setRows(initial)

      setStatus({
        type: 'ok',
        msg: `S'ha eliminat completament el registre de la ${mdLabel} per a ${teamName}.`,
      })
    } catch (err) {
      console.error('Error eliminant dades de la jornada:', err)
      setStatus({ type: 'error', msg: err.message || 'Error eliminant les puntuacions de la jornada.' })
    } finally {
      setDeleting(false)
    }
  }

  const selectedMatchdayObj = matchdays.find((m) => m.id === matchdayId)
  const matchdayLabel = selectedMatchdayObj?.label || (selectedMatchdayObj?.number ? `Jornada ${selectedMatchdayObj.number}` : 'aquesta jornada')

  return (
    <>
      <form onSubmit={handleFormSubmit} className="card p-5 sm:p-7 space-y-6">
        <div>
          <h2 className="font-display font-semibold text-lg text-ink">Afegir puntuacions del partit</h2>
          <p className="text-xs text-ink-dim mt-0.5">
            Introdueix l'assistència, puntuacions, targetes i resultat del partit per al teu equip.
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
                Aquesta és una jornada extra. Les puntuacions i estadístiques es guardaran i es mostraran, però <strong>no sumaran punts per a la classificació general fantasy</strong>.
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

        {/* Detalls del partit: Rival, Local/Visitant i Marcador */}
        <div className="p-4 rounded-xl bg-base-surface border border-base-border space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-ink block">Informació del Partit</label>
            <span className="text-[11px] text-ink-dim">Rival, seu i marcador</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="text-xs text-ink-dim mb-1 block">Nom de l'equip Rival</label>
              <input
                type="text"
                placeholder="Ex: CFS Ripollet, CE Sagarra..."
                className="input text-sm min-h-[42px]"
                value={opponentName}
                onChange={(e) => setOpponentName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-ink-dim mb-1 block">On s'ha jugat el partit? *</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVenue('home')}
                  className={`py-2 px-3 rounded-lg border text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors min-h-[42px] ${
                    venue === 'home'
                      ? 'bg-accent/20 border-accent text-white font-bold ring-1 ring-accent'
                      : 'bg-base-raised border-base-border text-ink-dim hover:text-ink'
                  }`}
                >
                  <span>🏠</span> Local
                </button>
                <button
                  type="button"
                  onClick={() => setVenue('away')}
                  className={`py-2 px-3 rounded-lg border text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors min-h-[42px] ${
                    venue === 'away'
                      ? 'bg-accent/20 border-accent text-white font-bold ring-1 ring-accent'
                      : 'bg-base-raised border-base-border text-ink-dim hover:text-ink'
                  }`}
                >
                  <span>✈️</span> Visitant
                </button>
              </div>
            </div>
          </div>

          {/* Marcador del partit */}
          <div className="pt-2 border-t border-base-border/50">
            {venue === 'home' ? (
              <div className="flex items-center gap-3">
                {/* Vincit (Local - Esquerra) */}
                <div className="flex-1">
                  <label className="text-[11px] text-ink-dim mb-1 block font-medium">
                    Gols Vincit (Local)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    className="input text-center font-display font-bold text-base text-yellow-400"
                    style={{ color: '#FACC15' }}
                    value={goalsFor}
                    onChange={(e) => handleGoalsChange(e.target.value, goalsAgainst)}
                  />
                </div>
                <span className="text-lg font-bold text-ink-dim pt-4">-</span>
                {/* Rival (Visitant - Dreta) */}
                <div className="flex-1">
                  <label className="text-[11px] text-ink-dim mb-1 block font-medium">
                    Gols {opponentName.trim() || 'Rival'} (Visitant)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    className="input text-center font-display font-bold text-base text-white"
                    value={goalsAgainst}
                    onChange={(e) => handleGoalsChange(goalsFor, e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {/* Rival (Local - Esquerra) */}
                <div className="flex-1">
                  <label className="text-[11px] text-ink-dim mb-1 block font-medium">
                    Gols {opponentName.trim() || 'Rival'} (Local)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    className="input text-center font-display font-bold text-base text-white"
                    value={goalsAgainst}
                    onChange={(e) => handleGoalsChange(goalsFor, e.target.value)}
                  />
                </div>
                <span className="text-lg font-bold text-ink-dim pt-4">-</span>
                {/* Vincit (Visitant - Dreta) */}
                <div className="flex-1">
                  <label className="text-[11px] text-ink-dim mb-1 block font-medium">
                    Gols Vincit (Visitant)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    className="input text-center font-display font-bold text-base text-yellow-400"
                    style={{ color: '#FACC15' }}
                    value={goalsFor}
                    onChange={(e) => handleGoalsChange(e.target.value, goalsAgainst)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

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
          <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
            {players.map((p) => {
              const r = rows[p.id] || {
                attended: false,
                points: 0,
                goals: 0,
                assists: 0,
                saves: 0,
                yellow_card: false,
                red_card: false,
              }
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
                      <span className="font-semibold">{p.full_name}</span>
                      <span className="text-xs text-ink-faint font-normal">({p.position})</span>
                    </label>
                    {r.attended && (
                      <span className="text-xs sm:text-sm flex items-center gap-1">
                        {'⚽'.repeat(Number(r.goals) || 0)}
                        {'👟'.repeat(Number(r.assists) || 0)}
                        {'🧤'.repeat(Number(r.saves) || 0)}
                        {r.yellow_card && <span>🟨</span>}
                        {r.red_card && <span>🟥</span>}
                      </span>
                    )}
                  </div>

                  {r.attended && (
                    <div className="space-y-2 pt-1.5 border-t border-base-border/40">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="text-[11px] text-ink-faint block mb-0.5 font-medium">Punts</label>
                          <input
                            type="number"
                            step="0.5"
                            className="input py-1.5 text-sm min-h-[38px] font-bold text-yellow-400"
                            style={{ color: '#FACC15' }}
                            value={r.points}
                            onChange={(e) => updateRow(p.id, 'points', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-ink-faint block mb-0.5 font-medium">⚽ Gols</label>
                          <input
                            type="number"
                            min="0"
                            className="input py-1.5 text-sm min-h-[38px]"
                            value={r.goals}
                            onChange={(e) => updateRow(p.id, 'goals', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-ink-faint block mb-0.5 font-medium">👟 Assist.</label>
                          <input
                            type="number"
                            min="0"
                            className="input py-1.5 text-sm min-h-[38px]"
                            value={r.assists}
                            onChange={(e) => updateRow(p.id, 'assists', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-ink-faint block mb-0.5 font-medium">🧤 Parades</label>
                          <input
                            type="number"
                            min="0"
                            className="input py-1.5 text-sm min-h-[38px]"
                            value={r.saves}
                            onChange={(e) => updateRow(p.id, 'saves', e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Caselles de Targeta Groga i Vermella */}
                      <div className="flex items-center gap-4 pt-1">
                        <label className="flex items-center gap-1.5 text-xs text-ink-dim cursor-pointer hover:text-ink">
                          <input
                            type="checkbox"
                            checked={r.yellow_card || false}
                            onChange={(e) => updateRow(p.id, 'yellow_card', e.target.checked)}
                            className="rounded border-base-border text-amber-400 focus:ring-0 w-3.5 h-3.5"
                          />
                          <span>🟨 Targeta groga</span>
                        </label>

                        <label className="flex items-center gap-1.5 text-xs text-ink-dim cursor-pointer hover:text-ink">
                          <input
                            type="checkbox"
                            checked={r.red_card || false}
                            onChange={(e) => updateRow(p.id, 'red_card', e.target.checked)}
                            className="rounded border-base-border text-red-500 focus:ring-0 w-3.5 h-3.5"
                          />
                          <span>🟥 Targeta vermella</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <Toast
          message={status?.msg}
          type={status?.type || 'ok'}
          onClose={() => setStatus(null)}
        />

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          {hasExistingData && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirmModal(true)}
              disabled={submitting || deleting || loadingData}
              className="px-4 py-2.5 rounded-xl border border-danger/40 bg-danger/10 hover:bg-danger/20 text-danger text-sm font-semibold transition-all flex items-center justify-center gap-1.5 sm:w-auto"
            >
              <span>🗑️</span>
              <span>Eliminar registre</span>
            </button>
          )}

          <button
            type="submit"
            disabled={submitting || deleting || players.length === 0 || loadingData}
            className="btn-primary flex-1 min-h-[44px] text-sm font-semibold"
          >
            {submitting
              ? hasExistingData
                ? 'Actualitzant…'
                : 'Desant…'
              : hasExistingData
              ? 'Actualitzar puntuacions'
              : 'Desar puntuacions'}
          </button>
        </div>
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
                disabled={submitting}
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

      {/* Confirmation Modal for deleting existing matchday data (Doble pas) */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="card max-w-md w-full p-5 sm:p-6 space-y-4 border border-danger/40 shadow-2xl bg-base-surface">
            <div className="flex items-center gap-3 text-danger">
              <div className="w-10 h-10 rounded-full bg-danger/15 flex items-center justify-center text-xl shrink-0">
                ⚠️
              </div>
              <h3 className="font-display font-semibold text-lg text-ink">Eliminar registre de la jornada</h3>
            </div>
            <p className="text-sm text-ink-dim leading-relaxed">
              Estàs segur que vols eliminar completament el registre de la <strong className="text-accent">{matchdayLabel}</strong> per a <strong className="text-ink">{teams.find((t) => t.id === teamId)?.name || 'aquest equip'}</strong>?
            </p>
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl text-xs text-danger leading-relaxed">
              Aquesta acció esborrarà totes les puntuacions, assistències, targetes i resultat guardats per a aquesta jornada.
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirmModal(false)}
                disabled={deleting}
                className="btn-ghost flex-1 py-2 text-sm"
              >
                Cancel·lar
              </button>
              <button
                type="button"
                onClick={executeDelete}
                disabled={deleting}
                className="bg-danger hover:bg-danger/90 text-white font-semibold rounded-xl px-4 py-2 text-sm transition-all flex-1"
              >
                {deleting ? 'Eliminant…' : 'Sí, eliminar registre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
