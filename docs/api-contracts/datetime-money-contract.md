# Datetime and Money API Contract

**Applies to:** All stable API endpoints  
**Stability:** `stable`  
**Owner:** API/Platform, API/Accounting  
**CI gate:** `lint:api-contracts` (via `scripts/check-api-contract-diff.ts`)

---

## Datetime Format

### Standard Format

All datetime fields in API request and response payloads MUST use RFC3339 / ISO 8601 with timezone:

```
2026-03-19T10:00:00.000Z
```

Preferred timezone: UTC (`Z` suffix). Business-facing datetimes (e.g., transaction time at POS) MAY use local timezone offset when explicitly documented per endpoint.

### Rules

1. Response datetime fields MUST include timezone.
2. Request datetime fields MUST document accepted timezone behavior.
3. Timezone-aware parsing is required; UTC is the fallback when timezone is absent but only if UTC is the explicitly documented fallback for that domain.
4. **Native `Date` objects MUST NOT appear in business logic or API payloads.** Business logic operates on epoch milliseconds (`number`); conversions to/from ISO strings occur only at API boundaries.
5. Manual string slicing (`.slice(0, 10)`) for business date extraction is prohibited; use canonical timezone-aware helpers.

### Half-Open Interval Rule

For datetime column filtering, use half-open intervals:

```sql
WHERE col >= startUTC AND col < nextDayUTC
```

Overlap rule: `a_start < b_end && b_start < a_end`. `end == next start` is **non-overlap**.

---

## Date-Only Fields

### Standard Format

Date-only fields (no time component) MUST use:

```
YYYY-MM-DD
```

Examples: `invoice_date`, `due_date`, `order_date`, `expected_date`.

Rules:
1. Date-only fields MUST NOT include time component.
2. Date-only fields MUST NOT be confused with datetime instants.
3. Date-only fields MUST document the timezone if the domain has tenant-specific business hours.

### Fiscal / Reporting Date Ranges

For fiscal period and reporting date ranges:

1. Start date is **inclusive**: `from=2026-01-01` includes all of January 1st.
2. End date is **inclusive** for day boundaries; use half-open interval when filtering timestamps.
3. Fiscal period boundaries are defined by the company's fiscal year configuration.
4. Closed fiscal periods block posting operations; `PERIOD_CLOSED` error is returned.

---

## Timezone Rules

### Sync Contract (POS)

POS timestamps use UTC storage in `BIGINT` columns (epoch milliseconds). API responses return RFC3339 with UTC timezone. When timezone input is missing, UTC is the fallback only for domains where tenant-specific business hours do not apply.

### Business Date Fallback Policy

When timezone input is missing, the domain MUST define a deterministic fallback:

| Domain | Fallback | Documentation |
|--------|----------|---------------|
| POS transactions | UTC | Transaction timestamps are UTC |
| Fiscal period boundaries | Company default timezone | Defined in fiscal year config |
| Reporting date ranges | Company default timezone | Per company settings |
| Reservation timestamps | UTC | Stored as epoch milliseconds |
| Dine-in session timestamps | UTC | Stored as epoch milliseconds |

UTC MUST NOT be used as a silent fallback for business date operations unless UTC is the explicitly documented fallback for that domain.

---

## Cursor Timestamps

### Sync Pull

| Field | Direction | Type | Notes |
|-------|-----------|------|-------|
| `since_version` | Request | integer | Client-side cursor; server returns data updated after this version |
| `data_version` | Response | integer | Server-side version; client stores and sends as `since_version` next poll |

Rules:
1. Cursor values MUST be monotonic and stable.
2. Cursor values MUST be integers (not timestamps) for sync versioning.
3. Cursor values MUST NOT be derived from wall-clock time for ordering purposes.
4. For timestamp-based cursors in other endpoints (e.g., audit logs), RFC3339 with timezone is required.

---

## Money Format

### Standard Contract

Financial values in API request/response payloads MUST use:

```json
{
  "amount": "100000.00",
  "currency": "IDR"
}
```

| Field | Type | Contract |
|-------|------|----------|
| `amount` | `string` | Decimal string; preferred for precision |
| `currency` | `string` | ISO 4217 currency code (e.g., `IDR`) |

### Numeric Money Fields (Existing Endpoints)

Where numeric values are currently returned (e.g., in OpenAPI schema as `type: number`), this is documented per endpoint. Changing a numeric money field to string requires a version bump.

### Rules

1. **Floating-point storage (FLOAT, DOUBLE) is prohibited** for persistent financial values.
2. **API request/response money format** MUST be consistent per endpoint.
3. Rounding rules MUST be documented per endpoint.
4. Currency behavior (IDR rounding to nearest 1, no sub-cent) MUST be documented for POS endpoints.
5. Multi-currency base/original amount behavior MUST be documented for AP/AR endpoints.

---

## Decimal Precision

### Storage

- SQL: `DECIMAL(18, 2)` or `DECIMAL(19, 4)` for intermediate calculations.
- API responses: string or number as documented per endpoint.

### Precision Rules

1. IDR (Indonesian Rupiah): 0 decimal places (no sub-cent).
2. Calculations: `Math.round((a + b) * 100) / 100` for intermediate steps.
3. Aggregation: `CAST(SUM(amount) AS DECIMAL(18, 2))` in SQL.
4. Rounding mode: round half-up (standard financial rounding).

---

## Rounding

### Rounding Rules

| Context | Rule |
|---------|------|
| POS transaction total | Round to nearest whole IDR |
| Invoice subtotal | 2 decimal places |
| Invoice grand total | 2 decimal places |
| Payment amount | Round to nearest whole IDR |
| FX conversion | 4 decimal places intermediate; 2 decimal places final |
| Tax calculation | 2 decimal places |

Rules:
1. Rounding behavior MUST be documented for each financial endpoint.
2. Rounding mode changes require a version bump for stable endpoints.
3. Partial payment shortfall MUST follow documented settlement rules.

---

## Currency and FX Rules

### Currency Fields

| Field | Type | Notes |
|-------|------|-------|
| `currency` | string | ISO 4217 (e.g., `IDR`, `USD`, `EUR`) |
| `amount` | string/number | Amount in the specified currency |
| `amount_idr` | string/number | Amount converted to IDR for reconciliation |
| `fx_rate` | number | Exchange rate (source → target) |

### FX Acknowledgement

AP/AR payment endpoints that involve FX include `fx_acknowledged_at` timestamp:

```json
{
  "actual_amount_idr": "10500000.00",
  "invoice_amount_idr": "10500000.00",
  "payment_amount_idr": "10500000.00",
  "payment_delta_idr": "0.00",
  "fx_acknowledged_at": "2026-03-19T10:00:00.000Z"
}
```

Rules:
1. FX fields MUST be documented for all AP/AR endpoints.
2. Shortfall settlement behavior MUST be documented.
3. FX acknowledgement timestamp MUST be RFC3339 with timezone.

---

## Breaking Change Policy

The following changes to datetime or money contracts require a version bump:

| Change | Breaking? |
|--------|-----------|
| Change datetime format from RFC3339 to anything else | Yes |
| Add timezone to previously non-timezone datetime | Yes |
| Remove timezone from timezone-aware datetime | Yes |
| Change money format from string to floating-point number | Yes |
| Change decimal precision | Yes |
| Change rounding mode | Yes |
| Change currency code semantics | Yes |
| Change FX field names or semantics | Yes |
| Change cursor type from integer to timestamp | Yes |
| Add optional datetime field | No |
| Add response money field | No |

---

## Native Date Policy (Enforced)

The project-wide ban on native `Date` in business logic remains in effect:

> **Native `Date` objects MUST NOT appear in business logic or API payloads.** Business logic operates on epoch milliseconds (`number`); conversions to/from ISO strings occur only at API boundaries.

Canonical internal representation: epoch milliseconds (`TimestampMs` — `number`). All business logic MUST operate on epoch milliseconds. API routes MAY accept ISO datetime strings; the boundary validation layer MUST normalize to epoch ms immediately.

See `_bmad-output/project-context.md` for the full policy statement.

---

## OpenAPI Registration

Datetime and money field formats for stable endpoints are registered in `openapi-0.3-stability-baseline.json`.

Baseline version: `0.3-stability-baseline`

Reference: `docs/api-contracts/openapi-0.3-stability-baseline.json`