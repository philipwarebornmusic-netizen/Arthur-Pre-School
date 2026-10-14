begin;

alter table public.profiles add column if not exists allow_parent_messages boolean not null default false;
alter table public.profiles add column if not exists allow_playdate_requests boolean not null default false;

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.private_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create table if not exists public.community_playdate_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(trim(message)) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> recipient_id)
);

create index if not exists idx_post_comments_post_created on public.post_comments(post_id, created_at);
create index if not exists idx_private_messages_sender_created on public.private_messages(sender_id, created_at desc);
create index if not exists idx_private_messages_recipient_created on public.private_messages(recipient_id, created_at desc);
create index if not exists idx_playdate_sender_created on public.community_playdate_requests(sender_id, created_at desc);
create index if not exists idx_playdate_recipient_created on public.community_playdate_requests(recipient_id, created_at desc);

create or replace function public.profiles_share_department(first_profile uuid, second_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.child_guardians first_guardian
    join public.children first_child on first_child.id = first_guardian.child_id
    join public.children second_child on second_child.department_id = first_child.department_id
    join public.child_guardians second_guardian on second_guardian.child_id = second_child.id
    where first_guardian.profile_id = first_profile
      and second_guardian.profile_id = second_profile
  )
$$;

create or replace function public.staff_parent_share_department(staff_profile uuid, parent_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_departments assignment
    join public.children child on child.department_id = assignment.department_id
    join public.child_guardians guardian on guardian.child_id = child.id
    where assignment.staff_id = staff_profile
      and guardian.profile_id = parent_profile
  )
$$;

create or replace function public.can_private_message(first_profile uuid, second_profile uuid)
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
      and case
        when first_account.role = 'parent' and second_account.role = 'parent' then
          first_account.allow_parent_messages
          and second_account.allow_parent_messages
          and public.profiles_share_department(first_account.id, second_account.id)
        when first_account.role = 'parent' and second_account.role = 'admin' then true
        when first_account.role = 'admin' and second_account.role = 'parent' then true
        when first_account.role = 'parent' and second_account.role = 'staff' then
          public.staff_parent_share_department(second_account.id, first_account.id)
        when first_account.role = 'staff' and second_account.role = 'parent' then
          public.staff_parent_share_department(first_account.id, second_account.id)
        else first_account.role in ('staff', 'admin') and second_account.role in ('staff', 'admin')
      end
  )
$$;

create or replace function public.can_playdate_request(first_profile uuid, second_profile uuid)
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
      and first_account.allow_playdate_requests
      and second_account.allow_playdate_requests
      and public.profiles_share_department(first_account.id, second_account.id)
  )
$$;

create or replace function public.can_read_post(target_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.posts post
    where post.id = target_post_id
      and (
        public.is_admin_for_department(post.department_id)
        or public.is_staff_for_department(post.department_id)
        or (post.child_id is not null and public.is_guardian(post.child_id))
        or (post.child_id is null and public.is_guardian_for_department(post.department_id))
      )
  )
$$;

create or replace function public.list_community_members()
returns table (
  profile_id uuid,
  display_name text,
  profile_role public.user_role,
  can_message boolean,
  can_playdate boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    candidate.id,
    candidate.name,
    candidate.role,
    public.can_private_message(public.current_profile_id(), candidate.id),
    public.can_playdate_request(public.current_profile_id(), candidate.id)
  from public.profiles candidate
  where candidate.organization_id = public.current_organization_id()
    and candidate.id <> public.current_profile_id()
    and (
      public.can_private_message(public.current_profile_id(), candidate.id)
      or public.can_playdate_request(public.current_profile_id(), candidate.id)
    )
  order by candidate.role, candidate.name
$$;

create or replace function public.list_post_comments()
returns table (
  comment_id uuid,
  post_id uuid,
  author_id uuid,
  author_name text,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select comment.id, comment.post_id, comment.author_id, author.name, comment.body, comment.created_at
  from public.post_comments comment
  join public.profiles author on author.id = comment.author_id
  where public.can_read_post(comment.post_id)
  order by comment.created_at
$$;

create or replace function public.list_private_messages()
returns table (
  message_id uuid,
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
  select message.id, message.sender_id, sender.name, message.recipient_id, recipient.name, message.body, message.created_at
  from public.private_messages message
  join public.profiles sender on sender.id = message.sender_id
  join public.profiles recipient on recipient.id = message.recipient_id
  where message.sender_id = public.current_profile_id()
     or message.recipient_id = public.current_profile_id()
  order by message.created_at
$$;

create or replace function public.send_private_message(target_profile_id uuid, message_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_message_id uuid;
begin
  if not public.can_private_message(public.current_profile_id(), target_profile_id) then
    raise exception 'Privata meddelanden är inte tillåtna mellan dessa konton';
  end if;
  if char_length(trim(coalesce(message_body, ''))) not between 1 and 2000 then
    raise exception 'Meddelandet måste innehålla mellan 1 och 2000 tecken';
  end if;

  insert into public.private_messages (organization_id, sender_id, recipient_id, body)
  values (public.current_organization_id(), public.current_profile_id(), target_profile_id, trim(message_body))
  returning id into new_message_id;
  return new_message_id;
end;
$$;

create or replace function public.list_playdate_requests()
returns table (
  request_id uuid,
  sender_id uuid,
  sender_name text,
  recipient_id uuid,
  recipient_name text,
  message text,
  status text,
  created_at timestamptz,
  responded_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select request.id, request.sender_id, sender.name, request.recipient_id, recipient.name,
    request.message, request.status, request.created_at, request.responded_at
  from public.community_playdate_requests request
  join public.profiles sender on sender.id = request.sender_id
  join public.profiles recipient on recipient.id = request.recipient_id
  where request.sender_id = public.current_profile_id()
     or request.recipient_id = public.current_profile_id()
  order by request.created_at desc
$$;

create or replace function public.create_playdate_request(target_profile_id uuid, request_message text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_request_id uuid;
begin
  if not public.can_playdate_request(public.current_profile_id(), target_profile_id) then
    raise exception 'Båda vårdnadshavarna måste ha aktiverat lekförfrågningar och tillhöra samma avdelning';
  end if;
  if char_length(trim(coalesce(request_message, ''))) not between 1 and 1000 then
    raise exception 'Förfrågan måste innehålla mellan 1 och 1000 tecken';
  end if;
  if exists (
    select 1 from public.community_playdate_requests request
    where request.status = 'pending'
      and (
        (request.sender_id = public.current_profile_id() and request.recipient_id = target_profile_id)
        or (request.sender_id = target_profile_id and request.recipient_id = public.current_profile_id())
      )
  ) then
    raise exception 'Det finns redan en väntande lekförfrågan mellan er';
  end if;

  insert into public.community_playdate_requests (organization_id, sender_id, recipient_id, message)
  values (public.current_organization_id(), public.current_profile_id(), target_profile_id, trim(request_message))
  returning id into new_request_id;
  return new_request_id;
end;
$$;

create or replace function public.respond_playdate_request(target_request_id uuid, response_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if response_status not in ('accepted', 'declined') then
    raise exception 'Ogiltigt svar på lekförfrågan';
  end if;
  update public.community_playdate_requests
  set status = response_status, responded_at = now()
  where id = target_request_id
    and recipient_id = public.current_profile_id()
    and status = 'pending';
  if not found then raise exception 'Lekförfrågan hittades inte eller är redan besvarad'; end if;
end;
$$;

alter table public.post_comments enable row level security;
alter table public.private_messages enable row level security;
alter table public.community_playdate_requests enable row level security;

drop policy if exists "comment authorized read" on public.post_comments;
drop policy if exists "comment authorized insert" on public.post_comments;
drop policy if exists "comment author or staff delete" on public.post_comments;
drop policy if exists "private message participant read" on public.private_messages;
drop policy if exists "playdate participant read" on public.community_playdate_requests;

create policy "comment authorized read" on public.post_comments
for select using (public.can_read_post(post_id));
create policy "comment authorized insert" on public.post_comments
for insert with check (author_id = public.current_profile_id() and public.can_read_post(post_id));
create policy "comment author or staff delete" on public.post_comments
for delete using (
  author_id = public.current_profile_id()
  or exists (
    select 1 from public.posts post
    where post.id = post_id
      and (public.is_admin_for_department(post.department_id) or public.is_staff_for_department(post.department_id))
  )
);
create policy "private message participant read" on public.private_messages
for select using (sender_id = public.current_profile_id() or recipient_id = public.current_profile_id());
create policy "playdate participant read" on public.community_playdate_requests
for select using (sender_id = public.current_profile_id() or recipient_id = public.current_profile_id());

revoke all on public.private_messages, public.community_playdate_requests from anon, authenticated;
grant select, insert, delete on public.post_comments to authenticated;
grant select on public.private_messages, public.community_playdate_requests to authenticated;

revoke all on function public.profiles_share_department(uuid, uuid) from public;
revoke all on function public.staff_parent_share_department(uuid, uuid) from public;
revoke all on function public.can_private_message(uuid, uuid) from public;
revoke all on function public.can_playdate_request(uuid, uuid) from public;
revoke all on function public.can_read_post(uuid) from public;
revoke all on function public.list_community_members() from public;
revoke all on function public.list_post_comments() from public;
revoke all on function public.list_private_messages() from public;
revoke all on function public.send_private_message(uuid, text) from public;
revoke all on function public.list_playdate_requests() from public;
revoke all on function public.create_playdate_request(uuid, text) from public;
revoke all on function public.respond_playdate_request(uuid, text) from public;

grant execute on function public.can_read_post(uuid) to authenticated;
grant execute on function public.list_community_members() to authenticated;
grant execute on function public.list_post_comments() to authenticated;
grant execute on function public.list_private_messages() to authenticated;
grant execute on function public.send_private_message(uuid, text) to authenticated;
grant execute on function public.list_playdate_requests() to authenticated;
grant execute on function public.create_playdate_request(uuid, text) to authenticated;
grant execute on function public.respond_playdate_request(uuid, text) to authenticated;

revoke update on public.profiles from authenticated;
grant update (name, phone, allow_parent_messages, allow_playdate_requests) on public.profiles to authenticated;

commit;
