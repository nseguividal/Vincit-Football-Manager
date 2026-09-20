import { useState } from 'react'

export default function ClubLogo({
  className = 'w-9 h-9',
  imgClassName = 'w-full h-full object-contain',
  rounded = 'rounded-xl',
}) {
  const [hasError, setHasError] = useState(false)

  if (hasError) {
    return (
      <div
        className={`${className} ${rounded} bg-accent flex items-center justify-center text-sm sm:text-base font-bold select-none shrink-0`}
      >
        ⚽
      </div>
    )
  }

  return (
    <div
      className={`${className} ${rounded} bg-white p-1 flex items-center justify-center shadow-sm shrink-0 overflow-hidden border border-white/20`}
    >
      <img
        src="/cropped-logovincitgran.png"
        alt="Vincit Club Logo"
        className={imgClassName}
        onError={() => setHasError(true)}
      />
    </div>
  )
}

