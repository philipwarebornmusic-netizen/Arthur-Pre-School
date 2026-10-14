begin;

create or replace function public.register_guardian_child(
  child_name text,
  child_birth_date date,
  child_department_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_profile public.profiles;
  new_child public.children;
begin
  select * into account_profile
  from public.profiles
  where auth_user_id = auth.uid();

  if not found or account_profile.role <> 'parent' then
    raise exception 'Endast vårdnadshavare kan registrera sina barn';
  end if;
  if trim(coalesce(child_name, '')) = '' then
    raise exception 'Barnets namn måste anges';
  end if;
  if child_birth_date is null or child_birth_date > current_date then
    raise exception 'Ange ett giltigt födelsedatum';
  end if;
  if not exists (
    select 1
    from public.departments d
    join public.preschools p on p.id = d.preschool_id
    where d.id = child_department_id
      and p.organization_id = account_profile.organization_id
  ) then
    raise exception 'Avdelningen tillhör inte din organisation';
  end if;

  insert into public.children (department_id, name, birth_date)
  values (child_department_id, trim(child_name), child_birth_date)
  returning * into new_child;

  insert into public.child_guardians (child_id, profile_id, relation, can_pickup)
  values (new_child.id, account_profile.id, 'Vårdnadshavare', true);

  return jsonb_build_object('child_id', new_child.id);
end;
$$;

revoke all on function public.register_guardian_child(text, date, uuid) from public;
grant execute on function public.register_guardian_child(text, date, uuid) to authenticated;

commit;
