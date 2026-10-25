-- A guardian may always see their own child's profile photo in the class list.
-- Consent still controls whether other families can see it.

begin;

create or replace function public.list_class_list()
returns table (
  child_id uuid,
  display_name text,
  photo_path text,
  department_id uuid,
  department_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_profile_id() is null then
    raise exception 'Du måste vara inloggad';
  end if;
  if public.current_role() is distinct from 'parent' then
    raise exception 'Klasslistan visas för vårdnadshavare';
  end if;
  return query
  select
    listed.child_id,
    listed.display_name,
    listed.photo_path,
    listed.department_id,
    listed.department_name
  from (
    select
      child.id as child_id,
      case
        when count(*) over (partition by split_part(btrim(child.name), ' ', 1)) > 1 then btrim(child.name)
        else split_part(btrim(child.name), ' ', 1)
      end as display_name,
      case
        when public.is_guardian(child.id) or public.class_list_photo_allowed(child.id) then child.photo_path
        else null
      end as photo_path,
      child.department_id,
      department.name as department_name,
      split_part(btrim(child.name), ' ', 1) as first_name
    from public.children child
    join public.departments department on department.id = child.department_id
    where public.class_list_name_allowed(child.id)
      and child.department_id in (
        select mine.department_id
        from public.children mine
        join public.child_guardians link
          on link.child_id = mine.id
         and link.profile_id = public.current_profile_id()
      )
  ) listed
  order by listed.department_name, listed.display_name, listed.first_name;
end;
$$;

revoke all on function public.list_class_list() from public, anon, authenticated;
grant execute on function public.list_class_list() to authenticated;

commit;
