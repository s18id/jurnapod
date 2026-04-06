# Epic 34: Parallel Coordination

## Story Dependencies

```
Story 34.1 (Audit)
        ↓
Story 34.2 (Structure Definition)
        ↓
    ┌───┴───┐
    ↓       ↓
Story 34.3  Story 34.5
(API)       (Packages)
    ↓       ↓
    ↓       ↓
Story 34.4  Story 34.6
(Dedup)     (Scripts)
    ↓       ↓
    └───┬───┘
        ↓
Story 34.7
(Validation)
```

## Parallel Execution Groups

### Group A: Sequential Start
- **34.1** (4h) → **34.2** (4h)

### Group B: Parallel Branch
After 34.2 completes:
- **34.3** (8h) - API test reorganization
- **34.5** (8h) - Package test reorganization

### Group C: Sequential After Group B
- **34.4** (8h) - API deduplication (after 34.3)
- **34.6** (4h) - Scripts update (after 34.3 + 34.5)

### Group D: Final Gate
- **34.7** (4h) - Validation (after 34.6)

## Resource Constraints

- Stories 34.3 and 34.5 can run in parallel (different packages)
- Stories 34.1, 34.2, 34.4, 34.6, 34.7 are single-threaded

## Critical Path

```
34.1 → 34.2 → 34.3 → 34.4 → 34.7
              ↓
           (also: 34.5 → 34.6 → 34.7)
```

Minimum duration: ~40h (1 sprint)

## Risk: Test Failures During Reorganization

When tests are moved, import paths break. Mitigation:
- Story 34.6 updates scripts after test moves
- Story 34.7 validates and fixes any broken imports

## Coordination Notes

1. **34.1 output** feeds into all subsequent stories (test inventory)
2. **34.2 output** feeds into 34.3 and 34.5 (structure definition)
3. **34.3 and 34.5** can be parallelized as they touch different packages
4. **34.4** should start after 34.3 to see the reorganized API tests
5. **34.6** needs both 34.3 and 34.5 complete for full script updates
6. **34.7** is the final gate for everything
