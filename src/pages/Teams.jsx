import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { getCurrentMatchday } from '../lib/matchdayUtils'
import Topbar from '../components/Topbar'

function FormBoxes({ player, matchdays, teamId, logResults }) {
  const padded = useMemo(() => {
    const slots = []
    for (let i = 0; i < 5; i++) {
      const md = matchdays[i]
      if (!md) {
        slots.push({ key: `empty-${i}`, empty: true })
      } else {
        const stat = player.allStats?.find((s) => s.matchday_id === md.id)
        const directResult = stat?.match_result
        const logResult = logResults?.[`${teamId}_${md.id}`]
        const result = directResult || logResult
        slots.push({
          key: md.id,
          label: md.label || `Jornada ${md.number}`,
          stat,
          result,
        })
      }
    }
    return slots
  }, [player, matchdays, teamId, logResults])

  return (
    <div className="flex items-center gap-0.5 sm:gap-1">
      {padded.map((item) => {
        if (item.empty) {
          return (
            <span
              key={item.key}
              className="w-3.5 h-3.5 sm:w-5 sm:h-5 rounded sm:rounded-md bg-base-raised/30 border border-base-border/30 text-ink-faint flex items-center justify-center text-[8px] sm:text-[10px] select-none"
            >
              ·
            </span>
          )
        }

        const { stat, label, result } = item
        if (!stat || !stat.attended) {
          return (
            <span
              key={item.key}
              className="w-3.5 h-3.5 sm:w-5 sm:h-5 rounded sm:rounded-md bg-base-raised text-ink-dim border border-base-border flex items-center justify-center text-[8px] sm:text-[10px] font-bold select-none"
              title={`${label}: No convocat / No jugat`}
            >
              —
            </span>
          )
        }

        if (result === 'win') {
          return (
            <span
              key={item.key}
              className="w-3.5 h-3.5 sm:w-5 sm:h-5 rounded sm:rounded-md bg-ok/20 text-ok border border-ok/40 flex items-center justify-center text-[8px] sm:text-[11px] font-bold select-none shadow-sm"
              title={`${label}: Victòria (${stat.points} pts)`}
            >
              ✓
            </span>
          )
        }

        if (result === 'loss') {
          return (
            <span
              key={item.key}
              className="w-3.5 h-3.5 sm:w-5 sm:h-5 rounded sm:rounded-md bg-danger/20 text-danger border border-danger/40 flex items-center justify-center text-[8px] sm:text-[11px] font-bold select-none shadow-sm"
              title={`${label}: Derrota (${stat.points} pts)`}
            >
              ✕
            </span>
          )
        }

        if (result === 'draw') {
          return (
            <span
              key={item.key}
              className="w-3.5 h-3.5 sm:w-5 sm:h-5 rounded sm:rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center text-[8px] sm:text-[11px] font-bold select-none shadow-sm"
              title={`${label}: Empat (${stat.points} pts)`}
            >
              =
            </span>
          )
        }

        // Si encara no hi ha resultat de partit registrat
        return (
          <span
            key={item.key}
            className="w-3.5 h-3.5 sm:w-5 sm:h-5 rounded sm:rounded-md bg-base-raised text-ink-dim border border-base-border flex items-center justify-center text-[8px] sm:text-[10px] font-bold select-none"
            title={`${label}: Jugat (${stat.points} pts)`}
          >
            —
          </span>
        )
      })}
    </div>
  )
}

export default function Teams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedTeamId = searchParams.get('team')
  const selectedMatchdayId = searchParams.get('matchday')

  const [teams, setTeams] = useState([])
  const [matchdays, setMatchdays] = useState([])
  const [logResults, setLogResults] = useState({})
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadFilters() {
      const [{ data: teamsData }, { data: mdData }, { data: logData }] = await Promise.all([
        supabase.from('club_teams').select('id, name').order('name'),
        supabase.from('matchdays').select('id, number, label, starts_at, ends_at, is_extra').order('number'),
        supabase.from('activity_log').select('message, created_at').eq('type', 'points_added').order('created_at', { ascending: true }),
      ])
      setTeams(teamsData || [])
      setMatchdays(mdData || [])

      const resMap = {}
      ;(logData || []).forEach((entry) => {
        const match = entry.message?.match(/\[MATCH_RESULT:([^:]+):([^:]+):([^\]]+)\]/)
        if (match) {
          const [, tId, mdId, res] = match
          resMap[`${tId}_${mdId}`] = res
        }
      })
      setLogResults(resMap)

      const defaults = {}
      if (!selectedTeamId && teamsData?.length) defaults.team = teamsData[0].id
      if (!selectedMatchdayId && mdData?.length) {
        const autoMd = getCurrentMatchday(mdData)
        defaults.matchday = (autoMd || mdData[mdData.length - 1]).id
      }
      if (Object.keys(defaults).length) setSearchParams(defaults)
    }
    loadFilters()
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!selectedTeamId) return
    setLoading(true)

    function processData(playerData) {
      const withStats = playerData.map((p) => ({
        ...p,
        stats: p.player_matchday_stats?.find((s) => s.matchday_id === selectedMatchdayId) || null,
        allStats: p.player_matchday_stats || [],
      }))
      withStats.sort((a, b) => (b.stats?.points || 0) - (a.stats?.points || 0))
      setRows(withStats)
      setLoading(false)
    }

    supabase
      .from('club_players')
      .select(`
        id, full_name, position,
        player_matchday_stats ( id, points, goals, assists, saves, attended, matchday_id, match_result )
      `)
      .eq('team_id', selectedTeamId)
      .then(({ data, error }) => {
        if (error) {
          // Fallback si la columna match_result no existeix a Supabase
          supabase
            .from('club_players')
            .select(`
              id, full_name, position,
              player_matchday_stats ( id, points, goals, assists, saves, attended, matchday_id )
            `)
            .eq('team_id', selectedTeamId)
            .then(({ data: fbData }) => {
              processData(fbData || [])
            })
          return
        }
        processData(data || [])
      })
  }, [selectedTeamId, selectedMatchdayId])

  const last5Matchdays = useMemo(() => {
    if (!matchdays.length) return []
    const sorted = [...matchdays].sort((a, b) => a.number - b.number)
    const currIdx = sorted.findIndex((m) => m.id === selectedMatchdayId)
    if (currIdx >= 0) {
      const start = Math.max(0, currIdx - 4)
      return sorted.slice(start, currIdx + 1)
    }
    return sorted.slice(-5)
  }, [matchdays, selectedMatchdayId])

  return (
    <div>
      <Topbar
        title="Resum d'equips"
        subtitle="Punts i estadístiques de cada jugador del club per jornada"
      />

      <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
        {/* Selector d'equip i jornada a sobre del llistat */}
        <div className="card p-4 sm:p-5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full lg:w-auto">
            <div className="w-full sm:w-60">
              <label className="text-xs text-ink-dim mb-1 block font-medium">Equip del club</label>
              <select
                className="input w-full text-sm min-h-[42px]"
                value={selectedTeamId || ''}
                onChange={(e) => setSearchParams({ team: e.target.value, matchday: selectedMatchdayId })}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="w-full sm:w-56">
              <label className="text-xs text-ink-dim mb-1 block font-medium">Jornada</label>
              <select
                className="input w-full text-sm min-h-[42px]"
                value={selectedMatchdayId || ''}
                onChange={(e) => setSearchParams({ team: selectedTeamId, matchday: e.target.value })}
              >
                {matchdays.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label || `Jornada ${m.number}`}{m.is_extra ? ' ⭐ (Extra)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-[11px] sm:text-xs text-ink-dim flex items-center gap-2 sm:gap-3 flex-wrap pt-3 lg:pt-0 border-t lg:border-t-0 border-base-border">
            <span className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded bg-ok/20 text-ok border border-ok/40 inline-flex items-center justify-center text-[9px] sm:text-[10px] font-bold">✓</span> Victòria
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-flex items-center justify-center text-[9px] sm:text-[10px] font-bold">=</span> Empat
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded bg-danger/20 text-danger border border-danger/40 inline-flex items-center justify-center text-[9px] sm:text-[10px] font-bold">✕</span> Derrota
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded bg-base-raised text-ink-dim border border-base-border inline-flex items-center justify-center text-[9px] sm:text-[10px] font-bold">—</span> No conv.
            </span>
          </div>
        </div>

        {matchdays.find((m) => m.id === selectedMatchdayId)?.is_extra && (
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3 text-xs sm:text-sm text-purple-300 flex items-center gap-2">
            <span>⭐</span>
            <span><strong>Jornada Extra:</strong> Els punts d'aquesta jornada es mostren com a resum de l'equip, però <strong>no sumen per a la classificació general fantasy</strong>.</span>
          </div>
        )}

        {/* Taula de jugadors i punts */}
        <div className="card overflow-hidden">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="text-ink-faint text-left border-b border-base-border bg-base-raised/40">
                <th className="py-3 px-3 sm:px-5 font-normal">Jugador</th>
                <th className="hidden sm:table-cell py-3 px-3 sm:px-5 font-normal">Posició</th>
                <th className="py-3 px-2 sm:px-4 font-normal">Últims 5</th>
                <th className="py-3 px-3 sm:px-5 font-normal text-right">Punts</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="py-8 text-center text-ink-dim">Carregant…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-ink-dim">Aquest equip no té jugadors registrats.</td></tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id} className="border-b border-base-border/60 last:border-0 hover:bg-base-surface/40">
                    <td className="py-3 px-3 sm:px-5 font-medium text-ink">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-ink text-xs sm:text-sm">{p.full_name}</span>
                        <span className="sm:hidden text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-base-raised text-ink-dim">
                          {p.position}
                        </span>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell py-3 px-3 sm:px-5 text-ink-dim font-medium">{p.position}</td>
                    <td className="py-3 px-2 sm:px-4">
                      <FormBoxes
                        player={p}
                        matchdays={last5Matchdays}
                        teamId={selectedTeamId}
                        logResults={logResults}
                      />
                    </td>
                    <td className="py-3 px-3 sm:px-5 text-right font-display font-bold">
                      {!p.stats ? (
                        <span className="text-ink-faint font-normal text-xs sm:text-sm select-none">—</span>
                      ) : !p.stats.attended ? (
                        <span className="text-ink-faint font-normal text-xs sm:text-sm">No conv.</span>
                      ) : (
                        <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                          <span className="text-yellow-400 text-base sm:text-lg">
                            {p.stats.points ?? 0}
                          </span>
                          {(p.stats.goals > 0 || p.stats.assists > 0 || p.stats.saves > 0) && (
                            <span className="text-xs sm:text-sm font-normal text-ink leading-none">
                              {'⚽'.repeat(p.stats.goals || 0)}
                              {'👟'.repeat(p.stats.assists || 0)}
                              {'🧤'.repeat(p.stats.saves || 0)}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
