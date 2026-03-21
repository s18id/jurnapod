# Story 10.3: Standardized Table Interaction Patterns

Status: backlog

## Story

As a backoffice user,
I want consistent table behavior across high-traffic pages,
So that I can use lists without relearning controls each time.

## Acceptance Criteria

### AC 1: Consistent Table Controls

**Given** standardized pages use the table pattern
**When** users load, sort, paginate, select rows, or encounter empty/error states
**Then** controls, labels, and placements match the documented standard exactly
**And** retry/refresh affordances are always available for recoverable errors

- [ ] Task 1: Create DataTable component with standard layout
- [ ] Task 2: Implement sort controls with clear indicators
- [ ] Task 3: Implement pagination with page size selector
- [ ] Task 4: Implement row selection (checkbox)
- [ ] Task 5: Add empty state and error state variants
- [ ] Task 6: Add retry/refresh actions for errors

### AC 2: Deterministic State Transitions

**Given** server-side pagination and sorting are active
**When** filters or sort keys change
**Then** table state transitions are deterministic (including page reset rules)
**And** stale response races do not overwrite newer user intent

- [ ] Task 1: Implement request cancellation on new query
- [ ] Task 2: Add sequence numbers to track request order
- [ ] Task 3: Define page reset rules (filters change -> page 1)
- [ ] Task 4: Implement optimistic vs server state handling

### AC 3: Loading States and Performance

**Given** dense datasets and slow networks
**When** loading states are shown
**Then** skeleton/loading indicators prevent layout shift and preserve context
**And** perceived responsiveness stays within agreed UX thresholds for standard CRUD/list APIs

- [ ] Task 1: Create skeleton loader matching table layout
- [ ] Task 2: Implement loading overlay for background refreshes
- [ ] Task 3: Define skeleton dimensions (no layout shift)
- [ ] Task 4: Performance budget: p95 < 200ms for standard lists

### AC 4: Accessibility Compliance

**Given** accessibility conformance is tested
**When** users navigate tables via keyboard/screen readers
**Then** header associations, sortable-state announcements, row action semantics, and focus behavior meet WCAG 2.1 AA
**And** no interaction relies only on hover or pointer gestures

- [ ] Task 1: Implement proper table headers with scope
- [ ] Task 2: Add aria-sort for sortable columns
- [ ] Task 3: Make all actions keyboard accessible
- [ ] Task 4: Provide skip links and focus management
- [ ] Task 5: Test with screen reader (NVDA/VoiceOver)
- [ ] Task 6: Verify no hover-only interactions

## Dev Notes

### Technical Approach

**Component Location:** `apps/backoffice/src/components/ui/DataTable/`

**Table Features:**
- Column definitions with type, sortable, filterable flags
- Built-in pagination with page size options [10, 25, 50, 100]
- Row selection with batch actions support
- Skeleton loading state
- Empty state with illustration
- Error state with retry action

**Standard Control Placements:**
| Control | Placement |
|---------|-----------|
| Search | Top-left |
| Filters | Below search bar |
| Sort indicators | Column headers |
| Pagination | Bottom-right |
| Row actions | Rightmost column |
| Selection checkbox | Leftmost column |

### Dependencies

- Mantine Table - base table implementation
- TanStack Table - headless table logic
- React Query - server state management
- @tanstack/react-virtual - virtualization for large datasets

### Test Approach

1. **Unit Tests:** Sort, pagination, selection logic
2. **Component Tests:** Visual states, interactions
3. **Accessibility:** axe-core, keyboard navigation
4. **Integration:** API response handling, race conditions
5. **Performance:** Core Web Vitals for table interactions

### References

- Epic: `_bmad-output/planning-artifacts/epics-split/epic-10-backoffice-consistency-and-navigation-standards.md`
- UX Threshold: List API p95 < 200ms (per NFR)

### Related Stories

- Story 10.1: Reusable PageHeader Component
- Story 10.2: Reusable FilterBar Component
- Story 10.4: Breadcrumb Navigation and UI Standards Documentation

---

## Dev Agent Record

*To be completed when story is implemented.*
