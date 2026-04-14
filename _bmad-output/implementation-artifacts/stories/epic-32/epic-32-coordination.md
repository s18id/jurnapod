# Epic 32 Story Coordination

## Stories Status

| Story | Status | Owner | Commit |
|-------|--------|-------|--------|
| 32.1 Fiscal Year Close | ✅ Done | bmad-agent-dev | f3990b8 |
| 32.2 Reconciliation Dashboard | ✅ Done | bmad-agent-dev | f3990b8 |
| 32.3 Trial Balance Validation | ✅ Done | bmad-agent-dev | 2b5891e |
| 32.4 Period Transition Audit | ✅ Done | bmad-agent-dev | 2b5891e |
| 32.5 Roll Forward Workspace | ✅ Done | bmad-agent-dev | 5f2b4b2 |

## Post-Story Fixes

After implementation, bmad-agent-review identified the following issues during code review:

| ID | Severity | File | Issue |
|----|----------|------|-------|
| P0-001 | P0 | `fiscal-year/service.ts` | `executeCloseWithLocking` returned `context.requestedAtEpochMs.toString()` as `closeRequestId` instead of caller-provided ID — broke idempotency contract |
| P1-001 | P1 | `fiscal-year/errors.ts` | 6 error classes missing machine-readable `code` properties |
| P1-002 | P1 | `fiscal-years.ts` (API adapter) | Lazy singleton could bind to stale `getDb()` context |
| P2-001 | P2 | `fiscal-year/service.ts` | Floating-point epsilon comparison for monetary values (`> 0.001`) |
| P2-002 | P2 | `fiscal-year/service.ts` | Sign convention assumptions in closing entries not explicitly documented |

All fixes committed in `8c2e1cc` and `dc05502`.

## Architecture Discovery

During Epic 32, an ADR-0014 boundary violation was caught:
- `fiscal-years.ts` (1317 lines) was placed in `apps/api/src/lib/` — pure domain logic that belonged in `modules-accounting`
- Discovered and resolved via bmad-agent-architect consultation
- Fiscal year domain extracted to `packages/modules/accounting/src/fiscal-year/`
- API layer converted to thin adapter consuming package service

See: `epic-32-service-migration.md` for full migration details.
