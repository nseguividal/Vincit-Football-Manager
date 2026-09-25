-- ============================================================================
-- VINCIT MANAGER — Esquema de base de dades (Supabase / Postgres)
-- ============================================================================
-- Com aplicar-ho:
--   1. Crea un projecte gratuït a https://supabase.com
--   2. Ves a "SQL Editor" -> "New query"
--   3. Enganxa TOT aquest fitxer i clica "Run"
--   4. Després aplica policies.sql de la mateixa manera
-- ============================================================================

-- Extensió per generar UUIDs
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. EQUIPS DEL CLUB (Vincit): Aleví A, Cadet B Femení, Sènior...
-- ----------------------------------------------------------------------------
create table club_teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,        -- "Aleví A", "Cadet B Femení"...
  category    text,                        -- "Aleví", "Cadet", "Sènior"... (per filtrar)
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. JUGADORS REALS DEL CLUB (el "catàleg" — la persona real que juga a pista)
-- ----------------------------------------------------------------------------
create table club_players (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references club_teams(id) on delete cascade,
  full_name     text not null,
  position      text not null check (position in ('PORTER','TANCA','ALA','PIVOT')),
  dorsal        int,
  photo_url     text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. JORNADES del joc fantasy (una per setmana de lliga)
-- ----------------------------------------------------------------------------
create table matchdays (
  id            uuid primary key default gen_random_uuid(),
  number        int not null unique,        -- Jornada 1, 2, 3...
  label         text,                        -- "Jornada 1 - 14 Set 2026"
  starts_at     date not null,
  ends_at       date not null,
  is_current    boolean not null default false, -- només una ha de ser true
  is_extra      boolean not null default false, -- jornada extra (no suma punts a la classificació)
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. MANAGERS (participants del joc). 1 fila = 1 usuari d'auth de Supabase.
-- ----------------------------------------------------------------------------
create table managers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users(id) on delete cascade,
  username      text not null unique,        -- nom curt, p.ex. "jordi"
  display_name  text not null,               -- nom mostrat, p.ex. "Jordi Puig"
  avatar_emoji  text default '⚽',
  budget        numeric not null default 100, -- diners disponibles (milions fantasy)
  is_admin      boolean not null default false,
  is_coach      boolean not null default false,
  player_team_id uuid references club_teams(id) on delete set null, -- equip del club on juga (rol jugador)
  created_at    timestamptz not null default now()
);

-- Quins equips reals entrena cada manager-entrenador (un entrenador pot tenir més d'un equip)
create table coach_assignments (
  manager_id  uuid not null references managers(id) on delete cascade,
  team_id     uuid not null references club_teams(id) on delete cascade,
  primary key (manager_id, team_id)
);

-- ----------------------------------------------------------------------------
-- 5. FITXA FANTASY d'un jugador: propietat, preu, si és al mercat...
--    (1 fila per cada club_player, sempre existeix)
-- ----------------------------------------------------------------------------
create table fantasy_cards (
  id                uuid primary key default gen_random_uuid(),
  club_player_id    uuid not null unique references club_players(id) on delete cascade,
  owner_manager_id  uuid references managers(id) on delete set null, -- null = ningú el té (lliure)
  current_price     numeric not null default 5,
  status            text not null default 'market'
                      check (status in ('market','owned','pending_sale')),
  market_listed_at  timestamptz,             -- quan va sortir al mercat (per caducar-lo)
  market_expires_at timestamptz,             -- normalment +7 dies (fitxatge nou) o +2 dies (venda d'un altre manager)
  updated_at        timestamptz not null default now()
);

-- Alineació titular actual de cada manager (màxim 5 fitxes, una per posició de pista)
create table lineup_slots (
  manager_id      uuid not null references managers(id) on delete cascade,
  slot            text not null check (slot in ('PORTER','TANCA','ALA_1','ALA_2','PIVOT')),
  fantasy_card_id uuid not null references fantasy_cards(id) on delete cascade,
  updated_at      timestamptz not null default now(),
  primary key (manager_id, slot)
);

-- ----------------------------------------------------------------------------
-- 6. ESTADÍSTIQUES per jornada i jugador (les introdueix l'entrenador)
-- ----------------------------------------------------------------------------
create table player_matchday_stats (
  id             uuid primary key default gen_random_uuid(),
  club_player_id uuid not null references club_players(id) on delete cascade,
  matchday_id    uuid not null references matchdays(id) on delete cascade,
  attended       boolean not null default true,
  points         numeric not null default 0,
  goals          int not null default 0,
  assists        int not null default 0,
  saves          int not null default 0,
  match_result   text check (match_result in ('win', 'draw', 'loss')),
  match_score    text,
  entered_by     uuid references managers(id),   -- quin entrenador ho ha introduït
  created_at     timestamptz not null default now(),
  unique (club_player_id, matchday_id)
);

-- ----------------------------------------------------------------------------
-- 7. OFERTES de fitxatge (formulari d'ofertes)
-- ----------------------------------------------------------------------------
create table transfer_offers (
  id                uuid primary key default gen_random_uuid(),
  fantasy_card_id   uuid not null references fantasy_cards(id) on delete cascade,
  bidder_manager_id uuid not null references managers(id) on delete cascade,
  amount            numeric not null,
  status            text not null default 'pending'
                       check (status in ('pending','accepted','rejected','expired')),
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz
);

-- ----------------------------------------------------------------------------
-- 8. LOG d'activitat (per a la pantalla d'Inici: "moviments dels dies anteriors")
-- ----------------------------------------------------------------------------
create table activity_log (
  id           uuid primary key default gen_random_uuid(),
  manager_id   uuid references managers(id) on delete set null,
  type         text not null check (type in
                 ('purchase','sale','market_new','lineup_change','offer_made','points_added')),
  message      text not null,           -- text ja formatat, p.ex "Jordi ha fitxat Marc Solé per 12M"
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 9. VISTA: classificació setmanal (punts totals dels 5 titulars, sumats per jornada)
-- ----------------------------------------------------------------------------
create or replace view v_weekly_scores
with (security_invoker = true) as
select
  m.id            as manager_id,
  m.display_name  as display_name,
  m.avatar_emoji  as avatar_emoji,
  md.id           as matchday_id,
  md.number       as matchday_number,
  coalesce(sum(pms.points), 0) as points
from managers m
cross join matchdays md
left join lineup_slots ls on ls.manager_id = m.id
left join fantasy_cards fc on fc.id = ls.fantasy_card_id
left join player_matchday_stats pms
  on pms.club_player_id = fc.club_player_id and pms.matchday_id = md.id
where md.is_extra = false or md.is_extra is null
group by m.id, m.display_name, m.avatar_emoji, md.id, md.number;

-- Classificació general (suma de totes les jornades fins ara)
create or replace view v_total_standings
with (security_invoker = true) as
select manager_id, display_name, avatar_emoji, sum(points) as total_points
from v_weekly_scores
group by manager_id, display_name, avatar_emoji
order by total_points desc;

-- ----------------------------------------------------------------------------
-- Trigger: mantenir updated_at al dia a fantasy_cards
-- ----------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_fantasy_cards_updated
  before update on fantasy_cards
  for each row execute function set_updated_at();
