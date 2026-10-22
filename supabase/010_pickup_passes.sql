-- Pickup list, one-day pickup passes, and checkout events.
-- Run manually in the SQL editor after 009_invite_onboarding.sql.
-- Do not run this against production until pickup should go live.
-- Deploy previews use the production database.
--
-- The file does not delete profiles, children, guardian links, or attendance.
-- Pass tokens and fallback codes are stored only as sha256 hashes.
-- The 6-digit code is derived from the token, so a person who already holds
-- the unguessable link can see it without a plaintext column. Anonymous
-- callers cannot look a pass up by that short code.
-- Direct table access is revoked. Callers use the functions below.

create extension if not exists pgcrypto;

create table if not exists public.pickup_contacts (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  relation text not null check (char_length(btrim(relation)) between 1 and 80),
  phone text check (phone is null or char_length(btrim(phone)) between 1 and 40),
  blocked boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  blocked_by uuid references public.profiles(id) on delete set null,
  blocked_at timestamptz,
  check (blocked = false or blocked_at is not null)
);

create table if not exists public.pickup_passes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  issued_by uuid not null references public.profiles(id) on delete restrict,
  pickup_date date not null,
  window_start time not null,
  window_end time not null,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  person_name text,
  person_relation text,
  person_phone text,
  token_hash text not null unique check (char_length(token_hash) = 64),
  short_code_hash text not null check (char_length(short_code_hash) = 64),
  used_at timestamptz,
  used_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (window_end > window_start),
  check (expires_at > starts_at),
  check (used_at is null or revoked_at is null),
  check (person_name is null or char_length(btrim(person_name)) between 1 and 80),
  check (person_relation is null or char_length(btrim(person_relation)) between 1 and 80),
  check (person_phone is null or char_length(btrim(person_phone)) between 1 and 40)
);

create table if not exists public.pickup_events (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  pass_id uuid references public.pickup_passes(id) on delete set null,
  staff_id uuid references public.profiles(id) on delete set null,
  method text not null check (method in ('qr', 'code', 'manual')),
  picked_up_by_name text not null check (char_length(btrim(picked_up_by_name)) between 1 and 200),
  picked_up_by_relation text,
  created_at timestamptz not null default now()
);

create table if not exists public.pickup_notices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 400),
  created_at timestamptz not null default now()
);

create table if not exists public.pickup_lookup_buckets (
  bucket_key text primary key,
  hits integer not null,
  window_started_at timestamptz not null
);

create index if not exists idx_pickup_contacts_child on public.pickup_contacts(child_id, blocked);
create index if not exists idx_pickup_passes_child_date on public.pickup_passes(child_id, pickup_date);
create index if not exists idx_pickup_passes_short_code on public.pickup_passes(short_code_hash);
create index if not exists idx_pickup_events_child on public.pickup_events(child_id, created_at desc);
create index if not exists idx_pickup_notices_profile on public.pickup_notices(profile_id, created_at desc);

alter table public.pickup_contacts enable row level security;
alter table public.pickup_passes enable row level security;
alter table public.pickup_events enable row level security;
alter table public.pickup_notices enable row level security;
alter table public.pickup_lookup_buckets enable row level security;

revoke all on table public.pickup_contacts from public, anon, authenticated;
revoke all on table public.pickup_passes from public, anon, authenticated;
revoke all on table public.pickup_events from public, anon, authenticated;
revoke all on table public.pickup_notices from public, anon, authenticated;
revoke all on table public.pickup_lookup_buckets from public, anon, authenticated;

create or replace function public.pickup_secret_hash(secret text)
returns text
language sql
immutable
security definer
set search_path = public, extensions
as $$
  select encode(digest(convert_to(lower(btrim(coalesce(secret, ''))), 'UTF8'), 'sha256'), 'hex')
$$;

-- First 48 bits of the token, modulo 1_000_000. The code is not stored.
create or replace function public.pickup_short_code(token text)
returns text
language sql
immutable
set search_path = public
as $$
  select lpad(((('x' || substr(lower(token), 1, 12))::bit(48)::bigint % 1000000)::text), 6, '0')
$$;

create or replace function public.pickup_normalize_name(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g'))
$$;

create or replace function public.pickup_first_name(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select split_part(btrim(coalesce(value, '')), ' ', 1)
$$;

create or replace function public.pickup_stockholm_today()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'Europe/Stockholm')::date
$$;

create or replace function public.pickup_clean_phone(value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  cleaned text := nullif(btrim(coalesce(value, '')), '');
begin
  if cleaned is not null and char_length(cleaned) > 40 then
    raise exception 'Telefonnumret är för långt';
  end if;
  return cleaned;
end;
$$;

create or replace function public.pickup_name_blocked(target_child_id uuid, person text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pickup_contacts
    where child_id = target_child_id
      and blocked
      and public.pickup_normalize_name(name) = public.pickup_normalize_name(person)
      and public.pickup_normalize_name(person) <> ''
  )
$$;

create or replace function public.pickup_child_checked_in(target_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.attendance
    where child_id = target_child_id
      and date = public.pickup_stockholm_today()
      and checked_in_at is not null
      and checked_out_at is null
  )
$$;

create or replace function public.pickup_stop_text(stop_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select case stop_code
    when 'revoked' then 'Hämtpasset är återkallat'
    when 'used' then 'Hämtpasset är redan använt'
    when 'blocked' then 'Personen får ej hämta'
    when 'wrong_day' then 'Hämtpasset gäller inte idag'
    when 'not_yet' then 'Hämtpasset har inte börjat gälla'
    when 'expired' then 'Hämtpasset har gått ut'
    when 'not_checked_in' then 'Barnet är inte incheckat'
    when 'ambiguous' then 'Koden är inte entydig. Skanna QR-koden i stället.'
    else 'Hämtpasset kan inte användas'
  end
$$;

create or replace function public.pickup_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_hits integer;
begin
  insert into public.pickup_lookup_buckets as bucket (bucket_key, hits, window_started_at)
  values (p_key, 1, clock_timestamp())
  on conflict (bucket_key) do update
  set hits = case
        when bucket.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds) then 1
        else bucket.hits + 1
      end,
      window_started_at = case
        when bucket.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds) then clock_timestamp()
        else bucket.window_started_at
      end
  returning hits into current_hits;

  if current_hits > p_max then
    raise exception 'För många försök. Vänta en stund.';
  end if;
end;
$$;

create or replace function public.pickup_check_out(target_child_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_attendance public.attendance;
begin
  select * into current_attendance
  from public.attendance
  where child_id = target_child_id
    and date = public.pickup_stockholm_today()
  for update;

  if current_attendance.id is null
     or current_attendance.checked_in_at is null
     or current_attendance.checked_out_at is not null then
    raise exception 'Barnet är inte incheckat';
  end if;

  update public.attendance
  set status = 'picked_up',
      checked_out_at = now(),
      updated_by = public.current_profile_id(),
      updated_at = now()
  where id = current_attendance.id;
end;
$$;

create or replace function public.pickup_notice_body(
  target_child_id uuid,
  person_relation text,
  person text,
  channel text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  first_name text;
  stamp text;
begin
  select public.pickup_first_name(name) into first_name
  from public.children
  where id = target_child_id;
  stamp := to_char(now() at time zone 'Europe/Stockholm', 'HH24:MI');
  return first_name || ' hämtades ' || stamp || ' av ' || btrim(person_relation) || ' ' || btrim(person)
    || ' ' || case when channel = 'pass' then '(hämtpass)' else '(manuellt)' end;
end;
$$;

create or replace function public.pickup_notify(
  target_child_id uuid,
  person_relation text,
  person text,
  channel text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  notice_body text := public.pickup_notice_body(target_child_id, person_relation, person, channel);
begin
  insert into public.pickup_notices (profile_id, child_id, body)
  select guardian.profile_id, target_child_id, notice_body
  from public.child_guardians guardian
  join public.profiles profile on profile.id = guardian.profile_id
  where guardian.child_id = target_child_id
    and profile.role = 'parent'
    and profile.removed_at is null;
end;
$$;

create or replace function public.pickup_verify_row(pass public.pickup_passes)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
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
    'ask_for_id', not exists (
      select 1
      from public.pickup_events event
      where event.child_id = pass.child_id
        and public.pickup_normalize_name(event.picked_up_by_name) = public.pickup_normalize_name(pass.person_name)
    )
  );
end;
$$;

create or replace function public.save_pickup_contact(
  target_child_id uuid,
  contact_name text,
  contact_relation text,
  contact_phone text default null,
  target_contact_id uuid default null,
  create_blocked boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_id uuid;
  cleaned_name text := regexp_replace(btrim(coalesce(contact_name, '')), '\s+', ' ', 'g');
  cleaned_relation text := regexp_replace(btrim(coalesce(contact_relation, '')), '\s+', ' ', 'g');
  cleaned_phone text;
  existing public.pickup_contacts;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if char_length(cleaned_name) < 1 or char_length(cleaned_name) > 80 then
    raise exception 'Skriv personens namn';
  end if;
  if char_length(cleaned_relation) < 1 or char_length(cleaned_relation) > 80 then
    raise exception 'Skriv relationen';
  end if;
  cleaned_phone := public.pickup_clean_phone(contact_phone);

  if target_contact_id is null then
    if not (public.is_guardian(target_child_id) or public.is_admin_for_child(target_child_id)) then
      raise exception 'Du saknar behörighet till barnets hämtlista';
    end if;
    if coalesce(create_blocked, false) and not public.is_admin_for_child(target_child_id) then
      raise exception 'Bara en administratör kan spärra';
    end if;
    if public.pickup_name_blocked(target_child_id, cleaned_name) then
      raise exception 'Personen får ej hämta';
    end if;
    insert into public.pickup_contacts (child_id, name, relation, phone, blocked, created_by, blocked_by, blocked_at)
    values (
      target_child_id,
      cleaned_name,
      cleaned_relation,
      cleaned_phone,
      coalesce(create_blocked, false),
      public.current_profile_id(),
      case when coalesce(create_blocked, false) then public.current_profile_id() else null end,
      case when coalesce(create_blocked, false) then now() else null end
    )
    returning id into saved_id;
    return saved_id;
  end if;

  if not public.is_guardian(target_child_id) then
    raise exception 'Du saknar behörighet till barnets hämtlista';
  end if;
  select * into existing
  from public.pickup_contacts
  where id = target_contact_id and child_id = target_child_id
  for update;
  if existing.id is null then raise exception 'Personen finns inte på hämtlistan'; end if;
  if existing.blocked then raise exception 'En spärrad person kan inte ändras'; end if;
  if public.pickup_name_blocked(target_child_id, cleaned_name) then
    raise exception 'Personen får ej hämta';
  end if;
  update public.pickup_contacts
  set name = cleaned_name, relation = cleaned_relation, phone = cleaned_phone
  where id = existing.id
  returning id into saved_id;
  return saved_id;
end;
$$;

create or replace function public.delete_pickup_contact(target_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
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
  delete from public.pickup_contacts where id = existing.id;
end;
$$;

create or replace function public.set_pickup_contact_block(target_contact_id uuid, is_blocked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.pickup_contacts;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  select * into existing from public.pickup_contacts where id = target_contact_id for update;
  if existing.id is null then raise exception 'Personen finns inte på hämtlistan'; end if;
  if not public.is_admin_for_child(existing.child_id) then
    raise exception 'Bara en administratör kan spärra';
  end if;
  update public.pickup_contacts
  set blocked = coalesce(is_blocked, false),
      blocked_by = case when coalesce(is_blocked, false) then public.current_profile_id() else null end,
      blocked_at = case when coalesce(is_blocked, false) then now() else null end
  where id = existing.id;
end;
$$;

create or replace function public.list_pickup_contacts()
returns table (
  contact_id uuid,
  child_id uuid,
  name text,
  relation text,
  phone text,
  blocked boolean,
  known boolean
)
language sql
stable
security definer
set search_path = public
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
    )
  from public.pickup_contacts contact
  where public.is_guardian(contact.child_id)
     or public.is_staff_for_child(contact.child_id)
     or public.is_admin_for_child(contact.child_id)
  order by contact.blocked desc, contact.name
$$;

create or replace function public.list_pickup_passes()
returns table (
  pass_id uuid,
  child_id uuid,
  child_first_name text,
  person_name text,
  person_relation text,
  pickup_date date,
  window_start text,
  window_end text,
  pass_status text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pass.id,
    pass.child_id,
    public.pickup_first_name(child.name),
    pass.person_name,
    pass.person_relation,
    pass.pickup_date,
    to_char(pass.window_start, 'HH24:MI'),
    to_char(pass.window_end, 'HH24:MI'),
    case
      when pass.revoked_at is not null then 'revoked'
      when pass.used_at is not null then 'used'
      when pass.expires_at <= now() then 'expired'
      when pass.starts_at > now() then 'scheduled'
      else 'active'
    end,
    pass.expires_at
  from public.pickup_passes pass
  join public.children child on child.id = pass.child_id
  where public.is_guardian(pass.child_id) or public.is_admin_for_child(pass.child_id)
  order by pass.pickup_date desc, pass.created_at desc
$$;

create or replace function public.list_pickup_notices()
returns table (
  notice_id uuid,
  child_id uuid,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select notice.id, notice.child_id, notice.body, notice.created_at
  from public.pickup_notices notice
  where notice.profile_id = public.current_profile_id()
  order by notice.created_at desc
  limit 30
$$;

create or replace function public.list_pickup_options(target_child_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
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

create or replace function public.create_pickup_pass(
  target_child_id uuid,
  pickup_date date,
  window_start time,
  window_end time,
  person_name text,
  person_relation text,
  person_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned_name text := regexp_replace(btrim(coalesce(person_name, '')), '\s+', ' ', 'g');
  cleaned_relation text := regexp_replace(btrim(coalesce(person_relation, '')), '\s+', ' ', 'g');
  cleaned_phone text;
  organization_id uuid;
  token text;
  code text;
  token_digest text;
  code_digest text;
  saved_id uuid;
  attempt integer;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not public.is_guardian(target_child_id) then
    raise exception 'Bara en vårdnadshavare kan skapa ett hämtpass';
  end if;
  if pickup_date is null or window_start is null or window_end is null then
    raise exception 'Välj datum och tidsfönster';
  end if;
  if pickup_date < public.pickup_stockholm_today() or pickup_date > public.pickup_stockholm_today() + 14 then
    raise exception 'Välj ett datum från idag och högst 14 dagar framåt';
  end if;
  if window_end <= window_start then
    raise exception 'Sluttiden måste vara efter starttiden';
  end if;
  if char_length(cleaned_name) < 1 or char_length(cleaned_name) > 80 then
    raise exception 'Skriv personens namn';
  end if;
  if char_length(cleaned_relation) < 1 or char_length(cleaned_relation) > 80 then
    raise exception 'Skriv relationen';
  end if;
  cleaned_phone := public.pickup_clean_phone(person_phone);
  if public.pickup_name_blocked(target_child_id, cleaned_name) then
    raise exception 'Personen får ej hämta';
  end if;

  select preschool.organization_id into organization_id
  from public.children child
  join public.departments department on department.id = child.department_id
  join public.preschools preschool on preschool.id = department.preschool_id
  where child.id = target_child_id;
  if organization_id is null then raise exception 'Barnet saknar skola'; end if;

  for attempt in 1..8 loop
    token := encode(gen_random_bytes(32), 'hex');
    code := public.pickup_short_code(token);
    token_digest := public.pickup_secret_hash(token);
    code_digest := public.pickup_secret_hash(code);
    exit when not exists (
      select 1
      from public.pickup_passes existing
      where existing.token_hash = token_digest
         or (
           existing.short_code_hash = code_digest
           and existing.used_at is null
           and existing.revoked_at is null
           and existing.expires_at > now()
         )
    );
    token := null;
  end loop;
  if token is null then raise exception 'Hämtpasset kunde inte skapas. Försök igen.'; end if;

  insert into public.pickup_passes (
    organization_id, child_id, issued_by, pickup_date, window_start, window_end,
    starts_at, expires_at, person_name, person_relation, person_phone, token_hash, short_code_hash
  ) values (
    organization_id,
    target_child_id,
    public.current_profile_id(),
    pickup_date,
    window_start,
    window_end,
    (pickup_date + window_start) at time zone 'Europe/Stockholm',
    (pickup_date + window_end) at time zone 'Europe/Stockholm',
    cleaned_name,
    cleaned_relation,
    cleaned_phone,
    token_digest,
    code_digest
  )
  returning id into saved_id;

  return jsonb_build_object(
    'pass_id', saved_id,
    'token', token,
    'short_code', code,
    'pickup_date', pickup_date,
    'window_start', to_char(window_start, 'HH24:MI'),
    'window_end', to_char(window_end, 'HH24:MI')
  );
end;
$$;

create or replace function public.revoke_pickup_pass(target_pass_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pass public.pickup_passes;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  select * into pass from public.pickup_passes where id = target_pass_id for update;
  if pass.id is null then raise exception 'Hämtpasset finns inte'; end if;
  if not public.is_guardian(pass.child_id) then
    raise exception 'Bara en vårdnadshavare kan återkalla hämtpasset';
  end if;
  if pass.used_at is not null then raise exception 'Hämtpasset är redan använt'; end if;
  if pass.revoked_at is null then
    update public.pickup_passes
    set revoked_at = now(), revoked_by = public.current_profile_id()
    where id = pass.id;
  end if;
end;
$$;

create or replace function public.verify_pickup_token(presented_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  presented text := lower(btrim(coalesce(presented_token, '')));
  pass public.pickup_passes;
  ids uuid[];
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;

  if presented ~ '^[0-9a-f]{64}$' then
    select * into pass
    from public.pickup_passes
    where token_hash = public.pickup_secret_hash(presented);
    if pass.id is null then
      return jsonb_build_object('ok', false, 'stop', 'unavailable');
    end if;
    return public.pickup_verify_row(pass);
  end if;

  if presented ~ '^[0-9]{6}$' then
    ids := array(
      select existing.id
      from public.pickup_passes existing
      where existing.short_code_hash = public.pickup_secret_hash(presented)
        and existing.used_at is null
        and existing.revoked_at is null
        and existing.expires_at > now()
    );
    if cardinality(ids) > 1 then
      return jsonb_build_object('ok', false, 'stop', 'ambiguous');
    end if;
    if cardinality(ids) = 1 then
      select * into pass from public.pickup_passes where id = ids[1];
      return public.pickup_verify_row(pass);
    end if;
    ids := array(
      select existing.id
      from public.pickup_passes existing
      where existing.short_code_hash = public.pickup_secret_hash(presented)
    );
    if cardinality(ids) = 1 then
      select * into pass from public.pickup_passes where id = ids[1];
      return public.pickup_verify_row(pass);
    end if;
  end if;

  return jsonb_build_object('ok', false, 'stop', 'unavailable');
end;
$$;

create or replace function public.confirm_pickup(target_pass_id uuid, pickup_method text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pass public.pickup_passes;
  verdict jsonb;
  method text := lower(btrim(coalesce(pickup_method, '')));
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if method not in ('qr', 'code') then raise exception 'Ogiltigt sätt att bekräfta'; end if;
  select * into pass from public.pickup_passes where id = target_pass_id for update;
  if pass.id is null then raise exception 'Hämtpasset kan inte användas'; end if;
  verdict := public.pickup_verify_row(pass);
  if coalesce((verdict->>'ok')::boolean, false) is not true then
    raise exception '%', public.pickup_stop_text(verdict->>'stop');
  end if;

  perform public.pickup_check_out(pass.child_id);
  update public.pickup_passes
  set used_at = now(), used_by = public.current_profile_id()
  where id = pass.id;
  insert into public.pickup_events (child_id, pass_id, staff_id, method, picked_up_by_name, picked_up_by_relation)
  values (pass.child_id, pass.id, public.current_profile_id(), method, pass.person_name, pass.person_relation);
  perform public.pickup_notify(pass.child_id, pass.person_relation, pass.person_name, 'pass');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.manual_pickup_checkout(
  target_child_id uuid,
  pickup_kind text,
  target_contact_id uuid default null,
  target_guardian_id uuid default null,
  pickup_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  kind text := lower(btrim(coalesce(pickup_kind, '')));
  person text;
  person_relation text;
  comment_text text;
  contact public.pickup_contacts;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not (public.is_admin_for_child(target_child_id) or public.is_staff_for_child(target_child_id)) then
    raise exception 'Du saknar behörighet till barnets närvaro';
  end if;

  if kind = 'guardian' then
    select profile.name into person
    from public.child_guardians guardian
    join public.profiles profile on profile.id = guardian.profile_id
    where guardian.child_id = target_child_id
      and guardian.profile_id = target_guardian_id
      and profile.role = 'parent'
      and profile.removed_at is null;
    if person is null then raise exception 'Välj en vårdnadshavare'; end if;
    person_relation := 'Vårdnadshavare';
  elsif kind = 'list' then
    select * into contact
    from public.pickup_contacts
    where id = target_contact_id and child_id = target_child_id;
    if contact.id is null then raise exception 'Välj en person från hämtlistan'; end if;
    if contact.blocked then raise exception 'Personen får ej hämta'; end if;
    person := contact.name;
    person_relation := contact.relation;
  elsif kind = 'other' then
    comment_text := btrim(coalesce(pickup_comment, ''));
    if char_length(comment_text) < 2 or char_length(comment_text) > 200 then
      raise exception 'Skriv en kort kommentar om vem som hämtar';
    end if;
    person := comment_text;
    person_relation := 'Annan';
  else
    raise exception 'Välj vem som hämtar';
  end if;

  if public.pickup_name_blocked(target_child_id, person) then
    raise exception 'Personen får ej hämta';
  end if;

  perform public.pickup_check_out(target_child_id);
  insert into public.pickup_events (child_id, pass_id, staff_id, method, picked_up_by_name, picked_up_by_relation)
  values (target_child_id, null, public.current_profile_id(), 'manual', person, person_relation);
  perform public.pickup_notify(target_child_id, person_relation, person, 'manual');
end;
$$;

-- The only function anonymous callers may execute.
-- Returns the child's first name, the date, and the QR payload.
-- Does not accept the 6-digit code.
create or replace function public.get_pass_by_token(pass_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  presented text := lower(btrim(coalesce(pass_token, '')));
  headers jsonb;
  forwarded text;
  pass public.pickup_passes;
  first_name text;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    headers := null;
  end;
  if headers is not null then
    forwarded := nullif(btrim(split_part(coalesce(headers->>'x-forwarded-for', headers->>'cf-connecting-ip', ''), ',', 1)), '');
    if forwarded is not null then
      perform public.pickup_rate_limit('ip:' || left(forwarded, 80), 100, 60);
    end if;
  end if;
  perform public.pickup_rate_limit('token:' || public.pickup_secret_hash(presented), 20, 600);

  if presented !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false);
  end if;

  select * into pass
  from public.pickup_passes
  where token_hash = public.pickup_secret_hash(presented);
  if pass.id is null
     or pass.revoked_at is not null
     or pass.used_at is not null
     or pass.expires_at <= now()
     or pass.person_name is null then
    return jsonb_build_object('ok', false);
  end if;

  select public.pickup_first_name(name) into first_name
  from public.children
  where id = pass.child_id;

  return jsonb_build_object(
    'ok', true,
    'first_name', first_name,
    'pickup_date', pass.pickup_date,
    'qr_payload', presented
  );
end;
$$;

-- Clears the pickup person's name and phone seven days after the pass expires.
-- The pass row and the append-only event remain. Schedule this with an existing
-- database scheduler if one is already available. The signed-in app also calls it.
-- No external cron service is added by this migration.
create or replace function public.purge_expired_pickup_details()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pickup_passes
  set person_name = null, person_phone = null
  where expires_at < now() - interval '7 days'
    and (person_name is not null or person_phone is not null);
end;
$$;

revoke all on function public.pickup_secret_hash(text) from public, anon, authenticated;
revoke all on function public.pickup_short_code(text) from public, anon, authenticated;
revoke all on function public.pickup_normalize_name(text) from public, anon, authenticated;
revoke all on function public.pickup_first_name(text) from public, anon, authenticated;
revoke all on function public.pickup_stockholm_today() from public, anon, authenticated;
revoke all on function public.pickup_clean_phone(text) from public, anon, authenticated;
revoke all on function public.pickup_name_blocked(uuid, text) from public, anon, authenticated;
revoke all on function public.pickup_child_checked_in(uuid) from public, anon, authenticated;
revoke all on function public.pickup_stop_text(text) from public, anon, authenticated;
revoke all on function public.pickup_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.pickup_check_out(uuid) from public, anon, authenticated;
revoke all on function public.pickup_notice_body(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.pickup_notify(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.pickup_verify_row(public.pickup_passes) from public, anon, authenticated;

revoke all on function public.save_pickup_contact(uuid, text, text, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.delete_pickup_contact(uuid) from public, anon, authenticated;
revoke all on function public.set_pickup_contact_block(uuid, boolean) from public, anon, authenticated;
revoke all on function public.list_pickup_contacts() from public, anon, authenticated;
revoke all on function public.list_pickup_passes() from public, anon, authenticated;
revoke all on function public.list_pickup_notices() from public, anon, authenticated;
revoke all on function public.list_pickup_options(uuid) from public, anon, authenticated;
revoke all on function public.create_pickup_pass(uuid, date, time, time, text, text, text) from public, anon, authenticated;
revoke all on function public.revoke_pickup_pass(uuid) from public, anon, authenticated;
revoke all on function public.verify_pickup_token(text) from public, anon, authenticated;
revoke all on function public.confirm_pickup(uuid, text) from public, anon, authenticated;
revoke all on function public.manual_pickup_checkout(uuid, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_pass_by_token(text) from public, anon, authenticated;
revoke all on function public.purge_expired_pickup_details() from public, anon, authenticated;

grant execute on function public.save_pickup_contact(uuid, text, text, text, uuid, boolean) to authenticated;
grant execute on function public.delete_pickup_contact(uuid) to authenticated;
grant execute on function public.set_pickup_contact_block(uuid, boolean) to authenticated;
grant execute on function public.list_pickup_contacts() to authenticated;
grant execute on function public.list_pickup_passes() to authenticated;
grant execute on function public.list_pickup_notices() to authenticated;
grant execute on function public.list_pickup_options(uuid) to authenticated;
grant execute on function public.create_pickup_pass(uuid, date, time, time, text, text, text) to authenticated;
grant execute on function public.revoke_pickup_pass(uuid) to authenticated;
grant execute on function public.verify_pickup_token(text) to authenticated;
grant execute on function public.confirm_pickup(uuid, text) to authenticated;
grant execute on function public.manual_pickup_checkout(uuid, text, uuid, uuid, text) to authenticated;
grant execute on function public.get_pass_by_token(text) to anon, authenticated;
grant execute on function public.purge_expired_pickup_details() to authenticated;
