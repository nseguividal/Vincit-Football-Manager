import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Topbar from '../components/Topbar'

const TYPE_ICON = {
  purchase: '💸',
  sale: '🤝',
  market_new: '🆕',
  lineup_change: '🔄',
  offer_made: '📨',
  points_added: '📊',
}

export default function Home() {
  const [standings, setStandings] = useState([])
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: standingsData }, { data: logData }] = await Promise.all([
        supabase.from('v_total_standings').select('*'),
        supabase
          .from('activity_log')
          .select('id, type, message, created_at, managers(display_name, avatar_emoji)')
          .order('created_at', { ascending: false })
          .limit(30),
      ])
      setStandings(standingsData || [])
      setLog(logData || [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div>
      <Topbar title="Inici" subtitle="Classificació general i últims moviments" />

      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Classificació */}
        <div className="lg:col-span-2 card p-6">
          <h2 className="font-display font-semibold mb-4">Classificació</h2>
          {loading ? (
            <p className="text-ink-dim text-sm">Carregant…</p>
          ) : standings.length === 0 ? (
            <p className="text-ink-dim text-sm">Encara no hi ha punts registrats.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-faint text-left border-b border-base-border">
                  <th className="py-2 font-normal">#</th>
                  <th className="py-2 font-normal">Manager</th>
                  <th className="py-2 font-normal text-right">Punts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s, i) => (
                  <tr key={s.manager_id} className="border-b border-base-border/60 last:border-0">
                    <td className="py-3">
                      <span
                        className={`inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-display font-semibold ${
                          i === 0 ? 'bg-accent text-base' : 'bg-base-raised text-ink-dim'
                        }`}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-3 font-medium">{s.display_name}</td>
                    <td className="py-3 text-right font-display font-semibold text-accent">
                      {s.total_points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Log d'activitat */}
        <div className="card p-6">
          <h2 className="font-display font-semibold mb-4">Últims moviments</h2>
          <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
            {loading ? (
              <p className="text-ink-dim text-sm">Carregant…</p>
            ) : log.length === 0 ? (
              <p className="text-ink-dim text-sm">Sense moviments encara.</p>
            ) : (
              log.map((entry) => (
                <div key={entry.id} className="flex gap-3">
                  <span className="text-lg leading-none mt-0.5">{TYPE_ICON[entry.type] || '•'}</span>
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">{entry.message}</p>
                    <p className="text-xs text-ink-faint mt-0.5">
                      {new Date(entry.created_at).toLocaleString('ca-ES', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
