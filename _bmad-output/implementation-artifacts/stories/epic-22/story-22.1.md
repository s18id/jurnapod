# Story 22.1: Re-home Core Posting Contract to Modules-Accounting

**Status:** done  
**Epic:** Epic 22  
**Story Points:** 3  
**Priority:** P1  
**Risk:** HIGH  
**Assigned:** bmad-agent-dev

---

## Overview

Move posting abstractions currently exported by `@jurnapod/core` into `@jurnapod/modules-accounting` so consumers can migrate without behavior changes.

## Acceptance Criteria

- [x] `@jurnapod/modules-accounting` exports posting contract previously consumed from `@jurnapod/core`.
- [x] Posting type signatures and runtime behavior remain unchanged.
- [x] No accounting logic regressions introduced in this story.

## Expected Files

- `packages/modules/accounting/src/index.ts`
- `packages/modules/accounting/src/*` (as needed for posting export location)

## Validation (Story)

- [x] `npm run typecheck -w @jurnapod/modules-accounting`
- [x] `npm run build -w @jurnapod/modules-accounting`
