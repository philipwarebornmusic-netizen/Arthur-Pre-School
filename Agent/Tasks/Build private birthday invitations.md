---
type: agent-task
status: done
priority: 1
risk: high
created: 2026-10-15
started: 2026-10-15
completed: 2026-10-16
owner: OMP
---
# Build private birthday invitations

## Goal
Let parents send structured birthday-party invitations to selected opted-in parents from the same department and manage private RSVP responses.

## Acceptance criteria
- [x] Birthday invitations are off by default and require a separate opt-in from both sender and recipient.
- [x] A parent can choose one of their own children, one or more eligible parents, event start and end, place, RSVP date, title, and message.
- [x] Recipient eligibility requires parent roles, the same organization, a shared department, and mutual birthday-invitation opt-in.
- [x] Invitations are created atomically and reject invalid dates, empty or excessive fields, duplicate recipients, ineligible recipients, and non-guardian hosts.
- [x] Each recipient sees only their own invitation and RSVP; the host sees all recipient statuses without exposing the guest list to other recipients.
- [x] A recipient can accept or decline once, and the host can cancel an active invitation.
- [x] Candidate lists expose parent display names only; no child directory, health, contact, consent, phone, or email data is exposed.
- [x] Repository verification, privacy-isolation checks, response transitions, and parent browser scenarios pass without page or console errors.

## Constraints
Use security-definer RPCs with row-level security and no direct client writes. No external notifications, public event listing, shared guest list, external AI, or production mutation without explicit approval. Test with fake data only and remove verification records after hosted checks.

## Run log
- 2026-10-15: Reviewed the existing mutually opted-in same-department community architecture and IMY guidance on privacy by default, data minimization, user control, risk analysis, and storage minimization.
- 2026-10-15: Product decisions: separate birthday-invitation opt-in, same-department eligibility, private guest list, and a structured invitation card with RSVP.
- 2026-10-15: Added migration `003_birthday_invitations.sql` with separate default-off profile consent, invitation and recipient records, atomic creation, strict date/content/eligibility validation, recipient-isolated listing, single-transition RSVP, host cancellation/deletion, RLS, revoked table access, and security-definer RPCs.
- 2026-10-15: Added the parent UI for structured multi-recipient invitation cards, private RSVP cards, host status summaries, account opt-in, cancellation/deletion, and Ärtan navigation. Candidate UI exposes display names only.
- 2026-10-15: Executed the migration in ephemeral PostgreSQL. The candidate list included only the two opted-in same-department parents; duplicate and other-department recipients were rejected; the host saw two private RSVP rows; each recipient saw only their own row; an unrelated parent saw zero rows; a second RSVP transition was rejected; cancellation and permanent cleanup removed the invitation and recipients.
- 2026-10-15: Local browser smoke rendered the structured host form and one grouped host card with two RSVP statuses, while the recipient card exposed no guest list or other recipient. The separate opt-in default hid creation without hiding an already received invitation, Ärtan explained the disabled setting, and the surface had no horizontal overflow, page errors, or console errors.
- 2026-10-16: Applied migration `003_birthday_invitations.sql` to the approved hosted Supabase project. A hosted fake-data check exposed only Agnes and Johanna to the opted-in same-department host; the host received two RSVP rows, each recipient received one, and an uninvolved parent received zero. Accept succeeded, a second response was rejected, cancellation/deletion succeeded, and all temporary children, invitations, and opt-ins were removed.
- 2026-10-16: Authenticated as a fixed parent account in the local browser against hosted Supabase. The default-off birthday card rendered under Gemenskap alongside private messages with no horizontal overflow, page errors, or console errors. `python3 scripts/verify.py` passed.
- 2026-10-16: Published commit `f518be3` through GitHub to Netlify. Production parent login loaded the hosted birthday RPCs and rendered the default-off card under Gemenskap with no horizontal overflow, page errors, or console errors.
