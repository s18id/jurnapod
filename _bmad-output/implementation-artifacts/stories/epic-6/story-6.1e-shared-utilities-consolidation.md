# Story 6.1e: Shared Utilities and Final Consolidation

**Status:** backlog

## Story

As a **Jurnapod developer**,
I want **to extract shared utilities from sales.ts and complete the module consolidation**,
So that **the sales module is fully decomposed and sales.ts can be deleted**.

## Context

This is the final step of Story 6.1 (Consolidate Sales Module). After Stories 6.1a-6.1d extract individual domains, this story handles shared utilities and final cleanup.

**Scope:**
- Extract shared utility functions used by multiple sub-modules
- Consolidate error classes
- Update sales.ts to re-export from sub-modules (backward compatibility)
- Eventually delete sales.ts or keep as thin re-export layer

**Shared utilities to extract:**
- normalizeMoney, sumMoney
- withTransaction
- isMysqlError
- withTransaction wrappers
- Database error classes

## Acceptance Criteria

**AC1: Shared Utilities Extracted**
- All shared utilities moved to appropriate locations
- Sub-modules can import shared utilities without circular deps

**AC2: Error Classes Consolidated**
- All error classes in single location or properly distributed

**AC3: Backward Compatibility**
- `lib/sales.ts` re-exports from sub-modules
- All existing imports continue to work
- All tests pass

**AC4: Final Cleanup**
- Dead code removed from sales.ts
- Documentation updated
- Final test suite passes

## Tasks

- [ ] Identify all shared utilities in sales.ts
- [ ] Determine best location for each utility
- [ ] Extract to shared location or distribute to sub-modules
- [ ] Consolidate error classes
- [ ] Update lib/sales.ts to re-export from sub-modules
- [ ] Run full test suite
- [ ] Update documentation

## Estimated Effort

1 day

## Risk Level

High (final integration)

## Dependencies

Requires 6.1a, 6.1b, 6.1c, 6.1d all complete first
