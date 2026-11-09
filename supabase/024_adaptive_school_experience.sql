begin;

alter table public.preschools
  add column if not exists education_stage text not null default 'preschool',
  add column if not exists feature_config jsonb not null default '{"attendance":true,"important":true,"events":true,"meals":true,"assignments":true,"schedule":true,"pickup":true,"documents":true,"teachers":true,"portfolio":true,"classlist":true,"child_box":true}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'preschools_education_stage_valid'
      and conrelid = 'public.preschools'::regclass
  ) then
    alter table public.preschools add constraint preschools_education_stage_valid
      check (education_stage in ('preschool', 'school'));
  end if;
end $$;

create or replace function private.valid_school_feature_config(config jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(config) = 'object'
    and not exists (
      select 1
      from jsonb_each(config) item
      where item.key not in (
        'attendance', 'important', 'events', 'meals', 'assignments', 'schedule',
        'pickup', 'documents', 'teachers', 'portfolio', 'classlist', 'child_box'
      )
      or jsonb_typeof(item.value) <> 'boolean'
    )
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'preschools_feature_config_valid'
      and conrelid = 'public.preschools'::regclass
  ) then
    alter table public.preschools add constraint preschools_feature_config_valid
      check (private.valid_school_feature_config(feature_config));
  end if;
end $$;

create table if not exists public.school_timetable_entries (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 5),
  starts_at time not null,
  ends_at time not null,
  subject text not null check (char_length(btrim(subject)) between 1 and 80),
  room text check (room is null or char_length(btrim(room)) between 1 and 80),
  teacher_profile_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (department_id, weekday, starts_at, subject)
);

create table if not exists public.child_after_school_schedules (
  child_id uuid not null references public.children(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 5),
  attending boolean not null default false,
  ends_at time,
  note text check (note is null or char_length(btrim(note)) between 1 and 300),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (child_id, weekday),
  check ((attending and ends_at is not null) or (not attending and ends_at is null))
);

create table if not exists public.child_teachers (
  child_id uuid not null references public.children(id) on delete cascade,
  staff_profile_id uuid not null references public.profiles(id) on delete cascade,
  teacher_kind text not null check (teacher_kind in ('main', 'subject')),
  subject text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (child_id, staff_profile_id, teacher_kind, subject),
  check (
    (teacher_kind = 'main' and subject = '')
    or (teacher_kind = 'subject' and char_length(btrim(subject)) between 1 and 80)
  )
);

create table if not exists public.child_documents (
  id uuid primary key,
  child_id uuid not null references public.children(id) on delete cascade,
  document_kind text not null check (document_kind in ('medical', 'absence', 'assignment')),
  assignment_id uuid references public.school_assignments(id) on delete cascade,
  related_date date,
  storage_path text not null unique,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  mime_type text not null check (mime_type in (
    'application/pdf', 'image/jpeg', 'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  byte_size integer not null check (byte_size between 1 and 10485760),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (document_kind = 'medical' and assignment_id is null)
    or (document_kind = 'absence' and assignment_id is null and related_date is not null)
    or (document_kind = 'assignment' and assignment_id is not null)
  )
);

create table if not exists public.school_notices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  assignment_id uuid references public.school_assignments(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (profile_id, assignment_id)
);

create index if not exists school_timetable_department_day_idx
  on public.school_timetable_entries(department_id, weekday, starts_at);
create index if not exists child_documents_child_kind_idx
  on public.child_documents(child_id, document_kind, created_at desc);
create index if not exists child_teachers_child_kind_idx
  on public.child_teachers(child_id, teacher_kind, subject);
create index if not exists school_notices_profile_created_idx
  on public.school_notices(profile_id, created_at desc);

alter table public.school_timetable_entries enable row level security;
alter table public.child_after_school_schedules enable row level security;
alter table public.child_teachers enable row level security;
alter table public.child_documents enable row level security;
alter table public.school_notices enable row level security;

revoke all on public.school_timetable_entries, public.child_after_school_schedules,
  public.child_teachers, public.child_documents, public.school_notices
  from public, anon, authenticated;
grant select on public.school_timetable_entries, public.child_after_school_schedules,
  public.child_teachers, public.child_documents, public.school_notices
  to authenticated;

drop policy if exists "timetable authorized read" on public.school_timetable_entries;
create policy "timetable authorized read" on public.school_timetable_entries
for select to authenticated using (private.family_department_visible(department_id));

drop policy if exists "after school authorized read" on public.child_after_school_schedules;
create policy "after school authorized read" on public.child_after_school_schedules
for select to authenticated using (private.family_child_visible(child_id));

drop policy if exists "child teachers authorized read" on public.child_teachers;
create policy "child teachers authorized read" on public.child_teachers
for select to authenticated using (private.family_child_visible(child_id));

drop policy if exists "child documents authorized read" on public.child_documents;
create policy "child documents authorized read" on public.child_documents
for select to authenticated using (private.family_child_visible(child_id));

drop policy if exists "school notices own read" on public.school_notices;
create policy "school notices own read" on public.school_notices
for select to authenticated using (profile_id = public.current_profile_id());

create or replace function public.save_school_experience_config(
  target_preschool_id uuid,
  target_stage text,
  target_features jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() or not exists (
    select 1 from public.preschools school
    where school.id = target_preschool_id
      and school.organization_id = public.current_organization_id()
  ) then raise exception 'Bara organisationens administratör kan ändra skolans upplägg'; end if;
  if target_stage not in ('preschool', 'school') then raise exception 'Välj förskola eller skola'; end if;
  if not private.valid_school_feature_config(target_features) then raise exception 'Funktionsvalen är ogiltiga'; end if;
  update public.preschools
  set education_stage = target_stage,
      feature_config = target_features
  where id = target_preschool_id;
end;
$$;

create or replace function public.save_school_timetable_entry(
  target_entry_id uuid,
  target_department_id uuid,
  target_weekday integer,
  target_starts_at time,
  target_ends_at time,
  target_subject text,
  target_room text,
  target_teacher_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid := coalesce(target_entry_id, gen_random_uuid());
begin
  if auth.uid() is null or not private.family_department_manageable(target_department_id) then
    raise exception 'Du saknar behörighet att ändra schemat';
  end if;
  if target_weekday not between 1 and 5 or target_starts_at is null or target_ends_at is null or target_ends_at <= target_starts_at then
    raise exception 'Ange en vardag och giltiga tider';
  end if;
  if char_length(btrim(coalesce(target_subject, ''))) not between 1 and 80 then raise exception 'Ange ämne'; end if;
  if char_length(coalesce(btrim(target_room), '')) > 80 then raise exception 'Salen är för lång'; end if;
  if target_teacher_profile_id is not null and not exists (
    select 1
    from public.profiles profile
    join public.staff_departments assignment on assignment.staff_id = profile.id
    where profile.id = target_teacher_profile_id
      and profile.role = 'staff'
      and profile.removed_at is null
      and assignment.department_id = target_department_id
  ) then raise exception 'Läraren är inte kopplad till klassen'; end if;

  insert into public.school_timetable_entries (
    id, department_id, weekday, starts_at, ends_at, subject, room,
    teacher_profile_id, created_by, updated_at
  ) values (
    saved_id, target_department_id, target_weekday, target_starts_at, target_ends_at,
    btrim(target_subject), nullif(btrim(coalesce(target_room, '')), ''),
    target_teacher_profile_id, public.current_profile_id(), now()
  )
  on conflict (id) do update
  set weekday = excluded.weekday,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      subject = excluded.subject,
      room = excluded.room,
      teacher_profile_id = excluded.teacher_profile_id,
      updated_at = now()
  where school_timetable_entries.department_id = excluded.department_id;
  return saved_id;
end;
$$;

create or replace function public.delete_school_timetable_entry(target_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare item public.school_timetable_entries;
begin
  select * into item from public.school_timetable_entries where id = target_entry_id;
  if not found or not private.family_department_manageable(item.department_id) then
    raise exception 'Schemaposten hittades inte eller kan inte tas bort';
  end if;
  delete from public.school_timetable_entries where id = target_entry_id;
end;
$$;

create or replace function public.save_after_school_schedule(
  target_child_id uuid,
  schedule_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_guardian(target_child_id) then
    raise exception 'Bara barnets vårdnadshavare kan ändra fritidsschemat';
  end if;
  if jsonb_typeof(schedule_rows) is distinct from 'array'
    or jsonb_array_length(schedule_rows) <> 5
    or exists (
      select 1 from jsonb_array_elements(schedule_rows) row
      where coalesce((row ->> 'weekday')::integer, 0) not between 1 and 5
        or (coalesce((row ->> 'attending')::boolean, false) and nullif(row ->> 'ends_at', '') is null)
        or char_length(coalesce(btrim(row ->> 'note'), '')) > 300
    )
    or (select count(distinct (row ->> 'weekday')::integer) from jsonb_array_elements(schedule_rows) row) <> 5
  then raise exception 'Fritidsschemat måste innehålla fem giltiga vardagar'; end if;

  delete from public.child_after_school_schedules where child_id = target_child_id;
  insert into public.child_after_school_schedules (
    child_id, weekday, attending, ends_at, note, updated_by, updated_at
  )
  select
    target_child_id,
    (row ->> 'weekday')::smallint,
    coalesce((row ->> 'attending')::boolean, false),
    case when coalesce((row ->> 'attending')::boolean, false) then (row ->> 'ends_at')::time else null end,
    nullif(btrim(coalesce(row ->> 'note', '')), ''),
    public.current_profile_id(),
    now()
  from jsonb_array_elements(schedule_rows) row;
end;
$$;

create or replace function public.save_child_teacher(
  target_child_id uuid,
  target_staff_profile_id uuid,
  target_teacher_kind text,
  target_subject text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare child_department uuid;
declare clean_subject text := case when target_teacher_kind = 'main' then '' else btrim(coalesce(target_subject, '')) end;
begin
  if auth.uid() is null or not private.family_child_manageable(target_child_id) then
    raise exception 'Du saknar behörighet att koppla lärare';
  end if;
  if target_teacher_kind not in ('main', 'subject') or (target_teacher_kind = 'subject' and clean_subject = '') then
    raise exception 'Välj lärarroll och ämne';
  end if;
  select department_id into child_department from public.children where id = target_child_id;
  if not exists (
    select 1 from public.profiles profile
    join public.staff_departments assignment on assignment.staff_id = profile.id
    where profile.id = target_staff_profile_id
      and profile.role = 'staff'
      and profile.removed_at is null
      and assignment.department_id = child_department
  ) then raise exception 'Läraren är inte kopplad till barnets klass'; end if;
  insert into public.child_teachers (child_id, staff_profile_id, teacher_kind, subject, created_by)
  values (target_child_id, target_staff_profile_id, target_teacher_kind, clean_subject, public.current_profile_id())
  on conflict do nothing;
end;
$$;

create or replace function public.delete_child_teacher(
  target_child_id uuid,
  target_staff_profile_id uuid,
  target_teacher_kind text,
  target_subject text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.family_child_manageable(target_child_id) then
    raise exception 'Du saknar behörighet att ta bort lärarkopplingen';
  end if;
  delete from public.child_teachers
  where child_id = target_child_id
    and staff_profile_id = target_staff_profile_id
    and teacher_kind = target_teacher_kind
    and subject = case when target_teacher_kind = 'main' then '' else btrim(coalesce(target_subject, '')) end;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'child-documents', 'child-documents', false, 10485760,
  array[
    'application/pdf', 'image/jpeg', 'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.child_document_path_authorized(object_name text, write_access boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and split_part(object_name, '/', 2) in ('medical', 'absence', 'assignment')
    then case
      when not write_access then private.family_child_visible(split_part(object_name, '/', 1)::uuid)
      when split_part(object_name, '/', 2) in ('medical', 'absence')
        then public.is_guardian(split_part(object_name, '/', 1)::uuid)
      else private.family_child_manageable(split_part(object_name, '/', 1)::uuid)
    end
    else false
  end
$$;

drop policy if exists "child documents read" on storage.objects;
create policy "child documents read" on storage.objects
for select to authenticated
using (bucket_id = 'child-documents' and private.child_document_path_authorized(name, false));

drop policy if exists "child documents insert" on storage.objects;
create policy "child documents insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'child-documents' and private.child_document_path_authorized(name, true));

drop policy if exists "child documents delete" on storage.objects;
create policy "child documents delete" on storage.objects
for delete to authenticated
using (bucket_id = 'child-documents' and private.child_document_path_authorized(name, true));

create or replace function public.save_child_document(
  target_document_id uuid,
  target_child_id uuid,
  target_document_kind text,
  target_assignment_id uuid,
  target_related_date date,
  object_path text,
  original_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  object_size bigint;
  object_mime text;
  expected_extension text;
begin
  if auth.uid() is null or target_document_id is null then raise exception 'Dokumentuppgifterna saknas'; end if;
  if target_document_kind in ('medical', 'absence') then
    if not public.is_guardian(target_child_id) then raise exception 'Bara barnets vårdnadshavare kan skicka det här dokumentet'; end if;
  elsif target_document_kind = 'assignment' then
    if not private.family_child_manageable(target_child_id) then raise exception 'Du saknar behörighet till uppgiftens dokument'; end if;
    if not exists (
      select 1 from public.school_assignments item
      where item.id = target_assignment_id and item.child_id = target_child_id
    ) then raise exception 'Uppgiften hör inte till barnet'; end if;
  else raise exception 'Dokumenttypen är ogiltig';
  end if;
  if target_document_kind = 'absence' and target_related_date is null then raise exception 'Frånvarodatum saknas'; end if;
  if char_length(btrim(coalesce(original_name, ''))) not between 1 and 160 then raise exception 'Filnamnet är ogiltigt'; end if;

  select nullif(object.metadata ->> 'size', '')::bigint, object.metadata ->> 'mimetype'
  into object_size, object_mime
  from storage.objects object
  where object.bucket_id = 'child-documents' and object.name = object_path;
  expected_extension := case object_mime
    when 'application/pdf' then 'pdf'
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
    else null
  end;
  if object_size is null or object_size not between 1 and 10485760 or expected_extension is null
    or object_path is distinct from target_child_id::text || '/' || target_document_kind || '/' || target_document_id::text || '.' || expected_extension
  then raise exception 'Filen måste vara PDF, JPEG, PNG eller DOCX och högst 10 MB'; end if;

  insert into public.child_documents (
    id, child_id, document_kind, assignment_id, related_date, storage_path,
    display_name, mime_type, byte_size, uploaded_by
  ) values (
    target_document_id, target_child_id, target_document_kind,
    case when target_document_kind = 'assignment' then target_assignment_id else null end,
    case when target_document_kind = 'absence' then target_related_date else null end,
    object_path, btrim(original_name), object_mime, object_size::integer, public.current_profile_id()
  );
  return target_document_id;
end;
$$;

create or replace function public.delete_child_document(target_document_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare item public.child_documents;
begin
  select * into item from public.child_documents where id = target_document_id;
  if not found then raise exception 'Dokumentet hittades inte'; end if;
  if item.document_kind in ('medical', 'absence') then
    if not public.is_guardian(item.child_id) then raise exception 'Du saknar behörighet att ta bort dokumentet'; end if;
  elsif not private.family_child_manageable(item.child_id) then
    raise exception 'Du saknar behörighet att ta bort dokumentet';
  end if;
  delete from public.child_documents where id = target_document_id;
  return item.storage_path;
end;
$$;

create or replace function private.notify_school_assignment(
  target_assignment_id uuid,
  target_child_id uuid,
  assignment_subject text,
  assignment_title text,
  assignment_due_on date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.school_notices (profile_id, child_id, assignment_id, title, body)
  select guardian.profile_id, target_child_id, target_assignment_id,
    'Ny uppgift i ' || btrim(assignment_subject),
    btrim(assignment_title) || ' gäller senast ' || to_char(assignment_due_on, 'YYYY-MM-DD') || '.'
  from public.child_guardians guardian
  join public.profiles profile on profile.id = guardian.profile_id
  where guardian.child_id = target_child_id
    and profile.role = 'parent'
    and profile.removed_at is null
  on conflict (profile_id, assignment_id) do update
  set title = excluded.title, body = excluded.body, created_at = now(), read_at = null;
end;
$$;

create or replace function public.save_school_assignment(
  target_assignment_id uuid,
  target_child_id uuid,
  assignment_subject text,
  assignment_title text,
  assignment_description text,
  assignment_due_on date,
  assignment_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid := coalesce(target_assignment_id, gen_random_uuid());
  is_new boolean := target_assignment_id is null or not exists (
    select 1 from public.school_assignments where id = target_assignment_id
  );
begin
  if auth.uid() is null or not private.family_child_manageable(target_child_id) then raise exception 'Du saknar behörighet till barnets uppgifter'; end if;
  if char_length(btrim(coalesce(assignment_subject, ''))) not between 1 and 80 or char_length(btrim(coalesce(assignment_title, ''))) not between 2 and 160 then raise exception 'Ange ämne och rubrik'; end if;
  if char_length(coalesce(btrim(assignment_description), '')) > 2000 then raise exception 'Beskrivningen är för lång'; end if;
  if assignment_due_on is null then raise exception 'Ange sista datum'; end if;
  if assignment_status not in ('homework', 'missing', 'submitted', 'completed') then raise exception 'Ogiltig uppgiftsstatus'; end if;
  insert into public.school_assignments (
    id, child_id, subject, title, description, due_on, status, updated_by, updated_at
  ) values (
    saved_id, target_child_id, btrim(assignment_subject), btrim(assignment_title),
    nullif(btrim(coalesce(assignment_description, '')), ''), assignment_due_on,
    assignment_status, public.current_profile_id(), now()
  )
  on conflict (id) do update
  set subject = excluded.subject,
      title = excluded.title,
      description = excluded.description,
      due_on = excluded.due_on,
      status = excluded.status,
      updated_by = excluded.updated_by,
      updated_at = now()
  where school_assignments.child_id = excluded.child_id;
  if is_new and assignment_status <> 'completed' then
    perform private.notify_school_assignment(saved_id, target_child_id, assignment_subject, assignment_title, assignment_due_on);
  end if;
  return saved_id;
end;
$$;

create or replace function public.save_school_assignment_with_document(
  target_assignment_id uuid,
  target_child_id uuid,
  assignment_subject text,
  assignment_title text,
  assignment_description text,
  assignment_due_on date,
  assignment_status text,
  target_document_id uuid,
  object_path text,
  original_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare saved_id uuid;
begin
  saved_id := public.save_school_assignment(
    target_assignment_id, target_child_id, assignment_subject, assignment_title,
    assignment_description, assignment_due_on, assignment_status
  );
  perform public.save_child_document(
    target_document_id, target_child_id, 'assignment', saved_id, null, object_path, original_name
  );
  return saved_id;
end;
$$;

create or replace function public.mark_school_notice_read(target_notice_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.school_notices
  set read_at = coalesce(read_at, now())
  where id = target_notice_id and profile_id = public.current_profile_id()
$$;

create or replace function public.list_school_experience()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  schools jsonb;
  timetable jsonb;
  after_school jsonb;
  documents jsonb;
  teachers jsonb;
  notices jsonb;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'preschool_id', school.id,
    'education_stage', school.education_stage,
    'feature_config', school.feature_config
  ) order by school.name), '[]'::jsonb)
  into schools
  from public.preschools school
  where school.organization_id = public.current_organization_id()
    and private.family_preschool_visible(school.id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'entry_id', entry.id,
    'department_id', entry.department_id,
    'weekday', entry.weekday,
    'starts_at', to_char(entry.starts_at, 'HH24:MI'),
    'ends_at', to_char(entry.ends_at, 'HH24:MI'),
    'subject', entry.subject,
    'room', entry.room,
    'teacher_profile_id', entry.teacher_profile_id,
    'teacher_name', teacher.name,
    'can_manage', private.family_department_manageable(entry.department_id)
  ) order by entry.weekday, entry.starts_at, entry.subject), '[]'::jsonb)
  into timetable
  from public.school_timetable_entries entry
  left join public.profiles teacher on teacher.id = entry.teacher_profile_id
  where private.family_department_visible(entry.department_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'child_id', row.child_id,
    'weekday', row.weekday,
    'attending', row.attending,
    'ends_at', case when row.ends_at is null then null else to_char(row.ends_at, 'HH24:MI') end,
    'note', row.note,
    'updated_at', row.updated_at
  ) order by row.child_id, row.weekday), '[]'::jsonb)
  into after_school
  from public.child_after_school_schedules row
  where private.family_child_visible(row.child_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'document_id', document.id,
    'child_id', document.child_id,
    'document_kind', document.document_kind,
    'assignment_id', document.assignment_id,
    'related_date', document.related_date,
    'storage_path', document.storage_path,
    'display_name', document.display_name,
    'mime_type', document.mime_type,
    'byte_size', document.byte_size,
    'created_at', document.created_at,
    'can_delete', case
      when document.document_kind in ('medical', 'absence') then public.is_guardian(document.child_id)
      else private.family_child_manageable(document.child_id)
    end
  ) order by document.created_at desc), '[]'::jsonb)
  into documents
  from public.child_documents document
  where private.family_child_visible(document.child_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'child_id', link.child_id,
    'staff_profile_id', link.staff_profile_id,
    'teacher_name', profile.name,
    'teacher_kind', link.teacher_kind,
    'subject', link.subject,
    'can_manage', private.family_child_manageable(link.child_id)
  ) order by link.teacher_kind, link.subject, profile.name), '[]'::jsonb)
  into teachers
  from public.child_teachers link
  join public.profiles profile on profile.id = link.staff_profile_id
  where private.family_child_visible(link.child_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'notice_id', notice.id,
    'child_id', notice.child_id,
    'assignment_id', notice.assignment_id,
    'title', notice.title,
    'body', notice.body,
    'created_at', notice.created_at,
    'read_at', notice.read_at
  ) order by notice.created_at desc), '[]'::jsonb)
  into notices
  from public.school_notices notice
  where notice.profile_id = public.current_profile_id()
    and notice.created_at >= now() - interval '90 days';

  return jsonb_build_object(
    'schools', schools,
    'timetable', timetable,
    'after_school', after_school,
    'documents', documents,
    'teachers', teachers,
    'notices', notices
  );
end;
$$;

revoke all on function private.valid_school_feature_config(jsonb) from public, anon, authenticated;
revoke all on function private.child_document_path_authorized(text, boolean) from public, anon, authenticated;
revoke all on function private.notify_school_assignment(uuid, uuid, text, text, date) from public, anon, authenticated;
revoke all on function public.save_school_experience_config(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.save_school_timetable_entry(uuid, uuid, integer, time, time, text, text, uuid) from public, anon, authenticated;
revoke all on function public.delete_school_timetable_entry(uuid) from public, anon, authenticated;
revoke all on function public.save_after_school_schedule(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.save_child_teacher(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.delete_child_teacher(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.save_child_document(uuid, uuid, text, uuid, date, text, text) from public, anon, authenticated;
revoke all on function public.delete_child_document(uuid) from public, anon, authenticated;
revoke all on function public.save_school_assignment_with_document(uuid, uuid, text, text, text, date, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.mark_school_notice_read(uuid) from public, anon, authenticated;
revoke all on function public.list_school_experience() from public, anon, authenticated;

-- Storage policies execute these helpers as the authenticated caller.
grant execute on function private.child_document_path_authorized(text, boolean) to authenticated;
grant execute on function public.save_school_experience_config(uuid, text, jsonb) to authenticated;
grant execute on function public.save_school_timetable_entry(uuid, uuid, integer, time, time, text, text, uuid) to authenticated;
grant execute on function public.delete_school_timetable_entry(uuid) to authenticated;
grant execute on function public.save_after_school_schedule(uuid, jsonb) to authenticated;
grant execute on function public.save_child_teacher(uuid, uuid, text, text) to authenticated;
grant execute on function public.delete_child_teacher(uuid, uuid, text, text) to authenticated;
grant execute on function public.save_child_document(uuid, uuid, text, uuid, date, text, text) to authenticated;
grant execute on function public.delete_child_document(uuid) to authenticated;
grant execute on function public.save_school_assignment_with_document(uuid, uuid, text, text, text, date, text, uuid, text, text) to authenticated;
grant execute on function public.mark_school_notice_read(uuid) to authenticated;
grant execute on function public.list_school_experience() to authenticated;

commit;
