const POS_EMOJIS = {
  PORTER: '🧤',
  TANCA: '🛡️',
  ALA: '⚡',
  PIVOT: '🎯',
}

const POSITION_LABEL = {
  PORTER: 'PORTER',
  TANCA: 'TANCA',
  ALA: 'ALA',
  PIVOT: 'PIVOT',
}

/**
 * Targeta compacta d'un jugador, per usar a la pista, al mercat o a llistats.
 * totalPoints: punts totals acumulats en jornades normals
 */
export default function PlayerBadge({
  name,
  position,
  totalPoints,
  rating,
  price,
  onClick,
  highlight,
  size = 'md',
  isForSale = false,
}) {
  const isSm = size === 'sm'
  const dims = isSm
    ? 'w-8 h-8 text-[11px]'
    : 'w-9 h-9 sm:w-11 sm:h-11 text-xs sm:text-sm'

  const posUpper = position?.toUpperCase()
  const emoji = POS_EMOJIS[posUpper] || '⚽'
  const displayPos = POSITION_LABEL[posUpper] || position

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 sm:gap-1 group ${onClick ? 'cursor-pointer' : 'cursor-default'} relative`}
    >
      <div
        className={`${dims} rounded-full flex items-center justify-center font-display font-bold border-2 transition-transform shadow-sm relative ${
          highlight
            ? 'bg-black/35 text-white border-white/70 group-hover:scale-105'
            : 'bg-base-raised text-ink border-base-border group-hover:scale-105'
        }`}
      >
        {/* Rodona a dalt a l'esquerra amb els punts acumulats */}
        {totalPoints != null && (
          <span
            title={`Punts acumulats: ${totalPoints} pts (jornades normals)`}
            className="absolute -top-1.5 -left-2 min-w-[20px] sm:min-w-[22px] h-[20px] sm:h-[22px] px-1 text-[10px] sm:text-[11px] font-display font-bold leading-none bg-yellow-400 text-black border border-yellow-300 rounded-full shadow-md flex items-center justify-center z-10"
          >
            {totalPoints}
          </span>
        )}

        {/* Emoticona de posició o rating */}
        <span className="text-sm sm:text-base select-none">
          {rating && rating !== '—' && rating !== '-' ? rating : emoji}
        </span>

        {/* Etiqueta de venda a dalt a la dreta */}
        {isForSale && (
          <span
            title="Aquest jugador està posat a la venda al mercat"
            className="absolute -top-1.5 -right-1.5 text-[11px] leading-none bg-[#0B1220] border border-white/30 rounded-full p-0.5 shadow-md flex items-center justify-center z-10"
          >
            🏷️
          </span>
        )}
      </div>

      <div className="text-center leading-tight">
        <div
          className={`text-[9px] sm:text-[10px] font-bold tracking-wider ${
            highlight ? 'text-white/90 drop-shadow' : 'text-ink-faint'
          }`}
        >
          {displayPos}
        </div>
        <div
          className={`text-[11px] sm:text-xs max-w-[64px] sm:max-w-[78px] truncate ${
            highlight ? 'text-white font-bold drop-shadow' : 'text-ink font-semibold'
          }`}
        >
          {name}
        </div>
        {price != null && (
          <div className="text-[10px] sm:text-[11px] text-accent font-display font-medium">
            {price}M
          </div>
        )}
      </div>
    </button>
  )
}
