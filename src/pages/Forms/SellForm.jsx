import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import ConfirmPasswordField from '../../components/ConfirmPasswordField'
import Toast from '../../components/Toast'

export default function SellForm() {
  const { manager, verifyPassword } = useAuth()

  const [myCards, setMyCards] = useState([])
  const [cardId, setCardId] = useState('')
  const [price, setPrice] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!manager) return
    supabase
      .from('fantasy_cards')
      .select('id, current_price, club_players ( full_name, position )')
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

      const { error } = await supabase.rpc('list_player_for_sale', {
        p_card_id: cardId,
        p_price: Number(price),
      })
      if (error) throw error

      setStatus({ type: 'ok', msg: 'Jugador posat a la venda. Apareixerà al mercat durant 2 dies.' })
      setMyCards((prev) => prev.filter((c) => c.id !== cardId))
      setCardId('')
      setPrice('')
      setPassword('')
    } catch (err) {
      setStatus({ type: 'error', msg: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="font-display font-semibold text-lg text-ink">Vendre un jugador</h2>
        <p className="text-xs sm:text-sm text-ink-dim mt-1">
          El jugador apareixerà al mercat de fitxatges durant 2 dies.
        </p>
      </div>

      <div>
        <label className="text-xs text-ink-dim mb-1 block">Jugador de la teva plantilla *</label>
        <select
          className="input text-sm min-h-[44px]"
          value={cardId}
          onChange={(e) => setCardId(e.target.value)}
          required
        >
          <option value="" disabled>Selecciona…</option>
          {myCards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.club_players?.full_name} ({c.club_players?.position}) — valor actual {c.current_price}M
            </option>
          ))}
        </select>
        {myCards.length === 0 && (
          <p className="text-xs text-ink-faint mt-1">No tens cap jugador disponible per vendre.</p>
        )}
      </div>

      <div>
        <label className="text-xs text-ink-dim mb-1 block">Preu de venda (milions) *</label>
        <input
          type="number"
          min="0.5"
          step="0.5"
          className="input text-sm min-h-[44px]"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
      </div>

      <ConfirmPasswordField value={password} onChange={setPassword} />

      <Toast
        message={status?.msg}
        type={status?.type || 'ok'}
        onClose={() => setStatus(null)}
      />

      <button type="submit" disabled={submitting || !cardId} className="btn-primary w-full min-h-[44px] text-sm font-semibold">
        {submitting ? 'Publicant…' : 'Posar a la venda'}
      </button>
    </form>
  )
}
