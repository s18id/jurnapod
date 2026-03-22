# Architecture Decision Log

**Project:** Jurnapod  
**Status:** Active  
**Last Updated:** 2026-03-22  

---

## Overview

This log captures significant architectural decisions made during the Jurnapod project. Each decision is documented as an ADR (Architecture Decision Record) following the format from Michael Nygard's "Documenting Architecture Decisions."

---

## ADRs

| ADR # | Title | Status | Date | Epic |
|-------|-------|--------|------|------|
| [ADR-001](adr-001-backoffice-ui-component-architecture.md) | Backoffice UI Component Architecture | Accepted | 2026-03-22 | Epic 10 |
| [ADR-002](adr-002-journal-source-of-truth.md) | Journal as Source of Truth | Accepted | 2026-03-15 | Epic 3 |
| [ADR-003](adr-003-pos-offline-first.md) | POS Offline-First Architecture | Accepted | 2026-03-10 | Epic 2 |
| [ADR-004](adr-004-authentication-model.md) | Authentication Model (JWT + RBAC) | Accepted | 2026-03-05 | Epic 1 |

---

## Future ADRs Needed

The following decisions should be documented in future sprints:

| Topic | Priority | Owner | Target Epic |
|-------|----------|-------|-------------|
| Sync Protocol (POS ↔ API) | HIGH | Backend Team | Epic 7 |
| Database Migration Strategy | MEDIUM | Backend Team | Epic 7 |
| Telemetry/Observability Stack | MEDIUM | Platform Team | Epic 11 |
| Module Enable/Disable Pattern | LOW | Product Team | Epic 5 |

---

## Contributing to This Log

When making significant architectural decisions:

1. **Create ADR** - Document the decision using this template
2. **Assign Number** - Use next sequential number
3. **Add to Index** - Update this index file
4. **Review** - Have at least one peer review the ADR
5. **Track** - Link from relevant epic/feature documentation

---

## ADR Template

```markdown
# ADR-{number}: {Title}

**Status:** {Proposed | Accepted | Deprecated | Superseded}  
**Date:** {YYYY-MM-DD}  
**Deciders:** {Team members}

## Context

{Problem statement and background}

## Decision

{What we decided to do}

## Consequences

### Positive
{Good outcomes}

### Negative
{Bad outcomes}

### Neutral
{Neither good nor bad}

## References
{links to relevant documents}
```

---

## Metadata

- **File Created:** 2026-03-22
- **Last Updated:** 2026-03-22
- **Owner:** Architecture / Tech Lead
- **Review Cadence:** Monthly
