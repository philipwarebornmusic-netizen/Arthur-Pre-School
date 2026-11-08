#!/usr/bin/env python3
"""Static checks for the meal migration. This does not connect to a database."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
SQL_PATH = ROOT / "supabase" / "migrations" / "20261108190711_meal_menus.sql"


def fail(message):
    print(message, file=sys.stderr)
    raise SystemExit(1)


def main():
    print("STATIC meal migration checks")
    if not SQL_PATH.exists():
        fail("meal migration is missing")
    sql = SQL_PATH.read_text(encoding="utf-8")
    code = "\n".join(line for line in sql.splitlines() if not line.lstrip().startswith("--")).lower()
    if "delete from storage.objects" in code:
        fail("migration must not delete storage.objects")
    if "service_role key" in code or "sb_secret_" in code:
        fail("migration mentions a secret")
    for marker in (
        "create schema if not exists private",
        "security definer",
        "security invoker",
        "set search_path = ''",
        "enable row level security",
        "meal-menus",
        "meal-photos",
        "false, 8388608",
        "false, 2097152",
        "storage.allow_any_operation",
        "grant select on public.meal_menus, public.meal_days to authenticated",
        "not applied",
    ):
        if marker not in code and marker not in sql.lower():
            fail(f"missing {marker}")
    if "grant execute on function public.list_preschool_meals(uuid, date, date) to anon" in code:
        fail("anon must not receive the meal rpc")
    if "grant execute on function public.list_preschool_meals(uuid, date, date) to service_role" in code:
        fail("service_role must not receive the meal rpc")
    if "storage.object.list" in code:
        fail("object listing must stay out of the meal read policy")
    if sql.count("'storage.object.delete_many'") < 2 or sql.count("\n    'storage.object.delete',") < 2:
        fail("delete and delete_many must be selectable for both private buckets")
    if "meal menus object delete read" not in sql or "meal photos object delete read" not in sql:
        fail("delete SELECT policies are missing")
    if sql.count("meal_object_allowed('meal-menus', name, true)") < 1 or sql.count("meal_object_allowed('meal-photos', name, true)") < 1:
        fail("delete SELECT must require an editor")
    if "alter table storage.objects" in code:
        fail("migration must not alter storage.objects; the migration role is not its owner")
    if "relrowsecurity" not in code:
        fail("migration must check that storage.objects already has row level security")
    if "for insert to authenticated" not in code or "for update to authenticated" not in code or "for select to authenticated" not in code:
        fail("storage upsert needs insert, select, and update policies")
    if "current_role() = 'parent'" in code and "meal_preschool_editable" in code:
        fail("parent write check is unexpected in this form")
    editable = code.split("function private.meal_preschool_editable", 1)[1].split("$$;", 1)[0]
    if "parent" in editable:
        fail("editors must not include parents")
    if "'staff'" not in editable or "'admin'" not in editable:
        fail("editors must include staff and admin")
    print("static meal migration checks passed")


if __name__ == "__main__":
    main()
