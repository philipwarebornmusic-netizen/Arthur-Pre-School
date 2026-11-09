#!/usr/bin/env python3
"""Exercise adaptive preschool/school authorization on throwaway PostgreSQL 16."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile

from family_school_sql_test import STUB, free_port, postgres_bin, psql, run

ROOT = Path(__file__).resolve().parent.parent
FAMILY_MIGRATION = ROOT / "supabase" / "022_family_school_features.sql"
MIGRATION = ROOT / "supabase" / "024_adaptive_school_experience.sql"

GUARDIAN = "11111111-1111-1111-1111-111111111111"
STAFF = "11111111-1111-1111-1111-111111111112"
OTHER = "11111111-1111-1111-1111-111111111113"
ADMIN = "11111111-1111-1111-1111-111111111114"
CHILD = "22222222-2222-2222-2222-222222222221"
SCHOOL = "33333333-3333-3333-3333-333333333333"
DEPARTMENT = "44444444-4444-4444-4444-444444444444"
ORGANIZATION = "88888888-8888-8888-8888-888888888888"
TIMETABLE = "99999999-9999-9999-9999-999999999991"
MEDICAL_DOCUMENT = "99999999-9999-9999-9999-999999999992"
ASSIGNMENT = "99999999-9999-9999-9999-999999999993"
ASSIGNMENT_DOCUMENT = "99999999-9999-9999-9999-999999999994"

EXTEND = f"""
create table public.organizations (id uuid primary key, name text not null);
insert into public.organizations (id, name) values ('{ORGANIZATION}', 'Organisationen');
alter table public.profiles add column organization_id uuid references public.organizations(id);
alter table public.preschools add column organization_id uuid references public.organizations(id);
alter table public.profiles add column removed_at timestamptz;
update public.profiles set organization_id = '{ORGANIZATION}';
update public.preschools set organization_id = '{ORGANIZATION}';
alter table public.profiles alter column organization_id set not null;
alter table public.preschools alter column organization_id set not null;
insert into public.profiles (id, name, role, organization_id)
values ('{ADMIN}', 'Administratör', 'admin', '{ORGANIZATION}');

create or replace function public.current_organization_id() returns uuid language sql stable security definer
set search_path = '' as $$
  select profile.organization_id from public.profiles profile where profile.id = public.current_profile_id()
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer
set search_path = '' as $$ select public.current_role() = 'admin'::public.user_role $$;
"""

EXERCISE = f"""
set role authenticated;
set request.jwt.claim.sub = '{ADMIN}';
select public.save_school_experience_config(
  '{SCHOOL}', 'school',
  '{{"attendance":true,"important":true,"events":true,"meals":true,"assignments":true,"schedule":true,"pickup":false,"documents":true,"teachers":true,"portfolio":false,"classlist":true,"child_box":false}}'::jsonb
);

set request.jwt.claim.sub = '{STAFF}';
select public.save_school_timetable_entry(
  '{TIMETABLE}', '{DEPARTMENT}', 1, '08:15', '09:00', 'Matematik', 'A12', '{STAFF}'
);
select public.save_child_teacher('{CHILD}', '{STAFF}', 'main', null);
insert into storage.objects (bucket_id, name, metadata) values (
  'child-documents',
  '{CHILD}/assignment/{ASSIGNMENT_DOCUMENT}.pdf',
  jsonb_build_object('size', 2048, 'mimetype', 'application/pdf')
);
select public.save_school_assignment_with_document(
  '{ASSIGNMENT}', '{CHILD}', 'Svenska', 'Läs veckobrevet', 'Ta med frågor', current_date + 3,
  'homework', '{ASSIGNMENT_DOCUMENT}',
  '{CHILD}/assignment/{ASSIGNMENT_DOCUMENT}.pdf', 'Veckobrev.pdf'
);

set request.jwt.claim.sub = '{GUARDIAN}';
select public.save_after_school_schedule(
  '{CHILD}',
  '[{{"weekday":1,"attending":true,"ends_at":"16:00","note":"Går själv"}},{{"weekday":2,"attending":true,"ends_at":"15:30"}},{{"weekday":3,"attending":false}},{{"weekday":4,"attending":true,"ends_at":"16:30"}},{{"weekday":5,"attending":false}}]'::jsonb
);
insert into storage.objects (bucket_id, name, metadata) values (
  'child-documents',
  '{CHILD}/medical/{MEDICAL_DOCUMENT}.pdf',
  jsonb_build_object('size', 1024, 'mimetype', 'application/pdf')
);
select public.save_child_document(
  '{MEDICAL_DOCUMENT}', '{CHILD}', 'medical', null, null,
  '{CHILD}/medical/{MEDICAL_DOCUMENT}.pdf', 'Intyg.pdf'
);

do $$
declare denied boolean := false;
begin
  begin
    insert into public.child_after_school_schedules (child_id, weekday, attending, ends_at)
    values ('{CHILD}', 1, true, '17:00');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'direct write unexpectedly allowed'; end if;
end $$;

set request.jwt.claim.sub = '{OTHER}';
do $$
declare denied boolean := false;
begin
  begin
    perform public.save_after_school_schedule(
      '{CHILD}',
      '[{{"weekday":1,"attending":false}},{{"weekday":2,"attending":false}},{{"weekday":3,"attending":false}},{{"weekday":4,"attending":false}},{{"weekday":5,"attending":false}}]'::jsonb
    );
  exception when others then denied := true;
  end;
  if not denied then raise exception 'unrelated guardian changed schedule'; end if;
end $$;
"""

ASSERTIONS = f"""
set role authenticated;
set request.jwt.claim.sub = '{GUARDIAN}';
select
  jsonb_array_length(public.list_school_experience() -> 'schools'),
  public.list_school_experience() -> 'schools' -> 0 ->> 'education_stage',
  jsonb_array_length(public.list_school_experience() -> 'timetable'),
  jsonb_array_length(public.list_school_experience() -> 'after_school'),
  jsonb_array_length(public.list_school_experience() -> 'documents'),
  jsonb_array_length(public.list_school_experience() -> 'teachers'),
  jsonb_array_length(public.list_school_experience() -> 'notices'),
  (select count(*) from public.school_notices where read_at is null),
  has_table_privilege('authenticated', 'public.child_documents', 'INSERT');

set request.jwt.claim.sub = '{OTHER}';
select
  jsonb_array_length(public.list_school_experience() -> 'timetable'),
  jsonb_array_length(public.list_school_experience() -> 'after_school'),
  jsonb_array_length(public.list_school_experience() -> 'documents'),
  jsonb_array_length(public.list_school_experience() -> 'notices');
"""


def main():
    bin_dir = postgres_bin()
    if not bin_dir:
        raise SystemExit("PostgreSQL 16 tools are required")
    for migration in (FAMILY_MIGRATION, MIGRATION):
        if not migration.is_file():
            raise SystemExit(f"missing migration: {migration.relative_to(ROOT)}")

    work = Path(tempfile.mkdtemp(prefix="artan-024-"))
    data = work / "data"
    port = free_port()
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
    started = False
    try:
        run([str(bin_dir / "initdb"), "-D", str(data), "-U", "artan", "--auth-local=trust", "--auth-host=trust"], env)
        config = data / "postgresql.conf"
        config.write_text(config.read_text() + f"\nlisten_addresses='127.0.0.1'\nport={port}\nunix_socket_directories='{work}'\n")
        run([str(bin_dir / "pg_ctl"), "-D", str(data), "-l", str(work / "server.log"), "-w", "start"], env)
        started = True
        psql(bin_dir, env, port, sql=STUB)
        psql(bin_dir, env, port, script=FAMILY_MIGRATION)
        psql(bin_dir, env, port, sql=EXTEND)
        psql(bin_dir, env, port, script=MIGRATION)
        psql(bin_dir, env, port, sql=EXERCISE)
        report = psql(
            bin_dir,
            env,
            port,
            sql="\\pset tuples_only on\n\\pset format unaligned\n\\pset fieldsep '|'\n" + ASSERTIONS,
        )
        lines = [line.strip() for line in report.splitlines() if line.strip()]
        expected = ["1|school|1|5|2|1|1|1|f", "1|0|0|0"]
        if lines != expected:
            raise SystemExit(f"adaptive-school results {lines}, expected {expected}")
    finally:
        if started:
            subprocess.run([str(bin_dir / "pg_ctl"), "-D", str(data), "-w", "-m", "fast", "stop"], text=True, capture_output=True, env=env)
        shutil.rmtree(work, ignore_errors=True)
    print("adaptive preschool and school sql checks passed")


if __name__ == "__main__":
    main()
