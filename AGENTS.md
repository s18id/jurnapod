# AGENTS.md

Important:
- Use `opencode-commit-agent` for committing.
- Use `codex-*` subagents if the invoker is from an OpenAI model.
- Use `claude-*` subagents if the invoker is from an Anthropic model.
- Never commit unless explicitly asked.

## Product
- Product: Jurnapod
- Tagline: From cashier to ledger.

## Repo-wide operating principles
- This is a modular ERP monorepo.
- Accounting/GL is the financial source of truth.
- POS is offline-first and must remain safe under retries and unstable networks.
- Shared contracts should stay aligned across apps and packages.
- Favor correctness, auditability, and tenant isolation over cosmetic cleanup.

## Review guidelines

### Severity
- Treat anything that can cause incorrect ledger balances, duplicate posting, duplicate POS transaction creation, tenant data leakage, or auth bypass as P0/P1.
- Treat missing validation on money movement, posting, sync, import, auth, or tenant/outlet scoping as P1.
- Treat missing or broken tests for critical accounting, sync, auth, or migration logic as P1 when the PR changes those areas.
- Ignore purely cosmetic issues unless they create a real correctness, readability, or maintainability risk.

### Global invariants
- Accounting/GL stays the center: final business documents must reconcile to journal effects.
- POS remains offline-first: write locally first, then sync via outbox.
- POS sync must remain idempotent via `client_tx_id`.
- Operational data must enforce `company_id`, and `outlet_id` where relevant.
- Finalized records should prefer immutable correction flows such as `VOID` and `REFUND`, not silent mutation.

### Contracts and validation
- Prefer shared TypeScript + Zod contracts in `packages/shared`.
- Flag breaking payload or schema changes that are not reflected across all affected apps/packages.
- Flag missing validation at API and sync boundaries.

### Money and persistence
- Do not use `FLOAT` or `DOUBLE` for money.
- Watch for unsafe rounding or hidden drift.
- Business-critical writes should be transactionally safe and auditable.

### Testing expectations
- Expect focused tests when changing:
  - accounting posting
  - POS sync
  - auth / tenant scoping
  - imports
  - migrations
  - financial reports