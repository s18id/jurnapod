# story-28.3: Payment posting hook (transaction-safe)

## Description

Define a `PaymentPostingHook` port/interface that `modules-sales` PaymentService can call from within its own DB transaction, enabling journal posting without breaking atomicity. Implement the API-side adapter using the existing `sales-posting.ts`.

## Context

**The problem:** The API `payment-service.ts` posts a journal entry **inside the same DB transaction** as:
- Payment record insert/update
- Invoice `paid_total` / `payment_status` update
- Any allocation record writes

If we naively extract (module writes payment → API posts journal in a separate call), a crash between those two steps leaves the database with a payment recorded but no journal entry — a critical accounting integrity violation.

**The solution:** Define `PaymentPostingHook` as an optional injected interface. The API adapter provides an implementation that calls `sales-posting.ts`. The module invokes the hook from within its transaction. If no hook is provided, posting is skipped (stateless/sync-disabled mode).

## Approach

1. Define `PaymentPostingHook` interface in `modules-sales/interfaces/`
2. Add `postingHook?: PaymentPostingHook` to `PaymentServiceDeps`
3. Call `postingHook?.postPaymentToJournal(...)` from within the payment transaction in `PaymentService`
4. Implement hook in API adapter (`apps/api/src/lib/modules-sales/`) using `sales-posting.ts`
5. Wire hook into the API composition function that creates the payment service

## PaymentPostingHook interface

```typescript
export interface PaymentPostingHook {
  /**
   * Post payment journal entry.
   * Called from within the payment's own DB transaction.
   * @param input - payment posting details
   * @param db - live transaction handle for linking journal to payment
   */
  postPaymentToJournal(input: PostPaymentInput, db: KyselyTransaction): Promise<JournalPostingResult>;
}
```

The hook receives the **live transaction handle** (`KyselyTransaction`), not a connection pool. This allows the journal batch insert to participate in the same DB transaction as the payment write.

## Acceptance Criteria

- [ ] `PaymentPostingHook` interface defined in `modules-sales/interfaces/`
- [ ] `PaymentServiceDeps` includes optional `postingHook?: PaymentPostingHook`
- [ ] `PaymentService.postPayment()` calls `postingHook?.postPaymentToJournal()` within its transaction
- [ ] API adapter implements `PaymentPostingHook` using `sales-posting.ts`
- [ ] API composition function wires `sales-posting.ts` as the hook implementation
- [ ] Journal posting and payment write are atomic (same DB transaction)
- [ ] If `postingHook` is undefined, `postPayment` completes without error (graceful degradation)
- [ ] `npm run typecheck -w @jurnapod/modules-sales`
- [ ] `npm run typecheck -w @jurnapod/api`

## Files to Modify

```
packages/modules/sales/src/interfaces/                    # add PaymentPostingHook
packages/modules/sales/src/interfaces/index.ts             # export PaymentPostingHook
packages/modules/sales/src/services/payment-service.ts     # inject + call hook
packages/modules/sales/src/types/payments.ts                # add PostPaymentInput + JournalPostingResult types
apps/api/src/lib/modules-sales/                            # implement PaymentPostingHook
apps/api/src/lib/sales-posting.ts                          # READ ONLY (reference for hook impl)
apps/api/src/lib/modules-sales/sales-db.ts                 # may need update for tx handle passthrough
```

## Dependency

- story-28.2 (need module payment service parity before adding hook)

## Implementation Notes

### KyselyTransaction type
The `db` parameter inside a Kysely transaction callback is typed as `KyselyTransaction` (a limited interface that only has `execute`, `insertInto`, `update`, `deleteFrom`, `selectFrom`, and `transaction`). Pass this type through the hook interface so the adapter can use it correctly.

### Graceful degradation
If `postingHook` is undefined, the `postPayment` should complete successfully without posting. This supports scenarios where the payment module is used without accounting (e.g., offline POS before sync). Do NOT throw if hook is missing.

### sales-posting.ts reference
Check what `postSalesPaymentToJournal` expects as input. You may need to wrap it or adapt the signature. The hook interface should be defined by the **consumer** (modules-sales), not the provider (sales-posting.ts).

## Validation Commands

```bash
npm run typecheck -w @jurnapod/modules-sales
npm run typecheck -w @jurnapod/api
npm run test -- --testPathPattern="payments" -w @jurnapod/api
```