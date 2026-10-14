# Arthur agent contract

## Scope

These instructions apply to the entire repository. Arthur uses a local, bounded agent workflow: an agent may complete queued work without step-by-step supervision during an active OMP session, but no background daemon or production-autonomous process is authorized.

## Durable task queue

- The queue is `Agent/Tasks.base`; task notes live in `Agent/Tasks/`.
- Only notes with `type: agent-task` and `status: ready` are executable.
- Select the lowest numeric `priority`, then the oldest `created` date, then filename.
- Work on exactly one task at a time. At most three tasks may be completed per user-requested loop.
- Before editing code, change the selected task to `status: in-progress`, set `started`, and set `owner: OMP`.
- On success, check every acceptance criterion, set `status: done` and `completed`, and append exact verification evidence under `## Run log`.
- If progress requires unavailable information or approval, set `status: blocked`, add `blocked_reason`, record what was attempted, and stop that task. Never invent missing requirements.

Allowed statuses: `draft`, `ready`, `in-progress`, `blocked`, `done`, `cancelled`.
Allowed risk levels: `low`, `medium`, `high`.

## Bounded loop

When the user asks to run the Arthur agent loop:

1. Run `python3 scripts/verify.py` to validate repository and queue invariants.
2. Select the next eligible task using the ordering above.
3. Confirm that its goal, acceptance criteria, constraints, and risk are explicit. Ambiguous tasks become `blocked`; do not broaden their scope.
4. Reproduce bugs before changing code. Inspect existing conventions and all affected callers.
5. Implement the smallest maintainable change that satisfies every acceptance criterion.
6. Run `python3 scripts/verify.py` and the task-specific checks. For UI changes, serve the repository with `python3 -m http.server 4173 --bind 127.0.0.1` and inspect the changed path in a browser.
7. Update the task note and `CHANGELOG.md` when behavior changes.
8. Continue only while another eligible task exists and the three-task limit has not been reached. Otherwise stop and report completed, blocked, and remaining tasks.

Stop immediately if verification fails after the task is restored to a safe state, the working tree contains a conflicting user edit, or an approval boundary is reached.

## Approval boundaries

Explicit user approval in the active session is required before any of these actions:

- deploying or changing Netlify production configuration;
- applying or altering a Supabase migration;
- writing, deleting, exporting, or inspecting production records;
- changing authentication, authorization, row-level security, invitations, consent, health, or child-data handling;
- adding a dependency, paid service, model credential, secret, or external integration;
- destructive version-control or filesystem operations.

Never place a Supabase service-role key, model API key, access token, child record, health record, contact record, or consent record in the repository, task notes, prompts, logs, screenshots, or fixtures. The browser publishable key in `supabase-config.js` is intentionally public; no privileged key belongs in browser code.

## Verification contract

`python3 scripts/verify.py` is the mandatory baseline. It checks:

- required application and workflow files;
- local assets referenced by HTML and CSS;
- browser configuration for privileged-key markers;
- task frontmatter, allowed states, priorities, risk levels, and the single-active-task invariant;
- completed-task acceptance criteria and completion evidence.

A passing baseline is necessary, not sufficient. Every task must also exercise its changed behavior. Never mark a task done based only on source inspection.
