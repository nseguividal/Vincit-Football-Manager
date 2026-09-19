-- ============================================================================
-- VINCIT MANAGER — Com eliminar usuaris / managers
-- ============================================================================
-- Opció 1 (MOLT RECOMANADA): Fes-ho directament des de la web app a la
-- pestanya "Administració" -> "Usuaris", sense haver de tocar SQL!

-- ============================================================================
-- Opció 2: Executant aquesta consulta al SQL Editor de Supabase:
-- modificar 'nom_usuari' pel nom assigant a l'usuari que volem borrar
delete from auth.users where email = 'nom_usuari@vincit.local';
delete from public.managers where username = 'nom_usuari';
