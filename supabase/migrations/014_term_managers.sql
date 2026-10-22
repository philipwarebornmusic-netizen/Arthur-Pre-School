-- Let an administrator delegate term-schedule management to selected teachers.
-- A grant covers the schools where that staff member is assigned. It does not
-- change who can edit child information or weekly schedules.
-- Run in the Supabase SQL editor after approval. Safe to run more than once.
-- Requires the earlier migrations, including profiles.removed_at from 009.
-- Existing term function signatures are unchanged.

begin;

create table if not exists public.term_managers (
  preschool_id uuid not null references public.preschools(id) on delete cascade,
  staff_profile_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (preschool_id, staff_profile_id)
);

create table if not exists public.term_manager_events (
  id uuid primary key default gen_random_uuid(),
  preschool_id uuid not null references public.preschools(id) on delete cascade,
  staff_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('granted', 'revoked')),
  created_at timestamptz not null default now()
);

create index if not exists idx_term_managers_staff
  on public.term_managers (staff_profile_id);

create index if not exists idx_term_manager_events_staff_created
  on public.term_manager_events (staff_profile_id, created_at desc);

alter table public.term_managers enable row level security;
alter table public.term_manager_events enable row level security;

revoke all on table public.term_managers from public, anon, authenticated;
revoke all on table public.term_manager_events from public, anon, authenticated;

-- Admin of the organization, or a staff member explicitly granted for this school
-- and still assigned to one of its departments.
create or replace function public.can_manage_terms(school_id uuid)
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
      from public.preschools school
      where school.id = school_id
        and school.organization_id = public.current_organization_id()
    )
    and (
      public.is_admin()
      or exists (
        select 1
        from public.term_managers grant_row
        join public.profiles staff on staff.id = grant_row.staff_profile_id
        where grant_row.preschool_id = school_id
          and grant_row.staff_profile_id = public.current_profile_id()
          and staff.role = 'staff'
          and staff.removed_at is null
          and exists (
            select 1
            from public.staff_departments assignment
            join public.departments department on department.id = assignment.department_id
            where assignment.staff_id = staff.id
              and department.preschool_id = school_id
          )
      )
    )
$$;

create or replace function public.can_manage_preschool_term(target_preschool_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_terms(target_preschool_id)
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
          public.can_manage_terms(school.id)
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

create or replace function public.set_term_manager(staff_profile_id uuid, enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := public.current_profile_id();
  target public.profiles;
  school_id uuid;
begin
  if auth.uid() is null or caller_id is null or not public.is_admin() then
    raise exception 'Endast administratörer kan ändra vem som hanterar terminer';
  end if;
  if enabled is null then
    raise exception 'Ange om behörigheten ska vara på eller av';
  end if;

  select profile.* into target
  from public.profiles profile
  where profile.id = set_term_manager.staff_profile_id
    and profile.organization_id = public.current_organization_id()
    and profile.removed_at is null
  for update;
  if not found or target.role <> 'staff' then
    raise exception 'Personen är inte personal i organisationen';
  end if;

  if enabled then
    if not exists (
      select 1
      from public.staff_departments assignment
      join public.departments department on department.id = assignment.department_id
      join public.preschools school on school.id = department.preschool_id
      where assignment.staff_id = target.id
        and school.organization_id = public.current_organization_id()
    ) then
      raise exception 'Personen är inte kopplad till en skola';
    end if;

    for school_id in
      select distinct school.id
      from public.staff_departments assignment
      join public.departments department on department.id = assignment.department_id
      join public.preschools school on school.id = department.preschool_id
      where assignment.staff_id = target.id
        and school.organization_id = public.current_organization_id()
    loop
      if not exists (
        select 1 from public.term_managers grant_row
        where grant_row.preschool_id = school_id
          and grant_row.staff_profile_id = target.id
      ) then
        insert into public.term_managers (preschool_id, staff_profile_id, granted_by)
        values (school_id, target.id, caller_id);
        insert into public.term_manager_events (preschool_id, staff_profile_id, actor_id, action)
        values (school_id, target.id, caller_id, 'granted');
      end if;
    end loop;
  else
    for school_id in
      select grant_row.preschool_id
      from public.term_managers grant_row
      join public.preschools school on school.id = grant_row.preschool_id
      where grant_row.staff_profile_id = target.id
        and school.organization_id = public.current_organization_id()
    loop
      delete from public.term_managers grant_row
      where grant_row.preschool_id = school_id
        and grant_row.staff_profile_id = target.id;
      insert into public.term_manager_events (preschool_id, staff_profile_id, actor_id, action)
      values (school_id, target.id, caller_id, 'revoked');
    end loop;
  end if;
end;
$$;

create or replace function public.list_term_managers()
returns table (
  staff_profile_id uuid,
  preschool_id uuid,
  preschool_name text,
  granted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Endast administratörer kan se vem som hanterar terminer';
  end if;
  return query
  select grant_row.staff_profile_id, grant_row.preschool_id, school.name, grant_row.granted_at
  from public.term_managers grant_row
  join public.preschools school on school.id = grant_row.preschool_id
  join public.profiles staff on staff.id = grant_row.staff_profile_id
  where school.organization_id = public.current_organization_id()
    and staff.role = 'staff'
    and staff.removed_at is null
  order by staff.name, school.name;
end;
$$;

create or replace function public.my_term_permissions()
returns table (
  preschool_id uuid,
  can_manage boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select school.id, true
  from public.preschools school
  where auth.uid() is not null
    and school.organization_id = public.current_organization_id()
    and public.can_manage_terms(school.id)
$$;

revoke all on function public.can_manage_terms(uuid) from public, anon, authenticated;
revoke all on function public.can_manage_preschool_term(uuid) from public, anon, authenticated;
revoke all on function public.can_read_school_term(uuid) from public, anon, authenticated;
revoke all on function public.set_term_manager(uuid, boolean) from public, anon, authenticated;
revoke all on function public.list_term_managers() from public, anon, authenticated;
revoke all on function public.my_term_permissions() from public, anon, authenticated;

grant execute on function public.set_term_manager(uuid, boolean) to authenticated;
grant execute on function public.list_term_managers() to authenticated;
grant execute on function public.my_term_permissions() to authenticated;

commit;
