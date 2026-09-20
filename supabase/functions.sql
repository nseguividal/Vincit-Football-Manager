-- ============================================================================
-- VINCIT MANAGER — Funcions RPC
-- Aplica aquest fitxer DESPRÉS de schema.sql i policies.sql
-- Aquestes operacions toquen diverses taules alhora (diners + propietat), per
-- això es fan com a funcions atòmiques en comptes de diversos "update" des
-- del client (evita que dos managers deixin les dades a mig fer).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Posar un jugador propi a la venda (formulari de venda)
-- ----------------------------------------------------------------------------
create or replace function list_player_for_sale(p_card_id uuid, p_price numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_manager_id uuid := current_manager_id();
  v_name text;
begin
  select owner_manager_id into v_owner from fantasy_cards where id = p_card_id;

  if v_owner is null or (v_owner <> v_manager_id and not is_current_user_admin()) then
    raise exception 'No pots vendre un jugador que no és teu';
  end if;

  update fantasy_cards
    set status = 'market',
        current_price = p_price,
        market_listed_at = now(),
        market_expires_at = now() + interval '2 days'
    where id = p_card_id;

  -- El jugador es manté al seu cinc titular durant la jornada encara que estigui a la venda

  select cp.full_name into v_name from fantasy_cards fc
    join club_players cp on cp.id = fc.club_player_id where fc.id = p_card_id;

  insert into activity_log (manager_id, type, message)
    values (v_owner, 'sale', format('%s ha posat %s a la venda per %sM', 
      (select display_name from managers where id = v_owner), v_name, p_price));
end;
$$;

-- ----------------------------------------------------------------------------
-- Acceptar una oferta (normalment l'executa l'admin en tancar la setmana,
-- o el venedor directament des de la seva pestanya d'Ofertes)
-- ----------------------------------------------------------------------------
create or replace function accept_transfer_offer(p_offer_id uuid)
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

  -- Només l'admin, o el venedor actual, pot acceptar
  if not is_current_user_admin() and (v_seller is null or v_caller_mgr <> v_seller) then
    raise exception 'No tens permís per acceptar aquesta oferta';
  end if;

  v_final_amount := v_offer.amount;

  select budget, display_name into v_buyer_budget, v_buyer_name from managers where id = v_offer.bidder_manager_id;
  if v_buyer_budget < v_final_amount then
    raise exception 'El comprador no té prou pressupost';
  end if;

  select full_name into v_player_name from club_players where id = v_card.club_player_id;

  -- Moviment de diners
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

  -- Tanquem l'oferta acceptada i rebutgem la resta d'ofertes pendents per la mateixa fitxa
  update transfer_offers set status = 'accepted', resolved_at = now() where id = p_offer_id;
  update transfer_offers set status = 'rejected', resolved_at = now()
    where fantasy_card_id = v_card.id and id <> p_offer_id and status in ('pending', 'countered');

  insert into activity_log (manager_id, type, message)
    values (v_offer.bidder_manager_id, 'purchase',
      format('%s ha fitxat %s per %sM', coalesce(v_buyer_name, 'Un mànager'), coalesce(v_player_name, 'el jugador'), v_final_amount));
end;
$$;

-- ----------------------------------------------------------------------------
-- Rebutjar una oferta de traspàs
-- ----------------------------------------------------------------------------
create or replace function reject_transfer_offer(p_offer_id uuid)
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

-- ----------------------------------------------------------------------------
-- Fer una contraoferta (Només el venedor)
-- ----------------------------------------------------------------------------
create or replace function counter_transfer_offer(p_offer_id uuid, p_counter_amount numeric)
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

-- ----------------------------------------------------------------------------
-- Rebutjar contraoferta (Comprador) mantenint l'oferta inicial
-- ----------------------------------------------------------------------------
create or replace function reject_counter_offer(p_offer_id uuid)
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

-- ----------------------------------------------------------------------------
-- Acceptar contraoferta (Comprador)
-- ----------------------------------------------------------------------------
create or replace function accept_counter_offer(p_offer_id uuid)
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

  update managers set budget = budget - v_final_amount where id = v_offer.bidder_manager_id;
  if v_seller is not null then
    update managers set budget = budget + v_final_amount where id = v_seller;
  end if;

  update fantasy_cards
    set owner_manager_id = v_offer.bidder_manager_id,
        status = 'owned',
        current_price = v_final_amount,
        market_listed_at = null,
        market_expires_at = null
    where id = v_card.id;

  update transfer_offers
    set amount = v_final_amount,
        status = 'accepted',
        resolved_at = now()
    where id = p_offer_id;

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

-- ----------------------------------------------------------------------------
-- Resolució automàtica de fitxes de mercat caducades (2 dies)
-- ----------------------------------------------------------------------------
create or replace function resolve_expired_market_listings()
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
    if r_card.owner_manager_id is null then
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
        select full_name into v_player_name from club_players where id = r_card.club_player_id;
        v_buyer_name := r_best_offer.display_name;

        update managers set budget = budget - r_best_offer.amount where id = r_best_offer.bidder_manager_id;

        update fantasy_cards
          set owner_manager_id = r_best_offer.bidder_manager_id,
              status = 'owned',
              current_price = r_best_offer.amount,
              market_listed_at = null,
              market_expires_at = null
          where id = r_card.id;

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
        update fantasy_cards
          set status = 'owned',
              market_listed_at = null,
              market_expires_at = null
          where id = r_card.id;

        update transfer_offers set status = 'expired', resolved_at = now()
          where fantasy_card_id = r_card.id and status in ('pending', 'countered');

        v_expired_count := v_expired_count + 1;
      end if;
    else
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

-- ----------------------------------------------------------------------------
-- Crear un manager / usuari (accés només per a Administradors)
-- ----------------------------------------------------------------------------
create or replace function admin_create_manager(
  p_username text,
  p_password text,
  p_display_name text,
  p_budget numeric default 100,
  p_avatar_emoji text default '⚽',
  p_is_admin boolean default false,
  p_is_coach boolean default false,
  p_team_ids uuid[] default array[]::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid;
  v_email text;
  v_encrypted_pw text;
  v_team_id uuid;
  v_mgr_id uuid;
begin
  if not is_current_user_admin() then
    raise exception 'Només els administradors poden crear nous usuaris';
  end if;

  p_username := trim(lower(p_username));
  if p_username = '' or p_password = '' or trim(p_display_name) = '' then
    raise exception 'Falten camps obligatoris (usuari, contrasenya, nom)';
  end if;

  if exists (select 1 from public.managers where username = p_username) then
    raise exception 'Aquest nom d''usuari ja està en ús';
  end if;

  v_email := p_username || '@vincit.local';

  -- Si existia un usuari orfe a auth.users amb aquest email (d'un intent previ fallit), el netegem
  delete from auth.identities where user_id in (select id from auth.users where email = v_email);
  delete from auth.users where email = v_email;

  v_user_id := gen_random_uuid();
  v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf', 10));

  -- Inserció a auth.users (amb tots els camps de confirmació necessaris per GoTrue)
  insert into auth.users (
    id,
    instance_id,
    role,
    aud,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    is_sso_user,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    created_at,
    updated_at
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    v_encrypted_pw,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'username', p_username,
      'display_name', p_display_name
    ),
    false,
    false,
    '',
    '',
    '',
    '',
    now(),
    now()
  );

  -- Inserció a auth.identities
  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    v_user_id::text,
    now(),
    now(),
    now()
  );

  -- Inserció a public.managers
  insert into public.managers (
    user_id,
    username,
    display_name,
    avatar_emoji,
    budget,
    is_admin,
    is_coach
  ) values (
    v_user_id,
    p_username,
    p_display_name,
    coalesce(nullif(p_avatar_emoji, ''), '⚽'),
    coalesce(p_budget, 100),
    coalesce(p_is_admin, false),
    coalesce(p_is_coach, false)
  ) returning id into v_mgr_id;

  -- Assignació d'equips si és entrenador
  if p_is_coach and p_team_ids is not null then
    foreach v_team_id in array p_team_ids loop
      insert into public.coach_assignments (manager_id, team_id)
      values (v_mgr_id, v_team_id)
      on conflict do nothing;
    end loop;
  end if;

  return v_user_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Canviar contrasenya d'un manager (per si un jugador l'oblida)
-- ----------------------------------------------------------------------------
create or replace function admin_update_manager_password(p_manager_id uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid;
begin
  if not is_current_user_admin() then
    raise exception 'Només els administradors poden canviar contrasenyes d''altres usuaris';
  end if;
 
  select user_id into v_user_id from public.managers where id = p_manager_id;
  if not found then
    raise exception 'Manager no trobat';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = v_user_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Actualitzar dades d'un manager (perfil, rol, diners, equips)
-- ----------------------------------------------------------------------------
create or replace function admin_update_manager(
  p_manager_id uuid,
  p_display_name text,
  p_budget numeric,
  p_avatar_emoji text,
  p_is_admin boolean,
  p_is_coach boolean,
  p_team_ids uuid[] default array[]::uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_team_id uuid;
begin
  if not is_current_user_admin() then
    raise exception 'Només els administradors poden modificar dades dels usuaris';
  end if;

  update public.managers
  set display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
      budget = coalesce(p_budget, budget),
      avatar_emoji = coalesce(nullif(p_avatar_emoji, ''), avatar_emoji),
      is_admin = coalesce(p_is_admin, is_admin),
      is_coach = coalesce(p_is_coach, is_coach)
  where id = p_manager_id;

  -- Gestionar assignació d'equips per entrenador
  delete from public.coach_assignments where manager_id = p_manager_id;

  if coalesce(p_is_coach, false) and p_team_ids is not null then
    foreach v_team_id in array p_team_ids loop
      insert into public.coach_assignments (manager_id, team_id)
      values (p_manager_id, v_team_id)
      on conflict do nothing;
    end loop;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Eliminar completament un manager i el seu compte d'auth
-- ----------------------------------------------------------------------------
create or replace function admin_delete_manager(p_manager_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid;
begin
  if not is_current_user_admin() then
    raise exception 'Només els administradors poden eliminar usuaris';
  end if;

  select user_id into v_user_id from public.managers where id = p_manager_id;
  if not found then
    raise exception 'Manager no trobat';
  end if;

  -- 1. Alliberar jugadors que tingués comprats perquè tornin al mercat
  update public.fantasy_cards
  set owner_manager_id = null,
      status = 'market'
  where owner_manager_id = p_manager_id;

  -- 2. Eliminar registres relacionats a taules auxiliars
  delete from public.lineup_slots where manager_id = p_manager_id;
  delete from public.coach_assignments where manager_id = p_manager_id;
  delete from public.transfer_offers where bidder_manager_id = p_manager_id;
  delete from public.managers where id = p_manager_id;

  -- 3. Eliminar compte d'autenticació
  if v_user_id is not null then
    delete from auth.identities where user_id = v_user_id;
    delete from auth.users where id = v_user_id;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Crear un nou equip del club (només Administradors)
-- ----------------------------------------------------------------------------
create or replace function admin_create_team(p_name text, p_category text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
begin
  if not is_current_user_admin() then
    raise exception 'Només els administradors poden crear equips';
  end if;

  p_name := trim(p_name);
  if p_name = '' then
    raise exception 'El nom de l''equip és obligatori';
  end if;

  insert into public.club_teams (name, category)
  values (p_name, nullif(trim(p_category), ''))
  returning id into v_team_id;

  return v_team_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Modificar un equip existent (només Administradors)
-- ----------------------------------------------------------------------------
create or replace function admin_update_team(p_team_id uuid, p_name text, p_category text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_current_user_admin() then
    raise exception 'Només els administradors poden modificar equips';
  end if;

  p_name := trim(p_name);
  if p_name = '' then
    raise exception 'El nom de l''equip és obligatori';
  end if;

  update public.club_teams
  set name = p_name,
      category = nullif(trim(p_category), '')
  where id = p_team_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Eliminar un equip i tots els seus jugadors (només Administradors)
-- ----------------------------------------------------------------------------
create or replace function admin_delete_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_current_user_admin() then
    raise exception 'Només els administradors poden eliminar equips';
  end if;

  delete from public.club_teams where id = p_team_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Crear un nou jugador del club i la seva fitxa Fantasy (només Administradors)
-- ----------------------------------------------------------------------------
create or replace function admin_create_player(
  p_team_id uuid,
  p_full_name text,
  p_position text,
  p_initial_price numeric default 5,
  p_status text default 'market'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_team_name text;
  v_status text := coalesce(nullif(p_status, ''), 'market');
  v_price numeric := coalesce(p_initial_price, 5);
begin
  if not is_current_user_admin() then
    raise exception 'Només els administradors poden afegir jugadors';
  end if;

  p_full_name := trim(p_full_name);
  if p_full_name = '' then
    raise exception 'El nom del jugador és obligatori';
  end if;

  p_position := upper(trim(p_position));
  if p_position not in ('PORTER', 'TANCA', 'ALA', 'PIVOT') then
    raise exception 'Posició no vàlida. Ha de ser PORTER, TANCA, ALA o PIVOT';
  end if;

  select name into v_team_name from public.club_teams where id = p_team_id;
  if not found then
    raise exception 'Equip no trobat';
  end if;

  -- Inserció a club_players
  insert into public.club_players (team_id, full_name, position, active)
  values (p_team_id, p_full_name, p_position, true)
  returning id into v_player_id;

  -- Inserció a fantasy_cards
  insert into public.fantasy_cards (
    club_player_id,
    current_price,
    status,
    market_listed_at,
    market_expires_at
  ) values (
    v_player_id,
    v_price,
    v_status,
    case when v_status = 'market' then now() else null end,
    case when v_status = 'market' then now() + interval '7 days' else null end
  );

  -- Notificació al registre d'activitat
  insert into public.activity_log (type, message)
  values (
    'market_new',
    format('🆕 %s (%s) s''ha incorporat a %s per %sM', p_full_name, p_position, v_team_name, v_price)
  );

  return v_player_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Modificar dades d'un jugador i la seva fitxa Fantasy (només Administradors)
-- ----------------------------------------------------------------------------
create or replace function admin_update_player(
  p_player_id uuid,
  p_team_id uuid,
  p_full_name text,
  p_position text,
  p_price numeric default null,
  p_status text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_current_user_admin() then
    raise exception 'Només els administradors poden modificar jugadors';
  end if;

  p_full_name := trim(p_full_name);
  if p_full_name = '' then
    raise exception 'El nom del jugador és obligatori';
  end if;

  p_position := upper(trim(p_position));
  if p_position not in ('PORTER', 'TANCA', 'ALA', 'PIVOT') then
    raise exception 'Posició no vàlida. Ha de ser PORTER, TANCA, ALA o PIVOT';
  end if;

  update public.club_players
  set full_name = p_full_name,
      position = p_position,
      team_id = p_team_id
  where id = p_player_id;

  -- Actualitzar preu i/o estat a fantasy_cards si s'han especificat
  if p_price is not null or p_status is not null then
    update public.fantasy_cards
    set current_price = coalesce(p_price, current_price),
        status = coalesce(nullif(p_status, ''), status),
        market_listed_at = case
          when p_status = 'market' and status <> 'market' then now()
          when p_status = 'owned' then null
          else market_listed_at
        end,
        market_expires_at = case
          when p_status = 'market' and status <> 'market' then now() + interval '7 days'
          when p_status = 'owned' then null
          else market_expires_at
        end
    where club_player_id = p_player_id;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Eliminar un jugador del club i la seva fitxa Fantasy (només Administradors)
-- ----------------------------------------------------------------------------
create or replace function admin_delete_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_current_user_admin() then
    raise exception 'Només els administradors poden eliminar jugadors';
  end if;

  -- Eliminació en cascada des de club_players
  delete from public.club_players where id = p_player_id;
end;
$$;



