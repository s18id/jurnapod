# Story 68-0: Backend Operations Contract Verification — SSE, Polling, Async Jobs, Streaming, Auth/CORS/Proxy

Status: ready-for-dev

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 68 --story 68-0 --title sse-connectivity-verification --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **frontend engineer building async workflow UI**,  
I want **a verified, written contract for all backend operations transport mechanisms and endpoint shapes**,  
So that **SSE-dependent UI stories (68-1, 68-2, 68-3) are built against reality, not assumptions**.

## Context

Epic 67 (Catalog Operations) discovered a critical contract mismatch in Story 67-5: the spec assumed async jobs with SSE progress, but the backend export endpoints returned synchronous streaming responses. This caused a NO-GO review cycle, wasted implementation effort, and required redesign mid-story. Epic 67 Retrospective Action Item E67-A1 mandates that **backend bulk operation endpoint contracts MUST be verified before story specification**.

Epic 68 is the first epic in the Backoffice Frontend Program that depends on SSE, polling, and async job infrastructure. This story is a **mandatory contract verification spike** that MUST complete before Stories 68-1, 68-2, 68-3, or 68-5 enter implementation.

**Scope:** This is NOT a "connectivity smoke test." It is a comprehensive backend contract audit covering:
1. Async job endpoints vs synchronous streaming endpoints
2. SSE transport capability and fallback
3. Polling fallback mechanisms
4. Retry/cancel state machine support
5. Operation detail/list/progress response shapes
6. Auth/CORS/proxy behavior for static SPA deployment

**Dependencies:** Epic 65 (Foundation — typed API client, auth session, shell)

**Risk:** High — if the backend contract does not match expectations, Stories 68-1 through 68-3 will require redesign.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** SSE connection succeeds; polling fallback works; auth cookies propagate; operation list/detail return expected shapes
- [ ] **Error paths identified:** SSE disconnect/reconnect; 401 on expired token; 403 on insufficient permissions; CORS preflight failure; proxy timeout
- [ ] **Edge cases identified:** Nginx buffering disabling SSE; EventSource with credentials in cross-origin context; reconnect storm after backend restart
- [ ] **Test fixture needs identified:** Staging deployment access; authenticated test session; Nginx config read access
- [ ] **Integration test scope defined:** This spike uses manual/API inspection, not automated tests. Evidence is the written contract document.
- [ ] **Negative auth test role selected:** `CASHIER` for operations list (may lack READ on `platform.operations`)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| SSE connection through Nginx proxy with credentials | Happy | Manual verification + curl evidence |
| Polling fallback when SSE unavailable | Happy | Manual verification + curl evidence |
| Operation list endpoint shape verification | Happy | API inspection + schema comparison |
| Operation detail/progress endpoint shape verification | Happy | API inspection + schema comparison |
| Auth cookie propagation to EventSource | Happy | Browser dev tools + curl evidence |
| CORS preflight for SSE endpoint | Happy | Browser network tab evidence |
| 401 handling on expired token during SSE | Error | Manual verification |
| Nginx buffering blocks SSE | Edge | Config inspection + manual test |
| Reconnect behavior after backend restart | Edge | Manual verification |

**Sign-off:** Test scenarios reviewed and approved before verification begins.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

### Pre-Implementation Checklist

- [ ] Producer error classes: `OperationNotFoundError`, `OperationCancelledError`, `SSEConnectionError` from backend
- [ ] Consumer catch paths: Error documented in contract; retry/fallback behavior specified
- [ ] Fallback handling: Documented per operation type
- [ ] Error response mapping: 400 → invalid operation ID; 401 → re-authenticate; 404 → operation not found; 409 → operation not in cancellable state

### Verified Error Paths

| Producer Error | Consumer Handling (Documented) | Fallback |
|----------------|-------------------------------|----------|
| Operation not found (404) | Show "Job not found" with refresh button | Redirect to operations list |
| Operation cancelled (409) | Show "Job was cancelled" status | Allow re-submit if retry supported |
| SSE disconnect | Auto-reconnect with exponential backoff | Polling fallback after max retries |
| Auth expired during SSE | Close connection; prompt re-login | No silent retry with stale credentials |

---

## API Contract Verification (MANDATORY — this IS the story)

### Pre-Implementation Checklist

- [ ] Call each operations endpoint directly (curl, browser, or API client)
- [ ] Verify response shape matches expected contract
- [ ] Verify required fields are present and not null/placeholder
- [ ] Verify authentication/authorization works as expected
- [ ] Verify error responses (400, 401, 403, 404, 500) are properly shaped
- [ ] Document any API gaps discovered in the table below

### Operations Endpoint Verification Results

| Endpoint | Method | Expected Purpose | Verified | Notes |
|----------|--------|------------------|----------|-------|
| `/api/operations` | GET | List operations (paginated) | ❌ | Must verify: filter params, response shape, pagination |
| `/api/operations/:id` | GET | Operation detail | ❌ | Must verify: full state object, progress fields, download URLs |
| `/api/operations/:id/progress` | SSE | Real-time progress stream | ❌ | Must verify: event format, reconnect behavior, auth |
| `/api/operations/:id/progress` | GET | Polling fallback | ❌ | Must verify: poll interval, response shape vs SSE |
| `/api/operations/:id/retry` | POST | Retry failed operation | ❌ | Must verify: which operation types support retry |
| `/api/operations/:id/cancel` | POST | Cancel queued/running operation | ❌ | Must verify: which states allow cancel |
| `/api/sync/push` | POST | POS sync push | ❌ | Must verify: sync operation tracking |
| `/api/sync/pull` | GET | POS sync pull | ❌ | Must verify: sync status shape |
| `/ws` or `/api/ws` | WebSocket | General event stream | ❌ | Must verify: connection protocol, auth, message format |

### Streaming vs Async Job Classification

| Operation Type | Endpoint | Sync/Async | Progress Mechanism | Evidence Required |
|----------------|----------|------------|--------------------|---------------------|
| Import (items) | `POST /import/items/apply` | Sync | XHR progress callback | Request/response capture |
| Export (items) | `POST /export/items` | Sync streaming | `ReadableStream` bytes | Request/response capture |
| Bulk update | `POST /operations/bulk-update` | Async (?) | SSE or polling | Request/response capture |
| Sync push | `POST /sync/push` | Async (?) | Operation record + polling | Request/response capture |

### API Gaps Found (Document Here)

If any gaps are found, document them and classify impact:

| Gap | Impact | Resolution |
|-----|--------|-----------|
| {TBD during verification} | {High/Medium/Low} | {Block story / Document workaround / Proceed with known gap} |

---

## Acceptance Criteria

### AC1: Async job vs synchronous streaming classification
**Given** the backend operations and bulk endpoints  
**When** each endpoint is inspected  
**Then** a complete table exists classifying every endpoint as either:
- **Async job:** Returns `{ operationId }` or equivalent; progress tracked via operation record
- **Synchronous streaming:** Returns `Response` directly; progress tracked via `ReadableStream` or XHR callbacks
- **Synchronous immediate:** Returns JSON result immediately; no progress tracking needed

### AC2: SSE transport verification
**Given** the staging static backoffice deployment  
**When** an `EventSource` connects to the SSE endpoint  
**Then** the connection succeeds with authenticated session context  
**And** `message` events deliver progress updates in a documented format  
**And** the connection auto-reconnects on disconnect with exponential backoff (document max retries and interval)  
**And** cookies/credentials propagate correctly through the Nginx proxy  
**And** CORS headers allow the static SPA origin with `Access-Control-Allow-Credentials: true`

### AC3: Polling fallback verification
**Given** SSE is unavailable (browser limitation, proxy block, or server failure)  
**When** the fallback polling endpoint is called  
**Then** `GET /api/operations/:id` (or equivalent) returns the current operation state  
**And** the poll interval is documented (target: 5 seconds for running jobs, 30 seconds for queued)  
**And** polling stops automatically when the operation reaches a terminal state (`completed`, `failed`, `cancelled`)

### AC4: Operation detail/list shape documentation
**Given** the operations endpoints  
**When** their responses are inspected  
**Then** the **Operations Backend Contract Document** contains:
- `OperationListItem` shape: `id`, `type`, `status`, `progressPercent`, `createdAt`, `createdBy`, `completedAt`, `errorMessage?`, `downloadUrl?`
- `OperationDetail` shape: full `OperationListItem` + `steps: OperationStep[]`, `results: OperationResult?`, `retryable: boolean`, `cancellable: boolean`
- `OperationStep` shape: `name`, `status`, `startedAt?`, `completedAt?`, `errorMessage?`
- `OperationProgressEvent` shape (SSE): `operationId`, `status`, `progressPercent`, `currentStep`, `message?`
- Pagination params for list: `page`, `limit`, `status`, `type`, `dateFrom`, `dateTo`

### AC5: Retry/cancel support documentation
**Given** the operation state machine  
**When** inspected  
**Then** the contract document specifies:
- Which operation types support retry (e.g., `failed` imports, `failed` exports)
- Which operation states allow cancel (`queued`, `running` — NOT `completed` or `failed`)
- Retry endpoint: method, URL, request body, response shape
- Cancel endpoint: method, URL, response shape
- State machine transitions: `queued → running → completed/failed/cancelled`; `failed → queued` (on retry)

### AC6: Auth/CORS/proxy behavior documentation
**Given** the static SPA deployment behind Nginx  
**When** SSE and API requests are made  
**Then** the contract document specifies:
- How the SPA authenticates SSE connections (cookie? token in URL? `EventSource.withCredentials`?)
- Nginx proxy configuration for SSE (`proxy_buffering off; proxy_cache off;`)
- CORS policy for `/api/operations/*` and `/ws`
- 401 handling: does SSE close gracefully? Does polling return 401?
- Token refresh behavior: does the SPA need to refresh before SSE connect, or can it recover mid-stream?

### AC7: Output artifact
**Given** all verification is complete  
**Then** the **Operations Backend Contract Document** is stored at:  
`_bmad-output/implementation-artifacts/stories/epic-68/story-68-0-contract.md`  
**And** it is reviewed and approved by Ahmad (story owner)  
**And** Stories 68-1, 68-2, and 68-3 acceptance criteria explicitly reference this document

---

## Technical Notes

### Files to Create
- `_bmad-output/implementation-artifacts/stories/epic-68/story-68-0-contract.md` — The Operations Backend Contract Document (output artifact)
- `apps/backoffice/docs/operations-contract.md` — Engineering copy (optional, if team prefers)

### Files to Inspect (Read-Only — No Modifications)
- `apps/api/src/routes/progress.ts` — Backend operations/progress route handlers mounted as `/api/operations/*`
- `apps/api/src/routes/sync.ts` — Backend sync route handlers
- `apps/api/src/routes/export.ts` — Backend export route handlers (verify streaming behavior)
- `apps/api/src/routes/import.ts` — Backend import route handlers (verify apply behavior)
- `nginx.conf` or deployment config — Nginx proxy settings for SSE
- `apps/backoffice/src/lib/api-client.ts` — Typed API client (verify it covers operations endpoints)

### Verification Methods
1. **curl/manual API calls:** Directly call each endpoint and capture request/response
2. **Browser DevTools:** Verify EventSource connection, CORS headers, cookie propagation
3. **Nginx config inspection:** Verify `proxy_buffering off` for SSE locations
4. **Code inspection:** Read backend route handlers to confirm sync vs async classification

### Critical Questions to Answer
1. Does `POST /import/items/apply` return `{ operationId }` or synchronous `ApplyResult`? (Epic 67 says synchronous — confirm.)
2. Does `POST /export/items` return `{ operationId }` or streaming `Response`? (Epic 67 says streaming — confirm.)
3. Does any backend endpoint return `{ operationId }` at all? If so, which ones?
4. Is `/ws` a WebSocket or SSE endpoint? What protocol does it use?
5. Does `/api/operations/:id/progress` support SSE, or is it polling only?
6. What is the canonical operation type enum? (`import`, `export`, `sync`, `bulk-update`, ...)
7. What is the canonical operation status enum? (`queued`, `validating`, `running`, `completed`, `failed`, `cancelled`, `partially_failed`)

---

## Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| R68-0-001 | P1 | Backend has NO async job endpoints; all operations are synchronous | Document reality; Stories 68-1/68-2 redesigned to focus on synchronous progress + polling for sync operations only |
| R68-0-002 | P1 | Nginx buffering blocks SSE; requires config change | Document required config change; assign to Epic 70-4 or ops runbook |
| R68-0-003 | P2 | CORS does not allow credentials for EventSource | Document workaround (token in URL query param vs cookie) |
| R68-0-004 | P2 | Operation endpoints exist but response shapes differ from assumptions | Document actual shapes; update typed API client if needed |

---

## Story Points
**5 points** (investigative spike — manual verification, documentation, review)

---

## Tasks / Subtasks

### Phase 1: Endpoint Discovery
1. **List all operations-related endpoints** — Search `apps/api/src/routes/` for `operations`, `sync`, `import`, `export`
2. **Classify sync vs async** — For each `POST` that initiates work, determine if it returns `{ operationId }` or immediate result
3. **Document endpoint inventory** — Table with method, URL, sync/async, progress mechanism

### Phase 2: SSE Transport Verification
4. **Verify EventSource connectivity** — From staging static deployment, connect to SSE endpoint with `withCredentials: true`
5. **Verify Nginx proxy behavior** — Inspect nginx.conf for `proxy_buffering` settings on SSE locations
6. **Verify CORS headers** — Capture preflight and actual request headers
7. **Verify cookie propagation** — Confirm auth session cookie is sent with EventSource request
8. **Verify reconnect behavior** — Disconnect backend or network; observe client reconnect attempts

### Phase 3: Polling Fallback Verification
9. **Verify polling endpoint** — Call `GET /api/operations/:id` manually; document response shape
10. **Verify poll semantics** — Document recommended interval, stop conditions

### Phase 4: Response Shape Documentation
11. **Capture operation list response** — Document full JSON shape with field types
12. **Capture operation detail response** — Document full JSON shape with field types
13. **Capture SSE event format** — Document event name, data payload shape
14. **Capture progress response** — Document polling progress shape

### Phase 5: Retry/Cancel Verification
15. **Verify retry endpoint** — If exists, document method/URL/shape; if not, document "not supported"
16. **Verify cancel endpoint** — If exists, document method/URL/shape; if not, document "not supported"
17. **Document state machine** — Valid transitions per operation type

### Phase 6: Contract Document & Review
18. **Write contract document** — Compile all findings into `story-68-0-contract.md`
19. **Review with Ahmad** — Obtain story owner sign-off
20. **Update dependent story specs** — Ensure 68-1, 68-2, 68-3 AC reference the contract

---

## Definition of Done

- [ ] All acceptance criteria implemented with evidence (curl output, screenshot, config snippet)
- [ ] Operations Backend Contract Document created at `_bmad-output/implementation-artifacts/stories/epic-68/story-68-0-contract.md`
- [ ] Contract document reviewed and approved by Ahmad (story owner)
- [ ] Stories 68-1, 68-2, 68-3 acceptance criteria updated to reference the contract document
- [ ] Any API gaps documented with impact assessment and resolution plan
- [ ] Any required deployment config changes assigned to Epic 70-4 or runbook
- [ ] No code changes in this story (it is a documentation/verification spike)
- [ ] Story completion report created (`story-68-0.completion.md`) with reviewer GO and owner sign-off

---

## Dependencies

- Epic 65 complete (typed API client, auth session, shell)
- Staging static deployment accessible for manual verification
- Nginx configuration readable (or ops team available to answer questions)
- Backend routes source code readable (no backend changes needed)

## Validation Evidence

```bash
# No build/typecheck required (no code changes)
# Verify the contract document exists and is complete:
ls -la _bmad-output/implementation-artifacts/stories/epic-68/story-68-0-contract.md

# Validate sprint status
npx tsx scripts/validate-sprint-status.ts --epic 68
```

---

_Last Updated: 2026-05-18 (prepared by bmad-sm)
