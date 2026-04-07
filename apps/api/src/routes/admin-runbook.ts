// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Admin Runbook Routes
 *
 * Static operational runbook served as markdown:
 * - GET /admin/runbook.md - Operations runbook
 *
 * The runbook contains response procedures for common alerts
 * and operational issues.
 */

import { Hono } from "hono";
import { authenticateRequest, requireAccess, type AuthContext } from "../lib/auth-guard.js";
import { errorResponse } from "../lib/response.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Auth Middleware
// =============================================================================

const adminRunbookRoutes = new Hono();

// Auth middleware for all admin runbook routes
adminRunbookRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// Access control middleware - require admin or owner role
adminRunbookRoutes.use("/*", async (c, next) => {
  const auth = c.get("auth");

  // Check access permission using bitmask
  const accessResult = await requireAccess({
    module: "settings",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  await next();
});

// =============================================================================
// Runbook - GET /admin/runbook.md
// =============================================================================

adminRunbookRoutes.get("/runbook.md", async (c) => {
  try {
    void c.get("auth"); // Validate auth is set

    const markdown = `# Jurnapod Operations Runbook

This runbook contains response procedures for common alerts and operational issues.

---

## Table of Contents

1. [Sync Issues](#sync-issues)
   - [High Outbox Lag](#high-outbox-lag)
   - [Duplicate Suppression Spike](#duplicate-suppression-spike)
   - [Sync Latency Breach](#sync-latency-breach)
   - [Sync Failure Rate Spike](#sync-failure-rate-spike)
2. [Financial Issues](#financial-issues)
   - [Journal Posting Failures](#journal-posting-failures)
   - [GL Imbalance Detected](#gl-imbalance-detected)
   - [Missing Journal Alert](#missing-journal-alert)
3. [General Troubleshooting](#general-troubleshooting)
4. [Monitoring Issues](#monitoring-issues)
   - [Monitor the Monitoring](#monitor-the-monitoring)

---

## Sync Issues

### High Outbox Lag

**Symptoms:** \`outbox_lag_items > 100\`

**Severity:** Critical

**Diagnosis:**
1. Check API server health
   \`\`\`bash
   curl http://localhost:3001/api/health
   \`\`\`
2. Check database connectivity
   \`\`\`bash
   mysql -h $DB_HOST -u $DB_USER -p$DB_PASS $DB_NAME -e "SELECT 1"
   \`\`\`
3. Check for deadlocks
   \`\`\`sql
   SHOW ENGINE INNODB STATUS;
   \`\`\`

**Response:**
1. Scale API servers if CPU/memory are maxed
2. Restart sync workers:
   \`\`\`bash
   kubectl rollout restart deployment/jurnapod-sync
   \`\`\`
3. If lag persists > 30 minutes, escalate to on-call engineer

**Related Metrics:**
- \`outbox_lag_items\` - Current lag count
- \`outbox_retry_depth\` - Maximum retry count

---

### Duplicate Suppression Spike

**Symptoms:** \`client_tx_id_duplicates_total > 100\` in 5 minutes

**Severity:** Warning

**Diagnosis:**
1. Check POS app version
   \`\`\`bash
   # Check version from sync health endpoint
   curl http://localhost:3001/api/sync/health
   \`\`\`
2. Check network retry patterns
   - Look for excessive 429 (rate limit) responses
   - Check for timeout configurations

**Response:**
1. Verify client_tx_id generation is unique per transaction
2. Check for client bugs in the POS app
3. If client bug confirmed, schedule POS app hotfix

**Related Metrics:**
- \`client_tx_id_duplicates_total\` - Duplicate count by outlet

---

### Sync Latency Breach

**Symptoms:** Sync push latency p95 > 500ms for 5 minutes

**Severity:** Warning

**Diagnosis:**
1. Check API server load
   \`\`\`bash
    curl http://localhost:3001/metrics | grep sync_push_latency_ms
   \`\`\`
2. Check database query performance
3. Check network latency between services

**Response:**
1. Check for slow queries in MySQL
   \`\`\`sql
   SHOW FULL PROCESSLIST;
   \`\`\`
2. Review recent deployments for query changes
3. Scale horizontally if needed

**Related Metrics:**
- \`sync_push_latency_ms\` - Push latency histogram (in milliseconds)

---

### Sync Failure Rate Spike

**Symptoms:** \`sync_push_total{status=failed}\` rate > 0.5% over 5 minutes

**Severity:** Critical

**Diagnosis:**
1. Check API server logs
   \`\`\`bash
   kubectl logs -l app=jurnapod-api --tail=100 | grep ERROR
   \`\`\`
2. Check database connectivity
3. Check for validation errors in payloads

**Response:**
1. Identify failure patterns from logs
2. Check for schema mismatches
3. Rollback recent changes if needed

**Related Metrics:**
- \`sync_push_total\` - Push operations by status

---

## Financial Issues

### Journal Posting Failures

**Symptoms:** \`journal_post_failure_total\` increasing

**Severity:** Critical

**Diagnosis:**
1. Check posting failures by reason
   \`\`\`bash
   curl http://localhost:3001/metrics | grep journal_post_failure
   \`\`\`
2. Common failure reasons:
   - \`validation_error\` - Invalid journal data
   - \`gl_imbalance\` - Debits don't equal credits
   - \`posting_error\` - Database write failed
   - \`missing_reference\` - Missing external reference
   - \`internal_error\` - Unexpected server error

**Response:**
1. For validation errors, check the journal payload
2. For gl_imbalance, review journal lines
3. For posting errors, check database connectivity
4. For missing_reference, check external system integrations

**Related Metrics:**
- \`journal_post_failure_total\` - Failures by domain and reason
- \`journal_post_success_total\` - Successes by domain

---

### GL Imbalance Detected

**Symptoms:** \`gl_imbalance_detected_total > 0\`

**Severity:** Critical

**Diagnosis:**
1. Find the imbalanced journal entry
   \`\`\`sql
   SELECT * FROM journals
   WHERE id = <from_alert>
   AND (debit_total != credit_total);
   \`\`\`
2. Check journal lines for the transaction

**Response:**
1. **DO NOT DELETE** the imbalanced journal
2. Create a correcting journal entry
3. Document the imbalance and correction
4. Investigate root cause

**Alert Rule:** \`gl_imbalance_detected_total > 0\` (immediate alert)

**Related Metrics:**
- \`gl_imbalance_detected_total\` - Imbalance count

---

### Missing Journal Alert

**Symptoms:** \`journal_missing_alert_total\` increasing

**Severity:** Warning

**Diagnosis:**
1. Check if posting service completed but journal not created
2. Check for database transaction rollbacks

**Response:**
1. Verify the business document exists (invoice, order, etc.)
2. Check if journal was created but with different reference
3. Manually create journal if needed
4. Investigate why posting didn't create journal

**Related Metrics:**
- \`journal_missing_alert_total\` - Missing journal count

---

## Monitoring Issues

### Monitor the Monitoring

**Why This Matters:**
- Alert evaluation failures are invisible without self-monitoring
- Dashboard query lag indicates system health issues
- Silent monitoring failures = undetected outages

**What to Monitor:**

| Metric | Description |
|--------|-------------|
| \`alert_evaluation_total\` | Incremented each evaluation cycle |
| \`alert_evaluation_duration_ms\` | How long evaluation takes |
| \`alert_heartbeat_missing_total\` | Missed heartbeat events |
| Dashboard query latency | Per-view query performance |

**Alert Conditions:**

| Condition | Threshold | Severity |
|-----------|-----------|----------|
| \`alert_evaluation_total\` not incrementing | 2x evaluation interval | Critical |
| \`alert_evaluation_duration_ms\` | > 30 seconds | Critical |
| Dashboard query latency | > 5 seconds | Warning |

**Runbook Entries:**

1. **If \`alert_evaluation_total\` not incrementing:**
   - Check AlertManager process is running
   - Verify cron/job scheduler is active
   - Check for process crashes or restarts
   \`\`\`bash
   # Verify alert evaluation is running
   curl http://localhost:3001/health/monitoring
   \`\`\`

2. **If dashboard latency spike:**
   - Check database load and query performance
   - Review recent deployments for query changes
   \`\`\`sql
   SHOW FULL PROCESSLIST;
   \`\`\`

3. **If heartbeat missing:**
   - Check network connectivity between services
   - Verify all dependent services are reachable

**Health Check Endpoint:**

\`\`\`bash
curl http://localhost:3001/health/monitoring
\`\`\`

Returns alert evaluation status and last successful evaluation timestamp:

\`\`\`json
{
  "status": "healthy",
  "alertEvaluation": {
    "lastEvaluationTime": "2026-04-04T10:30:00Z",
    "evaluationCount": 12345,
    "isRunning": true
  }
}
\`\`\`

**Reference:**
- Alert evaluation service: \`packages/telemetry/src/runtime/alert-evaluation.ts\`
- Alert manager: \`packages/telemetry/src/runtime/alert-manager.ts\`
- Health endpoint: \`apps/api/src/lib/metrics/health.ts\`

---

## General Troubleshooting

### Dead Man's Switch (Heartbeat)

**Check Alert Health:**
\`\`\`bash
curl http://localhost:3001/metrics | grep alert_evaluation_total
\`\`\`

If this stops incrementing, the alert evaluation service may be down.

### Database Connection Issues

**Symptoms:** API returns 500 with "Database connection failed"

**Response:**
1. Check MySQL/MariaDB is running
   \`\`\`bash
   mysqladmin ping -h $DB_HOST
   \`\`\`
2. Check connection pool settings
3. Check for too many connections
   \`\`\`sql
   SHOW STATUS LIKE 'Threads_connected';
   \`\`\`

### Memory Pressure

**Check Memory Usage:**
\`\`\`bash
curl http://localhost:3001/metrics | grep process_memory
\`\`\`

**Response:**
1. Check for memory leaks in logs
2. Restart API server if needed
3. Review recent code changes

---

## Escalation Path

| Severity | Response Time | Escalation |
|----------|---------------|------------|
| Critical (P1) | 15 minutes | On-call engineer → Engineering Lead |
| Warning (P2) | 1 hour | Team lead → Engineering Lead |
| Info (P3) | Next business day | Team lead |

---

## Useful Commands

### Check Server Health
\`\`\`bash
curl http://localhost:3001/api/health
\`\`\`

### Check Metrics
\`\`\`bash
curl http://localhost:3001/metrics
\`\`\`

### Check Sync Health
\`\`\`bash
curl http://localhost:3001/api/sync/health
\`\`\`

### View Recent Logs
\`\`\`bash
kubectl logs -l app=jurnapod-api --tail=500 | grep -E "ERROR|WARN"
\`\`\`

---

*Last Updated: 2026-04-04*
*Maintained by: Operations Team*
`;

    c.header("Content-Type", "text/markdown; charset=utf-8");
    return c.body(markdown);
  } catch (error) {
    console.error("GET /admin/runbook.md failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to load runbook", 500);
  }
});

export { adminRunbookRoutes };
