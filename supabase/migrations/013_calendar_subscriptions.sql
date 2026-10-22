-- Guardian calendar subscriptions for published school terms.
-- Stores only a SHA-256 hash of the feed token. The raw token is returned once
-- by create_or_rotate_calendar_feed and is never written to a table.
-- Run in the Supabase SQL editor after approval. Do not drop legacy calendar tables.

begin;

create extension if not exists pgcrypto;

create table if not exists public.calendar_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_fetched_at timestamptz,
  constraint calendar_subscriptions_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$')
);

create unique index if not exists calendar_subscriptions_token_hash_key
  on public.calendar_subscriptions (token_hash);

create unique index if not exists calendar_subscriptions_one_active_feed
  on public.calendar_subscriptions (profile_id)
  where revoked_at is null;

alter table public.calendar_subscriptions enable row level security;

revoke all on table public.calendar_subscriptions from public, anon, authenticated;

-- One active feed per guardian. Rotating revokes the previous row in the same transaction.
create or replace function public.create_or_rotate_calendar_feed()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller_id uuid := public.current_profile_id();
  raw_token text;
  hashed text;
begin
  if auth.uid() is null or caller_id is null or public.current_role() is distinct from 'parent' then
    raise exception 'Endast en vårdnadshavare kan skapa en kalenderlänk';
  end if;
  perform pg_advisory_xact_lock(hashtext('calendar-feed'), hashtext(caller_id::text));
  raw_token := translate(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  hashed := encode(digest(convert_to(raw_token, 'UTF8'), 'sha256'), 'hex');
  update public.calendar_subscriptions
  set revoked_at = now()
  where profile_id = caller_id
    and revoked_at is null;
  insert into public.calendar_subscriptions (profile_id, token_hash)
  values (caller_id, hashed);
  return raw_token;
end;
$$;

create or replace function public.revoke_calendar_feed()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := public.current_profile_id();
begin
  if auth.uid() is null or caller_id is null or public.current_role() is distinct from 'parent' then
    raise exception 'Endast en vårdnadshavare kan stänga av en kalenderlänk';
  end if;
  update public.calendar_subscriptions
  set revoked_at = now()
  where profile_id = caller_id
    and revoked_at is null;
  if not found then
    raise exception 'Det finns ingen aktiv kalenderlänk';
  end if;
end;
$$;

create or replace function public.calendar_feed_status()
returns table (active boolean, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := public.current_profile_id();
  active_since timestamptz;
begin
  if auth.uid() is null or caller_id is null or public.current_role() is distinct from 'parent' then
    raise exception 'Endast en vårdnadshavare kan se kalenderlänken';
  end if;
  select subscription.created_at
    into active_since
  from public.calendar_subscriptions subscription
  where subscription.profile_id = caller_id
    and subscription.revoked_at is null;
  active := found;
  created_at := active_since;
  return next;
end;
$$;

-- Called by the term-feed Edge Function with the service role. The hash is the
-- only lookup key. A match returns published terms and closures for every school
-- where this guardian has a child. Child names and weekly schedules are omitted.
-- Execute is granted only to service_role, never to anon or authenticated.
-- last_fetched_at is updated here so the function does not need a table grant.
create or replace function public.lookup_calendar_feed(token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  subscription_id uuid;
  guardian_id uuid;
begin
  if token_hash is null or token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('found', false);
  end if;

  select subscription.id, subscription.profile_id
    into subscription_id, guardian_id
  from public.calendar_subscriptions subscription
  where subscription.token_hash = lookup_calendar_feed.token_hash
    and subscription.revoked_at is null;

  if subscription_id is null then
    return jsonb_build_object('found', false);
  end if;

  update public.calendar_subscriptions
  set last_fetched_at = now()
  where id = subscription_id;

  return jsonb_build_object(
    'found', true,
    'schools', coalesce((
      select jsonb_agg(school_row order by school_row ->> 'name')
      from (
        select jsonb_build_object(
          'id', school.id,
          'name', school.name,
          'terms', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', term.id,
                'name', term.name,
                'starts_on', term.starts_on,
                'ends_on', term.ends_on,
                'opens_at', to_char(term.opens_at, 'HH24:MI'),
                'closes_at', to_char(term.closes_at, 'HH24:MI'),
                'updated_at', term.updated_at,
                'closures', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'date', closure.closure_date,
                      'reason', closure.reason
                    )
                    order by closure.closure_date
                  )
                  from public.school_term_closures closure
                  where closure.term_id = term.id
                ), '[]'::jsonb)
              )
              order by term.starts_on, term.name
            )
            from public.school_terms term
            where term.preschool_id = school.id
              and term.status = 'published'
          ), '[]'::jsonb)
        ) as school_row
        from public.preschools school
        where exists (
          select 1
          from public.departments department
          join public.children child on child.department_id = department.id
          join public.child_guardians guardian on guardian.child_id = child.id
          where department.preschool_id = school.id
            and guardian.profile_id = guardian_id
        )
      ) schools
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.create_or_rotate_calendar_feed() from public, anon, authenticated;
revoke all on function public.revoke_calendar_feed() from public, anon, authenticated;
revoke all on function public.calendar_feed_status() from public, anon, authenticated;
revoke all on function public.lookup_calendar_feed(text) from public, anon, authenticated;

grant execute on function public.create_or_rotate_calendar_feed() to authenticated;
grant execute on function public.revoke_calendar_feed() to authenticated;
grant execute on function public.calendar_feed_status() to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.lookup_calendar_feed(text) to service_role';
  end if;
end $$;

-- Legacy Arthur tables are unused. Remove the open grants without dropping data.
do $$
declare
  legacy_table text;
begin
  foreach legacy_table in array array['calendar_feeds', 'calendar_events']
  loop
    if to_regclass('public.' || legacy_table) is not null then
      execute format(
        'revoke all on table public.%I from public, anon, authenticated',
        legacy_table
      );
    end if;
  end loop;
end $$;

commit;
