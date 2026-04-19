# Story 47.4: AP Exception Worklist

Status: backlog

## Story

As a **finance controller**,  
I want a consolidated worklist of all AP reconciliation exceptions,  
So that I can prioritize and resolve discrepancies efficiently.

---

## Context

Stories 47.1–47.3 produce various reconciliation variances and disputes. Story 47.4 aggregates these into a single exception worklist, providing a prioritized view of items needing attention: AP↔GL variances beyond threshold, supplier‑statement mismatches, disputed transactions, and overdue items.

**Dependencies:** Stories 47.1 (summary), 47.2 (drill‑down), and 47.3 (supplier statements) must be implemented, as the worklist pulls data from those sources.

---

## Acceptance Criteria

**AC1: Exception Sources**
**Given** reconciliation exceptions exist,
**When** the worklist is generated,
**Then** it includes items from:
- AP↔GL variance exceeding a configurable threshold (from Story 47.1)
- Supplier‑statement mismatches exceeding tolerance (from Story 47.3)
- Individual AP transactions flagged as “disputed” (from Story 47.3)
- Overdue AP items (invoices past due date beyond grace period)

**AC2: Prioritization Rules**
**Given** multiple exception items,
**When** the worklist is presented,
**Then** items are ordered by:
1. **Severity:** variance amount (largest first)
2. **Age:** oldest exception date first
3. **Type:** AP↔GL mismatch before supplier‑statement mismatch before disputed transaction before overdue

**AC3: Worklist Columns**
**Given** the worklist is displayed,
**When** the user views it,
**Then** each row shows:
- Exception ID
- Type (AP‑GL variance, statement mismatch, disputed, overdue)
- Supplier (if applicable)
- Amount (variance or overdue amount)
- Age (days since exception detected)
- Assigned to (user ID if assigned)
- Status (open, in‑progress, resolved)

**AC4: Assignment & Workflow**
**Given** an open exception,
**When** a user assigns it to themselves or another team member,
**Then** the exception record is updated with `assigned_to` and `assigned_at`,
**And** the status changes to “in‑progress”.

**AC5: Resolution Tracking**
**Given** an in‑progress exception,
**When** the user marks it as resolved,
**Then** they must provide a resolution note (text),
**And** the record is updated with `resolved_at`, `resolved_by`, and resolution note,
**And** the status changes to “resolved”.

**AC6: Filtering & Search**
**Given** a large worklist,
**When** the user applies filters,
**Then** they can filter by:
- Exception type
- Supplier
- Date range (exception date, due date)
- Assignment (unassigned, assigned to me, assigned to others)
- Status (open, in‑progress, resolved)

**AC7: API Endpoints**
**Given** a user with `accounting.journals` ANALYZE or `purchasing.suppliers` ANALYZE permission,
**When** they call:
- `GET /api/accounting/ap-exceptions/worklist` (paginated list with filters)
- `PUT /api/accounting/ap-exceptions/{id}/assign` (assign)
- `PUT /api/accounting/ap-exceptions/{id}/resolve` (resolve with note)
**Then** each endpoint returns the expected data.

**AC8: Exception Detection Trigger**
**Given** new reconciliation data arrives (daily cron or on‑demand),
**When** the exception detection runs,
**Then** it creates new exception records for any newly‑detected variances,
**And** updates existing exception records if variances are resolved (e.g., after a journal posting).

---

## Tasks / Subtasks

- [ ] Design `ap_exceptions` table (company_id, type TINYINT, source_id, source_type, variance_amount, detected_at, assigned_to, assigned_at, resolved_at, resolved_by, resolution_note, status TINYINT)
- [ ] Create migration for ap_exceptions table
- [ ] Implement exception detection service that queries reconciliation summaries and supplier statements
- [ ] Build worklist endpoint with filtering, sorting, pagination
- [ ] Implement assignment endpoint
- [ ] Implement resolution endpoint
- [ ] Write integration tests for exception detection and workflow
- [ ] Write integration tests for tenant isolation
- [ ] Update OpenAPI spec

---

### Review Findings

- [ ] *Review placeholder – findings will be populated during implementation review*

---

## Files to Create

| File | Description |
|------|-------------|
| `packages/db/migrations/0XXX_ap_exceptions.sql` | ap_exceptions table migration |
| `packages/shared/src/schemas/ap-exceptions.ts` | Zod schemas for exception types |
| `packages/modules/accounting/src/services/ap-exception-service.ts` | Exception detection and worklist logic |
| `apps/api/src/routes/accounting/ap-exceptions.ts` | Exception API routes |
| `apps/api/__test__/integration/accounting/ap-exceptions.test.ts` | Integration tests |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/kysely/schema.ts` | Modify | Add ApExceptions type |
| `packages/shared/src/index.ts` | Modify | Export AP exception schemas |
| `packages/shared/src/constants/modules.ts` | Modify | Add `accounting.ap_exceptions` permission entry |
| `packages/modules/accounting/src/services/ap-reconciliation-service.ts` | Modify | Call exception detection after reconciliation |
| `packages/modules/purchasing/src/services/supplier-statement-service.ts` | Modify | Call exception detection after statement reconciliation |

---

## Validation Evidence

```bash
# Get worklist (paginated, filtered)
curl "/api/accounting/ap-exceptions/worklist?type=ap_gl_variance&status=open&page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"

# Assign an exception to current user
curl -X PUT "/api/accounting/ap-exceptions/789/assign" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"assignee_id": "self"}'

# Resolve an exception
curl -X PUT "/api/accounting/ap-exceptions/789/resolve" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"resolution_note": "Posted missing journal entry for invoice INV-1001"}'
```

---

## Dev Notes

- `ap_exceptions.type` uses TINYINT with constants: 1=AP‑GL variance, 2=supplier‑statement mismatch, 3=disputed transaction, 4=overdue invoice.
- `ap_exceptions.status` uses TINYINT: 1=open, 2=in‑progress, 3=resolved.
- `source_id` and `source_type` link back to the originating record (e.g., `source_type='reconciliation_summary'`, `source_id=summary_id`).
- Exception detection can run as a scheduled job (e.g., daily at 2 AM) or be triggered manually via an admin endpoint.
- Overdue detection uses invoice due date + company‑configured grace period (default 0 days). Grace period may be stored in company settings.
- Assignment uses user IDs; the UI may show “Assign to me” which translates to the current user’s ID.
- Resolution notes are required for audit trail.

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow‑up
- [ ] No `as any` casts added without justification
- [ ] New status/type columns use `TINYINT` (per Epic 47 constraint)
- [ ] All new tables have proper indexes on `company_id`, `status`, `detected_at`
- [ ] Exception detection is idempotent (does not create duplicates for the same source)
- [ ] Worklist queries are optimized (pagination, covered indexes)
- [ ] Assignment and resolution enforce proper permissions (user can only assign/resolve their own company’s exceptions)