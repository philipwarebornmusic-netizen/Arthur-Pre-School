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
# Publish terms and recurring child schedules

## Goal
Let administrators publish a term with weekday opening hours and closure dates, then let guardians review it and save each child’s recurring Monday–Friday schedule for that term.

## Acceptance criteria
- [x] Administrators can create a dated term for a school with weekday opening and closing times plus dated closures and reasons.
- [x] Draft terms remain hidden from guardians until an administrator explicitly publishes them.
- [x] Published terms cannot overlap for the same school and retain a stable schedule contract.
- [x] Guardians see published term dates, opening hours, closure dates, and reasons for each selected child’s school.
- [x] Guardians can save a complete recurring Monday–Friday plan per child and term, including non-attending days.
- [x] Attending times must be ordered and contained within the term’s published opening hours.
- [x] Administrators and relevant staff can read schedules; only a current guardian can change a child’s schedule.
- [x] Ärtan can deterministically parse supported Swedish term and weekly-schedule phrases into editable fields; nothing is saved before explicit review and submission.
- [x] Repository verification, authorization/parser boundary checks, and administrator/guardian browser scenarios pass without page or console errors.

## Constraints
One weekday opening interval per term; closures are full days. No automatic attendance creation, notifications, per-date exceptions, holiday inference, external AI, or silent save from parsed text. Published terms are immutable; corrections require a new term. Do not apply the production migration or deploy without explicit approval.

## Run log
- 2026-10-16: Municipal preschool guidance consistently separates published opening/closure information from the guardian’s recurring child schedule. Norrköping describes a recurring schedule that remains in effect until replaced; Stockholm publishes weekday hours and closure/planning days and asks guardians for a term schedule; Eslöv separates schedule, absence, and leave. Decision: immutable published term contracts, explicit full-day closures, five-row recurring schedules, and local parser-assisted form filling with review before save.
- 2026-10-16: Added migration `007_term_schedules.sql` with private term, closure, and five-day child schedule records plus security-definer create, publish, list, and save operations. Drafts remain admin/staff-only; published terms are immutable and may not overlap.
- 2026-10-16: PGlite authorization smoke kept a draft hidden from its guardian, exposed one published term and two closures, saved five weekday rows including a non-attending day, let assigned staff read them, and rejected overlap, published-term edits, out-of-hours times, and an unrelated child.
- 2026-10-16: Added local Swedish parsers for explicit term dates/hours/closures and recurring weekday phrases. Boundary smoke handled a cross-year January closure and rejected impossible dates and unclear schedules. Both parsers only fill editable forms.
- 2026-10-16: Mobile and desktop browser smoke rendered admin draft/publication controls and the guardian term overview, filled the supplied Swedish examples into reviewable fields, showed closure reasons and weekday rows, and had no horizontal overflow, page errors, or console errors. `python3 scripts/verify.py` passed.
