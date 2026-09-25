-- ============================================================================
-- MIGRACIÓ: Activar SECURITY INVOKER a les vistes per complir amb les regles
-- de seguretat de Supabase (Database Advisor / Linter)
-- ============================================================================

-- Modificar les vistes existents directament:
alter view if exists public.v_weekly_scores set (security_invoker = true);
alter view if exists public.v_total_standings set (security_invoker = true);

