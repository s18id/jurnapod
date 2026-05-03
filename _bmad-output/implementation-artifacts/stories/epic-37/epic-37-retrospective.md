# Epic 37 Retrospective

**Date:** 2026-04-09
**Epic:** 37 — Generic File Uploader
**Status:** ✅ Complete

---

## Story Summary

| Story | Title | Status |
|-------|-------|--------|
| 37.1 | Generic Uploader Core | done |
| 37.2 | Item Image Adapter | done |
| 37.3 | Refactor Item Images | done |
| 37.4 | Delete Image Storage | done |

---

## What Went Well

**Execution speed and completeness:** All 4 stories completed on 2026-04-09 (same day the epic started, per the charter: "Started: 2026-04-09, Completed: 2026-04-09"). No story carry-over.

**Strong test coverage:** Story 37.1 delivered 144 unit tests (all passing) covering types, file-storage, file-validator, sharp-processor, and the orchestrator. Story 37.2 added 10 adapter tests. Story 37.3 verification ran 171 total tests passing.

**Clean layered architecture delivered:** The epic built the intended architecture:
- `lib/uploader/types.ts` — typed interfaces
- `lib/uploader/file-storage.ts` — LocalStorageProvider + generateFileKey() (entityType-parametric)
- `lib/uploader/file-validator.ts` — pure validation
- `lib/uploader/sharp-processor.ts` — opt-in resize pipeline
- `lib/uploader/index.ts` — orchestrator
- `lib/uploader/adapters/item-image-adapter.ts` — first domain adapter

**Bug caught during implementation:** Story 37.1 dev notes record fixing `processImage()` not including the `original` buffer when a resize config was provided — fixed by always assigning `buffers["original"] = buffer` before processing sizes.

**Successful dead-code deletion:** Story 37.4 confirmed zero callers of `image-storage.ts` across the entire codebase (`apps/api/src/`, `packages/`, `apps/pos/src/`, `apps/backoffice/src/`) before deletion. All 171 tests still passed after removal.

**Size reduction achieved:** Story 37.3 reduced `item-images.ts` from 621 lines to ~200 lines, confirming AC8 (target was ~150 lines; came in at ~200 but all monolithic logic removed).

**Transactional safety in adapter:** Item-image adapter implements cleanup-on-failure: if DB insert fails after files are stored, `deleteFile()` removes all stored files before re-throwing.

---

## What Could Improve

**Retrospective not created at epic close:** The retrospective artifact was created retroactively (noted in `epic-37.retrospective.md`). Per the sprint-status.yaml append-only rule and retrospective policy, the retrospective should be populated immediately upon epic completion, not later. This is a process gap — no technical barrier.

**Minor deviation from line-count target:** AC8 in Story 37.3 specified a target of ~150 lines; the refactored file came in at ~200 lines. This is a minor miss but all monolithic logic (validation, Sharp processing, storage, generateFileKey, audit log insertion) was successfully removed. The ~50 line difference is likely due to retained pre-authorization logic (`verifyItemOwnership()`, `CrossTenantAccessError`) that was correctly kept.

**(TBD — no other evidence of process or quality issues in artifacts)**

---

## Action Items (Max 2)

1. **Create retrospective artifacts immediately at epic close, not retroactively**
   - **Owner:** Story implementer / Sprint Master
   - **Deadline:** Next epic close
   - **Success criterion:** Retro doc populated within the same session as epic completion

2. **TBD**

---

## Deferred Items

**Reuse generic uploader for future entity types (static pages, export files):** The epic charter explicitly notes "Future entities (static pages, export files) will reuse `uploadFile()` / `deleteFile()` by implementing their own thin adapter." This was deliberately out of scope for Epic 37 (which focused on the core infrastructure and item images as the first consumer). No work was done on this; no evidence of priority or timeline.

---

## Notes

- Epic 37 ran on 2026-04-09 and completed same-day. No sprint carry-over.
- The epic was purely a refactor/infrastructure epic — no business logic changes, no DB migrations, no route changes.
- S3 storage remains a TODO placeholder in `lib/uploader/file-storage.ts` (noted in Story 37.1 technical debt review). No action taken as S3 was explicitly out of scope.

---

*Retrospective complete. Epic 37 closed.*