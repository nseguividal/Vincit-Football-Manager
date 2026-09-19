export default function Topbar({ title, subtitle, right }) {
  return (
    <div className="flex items-center justify-between px-8 py-6 border-b border-base-border">
      <div>
        <h1 className="font-display text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-ink-dim mt-0.5">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-3">{right}</div>}
    </div>
  )
}
