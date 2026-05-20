# Story 69-3: Accounting Domain Screens — SPLIT CONTROL DOCUMENT

Status: **SPLIT — No direct implementation. Parent is complete for split-control only. Use split stories below.**

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 69 --story 69-3 --status done --title accounting-domain-screens` (the canonical utility)
> - **REQUIRED**: Add split children with `--story 69-3-a` through `--story 69-3-f`, `--status backlog`, and exact dash-case titles
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire sprint status file — always use the canonical utility
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`

## Story (Original — Preserved for Reference)

As an **accountant or financial controller**,  
I want **backoffice screens for chart of accounts, journal entries, fiscal periods, and financial reports**,  
So that **I can manage the general ledger, post journal entries, control fiscal periods, and view reports with financial-grade accuracy**.

## Context

This document is the **parent/split-control document** for the original Story 69-3. On 2026-05-19, readiness coordination assessed the monolithic Story 69-3 as **NO-GO** for direct implementation.

The original monolith spanned accounts, journal create/post, journal void/reversal evidence, fiscal close, reports, CSV export, ACL handling, fixtures, and contract discovery. That scope is too broad for a single reviewable implementation unit under the active architecture-first freeze.

## Decision Gate for Split

| # | Decision | Rationale | Required Outcome | Winston Sign-Off |
|---|----------|-----------|------------------|-----------------|
| 1 | Monolithic Story 69-3 is **NO-GO** for direct implementation | Readiness reviews identified P1 API contract gaps, hard-gate TBDs, fixture/test policy gaps, PID/log validation gaps, ACL mismatch risk, and unreviewable scope | Parent becomes split-control only; implementation MUST occur only through child stories 69-3-a through 69-3-f | Winston NO-GO / split required — 2026-05-19 |
| 2 | 69-3-a MUST precede UI implementation stories | Accounting contracts, auth/error envelopes, fixture ownership, and validation commands MUST be verified before UI slices consume them | Child stories 69-3-b through 69-3-f remain backlog until 69-3-a readiness review passes | Winston GO for sequencing — 2026-05-19 |
| 3 | Every child story MUST include its own API contract verification | "Endpoint exists" is not sufficient for UI implementation | Each child MUST document verified shape, auth, errors, fixtures, and validation evidence before ready-for-dev | Winston GO for gate — 2026-05-19 |
| 4 | Backoffice freeze gate applies to every child story | `apps/backoffice` is frozen except explicit approval | No child story MAY start implementation without explicit backoffice unfreeze authorization recorded in that child | Winston GO for gate — 2026-05-19 |

## Split Result

Story 69-3 has been split into the following child stories. **Do not implement this parent document.** Pick up the split stories in dependency order after readiness review.

| Split Key | Title | Scope | Dependencies | Sprint Status |
|-----------|-------|-------|--------------|---------------|
| `69-3-a` | Accounting Contract + Fixture Readiness | Verify endpoint contracts, auth/error envelopes, ACL resources, fixture ownership, test policy, PID/log commands, and readiness gates | 69-1 done; Epic 65 done; Epic 66 done; Epic 32 done; backoffice unfreeze approval | `done` |
| `69-3-b` | Chart of Accounts Screens | Accounts tree/flat list, create/edit forms, account detail/history, permissions | 69-3-a; 69-1 ReviewPanel | `done` |
| `69-3-c` | Journal Entry Create/Post Flow | Journal list, balanced draft create/edit, real-time balance indicator, post ReviewPanel, posted read-only state | 69-3-a; 69-3-b where account selectors depend on accounts UX; 69-1 ReviewPanel | `backlog — NO-GO as written; see story-69-3-c.readiness-coordination.md` |
| `69-3-d` | Journal Void/Reversal Evidence Flow | Void reason, reversal cross-link, before/after evidence, conflict handling, immutable posted records | 69-3-a; 69-3-c; 69-1 ReviewPanel | `backlog — blocked by 69-3-c` |
| `69-3-e` | Fiscal Period Close UX | Fiscal period list, close workflow, elevated permission handling, reason/evidence, Epic 32 close semantics | 69-3-a; 69-3-c; 69-1 ReviewPanel; Epic 32 close backend | `backlog — blocked by unfreeze and contract verification` |
| `69-3-f` | Financial Reports + CSV Export | Trial balance, general ledger, AP aging, AR aging, filters, pagination, CSV export | 69-3-a; accounting report backend verified; `apiStreamingRequest()` available | `backlog — NO-GO as written; see story-69-3-f.readiness-coordination.md` |

## Original Content Archive

The original acceptance criteria, tasks, files, and risk assessment from Story 69-3 are preserved in the split stories below with implementation-ready scope and child-level gates:

- `story-69-3-a.md` — Accounting Contract + Fixture Readiness
- `story-69-3-b.md` — Chart of Accounts Screens
- `story-69-3-c.md` — Journal Entry Create/Post Flow
- `story-69-3-d.md` — Journal Void/Reversal Evidence Flow
- `story-69-3-e.md` — Fiscal Period Close UX
- `story-69-3-f.md` — Financial Reports + CSV Export

## Parent Completion Criteria

- [x] Parent converted to split-control only.
- [x] Monolith decision gate records **NO-GO**.
- [x] Child story files created for 69-3-a through 69-3-f.
- [x] Sprint status update MUST mark `69-3-accounting-domain-screens` as `done` for split-control only.
- [x] Sprint status update MUST add child backlog entries.
- [x] Sprint status validation MUST run after canonical updates.

## Notes

- **Story Done Authority (MANDATORY):** The implementing developer MUST NOT mark any child story done. Done requires reviewer GO and story owner explicit sign-off.
- **This parent document has no implementation tasks.** It is complete only as a split-control artifact.
- **Definition of Done (MANDATORY per child story):** All acceptance criteria implemented with evidence, unit tests in `__test__/unit/`, integration tests in `__test__/integration/`, PID/log validation evidence captured, `npm run typecheck -w @jurnapod/backoffice` passes, `npm run build -w @jurnapod/backoffice` passes, code review completed with no blockers, AI review conducted (`bmad-review` agent), story completion report created with all AC evidence and second-pass reviewer sign-off.
- **Backoffice Freeze:** Every child story MUST record explicit unfreeze authorization before implementation.

_Last Updated: 2026-05-19 — Split by bmad-sm_
