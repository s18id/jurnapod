# Story 69-2: Purchasing Domain Screens — SPLIT CONTROL DOCUMENT

Status: **SPLIT — No direct implementation. Use split stories below.**

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 69 --story 69-2 --status done --title purchasing-domain-screens` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story (Original — Preserved for Reference)

As a **purchasing officer**,  
I want **backoffice screens for suppliers, purchase orders, goods receipts, AP invoices, payments, and credit notes**,  
So that **I can manage the full purchasing lifecycle with staged forms, audit trails, and financial-grade error prevention**.

## Context

This document is the **parent/split-control document** for the original Story 69-2. On 2026-05-19, the architect assessed the monolithic Story 69-2 as **NO-GO** because:

1. **Scope too broad:** Six interlinked purchasing subdomains in a single story (suppliers, POs, receipts, invoices, payments, credits) creates unreviewable PRs and unverifiable acceptance criteria.
2. **API assumptions incorrect:** The original story documented wrong endpoint paths (`/purchase-orders`, `/goods-receipts`), wrong status values (`SUBMITTED`), wrong status-change mechanism (`POST /:id/submit`), and wrong response envelope shapes (`{ data: [], pagination: {} }`).

**Correct API facts supplied by the architect on 2026-05-19:**
- Runtime base: `/api/purchasing`
- Suppliers: `GET/POST /suppliers`, `GET/PATCH/DELETE /suppliers/:id`; contacts under `/suppliers/:supplierId/contacts`
- Purchase orders: canonical `/orders`, not `/purchase-orders`; status change is `PATCH /orders/:id/status` with `{ status }`; statuses include `DRAFT`, `SENT`, `PARTIAL_RECEIVED`, `RECEIVED`, `CLOSED`, not `SUBMITTED`
- Receipts: canonical `/receipts`, not `/goods-receipts`; `GET/POST /receipts`, `GET /receipts/:id`
- Invoices: `/invoices`, `GET/POST`, `GET /:id`, `POST /:id/post`, `POST /:id/void`
- Payments: `/payments`, `GET/POST`, `GET /:id`, `POST /:id/post`, `POST /:id/void`
- Credits: `/credits`, `GET/POST`, `GET /:id`, `POST /:id/apply`, `POST /:id/void`
- List responses use `{ success: true, data: { suppliers/orders/receipts/... , total, limit, offset } }`, not `{ data: [], pagination: {} }`.

## Split Result

Story 69-2 has been split into the following implementation-ready stories. **Do not implement this parent document.** Pick up the split stories in dependency order.

| Split Key | Title | Scope | Dependencies | Status |
|-----------|-------|-------|--------------|--------|
| `69-2-e` | ReviewPanel Domain Interaction Hardening | Playwright/component tests for keyboard progression, invalid-field focus, modal focus behavior, hook DOM integration | Story 69-1 (done) | `done` |
| `69-2-a` | Supplier Management + Contacts | Supplier list, create/edit, contacts, permissions | 69-1 (done), **69-2-e** | `backlog` |
| `69-2-b` | Purchase Orders + Goods Receipts | PO list, create with lines, status changes, receipts from PO | 69-1 (done), 69-2-e, **69-2-a** | `backlog` |
| `69-2-c` | AP Invoices Post/Void + Audit Links | AP invoice list, create, post, void with reason, audit deep-links | 69-1 (done), 69-2-e, **69-2-b** | `backlog` |
| `69-2-d` | AP Payments + Supplier Credits | Payment list, create/allocate, post, void; credit create, apply, void | 69-1 (done), 69-2-e, **69-2-c** | `backlog` |

## Inherited P2 Follow-Up from Story 69-1

**ReviewPanel interactive component coverage (keyboard progression, invalid-field focus, modal focus behavior, hook DOM integration) MUST be completed before first domain ReviewPanel consumption.**

This follow-up is captured as Story **69-2-e** and is a **hard dependency** for all domain stories (69-2-a through 69-2-d) because each consumes ReviewPanel.

## Decision Gate for Split

| # | Decision | Rationale | Winston Sign-Off |
|---|----------|-----------|-----------------|
| 1 | Split monolithic 69-2 into 5 sequential slices (e + a → b → c → d) | Architect NO-GO: scope too broad, API assumptions wrong. Sequential split allows API contract verification per slice and prevents unreviewable PRs. | `2026-05-19 ✓` |
| 2 | 69-2-e (ReviewPanel hardening) is a prerequisite for 69-2-a | Story 69-1 P2 follow-up mandates interactive component coverage before first domain consumption. | `2026-05-19 ✓` |
| 3 | Each slice verifies its own API contracts before UI implementation | "Endpoint exists" ≠ "Endpoint is complete". Each split story has its own API Contract Verification section with corrected endpoint facts. | `2026-05-19 ✓` |

## Original Content Archive

The original acceptance criteria, tasks, files, and risk assessment from Story 69-2 are preserved in the split stories below. Refer to them for the authoritative, corrected versions:
- `story-69-2-e.md` — ReviewPanel Domain Interaction Hardening
- `story-69-2-a.md` — Supplier Management + Contacts
- `story-69-2-b.md` — Purchase Orders + Goods Receipts
- `story-69-2-c.md` — AP Invoices Post/Void + Audit Links
- `story-69-2-d.md` — AP Payments + Supplier Credits

## Notes

- **Story Done Authority (MANDATORY):** The implementing developer MUST NOT mark their own story done. Done requires reviewer GO and story owner explicit sign-off.
- **This parent document MUST NOT be marked done.** Individual split stories are tracked in `sprint-status.yaml`.
- **Definition of Done (MANDATORY per split story):** All acceptance criteria implemented with evidence, unit tests in `__test__/unit/`, integration tests in `__test__/integration/`, `npm run typecheck -w @jurnapod/backoffice` passes, `npm run build -w @jurnapod/backoffice` passes, code review completed with no blockers, AI review conducted (`bmad-review` agent), story completion report created with all AC evidence and second-pass reviewer sign-off.

_Last Updated: 2026-05-19 — Split by bmad-sm_
