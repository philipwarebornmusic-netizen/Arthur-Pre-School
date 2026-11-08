-- Matsedel. NOT APPLIED to production.
-- Review and run this file manually in the Supabase SQL editor only after approval.
-- It creates tables, private helpers, and two private Storage buckets.
-- It does not read or change existing rows, consents, or child health.
-- It does not delete storage.objects. The browser removes a file first;
-- clear functions continue only after a select shows the object is gone.
-- Deploy previews use the production database, so the app shows
-- "inte aktiverad" until this file has been applied by hand.
--
-- Access:
--   parent  read-only, and only for a preschool where they have a linked child
--   staff   read and write for a preschool where they are assigned to a department
--   admin   read and write for preschools in their own organization
-- Another organization is denied. Security-definer bodies live in private,
-- which is not a Data API schema. Public wrappers are security invoker.

begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create or replace function private.meal_preschool_visible(target_preschool_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.preschools preschool
    where preschool.id = target_preschool_id
      and preschool.organization_id = public.current_organization_id()
      and (
        public.current_role() = 'admin'::public.user_role
        or exists (
          select 1
          from public.departments department
          join public.staff_departments assignment on assignment.department_id = department.id
          where department.preschool_id = preschool.id
            and assignment.staff_id = public.current_profile_id()
        )
        or exists (
          select 1
          from public.departments department
          join public.children child on child.department_id = department.id
          join public.child_guardians guardian on guardian.child_id = child.id
          where department.preschool_id = preschool.id
            and guardian.profile_id = public.current_profile_id()
        )
      )
  );
$$;

create or replace function private.meal_preschool_editable(target_preschool_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.preschools preschool
    where preschool.id = target_preschool_id
      and preschool.organization_id = public.current_organization_id()
      and (
        public.current_role() = 'admin'::public.user_role
        or (
          public.current_role() = 'staff'::public.user_role
          and exists (
            select 1
            from public.departments department
            join public.staff_departments assignment on assignment.department_id = department.id
            where department.preschool_id = preschool.id
              and assignment.staff_id = public.current_profile_id()
          )
        )
      )
  );
$$;

create or replace function private.meal_same_organization()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.preschools preschool
    where preschool.id = new.preschool_id
      and preschool.organization_id = new.organization_id
  ) then
    raise exception 'Förskolan tillhör inte organisationen';
  end if;
  return new;
end;
$$;

create or replace function private.meal_display_name(raw_name text, mime_type text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  cleaned text;
  suffix text;
begin
  suffix := case when mime_type = 'application/pdf' then '.pdf' else '.jpg' end;
  cleaned := regexp_replace(coalesce(raw_name, ''), '[[:cntrl:]\\/<>:"|?*]+', '', 'g');
  cleaned := btrim(cleaned);
  if cleaned = '' or cleaned ~ '^[.]+$' then
    cleaned := 'matsedel' || suffix;
  end if;
  if right(lower(cleaned), char_length(suffix)) <> suffix and right(lower(cleaned), 5) <> '.jpeg' then
    cleaned := cleaned || suffix;
  end if;
  if char_length(cleaned) > 80 then
    cleaned := left(cleaned, 80);
  end if;
  return cleaned;
end;
$$;

create table if not exists public.meal_menus (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  preschool_id uuid not null references public.preschools(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  storage_path text not null unique,
  mime_type text not null,
  byte_size integer not null,
  display_name text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint meal_menus_mime check (mime_type in ('application/pdf', 'image/jpeg')),
  constraint meal_menus_size check (byte_size between 1 and 8388608),
  constraint meal_menus_range check (starts_on <= ends_on and ends_on - starts_on <= 41),
  constraint meal_menus_display_name check (
    char_length(display_name) between 1 and 80
    and display_name !~ '[[:cntrl:]\\/]'
  ),
  constraint meal_menus_path_shape check (
    split_part(storage_path, '/', 1) = organization_id::text
    and split_part(storage_path, '/', 2) = preschool_id::text
    and split_part(storage_path, '/', 3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|jpg)$'
    and split_part(storage_path, '/', 4) = ''
    and (
      (mime_type = 'application/pdf' and right(storage_path, 4) = '.pdf')
      or (mime_type = 'image/jpeg' and right(storage_path, 4) = '.jpg')
    )
  ),
  constraint meal_menus_no_overlap exclude using gist (
    preschool_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  )
);

create table if not exists public.meal_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  preschool_id uuid not null references public.preschools(id) on delete cascade,
  served_on date not null,
  body text,
  photo_path text,
  photo_byte_size integer,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (preschool_id, served_on),
  constraint meal_days_weekday check (extract(isodow from served_on) between 1 and 5),
  constraint meal_days_body check (body is null or char_length(btrim(body)) between 1 and 400),
  constraint meal_days_has_content check (body is not null or photo_path is not null),
  constraint meal_days_photo check (
    (photo_path is null and photo_byte_size is null)
    or (
      photo_path ~ (
        '^' || organization_id::text || '/' || preschool_id::text || '/' || to_char(served_on, 'YYYY-MM-DD')
        || '--[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$'
      )
      and photo_byte_size between 1 and 2097152
    )
  )
);

create index if not exists meal_menus_preschool_range_idx on public.meal_menus (preschool_id, starts_on, ends_on);
create index if not exists meal_days_preschool_date_idx on public.meal_days (preschool_id, served_on);

drop trigger if exists meal_menus_same_organization on public.meal_menus;
create trigger meal_menus_same_organization
before insert or update on public.meal_menus
for each row execute function private.meal_same_organization();

drop trigger if exists meal_days_same_organization on public.meal_days;
create trigger meal_days_same_organization
before insert or update on public.meal_days
for each row execute function private.meal_same_organization();

alter table public.meal_menus enable row level security;
alter table public.meal_days enable row level security;

drop policy if exists "meal menus select" on public.meal_menus;
create policy "meal menus select" on public.meal_menus
for select to authenticated
using (private.meal_preschool_visible(preschool_id));

drop policy if exists "meal days select" on public.meal_days;
create policy "meal days select" on public.meal_days
for select to authenticated
using (private.meal_preschool_visible(preschool_id));

revoke all on public.meal_menus, public.meal_days from public, anon, authenticated, service_role;
grant select on public.meal_menus, public.meal_days to authenticated;

create or replace function private.meal_object_allowed(bucket text, object_name text, for_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  org_part text;
  school_part text;
  file_part text;
  school_id uuid;
  served date;
begin
  if auth.uid() is null or object_name is null or object_name !~ '^[^/]+/[^/]+/[^/]+$' then
    return false;
  end if;
  if split_part(object_name, '/', 1) is distinct from public.current_organization_id()::text then
    return false;
  end if;
  org_part := split_part(object_name, '/', 1);
  school_part := split_part(object_name, '/', 2);
  file_part := split_part(object_name, '/', 3);
  begin
    school_id := school_part::uuid;
    perform org_part::uuid;
  exception when others then
    return false;
  end;
  if bucket = 'meal-menus' then
    if file_part !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|jpg)$' then
      return false;
    end if;
  elsif bucket = 'meal-photos' then
    if file_part !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}--[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$' then
      return false;
    end if;
    begin
      served := left(file_part, 10)::date;
    exception when others then
      return false;
    end;
    if to_char(served, 'YYYY-MM-DD') is distinct from left(file_part, 10)
      or extract(isodow from served) not between 1 and 5 then
      return false;
    end if;
  else
    return false;
  end if;
  if for_write then
    return private.meal_preschool_editable(school_id);
  end if;
  if private.meal_preschool_editable(school_id) then
    return true;
  end if;
  if not private.meal_preschool_visible(school_id) then
    return false;
  end if;
  if bucket = 'meal-menus' then
    return exists (
      select 1 from public.meal_menus menu
      where menu.storage_path = object_name
        and menu.preschool_id = school_id
        and menu.organization_id = public.current_organization_id()
    );
  end if;
  return exists (
    select 1 from public.meal_days day
    where day.photo_path = object_name
      and day.preschool_id = school_id
      and day.organization_id = public.current_organization_id()
  );
end;
$$;

create or replace function private.meal_object_metadata(bucket text, object_path text)
returns table (mime_type text, byte_size bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  found_mime text;
  found_size bigint;
begin
  select
    coalesce(object.metadata ->> 'mimetype', object.metadata ->> 'mimeType', ''),
    nullif(object.metadata ->> 'size', '')::bigint
  into found_mime, found_size
  from storage.objects object
  where object.bucket_id = bucket
    and object.name = object_path;
  if not found then
    raise exception 'Filen saknas';
  end if;
  mime_type := found_mime;
  byte_size := found_size;
  return next;
end;
$$;

create or replace function private.list_preschool_meals(
  target_preschool_id uuid,
  range_start date,
  range_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Du måste vara inloggad';
  end if;
  if range_start is null or range_end is null or range_end < range_start or range_end - range_start > 120 then
    raise exception 'Ogiltigt datumintervall';
  end if;
  if not private.meal_preschool_visible(target_preschool_id) then
    raise exception 'Du saknar behörighet till den här matsedeln';
  end if;
  return jsonb_build_object(
    'menus', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', menu.id,
        'starts_on', menu.starts_on,
        'ends_on', menu.ends_on,
        'display_name', menu.display_name,
        'mime_type', menu.mime_type,
        'byte_size', menu.byte_size,
        'storage_path', menu.storage_path
      ) order by menu.starts_on)
      from public.meal_menus menu
      where menu.preschool_id = target_preschool_id
        and daterange(menu.starts_on, menu.ends_on, '[]') && daterange(range_start, range_end, '[]')
    ), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'served_on', day.served_on,
        'body', day.body,
        'photo_path', day.photo_path,
        'photo_byte_size', day.photo_byte_size
      ) order by day.served_on)
      from public.meal_days day
      where day.preschool_id = target_preschool_id
        and day.served_on between range_start and range_end
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function private.save_meal_days(target_preschool_id uuid, meal_days jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  served date;
  body_text text;
  seen date[] := '{}';
  existing public.meal_days;
begin
  if auth.uid() is null then
    raise exception 'Du måste vara inloggad';
  end if;
  if not private.meal_preschool_editable(target_preschool_id) then
    raise exception 'Du saknar behörighet till den här matsedeln';
  end if;
  if jsonb_typeof(meal_days) is distinct from 'array'
    or jsonb_array_length(meal_days) < 1
    or jsonb_array_length(meal_days) > 5 then
    raise exception 'Skicka en till fem dagar';
  end if;
  for item in select value from jsonb_array_elements(meal_days) loop
    if jsonb_typeof(item) is distinct from 'object' then
      raise exception 'Ogiltig dag';
    end if;
    begin
      served := (item ->> 'served_on')::date;
    exception when others then
      raise exception 'Ogiltigt datum';
    end;
    if served is null or extract(isodow from served) not between 1 and 5 then
      raise exception 'Matsedeln gäller vardagar';
    end if;
    if served < current_date - 14 or served > current_date + 120 then
      raise exception 'Datumet ligger utanför perioden som kan redigeras';
    end if;
    if served = any (seen) then
      raise exception 'Samma dag är med flera gånger';
    end if;
    seen := seen || served;
    body_text := nullif(btrim(coalesce(item ->> 'body', '')), '');
    if body_text is not null and char_length(body_text) > 400 then
      raise exception 'Texten får vara högst 400 tecken';
    end if;
    select * into existing
    from public.meal_days day
    where day.preschool_id = target_preschool_id
      and day.served_on = served;
    if body_text is null and (existing.id is null or existing.photo_path is null) then
      delete from public.meal_days day
      where day.preschool_id = target_preschool_id
        and day.served_on = served;
    elsif existing.id is null then
      insert into public.meal_days (organization_id, preschool_id, served_on, body, updated_by)
      values (public.current_organization_id(), target_preschool_id, served, body_text, public.current_profile_id());
    else
      update public.meal_days day
      set body = body_text,
          updated_by = public.current_profile_id(),
          updated_at = now()
      where day.id = existing.id;
    end if;
  end loop;
end;
$$;

create or replace function private.attach_meal_menu(
  target_menu_id uuid,
  target_preschool_id uuid,
  range_start date,
  range_end date,
  object_path text,
  raw_display_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_mime text;
  found_size bigint;
  expected_suffix text;
  safe_name text;
  existing_preschool uuid;
begin
  if auth.uid() is null then
    raise exception 'Du måste vara inloggad';
  end if;
  if target_menu_id is null or not private.meal_preschool_editable(target_preschool_id) then
    raise exception 'Du saknar behörighet till den här matsedeln';
  end if;
  if range_start is null or range_end is null or range_end < range_start or range_end - range_start > 41 then
    raise exception 'Matsedelsfilen behöver ett intervall på högst 42 dagar';
  end if;
  if range_start < current_date - 14 or range_end > current_date + 120 then
    raise exception 'Datumet ligger utanför perioden som kan redigeras';
  end if;
  if not private.meal_object_allowed('meal-menus', object_path, true)
    or split_part(object_path, '/', 1) is distinct from public.current_organization_id()::text
    or split_part(object_path, '/', 2) is distinct from target_preschool_id::text then
    raise exception 'Filens sökväg är ogiltig';
  end if;
  select meta.mime_type, meta.byte_size into found_mime, found_size
  from private.meal_object_metadata('meal-menus', object_path) meta;
  expected_suffix := case when right(object_path, 4) = '.pdf' then 'application/pdf' else 'image/jpeg' end;
  if found_mime is distinct from expected_suffix or found_size is null or found_size < 1 or found_size > 8388608 then
    raise exception 'Filen måste vara en PDF eller JPEG på högst 8 MB';
  end if;
  -- Metadata is the Storage object's declared type and size. PDF bytes are not
  -- parsed into dishes. The browser also rejects a PDF that does not start with %PDF-.
  safe_name := private.meal_display_name(raw_display_name, found_mime);
  select menu.preschool_id into existing_preschool
  from public.meal_menus menu
  where menu.id = target_menu_id;
  if existing_preschool is not null and existing_preschool is distinct from target_preschool_id then
    raise exception 'Filen kan inte flyttas till en annan förskola';
  end if;
  if exists (
    select 1 from public.meal_menus menu
    where menu.preschool_id = target_preschool_id
      and menu.id is distinct from target_menu_id
      and daterange(menu.starts_on, menu.ends_on, '[]') && daterange(range_start, range_end, '[]')
  ) then
    raise exception 'Det finns redan en matsedel för de datumen';
  end if;
  insert into public.meal_menus (
    id, organization_id, preschool_id, starts_on, ends_on, storage_path, mime_type, byte_size, display_name, updated_by
  ) values (
    target_menu_id,
    public.current_organization_id(),
    target_preschool_id,
    range_start,
    range_end,
    object_path,
    found_mime,
    found_size::integer,
    safe_name,
    public.current_profile_id()
  )
  on conflict (id) do update
  set starts_on = excluded.starts_on,
      ends_on = excluded.ends_on,
      storage_path = excluded.storage_path,
      mime_type = excluded.mime_type,
      byte_size = excluded.byte_size,
      display_name = excluded.display_name,
      updated_by = excluded.updated_by,
      updated_at = now();
end;
$$;

create or replace function private.clear_meal_menu(target_menu_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.meal_menus;
begin
  if auth.uid() is null then
    raise exception 'Du måste vara inloggad';
  end if;
  select * into existing from public.meal_menus menu where menu.id = target_menu_id;
  if existing.id is null or not private.meal_preschool_editable(existing.preschool_id) then
    raise exception 'Du saknar behörighet till den här matsedeln';
  end if;
  if exists (
    select 1 from storage.objects object
    where object.bucket_id = 'meal-menus'
      and object.name = existing.storage_path
  ) then
    raise exception 'Ta bort filen först';
  end if;
  delete from public.meal_menus menu where menu.id = existing.id;
end;
$$;

create or replace function private.attach_meal_photo(
  target_preschool_id uuid,
  served date,
  object_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_mime text;
  found_size bigint;
  expected text;
begin
  if auth.uid() is null then
    raise exception 'Du måste vara inloggad';
  end if;
  if not private.meal_preschool_editable(target_preschool_id) then
    raise exception 'Du saknar behörighet till den här matsedeln';
  end if;
  if served is null or extract(isodow from served) not between 1 and 5
    or served < current_date - 14 or served > current_date + 120 then
    raise exception 'Bilden gäller en vardag inom perioden som kan redigeras';
  end if;
  if object_path !~ (
      '^' || public.current_organization_id()::text || '/' || target_preschool_id::text || '/'
      || to_char(served, 'YYYY-MM-DD') || '--[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$'
    )
    or not private.meal_object_allowed('meal-photos', object_path, true) then
    raise exception 'Bildens sökväg är ogiltig';
  end if;
  select meta.mime_type, meta.byte_size into found_mime, found_size
  from private.meal_object_metadata('meal-photos', object_path) meta;
  if found_mime is distinct from 'image/jpeg' or found_size is null or found_size < 1 or found_size > 2097152 then
    raise exception 'Bilden måste vara en JPEG på högst 2 MB';
  end if;
  insert into public.meal_days (organization_id, preschool_id, served_on, photo_path, photo_byte_size, updated_by)
  values (public.current_organization_id(), target_preschool_id, served, object_path, found_size::integer, public.current_profile_id())
  on conflict (preschool_id, served_on) do update
  set photo_path = excluded.photo_path,
      photo_byte_size = excluded.photo_byte_size,
      updated_by = excluded.updated_by,
      updated_at = now();
end;
$$;

create or replace function private.clear_meal_photo(target_preschool_id uuid, served date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.meal_days;
begin
  if auth.uid() is null then
    raise exception 'Du måste vara inloggad';
  end if;
  if not private.meal_preschool_editable(target_preschool_id) then
    raise exception 'Du saknar behörighet till den här matsedeln';
  end if;
  select * into existing
  from public.meal_days day
  where day.preschool_id = target_preschool_id
    and day.served_on = served;
  if existing.id is null then
    return;
  end if;
  if existing.photo_path is not null and exists (
    select 1 from storage.objects object
    where object.bucket_id = 'meal-photos'
      and object.name = existing.photo_path
  ) then
    raise exception 'Ta bort bilden först';
  end if;
  if existing.body is null then
    delete from public.meal_days day where day.id = existing.id;
  else
    update public.meal_days day
    set photo_path = null,
        photo_byte_size = null,
        updated_by = public.current_profile_id(),
        updated_at = now()
    where day.id = existing.id;
  end if;
end;
$$;

create or replace function public.list_preschool_meals(target_preschool_id uuid, range_start date, range_end date)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.list_preschool_meals(target_preschool_id, range_start, range_end);
$$;

create or replace function public.save_meal_days(target_preschool_id uuid, meal_days jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.save_meal_days(target_preschool_id, meal_days);
end;
$$;

create or replace function public.attach_meal_menu(
  target_menu_id uuid,
  target_preschool_id uuid,
  range_start date,
  range_end date,
  object_path text,
  raw_display_name text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.attach_meal_menu(target_menu_id, target_preschool_id, range_start, range_end, object_path, raw_display_name);
end;
$$;

create or replace function public.clear_meal_menu(target_menu_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.clear_meal_menu(target_menu_id);
end;
$$;

create or replace function public.attach_meal_photo(target_preschool_id uuid, served date, object_path text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.attach_meal_photo(target_preschool_id, served, object_path);
end;
$$;

create or replace function public.clear_meal_photo(target_preschool_id uuid, served date)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.clear_meal_photo(target_preschool_id, served);
end;
$$;

revoke all on function private.meal_preschool_visible(uuid) from public, anon, authenticated, service_role;
revoke all on function private.meal_preschool_editable(uuid) from public, anon, authenticated, service_role;
revoke all on function private.meal_same_organization() from public, anon, authenticated, service_role;
revoke all on function private.meal_display_name(text, text) from public, anon, authenticated, service_role;
revoke all on function private.meal_object_allowed(text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function private.meal_object_metadata(text, text) from public, anon, authenticated, service_role;
revoke all on function private.list_preschool_meals(uuid, date, date) from public, anon, authenticated, service_role;
revoke all on function private.save_meal_days(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.attach_meal_menu(uuid, uuid, date, date, text, text) from public, anon, authenticated, service_role;
revoke all on function private.clear_meal_menu(uuid) from public, anon, authenticated, service_role;
revoke all on function private.attach_meal_photo(uuid, date, text) from public, anon, authenticated, service_role;
revoke all on function private.clear_meal_photo(uuid, date) from public, anon, authenticated, service_role;

grant execute on function private.meal_preschool_visible(uuid) to authenticated;
grant execute on function private.meal_preschool_editable(uuid) to authenticated;
grant execute on function private.meal_object_allowed(text, text, boolean) to authenticated;
grant execute on function private.list_preschool_meals(uuid, date, date) to authenticated;
grant execute on function private.save_meal_days(uuid, jsonb) to authenticated;
grant execute on function private.attach_meal_menu(uuid, uuid, date, date, text, text) to authenticated;
grant execute on function private.clear_meal_menu(uuid) to authenticated;
grant execute on function private.attach_meal_photo(uuid, date, text) to authenticated;
grant execute on function private.clear_meal_photo(uuid, date) to authenticated;

revoke all on function public.list_preschool_meals(uuid, date, date) from public, anon, authenticated, service_role;
revoke all on function public.save_meal_days(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.attach_meal_menu(uuid, uuid, date, date, text, text) from public, anon, authenticated, service_role;
revoke all on function public.clear_meal_menu(uuid) from public, anon, authenticated, service_role;
revoke all on function public.attach_meal_photo(uuid, date, text) from public, anon, authenticated, service_role;
revoke all on function public.clear_meal_photo(uuid, date) from public, anon, authenticated, service_role;

grant execute on function public.list_preschool_meals(uuid, date, date) to authenticated;
grant execute on function public.save_meal_days(uuid, jsonb) to authenticated;
grant execute on function public.attach_meal_menu(uuid, uuid, date, date, text, text) to authenticated;
grant execute on function public.clear_meal_menu(uuid) to authenticated;
grant execute on function public.attach_meal_photo(uuid, date, text) to authenticated;
grant execute on function public.clear_meal_photo(uuid, date) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('meal-menus', 'meal-menus', false, 8388608, array['application/pdf', 'image/jpeg']),
  ('meal-photos', 'meal-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if to_regprocedure('storage.allow_any_operation(text[])') is null then
    raise exception 'storage.allow_any_operation saknas. Matsedeln kräver aktuell Storage innan den aktiveras.';
  end if;
  -- storage.objects is owned outside this migration and already has row level
  -- security. Enabling it again requires that owner, so this is only a check.
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

drop policy if exists "meal menus object read" on storage.objects;
create policy "meal menus object read" on storage.objects
for select to authenticated
using (
  bucket_id = 'meal-menus'
  and storage.allow_any_operation(array[
    'storage.object.get_authenticated',
    'storage.object.get_signed',
    'storage.object.sign',
    'storage.object.sign_many',
    'object.get_authenticated_info',
    'storage.object.info_authenticated',
    'storage.object.upload',
    'storage.object.upload_update'
  ])
  and private.meal_object_allowed('meal-menus', name, false)
);

-- DELETE /object/{bucket} runs as storage.object.delete_many and uses
-- DELETE ... RETURNING. Postgres also applies SELECT policies to that delete,
-- so staff and admins need a narrow SELECT allowance for the delete operations.
-- Parents stay on the read policy above and cannot satisfy for_write.
drop policy if exists "meal menus object delete read" on storage.objects;
create policy "meal menus object delete read" on storage.objects
for select to authenticated
using (
  bucket_id = 'meal-menus'
  and storage.allow_any_operation(array[
    'storage.object.delete',
    'storage.object.delete_many'
  ])
  and private.meal_object_allowed('meal-menus', name, true)
);

drop policy if exists "meal menus object insert" on storage.objects;
create policy "meal menus object insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'meal-menus'
  and private.meal_object_allowed('meal-menus', name, true)
);

drop policy if exists "meal menus object update" on storage.objects;
create policy "meal menus object update" on storage.objects
for update to authenticated
using (
  bucket_id = 'meal-menus'
  and private.meal_object_allowed('meal-menus', name, true)
)
with check (
  bucket_id = 'meal-menus'
  and private.meal_object_allowed('meal-menus', name, true)
);

drop policy if exists "meal menus object delete" on storage.objects;
create policy "meal menus object delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'meal-menus'
  and private.meal_object_allowed('meal-menus', name, true)
);

drop policy if exists "meal photos object read" on storage.objects;
create policy "meal photos object read" on storage.objects
for select to authenticated
using (
  bucket_id = 'meal-photos'
  and storage.allow_any_operation(array[
    'storage.object.get_authenticated',
    'storage.object.get_signed',
    'storage.object.sign',
    'storage.object.sign_many',
    'object.get_authenticated_info',
    'storage.object.info_authenticated',
    'storage.object.upload',
    'storage.object.upload_update'
  ])
  and private.meal_object_allowed('meal-photos', name, false)
);

drop policy if exists "meal photos object delete read" on storage.objects;
create policy "meal photos object delete read" on storage.objects
for select to authenticated
using (
  bucket_id = 'meal-photos'
  and storage.allow_any_operation(array[
    'storage.object.delete',
    'storage.object.delete_many'
  ])
  and private.meal_object_allowed('meal-photos', name, true)
);

drop policy if exists "meal photos object insert" on storage.objects;
create policy "meal photos object insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'meal-photos'
  and private.meal_object_allowed('meal-photos', name, true)
);

drop policy if exists "meal photos object update" on storage.objects;
create policy "meal photos object update" on storage.objects
for update to authenticated
using (
  bucket_id = 'meal-photos'
  and private.meal_object_allowed('meal-photos', name, true)
)
with check (
  bucket_id = 'meal-photos'
  and private.meal_object_allowed('meal-photos', name, true)
);

drop policy if exists "meal photos object delete" on storage.objects;
create policy "meal photos object delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'meal-photos'
  and private.meal_object_allowed('meal-photos', name, true)
);

commit;
