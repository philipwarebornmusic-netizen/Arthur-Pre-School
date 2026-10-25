#!/usr/bin/env python3
"""Idempotently provision Arthur's fake preschool tenant through Supabase admin APIs."""

import argparse
import json
import os
import sys
import uuid
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

DEFAULT_URL = "https://esorbueghucqgyxzohrk.supabase.co"
TEST_DOMAIN = "artanpreschool.test"
ORGANIZATION_NAME = "Test"
PRESCHOOL_NAME = "PreSchool Test"
ORG_ID = "10000000-0000-4000-8000-000000000001"
PRESCHOOL_ID = "10000000-0000-4000-8000-000000000002"
DEPARTMENT_ID = "10000000-0000-4000-8000-000000000003"
LEGACY_SHARED_CHILD_ID = "10000000-0000-4000-8000-000000000004"
PROFILE_NAMESPACE = uuid.UUID("10000000-0000-4000-8000-000000000005")

ACCOUNTS = (
    ("Lärare", f"larare@{TEST_DOMAIN}", "admin"),
    ("Ludvig", f"ludvig@{TEST_DOMAIN}", "parent"),
    ("Agnes", f"agnes@{TEST_DOMAIN}", "parent"),
    ("Johanna", f"johanna@{TEST_DOMAIN}", "parent"),
    ("Philip", f"philip@{TEST_DOMAIN}", "parent"),
    ("Therese", f"therese@{TEST_DOMAIN}", "parent"),
    ("Andre", f"andre@{TEST_DOMAIN}", "parent"),
    ("Evelina", f"evelina@{TEST_DOMAIN}", "parent"),
    ("Oscar", f"oscar@{TEST_DOMAIN}", "parent"),
)
REQUESTED_EMAILS = {email for _, email, _ in ACCOUNTS}


class ProvisioningError(RuntimeError):
    pass


class SupabaseAdmin:
    def __init__(self, url, service_key):
        self.url = url.rstrip("/")
        self.service_key = service_key

    def request(self, method, path, payload=None, prefer=None):
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Accept": "application/json",
        }
        if body is not None:
            headers["Content-Type"] = "application/json"
        if prefer:
            headers["Prefer"] = prefer
        request = Request(f"{self.url}{path}", data=body, headers=headers, method=method)
        try:
            with urlopen(request, timeout=30) as response:
                raw = response.read()
        except HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            raise ProvisioningError(f"{method} {path} failed with HTTP {error.code}: {detail}") from error
        except URLError as error:
            raise ProvisioningError(f"{method} {path} failed: {error.reason}") from error
        return json.loads(raw) if raw else None

    def upsert(self, table, rows, conflict):
        self.request(
            "POST",
            f"/rest/v1/{table}?on_conflict={quote(conflict, safe=',')}",
            rows,
            "resolution=merge-duplicates,return=minimal",
        )


def profile_id(email):
    return str(uuid.uuid5(PROFILE_NAMESPACE, email))


def print_plan():
    print("Test tenant plan (no network changes):")
    print(f"- Organization: {ORGANIZATION_NAME}")
    print(f"- Preschool: {PRESCHOOL_NAME}")
    print("- Department: Testavdelningen")
    print("- Parent accounts start without children; each parent registers their own child in the app")
    for name, email, role in ACCOUNTS:
        print(f"- {name}: {email} ({role})")


def validate_environment():
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    password = os.environ.get("ARTHUR_TEST_PASSWORD", "")
    url = os.environ.get("SUPABASE_URL", DEFAULT_URL).strip()
    if not service_key:
        raise ProvisioningError("SUPABASE_SERVICE_ROLE_KEY is required for --apply")
    if service_key.startswith("sb_publishable_"):
        raise ProvisioningError("the browser publishable key cannot provision Auth users")
    if len(password) < 8:
        raise ProvisioningError("ARTHUR_TEST_PASSWORD must contain at least eight characters")
    if url.rstrip("/") != DEFAULT_URL:
        raise ProvisioningError(f"refusing unexpected Supabase project URL: {url}")
    return url, service_key, password


def list_auth_users(admin):
    result = admin.request("GET", "/auth/v1/admin/users?page=1&per_page=1000") or {}
    users = result.get("users", [])
    if len(users) >= 1000:
        raise ProvisioningError("Auth user list reached the safety limit; narrow provisioning manually")
    return {str(user.get("email", "")).lower(): user for user in users}


def ensure_auth_users(admin, password):
    users = list_auth_users(admin)
    ensured = {}
    for name, email, _ in ACCOUNTS:
        payload = {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"name": name},
        }
        existing = users.get(email)
        if existing:
            user = admin.request("PUT", f"/auth/v1/admin/users/{existing['id']}", payload)
        else:
            user = admin.request("POST", "/auth/v1/admin/users", payload)
        ensured[email] = user
    return ensured


def existing_profiles(admin):
    encoded = quote(ORG_ID, safe="")
    rows = admin.request(
        "GET",
        f"/rest/v1/profiles?select=id,email,role&organization_id=eq.{encoded}",
    ) or []
    unknown = {str(row.get("email", "")).lower() for row in rows} - REQUESTED_EMAILS
    if unknown:
        raise ProvisioningError(
            "test tenant already contains unrecognized profiles; refusing to overwrite: "
            + ", ".join(sorted(unknown))
        )
    return {str(row["email"]).lower(): row for row in rows}


def existing_profile_for_email(admin, email):
    rows = admin.request(
        "GET",
        f"/rest/v1/profiles?select=id,email&email=eq.{quote(email, safe='@.')}",
    ) or []
    if len(rows) > 1:
        raise ProvisioningError(f"multiple profiles found for {email}")
    return rows[0] if rows else None


def provision_data(admin, auth_users):
    current_test_profiles = existing_profiles(admin)
    admin.upsert("organizations", [{"id": ORG_ID, "name": ORGANIZATION_NAME, "type": "privat"}], "id")
    admin.upsert(
        "preschools",
        [{"id": PRESCHOOL_ID, "organization_id": ORG_ID, "name": PRESCHOOL_NAME}],
        "id",
    )
    admin.upsert(
        "departments",
        [{"id": DEPARTMENT_ID, "preschool_id": PRESCHOOL_ID, "name": "Testavdelningen"}],
        "id",
    )
    admin.request(
        "DELETE",
        f"/rest/v1/children?id=eq.{quote(LEGACY_SHARED_CHILD_ID, safe='')}",
        prefer="return=minimal",
    )

    profiles = []
    for name, email, role in ACCOUNTS:
        existing = current_test_profiles.get(email) or existing_profile_for_email(admin, email)
        identifier = existing["id"] if existing else profile_id(email)
        profiles.append({
            "id": identifier,
            "auth_user_id": auth_users[email]["id"],
            "organization_id": ORG_ID,
            "name": name,
            "email": email,
            "role": role,
        })
    admin.upsert("profiles", profiles, "email")



def verify_result(admin):
    profiles = admin.request(
        "GET",
        f"/rest/v1/profiles?select=email,role&organization_id=eq.{quote(ORG_ID, safe='')}&order=email.asc",
    ) or []
    admins = [row["email"] for row in profiles if row["role"] == "admin"]
    parents = {row["email"] for row in profiles if row["role"] == "parent"}
    expected_parents = {email for _, email, role in ACCOUNTS if role == "parent"}
    if admins != [f"larare@{TEST_DOMAIN}"]:
        raise ProvisioningError(f"administrator invariant failed: {admins}")
    if parents != expected_parents:
        raise ProvisioningError("parent account invariant failed")
    legacy_children = admin.request(
        "GET",
        f"/rest/v1/children?select=id&id=eq.{quote(LEGACY_SHARED_CHILD_ID, safe='')}",
    ) or []
    if legacy_children:
        raise ProvisioningError("legacy shared child invariant failed")
    print(f"Provisioned {ORGANIZATION_NAME} / {PRESCHOOL_NAME}: 1 administrator, 8 parents, no automatically created children.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", action="store_true", help="print the fixed fake-data plan without network access")
    parser.add_argument("--apply", action="store_true", help="apply the plan using service-role credentials")
    args = parser.parse_args()
    if args.plan == args.apply:
        parser.error("choose exactly one of --plan or --apply")
    if args.plan:
        print_plan()
        return 0

    try:
        url, service_key, password = validate_environment()
        admin = SupabaseAdmin(url, service_key)
        auth_users = ensure_auth_users(admin, password)
        provision_data(admin, auth_users)
        verify_result(admin)
    except ProvisioningError as error:
        print(f"Provisioning failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
