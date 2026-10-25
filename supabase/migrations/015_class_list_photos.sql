-- Consent-based class list and private child profile photos.
--
-- Apply this file once, manually, in the Supabase SQL editor after review.
-- Do not run it against production until the class list and profile photos
-- should be activated. Deploy previews use the production database, so this
-- version shows a "not activated" notice until the file has been applied.
--
-- The file does not delete children, guardians, or the existing consents rows
-- (app_images, group_images, social_media). Those stay separate from this opt-in.
-- It does not grant staff or admin any write on child profile, health,
-- contacts, consents, or the new class-list answers.
--
-- The private Storage bucket child-photos is created here (public = false,
-- 2 MB, image/jpeg only). No separate dashboard step is required when this
-- insert succeeds. If the storage schema rejects the insert, create that
-- private bucket with the same limits and run this file again; the bucket
-- statement is idempotent.
--
-- Photo objects live at the stable path <child_id>/profile.jpg. Replacing a
-- photo upserts that same object, so no second file is left behind.
-- These functions never DELETE from storage.objects. Supabase installs
-- protect_objects_delete, a statement-level trigger that rejects every SQL
-- DELETE on that table, including a delete that matches zero rows. The client
-- removes the file through the Storage API, then clear_child_photo only
-- clears photo_path after a SELECT shows the object is gone.
--
-- Name visibility to other guardians: at least one linked guardian has
-- show_name = true and no linked guardian has show_name = false.
-- A missing row, or a null answer, is not a no.
-- Photo visibility to other guardians: every linked guardian has
-- show_photo = true. A missing row, a null, or a false hides the photo.
-- Staff of the child's department and an organization admin can always read
-- the child's name and the photo object when one exists. A child's own
-- guardians can always read that child's photo object.

begin;

alter table public.children add column if not exists photo_path text;
alter table public.children add column if not exists photo_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'children_photo_path_format'
      and conrelid = 'public.children'::regclass
  ) then
    alter table public.children
      add constraint children_photo_path_format
      check (photo_path is null or photo_path = id::text || '/profile.jpg');
  end if;
end $$;

create table if not exists public.class_list_consents (
  child_id uuid not null references public.children(id) on delete cascade,
  guardian_profile_id uuid not null references public.profiles(id) on delete cascade,
  show_name boolean,
  show_photo boolean,
  updated_at timestamptz not null default now(),
  primary key (child_id, guardian_profile_id)
);

create table if not exists public.class_list_consent_events (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  guardian_profile_id uuid not null references public.profiles(id) on delete cascade,
  show_name boolean,
  show_photo boolean,
  created_at timestamptz not null default now()
);

create index if not exists idx_class_list_consents_child on public.class_list_consents(child_id);
create index if not exists idx_class_list_consent_events_child on public.class_list_consent_events(child_id, created_at);

alter table public.class_list_consents enable row level security;
alter table public.class_list_consent_events enable row level security;
revoke all on public.class_list_consents, public.class_list_consent_events from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('child-photos', 'child-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.child_id_from_photo_path(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parsed uuid;
begin
  if object_name is null
    or object_name !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/profile[.]jpg$'
  then
    return null;
  end if;
  begin
    parsed := split_part(object_name, '/', 1)::uuid;
  exception when others then
    return null;
  end;
  if lower(object_name) <> parsed::text || '/profile.jpg' then
    return null;
  end if;
  return parsed;
end;
$$;

create or replace function public.class_list_name_allowed(target_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_list_consents consent
    join public.child_guardians link
      on link.child_id = consent.child_id
     and link.profile_id = consent.guardian_profile_id
    where consent.child_id = target_child_id
      and consent.show_name is true
  )
  and not exists (
    select 1
    from public.class_list_consents consent
    join public.child_guardians link
      on link.child_id = consent.child_id
     and link.profile_id = consent.guardian_profile_id
    where consent.child_id = target_child_id
      and consent.show_name is false
  )
$$;

create or replace function public.class_list_photo_allowed(target_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.child_guardians link where link.child_id = target_child_id
  )
  and not exists (
    select 1
    from public.child_guardians link
    where link.child_id = target_child_id
      and not exists (
        select 1
        from public.class_list_consents consent
        where consent.child_id = link.child_id
          and consent.guardian_profile_id = link.profile_id
          and consent.show_photo is true
      )
  )
$$;

create or replace function public.guardian_shares_child_department(target_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.children theirs
    join public.children mine on mine.department_id = theirs.department_id
    join public.child_guardians link
      on link.child_id = mine.id
     and link.profile_id = public.current_profile_id()
    where theirs.id = target_child_id
  )
$$;

create or replace function public.can_write_child_photo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_guardian(public.child_id_from_photo_path(object_name))
$$;

create or replace function public.can_read_child_photo(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_child_id uuid := public.child_id_from_photo_path(object_name);
begin
  if target_child_id is null or public.current_profile_id() is null then
    return false;
  end if;
  if public.is_guardian(target_child_id)
    or public.is_staff_for_child(target_child_id)
    or public.is_admin_for_child(target_child_id)
  then
    return true;
  end if;
  return public.guardian_shares_child_department(target_child_id)
    and public.class_list_name_allowed(target_child_id)
    and public.class_list_photo_allowed(target_child_id);
end;
$$;

create or replace function public.set_class_list_consent(
  target_child_id uuid,
  show_name boolean,
  show_photo boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  guardian_id uuid := public.current_profile_id();
  previous_name boolean;
  previous_photo boolean;
  next_name boolean;
  next_photo boolean;
  had_row boolean := false;
begin
  if auth.uid() is null or guardian_id is null or not public.is_guardian(target_child_id) then
    raise exception 'Bara barnets vårdnadshavare kan svara på klasslistan';
  end if;
  select consent.show_name, consent.show_photo
    into previous_name, previous_photo
  from public.class_list_consents consent
  where consent.child_id = target_child_id
    and consent.guardian_profile_id = guardian_id;
  had_row := found;
  if had_row then
    next_name := coalesce(show_name, previous_name);
    next_photo := coalesce(show_photo, previous_photo);
    if next_name is not distinct from previous_name
      and next_photo is not distinct from previous_photo
    then
      return;
    end if;
    update public.class_list_consents consent
    set show_name = next_name,
        show_photo = next_photo,
        updated_at = now()
    where consent.child_id = target_child_id
      and consent.guardian_profile_id = guardian_id;
  else
    if show_name is null and show_photo is null then
      raise exception 'Välj ja eller nej';
    end if;
    next_name := show_name;
    next_photo := show_photo;
    insert into public.class_list_consents (child_id, guardian_profile_id, show_name, show_photo, updated_at)
    values (target_child_id, guardian_id, next_name, next_photo, now());
  end if;
  insert into public.class_list_consent_events (child_id, guardian_profile_id, show_name, show_photo)
  values (target_child_id, guardian_id, next_name, next_photo);
end;
$$;

create or replace function public.my_class_list_consents()
returns table (
  child_id uuid,
  child_name text,
  guardian_profile_id uuid,
  guardian_name text,
  is_self boolean,
  show_name boolean,
  show_photo boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    link.child_id,
    child.name,
    guardian.id,
    guardian.name,
    guardian.id = public.current_profile_id(),
    consent.show_name,
    consent.show_photo,
    consent.updated_at
  from public.child_guardians mine
  join public.children child on child.id = mine.child_id
  join public.child_guardians link on link.child_id = mine.child_id
  join public.profiles guardian on guardian.id = link.profile_id
  left join public.class_list_consents consent
    on consent.child_id = link.child_id
   and consent.guardian_profile_id = link.profile_id
  where mine.profile_id = public.current_profile_id()
  order by child.name, guardian.name
$$;

create or replace function public.list_class_list()
returns table (
  child_id uuid,
  display_name text,
  photo_path text,
  department_id uuid,
  department_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_profile_id() is null then
    raise exception 'Du måste vara inloggad';
  end if;
  if public.current_role() is distinct from 'parent' then
    raise exception 'Klasslistan visas för vårdnadshavare';
  end if;
  return query
  select
    listed.child_id,
    listed.display_name,
    listed.photo_path,
    listed.department_id,
    listed.department_name
  from (
    select
      child.id as child_id,
      case
        when count(*) over (partition by split_part(btrim(child.name), ' ', 1)) > 1 then btrim(child.name)
        else split_part(btrim(child.name), ' ', 1)
      end as display_name,
      case
        when public.is_guardian(child.id) or public.class_list_photo_allowed(child.id) then child.photo_path
        else null
      end as photo_path,
      child.department_id,
      department.name as department_name,
      split_part(btrim(child.name), ' ', 1) as first_name
    from public.children child
    join public.departments department on department.id = child.department_id
    where public.class_list_name_allowed(child.id)
      and child.department_id in (
        select mine.department_id
        from public.children mine
        join public.child_guardians link
          on link.child_id = mine.id
         and link.profile_id = public.current_profile_id()
      )
  ) listed
  order by listed.department_name, listed.display_name, listed.first_name;
end;
$$;

create or replace function public.set_child_photo(
  target_child_id uuid,
  object_path text
)
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  expected_path text := target_child_id::text || '/profile.jpg';
  object_size bigint;
  object_mime text;
begin
  if auth.uid() is null or not public.is_guardian(target_child_id) then
    raise exception 'Bara barnets vårdnadshavare kan ladda upp profilbilden';
  end if;
  if object_path is distinct from expected_path then
    raise exception 'Bildens sökväg är ogiltig';
  end if;
  select
    nullif(object.metadata ->> 'size', '')::bigint,
    coalesce(object.metadata ->> 'mimetype', object.metadata ->> 'mimeType', '')
  into object_size, object_mime
  from storage.objects object
  where object.bucket_id = 'child-photos'
    and object.name = expected_path;
  if not found then
    raise exception 'Bilden saknas';
  end if;
  if object_size is null or object_size < 1 or object_size > 2097152 then
    raise exception 'Bilden måste vara en JPEG på högst 2 MB';
  end if;
  if object_mime <> 'image/jpeg' then
    raise exception 'Bilden måste vara en JPEG';
  end if;
  update public.children
  set photo_path = expected_path,
      photo_updated_at = now()
  where id = target_child_id;
  if not found then
    raise exception 'Barnet hittades inte';
  end if;
end;
$$;

create or replace function public.clear_child_photo(target_child_id uuid)
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if auth.uid() is null or not public.is_guardian(target_child_id) then
    raise exception 'Bara barnets vårdnadshavare kan ta bort profilbilden';
  end if;
  if exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'child-photos'
      and object.name = target_child_id::text || '/profile.jpg'
  ) then
    raise exception 'Bilden finns kvar i lagringen. Ta bort den och försök igen';
  end if;
  update public.children
  set photo_path = null,
      photo_updated_at = now()
  where id = target_child_id;
  if not found then
    raise exception 'Barnet hittades inte';
  end if;
end;
$$;

drop policy if exists "child photo guardian insert" on storage.objects;
drop policy if exists "child photo guardian update" on storage.objects;
drop policy if exists "child photo guardian delete" on storage.objects;
drop policy if exists "child photo authorized read" on storage.objects;

create policy "child photo guardian insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'child-photos'
  and public.can_write_child_photo(name)
);

create policy "child photo guardian update" on storage.objects
for update to authenticated
using (
  bucket_id = 'child-photos'
  and public.can_write_child_photo(name)
)
with check (
  bucket_id = 'child-photos'
  and public.can_write_child_photo(name)
);

create policy "child photo guardian delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'child-photos'
  and public.can_write_child_photo(name)
);

create policy "child photo authorized read" on storage.objects
for select to authenticated
using (
  bucket_id = 'child-photos'
  and public.can_read_child_photo(name)
);

revoke all on function public.child_id_from_photo_path(text) from public, anon, authenticated;
revoke all on function public.class_list_name_allowed(uuid) from public, anon, authenticated;
revoke all on function public.class_list_photo_allowed(uuid) from public, anon, authenticated;
revoke all on function public.guardian_shares_child_department(uuid) from public, anon, authenticated;
revoke all on function public.can_write_child_photo(text) from public, anon, authenticated;
revoke all on function public.can_read_child_photo(text) from public, anon, authenticated;
revoke all on function public.set_class_list_consent(uuid, boolean, boolean) from public, anon, authenticated;
revoke all on function public.my_class_list_consents() from public, anon, authenticated;
revoke all on function public.list_class_list() from public, anon, authenticated;
revoke all on function public.set_child_photo(uuid, text) from public, anon, authenticated;
revoke all on function public.clear_child_photo(uuid) from public, anon, authenticated;

grant execute on function public.can_write_child_photo(text) to authenticated;
grant execute on function public.can_read_child_photo(text) to authenticated;
grant execute on function public.set_class_list_consent(uuid, boolean, boolean) to authenticated;
grant execute on function public.my_class_list_consents() to authenticated;
grant execute on function public.list_class_list() to authenticated;
grant execute on function public.set_child_photo(uuid, text) to authenticated;
grant execute on function public.clear_child_photo(uuid) to authenticated;

commit;
