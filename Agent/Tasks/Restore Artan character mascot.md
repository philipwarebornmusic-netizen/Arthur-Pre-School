---
type: agent-task
status: done
priority: 1
risk: low
created: 2026-10-16
started: 2026-10-16
completed: 2026-10-16
owner: OMP
---
# Restore Ärtan character mascot

## Goal
Replace the robot-style mascot with the supplied yellow Ärtan character and add a restrained pose animation.

## Acceptance criteria
- [x] Every existing mascot surface uses the supplied yellow Ärtan character instead of the robot SVG.
- [x] The character cycles through the supplied greeting, discovery, learning, together, and walking poses without moving surrounding layout.
- [x] Decorative mascot instances remain hidden from assistive technology and informative instances keep an accessible Ärtan label.
- [x] Reduced-motion users receive a static first pose.
- [x] Mobile and desktop browser scenarios have no horizontal overflow, page errors, or console errors.
- [x] Repository verification passes and the approved build is published and smoke-tested.

## Constraints
Use only the user-supplied artwork. Keep animation CSS-only, subtle, allocation-free at runtime, and free of external assets or dependencies. Preserve all existing assistant behavior.

## Run log
- 2026-10-16: Inspected the supplied five-pose reference, extracted character-only frames without the caption text, and confirmed all current mascot surfaces share `botMascot()` and `.bot-mascot`.
- 2026-10-16: Replaced the generated robot SVG with a transparent five-frame sprite derived from the supplied artwork. `botMascot()` keeps the existing informative/decorative accessibility contract; CSS changes poses without layout movement and pins the greeting pose under `prefers-reduced-motion`.
- 2026-10-16: Mobile browser checks confirmed the five stepped sprite positions at 0, 3, 5.4, 7.8, and 10.2 seconds while the mascot box remained 82 × 76.875 pixels. Informative and decorative accessibility attributes were preserved with no overflow, page errors, or console errors.
- 2026-10-16: Desktop reduced-motion emulation returned `animation-name: none` and the first sprite position with no overflow, page errors, or console errors. Authenticated parent rendering against hosted Supabase also passed.
