-- ============================================================================
-- MIGRACIÓ: Afegir equip on juga el jugador (player_team_id) i restriccions
-- ============================================================================

-- 1. Afegir columna player_team_id a la taula managers
alter table public.managers
  add column if not exists player_team_id uuid references public.club_teams(id) on delete set null;

-- 2. Actualitzar funció admin_create_manager amb suport per a player_team_id
create or replace function admin_create_manager(
  p_username text,
  p_password text,
  p_display_name text,
  p_budget numeric default 100,
  p_avatar_emoji text default '⚽',
  p_is_admin boolean default false,
  p_is_coach boolean default false,
  p_team_ids uuid[] default array[]::uuid[],
  p_player_team_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid;
  v_email text;
  v_encrypted_pw text;
  v_team_id uuid;
  v_mgr_id uuid;
begin
  if not is_current_user_admin() then
    raise exception 'Només els administradors poden crear nous usuaris';
  end if;

  p_username := trim(lower(p_username));
  if p_username = '' or p_password = '' or trim(p_display_name) = '' then
    raise exception 'Falten camps obligatoris (usuari, contrasenya, nom)';
  end if;

  if exists (select 1 from public.managers where username = p_username) then
    raise exception 'Aquest nom d''usuari ja està en ús';
  end if;

  v_email := p_username || '@vincit.local';

  delete from auth.identities where user_id in (select id from auth.users where email = v_email);
  delete from auth.users where email = v_email;

  v_user_id := gen_random_uuid();
  v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf', 10));

  insert into auth.users (
    id,
    instance_id,
    role,
    aud,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    is_sso_user,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    created_at,
    updated_at
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    v_encrypted_pw,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'username', p_username,
      'display_name', p_display_name
    ),
    false,
    false,
    '',
    '',
    '',
    '',
    now(),
    now()
  );

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    v_user_id::text,
    now(),
    now(),
    now()
  );

  insert into public.managers (
    user_id,
    username,
    display_name,
    avatar_emoji,
    budget,
    is_admin,
    is_coach,
    player_team_id
  ) values (
    v_user_id,
    p_username,
    p_display_name,
    coalesce(nullif(p_avatar_emoji, ''), '⚽'),
    coalesce(p_budget, 100),
    coalesce(p_is_admin, false),
    coalesce(p_is_coach, false),
    p_player_team_id
  ) returning id into v_mgr_id;

  if (p_is_coach or p_is_admin) and p_team_ids is not null then
    foreach v_team_id in array p_team_ids loop
      insert into public.coach_assignments (manager_id, team_id)
      values (v_mgr_id, v_team_id)
      on conflict do nothing;
    end loop;
  end if;

  return v_user_id;
end;
$$;

-- 3. Actualitzar funció admin_update_manager amb suport per a player_team_id
create or replace function admin_update_manager(
  p_manager_id uuid,
  p_display_name text,
  p_budget numeric,
  p_avatar_emoji text,
  p_is_admin boolean,
  p_is_coach boolean,
  p_team_ids uuid[] default array[]::uuid[],
  p_player_team_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_team_id uuid;
begin
  if not is_current_user_admin() then
    raise exception 'Només els administradors poden modificar dades dels usuaris';
  end if;

  update public.managers
  set display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
      budget = coalesce(p_budget, budget),
      avatar_emoji = coalesce(nullif(p_avatar_emoji, ''), avatar_emoji),
      is_admin = coalesce(p_is_admin, is_admin),
      is_coach = coalesce(p_is_coach, is_coach),
      player_team_id = p_player_team_id
  where id = p_manager_id;

  delete from public.coach_assignments where manager_id = p_manager_id;

  if (p_is_coach or p_is_admin) and p_team_ids is not null then
    foreach v_team_id in array p_team_ids loop
      insert into public.coach_assignments (manager_id, team_id)
      values (p_manager_id, v_team_id)
      on conflict do nothing;
    end loop;
  end if;
end;
$$;

