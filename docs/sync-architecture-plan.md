# Jurnapod Modular Sync Architecture Plan

## Executive Summary

This document outlines the plan to refactor Jurnapod's sync system from a monolithic approach to a modular architecture that differentiates between POS and backoffice sync requirements. The goal is to optimize sync performance, reduce bandwidth usage, and provide better separation of concerns while maintaining the robust offline-first guarantees for POS operations.

## Current State Analysis

### Existing Sync Architecture

- **POS Sync**: Offline-first with outbox pattern, 5-minute master data pulls, 30-second push cycles
- **Backoffice Sync**: Separate implementation focused on financial documents
- **Shared Infrastructure**: Common database schemas, authentication, audit logging
- **Pain Points**: Frequency issues, unnecessary data transfer, lack of real-time updates

### Current Endpoints
```
/api/sync/push    # POS transactions to backoffice
/api/sync/pull    # Master data to POS
```

### Current Data Flow
```
POS → IndexedDB → Outbox → API → MySQL → Accounting/GL
Backoffice ← API ← MySQL (separate sync service)
```

## Target Architecture

### Design Principles

1. **Modular Separation**: Clear boundaries between POS and backoffice sync logic
2. **Shared Core**: Common infrastructure for authentication, audit, versioning
3. **Pluggable Modules**: Registry-based system for easy extension
4. **Data Tier Strategy**: Different sync frequencies for different data types
5. **Backward Compatibility**: Gradual migration without breaking existing systems

### Modular Structure

```
packages/
├── sync-core/           # Shared sync infrastructure
│   ├── registry/        # Module registry and plugin system
│   ├── auth/           # Authentication and authorization
│   ├── audit/          # Audit logging and tracking
│   ├── versioning/     # Data version management
│   └── transport/      # HTTP transport and retry logic
├── pos-sync/           # POS-specific sync module
│   ├── core/           # POS sync orchestration
│   ├── offline/        # Offline-first patterns
│   ├── posting/        # Real-time journal posting
│   └── storage/        # IndexedDB management
├── backoffice-sync/    # Backoffice-specific sync module
│   ├── documents/      # Document-centric sync
│   ├── batch/          # Batch processing
│   ├── reconcile/      # Financial reconciliation
│   └── analytics/      # Reporting data sync
└── shared/             # Common contracts (existing)
```

## Data Tier Strategy

### Tier 1: Real-time Critical (WebSocket/SSE)
- **Data**: Active orders, table status, payment processing
- **POS Frequency**: Immediate (< 1 second)
- **Backoffice Frequency**: Real-time dashboard updates
- **Implementation**: WebSocket connections with room-based broadcasting

### Tier 2: Operational (High-frequency polling)
- **Data**: Reservations, item availability, price changes
- **POS Frequency**: Every 30 seconds
- **Backoffice Frequency**: Every 2 minutes
- **Implementation**: Dedicated polling endpoints per tier

### Tier 3: Master Data (Medium-frequency polling)
- **Data**: Items, item groups, tax rates, payment methods
- **POS Frequency**: Every 5 minutes (current)
- **Backoffice Frequency**: Every 10 minutes
- **Implementation**: Version-based incremental sync

### Tier 4: Administrative (Low-frequency polling)
- **Data**: User permissions, outlet settings, reports
- **POS Frequency**: On app start + daily
- **Backoffice Frequency**: Every 30 minutes
- **Implementation**: Configuration-driven sync

### Tier 5: Analytical (Batch processing)
- **Data**: Historical reports, audit logs, reconciliation
- **POS Frequency**: Never (not needed)
- **Backoffice Frequency**: Hourly/daily batches
- **Implementation**: Scheduled background jobs

## API Design

### Modular Endpoint Structure

```
/api/sync/pos/
├── realtime/           # WebSocket endpoint for Tier 1
├── operational/        # Tier 2 data (30s polling)
├── master/            # Tier 3 data (5min polling)
├── admin/             # Tier 4 data (startup/daily)
└── push/              # Transaction upload (existing)

/api/sync/backoffice/
├── realtime/          # WebSocket endpoint for dashboards
├── operational/       # Tier 2 data (2min polling)
├── master/           # Tier 3 data (10min polling)
├── admin/            # Tier 4 data (30min polling)
├── analytics/        # Tier 5 data (batch)
└── documents/        # Document sync (invoices, payments)
```

### Data Subset Differentiation

#### POS Data Subsets (Minimalist)
```typescript
interface POSItem {
  id: number;
  name: string;
  price: number;
  tax_rate_id: number;
  active: boolean;
  // Excludes: descriptions, images, detailed accounting codes
}

interface POSSyncResponse {
  data_version: number;
  items: POSItem[];                    # Minimal fields
  tax_rates: TaxRate[];               # Essential only
  tables: TableStatus[];              # Operational data
  reservations: Reservation[];        # Real-time updates
}
```

#### Backoffice Data Subsets (Comprehensive)
```typescript
interface BackofficeItem {
  id: number;
  name: string;
  description: string;
  price: number;
  cost: number;
  tax_rate_id: number;
  accounting_code: string;
  supplier_id: number;
  images: string[];
  active: boolean;
  created_at: string;
  modified_by: number;
  // Full audit trail and metadata
}

interface BackofficeSyncResponse {
  data_version: number;
  items: BackofficeItem[];            # Full item details
  financial_reports: Report[];        # Analytics data
  audit_logs: AuditLog[];            # Compliance data
  reconciliation: ReconciliationData[]; # Accounting verification
}
```

## Database Schema Changes

### Shared Tables (No Changes)
```sql
-- Core sync infrastructure
sync_data_versions       # Version tracking
audit_logs              # Sync audit trail
pos_transactions        # Transaction records
journal_batches         # Accounting integration
```

### New Module-Specific Tables
```sql
-- POS sync metadata
CREATE TABLE pos_sync_metadata (
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  tier ENUM('REALTIME', 'OPERATIONAL', 'MASTER', 'ADMIN') NOT NULL,
  last_sync_at DATETIME NULL,
  last_version INT UNSIGNED NULL,
  sync_status ENUM('OK', 'ERROR', 'STALE') NOT NULL DEFAULT 'OK',
  PRIMARY KEY (company_id, outlet_id, tier)
);

-- Backoffice sync queue
CREATE TABLE backoffice_sync_queue (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  document_type ENUM('INVOICE', 'PAYMENT', 'JOURNAL', 'REPORT') NOT NULL,
  document_id BIGINT UNSIGNED NOT NULL,
  tier ENUM('OPERATIONAL', 'MASTER', 'ADMIN', 'ANALYTICS') NOT NULL,
  sync_status ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
  scheduled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  retry_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  PRIMARY KEY (id),
  INDEX idx_company_tier_status (company_id, tier, sync_status)
);

-- Multi-tier version tracking
CREATE TABLE sync_tier_versions (
  company_id BIGINT UNSIGNED NOT NULL,
  tier ENUM('REALTIME', 'OPERATIONAL', 'MASTER', 'ADMIN', 'ANALYTICS') NOT NULL,
  current_version INT UNSIGNED NOT NULL DEFAULT 0,
  last_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, tier)
);
```

## Implementation Plan

### Phase 1: Core Infrastructure (2-3 weeks)

#### Week 1: Extract Shared Core
- [ ] Create `packages/sync-core` with module registry
- [ ] Extract common authentication and audit logic
- [ ] Create base interfaces for sync modules
- [ ] Implement plugin registration system
- [ ] Add tier-based configuration management

#### Week 2: Database Schema Updates
- [ ] Create migration for new sync metadata tables
- [ ] Add tier-based version tracking
- [ ] Update existing triggers for multi-tier versioning
- [ ] Create indexes for performance optimization

#### Week 3: API Infrastructure
- [ ] Create modular routing system
- [ ] Implement tier-based endpoint registration
- [ ] Add WebSocket infrastructure for real-time tiers
- [ ] Create sync health monitoring endpoints

### Phase 2: POS Module Implementation (1-2 weeks)

#### Week 4: POS Sync Module
- [ ] Create `packages/pos-sync` package
- [ ] Extract existing POS sync logic into module
- [ ] Implement tier-based polling for POS client
- [ ] Add selective data storage (only POS-relevant data)
- [ ] Create POS-specific sync endpoints

#### Week 5: POS Integration
- [ ] Update POS app to use new sync module
- [ ] Implement different polling intervals per tier
- [ ] Add real-time WebSocket connection for Tier 1
- [ ] Test offline-first guarantees with new architecture

### Phase 3: Backoffice Module Implementation (1-2 weeks)

#### Week 6: Backoffice Sync Module
- [ ] Create `packages/backoffice-sync` package
- [ ] Implement document-centric sync patterns
- [ ] Add batch processing for analytics data
- [ ] Create reconciliation sync logic
- [ ] Implement backoffice-specific endpoints

#### Week 7: Backoffice Integration
- [ ] Update backoffice app to use new sync module
- [ ] Implement tier-based sync scheduling
- [ ] Add comprehensive audit logging
- [ ] Create admin dashboard for sync monitoring

### Phase 4: Real-time Features (2 weeks)

#### Week 8: WebSocket Implementation
- [ ] Set up WebSocket server with room management
- [ ] Implement outlet/company-based broadcasting
- [ ] Add connection management and auto-reconnection
- [ ] Create real-time event publishing system

#### Week 9: Real-time Integration
- [ ] Add WebSocket publishing to critical data changes
- [ ] Implement client-side real-time event handling
- [ ] Add rate limiting and event batching
- [ ] Test real-time updates across POS and backoffice

### Phase 5: Optimization & Monitoring (1 week)

#### Week 10: Performance & Analytics
- [ ] Add sync performance metrics collection
- [ ] Implement adaptive frequency based on data patterns
- [ ] Create sync analytics dashboard
- [ ] Add alerting for sync failures or performance issues
- [ ] Optimize database queries for tier-based operations

## Migration Strategy

### Backward Compatibility Approach

1. **Dual-endpoint Support** (Months 1-2)
   - Maintain existing `/api/sync/push` and `/api/sync/pull`
   - Add new modular endpoints alongside
   - Feature flags to control which clients use which endpoints

2. **Gradual Client Migration** (Month 2)
   - Internal testing outlets use new modular sync
   - Subset of production outlets for validation
   - Monitor performance and error rates

3. **Full Migration** (Month 3)
   - All clients migrated to modular sync
   - Legacy endpoints marked as deprecated
   - Comprehensive monitoring and alerting

4. **Cleanup** (Month 4)
   - Remove legacy sync endpoints
   - Archive old sync-related code
   - Final performance optimization

### Rollback Strategy

- Feature flags allow instant rollback to legacy sync
- Database schema changes are additive (no data loss)
- Monitoring alerts trigger automatic rollback if error rates spike
- Manual rollback procedures documented for each phase

## Testing Strategy

### Unit Testing
- [ ] Sync module interfaces and implementations
- [ ] Tier-based data filtering logic
- [ ] WebSocket connection management
- [ ] Database schema migrations

### Integration Testing
- [ ] End-to-end sync flows for each tier
- [ ] POS offline scenarios with new architecture
- [ ] Backoffice document sync workflows
- [ ] Real-time event propagation

### Performance Testing
- [ ] Sync throughput under load
- [ ] WebSocket connection limits
- [ ] Database performance with tier-based queries
- [ ] Memory usage optimization

### User Acceptance Testing
- [ ] POS workflow validation with modular sync
- [ ] Backoffice admin workflows
- [ ] Real-time update responsiveness
- [ ] Offline/online transition scenarios

## Success Metrics

### Performance Improvements
- **POS Sync Speed**: 50% reduction in sync time through tier-based data
- **Bandwidth Usage**: 40% reduction through selective data transmission
- **Real-time Updates**: < 1 second for critical operational data
- **Offline Resilience**: 99.9% transaction reliability maintained

### Operational Benefits
- **Code Maintainability**: Modular architecture enables independent development
- **Extensibility**: New sync modules can be added without core changes
- **Monitoring**: Per-module and per-tier observability
- **Scalability**: Tier-based processing reduces server load

### Business Impact
- **POS Performance**: Faster operations through optimized sync
- **Data Accuracy**: Real-time updates improve operational decisions
- **Development Velocity**: Modular architecture accelerates feature development
- **System Reliability**: Better error isolation and recovery

## Risk Mitigation

### Technical Risks
- **Data Consistency**: Comprehensive testing of tier-based versioning
- **Performance Regression**: Gradual rollout with performance monitoring
- **WebSocket Stability**: Connection pooling and auto-reconnection logic
- **Migration Complexity**: Phased approach with rollback capabilities

### Operational Risks
- **User Training**: Gradual migration minimizes user impact
- **Support Load**: Comprehensive documentation and monitoring
- **Business Continuity**: Backward compatibility during transition
- **Data Loss**: Additive schema changes and extensive testing

## Future Enhancements

### Phase 6: Advanced Features (Future)
- Machine learning-based adaptive sync frequencies
- Predictive caching for frequently accessed data
- Cross-outlet real-time collaboration features
- Advanced conflict resolution algorithms

### Phase 7: Third-party Integrations (Future)
- Payment processor sync modules
- Accounting software integrations
- Inventory management system sync
- Customer loyalty program sync

## Conclusion

The modular sync architecture will transform Jurnapod's sync system from a monolithic approach to a flexible, scalable, and maintainable solution. By separating concerns while maintaining shared infrastructure, we achieve better performance, clearer code organization, and easier future enhancements.

The phased implementation approach ensures minimal risk and maximum backward compatibility, while the comprehensive testing strategy validates both technical correctness and business value.

This architecture positions Jurnapod for future growth and enables rapid development of new sync-dependent features across both POS and backoffice applications.