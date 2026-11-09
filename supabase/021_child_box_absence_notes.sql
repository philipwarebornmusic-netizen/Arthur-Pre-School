-- Child supply box and guardian-provided absence notes.
--
-- Applied to production on 2026-11-09. Kept idempotent for new installations.
-- It does not delete or rewrite existing attendance, child, or guardian rows.
-- Guardians and assigned staff/admins can read and update the four fixed supply
-- levels. Direct table writes stay revoked; updates go through save_child_box.

begin;

alter table public.attendance
  add column if not exists absence_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'attendance_absence_note_length'
      and conrelid = 'public.attendance'::regclass
  ) then
    alter table public.attendance
      add constraint attendance_absence_note_length
      check (absence_note is null or char_length(trim(absence_note)) between 1 and 500);
  end if;
end $$;

create table if not exists public.child_box_items (
  child_id uuid not null references public.children(id) on delete cascade,
  item_type text not null check (item_type in ('diapers', 'spare_clothes', 'rain_clothes', 'socks')),
  level text not null check (level in ('none', 'few', 'many')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (child_id, item_type)
);

alter table public.child_box_items enable row level security;

drop policy if exists "child box authorized read" on public.child_box_items;
create policy "child box authorized read" on public.child_box_items
for select using (
  public.is_guardian(child_id)
  or public.is_staff_for_child(child_id)
  or public.is_admin_for_child(child_id)
);

revoke all on public.child_box_items from public, anon, authenticated;
grant select on public.child_box_items to authenticated;

create or replace function public.list_child_box_items()
returns table (
  child_id uuid,
  item_type text,
  level text,
  updated_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select box.child_id, box.item_type, box.level, box.updated_at
  from public.child_box_items box
  order by box.child_id, box.item_type
$$;

create or replace function public.save_child_box(target_child_id uuid, items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  item_name text;
  item_level text;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not (
    public.is_guardian(target_child_id)
    or public.is_staff_for_child(target_child_id)
    or public.is_admin_for_child(target_child_id)
  ) then
    raise exception 'Du saknar behörighet till barnets låda';
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Välj minst en status i barnets låda';
  end if;
  if jsonb_array_length(items) > 4 then
    raise exception 'För många saker i barnets låda';
  end if;

  for item in select value from jsonb_array_elements(items)
  loop
    item_name := item->>'item_type';
    item_level := item->>'level';
    if item_name not in ('diapers', 'spare_clothes', 'rain_clothes', 'socks') then
      raise exception 'Ogiltig sak i barnets låda';
    end if;
    if item_level not in ('none', 'few', 'many') then
      raise exception 'Ogiltig status i barnets låda';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(items) other
      where other->>'item_type' = item_name
      group by other->>'item_type'
      having count(*) > 1
    ) then
      raise exception 'Samma sak finns flera gånger i barnets låda';
    end if;

    insert into public.child_box_items (child_id, item_type, level, updated_by, updated_at)
    values (target_child_id, item_name, item_level, public.current_profile_id(), now())
    on conflict (child_id, item_type) do update
    set level = excluded.level,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
  end loop;
end;
$$;

drop function if exists public.save_attendance_plan(uuid, public.attendance_status, time, time, text);
create or replace function public.save_attendance_plan(
  target_child_id uuid,
  plan_status public.attendance_status,
  plan_dropoff_at time,
  plan_pickup_at time,
  plan_pickup_by text,
  plan_absence_note text
)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_attendance public.attendance;
  normalized_note text := nullif(trim(plan_absence_note), '');
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not public.is_guardian(target_child_id) then raise exception 'Du är inte vårdnadshavare för barnet'; end if;
  if plan_status not in ('in', 'absent_sick', 'absent_leave') then raise exception 'Ogiltig planstatus'; end if;
  if plan_dropoff_at is not null and plan_pickup_at is not null and plan_dropoff_at >= plan_pickup_at then
    raise exception 'Hämtningstiden måste vara efter lämningstiden';
  end if;
  if char_length(coalesce(trim(plan_pickup_by), '')) > 200 then raise exception 'Hämtarens namn är för långt'; end if;
  if char_length(coalesce(normalized_note, '')) > 500 then raise exception 'Frånvaroorsaken är för lång'; end if;
  if plan_status = 'in' then normalized_note := null; end if;
  if plan_status <> 'in' and exists (
    select 1 from public.attendance
    where child_id = target_child_id
      and date = current_date
      and checked_in_at is not null
      and checked_out_at is null
  ) then
    raise exception 'Barnet är redan incheckat och måste checkas ut av personalen först';
  end if;

  insert into public.attendance (
    child_id, date, status, dropoff_at, pickup_at, pickup_by, absence_note, updated_by, updated_at
  ) values (
    target_child_id, current_date, plan_status, plan_dropoff_at, plan_pickup_at,
    nullif(trim(plan_pickup_by), ''), normalized_note, public.current_profile_id(), now()
  )
  on conflict (child_id, date) do update
  set status = excluded.status,
      dropoff_at = excluded.dropoff_at,
      pickup_at = excluded.pickup_at,
      pickup_by = excluded.pickup_by,
      absence_note = excluded.absence_note,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  returning * into saved_attendance;

  return saved_attendance;
end;
$$;

create or replace function public.set_child_attendance(target_child_id uuid, transition text)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  current_attendance public.attendance;
  saved_attendance public.attendance;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not (public.is_admin_for_child(target_child_id) or public.is_staff_for_child(target_child_id)) then
    raise exception 'Du saknar behörighet till barnets närvaro';
  end if;
  if transition not in ('check_in', 'check_out', 'absent_sick', 'absent_leave') then
    raise exception 'Ogiltig närvaroändring';
  end if;

  select * into current_attendance
  from public.attendance
  where child_id = target_child_id and date = current_date
  for update;

  if transition = 'check_in' then
    if current_attendance.checked_in_at is not null and current_attendance.checked_out_at is null then
      raise exception 'Barnet är redan incheckat';
    end if;
    insert into public.attendance (
      child_id, date, status, checked_in_at, checked_out_at, absence_note, updated_by, updated_at
    ) values (
      target_child_id, current_date, 'in', now(), null, null, public.current_profile_id(), now()
    )
    on conflict (child_id, date) do update
    set status = 'in', checked_in_at = now(), checked_out_at = null, absence_note = null,
        updated_by = public.current_profile_id(), updated_at = now()
    returning * into saved_attendance;
  elsif transition = 'check_out' then
    if current_attendance.id is null or current_attendance.checked_in_at is null or current_attendance.checked_out_at is not null then
      raise exception 'Barnet är inte incheckat';
    end if;
    update public.attendance
    set status = 'picked_up', checked_out_at = now(),
        updated_by = public.current_profile_id(), updated_at = now()
    where id = current_attendance.id
    returning * into saved_attendance;
  else
    if current_attendance.checked_in_at is not null and current_attendance.checked_out_at is null then
      raise exception 'Barnet är incheckat och måste checkas ut först';
    end if;
    insert into public.attendance (
      child_id, date, status, checked_in_at, checked_out_at, updated_by, updated_at
    ) values (
      target_child_id, current_date, transition::public.attendance_status, null, null,
      public.current_profile_id(), now()
    )
    on conflict (child_id, date) do update
    set status = excluded.status, checked_in_at = null, checked_out_at = null,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at
    returning * into saved_attendance;
  end if;

  return saved_attendance;
end;
$$;

revoke all on function public.list_child_box_items() from public;
revoke all on function public.save_child_box(uuid, jsonb) from public;
revoke all on function public.save_attendance_plan(uuid, public.attendance_status, time, time, text, text) from public;
revoke all on function public.set_child_attendance(uuid, text) from public;
grant execute on function public.list_child_box_items() to authenticated;
grant execute on function public.save_child_box(uuid, jsonb) to authenticated;
grant execute on function public.save_attendance_plan(uuid, public.attendance_status, time, time, text, text) to authenticated;
grant execute on function public.set_child_attendance(uuid, text) to authenticated;

commit;
