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
# Send one message to all guardians

## Goal
Let staff and administrators send one private message atomically to either one guardian or every current guardian linked to a child.

## Acceptance criteria
- [x] Staff and administrators can choose a child-specific “all guardians” recipient alongside existing individual recipients.
- [x] The server resolves the child’s complete current guardian set and creates every delivery in one transaction.
- [x] Every recipient is rechecked against existing organization and department messaging authorization.
- [x] A sender sees one sent card with all recipient names, not duplicate message cards.
- [x] Each receiving guardian sees only their own delivery and does not learn the identity of another guardian.
- [x] Existing direct parent–staff and opt-in parent–parent private messages continue to work.
- [x] Empty, unauthorized, unrelated-child, and overlong sends are rejected without partial delivery.
- [x] Repository verification, authorization checks, and sender/recipient browser scenarios pass without page or console errors.

## Constraints
Keep deliveries private and recipient-isolated. Do not create a shared conversation, reply-all audience, guardian directory, notification service, read receipt, or new parent-to-parent permission. Do not apply the production migration or deploy without explicit approval.

## Run log
- 2026-10-16: Existing messages are one sender/recipient row protected by participant-only RLS; staff-to-parent authorization already follows department assignments, while administrators may contact parents in their organization. Decision: preserve one isolated row per recipient, add a shared delivery-group identifier for sender-side grouping, and resolve the complete guardian set inside one security-definer transaction.
- 2026-10-16: Added migration `006_guardian_group_messages.sql`. The server resolves every current guardian for the selected child, creates recipient-isolated rows under one delivery group, and aborts the transaction if any recipient fails existing messaging authorization.
- 2026-10-16: PGlite authorization smoke delivered two rows in one group, preserved direct parent-to-staff messaging, exposed only each recipient’s own row/name, rejected guardian-initiated group sends, unrelated children, empty bodies, and 2,001-character bodies, and left no partial rows. Mobile and desktop browser smoke rendered the all-guardian option and one grouped sender card; the guardian view did not contain the other guardian’s name, overflow, page errors, or console errors.
