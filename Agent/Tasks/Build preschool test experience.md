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
# Build preschool test experience

## Goal
Create a safe test tenant and make the parent experience center the Ärtan reminder bot and simple child-information completion.

## Acceptance criteria
- [x] `PreSchool Test` has exactly one administrator: `larare@artanpreschool.test`.
- [x] Ludvig, Agnes, Johanna, Philip, Therese, and Andre have parent test accounts under `@artanpreschool.test` and can access test child data.
- [x] The mascot is visibly a bot and the login and parent surfaces explain its reminder value.
- [x] The bot derives useful reminders from missing daily-plan and child-information data without sending private data to an external AI service.
- [x] Parents can see completion progress and explicitly answer every consent with yes or no.
- [x] Administrator and parent scenarios are exercised in the browser, and repository verification passes.

## Constraints
Use fake test data only. Never commit credentials. Production provisioning requires a Supabase service-role key supplied through the local environment. No deployment, schema migration, external model, or production personal data is authorized.

## Run log
- 2026-10-14: Current app, RLS, onboarding, invitation, parent forms, historical pilot fixtures, and hosted Auth settings inspected.
- 2026-10-14: All seven requested `@artanpreschool.test` logins rejected the historical pilot password; hosted Auth requires email confirmation and no service-role credential is available locally.
- 2026-10-14: Added an idempotent service-role provisioner with a fixed fake organization, preschool, department, shared test child, one admin, six parent profiles, and post-write invariants. Plan mode passed locally.
- 2026-10-14: Initial live provisioning was blocked until the correct Wareborn Enterprises Supabase account and Arthur service-role credential were selected; no credential was committed or written to task notes.
- 2026-10-14: Browser smoke rendered the bot USP and parent reminders, scrolled from the bot to the next task, displayed the four-step child-information flow on desktop and mobile, persisted an explicit `Nej` consent through the request path, reached 4/4 completion, and rendered the PreSchool Test admin overview with no page or console errors.
- 2026-10-14: Provisioned the hosted tenant through the verified Arthur service-role credential. Post-write checks found exactly one administrator, six parent profiles, and six guardian links to the shared fake child.
- 2026-10-14: Password login succeeded for all seven requested accounts. Real browser sessions loaded the PreSchool Test administrator overview and Philip parent reminder experience without page or console errors.
