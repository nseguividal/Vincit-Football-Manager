/**
 * Component de la Samarreta Oficial del C.E. Vincit
 * - Contorn silueta (blanc per defecte, o groc il·luminat per a titulars)
 * - Dorsal en blanc més gran i destacat
 * - Si no hi ha dorsal assignat, mostra la samarreta neta sense dorsal
 */
export default function Jersey({
  number,
  outline = 'white', // 'white' | 'yellow' | 'none'
  glow = false,
  className = 'w-10 h-10',
  title,
}) {
  const displayNum =
    number !== null && number !== undefined && String(number).trim() !== ''
      ? String(number).trim()
      : null

  const isYellow = outline === 'yellow' || glow
  const isWhite = outline === 'white'

  const strokeColor = isYellow ? '#FACC15' : isWhite ? '#FFFFFF' : 'none'
  const strokeWidth = isYellow ? '3.5' : isWhite ? '2.8' : '0'
  const filterStyle = isYellow
    ? 'drop-shadow(0 0 6px rgba(250, 204, 21, 0.85)) drop-shadow(0 2px 4px rgba(0,0,0,0.5))'
    : 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.45))'

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      title={title || (displayNum ? `Dorsal #${displayNum}` : 'Samarreta C.E. Vincit')}
    >
      <svg
        viewBox="-5 -4 110 106"
        className="w-full h-full overflow-visible select-none"
        style={{ filter: filterStyle }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Contorn exterior seguint la forma exacta de la samarreta */}
        {outline !== 'none' && (
          <path
            d="M 38 10 
               C 42 13, 58 13, 62 10 
               L 90 18 
               L 98 40 
               L 78 35 
               C 70 55, 70 75, 78 95 
               L 22 95 
               C 30 75, 30 55, 22 35 
               L 2 40 
               L 10 18 
               Z"
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Fons interior del coll per donar profunditat */}
        <path d="M 38 10 C 42 13, 58 13, 62 10 C 58 20, 42 20, 38 10 Z" fill="#0a1931" />

        {/* Base de la samarreta (Cos i mànigues blau clar) */}
        <path
          d="M 38 10 
             C 42 20, 58 20, 62 10 
             L 90 18 
             L 98 40 
             L 78 35 
             C 70 55, 70 75, 78 95 
             L 22 95 
             C 30 75, 30 55, 22 35 
             L 2 40 
             L 10 18 
             Z"
          fill="#1ba1e2"
        />

        {/* Panell lateral esquerre (Blau fosc seguint la forma) */}
        <path
          d="M 26 13.5 
             L 22 35 
             C 30 55, 30 75, 22 95 
             L 28 95 
             C 36 75, 36 45, 26 13.5 
             Z"
          fill="#0a1931"
        />

        {/* Panell lateral dret (Blau fosc seguint la forma) */}
        <path
          d="M 74 13.5 
             L 78 35 
             C 70 55, 70 75, 78 95 
             L 72 95 
             C 64 75, 64 45, 74 13.5 
             Z"
          fill="#0a1931"
        />

        {/* Línia blanca esquerra (Piping) */}
        <path d="M 26 13.5 C 36 45, 36 75, 28 95" fill="none" stroke="#ffffff" strokeWidth="1.2" />

        {/* Línia blanca dreta (Piping) */}
        <path d="M 74 13.5 C 64 45, 64 75, 72 95" fill="none" stroke="#ffffff" strokeWidth="1.2" />

        {/* Ribet del coll (Blanc) */}
        <path d="M 38 10 C 42 20, 58 20, 62 10" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />

        {/* Logo VINCIT estilitzat */}
        <g transform="translate(42.5, 22) scale(0.15)">
          {/* Forma V blanca */}
          <path d="M 0 0 L 50 50 L 100 0 L 85 0 L 50 35 L 15 0 Z" fill="#ffffff" />
          {/* Accent taronja interior */}
          <path d="M 35 5 L 50 20 L 65 5 L 55 5 L 50 10 L 45 5 Z" fill="#ff6600" />
        </g>
        <text
          x="50"
          y="35"
          fontFamily="Arial, sans-serif"
          fontSize="3.6"
          fill="#ffffff"
          textAnchor="middle"
          fontWeight="bold"
          letterSpacing="0.5"
        >
          VINCIT
        </text>

        {/* Dorsal del jugador en blanc gran i bold */}
        {displayNum !== null && (
          <text
            x="50"
            y="65"
            fontFamily="Arial, sans-serif"
            fontSize={displayNum.length >= 3 ? '22' : displayNum.length === 2 ? '28' : '34'}
            fill="#ffffff"
            textAnchor="middle"
            dominantBaseline="central"
            fontWeight="900"
            style={{
              filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.8))',
              letterSpacing: '-0.5px',
            }}
          >
            {displayNum}
          </text>
        )}
      </svg>
    </div>
  )
}
