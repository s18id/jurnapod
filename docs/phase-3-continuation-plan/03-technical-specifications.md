# Technical Specifications

## **API Endpoint Structure**
```
/api/sync/backoffice/
├── realtime/          # Live dashboard data
├── operational/       # Recent business activity  
├── master/           # Comprehensive catalog
├── admin/            # System administration
├── analytics/        # Reports and BI
└── batch/            # Job queue management
    ├── queue/        # Queue new job
    ├── status/{id}   # Job status
    └── jobs/         # List jobs
```

## **Data Flow Architecture**
```
Backoffice Client → API Routes → Auth Guard → Backoffice Module → Data Service → Database
                                                      ↓
                                               Batch Processor → Job Queue
                                                      ↓  
                                               Analytics Engine → Aggregated Data
```

## **Authentication Requirements**
- **Backoffice Access**: OWNER, ADMIN, ACCOUNTANT roles only
- **Analytics Access**: OWNER, ADMIN roles only  
- **Company Scoped**: Access to all outlets within company
- **No Outlet Restrictions**: Unlike POS which requires outlet-specific permissions

## **Performance Targets**
- **REALTIME**: < 500ms response time
- **OPERATIONAL**: < 1s response time
- **MASTER**: < 3s response time for full data
- **ADMIN**: < 2s response time
- **ANALYTICS**: < 10s for standard reports, batch for complex analytics
