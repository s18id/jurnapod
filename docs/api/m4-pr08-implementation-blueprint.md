<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Milestone M4 PR-08 Implementation Blueprint (POS Offline v0)

Status: implemented (reference blueprint)

This blueprint converts the M4 audit decisions into build-ready tasks for PR-08.

Tech baseline: POS client is **Vite + React + PWA** and must remain offline-first.

## Fixed Architecture Decisions

- Internal entity IDs use `BIGINT` (represented as numeric in TS/Zod).
- UUID is used only for cross-device/offline idempotency identifiers.
- For M4, required UUID: `client_tx_id` only.
- Optional future UUID (`client_doc_id`) is deferred.

## Scope for PR-08

Deliverables:
- Dexie schema with tables:
  - `products_cache`
  - `sales`
  - `sale_items`
  - `payments`
  - `outbox_jobs`
- Utility functions:
  - `createSaleDraft`
  - `completeSale`
  - `enqueueOutboxJob`
- Unit tests for offline persistence + outbox pending behavior.

Non-goals:
- Full sync worker implementation (`/sync/push` delivery loop).
- Full POS UI flows (PR-09).

## PWA Baseline Checklist (must hold during PR-08/PR-09)

- App shell is available offline via Service Worker caching.
- POS sale flow is local-first: every transaction write lands in IndexedDB before any network step.
- Installability is configured (`manifest.webmanifest`, icons, standalone display mode).
- Runtime status is visible: `Offline` / `Pending` / `Synced` badge state.
- State survives reload/reopen: draft/completed sales and `outbox_jobs` remain consistent after browser refresh.
- If offline and product cache for selected outlet is missing, POS blocks checkout with a clear message.

## Proposed Files (apps/pos)

Create these files:
- `apps/pos/src/offline/db.ts`
- `apps/pos/src/offline/types.ts`
- `apps/pos/src/offline/sales.ts`
- `apps/pos/src/offline/outbox.ts`
- `apps/pos/src/offline/__tests__/sales.test.ts`
- `apps/pos/src/offline/__tests__/outbox.test.ts`

Keep `main.tsx` unchanged except minimal wiring once utilities are available.

## Dexie Schema Design

Use one DB name, for example: `jurnapod_pos_v1`.

### 1) `products_cache`

Purpose: outlet-scoped snapshot from `/api/sync/pull`.

Fields:
- `pk`: string (`${company_id}:${outlet_id}:${item_id}`)
- `company_id`: number
- `outlet_id`: number
- `item_id`: number
- `sku`: string | null
- `name`: string
- `item_type`: `SERVICE | PRODUCT | INGREDIENT | RECIPE`
- `price_snapshot`: number
- `is_active`: boolean
- `item_updated_at`: string (ISO)
- `price_updated_at`: string (ISO)
- `data_version`: number
- `pulled_at`: string (ISO)

Indexes:
- `&pk`
- `[company_id+outlet_id+item_id]`
- `[company_id+outlet_id+data_version]`
- `[company_id+outlet_id+is_active]`

### 2) `sales`

Purpose: local sale header (draft and completed).

Fields:
- `sale_id`: string UUID (local primary key)
- `client_tx_id`: string UUID | null (required when completed)
- `company_id`: number
- `outlet_id`: number
- `cashier_user_id`: number
- `status`: `DRAFT | COMPLETED | VOID | REFUND`
- `sync_status`: `LOCAL_ONLY | PENDING | SENT | FAILED`
- `trx_at`: string (ISO)
- `subtotal`: number
- `discount_total`: number
- `tax_total`: number
- `grand_total`: number
- `paid_total`: number
- `change_total`: number
- `data_version`: number | null
- `created_at`: string (ISO)
- `completed_at`: string | null

Indexes:
- `&sale_id`
- `&client_tx_id`
- `[company_id+outlet_id+status]`
- `[company_id+outlet_id+created_at]`
- `sync_status`

### 3) `sale_items`

Purpose: immutable line snapshots at completion.

Fields:
- `line_id`: string UUID
- `sale_id`: string
- `company_id`: number
- `outlet_id`: number
- `item_id`: number
- `name_snapshot`: string
- `sku_snapshot`: string | null
- `item_type_snapshot`: string
- `qty`: number
- `unit_price_snapshot`: number
- `discount_amount`: number
- `line_total`: number

Indexes:
- `&line_id`
- `sale_id`
- `[company_id+outlet_id+sale_id]`

### 4) `payments`

Purpose: payment legs for one sale.

Fields:
- `payment_id`: string UUID
- `sale_id`: string
- `company_id`: number
- `outlet_id`: number
- `method`: string (`CASH` or `QRIS` for M4)
- `amount`: number
- `reference_no`: string | null
- `paid_at`: string (ISO)

Indexes:
- `&payment_id`
- `sale_id`
- `[company_id+outlet_id+sale_id]`

### 5) `outbox_jobs`

Purpose: queue entries for future `/sync/push`.

Fields:
- `job_id`: string UUID
- `sale_id`: string
- `company_id`: number
- `outlet_id`: number
- `job_type`: `SYNC_POS_TX`
- `dedupe_key`: string (must equal `client_tx_id`)
- `payload_json`: string
- `status`: `PENDING | SENT | FAILED`
- `attempts`: number
- `next_attempt_at`: string | null
- `last_error`: string | null
- `created_at`: string (ISO)
- `updated_at`: string (ISO)

Indexes:
- `&job_id`
- `&dedupe_key`
- `sale_id`
- `[status+next_attempt_at]`

## Utility Contracts

## `createSaleDraft(input)`

Input:
- `company_id: number`
- `outlet_id: number`
- `cashier_user_id: number`
- `opened_at?: string`

Output:
- `sale_id: string`
- `status: "DRAFT"`

Rules:
- Must fail if required scope fields are missing.
- Must create header only; no outbox job.

## `completeSale(input)`

Input:
- `sale_id: string`
- `items: Array<{ item_id: number; qty: number; discount_amount?: number }>`
- `payments: Array<{ method: string; amount: number; reference_no?: string }>`
- `totals: { subtotal: number; discount_total: number; tax_total: number; grand_total: number; paid_total: number; change_total: number }`
- `trx_at?: string`

Output:
- `sale_id: string`
- `client_tx_id: string`
- `status: "COMPLETED"`
- `outbox_job_id: string`

Rules (must be atomic in one Dexie transaction):
- Allowed transition only `DRAFT -> COMPLETED`.
- Generate `client_tx_id` exactly once.
- Read product snapshots from `products_cache` by `company_id+outlet_id+item_id`.
- Write immutable snapshots into `sale_items`.
- Write payments into `payments`.
- Enqueue one outbox job with `status = PENDING`.
- Reject if totals invalid (`paid_total < grand_total`, negative values, empty items, empty payments).

## `enqueueOutboxJob(input)`

Input:
- `sale_id: string`

Output:
- `job_id: string`
- `status: "PENDING" | "SENT" | "FAILED"`

Rules:
- Sale must already be `COMPLETED` with non-null `client_tx_id`.
- `dedupe_key = client_tx_id`.
- If dedupe exists, return existing job (no duplicate inserts).

## Invariants to Enforce

- All operational rows include `company_id` and `outlet_id`.
- Completed sale is immutable (no in-place edits).
- Corrections are future `VOID/REFUND` records, not edits.
- Outbox dedupe is strict on `client_tx_id`.
- Snapshot integrity: sale history is independent from future item/price updates.

## Test Plan (PR-08)

Unit:
- creates draft sale with scope fields.
- rejects complete on non-draft sale.
- complete sale writes header + items + payments + outbox in one transaction.
- duplicate `enqueueOutboxJob` returns existing job.
- line snapshots persist even when `products_cache` changes later.

Integration-like local tests:
- simulate offline mode (no network calls required) and complete sale successfully.
- after completion, one `PENDING` outbox exists.
- reloading DB state keeps completed sale and outbox intact.

Acceptance mapping:
- "Tanpa internet, transaksi masih bisa dibuat dan tersimpan" -> complete sale path passes with IndexedDB only.
- "Outbox berisi job PENDING" -> exactly one pending job for new completed sale.

## Go/No-Go for Start This Week

Go when:
- file structure above is created.
- Dexie schema and indexes compile.
- 3 core utilities implemented with invariants.
- tests for offline persist + pending outbox are green.

No-go if:
- `completeSale` is not atomic.
- outbox dedupe key is not `client_tx_id`.
- completed records are still editable.

## `client_doc_id` Decision

Decision for M4:
- Defer from required contract and sync payload.

Optional low-cost prep:
- Add nullable local field in `sales` now only if needed for draft UX, but do not use it as dedupe key and do not include it in push payload.
