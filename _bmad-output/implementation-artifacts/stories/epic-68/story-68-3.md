# Story 68-3: Notification System — Toast, Inbox, Banner

Status: backlog

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 68 --story 68-3 --title notification-system --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **company admin or operator**,  
I want **a three-layer notification system (ephemeral toast, persistent inbox, blocking banner) that delivers operation updates and system alerts**,  
So that **I am informed of important events without being overwhelmed, and I can navigate directly to relevant actions**.

## Context

The backoffice needs a comprehensive notification system to surface operation completion, failures, and system states. This system consists of three layers with distinct persistence and urgency semantics:

1. **Ephemeral toast** — Transient success/error messages (auto-dismiss 5s)
2. **Persistent inbox** — Notification center with unread count, deep-linking, read/unread state
3. **Blocking banner** — Critical system states requiring explicit acknowledgement

Notifications originate from SSE/WebSocket events when available, with polling fallback from operations/audit/health endpoints. All notifications support deep-linking to the relevant entity, operation, or audit entry.

**Story 68-0 contract impact:** `/ws` MUST NOT be used for sensitive notifications while the P0 auth fallback remains unresolved. Operation notifications MUST use safe polling or authenticated SSE only after staging proves CORS/proxy/auth behavior.

**Critical dependency:** Story 68-0 (contract verification) determines which events are available via SSE vs polling, and what the notification payload shapes are.

**Dependencies:** Story 68-0 (contract verified), Epic 65 (shell, auth session, typed API client)

**Risk:** Medium — primarily state management and UI composition.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** Toast auto-dismisses; inbox receives notification; banner shows critical alert; deep-link navigates correctly
- [ ] **Error paths identified:** SSE notification fails; inbox storage exceeds limit; banner dismissal while condition persists
- [ ] **Edge cases identified:** Rapid-fire notifications; notification received while offline; page reload with unread inbox; duplicate notifications from reconnect
- [ ] **Test fixture needs identified:** Mock notification payloads for each type; mock SSE events
- [ ] **Integration test scope defined:** Unit tests for notification state machine; integration tests for deep-link navigation
- [ ] **Negative auth test role selected:** `CASHIER` for notification inbox (may lack access to certain deep-link targets)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Toast appears and auto-dismisses | Happy | Unit |
| Persistent inbox receives operation completion | Happy | Unit |
| Inbox unread count badge updates | Happy | Unit |
| Click notification navigates to operation detail | Happy | Unit |
| Blocking banner shows backend unreachable | Happy | Unit |
| Banner dismisses when condition resolved | Happy | Unit |
| Notification from SSE normalized to inbox shape | Happy | Unit |
| Notification from polling fallback | Happy | Unit |
| Deep-link to audit explorer | Happy | Unit |
| Duplicate notifications on reconnect deduplicated | Edge | Unit |
| Inbox persists across page reload | Edge | Unit |
| Rapid-fire notifications throttled | Edge | Unit |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

### Pre-Implementation Checklist

- [ ] Producer error classes: `NotificationParseError`, `SSEConnectionError`
- [ ] Consumer catch paths: Malformed notification discarded with log; connection errors show banner
- [ ] Fallback handling: Generic "Notification system unavailable" banner
- [ ] Error response mapping: Malformed SSE event → discard; connection loss → blocking banner

### Verified Error Paths

| Producer Error | Consumer Handling | Fallback |
|----------------|-------------------|----------|
| Malformed SSE event | Log and discard; do not crash | No notification shown |
| SSE connection lost | Show blocking banner "Reconnecting..." | Polling fallback for notifications |
| Inbox storage full | Drop oldest read notifications; keep unread | Warning toast |

---

## Acceptance Criteria

### AC1: Ephemeral toast
**Given** a transient event occurs (e.g., successful save, validation error)  
**When** the notification system receives the event  
**Then** a toast notification appears using Mantine Notifications  
**And** it auto-dismisses after 5 seconds (configurable)  
**And** multiple toasts stack vertically  
**And** toasts support types: `info`, `success`, `warning`, `error`

### AC2: Persistent inbox
**Given** a notification-worthy event occurs (e.g., operation completed, operation failed, audit entry created)  
**When** the notification system receives the event  
**Then** a persistent notification is added to the inbox  
**And** the inbox is accessible from the shell header via a bell icon  
**And** the bell icon shows an unread count badge  
**And** each notification has: title, message, timestamp, type (`info`/`warning`/`error`/`success`), deep-link target, read/unread status

### AC3: Inbox interaction
**Given** the inbox has notifications  
**When** the user clicks a notification  
**Then** the app navigates to the deep-link target (operation detail, entity page, audit explorer)  
**And** the notification is marked as read  
**And** the unread count decrements  

**Given** the user clicks "Mark all as read"  
**When** the action is triggered  
**Then** all notifications are marked as read  
**And** the unread badge is hidden

**Given** the user clicks the delete icon on a notification  
**When** the action is triggered  
**Then** the notification is removed from the inbox

### AC4: Inbox persistence
**Given** the inbox has unread notifications  
**When** the page is reloaded  
**Then** the inbox state is restored  
**And** unread notifications remain unread  
**And** the unread count is preserved  

**Storage strategy:** Use TanStack Query cache for the current session; persist unread state and notification list to `localStorage` using a key scoped by `company_id` and `user_id`. Stored notifications MUST NOT contain passwords, tokens, or unnecessary PII. Notification state MUST be cleared on logout, company switch, and user switch. Evict oldest read notifications when storage exceeds 100 entries.

### AC5: Blocking banner
**Given** a critical system state occurs  
**When** the notification system detects the state  
**Then** a full-width blocking banner appears at the top of the shell  
**And** the banner requires explicit acknowledgement or state resolution to dismiss  
**And** supported critical states are:
- Backend unreachable: "Backend connection lost — retrying..."
- Session expiry imminent: "Your session will expire soon. Please save your work."
- Sync failure: "Data sync failed. Some changes may not be saved."

### AC6: Notification sources
**Given** the backend supports SSE for notifications (per contract document)  
**When** an SSE event is received  
**Then** it is normalized into the standard notification shape  
**And** it is delivered to the appropriate layer (toast for transient, inbox for persistent, banner for critical)  
**And** `/ws` is not used for sensitive notifications while the P0 `/ws` auth fallback remains unresolved

**Given** SSE is unavailable  
**When** polling fallback is active  
**Then** notifications are polled from: operations endpoint (for job completions), health endpoint (for system status), audit endpoint (for audit events)  
**And** polled notifications are normalized to the same shape as SSE notifications

### AC7: Deep-linking
**Given** a notification references an operation  
**When** clicked  
**Then** it navigates to the operations center and opens the AsyncJobDrawer for that operation

**Given** a notification references an entity  
**When** clicked  
**Then** it navigates to the entity detail page

**Given** a notification references an audit entry  
**When** clicked  
**Then** it navigates to the audit explorer filtered by object type and object ID

### AC8: Permission-aware notifications
**Given** a notification is generated for an operation the user cannot access  
**When** the notification is processed  
**Then** it is either not delivered to that user, or the deep-link resolves to "Access denied"

---

## Technical Notes

### Files to Create
- `apps/backoffice/src/features/notifications/notification-provider.tsx` — Context provider for notification system
- `apps/backoffice/src/features/notifications/notification-inbox.tsx` — Inbox drawer/panel
- `apps/backoffice/src/features/notifications/notification-banner.tsx` — Blocking banner component
- `apps/backoffice/src/features/notifications/notification-toast.tsx` — Toast wrapper around Mantine Notifications
- `apps/backoffice/src/hooks/use-notifications.ts` — Hook for consuming notifications
- `apps/backoffice/src/hooks/use-notification-source.ts` — Hook managing SSE + polling fallback
- `apps/backoffice/__test__/unit/features/notification-inbox.test.tsx` — Inbox behavior tests
- `apps/backoffice/__test__/unit/features/notification-banner.test.tsx` — Banner behavior tests
- `apps/backoffice/__test__/unit/hooks/use-notifications.test.ts` — Notification state tests

### Files to Modify
- `apps/backoffice/src/app/layout.tsx` — Add NotificationProvider, bell icon with unread badge, and banner container
- `apps/backoffice/src/app/theme-provider.tsx` — Ensure Mantine Notifications provider is present

### Notification Shape (Canonical)
```typescript
interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number; // epoch ms
  read: boolean;
  layer: 'toast' | 'inbox' | 'banner';
  source: 'sse' | 'polling' | 'client';
  deepLink?: {
    path: string;
    params?: Record<string, string>;
  };
}
```

### SSE Notification Events
```typescript
// Expected SSE event format (per contract document)
interface NotificationEvent {
  notificationId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
  layer: 'toast' | 'inbox' | 'banner';
  deepLink?: { path: string; params?: Record<string, string> };
}
```

### Persistence Logic
```typescript
// Persist to localStorage on change
useEffect(() => {
  const key = `jurnapod.notifications.${companyId}.${userId}`;
  localStorage.setItem(key, JSON.stringify(sanitizeNotifications(notifications)));
}, [companyId, notifications, userId]);

// Load from localStorage on mount
useEffect(() => {
  const stored = localStorage.getItem(`jurnapod.notifications.${companyId}.${userId}`);
  if (stored) {
    setNotifications(JSON.parse(stored));
  }
}, [companyId, userId]);

// Evict oldest read notifications when > 100
const trimmed = notifications.filter(n => !n.read).length > 100
  ? notifications.filter(n => !n.read).slice(0, 100)
  : notifications.slice(-100);
```

---

## Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| R68-3-001 | P1 | Notification inbox storage exceeds localStorage limits (~5MB) | Evict oldest read notifications; keep max 100 entries |
| R68-3-002 | P1 | SSE reconnect causes duplicate notifications | Deduplicate by `notificationId`; ignore duplicates |
| R68-3-003 | P2 | Rapid-fire notifications overwhelm UI | Throttle toasts (max 3 visible); batch inbox additions |
| R68-3-004 | P2 | Banner dismissal while condition persists | Banner re-appears if condition is still active on next check |
| R68-3-005 | P2 | Notification deep-link to unauthorized resource | Check permission before navigation; show "Access denied" if lacking |
| R68-3-006 | P1 | Notification localStorage leaks another user's or company's notification content | Scope storage key by `company_id` and `user_id`; clear on logout/company switch; persist minimal non-PII content only |

---

## Story Points
**8 points** (medium-high — three-layer system, SSE + polling, persistence, deep-linking)

---

## Tasks / Subtasks

### Phase 1: Toast layer
1. **Create toast wrapper** — Integrate with Mantine Notifications
2. **Implement auto-dismiss** — Configurable duration, stacking
3. **Implement types** — Info, success, warning, error styling

### Phase 2: Inbox layer
4. **Create notification context** — Global state for notifications
5. **Create inbox component** — Bell icon, unread badge, notification list
6. **Implement read/unread** — Toggle read, mark all read, delete
7. **Implement persistence** — localStorage with eviction

### Phase 3: Banner layer
8. **Create banner component** — Full-width colored banner
9. **Implement critical states** — Backend unreachable, session expiry, sync failure
10. **Implement dismissal** — Acknowledge or auto-dismiss when resolved

### Phase 4: Sources
11. **Implement SSE source** — Connect to notification SSE endpoint; normalize events
12. **Implement polling fallback** — Poll operations/health/audit endpoints
13. **Implement deduplication** — ID-based dedup for reconnect storms

### Phase 5: Deep-linking
14. **Implement operation links** — Navigate to operations center + drawer
15. **Implement entity links** — Navigate to entity detail
16. **Implement audit links** — Navigate to audit explorer with filters

### Phase 6: Testing
17. **Unit tests for toast** — Auto-dismiss, stacking, types
18. **Unit tests for inbox** — Read/unread, persistence, eviction
19. **Unit tests for banner** — Show/dismiss, condition re-check
20. **Unit tests for sources** — SSE normalization, polling fallback, dedup

---

## Definition of Done

- [ ] All acceptance criteria implemented with evidence
- [ ] Unit tests for toast, inbox, banner, and sources pass
- [ ] Notification persistence verified across page reload
- [ ] Inbox storage is scoped by `company_id` and `user_id`, cleared on logout/company switch, and contains no unnecessary PII
- [ ] Deep-linking verified for operation, entity, and audit targets
- [ ] Deduplication verified for reconnect storms
- [ ] Permission-aware deep-linking verified
- [ ] `npm run typecheck -w @jurnapod/backoffice` passes
- [ ] `npm run build -w @jurnapod/backoffice` passes
- [ ] Code review completed with no blockers
- [ ] Story completion report created (`story-68-3.completion.md`) with reviewer GO and owner sign-off

---

## Dependencies

- **Story 68-0** — Backend contract verified (determines SSE vs polling, notification shapes)
- **Epic 65** — Shell, auth session, Mantine Notifications provider
- **Story 68-1** (soft) — AsyncJobDrawer for operation deep-links; can mock if 68-1 not complete
- **Story 68-4** (soft) — Audit explorer for audit deep-links; can mock if 68-4 not complete

## Validation Evidence

```bash
# Pre-flight
npm run lint -w @jurnapod/backoffice
npm run typecheck -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice

# Unit tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/notification-inbox.test.tsx
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/notification-banner.test.tsx
npm run test:single -w @jurnapod/backoffice -- __test__/unit/hooks/use-notifications.test.ts

# Sprint status
npx tsx scripts/validate-sprint-status.ts --epic 68
```

---

_Last Updated: 2026-05-18 (prepared by bmad-sm)
