# API Detachment PR Checklist

**Use this checklist for every migration/extraction PR in Epic 23.**

---

## Pre-Merge Verification

### 1. Import Boundary Verification
- [ ] No `packages/**` → `apps/**` imports exist in changed files
- [ ] No `modules-accounting` → `modules-sales` (or other forbidden cross-package) imports
- [ ] Lint rule `no-restricted-imports` passes with zero warnings on changed files
- [ ] Run: `npm run lint -ws --if-present`

### 2. Thin Adapter Rule
- [ ] API routes only compose/adapt (HTTP framing, Zod validation, auth, response mapping)
- [ ] No business logic duplication in `apps/api/src/lib/` for extracted domains
- [ ] Business logic resides in the target package (`packages/modules/*`)
- [ ] Route file contains only: import → validate → call package → map response

### 3. GL Correctness (if posting changed)
- [ ] Journal entries are balanced (debits = credits) for affected flows
- [ ] Posting idempotency preserved (same input = same journal entries, no duplicates)
- [ ] No financial behavior drift vs. pre-extraction baseline
- [ ] Run: `npm run test:unit:critical -w @jurnapod/api`

### 4. Sync Idempotency (if sync touched)
- [ ] `client_tx_id` handling is preserved and unchanged
- [ ] Sync push idempotency: duplicate `client_tx_id` does not create duplicate journal entries
- [ ] Sync pull cursor contract unchanged (`since_version` in request, `data_version` in response)
- [ ] `sync_versions` table used (no legacy `sync_data_versions` or `sync_tier_versions` dependencies)
- [ ] Run: `npm run test:unit:sync -w @jurnapod/api`

### 5. Tenant Isolation
- [ ] `company_id` scoping preserved in all queries
- [ ] `outlet_id` scoping preserved where applicable
- [ ] No hardcoded tenant IDs in extracted logic
- [ ] ACL/injection boundary properly separates auth from domain logic
- [ ] Run affected route tests: `npm run test:unit:single -w @jurnapod/api src/routes/<affected>/*.test.ts`

### 6. Contract Tests
- [ ] Existing API contracts still honored (status codes, response shapes, error envelopes unchanged)
- [ ] Zod schemas remain backward-compatible with existing callers
- [ ] No breaking changes to `packages/shared` contracts without migration plan
- [ ] Run: `npm run test:unit -w @jurnapod/api`

### 7. Lint & Type Checks
- [ ] `npm run lint -w @jurnapod/api` passes
- [ ] `npm run typecheck -w @jurnapod/api` passes
- [ ] `npm run build -w @jurnapod/api` passes
- [ ] New package typechecks: `npm run typecheck -w @jurnapod/<affected-package>`

### 8. Test Coverage
- [ ] Unit tests pass for extracted domain
- [ ] Integration tests pass for route + package interaction
- [ ] Critical path tests pass (auth, sync, posting) if affected
- [ ] No regressions in existing test suite

---

## Risk Checks (Complete if Applicable)

### Posting Risk
| Check | Status |
|-------|--------|
| Journal balancing verified | [ ] |
| Duplicate posting prevented | [ ] |
| COGS posting unchanged | [ ] |
| Depreciation posting unchanged | [ ] |
| Sales posting unchanged | [ ] |

### Sync Idempotency Risk
| Check | Status |
|-------|--------|
| `client_tx_id` uniqueness enforced | [ ] |
| Duplicate detection works | [ ] |
| Push idempotency tested | [ ] |
| Pull cursor contract preserved | [ ] |

### Tenant Scope Risk
| Check | Status |
|-------|--------|
| `company_id` filtering in all queries | [ ] |
| `outlet_id` filtering where applicable | [ ] |
| No tenant data leakage | [ ] |
| ACL boundary verified | [ ] |

---

## Completion

- [ ] All items above checked
- [ ] PR description references Epic 23 story ID
- [ ] Migration notes added if behavioral nuances preserved
- [ ] Breaking changes documented (if any)

---

**Template Version:** 1.0  
**Epic:** Epic 23 - API Detachment  
**Last Updated:** 2026-04-02
