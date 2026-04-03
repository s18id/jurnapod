# @jurnapod/modules-treasury

Treasury module for cash-bank domain logic extraction from the Jurnapod API.

## Overview

This package provides the cash-bank transaction domain logic, including:

- **Transaction Types**: MUTATION, TOP_UP, WITHDRAWAL, FOREX
- **CashBankService**: Create, post, void, list, and get operations
- **Journal Building**: `buildCashBankJournalLines` for posting
- **Port Interfaces**: Database access, auth, and fiscal year guards

## Public API

> **Note**: This package is under active development. Public API surface will expand as domain logic is extracted.

### Types

(To be added in Story 25.2)

### Services

(To be added in Story 25.3)

## Architecture

```
apps/api routes → modules-treasury → modules-accounting (PostingService)
                                → modules-platform (AccessScopeChecker port)
```

## Dependencies

- `@jurnapod/db` - Kysely database types
- `@jurnapod/shared` - Shared schemas and types
- `@jurnapod/modules-accounting` - PostingService for journal posting
- `@jurnapod/modules-platform` - AccessScopeChecker port

## Build & Validation

```bash
# Build
npm run build -w @jurnapod/modules-treasury

# Type check
npm run typecheck -w @jurnapod/modules-treasury

# Lint
npm run lint -w @jurnapod/modules-treasury
```

## Epic

Part of [Epic 25: Cash-Bank Domain Extraction](./docs/tech-specs/epic-25.md)

## Stories

- [25.1: Scaffold modules-treasury package](./docs/stories/epic-25/story-25.1.md)
- [25.2: Extract domain model, types, errors, helpers](./docs/stories/epic-25/story-25.2.md)
- [25.3: Implement CashBankService with create/post/void and API port adapters](./docs/stories/epic-25/story-25.3.md)
- [25.4: Add tests, update route adapter, validate full gate](./docs/stories/epic-25/story-25.4.md)
