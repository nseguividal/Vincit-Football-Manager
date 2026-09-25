import { useEffect } from 'react'

export default function Toast({ message, type = 'ok', onClose, duration = 5000 }) {
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => {
      onClose?.()
    }, duration)
    return () => clearTimeout(timer)
  }, [message, duration, onClose])

  if (!message) return null

  const isOk = type === 'ok'
  const isWarn = type === 'warn' || type === 'warning' || type === 'yellow'

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] max-w-lg w-[92%] sm:w-auto min-w-[320px] transition-all animate-bounce-short">
      <div
        className={`px-4 py-3 rounded-2xl shadow-2xl border flex items-center justify-between gap-3 backdrop-blur-md ${
          isOk
            ? 'bg-[#12281d]/95 border-ok/50 text-ok shadow-ok/20'
            : isWarn
            ? 'bg-[#2a220d]/95 border-amber-500/60 text-amber-300 shadow-amber-500/20'
            : 'bg-[#2d1414]/95 border-danger/50 text-danger shadow-danger/20'
        }`}
      >
        <div className="flex items-center min-w-0 flex-1">
          <span className={`text-xs sm:text-sm font-semibold block whitespace-normal break-words leading-snug ${isWarn ? 'text-amber-200' : 'text-ink'}`}>
            {message}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-ink-dim hover:text-ink text-xs p-1 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0 ml-2"
          title="Tancar"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

