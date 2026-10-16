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
# Build teacher check-in and check-out

## Goal
Give teachers and operational administrators a dedicated, at-a-glance daily roster for checking children in and out with one clear action.

## Acceptance criteria
- [x] Staff and administrators can open a dedicated Närvaro view directly from primary navigation.
- [x] The view shows live counts for checked in, expected or unregistered, checked out, and absent children.
- [x] Each child row exposes one context-appropriate primary action: check in, check out, or check in again.
- [x] Check-in and check-out record actual timestamps separately from the parent-provided daily plan.
- [x] Staff can still mark sick or leave without those secondary actions competing with the primary arrival/departure action.
- [x] Parent schedule updates do not create an actual staff check-in or overwrite actual timestamps.
- [x] Existing organization, department, and child authorization boundaries remain enforced.
- [x] Repository verification, transition checks, and staff/admin browser scenarios pass without page or console errors.

## Constraints
Keep the workflow roster-based, mobile-first, and usable in one tap per normal transition. Reuse the existing attendance record and RLS boundaries. Do not add kiosk identity, signatures, bulk actions, notifications, or external services. Do not apply the production migration or deploy without explicit approval.

## Run log
- 2026-10-16: The attached screen is the fixed `Lärare` account, but that account is provisioned as the sole organization administrator; the existing staff-only attendance view is therefore hidden from it.
- 2026-10-16: Lerum municipality describes a dedicated service that takes preschool staff directly to child check-in/out. Unikum distinguishes planned and actual attendance and gives staff/rektors a group overview. KidCheck uses a live roster with at-a-glance status and direct check-in/out actions. Decision: expose a dedicated roster to both staff and operational administrators, separate actual timestamps from parent plans, and make the normal next transition the single primary action.
- 2026-10-16: Added migration `004_teacher_attendance.sql`. Parent plans and staff transitions now use separate security-definer RPCs; guardians cannot write actual timestamps, and staff/administrators can only transition children within their existing child authorization scope.
- 2026-10-16: Mobile administrator smoke rendered six primary navigation destinations including Närvaro, four accurate live counts, and context actions for unchecked, checked-in, checked-out, and absent children. Check-in changed the next action to check-out; check-out changed it to check-in again. There was no horizontal overflow, page error, or console error.
