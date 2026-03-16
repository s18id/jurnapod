# Story 7.3: Add Authentication & Rate Limiting to Sync API

## Status: ready-for-dev

**Epic:** Epic 7: Sync Infrastructure - Technical Debt Fixes  
**Priority:** P0 - Critical  
**Estimated Points:** 3

## Story

As a **security engineer**,
I want **sync API endpoints to require authentication and enforce rate limits**,
So that **the system is protected from abuse and reconnaissance**.

## Acceptance Criteria

### AC1: Health Endpoint Requires JWT
**Given** an unauthenticated request to `/api/sync/health`  
**When** the request is made  
**Then** the request is rejected with 401 Unauthorized

### AC2: Rate Limits Enforced per Tier
**Given** an authenticated user  
**When** they exceed the rate limit for their tier  
**Then** subsequent requests return 429 Too Many Requests

### AC3: Rate Limit Headers in Response
**Given** a valid request within limits  
**When** the response is returned  
**Then** it includes headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset

### AC4: Correct Rate Limit Values
**Given** REALTIME tier endpoint  
**When** checking the configured rate limit  
**Then** it is 120 requests/minute (not 60)

## Implementation Notes

### Problem Analysis
- `apps/api/app/api/sync/health/route.ts` has NO auth wrapper (public endpoint)
- Rate limits defined in config objects but never enforced:
  - REALTIME: 60 req/min (should be 120 per spec)
  - OPERATIONAL: 60 req/min
  - MASTER: 30 req/min
  - ADMIN: 10 req/min
- No middleware actually enforces rate limits

### Files to Modify
1. `apps/api/app/api/sync/health/route.ts` - Add JWT auth wrapper
2. `packages/pos-sync/src/endpoints/pos-sync-endpoints.ts` - Fix REALTIME rate limit to 120
3. New: `packages/sync-core/src/middleware/rate-limit.ts` - Create rate limiting middleware

### Implementation Approach
1. Add `withAuth()` wrapper to health endpoint
2. Create rate limiting middleware using in-memory store (or Redis if available)
3. Apply middleware to all sync endpoints
4. Fix rate limit values per spec

### Testing Standards
- Unit tests for rate limiting logic
- Integration test verifying 429 is returned
- Verify rate limit headers present in response

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
- apps/api/app/api/sync/health/route.ts (modify)
- packages/pos-sync/src/endpoints/pos-sync-endpoints.ts (modify)
- packages/sync-core/src/middleware/rate-limit.ts (new)
