-- ============================================================================
-- VINCIT MANAGER — Afegir resultat de partits a les estadístiques
-- Executa aquesta sentència al SQL Editor de Supabase:
-- ============================================================================

alter table player_matchday_stats
add column if not exists match_result text check (match_result in ('win', 'draw', 'loss'));

