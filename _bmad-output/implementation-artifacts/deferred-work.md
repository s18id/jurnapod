# Deferred Work

This file tracks deferred findings from code reviews and other processes.

## Deferred from: code review of story-46.1 (2026-04-19)

- Payment terms default inheritance not implemented — deferred, pre-existing
- Duplicate key error handling uses MySQL-specific errno — deferred, pre-existing  
- Raw SQL used for count query — deferred, pre-existing

## Deferred from: code review of story-46.3 (2026-04-19)

- Missing audit logging for PO operations — deferred, pre-existing
- Redundant migration 0174 (converts ENUM to TINYINT) when 0172 already creates TINYINT — deferred, pre-existing

## Deferred from: code review of story-47.2 (2026-04-19)

- Make rounding tolerance configurable per company/report context (currently fixed at 0.0100) — deferred, pre-existing
- Evaluate CSV export scalability for very large datasets (streaming/background job path) — deferred, pre-existing
- Optimize large-data performance for UNION/count drilldown queries with index strategy and benchmarks — deferred, pre-existing
- Consider stricter malformed cursor validation for explicit client feedback — deferred, pre-existing

## Deferred from: code review of story-47.2 (2026-04-19 rerun)

- Detect/flag wrong-account posting errors beyond configured AP control account set — deferred, pre-existing
- Evaluate CSV export scalability for very large datasets (streaming/background job path) — deferred, pre-existing
- Keep malformed-cursor validation enhancement (explicit 400 for invalid cursor format) in follow-up backlog — deferred, pre-existing

## Deferred from: code review of story-52-5 (2026-04-29)

- Zero reversalBatchId returned for voided credit with no journal batch — RESOLVED in Story 52-5 follow-up (returns `reversal_batch_id=null` when VOID reversal journal is absent)
- No client_tx_id enforcement guard in AP routes — deferred, pre-existing convention-only constraint

## Deferred from: code review of story-52-5 (2026-04-29 — re-review)

- Credit void reversal_batch_id fallback to credit.journal_batch_id is misleading — RESOLVED in Story 52-5 follow-up
- Zero-line payment with idempotency_key passes silently with no lines — deferred, pre-existing input validation scope
- GRN warnings reset to empty array on idempotent replay — RESOLVED in Story 52-5 follow-up (stored warnings replayed deterministically)
- Residual concurrent replay test coverage gap for PO/GRN (PI/Credit now covered) — deferred, lower-priority coverage expansion

## Deferred from: code review of story-52-6 (2026-04-30)

- No table-sync integration tests for conflict/ERROR path — deferred, pre-existing infrastructure gap (no table-sync integration test harness exists)
