# Report Accessibility Checklist

This checklist verifies that financial report pages in Jurnapod meet WCAG 2.1 AA accessibility standards.

## Pages Covered

- Trial Balance Report (`/#/reports/trial-balance`)
- General Ledger Report (`/#/reports/general-ledger`)
- Profit & Loss Report (`/#/reports/profit-loss`)
- Worksheet Report (`/#/reports/worksheet`)

## Pre-Flight Checks

- [ ] Page loads without keyboard traps
- [ ] Screen reader announces page title correctly
- [ ] Main content region is properly identified
- [ ] Skip link to main content exists (if applicable)

## Interactive Elements

### Filter Controls

- [ ] All filter inputs have associated `<label>` elements
- [ ] Date pickers have accessible name
- [ ] Outlet/Account selectors announce selected value
- [ ] Clear/Reset buttons are keyboard accessible
- [ ] Run/Generate report button is clearly identified

### Tables

- [ ] Table has `<caption>` or `aria-label` describing content
- [ ] All `<th>` elements have `scope` attribute
- [ ] Header cells are not in `<tbody>`
- [ ] Table can be navigated cell-by-cell with keyboard
- [ ] Sort controls have accessible labels

### Status Indicators

- [ ] Loading states use `aria-live="polite"` regions
- [ ] Error messages use `aria-live="assertive"` for critical errors
- [ ] Success/Error status is not conveyed by color alone
- [ ] Status text is programmatically determinable

## Keyboard Navigation

- [ ] Tab moves through interactive elements in logical order
- [ ] Shift+Tab moves backwards through elements
- [ ] Enter activates buttons and links
- [ ] Escape closes dropdowns/modals
- [ ] Arrow keys navigate within compound controls
- [ ] Focus indicator is visible (not only color change)
- [ ] Focus is never trapped unexpectedly

## Screen Reader Testing

- [ ] Page title accurately describes report type
- [ ] Filter section is announced as a group
- [ ] Table headers are announced with row/column info
- [ ] Totals/summaries are announced
- [ ] Empty states are announced clearly
- [ ] Error states are announced immediately
- [ ] Loading progress is announced

## Visual Requirements

### Color Contrast

- [ ] Normal text (14px and below): >= 4.5:1 contrast ratio
- [ ] Large text (18px bold or 24px+): >= 3:1 contrast ratio
- [ ] UI components and graphic objects: >= 3:1 contrast ratio
- [ ] Color is not the only means of conveying information

### Text Scaling

- [ ] Content readable at 200% zoom without horizontal scroll
- [ ] No text truncation at 200% zoom
- [ ] Layout adapts to increased text size

## Form Validation

- [ ] Invalid inputs have `aria-invalid="true"`
- [ ] Error messages reference the field
- [ ] Error summary available at top of form (if multiple errors)
- [ ] Successful validation is announced

## Testing Tools

### Automated Testing (Axe)

Run axe accessibility scan:
```javascript
const results = await new AxeBuilder({ page }).analyze();
const criticalViolations = results.violations.filter(
  v => (v.impact === "critical" || v.impact === "serious")
);
expect(criticalViolations).toHaveLength(0);
```

### Manual Testing Checklist

1. Navigate entire page using keyboard only
2. Test with screen reader (NVDA/VoiceOver)
3. Zoom to 200% and verify readability
4. Check with color blindness simulator
5. Test in high contrast mode

## Common Issues and Fixes

### Issue: Missing Label on Date Input

**Bad:**
```html
<input type="date" />
```

**Good:**
```html
<label for="date-from">From Date</label>
<input type="date" id="date-from" name="date_from" />
```

### Issue: Color-Only Status Indicator

**Bad:**
```html
<span class="status success">Complete</span>
```

**Good:**
```html
<span class="status" aria-label="Status: Complete">
  <span class="icon success"></span>
  <span class="text">Complete</span>
</span>
```

### Issue: Table Without Headers

**Bad:**
```html
<table>
  <tr><td>Account</td><td>Debit</td><td>Credit</td></tr>
</table>
```

**Good:**
```html
<table aria-label="Trial Balance">
  <thead>
    <tr>
      <th scope="col">Account</th>
      <th scope="col">Debit</th>
      <th scope="col">Credit</th>
    </tr>
  </thead>
  <tbody>...</tbody>
</table>
```

### Issue: Live Region Not Announced

**Bad:**
```html
<div class="loading">Loading...</div>
```

**Good:**
```html
<div role="status" aria-live="polite" class="loading">
  Loading report data...
</div>
```

## References

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAIARIA/apg/)
- [axe-core Documentation](https://github.com/dequelabs/axe-core)
