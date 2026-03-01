<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Backoffice Mantine Theming Plan

## Goal
Refresh the backoffice UI by introducing Mantine + TanStack Table with multiple themes, while keeping existing business logic intact and ensuring compatibility with Capacitor WebView. Ensure layouts remain responsive on mobile and desktop.

## Scope
- Add Mantine + TanStack Table dependencies to the backoffice app.
- Implement two themes (Neutral and Cafe) with a shared layout scale.
- Persist theme preference in localStorage.
- Add a theme switcher under PWA Settings (Appearance section).
- Replace core layout shell with Mantine AppShell.
- Convert key report screens and shared components to the new theme tokens.
- Ensure responsive layout behavior for AppShell, tables, and filters.

## Non-Goals
- No API changes.
- No backend changes.
- No redesign of business logic flows.

## Dependencies
- @mantine/core
- @mantine/hooks
- @tanstack/react-table
- @fontsource/ibm-plex-sans
- @fontsource/newsreader

## Implementation Plan
1. Add dependencies in `apps/backoffice/package.json` and install.
2. Create a theme module in `apps/backoffice/src/app/theme.ts`:
   - Export theme variants: `neutral`, `cafe`.
   - Define colors, fonts, shadows, radius, and component defaults.
3. Bootstrap Mantine in `apps/backoffice/src/main.tsx`:
   - Import Mantine styles and fonts.
   - Read persisted theme from localStorage.
   - Wrap root with `MantineProvider`.
4. Replace layout in `apps/backoffice/src/app/layout.tsx`:
   - Use `AppShell`, `Navbar`, `Header`.
   - Move navigation into a left sidebar grouped by module.
   - Keep POS link, sync badge, and sign-out in header actions.
5. Add reusable UI primitives under `apps/backoffice/src/components`:
   - `PageCard` for standard section containers.
   - `FilterBar` for report filters and actions.
   - `StatTiles` for summary blocks.
   - `DataTable` wrapper using TanStack Table + Mantine Table/ScrollArea.
6. Update PWA Settings to include Appearance section:
   - Add theme selector (Neutral/Cafe).
   - Update theme state + persist to localStorage.
7. Make layout responsive:
   - Collapsible navbar on smaller widths.
   - Stack filter controls and actions for mobile.
   - Table containers scroll horizontally on small screens.
8. Refactor key screens first:
   - `apps/backoffice/src/features/auth/login-page.tsx`.
   - `apps/backoffice/src/features/reports-pages.tsx`.
   - `apps/backoffice/src/components/offline-page.tsx`.
   - `apps/backoffice/src/components/sync-notification.tsx`.
9. Review remaining pages for visual consistency and spacing.

## Files to Touch (Initial Pass)
- `apps/backoffice/package.json`
- `apps/backoffice/src/main.tsx`
- `apps/backoffice/src/app/theme.ts`
- `apps/backoffice/src/app/layout.tsx`
- `apps/backoffice/src/features/pwa-settings-page.tsx`
- `apps/backoffice/src/components/*` (new primitives)
- `apps/backoffice/src/features/auth/login-page.tsx`
- `apps/backoffice/src/features/reports-pages.tsx`

## Risks
- Visual changes are large and will replace existing inline CSS.
- Some tables are very dense; need to ensure readability and performance in WebView.

## Testing
- `npm run dev -- --filter @jurnapod/backoffice`
- Spot-check core pages: Login, Journals, General Ledger, PWA Settings.
- Confirm theme persists across reloads.
- Resize check at mobile widths (navbar collapse, table scroll, filter stacking).
