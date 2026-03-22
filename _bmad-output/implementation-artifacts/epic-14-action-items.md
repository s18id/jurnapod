# Epic 14 Action Items - Code Review Follow-ups

**Generated:** 2026-03-22  
**Source:** BMAD Code Review findings  
**Epic:** Epic 14: Hono Full Utilization  

---

## CRITICAL PRIORITY (Fix Before Production)

### 🔥 AUTH-001: Fix sync/health.ts auth middleware ordering
**Story:** 14.2.5  
**File:** `apps/api/src/routes/sync/health.ts:122-130`  
**Issue:** Auth middleware applied after route handler  
**Risk:** Security vulnerability - unauthorized access  

**Action Required:**
1. Move auth middleware before route definition (lines 122-130 → before line 69)
2. Test that endpoint requires authentication
3. Verify rate limiting still works with auth

### 🔥 DOC-001: Correct story 14.1.2 URL documentation  
**Story:** 14.1.2  
**File:** `story-14.1.2.md:44-49`  
**Issue:** Documents `/stock/*` but implementation uses `/outlets/:outletId/stock/*`  
**Risk:** Misleading documentation  

**Action Required:**
1. Update AC1 acceptance criteria with correct URLs
2. Update all test scenarios (lines 210-217)
3. Update completion notes (lines 311-318)
4. Update migration pattern documentation

### 🔥 DOC-002: Fix implementation vs documentation claims
**Story:** 14.2.5  
**Files:** Multiple completion notes  
**Issue:** Claims routes are "stubs" but some have full implementation  
**Risk:** Confusion about implementation status  

**Action Required:**
1. Audit all route files to determine actual implementation status
2. Update completion notes to reflect reality
3. Distinguish between "structure stubs" and "business logic stubs"

### 🔥 SEC-001: Document health endpoint auth decision
**Story:** 14.2.5  
**File:** `apps/api/src/routes/health.ts:14-16`  
**Issue:** No auth middleware with no documentation of intent  
**Risk:** Unclear security posture  

**Action Required:**
1. Determine if health endpoint should require auth
2. Either add auth middleware OR document why it's intentionally public
3. Add comment explaining the security decision

---

## HIGH PRIORITY (Fix Soon)

### 📋 MID-001: Standardize middleware ordering
**Stories:** Multiple  
**Files:** All route files  
**Issue:** Inconsistent middleware application patterns  
**Risk:** Inconsistent security/monitoring  

**Action Required:**
1. Define standard middleware order (telemetry → auth → route-specific)
2. Apply consistently across all route groups
3. Document the standard pattern

### 📋 DOC-003: Update story File Lists
**Stories:** 14.1.2, 14.2.5  
**Issue:** File Lists don't match actual git changes  
**Risk:** Incomplete change tracking  

**Action Required:**
1. Compare story File Lists with `git diff --name-only`
2. Add missing files to documentation
3. Explain why files were modified

### 📋 URL-001: Complete URL standardization
**Stories:** Multiple  
**Issue:** Partial implementation of RESTful patterns  
**Risk:** Inconsistent API design  

**Action Required:**
1. Audit all route registrations in server.ts
2. Identify routes not following `/outlets/:outletId/{resource}` pattern
3. Plan migration for remaining routes

---

## MEDIUM PRIORITY (Improvement)

### 🔧 ORG-001: Reorganize route registration order
**Story:** 14.2.5  
**File:** `apps/api/src/server.ts:244-267`  
**Issue:** Routes registered in mixed order  
**Suggestion:** Group by functionality  

**Action Required:**
1. Group routes logically (auth, health, business routes)
2. Add comments explaining grouping
3. Maintain consistent ordering

### 🔧 DOC-004: Fix duplicate documentation sections
**Story:** 14.2.2  
**File:** `story-14.2.2.md:334-368`  
**Issue:** Duplicate "Implementation Summary" sections  
**Risk:** Confusing documentation  

**Action Required:**
1. Remove duplicate sections
2. Consolidate into single, accurate summary
3. Verify all information is correct

---

## VALIDATION CHECKLIST

After completing action items, verify:

- [ ] **Security:** All routes have appropriate auth middleware
- [ ] **Documentation:** Stories accurately reflect implementation
- [ ] **Consistency:** Middleware applied consistently across routes
- [ ] **Testing:** All validation passes (TypeScript, build, lint)
- [ ] **Integration:** End-to-end functionality works with new URLs

---

## Completion Criteria

Epic 14 can be marked as `done` when:

1. ✅ All CRITICAL priority items resolved
2. ✅ All HIGH priority items resolved  
3. ✅ Security review passes (no auth vulnerabilities)
4. ✅ Documentation review passes (stories match implementation)
5. ✅ All validation tests pass
6. ✅ Integration testing confirms functionality

**Current Status:** `in-progress` (moved from `done` due to critical issues)

---

## Estimated Effort

| Priority | Items | Estimated Hours |
|----------|-------|-----------------|
| **CRITICAL** | 4 | 6-8 hours |
| **HIGH** | 3 | 4-6 hours |
| **MEDIUM** | 2 | 2-3 hours |
| **TOTAL** | 9 | **12-17 hours** |

**Recommendation:** Focus on CRITICAL and HIGH priority items first to restore Epic 14 to production-ready status.