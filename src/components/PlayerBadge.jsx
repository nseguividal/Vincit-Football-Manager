const POSITION_LABEL = {
  PORTER: 'POR',
  TANCA: 'TAN',
  ALA: 'ALA',
  PIVOT: 'PIV',
}

/**
 * Targeta compacta d'un jugador, per usar a la pista, al mercat o a llistats.
 * rating: número gran (p.ex. punts totals o valoració mitjana)
 */
export default function PlayerBadge({ name, position, rating, price, onClick, highlight, size = 'md' }) {
  const dims = size === 'sm' ? 'w-9 h-9 text-xs' : 'w-11 h-11 text-sm'

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 group ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div
        className={`${dims} rounded-full flex items-center justify-center font-display font-bold border-2 transition-transform ${
          highlight
            ? 'bg-accent text-base border-accent group-hover:scale-105'
            : 'bg-base-raised text-ink border-base-border group-hover:scale-105'
        }`}
      >
        {rating ?? '-'}
      </div>
      <div className="text-center leading-tight">
        <div className="text-[11px] text-ink-faint font-medium">{POSITION_LABEL[position] || position}</div>
        <div className="text-xs font-semibold max-w-[76px] truncate">{name}</div>
        {price != null && <div className="text-[11px] text-accent font-display">{price}M</div>}
      </div>
    </button>
  )
}
