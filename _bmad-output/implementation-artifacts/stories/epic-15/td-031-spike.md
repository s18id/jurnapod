# TD-031 Spike: Alert Retry Logic for Webhook Dispatch

**Created:** 2026-03-29
**Author:** Dev Agent
**Status:** Complete

---

## Executive Summary

Spike investigation into TD-031: "Alert retry logic - webhook dispatch lacks exponential backoff"

**Finding:** The current webhook dispatch implementation in `alert-manager.ts` has no retry strategy. On failure, it logs the error and returns `false` immediately.

---

## 1. Current Implementation Analysis

### 1.1 Files Analyzed

| File | Purpose |
|------|---------|
| `apps/api/src/lib/alerts/alert-manager.ts` | Main alert manager with webhook dispatch |
| `apps/api/src/lib/alerts/alert-rules.ts` | Alert thresholds and webhook configuration |

### 1.2 Webhook Dispatch Code

**Location:** `alert-manager.ts`, method `dispatchAlert()` (lines 178-206)

```typescript
async dispatchAlert(event: AlertEvent): Promise<boolean> {
  const config = getWebhookConfig();
  if (!config) {
    // No webhook configured, just log
    console.warn(`[alert] Alert firing: ${event.name} (${event.severity}): ${event.message}`);
    console.warn(`[alert] Value: ${event.value}, Threshold: ${event.threshold}, Window: ${event.windowSeconds}s`);
    return false;
  }

  try {
    const payload = this.formatWebhookPayload(event);
    const response = await fetch(config.url, {
      method: config.method,
      headers: config.headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(config.timeout ?? 5000),
    });

    if (!response.ok) {
      console.error(`[alert] Webhook failed: ${response.status} ${response.statusText}`);
      return false;
    }

    console.info(`[alert] Alert dispatched: ${event.name} (${event.severity})`);
    return true;
  } catch (error) {
    console.error(`[alert] Webhook error: ${error instanceof Error ? error.message : "Unknown error"}`);
    return false;
  }
}
```

### 1.3 Current Failure Handling

| Scenario | Current Behavior |
|----------|------------------|
| No webhook configured | Log warning, return `false` |
| HTTP non-ok (4xx/5xx) | Log error, return `false` |
| Network error/timeout | Log error, return `false` |
| Parse error | Log error, return `false` |

**Key Issue:** Zero retry attempts. Any failure is final.

### 1.4 Configuration

From `alert-rules.ts`:
- `ALERT_WEBHOOK_URL` - required
- `ALERT_WEBHOOK_METHOD` - default "POST"
- `ALERT_WEBHOOK_TIMEOUT` - default 5000ms
- `ALERT_WEBHOOK_HEADERS` - optional JSON

---

## 2. Proposed Exponential Backoff Pattern

### 2.1 Retry Configuration

```typescript
interface RetryConfig {
  maxRetries: number;      // default: 3
  baseDelayMs: number;     // default: 1000 (1 second)
  maxDelayMs: number;       // default: 10000 (10 seconds)
  retryableStatuses: number[]; // HTTP status codes to retry
}
```

### 2.2 Retry Algorithm

```
Attempt 1: Immediate
Attempt 2: Wait 1s (base * 2^0)
Attempt 3: Wait 2s (base * 2^1)
Attempt 4: Wait 4s (base * 2^2)
```

Delays: 0ms → 1000ms → 2000ms → 4000ms (total: 7s worst case)

### 2.3 Proposed Implementation

```typescript
/**
 * Execute a function with exponential backoff retry
 */
async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      onRetry?.(attempt + 1, lastError, delay);
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### 2.4 Updated dispatchAlert with Retry

```typescript
async dispatchAlert(event: AlertEvent): Promise<boolean> {
  const config = getWebhookConfig();
  if (!config) {
    console.warn(`[alert] Alert firing: ${event.name} (${event.severity}): ${event.message}`);
    console.warn(`[alert] Value: ${event.value}, Threshold: ${event.threshold}, Window: ${event.windowSeconds}s`);
    return false;
  }

  const payload = this.formatWebhookPayload(event);

  try {
    await withExponentialBackoff(
      async () => {
        const response = await fetch(config.url, {
          method: config.method,
          headers: config.headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(config.timeout ?? 5000),
        });

        if (!response.ok) {
          throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
        }
      },
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        onRetry: (attempt, error, delay) => {
          console.warn(`[alert] Retry ${attempt}/3 in ${delay}ms: ${error.message}`);
        },
      }
    );

    console.info(`[alert] Alert dispatched: ${event.name} (${event.severity})`);
    return true;
  } catch (error) {
    console.error(`[alert] Webhook error after retries: ${error instanceof Error ? error.message : "Unknown error"}`);
    return false;
  }
}
```

---

## 3. Story Breakdown for Epic 16

### Story 16.1: Create Retry Utility Library
**Estimated Time:** 2 hours
**Priority:** P2

Create `apps/api/src/lib/retry.ts` with:
- `withExponentialBackoff<T>()` generic function
- `sleep()` utility
- JSDoc documentation
- Unit tests

### Story 16.2: Update Alert Dispatch with Retry
**Estimated Time:** 2 hours
**Priority:** P2

Update `apps/api/src/lib/alerts/alert-manager.ts`:
- Import retry utility
- Update `dispatchAlert()` to use `withExponentialBackoff`
- Add retry logging
- Add configuration options for retry params

Configuration via environment:
- `ALERT_WEBHOOK_MAX_RETRIES` (default: 3)
- `ALERT_WEBHOOK_BASE_DELAY_MS` (default: 1000)
- `ALERT_WEBHOOK_MAX_DELAY_MS` (default: 10000)

### Story 16.3: Add Retry Configuration and Tests
**Estimated Time:** 2 hours
**Priority:** P2

1. Update `alert-rules.ts` to include retry config in `WebhookConfig`
2. Add unit tests for `withExponentialBackoff`
3. Add unit tests for `dispatchAlert` retry behavior
4. Add integration tests (if webhook endpoint available)

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Webhook receiver overwhelmed by retries | Low | Medium | Max 3 retries with exponential backoff limits total requests |
| Alert storm during outages | Low | Medium | Alerts are low-frequency by nature |
| Retry timeout exceeds process limits | Low | Low | Max delay cap of 10s |
| Memory leak from pending retries | Low | Low | Async retries don't block, limited queue |

**Overall Risk:** LOW - Alerting is not a high-frequency operation, and the retry strategy is conservative.

---

## 5. Testing Approach

### Unit Tests (Story 16.3)

1. **`withExponentialBackoff` tests:**
   - Success on first attempt
   - Success after retries
   - Final attempt failure throws
   - Correct delay calculations
   - `onRetry` callback called

2. **`dispatchAlert` tests:**
   - Success returns `true`
   - All retries exhausted returns `false`
   - Logs indicate retry attempts

### Mock Strategy

```typescript
// Mock fetch to simulate failures
const mockFetch = vi.fn()
  .mockRejectedValueOnce(new Error('Network error'))
  .mockResolvedValueOnce({ ok: false, status: 500 })
  .mockResolvedValueOnce({ ok: true });

vi.stubGlobal('fetch', mockFetch);
```

---

## 6. Additional Considerations

### 6.1 Idempotency
Webhooks should be idempotent. Consider adding a unique `alert_id` to the payload to prevent duplicate processing on retries.

### 6.2 Alert Cooldown Interaction
The alert manager already has a `cooldownMs` mechanism. The retry is orthogonal - if cooldown triggers, no dispatch is attempted at all.

### 6.3 Connection Pool
No additional database connections are used by the retry logic. Webhook calls are external HTTP requests.

---

## 7. Recommendations

1. **Proceed with implementation** in Epic 16
2. **Keep retry params configurable** via environment variables
3. **Add unique alert ID** for idempotency (future enhancement)
4. **Consider circuit breaker pattern** for extended outages (future enhancement)

---

## 8. Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/lib/retry.ts` | **NEW** - Retry utility |
| `apps/api/src/lib/alerts/alert-manager.ts` | Add retry to `dispatchAlert` |
| `apps/api/src/lib/alerts/alert-rules.ts` | Add retry config |
| `apps/api/src/lib/retry.test.ts` | **NEW** - Unit tests |
| `apps/api/src/lib/alerts/alert-manager.test.ts` | **NEW or UPDATE** - Tests |

---

*Spike completed: 2026-03-29*
