# Story 54.3: AP State Machine Integrity

> **HARD GATE (E54-A2):** Implementation of this story MUST NOT begin until the E54-A2 second-pass review checklist is included below.

**Status:** backlog

---

## Story Context

**Epic:** Epic 54 — AP Lifecycle Correctness
**Owner:** @bmad-dev
**Type:** Correctness risk resolution
**Module:** `modules-purchasing`
**Sprint:** 54

---

## Problem Statement

The AP lifecycle (PO → GRN → Invoice → Payment) has implicit state transitions. Invalid transitions (e.g., VOIDED → POSTED) or bypass paths (posting invoice without GRN when three-way matching is enabled) can corrupt workflow integrity. This story documents and enforces the state machine.

---

## E54-A2: Second-Pass Determinism Review (MANDATORY)

**When required:** Invalid state transitions can create unpostable or unvoidable records. Second-pass review is **MANDATORY**.

**Second-pass checklist:**
- [ ] All valid state transitions documented
- [ ] Invalid transitions are rejected with clear errors
- [ ] GRN-to-Invoice linkage enforced
- [ ] Payment-to-Invoice linkage enforced
- [ ] No bypass path exists to post without GRN (if matching enabled)
- [ ] No `Date.now()` or `Math.random()` introduced during fix
- [ ] 3× consecutive green evidence
- [ ] No post-review fixes expected after second-pass sign-off

---

## Acceptance Criteria

**AC1:** All valid state transitions documented
- **Given** the AP document types (PO, GRN, Invoice, Payment)
- **When** the state machine is documented
- **Then** valid transitions are:
  - PO: DRAFT → CONFIRMED → RECEIVED
  - Invoice: DRAFT → POSTED → VOIDED
  - Payment: DRAFT → POSTED → VOIDED

**AC2:** Invalid transitions are rejected
- **Given** an invoice in VOIDED status
- **When** a post request is sent
- **Then** the request returns 400 with error "Cannot post a voided invoice"

**AC3:** GRN-to-Invoice linkage enforced
- **Given** a GRN line for PO line #1 with quantity 10
- **When** an invoice line references GRN line #1 with quantity 15
- **Then** the request is rejected with 400 (quantity exceeds GRN)

**AC4:** Payment-to-Invoice linkage enforced
- **Given** a payment allocation referencing invoice ID 999 (non-existent)
- **When** the payment is posted
- **Then** the request returns 404 with error "Invoice not found"

**AC5:** No bypass path to post without GRN (when matching enabled)
- **Given** three-way matching is enabled for the company
- **When** an invoice line is posted without a GRN reference
- **Then** the request returns 400 with error "GRN reference required"

**AC6:** Integration tests written and 3× consecutive green

**AC7:** Code review GO required

---

## Test Coverage Criteria

- [ ] Happy paths:
  - [ ] Valid PO transition: DRAFT → CONFIRMED → RECEIVED
  - [ ] Valid Invoice transition: DRAFT → POSTED → VOIDED
  - [ ] Valid Payment transition: DRAFT → POSTED
- [ ] Error paths:
  - [ ] 400: VOIDED → POSTED
  - [ ] 400: DRAFT → VOIDED (without posting)
  - [ ] 400: Invoice line quantity exceeds GRN
  - [ ] 404: Payment allocation to non-existent invoice
  - [ ] 400: Missing GRN reference when matching enabled

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/purchasing/ap-state-machine.test.ts` | Create | State machine integrity tests |

## Estimated Effort

2 days

## Risk Level

Medium (P1 — invalid transitions create workflow chaos)

## Dev Notes

- Three-way matching setting: check `company_settings` or `purchasing_settings`
- State transitions: may require adding explicit guards to service methods
- GRN linkage: verify `grn_lines` table has `received_qty` for comparison

## Dependencies

- Stories 54.1 and 54.2 (invoice + payment correctness)

## Validation Evidence

```bash
npm run test:single -w @jurnapod/api -- "__test__/integration/purchasing/ap-state-machine.test.ts"
```
