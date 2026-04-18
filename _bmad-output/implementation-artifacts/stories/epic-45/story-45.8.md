# Story 45.8: Lint Rule Unit Test Template

**Epic:** Epic 45 — Tooling Standards & Process Documentation  
**Story ID:** 45-8-lint-rule-test-template  
**Status:** in-progress

---

## As a:
Developer

## I want:
A template for creating unit tests for custom ESLint rules

## So that:
Custom lint rules are validated before introduction and do not regress.

---

## Acceptance Criteria

**Given** a developer is creating a new custom ESLint rule,
**When** they reference the lint rule unit test template,
**Then** they must find in `docs/process/tool-standardization-checklist.md` (or a linked template):
- A vitest-compatible test structure using `@typescript-eslint/rule-tester`
- Examples of valid and invalid code cases for a simple rule (no-floating-decimal, or similar)
- How to test both the rule implementation and the rule's meta schema
- The expected test file location (`__test__/unit/rules/` or similar)
**And** the template must be copy-paste ready with no additional context required

---

## Implementation Notes

- Documentation only — no production code changes
- Template must be copy-paste ready
- Add to `docs/process/tool-standardization-checklist.md` as a new section or linked template