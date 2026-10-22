-- Invite-only onboarding for Ärtan.
--
-- Apply this file once, manually, in the Supabase SQL editor of a NON-production
-- project first. The Netlify deploy preview uses the production database, so
-- running this file there changes production access rules.
--
-- The migration does not delete profiles, children, or guardian links.
-- Existing invitation codes are hashed in place so the raw token is no longer
-- stored; a link that was already sent still matches that hash.
-- Outstanding links can be replaced by an administrator or teacher with Resend,
-- which issues a new token and forgets the previous one.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Secrets are stored only as hashes. Callers never supply a user id.
-- ---------------------------------------------------------------------------

create or replace function public.invite_token_hash(raw_token text)
returns text
language sql
immutable
security definer
set search_path = public, extensions
as $$
  select encode(digest(convert_to(lower(btrim(coalesce(raw_token, ''))), 'UTF8'), 'sha256'), 'hex');
$$;

alter table public.profiles add column if not exists removed_at timestamptz;

alter table public.preschools add column if not exists join_code_hash text;

alter table public.invitations add column if not exists token_hash text;

update public.invitations
set token_hash = public.invite_token_hash(code),
    code = 'ref:' || id::text
where code !~ '^ref:';

alter table public.invitations alter column token_hash set not null;

create unique index if not exists idx_invitations_token_hash on public.invitations(token_hash);

create unique index if not exists idx_preschools_join_code_hash
  on public.preschools(join_code_hash)
  where join_code_hash is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invitations_code_is_reference'
  ) then
    alter table public.invitations
      add constraint invitations_code_is_reference
      check (code ~ '^ref:[0-9a-f-]{36}$');
  end if;
end $$;

create table if not exists public.join_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  preschool_id uuid not null references public.preschools(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  department_id uuid references public.departments(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create unique index if not exists join_requests_one_pending
  on public.join_requests(auth_user_id)
  where status = 'pending';

create index if not exists idx_join_requests_org_status
  on public.join_requests(organization_id, status, created_at desc);

create table if not exists public.sibling_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  guardian_profile_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  child_name text not null check (char_length(trim(child_name)) between 1 and 120),
  birth_date date not null,
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  child_id uuid references public.children(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create unique index if not exists sibling_requests_one_pending
  on public.sibling_requests(guardian_profile_id, lower(child_name), birth_date)
  where status = 'pending';

create index if not exists idx_sibling_requests_department
  on public.sibling_requests(department_id, status, created_at desc);

-- Active membership ignores a removed staff profile. Existing rows have
-- removed_at null, so current guardians, staff, and admins resolve as before.

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles
  where auth_user_id = auth.uid() and removed_at is null
$$;

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles
  where auth_user_id = auth.uid() and removed_at is null
$$;

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles
  where auth_user_id = auth.uid() and removed_at is null
$$;

create or replace function public.invite_expiry(invite_role public.user_role)
returns interval
language sql
immutable
security definer
set search_path = public
as $$
  select case when invite_role = 'staff' then interval '7 days' else interval '14 days' end;
$$;

create or replace function public.create_organization(
  organization_name text,
  organization_type text,
  preschool_name text,
  department_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_organization public.organizations;
  new_preschool public.preschools;
  new_department public.departments;
  user_email text;
  user_name text;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if exists (select 1 from public.profiles where auth_user_id = auth.uid()) then
    raise exception 'Kontot tillhör redan en organisation';
  end if;
  if exists (
    select 1 from public.join_requests
    where auth_user_id = auth.uid() and status = 'pending'
  ) then
    raise exception 'Du har en väntande ansökan. En administratör måste godkänna eller avslå den först';
  end if;
  if trim(organization_name) = '' or trim(preschool_name) = '' or trim(department_name) = '' then
    raise exception 'Organisation, skola och avdelning måste anges';
  end if;
  if organization_type not in ('kommun', 'privat', 'kooperativ') then
    raise exception 'Ogiltig organisationstyp';
  end if;

  user_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  user_name := coalesce(nullif(trim(auth.jwt() -> 'user_metadata' ->> 'name'), ''), split_part(user_email, '@', 1));
  if user_email = '' then raise exception 'Kontot saknar e-postadress'; end if;

  insert into public.organizations (name, type)
  values (trim(organization_name), organization_type::public.owner_type)
  returning * into new_organization;

  insert into public.preschools (organization_id, name)
  values (new_organization.id, trim(preschool_name))
  returning * into new_preschool;

  insert into public.departments (preschool_id, name)
  values (new_preschool.id, trim(department_name))
  returning * into new_department;

  insert into public.profiles (auth_user_id, organization_id, name, email, role)
  values (auth.uid(), new_organization.id, user_name, user_email, 'admin');

  return jsonb_build_object(
    'organization_id', new_organization.id,
    'preschool_id', new_preschool.id,
    'department_id', new_department.id
  );
end;
$$;

create or replace function public.create_department(
  target_preschool_id uuid,
  department_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_department_id uuid;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not public.is_admin() then raise exception 'Endast administratörer kan lägga till avdelningar'; end if;
  if trim(coalesce(department_name, '')) = '' then raise exception 'Avdelningens namn måste anges'; end if;
  if not exists (
    select 1 from public.preschools
    where id = target_preschool_id and organization_id = public.current_organization_id()
  ) then
    raise exception 'Skolan tillhör inte din organisation';
  end if;

  begin
    insert into public.departments (preschool_id, name)
    values (target_preschool_id, trim(department_name))
    returning id into new_department_id;
  exception when unique_violation then
    raise exception 'Avdelningen finns redan på den här skolan';
  end;
  return new_department_id;
end;
$$;

-- Direct guardian self-linking is closed. Existing child and guardian rows stay.
create or replace function public.register_guardian_child(
  child_name text,
  child_birth_date date,
  child_department_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  raise exception 'Ett barn kopplas bara via en inbjudan från personalen eller en godkänd syskonförfrågan';
end;
$$;

create or replace function public.create_invitation(
  invite_email text,
  invite_role text,
  invite_department_id uuid default null,
  invite_child_id uuid default null,
  invite_relation text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller_profile public.profiles;
  target_organization_id uuid;
  target_preschool_id uuid;
  target_department_id uuid;
  new_invitation public.invitations;
  raw_token text;
  attempt int;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  select * into caller_profile
  from public.profiles
  where auth_user_id = auth.uid() and removed_at is null;
  if not found then raise exception 'Profil saknas'; end if;
  if invite_role not in ('parent', 'staff') then raise exception 'Endast vårdnadshavare och personal kan bjudas in'; end if;
  if trim(coalesce(invite_email, '')) = '' or position('@' in trim(invite_email)) < 2 then
    raise exception 'Ange en giltig e-postadress';
  end if;

  if invite_role = 'parent' then
    if invite_child_id is null then raise exception 'Välj ett barn'; end if;
    if caller_profile.role not in ('admin', 'staff') then raise exception 'Du får inte skapa inbjudningar'; end if;
    if caller_profile.role = 'staff' and not public.is_staff_for_child(invite_child_id) then
      raise exception 'Du saknar behörighet till barnet';
    end if;
    select p.organization_id, p.id, d.id
      into target_organization_id, target_preschool_id, target_department_id
    from public.children c
    join public.departments d on d.id = c.department_id
    join public.preschools p on p.id = d.preschool_id
    where c.id = invite_child_id;
    if target_organization_id is null or target_organization_id <> caller_profile.organization_id then
      raise exception 'Barnet tillhör inte din organisation';
    end if;
    if caller_profile.role = 'admin' and not public.is_admin_for_child(invite_child_id) then
      raise exception 'Barnet tillhör inte din organisation';
    end if;
  else
    if caller_profile.role <> 'admin' then raise exception 'Endast administratörer kan bjuda in personal'; end if;
    if invite_department_id is null then raise exception 'Välj en avdelning'; end if;
    select p.organization_id, p.id, d.id
      into target_organization_id, target_preschool_id, target_department_id
    from public.departments d
    join public.preschools p on p.id = d.preschool_id
    where d.id = invite_department_id;
    if target_organization_id is null
      or target_preschool_id is null
      or target_organization_id <> caller_profile.organization_id then
      raise exception 'Avdelningen tillhör inte din organisation';
    end if;
  end if;

  update public.invitations
  set status = 'revoked', revoked_at = now()
  where status = 'pending'
    and lower(email) = lower(trim(invite_email))
    and role = invite_role::public.user_role
    and organization_id = target_organization_id
    and coalesce(child_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(invite_child_id, '00000000-0000-0000-0000-000000000000'::uuid);

  for attempt in 1..5 loop
    raw_token := encode(gen_random_bytes(32), 'hex');
    begin
      insert into public.invitations (
        organization_id, preschool_id, department_id, child_id, email, role, relation,
        code, token_hash, status, invited_by, max_uses, uses_count, expires_at
      ) values (
        target_organization_id,
        target_preschool_id,
        target_department_id,
        case when invite_role = 'parent' then invite_child_id else null end,
        lower(trim(invite_email)),
        invite_role::public.user_role,
        case when invite_role = 'parent' then coalesce(nullif(trim(invite_relation), ''), 'Vårdnadshavare') else null end,
        'ref:' || gen_random_uuid()::text,
        public.invite_token_hash(raw_token),
        'pending',
        caller_profile.id,
        1,
        0,
        now() + public.invite_expiry(invite_role::public.user_role)
      ) returning * into new_invitation;

      return jsonb_build_object(
        'id', new_invitation.id,
        'email', new_invitation.email,
        'role', new_invitation.role,
        'relation', new_invitation.relation,
        'preschool_id', new_invitation.preschool_id,
        'department_id', new_invitation.department_id,
        'child_id', new_invitation.child_id,
        'status', new_invitation.status,
        'expires_at', new_invitation.expires_at,
        'token', raw_token
      );
    exception when unique_violation then
      if attempt = 5 then raise exception 'Kunde inte skapa en unik inbjudan'; end if;
    end;
  end loop;
  raise exception 'Kunde inte skapa en unik inbjudan';
end;
$$;

create or replace function public.caller_can_manage_invitation(invitation public.invitations)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_profile public.profiles;
begin
  select * into caller_profile
  from public.profiles
  where auth_user_id = auth.uid() and removed_at is null;
  if not found or caller_profile.organization_id <> invitation.organization_id then
    return false;
  end if;
  if caller_profile.role = 'admin' then
    return true;
  end if;
  return caller_profile.role = 'staff'
    and invitation.role = 'parent'
    and public.is_staff_for_child(invitation.child_id);
end;
$$;

create or replace function public.resend_invitation(invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  invitation public.invitations;
  raw_token text;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  select * into invitation from public.invitations where id = invite_id for update;
  if not found then raise exception 'Inbjudan hittades inte'; end if;
  if not public.caller_can_manage_invitation(invitation) then raise exception 'Du får inte hantera inbjudan'; end if;
  if invitation.status <> 'pending' then raise exception 'Bara väntande inbjudningar kan skickas igen'; end if;

  raw_token := encode(gen_random_bytes(32), 'hex');
  update public.invitations
  set token_hash = public.invite_token_hash(raw_token),
      expires_at = now() + public.invite_expiry(invitation.role),
      uses_count = 0
  where id = invitation.id
  returning * into invitation;

  return jsonb_build_object(
    'id', invitation.id,
    'email', invitation.email,
    'role', invitation.role,
    'relation', invitation.relation,
    'preschool_id', invitation.preschool_id,
    'department_id', invitation.department_id,
    'child_id', invitation.child_id,
    'status', invitation.status,
    'expires_at', invitation.expires_at,
    'token', raw_token
  );
end;
$$;

create or replace function public.revoke_invitation(invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.invitations;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  select * into invitation from public.invitations where id = invite_id for update;
  if not found then raise exception 'Inbjudan hittades inte'; end if;
  if not public.caller_can_manage_invitation(invitation) then raise exception 'Du får inte hantera inbjudan'; end if;
  if invitation.status <> 'pending' then raise exception 'Bara väntande inbjudningar kan återkallas'; end if;
  update public.invitations
  set status = 'revoked', revoked_at = now()
  where id = invitation.id;
end;
$$;

drop function if exists public.accept_invitation(text);

create function public.accept_invitation(invite_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.invitations;
  account_profile public.profiles;
  user_email text;
  user_name text;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if char_length(btrim(coalesce(invite_code, ''))) < 8 then
    raise exception 'Inbjudningslänken är ogiltig eller har gått ut';
  end if;
  user_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if user_email = '' then raise exception 'Kontot saknar e-postadress'; end if;

  select * into invitation
  from public.invitations
  where token_hash = public.invite_token_hash(invite_code)
  for update;
  if not found
    or invitation.status <> 'pending'
    or invitation.uses_count <> 0
    or invitation.expires_at <= now() then
    raise exception 'Inbjudningslänken är ogiltig eller har gått ut';
  end if;
  if lower(invitation.email) <> user_email then
    raise exception 'Inbjudan gäller en annan e-postadress';
  end if;

  select * into account_profile from public.profiles where auth_user_id = auth.uid();
  if found then
    if account_profile.organization_id <> invitation.organization_id then
      raise exception 'Kontot tillhör redan en annan organisation';
    end if;
    if account_profile.role <> invitation.role then
      raise exception 'Kontot har redan en annan roll i organisationen';
    end if;
    if account_profile.removed_at is not null then
      update public.profiles set removed_at = null where id = account_profile.id;
    end if;
  else
    user_name := coalesce(nullif(trim(auth.jwt() -> 'user_metadata' ->> 'name'), ''), split_part(user_email, '@', 1));
    insert into public.profiles (auth_user_id, organization_id, name, email, role)
    values (auth.uid(), invitation.organization_id, user_name, user_email, invitation.role)
    returning * into account_profile;
  end if;

  if invitation.role = 'parent' then
    if invitation.child_id is null then raise exception 'Inbjudan saknar barn'; end if;
    insert into public.child_guardians (child_id, profile_id, relation, can_pickup)
    values (invitation.child_id, account_profile.id, coalesce(invitation.relation, 'Vårdnadshavare'), true)
    on conflict (child_id, profile_id) do update set relation = excluded.relation;
  elsif invitation.role = 'staff' then
    if invitation.department_id is null or invitation.preschool_id is null then
      raise exception 'Inbjudan saknar skola eller avdelning';
    end if;
    insert into public.staff_departments (staff_id, department_id)
    values (account_profile.id, invitation.department_id)
    on conflict do nothing;
  else
    raise exception 'Inbjudan kan inte accepteras';
  end if;

  update public.join_requests
  set status = 'withdrawn', reviewed_at = now()
  where auth_user_id = auth.uid() and status = 'pending';

  update public.invitations
  set uses_count = 1, status = 'accepted', accepted_by = account_profile.id, accepted_at = now()
  where id = invitation.id and status = 'pending' and uses_count = 0;
  if not found then raise exception 'Inbjudningslänken är ogiltig eller har gått ut'; end if;
end;
$$;

create or replace function public.rotate_school_join_code(target_preschool_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  school public.preschools;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw_code text := '';
  index int;
  byte_value int;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not public.is_admin() then raise exception 'Endast administratörer kan skapa en skolkod'; end if;
  select * into school
  from public.preschools
  where id = target_preschool_id and organization_id = public.current_organization_id();
  if not found then raise exception 'Skolan tillhör inte din organisation'; end if;

  for index in 1..12 loop
    byte_value := get_byte(gen_random_bytes(1), 0);
    raw_code := raw_code || substr(alphabet, 1 + (byte_value % length(alphabet)), 1);
  end loop;

  update public.preschools
  set join_code_hash = public.invite_token_hash(raw_code)
  where id = school.id;

  return jsonb_build_object(
    'preschool_id', school.id,
    'preschool_name', school.name,
    'code', raw_code
  );
end;
$$;

create or replace function public.request_staff_join(school_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
  school public.preschools;
  user_email text;
  user_name text;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if exists (select 1 from public.profiles where auth_user_id = auth.uid()) then
    raise exception 'Kontot tillhör redan en organisation';
  end if;
  if exists (
    select 1 from public.join_requests where auth_user_id = auth.uid() and status = 'pending'
  ) then
    raise exception 'Du har redan en väntande ansökan';
  end if;

  normalized := lower(regexp_replace(coalesce(school_code, ''), '[^[:alnum:]]', '', 'g'));
  if char_length(normalized) < 8 then raise exception 'Skolkoden stämmer inte'; end if;

  select * into school
  from public.preschools
  where join_code_hash = public.invite_token_hash(normalized);
  if not found then raise exception 'Skolkoden stämmer inte'; end if;

  user_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  user_name := coalesce(nullif(trim(auth.jwt() -> 'user_metadata' ->> 'name'), ''), split_part(user_email, '@', 1));
  if user_email = '' then raise exception 'Kontot saknar e-postadress'; end if;
  if char_length(user_name) > 120 then user_name := left(user_name, 120); end if;

  insert into public.join_requests (organization_id, preschool_id, auth_user_id, name, email)
  values (school.organization_id, school.id, auth.uid(), user_name, user_email);

  return jsonb_build_object('kind', 'pending');
end;
$$;

create or replace function public.my_onboarding_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  account_profile public.profiles;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  select * into account_profile from public.profiles where auth_user_id = auth.uid();
  if found and account_profile.removed_at is null then
    return jsonb_build_object('kind', 'active');
  end if;
  if found and account_profile.removed_at is not null then
    return jsonb_build_object('kind', 'removed');
  end if;
  if exists (
    select 1 from public.join_requests where auth_user_id = auth.uid() and status = 'pending'
  ) then
    return jsonb_build_object('kind', 'pending');
  end if;
  return jsonb_build_object('kind', 'none');
end;
$$;

create or replace function public.list_join_requests()
returns table (
  request_id uuid,
  applicant_name text,
  applicant_email text,
  preschool_id uuid,
  preschool_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Endast administratörer kan se ansökningar'; end if;
  return query
  select request.id, request.name, request.email, request.preschool_id, school.name, request.created_at
  from public.join_requests request
  join public.preschools school on school.id = request.preschool_id
  where request.organization_id = public.current_organization_id()
    and request.status = 'pending'
  order by request.created_at;
end;
$$;

create or replace function public.approve_staff_join(
  request_id uuid,
  target_department_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request public.join_requests;
  department_school uuid;
  new_profile public.profiles;
begin
  if not public.is_admin() then raise exception 'Endast administratörer kan godkänna ansökningar'; end if;
  select * into request from public.join_requests where id = request_id for update;
  if not found or request.organization_id <> public.current_organization_id() then
    raise exception 'Ansökan hittades inte';
  end if;
  if request.status <> 'pending' then raise exception 'Ansökan är redan hanterad'; end if;

  select preschool_id into department_school from public.departments where id = target_department_id;
  if department_school is null or department_school <> request.preschool_id then
    raise exception 'Avdelningen tillhör inte skolan i ansökan';
  end if;
  if exists (select 1 from public.profiles where auth_user_id = request.auth_user_id) then
    raise exception 'Kontot har redan en profil';
  end if;

  begin
    insert into public.profiles (auth_user_id, organization_id, name, email, role)
    values (request.auth_user_id, request.organization_id, request.name, lower(request.email), 'staff')
    returning * into new_profile;
  exception when unique_violation then
    raise exception 'E-postadressen används redan';
  end;

  insert into public.staff_departments (staff_id, department_id)
  values (new_profile.id, target_department_id);

  update public.join_requests
  set status = 'approved',
      department_id = target_department_id,
      reviewed_by = public.current_profile_id(),
      reviewed_at = now()
  where id = request.id;

  return new_profile.id;
end;
$$;

create or replace function public.reject_staff_join(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request public.join_requests;
begin
  if not public.is_admin() then raise exception 'Endast administratörer kan avslå ansökningar'; end if;
  select * into request from public.join_requests where id = request_id for update;
  if not found or request.organization_id <> public.current_organization_id() then
    raise exception 'Ansökan hittades inte';
  end if;
  if request.status <> 'pending' then raise exception 'Ansökan är redan hanterad'; end if;
  update public.join_requests
  set status = 'rejected', reviewed_by = public.current_profile_id(), reviewed_at = now()
  where id = request.id;
end;
$$;

create or replace function public.list_staff_members()
returns table (
  staff_id uuid,
  staff_name text,
  staff_email text,
  department_id uuid,
  department_name text,
  preschool_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Endast administratörer kan se personalen'; end if;
  return query
  select profile.id, profile.name, profile.email, department.id, department.name, school.name
  from public.profiles profile
  left join public.staff_departments assignment on assignment.staff_id = profile.id
  left join public.departments department on department.id = assignment.department_id
  left join public.preschools school on school.id = department.preschool_id
  where profile.organization_id = public.current_organization_id()
    and profile.role = 'staff'
    and profile.removed_at is null
  order by profile.name, school.name, department.name;
end;
$$;

create or replace function public.remove_staff_member(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles;
begin
  if not public.is_admin() then raise exception 'Endast administratörer kan ta bort personal'; end if;
  select * into target
  from public.profiles
  where id = target_profile_id and organization_id = public.current_organization_id()
  for update;
  if not found then raise exception 'Personen hittades inte'; end if;
  if target.role <> 'staff' then raise exception 'Bara personal kan tas bort här'; end if;
  if target.auth_user_id = auth.uid() then raise exception 'Du kan inte ta bort ditt eget konto'; end if;
  if target.removed_at is not null then raise exception 'Personalen är redan borttagen'; end if;

  update public.profiles set removed_at = now() where id = target.id;
  delete from public.staff_departments where staff_id = target.id;
end;
$$;

create or replace function public.submit_sibling_request(
  child_name text,
  child_birth_date date,
  child_department_id uuid,
  request_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  guardian public.profiles;
  new_request_id uuid;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  select * into guardian
  from public.profiles
  where auth_user_id = auth.uid() and removed_at is null;
  if not found or guardian.role <> 'parent' then
    raise exception 'Endast vårdnadshavare kan skicka en syskonförfrågan';
  end if;
  if trim(coalesce(child_name, '')) = '' then raise exception 'Barnets namn måste anges'; end if;
  if child_birth_date is null or child_birth_date > current_date then
    raise exception 'Ange ett giltigt födelsedatum';
  end if;
  if char_length(trim(coalesce(request_note, ''))) > 500 then
    raise exception 'Anteckningen är för lång';
  end if;
  if not exists (
    select 1
    from public.departments department
    join public.preschools school on school.id = department.preschool_id
    where department.id = child_department_id
      and school.organization_id = guardian.organization_id
  ) then
    raise exception 'Avdelningen tillhör inte din organisation';
  end if;

  begin
    insert into public.sibling_requests (
      organization_id, guardian_profile_id, department_id, child_name, birth_date, note
    ) values (
      guardian.organization_id,
      guardian.id,
      child_department_id,
      trim(child_name),
      child_birth_date,
      nullif(trim(coalesce(request_note, '')), '')
    ) returning id into new_request_id;
  exception when unique_violation then
    raise exception 'Du har redan en väntande förfrågan för det här barnet';
  end;
  return new_request_id;
end;
$$;

create or replace function public.list_sibling_requests()
returns table (
  request_id uuid,
  child_name text,
  birth_date date,
  department_id uuid,
  department_name text,
  note text,
  status text,
  created_at timestamptz,
  guardian_name text,
  guardian_email text,
  child_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_profile_id() is null then raise exception 'Profil saknas'; end if;
  return query
  select
    request.id,
    request.child_name,
    request.birth_date,
    request.department_id,
    department.name,
    request.note,
    request.status,
    request.created_at,
    guardian.name,
    guardian.email,
    request.child_id
  from public.sibling_requests request
  join public.departments department on department.id = request.department_id
  join public.profiles guardian on guardian.id = request.guardian_profile_id
  where request.organization_id = public.current_organization_id()
    and (
      (public.current_role() = 'parent' and request.guardian_profile_id = public.current_profile_id())
      or (
        request.status = 'pending'
        and (
          public.is_admin()
          or (public.current_role() = 'staff' and public.is_staff_for_department(request.department_id))
        )
      )
    )
  order by request.created_at desc;
end;
$$;

create or replace function public.review_sibling_request(
  request_id uuid,
  decision text,
  existing_child_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request public.sibling_requests;
  guardian public.profiles;
  linked_child_id uuid;
  chosen public.children;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if decision not in ('approve', 'reject') then raise exception 'Ogiltigt beslut'; end if;
  select * into request from public.sibling_requests where id = request_id for update;
  if not found or request.organization_id <> public.current_organization_id() then
    raise exception 'Förfrågan hittades inte';
  end if;
  if request.status <> 'pending' then raise exception 'Förfrågan är redan hanterad'; end if;
  if not (public.is_admin_for_department(request.department_id) or public.is_staff_for_department(request.department_id)) then
    raise exception 'Du saknar behörighet att hantera förfrågan';
  end if;

  select * into guardian
  from public.profiles
  where id = request.guardian_profile_id and removed_at is null and role = 'parent';
  if not found or guardian.organization_id <> request.organization_id then
    raise exception 'Vårdnadshavaren kan inte kopplas';
  end if;

  if decision = 'reject' then
    update public.sibling_requests
    set status = 'rejected', reviewed_by = public.current_profile_id(), reviewed_at = now()
    where id = request.id;
    return null;
  end if;

  if existing_child_id is not null then
    select * into chosen from public.children where id = existing_child_id;
    if not found or chosen.department_id <> request.department_id then
      raise exception 'Barnet tillhör inte avdelningen i förfrågan';
    end if;
    linked_child_id := chosen.id;
  else
    insert into public.children (department_id, name, birth_date)
    values (request.department_id, request.child_name, request.birth_date)
    returning id into linked_child_id;
  end if;

  insert into public.child_guardians (child_id, profile_id, relation, can_pickup)
  values (linked_child_id, request.guardian_profile_id, 'Vårdnadshavare', true)
  on conflict (child_id, profile_id) do update set relation = excluded.relation;

  update public.sibling_requests
  set status = 'approved',
      child_id = linked_child_id,
      reviewed_by = public.current_profile_id(),
      reviewed_at = now()
  where id = request.id;

  return linked_child_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row access. Pending applicants have no profile, so tenant policies match
-- nothing for them. Removed staff also fail current_organization_id().
-- ---------------------------------------------------------------------------

alter table public.join_requests enable row level security;
alter table public.sibling_requests enable row level security;

drop policy if exists "join request own read" on public.join_requests;
drop policy if exists "join request admin read" on public.join_requests;
create policy "join request own read" on public.join_requests
for select using (auth_user_id = auth.uid());
create policy "join request admin read" on public.join_requests
for select using (organization_id = public.current_organization_id() and public.is_admin());

drop policy if exists "sibling request participant read" on public.sibling_requests;
create policy "sibling request participant read" on public.sibling_requests
for select using (
  guardian_profile_id = public.current_profile_id()
  or public.is_admin_for_department(department_id)
  or public.is_staff_for_department(department_id)
);

revoke all on table public.invitations from public, anon, authenticated;
-- code stays readable so pre-merge clients keep loading; after this migration
-- it only holds a non-secret ref:<uuid> (the real token lives hashed in token_hash).
grant select (
  id, organization_id, preschool_id, department_id, child_id,
  email, role, relation, code, status, invited_by, accepted_by,
  max_uses, uses_count, expires_at, accepted_at, revoked_at, created_at
) on public.invitations to authenticated;

revoke all on table public.join_requests from public, anon, authenticated;
revoke all on table public.sibling_requests from public, anon, authenticated;

revoke all on function public.invite_token_hash(text) from public, anon, authenticated;
revoke all on function public.invite_expiry(public.user_role) from public, anon, authenticated;
revoke all on function public.caller_can_manage_invitation(public.invitations) from public, anon, authenticated;

revoke all on function public.current_profile_id() from public, anon;
revoke all on function public.current_role() from public, anon;
revoke all on function public.current_organization_id() from public, anon;
grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.current_organization_id() to authenticated;

revoke all on function public.create_organization(text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_department(uuid, text) from public, anon, authenticated;
revoke all on function public.register_guardian_child(text, date, uuid) from public, anon, authenticated;
revoke all on function public.create_invitation(text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.resend_invitation(uuid) from public, anon, authenticated;
revoke all on function public.revoke_invitation(uuid) from public, anon, authenticated;
revoke all on function public.accept_invitation(text) from public, anon, authenticated;
revoke all on function public.rotate_school_join_code(uuid) from public, anon, authenticated;
revoke all on function public.request_staff_join(text) from public, anon, authenticated;
revoke all on function public.my_onboarding_status() from public, anon, authenticated;
revoke all on function public.list_join_requests() from public, anon, authenticated;
revoke all on function public.approve_staff_join(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reject_staff_join(uuid) from public, anon, authenticated;
revoke all on function public.list_staff_members() from public, anon, authenticated;
revoke all on function public.remove_staff_member(uuid) from public, anon, authenticated;
revoke all on function public.submit_sibling_request(text, date, uuid, text) from public, anon, authenticated;
revoke all on function public.list_sibling_requests() from public, anon, authenticated;
revoke all on function public.review_sibling_request(uuid, text, uuid) from public, anon, authenticated;

grant execute on function public.create_organization(text, text, text, text) to authenticated;
grant execute on function public.create_department(uuid, text) to authenticated;
grant execute on function public.register_guardian_child(text, date, uuid) to authenticated;
grant execute on function public.create_invitation(text, text, uuid, uuid, text) to authenticated;
grant execute on function public.resend_invitation(uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.rotate_school_join_code(uuid) to authenticated;
grant execute on function public.request_staff_join(text) to authenticated;
grant execute on function public.my_onboarding_status() to authenticated;
grant execute on function public.list_join_requests() to authenticated;
grant execute on function public.approve_staff_join(uuid, uuid) to authenticated;
grant execute on function public.reject_staff_join(uuid) to authenticated;
grant execute on function public.list_staff_members() to authenticated;
grant execute on function public.remove_staff_member(uuid) to authenticated;
grant execute on function public.submit_sibling_request(text, date, uuid, text) to authenticated;
grant execute on function public.list_sibling_requests() to authenticated;
grant execute on function public.review_sibling_request(uuid, text, uuid) to authenticated;

commit;
