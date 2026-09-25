-- ============================================================================
-- VINCIT MANAGER — Afegir totes les columnes de partits, rival i targetes
-- ============================================================================
-- Executa aquest script a l'editor SQL de Supabase (SQL Editor -> New Query -> Run)
-- per afegir totes les columnes necessàries a player_matchday_stats.
-- ============================================================================

alter table public.player_matchday_stats
  add column if not exists match_result text check (match_result in ('win', 'draw', 'loss')),
  add column if not exists match_score text,
  add column if not exists opponent_name text,
  add column if not exists is_home boolean default true,
  add column if not exists yellow_cards int default 0,
  add column if not exists red_cards int default 0;

-- Notificar a PostgREST per recarregar la memòria cau de l'esquema
notify pgrst, 'reload schema';
