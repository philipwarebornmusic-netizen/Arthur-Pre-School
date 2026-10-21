-- Administrators own term drafts and published terms. Other roles only see published
-- terms. A published term can be corrected without deleting guardian weekly schedules.
-- Run in the Supabase SQL editor. Do not apply until the product owner approves it.

begin;

create or replace function public.can_manage_preschool_term(target_preschool_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.current_profile_id() is not null
    and public.is_admin()
    and exists (
      select 1
      from public.preschools school
      where school.id = target_preschool_id
        and school.organization_id = public.current_organization_id()
    )
$$;

create or replace function public.can_read_school_term(target_term_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.current_profile_id() is not null
    and exists (
      select 1
      from public.school_terms term
      join public.preschools school on school.id = term.preschool_id
      where term.id = target_term_id
        and school.organization_id = public.current_organization_id()
        and (
          public.is_admin()
          or (
            term.status = 'published'
            and (
              exists (
                select 1
                from public.departments department
                join public.staff_departments assignment on assignment.department_id = department.id
                where department.preschool_id = school.id
                  and assignment.staff_id = public.current_profile_id()
              )
              or exists (
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
  existing_term public.school_terms%rowtype;
  closure_count integer;
  normalized_closures jsonb := coalesce(closures, '[]'::jsonb);
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not public.can_manage_preschool_term(target_preschool_id) then
    raise exception 'Du saknar behörighet att hantera terminer';
  end if;
  if char_length(trim(coalesce(term_name, ''))) not between 2 and 100 then raise exception 'Terminens namn måste innehålla mellan 2 och 100 tecken'; end if;
  if term_starts_on is null or term_ends_on is null or term_starts_on > term_ends_on then raise exception 'Ange ett giltigt datumintervall'; end if;
  if term_opens_at is null or term_closes_at is null or term_opens_at >= term_closes_at then raise exception 'Ange giltiga öppettider'; end if;
  if jsonb_typeof(normalized_closures) <> 'array' then raise exception 'Ogiltig lista med stängningsdagar'; end if;
  closure_count := jsonb_array_length(normalized_closures);
  if closure_count > 100 then raise exception 'En termin kan ha högst 100 stängningsdagar'; end if;
  if closure_count <> (select count(distinct item ->> 'date') from jsonb_array_elements(normalized_closures) item) then raise exception 'En stängningsdag får bara anges en gång'; end if;
  if exists (
    select 1 from jsonb_array_elements(normalized_closures) item
    where (item ->> 'date')::date not between term_starts_on and term_ends_on
       or char_length(trim(coalesce(item ->> 'reason', ''))) not between 2 and 200
  ) then raise exception 'Stängningsdagar måste ligga i terminen och ha en anledning'; end if;

  -- One lock per preschool keeps draft creation, publication, and later edits from overlapping.
  perform 1 from public.preschools school where school.id = target_preschool_id for update;

  if target_term_id is null then
    insert into public.school_terms (preschool_id, name, starts_on, ends_on, opens_at, closes_at, created_by)
    values (target_preschool_id, trim(term_name), term_starts_on, term_ends_on, term_opens_at, term_closes_at, public.current_profile_id())
    returning id into saved_term_id;
  else
    select term.* into existing_term
    from public.school_terms term
    where term.id = target_term_id
      and term.preschool_id = target_preschool_id
    for update;
    if existing_term.id is null then raise exception 'Terminen hittades inte'; end if;
    if existing_term.status = 'published' and exists (
      select 1 from public.school_terms other
      where other.preschool_id = target_preschool_id
        and other.id <> existing_term.id
        and other.status = 'published'
        and daterange(other.starts_on, other.ends_on, '[]') && daterange(term_starts_on, term_ends_on, '[]')
    ) then raise exception 'En publicerad termin överlappar redan detta datumintervall'; end if;

    update public.school_terms
    set name = trim(term_name),
        starts_on = term_starts_on,
        ends_on = term_ends_on,
        opens_at = term_opens_at,
        closes_at = term_closes_at,
        updated_at = now()
    where id = existing_term.id
    returning id into saved_term_id;
    -- Guardian weekly schedules stay in place. Rows that no longer fit opening hours are flagged by list_child_weekly_schedules.
    delete from public.school_term_closures where term_id = saved_term_id;
  end if;

  insert into public.school_term_closures (term_id, closure_date, reason)
  select saved_term_id, (item ->> 'date')::date, trim(item ->> 'reason')
  from jsonb_array_elements(normalized_closures) item;
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
  school_id uuid;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  select term.preschool_id into school_id
  from public.school_terms term
  where term.id = target_term_id;
  if school_id is null or not public.can_manage_preschool_term(school_id) then
    raise exception 'Terminsutkastet hittades inte';
  end if;

  perform 1 from public.preschools school where school.id = school_id for update;
  select term.* into target_term
  from public.school_terms term
  where term.id = target_term_id
    and term.preschool_id = school_id
  for update;
  if target_term.id is null then raise exception 'Terminsutkastet hittades inte'; end if;
  if target_term.status <> 'draft' then raise exception 'Terminen är redan publicerad'; end if;
  if exists (
    select 1 from public.school_terms other
    where other.preschool_id = target_term.preschool_id
      and other.status = 'published'
      and daterange(other.starts_on, other.ends_on, '[]') && daterange(target_term.starts_on, target_term.ends_on, '[]')
  ) then raise exception 'En publicerad termin överlappar redan detta datumintervall'; end if;
  update public.school_terms
  set status = 'published', published_at = now(), updated_at = now()
  where id = target_term.id;
  return target_term.id;
end;
$$;

drop function if exists public.list_child_weekly_schedules();

create function public.list_child_weekly_schedules()
returns table (
  schedule_id uuid,
  term_id uuid,
  child_id uuid,
  weekday smallint,
  attending boolean,
  dropoff_at time,
  pickup_at time,
  updated_at timestamptz,
  within_opening_hours boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select schedule.id, schedule.term_id, schedule.child_id, schedule.weekday,
         schedule.attending, schedule.dropoff_at, schedule.pickup_at, schedule.updated_at,
         (
           not schedule.attending
           or (
             schedule.dropoff_at is not null
             and schedule.pickup_at is not null
             and schedule.dropoff_at >= term.opens_at
             and schedule.pickup_at <= term.closes_at
             and schedule.dropoff_at < schedule.pickup_at
           )
         ) as within_opening_hours
  from public.child_weekly_schedules schedule
  join public.school_terms term on term.id = schedule.term_id
  where auth.uid() is not null
    and public.can_read_school_term(schedule.term_id)
    and (
      public.is_guardian(schedule.child_id)
      or public.is_staff_for_child(schedule.child_id)
      or public.is_admin_for_child(schedule.child_id)
    )
  order by schedule.term_id, schedule.child_id, schedule.weekday
$$;

revoke all on function public.can_manage_preschool_term(uuid) from public, anon, authenticated;
revoke all on function public.can_read_school_term(uuid) from public, anon, authenticated;
revoke all on function public.save_school_term(uuid, uuid, text, date, date, time, time, jsonb) from public, anon, authenticated;
revoke all on function public.publish_school_term(uuid) from public, anon, authenticated;
revoke all on function public.list_child_weekly_schedules() from public, anon, authenticated;
grant execute on function public.save_school_term(uuid, uuid, text, date, date, time, time, jsonb) to authenticated;
grant execute on function public.publish_school_term(uuid) to authenticated;
grant execute on function public.list_child_weekly_schedules() to authenticated;

commit;
