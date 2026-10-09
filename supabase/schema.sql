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
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (child_id, date)
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
        'attendance', 'posts', 'consents', 'invitations', 'shelf_items',
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

revoke all on function public.create_organization(text, text, text, text) from public;
revoke all on function public.create_preschool(text, text, text, text, text, text, text) from public;
revoke all on function public.update_child_profile(uuid, text, date, text) from public;
revoke all on function public.create_invitation(text, text, uuid, uuid, text) from public;
revoke all on function public.accept_invitation(text) from public;
grant execute on function public.create_organization(text, text, text, text) to authenticated;
grant execute on function public.create_preschool(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_child_profile(uuid, text, date, text) to authenticated;
grant execute on function public.create_invitation(text, text, uuid, uuid, text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;

grant select, insert, update, delete on public.organizations, public.preschools, public.departments,
  public.profiles, public.children, public.child_health, public.child_guardians,
  public.child_contacts, public.staff_departments, public.attendance, public.posts,
  public.consents, public.invitations to authenticated;
revoke update on public.profiles from authenticated;
grant update (name, phone) on public.profiles to authenticated;
revoke update on public.children from authenticated;

