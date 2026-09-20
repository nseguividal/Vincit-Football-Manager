-- ============================================================================
-- VINCIT MANAGER — Gestió d'Ofertes P2P, Contraofertes i Resolució de Mercat
-- Executa aquest script al SQL Editor de Supabase per habilitar les noves funcions
-- ============================================================================

-- 1. Afegir columnes per a contraofertes a la taula transfer_offers (si no existeixen)
alter table public.transfer_offers
  add column if not exists counter_amount numeric,
  add column if not exists counter_by uuid references public.managers(id) on delete set null,
  add column if not exists last_rejected_counter numeric;

-- Actualitzar la constraint check de status per incloure 'countered'
alter table public.transfer_offers
  drop constraint if exists transfer_offers_status_check;

alter table public.transfer_offers
  add constraint transfer_offers_status_check
  check (status in ('pending', 'countered', 'accepted', 'rejected', 'expired'));

-- 2. Actualitzar polítiques RLS perquè el venedor pugui veure les ofertes dels seus jugadors i l'admin les del club
drop policy if exists "read_own_offers" on public.transfer_offers;

create policy "read_own_offers" on public.transfer_offers
  for select
  using (
    bidder_manager_id = current_manager_id()
    or is_current_user_admin()
    or exists (
      select 1 from public.fantasy_cards fc
      where fc.id = transfer_offers.fantasy_card_id
        and (fc.owner_manager_id = current_manager_id() or fc.owner_manager_id is null)
    )
  );

-- Permetre al postor o admin descartar / eliminar ofertes
drop policy if exists "delete_own_offers" on public.transfer_offers;
create policy "delete_own_offers" on public.transfer_offers
  for delete
  using (
    bidder_manager_id = current_manager_id()
    or is_current_user_admin()
  );

-- 2b. Funció per descartar un avís d'oferta resolta
create or replace function public.dismiss_transfer_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer      transfer_offers%rowtype;
  v_caller_mgr uuid := current_manager_id();
begin
  select * into v_offer from transfer_offers where id = p_offer_id;
  if not found then
    return;
  end if;

  if not is_current_user_admin() and v_caller_mgr <> v_offer.bidder_manager_id then
    raise exception 'No tens permís per descartar aquesta oferta';
  end if;

  delete from transfer_offers where id = p_offer_id;
end;
$$;

-- 3. Funció per acceptar una oferta de traspàs (Venedor directe o Administrador)
create or replace function public.accept_transfer_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer          transfer_offers%rowtype;
  v_card           fantasy_cards%rowtype;
  v_seller         uuid;
  v_buyer_budget   numeric;
  v_player_name    text;
  v_buyer_name     text;
  v_caller_mgr     uuid := current_manager_id();
  v_final_amount   numeric;
begin
  select * into v_offer from transfer_offers where id = p_offer_id and status in ('pending', 'countered');
  if not found then
    raise exception 'Oferta no trobada o ja resolta';
  end if;

  select * into v_card from fantasy_cards where id = v_offer.fantasy_card_id;
  v_seller := v_card.owner_manager_id;

  -- Permís: Només l'administrador o el venedor actual pot acceptar l'oferta
  if not is_current_user_admin() and (v_seller is null or v_caller_mgr <> v_seller) then
    raise exception 'No tens permís per acceptar aquesta oferta';
  end if;

  v_final_amount := v_offer.amount;

  -- Comprovar pressupost del comprador
  select budget, display_name into v_buyer_budget, v_buyer_name from managers where id = v_offer.bidder_manager_id;
  if v_buyer_budget < v_final_amount then
    raise exception 'El comprador no té prou pressupost disponible (%M requerits, %M disponibles)', v_final_amount, v_buyer_budget;
  end if;

  select full_name into v_player_name from club_players where id = v_card.club_player_id;

  -- Moviment de diners
  update managers set budget = budget - v_final_amount where id = v_offer.bidder_manager_id;
  if v_seller is not null then
    update managers set budget = budget + v_final_amount where id = v_seller;
  end if;

  -- Canvi de propietat del jugador
  update fantasy_cards
    set owner_manager_id = v_offer.bidder_manager_id,
        status = 'owned',
        current_price = v_final_amount,
        market_listed_at = null,
        market_expires_at = null
    where id = v_card.id;

  -- Marcar l'oferta com acceptada
  update transfer_offers
    set status = 'accepted',
        resolved_at = now()
    where id = p_offer_id;

  -- Rebutjar la resta d'ofertes pendents per a aquesta mateixa fitxa
  update transfer_offers
    set status = 'rejected',
        resolved_at = now()
    where fantasy_card_id = v_card.id
      and id <> p_offer_id
      and status in ('pending', 'countered');

  -- Registrar al log d'activitat
  insert into activity_log (manager_id, type, message)
    values (
      v_offer.bidder_manager_id,
      'purchase',
      format('%s ha fitxat %s per %sM', coalesce(v_buyer_name, 'Un mànager'), coalesce(v_player_name, 'el jugador'), v_final_amount)
    );
end;
$$;

-- 4. Funció per rebutjar una oferta sencera (Venedor, Comprador o Administrador)
create or replace function public.reject_transfer_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer       transfer_offers%rowtype;
  v_card        fantasy_cards%rowtype;
  v_caller_mgr  uuid := current_manager_id();
begin
  select * into v_offer from transfer_offers where id = p_offer_id and status in ('pending', 'countered');
  if not found then
    raise exception 'Oferta no trobada o ja resolta';
  end if;

  select * into v_card from fantasy_cards where id = v_offer.fantasy_card_id;

  -- Permís: Només l'admin, el comprador (bidder) o el venedor (card owner)
  if not is_current_user_admin()
     and v_caller_mgr <> v_offer.bidder_manager_id
     and (v_card.owner_manager_id is null or v_caller_mgr <> v_card.owner_manager_id) then
    raise exception 'No tens permís per rebutjar aquesta oferta';
  end if;

  update transfer_offers
    set status = 'rejected',
        resolved_at = now()
    where id = p_offer_id;
end;
$$;

-- 5. Funció per fer una contraoferta (Només el Venedor)
create or replace function public.counter_transfer_offer(p_offer_id uuid, p_counter_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer       transfer_offers%rowtype;
  v_card        fantasy_cards%rowtype;
  v_caller_mgr  uuid := current_manager_id();
  v_seller_name text;
  v_player_name text;
begin
  if p_counter_amount is null or p_counter_amount <= 0 then
    raise exception 'Introdueix un import de contraoferta vàlid';
  end if;

  select * into v_offer from transfer_offers where id = p_offer_id and status in ('pending', 'countered');
  if not found then
    raise exception 'Oferta no trobada o ja resolta';
  end if;

  select * into v_card from fantasy_cards where id = v_offer.fantasy_card_id;

  -- Permís: Només el venedor propietari de la carta pot fer contraoferta
  if not is_current_user_admin() and (v_card.owner_manager_id is null or v_caller_mgr <> v_card.owner_manager_id) then
    raise exception 'Només el propietari del jugador pot fer una contraoferta';
  end if;

  select display_name into v_seller_name from managers where id = v_card.owner_manager_id;
  select full_name into v_player_name from club_players where id = v_card.club_player_id;

  update transfer_offers
    set counter_amount = p_counter_amount,
        counter_by = v_caller_mgr,
        last_rejected_counter = null,
        status = 'countered'
    where id = p_offer_id;

  insert into activity_log (manager_id, type, message)
    values (
      v_card.owner_manager_id,
      'offer_made',
      format('%s ha enviat una contraoferta de %sM per %s', coalesce(v_seller_name, 'El venedor'), p_counter_amount, coalesce(v_player_name, 'el jugador'))
    );
end;
$$;

-- 5b. Funció perquè el comprador rebutgi la contraoferta i mantingui la seva oferta original
create or replace function public.reject_counter_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer       transfer_offers%rowtype;
  v_card        fantasy_cards%rowtype;
  v_caller_mgr  uuid := current_manager_id();
  v_buyer_name  text;
  v_player_name text;
begin
  select * into v_offer from transfer_offers where id = p_offer_id and status = 'countered';
  if not found then
    raise exception 'Contraoferta no trobada o ja resolta';
  end if;

  select * into v_card from fantasy_cards where id = v_offer.fantasy_card_id;

  if not is_current_user_admin() and v_caller_mgr <> v_offer.bidder_manager_id then
    raise exception 'Només el comprador pot rebutjar la contraoferta';
  end if;

  select display_name into v_buyer_name from managers where id = v_offer.bidder_manager_id;
  select full_name into v_player_name from club_players where id = v_card.club_player_id;

  update transfer_offers
    set status = 'pending',
        last_rejected_counter = v_offer.counter_amount,
        counter_amount = null,
        counter_by = null
    where id = p_offer_id;

  insert into activity_log (manager_id, type, message)
    values (
      v_offer.bidder_manager_id,
      'offer_made',
      format('%s ha rebutjat la contraoferta de %sM per %s. L''oferta inicial de %sM segueix vigent.', coalesce(v_buyer_name, 'El comprador'), v_offer.counter_amount, coalesce(v_player_name, 'el jugador'), v_offer.amount)
    );
end;
$$;

-- 6. Funció perquè el comprador accepti la contraoferta del venedor
create or replace function public.accept_counter_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer          transfer_offers%rowtype;
  v_card           fantasy_cards%rowtype;
  v_seller         uuid;
  v_buyer_budget   numeric;
  v_buyer_name     text;
  v_player_name    text;
  v_caller_mgr     uuid := current_manager_id();
  v_final_amount   numeric;
begin
  select * into v_offer from transfer_offers where id = p_offer_id and status = 'countered';
  if not found then
    raise exception 'Contraoferta no trobada o ja resolta';
  end if;

  if v_offer.counter_amount is null or v_offer.counter_amount <= 0 then
    raise exception 'Aquesta oferta no té una contraoferta vàlida';
  end if;

  -- Permís: Només el comprador pot acceptar la contraoferta
  if not is_current_user_admin() and v_caller_mgr <> v_offer.bidder_manager_id then
    raise exception 'Només el postor original pot acceptar la contraoferta';
  end if;

  v_final_amount := v_offer.counter_amount;

  select budget, display_name into v_buyer_budget, v_buyer_name from managers where id = v_offer.bidder_manager_id;
  if v_buyer_budget < v_final_amount then
    raise exception 'No tens prou pressupost disponible (%M requerits, %M disponibles)', v_final_amount, v_buyer_budget;
  end if;

  select * into v_card from fantasy_cards where id = v_offer.fantasy_card_id;
  v_seller := v_card.owner_manager_id;
  select full_name into v_player_name from club_players where id = v_card.club_player_id;

  -- Moviment de fons
  update managers set budget = budget - v_final_amount where id = v_offer.bidder_manager_id;
  if v_seller is not null then
    update managers set budget = budget + v_final_amount where id = v_seller;
  end if;

  -- Canvi de propietat
  update fantasy_cards
    set owner_manager_id = v_offer.bidder_manager_id,
        status = 'owned',
        current_price = v_final_amount,
        market_listed_at = null,
        market_expires_at = null
    where id = v_card.id;

  -- Acceptar oferta amb l'import final de la contraoferta
  update transfer_offers
    set amount = v_final_amount,
        status = 'accepted',
        resolved_at = now()
    where id = p_offer_id;

  -- Rebutjar altres ofertes
  update transfer_offers
    set status = 'rejected',
        resolved_at = now()
    where fantasy_card_id = v_card.id
      and id <> p_offer_id
      and status in ('pending', 'countered');

  insert into activity_log (manager_id, type, message)
    values (
      v_offer.bidder_manager_id,
      'purchase',
      format('%s ha acceptat la contraoferta i fitxat %s per %sM', coalesce(v_buyer_name, 'Un mànager'), coalesce(v_player_name, 'el jugador'), v_final_amount)
    );
end;
$$;

-- 7. Funció de resolució automàtica de fitxes de mercat caducades (2 dies)
create or replace function public.resolve_expired_market_listings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r_card           record;
  r_best_offer     record;
  v_resolved_count int := 0;
  v_expired_count  int := 0;
  v_player_name    text;
  v_buyer_name     text;
begin
  for r_card in
    select id, club_player_id, owner_manager_id
    from fantasy_cards
    where status = 'market'
      and market_expires_at is not null
      and market_expires_at <= now()
  loop
    -- Cas A: Jugador lliure / sense propietari (posat pel club / admin)
    if r_card.owner_manager_id is null then
      -- Buscar la millor oferta vàlida (la més alta d'un mànager que tingui prou pressupost)
      select o.id, o.bidder_manager_id, o.amount, m.budget, m.display_name
      into r_best_offer
      from transfer_offers o
      join managers m on m.id = o.bidder_manager_id
      where o.fantasy_card_id = r_card.id
        and o.status in ('pending', 'countered')
        and m.budget >= o.amount
      order by o.amount desc, o.created_at asc
      limit 1;

      if r_best_offer.id is not null then
        -- Atorgar al postor més alt
        select full_name into v_player_name from club_players where id = r_card.club_player_id;
        v_buyer_name := r_best_offer.display_name;

        -- Descomptar pressupost
        update managers set budget = budget - r_best_offer.amount where id = r_best_offer.bidder_manager_id;

        -- Assignar jugador
        update fantasy_cards
          set owner_manager_id = r_best_offer.bidder_manager_id,
              status = 'owned',
              current_price = r_best_offer.amount,
              market_listed_at = null,
              market_expires_at = null
          where id = r_card.id;

        -- Tancar ofertes
        update transfer_offers set status = 'accepted', resolved_at = now() where id = r_best_offer.id;
        update transfer_offers set status = 'rejected', resolved_at = now()
          where fantasy_card_id = r_card.id and id <> r_best_offer.id and status in ('pending', 'countered');

        insert into activity_log (manager_id, type, message)
          values (
            r_best_offer.bidder_manager_id,
            'purchase',
            format('%s ha guanyat la subhasta de %s per %sM', coalesce(v_buyer_name, 'Un mànager'), coalesce(v_player_name, 'el jugador'), r_best_offer.amount)
          );

        v_resolved_count := v_resolved_count + 1;
      else
        -- Cap oferta vàlida: desapareix del mercat (torna a owned sense propietari)
        update fantasy_cards
          set status = 'owned',
              market_listed_at = null,
              market_expires_at = null
          where id = r_card.id;

        update transfer_offers set status = 'expired', resolved_at = now()
          where fantasy_card_id = r_card.id and status in ('pending', 'countered');

        v_expired_count := v_expired_count + 1;
      end if;

    -- Cas B: Jugador amb propietari (posat a la venda per un altre mànager)
    else
      -- Si ningú ha comprat el jugador i expiren els 2 dies, torna a 'owned' amb el seu propietari
      update fantasy_cards
        set status = 'owned',
            market_listed_at = null,
            market_expires_at = null
        where id = r_card.id;

      update transfer_offers set status = 'expired', resolved_at = now()
        where fantasy_card_id = r_card.id and status in ('pending', 'countered');

      v_expired_count := v_expired_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'resolved_transfers', v_resolved_count,
    'expired_listings', v_expired_count
  );
end;
$$;

-- Permisos d'execució
grant execute on function public.accept_transfer_offer(uuid) to authenticated, anon, service_role;
grant execute on function public.reject_transfer_offer(uuid) to authenticated, anon, service_role;
grant execute on function public.counter_transfer_offer(uuid, numeric) to authenticated, anon, service_role;
grant execute on function public.reject_counter_offer(uuid) to authenticated, anon, service_role;
grant execute on function public.accept_counter_offer(uuid) to authenticated, anon, service_role;
grant execute on function public.dismiss_transfer_offer(uuid) to authenticated, anon, service_role;
grant execute on function public.resolve_expired_market_listings() to authenticated, anon, service_role;

-- Recarregar cache de PostgREST
notify pgrst, 'reload schema';


