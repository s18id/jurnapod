# story-23.5.2: Freeze package public APIs

## Description
Document and stabilize public exports for each migrated package with versioning guidance and anti-breaking-change policy.

## Acceptance Criteria

- [ ] Public exports for each migrated package are explicit and documented
- [ ] Contract doc includes versioning guidance and anti-breaking-change policy
- [ ] API adapters reference only public package exports

## Files to Modify

- `packages/*/src/index.ts` (export cleanup)
- `docs/tech-specs/api-detachment-public-contracts.md` (create)

## Dependencies

- story-23.5.1 (Deprecated implementations should be removed)

## Estimated Effort

3 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run typecheck -ws --if-present
npm run build -ws --if-present
```

## Notes

This establishes the public API contracts that other apps/packages will depend on. Be explicit about what is public vs internal.
