-- Portfolio, lost and found, priority banners, school events, and school progress.
-- Applied to production on 2026-11-09.
-- This migration is additive. It does not rewrite existing child, attendance,
-- consent, message, meal, or term rows. Direct table writes stay revoked.

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
