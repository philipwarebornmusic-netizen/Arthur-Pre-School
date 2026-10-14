# Arthur AI workflow

The workflow combines Obsidian as durable task storage with OMP as the local execution agent. It is autonomous within a bounded active session; it does not run in the background or access production without approval.

## Use the queue

1. Open [[Tasks.base|Agent task queue]] in Obsidian.
2. Create one Markdown note in `Agent/Tasks/` per task using the format below.
3. Keep new work as `draft` until the goal and acceptance criteria are complete.
4. Change `status` to `ready` when OMP may execute it.
5. In OMP, ask: **Run the Arthur agent loop.**

OMP may complete up to three ready tasks during that invocation. The detailed execution and safety contract is in `AGENTS.md` at the vault root.

## Task format

```md
---
type: agent-task
status: draft
priority: 2
risk: low
created: YYYY-MM-DD
started:
completed:
owner:
---
# Clear task title

## Goal
Describe one observable outcome.

## Acceptance criteria
- [ ] State behavior that can be exercised and observed.
- [ ] State relevant boundary or failure behavior.

## Constraints
List scope limits, protected behavior, and approval requirements.

## Run log
The agent records commands, scenarios, outcomes, and blockers here.
```

Priority is `1` (highest), `2`, or `3`. Risk is `low`, `medium`, or `high`. Allowed statuses are `draft`, `ready`, `in-progress`, `blocked`, `done`, and `cancelled`.

## Approval model

Local code and documentation work may proceed inside the task's explicit scope. Deployment, Supabase migrations, production data, authentication/authorization, sensitive child data, external services, credentials, and destructive operations always require explicit approval in the active session.

## Verification

Run the baseline from the repository root:

```sh
python3 scripts/verify.py
```

For browser changes, also start the static site locally:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Then inspect `http://127.0.0.1:4173/` in a browser and exercise the changed path. Task-specific evidence belongs in that task's `## Run log`.

## Related notes

- [[Arthur]]
- [[Projektplan]]
- [[Ideer]]
