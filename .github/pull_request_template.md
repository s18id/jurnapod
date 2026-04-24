# Pull Request — Jurnapod

## Description

<!-- Brief summary of changes and motivation -->

## Type

- [ ] Bug fix
- [ ] Feature
- [ ] Correctness hardening
- [ ] Test coverage
- [ ] Refactor
- [ ] Documentation
- [ ] Migration

## Checklist (MANDATORY — RFC keywords)

### Pre-Implementation Gates

- [ ] **GATE E49-A1:** Second-Pass Determinism Review requirements are met (see story spec)
- [ ] **GATE E49-A2:** Tiered audit table reviewed and signed off (Story 50.1 only)
- [ ] Sprint status updated for any epic whose artifacts were modified

### Correctness (P0/P1 — NO EXCEPTIONS)

- [ ] **MUST NOT** use `FLOAT` or `DOUBLE` for money fields
- [ ] **MUST NOT** use `Date.now()` or `Math.random()` in test suites (use `crypto.randomUUID()` or fixed timestamps)
- [ ] **MUST** use `DECIMAL(19,4)` or `BIGINT` (cents) for all money storage
- [ ] **MUST** enforce tenant scoping (`company_id`, `outlet_id`) on all queries
- [ ] **MUST** use `VOID`/`REFUND` for record corrections, not silent mutation
- [ ] **MUST** use `client_tx_id` for POS idempotency

### Determinism Scan (MANDATORY for test changes)

- [ ] **MUST** run `npm run test:single -- <file>` 3× consecutively with zero flakes
- [ ] **MUST** verify no `Date.now()`, `Math.random()`, or unguarded `new Date()` in test code
- [ ] **MUST** verify deterministic fixtures used (canonical patterns from `@jurnapod/db/test-fixtures`)
- [ ] **MUST** attach 3× consecutive green evidence to PR for any new test suite

### Fixture Ownership Policy (MANDATORY)

- [ ] **MUST** comply with `docs/policies/fixture-ownership-policy.md`
- [ ] **MUST NOT** add setup-time raw write SQL (`INSERT`/`UPDATE`/`DELETE`) in `apps/api/__test__/**`
- [ ] **NO EXCEPTION ALLOWED:** **MUST** use owner-package canonical fixture flow (no inline allowlists/tags)
- [ ] **MUST NOT** modify fixture policy/validator/CI gate unless explicitly requested by user or story owner

### ACL / Permissions (Epic 39+)

- [ ] **MUST** use resource-level permissions (`module.resource` format)
- [ ] **MUST** pass `resource` parameter to `requireAccess()`
- [ ] **MUST NOT** use legacy module-only permissions (e.g., `module: 'users'` without `resource`)

### Second-Pass Review Requirement

> **RFC Mandate (E49-A1):** Any PR touching time-dependent patterns, fixture compatibility, or posting flows MUST receive a second-pass review before merge. First-pass review alone is insufficient for deterministic hardening work.

- [ ] **Second-pass review requested:** Yes/No
- [ ] **Second-pass reviewer:** (name or agent)
- [ ] **Second-pass findings addressed:** Yes — no post-review fixes expected after second pass

### Package Build Order (when modifying `packages/`)

- [ ] `npm run build -w @jurnapod/<modified-package>` passes before building dependents
- [ ] `npm run typecheck -w @jurnapod/api` passes (if API is affected)

### Documentation

- [ ] Schema changes documented
- [ ] API contracts updated if breaking changes
- [ ] Dev Notes include files modified/created

### Sprint Status

- [ ] `npx tsx scripts/update-sprint-status.ts --epic N --story N-X --status done` run for completed stories
- [ ] `npx tsx scripts/validate-sprint-status.ts` exits 0 before close

---

## Story References

<!-- Link to epic/story artifacts -->
- Epic: 
- Stories: 

## Validation Commands

```bash
# Run deterministic scan
rg 'Date\.now\(\)|Math\.random\(\)' --type ts -l

# Build verification
npm run build -w @jurnapod/<package>
npm run typecheck -w @jurnapod/api

# 3× green gate
npm run test:single -- <file>  # run 3× manually or via CI
```
