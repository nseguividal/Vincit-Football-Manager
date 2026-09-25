-- ============================================================================
-- MIGRACIÓ: Afegir suport per a Jornades Extres i actualitzar v_weekly_scores
-- ============================================================================

-- 1. Afegir columna is_extra a la taula matchdays
alter table public.matchdays
  add column if not exists is_extra boolean not null default false;

-- 2. Actualitzar vista v_weekly_scores perquè no sumi les jornades extres
create or replace view public.v_weekly_scores
with (security_invoker = true) as
select
  m.id            as manager_id,
  m.display_name  as display_name,
  m.avatar_emoji  as avatar_emoji,
  md.id           as matchday_id,
  md.number       as matchday_number,
  coalesce(sum(pms.points), 0) as points
from public.managers m
cross join public.matchdays md
left join public.lineup_slots ls on ls.manager_id = m.id
left join public.fantasy_cards fc on fc.id = ls.fantasy_card_id
left join public.player_matchday_stats pms
  on pms.club_player_id = fc.club_player_id and pms.matchday_id = md.id
where md.is_extra = false or md.is_extra is null
group by m.id, m.display_name, m.avatar_emoji, md.id, md.number;

-- 3. Actualitzar vista v_total_standings
create or replace view public.v_total_standings
with (security_invoker = true) as
select
  manager_id,
  display_name,
  avatar_emoji,
  sum(points) as total_points
from public.v_weekly_scores
group by manager_id, display_name, avatar_emoji
order by total_points desc;

