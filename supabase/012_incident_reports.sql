-- Incident and deviation reports.
--
-- Run manually in the SQL editor after 010_pickup_passes.sql.
-- 011_guardian_owned_child_info.sql is independent. This file does not
-- change child profile, health, contact, or consent rights, and it does not
-- need 011 to be applied first.
-- Do not run this against production until incident reports should go live.
-- Deploy previews use the production database.
--
-- Nothing in this file deletes rows or drops columns. Reports, addenda,
-- actions, copies, and the event log are append-only after a report is
-- submitted. A draft's child list can be replaced while the author is still
-- editing that draft.
--
-- In-app notices reuse pickup_notices. Existing pickup rows stay kind
-- 'pickup'. list_pickup_notices keeps its old shape and returns only those.
-- Direct table access stays revoked. Callers use the functions below.

begin;

do $$ begin
  create type public.incident_type as enum ('accident', 'near_miss', 'mistreatment', 'other');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.incident_status as enum ('draft', 'submitted', 'investigating', 'closed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.incident_child_role as enum ('affected', 'involved', 'causing');
exception when duplicate_object then null;
end $$;

create table if not exists public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  incident_type public.incident_type not null,
  status public.incident_status not null default 'draft',
  occurred_at timestamptz not null,
  place text not null check (char_length(btrim(place)) between 1 and 160),
  what_happened text not null check (char_length(btrim(what_happened)) between 1 and 5000),
  immediate_actions text not null check (char_length(btrim(immediate_actions)) between 1 and 5000),
  staff_present text not null check (char_length(btrim(staff_present)) between 1 and 2000),
  guardians_contacted text not null check (char_length(btrim(guardians_contacted)) between 1 and 2000),
  injury_type text,
  body_location text,
  first_aid text,
  care text,
  subjected_name text,
  alleged_by text,
  child_experience text,
  investigation_notes text,
  reported_to_principal_at timestamptz,
  closing_summary text,
  submitted_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (injury_type is null or injury_type in (
    'Sår eller skrubbsår', 'Blåmärke', 'Stukning eller vrickning', 'Fraktur',
    'Tandskada', 'Huvudskada', 'Bett', 'Brännskada', 'Annat'
  )),
  check (body_location is null or body_location in (
    'Huvud', 'Ansikte', 'Tänder', 'Hals', 'Arm', 'Hand',
    'Bröst eller mage', 'Rygg', 'Ben', 'Fot', 'Annat'
  )),
  check (care is null or care in ('none', 'primary_care', 'dentist', 'emergency')),
  check (alleged_by is null or alleged_by in ('child', 'staff', 'unknown')),
  check (subjected_name is null or char_length(btrim(subjected_name)) between 1 and 160),
  check (first_aid is null or char_length(btrim(first_aid)) between 1 and 2000),
  check (child_experience is null or char_length(btrim(child_experience)) between 1 and 5000),
  check (investigation_notes is null or char_length(btrim(investigation_notes)) between 1 and 5000),
  check (closing_summary is null or char_length(btrim(closing_summary)) between 1 and 5000)
);

create table if not exists public.incident_children (
  report_id uuid not null references public.incident_reports(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete restrict,
  child_role public.incident_child_role not null,
  primary key (report_id, child_id)
);

create table if not exists public.incident_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.incident_reports(id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 500),
  responsible_id uuid not null references public.profiles(id) on delete restrict,
  due_on date not null,
  done_at timestamptz,
  done_by uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.incident_addenda (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.incident_reports(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create table if not exists public.incident_copies (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.incident_reports(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 8000),
  sent_at timestamptz,
  sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (report_id, child_id)
);

create table if not exists public.incident_copy_recipients (
  copy_id uuid not null references public.incident_copies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  acknowledged_at timestamptz,
  last_reminded_at timestamptz,
  primary key (copy_id, profile_id)
);

create table if not exists public.incident_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.incident_reports(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_kind text not null check (event_kind in (
    'created', 'submitted', 'investigating', 'closed', 'addendum',
    'investigation', 'principal', 'action', 'action_done', 'copy_sent', 'acknowledged'
  )),
  detail text not null check (char_length(btrim(detail)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists idx_incident_reports_org on public.incident_reports(organization_id, status, occurred_at desc);
create index if not exists idx_incident_reports_author on public.incident_reports(author_id, created_at desc);
create index if not exists idx_incident_reports_department on public.incident_reports(department_id, incident_type, status);
create index if not exists idx_incident_children_child on public.incident_children(child_id);
create index if not exists idx_incident_events_report on public.incident_events(report_id, created_at);
create index if not exists idx_incident_copies_report on public.incident_copies(report_id);

alter table public.incident_reports enable row level security;
alter table public.incident_children enable row level security;
alter table public.incident_actions enable row level security;
alter table public.incident_addenda enable row level security;
alter table public.incident_copies enable row level security;
alter table public.incident_copy_recipients enable row level security;
alter table public.incident_events enable row level security;

revoke all on table public.incident_reports from public, anon, authenticated;
revoke all on table public.incident_children from public, anon, authenticated;
revoke all on table public.incident_actions from public, anon, authenticated;
revoke all on table public.incident_addenda from public, anon, authenticated;
revoke all on table public.incident_copies from public, anon, authenticated;
revoke all on table public.incident_copy_recipients from public, anon, authenticated;
revoke all on table public.incident_events from public, anon, authenticated;

alter table public.pickup_notices add column if not exists kind text not null default 'pickup';
alter table public.pickup_notices add column if not exists title text;
alter table public.pickup_notices add column if not exists related_id uuid;
alter table public.pickup_notices alter column child_id drop not null;
alter table public.pickup_notices drop constraint if exists pickup_notices_kind_check;
alter table public.pickup_notices add constraint pickup_notices_kind_check
  check (kind in ('pickup', 'incident_submitted', 'incident_copy', 'incident_reminder'));
alter table public.pickup_notices drop constraint if exists pickup_notices_title_check;
alter table public.pickup_notices add constraint pickup_notices_title_check
  check (title is null or char_length(btrim(title)) between 1 and 120);
create index if not exists idx_pickup_notices_kind on public.pickup_notices(profile_id, kind, created_at desc);

create or replace function public.incident_type_label(kind text)
returns text
language sql
immutable
set search_path = public
as $$
  select case kind
    when 'accident' then 'Olycksfall/skada'
    when 'near_miss' then 'Tillbud'
    when 'mistreatment' then 'Kränkande behandling'
    else 'Övrig avvikelse'
  end
$$;

create or replace function public.incident_first_name(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select split_part(btrim(coalesce(value, '')), ' ', 1)
$$;

create or replace function public.incident_can_read(target_report_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  report public.incident_reports;
  caller uuid := public.current_profile_id();
begin
  if caller is null or target_report_id is null then return false; end if;
  select * into report from public.incident_reports where id = target_report_id;
  if not found or report.organization_id is distinct from public.current_organization_id() then
    return false;
  end if;
  if report.status = 'draft' then
    return report.author_id = caller;
  end if;
  if public.is_admin() then return true; end if;
  if report.author_id = caller then return true; end if;
  if public.current_role() = 'staff'
     and report.incident_type in ('accident', 'near_miss')
     and public.is_staff_for_department(report.department_id) then
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.incident_log(
  target_report_id uuid,
  event_kind text,
  event_detail text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.incident_events (report_id, actor_id, event_kind, detail)
  values (target_report_id, public.current_profile_id(), event_kind, btrim(event_detail));
end;
$$;

create or replace function public.incident_notice(
  target_profile_id uuid,
  notice_kind text,
  notice_title text,
  notice_body text,
  target_child_id uuid,
  target_related_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_profile_id is null or notice_body is null or btrim(notice_body) = '' then return; end if;
  insert into public.pickup_notices (profile_id, child_id, kind, title, body, related_id)
  values (
    target_profile_id,
    target_child_id,
    notice_kind,
    nullif(btrim(coalesce(notice_title, '')), ''),
    left(btrim(notice_body), 400),
    target_related_id
  );
end;
$$;

create or replace function public.incident_anonymize(
  source text,
  target_report_id uuid,
  keep_child_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result text := coalesce(source, '');
  other_name text;
  other_first text;
  kept_first text;
begin
  select public.incident_first_name(name) into kept_first
  from public.children where id = keep_child_id;
  for other_name in
    select child.name
    from public.incident_children link
    join public.children child on child.id = link.child_id
    where link.report_id = target_report_id
      and link.child_id <> keep_child_id
    order by char_length(child.name) desc
  loop
    result := regexp_replace(
      result,
      '\m' || regexp_replace(other_name, '([.^$*+?(){}\[\]|\\])', '\\\1', 'g') || '\M',
      'ett annat barn',
      'gi'
    );
    other_first := public.incident_first_name(other_name);
    if char_length(other_first) >= 3 and lower(other_first) is distinct from lower(coalesce(kept_first, '')) then
      result := regexp_replace(
        result,
        '\m' || regexp_replace(other_first, '([.^$*+?(){}\[\]|\\])', '\\\1', 'g') || '\M',
        'ett annat barn',
        'gi'
      );
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public.incident_require_child(
  target_child_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  child_name text;
begin
  if not (public.is_admin_for_child(target_child_id) or public.is_staff_for_child(target_child_id)) then
    raise exception 'Du saknar behörighet till ett av barnen';
  end if;
  select name into child_name from public.children where id = target_child_id;
  if child_name is null then raise exception 'Barnet hittades inte'; end if;
  return child_name;
end;
$$;

create or replace function public.incident_copy_text(
  target_report_id uuid,
  target_child_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  report public.incident_reports;
  child_name text;
  child_role public.incident_child_role;
  department_label text;
  care_label text;
  body text;
begin
  select * into report from public.incident_reports where id = target_report_id;
  select name into child_name from public.children where id = target_child_id;
  select link.child_role into child_role
  from public.incident_children link
  where link.report_id = target_report_id and link.child_id = target_child_id;
  select name into department_label from public.departments where id = report.department_id;
  care_label := case report.care
    when 'none' then 'ingen ytterligare vård'
    when 'primary_care' then 'vårdcentral'
    when 'dentist' then 'tandläkare'
    when 'emergency' then 'akuten'
    else null
  end;
  body := 'Information om ' || child_name || E'\n'
    || 'Typ: ' || public.incident_type_label(report.incident_type::text) || E'\n'
    || 'Datum och tid: ' || to_char(report.occurred_at at time zone 'Europe/Stockholm', 'YYYY-MM-DD HH24:MI') || E'\n'
    || 'Plats: ' || report.place || E'\n'
    || 'Avdelning: ' || coalesce(department_label, '') || E'\n\n'
    || 'Vad som hände:' || E'\n' || report.what_happened || E'\n\n'
    || 'Omedelbara åtgärder:' || E'\n' || report.immediate_actions || E'\n\n'
    || 'Personal närvarande:' || E'\n' || report.staff_present || E'\n\n'
    || 'Vårdnadshavare kontaktades:' || E'\n' || report.guardians_contacted;
  if report.incident_type = 'accident' and child_role = 'affected' then
    body := body || E'\n\n' || 'Skada: ' || coalesce(report.injury_type, 'inte angiven')
      || ', ' || coalesce(report.body_location, 'plats inte angiven')
      || E'\n' || 'Första hjälpen: ' || coalesce(report.first_aid, 'inte angiven')
      || E'\n' || 'Vård: ' || coalesce(care_label, 'inte angiven');
  end if;
  if report.incident_type = 'accident' then
    body := body || E'\n\n' || 'Barnet omfattas av kommunens olycksfallsförsäkring.';
  end if;
  if report.incident_type = 'mistreatment' and child_role = 'affected' and report.child_experience is not null then
    body := body || E'\n\n' || 'Barnets egen upplevelse:' || E'\n' || report.child_experience;
  end if;
  return public.incident_anonymize(body, target_report_id, target_child_id);
end;
$$;

create or replace function public.incident_can_send(target_report_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  report public.incident_reports;
  caller uuid := public.current_profile_id();
begin
  select * into report from public.incident_reports where id = target_report_id;
  if report.id is null or report.status = 'draft' or caller is null then return false; end if;
  if not public.incident_can_read(target_report_id) then return false; end if;
  if report.incident_type = 'mistreatment' then
    return public.is_admin();
  end if;
  return public.is_admin() or report.author_id = caller;
end;
$$;

create or replace function public.incident_reject_other_names(
  source text,
  target_report_id uuid,
  keep_child_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  other_name text;
  other_first text;
  kept_first text;
begin
  select public.incident_first_name(name) into kept_first from public.children where id = keep_child_id;
  for other_name in
    select child.name
    from public.incident_children link
    join public.children child on child.id = link.child_id
    where link.report_id = target_report_id and link.child_id <> keep_child_id
  loop
    if source ~* ('\m' || regexp_replace(other_name, '([.^$*+?(){}\[\]|\\])', '\\\1', 'g') || '\M') then
      raise exception 'Texten får bara nämna det här barnet. Övriga barn skrivs som ett annat barn';
    end if;
    other_first := public.incident_first_name(other_name);
    if char_length(other_first) >= 3
       and lower(other_first) is distinct from lower(coalesce(kept_first, ''))
       and source ~* ('\m' || regexp_replace(other_first, '([.^$*+?(){}\[\]|\\])', '\\\1', 'g') || '\M') then
      raise exception 'Texten får bara nämna det här barnet. Övriga barn skrivs som ett annat barn';
    end if;
  end loop;
end;
$$;

create or replace function public.save_incident_draft(
  target_report_id uuid,
  incident_kind text,
  target_department_id uuid,
  occurred_at timestamptz,
  place_text text,
  happened_text text,
  actions_text text,
  present_text text,
  contacted_text text,
  injury_type text,
  body_location text,
  first_aid_text text,
  care_kind text,
  subjected_text text,
  alleged_by text,
  experience_text text,
  involved_children jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := public.current_profile_id();
  report public.incident_reports;
  saved_id uuid;
  child_row jsonb;
  seen uuid[] := '{}';
  child_id uuid;
  child_role text;
begin
  if caller is null or public.current_role() not in ('staff', 'admin') then
    raise exception 'Bara personal och administratörer kan skriva en rapport';
  end if;
  if incident_kind not in ('accident', 'near_miss', 'mistreatment', 'other') then
    raise exception 'Välj typ av rapport';
  end if;
  if occurred_at is null then raise exception 'Ange datum och tid'; end if;
  if place_text is null or char_length(btrim(place_text)) not between 1 and 160 then
    raise exception 'Ange platsen';
  end if;
  if happened_text is null or char_length(btrim(happened_text)) not between 1 and 5000 then
    raise exception 'Beskriv vad som hände';
  end if;
  if actions_text is null or char_length(btrim(actions_text)) not between 1 and 5000 then
    raise exception 'Beskriv de omedelbara åtgärderna';
  end if;
  if present_text is null or char_length(btrim(present_text)) not between 1 and 2000 then
    raise exception 'Ange vilken personal som var med';
  end if;
  if contacted_text is null or char_length(btrim(contacted_text)) not between 1 and 2000 then
    raise exception 'Ange när och hur vårdnadshavare kontaktades';
  end if;
  if not (public.is_admin_for_department(target_department_id) or public.is_staff_for_department(target_department_id)) then
    raise exception 'Du saknar behörighet till avdelningen';
  end if;
  if involved_children is null or jsonb_typeof(involved_children) <> 'array' or jsonb_array_length(involved_children) < 1 then
    raise exception 'Välj minst ett barn';
  end if;
  if incident_kind <> 'accident' then
    injury_type := null;
    body_location := null;
    first_aid_text := null;
    care_kind := null;
  end if;
  if incident_kind <> 'mistreatment' then
    subjected_text := null;
    alleged_by := null;
    experience_text := null;
  end if;
  if injury_type is not null and injury_type not in (
    'Sår eller skrubbsår', 'Blåmärke', 'Stukning eller vrickning', 'Fraktur',
    'Tandskada', 'Huvudskada', 'Bett', 'Brännskada', 'Annat'
  ) then raise exception 'Välj typ av skada'; end if;
  if body_location is not null and body_location not in (
    'Huvud', 'Ansikte', 'Tänder', 'Hals', 'Arm', 'Hand',
    'Bröst eller mage', 'Rygg', 'Ben', 'Fot', 'Annat'
  ) then raise exception 'Välj var på kroppen skadan sitter'; end if;
  if care_kind is not null and care_kind not in ('none', 'primary_care', 'dentist', 'emergency') then
    raise exception 'Välj vård';
  end if;
  if alleged_by is not null and alleged_by not in ('child', 'staff', 'unknown') then
    raise exception 'Välj vem som uppger kränkningen';
  end if;

  if target_report_id is not null then
    select * into report from public.incident_reports where id = target_report_id;
    if not found then raise exception 'Rapporten hittades inte'; end if;
    if report.author_id <> caller or report.status <> 'draft' then
      raise exception 'Bara författaren kan ändra ett utkast';
    end if;
    update public.incident_reports set
      department_id = target_department_id,
      incident_type = incident_kind::public.incident_type,
      occurred_at = save_incident_draft.occurred_at,
      place = btrim(place_text),
      what_happened = btrim(happened_text),
      immediate_actions = btrim(actions_text),
      staff_present = btrim(present_text),
      guardians_contacted = btrim(contacted_text),
      injury_type = nullif(btrim(coalesce(save_incident_draft.injury_type, '')), ''),
      body_location = nullif(btrim(coalesce(save_incident_draft.body_location, '')), ''),
      first_aid = nullif(btrim(coalesce(first_aid_text, '')), ''),
      care = nullif(btrim(coalesce(care_kind, '')), ''),
      subjected_name = nullif(btrim(coalesce(subjected_text, '')), ''),
      alleged_by = nullif(btrim(coalesce(save_incident_draft.alleged_by, '')), ''),
      child_experience = nullif(btrim(coalesce(experience_text, '')), ''),
      updated_at = now()
    where id = target_report_id;
    delete from public.incident_children where report_id = target_report_id;
    saved_id := target_report_id;
  else
    insert into public.incident_reports (
      organization_id, department_id, author_id, incident_type, occurred_at, place,
      what_happened, immediate_actions, staff_present, guardians_contacted,
      injury_type, body_location, first_aid, care, subjected_name, alleged_by, child_experience
    )
    values (
      public.current_organization_id(),
      target_department_id,
      caller,
      incident_kind::public.incident_type,
      occurred_at,
      btrim(place_text),
      btrim(happened_text),
      btrim(actions_text),
      btrim(present_text),
      btrim(contacted_text),
      nullif(btrim(coalesce(injury_type, '')), ''),
      nullif(btrim(coalesce(body_location, '')), ''),
      nullif(btrim(coalesce(first_aid_text, '')), ''),
      nullif(btrim(coalesce(care_kind, '')), ''),
      nullif(btrim(coalesce(subjected_text, '')), ''),
      nullif(btrim(coalesce(alleged_by, '')), ''),
      nullif(btrim(coalesce(experience_text, '')), '')
    )
    returning id into saved_id;
    perform public.incident_log(saved_id, 'created', 'Utkastet skapades');
  end if;

  for child_row in select value from jsonb_array_elements(involved_children) loop
    child_id := (child_row ->> 'child_id')::uuid;
    child_role := child_row ->> 'role';
    if child_id = any(seen) then raise exception 'Barnet kan bara ha en roll'; end if;
    if child_role not in ('affected', 'involved', 'causing') then raise exception 'Välj roll för varje barn'; end if;
    perform public.incident_require_child(child_id);
    insert into public.incident_children (report_id, child_id, child_role)
    values (saved_id, child_id, child_role::public.incident_child_role);
    seen := seen || child_id;
  end loop;
  return saved_id;
end;
$$;

create or replace function public.submit_incident(target_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := public.current_profile_id();
  report public.incident_reports;
  department_label text;
  notice_body text;
begin
  select * into report from public.incident_reports where id = target_report_id;
  if not found or report.author_id <> caller or report.status <> 'draft' then
    raise exception 'Bara författaren kan skicka in sitt utkast';
  end if;
  if report.incident_type = 'accident' and (
    report.injury_type is null or report.body_location is null or report.first_aid is null or report.care is null
  ) then
    raise exception 'Olycksfall behöver skadetyp, plats på kroppen, första hjälpen och vård';
  end if;
  if report.incident_type = 'mistreatment' and (report.subjected_name is null or report.alleged_by is null) then
    raise exception 'Kränkning behöver vem som utsattes och vem som uppger det';
  end if;
  if not exists (select 1 from public.incident_children where report_id = target_report_id) then
    raise exception 'Välj minst ett barn';
  end if;
  update public.incident_reports set
    status = 'submitted',
    submitted_at = now(),
    reported_to_principal_at = case when incident_type = 'mistreatment' then now() else reported_to_principal_at end,
    updated_at = now()
  where id = target_report_id;
  perform public.incident_log(target_report_id, 'submitted', 'Rapporten skickades in och låstes');
  if report.incident_type = 'mistreatment' then
    perform public.incident_log(target_report_id, 'principal', 'Inskickningen är anmälan till rektor');
  end if;
  select name into department_label from public.departments where id = report.department_id;
  notice_body := 'En ny rapport, ' || public.incident_type_label(report.incident_type::text)
    || ', är inskickad på ' || coalesce(department_label, 'avdelningen') || '.';
  insert into public.pickup_notices (profile_id, child_id, kind, title, body, related_id)
  select profile.id, null, 'incident_submitted', 'Ny avvikelserapport', notice_body, target_report_id
  from public.profiles profile
  where profile.organization_id = report.organization_id
    and profile.role = 'admin'
    and profile.removed_at is null;
end;
$$;

create or replace function public.start_incident_investigation(target_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  report public.incident_reports;
begin
  if not public.is_admin() then raise exception 'Bara en administratör utreder rapporten'; end if;
  select * into report from public.incident_reports where id = target_report_id;
  if not found or not public.incident_can_read(target_report_id) or report.status <> 'submitted' then
    raise exception 'Rapporten kan inte tas upp till utredning';
  end if;
  update public.incident_reports set status = 'investigating', updated_at = now() where id = target_report_id;
  perform public.incident_log(target_report_id, 'investigating', 'Rapporten är under utredning');
end;
$$;

create or replace function public.add_incident_investigation_note(
  target_report_id uuid,
  note_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  report public.incident_reports;
begin
  if not public.is_admin() then raise exception 'Bara en administratör skriver utredningsanteckningar'; end if;
  if note_text is null or char_length(btrim(note_text)) not between 1 and 5000 then
    raise exception 'Skriv en utredningsanteckning';
  end if;
  select * into report from public.incident_reports where id = target_report_id;
  if not found or not public.incident_can_read(target_report_id) or report.status <> 'investigating' then
    raise exception 'Anteckningen hör till en pågående utredning';
  end if;
  update public.incident_reports
  set investigation_notes = btrim(note_text), updated_at = now()
  where id = target_report_id;
  perform public.incident_log(target_report_id, 'investigation', btrim(note_text));
end;
$$;

create or replace function public.mark_incident_reported_to_principal(target_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  report public.incident_reports;
begin
  if not public.is_admin() then raise exception 'Bara en administratör anmäler till huvudmannen'; end if;
  select * into report from public.incident_reports where id = target_report_id;
  if not found or not public.incident_can_read(target_report_id) or report.status = 'draft' then
    raise exception 'Rapporten är inte inskickad';
  end if;
  if report.reported_to_principal_at is not null then
    raise exception 'Anmälan till huvudman är redan registrerad';
  end if;
  update public.incident_reports
  set reported_to_principal_at = now(), updated_at = now()
  where id = target_report_id;
  perform public.incident_log(target_report_id, 'principal', 'Anmäld till huvudman');
end;
$$;

create or replace function public.add_incident_action(
  target_report_id uuid,
  action_text text,
  responsible_profile_id uuid,
  due_on date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  report public.incident_reports;
  action_id uuid;
  responsible_name text;
begin
  if not public.is_admin() then raise exception 'Bara en administratör lägger till åtgärder'; end if;
  if action_text is null or char_length(btrim(action_text)) not between 1 and 500 then
    raise exception 'Beskriv åtgärden';
  end if;
  if due_on is null then raise exception 'Ange ett datum för åtgärden'; end if;
  select * into report from public.incident_reports where id = target_report_id;
  if not found or not public.incident_can_read(target_report_id) or report.status <> 'investigating' then
    raise exception 'Åtgärder hör till en pågående utredning';
  end if;
  select name into responsible_name
  from public.profiles
  where id = responsible_profile_id
    and organization_id = report.organization_id
    and role in ('staff', 'admin')
    and removed_at is null;
  if responsible_name is null then raise exception 'Välj en ansvarig i organisationen'; end if;
  insert into public.incident_actions (report_id, description, responsible_id, due_on, created_by)
  values (target_report_id, btrim(action_text), responsible_profile_id, due_on, public.current_profile_id())
  returning id into action_id;
  perform public.incident_log(target_report_id, 'action', btrim(action_text) || ' · ' || responsible_name || ' · ' || due_on::text);
  return action_id;
end;
$$;

create or replace function public.complete_incident_action(target_action_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  action public.incident_actions;
  caller uuid := public.current_profile_id();
begin
  select * into action from public.incident_actions where id = target_action_id;
  if not found then raise exception 'Åtgärden hittades inte'; end if;
  if not public.incident_can_read(action.report_id) then
    raise exception 'Du saknar behörighet till rapporten';
  end if;
  if action.done_at is not null then raise exception 'Åtgärden är redan klar'; end if;
  if not (public.is_admin() or action.responsible_id = caller) then
    raise exception 'Bara administratören eller den ansvariga kan markera åtgärden klar';
  end if;
  if (select status from public.incident_reports where id = action.report_id) <> 'investigating' then
    raise exception 'Åtgärden hör till en pågående utredning';
  end if;
  update public.incident_actions
  set done_at = now(), done_by = caller
  where id = target_action_id;
  perform public.incident_log(action.report_id, 'action_done', action.description);
end;
$$;

create or replace function public.close_incident(
  target_report_id uuid,
  summary_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  report public.incident_reports;
begin
  if not public.is_admin() then raise exception 'Bara en administratör avslutar rapporten'; end if;
  if summary_text is null or char_length(btrim(summary_text)) not between 1 and 5000 then
    raise exception 'Skriv en avslutande sammanfattning';
  end if;
  select * into report from public.incident_reports where id = target_report_id;
  if not found or not public.incident_can_read(target_report_id) or report.status <> 'investigating' then
    raise exception 'Bara en pågående utredning kan avslutas';
  end if;
  update public.incident_reports set
    status = 'closed',
    closing_summary = btrim(summary_text),
    closed_at = now(),
    closed_by = public.current_profile_id(),
    updated_at = now()
  where id = target_report_id;
  perform public.incident_log(target_report_id, 'closed', 'Rapporten är avslutad');
end;
$$;

create or replace function public.add_incident_addendum(
  target_report_id uuid,
  addendum_text text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  report public.incident_reports;
  addendum_id uuid;
begin
  if addendum_text is null or char_length(btrim(addendum_text)) not between 1 and 5000 then
    raise exception 'Skriv tillägget';
  end if;
  select * into report from public.incident_reports where id = target_report_id;
  if not found or not public.incident_can_read(target_report_id) or report.status = 'draft' then
    raise exception 'Tillägg skrivs efter att rapporten är inskickad';
  end if;
  if public.current_role() not in ('staff', 'admin') then
    raise exception 'Bara personal och administratörer kan skriva tillägg';
  end if;
  insert into public.incident_addenda (report_id, author_id, body)
  values (target_report_id, public.current_profile_id(), btrim(addendum_text))
  returning id into addendum_id;
  perform public.incident_log(target_report_id, 'addendum', btrim(addendum_text));
  return addendum_id;
end;
$$;

create or replace function public.save_incident_copy(
  target_report_id uuid,
  target_child_id uuid,
  copy_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  copy_id uuid;
begin
  if not public.incident_can_send(target_report_id) then
    raise exception 'Du kan inte skriva vårdnadshavarkopian';
  end if;
  if not exists (
    select 1 from public.incident_children
    where report_id = target_report_id and child_id = target_child_id
  ) then
    raise exception 'Barnet ingår inte i rapporten';
  end if;
  if copy_body is null or char_length(btrim(copy_body)) not between 1 and 8000 then
    raise exception 'Skriv texten till vårdnadshavaren';
  end if;
  perform public.incident_reject_other_names(copy_body, target_report_id, target_child_id);
  select id into copy_id from public.incident_copies
  where report_id = target_report_id and child_id = target_child_id;
  if copy_id is not null and exists (select 1 from public.incident_copies where id = copy_id and sent_at is not null) then
    raise exception 'Kopian är redan skickad';
  end if;
  if copy_id is null then
    insert into public.incident_copies (report_id, child_id, body)
    values (target_report_id, target_child_id, btrim(copy_body))
    returning id into copy_id;
  else
    update public.incident_copies set body = btrim(copy_body) where id = copy_id;
  end if;
  return copy_id;
end;
$$;

create or replace function public.send_incident_copy(
  target_report_id uuid,
  target_child_id uuid,
  copy_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  report public.incident_reports;
  saved_copy_id uuid;
  child_name text;
  final_body text;
  recipient record;
begin
  saved_copy_id := public.save_incident_copy(target_report_id, target_child_id, copy_body);
  select * into report from public.incident_reports where id = target_report_id;
  select body into final_body from public.incident_copies where id = saved_copy_id;
  if report.incident_type = 'accident'
     and final_body not ilike '%kommunens olycksfallsförsäkring%' then
    final_body := final_body || E'\n\n' || 'Barnet omfattas av kommunens olycksfallsförsäkring.';
    update public.incident_copies set body = final_body where id = saved_copy_id;
  end if;
  select name into child_name from public.children where id = target_child_id;
  update public.incident_copies
  set sent_at = now(), sent_by = public.current_profile_id()
  where id = saved_copy_id;
  insert into public.incident_copy_recipients (copy_id, profile_id)
  select saved_copy_id, guardian.profile_id
  from public.child_guardians guardian
  join public.profiles profile on profile.id = guardian.profile_id
  where guardian.child_id = target_child_id
    and profile.role = 'parent'
    and profile.removed_at is null;
  if not exists (
    select 1 from public.incident_copy_recipients recipient_row
    where recipient_row.copy_id = saved_copy_id
  ) then
    raise exception 'Barnet har ingen vårdnadshavare att skicka till';
  end if;
  for recipient in
    select recipient_row.profile_id
    from public.incident_copy_recipients recipient_row
    where recipient_row.copy_id = saved_copy_id
  loop
    perform public.incident_notice(
      recipient.profile_id,
      'incident_copy',
      'Information från förskolan',
      'Förskolan har skrivit till dig om ' || public.incident_first_name(child_name) || '. Öppna Min dag för att läsa och bekräfta.',
      target_child_id,
      saved_copy_id
    );
  end loop;
  perform public.incident_log(target_report_id, 'copy_sent', 'Kopia skickad om ' || child_name);
  return saved_copy_id;
end;
$$;

create or replace function public.acknowledge_incident_copy(target_copy_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient public.incident_copy_recipients;
  copy public.incident_copies;
  child_name text;
  actor_name text;
begin
  select * into recipient
  from public.incident_copy_recipients
  where copy_id = target_copy_id and profile_id = public.current_profile_id();
  if not found then raise exception 'Du har ingen kopia att bekräfta'; end if;
  select * into copy from public.incident_copies where id = target_copy_id;
  if copy.sent_at is null then raise exception 'Kopian är inte skickad'; end if;
  if recipient.acknowledged_at is not null then return; end if;
  update public.incident_copy_recipients
  set acknowledged_at = now()
  where copy_id = target_copy_id and profile_id = public.current_profile_id();
  select name into child_name from public.children where id = copy.child_id;
  select name into actor_name from public.profiles where id = public.current_profile_id();
  perform public.incident_log(copy.report_id, 'acknowledged', coalesce(actor_name, 'Vårdnadshavare') || ' har läst kopian om ' || coalesce(child_name, 'barnet'));
end;
$$;

create or replace function public.remind_incident_copies()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pending record;
  caller uuid := public.current_profile_id();
begin
  if caller is null then return; end if;
  for pending in
    select recipient.copy_id, recipient.profile_id, copy.child_id, child.name as child_name
    from public.incident_copy_recipients recipient
    join public.incident_copies copy on copy.id = recipient.copy_id
    join public.incident_reports report on report.id = copy.report_id
    join public.children child on child.id = copy.child_id
    where recipient.acknowledged_at is null
      and copy.sent_at < now() - interval '1 day'
      and (recipient.last_reminded_at is null or recipient.last_reminded_at < now() - interval '1 day')
      and (
        (public.is_admin() and report.organization_id = public.current_organization_id())
        or recipient.profile_id = caller
      )
  loop
    perform public.incident_notice(
      pending.profile_id,
      'incident_reminder',
      'Påminnelse',
      'Påminnelse: du har inte bekräftat att du läst informationen om ' || public.incident_first_name(pending.child_name) || '. Öppna Min dag och tryck Jag har läst.',
      pending.child_id,
      pending.copy_id
    );
    update public.incident_copy_recipients
    set last_reminded_at = now()
    where copy_id = pending.copy_id and profile_id = pending.profile_id;
  end loop;
end;
$$;

create or replace function public.list_incidents()
returns table (
  report_id uuid,
  incident_type text,
  status text,
  occurred_at timestamptz,
  place text,
  department_id uuid,
  department_name text,
  author_name text,
  mine boolean,
  child_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    report.id,
    report.incident_type::text,
    report.status::text,
    report.occurred_at,
    report.place,
    report.department_id,
    department.name,
    author.name,
    report.author_id = public.current_profile_id(),
    (select count(*)::integer from public.incident_children link where link.report_id = report.id)
  from public.incident_reports report
  join public.departments department on department.id = report.department_id
  join public.profiles author on author.id = report.author_id
  where public.incident_can_read(report.id)
  order by report.occurred_at desc, report.created_at desc
$$;

create or replace function public.get_incident(target_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  report public.incident_reports;
  caller uuid := public.current_profile_id();
  show_admin boolean;
  department_label text;
  author_name text;
  children jsonb;
  actions jsonb;
  addenda jsonb;
  events jsonb;
  copies jsonb;
  staff jsonb := '[]'::jsonb;
begin
  if not public.incident_can_read(target_report_id) then
    raise exception 'Du saknar behörighet till rapporten';
  end if;
  select * into report from public.incident_reports where id = target_report_id;
  show_admin := public.is_admin();
  select name into department_label from public.departments where id = report.department_id;
  select name into author_name from public.profiles where id = report.author_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'child_id', child.id,
    'name', child.name,
    'role', link.child_role::text
  ) order by child.name), '[]'::jsonb)
  into children
  from public.incident_children link
  join public.children child on child.id = link.child_id
  where link.report_id = target_report_id;

  if show_admin then
    select coalesce(jsonb_agg(jsonb_build_object(
      'action_id', action.id,
      'description', action.description,
      'responsible_id', action.responsible_id,
      'responsible_name', responsible.name,
      'due_on', action.due_on,
      'done_at', action.done_at,
      'mine', action.responsible_id = caller
    ) order by action.created_at), '[]'::jsonb)
    into actions
    from public.incident_actions action
    join public.profiles responsible on responsible.id = action.responsible_id
    where action.report_id = target_report_id;
    select coalesce(jsonb_agg(jsonb_build_object(
      'profile_id', profile.id,
      'name', profile.name
    ) order by profile.name), '[]'::jsonb)
    into staff
    from public.profiles profile
    where profile.organization_id = report.organization_id
      and profile.role in ('staff', 'admin')
      and profile.removed_at is null;
  else
    actions := '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'addendum_id', addendum.id,
    'body', addendum.body,
    'author_name', author.name,
    'created_at', addendum.created_at
  ) order by addendum.created_at), '[]'::jsonb)
  into addenda
  from public.incident_addenda addendum
  join public.profiles author on author.id = addendum.author_id
  where addendum.report_id = target_report_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', event.id,
    'event_kind', event.event_kind,
    'detail', event.detail,
    'created_at', event.created_at
  ) order by event.created_at), '[]'::jsonb)
  into events
  from public.incident_events event
  where event.report_id = target_report_id
    and (show_admin or event.event_kind not in ('investigation', 'principal'));

  select coalesce(jsonb_agg(row_data order by row_data ->> 'name'), '[]'::jsonb)
  into copies
  from (
    select jsonb_build_object(
      'copy_id', copy.id,
      'child_id', child.id,
      'name', child.name,
      'role', link.child_role::text,
      'body', case
        when not (show_admin or report.author_id = caller) then null
        when copy.body is not null then copy.body
        when public.incident_can_send(target_report_id) then public.incident_copy_text(target_report_id, child.id)
        else null
      end,
      'sent_at', copy.sent_at,
      'can_send', public.incident_can_send(target_report_id) and copy.sent_at is null,
      'acknowledged_count', (
        select count(*) from public.incident_copy_recipients recipient
        where recipient.copy_id = copy.id and recipient.acknowledged_at is not null
      ),
      'recipient_count', (
        select count(*) from public.incident_copy_recipients recipient
        where recipient.copy_id = copy.id
      )
    ) as row_data
    from public.incident_children link
    join public.children child on child.id = link.child_id
    left join public.incident_copies copy
      on copy.report_id = link.report_id and copy.child_id = link.child_id
    where link.report_id = target_report_id
  ) built;

  return jsonb_build_object(
    'report_id', report.id,
    'incident_type', report.incident_type::text,
    'status', report.status::text,
    'occurred_at', report.occurred_at,
    'place', report.place,
    'department_id', report.department_id,
    'department_name', department_label,
    'author_name', author_name,
    'mine', report.author_id = caller,
    'what_happened', report.what_happened,
    'immediate_actions', report.immediate_actions,
    'staff_present', report.staff_present,
    'guardians_contacted', report.guardians_contacted,
    'injury_type', report.injury_type,
    'body_location', report.body_location,
    'first_aid', report.first_aid,
    'care', report.care,
    'subjected_name', report.subjected_name,
    'alleged_by', report.alleged_by,
    'child_experience', report.child_experience,
    'submitted_at', report.submitted_at,
    'investigation_notes', case when show_admin then report.investigation_notes else null end,
    'reported_to_principal_at', case when show_admin then report.reported_to_principal_at else null end,
    'closing_summary', case when show_admin then report.closing_summary else null end,
    'closed_at', report.closed_at,
    'children', children,
    'actions', actions,
    'addenda', addenda,
    'events', events,
    'copies', copies,
    'staff', staff,
    'admin', show_admin
  );
end;
$$;

create or replace function public.list_my_incident_copies()
returns table (
  copy_id uuid,
  child_name text,
  body text,
  sent_at timestamptz,
  acknowledged_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    copy.id,
    child.name,
    copy.body,
    copy.sent_at,
    recipient.acknowledged_at
  from public.incident_copy_recipients recipient
  join public.incident_copies copy on copy.id = recipient.copy_id
  join public.children child on child.id = copy.child_id
  where recipient.profile_id = public.current_profile_id()
    and copy.sent_at is not null
  order by copy.sent_at desc
$$;

create or replace function public.list_notices()
returns table (
  notice_id uuid,
  kind text,
  title text,
  child_id uuid,
  body text,
  related_id uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select notice.id, notice.kind, notice.title, notice.child_id, notice.body, notice.related_id, notice.created_at
  from public.pickup_notices notice
  where notice.profile_id = public.current_profile_id()
  order by notice.created_at desc
  limit 40
$$;

create or replace function public.list_pickup_notices()
returns table (
  notice_id uuid,
  child_id uuid,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select notice.id, notice.child_id, notice.body, notice.created_at
  from public.pickup_notices notice
  where notice.profile_id = public.current_profile_id()
    and notice.kind = 'pickup'
  order by notice.created_at desc
  limit 30
$$;

revoke all on function public.incident_type_label(text) from public, anon, authenticated;
revoke all on function public.incident_first_name(text) from public, anon, authenticated;
revoke all on function public.incident_can_read(uuid) from public, anon, authenticated;
revoke all on function public.incident_log(uuid, text, text) from public, anon, authenticated;
revoke all on function public.incident_notice(uuid, text, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.incident_anonymize(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.incident_require_child(uuid) from public, anon, authenticated;
revoke all on function public.incident_copy_text(uuid, uuid) from public, anon, authenticated;
revoke all on function public.incident_can_send(uuid) from public, anon, authenticated;
revoke all on function public.incident_reject_other_names(text, uuid, uuid) from public, anon, authenticated;

revoke all on function public.save_incident_draft(uuid, text, uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.submit_incident(uuid) from public, anon, authenticated;
revoke all on function public.start_incident_investigation(uuid) from public, anon, authenticated;
revoke all on function public.add_incident_investigation_note(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_incident_reported_to_principal(uuid) from public, anon, authenticated;
revoke all on function public.add_incident_action(uuid, text, uuid, date) from public, anon, authenticated;
revoke all on function public.complete_incident_action(uuid) from public, anon, authenticated;
revoke all on function public.close_incident(uuid, text) from public, anon, authenticated;
revoke all on function public.add_incident_addendum(uuid, text) from public, anon, authenticated;
revoke all on function public.save_incident_copy(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.send_incident_copy(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.acknowledge_incident_copy(uuid) from public, anon, authenticated;
revoke all on function public.remind_incident_copies() from public, anon, authenticated;
revoke all on function public.list_incidents() from public, anon, authenticated;
revoke all on function public.get_incident(uuid) from public, anon, authenticated;
revoke all on function public.list_my_incident_copies() from public, anon, authenticated;
revoke all on function public.list_notices() from public, anon, authenticated;

grant execute on function public.save_incident_draft(uuid, text, uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.submit_incident(uuid) to authenticated;
grant execute on function public.start_incident_investigation(uuid) to authenticated;
grant execute on function public.add_incident_investigation_note(uuid, text) to authenticated;
grant execute on function public.mark_incident_reported_to_principal(uuid) to authenticated;
grant execute on function public.add_incident_action(uuid, text, uuid, date) to authenticated;
grant execute on function public.complete_incident_action(uuid) to authenticated;
grant execute on function public.close_incident(uuid, text) to authenticated;
grant execute on function public.add_incident_addendum(uuid, text) to authenticated;
grant execute on function public.save_incident_copy(uuid, uuid, text) to authenticated;
grant execute on function public.send_incident_copy(uuid, uuid, text) to authenticated;
grant execute on function public.acknowledge_incident_copy(uuid) to authenticated;
grant execute on function public.remind_incident_copies() to authenticated;
grant execute on function public.list_incidents() to authenticated;
grant execute on function public.get_incident(uuid) to authenticated;
grant execute on function public.list_my_incident_copies() to authenticated;
grant execute on function public.list_notices() to authenticated;

commit;
