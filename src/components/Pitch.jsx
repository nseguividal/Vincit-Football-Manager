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
            rating={p.rating}
            price={p.price}
            highlight
            onClick={onSlotClick ? () => onSlotClick(key) : undefined}
          />
        ) : (
          <button
            onClick={onSlotClick ? () => onSlotClick(key) : undefined}
            className="w-11 h-11 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center text-white/50 text-lg hover:border-white/70 hover:text-white/80 transition-colors"
          >
            +
          </button>
        )}
        {!p && <div className="text-[11px] text-white/50 mt-1">{basePosition}</div>}
      </div>
    )
  }

  return (
    <div className="relative w-full aspect-[4/5] max-w-sm mx-auto rounded-2xl overflow-hidden border border-base-border"
      style={{ background: 'linear-gradient(160deg, #0F6B4C 0%, #0A4F38 100%)' }}
    >
      {/* Línies de pista */}
      <div className="absolute inset-3 border-2 border-pitch-line rounded-lg" />
      <div className="absolute left-1/2 top-3 bottom-3 w-px bg-pitch-line -translate-x-1/2" />
      <div className="absolute left-1/2 top-1/2 w-20 h-20 border-2 border-pitch-line rounded-full -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute left-1/2 bottom-3 w-28 h-14 border-2 border-t-0 border-pitch-line -translate-x-1/2" />
      <div className="absolute left-1/2 top-3 w-28 h-14 border-2 border-b-0 border-pitch-line -translate-x-1/2" />

      {/* Jugadors (de dalt / atac, a baix / porter) */}
      <div className="relative h-full flex flex-col justify-between py-7 px-6">
        <div className="flex justify-center">{renderSlot('PIVOT', 'PIVOT')}</div>
        <div className="flex justify-between px-2">
          {renderSlot('ALA_1', 'ALA')}
          {renderSlot('ALA_2', 'ALA')}
        </div>
        <div className="flex justify-center">{renderSlot('TANCA', 'TANCA')}</div>
        <div className="flex justify-center">{renderSlot('PORTER', 'PORTER')}</div>
      </div>
    </div>
  )
}
