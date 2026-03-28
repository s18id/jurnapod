# Story 11.5: Replace INSERT INTO items with createItem()

## Epic
Epic 11: Refactor Remaining Test Files

## Status
done

## Completion Notes

### Work Performed

Replaced 34 direct `INSERT INTO items` statements across 8 test files with `createItem()` library function:

| File | Replacements |
|------|--------------|
| `lib/inventory/variant-stock.test.ts` | 11 |
| `lib/pricing/variant-price-resolver.test.ts` | 9 |
| `lib/master-data.thumbnail-sync.test.ts` | 6 |
| `lib/service-sessions.test.ts` | 2 |
| `services/stock.test.ts` | 2 |
| `routes/stock.test.ts` | 1 |
| `lib/item-images.test.ts` | 1 |
| `routes/sync/push-variant.test.ts` | 1 |
| **Total** | **34** |

### Pattern Transformation

```typescript
// Before:
const [itemResult] = await conn.execute<ResultSetHeader>(
  `INSERT INTO items (company_id, name, item_type) VALUES (?, ?, 'PRODUCT')`,
  [companyId, `Test Item ${runId}`]
);
itemId = Number(itemResult.insertId);

// After:
const item = await createItem(companyId, {
  name: `Test Item ${runId}`,
  type: 'PRODUCT'
});
itemId = item.id;
```

### Unsupported Fields

- `low_stock_threshold` - Set via separate `UPDATE items SET low_stock_threshold = ? WHERE id = ?` after item creation
- `created_at` / `updated_at` - Handled internally by `createItem()`

### Verification

- Type check: ✅ Passed
- Tests: ✅ 1524/1524 passing
- No remaining `INSERT INTO items` in test files

## Files Modified

- `apps/api/src/lib/inventory/variant-stock.test.ts`
- `apps/api/src/lib/pricing/variant-price-resolver.test.ts`
- `apps/api/src/lib/master-data.thumbnail-sync.test.ts`
- `apps/api/src/lib/service-sessions.test.ts`
- `apps/api/src/services/stock.test.ts`
- `apps/api/src/routes/stock.test.ts`
- `apps/api/src/lib/item-images.test.ts`
- `apps/api/src/routes/sync/push-variant.test.ts`
