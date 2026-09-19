-- ============================================================================
-- VINCIT MANAGER — Com afegir usuaris / managers
-- ============================================================================
-- Opció 1 (MOLT RECOMANADA): Fes-ho directament des de la web app a la
-- pestanya "Administració" -> "Usuaris", sense haver de tocar SQL!
--
-- Opció 2: Executant aquesta consulta al SQL Editor de Supabase:
-- Per crear un nou usuari:
-- Passos: menú esquerre → "Authentication" → pestanya "Users" → botó "Add user" (a dalt a la dreta)
-- Email inventat: nom_usuari@vincit.local (canvia 'nom_usuari' pel usuari de la persona i sempre seguit de @vincit.local)
-- Afegir també una constasenya
-- IMPORTANT!: marca la casella "Auto Confirm User" (així no envien email de confirmació)
-- Canviar el user <UUID> per el valor obtingut

-- Usant el command: insert into managers (user_id, username, display_name, budget, is_admin, is_coach) values ('<UUID>', 'test', 'Usuari de Proves', 100, true, true);
-- ============================================================================

-- Exemple per crear un Entrenador (amb accés a introduir punts dels seus equips):
-- Primer pots buscar els IDs dels seus equips amb: select id, name from club_teams;
/*
select admin_create_manager(
  'carles',
  'carles2026',
  'Carles (Entrenador)',
  100,
  '📋',
  false,                  -- no és admin
  true,                   -- SI és entrenador
  array[
    'ID_EQUIP_1_AQUI'::uuid,
    'ID_EQUIP_2_AQUI'::uuid
  ]
);
*/

-- Exemple per crear un Administrador amb accés total:
/*
select admin_create_manager(
  'admin',
  'admin_super_secret',
  'Administrador Vincit',
  150,
  '👑',
  true,                   -- SI és admin
  false,
  array[]::uuid[]
);
*/
