---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
inputDocuments: []
---

# jurnapod - Epic Breakdown

## Overview

This document provides the epic and story breakdown for jurnapod, focused on tooling standards and process improvements carried forward from Epics 33 and 34.

## Requirements Inventory

### Functional Requirements

FR1: The system must support dead code audit as a documented step in consolidation/extraction stories to prevent accumulating unused code
FR2: The system must document canonical permission bit values (READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32) in shared/package README
FR3: The system must provide a pre-reorganization tool standardization checklist for use before code reorganization work begins
FR4: The system must provide an automated import path update script to remap `../../../../lib/` relative paths to `@/` aliases during refactoring
FR5: The system must document database fixture standards covering setup, teardown, and naming conventions
FR6: The system must provide vitest alias configuration templates (e.g., `@/` path alias) for all packages in the monorepo
FR7: The system must document database cleanup hook patterns for integration tests (beforeAll/afterAll lifecycle)
FR8: The system must provide a lint rule unit test template for creating and validating custom ESLint rules

### NonFunctional Requirements

NFR1: All tooling scripts must be idempotent and safe to re-run
NFR2: Documentation must be immediately usable by developers without requiring additional context
NFR3: Templates must follow existing project conventions (AGENTS.md, existing patterns)

### Additional Requirements

- Epic 45 must not modify any production code — only process documentation, scripts, and templates
- All outputs should be suitable for developer onboarding (discoverable in docs/)
- E41-A7 (accessToken arg sunset) should be tracked separately as a P3 follow-up item

### UX Design Requirements

(none — this epic covers internal developer tooling only)

### FR Coverage Map

| FR | Requirement | Story |
|----|-------------|-------|
| FR1 | Dead code audit step in consolidation stories | 45.1 |
| FR2 | Permission bit canonical values in shared/README | 45.2 |
| FR3 | Pre-reorganization tool standardization checklist | 45.3 |
| FR4 | Automated import path update script | 45.4 |
| FR5 | Database fixture standards documentation | 45.5 |
| FR6 | Vitest alias config template for all packages | 45.6 |
| FR7 | DB cleanup hook patterns documentation | 45.7 |
| FR8 | Lint rule unit test template | 45.8 |

## Epic List

| Epic | Title | Status |
|------|-------|--------|
| Epic 45 | Tooling Standards & Process Documentation | done |

---

## Epic 45: Tooling Standards & Process Documentation

**Goal:** Complete the 6 open P2 action items from Epics 33 and 34, providing documented tooling standards, automation scripts, and process documentation that prevent debt accumulation in future consolidation work.

### Story 45.1: Dead Code Audit Step in Consolidation Stories

As a developer,
I want a documented dead code audit step in extraction/consolidation stories,
So that unused code is identified and removed during refactoring and does not accumulate as technical debt.

**Acceptance Criteria:**

**Given** an extraction or consolidation story is being executed,
**When** the adapter/implementation code is deleted after route flipping,
**Then** a dead code audit must be performed checking for:
- Any exported functions from the deleted module that are no longer referenced by any consumer
- Any type definitions that became orphaned after the deletion
- Any test files that only tested the deleted code (and should be removed)
**And** findings must be documented in the story completion report

**Given** dead code is found,
**When** the audit is complete,
**Then** the developer must either delete the orphaned code or create a tracked action item with owner and priority

---

### Story 45.2: Document Permission Bit Canonical Values in shared/README

As a developer,
I want the canonical permission bit values documented in `@jurnapod/shared/README.md`,
So that I can correctly interpret and implement ACL permissions without consulting multiple sources.

**Acceptance Criteria:**

**Given** a developer is implementing ACL permissions,
**When** they read `@jurnapod/shared/README.md`,
**Then** they must find a section titled "Canonical Permission Bits" that documents:
- READ = 1
- CREATE = 2
- UPDATE = 4
- DELETE = 8
- ANALYZE = 16
- MANAGE = 32
**And** includes the permission mask calculations (CRUD=15, CRUDA=31, CRUDAM=63)
**And** links to the ACL canonical model section in `AGENTS.md`

---

### Story 45.3: Pre-Reorganization Tool Standardization Checklist

As a release train engineer,
I want a pre-reorganization tool standardization checklist available before any code reorganization work,
So that teams follow consistent tooling standards and minimize ad-hoc tool creation.

**Acceptance Criteria:**

**Given** a developer is planning code reorganization,
**When** they consult the process documentation,
**Then** they must find a "Pre-Reorganization Tool Checklist" in `docs/process/tool-standardization-checklist.md` covering:
- ESLint rules to validate (no hardcoded IDs, no relative import paths)
- Vitest configuration requirements (alias paths, test directory structure)
- Import path conventions (`@/` alias enforcement)
- Test fixture usage requirements (library functions over raw SQL)
**And** the checklist is actionable without additional context

---

### Story 45.4: Automated Import Path Update Script

As a developer,
I want an automated script that remaps `../../../../lib/` relative paths to `@/` aliases during refactoring,
So that large-scale import path migrations are fast, consistent, and error-free.

**Acceptance Criteria:**

**Given** a developer is performing a large-scale refactor that moves code between directories,
**When** they run the import path update script,
**Then** the script must:
- Accept source and target directory paths as arguments
- Scan all `.ts` and `.tsx` files in the target directory
- Replace relative import paths that resolve to the source directory with `@/` aliases
- Preserve imports from external packages (`@jurnapod/*`, `node_modules`)
- Output a diff showing all changes before applying
- Be idempotent (safe to re-run with no changes on already-converted files)
**And** include usage instructions in `docs/process/tool-standardization-checklist.md`

---

### Story 45.5: Database Fixture Standards Documentation

As a developer,
I want database fixture standards documented,
So that I can create consistent, reliable test fixtures across all packages without bypassing domain invariants.

**Acceptance Criteria:**

**Given** a developer is writing integration tests,
**When** they consult the fixture standards,
**Then** they must find in `docs/testing/fixture-standards.md`:
- The canonical test fixture registry pattern (`createTestCompanyMinimal`, `createTestOutletMinimal`, etc.)
- Rules: when to use library functions vs raw SQL, when ad-hoc SQL is allowed (teardown, read-only verification only)
- Naming conventions for fixture functions (createTest* prefix)
- Lifecycle rules: `resetFixtureRegistry()` in `afterAll`, pool cleanup hooks required
- The `beforeAll` + cached `getSeedSyncContext()` pattern (zero-overhead wrapper)
**And** include examples from the canonical `apps/api/src/lib/test-fixtures.ts`

---

### Story 45.6: Vitest Alias Config Template for All Packages

As a developer,
I want a vitest alias configuration template that adds `@/` path alias support to all packages,
So that tests in any package can use the same import conventions as production code.

**Acceptance Criteria:**

**Given** a new package is being created or an existing package lacks `@/` path alias,
**When** the developer references the vitest config template,
**Then** they must be able to copy the alias configuration from `docs/templates/vitest-config-package.md` and apply it to their `vitest.config.ts`
**And** the template must show the exact `resolve.alias` entries for:
- `@/` → `<packageRoot>/src`
- `@jurnapod/*` → `<repoRoot>/packages/*/src`
**And** the template must include the standard test timeout configuration (testTimeout: 30000, hookTimeout: 30000, teardownTimeout: 10000)

---

### Story 45.7: DB Cleanup Hook Patterns Documentation

As a QA engineer,
I want database cleanup hook patterns documented,
So that integration tests reliably clean up database state and do not leave hanging connections or polluted data.

**Acceptance Criteria:**

**Given** a developer is writing integration tests with a real database,
**When** they consult the cleanup patterns documentation,
**Then** they must find in `docs/testing/cleanup-patterns.md`:
- The required `afterAll` cleanup calling `resetFixtureRegistry()` and pool cleanup
- The pattern for `beforeAll` with cached seed context
- How to handle cleanup when tests fail mid-execution (try/finally pattern)
- Tenant isolation cleanup (company_id/outlet_id scoping in DELETE statements)
- ACL cleanup rules: always scope by `company_id AND role_id` (never delete by role_id alone)
**And** include anti-pattern examples showing what happens without proper cleanup

---

### Story 45.8: Lint Rule Unit Test Template

As a developer,
I want a template for creating unit tests for custom ESLint rules,
So that custom lint rules are validated before introduction and do not regress.

**Acceptance Criteria:**

**Given** a developer is creating a new custom ESLint rule,
**When** they reference the lint rule unit test template,
**Then** they must find in `docs/process/tool-standardization-checklist.md` (or a linked template):
- A vitest-compatible test structure using `@typescript-eslint/rule-tester`
- Examples of valid and invalid code cases for a simple rule (no-floating-decimal, or similar)
- How to test both the rule implementation and the rule's meta schema
- The expected test file location (`__test__/unit/rules/` or similar)
**And** the template must be copy-paste ready with no additional context required

---

## Epic 45: Definition of Done

- [ ] All 8 stories implemented and documented
- [ ] All outputs discoverable in `docs/` (not buried in implementation)
- [ ] No production code modified
- [ ] Sprint retrospective captures any new action items
- [ ] `sprint-status.yaml` updated for Epic 45
