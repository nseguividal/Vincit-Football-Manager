export default function Topbar({ title, subtitle, right }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 px-4 py-4 sm:px-8 sm:py-6 border-b border-base-border">
      <div>
        <h1 className="font-display text-lg sm:text-xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="text-xs sm:text-sm text-ink-dim mt-0.5">{subtitle}</p>}
      </div>
      {right && (
        <div className="w-full sm:w-auto flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          {right}
        </div>
      )}
    </div>
  )
}
