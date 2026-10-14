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
# Build clickable basic Ärtan assistant

## Goal
Turn the existing static Ärtan mascot and reminder card into a useful, accessible assistant for authenticated parents, staff, and administrators without adding an external AI service or storing chat history.

## Acceptance criteria
- [x] A clearly labelled Ärtan control is available on every authenticated main view and opens and closes an accessible assistant panel.
- [x] Parents receive contextual quick actions and safe local answers about existing child plans, reminders, official posts, and available contacts.
- [x] Staff and administrators receive contextual quick actions that open existing official-post, private-message, people, school, and overview workflows.
- [x] A free-text question produces a bounded answer from already loaded application state, never guesses unavailable calendar or closure information, and is not persisted.
- [x] Assistant responses provide concrete next actions where the app supports them and clearly identify unavailable capabilities.
- [x] The assistant works at mobile and desktop sizes, supports keyboard focus and reduced motion, and introduces no horizontal overflow.
- [x] Repository verification and authenticated parent and staff browser scenarios pass without page or console errors.
- [x] The approved build is published to Netlify and the production assistant flow is smoke-tested.

## Constraints
No Supabase migration, production-record mutation, external model, model credential, dependency, or saved chat history. Reuse existing role permissions and data already loaded into the browser. Do not claim that local intent matching is generative AI.

## Run log
- 2026-10-14: Confirmed that the current mascot is static and that the existing “Ärtan-botten” only displays rule-based parent reminders with a single navigation action.
- 2026-10-14: Implemented a role- and view-aware assistant panel with contextual quick actions, bounded local question matching, source labels, and navigation into existing workflows. Questions and responses remain only in in-memory state and are cleared on close, navigation, or logout.
- 2026-10-14: Mobile parent smoke at 390 px proved the honest missing-calendar response, no horizontal overflow, no child-data requirement for general questions, and a temporary in-memory child plan answer with no backend writes.
- 2026-10-14: Desktop admin smoke proved official-post navigation, explicit warning that image-consent automation is not available, Escape focus return, and zero page or console errors. An in-memory staff-role scenario proved the staff attendance summary and staff-specific quick actions.
- 2026-10-14: Netlify published commit `8a8b42f`. Production parent smoke proved the clickable mobile panel, bounded missing-calendar answer, source label, no horizontal overflow, and zero page or console errors. Production administrator smoke proved navigation from Ärtan to the existing official-post form with zero page or console errors.
