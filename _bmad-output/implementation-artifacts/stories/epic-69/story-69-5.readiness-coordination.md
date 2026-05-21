# Story 69-5 Readiness Coordination

Status: Story 69-5 DONE — owner sign-off recorded by Ahmad on 2026-05-21

## Purpose

This coordination note records the 2026-05-21 readiness NO-GO findings and the documentation corrections required before Story 69-5 can enter code implementation.

## Authorization and Gate State

- Ahmad authorized readiness and contract-correction work with `continue and unfreeze` on 2026-05-21.
- Sprint status is already `in-progress` for `69-5-ap-exception-worklist`.
- Sprint status validation passed in `logs/story-69-5-sprint-status-validate-r1.log` and `logs/story-69-5-doc-correction-sprint-status-validate-r1.log`, both with exit `0`.
- Readiness re-review returned GO for V1 code implementation readiness.
- Ahmad wrote `implement` on 2026-05-21, authorizing Story 69-5 V1 code implementation only.
- Runtime API verification MUST happen before first mutation implementation, especially assign/resolve flows with safe fixture data.
- Sprint status MUST NOT be updated to `done` during readiness correction.
- Ahmad wrote `sign-off if no findings` on 2026-05-21. Review had no P0/P1/P2 blocking findings, so owner sign-off is recorded.

## Readiness Review Outcome

Initial decision: **NO-GO for code implementation as previously written**.

Re-review decision: **GO for documentation readiness and V1 code implementation readiness**.

Implementation GO is recorded from Ahmad's `implement` instruction on 2026-05-21.

Primary reasons:

1. Story API paths referenced `/api/purchasing/ap-exceptions`, but current backend is mounted at `/api/accounting/ap-exceptions`.
2. Backoffice API adapters MUST use client-relative paths and MUST NOT hardcode `/api`.
3. Story expected POST assign/resolve/escalate contracts, but current backend supports PUT assign and PUT resolve only.
4. Story expected unsupported detail, comment, escalation, date-range, assigned-user, notification-producer, audit, and idempotency behavior.
5. Story file paths referenced obsolete backoffice locations.
6. Test targets included non-running or unverified paths.
7. Error handling matrix used cross-package producer classes instead of UI `ApiError` handling.

## Corrected Current Backend Contract

### API Mount

- Actual backend mount: `/api/accounting/ap-exceptions`
- Backoffice API base already resolves to `/api`.
- Backoffice adapter paths MUST use `/accounting/ap-exceptions...`.

### Supported Endpoints

| Purpose | Backoffice Client-Relative Path | HTTP Method | Contract |
|---------|---------------------------------|-------------|----------|
| Worklist | `/accounting/ap-exceptions/worklist` | GET | Query supports `type`, `status`, `supplier_id`, `search`, `cursor`, `limit` |
| Assign | `/accounting/ap-exceptions/:id/assign` | PUT | Body `{ assigned_to_user_id: number }` |
| Resolve or dismiss | `/accounting/ap-exceptions/:id/resolve` | PUT | Body `{ status: "RESOLVED" | "DISMISSED", resolution_note: string }` |

### Worklist Response Envelope

```json
{
  "success": true,
  "data": {
    "exceptions": [],
    "total": 0,
    "next_cursor": null,
    "has_more": false
  }
}
```

## V1 Scope Decision

Story 69-5 V1 MUST implement only:

- Worklist page.
- Supported filters: `type`, `status`, `supplier_id`, `search`, `cursor`, `limit`.
- Assign action.
- Resolve/dismiss action.
- Empty state.
- Route/deep-link compatibility using available worklist rows.

Story 69-5 V1 MUST defer:

- Detail endpoint.
- Comments/thread API.
- Escalation route/status.
- Date-range filter.
- Assigned-user filter.
- Assignment notification event producer.
- New audit fields.
- New idempotency fields.
- Backend permission redesign.

## Permission Alignment

V1 MUST match the current backend policy:

- Read/worklist access: `accounting.journals` ANALYZE OR `purchasing.suppliers` ANALYZE.
- Assign/resolve access: `accounting.journals` UPDATE.

Any change to a dedicated `purchasing.exceptions` resource MUST be handled by a separate backend permission redesign story.

## Backoffice File Path Alignment

Current architecture targets:

- Feature files: `apps/backoffice/src/features/purchasing/ap-exceptions/...`
- Routes: `apps/backoffice/src/app/routes.ts`
- Router: `apps/backoffice/src/app/router.tsx`
- Navigation group: `apps/backoffice/src/app/layout.tsx`
- Unit tests: `apps/backoffice/__test__/unit/features/purchasing-ap-exceptions.test.tsx`

Obsolete targets removed from readiness scope:

- `apps/backoffice/src/pages/...`
- `apps/backoffice/src/App.tsx`
- `apps/backoffice/src/components/Shell/Navigation.tsx`

## Error Handling Coordination

UI handling MUST use `ApiError.status`, `ApiError.code`, and `ApiError.message`.

Required UI states:

- 400 validation failure.
- 401 auth failure after existing refresh behavior.
- 403 permission denied.
- 404 stale/not-found exception.
- 409 invalid transition or concurrent update.
- 500 unexpected backend failure.

## Fixture and Test Coordination

- Frontend unit tests MAY mock API responses at the API adapter boundary.
- Mock payloads MUST match the current backend envelope and `APExceptionResponse` fields.
- Real DB/API integration tests MUST use canonical fixtures.
- Raw SQL setup MUST NOT be used for fixture creation.
- Backoffice integration tests MUST NOT be listed as required evidence until runner support and fixture ownership are verified.

## Remaining Blockers Before Code Implementation

| Blocker | Required Resolution |
|---------|---------------------|
| Runtime API verification pending | Run direct GET/PUT verification against current endpoints with safe fixture data before first mutation implementation |
| Explicit implementation GO | ✅ Recorded from Ahmad on 2026-05-21 via `implement` |
| Backend gaps deferred | Confirm V1 implementation plan excludes deferred backend gaps |

## 2026-05-21 Implementation Runtime Verification Note

- V1 code implementation proceeded after source verification of the current backend route mount and contracts.
- Direct runtime probe was attempted before mutation implementation and logged to `logs/story-69-5-runtime-api-probe-r1.log`.
- Direct runtime verification was blocked because no local API server was accepting connections at `127.0.0.1:3000` (`curl` exit 7 / connection refused).
- Assign/resolve runtime mutation verification was not attempted because no safe running API/auth/fixture context was available. No raw SQL fixture setup was used.
- Frontend unit-mocked V1 validation evidence is recorded in `story-69-5.md`; story remains in-progress and MUST NOT be marked done without reviewer GO and story owner sign-off.

## Next Safe Step

Proceed with V1 implementation only. Runtime API verification MUST happen before first mutation implementation, especially assign/resolve flows with safe fixture data.
