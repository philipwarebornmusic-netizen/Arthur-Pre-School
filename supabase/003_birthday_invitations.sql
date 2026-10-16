begin;

alter table public.profiles add column if not exists allow_birthday_invitations boolean not null default false;

create table if not exists public.birthday_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  host_parent_id uuid not null references public.profiles(id) on delete cascade,
  host_child_id uuid not null references public.children(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null check (char_length(trim(location)) between 1 and 300),
  message text not null default '' check (char_length(message) <= 2000),
  rsvp_by date not null,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (ends_at > starts_at)
);

create table if not exists public.birthday_invitation_recipients (
  invitation_id uuid not null references public.birthday_invitations(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  primary key (invitation_id, recipient_id)
);

create index if not exists idx_birthday_invitations_host_created
  on public.birthday_invitations(host_parent_id, created_at desc);
create index if not exists idx_birthday_invitations_organization_start
  on public.birthday_invitations(organization_id, starts_at);
create index if not exists idx_birthday_recipients_recipient
  on public.birthday_invitation_recipients(recipient_id, invitation_id);

create or replace function public.can_birthday_invite(first_profile uuid, second_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles first_account
    join public.profiles second_account on second_account.id = second_profile
    where first_account.id = first_profile
      and first_account.id <> second_account.id
      and first_account.organization_id = second_account.organization_id
      and first_account.role = 'parent'
      and second_account.role = 'parent'
      and first_account.allow_birthday_invitations
      and second_account.allow_birthday_invitations
      and public.profiles_share_department(first_account.id, second_account.id)
  )
$$;

create or replace function public.list_birthday_candidates()
returns table (
  profile_id uuid,
  display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select candidate.id, candidate.name
  from public.profiles candidate
  where candidate.organization_id = public.current_organization_id()
    and candidate.id <> public.current_profile_id()
    and public.can_birthday_invite(public.current_profile_id(), candidate.id)
  order by candidate.name
$$;

create or replace function public.list_birthday_invitations()
returns table (
  invitation_id uuid,
  host_parent_id uuid,
  host_parent_name text,
  host_child_name text,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  message text,
  rsvp_by date,
  invitation_status text,
  recipient_id uuid,
  recipient_name text,
  response_status text,
  responded_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    invitation.id,
    invitation.host_parent_id,
    host.name,
    child.name,
    invitation.title,
    invitation.starts_at,
    invitation.ends_at,
    invitation.location,
    invitation.message,
    invitation.rsvp_by,
    invitation.status,
    recipient.recipient_id,
    recipient_profile.name,
    recipient.status,
    recipient.responded_at,
    invitation.created_at
  from public.birthday_invitations invitation
  join public.profiles host on host.id = invitation.host_parent_id
  join public.children child on child.id = invitation.host_child_id
  join public.birthday_invitation_recipients recipient on recipient.invitation_id = invitation.id
  join public.profiles recipient_profile on recipient_profile.id = recipient.recipient_id
  where invitation.host_parent_id = public.current_profile_id()
     or recipient.recipient_id = public.current_profile_id()
  order by invitation.starts_at desc, recipient_profile.name
$$;

create or replace function public.create_birthday_invitation(
  host_child_id uuid,
  invitation_title text,
  invitation_starts_at timestamptz,
  invitation_ends_at timestamptz,
  invitation_location text,
  invitation_message text,
  invitation_rsvp_by date,
  recipient_profile_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  account_profile public.profiles;
  clean_recipient_ids uuid[];
  new_invitation_id uuid;
begin
  select * into account_profile
  from public.profiles
  where id = public.current_profile_id();

  if not found or account_profile.role <> 'parent' or not account_profile.allow_birthday_invitations then
    raise exception 'Aktivera kalasinbjudningar innan du skapar ett kalas';
  end if;
  if not public.is_guardian(host_child_id) then
    raise exception 'Du kan bara skapa kalas för dina egna barn';
  end if;
  if not exists (
    select 1
    from public.children child
    join public.departments department on department.id = child.department_id
    join public.preschools preschool on preschool.id = department.preschool_id
    where child.id = host_child_id
      and preschool.organization_id = account_profile.organization_id
  ) then
    raise exception 'Barnet tillhör inte din organisation';
  end if;
  if char_length(trim(coalesce(invitation_title, ''))) not between 1 and 120 then
    raise exception 'Rubriken måste innehålla mellan 1 och 120 tecken';
  end if;
  if char_length(trim(coalesce(invitation_location, ''))) not between 1 and 300 then
    raise exception 'Platsen måste innehålla mellan 1 och 300 tecken';
  end if;
  if char_length(coalesce(invitation_message, '')) > 2000 then
    raise exception 'Meddelandet får innehålla högst 2000 tecken';
  end if;
  if invitation_starts_at is null or invitation_starts_at <= now() then
    raise exception 'Kalastiden måste ligga i framtiden';
  end if;
  if invitation_ends_at is null or invitation_ends_at <= invitation_starts_at then
    raise exception 'Sluttiden måste ligga efter starttiden';
  end if;
  if invitation_rsvp_by is null
    or invitation_rsvp_by < current_date
    or invitation_rsvp_by > (invitation_starts_at at time zone 'Europe/Stockholm')::date then
    raise exception 'OSA-datumet måste ligga mellan idag och kalasdagen';
  end if;
  if recipient_profile_ids is null or cardinality(recipient_profile_ids) not between 1 and 50 then
    raise exception 'Välj mellan 1 och 50 mottagare';
  end if;

  select array_agg(recipient_id order by recipient_id)
  into clean_recipient_ids
  from (
    select distinct candidate.recipient_id
    from unnest(recipient_profile_ids) as candidate(recipient_id)
    where candidate.recipient_id is not null
  ) distinct_recipients;

  if clean_recipient_ids is null or cardinality(clean_recipient_ids) <> cardinality(recipient_profile_ids) then
    raise exception 'Mottagarlistan innehåller tomma eller dubbla mottagare';
  end if;
  if exists (
    select 1
    from unnest(clean_recipient_ids) as candidate(recipient_id)
    where not public.can_birthday_invite(account_profile.id, candidate.recipient_id)
  ) then
    raise exception 'Alla mottagare måste ha aktiverat kalasinbjudningar och dela avdelning med dig';
  end if;

  insert into public.birthday_invitations (
    organization_id,
    host_parent_id,
    host_child_id,
    title,
    starts_at,
    ends_at,
    location,
    message,
    rsvp_by
  ) values (
    account_profile.organization_id,
    account_profile.id,
    host_child_id,
    trim(invitation_title),
    invitation_starts_at,
    invitation_ends_at,
    trim(invitation_location),
    trim(coalesce(invitation_message, '')),
    invitation_rsvp_by
  ) returning id into new_invitation_id;

  insert into public.birthday_invitation_recipients (invitation_id, recipient_id)
  select new_invitation_id, recipient.recipient_id
  from unnest(clean_recipient_ids) as recipient(recipient_id);

  return new_invitation_id;
end;
$$;

create or replace function public.respond_birthday_invitation(target_invitation_id uuid, response_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if response_status not in ('accepted', 'declined') then
    raise exception 'Ogiltigt svar på kalasinbjudan';
  end if;

  update public.birthday_invitation_recipients recipient
  set status = response_status, responded_at = now()
  from public.birthday_invitations invitation
  where recipient.invitation_id = target_invitation_id
    and recipient.recipient_id = public.current_profile_id()
    and recipient.status = 'pending'
    and invitation.id = recipient.invitation_id
    and invitation.status = 'active'
    and invitation.starts_at > now()
    and invitation.rsvp_by >= current_date;

  if not found then
    raise exception 'Inbjudan hittades inte, är stängd eller är redan besvarad';
  end if;
end;
$$;

create or replace function public.cancel_birthday_invitation(target_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.birthday_invitations
  set status = 'cancelled', cancelled_at = now()
  where id = target_invitation_id
    and host_parent_id = public.current_profile_id()
    and status = 'active';

  if not found then
    raise exception 'Inbjudan hittades inte eller är redan avbruten';
  end if;
end;
$$;

create or replace function public.delete_birthday_invitation(target_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.birthday_invitations
  where id = target_invitation_id
    and host_parent_id = public.current_profile_id()
    and (status = 'cancelled' or ends_at < now());

  if not found then
    raise exception 'Endast avbrutna eller avslutade kalas kan tas bort';
  end if;
end;
$$;

alter table public.birthday_invitations enable row level security;
alter table public.birthday_invitation_recipients enable row level security;


revoke all on public.birthday_invitations, public.birthday_invitation_recipients from anon, authenticated;

revoke all on function public.can_birthday_invite(uuid, uuid) from public;
revoke all on function public.list_birthday_candidates() from public;
revoke all on function public.list_birthday_invitations() from public;
revoke all on function public.create_birthday_invitation(uuid, text, timestamptz, timestamptz, text, text, date, uuid[]) from public;
revoke all on function public.respond_birthday_invitation(uuid, text) from public;
revoke all on function public.cancel_birthday_invitation(uuid) from public;
revoke all on function public.delete_birthday_invitation(uuid) from public;

grant execute on function public.list_birthday_candidates() to authenticated;
grant execute on function public.list_birthday_invitations() to authenticated;
grant execute on function public.create_birthday_invitation(uuid, text, timestamptz, timestamptz, text, text, date, uuid[]) to authenticated;
grant execute on function public.respond_birthday_invitation(uuid, text) to authenticated;
grant execute on function public.cancel_birthday_invitation(uuid) to authenticated;
grant execute on function public.delete_birthday_invitation(uuid) to authenticated;

revoke update on public.profiles from authenticated;
grant update (name, phone, allow_parent_messages, allow_playdate_requests, allow_birthday_invitations) on public.profiles to authenticated;

commit;
