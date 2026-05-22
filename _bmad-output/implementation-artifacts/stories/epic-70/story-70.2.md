# Story 70.2: Internationalization Framework and English/Indonesian Locale Packs

Status: backlog

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`, use `npx tsx scripts/update-sprint-status.ts --epic 70 --story 70-2 --title internationalization-framework-and-english-indonesian-locale-packs --status <status>` and run `npx tsx scripts/validate-sprint-status.ts --epic 70` after the update.

## Story

As a **backoffice user operating in English or Indonesian**,  
I want **the backoffice UI to use locale packs and locale-aware formatters**,  
So that **navigation, validation, notifications, dates, numbers, and currency are understandable and consistent**.

## Context

This story implements the first i18n framework for the redesigned backoffice. It does not add domain features. It externalizes UI strings and establishes English (`en`) and Indonesian (`id`) locale packs.

## Test Scenario Review Checkpoint (MANDATORY)

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| English locale renders critical labels | Happy | Unit/component test |
| Indonesian locale renders critical labels | Happy | Unit/component test |
| Locale switch updates `document.documentElement.lang` | Happy | Unit/component test |
| IDR currency formats with Indonesian separators and symbol placement | Happy | Unit test |
| Missing translation key blocks validation | Error | Unit or script test |

**Sign-off:** Test scenarios MUST be reviewed before implementation begins.

## API Contract Verification (MANDATORY for UI Stories)

No new backend endpoints are in scope. Existing API error messages rendered by the UI MUST be mapped through safe translation boundaries without changing backend contracts.

## Acceptance Criteria

**AC1: English locale coverage**  
Given locale `en`, when critical navigation, table headings, forms, notifications, and validation messages render, then they display in English.

**AC2: Indonesian locale coverage**  
Given locale `id`, when critical navigation, table headings, forms, notifications, and validation messages render, then they display in Indonesian.

**AC3: Document language**  
Given the locale changes, when the locale provider applies the new locale, then `document.documentElement.lang` updates to the selected locale.

**AC4: Locale-aware currency**  
Given Indonesian locale is active, when IDR currency is displayed, then Indonesian separators and symbol placement are used.

**AC5: Missing key gate**  
Given missing translation keys exist, when the build/test gate runs, then it fails or emits a blocking diagnostic.

**AC6: Formatter unit coverage**  
Given date, money, decimal, percentage, and relative-time helpers are used, when unit tests run, then representative examples pass for `en` and `id`.

## Tasks / Subtasks

- [ ] Add locale provider at the app root.
- [ ] Add English and Indonesian message catalogs.
- [ ] Externalize strings from shell, navigation, admin, inventory, operations, purchasing, accounting, notifications, and validation surfaces.
- [ ] Add locale-aware formatters for date, number, currency, percentage, and relative time.
- [ ] Add missing-key detection gate.
- [ ] Add focused unit/component tests.

## Files to Modify

| File / Area | Action | Description |
|-------------|--------|-------------|
| `apps/backoffice/src/` | Modify/Create | Locale provider, catalogs, formatting helpers, UI string replacements |
| `apps/backoffice/__test__/unit/` or existing test locations | Modify/Create | i18n and formatter tests |
| `_bmad-output/implementation-artifacts/stories/epic-70/story-70.2.completion.md` | Create | Completion evidence |

## Estimated Effort

3–5 days

## Risk Level

Medium

## Dev Notes

- Business timestamps MUST remain epoch milliseconds at frontend logic boundaries.
- Native `Date` business logic MUST NOT be introduced.
- UI error text MAY map backend machine-readable codes to localized display text, but backend contract shape MUST NOT change.

## File List

- `_bmad-output/implementation-artifacts/stories/epic-70/story-70.2.md` (new)
