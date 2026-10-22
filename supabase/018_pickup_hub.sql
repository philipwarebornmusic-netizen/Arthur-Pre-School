-- Guardian pickup hub. Additive only: existing pass functions stay as they are.
--
-- The raw pass token is stored in pickup_pass_secrets, which has RLS and no
-- policies, and is revoked from public, anon and authenticated. Only
-- remember_pickup_pass_token and reveal_pickup_pass touch it. Reveal requires
-- the caller to be a guardian of that child and the pass to still be usable
-- (one-day: not revoked, not used, not expired, including a pass that has not
-- started yet; permanent: still active). Staff and anon never receive the token.
-- The existing hash columns stay the only secret used by public lookup.
--
-- Day plans and the standard picker sit beside child_weekly_schedules. The
-- weekly schedule remains the source of default drop-off and pickup times.
-- A day is filled when it has times and a picker. Times fall back to the
-- previous week's saved day, then the standard week. A one-day pass is never
-- copied onto another date. Both guardians may edit. Every change is logged.

create table if not exists public.pickup_pass_secrets (
  pass_kind text not null check (pass_kind in ('day', 'permanent')),
  pass_id uuid not null,
  token text not null check (token ~ '^[0-9a-f]{64}$'),
  stored_at timestamptz not null default now(),
  primary key (pass_kind, pass_id)
);

create table if not exists public.pickup_day_plans (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  plan_date date not null,
  dropoff_at time,
  pickup_at time,
  picker_kind text check (picker_kind in ('guardian', 'contact', 'pass')),
  picker_id uuid,
  pass_kind text check (pass_kind in ('day', 'permanent')),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  unique (child_id, plan_date),
  check (
    (picker_kind is null and picker_id is null and pass_kind is null)
    or (picker_kind = 'pass' and picker_id is not null and pass_kind is not null)
    or (picker_kind in ('guardian', 'contact') and picker_id is not null and pass_kind is null)
  ),
  check (
    (dropoff_at is null and pickup_at is null)
    or (dropoff_at is not null and pickup_at is not null and dropoff_at < pickup_at)
  )
);

create table if not exists public.pickup_standard_pickers (
  child_id uuid not null references public.children(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 5),
  picker_kind text not null check (picker_kind in ('guardian', 'contact', 'pass')),
  picker_id uuid not null,
  pass_kind text check (pass_kind in ('day', 'permanent')),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key (child_id, weekday),
  check (
    (picker_kind = 'pass' and pass_kind = 'permanent')
    or (picker_kind in ('guardian', 'contact') and pass_kind is null)
  )
);

create table if not exists public.pickup_day_plan_log (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null,
  plan_date date,
  weekday smallint,
  action text not null check (action in ('day', 'standard', 'copy')),
  detail text not null,
  actor_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pickup_day_plans_child_date on public.pickup_day_plans(child_id, plan_date);
create index if not exists idx_pickup_day_plan_log_child on public.pickup_day_plan_log(child_id, created_at desc);

alter table public.pickup_pass_secrets enable row level security;
alter table public.pickup_day_plans enable row level security;
alter table public.pickup_standard_pickers enable row level security;
alter table public.pickup_day_plan_log enable row level security;

revoke all on table public.pickup_pass_secrets from public, anon, authenticated;
revoke all on table public.pickup_day_plans from public, anon, authenticated;
revoke all on table public.pickup_standard_pickers from public, anon, authenticated;
revoke all on table public.pickup_day_plan_log from public, anon, authenticated;

create or replace function public.forget_pickup_pass_secret()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_table_name = 'pickup_passes' then
    if new.revoked_at is not null or new.used_at is not null then
      delete from public.pickup_pass_secrets where pass_kind = 'day' and pass_id = new.id;
    end if;
  elsif tg_table_name = 'permanent_pickup_passes' then
    if new.revoked_at is not null or new.token_hash is distinct from old.token_hash then
      delete from public.pickup_pass_secrets where pass_kind = 'permanent' and pass_id = new.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists pickup_passes_forget_secret on public.pickup_passes;
create trigger pickup_passes_forget_secret
  after update of revoked_at, used_at on public.pickup_passes
  for each row execute function public.forget_pickup_pass_secret();

drop trigger if exists permanent_passes_forget_secret on public.permanent_pickup_passes;
create trigger permanent_passes_forget_secret
  after update of revoked_at, token_hash on public.permanent_pickup_passes
  for each row execute function public.forget_pickup_pass_secret();

create or replace function public.remember_pickup_pass_token(
  target_pass_id uuid,
  pass_kind text,
  presented_token text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cleaned text := lower(btrim(coalesce(presented_token, '')));
  digest text;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if pass_kind not in ('day', 'permanent') then raise exception 'Okänd typ av hämtpass'; end if;
  if cleaned !~ '^[0-9a-f]{64}$' then raise exception 'Länken kunde inte sparas'; end if;
  digest := public.pickup_secret_hash(cleaned);

  if pass_kind = 'day' then
    if not exists (
      select 1 from public.pickup_passes pass
      where pass.id = target_pass_id
        and pass.token_hash = digest
        and pass.revoked_at is null
        and public.is_guardian(pass.child_id)
    ) then
      raise exception 'Bara en vårdnadshavare kan spara länken till det här hämtpasset';
    end if;
  else
    if not exists (
      select 1 from public.permanent_pickup_passes pass
      where pass.id = target_pass_id
        and pass.token_hash = digest
        and pass.revoked_at is null
        and public.guardian_can_see_permanent_pass(pass.id)
    ) then
      raise exception 'Bara en vårdnadshavare kan spara länken till det här hämtpasset';
    end if;
  end if;

  insert into public.pickup_pass_secrets (pass_kind, pass_id, token)
  values (pass_kind, target_pass_id, cleaned)
  on conflict (pass_kind, pass_id) do update
    set token = excluded.token, stored_at = now();
end;
$$;

create or replace function public.reveal_pickup_pass(
  target_pass_id uuid,
  pass_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  secret text;
  digest text;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if pass_kind not in ('day', 'permanent') then raise exception 'Okänd typ av hämtpass'; end if;

  if pass_kind = 'day' then
    if not exists (
      select 1 from public.pickup_passes pass
      where pass.id = target_pass_id
        and pass.revoked_at is null
        and pass.used_at is null
        and pass.expires_at > now()
        and public.is_guardian(pass.child_id)
    ) then
      raise exception 'Hämtpasset gäller inte längre';
    end if;
  elsif not exists (
    select 1
    from public.permanent_pickup_passes pass
    join public.permanent_pickup_pass_children link on link.pass_id = pass.id
    where pass.id = target_pass_id
      and pass.revoked_at is null
      and (pass.ends_on is null or pass.ends_on >= public.pickup_stockholm_today())
      and public.guardian_can_see_permanent_pass(pass.id)
      and public.permanent_contact_allowed(link.contact_id)
  ) then
    raise exception 'Hämtpasset gäller inte längre';
  end if;

  select token into secret
  from public.pickup_pass_secrets
  where pass_kind = reveal_pickup_pass.pass_kind
    and pass_id = target_pass_id;
  if secret is null then
    raise exception '%', case when pass_kind = 'permanent'
      then 'Länken kan inte visas igen. Välj Ny kod.'
      else 'Länken kan inte visas igen. Skapa passet på nytt.'
    end;
  end if;
  digest := public.pickup_secret_hash(secret);
  if pass_kind = 'day' and not exists (
    select 1 from public.pickup_passes pass where pass.id = target_pass_id and pass.token_hash = digest
  ) then
    raise exception 'Länken kan inte visas igen. Skapa passet på nytt.';
  end if;
  if pass_kind = 'permanent' and not exists (
    select 1 from public.permanent_pickup_passes pass where pass.id = target_pass_id and pass.token_hash = digest
  ) then
    raise exception 'Länken kan inte visas igen. Välj Ny kod.';
  end if;
  return jsonb_build_object('token', secret);
end;
$$;

create or replace function public.pickup_picker_problem(
  target_child_id uuid,
  plan_date date,
  picker_kind text,
  picker_id uuid,
  pass_kind text
)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if picker_kind is null or picker_id is null then
    return 'Välj vem som hämtar';
  end if;
  if picker_kind = 'guardian' then
    if pass_kind is not null then return 'Okänd typ av hämtare'; end if;
    if exists (
      select 1
      from public.child_guardians guardian
      join public.profiles profile on profile.id = guardian.profile_id
      where guardian.child_id = target_child_id
        and guardian.profile_id = picker_id
        and profile.role = 'parent'
        and profile.removed_at is null
    ) then
      return null;
    end if;
    return 'Välj en vårdnadshavare till barnet';
  end if;
  if picker_kind = 'contact' then
    if pass_kind is not null then return 'Okänd typ av hämtare'; end if;
    if exists (
      select 1 from public.pickup_contacts contact
      where contact.id = picker_id
        and contact.child_id = target_child_id
        and contact.blocked = false
        and not public.pickup_name_blocked(contact.child_id, contact.name)
    ) then
      return null;
    end if;
    return 'Personen finns inte på hämtlistan eller får ej hämta';
  end if;
  if picker_kind = 'pass' and pass_kind = 'day' then
    if plan_date is null then return 'Ett engångspass kan inte vara standard för hela veckan'; end if;
    if exists (
      select 1 from public.pickup_passes pass
      where pass.id = picker_id
        and pass.child_id = target_child_id
        and pass.pickup_date = plan_date
        and pass.revoked_at is null
        and pass.used_at is null
        and pass.expires_at > now()
    ) then
      return null;
    end if;
    return 'Hämtpasset gäller inte den dagen';
  end if;
  if picker_kind = 'pass' and pass_kind = 'permanent' then
    if exists (
      select 1
      from public.permanent_pickup_passes pass
      join public.permanent_pickup_pass_children link on link.pass_id = pass.id
      where pass.id = picker_id
        and link.child_id = target_child_id
        and pass.revoked_at is null
        and (pass.ends_on is null or pass.ends_on >= coalesce(plan_date, public.pickup_stockholm_today()))
        and public.permanent_contact_allowed(link.contact_id)
    ) then
      return null;
    end if;
    return 'Det permanenta hämtpasset gäller inte';
  end if;
  return 'Okänd typ av hämtare';
end;
$$;

create or replace function public.pickup_picker_label(
  target_child_id uuid,
  picker_kind text,
  picker_id uuid,
  pass_kind text
)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select case
    when picker_kind = 'guardian' then (
      select profile.name from public.profiles profile where profile.id = picker_id
    )
    when picker_kind = 'contact' then (
      select btrim(contact.relation || ' ' || contact.name)
      from public.pickup_contacts contact
      where contact.id = picker_id and contact.child_id = target_child_id
    )
    when picker_kind = 'pass' and pass_kind = 'day' then (
      select btrim(pass.person_relation || ' ' || pass.person_name)
      from public.pickup_passes pass
      where pass.id = picker_id and pass.child_id = target_child_id
    )
    when picker_kind = 'pass' and pass_kind = 'permanent' then (
      select btrim(contact.relation || ' ' || contact.name)
      from public.permanent_pickup_pass_children link
      join public.pickup_contacts contact on contact.id = link.contact_id
      where link.pass_id = picker_id and link.child_id = target_child_id
      limit 1
    )
    else null
  end
$$;

-- Same fallback as the calendar grid: this day's plan, then the previous
-- week's saved day, then the published term's standard week. A one-day pass
-- is kept only on its own date and is not treated as the previous week's picker.
create or replace function public.pickup_effective_plan(
  target_child_id uuid,
  plan_date date
)
returns table (
  in_term boolean,
  closed boolean,
  dropoff_at time,
  pickup_at time,
  picker_kind text,
  picker_id uuid,
  pass_kind text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  preschool uuid;
  term public.school_terms%rowtype;
  day_plan public.pickup_day_plans%rowtype;
  prev_plan public.pickup_day_plans%rowtype;
  standard public.child_weekly_schedules%rowtype;
  standard_picker public.pickup_standard_pickers%rowtype;
  weekday_number integer;
begin
  weekday_number := extract(isodow from plan_date)::integer;
  if weekday_number > 5 then
    return;
  end if;
  select department.preschool_id into preschool
  from public.children child
  join public.departments department on department.id = child.department_id
  where child.id = target_child_id;
  select found.* into term
  from public.school_terms found
  where found.preschool_id = preschool
    and found.status = 'published'
    and plan_date between found.starts_on and found.ends_on
  order by found.starts_on
  limit 1;
  in_term := term.id is not null;
  closed := false;
  if term.id is null then
    return next;
    return;
  end if;
  closed := exists (
    select 1 from public.school_term_closures closure
    where closure.term_id = term.id and closure.closure_date = plan_date
  );
  if closed then
    return next;
    return;
  end if;

  select * into day_plan
  from public.pickup_day_plans found
  where found.child_id = target_child_id and found.plan_date = pickup_effective_plan.plan_date;
  select * into prev_plan
  from public.pickup_day_plans found
  where found.child_id = target_child_id and found.plan_date = pickup_effective_plan.plan_date - 7;
  select * into standard
  from public.child_weekly_schedules found
  where found.child_id = target_child_id and found.term_id = term.id and found.weekday = weekday_number;
  select * into standard_picker
  from public.pickup_standard_pickers found
  where found.child_id = target_child_id and found.weekday = weekday_number;

  if day_plan.dropoff_at is not null and day_plan.pickup_at is not null then
    dropoff_at := day_plan.dropoff_at;
    pickup_at := day_plan.pickup_at;
  elsif prev_plan.dropoff_at is not null and prev_plan.pickup_at is not null then
    dropoff_at := prev_plan.dropoff_at;
    pickup_at := prev_plan.pickup_at;
  elsif coalesce(standard.attending, false) then
    dropoff_at := standard.dropoff_at;
    pickup_at := standard.pickup_at;
  end if;

  if day_plan.picker_kind is not null then
    picker_kind := day_plan.picker_kind;
    picker_id := day_plan.picker_id;
    pass_kind := day_plan.pass_kind;
  elsif prev_plan.picker_kind in ('guardian', 'contact')
     or (prev_plan.picker_kind = 'pass' and prev_plan.pass_kind = 'permanent') then
    picker_kind := prev_plan.picker_kind;
    picker_id := prev_plan.picker_id;
    pass_kind := prev_plan.pass_kind;
  elsif standard_picker.picker_kind is not null then
    picker_kind := standard_picker.picker_kind;
    picker_id := standard_picker.picker_id;
    pass_kind := standard_picker.pass_kind;
  end if;
  return next;
end;
$$;

create or replace function public.list_pickup_calendar(target_child_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not public.is_guardian(target_child_id) then
    raise exception 'Bara en vårdnadshavare kan se hämtningsschemat';
  end if;
  return jsonb_build_object(
    'guardians', coalesce((
      select jsonb_agg(jsonb_build_object('id', profile.id, 'name', profile.name) order by profile.name)
      from public.child_guardians guardian
      join public.profiles profile on profile.id = guardian.profile_id
      where guardian.child_id = target_child_id
        and profile.role = 'parent'
        and profile.removed_at is null
    ), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', contact.id, 'name', contact.name, 'relation', contact.relation
      ) order by contact.name)
      from public.pickup_contacts contact
      where contact.child_id = target_child_id
        and contact.blocked = false
        and not public.pickup_name_blocked(contact.child_id, contact.name)
    ), '[]'::jsonb),
    'day_passes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pass.id,
        'pickup_date', to_char(pass.pickup_date, 'YYYY-MM-DD'),
        'label', btrim(pass.person_relation || ' ' || pass.person_name),
        'status', case when pass.starts_at > now() then 'scheduled' else 'active' end
      ) order by pass.pickup_date)
      from public.pickup_passes pass
      where pass.child_id = target_child_id
        and pass.revoked_at is null
        and pass.used_at is null
        and pass.expires_at > now()
    ), '[]'::jsonb),
    'permanent_passes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pass.id,
        'label', btrim(contact.relation || ' ' || contact.name)
      ) order by contact.name)
      from public.permanent_pickup_passes pass
      join public.permanent_pickup_pass_children link on link.pass_id = pass.id
      join public.pickup_contacts contact on contact.id = link.contact_id
      where link.child_id = target_child_id
        and pass.revoked_at is null
        and (pass.ends_on is null or pass.ends_on >= public.pickup_stockholm_today())
        and public.permanent_contact_allowed(link.contact_id)
    ), '[]'::jsonb),
    'day_plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'plan_date', to_char(plan.plan_date, 'YYYY-MM-DD'),
        'dropoff_at', to_char(plan.dropoff_at, 'HH24:MI'),
        'pickup_at', to_char(plan.pickup_at, 'HH24:MI'),
        'picker_kind', plan.picker_kind,
        'picker_id', plan.picker_id,
        'pass_kind', plan.pass_kind
      ) order by plan.plan_date)
      from public.pickup_day_plans plan
      where plan.child_id = target_child_id
    ), '[]'::jsonb),
    'standard_pickers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', picker.weekday,
        'picker_kind', picker.picker_kind,
        'picker_id', picker.picker_id,
        'pass_kind', picker.pass_kind
      ) order by picker.weekday)
      from public.pickup_standard_pickers picker
      where picker.child_id = target_child_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.save_pickup_day(
  target_child_id uuid,
  plan_date date,
  dropoff_at time,
  pickup_at time,
  picker_kind text,
  picker_id uuid,
  pass_kind text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  preschool uuid;
  term public.school_terms%rowtype;
  problem text;
  label text;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not public.is_guardian(target_child_id) then
    raise exception 'Bara en vårdnadshavare kan ändra hämtningen';
  end if;
  if plan_date is null or dropoff_at is null or pickup_at is null then
    raise exception 'Fyll i dag och tider';
  end if;
  if extract(isodow from plan_date)::integer > 5 then
    raise exception 'Hämtning planeras på vardagar';
  end if;
  select department.preschool_id into preschool
  from public.children child
  join public.departments department on department.id = child.department_id
  where child.id = target_child_id;
  select found.* into term
  from public.school_terms found
  where found.preschool_id = preschool
    and found.status = 'published'
    and plan_date between found.starts_on and found.ends_on
  order by found.starts_on
  limit 1;
  if term.id is null then raise exception 'Dagen ligger utanför terminen'; end if;
  if exists (
    select 1 from public.school_term_closures closure
    where closure.term_id = term.id and closure.closure_date = plan_date
  ) then
    raise exception 'Förskolan är stängd den dagen';
  end if;
  if dropoff_at >= pickup_at or dropoff_at < term.opens_at or pickup_at > term.closes_at then
    raise exception 'Tiderna måste ligga inom förskolans öppettider';
  end if;
  problem := public.pickup_picker_problem(target_child_id, plan_date, picker_kind, picker_id, pass_kind);
  if problem is not null then raise exception '%', problem; end if;

  insert into public.pickup_day_plans (
    child_id, plan_date, dropoff_at, pickup_at, picker_kind, picker_id, pass_kind, updated_by
  ) values (
    target_child_id, plan_date, dropoff_at, pickup_at, picker_kind, picker_id, pass_kind, public.current_profile_id()
  )
  on conflict (child_id, plan_date) do update set
    dropoff_at = excluded.dropoff_at,
    pickup_at = excluded.pickup_at,
    picker_kind = excluded.picker_kind,
    picker_id = excluded.picker_id,
    pass_kind = excluded.pass_kind,
    updated_by = excluded.updated_by,
    updated_at = now();

  label := coalesce(public.pickup_picker_label(target_child_id, picker_kind, picker_id, pass_kind), 'vårdnadshavare');
  insert into public.pickup_day_plan_log (child_id, plan_date, action, detail, actor_id)
  values (
    target_child_id,
    plan_date,
    'day',
    to_char(plan_date, 'YYYY-MM-DD') || ' ' || to_char(dropoff_at, 'HH24:MI') || '–' || to_char(pickup_at, 'HH24:MI') || ' · ' || label,
    public.current_profile_id()
  );
end;
$$;

create or replace function public.save_pickup_standard_week(
  target_child_id uuid,
  weekly_schedule jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  term_id uuid;
  item jsonb;
  weekday_number integer;
  attending boolean;
  picker_kind text;
  picker_id uuid;
  pass_kind text;
  problem text;
  saved boolean := false;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not public.is_guardian(target_child_id) then
    raise exception 'Bara en vårdnadshavare kan ändra hämtningen';
  end if;
  if jsonb_typeof(coalesce(weekly_schedule, '[]'::jsonb)) <> 'array' or jsonb_array_length(weekly_schedule) <> 5 then
    raise exception 'Veckoschemat måste innehålla måndag till fredag';
  end if;

  for item in select value from jsonb_array_elements(weekly_schedule)
  loop
    weekday_number := (item ->> 'weekday')::integer;
    attending := coalesce((item ->> 'attending')::boolean, false);
    picker_kind := nullif(item ->> 'picker_kind', '');
    picker_id := nullif(item ->> 'picker_id', '')::uuid;
    pass_kind := nullif(item ->> 'pass_kind', '');
    if attending and picker_kind is null then
      raise exception 'Välj vem som hämtar för varje dag med tider';
    end if;
    if not attending and picker_kind is not null then
      raise exception 'En ledig dag ska inte ha en hämtare';
    end if;
    if attending then
      problem := public.pickup_picker_problem(target_child_id, null, picker_kind, picker_id, pass_kind);
      if problem is not null then raise exception '%', problem; end if;
    end if;
  end loop;

  for term_id in
    select term.id
    from public.school_terms term
    join public.departments department on department.preschool_id = term.preschool_id
    join public.children child on child.department_id = department.id
    where child.id = target_child_id
      and term.status = 'published'
  loop
    perform public.save_child_weekly_schedule(term_id, target_child_id, weekly_schedule);
    saved := true;
  end loop;
  if not saved then raise exception 'Ingen publicerad termin att spara schemat på'; end if;

  delete from public.pickup_standard_pickers where child_id = target_child_id;
  insert into public.pickup_standard_pickers (child_id, weekday, picker_kind, picker_id, pass_kind, updated_by)
  select
    target_child_id,
    (item ->> 'weekday')::smallint,
    item ->> 'picker_kind',
    (item ->> 'picker_id')::uuid,
    nullif(item ->> 'pass_kind', ''),
    public.current_profile_id()
  from jsonb_array_elements(weekly_schedule) item
  where coalesce((item ->> 'attending')::boolean, false);

  insert into public.pickup_day_plan_log (child_id, action, detail, actor_id)
  values (target_child_id, 'standard', 'Standardveckan uppdaterades', public.current_profile_id());
end;
$$;

create or replace function public.copy_pickup_week(
  target_child_id uuid,
  source_monday date
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  offset_days integer;
  source_date date;
  target_date date;
  effective record;
  copied integer := 0;
  kind text;
  chosen uuid;
  chosen_pass text;
  problem text;
  label text;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not public.is_guardian(target_child_id) then
    raise exception 'Bara en vårdnadshavare kan ändra hämtningen';
  end if;
  if source_monday is null or extract(isodow from source_monday)::integer <> 1 then
    raise exception 'Välj en måndag att kopiera';
  end if;

  for offset_days in 0..4 loop
    source_date := source_monday + offset_days;
    target_date := source_monday + 7 + offset_days;
    select * into effective from public.pickup_effective_plan(target_child_id, source_date);
    if not coalesce(effective.in_term, false) or coalesce(effective.closed, false) then
      continue;
    end if;
    if effective.dropoff_at is null or effective.pickup_at is null then
      continue;
    end if;
    select * into effective from public.pickup_effective_plan(target_child_id, target_date);
    if not coalesce(effective.in_term, false) or coalesce(effective.closed, false) then
      continue;
    end if;
    select * into effective from public.pickup_effective_plan(target_child_id, source_date);
    kind := effective.picker_kind;
    chosen := effective.picker_id;
    chosen_pass := effective.pass_kind;
    if kind = 'pass' and chosen_pass is distinct from 'permanent' then
      kind := null;
      chosen := null;
      chosen_pass := null;
      select picker.picker_kind, picker.picker_id, picker.pass_kind
        into kind, chosen, chosen_pass
      from public.pickup_standard_pickers picker
      where picker.child_id = target_child_id
        and picker.weekday = offset_days + 1;
    end if;
    if kind is not null then
      problem := public.pickup_picker_problem(target_child_id, target_date, kind, chosen, chosen_pass);
      if problem is not null then
        kind := null;
        chosen := null;
        chosen_pass := null;
      end if;
    end if;

    insert into public.pickup_day_plans (
      child_id, plan_date, dropoff_at, pickup_at, picker_kind, picker_id, pass_kind, updated_by
    ) values (
      target_child_id, target_date, effective.dropoff_at, effective.pickup_at, kind, chosen, chosen_pass, public.current_profile_id()
    )
    on conflict (child_id, plan_date) do update set
      dropoff_at = excluded.dropoff_at,
      pickup_at = excluded.pickup_at,
      picker_kind = excluded.picker_kind,
      picker_id = excluded.picker_id,
      pass_kind = excluded.pass_kind,
      updated_by = excluded.updated_by,
      updated_at = now();
    label := coalesce(public.pickup_picker_label(target_child_id, kind, chosen, chosen_pass), 'tider utan namngiven hämtare');
    insert into public.pickup_day_plan_log (child_id, plan_date, action, detail, actor_id)
    values (
      target_child_id,
      target_date,
      'copy',
      to_char(source_date, 'YYYY-MM-DD') || ' kopierades till ' || to_char(target_date, 'YYYY-MM-DD') || ' · ' || label,
      public.current_profile_id()
    );
    copied := copied + 1;
  end loop;
  return copied;
end;
$$;

create or replace function public.list_department_pickup_plans()
returns table (
  child_id uuid,
  plan_date date,
  dropoff_at text,
  pickup_at text,
  picker_kind text,
  picker_label text,
  closed boolean,
  in_term boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  monday date;
  child record;
  offset_days integer;
  day date;
  effective record;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  monday := public.pickup_stockholm_today() - (extract(isodow from public.pickup_stockholm_today())::integer - 1);
  for child in
    select found.id
    from public.children found
    where public.is_staff_for_child(found.id) or public.is_admin_for_child(found.id)
  loop
    for offset_days in 0..4 loop
      day := monday + offset_days;
      select * into effective from public.pickup_effective_plan(child.id, day);
      child_id := child.id;
      plan_date := day;
      dropoff_at := to_char(effective.dropoff_at, 'HH24:MI');
      pickup_at := to_char(effective.pickup_at, 'HH24:MI');
      picker_kind := effective.picker_kind;
      picker_label := public.pickup_picker_label(child.id, effective.picker_kind, effective.picker_id, effective.pass_kind);
      closed := coalesce(effective.closed, false);
      in_term := coalesce(effective.in_term, false);
      return next;
    end loop;
  end loop;
end;
$$;

revoke all on function public.forget_pickup_pass_secret() from public, anon, authenticated;
revoke all on function public.remember_pickup_pass_token(uuid, text, text) from public, anon, authenticated;
revoke all on function public.reveal_pickup_pass(uuid, text) from public, anon, authenticated;
revoke all on function public.pickup_picker_problem(uuid, date, text, uuid, text) from public, anon, authenticated;
revoke all on function public.pickup_picker_label(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.pickup_effective_plan(uuid, date) from public, anon, authenticated;
revoke all on function public.list_pickup_calendar(uuid) from public, anon, authenticated;
revoke all on function public.save_pickup_day(uuid, date, time, time, text, uuid, text) from public, anon, authenticated;
revoke all on function public.save_pickup_standard_week(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.copy_pickup_week(uuid, date) from public, anon, authenticated;
revoke all on function public.list_department_pickup_plans() from public, anon, authenticated;

grant execute on function public.remember_pickup_pass_token(uuid, text, text) to authenticated;
grant execute on function public.reveal_pickup_pass(uuid, text) to authenticated;
grant execute on function public.list_pickup_calendar(uuid) to authenticated;
grant execute on function public.save_pickup_day(uuid, date, time, time, text, uuid, text) to authenticated;
grant execute on function public.save_pickup_standard_week(uuid, jsonb) to authenticated;
grant execute on function public.copy_pickup_week(uuid, date) to authenticated;
grant execute on function public.list_department_pickup_plans() to authenticated;
