<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Database Schema Reference

This document provides a complete reference of all tables in the Jurnapod database.

## Prerequisites

- MySQL/MariaDB database exists and is reachable.
- Environment variables are set for DB access:
  - `DB_HOST`
  - `DB_PORT`
  - `DB_USER`
  - `DB_PASSWORD`
  - `DB_NAME`
  - `DB_COLLATION` (recommended: `utf8mb4_uca1400_ai_ci`)

## Apply migration

Run from repo root:

```bash
npm run db:migrate
```

## Seed defaults

Run from repo root:

```bash
npm run db:seed
```

Default seed values:
- `COMPANY_CODE=JP`
- `COMPANY_NAME=Jurnapod Demo`
- `OUTLET_CODE=MAIN`
- `OUTLET_NAME=Main Outlet`
- `OWNER_EMAIL=owner@local`
- `OWNER_PASSWORD=ChangeMe123!`

## Smoke checks

Run from repo root:

```bash
npm run db:smoke
```

## Table Reference

### account_balances_current

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| account_id | bigint(20) unsigned | NO | MUL | |
| as_of_date | date | NO | | |
| debit_total | decimal(18,2) | NO | | 0.00 |
| credit_total | decimal(18,2) | NO | | 0.00 |
| balance | decimal(18,2) | NO | | 0.00 |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### account_types

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| name | varchar(191) | NO | | |
| category | varchar(20) | YES | | NULL |
| normal_balance | char(1) | YES | | NULL |
| report_group | varchar(8) | YES | | NULL |
| is_active | tinyint(1) | NO | | 1 |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### accounts

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| code | varchar(32) | NO | | |
| name | varchar(191) | NO | | |
| account_type_id | bigint(20) unsigned | YES | MUL | NULL |
| is_active | tinyint(1) | NO | | 1 |
| is_payable | tinyint(1) | NO | | 0 |
| type_name | varchar(191) | YES | | NULL |
| normal_balance | char(1) | YES | | NULL |
| report_group | varchar(8) | YES | | NULL |
| parent_account_id | bigint(20) unsigned | YES | MUL | NULL |
| is_group | tinyint(1) | NO | | 0 |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### asset_depreciation_plans

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| asset_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | YES | MUL | NULL |
| method | varchar(32) | NO | | STRAIGHT_LINE |
| start_date | date | NO | | |
| useful_life_months | int(10) unsigned | NO | | |
| salvage_value | decimal(18,2) | NO | | 0.00 |
| purchase_cost_snapshot | decimal(18,2) | NO | | NULL |
| expense_account_id | bigint(20) unsigned | NO | MUL | |
| accum_depr_account_id | bigint(20) unsigned | NO | MUL | |
| status | varchar(16) | NO | | DRAFT |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### asset_depreciation_runs

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| plan_id | bigint(20) unsigned | NO | MUL | |
| period_year | int(10) unsigned | NO | | |
| period_month | tinyint(3) unsigned | NO | | |
| run_date | date | NO | | |
| amount | decimal(18,2) | NO | | NULL |
| journal_batch_id | bigint(20) unsigned | YES | MUL | NULL |
| status | varchar(16) | NO | | POSTED |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### audit_logs

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | YES | MUL | NULL |
| outlet_id | bigint(20) unsigned | YES | MUL | NULL |
| user_id | bigint(20) unsigned | YES | MUL | NULL |
| entity_type | varchar(64) | YES | MUL | NULL |
| entity_id | varchar(128) | YES | | NULL |
| action | varchar(64) | NO | MUL | NULL |
| result | varchar(16) | NO | | NULL |
| success | tinyint(1) | NO | | 1 |
| ip_address | varchar(45) | YES | | NULL |
| payload_json | longtext | NO | | NULL |
| changes_json | longtext | YES | | NULL |
| created_at | datetime | NO | | current_timestamp() |

### auth_login_throttles

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| key_hash | char(64) | NO | UNI | |
| failure_count | int(10) unsigned | NO | | 0 |
| last_failed_at | datetime | YES | MUL | NULL |
| last_ip | varchar(45) | YES | | NULL |
| last_user_agent | varchar(255) | YES | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### auth_oauth_accounts

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| user_id | bigint(20) unsigned | NO | MUL | |
| provider | varchar(32) | NO | MUL | NULL |
| provider_user_id | varchar(191) | NO | | NULL |
| email_snapshot | varchar(191) | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |

### auth_password_reset_throttles

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| key_hash | char(64) | NO | UNI | |
| request_count | int(10) unsigned | NO | | 0 |
| window_started_at | datetime | NO | MUL | |
| last_ip | varchar(45) | YES | | NULL |
| last_user_agent | varchar(255) | YES | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### auth_refresh_tokens

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| user_id | bigint(20) unsigned | NO | MUL | |
| token_hash | char(64) | NO | UNI | |
| expires_at | datetime | NO | | NULL |
| revoked_at | datetime | YES | | NULL |
| rotated_from_id | bigint(20) unsigned | YES | MUL | NULL |
| ip_address | varchar(45) | YES | | NULL |
| user_agent | varchar(255) | YES | | NULL |
| created_at | datetime | NO | | current_timestamp() |

### cash_bank_transactions

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | YES | | NULL |
| transaction_type | enum('MUTATION','TOP_UP','WITHDRAWAL','FOREX') | NO | | |
| transaction_date | date | NO | | |
| reference | varchar(100) | YES | | NULL |
| description | varchar(500) | NO | | |
| source_account_id | bigint(20) unsigned | NO | | NULL |
| destination_account_id | bigint(20) unsigned | NO | | NULL |
| amount | decimal(18,2) | NO | | NULL |
| currency_code | varchar(3) | NO | | IDR |
| exchange_rate | decimal(18,8) | YES | | NULL |
| base_amount | decimal(18,2) | YES | | NULL |
| fx_gain_loss | decimal(18,2) | YES | | 0.00 |
| fx_account_id | bigint(20) unsigned | YES | | NULL |
| status | enum('DRAFT','POSTED','VOID') | NO | | DRAFT |
| posted_at | datetime | YES | | NULL |
| created_by_user_id | bigint(20) unsigned | YES | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### companies

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| code | varchar(32) | NO | UNI | |
| name | varchar(191) | NO | | |
| legal_name | varchar(191) | YES | | NULL |
| tax_id | varchar(64) | YES | | NULL |
| email | varchar(191) | YES | | NULL |
| phone | varchar(32) | YES | | NULL |
| address_line1 | varchar(191) | YES | | NULL |
| address_line2 | varchar(191) | YES | | NULL |
| city | varchar(96) | YES | MUL | NULL |
| postal_code | varchar(20) | YES | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |
| deleted_at | datetime | YES | MUL | NULL |

### company_account_mappings

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| mapping_key | varchar(64) | NO | | |
| account_id | bigint(20) unsigned | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### company_modules

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| module_id | bigint(20) unsigned | NO | MUL | |
| enabled | tinyint(1) | NO | | 0 |
| config_json | longtext | NO | | NULL |
| created_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| updated_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### company_payment_method_mappings

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| method_code | varchar(64) | NO | | |
| account_id | bigint(20) unsigned | NO | | NULL |
| label | varchar(191) | YES | | NULL |
| is_invoice_default | tinyint(1) | NO | | 0 |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### company_settings

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | | NULL |
| key | varchar(64) | NO | | |
| value_type | varchar(16) | NO | | |
| value_json | longtext | NO | | NULL |
| created_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| updated_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### company_tax_defaults

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| company_id | bigint(20) unsigned | NO | PRI | |
| tax_rate_id | bigint(20) unsigned | NO | PRI | |
| created_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| updated_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### data_imports

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| accounts_file_name | varchar(255) | NO | | NULL |
| transactions_file_name | varchar(255) | NO | | NULL |
| allocations_file_name | varchar(255) | NO | | NULL |
| file_hash | char(64) | NO | | NULL |
| status | varchar(16) | NO | | NULL |
| counts_json | longtext | YES | | NULL |
| error_json | longtext | YES | | NULL |
| created_by | bigint(20) unsigned | YES | MUL | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### email_outbox

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| user_id | bigint(20) unsigned | YES | MUL | NULL |
| to_email | varchar(191) | NO | | NULL |
| subject | varchar(500) | NO | | NULL |
| html | text | NO | | NULL |
| text | text | NO | | NULL |
| status | enum('PENDING','SENDING','SENT','FAILED') | NO | MUL | PENDING |
| error_message | text | YES | | NULL |
| attempts | int(10) unsigned | NO | | 0 |
| next_retry_at | timestamp | YES | | NULL |
| created_at | timestamp | NO | MUL | current_timestamp() |
| sent_at | timestamp | YES | | NULL |

### email_tokens

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| user_id | bigint(20) unsigned | NO | MUL | |
| email | varchar(191) | NO | | NULL |
| token_hash | varchar(64) | NO | UNI | NULL |
| type | enum('PASSWORD_RESET','INVITE','VERIFY_EMAIL') | NO | MUL | NULL |
| expires_at | timestamp | NO | MUL | NULL |
| used_at | timestamp | YES | | NULL |
| created_at | timestamp | NO | | current_timestamp() |
| created_by | bigint(20) unsigned | YES | | NULL |

### feature_flags

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| key | varchar(64) | NO | | |
| enabled | tinyint(1) | NO | | 0 |
| config_json | longtext | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### fiscal_years

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| code | varchar(32) | NO | | |
| name | varchar(191) | NO | | |
| start_date | date | NO | | |
| end_date | date | NO | | |
| status | varchar(16) | NO | | OPEN |
| created_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| updated_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### fixed_asset_books

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| asset_id | bigint(20) unsigned | NO | UNI | |
| cost_basis | decimal(18,2) | NO | | 0.00 |
| accum_depreciation | decimal(18,2) | NO | | 0.00 |
| accum_impairment | decimal(18,2) | NO | | 0.00 |
| carrying_amount | decimal(18,2) | NO | | 0.00 |
| as_of_date | date | NO | | |
| last_event_id | bigint(20) unsigned | NO | | NULL |
| updated_at | datetime | NO | | current_timestamp() on update |

### fixed_asset_categories

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| code | varchar(64) | NO | | |
| name | varchar(191) | NO | | |
| depreciation_method | varchar(32) | NO | | STRAIGHT_LINE |
| useful_life_months | int(10) unsigned | NO | | |
| residual_value_pct | decimal(5,2) | NO | | 0.00 |
| expense_account_id | bigint(20) unsigned | YES | MUL | NULL |
| accum_depr_account_id | bigint(20) unsigned | YES | MUL | NULL |
| is_active | tinyint(1) | NO | | 1 |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### fixed_asset_disposals

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| event_id | bigint(20) unsigned | NO | MUL | |
| asset_id | bigint(20) unsigned | NO | MUL | |
| proceeds | decimal(18,2) | NO | | 0.00 |
| cost_removed | decimal(18,2) | NO | | 0.00 |
| depr_removed | decimal(18,2) | NO | | 0.00 |
| impairment_removed | decimal(18,2) | NO | | 0.00 |
| disposal_cost | decimal(18,2) | NO | | 0.00 |
| gain_loss | decimal(18,2) | NO | | NULL |
| disposal_type | varchar(16) | NO | | NULL |
| notes | text | YES | | NULL |
| created_at | datetime | NO | | current_timestamp() |

### fixed_asset_events

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| asset_id | bigint(20) unsigned | NO | MUL | |
| event_type | varchar(32) | NO | | NULL |
| event_date | date | NO | | NULL |
| outlet_id | bigint(20) unsigned | YES | MUL | NULL |
| journal_batch_id | bigint(20) unsigned | YES | MUL | NULL |
| status | varchar(16) | NO | | POSTED |
| idempotency_key | varchar(64) | NO | | NULL |
| event_data | longtext | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| created_by | bigint(20) unsigned | NO | MUL | |
| voided_by | bigint(20) unsigned | YES | | NULL |
| voided_at | datetime | YES | | NULL |

### fixed_assets

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | YES | MUL | NULL |
| category_id | bigint(20) unsigned | YES | MUL | NULL |
| asset_tag | varchar(64) | YES | | NULL |
| name | varchar(191) | NO | | |
| serial_number | varchar(128) | YES | | NULL |
| purchase_date | date | YES | | NULL |
| purchase_cost | decimal(18,2) | YES | | NULL |
| is_active | tinyint(1) | NO | | 1 |
| disposed_at | datetime | YES | MUL | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### item_groups

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| parent_id | bigint(20) unsigned | YES | MUL | NULL |
| code | varchar(64) | YES | | NULL |
| name | varchar(191) | NO | | |
| is_active | tinyint(1) | NO | | 1 |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### item_prices

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | YES | MUL | NULL |
| item_id | bigint(20) unsigned | NO | MUL | |
| price | decimal(18,2) | NO | | NULL |
| is_active | tinyint(1) | NO | | 1 |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |
| scope_key | varchar(100) | YES | UNI | NULL |

### items

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| sku | varchar(64) | YES | | NULL |
| name | varchar(191) | NO | | |
| item_type | varchar(16) | NO | | NULL |
| item_group_id | bigint(20) unsigned | YES | MUL | NULL |
| is_active | tinyint(1) | NO | | 1 |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### journal_batches

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | YES | MUL | NULL |
| doc_type | varchar(64) | NO | MUL | NULL |
| doc_id | bigint(20) unsigned | NO | | NULL |
| client_ref | char(36) | YES | | NULL |
| posted_at | datetime | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### journal_lines

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| journal_batch_id | bigint(20) unsigned | NO | MUL | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | YES | MUL | NULL |
| account_id | bigint(20) unsigned | NO | MUL | |
| line_date | date | NO | | NULL |
| debit | decimal(18,2) | NO | | 0.00 |
| credit | decimal(18,2) | NO | | 0.00 |
| description | varchar(255) | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

Notes:
- `journal_lines.line_date` is a business/accounting date (`YYYY-MM-DD`) and should be derived from the source document date (for example `invoice_date`), not from runtime timezone clock conversion.

### module_roles

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| role_id | bigint(20) unsigned | NO | MUL | |
| module | varchar(64) | NO | MUL | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |
| permission_mask | int(11) | NO | | 0 |

### modules

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| code | varchar(64) | NO | UNI | NULL |
| name | varchar(191) | NO | | |
| description | varchar(255) | YES | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### numbering_templates

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | YES | MUL | NULL |
| scope_key | bigint(20) unsigned | NO | | 0 |
| doc_type | varchar(32) | NO | | NULL |
| pattern | varchar(128) | NO | | NULL |
| reset_period | varchar(16) | NO | | NEVER |
| current_value | int(10) unsigned | NO | | 0 |
| last_reset | date | YES | | NULL |
| is_active | tinyint(1) | NO | | 1 |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### outlet_account_mappings

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | | NULL |
| mapping_key | varchar(64) | NO | | |
| account_id | bigint(20) unsigned | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### outlet_payment_method_mappings

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | | NULL |
| method_code | varchar(64) | NO | | |
| label | varchar(191) | YES | | NULL |
| account_id | bigint(20) unsigned | NO | | NULL |
| is_invoice_default | tinyint(1) | NO | | 0 |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### outlet_tables

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | | NULL |
| code | varchar(32) | NO | | |
| name | varchar(191) | NO | | |
| zone | varchar(64) | YES | | NULL |
| capacity | int(10) unsigned | YES | | NULL |
| status | varchar(16) | NO | | AVAILABLE |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### outlets

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| code | varchar(32) | NO | | |
| name | varchar(191) | NO | | |
| city | varchar(96) | YES | | NULL |
| address_line1 | varchar(191) | YES | | NULL |
| address_line2 | varchar(191) | YES | | NULL |
| postal_code | varchar(20) | YES | | NULL |
| phone | varchar(32) | YES | | NULL |
| email | varchar(191) | YES | | NULL |
| timezone | varchar(64) | YES | | NULL |
| is_active | tinyint(1) | NO | | 1 |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### platform_settings

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| key | varchar(128) | NO | UNI | NULL |
| value_json | text | NO | | NULL |
| is_sensitive | tinyint(1) | NO | | 0 |
| updated_at | timestamp | NO | MUL | current_timestamp() |
| updated_by | bigint(20) unsigned | YES | | NULL |
| created_at | timestamp | NO | | current_timestamp() |

### pos_item_cancellations

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| cancellation_id | char(36) | NO | UNI | NULL |
| update_id | char(36) | YES | MUL | NULL |
| order_id | char(36) | NO | MUL | NULL |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | |
| item_id | bigint(20) unsigned | NO | | NULL |
| cancelled_quantity | decimal(18,4) | NO | | NULL |
| reason | varchar(500) | NO | | NULL |
| cancelled_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| cancelled_at | datetime | NO | | NULL |
| cancelled_at_ts | bigint(20) unsigned | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |

**Notes:**
- `cancelled_at_ts` is the canonical unix milliseconds timestamp for the cancellation event.

### pos_order_snapshot_lines

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| order_id | char(36) | NO | MUL | NULL |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | |
| item_id | bigint(20) unsigned | NO | | NULL |
| variant_id | bigint(20) unsigned | YES | | NULL |
| sku_snapshot | varchar(191) | YES | | NULL |
| variant_name_snapshot | varchar(191) | YES | | NULL |
| name_snapshot | varchar(191) | NO | | NULL |
| item_type_snapshot | varchar(16) | NO | | NULL |
| unit_price_snapshot | decimal(18,2) | NO | | NULL |
| qty | decimal(18,4) | NO | | NULL |
| discount_amount | decimal(18,2) | NO | | 0.00 |
| updated_at | datetime | YES | | NULL |
| updated_at_ts | bigint(20) unsigned | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |

**Notes:**
- `variant_id` links to item variants for products with multiple options (e.g., sizes, flavors).
- `updated_at_ts` is the canonical unix milliseconds timestamp.

### pos_order_snapshots

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| order_id | char(36) | NO | PRI | NULL |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | |
| service_type | varchar(16) | NO | | NULL |
| source_flow | varchar(16) | YES | | NULL |
| settlement_flow | varchar(16) | YES | | NULL |
| table_id | bigint(20) unsigned | YES | | NULL |
| reservation_id | bigint(20) unsigned | YES | | NULL |
| guest_count | int(10) unsigned | YES | | NULL |
| is_finalized | tinyint(1) | NO | | 0 |
| order_status | varchar(16) | NO | | NULL |
| order_state | varchar(16) | NO | | NULL |
| paid_amount | decimal(18,2) | NO | | 0.00 |
| opened_at | datetime | NO | | NULL |
| opened_at_ts | bigint(20) unsigned | NO | | NULL |
| closed_at | datetime | YES | | NULL |
| closed_at_ts | bigint(20) unsigned | YES | | NULL |
| notes | varchar(500) | YES | | NULL |
| updated_at | datetime | YES | | NULL |
| updated_at_ts | bigint(20) unsigned | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |

**Notes:**
- `opened_at_ts`, `closed_at_ts`, `updated_at_ts` are canonical unix milliseconds timestamps.

### pos_order_updates

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| sequence_no | bigint(20) unsigned | NO | PRI | |
| update_id | char(36) | NO | UNI | NULL |
| order_id | char(36) | NO | MUL | NULL |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | |
| base_order_updated_at | datetime | YES | | NULL |
| base_order_updated_at_ts | bigint(20) unsigned | YES | | NULL |
| event_type | varchar(32) | NO | | NULL |
| delta_json | longtext | NO | | NULL |
| actor_user_id | bigint(20) unsigned | YES | MUL | NULL |
| device_id | varchar(191) | NO | | NULL |
| event_at | datetime | NO | | NULL |
| event_at_ts | bigint(20) unsigned | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |

**Notes:**
- `event_at_ts` is the canonical unix milliseconds timestamp for event ordering.
- `base_order_updated_at_ts` preserves the base order version marker for sync.

### pos_transaction_items

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| pos_transaction_id | bigint(20) unsigned | NO | MUL | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | |
| line_no | int(10) unsigned | NO | | NULL |
| item_id | bigint(20) unsigned | NO | | NULL |
| qty | decimal(18,4) | NO | | NULL |
| price_snapshot | decimal(18,2) | NO | | NULL |
| name_snapshot | varchar(191) | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |

### pos_transaction_payments

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| pos_transaction_id | bigint(20) unsigned | NO | MUL | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | |
| payment_no | int(10) unsigned | NO | | NULL |
| method | varchar(64) | NO | | NULL |
| amount | decimal(18,2) | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |

### pos_transaction_taxes

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| pos_transaction_id | bigint(20) unsigned | NO | MUL | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | YES | | NULL |
| tax_rate_id | bigint(20) unsigned | NO | MUL | |
| amount | decimal(18,2) | NO | | 0.00 |
| created_at | datetime | NO | | current_timestamp() |

### pos_transactions

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | |
| cashier_user_id | bigint(20) unsigned | YES | MUL | NULL |
| client_tx_id | char(36) | NO | | NULL |
| status | varchar(16) | NO | | NULL |
| trx_at | datetime | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |
| payload_sha256 | char(64) | NO | | |
| payload_hash_version | tinyint(3) unsigned | NO | | 1 |
| service_type | varchar(16) | NO | | TAKEAWAY |
| table_id | bigint(20) unsigned | YES | | NULL |
| reservation_id | bigint(20) unsigned | YES | | NULL |
| guest_count | int(10) unsigned | YES | | NULL |
| order_status | varchar(16) | NO | | COMPLETED |
| opened_at | datetime | YES | | NULL |
| closed_at | datetime | YES | | NULL |
| notes | varchar(500) | YES | | NULL |

### reservations

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | | NULL |
| table_id | bigint(20) unsigned | YES | | NULL |
| reservation_group_id | bigint(20) unsigned | YES | MUL | NULL |
| customer_name | varchar(191) | NO | | NULL |
| customer_phone | varchar(64) | YES | | NULL |
| guest_count | int(10) unsigned | NO | | NULL |
| reservation_at | datetime | NO | | NULL |
| reservation_start_ts | bigint(20) unsigned | YES | MUL | NULL |
| reservation_end_ts | bigint(20) unsigned | YES | MUL | NULL |
| duration_minutes | int(10) unsigned | YES | | NULL |
| status | varchar(16) | NO | | BOOKED |
| notes | varchar(500) | YES | | NULL |
| linked_order_id | char(36) | YES | | NULL |
| arrived_at | datetime | YES | | NULL |
| seated_at | datetime | YES | | NULL |
| cancelled_at | datetime | YES | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

**Indexes:**
- `idx_reservations_company_outlet_start_ts` on `(company_id, outlet_id, reservation_start_ts, id)`
- `idx_reservations_scope_table_window_ts` on `(company_id, outlet_id, table_id, reservation_start_ts, reservation_end_ts, status)`

**Notes:**
- `reservation_start_ts` and `reservation_end_ts` are canonical unix milliseconds (BIGINT) for date-range filtering and overlap checks.
- `reservation_at` remains for API compatibility but is derived from `reservation_start_ts`.
- Overlap rule: `a_start < b_end && b_start < a_end`; `end == next start` is non-overlap.

### roles

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| code | varchar(64) | NO | | NULL |
| name | varchar(191) | NO | | NULL |
| is_global | tinyint(1) | NO | | 0 |
| role_level | int(11) | NO | | 0 |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |
| company_id | bigint(20) unsigned | YES | MUL | NULL |

### sales_credit_note_lines

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| credit_note_id | bigint(20) unsigned | NO | MUL | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | |
| line_no | int(10) unsigned | NO | | NULL |
| description | varchar(255) | NO | | NULL |
| qty | decimal(18,4) | NO | | NULL |
| unit_price | decimal(18,2) | NO | | NULL |
| line_total | decimal(18,2) | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### sales_credit_notes

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | |
| invoice_id | bigint(20) unsigned | NO | MUL | |
| credit_note_no | varchar(64) | NO | | NULL |
| credit_note_date | date | NO | | NULL |
| status | varchar(16) | NO | | DRAFT |
| reason | text | YES | | NULL |
| notes | text | YES | | NULL |
| amount | decimal(18,2) | NO | | 0.00 |
| client_ref | char(36) | YES | | NULL |
| created_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| updated_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### sales_invoice_lines

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| invoice_id | bigint(20) unsigned | NO | MUL | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | |
| line_no | int(10) unsigned | NO | | NULL |
| line_type | varchar(16) | NO | | SERVICE |
| item_id | bigint(20) unsigned | YES | MUL | NULL |
| description | varchar(255) | NO | | NULL |
| qty | decimal(18,4) | NO | | NULL |
| unit_price | decimal(18,2) | NO | | NULL |
| line_total | decimal(18,2) | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### sales_invoice_taxes

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| sales_invoice_id | bigint(20) unsigned | NO | MUL | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | YES | | NULL |
| tax_rate_id | bigint(20) unsigned | NO | MUL | |
| amount | decimal(18,2) | NO | | 0.00 |
| created_at | datetime | NO | | current_timestamp() |

### sales_invoices

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | |
| order_id | bigint(20) unsigned | YES | MUL | NULL |
| invoice_no | varchar(64) | NO | | NULL |
| invoice_date | date | NO | | NULL |
| due_date | date | YES | | NULL |
| client_ref | char(36) | YES | | NULL |
| status | varchar(16) | NO | | DRAFT |
| payment_status | varchar(16) | NO | | UNPAID |
| subtotal | decimal(18,2) | NO | | 0.00 |
| tax_amount | decimal(18,2) | NO | | 0.00 |
| grand_total | decimal(18,2) | NO | | 0.00 |
| approved_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| approved_at | datetime | YES | | NULL |
| paid_total | decimal(18,2) | NO | | 0.00 |
| created_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| updated_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### sales_order_lines

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| order_id | bigint(20) unsigned | NO | MUL | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | |
| line_no | int(10) unsigned | NO | | NULL |
| line_type | varchar(16) | NO | | SERVICE |
| item_id | bigint(20) unsigned | YES | MUL | NULL |
| description | varchar(255) | NO | | NULL |
| qty | decimal(18,4) | NO | | NULL |
| unit_price | decimal(18,2) | NO | | NULL |
| line_total | decimal(18,2) | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### sales_orders

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | |
| order_no | varchar(64) | NO | | NULL |
| client_ref | char(36) | YES | | NULL |
| order_date | date | NO | | NULL |
| expected_date | date | YES | | NULL |
| status | varchar(16) | NO | | DRAFT |
| notes | text | YES | | NULL |
| subtotal | decimal(18,2) | NO | | 0.00 |
| tax_amount | decimal(18,2) | NO | | 0.00 |
| grand_total | decimal(18,2) | NO | | 0.00 |
| created_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| updated_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| confirmed_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| confirmed_at | datetime | YES | | NULL |
| completed_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| completed_at | datetime | YES | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### sales_payment_splits

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| payment_id | bigint(20) unsigned | NO | MUL | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | |
| split_index | int(10) unsigned | NO | | 0 |
| account_id | bigint(20) unsigned | NO | MUL | |
| amount | decimal(18,2) | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### sales_payments

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | |
| invoice_id | bigint(20) unsigned | NO | | NULL |
| account_id | bigint(20) unsigned | NO | MUL | |
| payment_no | varchar(64) | NO | | NULL |
| client_ref | char(36) | YES | | NULL |
| payment_at | datetime | NO | | NULL |
| method | varchar(16) | NO | | NULL |
| status | varchar(16) | NO | | DRAFT |
| amount | decimal(18,2) | NO | | NULL |
| invoice_amount_idr | decimal(18,2) | YES | | NULL |
| payment_amount_idr | decimal(18,2) | YES | | NULL |
| payment_delta_idr | decimal(18,2) | NO | | 0.00 |
| shortfall_settled_as_loss | tinyint(1) | NO | | 0 |
| shortfall_reason | varchar(500) | YES | | NULL |
| shortfall_settled_by_user_id | bigint(20) unsigned | YES | | NULL |
| shortfall_settled_at | datetime | YES | | NULL |
| created_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| updated_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### schema_migrations

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| version | varchar(255) | NO | UNI | NULL |
| applied_at | datetime | NO | | current_timestamp() |

### static_pages

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| slug | varchar(128) | NO | UNI | NULL |
| title | varchar(191) | NO | | NULL |
| content_md | mediumtext | NO | | NULL |
| status | varchar(16) | NO | MUL | DRAFT |
| published_at | datetime | YES | | NULL |
| created_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| updated_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| meta_json | longtext | YES | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### supplies

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| sku | varchar(64) | YES | | NULL |
| name | varchar(191) | NO | | NULL |
| unit | varchar(32) | NO | | unit |
| is_active | tinyint(1) | NO | | 1 |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### sync_data_versions

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| company_id | bigint(20) unsigned | NO | PRI | |
| current_version | bigint(20) unsigned | NO | | 0 |
| updated_at | datetime | NO | | current_timestamp() on update |

### tax_rates

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| code | varchar(64) | NO | | |
| name | varchar(191) | NO | | |
| rate_percent | decimal(9,4) | NO | | 0.0000 |
| account_id | bigint(20) unsigned | YES | | NULL |
| is_inclusive | tinyint(1) | NO | | 0 |
| is_active | tinyint(1) | NO | | 1 |
| created_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| updated_by_user_id | bigint(20) unsigned | YES | MUL | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### user_outlets

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| user_id | bigint(20) unsigned | NO | PRI | |
| outlet_id | bigint(20) unsigned | NO | PRI | |
| created_at | datetime | NO | | current_timestamp() |

### user_role_assignments

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| user_id | bigint(20) unsigned | NO | MUL | |
| role_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | YES | MUL | NULL |
| created_at | datetime | NO | | current_timestamp() |

### users

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| email | varchar(191) | NO | | NULL |
| email_verified_at | timestamp | YES | MUL | NULL |
| password_hash | varchar(255) | NO | | NULL |
| is_active | tinyint(1) | NO | | 1 |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

### v_pos_daily_totals

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| company_id | bigint(20) unsigned | NO | | NULL |
| outlet_id | bigint(20) unsigned | NO | | NULL |
| trx_date | date | YES | | NULL |
| status | varchar(16) | NO | | NULL |
| tx_count | bigint(21) | NO | | 0 |
| gross_total | decimal(65,6) | NO | | 0.000000 |
| paid_total | decimal(62,2) | NO | | 0.00 |

## Dine-in Session Notes (Epic 12)

The following tables/columns are part of table reservation and multi-cashier sync flows.

### table_service_sessions (lifecycle fields)

| Column | Type | Purpose |
|--------|------|---------|
| status_id | int unsigned | Session lifecycle: ACTIVE(1), LOCKED_FOR_PAYMENT(2), CLOSED(3) |
| locked_at | datetime null | Timestamp when payment lock starts |
| closed_at | datetime null | Timestamp when session is closed |
| pos_order_snapshot_id | char(36) null | Linked POS snapshot order id for settlement |
| session_version | int unsigned | Version for multi-cashier conflict-safe refresh |
| last_finalized_batch_no | int unsigned | Last finalized checkpoint number |

### table_service_session_lines (checkpoint-aware fields)

| Column | Type | Purpose |
|--------|------|---------|
| session_id | bigint unsigned | Parent service session |
| product_id | bigint unsigned | Item reference (tenant scoped) |
| quantity | int unsigned | Ordered quantity |
| unit_price | decimal(15,4) | Working precision during session |
| line_total | decimal(15,4) | Working line total |
| batch_no | int unsigned null | Finalize checkpoint batch number |
| line_state | int unsigned | OPEN/FINALIZED/VOIDED style lifecycle |
| adjustment_parent_line_id | bigint unsigned null | Audit link for reductions/cancellations |

### table_service_session_checkpoints

| Column | Type | Purpose |
|--------|------|---------|
| id | bigint unsigned | Primary key |
| session_id | bigint unsigned | Session foreign key |
| batch_no | int unsigned | Finalized checkpoint sequence |
| snapshot_id | char(36) | POS snapshot order id |
| finalized_at | datetime | Checkpoint timestamp |
| finalized_by | varchar(255) | Actor identifier |
| client_tx_id | varchar(255) | Idempotency key |

### table_events (sync/audit fields)

| Column | Type | Purpose |
|--------|------|---------|
| client_tx_id | varchar(255) | Idempotency key per company/outlet |
| occupancy_version_before | int unsigned null | Optimistic version before applying event |
| occupancy_version_after | int unsigned null | Optimistic version after applying event |
| occurred_at | datetime | Client-recorded event timestamp |
| is_conflict | tinyint unsigned | Conflict-attempt flag (0/1) |
| conflict_reason | varchar(500) null | Human-readable conflict reason for audit traceability |

Indexes:
- `uq_table_events_client_tx` on `(company_id, outlet_id, client_tx_id)` for idempotent replay.
- `idx_table_events_conflict` on `(is_conflict, occurred_at)` for conflict audit queries.

### POS snapshot precision note

- `table_service_session_lines.unit_price` uses `DECIMAL(15,4)` for in-session precision.
- `pos_order_snapshot_lines.unit_price_snapshot` uses `DECIMAL(18,2)`.
- Finalize/close sync paths must apply explicit and deterministic 2dp rounding policy.

### reservation_groups

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | | NULL |
| group_name | varchar(191) | YES | | NULL |
| total_guest_count | int(10) unsigned | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

**Purpose:** Groups multiple reservations for large parties requiring 2+ tables.

**Indexes:**
- `idx_company_outlet` on `(company_id, outlet_id)`
- `idx_created_at` on `(created_at)`

### table_occupancy

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | |
| table_id | bigint(20) unsigned | NO | MUL | NULL |
| status_id | int(10) unsigned | NO | | NULL |
| version | int(10) unsigned | NO | | 1 |
| service_session_id | bigint(20) unsigned | YES | MUL | NULL |
| reservation_id | bigint(20) unsigned | YES | MUL | NULL |
| occupied_at | datetime | YES | | NULL |
| reserved_until | datetime | YES | | NULL |
| guest_count | int(10) unsigned | YES | | NULL |
| notes | text | YES | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |
| created_by | varchar(255) | YES | | NULL |
| updated_by | varchar(255) | YES | | NULL |

**Status Values:**
- 1 = AVAILABLE
- 2 = OCCUPIED
- 3 = RESERVED
- 4 = CLEANING
- 5 = OUT_OF_SERVICE

**Indexes:**
- `uk_table_occupancy_table` UNIQUE on `(table_id)`
- `idx_table_occupancy_company_outlet` on `(company_id, outlet_id)`
- `idx_table_occupancy_status` on `(status_id)`
- `idx_table_occupancy_session` on `(service_session_id)`
- `idx_table_occupancy_reservation` on `(reservation_id)`

**Notes:**
- Uses optimistic locking via `version` column for multi-cashier concurrency.
- `table_id` is unique - one occupancy record per table.

### table_events

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | |
| table_id | bigint(20) unsigned | NO | MUL | NULL |
| event_type_id | int(10) unsigned | NO | | NULL |
| client_tx_id | varchar(255) | NO | UNI | NULL |
| occupancy_version_before | int(10) unsigned | YES | | NULL |
| occupancy_version_after | int(10) unsigned | YES | | NULL |
| event_data | json | YES | | NULL |
| status_id_before | int(10) unsigned | YES | | NULL |
| status_id_after | int(10) unsigned | YES | | NULL |
| service_session_id | bigint(20) unsigned | YES | MUL | NULL |
| reservation_id | bigint(20) unsigned | YES | MUL | NULL |
| pos_order_id | char(36) | YES | MUL | NULL |
| synced_at | datetime | YES | | NULL |
| source_device | varchar(255) | YES | | NULL |
| occurred_at | datetime | NO | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| created_by | varchar(255) | YES | | NULL |

**Event Type IDs:**
- 1 = TABLE_OPENED
- 2 = TABLE_CLOSED
- 3 = RESERVATION_CREATED
- 4 = RESERVATION_CONFIRMED
- 5 = RESERVATION_CANCELLED
- 6 = STATUS_CHANGED
- 7 = GUEST_COUNT_CHANGED
- 8 = TABLE_TRANSFERRED
- 9 = SESSION_LINE_ADDED
- 10 = SESSION_LINE_UPDATED
- 11 = SESSION_LINE_REMOVED
- 12 = SESSION_LOCKED
- 13 = SESSION_CLOSED
- 14 = SESSION_BATCH_FINALIZED
- 15 = SESSION_LINE_ADJUSTED
- 16 = SESSION_VERSION_BUMPED

**Indexes:**
- `uk_table_events_client_tx` UNIQUE on `(company_id, outlet_id, client_tx_id)`
- `idx_table_events_company_outlet` on `(company_id, outlet_id)`
- `idx_table_events_table` on `(table_id)`
- `idx_table_events_type` on `(event_type_id)`
- `idx_table_events_occurred` on `(occurred_at)`
- `idx_table_events_session` on `(service_session_id)`
- `idx_table_events_reservation` on `(reservation_id)`
- `idx_table_events_order` on `(pos_order_id)`
- `idx_table_events_synced` on `(synced_at)`

**Notes:**
- APPEND-ONLY table - UPDATE and DELETE are blocked by triggers.
- `client_tx_id` provides idempotency for POS sync replay.

### table_service_sessions

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | NULL |
| table_id | bigint(20) unsigned | NO | MUL | NULL |
| status_id | int(10) unsigned | NO | | NULL |
| started_at | datetime | NO | | NULL |
| completed_at | datetime | YES | | NULL |
| locked_at | datetime | YES | | NULL |
| closed_at | datetime | YES | | NULL |
| guest_count | int(10) unsigned | NO | | NULL |
| guest_name | varchar(255) | YES | | NULL |
| pos_order_id | char(36) | YES | MUL | NULL |
| pos_order_snapshot_id | char(36) | YES | MUL | NULL |
| reservation_id | bigint(20) unsigned | YES | MUL | NULL |
| total_amount | decimal(15,4) | YES | | NULL |
| server_user_id | bigint(20) unsigned | YES | MUL | NULL |
| cashier_user_id | bigint(20) unsigned | YES | MUL | NULL |
| session_version | int(10) unsigned | NO | | 1 |
| last_finalized_batch_no | int(10) unsigned | NO | | 0 |
| notes | text | YES | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |
| created_by | varchar(255) | YES | | NULL |
| updated_by | varchar(255) | YES | | NULL |

**Status Values:**
- 1 = ACTIVE
- 2 = COMPLETED
- 3 = CANCELLED

**Indexes:**
- `idx_service_sessions_company_outlet` on `(company_id, outlet_id)`
- `idx_service_sessions_table` on `(table_id)`
- `idx_service_sessions_status` on `(status_id)`
- `idx_service_sessions_started` on `(started_at)`
- `idx_service_sessions_order` on `(pos_order_id)`
- `idx_service_sessions_server` on `(server_user_id)`
- `idx_service_sessions_cashier` on `(cashier_user_id)`
- `idx_service_sessions_scope_version` on `(company_id, outlet_id, session_version)`

**Notes:**
- `session_version` enables optimistic locking for multi-cashier conflict-safe refresh.
- `last_finalized_batch_no` tracks the last finalize checkpoint for the session.

### table_service_session_lines

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| session_id | bigint(20) unsigned | NO | MUL | NULL |
| line_number | int(10) unsigned | NO | | NULL |
| product_id | bigint(20) unsigned | NO | MUL | NULL |
| product_name | varchar(255) | NO | | NULL |
| product_sku | varchar(255) | YES | | NULL |
| quantity | int(10) unsigned | NO | | NULL |
| unit_price | decimal(15,4) | NO | | NULL |
| discount_amount | decimal(15,4) | NO | | 0.00 |
| tax_amount | decimal(15,4) | NO | | 0.00 |
| line_total | decimal(15,4) | NO | | NULL |
| batch_no | int(10) unsigned | YES | | NULL |
| line_state | int(10) unsigned | NO | | 1 |
| adjustment_parent_line_id | bigint(20) unsigned | YES | MUL | NULL |
| notes | text | YES | | NULL |
| is_voided | tinyint(1) | NO | | 0 |
| voided_at | datetime | YES | | NULL |
| void_reason | varchar(255) | YES | | NULL |
| created_at | datetime | NO | | current_timestamp() |
| updated_at | datetime | NO | | current_timestamp() on update |

**Line States:**
- 1 = OPEN
- 2 = FINALIZED
- 3 = VOIDED

**Indexes:**
- `idx_session_lines_session` on `(session_id)`
- `idx_session_lines_product` on `(product_id)`
- `idx_session_lines_session_batch` on `(session_id, batch_no)`
- `idx_session_lines_session_state` on `(session_id, line_state)`
- `idx_session_lines_adjustment_parent` on `(adjustment_parent_line_id)`

**Notes:**
- `unit_price` uses `DECIMAL(15,4)` for in-session precision.
- `adjustment_parent_line_id` enables audit chain for line cancellations/reductions.

### table_service_session_checkpoints

| Column | Type | Nullable | Key | Default |
|--------|------|----------|-----|---------|
| id | bigint(20) unsigned | NO | PRI | |
| company_id | bigint(20) unsigned | NO | MUL | |
| outlet_id | bigint(20) unsigned | NO | MUL | NULL |
| session_id | bigint(20) unsigned | NO | MUL | NULL |
| batch_no | int(10) unsigned | NO | | NULL |
| snapshot_id | char(36) | NO | | NULL |
| finalized_at | datetime | NO | | NULL |
| finalized_by | varchar(255) | YES | | NULL |
| client_tx_id | varchar(255) | NO | UNI | NULL |
| created_at | datetime | NO | | current_timestamp() |

**Indexes:**
- `uk_session_checkpoint_batch` UNIQUE on `(session_id, batch_no)`
- `uk_session_checkpoint_client_tx` UNIQUE on `(company_id, outlet_id, client_tx_id)`
- `idx_session_checkpoint_scope_session_time` on `(company_id, outlet_id, session_id, finalized_at)`

**Purpose:** Records finalize checkpoint sequence for repeated order finalization before payment close.

## Table Summary

| Category | Tables |
|----------|--------|
| Core Entity | companies, outlets, users, roles |
| Auth | audit_logs, auth_login_throttles, auth_oauth_accounts, auth_password_reset_throttles, auth_refresh_tokens, email_tokens, email_outbox |
| Accounting | accounts, account_types, account_balances_current, journal_batches, journal_lines |
| Modules | modules, company_modules, module_roles |
| Settings | company_settings, platform_settings, feature_flags |
| POS | pos_transactions, pos_transaction_items, pos_transaction_payments, pos_transaction_taxes |
| POS Order Management | pos_order_snapshots, pos_order_snapshot_lines, pos_order_updates, pos_item_cancellations |
| Dine-in Operations | table_occupancy, table_service_sessions, table_service_session_lines, table_events, table_service_session_checkpoints |
| Sales | sales_invoices, sales_invoice_lines, sales_invoice_taxes, sales_orders, sales_order_lines, sales_payments, sales_payment_splits, sales_credit_notes, sales_credit_note_lines |
| Fixed Assets | fixed_assets, fixed_asset_categories, fixed_asset_books, fixed_asset_events, fixed_asset_disposals, asset_depreciation_plans, asset_depreciation_runs |
| Items | items, item_prices, item_groups, item_variants, item_images |
| Tax | tax_rates, company_tax_defaults |
| Tables & Reservations | outlet_tables, reservations, reservation_groups |
| Mappings | outlet_account_mappings, outlet_payment_method_mappings, company_account_mappings, company_payment_method_mappings |
| Numbering | numbering_templates |
| Fiscal | fiscal_years |
| Data Import | data_imports |
| Sync | sync_data_versions, sync_operations |
| Email | email_tokens, email_outbox |
| Static Content | static_pages |
| Supplies | supplies |
| Cash/Bank | cash_bank_transactions |
| Reference | schema_migrations, v_pos_daily_totals |

## Canonical Timestamp Policy

Jurnapod uses unix milliseconds (BIGINT) as the canonical timestamp format for:

| Table | Canonical Columns |
|-------|------------------|
| reservations | reservation_start_ts, reservation_end_ts |
| pos_order_updates | event_at_ts |
| pos_order_snapshots | opened_at_ts, closed_at_ts, updated_at_ts |
| pos_order_snapshot_lines | updated_at_ts |
| pos_item_cancellations | cancelled_at_ts |

**Benefits:**
- Timezone-agnostic for reporting and filtering
- Deterministic sort order without timezone conversion
- Index-friendly for range queries

**Query Rules:**
- Never wrap indexed timestamp columns in SQL functions
- Apply functions only on constants or pass numeric boundaries from app layer
