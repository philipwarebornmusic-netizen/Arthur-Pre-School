-- Permanent pickup passes for trusted adults who already får hämta.
-- Additive only. Do not run this file until it has been reviewed.
-- It does not change one-day pickup_passes rows or their create, revoke,
-- confirm, or verify-row functions.
--
-- A pass is tied to one pickup_contacts row, and optionally to the same
-- person's other allowed contacts on children of the same guardian.
-- "Får hämta" means the contact row still exists and is not blocked.
-- The token and the 6-digit code are stored only as sha256 hashes.
-- Anonymous callers can open the public link, with the same rate limit as
-- get_pass_by_token, and still cannot look a pass up by the short code.

create extension if not exists pgcrypto;

create table if not exists public.permanent_pickup_passes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  issued_by uuid not null references public.profiles(id) on delete restrict,
  ends_on date,
  token_hash text not null unique check (char_length(token_hash) = 64),
  short_code_hash text not null check (char_length(short_code_hash) = 64),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.permanent_pickup_pass_children (
  pass_id uuid not null references public.permanent_pickup_passes(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  contact_id uuid references public.pickup_contacts(id) on delete set null,
  primary key (pass_id, child_id)
);

alter table public.pickup_events
  add column if not exists permanent_pass_id uuid references public.permanent_pickup_passes(id) on delete set null;

create index if not exists idx_permanent_pickup_passes_short_code
  on public.permanent_pickup_passes(short_code_hash);
create index if not exists idx_permanent_pickup_pass_children_contact
  on public.permanent_pickup_pass_children(contact_id);
create index if not exists idx_permanent_pickup_pass_children_child
  on public.permanent_pickup_pass_children(child_id);
create index if not exists idx_pickup_events_permanent_pass
  on public.pickup_events(permanent_pass_id);

alter table public.permanent_pickup_passes enable row level security;
alter table public.permanent_pickup_pass_children enable row level security;

revoke all on table public.permanent_pickup_passes from public, anon, authenticated;
revoke all on table public.permanent_pickup_pass_children from public, anon, authenticated;

create or replace function public.pickup_join_names(names text[])
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when names is null or cardinality(names) = 0 then ''
    when cardinality(names) = 1 then names[1]
    else array_to_string(names[1:cardinality(names) - 1], ', ') || ' och ' || names[cardinality(names)]
  end
$$;

create or replace function public.permanent_contact_allowed(target_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pickup_contacts contact
    where contact.id = target_contact_id
      and contact.blocked = false
      and not public.pickup_name_blocked(contact.child_id, contact.name)
  )
$$;

create or replace function public.permanent_pickup_notice_body(
  target_child_id uuid,
  person_relation text,
  person text
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
  stamp := to_char(now() at time zone 'Europe/Stockholm', 'HH24.MI');
  return btrim(coalesce(first_name, '')) || ' hämtades av ' || btrim(coalesce(person_relation, '')) || ' ' || btrim(coalesce(person, '')) || ' ' || stamp;
end;
$$;

create or replace function public.guardian_can_see_permanent_pass(target_pass_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.permanent_pickup_pass_children link
    where link.pass_id = target_pass_id
      and public.is_guardian(link.child_id)
  )
$$;

create or replace function public.list_permanent_pickup_passes()
returns table (
  pass_id uuid,
  contact_name text,
  contact_relation text,
  ends_on date,
  pass_status text,
  child_names text,
  children jsonb
)
language sql
stable
security definer
set search_path = public
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
    ), '[]'::jsonb)
  from public.permanent_pickup_passes pass
  where public.guardian_can_see_permanent_pass(pass.id)
  order by pass.created_at desc
$$;

create or replace function public.create_permanent_pickup_pass(
  target_contact_id uuid,
  ends_on date default null,
  include_linked boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  source public.pickup_contacts;
  saved_organization uuid;
  token text;
  code text;
  token_digest text;
  code_digest text;
  saved_id uuid;
  attempt integer;
  linked_contact public.pickup_contacts;
  chosen_children uuid[] := '{}';
  chosen_contacts uuid[] := '{}';
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  select * into source from public.pickup_contacts where id = target_contact_id;
  if source.id is null then raise exception 'Personen finns inte på hämtlistan'; end if;
  if not public.is_guardian(source.child_id) then
    raise exception 'Bara en vårdnadshavare kan skapa ett permanent hämtpass';
  end if;
  if source.blocked or public.pickup_name_blocked(source.child_id, source.name) then
    raise exception 'Personen får ej hämta';
  end if;
  if ends_on is not null and ends_on < public.pickup_stockholm_today() then
    raise exception 'Slutdatumet kan inte vara tidigare än idag';
  end if;
  if ends_on is not null and ends_on > public.pickup_stockholm_today() + 1825 then
    raise exception 'Slutdatumet kan vara högst fem år framåt';
  end if;

  select preschool.organization_id into saved_organization
  from public.children child
  join public.departments department on department.id = child.department_id
  join public.preschools preschool on preschool.id = department.preschool_id
  where child.id = source.child_id;
  if saved_organization is null then raise exception 'Barnet saknar skola'; end if;

  chosen_children := array[source.child_id];
  chosen_contacts := array[source.id];

  if coalesce(include_linked, false) then
    for linked_contact in
      select contact.*
      from public.pickup_contacts contact
      join public.children child on child.id = contact.child_id
      join public.departments department on department.id = child.department_id
      join public.preschools preschool on preschool.id = department.preschool_id
      where contact.id <> source.id
        and contact.blocked = false
        and preschool.organization_id = saved_organization
        and public.is_guardian(contact.child_id)
        and public.pickup_normalize_name(contact.name) = public.pickup_normalize_name(source.name)
        and public.pickup_normalize_name(contact.relation) = public.pickup_normalize_name(source.relation)
        and not public.pickup_name_blocked(contact.child_id, contact.name)
    loop
      if linked_contact.child_id = any(chosen_children) then
        continue;
      end if;
      chosen_children := chosen_children || linked_contact.child_id;
      chosen_contacts := chosen_contacts || linked_contact.id;
    end loop;
  end if;

  if exists (
    select 1
    from public.permanent_pickup_pass_children link
    join public.permanent_pickup_passes existing on existing.id = link.pass_id
    where link.contact_id = any(chosen_contacts)
      and existing.revoked_at is null
      and (existing.ends_on is null or existing.ends_on >= public.pickup_stockholm_today())
      and public.permanent_contact_allowed(link.contact_id)
  ) then
    raise exception 'Det finns redan ett permanent hämtpass för den här personen';
  end if;

  for attempt in 1..8 loop
    token := encode(extensions.gen_random_bytes(32), 'hex');
    code := public.pickup_short_code(token);
    token_digest := public.pickup_secret_hash(token);
    code_digest := public.pickup_secret_hash(code);
    exit when not exists (
      select 1 from public.pickup_passes existing where existing.token_hash = token_digest
    ) and not exists (
      select 1 from public.permanent_pickup_passes existing where existing.token_hash = token_digest
    ) and not exists (
      select 1
      from public.pickup_passes existing
      where existing.short_code_hash = code_digest
        and existing.used_at is null
        and existing.revoked_at is null
        and existing.expires_at > now()
    ) and not exists (
      select 1
      from public.permanent_pickup_passes existing
      where existing.short_code_hash = code_digest
        and existing.revoked_at is null
        and (existing.ends_on is null or existing.ends_on >= public.pickup_stockholm_today())
    );
    token := null;
  end loop;
  if token is null then raise exception 'Hämtpasset kunde inte skapas. Försök igen.'; end if;

  insert into public.permanent_pickup_passes (organization_id, issued_by, ends_on, token_hash, short_code_hash)
  values (saved_organization, public.current_profile_id(), ends_on, token_digest, code_digest)
  returning id into saved_id;

  insert into public.permanent_pickup_pass_children (pass_id, child_id, contact_id)
  select saved_id, choice.child_id, choice.contact_id
  from unnest(chosen_children, chosen_contacts) as choice(child_id, contact_id);

  return jsonb_build_object(
    'pass_id', saved_id,
    'token', token,
    'short_code', code,
    'permanent', true,
    'ends_on', ends_on
  );
end;
$$;

create or replace function public.revoke_permanent_pickup_pass(target_pass_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pass public.permanent_pickup_passes;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  select * into pass from public.permanent_pickup_passes where id = target_pass_id for update;
  if pass.id is null then raise exception 'Hämtpasset finns inte'; end if;
  if not public.guardian_can_see_permanent_pass(pass.id) then
    raise exception 'Bara en vårdnadshavare kan återkalla hämtpasset';
  end if;
  if pass.revoked_at is null then
    update public.permanent_pickup_passes
    set revoked_at = now(), revoked_by = public.current_profile_id()
    where id = pass.id;
  end if;
end;
$$;

create or replace function public.regenerate_permanent_pickup_pass(target_pass_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pass public.permanent_pickup_passes;
  token text;
  code text;
  token_digest text;
  code_digest text;
  attempt integer;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  select * into pass from public.permanent_pickup_passes where id = target_pass_id for update;
  if pass.id is null then raise exception 'Hämtpasset finns inte'; end if;
  if not public.guardian_can_see_permanent_pass(pass.id) then
    raise exception 'Bara en vårdnadshavare kan skapa en ny kod';
  end if;
  if pass.revoked_at is not null then raise exception 'Hämtpasset är återkallat'; end if;
  if pass.ends_on is not null and pass.ends_on < public.pickup_stockholm_today() then
    raise exception 'Hämtpasset har gått ut';
  end if;
  if not exists (
    select 1
    from public.permanent_pickup_pass_children link
    where link.pass_id = pass.id
      and public.permanent_contact_allowed(link.contact_id)
  ) then
    raise exception 'Personen får ej hämta';
  end if;

  for attempt in 1..8 loop
    token := encode(extensions.gen_random_bytes(32), 'hex');
    code := public.pickup_short_code(token);
    token_digest := public.pickup_secret_hash(token);
    code_digest := public.pickup_secret_hash(code);
    exit when token_digest <> pass.token_hash
      and not exists (select 1 from public.pickup_passes existing where existing.token_hash = token_digest)
      and not exists (select 1 from public.permanent_pickup_passes existing where existing.token_hash = token_digest)
      and not exists (
        select 1
        from public.pickup_passes existing
        where existing.short_code_hash = code_digest
          and existing.used_at is null
          and existing.revoked_at is null
          and existing.expires_at > now()
      )
      and not exists (
        select 1
        from public.permanent_pickup_passes existing
        where existing.id <> pass.id
          and existing.short_code_hash = code_digest
          and existing.revoked_at is null
          and (existing.ends_on is null or existing.ends_on >= public.pickup_stockholm_today())
      );
    token := null;
  end loop;
  if token is null then raise exception 'Hämtpasset kunde inte skapas. Försök igen.'; end if;

  update public.permanent_pickup_passes
  set token_hash = token_digest, short_code_hash = code_digest
  where id = pass.id;

  return jsonb_build_object(
    'pass_id', pass.id,
    'token', token,
    'short_code', code,
    'permanent', true,
    'ends_on', pass.ends_on
  );
end;
$$;

create or replace function public.permanent_pickup_verify(target_pass_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pass public.permanent_pickup_passes;
  allowed jsonb := '[]'::jsonb;
  contact_name text;
  contact_relation text;
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

  select contact.name, contact.relation into contact_name, contact_relation
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
    'children', allowed,
    'issued_by', issuer_name,
    'issued_at', pass.created_at,
    'ends_on', pass.ends_on,
    'ask_for_id', true
  );
end;
$$;

create or replace function public.confirm_permanent_pickup(
  target_pass_id uuid,
  target_child_id uuid,
  pickup_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pass public.permanent_pickup_passes;
  chosen public.pickup_contacts;
  scan_method text := lower(btrim(coalesce(pickup_method, '')));
  child_name text;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if scan_method not in ('qr', 'code') then raise exception 'Ogiltigt sätt att bekräfta'; end if;
  if not (public.is_admin_for_child(target_child_id) or public.is_staff_for_child(target_child_id)) then
    raise exception 'Du saknar behörighet till barnets närvaro';
  end if;

  select * into pass from public.permanent_pickup_passes where id = target_pass_id for update;
  if pass.id is null or pass.revoked_at is not null then raise exception 'Hämtpasset är återkallat'; end if;
  if pass.ends_on is not null and pass.ends_on < public.pickup_stockholm_today() then
    raise exception 'Hämtpasset har gått ut';
  end if;

  select found.* into chosen
  from public.permanent_pickup_pass_children link
  join public.pickup_contacts found on found.id = link.contact_id
  where link.pass_id = pass.id
    and link.child_id = target_child_id;
  if chosen.id is null then raise exception 'Personen finns inte längre på hämtlistan'; end if;
  if not public.permanent_contact_allowed(chosen.id) then raise exception 'Personen får ej hämta'; end if;

  perform public.pickup_check_out(target_child_id);
  insert into public.pickup_events (
    child_id, pass_id, permanent_pass_id, staff_id, method, picked_up_by_name, picked_up_by_relation
  ) values (
    target_child_id, null, pass.id, public.current_profile_id(), scan_method, chosen.name, chosen.relation
  );
  insert into public.pickup_notices (profile_id, child_id, body)
  select guardian.profile_id, target_child_id, public.permanent_pickup_notice_body(target_child_id, chosen.relation, chosen.name)
  from public.child_guardians guardian
  join public.profiles profile on profile.id = guardian.profile_id
  where guardian.child_id = target_child_id
    and profile.role = 'parent'
    and profile.removed_at is null;

  select name into child_name from public.children where id = target_child_id;
  return jsonb_build_object('ok', true, 'child_name', child_name);
end;
$$;

-- Staff lookup accepts the same token or 6-digit code as a one-day pass.
-- A one-day match is returned exactly as before. A permanent pass is considered
-- only when it does not have to compete with another live code.
create or replace function public.verify_pickup_token(presented_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  presented text := lower(btrim(coalesce(presented_token, '')));
  pass public.pickup_passes;
  permanent_id uuid;
  one_time_active uuid[];
  permanent_active uuid[];
  one_time_any uuid[];
  permanent_any uuid[];
  code_digest text;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;

  if presented ~ '^[0-9a-f]{64}$' then
    select * into pass
    from public.pickup_passes
    where token_hash = public.pickup_secret_hash(presented);
    if pass.id is not null then
      return public.pickup_verify_row(pass);
    end if;
    select existing.id into permanent_id
    from public.permanent_pickup_passes existing
    where existing.token_hash = public.pickup_secret_hash(presented);
    if permanent_id is not null then
      return public.permanent_pickup_verify(permanent_id);
    end if;
    return jsonb_build_object('ok', false, 'stop', 'unavailable');
  end if;

  if presented ~ '^[0-9]{6}$' then
    code_digest := public.pickup_secret_hash(presented);
    one_time_active := array(
      select existing.id
      from public.pickup_passes existing
      where existing.short_code_hash = code_digest
        and existing.used_at is null
        and existing.revoked_at is null
        and existing.expires_at > now()
    );
    permanent_active := array(
      select existing.id
      from public.permanent_pickup_passes existing
      where existing.short_code_hash = code_digest
        and existing.revoked_at is null
        and (existing.ends_on is null or existing.ends_on >= public.pickup_stockholm_today())
        and exists (
          select 1
          from public.permanent_pickup_pass_children link
          where link.pass_id = existing.id
            and public.permanent_contact_allowed(link.contact_id)
        )
    );
    if coalesce(cardinality(one_time_active), 0) + coalesce(cardinality(permanent_active), 0) > 1 then
      return jsonb_build_object('ok', false, 'stop', 'ambiguous');
    end if;
    if coalesce(cardinality(one_time_active), 0) = 1 then
      select * into pass from public.pickup_passes where id = one_time_active[1];
      return public.pickup_verify_row(pass);
    end if;
    if coalesce(cardinality(permanent_active), 0) = 1 then
      return public.permanent_pickup_verify(permanent_active[1]);
    end if;

    one_time_any := array(
      select existing.id from public.pickup_passes existing where existing.short_code_hash = code_digest
    );
    permanent_any := array(
      select existing.id from public.permanent_pickup_passes existing where existing.short_code_hash = code_digest
    );
    if coalesce(cardinality(one_time_any), 0) = 1 and coalesce(cardinality(permanent_any), 0) = 0 then
      select * into pass from public.pickup_passes where id = one_time_any[1];
      return public.pickup_verify_row(pass);
    end if;
    if coalesce(cardinality(permanent_any), 0) = 1 and coalesce(cardinality(one_time_any), 0) = 0 then
      return public.permanent_pickup_verify(permanent_any[1]);
    end if;
  end if;

  return jsonb_build_object('ok', false, 'stop', 'unavailable');
end;
$$;

-- Public link. Same rate limit and same refusal of the 6-digit code.
-- One-day passes keep their previous response. A permanent pass adds
-- permanent=true and no contact name.
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
  permanent public.permanent_pickup_passes;
  first_name text;
  names text[];
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
  if pass.id is not null then
    if pass.revoked_at is not null
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
  end if;

  select * into permanent
  from public.permanent_pickup_passes
  where token_hash = public.pickup_secret_hash(presented);
  if permanent.id is null
     or permanent.revoked_at is not null
     or (permanent.ends_on is not null and permanent.ends_on < public.pickup_stockholm_today()) then
    return jsonb_build_object('ok', false);
  end if;

  select array_agg(public.pickup_first_name(child.name) order by child.name)
  into names
  from public.permanent_pickup_pass_children link
  join public.children child on child.id = link.child_id
  where link.pass_id = permanent.id
    and public.permanent_contact_allowed(link.contact_id);
  if names is null or cardinality(names) = 0 then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'permanent', true,
    'first_name', public.pickup_join_names(names),
    'ends_on', permanent.ends_on,
    'qr_payload', presented
  );
end;
$$;

revoke all on function public.pickup_join_names(text[]) from public, anon, authenticated;
revoke all on function public.permanent_contact_allowed(uuid) from public, anon, authenticated;
revoke all on function public.permanent_pickup_notice_body(uuid, text, text) from public, anon, authenticated;
revoke all on function public.guardian_can_see_permanent_pass(uuid) from public, anon, authenticated;
revoke all on function public.permanent_pickup_verify(uuid) from public, anon, authenticated;
revoke all on function public.list_permanent_pickup_passes() from public, anon, authenticated;
revoke all on function public.create_permanent_pickup_pass(uuid, date, boolean) from public, anon, authenticated;
revoke all on function public.revoke_permanent_pickup_pass(uuid) from public, anon, authenticated;
revoke all on function public.regenerate_permanent_pickup_pass(uuid) from public, anon, authenticated;
revoke all on function public.confirm_permanent_pickup(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.verify_pickup_token(text) from public, anon, authenticated;
revoke all on function public.get_pass_by_token(text) from public, anon, authenticated;

grant execute on function public.list_permanent_pickup_passes() to authenticated;
grant execute on function public.create_permanent_pickup_pass(uuid, date, boolean) to authenticated;
grant execute on function public.revoke_permanent_pickup_pass(uuid) to authenticated;
grant execute on function public.regenerate_permanent_pickup_pass(uuid) to authenticated;
grant execute on function public.confirm_permanent_pickup(uuid, uuid, text) to authenticated;
grant execute on function public.verify_pickup_token(text) to authenticated;
grant execute on function public.get_pass_by_token(text) to anon, authenticated;
