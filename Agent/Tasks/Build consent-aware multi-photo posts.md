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
# Build consent-aware multi-photo posts

## Goal
Let staff attach several optimized photos to one official preschool post without making child images public or bypassing recorded image consent.

## Acceptance criteria
- [x] Staff and administrators can select and preview up to 20 images in one official post.
- [x] Browser-side processing removes source metadata, constrains image dimensions, and uploads bounded JPEG files.
- [x] Staff explicitly identify every child visible anywhere in the selected images or confirm that no child is visible.
- [x] Publication is blocked unless every identified child has current `app_images` consent; multi-child posts also require `group_images` consent.
- [x] Images are stored in a private Supabase bucket and can only be read by users who can read the associated post.
- [x] Post creation and image metadata are atomic; failed publication removes uploaded draft files.
- [x] Authorized post deletion removes both database metadata and stored objects.
- [x] Feed cards render responsive multi-image galleries with useful image descriptions and no public URLs.
- [x] Repository verification, authorization checks, cleanup checks, and browser scenarios pass without page or console errors.

## Constraints
No facial recognition, biometric matching, automatic child identification, external AI, public bucket, or real child images in verification. Keep original files out of Storage by transcoding in the browser. Do not apply the production migration or deploy without explicit approval.

## Run log
- 2026-10-16: The existing post form has no media model or Storage bucket. The app already records separate `app_images`, `group_images`, and `social_media` consent, while prior research explicitly rejects facial identification and requires a structural publication gate.
- 2026-10-16: IMY treats child data as especially protected and requires a legal basis, clear purpose, appropriate safeguards, and support for deletion. Supabase recommends private buckets, RLS-protected object operations, signed or authenticated reads, and bucket-level MIME/size limits. Decision: private post media, explicit visible-child declaration, server-side consent enforcement, browser transcoding, and lifecycle cleanup.
- 2026-10-16: Added migration `005_post_images.sql`, private-object policies, server-side consent enforcement, atomic post metadata creation/deletion, upload rollback, browser JPEG transcoding, visible-child declarations, descriptive previews, and responsive feed galleries.
- 2026-10-16: Clean PGlite installation applied all seven schema steps. Authorization smoke proved two images/four child tags, denied a child without consent, returned two signed-read records to the guardian, and removed metadata on deletion. Mobile browser smoke proved two-file selection, JPEG bounds, descriptions, gallery rendering, authorized deletion, no horizontal overflow, and no console or page errors. `python3 scripts/verify.py` passed.
