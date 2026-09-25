-- ============================================================================
-- Migració: Funció RPC per Desar i Actualitzar Puntuacions de Jornada de forma Segura
-- ============================================================================

-- Assegurar que les columnes existeixen a player_matchday_stats
alter table public.player_matchday_stats
  add column if not exists yellow_cards int default 0,
  add column if not exists red_cards int default 0,
  add column if not exists opponent_name text,
  add column if not exists is_home boolean default true,
  add column if not exists match_result text check (match_result in ('win', 'draw', 'loss')),
  add column if not exists match_score text;

-- Funció RPC amb SECURITY DEFINER per desar les puntuacions d'un equip en una jornada
create or replace function public.save_matchday_stats(
  p_team_id uuid,
  p_matchday_id uuid,
  p_stats jsonb,
  p_match_result text default null,
  p_match_score text default null,
  p_is_home boolean default true,
  p_opponent_name text default null
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
  v_elem jsonb;
  v_player_id uuid;
  v_attended boolean;
  v_points numeric;
  v_goals int;
  v_assists int;
  v_saves int;
  v_yc int;
  v_rc int;
  v_team_name text;
  v_md_label text;
  v_manager_name text;
  v_res_label text;
  v_score_log text;
  v_opp_log text;
  v_venue_log text;
  v_encoded_opp text;
  v_player_ids uuid[];
begin
  v_user_id := auth.uid();

  select id, is_admin, display_name into v_manager_id, v_is_admin, v_manager_name
  from public.managers
  where user_id = v_user_id;

  if v_manager_id is null then
    return json_build_object('success', false, 'error', 'No s''ha trobat el mànager associat a la sessió.');
  end if;

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

  -- Eliminar registres previs d'aquest equip i jornada per evitar duplicats o dades obsoletes
  if v_player_ids is not null and array_length(v_player_ids, 1) > 0 then
    delete from public.player_matchday_stats
    where matchday_id = p_matchday_id
      and club_player_id = any(v_player_ids);
  end if;

  -- Inserir les noves estadístiques
  for v_elem in select * from jsonb_array_elements(p_stats)
  loop
    v_player_id := (v_elem->>'club_player_id')::uuid;
    v_attended  := coalesce((v_elem->>'attended')::boolean, false);
    v_points    := case when v_attended then coalesce((v_elem->>'points')::numeric, 0) else 0 end;
    v_goals     := case when v_attended then coalesce((v_elem->>'goals')::int, 0) else 0 end;
    v_assists   := case when v_attended then coalesce((v_elem->>'assists')::int, 0) else 0 end;
    v_saves     := case when v_attended then coalesce((v_elem->>'saves')::int, 0) else 0 end;
    v_yc        := case when v_attended then coalesce((v_elem->>'yellow_cards')::int, 0) else 0 end;
    v_rc        := case when v_attended then coalesce((v_elem->>'red_cards')::int, 0) else 0 end;

    insert into public.player_matchday_stats (
      club_player_id,
      matchday_id,
      attended,
      points,
      goals,
      assists,
      saves,
      yellow_cards,
      red_cards,
      opponent_name,
      is_home,
      entered_by,
      match_result,
      match_score
    ) values (
      v_player_id,
      p_matchday_id,
      v_attended,
      v_points,
      v_goals,
      v_assists,
      v_saves,
      v_yc,
      v_rc,
      p_opponent_name,
      p_is_home,
      v_manager_id,
      p_match_result,
      p_match_score
    );
  end loop;

  -- Netejar logs previs de MATCH_RESULT d'aquest equip i jornada
  delete from public.activity_log
  where message ilike '%[MATCH_RESULT:' || p_team_id || ':' || p_matchday_id || ':%';

  select name into v_team_name from public.club_teams where id = p_team_id;
  select coalesce(label, 'Jornada ' || number) into v_md_label from public.matchdays where id = p_matchday_id;

  v_res_label := case when p_match_result = 'win' then 'Victòria' when p_match_result = 'draw' then 'Empat' else 'Derrota' end;
  v_score_log := case when p_match_score is not null and p_match_score <> '' then ' (' || p_match_score || ')' else '' end;
  v_opp_log   := case when p_opponent_name is not null and p_opponent_name <> '' then ' vs ' || p_opponent_name else '' end;
  v_venue_log := case when p_is_home then 'Casa' else 'Visitant' end;
  v_encoded_opp := coalesce(p_opponent_name, '');

  insert into public.activity_log (manager_id, type, message)
  values (
    v_manager_id,
    'points_added',
    coalesce(v_manager_name, 'Un entrenador') || ' ha desat les puntuacions de ' || coalesce(v_team_name, 'l''equip') || ' (' || coalesce(v_md_label, 'jornada') || ') (' || v_res_label || v_score_log || v_opp_log || ' - ' || v_venue_log || ') [MATCH_RESULT:' || p_team_id || ':' || p_matchday_id || ':' || coalesce(p_match_result, 'win') || ':' || coalesce(p_match_score, '') || ':' || case when p_is_home then 'home' else 'away' end || ':' || v_encoded_opp || ']'
  );

  return json_build_object('success', true);
end;
$$;

grant execute on function public.save_matchday_stats(uuid, uuid, jsonb, text, text, boolean, text) to authenticated, anon;

