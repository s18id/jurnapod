## Milestone M0 — Repo Hygiene (selesai)
**Goal:** monorepo bersih, output build ke `dist/`, tidak ada artefak di `src/`.
- [x] Pastikan semua package punya `build` + `typecheck --noEmit`
- [x] Pastikan `.gitignore` mencakup `dist`, `node_modules`, `*.tsbuildinfo`
- [x] `npm run build -ws` sukses

---

## Milestone M1 — Database & Migration
**Goal:** DB siap dipakai (MySQL/MariaDB), schema versioned, seed minimal.

### PR-01: DB schema v1
- [x] Tambah `packages/db/migrations/0001_init.sql` (schema v1)
- [x] Tambah doc: `docs/db/schema.md` (cara apply)
- [x] Tambah script root:
  - [x] `db:migrate` (apply migrations)
  - [x] `db:seed` (seed roles, company, outlet, owner)

### PR-02: Seed data minimal
- [x] Seed roles: OWNER/ADMIN/CASHIER/ACCOUNTANT
- [x] Seed company + outlet default
- [x] Seed user owner (password hash)
- [x] Seed modules + company modules:
  - [x] `pos` (enabled)
  - [x] `sales` (enabled)
  - [x] `inventory` (enabled, level 0)
  - [x] `purchasing` (disabled)

**Acceptance criteria**
- [x] Schema dapat di-run dari nol
- [x] Seed menghasilkan user yang bisa login

---

## Milestone M2 — API Platform Minimal (Auth + Outlet Access)
**Goal:** POS & backoffice bisa login dan mendapatkan akses outlet.

### PR-03: Auth endpoints
- [x] `POST /auth/login` → JWT access + refresh (opsional)
- [x] `GET /me` → user profile + roles + outlet list
- [x] Middleware/guard: verify JWT

### PR-04: RBAC & outlet access guard
- [x] Guard `requireRole(OWNER|ADMIN|CASHIER|ACCOUNTANT)`
- [x] Guard `requireOutletAccess(outlet_id)`
- [x] Audit log untuk login (success/fail)

**Acceptance criteria**
- [x] Login berhasil
- [x] `/me` mengembalikan outlet yang boleh diakses
- [x] Endpoint yang butuh outlet menolak akses tanpa izin

---

## Milestone M3 — Master Data (Items + Prices)
**Goal:** backoffice bisa buat item & harga per outlet; POS bisa pull.

### PR-05: Items API
- [x] CRUD `items` (SERVICE/PRODUCT/INGREDIENT/RECIPE)
- [x] Filter by `company_id`, `is_active`

### PR-06: Prices API (per outlet)
- [x] CRUD `item_prices`
- [x] Endpoint list harga aktif per outlet

### PR-07: Sync pull v1
- [x] `GET /sync/pull?outlet_id&since_version`
- [x] Return:
  - [x] items
  - [x] prices untuk outlet
  - [x] config (tax/payment methods minimal)
  - [x] `data_version` naik saat ada perubahan

**Acceptance criteria**
- [x] Backoffice create item+price
- [x] POS bisa pull items+price

---

## Milestone M4 — POS Offline v0 (Local Sale + Outbox)
**Goal:** kasir bisa jualan offline dan tersimpan di IndexedDB.

### PR-08: IndexedDB schema (Dexie)
- [x] Tables:
  - [x] `products_cache` (items+prices snapshot per outlet/version)
  - [x] `sales`
  - [x] `sale_items`
  - [x] `payments`
  - [x] `outbox_jobs`
- [x] Utilities: `createSaleDraft`, `completeSale`, `enqueueOutboxJob`

### PR-09: POS UI minimal
- [x] Login + pilih outlet
- [x] List produk & search
- [x] Cart + qty/discount minimal
- [x] Payment (cash/QRIS)
- [x] Complete sale → generates `client_tx_id` + save offline + enqueue outbox
- [x] Badge status: Offline / Pending

**Acceptance criteria**
- [x] Tanpa internet, transaksi masih bisa dibuat dan tersimpan
- [x] Outbox berisi job PENDING

---

## Milestone M5 — POS Sync Push v1 (Idempotent)
**Goal:** outbox bisa sync ke server tanpa duplikasi.

### PR-10: API `/sync/push`
- [x] `POST /sync/push` menerima batch transaksi:
  - [x] header + items + payments
  - [x] wajib `client_tx_id`
- [x] Idempotency:
  - [x] UNIQUE index `pos_transactions.client_tx_id`
  - [x] Jika duplicate → return DUPLICATE tanpa insert ulang
- [x] Simpan `pos_transactions/items/payments` dalam 1 DB transaction
- [x] Optional: insert `pos_sync_log`

### PR-11: POS sync client
- [x] Manual “Sync now”
- [x] Auto sync interval saat online
- [x] Retry with backoff untuk FAILED
- [x] Update status job (SENT/FAILED)

**Acceptance criteria**
- [x] Push sukses → transaksi ada di DB
- [x] Push ulang payload yang sama tidak menggandakan transaksi

---

## Milestone M6 — Posting to GL (Core milestone)
**Goal:** setiap transaksi POS COMPLETED otomatis membuat journal entries.

### PR-12: Posting engine core
- [x] `packages/core` implement:
  - [x] `posting.post(doc_type, doc_id, company_id, outlet_id)`
- [x] Implement mapper:
  - [x] `mapPosSaleToJournal(...)`
- [x] Gunakan `outlet_account_mappings` (cash/qris/revenue/tax/ar)

### PR-13: Integrasi posting saat `/sync/push`
- [x] Setelah insert pos transaction → call posting
- [x] Create `journal_batches` + `journal_lines`
- [x] Validasi total debit == total credit

**Acceptance criteria**
- [x] Setelah sync, journal batch tercipta
- [x] Trial balance / totals bisa dihitung dari journal

---

## Milestone M7 — Backoffice v0 (Laporan minimal)
**Goal:** admin bisa melihat sales & journal.

### PR-14: Backoffice screens minimal
- [x] Items + prices management
- [x] POS transactions list (filter outlet/date)
- [x] Daily sales summary (bisa pakai view `v_pos_daily_totals`)
- [x] Journal list + simple trial balance

**Acceptance criteria**
- [x] Owner bisa melihat sales harian dan journal

---

## Milestone M8 — Sales v1 (Invoice + Payment In)
**Goal:** invoice dan payment-in dengan posting GL + print/PDF.

### PR-15: Sales invoice module
- [x] CRUD invoice + lines
- [x] POST action: lock & post → generate journal
- [x] PDF/print endpoint (v1 simple HTML->PDF / print view)

### PR-16: Payment in + allocation
- [x] CRUD payment_in
- [x] Allocate ke invoice (partial allowed)
- [x] Posting payment → journal (cash/bank vs AR)

**Acceptance criteria**
- [x] Posting journal untuk invoice & payment-in
- [x] Print/PDF tersedia

---

## Milestone M9 — Import CSV (Historical)
**Goal:** import COA/journal dari CSV sesuai mapping (DA/TRNS/ALK).

### PR-17: Import pipeline
- [x] Upload CSV + create `data_imports` record
- [x] Parse DA → accounts (parent/child + type mapping)
- [x] Parse TRNS/ALK → journal_batches + journal_lines
- [x] Idempotency by file hash (per company)
- [x] Current balance cache per account

**Acceptance criteria**
- [x] File CSV berhasil di-import
- [x] BB/LR/NRL bisa ditampilkan dari data import
