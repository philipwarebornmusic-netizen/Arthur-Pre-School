---
type: agent-task
status: done
priority: 1
risk: medium
created: 2026-10-14
started: 2026-10-14
completed: 2026-10-14
owner: OMP
---
# Help parents change pickup plans

## Goal
Let parents use Ärtan to find and update today's drop-off time, pickup time, and pickup person, including grandparents and other approved contacts.

## Acceptance criteria
- [x] Ärtan offers a clearly labelled pickup/drop-off quick action on every parent main view.
- [x] Parent questions about changing times or a grandparent collecting the child produce a bounded answer based on today's saved plan.
- [x] Ärtan links directly to the existing daily-plan form without writing attendance data by itself.
- [x] The daily-plan form keeps free-text pickup names and suggests child contacts marked as allowed to collect.
- [x] Existing parent attendance permissions and persistence remain unchanged.
- [x] Repository verification and a parent browser scenario pass without page or console errors.

## Constraints
No schema, authorization, row-level security, external AI, or production-record change. Ärtan may guide and navigate, but the parent must review and submit the existing daily-plan form.

## Run log
- 2026-10-14: Confirmed that parents can already save today's status, drop-off time, pickup time, and free-text pickup person through `parent-attendance`; Ärtan only exposed a generic plan summary and navigation path.
- 2026-10-14: Added a dedicated pickup/drop-off intent and quick action on every parent view, current-plan guidance, direct navigation to the existing daily-plan form, and allowed-contact suggestions for the pickup-person field. The existing attendance write path and permissions are unchanged.
- 2026-10-14: `python3 scripts/verify.py` passed with 6 HTML assets, 15 CSS assets, 2 Python scripts, and 6 valid agent tasks.
- 2026-10-14: Local parent browser smoke used an in-memory child plan with no backend writes. Ärtan summarized 08:00 drop-off, 15:30 pickup, the current pickup person, and the allowed “Mormor Eva” contact; both the quick action and “Mormor ska hämta” free-text question opened the prefilled daily-plan form. The quick action was present on all four parent views, the disallowed contact was not suggested, and there were zero page or console errors.
