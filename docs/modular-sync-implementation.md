# Modular Sync Implementation Guide

## Overview

The Jurnapod modular sync architecture has been successfully implemented, providing tier-based sync differentiation between POS and backoffice systems. This document covers the complete implementation and how to use it.

## Architecture Summary

### **Tier-Based Sync Strategy**

| Tier | Frequency | Data Types | POS Usage | Backoffice Usage |
|------|-----------|------------|-----------|------------------|
| **REALTIME** | WebSocket/SSE (when connected) | Active orders, table status | Live updates | Dashboard updates |
| **OPERATIONAL** | 30s-2min | Tables, reservations | Frequent polling | Moderate polling |
| **MASTER** | 5-10min | Items, prices, tax rates | Periodic refresh | Periodic refresh |
| **ADMIN** | 30min-daily | User permissions, settings | Startup only | Administrative tasks |
| **ANALYTICS** | Hourly-daily | Reports, audit logs | Not used | Batch processing |

> **Note**: REALTIME tier requires network connectivity. For offline operation, POS falls back to OPERATIONAL/MASTER tier polling.

### **Modular Structure**

```
packages/
├── sync-core/           # Shared sync infrastructure
├── pos-sync/            # POS-specific sync module
└── backoffice-sync/     # Pre-positioned (Phase 3 implementation)

apps/api/app/api/sync/
├── pull/                # Legacy endpoint (maintained)
├── push/                # Legacy endpoint (maintained)
├── pos/                 # New modular POS endpoints
│   ├── realtime/
│   ├── operational/
│   ├── master/
│   └── admin/
└── health/              # Sync module health check
```

> **Note**: `backoffice_sync_queue` table is pre-positioned for Phase 3. `pos_sync_metadata` and `backoffice_sync_queue` follow different patterns (metadata vs queue) intentionally—their data lifecycle and access patterns differ significantly.

## New API Endpoints

### **POS Modular Sync Endpoints**

All endpoints require authentication with outlet-level permissions.

**Rate Limits:**
- REALTIME: 120 requests/minute
- OPERATIONAL: 60 requests/minute
- MASTER: 30 requests/minute
- ADMIN: 10 requests/minute

> **Security Note**: All endpoints use parameterized queries for `outlet_id` and `since_version` to prevent injection.

#### `GET /api/sync/pos/realtime?outlet_id={id}`
- **Purpose**: Real-time data for active operations
- **Frequency**: As needed (< 1 second updates)
- **Auth**: OWNER, ADMIN, ACCOUNTANT, CASHIER
- **Response**:
```json
{
  "success": true,
  "timestamp": "2026-03-16T10:30:00.000Z",
  "data_version": 1234,
  "has_more": false,
  "tier": "REALTIME",
  "data": {
    "active_orders": [
      {
        "order_id": "uuid",
        "table_id": 5,
        "order_status": "OPEN",
        "paid_amount": 0,
        "total_amount": 45.50,
        "guest_count": 2,
        "updated_at": "2026-03-16T10:25:00.000Z"
      }
    ],
    "table_status_updates": [
      {
        "table_id": 5,
        "status": "OCCUPIED",
        "current_order_id": "uuid",
        "updated_at": "2026-03-16T10:25:00.000Z"
      }
    ]
  }
}
```

#### `GET /api/sync/pos/operational?outlet_id={id}&since_version={version}`
- **Purpose**: Operational data (tables, reservations)
- **Frequency**: Every 30 seconds
- **Auth**: OWNER, ADMIN, ACCOUNTANT, CASHIER
- **Rate Limit**: 60 requests/minute
- **Parameters**:
  - `outlet_id` (required): Outlet identifier
  - `since_version` (optional): For incremental sync
  - `limit` (optional, default 1000): Max records per response
  - `cursor` (optional): For paginated continuation
- **Response**: Tables and reservations data with pagination metadata

#### `GET /api/sync/pos/master?outlet_id={id}&since_version={version}`
- **Purpose**: Master data (items, prices, tax rates)
- **Frequency**: Every 5 minutes
- **Auth**: OWNER, ADMIN, ACCOUNTANT, CASHIER
- **Rate Limit**: 30 requests/minute
- **Parameters**:
  - `outlet_id` (required): Outlet identifier
  - `since_version` (optional): For incremental sync
  - `limit` (optional, default 5000): Max items per response
  - `cursor` (optional): For paginated continuation
- **Response**: Complete catalog and configuration data with pagination metadata

#### `GET /api/sync/pos/admin?outlet_id={id}`
- **Purpose**: Administrative data (outlet config, permissions)
- **Frequency**: On app start / daily
- **Auth**: OWNER, ADMIN, ACCOUNTANT (more restrictive)
- **Response**: Outlet configuration and user permissions

#### `GET /api/sync/health`
- **Purpose**: Health check for sync modules
- **Auth**: Requires valid JWT token (public access removed for security)
- **Rate Limit**: 60 requests/minute per IP
- **Response**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-03-16T10:30:00.000Z"
  }
}
```

> **Security Note**: Internal module details removed from public response to prevent reconnaissance.

## Database Schema

### New Tables

#### `sync_tier_versions`
```sql
CREATE TABLE sync_tier_versions (
    company_id BIGINT UNSIGNED NOT NULL,
    tier ENUM('REALTIME', 'OPERATIONAL', 'MASTER', 'ADMIN', 'ANALYTICS') NOT NULL,
    current_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    last_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (company_id, tier)
);
```

> **Schema Note**: Uses BIGINT UNSIGNED (max ~18 quintillion) to prevent overflow under high-frequency REALTIME tier updates. INT would exhaust in months at high-volume outlets.

#### `pos_sync_metadata`
```sql
CREATE TABLE pos_sync_metadata (
    company_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NOT NULL,
    tier ENUM('REALTIME', 'OPERATIONAL', 'MASTER', 'ADMIN') NOT NULL,
    last_sync_at DATETIME NULL,
    last_version INT UNSIGNED NULL,
    sync_status ENUM('OK', 'ERROR', 'STALE') NOT NULL DEFAULT 'OK',
    error_message TEXT NULL,
    PRIMARY KEY (company_id, outlet_id, tier)
);
```

#### `backoffice_sync_queue`
```sql
CREATE TABLE backoffice_sync_queue (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id BIGINT UNSIGNED NOT NULL,
    document_type ENUM('INVOICE', 'PAYMENT', 'JOURNAL', 'REPORT', 'RECONCILIATION') NOT NULL,
    tier ENUM('OPERATIONAL', 'MASTER', 'ADMIN', 'ANALYTICS') NOT NULL,
    sync_status ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
    retry_count INT UNSIGNED NOT NULL DEFAULT 0,
    next_retry_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_company_status (company_id, sync_status),
    INDEX idx_tier_status (tier, sync_status),
    INDEX idx_next_retry (next_retry_at)
);
```

> **Schema Note**: Added indexes on `(company_id, sync_status)` and `(tier, sync_status)` for efficient polling. Added `retry_count` and `next_retry_at` for exponential backoff.

#### `sync_operations`
```sql
CREATE TABLE sync_operations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NULL,
    sync_module ENUM('POS', 'BACKOFFICE') NOT NULL,
    tier ENUM('REALTIME', 'OPERATIONAL', 'MASTER', 'ADMIN', 'ANALYTICS') NOT NULL,
    operation_type ENUM('PUSH', 'PULL', 'RECONCILE', 'BATCH') NOT NULL,
    request_id VARCHAR(36) NOT NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    status ENUM('RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'RUNNING',
    PRIMARY KEY (id)
);
```

### Updated Triggers

The `BumpSyncTiers` stored procedure now updates multiple tiers atomically:

```sql
-- Example: Tax rate changes affect both MASTER and OPERATIONAL tiers
CALL BumpSyncTiers(company_id, 'MASTER,OPERATIONAL');
```

## Implementation Details

### **Core Components**

#### 1. Sync Core (`@jurnapod/sync-core`)
- **Module Registry**: Central registration and management
- **Authentication**: JWT validation with token lifecycle management
- **Token Strategy**:
  - Access token expiry: 15 minutes
  - Refresh token expiry: 7 days
  - Refresh endpoint: `/api/auth/refresh`
  - Revocation: Token blacklist for compromised tokens
- **Audit Logging**: Comprehensive sync operation tracking
- **Version Management**: Multi-tier version tracking
- **Transport Layer**: HTTP client with retry logic

#### 2. POS Sync Module (`@jurnapod/pos-sync`)
- **Data Service**: Tier-specific database queries
- **Endpoint Handlers**: Validated request/response handling
- **Type Safety**: Complete TypeScript coverage
- **Error Handling**: Comprehensive error classification

#### 3. API Integration
- **Auto-discovery**: Routes automatically registered
- **Shared Auth**: Leverages existing auth guard patterns
- **Database Safety**: Proper connection management
- **Graceful Shutdown**: Module cleanup on server stop

### **Data Flow**

```
POS Client -> API Route -> Auth Guard -> Sync Module -> Data Service -> Database
                                    ↓
                               Audit Logger
                                    ↓
                             Version Manager
```

### **Backward Compatibility**

- Legacy endpoints (`/api/sync/pull`, `/api/sync/push`) remain functional
- Existing POS clients continue to work without changes
- `sync_data_versions` table continues to be updated
- Gradual migration supported with feature flags

## Idempotency & Conflict Resolution

### **Idempotency**

All push operations from POS must include a client-generated idempotency key:

```json
{
  "client_tx_id": "uuid-v4-string",
  "outlet_id": 1,
  "data": { ... }
}
```

> **Critical**: `client_tx_id` is required for all write operations. The system rejects duplicates within 24 hours, preventing duplicate records from network retries.

### **Clock Skew Handling**

> **TODO**: Implement NTP synchronization requirement for POS clients.

- All timestamps in API responses are UTC
- POS clients should synchronize device clock within ±5 minutes of NTP
- `since_version` preferred over timestamp-based sync for offline resilience

### **Conflict Resolution**

> **TODO**: Offline-first conflict resolution strategy to be defined in Phase 3.

**Current Implementation**:
- POS operations use `client_tx_id` for idempotency
- Server-side deduplication prevents duplicate inserts
- Last-write-wins for simple field updates

**Required for Production**:
- Field-level conflict detection
- Client-side merge UI for complex conflicts
- Audit trail for all conflict resolutions

## Usage Examples

### **Client-Side Integration**

```typescript
// POS client requesting master data
const response = await fetch('/api/sync/pos/master?outlet_id=1&since_version=1234', {
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  }
});

const masterData = await response.json();
if (masterData.success) {
  // Update local cache with masterData.data
  console.log(`Received ${masterData.data.items.length} items`);
}
```

### **Module Extension**

```typescript
// Creating a custom sync module
import { SyncModule } from "@jurnapod/sync-core";

export class CustomSyncModule implements SyncModule {
  readonly moduleId = "custom";
  readonly clientType = "BACKOFFICE";
  
  async handleSync(request: SyncRequest): Promise<SyncResponse> {
    // Custom sync logic
  }
  
  getSupportedTiers() {
    return ['OPERATIONAL', 'ANALYTICS'];
  }
}

// Register the module
syncModuleRegistry.register(new CustomSyncModule(config));
```

## Performance Benefits

> **Note**: The following metrics are targets pending measurement. Actual performance will vary by outlet size, network conditions, and hardware.

### **Target Improvements**

- **Target: 50% reduction** in POS sync time through tier-based data filtering
- **Target: 40% reduction** in bandwidth usage via selective data transmission
- **Target: < 1 second** real-time updates for critical operations
- **Target: 99.9% reliability** maintained for offline POS operations

### **Measurement Plan**

Performance will be validated via:
1. Load testing with synthetic POS traffic
2. A/B testing against legacy endpoints
3. Real-world telemetry from pilot outlets

### **Scalability**

- **Tier-based processing** reduces server load
- **Module isolation** prevents cross-contamination
- **Configurable frequencies** adapt to usage patterns
- **Health monitoring** enables proactive maintenance

## Monitoring & Observability

### **Audit Logging**
Every sync operation is comprehensively logged:
- Request/response correlation IDs
- Duration and performance metrics
- Error classification and retry attempts
- Data version tracking

### **Health Checks**
- Module-level health status
- Database connectivity validation
- Performance degradation detection
- Automatic alerting capabilities

### **Metrics Collection**
- Sync operation counts by tier
- Success/failure rates
- Average response times
- Bandwidth usage patterns

### **Data Retention Policy**
| Table | Retention | Archival |
|-------|-----------|----------|
| `sync_operations` | 30 days | Compressed to cold storage |
| Audit logs | 90 days | Compressed to cold storage |
| `backoffice_sync_queue` | 7 days after completion | Auto-purged |

> **Operational Note**: Implement TTL (Time-To-Live) or scheduled purge jobs for production deployment.

## Development & Testing

### **Running Locally**

```bash
# Build sync packages
npm run build -w @jurnapod/sync-core -w @jurnapod/pos-sync

# Start API server (sync modules initialize automatically)
npm run dev -w @jurnapod/api

# Test health endpoint
curl http://localhost:3001/api/sync/health

# Test POS sync endpoints
curl -H "Authorization: Bearer $JWT" \
     "http://localhost:3001/api/sync/pos/master?outlet_id=1"
```

### **Testing Strategy**

#### Unit Tests
- Sync module interfaces and implementations
- Tier-based data filtering logic
- Database query correctness
- Error handling scenarios

#### Integration Tests
- End-to-end sync flows
- Authentication and authorization
- Database transaction safety
- Performance under load

#### Migration Tests
- Schema migration rollback safety
- Data integrity preservation
- Backward compatibility validation

## Future Roadmap

### **Phase 3: Backoffice Module** (Next)
- Document-centric sync implementation
- Batch processing for analytics data
- Advanced reconciliation features

### **Phase 4: Real-time Features** (Q2 2026)
- WebSocket implementation for REALTIME tier
- Server-sent events for dashboard updates
- Connection management and auto-reconnection

### **Phase 5: Advanced Features** (Q3 2026)
- Machine learning-based adaptive frequencies
- Predictive caching for performance
- Cross-outlet collaboration features
- Advanced conflict resolution

## Support & Maintenance

### **Error Handling**
- All errors are classified and logged
- Client-friendly error messages
- Automatic retry for transient failures
- Graceful degradation for partial failures

### **Rollback Strategy**
- Feature flags allow instant rollback
- Database changes are additive only
- Comprehensive monitoring for early detection
- Documented rollback procedures

### **Documentation**
- Complete API documentation
- TypeScript types for all interfaces
- Code examples for common scenarios
- Troubleshooting guides

The modular sync architecture provides a foundation for tier-based differentiation between POS and backoffice while maintaining backward compatibility. 

> **Known Gaps** (addressed in future phases):
> - Offline-first conflict resolution strategy
> - WebSocket/SSE for REALTIME tier
> - Backoffice sync module implementation

**Pre-deployment Checklist**:
- [ ] Rate limiting configured at API gateway
- [ ] Data retention jobs scheduled
- [ ] Performance baseline measurements collected
- [ ] Conflict resolution strategy defined
- [ ] Token revocation implemented