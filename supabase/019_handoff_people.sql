-- Separate the person who leaves a child from the person who picks the child up.
-- Pickup passes remain pickup-only. Existing guardian/contact pickers are copied
-- to the drop-off field so already saved plans keep their meaning.

begin;

alter table public.pickup_day_plans
  add column if not exists dropoff_person_kind text,
  add column if not exists dropoff_person_id uuid;

alter table public.pickup_standard_pickers
  add column if not exists dropoff_person_kind text,
  add column if not exists dropoff_person_id uuid;

update public.pickup_day_plans
set dropoff_person_kind = picker_kind,
    dropoff_person_id = picker_id
where dropoff_person_kind is null
  and picker_kind in ('guardian', 'contact');

update public.pickup_standard_pickers
set dropoff_person_kind = picker_kind,
    dropoff_person_id = picker_id
where dropoff_person_kind is null
  and picker_kind in ('guardian', 'contact');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pickup_day_plans_dropoff_person_check'
      and conrelid = 'public.pickup_day_plans'::regclass
  ) then
    alter table public.pickup_day_plans
      add constraint pickup_day_plans_dropoff_person_check check (
        (dropoff_person_kind is null and dropoff_person_id is null)
        or (dropoff_person_kind in ('guardian', 'contact') and dropoff_person_id is not null)
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'pickup_standard_pickers_dropoff_person_check'
      and conrelid = 'public.pickup_standard_pickers'::regclass
  ) then
    alter table public.pickup_standard_pickers
      add constraint pickup_standard_pickers_dropoff_person_check check (
        (dropoff_person_kind is null and dropoff_person_id is null)
        or (dropoff_person_kind in ('guardian', 'contact') and dropoff_person_id is not null)
      );
  end if;
end $$;
create or replace function public.pickup_effective_dropoff_person(
  target_child_id uuid,
  plan_date date
)
returns table (
  person_kind text,
  person_id uuid
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  day_plan public.pickup_day_plans%rowtype;
  previous_plan public.pickup_day_plans%rowtype;
  standard_person public.pickup_standard_pickers%rowtype;
  weekday_number integer;
begin
  weekday_number := extract(isodow from plan_date)::integer;
  if weekday_number > 5 then return; end if;

  select found.* into day_plan
  from public.pickup_day_plans found
  where found.child_id = target_child_id
    and found.plan_date = pickup_effective_dropoff_person.plan_date;

  select found.* into previous_plan
  from public.pickup_day_plans found
  where found.child_id = target_child_id
    and found.plan_date = pickup_effective_dropoff_person.plan_date - 7;

  select found.* into standard_person
  from public.pickup_standard_pickers found
  where found.child_id = target_child_id
    and found.weekday = weekday_number;

  if day_plan.dropoff_person_kind is not null then
    person_kind := day_plan.dropoff_person_kind;
    person_id := day_plan.dropoff_person_id;
  elsif previous_plan.dropoff_person_kind is not null then
    person_kind := previous_plan.dropoff_person_kind;
    person_id := previous_plan.dropoff_person_id;
  elsif standard_person.dropoff_person_kind is not null then
    person_kind := standard_person.dropoff_person_kind;
    person_id := standard_person.dropoff_person_id;
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
        'dropoff_person_kind', plan.dropoff_person_kind,
        'dropoff_person_id', plan.dropoff_person_id,
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
        'dropoff_person_kind', picker.dropoff_person_kind,
        'dropoff_person_id', picker.dropoff_person_id,
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

create or replace function public.save_pickup_day_handoffs(
  target_child_id uuid,
  plan_date date,
  dropoff_at time,
  pickup_at time,
  dropoff_person_kind text,
  dropoff_person_id uuid,
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
  dropoff_problem text;
  pickup_problem text;
  dropoff_label text;
  pickup_label text;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not public.is_guardian(target_child_id) then
    raise exception 'Bara en vårdnadshavare kan ändra lämning och hämtning';
  end if;
  if plan_date is null or dropoff_at is null or pickup_at is null then
    raise exception 'Fyll i dag och tider';
  end if;
  if extract(isodow from plan_date)::integer > 5 then
    raise exception 'Lämning och hämtning planeras på vardagar';
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

  dropoff_problem := public.pickup_picker_problem(
    target_child_id, plan_date, dropoff_person_kind, dropoff_person_id, null
  );
  if dropoff_problem is not null then raise exception 'Ogiltig lämnare: %', dropoff_problem; end if;
  pickup_problem := public.pickup_picker_problem(
    target_child_id, plan_date, picker_kind, picker_id, pass_kind
  );
  if pickup_problem is not null then raise exception '%', pickup_problem; end if;

  insert into public.pickup_day_plans (
    child_id, plan_date, dropoff_at, pickup_at,
    dropoff_person_kind, dropoff_person_id,
    picker_kind, picker_id, pass_kind, updated_by
  ) values (
    target_child_id, plan_date, dropoff_at, pickup_at,
    dropoff_person_kind, dropoff_person_id,
    picker_kind, picker_id, pass_kind, public.current_profile_id()
  )
  on conflict on constraint pickup_day_plans_child_id_plan_date_key do update set
    dropoff_at = excluded.dropoff_at,
    pickup_at = excluded.pickup_at,
    dropoff_person_kind = excluded.dropoff_person_kind,
    dropoff_person_id = excluded.dropoff_person_id,
    picker_kind = excluded.picker_kind,
    picker_id = excluded.picker_id,
    pass_kind = excluded.pass_kind,
    updated_by = excluded.updated_by,
    updated_at = now();

  dropoff_label := coalesce(public.pickup_picker_label(
    target_child_id, dropoff_person_kind, dropoff_person_id, null
  ), 'vårdnadshavare');
  pickup_label := coalesce(public.pickup_picker_label(
    target_child_id, picker_kind, picker_id, pass_kind
  ), 'vårdnadshavare');
  insert into public.pickup_day_plan_log (child_id, plan_date, action, detail, actor_id)
  values (
    target_child_id,
    plan_date,
    'day',
    to_char(plan_date, 'YYYY-MM-DD') || ' ' || to_char(dropoff_at, 'HH24:MI') || '–' ||
      to_char(pickup_at, 'HH24:MI') || ' · lämnas av ' || dropoff_label ||
      ' · hämtas av ' || pickup_label,
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
  drop_kind text;
  drop_id uuid;
  pick_kind text;
  pick_id uuid;
  pick_pass_kind text;
  problem text;
  saved boolean := false;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not public.is_guardian(target_child_id) then
    raise exception 'Bara en vårdnadshavare kan ändra lämning och hämtning';
  end if;
  if jsonb_typeof(coalesce(weekly_schedule, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(weekly_schedule) <> 5 then
    raise exception 'Veckoschemat måste innehålla måndag till fredag';
  end if;

  for item in select value from jsonb_array_elements(weekly_schedule)
  loop
    weekday_number := (item ->> 'weekday')::integer;
    attending := coalesce((item ->> 'attending')::boolean, false);
    drop_kind := nullif(item ->> 'dropoff_person_kind', '');
    drop_id := nullif(item ->> 'dropoff_person_id', '')::uuid;
    pick_kind := nullif(item ->> 'picker_kind', '');
    pick_id := nullif(item ->> 'picker_id', '')::uuid;
    pick_pass_kind := nullif(item ->> 'pass_kind', '');
    if attending and (drop_kind is null or pick_kind is null) then
      raise exception 'Välj vem som lämnar och vem som hämtar för varje dag med tider';
    end if;
    if not attending and (drop_kind is not null or pick_kind is not null) then
      raise exception 'En ledig dag ska inte ha lämnare eller hämtare';
    end if;
    if attending then
      problem := public.pickup_picker_problem(target_child_id, null, drop_kind, drop_id, null);
      if problem is not null then raise exception 'Ogiltig lämnare: %', problem; end if;
      problem := public.pickup_picker_problem(target_child_id, null, pick_kind, pick_id, pick_pass_kind);
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
  insert into public.pickup_standard_pickers (
    child_id, weekday, dropoff_person_kind, dropoff_person_id,
    picker_kind, picker_id, pass_kind, updated_by
  )
  select
    target_child_id,
    (day_item ->> 'weekday')::smallint,
    day_item ->> 'dropoff_person_kind',
    (day_item ->> 'dropoff_person_id')::uuid,
    day_item ->> 'picker_kind',
    (day_item ->> 'picker_id')::uuid,
    nullif(day_item ->> 'pass_kind', ''),
    public.current_profile_id()
  from jsonb_array_elements(weekly_schedule) day_item
  where coalesce((day_item ->> 'attending')::boolean, false);

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
  source_plan record;
  target_plan record;
  source_dropoff record;
  copied integer := 0;
  drop_kind text;
  drop_id uuid;
  pick_kind text;
  pick_id uuid;
  pick_pass_kind text;
  problem text;
  detail_label text;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not public.is_guardian(target_child_id) then
    raise exception 'Bara en vårdnadshavare kan ändra lämning och hämtning';
  end if;
  if source_monday is null or extract(isodow from source_monday)::integer <> 1 then
    raise exception 'Välj en måndag att kopiera';
  end if;

  for offset_days in 0..4 loop
    source_date := source_monday + offset_days;
    target_date := source_monday + 7 + offset_days;
    select * into source_plan from public.pickup_effective_plan(target_child_id, source_date);
    if not coalesce(source_plan.in_term, false) or coalesce(source_plan.closed, false)
       or source_plan.dropoff_at is null or source_plan.pickup_at is null then
      continue;
    end if;
    select * into target_plan from public.pickup_effective_plan(target_child_id, target_date);
    if not coalesce(target_plan.in_term, false) or coalesce(target_plan.closed, false) then
      continue;
    end if;

    select * into source_dropoff from public.pickup_effective_dropoff_person(target_child_id, source_date);
    drop_kind := source_dropoff.person_kind;
    drop_id := source_dropoff.person_id;
    if drop_kind is not null then
      problem := public.pickup_picker_problem(target_child_id, target_date, drop_kind, drop_id, null);
      if problem is not null then drop_kind := null; drop_id := null; end if;
    end if;

    pick_kind := source_plan.picker_kind;
    pick_id := source_plan.picker_id;
    pick_pass_kind := source_plan.pass_kind;
    if pick_kind = 'pass' and pick_pass_kind is distinct from 'permanent' then
      pick_kind := null;
      pick_id := null;
      pick_pass_kind := null;
      select picker.picker_kind, picker.picker_id, picker.pass_kind
        into pick_kind, pick_id, pick_pass_kind
      from public.pickup_standard_pickers picker
      where picker.child_id = target_child_id
        and picker.weekday = offset_days + 1;
    end if;
    if pick_kind is not null then
      problem := public.pickup_picker_problem(
        target_child_id, target_date, pick_kind, pick_id, pick_pass_kind
      );
      if problem is not null then
        pick_kind := null;
        pick_id := null;
        pick_pass_kind := null;
      end if;
    end if;

    insert into public.pickup_day_plans (
      child_id, plan_date, dropoff_at, pickup_at,
      dropoff_person_kind, dropoff_person_id,
      picker_kind, picker_id, pass_kind, updated_by
    ) values (
      target_child_id, target_date, source_plan.dropoff_at, source_plan.pickup_at,
      drop_kind, drop_id, pick_kind, pick_id, pick_pass_kind, public.current_profile_id()
    )
    on conflict on constraint pickup_day_plans_child_id_plan_date_key do update set
      dropoff_at = excluded.dropoff_at,
      pickup_at = excluded.pickup_at,
      dropoff_person_kind = excluded.dropoff_person_kind,
      dropoff_person_id = excluded.dropoff_person_id,
      picker_kind = excluded.picker_kind,
      picker_id = excluded.picker_id,
      pass_kind = excluded.pass_kind,
      updated_by = excluded.updated_by,
      updated_at = now();
    detail_label := coalesce(
      public.pickup_picker_label(target_child_id, pick_kind, pick_id, pick_pass_kind),
      'tider utan namngiven hämtare'
    );
    insert into public.pickup_day_plan_log (child_id, plan_date, action, detail, actor_id)
    values (
      target_child_id,
      target_date,
      'copy',
      to_char(source_date, 'YYYY-MM-DD') || ' kopierades till ' ||
        to_char(target_date, 'YYYY-MM-DD') || ' · ' || detail_label,
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
  dropoff_person record;
  dropoff_name text;
  pickup_name text;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  monday := public.pickup_stockholm_today() -
    (extract(isodow from public.pickup_stockholm_today())::integer - 1);
  for child in
    select found.id
    from public.children found
    where public.is_staff_for_child(found.id) or public.is_admin_for_child(found.id)
  loop
    for offset_days in 0..4 loop
      day := monday + offset_days;
      select * into effective from public.pickup_effective_plan(child.id, day);
      select * into dropoff_person from public.pickup_effective_dropoff_person(child.id, day);
      dropoff_name := public.pickup_picker_label(
        child.id, dropoff_person.person_kind, dropoff_person.person_id, null
      );
      pickup_name := public.pickup_picker_label(
        child.id, effective.picker_kind, effective.picker_id, effective.pass_kind
      );
      child_id := child.id;
      plan_date := day;
      dropoff_at := to_char(effective.dropoff_at, 'HH24:MI');
      pickup_at := to_char(effective.pickup_at, 'HH24:MI');
      picker_kind := effective.picker_kind;
      picker_label := concat_ws(
        ' · ',
        case when dropoff_name is not null then 'Lämnas av ' || dropoff_name end,
        case when pickup_name is not null then 'hämtas av ' || pickup_name end
      );
      closed := coalesce(effective.closed, false);
      in_term := coalesce(effective.in_term, false);
      return next;
    end loop;
  end loop;
end;
$$;

revoke all on function public.pickup_effective_dropoff_person(uuid, date) from public, anon, authenticated;
revoke all on function public.save_pickup_day_handoffs(uuid, date, time, time, text, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.list_pickup_calendar(uuid) from public, anon, authenticated;
revoke all on function public.save_pickup_standard_week(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.copy_pickup_week(uuid, date) from public, anon, authenticated;
revoke all on function public.list_department_pickup_plans() from public, anon, authenticated;

grant execute on function public.save_pickup_day_handoffs(uuid, date, time, time, text, uuid, text, uuid, text) to authenticated;
grant execute on function public.list_pickup_calendar(uuid) to authenticated;
grant execute on function public.save_pickup_standard_week(uuid, jsonb) to authenticated;
grant execute on function public.copy_pickup_week(uuid, date) to authenticated;
grant execute on function public.list_department_pickup_plans() to authenticated;

commit;
