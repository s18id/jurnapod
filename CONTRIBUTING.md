# Contributing

## Local quality checks

This repo enforces package import boundaries via ESLint (`no-restricted-imports`) as defined in [ADR-0014](docs/adr/ADR-0014-package-boundary-policy.md).

Run boundary lint across all workspaces before pushing:

```bash
npm run lint --workspaces --if-present
```

Recommended companion checks:

```bash
npm run typecheck --workspaces --if-present
npm run build
```

These same checks run in GitHub Actions on every `push` and `pull_request`.
