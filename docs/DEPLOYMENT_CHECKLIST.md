# Invoice Payment Default - Deployment Checklist

## Pre-Deployment

### 1. Code Review
- [ ] Review all modified files for code quality
- [ ] Check for any console.log statements to remove
- [ ] Verify TypeScript types are correct
- [ ] Check for any commented-out code to clean up

### 2. Testing
- [x] Automated API test passes (`test-payment-defaults.mjs`)
- [ ] Manual UI testing in dev environment:
  - [ ] Settings: Configure invoice default
  - [ ] Settings: Try to set multiple defaults (should fail)
  - [ ] Settings: Change default from one method to another
  - [ ] Sales Payments: Create payment with default set
  - [ ] Sales Payments: Create payment without default (warning shown)
  - [ ] Sales Payments: Override default with manual selection
- [ ] Test on different browsers (Chrome, Firefox, Safari)
- [ ] Test on mobile/tablet (responsive)

### 3. Database Verification
- [x] Migration file syntax is correct
- [x] Migration applied successfully in dev
- [ ] Verify migration works on fresh database
- [ ] Test rollback procedure
- [ ] Check index performance with EXPLAIN

### 4. Integration Testing
- [ ] Test with existing outlet data
- [ ] Test with multiple outlets
- [ ] Test with multiple companies
- [ ] Test outlet switching behavior
- [ ] Verify sync does not break POS functionality

---

## Deployment Steps

### Phase 1: Database Migration (Staging)
```bash
# 1. Backup database
mysqldump -u root -p jurnapod > backup_before_default_flags.sql

# 2. Apply migration
mysql -u root -p jurnapod < packages/db/migrations/0027_outlet_payment_default_flags.sql

# 3. Verify migration
mysql -u root -p jurnapod -e "DESCRIBE outlet_payment_method_mappings;"

# Expected: is_invoice_default column exists with TINYINT(1) type
```

### Phase 2: API Deployment (Staging)
```bash
# 1. Build API
cd apps/api
npm run build

# 2. Run tests
npm test

# 3. Deploy to staging
# (deployment command depends on hosting setup)

# 4. Verify API endpoints
curl -X GET https://staging.api.jurnapod.com/api/outlet-payment-method-mappings?outlet_id=1 \
  -H "Authorization: Bearer $TOKEN"
```

### Phase 3: Frontend Deployment (Staging)
```bash
# 1. Build frontend
cd apps/backoffice
npm run build

# 2. Deploy to staging
# (deployment command depends on hosting setup)

# 3. Smoke test
# Visit https://staging.backoffice.jurnapod.com/settings/payment-methods
```

### Phase 4: Staging Validation
- [ ] Full manual test suite on staging
- [ ] Test with real-like data
- [ ] Performance testing
- [ ] Load testing (if applicable)
- [ ] User acceptance testing (UAT)

### Phase 5: Production Deployment
```bash
# 1. Schedule maintenance window (if needed)
# 2. Backup production database
# 3. Apply migration to production
# 4. Deploy API to production
# 5. Deploy frontend to production
# 6. Verify deployment
# 7. Monitor error logs for 24 hours
```

---

## Post-Deployment

### 1. Monitoring (First 24 Hours)
- [ ] Monitor API error rates
- [ ] Check database query performance
- [ ] Watch for any user-reported issues
- [ ] Verify no increase in support tickets

### 2. User Communication
- [ ] Send announcement email to users
- [ ] Update user documentation
- [ ] Create how-to guide/video
- [ ] Add to release notes

### 3. Metrics Tracking
- [ ] Track usage of invoice default feature
- [ ] Measure time saved (before/after)
- [ ] Collect user feedback
- [ ] Monitor adoption rate

---

## Email Template (User Announcement)

```
Subject: New Feature: Invoice Payment Default 🎉

Hi Team,

We're excited to announce a new time-saving feature for invoice payments!

What's New:
- You can now set a default payment account for invoice payments
- When creating a payment, your default account is automatically selected
- This saves you 2-3 clicks per payment entry

How to Use:
1. Go to Settings → Payment Methods
2. Check "Invoice Default" for your most-used payment method
3. Click "Save Payment Mappings"
4. Done! Now when you create invoice payments, your default account is pre-selected

Benefits:
✓ Faster payment entry
✓ Less repetitive clicking
✓ Fewer selection errors

Questions? Contact support@jurnapod.com

Happy accounting!
The Jurnapod Team
```

---

## Rollback Plan

### If Issues Are Detected

**Severity: Critical**
```bash
# 1. Immediate rollback of frontend
git revert <frontend-commit-hash>
npm run build && deploy

# 2. Immediate rollback of API
git revert <api-commit-hash>
npm run build && deploy

# 3. Leave database as-is (flag will be ignored)
# OR remove flag if needed:
mysql -u root -p jurnapod <<EOF
DROP INDEX idx_outlet_payment_invoice_default ON outlet_payment_method_mappings;
ALTER TABLE outlet_payment_method_mappings DROP COLUMN is_invoice_default;
EOF

# 4. Restore from backup if necessary
mysql -u root -p jurnapod < backup_before_default_flags.sql
```

**Severity: Minor**
- Monitor and fix in next release
- Add to bug tracker
- Communicate workaround to users

---

## Success Criteria

Feature is considered successfully deployed when:
- [x] All automated tests pass
- [ ] All manual tests pass
- [ ] No critical bugs reported in first 24 hours
- [ ] Users can configure invoice default
- [ ] Auto-selection works correctly
- [ ] Validation prevents multiple defaults
- [ ] Performance is acceptable (< 200ms API response)
- [ ] User feedback is positive

---

## Known Limitations

Document these for users:

1. **One Default Per Outlet**
   - Each outlet can only have one invoice default
   - Different outlets can have different defaults

2. **Manual Override Always Available**
   - Default is just a suggestion
   - Users can select any payable account manually

3. **No Automatic Updates**
   - If default payment method is deleted, no new default is set
   - User must configure new default manually

4. **No History Tracking**
   - System doesn't track when default was changed
   - Consider adding audit log in future

---

## Support Preparation

### Common Questions

**Q: How do I change the default?**
A: Go to Settings → Payment Methods, uncheck the current default, check a new one, and save.

**Q: Can I have multiple defaults?**
A: No, only one default per outlet. This ensures consistent behavior.

**Q: What if I delete the default payment method?**
A: The system will show a warning to configure a new default. You can continue without a default.

---

## Appendix: Static Pages (Privacy)

### Deployment Steps
- [ ] Apply `static_pages` migration (creates table + seeds `privacy`).
- [ ] Deploy API with public + admin static pages endpoints.
- [ ] Deploy backoffice with Static Pages admin and `/privacy` route.

### Verification
- [ ] Public privacy URL loads without auth: `https://jurnapod.signal18.id/privacy`
- [ ] Public API returns published page: `GET /api/pages/privacy`
- [ ] Unpublished pages return 404

**Q: Does this affect POS?**
A: No, cashiers still manually select payment methods in POS. This only affects backoffice invoice payments.

**Q: Can different users have different defaults?**
A: Not currently. The default is per outlet, not per user.

---

## Future Improvements Tracker

Ideas for future releases:

1. [ ] Add audit log for default changes
2. [ ] Add "Reset to most used" button
3. [ ] Support multiple context-specific defaults
4. [ ] Add visual indicator (star icon) in dropdowns
5. [ ] Track usage statistics per payment method
6. [ ] AI-suggested default based on patterns
7. [ ] Role-based defaults
8. [ ] Keyboard shortcut to use/change default

---

## Completion Signatures

- [ ] **Developer:** Implementation complete and tested
- [ ] **Code Reviewer:** Code reviewed and approved
- [ ] **QA:** All test cases pass
- [ ] **Product Owner:** Feature meets requirements
- [ ] **DevOps:** Deployment plan reviewed
- [ ] **Support:** Documentation and training complete

---

## Final Notes

- Estimated deployment time: 30 minutes
- Downtime required: None (zero-downtime deployment)
- Risk level: Low (additive feature, no breaking changes)
- User impact: Positive (time-saving feature)
- Rollback complexity: Low (simple revert)

**Ready for deployment:** ⬜ Yes | ⬜ No | ⬜ Needs review
