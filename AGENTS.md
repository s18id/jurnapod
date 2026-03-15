# AGENTS.md

Important:
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

## Database compatibility
- All schema and migration SQL must run on both MySQL 8.0+ and MariaDB.
- Keep migrations rerunnable/idempotent because MySQL-family DDL is non-atomic.
- Avoid MySQL/MariaDB syntax drift in migrations (for example, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is not portable across engines/versions).
- For additive rerunnable DDL, prefer `information_schema` existence checks plus guarded dynamic `ALTER TABLE` statements.

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
- For API integration tests, expect API-driven setup/mutations; DB only for cleanup/read-only verification.
- Flag new code paths that filter `audit_logs` by `result` instead of `success`.

## AI Model Configuration

BMAD uses the following model strategy:
- **Primary**: `opencode-go/minimax-m2.5` (your OpenCode Go subscription)
- **Code tasks**: `openai/gpt-5.1-codex-mini` (best for code generation)
- **Complex reasoning**: `anthropic/claude-3-5-sonnet-20241022` (when needed)

Model mappings are configured in `_bmad/_config/agent-models.yaml`.
Default model is set in `_bmad/_config/ides/opencode.yaml`.

## Agent delegation

Delegate to specialized agents when tasks match their expertise:

| Task | Agent |
|------|-------|
| Code review | `bmad-code-review` |
| Write tests / test strategy | `bmad-testarch-*` |
| Create PRD | `bmad-create-prd` |
| Create architecture | `bmad-create-architecture` |
| Create UX design | `bmad-create-ux-design` |
| Break down requirements | `bmad-create-epics-and-stories` |
| Implement story | `bmad-dev-story` |
| Product management | `bmad-pm` |
| Market/domain research | `bmad-market-research` / `bmad-domain-research` |
| Retrospective | `bmad-retrospective` |
| Technical research | `bmad-technical-research` |
| Sprint status | `bmad-sprint-status` |
| Project documentation | `bmad-document-project` |

Use the `skill` tool to load the appropriate agent. If unsure what to do, use `bmad-help`.
