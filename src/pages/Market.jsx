import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { resolveExpiredMarketListings } from '../lib/marketUtils'
import { getMockMarketData } from '../lib/mockData'
import { fetchGameSettings, DEFAULT_GAME_SETTINGS } from '../lib/settingsUtils'
import Topbar from '../components/Topbar'
import Toast from '../components/Toast'
import Jersey from '../components/Jersey'
import DemoBanner from '../components/DemoBanner'

function timeLeft(expiresAt) {
  if (!expiresAt) return null
  const diffMs = new Date(expiresAt).getTime() - Date.now()
  if (diffMs <= 0) return 'Expirat'
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return '< 1m'
}

function formatRelativeTime(dateString) {
  if (!dateString) return ''
  const diffMs = Date.now() - new Date(dateString).getTime()
  if (diffMs <= 0) return 'Ara mateix'
  const mins = Math.floor(diffMs / (1000 * 60))
  if (mins < 1) return 'Ara mateix'
  if (mins < 60) return `fa ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `fa ${hours}h`
  const days = Math.floor(hours / 24)
  return `fa ${days}d`
}

function getPlayerTotalPoints(player) {
  if (!player?.player_matchday_stats || !Array.isArray(player.player_matchday_stats)) return 0
  return player.player_matchday_stats
    .filter((s) => !s.matchdays?.is_extra)
    .reduce((sum, s) => sum + (Number(s.points) || 0), 0)
}

const POS_BADGES = {
  PORTER: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  TANCA: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  ALA: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  PIVOT: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
}

const POS_EMOJIS = {
  PORTER: '🧤',
  TANCA: '🛡️',
  ALA: '⚡',
  PIVOT: '🎯',
}

export default function Market() {
  const { manager } = useAuth()
  const [activeTab, setActiveTab] = useState('vendes') // 'vendes' | 'ofertes'

  const [listings, setListings] = useState([])
  const [sentOffers, setSentOffers] = useState([])
  const [receivedOffers, setReceivedOffers] = useState([])
  const [allMarketOffers, setAllMarketOffers] = useState([])
  const [mySquadCount, setMySquadCount] = useState(0)
  const [settings, setSettings] = useState(DEFAULT_GAME_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [showAuctionInfo, setShowAuctionInfo] = useState(() => {
    return localStorage.getItem('fantasy_hide_auction_info') !== 'true'
  })
  const [showMaxPlayersInfo, setShowMaxPlayersInfo] = useState(() => {
    return localStorage.getItem('fantasy_hide_max_players_info') !== 'true'
  })

  function handleCloseAuctionInfo() {
    setShowAuctionInfo(false)
    localStorage.setItem('fantasy_hide_auction_info', 'true')
  }

  function handleCloseMaxPlayersInfo() {
    setShowMaxPlayersInfo(false)
    localStorage.setItem('fantasy_hide_max_players_info', 'true')
  }

  function handleToggleInfo() {
    if (!showAuctionInfo || !showMaxPlayersInfo) {
      setShowAuctionInfo(true)
      setShowMaxPlayersInfo(true)
      localStorage.removeItem('fantasy_hide_auction_info')
      localStorage.removeItem('fantasy_hide_max_players_info')
    } else {
      setShowAuctionInfo(false)
      setShowMaxPlayersInfo(false)
      localStorage.setItem('fantasy_hide_auction_info', 'true')
      localStorage.setItem('fantasy_hide_max_players_info', 'true')
    }
  }

  // Modals
  const [selectedCardForOffer, setSelectedCardForOffer] = useState(null)
  const [selectedOfferForCounter, setSelectedOfferForCounter] = useState(null)
  const [confirmModal, setConfirmModal] = useState(null) // Modal personalitzat de confirmació
  const [toast, setToast] = useState({ msg: '', type: 'ok' })

  // Filtres per a la pestanya de Vendes
  const [searchTerm, setSearchTerm] = useState('')
  const [posFilter, setPosFilter] = useState('ALL')
  const [teamFilter, setTeamFilter] = useState('ALL')

  async function loadData() {
    setLoading(true)
    try {
      // Carregar configuració de joc
      const gameSettings = await fetchGameSettings()
      setSettings(gameSettings)

      if (!manager) {
        setListings(getMockMarketData())
        setSentOffers([])
        setReceivedOffers([])
        setAllMarketOffers([])
        setMySquadCount(0)
        setLoading(false)
        return
      }

      // 0. Resoldre fitxes expirades (subhastes de fitxes del club i retirada de jugadors expirats)
      await resolveExpiredMarketListings()

      // 1. Carregar fitxes del mercat (status = 'market')
      const { data: cardsData, error: cardsErr } = await supabase
        .from('fantasy_cards')
        .select(`
          id, current_price, status, market_listed_at, market_expires_at, owner_manager_id,
          club_players (
            id, full_name, position, dorsal, club_teams ( id, name ),
            player_matchday_stats (
              points,
              matchdays ( id, is_extra )
            )
          ),
          managers:owner_manager_id ( id, display_name, avatar_emoji )
        `)
        .eq('status', 'market')
        .order('current_price', { ascending: true })

      if (cardsErr) {
        console.warn('Avís carregant mercat amb managers join, provant fallback directe:', cardsErr.message)
        const fallbackRes = await supabase
          .from('fantasy_cards')
          .select(`
            id, current_price, status, market_listed_at, market_expires_at, owner_manager_id,
            club_players (
              id, full_name, position, dorsal, club_teams ( id, name ),
              player_matchday_stats (
                points,
                matchdays ( id, is_extra )
              )
            )
          `)
          .eq('status', 'market')
          .order('current_price', { ascending: true })

        setListings(fallbackRes.data || [])
      } else {
        setListings(cardsData || [])
      }

      // 2. Carregar ofertes enviades i rebudes de l'usuari actual de forma independent
      if (manager?.id) {
        // Ofertes enviades (inclou pendents, contraofertes, i resoltes pendents de descartar)
        try {
          const { data: sentData, error: sentErr } = await supabase
            .from('transfer_offers')
            .select(`
              id, fantasy_card_id, amount, counter_amount, counter_by, last_rejected_counter, status, created_at,
              fantasy_cards (
                id, current_price, market_expires_at, owner_manager_id, status,
                club_players (
                  id, full_name, position, dorsal, club_teams ( id, name ),
                  player_matchday_stats (
                    points,
                    matchdays ( id, is_extra )
                  )
                ),
                managers:owner_manager_id ( id, display_name, avatar_emoji )
              )
            `)
            .eq('bidder_manager_id', manager.id)
            .in('status', ['pending', 'countered', 'accepted', 'rejected'])
            .order('created_at', { ascending: false })

          if (!sentErr && sentData) {
            setSentOffers(sentData)
          } else {
            const fallbackSent = await supabase
              .from('transfer_offers')
              .select(`
                id, fantasy_card_id, amount, status, created_at,
                fantasy_cards (
                  id, current_price, market_expires_at, owner_manager_id, status,
                  club_players (
                    id, full_name, position, dorsal, club_teams ( id, name ),
                    player_matchday_stats (
                      points,
                      matchdays ( id, is_extra )
                    )
                  )
                )
              `)
              .eq('bidder_manager_id', manager.id)
              .in('status', ['pending', 'countered', 'accepted', 'rejected'])

            setSentOffers(fallbackSent.data || [])
          }
        } catch (e) {
          console.warn('Avís carregant ofertes enviades:', e)
        }

        // Ofertes rebudes
        try {
          const { data: myCards } = await supabase
            .from('fantasy_cards')
            .select('id')
            .eq('owner_manager_id', manager.id)

          const myCardIds = (myCards || []).map((c) => c.id)

          if (myCardIds.length > 0) {
            const { data: recvData, error: recvErr } = await supabase
              .from('transfer_offers')
              .select(`
                id, fantasy_card_id, amount, counter_amount, counter_by, last_rejected_counter, status, created_at, bidder_manager_id,
                managers:bidder_manager_id ( id, display_name, avatar_emoji, budget ),
                fantasy_cards (
                  id, current_price, market_expires_at, owner_manager_id, status,
                  club_players (
                    id, full_name, position, dorsal, club_teams ( id, name ),
                    player_matchday_stats (
                      points,
                      matchdays ( id, is_extra )
                    )
                  )
                )
              `)
              .in('fantasy_card_id', myCardIds)
              .in('status', ['pending', 'countered'])
              .order('created_at', { ascending: false })

            if (!recvErr && recvData) {
              setReceivedOffers(recvData)
            } else {
              const fallbackRecv = await supabase
                .from('transfer_offers')
                .select(`
                  id, fantasy_card_id, amount, status, created_at, bidder_manager_id,
                  managers:bidder_manager_id ( id, display_name, avatar_emoji, budget ),
                  fantasy_cards (
                    id, current_price, market_expires_at, owner_manager_id, status,
                    club_players (
                      id, full_name, position, dorsal, club_teams ( id, name ),
                      player_matchday_stats (
                        points,
                        matchdays ( id, is_extra )
                      )
                    )
                  )
                `)
                .in('fantasy_card_id', myCardIds)
                .eq('status', 'pending')

              setReceivedOffers(fallbackRecv.data || [])
            }
          } else {
            setReceivedOffers([])
          }
        } catch (e) {
          console.warn('Avís carregant ofertes rebudes:', e)
        }

        // 3. Carregar nombre de jugadors en propietat del manager
        try {
          const { count } = await supabase
            .from('fantasy_cards')
            .select('id', { count: 'exact', head: true })
            .eq('owner_manager_id', manager.id)
          setMySquadCount(count || 0)
        } catch (e) {
          console.warn('Avís comptant plantilla:', e)
        }
      }

      // 4. Carregar totes les ofertes pendents del mercat per comptabilitzar o mostrar pujes
      try {
        const { data: allOffers } = await supabase
          .from('transfer_offers')
          .select(`
            id, fantasy_card_id, amount, status, created_at, bidder_manager_id,
            managers:bidder_manager_id ( id, display_name, avatar_emoji )
          `)
          .eq('status', 'pending')
          .order('amount', { ascending: false })
        setAllMarketOffers(allOffers || [])
      } catch (e) {
        console.warn('Avís carregant ofertes globals del mercat:', e)
      }
    } catch (err) {
      console.error('Error general carregant dades del mercat:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [manager?.id])

  // Llista d'equips únics per al filtre
  const teamsList = useMemo(() => {
    const map = new Map()
    listings.forEach((c) => {
      const t = c.club_players?.club_teams
      if (t?.id && !map.has(t.id)) {
        map.set(t.id, t.name)
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [listings])

  // Llistat filtrat de vendes
  const filteredListings = useMemo(() => {
    const now = Date.now()
    const isNoMarket = settings.market_mode === 'no_market'
    return listings.filter((card) => {
      // Si estem en mode subhastes ('no_market'), amagar totes les fitxes posades a la venda per managers (només subhastes oficials del club)
      if (isNoMarket && card.owner_manager_id) return false

      // Excloure jugadors que ja hagin expirat del mercat
      if (card.market_expires_at) {
        const expTime = new Date(card.market_expires_at).getTime()
        if (!isNaN(expTime) && expTime <= now) return false
      }
      const player = card.club_players
      const nameMatch = !searchTerm || player?.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
      const posMatch = posFilter === 'ALL' || player?.position?.toUpperCase() === posFilter
      const teamMatch = teamFilter === 'ALL' || player?.club_teams?.id === teamFilter
      return nameMatch && posMatch && teamMatch
    })
  }, [listings, searchTerm, posFilter, teamFilter, settings.market_mode])

  // Equips prohibits per a fitxatges de l'usuari actual (el seu propi equip o els que entrena)
  const forbiddenTeamIds = useMemo(() => {
    if (!manager) return new Set()
    const set = new Set()
    if (manager.player_team_id) {
      set.add(manager.player_team_id)
    }
    if (manager.coach_assignments?.length) {
      manager.coach_assignments.forEach((ca) => {
        if (ca.team_id) set.add(ca.team_id)
      })
    }
    return set
  }, [manager])

  // Trobar l'oferta activa prèvia d'una fitxa (només pendents o amb contraoferta)
  function getMyOfferForCard(cardId) {
    return sentOffers.find(
      (o) => o.fantasy_card_id === cardId && (o.status === 'pending' || o.status === 'countered')
    )
  }

  // Mapatge d'ofertes/pujes per cada fitxa del mercat
  const bidsByCardId = useMemo(() => {
    const map = new Map()
    allMarketOffers.forEach((o) => {
      const arr = map.get(o.fantasy_card_id) || []
      arr.push(o)
      map.set(o.fantasy_card_id, arr)
    })
    return map
  }, [allMarketOffers])

  // Total de diners compromesos en totes les ofertes actives enviades
  const totalCommittedOffers = useMemo(() => {
    return (sentOffers || [])
      .filter((o) => o.status === 'pending' || o.status === 'countered')
      .reduce((sum, o) => {
        const amt = o.status === 'countered' && o.counter_amount ? Number(o.counter_amount) : Number(o.amount)
        return sum + (amt || 0)
      }, 0)
  }, [sentOffers])

  // Separar ofertes pendents/actives dels avisos d'ofertes ja resoltes (acceptades / rebutjades)
  const pendingSentOffers = useMemo(() => {
    return (sentOffers || []).filter((o) => o.status === 'pending' || o.status === 'countered')
  }, [sentOffers])

  const resolvedSentOffers = useMemo(() => {
    return (sentOffers || []).filter((o) => o.status === 'accepted' || o.status === 'rejected')
  }, [sentOffers])

  const totalAvailableBudget = Math.max(0, (manager?.budget || 0) - totalCommittedOffers)

  // Descartar avís d'oferta resolta (acceptada o rebutjada)
  async function handleDismissResolvedOffer(offer) {
    try {
      const { error } = await supabase
        .from('transfer_offers')
        .delete()
        .eq('id', offer.id)

      if (error) {
        console.warn('Avís descartant oferta:', error.message)
      }

      setSentOffers((prev) => prev.filter((o) => o.id !== offer.id))
      setToast({ msg: 'Avís descartat.', type: 'ok' })
    } catch (err) {
      setSentOffers((prev) => prev.filter((o) => o.id !== offer.id))
    }
  }

  // Obre modal de confirmació per acceptar oferta rebuda
  function openAcceptReceivedOfferModal(offer) {
    const card = offer.fantasy_cards
    const player = card?.club_players
    const isClubOffer = !offer.bidder_manager_id
    const bidder = offer.managers || (isClubOffer ? { display_name: '🏛️ El Club', avatar_emoji: '🏛️' } : null)
    const buyerName = isClubOffer ? '🏛️ El Club' : (bidder?.display_name || 'El comprador')
    const buyerEmoji = isClubOffer ? '🏛️' : (bidder?.avatar_emoji || '👤')
    const playerName = player?.full_name || 'el jugador'
    const amount = offer.amount

    setConfirmModal({
      icon: isClubOffer ? '🏛️' : '🤝',
      title: isClubOffer ? "Acceptar oferta del Club" : "Acceptar oferta de traspàs",
      subtitle: isClubOffer ? "Venda oficial al Club" : "Estàs a punt de vendre aquest jugador",
      playerName,
      teamName: player?.club_teams?.name,
      position: player?.position,
      amount: `${amount}M`,
      amountLabel: "Preu de venda",
      partyLabel: "Comprador",
      partyName: buyerName,
      partyEmoji: buyerEmoji,
      description: isClubOffer
        ? `En acceptar, ${playerName} tornarà a la borsa de jugadors del club (sense propietari) i rebràs ${amount}M directament al teu pressupost.`
        : `En acceptar, ${playerName} serà traspassat immediatament a ${buyerName} i rebràs ${amount}M directament al teu pressupost.`,
      confirmText: `✓ Sí, acceptar i vendre (${amount}M)`,
      confirmStyle: 'btn-primary',
      onConfirm: async () => {
        try {
          let errorOccurred = false
          try {
            const { error: rpcErr } = await supabase.rpc('accept_transfer_offer', { p_offer_id: offer.id })
            if (rpcErr) errorOccurred = true
          } catch {
            errorOccurred = true
          }

          if (errorOccurred) {
            // Fallback directe
            await supabase.from('fantasy_cards').update({
              owner_manager_id: isClubOffer ? null : offer.bidder_manager_id,
              status: 'owned',
              current_price: amount,
              market_listed_at: null,
              market_expires_at: null,
            }).eq('id', offer.fantasy_card_id)

            if (!isClubOffer && offer.bidder_manager_id) {
              await supabase.from('managers').update({ budget: (bidder?.budget || 0) - amount }).eq('id', offer.bidder_manager_id)
            }
            await supabase.from('managers').update({ budget: (manager.budget || 0) + Number(amount) }).eq('id', manager.id)

            await supabase.from('transfer_offers').update({ status: 'accepted', resolved_at: new Date().toISOString() }).eq('id', offer.id)
            await supabase.from('transfer_offers').update({ status: 'rejected', resolved_at: new Date().toISOString() }).eq('fantasy_card_id', offer.fantasy_card_id).neq('id', offer.id)

            await supabase.from('activity_log').insert({
              manager_id: isClubOffer ? null : offer.bidder_manager_id,
              type: 'purchase',
              message: `${buyerName} ha comprat a ${playerName} de ${manager.display_name} per ${amount}M`,
            })
          }

          setToast({
            msg: `🎉 Has acceptat l'oferta! Has venut ${playerName} a ${buyerName} per ${amount}M.`,
            type: 'ok',
          })
          setConfirmModal(null)
          loadData()
        } catch (err) {
          setToast({ msg: err.message || "Error acceptant l'oferta", type: 'error' })
        }
      },
    })
  }

  // Obre modal de confirmació per rebutjar oferta rebuda
  function openRejectReceivedOfferModal(offer) {
    const card = offer.fantasy_cards
    const player = card?.club_players
    const isClubOffer = !offer.bidder_manager_id
    const bidder = offer.managers || (isClubOffer ? { display_name: '🏛️ El Club', avatar_emoji: '🏛️' } : null)
    const buyerName = isClubOffer ? '🏛️ El Club' : (bidder?.display_name || 'El comprador')
    const buyerEmoji = isClubOffer ? '🏛️' : (bidder?.avatar_emoji || '👤')
    const playerName = player?.full_name || 'el jugador'

    setConfirmModal({
      icon: '✕',
      iconBg: 'bg-danger/20 text-danger border border-danger/40',
      title: "Rebutjar oferta",
      subtitle: "Descartar l'oferta rebuda",
      playerName,
      teamName: player?.club_teams?.name,
      position: player?.position,
      amount: `${offer.amount}M`,
      amountLabel: "Oferta rebuda",
      partyLabel: "Comprador",
      partyName: buyerName,
      partyEmoji: buyerEmoji,
      description: `Segur que vols rebutjar l'oferta de ${offer.amount}M de ${buyerName}? El jugador seguirà a la teva plantilla o a la venda.`,
      confirmText: "✕ Sí, rebutjar oferta",
      confirmStyle: 'bg-danger hover:bg-danger/90 text-white border-none',
      onConfirm: async () => {
        try {
          const { error } = await supabase.rpc('reject_transfer_offer', { p_offer_id: offer.id })
          if (error) {
            await supabase.from('transfer_offers').update({ status: 'rejected', resolved_at: new Date().toISOString() }).eq('id', offer.id)
          }

          setToast({
            msg: `S'ha rebutjat l'oferta de ${buyerName} per ${playerName}.`,
            type: 'ok',
          })
          setConfirmModal(null)
          loadData()
        } catch (err) {
          setToast({ msg: err.message || "Error rebutjant l'oferta", type: 'error' })
        }
      },
    })
  }

  // Obre modal de confirmació per acceptar contraoferta
  function openAcceptCounterOfferModal(offer) {
    const card = offer.fantasy_cards
    const player = card?.club_players
    const seller = card?.managers
    const sellerName = seller?.display_name || 'El venedor'
    const playerName = player?.full_name || 'el jugador'
    const counterAmount = offer.counter_amount

    setConfirmModal({
      icon: '🎯',
      title: "Acceptar contraoferta",
      subtitle: "Completar el fitxatge pel nou preu acordat",
      playerName,
      teamName: player?.club_teams?.name,
      position: player?.position,
      amount: `${counterAmount}M`,
      amountLabel: "Preu acordat",
      partyLabel: "Venedor",
      partyName: sellerName,
      partyEmoji: seller?.avatar_emoji || '👤',
      description: `En acceptar la contraoferta, es descomptaran ${counterAmount}M del teu pressupost i fitxaràs ${playerName} al teu equip a l'instant.`,
      confirmText: `✓ Sí, fitxar per ${counterAmount}M`,
      confirmStyle: 'btn-primary',
      onConfirm: async () => {
        try {
          const { error: rpcErr } = await supabase.rpc('accept_counter_offer', { p_offer_id: offer.id })
          if (rpcErr) {
            // Fallback directe
            await supabase.from('fantasy_cards').update({
              owner_manager_id: manager.id,
              status: 'owned',
              current_price: counterAmount,
              market_listed_at: null,
              market_expires_at: null,
            }).eq('id', offer.fantasy_card_id)

            await supabase.from('managers').update({ budget: (manager.budget || 0) - counterAmount }).eq('id', manager.id)
            if (card?.owner_manager_id) {
              const { data: sellerMgr } = await supabase.from('managers').select('budget').eq('id', card.owner_manager_id).single()
              await supabase.from('managers').update({ budget: (sellerMgr?.budget || 0) + Number(counterAmount) }).eq('id', card.owner_manager_id)
            }

            await supabase.from('transfer_offers').update({ amount: counterAmount, status: 'accepted', resolved_at: new Date().toISOString() }).eq('id', offer.id)
            await supabase.from('transfer_offers').update({ status: 'rejected', resolved_at: new Date().toISOString() }).eq('fantasy_card_id', offer.fantasy_card_id).neq('id', offer.id)
          }

          setToast({
            msg: `🎉 Enhorabona! Has fitxat ${playerName} per ${counterAmount}M acceptant la contraoferta.`,
            type: 'ok',
          })
          setConfirmModal(null)
          loadData()
        } catch (err) {
          setToast({ msg: err.message || 'Error acceptant la contraoferta', type: 'error' })
        }
      },
    })
  }

  // Obre modal de confirmació per rebutjar contraoferta
  function openRejectCounterOfferModal(offer) {
    const card = offer.fantasy_cards
    const player = card?.club_players
    const seller = card?.managers
    const sellerName = seller?.display_name || 'El venedor'
    const playerName = player?.full_name || 'el jugador'
    const counterAmount = offer.counter_amount
    const originalAmount = offer.amount

    setConfirmModal({
      icon: '↩️',
      iconBg: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
      title: "Rebutjar contraoferta",
      subtitle: `Mantenir l'oferta inicial de ${originalAmount}M`,
      playerName,
      teamName: player?.club_teams?.name,
      position: player?.position,
      amount: `${counterAmount}M`,
      amountLabel: "Contraoferta",
      partyLabel: "Venedor",
      partyName: sellerName,
      partyEmoji: seller?.avatar_emoji || '👤',
      description: `Si rebutges la contraoferta de ${counterAmount}M, no es cancel·larà la negociació: es mantindrà la teva oferta inicial de ${originalAmount}M activa perquè el venedor la pugui acceptar o enviar-te una altra proposta.`,
      confirmText: `↩️ Rebutjar contraoferta (Mantenir ${originalAmount}M)`,
      confirmStyle: 'btn-primary',
      onConfirm: async () => {
        try {
          const { error: rpcErr } = await supabase.rpc('reject_counter_offer', { p_offer_id: offer.id })
          if (rpcErr) {
            // Fallback directe
            await supabase
              .from('transfer_offers')
              .update({
                status: 'pending',
                last_rejected_counter: counterAmount,
                counter_amount: null,
                counter_by: null,
              })
              .eq('id', offer.id)
          }

          setToast({
            msg: `Has rebutjat la contraoferta de ${counterAmount}M. La teva oferta de ${originalAmount}M segueix activa.`,
            type: 'ok',
          })
          setConfirmModal(null)
          loadData()
        } catch (err) {
          setToast({ msg: err.message || 'Error rebutjant la contraoferta', type: 'error' })
        }
      },
    })
  }

  const isNoMarketMode = settings.market_mode === 'no_market'

  return (
    <div>
      <Topbar
        title={
          <div className="flex items-center gap-2.5">
            <span>{isNoMarketMode ? 'Mercat de fitxatges · Subhastes' : 'Mercat de fitxatges'}</span>
            {(isNoMarketMode || settings.max_players_mode) && (
              <button
                type="button"
                onClick={handleToggleInfo}
                title={
                  showAuctionInfo || showMaxPlayersInfo
                    ? 'Amagar informació del mode'
                    : 'Més informació sobre les normes i el mode de joc'
                }
                className="w-4 h-4 rounded-full bg-white/10 hover:bg-accent/20 text-white/70 hover:text-accent text-[11px] font-bold flex items-center justify-center transition-colors cursor-pointer border border-white/20"
              >
                i
              </button>
            )}
          </div>
        }
        subtitle={
          isNoMarketMode
            ? "Subhastes oficials del club gestionades per l'administració"
            : 'Compra, ven jugadors i gestiona les teves ofertes i contraofertes'
        }
      />

      <DemoBanner className="mx-4 mt-4 sm:mx-8 sm:mt-6" />

      {/* Navegació entre Pestanyes: Vendes/Subhastes vs Ofertes/Pujes */}
      <div className="px-4 pt-4 sm:px-8 sm:pt-6 flex gap-2 border-b border-base-border overflow-x-auto pb-1 -mb-px">
        <button
          onClick={() => setActiveTab('vendes')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap min-h-[40px] flex items-center gap-2 ${
            activeTab === 'vendes'
              ? 'border-accent text-accent font-semibold'
              : 'border-transparent text-ink-dim hover:text-ink'
          }`}
        >
          <span>{isNoMarketMode ? '🏛️' : '🏷️'}</span>
          <span>{isNoMarketMode ? 'Subhastes actives' : 'Vendes'}</span>
          {listings.length > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-base-raised text-ink-dim font-medium">
              {listings.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('ofertes')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap min-h-[40px] flex items-center gap-2 ${
            activeTab === 'ofertes'
              ? 'border-accent text-accent font-semibold'
              : 'border-transparent text-ink-dim hover:text-ink'
          }`}
        >
          <span>{isNoMarketMode ? '💰' : '💼'}</span>
          <span>{isNoMarketMode ? 'Les meves pujes' : 'Ofertes'}</span>
          {receivedOffers.length > 0 && !isNoMarketMode && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent text-[#0B1220] ml-0.5 animate-pulse">
              {receivedOffers.length} rebudes
            </span>
          )}
          {pendingSentOffers.length > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-base-raised text-ink-dim font-medium">
              {pendingSentOffers.length}
            </span>
          )}
        </button>
      </div>

      <div className="p-4 sm:p-8 space-y-5 sm:space-y-6">
        {/* Banner informatiu de modes de joc actius */}
        {isNoMarketMode && showAuctionInfo && (
          <div className="p-3.5 sm:p-4 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-start justify-between gap-3 text-xs sm:text-sm text-blue-200 animate-fade-in shadow-sm">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <span className="text-xl shrink-0 mt-0.5">🏛️</span>
              <div className="space-y-0.5 min-w-0">
                <p className="font-semibold text-white">Mode Subhastes actiu</p>
                <p className="text-xs text-blue-200/90 leading-relaxed">
                  Els jugadors que veus han estat posats a subhasta per l'administrador del club.
                  {settings.anonymous_bids
                    ? ' Les pujes són anònimes i secretes. Al finalitzar el temps, el jugador serà adjudicat automàticament al mànager amb la puja més alta.'
                    : ' Les pujes són públiques i visibles per a tothom.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCloseAuctionInfo}
              title="Tancar recordatori"
              className="text-blue-300/60 hover:text-blue-200 hover:bg-blue-500/20 p-1 rounded-lg text-sm transition-colors shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        {settings.max_players_mode && showMaxPlayersInfo && (
          <div className="p-3.5 sm:p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start justify-between gap-3 text-xs sm:text-sm text-amber-200 animate-fade-in shadow-sm">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <span className="text-xl shrink-0 mt-0.5">🛡️</span>
              <div className="space-y-0.5 min-w-0">
                <p className="font-semibold text-amber-100">
                  Mode "Màxim 5 jugadors" actiu ({mySquadCount}/5 a la plantilla{pendingSentOffers.length > 0 && ` · ${pendingSentOffers.length} ${pendingSentOffers.length === 1 ? 'oferta en curs' : 'ofertes en curs'}`})
                </p>
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  {mySquadCount >= 5
                    ? 'Ja tens 5 jugadors a la teva plantilla. No pots fer noves ofertes ni fitxar més jugadors.'
                    : (mySquadCount + pendingSentOffers.length >= 5)
                    ? `Tens ${mySquadCount} jugadors a la plantilla i ${pendingSentOffers.length} ofertes en curs. No pots obrir més ofertes per altres jugadors simultàniament a menys que retiris alguna oferta prèvia.`
                    : `Pots tenir un màxim de 5 jugadors. Amb ${mySquadCount} jugadors a la plantilla i ${pendingSentOffers.length} ofertes actives, pots fer fins a ${5 - mySquadCount - pendingSentOffers.length} noves ofertes.`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCloseMaxPlayersInfo}
              title="Tancar recordatori"
              className="text-amber-300/60 hover:text-amber-200 hover:bg-amber-500/20 p-1 rounded-lg text-sm transition-colors shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        {/* ================================================================= */}
        {/* PESTANYA 1: VENDES / SUBHASTES (Llistat general de jugadors)     */}
        {/* ================================================================= */}
        {activeTab === 'vendes' && (
          <div className="space-y-5 sm:space-y-6">
            {/* Barra superior de filtres i estat d'usuari */}
            <div className="card p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2.5 flex-1">
                <input
                  type="text"
                  placeholder="Cercar per nom de jugador…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input text-sm min-h-[42px] w-full sm:w-60"
                />

                <select
                  value={posFilter}
                  onChange={(e) => setPosFilter(e.target.value)}
                  className="input text-sm min-h-[42px] w-full sm:w-48"
                >
                  <option value="ALL">Totes les posicions</option>
                  <option value="PORTER">🧤 Porter</option>
                  <option value="TANCA">🛡️ Tanca</option>
                  <option value="ALA">⚡ Ala</option>
                  <option value="PIVOT">🎯 Pivot</option>
                </select>

                {teamsList.length > 0 && (
                  <select
                    value={teamFilter}
                    onChange={(e) => setTeamFilter(e.target.value)}
                    className="input text-sm min-h-[42px] w-full sm:w-52"
                  >
                    <option value="ALL">Tots els equips</option>
                    {teamsList.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}

                {(searchTerm || posFilter !== 'ALL' || teamFilter !== 'ALL') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('')
                      setPosFilter('ALL')
                      setTeamFilter('ALL')
                    }}
                    className="btn-ghost text-xs py-2 px-3 min-h-[40px] text-ink-dim hover:text-ink"
                  >
                    Netejar filtres
                  </button>
                )}
              </div>

              {manager && (
                <div className="flex items-center gap-2.5 bg-base-surface border border-base-border px-3.5 py-2 rounded-xl shrink-0 self-start md:self-auto">
                  <span className="text-lg">{manager.avatar_emoji || '⚽'}</span>
                  <div>
                    <p className="text-[11px] text-ink-dim leading-none">Pressupost lliure</p>
                    <p className="text-sm font-display font-bold text-yellow-400 mt-0.5" style={{ color: '#FACC15' }}>
                      {totalAvailableBudget.toFixed(1)}M
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Llistat de jugadors al mercat / subhasta */}
            {loading ? (
              <p className="text-ink-dim text-sm py-8 text-center">Carregant jugadors…</p>
            ) : filteredListings.length === 0 ? (
              <div className="card p-8 sm:p-12 text-center text-ink-dim text-sm space-y-2">
                <p className="text-base font-semibold text-ink">
                  {isNoMarketMode ? 'No hi ha cap subhasta activa' : "No s'ha trobat cap jugador al mercat"}
                </p>
                <p className="text-xs text-ink-faint">
                  {searchTerm || posFilter !== 'ALL' || teamFilter !== 'ALL'
                    ? 'Prova de canviar els filtres de cerca.'
                    : isNoMarketMode
                    ? "L'administrador publicarà nous jugadors a subhasta pròximament."
                    : 'No hi ha cap fitxa a la venda actualment. Torna-ho a comprovar aviat!'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredListings.map((card) => {
                  const player = card.club_players
                  const pos = player?.position?.toUpperCase()
                  const isOwner = manager && card.owner_manager_id === manager.id
                  const myOffer = getMyOfferForCard(card.id)
                  const posBadge = POS_BADGES[pos] || 'bg-base-raised text-ink border-base-border'
                  const playerTeamId = player?.club_teams?.id
                  const isForbiddenTeam = forbiddenTeamIds.has(playerTeamId)
                  const isOwnPlayedTeam = manager?.player_team_id === playerTeamId
                  const totalPts = getPlayerTotalPoints(player)

                  // Dades de subhastes i pujes
                  const cardOffers = bidsByCardId.get(card.id) || []
                  const highestBid = cardOffers.reduce((max, o) => Math.max(max, Number(o.amount) || 0), 0)
                  const isMaxSquadLimitReached = Boolean(
                    settings.max_players_mode && !myOffer && (mySquadCount + pendingSentOffers.length) >= 5
                  )

                  return (
                    <div
                      key={card.id}
                      className={`card p-4 sm:p-5 flex flex-col justify-between gap-3.5 border transition-all ${
                        myOffer
                          ? 'border-accent/50 bg-base-raised/60'
                          : isOwner
                          ? 'border-base-border/70 bg-base-raised/40 opacity-95'
                          : isForbiddenTeam
                          ? 'border-base-border/60 bg-base-raised/20 opacity-80'
                          : 'hover:border-accent/40'
                      }`}
                    >
                      <div>
                        {/* Capçalera de la targeta */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Jersey number={player?.dorsal} className="w-14 h-14 sm:w-16 sm:h-16 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-display font-bold text-ink text-lg sm:text-xl truncate leading-tight">
                                {player?.full_name}
                              </p>
                              <p className="text-xs text-ink-dim mt-0.5 truncate">
                                {player?.club_teams?.name || 'Club'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              title={`Punts acumulats: ${totalPts} pts (jornades normals)`}
                              className="min-w-[26px] h-6 sm:min-w-[28px] sm:h-7 px-1.5 rounded-full text-xs font-display font-bold bg-yellow-400 text-black border border-yellow-300 shadow-sm flex items-center justify-center select-none"
                            >
                              {totalPts}
                            </span>
                            <span className={`text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full border font-semibold flex items-center gap-1 ${posBadge}`}>
                              <span>{player?.position}</span>
                              <span className="select-none">{POS_EMOJIS[pos] || '⚽'}</span>
                            </span>
                          </div>
                        </div>

                        {/* Preu i temps restant */}
                        <div className="flex items-end justify-between mt-3 pt-3 border-t border-base-border/70">
                          <div>
                            {isNoMarketMode ? (
                              settings.anonymous_bids ? (
                                <>
                                  <p className="text-[11px] text-ink-faint">Subhasta cega</p>
                                  <p className="font-display text-base font-bold text-yellow-400" style={{ color: '#FACC15' }}>
                                    Pujes anònimes
                                  </p>
                                  <p className="text-[10px] text-ink-dim mt-0.5 font-medium">
                                    {cardOffers.length} {cardOffers.length === 1 ? 'puja registrada' : 'pujes registrades'}
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="text-[11px] text-ink-faint">
                                    {highestBid > 0 ? 'Puja més alta' : 'Subhasta pública'}
                                  </p>
                                  <p className="font-display text-xl font-bold text-yellow-400" style={{ color: highestBid > 0 ? '#FACC15' : 'inherit' }}>
                                    {highestBid > 0 ? `${highestBid}M` : 'Sense pujes'}
                                  </p>
                                  <p className="text-[10px] text-ink-dim mt-0.5 font-medium">
                                    {cardOffers.length > 0
                                      ? `${cardOffers.length} ${cardOffers.length === 1 ? 'persona ha pujat' : 'persones han pujat'}`
                                      : 'Cap persona ha pujat'}
                                  </p>
                                </>
                              )
                            ) : (
                              <>
                                <p className="text-[11px] text-ink-faint">Preu de sortida</p>
                                <p className="font-display text-xl font-bold text-yellow-400" style={{ color: '#FACC15' }}>
                                  {card.current_price}M
                                </p>
                              </>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] text-ink-faint">Temps restant</p>
                            <p className="text-xs text-ink-dim font-medium">
                              {timeLeft(card.market_expires_at)}
                            </p>
                          </div>
                        </div>

                        {/* Propietari / Estat */}
                        <div className="mt-2.5 text-xs text-ink-dim flex items-center justify-between">
                          {card.managers ? (
                            <span className="text-ink-faint">
                              Propietari: <strong className="text-ink font-semibold">{card.managers.display_name}</strong>
                            </span>
                          ) : (
                            <span className="text-ink-faint">
                              {isNoMarketMode ? '🏛️ Subhasta del Club' : 'Sense propietari (Club)'}
                            </span>
                          )}

                          {myOffer && (
                            <span className="text-[11px] px-2 py-0.5 rounded bg-accent/20 text-yellow-400 font-semibold" style={{ color: '#FACC15' }}>
                              {myOffer.status === 'countered'
                                ? `Contraoferta: ${myOffer.counter_amount}M`
                                : `La teva puja: ${myOffer.amount}M`}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botó d'acció */}
                      <div className="pt-2">
                        {isOwner ? (
                          <div className="w-full py-2.5 px-3 rounded-xl bg-base-raised text-center text-xs text-ink-dim border border-base-border font-medium">
                            El teu jugador a la venda
                          </div>
                        ) : isForbiddenTeam ? (
                          <div
                            title="Com a norma del joc, no pots fitxar jugadors de l'equip on jugues o dels equips que entrenes."
                            className="w-full py-2.5 px-3 rounded-xl bg-base-raised/70 text-center text-xs text-ink-dim border border-base-border/70 font-medium flex items-center justify-center gap-1.5 cursor-not-allowed select-none"
                          >
                            <span>🚫</span>
                            <span>{isOwnPlayedTeam ? 'És el teu equip' : 'Equip que entrenes'}</span>
                          </div>
                        ) : isMaxSquadLimitReached ? (
                          <div
                            title={`Has assolit el límit de 5 jugadors (${mySquadCount} a la plantilla + ${pendingSentOffers.length} ofertes en curs).`}
                            className="w-full py-2.5 px-3 rounded-xl bg-amber-500/10 text-center text-xs text-amber-300 border border-amber-500/30 font-semibold flex items-center justify-center gap-1.5 cursor-not-allowed select-none"
                          >
                            <span>🛡️</span>
                            <span>Límit de 5 jugadors assolit ({mySquadCount + pendingSentOffers.length}/5)</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (!manager) {
                                setToast({ msg: "Has d'iniciar sessió per poder fer ofertes o pujar al mercat.", type: 'err' })
                                return
                              }
                              setSelectedCardForOffer(card)
                            }}
                            className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs sm:text-sm min-h-[44px] flex items-center justify-center gap-1.5 transition-all ${
                              myOffer
                                ? 'bg-accent/20 hover:bg-accent/30 text-accent border border-accent/40'
                                : 'btn-primary'
                            }`}
                          >
                            <span>💰</span>
                            <span>
                              {myOffer
                                ? `Modificar ${isNoMarketMode ? 'puja' : 'oferta'} (${myOffer.amount}M)`
                                : isNoMarketMode
                                ? 'Pujar per aquest jugador'
                                : 'Fer una oferta'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* PESTANYA 2: OFERTES (Ofertes rebudes pels meus jugadors + Enviades) */}
        {/* ================================================================= */}
        {activeTab === 'ofertes' && (
          <div className="space-y-8">
            {/* SECCIÓ A: OFERTES REBUDES (Només en mode mercat actiu) */}
            {!isNoMarketMode && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-base-border pb-3">
                  <div>
                    <h3 className="font-display font-semibold text-lg text-ink flex items-center gap-2">
                      <span>📥</span> Ofertes rebudes ({receivedOffers.length})
                    </h3>
                    <p className="text-xs text-ink-dim mt-0.5">
                      Ofertes que altres usuaris han fet pels teus jugadors. Pots acceptar-les directament, rebutjar-les o fer una contraoferta.
                    </p>
                  </div>
                </div>

                {loading ? (
                  <p className="text-ink-dim text-sm py-4">Carregant ofertes rebudes…</p>
                ) : receivedOffers.length === 0 ? (
                  <div className="card p-6 text-center text-ink-dim text-sm space-y-1">
                    <p className="font-semibold text-ink">No tens cap oferta rebuda pendent</p>
                    <p className="text-xs text-ink-faint">
                      Quan posis jugadors a la venda i un altre mànager faci una oferta per ells, apareixerà aquí.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {receivedOffers.map((offer) => {
                      const card = offer.fantasy_cards
                      const player = card?.club_players
                      const isClubOffer = !offer.bidder_manager_id
                      const bidder = offer.managers || (isClubOffer ? { display_name: '🏛️ El Club', avatar_emoji: '🏛️' } : null)
                      const pos = player?.position?.toUpperCase()
                      const posBadge = POS_BADGES[pos] || 'bg-base-raised text-ink border-base-border'
                      const isCountered = offer.status === 'countered'
                      const totalPts = getPlayerTotalPoints(player)

                      return (
                        <div
                          key={offer.id}
                          className="card p-4 sm:p-5 flex flex-col justify-between gap-4 border border-base-border bg-base-raised/60 hover:border-accent/40 transition-all shadow-sm"
                        >
                          <div className="space-y-3">
                            {/* Capçalera jugador */}
                            <div className="flex items-start justify-between gap-2 border-b border-base-border/70 pb-3">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <Jersey number={player?.dorsal} className="w-14 h-14 sm:w-16 sm:h-16 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <p className="font-display font-bold text-ink text-lg sm:text-xl truncate leading-tight">
                                    {player?.full_name}
                                  </p>
                                  <p className="text-xs text-ink-dim mt-0.5 truncate">
                                    {player?.club_teams?.name || 'Club'} · Valor: <strong className="text-accent">{card?.current_price}M</strong>
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span
                                  title={`Punts acumulats: ${totalPts} pts (jornades normals)`}
                                  className="min-w-[26px] h-6 sm:min-w-[28px] sm:h-7 px-1.5 rounded-full text-xs font-display font-bold bg-yellow-400 text-black border border-yellow-300 shadow-sm flex items-center justify-center select-none"
                                >
                                  {totalPts}
                                </span>
                                <span className={`text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full border font-semibold flex items-center gap-1 ${posBadge}`}>
                                  <span>{player?.position}</span>
                                  <span className="select-none">{POS_EMOJIS[pos] || '⚽'}</span>
                                </span>
                              </div>
                            </div>

                            {/* Dades del postor i de l'oferta */}
                            <div className="flex items-center justify-between p-3 rounded-xl bg-base-surface border border-base-border">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-2xl">{bidder?.avatar_emoji || '👤'}</span>
                                <div className="min-w-0">
                                  <p className="text-xs text-ink-dim font-medium">Comprador interessat:</p>
                                  <p className="font-display font-semibold text-sm text-ink truncate">
                                    {bidder?.display_name}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[11px] text-ink-dim">Oferta rebuda</p>
                                <p className="font-display text-lg sm:text-xl font-bold text-yellow-400" style={{ color: '#FACC15' }}>
                                  {offer.amount}M
                                </p>
                              </div>
                            </div>

                            {/* Estat de contraoferta si escau */}
                            {isCountered ? (
                              <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                  <span>💬</span>
                                  <span>Contraoferta enviada: <strong>{offer.counter_amount}M</strong></span>
                                </span>
                                <span className="text-[11px] text-amber-200/80 italic">Esperant resposta</span>
                              </div>
                            ) : offer.last_rejected_counter ? (
                              <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-200 text-xs space-y-1 animate-fade-in">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold flex items-center gap-1.5 text-amber-100">
                                    <span>↩️</span> Contraoferta de {offer.last_rejected_counter}M no acceptada
                                  </span>
                                </div>
                                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                                  El comprador ha rebutjat la contraoferta anterior. La seva oferta inicial de <strong className="text-yellow-400">{offer.amount}M</strong> segueix vigent per si la vols acceptar o proposar una altra contraoferta.
                                </p>
                              </div>
                            ) : null}

                            <p className="text-[11px] text-ink-faint">
                              Rebuda: {new Date(offer.created_at).toLocaleString('ca-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>

                          {/* Botons d'acció */}
                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-base-border/70">
                            <button
                              type="button"
                              onClick={() => openAcceptReceivedOfferModal(offer)}
                              className="btn-primary py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5"
                            >
                              <span>✓</span>
                              <span>Acceptar ({offer.amount}M)</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setSelectedOfferForCounter(offer)}
                              className="py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/40 flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <span>💬</span>
                              <span>Contraoferta</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => openRejectReceivedOfferModal(offer)}
                              className="py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-xl bg-danger/15 hover:bg-danger/25 text-danger border border-danger/40 flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <span>✕</span>
                              <span>Rebutjar</span>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SECCIÓ B: OFERTES / PUJES ENVIADES */}
            <div className={`space-y-6 ${!isNoMarketMode ? 'pt-4 border-t border-base-border' : ''}`}>
              {/* B1: Ofertes / Pujes pendents / en curs */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-base-border pb-3">
                  <div>
                    <h3 className="font-display font-semibold text-lg text-ink flex items-center gap-2">
                      <span>{isNoMarketMode ? '🏛️' : '📤'}</span>
                      <span>
                        {isNoMarketMode ? 'Pujes enviades en curs' : 'Ofertes enviades en curs'} ({pendingSentOffers.length})
                      </span>
                    </h3>
                    <p className="text-xs text-ink-dim mt-0.5">
                      {isNoMarketMode
                        ? 'Seguiment de les teves pujes actives a les subhastes del club.'
                        : 'Seguiment de les teves ofertes actives per jugadors al mercat o d\'altres mànagers.'}
                    </p>
                  </div>
                </div>

                {loading ? (
                  <p className="text-ink-dim text-sm py-4">
                    {isNoMarketMode ? 'Carregant pujes enviades…' : 'Carregant ofertes enviades…'}
                  </p>
                ) : pendingSentOffers.length === 0 ? (
                  <div className="card p-6 text-center text-ink-dim text-sm space-y-1">
                    <p className="font-semibold text-ink">
                      {isNoMarketMode ? 'No tens cap puja pendent en curs' : 'No tens cap oferta pendent en curs'}
                    </p>
                    <p className="text-xs text-ink-faint">
                      {isNoMarketMode
                        ? 'Explora la pestanya de Subhastes actives per trobar jugadors i fer la teva puja.'
                        : 'Explora la pestanya de Vendes per trobar nous jugadors i fer ofertes.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pendingSentOffers.map((offer) => {
                      const card = offer.fantasy_cards
                      const player = card?.club_players
                      const seller = card?.managers
                      const pos = player?.position?.toUpperCase()
                      const posBadge = POS_BADGES[pos] || 'bg-base-raised text-ink border-base-border'
                      const isCountered = offer.status === 'countered'
                      const totalPts = getPlayerTotalPoints(player)

                      return (
                        <div
                          key={offer.id}
                          className={`card p-4 sm:p-5 flex flex-col justify-between gap-4 border transition-all ${
                            isCountered
                              ? 'border-amber-500/60 bg-amber-500/10 shadow-md'
                              : 'border-base-border bg-base-raised/60'
                          }`}
                        >
                          <div className="space-y-3">
                            {/* Capçalera */}
                            <div className="flex items-start justify-between gap-2 border-b border-base-border/70 pb-3">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <Jersey number={player?.dorsal} className="w-14 h-14 sm:w-16 sm:h-16 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <p className="font-display font-bold text-ink text-lg sm:text-xl truncate leading-tight">
                                    {player?.full_name || 'Jugador'}
                                  </p>
                                  <p className="text-xs text-ink-dim mt-0.5 truncate">
                                    {player?.club_teams?.name || 'Club'}
                                    {!isNoMarketMode && (
                                      <> · Propietari: <strong className="text-ink">{seller?.display_name || 'Club (Lliure)'}</strong></>
                                    )}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span
                                  title={`Punts acumulats: ${totalPts} pts (jornades normals)`}
                                  className="min-w-[26px] h-6 sm:min-w-[28px] sm:h-7 px-1.5 rounded-full text-xs font-display font-bold bg-yellow-400 text-black border border-yellow-300 shadow-sm flex items-center justify-center select-none"
                                >
                                  {totalPts}
                                </span>
                                <span className={`text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full border font-semibold flex items-center gap-1 ${posBadge}`}>
                                  <span>{player?.position}</span>
                                  <span className="select-none">{POS_EMOJIS[pos] || '⚽'}</span>
                                </span>
                              </div>
                            </div>

                            {/* Oferta / Puja realitzada */}
                            <div className="flex items-center justify-between p-3 rounded-xl bg-base-surface border border-base-border">
                              <div>
                                <p className="text-[11px] text-ink-dim">
                                  {isNoMarketMode ? 'La teva puja enviada' : 'La teva oferta enviada'}
                                </p>
                                <p className="font-display text-lg font-bold text-yellow-400" style={{ color: '#FACC15' }}>
                                  {offer.amount}M
                                </p>
                              </div>
                              {!isNoMarketMode && (
                                <div className="text-right">
                                  <p className="text-[11px] text-ink-dim">Preu de sortida</p>
                                  <p className="text-sm font-semibold text-ink">
                                    {card?.current_price}M
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Notificació de contraoferta */}
                            {isCountered ? (
                              <div className="p-3.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold flex items-center gap-1.5 text-amber-100">
                                    <span>💬</span> Contraoferta rebuda!
                                  </span>
                                  <span className="font-display font-bold text-sm text-yellow-300" style={{ color: '#FACC15' }}>
                                    {offer.counter_amount}M
                                  </span>
                                </div>
                                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                                  El venedor ha rebutjat la teva oferta inicial i proposa traspassar el jugador per <strong>{offer.counter_amount}M</strong>.
                                </p>
                              </div>
                            ) : offer.last_rejected_counter ? (
                              <div className="p-2.5 rounded-xl bg-base-surface border border-base-border text-xs text-ink-dim flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                  <span>↩️</span>
                                  <span>Has rebutjat la contraoferta de {offer.last_rejected_counter}M. La teva oferta de <strong className="text-yellow-400">{offer.amount}M</strong> segueix activa.</span>
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between text-xs text-ink-dim pt-1">
                                <span>Estat: <strong className="text-ink">Pendent de resolució</strong></span>
                                <span>{card?.market_expires_at ? `Temps: ${timeLeft(card.market_expires_at)}` : ''}</span>
                              </div>
                            )}
                          </div>

                          {/* Botons d'acció per a ofertes pendents */}
                          <div className="pt-2 border-t border-base-border/70 flex flex-wrap gap-2">
                            {isCountered ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openAcceptCounterOfferModal(offer)}
                                  className="btn-primary flex-1 py-2.5 px-3 text-xs sm:text-sm font-semibold min-h-[40px] flex items-center justify-center gap-1.5"
                                >
                                  <span>✓</span>
                                  <span>Acceptar contraoferta ({offer.counter_amount}M)</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => openRejectCounterOfferModal(offer)}
                                  className="py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-xl bg-danger/15 hover:bg-danger/25 text-danger border border-danger/40 flex items-center justify-center gap-1.5 transition-colors"
                                >
                                  <span>✕</span>
                                  <span>Rebutjar</span>
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setSelectedCardForOffer(card)}
                                  className="btn-ghost flex-1 py-2.5 px-3 text-xs sm:text-sm font-semibold border border-base-border hover:border-accent/50 text-ink min-h-[40px] flex items-center justify-center gap-1.5"
                                >
                                  <span>✏️</span>
                                  <span>{isNoMarketMode ? 'Modificar puja' : 'Modificar oferta'}</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* B2: Avisos d'ofertes resoltes (Acceptades o Rebutjades) */}
              {resolvedSentOffers.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-base-border/80">
                  <div className="flex items-center justify-between border-b border-base-border pb-3">
                    <div>
                      <h3 className="font-display font-semibold text-lg text-ink flex items-center gap-2">
                        <span>🔔</span> Avisos d'ofertes resoltes ({resolvedSentOffers.length})
                      </h3>
                      <p className="text-xs text-ink-dim mt-0.5">
                        Notificacions de fitxatges acceptats o ofertes declinades. Pots descartar els avisos un cop revisats.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {resolvedSentOffers.map((offer) => {
                      const card = offer.fantasy_cards
                      const player = card?.club_players
                      const seller = card?.managers
                      const pos = player?.position?.toUpperCase()
                      const posBadge = POS_BADGES[pos] || 'bg-base-raised text-ink border-base-border'
                      const isAccepted = offer.status === 'accepted'

                      return (
                        <div
                          key={offer.id}
                          className={`card p-4 sm:p-5 flex flex-col justify-between gap-4 border transition-all ${
                            isAccepted
                              ? 'border-emerald-500/50 bg-emerald-950/20 shadow-md'
                              : 'border-danger/40 bg-danger/10'
                          }`}
                        >
                          <div className="space-y-3">
                            {/* Capçalera */}
                            <div className="flex items-start justify-between gap-2 border-b border-base-border/70 pb-3">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <Jersey number={player?.dorsal} className="w-12 h-12 sm:w-14 sm:h-14 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-display font-bold text-ink text-base truncate">
                                      {player?.full_name || 'Jugador'}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => handleDismissResolvedOffer(offer)}
                                      title="Descartar avís"
                                      className="text-ink-faint hover:text-ink text-xs p-1 rounded-lg hover:bg-base-surface transition-colors"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  <p className="text-xs text-ink-dim mt-0.5 truncate">
                                    {player?.club_teams?.name || 'Club'} · Propietari: <strong className="text-ink">{seller?.display_name || 'Club (Lliure)'}</strong>
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isAccepted ? (
                                  <span className="text-[10px] sm:text-[11px] px-2.5 py-0.5 rounded-full border font-semibold bg-emerald-500/20 text-emerald-300 border-emerald-500/40 flex items-center gap-1">
                                    <span>✓</span> Acceptada
                                  </span>
                                ) : (
                                  <span className="text-[10px] sm:text-[11px] px-2.5 py-0.5 rounded-full border font-semibold bg-danger/20 text-danger border-danger/40 flex items-center gap-1">
                                    <span>✕</span> Rebutjada
                                  </span>
                                )}
                                {pos && (
                                  <span className={`text-[10px] sm:text-[11px] px-2.5 py-0.5 rounded-full border font-semibold flex items-center gap-1 ${posBadge}`}>
                                    <span>{player?.position}</span>
                                    <span className="select-none">{POS_EMOJIS[pos] || '⚽'}</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Cos de l'avís */}
                            {isAccepted ? (
                              <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold flex items-center gap-1.5 text-emerald-100">
                                    <span>🎉</span> Fitxatge confirmat!
                                  </span>
                                  <span className="font-display font-bold text-sm text-emerald-300">
                                    {offer.amount}M
                                  </span>
                                </div>
                                <p className="text-[11px] text-emerald-200/90 leading-relaxed">
                                  Enhorabona! L'oferta de <strong>{offer.amount}M</strong> per <strong>{player?.full_name}</strong> ha estat acceptada. El jugador ja forma part de la teva plantilla!
                                </p>
                              </div>
                            ) : (
                              <div className="p-3.5 rounded-xl bg-danger/15 border border-danger/30 text-red-200 text-xs space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold flex items-center gap-1.5 text-red-100">
                                    <span>❌</span> Oferta no acceptada
                                  </span>
                                  <span className="font-display font-bold text-sm text-red-300">
                                    {offer.amount}M
                                  </span>
                                </div>
                                <p className="text-[11px] text-red-200/90 leading-relaxed">
                                  L'oferta de <strong>{offer.amount}M</strong> per <strong>{player?.full_name}</strong> ha estat rebutjada. El teu pressupost compromès ha estat alliberat.
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Botó per descartar avís */}
                          <div className="pt-2 border-t border-base-border/70">
                            <button
                              type="button"
                              onClick={() => handleDismissResolvedOffer(offer)}
                              className={`w-full py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-xl border flex items-center justify-center gap-1.5 transition-colors ${
                                isAccepted
                                  ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40 hover:bg-emerald-500/30'
                                  : 'bg-danger/15 text-danger border-danger/40 hover:bg-danger/25'
                              }`}
                            >
                              <span>✕</span>
                              <span>Descartar avís</span>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal per fer / modificar oferta */}
      {selectedCardForOffer && (
        <DirectOfferModal
          card={selectedCardForOffer}
          existingOffer={getMyOfferForCard(selectedCardForOffer.id)}
          cardBids={bidsByCardId.get(selectedCardForOffer.id) || []}
          userOffers={sentOffers}
          manager={manager}
          forbiddenTeamIds={forbiddenTeamIds}
          settings={settings}
          mySquadCount={mySquadCount}
          onClose={() => setSelectedCardForOffer(null)}
          onOfferSuccess={(msg) => {
            setSelectedCardForOffer(null)
            setToast({ msg, type: 'ok' })
            loadData()
          }}
        />
      )}

      {/* Modal per enviar una Contraoferta (Com a venedor) */}
      {selectedOfferForCounter && (
        <CounterOfferModal
          offer={selectedOfferForCounter}
          manager={manager}
          onClose={() => setSelectedOfferForCounter(null)}
          onSuccess={(msg) => {
            setSelectedOfferForCounter(null)
            setToast({ msg, type: 'ok' })
            loadData()
          }}
        />
      )}

      {/* Modal de Confirmació Personalitzat (substitueix el window.confirm) */}
      {confirmModal && (
        <ConfirmActionModal
          data={confirmModal}
          onClose={() => setConfirmModal(null)}
        />
      )}

      <Toast
        message={toast.msg}
        type={toast.type}
        onClose={() => setToast({ msg: '', type: 'ok' })}
      />
    </div>
  )
}

function ConfirmActionModal({ data, onClose }) {
  const [submitting, setSubmitting] = useState(false)

  async function handleConfirm() {
    setSubmitting(true)
    try {
      await data.onConfirm()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm"
    >
      <div className="card w-full max-w-md p-5 sm:p-6 space-y-4 relative shadow-2xl border border-base-border animate-scale-up">
        {/* Capçalera */}
        <div className="flex items-start justify-between border-b border-base-border pb-3.5 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 font-bold ${data.iconBg || 'bg-accent/20 text-accent border border-accent/40'}`}>
              {data.icon || '❓'}
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-semibold text-lg text-ink truncate leading-tight">
                {data.title}
              </h3>
              {data.subtitle && (
                <p className="text-xs text-ink-dim truncate mt-0.5">
                  {data.subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-ink-dim hover:text-ink text-lg p-1.5 rounded-lg bg-base-raised shrink-0 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Informació detallada de la transacció */}
        <div className="p-3.5 rounded-xl bg-base-surface border border-base-border space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-semibold text-sm text-ink truncate">{data.playerName}</p>
              <p className="text-xs text-ink-dim truncate">
                {data.teamName} {data.position && `· ${data.position}`}
              </p>
            </div>
            {data.amount && (
              <div className="text-right shrink-0">
                <p className="text-[10px] text-ink-dim uppercase font-medium">{data.amountLabel || 'Import'}</p>
                <p className="font-display font-bold text-yellow-400 text-base" style={{ color: '#FACC15' }}>
                  {data.amount}
                </p>
              </div>
            )}
          </div>

          {data.partyName && (
            <div className="flex items-center justify-between text-xs pt-2 border-t border-base-border/60">
              <span className="text-ink-dim">{data.partyLabel || 'Usuari'}:</span>
              <span className="font-semibold text-ink flex items-center gap-1.5">
                <span>{data.partyEmoji || '👤'}</span>
                <span>{data.partyName}</span>
              </span>
            </div>
          )}
        </div>

        {/* Explicació de l'acció */}
        {data.description && (
          <p className="text-xs text-ink-dim leading-relaxed bg-base-raised/60 p-3 rounded-xl border border-base-border/50">
            {data.description}
          </p>
        )}

        {/* Botons d'acció */}
        <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-base-border">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn-ghost py-2.5 px-4 text-xs sm:text-sm min-h-[42px] font-medium"
          >
            Cancel·lar
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className={`py-2.5 px-5 text-xs sm:text-sm font-semibold min-h-[42px] rounded-[10px] flex items-center justify-center gap-2 transition-all ${
              data.confirmStyle || 'btn-primary'
            }`}
          >
            {submitting ? 'Processant…' : data.confirmText || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CounterOfferModal({ offer, manager, onClose, onSuccess }) {
  const card = offer.fantasy_cards
  const player = card?.club_players
  const isClubOffer = !offer.bidder_manager_id
  const bidder = offer.managers || (isClubOffer ? { display_name: '🏛️ El Club', avatar_emoji: '🏛️' } : null)
  const bidderName = isClubOffer ? '🏛️ El Club' : (bidder?.display_name || 'el comprador')

  const [counterPrice, setCounterPrice] = useState(
    offer.counter_amount || (Number(offer.amount) + 1).toString()
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const numAmount = Number(counterPrice)
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Introdueix una quantitat vàlida superior a 0M')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      // 1. Intentar cridar l'RPC
      const { error: rpcErr } = await supabase.rpc('counter_transfer_offer', {
        p_offer_id: offer.id,
        p_counter_amount: numAmount,
      })

      if (rpcErr) {
        console.warn('Avís cridant counter_transfer_offer RPC, executant actualització directa:', rpcErr.message)
        // 2. Fallback directe per si la funció RPC no s'ha registrat a la cache de Supabase
        const { error: updErr } = await supabase
          .from('transfer_offers')
          .update({
            counter_amount: numAmount,
            counter_by: manager?.id || card?.owner_manager_id,
            status: 'countered',
          })
          .eq('id', offer.id)

        if (updErr) throw new Error(rpcErr.message || updErr.message)
      }

      onSuccess(`Contraoferta de ${numAmount}M enviada correctament a ${bidderName}!`)
    } catch (err) {
      setError(err.message || 'Error enviant la contraoferta')
      setSubmitting(false)
    }
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 animate-fade-in"
    >
      <div className="card w-full max-w-md p-5 sm:p-6 space-y-4 relative shadow-2xl border border-base-border">
        <div className="flex items-center justify-between border-b border-base-border pb-3">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-lg text-ink flex items-center gap-2">
              <span>💬</span> Fer una contraoferta
            </h3>
            <p className="text-xs text-ink-dim mt-0.5">
              Proposa un nou import a <strong>{bidderName}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-ink-dim hover:text-ink text-lg p-1.5 rounded-lg bg-base-raised"
          >
            ✕
          </button>
        </div>

        {/* Informació del jugador i oferta prèvia */}
        <div className="p-3.5 rounded-xl bg-base-raised border border-base-border/70 space-y-2">
          <div className="flex items-center gap-3">
            <Jersey number={player?.dorsal} className="w-12 h-12 shrink-0" />
            <div className="flex-1 min-w-0 flex items-center justify-between">
              <span className="font-semibold text-sm text-ink truncate">{player?.full_name}</span>
              <span className="text-xs text-ink-dim shrink-0">{player?.club_teams?.name}</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-base-border/60">
            <span className="text-ink-dim">Oferta rebuda del comprador:</span>
            <strong className="text-yellow-400 font-display font-bold" style={{ color: '#FACC15' }}>
              {offer.amount}M
            </strong>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-ink block mb-1.5">
              Import de la teva contraoferta (milions) *
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="999"
                value={counterPrice}
                onChange={(e) => setCounterPrice(e.target.value)}
                className="input text-base sm:text-lg font-display font-bold pr-10 min-h-[46px] text-yellow-400"
                style={{ color: '#FACC15' }}
                required
                autoFocus
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-display font-bold text-sm text-yellow-400" style={{ color: '#FACC15' }}>
                M
              </span>
            </div>
            <p className="text-[11px] text-ink-dim mt-1.5">
              Si el comprador l'accepta, el fitxatge es completarà immediatament per aquest import.
            </p>
          </div>

          {error && (
            <p className="text-danger text-xs bg-danger/10 border border-danger/30 p-2.5 rounded-lg">
              {error}
            </p>
          )}

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-base-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-ghost py-2.5 px-4 text-xs sm:text-sm min-h-[42px]"
            >
              Cancel·lar
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary py-2.5 px-5 text-xs sm:text-sm font-semibold min-h-[42px] rounded-[10px] flex items-center justify-center gap-1.5"
            >
              {submitting ? 'Enviant…' : `Enviar contraoferta (${counterPrice || 0}M)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DirectOfferModal({
  card,
  existingOffer,
  cardBids = [],
  userOffers = [],
  manager,
  forbiddenTeamIds,
  settings,
  mySquadCount = 0,
  onClose,
  onOfferSuccess,
}) {
  const player = Array.isArray(card?.club_players) ? card.club_players[0] : card?.club_players
  const isNoMarket = settings?.market_mode === 'no_market'
  const isVisibleAuction = isNoMarket && !settings?.anonymous_bids

  // Pujes ordenades de major a menor import
  const sortedCardBids = useMemo(() => {
    return [...cardBids].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
  }, [cardBids])

  const highestBid = sortedCardBids.length > 0 ? Number(sortedCardBids[0].amount) || 0 : 0
  const isCurrentlyHighestBidder = Boolean(
    existingOffer && highestBid > 0 && Number(existingOffer.amount) === highestBid
  )

  // En subhasta visible cal pujar mínim +1M sobre la puja més alta actual (excepte si ja ets el capdavanter i modifiques)
  const minPrice = useMemo(() => {
    if (isVisibleAuction) {
      if (highestBid > 0) {
        if (isCurrentlyHighestBidder) {
          return highestBid
        }
        return highestBid + 1
      }
      return 0.5
    }
    if (isNoMarket) {
      return 0.5
    }
    return Number(card?.current_price) || 1
  }, [isVisibleAuction, highestBid, isCurrentlyHighestBidder, isNoMarket, card?.current_price])

  const defaultAmount = existingOffer
    ? Number(existingOffer.amount)
    : (isVisibleAuction ? (highestBid > 0 ? highestBid + 1 : 1) : (isNoMarket ? 1 : minPrice))

  // Ofertes actives en altres jugadors del mercat (excloent aquest mateix si ja tenia oferta)
  const otherActiveOffers = useMemo(() => {
    return (userOffers || []).filter(
      (o) => o.fantasy_card_id !== card?.id && (o.status === 'pending' || o.status === 'countered')
    )
  }, [userOffers, card?.id])

  const otherOffersCount = otherActiveOffers.length
  const isMaxSquadLimit = Boolean(
    settings?.max_players_mode && !existingOffer && (mySquadCount + otherOffersCount) >= 5
  )

  const [amount, setAmount] = useState(defaultAmount)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const playerTeamId = player?.club_teams?.id
  const isForbidden = Boolean(playerTeamId && forbiddenTeamIds?.has(playerTeamId))

  // Total de les ofertes pendents en altres jugadors (excloent aquest mateix si ja tenia oferta prèvia)
  const otherOffersTotal = useMemo(() => {
    return otherActiveOffers.reduce((sum, o) => sum + (Number(o.amount) || 0), 0)
  }, [otherActiveOffers])

  // Pressupost màxim que l'usuari pot destinar a aquesta oferta
  const maxAvailableBudget = Math.max(0, (manager?.budget || 0) - otherOffersTotal)

  if (!manager) {
    return (
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
        className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 animate-fade-in"
      >
        <div className="card w-full max-w-md p-6 space-y-4 shadow-2xl border border-base-border text-center">
          <div className="w-12 h-12 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xl mx-auto">
            🔒
          </div>
          <h3 className="font-display font-semibold text-lg text-ink">
            {isNoMarket ? 'Inicia sessió per fer una puja' : 'Inicia sessió per fer una oferta'}
          </h3>
          <p className="text-xs sm:text-sm text-ink-dim">
            Has d'estar registrat amb el teu usuari per poder participar en el mercat de fitxatges.
          </p>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 text-sm py-2.5">
              Cancel·lar
            </button>
            <Link to="/login" className="btn-primary flex-1 text-sm py-2.5 text-center flex items-center justify-center">
              Iniciar sessió
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (isMaxSquadLimit) {
    return (
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
        className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 animate-fade-in"
      >
        <div className="card w-full max-w-md p-6 space-y-4 shadow-2xl border border-base-border text-center">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-xl mx-auto">
            🛡️
          </div>
          <h3 className="font-display font-semibold text-lg text-ink">
            Límit de 5 jugadors assolit ({mySquadCount + otherOffersCount}/5)
          </h3>
          <p className="text-xs sm:text-sm text-ink-dim leading-relaxed">
            El mode <strong>"Màxim 5 jugadors"</strong> està activat a la lliga. Tens <strong>{mySquadCount}</strong> jugadors a la teva plantilla i <strong>{otherOffersCount}</strong> {otherOffersCount === 1 ? 'oferta en curs' : 'ofertes en curs'} en altres jugadors. No pots fer més ofertes simultànies a menys que retiris alguna oferta prèvia.
          </p>
          <div className="pt-2">
            <button type="button" onClick={onClose} className="btn-primary w-full text-sm py-2.5">
              D'acord
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (isForbidden) {
    return (
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
        className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 animate-fade-in"
      >
        <div className="card w-full max-w-md p-6 space-y-4 shadow-2xl border border-base-border text-center">
          <div className="w-12 h-12 rounded-full bg-danger/20 text-danger flex items-center justify-center text-xl mx-auto">
            🚫
          </div>
          <h3 className="font-display font-semibold text-lg text-ink">Fitxatge no permès</h3>
          <p className="text-xs sm:text-sm text-ink-dim">
            Com a norma del club, no pots fer ofertes per jugadors de l'equip on jugues o dels equips que entrenes.
          </p>
          <div className="pt-2">
            <button type="button" onClick={onClose} className="btn-primary w-full text-sm py-2.5">
              D'acord
            </button>
          </div>
        </div>
      </div>
    )
  }

  const numAmount = Number(amount)
  const isBudgetExceeded = numAmount > maxAvailableBudget

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (isForbidden) {
      setError("No pots fer ofertes per jugadors del teu propi equip o equips que entrenes.")
      return
    }

    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Introdueix una quantitat vàlida superior a 0M')
      return
    }

    if (numAmount < minPrice) {
      if (isVisibleAuction && highestBid > 0) {
        setError(`En subhasta visible és obligatori superar la puja més alta (${highestBid}M) per un mínim de +1M (Mínim: ${minPrice}M).`)
      } else {
        setError(`L'oferta mínima per aquest jugador és de ${minPrice}M`)
      }
      return
    }

    if (isBudgetExceeded) {
      setError(
        `L'import que has introduït (${numAmount}M) és superior al teu pressupost lliure disponible (${maxAvailableBudget.toFixed(1)}M). Redueix l'import per poder confirmar l'oferta.`
      )
      return
    }

    setSubmitting(true)
    try {
      if (existingOffer) {
        // Actualitzar oferta existent
        const { error: updErr } = await supabase
          .from('transfer_offers')
          .update({
            amount: numAmount,
            status: 'pending',
            counter_amount: null,
            created_at: new Date().toISOString(),
          })
          .eq('id', existingOffer.id)

        if (updErr) throw updErr
      } else {
        // Inserir nova oferta
        const { error: insErr } = await supabase
          .from('transfer_offers')
          .insert({
            fantasy_card_id: card.id,
            bidder_manager_id: manager.id,
            amount: numAmount,
            status: 'pending',
          })

        if (insErr) throw insErr
      }

      // Log d'activitat
      await supabase.from('activity_log').insert({
        manager_id: manager.id,
        type: 'offer_made',
        message: `${manager.display_name} ha ${existingOffer ? 'actualitzat la seva puja a' : 'fet una puja de'} ${numAmount}M per ${player?.full_name}`,
      })

      onOfferSuccess(
        existingOffer
          ? `Puja actualitzada a ${numAmount}M per ${player?.full_name}!`
          : `Puja de ${numAmount}M enviada correctament per ${player?.full_name}!`
      )
    } catch (err) {
      setError(err.message || "Error enviant l'oferta")
      setSubmitting(false)
    }
  }

  async function handleDeleteOffer() {
    setSubmitting(true)
    setError('')
    try {
      const { error: delErr } = await supabase
        .from('transfer_offers')
        .delete()
        .eq('id', existingOffer.id)

      if (delErr) throw delErr

      await supabase.from('activity_log').insert({
        manager_id: manager.id,
        type: 'offer_made',
        message: `${manager.display_name} ha retirat la seva oferta de ${existingOffer.amount}M per ${player?.full_name}`,
      })

      onOfferSuccess(`S'ha eliminat la teva oferta de ${existingOffer.amount}M per ${player?.full_name}.`)
    } catch (err) {
      setError(err.message || "Error eliminant l'oferta")
      setSubmitting(false)
    }
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 animate-fade-in"
    >
      <div className="card w-full max-w-lg p-5 sm:p-6 space-y-4 relative max-h-[90vh] overflow-y-auto shadow-2xl border border-base-border">
        {/* Capçalera */}
        <div className="flex items-center justify-between border-b border-base-border pb-3">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-lg text-ink flex items-center gap-2">
              <span>{isNoMarket ? '🏛️' : '💰'}</span>
              <span>
                {existingOffer
                  ? isNoMarket
                    ? 'Modificar la teva puja'
                    : "Modificar l'oferta"
                  : isNoMarket
                  ? 'Fer una puja a la subhasta'
                  : 'Fer una oferta'}
              </span>
            </h3>
            <p className="text-xs text-ink-dim mt-0.5">
              Sessió activa com a <strong>{manager.display_name}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-ink-dim hover:text-ink text-lg p-1.5 rounded-lg bg-base-raised"
          >
            ✕
          </button>
        </div>

        {/* Informació del jugador */}
        <div className="p-3.5 rounded-xl bg-base-raised border border-base-border/70 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <Jersey number={player?.dorsal} className="w-14 h-14 sm:w-16 sm:h-16 shrink-0" />
            <div className="min-w-0 flex-1">
              <h4 className="font-display font-bold text-base sm:text-lg md:text-xl text-ink leading-snug break-words">
                {player?.full_name}
              </h4>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span
                  title={`Punts acumulats: ${getPlayerTotalPoints(player)} pts (jornades normals)`}
                  className="min-w-[24px] h-5 sm:h-6 px-1.5 rounded-full text-[11px] sm:text-xs font-display font-bold bg-yellow-400 text-black border border-yellow-300 shadow-sm flex items-center justify-center select-none"
                >
                  {getPlayerTotalPoints(player)} pts
                </span>
                <p className="text-xs text-ink-dim flex items-center gap-1.5 break-words">
                  <span>{player?.position} {POS_EMOJIS[player?.position?.toUpperCase()]}</span>
                  <span>·</span>
                  <span>{player?.club_teams?.name}</span>
                </p>
              </div>
            </div>
          </div>
          {!isNoMarket && (
            <div className="text-right shrink-0">
              <p className="text-[11px] text-ink-faint">Preu de sortida</p>
              <p className="font-display font-bold text-yellow-400 text-base sm:text-lg" style={{ color: '#FACC15' }}>
                {card.current_price}M
              </p>
            </div>
          )}
        </div>

        {/* Balanç i Oferta existent */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-3 rounded-xl bg-base-surface border border-base-border">
            <p className="text-[11px] text-ink-dim font-medium">Pressupost disponible</p>
            <p className="text-sm sm:text-base font-display font-bold text-yellow-400 mt-0.5" style={{ color: '#FACC15' }}>
              {maxAvailableBudget.toFixed(1)}M
            </p>
          </div>

          <div className="p-3 rounded-xl bg-base-surface border border-base-border">
            <p className="text-[11px] text-ink-dim font-medium">Temps restant</p>
            <p className="text-xs sm:text-sm font-semibold text-ink mt-0.5">
              {timeLeft(card.market_expires_at)}
            </p>
          </div>
        </div>

        {/* Informació de funcionament de la subhasta o Registre de pujes públiques */}
        {isNoMarket && (
          <div className="space-y-3">
            {isVisibleAuction ? (
              <div className="p-3.5 rounded-xl bg-base-surface border border-base-border space-y-2.5">
                <div className="flex items-center justify-between border-b border-base-border/70 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">🏛️</span>
                    <span className="font-display font-semibold text-xs text-ink uppercase tracking-wider">
                      Registre de pujes públiques
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-ink-dim">
                    {sortedCardBids.length} {sortedCardBids.length === 1 ? 'persona ha pujat' : 'persones han pujat'}
                  </span>
                </div>

                {sortedCardBids.length === 0 ? (
                  <p className="text-xs text-ink-faint italic py-2 text-center">
                    Encara no hi ha cap puja registrada per aquest jugador. Sigues el primer a licitar!
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {sortedCardBids.map((bid, idx) => {
                      const isMe = bid.bidder_manager_id === manager?.id
                      const isTop = idx === 0
                      const bidderName = bid.managers?.display_name || (isMe ? manager?.display_name : 'Mànager')
                      const bidderEmoji = bid.managers?.avatar_emoji || (isMe ? manager?.avatar_emoji : '👤')

                      return (
                        <div
                          key={bid.id || idx}
                          className={`flex items-center justify-between p-2 rounded-lg text-xs transition-colors ${
                            isTop
                              ? 'bg-yellow-500/10 border border-yellow-500/30'
                              : isMe
                              ? 'bg-accent/10 border border-accent/20'
                              : 'bg-base-raised/60 border border-base-border/50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-base shrink-0">{bidderEmoji}</span>
                            <div className="min-w-0">
                              <p className="font-semibold text-ink truncate flex items-center gap-1.5">
                                <span>{bidderName}</span>
                                {isMe && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-yellow-400 font-semibold" style={{ color: '#FACC15' }}>
                                    La teva puja
                                  </span>
                                )}
                                {isTop && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-400 text-black font-bold">
                                    👑 Puja més alta
                                  </span>
                                )}
                              </p>
                              {bid.created_at && (
                                <p className="text-[10px] text-ink-faint">
                                  {formatRelativeTime(bid.created_at)}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="font-display font-bold text-sm text-yellow-400" style={{ color: '#FACC15' }}>
                              {bid.amount}M
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Resum de norma de puja mínima */}
                <div className="pt-2 border-t border-base-border/70 flex items-center justify-between text-[11px] flex-wrap gap-1">
                  <span className="text-ink-dim">
                    {highestBid > 0 ? (
                      <>
                        Última puja: <strong className="text-yellow-400 font-bold" style={{ color: '#FACC15' }}>{highestBid}M</strong>
                      </>
                    ) : (
                      <>
                        Estat: <strong className="text-ink font-semibold">Sense pujes prèvies</strong>
                      </>
                    )}
                  </span>
                  <span className="text-ink-dim">
                    Puja mínima necessària: <strong className="text-yellow-400 font-bold" style={{ color: '#FACC15' }}>{minPrice}M</strong> {highestBid > 0 && !isCurrentlyHighestBidder && '(+1M)'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200 leading-relaxed space-y-1">
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <span>ℹ️</span> Subhasta amb pujes anònimes
                </p>
                <p className="text-blue-200/90 text-[11px]">
                  Les pujes són secretes. Quan acabi el compte enrere, el jugador serà adjudicat automàticament al mànager que hagi fet la puja més alta.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Si s'està confirmant l'eliminació */}
        {showDeleteConfirm ? (
          <div className="p-4 rounded-xl bg-danger/10 border border-danger/30 space-y-3 animate-fade-in">
            <p className="text-xs font-semibold text-danger">
              Segur que vols eliminar la teva {isNoMarket ? 'puja' : 'oferta'} de {existingOffer.amount}M per {player?.full_name}?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={submitting}
                className="btn-ghost flex-1 py-2 text-xs"
              >
                Cancel·lar
              </button>
              <button
                type="button"
                onClick={handleDeleteOffer}
                disabled={submitting}
                className="py-2 px-4 rounded-xl bg-danger hover:bg-danger/90 text-white font-semibold text-xs transition-colors flex-1"
              >
                {submitting ? 'Eliminant…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        ) : (
          /* Formulari d'oferta */
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div>
              <label className="text-xs font-semibold text-ink block mb-1.5">
                {isNoMarket ? "Import de la puja (milions) *" : "Import de l'oferta (milions) *"}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min={minPrice}
                  max="999"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{ color: isBudgetExceeded ? '#EF4444' : '#FACC15' }}
                  className={`input text-base sm:text-lg font-display font-bold pr-10 min-h-[46px] transition-colors ${
                    isBudgetExceeded
                      ? 'border-danger text-danger focus:border-danger ring-1 ring-danger/40'
                      : 'text-yellow-400'
                  }`}
                  required
                  autoFocus
                />
                <span
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 font-display font-bold text-sm"
                  style={{ color: isBudgetExceeded ? '#EF4444' : '#FACC15' }}
                >
                  M
                </span>
              </div>
              <p className="text-[11px] mt-1.5 flex items-center justify-between">
                <span className="text-ink-dim">
                  {isNoMarket
                    ? `Puja mínima: ${minPrice}M${isVisibleAuction && highestBid > 0 && !isCurrentlyHighestBidder ? ' (+1M sobre la puja líder)' : ''}`
                    : `Mínim: ${minPrice}M`}
                </span>
                {isBudgetExceeded ? (
                  <span className="text-ink-dim">
                    Superes el teu límit per <strong className="text-danger font-semibold">{(numAmount - maxAvailableBudget).toFixed(1)}M</strong>
                  </span>
                ) : numAmount > 0 ? (
                  <span className="text-ink-dim">
                    Pressupost restant: <strong className="text-yellow-400" style={{ color: '#FACC15' }}>{(maxAvailableBudget - numAmount).toFixed(1)}M</strong>
                  </span>
                ) : null}
              </p>
            </div>

            {/* Avis vermell destacat si es supera el pressupost */}
            {isBudgetExceeded && (
              <div className="p-3 rounded-xl bg-danger/15 border border-danger/40 text-danger text-xs font-medium flex items-start gap-2.5 animate-fade-in shadow-sm">
                <span className="text-lg shrink-0 leading-none mt-0.5">⚠️</span>
                <div className="space-y-0.5">
                  <p className="font-bold text-xs sm:text-sm">
                    {isNoMarket ? 'Puja no permesa: has superat el pressupost disponible' : 'Oferta no permesa: has superat el pressupost disponible'}
                  </p>
                  <p className="text-[11px] text-danger/90 leading-relaxed">
                    L'import que has introduït (<strong>{numAmount}M</strong>) és superior al teu pressupost lliure disponible (<strong>{maxAvailableBudget.toFixed(1)}M</strong>). Redueix l'import per poder confirmar la {isNoMarket ? 'puja' : 'oferta'}.
                  </p>
                </div>
              </div>
            )}

            {/* Botons d'increment ràpid */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setAmount(minPrice)}
                className="btn-ghost py-1 px-2.5 text-xs rounded-lg text-ink-dim hover:text-ink"
              >
                Mínim ({minPrice}M)
              </button>
              <button
                type="button"
                onClick={() => setAmount((prev) => Math.min(maxAvailableBudget || 500, Math.max(minPrice, Number(prev || minPrice) + 1)))}
                className="btn-ghost py-1 px-2.5 text-xs rounded-lg text-ink-dim hover:text-ink"
              >
                +1.0M
              </button>
              <button
                type="button"
                onClick={() => setAmount((prev) => Math.min(maxAvailableBudget || 500, Math.max(minPrice, Number(prev || minPrice) + 2)))}
                className="btn-ghost py-1 px-2.5 text-xs rounded-lg text-ink-dim hover:text-ink"
              >
                +2.0M
              </button>
              {maxAvailableBudget >= minPrice && (
                <button
                  type="button"
                  onClick={() => setAmount(maxAvailableBudget)}
                  className="btn-ghost py-1 px-2.5 text-xs rounded-lg text-yellow-400 font-semibold ml-auto"
                  style={{ color: '#FACC15' }}
                >
                  Tot ({maxAvailableBudget.toFixed(1)}M)
                </button>
              )}
            </div>

            {error && (
              <p className="text-danger text-xs bg-danger/10 border border-danger/30 p-2.5 rounded-lg">
                {error}
              </p>
            )}

            <div className="pt-2 flex items-center justify-between gap-2.5 border-t border-base-border">
              {existingOffer ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={submitting}
                  className="py-2.5 px-3.5 rounded-[10px] bg-danger/15 hover:bg-danger/25 border border-danger/40 text-danger text-xs sm:text-sm font-semibold min-h-[42px] flex items-center gap-1.5 transition-colors"
                >
                  <span>🗑️</span>
                  <span>Eliminar {isNoMarket ? 'puja' : 'oferta'}</span>
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="btn-ghost py-2.5 px-4 text-xs sm:text-sm min-h-[42px]"
                >
                  Cancel·lar
                </button>

                <button
                  type="submit"
                  disabled={submitting || isBudgetExceeded}
                  className={`py-2.5 px-5 text-xs sm:text-sm font-semibold min-h-[42px] rounded-[10px] flex items-center justify-center gap-1.5 transition-all ${
                    isBudgetExceeded
                      ? 'bg-[#F2B84B] text-[#0B1220] opacity-60 cursor-not-allowed'
                      : 'btn-primary'
                  }`}
                >
                  {submitting
                    ? 'Enviant…'
                    : isBudgetExceeded
                    ? '🚫 Pressupost superat'
                    : existingOffer
                    ? `Actualitzar a ${numAmount || 0}M`
                    : isNoMarket
                    ? `Confirmar puja (${numAmount || 0}M)`
                    : `Confirmar oferta (${numAmount || 0}M)`}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
