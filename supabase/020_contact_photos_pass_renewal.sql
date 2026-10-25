-- Contact photos on the pickup list, and permanent-pass renewal.
--
-- Apply this file once, manually, in the Supabase SQL editor after review.
-- It is NOT applied. Deploy previews use the production database, so photo
-- upload and pass extension show a "not activated" notice until this file
-- has been applied by hand.
--
-- The file does not delete children, guardians, passes, or pickup contacts.
-- It does not change create_pickup_pass or create_permanent_pickup_pass.
-- get_pass_by_token is unchanged and still returns no photo.
-- These functions never DELETE from storage.objects. Supabase installs
-- protect_objects_delete, which rejects every SQL DELETE on that table.
-- The client removes the file through the Storage API, then
-- clear_pickup_contact_photo or delete_pickup_contact continues only after
-- a SELECT shows the object is gone. Replacing a photo upserts the same
-- path, so no second file is left behind.
--
-- Deleting a child cascades the pickup_contacts row and can leave the
-- storage object behind, because SQL cannot remove it.
--
-- Read: the child's guardians, staff of the child's department, and an
-- organization admin (so checkout on Närvaro works for the admin role).
-- Write and delete: guardians only.

begin;

alter table public.pickup_contacts add column if not exists photo_path text;
alter table public.pickup_contacts add column if not exists photo_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pickup_contacts_photo_path_format'
      and conrelid = 'public.pickup_contacts'::regclass
  ) then
    alter table public.pickup_contacts
      add constraint pickup_contacts_photo_path_format
      check (photo_path is null or photo_path = id::text || '/photo.jpg');
  end if;
end $$;

create table if not exists public.permanent_pass_reminder_dismissals (
  pass_id uuid not null references public.permanent_pickup_passes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (pass_id, profile_id)
);

alter table public.permanent_pass_reminder_dismissals enable row level security;
revoke all on public.permanent_pass_reminder_dismissals from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contact-photos', 'contact-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.contact_id_from_photo_path(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  parsed uuid;
begin
  if object_name is null
    or object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/photo[.]jpg$'
  then
    return null;
  end if;
  begin
    parsed := split_part(object_name, '/', 1)::uuid;
  exception when others then
    return null;
  end;
  if object_name <> parsed::text || '/photo.jpg' then
    return null;
  end if;
  return parsed;
end;
$$;

create or replace function public.can_write_contact_photo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.pickup_contacts contact
    where contact.id = public.contact_id_from_photo_path(object_name)
      and public.is_guardian(contact.child_id)
  )
$$;

create or replace function public.can_read_contact_photo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.pickup_contacts contact
    where contact.id = public.contact_id_from_photo_path(object_name)
      and (
        public.is_guardian(contact.child_id)
        or public.is_staff_for_child(contact.child_id)
        or public.is_admin_for_child(contact.child_id)
      )
  )
$$;

create or replace function public.set_pickup_contact_photo(
  target_contact_id uuid,
  object_path text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  existing public.pickup_contacts;
  expected_path text;
  object_size bigint;
  object_mime text;
begin
  if auth.uid() is null then
    raise exception 'Du måste vara inloggad';
  end if;
  select * into existing from public.pickup_contacts where id = target_contact_id;
  if existing.id is null then
    raise exception 'Personen finns inte på hämtlistan';
  end if;
  if public.current_role() is distinct from 'parent'::public.user_role or not public.is_guardian(existing.child_id) then
    raise exception 'Bara barnets vårdnadshavare kan ladda upp bilden';
  end if;
  expected_path := existing.id::text || '/photo.jpg';
  if object_path is distinct from expected_path then
    raise exception 'Bildens sökväg är ogiltig';
  end if;
  select
    nullif(object.metadata ->> 'size', '')::bigint,
    coalesce(object.metadata ->> 'mimetype', object.metadata ->> 'mimeType', '')
  into object_size, object_mime
  from storage.objects object
  where object.bucket_id = 'contact-photos'
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
  update public.pickup_contacts
  set photo_path = expected_path,
      photo_updated_at = now()
  where id = existing.id;
end;
$$;

create or replace function public.clear_pickup_contact_photo(target_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  existing public.pickup_contacts;
begin
  if auth.uid() is null then
    raise exception 'Du måste vara inloggad';
  end if;
  select * into existing from public.pickup_contacts where id = target_contact_id for update;
  if existing.id is null then
    raise exception 'Personen finns inte på hämtlistan';
  end if;
  if public.current_role() is distinct from 'parent'::public.user_role or not public.is_guardian(existing.child_id) then
    raise exception 'Bara barnets vårdnadshavare kan ta bort bilden';
  end if;
  if exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'contact-photos'
      and object.name = existing.id::text || '/photo.jpg'
  ) then
    raise exception 'Bilden finns kvar i lagringen. Ta bort den och försök igen';
  end if;
  update public.pickup_contacts
  set photo_path = null,
      photo_updated_at = now()
  where id = existing.id;
end;
$$;

create or replace function public.delete_pickup_contact(target_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  existing public.pickup_contacts;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  select * into existing from public.pickup_contacts where id = target_contact_id for update;
  if existing.id is null then raise exception 'Personen finns inte på hämtlistan'; end if;
  if not public.is_guardian(existing.child_id) then
    raise exception 'Du saknar behörighet till barnets hämtlista';
  end if;
  if existing.blocked then raise exception 'En spärrad person kan inte tas bort'; end if;
  if exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'contact-photos'
      and object.name = existing.id::text || '/photo.jpg'
  ) then
    raise exception 'Bilden finns kvar i lagringen. Ta bort den och försök igen';
  end if;
  delete from public.pickup_contacts where id = existing.id;
end;
$$;

create or replace function public.pickup_contact_photo_path(target_child_id uuid, person_name text)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select contact.photo_path
  from public.pickup_contacts contact
  where contact.child_id = target_child_id
    and contact.photo_path is not null
    and public.pickup_normalize_name(contact.name) = public.pickup_normalize_name(person_name)
  order by contact.blocked asc, contact.photo_updated_at desc nulls last
  limit 1
$$;

create or replace function public.pickup_next_term_end(target_child_id uuid, after_date date)
returns date
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  anchor date := greatest(coalesce(after_date, public.pickup_stockholm_today()), public.pickup_stockholm_today());
  found date;
  year_n integer;
  june date;
  december date;
begin
  select term.ends_on into found
  from public.children child
  join public.departments department on department.id = child.department_id
  join public.school_terms term on term.preschool_id = department.preschool_id
  where child.id = target_child_id
    and term.status = 'published'
    and term.ends_on > anchor
  order by term.ends_on
  limit 1;
  if found is not null then
    return found;
  end if;
  year_n := extract(year from anchor)::integer;
  june := make_date(year_n, 6, 30);
  december := make_date(year_n, 12, 31);
  -- Skip a calendar boundary inside the 14-day reminder, so a pass that
  -- already ends near 31 Dec moves to 30 June rather than a few days later.
  if june > anchor + 14 then return june; end if;
  if december > anchor + 14 then return december; end if;
  june := make_date(year_n + 1, 6, 30);
  if june > anchor + 14 then return june; end if;
  return make_date(year_n + 1, 12, 31);
end;
$$;

create or replace function public.extend_permanent_pickup_pass(target_pass_id uuid)
returns date
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  pass public.permanent_pickup_passes;
  child_id uuid;
  anchor date;
  next_end date;
begin
  if auth.uid() is null then
    raise exception 'Du måste vara inloggad';
  end if;
  if public.current_role() is distinct from 'parent'::public.user_role then
    raise exception 'Bara en vårdnadshavare kan förlänga hämtpasset';
  end if;
  select * into pass from public.permanent_pickup_passes where id = target_pass_id for update;
  if pass.id is null then
    raise exception 'Hämtpasset finns inte';
  end if;
  if not public.guardian_can_see_permanent_pass(pass.id) then
    raise exception 'Bara en vårdnadshavare kan förlänga hämtpasset';
  end if;
  if pass.revoked_at is not null then
    raise exception 'Hämtpasset är återkallat';
  end if;
  if not exists (
    select 1
    from public.permanent_pickup_pass_children link
    where link.pass_id = pass.id
      and public.permanent_contact_allowed(link.contact_id)
      and public.is_guardian(link.child_id)
  ) then
    raise exception 'Personen får ej hämta';
  end if;
  select link.child_id into child_id
  from public.permanent_pickup_pass_children link
  where link.pass_id = pass.id
    and public.is_guardian(link.child_id)
  order by link.child_id
  limit 1;
  anchor := greatest(coalesce(pass.ends_on, public.pickup_stockholm_today()), public.pickup_stockholm_today());
  next_end := public.pickup_next_term_end(child_id, anchor);
  if next_end is null or next_end <= anchor then
    raise exception 'Nästa termin kunde inte räknas ut';
  end if;
  if next_end > public.pickup_stockholm_today() + 1825 then
    raise exception 'Slutdatumet kan vara högst fem år framåt';
  end if;
  update public.permanent_pickup_passes
  set ends_on = next_end
  where id = pass.id;
  delete from public.permanent_pass_reminder_dismissals
  where pass_id = pass.id;
  return next_end;
end;
$$;

create or replace function public.dismiss_permanent_pass_reminder(target_pass_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  pass public.permanent_pickup_passes;
begin
  if auth.uid() is null or public.current_profile_id() is null then
    raise exception 'Du måste vara inloggad';
  end if;
  if public.current_role() is distinct from 'parent'::public.user_role then
    raise exception 'Bara en vårdnadshavare kan låta passet gå ut';
  end if;
  select * into pass from public.permanent_pickup_passes where id = target_pass_id;
  if pass.id is null then
    raise exception 'Hämtpasset finns inte';
  end if;
  if not public.guardian_can_see_permanent_pass(pass.id) or not exists (
    select 1
    from public.permanent_pickup_pass_children link
    where link.pass_id = pass.id
      and public.is_guardian(link.child_id)
  ) then
    raise exception 'Bara en vårdnadshavare kan låta passet gå ut';
  end if;
  if pass.revoked_at is not null then
    raise exception 'Hämtpasset är återkallat';
  end if;
  insert into public.permanent_pass_reminder_dismissals (pass_id, profile_id)
  values (pass.id, public.current_profile_id())
  on conflict (pass_id, profile_id) do update
  set dismissed_at = now();
end;
$$;

drop function if exists public.list_pickup_contacts();

create function public.list_pickup_contacts()
returns table (
  contact_id uuid,
  child_id uuid,
  name text,
  relation text,
  phone text,
  blocked boolean,
  known boolean,
  photo_path text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    contact.id,
    contact.child_id,
    contact.name,
    contact.relation,
    case
      when public.is_guardian(contact.child_id) or public.is_admin_for_child(contact.child_id) then contact.phone
      else null
    end,
    contact.blocked,
    exists (
      select 1
      from public.pickup_events event
      where event.child_id = contact.child_id
        and public.pickup_normalize_name(event.picked_up_by_name) = public.pickup_normalize_name(contact.name)
    ),
    contact.photo_path
  from public.pickup_contacts contact
  where public.is_guardian(contact.child_id)
     or public.is_staff_for_child(contact.child_id)
     or public.is_admin_for_child(contact.child_id)
  order by contact.blocked desc, contact.name
$$;

drop function if exists public.list_permanent_pickup_passes();

create function public.list_permanent_pickup_passes()
returns table (
  pass_id uuid,
  contact_name text,
  contact_relation text,
  ends_on date,
  pass_status text,
  child_names text,
  children jsonb,
  renewal_dismissed boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    pass.id,
    coalesce((
      select contact.name
      from public.permanent_pickup_pass_children link
      join public.pickup_contacts contact on contact.id = link.contact_id
      where link.pass_id = pass.id
      order by contact.name
      limit 1
    ), 'Borttagen person'),
    coalesce((
      select contact.relation
      from public.permanent_pickup_pass_children link
      join public.pickup_contacts contact on contact.id = link.contact_id
      where link.pass_id = pass.id
      order by contact.name
      limit 1
    ), ''),
    pass.ends_on,
    case
      when pass.revoked_at is not null then 'revoked'
      when pass.ends_on is not null and pass.ends_on < public.pickup_stockholm_today() then 'expired'
      when not exists (
        select 1
        from public.permanent_pickup_pass_children link
        where link.pass_id = pass.id
          and public.permanent_contact_allowed(link.contact_id)
      ) and exists (
        select 1
        from public.permanent_pickup_pass_children link
        join public.pickup_contacts contact on contact.id = link.contact_id
        where link.pass_id = pass.id
          and (contact.blocked or public.pickup_name_blocked(contact.child_id, contact.name))
      ) then 'blocked'
      when not exists (
        select 1
        from public.permanent_pickup_pass_children link
        where link.pass_id = pass.id
          and public.permanent_contact_allowed(link.contact_id)
      ) then 'removed'
      else 'active'
    end,
    (
      select public.pickup_join_names(array_agg(public.pickup_first_name(child.name) order by child.name))
      from public.permanent_pickup_pass_children link
      join public.children child on child.id = link.child_id
      where link.pass_id = pass.id
    ),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'child_id', child.id,
        'child_name', child.name,
        'allowed', public.permanent_contact_allowed(link.contact_id)
      ) order by child.name)
      from public.permanent_pickup_pass_children link
      join public.children child on child.id = link.child_id
      where link.pass_id = pass.id
    ), '[]'::jsonb),
    exists (
      select 1
      from public.permanent_pass_reminder_dismissals dismissal
      where dismissal.pass_id = pass.id
        and dismissal.profile_id = public.current_profile_id()
    )
  from public.permanent_pickup_passes pass
  where public.guardian_can_see_permanent_pass(pass.id)
  order by pass.created_at desc
$$;

create or replace function public.list_pickup_options(target_child_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not (public.is_admin_for_child(target_child_id) or public.is_staff_for_child(target_child_id)) then
    raise exception 'Du saknar behörighet till barnets närvaro';
  end if;
  return jsonb_build_object(
    'guardians', coalesce((
      select jsonb_agg(jsonb_build_object(
        'profile_id', profile.id,
        'name', profile.name,
        'known', exists (
          select 1 from public.pickup_events event
          where event.child_id = target_child_id
            and public.pickup_normalize_name(event.picked_up_by_name) = public.pickup_normalize_name(profile.name)
        )
      ) order by profile.name)
      from public.child_guardians guardian
      join public.profiles profile on profile.id = guardian.profile_id
      where guardian.child_id = target_child_id
        and profile.role = 'parent'
        and profile.removed_at is null
    ), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'contact_id', contact.id,
        'name', contact.name,
        'relation', contact.relation,
        'blocked', contact.blocked,
        'photo_path', contact.photo_path,
        'known', exists (
          select 1 from public.pickup_events event
          where event.child_id = target_child_id
            and public.pickup_normalize_name(event.picked_up_by_name) = public.pickup_normalize_name(contact.name)
        )
      ) order by contact.name)
      from public.pickup_contacts contact
      where contact.child_id = target_child_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.pickup_verify_row(pass public.pickup_passes)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  child_name text;
  issuer_name text;
begin
  if pass.id is null then
    return jsonb_build_object('ok', false, 'stop', 'unavailable');
  end if;
  if not (public.is_admin_for_child(pass.child_id) or public.is_staff_for_child(pass.child_id)) then
    return jsonb_build_object('ok', false, 'stop', 'unavailable');
  end if;
  if pass.revoked_at is not null then
    return jsonb_build_object('ok', false, 'stop', 'revoked');
  end if;
  if pass.used_at is not null then
    return jsonb_build_object('ok', false, 'stop', 'used');
  end if;
  if pass.person_name is null then
    return jsonb_build_object('ok', false, 'stop', 'unavailable');
  end if;
  if public.pickup_name_blocked(pass.child_id, pass.person_name) then
    return jsonb_build_object('ok', false, 'stop', 'blocked');
  end if;
  if pass.pickup_date <> public.pickup_stockholm_today() then
    return jsonb_build_object('ok', false, 'stop', 'wrong_day');
  end if;
  if now() < pass.starts_at then
    return jsonb_build_object('ok', false, 'stop', 'not_yet');
  end if;
  if now() >= pass.expires_at then
    return jsonb_build_object('ok', false, 'stop', 'expired');
  end if;
  if not public.pickup_child_checked_in(pass.child_id) then
    return jsonb_build_object('ok', false, 'stop', 'not_checked_in');
  end if;

  select name into child_name from public.children where id = pass.child_id;
  select name into issuer_name from public.profiles where id = pass.issued_by;
  return jsonb_build_object(
    'ok', true,
    'pass_id', pass.id,
    'child_name', child_name,
    'pickup_name', pass.person_name,
    'pickup_relation', pass.person_relation,
    'issued_by', issuer_name,
    'issued_at', pass.created_at,
    'photo_path', public.pickup_contact_photo_path(pass.child_id, pass.person_name),
    'ask_for_id', not exists (
      select 1
      from public.pickup_events event
      where event.child_id = pass.child_id
        and public.pickup_normalize_name(event.picked_up_by_name) = public.pickup_normalize_name(pass.person_name)
    )
  );
end;
$$;

create or replace function public.permanent_pickup_verify(target_pass_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  pass public.permanent_pickup_passes;
  allowed jsonb := '[]'::jsonb;
  contact_name text;
  contact_relation text;
  contact_photo text;
  issuer_name text;
  ready_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  select * into pass from public.permanent_pickup_passes where id = target_pass_id;
  if pass.id is null then
    return jsonb_build_object('ok', false, 'stop', 'unavailable');
  end if;
  if not exists (
    select 1
    from public.permanent_pickup_pass_children link
    where link.pass_id = pass.id
      and (public.is_admin_for_child(link.child_id) or public.is_staff_for_child(link.child_id))
  ) then
    return jsonb_build_object('ok', false, 'stop', 'unavailable');
  end if;
  if pass.revoked_at is not null then
    return jsonb_build_object('ok', false, 'stop', 'revoked', 'permanent', true);
  end if;
  if pass.ends_on is not null and pass.ends_on < public.pickup_stockholm_today() then
    return jsonb_build_object('ok', false, 'stop', 'expired', 'permanent', true);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'child_id', child.id,
    'child_name', child.name,
    'checked_in', public.pickup_child_checked_in(child.id)
  ) order by child.name), '[]'::jsonb)
  into allowed
  from public.permanent_pickup_pass_children link
  join public.children child on child.id = link.child_id
  join public.pickup_contacts contact on contact.id = link.contact_id
  where link.pass_id = pass.id
    and public.permanent_contact_allowed(link.contact_id)
    and (public.is_admin_for_child(link.child_id) or public.is_staff_for_child(link.child_id));

  if allowed = '[]'::jsonb then
    if exists (
      select 1
      from public.permanent_pickup_pass_children link
      join public.pickup_contacts contact on contact.id = link.contact_id
      where link.pass_id = pass.id
        and (contact.blocked or public.pickup_name_blocked(contact.child_id, contact.name))
        and (public.is_admin_for_child(link.child_id) or public.is_staff_for_child(link.child_id))
    ) then
      return jsonb_build_object('ok', false, 'stop', 'blocked', 'permanent', true);
    end if;
    return jsonb_build_object('ok', false, 'stop', 'removed', 'permanent', true);
  end if;

  select count(*) into ready_count
  from jsonb_array_elements(allowed) item
  where coalesce((item->>'checked_in')::boolean, false);

  if ready_count = 0 then
    return jsonb_build_object('ok', false, 'stop', 'not_checked_in', 'permanent', true);
  end if;

  select contact.name, contact.relation, contact.photo_path
  into contact_name, contact_relation, contact_photo
  from public.permanent_pickup_pass_children link
  join public.pickup_contacts contact on contact.id = link.contact_id
  where link.pass_id = pass.id
    and public.permanent_contact_allowed(link.contact_id)
  order by contact.name
  limit 1;
  select name into issuer_name from public.profiles where id = pass.issued_by;

  return jsonb_build_object(
    'ok', true,
    'permanent', true,
    'pass_id', pass.id,
    'pickup_name', contact_name,
    'pickup_relation', contact_relation,
    'photo_path', contact_photo,
    'children', allowed,
    'issued_by', issuer_name,
    'issued_at', pass.created_at,
    'ends_on', pass.ends_on,
    'ask_for_id', true
  );
end;
$$;

drop policy if exists "contact photo guardian insert" on storage.objects;
drop policy if exists "contact photo guardian update" on storage.objects;
drop policy if exists "contact photo guardian delete" on storage.objects;
drop policy if exists "contact photo authorized read" on storage.objects;

create policy "contact photo guardian insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'contact-photos'
  and public.can_write_contact_photo(name)
);

create policy "contact photo guardian update" on storage.objects
for update to authenticated
using (
  bucket_id = 'contact-photos'
  and public.can_write_contact_photo(name)
)
with check (
  bucket_id = 'contact-photos'
  and public.can_write_contact_photo(name)
);

create policy "contact photo guardian delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'contact-photos'
  and public.can_write_contact_photo(name)
);

create policy "contact photo authorized read" on storage.objects
for select to authenticated
using (
  bucket_id = 'contact-photos'
  and public.can_read_contact_photo(name)
);

revoke all on function public.contact_id_from_photo_path(text) from public, anon, authenticated;
revoke all on function public.can_write_contact_photo(text) from public, anon, authenticated;
revoke all on function public.can_read_contact_photo(text) from public, anon, authenticated;
revoke all on function public.set_pickup_contact_photo(uuid, text) from public, anon, authenticated;
revoke all on function public.clear_pickup_contact_photo(uuid) from public, anon, authenticated;
revoke all on function public.pickup_contact_photo_path(uuid, text) from public, anon, authenticated;
revoke all on function public.pickup_next_term_end(uuid, date) from public, anon, authenticated;
revoke all on function public.extend_permanent_pickup_pass(uuid) from public, anon, authenticated;
revoke all on function public.dismiss_permanent_pass_reminder(uuid) from public, anon, authenticated;
revoke all on function public.list_pickup_contacts() from public, anon, authenticated;
revoke all on function public.list_permanent_pickup_passes() from public, anon, authenticated;
revoke all on function public.delete_pickup_contact(uuid) from public, anon;
revoke all on function public.list_pickup_options(uuid) from public, anon;
revoke all on function public.pickup_verify_row(public.pickup_passes) from public, anon, authenticated;
revoke all on function public.permanent_pickup_verify(uuid) from public, anon, authenticated;

grant execute on function public.can_write_contact_photo(text) to authenticated;
grant execute on function public.can_read_contact_photo(text) to authenticated;
grant execute on function public.set_pickup_contact_photo(uuid, text) to authenticated;
grant execute on function public.clear_pickup_contact_photo(uuid) to authenticated;
grant execute on function public.extend_permanent_pickup_pass(uuid) to authenticated;
grant execute on function public.dismiss_permanent_pass_reminder(uuid) to authenticated;
grant execute on function public.list_pickup_contacts() to authenticated;
grant execute on function public.list_permanent_pickup_passes() to authenticated;
grant execute on function public.delete_pickup_contact(uuid) to authenticated;
grant execute on function public.list_pickup_options(uuid) to authenticated;

commit;
