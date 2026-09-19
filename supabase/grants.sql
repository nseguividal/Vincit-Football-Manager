-- ============================================================================
-- VINCIT MANAGER — Permisos base (GRANT)
-- Aplica aquest fitxer DESPRÉS de policies.sql i functions.sql
--
-- Per què cal això: activar Row Level Security NOMÉS restringeix files, no
-- dona accés. Els rols "anon" (visitant sense sessió) i "authenticated"
-- (usuari amb sessió) necessiten, a més, el permís base GRANT sobre cada
-- taula. Quan crees taules des de la interfície de Supabase, això es
-- concedeix sol; creant-les per SQL directe (com hem fet), cal fer-ho a mà.
-- Un cop fet això, les policies de policies.sql ja filtren correctament
-- quines FILES pot veure/tocar cadascú.
-- ============================================================================

-- Lectura pública (anon = qualsevol visitant, encara sense iniciar sessió)
grant select on club_teams, club_players, matchdays, managers, coach_assignments,
  fantasy_cards, lineup_slots, player_matchday_stats, activity_log,
  v_weekly_scores, v_total_standings
  to anon;

grant select on transfer_offers to anon; -- RLS ja limita a "les meves ofertes"

-- Usuaris amb sessió: lectura + escriptura (RLS decideix quines files exactes)
grant select, insert, update, delete on
  club_teams, club_players, matchdays, managers, coach_assignments,
  fantasy_cards, lineup_slots, player_matchday_stats, activity_log, transfer_offers
  to authenticated;

grant select on v_weekly_scores, v_total_standings to authenticated;

-- Permís per executar les funcions
grant execute on function list_player_for_sale(uuid, numeric) to authenticated;
grant execute on function accept_transfer_offer(uuid) to authenticated;
grant execute on function admin_create_manager(text, text, text, numeric, text, boolean, boolean, uuid[]) to authenticated;
grant execute on function admin_update_manager_password(uuid, text) to authenticated;
grant execute on function admin_update_manager(uuid, text, numeric, text, boolean, boolean, uuid[]) to authenticated;
grant execute on function admin_delete_manager(uuid) to authenticated;