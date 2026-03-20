## Completion Evidence

### Files Created/Modified

- `apps/backoffice/src/features/reservation-calendar-page.tsx`
- `apps/backoffice/src/features/reservation-calendar-page.test.ts`
- `apps/backoffice/src/hooks/use-reservation-calendar.ts`
- `apps/backoffice/src/hooks/use-reservation-calendar.test.ts`
- `apps/backoffice/src/hooks/use-reservations.ts`
- `apps/backoffice/src/hooks/use-reservations.test.ts`
- `apps/backoffice/src/features/feature-settings-page.tsx`
- `apps/backoffice/src/features/companies-page.tsx`
- `apps/backoffice/src/features/outlets-page.tsx`
- `apps/backoffice/src/constants/timezones.ts`
- `apps/backoffice/src/lib/session.ts`
- `apps/backoffice/src/hooks/use-companies.ts`
- `apps/backoffice/src/tests/all.test.ts`
- `apps/api/app/api/reservations/route.ts`
- `apps/api/app/api/settings/company-config/route.ts`
- `apps/api/app/api/settings/config/route.ts`
- `apps/api/app/api/companies/route.ts`
- `apps/api/app/api/companies/[companyId]/route.ts`
- `apps/api/src/lib/auth.ts`
- `apps/api/src/lib/outlet-tables.ts`
- `apps/api/src/lib/outlet-tables.test.ts`
- `apps/api/src/lib/reservations.test.ts`
- `packages/shared/src/schemas/reservations.ts`
- `packages/shared/src/schemas/settings.ts`
- `packages/shared/src/schemas/companies.ts`
- `packages/db/scripts/audit-orphan-reservations.sql`
- `packages/db/scripts/run-sql-script.mjs`

### Validation Gates

- ✅ `npm run test -w @jurnapod/backoffice`
- ✅ `npm run typecheck -w @jurnapod/backoffice`
- ✅ `npm run lint -w @jurnapod/backoffice`
- ✅ `npm run test:unit -w @jurnapod/api`
- ✅ `npm run typecheck -w @jurnapod/api`
- ✅ `npm run lint -w @jurnapod/api`

### Key Outcomes

- Day mode now renders hourly timeline with strict API boundary handling.
- Week mode remains overview-only and preserves action flows.
- Timezone policy is strict outlet/company resolution with visible source indicator.
- Company timezone is editable in UI and used by reservation calendar fallbacks.
- Null reservation duration now resolves from configurable company default.
- Reservations hook now parses API envelope defensively and skips malformed rows safely.

### Known Follow-up

- Story status is `review`; final promotion to `done` should occur after explicit BMAD review closure.
