# Planning Artifacts Index

Complete index of all planning and specification documents for the jurnapod project.

## Core Planning Documents

| Document | Description | Status | Last Updated |
|----------|-------------|--------|--------------|
| [prd.md](./prd.md) | Product Requirements Document - Core system features and requirements | Complete | 2026-03-15 |
| [architecture.md](./architecture.md) | Technical Architecture - System design, patterns, and decisions | Complete | 2026-03-17 |
| [epics.md](./epics.md) | Consolidated Epic Breakdown (Epics 1-11) with full story and AC coverage | Complete | 2026-03-18 |
| [epics-split/index.md](./epics-split/index.md) | Sharded epic files (one file per epic) for easier review and handoff | Complete | 2026-03-18 |
| [epics-backoffice-ux.md](./epics-backoffice-ux.md) | Backoffice UX Refactoring Epics (8-11) - UX improvement stories | Ready | 2026-03-17 |

## Document Relationships

```
prd.md (Requirements)
    ↓
architecture.md (Technical Design)
    ↓
epics.md (Core Features - Epics 1-7)
    ↓
epics-backoffice-ux.md (UX Improvements - Epics 8-11)
```

## Epic Summary

### Core System (Implemented)
- **Epic 1:** Foundation - Auth, Company & Outlet Management (7 stories)
- **Epic 2:** POS - Offline-first Point of Sale (6 stories)
- **Epic 3:** Accounting - GL Posting & Reports (5 stories)
- **Epic 4:** Items & Catalog - Product Management (3 core stories + technical debt stories)
- **Epic 5:** Settings - Tax, Payment, Module Configuration (3 stories)
- **Epic 6:** Reporting - Sales Reports & Exports (3 stories)
- **Epic 7:** Sync Infrastructure - Technical Debt Fixes (4 stories)

**Total:** 7 Epics | 31 Stories

### Backoffice UX Refactoring (Ready)
- **Epic 8:** Backoffice-Items-Split (P0) - 8 stories | 12-15h
- **Epic 9:** Backoffice-Users-Simplify (P1) - 5 stories | 8-10h
- **Epic 10:** Backoffice-Consistency-Standards (P2) - 6 stories | 6-8h
- **Epic 11:** Backoffice-Performance (P3) - **Deferred**

**Total:** 3 Active Epics | 19 Stories | ~26-33 hours

## Quick Links

### For Implementation
- [Epics Split Index](./epics-split/index.md) - One file per epic (1-11)
- [Epic 8 Stories](./stories/epic-08/) - COMPLETE (P0) - 8 story files
- [Epic 9 Stories](./stories/epic-09/) - Ready (P1) - 5 story files
- [Epic 10 Stories](./epics-backoffice-ux.md#epic-10-backoffice-consistency-standards) - Not started (P2)

### For Reference
- [Functional Requirements](./prd.md#functional-requirements) - All 27 FRs
- [Architecture Patterns](./architecture.md#established-patterns) - Coding standards
- [Tech Stack](./architecture.md#current-tech-stack-assessment) - Current technologies

## Implementation Priority

**Phase 1 (Current):** Backoffice UX Improvements
1. Epic 8: Items/Prices Split
2. Epic 9: Users Simplification
3. Epic 10: Consistency Standards

**Phase 2 (Future):** Performance Optimization
- Epic 11: Performance (when needed)

## Notes

- All core system features (Epics 1-7) are **already implemented**
- Hono migration **complete** (updated in architecture.md)
- UX refactoring focuses on **improving existing** functionality, not adding new features
- Total active work: ~26-33 hours across 19 stories
