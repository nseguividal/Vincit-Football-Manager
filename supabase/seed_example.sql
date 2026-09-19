-- ============================================================================
-- Dades d'exemple opcionals — útils per provar l'app abans de posar-hi les
-- dades reals del Vincit. Executa-ho a l'SQL Editor un cop aplicats
-- schema.sql + policies.sql + functions.sql.
-- ============================================================================

insert into club_teams (name, category) values
  ('Aleví A', 'Aleví'),
  ('Cadet B Femení', 'Cadet'),
  ('Sènior A', 'Sènior')
on conflict do nothing;

insert into club_players (team_id, full_name, position)
select id, v.full_name, v.position
from club_teams, (values
  ('Marc Solé', 'PORTER'),
  ('Pau Riera', 'TANCA'),
  ('Biel Ferrer', 'ALA'),
  ('Aina Costa', 'ALA'),
  ('Oriol Vidal', 'PIVOT')
) as v(full_name, position)
where club_teams.name = 'Sènior A';

insert into matchdays (number, label, starts_at, ends_at, is_current) values
  (1, 'Jornada 1 - Setembre 2026', '2026-09-14', '2026-09-20', true)
on conflict do nothing;

-- Cada club_player necessita la seva fitxa fantasy perquè aparegui a l'app
insert into fantasy_cards (club_player_id, current_price, status)
select id, 8, 'market' from club_players
on conflict (club_player_id) do nothing;

-- ============================================================================
-- Per crear els MANAGERS (usuaris del joc) cal fer-ho en dos passos, perquè
-- necessiten un usuari real d'autenticació:
--
--   1. A Supabase Dashboard -> Authentication -> Users -> "Add user"
--      Email: jordi@vincit.local      Password: (la que vulguis)
--      (Marca "Auto Confirm User")
--
--   2. Copia el UUID que se li assigna i executa:
--      insert into managers (user_id, username, display_name, is_admin)
--      values ('<uuid-copiat>', 'jordi', 'Jordi Puig', true);
--
-- L'administrador del joc ha de tenir is_admin = true.
-- Un entrenador ha de tenir is_coach = true, i després afegir-lo a
-- coach_assignments amb l'equip que entrena.
-- ============================================================================
