#!/usr/bin/env python3
"""Dependency-free baseline verification for Arthur and its local agent queue."""

import ast
from html.parser import HTMLParser
from pathlib import Path
import subprocess
from urllib.parse import unquote, urlsplit
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
TASKS_DIR = ROOT / "Agent" / "Tasks"
REQUIRED_FILES = (
    "index.html",
    "app.js",
    "styles.css",
    "supabase-config.js",
    "AGENTS.md",
    "Agent/Workflow.md",
    "Agent/Tasks.base",
    "scripts/provision_test_school.py",
)
ALLOWED_STATUSES = {"draft", "ready", "in-progress", "blocked", "done", "cancelled"}
ALLOWED_RISKS = {"low", "medium", "high"}
CSS_URL = re.compile(r"url\(\s*(['\"]?)([^)'\"]+)\1\s*\)", re.IGNORECASE)
FORBIDDEN_BROWSER_KEYS = ("service_role", "sb_secret_", "secret_key")


class AssetParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.assets = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        for name in ("src", "href"):
            value = attributes.get(name)
            if value:
                self.assets.append((tag, name, value))


def local_asset(base, value):
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or value.startswith(("#", "data:", "mailto:", "tel:")):
        return None
    relative = unquote(parsed.path)
    if not relative:
        return None
    candidate = (base / relative.lstrip("/")).resolve() if relative.startswith("/") else (base / relative).resolve()
    try:
        candidate.relative_to(ROOT)
    except ValueError:
        return False
    return candidate


def frontmatter(path, errors):
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0] != "---":
        errors.append(f"{path.relative_to(ROOT)}: missing YAML frontmatter")
        return {}, lines
    try:
        end = lines.index("---", 1)
    except ValueError:
        errors.append(f"{path.relative_to(ROOT)}: unclosed YAML frontmatter")
        return {}, lines

    values = {}
    for line in lines[1:end]:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            errors.append(f"{path.relative_to(ROOT)}: invalid frontmatter line: {line}")
            continue
        key, value = line.split(":", 1)
        values[key.strip()] = value.strip().strip('"\'')
    return values, lines[end + 1 :]


def check_required_files(errors):
    for relative in REQUIRED_FILES:
        path = ROOT / relative
        if not path.is_file() or path.stat().st_size == 0:
            errors.append(f"missing or empty required file: {relative}")


def check_html_assets(errors):
    index = ROOT / "index.html"
    if not index.is_file():
        return 0
    parser = AssetParser()
    parser.feed(index.read_text(encoding="utf-8"))
    checked = 0
    for tag, attribute, value in parser.assets:
        asset = local_asset(ROOT, value)
        if asset is None:
            continue
        checked += 1
        if asset is False or not asset.is_file():
            errors.append(f"index.html: missing local asset in {tag} {attribute}={value!r}")
    return checked


def check_css_assets(errors):
    checked = 0
    for stylesheet in ROOT.rglob("*.css"):
        for _, value in CSS_URL.findall(stylesheet.read_text(encoding="utf-8")):
            asset = local_asset(stylesheet.parent, value.strip())
            if asset is None:
                continue
            checked += 1
            if asset is False or not asset.is_file():
                relative = stylesheet.relative_to(ROOT)
                errors.append(f"{relative}: missing local asset {value!r}")
    return checked


def check_browser_config(errors):
    config_path = ROOT / "supabase-config.js"
    if not config_path.is_file():
        return
    config = config_path.read_text(encoding="utf-8").lower()
    for marker in FORBIDDEN_BROWSER_KEYS:
        if marker in config:
            errors.append(f"supabase-config.js: privileged-key marker {marker!r} is forbidden")

def check_python_sources(errors):
    checked = 0
    for source in sorted((ROOT / "scripts").glob("*.py")):
        checked += 1
        try:
            ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
        except SyntaxError as error:
            errors.append(f"{source.relative_to(ROOT)}:{error.lineno}: invalid Python syntax: {error.msg}")
    return checked


def check_tasks(errors):
    if not TASKS_DIR.is_dir():
        errors.append("missing task directory: Agent/Tasks")
        return 0

    task_count = 0
    active = []
    for path in sorted(TASKS_DIR.glob("*.md")):
        task_count += 1
        values, body = frontmatter(path, errors)
        relative = path.relative_to(ROOT)
        required = ("type", "status", "priority", "risk", "created")
        for key in required:
            if not values.get(key):
                errors.append(f"{relative}: missing required property {key!r}")

        if values.get("type") != "agent-task":
            errors.append(f"{relative}: type must be 'agent-task'")
        status = values.get("status")
        if status not in ALLOWED_STATUSES:
            errors.append(f"{relative}: unsupported status {status!r}")
        if values.get("risk") not in ALLOWED_RISKS:
            errors.append(f"{relative}: unsupported risk {values.get('risk')!r}")
        try:
            priority = int(values.get("priority", ""))
            if priority not in (1, 2, 3):
                raise ValueError
        except ValueError:
            errors.append(f"{relative}: priority must be 1, 2, or 3")

        if status == "in-progress":
            active.append(str(relative))
            if not values.get("started") or not values.get("owner"):
                errors.append(f"{relative}: active task requires started and owner")
        if status == "blocked" and not values.get("blocked_reason"):
            errors.append(f"{relative}: blocked task requires blocked_reason")
        if status == "done":
            if not values.get("completed"):
                errors.append(f"{relative}: completed task requires completed date")
            unchecked = [line for line in body if line.lstrip().startswith("- [ ]")]
            if unchecked:
                errors.append(f"{relative}: completed task has unchecked acceptance criteria")
            if "## Run log" not in body:
                errors.append(f"{relative}: completed task requires a Run log section")

        if "## Goal" not in body or "## Acceptance criteria" not in body or "## Run log" not in body:
            errors.append(f"{relative}: task requires Goal, Acceptance criteria, and Run log sections")

    if len(active) > 1:
        errors.append("multiple in-progress tasks violate the single-active-task invariant: " + ", ".join(active))
    return task_count


def check_term_parser(errors):
    result = subprocess.run(["node", "scripts/term_parser_test.mjs"], cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        detail = (result.stdout + result.stderr).strip() or "term parser checks failed"
        errors.append(detail)


def main():
    errors = []
    check_required_files(errors)
    html_assets = check_html_assets(errors)
    css_assets = check_css_assets(errors)
    check_browser_config(errors)
    python_sources = check_python_sources(errors)
    tasks = check_tasks(errors)
    check_term_parser(errors)

    if errors:
        print("Arthur verification FAILED", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        "Arthur verification passed: "
        f"{html_assets} HTML assets, {css_assets} CSS assets, "
        f"{python_sources} Python scripts, {tasks} agent task(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
