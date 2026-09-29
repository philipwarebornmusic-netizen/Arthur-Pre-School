-- Arthur Pilot v1 schema
-- Run in Supabase SQL editor or via service role migration.

create extension if not exists "pgcrypto";

create type public.user_role as enum ('parent', 'staff', 'admin');
create type public.owner_type as enum ('kommun', 'privat', 'kooperativ');
create type public.attendance_status as enum ('in', 'absent_sick', 'absent_leave', 'picked_up');
create type public.shelf_status as enum ('ok', 'low', 'missing');
create type public.post_type as enum ('diary', 'image', 'message');
create type public.consent_type as enum ('app_images', 'group_images', 'social_media');
create type public.playdate_status as enum ('pending', 'accepted', 'declined', 'cancelled');
create type public.calendar_event_type as enum ('schedule', 'absence', 'preschool_event', 'shelf_reminder');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.owner_type not null default 'privat',
  created_at timestamptz not null default now()
);

create table public.preschools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  preschool_id uuid not null references public.preschools(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  email text unique not null,
  role public.user_role not null,
  created_at timestamptz not null default now()
);

create table public.children (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  name text not null,
  birth_year int,
  avatar_color text not null default '#F7B733',
  created_at timestamptz not null default now()
);

create table public.child_health (
  child_id uuid primary key references public.children(id) on delete cascade,
  allergies text[] not null default '{}',
  diet text,
  conditions text[] not null default '{}',
  medication text,
  emergency text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);


create table public.child_guardians (
  child_id uuid not null references public.children(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  relation text not null default 'Vårdnadshavare',
  can_pickup boolean not null default true,
  primary key (child_id, profile_id)
);

create table public.child_contacts (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  name text not null,
  relation text not null,
  phone text,
  can_pickup boolean not null default false,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);


create table public.staff_departments (
  staff_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  primary key (staff_id, department_id)
);

create table public.attendance (
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

create table public.shelf_items (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  title text not null,
  status public.shelf_status not null default 'ok',
  note text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  type public.post_type not null default 'diary',
  title text not null,
  body text,
  image_path text,
  created_at timestamptz not null default now()
);

create table public.consents (
  child_id uuid not null references public.children(id) on delete cascade,
  type public.consent_type not null,
  allowed boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (child_id, type)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  preschool_id uuid not null references public.preschools(id) on delete cascade,
  title text not null,
  body text,
  requires_signature boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.document_signatures (
  document_id uuid not null references public.documents(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  signed_at timestamptz not null default now(),
  primary key (document_id, profile_id, child_id)
);

create table public.playdate_opt_ins (
  child_id uuid not null references public.children(id) on delete cascade,
  guardian_id uuid not null references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (child_id, guardian_id)
);

create table public.playdate_requests (
  id uuid primary key default gen_random_uuid(),
  from_child_id uuid not null references public.children(id) on delete cascade,
  to_child_id uuid not null references public.children(id) on delete cascade,
  from_guardian_id uuid not null references public.profiles(id) on delete cascade,
  to_guardian_id uuid references public.profiles(id) on delete set null,
  status public.playdate_status not null default 'pending',
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lost_items (
  id uuid primary key default gen_random_uuid(),
  preschool_id uuid not null references public.preschools(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  title text not null,
  where_found text,
  image_path text,
  claimed_by uuid references public.profiles(id) on delete set null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table public.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  guardian_id uuid not null references public.profiles(id) on delete cascade,
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  child_id uuid references public.children(id) on delete cascade,
  preschool_id uuid references public.preschools(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  type public.calendar_event_type not null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  source text not null default 'arthur',
  external_id text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index idx_profiles_auth_user_id on public.profiles(auth_user_id);
create index idx_children_department_id on public.children(department_id);
create index idx_child_contacts_child_id on public.child_contacts(child_id);
create index idx_attendance_child_date on public.attendance(child_id, date);
create index idx_shelf_items_child_id on public.shelf_items(child_id);
create index idx_posts_child_id on public.posts(child_id);
create index idx_posts_department_id on public.posts(department_id);
create index idx_lost_items_department_id on public.lost_items(department_id);
create index idx_calendar_events_child_time on public.calendar_events(child_id, starts_at);


-- Helper functions for RLS.
create or replace function public.current_profile_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.profiles where auth_user_id = auth.uid()
$$;

create or replace function public.current_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where auth_user_id = auth.uid()
$$;

create or replace function public.is_guardian(child uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.child_guardians cg
    where cg.child_id = child and cg.profile_id = public.current_profile_id()
  )
$$;

create or replace function public.is_staff_for_department(dept uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_departments sd
    where sd.department_id = dept and sd.staff_id = public.current_profile_id()
  )
$$;

create or replace function public.is_staff_for_child(child uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.children c
    join public.staff_departments sd on sd.department_id = c.department_id
    where c.id = child and sd.staff_id = public.current_profile_id()
  )
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role() = 'admin'
$$;

-- Enable RLS.
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
alter table public.shelf_items enable row level security;
alter table public.posts enable row level security;
alter table public.consents enable row level security;
alter table public.documents enable row level security;
alter table public.document_signatures enable row level security;
alter table public.playdate_opt_ins enable row level security;
alter table public.playdate_requests enable row level security;
alter table public.lost_items enable row level security;
alter table public.calendar_feeds enable row level security;
alter table public.calendar_events enable row level security;

-- Broad pilot policies, intentionally role-aware but simple.
create policy "profiles self or admin" on public.profiles for select using (auth_user_id = auth.uid() or public.is_admin());
create policy "profiles admin write" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

create policy "org visible to signed in" on public.organizations for select using (auth.uid() is not null);
create policy "preschools visible to signed in" on public.preschools for select using (auth.uid() is not null);
create policy "departments visible to signed in" on public.departments for select using (auth.uid() is not null);

create policy "children guardian staff admin read" on public.children for select using (public.is_admin() or public.is_guardian(id) or public.is_staff_for_child(id));
create policy "children admin write" on public.children for all using (public.is_admin()) with check (public.is_admin());

create policy "child health read" on public.child_health for select using (public.is_admin() or public.is_guardian(child_id) or public.is_staff_for_child(child_id));
create policy "child health guardian staff write" on public.child_health for all using (public.is_admin() or public.is_guardian(child_id) or public.is_staff_for_child(child_id)) with check (public.is_admin() or public.is_guardian(child_id) or public.is_staff_for_child(child_id));

create policy "guardian links readable" on public.child_guardians for select using (public.is_admin() or profile_id = public.current_profile_id() or public.is_staff_for_child(child_id));
create policy "staff departments readable" on public.staff_departments for select using (public.is_admin() or staff_id = public.current_profile_id());

create policy "child contacts read" on public.child_contacts for select using (public.is_admin() or public.is_guardian(child_id) or public.is_staff_for_child(child_id));
create policy "child contacts guardian write" on public.child_contacts for all using (public.is_admin() or public.is_guardian(child_id)) with check (public.is_admin() or public.is_guardian(child_id));

create policy "attendance read" on public.attendance for select using (public.is_admin() or public.is_guardian(child_id) or public.is_staff_for_child(child_id));
create policy "attendance parent staff update" on public.attendance for all using (public.is_admin() or public.is_guardian(child_id) or public.is_staff_for_child(child_id)) with check (public.is_admin() or public.is_guardian(child_id) or public.is_staff_for_child(child_id));

create policy "shelf read" on public.shelf_items for select using (public.is_admin() or public.is_guardian(child_id) or public.is_staff_for_child(child_id));
create policy "shelf staff write" on public.shelf_items for all using (public.is_admin() or public.is_staff_for_child(child_id)) with check (public.is_admin() or public.is_staff_for_child(child_id));

create policy "posts read guardian staff" on public.posts for select using (
  public.is_admin()
  or (child_id is not null and public.is_guardian(child_id))
  or (department_id is not null and public.is_staff_for_department(department_id))
);
create policy "posts staff write" on public.posts for all using (public.is_admin() or (department_id is not null and public.is_staff_for_department(department_id))) with check (public.is_admin() or (department_id is not null and public.is_staff_for_department(department_id)));

create policy "consents read" on public.consents for select using (public.is_admin() or public.is_guardian(child_id) or public.is_staff_for_child(child_id));
create policy "consents guardian update" on public.consents for all using (public.is_admin() or public.is_guardian(child_id)) with check (public.is_admin() or public.is_guardian(child_id));

create policy "documents signed in read" on public.documents for select using (auth.uid() is not null);
create policy "signatures own or admin" on public.document_signatures for select using (public.is_admin() or profile_id = public.current_profile_id());
create policy "signatures guardian insert" on public.document_signatures for insert with check (profile_id = public.current_profile_id() and (child_id is null or public.is_guardian(child_id)));

create policy "playdate opt read" on public.playdate_opt_ins for select using (public.is_admin() or guardian_id = public.current_profile_id() or public.is_guardian(child_id));
create policy "playdate opt own write" on public.playdate_opt_ins for all using (guardian_id = public.current_profile_id()) with check (guardian_id = public.current_profile_id() and public.is_guardian(child_id));
create policy "playdate request visible" on public.playdate_requests for select using (public.is_admin() or from_guardian_id = public.current_profile_id() or to_guardian_id = public.current_profile_id() or public.is_guardian(from_child_id) or public.is_guardian(to_child_id));
create policy "playdate request parent write" on public.playdate_requests for all using (public.is_admin() or from_guardian_id = public.current_profile_id() or to_guardian_id = public.current_profile_id()) with check (public.is_admin() or from_guardian_id = public.current_profile_id() or to_guardian_id = public.current_profile_id());

create policy "lost items signed in read" on public.lost_items for select using (auth.uid() is not null);
create policy "lost items staff write" on public.lost_items for all using (public.is_admin() or (department_id is not null and public.is_staff_for_department(department_id))) with check (public.is_admin() or (department_id is not null and public.is_staff_for_department(department_id)));

create policy "calendar feeds owner" on public.calendar_feeds for select using (public.is_admin() or guardian_id = public.current_profile_id());
create policy "calendar feeds owner write" on public.calendar_feeds for all using (guardian_id = public.current_profile_id() or public.is_admin()) with check (guardian_id = public.current_profile_id() or public.is_admin());
create policy "calendar events read" on public.calendar_events for select using (public.is_admin() or (child_id is not null and (public.is_guardian(child_id) or public.is_staff_for_child(child_id))));
create policy "calendar events staff admin write" on public.calendar_events for all using (public.is_admin() or (child_id is not null and public.is_staff_for_child(child_id))) with check (public.is_admin() or (child_id is not null and public.is_staff_for_child(child_id)));
