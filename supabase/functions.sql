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

  -- si estava alineat com a titular, el traiem de l'onze
  delete from lineup_slots where fantasy_card_id = p_card_id;

  select cp.full_name into v_name from fantasy_cards fc
    join club_players cp on cp.id = fc.club_player_id where fc.id = p_card_id;

  insert into activity_log (manager_id, type, message)
    values (v_owner, 'sale', format('%s ha posat %s a la venda per %sM', 
      (select display_name from managers where id = v_owner), v_name, p_price));
end;
$$;

-- ----------------------------------------------------------------------------
-- Acceptar una oferta (normalment l'executa l'admin en tancar la setmana,
-- o el propietari si vol acceptar una oferta concreta sobre la seva venda)
-- ----------------------------------------------------------------------------
create or replace function accept_transfer_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer   transfer_offers%rowtype;
  v_card    fantasy_cards%rowtype;
  v_seller  uuid;
  v_buyer_budget numeric;
  v_player_name text;
begin
  select * into v_offer from transfer_offers where id = p_offer_id and status = 'pending';
  if not found then
    raise exception 'Oferta no trobada o ja resolta';
  end if;

  select * into v_card from fantasy_cards where id = v_offer.fantasy_card_id;
  v_seller := v_card.owner_manager_id;

  -- Només l'admin, o el venedor actual, pot acceptar
  if not is_current_user_admin() and current_manager_id() <> v_seller then
    raise exception 'No tens permís per acceptar aquesta oferta';
  end if;

  select budget into v_buyer_budget from managers where id = v_offer.bidder_manager_id;
  if v_buyer_budget < v_offer.amount then
    raise exception 'El comprador no té prou pressupost';
  end if;

  select full_name into v_player_name from club_players where id = v_card.club_player_id;

  -- Moviment de diners
  update managers set budget = budget - v_offer.amount where id = v_offer.bidder_manager_id;
  if v_seller is not null then
    update managers set budget = budget + v_offer.amount where id = v_seller;
  end if;

  -- Canvi de propietat
  update fantasy_cards
    set owner_manager_id = v_offer.bidder_manager_id,
        status = 'owned',
        current_price = v_offer.amount,
        market_listed_at = null,
        market_expires_at = null
    where id = v_card.id;

  -- Tanquem l'oferta acceptada i rebutgem la resta d'ofertes pendents per la mateixa fitxa
  update transfer_offers set status = 'accepted', resolved_at = now() where id = p_offer_id;
  update transfer_offers set status = 'rejected', resolved_at = now()
    where fantasy_card_id = v_card.id and id <> p_offer_id and status = 'pending';

  insert into activity_log (manager_id, type, message)
    values (v_offer.bidder_manager_id, 'purchase',
      format('%s ha fitxat %s per %sM', 
        (select display_name from managers where id = v_offer.bidder_manager_id), v_player_name, v_offer.amount));
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

  if exists (select 1 from managers where username = p_username) then
    raise exception 'Aquest nom d''usuari ja està en ús';
  end if;

  v_email := p_username || '@vincit.local';
  v_user_id := gen_random_uuid();
  v_encrypted_pw := crypt(p_password, gen_salt('bf'));

  -- Inserció a auth.users
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
    jsonb_build_object('username', p_username, 'display_name', p_display_name),
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
    v_user_id,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email),
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

  select user_id into v_user_id from managers where id = p_manager_id;
  if not found then
    raise exception 'Manager no trobat';
  end if;

  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf')),
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



