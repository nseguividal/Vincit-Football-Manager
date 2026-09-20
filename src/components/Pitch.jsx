import PlayerBadge from './PlayerBadge'

/**
 * slots: { PORTER, TANCA, ALA_1, ALA_2, PIVOT } -> { name, position, rating, price } | null
 * onSlotClick(slotKey): opcional, per obrir el formulari de canvi de titular
 */
export default function Pitch({ slots, onSlotClick }) {
  const renderSlot = (key, basePosition) => {
    const p = slots?.[key]
    return (
      <div className="flex flex-col items-center">
        {p ? (
          <PlayerBadge
            name={p.name}
            position={p.position}
            totalPoints={p.totalPoints}
            isForSale={p.isForSale}
            highlight
            onClick={onSlotClick ? () => onSlotClick(key) : undefined}
          />
        ) : (
          <button
            type="button"
            onClick={onSlotClick ? () => onSlotClick(key) : undefined}
            aria-label={`Afegir ${basePosition}`}
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 border-dashed border-white/40 bg-black/20 flex items-center justify-center text-white/70 text-lg hover:border-white/90 hover:text-white hover:bg-black/30 transition-all shadow-sm"
          >
            +
          </button>
        )}
        {!p && <div className="text-[10px] sm:text-[11px] text-white/70 mt-1 font-medium drop-shadow">{basePosition}</div>}
      </div>
    )
  }

  return (
    <div
      className="relative w-full aspect-[3/4] max-w-[320px] sm:max-w-sm mx-auto rounded-2xl overflow-hidden border border-base-border shadow-md select-none"
      style={{ background: 'linear-gradient(160deg, #38BDF8 0%, #0284C7 100%)' }}
    >
      {/* Línies de pista de futbol sala */}
      <div className="absolute inset-2 sm:inset-3 border-2 border-pitch-line rounded-xl pointer-events-none" />
      {/* Línia de mig camp horitzontal */}
      <div className="absolute left-2 right-2 sm:left-3 sm:right-3 top-1/2 h-0.5 bg-pitch-line -translate-y-1/2 pointer-events-none" />
      {/* Cercle central */}
      <div className="absolute left-1/2 top-1/2 w-16 h-16 sm:w-20 sm:h-20 border-2 border-pitch-line rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute left-1/2 top-1/2 w-1.5 h-1.5 bg-pitch-line rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      
      {/* Àrea porteria rival allargada de futbol sala (a dalt) */}
      <div className="absolute left-1/2 top-2 sm:top-3 w-44 h-14 sm:w-56 sm:h-18 border-2 border-t-0 border-pitch-line rounded-b-full -translate-x-1/2 pointer-events-none" />
      
      {/* Àrea porteria pròpia allargada de futbol sala (a baix) */}
      <div className="absolute left-1/2 bottom-2 sm:bottom-3 w-44 h-14 sm:w-56 sm:h-18 border-2 border-b-0 border-pitch-line rounded-t-full -translate-x-1/2 pointer-events-none" />

      {/* JUGADORS: Col·locació tàctica exacta (1-2-1 / Rombe de Futbol Sala) */}
      
      {/* PIVOT: Zona d'atac una mica més avall (top: 29%) */}
      <div className="absolute top-[29%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        {renderSlot('PIVOT', 'PIVOT')}
      </div>

      {/* ALA ESQUERRA: Baixat al mig del camp / bandes (top: 52%, left: 18%) */}
      <div className="absolute top-[52%] left-[18%] -translate-x-1/2 -translate-y-1/2 z-10">
        {renderSlot('ALA_1', 'ALA')}
      </div>

      {/* ALA DRETA: Baixat al mig del camp / bandes (top: 52%, left: 82%) */}
      <div className="absolute top-[52%] left-[82%] -translate-x-1/2 -translate-y-1/2 z-10">
        {renderSlot('ALA_2', 'ALA')}
      </div>

      {/* TANCA: Per sota del cercle central amb espai respecte al porter (top: 70%) */}
      <div className="absolute top-[70%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        {renderSlot('TANCA', 'TANCA')}
      </div>

      {/* PORTER: Davant de la línia de gol pròpia (top: 91%) */}
      <div className="absolute top-[91%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        {renderSlot('PORTER', 'PORTER')}
      </div>
    </div>
  )
}
