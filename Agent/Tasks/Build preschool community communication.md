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
# Build preschool community communication

## Goal
Give each department an official school feed with comments, private parent–staff messaging, and privacy-controlled parent communication and playdate requests.

## Acceptance criteria
- [x] Staff and administrators can publish official department or child posts; authorized parents can comment.
- [x] Parents and relevant staff can exchange private messages that no other profile can read.
- [x] Parent-to-parent discovery and messaging require opt-in from both parents and a shared department.
- [x] Playdate requests require a separate opt-in from both parents, support accept/decline, and require a shared department.
- [x] Parent directory results never expose child, health, contact, consent, phone, or email data.
- [x] Browser scenarios prove comment visibility, private-message isolation, opt-in behavior, and playdate transitions.
- [x] Repository verification passes and the hosted application is smoke-tested without page or console errors.

## Constraints
Privacy settings default off. Use fake test data only. Remove verification posts, comments, messages, requests, and temporary children after the smoke test. Never commit credentials or privileged keys.

## Run log
- 2026-10-14: Confirmed that the current application supports staff-authored department or child posts and parent reading, but has no comments, replies, private conversations, parent directory, or active playdate model.
- 2026-10-14: Applied migration `002_community_communication.sql` to the verified Arthur Supabase project.
- 2026-10-14: Browser scenarios proved that a parent peer is hidden until both parents opt in, then becomes available for private messages and playdate requests only within the shared department.
- 2026-10-14: An administrator published an official department post and sent a private parent message. An authorized parent commented; the other opted-in parent saw the comment, saw only their own conversation, replied privately, and accepted the playdate request.
- 2026-10-14: An uninvolved parent with no child saw no posts, comments, peer parents, private messages, or playdate requests, while retaining access to the organization administrator.
- 2026-10-14: Removed every temporary post, comment, private message, playdate request, and child record, reset both privacy preferences to off, and confirmed the test tenant returned to zero records in those flows.
- 2026-10-14: Netlify published commit `426c9f8`. The production administrator rendered the clean school community surface with all six test parents available for staff contact and no page or console errors.
