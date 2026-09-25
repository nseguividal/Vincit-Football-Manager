/**
 * ============================================================================
 * DADES FICTÍCIES (MOCK DATA) PER A USUARIS NO AUTENTICATS
 * ============================================================================
 * Aquest fitxer conté les dades d'exemple que es mostraran a l'aplicació
 * quan un visitant entri sense haver iniciat sessió.
 * 
 * Pots afegir, editar o eliminar qualsevol element lliurement.
 */

// ----------------------------------------------------------------------------
// 1. EQUIPS DEL CLUB
// ----------------------------------------------------------------------------
export const MOCK_TEAMS = [
  { id: 'mock-team-1', name: 'Sènior A', category: 'Tercera Divisió Nacional' },
  { id: 'mock-team-2', name: 'Sènior B', category: 'Primera Catalana' },
  { id: 'mock-team-3', name: 'Sènior Femení', category: 'Segona Catalana' },
  { id: 'mock-team-4', name: 'Juvenil A', category: 'Divisió d\'Honor Juvenil' },
  { id: 'mock-team-5', name: 'Cadet A', category: 'Divisió d\'Honor Cadet' },
]

// ----------------------------------------------------------------------------
// 2. JUGADORS DEL CLUB
// ----------------------------------------------------------------------------
export const MOCK_PLAYERS = [
  // Porters (POR)
  { id: 'mock-p-1', full_name: 'Marc', position: 'POR', dorsal: 1, team_id: 'mock-team-1' },
  { id: 'mock-p-2', full_name: 'David', position: 'POR', dorsal: 13, team_id: 'mock-team-2' },
  { id: 'mock-p-3', full_name: 'Laura', position: 'POR', dorsal: 1, team_id: 'mock-team-3' },

  // Tancas / Defenses (TANCA)
  { id: 'mock-p-4', full_name: 'Pau', position: 'TANCA', dorsal: 4, team_id: 'mock-team-1' },
  { id: 'mock-p-5', full_name: 'Pol', position: 'TANCA', dorsal: 3, team_id: 'mock-team-1' },
  { id: 'mock-p-6', full_name: 'Marta', position: 'TANCA', dorsal: 5, team_id: 'mock-team-3' },
  { id: 'mock-p-7', full_name: 'Eric', position: 'TANCA', dorsal: 2, team_id: 'mock-team-4' },

  // Ales / Migcampistes (ALA)
  { id: 'mock-p-8', full_name: 'Adrià', position: 'ALA', dorsal: 7, team_id: 'mock-team-1' },
  { id: 'mock-p-9', full_name: 'Sergi', position: 'ALA', dorsal: 10, team_id: 'mock-team-1' },
  { id: 'mock-p-10', full_name: 'Carla', position: 'ALA', dorsal: 8, team_id: 'mock-team-3' },
  { id: 'mock-p-11', full_name: 'Nil', position: 'ALA', dorsal: 11, team_id: 'mock-team-2' },
  { id: 'mock-p-12', full_name: 'Jordi', position: 'ALA', dorsal: 6, team_id: 'mock-team-4' },
  { id: 'mock-p-13', full_name: 'Aleix', position: 'ALA', dorsal: 17, team_id: 'mock-team-5' },

  // Pívots / Davanters (PIVOT)
  { id: 'mock-p-14', full_name: 'Guillem', position: 'PIVOT', dorsal: 9, team_id: 'mock-team-1' },
  { id: 'mock-p-15', full_name: 'Roger', position: 'PIVOT', dorsal: 14, team_id: 'mock-team-2' },
  { id: 'mock-p-16', full_name: 'Aina', position: 'PIVOT', dorsal: 9, team_id: 'mock-team-3' },
  { id: 'mock-p-17', full_name: 'Biel', position: 'PIVOT', dorsal: 19, team_id: 'mock-team-4' },
]

// ----------------------------------------------------------------------------
// 3. MANAGERS / USUARIS DE LA LLIGA
// ----------------------------------------------------------------------------
export const MOCK_MANAGERS = [
  { id: 'mock-mgr-1', display_name: 'Vincit Dream Team', avatar_emoji: '🦁', budget: 14.5 },
  { id: 'mock-mgr-2', display_name: 'Tiki-Taka Futsal', avatar_emoji: '🧠', budget: 21.0 },
  { id: 'mock-mgr-3', display_name: 'Estela FC', avatar_emoji: '⭐', budget: 18.2 },
  { id: 'mock-mgr-4', display_name: 'Fúria Taronja', avatar_emoji: '🔥', budget: 9.8 },
  { id: 'mock-mgr-5', display_name: 'Galàctic', avatar_emoji: '🚀', budget: 32.5 },
]

// ----------------------------------------------------------------------------
// 4. JORNADES DE LLIGA
// ----------------------------------------------------------------------------
export const MOCK_MATCHDAYS = [
  {
    id: 'mock-md-1',
    number: 1,
    label: 'Jornada 1',
    starts_at: '2026-09-12T00:00:00',
    ends_at: '2026-09-13T23:59:59',
    is_extra: false,
  },
  {
    id: 'mock-md-2',
    number: 2,
    label: 'Jornada 2',
    starts_at: '2026-09-19T00:00:00',
    ends_at: '2026-09-20T23:59:59',
    is_extra: false,
  },
  {
    id: 'mock-md-3',
    number: 3,
    label: 'Jornada 3',
    starts_at: '2026-09-26T00:00:00',
    ends_at: '2026-09-27T23:59:59',
    is_extra: false,
  },
  {
    id: 'mock-md-4',
    number: 4,
    label: 'Jornada 4',
    starts_at: '2026-10-03T00:00:00',
    ends_at: '2026-10-04T23:59:59',
    is_extra: false,
  },
  {
    id: 'mock-md-5',
    number: 5,
    label: 'Copa Extra',
    starts_at: '2026-10-10T00:00:00',
    ends_at: '2026-10-11T23:59:59',
    is_extra: true,
  },
]

// ----------------------------------------------------------------------------
// 5. FITXES FANTASY (CARTES)
// ----------------------------------------------------------------------------
export const MOCK_CARDS = [
  // Fitxes del Manager 1 (Vincit Dream Team)
  { id: 'mock-c-1', club_player_id: 'mock-p-1', owner_manager_id: 'mock-mgr-1', current_price: 6.5, status: 'normal' },
  { id: 'mock-c-2', club_player_id: 'mock-p-4', owner_manager_id: 'mock-mgr-1', current_price: 8.0, status: 'normal' },
  { id: 'mock-c-3', club_player_id: 'mock-p-5', owner_manager_id: 'mock-mgr-1', current_price: 7.2, status: 'normal' },
  { id: 'mock-c-4', club_player_id: 'mock-p-8', owner_manager_id: 'mock-mgr-1', current_price: 11.5, status: 'normal' },
  { id: 'mock-c-5', club_player_id: 'mock-p-14', owner_manager_id: 'mock-mgr-1', current_price: 14.0, status: 'normal' },
  { id: 'mock-c-6', club_player_id: 'mock-p-11', owner_manager_id: 'mock-mgr-1', current_price: 4.5, status: 'normal' },

  // Fitxes del Manager 2 (Tiki-Taka Futsal)
  { id: 'mock-c-7', club_player_id: 'mock-p-2', owner_manager_id: 'mock-mgr-2', current_price: 5.0, status: 'normal' },
  { id: 'mock-c-8', club_player_id: 'mock-p-6', owner_manager_id: 'mock-mgr-2', current_price: 6.8, status: 'normal' },
  { id: 'mock-c-9', club_player_id: 'mock-p-7', owner_manager_id: 'mock-mgr-2', current_price: 5.5, status: 'normal' },
  { id: 'mock-c-10', club_player_id: 'mock-p-9', owner_manager_id: 'mock-mgr-2', current_price: 10.0, status: 'normal' },
  { id: 'mock-c-11', club_player_id: 'mock-p-15', owner_manager_id: 'mock-mgr-2', current_price: 9.5, status: 'normal' },

  // Fitxes del Manager 3 (Estelada FC)
  { id: 'mock-c-12', club_player_id: 'mock-p-3', owner_manager_id: 'mock-mgr-3', current_price: 6.0, status: 'normal' },
  { id: 'mock-c-13', club_player_id: 'mock-p-4', owner_manager_id: 'mock-mgr-3', current_price: 8.0, status: 'normal' },
  { id: 'mock-c-14', club_player_id: 'mock-p-10', owner_manager_id: 'mock-mgr-3', current_price: 8.5, status: 'normal' },
  { id: 'mock-c-15', club_player_id: 'mock-p-12', owner_manager_id: 'mock-mgr-3', current_price: 5.0, status: 'normal' },
  { id: 'mock-c-16', club_player_id: 'mock-p-16', owner_manager_id: 'mock-mgr-3', current_price: 9.0, status: 'normal' },

  // Fitxes al Mercat de Fitxatges
  {
    id: 'mock-c-m1',
    club_player_id: 'mock-p-9', // Sergi Mas
    owner_manager_id: null,
    current_price: 10.5,
    status: 'market',
    market_listed_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    market_expires_at: new Date(Date.now() + 18 * 3600 * 1000).toISOString(),
  },
  {
    id: 'mock-c-m2',
    club_player_id: 'mock-p-17', // Biel Bosch
    owner_manager_id: null,
    current_price: 4.8,
    status: 'market',
    market_listed_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    market_expires_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
  },
  {
    id: 'mock-c-m3',
    club_player_id: 'mock-p-13', // Aleix Prats
    owner_manager_id: 'mock-mgr-4',
    current_price: 3.5,
    status: 'market',
    market_listed_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    market_expires_at: new Date(Date.now() + 22 * 3600 * 1000).toISOString(),
  },
  {
    id: 'mock-c-m4',
    club_player_id: 'mock-p-10', // Carla Valls
    owner_manager_id: null,
    current_price: 9.0,
    status: 'market',
    market_listed_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    market_expires_at: new Date(Date.now() + 23 * 3600 * 1000).toISOString(),
  },
]

// ----------------------------------------------------------------------------
// 6. ALINEACIONS (LINEUP SLOTS: PORTER, TANCA, ALA_1, ALA_2, PIVOT)
// ----------------------------------------------------------------------------
export const MOCK_LINEUP_SLOTS = [
  // Manager 1 (Vincit Dream Team)
  { manager_id: 'mock-mgr-1', slot: 'PORTER', fantasy_card_id: 'mock-c-1' },
  { manager_id: 'mock-mgr-1', slot: 'TANCA', fantasy_card_id: 'mock-c-2' },
  { manager_id: 'mock-mgr-1', slot: 'ALA_1', fantasy_card_id: 'mock-c-4' },
  { manager_id: 'mock-mgr-1', slot: 'ALA_2', fantasy_card_id: 'mock-c-6' },
  { manager_id: 'mock-mgr-1', slot: 'PIVOT', fantasy_card_id: 'mock-c-5' },

  // Manager 2 (Tiki-Taka Futsal)
  { manager_id: 'mock-mgr-2', slot: 'PORTER', fantasy_card_id: 'mock-c-7' },
  { manager_id: 'mock-mgr-2', slot: 'TANCA', fantasy_card_id: 'mock-c-8' },
  { manager_id: 'mock-mgr-2', slot: 'ALA_1', fantasy_card_id: 'mock-c-9' },
  { manager_id: 'mock-mgr-2', slot: 'ALA_2', fantasy_card_id: 'mock-c-10' },
  { manager_id: 'mock-mgr-2', slot: 'PIVOT', fantasy_card_id: 'mock-c-11' },

  // Manager 3 (Estelada FC)
  { manager_id: 'mock-mgr-3', slot: 'PORTER', fantasy_card_id: 'mock-c-12' },
  { manager_id: 'mock-mgr-3', slot: 'TANCA', fantasy_card_id: 'mock-c-13' },
  { manager_id: 'mock-mgr-3', slot: 'ALA_1', fantasy_card_id: 'mock-c-14' },
  { manager_id: 'mock-mgr-3', slot: 'ALA_2', fantasy_card_id: 'mock-c-15' },
  { manager_id: 'mock-mgr-3', slot: 'PIVOT', fantasy_card_id: 'mock-c-16' },
]

// ----------------------------------------------------------------------------
// 7. PUNTUACIONS DE JUGADORS PER JORNADA (PLAYER STATS)
// ----------------------------------------------------------------------------
export const MOCK_PLAYER_STATS = [
  // Jornada 1
  { matchday_id: 'mock-md-1', club_player_id: 'mock-p-1', points: 8, goals: 0, assists: 1, yellow_cards: 0, red_cards: 0, attended: true },
  { matchday_id: 'mock-md-1', club_player_id: 'mock-p-4', points: 10, goals: 1, assists: 0, yellow_cards: 0, red_cards: 0, attended: true },
  { matchday_id: 'mock-md-1', club_player_id: 'mock-p-5', points: 6, goals: 0, assists: 1, yellow_cards: 1, red_cards: 0, attended: true },
  { matchday_id: 'mock-md-1', club_player_id: 'mock-p-8', points: 14, goals: 2, assists: 1, yellow_cards: 0, red_cards: 0, attended: true },
  { matchday_id: 'mock-md-1', club_player_id: 'mock-p-14', points: 18, goals: 3, assists: 0, yellow_cards: 0, red_cards: 0, attended: true },
  { matchday_id: 'mock-md-1', club_player_id: 'mock-p-2', points: 4, goals: 0, assists: 0, yellow_cards: 0, red_cards: 0, attended: true },
  { matchday_id: 'mock-md-1', club_player_id: 'mock-p-6', points: 7, goals: 0, assists: 1, yellow_cards: 0, red_cards: 0, attended: true },
  { matchday_id: 'mock-md-1', club_player_id: 'mock-p-9', points: 11, goals: 1, assists: 2, yellow_cards: 0, red_cards: 0, attended: true },
  { matchday_id: 'mock-md-1', club_player_id: 'mock-p-15', points: 9, goals: 1, assists: 0, yellow_cards: 0, red_cards: 0, attended: true },

  // Jornada 2
  { matchday_id: 'mock-md-2', club_player_id: 'mock-p-1', points: 11, goals: 0, assists: 0, yellow_cards: 0, red_cards: 0, attended: true },
  { matchday_id: 'mock-md-2', club_player_id: 'mock-p-4', points: 7, goals: 0, assists: 1, yellow_cards: 0, red_cards: 0, attended: true },
  { matchday_id: 'mock-md-2', club_player_id: 'mock-p-5', points: 9, goals: 1, assists: 0, yellow_cards: 0, red_cards: 0, attended: true },
  { matchday_id: 'mock-md-2', club_player_id: 'mock-p-8', points: 12, goals: 1, assists: 2, yellow_cards: 0, red_cards: 0, attended: true },
  { matchday_id: 'mock-md-2', club_player_id: 'mock-p-14', points: 15, goals: 2, assists: 1, yellow_cards: 0, red_cards: 0, attended: true },
  { matchday_id: 'mock-md-2', club_player_id: 'mock-p-2', points: 5, goals: 0, assists: 0, yellow_cards: 1, red_cards: 0, attended: true },
  { matchday_id: 'mock-md-2', club_player_id: 'mock-p-7', points: 8, goals: 1, assists: 0, yellow_cards: 0, red_cards: 0, attended: true },
  { matchday_id: 'mock-md-2', club_player_id: 'mock-p-9', points: 13, goals: 2, assists: 0, yellow_cards: 0, red_cards: 0, attended: true },
  { matchday_id: 'mock-md-2', club_player_id: 'mock-p-10', points: 10, goals: 1, assists: 1, yellow_cards: 0, red_cards: 0, attended: true },
  { matchday_id: 'mock-md-2', club_player_id: 'mock-p-16', points: 12, goals: 2, assists: 0, yellow_cards: 0, red_cards: 0, attended: true },
]

// ----------------------------------------------------------------------------
// 8. RESULTATS DELS EQUIPS DEL CLUB PER JORNADA (MATCH RESULTS)
// ----------------------------------------------------------------------------
export const MOCK_LOG_RESULTS = {
  // Jornada 1
  'mock-team-1_mock-md-1': { result: 'win', score: '5-2', venue: 'home', opponent: 'Futsal Mataró' },
  'mock-team-2_mock-md-1': { result: 'loss', score: '1-3', venue: 'away', opponent: 'FS Gràcia' },
  'mock-team-3_mock-md-1': { result: 'draw', score: '3-3', venue: 'home', opponent: 'Les Corts UBAE' },
  'mock-team-4_mock-md-1': { result: 'win', score: '4-1', venue: 'away', opponent: 'CE Sant Andreu' },

  // Jornada 2
  'mock-team-1_mock-md-2': { result: 'win', score: '6-3', venue: 'away', opponent: 'AE Penya Esplugues' },
  'mock-team-2_mock-md-2': { result: 'draw', score: '2-2', venue: 'home', opponent: 'FS Sabadell' },
  'mock-team-3_mock-md-2': { result: 'win', score: '4-2', venue: 'away', opponent: 'Eixample FS' },
  'mock-team-4_mock-md-2': { result: 'loss', score: '2-4', venue: 'home', opponent: 'Marfil Santa Coloma' },
}

// ----------------------------------------------------------------------------
// 9. CLASSIFICACIÓ GENERAL (STANDINGS)
// ----------------------------------------------------------------------------
export const MOCK_STANDINGS = [
  { manager_id: 'mock-mgr-1', display_name: 'Vincit Dream Team', avatar_emoji: '🦁', total_points: 110 },
  { manager_id: 'mock-mgr-2', display_name: 'Tiki-Taka Futsal', avatar_emoji: '🧠', total_points: 92 },
  { manager_id: 'mock-mgr-3', display_name: 'Estela FC', avatar_emoji: '⭐', total_points: 85 },
  { manager_id: 'mock-mgr-4', display_name: 'Fúria Taronja', avatar_emoji: '🔥', total_points: 74 },
  { manager_id: 'mock-mgr-5', display_name: 'FC Galàctic', avatar_emoji: '🚀', total_points: 62 },
]

// ----------------------------------------------------------------------------
// 10. REGISTRE D'ACTIVITAT RECENT (LOG)
// ----------------------------------------------------------------------------
export const MOCK_ACTIVITY_LOG = [
  {
    id: 'mock-log-1',
    type: 'points_added',
    message: "S'han registrat les puntuacions de Sènior A (Jornada 2)",
    created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    managers: { display_name: 'Vincit Dream Team', avatar_emoji: '🦁' },
  },
  {
    id: 'mock-log-2',
    type: 'purchase',
    message: 'Tiki-Taka Futsal ha fitxat a Sergi Mas per 10.0M',
    created_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    managers: { display_name: 'Tiki-Taka Futsal', avatar_emoji: '🧠' },
  },
  {
    id: 'mock-log-3',
    type: 'market_new',
    message: 'Nova fitxa disponible al mercat: Biel Bosch (4.8M)',
    created_at: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
    managers: null,
  },
  {
    id: 'mock-log-4',
    type: 'points_added',
    message: "S'han registrat les puntuacions de Sènior Femení (Jornada 2)",
    created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    managers: { display_name: 'Estelada FC', avatar_emoji: '⭐' },
  },
]

// ----------------------------------------------------------------------------
// 11. FUNCIONS AUXILIARS PER A LES PESTANYES
// ----------------------------------------------------------------------------

/**
 * Retorna les dades d'alineació i plantilla fictícia per a Squad.jsx
 */
export function getMockSquadData(managerId) {
  const targetManagerId = managerId || MOCK_MANAGERS[0].id
  const teamMap = new Map(MOCK_TEAMS.map((t) => [t.id, t]))
  const statsMap = new Map()
  MOCK_PLAYER_STATS.forEach((st) => {
    const arr = statsMap.get(st.club_player_id) || []
    arr.push({
      points: st.points,
      matchdays: { id: st.matchday_id, is_extra: false },
    })
    statsMap.set(st.club_player_id, arr)
  })

  const playerMap = new Map(
    MOCK_PLAYERS.map((p) => [
      p.id,
      {
        id: p.id,
        full_name: p.full_name,
        position: p.position,
        dorsal: p.dorsal,
        club_teams: { name: teamMap.get(p.team_id)?.name || '' },
        player_matchday_stats: statsMap.get(p.id) || [],
      },
    ])
  )

  const cardsMap = new Map()
  const cardsData = MOCK_CARDS
    .filter((c) => c.owner_manager_id === targetManagerId)
    .map((c) => {
      const cardObj = {
        id: c.id,
        current_price: c.current_price,
        status: c.status,
        market_expires_at: c.market_expires_at || null,
        owner_manager_id: c.owner_manager_id,
        club_players: playerMap.get(c.club_player_id) || null,
      }
      cardsMap.set(c.id, cardObj)
      return cardObj
    })

  const lineupData = MOCK_LINEUP_SLOTS
    .filter((s) => s.manager_id === targetManagerId)
    .map((s) => ({
      slot: s.slot,
      fantasy_card_id: s.fantasy_card_id,
      fantasy_cards: cardsMap.get(s.fantasy_card_id) || null,
    }))

  return {
    cardsData,
    lineupData,
    matchdaysData: MOCK_MATCHDAYS,
  }
}

/**
 * Retorna totes les dades per a Matchdays.jsx en mode no autenticat
 */
export function getMockMatchdaysData() {
  return {
    matchdaysList: MOCK_MATCHDAYS,
    managersList: MOCK_MANAGERS,
    teamsList: MOCK_TEAMS,
    playersList: MOCK_PLAYERS,
    cardsList: MOCK_CARDS,
    slotsList: MOCK_LINEUP_SLOTS,
    statsList: MOCK_PLAYER_STATS,
    logResults: MOCK_LOG_RESULTS,
  }
}

/**
 * Retorna les fitxes del mercat per a Market.jsx en mode no autenticat
 */
export function getMockMarketData() {
  const teamMap = new Map(MOCK_TEAMS.map((t) => [t.id, t]))
  const statsMap = new Map()
  MOCK_PLAYER_STATS.forEach((st) => {
    const arr = statsMap.get(st.club_player_id) || []
    arr.push({
      points: st.points,
      matchdays: { id: st.matchday_id, is_extra: false },
    })
    statsMap.set(st.club_player_id, arr)
  })

  const playerMap = new Map(
    MOCK_PLAYERS.map((p) => [
      p.id,
      {
        id: p.id,
        full_name: p.full_name,
        position: p.position,
        dorsal: p.dorsal,
        club_teams: { id: p.team_id, name: teamMap.get(p.team_id)?.name || '' },
        player_matchday_stats: statsMap.get(p.id) || [],
      },
    ])
  )

  const mgrMap = new Map(MOCK_MANAGERS.map((m) => [m.id, m]))

  const marketCards = MOCK_CARDS
    .filter((c) => c.status === 'market')
    .map((c) => ({
      id: c.id,
      current_price: c.current_price,
      status: c.status,
      market_listed_at: c.market_listed_at,
      market_expires_at: c.market_expires_at,
      owner_manager_id: c.owner_manager_id,
      club_players: playerMap.get(c.club_player_id) || null,
      managers: c.owner_manager_id ? mgrMap.get(c.owner_manager_id) || null : null,
    }))

  return marketCards
}

