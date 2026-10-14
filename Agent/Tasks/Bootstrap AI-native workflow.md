---
type: agent-task
status: done
priority: 1
risk: low
created: 2026-10-14
started: 2026-10-14
completed: 2026-10-14
owner: OMP
---
# Bootstrap AI-native workflow

## Goal
Provide Arthur with an Obsidian-native durable queue and a safe, bounded OMP execution loop.

## Acceptance criteria
- [x] Obsidian exposes a task queue backed by Markdown notes.
- [x] Repository-level agent instructions define selection, state transitions, bounded execution, stop conditions, and approval boundaries.
- [x] A dependency-free command validates repository and queue invariants.
- [x] The current static application still loads through a local HTTP server.

## Constraints
Do not add a background daemon, external AI provider, model credential, production access, deployment automation, or Supabase write operation.

## Run log
- 2026-10-14: Workflow implementation started in an active OMP session.
- 2026-10-14: `python3 scripts/verify.py` passed with 6 HTML assets, 15 CSS assets, and 1 valid agent task.
- 2026-10-14: Browser smoke loaded the local application as `ärtan`, rendered the login surface, and reported no page or console errors after clean local/session storage.
- 2026-10-14: Obsidian opened `Agent/Tasks.base` as a Queue table and displayed the completed bootstrap task with status, priority, risk, owner, and dates.
