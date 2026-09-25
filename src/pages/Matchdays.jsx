import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Topbar from '../components/Topbar'
import Pitch from '../components/Pitch'
import Toast from '../components/Toast'
import Jersey from '../components/Jersey'
import DemoBanner from '../components/DemoBanner'
import {
  getDefaultDisplayMatchday,
  formatVincitTeamName,
  cleanOpponentName,
} from '../lib/matchdayUtils'
import { getMockMatchdaysData } from '../lib/mockData'

const POS_CONFIG = {
  PORTER: { label: 'Porter', short: 'POR', emoji: '🧤', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  TANCA: { label: 'Tanca', short: 'TAN', emoji: '🛡️', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  ALA: { label: 'Ala', short: 'ALA', emoji: '⚡', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  PIVOT: { label: 'Pivot', short: 'PIV', emoji: '🎯', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
}

export default function Matchdays() {
  const { manager } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [matchdays, setMatchdays] = useState([])
  const [selectedMatchdayId, setSelectedMatchdayId] = useState('')
  const [selectedManagerId, setSelectedManagerId] = useState('')
  const [selectedTeamModal, setSelectedTeamModal] = useState(null)
  const [managers, setManagers] = useState([])
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [cards, setCards] = useState([])
  const [lineupSlots, setLineupSlots] = useState([])
  const [allStats, setAllStats] = useState([])
  const [logResults, setLogResults] = useState({})
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState({ msg: '', type: 'ok' })

  // 1. Carregar totes les dades necessàries
  async function loadAllData() {
    try {
      if (!manager) {
        const mockData = getMockMatchdaysData()
        const mdList = mockData.matchdaysList
        const mgrList = mockData.managersList
        const teamsList = mockData.teamsList
        const playersList = mockData.playersList
        const cardsList = mockData.cardsList
        const slotsList = mockData.slotsList
        const stList = mockData.statsList
        const resMap = mockData.logResults

        setMatchdays(mdList)
        setManagers(mgrList)
        setTeams(teamsList)
        setPlayers(playersList)
        setCards(cardsList)
        setLineupSlots(slotsList)
        setAllStats(stList)
        setLogResults(resMap)

        const urlMdId = searchParams.get('matchday')
        const urlTeamId = searchParams.get('team')

        if (mdList.length > 0) {
          if (urlMdId && mdList.some((m) => String(m.id).toLowerCase() === String(urlMdId).toLowerCase())) {
            setSelectedMatchdayId(urlMdId)
          } else {
            const defaultMd = getDefaultDisplayMatchday(mdList, stList)
            setSelectedMatchdayId(defaultMd ? defaultMd.id : mdList[0].id)
          }
        }

        if (urlTeamId) {
          const foundTeam = teamsList.find((t) => String(t.id).toLowerCase() === String(urlTeamId).toLowerCase())
          if (foundTeam) setSelectedTeamModal(foundTeam)
        }

        setSelectedManagerId((prev) => prev || mgrList[0]?.id || '')
        setLoading(false)
        return
      }

      const [
        mdRes,
        mgrRes,
        teamsRes,
        playersRes,
        cardsRes,
        slotsRes,
        statsRes,
        logRes,
      ] = await Promise.all([
        supabase.from('matchdays').select('*').order('number'),
        supabase.from('managers').select('id, display_name, avatar_emoji').order('display_name'),
        supabase.from('club_teams').select('id, name, category').order('name'),
        supabase.from('club_players').select('id, full_name, position, dorsal, team_id'),
        supabase.from('fantasy_cards').select('id, owner_manager_id, current_price, status, club_player_id'),
        supabase.from('lineup_slots').select('manager_id, slot, fantasy_card_id'),
        supabase.from('player_matchday_stats').select('*'),
        supabase.from('activity_log').select('message, created_at').eq('type', 'points_added').order('created_at', { ascending: true }),
      ])

      if (statsRes.error) console.error('Error carregant player_matchday_stats:', statsRes.error)
      if (playersRes.error) console.error('Error carregant club_players:', playersRes.error)
      if (slotsRes.error) console.error('Error carregant lineup_slots:', slotsRes.error)
      if (cardsRes.error) console.error('Error carregant fantasy_cards:', cardsRes.error)

      const mdList = mdRes.data || []
      const mgrList = mgrRes.data || []
      const teamsList = teamsRes.data || []
      const playersList = playersRes.data || []
      const cardsList = cardsRes.data || []
      const slotsList = slotsRes.data || []
      const stList = statsRes.data || []
      const logList = logRes.data || []

      setMatchdays(mdList)
      setManagers(mgrList)
      setTeams(teamsList)
      setPlayers(playersList)
      setCards(cardsList)
      setLineupSlots(slotsList)
      setAllStats(stList)

      // Parse log match results com a fallback si no és a player_matchday_stats
      const resMap = {}
      logList.forEach((entry) => {
        const match = entry.message?.match(/\[MATCH_RESULT:([^:]+):([^:]+):([^:\]]+)(?::([^:\]]*))?(?::([^:\]]*))?(?::([^\]]*))?\]/)
        if (match) {
          const tId = String(match[1]).toLowerCase()
          const mdId = String(match[2]).toLowerCase()
          const res = match[3]
          let score = match[4]
          let venue = match[5]
          let opp = match[6]

          if (score === 'home' || score === 'away') {
            venue = score
            score = null
            opp = match[5]
          }

          let cleanOpp = null
          if (opp) {
            cleanOpp = cleanOpponentName(opp)
            if (cleanOpp === 'Rival') cleanOpp = null
          }

          resMap[`${tId}_${mdId}`] = {
            result: res,
            score: score && score !== 'home' && score !== 'away' ? score : null,
            venue: venue === 'away' ? 'away' : 'home',
            opponent: cleanOpp || null,
          }
        }
      })
      setLogResults(resMap)

      // Comprovar paràmetres d'URL inicials
      const urlMdId = searchParams.get('matchday')
      const urlTeamId = searchParams.get('team')

      // Selecció per defecte de jornada:
      // 1. Si hi ha jornada en curs activa ara mateix -> la jornada en curs
      // 2. Si no n'hi ha cap d'activa -> l'última jornada jugada / finalitzada
      // 3. Si no n'hi ha cap de jugada -> la Jornada 1
      if (mdList.length > 0) {
        if (urlMdId && mdList.some((m) => String(m.id).toLowerCase() === String(urlMdId).toLowerCase())) {
          setSelectedMatchdayId(urlMdId)
        } else {
          setSelectedMatchdayId((prev) => {
            if (prev && mdList.some((m) => String(m.id).toLowerCase() === String(prev).toLowerCase())) {
              return prev
            }
            const defaultMd = getDefaultDisplayMatchday(mdList, stList)
            return defaultMd ? defaultMd.id : mdList[0].id
          })
        }
      }

      // Obrir modal d'equip si ve a la URL
      if (urlTeamId) {
        const foundTeam = teamsList.find((t) => String(t.id).toLowerCase() === String(urlTeamId).toLowerCase())
        if (foundTeam) {
          setSelectedTeamModal(foundTeam)
        }
      }

      // Selecció per defecte de manager
      if (manager?.id) {
        setSelectedManagerId((prev) => prev || manager.id)
      } else if (mgrList.length > 0) {
        setSelectedManagerId((prev) => prev || mgrList[0].id)
      }
    } catch (err) {
      console.error('Error carregant dades de jornades:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAllData()
  }, [manager])

  // Subscripció en temps real (només si autenticat)
  useEffect(() => {
    if (!manager) return

    const channel = supabase
      .channel('matchdays-realtime-sub')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player_matchday_stats' },
        () => {
          loadAllData()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lineup_slots' },
        () => {
          loadAllData()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activity_log' },
        () => {
          loadAllData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [manager])

  // Maps ràpids per accés O(1)
  const playersMap = useMemo(() => {
    const map = new Map()
    players.forEach((p) => {
      if (p.id) map.set(String(p.id).toLowerCase(), p)
    })
    return map
  }, [players])

  const cardsMap = useMemo(() => {
    const map = new Map()
    cards.forEach((c) => {
      if (c.id) map.set(String(c.id).toLowerCase(), c)
    })
    return map
  }, [cards])

  const playerTeamMap = useMemo(() => {
    const map = new Map()
    players.forEach((p) => {
      if (p.id && p.team_id) map.set(String(p.id).toLowerCase(), String(p.team_id).toLowerCase())
    })
    return map
  }, [players])

  const playerStatsMap = useMemo(() => {
    const map = new Map() // `${club_player_id}_${matchday_id}` -> stat
    allStats.forEach((s) => {
      if (s.club_player_id && s.matchday_id) {
        map.set(`${String(s.club_player_id).toLowerCase()}_${String(s.matchday_id).toLowerCase()}`, s)
      }
    })
    return map
  }, [allStats])

  const selectedMatchday = useMemo(() => {
    return (
      matchdays.find((m) => String(m.id).toLowerCase() === String(selectedMatchdayId).toLowerCase()) ||
      matchdays[0]
    )
  }, [matchdays, selectedMatchdayId])

  // Estat de la jornada seleccionada
  const matchdayStatus = useMemo(() => {
    if (!selectedMatchday) return { isPlayedOrStarted: false, isInProgress: false, isFuture: true, isFinished: false, hasStats: false }
    const now = new Date()
    const nowTime = now.getTime()

    const startsAt = selectedMatchday.starts_at ? String(selectedMatchday.starts_at).split('T')[0].split(' ')[0] : null
    const endsAt = selectedMatchday.ends_at ? String(selectedMatchday.ends_at).split('T')[0].split(' ')[0] : null

    const hasStats =
      allStats.some((s) => String(s.matchday_id).toLowerCase() === String(selectedMatchday.id).toLowerCase()) ||
      Object.keys(logResults).some((key) => {
        const parts = key.split('_')
        return parts.length === 2 && String(parts[1]).toLowerCase() === String(selectedMatchday.id).toLowerCase()
      })

    let isFinished = false
    let isInProgress = false
    let isFuture = false

    if (startsAt && endsAt) {
      const [sY, sM, sD] = startsAt.split('-').map(Number)
      const [eY, eM, eD] = endsAt.split('-').map(Number)
      if (sY && sM && sD && eY && eM && eD) {
        const startTime = new Date(sY, sM - 1, sD, 0, 0, 0, 0).getTime()
        const endTime = new Date(eY, eM - 1, eD, 23, 59, 59, 999).getTime()

        if (nowTime > endTime) {
          isFinished = true
        } else if (nowTime >= startTime && nowTime <= endTime) {
          isInProgress = true
        } else {
          isFuture = true
        }
      }
    } else if (startsAt) {
      const [sY, sM, sD] = startsAt.split('-').map(Number)
      if (sY && sM && sD) {
        const startTime = new Date(sY, sM - 1, sD, 0, 0, 0, 0).getTime()
        if (nowTime < startTime) {
          isFuture = true
        } else {
          isInProgress = true
        }
      }
    } else {
      isFuture = true
    }

    const isPlayedOrStarted = hasStats || isInProgress || isFinished

    return { isPlayedOrStarted, isInProgress, isFuture, isFinished, hasStats }
  }, [selectedMatchday, allStats, logResults])

  // Equips que ja han pujat dades en aquesta jornada
  const teamsWithStatsThisMatchday = useMemo(() => {
    if (!selectedMatchday) return new Set()
    const teamSet = new Set()
    allStats.forEach((s) => {
      if (String(s.matchday_id).toLowerCase() === String(selectedMatchday.id).toLowerCase()) {
        const pTeamId = playerTeamMap.get(String(s.club_player_id).toLowerCase())
        if (pTeamId) {
          teamSet.add(String(pTeamId).toLowerCase())
        }
      }
    })
    Object.keys(logResults).forEach((key) => {
      const parts = key.split('_')
      if (parts.length === 2 && String(parts[1]).toLowerCase() === String(selectedMatchday.id).toLowerCase()) {
        teamSet.add(String(parts[0]).toLowerCase())
      }
    })
    return teamSet
  }, [selectedMatchday, allStats, playerTeamMap, logResults])

  // Classificació de la jornada i punts acumulats
  const { standings, managerStatsMap } = useMemo(() => {
    if (!selectedMatchday) return { standings: [], managerStatsMap: new Map() }

    const mdNumber = selectedMatchday.number
    const mStatsMap = new Map()

    managers.forEach((mgr) => {
      const mgrSlots = lineupSlots.filter(
        (ls) => String(ls.manager_id).toLowerCase() === String(mgr.id).toLowerCase()
      )

      let matchdayPoints = 0
      let waitingCount = 0
      const slotPoints = {}

      mgrSlots.forEach((ls) => {
        const card = cardsMap.get(String(ls.fantasy_card_id).toLowerCase())
        const player = card ? playersMap.get(String(card.club_player_id).toLowerCase()) : null
        const playerId = player?.id || card?.club_player_id || null
        const teamId = player?.team_id || (playerId ? playerTeamMap.get(String(playerId).toLowerCase()) : null)

        const statKey = playerId ? `${String(playerId).toLowerCase()}_${String(selectedMatchday.id).toLowerCase()}` : null
        const stat = statKey ? playerStatsMap.get(statKey) : null

        if (stat) {
          if (stat.attended === false) {
            slotPoints[ls.slot] = '—' // No ha jugat
          } else {
            const pts = Number(stat.points) || 0
            slotPoints[ls.slot] = pts
            matchdayPoints += pts
          }
        } else {
          // Comprovar si l'equip del jugador ja ha enviat el resultat
          const teamHasStats = teamId ? teamsWithStatsThisMatchday.has(String(teamId).toLowerCase()) : false
          if (matchdayStatus.isFinished || teamHasStats) {
            // Quan la jornada ha finalitzat o l'equip ja ha jugat, tothom sense punts passa a "—" (no ha jugat)
            slotPoints[ls.slot] = '—'
          } else {
            // Si la jornada està en curs o és futura i l'equip encara no ha disputat/enviat el partit es mostra "⏳"
            slotPoints[ls.slot] = '⏳'
            waitingCount++
          }
        }
      })

      // Calcular punts acumulats fins a la jornada seleccionada (inclou 1..N, excloent extres)
      let accumulatedPoints = 0
      matchdays
        .filter((m) => !m.is_extra && m.number <= mdNumber)
        .forEach((m) => {
          mgrSlots.forEach((ls) => {
            const card = cardsMap.get(String(ls.fantasy_card_id).toLowerCase())
            const playerId = card?.club_player_id
            if (playerId) {
              const stat = playerStatsMap.get(`${String(playerId).toLowerCase()}_${String(m.id).toLowerCase()}`)
              if (stat && stat.attended !== false) {
                accumulatedPoints += Number(stat.points) || 0
              }
            }
          })
        })

      mStatsMap.set(String(mgr.id).toLowerCase(), {
        manager: mgr,
        matchdayPoints,
        accumulatedPoints,
        slotPoints,
        waitingCount,
        slots: mgrSlots,
      })
    })

    // Ordenar per punts de la jornada
    const sorted = Array.from(mStatsMap.values()).sort((a, b) => {
      if (b.matchdayPoints !== a.matchdayPoints) {
        return b.matchdayPoints - a.matchdayPoints
      }
      return b.accumulatedPoints - a.accumulatedPoints
    })

    const withRanks = sorted.map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
    }))

    return { standings: withRanks, managerStatsMap: mStatsMap }
  }, [
    selectedMatchday,
    managers,
    lineupSlots,
    cardsMap,
    playersMap,
    playerStatsMap,
    matchdays,
    matchdayStatus,
    teamsWithStatsThisMatchday,
    playerTeamMap,
  ])

  // Dades del manager seleccionat per mostrar al camp
  const activeManagerData = useMemo(() => {
    if (selectedManagerId) {
      const found = managerStatsMap.get(String(selectedManagerId).toLowerCase())
      if (found) return found
    }
    return standings[0] || null
  }, [managerStatsMap, selectedManagerId, standings])

  const activeManagerRank = useMemo(() => {
    if (!activeManagerData) return '-'
    const found = standings.find((s) => String(s.manager.id).toLowerCase() === String(activeManagerData.manager.id).toLowerCase())
    return found ? `#${found.rank}` : '-'
  }, [standings, activeManagerData])

  // Format de slots per al component Pitch
  const pitchSlots = useMemo(() => {
    const result = {
      PORTER: null,
      TANCA: null,
      ALA_1: null,
      ALA_2: null,
      PIVOT: null,
    }
    if (!activeManagerData || !activeManagerData.slots) return result

    activeManagerData.slots.forEach((ls) => {
      const card = cardsMap.get(String(ls.fantasy_card_id).toLowerCase())
      const player = card ? playersMap.get(String(card.club_player_id).toLowerCase()) : null
      if (!card && !player) return

      const ptsDisplay = activeManagerData.slotPoints ? activeManagerData.slotPoints[ls.slot] : '—'
      const posUpper = (player?.position || ls.slot.replace(/_\d+$/, '')).toUpperCase()

      result[ls.slot] = {
        name: player?.full_name || 'Jugador',
        position: posUpper,
        dorsal: player?.dorsal,
        totalPoints: ptsDisplay !== undefined ? ptsDisplay : '—',
        price: card?.current_price || 0,
        isForSale: card?.status === 'market',
      }
    })

    return result
  }, [activeManagerData, cardsMap, playersMap])

  // Resultats dels equips del club a la jornada seleccionada
  const clubTeamResults = useMemo(() => {
    if (!selectedMatchday) return []

    return teams.map((team) => {
      const teamPlayerIdSet = new Set(
        players
          .filter((p) => String(p.team_id).toLowerCase() === String(team.id).toLowerCase())
          .map((p) => String(p.id).toLowerCase())
      )

      const teamStats = allStats.filter(
        (s) =>
          String(s.matchday_id).toLowerCase() === String(selectedMatchday.id).toLowerCase() &&
          (teamPlayerIdSet.has(String(s.club_player_id).toLowerCase()) ||
            String(playerTeamMap.get(String(s.club_player_id).toLowerCase())).toLowerCase() === String(team.id).toLowerCase())
      )

      let result = null
      let score = null
      let opponentName = null
      let isHome = true

      for (const s of teamStats) {
        if (!result && s.match_result) result = s.match_result
        if (!score && s.match_score) score = s.match_score
        if (!opponentName && s.opponent_name) opponentName = s.opponent_name
        if (s.is_home !== undefined && s.is_home !== null) isHome = s.is_home
      }

      const logKey = `${String(team.id).toLowerCase()}_${String(selectedMatchday.id).toLowerCase()}`
      const log = logResults[logKey]
      if (log) {
        if (!result && log.result) result = log.result
        if (!score && log.score) score = log.score
        if (!opponentName && log.opponent) opponentName = log.opponent
        if (log.venue) isHome = log.venue === 'home'
      }

      if (!result && score) {
        const parts = String(score).split('-').map((x) => Number(x.trim()))
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          if (parts[0] > parts[1]) result = 'win'
          else if (parts[0] === parts[1]) result = 'draw'
          else result = 'loss'
        }
      }

      const hasPlayed = !!(
        result ||
        score ||
        teamStats.some((s) => s.attended || s.points > 0 || s.goals > 0 || s.assists > 0 || s.saves > 0 || s.match_result || s.match_score)
      )

      return {
        team,
        result,
        score,
        opponentName: cleanOpponentName(opponentName),
        isHome,
        hasPlayed,
      }
    })
  }, [teams, selectedMatchday, allStats, logResults, playerTeamMap, players])

  // Llista de jornades ordenades de la 1 a l'última (a dalt la 1, a baix l'última)
  const sortedMatchdays = useMemo(() => {
    return [...matchdays].sort((a, b) => a.number - b.number)
  }, [matchdays])

  // Dades per al Popup Modal de l'Equip seleccionat
  const modalTeamData = useMemo(() => {
    if (!selectedTeamModal || !selectedMatchday) return null

    const matchInfo = clubTeamResults.find(
      (r) => String(r.team.id).toLowerCase() === String(selectedTeamModal.id).toLowerCase()
    ) || {
      team: selectedTeamModal,
      result: null,
      score: null,
      opponentName: 'Rival',
      isHome: true,
      hasPlayed: false,
    }

    const teamPlayerIdSet = new Set(
      players
        .filter((p) => String(p.team_id).toLowerCase() === String(selectedTeamModal.id).toLowerCase())
        .map((p) => String(p.id).toLowerCase())
    )

    // Últims 5 partits (Forma) fins a la jornada seleccionada
    const regularMatchdays = [...matchdays].filter((m) => !m.is_extra).sort((a, b) => a.number - b.number)
    const currIdx = regularMatchdays.findIndex((m) => String(m.id).toLowerCase() === String(selectedMatchday.id).toLowerCase())
    const relevantMds = currIdx >= 0
      ? regularMatchdays.slice(Math.max(0, currIdx - 4), currIdx + 1)
      : regularMatchdays.slice(-5)

    // Padded a 5 caselles
    const last5 = []
    for (let i = 0; i < 5; i++) {
      const m = relevantMds[i]
      if (!m) {
        last5.push({ key: `empty-${i}`, empty: true })
      } else {
        const tStats = allStats.filter(
          (s) =>
            String(s.matchday_id).toLowerCase() === String(m.id).toLowerCase() &&
            (teamPlayerIdSet.has(String(s.club_player_id).toLowerCase()) ||
              String(playerTeamMap.get(String(s.club_player_id).toLowerCase())).toLowerCase() === String(selectedTeamModal.id).toLowerCase())
        )

        let res = null
        let sc = null
        for (const st of tStats) {
          if (!res && st.match_result) res = st.match_result
          if (!sc && st.match_score) sc = st.match_score
        }
        if (!res || !sc) {
          const log = logResults[`${String(selectedTeamModal.id).toLowerCase()}_${String(m.id).toLowerCase()}`]
          if (log) {
            if (!res && log.result) res = log.result
            if (!sc && log.score) sc = log.score
          }
        }

        last5.push({
          key: m.id,
          label: m.label || `Jornada ${m.number}`,
          result: res,
          score: sc,
          isCurrent: String(m.id).toLowerCase() === String(selectedMatchday.id).toLowerCase(),
        })
      }
    }

    // Jugadors de l'equip a la jornada seleccionada
    const teamPlayers = players.filter(
      (p) => String(p.team_id).toLowerCase() === String(selectedTeamModal.id).toLowerCase()
    )

    const playerRows = teamPlayers.map((p) => {
      const stat = playerStatsMap.get(`${String(p.id).toLowerCase()}_${String(selectedMatchday.id).toLowerCase()}`)
      const attended = stat?.attended ?? false
      const points = stat ? (attended ? Number(stat.points) || 0 : '—') : '—'
      const goals = Number(stat?.goals) || 0
      const assists = Number(stat?.assists) || 0
      const saves = Number(stat?.saves) || 0
      const yellowCards = Number(stat?.yellow_cards ?? stat?.cards) || 0
      const redCards = Number(stat?.red_cards) || 0

      return {
        ...p,
        stat,
        attended,
        points,
        goals,
        assists,
        saves,
        yellowCards,
        redCards,
      }
    })

    // Ordenar: primer els convocats per punts desc, després no convocats
    playerRows.sort((a, b) => {
      if (a.attended && !b.attended) return -1
      if (!a.attended && b.attended) return 1
      const ptsA = typeof a.points === 'number' ? a.points : -99
      const ptsB = typeof b.points === 'number' ? b.points : -99
      if (ptsB !== ptsA) return ptsB - ptsA
      return (a.full_name || '').localeCompare(b.full_name || '')
    })

    return {
      team: selectedTeamModal,
      matchInfo,
      last5,
      players: playerRows,
    }
  }, [selectedTeamModal, selectedMatchday, clubTeamResults, matchdays, allStats, playerTeamMap, logResults, players, playerStatsMap])

  return (
    <div className="min-h-screen pb-12">
      <Topbar
        title="Jornades"
        subtitle="Consulta les puntuacions, el cinc titular i els marcadors de cada jornada"
      />

      <div className="p-4 sm:p-8 space-y-6 max-w-7xl mx-auto">
        <DemoBanner />

        {/* Selector de Jornada i Estat */}
        <div className="card p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📅</span>
            <div>
              <label className="text-xs text-ink-dim block font-medium">Jornada</label>
              <div className="flex items-center gap-2 mt-0.5">
                <select
                  value={selectedMatchdayId}
                  onChange={(e) => setSelectedMatchdayId(e.target.value)}
                  style={{ backgroundColor: '#121B2E', color: '#FFFFFF', colorScheme: 'dark' }}
                  className="py-1 px-2.5 text-xs sm:text-sm font-medium cursor-pointer text-white bg-[#121B2E] border border-[#243252] rounded-lg outline-none focus:border-accent"
                >
                  {sortedMatchdays.map((m) => (
                    <option
                      key={m.id}
                      value={m.id}
                      style={{ backgroundColor: '#121B2E', color: '#FFFFFF' }}
                      className="bg-[#121B2E] text-white py-1 text-xs sm:text-sm font-normal"
                    >
                      {m.label || `Jornada ${m.number}`}
                      {m.is_extra ? ' ⭐ (Extra)' : ''}
                    </option>
                  ))}
                </select>

                {matchdayStatus.isInProgress ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    En curs
                  </span>
                ) : matchdayStatus.isFinished ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-base-raised text-ink-dim border border-base-border">
                    Finalitzada
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Propera
                  </span>
                )}
              </div>
            </div>
          </div>

          {selectedMatchday?.starts_at && (
            <div className="text-xs text-ink-dim flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-base-border/50">
              <span className="text-ink-faint">Dates:</span>
              <span className="font-medium text-white">
                {new Date(selectedMatchday.starts_at).toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' })}
                {selectedMatchday.ends_at && ` - ${new Date(selectedMatchday.ends_at).toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' })}`}
              </span>
            </div>
          )}
        </div>

        {/* ESTAT: Carregant o Jornada que encara no ha començat */}
        {loading ? (
          <div className="card p-12 text-center text-ink-dim">
            <p className="animate-pulse">Carregant dades de la jornada…</p>
          </div>
        ) : matchdayStatus.isFuture && !matchdayStatus.hasStats ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Columna Esquerra: Camp de futbol buit (sense jugadors) */}
            <div className="lg:col-span-5 card p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-base-border/70 pb-3">
                <div>
                  <h3 className="font-display font-bold text-base text-ink flex items-center gap-1.5">
                    <span>🏟️</span> Cinc Titular
                  </h3>
                  <p className="text-xs text-ink-dim mt-0.5">
                    Alineació de la jornada
                  </p>
                </div>
                <span className="text-[11px] text-amber-400 font-medium">
                  ⏳ Pendent d'inici
                </span>
              </div>

              <div className="pt-1">
                <Pitch slots={{}} />
              </div>
            </div>

            {/* Columna Dreta: Missatge de jornada no començada i botó de Calendari */}
            <div className="lg:col-span-7 card p-8 sm:p-14 text-center flex flex-col items-center justify-center space-y-4 min-h-[380px] border-dashed">
              <div className="w-16 h-16 rounded-full bg-accent/10 border border-accent/30 text-accent text-3xl flex items-center justify-center mx-auto">
                ⏳
              </div>
              <div className="space-y-1.5 max-w-sm mx-auto">
                <h3 className="font-display font-bold text-lg sm:text-xl text-ink">
                  Aquesta jornada encara no ha començat!
                </h3>
                <p className="text-xs sm:text-sm text-ink-dim">
                  Les alineacions, puntuacions i classificacions d'aquesta jornada s'activaran automàticament tan bon punt es disputin els partits.
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setToast({ msg: 'El calendari complet de la temporada estarà disponible properament.', type: 'ok' })}
                  className="btn-secondary px-6 py-2.5 text-sm font-semibold inline-flex items-center gap-2"
                >
                  <span>🗓️</span>
                  <span>Calendari</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ESTAT: Jornada jugada o en curs */
          <div className="space-y-6">
            {/* Grid Principal: Camp 5 Titular + Classificació de la Jornada */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Columna Esquerra: Dibuix del Camp de Futbol (Pitch) */}
              <div className="lg:col-span-5 card p-4 sm:p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-base-border/70 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-bold text-base text-ink flex items-center gap-1.5">
                        <span>🏟️</span> Cinc Titular
                      </h3>
                      {activeManagerData && (
                        <span className="text-xs text-ink-dim font-medium">
                          ({activeManagerData.manager.display_name}{activeManagerData.manager.id === manager?.id ? ' · Tu' : ''})
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-dim mt-0.5">
                      Puntuacions individuals d'aquesta jornada
                    </p>
                  </div>
                  <span className="text-[11px] text-ink-faint">
                    {matchdayStatus.isInProgress ? '⏳ En curs' : matchdayStatus.isFinished ? '✓ Finalitzat' : '⏳ Propera'}
                  </span>
                </div>

                {/* Punts i Posició de la jornada directament a sota del títol */}
                {activeManagerData && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-base-surface border border-base-border text-center">
                      <p className="text-[11px] text-ink-dim font-semibold uppercase tracking-wider">Punts</p>
                      <p className="text-xl sm:text-2xl font-display font-bold text-yellow-400 mt-0.5" style={{ color: '#FACC15' }}>
                        {activeManagerData.matchdayPoints}
                        <span className="text-xs font-normal text-ink-dim ml-1">pts</span>
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-base-surface border border-base-border text-center">
                      <p className="text-[11px] text-ink-dim font-semibold uppercase tracking-wider">Posició</p>
                      <p className="text-xl sm:text-2xl font-display font-bold text-white mt-0.5">
                        {activeManagerRank}
                      </p>
                    </div>
                  </div>
                )}

                <div className="pt-1">
                  <Pitch slots={pitchSlots} />
                </div>

                <div className="p-3 rounded-xl bg-base-surface/80 border border-base-border text-[11px] text-ink-dim flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block"></span> Punts jornada
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-700 text-amber-300 text-[8px] flex items-center justify-center font-bold">⏳</span> Pendent
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-800 text-zinc-400 text-[8px] flex items-center justify-center font-bold">—</span> No ha jugat
                  </span>
                </div>
              </div>

              {/* Columna Dreta: Classificació de la Jornada */}
              <div className="lg:col-span-7 card p-4 sm:p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-base-border/70 pb-3">
                  <div>
                    <h3 className="font-display font-bold text-base text-ink flex items-center gap-1.5">
                      <span>🏆</span> Classificació de la Jornada
                    </h3>
                    <p className="text-xs text-ink-dim mt-0.5">
                      Clica sobre un manager per veure el seu cinc titular
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-base-border text-ink-dim text-xs font-medium">
                        <th className="py-2.5 px-3 w-12 text-center">Pos</th>
                        <th className="py-2.5 px-3">Manager</th>
                        <th className="py-2.5 px-3 text-right">Punts Jornada</th>
                        <th className="py-2.5 px-3 text-right">Acumulat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-base-border/50">
                      {standings.map((row) => {
                        const isSelected = String(row.manager.id).toLowerCase() === String(selectedManagerId).toLowerCase()
                        const isMe = String(row.manager.id).toLowerCase() === String(manager?.id).toLowerCase()

                        return (
                          <tr
                            key={row.manager.id}
                            onClick={() => setSelectedManagerId(row.manager.id)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-accent/15 font-semibold text-ink'
                                : 'hover:bg-base-raised/60 text-ink-dim hover:text-ink'
                            }`}
                          >
                            <td className="py-3 px-3 text-center font-display font-bold">
                              {row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `#${row.rank}`}
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-lg shrink-0">{row.manager.avatar_emoji || '⚽'}</span>
                                <span className="truncate font-medium text-ink">
                                  {row.manager.display_name}
                                </span>
                                {isMe && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-yellow-400 text-black font-bold shrink-0">
                                    TU
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-display font-bold text-yellow-400 text-base" style={{ color: '#FACC15' }}>
                              {row.matchdayPoints}
                              {row.waitingCount > 0 && (
                                <span className="text-xs text-amber-300/80 font-normal ml-1" title={`${row.waitingCount} jugadors pendents de jugar`}>
                                  (+{row.waitingCount}⏳)
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-display text-ink-dim text-xs sm:text-sm">
                              {row.accumulatedPoints} pts
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Secció Inferior: Resultats dels Equips del Club a la Jornada */}
            <div className="card p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-base-border/70 pb-3">
                <div>
                  <h3 className="font-display font-bold text-base sm:text-lg text-ink flex items-center gap-2">
                    <span>⚽</span> Resultats dels Equips del Club
                  </h3>
                  <p className="text-xs text-ink-dim mt-0.5">
                    Marcadors de tots els equips del Vincit a la {selectedMatchday?.label || `Jornada ${selectedMatchday?.number}`} · Clica sobre un equip per veure el detall
                  </p>
                </div>
                <span className="text-[11px] text-accent font-medium hidden sm:inline-block">
                  🔍 Clica per a detalls del partit
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {clubTeamResults.map(({ team, result, score, opponentName, isHome, hasPlayed }) => {
                  const resBg =
                    result === 'win'
                      ? 'bg-ok/10 border-ok/30 text-ok'
                      : result === 'draw'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : result === 'loss'
                      ? 'bg-danger/10 border-danger/30 text-danger'
                      : 'bg-base-surface border-base-border text-ink-faint'

                  const resBadge =
                    result === 'win' ? '✓ Victòria' : result === 'draw' ? '= Empat' : result === 'loss' ? '✕ Derrota' : 'Pendent'

                  return (
                    <div
                      key={team.id}
                      onClick={() => setSelectedTeamModal(team)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && setSelectedTeamModal(team)}
                      className={`p-3.5 sm:p-4 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all hover:scale-[1.01] hover:border-accent/60 group shadow-sm ${
                        hasPlayed ? 'bg-base-surface border-base-border hover:bg-base-raised/70' : 'bg-base-surface/50 border-base-border/50 opacity-80 hover:opacity-100 hover:bg-base-surface'
                      }`}
                    >
                      <div className="min-w-0">
                        {/* Nom de l'equip del Vincit en groc */}
                        <p
                          className="font-display font-bold text-sm sm:text-base truncate"
                          style={{ color: '#FACC15' }}
                        >
                          {team.name}
                        </p>
                        <p className="text-[11px] text-ink-dim capitalize mt-0.5">
                          {team.category || 'Futbol Sala'}
                          {opponentName && opponentName !== 'Rival' && (
                            <span className="text-ink-faint ml-1">
                              · vs {opponentName} ({isHome ? 'Local' : 'Visitant'})
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        {score ? (
                          <span className="font-display font-bold text-base sm:text-lg text-ink tracking-wider bg-base-raised px-2.5 py-0.5 rounded-lg border border-base-border group-hover:border-accent/40">
                            {isHome
                              ? score
                              : (() => {
                                  const parts = String(score).split('-')
                                  if (parts.length === 2) {
                                    return `${parts[1].trim()} - ${parts[0].trim()}`
                                  }
                                  return score
                                })()}
                          </span>
                        ) : null}
                        <span className={`text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full border font-semibold ${resBg}`}>
                          {resBadge}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* POPUP MODAL: Detalls del Partit de l'Equip */}
      {modalTeamData && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedTeamModal(null)
          }}
        >
          <div className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-5 border border-base-border shadow-2xl relative bg-base-surface">
            {/* Botó tancar */}
            <button
              type="button"
              onClick={() => setSelectedTeamModal(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-base-raised border border-base-border text-ink-dim hover:text-ink hover:bg-base-border transition-colors flex items-center justify-center text-sm font-bold"
              aria-label="Tancar finestra"
            >
              ✕
            </button>

            {/* Capçalera del Modal */}
            <div className="pr-8">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚽</span>
                <div>
                  <h3 className="font-display font-bold text-lg sm:text-xl text-yellow-400" style={{ color: '#FACC15' }}>
                    {modalTeamData.team.name}
                  </h3>
                  <p className="text-xs text-ink-dim">
                    {modalTeamData.team.category || 'Futbol Sala'} · {selectedMatchday?.label || `Jornada ${selectedMatchday?.number}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Marcador del partit: Ordre Casa (esquerra) vs Visitant (dreta) */}
            {(() => {
              const isHome = modalTeamData.matchInfo.isHome !== false
              const vincitGoals = modalTeamData.matchInfo.score
                ? modalTeamData.matchInfo.score.split('-')[0]?.trim() || '0'
                : '-'
              const opponentGoals = modalTeamData.matchInfo.score
                ? modalTeamData.matchInfo.score.split('-')[1]?.trim() || '0'
                : '-'

              const vincitFullName = formatVincitTeamName(modalTeamData.team.name)
              const oppCleanName = cleanOpponentName(modalTeamData.matchInfo.opponentName)

              const homeName = isHome ? vincitFullName : oppCleanName
              const homeIsVincit = isHome
              const homeGoals = isHome ? vincitGoals : opponentGoals

              const awayName = !isHome ? vincitFullName : oppCleanName
              const awayIsVincit = !isHome
              const awayGoals = !isHome ? vincitGoals : opponentGoals

              return (
                <div className="p-4 rounded-xl bg-base-raised/70 border border-base-border space-y-3">
                  <div className="grid grid-cols-5 items-center text-center">
                    {/* Equip Casa (Local - Esquerra) */}
                    <div className="col-span-2 flex flex-col items-center justify-start">
                      <span className="text-[11px] font-semibold text-accent uppercase tracking-wider">
                        Local
                      </span>
                      <span
                        className="font-display font-bold text-xs sm:text-sm md:text-base leading-snug mt-1 text-center break-words px-1"
                        style={{ color: homeIsVincit ? '#FACC15' : '#FFFFFF' }}
                      >
                        {homeName}
                      </span>
                      {modalTeamData.matchInfo.score ? (
                        <span
                          className="text-2xl sm:text-4xl font-display font-bold mt-1"
                          style={{ color: homeIsVincit ? '#FACC15' : '#FFFFFF' }}
                        >
                          {homeGoals}
                        </span>
                      ) : (
                        <span className="text-lg font-display text-ink-faint mt-1">-</span>
                      )}
                    </div>

                    {/* VS */}
                    <div className="col-span-1 flex flex-col items-center justify-center">
                      <span className="font-display font-black text-xs sm:text-sm text-ink-faint bg-base-surface px-2 py-1 rounded border border-base-border">
                        VS
                      </span>
                    </div>

                    {/* Equip Visitant (Dreta) */}
                    <div className="col-span-2 flex flex-col items-center justify-start">
                      <span className="text-[11px] font-semibold text-ink-dim uppercase tracking-wider">
                        Visitant
                      </span>
                      <span
                        className="font-display font-bold text-xs sm:text-sm md:text-base leading-snug mt-1 text-center break-words px-1"
                        style={{ color: awayIsVincit ? '#FACC15' : '#FFFFFF' }}
                      >
                        {awayName}
                      </span>
                      {modalTeamData.matchInfo.score ? (
                        <span
                          className="text-2xl sm:text-4xl font-display font-bold mt-1"
                          style={{ color: awayIsVincit ? '#FACC15' : '#FFFFFF' }}
                        >
                          {awayGoals}
                        </span>
                      ) : (
                        <span className="text-lg font-display text-ink-faint mt-1">-</span>
                      )}
                    </div>
                  </div>

                  <div className="text-center pt-1 border-t border-base-border/50">
                    <span
                      className={`inline-block text-xs px-3 py-1 rounded-full border font-semibold ${
                        modalTeamData.matchInfo.result === 'win'
                          ? 'bg-ok/20 text-ok border-ok/40'
                          : modalTeamData.matchInfo.result === 'draw'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : modalTeamData.matchInfo.result === 'loss'
                          ? 'bg-danger/20 text-danger border-danger/40'
                          : 'bg-base-surface text-ink-dim border-base-border'
                      }`}
                    >
                      {modalTeamData.matchInfo.result === 'win'
                        ? '✓ Victòria'
                        : modalTeamData.matchInfo.result === 'draw'
                        ? '= Empat'
                        : modalTeamData.matchInfo.result === 'loss'
                        ? '✕ Derrota'
                        : '⏳ Partit pendent de disputar'}
                    </span>
                  </div>
                </div>
              )
            })()}

            {/* Barra de forma: Últims 5 partits */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-base-surface border border-base-border gap-2">
              <div>
                <span className="text-xs font-semibold text-ink block">Últims 5 partits</span>
                <span className="text-[11px] text-ink-dim">Trajectòria de l'equip fins a aquesta jornada</span>
              </div>

              <div className="flex items-center gap-1.5 self-end sm:self-center">
                {modalTeamData.last5.map((item) => {
                  if (item.empty) {
                    return (
                      <span
                        key={item.key}
                        className="w-7 h-7 rounded-lg bg-base-raised/40 border border-base-border/40 text-ink-faint flex items-center justify-center text-xs select-none"
                      >
                        ·
                      </span>
                    )
                  }

                  const badgeClass =
                    item.result === 'win'
                      ? 'bg-ok/20 text-ok border-ok/50'
                      : item.result === 'draw'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : item.result === 'loss'
                      ? 'bg-danger/20 text-danger border-danger/50'
                      : 'bg-base-raised text-ink-dim border-base-border'

                  const symbol =
                    item.result === 'win' ? '✓' : item.result === 'draw' ? '=' : item.result === 'loss' ? '✕' : '—'

                  return (
                    <span
                      key={item.key}
                      title={`${item.label}: ${item.result === 'win' ? 'Victòria' : item.result === 'draw' ? 'Empat' : item.result === 'loss' ? 'Derrota' : 'Pendent'}${item.score ? ` (${item.score})` : ''}`}
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold select-none shadow-sm transition-transform ${
                        item.isCurrent ? 'ring-2 ring-accent scale-105' : ''
                      } ${badgeClass}`}
                    >
                      {symbol}
                    </span>
                  )
                })}
              </div>
            </div>

            {/* Llistat de jugadors/es de l'equip i estadístiques */}
            {(() => {
              const isFemaleTeam =
                /femen[ií]/i.test(modalTeamData.team.category || '') ||
                /femen[ií]|fem/i.test(modalTeamData.team.name || '')

              const sectionTitle = isFemaleTeam ? 'Rendiment de les jugadores' : 'Rendiment dels jugadors'
              const attendedCount = modalTeamData.players.filter((p) => p.attended).length
              const attendedText = isFemaleTeam ? `${attendedCount} convocades` : `${attendedCount} convocats`
              const colPlayer = isFemaleTeam ? 'Jugadora' : 'Jugador'
              const notAttendedText = isFemaleTeam ? 'No convocada / No ha jugat' : 'No convocat / No ha jugat'
              const emptyTeamText = isFemaleTeam
                ? 'No hi ha jugadores registrades en aquest equip.'
                : 'No hi ha jugadors registrats en aquest equip.'

              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-display font-semibold text-sm text-ink flex items-center gap-1.5">
                      <span>👥</span> {sectionTitle}
                    </h4>
                    <span className="text-xs text-ink-dim">{attendedText}</span>
                  </div>

                  {modalTeamData.players.length === 0 ? (
                    <p className="text-xs text-ink-dim py-4 text-center">{emptyTeamText}</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-base-border">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead>
                          <tr className="border-b border-base-border bg-base-raised/50 text-ink-dim text-[11px] font-medium uppercase">
                            <th className="py-2.5 px-3">{colPlayer}</th>
                            <th className="py-2.5 px-2 text-center">Pos</th>
                            <th className="py-2.5 px-2 text-center" title="Gols marcats">⚽ Gols</th>
                            <th className="py-2.5 px-2 text-center" title="Assistències">👟 Asis</th>
                            <th className="py-2.5 px-2 text-center" title="Parades">🧤 Par</th>
                            <th className="py-2.5 px-2 text-center" title="Targetes">Targetes</th>
                            <th className="py-2.5 px-3 text-right font-bold">Punts</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-base-border/50 bg-base-surface">
                          {modalTeamData.players.map((p) => {
                            const pos = POS_CONFIG[p.position?.toUpperCase()] || {
                              short: p.position || 'JUG',
                              emoji: '⚽',
                              badge: 'bg-base-raised text-ink-dim border-base-border',
                            }

                            return (
                              <tr
                                key={p.id}
                                className={`transition-colors ${
                                  p.attended ? 'hover:bg-base-raised/50 text-ink' : 'opacity-50 bg-base-raised/20 text-ink-dim'
                                }`}
                              >
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2">
                                    <Jersey number={p.dorsal} className="w-6 h-6 sm:w-7 sm:h-7 shrink-0" />
                                    <div className="min-w-0">
                                      <div className="font-medium text-xs sm:text-sm leading-snug break-words">
                                        {p.full_name}
                                      </div>
                                      {!p.attended && (
                                        <span className="text-[10px] text-ink-faint block leading-tight">{notAttendedText}</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2.5 px-2 text-center">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${pos.badge}`}>
                                    {pos.short}
                                  </span>
                                </td>
                                <td className="py-2.5 px-2 text-center font-display font-semibold">
                                  {p.attended && p.goals > 0 ? (
                                    <span className="text-emerald-400 font-bold">{p.goals}</span>
                                  ) : (
                                    <span className="text-ink-faint">0</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-2 text-center font-display font-semibold">
                                  {p.attended && p.assists > 0 ? (
                                    <span className="text-cyan-400 font-bold">{p.assists}</span>
                                  ) : (
                                    <span className="text-ink-faint">0</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-2 text-center font-display font-semibold">
                                  {p.attended && p.saves > 0 ? (
                                    <span className="text-purple-400 font-bold">{p.saves}</span>
                                  ) : (
                                    <span className="text-ink-faint">0</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-2 text-center font-display font-semibold text-sm">
                                  {p.attended ? (
                                    p.redCards > 0 ? (
                                      <span title="Targeta Vermella">🟥</span>
                                    ) : p.yellowCards > 0 ? (
                                      <span title="Targeta Groga">🟨</span>
                                    ) : (
                                      <span className="text-ink-faint">—</span>
                                    )
                                  ) : (
                                    <span className="text-ink-faint">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-display font-bold text-sm">
                                  {p.attended && typeof p.points === 'number' ? (
                                    <span className="text-yellow-400 font-bold" style={{ color: '#FACC15' }}>
                                      {p.points} pts
                                    </span>
                                  ) : (
                                    <span className="text-ink-dim">—</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast({ msg: '', type: 'ok' })} />
    </div>
  )
}
