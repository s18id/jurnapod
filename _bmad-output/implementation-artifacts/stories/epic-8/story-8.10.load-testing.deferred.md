# Story 8.10: Load Testing Framework - DEFERRED

**Status:** deferred to Epic 9  
**Original Status:** backlog  
**Deferral Date:** 2026-03-28  
**Estimated Effort:** 2 days

## Why Deferred

1. Epic 8 core features (8.1-8.9) are complete and production-ready
2. All P0 issues resolved and verified (11/11)
3. Load testing is important but not a release blocker
4. Team velocity better spent on Epic 9 (Redis Session Migration)

## Epic 8 Story Count Note

Epic 8 had 9 stories in scope (10 originally - 1 pre-deferred 8.4):

| Story | Title | Status |
|-------|-------|--------|
| 8.1 | Import Resume/Checkpoint | ✅ done |
| 8.2 | Export Backpressure | ✅ done |
| 8.3 | Progress Persistence | ✅ done |
| ~~8.4~~ | ~~Redis Session Migration~~ | Pre-deferred to Epic 9 |
| 8.5 | Variant Price Sync | ✅ done |
| 8.6 | Variant Selection POS | ✅ done |
| 8.7 | Variant Stock Tracking | ✅ done |
| 8.8 | Variant Sync Push | ✅ done |
| 8.9 | Performance Monitoring | ✅ done |
| 8.10 | Load Testing Framework | ✅ deferred |

## What Was Planned

- k6-based load testing for import/export endpoints
- Backpressure validation under load
- Performance baseline establishment
- Alert threshold tuning

## Dependencies from Epic 8

| Dependency | Story | Status |
|------------|-------|--------|
| Import resume/checkpoint | 8.1 | ✅ complete |
| Export streaming backpressure | 8.2 | ✅ complete |
| Progress persistence | 8.3 | ✅ complete |
| Performance monitoring | 8.9 | ✅ complete |

## Epic 9 Inclusion

Story 8.10 should be first item in Epic 9 to:
- Validate Epic 8 performance under load
- Tune alerts based on real load data
- Establish production readiness baselines

## Acceptance Criteria (Preserved)

- [ ] Load test scripts for import (10K+ rows)
- [ ] Load test scripts for export (100K+ rows)
- [ ] Memory usage stays under 50MB during export
- [ ] Alert thresholds validated
- [ ] Performance report generated

## Technical Notes

- Use k6 for load testing (already in dependencies)
- Test scenarios should cover:
  - Normal load (100 concurrent users)
  - Peak load (500 concurrent users)
  - Stress test (1000+ concurrent users)
  - Backpressure trigger (slow consumer simulation)
- Performance benchmarks should be documented in `docs/performance/`
