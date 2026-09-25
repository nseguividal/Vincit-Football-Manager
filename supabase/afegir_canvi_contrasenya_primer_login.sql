-- ============================================================================
-- MIGRACIÓ: Forçar canvi de contrasenya al primer inici de sessió
-- ============================================================================

-- 1. Afegir columna must_change_password a la taula managers
alter table public.managers
  add column if not exists must_change_password boolean default false;

-- 2. Funció per marcar la contrasenya com a canviada pel propi usuari autenticat
create or replace function complete_first_login_password_change()
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  update public.managers
  set must_change_password = false
  where user_id = auth.uid();
end;
$$;

grant execute on function complete_first_login_password_change() to authenticated;

-- 3. Actualitzar admin_create_manager perquè els nous usuaris tinguin must_change_password = true
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
    player_team_id,
    must_change_password
  ) values (
    v_user_id,
    p_username,
    p_display_name,
    coalesce(nullif(p_avatar_emoji, ''), '⚽'),
    coalesce(p_budget, 100),
    coalesce(p_is_admin, false),
    coalesce(p_is_coach, false),
    p_player_team_id,
    true
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

-- 4. Actualitzar admin_update_manager_password perquè també marqui must_change_password = true
create or replace function admin_update_manager_password(p_manager_id uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid;
begin
  if not is_current_user_admin() then
    raise exception 'Només els administradors poden canviar contrasenyes d''altres usuaris';
  end if;

  select user_id into v_user_id from public.managers where id = p_manager_id;
  if not found then
    raise exception 'Manager no trobat';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
      updated_at = now()
  where id = v_user_id;

  update public.managers
  set must_change_password = true
  where id = p_manager_id;
end;
$$;

