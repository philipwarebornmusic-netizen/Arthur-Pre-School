#!/usr/bin/env python3
"""Exercise family/school feature authorization on throwaway PostgreSQL 16."""

import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
MIGRATION = ROOT / "supabase" / "022_family_school_features.sql"
GUARDIAN = "11111111-1111-1111-1111-111111111111"
STAFF = "11111111-1111-1111-1111-111111111112"
OTHER = "11111111-1111-1111-1111-111111111113"
CHILD = "22222222-2222-2222-2222-222222222221"
OTHER_CHILD = "22222222-2222-2222-2222-222222222222"
SCHOOL = "33333333-3333-3333-3333-333333333333"
DEPARTMENT = "44444444-4444-4444-4444-444444444444"
PORTFOLIO = "55555555-5555-5555-5555-555555555555"
LOST = "66666666-6666-6666-6666-666666666666"
EVENT = "77777777-7777-7777-7777-777777777777"


def postgres_bin():
    candidates = [
        Path(os.environ["PG_BIN"]) if os.environ.get("PG_BIN") else None,
        Path("/opt/homebrew/opt/postgresql@16/bin"),
        Path("/usr/local/opt/postgresql@16/bin"),
        Path.home() / ".homebrew/opt/postgresql@16/bin",
        Path("/usr/lib/postgresql/16/bin"),
    ]
    configured = shutil.which("pg_config")
    if configured:
        candidates.insert(0, Path(configured).parent)
    return next((path for path in candidates if path and (path / "initdb").is_file()), None)


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def run(command, env):
    result = subprocess.run(command, text=True, capture_output=True, env=env)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip())
    return result.stdout


def psql(bin_dir, env, port, *, sql=None, script=None):
    command = [
        str(bin_dir / "psql"), "-h", "127.0.0.1", "-p", str(port),
        "-U", "artan", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-X", "-q",
    ]
    if script:
        command.extend(["-f", str(script)])
        return run(command, env)
    result = subprocess.run(command, input=sql, text=True, capture_output=True, env=env)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip())
    return result.stdout


STUB = f"""
create schema auth;
create schema storage;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public, auth, storage to authenticated;
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

do $$ begin
  create type public.user_role as enum ('admin', 'staff', 'parent');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public.consent_type as enum ('app_images', 'group_images', 'social_media');
exception when duplicate_object then null;
end $$;

create table public.profiles (
  id uuid primary key,
  name text not null,
  role public.user_role not null
);
create table public.preschools (id uuid primary key, name text not null);
create table public.departments (
  id uuid primary key,
  preschool_id uuid not null references public.preschools(id),
  name text not null
);
create table public.children (
  id uuid primary key,
  department_id uuid not null references public.departments(id),
  name text not null
);
create table public.child_guardians (child_id uuid not null, profile_id uuid not null);
create table public.staff_departments (staff_id uuid not null, department_id uuid not null);
create table public.consents (
  child_id uuid not null,
  type public.consent_type not null,
  allowed boolean not null,
  primary key (child_id, type)
);
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null,
  metadata jsonb,
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;

create function public.current_profile_id() returns uuid language sql stable security definer
set search_path = '' as $$ select auth.uid() $$;
create function public.current_role() returns public.user_role language sql stable security definer
set search_path = '' as $$ select profile.role from public.profiles profile where profile.id = auth.uid() $$;
create function public.is_guardian(target_child_id uuid) returns boolean language sql stable security definer
set search_path = '' as $$
  select exists (select 1 from public.child_guardians link where link.child_id = target_child_id and link.profile_id = auth.uid())
$$;
create function public.is_staff_for_child(target_child_id uuid) returns boolean language sql stable security definer
set search_path = '' as $$
  select exists (
    select 1 from public.children child
    join public.staff_departments assignment on assignment.department_id = child.department_id
    where child.id = target_child_id and assignment.staff_id = auth.uid()
  )
$$;
create function public.is_admin_for_child(target_child_id uuid) returns boolean language sql stable security definer
set search_path = '' as $$ select public.current_role() = 'admin'::public.user_role $$;
create function public.is_guardian_for_department(target_department_id uuid) returns boolean language sql stable security definer
set search_path = '' as $$
  select exists (
    select 1 from public.children child
    join public.child_guardians link on link.child_id = child.id
    where child.department_id = target_department_id and link.profile_id = auth.uid()
  )
$$;
create function public.is_staff_for_department(target_department_id uuid) returns boolean language sql stable security definer
set search_path = '' as $$
  select exists (
    select 1 from public.staff_departments assignment
    where assignment.department_id = target_department_id and assignment.staff_id = auth.uid()
  )
$$;
create function public.is_admin_for_department(target_department_id uuid) returns boolean language sql stable security definer
set search_path = '' as $$ select public.current_role() = 'admin'::public.user_role $$;

insert into public.profiles (id, name, role) values
  ('{GUARDIAN}', 'Vårdnadshavare', 'parent'),
  ('{STAFF}', 'Personal', 'staff'),
  ('{OTHER}', 'Annan vårdnadshavare', 'parent');
insert into public.preschools (id, name) values ('{SCHOOL}', 'Skolan');
insert into public.departments (id, preschool_id, name) values ('{DEPARTMENT}', '{SCHOOL}', 'Avdelningen');
insert into public.children (id, department_id, name) values
  ('{CHILD}', '{DEPARTMENT}', 'Ada'),
  ('{OTHER_CHILD}', '{DEPARTMENT}', 'Bo');
insert into public.child_guardians (child_id, profile_id) values
  ('{CHILD}', '{GUARDIAN}'),
  ('{OTHER_CHILD}', '{OTHER}');
insert into public.staff_departments (staff_id, department_id) values ('{STAFF}', '{DEPARTMENT}');
insert into public.consents (child_id, type, allowed) values ('{CHILD}', 'app_images', true);
"""

EXERCISE = f"""
set role authenticated;
set request.jwt.claim.sub = '{STAFF}';
insert into storage.objects (bucket_id, name, metadata) values (
  'portfolio-images',
  '{CHILD}/{PORTFOLIO}.jpg',
  '{{"size":"1024","mimetype":"image/jpeg"}}'
);
select public.save_portfolio_item(
  '{PORTFOLIO}', '{CHILD}', '{CHILD}/{PORTFOLIO}.jpg', 'Första skoldagen', current_date
);
select public.save_school_banner(
  null, '{SCHOOL}', '{DEPARTMENT}', 'important', 'Magsjuka', 'Flera fall på avdelningen.',
  now() - interval '1 hour', now() + interval '1 day'
);
select public.save_school_event(
  '{EVENT}', '{SCHOOL}', '{DEPARTMENT}', 'Vårfest', 'Vi ses på gården.', 'Gården',
  now() + interval '2 days', now() + interval '2 days 2 hours', true, current_date + 1
);
select public.save_subject_progress(
  null, '{CHILD}', 'Matematik', 'VT 2027', 'on_track', 'B', 'Arbetar säkert.', 'Öva problemlösning.'
);
select public.save_school_assignment(
  null, '{CHILD}', 'Svenska', 'Läs kapitel 4', 'Ta med boken.', current_date + 3, 'homework'
);

set request.jwt.claim.sub = '{GUARDIAN}';
insert into storage.objects (bucket_id, name, metadata) values (
  'lost-found-images',
  '{DEPARTMENT}/{GUARDIAN}/{LOST}.jpg',
  '{{"size":"900","mimetype":"image/jpeg"}}'
);
select public.save_lost_found_post(
  '{LOST}', '{DEPARTMENT}', 'lost', 'Blå vante', 'Saknas sedan tisdag.',
  '{DEPARTMENT}/{GUARDIAN}/{LOST}.jpg'
);
select public.respond_school_event('{EVENT}', '{CHILD}', 'yes');

do $$
begin
  begin
    perform public.save_portfolio_item(
      gen_random_uuid(), '{CHILD}', '{CHILD}/00000000-0000-0000-0000-000000000000.jpg', 'Otillåten', current_date
    );
    raise exception 'guardian portfolio write unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%saknar behörighet%' then raise; end if;
  end;
  begin
    insert into public.school_assignments (child_id, subject, title, due_on, status)
    values ('{CHILD}', 'Test', 'Direktskrivning', current_date, 'homework');
    raise exception 'direct assignment write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

set request.jwt.claim.sub = '{OTHER}';
do $$
begin
  begin
    delete from storage.objects
    where bucket_id = 'lost-found-images'
      and name = '{DEPARTMENT}/{GUARDIAN}/{LOST}.jpg';
    if found then raise exception 'another guardian deleted the lost-found image'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;
"""

ASSERTIONS = f"""
set role authenticated;
set request.jwt.claim.sub = '{GUARDIAN}';
select
  jsonb_array_length(public.list_family_features() -> 'portfolio'),
  jsonb_array_length(public.list_family_features() -> 'lost_found'),
  jsonb_array_length(public.list_family_features() -> 'banners'),
  jsonb_array_length(public.list_family_features() -> 'events'),
  jsonb_array_length(public.list_family_features() -> 'progress'),
  jsonb_array_length(public.list_family_features() -> 'assignments'),
  public.list_family_features() -> 'events' -> 0 ->> 'response';
set request.jwt.claim.sub = '{OTHER}';
select
  jsonb_array_length(public.list_family_features() -> 'portfolio'),
  jsonb_array_length(public.list_family_features() -> 'lost_found'),
  jsonb_array_length(public.list_family_features() -> 'progress'),
  jsonb_array_length(public.list_family_features() -> 'assignments'),
  exists (
    select 1 from storage.objects
    where bucket_id = 'lost-found-images'
      and name = '{DEPARTMENT}/{GUARDIAN}/{LOST}.jpg'
  );
"""


def main():
    bin_dir = postgres_bin()
    if not bin_dir:
        raise SystemExit("PostgreSQL 16 tools are required")
    if not MIGRATION.is_file():
        raise SystemExit(f"missing migration: {MIGRATION.relative_to(ROOT)}")

    work = Path(tempfile.mkdtemp(prefix="artan-022-"))
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
        psql(bin_dir, env, port, script=MIGRATION)
        psql(bin_dir, env, port, sql=EXERCISE)
        report = psql(
            bin_dir,
            env,
            port,
            sql="\\pset tuples_only on\n\\pset format unaligned\n\\pset fieldsep '|'\n" + ASSERTIONS,
        )
        lines = [line.strip() for line in report.splitlines() if line.strip()]
        expected = ["1|1|1|1|1|1|yes", "0|1|0|0|t"]
        if lines != expected:
            raise SystemExit(f"family-school results {lines}, expected {expected}")
    finally:
        if started:
            subprocess.run([str(bin_dir / "pg_ctl"), "-D", str(data), "-w", "-m", "fast", "stop"], text=True, capture_output=True, env=env)
        shutil.rmtree(work, ignore_errors=True)
    print("family and school sql checks passed")


if __name__ == "__main__":
    main()
