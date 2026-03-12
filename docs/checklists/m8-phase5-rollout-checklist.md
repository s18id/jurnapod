# M8 Phase 5 Rollout Checklist

## A. Pre-Go-Live

- [ ] Migrations `0083`-`0087` applied in staging and rerun-safe
- [ ] MySQL and MariaDB compatibility verified
- [ ] Posting regression tests pass
- [ ] ACL integration tests pass
- [ ] Rollback owner and on-call owner assigned

## B. Configuration Readiness

- [ ] `PAYMENT_VARIANCE_GAIN` configured per company
- [ ] `PAYMENT_VARIANCE_LOSS` configured per company
- [ ] Active tax rates have liability `account_id`
- [ ] Cash/bank accounts correctly classified
- [ ] Fiscal period open policy confirmed for planned backdated posts

## C. Wave Execution

### Wave 1
- [ ] Pilot cohort selected
- [ ] 24h monitoring completed
- [ ] No P0/P1 incidents

### Wave 2
- [ ] Low-risk cohort selected
- [ ] 24-48h monitoring completed
- [ ] No unresolved correctness issues

### Wave 3
- [ ] Broad rollout approved
- [ ] Enablement completed

## D. Monitoring and Incident Control

- [ ] `journal_unbalanced_count` observed and zero
- [ ] `duplicate_post_attempt_count` within expected bounds
- [ ] `tax_account_missing_count` reviewed with finance ops
- [ ] `cash_bank_post_failures_by_type` reviewed by type
- [ ] Incident template and escalation path validated

## E. Final Sign-Off

- [ ] Backend sign-off
- [ ] QA sign-off
- [ ] DevOps sign-off
- [ ] Finance ops sign-off
- [ ] Product sign-off
