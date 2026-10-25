#!/usr/bin/env python3
"""Static checks for migration 020. The file matches the applied migration."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
SQL_PATH = ROOT / "supabase" / "020_contact_photos_pass_renewal.sql"


def fail(message):
    print(message, file=sys.stderr)
    raise SystemExit(1)


def slice_function(source, name):
    marker = f"create or replace function public.{name}"
    start = source.find(marker)
    if start < 0:
        marker = f"create function public.{name}"
        start = source.find(marker)
    if start < 0:
        fail(f"{name} saknas")
    next_function = source.find("\ncreate ", start + len(marker))
    return source[start:] if next_function < 0 else source[start:next_function]


def main():
    if not SQL_PATH.exists():
        fail("supabase/020_contact_photos_pass_renewal.sql saknas")
    sql = SQL_PATH.read_text(encoding="utf-8")
    lowered = sql.lower()
    code = "\n".join(line for line in sql.splitlines() if not line.lstrip().startswith("--")).lower()
    if "contact-photos" not in sql or "false, 2097152, array['image/jpeg']" not in lowered:
        fail("bucket contact-photos ska vara privat, högst 2 MB och bara jpeg")
    if "service_role" in code:
        fail("020 nämner service_role")
    if "delete from storage.objects" in code:
        fail("020 får inte radera storage.objects")
    for name in ("list_pickup_contacts", "list_permanent_pickup_passes"):
        if f"drop function if exists public.{name}()" not in sql:
            fail(f"{name} måste droppas innan returtypen ändras")
    if "photo_path" not in sql or "renewal_dismissed" not in sql:
        fail("photo_path och renewal_dismissed saknas")
    for name in ("set_pickup_contact_photo", "clear_pickup_contact_photo", "extend_permanent_pickup_pass", "dismiss_permanent_pass_reminder"):
        if f"function public.{name}" not in sql:
            fail(f"{name} saknas")
    for name in ("extend_permanent_pickup_pass", "dismiss_permanent_pass_reminder", "pickup_next_term_end"):
        body = slice_function(sql, name)
        if "set search_path = public, extensions" not in body:
            fail(f"{name} saknar search_path = public, extensions")
        if "security definer" not in body.lower():
            fail(f"{name} ska vara security definer")
    extend = slice_function(sql, "extend_permanent_pickup_pass")
    dismiss = slice_function(sql, "dismiss_permanent_pass_reminder")
    writer = slice_function(sql, "can_write_contact_photo")
    reader = slice_function(sql, "can_read_contact_photo")
    if "is_guardian" not in extend or "is_guardian" not in dismiss or "is_guardian" not in writer:
        fail("förlängning, avfärdande och bilduppladdning kräver vårdnadshavare")
    if "parent" not in extend or "auth.uid() is null" not in extend:
        fail("förlängning ska vägra anonym och icke-vårdnadshavare")
    if "is_staff_for_child" not in reader or "is_admin_for_child" not in reader:
        fail("läsning ska omfatta personal på barnets avdelning")
    if "is_staff_for_child" in writer:
        fail("personal ska inte kunna skriva bilden")
    if "create or replace function public.create_pickup_pass" in sql or "create or replace function public.create_permanent_pickup_pass" in sql:
        fail("befintliga skapa-pass-funktioner ska inte skrivas om")
    if "create or replace function public.get_pass_by_token" in sql:
        fail("det publika passet ska inte få en bild")
    grants = [line.strip().lower() for line in sql.splitlines() if line.strip().lower().startswith("grant ")]
    if not grants:
        fail("020 saknar grant")
    if any("anon" in line for line in grants):
        fail("anon får inte de nya funktionerna")
    if "grant execute on function public.extend_permanent_pickup_pass(uuid) to authenticated" not in sql:
        fail("inloggade vårdnadshavare ska kunna förlänga")
    if "grant execute on function public.pickup_contact_photo_path" in sql or "grant execute on function public.pickup_next_term_end" in sql:
        fail("hjälpfunktionerna ska inte vara anropbara")
    if "revoke all on function public.permanent_pickup_verify(uuid) from public, anon, authenticated;" not in sql:
        fail("permanent_pickup_verify ska vara återkallad för inloggade användare")
    if "grant execute on function public.permanent_pickup_verify" in sql:
        fail("permanent_pickup_verify ska inte kunna anropas med bara passets id")
    if "permanent_pass_reminder_dismissals" not in sql or "enable row level security" not in sql:
        fail("påminnelsetabellen ska ha RLS och inga klientpolicyer")
    if "create policy" in sql and "to anon" in lowered:
        fail("lagringspolicyer ska inte gälla anon")
    print("contact photo sql checks passed")


if __name__ == "__main__":
    main()
