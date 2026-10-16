begin;

alter table public.private_messages
  add column if not exists delivery_group_id uuid not null default gen_random_uuid();

create index if not exists idx_private_messages_delivery_group
  on public.private_messages(delivery_group_id, created_at);

create or replace function public.list_guardian_message_targets()
returns table (
  child_id uuid,
  child_name text,
  guardian_id uuid,
  guardian_name text,
  guardian_relation text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    child.id,
    child.name,
    guardian.profile_id,
    profile.name,
    guardian.relation
  from public.children child
  join public.child_guardians guardian on guardian.child_id = child.id
  join public.profiles profile on profile.id = guardian.profile_id and profile.role = 'parent'
  where public.is_admin_for_department(child.department_id)
     or public.is_staff_for_department(child.department_id)
  order by child.name, profile.name
$$;

drop function if exists public.list_private_messages();
create function public.list_private_messages()
returns table (
  message_id uuid,
  delivery_group_id uuid,
  sender_id uuid,
  sender_name text,
  recipient_id uuid,
  recipient_name text,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    message.id,
    message.delivery_group_id,
    message.sender_id,
    sender.name,
    message.recipient_id,
    recipient.name,
    message.body,
    message.created_at
  from public.private_messages message
  join public.profiles sender on sender.id = message.sender_id
  join public.profiles recipient on recipient.id = message.recipient_id
  where message.sender_id = public.current_profile_id()
     or message.recipient_id = public.current_profile_id()
  order by message.created_at, message.id
$$;

create or replace function public.send_private_message_group(
  message_body text,
  target_profile_id uuid default null,
  target_child_id uuid default null,
  send_to_all_guardians boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_ids uuid[];
  delivery_id uuid := gen_random_uuid();
begin
  if char_length(trim(coalesce(message_body, ''))) not between 1 and 2000 then
    raise exception 'Meddelandet måste innehålla mellan 1 och 2000 tecken';
  end if;

  if send_to_all_guardians then
    if target_child_id is null or target_profile_id is not null then
      raise exception 'Välj ett barn för utskick till alla vårdnadshavare';
    end if;
    if not exists (
      select 1
      from public.children child
      where child.id = target_child_id
        and (
          public.is_admin_for_department(child.department_id)
          or public.is_staff_for_department(child.department_id)
        )
    ) then
      raise exception 'Du saknar behörighet till barnets vårdnadshavare';
    end if;

    select array_agg(distinct guardian.profile_id order by guardian.profile_id)
    into recipient_ids
    from public.child_guardians guardian
    join public.profiles profile on profile.id = guardian.profile_id and profile.role = 'parent'
    where guardian.child_id = target_child_id;
  else
    if target_profile_id is null or target_child_id is not null then
      raise exception 'Välj exakt en mottagare';
    end if;
    recipient_ids := array[target_profile_id];
  end if;

  if coalesce(array_length(recipient_ids, 1), 0) not between 1 and 20 then
    raise exception 'Meddelandet måste ha mellan 1 och 20 mottagare';
  end if;
  if exists (
    select 1
    from unnest(recipient_ids) as recipient(profile_id)
    where not public.can_private_message(public.current_profile_id(), recipient.profile_id)
  ) then
    raise exception 'Privata meddelanden är inte tillåtna till alla valda mottagare';
  end if;

  insert into public.private_messages (organization_id, sender_id, recipient_id, delivery_group_id, body)
  select
    public.current_organization_id(),
    public.current_profile_id(),
    recipient.profile_id,
    delivery_id,
    trim(message_body)
  from unnest(recipient_ids) as recipient(profile_id);

  return delivery_id;
end;
$$;

drop function if exists public.send_private_message(uuid, text);

revoke all on function public.list_guardian_message_targets() from public;
revoke all on function public.list_private_messages() from public;
revoke all on function public.send_private_message_group(text, uuid, uuid, boolean) from public;
grant execute on function public.list_guardian_message_targets() to authenticated;
grant execute on function public.list_private_messages() to authenticated;
grant execute on function public.send_private_message_group(text, uuid, uuid, boolean) to authenticated;

commit;
