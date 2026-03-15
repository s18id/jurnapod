# Story 3.2: Manual Journal Entry Creation

Status: done

## Story

As an **accountant**,
I want to **create manual journal entries**,
So that **I can record non-POS financial transactions**.

## Acceptance Criteria

1. [x] AC1: Multiple debit/credit lines - Implemented in transactions-page.tsx
2. [x] AC2: Validation ensures debits equal credits - isBalanced check + API schema
3. [x] AC3: Error message prevents submission - Form validation + API returns 400
4. [x] AC4: Batch number and entry sequence - API returns JournalBatchResponse

## Tasks / Subtasks

- [x] Task 1: Backend API endpoint (AC: 1-4)
  - [x] POST /api/journals endpoint
  - [x] Zod validation for balanced entries
  - [x] Service layer integration
- [x] Task 2: Frontend form (AC: 1-3)
  - [x] Multiple line entry UI
  - [x] Real-time balance validation
  - [x] Error display
- [x] Task 3: Integration (AC: 4)
  - [x] API + frontend integration
  - [x] Batch response handling

## Dev Notes

### Existing Implementation

- **API Route**: `apps/api/app/api/journals/route.ts` - Full POST/GET endpoints
- **Service Layer**: `apps/api/src/lib/journals.ts` - createManualJournalEntry function
- **Frontend**: `apps/backoffice/src/features/transactions-page.tsx` - Complete form UI
- **Schema**: `packages/shared/src/schemas/journals.ts` - ManualJournalEntryCreateRequestSchema

### Architecture

- Uses JournalsService from @jurnapod/modules-accounting
- Auth: OWNER, ADMIN, or ACCOUNTANT role with journals:create permission
- Validates debits = credits via Zod schema refinement
- Returns JournalBatchResponse with batch ID and line sequence

## Dev Agent Record

### Agent Model Used

opencode-go/minimax-m2.5

### Debug Log References

N/A - Existing implementation, no issues found

### Completion Notes List

- Story 3.2 was already fully implemented in the codebase
- API endpoint accepts manual journal entries with balanced debit/credit lines
- Frontend provides form with real-time balance validation
- All ACs satisfied by existing implementation

### File List

- apps/api/app/api/journals/route.ts (existing)
- apps/api/src/lib/journals.ts (existing)
- packages/shared/src/schemas/journals.ts (existing)
- apps/backoffice/src/features/transactions-page.tsx (existing)
- apps/backoffice/src/hooks/use-journals.ts (existing)

---

## Implementation Notes (Retrieved from Code Analysis)

### Backend Implementation

**POST /api/journals** (`apps/api/app/api/journals/route.ts`)
- Accepts ManualJournalEntryCreateRequest
- Validates: company_id matches auth
- Validates: debits = credits (via schema)
- Creates journal batch with lines
- Returns JournalBatchResponse

**Schema** (`packages/shared/src/schemas/journals.ts`)
```typescript
ManualJournalEntryCreateRequestSchema = z.object({
  company_id: z.number().int().positive(),
  outlet_id: z.number().int().positive().nullable().optional(),
  client_ref: z.string().uuid().optional(),
  entry_date: z.string(),
  reference: z.string().max(100).optional(),
  description: z.string().max(500),
  lines: z.array(z.object({
    account_id: z.number().int().positive(),
    debit: z.number().nonnegative().default(0),
    credit: z.number().nonnegative().default(0),
    description: z.string().max(255)
  })).min(2).refine(
    (lines) => lines.every(line => 
      (line.debit > 0 && line.credit === 0) || 
      (line.credit > 0 && line.debit === 0)
    ), { message: "Each line must have either debit or credit, not both" }
  ).refine(
    (lines) => {
      const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
      const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);
      return Math.abs(totalDebit - totalCredit) < 0.01;
    },
    { message: "Total debits must equal total credits" }
  )
})
```

### Frontend Implementation

**TransactionsPage** (`apps/backoffice/src/features/transactions-page.tsx`)
- Multiple line entry (add/remove lines)
- Real-time balance calculation
- Visual feedback for balanced/unbalanced state
- Template save/load functionality
- Form validation before submission

### Permissions

Required role: OWNER, COMPANY_ADMIN, ADMIN, or ACCOUNTANT
Module permission: journals:create
