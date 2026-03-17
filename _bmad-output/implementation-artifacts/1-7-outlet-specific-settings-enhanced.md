---
epic: 1
story: 1.7
title: Outlet-Specific Settings (Enhanced)
status: done
created: 2026-03-15
---

# Story 1.7: Outlet-Specific Settings (Enhanced)

## Story

As a **store manager**,
I want to **configure settings specific to my outlet using a flexible key-value system**,
So that **each outlet can operate with its own configuration while inheriting company defaults**.

## Acceptance Criteria

1. **Given** a store manager  
   **When** they view outlet settings  
   **Then** they see both company-level defaults and outlet-specific overrides

2. **Given** a store manager  
   **When** they update outlet-specific settings (receipt printer, default payment method, tax rate)  
   **Then** changes are saved to outlet_settings table  
   **And** apply only to their outlet  
   **And** company settings remain unchanged for other outlets

3. **Given** a setting not overridden at outlet level  
   **When** the outlet applies the setting  
   **Then** the company-level default is used (cascading)

4. **Given** new settings added to the system  
   **When** admin configures them  
   **Then** they automatically appear in outlet settings UI

5. **Given** setting key with JSON value type  
   **When** manager saves complex config (e.g., printer network settings)  
   **Then** the JSON is validated and stored properly

## Tasks / Subtasks

- [x] Task 1: Database schema for outlet_settings (AC: #1, #2)
  - [x] Subtask 1.1: Create outlet_settings table (id, outlet_id, key, value, value_type, created_at, updated_at)
  - [x] Subtask 1.2: Create migration for outlet_settings (reuse company_settings table with nullable outlet_id - Story 1-5)
- [x] Task 2: Settings API endpoints (AC: #1, #2, #4, #5)
  - [x] Subtask 2.1: GET /api/outlets/:id/settings - get all outlet settings (merged with company defaults)
  - [x] Subtask 2.2: GET /api/outlets/:id/settings/:key - get single setting
  - [x] Subtask 2.3: PATCH /api/outlets/:id/settings - update/create outlet-specific settings
  - [x] Subtask 2.4: DELETE /api/outlets/:id/settings/:key - delete outlet override
- [x] Task 3: Settings cascade logic (AC: #3)
  - [x] Subtask 3.1: Implement settings resolver (outlet → company → default)
  - [x] Subtask 3.2: Return merged settings on GET
- [x] Task 4: JSON value validation (AC: #5)
  - [x] Subtask 4.1: Validate JSON structure on save
  - [x] Subtask 4.2: Return validation errors for invalid JSON

## Dev Notes

### Architecture Patterns

- **Data Model**: outlet_settings table with key-value storage (similar to company_settings)
- **Value Types**: string, number, boolean, json
- **Cascade**: outlet_setting → company_setting → system default
- **API Style**: REST at `/api/outlets/:id/settings`

### Source Tree Components

- **API Routes**: `apps/api/app/api/outlets/**/settings*`
- **Settings Logic**: Extend `apps/api/src/lib/settings.ts`
- **Database**: `packages/db/migrations/`

### Testing Standards

- Test outlet settings CRUD
- Test JSON value validation
- Test settings cascade (outlet overrides company defaults)
- Test tenant isolation
- Test company A cannot access company B outlet settings

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.7]
- [Source: Story 1.5 (company settings for cascade pattern)]
- [Source: AGENTS.md#Repo-wide-operating-principles]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List
