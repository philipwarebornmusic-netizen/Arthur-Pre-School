-- ärtan production schema and upgrade migration.
-- Safe to run repeatedly in Supabase SQL Editor.

create extension if not exists "pgcrypto";

do $$ begin
  create type public.user_role as enum ('parent', 'staff', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.owner_type as enum ('kommun', 'privat', 'kooperativ');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.attendance_status as enum ('in', 'absent_sick', 'absent_leave', 'picked_up');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.post_type as enum ('diary', 'image', 'message');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.consent_type as enum ('app_images', 'group_images', 'social_media');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.invite_status as enum ('pending', 'accepted', 'revoked', 'expired');
exception when duplicate_object then null;
end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  type public.owner_type not null default 'privat',
  created_at timestamptz not null default now()
);

create table if not exists public.preschools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  phone text,
  address text,
  postal_code text,
  city text,
  opening_hours text,
  created_at timestamptz not null default now()
);
alter table public.preschools add column if not exists phone text;
alter table public.preschools add column if not exists address text;
alter table public.preschools add column if not exists postal_code text;
alter table public.preschools add column if not exists city text;
alter table public.preschools add column if not exists opening_hours text;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  preschool_id uuid not null references public.preschools(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (preschool_id, name)
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  email text unique not null,
  phone text,
  role public.user_role not null,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists phone text;

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  birth_date date,
  notes text,
  avatar_color text not null default '#F7B733',
  created_at timestamptz not null default now()
);
alter table public.children add column if not exists birth_date date;
alter table public.children add column if not exists notes text;

create table if not exists public.child_health (
  child_id uuid primary key references public.children(id) on delete cascade,
  allergies text[] not null default '{}',
  diet text,
  conditions text[] not null default '{}',
  medication text,
  emergency text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.child_guardians (
  child_id uuid not null references public.children(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  relation text not null default 'Vårdnadshavare',
  can_pickup boolean not null default true,
  primary key (child_id, profile_id)
);

create table if not exists public.child_contacts (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  name text not null,
  relation text not null,
  phone text,
  can_pickup boolean not null default false,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_departments (
  staff_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  primary key (staff_id, department_id)
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  date date not null default current_date,
  status public.attendance_status not null default 'in',
  dropoff_at time,
  pickup_at time,
  pickup_by text,
  absence_note text check (absence_note is null or char_length(trim(absence_note)) between 1 and 500),
  absence_ends_on date check (
    absence_ends_on is null
    or (status in ('absent_sick', 'absent_leave') and absence_ends_on >= date and absence_ends_on <= date + 30)
  ),
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (child_id, date)
);

create table if not exists public.child_box_items (
  child_id uuid not null references public.children(id) on delete cascade,
  item_type text not null check (item_type in ('diapers', 'spare_clothes', 'rain_clothes', 'socks')),
  level text not null check (level in ('none', 'few', 'many')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (child_id, item_type)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  type public.post_type not null default 'message',
  title text not null check (char_length(trim(title)) between 1 and 160),
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create table if not exists public.consents (
  child_id uuid not null references public.children(id) on delete cascade,
  type public.consent_type not null,
  allowed boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (child_id, type)
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  preschool_id uuid references public.preschools(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  child_id uuid references public.children(id) on delete cascade,
  email text not null,
  role public.user_role not null,
  relation text,
  code text unique not null,
  status public.invite_status not null default 'pending',
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  max_uses int not null default 1 check (max_uses = 1),
  uses_count int not null default 0 check (uses_count between 0 and 1),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_role_target check (
    (role = 'parent' and child_id is not null and department_id is not null)
    or (role = 'staff' and child_id is null and department_id is not null)
    or (role = 'admin' and child_id is null)
  )
);
-- Remove the legacy fake school and its test accounts. IDs and e-mails are exact to avoid touching real data.
delete from auth.users
where lower(email) in (
  'sam@arthur.test', 'johanna@arthur.test', 'jon@arthur.test',
  'maja@arthur.test', 'admin@arthur.test'
);
delete from public.organizations
where id = '00000000-0000-4000-8000-000000000001'
  and name = 'Solgläntan Förskolor';
delete from public.invitations where email is null;
alter table public.invitations alter column email set not null;
alter table public.invitations alter column expires_at set default (now() + interval '14 days');

create index if not exists idx_profiles_auth_user_id on public.profiles(auth_user_id);
create index if not exists idx_profiles_organization_id on public.profiles(organization_id);
create index if not exists idx_preschools_organization_id on public.preschools(organization_id);
create index if not exists idx_departments_preschool_id on public.departments(preschool_id);
create index if not exists idx_children_department_id on public.children(department_id);
create index if not exists idx_child_contacts_child_id on public.child_contacts(child_id);
create index if not exists idx_attendance_child_date on public.attendance(child_id, date);
create index if not exists idx_posts_department_created on public.posts(department_id, created_at desc);
create index if not exists idx_invitations_code on public.invitations(code);
create index if not exists idx_invitations_email on public.invitations(lower(email));

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where auth_user_id = auth.uid()
$$;

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where auth_user_id = auth.uid()
$$;

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where auth_user_id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'admin', false)
$$;

create or replace function public.is_admin_for_department(dept uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() and exists (
    select 1
    from public.departments d
    join public.preschools p on p.id = d.preschool_id
    where d.id = dept and p.organization_id = public.current_organization_id()
  )
$$;

create or replace function public.is_admin_for_child(child uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() and exists (
    select 1
    from public.children c
    join public.departments d on d.id = c.department_id
    join public.preschools p on p.id = d.preschool_id
    where c.id = child and p.organization_id = public.current_organization_id()
  )
$$;

create or replace function public.is_guardian(child uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.child_guardians
    where child_id = child and profile_id = public.current_profile_id()
  )
$$;

create or replace function public.is_staff_for_department(dept uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_departments
    where department_id = dept and staff_id = public.current_profile_id()
  )
$$;

create or replace function public.is_staff_for_child(child uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.children c
    join public.staff_departments sd on sd.department_id = c.department_id
    where c.id = child and sd.staff_id = public.current_profile_id()
  )
$$;

create or replace function public.is_guardian_for_department(dept uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.children c
    join public.child_guardians cg on cg.child_id = c.id
    where c.department_id = dept and cg.profile_id = public.current_profile_id()
  )
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

create or replace function public.create_preschool(
  school_name text,
  school_phone text default null,
  school_address text default null,
  school_postal_code text default null,
  school_city text default null,
  school_opening_hours text default null,
  department_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_id uuid;
  new_preschool public.preschools;
  new_department public.departments;
begin
  if not public.is_admin() then raise exception 'Endast organisationsadministratörer kan skapa skolor'; end if;
  if trim(school_name) = '' or trim(coalesce(department_name, '')) = '' then
    raise exception 'Skolans namn och första avdelning måste anges';
  end if;
  organization_id := public.current_organization_id();
  insert into public.preschools (organization_id, name, phone, address, postal_code, city, opening_hours)
  values (organization_id, trim(school_name), nullif(trim(school_phone), ''), nullif(trim(school_address), ''), nullif(trim(school_postal_code), ''), nullif(trim(school_city), ''), nullif(trim(school_opening_hours), ''))
  returning * into new_preschool;
  insert into public.departments (preschool_id, name)
  values (new_preschool.id, trim(department_name))
  returning * into new_department;
  return jsonb_build_object('preschool_id', new_preschool.id, 'department_id', new_department.id);
end;
$$;

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
declare
  account_profile public.profiles;
  new_child public.children;
begin
  select * into account_profile
  from public.profiles
  where auth_user_id = auth.uid();

  if not found or account_profile.role <> 'parent' then
    raise exception 'Endast vårdnadshavare kan registrera sina barn';
  end if;
  if trim(coalesce(child_name, '')) = '' then
    raise exception 'Barnets namn måste anges';
  end if;
  if child_birth_date is null or child_birth_date > current_date then
    raise exception 'Ange ett giltigt födelsedatum';
  end if;
  if not exists (
    select 1
    from public.departments d
    join public.preschools p on p.id = d.preschool_id
    where d.id = child_department_id
      and p.organization_id = account_profile.organization_id
  ) then
    raise exception 'Avdelningen tillhör inte din organisation';
  end if;

  insert into public.children (department_id, name, birth_date)
  values (child_department_id, trim(child_name), child_birth_date)
  returning * into new_child;

  insert into public.child_guardians (child_id, profile_id, relation, can_pickup)
  values (new_child.id, account_profile.id, 'Vårdnadshavare', true);

  return jsonb_build_object('child_id', new_child.id);
end;
$$;


create or replace function public.update_child_profile(
  target_child_id uuid,
  child_name text,
  child_birth_date date default null,
  child_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin_for_child(target_child_id) or public.is_guardian(target_child_id) or public.is_staff_for_child(target_child_id)) then
    raise exception 'Du saknar behörighet till barnet';
  end if;
  if trim(child_name) = '' then raise exception 'Barnets namn måste anges'; end if;
  update public.children
  set name = trim(child_name), birth_date = child_birth_date, notes = nullif(trim(child_notes), '')
  where id = target_child_id;
  if not found then raise exception 'Barnet hittades inte'; end if;
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
set search_path = public
as $$
declare
  caller_profile public.profiles;
  target_organization_id uuid;
  target_preschool_id uuid;
  target_department_id uuid;
  new_invitation public.invitations;
  generated_code text;
  attempt int;
begin
  select * into caller_profile from public.profiles where auth_user_id = auth.uid();
  if not found then raise exception 'Profil saknas'; end if;
  if invite_role not in ('parent', 'staff') then raise exception 'Endast vårdnadshavare och personal kan bjudas in'; end if;
  if trim(invite_email) = '' or position('@' in invite_email) < 2 then raise exception 'Ange en giltig e-postadress'; end if;

  if invite_role = 'parent' then
    if invite_child_id is null then raise exception 'Välj ett barn'; end if;
    select p.organization_id, p.id, d.id
      into target_organization_id, target_preschool_id, target_department_id
    from public.children c
    join public.departments d on d.id = c.department_id
    join public.preschools p on p.id = d.preschool_id
    where c.id = invite_child_id;
    if target_organization_id is null or target_organization_id <> caller_profile.organization_id then raise exception 'Barnet tillhör inte din organisation'; end if;
    if caller_profile.role = 'staff' and not public.is_staff_for_child(invite_child_id) then raise exception 'Du saknar behörighet till barnet'; end if;
    if caller_profile.role not in ('admin', 'staff') then raise exception 'Du får inte skapa inbjudningar'; end if;
  else
    if caller_profile.role <> 'admin' then raise exception 'Endast organisationsadministratörer kan bjuda in personal'; end if;
    if invite_department_id is null then raise exception 'Välj en avdelning'; end if;
    select p.organization_id, p.id, d.id
      into target_organization_id, target_preschool_id, target_department_id
    from public.departments d
    join public.preschools p on p.id = d.preschool_id
    where d.id = invite_department_id;
    if target_organization_id is null or target_organization_id <> caller_profile.organization_id then raise exception 'Avdelningen tillhör inte din organisation'; end if;
  end if;

  update public.invitations
  set status = 'revoked', revoked_at = now()
  where status = 'pending'
    and lower(email) = lower(trim(invite_email))
    and role = invite_role::public.user_role
    and organization_id = target_organization_id
    and coalesce(child_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(invite_child_id, '00000000-0000-0000-0000-000000000000'::uuid);

  for attempt in 1..5 loop
    generated_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10));
    begin
      insert into public.invitations (
        organization_id, preschool_id, department_id, child_id, email, role, relation,
        code, status, invited_by, max_uses, uses_count, expires_at
      ) values (
        target_organization_id, target_preschool_id, target_department_id,
        case when invite_role = 'parent' then invite_child_id else null end,
        lower(trim(invite_email)), invite_role::public.user_role,
        case when invite_role = 'parent' then coalesce(nullif(trim(invite_relation), ''), 'Vårdnadshavare') else null end,
        generated_code, 'pending', caller_profile.id, 1, 0, now() + interval '14 days'
      ) returning * into new_invitation;
      return to_jsonb(new_invitation);
    exception when unique_violation then
      if attempt = 5 then raise; end if;
    end;
  end loop;
  raise exception 'Kunde inte skapa en unik inbjudningskod';
end;
$$;

create or replace function public.accept_invitation(invite_code text)
returns public.invitations
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
  user_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  select * into invitation
  from public.invitations
  where code = upper(trim(invite_code))
    and status = 'pending'
    and uses_count = 0
    and expires_at > now()
  for update;
  if not found then raise exception 'Inbjudningskoden är ogiltig eller har gått ut'; end if;
  if lower(invitation.email) <> user_email then raise exception 'Inbjudan gäller en annan e-postadress'; end if;

  select * into account_profile from public.profiles where auth_user_id = auth.uid();
  if found then
    if account_profile.organization_id <> invitation.organization_id then raise exception 'Kontot tillhör redan en annan organisation'; end if;
    if account_profile.role <> invitation.role then raise exception 'Kontot har redan en annan roll i organisationen'; end if;
  else
    user_name := coalesce(nullif(trim(auth.jwt() -> 'user_metadata' ->> 'name'), ''), split_part(user_email, '@', 1));
    insert into public.profiles (auth_user_id, organization_id, name, email, role)
    values (auth.uid(), invitation.organization_id, user_name, user_email, invitation.role)
    returning * into account_profile;
  end if;

  if invitation.role = 'parent' then
    insert into public.child_guardians (child_id, profile_id, relation, can_pickup)
    values (invitation.child_id, account_profile.id, coalesce(invitation.relation, 'Vårdnadshavare'), true)
    on conflict (child_id, profile_id) do update set relation = excluded.relation;
  elsif invitation.role = 'staff' then
    insert into public.staff_departments (staff_id, department_id)
    values (account_profile.id, invitation.department_id)
    on conflict do nothing;
  end if;

  update public.invitations
  set uses_count = 1, status = 'accepted', accepted_by = account_profile.id, accepted_at = now()
  where id = invitation.id
  returning * into invitation;
  return invitation;
end;
$$;

create or replace function public.save_attendance_plan(
  target_child_id uuid,
  plan_status public.attendance_status,
  plan_dropoff_at time,
  plan_pickup_at time,
  plan_pickup_by text,
  plan_absence_note text
)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_attendance public.attendance;
  normalized_note text := nullif(trim(plan_absence_note), '');
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not public.is_guardian(target_child_id) then raise exception 'Du är inte vårdnadshavare för barnet'; end if;
  if plan_status not in ('in', 'absent_sick', 'absent_leave') then raise exception 'Ogiltig planstatus'; end if;
  if plan_dropoff_at is not null and plan_pickup_at is not null and plan_dropoff_at >= plan_pickup_at then
    raise exception 'Hämtningstiden måste vara efter lämningstiden';
  end if;
  if char_length(coalesce(trim(plan_pickup_by), '')) > 200 then raise exception 'Hämtarens namn är för långt'; end if;
  if char_length(coalesce(normalized_note, '')) > 500 then raise exception 'Frånvaroorsaken är för lång'; end if;
  if plan_status = 'in' then normalized_note := null; end if;
  if plan_status <> 'in' and exists (
    select 1 from public.attendance
    where child_id = target_child_id
      and date = current_date
      and checked_in_at is not null
      and checked_out_at is null
  ) then
    raise exception 'Barnet är redan incheckat och måste checkas ut av personalen först';
  end if;

  insert into public.attendance (
    child_id, date, status, dropoff_at, pickup_at, pickup_by, absence_note, updated_by, updated_at
  ) values (
    target_child_id, current_date, plan_status, plan_dropoff_at, plan_pickup_at,
    nullif(trim(plan_pickup_by), ''), normalized_note, public.current_profile_id(), now()
  )
  on conflict (child_id, date) do update
  set status = excluded.status,
      dropoff_at = excluded.dropoff_at,
      pickup_at = excluded.pickup_at,
      pickup_by = excluded.pickup_by,
      absence_note = excluded.absence_note,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  returning * into saved_attendance;

  return saved_attendance;
end;
$$;

create or replace function public.list_child_box_items()
returns table (
  child_id uuid,
  item_type text,
  level text,
  updated_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select box.child_id, box.item_type, box.level, box.updated_at
  from public.child_box_items box
  order by box.child_id, box.item_type
$$;

create or replace function public.save_child_box(target_child_id uuid, items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  item_name text;
  item_level text;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not (
    public.is_guardian(target_child_id)
    or public.is_staff_for_child(target_child_id)
    or public.is_admin_for_child(target_child_id)
  ) then
    raise exception 'Du saknar behörighet till barnets låda';
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Välj minst en status i barnets låda';
  end if;
  if jsonb_array_length(items) > 4 then raise exception 'För många saker i barnets låda'; end if;

  for item in select value from jsonb_array_elements(items)
  loop
    item_name := item->>'item_type';
    item_level := item->>'level';
    if item_name not in ('diapers', 'spare_clothes', 'rain_clothes', 'socks') then raise exception 'Ogiltig sak i barnets låda'; end if;
    if item_level not in ('none', 'few', 'many') then raise exception 'Ogiltig status i barnets låda'; end if;
    if (select count(*) from jsonb_array_elements(items) candidate where candidate->>'item_type' = item_name) > 1 then
      raise exception 'Samma sak finns flera gånger i barnets låda';
    end if;
    insert into public.child_box_items (child_id, item_type, level, updated_by, updated_at)
    values (target_child_id, item_name, item_level, public.current_profile_id(), now())
    on conflict (child_id, item_type) do update
    set level = excluded.level, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  end loop;
end;
$$;

create or replace function public.set_child_attendance(target_child_id uuid, transition text)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  current_attendance public.attendance;
  saved_attendance public.attendance;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not (public.is_admin_for_child(target_child_id) or public.is_staff_for_child(target_child_id)) then
    raise exception 'Du saknar behörighet till barnets närvaro';
  end if;
  if transition not in ('check_in', 'check_out', 'absent_sick', 'absent_leave') then
    raise exception 'Ogiltig närvaroändring';
  end if;

  select * into current_attendance
  from public.attendance
  where child_id = target_child_id and date = current_date
  for update;

  if transition = 'check_in' then
    if current_attendance.checked_in_at is not null and current_attendance.checked_out_at is null then
      raise exception 'Barnet är redan incheckat';
    end if;
    insert into public.attendance (
      child_id, date, status, checked_in_at, checked_out_at, absence_note, updated_by, updated_at
    ) values (
      target_child_id, current_date, 'in', now(), null, null, public.current_profile_id(), now()
    )
    on conflict (child_id, date) do update
    set status = 'in', checked_in_at = now(), checked_out_at = null, absence_note = null,
        updated_by = public.current_profile_id(), updated_at = now()
    returning * into saved_attendance;
  elsif transition = 'check_out' then
    if current_attendance.id is null or current_attendance.checked_in_at is null or current_attendance.checked_out_at is not null then
      raise exception 'Barnet är inte incheckat';
    end if;
    update public.attendance
    set status = 'picked_up', checked_out_at = now(),
        updated_by = public.current_profile_id(), updated_at = now()
    where id = current_attendance.id
    returning * into saved_attendance;
  else
    if current_attendance.checked_in_at is not null and current_attendance.checked_out_at is null then
      raise exception 'Barnet är incheckat och måste checkas ut först';
    end if;
    insert into public.attendance (
      child_id, date, status, checked_in_at, checked_out_at, updated_by, updated_at
    ) values (
      target_child_id, current_date, transition::public.attendance_status, null, null,
      public.current_profile_id(), now()
    )
    on conflict (child_id, date) do update
    set status = excluded.status, checked_in_at = null, checked_out_at = null,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at
    returning * into saved_attendance;
  end if;

  return saved_attendance;
end;
$$;

alter table public.organizations enable row level security;
alter table public.preschools enable row level security;
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.children enable row level security;
alter table public.child_health enable row level security;
alter table public.child_guardians enable row level security;
alter table public.child_contacts enable row level security;
alter table public.staff_departments enable row level security;
alter table public.attendance enable row level security;
alter table public.child_box_items enable row level security;
alter table public.posts enable row level security;
alter table public.consents enable row level security;
alter table public.invitations enable row level security;

-- Remove every previous pilot policy before installing tenant-scoped policies.
do $$
declare policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'organizations', 'preschools', 'departments', 'profiles', 'children',
        'child_health', 'child_guardians', 'child_contacts', 'staff_departments',
        'attendance', 'child_box_items', 'posts', 'consents', 'invitations', 'shelf_items',
        'documents', 'document_signatures', 'playdate_opt_ins', 'playdate_requests',
        'lost_items', 'calendar_feeds', 'calendar_events'
      ])
  loop
    execute format('drop policy if exists %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end $$;

create policy "organization tenant read" on public.organizations
for select using (id = public.current_organization_id());
create policy "organization admin update" on public.organizations
for update using (id = public.current_organization_id() and public.is_admin())
with check (id = public.current_organization_id() and public.is_admin());

create policy "preschool tenant read" on public.preschools
for select using (organization_id = public.current_organization_id());
create policy "preschool admin write" on public.preschools
for all using (organization_id = public.current_organization_id() and public.is_admin())
with check (organization_id = public.current_organization_id() and public.is_admin());

create policy "department tenant read" on public.departments
for select using (exists (
  select 1 from public.preschools p
  where p.id = preschool_id and p.organization_id = public.current_organization_id()
));
create policy "department admin write" on public.departments
for all using (public.is_admin() and exists (
  select 1 from public.preschools p
  where p.id = preschool_id and p.organization_id = public.current_organization_id()
)) with check (public.is_admin() and exists (
  select 1 from public.preschools p
  where p.id = preschool_id and p.organization_id = public.current_organization_id()
));

create policy "profile self or tenant admin read" on public.profiles
for select using (auth_user_id = auth.uid() or (public.is_admin() and organization_id = public.current_organization_id()));
create policy "profile self update" on public.profiles
for update using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid() and organization_id = public.current_organization_id() and role = public.current_role());

create policy "child authorized read" on public.children
for select using (public.is_admin_for_child(id) or public.is_guardian(id) or public.is_staff_for_child(id));
create policy "child admin or staff insert" on public.children
for insert with check (public.is_admin_for_department(department_id) or public.is_staff_for_department(department_id));
create policy "child admin delete" on public.children
for delete using (public.is_admin_for_child(id));

create policy "health authorized read" on public.child_health
for select using (public.is_admin_for_child(child_id) or public.is_guardian(child_id) or public.is_staff_for_child(child_id));
create policy "health authorized insert" on public.child_health
for insert with check (public.is_admin_for_child(child_id) or public.is_guardian(child_id) or public.is_staff_for_child(child_id));
create policy "health authorized update" on public.child_health
for update using (public.is_admin_for_child(child_id) or public.is_guardian(child_id) or public.is_staff_for_child(child_id))
with check (public.is_admin_for_child(child_id) or public.is_guardian(child_id) or public.is_staff_for_child(child_id));

create policy "guardian authorized read" on public.child_guardians
for select using (profile_id = public.current_profile_id() or public.is_admin_for_child(child_id) or public.is_staff_for_child(child_id));
create policy "guardian admin delete" on public.child_guardians
for delete using (public.is_admin_for_child(child_id));

create policy "contact authorized read" on public.child_contacts
for select using (public.is_admin_for_child(child_id) or public.is_guardian(child_id) or public.is_staff_for_child(child_id));
create policy "contact guardian insert" on public.child_contacts
for insert with check (public.is_admin_for_child(child_id) or public.is_guardian(child_id));
create policy "contact guardian update" on public.child_contacts
for update using (public.is_admin_for_child(child_id) or public.is_guardian(child_id))
with check (public.is_admin_for_child(child_id) or public.is_guardian(child_id));
create policy "contact guardian delete" on public.child_contacts
for delete using (public.is_admin_for_child(child_id) or public.is_guardian(child_id));

create policy "staff assignment own or admin read" on public.staff_departments
for select using (staff_id = public.current_profile_id() or public.is_admin_for_department(department_id));
create policy "staff assignment admin write" on public.staff_departments
for all using (public.is_admin_for_department(department_id))
with check (public.is_admin_for_department(department_id));

create policy "attendance authorized read" on public.attendance
for select using (public.is_admin_for_child(child_id) or public.is_guardian(child_id) or public.is_staff_for_child(child_id));
create policy "attendance authorized insert" on public.attendance
for insert with check (public.is_admin_for_child(child_id) or public.is_guardian(child_id) or public.is_staff_for_child(child_id));
create policy "attendance authorized update" on public.attendance
for update using (public.is_admin_for_child(child_id) or public.is_guardian(child_id) or public.is_staff_for_child(child_id))
with check (public.is_admin_for_child(child_id) or public.is_guardian(child_id) or public.is_staff_for_child(child_id));

create policy "child box authorized read" on public.child_box_items
for select using (public.is_admin_for_child(child_id) or public.is_guardian(child_id) or public.is_staff_for_child(child_id));

create policy "post authorized read" on public.posts
for select using (
  public.is_admin_for_department(department_id)
  or public.is_staff_for_department(department_id)
  or (child_id is not null and public.is_guardian(child_id))
  or (child_id is null and public.is_guardian_for_department(department_id))
);
create policy "post staff write" on public.posts
for insert with check ((public.is_admin_for_department(department_id) or public.is_staff_for_department(department_id)) and author_id = public.current_profile_id());
create policy "post author delete" on public.posts
for delete using (public.is_admin_for_department(department_id) or author_id = public.current_profile_id());

create policy "consent authorized read" on public.consents
for select using (public.is_admin_for_child(child_id) or public.is_guardian(child_id) or public.is_staff_for_child(child_id));
create policy "consent guardian insert" on public.consents
for insert with check (public.is_admin_for_child(child_id) or public.is_guardian(child_id));
create policy "consent guardian update" on public.consents
for update using (public.is_admin_for_child(child_id) or public.is_guardian(child_id))
with check (public.is_admin_for_child(child_id) or public.is_guardian(child_id));

create policy "invitation authorized read" on public.invitations
for select using (
  organization_id = public.current_organization_id()
  and (public.is_admin() or (role = 'parent' and public.is_staff_for_child(child_id)))
);
create policy "invitation authorized revoke" on public.invitations
for update using (
  organization_id = public.current_organization_id()
  and (public.is_admin() or (role = 'parent' and public.is_staff_for_child(child_id)))
) with check (organization_id = public.current_organization_id());

create or replace function public.normalize_attendance_absence_period()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status not in ('absent_sick', 'absent_leave') then
    new.absence_ends_on := null;
  end if;
  return new;
end;
$$;

create trigger normalize_attendance_absence_period
before insert or update of status, absence_ends_on on public.attendance
for each row execute function public.normalize_attendance_absence_period();

create or replace function public.cancel_remaining_absence_period()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  keep_through date;
begin
  if old.absence_ends_on is null then return new; end if;
  keep_through := case
    when new.status in ('absent_sick', 'absent_leave') then coalesce(new.absence_ends_on, new.date)
    else new.date
  end;
  if keep_through < old.absence_ends_on then
    delete from public.attendance
    where child_id = new.child_id
      and date > keep_through
      and date <= old.absence_ends_on
      and status in ('absent_sick', 'absent_leave')
      and absence_ends_on = old.absence_ends_on;
  end if;
  return new;
end;
$$;

create trigger cancel_remaining_absence_period
after update of status, absence_ends_on on public.attendance
for each row execute function public.cancel_remaining_absence_period();

create or replace function public.save_attendance_period(
  target_child_id uuid,
  plan_status public.attendance_status,
  plan_ends_on date,
  plan_absence_note text
)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_attendance public.attendance;
  target_date date;
  normalized_note text := nullif(trim(plan_absence_note), '');
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not public.is_guardian(target_child_id) then raise exception 'Du är inte vårdnadshavare för barnet'; end if;
  if plan_status not in ('absent_sick', 'absent_leave') then raise exception 'Endast sjukdom eller ledighet kan registreras för flera dagar'; end if;
  if plan_ends_on is null or plan_ends_on < current_date then raise exception 'Slutdatumet kan inte vara före idag'; end if;
  if plan_ends_on > current_date + 30 then raise exception 'Frånvaro kan registreras högst 31 dagar åt gången'; end if;
  if char_length(coalesce(normalized_note, '')) > 500 then raise exception 'Frånvaroorsaken är för lång'; end if;
  if exists (
    select 1 from public.attendance
    where child_id = target_child_id and date = current_date
      and checked_in_at is not null and checked_out_at is null
  ) then
    raise exception 'Barnet är redan incheckat och måste checkas ut av personalen först';
  end if;

  for target_date in
    select day::date
    from generate_series(current_date, plan_ends_on, interval '1 day') day
    where extract(isodow from day) < 6
  loop
    insert into public.attendance (
      child_id, date, status, dropoff_at, pickup_at, pickup_by, absence_note,
      absence_ends_on, updated_by, updated_at
    ) values (
      target_child_id, target_date, plan_status, null, null, null, normalized_note,
      plan_ends_on, public.current_profile_id(), now()
    )
    on conflict (child_id, date) do update
    set status = excluded.status,
        dropoff_at = null,
        pickup_at = null,
        pickup_by = null,
        absence_note = excluded.absence_note,
        absence_ends_on = excluded.absence_ends_on,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
  end loop;

  select * into saved_attendance
  from public.attendance
  where child_id = target_child_id and date = current_date;
  return saved_attendance;
end;
$$;

revoke all on function public.create_organization(text, text, text, text) from public;
revoke all on function public.create_preschool(text, text, text, text, text, text, text) from public;
revoke all on function public.update_child_profile(uuid, text, date, text) from public;
revoke all on function public.register_guardian_child(text, date, uuid) from public;
revoke all on function public.create_invitation(text, text, uuid, uuid, text) from public;
revoke all on function public.accept_invitation(text) from public;
revoke all on function public.save_attendance_plan(uuid, public.attendance_status, time, time, text, text) from public;
revoke all on function public.set_child_attendance(uuid, text) from public;
revoke all on function public.list_child_box_items() from public;
revoke all on function public.save_child_box(uuid, jsonb) from public;
revoke all on function public.normalize_attendance_absence_period() from public;
revoke all on function public.cancel_remaining_absence_period() from public;
revoke all on function public.save_attendance_period(uuid, public.attendance_status, date, text) from public;
grant execute on function public.create_organization(text, text, text, text) to authenticated;
grant execute on function public.create_preschool(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_child_profile(uuid, text, date, text) to authenticated;
grant execute on function public.register_guardian_child(text, date, uuid) to authenticated;
grant execute on function public.create_invitation(text, text, uuid, uuid, text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.save_attendance_plan(uuid, public.attendance_status, time, time, text, text) to authenticated;
grant execute on function public.set_child_attendance(uuid, text) to authenticated;
grant execute on function public.list_child_box_items() to authenticated;
grant execute on function public.save_child_box(uuid, jsonb) to authenticated;
grant execute on function public.save_attendance_period(uuid, public.attendance_status, date, text) to authenticated;

grant select, insert, update, delete on public.organizations, public.preschools, public.departments,
  public.profiles, public.children, public.child_health, public.child_guardians,
  public.child_contacts, public.staff_departments, public.posts,
  public.consents, public.invitations to authenticated;
grant select on public.attendance to authenticated;
revoke insert, update, delete on public.attendance from authenticated;
grant select on public.child_box_items to authenticated;
revoke insert, update, delete on public.child_box_items from authenticated;
revoke update on public.profiles from authenticated;
grant update (name, phone) on public.profiles to authenticated;
revoke update on public.children from authenticated;

-- Family and school feature contract for fresh installations.
-- Direct table writes stay revoked; mutations use security-definer RPCs.

begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.family_child_visible(target_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_guardian(target_child_id)
    or public.is_staff_for_child(target_child_id)
    or public.is_admin_for_child(target_child_id)
$$;

create or replace function private.family_child_manageable(target_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_staff_for_child(target_child_id)
    or public.is_admin_for_child(target_child_id)
$$;

create or replace function private.family_department_visible(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_guardian_for_department(target_department_id)
    or public.is_staff_for_department(target_department_id)
    or public.is_admin_for_department(target_department_id)
$$;

create or replace function private.family_department_manageable(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_staff_for_department(target_department_id)
    or public.is_admin_for_department(target_department_id)
$$;

create or replace function private.family_preschool_visible(target_preschool_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.departments department
    where department.preschool_id = target_preschool_id
      and private.family_department_visible(department.id)
  )
$$;

create or replace function private.family_preschool_manageable(target_preschool_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.departments department
    where department.preschool_id = target_preschool_id
      and private.family_department_manageable(department.id)
  )
$$;

create table if not exists public.portfolio_items (
  id uuid primary key,
  child_id uuid not null references public.children(id) on delete cascade,
  storage_path text not null unique,
  caption text,
  taken_on date,
  byte_size integer not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint portfolio_caption_length check (caption is null or char_length(btrim(caption)) between 1 and 500),
  constraint portfolio_size check (byte_size between 1 and 5242880),
  constraint portfolio_path_shape check (storage_path = child_id::text || '/' || id::text || '.jpg')
);

create table if not exists public.lost_found_posts (
  id uuid primary key,
  department_id uuid not null references public.departments(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('lost', 'found')),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text not null check (char_length(btrim(description)) between 2 and 1200),
  storage_path text unique,
  image_byte_size integer,
  status text not null default 'open' check (status in ('open', 'matched', 'returned', 'closed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  expires_at timestamptz not null default (now() + interval '180 days'),
  constraint lost_found_image check (
    (storage_path is null and image_byte_size is null)
    or (storage_path = department_id::text || '/' || author_id::text || '/' || id::text || '.jpg' and image_byte_size between 1 and 5242880)
  )
);

create table if not exists public.school_banners (
  id uuid primary key default gen_random_uuid(),
  preschool_id uuid not null references public.preschools(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  severity text not null check (severity in ('info', 'important', 'urgent')),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  body text not null check (char_length(btrim(body)) between 2 and 1200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_banner_window check (ends_at > starts_at and ends_at <= starts_at + interval '30 days')
);

create table if not exists public.school_events (
  id uuid primary key default gen_random_uuid(),
  preschool_id uuid not null references public.preschools(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  body text check (body is null or char_length(btrim(body)) between 1 and 2000),
  location text check (location is null or char_length(btrim(location)) between 1 and 300),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  rsvp_enabled boolean not null default false,
  rsvp_due date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_event_window check (ends_at > starts_at and ends_at <= starts_at + interval '14 days'),
  constraint school_event_rsvp check (
    (not rsvp_enabled and rsvp_due is null)
    or (rsvp_enabled and rsvp_due is not null and rsvp_due <= (starts_at at time zone 'Europe/Stockholm')::date)
  )
);

create table if not exists public.school_event_rsvps (
  event_id uuid not null references public.school_events(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  response text not null check (response in ('yes', 'no')),
  answered_by uuid references public.profiles(id) on delete set null,
  answered_at timestamptz not null default now(),
  primary key (event_id, child_id)
);

create table if not exists public.school_subject_progress (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 1 and 80),
  period text not null check (char_length(btrim(period)) between 1 and 80),
  standing text not null check (standing in ('ahead', 'on_track', 'needs_support')),
  current_grade text check (current_grade is null or char_length(btrim(current_grade)) between 1 and 20),
  summary text check (summary is null or char_length(btrim(summary)) between 1 and 2000),
  next_steps text check (next_steps is null or char_length(btrim(next_steps)) between 1 and 2000),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (child_id, subject, period)
);

create table if not exists public.school_assignments (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 1 and 80),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  description text check (description is null or char_length(btrim(description)) between 1 and 2000),
  due_on date not null,
  status text not null check (status in ('homework', 'missing', 'submitted', 'completed')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists portfolio_items_child_created_idx on public.portfolio_items(child_id, created_at desc);
create index if not exists lost_found_department_status_idx on public.lost_found_posts(department_id, status, created_at desc);
create index if not exists school_banners_scope_time_idx on public.school_banners(preschool_id, department_id, starts_at, ends_at);
create index if not exists school_events_scope_time_idx on public.school_events(preschool_id, department_id, starts_at);
create index if not exists school_event_rsvps_child_idx on public.school_event_rsvps(child_id, event_id);
create index if not exists school_subject_progress_child_idx on public.school_subject_progress(child_id, updated_at desc);
create index if not exists school_assignments_child_due_idx on public.school_assignments(child_id, due_on, status);

alter table public.portfolio_items enable row level security;
alter table public.lost_found_posts enable row level security;
alter table public.school_banners enable row level security;
alter table public.school_events enable row level security;
alter table public.school_event_rsvps enable row level security;
alter table public.school_subject_progress enable row level security;
alter table public.school_assignments enable row level security;

revoke all on public.portfolio_items, public.lost_found_posts, public.school_banners,
  public.school_events, public.school_event_rsvps, public.school_subject_progress,
  public.school_assignments from public, anon, authenticated;
grant select on public.portfolio_items, public.lost_found_posts, public.school_banners,
  public.school_events, public.school_event_rsvps, public.school_subject_progress,
  public.school_assignments to authenticated;

drop policy if exists "portfolio authorized read" on public.portfolio_items;
create policy "portfolio authorized read" on public.portfolio_items
for select to authenticated using (private.family_child_visible(child_id));

drop policy if exists "lost found department read" on public.lost_found_posts;
create policy "lost found department read" on public.lost_found_posts
for select to authenticated using (private.family_department_visible(department_id));

drop policy if exists "school banner scoped read" on public.school_banners;
create policy "school banner scoped read" on public.school_banners
for select to authenticated using (
  case when department_id is null
    then private.family_preschool_visible(preschool_id)
    else private.family_department_visible(department_id)
  end
);

drop policy if exists "school event scoped read" on public.school_events;
create policy "school event scoped read" on public.school_events
for select to authenticated using (
  case when department_id is null
    then private.family_preschool_visible(preschool_id)
    else private.family_department_visible(department_id)
  end
);

drop policy if exists "school event rsvp authorized read" on public.school_event_rsvps;
create policy "school event rsvp authorized read" on public.school_event_rsvps
for select to authenticated using (private.family_child_visible(child_id));

drop policy if exists "school progress authorized read" on public.school_subject_progress;
create policy "school progress authorized read" on public.school_subject_progress
for select to authenticated using (private.family_child_visible(child_id));

drop policy if exists "school assignments authorized read" on public.school_assignments;
create policy "school assignments authorized read" on public.school_assignments
for select to authenticated using (private.family_child_visible(child_id));

create or replace function private.family_scope_valid(target_preschool_id uuid, target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_department_id is null or exists (
    select 1 from public.departments department
    where department.id = target_department_id
      and department.preschool_id = target_preschool_id
  )
$$;

create or replace function public.list_family_features()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  portfolio jsonb;
  lost_found jsonb;
  banners jsonb;
  events jsonb;
  progress jsonb;
  assignments jsonb;
  staff_view boolean := public.current_role() in ('staff'::public.user_role, 'admin'::public.user_role);
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id', item.id,
    'child_id', item.child_id,
    'child_name', child.name,
    'storage_path', item.storage_path,
    'caption', item.caption,
    'taken_on', item.taken_on,
    'created_at', item.created_at,
    'can_manage', private.family_child_manageable(item.child_id)
  ) order by coalesce(item.taken_on, item.created_at::date) desc, item.created_at desc), '[]'::jsonb)
  into portfolio
  from public.portfolio_items item
  join public.children child on child.id = item.child_id
  where private.family_child_visible(item.child_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'post_id', post.id,
    'department_id', post.department_id,
    'department_name', department.name,
    'author_id', post.author_id,
    'author_name', profile.name,
    'kind', post.kind,
    'title', post.title,
    'description', post.description,
    'storage_path', post.storage_path,
    'status', post.status,
    'created_at', post.created_at,
    'can_manage', post.author_id = public.current_profile_id() or private.family_department_manageable(post.department_id)
  ) order by (post.status = 'open') desc, post.created_at desc), '[]'::jsonb)
  into lost_found
  from public.lost_found_posts post
  join public.departments department on department.id = post.department_id
  join public.profiles profile on profile.id = post.author_id
  where private.family_department_visible(post.department_id)
    and post.expires_at > now();

  select coalesce(jsonb_agg(jsonb_build_object(
    'banner_id', banner.id,
    'preschool_id', banner.preschool_id,
    'preschool_name', preschool.name,
    'department_id', banner.department_id,
    'department_name', department.name,
    'severity', banner.severity,
    'title', banner.title,
    'body', banner.body,
    'starts_at', banner.starts_at,
    'ends_at', banner.ends_at,
    'can_manage', case when banner.department_id is null
      then private.family_preschool_manageable(banner.preschool_id)
      else private.family_department_manageable(banner.department_id)
    end
  ) order by banner.starts_at desc), '[]'::jsonb)
  into banners
  from public.school_banners banner
  join public.preschools preschool on preschool.id = banner.preschool_id
  left join public.departments department on department.id = banner.department_id
  where (case when banner.department_id is null
      then private.family_preschool_visible(banner.preschool_id)
      else private.family_department_visible(banner.department_id)
    end)
    and banner.ends_at >= case when staff_view then now() - interval '7 days' else now() end
    and (staff_view or banner.starts_at <= now());

  select coalesce(jsonb_agg(row_data order by row_data ->> 'starts_at', row_data ->> 'child_name'), '[]'::jsonb)
  into events
  from (
    select jsonb_build_object(
      'event_id', event.id,
      'preschool_id', event.preschool_id,
      'preschool_name', preschool.name,
      'department_id', event.department_id,
      'department_name', department.name,
      'title', event.title,
      'body', event.body,
      'location', event.location,
      'starts_at', event.starts_at,
      'ends_at', event.ends_at,
      'rsvp_enabled', event.rsvp_enabled,
      'rsvp_due', event.rsvp_due,
      'child_id', child.id,
      'child_name', child.name,
      'response', rsvp.response,
      'can_manage', case when event.department_id is null
        then private.family_preschool_manageable(event.preschool_id)
        else private.family_department_manageable(event.department_id)
      end
    ) as row_data
    from public.school_events event
    join public.preschools preschool on preschool.id = event.preschool_id
    left join public.departments department on department.id = event.department_id
    left join public.children child on (
      (event.department_id is not null and child.department_id = event.department_id)
      or (event.department_id is null and exists (
        select 1 from public.departments child_department
        where child_department.id = child.department_id
          and child_department.preschool_id = event.preschool_id
      ))
    ) and private.family_child_visible(child.id)
    left join public.school_event_rsvps rsvp on rsvp.event_id = event.id and rsvp.child_id = child.id
    where (case when event.department_id is null
        then private.family_preschool_visible(event.preschool_id)
        else private.family_department_visible(event.department_id)
      end)
      and event.ends_at >= now() - interval '30 days'
      and event.starts_at <= now() + interval '1 year'
  ) visible_events;

  select coalesce(jsonb_agg(jsonb_build_object(
    'progress_id', item.id,
    'child_id', item.child_id,
    'child_name', child.name,
    'subject', item.subject,
    'period', item.period,
    'standing', item.standing,
    'current_grade', item.current_grade,
    'summary', item.summary,
    'next_steps', item.next_steps,
    'updated_at', item.updated_at,
    'can_manage', private.family_child_manageable(item.child_id)
  ) order by item.updated_at desc), '[]'::jsonb)
  into progress
  from public.school_subject_progress item
  join public.children child on child.id = item.child_id
  where private.family_child_visible(item.child_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'assignment_id', item.id,
    'child_id', item.child_id,
    'child_name', child.name,
    'subject', item.subject,
    'title', item.title,
    'description', item.description,
    'due_on', item.due_on,
    'status', item.status,
    'updated_at', item.updated_at,
    'can_manage', private.family_child_manageable(item.child_id)
  ) order by item.due_on, item.subject, item.title), '[]'::jsonb)
  into assignments
  from public.school_assignments item
  join public.children child on child.id = item.child_id
  where private.family_child_visible(item.child_id);

  return jsonb_build_object(
    'portfolio', portfolio,
    'lost_found', lost_found,
    'banners', banners,
    'events', events,
    'progress', progress,
    'assignments', assignments
  );
end;
$$;

create or replace function public.save_portfolio_item(
  target_item_id uuid,
  target_child_id uuid,
  object_path text,
  item_caption text default null,
  item_taken_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  object_size bigint;
  object_mime text;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if target_item_id is null or not private.family_child_manageable(target_child_id) then
    raise exception 'Du saknar behörighet till barnets portfolio';
  end if;
  if not exists (
    select 1 from public.consents consent
    where consent.child_id = target_child_id
      and consent.type = 'app_images'::public.consent_type
      and consent.allowed
  ) then raise exception 'Samtycke för Bilder i ärtan saknas'; end if;
  if object_path is distinct from target_child_id::text || '/' || target_item_id::text || '.jpg' then
    raise exception 'Bildens sökväg är ogiltig';
  end if;
  if char_length(coalesce(btrim(item_caption), '')) > 500 then raise exception 'Bildtexten är för lång'; end if;
  select nullif(object.metadata ->> 'size', '')::bigint, object.metadata ->> 'mimetype'
  into object_size, object_mime
  from storage.objects object
  where object.bucket_id = 'portfolio-images' and object.name = object_path;
  if object_size is null or object_size < 1 or object_size > 5242880 or object_mime is distinct from 'image/jpeg' then
    raise exception 'Bilden måste vara en JPEG på högst 5 MB';
  end if;
  insert into public.portfolio_items (id, child_id, storage_path, caption, taken_on, byte_size, uploaded_by)
  values (target_item_id, target_child_id, object_path, nullif(btrim(coalesce(item_caption, '')), ''), item_taken_on, object_size::integer, public.current_profile_id())
  on conflict (id) do update
  set caption = excluded.caption,
      taken_on = excluded.taken_on
  where portfolio_items.child_id = excluded.child_id
    and portfolio_items.storage_path = excluded.storage_path;
  return target_item_id;
end;
$$;

create or replace function public.delete_portfolio_item(target_item_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.portfolio_items;
begin
  select * into item from public.portfolio_items where id = target_item_id;
  if not found or not private.family_child_manageable(item.child_id) then
    raise exception 'Portfolioobjektet hittades inte eller kan inte tas bort';
  end if;
  delete from public.portfolio_items where id = target_item_id;
  return item.storage_path;
end;
$$;

create or replace function public.save_lost_found_post(
  target_post_id uuid,
  target_department_id uuid,
  post_kind text,
  post_title text,
  post_description text,
  object_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  object_size bigint;
  object_mime text;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if target_post_id is null or not private.family_department_visible(target_department_id) then
    raise exception 'Du saknar behörighet till avdelningens Borttappat';
  end if;
  if post_kind not in ('lost', 'found') then raise exception 'Välj Saknad eller Upphittad'; end if;
  if char_length(btrim(coalesce(post_title, ''))) not between 2 and 120 then raise exception 'Rubriken måste vara 2–120 tecken'; end if;
  if char_length(btrim(coalesce(post_description, ''))) not between 2 and 1200 then raise exception 'Beskrivningen måste vara 2–1200 tecken'; end if;
  if object_path is not null then
    if object_path is distinct from target_department_id::text || '/' || public.current_profile_id()::text || '/' || target_post_id::text || '.jpg' then
      raise exception 'Bildens sökväg är ogiltig';
    end if;
    select nullif(object.metadata ->> 'size', '')::bigint, object.metadata ->> 'mimetype'
    into object_size, object_mime
    from storage.objects object
    where object.bucket_id = 'lost-found-images' and object.name = object_path;
    if object_size is null or object_size < 1 or object_size > 5242880 or object_mime is distinct from 'image/jpeg' then
      raise exception 'Bilden måste vara en JPEG på högst 5 MB';
    end if;
  end if;
  insert into public.lost_found_posts (
    id, department_id, author_id, kind, title, description, storage_path, image_byte_size
  ) values (
    target_post_id, target_department_id, public.current_profile_id(), post_kind,
    btrim(post_title), btrim(post_description), object_path, object_size::integer
  );
  return target_post_id;
end;
$$;

create or replace function public.set_lost_found_status(target_post_id uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  post public.lost_found_posts;
begin
  select * into post from public.lost_found_posts where id = target_post_id;
  if not found or not (post.author_id = public.current_profile_id() or private.family_department_manageable(post.department_id)) then
    raise exception 'Inlägget hittades inte eller kan inte ändras';
  end if;
  if next_status not in ('open', 'matched', 'returned', 'closed') then raise exception 'Ogiltig status'; end if;
  update public.lost_found_posts
  set status = next_status,
      resolved_at = case when next_status = 'open' then null else now() end
  where id = target_post_id;
end;
$$;

create or replace function public.delete_lost_found_post(target_post_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  post public.lost_found_posts;
begin
  select * into post from public.lost_found_posts where id = target_post_id;
  if not found or not (post.author_id = public.current_profile_id() or private.family_department_manageable(post.department_id)) then
    raise exception 'Inlägget hittades inte eller kan inte tas bort';
  end if;
  delete from public.lost_found_posts where id = target_post_id;
  return post.storage_path;
end;
$$;

create or replace function public.save_school_banner(
  target_banner_id uuid,
  target_preschool_id uuid,
  target_department_id uuid,
  banner_severity text,
  banner_title text,
  banner_body text,
  banner_starts_at timestamptz,
  banner_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid := coalesce(target_banner_id, gen_random_uuid());
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not private.family_scope_valid(target_preschool_id, target_department_id) then raise exception 'Avdelningen tillhör inte skolan'; end if;
  if not (case when target_department_id is null
      then private.family_preschool_manageable(target_preschool_id)
      else private.family_department_manageable(target_department_id)
    end) then raise exception 'Du saknar behörighet att publicera bannern'; end if;
  if banner_severity not in ('info', 'important', 'urgent') then raise exception 'Ogiltig allvarlighetsgrad'; end if;
  if char_length(btrim(coalesce(banner_title, ''))) not between 2 and 120 then raise exception 'Rubriken måste vara 2–120 tecken'; end if;
  if char_length(btrim(coalesce(banner_body, ''))) not between 2 and 1200 then raise exception 'Texten måste vara 2–1200 tecken'; end if;
  if banner_starts_at is null or banner_ends_at is null or banner_ends_at <= banner_starts_at or banner_ends_at > banner_starts_at + interval '30 days' then
    raise exception 'Bannern behöver en giltig period på högst 30 dagar';
  end if;
  insert into public.school_banners (
    id, preschool_id, department_id, severity, title, body, starts_at, ends_at, created_by
  ) values (
    saved_id, target_preschool_id, target_department_id, banner_severity,
    btrim(banner_title), btrim(banner_body), banner_starts_at, banner_ends_at, public.current_profile_id()
  )
  on conflict (id) do update
  set severity = excluded.severity,
      title = excluded.title,
      body = excluded.body,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      updated_at = now()
  where school_banners.preschool_id = excluded.preschool_id
    and school_banners.department_id is not distinct from excluded.department_id;
  return saved_id;
end;
$$;

create or replace function public.delete_school_banner(target_banner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare banner public.school_banners;
begin
  select * into banner from public.school_banners where id = target_banner_id;
  if not found or not (case when banner.department_id is null
      then private.family_preschool_manageable(banner.preschool_id)
      else private.family_department_manageable(banner.department_id)
    end) then raise exception 'Bannern hittades inte eller kan inte tas bort'; end if;
  delete from public.school_banners where id = target_banner_id;
end;
$$;

create or replace function public.save_school_event(
  target_event_id uuid,
  target_preschool_id uuid,
  target_department_id uuid,
  event_title text,
  event_body text,
  event_location text,
  event_starts_at timestamptz,
  event_ends_at timestamptz,
  event_rsvp_enabled boolean,
  event_rsvp_due date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare saved_id uuid := coalesce(target_event_id, gen_random_uuid());
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not private.family_scope_valid(target_preschool_id, target_department_id) then raise exception 'Avdelningen tillhör inte skolan'; end if;
  if not (case when target_department_id is null
      then private.family_preschool_manageable(target_preschool_id)
      else private.family_department_manageable(target_department_id)
    end) then raise exception 'Du saknar behörighet att skapa händelsen'; end if;
  if char_length(btrim(coalesce(event_title, ''))) not between 2 and 160 then raise exception 'Rubriken måste vara 2–160 tecken'; end if;
  if char_length(coalesce(btrim(event_body), '')) > 2000 or char_length(coalesce(btrim(event_location), '')) > 300 then raise exception 'Händelsetexten är för lång'; end if;
  if event_starts_at is null or event_ends_at is null or event_ends_at <= event_starts_at or event_ends_at > event_starts_at + interval '14 days' then
    raise exception 'Händelsen behöver en giltig period på högst 14 dagar';
  end if;
  if coalesce(event_rsvp_enabled, false) and (event_rsvp_due is null or event_rsvp_due > (event_starts_at at time zone 'Europe/Stockholm')::date) then
    raise exception 'OSA-datumet måste vara senast på händelsedagen';
  end if;
  insert into public.school_events (
    id, preschool_id, department_id, title, body, location, starts_at, ends_at,
    rsvp_enabled, rsvp_due, created_by
  ) values (
    saved_id, target_preschool_id, target_department_id, btrim(event_title),
    nullif(btrim(coalesce(event_body, '')), ''), nullif(btrim(coalesce(event_location, '')), ''),
    event_starts_at, event_ends_at, coalesce(event_rsvp_enabled, false),
    case when coalesce(event_rsvp_enabled, false) then event_rsvp_due else null end,
    public.current_profile_id()
  )
  on conflict (id) do update
  set title = excluded.title,
      body = excluded.body,
      location = excluded.location,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      rsvp_enabled = excluded.rsvp_enabled,
      rsvp_due = excluded.rsvp_due,
      updated_at = now()
  where school_events.preschool_id = excluded.preschool_id
    and school_events.department_id is not distinct from excluded.department_id;
  return saved_id;
end;
$$;

create or replace function public.respond_school_event(target_event_id uuid, target_child_id uuid, event_response text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare event public.school_events;
begin
  if auth.uid() is null or not public.is_guardian(target_child_id) then raise exception 'Du är inte vårdnadshavare för barnet'; end if;
  if event_response not in ('yes', 'no') then raise exception 'Välj Ja eller Nej'; end if;
  select * into event from public.school_events where id = target_event_id;
  if not found or not event.rsvp_enabled or current_date > event.rsvp_due then raise exception 'OSA är inte öppet'; end if;
  if not exists (
    select 1 from public.children child
    join public.departments department on department.id = child.department_id
    where child.id = target_child_id
      and ((event.department_id is not null and child.department_id = event.department_id)
        or (event.department_id is null and department.preschool_id = event.preschool_id))
  ) then raise exception 'Händelsen gäller inte barnet'; end if;
  insert into public.school_event_rsvps (event_id, child_id, response, answered_by, answered_at)
  values (target_event_id, target_child_id, event_response, public.current_profile_id(), now())
  on conflict (event_id, child_id) do update
  set response = excluded.response,
      answered_by = excluded.answered_by,
      answered_at = now();
end;
$$;

create or replace function public.delete_school_event(target_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare event public.school_events;
begin
  select * into event from public.school_events where id = target_event_id;
  if not found or not (case when event.department_id is null
      then private.family_preschool_manageable(event.preschool_id)
      else private.family_department_manageable(event.department_id)
    end) then raise exception 'Händelsen hittades inte eller kan inte tas bort'; end if;
  delete from public.school_events where id = target_event_id;
end;
$$;

create or replace function public.save_subject_progress(
  target_progress_id uuid,
  target_child_id uuid,
  progress_subject text,
  progress_period text,
  progress_standing text,
  progress_grade text,
  progress_summary text,
  progress_next_steps text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare saved_id uuid := coalesce(target_progress_id, gen_random_uuid());
begin
  if auth.uid() is null or not private.family_child_manageable(target_child_id) then raise exception 'Du saknar behörighet till barnets skolprogression'; end if;
  if char_length(btrim(coalesce(progress_subject, ''))) not between 1 and 80 or char_length(btrim(coalesce(progress_period, ''))) not between 1 and 80 then raise exception 'Ange ämne och period'; end if;
  if progress_standing not in ('ahead', 'on_track', 'needs_support') then raise exception 'Ogiltigt progressionsläge'; end if;
  if char_length(coalesce(btrim(progress_grade), '')) > 20 or char_length(coalesce(btrim(progress_summary), '')) > 2000 or char_length(coalesce(btrim(progress_next_steps), '')) > 2000 then raise exception 'Texten är för lång'; end if;
  if target_progress_id is not null then
    update public.school_subject_progress
    set subject = btrim(progress_subject),
        period = btrim(progress_period),
        standing = progress_standing,
        current_grade = nullif(btrim(coalesce(progress_grade, '')), ''),
        summary = nullif(btrim(coalesce(progress_summary, '')), ''),
        next_steps = nullif(btrim(coalesce(progress_next_steps, '')), ''),
        updated_by = public.current_profile_id(),
        updated_at = now()
    where id = target_progress_id and child_id = target_child_id;
    if found then return target_progress_id; end if;
  end if;
  insert into public.school_subject_progress (
    id, child_id, subject, period, standing, current_grade, summary, next_steps, updated_by, updated_at
  ) values (
    saved_id, target_child_id, btrim(progress_subject), btrim(progress_period), progress_standing,
    nullif(btrim(coalesce(progress_grade, '')), ''), nullif(btrim(coalesce(progress_summary, '')), ''),
    nullif(btrim(coalesce(progress_next_steps, '')), ''), public.current_profile_id(), now()
  )
  on conflict (child_id, subject, period) do update
  set standing = excluded.standing,
      current_grade = excluded.current_grade,
      summary = excluded.summary,
      next_steps = excluded.next_steps,
      updated_by = excluded.updated_by,
      updated_at = now()
  returning id into saved_id;
  return saved_id;
end;
$$;

create or replace function public.delete_subject_progress(target_progress_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare item public.school_subject_progress;
begin
  select * into item from public.school_subject_progress where id = target_progress_id;
  if not found or not private.family_child_manageable(item.child_id) then raise exception 'Progressionsposten hittades inte eller kan inte tas bort'; end if;
  delete from public.school_subject_progress where id = target_progress_id;
end;
$$;

create or replace function public.save_school_assignment(
  target_assignment_id uuid,
  target_child_id uuid,
  assignment_subject text,
  assignment_title text,
  assignment_description text,
  assignment_due_on date,
  assignment_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare saved_id uuid := coalesce(target_assignment_id, gen_random_uuid());
begin
  if auth.uid() is null or not private.family_child_manageable(target_child_id) then raise exception 'Du saknar behörighet till barnets uppgifter'; end if;
  if char_length(btrim(coalesce(assignment_subject, ''))) not between 1 and 80 or char_length(btrim(coalesce(assignment_title, ''))) not between 2 and 160 then raise exception 'Ange ämne och rubrik'; end if;
  if char_length(coalesce(btrim(assignment_description), '')) > 2000 then raise exception 'Beskrivningen är för lång'; end if;
  if assignment_due_on is null then raise exception 'Ange sista datum'; end if;
  if assignment_status not in ('homework', 'missing', 'submitted', 'completed') then raise exception 'Ogiltig uppgiftsstatus'; end if;
  insert into public.school_assignments (
    id, child_id, subject, title, description, due_on, status, updated_by, updated_at
  ) values (
    saved_id, target_child_id, btrim(assignment_subject), btrim(assignment_title),
    nullif(btrim(coalesce(assignment_description, '')), ''), assignment_due_on,
    assignment_status, public.current_profile_id(), now()
  )
  on conflict (id) do update
  set subject = excluded.subject,
      title = excluded.title,
      description = excluded.description,
      due_on = excluded.due_on,
      status = excluded.status,
      updated_by = excluded.updated_by,
      updated_at = now()
  where school_assignments.child_id = excluded.child_id;
  return saved_id;
end;
$$;

create or replace function public.delete_school_assignment(target_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare item public.school_assignments;
begin
  select * into item from public.school_assignments where id = target_assignment_id;
  if not found or not private.family_child_manageable(item.child_id) then raise exception 'Uppgiften hittades inte eller kan inte tas bort'; end if;
  delete from public.school_assignments where id = target_assignment_id;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('portfolio-images', 'portfolio-images', false, 5242880, array['image/jpeg']),
  ('lost-found-images', 'lost-found-images', false, 5242880, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.portfolio_object_visible(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.family_child_visible(split_part(object_name, '/', 1)::uuid)
    else false
  end
$$;

create or replace function private.portfolio_object_manageable(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.family_child_manageable(split_part(object_name, '/', 1)::uuid)
    else false
  end
$$;

create or replace function private.portfolio_object_uploadable(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.family_child_manageable(split_part(object_name, '/', 1)::uuid)
        and exists (
          select 1 from public.consents consent
          where consent.child_id = split_part(object_name, '/', 1)::uuid
            and consent.type = 'app_images'::public.consent_type
            and consent.allowed
        )
    else false
  end
$$;

create or replace function private.lost_found_object_visible(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.family_department_visible(split_part(object_name, '/', 1)::uuid)
    else false
  end
$$;

create or replace function private.lost_found_object_manageable(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and split_part(object_name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.family_department_visible(split_part(object_name, '/', 1)::uuid)
        and (
          private.family_department_manageable(split_part(object_name, '/', 1)::uuid)
          or split_part(object_name, '/', 2)::uuid = public.current_profile_id()
        )
    else false
  end
$$;

do $$
begin
  -- storage.objects is owned by Supabase Storage. The migration role may
  -- create policies but must not try to alter that table.
  if not exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'storage'
      and relation.relname = 'objects'
      and relation.relrowsecurity
  ) then
    raise exception 'storage.objects måste redan ha row level security aktiverat';
  end if;
end $$;

drop policy if exists "portfolio image read" on storage.objects;
create policy "portfolio image read" on storage.objects
for select to authenticated
using (bucket_id = 'portfolio-images' and private.portfolio_object_visible(name));

drop policy if exists "portfolio image insert" on storage.objects;
create policy "portfolio image insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'portfolio-images' and private.portfolio_object_uploadable(name));

drop policy if exists "portfolio image delete" on storage.objects;
create policy "portfolio image delete" on storage.objects
for delete to authenticated
using (bucket_id = 'portfolio-images' and private.portfolio_object_manageable(name));

drop policy if exists "lost found image read" on storage.objects;
create policy "lost found image read" on storage.objects
for select to authenticated
using (bucket_id = 'lost-found-images' and private.lost_found_object_visible(name));

drop policy if exists "lost found image insert" on storage.objects;
create policy "lost found image insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'lost-found-images' and private.lost_found_object_manageable(name));

drop policy if exists "lost found image delete" on storage.objects;
create policy "lost found image delete" on storage.objects
for delete to authenticated
using (bucket_id = 'lost-found-images' and private.lost_found_object_manageable(name));

revoke all on function private.family_child_visible(uuid) from public, anon, authenticated;
revoke all on function private.family_child_manageable(uuid) from public, anon, authenticated;
revoke all on function private.family_department_visible(uuid) from public, anon, authenticated;
revoke all on function private.family_department_manageable(uuid) from public, anon, authenticated;
revoke all on function private.family_preschool_visible(uuid) from public, anon, authenticated;
revoke all on function private.family_preschool_manageable(uuid) from public, anon, authenticated;
revoke all on function private.family_scope_valid(uuid, uuid) from public, anon, authenticated;
revoke all on function private.portfolio_object_visible(text) from public, anon, authenticated;
revoke all on function private.portfolio_object_manageable(text) from public, anon, authenticated;
revoke all on function private.portfolio_object_uploadable(text) from public, anon, authenticated;
revoke all on function private.lost_found_object_visible(text) from public, anon, authenticated;
revoke all on function private.lost_found_object_manageable(text) from public, anon, authenticated;
grant execute on function private.family_child_visible(uuid) to authenticated;
grant execute on function private.family_child_manageable(uuid) to authenticated;
grant execute on function private.family_department_visible(uuid) to authenticated;
grant execute on function private.family_department_manageable(uuid) to authenticated;
grant execute on function private.family_preschool_visible(uuid) to authenticated;
grant execute on function private.family_preschool_manageable(uuid) to authenticated;
grant execute on function private.family_scope_valid(uuid, uuid) to authenticated;
grant execute on function private.portfolio_object_visible(text) to authenticated;
grant execute on function private.portfolio_object_manageable(text) to authenticated;
grant execute on function private.portfolio_object_uploadable(text) to authenticated;
grant execute on function private.lost_found_object_visible(text) to authenticated;
grant execute on function private.lost_found_object_manageable(text) to authenticated;

revoke all on function public.list_family_features() from public, anon, authenticated;
revoke all on function public.save_portfolio_item(uuid, uuid, text, text, date) from public, anon, authenticated;
revoke all on function public.delete_portfolio_item(uuid) from public, anon, authenticated;
revoke all on function public.save_lost_found_post(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.set_lost_found_status(uuid, text) from public, anon, authenticated;
revoke all on function public.delete_lost_found_post(uuid) from public, anon, authenticated;
revoke all on function public.save_school_banner(uuid, uuid, uuid, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.delete_school_banner(uuid) from public, anon, authenticated;
revoke all on function public.save_school_event(uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, boolean, date) from public, anon, authenticated;
revoke all on function public.respond_school_event(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.delete_school_event(uuid) from public, anon, authenticated;
revoke all on function public.save_subject_progress(uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.delete_subject_progress(uuid) from public, anon, authenticated;
revoke all on function public.save_school_assignment(uuid, uuid, text, text, text, date, text) from public, anon, authenticated;
revoke all on function public.delete_school_assignment(uuid) from public, anon, authenticated;

grant execute on function public.list_family_features() to authenticated;
grant execute on function public.save_portfolio_item(uuid, uuid, text, text, date) to authenticated;
grant execute on function public.delete_portfolio_item(uuid) to authenticated;
grant execute on function public.save_lost_found_post(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.set_lost_found_status(uuid, text) to authenticated;
grant execute on function public.delete_lost_found_post(uuid) to authenticated;
grant execute on function public.save_school_banner(uuid, uuid, uuid, text, text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.delete_school_banner(uuid) to authenticated;
grant execute on function public.save_school_event(uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, boolean, date) to authenticated;
grant execute on function public.respond_school_event(uuid, uuid, text) to authenticated;
grant execute on function public.delete_school_event(uuid) to authenticated;
grant execute on function public.save_subject_progress(uuid, uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.delete_subject_progress(uuid) to authenticated;
grant execute on function public.save_school_assignment(uuid, uuid, text, text, text, date, text) to authenticated;
grant execute on function public.delete_school_assignment(uuid) to authenticated;

commit;
