# Fixed Assets UI/UX Revamp Plan

**Version:** 1.0  
**Status:** Ready for Implementation  
**Recommendation:** 2-pane workbench + right-side detail drawer (no route split)

---

## Executive Summary

The current Fixed Assets page (`fixed-assets-page.tsx`) is overcrowded — it stacks category creation, asset creation, category list, asset list, and multiple action modals into a single view. This creates cognitive overload and slows down core workflows.

This revamp treats UX as a first-class concern, not an afterthought. The goal: **make fixed-asset actions feel safe, explainable, and fast** for accounting users.

**Core Principles**
1. **Declutter first** — reduce on-screen density before adding features.
2. **Two-pane workflow** — asset list on left, detail drawer on right.
3. **Progressive disclosure** — show complexity only when needed.
4. **Safety before submit** — always show posting impact before confirmation.
5. **Auditability at a glance** — connect lifecycle events to journal references.

---

## UX North Star

> "Find an asset → Understand its current state → Perform an action safely → Verify the result."

### Primary User Journeys

| Journey | Target Steps | Success Signal |
|---------|--------------|----------------|
| Find asset by name/tag/outlet/status | 1–2 | Asset visible in <5s |
| Inspect asset (book value + lifecycle) | 1 | Timeline + book visible in drawer |
| Record acquisition | 3 (input → preview → confirm) | Event appears in timeline |
| Dispose asset safely | 3 (input → preview → confirm) | Gain/loss preview shown; journal linked |
| Verify result | 1 | Event + journal reference visible in toast + drawer |

---

## Recommended Layout

```
┌────────────────────────────────────────────────────────────────────────┐
│  🔍 Search...   [Outlet ▼]  [Status ▼]  [+ New Asset ▼]              │
├────────────────────────────────────────────┬───────────────────────────┤
│  ASSET LIST                                │  ASSET DETAIL (Drawer)    │
│  ┌─────┬──────────┬─────┬────────┬───────┐ │  Name: Dell Laptop       │
│  │ ID  │ Name     │ Tag │ Outlet │ Status│ │  Tag: FA-001            │
│  ├─────┼──────────┼─────┼────────┼───────┤ │  Status: Active          │
│  │ 1   │ Dell...  │ FA1 │ MAIN   │ Active│ │  ─────────────────────  │
│  │ 2   │ Truck... │ FA2 │ WAREH  │ Active│ │  BOOK SNAPSHOT          │
│  │ ... │ ...      │ ... │ ...    │ ...   │ │  Cost: Rp 10,000,000    │
│  └─────┴──────────┴─────┴────────┴───────┘ │  Depr: Rp 2,000,000    │
│                                               │  Carrying: Rp 8,000,000 │
│  Showing 12 assets                           │  ─────────────────────  │
│                                               │  LIFECYCLE              │
│                                               │  ✓ Acquisition 2024-01  │
│                                               │  ✓ Depreciation 2024-12 │
│                                               │  ─────────────────────  │
│                                               │  [Acquire] [Transfer]   │
│                                               │  [Impair]   [Dispose]   │
└────────────────────────────────────────────┴───────────────────────────┘
```

**Key Layout Decisions**
- **Top command bar**: Only search + filters + primary "New" action. No inline forms.
- **Left pane**: Asset worklist only — scrollable, sortable, filterable.
- **Right drawer**: Asset context — overview, book, timeline, actions. Opens on row click.
- **Modals**: Only for complex forms (acquisition, transfer, impairment, disposal) with step flow.

---

## Implementation Scopes

### Scope 1: Shell Declutter & 2-Pane Workbench

**Goal:** Remove inline create forms, add top command bar, set up 2-pane layout.

**Changes:**
- Create `features/fixed-assets/FixedAssetsPage.tsx` as shell.
- Add `FixedAssetsToolbar` with search, outlet filter, status filter, category filter, "New" dropdown.
- Replace inline "Create Category" and "Create Asset" cards with toolbar + modals.
- Add `AssetDetailDrawer` as right-side panel (default: closed).
- On row click → open drawer and load asset details.

**Acceptance:**
- [ ] Only search + filters visible in top bar
- [ ] Asset list fills main left pane
- [ ] Drawer opens on asset selection
- [ ] No stacked create forms on page load

---

### Scope 2: Component Architecture Split

**Goal:** Break monolith into maintainable, testable pieces.

**File Structure:**
```
features/fixed-assets/
├── FixedAssetsPage.tsx       # Shell + state orchestration
├── FixedAssetsToolbar.tsx    # Search, filters, new actions
├── AssetWorkbenchTable.tsx  # DataTable with columns + row actions
├── AssetDetailDrawer.tsx    # Right drawer wrapper
├── BookSnapshotCard.tsx    # Cost, depr, carrying amount display
├── LifecycleTimeline.tsx    # Event timeline with status badges
├── CategoryModal.tsx        # Create/edit category
├── AssetCreateModal.tsx     # Create new asset
└── forms/
    ├── AcquisitionModal.tsx    # Step: input → preview → confirm
    ├── TransferModal.tsx
    ├── ImpairmentModal.tsx
    └── DisposalModal.tsx
```

**Acceptance:**
- [ ] No file > 300 lines
- [ ] Each component has single responsibility
- [ ] Reuses `DataTable`, `PageCard`, `Modal` from shared library

---

### Scope 3: Detail Drawer & Book/Timeline

**Goal:** Give accountants immediate visibility into asset state.

**Drawer Sections:**
1. **Overview** — name, tag, serial, category, outlet, status
2. **Book Snapshot** — cost basis, accum depr, accum impairment, carrying amount
3. **Lifecycle Timeline** — chronological events with:
   - Event type badge (color-coded)
   - Event date
   - Status badge (POSTED/VOIDED)
   - Journal batch ID (clickable → opens journal in new tab or copy)
4. **Actions Panel** — buttons for Acquire/Transfer/Impair/Dispose (disabled based on state)

**UX Details:**
- Timeline sorted descending (newest first)
- Voided events visually muted but visible for audit
- "No events yet" empty state with hint to record acquisition

**Acceptance:**
- [ ] Drawer shows book values immediately after loading
- [ ] Timeline shows all events with journal reference
- [ ] Actions disabled appropriately (e.g., no dispose if already disposed)

---

### Scope 4: Lifecycle Action Modals (Step Flow)

**Goal:** Reduce form overload and posting errors.

**Modal Design (3 Steps):**

```
┌─────────────────────────────────────────────┐
│  Record Acquisition           Step 1/3      │
├─────────────────────────────────────────────┤
│  Date:        [DatePicker]                  │
│  Cost:        [NumberInput] Rp              │
│  Useful Life: [NumberInput] months          │
│  Salvage:     [NumberInput] Rp              │
│  Asset A/C:   [Select]                      │
│  Offset A/C:  [Select]                      │
│                                             │
│           [Cancel]  [Next →]                │
└─────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────┐
│  Record Acquisition           Step 2/3      │
├─────────────────────────────────────────────┤
│  POSTING PREVIEW                            │
│  ─────────────────                         │
│  Debit:  Fixed Asset      Rp 10,000,000    │
│  Credit: Cash/Bank         Rp 10,000,000   │
│                                             │
│  After posting:                             │
│  • Book cost basis: Rp 10,000,000          │
│  • Carrying amount: Rp 10,000,000          │
│                                             │
│           [← Back]  [Confirm & Post]        │
└─────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────┐
│  Record Acquisition           Step 3/3      │
├─────────────────────────────────────────────┤
│  ✓ Success                                 │
│                                             │
│  Event #42 recorded                         │
│  Journal Batch #201 posted                   │
│                                             │
│           [Close]  [View in Timeline]       │
└─────────────────────────────────────────────┘
```

**Dynamic Fields:**
- **Disposal**: SALE shows "Proceeds" + gain/loss fields; SCRAP hides proceeds.
- **Transfer**: Only asks for target outlet + date (zero-amount journal).

**Validation UX:**
- Inline errors: "Loss account required because disposal results in loss."
- Smart defaults: useful life from category, accounts from category mapping.

**Acceptance:**
- [ ] Each lifecycle action uses step modal
- [ ] Posting preview shows human-readable debit/credit summary
- [ ] Validation errors show problem + fix

---

### Scope 5: Error & Safety UX

**Goals:**
- Clear, actionable error messages.
- Explicit confirmation for destructive actions.
- Idempotency awareness.

**Implementation:**
- Use `ApiError` mapping: backend error code → localized message.
- Disposal/Void: add confirmation dialog with warning text.
- Duplicate/idempotent response: show "Already processed" banner + existing `event_id`.

**Example Error Mapping:**
| Backend Code | Display Message |
|-------------|-----------------|
| `INVALID_REQUEST` | "Check required fields" |
| `CONFLICT` | "Duplicate event; showing existing record" |
| `ASSET_ALREADY_DISPOSED` | "Cannot perform action; asset is already disposed" |
| `FORBIDDEN` | "You don't have access to this outlet" |

**Acceptance:**
- [ ] No generic "An error occurred" messages
- [ ] Duplicate requests show clear feedback
- [ ] Destructive actions require confirmation

---

### Scope 6: Mobile/Responsive

**Goals:**
- Core workflows usable on tablet/mobile.
- No horizontal scrolling chaos.

**Implementation:**
- Breakpoints:
  - Desktop (>1200px): 2-pane + full detail
  - Tablet (768–1200px): Collapsible detail drawer
  - Mobile (<768px): Full-screen detail instead of drawer
- Filters collapse into filter sheet/drawer on small screens.
- Table converts to card stack on mobile.

**Acceptance:**
- [ ] Find asset → open detail → execute action works on mobile
- [ ] No horizontal scroll on any viewport

---

### Scope 7: Visual & Content Polish

**Goals:**
- Consistent with backoffice design language.
- Clear hierarchy and spacing.

**Implementation:**
- Use existing `PageCard`, `DataTable` patterns.
- Mantine component library consistent with other backoffice pages.
- Microcopy improvements:
  - "Record Acquisition" instead of "Acquire"
  - "Posting Preview" instead of "Review"
  - "Carrying Amount" instead of "Value"

**Acceptance:**
- [ ] Matches backoffice visual rhythm
- [ ] No jarring layout shifts

---

## Verification Plan

### Functional Checks
- [ ] Search finds asset by name, tag, serial number
- [ ] Filters (outlet, status, category) narrow list correctly
- [ ] Sort by updated date/cost works
- [ ] Row click opens detail drawer
- [ ] Drawer shows book values + timeline
- [ ] Category create/edit modal works
- [ ] Asset create modal works
- [ ] Acquisition step flow works end-to-end
- [ ] Transfer step flow works end-to-end
- [ ] Impairment step flow works end-to-end
- [ ] Disposal step flow (SALE) works end-to-end
- [ ] Disposal step flow (SCRAP) works end-to-end
- [ ] Validation prevents invalid submissions
- [ ] Error messages show problem + fix
- [ ] Duplicate request shows "already processed" feedback

### Regression Checks
- [ ] Existing fixed-assets integration tests pass
- [ ] API contracts unchanged (backend behavior same)

### UX Checks
- [ ] Time to find asset < 5 seconds
- [ ] Steps to complete disposal ≤ 3
- [ ] No form errors on common happy paths
- [ ] Mobile layout usable for core tasks

---

## Migration Path

1. **PR 1 — Architecture & Shell**
   - Create component structure
   - Implement 2-pane layout
   - Wire up data fetching to existing APIs

2. **PR 2 — Detail Drawer & Timeline**
   - Book snapshot component
   - Lifecycle timeline with journal links
   - Action buttons with state logic

3. **PR 3 — Lifecycle Step Modals**
   - Acquisition modal with preview
   - Transfer/Impairment/Disposal modals
   - Validation + error UX

4. **PR 4 — Polish & Mobile**
   - Responsive adjustments
   - Error/safety UX final pass
   - Microcopy + visual hierarchy

---

## Out of Scope (Phase 2)

- Revaluation/surplus model
- Bulk asset operations
- Depreciation schedule view (existing feature works)
- PDF reports export

---

## Dependencies

- Mantine UI (already installed)
- `@tanstack/react-table` (already installed)
- Existing fixed-assets API contracts (unchanged)
- Shared schemas in `packages/shared/src/schemas/fixed-assets.ts`

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to find asset | < 5s |
| Steps to dispose | ≤ 3 |
| Form validation errors (happy path) | 0 |
| Time to complete acquisition | < 60s |
| Mobile task completion | ≥ 80% |
