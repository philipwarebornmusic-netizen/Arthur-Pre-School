begin;

create table if not exists public.school_terms (
  id uuid primary key default gen_random_uuid(),
  preschool_id uuid not null references public.preschools(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  starts_on date not null,
  ends_on date not null,
  opens_at time not null,
  closes_at time not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_on <= ends_on),
  check (opens_at < closes_at),
  check ((status = 'draft' and published_at is null) or (status = 'published' and published_at is not null))
);

create table if not exists public.school_term_closures (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.school_terms(id) on delete cascade,
  closure_date date not null,
  reason text not null check (char_length(trim(reason)) between 2 and 200),
  unique (term_id, closure_date)
);

create table if not exists public.child_weekly_schedules (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.school_terms(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 5),
  attending boolean not null,
  dropoff_at time,
  pickup_at time,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (term_id, child_id, weekday),
  check (
    (attending and dropoff_at is not null and pickup_at is not null and dropoff_at < pickup_at)
    or (not attending and dropoff_at is null and pickup_at is null)
  )
);

create index if not exists idx_school_terms_preschool_dates on public.school_terms(preschool_id, starts_on, ends_on);
create index if not exists idx_term_closures_term_date on public.school_term_closures(term_id, closure_date);
create index if not exists idx_child_weekly_schedules_child_term on public.child_weekly_schedules(child_id, term_id);

create or replace function public.can_read_school_term(target_term_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.school_terms term
    join public.preschools school on school.id = term.preschool_id
    where term.id = target_term_id
      and school.organization_id = public.current_organization_id()
      and (
        public.is_admin()
        or exists (
          select 1
          from public.departments department
          join public.staff_departments assignment on assignment.department_id = department.id
          where department.preschool_id = school.id
            and assignment.staff_id = public.current_profile_id()
        )
        or (
          term.status = 'published'
          and exists (
            select 1
            from public.departments department
            join public.children child on child.department_id = department.id
            join public.child_guardians guardian on guardian.child_id = child.id
            where department.preschool_id = school.id
              and guardian.profile_id = public.current_profile_id()
          )
        )
      )
  )
$$;

create or replace function public.save_school_term(
  target_term_id uuid,
  target_preschool_id uuid,
  term_name text,
  term_starts_on date,
  term_ends_on date,
  term_opens_at time,
  term_closes_at time,
  closures jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_term_id uuid;
  closure_count integer;
begin
  if not public.is_admin() or not exists (
    select 1 from public.preschools school
    where school.id = target_preschool_id
      and school.organization_id = public.current_organization_id()
  ) then raise exception 'Du saknar behörighet till förskolan'; end if;
  if char_length(trim(coalesce(term_name, ''))) not between 2 and 100 then raise exception 'Terminens namn måste innehålla mellan 2 och 100 tecken'; end if;
  if term_starts_on is null or term_ends_on is null or term_starts_on > term_ends_on then raise exception 'Ange ett giltigt datumintervall'; end if;
  if term_opens_at is null or term_closes_at is null or term_opens_at >= term_closes_at then raise exception 'Ange giltiga öppettider'; end if;
  if jsonb_typeof(coalesce(closures, '[]'::jsonb)) <> 'array' then raise exception 'Ogiltig lista med stängningsdagar'; end if;
  closure_count := jsonb_array_length(coalesce(closures, '[]'::jsonb));
  if closure_count > 100 then raise exception 'En termin kan ha högst 100 stängningsdagar'; end if;
  if closure_count <> (select count(distinct item ->> 'date') from jsonb_array_elements(closures) item) then raise exception 'En stängningsdag får bara anges en gång'; end if;
  if exists (
    select 1 from jsonb_array_elements(closures) item
    where (item ->> 'date')::date not between term_starts_on and term_ends_on
       or char_length(trim(coalesce(item ->> 'reason', ''))) not between 2 and 200
  ) then raise exception 'Stängningsdagar måste ligga i terminen och ha en anledning'; end if;

  if target_term_id is null then
    insert into public.school_terms (preschool_id, name, starts_on, ends_on, opens_at, closes_at, created_by)
    values (target_preschool_id, trim(term_name), term_starts_on, term_ends_on, term_opens_at, term_closes_at, public.current_profile_id())
    returning id into saved_term_id;
  else
    update public.school_terms
    set name = trim(term_name), starts_on = term_starts_on, ends_on = term_ends_on,
        opens_at = term_opens_at, closes_at = term_closes_at, updated_at = now()
    where id = target_term_id
      and preschool_id = target_preschool_id
      and status = 'draft'
    returning id into saved_term_id;
    if saved_term_id is null then raise exception 'Utkastet hittades inte eller är redan publicerat'; end if;
    delete from public.school_term_closures where term_id = saved_term_id;
  end if;

  insert into public.school_term_closures (term_id, closure_date, reason)
  select saved_term_id, (item ->> 'date')::date, trim(item ->> 'reason')
  from jsonb_array_elements(closures) item;
  return saved_term_id;
end;
$$;

create or replace function public.publish_school_term(target_term_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_term public.school_terms%rowtype;
begin
  select term.* into target_term
  from public.school_terms term
  join public.preschools school on school.id = term.preschool_id
  where term.id = target_term_id
    and term.status = 'draft'
    and public.is_admin()
    and school.organization_id = public.current_organization_id()
  for update of term;
  if target_term.id is null then raise exception 'Terminsutkastet hittades inte'; end if;
  if exists (
    select 1 from public.school_terms other
    where other.preschool_id = target_term.preschool_id
      and other.status = 'published'
      and daterange(other.starts_on, other.ends_on, '[]') && daterange(target_term.starts_on, target_term.ends_on, '[]')
  ) then raise exception 'En publicerad termin överlappar redan detta datumintervall'; end if;
  update public.school_terms set status = 'published', published_at = now(), updated_at = now() where id = target_term.id;
  return target_term.id;
end;
$$;

create or replace function public.list_school_terms()
returns table (
  term_id uuid,
  preschool_id uuid,
  term_name text,
  starts_on date,
  ends_on date,
  opens_at time,
  closes_at time,
  term_status text,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select term.id, term.preschool_id, term.name, term.starts_on, term.ends_on,
         term.opens_at, term.closes_at, term.status, term.published_at, term.updated_at
  from public.school_terms term
  where public.can_read_school_term(term.id)
  order by term.starts_on desc, term.name
$$;

create or replace function public.list_school_term_closures()
returns table (closure_id uuid, term_id uuid, closure_date date, reason text)
language sql
stable
security definer
set search_path = public
as $$
  select closure.id, closure.term_id, closure.closure_date, closure.reason
  from public.school_term_closures closure
  where public.can_read_school_term(closure.term_id)
  order by closure.closure_date
$$;

create or replace function public.list_child_weekly_schedules()
returns table (
  schedule_id uuid,
  term_id uuid,
  child_id uuid,
  weekday smallint,
  attending boolean,
  dropoff_at time,
  pickup_at time,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select schedule.id, schedule.term_id, schedule.child_id, schedule.weekday,
         schedule.attending, schedule.dropoff_at, schedule.pickup_at, schedule.updated_at
  from public.child_weekly_schedules schedule
  where public.can_read_school_term(schedule.term_id)
    and (
      public.is_guardian(schedule.child_id)
      or public.is_staff_for_child(schedule.child_id)
      or public.is_admin_for_child(schedule.child_id)
    )
  order by schedule.term_id, schedule.child_id, schedule.weekday
$$;

create or replace function public.save_child_weekly_schedule(
  target_term_id uuid,
  target_child_id uuid,
  weekly_schedule jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_term public.school_terms%rowtype;
  schedule_count integer;
begin
  if not public.is_guardian(target_child_id) then raise exception 'Endast barnets vårdnadshavare kan ändra schemat'; end if;
  select term.* into target_term
  from public.school_terms term
  join public.departments department on department.preschool_id = term.preschool_id
  join public.children child on child.department_id = department.id
  where term.id = target_term_id
    and term.status = 'published'
    and child.id = target_child_id;
  if target_term.id is null then raise exception 'Den publicerade terminen gäller inte barnet'; end if;
  if jsonb_typeof(coalesce(weekly_schedule, '[]'::jsonb)) <> 'array' then raise exception 'Ogiltigt veckoschema'; end if;
  schedule_count := jsonb_array_length(coalesce(weekly_schedule, '[]'::jsonb));
  if schedule_count <> 5
     or schedule_count <> (select count(distinct (item ->> 'weekday')::integer) from jsonb_array_elements(weekly_schedule) item)
     or exists (select 1 from jsonb_array_elements(weekly_schedule) item where (item ->> 'weekday')::integer not between 1 and 5)
  then raise exception 'Veckoschemat måste innehålla måndag till fredag exakt en gång'; end if;
  if exists (
    select 1 from jsonb_array_elements(weekly_schedule) item
    where (
      coalesce((item ->> 'attending')::boolean, false)
      and (
        nullif(item ->> 'dropoff_at', '') is null
        or nullif(item ->> 'pickup_at', '') is null
        or (item ->> 'dropoff_at')::time < target_term.opens_at
        or (item ->> 'pickup_at')::time > target_term.closes_at
        or (item ->> 'dropoff_at')::time >= (item ->> 'pickup_at')::time
      )
    ) or (
      not coalesce((item ->> 'attending')::boolean, false)
      and (nullif(item ->> 'dropoff_at', '') is not null or nullif(item ->> 'pickup_at', '') is not null)
    )
  ) then raise exception 'Schemat måste följa terminens öppettider och ha giltiga tider'; end if;

  delete from public.child_weekly_schedules where term_id = target_term_id and child_id = target_child_id;
  insert into public.child_weekly_schedules (term_id, child_id, weekday, attending, dropoff_at, pickup_at, updated_by)
  select
    target_term_id,
    target_child_id,
    (item ->> 'weekday')::smallint,
    coalesce((item ->> 'attending')::boolean, false),
    case when coalesce((item ->> 'attending')::boolean, false) then (item ->> 'dropoff_at')::time else null end,
    case when coalesce((item ->> 'attending')::boolean, false) then (item ->> 'pickup_at')::time else null end,
    public.current_profile_id()
  from jsonb_array_elements(weekly_schedule) item;
  return target_term_id;
end;
$$;

alter table public.school_terms enable row level security;
alter table public.school_term_closures enable row level security;
alter table public.child_weekly_schedules enable row level security;

create policy "authorized term read" on public.school_terms for select using (public.can_read_school_term(id));
create policy "authorized closure read" on public.school_term_closures for select using (public.can_read_school_term(term_id));
create policy "authorized weekly schedule read" on public.child_weekly_schedules for select using (
  public.can_read_school_term(term_id)
  and (public.is_guardian(child_id) or public.is_staff_for_child(child_id) or public.is_admin_for_child(child_id))
);

revoke all on public.school_terms, public.school_term_closures, public.child_weekly_schedules from anon, authenticated;
revoke all on function public.can_read_school_term(uuid) from public;
revoke all on function public.save_school_term(uuid, uuid, text, date, date, time, time, jsonb) from public;
revoke all on function public.publish_school_term(uuid) from public;
revoke all on function public.list_school_terms() from public;
revoke all on function public.list_school_term_closures() from public;
revoke all on function public.list_child_weekly_schedules() from public;
revoke all on function public.save_child_weekly_schedule(uuid, uuid, jsonb) from public;
grant execute on function public.save_school_term(uuid, uuid, text, date, date, time, time, jsonb) to authenticated;
grant execute on function public.publish_school_term(uuid) to authenticated;
grant execute on function public.list_school_terms() to authenticated;
grant execute on function public.list_school_term_closures() to authenticated;
grant execute on function public.list_child_weekly_schedules() to authenticated;
grant execute on function public.save_child_weekly_schedule(uuid, uuid, jsonb) to authenticated;

commit;
