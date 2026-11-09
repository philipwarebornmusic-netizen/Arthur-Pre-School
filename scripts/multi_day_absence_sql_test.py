#!/usr/bin/env python3
"""Exercise multi-day absence validation, authorization, and period replacement."""

import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
MIGRATION = ROOT / "supabase" / "023_multi_day_absence.sql"
GUARDIAN = "11111111-1111-1111-1111-111111111111"
OTHER = "11111111-1111-1111-1111-111111111112"
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


def run(command, env, *, input_text=None, check=True):
    result = subprocess.run(command, input=input_text, text=True, capture_output=True, env=env)
    if check and result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip())
    return result


def psql(bin_dir, env, port, *, sql=None, script=None, check=True):
    command = [
        str(bin_dir / "psql"), "-h", "127.0.0.1", "-p", str(port),
        "-U", "artan", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-X", "-q",
    ]
    if script:
        command.extend(["-f", str(script)])
        return run(command, env, check=check)
    return run(command, env, input_text=sql, check=check)


STUB = f"""
create schema auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create type public.attendance_status as enum ('in', 'absent_sick', 'absent_leave', 'picked_up');
create table public.profiles (id uuid primary key, auth_user_id uuid unique not null);
create table public.children (id uuid primary key);
create table public.child_guardians (child_id uuid not null, guardian_id uuid not null, primary key (child_id, guardian_id));
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  date date not null default current_date,
  status public.attendance_status not null default 'in',
  dropoff_at time,
  pickup_at time,
  pickup_by text,
  absence_note text,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (child_id, date)
);
create function public.current_profile_id() returns uuid language sql stable security definer set search_path = public
as $$ select id from public.profiles where auth_user_id = auth.uid() $$;
create function public.is_guardian(target_child_id uuid) returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.child_guardians cg
  join public.profiles p on p.id = cg.guardian_id
  where cg.child_id = target_child_id and p.auth_user_id = auth.uid()
) $$;
insert into public.profiles (id, auth_user_id) values
  ('{GUARDIAN}', '{GUARDIAN}'), ('{OTHER}', '{OTHER}');
insert into public.children (id) values ('{CHILD}');
insert into public.child_guardians (child_id, guardian_id) values ('{CHILD}', '{GUARDIAN}');
grant usage on schema public, auth to authenticated;
grant execute on function auth.uid(), public.current_profile_id(), public.is_guardian(uuid) to authenticated;
grant select on public.attendance to authenticated;
"""

EXERCISE = f"""
set role authenticated;
set request.jwt.claim.sub = '{GUARDIAN}';
select public.save_attendance_period('{CHILD}', 'absent_sick', current_date + 6, 'Feber');
reset role;

do $$
begin
  perform set_config('request.jwt.claim.sub', '{OTHER}', false);
  begin
    perform public.save_attendance_period('{CHILD}', 'absent_sick', current_date + 1, null);
    raise exception 'unauthorized guardian saved absence';
  exception when others then
    if sqlerrm = 'unauthorized guardian saved absence' then raise; end if;
    if sqlerrm <> 'Du är inte vårdnadshavare för barnet' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', '{GUARDIAN}', false);
  begin
    perform public.save_attendance_period('{CHILD}', 'absent_sick', current_date + 31, null);
    raise exception 'oversized absence period was accepted';
  exception when others then
    if sqlerrm = 'oversized absence period was accepted' then raise; end if;
    if sqlerrm <> 'Frånvaro kan registreras högst 31 dagar åt gången' then raise; end if;
  end;
end $$;

select public.save_attendance_period('{CHILD}', 'absent_leave', current_date + 2, 'Familjeledig');
"""

ASSERTIONS = f"""
select
  count(*) = (select count(*) from generate_series(current_date, current_date + 2, interval '1 day') day where extract(isodow from day) < 6),
  bool_and(status = 'absent_leave'),
  bool_and(absence_note = 'Familjeledig'),
  bool_and(absence_ends_on = current_date + 2),
  bool_and(extract(isodow from date) < 6),
  not exists (select 1 from public.attendance where child_id = '{CHILD}' and date > current_date + 2)
from public.attendance
where child_id = '{CHILD}';
update public.attendance set status = 'in' where child_id = '{CHILD}' and date = current_date;
select
  (select absence_ends_on is null from public.attendance where child_id = '{CHILD}' and date = current_date),
  not exists (select 1 from public.attendance where child_id = '{CHILD}' and date > current_date);
"""


def main():
    bin_dir = postgres_bin()
    if not bin_dir:
        raise SystemExit("PostgreSQL 16 tools are required")
    if not MIGRATION.is_file():
        raise SystemExit(f"missing migration: {MIGRATION.relative_to(ROOT)}")

    work = Path(tempfile.mkdtemp(prefix="artan-023-"))
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
        ).stdout
        lines = [line.strip() for line in report.splitlines() if line.strip()]
        expected = ["t|t|t|t|t|t", "t|t"]
        if lines != expected:
            raise SystemExit(f"multi-day absence results {lines}, expected {expected}")
    finally:
        if started:
            subprocess.run([str(bin_dir / "pg_ctl"), "-D", str(data), "-w", "-m", "fast", "stop"], text=True, capture_output=True, env=env)
        shutil.rmtree(work, ignore_errors=True)
    print("multi-day absence sql checks passed")


if __name__ == "__main__":
    main()
