---
type: agent-task
status: done
priority: 1
risk: high
created: 2026-10-14
started: 2026-10-14
completed: 2026-10-14
owner: OMP
---
# Let parents register their children

## Goal
Replace the shared automatic test child with a realistic flow where each authenticated parent registers and manages only their own children.

## Acceptance criteria
- [x] Test parent accounts start without an automatically created child.
- [x] A parent with no children can register their first child after login.
- [x] A parent can register additional children.
- [x] Child creation atomically links the new child only to the authenticated parent and rejects non-parent or cross-organization requests.
- [x] Separate parent accounts cannot see each other's children.
- [x] The hosted migration and application are exercised in a real browser without page or console errors.

## Constraints
Use fake data only. Never persist a verification child after the smoke test. Never commit credentials or privileged keys.

## Run log
- 2026-10-14: Confirmed that the previous fixture linked all six parents to one shared child and that row-level security prevented parents from creating children directly.
- 2026-10-14: Applied the parent-registration migration to the verified Arthur Supabase project and reprovisioned the test tenant without an automatic child.
- 2026-10-14: A real parent session created a first and second temporary child through the UI. A different parent saw zero children; cross-organization and non-parent calls were rejected.
- 2026-10-14: Removed both temporary verification records and confirmed that the test department again contained zero children.
- 2026-10-14: Netlify published commit `33a5114`. The production parent session rendered the empty onboarding form with zero children and no page or console errors.
