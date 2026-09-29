-- Arthur Pilot v1 additive invite model
-- Run after schema.sql has already been applied.

create extension if not exists "pgcrypto";

do $$ begin
  create type public.invite_status as enum ('pending', 'accepted', 'revoked', 'expired');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  preschool_id uuid references public.preschools(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  child_id uuid references public.children(id) on delete cascade,
  email text,
  role public.user_role not null,
  relation text,
  code text unique not null default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10)),
  status public.invite_status not null default 'pending',
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  max_uses int not null default 1,
  uses_count int not null default 0,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_role_target check (
    (role = 'parent' and child_id is not null)
    or (role = 'staff' and department_id is not null)
    or (role = 'admin' and organization_id is not null)
  )
);

create index if not exists idx_invitations_code on public.invitations(code);
create index if not exists idx_invitations_child_id on public.invitations(child_id);
create index if not exists idx_invitations_department_id on public.invitations(department_id);
create index if not exists idx_invitations_email on public.invitations(email);

alter table public.invitations enable row level security;

drop policy if exists "invites validate by code" on public.invitations;
create policy "invites validate by code" on public.invitations
for select using (
  status = 'pending'
  and uses_count < max_uses
  and (expires_at is null or expires_at > now())
);

drop policy if exists "invites admin read" on public.invitations;
create policy "invites admin read" on public.invitations
for select using (public.is_admin());

drop policy if exists "invites staff read own child invites" on public.invitations;
create policy "invites staff read own child invites" on public.invitations
for select using (
  role = 'parent'
  and child_id is not null
  and public.is_staff_for_child(child_id)
);

drop policy if exists "invites admin write" on public.invitations;
create policy "invites admin write" on public.invitations
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "invites staff create parent invites" on public.invitations;
create policy "invites staff create parent invites" on public.invitations
for insert with check (
  role = 'parent'
  and child_id is not null
  and public.is_staff_for_child(child_id)
);

create or replace function public.accept_invitation(invite_code text)
returns public.invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.invitations;
  profile_id uuid;
begin
  select * into invite
  from public.invitations
  where code = upper(invite_code)
    and status = 'pending'
    and uses_count < max_uses
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    raise exception 'Invalid or expired invitation code';
  end if;

  select public.current_profile_id() into profile_id;
  if profile_id is null then
    raise exception 'No profile for current user';
  end if;

  update public.profiles
  set organization_id = invite.organization_id,
      role = invite.role
  where id = profile_id;

  if invite.role = 'parent' then
    insert into public.child_guardians (child_id, profile_id, relation, can_pickup)
    values (invite.child_id, profile_id, coalesce(invite.relation, 'Vårdnadshavare'), true)
    on conflict (child_id, profile_id) do update set relation = excluded.relation, can_pickup = true;
  elsif invite.role = 'staff' then
    insert into public.staff_departments (staff_id, department_id)
    values (profile_id, invite.department_id)
    on conflict do nothing;
  end if;

  update public.invitations
  set uses_count = uses_count + 1,
      status = case when uses_count + 1 >= max_uses then 'accepted'::public.invite_status else status end,
      accepted_by = profile_id,
      accepted_at = now()
  where id = invite.id
  returning * into invite;

  return invite;
end;
$$;
