# Story 10.2: Reusable FilterBar Component

Status: backlog

## Story

As a frontend developer,
I want a configurable shared `FilterBar`,
So that filtering behavior is consistent across report and history pages.

## Acceptance Criteria

### AC 1: Consistent Filter Field Types

**Given** a page defines filter schema/config
**When** `FilterBar` renders
**Then** supported field types (text/select/date/range/status) behave consistently for input, validation, and reset
**And** query serialization is deterministic across pages

- [ ] Task 1: Define FilterSchema type with supported field types
- [ ] Task 2: Implement text filter input with debounce
- [ ] Task 3: Implement select filter with search
- [ ] Task 4: Implement date/range picker filter
- [ ] Task 5: Implement status filter with multi-select
- [ ] Task 6: Create query serialization utility

### AC 2: URL State and Request Contracts

**Given** users apply, clear, or combine filters
**When** requests are sent
**Then** request payload shape and URL state follow shared contracts
**And** invalid combinations are blocked with uniform, actionable error messaging

- [ ] Task 1: Create URL state sync hook (useFilters)
- [ ] Task 2: Define request payload schema (Zod)
- [ ] Task 3: Implement filter validation with error messages
- [ ] Task 4: Add clear all functionality
- [ ] Task 5: Test URL state restoration on reload

### AC 3: Accessibility Compliance

**Given** keyboard and screen-reader interaction
**When** users traverse and submit filter controls
**Then** label association, help/error text, and focus order satisfy WCAG 2.1 AA
**And** status changes (results updated/empty/error) are announced accessibly

- [ ] Task 1: Ensure all inputs have associated labels
- [ ] Task 2: Add aria-describedby for help text
- [ ] Task 3: Implement focus management on filter apply
- [ ] Task 4: Add live region for status announcements
- [ ] Task 5: Verify keyboard navigation order
- [ ] Task 6: Run WCAG 2.1 AA audit

### AC 4: Observability

**Given** filter operations run in production
**When** observability events are emitted
**Then** apply/clear/error latency and failure metrics are captured by page and filter type
**And** alerts trigger on sustained elevated filter-error rates

- [ ] Task 1: Add telemetry for filter apply/clear events
- [ ] Task 2: Capture latency per filter type
- [ ] Task 3: Create error rate dashboard
- [ ] Task 4: Configure alerts for error threshold

## Dev Notes

### Technical Approach

**Component Location:** `apps/backoffice/src/components/ui/FilterBar/`

**Filter Schema Definition:**
```typescript
interface FilterField {
  key: string;
  type: 'text' | 'select' | 'date' | 'daterange' | 'status';
  label: string;
  placeholder?: string;
  options?: SelectOption[];  // for select/status
  validation?: ZodSchema;
}

interface FilterSchema {
  fields: FilterField[];
  defaultValues?: Record<string, unknown>;
}
```

**URL State Contract:**
```
?filter_status=active,pending&filter_date_from=2024-01-01&filter_date_to=2024-01-31
```

### Dependencies

- Mantine UI (v7.x) - form components
- React Router - URL state
- Zod - validation schemas
- Sentry/opentelemetry - observability

### Test Approach

1. **Unit Tests:** Filter schema validation, serialization
2. **Component Tests:** User interactions, accessibility
3. **Integration Tests:** URL state sync, API request shape
4. **E2E Tests:** Full filter workflows with real data

### References

- Epic: `_bmad-output/planning-artifacts/epics-split/epic-10-backoffice-consistency-and-navigation-standards.md`
- Story 10.1: PageHeader (layout context)

### Related Stories

- Story 10.1: Reusable PageHeader Component
- Story 10.3: Standardized Table Interaction Patterns
- Story 10.4: Breadcrumb Navigation and UI Standards Documentation

---

## Dev Agent Record

*To be completed when story is implemented.*
