begin;

alter table public.attendance
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_out_at timestamptz;

create or replace function public.save_attendance_plan(
  target_child_id uuid,
  plan_status public.attendance_status,
  plan_dropoff_at time,
  plan_pickup_at time,
  plan_pickup_by text
)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_attendance public.attendance;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not public.is_guardian(target_child_id) then raise exception 'Du är inte vårdnadshavare för barnet'; end if;
  if plan_status not in ('in', 'absent_sick', 'absent_leave') then raise exception 'Ogiltig planstatus'; end if;
  if plan_dropoff_at is not null and plan_pickup_at is not null and plan_dropoff_at >= plan_pickup_at then
    raise exception 'Hämtningstiden måste vara efter lämningstiden';
  end if;
  if char_length(coalesce(trim(plan_pickup_by), '')) > 200 then raise exception 'Hämtarens namn är för långt'; end if;
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
    child_id, date, status, dropoff_at, pickup_at, pickup_by, updated_by, updated_at
  ) values (
    target_child_id, current_date, plan_status, plan_dropoff_at, plan_pickup_at,
    nullif(trim(plan_pickup_by), ''), public.current_profile_id(), now()
  )
  on conflict (child_id, date) do update
  set status = excluded.status,
      dropoff_at = excluded.dropoff_at,
      pickup_at = excluded.pickup_at,
      pickup_by = excluded.pickup_by,
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
      child_id, date, status, checked_in_at, checked_out_at, updated_by, updated_at
    ) values (
      target_child_id, current_date, 'in', now(), null, public.current_profile_id(), now()
    )
    on conflict (child_id, date) do update
    set status = 'in', checked_in_at = now(), checked_out_at = null,
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

revoke insert, update, delete on public.attendance from authenticated;
grant select on public.attendance to authenticated;
revoke all on function public.save_attendance_plan(uuid, public.attendance_status, time, time, text) from public;
revoke all on function public.set_child_attendance(uuid, text) from public;
grant execute on function public.save_attendance_plan(uuid, public.attendance_status, time, time, text) to authenticated;
grant execute on function public.set_child_attendance(uuid, text) to authenticated;

commit;
