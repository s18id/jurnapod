# Testing Guide

## Use Library Functions

Prefer using library functions over direct SQL in tests:

### Available Functions

| Entity | Function | Location |
|--------|----------|----------|
| Item | `createItem()` | lib/items |
| Item Price | `createItemPrice()` | lib/item-prices |
| Company | `createCompanyBasic()` | lib/companies |
| User | `createUserBasic()` | lib/users |
| Import Session | `createImportSession()` | lib/import/session-store |

### Example

```typescript
// ✅ DO: Use library function
import { createItem } from "./items.js";
const item = await createItem({ companyId: 1, name: "Test Item" });

// ❌ DON'T: Direct SQL
await pool.execute(`INSERT INTO items (company_id, name) VALUES (?, ?)`, [1, "Test Item"]);
```

### When Direct SQL Is Allowed

1. Read-only verification queries (SELECT)
2. Cleanup in finally blocks
3. Complex edge cases not covered by library

For detailed documentation, see [Library Usage Guide](./library-usage-guide.md).