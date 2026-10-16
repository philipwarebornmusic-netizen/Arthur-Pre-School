---
type: agent-task
status: done
priority: 1
risk: high
created: 2026-10-16
started: 2026-10-16
completed: 2026-10-16
owner: OMP
---
# Refresh fixed test account access

## Goal
Give every fixed `@artanpreschool.test` account the shared password supplied by the user and confirm that all accounts can authenticate.

## Acceptance criteria
- [x] The administrator and all six fixed parent accounts use the requested shared password.
- [x] Password authentication succeeds for all seven accounts.
- [x] The password and privileged project keys are not written to the repository, task notes, screenshots, or verification output.

## Constraints
Change only the seven fixed fake test accounts. Never change historical `@arthur.test` accounts or real users. Keep the password solely in transient runtime memory.

## Run log
- 2026-10-16: Located exactly seven fixed `@artanpreschool.test` Auth users in the verified Arthur Supabase project.
- 2026-10-16: Updated those seven users through the Supabase Auth Admin API using project credentials held only in authenticated dashboard memory.
- 2026-10-16: Password-grant requests returned HTTP 200 for the administrator and all six parent accounts. No password or privileged key was persisted or printed.
