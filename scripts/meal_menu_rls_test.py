#!/usr/bin/env python3
"""Executed SQL checks on an ephemeral local database. Never uses production."""

from pathlib import Path
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
MIGRATION = ROOT / "supabase" / "migrations" / "20261108190711_meal_menus.sql"
DB = "artan_meal_rls"

ORG_A = "11111111-1111-4111-8111-111111111111"
ORG_B = "22222222-2222-4222-8222-222222222222"
SCHOOL_A1 = "11111111-1111-4111-8111-1111111111a1"
SCHOOL_A2 = "11111111-1111-4111-8111-1111111111a2"
SCHOOL_B = "22222222-2222-4222-8222-2222222222b1"
DEPT_A1 = "11111111-1111-4111-8111-111111111d11"
DEPT_A2 = "11111111-1111-4111-8111-111111111d12"
DEPT_B = "22222222-2222-4222-8222-222222222d21"
ADMIN_A = "11111111-1111-4111-8111-111111111aa1"
STAFF_A1 = "11111111-1111-4111-8111-111111111aa2"
STAFF_A2 = "11111111-1111-4111-8111-111111111aa3"
PARENT_A1 = "11111111-1111-4111-8111-111111111aa4"
PARENT_A2 = "11111111-1111-4111-8111-111111111aa5"
ADMIN_B = "22222222-2222-4222-8222-222222222bb1"
CHILD_A1 = "11111111-1111-4111-8111-111111111c11"
CHILD_A2 = "11111111-1111-4111-8111-111111111c12"
CHILD_B = "22222222-2222-4222-8222-222222222c21"
MENU_A1 = "33333333-3333-4333-8333-333333333331"
MENU_A2 = "33333333-3333-4333-8333-333333333332"
MENU_OVERLAP = "33333333-3333-4333-8333-333333333333"


def fail(message):
    print(message, file=sys.stderr)
    raise SystemExit(1)


def psql(sql, database="postgres", check=True):
    completed = subprocess.run(
        ["sudo", "-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql],
        text=True,
        capture_output=True,
    )
    if check and completed.returncode != 0:
        fail(completed.stderr.strip() or completed.stdout.strip() or sql)
    return completed


def q(sql):
    lines = [line for line in psql(sql, DB).stdout.splitlines() if line.strip()]
    return lines[-1] if lines else ""


def as_user(user_id, sql):
    return q(f"select set_config('request.jwt.claim.sub', '{user_id}', false); set role authenticated; {sql}")


def as_user_op(user_id, operation, sql):
    return q(
        "select set_config('request.jwt.claim.sub', '" + user_id + "', false); "
        "select set_config('storage.operation', '" + operation + "', false); "
        "set role authenticated; " + sql
    )


def delete_count_sql(bucket, name):
    return (
        "with removed as (delete from storage.objects "
        f"where bucket_id = '{bucket}' and name = '{name}' returning name) "
        "select count(*)::text from removed"
    )


def expect_error(user_id, sql, snippet):
    completed = psql(
        f"select set_config('request.jwt.claim.sub', '{user_id}', false); set role authenticated; {sql}",
        DB,
        check=False,
    )
    output = f"{completed.stderr}\n{completed.stdout}"
    if completed.returncode == 0 or snippet not in output:
        fail(f"expected failure containing {snippet!r} for {sql}\n{output}")


HARNESS = f"""
create schema if not exists auth;
create schema if not exists extensions;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid()
returns uuid language sql stable security invoker set search_path = ''
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to public;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
grant authenticated to postgres;
grant anon to postgres;
grant service_role to postgres;

do $$ begin
  create type public.user_role as enum ('parent', 'staff', 'admin');
exception when duplicate_object then null;
end $$;

create table public.organizations (
  id uuid primary key,
  name text not null
);
create table public.preschools (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  name text not null
);
create table public.departments (
  id uuid primary key,
  preschool_id uuid not null references public.preschools(id),
  name text not null
);
create table public.profiles (
  id uuid primary key,
  auth_user_id uuid unique not null references auth.users(id),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  email text unique not null,
  role public.user_role not null
);
create table public.children (
  id uuid primary key,
  department_id uuid not null references public.departments(id),
  name text not null
);
create table public.child_guardians (
  child_id uuid not null references public.children(id),
  profile_id uuid not null references public.profiles(id),
  primary key (child_id, profile_id)
);
create table public.staff_departments (
  staff_id uuid not null references public.profiles(id),
  department_id uuid not null references public.departments(id),
  primary key (staff_id, department_id)
);

create or replace function public.current_profile_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select id from public.profiles where auth_user_id = auth.uid() $$;
create or replace function public.current_role()
returns public.user_role language sql stable security definer set search_path = ''
as $$ select role from public.profiles where auth_user_id = auth.uid() $$;
create or replace function public.current_organization_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select organization_id from public.profiles where auth_user_id = auth.uid() $$;

create schema if not exists storage;
create table storage.buckets (
  id text primary key,
  name text,
  public boolean,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  metadata jsonb
);
create or replace function storage.allow_any_operation(operations text[])
returns boolean
language sql
stable
as $$
  with current_operation as (
    select nullif(current_setting('storage.operation', true), '') as operation
  )
  select exists (
    select 1
    from unnest(coalesce(operations, '{{}}'::text[])) as candidate
    cross join current_operation
    where current_operation.operation is not null
      and candidate <> ''
      and (
        candidate = current_operation.operation
        or regexp_replace(candidate, '^storage[.]', '') = regexp_replace(current_operation.operation, '^storage[.]', '')
      )
  );
$$;
grant execute on function storage.allow_any_operation(text[]) to authenticated;

insert into auth.users (id) values
  ('{ADMIN_A}'), ('{STAFF_A1}'), ('{STAFF_A2}'), ('{PARENT_A1}'), ('{PARENT_A2}'), ('{ADMIN_B}');
insert into public.organizations (id, name) values
  ('{ORG_A}', 'Org A'), ('{ORG_B}', 'Org B');
insert into public.preschools (id, organization_id, name) values
  ('{SCHOOL_A1}', '{ORG_A}', 'School A1'),
  ('{SCHOOL_A2}', '{ORG_A}', 'School A2'),
  ('{SCHOOL_B}', '{ORG_B}', 'School B');
insert into public.departments (id, preschool_id, name) values
  ('{DEPT_A1}', '{SCHOOL_A1}', 'A1'),
  ('{DEPT_A2}', '{SCHOOL_A2}', 'A2'),
  ('{DEPT_B}', '{SCHOOL_B}', 'B');
insert into public.profiles (id, auth_user_id, organization_id, name, email, role) values
  ('{ADMIN_A}', '{ADMIN_A}', '{ORG_A}', 'Admin A', 'admin-a@example.test', 'admin'),
  ('{STAFF_A1}', '{STAFF_A1}', '{ORG_A}', 'Staff A1', 'staff-a1@example.test', 'staff'),
  ('{STAFF_A2}', '{STAFF_A2}', '{ORG_A}', 'Staff A2', 'staff-a2@example.test', 'staff'),
  ('{PARENT_A1}', '{PARENT_A1}', '{ORG_A}', 'Parent A1', 'parent-a1@example.test', 'parent'),
  ('{PARENT_A2}', '{PARENT_A2}', '{ORG_A}', 'Parent A2', 'parent-a2@example.test', 'parent'),
  ('{ADMIN_B}', '{ADMIN_B}', '{ORG_B}', 'Admin B', 'admin-b@example.test', 'admin');
insert into public.children (id, department_id, name) values
  ('{CHILD_A1}', '{DEPT_A1}', 'Child A1'),
  ('{CHILD_A2}', '{DEPT_A2}', 'Child A2'),
  ('{CHILD_B}', '{DEPT_B}', 'Child B');
insert into public.child_guardians (child_id, profile_id) values
  ('{CHILD_A1}', '{PARENT_A1}'),
  ('{CHILD_A2}', '{PARENT_A2}');
insert into public.staff_departments (staff_id, department_id) values
  ('{STAFF_A1}', '{DEPT_A1}'),
  ('{STAFF_A2}', '{DEPT_A2}');

alter table public.organizations enable row level security;
alter table public.preschools enable row level security;
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.children enable row level security;
alter table public.child_guardians enable row level security;
alter table public.staff_departments enable row level security;
"""


def main():
    print("EXECUTED SQL meal checks on ephemeral local database", DB)
    psql(f"drop database if exists {DB}")
    psql(f"create database {DB}")
    harness = Path("/tmp/meal_menu_harness.sql")
    harness.write_text(HARNESS, encoding="utf-8")
    applied = subprocess.run(
        ["sudo", "-u", "postgres", "psql", "-d", DB, "-v", "ON_ERROR_STOP=1", "-f", str(harness), "-f", str(MIGRATION)],
        text=True,
        capture_output=True,
    )
    if applied.returncode != 0:
        fail(applied.stderr.strip() or applied.stdout)
    psql(
        """
        grant usage on schema storage to authenticated;
        grant select, insert, update, delete on storage.objects to authenticated;
        grant select on storage.buckets to authenticated;
        """,
        DB,
    )

    definers = q("""
      select string_agg(proname || ':' || prosecdef::text, ',' order by proname)
      from pg_proc join pg_namespace n on n.oid = pronamespace
      where n.nspname = 'private' and proname like 'meal%'
    """)
    if ":f" in definers and "meal_display_name:f" not in definers and "meal_same_organization:f" not in definers:
        fail(f"unexpected invoker among private meal checks: {definers}")
    if q("select prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname = 'save_meal_days'") != "false":
        fail("public save_meal_days must stay security invoker")
    paths = q("""
      select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and proname like '%meal%'
        and proconfig is distinct from array['search_path=""']
    """)
    if paths != "0":
        fail("every meal function needs an empty search_path")
    policy = q("select qual from pg_policies where policyname = 'meal menus object read'")
    if "storage.object.list" in policy or "allow_any_operation" not in policy:
        fail("meal read policy does not limit storage operations")
    buckets = psql("select id || ':' || public::text || ':' || file_size_limit::text from storage.buckets where id like 'meal-%' order by id", DB).stdout.strip()
    expected_buckets = "meal-menus:false:8388608\nmeal-photos:false:2097152"
    if buckets != expected_buckets:
        fail(f"buckets are not private or sized as intended: {buckets!r} != {expected_buckets!r}")

    clock = json.loads(q("""
      select json_build_object(
        'monday', (current_date + ((1 - extract(isodow from current_date)::int + 7) % 7))::date,
        'friday', ((current_date + ((1 - extract(isodow from current_date)::int + 7) % 7))::date + 4),
        'tuesday', ((current_date + ((1 - extract(isodow from current_date)::int + 7) % 7))::date + 1)
      )::text
    """))
    monday, friday, tuesday = clock["monday"], clock["friday"], clock["tuesday"]
    path = f"{ORG_A}/{SCHOOL_A1}/{MENU_A1}.pdf"
    q(f"""
      insert into storage.objects (bucket_id, name, metadata)
      values ('meal-menus', '{path}', jsonb_build_object('mimetype', 'application/pdf', 'size', 2048))
    """)
    as_user(STAFF_A1, f"""
      select public.attach_meal_menu(
        '{MENU_A1}'::uuid, '{SCHOOL_A1}'::uuid, '{monday}'::date, '{friday}'::date,
        '{path}', '../<Fiskgratäng hemlig>.pdf'
      )
    """)
    stored = q(f"select display_name || '|' || storage_path from public.meal_menus where id = '{MENU_A1}'")
    name, stored_path = stored.split("|", 1)
    if "/" in name or "<" in name or stored_path != path:
        fail(f"display name was not kept out of the path: {stored}")
    listed = json.loads(as_user(PARENT_A1, f"select public.list_preschool_meals('{SCHOOL_A1}', '{monday}'::date, '{friday}'::date)::text"))
    if listed["days"] != [] or listed["menus"][0]["display_name"] != name:
        fail(f"parent list changed the file into dishes: {listed}")
    if "Fiskgratäng" in json.dumps(listed["days"]):
        fail("days were invented from the file name")
    expect_error(PARENT_A1, f"select public.list_preschool_meals('{SCHOOL_A2}', '{monday}'::date, '{friday}'::date)", "behörighet")
    expect_error(PARENT_A1, f"select public.list_preschool_meals('{SCHOOL_B}', '{monday}'::date, '{friday}'::date)", "behörighet")
    expect_error(PARENT_A2, f"select public.list_preschool_meals('{SCHOOL_A1}', '{monday}'::date, '{friday}'::date)", "behörighet")
    expect_error(STAFF_A2, f"select public.list_preschool_meals('{SCHOOL_A1}', '{monday}'::date, '{friday}'::date)", "behörighet")
    expect_error(ADMIN_B, f"select public.list_preschool_meals('{SCHOOL_A1}', '{monday}'::date, '{friday}'::date)", "behörighet")
    expect_error(PARENT_A1, f"select public.save_meal_days('{SCHOOL_A1}', '[{{\"served_on\":\"{tuesday}\",\"body\":\"Pasta\"}}]'::jsonb)", "behörighet")
    as_user(ADMIN_A, f"select public.list_preschool_meals('{SCHOOL_A2}', '{monday}'::date, '{friday}'::date)")
    as_user(STAFF_A1, f"select public.save_meal_days('{SCHOOL_A1}', '[{{\"served_on\":\"{tuesday}\",\"body\":\"Köttbullar\"}}]'::jsonb)")
    body = as_user(PARENT_A1, f"select body from public.meal_days where served_on = '{tuesday}'")
    if body != "Köttbullar":
        fail(f"parent could not read the typed dish: {body}")
    expect_error(STAFF_A1, f"select public.save_meal_days('{SCHOOL_A2}', '[{{\"served_on\":\"{tuesday}\",\"body\":\"Annan\"}}]'::jsonb)", "behörighet")
    path_a2 = f"{ORG_A}/{SCHOOL_A2}/{MENU_A2}.pdf"
    q(f"insert into storage.objects (bucket_id, name, metadata) values ('meal-menus', '{path_a2}', jsonb_build_object('mimetype', 'application/pdf', 'size', 100))")
    as_user(ADMIN_A, f"select public.attach_meal_menu('{MENU_A2}'::uuid, '{SCHOOL_A2}'::uuid, '{monday}'::date, '{friday}'::date, '{path_a2}', 'vecka.pdf')")
    visible = as_user(PARENT_A1, "select count(*)::text from public.meal_menus")
    if visible != "1":
        fail(f"parent saw another preschool menu: {visible}")
    staff_visible = as_user(STAFF_A1, "select count(*)::text from public.meal_menus")
    if staff_visible != "1":
        fail(f"staff saw a preschool outside the assignment: {staff_visible}")
    admin_visible = as_user(ADMIN_A, "select count(*)::text from public.meal_menus")
    if admin_visible != "2":
        fail(f"admin did not see both own-organization menus: {admin_visible}")
    other_path = f"{ORG_B}/{SCHOOL_B}/{MENU_A1}.pdf"
    q(f"insert into storage.objects (bucket_id, name, metadata) values ('meal-menus', '{other_path}', jsonb_build_object('mimetype', 'application/pdf', 'size', 100))")
    expect_error(ADMIN_B, f"select public.attach_meal_menu('{MENU_A1}'::uuid, '{SCHOOL_A1}'::uuid, '{monday}'::date, '{friday}'::date, '{path}', 'x.pdf')", "behörighet")
    q(f"insert into storage.objects (bucket_id, name, metadata) values ('meal-menus', '{ORG_A}/{SCHOOL_A1}/{MENU_OVERLAP}.pdf', jsonb_build_object('mimetype', 'application/pdf', 'size', 100))")
    expect_error(STAFF_A1, f"select public.attach_meal_menu('{MENU_OVERLAP}'::uuid, '{SCHOOL_A1}'::uuid, '{monday}'::date, '{friday}'::date, '{ORG_A}/{SCHOOL_A1}/{MENU_OVERLAP}.pdf', 'igen.pdf')", "redan en matsedel")
    listed_objects = as_user_op(STAFF_A1, "storage.object.list", "select count(*)::text from storage.objects where bucket_id = 'meal-menus'")
    if listed_objects != "0":
        fail(f"staff could list meal files: {listed_objects}")
    parent_read = as_user_op(PARENT_A1, "storage.object.get_authenticated", f"select count(*)::text from storage.objects where name = '{path}'")
    if parent_read != "1":
        fail(f"parent could not read the linked menu file: {parent_read}")
    staged = f"{ORG_A}/{SCHOOL_A1}/44444444-4444-4444-8444-444444444444.pdf"
    as_user_op(STAFF_A1, "storage.object.upload", f"insert into storage.objects (bucket_id, name, metadata) values ('meal-menus', '{staged}', jsonb_build_object('mimetype', 'application/pdf', 'size', 50))")
    hidden_stage = as_user_op(PARENT_A1, "storage.object.get_authenticated", f"select count(*)::text from storage.objects where name = '{staged}'")
    if hidden_stage != "0":
        fail("parent could read a file that is not attached")
    expect_error(STAFF_A1, f"select public.attach_meal_menu('55555555-5555-4555-8555-555555555555', '{SCHOOL_A1}', '{friday}'::date, '{monday}'::date, '{staged}', 'fel.pdf')", "intervall")
    if q(f"select storage_path from public.meal_menus where id = '{MENU_A1}'") != path or q(f"select count(*)::text from storage.objects where name in ('{path}', '{staged}')") != "2":
        fail("a rejected replacement changed the saved file")
    if as_user_op(PARENT_A1, "storage.object.delete_many", delete_count_sql("meal-menus", staged)) != "0":
        fail("parent deleted a staged menu file")
    if as_user_op(STAFF_A2, "storage.object.delete_many", delete_count_sql("meal-menus", staged)) != "0":
        fail("staff deleted a file outside their preschool")
    if as_user_op(STAFF_A1, "storage.object.delete_many", delete_count_sql("meal-menus", staged)) != "1" or q(f"select count(*)::text from storage.objects where name = '{path}'") != "1":
        fail("staff cleanup of the rejected file removed the saved file")
    replacement = f"{ORG_A}/{SCHOOL_A1}/66666666-6666-4666-8666-666666666666.jpg"
    q(f"insert into storage.objects (bucket_id, name, metadata) values ('meal-menus', '{replacement}', jsonb_build_object('mimetype', 'image/jpeg', 'size', 80))")
    as_user(STAFF_A1, f"select public.attach_meal_menu('{MENU_A1}', '{SCHOOL_A1}', '{monday}'::date, '{friday}'::date, '{replacement}', 'veckobild.jpg')")
    if q(f"select storage_path from public.meal_menus where id = '{MENU_A1}'") != replacement or q(f"select count(*)::text from storage.objects where name = '{path}'") != "1":
        fail("a valid image replacement did not keep the previous file until removal")
    if as_user_op(STAFF_A1, "storage.object.delete", delete_count_sql("meal-menus", path)) != "1":
        fail("staff could not remove the previous menu file after the reference moved")
    photo_old = f"{ORG_A}/{SCHOOL_A1}/{tuesday}--77777777-7777-4777-8777-777777777777.jpg"
    photo_new = f"{ORG_A}/{SCHOOL_A1}/{tuesday}--88888888-8888-4888-8888-888888888888.jpg"
    q(f"insert into storage.objects (bucket_id, name, metadata) values ('meal-photos', '{photo_old}', jsonb_build_object('mimetype', 'image/jpeg', 'size', 40))")
    as_user(STAFF_A1, f"select public.attach_meal_photo('{SCHOOL_A1}', '{tuesday}'::date, '{photo_old}')")
    if as_user_op(PARENT_A1, "storage.object.delete_many", delete_count_sql("meal-photos", photo_old)) != "0" or q(f"select count(*)::text from storage.objects where name = '{photo_old}'") != "1":
        fail("parent deleted a food photo")
    q(f"insert into storage.objects (bucket_id, name, metadata) values ('meal-photos', '{photo_new}', jsonb_build_object('mimetype', 'image/jpeg', 'size', 41))")
    as_user(STAFF_A1, f"select public.attach_meal_photo('{SCHOOL_A1}', '{tuesday}'::date, '{photo_new}')")
    if q(f"select photo_path from public.meal_days where served_on = '{tuesday}'") != photo_new:
        fail("food photo replacement did not keep a reference")
    if as_user_op(STAFF_A1, "storage.object.delete_many", delete_count_sql("meal-photos", photo_old)) != "1" or q(f"select count(*)::text from storage.objects where name = '{photo_new}'") != "1":
        fail("removing the previous food photo removed the current one")
    expect_error(STAFF_A1, f"select public.clear_meal_menu('{MENU_A1}')", "Ta bort filen först")
    if as_user_op(STAFF_A1, "storage.object.delete_many", delete_count_sql("meal-menus", replacement)) != "1":
        fail("staff could not delete the current menu through the delete_many policy")
    as_user(STAFF_A1, f"select public.clear_meal_menu('{MENU_A1}')")
    if q(f"select count(*)::text from public.meal_menus where id = '{MENU_A1}'") != "0":
        fail("clear left the menu row behind")
    weekend = q("select (date_trunc('week', current_date)::date + 5)::text")
    expect_error(STAFF_A1, f"select public.attach_meal_photo('{SCHOOL_A1}', '{weekend}'::date, '{ORG_A}/{SCHOOL_A1}/{weekend}.jpg')", "vardag")
    expect_error(PARENT_A1, f"insert into public.meal_days (organization_id, preschool_id, served_on, body) values ('{ORG_A}', '{SCHOOL_A1}', '{tuesday}', 'Olovlig')", "permission denied")
    anon = psql(f"set role anon; select public.list_preschool_meals('{SCHOOL_A1}', '{monday}'::date, '{friday}'::date)", DB, check=False)
    if anon.returncode == 0 or "permission denied" not in f"{anon.stderr}{anon.stdout}":
        fail(f"anon was able to call the meal rpc\n{anon.stderr}")
    if q("select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute')") != "0":
        fail("anon can execute a private meal function")
    print("executed local meal SQL checks passed")
    psql(f"drop database if exists {DB}")


if __name__ == "__main__":
    main()
