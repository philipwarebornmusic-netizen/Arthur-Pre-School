-- Applied to production before the 2026-11-09 release verification.
-- A normal Swedish spring term, from early January to mid-June, is about 160 days.
-- Six months is 183 days. 186 days covers that term when it is entered near its start
-- and still refuses a write a whole school year ahead. A menu file may cover the same
-- span: ends_on - starts_on <= 185. The past window stays 14 days. Listing stays in
-- chunks of 120 days. Auth and tenant checks are unchanged.

alter table public.meal_menus drop constraint meal_menus_range;
alter table public.meal_menus add constraint meal_menus_range
  check (starts_on <= ends_on and ends_on - starts_on <= 185);

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
    if served < current_date - 14 or served > current_date + 186 then
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
  if range_start is null or range_end is null or range_end < range_start or range_end - range_start > 185 then
    raise exception 'Matsedelsfilen behöver ett intervall på högst 186 dagar';
  end if;
  if range_start < current_date - 14 or range_end > current_date + 186 then
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
    or served < current_date - 14 or served > current_date + 186 then
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

create or replace function private.meal_edit_horizon()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'past_days', 14,
    'future_days', 186,
    'file_span_days', 185,
    'revision', 'term'
  );
$$;

create or replace function public.meal_edit_horizon()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.meal_edit_horizon();
$$;

revoke all on function private.meal_edit_horizon() from public, anon, authenticated, service_role;
revoke all on function public.meal_edit_horizon() from public, anon, authenticated, service_role;
grant execute on function private.meal_edit_horizon() to authenticated;
grant execute on function public.meal_edit_horizon() to authenticated;

