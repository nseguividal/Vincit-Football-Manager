-- ============================================================================
-- VINCIT MANAGER — Funcions d'administració per a Equips i Jugadors
-- Executa aquest script al SQL Editor de Supabase (botó "Run")
-- ============================================================================

-- 1. Crear un nou equip del club
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

-- 2. Modificar un equip existent
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

-- 3. Eliminar un equip i tots els seus jugadors
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

-- 4. Crear un nou jugador del club i la seva fitxa Fantasy
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

-- 5. Modificar dades d'un jugador i la seva fitxa Fantasy
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

-- 6. Eliminar un jugador del club i la seva fitxa Fantasy
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

