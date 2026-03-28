# Story 15.5: TD-031 Alert Retry Spike (if time permits)

**Epic:** Epic 15
**Story Number:** 15.5
**Status:** review
**Estimated Time:** 2 hours
**Priority:** P2

---

## Summary

Spike on TD-031: Alert retry logic for webhook dispatch. Analyze requirements and create implementation plan.

## Context

TD-031 from Epic 8: "Alert retry logic - webhook dispatch lacks exponential backoff"

Current webhook dispatch has no retry strategy. This spike analyzes requirements for exponential backoff.

## Spike Objectives

1. **Analyze Current Implementation**
   - Find all webhook dispatch code
   - Identify retry points
   - Document current failure handling

2. **Design Exponential Backoff Pattern**
   ```typescript
   // Retry with exponential backoff
   const maxRetries = 3;
   const baseDelay = 1000; // 1 second
   
   for (let attempt = 0; attempt < maxRetries; attempt++) {
     try {
       return await dispatchWebhook(payload);
     } catch (error) {
       if (attempt === maxRetries - 1) throw error;
       const delay = baseDelay * Math.pow(2, attempt);
       await sleep(delay);
     }
   }
   ```

3. **Create Implementation Plan**
   - Story breakdown for Epic 16
   - Affected files
   - Testing approach

## Spike Output

Create document at `_bmad-output/implementation-artifacts/stories/epic-15/td-031-spike.md`:

- Current implementation analysis
- Proposed exponential backoff pattern
- Story breakdown for Epic 16
- Risk assessment

## Acceptance Criteria

- [ ] Current webhook dispatch code analyzed
- [ ] Exponential backoff pattern designed
- [ ] Epic 16 story breakdown created
- [ ] TD-031 spike document created

## Files to Analyze

- `apps/api/src/lib/webhooks/` (if exists)
- `apps/api/src/routes/` (search for webhook dispatch)

---

## Spike Findings Summary

### Current Implementation
- **File:** `apps/api/src/lib/alerts/alert-manager.ts`
- **Method:** `dispatchAlert()` (lines 178-206)
- **Issue:** No retry strategy - single fetch call, returns `false` on any failure

### Proposed Solution
- Exponential backoff with max 3 retries
- Base delay: 1000ms, doubling each attempt (1s → 2s → 4s)
- Max total wait: ~7 seconds

### Epic 16 Story Breakdown
1. **Story 16.1:** Create retry utility library (`apps/api/src/lib/retry.ts`)
2. **Story 16.2:** Update alert dispatch with retry logic
3. **Story 16.3:** Add retry configuration and tests

### Spike Document
Full document: `_bmad-output/implementation-artifacts/stories/epic-15/td-031-spike.md`

---

*Story file created: 2026-03-28*
*Spike completed: 2026-03-29*
