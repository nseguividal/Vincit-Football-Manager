-- ============================================================================
-- VINCIT MANAGER — Afegir marcador de partits (gols a favor i en contra)
-- ============================================================================
-- Aquesta migració afegeix la columna match_score a player_matchday_stats
-- per registrar el marcador exacte del partit (ex: "4-2", "1-1", "0-3").
-- ============================================================================

alter table public.player_matchday_stats
  add column if not exists match_score text;

