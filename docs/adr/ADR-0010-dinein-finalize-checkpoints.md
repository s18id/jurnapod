# ADR-0010: Dine-in Finalize Checkpoints for Multi-Cashier Consistency

**Status:** Proposed  
**Date:** 2026-03-19  
**Context:** Epic 12 service session management and POS multi-cashier synchronization

---

## Context

The dine-in flow must support repeated order finalization events before final payment:

1. customer seated and initial order entered,
2. initial order finalized,
3. additional orders added,
4. additional orders finalized,
5. pending item cancellation/reduction with reason,
6. payment close.

We need fast cross-terminal visibility without sacrificing idempotency, tenant isolation, and auditability.

Two rejected extremes:

- close-only sync: too delayed for multi-cashier awareness,
- full real-time mirror: high dual-write complexity and drift risk.

## Decision

Adopt a **Finalize Checkpoints** model:

- `table_service_session_lines` remains canonical while session is active.
- `POST /api/dinein/sessions/:id/finalize-batch` creates checkpoint batches that sync finalized lines to `pos_order_snapshot_lines`.
- `POST /api/dinein/sessions/:id/close` performs final settlement and release, using persisted snapshot linkage from lock lifecycle.

This is a hybrid approach: sync at explicit checkpoints and close, not on every line mutation.

## Consequences

### Positive

- Multi-cashier visibility after every finalize action.
- Lower failure surface than real-time dual-write on every line update.
- Clear operational boundaries: working lines vs finalized checkpoint state.
- Strong auditability via append-only events and checkpoint records.

### Tradeoffs

- Requires batch metadata (`batch_no`) and checkpoint storage.
- Finalize path must be robust for duplicate item aggregation and idempotent retries.
- More lifecycle states to validate in tests.

## Invariants

- All mutations are tenant/outlet scoped.
- Idempotency key uniqueness is enforced by `(company_id, outlet_id, client_tx_id)`.
- Finalize and close are transaction-safe and append auditable events.
- Cancellation/reduction requires reason and is allowed only for not-yet-processed items.

## Implementation Notes

- Add `session_version` and `last_finalized_batch_no` to service sessions.
- Add `batch_no`, `line_state`, and adjustment linkage to session lines.
- Add `table_service_session_checkpoints` for checkpoint metadata.
- Ensure deterministic 2dp rounding when syncing from session line precision to snapshot line precision.

## Alternatives Considered

1. **Close-time only sync**: simplest, but fails required cross-cashier visibility between finalizations.
2. **Real-time mirror**: immediate visibility, but introduces fragile dual-write behavior and higher conflict risk.

---

This ADR is the canonical decision reference for Epic 12 checkpoint-based dine-in sync behavior.
