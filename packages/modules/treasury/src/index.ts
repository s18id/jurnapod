// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * @jurnapod/modules-treasury
 *
 * Treasury module for cash-bank domain logic extraction.
 *
 * ## Public API Summary
 *
 * (Story 25.2 - Domain types, errors, and helpers extracted)
 * (Story 25.3 - CashBankService with ports/adapters pattern)
 *
 * This package provides:
 * - Cash-bank transaction management (MUTATION, TOP_UP, WITHDRAWAL, FOREX)
 * - CashBankService with create/post/void operations
 * - Journal line building for cash-bank postings
 * - Port interfaces for database access, auth, and fiscal year guards
 *
 * ## Dependency Direction
 *
 * This package depends on:
 * - @jurnapod/modules-accounting (PostingService for journal posting)
 * - @jurnapod/modules-platform (AccessScopeChecker port)
 * - @jurnapod/db (Kysely types)
 * - @jurnapod/shared (shared schemas and types)
 *
 * ## Package Structure
 *
 * ```
 * packages/modules/treasury/
 * ├── src/
 * │   ├── index.ts              # Public API exports
 * │   ├── types.ts              # Domain types
 * │   ├── errors.ts             # Error classes
 * │   ├── helpers.ts            # Pure helper functions
 * │   ├── ports.ts              # Port interfaces (Story 25.3)
 * │   ├── journal-builder.ts    # Journal line builder (Story 25.3)
 * │   ├── posting.ts            # Posting mapper (Story 25.3)
 * │   └── cash-bank-service.ts  # Service class (Story 25.3)
 * ├── package.json
 * ├── tsconfig.json
 * ├── eslint.config.mjs
 * └── README.md
 * ```
 */

// -----------------------------------------------------------------------------
// Domain types (Story 25.2)
// -----------------------------------------------------------------------------

export type {
  CashBankType,
  CashBankStatus,
  CashBankTransaction,
  AccountClass,
  AccountInfo,
  CreateCashBankInput,
  CashBankListFilters
} from "./types.js";

export { CashBankTransactionTypeSchema, CashBankTransactionStatusSchema } from "@jurnapod/shared";

// -----------------------------------------------------------------------------
// Error classes (Story 25.2)
// -----------------------------------------------------------------------------

export {
  CashBankValidationError,
  CashBankStatusError,
  CashBankNotFoundError,
  CashBankForbiddenError
} from "./errors.js";

// -----------------------------------------------------------------------------
// Pure helper functions (Story 25.2)
// -----------------------------------------------------------------------------

export {
  toMinorUnits,
  normalizeMoney,
  isCashBankTypeName,
  classifyCashBankAccount,
  validateDirectionByTransactionType
} from "./helpers.js";

// -----------------------------------------------------------------------------
// Port interfaces (Story 25.3)
// -----------------------------------------------------------------------------

export type {
  MutationActor,
  AccountInfo as TreasuryAccountInfo,
  CashBankRepository,
  AccessScopeChecker,
  FiscalYearGuard,
  TreasuryPorts
} from "./ports.js";

// -----------------------------------------------------------------------------
// Journal builder (Story 25.3)
// -----------------------------------------------------------------------------

export { buildCashBankJournalLines, type BuildJournalLinesInput } from "./journal-builder.js";

// -----------------------------------------------------------------------------
// Posting mapper (Story 25.3)
// -----------------------------------------------------------------------------

export { CashBankPostingMapper, type TreasuryPostingRepository } from "./posting.js";

// -----------------------------------------------------------------------------
// CashBankService (Story 25.3)
// -----------------------------------------------------------------------------

export { CashBankService, type CashBankServiceOptions } from "./cash-bank-service.js";
