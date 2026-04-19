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
