# Story 9.4: Standard Filters and Modal UX Behavior

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **backoffice user**,
I want **immediate filters with "Clear All" and consistent modal behavior**,
So that **I can navigate and edit users faster with predictable interactions**.

## Acceptance Criteria

1. **Immediate Filter Updates with Clear All**
   - **Given** user management filter controls are visible
   - **When** any filter changes
   - **Then** results update immediately with debounced, deterministic query behavior
   - **And** `Clear All` resets every filter and URL query state in one action

2. **URL Query State Persistence**
   - **Given** filters are applied and the page is refreshed or shared
   - **When** the route is re-opened
   - **Then** filter state is restored from URL/query state
   - **And** restored state uses the same parsing/validation rules as live interactions

3. **Standardized Modal Behavior**
   - **Given** create/edit/assignment modals are used
   - **When** save/cancel/close actions occur
   - **Then** all modals follow one shared behavior for validation messaging, disabled loading states, and close semantics
   - **And** unsaved-change confirmation is enforced uniformly before dismissal

4. **Accessibility (WCAG 2.1 AA)**
   - **Given** modal and filter interactions are exercised via accessibility tools
   - **When** forms contain errors or async operations complete
   - **Then** errors and status updates are announced accessibly and focus moves predictably per WCAG 2.1 AA
   - **And** no critical operation depends on color alone

## Tasks / Subtasks

- [ ] Task 1 (AC: #1)
  - [ ] Subtask 1.1: Add "Clear All" button to FilterBar section
  - [ ] Subtask 1.2: Implement `clearAllFilters()` function that resets all filter state
  - [ ] Subtask 1.3: Debounce filter changes with 300ms delay (existing pattern in users-page.tsx line 744-752)

- [ ] Task 2 (AC: #2)
  - [ ] Subtask 2.1: Create `useUrlFilterState` hook for URL query parameter sync
  - [ ] Subtask 2.2: Serialize filter state to URL on change
  - [ ] Subtask 2.3: Deserialize URL params on mount/route change
  - [ ] Subtask 2.4: Validate parsed URL params against same rules as live interactions

- [ ] Task 3 (AC: #3)
  - [ ] Subtask 3.1: Create `useDirtyState` hook to track unsaved changes
  - [ ] Subtask 3.2: Add unsaved-changes confirmation Dialog component
  - [ ] Subtask 3.3: Standardize modal close handling (Escape key, backdrop click, X button)
  - [ ] Subtask 3.4: Apply disabled loading state pattern to all modal submit buttons

- [ ] Task 4 (AC: #4)
  - [ ] Subtask 4.1: Add `aria-live="polite"` region for success/error announcements
  - [ ] Subtask 4.2: Implement focus management: trap focus in modal, return focus on close
  - [ ] Subtask 4.3: Add `role="alert"` for validation error messages
  - [ ] Subtask 4.4: Ensure color is not sole indicator (use icons + text for status)

## Dev Notes

- **Location:** `apps/backoffice/src/features/users-page.tsx`
- **Components to create:**
  - `apps/backoffice/src/hooks/use-url-filter-state.ts` - URL sync hook
  - `apps/backoffice/src/hooks/use-dirty-state.ts` - Unsaved changes tracking
  - `apps/backoffice/src/components/dirty-confirm-dialog.tsx` - Unsaved changes modal
- **Existing patterns to follow:**
  - Debounce pattern: `users-page.tsx` lines 744-752 (300ms `setTimeout`)
  - FilterBar component: `apps/backoffice/src/components/FilterBar.tsx`
  - Modal from Mantine: `@mantine/core` Modal component used in users-page.tsx
- **Mantine hooks available:** `useDisclosure`, `useHotkeys`

### Filter State Analysis (Current)

Current filter state in `users-page.tsx` lines 270-276:
```typescript
const [searchTerm, setSearchTerm] = useState("");
const [searchQuery, setSearchQuery] = useState("");
const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
const [roleFilter, setRoleFilter] = useState<string>("all");
const [outletFilter, setOutletFilter] = useState<string>("all");
const [selectedCompanyId, setSelectedCompanyId] = useState<number>(user.company_id);
```

**Missing:**
- No "Clear All" button
- No URL query state persistence
- No validation of parsed URL params

### Modal State Analysis (Current)

Current modal handling in `users-page.tsx` lines 1039-1215:
- Uses Mantine `Modal` component
- `dialogMode` state drives modal content
- `submitting` state controls button loading
- `error` state displays error alerts
- **Missing:**
  - No unsaved-changes confirmation before close
  - No focus trap in modals
  - No aria-live announcements for success/error

### Project Structure Notes

- **Backoffice app:** `apps/backoffice/`
- **Components:** `apps/backoffice/src/components/`
- **Hooks:** `apps/backoffice/src/hooks/`
- **Features:** `apps/backoffice/src/features/`
- **Mantine version:** 7.x (from package.json)
- **React Router:** 6.x (from package.json)

### References

- Mantine Modal: https://mantine.dev/core/modal/
- Mantine hooks: https://mantine.dev/hooks/overview/
- WCAG 2.1 AA focus requirements: https://www.w3.org/WAI/WCAG21/Understanding/focus-trap
- TanStack Table (react-table): Already used in DataTable component

## Dev Agent Record

### Agent Model Used

minimax-m2.7 (opencode-go/minimax-m2.7)

### Debug Log References

N/A - Story creation only

### Completion Notes List

- Story file created with comprehensive implementation guidance
- Epic 9 status updated from "backlog" to "in-progress"
- Story 9-4 status set to "ready-for-dev"

### File List

**Files to CREATE:**
- `apps/backoffice/src/hooks/use-url-filter-state.ts`
- `apps/backoffice/src/hooks/use-dirty-state.ts`
- `apps/backoffice/src/components/dirty-confirm-dialog.tsx`

**Files to MODIFY:**
- `apps/backoffice/src/features/users-page.tsx`
- `apps/backoffice/src/components/FilterBar.tsx` (add Clear All support)
