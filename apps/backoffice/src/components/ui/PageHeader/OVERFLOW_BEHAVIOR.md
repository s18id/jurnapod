# PageHeader Overflow Behavior Standards

## Overview

The `PageHeader` component handles content overflow according to these documented standards to ensure consistent layout behavior across all backoffice pages.

## Truncation Behavior

### Title Truncation

- **Threshold**: Titles exceeding **80 characters** are truncated with an ellipsis (`...`)
- **Full Text Access**: The complete title is available via the HTML `title` attribute, which displays on hover
- **Implementation**: Uses `text-overflow: ellipsis`, `white-space: nowrap`, and `overflow: hidden` CSS properties

```typescript
// Example: Long title gets truncated
const longTitle = "User Management System - Account Configuration and Security Settings Panel";
// Renders as: "User Management System - Account Configuration and Security Set..." (80 chars + ellipsis)
// Full text available via title attribute
```

### Subtitle Truncation

- **Behavior**: Same as title - ellipsis after overflow
- **Full Text Access**: `title` attribute provides full subtitle on hover
- **Styling**: Uses Mantine's `c="dimmed"` for visual distinction

### Action Buttons

- **Overflow Handling**: Actions wrap to multiple lines using `flexWrap: "wrap"`
- **Responsive Layout**:
  - Desktop/Tablet: Actions display inline to the right of the title
  - Mobile: Actions stack below the title at full width
- **Layout Stability**: Maintained through consistent spacing with Mantine's `gap` props

## Layout Stability

### Loading/Skeleton States

The skeleton state preserves exact layout dimensions to prevent content shift:

| Element | Skeleton Height | Width |
|---------|-----------------|-------|
| Title | 32px | 60% |
| Subtitle | 16px | 40% |
| Action buttons | 36px | 80px each |

### Responsive Breakpoints (Mantine v7)

| Breakpoint | Value | Behavior |
|------------|-------|---------|
| xs | 0 | Mobile layout (stacked) |
| sm | 36em (576px) | Tablet+ layout (inline) |
| md | 48em (768px) | Desktop layout |
| lg | 62em (992px) | Large desktop |
| xl | 75em (1200px) | Extra large |

### Breadcrumb Visibility

- **Mobile (< 576px)**: Breadcrumbs hidden entirely
- **Tablet+ (≥ 576px)**: Breadcrumbs visible above title

## Accessibility Considerations

### Focus States (WCAG 2.1 AA)

Breadcrumb links include explicit focus styling:
- **Outline**: 2px solid brand color
- **Offset**: 2px
- **Radius**: 2px

This ensures keyboard navigation users can clearly identify focused elements.

### Screen Reader Experience

- Breadcrumb separators (`/`) are marked `aria-hidden="true"` to prevent redundant announcements
- Current page item has `aria-current="page"` attribute
- Action buttons are wrapped in a `role="group"` with `aria-label="Page actions"`

## CSS Properties Reference

### Title Container
```css
{
  fontSize: "1.75rem",
  fontWeight: 600,
  lineHeight: 1.2,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
}
```

### Actions Container
```css
{
  display: "flex",
  gap: "0.5rem",
  flexWrap: "wrap",
  overflow: "hidden"
}
```

## Best Practices

1. **Keep titles concise**: Aim for titles under 80 characters
2. **Descriptive breadcrumbs**: Use clear, concise breadcrumb labels
3. **Action naming**: Use verb-first button labels (e.g., "Add User" not "User Add")
4. **Test responsive**: Verify layout at mobile, tablet, and desktop sizes
