import Jersey from './Jersey'

const POS_EMOJIS = {
  PORTER: '🧤',
  POR: '🧤',
  TANCA: '🛡️',
  TAN: '🛡️',
  ALA: '⚡',
  PIVOT: '🎯',
  PIV: '🎯',
}

const POSITION_LABEL = {
  PORTER: 'PORTER',
  POR: 'PORTER',
  TANCA: 'TANCA',
  TAN: 'TANCA',
  ALA: 'ALA',
  PIVOT: 'PIVOT',
  PIV: 'PIVOT',
}

/**
 * Targeta compacta d'un jugador, per usar a la pista, al mercat o a llistats.
 * totalPoints: punts totals acumulats en jornades normals
 */
export default function PlayerBadge({
  name,
  position,
  dorsal,
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
    : 'w-10 h-10 sm:w-12 sm:h-12 text-xs sm:text-sm'

  const posUpper = position?.toUpperCase()
  const emoji = POS_EMOJIS[posUpper] || '⚽'
  const displayPos = POSITION_LABEL[posUpper] || position

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 sm:gap-1 group ${onClick ? 'cursor-pointer' : 'cursor-default'} relative`}
    >
      <div className="relative flex items-center justify-center transition-transform group-hover:scale-110">
        {/* Rodona a dalt a l'esquerra amb els punts acumulats o estat de jornada */}
        {totalPoints !== undefined && totalPoints !== null && (
          <span
            title={typeof totalPoints === 'number' ? `Punts: ${totalPoints} pts` : totalPoints === '⏳' ? 'Pendent de jugar' : 'No ha jugat (0 pts)'}
            className={`absolute -top-1 -left-2 min-w-[20px] sm:min-w-[22px] h-[20px] sm:h-[22px] px-1 text-[10px] sm:text-[11px] font-display font-bold leading-none rounded-full shadow-md flex items-center justify-center z-10 select-none ${
              totalPoints === '⏳'
                ? 'bg-slate-800 text-amber-300 border border-amber-400/60 text-[9px] sm:text-[10px]'
                : totalPoints === '—'
                ? 'bg-zinc-800 text-zinc-400 border border-zinc-600 font-bold'
                : 'bg-yellow-400 text-black border border-yellow-300'
            }`}
          >
            {totalPoints}
          </span>
        )}

        {/* Samarreta amb dorsal gran i contorn (o rating numèric si s'escau) */}
        {rating && rating !== '—' && rating !== '-' ? (
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-base-raised text-ink border-2 border-base-border flex items-center justify-center font-display font-bold">
            <span className="text-sm sm:text-base select-none font-bold">{rating}</span>
          </div>
        ) : (
          <Jersey
            number={dorsal}
            outline={highlight ? 'yellow' : 'white'}
            glow={highlight}
            className={isSm ? 'w-9 h-9' : 'w-12 h-12 sm:w-14 sm:h-14'}
          />
        )}

        {/* Etiqueta de venda a dalt a la dreta */}
        {isForSale && (
          <span
            title="Aquest jugador està posat a la venda al mercat"
            className="absolute -top-1 -right-1 text-[11px] leading-none bg-[#0B1220] border border-white/30 rounded-full p-0.5 shadow-md flex items-center justify-center z-10"
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
