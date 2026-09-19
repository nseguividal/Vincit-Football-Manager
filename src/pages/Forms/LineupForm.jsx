import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import ConfirmPasswordField from '../../components/ConfirmPasswordField'

const SLOTS = [
  { key: 'PORTER', label: 'Porter' },
  { key: 'TANCA', label: 'Tanca' },
  { key: 'ALA_1', label: 'Ala 1' },
  { key: 'ALA_2', label: 'Ala 2' },
  { key: 'PIVOT', label: 'Pivot' },
]

export default function LineupForm() {
  const { manager, verifyPassword } = useAuth()

  const [myCards, setMyCards] = useState([])
  const [slot, setSlot] = useState('')
  const [cardId, setCardId] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!manager) return
    supabase
      .from('fantasy_cards')
      .select('id, club_players ( full_name, position )')
      .eq('owner_manager_id', manager.id)
      .eq('status', 'owned')
      .then(({ data }) => setMyCards(data || []))
  }, [manager])

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus(null)
    setSubmitting(true)
    try {
      await verifyPassword(password)

      const { error } = await supabase
        .from('lineup_slots')
        .upsert(
          { manager_id: manager.id, slot, fantasy_card_id: cardId },
          { onConflict: 'manager_id,slot' }
        )
      if (error) throw error

      await supabase.from('activity_log').insert({
        manager_id: manager.id,
        type: 'lineup_change',
        message: `${manager.display_name} ha canviat el titular a la posició ${slot}`,
      })

      setStatus({ type: 'ok', msg: 'Alineació actualitzada correctament.' })
      setPassword('')
    } catch (err) {
      setStatus({ type: 'error', msg: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-4">
      <div>
        <h2 className="font-display font-semibold">Canviar un titular</h2>
        <p className="text-sm text-ink-dim mt-1">
          No perds cap jugador: només tries qui juga aquesta jornada i qui es queda a la banqueta.
        </p>
      </div>

      <div>
        <label className="text-xs text-ink-dim mb-1 block">Posició a la pista</label>
        <select className="input" value={slot} onChange={(e) => setSlot(e.target.value)} required>
          <option value="" disabled>Selecciona la posició…</option>
          {SLOTS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-ink-dim mb-1 block">Jugador que hi poses</label>
        <select className="input" value={cardId} onChange={(e) => setCardId(e.target.value)} required>
          <option value="" disabled>Selecciona un jugador de la teva plantilla…</option>
          {myCards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.club_players?.full_name} ({c.club_players?.position})
            </option>
          ))}
        </select>
      </div>

      <ConfirmPasswordField value={password} onChange={setPassword} />

      {status && (
        <p className={`text-sm ${status.type === 'ok' ? 'text-ok' : 'text-danger'}`}>{status.msg}</p>
      )}

      <button type="submit" disabled={submitting} className="btn-primary w-full">
        {submitting ? 'Desant…' : 'Confirmar canvi'}
      </button>
    </form>
  )
}
