# AGENTS.md

## Scope
API server rules for auth, validation, posting triggers, persistence safety, and sync endpoints.

## Review guidelines

### Priority
- Be strict on correctness, validation, authorization, idempotency, and transaction boundaries.
- Be light on naming or formatting unless they obscure business rules.

### Auth and access control
- Flag any route or mutation that does not enforce authentication correctly.
- Flag any data access path that does not enforce `company_id` scoping.
- Flag missing `outlet_id` scoping where outlet-specific resources are involved.
- Verify OWNER / ADMIN / ACCOUNTANT / CASHIER boundaries remain enforced.

### Input validation
- Flag missing Zod validation for request bodies, params, query strings, sync payloads, and import payloads.
- Flag permissive parsing that can allow invalid monetary or accounting state into the system.
- Prefer explicit validation errors over silent coercion.

### Accounting and posting
- Verify POSTED or COMPLETED flows cannot bypass required journal creation when the feature path expects posting.
- Flag any path where posting can partially succeed or leave inconsistent batch/line state.
- Verify posting-related writes stay inside one DB transaction when business invariants require atomicity.

### POS sync
- Review `/sync/push` with extra scrutiny.
- Treat duplicate-creation risk around `client_tx_id`, retry handling, resend handling, or race conditions as P1.
- Verify duplicate payloads cannot create duplicate financial effects.
- Verify per-transaction outcomes remain explicit, such as `OK`, `DUPLICATE`, or `ERROR`.
- Verify sync journal posting mode behavior is intentional and does not silently corrupt accounting state.

### Reports and settings
- Flag report implementations that bypass journals as the financial source of truth.
- Flag settings endpoints that allow unsafe cross-company or cross-outlet access.
- Verify module enablement and tax defaults remain properly scoped.

### Testing expectations
- Expect tests when changing:
  - auth / RBAC
  - `/sync/push`
  - `/sync/pull`
  - posting endpoints
  - settings/config endpoints
  - report query logic