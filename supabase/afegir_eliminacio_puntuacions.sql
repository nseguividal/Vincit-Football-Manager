-- ============================================================================
-- Migració: Permetre l'eliminació de puntuacions d'una jornada (Entrenador / Admin)
-- ============================================================================

-- 1. Política RLS per permetre DELETE a player_matchday_stats
drop policy if exists "coach_delete_stats" on public.player_matchday_stats;

create policy "coach_delete_stats" on public.player_matchday_stats for delete
  using (
    is_current_user_admin() or
    exists (
      select 1 from public.coach_assignments ca
      join public.club_players cp on cp.team_id = ca.team_id
      where ca.manager_id = current_manager_id()
        and cp.id = player_matchday_stats.club_player_id
    )
  );

-- 2. Funció RPC SECURITY DEFINER per eliminar les puntuacions d'un equip en una jornada
create or replace function public.delete_matchday_stats(
  p_team_id uuid,
  p_matchday_id uuid
)
returns json
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_manager_id uuid;
  v_is_admin boolean;
  v_is_coach boolean;
  v_deleted_stats int := 0;
  v_player_ids uuid[];
  v_team_name text;
  v_md_label text;
  v_manager_name text;
begin
  v_user_id := auth.uid();
  
  -- Obtenir dades del mànager actual
  select id, is_admin, display_name into v_manager_id, v_is_admin, v_manager_name
  from public.managers
  where user_id = v_user_id;

  if v_manager_id is null then
    return json_build_object('success', false, 'error', 'No s''ha trobat el mànager associat.');
  end if;

  -- Comprovar permisos: només administrador o entrenador assignat a l'equip
  if not coalesce(v_is_admin, false) then
    select exists (
      select 1 from public.coach_assignments
      where manager_id = v_manager_id and team_id = p_team_id
    ) into v_is_coach;

    if not v_is_coach then
      return json_build_object('success', false, 'error', 'No tens permisos d''entrenador per a aquest equip.');
    end if;
  end if;

  -- Obtenir jugadors de l'equip
  select array_agg(id) into v_player_ids
  from public.club_players
  where team_id = p_team_id;

  if v_player_ids is not null and array_length(v_player_ids, 1) > 0 then
    -- Eliminar registres a player_matchday_stats
    delete from public.player_matchday_stats
    where matchday_id = p_matchday_id
      and club_player_id = any(v_player_ids);
    
    get diagnostics v_deleted_stats = row_count;
  end if;

  -- Netejar logs de resultat per evitar dades residuals
  delete from public.activity_log
  where message ilike '%[MATCH_RESULT:' || p_team_id || ':' || p_matchday_id || ':%';

  -- Obtenir noms per al log
  select name into v_team_name from public.club_teams where id = p_team_id;
  select coalesce(label, 'Jornada ' || number) into v_md_label from public.matchdays where id = p_matchday_id;

  -- Registrar l'activitat
  insert into public.activity_log (manager_id, type, message)
  values (
    v_manager_id,
    'points_added',
    coalesce(v_manager_name, 'Un entrenador') || ' ha eliminat el registre de puntuacions de ' || coalesce(v_team_name, 'l''equip') || ' (' || coalesce(v_md_label, 'jornada') || ')'
  );

  return json_build_object(
    'success', true,
    'deleted_count', v_deleted_stats
  );
end;
$$;

-- Donar permisos d'execució
grant execute on function public.delete_matchday_stats(uuid, uuid) to authenticated, anon;

