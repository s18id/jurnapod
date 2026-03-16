# Code Quality Checklist

## TypeScript Compliance

- [ ] All files compile without errors
- [ ] No `any` types used (except for specific database interfaces)
- [ ] Proper type exports and imports
- [ ] Zod schema validation for all data types

## Database Safety

- [ ] Proper connection pooling and cleanup
- [ ] Transaction safety for multi-step operations
- [ ] SQL injection prevention via parameterized queries
- [ ] Proper error handling for database failures

## Authentication & Security

- [ ] Proper auth guard implementation
- [ ] Role-based access control enforced
- [ ] Company-scoped data access
- [ ] No data leakage between companies/tenants

## Error Handling

- [ ] Comprehensive error classification
- [ ] Client-friendly error messages
- [ ] Audit logging for failures
- [ ] Graceful degradation for partial failures

## Performance

- [ ] Database query optimization
- [ ] Proper indexing for sync queries
- [ ] Connection pooling efficiency
- [ ] Memory usage monitoring
