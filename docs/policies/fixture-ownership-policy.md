# Fixture Ownership Policy

## Purpose

This policy defines mandatory guardrails for test fixture setup to prevent parallel business-write paths and to keep domain invariants owned by their production package flows.

## Mandatory Rules

1. Test setup **MUST** use canonical owner-package flows for business invariants when such flows exist.
2. Test setup **MUST NOT** introduce ad-hoc business-write SQL in test files under `apps/api/__test__/**`.
3. Fixture libraries **MUST NOT** introduce parallel business-write paths for owner-domain invariants.
4. Inline source-code exceptions for owner-domain fixture writes **MUST NOT** be used to bypass this policy.
5. **NO EXCEPTION ALLOWED:** Owner-domain fixture flow violations are blocking and MUST be fixed by using canonical owner-package flow.
6. Agents and contributors **MUST NOT** modify this policy, the fixture-flow validator, or CI enforcement wiring unless explicitly requested by the user or story owner in the current task.

## Teardown-Only Escape Hatch

Write SQL in test files may be permitted only for teardown/cleanup and **MUST** be explicitly tagged:

```ts
// @fixture-teardown-allowed rationale="cleanup only"
```

Any setup-time write SQL in test files remains forbidden.

## Enforcement

Validation is enforced by `scripts/validate-fixture-flow.ts` and CI gate `npm run lint:fixture-flow`.
