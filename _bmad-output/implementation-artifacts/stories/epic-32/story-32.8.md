# Story 32.8: ADR-0014 Extraction

**Status:** done

## Story

As a **developer**,
I want to extract and formalize ADR-0014 from the Epic 32 implementation decisions,
So that key architectural decisions are permanently documented and discoverable by future contributors.

---

## Context

During Epic 32 implementation, significant architectural decisions were made around the period close workflow (three-step entries, transaction boundaries, idempotency, roll-forward workspace). Story 32.8 formalizes these as ADR-0014 in the docs/adr/ directory.

**Dependencies:** Stories 32.1–32.7 must be complete.

---

## Acceptance Criteria

**AC1: ADR-0014 Created**
ADR-0014 is created at `docs/adr/adr-0014-*.md` documenting the period close architecture decisions.

**AC2: Epic 32 Retrospective Complete**
Epic 32 retrospective is written and saved.

**AC3: Sprint Status Updated**
`sprint-status.yaml` is updated to reflect all Epic 32 stories as done.

---

## Dev Notes

_Created retroactively — implementation completed as part of Epic 32 execution._
