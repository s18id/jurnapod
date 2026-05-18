# Story 68-4: Audit Timeline View + Dedicated `platform.audit` ACL Resource

Status: backlog

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 68 --story 68-4 --title audit-timeline --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **company admin or compliance officer**,  
I want **an entity-scoped audit timeline that shows who changed what and when, with before/after diffs**,  
So that **I can trace changes, investigate discrepancies, and satisfy audit requirements**.

## Context

This story has **two mandatory workstreams**:

1. **ACL pre-work (E66-A1 resolution):** Introduce the dedicated `platform.audit` ACL resource. This is **not optional** — User Decision D68-2 explicitly rejects the `platform.settings.READ` workaround. The audit timeline MUST ship with correct ACL semantics.

2. **Audit timeline UI:** Build a reusable `AuditTimeline` component that can be embedded in any entity detail page. It displays a vertical timeline of audit entries for a specific entity, with actor info, action badges, timestamps, and before/after diffs.

**Epic 66 carry-forward:** E66-A1 (`platform.audit` ACL resource) and E66-A2 (OpenAPI query parameter alignment for audit filters) were deferred from Epic 67 because they were out of scope for catalog operations. They **MUST be resolved in this story**.

**Dependencies:** Story 68-0 (contract verified), Epic 66-5 (audit log explorer patterns), Epic 65 (typed API client)

**Risk:** Medium — ACL migration is schema and permission work; timeline UI is component composition.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** Timeline renders entries; UPDATE shows diff; filter by action; deep-link works
- [ ] **Error paths identified:** No audit entries; permission denied; API failure; invalid date range filter
- [ ] **Edge cases identified:** Very long timeline (>100 entries); entity with no changes; concurrent edits
- [ ] **Test fixture needs identified:** Audit log entries with known before/after state; mock entity objects
- [ ] **Integration test scope defined:** Unit tests for timeline component; integration tests for ACL enforcement
- [ ] **Negative auth test role selected:** `CASHIER` for audit timeline (must lack `platform.audit.READ`)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Timeline renders audit entries | Happy | Unit |
| UPDATE entry shows before/after diff | Happy | Unit |
| Filter by action type | Happy | Unit |
| Filter by date range | Happy | Unit |
| Deep-link to audit explorer | Happy | Unit |
| Empty timeline shows empty state | Edge | Unit |
| Permission denied (403) | Error | Integration |
| `platform.audit` resource exists in DB | Happy | Integration |
| Canonical roles have correct audit permissions | Happy | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

### Pre-Implementation Checklist

- [ ] Producer error classes: `AuditLogNotFoundError`, `PermissionDeniedError`
- [ ] Consumer catch paths: Timeline shows error state; empty state for no entries
- [ ] Fallback handling: Generic "Unable to load audit history"
- [ ] Error response mapping: 403 → permission denied; 404 → entity not found; 500 → server error

### Verified Error Paths

| Producer Error | Consumer Handling | Fallback |
|----------------|-------------------|----------|
| No audit entries | Show empty state with "No changes recorded" | — |
| Permission denied | Show "Access denied" message | — |
| Entity not found | Show "Entity not found" | Navigate back |

---

## Acceptance Criteria

### AC1: `platform.audit` ACL resource introduction
**Given** the canonical ACL system  
**When** the ACL pre-work is complete  
**Then** `audit` is added to the `platform` module resource list  
**And** `module_roles` rows exist for `platform.audit` with these canonical permissions:
- `SUPER_ADMIN`: CRUDAM (63)
- `OWNER`: CRUDAM (63)
- `COMPANY_ADMIN`: CRUDA (31)
- `ADMIN`: READ (1) — view audit timeline
- `ACCOUNTANT`: READ (1) — view audit timeline
- `CASHIER`: 0 — no audit access

**And** the resource is documented in AGENTS.md canonical ACL matrix  
**And** E66-A1 is marked **closed** in `action-items.md`

### AC2: API route ACL migration
**Given** API routes that serve audit data  
**When** the ACL pre-work is complete  
**Then** all audit-related routes enforce `requireAccess({ module: 'platform', resource: 'audit', permission: 'READ' })`  
**And** no audit route uses `platform.settings.READ` as a workaround  
**And** integration tests verify permission enforcement

### AC3: Audit timeline rendering
**Given** an entity with audit entries  
**When** the AuditTimeline component renders  
**Then** entries are displayed in reverse chronological order (newest first)  
**And** each entry shows:
- Actor name and avatar (if available)
- Action type badge: `CREATE`, `UPDATE`, `DELETE`, `VOID`, `REFUND`
- Timestamp in locale-aware format (epoch ms internally, formatted at display boundary)
- Entity type and ID

### AC4: Before/after diff
**Given** an `UPDATE` audit entry  
**When** the entry is expanded  
**Then** a diff view shows the changed fields  
**And** each changed field displays: old value, new value, change indicator (+/-)
**And** the diff is formatted for the field type (text, number, date, JSON)

### AC5: Filter
**Given** the audit timeline  
**When** filters are applied  
**Then** only matching entries are shown  
**And** supported filters are:
- Action type: `CREATE`, `UPDATE`, `DELETE`, `VOID`, `REFUND`
- Date range: from/to (half-open interval: `>= start AND < nextDay`)
- Actor: user who made the change

### AC6: Empty state
**Given** no audit entries exist for the entity  
**When** the timeline renders  
**Then** an empty state is displayed: "No changes recorded for this entity"

### AC7: Deep-linking
**Given** the audit timeline is filtered for a specific entity  
**When** the URL is shared  
**Then** the URL format is `/audit?objectType={type}&objectId={id}`  
**And** navigating to the URL restores the same filter and entity scope

### AC8: Reusable component
**Given** the `AuditTimeline` component  
**When** embedded in any entity detail page  
**Then** it accepts props: `objectType`, `objectId`, `companyId`  
**And** it fetches audit entries scoped to that entity  
**And** it renders without modification to the host page

### AC9: Integration with notification system
**Given** a notification references an audit entry (Story 68-3)  
**When** the notification is clicked  
**Then** the app navigates to the audit timeline filtered by `objectType` and `objectId`

### AC10: Permission gating
**Given** a user with `requireAccess({ module: 'platform', resource: 'audit', permission: 'READ' })` returning true  
**Then** the audit timeline is accessible  

**Given** a user without `platform.audit.READ`  
**Then** the timeline shows "Access denied"

---

## Technical Notes

### Files to Create
- `apps/backoffice/src/components/audit-timeline.tsx` — Reusable timeline component
- `apps/backoffice/src/components/audit-diff.tsx` — Before/after diff view
- `apps/backoffice/src/features/audit/audit-explorer.tsx` — Standalone audit explorer page
- `apps/backoffice/src/hooks/use-audit-log.ts` — TanStack Query hook for audit entries
- `apps/backoffice/__test__/unit/components/audit-timeline.test.tsx` — Timeline rendering tests
- `apps/backoffice/__test__/unit/components/audit-diff.test.tsx` — Diff formatting tests
- `apps/api/__test__/integration/audit/audit-acl-permissions.test.ts` — ACL enforcement tests

### Files to Modify
- `apps/api/src/routes/audit.ts` — Update `requireAccess` calls to use `platform.audit`
- `apps/backoffice/src/app/routes.ts` — Add `/audit` route
- `AGENTS.md` — Update canonical ACL matrix to include `platform.audit`
- `action-items.md` — Mark E66-A1 as closed

### Database Changes (ACL Pre-Work)
```sql
-- Add platform.audit permissions for canonical roles
-- This MUST be a migration if not already seeded
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT 
  NULL, -- global roles
  r.id,
  'platform',
  'audit',
  CASE r.code
    WHEN 'SUPER_ADMIN' THEN 63
    WHEN 'OWNER' THEN 63
    WHEN 'COMPANY_ADMIN' THEN 31
    WHEN 'ADMIN' THEN 1
    WHEN 'ACCOUNTANT' THEN 1
    WHEN 'CASHIER' THEN 0
  END
FROM roles r
WHERE r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT', 'CASHIER');
```

**Note:** If canonical roles are already seeded, verify whether `platform.audit` rows exist. If they do not, the migration MUST add them. If they exist with `NULL` resource, update them to `audit`.

### Audit Entry Shape
```typescript
interface AuditEntry {
  id: number;
  objectType: string;
  objectId: number;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VOID' | 'REFUND';
  actorId: number;
  actorName: string;
  timestamp: number; // epoch ms
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  changes?: string[]; // changed field names
}
```

### Diff Rendering
```typescript
interface DiffField {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

// Format based on type
const formatDiff = (field: DiffField): string => {
  if (typeof field.oldValue === 'number') {
    return `${field.oldValue} → ${field.newValue}`;
  }
  if (typeof field.oldValue === 'boolean') {
    return `${field.oldValue ? 'Yes' : 'No'} → ${field.newValue ? 'Yes' : 'No'}`;
  }
  return `${String(field.oldValue)} → ${String(field.newValue)}`;
};
```

---

## Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| R68-4-001 | P1 | `platform.audit` migration conflicts with existing `NULL` resource rows | Inspect existing `module_roles` rows before migration; use idempotent `INSERT ... ON DUPLICATE KEY UPDATE` |
| R68-4-002 | P1 | Audit API does not provide `beforeState`/`afterState` | Use `changes` array only; document limitation |
| R68-4-003 | P2 | Large audit history (>1000 entries) for high-activity entities | Server-side pagination; default page size 25 |
| R68-4-004 | P2 | Diff rendering for complex nested objects | Limit diff to top-level fields; provide "View full JSON" expander |
| R68-4-005 | P2 | Date range filter uses wrong interval semantics | Enforce half-open interval: `col >= startUTC AND col < nextDayUTC` |

---

## Story Points
**8 points** (medium-high — ACL migration + timeline component + diff rendering)

---

## Tasks / Subtasks

### Phase 1: ACL pre-work (E66-A1 resolution)
1. **Verify existing `module_roles` state** — Check if `platform.audit` rows exist
2. **Create migration** — Add `platform.audit` permissions for canonical roles (idempotent)
3. **Update API routes** — Change `platform.settings` to `platform.audit` in audit route handlers
4. **Update AGENTS.md** — Add `audit` to platform resources in ACL matrix
5. **Add integration tests** — Verify `platform.audit` permission enforcement
6. **Update action-items.md** — Mark E66-A1 as closed

### Phase 2: Timeline component
7. **Create `AuditTimeline` component** — Vertical timeline with entries
8. **Create `AuditDiff` component** — Before/after diff view
9. **Implement filtering** — Action type, date range, actor
10. **Implement empty state** — "No changes recorded"

### Phase 3: Explorer page
11. **Create audit explorer page** — Standalone `/audit` route
12. **Implement deep-linking** — URL params for `objectType` and `objectId`
13. **Wire into entity detail pages** — Add "Audit Trail" tab/button

### Phase 4: Integration
14. **Integrate with notifications** — Story 68-3 deep-links to audit explorer
15. **Permission gating** — Hide audit tab if user lacks `platform.audit.READ`

### Phase 5: Testing
16. **Unit tests for timeline** — Rendering, filtering, empty state
17. **Unit tests for diff** — Formatting, type handling
18. **Integration tests for ACL** — Permission denied/granted scenarios

---

## Definition of Done

- [ ] All acceptance criteria implemented with evidence
- [ ] `platform.audit` ACL resource exists in database for all canonical roles
- [ ] API audit routes use `platform.audit` (not `platform.settings`)
- [ ] Unit tests for AuditTimeline and AuditDiff pass
- [ ] Integration tests for ACL enforcement pass
- [ ] E66-A1 marked closed in `action-items.md`
- [ ] AGENTS.md updated with `platform.audit` in ACL matrix
- [ ] `npm run typecheck -w @jurnapod/backoffice` passes
- [ ] `npm run build -w @jurnapod/backoffice` passes
- [ ] Code review completed with no blockers
- [ ] Story completion report created (`story-68-4.completion.md`) with reviewer GO and owner sign-off

---

## Dependencies

- **Story 68-0** — Backend contract verified
- **Epic 66-5** — Audit log explorer patterns
- **Epic 65** — Typed API client, shell, router
- **E66-A1** — MUST be resolved within this story (not deferred)

## Validation Evidence

```bash
# Pre-flight
npm run lint -w @jurnapod/backoffice
npm run typecheck -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice

# Backoffice unit tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/components/audit-timeline.test.tsx
npm run test:single -w @jurnapod/backoffice -- __test__/unit/components/audit-diff.test.tsx

# API integration tests (ACL enforcement)
npm run test:single -w @jurnapod/api -- __test__/integration/audit/audit-acl-permissions.test.ts

# Sprint status
npx tsx scripts/validate-sprint-status.ts --epic 68
```

---

_Last Updated: 2026-05-18 (prepared by bmad-sm)
