# Epic 64 — Batch 1 Coordination

## Objective
Execute independent Story Batch 1 in parallel with strict file ownership to avoid merge conflicts.

Stories in scope:
- 64.1 ap-multicurrency-correctness
- 64.2 cogs-projection-reconciliation
- 64.3 inventory-valuation-projection
- 64.8 cogs-posting-fixtures

## Global Rules
- Implementers MUST NOT update `sprint-status.yaml` directly in this batch.
- Implementers MUST keep changes scoped to assigned story files.
- Implementers MUST run focused tests for their changed story.
- Any new fixture for 64.8 MUST live in owner package `packages/modules/inventory`.

## File Ownership Matrix

| Story | Owner Agent | Exclusive Files |
|---|---|---|
| 64.1 | @bmad-dev (A) | `apps/api/__test__/integration/purchasing/ap-multicurrency-correctness.test.ts` |
| 64.2 | @bmad-dev (B) | `apps/api/__test__/integration/reporting/cogs-projection-reconciliation.test.ts` |
| 64.3 | @bmad-dev (C) | `apps/api/__test__/integration/reporting/inventory-valuation-projection-reconciliation.test.ts` |
| 64.8 | @bmad-dev (D) | `packages/modules/accounting/__test__/integration/posting/cogs-posting.test.ts`, optional `packages/modules/inventory/src/test-fixtures/item-price-fixtures.ts`, optional `packages/modules/inventory/src/index.ts` |

## Validation Expectations Per Story
- 64.1: target test + grep check for removed inline aggregation in file.
- 64.2: target test + grep check for removed inline aggregation in file.
- 64.3: target test + grep check for removed inline aggregation in file.
- 64.8: target test + fixture-flow lint + grep check for removed raw setup INSERTs.

## Integration Notes
- Consolidated review runs after all four story implementations land.
- Final gate story (64.9) is out of scope for this coordination file.
