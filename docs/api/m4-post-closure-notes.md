<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# M4 Post-Closure Notes

Status: informational follow-up

M4 is closed for current scope. The items below are deferred technical hardening tasks and are not blockers for M4 completion.

## Deferred Follow-Ups

- `/api/sync/push` transactional hardening:
  - wrap insert + audit event + posting hook decision in one explicit DB transaction per accepted transaction.
  - owner: API
- POS->GL posting enablement:
  - current posting seam remains disabled/shadow by default.
  - define rollout switch, safety checks, and replay policy before enabling real journal posting.
  - owner: API + Accounting
