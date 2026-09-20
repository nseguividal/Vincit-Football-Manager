import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import ConfirmPasswordField from '../../components/ConfirmPasswordField'
import Toast from '../../components/Toast'

export default function OfferForm() {
  const { manager, verifyPassword } = useAuth()
  const [searchParams] = useSearchParams()

  const [listings, setListings] = useState([])
  const [cardId, setCardId] = useState(searchParams.get('card') || '')
  const [amount, setAmount] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState(null) // { type: 'ok'|'error', msg }
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    supabase
      .from('fantasy_cards')
      .select('id, current_price, club_players ( full_name, position )')
      .eq('status', 'market')
      .then(({ data }) => setListings(data || []))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus(null)
    setSubmitting(true)
    try {
      await verifyPassword(password)

      const { error } = await supabase.from('transfer_offers').insert({
        fantasy_card_id: cardId,
        bidder_manager_id: manager.id,
        amount: Number(amount),
      })
      if (error) throw error

      setStatus({ type: 'ok', msg: 'Oferta enviada! L\'administrador la resoldrà en tancar el mercat.' })
      setAmount('')
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
        <h2 className="font-display font-semibold text-lg text-ink">Fer una oferta</h2>
        <p className="text-xs sm:text-sm text-ink-dim mt-1">
          Tria un jugador del mercat i indica quants milions vols oferir.
        </p>
      </div>

      <div>
        <label className="text-xs text-ink-dim mb-1 block">Jugador *</label>
        <select
          className="input text-sm min-h-[44px]"
          value={cardId}
          onChange={(e) => setCardId(e.target.value)}
          required
        >
          <option value="" disabled>Selecciona un jugador del mercat…</option>
          {listings.map((c) => (
            <option key={c.id} value={c.id}>
              {c.club_players?.full_name} ({c.club_players?.position}) — sortida {c.current_price}M
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-ink-dim mb-1 block">La teva oferta (milions) *</label>
        <input
          type="number"
          min="0.5"
          step="0.5"
          className="input text-sm min-h-[44px]"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>

      <ConfirmPasswordField value={password} onChange={setPassword} />

      <Toast
        message={status?.msg}
        type={status?.type || 'ok'}
        onClose={() => setStatus(null)}
      />

      <button type="submit" disabled={submitting} className="btn-primary w-full min-h-[44px] text-sm font-semibold">
        {submitting ? 'Enviant…' : 'Enviar oferta'}
      </button>
    </form>
  )
}
