-- ============================================================================
-- MIGRACIÓ: Bloqueig de modificacions del Cinc Titular durant Jornades Actives
-- i Manteniment de jugadors venuts al 5 titular fins a finalitzar la jornada
-- ============================================================================

-- 1. Actualitzar list_player_for_sale perquè posar a la venda no elimini el jugador del 5 titular
create or replace function public.list_player_for_sale(p_card_id uuid, p_price numeric)
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

  -- El jugador es manté al seu cinc titular durant la jornada encara que es posi a la venda

  select cp.full_name into v_name from fantasy_cards fc
    join club_players cp on cp.id = fc.club_player_id where fc.id = p_card_id;

  insert into activity_log (manager_id, type, message)
    values (v_owner, 'sale', format('%s ha posat %s a la venda per %sM', 
      (select display_name from managers where id = v_owner), v_name, p_price));
end;
$$;

-- 2. Funció per comprovar si hi ha una jornada activa en aquest instant exacte (00:00h a 24:00h)
create or replace function public.is_any_matchday_active()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.matchdays
    where starts_at <= current_date and ends_at >= current_date
  );
$$;

-- 3. Funció de neteja de slots orfes (jugadors venuts després de finalitzar la jornada)
create or replace function public.cleanup_expired_lineup_slots()
returns void
language plpgsql
security definer
as $$
begin
  -- Si NO hi ha cap jornada activa en curs, s'eliminen de lineup_slots els jugadors que ja no pertanyen al mànager
  if not is_any_matchday_active() then
    delete from public.lineup_slots ls
    where not exists (
      select 1 from public.fantasy_cards fc
      where fc.id = ls.fantasy_card_id
        and fc.owner_manager_id = ls.manager_id
    );
  end if;
end;
$$;

