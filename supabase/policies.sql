-- ============================================================================
-- VINCIT MANAGER — Row Level Security (RLS)
-- Aplica aquest fitxer DESPRÉS de schema.sql
-- Filosofia:
--   - LECTURA: tothom (fins i tot sense sessió) pot veure classificació, mercat,
--     plantilles i equips -> és un joc social, tothom veu tothom.
--   - ESCRIPTURA: només l'usuari autenticat sobre les SEVES pròpies dades,
--     o l'admin sobre qualsevol cosa (is_admin = true).
-- ============================================================================

-- Activar RLS a totes les taules
alter table club_teams            enable row level security;
alter table club_players          enable row level security;
alter table matchdays             enable row level security;
alter table managers              enable row level security;
alter table coach_assignments     enable row level security;
alter table fantasy_cards         enable row level security;
alter table lineup_slots          enable row level security;
alter table player_matchday_stats enable row level security;
alter table transfer_offers       enable row level security;
alter table activity_log          enable row level security;

-- Funció auxiliar: manager_id de l'usuari actual
create or replace function current_manager_id() returns uuid as $$
  select id from managers where user_id = auth.uid();
$$ language sql stable;

create or replace function is_current_user_admin() returns boolean as $$
  select coalesce((select is_admin from managers where user_id = auth.uid()), false);
$$ language sql stable;

-- ---------- LECTURA PÚBLICA (tothom, fins i tot anònim) ----------
create policy "read_all_club_teams"   on club_teams   for select using (true);
create policy "read_all_club_players" on club_players for select using (true);
create policy "read_all_matchdays"    on matchdays    for select using (true);
create policy "read_all_managers"     on managers     for select using (true);
create policy "read_all_fantasy"      on fantasy_cards for select using (true);
create policy "read_all_lineups"      on lineup_slots for select using (true);
create policy "read_all_stats"        on player_matchday_stats for select using (true);
create policy "read_all_log"          on activity_log for select using (true);
create policy "read_own_offers"       on transfer_offers for select
  using (bidder_manager_id = current_manager_id() or is_current_user_admin());
create policy "read_coach_assign"     on coach_assignments for select using (true);

-- ---------- ESCRIPTURA: MANAGERS ----------
-- Un usuari pot editar el seu propi registre de manager (p.ex avatar), no el budget/admin
create policy "update_own_manager" on managers for update
  using (user_id = auth.uid() or is_current_user_admin());
create policy "admin_insert_manager" on managers for insert
  with check (is_current_user_admin() or user_id = auth.uid());

-- ---------- ESCRIPTURA: LINEUP (canvi de titulars) ----------
create policy "manage_own_lineup" on lineup_slots for all
  using (manager_id = current_manager_id() or is_current_user_admin())
  with check (manager_id = current_manager_id() or is_current_user_admin());

-- ---------- ESCRIPTURA: OFERTES (formulari d'ofertes) ----------
create policy "create_own_offer" on transfer_offers for insert
  with check (bidder_manager_id = current_manager_id() or is_current_user_admin());
create policy "update_own_offer" on transfer_offers for update
  using (bidder_manager_id = current_manager_id() or is_current_user_admin());

-- ---------- ESCRIPTURA: FANTASY_CARDS (venda / compra / mercat) ----------
-- Només el propietari actual (per vendre) o l'admin (per gestionar el mercat setmanal)
create policy "update_own_card" on fantasy_cards for update
  using (owner_manager_id = current_manager_id() or is_current_user_admin());
create policy "admin_insert_card" on fantasy_cards for insert
  with check (is_current_user_admin());

-- ---------- ESCRIPTURA: STATS (formulari de l'entrenador) ----------
-- Només un entrenador assignat a aquell equip, o admin
create policy "coach_insert_stats" on player_matchday_stats for insert
  with check (
    is_current_user_admin() or
    exists (
      select 1 from coach_assignments ca
      join club_players cp on cp.team_id = ca.team_id
      where ca.manager_id = current_manager_id()
        and cp.id = player_matchday_stats.club_player_id
    )
  );
create policy "coach_update_stats" on player_matchday_stats for update
  using (
    is_current_user_admin() or
    exists (
      select 1 from coach_assignments ca
      join club_players cp on cp.team_id = ca.team_id
      where ca.manager_id = current_manager_id()
        and cp.id = player_matchday_stats.club_player_id
    )
  );

-- ---------- ESCRIPTURA: LOG ----------
create policy "insert_own_log" on activity_log for insert
  with check (manager_id = current_manager_id() or is_current_user_admin());

-- ---------- ADMIN: control total sobre taules mestres ----------
create policy "admin_manage_teams"   on club_teams   for all using (is_current_user_admin());
create policy "admin_manage_players" on club_players for all using (is_current_user_admin());
create policy "admin_manage_matchdays" on matchdays  for all using (is_current_user_admin());
create policy "admin_manage_coach_assign" on coach_assignments for all using (is_current_user_admin());
