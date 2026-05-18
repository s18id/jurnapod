# Story 68-0 Operations Backend Contract Document

Status: Source-inspection complete; staging/Nginx runtime evidence is **Not verifiable locally**.

Scope: Epic 68 operations/progress/import/export/sync transport contract. This document is evidence for Stories 68-1, 68-2, 68-3, and 68-5. No production code was changed.

## 1. Evidence Sources

| Area | Source evidence |
|---|---|
| Actual route mounts | `apps/api/src/app.ts:94`, `apps/api/src/app.ts:100-126`, `apps/api/src/app.ts:184-185`, `apps/api/src/app.ts:253-260` |
| OpenAPI aggregation | `apps/api/src/routes/openapi-aggregator.ts:52-54`, `apps/api/src/routes/openapi-aggregator.ts:122-124`, `apps/api/src/routes/openapi-aggregator.ts:141-146` |
| Operations/progress routes | `apps/api/src/routes/progress.ts:183-220`, `apps/api/src/routes/progress.ts:227-284`, `apps/api/src/routes/progress.ts:298-417` |
| Progress store/state | `apps/api/src/lib/progress/progress-store.ts:29-37`, `apps/api/src/lib/progress/progress-store.ts:146-162`, `apps/api/src/lib/progress/progress-store.ts:203-264`, `apps/api/src/lib/progress/progress-store.ts:269-356`, `apps/api/src/lib/progress/progress-store.ts:420-477` |
| Import routes | `apps/api/src/routes/import.ts:737-838`, `apps/api/src/routes/import.ts:845-988`, `apps/api/src/routes/import.ts:995-1130`, `apps/api/src/routes/import.ts:1137-1201` |
| Export routes | `apps/api/src/routes/export.ts:266-388`, `apps/api/src/routes/export.ts:400-441` |
| Sync routes | `apps/api/src/routes/sync.ts:25-30`, `apps/api/src/routes/sync/push.ts:56-203`, `apps/api/src/routes/sync/pull.ts:94-121`, `apps/api/src/routes/sync/check-duplicate.ts:62-101`, `apps/api/src/routes/sync/stock.ts:39-42` |
| Backoffice API client | `apps/backoffice/src/lib/api-base-url.ts:8-19`, `apps/backoffice/src/lib/api-client.ts:79-140`, `apps/backoffice/src/lib/api-client.ts:151-199`, `apps/backoffice/src/lib/api-client.ts:210-276` |
| Backoffice import/export hooks | `apps/backoffice/src/hooks/use-import.ts:181-185`, `apps/backoffice/src/hooks/use-import.ts:304-311`, `apps/backoffice/src/hooks/use-import.ts:368-386`, `apps/backoffice/src/hooks/use-export.ts:495-522`, `apps/backoffice/src/hooks/use-export.ts:706-733` |
| WebSocket runtime | `apps/api/src/server.ts:123-138`, `apps/api/src/lib/websocket/server.ts:41-60`, `apps/api/src/lib/websocket/server.ts:157-204`, `apps/backoffice/src/lib/websocket.ts:33-60` |
| Response envelope | `packages/shared/src/lib/response.ts:33-53` |
| Nginx/deployment proxy | No `nginx.conf`, `*nginx*`, or `*.conf` file found in repository root tree by glob inspection. |

## 2. Route Mount Contract

Runtime route mounts in `apps/api/src/app.ts` are canonical for HTTP requests:

| Runtime base | Mounted route module | Source |
|---|---|---|
| `/api/sync` | `syncRoutes` | `apps/api/src/app.ts:184-185` |
| `/api/export` | `exportRoutes` | `apps/api/src/app.ts:253-254` |
| `/api/import` | `importRoutes` | `apps/api/src/app.ts:256-257` |
| `/api/operations` | `progressRoutes` | `apps/api/src/app.ts:259-260` |
| `/ws` | `WebSocketServer` path | `apps/api/src/lib/websocket/server.ts:44-47`; `apps/api/src/server.ts:123-138` |

Backoffice `getApiBaseUrl()` returns `/api` by default and appends `/api` to configured origins that do not already end with `/api` (`apps/backoffice/src/lib/api-base-url.ts:8-19`). Therefore backoffice API client paths MUST normally be passed without a leading `/api` segment, for example `/import/items/upload`, `/export/items`, and `/operations/{id}/progress`.

## 3. Endpoint Inventory and Classification

| Endpoint | Method | Runtime path | Classification | Progress mechanism | Response/stream shape | Evidence |
|---|---:|---|---|---|---|---|
| Operations list | GET | `/api/operations` | Synchronous immediate JSON | None; list current persisted rows | `{ success: true, data: { operations, total, limit, offset } }` | `progress.ts:227-284` |
| Operation progress polling | GET | `/api/operations/:operationId/progress` | Synchronous immediate JSON | Poll current persisted row | `{ success: true, data: ProgressResponse }` or 404 | `progress.ts:183-220` |
| Operation progress SSE | GET | `/api/operations/:operationId/progress` with `Accept: text/event-stream` | Async transport over SSE for existing persisted operation | Server polls DB every `SSE_POLL_INTERVAL_MS` and streams `data:` frames | `text/event-stream`, `data: ProgressResponse\n\n`, keepalive comments | `progress.ts:188-217`, `progress.ts:298-417` |
| Operation detail | GET | `/api/operations/:operationId` | Not present | Not supported | 404 by route absence | No route in `progress.ts`; app mount only `GET /` and `GET /:operationId/progress` |
| Operation retry | POST | `/api/operations/:operationId/retry` | Not present | Not supported | 404 by route absence | No route in `progress.ts` |
| Operation cancel | POST | `/api/operations/:operationId/cancel` | Not present as HTTP endpoint | Store supports cancellation only as internal function | No HTTP response contract | `progress-store.ts:341-356`; no route in `progress.ts` |
| Import upload | POST | `/api/import/:entityType/upload` | Synchronous immediate JSON with XHR upload progress on client | Browser XHR upload bytes only | `{ uploadId, filename, rowCount, columns, sampleData, parseErrors }` inside success envelope | `import.ts:737-838`; `api-client.ts:151-199`; `use-import.ts:181-185` |
| Import validate | POST | `/api/import/:entityType/validate` | Synchronous immediate JSON | None | `{ totalRows, validRows, errorRows, errors, validRowIndices, errorRowIndices }` inside success envelope | `import.ts:845-988` |
| Import apply | POST | `/api/import/:entityType/apply` | Synchronous immediate JSON with XHR byte progress on client | Browser XHR upload/download bytes only; no row-progress stream | `{ success, failed, created, updated, batchesCompleted, batchesFailed, rowsProcessed, failedAtBatch?, rowsCommitted, canResume, resumed, skippedBatches, skippedRows, errors }` inside success envelope | `import.ts:995-1130`; `api-client.ts:210-276`; `use-import.ts:304-311` |
| Import template | GET | `/api/import/:entityType/template` | Synchronous streaming/file response | Browser download bytes via response blob | `text/csv` with `Content-Disposition` and `Content-Length` | `import.ts:1137-1201`; `use-import.ts:368-386` |
| Export data | POST | `/api/export/:entityType` | Synchronous file response; CSV >10k rows uses streaming body | Browser `ReadableStream` download progress if content length is computable/available | File response: `text/csv` or XLSX content type, `Content-Disposition`; not `{ operationId }` | `export.ts:266-388`; `use-export.ts:495-522`, `use-export.ts:706-733` |
| Export columns | GET | `/api/export/:entityType/columns` | Synchronous immediate JSON | None | `{ success: true, data: { entityType, columns, defaultColumns } }` | `export.ts:400-441` |
| Sync push | POST | `/api/sync/push` | Synchronous immediate JSON after transactional server processing | None exposed as operation record | `{ results, order_update_results?, item_cancellation_results?, variant_sale_results?, variant_stock_adjustment_results? }` inside success envelope | `sync.ts:25-30`; `sync/push.ts:56-203` |
| Sync pull | GET | `/api/sync/pull` | Synchronous immediate JSON | None | `SyncPullPayload` inside success envelope; request cursor is `since_version`, response cursor is `data_version` by contract | `sync/pull.ts:10-15`, `sync/pull.ts:94-121` |
| Sync check duplicate | POST | `/api/sync/check-duplicate` | Synchronous immediate JSON | None | `{ is_duplicate: false }` or `{ is_duplicate: true, existing_id, created_at }` (not standard success envelope) | `sync/check-duplicate.ts:62-101` |
| Sync stock | GET | `/api/sync/stock` | Synchronous immediate error | None | 404 `{ success: false, error: { code: "NOT_FOUND", message: "Stock sync moved..." } }` | `sync/stock.ts:39-42` |
| WebSocket | WS | `/ws` | WebSocket event stream, not SSE | ReconnectingWebSocket client | JSON messages; auth is message/query-token based, not HTTP auth guard | `server.ts:123-138`; `websocket/server.ts:41-60`; `backoffice/src/lib/websocket.ts:33-60` |

## 4. Actual Operations Response Shapes

### 4.1 `GET /api/operations`

Source response (`progress.ts:266-284`):

```ts
{
  success: true,
  data: {
    operations: Array<{
      operationId: string;
      type: "import" | "export" | "batch_update";
      total: number;
      completed: number;
      percentage: number;
      status: "running" | "completed" | "failed" | "cancelled";
      etaSeconds: number | null;
      startedAt: string;
      updatedAt: string;
      completedAt: string | null;
    }>;
    total: number;
    limit: number;
    offset: number;
  }
}
```

Supported query params from source: `status`, `type`, `limit`, `offset` (`progress.ts:231-263`). Supported status values: `running`, `completed`, `failed`, `cancelled` (`progress.ts:237-245`). Supported types: `import`, `export`, `batch_update` (`progress.ts:247-255`). Pagination is offset-based, not page-based.

### 4.2 `GET /api/operations/:operationId/progress` JSON polling

Source response (`progress.ts:202-220`):

```ts
{
  success: true,
  data: {
    operationId: string;
    total: number;
    completed: number;
    percentage: number;
    status: "running" | "completed" | "failed" | "cancelled";
    etaSeconds: number | null;
    startedAt: string;
    updatedAt: string;
    completedAt: string | null;
    details?: Record<string, unknown>;
  }
}
```

404 shape uses shared error envelope: `{ success: false, error: { code: "NOT_FOUND", message: "Operation not found" } }` (`progress.ts:195-197`, `packages/shared/src/lib/response.ts:48-53`). 401 shape is `{ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } }` (`progress.ts:170-180`).

### 4.3 Missing expected Epic 68 operation shapes

The backend does **not** currently expose the Story 68 expected shapes:

| Expected type | Backend reality |
|---|---|
| `OperationListItem.id` | Source uses `operationId`, not `id`. |
| `progressPercent` | Source uses `percentage`. |
| `createdAt` / `createdBy` | Source uses `startedAt`; no `createdBy`. |
| `downloadUrl` | Not present. |
| `OperationDetail` | No `/api/operations/:id` route. |
| `steps: OperationStep[]` | Not present. |
| `results: OperationResult?` | Not present except opaque `details?`. |
| `retryable` / `cancellable` | Not present. |
| `page`, `dateFrom`, `dateTo` list filters | Not present; source uses `limit` and `offset` only. |

## 5. SSE Contract

### Endpoint and trigger

SSE uses the same endpoint as polling:

```http
GET /api/operations/:operationId/progress
Accept: text/event-stream
Authorization: Bearer <token>
```

The route detects SSE by checking whether the `Accept` header includes `text/event-stream` (`progress.ts:188-217`). Without that Accept header it returns JSON polling response.

### Headers

SSE response headers are set in `handleSseRequest` (`progress.ts:304-309`):

```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

No source-level `X-Accel-Buffering: no` header is present. No source-level Nginx config is present.

### Event format

Events are unnamed `message` events because source emits `data:` frames only and does not emit `event:` names (`progress.ts:348-350`, `progress.ts:386-393`). Payloads are JSON strings.

Initial and periodic update frame:

```text
data: {"operationId":"...","total":100,"completed":0,"percentage":0,"status":"running","etaSeconds":null,"startedAt":"...","updatedAt":"...","completedAt":null,"details":{}}

```

Operation deleted frame (`progress.ts:360-367`):

```text
data: {"type":"operation_deleted"}

```

Terminal final frame (`progress.ts:389-395`):

```text
data: {"operationId":"...","total":100,"completed":100,"percentage":100,"status":"completed","etaSeconds":0,"startedAt":"...","updatedAt":"...","completedAt":"...","type":"operation_ended"}

```

Keepalive frame (`progress.ts:331-343`):

```text
: keepalive

```

### Server intervals and lifecycle

| Setting | Default | Source |
|---|---:|---|
| SSE DB polling interval | `2000ms` | `SSE_POLL_INTERVAL_MS`, `progress.ts:35-40`; polling loop `progress.ts:352-400` |
| SSE keepalive interval | `30000ms` | `SSE_KEEPALIVE_INTERVAL_MS`, `progress.ts:41-45`; keepalive loop `progress.ts:331-343` |
| Controller TTL | `5 minutes` | `CONTROLLER_TTL_MS`, `progress.ts:89-92` |
| Terminal close statuses | `completed`, `failed`, `cancelled` | `progress.ts:389-396` |

### Reconnect guidance

No backend-specific reconnect contract is present for SSE. Browser `EventSource` has native reconnect behavior, but source does not emit `retry:` fields and does not document max retries or exponential backoff. Backoffice has a ReconnectingWebSocket client with max retries 10 and max reconnection delay 30000ms (`apps/backoffice/src/lib/websocket.ts:54-60`), but that applies to `/ws`, not SSE.

### SSE auth limitation

Backend SSE authentication uses the same `authenticateRequest(c.req.raw)` middleware as JSON routes (`progress.ts:170-180`). The documented backoffice `apiRequest` path uses bearer tokens and `credentials: "include"` (`api-client.ts:90-99`), but native browser `EventSource` cannot set an `Authorization` header. Cookie-based auth MAY work only if `authenticateRequest` accepts cookies in the deployment session model; this was not verified locally. A frontend wrapper using `fetch` stream MAY set `Authorization`, but that is not native `EventSource`.

## 6. Polling Fallback Contract

Polling fallback is supported by the same endpoint without `Accept: text/event-stream`:

```http
GET /api/operations/:operationId/progress
Authorization: Bearer <token>
```

Response shape is the `ProgressResponse` success envelope in section 4.2. Polling MUST stop when `status` is `completed`, `failed`, or `cancelled`, matching SSE terminal close semantics (`progress.ts:389-396`).

No backend source specifies UI polling cadence. Recommended frontend cadence for Story 68 MUST be documented as a UI policy, not backend contract:

| Operation status | Recommended UI interval | Source status support |
|---|---:|---|
| `running` | 5 seconds | status exists in `progress-store.ts:34-36` |
| `completed` / `failed` / `cancelled` | Stop | terminal statuses used by SSE close `progress.ts:389-396` |
| `queued` | Not supported by backend | not in `OperationStatus` (`progress-store.ts:34-36`) |

## 7. Retry and Cancel Support

| Capability | Source reality | Impact |
|---|---|---|
| Retry failed operation via HTTP | Not present. No `POST /api/operations/:id/retry`. | Story 68 MUST NOT expose generic retry unless operation-specific client-side re-submit is used. |
| Cancel operation via HTTP | Not present. No `POST /api/operations/:id/cancel`. | Story 68 MUST NOT expose server-side cancel for persisted operations. |
| Cancel state in store | Internal `cancelProgress(operationId, companyId)` exists. | State exists but is unreachable via HTTP. |
| Retry state transition | Not present. | `failed -> queued` is not supported. |
| `queued` state | Not present. | Backend supports only `running`, `completed`, `failed`, `cancelled`. |

Import/export hooks have client-local retry/cancel semantics only:

- Export dialog stores last config and re-executes the same synchronous export request on retry (`use-export.ts:691-755`).
- Import apply exposes `cancel()` that aborts a local `AbortController`, but `applyWithProgress` does not accept/use that signal (`use-import.ts:281-286`, `api-client.ts:210-276`). This means cancel is not a verified transport-level cancellation.

## 8. Auth, CORS, Compression, and Proxy Behavior

### API auth

All inspected operations/import/export/sync modules use `authenticateRequest(c.req.raw)` middleware and return 401 on failure:

- Operations: `progress.ts:170-180`
- Import: `import.ts:723-735`
- Export: `export.ts:252-264`
- Sync push: `sync/push.ts:45-54`
- Sync pull: `sync/pull.ts:49-58`

Authorization/resource checks:

- Import write uses `inventory.items` `create` (`import.ts:741-746`, `import.ts:849-854`, `import.ts:999-1004`).
- Import template uses `inventory.items` `read` (`import.ts:1141-1146`).
- Export uses `inventory.items` `read` (`export.ts:270-275`, `export.ts:404-409`).
- Sync push uses `pos.transactions` `create` with outlet scoping (`sync/push.ts:91-100`).
- Sync pull uses outlet guard plus `pos.transactions` `read` (`sync/pull.ts:60-92`).

Operations/progress routes authenticate and tenant-scope `getProgress/listProgress` by `auth.companyId`, but do not call `requireAccess()` for a resource-level permission (`progress.ts:170-220`, `progress.ts:227-284`).

### CORS

API CORS applies to `/api/*` (`app.ts:100-126`). Development/test allowed origins are localhost variants (`app.ts:61-72`). Production origins come only from `CORS_ALLOWED_ORIGINS`; if unset, production CORS is disabled with a warning (`app.ts:75-79`). Preflight returns:

```http
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
```

Actual responses include `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials: true` only when the request origin is in `allowedOrigins` (`app.ts:120-125`).

### Compression/SSE risk

`compress()` is applied to all `/api/*` routes before CORS and route mounts (`app.ts:94`). There is no source-level exclusion for `text/event-stream`. Runtime behavior through Hono compression and deployment proxy is **Not verifiable locally**. If compression buffers SSE, Story 68 SSE UX is blocked until the middleware/proxy path is verified or exempted.

### Nginx/proxy

No Nginx config was found in the repository by file glob inspection (`**/*nginx*`, `**/nginx.conf`, `**/*.conf`). Therefore the following are **Not verifiable locally**:

- Whether `/api/operations/*/progress` disables proxy buffering (`proxy_buffering off; proxy_cache off;`).
- Whether SSE responses include or preserve `Connection: keep-alive`.
- Whether proxy read timeouts exceed the SSE keepalive interval.
- Whether `/ws` upgrade headers are configured for WebSocket.
- Whether static SPA origin is included in `CORS_ALLOWED_ORIGINS` in staging/production.

Required runtime evidence before dependent SSE UI is considered deployment-safe:

1. Staging `curl -N -H 'Accept: text/event-stream'` capture against `/api/operations/{id}/progress` with auth.
2. Browser Network/EventStream evidence that authenticated SSE receives initial, keepalive, update, and terminal frames.
3. Staging response headers showing `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true`, `Content-Type: text/event-stream`, and no buffering symptoms.
4. Proxy config snippet for SSE and WebSocket locations.

### WebSocket `/ws` warning

Backend WebSocket exists at `/ws` (`websocket/server.ts:44-47`) and the server logs it at startup (`server.ts:135-138`). Backoffice connects to same-origin `/ws?token=${token}` using `ReconnectingWebSocket` (`backoffice/src/lib/websocket.ts:33-60`).

Critical source finding: WebSocket auth accepts token messages in `userId_companyId_token` format and falls back to accepting any token as user/company `1` (`websocket/server.ts:165-204`). This is not tied to `authenticateRequest`, bearer validation, or cookie auth. Stories 68-1/68-2/68-3 MUST NOT use `/ws` for sensitive operation progress until WebSocket auth is corrected or explicitly ruled out of scope.

## 9. API Gaps and Severity

| Severity | Gap | Evidence | Impact | Required follow-up |
|---|---|---|---|---|
| P0 | `/ws` authentication fallback accepts any token and assigns `userId=1`, `companyId=1`. | `websocket/server.ts:165-204` | Auth bypass / tenant data leakage risk if `/ws` is used for operations UI. Blocks using `/ws` for Epic 68 operation state. | Do not use `/ws` in 68-1/68-2/68-3. Create security fix story before any sensitive WS use. |
| P1 | Backend has no `/api/operations/:id` detail endpoint, no steps/results/retryable/cancellable shape. | `progress.ts` exposes only `GET /` and `GET /:operationId/progress`. | Blocks Story 68 UI assumptions for operation detail and timeline. | Update 68-1/68-2/68-3 ACs to use list + progress only, or add backend story for detail endpoint. |
| P1 | Backend has no HTTP retry/cancel endpoints and no `queued` state. | `progress-store.ts:34-36`, `progress-store.ts:341-356`; no route in `progress.ts`. | Blocks generic retry/cancel UI and state-machine ACs. | Remove retry/cancel ACs from frontend stories or schedule backend implementation. |
| P1 | Native `EventSource` cannot send bearer `Authorization`; backend SSE auth evidence is bearer-oriented. | `progress.ts:170-180`; `api-client.ts:90-99`; EventSource client absent. | SSE with native EventSource MAY fail unless cookie auth is accepted by `authenticateRequest`. | Verify cookie auth on staging or use fetch-stream SSE with bearer header. |
| P1 | Nginx/proxy buffering and WebSocket upgrade config absent from repo. | No Nginx/deployment config found. | Runtime SSE/WS behavior is deployment-unknown. | Obtain ops config + staging captures before marking dependent SSE stories deployment-ready. |
| P1 | Compression applies to all `/api/*` with no SSE exclusion in source. | `app.ts:94`; SSE headers in `progress.ts:304-309`. | SSE MAY be buffered/compressed. | Runtime verify; if broken, add server/proxy SSE compression exemption in separate backend story. |
| P1 | Import apply route exists at runtime but is missing from OpenAPI registration/generated schema. | Runtime `import.ts:995-1135`; OpenAPI registers upload/validate/template only `import.ts:1231-1489`; schema has no apply operation near `schema.d.ts:14869-14991`. | Typed API generation will not cover import apply; frontend may rely on untyped raw path. | Add OpenAPI route registration in backend contract cleanup story. |
| P1 | OpenAPI generated schema has `/api/operations*` paths while backoffice API client base already includes `/api`. | `schema.d.ts:8019-8050`; `api-base-url.ts:8-19`; aggregator path `/api/operations` in `progress.ts:450-511`. | Generated clients may call `/api/api/operations` if paths are used literally. | Normalize OpenAPI progress paths or generated-client path handling before 68 operations client implementation. |
| P2 | Operation list supports `limit/offset`, not `page`; no `dateFrom/dateTo`. | `progress.ts:231-263`. | Frontend filters/pagination ACs must change. | Update dependent story ACs. |
| P2 | Operation status/type enums differ from expected: no `queued`, `validating`, `partially_failed`; type is `batch_update`, not `bulk-update`. | `progress-store.ts:29-37`. | UI badges/state machine must match backend reality. | Update dependent story ACs and shared UI constants. |
| P2 | Import/export endpoints do not create operation progress rows; source search found no route usage of `startProgress` except tests. | `progress-store.ts:146-162`; no `startProgress` usage in routes; tests only use it. | Operations list will not naturally show current import/export jobs unless other code creates rows. | Treat operations as legacy/progress infra only; schedule backend integration if required. |
| P3 | `sync/check-duplicate` returns non-envelope success body. | `sync/check-duplicate.ts:93-101`. | Client error handling differs from standard envelopes. | Document as endpoint-specific exception. |

## 10. Dependent Story Impact

### Story 68-1 — AsyncJobDrawer

Required AC changes:

- MUST use actual progress fields: `operationId`, `total`, `completed`, `percentage`, `status`, `etaSeconds`, `startedAt`, `updatedAt`, `completedAt`, optional `details`.
- MUST support only backend statuses currently exposed by source: `running`, `completed`, `failed`, `cancelled`.
- MUST NOT require `queued`, `validating`, `partially_failed`, `createdBy`, `downloadUrl`, `steps`, `retryable`, or `cancellable` until backend support exists.
- MUST use `GET /api/operations/:operationId/progress` for polling and optional SSE.
- MUST gate native `EventSource` on staging proof that cookie auth works, or MUST use a bearer-capable fetch stream implementation.
- MUST NOT use `/ws` for sensitive operation progress while the P0 `/ws` auth fallback remains unresolved.

### Story 68-2 — Operations Center

Required AC changes:

- MUST use actual list fields: `operationId`, `type`, `total`, `completed`, `percentage`, `status`, `etaSeconds`, `startedAt`, `updatedAt`, `completedAt`.
- MUST use `limit`/`offset`, not `page`.
- MUST NOT require `createdBy`, `createdAt`, `downloadUrl`, detail route fields, or step/result shapes until backend support exists.
- MUST not expose generic backend retry/cancel controls because HTTP endpoints are absent.
- MUST treat operations data as persisted progress rows only; inspected import/export/sync routes do not currently create rows.

### Story 68-3 — Notification System

Required AC changes:

- MUST NOT use `/ws` for sensitive notifications while the P0 `/ws` auth fallback remains unresolved.
- MUST treat operations polling as the safe local fallback for job completion notifications.
- MUST gate SSE notification sources on staging proof that authenticated SSE works through CORS/proxy and does not buffer.
- MUST deduplicate notification events by stable identifiers because SSE reconnect semantics are source-unspecified.

### Story 68-5 — Layered Dashboards

Required AC changes:

- MUST use `/api/operations?status=failed&limit=5&offset=0` style queries, not page-based operations queries.
- MUST not assume operations include `createdBy`; My Work recent jobs require an alternate source or must be deferred if created-by filtering is absent.
- MUST not rely on `/ws` for dashboard live updates while the P0 `/ws` auth fallback remains unresolved.
- MUST treat SSE header capture and buffering evidence as a deployment gate before claiming live dashboard readiness.

## 11. Acceptance Criteria Checklist

| AC | Status | Evidence / limitation |
|---|---|---|
| AC1: Async job vs synchronous streaming classification | Complete by source inspection | Endpoint classification table in section 3. Export/import/sync are synchronous; operations/progress is persisted progress infrastructure but inspected route initiators do not return `{ operationId }`. |
| AC2: SSE transport verification | Partially complete; runtime **Not verifiable locally** | Source supports SSE via Accept header, data frames, keepalive, terminal close. Staging EventSource credentials, CORS, Nginx buffering, and reconnect behavior require external evidence. |
| AC3: Polling fallback verification | Complete by source inspection | JSON polling uses same progress endpoint without SSE Accept header. Stop conditions documented from terminal statuses. Cadence is UI policy because backend does not specify one. |
| AC4: Operation detail/list shape documentation | Complete with gaps | Actual list/progress shapes documented. Expected detail/step/result shapes are not supported. |
| AC5: Retry/cancel support documentation | Complete with gaps | Retry/cancel HTTP endpoints not present; internal cancel state exists only in store. |
| AC6: Auth/CORS/proxy behavior documentation | Complete by source inspection; runtime **Not verifiable locally** | Auth/CORS source documented. Nginx/proxy/staging behavior requires external evidence. WebSocket auth P0 documented. |
| AC7: Output artifact | Complete pending story-owner review | This document is stored at `_bmad-output/implementation-artifacts/stories/epic-68/story-68-0-contract.md`. Ahmad approval remains pending. |

## 12. Review Recommendation

Story 68-0 can go to review as a documentation/source-verification spike artifact. Dependent runtime SSE work MUST remain blocked until staging/Nginx evidence is attached or the dependent story ACs explicitly accept source-only verification with a deployment gate.

No code, tests, sprint-status, or story spec files were modified as part of this artifact.
