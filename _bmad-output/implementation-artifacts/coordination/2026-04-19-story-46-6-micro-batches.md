# Coordination: Story 46.6 AP Payments (Micro-Batches with Guardrails)

## Objective
Implement AP Payments with strict financial correctness and tenant safety using narrow, dependency-gated scopes.

## Locked Decisions
- PI fully paid behavior: keep PI `POSTED`, set `balance_amount = 0`.
- Status/state columns must use `TINYINT` (no `ENUM`).
- Company-scoped behavior for AP payments and allocations.

## Global Guardrails
- No scope bleed: each scope edits only its file budget.
- Library-first routes: no SQL in route files.
- Posting/void must be atomic (single transaction boundary).
- Negative ACL tests must use low-privilege role (e.g., CASHIER).
- No story/sprint-status doc edits during implementation scopes.

## Scope A — Schema / Contracts
Files allowed:
- `packages/db/migrations/*`
- `packages/db/src/kysely/schema.ts`
- `packages/shared/src/constants/purchasing.ts`
- `packages/shared/src/schemas/purchasing.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/constants/roles.defaults.json`

Checklist:
- [ ] Add `ap_payments` migration with `status TINYINT`
- [ ] Add `ap_payment_lines` migration
- [ ] Add ACL seed migration for `purchasing.payments`
- [ ] Add Kysely interfaces + DB mapping
- [ ] Add shared status constants (DRAFT=10, POSTED=20, VOID=90)
- [ ] Add shared Zod schemas (create/list/response/line)
- [ ] Add `purchasing.payments` to role defaults
- [ ] Build passes: `@jurnapod/db`, `@jurnapod/shared`

Gate to Scope B:
- ✅ Scope A checklist complete and both builds pass.

## Scope B — Domain Library
Files allowed:
- `apps/api/src/lib/purchasing/ap-payment.ts`

Checklist:
- [ ] Implement createDraft/list/get/post/void APIs
- [ ] Enforce tenant scope on all reads/writes
- [ ] Enforce overpayment checks at create and post
- [ ] Require/validate bank account tenant ownership
- [ ] Post creates balanced journal entries (D AP / C Bank)
- [ ] Post reduces PI balances; PI stays POSTED
- [ ] Void creates reversal batch and restores PI balances
- [ ] Build passes: `@jurnapod/api`

Gate to Scope C:
- ✅ Scope B checklist complete and API build passes.

## Scope C — Routes / Fixtures
Files allowed:
- `apps/api/src/routes/purchasing/ap-payments.ts`
- `apps/api/src/routes/purchasing/index.ts`
- `apps/api/src/lib/test-fixtures.ts`

Checklist:
- [ ] Add thin AP payment routes and mount `/payments`
- [ ] Route validation via Zod for body/params/query
- [ ] ACL enforced with `purchasing.payments`
- [ ] Add fixture ACL seed for `purchasing.payments`
- [ ] Build passes: `@jurnapod/api`

Gate to Scope D:
- ✅ Scope C checklist complete and API build passes.

## Scope D — Integration Tests
Files allowed:
- `apps/api/__test__/integration/purchasing/ap-payments.test.ts`
- Optional minimal fixture helper updates if needed

Checklist:
- [ ] 401 unauthenticated
- [ ] 403 insufficient permission (CASHIER)
- [ ] create draft payment
- [ ] list/get tenant scoped
- [ ] post success with journal
- [ ] partial payment reduces PI balance
- [ ] full payment sets PI balance to 0 (PI status remains POSTED)
- [ ] multiple PI lines one payment
- [ ] missing bank account -> 400
- [ ] overpayment rejected
- [ ] void restores PI balances
- [ ] second void rejected
- [ ] posting already posted rejected
- [ ] journal balanced assertion

Gate to Final Review:
- ✅ AP payment suite passes.

## Final Review (Single Pass)
Owner: `@bmad-review`

Checklist:
- [ ] Financial correctness and journal balancing
- [ ] Transaction boundaries and atomicity
- [ ] Tenant isolation and ACL correctness
- [ ] Overpayment/race protections
- [ ] Status/state TINYINT compliance
- [ ] Test reliability assessment
