import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Topbar from '../components/Topbar'

import { fetchGameSettings, DEFAULT_GAME_SETTINGS } from '../lib/settingsUtils'

const TYPE_ICON = {
  purchase: '💸',
  market_new: '🆕',
  points_added: '📊',
}

function parseLogEntry(entry, teamsList = [], matchdaysList = [], settings = DEFAULT_GAME_SETTINGS) {
  if (entry.type === 'points_added') {
    // Check if MATCH_RESULT tag exists: [MATCH_RESULT:teamId:matchdayId:result]
    const matchTag = entry.message?.match(/\[MATCH_RESULT:([^:]+):([^:]+)(?::([^\]]+))?\]/)
    let teamId = matchTag ? matchTag[1] : null
    const matchdayId = matchTag ? matchTag[2] : null

    // Netegem el text traient l'etiqueta tècnica
    const clean = (entry.message || '').replace(/\[MATCH_RESULT:[^\]]+\]/, '').trim()

    // Extraiem el nom de l'equip
    const matchTeam = clean.match(/les puntuacions de (.+?)(?:\s*\((?:Jornada[^)]*)\))?(?:\s*\((?:Victòria|Empat|Derrota)\))?$/i)
    let teamName = ''
    if (matchTeam) {
      teamName = matchTeam[1].trim()
    } else {
      const parts = clean.split(/les puntuacions de /i)
      if (parts[1]) teamName = parts[1].trim()
    }

    if (!teamId && teamName && teamsList.length) {
      const found = teamsList.find((t) => t.name?.toLowerCase() === teamName.toLowerCase())
      if (found) teamId = found.id
    }

    // Identifiquem la jornada
    let matchdayLabel = ''
    if (matchdayId && matchdaysList.length) {
      const foundMd = matchdaysList.find((m) => m.id === matchdayId)
      if (foundMd) {
        matchdayLabel = foundMd.label || (foundMd.number ? `Jornada ${foundMd.number}` : '')
      }
    }

    if (!matchdayLabel) {
      // Intentem trobar "Jornada X" al text original del missatge
      const matchJornada = clean.match(/\((Jornada[^)]*)\)/i)
      if (matchJornada) {
        matchdayLabel = matchJornada[1].trim()
      }
    }

    if (clean.includes('eliminat el registre')) {
      const delMsg = clean.replace(/^.+? ha eliminat el registre de puntuacions de /i, "S'ha eliminat el registre de puntuacions de ")
      return {
        text: delMsg.startsWith("S'ha") ? delMsg : `S'ha eliminat el registre de puntuacions de ${teamName || 'l\'equip'}`,
        link: null,
      }
    }

    let displayText = ''
    if (teamName) {
      displayText = matchdayLabel
        ? `S'han pujat les puntuacions de ${teamName} (${matchdayLabel})`
        : `S'han pujat les puntuacions de ${teamName}`
    } else {
      displayText = clean.replace(/^.+? ha (?:pujat|modificat) les puntuacions de /, "S'han pujat les puntuacions de ")
    }

    const link = teamId && matchdayId
      ? `/jornades?matchday=${matchdayId}&team=${teamId}`
      : matchdayId
      ? `/jornades?matchday=${matchdayId}`
      : `/jornades`

    return {
      text: displayText,
      link,
    }
  }

  // Registres de publicació al mercat / subhastes
  const rawMsg = entry.message || ''
  const isAuctionMode = settings?.market_mode === 'no_market'

  if (
    entry.type === 'market_new' ||
    rawMsg.includes('posat a la venda') ||
    rawMsg.includes('posat a subhasta') ||
    rawMsg.includes('Nova fitxa disponible')
  ) {
    // Extreure el nom del jugador
    let playerName = ''
    let priceDetails = ''

    const matchListing = rawMsg.match(/(?:📢\s*)?(?:L'administrador ha|S'ha)\s+posat\s+a\s+(?:la venda|subhasta)\s+a\s+(.+?)(?:\s+per\s+([\d.]+M(?:\s*\(\d+\s*dies\))?|\s*[\d.]+M)|\s*\(Mínim\s+[\d.]+M\)|\s*\(\d+\s*dies\)|\s*\(.*?\)|$)/i)
    
    if (matchListing) {
      playerName = matchListing[1]?.trim()
      const priceMatch = rawMsg.match(/per\s+([\d.]+M(?:\s*\(\d+\s*dies\))?)/i)
      if (priceMatch) {
        priceDetails = ` per ${priceMatch[1]}`
      }
    } else {
      const matchNova = rawMsg.match(/Nova fitxa disponible al mercat:\s*([^(]+)(?:\(([^)]+)\))?/i)
      if (matchNova) {
        playerName = matchNova[1]?.trim()
        if (matchNova[2]) priceDetails = ` per ${matchNova[2]}`
      }
    }

    if (playerName) {
      if (isAuctionMode) {
        return {
          text: `📢 S'ha posat a subhasta a ${playerName}`,
          link: '/mercat',
        }
      } else {
        return {
          text: `📢 S'ha posat a la venda a ${playerName}${priceDetails}`,
          link: '/mercat',
        }
      }
    }

    // Fallback si no ha fet match amb el nom
    let fallbackText = rawMsg.replace(/L'administrador ha posat a la venda a /gi, "S'ha posat a la venda a ")
    if (isAuctionMode) {
      fallbackText = fallbackText
        .replace(/posat a la venda a /gi, "posat a subhasta a ")
        .replace(/per\s+[\d.]+M(?:\s*\(\d+\s*dies\))?/gi, '')
        .replace(/\(Mínim\s+[\d.]+M\)/gi, '')
        .replace(/\(\d+\s*dies\)/gi, '')
        .trim()
    }
    return {
      text: fallbackText,
      link: '/mercat',
    }
  }

  return {
    text: rawMsg.replace(/L'administrador ha posat a la venda a /gi, "S'ha posat a la venda a "),
    link: null,
  }
}

import { useAuth } from '../context/AuthContext'
import {
  MOCK_STANDINGS,
  MOCK_TEAMS,
  MOCK_MATCHDAYS,
  MOCK_ACTIVITY_LOG,
} from '../lib/mockData'

import DemoBanner from '../components/DemoBanner'

export default function Home() {
  const { manager } = useAuth()
  const [standings, setStandings] = useState([])
  const [teams, setTeams] = useState([])
  const [matchdays, setMatchdays] = useState([])
  const [log, setLog] = useState([])
  const [settings, setSettings] = useState(DEFAULT_GAME_SETTINGS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!manager) {
        setStandings(MOCK_STANDINGS)
        setTeams(MOCK_TEAMS)
        setMatchdays(MOCK_MATCHDAYS)
        setLog(MOCK_ACTIVITY_LOG)
        setLoading(false)
        return
      }

      setLoading(true)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const [{ data: standingsData }, { data: managersData }, { data: teamsData }, { data: matchdaysData }, { data: logData }, gameSettings] = await Promise.all([
        supabase.from('v_total_standings').select('*'),
        supabase.from('managers').select('id, display_name, avatar_emoji'),
        supabase.from('club_teams').select('id, name'),
        supabase.from('matchdays').select('id, number, label, is_extra').order('number'),
        supabase
          .from('activity_log')
          .select('id, type, message, created_at, managers(display_name, avatar_emoji)')
          .in('type', ['market_new', 'points_added', 'purchase'])
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: false })
          .limit(30),
        fetchGameSettings(),
      ])

      const emojiMap = new Map((managersData || []).map((m) => [m.id, m.avatar_emoji || '⚽']))
      const enrichedStandings = (standingsData || []).map((s) => ({
        ...s,
        avatar_emoji: s.avatar_emoji || emojiMap.get(s.manager_id) || '⚽',
      }))

      setStandings(enrichedStandings)
      setTeams(teamsData || [])
      setMatchdays(matchdaysData || [])
      setLog(logData || [])
      setSettings(gameSettings)
      setLoading(false)
    }
    load()
  }, [manager])

  return (
    <div>
      <Topbar title="Classificació" subtitle="Classificació general i últims moviments" />

      <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
        <DemoBanner />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Classificació */}
          <div className="lg:col-span-2 card p-4 sm:p-6">
          <h2 className="font-display font-semibold text-lg text-ink mb-3 sm:mb-4">Classificació</h2>
          {loading ? (
            <p className="text-ink-dim text-sm py-4">Carregant…</p>
          ) : standings.length === 0 ? (
            <p className="text-ink-dim text-sm py-4">Encara no hi ha punts registrats.</p>
          ) : (
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-ink-dim text-left border-b border-base-border">
                  <th className="py-2.5 font-semibold w-10">#</th>
                  <th className="py-2.5 font-semibold">Manager</th>
                  <th className="py-2.5 font-semibold text-right">Punts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s, i) => (
                  <tr key={s.manager_id} className="border-b border-base-border/60 last:border-0 hover:bg-base-surface/40 transition-colors">
                    <td className="py-3">
                      <span
                        className={`inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-display font-bold ${
                          i === 0
                            ? 'bg-accent text-base shadow-sm'
                            : 'bg-base-raised text-white border border-base-border'
                        }`}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-3 font-semibold text-white">
                      <div className="flex items-center gap-2">
                        <span className="text-lg select-none">{s.avatar_emoji || '⚽'}</span>
                        <span>{s.display_name}</span>
                      </div>
                    </td>
                    <td className="py-3 text-right font-display font-bold text-yellow-400 text-base sm:text-lg">
                      {s.total_points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Log d'activitat */}
        <div className="card p-4 sm:p-6">
          <h2 className="font-display font-semibold text-lg text-ink mb-3 sm:mb-4">Últims moviments</h2>
          <div className="space-y-3.5 max-h-[380px] sm:max-h-[520px] overflow-y-auto pr-1">
            {loading ? (
              <p className="text-ink-dim text-sm">Carregant…</p>
            ) : log.length === 0 ? (
              <p className="text-ink-dim text-sm">Sense moviments encara.</p>
            ) : (
              log.map((entry) => {
                const item = parseLogEntry(entry, teams, matchdays, settings)
                return (
                  <div key={entry.id} className="flex gap-2.5 sm:gap-3 items-start">
                    <span className="text-base sm:text-lg leading-none mt-0.5 select-none">
                      {TYPE_ICON[entry.type] || '•'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs sm:text-sm leading-snug text-ink">{item.text}</p>
                        {item.link && (
                          <Link
                            to={item.link}
                            className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30 transition-colors inline-flex items-center gap-1 shrink-0"
                          >
                            <span>Visualitzar</span>
                            <span>➜</span>
                          </Link>
                        )}
                      </div>
                      <p className="text-[11px] sm:text-xs text-ink-faint mt-0.5">
                        {new Date(entry.created_at).toLocaleString('ca-ES', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
  )
}
