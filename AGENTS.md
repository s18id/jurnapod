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

## Import path conventions
- Use `@/` alias for imports from `apps/api/src/`
  - `@/lib/db` → `apps/api/src/lib/db`
  - `@/lib/auth-guard` → `apps/api/src/lib/auth-guard`
  - `@/lib/response` → `apps/api/src/lib/response`
- Do NOT use relative paths like `../../../../src/lib/` - they fail to resolve in some contexts.
- Example: `import { getDbPool } from "@/lib/db";`

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

### Test cleanup (CRITICAL)
- **All unit tests using `getDbPool()` must close the pool after completion.**
- Without cleanup, tests hang indefinitely.
- Required pattern:
  ```typescript
  // Close database pool after all tests
  test.after(async () => {
    await closeDbPool();
  });
  ```
- Flag any test file that uses database connections but lacks this cleanup hook.

## Definition of Done (MANDATORY)

**Before marking ANY story as DONE, the following MUST be completed:**

### Implementation Checklist
- [ ] All Acceptance Criteria implemented with evidence
- [ ] No known technical debt (or debt items formally created in sprint-status.yaml)
- [ ] Code follows repo-wide operating principles (see above)
- [ ] No breaking changes without cross-package alignment

### Testing Requirements
- [ ] Unit tests written and passing (show test output in completion notes)
- [ ] Integration tests for API boundaries
- [ ] Error path/happy path testing completed
- [ ] Database pool cleanup hooks present (see Test Cleanup section)

### Quality Gates
- [ ] Code review completed with no blockers
- [ ] AI review conducted (use `bmad-code-review` agent)
- [ ] Review feedback addressed or formally deferred

### Documentation
- [ ] Schema changes documented (if applicable)
- [ ] API changes reflected in contracts
- [ ] Dev Notes include files modified/created

### Production Readiness
- [ ] Feature is deployable (no feature flags hiding incomplete work)
- [ ] No hardcoded values or secrets in code
- [ ] Performance considerations addressed

### Completion Evidence
Story completion notes MUST include:
- List of files created/modified
- Test execution evidence (passing tests)
- Screenshots or logs for UI changes
- Any known limitations or follow-up work

**IMPORTANT**: A story marked "DONE" with incomplete items is technical debt. Debt compounds. Do it right or formally track it.

## AI Model Configuration

BMAD uses the following model strategy:
- **Primary**: `opencode-go/minimax-m2.5` (your OpenCode Go subscription) - 75% of agents
- **Context-critical**: `opencode-go/kimi-k2.5` (integration, orchestration, review) - 25% of agents  
- **Complex reasoning**: `anthropic/claude-3-5-sonnet-20241022` (architecture decisions) - 5% of agents
- **Code tasks**: `openai/gpt-5.1-codex-mini` (when available - currently exhausted)

**Current Week Status**: Codex tokens exhausted. All code tasks using kimi-k2.5 with decomposition pattern.

Model mappings are configured in `_bmad/_config/agent-models.yaml`.
Default model is set in `_bmad/_config/ides/opencode.yaml`.

## Agent Model Allocation Strategy

BMAD agents are distributed across three AI models for optimal cost-effectiveness:

### Model Tiers

| Model | Agents | Use Case | Cost |
|-------|--------|----------|------|
| **minimax-m2.5** | 30 (75%) | Narrow scope, standardized workflows, external data | Low |
| **kimi-k2.5** | 10 (25%) | Context-critical, integration, orchestration | Medium |
| **claude-3.5-sonnet** | 2 (5%) | Complex architectural decisions | High |

### Agent Assignments by Model

**minimax-m2.5** (Narrow Scope - 30 agents):
- Quick dev: `bmad-quick-dev`, `bmad-quick-flow-solo-dev`
- Testing: All `bmad-testarch-*`, `bmad-qa`, `bmad-qa-generate-e2e-tests`
- Research: `bmad-market-research`, `bmad-domain-research`, `bmad-technical-research`
- Utility: `bmad-shard-doc`, `bmad-index-docs`, `bmad-tech-writer`
- Analysis: `bmad-analyst`, `bmad-create-product-brief`, `bmad-brainstorming`
- UX: `bmad-ux-designer`, `bmad-create-ux-design`

**kimi-k2.5** (Context-Critical - 10 agents):
- Core: `bmad-master`, `bmad-party-mode`, `bmad-help`
- Dev: `bmad-dev`, `bmad-dev-story`
- Management: `bmad-pm`, `bmad-sm`, `bmad-retrospective`, `bmad-sprint-planning`, `bmad-sprint-status`, `bmad-correct-course`
- Documentation: `bmad-document-project`, `bmad-generate-project-context`
- Review: All `bmad-code-review`, `bmad-review-*`, `bmad-editorial-review-*`

**claude-3.5-sonnet** (Complex Reasoning - 2 agents):
- Architecture: `bmad-architect`, `bmad-create-architecture`

### Delegation Pattern for Development Work

**DO NOT** implement directly. Decompose and delegate:

1. **Break into narrow chunks** (2-4 hours each)
2. **Delegate to minimax agents** for implementation
3. **Review with kimi-k2.5** for integration and quality
4. **Iterate** on issues found

**Example - "Build notification service" (8h):**
- Delegate to `bmad-quick-dev`: "Create package structure" (30min)
- Delegate to `bmad-quick-flow-solo-dev`: "Implement SendGrid provider" (1.5h)
- Delegate to `bmad-quick-dev`: "Create template system" (1.5h)
- Delegate to `bmad-quick-flow-solo-dev`: "Add retry logic" (1h)
- Delegate to `bmad-dev`: "Create email templates" (1h)
- Delegate to `bmad-qa`: "Write tests" (1h)
- **Review with** `bmad-code-review`: Integration check (30min)

**Maximizes throughput**: 75% of work on cheapest model, quality assured by review.

### When to Use Each Tier

**Use minimax when:**
- Task is narrow and focused (< 4 hours)
- Clear acceptance criteria exist
- Standard patterns/templates apply
- External data sources involved
- Testing or documentation tasks

**Use kimi-k2.5 when:**
- Project context and history matter
- Integration between components
- Orchestrating multiple agents
- Story/epic creation and planning
- Code review (catches minimax issues)
- Critical business logic

**Use claude when:**
- Complex architectural trade-offs
- High-stakes design decisions
- Novel problem spaces
- Justifies token cost for quality

## Agent delegation

Use the `skill` tool to load the appropriate agent based on the model allocation above. If unsure what to do, use `bmad-help`.

### Development & Implementation

| When you need... | Use this agent |
|------------------|----------------|
| Implement a story (from spec) | `bmad-dev-story` |
| Quick code change / bug fix | `bmad-quick-dev` or `bmad-quick-dev-new-preview` |
| Solo dev on a task | `bmad-quick-flow-solo-dev` |
| Code review | `bmad-code-review` |
| Edge case review | `bmad-review-edge-case-hunter` |

### Requirements & Design

| When you need... | Use this agent |
|------------------|----------------|
| New feature requirements (PRD) | `bmad-create-prd` |
| Edit existing PRD | `bmad-edit-prd` |
| Validate PRD | `bmad-validate-prd` |
| Create architecture / tech design | `bmad-create-architecture` |
| Create UX design specs | `bmad-create-ux-design` |
| Break down requirements into stories | `bmad-create-epics-and-stories` |
| Quick tech spec | `bmad-quick-spec` |
| Product brief | `bmad-create-product-brief` |

### Testing & Quality

| When you need... | Use this agent |
|------------------|----------------|
| Test strategy / plan | `bmad-testarch-test-design` |
| Setup test framework | `bmad-testarch-framework` |
| Expand test coverage | `bmad-testarch-automate` |
| Acceptance tests (TDD) | `bmad-testarch-atdd` |
| Traceability matrix | `bmad-testarch-trace` |
| Review test quality | `bmad-testarch-test-review` |
| NFR assessment | `bmad-testarch-nfr` |
| Setup CI pipeline | `bmad-testarch-ci` |
| Generate e2e tests | `bmad-qa-generate-e2e-tests` |
| QA assistance | `bmad-qa` |

### Research & Analysis

| When you need... | Use this agent |
|------------------|----------------|
| Market research | `bmad-market-research` |
| Domain/industry research | `bmad-domain-research` |
| Technical research | `bmad-technical-research` |
| Sprint status | `bmad-sprint-status` |
| Sprint planning | `bmad-sprint-planning` |

### Product & Process

| When you need... | Use this agent |
|------------------|----------------|
| Product management | `bmad-pm` |
| Run retrospective | `bmad-retrospective` |
| Brainstorming / ideation | `bmad-brainstorming` |
| Correct course (sprint change) | `bmad-correct-course` |
| Check implementation readiness | `bmad-check-implementation-readiness` |

### Documentation

| When you need... | Use this agent |
|------------------|----------------|
| Document existing project | `bmad-document-project` |
| Generate project context | `bmad-generate-project-context` |
| Shard large document | `bmad-shard-doc` |
| Index docs folder | `bmad-index-docs` |
| Tech writing | `bmad-tech-writer` |
| Editorial review (prose) | `bmad-editorial-review-prose` |
| Editorial review (structure) | `bmad-editorial-review-structure` |

### Specialized

| When you need... | Use this agent |
|------------------|----------------|
| Master orchestrator | `bmad-master` |
| Analyst | `bmad-analyst` |
| Adversarial review | `bmad-review-adversarial-general` |
| Party mode (group discussion) | `bmad-party-mode` |
| Advanced elicitation | `bmad-advanced-elicitation` |
| Learn testing | `bmad-teach-me-testing` |
