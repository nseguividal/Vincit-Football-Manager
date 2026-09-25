-- ============================================================================
-- VINCIT MANAGER — Afegir columna 'dorsal' a club_players
-- ============================================================================
-- Aquesta migració afegeix el número de samarreta (dorsal) als jugadors del club
-- i actualitza les funcions d'administració.
-- ============================================================================

-- 1. Afegir la columna dorsal si no existeix
alter table public.club_players add column if not exists dorsal integer;

-- 2. Actualitzar o recrear admin_create_player amb suport per dorsal
create or replace function public.admin_create_player(
  p_team_id uuid,
  p_full_name text,
  p_position text,
  p_initial_price numeric default 5,
  p_status text default 'market',
  p_dorsal integer default null
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

  -- Inserció a club_players amb dorsal
  insert into public.club_players (team_id, full_name, position, dorsal, active)
  values (p_team_id, p_full_name, p_position, p_dorsal, true)
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
    format('🆕 %s%s (%s) s''ha incorporat a %s per %sM',
      p_full_name,
      case when p_dorsal is not null then format(' (#%s)', p_dorsal) else '' end,
      p_position,
      v_team_name,
      v_price
    )
  );

  return v_player_id;
end;
$$;

-- 3. Actualitzar admin_update_player amb suport per dorsal
create or replace function public.admin_update_player(
  p_player_id uuid,
  p_team_id uuid,
  p_full_name text,
  p_position text,
  p_price numeric default null,
  p_status text default null,
  p_dorsal integer default null
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
      team_id = p_team_id,
      dorsal = p_dorsal
  where id = p_player_id;

  -- Actualitzar preu i/o estat a fantasy_cards si s'han especificat
  if p_price is not null or p_status is not null then
    update public.fantasy_cards
    set current_price = coalesce(p_price, current_price),
        status = coalesce(nullif(p_status, ''), status),
        market_listed_at = case
          when p_status = 'market' and status != 'market' then now()
          when p_status = 'owned' then null
          else market_listed_at
        end,
        market_expires_at = case
          when p_status = 'market' and status != 'market' then now() + interval '7 days'
          when p_status = 'owned' then null
          else market_expires_at
        end
    where club_player_id = p_player_id;
  end if;
end;
$$;

grant execute on function public.admin_create_player(uuid, text, text, numeric, text, integer) to authenticated, anon;
grant execute on function public.admin_update_player(uuid, uuid, text, text, numeric, text, integer) to authenticated, anon;
notify pgrst, 'reload schema';

