-- ============================================================================
-- VINCIT MANAGER — Resolució automàtica de jugadors expirats al mercat
-- ============================================================================
-- Aquesta funció resol les subhastes i retirades de jugadors quan el seu temps
-- de mercat (market_expires_at) ha expirat:
-- 1. Jugadors sense propietari (owner_manager_id is null):
--    - Si tenen ofertes: el postor amb l'oferta més alta guanya la fitxa.
--      S'accepta la seva oferta, es rebutgen les altres, es descompta el seu
--      pressupost i la fitxa passa a ser seva.
--    - Si no tenen ofertes: la fitxa passa a status = 'free'.
-- 2. Jugadors amb propietari (owner_manager_id is not null):
--    - La fitxa es retira del mercat públic (status = 'owned'), però les ofertes
--      ja existents continuen pendents perquè el propietari les gestioni.
-- ============================================================================

drop function if exists public.resolve_expired_market_listings() cascade;

create or replace function public.resolve_expired_market_listings()
returns void
language plpgsql
security definer
as $$
declare
  r_card record;
  top_offer record;
  other_offer record;
  player_full_name text;
  winner_name text;
begin
  for r_card in
    select c.id, c.owner_manager_id, c.current_price, c.club_player_id
    from public.fantasy_cards c
    where c.status = 'market'
      and c.market_expires_at is not null
      and c.market_expires_at <= now()
  loop
    -- Obtenir el nom del jugador per al log
    select p.full_name into player_full_name
    from public.club_players p
    where p.id = r_card.club_player_id;

    if r_card.owner_manager_id is null then
      -- CAS 1: Fitxa sense propietari (Club)
      -- Buscar la millor oferta vigent
      select o.id, o.bidder_manager_id, o.amount
      into top_offer
      from public.transfer_offers o
      where o.fantasy_card_id = r_card.id
        and o.status in ('pending', 'countered')
      order by o.amount desc, o.created_at asc
      limit 1;

      if top_offer.id is not null then
        -- Acceptar l'oferta guanyadora
        update public.transfer_offers
        set status = 'accepted', resolved_at = now()
        where id = top_offer.id;

        -- Rebutjar les altres ofertes
        update public.transfer_offers
        set status = 'rejected', resolved_at = now()
        where fantasy_card_id = r_card.id
          and id <> top_offer.id
          and status in ('pending', 'countered');

        -- Descomptar pressupost al guanyador
        update public.managers
        set budget = budget - top_offer.amount
        where id = top_offer.bidder_manager_id;

        -- Traspassar la fitxa al guanyador
        update public.fantasy_cards
        set owner_manager_id = top_offer.bidder_manager_id,
            status = 'owned',
            current_price = top_offer.amount,
            market_listed_at = null,
            market_expires_at = null
        where id = r_card.id;

        -- Obtenir nom del guanyador
        select display_name into winner_name
        from public.managers
        where id = top_offer.bidder_manager_id;

        -- Inserir registre d'activitat
        insert into public.activity_log (manager_id, type, message)
        values (
          top_offer.bidder_manager_id,
          'purchase',
          coalesce(winner_name, 'Un mànager') || ' ha guanyat la subhasta de ' || coalesce(player_full_name, 'jugador') || ' al mercat per ' || top_offer.amount || 'M'
        );
      else
        -- Sense ofertes -> retirar fitxa del mercat (lliure)
        update public.fantasy_cards
        set status = 'free',
            market_listed_at = null,
            market_expires_at = null
        where id = r_card.id;
      end if;

    else
      -- CAS 2: Fitxa amb propietari
      -- Retirar del mercat públic; les ofertes pendents continuen vigents a la pestanya d'Ofertes
      update public.fantasy_cards
      set status = 'owned',
          market_listed_at = null,
          market_expires_at = null
      where id = r_card.id;
    end if;
  end loop;
end;
$$;

-- Permetre execució als usuaris autenticats i anònims
grant execute on function public.resolve_expired_market_listings() to authenticated, anon;
notify pgrst, 'reload schema';

