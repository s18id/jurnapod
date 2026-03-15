# Story 1.5: Company Settings Management (Enhanced)

Status: review

## Story

As a **company admin**,
I want to **manage company-level settings using a flexible configuration system**,
So that **the organization is properly configured with extensible settings**.

## Acceptance Criteria

1. **Given** a company admin  
   **When** they view company settings  
   **Then** they see core company details (name, address, timezone, locale) AND configuration settings

2. **Given** a company admin  
   **When** they update company settings  
   **Then** changes are saved and reflected across the system

3. **Given** a company admin  
   **When** they configure company-specific preferences (currency, date format, tax defaults, receipt header)  
   **Then** these preferences apply to all outlets in the company as defaults

4. **Given** new settings added to the system  
   **When** admin configures them  
   **Then** they automatically appear in company settings UI

5. **Given** setting key with JSON value type  
   **When** admin saves complex config (e.g., invoice templates, custom fields)  
   **Then** the JSON is validated and stored properly

6. **Given** company settings and outlet settings both exist  
   **When** an outlet requests a setting  
   **Then** outlet-specific value is used if present, otherwise company default is used

## Tasks / Subtasks

- [x] Task 1: Database schema for company_settings (AC: #1, #2, #3)
  - [x] Subtask 1.1: Create company_settings table (id, company_id, key, value, value_type, created_at, updated_at) ✓ (already exists)
  - [x] Subtask 1.2: Create migration for company_settings - Allow NULL outlet_id for company-level settings
- [x] Task 2: Settings API endpoints (AC: #1, #2, #4, #5)
  - [x] Subtask 2.1: GET /api/companies/:id/settings - get all settings
  - [x] Subtask 2.2: GET /api/companies/:id/settings/:key - get single setting
  - [x] Subtask 2.3: PATCH /api/companies/:id/settings - update/create settings
  - [x] Subtask 2.4: DELETE /api/companies/:id/settings/:key - delete setting
- [x] Task 3: JSON value validation (AC: #5)
  - [x] Subtask 3.1: Validate JSON structure on save
  - [x] Subtask 3.2: Return validation errors for invalid JSON
- [x] Task 4: Settings cascade logic (AC: #6)
  - [x] Subtask 4.1: Create settings resolver that checks outlet → company → default
  - [x] Subtask 4.2: Document setting key conventions
- [ ] Task 5: Default settings seeding (AC: #3)
  - [ ] Subtask 5.1: Seed default company settings on company creation
  - [ ] Subtask 5.2: Define default values for currency, date format, tax

## Dev Notes

### Architecture Patterns

- **Data Model**: company_settings table with key-value storage
- **Value Types**: string, number, boolean, json
- **Cascade**: outlet_setting → company_setting → system default
- **API Style**: REST at `/api/companies/:id/settings`
- **Core fields**: remain in `companies` table

### Source Tree Components

- **API Routes**: `apps/api/app/api/companies/**/settings*`
- **Settings Logic**: Create in `apps/api/src/lib/settings.ts`
- **Database**: `packages/db/migrations/`

### Testing Standards

- Test settings CRUD operations
- Test JSON value validation
- Test settings cascade (outlet → company → default)
- Test tenant isolation
- Test default settings on new company

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.5]
- [Source: AGENTS.md#Repo-wide-operating-principles]

## Dev Agent Record

### Agent Model Used
- opencode-go/minimax-m2.5 (primary)
- openai/gpt-5.1-codex-mini (code generation)

### Debug Log References

### Completion Notes List

- [x] Task 1: Database schema for company_settings
  - [x] Migration 0103: Allow NULL outlet_id for company-level settings ✓
- [x] Task 2: Settings API endpoints
  - [x] GET /api/companies/:id/settings - list settings ✓
  - [x] GET /api/companies/:id/settings/:key - get single setting ✓
  - [x] PATCH /api/companies/:id/settings - batch upsert settings ✓
  - [x] DELETE /api/companies/:id/settings/:key - delete setting ✓
- [x] Task 3: JSON value validation
  - [x] Validate JSON structure on save ✓
  - [x] Return validation errors for invalid JSON ✓
- [x] Task 4: Settings cascade logic
  - [x] getResolvedSetting() checks outlet → company ✓
  - [x] Key validation with regex pattern ✓
- [x] Tests created: settings.test.ts (4 test cases)

**Implementation Summary:**
- Settings library: apps/api/src/lib/settings.ts
- Settings API: apps/api/app/api/companies/[companyId]/settings/
- Key-value storage with type support (string, number, boolean, json)
- Tenant isolation enforced at API layer
- Unit tests added: settings.test.ts
