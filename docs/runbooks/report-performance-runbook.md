# Report Performance Runbook

## Overview

This runbook covers troubleshooting steps for report performance issues in Jurnapod. Reports covered include Trial Balance, General Ledger, Profit & Loss, and Worksheet reports.

## SLO Targets

| Report Type | Latency Target (p95) | Availability |
|-------------|---------------------|--------------|
| Trial Balance | < 5 seconds | >= 99.9% |
| General Ledger | < 5 seconds | >= 99.9% |
| Profit & Loss | < 5 seconds | >= 99.9% |
| Worksheet | < 5 seconds | >= 99.9% |

## Alert Thresholds

| Alert | Condition | Severity |
|-------|-----------|----------|
| Latency SLO Burn | p95 > 5s for 5 consecutive minutes | High |
| Error Rate | Error rate > 5% over 10 minutes | High |
| Timeout Rate | Timeout rate > 1% over 15 minutes | Medium |

## Diagnostic Steps

### 1. Check Telemetry Dashboards

```bash
# Query Prometheus for report latency percentiles
promql: histogram_quantile(0.95, rate(trial_balance_latency_seconds_bucket[5m]))

# Check error rates
promql: rate(trial_balance_errors_total[10m]) / rate(trial_balance_total[10m])

# Check dataset size distribution
promql: sum by (dataset_size_bucket) (report_rows_total)
```

### 2. Identify Slow Queries

```sql
-- Find slow report queries in MySQL
SELECT 
  id,
  user,
  host,
  db,
  command,
  time,
  state,
  LEFT(query_text, 200) as query_preview
FROM performance_schema.threads
WHERE command = 'Query'
  AND time > 10
  AND db = 'jurnapod'
ORDER BY time DESC;
```

### 3. Check Database Indexes

Report queries should use indexes on:
- `journal_lines.company_id`
- `journal_lines.line_date`
- `journal_lines.outlet_id`
- `journal_lines.account_id`

Verify with EXPLAIN:
```sql
EXPLAIN SELECT ... FROM journal_lines WHERE company_id = ? AND line_date BETWEEN ? AND ?;
```

Expected: `type: range` with `key: idx_journal_lines_company_date`

### 4. Check Dataset Size

Dataset size buckets are tracked in telemetry:
- **small**: <= 100 rows
- **medium**: 101-500 rows
- **large**: 501-2000 rows
- **xlarge**: > 2000 rows

Large datasets (> 2000 rows) may indicate:
- Date range too broad
- Too many outlets selected
- Missing account filter

## Common Issues and Solutions

### Issue: Report Times Out (HTTP 504)

**Symptoms:**
- GET request returns 504 Gateway Timeout
- Client receives timeout error

**Causes:**
- Date range too large
- Too many outlets
- Missing database indexes
- Database load

**Resolution:**
1. Check query timeout configuration (default: 30s)
2. Advise user to narrow date range
3. Apply outlet filter if possible
4. Check database index health
5. Check for database load spikes

### Issue: Report p95 Latency Exceeds 5s

**Symptoms:**
- Dashboard shows latency spike
- Users report slow reports

**Causes:**
- Large dataset for company
- Missing indexes
- Database resource contention
- Complex account structure

**Resolution:**
1. Check dataset size bucket for affected company
2. Run EXPLAIN on report query
3. Verify indexes exist
4. Check for concurrent long-running queries
5. Consider adding composite indexes for common query patterns

### Issue: High Error Rate (> 5%)

**Symptoms:**
- Error rate alert fires
- Multiple users see errors

**Causes:**
- Database connection issues
- Invalid fiscal year configuration
- Permission changes
- Schema mismatch

**Resolution:**
1. Check error_class label in metrics
2. Check database connectivity
3. Verify user permissions not revoked
4. Check for recent schema changes
5. Review application logs

## Structured Log Format

Report operations emit structured logs:

```json
{
  "type": "report_metrics",
  "timestamp": "2026-03-22T10:00:00.000Z",
  "report_type": "trial_balance",
  "company_id": 123,
  "dataset_size_bucket": "medium",
  "latency_ms": 2450,
  "row_count": 342,
  "error_class": null,
  "slo_ok": true
}
```

### Log Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| type | string | Always "report_metrics" |
| timestamp | ISO8601 | When the metric was recorded |
| report_type | string | trial_balance, general_ledger, etc. |
| company_id | number | Tenant identifier |
| dataset_size_bucket | string | small/medium/large/xlarge |
| latency_ms | number | Request duration in milliseconds |
| row_count | number | Number of rows returned |
| error_class | string\|null | timeout/validation/system/auth or null |
| slo_ok | boolean | True if latency < 5s |

## Escalation

### P1 (Immediate Response)
- Complete outage (all reports failing)
- Data corruption suspected
- Security incident

**Actions:**
1. Check database connectivity
2. Verify schema integrity
3. Check application logs
4. Escalate to DBA if needed

### P2 (Within 1 hour)
- Latency SLO breached for > 15 minutes
- Error rate > 10%

**Actions:**
1. Check database load
2. Review slow query log
3. Consider query timeout adjustment
4. Plan index optimization

### P3 (Within 4 hours)
- Latency degraded but functional
- Intermittent timeouts

**Actions:**
1. Monitor trend
2. Schedule performance review
3. Plan optimization sprint

## Recovery Verification

After resolving an incident:

1. Verify SLO dashboard shows green
2. Confirm no recent error spikes
3. Spot check report generation times
4. Update incident log with resolution

## Prevention

### Proactive Monitoring
- Daily review of p95 latency trends
- Weekly check of index health
- Monthly capacity planning review

### Performance Testing
- Load test reports with production-like data
- Test with largest expected dataset
- Verify SLO targets met under load

## Contact

| Role | Contact |
|------|---------|
| On-Call Engineer | See PagerDuty |
| DBA Team | dba@signal18.id |
| Engineering Lead | See escalation matrix |
