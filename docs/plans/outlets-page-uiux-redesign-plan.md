# Outlets Page UI/UX Redesign Plan

## Overview

Transform the Outlets (Branch Management) page from a basic CRUD interface into an operational dashboard that supports faster scanning, safer edits/deletes, clearer save intent, and better mobile ergonomics.

**Target File:** `apps/backoffice/src/features/outlets-page.tsx`  
**Design System:** Mantine (existing Backoffice visual language)  
**Backend Contract:** Unchanged — preserve current API behavior

---

## Current State

### Pain Points

| Category | Issue | Impact |
|----------|-------|--------|
| Information | No KPI/overview strip | Users can't quickly assess outlet health |
| Discoverability | No filtering besides search | Hard to find inactive outlets |
| Form UX | Single flat form, no sections | Dense, overwhelming modal |
| Feedback | Success messages persist forever | Clutters UI after action |
| Mobile | Standard modal, filters stack poorly | Poor touch experience |
| Actions | No disabled states during mutations | Risk of double-submit |

### What Works

- Company/user scoping logic
- Validation and error handling
- Delete confirmation flow
- Change detection (no-change short-circuit)

---

## Design Goals

1. **Operational visibility** — at-a-glance KPIs (total, active, inactive, filtered)
2. **Faster discovery** — status and city filters
3. **Safer interactions** — clear action states, disabled buttons during mutations
4. **Better form UX** — semantic sections, inline validation, unsaved-change guard
5. **Mobile-friendly** — fullscreen modal on narrow widths, stacked filters
6. **Cleaner feedback** — dismissible alerts, auto-dismiss success

---

## Implementation Plan

### Patch Set 1: Information Architecture

**File:** `apps/backoffice/src/features/outlets-page.tsx`

Split page into three clear layers:

1. **Top Controls** — company select (if admin), search, status filter, city filter, create button
2. **KPI Strip** — show counts: Total / Active / Inactive / Filtered
3. **Data Table Panel** — outlet list with improved columns

**Empty State:** When no outlets exist, show guided CTA:

```
┌─────────────────────────────────────────────┐
│  No branches yet                            │
│                                             │
│  Create your first branch to start          │
│  processing transactions.                   │
│                                             │
│  [Create Branch]                            │
└─────────────────────────────────────────────┘
```

---

### Patch Set 2: List UX + Discoverability

**File:** `apps/backoffice/src/features/outlets-page.tsx`

#### Filters

Add two new filters to `FilterBar`:

```typescript
// Status filter
<SegmentedControl
  data={[
    { value: 'ALL', label: 'All' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' }
  ]}
  value={statusFilter}
  onChange={(v) => setStatusFilter(v as 'ALL' | 'ACTIVE' | 'INACTIVE')}
/>

// City filter (derived from loaded outlets)
<Select
  placeholder="All cities"
  data={cityOptions}  // derived: [...new Set(outlets.map(o => o.city).filter(Boolean))]
  value={cityFilter}
  onChange={setCityFilter}
  clearable
  searchable
/>
```

#### Improved Table Columns

| Column | Current | Improved |
|--------|---------|----------|
| Active | Text with color | Badge: `<Badge color={isActive ? "green" : "gray"}>{isActive ? "Active" : "Inactive"}</Badge>` |
| Contact | Hidden | Compact: `<Text size="sm" c="dimmed">{phone ?? "—"} / {email ?? "—"}</Text>` |
| Timezone | Hidden | Visible: `<Text size="xs" c="dimmed">{timezone ?? "—"}</Text>` |

#### Row Actions

```typescript
import { ActionIcon, Tooltip, Badge } from "@mantine/core";

// Tooltip on buttons
<Tooltip label="Edit branch">
  <ActionIcon variant="light" onClick={() => openEditDialog(row.original)}>
    <IconPencil size={16} />
  </ActionIcon>
</Tooltip>

// Disable during mutation
<Button 
  loading={submitting} 
  disabled={submitting}
>
```

---

### Patch Set 3: Form Redesign

**File:** `apps/backoffice/src/features/outlets-page.tsx`

#### Semantic Sections

Split modal into logical groups:

```tsx
// Section 1: Branch Identity
<Divider label="Branch Identity" />
<TextInput label="Branch Code" ... />
<TextInput label="Branch Name" ... />
{dialogMode === "edit" && <Switch label="Active" ... />}

// Section 2: Contact & Address  
<Divider label="Contact & Address" />
<Group grow>
  <TextInput label="City" ... />
  <TextInput label="Phone" ... />
</Group>
<TextInput label="Address Line 1" ... />
<TextInput label="Address Line 2" ... />
<Group grow>
  <TextInput label="Postal Code" ... />
  <Select label="Timezone" ... />
</Group>
<TextInput label="Email" ... />
```

#### Inline Validation

- Validate on `onBlur` for better UX
- Show error immediately when field loses focus
- Disable submit button when form invalid

```typescript
const validateField = (field: keyof OutletFormData) => {
  // Field-specific validation
};

// On blur
<TextInput 
  onBlur={() => validateField('email')}
/>
```

#### Unsaved Changes Guard

```typescript
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [hasUnsavedChanges]);

// hasUnsavedChanges = JSON.stringify(formData) !== JSON.stringify(originalData)
```

---

### Patch Set 4: Feedback + Interaction Quality

**File:** `apps/backoffice/src/features/outlets-page.tsx`

#### Dismissible Alerts

```typescript
{successMessage && (
  <Alert 
    color="green" 
    withCloseButton 
    onClose={() => setSuccessMessage(null)}
  >
    {successMessage}
  </Alert>
)}

{error && (
  <Alert 
    color="red" 
    withCloseButton 
    onClose={() => setError(null)}
  >
    {error}
  </Alert>
)}
```

#### Auto-Dismiss Success

```typescript
import { useEffect } from "react";

useEffect(() => {
  if (successMessage) {
    const timer = setTimeout(() => setSuccessMessage(null), 5000);
    return () => clearTimeout(timer);
  }
}, [successMessage]);
```

#### Remove Redundant State Management

- Delete early-return `setSubmitting(false)` — rely on `finally` block:

```typescript
// BEFORE (redundant)
if (!hasChanges) {
  setSuccessMessage("No changes to save");
  closeDialog();
  setSubmitting(false);  // redundant
  return;
}

// AFTER (clean)
if (!hasChanges) {
  setSuccessMessage("No changes to save");
  closeDialog();
  return;
}
```

#### Button Loading States

Already implemented: `<Button loading={submitting}>` covers this.

---

### Patch Set 5: Mobile and Responsiveness

**File:** `apps/backoffice/src/features/outlets-page.tsx`

#### Responsive Modal

```tsx
<Modal
  opened={dialogMode !== null}
  onClose={closeDialog}
  fullScreen={window.innerWidth < 768}
  size={window.innerWidth < 768 ? "100%" : "lg"}
  // ...
>
```

#### Stacked Filters

In `FilterBar`, use responsive wrap:

```tsx
<Group gap="sm" align="flex-end" wrap="wrap">
  {/* Filters stack on mobile */}
</Group>
```

---

### Patch Set 6: Component Extraction (Optional)

For maintainability at scale, extract sub-components:

#### New Files

```
apps/backoffice/src/features/outlets/
├── components/
│   ├── OutletKpiStrip.tsx      # KPI badges
│   ├── OutletFormSections.tsx  # Reusable form sections
│   ├── OutletTableColumns.tsx  # Column definitions
│   └── OutletFilters.tsx       # Filter controls
├── hooks/
│   └── use-outlet-filters.ts   # Filter state logic
└── outlets-page.tsx            # Main page (simplified)
```

#### OutletKpiStrip.tsx

```typescript
type OutletKpiStripProps = {
  total: number;
  active: number;
  inactive: number;
  filtered: number;
};

export function OutletKpiStrip({ total, active, inactive, filtered }: OutletKpiStripProps) {
  return (
    <Group gap="xs">
      <Badge size="lg" variant="light">Total: {total}</Badge>
      <Badge size="lg" color="green" variant="light">Active: {active}</Badge>
      <Badge size="lg" color="gray" variant="light">Inactive: {inactive}</Badge>
      {filtered !== total && (
        <Badge size="lg" color="blue" variant="light">Filtered: {filtered}</Badge>
      )}
    </Group>
  );
}
```

#### OutletFormSections.tsx

```typescript
type OutletFormSectionsProps = {
  // ... props
};

export function OutletFormIdentitySection({ ... }) { ... }
export function OutletFormContactSection({ ... }) { ... }
```

---

## Acceptance Criteria

### Functional

- [ ] Create outlet works (API contract unchanged)
- [ ] Edit outlet works (including null-clearing)
- [ ] Delete outlet works with confirmation
- [ ] No-change edit shows "No changes to save" (already present)
- [ ] Status filter works: ALL / ACTIVE / INACTIVE
- [ ] City filter works: derived from loaded outlets
- [ ] Search filters by code, name, city (already present)

### Visual

- [ ] KPI strip shows total/active/inactive counts
- [ ] Active status shown as colored Badge
- [ ] Contact info (phone/email) visible in table
- [ ] Timezone visible in table
- [ ] Form split into semantic sections
- [ ] Success alerts auto-dismiss after 5s
- [ ] Error alerts stay until user dismisses
- [ ] Modal fullscreen on mobile

### Interaction

- [ ] Buttons disabled during mutation
- [ ] Unsaved changes guard on modal close
- [ ] No double-submit possible
- [ ] Tooltips on action buttons

### Responsive

- [ ] Filters stack on narrow widths
- [ ] Modal usable on touch devices
- [ ] Table horizontally scrollable

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/backoffice/src/features/outlets-page.tsx` | All patches |
| `apps/backoffice/src/features/outlets/components/OutletKpiStrip.tsx` | New (if Patch 6) |
| `apps/backoffice/src/features/outlets/components/OutletFormSections.tsx` | New (if Patch 6) |

---

## Dependencies

- `@mantine/core` — Badge, SegmentedControl, Tooltip, ActionIcon, Divider
- `@mantine/hooks` — useViewportSize (optional)
- `@tabler/icons-react` — IconPencil, IconTrash, IconPlus
- Existing: `useOutletsFull`, `createOutlet`, `updateOutlet`, `deleteOutlet`

---

## Testing Checklist

```bash
# TypeScript
npm run typecheck -w @jurnapod/backoffice

# Manual QA
# 1. Create outlet with all fields -> expect 201
# 2. Edit outlet, change nothing -> expect "No changes to save"
# 3. Edit outlet, change email to empty -> expect email cleared (null)
# 4. Filter by ACTIVE -> expect only active shown
# 5. Filter by city -> expect only that city shown
# 6. Delete outlet -> expect success message
# 7. Resize to mobile -> expect fullscreen modal
# 8. Submit with invalid email -> expect inline error
```

---

## Timeline Estimate

| Patch Set | Complexity | Estimate |
|-----------|------------|----------|
| 1 - Information Architecture | Low | 15 min |
| 2 - List UX | Medium | 30 min |
| 3 - Form Redesign | Medium | 45 min |
| 4 - Feedback Quality | Low | 15 min |
| 5 - Mobile | Low | 15 min |
| 6 - Extraction | High | 60 min (optional) |

**Total (without Patch 6):** ~2 hours  
**Total (with Patch 6):** ~3 hours

---

## Related Documents

- `docs/plans/branches-phase0-readiness-plan.md` — Original phase 0 plan
- `apps/backoffice/src/features/outlets-page.tsx` — Current implementation
- `packages/shared/src/schemas/outlets.ts` — API contracts (unchanged)
