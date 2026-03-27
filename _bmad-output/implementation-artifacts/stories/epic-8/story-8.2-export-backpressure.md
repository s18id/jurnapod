# Story 8.2: Export Streaming Backpressure Handling

**Status:** ready-for-dev
**Epic:** Epic 8: Production Scale & POS Variant Sync
**Story ID:** 8-2-export-backpressure-handling

## Context

TD-014: The streaming export implementation yields data chunks as fast as the database provides them. Under heavy load or with slow HTTP consumers, this can cause memory buildup. While Node.js streams have some built-in buffering, explicit backpressure handling is needed for production reliability.

Building on the streaming export foundation from Story 7.5, we now add proper backpressure management.

## Acceptance Criteria

**AC1: Backpressure Detection**
- Monitor `writable.write()` return value when streaming to HTTP response
- When `write()` returns false, pause data generation until `'drain'` event
- Implement timeout for drain event (30 seconds) — error if consumer stalled

**AC2: Memory Limit Enforcement**
- Add configurable in-memory buffer limit (default: 10MB)
- When buffer exceeds limit: pause generation, wait for drain
- Log warning at WARN level when backpressure triggered

**AC3: Consumer Slow-Down Handling**
- If consumer consistently slower than producer for >60 seconds: throttle database query rate
- Implement query pacing: max 1000 rows/second when backpressure active
- Provide metrics: `backpressure_events_total`, `backpressure_duration_ms`

**AC4: Error Recovery**
- If consumer disconnects mid-stream: abort database query, release connection
- Log disconnection at INFO level with rows streamed count
- Ensure no connection pool exhaustion from aborted exports

**AC5: Performance Tests**
- Test: Export 100K rows with simulated slow consumer (100ms per chunk)
- Verify memory stays below 50MB throughout
- Verify no "Buffer overflow" errors
- Test: Consumer disconnection aborts cleanly within 5 seconds

## Technical Notes

- Modify `apps/api/src/lib/export/streaming.ts`
- Use `pipeline()` from `node:stream/promises` for proper cleanup
- Consider adding `highWaterMark` option to stream configuration
- Metrics should be compatible with existing OpenTelemetry setup

## Dependencies

Story 7.5 (streaming export optimization)

## Estimated Effort

1.5 days

## Priority

P1

## Risk Level

Low (optimization enhancement)
