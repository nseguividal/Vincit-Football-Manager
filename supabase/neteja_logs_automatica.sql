-- ============================================================================
-- VINCIT MANAGER — Neteja automàtica de logs (Activity Log) > 30 dies
-- ============================================================================
-- Aquesta migració crea una tasca programada a Postgres (pg_cron) per esborrar
-- automàticament cada dia a les 03:00 AM els registres de activity_log que tinguin
-- més de 30 dies d'antiguitat, alliberant espai a la base de dades.
-- ============================================================================

-- 1. Activar l'extensió pg_cron (nativa a Supabase)
create extension if not exists pg_cron;

-- 2. Concedir permisos de pg_cron si cal
grant usage on schema cron to postgres;

-- 3. Crear una funció dedicada per a la neteja
create or replace function public.cleanup_old_activity_logs()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.activity_log
  where created_at < now() - interval '30 days';
end;
$$;

-- 4. Programar la tasca automàtica cada dia a les 03:00 de la matinada (cron job)
-- Si ja existia, primer la desprogramem per evitar duplicats:
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup_old_activity_logs_daily') then
    perform cron.unschedule('cleanup_old_activity_logs_daily');
  end if;
end $$;

select cron.schedule(
  'cleanup_old_activity_logs_daily',
  '0 3 * * *', -- Cada dia a les 03:00 AM
  $$select public.cleanup_old_activity_logs()$$
);

-- 5. Opcional: Fer una neteja immediata en executar aquest script
delete from public.activity_log
where created_at < now() - interval '30 days';

