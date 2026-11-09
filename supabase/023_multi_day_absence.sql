begin;

alter table public.attendance
  add column if not exists absence_ends_on date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'attendance_absence_period_valid'
      and conrelid = 'public.attendance'::regclass
  ) then
    alter table public.attendance
      add constraint attendance_absence_period_valid
      check (
        absence_ends_on is null
        or (
          status in ('absent_sick', 'absent_leave')
          and absence_ends_on >= date
          and absence_ends_on <= date + 30
        )
      );
  end if;
end $$;

create or replace function public.normalize_attendance_absence_period()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status not in ('absent_sick', 'absent_leave') then
    new.absence_ends_on := null;
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_attendance_absence_period on public.attendance;
create trigger normalize_attendance_absence_period
before insert or update of status, absence_ends_on on public.attendance
for each row execute function public.normalize_attendance_absence_period();

create or replace function public.cancel_remaining_absence_period()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  keep_through date;
begin
  if old.absence_ends_on is null then return new; end if;

  keep_through := case
    when new.status in ('absent_sick', 'absent_leave') then coalesce(new.absence_ends_on, new.date)
    else new.date
  end;

  if keep_through < old.absence_ends_on then
    delete from public.attendance
    where child_id = new.child_id
      and date > keep_through
      and date <= old.absence_ends_on
      and status in ('absent_sick', 'absent_leave')
      and absence_ends_on = old.absence_ends_on;
  end if;
  return new;
end;
$$;

drop trigger if exists cancel_remaining_absence_period on public.attendance;
create trigger cancel_remaining_absence_period
after update of status, absence_ends_on on public.attendance
for each row execute function public.cancel_remaining_absence_period();

create or replace function public.save_attendance_period(
  target_child_id uuid,
  plan_status public.attendance_status,
  plan_ends_on date,
  plan_absence_note text
)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_attendance public.attendance;
  target_date date;
  normalized_note text := nullif(trim(plan_absence_note), '');
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not public.is_guardian(target_child_id) then raise exception 'Du är inte vårdnadshavare för barnet'; end if;
  if plan_status not in ('absent_sick', 'absent_leave') then raise exception 'Endast sjukdom eller ledighet kan registreras för flera dagar'; end if;
  if plan_ends_on is null or plan_ends_on < current_date then raise exception 'Slutdatumet kan inte vara före idag'; end if;
  if plan_ends_on > current_date + 30 then raise exception 'Frånvaro kan registreras högst 31 dagar åt gången'; end if;
  if char_length(coalesce(normalized_note, '')) > 500 then raise exception 'Frånvaroorsaken är för lång'; end if;
  if exists (
    select 1 from public.attendance
    where child_id = target_child_id
      and date = current_date
      and checked_in_at is not null
      and checked_out_at is null
  ) then
    raise exception 'Barnet är redan incheckat och måste checkas ut av personalen först';
  end if;

  for target_date in
    select day::date
    from generate_series(current_date, plan_ends_on, interval '1 day') day
    where extract(isodow from day) < 6
  loop
    insert into public.attendance (
      child_id, date, status, dropoff_at, pickup_at, pickup_by, absence_note,
      absence_ends_on, updated_by, updated_at
    ) values (
      target_child_id, target_date, plan_status, null, null, null, normalized_note,
      plan_ends_on, public.current_profile_id(), now()
    )
    on conflict (child_id, date) do update
    set status = excluded.status,
        dropoff_at = null,
        pickup_at = null,
        pickup_by = null,
        absence_note = excluded.absence_note,
        absence_ends_on = excluded.absence_ends_on,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
  end loop;

  select * into saved_attendance
  from public.attendance
  where child_id = target_child_id and date = current_date;

  return saved_attendance;
end;
$$;

revoke all on function public.normalize_attendance_absence_period() from public;
revoke all on function public.cancel_remaining_absence_period() from public;
revoke all on function public.save_attendance_period(uuid, public.attendance_status, date, text) from public;
grant execute on function public.save_attendance_period(uuid, public.attendance_status, date, text) to authenticated;

commit;
