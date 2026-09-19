import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import ConfirmPasswordField from '../../components/ConfirmPasswordField'

export default function CoachForm() {
  const { manager, isAdmin, verifyPassword } = useAuth()

  const [teams, setTeams] = useState([])
  const [teamId, setTeamId] = useState('')
  const [matchdays, setMatchdays] = useState([])
  const [matchdayId, setMatchdayId] = useState('')
  const [players, setPlayers] = useState([])
  const [rows, setRows] = useState({}) // player_id -> { attended, points, goals, assists, saves }
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
    supabase.from('matchdays').select('id, number, label').order('number').then(({ data }) => setMatchdays(data || []))
  }, [manager, isAdmin])

  useEffect(() => {
    if (!teamId) { setPlayers([]); return }
    supabase
      .from('club_players')
      .select('id, full_name, position')
      .eq('team_id', teamId)
      .eq('active', true)
      .order('full_name')
      .then(({ data }) => {
        setPlayers(data || [])
        const initial = {}
        ;(data || []).forEach((p) => {
          initial[p.id] = { attended: true, points: 0, goals: 0, assists: 0, saves: 0 }
        })
        setRows(initial)
      })
  }, [teamId])

  function updateRow(playerId, field, value) {
    setRows((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [field]: value } }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus(null)
    setSubmitting(true)
    try {
      await verifyPassword(password)

      const payload = players.map((p) => ({
        club_player_id: p.id,
        matchday_id: matchdayId,
        attended: rows[p.id].attended,
        points: rows[p.id].attended ? Number(rows[p.id].points) : 0,
        goals: rows[p.id].attended ? Number(rows[p.id].goals) : 0,
        assists: rows[p.id].attended ? Number(rows[p.id].assists) : 0,
        saves: rows[p.id].attended ? Number(rows[p.id].saves) : 0,
        entered_by: manager.id,
      }))

      const { error } = await supabase
        .from('player_matchday_stats')
        .upsert(payload, { onConflict: 'club_player_id,matchday_id' })
      if (error) throw error

      await supabase.from('activity_log').insert({
        manager_id: manager.id,
        type: 'points_added',
        message: `${manager.display_name} ha pujat les puntuacions de l'equip seleccionat`,
      })

      setStatus({ type: 'ok', msg: 'Puntuacions desades correctament.' })
      setPassword('')
    } catch (err) {
      setStatus({ type: 'error', msg: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-5">
      <div>
        <h2 className="font-display font-semibold">Puntuar l'equip (entrenador)</h2>
        <p className="text-sm text-ink-dim mt-1">
          Marca qui ha jugat, afegeix la puntuació i els esdeveniments del partit.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-ink-dim mb-1 block">Equip</label>
          <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
            <option value="" disabled>Selecciona el teu equip…</option>
            {teams.map((t) => t && <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-ink-dim mb-1 block">Jornada</label>
          <select className="input" value={matchdayId} onChange={(e) => setMatchdayId(e.target.value)} required>
            <option value="" disabled>Selecciona la jornada…</option>
            {matchdays.map((m) => (
              <option key={m.id} value={m.id}>{m.label || `Jornada ${m.number}`}</option>
            ))}
          </select>
        </div>
      </div>

      {players.length > 0 && (
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {players.map((p) => {
            const r = rows[p.id]
            return (
              <div key={p.id} className="bg-base-raised rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={r.attended}
                      onChange={(e) => updateRow(p.id, 'attended', e.target.checked)}
                    />
                    {p.full_name}
                    <span className="text-xs text-ink-faint font-normal">({p.position})</span>
                  </label>
                  {r.attended && (
                    <span className="text-sm">
                      {'⚽'.repeat(Number(r.goals) || 0)}
                      {'👟'.repeat(Number(r.assists) || 0)}
                      {'🧤'.repeat(Number(r.saves) || 0)}
                    </span>
                  )}
                </div>

                {r.attended && (
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-[11px] text-ink-faint block mb-0.5">Punts</label>
                      <input type="number" step="0.5" className="input py-1.5 text-sm"
                        value={r.points} onChange={(e) => updateRow(p.id, 'points', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[11px] text-ink-faint block mb-0.5">⚽ Gols</label>
                      <input type="number" min="0" className="input py-1.5 text-sm"
                        value={r.goals} onChange={(e) => updateRow(p.id, 'goals', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[11px] text-ink-faint block mb-0.5">👟 Assist.</label>
                      <input type="number" min="0" className="input py-1.5 text-sm"
                        value={r.assists} onChange={(e) => updateRow(p.id, 'assists', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[11px] text-ink-faint block mb-0.5">🧤 Parades</label>
                      <input type="number" min="0" className="input py-1.5 text-sm"
                        value={r.saves} onChange={(e) => updateRow(p.id, 'saves', e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmPasswordField value={password} onChange={setPassword} />

      {status && (
        <p className={`text-sm ${status.type === 'ok' ? 'text-ok' : 'text-danger'}`}>{status.msg}</p>
      )}

      <button type="submit" disabled={submitting || players.length === 0} className="btn-primary w-full">
        {submitting ? 'Desant…' : 'Desar puntuacions'}
      </button>
    </form>
  )
}
