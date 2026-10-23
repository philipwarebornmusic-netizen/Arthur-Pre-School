#!/usr/bin/env python3
"""Load migration 018 on a throwaway Postgres and reject ambiguous PL/pgSQL names."""

import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
PG_BIN = Path("/usr/lib/postgresql/16/bin")
MIGRATION = ROOT / "supabase" / "018_pickup_hub.sql"
CHECK_LIB = Path("/usr/lib/postgresql/16/lib/plpgsql_check.so")

GUARDIAN = "11111111-1111-1111-1111-111111111111"
CHILD = "22222222-2222-2222-2222-222222222222"
PRESCHOOL = "33333333-3333-3333-3333-333333333333"
DEPARTMENT = "44444444-4444-4444-4444-444444444444"
TERM = "55555555-5555-5555-5555-555555555555"
CONTACT = "66666666-6666-6666-6666-666666666666"
DAY_PASS = "77777777-7777-7777-7777-777777777777"
PERMANENT = "88888888-8888-8888-8888-888888888888"
EXPIRED = "99999999-9999-9999-9999-999999999999"
ENDED = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
TOKEN = "ab" * 32

STUB = f"""
create schema if not exists auth;
create schema if not exists extensions;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create extension if not exists pgcrypto with schema extensions;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table public.profiles (
  id uuid primary key,
  name text,
  role text,
  removed_at timestamptz
);
create table public.departments (
  id uuid primary key,
  preschool_id uuid
);
create table public.children (
  id uuid primary key,
  department_id uuid
);
create table public.child_guardians (
  child_id uuid,
  profile_id uuid
);
create table public.school_terms (
  id uuid primary key,
  preschool_id uuid,
  status text,
  starts_on date,
  ends_on date,
  opens_at time,
  closes_at time
);
create table public.school_term_closures (
  term_id uuid,
  closure_date date
);
create table public.child_weekly_schedules (
  child_id uuid,
  term_id uuid,
  weekday smallint,
  attending boolean,
  dropoff_at time,
  pickup_at time
);
create table public.pickup_contacts (
  id uuid primary key,
  child_id uuid,
  name text,
  relation text,
  blocked boolean
);
create table public.pickup_passes (
  id uuid primary key,
  child_id uuid,
  pickup_date date,
  token_hash text,
  person_name text,
  person_relation text,
  person_phone text,
  revoked_at timestamptz,
  used_at timestamptz,
  starts_at timestamptz,
  expires_at timestamptz
);
create table public.permanent_pickup_passes (
  id uuid primary key,
  token_hash text,
  revoked_at timestamptz,
  ends_on date
);
create table public.permanent_pickup_pass_children (
  pass_id uuid,
  child_id uuid,
  contact_id uuid
);

create function public.pickup_secret_hash(presented text) returns text
language sql immutable
set search_path = public, extensions
as $$ select encode(extensions.digest(presented, 'sha256'), 'hex') $$;

create function public.pickup_stockholm_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Stockholm')::date $$;

create function public.current_profile_id() returns uuid
language sql stable as $$ select auth.uid() $$;

create function public.is_guardian(target_child_id uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from public.child_guardians
    where child_id = target_child_id and profile_id = auth.uid()
  );
$$;

create function public.is_staff_for_child(target_child_id uuid) returns boolean
language sql stable as $$ select true $$;

create function public.is_admin_for_child(target_child_id uuid) returns boolean
language sql stable as $$ select false $$;

create function public.guardian_can_see_permanent_pass(target_pass_id uuid) returns boolean
language sql stable as $$
  select exists (
    select 1
    from public.permanent_pickup_pass_children link
    join public.child_guardians guardian on guardian.child_id = link.child_id
    where link.pass_id = target_pass_id and guardian.profile_id = auth.uid()
  );
$$;

create function public.permanent_contact_allowed(target_contact_id uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from public.pickup_contacts
    where id = target_contact_id and blocked = false
  );
$$;

create function public.pickup_name_blocked(target_child_id uuid, person_name text) returns boolean
language sql immutable as $$ select false $$;

create function public.save_child_weekly_schedule(target_term_id uuid, target_child_id uuid, weekly_schedule jsonb)
returns void
language plpgsql as $$
begin
  delete from public.child_weekly_schedules
  where child_id = target_child_id and term_id = target_term_id;
  insert into public.child_weekly_schedules (child_id, term_id, weekday, attending, dropoff_at, pickup_at)
  select target_child_id, target_term_id,
    (entry ->> 'weekday')::smallint,
    coalesce((entry ->> 'attending')::boolean, false),
    nullif(entry ->> 'dropoff_at', '')::time,
    nullif(entry ->> 'pickup_at', '')::time
  from jsonb_array_elements(weekly_schedule) entry;
end;
$$;
"""

EXERCISE = f"""
select set_config('request.jwt.claim.sub', '{GUARDIAN}', false);

insert into public.profiles (id, name, role) values ('{GUARDIAN}', 'Anna', 'parent');
insert into public.departments (id, preschool_id) values ('{DEPARTMENT}', '{PRESCHOOL}');
insert into public.children (id, department_id) values ('{CHILD}', '{DEPARTMENT}');
insert into public.child_guardians (child_id, profile_id) values ('{CHILD}', '{GUARDIAN}');
insert into public.school_terms (id, preschool_id, status, starts_on, ends_on, opens_at, closes_at)
values ('{TERM}', '{PRESCHOOL}', 'published', '2026-01-01', '2026-12-31', '06:30', '18:30');
insert into public.pickup_contacts (id, child_id, name, relation, blocked)
values ('{CONTACT}', '{CHILD}', 'Karin', 'Mormor', false);

insert into public.pickup_passes (
  id, child_id, pickup_date, token_hash, person_name, person_relation, starts_at, expires_at
) values (
  '{DAY_PASS}', '{CHILD}', '2026-10-22', public.pickup_secret_hash('{TOKEN}'),
  'Karin', 'Mormor', now() - interval '1 hour', now() + interval '1 day'
);
insert into public.permanent_pickup_passes (id, token_hash, ends_on)
values ('{PERMANENT}', public.pickup_secret_hash('{TOKEN}'), null);
insert into public.permanent_pickup_pass_children (pass_id, child_id, contact_id)
values ('{PERMANENT}', '{CHILD}', '{CONTACT}');

insert into public.pickup_passes (
  id, child_id, pickup_date, token_hash, person_name, person_phone, expires_at
) values (
  '{EXPIRED}', '{CHILD}', '2026-10-01', public.pickup_secret_hash('{TOKEN}'),
  'Gammal', '070', now() - interval '8 days'
);

select public.remember_pickup_pass_token('{DAY_PASS}'::uuid, 'day', '{TOKEN}');
select public.remember_pickup_pass_token('{DAY_PASS}'::uuid, 'day', '{TOKEN}');
select public.reveal_pickup_pass('{DAY_PASS}'::uuid, 'day');
select public.remember_pickup_pass_token('{PERMANENT}'::uuid, 'permanent', '{TOKEN}');
select public.reveal_pickup_pass('{PERMANENT}'::uuid, 'permanent');

select public.save_pickup_day(
  '{CHILD}'::uuid, '2026-10-19'::date, '08:00'::time, '16:30'::time, 'guardian', '{GUARDIAN}'::uuid, null
);
select public.save_pickup_day(
  '{CHILD}'::uuid, '2026-10-19'::date, '08:15'::time, '16:00'::time, 'guardian', '{GUARDIAN}'::uuid, null
);

select public.save_pickup_standard_week('{CHILD}'::uuid, '[
  {{"weekday":1,"attending":true,"dropoff_at":"08:00","pickup_at":"16:30","picker_kind":"guardian","picker_id":"{GUARDIAN}"}},
  {{"weekday":2,"attending":true,"dropoff_at":"08:00","pickup_at":"16:30","picker_kind":"guardian","picker_id":"{GUARDIAN}"}},
  {{"weekday":3,"attending":true,"dropoff_at":"08:00","pickup_at":"16:30","picker_kind":"guardian","picker_id":"{GUARDIAN}"}},
  {{"weekday":4,"attending":true,"dropoff_at":"08:00","pickup_at":"16:30","picker_kind":"contact","picker_id":"{CONTACT}"}},
  {{"weekday":5,"attending":false}}
]'::jsonb);

select public.copy_pickup_week('{CHILD}'::uuid, '2026-10-19'::date);
select public.copy_pickup_week('{CHILD}'::uuid, '2026-10-19'::date);
select public.list_pickup_calendar('{CHILD}'::uuid);
select count(*) from public.list_department_pickup_plans();

insert into public.pickup_pass_secrets (pass_kind, pass_id, token)
values ('day', '{EXPIRED}', '{TOKEN}');
insert into public.permanent_pickup_passes (id, token_hash, ends_on, revoked_at)
values ('{ENDED}', public.pickup_secret_hash('{TOKEN}'), current_date - 1, now());
insert into public.permanent_pickup_pass_children (pass_id, child_id, contact_id)
values ('{ENDED}', '{CHILD}', '{CONTACT}');
insert into public.pickup_pass_secrets (pass_kind, pass_id, token)
values ('permanent', '{ENDED}', '{TOKEN}');

select public.purge_expired_pickup_details();
"""

CHECK = """
create extension if not exists plpgsql_check;
select coalesce(string_agg(format('%s:%s:%s %s', proname, lineno, level, message), E'\\n'), '')
from (
  select p.proname, checked.lineno, checked.level, checked.message
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral plpgsql_check_function_tb(p.oid::regprocedure, fatal_errors := false) checked
  where n.nspname = 'public'
    and p.proname in (
      'remember_pickup_pass_token',
      'reveal_pickup_pass',
      'pickup_picker_problem',
      'save_pickup_day',
      'save_pickup_standard_week',
      'copy_pickup_week',
      'list_pickup_calendar',
      'list_department_pickup_plans',
      'purge_expired_pickup_details'
    )
) issues
where level = 'error'
   or message ilike '%ambiguous%'
   or message ilike '%42702%';
"""

ASSERTS = f"""
select
  (select person_name is null and person_phone is null from public.pickup_passes where id = '{EXPIRED}')
    as name_cleared,
  (select count(*) from public.pickup_pass_secrets where pass_id = '{EXPIRED}') as expired_secrets,
  (select count(*) from public.pickup_pass_secrets where pass_id = '{ENDED}') as ended_secrets,
  (select count(*) from public.pickup_pass_secrets where pass_id = '{DAY_PASS}') as day_secrets,
  (select count(*) from public.pickup_pass_secrets where pass_id = '{PERMANENT}') as permanent_secrets,
  (select dropoff_at = time '08:15' from public.pickup_day_plans where child_id = '{CHILD}' and plan_date = '2026-10-19')
    as day_updated,
  (select count(*) from public.pickup_day_plans where child_id = '{CHILD}' and plan_date between '2026-10-26' and '2026-10-30')
    as copied_days;
"""


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def run(command, env, **kwargs):
    result = subprocess.run(command, text=True, capture_output=True, env=env, **kwargs)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "command failed").strip())
    return result.stdout


def psql(env, port, sql=None, script=None):
    command = [
        str(PG_BIN / "psql"),
        "-h", "127.0.0.1",
        "-p", str(port),
        "-U", "artan",
        "-d", "postgres",
        "-v", "ON_ERROR_STOP=1",
        "-X",
        "-q",
    ]
    if script:
        command.extend(["-f", str(script)])
        result = subprocess.run(command, text=True, capture_output=True, env=env)
    else:
        result = subprocess.run(command, input=sql, text=True, capture_output=True, env=env)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "psql failed").strip())
    return result.stdout


def main():
    if not CHECK_LIB.exists():
        raise SystemExit("postgresql-16-plpgsql-check is required to catch ambiguous column names")
    if not MIGRATION.exists():
        raise SystemExit("supabase/018_pickup_hub.sql is missing")

    work = Path(tempfile.mkdtemp(prefix="artan-018-"))
    data = work / "data"
    port = free_port()
    env = os.environ.copy()
    env["PATH"] = f"{PG_BIN}:{env.get('PATH', '')}"
    env["PGHOST"] = "127.0.0.1"
    env["PGPORT"] = str(port)
    env["PGUSER"] = "artan"
    started = False
    try:
        run([
            str(PG_BIN / "initdb"), "-D", str(data), "-U", "artan",
            "--auth-local=trust", "--auth-host=trust",
        ], env)
        config = (data / "postgresql.conf").read_text()
        config += (
            f"\nlisten_addresses = '127.0.0.1'\nport = {port}\n"
            f"unix_socket_directories = '{work}'\n"
        )
        (data / "postgresql.conf").write_text(config)
        run([
            str(PG_BIN / "pg_ctl"), "-D", str(data), "-l", str(work / "server.log"), "-w", "start",
        ], env)
        started = True
        psql(env, port, sql=STUB)
        psql(env, port, script=MIGRATION)
        problems = psql(env, port, sql="\\pset tuples_only on\n" + CHECK).strip()
        if problems:
            raise SystemExit(f"plpgsql_check found ambiguous or invalid SQL:\n{problems}")
        psql(env, port, sql=EXERCISE)
        report = psql(env, port, sql="\\pset tuples_only on\n\\pset format unaligned\n\\pset fieldsep '|'\n" + ASSERTS)
        expected = ["t", "0", "0", "1", "1", "t", "4"]
        values = [part.strip() for part in report.strip().split("|")]
        if values != expected:
            raise SystemExit(
                "rpc results mismatch: "
                "name_cleared, expired_secrets, ended_secrets, day_secrets, "
                f"permanent_secrets, day_updated, copied_days = {values}, expected {expected}"
            )
    finally:
        if started:
            subprocess.run(
                [str(PG_BIN / "pg_ctl"), "-D", str(data), "-w", "-m", "fast", "stop"],
                text=True, capture_output=True, env=env,
            )
        shutil.rmtree(work, ignore_errors=True)
    print("pickup hub sql checks passed")


if __name__ == "__main__":
    main()
