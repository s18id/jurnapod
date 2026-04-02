# story-23.1.2: Extract email templates to @jurnapod/notifications

## Description
Move email template rendering and link-builder functions from the API to the notifications package, enabling reuse across applications.

## Acceptance Criteria

- [ ] Template rendering and link-builder functions live in notifications package
- [ ] API mailer uses package exports; API-local duplicate helpers removed/deprecated
- [ ] Existing email payload contract remains unchanged

## Files to Modify

- `packages/notifications/src/templates/*` (create)
- `packages/notifications/src/link-builder/*` (create)
- `apps/api/src/lib/email-templates.ts` (adapter/removal)
- `apps/api/src/lib/email-link-builder.ts` (adapter/removal)
- `apps/api/src/lib/mailer.ts` (updated package usage)

## Dependencies

- story-23.0.2 (Lint rules must be in place)

## Estimated Effort

4 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run typecheck -w @jurnapod/notifications
npm run build -w @jurnapod/notifications
npm run test:unit:single -w @jurnapod/api src/lib/mailer.test.ts
```

## Notes

Maintain backward compatibility with existing email contracts. The notifications package should expose a clean public API for template rendering.
