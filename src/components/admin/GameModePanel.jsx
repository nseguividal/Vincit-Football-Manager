import { useEffect, useState } from 'react'
import { fetchGameSettings, saveGameSettings, DEFAULT_GAME_SETTINGS } from '../../lib/settingsUtils'
import Toast from '../Toast'

function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation()
        setOpen((prev) => !prev)
      }}
    >
      <button
        type="button"
        title="Més informació"
        className="w-4 h-4 rounded-full bg-white/10 hover:bg-accent/20 text-white/70 hover:text-accent text-[11px] font-bold flex items-center justify-center transition-colors cursor-help border border-white/20"
      >
        i
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 sm:w-72 p-2.5 rounded-xl bg-[#0F172A] border border-accent/40 text-xs text-ink-dim shadow-2xl backdrop-blur-md animate-fade-in pointer-events-none"
        >
          <div className="text-[11px] text-white/90 leading-relaxed">{text}</div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#0F172A]" />
        </div>
      )}
    </div>
  )
}

export default function GameModePanel() {
  const [settings, setSettings] = useState(DEFAULT_GAME_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState({ msg: '', type: 'ok' })

  async function loadSettings() {
    setLoading(true)
    try {
      const fetchedSettings = await fetchGameSettings()
      if (fetchedSettings) {
        setSettings(fetchedSettings)
      }
    } catch (err) {
      console.error('Error carregant configuració del mode de joc:', err)
      setToast({ msg: 'Error carregant configuració', type: 'err' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  async function handleToggleSetting(key, val) {
    const updated = { ...settings, [key]: val }
    setSettings(updated)
    setSaving(true)
    try {
      await saveGameSettings(updated)
      setToast({ msg: 'Mode de joc actualitzat correctament!', type: 'ok' })
    } catch (err) {
      console.error('Error desant configuració:', err)
      setToast({ msg: err.message || 'Error guardant canvis', type: 'err' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="card p-8 text-center text-ink-dim">
        <p className="animate-pulse text-sm">Carregant configuració del mode de joc…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------------- */}
      {/* SECCIÓ 1: MODE DE MERCAT I FITXATGES                                */}
      {/* ------------------------------------------------------------------- */}
      <div className="card p-4 sm:p-5 space-y-3 border border-base-border">
        <div className="flex items-center justify-between border-b border-base-border/70 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-lg">🏷️</span>
            <h3 className="font-display font-bold text-sm sm:text-base text-yellow-400" style={{ color: '#FACC15' }}>
              Mode de Mercat i Fitxatges
            </h3>
            <InfoTooltip text="Defineix si els mànagers poden comprar i vendre jugadors lliurement entre ells o si únicament l'administrador publica jugadors a subhasta." />
          </div>
          {saving && <span className="text-xs text-accent animate-pulse font-medium">Desant canvis…</span>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Opció A: Mercat actiu */}
          <div
            onClick={() => handleToggleSetting('market_mode', 'active')}
            className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-2 ${
              settings.market_mode === 'active'
                ? 'bg-accent/15 border-accent shadow-sm'
                : 'bg-base-surface border-base-border/70 hover:border-base-border hover:bg-base-raised/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🔄</span>
                <span className="font-display font-bold text-sm text-white">
                  Mercat actiu
                </span>
                <InfoTooltip text="Els mànagers poden posar a la venda els seus jugadors, rebre ofertes directes, fer contraofertes i traspassar fitxes en qualsevol moment." />
              </div>
              <span
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                  settings.market_mode === 'active'
                    ? 'border-accent bg-accent text-[#0B1220]'
                    : 'border-base-border bg-base-raised'
                }`}
              >
                {settings.market_mode === 'active' && '✓'}
              </span>
            </div>
            <p className="text-[11px] text-ink-dim">
              Vendes lliures i negociacions directes entre usuaris.
            </p>
          </div>

          {/* Opció B: Sense Mercat (Subhastes) */}
          <div
            onClick={() => handleToggleSetting('market_mode', 'no_market')}
            className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-2 ${
              settings.market_mode === 'no_market'
                ? 'bg-accent/15 border-accent shadow-sm'
                : 'bg-base-surface border-base-border/70 hover:border-base-border hover:bg-base-raised/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🏛️</span>
                <span className="font-display font-bold text-sm text-white">
                  Sense Mercat (Subhastes)
                </span>
                <InfoTooltip text="Els mànagers no poden negociar ni vendre entre ells. Únicament l'administrador publica jugadors a subhasta i s'adjudiquen al millor postor." />
              </div>
              <span
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                  settings.market_mode === 'no_market'
                    ? 'border-accent bg-accent text-[#0B1220]'
                    : 'border-base-border bg-base-raised'
                }`}
              >
                {settings.market_mode === 'no_market' && '✓'}
              </span>
            </div>
            <p className="text-[11px] text-ink-dim">
              Sense vendes entre usuaris. Subhastes oficials del club.
            </p>
          </div>
        </div>

        {/* Sub-opcions quan està seleccionat "Sense Mercat" */}
        {settings.market_mode === 'no_market' && (
          <div className="p-3 sm:p-4 rounded-xl bg-base-raised/80 border border-base-border space-y-3 animate-fade-in mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Opcio 1: Pujes anònimes vs visibles */}
              <div className="p-3 rounded-lg bg-base-surface border border-base-border space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">🔒</span>
                    <span className="text-xs font-bold text-white">Visibilitat de les pujes</span>
                    <InfoTooltip text="En mode anònim, els mànagers no veuen quant han ofert els altres. En mode públic, la puja més alta és visible per a tothom." />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleToggleSetting('anonymous_bids', true)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 ${
                      settings.anonymous_bids
                        ? 'bg-accent text-[#0B1220] shadow-sm'
                        : 'bg-base-raised text-ink-dim hover:text-white border border-base-border'
                    }`}
                  >
                    <span>🔒 Anònimes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleSetting('anonymous_bids', false)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 ${
                      !settings.anonymous_bids
                        ? 'bg-accent text-[#0B1220] shadow-sm'
                        : 'bg-base-raised text-ink-dim hover:text-white border border-base-border'
                    }`}
                  >
                    <span>👁️ Visibles (Públiques)</span>
                  </button>
                </div>
              </div>

              {/* Opcio 2: Durada per defecte */}
              <div className="p-3 rounded-lg bg-base-surface border border-base-border space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">⏳</span>
                    <span className="text-xs font-bold text-white">Durada de la subhasta</span>
                    <InfoTooltip text="Quantitat de dies que durarà la subhasta abans d'adjudicar el jugador al millor postor." />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  {[1, 2, 3, 5, 7].map((days) => {
                    const isSelected = settings.default_auction_days === days
                    return (
                      <button
                        key={days}
                        type="button"
                        onClick={() => handleToggleSetting('default_auction_days', days)}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center min-w-[42px] ${
                          isSelected
                            ? 'bg-accent text-[#0B1220] shadow-sm'
                            : 'bg-base-raised text-white/90 hover:text-white hover:bg-base-border border border-base-border'
                        }`}
                      >
                        {days}d
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* SECCIÓ 2: LÍMIT DE JUGADORS A LA PLANTILLA                          */}
      {/* ------------------------------------------------------------------- */}
      <div className="card p-4 sm:p-5 space-y-3 border border-base-border">
        <div className="flex items-center justify-between border-b border-base-border/70 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-lg">👥</span>
            <h3 className="font-display font-bold text-sm sm:text-base text-yellow-400" style={{ color: '#FACC15' }}>
              Límit de Jugadors a la Plantilla
            </h3>
            <InfoTooltip text="Decideix si els equips tenen un límit estricte de 5 jugadors (sense suplents) o si poden tenir jugadors il·limitats a la banqueta." />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Opció A: Sense Límit */}
          <div
            onClick={() => handleToggleSetting('max_players_mode', false)}
            className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-2 ${
              !settings.max_players_mode
                ? 'bg-accent/15 border-accent shadow-sm'
                : 'bg-base-surface border-base-border/70 hover:border-base-border hover:bg-base-raised/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">♾️</span>
                <span className="font-display font-bold text-sm text-white">
                  Sense límit
                </span>
                <InfoTooltip text="Els mànagers poden fitxar tots els jugadors que vulguin i gestionar la seva banqueta sense límit de quantitat." />
              </div>
              <span
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                  !settings.max_players_mode
                    ? 'border-accent bg-accent text-[#0B1220]'
                    : 'border-base-border bg-base-raised'
                }`}
              >
                {!settings.max_players_mode && '✓'}
              </span>
            </div>
            <p className="text-[11px] text-ink-dim">
              Plantilla lliure amb banqueta il·limitada.
            </p>
          </div>

          {/* Opció B: Màxim 5 jugadors */}
          <div
            onClick={() => handleToggleSetting('max_players_mode', true)}
            className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-2 ${
              settings.max_players_mode
                ? 'bg-accent/15 border-accent shadow-sm'
                : 'bg-base-surface border-base-border/70 hover:border-base-border hover:bg-base-raised/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🛡️</span>
                <span className="font-display font-bold text-sm text-white">
                  Mode "Màxim 5 jugadors"
                </span>
                <InfoTooltip text="Cap mànager pot tenir més de 5 jugadors en plantilla (només els 5 titulars). Si un usuari ja en té 5, el sistema li bloquejarà noves ofertes fins que n'alliberi un." />
              </div>
              <span
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                  settings.max_players_mode
                    ? 'border-accent bg-accent text-[#0B1220]'
                    : 'border-base-border bg-base-raised'
                }`}
              >
                {settings.max_players_mode && '✓'}
              </span>
            </div>
            <p className="text-[11px] text-ink-dim">
              Només 5 jugadors per equip (els 5 titulars, sense banqueta).
            </p>
          </div>
        </div>
      </div>

      <Toast message={toast.msg} type={toast.type} onClose={() => setToast({ msg: '', type: 'ok' })} />
    </div>
  )
}
