import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Topbar from '../components/Topbar'

export default function Teams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedTeamId = searchParams.get('team')
  const selectedMatchdayId = searchParams.get('matchday')

  const [teams, setTeams] = useState([])
  const [matchdays, setMatchdays] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadFilters() {
      const [{ data: teamsData }, { data: mdData }] = await Promise.all([
        supabase.from('club_teams').select('id, name').order('name'),
        supabase.from('matchdays').select('id, number, label, is_current').order('number'),
      ])
      setTeams(teamsData || [])
      setMatchdays(mdData || [])
      const defaults = {}
      if (!selectedTeamId && teamsData?.length) defaults.team = teamsData[0].id
      if (!selectedMatchdayId && mdData?.length) {
        defaults.matchday = (mdData.find((m) => m.is_current) || mdData[mdData.length - 1]).id
      }
      if (Object.keys(defaults).length) setSearchParams(defaults)
    }
    loadFilters()
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!selectedTeamId || !selectedMatchdayId) return
    setLoading(true)
    supabase
      .from('club_players')
      .select(`
        id, full_name, position,
        player_matchday_stats ( points, goals, assists, saves, attended, matchday_id )
      `)
      .eq('team_id', selectedTeamId)
      .then(({ data }) => {
        const withStats = (data || []).map((p) => ({
          ...p,
          stats: p.player_matchday_stats?.find((s) => s.matchday_id === selectedMatchdayId) || null,
        }))
        withStats.sort((a, b) => (b.stats?.points || 0) - (a.stats?.points || 0))
        setRows(withStats)
        setLoading(false)
      })
  }, [selectedTeamId, selectedMatchdayId])

  return (
    <div>
      <Topbar
        title="Resum d'equips"
        subtitle="Punts de cada jugador del club per jornada"
        right={
          <div className="flex gap-3">
            <select
              className="input w-48"
              value={selectedTeamId || ''}
              onChange={(e) => setSearchParams({ team: e.target.value, matchday: selectedMatchdayId })}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <select
              className="input w-44"
              value={selectedMatchdayId || ''}
              onChange={(e) => setSearchParams({ team: selectedTeamId, matchday: e.target.value })}
            >
              {matchdays.map((m) => (
                <option key={m.id} value={m.id}>{m.label || `Jornada ${m.number}`}</option>
              ))}
            </select>
          </div>
        }
      />

      <div className="p-8">
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ink-faint text-left border-b border-base-border bg-base-raised/40">
                <th className="py-3 px-5 font-normal">Jugador</th>
                <th className="py-3 px-5 font-normal">Posició</th>
                <th className="py-3 px-5 font-normal">Esdeveniments</th>
                <th className="py-3 px-5 font-normal text-right">Punts</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="py-8 text-center text-ink-dim">Carregant…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-ink-dim">Aquest equip no té jugadors registrats.</td></tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id} className="border-b border-base-border/60 last:border-0">
                    <td className="py-3 px-5 font-medium">{p.full_name}</td>
                    <td className="py-3 px-5 text-ink-dim">{p.position}</td>
                    <td className="py-3 px-5">
                      {!p.stats?.attended ? (
                        <span className="text-ink-faint text-xs">No convocat</span>
                      ) : (
                        <span className="text-base">
                          {'⚽'.repeat(p.stats?.goals || 0)}
                          {'👟'.repeat(p.stats?.assists || 0)}
                          {'🧤'.repeat(p.stats?.saves || 0)}
                          {!p.stats?.goals && !p.stats?.assists && !p.stats?.saves && (
                            <span className="text-ink-faint text-xs">—</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-5 text-right font-display font-semibold text-accent">
                      {p.stats?.points ?? 0}
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
