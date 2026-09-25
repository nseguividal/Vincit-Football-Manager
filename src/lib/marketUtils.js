import { supabase } from './supabaseClient'

/**
 * Resol els jugadors que han expirat al mercat de fitxatges:
 * 1. Jugadors sense propietari (del club / free agents):
 *    - Si tenen ofertes: el postor amb l'oferta més alta guanya el jugador (subhasta).
 *      S'accepta la seva oferta, es rebutgen les altres, es descompten els diners del seu pressupost,
 *      i la fitxa passa a ser de la seva propietat.
 *    - Si no tenen ofertes: es retiren del mercat (status = 'free').
 * 2. Jugadors amb propietari (d'altres mànagers):
 *    - Es retiren del mercat públic (status = 'owned'), però les ofertes rebudes segueixen vigents
 *      a la pestanya d'Ofertes fins que el propietari les accepti, contraoferti o rebutgi, o el comprador les cancel·li.
 */
export async function resolveExpiredMarketListings() {
  try {
    const nowIso = new Date().toISOString()

    // 1. Cercar fitxes amb status = 'market' que hagin expirat
    const { data: expiredCards, error: cardsErr } = await supabase
      .from('fantasy_cards')
      .select(`
        id, owner_manager_id, current_price, status, market_expires_at,
        club_players (
          id, full_name, position, club_teams ( id, name )
        )
      `)
      .eq('status', 'market')
      .lt('market_expires_at', nowIso)

    if (cardsErr || !expiredCards || expiredCards.length === 0) {
      return
    }

    for (const card of expiredCards) {
      const isFreeAgent = !card.owner_manager_id
      const playerName = card.club_players?.full_name || 'el jugador'

      // Obtenir ofertes pendents / en curs per aquesta fitxa
      const { data: offers } = await supabase
        .from('transfer_offers')
        .select(`
          id, amount, bidder_manager_id, status, created_at,
          managers:bidder_manager_id ( id, display_name, budget )
        `)
        .eq('fantasy_card_id', card.id)
        .in('status', ['pending', 'countered'])
        .order('amount', { ascending: false })
        .order('created_at', { ascending: true })

      if (isFreeAgent) {
        // CAS 1: Fitxa sense propietari (Club / Lliure)
        if (offers && offers.length > 0) {
          // El millor postor guanya la subhasta
          const topOffer = offers[0]
          const winningAmount = Number(topOffer.amount)
          const winnerId = topOffer.bidder_manager_id
          const winnerManager = topOffer.managers
          const winnerName = winnerManager?.display_name || 'Un mànager'

          // Acceptar l'oferta guanyadora
          await supabase
            .from('transfer_offers')
            .update({ status: 'accepted', resolved_at: nowIso })
            .eq('id', topOffer.id)

          // Rebutjar la resta d'ofertes per aquesta fitxa
          if (offers.length > 1) {
            const otherOfferIds = offers.slice(1).map((o) => o.id)
            await supabase
              .from('transfer_offers')
              .update({ status: 'rejected', resolved_at: nowIso })
              .in('id', otherOfferIds)
          }

          // Descomptar pressupost al guanyador
          if (winnerManager) {
            const newBudget = (winnerManager.budget || 0) - winningAmount
            await supabase
              .from('managers')
              .update({ budget: newBudget })
              .eq('id', winnerId)
          }

          // Traspassar la propietat de la fitxa al guanyador
          await supabase
            .from('fantasy_cards')
            .update({
              owner_manager_id: winnerId,
              status: 'owned',
              current_price: winningAmount,
              market_listed_at: null,
              market_expires_at: null,
            })
            .eq('id', card.id)

          // Inserir registre a l'historial d'activitat
          await supabase.from('activity_log').insert({
            manager_id: winnerId,
            type: 'purchase',
            message: `${winnerName} ha guanyat la subhasta de ${playerName} al mercat per ${winningAmount}M`,
          })
        } else {
          // Sense ofertes -> es retira del mercat
          await supabase
            .from('fantasy_cards')
            .update({
              status: 'free',
              market_listed_at: null,
              market_expires_at: null,
            })
            .eq('id', card.id)
        }
      } else {
        // CAS 2: Fitxa amb propietari (d'un mànager)
        // Desapareix de la graella de mercat públic per no rebre noves ofertes,
        // però les ofertes pendents continuen vigents a la pestanya d'Ofertes.
        await supabase
          .from('fantasy_cards')
          .update({
            status: 'owned',
            market_listed_at: null,
            market_expires_at: null,
          })
          .eq('id', card.id)
      }
    }
  } catch (err) {
    console.warn('Avís resolent subhastes expirades del mercat:', err)
  }
}

