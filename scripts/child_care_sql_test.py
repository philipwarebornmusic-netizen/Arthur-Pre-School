#!/usr/bin/env python3
"""Exercise child-box authorization and absence-note persistence on throwaway Postgres."""

import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
MIGRATION = ROOT / "supabase" / "021_child_box_absence_notes.sql"
GUARDIAN = "11111111-1111-1111-1111-111111111111"
STAFF = "11111111-1111-1111-1111-111111111112"
OTHER = "11111111-1111-1111-1111-111111111113"
CHILD = "22222222-2222-2222-2222-222222222222"


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
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

do $$ begin
  create type public.attendance_status as enum ('in', 'absent_sick', 'absent_leave', 'picked_up');
exception when duplicate_object then null;
end $$;

create table public.profiles (id uuid primary key, name text);
create table public.children (id uuid primary key);
create table public.child_guardians (child_id uuid, profile_id uuid);
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  date date not null default current_date,
  status public.attendance_status not null default 'in',
  dropoff_at time,
  pickup_at time,
  pickup_by text,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (child_id, date)
);
grant select on public.attendance to authenticated;

create function public.current_profile_id() returns uuid language sql stable as $$ select auth.uid() $$;
create function public.is_guardian(target_child_id uuid) returns boolean language sql stable security definer as $$
  select exists (select 1 from public.child_guardians where child_id = target_child_id and profile_id = auth.uid())
$$;
create function public.is_staff_for_child(target_child_id uuid) returns boolean language sql stable security definer as $$
  select auth.uid() = '{STAFF}'::uuid and target_child_id = '{CHILD}'::uuid
$$;
create function public.is_admin_for_child(target_child_id uuid) returns boolean language sql stable security definer as $$ select false $$;

create function public.save_attendance_plan(uuid, public.attendance_status, time, time, text)
returns public.attendance language sql as $$ select null::public.attendance $$;
create function public.set_child_attendance(uuid, text)
returns public.attendance language sql as $$ select null::public.attendance $$;

insert into public.profiles (id, name) values
  ('{GUARDIAN}', 'Johanna'), ('{STAFF}', 'Personal'), ('{OTHER}', 'Obehörig');
insert into public.children (id) values ('{CHILD}');
insert into public.child_guardians (child_id, profile_id) values ('{CHILD}', '{GUARDIAN}');
"""

EXERCISE = f"""
set role authenticated;
set request.jwt.claim.sub = '{GUARDIAN}';
select public.save_child_box('{CHILD}', '[
  {{"item_type":"diapers","level":"few"}},
  {{"item_type":"spare_clothes","level":"many"}},
  {{"item_type":"rain_clothes","level":"many"}},
  {{"item_type":"socks","level":"none"}}
]'::jsonb);
select public.save_attendance_plan('{CHILD}', 'absent_sick', null, null, null, ' Feber och hosta ');

set request.jwt.claim.sub = '{STAFF}';
select public.save_child_box('{CHILD}', '[{{"item_type":"diapers","level":"many"}}]'::jsonb);

set request.jwt.claim.sub = '{OTHER}';
do $$
begin
  begin
    perform public.save_child_box('{CHILD}', '[{{"item_type":"diapers","level":"none"}}]'::jsonb);
    raise exception 'unauthorized child-box update unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%saknar behörighet%' then raise; end if;
  end;
end $$;

set request.jwt.claim.sub = '{GUARDIAN}';
do $$
begin
  begin
    insert into public.child_box_items (child_id, item_type, level)
    values ('{CHILD}', 'diapers', 'none');
    raise exception 'direct child-box write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
"""

ASSERTIONS = f"""
set role authenticated;
set request.jwt.claim.sub = '{GUARDIAN}';
select
  (select count(*) from public.list_child_box_items()),
  (select level from public.list_child_box_items() where item_type = 'diapers'),
  (select level from public.list_child_box_items() where item_type = 'socks'),
  (select absence_note from public.attendance where child_id = '{CHILD}');
do $$ begin perform public.save_attendance_plan('{CHILD}', 'in', '08:00', '16:30', 'Johanna', 'ska rensas'); end $$;
select absence_note is null from public.attendance where child_id = '{CHILD}';
"""


def main():
    bin_dir = postgres_bin()
    if not bin_dir:
        raise SystemExit("PostgreSQL 16 tools are required")
    if not MIGRATION.is_file():
        raise SystemExit(f"missing migration: {MIGRATION.relative_to(ROOT)}")

    work = Path(tempfile.mkdtemp(prefix="artan-021-"))
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
        report = psql(bin_dir, env, port, sql="\\pset tuples_only on\n\\pset format unaligned\n\\pset fieldsep '|'\n" + ASSERTIONS)
        lines = [line.strip() for line in report.splitlines() if line.strip()]
        values = lines[0].split("|") + lines[1:]
        expected = ["4", "many", "none", "Feber och hosta", "t"]
        if values != expected:
            raise SystemExit(f"child-care results {values}, expected {expected}")
    finally:
        if started:
            subprocess.run([str(bin_dir / "pg_ctl"), "-D", str(data), "-w", "-m", "fast", "stop"], text=True, capture_output=True, env=env)
        shutil.rmtree(work, ignore_errors=True)
    print("child care sql checks passed")


if __name__ == "__main__":
    main()
